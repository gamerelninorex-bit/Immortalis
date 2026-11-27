import { workshopStageGroup } from "./publication.ts";
// World-State is the sole owner of notice enrolment, reservation and occurrence.
import type { WorkshopHistoryRef } from "./generation.ts";
import {
  FACET_WORLD_LOCUS,
  GmWaitByPcIndexSchema,
  GmWaitMarkerSchema,
  GmWaitStoredTransactionSchema,
  GmWaitTransactionAuthoritySchema,
  OWNER_WORLD_STATE,
  gmWaitIndexIsTerminal,
  temporalGmWaitByPcKey,
  temporalGmWaitMarkerKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  timeAtOrBefore,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  WorkshopNoticeEnrolmentSchema,
  WorkshopNoticeReservationSchema,
  WORKSHOP_NOTICE_CLASS,
  workshopEnrolmentKey,
  workshopOccurrenceKey,
  workshopReservationKey,
  type WorkshopNoticeBinding,
  type WorkshopNoticeEnrolment,
} from "../../../../contracts/src/workshop-opening.ts";
import type { WorkshopRecipientSource } from "./epistemic-notice.ts";
import type { WorkshopOfficeRevocationSource } from "./gip-direction.ts";
import { gmWaitTransactionId } from "../../gm-wait-identity.ts";
import { sha256Canonical } from "../../hash.ts";
import type { CampaignStore } from "../../persistence/store.ts";
import { stageGroupId, stageIntentId, transactionCause } from "../../temporal/identity.ts";
import {
  workshopClock,
  workshopGroup,
  workshopMatches,
  workshopPolicy,
  workshopRef,
  workshopView,
  type WorkshopView,
} from "./publication.ts";
import { WORKSHOP_NOTICE_RULE } from "./source.ts";
import {
  workshopBoundaryProof,
  workshopNoticeBoundary,
  workshopNoticePresentBasis,
} from "./notice-qualification.ts";

export const WORKSHOP_OCCURRENCE_OPERATION = "world-state-occur-addressed-notice";
export const workshopNoticeStage = (b: WorkshopNoticeBinding) => ({
  causal_process_id: `local-addressed-notice:${b.x}`,
  owner_operation: { owner: OWNER_WORLD_STATE, operation: WORKSHOP_OCCURRENCE_OPERATION },
  prospective_result_id: `occurrence:${b.notice_id}`,
});

/**
 * The protected, read-only C54 and R-6 source route. The owner receives this
 * dependency at construction, never from a request envelope or a commit field.
 * A composed verifier must reproduce these results at their original cuts.
 */
export interface WorkshopNoticeSource {
  readonly verificationId: string;
  readonly revocationSource?: WorkshopOfficeRevocationSource;
  readonly recipientSource?: WorkshopRecipientSource;
  prepare(
    view: WorkshopView,
    x: string,
    dutyKey: string,
  ):
    | {
        readonly rootRequestSha256: string;
        readonly proposalSha256: string;
        readonly t0WitnessSha256: string;
        readonly refs: readonly OwnerFact[];
      }
    | undefined;
  atBoundary(view: WorkshopView, binding: WorkshopNoticeBinding): readonly OwnerFact[] | undefined;
}

function currentWitnesses(view: WorkshopView, witnesses: readonly OwnerFact[]): boolean {
  return witnesses.every((f) => workshopMatches(view.get(f.key), workshopRef(f)));
}

function absentReads(group: CommitGroup, keys: readonly string[]): CommitGroup {
  return { ...group, reads: [...group.reads, ...keys.map((key) => ({ key, version: 0 }))] };
}

