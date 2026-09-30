import {
  CANON_WRITE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  type CanonicalTime,
  type CommitGroup,
  type DependencyDeclaration,
  type Publication,
  type ResolutionRequest,
  type SourceRef,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";

/**
 * SYNTHETIC TEST DATA for the Turnless Temporal & Resolution Transaction Foundation. The owner, keys,
 * operations, coordinates and values below are not IMMORTALIS canon, carry no game semantics and
 * calibrate nothing. T0/Tb/T1 are test coordinates, not gameplay values; nothing here is a tolerance
 * (CAL-01 remains UNCALIBRATED) and the partition is EXACT. Production code must never import this
 * package (Bootstrap Plan §2.2).
 *
 * The fixture is deliberately small: one engaged exact-partition TemporalObject with one earned
 * boundary Tb; one synthetic producer stage at Tb; one dependent synthetic consumer stage; one
 * unrelated dormant TemporalObject outside the causal cone.
 */
export const SYNTH_OWNER = "SYNTHETIC-STAGE-OWNER";
export const SYNTH_FACET = "synthetic-stage";
export const SYNTH_OP_PRODUCE = "synthetic-produce";
export const SYNTH_OP_CONSUME = "synthetic-consume";
export const SYNTH_OP_INDEPENDENT = "synthetic-independent";

export const TIME_UNIT = "fixture-time-unit";
export const at = (value: number): CanonicalTime => ({ unit: TIME_UNIT, value });
/** Test coordinates only. */
export const T0 = at(100);
export const TB = at(140);
export const T1 = at(200);

export const SYNTH_SOURCE_KEY = "synthetic/source/1";
export const SYNTH_PRODUCER_RESULT_KEY = "synthetic/producer/result";
export const SYNTH_CONSUMER_RESULT_KEY = "synthetic/consumer/result";
export const SYNTH_DORMANT_RESULT_KEY = "synthetic/dormant/result";
export const SYNTH_CLOSE_NAME = "synthetic-producer-close";

export const SYNTH_RULE: SourceRef = {
  artifact: "test://synthetic-temporal-rule",
  native_pin: "test-pin-1",
  clause: "test-clause",
  authority_lineage: ["test-lineage"],
  effective_basis: "test-basis",
  supersedes: null,
};

const isPlain = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Admission for the synthetic owner: only keys under `synthetic/`, create or advance, any JSON value. */
const SYNTH_ADMISSION: WriteAdmission = {
  check(group) {
    for (const w of group.writes) {
      if (!w.key.startsWith("synthetic/")) {
        return {
          code: "KEY_NOT_ADMITTED",
          message: "not a synthetic key",
          details: { key: w.key },
        };
      }
    }
    return null;
  },
};

export const SYNTH_EXTENSION: StageOwnerExtension = {
  owners: new Map([[SYNTH_OWNER, new Set([SYNTH_FACET])]]),
  admission: SYNTH_ADMISSION,
};

// -- stage declarations ---------------------------------------------------------------------------

export const PROCESS_ENGAGED = "synthetic-process-engaged";
export const PROCESS_DORMANT = "synthetic-process-dormant";
export const OBJECT_ENGAGED = "obj-engaged";
export const OBJECT_DORMANT = "obj-dormant";
export const BOUNDARY_ID = "boundary-engaged-1";

export const PRODUCER_STAGE = {
  causal_process_id: PROCESS_ENGAGED,
  owner_operation: { owner: SYNTH_OWNER, operation: SYNTH_OP_PRODUCE },
  prospective_result_id: "producer-result-1",
} as const;
export const CONSUMER_STAGE = {
  causal_process_id: PROCESS_ENGAGED,
  owner_operation: { owner: SYNTH_OWNER, operation: SYNTH_OP_CONSUME },
  prospective_result_id: "consumer-result-1",
} as const;
export const DORMANT_STAGE = {
  causal_process_id: PROCESS_DORMANT,
  owner_operation: { owner: SYNTH_OWNER, operation: SYNTH_OP_INDEPENDENT },
  prospective_result_id: "dormant-result-1",
} as const;

/**
 * The producer reads, AS-OF-NOW, already-committed canonical campaign state (the operative PC binding,
 * a role_registry fact) and a synthetic source fact, and its commit IS the named producer close.
 */
export const producerDeclaration = (): DependencyDeclaration => ({
  stage: PRODUCER_STAGE,
  reads: [
    {
      mode: "AS-OF-NOW",
      source: { owner: "role_registry", fact_key: PLAYER_CHARACTER_BINDING_KEY },
      invalidators: [{ fact_key: PLAYER_CHARACTER_BINDING_KEY }],
    },
    {
      mode: "AS-OF-NOW",
      source: { owner: SYNTH_OWNER, fact_key: SYNTH_SOURCE_KEY },
      invalidators: [{ fact_key: SYNTH_SOURCE_KEY }],
    },
  ],
  produces: [SYNTH_PRODUCER_RESULT_KEY],
  declares_close: { name: SYNTH_CLOSE_NAME },
});

/** The consumer reads the producer's named close, AS-OF-DECLARED-CLOSE. */
export const closeBasis = (name = SYNTH_CLOSE_NAME) => ({
  name,
  producer: { owner: SYNTH_OWNER, operation: SYNTH_OP_PRODUCE },
});
export const consumerDeclaration = (): DependencyDeclaration => ({
  stage: CONSUMER_STAGE,
  reads: [
    {
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: SYNTH_OWNER, fact_key: SYNTH_PRODUCER_RESULT_KEY },
      close_basis: closeBasis(),
      invalidators: [{ fact_key: SYNTH_PRODUCER_RESULT_KEY }],
    },
  ],
  produces: [SYNTH_CONSUMER_RESULT_KEY],
  declares_close: null,
});

