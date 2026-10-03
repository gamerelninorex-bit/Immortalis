import {
  CANON_WRITE_AUTHORITY,
  OWNER_PC_EXISTENCE,
  PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY,
  PcCapabilityBasisSchema,
  PcCapabilityCarryForwardInputSchema,
  PcCapabilitySchema,
  PcExistingActorEstablishmentInputSchema,
  PcExistingActorRandomizedEstablishmentInputSchema,
  PublicationSchema,
  causalDrawId,
  fail,
  parseCapabilityCandidateId,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  type Authority,
  type CausalDrawInputRef,
  type CommitGroup,
  type OwnerFact,
  type PcCapability,
  type PcCapabilityBasis,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { CausalDrawAdapter, type CausalDrawErrorCode } from "../causal-draw/adapter.ts";
import type { EntropySource } from "../causal-draw/ports.ts";
import { factKind } from "../owners/registry.ts";
import {
  deriveCarryForwardBasis,
  deriveWorldPriorBasis,
  pcBasisPrerequisites,
  pcCapabilityBoundaryViolation,
  pcCauseViolation,
  pcHandoverPin,
  pcHandoverViolation,
} from "./derive.ts";
import {
  pcCapabilityDrawDigest,
  pcCapabilityDrawSpecification,
  pcRuleAuthority,
  pcSlotInspector,
} from "./randomized.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";

export type PcCapabilityErrorCode = StoreCommitErrorCode | CausalDrawErrorCode | "INPUT_INVALID";

export interface PcCapabilityAdapterOptions {
  /**
   * CDE-01 entropy source for the PC owner's Causal Draws (F-027-CD1): defaults to the operating-system CSPRNG. The PC owner
   * never generates, holds or interprets entropy itself; this only selects the trusted runtime's source.
   */
  readonly entropy?: EntropySource;
}

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
 * Contract and the accepted claims that establish it (`receiveCapabilityBasis`), plus the distinct inherited paths for an
 * actor already handed over: `carryForwardActorCapability` (carries the actor's already-authoritative capability exactly and
 * resolves nothing) and the existing-actor world-prior establishment of a capability that was still unresolved at handover —
 * `establishExistingActorCapabilityBasis` where the smallest established causes suffice (nothing is drawn) and
 * `establishExistingActorRandomizedCapabilityBasis` where genuine uncertainty remains (the neutral Causal Draw fixes the
 * marker within the owner's bounded prior, the draw committed first). The persisted capability is NOT a method here: it is
 * the `pcCapabilityCloseProvider` operation the IM-02 coordinator resolves as the PC Capability Close, inside the engaged
 * object of the dependent consequence that materially requires it. There is no capability writer, no setter, no
 * development/loss/amendment, no accepted-Mirror derivation for an existing actor, no handover or transfer (the handover is
 * the Role Registry's) and no RNG of the PC owner's own, so no caller can write PC capability state out of order; the
 * store's admission refuses them for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the group
 * is rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a changed input
 * is refused as a conflict rather than silently reusing it. Nothing is recomputed.
 */
export class PcCapabilityAdapter {
  readonly #store: CampaignStore;
  readonly #causalDraw: CausalDrawAdapter;

  constructor(store: CampaignStore, options: PcCapabilityAdapterOptions = {}) {
    this.#store = store;
    this.#causalDraw = new CausalDrawAdapter(store, {
      slotInspectors: new Map([[OWNER_PC_EXISTENCE, pcSlotInspector(store)]]),
      ruleAuthority: pcRuleAuthority,
      ...(options.entropy ? { entropy: options.entropy } : {}),
    });
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
        "only an ACCEPTED_GENERATION_HISTORY basis is presented here: an existing actor's capability enters only through carryForwardActorCapability (an already-authoritative one, carried mechanically) or the existing-actor world-prior establishment operations (one still unresolved at handover)",
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

  /**
   * The existing-actor world-prior establishment where the smallest established causes SUFFICE (PC-Control Handover Contract
   * v1 "Existing Actor → PC" 2; I-002 v2.1 W3-CP3 overlay; WS-016 §16 steps 1–2): a capability that was still UNRESOLVED when
   * the actor was handed over, and is now materially required, is fixed by those causes alone. Nothing is drawn: no Causal Draw
   * evidence is created. The caller names the identity, the capability, the pinned causes and its authored marker; the
   * handover reference and every version are mechanical, read from committed state. It refuses a capability the predecessor
   * Named-Actor owner already fixed (an authoritative one is carried forward exactly, never re-resolved here) and any slot
   * that already has Causal Draw evidence (only the establishment that reads the draw may fill it); admission re-judges all.
   *
   * Re-presenting an intent that already committed reconciles by identity (RC-16), like the other receiving publications.
   */
  async establishExistingActorCapabilityBasis(
    input: Publication & { readonly capability: unknown },
  ): Promise<Result<CommitOutcome, PcCapabilityErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const parsed = PcExistingActorEstablishmentInputSchema.safeParse(input.capability);
    if (!parsed.success)
      return fail("INPUT_INVALID", "existing-actor establishment failed validation", {
        issues: issues(parsed.error),
      });
    const e = parsed.data;
    const key = pcCapabilityBasisKey(e.pc_id, e.capability_id);
    const built = deriveWorldPriorBasis(
      e.pc_id,
      e.capability_id,
      { marker: e.marker, causes: e.causes },
      { get: (k) => this.#store.getFact(k) },
    );
    if (!built.ok) return fail(built.error.code, built.error.message);
    const basis = PcCapabilityBasisSchema.safeParse(built.value);
    if (!basis.success)
      return fail("INPUT_INVALID", "PC capability basis failed validation", {
        issues: issues(basis.error),
      });
    const prior = this.#store.committedGroup(p.data.intent_id);
    const reconciling = prior !== null && prior.writes.some((w) => w.key === key);
    if (!reconciling && !this.#store.getFact(key)) {
      const refused = this.#admissionPreview(e);
      if (refused) return refused;
    }
    const pins = reconciling
      ? { reads: prior.reads, depends_on: prior.depends_on }
      : this.#currentPins(basis.data);
    return this.#publish(p.data, key, basis.data, pins.reads, pins.depends_on);
  }

  /**
   * The existing-actor world-prior establishment where genuine uncertainty remains after the smallest established causes
   * (WS-016 §16 steps 3–4; F-027-CD1 CD-CC-01). The caller states that uncertainty remains (the causes are pinned here, and
   * are the exact inputs of the prior) and authors the branch-invariant bounded prior: the lawful possibilities and their
   * relative causal weights. This operation then
   *
   *   1. refuses what the establishment could never be admitted for, BEFORE any draw state exists — the handover, the
   *      predecessor Named-Actor state, the boundary and the causes — because a draw is irreversible and an inadmissible
   *      request must not consume the slot's one opportunity;
   *   2. has the Causal Draw fix the slot's one stable draw, rooted in the PC capability-basis slot (`resolution` is the
   *      resolver context CDE-01 requires);
   *   3. reads the owner's meaning off the selected opaque candidate;
   *   4. commits its OWN basis, reading the exact committed result fact/version and depending on its canonical result group.
   *
   * Every step is idempotent by identity: a retry after any committed Causal Draw state, or after the establishment, converges
   * on the same draw and the same basis (the marker is whatever that draw selected, never a re-roll), and a changed prior or
   * cause set is refused as a conflict. There is no default prior, grade or weight, and the existing PC Capability Close — not
   * this operation — publishes the capability.
   */
  async establishExistingActorRandomizedCapabilityBasis(
    input: Publication & { readonly capability: unknown; readonly resolution: unknown },
  ): Promise<Result<CommitOutcome, PcCapabilityErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const parsed = PcExistingActorRandomizedEstablishmentInputSchema.safeParse(input.capability);
    if (!parsed.success)
      return fail("INPUT_INVALID", "randomized existing-actor establishment failed validation", {
        issues: issues(parsed.error),
      });
    const e = parsed.data;
    const key = pcCapabilityBasisKey(e.pc_id, e.capability_id);
    const drawId = causalDrawId(pcCapabilityDrawDigest(e.pc_id, e.capability_id));
    const committed = this.#causalDraw.precommit(drawId);
    const prior = this.#store.committedGroup(p.data.intent_id);
    const reconciling = prior !== null && prior.writes.some((w) => w.key === key);

    // 1. nothing is drawn for a request the establishment could never be admitted for
    if (!committed && !this.#causalDraw.result(drawId) && !this.#store.getFact(key)) {
      const refused = this.#admissionPreview(e);
      if (refused) return refused;
    }
    const refs: CausalDrawInputRef[] = [];
    for (const cause of e.causes) {
      // a version already pinned by the committed prior keeps the committer that prior recorded (a superseded version's
      // committing group cannot be re-read by identity); otherwise it is the current fact's
      const known = committed?.normalized_spec.input_refs.find(
        (r) =>
          r.owner === cause.owner && r.fact_key === cause.fact_key && r.version === cause.version,
      );
      const committedBy =
        known?.committed_by ?? this.#store.getFact(cause.fact_key)?.provenance.group_id;
      if (!committedBy) {
        return fail("PREREQUISITE_MISSING", "a causal input is not committed", {
          key: cause.fact_key,
        });
      }
      refs.push({
        owner: cause.owner,
        fact_key: cause.fact_key,
        version: cause.version,
        committed_by: committedBy,
      });
    }

    // 2. the neutral Causal Draw fixes the slot
    const drawn = await this.#causalDraw.draw({
      specification: pcCapabilityDrawSpecification(e, refs),
      resolution: input.resolution as Authority,
    });
    if (!drawn.ok) return drawn;
    const draw = drawn.value;

    // 3. the owner's reading of the selected opaque candidate
    const selected = parseCapabilityCandidateId(draw.selected_candidate_id);
    if (!selected) {
      return fail(
        "INPUT_INVALID",
        "the selected candidate is not a possibility of the Character Capability owner",
      );
    }

    // 4. the owner's own establishment, by reference to the committed draw result
    const built = deriveWorldPriorBasis(
      e.pc_id,
      e.capability_id,
      {
        marker: selected.marker,
        causes: e.causes,
        draw: {
          draw_id: draw.draw_id,
          result: { fact_key: draw.result.key, version: draw.result.version },
        },
      },
      { get: (k) => this.#store.getFact(k) },
    );
    if (!built.ok) return fail(built.error.code, built.error.message);
    const basis = PcCapabilityBasisSchema.safeParse(built.value);
    if (!basis.success)
      return fail("INPUT_INVALID", "PC capability basis failed validation", {
        issues: issues(basis.error),
      });
    const pins = reconciling
      ? { reads: prior.reads, depends_on: prior.depends_on }
      : this.#currentPins(basis.data);
    return this.#publish(p.data, key, basis.data, pins.reads, pins.depends_on);
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

  /**
   * What admission would refuse for this request regardless of the draw, judged from the same shared rules, so that no Causal
   * Draw is created for an establishment that could never be committed: the handover, the one-owner boundary (which includes
   * the predecessor Named-Actor state, basis or draw, for this capability) and each cause. Admission remains the authority
   * and re-judges everything.
   */
  #admissionPreview(e: {
    readonly pc_id: string;
    readonly capability_id: string;
    readonly causes: readonly { owner: string; fact_key: string; version: number }[];
  }): Result<never, PcCapabilityErrorCode> | null {
    const facts = {
      get: (k: string) => this.#store.getFact(k),
      has: (k: string) => this.#store.getFact(k) !== undefined,
    };
    // the handover is read mechanically: its pin is the committed binding's own version (an absent one is refused)
    const pin = pcHandoverPin(facts);
    if (!pin.ok) return fail(pin.error.code, pin.error.message);
    const handover = pcHandoverViolation(e.pc_id, pin.value, facts);
    if (handover) return fail("REFERENCE_INVALID", handover);
    const boundary = pcCapabilityBoundaryViolation(facts, e.pc_id, e.capability_id);
    if (boundary) return fail("KEY_NOT_ADMITTED", boundary);
    for (const cause of e.causes) {
      const foreign = pcCauseViolation(cause);
      if (foreign) return fail("REFERENCE_INVALID", foreign, { key: cause.fact_key });
      const fact = facts.get(cause.fact_key);
      if (!fact) {
        return fail("PREREQUISITE_MISSING", "a causal input is not committed", {
          key: cause.fact_key,
        });
      }
      if (fact.owner !== cause.owner || fact.version !== cause.version) {
        return fail(
          "REFERENCE_INVALID",
          "a cause is its source owner's own committed fact, pinned at its current version and never copied",
          { key: cause.fact_key },
        );
      }
    }
    return null;
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
