// World-State reads original occurrence premises at the causal cut.
import {
  ActorPhysicalPresenceSchema,
  DurableCompletionEnvelopeSchema,
  FallbackPhysicalEntitySchema,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  PcPhysicalLocusCustodySchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  ProductionOperationSchema,
  actorPhysicalPresenceKey,
  productionCompletionKey,
  z,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  WorkshopDutySchema,
  WorkshopInstructionSchema,
  WORKSHOP_NOTICE_CLASS,
  workshopOccurrenceKey,
  type WorkshopNoticeBinding,
} from "../../../../contracts/src/workshop-opening.ts";
import { canonicalEqual, sha256Canonical } from "../../hash.ts";
import { workshopInstructionValidity } from "./gip-direction.ts";
import { workshopHost } from "./glassbell.ts";
import { workshopMatches, workshopRef, type WorkshopView } from "./publication.ts";

export const workshopNoticeId = (campaign: string, pc: string, operationKey: string) =>
  sha256Canonical([WORKSHOP_NOTICE_CLASS, campaign, pc, operationKey]);

const PresentOperationSchema = z.object({
  operation_id: ProductionOperationSchema.shape.operation_id,
  status: ProductionOperationSchema.shape.status,
  transformation: z.object({ output: ProductionOperationSchema.shape.transformation.shape.output }),
});
export function workshopNoticePresentBasis(view: WorkshopView, dutyKey: string) {
  const duty = view.get(dutyKey);
  const d = WorkshopDutySchema.safeParse(duty?.value);
  const pc = workshopHost(view);
  if (
    !duty ||
    !d.success ||
    !pc ||
    d.data.campaign_id !== view.campaign_id ||
    d.data.intended_pc_id !== pc.pc ||
    d.data.locus_id !== pc.locusId ||
    d.data.world_id !== pc.worldId ||
    !workshopMatches(pc.binding, d.data.pc_binding) ||
    workshopInstructionValidity(view, d.data.issued_instruction) !== "VALID"
  )
    return undefined;
  const presence = view.get(actorPhysicalPresenceKey(d.data.attendant_id));
  const p = ActorPhysicalPresenceSchema.safeParse(presence?.value);
  const operation = view.get(d.data.production_operation.key);
  // Read the already validated status and conserved identity without consulting
  // completion timing or any Temporal object or index.
  const op = PresentOperationSchema.safeParse(operation?.value);
  if (
    !presence ||
    !p.success ||
    !workshopMatches(operation, d.data.production_operation) ||
    !op.success ||
    op.data.status.state !== "IN_PROGRESS" ||
    p.data.actor_id !== d.data.attendant_id ||
    p.data.world.fact_key !== pc.world.key ||
    p.data.locus.fact_key !== pc.locus.key
  )
    return undefined;
  const noticeId = workshopNoticeId(view.campaign_id, pc.pc, operation.key);
  const acceptanceKey = worldFallbackEntityKey(pc.worldId, op.data.transformation.output.reference);
  return { duty, d: d.data, pc, presence, operation, noticeId, acceptanceKey };
}

export type WorkshopBoundaryVerdict =
  | { readonly status: "UNRESOLVED" }
  | {
      readonly status: "DUE";
      readonly completion: OwnerFact;
      readonly acceptance: OwnerFact;
      readonly witnesses: readonly OwnerFact[];
      readonly failed: "C1" | "C2" | "C3" | "C4" | null;
      readonly at: import("@immortalis/contracts").CanonicalTime;
    };

