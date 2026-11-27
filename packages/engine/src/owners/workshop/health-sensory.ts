import { workshopSealedCut } from "./publication.ts";
// Health owns the Glassbell condition, its recovery and event-specific auditory assessment.
import { workshopHistoryIdOf, type WorkshopHistoryRef } from "./generation.ts";
import {
  READ_MODE_NOW,
  OWNER_WORLD_STATE,
  GmWaitByPcIndexSchema,
  temporalGmWaitByPcKey,
  timeAtOrBefore,
  TEMPORAL_ORIGIN_KEY,
  TemporalOriginSchema,
  compareTime,
  temporalObjectKey,
  timeBefore,
  timeEquals,
  type CanonicalTime,
  type CommitGroup,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import { workshopOccurrenceKey } from "../../../../contracts/src/workshop-opening.ts";
import {
  FACET_HEALTH_CONDITION_PROCESS,
  HEALTH_GLASSBELL_RECOVERY,
  OWNER_HEALTH,
  WORKSHOP_SECOND,
  WorkshopConditionSchema,
  WorkshopCoverageAnchorSchema,
  WorkshopGlassbellExposureSchema,
  WorkshopNoticeOccurrenceSchema,
  WorkshopSensoryCloseSchema,
  workshopAnchorKey,
  workshopCloseKey,
  workshopConditionKey,
  workshopExposureKey,
  type WorkshopCondition,
  type WorkshopCoverageAnchor,
  type WorkshopSensoryClose,
} from "../../../../contracts/src/workshop-opening.ts";
import { canonicalEqual, sha256Canonical } from "../../hash.ts";
import type { CampaignState } from "../../commit/campaign-core.ts";
import { stageAuthorityViolation } from "../../production/admission.ts";
import type { CampaignStore } from "../../persistence/store.ts";
import { StageUnresolvedError, type StageProvider } from "../../temporal/providers.ts";
import { workshopHost } from "./glassbell.ts";
import {
  workshopClock,
  workshopGroup,
  workshopMatches,
  workshopPolicy,
  workshopRef,
  workshopView,
  type WorkshopView,
} from "./publication.ts";
import {
  WORKSHOP_ANCHOR_RULE,
  WORKSHOP_CLOSE_RULE,
  WORKSHOP_CONDITION_RULE,
  WORKSHOP_NOTICE_RULE,
  type WorkshopFixtureIdentity,
} from "./source.ts";

const conditionId = (campaign: string, pc: string, host: string, exposure: string) =>
  sha256Canonical([campaign, pc, host, exposure, "GLASSBELL_FIELD_V1"]);

export function workshopRecoveryBoundary(exposure: CanonicalTime): CanonicalTime | undefined {
  const value = exposure.value + 300;
  return exposure.unit === WORKSHOP_SECOND && Number.isSafeInteger(value)
    ? { unit: exposure.unit, value }
    : undefined;
}

export function deriveWorkshopCondition(
  view: WorkshopView,
  profile: WorkshopFixtureIdentity,
  historyId: WorkshopHistoryRef,
) {
  const subject = workshopHost(view);
  const clock = workshopClock(view);
  const origin = view.get(TEMPORAL_ORIGIN_KEY);
  const o = TemporalOriginSchema.safeParse(origin?.value);
  if (!subject || !clock || !origin || !o.success || !profile.glassbell) return undefined;
  const cause = view.get(workshopExposureKey(subject.worldId, subject.pc));
  const e = WorkshopGlassbellExposureSchema.safeParse(cause?.value);
  if (
    !cause ||
    !e.success ||
    !workshopMatches(subject.host, e.data.host_ref) ||
    !workshopMatches(subject.placement, e.data.placement) ||
    !workshopMatches(subject.binding, e.data.pc_binding) ||
    !timeEquals(e.data.at.at, o.data.origin)
  )
    return undefined;
  const boundary = workshopRecoveryBoundary(e.data.at.at);
  if (!boundary || !timeBefore(clock.at, boundary)) return undefined;
  const condition_id = conditionId(view.campaign_id, subject.pc, subject.host.key, cause.key);
  const value: WorkshopCondition = {
    schema_version: 1,
    campaign_id: view.campaign_id,
    pc_id: subject.pc,
    host_ref: workshopRef(subject.host),
    custodian_ref: workshopRef(subject.placement),
    condition_id,
    cause: workshopRef(cause),
    progression_rule: WORKSHOP_CONDITION_RULE,
    at: { at: clock.at, journal_revision: view.revision },
    source_inputs: [workshopRef(origin), workshopRef(cause)],
    previous_version: 0,
    state: { status: "ACTIVE", effect: "HEARING_FUNCTION_LIMITATION" },
    policy: workshopPolicy(WORKSHOP_CONDITION_RULE, historyId),
  };
  return workshopGroup(
    view,
    WORKSHOP_CONDITION_RULE,
    OWNER_HEALTH,
    FACET_HEALTH_CONDITION_PROCESS,
    [{ key: workshopConditionKey(subject.pc, condition_id), value, expected_version: 0 }],
    [subject.host, subject.placement, subject.binding, cause, clock.fact, origin],
  );
}

export function workshopHealthTemporalObject(
  condition: OwnerFact,
  exposure: OwnerFact,
): TemporalObject | undefined {
  const c = WorkshopConditionSchema.safeParse(condition.value);
  const e = WorkshopGlassbellExposureSchema.safeParse(exposure.value);
  if (!c.success || !e.success || !workshopMatches(exposure, c.data.cause)) return undefined;
  const boundary = workshopRecoveryBoundary(e.data.at.at);
  if (!boundary) return undefined;
  const id = c.data.condition_id;
  const isActive = c.data.state.status === "ACTIVE";
  return {
    object_id: `obj-health-glassbell-${id}`,
    owning_ref: { owner: OWNER_HEALTH, process_id: condition.key },
    last_resolved_basis:
      c.data.state.status === "RETIRED" ? c.data.state.recovery_at : c.data.at.at,
    partition: { class: "EXACT-PARTITION" },
    next_boundary: isActive ? { boundary_id: `health-recovery-${id}`, at: boundary } : null,
    dependencies: [
      {
        stage: {
          causal_process_id: condition.key,
          owner_operation: { owner: OWNER_HEALTH, operation: HEALTH_GLASSBELL_RECOVERY },
          prospective_result_id: `health-recovery-${id}`,
        },
        reads: [
          {
            mode: READ_MODE_NOW,
            source: { owner: exposure.owner, fact_key: exposure.key },
            invalidators: [{ fact_key: exposure.key }],
          },
        ],
        produces: [condition.key],
        declares_close: null,
      },
    ],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: [{ fact_key: exposure.key }],
    information_latency: { creates_epistemic_interruption: false },
  };
}

export function concernsWorkshopHealth(object: TemporalObject) {
  return (
    object.owning_ref.owner === OWNER_HEALTH ||
    object.object_id.startsWith("obj-health-glassbell-") ||
    object.dependencies.some(({ stage }) => stage.owner_operation.owner === OWNER_HEALTH)
  );
}

export function workshopHealthObjectViolation(
  object: TemporalObject,
  view: WorkshopView,
  registering: boolean,
) {
  if (!concernsWorkshopHealth(object)) return null;
  const condition = view.get(object.owning_ref.process_id);
  const c = WorkshopConditionSchema.safeParse(condition?.value);
  const exposure = c.success ? view.get(c.data.cause.key) : undefined;
  const expected =
    condition && exposure ? workshopHealthTemporalObject(condition, exposure) : undefined;
  if (
    !expected ||
    !condition ||
    !c.success ||
    condition.owner !== OWNER_HEALTH ||
    c.data.campaign_id !== view.campaign_id ||
    !workshopMatches(view.get(c.data.host_ref.key), c.data.host_ref) ||
    !workshopMatches(view.get(c.data.custodian_ref.key), c.data.custodian_ref) ||
    (registering && c.data.state.status !== "ACTIVE") ||
    !canonicalEqual(object, expected)
  )
    return "Health Temporal object must exactly match the committed condition, original exposure and its earned recovery";
  return null;
}

function retiredCondition(prior: OwnerFact, cause: OwnerFact, at: CanonicalTime) {
  const c = WorkshopConditionSchema.safeParse(prior.value);
  const e = WorkshopGlassbellExposureSchema.safeParse(cause.value);
  const boundary = e.success && workshopRecoveryBoundary(e.data.at.at);
  if (
    !c.success ||
    !boundary ||
    !timeEquals(at, boundary) ||
    c.data.state.status !== "ACTIVE" ||
    !workshopMatches(cause, c.data.cause)
  )
    return undefined;
  return WorkshopConditionSchema.parse({
    ...c.data,
    previous_version: prior.version,
    state: { status: "RETIRED", recovery_at: at },
  });
}

export const workshopHealthRecoveryProvider: StageProvider = {
  owner: OWNER_HEALTH,
  facet: FACET_HEALTH_CONDITION_PROCESS,
  operation: HEALTH_GLASSBELL_RECOVERY,
  rule: WORKSHOP_CONDITION_RULE,
  compute(input) {
    const key = input.produces[0];
    const prior = key ? input.prior.get(key) : undefined;
    const cause = input.reads[0]?.fact;
    const result = prior && cause ? retiredCondition(prior, cause, input.span.to) : undefined;
    if (!prior || !result || input.produces.length !== 1 || input.reads.length !== 1)
      throw new StageUnresolvedError(
        "SOURCE_INVALID",
        "Health recovery has no exact original condition and cause",
      );
    return [
      {
        key: prior.key,
        value: result,
        unit: prior.unit,
        basis: prior.basis,
        secrecy: prior.secrecy,
      },
    ];
  },
};

export function verifyWorkshopRecovery(group: CommitGroup, state: CampaignState): boolean {
  const w = group.writes[0];
  const prior = w && state.facts.get(w.key);
  const c = WorkshopConditionSchema.safeParse(prior?.value);
  const cause = c.success ? state.facts.get(c.data.cause.key) : undefined;
  if (!w || group.writes.length !== 1 || !prior || !cause) return false;
  const object = workshopHealthTemporalObject(prior, cause);
  const committedObject = object && state.facts.get(temporalObjectKey(object.object_id));
  if (!object?.next_boundary || !committedObject || !canonicalEqual(committedObject.value, object))
    return false;
  const stage = object.dependencies[0]!.stage;
  const at = object.next_boundary.at;
  const expected = retiredCondition(prior, cause, at);
  return (
    !!expected &&
    w.expected_version === prior.version &&
    w.unit === prior.unit &&
    w.basis === prior.basis &&
    w.secrecy === prior.secrecy &&
    (group.cause.startsWith("transaction:gm-wait:")
      ? group.reads.some((r) => r.key === cause.key && r.version === cause.version)
      : canonicalEqual(group.reads, [{ key: cause.key, version: cause.version }])) &&
    group.depends_on.includes(cause.provenance.group_id) &&
    stageAuthorityViolation(group, stage, state.facts, at, "ADMISSION") === null &&
    canonicalEqual(w.value, expected)
  );
}

function healthSources(
  view: WorkshopView,
  profile: WorkshopFixtureIdentity,
  subject: NonNullable<ReturnType<typeof workshopHost>>,
) {
  const key = workshopExposureKey(subject.worldId, subject.pc);
  const exposure = view.get(key);
  const condition = view.get(
    workshopConditionKey(
      subject.pc,
      conditionId(view.campaign_id, subject.pc, subject.host.key, key),
    ),
  );
  const c = WorkshopConditionSchema.safeParse(condition?.value);
  const valid = profile.glassbell
    ? !!exposure &&
      !!condition &&
      c.success &&
      workshopMatches(exposure, c.data.cause) &&
      workshopMatches(subject.host, c.data.host_ref) &&
      workshopMatches(subject.placement, c.data.custodian_ref)
    : !exposure && !condition;
  return { valid, exposure, condition, current: c.success ? c.data : undefined };
}

export function deriveWorkshopAnchor(
  view: WorkshopView,
  profile: WorkshopFixtureIdentity,
  historyId: WorkshopHistoryRef,
) {
  const subject = workshopHost(view);
  const clock = workshopClock(view);
  const origin = view.get(TEMPORAL_ORIGIN_KEY);
  const o = TemporalOriginSchema.safeParse(origin?.value);
  if (
    !subject ||
    !clock ||
    !origin ||
    !o.success ||
    !timeEquals(clock.at, o.data.origin) ||
    o.data.chronology.grade !== "ORIGINAL_MESSAGE_VERIFIED"
  )
    return undefined;
  const sources = healthSources(view, profile, subject);
  if (!sources.valid) return undefined;
  const { exposure, condition } = sources;
  const object =
    condition && exposure ? workshopHealthTemporalObject(condition, exposure) : undefined;
  const registered = object && view.get(temporalObjectKey(object.object_id));
  if (profile.glassbell && (!registered || !canonicalEqual(registered.value, object)))
    return undefined;
  const anchor_id = sha256Canonical([
    view.campaign_id,
    subject.pc,
    subject.host.key,
    subject.binding.provenance.group_id,
    "AUDITORY",
    view.revision,
  ]);
  const value: WorkshopCoverageAnchor = {
    schema_version: 1,
    campaign_id: view.campaign_id,
    pc_id: subject.pc,
    host_ref: workshopRef(subject.host),
    custodian_ref: workshopRef(subject.placement),
    pc_binding: workshopRef(subject.binding),
    modality: "AUDITORY",
    anchor_id,
    starts: { at: clock.at, journal_revision: view.revision },
    condition_baseline: condition ? [workshopRef(condition)] : [],
    source_inventory: exposure ? [workshopRef(exposure)] : [],
    policy: workshopPolicy(WORKSHOP_ANCHOR_RULE, historyId),
  };
  const inventory = [exposure, condition, registered].filter(
    (f): f is OwnerFact => f !== undefined,
  );
  return workshopGroup(
    view,
    WORKSHOP_ANCHOR_RULE,
    OWNER_HEALTH,
    FACET_HEALTH_CONDITION_PROCESS,
    [{ key: workshopAnchorKey(subject.pc, anchor_id), value, expected_version: 0 }],
    [subject.host, subject.binding, subject.placement, clock.fact, origin, ...inventory],
  );
}

export function deriveWorkshopClose(
  view: WorkshopView,
  occurrenceKey: string,
  anchorKey: string | undefined,
  profile: WorkshopFixtureIdentity,
  historyId: WorkshopHistoryRef,
) {
  const subject = workshopHost(view);
  const occurrence = view.get(occurrenceKey);
  const event = WorkshopNoticeOccurrenceSchema.safeParse(occurrence?.value);
  const clock = workshopClock(view);
  const origin = view.get(TEMPORAL_ORIGIN_KEY);
  const o = TemporalOriginSchema.safeParse(origin?.value);
  if (
    !subject ||
    !occurrence ||
    !event.success ||
    !clock ||
    !origin ||
    !o.success ||
    event.data.campaign_id !== view.campaign_id ||
    event.data.pc_id !== subject.pc ||
    event.data.locus_id !== subject.locusId ||
    event.data.world_id !== subject.worldId ||
    event.data.policy.history_verification_id !== workshopHistoryIdOf(historyId) ||
    !timeAtOrBefore(clock.at, event.data.at) ||
    occurrence.owner !== OWNER_WORLD_STATE ||
    occurrence.version !== 1 ||
    !canonicalEqual(occurrence.provenance.rule, WORKSHOP_NOTICE_RULE) ||
    occurrenceKey !== workshopOccurrenceKey(subject.worldId, subject.locusId, event.data.notice_id)
  )
    return undefined;
  const wait = view.get(temporalGmWaitByPcKey(subject.pc));
  const index = GmWaitByPcIndexSchema.safeParse(wait?.value);
  const settled = workshopSealedCut(view, subject.pc, event.data.x);
  if (
    !wait ||
    !index.success ||
    !settled ||
    !settled.settlement.stages.some((s) => s.group_id === occurrence.provenance.group_id) ||
    view.get(
      workshopCloseKey(
        subject.pc,
        sha256Canonical([view.campaign_id, occurrence.key, subject.host.key, "AUDITORY"]),
      ),
    )
  )
    return undefined;

  const anchor = anchorKey ? view.get(anchorKey) : undefined;
  const a = WorkshopCoverageAnchorSchema.safeParse(anchor?.value);
  const sources = healthSources(view, profile, subject);
  const recovery = sources.exposure
    ? WorkshopGlassbellExposureSchema.safeParse(sources.exposure.value)
    : undefined;
  const due = recovery?.success && workshopRecoveryBoundary(recovery.data.at.at);
  const anchorInventory = sources.exposure ? [workshopRef(sources.exposure)] : [];
  const baseline = a.success ? a.data.condition_baseline : [];
  const conditionMatchesBaseline =
    sources.condition && sources.current
      ? baseline.length === 1 &&
        (canonicalEqual(workshopRef(sources.condition), baseline[0]!) ||
          (sources.current.state.status === "RETIRED" &&
            baseline[0]!.key === sources.condition.key &&
            baseline[0]!.version === sources.current.previous_version &&
            sources.condition.version === sources.current.previous_version + 1))
      : baseline.length === 0;
  const reason =
    !anchor || !a.success
      ? "NO_ANCHOR"
      : !workshopMatches(subject.host, a.data.host_ref) ||
          !workshopMatches(subject.binding, a.data.pc_binding) ||
          !workshopMatches(subject.placement, a.data.custodian_ref) ||
          !canonicalEqual(a.data.policy, workshopPolicy(WORKSHOP_ANCHOR_RULE, historyId))
        ? "HOST_OR_POLICY_CONFLICT"
        : !timeEquals(a.data.starts.at, o.data.origin)
          ? "LATE_ANCHOR"
          : !a.success ||
              !canonicalEqual(a.data.source_inventory, anchorInventory) ||
              !conditionMatchesBaseline
            ? "SOURCE_UNVERIFIED"
            : !sources.valid ||
                (due &&
                  sources.current?.state.status === "ACTIVE" &&
                  compareTime(due, event.data.at) !== 1)
              ? "CONDITION_UNRESOLVED"
              : undefined;
  const relevant = sources.condition ? [workshopRef(sources.condition)] : [];
  const coverage: WorkshopSensoryClose["coverage"] =
    reason || !anchor || !a.success
      ? {
          status: "INCOMPLETE",
          anchor: anchor ? workshopRef(anchor) : null,
          reason: reason ?? "NO_ANCHOR",
        }
      : {
          status: "COMPLETE",
          anchor: workshopRef(anchor),
          from_revision: a.data.starts.journal_revision,
          to_revision: view.revision,
          segment_chain_sha256: sha256Canonical([
            a.data.policy,
            workshopRef(anchor),
            workshopRef(occurrence),
            ...relevant,
          ]),
          relevant_condition_refs: relevant,
        };
  const result =
    coverage.status === "INCOMPLETE"
      ? "UNKNOWN"
      : sources.current?.state.status === "ACTIVE"
        ? "IMPAIRED"
        : "AVAILABLE";
  const key = workshopCloseKey(
    subject.pc,
    sha256Canonical([view.campaign_id, occurrence.key, subject.host.key, "AUDITORY"]),
  );
  const through = { at: event.data.at, journal_revision: view.revision };
  const policy = workshopPolicy(WORKSHOP_CLOSE_RULE, historyId);
  const value: WorkshopSensoryClose = {
    schema_version: 1,
    campaign_id: view.campaign_id,
    pc_id: subject.pc,
    host_ref: workshopRef(subject.host),
    pc_binding: workshopRef(subject.binding),
    modality: "AUDITORY",
    notice_occurrence: workshopRef(occurrence),
    notice_id: event.data.notice_id,
    scope_start: o.data.origin,
    through,
    close_stamp: sha256Canonical([
      key,
      occurrence.version,
      o.data.origin,
      through,
      coverage,
      result,
      sha256Canonical(policy),
    ]),
    coverage,
    result,
    policy,
  };
  const evidence = [anchor, sources.exposure, sources.condition].filter(
    (f): f is OwnerFact => f !== undefined,
  );
  return workshopGroup(
    view,
    WORKSHOP_CLOSE_RULE,
    OWNER_HEALTH,
    FACET_HEALTH_CONDITION_PROCESS,
    [{ key, value, expected_version: 0 }],
    [
      subject.host,
      subject.binding,
      subject.placement,
      occurrence,
      wait,
      clock.fact,
      origin,
      ...evidence,
    ],
  );
}

export function readWorkshopSensoryClose(
  store: CampaignStore,
  pc: string,
  occurrence: OwnerFact,
  host: OwnerFact,
) {
  const key = workshopCloseKey(
    pc,
    sha256Canonical([store.head().campaign_id, occurrence.key, host.key, "AUDITORY"]),
  );
  const fact = store.getFact(key);
  const parsed = WorkshopSensoryCloseSchema.safeParse(fact?.value);
  if (
    !fact ||
    !parsed.success ||
    !workshopMatches(occurrence, parsed.data.notice_occurrence) ||
    !store.ruleCheckedGroupIds?.().has(fact.provenance.group_id)
  )
    return { result: "UNKNOWN" } as const;
  return { result: parsed.data.result, close: workshopRef(fact) };
}

export class WorkshopHealthAdapter {
  readonly #store: CampaignStore;
  readonly #profile: WorkshopFixtureIdentity;
  readonly #historyId: WorkshopHistoryRef;
  constructor(store: CampaignStore, profile: WorkshopFixtureIdentity, historyId: WorkshopHistoryRef) {
    this.#store = store;
    this.#profile = profile;
    this.#historyId = historyId;
  }
  establishCondition() {
    const plan = deriveWorkshopCondition(workshopView(this.#store), this.#profile, this.#historyId);
    return plan ? this.#store.commit(plan) : undefined;
  }
  establishCoverageAnchor() {
    const plan = deriveWorkshopAnchor(workshopView(this.#store), this.#profile, this.#historyId);
    return plan ? this.#store.commit(plan) : undefined;
  }
  closeAuditoryFunction(occurrenceKey: string, anchorKey?: string) {
    const plan = deriveWorkshopClose(
      workshopView(this.#store),
      occurrenceKey,
      anchorKey,
      this.#profile,
      this.#historyId,
    );
    return plan ? this.#store.commit(plan) : undefined;
  }
}
