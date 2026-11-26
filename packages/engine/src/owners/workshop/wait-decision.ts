import {
  AccessiblePacketSchema,
  AccessEventSchema,
  GmWaitByPcIndexSchema,
  GmWaitMarkerSchema,
  GmWaitStagedTransactionSchema,
  OWNER_EPISTEMIC_ACCESS,
  PLAYER_CHOICE_AUTHORITY,
  ResolutionTransactionSchema,
  Sha256,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  TransactionAuthoritySchema,
  accessEventKey,
  accessPacketKey,
  temporalGmWaitByPcKey,
  temporalGmWaitMarkerKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  timeEquals,
  z,
  type CommitGroup,
  type GmWaitStagedTransaction,
} from "@immortalis/contracts";
import {
  WorkshopFactRefSchema,
  WorkshopNoticeEnrolmentSchema,
  WorkshopNoticeOccurrenceSchema,
} from "../../../../contracts/src/workshop-opening.ts";
import { gmWaitTransactionId } from "../../gm-wait-identity.ts";
import { canonicalEqual } from "../../hash.ts";
import type { CampaignStore } from "../../persistence/store.ts";
import { TemporalCoordinator } from "../../temporal/coordinator.ts";
import { IF6B_RESUME_TRIGGER } from "../../temporal/if6b-stage.ts";
import { workshopHost } from "./glassbell.ts";
import { workshopRef, workshopView, type WorkshopView } from "./publication.ts";

const OpportunitySchema = z.strictObject({
  x: Sha256,
  campaign: z.string().min(1),
  pc: z.string().min(1),
  seal: WorkshopFactRefSchema,
  clock: WorkshopFactRefSchema,
  binding: WorkshopFactRefSchema,
  packet: WorkshopFactRefSchema,
});

export const WorkshopChoiceSchema = z.strictObject({
  purpose: z.literal("CONTINUE_INTERRUPTED_WORKSHOP_WAIT"),
  opportunity: OpportunitySchema,
  choice: z.literal("CONTINUE"),
  confirmation: Sha256,
});
export type WorkshopChoice = z.infer<typeof WorkshopChoiceSchema>;

/** The trusted source retrieves an authenticated original player message by its immutable identity. */
export interface WorkshopChoiceSource {
  readonly verificationId: string;
  read(ref: string): WorkshopChoice | undefined;
}

function opportunity(view: WorkshopView, seal: GmWaitStagedTransaction) {
  if (seal.outcome.stop_reason !== "INTERRUPTED") return undefined;
  const host = workshopHost(view);
  const sealFact = view.get(temporalTransactionKey(seal.transaction_id));
  const clock = view.get(TEMPORAL_STATE_KEY);
  const current = TemporalStateSchema.safeParse(clock?.value);
  const marker = GmWaitMarkerSchema.safeParse(view.get(temporalGmWaitMarkerKey(seal.x))?.value);
  if (
    !host ||
    !sealFact ||
    !clock ||
    !current.success ||
    !marker.success ||
    host.pc !== marker.data.pc_id ||
    current.data.continuation?.from_transaction !== seal.transaction_id ||
    !timeEquals(current.data.canonical_time, seal.outcome.actual_stop) ||
    !current.data.continuation.toward ||
    !timeEquals(current.data.continuation.toward, seal.outcome.remainder.to)
  )
    return undefined;
  const slot = GmWaitByPcIndexSchema.safeParse(view.get(temporalGmWaitByPcKey(host.pc))?.value);
  if (
    !slot.success ||
    slot.data.x !== seal.x ||
    slot.data.state !== "SEALED_RECONCILED" ||
    slot.data.sealed_result.group_id !== sealFact.provenance.group_id
  )
    return undefined;
  const enrolled = WorkshopNoticeEnrolmentSchema.safeParse(
    view.get(marker.data.preparation.fact.key)?.value,
  );
  if (!enrolled.success || enrolled.data.state.status !== "OCCURRED") return undefined;
  const occurrence = view.get(enrolled.data.state.occurrence_key);
  const event = WorkshopNoticeOccurrenceSchema.safeParse(occurrence?.value);
  if (
    !occurrence ||
    !event.success ||
    event.data.pc_id !== host.pc ||
    occurrence.provenance.group_id !== seal.outcome.interruption.occurrence_group_id ||
    !timeEquals(event.data.at, seal.outcome.actual_stop)
  )
    return undefined;
  const id = "workshop-notice:" + event.data.notice_id;
  const receipt = view.get(accessEventKey(id));
  const recorded = AccessEventSchema.safeParse(receipt?.value);
  const packet = view.get(accessPacketKey(id, host.pc));
  const accessible = AccessiblePacketSchema.safeParse(packet?.value);
  if (
    !receipt ||
    !recorded.success ||
    !packet ||
    !accessible.success ||
    receipt.owner !== OWNER_EPISTEMIC_ACCESS ||
    packet.owner !== receipt.owner ||
    packet.provenance.group_id !== receipt.provenance.group_id ||
    recorded.data.source.fact_key !== occurrence.key ||
    recorded.data.source.version !== occurrence.version ||
    accessible.data.recipient !== host.pc ||
    !timeEquals(accessible.data.access.established_at, seal.outcome.actual_stop)
  )
    return undefined;
  return {
    basis: {
      x: seal.x,
      campaign: view.campaign_id,
      pc: host.pc,
      seal: workshopRef(sealFact),
      clock: workshopRef(clock),
      binding: workshopRef(host.binding),
      packet: workshopRef(packet),
    },
    packet: accessible.data,
  };
}

