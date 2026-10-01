import {
  CANON_WRITE_AUTHORITY,
  NamedActorCapabilityBasisSchema,
  NamedActorCapabilitySchema,
  PublicationSchema,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  fail,
  type CommitGroup,
  type NamedActorCapability,
  type NamedActorCapabilityBasis,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";

export type NamedActorErrorCode =
  | StoreCommitErrorCode
  | "INPUT_INVALID"
  /** Implementation Escalation: WS-016 §16 steps 3–4 need a lawful uncertainty mechanism this engine does not have */
  | "ESTABLISHMENT_UNCERTAINTY_UNSUPPORTED";

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/** The one uncertainty branch of WS-016 §16 (steps 3–4): named only so its refusal is precise, never implemented. */
const UNCERTAIN_METHOD = "BOUNDED_PRIOR_RANDOMIZED";

/**
 * IM-07 Named-Actor capability — the authored path of the Named-Actor owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a governing
 * rule: those come from the specification-backed registry, and the publication is made by the archivist path through
 * the existing IM-11/IM-12/IM-17 store (one journal, one canon). There is exactly ONE authored publication: the
 * establishment basis of one capability of one Named Actor, causally determined from committed foreign facts it pins.
 * The persisted capability is NOT a method here: it is the `namedActorCapabilityCloseProvider` operation the IM-02
 * coordinator resolves as the owner's declared capability close, inside the engaged object of the dependent
 * consequence that materially requires it. There is no capability writer, no setter, no development/loss/amendment,
 * no lifecycle transfer and no way to write a PC's capability, so no caller can write Named-Actor state out of order;
 * the store's admission refuses them for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the group
 * is rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a changed
 * input is refused as a conflict rather than silently reusing it. Nothing is re-rolled: no randomness exists here.
 */
export class NamedActorAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Commits the sealed establishment basis of one Named-Actor capability. Every cause is a committed foreign fact,
   * pinned at its current version (never copied). The basis is create-only: one slot per actor/capability. It is NOT
   * the capability and is not visible to any cross-owner consumer: the capability exists only at its close.
   */
  async establishCapabilityBasis(
    input: Publication & { readonly capability: unknown },
  ): Promise<Result<CommitOutcome, NamedActorErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const method = (input.capability as { establishment?: { method?: unknown } } | null)
      ?.establishment?.method;
    if (method === UNCERTAIN_METHOD) {
      return fail(
        "ESTABLISHMENT_UNCERTAINTY_UNSUPPORTED",
        "genuine-uncertainty establishment needs the simulation's lawful uncertainty mechanism, which does not exist; Character Capability owns no RNG: Implementation Escalation, nothing was established",
      );
    }
    const basis = NamedActorCapabilityBasisSchema.safeParse(input.capability);
    if (!basis.success)
      return fail("INPUT_INVALID", "capability basis failed validation", {
        issues: issues(basis.error),
      });
    const b = basis.data;
    const key = actorCapabilityBasisKey(b.actor_id, b.capability_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    if (prior && prior.writes.some((w) => w.key === key)) {
      // reconcile by identity: rebuild on the committed basis
      reads = prior.reads;
      depends_on = prior.depends_on;
    } else {
      const pinned = [...new Set(b.establishment.causes.map((c) => c.fact_key))];
      reads = pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 }));
      depends_on = [
        ...new Set(pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ];
    }
    return this.#publish(p.data, "named_actor_capability_basis", key, b, reads, depends_on);
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  /** The sealed establishment basis, or undefined. Owner-side provenance: not a cross-owner read. */
  basis(
    actorId: string,
    capabilityId: string,
  ): { fact: OwnerFact; value: NamedActorCapabilityBasis } | undefined {
    const fact = this.#store.getFact(actorCapabilityBasisKey(actorId, capabilityId));
    return fact ? { fact, value: NamedActorCapabilityBasisSchema.parse(fact.value) } : undefined;
  }

  /**
   * The persisted capability as it stands at the actor owner's declared capability close, with the group that
   * committed the close; undefined until the close has committed. A capability that is not committed is never visible.
   */
  capability(
    actorId: string,
    capabilityId: string,
  ): { fact: OwnerFact; value: NamedActorCapability; close_group: string } | undefined {
    const fact = this.#store.getFact(actorCapabilityKey(actorId, capabilityId));
    return fact
      ? {
          fact,
          value: NamedActorCapabilitySchema.parse(fact.value),
          close_group: fact.provenance.group_id,
        }
      : undefined;
  }

  async #publish(
    p: Publication,
    kindId: "named_actor_capability_basis",
    key: string,
    value: unknown,
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, NamedActorErrorCode>> {
    const kind = factKind(kindId);
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
