// F-014B P-7 E1 - the test-local, READ-ONLY native journal witness for a DIRECT_OBSERVATION receipt (BLUE P7-E1 brief, Notion
// 42220af9-01e0-811b-8857-f7647cabc51d). MECHANISM ONLY and NON-WRITING.
//
// WHAT IT DOES. The E0 checker can show that a receipt is DERIVABLE from a committed observation-earned event. This witness shows the
// receipt was actually COMMITTED, by the original owner, at a named journal cut: it reads the real campaign's journal (committed groups,
// receipts, revisions) and re-verifies, with the OWNERS' OWN functions, that
//   - the event is the journal's own fact, earned by a retained direct-perception decision (`observationEventViolation`, VERIFICATION),
//     for the character the Role Registry binding names (`recipientBoundaryViolation`);
//   - the actor packet and the sealed engine provenance are committed, in ONE group, under the stage identity of the packet formation,
//     AFTER the event group and no later than the cut, and equal what the Epistemic owner's derivation determines (`deriveAccessProducts`);
//   - a sealed NOW-only Temporal transaction records that exact stage, group and receipt, with no object, boundary or elapsed time.
// It never accepts a caller-supplied boolean, a re-derivation alone, or a self-attested hash. It holds ONLY the store's read methods (the
// type below has no commit, no close), so it cannot write; a static test pins that. The diagnostic codes it returns are test diagnostics,
// never a canonical classification.
import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessEventSchema,
  AccessiblePacketSchema,
  OBSERVATION_TRIGGER_KIND,
  PLAYER_CHOICE_AUTHORITY,
  ResolutionTransactionSchema,
  SealedEngineProvenanceSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  compareTime,
  observationTransactionCause,
  observationTransactionId,
  temporalTransactionKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../../../packages/engine/src/hash.ts";
import {
  deriveAccessProducts,
  recipientBoundaryViolation,
} from "../../../packages/engine/src/epistemic/derive.ts";
import {
  observationEventId,
  observationEventViolation,
} from "../../../packages/engine/src/epistemic/observation.ts";
import type { CampaignStore } from "../../../packages/engine/src/persistence/store.ts";
import { stageGroupId } from "../../../packages/engine/src/temporal/identity.ts";
import type {
  EvidenceLedger,
  NativeObservationVerdict,
  NativeObservationWitness,
} from "./proof.ts";

/** The ONLY store capability this witness holds: the read methods. There is no commit and no close here. */
export type ReadOnlyStore = Pick<
  CampaignStore,
  "head" | "getFact" | "lookupReceipt" | "committedGroup" | "committedGroupById"
>;

/** The journal revision at which a fact's committing group committed, or null when the journal cannot show it. */
export function revisionOf(store: ReadOnlyStore, fact: OwnerFact): number | null {
  const group = store.committedGroupById?.(fact.provenance.group_id) ?? null;
  if (group === null) return null;
  const receipt = store.lookupReceipt(group.intent_id);
  return receipt === null || receipt.group_id !== group.group_id ? null : receipt.revision;
}

/**
 * A read-only view of the campaign AS OF one journal revision. A fact whose committing group committed after the cut is invisible, so an
 * earlier cut is a real earlier history (the same journal, read to an earlier point), never a fabricated record.
 */
export interface CutView extends Pick<ReadonlyMap<string, OwnerFact>, "get" | "has"> {
  readonly campaign_id: string;
  readonly cut_revision: number;
}

export function cutView(store: ReadOnlyStore, cutRevision?: number): CutView {
  const head = store.head();
  const cut = cutRevision ?? head.revision;
  const get = (key: string): OwnerFact | undefined => {
    const fact = store.getFact(key);
    if (fact === undefined) return undefined;
    const rev = revisionOf(store, fact);
    return rev !== null && rev <= cut ? fact : undefined;
  };
  return {
    campaign_id: head.campaign_id,
    cut_revision: cut,
    get,
    has: (k) => get(k) !== undefined,
  };
}

/** The E0 evidence ledger over a cut: the same read-only view, so the checker and the witness cannot disagree about what exists. */
export const ledgerAtCut = (store: ReadOnlyStore, cutRevision?: number): EvidenceLedger => {
  const view = cutView(store, cutRevision);
  return { get: (k) => view.get(k) };
};

