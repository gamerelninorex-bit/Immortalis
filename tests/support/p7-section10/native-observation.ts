// F-014B P-7 E1 - the test-local, READ-ONLY native journal evidence for a DIRECT_OBSERVATION receipt (BLUE P7-E1 brief, Notion
// 42220af9-01e0-811b-8857-f7647cabc51d; BLUE HOLD repair F-1/F-2 at Notion 42320af9-01e0-81a0-9bed-f747340238). MECHANISM ONLY and NON-WRITING.
//
// WHAT IT DOES. The E0 checker can show that a receipt is DERIVABLE from a committed observation-earned event. This module shows the
// receipt was actually COMMITTED, by the original owner, at a named journal cut: it reads the real campaign's journal (committed groups,
// receipts, revisions) and re-verifies, with the OWNERS' OWN functions, that
//   - the event is the journal's own fact, earned by a retained direct-perception decision (`observationEventViolation`, VERIFICATION),
//     for the character the Role Registry binding names (`recipientBoundaryViolation`);
//   - the durable transaction authority, the actor packet + sealed engine provenance (ONE stage group) and the sealed NOW-only
//     transaction are each the exact write of their own committed group, whose receipt (campaign, intent, canonical hash) is the journal's,
//     in the order event < authority < formation < seal <= cut (`stageAuthorityViolation`, `observationTriggerViolation`,
//     `observationTransactionViolation`, `deriveAccessProducts`);
//   - the seal records that exact stage, group, receipt, realized reads and writes, with no object, boundary or elapsed time.
//
// WHO CALLS IT. The CHECKER does, from its own context: `CheckerContext.nativeEvidence` is an OPAQUE value issued only by
// `bindNativeEvidence`, and the E0 checker STATICALLY IMPORTS `verifyNativeReceipt` and calls it itself. There is no installer, setter,
// registration, callback or success flag anywhere, so no caller can supply or pre-empt the verifier, in any module graph: an object that was
// not issued here is refused, and the one evidence value carries the ONE ledger the checker must read from, so a ledger, a campaign and a
// cut can never be swapped independently. The evidence is valid only for the journal head it was issued at: ANY changed head (advanced,
// rewound or another journal) refuses and the evidence must be reissued on the new head; no ancestry is inferred. The checker's explicit
// canonical cut is required. This module imports nothing from the checker (no cycle). It holds ONLY the store's read methods (the type
// below has no commit, no close, no listing), so it cannot write; a static test pins that. The diagnostic codes are test diagnostics,
// never a canonical classification.
//
// HISTORY IS NARROW BY DESIGN. A fact is visible "at a cut" only when the group that committed ITS CURRENT VERSION is strictly valid and
// committed at or before the cut. That is exact for create-only receipt records and for source versions that have not moved since; a fact
// whose current version was committed after the cut is hidden, never reconstructed. A required source version that cannot be read refuses.
import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessEventSchema,
  AccessiblePacketSchema,
  CANON_WRITE_AUTHORITY,
  CommitGroupSchema,
  FACET_EPISTEMIC_ACCESS,
  OBSERVATION_TRIGGER_KIND,
  OWNER_EPISTEMIC_ACCESS,
  PLAYER_CHOICE_AUTHORITY,
  ResolutionTransactionSchema,
  SealedEngineProvenanceSchema,
  TEMPORAL_STATE_KEY,
  TransactionAuthoritySchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  CanonicalTimeSchema,
  compareTime,
  observationTransactionCause,
  observationTransactionId,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CanonicalTime,
  type CommitGroup,
  type CommitReceipt,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../../../packages/engine/src/hash.ts";
import {
  deriveAccessProducts,
  recipientBoundaryViolation,
} from "../../../packages/engine/src/epistemic/derive.ts";
import {
  epistemicPacketDeclaration,
  isObservationEarnedFact,
  observationTransactionViolation,
  observationTriggerViolation,
} from "../../../packages/engine/src/epistemic/declaration.ts";
import {
  observationEventId,
  observationEventViolation,
} from "../../../packages/engine/src/epistemic/observation.ts";
import { EPISTEMIC_ACCESS_RULE, factKind } from "../../../packages/engine/src/owners/registry.ts";
import type { CampaignStore } from "../../../packages/engine/src/persistence/store.ts";
import { stageAuthorityViolation } from "../../../packages/engine/src/production/admission.ts";
import {
  stageGroupId,
  transactionAuthorityGroupId,
  transactionAuthorityIntentId,
  transactionCause,
  transactionGroupId,
  transactionIntentId,
} from "../../../packages/engine/src/temporal/identity.ts";

