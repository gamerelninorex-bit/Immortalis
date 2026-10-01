import {
  CohortFactSchema,
  ConsequenceRegisterSchema,
  ExternalCriterionSchema,
  FACET_POPULATION_STATE,
  OWNER_POPULATION,
  POPULATION_CLOSE_BASIS,
  POPULATION_OPERATION_RECONCILE,
  PopulationBasisSchema,
  timeEquals,
  type BasisStamp,
  type ConsequenceEnvelope,
  type ExternalCriterion,
  type OwnerFact,
  type ReconciliationClose,
} from "@immortalis/contracts";
import { resolveKey, POPULATION_RULE } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { applyEnvelopes, composeCohortResult, eligibleEnvelopes } from "./derive.ts";

/**
 * IM-04 — the Population ordinary demographic/labor reconciliation operation (WS-001 §32), exposed to the
 * IM-02 coordinator through the owner-adapter seam. Pure and deterministic: identical input, identical
 * writes. It consumes every eligible, previously unconsumed typed envelope from the registers its
 * declaration reads (each exactly once), applies them as typed Entries and Exits, stamps the ordinary
 * close, and recomposes the Cohort results it was declared to produce — each from the new units and the
 * Criterion Owner's fact established at the SAME resolution point (`span.to`), or not at all.
 *
 * It invents nothing: no rate, no cadence, no default. A basis/secrecy label is inherited from the
 * authored facts it advances (never defaulted). When it cannot lawfully compose, it throws
 * StageUnresolvedError: the stage is not credited and nothing is published.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const populationStageProvider: StageProvider = {
  owner: OWNER_POPULATION,
  facet: FACET_POPULATION_STATE,
  operation: POPULATION_OPERATION_RECONCILE,
  rule: POPULATION_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const point = input.span.to;
    const byKind = (id: string) => input.produces.filter((k) => resolveKey(k)?.kind.id === id);
    const ledgerKey = byKind("population_ledger")[0];
    const closeKey = byKind("population_close")[0];
    const cohortKeys = byKind("population_cohort");
    if (!ledgerKey || !closeKey || byKind("population_ledger").length !== 1) {
      throw unresolved("SOURCE_INVALID", "a reconciliation produces one ledger and one close");
    }
    const priorLedger = input.prior.get(ledgerKey);
    if (!priorLedger) throw unresolved("SOURCE_ABSENT", "the ledger is not established");
    const pl = PopulationBasisSchema.parse(priorLedger.value);

    // Cohorts first, so an external criterion is recognized and never mistaken for a register.
    const cohorts = cohortKeys.map((k) => {
      const f = input.prior.get(k);
      if (!f) throw unresolved("SOURCE_ABSENT", "a produced Cohort is not instantiated");
      return { key: k, fact: f, value: CohortFactSchema.parse(f.value) };
    });
    const criterionKeys = new Set(
      cohorts.flatMap((c) =>
        c.value.ref.criterion.ref ? [c.value.ref.criterion.ref.fact_key] : [],
      ),
    );
    const envelopes: ConsequenceEnvelope[] = [];
    const criteria = new Map<string, { value: ExternalCriterion; fact: OwnerFact }>();
    for (const r of input.reads) {
      if (criterionKeys.has(r.fact.key)) {
        const c = ExternalCriterionSchema.safeParse(r.fact.value);
        if (!c.success) throw unresolved("SOURCE_INVALID", "an external criterion is malformed");
        criteria.set(r.fact.key, { value: c.data, fact: r.fact });
        continue;
      }
      const reg = ConsequenceRegisterSchema.safeParse(r.fact.value);
      if (!reg.success) throw unresolved("SOURCE_INVALID", "a consequence register is malformed");
      if (reg.data.ledger_id !== pl.ledger_id) continue;
      for (const e of reg.data.envelopes) {
        if (e.writer.owner !== r.fact.owner)
          throw unresolved("SOURCE_INVALID", "an envelope's writer is not its register's owner");
        envelopes.push(e);
      }
    }
    if (new Set(envelopes.map((e) => e.envelope_id)).size !== envelopes.length)
      throw unresolved("SOURCE_INVALID", "an envelope is carried by two registers");

    const eligible = eligibleEnvelopes(envelopes, pl, point);
    if (!eligible.ok) throw unresolved("BASIS_MISMATCH", eligible.error.message);
    const applied = applyEnvelopes(pl.units, eligible.value);
    if (!applied.ok) throw unresolved("SOURCE_INVALID", applied.error.message);
    const a = applied.value;

    const stage = input.stage;
    const basis: BasisStamp["basis"] = {
      kind: "RECONCILIATION_CLOSE",
      close_basis: POPULATION_CLOSE_BASIS,
      resolution_point: point,
    };
    const readsPinned = input.reads.map((r) => ({ key: r.fact.key, version: r.fact.version }));
    const nextLedgerVersion = priorLedger.version + 1;

    const ledger = {
      ...pl,
      units: [...a.units],
      count: { semantics: "EXACT" as const, count: a.units.length },
      consumed_envelopes: [...pl.consumed_envelopes, ...a.consumed].sort(),
      basis_stamp: { basis, constituents: readsPinned },
    };
    const close: ReconciliationClose = {
      ledger_id: pl.ledger_id,
      close_basis: POPULATION_CLOSE_BASIS,
      close_stage: stage,
      resolution_point: point,
      opening: { count: pl.count.count, ledger_version: priorLedger.version },
      entries: [...a.entries],
      exits: [...a.exits],
      closing: { count: a.units.length, ledger_version: nextLedgerVersion },
      consumed_envelopes: [...a.consumed],
    };
    const inherit = (f: OwnerFact | undefined) => ({
      unit: null,
      basis: (f ?? priorLedger).basis,
      secrecy: (f ?? priorLedger).secrecy,
    });
    const writes: StageWrite[] = [
      { key: ledgerKey, value: ledger as never, ...inherit(priorLedger) },
      { key: closeKey, value: close as never, ...inherit(input.prior.get(closeKey)) },
    ];
    for (const c of cohorts) {
      let criterion: ExternalCriterion | null = null;
      const constituents: BasisStamp["constituents"] = [
        { key: ledgerKey, version: nextLedgerVersion },
      ];
      const ref = c.value.ref.criterion.ref;
      if (ref && c.value.ref.cardinality_semantics !== "UNQUANTIFIED") {
        const read = criteria.get(ref.fact_key);
        if (!read) throw unresolved("SOURCE_ABSENT", "the Criterion Owner's fact was not read");
        // WS-015 §VII: never compose closed Population units with a criterion of another basis.
        if (!timeEquals(read.value.resolution_point, point))
          throw unresolved(
            "BASIS_MISMATCH",
            "the criterion is not established at the Population composition point",
          );
        criterion = read.value;
        constituents.push({ key: ref.fact_key, version: read.fact.version });
      }
      const result = composeCohortResult(c.value.ref, a.units, criterion, { basis, constituents });
      writes.push({
        key: c.key,
        value: { ref: c.value.ref, result } as never,
        ...inherit(c.fact),
      });
    }
    return writes;
  },
};
