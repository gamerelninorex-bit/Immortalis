import {
  CANON_WRITE_AUTHORITY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  type CommitGroup,
  type DependencyDeclaration,
  type NamedActorCapabilityBasis,
  type ResolutionRequest,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  namedActorCapabilityCloseProvider,
  namedActorCapabilityCloseRead,
  namedActorCapabilityDeclaration,
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";
import { SYNTH_RULE, T0, T1, TB, at } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Named-Actor Character Capability & Capability-Close Backbone Foundation. Every owner, key,
 * identifier, coordinate and value below is a fixture, not IMMORTALIS canon: it carries no game semantics and no
 * calibration — in particular no skill value, level, percentage, roll or prior exists here. The Named-Actor owner is NOT
 * synthetic and lives in @immortalis/engine; what is synthetic are the OTHER parties of the proof:
 *
 *  - a test HISTORY source, which commits the causal facts (a biography, an occupation, a developmental history) a
 *    capability basis may pin — a stand-in for the foreign owners (KTI, Epistemic, biography) that are not implemented;
 *  - a test CONSUMER, a dependent consequence that materially requires an actor's mastery and reads it AS-OF-DECLARED-
 *    CLOSE. It is no canonical gameplay subsystem and never owns the capability.
 *
 * Both are registered through an extension that cannot write a canonical, kernel, Population, Production, Economy,
 * World-State, Logistics or Named-Actor key space. Production code must never import this package (Bootstrap Plan §2.2).
 */
export const SYNTH_ACTOR_HISTORY_OWNER = "SYNTHETIC-ACTOR-HISTORY";
const HISTORY_FACET = "synthetic-actor-history";
const HISTORY_PREFIX = "synthetic-actor-history/";
export const SYNTH_CAPABILITY_CONSUMER_OWNER = "SYNTHETIC-CAPABILITY-CONSUMER";
const CONSUMER_FACET = "synthetic-capability-consumer";
const CONSUMER_PREFIX = "synthetic-capability-consumer/";
export const SYNTH_OP_CONSUME_CLOSE = "synthetic-capability-consume-close";
export const SYNTH_OP_CONSUME_NOW = "synthetic-capability-consume-now";

const prefixAdmission =
  (owner: string, prefix: string): WriteAdmission["check"] =>
  (group) => {
    if (group.owner !== owner) return null;
    for (const w of group.writes) {
      if (!w.key.startsWith(prefix)) {
        return {
          code: "KEY_NOT_ADMITTED",
          message: "not this synthetic owner's key",
          details: { key: w.key },
        };
      }
    }
    return null;
  };

const historyCheck = prefixAdmission(SYNTH_ACTOR_HISTORY_OWNER, HISTORY_PREFIX);
const consumerCheck = prefixAdmission(SYNTH_CAPABILITY_CONSUMER_OWNER, CONSUMER_PREFIX);

export const ACTOR_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([
    [SYNTH_ACTOR_HISTORY_OWNER, new Set([HISTORY_FACET])],
    [SYNTH_CAPABILITY_CONSUMER_OWNER, new Set([CONSUMER_FACET])],
  ]),
  admission: {
    check(group, state) {
      return historyCheck(group, state) ?? consumerCheck(group, state);
    },
  },
};

// -- identities and coordinates (test coordinates only) -------------------------------------------------------

export const ACTOR_SMITH = "actor-smith";
export const ACTOR_SWORD = "actor-swordsman";
export const ACTOR_OTHER = "actor-other";
export const CAP_METALWORKING = "capability-metalworking";
export const CAP_SWORDSMANSHIP = "capability-swordsmanship";
export const CAP_COMMAND = "capability-command";
export const ACTOR_BOUNDARY_T = TB;
export { T0, T1, TB, at };

export const historyKey = (id: string): string => `${HISTORY_PREFIX}${id}`;
export const consumerResultKey = (id: string): string => `${CONSUMER_PREFIX}result/${id}`;