/** The ONLY store capability this module holds: the read methods. There is no commit, no close and no listing here. */
export type ReadOnlyStore = Pick<
  CampaignStore,
  "head" | "getFact" | "lookupReceipt" | "committedGroup" | "committedGroupById"
>;

/** What the E0 checker reads committed owner facts through (structurally the E0 `EvidenceLedger`; declared here so this module imports nothing from the checker). */
export interface NativeLedger {
  get(key: string): OwnerFact | undefined;
}

/**
 * The opaque evidence a checker context carries: one authentic campaign, one valid exact journal cut and THE ledger over that cut. It is
 * created only by `bindNativeEvidence`; `verifyNativeReceipt` refuses any other object.
 */
export interface NativeEvidence {
  readonly campaign_id: string;
  readonly cut_revision: number;
  readonly ledger: NativeLedger;
}

export interface NativeReceiptQuery {
  readonly event: OwnerFact;
  readonly pc_id: string;
  /** the ledger the checker is reading from: it must be THE ledger of the evidence */
  readonly ledger: NativeLedger;
  /** the checker's explicit canonical cut: REQUIRED. Absent or invalid refuses; the evidence of a past observation may lie before it, never after */
  readonly canonical_cut?: CanonicalTime | undefined;
}

/** A diagnostic result: never a canonical classification. Produced only by `verifyNativeReceipt`, which the checker calls itself. */
export interface NativeReceiptVerdict {
  readonly ok: boolean;
  readonly code: string;
  readonly detail: string;
}

class Refusal extends Error {
  readonly code: string;
  readonly detail: string;
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
  }
}
const fail = (code: string, detail: string): never => {
  throw new Refusal(code, detail);
};
const refuse = (code: string, detail: string): NativeReceiptVerdict => ({
  ok: false,
  code,
  detail,
});

// ---------------------------------------------------------------------------------------------
// The journal, strictly: a group is the journal's group, its receipt is its own, its hash is recomputed
// ---------------------------------------------------------------------------------------------

interface Committed {
  readonly group: CommitGroup;
  readonly receipt: CommitReceipt;
}

/**
 * One committed group of THIS campaign, exactly as the journal holds it: the group is well formed, has the identity asked for, is also what
 * the intent index returns, and its receipt is the receipt of THIS group and intent in THIS campaign, records the group's own rule and
 * authority, and carries the canonical hash RECOMPUTED here from the returned group (never trusted from a recorded value).
 */
function strictCommitted(store: ReadOnlyStore, campaignId: string, groupId: string): Committed {
  if (store.committedGroupById === undefined)
    return fail("JOURNAL_BY_ID_UNAVAILABLE", "the store cannot show a committed group by id");
  const group = store.committedGroupById(groupId);
  if (group === null) return fail("GROUP_NOT_COMMITTED", groupId);
  if (!CommitGroupSchema.safeParse(group).success) return fail("GROUP_INVALID", groupId);
  if (group.group_id !== groupId) return fail("GROUP_IDENTITY_MISMATCH", groupId);
  if (!canonicalEqual(store.committedGroup(group.intent_id), group))
    return fail("GROUP_INDEX_DISAGREES", groupId);
  const receipt = store.lookupReceipt(group.intent_id);
  if (receipt === null) return fail("RECEIPT_MISSING", group.intent_id);
  if (receipt.group_id !== group.group_id || receipt.intent_id !== group.intent_id)
    return fail("RECEIPT_NOT_THIS_GROUP", `${receipt.group_id} / ${receipt.intent_id}`);
  if (group.campaign_id !== campaignId || receipt.campaign_id !== campaignId)
    return fail("CAMPAIGN_MISMATCH", groupId);
  if (sha256Canonical(group) !== receipt.group_sha256) return fail("GROUP_HASH_MISMATCH", groupId);
  if (
    !canonicalEqual(receipt.basis.rule, group.rule) ||
    !canonicalEqual(receipt.basis.authority, group.authority)
  )
    return fail("RECEIPT_BASIS_NOT_THE_GROUP", groupId);
  if (!Number.isInteger(receipt.revision) || receipt.revision < 1)
    return fail("RECEIPT_REVISION_INVALID", String(receipt.revision));
  return { group, receipt };
}

