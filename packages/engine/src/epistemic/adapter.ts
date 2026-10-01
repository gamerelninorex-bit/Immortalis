import {
  ACCESS_CLASS_ENGINE_SEALED,
  AccessEventSchema,
  AccessiblePacketSchema,
  CANON_WRITE_AUTHORITY,
  MODE_BROADCAST_EXPOSURE,
  PublicationSchema,
  SealedEngineProvenanceSchema,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  fail,
  type AccessEvent,
  type AccessiblePacket,
  type CommitGroup,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
  type SealedEngineProvenance,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";

export type EpistemicAccessErrorCode =
  | StoreCommitErrorCode
  | "INPUT_INVALID"
  /** BROADCAST_EXPOSURE is out of scope: it fails closed and is never approximated by recipient copying */
  | "BROADCAST_EXPOSURE_UNSUPPORTED";

/**
 * What a caller supplies for the one authored publication: identities and a basis label. The secrecy class is never the
 * caller's: the event is engine-side, so the owner stamps the engine-sealed class itself.
 */
export type EpistemicPublication = Omit<Publication, "secrecy">;

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

/**
 * IM-10 Epistemic Access — the authored path of the Epistemic owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority, a secrecy class
 * or a governing rule: those come from the specification-backed registry, and the publication is made by the archivist
 * path through the existing IM-11/IM-12/IM-17 store (one journal, one canon). There is exactly ONE authored publication:
 * one BOUNDED_SHARED_ACCESS event for one named non-PC recipient, resting on a committed foreign source/carrier fact it
 * pins. The Accessible Content Packet and the Sealed Engine Provenance are NOT methods here: they are the
 * `epistemicPacketProvider` operation the IM-02 coordinator resolves inside the engaged object of the dependent
 * consequence that materially requires them. There is no packet writer, no setter, no broadcast, no retrieval, no
 * reclassification and no way to write a capability or any actor-side consequence, so no caller can write Epistemic state
 * out of order; the store's admission refuses them for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the group
 * is rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a changed input
 * is refused as a conflict rather than silently reusing it. Nothing is re-rolled or improved: no randomness exists here.
 */
export class EpistemicAccessAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Commits one BOUNDED_SHARED_ACCESS event. The source/carrier is a committed foreign fact, pinned at its current version
   * (never copied). The event is create-only: its mode, participant reference and payload are immutable. It is NOT the
   * packet and is not visible to any actor-side consumer: the packet exists only after its formation stage.
   */
  async establishBoundedSharedAccess(
    input: EpistemicPublication & { readonly event: unknown },
  ): Promise<Result<CommitOutcome, EpistemicAccessErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const mode = (input.event as { mode?: unknown } | null)?.mode;
    if (mode === MODE_BROADCAST_EXPOSURE) {
      return fail(
        "BROADCAST_EXPOSURE_UNSUPPORTED",
        "BROADCAST_EXPOSURE is out of scope for this construction and is never approximated by recipient copying or another path; nothing was established",
      );
    }
    const event = AccessEventSchema.safeParse(input.event);
    if (!event.success)
      return fail("INPUT_INVALID", "access event failed validation", {
        issues: issues(event.error),
      });
    const e = event.data;
    const key = accessEventKey(e.event_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    if (prior && prior.writes.some((w) => w.key === key)) {
      // reconcile by identity: rebuild on the committed basis
      reads = prior.reads;
      depends_on = prior.depends_on;
    } else {
      const sourceFact = this.#store.getFact(e.source.fact_key);
      reads = [{ key: e.source.fact_key, version: sourceFact?.version ?? 0 }];
      depends_on = sourceFact ? [sourceFact.provenance.group_id] : [];
    }
    return this.#publish(p.data, key, e, reads, depends_on);
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  /** The engine-side access event, or undefined. Owner-side evidence: not a cross-owner or actor-side read. */
  event(eventId: string): { fact: OwnerFact; value: AccessEvent } | undefined {
    const fact = this.#store.getFact(accessEventKey(eventId));
    return fact ? { fact, value: AccessEventSchema.parse(fact.value) } : undefined;
  }

  /**
   * The sealed, actor-safe Accessible Content Packet of one recipient, with the group that committed it; undefined until
   * its formation has committed. A packet that is not committed is never visible.
   */
  packet(
    eventId: string,
    recipientId: string,
  ): { fact: OwnerFact; value: AccessiblePacket; formation_group: string } | undefined {
    const fact = this.#store.getFact(accessPacketKey(eventId, recipientId));
    return fact
      ? {
          fact,
          value: AccessiblePacketSchema.parse(fact.value),
          formation_group: fact.provenance.group_id,
        }
      : undefined;
  }

  /**
   * The engine-only Sealed Engine Provenance of one formed packet, or undefined. For lawful ENGINE-SIDE consumers (audit,
   * Temporal, KTI, GM/world resolution) only; it is never an actor-side input (F-014D §2.1 role-context rule).
   */
  engineSealedProvenance(
    eventId: string,
    recipientId: string,
  ): { fact: OwnerFact; value: SealedEngineProvenance } | undefined {
    const fact = this.#store.getFact(accessProvenanceKey(eventId, recipientId));
    return fact ? { fact, value: SealedEngineProvenanceSchema.parse(fact.value) } : undefined;
  }

  async #publish(
    p: Publication,
    key: string,
    value: unknown,
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, EpistemicAccessErrorCode>> {
    const kind = factKind("epistemic_access_event");
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
          secrecy: ACCESS_CLASS_ENGINE_SEALED,
          expected_version: 0,
        },
      ],
    };
    return this.#store.commit(group);
  }
}

const pick = (i: EpistemicPublication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: ACCESS_CLASS_ENGINE_SEALED,
});
