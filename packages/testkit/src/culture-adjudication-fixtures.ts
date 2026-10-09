import {
  CANON_WRITE_AUTHORITY,
  GM_ADJUDICATION_AUTHORITY,
  POPULATION_CLOSE_BASIS,
  type CjaAuthoredJudgment,
  type CjaAssessment,
  type CjaConstituencyRef,
  type CjaContextAttestation,
  type CjaFinding,
  type CommitGroup,
  type SourceRef,
} from "@immortalis/contracts";
import {
  cjaCausalProcessId,
  cjaCultureUpdateId,
  cjaDistinctionDigest,
  type CampaignStore,
  type CultureAdjudicationContextPort,
  type CultureContextLookup,
  type StageOwnerExtension,
  type WriteAdmission,
} from "@immortalis/engine";

/**
 * SYNTHETIC TEST DATA for the F-027-CJA1 consumer-free adjudication-record prerequisite. Every owner, key, identifier,
 * sentence and value below is a fixture, not IMMORTALIS canon: it carries no game semantics and no calibration. The
 * adjudication owner is NOT synthetic and lives in @immortalis/engine; what is synthetic are the OTHER parties:
 *
 *  - a test-owned OBSERVATION SOURCE: it commits observations of ACTS, PARTICIPANTS and EXPOSURE only. No observation carries
 *    a Culture verdict, a "continuing recognition" marker, an adoption, a manifestation identifier or an admission flag
 *    (CJA1 §§4.3, 10.B C7) — the tests assert that;
 *  - a test-owned SEALED-CONTEXT STAND-IN: it commits an outcome-neutral sealed context whose group reads every input and
 *    depends on its committing group (the historical proof), and a PORT A stand-in that reads that context back. It is NOT
 *    the production Culture context or the unmerged Culture schema, and it certifies no production lawfulness;
 *  - a test-owned stand-in for the PopulationCloseScopeVerifier vouch (`live_population_admission = false`): it is NOT a live
 *    Population close, and no live PCB-01 attestation is claimed.
 *
 * Both owners are registered through an extension that cannot write any canonical or kernel key space. Production code
 * must never import this package.
 */
export const SYNTH_CJA_OBSERVATION_OWNER = "SYNTHETIC-CJA-OBSERVATION-SOURCE";
const OBSERVATION_FACET = "synthetic-cja-observation";
const OBSERVATION_PREFIX = "synthetic-cja-observation/";
export const SYNTH_CJA_CONTEXT_OWNER = "SYNTHETIC-CJA-CONTEXT-SEALER";
const CONTEXT_FACET = "synthetic-cja-context";
const CONTEXT_PREFIX = "synthetic-cja-context/";
/** the ONE registered consumer of the test: a stand-in for Culture's Communicative Convention Close operation */
export const CJA_TEST_CONSUMER = {
  owner: SYNTH_CJA_CONTEXT_OWNER,
  operation: "synthetic-culture-close-operation",
} as const;

/** The rule/method every test judgment cites (a fixture SourceRef: no production authority). */
export const CJA_TEST_RULE: SourceRef = {
  artifact: "https://example.invalid/synthetic-cja-test-rule",
  native_pin: "synthetic-pin-1",
  clause: "SYNTHETIC FIXTURE: the test-owned method applicable to the scripted judgments.",
  authority_lineage: ["SYNTHETIC FIXTURE lineage"],
  effective_basis: "synthetic-test-basis",
  supersedes: null,
};

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
const observationCheck = prefixAdmission(SYNTH_CJA_OBSERVATION_OWNER, OBSERVATION_PREFIX);
const contextCheck = prefixAdmission(SYNTH_CJA_CONTEXT_OWNER, CONTEXT_PREFIX);

export const CJA_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([
    [SYNTH_CJA_OBSERVATION_OWNER, new Set([OBSERVATION_FACET])],
    [SYNTH_CJA_CONTEXT_OWNER, new Set([CONTEXT_FACET])],
  ]),
  admission: {
    check(group, state) {
      return observationCheck(group, state) ?? contextCheck(group, state);
    },
  },
};

/** The observation source alone, for suites whose sealed context is committed by the REAL Culture owner. */
export const CJA_OBSERVATION_EXTENSION: StageOwnerExtension = {
  owners: new Map([[SYNTH_CJA_OBSERVATION_OWNER, new Set([OBSERVATION_FACET])]]),
  admission: { check: observationCheck },
};

export const FIXTURE_SYNTH_RULE: SourceRef = {
  artifact: "https://example.invalid/synthetic-cja-group-rule",
  native_pin: "synthetic-pin-2",
  clause: "SYNTHETIC FIXTURE: the rule the test-owned parties write under.",
  authority_lineage: ["SYNTHETIC FIXTURE lineage"],
  effective_basis: "synthetic-test-basis",
  supersedes: null,
};

