import {
  FACET_WORLD_LOCUS,
  FACET_ACTOR_PROFILE,
  OWNER_WORLD_STATE,
  OWNER_GIP,
  OWNER_NAMED_ACTOR,
} from "@immortalis/contracts";
import type { FactKind } from "../registry.ts";
import type { WriteAdmission, OwnerRegistry } from "../../commit/campaign-core.ts";
import {
  OWNER_HEALTH,
  FACET_GIP_COMPLETION_DIRECTION,
  FACET_HEALTH_CONDITION_PROCESS,
  WorkshopCharterSchema,
  WorkshopInstructionSchema,
  WorkshopDutySchema,
  WorkshopGlassbellExposureSchema,
  WorkshopConditionSchema,
  WorkshopCoverageAnchorSchema,
  WorkshopSensoryCloseSchema,
  WorkshopNoticeEnrolmentSchema,
  WorkshopNoticeReservationSchema,
  WorkshopNoticeOccurrenceSchema,
} from "../../../../contracts/src/workshop-opening.ts";
import {
  WORKSHOP_CHARTER_RULE,
  WORKSHOP_INSTRUCTION_RULE,
  WORKSHOP_DUTY_RULE,
  WORKSHOP_EXPOSURE_RULE,
  WORKSHOP_CONDITION_RULE,
  WORKSHOP_ANCHOR_RULE,
  WORKSHOP_CLOSE_RULE,
  WORKSHOP_NOTICE_RULE,
} from "./source.ts";