/** Why `fact` is not the exact write of the committed group that names it, or null: every material field, not the value alone. */
function writeViolation(fact: OwnerFact, c: Committed): string | null {
  const writes = c.group.writes.filter((w) => w.key === fact.key);
  if (writes.length !== 1) return "GROUP_DOES_NOT_WRITE_IT";
  const w = writes[0]!;
  if (
    w.owner !== fact.owner ||
    w.facet !== fact.facet ||
    c.group.owner !== fact.owner ||
    c.group.facet !== fact.facet
  )
    return "WRITE_OWNER_FACET_MISMATCH";
  if (
    !canonicalEqual(w.value, fact.value) ||
    w.unit !== fact.unit ||
    w.basis !== fact.basis ||
    w.secrecy !== fact.secrecy
  )
    return "WRITE_PAYLOAD_MISMATCH";
  if (w.expected_version + 1 !== fact.version) return "WRITE_VERSION_MISMATCH";
  if (
    fact.provenance.group_id !== c.group.group_id ||
    fact.provenance.intent_id !== c.group.intent_id ||
    fact.provenance.cause !== c.group.cause ||
    !canonicalEqual(fact.provenance.rule, c.group.rule)
  )
    return "PROVENANCE_NOT_THE_GROUP";
  return null;
}

/** A read-only view of the campaign AS OF one journal revision, strict about every fact it shows. */
interface View {
  get(key: string): OwnerFact | undefined;
  /** why a fact that EXISTS is hidden: a strict refusal code, or `AFTER_CUT`; undefined when it is simply absent or shown */
  why(key: string): string | undefined;
  committed(groupId: string): Committed;
}

function makeView(store: ReadOnlyStore, campaignId: string, cut: number): View {
  const groups = new Map<string, Committed | Refusal>();
  const facts = new Map<string, OwnerFact | undefined>();
  const hidden = new Map<string, string>();
  const committed = (groupId: string): Committed => {
    let hit = groups.get(groupId);
    if (hit === undefined) {
      try {
        hit = strictCommitted(store, campaignId, groupId);
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
        hit = e;
      }
      groups.set(groupId, hit);
    }
    if (hit instanceof Refusal) throw hit;
    return hit;
  };
  const get = (key: string): OwnerFact | undefined => {
    if (facts.has(key)) return facts.get(key);
    let shown: OwnerFact | undefined;
    const fact = store.getFact(key);
    if (fact !== undefined) {
      try {
        const c = committed(fact.provenance.group_id);
        const why = writeViolation(fact, c);
        if (why !== null) hidden.set(key, why);
        else if (c.receipt.revision > cut) hidden.set(key, "AFTER_CUT");
        else shown = fact;
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
        hidden.set(key, e.code);
      }
    }
    facts.set(key, shown);
    return shown;
  };
  return { get, why: (k) => hidden.get(k), committed };
}

/** The journal revision at which the group that committed the fact's current version committed, or null when the journal cannot show it. */
export function revisionOf(store: ReadOnlyStore, fact: OwnerFact): number | null {
  try {
    return makeView(store, store.head().campaign_id, Number.MAX_SAFE_INTEGER).committed(
      fact.provenance.group_id,
    ).receipt.revision;
  } catch (e) {
    if (e instanceof Refusal) return null;
    throw e;
  }
}

// ---------------------------------------------------------------------------------------------
// Issuing the evidence
// ---------------------------------------------------------------------------------------------

interface Bound {
  readonly store: ReadOnlyStore;
  readonly campaign_id: string;
  readonly head_revision: number;
  /** the journal and state identity of the head the evidence was issued at: two separately committed campaigns can share an id and bytes, never these */
  readonly head_journal_sha256: string;
  readonly head_state_sha256: string;
  readonly cut_revision: number;
  /** why the requested cut is not a valid exact cut of this journal, or null */
  readonly cut_error: string | null;
  readonly view: View;
}
/** The registry of issued evidence: an object that is not here was not issued here. */
const ISSUED = new WeakMap<object, Bound>();

/**
 * Binds one campaign journal, one exact cut and THE ledger over it into one opaque evidence value. `cutRevision` defaults to the head; an
 * explicit cut must be an integer from 0 to the head revision, otherwise the evidence is issued INVALID and every verification refuses it
 * (a future, negative, fractional or non-numeric cut is never clamped or reinterpreted).
 */
export function bindNativeEvidence(
  store: ReadOnlyStore,
  opts: { readonly cutRevision?: number } = {},
): NativeEvidence {
  const head = store.head();
  const requested = opts.cutRevision ?? head.revision;
  const cutError =
    typeof requested !== "number" || !Number.isInteger(requested)
      ? "the cut is not an integer journal revision"
      : requested < 0
        ? "the cut precedes the journal"
        : requested > head.revision
          ? `the cut ${requested} is beyond the journal head ${head.revision}`
          : null;
  // an invalid cut is shown the head so that a checker still reaches the refusal; the verification refuses it whatever it sees
  const shown = cutError === null ? requested : head.revision;
  const view = makeView(store, head.campaign_id, shown);
  const evidence: NativeEvidence = Object.freeze({
    campaign_id: head.campaign_id,
    cut_revision: requested,
    ledger: Object.freeze({ get: (key: string) => view.get(key) }),
  });
  ISSUED.set(evidence, {
    store,
    campaign_id: head.campaign_id,
    head_revision: head.revision,
    head_journal_sha256: head.journal_head_sha256,
    head_state_sha256: head.state_sha256,
    cut_revision: shown,
    cut_error: cutError,
    view,
  });
  return evidence;
}