// -- identities --------------------------------------------------------------------------------------------------------

export const observationKey = (id: string): string => `${OBSERVATION_PREFIX}${id}`;
export const testContextKey = (updateId: string): string => `${CONTEXT_PREFIX}${updateId}`;
export const TEST_REFERENT_KEY = "synthetic-cja-referent/meeting-hall";
export const TEST_SCOPE_KEY = "synthetic-cja-scope/visitor-reception";
export const TEST_CONTEXT_ID = "context-receiving-visitors";
export const TEST_CONSUMER_QUESTION =
  "SYNTHETIC FIXTURE: whether visitors choose their seats first when received, as a later answer would need.";
/** an RC-12 Cohort key (the registered Population key space): bound by identity, never read */
export const TEST_COHORT_KEY = "population/ledger-main/cohort/cohort-status-l";
export const TEST_POPULATION_CLOSE_BASIS = {
  name: POPULATION_CLOSE_BASIS.name,
  producer: { ...POPULATION_CLOSE_BASIS.producer },
};
/** the opaque manifestation identifier ONLY a judgment authors: it appears in no observation value */
export const TEST_MANIFESTATION = "manifestation-visitor-first-seating";

export const cjaPublicationGroup = (
  campaignId: string,
  owner: string,
  facet: string,
  n: number,
  writes: CommitGroup["writes"],
  extra: Partial<CommitGroup> = {},
): CommitGroup => ({
  campaign_id: campaignId,
  group_id: `cja-fixture-${owner}-group-${n}`,
  intent_id: `cja-fixture-${owner}-intent-${n}`,
  owner,
  facet,
  cause: `cja-fixture-cause-${n}`,
  rule: FIXTURE_SYNTH_RULE,
  authority: { ...CANON_WRITE_AUTHORITY },
  reads: [],
  depends_on: [],
  writes,
  ...extra,
});

// -- observations (acts, participants and exposure only) ---------------------------------------------------------------

export interface TestObservation {
  readonly id: string;
  /** what it denotes: an act, participants and an exposure path — never a verdict */
  readonly value: unknown;
}

export const DEFAULT_OBSERVATIONS: readonly TestObservation[] = [
  {
    id: "obs-trigger",
    value: {
      kind: "OBSERVED_ACT",
      summary: "SYNTHETIC FIXTURE: a visitor was invited to sit before the hosts at a reception.",
      participants: ["person-visitor-1", "person-host-1"],
      exposure_path: "present in the hall",
    },
  },
  {
    id: "obs-repeat",
    value: {
      kind: "OBSERVED_ACT",
      summary: "SYNTHETIC FIXTURE: other hosts later invited other visitors to sit first.",
      participants: ["person-visitor-2", "person-host-2", "person-host-3"],
      exposure_path: "present in the hall",
    },
  },
  {
    id: "obs-deviation",
    value: {
      kind: "OBSERVED_ACT",
      summary: "SYNTHETIC FIXTURE: one host sat first and was corrected aloud by a neighbour.",
      participants: ["person-host-4", "person-host-5"],
      exposure_path: "present in the hall",
    },
  },
  {
    id: "obs-bystander",
    value: {
      kind: "OBSERVED_ACT",
      summary: "SYNTHETIC FIXTURE: a passer-by glimpsed the hall door closing.",
      participants: ["person-passerby-1"],
      exposure_path: "outside the hall",
    },
  },
];

export const observationGroup = (
  campaignId: string,
  n: number,
  id: string,
  value: unknown,
  expectedVersion = 0,
): CommitGroup =>
  cjaPublicationGroup(
    campaignId,
    "obs",
    OBSERVATION_FACET,
    n,
    [
      {
        key: observationKey(id),
        owner: SYNTH_CJA_OBSERVATION_OWNER,
        facet: OBSERVATION_FACET,
        value: value as never,
        unit: null,
        basis: "cja-observation-fixture-basis",
        secrecy: "cja-observation-fixture-secrecy",
        expected_version: expectedVersion,
      },
    ],
    {
      group_id: `cja-obs-group-${n}`,
      intent_id: `cja-obs-intent-${n}`,
      owner: SYNTH_CJA_OBSERVATION_OWNER,
    },
  );