export function workshopDecisionOpportunity(view: WorkshopView, x: string) {
  const seal = GmWaitStagedTransactionSchema.safeParse(
    view.get(temporalTransactionKey(gmWaitTransactionId(x)))?.value,
  );
  return seal.success ? opportunity(view, seal.data) : undefined;
}

function readChoice(source: WorkshopChoiceSource | undefined, ref: string) {
  if (!Sha256.safeParse(ref).success) return undefined;
  const choice = WorkshopChoiceSchema.safeParse(source?.read(ref));
  return choice.success ? choice.data : undefined;
}

function resumeRequest(x: string, ref: string) {
  return {
    transaction_id: "workshop-resume:" + x,
    cause: "player:workshop-resume:" + ref,
    trigger: { kind: IF6B_RESUME_TRIGGER, ref },
    context: PLAYER_CHOICE_AUTHORITY,
    publication: { basis: "workshop-player-choice", secrecy: "sealed" },
  };
}

export function verifyWorkshopResume(
  view: WorkshopView,
  group: CommitGroup,
  seal: GmWaitStagedTransaction,
  source: WorkshopChoiceSource | undefined,
): boolean {
  const write = group.writes.find(
    (w) =>
      w.key.startsWith(temporalTransactionKey("")) ||
      w.key.startsWith(temporalTransactionAuthorityKey("")),
  );
  if (!write) return false;
  const opening = TransactionAuthoritySchema.safeParse(write.value);
  const closing = ResolutionTransactionSchema.safeParse(write.value);
  if (!opening.success && !closing.success) return false;
  const tx = opening.success ? opening.data : closing.data!;
  const request = resumeRequest(seal.x, tx.trigger.ref);
  const decision = readChoice(source, tx.trigger.ref);
  const at = opportunity(view, seal);
  return (
    !!at &&
    !!decision &&
    canonicalEqual(decision.opportunity, at.basis) &&
    tx.transaction_id === request.transaction_id &&
    tx.cause === request.cause &&
    canonicalEqual(tx.trigger, request.trigger) &&
    canonicalEqual(tx.context, request.context) &&
    canonicalEqual(
      opening.success ? opening.data.publication : { basis: write.basis, secrecy: write.secrecy },
      request.publication,
    ) &&
    seal.outcome.stop_reason === "INTERRUPTED" &&
    tx.continues === seal.transaction_id &&
    canonicalEqual(tx.requested, { target: seal.outcome.remainder.to, condition: null })
  );
}

/** The engine commits only the original player's separately confirmed choice for this durable cut. */
export async function resumeWorkshopWait(
  store: CampaignStore,
  coordinator: TemporalCoordinator,
  x: string,
  ref: string,
  source: WorkshopChoiceSource | undefined,
) {
  const view = workshopView(store);
  const choice = readChoice(source, ref);
  if (!choice || choice.opportunity.x !== x || choice.opportunity.campaign !== view.campaign_id)
    return undefined;
  const request = resumeRequest(x, ref);
  const prior = coordinator.transaction(request.transaction_id)?.value;
  if (prior)
    return prior.continues === gmWaitTransactionId(x) && prior.trigger.ref === ref
      ? coordinator.advance({ ...request, continues: prior.continues, requested: prior.requested })
      : undefined;
  const available = workshopDecisionOpportunity(view, x);
  if (!available || !canonicalEqual(available.basis, choice.opportunity)) return undefined;
  return coordinator.continueRemainder(request);
}