// ---------------------------------------------------------------------------------------------
// The verification (called by the CHECKER only)
// ---------------------------------------------------------------------------------------------

/**
 * Verifies that the receipt of one observation-earned event was actually committed at the evidence's cut, from the journal. Returns a
 * diagnostic verdict; never throws for a refusal. It is installed ONCE into the E0 checker (write-once, bottom of this module): the
 * checker calls it with the evidence from its own context, the event it re-read from its own ledger and that ledger.
 */
export function verifyNativeReceipt(
  evidence: NativeEvidence,
  q: NativeReceiptQuery,
): NativeReceiptVerdict {
  const bound = ISSUED.get(evidence);
  if (bound === undefined)
    return refuse(
      "NATIVE_EVIDENCE_NOT_ISSUED",
      "the evidence was not issued by the native verifier",
    );
  try {
    return verifyBound(bound, evidence, q);
  } catch (e) {
    if (e instanceof Refusal) return refuse(e.code, e.detail);
    throw e;
  }
}

function verifyBound(
  bound: Bound,
  evidence: NativeEvidence,
  q: NativeReceiptQuery,
): NativeReceiptVerdict {
  if (q.ledger !== evidence.ledger)
    return fail("LEDGER_NOT_THE_BOUND_ONE", "the checker reads another ledger than the evidence's");
  if (bound.cut_error !== null) return fail("CUT_INVALID", bound.cut_error);
  const { store, view } = bound;
  const head = store.head();
  if (head.campaign_id !== bound.campaign_id)
    return fail("CAMPAIGN_MISMATCH", `${head.campaign_id} is not ${bound.campaign_id}`);
  // the evidence is valid for the ONE journal head it was issued at. A changed head is never trusted: no ancestry between two heads is
  // proven here (a higher head may be another journal, and the cached view would keep returning the old facts), so it is reissued instead
  if (head.revision < bound.head_revision)
    return fail("JOURNAL_REWOUND", `${head.revision} < ${bound.head_revision}`);
  if (head.revision > bound.head_revision)
    return fail(
      "JOURNAL_HEAD_ADVANCED",
      `${head.revision} > ${bound.head_revision}: no ancestry is proven, reissue the evidence on the new head`,
    );
  if (
    head.journal_head_sha256 !== bound.head_journal_sha256 ||
    head.state_sha256 !== bound.head_state_sha256
  )
    return fail("JOURNAL_NOT_THE_PINNED_ONE", `revision ${head.revision}`);
  // the checker's canonical cut is explicit and valid, or nothing closes
  if (q.canonical_cut === undefined)
    return fail("CANONICAL_CUT_ABSENT", "the checker supplied no canonical cut");
  if (!CanonicalTimeSchema.safeParse(q.canonical_cut).success)
    return fail("CANONICAL_CUT_INVALID", "the checker's canonical cut is not a canonical time");
  const canonicalCut = q.canonical_cut;
  const cut = bound.cut_revision;
  const need = (key: string, absent: string): OwnerFact => {
    const f = view.get(key);
    if (f !== undefined) return f;
    const why = view.why(key);
    return why !== undefined && why !== "AFTER_CUT"
      ? fail(why, key)
      : fail(absent, `${key} @${cut}`);
  };

  // identity: the key and the id are the DERIVED ones, for this character at this basis
  const presented = q.event;
  const pcId = q.pc_id;
  const parsed = AccessEventSchema.safeParse(presented.value);
  if (!parsed.success) return fail("EVENT_NOT_BOUNDED_ACCESS", presented.key);
  const event = parsed.data;
  const eventId = event.event_id;
  if (
    presented.key !== accessEventKey(eventId) ||
    eventId !== observationEventId(pcId, event.established_at) ||
    event.participants[0] !== pcId
  )
    return fail("EVENT_IDENTITY_NOT_DERIVED", presented.key);
  // lawful evidence of a PAST observation at a later canonical cut closes; an observation after the cut, or on another clock, never does
  const against = compareTime(event.established_at, canonicalCut);
  if (against === null)
    return fail("CLOCK_NOT_ONE_BASIS", "the access time and the canonical cut are incomparable");
  if (against > 0) return fail("EVIDENCE_AFTER_CANONICAL_CUT", presented.key);

  // the event is the journal's own fact at the cut: not a lookalike, not another campaign's record under the same key
  const eventFact = need(presented.key, "EVENT_NOT_AT_CUT");
  if (!canonicalEqual(eventFact, presented))
    return fail("EVENT_NOT_THE_JOURNAL_FACT", presented.key);
  if (!isObservationEarnedFact(eventFact))
    return fail("EVENT_NOT_OBSERVATION_EARNED", presented.key);
  const eventC = view.committed(eventFact.provenance.group_id);
  const bindingViolation = recipientBoundaryViolation(
    { get: view.get, has: (k) => view.get(k) !== undefined },
    event,
  );
  if (bindingViolation !== null) return fail("PC_NOT_BOUND", bindingViolation);
  // the owner's own verifier: the retained decision, its premises, the derived event, its identities and basis
  const violation = observationEventViolation(
    {
      group: eventC.group,
      value: eventFact.value,
      basis: eventFact.basis,
      factOf: (k) => view.get(k),
    },
    "VERIFICATION",
  );
  if (violation !== null) return fail("OWNER_EVENT_VERIFIER_REFUSED", violation);

  // the committed formation: actor packet and sealed provenance, ONE group, the packet stage's own identity
  const packetKey = accessPacketKey(eventId, pcId);
  const provenanceKey = accessProvenanceKey(eventId, pcId);
  const packet = need(packetKey, "PACKET_ABSENT_AT_CUT");
  const provenance = need(provenanceKey, "PROVENANCE_ABSENT_AT_CUT");
  const stage = accessPacketStage(eventId, pcId);
  const formationGroupId = stageGroupId(stage);
  if (
    packet.provenance.group_id !== provenance.provenance.group_id ||
    packet.provenance.group_id !== formationGroupId
  )
    return fail(
      "FORMATION_NOT_ONE_STAGE_GROUP",
      `${packet.provenance.group_id} / ${provenance.provenance.group_id}`,
    );
  if (
    packet.secrecy !== ACCESS_CLASS_ACTOR_ACCESSIBLE ||
    provenance.secrecy !== ACCESS_CLASS_ENGINE_SEALED
  )
    return fail("SECRECY_CLASS_NOT_SEPARATED", `${packet.secrecy} / ${provenance.secrecy}`);
  const formation = view.committed(formationGroupId);
  const written = formation.group.writes.map((w) => w.key).sort();
  if (!canonicalEqual(written, [packetKey, provenanceKey].sort()))
    return fail("FORMATION_GROUP_WRITES_OTHER_KEYS", written.join(","));
  const txId = observationTransactionId(eventId);
  if (
    formation.group.owner !== OWNER_EPISTEMIC_ACCESS ||
    formation.group.facet !== FACET_EPISTEMIC_ACCESS ||
    !canonicalEqual(formation.group.rule, EPISTEMIC_ACCESS_RULE) ||
    !canonicalEqual(formation.group.authority, CANON_WRITE_AUTHORITY) ||
    formation.group.cause !== transactionCause(txId)
  )
    return fail("FORMATION_NOT_THE_EPISTEMIC_STAGE", formationGroupId);
  if (formation.receipt.revision <= eventC.receipt.revision)
    return fail(
      "FORMATION_NOT_AFTER_EVENT",
      `${formation.receipt.revision} <= ${eventC.receipt.revision}`,
    );
  if (formation.receipt.revision > cut)
    return fail("FORMATION_AFTER_CUT", `${formation.receipt.revision} > ${cut}`);
  // equal to what the Epistemic owner's own derivation determines from the committed event; nothing else
  const derived = deriveAccessProducts({
    event: {
      key: eventFact.key,
      owner: eventFact.owner,
      version: eventFact.version,
      value: event,
    },
    capability: null,
  });
  if (!derived.ok) return fail("OWNER_DERIVATION_REFUSED", derived.error.message);
  const packetValue = AccessiblePacketSchema.safeParse(packet.value);
  const provenanceValue = SealedEngineProvenanceSchema.safeParse(provenance.value);
  if (!packetValue.success || !canonicalEqual(packetValue.data, derived.value.packet))
    return fail("PACKET_NOT_THE_OWNER_DERIVATION", packetKey);
  if (!provenanceValue.success || !canonicalEqual(provenanceValue.data, derived.value.provenance))
    return fail("PROVENANCE_NOT_THE_OWNER_DERIVATION", provenanceKey);

  // the stage's realized reads and dependencies: exactly its declared read of the event (NOW), then the durable authority it ran under
  const declaration = epistemicPacketDeclaration(event);
  if (declaration.reads.length !== 1)
    return fail("FORMATION_READS_NOT_THE_NATIVE_EVENT", String(declaration.reads.length));
  if (!canonicalEqual(formation.group.reads, [{ key: eventFact.key, version: eventFact.version }]))
    return fail("FORMATION_READS_NOT_THE_EVENT", JSON.stringify(formation.group.reads));
  const authorityGroupId = transactionAuthorityGroupId(txId);
  if (
    !canonicalEqual(formation.group.depends_on, [eventFact.provenance.group_id, authorityGroupId])
  )
    return fail(
      "FORMATION_DEPENDENCIES_NOT_EVENT_AND_AUTHORITY",
      formation.group.depends_on.join(","),
    );

  // the durable transaction authority: committed by its own group between the event and the formation, repeating exactly what it opened
  const authorityKey = temporalTransactionAuthorityKey(txId);
  const authorityFact = need(authorityKey, "AUTHORITY_ABSENT_AT_CUT");
  const authority = TransactionAuthoritySchema.safeParse(authorityFact.value);
  if (!authority.success) return fail("AUTHORITY_INVALID", authorityKey);
  if (
    authorityFact.provenance.group_id !== authorityGroupId ||
    authorityFact.provenance.intent_id !== transactionAuthorityIntentId(txId)
  )
    return fail("AUTHORITY_NOT_UNDER_ITS_DERIVED_IDENTITY", authorityKey);
  const authorityC = view.committed(authorityGroupId);
  if (
    authorityC.group.cause !== transactionCause(txId) ||
    !canonicalEqual(authorityC.group.authority, CANON_WRITE_AUTHORITY) ||
    !canonicalEqual(authorityC.group.reads, [
      { key: TEMPORAL_STATE_KEY, version: authority.data.opening.state_version },
    ]) ||
    !canonicalEqual(authorityC.group.rule, factKind("temporal_state").rule)
  )
    return fail("AUTHORITY_GROUP_NOT_THE_KERNEL_OPENING", authorityGroupId);
  if (
    authorityC.receipt.revision <= eventC.receipt.revision ||
    authorityC.receipt.revision >= formation.receipt.revision
  )
    return fail(
      "AUTHORITY_NOT_BETWEEN_EVENT_AND_FORMATION",
      `${eventC.receipt.revision} < ${authorityC.receipt.revision} < ${formation.receipt.revision}`,
    );
  const opening = authority.data.opening.basis_time;
  const trigger = observationTriggerViolation(authority.data, eventFact, opening);
  if (trigger !== null) return fail("OWNER_TRIGGER_REFUSED", trigger);
  const stageAuthority = stageAuthorityViolation(
    formation.group,
    stage,
    new Map([[authorityKey, authorityFact]]),
    opening,
    "VERIFICATION",
  );
  if (stageAuthority !== null) return fail("OWNER_STAGE_AUTHORITY_REFUSED", stageAuthority);

  // the sealed NOW-only transaction: its OWN group, committed strictly after the formation, no object, no boundary, no elapsed time
  const transactionKey = temporalTransactionKey(txId);
  const transactionFact = need(transactionKey, "TRANSACTION_ABSENT_AT_CUT");
  const transaction = ResolutionTransactionSchema.safeParse(transactionFact.value);
  if (!transaction.success) return fail("TRANSACTION_INVALID", transactionFact.key);
  const tx = transaction.data;
  if (
    tx.transaction_id !== txId ||
    tx.cause !== observationTransactionCause(eventId) ||
    tx.trigger.kind !== OBSERVATION_TRIGGER_KIND ||
    tx.trigger.ref !== eventId ||
    tx.continues !== null ||
    tx.requested.condition !== null ||
    tx.context.role !== PLAYER_CHOICE_AUTHORITY.role ||
    tx.context.permission !== PLAYER_CHOICE_AUTHORITY.permission
  )
    return fail("TRANSACTION_NOT_THE_OBSERVATION_TRIGGER", txId);
  if (tx.engaged.length > 0 || tx.boundaries_crossed.length > 0)
    return fail("TRANSACTION_ENGAGES_OBJECT_OR_BOUNDARY", txId);
  if (
    tx.outcome.stop_reason !== "TARGET_REACHED" ||
    tx.outcome.remainder !== null ||
    tx.outcome.unresolved_dependents.length > 0
  )
    return fail("TRANSACTION_NOT_TARGET_REACHED_CLOSED", txId);
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
      return fail(
        "CLOCK_NOT_ONE_BASIS",
        `${t.unit}:${t.value} vs ${event.established_at.unit}:${event.established_at.value}`,
      );
  const only = tx.stages.length === 1 ? tx.stages[0]! : null;
  if (only === null || !canonicalEqual(only.stage, stage))
    return fail("TRANSACTION_STAGE_NOT_THE_PACKET_FORMATION", txId);
  if (
    transactionFact.provenance.group_id !== transactionGroupId(txId) ||
    transactionFact.provenance.intent_id !== transactionIntentId(txId)
  )
    return fail("TRANSACTION_NOT_UNDER_ITS_DERIVED_IDENTITY", transactionFact.provenance.group_id);
  const sealC = view.committed(transactionFact.provenance.group_id);
  if (
    sealC.group.group_id === formation.group.group_id ||
    sealC.group.group_id === authorityGroupId
  )
    return fail("SEAL_NOT_ITS_OWN_GROUP", sealC.group.group_id);
  if (sealC.receipt.revision <= formation.receipt.revision)
    return fail(
      "TRANSACTION_NOT_SEALED_AFTER_FORMATION",
      `${sealC.receipt.revision} <= ${formation.receipt.revision}`,
    );
  if (
    sealC.group.cause !== transactionCause(txId) ||
    !canonicalEqual(sealC.group.authority, CANON_WRITE_AUTHORITY) ||
    !canonicalEqual(sealC.group.rule, factKind("temporal_state").rule) ||
    !canonicalEqual(sealC.group.reads, [
      { key: TEMPORAL_STATE_KEY, version: tx.opening.state_version },
      { key: authorityKey, version: authorityFact.version },
    ]) ||
    !sealC.group.depends_on.includes(authorityGroupId) ||
    !sealC.group.depends_on.includes(formationGroupId) ||
    !sealC.group.writes.some((w) => w.key === TEMPORAL_STATE_KEY)
  )
    return fail("SEAL_GROUP_NOT_THE_KERNEL_SEAL", sealC.group.group_id);
  // the seal repeats exactly what the durable authority opened, and is published under the labels it carries
  if (
    authority.data.transaction_id !== tx.transaction_id ||
    authority.data.cause !== tx.cause ||
    authority.data.continues !== tx.continues ||
    !canonicalEqual(authority.data.trigger, tx.trigger) ||
    !canonicalEqual(authority.data.opening, tx.opening) ||
    !canonicalEqual(authority.data.requested, tx.requested) ||
    !canonicalEqual(authority.data.context, tx.context) ||
    authority.data.publication.basis !== transactionFact.basis ||
    authority.data.publication.secrecy !== transactionFact.secrecy ||
    authority.data.publication.basis !== authorityFact.basis ||
    authority.data.publication.secrecy !== authorityFact.secrecy
  )
    return fail("AUTHORITY_NOT_WHAT_THE_SEAL_REPEATS", txId);
  // the realized stage: this group, this intent, this receipt revision and canonical hash, these reads and these writes
  if (
    only.group_id !== formationGroupId ||
    only.intent_id !== formation.group.intent_id ||
    only.revision !== formation.receipt.revision ||
    only.group_sha256 !== formation.receipt.group_sha256
  )
    return fail("TRANSACTION_NOT_LINKED_TO_THE_COMMITTED_GROUP", txId);
  const recorded = only.writes.map((w) => `${w.key}@${w.version}`);
  const actual = formation.group.writes.map((w) => `${w.key}@${w.expected_version + 1}`);
  if (!canonicalEqual(recorded, actual))
    return fail("TRANSACTION_WRITES_NOT_THE_FORMATION", recorded.join("|"));
  const realized = declaration.reads.map((r) => ({
    ...r,
    source_basis: { version: eventFact.version, committed_by: eventFact.provenance.group_id },
  }));
  if (
    !canonicalEqual(only.reads, realized) ||
    only.reads.length !== formation.group.reads.length ||
    only.reads.some(
      (r, i) =>
        r.source.fact_key !== formation.group.reads[i]!.key ||
        r.source_basis.version !== formation.group.reads[i]!.version ||
        r.source_basis.committed_by !== formation.group.depends_on[i],
    )
  )
    return fail("TRANSACTION_STAGE_READS_NOT_REALIZED", txId);
  if (
    !canonicalEqual(
      only.validation.invariants,
      formation.receipt.invariants.map((i) => i.name),
    )
  )
    return fail("TRANSACTION_VALIDATION_NOT_THE_RECEIPT", txId);
  // the owner's own statement of what an observation transaction is, as the final gate over every explicit check above
  const ownerWhy = observationTransactionViolation(tx, eventFact);
  if (ownerWhy !== null) return fail("OWNER_TRANSACTION_REFUSED", ownerWhy);
  return { ok: true, code: "NATIVE_RECEIPT_COMMITTED", detail: `cut ${cut}` };
}