/** The stand-in PORT B vouch result for a Cohort (NOT a live Population close). */
export const testConstituency = (over: Partial<CjaConstituencyRef> = {}): CjaConstituencyRef => ({
  cohort_fact_key: TEST_COHORT_KEY,
  cohort_version: 1,
  committed_by_group_id: "synthetic-population-group-1",
  close_basis: { ...TEST_POPULATION_CLOSE_BASIS },
  close_vouch: {
    port: "PopulationCloseScopeVerifier",
    live_population_admission: false,
    reconciliation: "NOT_DUE",
  },
  ...over,
});

// -- the test-owned sealed context and PORT A stand-in -----------------------------------------------------------------

export interface TestContextSpec {
  /** observation ids to seal, in order; the trigger is the one at `trigger` (default: the first) */
  readonly inputs?: readonly string[];
  readonly trigger?: string;
  readonly constituency?: CjaConstituencyRef | null;
  readonly distinction?: { referent_key: string; scope_key: string; context_id: string };
  readonly consumer_question?: string;
}

/**
 * The outcome-neutral attestation a sealed context determines, from the observation facts' committed versions and groups.
 * `refs` maps each observation id to the (version, group) it was committed at; the context fact's own group and version are
 * fixed by `contextGroupId`.
 */
export function testAttestation(
  refs: ReadonlyMap<string, { version: number; group_id: string }>,
  contextGroupId: string,
  spec: TestContextSpec = {},
): CjaContextAttestation {
  const ids = spec.inputs ?? DEFAULT_OBSERVATIONS.map((o) => o.id);
  const triggerId = spec.trigger ?? ids[0]!;
  const input = (id: string) => {
    const r = refs.get(id)!;
    return {
      owner: SYNTH_CJA_OBSERVATION_OWNER,
      fact_key: observationKey(id),
      version: r.version,
      read: { basis: "AS-OF-NOW" as const },
      committed_by_group_id: r.group_id,
    };
  };
  const trigger = input(triggerId);
  const trigger_ref = {
    owner: trigger.owner,
    fact_key: trigger.fact_key,
    version: trigger.version,
    committed_by_group_id: trigger.committed_by_group_id,
  };
  const distinction = spec.distinction ?? {
    referent_key: TEST_REFERENT_KEY,
    scope_key: TEST_SCOPE_KEY,
    context_id: TEST_CONTEXT_ID,
  };
  const causal_process_id = cjaCausalProcessId(trigger_ref);
  const updateId = cjaCultureUpdateId({
    causal_process_id,
    opportunity_id: "CJA_V1_SINGLE_EVALUATION",
    distinction_digest: cjaDistinctionDigest(distinction),
    owner_operation_id: CJA_TEST_CONSUMER.operation,
  });
  return {
    context: {
      owner: SYNTH_CJA_CONTEXT_OWNER,
      fact_key: testContextKey(updateId),
      version: 1,
      committed_by_group_id: contextGroupId,
    },
    distinction,
    trigger_ref,
    causal_process_id,
    opportunity_id: "CJA_V1_SINGLE_EVALUATION",
    owner_operation_id: CJA_TEST_CONSUMER.operation,
    inputs: ids.map(input),
    constituency: spec.constituency === undefined ? testConstituency() : spec.constituency,
    consumer_question: spec.consumer_question ?? TEST_CONSUMER_QUESTION,
  };
}

/** The test-owned sealed-context group: reads every input at its version and depends on each committing group. */
export function testContextGroup(
  campaignId: string,
  n: number,
  attestation: CjaContextAttestation,
): CommitGroup {
  const reads = [...new Map(attestation.inputs.map((i) => [i.fact_key, i])).values()].map((i) => ({
    key: i.fact_key,
    version: i.version,
  }));
  const depends_on = [...new Set(attestation.inputs.map((i) => i.committed_by_group_id))];
  return cjaPublicationGroup(
    campaignId,
    "ctx",
    CONTEXT_FACET,
    n,
    [
      {
        key: attestation.context.fact_key,
        owner: SYNTH_CJA_CONTEXT_OWNER,
        facet: CONTEXT_FACET,
        value: attestation as never,
        unit: null,
        basis: "cja-context-fixture-basis",
        secrecy: "cja-context-fixture-secrecy",
        expected_version: 0,
      },
    ],
    {
      group_id: attestation.context.committed_by_group_id,
      intent_id: `cja-ctx-intent-${n}`,
      owner: SYNTH_CJA_CONTEXT_OWNER,
      reads,
      depends_on,
    },
  );
}

/** PORT A stand-in: reads the test-owned sealed context back as its attestation. Expressly NOT production Culture. */
export class TestContextPort implements CultureAdjudicationContextPort {
  readonly #store: Pick<CampaignStore, "getFact">;
  constructor(store: Pick<CampaignStore, "getFact">) {
    this.#store = store;
  }
  attest(cultureUpdateId: string): CultureContextLookup {
    const fact = this.#store.getFact(testContextKey(cultureUpdateId));
    return fact ? { status: "ATTESTED", attestation: fact.value } : { status: "ABSENT" };
  }
}

