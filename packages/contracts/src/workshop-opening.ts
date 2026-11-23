import { z } from "zod";
import { Id, Revision, Sha256, Version } from "./ids.ts";
import { SourceRefSchema } from "./source-ref.ts";
import { CanonicalTimeSchema } from "./temporal.ts";

export const WorkshopEntityId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
export const WorkshopFactRefSchema = z.strictObject({
  owner: Id,
  facet: Id,
  key: Id,
  version: Version.min(1),
  group_id: Id,
});
export type WorkshopFactRef = z.infer<typeof WorkshopFactRefSchema>;
export const WorkshopBasisSchema = z.strictObject({
  at: CanonicalTimeSchema,
  journal_revision: Revision,
});
export const WorkshopPolicySchema = z.strictObject({
  source_rule_ref: SourceRefSchema,
  history_verification_id: Id,
  catalogue_sha256: Sha256,
});
export const WORKSHOP_SECOND = "b3-qualification-in-world-second-v1";
export const WORKSHOP_MONITOR = "MONITOR_ACCEPTED_COMPLETION";
export const WORKSHOP_DISCLOSURE = "COMPLETION_CONFIRMED_TO_DESIGNATED_PC";
export const WORKSHOP_NOTICE_CLASS = "LOCAL_SOURCE_ADDRESSED_NOTICE_V1";
export const OWNER_HEALTH = "health";
export const FACET_HEALTH_CONDITION_PROCESS = "health_condition_process";
export const FACET_GIP_COMPLETION_DIRECTION = "gip_local_completion_direction";
export const HEALTH_GLASSBELL_RECOVERY = "health-retire-glassbell-condition";

const ref = WorkshopFactRefSchema;
const basis = WorkshopBasisSchema;
const policy = WorkshopPolicySchema;
const base = { schema_version: z.literal(1), campaign_id: WorkshopEntityId, policy };
const noticeScope = {
  access_scope: z.literal(WORKSHOP_MONITOR),
  disclosure_scope: z.literal(WORKSHOP_DISCLOSURE),
};
const governanceRefs = {
  order: ref,
  institution: ref,
  office: ref,
  scope: ref,
  world: ref,
  locus: ref,
  attendant_existence: ref,
  attendant_post: ref,
  designated_pc_binding: ref,
  production_operation: ref,
  validity_by_order: z.tuple([
    z.strictObject({ governing_order_ref: ref, validity_status: z.literal("valid") }),
  ]),
};
export const WorkshopCharterSchema = z.strictObject({
  ...base,
  ...governanceRefs,
  profile_pin_sha256: Sha256,
  opening_basis: ref,
  power: z.literal("ISSUE_ONE_STANDING_COMPLETION_DIRECTION"),
  operative_effect: z.literal("authority_grant"),
  lifecycle_status: z.literal("active"),
  adopted_at: basis,
});
const instructionCommon = {
  ...base,
  ...governanceRefs,
  ...noticeScope,
  institution_id: WorkshopEntityId,
  office_id: WorkshopEntityId,
  instruction_id: Sha256,
  holder: WorkshopEntityId,
  charter: ref,
  operative_effect: z.literal("administrative_direction"),
  issued: basis,
};
export const WorkshopInstructionSchema = z.discriminatedUnion("lifecycle_status", [
  z.strictObject({ ...instructionCommon, lifecycle_status: z.literal("active") }),
  z.strictObject({
    ...instructionCommon,
    lifecycle_status: z.literal("terminated"),
    revoking_act_sha256: Sha256,
  }),
]);

export const WorkshopDutySchema = z.strictObject({
  ...base,
  ...noticeScope,
  duty_id: Sha256,
  attendant_id: WorkshopEntityId,
  attendant_existence: ref,
  issued_instruction: ref,
  issuer: z.strictObject({
    issuer_id: WorkshopEntityId,
    authority: ref,
    supporting_scope: z.array(ref),
  }),
  world_id: WorkshopEntityId,
  locus_id: WorkshopEntityId,
  locus: ref,
  production_operation: ref,
  intended_pc_id: WorkshopEntityId,
  pc_binding: ref,
  issued: basis,
  admitted: basis,
  lifetime: z.strictObject({ consumption: z.literal("ONE_MATCHING_OCCURRENCE"), source_terms: ref }),
  acceptance_basis: z.literal("SEEDED_STANDING_POST_DUTY"),
  profile_pin_sha256: Sha256,
});

const host = { ...base, pc_id: WorkshopEntityId, host_ref: ref };
export const WorkshopGlassbellExposureSchema = z.strictObject({
  ...host,
  world: ref,
  locus: ref,
  pc_binding: ref,
  placement: ref,
  at: basis,
  world_condition: z.literal("GLASSBELL_FIELD_V1"),
});
export const WorkshopConditionSchema = z.strictObject({
  ...host,
  custodian_ref: ref,
  condition_id: Sha256,
  cause: ref,
  progression_rule: SourceRefSchema,
  at: basis,
  source_inputs: z.array(ref),
  previous_version: Version,
  state: z.discriminatedUnion("status", [
    z.strictObject({ status: z.literal("ACTIVE"), effect: z.literal("HEARING_FUNCTION_LIMITATION") }),
    z.strictObject({ status: z.literal("RETIRED"), recovery_at: CanonicalTimeSchema }),
  ]),
});
export const WorkshopCoverageAnchorSchema = z.strictObject({
  ...host,
  custodian_ref: ref,
  pc_binding: ref,
  modality: z.literal("AUDITORY"),
  anchor_id: Sha256,
  starts: basis,
  condition_baseline: z.array(ref),
  source_inventory: z.array(ref),
});
export const WorkshopCoverageSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("COMPLETE"),
    anchor: ref,
    from_revision: Revision,
    to_revision: Revision,
    segment_chain_sha256: Sha256,
    relevant_condition_refs: z.array(ref),
  }),
  z.strictObject({
    status: z.literal("INCOMPLETE"),
    anchor: ref.nullable(),
    reason: z.enum([
      "NO_ANCHOR",
      "LATE_ANCHOR",
      "GAP",
      "SOURCE_UNVERIFIED",
      "HOST_OR_POLICY_CONFLICT",
      "CONDITION_UNRESOLVED",
    ]),
  }),
]);
export const WorkshopSensoryCloseSchema = z.strictObject({
  ...host,
  pc_binding: ref,
  modality: z.literal("AUDITORY"),
  notice_occurrence: ref,
  notice_id: Sha256,
  scope_start: CanonicalTimeSchema,
  through: basis,
  close_stamp: Sha256,
  coverage: WorkshopCoverageSchema,
  result: z.enum(["AVAILABLE", "IMPAIRED", "UNKNOWN"]),
});

