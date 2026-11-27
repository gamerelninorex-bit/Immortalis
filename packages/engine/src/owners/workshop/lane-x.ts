import {
  AccessEventSchema,
  accessEventKey,
  CANON_WRITE_AUTHORITY,
  compareTime,
  economyRealizationStage,
  FACET_PRODUCTION_STATE,
  FACET_WORLD_LOCUS,
  GM_WAIT_IF6B_QUIET_SEAL_SEGMENT,
  OWNER_EPISTEMIC_ACCESS,
  GmWaitMarkerSchema,
  GmWaitStagedTransactionSchema,
  GmWaitTransactionAuthoritySchema,
  JsonValueSchema,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  productionObjectId,
  productionOperationKey,
  ProductionOperationSchema,
  productionProcessId,
  StageKeySchema,
  TemporalObjectSchema,
  temporalGmWaitMarkerKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type BoundaryIndex,
  type CommitGroup,
  type DependencyDeclaration,
  type GmWaitMarker,
  type OwnerFact,
  type TemporalObject,
  type TemporalRead,
} from "@immortalis/contracts";
import type { WorkshopHistoryRef } from "./generation.ts";
import {
  OWNER_HEALTH,
  type WorkshopFactRef,
  WorkshopNoticeEnrolmentSchema,
  WorkshopNoticeOccurrenceSchema,
  WorkshopSensoryCloseSchema,
  workshopCloseKey,
  WorkshopNoticeReservationSchema,
  workshopReservationKey,
} from "../../../../contracts/src/workshop-opening.ts";
import { groupSha256, type CampaignState } from "../../commit/campaign-core.ts";
import { economyGroupCheck } from "../../economy/admission.ts";
import { economyRealizationProvider } from "../../economy/provider.ts";
import { gmWaitTransactionId } from "../../gm-wait-identity.ts";
import { canonicalEqual, sha256Canonical } from "../../hash.ts";
import type { CampaignStore } from "../../persistence/store.ts";
import { productionGroupCheck, productionObjectViolation } from "../../production/admission.ts";
import { productionCompletionProvider } from "../../production/provider.ts";
import {
  IF6B_POLICY,
  if6bDueForOpenWait,
  type If6bAdmission,
  type If6bOwnerVerifier,
} from "../../temporal/if6b-stage.ts";
import { stageGroupId, stageIntentId, transactionCause } from "../../temporal/identity.ts";
import { StageUnresolvedError, type StageProvider } from "../../temporal/providers.ts";
import {
  worldEntityGroupCheck,
  worldFallbackAcceptanceProvider,
} from "../../world/fallback-custody.ts";
import {
  deriveWorkshopClose,
  verifyWorkshopRecovery,
  workshopHealthRecoveryProvider,
} from "./health-sensory.ts";
import {
  deriveNoticeOccurrence,
  WORKSHOP_OCCURRENCE_OPERATION,
  type WorkshopNoticeSource,
} from "./notice-publication.ts";
import { workshopStageGroup, type WorkshopView } from "./publication.ts";
import { WORKSHOP_NOTICE_RULE, type WorkshopFixtureIdentity } from "./source.ts";
import { deriveWorkshopReceipt } from "./epistemic-notice.ts";
import { workshopHost } from "./glassbell.ts";
import { verifyWorkshopResume, type WorkshopChoiceSource } from "./wait-decision.ts";

export interface WorkshopLaneXFixture {
  readonly noticeSource: WorkshopNoticeSource;
  readonly economyDraft?: true;
  readonly choiceSource?: WorkshopChoiceSource;
}

const viewOf = (state: CampaignState): WorkshopView => ({
  campaign_id: state.campaign_id,
  revision: state.revision,
  get: (key) => state.facts.get(key),
});

