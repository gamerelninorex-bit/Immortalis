import {
  CohortFactSchema,
  ConsequenceRegisterSchema,
  ExternalCriterionSchema,
  OWNER_POPULATION,
  POPULATION_OPERATION_RECONCILE,
  PopulationBasisSchema,
  ReconciliationCloseSchema,
  WorldLocusSchema,
  compareTime,
  populationCloseKey,
  populationLedgerKey,
  timeEquals,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type ConsequenceEnvelope,
  type ExternalCriterion,
  type PopulationBasis,
  type PopulationUnit,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { applyEnvelopes, composeCohortResult, eligibleEnvelopes } from "./derive.ts";

/**
 * IM-11 admission for the IM-04 Population owner (IM-03 owner resolution; WS-001 §1, §35; WS-015 §III,
 * §VI, §VII, §IX). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much
 * as for the reconciliation operation. Key-space exclusivity (nobody but `population`/`population_state`
 * can write a Population key) is enforced by the owner registry before this runs; this enforces that even
 * Population itself can change its state only in one of three lawful ways:
 *
 *  1. ESTABLISHMENT of a ledger: one group, one fact, attached to an already-committed world locus.
 *  2. INSTANTIATION of one Cohort reference: one group, one fact, no result yet, of an existing ledger.
 *  3. ORDINARY RECONCILIATION: one group that advances the ledger, the close and (some of) the Cohort
 *     results together. The group is RE-DERIVED here from the foreign facts it pinned — the consequence
 *     registers and the criterion facts — so a committed close is exactly Closing = Opening + Entries −
 *     Exits over the eligible, previously unconsumed typed envelopes (all of them, each once), every
 *     unit changes only by an envelope, and every Cohort result is exactly what Population composes from
 *     the new units and the criterion established at that SAME resolution point.
 *
 * A consumer, a criterion owner or a causal owner therefore cannot write count or membership, and
 * Population cannot write a count that its own typed inputs do not produce.
 */
export function populationGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  const ws = group.writes;
  const ledgerIds = new Set(ws.map((w) => resolveKey(w.key)?.ids[0]));
  if (ledgerIds.size !== 1) {
    return reject("VALUE_INVALID", "one Population group concerns exactly one ledger");
  }
  const ledgerId = [...ledgerIds][0] as string;
  const ledgerKey = populationLedgerKey(ledgerId);
  const ledgerW = ws.filter((w) => kindOf(w.key) === "population_ledger");
  const cohortWs = ws.filter((w) => kindOf(w.key) === "population_cohort");

  if (ledgerW.length === 1 && ledgerW[0]!.expected_version === 0) {
    if (ws.length !== 1) {
      return reject("VALUE_INVALID", "a ledger is established alone");
    }
    return checkEstablishment(group, state, ledgerW[0]!.value);
  }
  if (ledgerW.length === 0 && cohortWs.length === 1 && ws.length === 1) {
    const w = cohortWs[0]!;
    if (w.expected_version !== 0) {
      return reject(
        "AMENDMENT_NOT_SUPPORTED",
        "a Cohort result advances only inside a reconciliation that advances the ledger",
        { key: w.key },
      );
    }
    return checkInstantiation(group, state, ledgerKey, w.key, w.value);
  }
  if (ledgerW.length === 1) return checkReconciliation(group, state, ledgerKey, ledgerId);
  return reject(
    "VALUE_INVALID",
    "Population state changes only by establishment, Cohort instantiation or an ordinary reconciliation",
  );
}

function checkEstablishment(
  group: CommitGroup,
  state: CampaignState,
  value: unknown,
): Rejection | null {
  const l = PopulationBasisSchema.parse(value);
  if (l.basis_stamp.basis.kind !== "ESTABLISHMENT" || l.basis_stamp.constituents.length > 0) {
    return reject("VALUE_INVALID", "an established ledger carries an ESTABLISHMENT basis stamp");
  }
  if (l.consumed_envelopes.length > 0) {
    return reject("VALUE_INVALID", "a newly established ledger has consumed nothing");
  }
  const { world, locus } = l.locality;
  const locusKey = worldLocusKey(world.entity_id, locus.entity_id);
  if (world.fact_key !== worldProfileKey(world.entity_id) || locus.fact_key !== locusKey) {
    return reject("REFERENCE_INVALID", "locality references do not match their key identities");
  }
  const w = requirePrerequisite(group, state, world.fact_key, "the world profile");
  if (isRejection(w)) return w;
  const lo = requirePrerequisite(group, state, locusKey, "the world locus");
  if (isRejection(lo)) return lo;
  const committed = WorldLocusSchema.safeParse(lo.fact.value);
  if (!committed.success || committed.data.world.entity_id !== world.entity_id) {
    return reject("REFERENCE_INVALID", "the locus does not belong to the world", { key: locusKey });
  }
  return null;
}

