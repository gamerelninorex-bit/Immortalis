import {
  CANON_WRITE_AUTHORITY,
  PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY,
  PcCapabilityBasisSchema,
  PcCapabilityCarryForwardInputSchema,
  PcCapabilitySchema,
  PublicationSchema,
  fail,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  type CommitGroup,
  type OwnerFact,
  type PcCapability,
  type PcCapabilityBasis,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import { deriveCarryForwardBasis, pcBasisPrerequisites } from "./derive.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";

export type PcCapabilityErrorCode = StoreCommitErrorCode | "INPUT_INVALID";

/** Mechanical prerequisite reads of a basis group: each fact's current version, and the group that committed it. */
type Pins = {
  readonly reads: CommitGroup["reads"];
  readonly depends_on: readonly string[];
};

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/**
 * IM-07 PC capability profile — the receiving path of the one I-002 PC owner.
 *
 * A caller supplies the already-established capability content and identities. It never supplies an owner, a facet, an
 * authority or a governing rule: those come from the specification-backed registry, and the publication is made by the
 * archivist path through the existing IM-11/IM-12/IM-17 store (one journal, one canon). There is exactly ONE receiving
 * publication: the basis of one already-established capability of one PC, pinned to that PC's released Existence
 * Contract and the accepted claims that establish it (`receiveCapabilityBasis`), plus ONE distinct inherited path for an
 * actor already handed over (`carryForwardActorCapability`, which carries the actor's committed capability exactly and
 * resolves nothing). The persisted capability is NOT a method here: it is the
 * `pcCapabilityCloseProvider` operation the IM-02 coordinator resolves as the PC Capability Close, inside the engaged
 * object of the dependent consequence that materially requires it. There is no capability writer, no setter, no
 * development/loss/amendment, no deferred derivation, no handover or transfer (the handover is the Role Registry's) and no
 * randomized path, so no caller can
 * write PC capability state out of order; the store's admission refuses them for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the group
 * is rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a changed input
 * is refused as a conflict rather than silently reusing it. Nothing is recomputed.
 */
export class PcCapabilityAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Receives and commits the sealed basis of one already-established PC capability. The PC's Existence Contract is read
   * at its current version and depended on (pinned, never copied). The basis is create-only: one slot per PC/capability.
   * It is NOT the capability and is not visible to any cross-owner consumer: the capability exists only at its close.
   */
  async receiveCapabilityBasis(
    input: Publication & { readonly capability: unknown },
  ): Promise<Result<CommitOutcome, PcCapabilityErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const basis = PcCapabilityBasisSchema.safeParse(input.capability);
    if (!basis.success)
      return fail("INPUT_INVALID", "PC capability basis failed validation", {
        issues: issues(basis.error),
      });
    const b = basis.data;
    if (b.establishment.method !== PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY) {
      return fail(
        "INPUT_INVALID",
        "only an ACCEPTED_GENERATION_HISTORY basis is presented here: an existing actor's capability enters only through carryForwardActorCapability, which carries it mechanically",
      );
    }
    const key = pcCapabilityBasisKey(b.pc_id, b.capability_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    const pins =
      prior && prior.writes.some((w) => w.key === key)
        ? // reconcile by identity: rebuild on the committed basis
          { reads: prior.reads, depends_on: prior.depends_on }
        : this.#currentPins(b);
    return this.#publish(p.data, key, b, pins.reads, pins.depends_on);
  }

  /**
   * Carries one already-authoritative pre-handover Named-Actor capability into this PC owner's received basis (the existing-actor
   * → PC carry-forward; PC-Control Handover Contract v1 "Single Commit Point": after the Role Registry binding commit the
   * displaced actor record is cold provenance/history and the receiving owner is writable). The caller names only the identity
   * and the capability: the basis is built MECHANICALLY from committed state — the committed EXISTING_ACTOR_HANDOVER binding and
   * the actor's committed `named_actor_capability` are cited by exact version and read/depended on, and the source's marker is
   * transcribed unchanged (null included). Nothing is resolved: no reroll, world prior, Causal Draw, Mirror derivation,
   * regrading or recalibration. A missing handover, a missing or merely-basis source, or a different identity fails closed (here,
   * and again in admission for a raw commit). The source stays exactly where it was committed, as cold provenance.
   *
   * Re-presenting an intent that already committed reconciles by identity (RC-16), like the other receiving publication.
   */
  async carryForwardActorCapability(
    input: Publication & { readonly carry: unknown },
  ): Promise<Result<CommitOutcome, PcCapabilityErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const carry = PcCapabilityCarryForwardInputSchema.safeParse(input.carry);
    if (!carry.success)
      return fail("INPUT_INVALID", "carry-forward input failed validation", {
        issues: issues(carry.error),
      });
    const { pc_id, capability_id } = carry.data;
    const derived = deriveCarryForwardBasis(pc_id, capability_id, {
      get: (k) => this.#store.getFact(k),
    });
    if (!derived.ok) return fail(derived.error.code, derived.error.message);
    const basis = derived.value;
    const key = pcCapabilityBasisKey(pc_id, capability_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    const pins =
      prior && prior.writes.some((w) => w.key === key)
        ? { reads: prior.reads, depends_on: prior.depends_on }
        : this.#currentPins(basis);
    return this.#publish(p.data, key, basis, pins.reads, pins.depends_on);
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  /** The received basis, or undefined. Owner-side provenance: not a cross-owner read. */
  basis(
    pcId: string,
    capabilityId: string,
  ): { fact: OwnerFact; value: PcCapabilityBasis } | undefined {
    const fact = this.#store.getFact(pcCapabilityBasisKey(pcId, capabilityId));
    return fact ? { fact, value: PcCapabilityBasisSchema.parse(fact.value) } : undefined;
  }

  /**
   * The persisted PC capability as it stands at the PC Capability Close, with the group that committed the close;
   * undefined until the close has committed. A capability that is not committed is never visible.
   */
  capability(
    pcId: string,
    capabilityId: string,
  ): { fact: OwnerFact; value: PcCapability; close_group: string } | undefined {
    const fact = this.#store.getFact(pcCapabilityKey(pcId, capabilityId));
    return fact
      ? {
          fact,
          value: PcCapabilitySchema.parse(fact.value),
          close_group: fact.provenance.group_id,
        }
      : undefined;
  }

  /** Each prerequisite read at its current version (0 when absent, which admission refuses) and the group that committed it. */
  #currentPins(basis: PcCapabilityBasis): Pins {
    const pinned = pcBasisPrerequisites(basis).map((n) => ({
      key: n.key,
      fact: this.#store.getFact(n.key),
    }));
    return {
      reads: pinned.map((x) => ({ key: x.key, version: x.fact?.version ?? 0 })),
      depends_on: [...new Set(pinned.flatMap((x) => (x.fact ? [x.fact.provenance.group_id] : [])))],
    };
  }

  async #publish(
    p: Publication,
    key: string,
    value: unknown,
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, PcCapabilityErrorCode>> {
    const kind = factKind("pc_capability_basis");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...depends_on],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.basis,
          secrecy: p.secrecy,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }
}

const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});