// ---------------------------------------------------------------------------------------------
// Labelled forgeries (read-only overlays), for the falsifier twins ONLY
// ---------------------------------------------------------------------------------------------

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
    /** patch fields of the receipt recorded under an intent (a foreign or displaced receipt) */
    readonly receipts?: Readonly<Record<string, Partial<CommitReceipt>>>;
    /** replace ONLY the group the intent index returns for an intent, so it disagrees with the group-by-id read */
    readonly indexGroups?: Readonly<Record<string, CommitGroup | null>>;
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
    committedGroup: (i) =>
      over.indexGroups && i in over.indexGroups
        ? (over.indexGroups[i] ?? null)
        : groupOf(store.committedGroup(i)),
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
      if (r === null) return r;
      const rev = over.revisions?.[intent];
      const patched = over.receipts?.[intent];
      return rev === undefined && patched === undefined
        ? r
        : { ...r, ...(patched ?? {}), ...(rev === undefined ? {} : { revision: rev }) };
    },
  };
}

/**
 * A SELF-CONSISTENT forgery of one committed GROUP, as a read-only overlay: `mutate` rewrites the group, its receipt's canonical hash,
 * recorded rule and authority are recomputed to match, and every fact the real group wrote carries the rewritten group's cause and rule as
 * its provenance. So the strict group/receipt layer passes and ONLY the layer under test can refuse.
 */