export function deriveNoticeEnrolment(
  view: WorkshopView,
  x: string,
  dutyKey: string,
  historyId: WorkshopHistoryRef,
  source: WorkshopNoticeSource | undefined,
): CommitGroup | undefined {
  const present = workshopNoticePresentBasis(view, dutyKey);
  const clock = workshopClock(view);
  const evidence = source?.prepare(view, x, dutyKey);
  if (
    !present ||
    !clock ||
    !evidence ||
    evidence.refs.length === 0 ||
    !currentWitnesses(view, evidence.refs)
  )
    return undefined;
  const { pc, d, duty, presence, operation, noticeId, acceptanceKey } = present;
  const key = workshopEnrolmentKey(pc.worldId, pc.locusId, x);
  const slotKey = workshopReservationKey(view.campaign_id, pc.pc);
  const markerKey = temporalGmWaitMarkerKey(x);
  const indexKey = temporalGmWaitByPcKey(pc.pc);
  const index = view.get(indexKey);
  const indexValue = GmWaitByPcIndexSchema.safeParse(index?.value);
  const prior = view.get(slotKey);
  const slot = WorkshopNoticeReservationSchema.safeParse(prior?.value);
  const occurrenceKey = workshopOccurrenceKey(pc.worldId, pc.locusId, noticeId);
  if (
    view.get(key) ||
    view.get(markerKey) ||
    view.get(occurrenceKey) ||
    (index && (!indexValue.success || !gmWaitIndexIsTerminal(indexValue.data.state))) ||
    (prior &&
      (!slot.success ||
        !["SETTLED_NOT_OCCURRED", "ABORTED_BEFORE_MARKER"].includes(slot.data.state.status)))
  )
    return undefined;

  const binding: WorkshopNoticeBinding = {
    schema_version: 1,
    class: WORKSHOP_NOTICE_CLASS,
    campaign_id: view.campaign_id,
    x,
    notice_id: noticeId,
    world_id: pc.worldId,
    locus_id: pc.locusId,
    attendant_id: d.attendant_id,
    pc_id: pc.pc,
    pc_binding: workshopRef(pc.binding),
    world: workshopRef(pc.world),
    locus: workshopRef(pc.locus),
    cue_operation: workshopRef(operation),
    acceptance_key: acceptanceKey,
    duty: workshopRef(duty),
    report: "COMPLETION_CONFIRMED",
    root_request_sha256: evidence.rootRequestSha256,
    proposal_sha256: evidence.proposalSha256,
    t0_witness_sha256: evidence.t0WitnessSha256,
    policy: workshopPolicy(WORKSHOP_NOTICE_RULE, historyId),
  };
  const value: WorkshopNoticeEnrolment = {
    binding,
    admitted: { at: clock.at, journal_revision: view.revision },
    state: { status: "PENDING" },
  };
  const group = workshopGroup(
    view,
    WORKSHOP_NOTICE_RULE,
    OWNER_WORLD_STATE,
    FACET_WORLD_LOCUS,
    [
      { key, expected_version: 0, value },
      {
        key: slotKey,
        expected_version: prior?.version ?? 0,
        value: {
          schema_version: 1,
          campaign_id: view.campaign_id,
          pc_id: pc.pc,
          x,
          notice_id: noticeId,
          enrolment_key: key,
          binding_sha256: sha256Canonical(binding),
          state: value.state,
        },
      },
    ],
    [
      clock.fact,
      pc.binding,
      pc.host,
      pc.placement,
      pc.world,
      pc.locus,
      duty,
      presence,
      operation,
      ...evidence.refs,
      ...(index ? [index] : []),
      ...(prior ? [prior] : []),
    ],
  );
  return absentReads(group, [markerKey, occurrenceKey, ...(index ? [] : [indexKey])]);
}

function pending(view: WorkshopView, key: string) {
  const enrolment = view.get(key);
  const e = WorkshopNoticeEnrolmentSchema.safeParse(enrolment?.value);
  if (!enrolment || !e.success || e.data.state.status !== "PENDING") return undefined;
  const b = e.data.binding;
  const slot = view.get(workshopReservationKey(b.campaign_id, b.pc_id));
  const s = WorkshopNoticeReservationSchema.safeParse(slot?.value);
  if (
    !slot ||
    !s.success ||
    s.data.state.status !== "PENDING" ||
    s.data.x !== b.x ||
    s.data.enrolment_key !== key ||
    s.data.notice_id !== b.notice_id ||
    s.data.binding_sha256 !== sha256Canonical(b)
  )
    return undefined;
  return { enrolment, e: e.data, slot, s: s.data, b };
}