function preparation(marker: GmWaitMarker, state: CampaignState): boolean {
  const p = marker.preparation;
  const fact = state.facts.get(p.fact.key);
  const e = WorkshopNoticeEnrolmentSchema.safeParse(fact?.value);
  const slot = state.facts.get(workshopReservationKey(marker.campaign_id, marker.pc_id));
  const saved = WorkshopNoticeReservationSchema.safeParse(slot?.value);
  return (
    p.kind === "OWNER_PENDING_ENROLMENT" &&
    p.owner === OWNER_WORLD_STATE &&
    fact?.owner === p.owner &&
    fact.version === p.fact.version &&
    fact.provenance.group_id === p.fact.group_id &&
    sha256Canonical(fact.value) === p.digest &&
    e.success &&
    e.data.state.status === "PENDING" &&
    e.data.binding.campaign_id === marker.campaign_id &&
    e.data.binding.pc_id === marker.pc_id &&
    e.data.binding.x === marker.x &&
    e.data.binding.root_request_sha256 === marker.initial_request_sha256 &&
    e.data.binding.policy.history_verification_id === marker.policy.history_verification_id &&
    saved.success &&
    saved.data.state.status === "PENDING" &&
    saved.data.x === marker.x &&
    saved.data.enrolment_key === fact.key &&
    saved.data.binding_sha256 === sha256Canonical(e.data.binding)
  );
}

export type WorkshopEconomyStageClass = "FIXTURE_ECONOMY_DRAFT" | "ECONOMY_REALIZED_ACCESS_FORWARD";

const nativeOwners = (economyClass: WorkshopEconomyStageClass = "FIXTURE_ECONOMY_DRAFT") =>
  [
    {
      provider: workshopHealthRecoveryProvider,
      class: "RH_RECOVERY",
      verify: (group: CommitGroup, state: CampaignState) => verifyWorkshopRecovery(group, state),
    },
    {
      provider: productionCompletionProvider,
      class: "D3_COMPLETION",
      verify: (group: CommitGroup, state: CampaignState) =>
        productionGroupCheck(group, state) === null,
    },
    {
      provider: worldFallbackAcceptanceProvider,
      class: "D3_COMPLETION",
      verify: (group: CommitGroup, state: CampaignState) =>
        worldEntityGroupCheck(group, state) === null,
    },
    {
      provider: economyRealizationProvider,
      class: economyClass,
      verify: (group: CommitGroup, state: CampaignState) =>
        economyGroupCheck(group, state) === null,
    },
  ] as const;

function isEnrolledEconomyStage(
  state: CampaignState,
  cue: WorkshopFactRef,
  object: TemporalObject,
  entry: BoundaryIndex["entries"][number],
  declaration: DependencyDeclaration,
): boolean {
  // The enrolment pinned the original operation. At realization its current version is the completion.
  const fact = state.facts.get(cue.key);
  const operation = ProductionOperationSchema.safeParse(fact?.value);
  if (
    cue.owner !== OWNER_PRODUCTION ||
    cue.facet !== FACET_PRODUCTION_STATE ||
    fact?.owner !== cue.owner ||
    fact.facet !== cue.facet ||
    fact.version <= cue.version ||
    !object.next_boundary ||
    !operation.success
  )
    return false;
  const id = operation.data.operation_id;
  return (
    cue.key === productionOperationKey(id) &&
    object.owning_ref.owner === OWNER_PRODUCTION &&
    object.owning_ref.process_id === productionProcessId(id) &&
    object.object_id === productionObjectId(id) &&
    entry.object_id === object.object_id &&
    entry.boundary_id === object.next_boundary.boundary_id &&
    compareTime(entry.at, object.next_boundary.at) === 0 &&
    canonicalEqual(declaration.stage, economyRealizationStage(id)) &&
    productionObjectViolation(object, state, false) === null
  );
}

