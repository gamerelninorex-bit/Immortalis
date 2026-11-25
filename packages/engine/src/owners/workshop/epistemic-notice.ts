import { workshopSealedCut } from "./lane-x.ts";
// Epistemic Access owns the one bounded recipient event and its packet.
import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessEventSchema,
  JsonValueSchema,
  GmWaitByPcIndexSchema,
  temporalGmWaitByPcKey,
  timeEquals,
  PcCapabilitySchema,
  FACET_EPISTEMIC_ACCESS,
  MODE_BOUNDED_SHARED_ACCESS,
  OWNER_EPISTEMIC_ACCESS,
  RECIPIENT_ROLE_PLAYER_CHARACTER,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  WorkshopNoticeEnrolmentSchema,
  workshopEnrolmentKey,
  WorkshopNoticeOccurrenceSchema,
  WorkshopSensoryCloseSchema,
  workshopCloseKey,
  type WorkshopNoticeBinding,
} from "../../../../contracts/src/workshop-opening.ts";
import { sha256Canonical } from "../../hash.ts";
import { EPISTEMIC_ACCESS_RULE } from "../registry.ts";
import type { CampaignStore } from "../../persistence/store.ts";
import { stageGroupId, stageIntentId } from "../../temporal/identity.ts";
import {
  workshopMatches,
  workshopGroup,
  workshopRef,
  workshopView,
  type WorkshopView,
} from "./publication.ts";
import { workshopHost } from "./glassbell.ts";
import { deriveAccessProducts, type CapabilityCloseRead } from "../../epistemic/derive.ts";

export const WORKSHOP_RECEIVE_NOTICE = "epistemic-receive-addressed-notice";

export interface WorkshopRecipientSource {
  /** Independently qualified delivery and representation at the same event cut. */
  recipient(
    view: WorkshopView,
    occurrence: OwnerFact,
  ):
    | {
        readonly witnesses: readonly OwnerFact[];
        readonly capability: CapabilityCloseRead | null;
      }
    | undefined;
}

export function workshopReceiptStage(e: Pick<WorkshopNoticeBinding, "x" | "notice_id" | "pc_id">) {
  return {
    causal_process_id: `local-addressed-notice:${e.x}`,
    owner_operation: { owner: OWNER_EPISTEMIC_ACCESS, operation: WORKSHOP_RECEIVE_NOTICE },
    prospective_result_id: `receipt:${sha256Canonical([e.notice_id, e.x, e.pc_id])}`,
  };
}