/** A committed causal input of the history source (a fixture sentence; never a value any engine rule reads). */
export function historyGroup(
  campaignId: string,
  n: number,
  id: string,
  value: unknown = `SYNTHETIC FIXTURE: established history ${id}.`,
  expectedVersion = 0,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `actor-history-group-${n}`,
    intent_id: `actor-history-intent-${n}`,
    owner: SYNTH_ACTOR_HISTORY_OWNER,
    facet: HISTORY_FACET,
    cause: `actor-history-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key: historyKey(id),
        owner: SYNTH_ACTOR_HISTORY_OWNER,
        facet: HISTORY_FACET,
        value: value as never,
        unit: null,
        basis: "actor-fixture-basis",
        secrecy: "actor-fixture-secrecy",
        expected_version: expectedVersion,
      },
    ],
  };
}

/**
 * A causally sufficient deterministic establishment basis: the authored capability, pinned to committed causal inputs.
 * `versions` are the history facts' versions at the time of the call (1 for a freshly committed fact).
 */
export const capabilityBasis = (
  actorId: string,
  capabilityId: string,
  over: Partial<NamedActorCapabilityBasis> = {},
  historyIds: readonly string[] = [`${actorId}-biography`, `${actorId}-occupation`],
): NamedActorCapabilityBasis => ({
  actor_id: actorId,
  capability_id: capabilityId,
  marker: "C",
  materiality: "ROLE_DEFINING",
  establishment: {
    method: "CAUSALLY_DETERMINED",
    causes: historyIds.map((id, i) => ({
      aspect: i === 0 ? ("BIOGRAPHY_HISTORY" as const) : ("OCCUPATION_ROLE" as const),
      owner: SYNTH_ACTOR_HISTORY_OWNER,
      fact_key: historyKey(id),
      version: 1,
    })),
  },
  ...over,
});

export const actorPublication = (n: number) => ({
  group_id: `actor-group-${n}`,
  intent_id: `actor-intent-${n}`,
  cause: `actor-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

// -- the consumer: a dependent consequence that materially requires an actor's mastery --------------------------

export const consumerStage = (consumerId: string, operation = SYNTH_OP_CONSUME_CLOSE) =>
  ({
    causal_process_id: `capability-consumer/${consumerId}`,
    owner_operation: { owner: SYNTH_CAPABILITY_CONSUMER_OWNER, operation },
    prospective_result_id: consumerResultKey(consumerId),
  }) as const;

/** The consumer reads the actor owner's capability close, AS-OF-DECLARED-CLOSE (the only lawful cross-owner read). */
export const closeConsumerDeclaration = (
  consumerId: string,
  actorId: string,
  capabilityId: string,
): DependencyDeclaration => ({
  stage: consumerStage(consumerId),
  reads: [namedActorCapabilityCloseRead(actorId, capabilityId)],
  produces: [consumerResultKey(consumerId)],
  declares_close: null,
});

/** The forbidden shape: a consumer that reads the capability AS-OF-NOW (a later effective time cannot bypass the close). */
export const nowConsumerDeclaration = (
  consumerId: string,
  actorId: string,
  capabilityId: string,
): DependencyDeclaration => {
  const key = actorCapabilityKey(actorId, capabilityId);
  return {
    stage: consumerStage(consumerId, SYNTH_OP_CONSUME_NOW),
    reads: [
      { mode: "AS-OF-NOW", source: { owner: "named_actor", fact_key: key }, invalidators: [] },
    ],
    produces: [consumerResultKey(consumerId)],
    declares_close: null,
  };
};

/** The forbidden shape: a consumer that reads the uncommitted establishment basis. */
export const basisConsumerDeclaration = (
  consumerId: string,
  actorId: string,
  capabilityId: string,
): DependencyDeclaration => {
  const key = actorCapabilityBasisKey(actorId, capabilityId);
  return {
    stage: consumerStage(consumerId, SYNTH_OP_CONSUME_NOW),
    reads: [
      { mode: "AS-OF-NOW", source: { owner: "named_actor", fact_key: key }, invalidators: [] },
    ],
    produces: [consumerResultKey(consumerId)],
    declares_close: null,
  };
};

const out = (key: string, value: unknown) => ({
  key,
  value: value as never,
  unit: null,
  basis: "actor-fixture-basis",
  secrecy: "actor-fixture-secrecy",
});

/** Records what the consumer observed of the capability: the marker, and the group that committed the close it read. */
export const closeConsumerProvider: StageProvider = {
  owner: SYNTH_CAPABILITY_CONSUMER_OWNER,
  facet: CONSUMER_FACET,
  operation: SYNTH_OP_CONSUME_CLOSE,
  rule: SYNTH_RULE,
  compute({ reads, produces }) {
    const fact = reads[0]!.fact;
    const value = fact.value as { marker: unknown; actor_id: string; capability_id: string };
    return produces.map((key) =>
      out(key, {
        observed_actor: value.actor_id,
        observed_capability: value.capability_id,
        observed_marker: value.marker,
        observed_close_group: fact.provenance.group_id,
      }),
    );
  },
};

export const actorProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([namedActorCapabilityCloseProvider, closeConsumerProvider]);

const common = {
  partition: { class: "EXACT-PARTITION" as const },
  continuation: { resume_from: "LAST_RESOLVED_BASIS" as const, reconciliation_due: [] as [] },
  information_latency: { creates_epistemic_interruption: false as const },
};

export const consumerObjectId = (consumerId: string): string =>
  `capability-consumer-obj-${consumerId}`;
export const consumerBoundaryId = (consumerId: string): string =>
  `capability-consumer-boundary-${consumerId}`;

/**
 * The engaged object of one dependent consequence: ONE earned boundary (a test coordinate), the actor owner's
 * capability-close stage declared ahead of it (WS-016 §16 trigger: the consequence materially requires the mastery),
 * and the consumer stage that reads that close. `extraDependencies` lets a test add further (or replace) stages.
 */
export function capabilityConsumerObject(
  consumerId: string,
  basis: NamedActorCapabilityBasis,
  over: Partial<TemporalObject> = {},
): TemporalObject {
  return {
    object_id: consumerObjectId(consumerId),
    owning_ref: {
      owner: SYNTH_CAPABILITY_CONSUMER_OWNER,
      process_id: `capability-consumer/${consumerId}`,
    },
    last_resolved_basis: T0,
    next_boundary: { boundary_id: consumerBoundaryId(consumerId), at: ACTOR_BOUNDARY_T },
    dependencies: [
      namedActorCapabilityDeclaration(basis),
      closeConsumerDeclaration(consumerId, basis.actor_id, basis.capability_id),
    ],
    invalidators: [],
    ...common,
    ...over,
  };
}

/** Toward T1, stopping once the consumer's earned boundary has resolved. */
export const consumerAdvanceRequest = (
  id: string,
  consumerId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
  continues: null,
  requested: {
    target: T1,
    condition: {
      kind: "STOP_AFTER_BOUNDARY",
      object_id: consumerObjectId(consumerId),
      boundary_id: consumerBoundaryId(consumerId),
    },
  },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});