export function workshopLaneXAdmission(
  profile: WorkshopFixtureIdentity,
  fixture: WorkshopLaneXFixture,
  historyId: WorkshopHistoryRef,
  economyClass: WorkshopEconomyStageClass = "FIXTURE_ECONOMY_DRAFT",
): If6bAdmission {
  const notice = fixture.noticeSource;
  const owners = nativeOwners(economyClass);
  const specs = [
    ...owners.map(({ provider, ...entry }) => ({
      owner: provider.owner,
      facet: provider.facet,
      operation: provider.operation,
      rule: provider.rule,
      ...entry,
    })),
    {
      owner: OWNER_WORLD_STATE,
      facet: FACET_WORLD_LOCUS,
      operation: WORKSHOP_OCCURRENCE_OPERATION,
      rule: WORKSHOP_NOTICE_RULE,
      class: "RH_OCCURRENCE" as const,
      verify: (group: CommitGroup, state: CampaignState, marker: GmWaitMarker) =>
        canonicalEqual(
          group,
          deriveNoticeOccurrence(viewOf(state), marker.preparation.fact.key, notice),
        ),
    },
  ];
  const ownerVerifiers: If6bOwnerVerifier[] = specs.map((spec) => ({
    owner: spec.owner,
    facet: spec.facet,
    operation: spec.operation,
    class: spec.class,
    verify(group, state) {
      const match = /^transaction:gm-wait:([a-f0-9]{64})$/.exec(group.cause);
      if (
        !match ||
        state.campaign_id !== profile.campaignId ||
        !canonicalEqual(group.rule, spec.rule)
      )
        return undefined;
      const marker = GmWaitMarkerSchema.safeParse(
        state.facts.get(temporalGmWaitMarkerKey(match[1]!))?.value,
      );
      if (!marker.success || !preparation(marker.data, state)) return undefined;
      const authority = GmWaitTransactionAuthoritySchema.safeParse(
        state.facts.get(temporalTransactionAuthorityKey(gmWaitTransactionId(marker.data.x)))?.value,
      );
      if (!authority.success) return undefined;
      const due = if6bDueForOpenWait(state, marker.data, authority.data.requested.target);
      const earned = due
        ?.flatMap(({ entry, object }) =>
          (object?.dependencies ?? []).map((dep) => ({
            at: entry.at,
            entry,
            stage: dep.stage,
            object: object!,
            dep,
          })),
        )
        .find(
          ({ stage }) =>
            stage.owner_operation.operation === spec.operation &&
            stageGroupId(stage) === group.group_id,
        );
      const slot = state.facts.get(workshopReservationKey(state.campaign_id, marker.data.pc_id));
      const enrolment = state.facts.get(marker.data.preparation.fact.key);
      const waitAuthority = state.facts.get(
        temporalTransactionAuthorityKey(gmWaitTransactionId(marker.data.x)),
      );
      const binding = WorkshopNoticeEnrolmentSchema.safeParse(enrolment?.value);
      if (!earned || !slot || !enrolment || !waitAuthority || !binding.success || !group.writes[0])
        return undefined;
      if (
        spec.class === "ECONOMY_REALIZED_ACCESS_FORWARD" &&
        !isEnrolledEconomyStage(
          state,
          binding.data.binding.cue_operation,
          earned.object,
          earned.entry,
          earned.dep,
        )
      )
        return undefined;
      if (spec.class === "D3_COMPLETION" || spec.class === "FIXTURE_ECONOMY_DRAFT") {
        const opKey = binding.data.binding.cue_operation.key;
        if (
          earned.object.owning_ref.process_id !== opKey &&
          !earned.object.dependencies.some((d) =>
            d.reads.some((read) => read.source.fact_key === opKey),
          )
        )
          return undefined;
      }
      const provider = owners.find(
        (o) => o.provider.owner === spec.owner && o.provider.operation === spec.operation,
      )?.provider;
      if (
        provider &&
        !canonicalEqual(
          group,
          prepareNativeStage(
            state,
            provider,
            earned.object,
            earned.dep,
            waitAuthority,
            enrolment,
            slot,
          ),
        )
      )
        return undefined;
      if (!spec.verify(group, state, marker.data)) return undefined;
      const predecessor = {
        key: slot.key,
        version: slot.version,
        group_id: slot.provenance.group_id,
      };
      const occurrence =
        spec.class === "RH_OCCURRENCE"
          ? group.writes.find((w) => WorkshopNoticeOccurrenceSchema.safeParse(w.value).success)
          : undefined;
      return {
        class: spec.class,
        policy: IF6B_POLICY,
        campaign: state.campaign_id,
        pc: marker.data.pc_id,
        x: marker.data.x,
        at: earned.at,
        stage: earned.stage,
        groupId: group.group_id,
        groupDigest: groupSha256(group),
        ownerWriteKey: group.writes[0].key,
        reservation: marker.data.preparation.fact,
        predecessors: [predecessor],
        ...(occurrence
          ? { occurrence: { key: occurrence.key, version: 1, group_id: group.group_id } }
          : {}),
      };
    },
  }));
  return {
    ownerVerifiers,
    preparation,
    ...(economyClass === "FIXTURE_ECONOMY_DRAFT" && fixture.economyDraft
      ? { fixtureEconomyDraft: true }
      : {}),
    verifyResume(group, state, seal) {
      return (
        state.campaign_id === profile.campaignId &&
        verifyWorkshopResume(viewOf(state), group, seal, fixture.choiceSource)
      );
    },
    verifyAftermath(group, state) {
      if (state.campaign_id !== profile.campaignId) return false;
      const view = viewOf(state);
      for (const w of group.writes) {
        if (group.owner === OWNER_HEALTH) {
          const close = WorkshopSensoryCloseSchema.safeParse(w.value);
          if (close.success)
            return canonicalEqual(
              group,
              deriveWorkshopClose(
                view,
                close.data.notice_occurrence.key,
                close.data.coverage.anchor?.key,
                profile,
                historyId,
              ),
            );
        }
        if (group.owner === OWNER_EPISTEMIC_ACCESS) {
          const access = AccessEventSchema.safeParse(w.value);
          if (access.success)
            return canonicalEqual(
              group,
              deriveWorkshopReceipt(view, access.data.source.fact_key, notice.recipientSource),
            );
        }
      }
      return false;
    },
    permitsReconcile(marker, state) {
      const view = viewOf(state);
      const e = WorkshopNoticeEnrolmentSchema.safeParse(
        view.get(marker.preparation.fact.key)?.value,
      );
      if (!e.success) return false;
      if (e.data.state.status === "PENDING") {
        // G1: the ordinary quiet seal credited no stage and crossed no boundary, so no owner aftermath exists to wait for. Only that exact seal,
        // under the identity that carries the G1 segment, over this X's still-PENDING enrolment; any other staged seal keeps waiting.
        const quiet = GmWaitStagedTransactionSchema.safeParse(
          view.get(temporalTransactionKey(gmWaitTransactionId(marker.x)))?.value,
        );
        return (
          quiet.success &&
          quiet.data.x === marker.x &&
          quiet.data.stages.length === 0 &&
          quiet.data.outcome.stop_reason === "TARGET_REACHED" &&
          marker.policy.history_verification_id.endsWith(
            GM_WAIT_IF6B_QUIET_SEAL_SEGMENT + "+" + IF6B_POLICY,
          )
        );
      }
      if (e.data.state.status === "INELIGIBLE_AT_BOUNDARY") return true;
      if (e.data.state.status !== "OCCURRED") return false;
      const occurrence = view.get(e.data.state.occurrence_key);
      const event = WorkshopNoticeOccurrenceSchema.safeParse(occurrence?.value);
      const host = workshopHost(view);
      if (!occurrence || !event.success || !host) return false;
      const close = view.get(
        workshopCloseKey(
          host.pc,
          sha256Canonical([view.campaign_id, occurrence.key, host.host.key, "AUDITORY"]),
        ),
      );
      const hearing = WorkshopSensoryCloseSchema.safeParse(close?.value);
      return (
        hearing.success &&
        (hearing.data.result !== "AVAILABLE" ||
          !!view.get(accessEventKey("workshop-notice:" + event.data.notice_id)))
      );
    },
  };
}

