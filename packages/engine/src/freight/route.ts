import type { CommitGroup } from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { engagedBoundaryViolation } from "../logistics/admission.ts";
import type { Rejection } from "../owners/rejection.ts";
import { economyFreightGroupCheck, writesEconomyFreightKind } from "./economy.ts";
import { gipFreightGroupCheck, writesGipFreightKind } from "./gip.ts";
import { logisticsFreightGroupCheck, writesLogisticsFreightKind } from "./logistics.ts";
import { productionFreightGroupCheck, writesProductionFreightKind } from "./production.ts";
import { isWorldFreightFacet, worldFreightGroupCheck } from "./world.ts";

/**
 * The single IM-11 route of the ROADBED first freight profile. A group that writes at least one first-profile kind is judged
 * ONLY by the rule of the owner that owns it — each owner module states its own derivation once and admission re-derives the
 * group from committed state — and every other group falls through (`undefined`) to the predecessor owner rules, which are
 * unchanged. Key-space exclusivity, strict values and identity were already enforced for every write before this runs.
 *
 *   World-State  attestation · site condition · typed governing premise with its class head
 *   GIP          constitutive basis · addressable clauses · legal readiness seal
 *   Production   material specification · dedicated input lot (with its Reserve)
 *   Economy      C-05 · C-06 (E0/E2) · C-07 withdrawal-pending · C · E1 · ER (an IM-02 stage) · AD
 *   Logistics    service basis · L0 · F2 unused release · L1/F3 first dispatch (delivery and retirement remain the IM-02 stages)
 */
export function freightGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null | undefined {
  if (group.owner === "world_state" && isWorldFreightFacet(group.facet))
    return worldFreightGroupCheck(group, state);
  if (writesGipFreightKind(group)) return gipFreightGroupCheck(group, state);
  if (writesProductionFreightKind(group)) return productionFreightGroupCheck(group, state);
  if (writesEconomyFreightKind(group))
    return economyFreightGroupCheck(group, state, engagedBoundaryViolation);
  if (writesLogisticsFreightKind(group)) return logisticsFreightGroupCheck(group, state);
  return undefined;
}