function checkInstantiation(
  group: CommitGroup,
  state: CampaignState,
  ledgerKey: string,
  key: string,
  value: unknown,
): Rejection | null {
  const c = CohortFactSchema.parse(value);
  const ids = resolveKey(key)!.ids;
  if (c.ref.cohort_id !== ids[1] || populationLedgerKey(c.ref.scope.ledger_id) !== ledgerKey) {
    return reject("VALUE_INVALID", "the Cohort identity does not match its key", { key });
  }
  if (c.result !== null) {
    return reject(
      "VALUE_INVALID",
      "a Cohort is instantiated without a result; Population composes it",
    );
  }
  if (c.ref.cardinality_semantics === "BOUNDED") {
    return reject(
      "VALUE_INVALID",
      "no evidence source for a bounded Cohort exists in this slice; it is not derived by assumption",
      { key },
    );
  }
  const ledger = requirePrerequisite(group, state, ledgerKey, "the Population ledger");
  if (isRejection(ledger)) return ledger;
  if (PopulationBasisSchema.parse(ledger.fact.value).unit_class !== c.ref.unit_class) {
    return reject("REFERENCE_INVALID", "the Cohort's unit class is not the ledger's", { key });
  }
  const crit = c.ref.criterion.ref;
  if (crit && resolveKey(crit.fact_key)) {
    return reject(
      "REFERENCE_INVALID",
      "an external criterion lives in its owner's own key space, never in a Population or canonical one",
      { key },
    );
  }
  const expected = [{ fact_key: ledgerKey }, ...(crit ? [{ fact_key: crit.fact_key }] : [])];
  if (!canonicalEqual(c.ref.invalidators, expected)) {
    return reject(
      "VALUE_INVALID",
      "a Cohort is invalidated by exactly its ledger and its external criterion",
      { key },
    );
  }
  return null;
}

function checkReconciliation(
  group: CommitGroup,
  state: CampaignState,
  ledgerKey: string,
  ledgerId: string,
): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  const closeKey = populationCloseKey(ledgerId);
  const ledgerW = group.writes.find((w) => w.key === ledgerKey)!;
  const closeW = group.writes.find((w) => w.key === closeKey);
  const cohortWs = group.writes.filter((w) => kindOf(w.key) === "population_cohort");
  if (!closeW || group.writes.length !== 2 + cohortWs.length) {
    return bad(
      "a reconciliation writes the ledger, its close and Cohort results, and nothing else",
    );
  }
  const priorFact = state.facts.get(ledgerKey)!;
  const pl = PopulationBasisSchema.parse(priorFact.value);
  const nl = PopulationBasisSchema.parse(ledgerW.value);
  const c = ReconciliationCloseSchema.parse(closeW.value);

  if (
    c.ledger_id !== ledgerId ||
    c.close_stage.owner_operation.owner !== OWNER_POPULATION ||
    c.close_stage.owner_operation.operation !== POPULATION_OPERATION_RECONCILE
  ) {
    return bad("the close is the ledger's Population reconciliation close");
  }
  if (
    !canonicalEqual(
      { a: pl.ledger_id, b: pl.unit_class, c: pl.locality, d: pl.overlap },
      { a: nl.ledger_id, b: nl.unit_class, c: nl.locality, d: nl.overlap },
    )
  ) {
    return bad("a reconciliation cannot change the ledger's identity, class or locality");
  }
  if (
    c.opening.count !== pl.count.count ||
    c.opening.ledger_version !== priorFact.version ||
    c.closing.count !== nl.count.count ||
    c.closing.ledger_version !== priorFact.version + 1
  ) {
    return bad("the close's opening and closing are not the ledger it advances");
  }
  const basis = nl.basis_stamp.basis;
  if (
    basis.kind !== "RECONCILIATION_CLOSE" ||
    !timeEquals(basis.resolution_point, c.resolution_point)
  ) {
    return bad("the ledger is stamped with the close it was composed at");
  }
  const before =
    pl.basis_stamp.basis.kind === "ESTABLISHMENT"
      ? pl.basis_stamp.basis.point
      : pl.basis_stamp.basis.resolution_point;
  if (compareTime(before, c.resolution_point) !== -1) {
    return bad("a close resolves at a point after the basis it opens from");
  }
  const readsPinned = group.reads.map((r) => ({ key: r.key, version: r.version }));
  if (!canonicalEqual(nl.basis_stamp.constituents, readsPinned)) {
    return bad("the ledger's constituent stamps are exactly the foreign facts the group pinned");
  }

  // The typed envelopes the group pinned, from their authoritative writers' own registers.
  const envelopes: ConsequenceEnvelope[] = [];
  const criteria = new Map<string, { value: ExternalCriterion; version: number; owner: string }>();
  for (const r of group.reads) {
    const fact = state.facts.get(r.key);
    if (!fact) continue;
    const register = ConsequenceRegisterSchema.safeParse(fact.value);
    if (register.success) {
      if (register.data.ledger_id !== ledgerId) continue;
      for (const e of register.data.envelopes) {
        if (e.writer.owner !== fact.owner) {
          return bad("an envelope's writer must be the owner of the register that carries it", {
            envelope_id: e.envelope_id,
          });
        }
        envelopes.push(e);
      }
      continue;
    }
    const crit = ExternalCriterionSchema.safeParse(fact.value);
    if (crit.success)
      criteria.set(r.key, { value: crit.data, version: fact.version, owner: fact.owner });
  }
  if (new Set(envelopes.map((e) => e.envelope_id)).size !== envelopes.length) {
    return bad("an envelope is carried by two registers");
  }
  const eligible = eligibleEnvelopes(envelopes, pl, c.resolution_point);
  if (!eligible.ok) return bad(eligible.error.message, eligible.error.details);
  const applied = applyEnvelopes(pl.units, eligible.value);
  if (!applied.ok) return bad(applied.error.message, applied.error.details);
  const a = applied.value;
  if (
    !canonicalEqual(c.consumed_envelopes, a.consumed) ||
    !canonicalEqual(c.entries, a.entries) ||
    !canonicalEqual(c.exits, a.exits)
  ) {
    return bad(
      "a close consumes every eligible unconsumed envelope it pinned, each exactly once, as typed Entries and Exits",
    );
  }
  if (
    !canonicalEqual(nl.units, a.units) ||
    !canonicalEqual(nl.consumed_envelopes, [...pl.consumed_envelopes, ...a.consumed].sort())
  ) {
    return bad("units change only by the typed envelopes consumed; consumption is recorded once");
  }
  return checkCohorts(
    state,
    ledgerKey,
    ledgerId,
    nl,
    pl,
    c.resolution_point,
    a.units,
    cohortWs,
    criteria,
    priorFact.version,
  );
}