function prepareNativeStage(
  state: CampaignState,
  provider: StageProvider,
  object: ReturnType<typeof TemporalObjectSchema.parse>,
  declaration: (typeof object.dependencies)[number],
  authority: OwnerFact,
  enrolment: OwnerFact,
  slot: OwnerFact,
): CommitGroup | undefined {
  const at = object.next_boundary?.at;
  if (!at || declaration.reads.some((r) => r.mode !== "AS-OF-NOW")) return undefined;
  const reads = [];
  for (const declared of declaration.reads) {
    const fact = state.facts.get(declared.source.fact_key);
    if (!fact || fact.owner !== declared.source.owner) return undefined;
    const read: TemporalRead = {
      ...declared,
      source_basis: { version: fact.version, committed_by: fact.provenance.group_id },
    };
    reads.push({ read, fact });
  }
  const prior = new Map(
    declaration.produces.flatMap((key) => {
      const fact = state.facts.get(key);
      return fact ? [[key, fact] as const] : [];
    }),
  );
  try {
    const writes = provider.compute({
      stage: declaration.stage,
      produces: declaration.produces,
      reads,
      prior,
      span: {
        from: object.last_resolved_basis,
        to: at,
        elapsed: at.value - object.last_resolved_basis.value,
      },
    });
    const stage = StageKeySchema.parse(declaration.stage);
    return workshopStageGroup(
      {
        campaign_id: state.campaign_id,
        owner: provider.owner,
        facet: provider.facet,
        group_id: stageGroupId(stage),
        intent_id: stageIntentId(stage),
        cause: authority.provenance.cause,
        rule: provider.rule,
        authority: CANON_WRITE_AUTHORITY,
        reads: reads.map(({ fact }) => ({ key: fact.key, version: fact.version })),
        depends_on: [],
        writes: writes.map((w) => ({
          ...w,
          value: JsonValueSchema.parse(w.value),
          owner: provider.owner,
          facet: provider.facet,
          expected_version: state.facts.get(w.key)?.version ?? 0,
        })),
      },
      viewOf(state),
      enrolment,
      slot,
      authority,
    );
  } catch (error) {
    if (error instanceof StageUnresolvedError) return undefined;
    throw error;
  }
}