export function deriveWorkshopReceipt(
  view: WorkshopView,
  occurrenceKey: string,
  source: WorkshopRecipientSource | undefined,
) {
  const occurrence = view.get(occurrenceKey);
  const event = WorkshopNoticeOccurrenceSchema.safeParse(occurrence?.value);
  const host = workshopHost(view);
  if (!occurrence || !event.success || !host || event.data.pc_id !== host.pc) return undefined;
  const e = event.data;
  const settled = workshopSealedCut(view, host.pc, e.x);
  const enrolment = view.get(workshopEnrolmentKey(e.world_id, e.locus_id, e.x));
  const enrolled = WorkshopNoticeEnrolmentSchema.safeParse(enrolment?.value);
  const wait = view.get(temporalGmWaitByPcKey(host.pc));
  const index = GmWaitByPcIndexSchema.safeParse(wait?.value);
  if (
    !enrolment ||
    !enrolled.success ||
    enrolled.data.state.status !== "OCCURRED" ||
    enrolled.data.state.occurrence_key !== occurrence.key ||
    !wait ||
    !index.success ||
    index.data.x !== e.x ||
    index.data.state !== "OPEN" ||
    !settled ||
    !settled.settlement.stages.some((s) => s.group_id === occurrence.provenance.group_id)
  )
    return undefined;
  const close = view.get(
    workshopCloseKey(
      host.pc,
      sha256Canonical([view.campaign_id, occurrence.key, host.host.key, "AUDITORY"]),
    ),
  );
  const audited = WorkshopSensoryCloseSchema.safeParse(close?.value);
  if (
    !close ||
    !audited.success ||
    audited.data.result !== "AVAILABLE" ||
    !workshopMatches(occurrence, audited.data.notice_occurrence) ||
    !workshopMatches(host.binding, audited.data.pc_binding) ||
    !workshopMatches(host.host, audited.data.host_ref) ||
    !timeEquals(audited.data.through.at, e.at)
  )
    return undefined;
  const authority = source?.recipient(view, occurrence);
  if (
    !authority ||
    authority.witnesses.length === 0 ||
    !authority.witnesses.every((f) => workshopMatches(view.get(f.key), workshopRef(f)))
  )
    return undefined;
  const capability = authority.capability && view.get(authority.capability.fact.key);
  const cap = PcCapabilitySchema.safeParse(capability?.value);
  if (
    authority.capability &&
    (!capability ||
      !cap.success ||
      capability.version !== authority.capability.fact.version ||
      capability.provenance.group_id !== authority.capability.committed_by ||
      !authority.witnesses.some((f) => f.key === capability.key))
  )
    return undefined;
  const eventId = `workshop-notice:${e.notice_id}`;
  if (view.get(accessEventKey(eventId))) return undefined;
  const value = AccessEventSchema.parse({
    event_id: eventId,
    mode: MODE_BOUNDED_SHARED_ACCESS,
    participants: [host.pc],
    source: { owner: occurrence.owner, fact_key: occurrence.key, version: occurrence.version },
    channel: "SPEECH",
    established_at: e.at,
    payload: {
      referent: "workshop job",
      content: "The workshop job's output has been accepted into custody here.",
      presented_attribution: null,
    },
    representation: authority.capability
      ? { capability_id: authority.capability.fact.value.capability_id }
      : null,
    recipient_role: RECIPIENT_ROLE_PLAYER_CHARACTER,
  });
  const eventKey = accessEventKey(eventId);
  const products = deriveAccessProducts({
    event: { key: eventKey, owner: OWNER_EPISTEMIC_ACCESS, version: 1, value },
    capability:
      capability && cap.success
        ? {
            committed_by: capability.provenance.group_id,
            fact: {
              key: capability.key,
              owner: capability.owner,
              version: capability.version,
              value: cap.data,
            },
          }
        : null,
  });
  if (!products.ok) return undefined;
  const writes = [
    { key: eventKey, value: JsonValueSchema.parse(value), expected_version: 0 },
    {
      key: accessPacketKey(eventId, host.pc),
      value: JsonValueSchema.parse(products.value.packet),
      expected_version: 0,
    },
    {
      key: accessProvenanceKey(eventId, host.pc),
      value: JsonValueSchema.parse(products.value.provenance),
      expected_version: 0,
    },
  ];
  const plan = workshopGroup(
    view,
    EPISTEMIC_ACCESS_RULE,
    OWNER_EPISTEMIC_ACCESS,
    FACET_EPISTEMIC_ACCESS,
    writes,
    [occurrence, close, enrolment, wait, host.host, host.binding, ...authority.witnesses],
  );
  const stage = workshopReceiptStage(e);
  return {
    ...plan,
    group_id: stageGroupId(stage),
    intent_id: stageIntentId(stage),
    cause: plan.cause,
    writes: plan.writes.map((w, i) => ({
      ...w,
      secrecy: i === 1 ? ACCESS_CLASS_ACTOR_ACCESSIBLE : ACCESS_CLASS_ENGINE_SEALED,
    })),
  };
}

export function publishWorkshopReceipt(
  store: CampaignStore,
  occurrenceKey: string,
  source?: WorkshopRecipientSource,
) {
  const group = deriveWorkshopReceipt(workshopView(store), occurrenceKey, source);
  return group ? store.commit(group) : undefined;
}
