import {
  AccessDisseminationEventSchema,
  AccessEventSchema,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_TEMPORAL_KERNEL,
  TemporalObjectSchema,
  WorkshopCharterSchema,
  WorkshopDutySchema,
  WorkshopNoticeEnrolmentSchema,
  WorkshopSensoryCloseSchema,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { deriveWorkshopDuty } from "../actor/local-notice-duty.ts";
import {
  deriveWorkshopCharter,
  deriveWorkshopInstruction,
  deriveWorkshopRevocation,
} from "../gip/completion-direction.ts";
import {
  concernsWorkshopHealth,
  deriveWorkshopAnchor,
  deriveWorkshopClose,
  deriveWorkshopCondition,
  verifyWorkshopRecovery,
  workshopHealthObjectViolation,
} from "../health/workshop-sensory.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey, WORKSHOP_FACT_KINDS } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";
import { deriveWorkshopExposure } from "../world/workshop-glassbell.ts";
import {
  deriveNoticeEnrolment,
  deriveNoticeOccurrence,
  deriveNoticeSettlement,
  type WorkshopNoticeSource,
} from "../world/addressed-notice/publication.ts";
import {
  concernsWorkshopNotice,
  workshopNoticeObjectViolation,
} from "../world/addressed-notice/temporal.ts";
import {
  deriveWorkshopReceipt,
  type WorkshopRecipientSource,
} from "../epistemic/workshop-notice.ts";
import type { WorkshopFixtureIdentity } from "./source.ts";

const kinds = new Set(WORKSHOP_FACT_KINDS.map((kind) => kind.id));

export function workshopGroupCheck(
  group: CommitGroup,
  state: CampaignState,
  profile: WorkshopFixtureIdentity | undefined,
  historyId: string,
  noticeSource?: WorkshopNoticeSource & { readonly recipientSource?: WorkshopRecipientSource },
): Rejection | null | undefined {
  const view = {
    campaign_id: state.campaign_id,
    revision: state.revision,
    get: (key: string) => state.facts.get(key),
  };
  if (
    group.owner === OWNER_EPISTEMIC_ACCESS &&
    group.writes.some((w) => {
      if (w.key.startsWith("access/workshop-notice:")) return true;
      const event = AccessDisseminationEventSchema.safeParse(w.value);
      return (
        event.success &&
        resolveKey(event.data.source.fact_key)?.kind.id === "world_addressed_notice_occurrence"
      );
    })
  ) {
    const e = AccessEventSchema.safeParse(group.writes[0]?.value);
    const expected =
      profile && e.success && state.campaign_id === profile.campaignId
        ? deriveWorkshopReceipt(view, e.data.source.fact_key, noticeSource?.recipientSource)
        : undefined;
    return expected && canonicalEqual(group, expected)
      ? null
      : reject(
          "REFERENCE_INVALID",
          "an addressed workshop receipt requires original occurrence, Health Close and recipient evidence",
        );
  }
  const found = group.writes.find((write) => {
    const kind = resolveKey(write.key)?.kind;
    return kind && kinds.has(kind.id);
  });
  if (!found) return undefined;
  if (!profile || state.campaign_id !== profile.campaignId) {
    return reject(
      "KEY_NOT_ADMITTED",
      "B3 source requires an isolated byte-bound qualification Profile",
      {
        reason: "WORKSHOP_PROFILE_NOT_ADMITTED",
      },
    );
  }
  const kind = resolveKey(found.key)!.kind;
  let expected: CommitGroup | undefined;
  switch (kind.id) {
    case "gip_local_completion_notice_charter": {
      const c = WorkshopCharterSchema.safeParse(found.value);
      if (c.success)
        expected = deriveWorkshopCharter(
          view,
          {
            institution: c.data.institution.key,
            office: c.data.office.key,
            scope: c.data.scope.key,
            world: c.data.world.key,
            locus: c.data.locus.key,
            attendant_existence: c.data.attendant_existence.key,
            attendant_post: c.data.attendant_post.key,
            production_operation: c.data.production_operation.key,
          },
          profile,
          historyId,
        );
      break;
    }
    case "gip_local_completion_notice_instruction":
      expected =
        found.expected_version === 0
          ? deriveWorkshopInstruction(view, historyId)
          : group.cause.startsWith("workshop-revocation:")
            ? deriveWorkshopRevocation(
                view,
                found.key,
                group.cause.slice("workshop-revocation:".length),
                noticeSource?.revocationSource,
              )
            : undefined;
      break;
    case "named_actor_local_notice_duty": {
      const duty = WorkshopDutySchema.safeParse(found.value);
      if (duty.success)
        expected = deriveWorkshopDuty(view, duty.data.issued_instruction.key, profile, historyId);
      break;
    }
    case "world_opening_glassbell_exposure":
      expected = deriveWorkshopExposure(view, profile, historyId);
      break;
    case "health_pc_relevant_condition":
      if (found.expected_version > 0) {
        if (
          group.owner === kind.owner &&
          group.facet === kind.facet &&
          found.owner === kind.owner &&
          found.facet === kind.facet &&
          group.campaign_id === view.campaign_id &&
          canonicalEqual(group.rule, kind.rule) &&
          verifyWorkshopRecovery(group, state)
        )
          return null;
        break;
      }
      expected = deriveWorkshopCondition(view, profile, historyId);
      break;
    case "health_pc_sensory_coverage_anchor":
      expected = deriveWorkshopAnchor(view, profile, historyId);
      break;
    case "world_addressed_notice_enrolment": {
      const parsed = WorkshopNoticeEnrolmentSchema.safeParse(found.value);
      if (!parsed.success) break;
      const e = parsed.data;
      if (e.state.status === "PENDING")
        expected = deriveNoticeEnrolment(
          view,
          e.binding.x,
          e.binding.duty.key,
          historyId,
          noticeSource,
        );
      else if (e.state.status === "OCCURRED" || e.state.status === "INELIGIBLE_AT_BOUNDARY")
        expected = deriveNoticeOccurrence(view, found.key, noticeSource);
      else
        expected = deriveNoticeSettlement(
          view,
          found.key,
          e.state.status === "ABORTED_BEFORE_MARKER",
        );
      break;
    }
    case "health_pc_sensory_function_close": {
      const close = WorkshopSensoryCloseSchema.safeParse(found.value);
      if (close.success)
        expected = deriveWorkshopClose(
          view,
          close.data.notice_occurrence.key,
          close.data.coverage.anchor?.key,
          profile,
          historyId,
        );
      break;
    }
  }
  return expected && canonicalEqual(expected, group)
    ? null
    : reject(
        "REFERENCE_INVALID",
        "B3 owner publication does not match independently committed source",
        { key: found.key },
      );
}

// These native owners have their dedicated object checks below this seam.
// The isolated Profiles do not grant a generic extension owner credit.
const NATIVE_WORKSHOP_TEMPORAL_OWNERS = new Set([
  "production",
  "named_actor",
  "pc_existence",
  "epistemic_access",
  "kti",
  "culture",
  "gip",
  "logistics",
  "diplomacy",
  "world_state",
  "population",
]);

export function workshopTemporalHistoryCheck(
  group: CommitGroup,
  state: CampaignState,
  profile: WorkshopFixtureIdentity | undefined,
) {
  if (group.owner !== OWNER_TEMPORAL_KERNEL) return null;
  for (const write of group.writes) {
    if (resolveKey(write.key)?.kind.id !== "temporal_object") continue;
    const o = TemporalObjectSchema.safeParse(write.value);
    if (!o.success) continue;
    const health = concernsWorkshopHealth(o.data);
    const notice = concernsWorkshopNotice(o.data);
    if (!health && !notice) {
      if (
        profile &&
        write.expected_version === 0 &&
        !NATIVE_WORKSHOP_TEMPORAL_OWNERS.has(o.data.owning_ref.owner)
      )
        return reject(
          "REFERENCE_INVALID",
          "qualification Temporal object owner has no matching validator",
          { key: write.key, reason: "WORKSHOP_OBJECT_OWNER_UNVALIDATED" },
        );
      continue;
    }
    if (!profile || state.campaign_id !== profile.campaignId)
      return reject(
        "KEY_NOT_ADMITTED",
        "B3 Temporal history requires its original qualification Profile",
      );
    const view = {
      campaign_id: state.campaign_id,
      revision: state.revision,
      get: (key: string) => state.facts.get(key),
    };
    const why = health
      ? workshopHealthObjectViolation(o.data, view, write.expected_version === 0)
      : workshopNoticeObjectViolation(o.data, view);
    if (why)
      return reject("REFERENCE_INVALID", why, {
        key: write.key,
        reason: health ? "HEALTH_OBJECT_SOURCE" : "NOTICE_OBJECT_SOURCE",
      });
  }
  return null;
}