function checkCohorts(
  state: CampaignState,
  ledgerKey: string,
  ledgerId: string,
  nl: PopulationBasis,
  _pl: PopulationBasis,
  point: { unit: string; value: number },
  units: readonly PopulationUnit[],
  cohortWs: CommitGroup["writes"],
  criteria: Map<string, { value: ExternalCriterion; version: number; owner: string }>,
  priorLedgerVersion: number,
): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  for (const w of cohortWs) {
    const prior = state.facts.get(w.key);
    if (!prior || w.expected_version === 0) {
      return reject(
        "AMENDMENT_NOT_SUPPORTED",
        "a Cohort is instantiated on its own, not inside a reconciliation",
        {
          key: w.key,
        },
      );
    }
    const was = CohortFactSchema.parse(prior.value);
    const now = CohortFactSchema.parse(w.value);
    if (!canonicalEqual(was.ref, now.ref) || now.ref.scope.ledger_id !== ledgerId) {
      return bad("a reconciliation recomposes a Cohort's result and never its reference", {
        key: w.key,
      });
    }
    if (now.result === null)
      return bad("a reconciled Cohort carries its composed result", { key: w.key });
    let criterion: ExternalCriterion | null = null;
    const constituents = [{ key: ledgerKey, version: priorLedgerVersion + 1 }];
    const ref = now.ref.criterion.ref;
    if (ref && now.ref.cardinality_semantics !== "UNQUANTIFIED") {
      const read = criteria.get(ref.fact_key);
      if (!read || read.owner !== now.ref.criterion.owner) {
        return reject(
          "REFERENCE_INVALID",
          "an external Cohort is composed from its Criterion Owner's pinned fact",
          {
            key: w.key,
          },
        );
      }
      // WS-015 §VII: closed Population units are never combined with a criterion of another basis.
      if (!timeEquals(read.value.resolution_point, point as never)) {
        return bad(
          "the criterion is not established at the Population composition point (mixed basis)",
          {
            key: w.key,
          },
        );
      }
      criterion = read.value;
      constituents.push({ key: ref.fact_key, version: read.version });
    }
    const expected = composeCohortResult(now.ref, units, criterion, {
      basis: nl.basis_stamp.basis,
      constituents,
    });
    if (!canonicalEqual(now.result, expected)) {
      return bad("a Cohort result is exactly what Population composes at the close", {
        key: w.key,
      });
    }
  }
  return null;
}