type NoticeState = WorkshopNoticeEnrolment["state"];
const advanceWrites = (p: NonNullable<ReturnType<typeof pending>>, state: NoticeState) => [
  { key: p.enrolment.key, expected_version: p.enrolment.version, value: { ...p.e, state } },
  { key: p.slot.key, expected_version: p.slot.version, value: { ...p.s, state } },
];

export function deriveNoticeOccurrence(
  view: WorkshopView,
  key: string,
  source: WorkshopNoticeSource | undefined,
) {
  const p = pending(view, key);
  if (!p) return undefined;
  const { b } = p;
  const tx = gmWaitTransactionId(b.x);
  const marker = view.get(temporalGmWaitMarkerKey(b.x));
  const m = GmWaitMarkerSchema.safeParse(marker?.value);
  const index = view.get(temporalGmWaitByPcKey(b.pc_id));
  const idx = GmWaitByPcIndexSchema.safeParse(index?.value);
  const opened = view.get(temporalTransactionAuthorityKey(tx));
  const a = GmWaitTransactionAuthoritySchema.safeParse(opened?.value);
  if (
    !marker ||
    !m.success ||
    !index ||
    !idx.success ||
    idx.data.state !== "OPEN" ||
    idx.data.x !== b.x ||
    !opened ||
    !a.success ||
    a.data.x !== b.x ||
    m.data.initial_request_sha256 !== b.root_request_sha256 ||
    m.data.preparation.kind !== "OWNER_PENDING_ENROLMENT" ||
    m.data.preparation.fact.key !== p.enrolment.key ||
    m.data.preparation.fact.version !== p.enrolment.version ||
    m.data.preparation.digest !== sha256Canonical(p.e) ||
    view.get(temporalTransactionKey(tx))
  )
    return undefined;
  const witnesses = source?.atBoundary(view, b);
  const verdict = workshopNoticeBoundary(view, b);
  if (
    !witnesses ||
    witnesses.length === 0 ||
    !currentWitnesses(view, witnesses) ||
    verdict.status !== "DUE" ||
    !a.data.requested.target ||
    !timeAtOrBefore(verdict.at, a.data.requested.target) ||
    verdict.completion.provenance.cause !== transactionCause(tx) ||
    verdict.acceptance.provenance.cause !== transactionCause(tx)
  )
    return undefined;
  const occurrenceKey = workshopOccurrenceKey(b.world_id, b.locus_id, b.notice_id);
  const boundary = {
    production_completion: workshopRef(verdict.completion),
    custodian_acceptance: workshopRef(verdict.acceptance),
  };
  const proof = sha256Canonical([workshopBoundaryProof(verdict), ...witnesses.map(workshopRef)]);
  const next: NoticeState =
    verdict.failed === null
      ? { status: "OCCURRED", occurrence_key: occurrenceKey, at: verdict.at }
      : {
          status: "INELIGIBLE_AT_BOUNDARY",
          boundary,
          at: verdict.at,
          failed: verdict.failed,
          proof_sha256: proof,
        };
  const writes = advanceWrites(p, next);
  const construction = {
    schema_version: b.schema_version,
    class: b.class,
    x: b.x,
    notice_id: b.notice_id,
    campaign_id: b.campaign_id,
    world_id: b.world_id,
    locus_id: b.locus_id,
    attendant_id: b.attendant_id,
    pc_id: b.pc_id,
    at: verdict.at,
    enrolment_pending: workshopRef(p.enrolment),
    reservation_pending: workshopRef(p.slot),
    ...boundary,
    duty: b.duty,
    locus_and_route_refs: witnesses.map(workshopRef),
    actor_access_sha256: proof,
    report: b.report,
    policy: b.policy,
  };
  const group = workshopGroup(
    view,
    WORKSHOP_NOTICE_RULE,
    OWNER_WORLD_STATE,
    FACET_WORLD_LOCUS,
    verdict.failed
      ? writes
      : [...writes, { key: occurrenceKey, expected_version: 0, value: construction }],
    [
      p.enrolment,
      p.slot,
      marker,
      index,
      opened,
      verdict.completion,
      verdict.acceptance,
      ...verdict.witnesses,
      ...witnesses,
    ],
  );
  const stage = workshopNoticeStage(b);
  return workshopStageGroup(
    {
      ...group,
      group_id: stageGroupId(stage),
      intent_id: stageIntentId(stage),
      cause: transactionCause(tx),
    },
    view,
    p.enrolment,
    p.slot,
    opened,
  );
}