const refuse = (code: string, detail: string): NativeObservationVerdict => ({
  ok: false,
  code,
  detail,
});

/**
 * Verifies that the receipt of one observation-earned event was actually committed at the cut, from the journal. `cutRevision` defaults to
 * the head: an earlier value reads an earlier real history.
 */
export function nativeObservationWitness(
  store: ReadOnlyStore,
  opts: { readonly cutRevision?: number } = {},
): NativeObservationWitness {
  return {
    id: "NATIVE_JOURNAL_VIEW_TEST_LOCAL",
    verify({ event: presented, pc_id }): NativeObservationVerdict {
      if (store.committedGroupById === undefined)
        return refuse("JOURNAL_BY_ID_UNAVAILABLE", "the store cannot show a committed group by id");
      const head = store.head();
      const view = cutView(store, opts.cutRevision);
      const parsed = AccessEventSchema.safeParse(presented.value);
      if (!parsed.success) return refuse("EVENT_NOT_BOUNDED_ACCESS", presented.key);
      const event = parsed.data;
      const eventId = event.event_id;
      // identity: the key and the id are the DERIVED ones, for this character at this basis
      if (
        presented.key !== accessEventKey(eventId) ||
        eventId !== observationEventId(pc_id, event.established_at) ||
        event.participants[0] !== pc_id
      )
        return refuse("EVENT_IDENTITY_NOT_DERIVED", presented.key);
      // the event is the journal's own fact, at the cut: not a lookalike, not another campaign's record under the same key
      const journalEvent = view.get(presented.key);
      if (journalEvent === undefined)
        return refuse("EVENT_NOT_AT_CUT", `${presented.key} @${view.cut_revision}`);
      if (!canonicalEqual(journalEvent, presented))
        return refuse("EVENT_NOT_THE_JOURNAL_FACT", presented.key);
      const eventGroup = store.committedGroupById(journalEvent.provenance.group_id);
      if (eventGroup === null)
        return refuse("EVENT_GROUP_MISSING", journalEvent.provenance.group_id);
      const eventReceipt = store.lookupReceipt(eventGroup.intent_id);
      if (eventReceipt === null || eventReceipt.group_id !== eventGroup.group_id)
        return refuse("EVENT_RECEIPT_MISSING", eventGroup.intent_id);
      if (
        eventGroup.campaign_id !== head.campaign_id ||
        eventReceipt.campaign_id !== head.campaign_id
      )
        return refuse("CAMPAIGN_MISMATCH", presented.key);
      if (eventReceipt.revision > view.cut_revision)
        return refuse("EVENT_AFTER_CUT", `${eventReceipt.revision} > ${view.cut_revision}`);
      const wrote = eventGroup.writes.find((w) => w.key === presented.key);
      if (wrote === undefined || !canonicalEqual(wrote.value, journalEvent.value))
        return refuse("EVENT_GROUP_DOES_NOT_WRITE_IT", presented.key);
      // the recipient is the character the Role Registry binding names (not an event role claim alone)
      const bound = recipientBoundaryViolation(view, event);
      if (bound !== null) return refuse("PC_NOT_BOUND", bound);

      // the owner's own verifier: the retained decision, its premises, the derived event, its identities and basis
      const violation = observationEventViolation(
        {
          group: eventGroup,
          value: journalEvent.value,
          basis: journalEvent.basis,
          factOf: (k) => view.get(k),
        },
        "VERIFICATION",
      );
      if (violation !== null) return refuse("OWNER_EVENT_VERIFIER_REFUSED", violation);
      // the committed formation: actor packet and sealed provenance, ONE group, the packet stage's own identity
      const packetKey = accessPacketKey(eventId, pc_id);
      const provenanceKey = accessProvenanceKey(eventId, pc_id);
      const packet = view.get(packetKey);
      if (packet === undefined)
        return refuse("PACKET_ABSENT_AT_CUT", `${packetKey} @${view.cut_revision}`);
      const provenance = view.get(provenanceKey);
      if (provenance === undefined)
        return refuse("PROVENANCE_ABSENT_AT_CUT", `${provenanceKey} @${view.cut_revision}`);
      const stage = accessPacketStage(eventId, pc_id);
      const formationGroupId = stageGroupId(stage);
      if (
        packet.provenance.group_id !== provenance.provenance.group_id ||
        packet.provenance.group_id !== formationGroupId
      )
        return refuse(
          "FORMATION_NOT_ONE_STAGE_GROUP",
          `${packet.provenance.group_id} / ${provenance.provenance.group_id}`,
        );
      if (
        packet.secrecy !== ACCESS_CLASS_ACTOR_ACCESSIBLE ||
        provenance.secrecy !== ACCESS_CLASS_ENGINE_SEALED
      )
        return refuse("SECRECY_CLASS_NOT_SEPARATED", `${packet.secrecy} / ${provenance.secrecy}`);
      const formationGroup: CommitGroup | null = store.committedGroupById(formationGroupId);
      if (formationGroup === null) return refuse("FORMATION_GROUP_MISSING", formationGroupId);
      const formationReceipt = store.lookupReceipt(formationGroup.intent_id);
      if (formationReceipt === null || formationReceipt.group_id !== formationGroup.group_id)
        return refuse("FORMATION_RECEIPT_MISSING", formationGroup.intent_id);
      if (formationGroup.campaign_id !== head.campaign_id)
        return refuse("CAMPAIGN_MISMATCH", formationGroupId);
      const written = formationGroup.writes.map((w) => w.key).sort();
      if (!canonicalEqual(written, [packetKey, provenanceKey].sort()))
        return refuse("FORMATION_GROUP_WRITES_OTHER_KEYS", written.join(","));
      if (formationReceipt.revision <= eventReceipt.revision)
        return refuse(
          "FORMATION_NOT_AFTER_EVENT",
          `${formationReceipt.revision} <= ${eventReceipt.revision}`,
        );
      if (formationReceipt.revision > view.cut_revision)
        return refuse("FORMATION_AFTER_CUT", `${formationReceipt.revision} > ${view.cut_revision}`);
      // equal to what the Epistemic owner's own derivation determines from the committed event; nothing else
      const derived = deriveAccessProducts({
        event: {
          key: journalEvent.key,
          owner: journalEvent.owner,
          version: journalEvent.version,
          value: event,
        },
        capability: null,
      });
      if (!derived.ok) return refuse("OWNER_DERIVATION_REFUSED", derived.error.message);
      const packetValue = AccessiblePacketSchema.safeParse(packet.value);
      const provenanceValue = SealedEngineProvenanceSchema.safeParse(provenance.value);
      if (!packetValue.success || !canonicalEqual(packetValue.data, derived.value.packet))
        return refuse("PACKET_NOT_THE_OWNER_DERIVATION", packetKey);
      if (
        !provenanceValue.success ||
        !canonicalEqual(provenanceValue.data, derived.value.provenance)
      )
        return refuse("PROVENANCE_NOT_THE_OWNER_DERIVATION", provenanceKey);

      // the sealed NOW-only transaction: the same stage, the same group, the same receipt, no object, no boundary, no elapsed time
      const transactionId = observationTransactionId(eventId);
      const transactionFact = view.get(temporalTransactionKey(transactionId));
      if (transactionFact === undefined)
        return refuse(
          "TRANSACTION_ABSENT_AT_CUT",
          `${temporalTransactionKey(transactionId)} @${view.cut_revision}`,
        );
      const transaction = ResolutionTransactionSchema.safeParse(transactionFact.value);
      if (!transaction.success) return refuse("TRANSACTION_INVALID", transactionFact.key);
      const tx = transaction.data;
      if (
        tx.transaction_id !== transactionId ||
        tx.cause !== observationTransactionCause(eventId) ||
        tx.trigger.kind !== OBSERVATION_TRIGGER_KIND ||
        tx.trigger.ref !== eventId ||
        tx.continues !== null ||
        tx.requested.condition !== null ||
        tx.context.role !== PLAYER_CHOICE_AUTHORITY.role ||
        tx.context.permission !== PLAYER_CHOICE_AUTHORITY.permission
      )
        return refuse("TRANSACTION_NOT_THE_OBSERVATION_TRIGGER", transactionId);
      if (tx.engaged.length > 0 || tx.boundaries_crossed.length > 0)
        return refuse("TRANSACTION_ENGAGES_OBJECT_OR_BOUNDARY", transactionId);
      if (
        tx.outcome.stop_reason !== "TARGET_REACHED" ||
        tx.outcome.remainder !== null ||
        tx.outcome.unresolved_dependents.length > 0
      )
        return refuse("TRANSACTION_NOT_TARGET_REACHED_CLOSED", transactionId);
      // one clock: event, packet, opening, target and stop agree exactly (an incomparable or advanced time never closes)
      const instants = [
        event.established_at,
        packetValue.data.access.established_at,
        tx.opening.basis_time,
        tx.requested.target ?? event.established_at,
        tx.outcome.actual_stop,
      ];
      for (const t of instants)
        if (compareTime(t, event.established_at) !== 0)
          return refuse(
            "CLOCK_NOT_ONE_BASIS",
            `${t.unit}:${t.value} vs ${event.established_at.unit}:${event.established_at.value}`,
          );
      const only = tx.stages.length === 1 ? tx.stages[0]! : null;
      if (only === null || !canonicalEqual(only.stage, stage))
        return refuse("TRANSACTION_STAGE_NOT_THE_PACKET_FORMATION", transactionId);
      if (
        only.group_id !== formationGroupId ||
        only.intent_id !== formationGroup.intent_id ||
        only.revision !== formationReceipt.revision ||
        only.group_sha256 !== formationReceipt.group_sha256
      )
        return refuse("TRANSACTION_NOT_LINKED_TO_THE_COMMITTED_GROUP", transactionId);
      const recorded = only.writes
        .map((w) => `${w.key}@${w.version}`)
        .sort()
        .join("|");
      const expected = [`${packetKey}@${packet.version}`, `${provenanceKey}@${provenance.version}`]
        .sort()
        .join("|");
      if (recorded !== expected) return refuse("TRANSACTION_WRITES_NOT_THE_FORMATION", recorded);
      const transactionRevision = revisionOf(store, transactionFact);
      if (transactionRevision === null || transactionRevision < formationReceipt.revision)
        return refuse("TRANSACTION_NOT_SEALED_AFTER_FORMATION", String(transactionRevision));
      return { ok: true, code: "NATIVE_RECEIPT_COMMITTED", detail: `cut ${view.cut_revision}` };
    },
  };
}

