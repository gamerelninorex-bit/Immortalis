import {
  CohortFactSchema,
  DISCRETE_POPULATION_FACETS,
  OWNER_POPULATION,
  POPULATION_CLOSE_BASIS,
  ReconciliationCloseSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  populationCloseKey,
  type CanonicalTime,
  type CjaConstituencyRef,
  type OwnerFact,
  type PendingConsequenceBarrier,
  type SourceFactRef,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { populationBarrierEvaluator } from "../population/barrier.ts";
import type {
  PopulationCloseScopeVerifier,
  ScopeCloseVerdict,
} from "../culture-adjudication/ports.ts";

/**
 * The REAL PORT B (F-027-CJA1 §§5.1, 9.1) — `PopulationCloseScopeVerifier` — used AT CONTEXT SEAL, never at the Culture close.
 * It delegates to Population's own lawful evidence and invents no close, authority or producer:
 *
 *  (a) the Cohort is a committed Population fact stamped at exactly the named ordinary close (`closeSourceLawful`: the
 *      ledger's LATEST close, of the named basis, whose resolution point the Cohort's composed result carries);
 *  (b) the PCB-01 pending-consequence question, asked of Population's own barrier evaluator over the consumer-declared
 *      consequence sources at the seal instant, finds NO reconciliation due for the engaged membership scope — when one is
 *      due the seal STOPS (the last committed close is never pinned stale, and no close is forged);
 *  (c) the reference is CURRENT-ONLY at seal: the Cohort's present version and committing group.
 *
 * The verdict carries a LIVE vouch whose evidence is exactly what admission and load integrity re-derive from committed
 * Population state and the journal; no Cohort value, headcount or roster is copied. Pure over committed facts by identity: no
 * scan, no clock beyond the committed canonical time, no write.
 */

const COHORT_KEY = /^population\/([^/]+)\/cohort\/([^/]+)$/;

export type ScopeCheck =
  | { readonly ok: true; readonly constituency: CjaConstituencyRef }
  | {
      readonly ok: false;
      readonly reason: Extract<ScopeCloseVerdict, { lawful: false }>["reason"];
    };

/** The committed canonical time, or null when none is established. */
export function canonicalTimeOf(
  getFact: (key: string) => OwnerFact | undefined,
): CanonicalTime | null {
  const clock = getFact(TEMPORAL_STATE_KEY);
  const time = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  return time?.success ? time.data.canonical_time : null;
}

/** The scope-close question for one Cohort at one instant over the declared consequence sources. Deterministic. */
export function checkPopulationScope(
  getFact: (key: string) => OwnerFact | undefined,
  cohortFactKey: string,
  instant: CanonicalTime,
  consequenceSources: readonly SourceFactRef[],
): ScopeCheck {
  const invalid = { ok: false, reason: "COHORT_REFERENCE_INVALID" } as const;
  const m = COHORT_KEY.exec(cohortFactKey);
  if (!m || consequenceSources.length === 0) return invalid;
  const [, ledgerId, cohortId] = m as unknown as [string, string, string];
  const cohortFact = getFact(cohortFactKey);
  const cohort = cohortFact ? CohortFactSchema.safeParse(cohortFact.value) : undefined;
  if (!cohortFact || cohortFact.owner !== OWNER_POPULATION || !cohort?.success) return invalid;
  const closeKey = populationCloseKey(ledgerId);
  const closeFact = getFact(closeKey);
  const close = closeFact ? ReconciliationCloseSchema.safeParse(closeFact.value) : undefined;
  if (!closeFact || closeFact.owner !== OWNER_POPULATION || !close?.success) {
    return { ok: false, reason: "COHORT_NOT_AT_NAMED_CLOSE" };
  }
  // the declared consequence sources must cover every register the ledger's latest close actually consumed from: Population's
  // own evidence of where its pending consequences are carried. A declaration that omits a known register could hide a due
  // reconciliation, so it is not a scope close (a register Population has never consumed from stays host configuration).
  const declared = (src: SourceFactRef) =>
    consequenceSources.some((c) => c.owner === src.owner && c.fact_key === src.fact_key);
  if ([...close.data.entries, ...close.data.exits].some((e) => !declared(e.source))) return invalid;
  const barrier: PendingConsequenceBarrier = {
    barrier: "PCB-01",
    population: { ledger_id: ledgerId, cohort_id: cohortId },
    discrete_facets: [DISCRETE_POPULATION_FACETS[0]],
    consequence_sources: [...consequenceSources],
    reconciliation_object_id: "culture-seal-scope-check",
    close_basis: POPULATION_CLOSE_BASIS,
  };
  if (
    cohort.data.result === null ||
    !populationBarrierEvaluator.closeSourceLawful(barrier, cohortFact, getFact)
  ) {
    return { ok: false, reason: "COHORT_NOT_AT_NAMED_CLOSE" };
  }
  const due = populationBarrierEvaluator.evaluate(barrier, instant, getFact);
  if (due.due) return { ok: false, reason: "RECONCILIATION_DUE_NOT_COMPLETED" };
  return {
    ok: true,
    constituency: {
      cohort_fact_key: cohortFactKey,
      cohort_version: cohortFact.version,
      committed_by_group_id: cohortFact.provenance.group_id,
      close_basis: structuredClone(POPULATION_CLOSE_BASIS),
      close_vouch: {
        port: "PopulationCloseScopeVerifier",
        live_population_admission: true,
        reconciliation: "NOT_DUE",
        evidence: {
          ledger_id: ledgerId,
          cohort_id: cohortId,
          close_fact_key: closeKey,
          close_version: closeFact.version,
          instant: structuredClone(instant),
          consequence_sources: consequenceSources.map((s) => ({ ...s })),
        },
      },
    },
  };
}

/**
 * Re-derives a recorded constituency from COMMITTED state at the instant it names. Raw admission uses it at SEAL (with the
 * state's own canonical time, so an earlier instant cannot be forged): a forged, mismatched, stale, stand-in or due-but-
 * unreconciled binding differs from — or cannot be re-derived as — the recorded one. Returns a message, or null.
 */
export function populationScopeViolation(
  getFact: (key: string) => OwnerFact | undefined,
  c: CjaConstituencyRef,
  now: CanonicalTime,
): string | null {
  if (!c.close_vouch.live_population_admission) {
    return "a Culture context rests on a LIVE Population close-vouch";
  }
  const e = c.close_vouch.evidence;
  if (!canonicalEqual(e.instant, now)) {
    return "the Population scope close is vouched at the seal instant: the recorded instant is not the committed canonical time";
  }
  const check = checkPopulationScope(getFact, c.cohort_fact_key, now, e.consequence_sources);
  if (!check.ok) {
    return `the Population scope close does not hold at seal: ${check.reason}`;
  }
  return canonicalEqual(check.constituency, c)
    ? null
    : "the recorded constituency is not what committed Population state and its latest named close determine";
}

export interface PopulationScopeVerifierOptions {
  /**
   * The consumer-declared registers where pending consequence envelopes of the engaged ledger are carried (the PCB-01
   * `consequence_sources`): configured by the host's declared causal owners, never inferred. At least one is required.
   */
  readonly consequenceSources: readonly SourceFactRef[];
}

/** The real PORT B: Population's lawful close / PCB-01 due-reconciliation evidence, asked at the committed canonical time. */
export class PopulationScopeCloseVerifier implements PopulationCloseScopeVerifier {
  readonly #store: { getFact(key: string): OwnerFact | undefined };
  readonly #options: PopulationScopeVerifierOptions;

  constructor(
    store: { getFact(key: string): OwnerFact | undefined },
    options: PopulationScopeVerifierOptions,
  ) {
    this.#store = store;
    this.#options = options;
  }

  verifyScopeClose(cohortFactKey: string): ScopeCloseVerdict {
    const get = (k: string) => this.#store.getFact(k);
    const now = canonicalTimeOf(get);
    if (!now) return { lawful: false, reason: "COHORT_REFERENCE_INVALID" };
    const check = checkPopulationScope(get, cohortFactKey, now, this.#options.consequenceSources);
    return check.ok
      ? { lawful: true, constituency: check.constituency }
      : { lawful: false, reason: check.reason };
  }
}
