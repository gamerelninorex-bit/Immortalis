import {
  BoundaryIndexSchema,
  FACET_PRODUCTION_STATE,
  GM_WAIT_IF6B_POLICY,
  FACET_WORLD_LOCUS,
  GmWaitByPcIndexSchema,
  GmWaitMarkerSchema,
  GmWaitTransactionAuthoritySchema,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  PRODUCTION_OPERATION_COMPLETE,
  StageKeySchema,
  TEMPORAL_STATE_KEY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  compareTime,
  temporalObjectKey,
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
  type StageRecord,
  type SourceRef,
} from "@immortalis/contracts";
import { groupSha256, type CampaignState } from "../commit/campaign-core.ts";
import { deriveGmWaitFence, type GmWaitFence } from "../gm-wait-custody.ts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { stageGroupId, stageIntentId } from "./identity.ts";

export const IF6B_POLICY = GM_WAIT_IF6B_POLICY;

export type If6bStageClass =
  "RH_RECOVERY" | "RH_OCCURRENCE" | "D3_COMPLETION" | "FIXTURE_ECONOMY_DRAFT";

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
    case "FIXTURE_ECONOMY_DRAFT":
      return (
        source.owner === "economy" &&
        source.facet === "economy_state" &&
        source.operation === "economy-record-realized-access"
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
 * The common fence adds the indexed declaration and the durable stage ordering before using this result.
 */
export function qualifyIf6bOwnerStage(
  group: CommitGroup,
  state: CampaignState,
  sources: readonly If6bOwnerVerifier[],
  fence = deriveGmWaitFence(state),
  earnedAt?: CanonicalTime,
): If6bStageWitness | undefined {
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
      !timeEquals(witness.at, earnedAt ?? clock.data.canonical_time) ||
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

export interface If6bAdmission {
  readonly ownerVerifiers: readonly If6bOwnerVerifier[];
  readonly fixtureEconomyDraft?: true;
  readonly preparation: (
    marker: import("@immortalis/contracts").GmWaitMarker,
    state: CampaignState,
  ) => boolean;
}

interface HistoryAdmission {
  readonly historyVerificationId?: string;
}
const if6bPolicy = Symbol("IF-6b fixture admission");
type Registered = HistoryAdmission & { readonly [if6bPolicy]?: If6bAdmission };

/** Only a constructed fixture admission with a separate replay identity can install the draft route. */
export function installIf6b<T extends HistoryAdmission>(admission: T, policy: If6bAdmission): T {
  if (!admission.historyVerificationId?.endsWith("+" + IF6B_POLICY))
    throw new Error("IF-6b needs its own historical verifier identity");
  return Object.assign(admission, {
    [if6bPolicy]: Object.freeze({
      ...policy,
      ownerVerifiers: Object.freeze([...policy.ownerVerifiers]),
    }),
  });
}

export function if6bAdmissionOf(admission: HistoryAdmission | undefined) {
  return (admission as Registered | undefined)?.[if6bPolicy];
}

export interface If6bCommittedStage {
  readonly at: CanonicalTime;
  readonly record: StageRecord;
  readonly rule: SourceRef;
}

export function if6bDueObjects(state: CampaignState, target: CanonicalTime) {
  const index = BoundaryIndexSchema.safeParse(state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)?.value);
  return (index.success ? index.data.entries : [])
    .filter((e) => timeAtOrBefore(e.at, target))
    .map((entry) => {
      const fact = state.facts.get(temporalObjectKey(entry.object_id));
      const object = TemporalObjectSchema.safeParse(fact?.value);
      return { entry, fact, object: object.success ? object.data : undefined };
    });
}

/** The exact indexed declaration, current source reads and prior durable stages qualify before the owner commits. */
export function if6bStageFor(
  group: CommitGroup,
  state: CampaignState,
  fence: GmWaitFence,
  admission: HistoryAdmission | undefined,
): If6bStageWitness | undefined {
  const runtime = if6bAdmissionOf(admission);
  const x = fence.active;
  if (!runtime || !x || fence.unknown !== null || group.cause !== "transaction:" + x.transactionId)
    return undefined;
  const marker = GmWaitMarkerSchema.safeParse(state.facts.get(temporalGmWaitMarkerKey(x.x))?.value);
  const authority = GmWaitTransactionAuthoritySchema.safeParse(
    state.facts.get(x.authorityKey)?.value,
  );
  if (
    !authority.success ||
    !marker.success ||
    marker.data.policy.history_verification_id !== admission?.historyVerificationId
  )
    return undefined;

  const due = if6bDueObjects(state, authority.data.requested.target);
  const declarations = due.flatMap(({ entry, object }) =>
    (object?.dependencies ?? []).map((decl) => ({ entry, decl })),
  );
  const exact = declarations.filter(
    ({ decl }) =>
      stageGroupId(decl.stage) === group.group_id && stageIntentId(decl.stage) === group.intent_id,
  );
  const match = exact[0];
  const credited = (stage: StageKey) =>
    fence.stages?.some((s) => canonicalEqual(s.record.stage, stage)) === true;
  if (
    exact.length !== 1 ||
    !match ||
    credited(match.decl.stage) ||
    declarations.some(
      ({ entry, decl }) => compareTime(entry.at, match.entry.at) === -1 && !credited(decl.stage),
    ) ||
    !canonicalEqual(group.writes.map((w) => w.key).sort(), [...match.decl.produces].sort()) ||
    group.depends_on.length !== group.reads.length + 1 ||
    group.depends_on.at(-1) !== x.authorityGroupId ||
    group.reads.some((r, i) => {
      const fact = state.facts.get(r.key);
      return (
        !fact || fact.version !== r.version || fact.provenance.group_id !== group.depends_on[i]
      );
    }) ||
    match.decl.reads.some(
      (r) =>
        !group.reads.some(
          (g) => g.key === r.source.fact_key && state.facts.get(g.key)?.owner === r.source.owner,
        ),
    )
  )
    return undefined;
  const witness = qualifyIf6bOwnerStage(
    group,
    state,
    runtime.ownerVerifiers.filter(
      (v) => v.class !== "FIXTURE_ECONOMY_DRAFT" || runtime.fixtureEconomyDraft === true,
    ),
    fence,
    match.entry.at,
  );
  return witness && canonicalEqual(witness.stage, match.decl.stage) ? witness : undefined;
}

export function recordIf6bStage(
  group: CommitGroup,
  state: CampaignState,
  witness: If6bStageWitness,
  receipt: import("@immortalis/contracts").CommitReceipt,
): If6bCommittedStage {
  return {
    at: witness.at,
    rule: group.rule,
    record: {
      stage: witness.stage,
      group_id: group.group_id,
      intent_id: group.intent_id,
      revision: receipt.revision,
      group_sha256: receipt.group_sha256,
      reads: group.reads.map((r) => ({
        mode: "AS-OF-NOW",
        source: { owner: state.facts.get(r.key)!.owner, fact_key: r.key },
        source_basis: {
          version: r.version,
          committed_by: state.facts.get(r.key)!.provenance.group_id,
        },
        invalidators: [],
      })),
      writes: group.writes.map((w) => ({ key: w.key, version: w.expected_version + 1 })),
      validation: { invariants: receipt.invariants.map((i) => i.name) },
    },
  };
}
