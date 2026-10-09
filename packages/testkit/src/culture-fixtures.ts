import {
  type DependencyDeclaration,
  type ResolutionRequest,
  type TemporalObject,
  type CultureUpdateContext,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  cultureConventionCloseProvider,
  cultureConventionDeclaration,
  cultureSharedMeaningNowRead,
  populationStageProvider,
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";
import { CJA_OBSERVATION_EXTENSION } from "./culture-adjudication-fixtures.ts";
import {
  POPULATION_FIXTURE_EXTENSION,
  SYNTH_CAUSE_OWNER,
  registerKey,
  LEDGER_MAIN,
} from "./population-fixtures.ts";
import { SYNTH_RULE, T0, T1, TB } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Culture & Society Established Shared Meaning / Norm Result-Close Backbone. Every owner, key,
 * identifier, coordinate and value below is a fixture, not IMMORTALIS canon: it carries no game semantics and no calibration —
 * in particular no prevalence, percentage, count, score, adoption, belief or threshold exists here. The Culture owner, the
 * Culture context attestor, the CJA1 adjudication adapter and the Population scope-close verifier are NOT synthetic and live
 * in @immortalis/engine; what is synthetic are the OTHER parties of the proof:
 *
 *  - the CJA observation source of `./culture-adjudication-fixtures.ts`: independently committed facts describing ACTS,
 *    PARTICIPANTS and EXPOSURE only. No observation value carries a Culture verdict, a "continuing recognition" tag or a
 *    manifestation identifier (the tests assert that); the manifestation is authored only by a scripted adjudicator;
 *  - the Population fixtures (a ledger, Cohorts, a Criterion Owner, a causal owner's consequence register) so a REAL Cohort,
 *    stamped by a REAL Population reconciliation close, exists for the Cohort scope;
 *  - a test CULTURE RESULT CONSUMER, a dependent consequence that materially requires the shared meaning/norm and reads it
 *    AS-OF-NOW after the Communicative Convention Close. It is no Economy/GIP/Actor/ASR implementation: it records exactly
 *    the fact it read and decides nothing.
 *
 * Production code must never import this package.
 */
export const SYNTH_CULTURE_CONSUMER_OWNER = "SYNTHETIC-CULTURE-RESULT-CONSUMER";
const CONSUMER_FACET = "synthetic-culture-result-consumer";
const CONSUMER_PREFIX = "synthetic-culture-result-consumer/";
export const SYNTH_OP_CONSUME_CULTURE_RESULT = "synthetic-culture-consume-result";

const consumerCheck: WriteAdmission["check"] = (group) => {
  if (group.owner !== SYNTH_CULTURE_CONSUMER_OWNER) return null;
  for (const w of group.writes) {
    if (!w.key.startsWith(CONSUMER_PREFIX)) {
      return {
        code: "KEY_NOT_ADMITTED",
        message: "not this synthetic owner's key",
        details: { key: w.key },
      };
    }
  }
  return null;
};

const CONSUMER_EXTENSION: StageOwnerExtension = {
  owners: new Map([[SYNTH_CULTURE_CONSUMER_OWNER, new Set([CONSUMER_FACET])]]),
  admission: { check: consumerCheck },
};

const merge = (...exts: readonly StageOwnerExtension[]): StageOwnerExtension => ({
  owners: new Map(exts.flatMap((e) => [...e.owners]).map(([o, f]) => [o, new Set(f)] as const)),
  admission: {
    check(group, state) {
      for (const e of exts) {
        if (!e.owners.has(group.owner)) continue;
        const r = e.admission?.check(group, state) ?? null;
        if (r) return r;
      }
      return null;
    },
  },
});

export const CULTURE_FIXTURE_EXTENSION: StageOwnerExtension = merge(
  POPULATION_FIXTURE_EXTENSION,
  CJA_OBSERVATION_EXTENSION,
  CONSUMER_EXTENSION,
);

/** The consumer-declared registers where pending consequence envelopes of the engaged ledger are carried (PCB-01). */
export const CULTURE_CONSEQUENCE_SOURCES = [
  { owner: SYNTH_CAUSE_OWNER, fact_key: registerKey(LEDGER_MAIN) },
] as const;

// -- identities and coordinates (test coordinates only) -------------------------------------------------------

export const CULTURE_CONTEXT_MARKET = "culture-context-market-day";
export const CULTURE_CONTEXT_OTHER = "culture-context-harvest";
export const cultureConsumerResultKey = (id: string): string => `${CONSUMER_PREFIX}result/${id}`;

export const culturePublication = (n: number) => ({
  basis: `culture-fixture-basis-${n}`,
});

// -- the consumer: a dependent consequence that materially requires the shared meaning/norm -------------------

export const cultureConsumerStage = (consumerId: string) =>
  ({
    causal_process_id: `culture-result-consumer/${consumerId}`,
    owner_operation: {
      owner: SYNTH_CULTURE_CONSUMER_OWNER,
      operation: SYNTH_OP_CONSUME_CULTURE_RESULT,
    },
    prospective_result_id: cultureConsumerResultKey(consumerId),
  }) as const;

/** The consumer reads the fact AS-OF-NOW after the Communicative Convention Close: the form ECUL-01 / GCUL-01 / CUL-AF take. */
export const cultureConsumerDeclaration = (
  consumerId: string,
  slotId: string,
): DependencyDeclaration => ({
  stage: cultureConsumerStage(consumerId),
  reads: [cultureSharedMeaningNowRead(slotId)],
  produces: [cultureConsumerResultKey(consumerId)],
  declares_close: null,
});

const out = (key: string, value: unknown) => ({
  key,
  value: value as never,
  unit: null,
  basis: "culture-fixture-basis",
  secrecy: "culture-fixture-secrecy",
});

/** Records exactly the fact the consumer read, and the group that committed it. It decides and infers nothing. */
export const cultureConsumerProvider: StageProvider = {
  owner: SYNTH_CULTURE_CONSUMER_OWNER,
  facet: CONSUMER_FACET,
  operation: SYNTH_OP_CONSUME_CULTURE_RESULT,
  rule: SYNTH_RULE,
  compute({ reads, produces }) {
    const fact = reads[0]!.fact;
    return produces.map((key) =>
      out(key, { observed_meaning: fact.value, observed_close_group: fact.provenance.group_id }),
    );
  },
};

export const cultureProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    populationStageProvider,
    cultureConventionCloseProvider,
    cultureConsumerProvider,
  ]);