export function forgeGroupConsistently(
  store: ReadOnlyStore,
  groupId: string,
  mutate: (group: CommitGroup) => void,
  extra: Parameters<typeof overlayStore>[1] = {},
): ReadOnlyStore {
  const real = store.committedGroupById?.(groupId) ?? null;
  const receipt = real === null ? null : store.lookupReceipt(real.intent_id);
  if (real === null || receipt === null)
    throw new Error(`no such committed group to forge: ${groupId}`);
  const group = structuredClone(real);
  mutate(group);
  const facts: Record<string, OwnerFact | null> = { ...(extra.facts ?? {}) };
  for (const w of real.writes) {
    const fact = store.getFact(w.key);
    if (fact === undefined || fact.provenance.group_id !== groupId) continue;
    const copy = structuredClone(fact);
    copy.provenance.cause = group.cause;
    copy.provenance.rule = group.rule;
    facts[w.key] = copy;
  }
  return overlayStore(store, {
    ...extra,
    facts,
    groups: { ...(extra.groups ?? {}), [groupId]: group },
    receipts: {
      ...(extra.receipts ?? {}),
      [real.intent_id]: {
        group_sha256: sha256Canonical(group),
        basis: { ...receipt.basis, rule: group.rule, authority: group.authority },
      },
    },
  });
}

