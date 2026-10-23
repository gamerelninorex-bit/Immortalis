import {
  ACCESS_CLASS_ENGINE_SEALED,
  AccessDisseminationEventSchema,
  AccessEventSchema,
  AccessiblePacketSchema,
  BroadcastExposureEventSchema,
  CANON_WRITE_AUTHORITY,
  MODE_BROADCAST_EXPOSURE,
  OBSERVATION_EVENT_BASIS,
  PublicationSchema,
  SealedEngineProvenanceSchema,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  fail,
  observationEventCause,
  observationEventGroupId,
  observationEventIntentId,
  type AccessDisseminationEvent,
  type AccessEvent,
  type AccessiblePacket,
  type BroadcastExposureEvent,
  type CommitGroup,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
  type SealedEngineProvenance,
} from "@immortalis/contracts";
import {
  EPISTEMIC_ACCESS_BROADCAST_RULE,
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
  factKind,
} from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import {
  deriveObservationEvent,
  observationEventDependencies,
  observationEventReads,
  observationRecordOf,
} from "./observation.ts";

export type EpistemicAccessErrorCode =
  | StoreCommitErrorCode
  | "INPUT_INVALID"
  /** a BROADCAST_EXPOSURE request through the recipient-set method fails closed: it is never approximated by recipient copying */
  | "BROADCAST_EXPOSURE_UNSUPPORTED"
  /** the cited decision is not a retained direct-perception decision whose engine-derived verdict is OBSERVATION_ESTABLISHED */
  | "OBSERVATION_NOT_ESTABLISHED"
  | "OBSERVATION_RECORD_INVALID";

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
 * path through the existing IM-11/IM-12/IM-17 store (one journal, one canon). There are exactly TWO authored publications,
 * the two immutable Access / Dissemination Event modes under the one canonical event key: one BOUNDED_SHARED_ACCESS event
 * for one named recipient, resting on a committed foreign source/carrier fact it pins; and one event-only BROADCAST_EXPOSURE
 * event, resting on that source/carrier and a committed authoritative audience REFERENCE it pins, which names no recipient and
 * is never receipt. The Accessible Content Packet and the Sealed Engine Provenance are NOT methods here: they are the
 * `epistemicPacketProvider` operation the IM-02 coordinator resolves inside the engaged object of the dependent
 * consequence that materially requires them. There is no packet writer, no setter, no broadcast lowering, no retrieval, no
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
        "a BROADCAST_EXPOSURE event is not a recipient set: it is established only through establishBroadcastExposure and is never approximated by recipient copying or another path; nothing was established",
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
    let rule: CommitGroup["rule"] | undefined;
    if (prior && prior.writes.some((w) => w.key === key)) {
      // reconcile by identity: rebuild on the committed basis, under the citation it was committed with (a save from before
      // the active-PC extension carries the superseded one)
      reads = prior.reads;
      depends_on = prior.depends_on;
      rule = prior.rule;
    } else {
      const sourceFact = this.#store.getFact(e.source.fact_key);
      reads = [{ key: e.source.fact_key, version: sourceFact?.version ?? 0 }];
      depends_on = sourceFact ? [sourceFact.provenance.group_id] : [];
    }
    return this.#publish(
      p.data,
      key,
      e,
      reads,
      depends_on,
      rule ?? factKind("epistemic_access_event").rule,
    );
  }

  /**
   * Commits the OBSERVATION-EARNED BOUNDED_SHARED_ACCESS event of a direct observation (BLUE v5.2). The caller names ONE retained
   * `F014D_DIRECT_PERCEPTION` referee decision and nothing else: the recipient (the bound active Player Character), the PERCEPTION channel,
   * the basis time, the foreign physical source pin (a committed world or locus fact, pinned at its cited version, never copied) and the
   * minimal payload are all DERIVED from that record, and the group reads and depends on the decision and every premise it cites, so the
   * receipt is bound to the qualified interpretation and to the authoritative material reads — never to a caller-supplied access. Only an
   * engine-derived OBSERVATION_ESTABLISHED reading earns an event; an obstructed, unresolved or conflicting one earns none. The identities
   * derive from the event, so a lost reply or a restart reaches the original receipt. The event is NOT the packet: the packet exists only
   * after its formation stage commits (see `formObservedPacket`).
   */
  async establishObservedAccess(input: {
    readonly decision_key: string;
  }): Promise<Result<CommitOutcome, EpistemicAccessErrorCode>> {
    const decision = this.#store.getFact(input.decision_key);
    const record = observationRecordOf(decision);
    if (!decision || !record)
      return fail(
        "INPUT_INVALID",
        "the cited decision is not a retained direct-perception decision",
      );
    const derived = deriveObservationEvent(record);
    if (!derived.ok)
      return fail(
        derived.error.code === "OBSERVATION_NOT_ESTABLISHED"
          ? "OBSERVATION_NOT_ESTABLISHED"
          : "OBSERVATION_RECORD_INVALID",
        derived.error.message,
      );
    const e = derived.value;
    // every field of the publication is derived from the event: the caller chooses none of it
    return this.#publish(
      {
        group_id: observationEventGroupId(e.event_id),
        intent_id: observationEventIntentId(e.event_id),
        cause: observationEventCause(e.event_id),
        basis: OBSERVATION_EVENT_BASIS,
        secrecy: ACCESS_CLASS_ENGINE_SEALED,
      },
      accessEventKey(e.event_id),
      e,
      observationEventReads(record, decision),
      observationEventDependencies(record, decision.provenance.group_id),
      EPISTEMIC_ACCESS_OBSERVATION_RULE,
    );
  }

  /**
   * Commits one BROADCAST_EXPOSURE event (F-014D §4.4): ONE immutable engine-side event for a public or very large
   * dissemination, retained instead of recipient copies. It rests on a committed foreign source/carrier fact AND a committed
   * authoritative audience reference (a World-State locus or a Population ledger/Cohort), each pinned at its current version
   * and never copied, and records the payload, the reach/channel conditions and the material exceptions exactly as authored.
   * It is event-only: it names no recipient and creates no packet, no sealed provenance of individual receipt, no
   * access-established evidence, no Temporal Knowledge Time, no actor inference and no Population/Culture/KTI effect. The mode
   * is the caller's request to establish THIS record, never a flag on a recipient event; nothing about an individual's
   * presence, attention or receipt is decided here.
   */
  async establishBroadcastExposure(
    input: EpistemicPublication & { readonly event: unknown },
  ): Promise<Result<CommitOutcome, EpistemicAccessErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success)
      return fail("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const event = BroadcastExposureEventSchema.safeParse(input.event);
    if (!event.success)
      return fail("INPUT_INVALID", "broadcast exposure event failed validation", {
        issues: issues(event.error),
      });
    const e = event.data;
    const key = accessEventKey(e.event_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    let rule: CommitGroup["rule"] = EPISTEMIC_ACCESS_BROADCAST_RULE;
    if (prior && prior.writes.some((w) => w.key === key)) {
      // reconcile by identity: rebuild on the committed basis, so identical input reaches the original receipt
      reads = prior.reads;
      depends_on = prior.depends_on;
      rule = prior.rule;
    } else {
      const sourceFact = this.#store.getFact(e.source.fact_key);
      const audienceFact = this.#store.getFact(e.audience.fact_key);
      reads = [
        { key: e.source.fact_key, version: sourceFact?.version ?? 0 },
        { key: e.audience.fact_key, version: audienceFact?.version ?? 0 },
      ];
      depends_on = [
        ...new Set([sourceFact, audienceFact].flatMap((f) => (f ? [f.provenance.group_id] : []))),
      ];
    }
    return this.#publish(p.data, key, e, reads, depends_on, rule);
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  /**
   * The engine-side BOUNDED_SHARED_ACCESS event, or undefined. Owner-side evidence: not a cross-owner or actor-side read. A
   * BROADCAST_EXPOSURE event is not a recipient event and is never returned here (see `broadcastExposure`).
   */
  event(eventId: string): { fact: OwnerFact; value: AccessEvent } | undefined {
    const read = this.disseminationEvent(eventId);
    return read && read.value.mode !== MODE_BROADCAST_EXPOSURE
      ? { fact: read.fact, value: read.value }
      : undefined;
  }

  /**
   * The engine-side BROADCAST_EXPOSURE event of the one canonical key, or undefined. A typed by-identity read for authorized
   * ENGINE-SIDE consumers only: it is never a packet, never an actor-side input and never evidence of individual receipt.
   */
  broadcastExposure(
    eventId: string,
  ): { fact: OwnerFact; value: BroadcastExposureEvent } | undefined {
    const read = this.disseminationEvent(eventId);
    return read && read.value.mode === MODE_BROADCAST_EXPOSURE
      ? { fact: read.fact, value: read.value }
      : undefined;
  }

  /** The engine-side Access / Dissemination Event under its one canonical key, in whichever immutable mode, or undefined. */
  disseminationEvent(
    eventId: string,
  ): { fact: OwnerFact; value: AccessDisseminationEvent } | undefined {
    const fact = this.#store.getFact(accessEventKey(eventId));
    return fact ? { fact, value: AccessDisseminationEventSchema.parse(fact.value) } : undefined;
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
    groupRule: CommitGroup["rule"],
  ): Promise<Result<CommitOutcome, EpistemicAccessErrorCode>> {
    const kind = factKind("epistemic_access_event");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: groupRule,
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