const common = {
  partition: { class: "EXACT-PARTITION" as const },
  continuation: { resume_from: "LAST_RESOLVED_BASIS" as const, reconciliation_due: [] as [] },
  information_latency: { creates_epistemic_interruption: false as const },
};

export const cultureConsumerObjectId = (consumerId: string): string =>
  `culture-consumer-obj-${consumerId}`;
export const cultureConsumerBoundaryId = (consumerId: string): string =>
  `culture-consumer-boundary-${consumerId}`;

/**
 * The engaged object of one dependent consequence that materially requires the shared meaning/norm: ONE earned boundary (a
 * test coordinate), the Culture owner's Communicative Convention Close declared ahead of it, and the consumer stage that
 * reads the fact AS-OF-NOW after the close. The sealed context is already committed; the decision need not be.
 */
export function cultureConsumerObject(
  consumerId: string,
  context: CultureUpdateContext,
  over: Partial<TemporalObject> = {},
): TemporalObject {
  return {
    object_id: cultureConsumerObjectId(consumerId),
    owning_ref: {
      owner: SYNTH_CULTURE_CONSUMER_OWNER,
      process_id: `culture-result-consumer/${consumerId}`,
    },
    last_resolved_basis: T0,
    next_boundary: { boundary_id: cultureConsumerBoundaryId(consumerId), at: TB },
    dependencies: [
      cultureConventionDeclaration(context),
      cultureConsumerDeclaration(consumerId, context.slot_id),
    ],
    invalidators: [],
    ...common,
    ...over,
  };
}

/** Toward T1, stopping once the consumer's earned boundary has resolved. */
export const cultureAdvanceRequest = (
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
      object_id: cultureConsumerObjectId(consumerId),
      boundary_id: cultureConsumerBoundaryId(consumerId),
    },
  },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});