/**
 * A READ-ONLY perturbation of a real store, for the labelled forged-fixture twins ONLY: it answers selected reads differently and writes
 * nothing. It carries no commit and no close.
 */
export function overlayStore(
  store: ReadOnlyStore,
  over: {
    readonly facts?: Readonly<Record<string, OwnerFact | null>>;
    /** replace the journal revision of the group committed under an intent */
    readonly revisions?: Readonly<Record<string, number>>;
    /** replace the committed group recorded under a group id (null: the journal cannot show it) */
    readonly groups?: Readonly<Record<string, CommitGroup | null>>;
    /** the campaign identity the head reports */
    readonly campaignId?: string;
  },
): ReadOnlyStore {
  const groupOf = (g: CommitGroup | null): CommitGroup | null => {
    if (g === null) return null;
    const replaced = over.groups?.[g.group_id];
    return replaced === undefined ? g : replaced;
  };
  return {
    head: () => {
      const h = store.head();
      return over.campaignId === undefined ? h : { ...h, campaign_id: over.campaignId };
    },
    getFact: (k) =>
      over.facts && k in over.facts ? (over.facts[k] ?? undefined) : store.getFact(k),
    committedGroup: (i) => groupOf(store.committedGroup(i)),
    ...(store.committedGroupById
      ? {
          committedGroupById: (g: string) =>
            over.groups && g in over.groups
              ? (over.groups[g] ?? null)
              : groupOf(store.committedGroupById!(g)),
        }
      : {}),
    lookupReceipt: (intent) => {
      const r = store.lookupReceipt(intent);
      const rev = over.revisions?.[intent];
      return r !== null && rev !== undefined ? { ...r, revision: rev } : r;
    },
  };
}