/** Resolve the next due original stage through the common store. An incomplete source leaves OPEN intact. */
export async function advanceWorkshopWaitStage(
  store: CampaignStore,
  x: string,
  notice: WorkshopNoticeSource,
) {
  const state = store.canonicalState?.();
  if (!state) return { status: "UNRESOLVED" as const };
  const view = viewOf(state);
  const marker = GmWaitMarkerSchema.safeParse(view.get(temporalGmWaitMarkerKey(x))?.value);
  const authority = view.get(temporalTransactionAuthorityKey(gmWaitTransactionId(x)));
  const opened = GmWaitTransactionAuthoritySchema.safeParse(authority?.value);
  if (
    !marker.success ||
    !opened.success ||
    !authority ||
    view.get(temporalTransactionKey(opened.data.transaction_id))
  )
    return { status: "UNRESOLVED" as const };
  const enrolment = view.get(marker.data.preparation.fact.key);
  const slot = view.get(workshopReservationKey(state.campaign_id, marker.data.pc_id));
  if (!enrolment || !slot) return { status: "UNRESOLVED" as const };
  const due = if6bDueForOpenWait(state, marker.data, opened.data.requested.target);
  if (!due || due.some(({ entry }) => compareTime(entry.at, opened.data.requested.target) === null))
    return { status: "UNRESOLVED" as const };
  const stages = due.flatMap(({ entry, object }) =>
    (object?.dependencies ?? []).map((decl, order) => ({ entry, object: object!, order, decl })),
  );
  stages.sort(
    (a, b) =>
      compareTime(a.entry.at, b.entry.at)! ||
      Number(a.decl.stage.owner_operation.operation === WORKSHOP_OCCURRENCE_OPERATION) -
        Number(b.decl.stage.owner_operation.operation === WORKSHOP_OCCURRENCE_OPERATION) ||
      a.order - b.order,
  );
  const owners = nativeOwners();
  for (const { object, decl } of stages) {
    const committed = store.committedGroup(stageIntentId(decl.stage));
    if (committed) {
      if (committed.cause !== transactionCause(opened.data.transaction_id))
        return { status: "UNRESOLVED" as const };
      continue;
    }
    const operation = decl.stage.owner_operation;
    const owner = owners.find(
      ({ provider }) =>
        provider.owner === operation.owner && provider.operation === operation.operation,
    );
    const group =
      operation.operation === WORKSHOP_OCCURRENCE_OPERATION
        ? deriveNoticeOccurrence(view, enrolment.key, notice)
        : owner &&
          prepareNativeStage(state, owner.provider, object, decl, authority, enrolment, slot);
    if (!group) return { status: "UNRESOLVED" as const };
    return { status: "STAGE" as const, stage: decl.stage, result: await store.commit(group) };
  }
  return { status: "READY_TO_SEAL" as const };
}