/**
 * A SELF-CONSISTENT forgery of single records, as a read-only overlay: each listed fact is rewritten by `mutate`, the committed group that
 * wrote it is rewritten to carry exactly that fact (value, unit, basis, secrecy, owner, facet, expected version) and its receipt's canonical
 * hash is recomputed. So the strict group/receipt layer passes and ONLY the layer under test can refuse. (A forged record that is NOT
 * consistent with its own group or receipt is refused by that strict layer, which has its own twins.)
 */
export function forgeConsistently(
  store: ReadOnlyStore,
  forgeries: ReadonlyArray<readonly [key: string, mutate: (fact: OwnerFact) => void]>,
  extra: Parameters<typeof overlayStore>[1] = {},
): ReadOnlyStore {
  const facts: Record<string, OwnerFact | null> = { ...(extra.facts ?? {}) };
  const groups: Record<string, CommitGroup | null> = { ...(extra.groups ?? {}) };
  const receipts: Record<string, Partial<CommitReceipt>> = { ...(extra.receipts ?? {}) };
  for (const [key, mutate] of forgeries) {
    const real = store.getFact(key);
    if (real === undefined) throw new Error(`no such fact to forge: ${key}`);
    const fact = structuredClone(real);
    mutate(fact);
    facts[key] = fact;
    // the group that REALLY wrote the fact is the one rewritten to match it, even when the forgery names another group in its provenance
    const gid = real.provenance.group_id;
    const base = groups[gid] ?? store.committedGroupById?.(gid) ?? null;
    if (base === null) continue;
    const group = structuredClone(base);
    group.writes = group.writes.map((w) =>
      w.key !== key
        ? w
        : {
            ...w,
            owner: fact.owner,
            facet: fact.facet,
            value: fact.value,
            unit: fact.unit,
            basis: fact.basis,
            secrecy: fact.secrecy,
            expected_version: fact.version - 1,
          },
    );
    groups[gid] = group;
    receipts[group.intent_id] = {
      ...(receipts[group.intent_id] ?? {}),
      group_sha256: sha256Canonical(group),
    };
  }
  return overlayStore(store, { ...extra, facts, groups, receipts });
}
