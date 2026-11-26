// World-State declares the Temporal object earned by an original notice enrolment.
import {
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  ProductionOperationSchema,
  READ_MODE_NOW,
  productionCompletionKey,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  WorkshopNoticeEnrolmentSchema,
  workshopOccurrenceKey,
  workshopReservationKey,
} from "../../../../contracts/src/workshop-opening.ts";
import { canonicalEqual } from "../../hash.ts";
import { workshopMatches, type WorkshopView } from "./publication.ts";
import { WORKSHOP_OCCURRENCE_OPERATION, workshopNoticeStage } from "./notice-publication.ts";

export function workshopNoticeTemporalObject(
  enrolment: OwnerFact,
  operation: OwnerFact,
): TemporalObject | undefined {
  const e = WorkshopNoticeEnrolmentSchema.safeParse(enrolment.value);
  const p = ProductionOperationSchema.safeParse(operation.value);
  if (
    !e.success ||
    !p.success ||
    !workshopMatches(operation, e.data.binding.cue_operation) ||
    e.data.state.status !== "PENDING" ||
    p.data.status.state !== "IN_PROGRESS"
  )
    return undefined;
  const b = e.data.binding;
  const reads = [
    { owner: OWNER_PRODUCTION, fact_key: productionCompletionKey(p.data.operation_id) },
    { owner: OWNER_WORLD_STATE, fact_key: b.acceptance_key },
  ];
  return {
    object_id: `obj-workshop-notice-${b.x}`,
    owning_ref: { owner: OWNER_WORLD_STATE, process_id: enrolment.key },
    last_resolved_basis: e.data.admitted.at,
    partition: { class: "EXACT-PARTITION" },
    next_boundary: { boundary_id: `workshop-notice-${b.x}`, at: p.data.timing.completion.at },
    dependencies: [
      {
        stage: workshopNoticeStage(b),
        reads: reads.map((source) => ({
          mode: READ_MODE_NOW,
          source,
          invalidators: [{ fact_key: source.fact_key }],
        })),
        produces: [
          enrolment.key,
          workshopReservationKey(b.campaign_id, b.pc_id),
          workshopOccurrenceKey(b.world_id, b.locus_id, b.notice_id),
        ],
        declares_close: null,
      },
    ],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: reads.map(({ fact_key }) => ({ fact_key })),
    information_latency: { creates_epistemic_interruption: false },
  };
}

export function concernsWorkshopNotice(object: TemporalObject) {
  return (
    object.object_id.startsWith("obj-workshop-notice-") ||
    object.owning_ref.process_id.includes("/addressed-notice/enrolment/") ||
    object.dependencies.some(
      ({ stage }) => stage.owner_operation.operation === WORKSHOP_OCCURRENCE_OPERATION,
    )
  );
}

export function workshopNoticeObjectViolation(object: TemporalObject, view: WorkshopView) {
  const enrolment = view.get(object.owning_ref.process_id);
  const e = WorkshopNoticeEnrolmentSchema.safeParse(enrolment?.value);
  const operation = e.success ? view.get(e.data.binding.cue_operation.key) : undefined;
  const expected =
    enrolment && operation ? workshopNoticeTemporalObject(enrolment, operation) : undefined;
  return expected && canonicalEqual(expected, object)
    ? null
    : "World-State event Temporal object must match the original committed notice enrolment and operation";
}