// -- scripted judgments ------------------------------------------------------------------------------------------------

export type ScriptedKind = "positive" | "not_supported" | "unresolved" | "derive";

const finding = (
  status: CjaFinding["status"],
  reason: string,
  att: CjaContextAttestation,
  ids: readonly string[],
): CjaFinding => ({
  status,
  reason: `SYNTHETIC FIXTURE: ${reason}`,
  citations: ids.map((id) => {
    const i = att.inputs.find((x) => x.fact_key === observationKey(id))!;
    return { owner: i.owner, fact_key: i.fact_key, version: i.version };
  }),
  no_citation_reason: null,
});

/**
 * A scripted adjudicator's judgment over the sealed inputs. The positive script assesses the default observations as
 * SUPPORTS / SUPPORTS / CONTRADICTS / NOT_PROBATIVE and accounts for the contradiction in finding A. Every script is
 * citation-closed over the same sealed context, so the SAME context admits all four outcomes (CJA1 §10.B C7).
 */
export function scriptedJudgment(
  att: CjaContextAttestation,
  kind: ScriptedKind,
  over: Partial<CjaAuthoredJudgment> = {},
): CjaAuthoredJudgment {
  const classes: Record<string, CjaAssessment["classification"]> = {
    "obs-trigger": "SUPPORTS",
    "obs-repeat": "SUPPORTS",
    "obs-deviation": "CONTRADICTS",
    "obs-bystander": "NOT_PROBATIVE",
  };
  const assessment: CjaAssessment[] = att.inputs.map((i) => {
    const id = i.fact_key.slice(OBSERVATION_PREFIX.length);
    return {
      ref: { owner: i.owner, fact_key: i.fact_key, version: i.version },
      classification: classes[id] ?? "NOT_PROBATIVE",
      reason: `SYNTHETIC FIXTURE: how ${id} bears on the question.`,
    };
  });
  const has = (id: string) => att.inputs.some((i) => i.fact_key === observationKey(id));
  const cite = (ids: string[]) => ids.filter(has);
  const base = {
    culture_update_id: cjaCultureUpdateId({
      causal_process_id: att.causal_process_id,
      opportunity_id: att.opportunity_id,
      distinction_digest: cjaDistinctionDigest(att.distinction),
      owner_operation_id: att.owner_operation_id,
    }),
    rule_ref: CJA_TEST_RULE,
    assessment,
  };
  const A = (status: CjaFinding["status"]) =>
    finding(
      status,
      "continuing recognition of the practice among the participants",
      att,
      cite(["obs-trigger", "obs-repeat", "obs-deviation"]),
    );
  const B = (status: CjaFinding["status"]) =>
    finding(
      status,
      "no other owner's state answers the social question faithfully or cheaply",
      att,
      cite(["obs-trigger"]),
    );
  const C = (status: CjaFinding["status"]) =>
    finding(status, "the practice may materially alter a later answer", att, cite(["obs-repeat"]));
  const judgment: CjaAuthoredJudgment =
    kind === "positive"
      ? {
          ...base,
          findings: { A: A("SATISFIED"), B: B("SATISFIED"), C: C("SATISFIED") },
          verdict: "ESTABLISH_SUPPORTED",
          candidate_manifestation: TEST_MANIFESTATION,
          material_uncertainty: null,
        }
      : kind === "not_supported"
        ? {
            ...base,
            findings: { A: A("NOT_SATISFIED"), B: B("SATISFIED"), C: C("UNRESOLVED") },
            verdict: "NOT_SUPPORTED",
            candidate_manifestation: null,
            material_uncertainty: null,
          }
        : kind === "unresolved"
          ? {
              ...base,
              findings: { A: A("UNRESOLVED"), B: B("UNRESOLVED"), C: C("UNRESOLVED") },
              verdict: "UNRESOLVED",
              candidate_manifestation: null,
              material_uncertainty:
                "SYNTHETIC FIXTURE: the sealed observations leave the question open.",
            }
          : {
              ...base,
              findings: { A: A("SATISFIED"), B: B("NOT_SATISFIED"), C: C("SATISFIED") },
              verdict: "DERIVE_WITHOUT_PERSISTENCE",
              candidate_manifestation: null,
              material_uncertainty: null,
            };
  return { ...judgment, ...over };
}

export const GM_OPERATION = { ...GM_ADJUDICATION_AUTHORITY };