export function workshopNoticeBoundary(
  view: WorkshopView,
  binding: WorkshopNoticeBinding,
): WorkshopBoundaryVerdict {
  const unresolved = { status: "UNRESOLVED" } as const;
  const duty = view.get(binding.duty.key);
  const d = WorkshopDutySchema.safeParse(duty?.value);
  const operation = view.get(binding.cue_operation.key);
  const op = ProductionOperationSchema.safeParse(operation?.value);
  if (
    !workshopMatches(duty, binding.duty) ||
    !d.success ||
    !operation ||
    !op.success ||
    operation.owner !== OWNER_PRODUCTION ||
    op.data.status.state !== "COMPLETED" ||
    d.data.attendant_id !== binding.attendant_id ||
    d.data.intended_pc_id !== binding.pc_id ||
    binding.notice_id !==
      workshopNoticeId(view.campaign_id, binding.pc_id, binding.cue_operation.key)
  )
    return unresolved;
  const completion = view.get(productionCompletionKey(op.data.operation_id));
  const acceptance = view.get(binding.acceptance_key);
  const c = DurableCompletionEnvelopeSchema.safeParse(completion?.value);
  const a = FallbackPhysicalEntitySchema.safeParse(acceptance?.value);
  if (
    !completion ||
    !acceptance ||
    !c.success ||
    !a.success ||
    completion.owner !== OWNER_PRODUCTION ||
    acceptance.owner !== OWNER_WORLD_STATE ||
    c.data.operation_id !== op.data.operation_id ||
    c.data.destination_custodian.entity_fact_key !== acceptance.key ||
    c.data.conserved_reference !== a.data.entity_id ||
    a.data.accepted_from.fact_key !== completion.key ||
    a.data.accepted_from.version !== completion.version ||
    a.data.accepted_from.operation_id !== c.data.operation_id ||
    !canonicalEqual(c.data.locality, a.data.locality) ||
    c.data.locality.world.fact_key !== binding.world.key ||
    c.data.locality.locus.fact_key !== binding.locus.key ||
    !canonicalEqual(c.data.completed_at, op.data.timing.completion.at)
  )
    return unresolved;

  const presence = view.get(actorPhysicalPresenceKey(binding.attendant_id));
  const p = ActorPhysicalPresenceSchema.safeParse(presence?.value);
  const pcBinding = view.get(PLAYER_CHARACTER_BINDING_KEY);
  const b = PlayerCharacterBindingSchema.safeParse(pcBinding?.value);
  const custody = view.get(worldPcLocusCustodyKey(binding.pc_id));
  const pc = PcPhysicalLocusCustodySchema.safeParse(custody?.value);
  const instruction = view.get(d.data.issued_instruction.key);
  const i = WorkshopInstructionSchema.safeParse(instruction?.value);
  if (
    !presence ||
    !p.success ||
    !pcBinding ||
    !b.success ||
    !custody ||
    !pc.success ||
    !instruction ||
    !i.success
  )
    return unresolved;
  const witnesses = [duty, operation, presence, pcBinding, custody, instruction];
  let instructionEnded = i.data.lifecycle_status === "terminated";
  for (const past of [
    i.data.charter,
    i.data.office,
    i.data.scope,
    i.data.attendant_post,
    i.data.attendant_existence,
  ]) {
    const current = view.get(past.key);
    if (!current) return unresolved;
    witnesses.push(current);
    if (!workshopMatches(current, past)) instructionEnded = true;
  }

  const occurrence = view.get(
    workshopOccurrenceKey(binding.world_id, binding.locus_id, binding.notice_id),
  );
  if (occurrence) witnesses.push(occurrence);
  const failed = instructionEnded
    ? "C1"
    : p.data.world.fact_key !== binding.world.key || p.data.locus.fact_key !== binding.locus.key
      ? "C2"
      : !workshopMatches(pcBinding, binding.pc_binding) ||
          b.data.active_pc.entity_id !== binding.pc_id ||
          pc.data.stationary_locus.world.fact_key !== binding.world.key ||
          pc.data.stationary_locus.locus.fact_key !== binding.locus.key
        ? "C3"
        : occurrence
          ? "C4"
          : null;
  return { status: "DUE", completion, acceptance, witnesses, failed, at: c.data.completed_at };
}

export function workshopBoundaryProof(
  verdict: Extract<WorkshopBoundaryVerdict, { status: "DUE" }>,
) {
  return sha256Canonical([
    workshopRef(verdict.completion),
    workshopRef(verdict.acceptance),
    verdict.at,
    verdict.failed,
    ...verdict.witnesses.map(workshopRef),
  ]);
}