export function deriveNoticeSettlement(view: WorkshopView, key: string, abort: boolean) {
  const p = pending(view, key);
  if (!p) return undefined;
  const { b } = p;
  const markerKey = temporalGmWaitMarkerKey(b.x);
  const indexKey = temporalGmWaitByPcKey(b.pc_id);
  const tx = gmWaitTransactionId(b.x);
  const authorityKey = temporalTransactionAuthorityKey(tx);
  const sealKey = temporalTransactionKey(tx);
  const occurrenceKey = workshopOccurrenceKey(b.world_id, b.locus_id, b.notice_id);
  if (view.get(occurrenceKey)) return undefined;
  const marker = view.get(markerKey);
  const index = view.get(indexKey);
  const idx = GmWaitByPcIndexSchema.safeParse(index?.value);
  const pins = [p.enrolment, p.slot, ...(index ? [index] : [])];
  if (abort) {
    if (
      marker ||
      view.get(authorityKey) ||
      view.get(sealKey) ||
      (index && (!idx.success || idx.data.x === b.x || !gmWaitIndexIsTerminal(idx.data.state)))
    )
      return undefined;
    return absentReads(
      workshopGroup(
        view,
        WORKSHOP_NOTICE_RULE,
        OWNER_WORLD_STATE,
        FACET_WORLD_LOCUS,
        advanceWrites(p, {
          status: "ABORTED_BEFORE_MARKER",
          absence: { marker_key: markerKey, version: 0 },
        }),
        pins,
      ),
      [markerKey, authorityKey, sealKey, occurrenceKey, ...(index ? [] : [indexKey])],
    );
  }
  if (
    !marker ||
    !index ||
    !idx.success ||
    idx.data.x !== b.x ||
    !gmWaitIndexIsTerminal(idx.data.state)
  )
    return undefined;

  const seal = view.get(sealKey);
  const sealed = GmWaitStoredTransactionSchema.safeParse(seal?.value);
  const terminal =
    idx.data.state === "NO_OPEN" && !seal && !view.get(authorityKey)
      ? marker
      : idx.data.state === "SEALED_RECONCILED" && sealed.success && sealed.data.x === b.x
        ? seal
        : undefined;
  if (!terminal) return undefined;
  // A completion with no occurrence requires disposition by the due stage, not
  // the no-occurrence path. Missing distinct stage evidence retains the slot.
  const operationId = b.cue_operation.key.split("/").at(-1);
  if (!operationId || view.get(`production/completion/${operationId}`)) return undefined;
  return absentReads(
    workshopGroup(
      view,
      WORKSHOP_NOTICE_RULE,
      OWNER_WORLD_STATE,
      FACET_WORLD_LOCUS,
      advanceWrites(p, { status: "SETTLED_NOT_OCCURRED", terminal: workshopRef(terminal) }),
      [...pins, marker, terminal],
    ),
    [occurrenceKey, `production/completion/${operationId}`],
  );
}

export class WorkshopNoticeAdapter {
  readonly #store: CampaignStore;
  readonly #historyId: WorkshopHistoryRef;
  readonly #source: WorkshopNoticeSource | undefined;

  constructor(store: CampaignStore, historyId: WorkshopHistoryRef, source?: WorkshopNoticeSource) {
    this.#store = store;
    this.#historyId = historyId;
    this.#source = source;
  }

  enrol(x: string, dutyKey: string) {
    const group = deriveNoticeEnrolment(
      workshopView(this.#store),
      x,
      dutyKey,
      this.#historyId,
      this.#source,
    );
    return group ? this.#store.commit(group) : undefined;
  }
  occur(enrolmentKey: string) {
    const group = deriveNoticeOccurrence(workshopView(this.#store), enrolmentKey, this.#source);
    return group ? this.#store.commit(group) : undefined;
  }
  settle(enrolmentKey: string, abortBeforeMarker: boolean) {
    const group = deriveNoticeSettlement(
      workshopView(this.#store),
      enrolmentKey,
      abortBeforeMarker,
    );
    return group ? this.#store.commit(group) : undefined;
  }
}