const noticeIdentity = {
  schema_version: z.literal(1),
  class: z.literal(WORKSHOP_NOTICE_CLASS),
  campaign_id: WorkshopEntityId,
  x: Sha256,
  notice_id: Sha256,
  world_id: WorkshopEntityId,
  locus_id: WorkshopEntityId,
  attendant_id: WorkshopEntityId,
  pc_id: WorkshopEntityId,
  report: z.literal("COMPLETION_CONFIRMED"),
  policy,
};
export const WorkshopNoticeBindingSchema = z.strictObject({
  ...noticeIdentity,
  pc_binding: ref,
  world: ref,
  locus: ref,
  cue_operation: ref,
  acceptance_key: Id,
  duty: ref,
  root_request_sha256: Sha256,
  proposal_sha256: Sha256,
  t0_witness_sha256: Sha256,
});
const lifecycle = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("PENDING") }),
  z.strictObject({ status: z.literal("OCCURRED"), occurrence_key: Id, at: CanonicalTimeSchema }),
  z.strictObject({ status: z.literal("SETTLED_NOT_OCCURRED"), terminal: ref }),
  z.strictObject({
    status: z.literal("ABORTED_BEFORE_MARKER"),
    absence: z.strictObject({ marker_key: Id, version: z.literal(0) }),
  }),
  z.strictObject({
    status: z.literal("INELIGIBLE_AT_BOUNDARY"),
    boundary: z.strictObject({ production_completion: ref, custodian_acceptance: ref }),
    at: CanonicalTimeSchema,
    failed: z.enum(["C1", "C2", "C3", "C4"]),
    proof_sha256: Sha256,
  }),
]);
export const WorkshopNoticeEnrolmentSchema = z.strictObject({
  binding: WorkshopNoticeBindingSchema,
  admitted: basis,
  state: lifecycle,
});
export const WorkshopNoticeReservationSchema = z.strictObject({
  schema_version: z.literal(1),
  campaign_id: WorkshopEntityId,
  pc_id: WorkshopEntityId,
  x: Sha256,
  notice_id: Sha256,
  enrolment_key: Id,
  binding_sha256: Sha256,
  state: lifecycle,
});
export const WorkshopNoticeOccurrenceSchema = z.strictObject({
  ...noticeIdentity,
  at: CanonicalTimeSchema,
  enrolment_pending: ref,
  reservation_pending: ref,
  production_completion: ref,
  custodian_acceptance: ref,
  duty: ref,
  locus_and_route_refs: z.array(ref),
  actor_access_sha256: Sha256,
});

export type WorkshopCharter = z.infer<typeof WorkshopCharterSchema>;
export type WorkshopInstruction = z.infer<typeof WorkshopInstructionSchema>;
export type WorkshopDuty = z.infer<typeof WorkshopDutySchema>;
export type WorkshopCondition = z.infer<typeof WorkshopConditionSchema>;
export type WorkshopCoverageAnchor = z.infer<typeof WorkshopCoverageAnchorSchema>;
export type WorkshopSensoryClose = z.infer<typeof WorkshopSensoryCloseSchema>;
export type WorkshopGlassbellExposure = z.infer<typeof WorkshopGlassbellExposureSchema>;
export type WorkshopNoticeBinding = z.infer<typeof WorkshopNoticeBindingSchema>;
export type WorkshopNoticeEnrolment = z.infer<typeof WorkshopNoticeEnrolmentSchema>;

export const workshopCharterKey = (campaign: string) => `gip/local-completion-notice/campaign/${campaign}/charter`;
export const workshopInstructionKey = (campaign: string, id: string) =>
  `gip/local-completion-notice/campaign/${campaign}/instruction/${id}`;
export const workshopDutyKey = (actor: string, id: string) => `actor/${actor}/local-notice-duty/${id}`;
export const workshopExposureKey = (world: string, pc: string) => `world/${world}/opening-glassbell-exposure/${pc}`;
export const workshopConditionKey = (pc: string, id: string) => `health/pc/${pc}/condition/${id}`;
export const workshopAnchorKey = (pc: string, id: string) => `health/pc/${pc}/auditory/coverage/${id}`;
export const workshopCloseKey = (pc: string, id: string) => `health/pc/${pc}/auditory/sensory-close/${id}`;
export const workshopEnrolmentKey = (world: string, locus: string, x: string) =>
  `world/${world}/locus/${locus}/addressed-notice/enrolment/${x}`;
export const workshopReservationKey = (campaign: string, pc: string) =>
  `world-state/addressed-notice/campaign/${campaign}/by-pc/${pc}`;
export const workshopOccurrenceKey = (world: string, locus: string, notice: string) =>
  `world/${world}/locus/${locus}/addressed-notice/occurrence/${notice}`;