export const PROJECTION_BASIS = "synthetic-basis";
export const PROJECTION_SECRECY = "synthetic-secrecy";

// -- providers (the synthetic owner's operations; deterministic, pure) -------------------------------

const out = (key: string, value: unknown) => ({
  key,
  value: value as never,
  unit: null,
  basis: PROJECTION_BASIS,
  secrecy: PROJECTION_SECRECY,
});

export const producerProvider: StageProvider = {
  owner: SYNTH_OWNER,
  facet: SYNTH_FACET,
  operation: SYNTH_OP_PRODUCE,
  rule: SYNTH_RULE,
  compute({ span, reads }) {
    const binding = PlayerCharacterBindingSchema.parse(reads[0]!.fact.value);
    return [
      out(SYNTH_PRODUCER_RESULT_KEY, {
        elapsed: span.elapsed,
        observed_pc: binding.active_pc.entity_id,
        observed_source: reads[1]!.fact.value,
      }),
    ];
  },
};
export const consumerProvider: StageProvider = {
  owner: SYNTH_OWNER,
  facet: SYNTH_FACET,
  operation: SYNTH_OP_CONSUME,
  rule: SYNTH_RULE,
  compute({ reads }) {
    const produced = reads[0]!.fact.value;
    return [
      out(SYNTH_CONSUMER_RESULT_KEY, {
        consumed_elapsed: isPlain(produced) ? produced["elapsed"] : null,
      }),
    ];
  },
};
export const independentProvider: StageProvider = {
  owner: SYNTH_OWNER,
  facet: SYNTH_FACET,
  operation: SYNTH_OP_INDEPENDENT,
  rule: SYNTH_RULE,
  compute({ span, produces }) {
    return produces.map((key) => out(key, { elapsed: span.elapsed }));
  },
};

export const syntheticProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([producerProvider, consumerProvider, independentProvider]);

// -- objects ---------------------------------------------------------------------------------------

const common = {
  partition: { class: "EXACT-PARTITION" as const },
  continuation: { resume_from: "LAST_RESOLVED_BASIS" as const, reconciliation_due: [] as [] },
  information_latency: { creates_epistemic_interruption: false as const },
};

/** The engaged exact-partition object: one earned boundary Tb, the producer and the dependent consumer. */
export const engagedObject = (over: Partial<TemporalObject> = {}): TemporalObject => ({
  object_id: OBJECT_ENGAGED,
  owning_ref: { owner: SYNTH_OWNER, process_id: PROCESS_ENGAGED },
  last_resolved_basis: T0,
  next_boundary: { boundary_id: BOUNDARY_ID, at: TB },
  dependencies: [producerDeclaration(), consumerDeclaration()],
  invalidators: [{ fact_key: SYNTH_SOURCE_KEY }],
  ...common,
  ...over,
});

/**
 * The unrelated dormant object: no earned boundary, so it is never in the active index, and its
 * declarations read nothing that any engaged work produces or touches.
 */
export const dormantObject = (over: Partial<TemporalObject> = {}): TemporalObject => ({
  object_id: OBJECT_DORMANT,
  owning_ref: { owner: SYNTH_OWNER, process_id: PROCESS_DORMANT },
  last_resolved_basis: T0,
  next_boundary: null,
  dependencies: [
    {
      stage: DORMANT_STAGE,
      reads: [
        {
          mode: "AS-OF-NOW",
          source: { owner: SYNTH_OWNER, fact_key: "synthetic/dormant/source" },
          invalidators: [{ fact_key: "synthetic/dormant/source" }],
        },
      ],
      produces: [SYNTH_DORMANT_RESULT_KEY],
      declares_close: null,
    },
  ],
  invalidators: [{ fact_key: "synthetic/dormant/source" }],
  ...common,
  ...over,
});

// -- requests and publications ---------------------------------------------------------------------

export const temporalPublication = (n: number, over: Partial<Publication> = {}): Publication => ({
  group_id: `tp-group-${n}`,
  intent_id: `tp-intent-${n}`,
  cause: `tp-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
  ...over,
});

/** A synthetic-owner source fact publication (used to establish and then change the synthetic source). */
export function syntheticSourceGroup(
  campaignId: string,
  n: number,
  value: unknown,
  expectedVersion: number,
  key = SYNTH_SOURCE_KEY,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `synthetic-source-group-${n}`,
    intent_id: `synthetic-source-intent-${n}`,
    owner: SYNTH_OWNER,
    facet: SYNTH_FACET,
    cause: `synthetic-source-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key,
        owner: SYNTH_OWNER,
        facet: SYNTH_FACET,
        value: value as never,
        unit: null,
        basis: PROJECTION_BASIS,
        secrecy: PROJECTION_SECRECY,
        expected_version: expectedVersion,
      },
    ],
  };
}

/** An explicit-stop request: toward T1, stopping once the engaged object's boundary has resolved. */
export const stopAtBoundaryRequest = (
  id = "tx-1",
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
  continues: null,
  requested: {
    target: T1,
    condition: { kind: "STOP_AFTER_BOUNDARY", object_id: OBJECT_ENGAGED, boundary_id: BOUNDARY_ID },
  },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

export const continuationInput = (id = "tx-2") => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
  context: { role: "role.player", permission: "permission.player_choice.commit" } as const,
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
});