const ID = "([A-Za-z0-9][A-Za-z0-9._:-]*)";
const HEX64 = "([0-9a-f]{64})";
export const WORKSHOP_FACT_KIND_IDS = [
  "gip_local_completion_notice_charter",
  "gip_local_completion_notice_instruction",
  "named_actor_local_notice_duty",
  "world_opening_glassbell_exposure",
  "health_pc_relevant_condition",
  "health_pc_sensory_coverage_anchor",
  "health_pc_sensory_function_close",
  "world_addressed_notice_enrolment",
  "world_addressed_notice_pc_reservation",
  "world_addressed_notice_occurrence",
] as const;
export type WorkshopFactKind = Omit<FactKind, "id"> & {
  readonly id: (typeof WORKSHOP_FACT_KIND_IDS)[number];
};
export const WORKSHOP_FACT_KINDS: readonly WorkshopFactKind[] = [
  {
    id: "gip_local_completion_notice_charter",
    owner: OWNER_GIP,
    facet: FACET_GIP_COMPLETION_DIRECTION,
    im: "IM-06",
    rc: ["RC-02", "RC-07"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^gip/local-completion-notice/campaign/${ID}/charter$`),
    valueSchema: WorkshopCharterSchema,
    rule: WORKSHOP_CHARTER_RULE,
  },
  {
    id: "gip_local_completion_notice_instruction",
    owner: OWNER_GIP,
    facet: FACET_GIP_COMPLETION_DIRECTION,
    im: "IM-06",
    rc: ["RC-02", "RC-07"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^gip/local-completion-notice/campaign/${ID}/instruction/${HEX64}$`),
    valueSchema: WorkshopInstructionSchema,
    rule: WORKSHOP_INSTRUCTION_RULE,
  },
  {
    id: "named_actor_local_notice_duty",
    owner: OWNER_NAMED_ACTOR,
    facet: FACET_ACTOR_PROFILE,
    im: "IM-07",
    rc: ["RC-02", "RC-07"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^actor/${ID}/local-notice-duty/${HEX64}$`),
    valueSchema: WorkshopDutySchema,
    rule: WORKSHOP_DUTY_RULE,
  },
  {
    id: "world_opening_glassbell_exposure",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_LOCUS,
    im: "IM-03",
    rc: ["RC-02", "RC-07"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/opening-glassbell-exposure/${ID}$`),
    valueSchema: WorkshopGlassbellExposureSchema,
    rule: WORKSHOP_EXPOSURE_RULE,
  },
  {
    id: "health_pc_relevant_condition",
    owner: OWNER_HEALTH,
    facet: FACET_HEALTH_CONDITION_PROCESS,
    im: "IM-08",
    rc: ["RC-02", "RC-07"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^health/pc/${ID}/condition/${HEX64}$`),
    valueSchema: WorkshopConditionSchema,
    rule: WORKSHOP_CONDITION_RULE,
  },
  {
    id: "health_pc_sensory_coverage_anchor",
    owner: OWNER_HEALTH,
    facet: FACET_HEALTH_CONDITION_PROCESS,
    im: "IM-08",
    rc: ["RC-02", "RC-07"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^health/pc/${ID}/auditory/coverage/${HEX64}$`),
    valueSchema: WorkshopCoverageAnchorSchema,
    rule: WORKSHOP_ANCHOR_RULE,
  },
  {
    id: "health_pc_sensory_function_close",
    owner: OWNER_HEALTH,
    facet: FACET_HEALTH_CONDITION_PROCESS,
    im: "IM-08",
    rc: ["RC-02", "RC-07"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^health/pc/${ID}/auditory/sensory-close/${HEX64}$`),
    valueSchema: WorkshopSensoryCloseSchema,
    rule: WORKSHOP_CLOSE_RULE,
  },
  {
    id: "world_addressed_notice_enrolment",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_LOCUS,
    im: "IM-03",
    rc: ["RC-02", "RC-07"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^world/${ID}/locus/${ID}/addressed-notice/enrolment/${HEX64}$`),
    valueSchema: WorkshopNoticeEnrolmentSchema,
    rule: WORKSHOP_NOTICE_RULE,
  },
  {
    id: "world_addressed_notice_pc_reservation",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_LOCUS,
    im: "IM-03",
    rc: ["RC-02", "RC-07"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^world-state/addressed-notice/campaign/${ID}/by-pc/${ID}$`),
    valueSchema: WorkshopNoticeReservationSchema,
    rule: WORKSHOP_NOTICE_RULE,
  },
  {
    id: "world_addressed_notice_occurrence",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_LOCUS,
    im: "IM-03",
    rc: ["RC-02", "RC-07"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/locus/${ID}/addressed-notice/occurrence/${HEX64}$`),
    valueSchema: WorkshopNoticeOccurrenceSchema,
    rule: WORKSHOP_NOTICE_RULE,
  },
];

/** Draft-only recognition. The ordinary registry never resolves one of these keys. */
export function resolveWorkshopKey(key: string): WorkshopFactKind | undefined {
  if (
    !/^(?:gip\/local-completion-notice\/|actor\/[^/]+\/local-notice-duty\/|world\/[^/]+\/(?:opening-glassbell-exposure\/|locus\/[^/]+\/addressed-notice\/)|world-state\/addressed-notice\/|health\/pc\/)/.test(
      key,
    )
  )
    return undefined;
  return WORKSHOP_FACT_KINDS.find((kind) => kind.keyPattern.test(key));
}

/** The marker can only be carried by the trusted fixture admission. */
const workshopAdmission = Symbol("fixture workshop registry");
export function withWorkshopRegistry(
  admission: WriteAdmission,
  campaignId: string,
): WriteAdmission {
  return Object.assign(admission, { [workshopAdmission]: campaignId });
}

export function workshopCampaignFor(admission: WriteAdmission | undefined): string | undefined {
  return (admission as (WriteAdmission & { readonly [workshopAdmission]?: string }) | undefined)?.[
    workshopAdmission
  ];
}

export function withWorkshopOwners(native: OwnerRegistry): OwnerRegistry {
  const owners = new Map(native);
  for (const kind of WORKSHOP_FACT_KINDS) {
    owners.set(kind.owner, new Set([...(owners.get(kind.owner) ?? []), kind.facet]));
  }
  return owners;
}
