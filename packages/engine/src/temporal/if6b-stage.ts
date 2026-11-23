import {
  FACET_PRODUCTION_STATE,
  FACET_WORLD_LOCUS,
  GmWaitByPcIndexSchema,
  GmWaitMarkerSchema,
  GmWaitTransactionAuthoritySchema,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  PRODUCTION_OPERATION_COMPLETE,
  StageKeySchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  WORLD_OPERATION_ACCEPT_FALLBACK,
  timeAtOrBefore,
  temporalGmWaitByPcKey,
  temporalGmWaitMarkerKey,
  timeEquals,
  type CanonicalTime,
  type CommitGroup,
  type OwnerFact,
  type StageKey,
} from "@immortalis/contracts";
import { groupSha256, type CampaignState } from "../commit/campaign-core.ts";
import { deriveGmWaitFence } from "../gm-wait-custody.ts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";

export const IF6B_POLICY = "F-014B-IF-6b-D2-AD5@2026-11-23T11:42:34.869Z";

export type If6bStageClass = "RH_RECOVERY" | "RH_OCCURRENCE" | "D3_COMPLETION";

type OriginalFact = Pick<OwnerFact, "key" | "version"> & { readonly group_id: string };

/** Returned by the original owner's native admission verifier after independently deriving the proposed commit. */
export interface If6bStageWitness {
  readonly class: If6bStageClass;
  readonly policy: typeof IF6B_POLICY;
  readonly campaign: string;
  readonly pc: string;
  readonly x: string;
  readonly at: CanonicalTime;
  readonly stage: StageKey;
  readonly groupId: string;
  readonly groupDigest: string;
  readonly ownerWriteKey: string;
  readonly reservation: OriginalFact;
  readonly predecessors: readonly OriginalFact[];
}

export interface If6bOwnerVerifier {
  readonly class: If6bStageClass;
  readonly owner: string;
  readonly facet: string;
  readonly operation: string;
  /** The same verifier judges the proposed owner group and original-policy replay against the incremental state. */
  verify(group: CommitGroup, state: CampaignState): If6bStageWitness | undefined;
}

function permitted(source: If6bOwnerVerifier): boolean {
  switch (source.class) {
    case "RH_RECOVERY":
      return (
        source.owner === "health" &&
        source.facet === "health_condition_process" &&
        source.operation === "health-retire-glassbell-condition"
      );
    case "RH_OCCURRENCE":
      return (
        source.owner === OWNER_WORLD_STATE &&
        source.facet === FACET_WORLD_LOCUS &&
        source.operation === "world-state-occur-addressed-notice"
      );
    case "D3_COMPLETION":
      return (
        (source.owner === OWNER_PRODUCTION &&
          source.facet === FACET_PRODUCTION_STATE &&
          source.operation === PRODUCTION_OPERATION_COMPLETE) ||
        (source.owner === OWNER_WORLD_STATE &&
          source.facet === FACET_WORLD_LOCUS &&
          source.operation === WORLD_OPERATION_ACCEPT_FALLBACK)
      );
    default:
      return false;
  }
}

function exactPredecessor(group: CommitGroup, state: CampaignState, ref: OriginalFact): boolean {
  const fact = state.facts.get(ref.key);
  return (
    fact?.version === ref.version &&
    fact.provenance.group_id === ref.group_id &&
    group.reads.some((read) => read.key === ref.key && read.version === ref.version) &&
    group.depends_on.includes(ref.group_id)
  );
}

/**
 * Verify the source side of a stage at the actual OPEN prestate. Registration is construction-time only.
 * This interface does not grant fence admission. A future successor must also install durable stage custody and a
 * corresponding staged settlement policy before it can use a qualified witness to admit a group. The existing
 * W2 zero-stage seal cannot represent it.
 */
export function qualifyIf6bOwnerStage(
  group: CommitGroup,
  state: CampaignState,
  sources: readonly If6bOwnerVerifier[],
): If6bStageWitness | undefined {
  const fence = deriveGmWaitFence(state);
  const active = fence.active;
  if (
    fence.unknown !== null ||
    !active ||
    group.campaign_id !== state.campaign_id ||
    group.cause !== `transaction:${active.transactionId}` ||
    !group.depends_on.includes(active.authorityGroupId)
  )
    return undefined;
  const authority = GmWaitTransactionAuthoritySchema.safeParse(
    state.facts.get(active.authorityKey)?.value,
  );
  const index = GmWaitByPcIndexSchema.safeParse(
    state.facts.get(temporalGmWaitByPcKey(active.pcId))?.value,
  );
  const marker = GmWaitMarkerSchema.safeParse(
    state.facts.get(temporalGmWaitMarkerKey(active.x))?.value,
  );
  const clock = TemporalStateSchema.safeParse(state.facts.get(TEMPORAL_STATE_KEY)?.value);
  if (
    !authority.success ||
    !index.success ||
    index.data.state !== "OPEN" ||
    !marker.success ||
    !clock.success
  )
    return undefined;
  const reservation = marker.data.preparation?.fact;
  if (!reservation || !exactPredecessor(group, state, reservation)) return undefined;
  const reservationFact = state.facts.get(reservation.key);
  if (
    !reservationFact ||
    reservationFact.owner !== marker.data.preparation?.owner ||
    sha256Canonical(reservationFact.value) !== marker.data.preparation.digest
  )
    return undefined;
  const matches: If6bStageWitness[] = [];
  for (const source of sources) {
    if (!permitted(source) || group.owner !== source.owner || group.facet !== source.facet)
      continue;
    const witness = source.verify(group, state);
    if (
      !witness ||
      witness.class !== source.class ||
      witness.policy !== IF6B_POLICY ||
      witness.campaign !== state.campaign_id ||
      witness.pc !== active.pcId ||
      witness.x !== active.x ||
      witness.groupId !== group.group_id ||
      witness.groupDigest !== groupSha256(group) ||
      !canonicalEqual(witness.reservation, reservation) ||
      !timeEquals(witness.at, clock.data.canonical_time) ||
      !timeAtOrBefore(authority.data.opening.basis_time, witness.at) ||
      !timeAtOrBefore(witness.at, authority.data.requested.target)
    )
      continue;
    const parsedStage = StageKeySchema.safeParse(witness.stage);
    if (
      !parsedStage.success ||
      parsedStage.data.owner_operation.owner !== source.owner ||
      parsedStage.data.owner_operation.operation !== source.operation
    )
      continue;
    const sameGroup = group.writes.filter((write) => write.key === witness.ownerWriteKey);
    if (
      sameGroup.length !== 1 ||
      sameGroup[0]?.owner !== source.owner ||
      sameGroup[0].facet !== source.facet
    )
      continue;
    if (
      witness.predecessors.length === 0 ||
      new Set(witness.predecessors.map(({ key }) => key)).size !== witness.predecessors.length ||
      witness.predecessors.some(
        (ref) => ref.group_id === group.group_id || !exactPredecessor(group, state, ref),
      )
    )
      continue;
    matches.push(witness);
  }
  return matches.length === 1 ? matches[0] : undefined;
}
