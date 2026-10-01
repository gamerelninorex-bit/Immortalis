import {
  CohortFactSchema,
  DurableCompletionEnvelopeSchema,
  EconomyDemandEnvelopeSchema,
  EconomyRealizationSchema,
  FallbackPhysicalEntitySchema,
  PopulationBasisSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  WorldLocusSchema,
  compareTime,
  economyDemandKey,
  economyRealizationKey,
  economyRealizationStage,
  economyRequestId,
  economyRequestKey,
  populationCohortKey,
  populationLedgerKey,
  productionOutputReference,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import { deriveEconomyRequest, deriveRealization } from "./derive.ts";

/**
 * IM-11 admission for the IM-06 Economy owner (IM-03 owner resolution; WS-004 §§2, 5, 8, 11, 20, 21, 27; WS-003
 * §13A). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the owner
 * operation. Key-space exclusivity (nobody but `economy`/`economy_state` can write an Economy key, and Economy
 * can write no Population, Production, World-State or kernel key) is enforced by the owner registry before this
 * runs; this enforces that even Economy itself can change its state only in one of two lawful ways, both
 * create-only (the kinds are SEALED, so a demand, its request and a realized result can never be rewritten):
 *
 *  1. ISSUANCE of one demand with its one Production Request, atomically: a Demand Envelope whose carrier is an
 *     already-committed Population Unit or Cohort (referenced and pinned, never copied), fixed together with the
 *     one request it allocates to, which is RE-DERIVED from the demand; and the pre-commit availability — no
 *     supply exists for that request — read AS-OF-NOW at the canonical temporal basis and sealed with it.
 *     Nothing in it creates supply, holds stock or reserves anything.
 *  2. REALIZATION of access, only as its IM-02 stage and only from the committed chain: the request, the
 *     completed Production operation, its Durable Completion Envelope and the World-State custodian's accepted
 *     entity are read at their current versions and the result is RE-DERIVED from them (`deriveRealization`). A
 *     Production completion without the custodian's acceptance has no entity to read, so it can never be
 *     realized, whoever publishes the group.
 */
export function economyGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  const ws = group.writes;
  const of = (id: string) => ws.filter((w) => kindOf(w.key) === id);
  const demandW = of("economy_demand");
  const requestW = of("economy_request");
  const realW = of("economy_realization");

  if (
    demandW.length === 1 &&
    requestW.length === 1 &&
    realW.length === 0 &&
    ws.length === 2 &&
    demandW[0]!.expected_version === 0 &&
    requestW[0]!.expected_version === 0
  ) {
    return checkIssuance(group, state, demandW[0]!, requestW[0]!);
  }
  if (realW.length === 1 && ws.length === 1 && realW[0]!.expected_version === 0) {
    return checkRealization(group, state, realW[0]!);
  }
  return reject(
    "VALUE_INVALID",
    "Economy state changes only by issuing one demand with its one Production Request, or by recording the realized access of an accepted result",
  );
}

type Write = CommitGroup["writes"][number];

function checkIssuance(
  group: CommitGroup,
  state: CampaignState,
  demandW: Write,
  requestW: Write,
): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  const ref = (message: string, details?: Record<string, unknown>) =>
    reject("REFERENCE_INVALID", message, details);
  const d = EconomyDemandEnvelopeSchema.parse(demandW.value);
  const req = ProductionRequestSchema.parse(requestW.value);
  const id = d.demand_envelope_id;

  // identities: derived from the demand identity alone
  const requestId = economyRequestId(id);
  if (
    demandW.key !== economyDemandKey(id) ||
    d.allocation.request.request_id !== requestId ||
    d.allocation.request.fact_key !== economyRequestKey(requestId) ||
    requestW.key !== d.allocation.request.fact_key
  ) {
    return ref("the demand, its request and their keys are those derived from the demand identity");
  }
  // the request is exactly what the demand allocates: Economy cannot issue a different one, or a second one
  if (!canonicalEqual(req, deriveEconomyRequest(d))) {
    return bad(
      "the Production Request is exactly the output the demand allocates, at its locality",
    );
  }

  // the canonical locality, referenced (never copied) and pinned
  const { world, locus } = d.material_scope;
  const locusKey = worldLocusKey(world.entity_id, locus.entity_id);
  if (world.fact_key !== worldProfileKey(world.entity_id) || locus.fact_key !== locusKey) {
    return ref("locality references do not match their key identities");
  }
  const w = requirePrerequisite(group, state, world.fact_key, "the world profile");
  if (isRejection(w)) return w;
  const lo = requirePrerequisite(group, state, locusKey, "the world locus");
  if (isRejection(lo)) return lo;
  const committedLocus = WorldLocusSchema.safeParse(lo.fact.value);
  if (!committedLocus.success || committedLocus.data.world.entity_id !== world.entity_id) {
    return ref("the locus does not belong to the world", { key: locusKey });
  }

  // the carrier: an already-committed Population Unit or Cohort (WS-004 §5.1, §5.3, §27.1); Economy owns none
  // of its count, membership or identity and records only the identity and the pinned version it resolved
  const ledgerKey = populationLedgerKey(d.carrier_ref.ledger_id);
  const pin = d.carrier_basis_ref;
  if (pin.ledger.fact_key !== ledgerKey) return ref("the carrier's ledger pin is not its ledger");
  const ledgerP = requirePrerequisite(group, state, ledgerKey, "the Population ledger");
  if (isRejection(ledgerP)) return ledgerP;
  if (ledgerP.fact.version !== pin.ledger.version)
    return ref("the carrier is pinned at the committed ledger version", { key: ledgerKey });
  const ledger = PopulationBasisSchema.safeParse(ledgerP.fact.value);
  if (!ledger.success) return ref("the pinned fact is not a Population ledger", { key: ledgerKey });
  if (
    !canonicalEqual(ledger.data.locality.world, d.material_scope.world) ||
    !canonicalEqual(ledger.data.locality.locus, d.material_scope.locus)
  ) {
    return ref("the demand is carried at its carrier's own locality", { key: ledgerKey });
  }
  if (d.carrier_ref.kind === "POPULATION_UNIT") {
    const unitId = d.carrier_ref.unit_id;
    if (!ledger.data.units.some((u) => u.unit_id === unitId)) {
      return ref("the carrier is not a Population Unit of that ledger", { unit_id: unitId });
    }
  } else {
    const cohortKey = populationCohortKey(d.carrier_ref.ledger_id, d.carrier_ref.cohort_id);
    if (pin.cohort?.fact_key !== cohortKey)
      return ref("the carrier's Cohort pin is not its Cohort");
    const cohortP = requirePrerequisite(group, state, cohortKey, "the Population Cohort");
    if (isRejection(cohortP)) return cohortP;
    if (cohortP.fact.version !== pin.cohort.version)
      return ref("the carrier is pinned at the committed Cohort version", { key: cohortKey });
    const cohort = CohortFactSchema.safeParse(cohortP.fact.value);
    if (
      !cohort.success ||
      cohort.data.ref.cohort_id !== d.carrier_ref.cohort_id ||
      cohort.data.ref.scope.ledger_id !== d.carrier_ref.ledger_id
    ) {
      return ref("the pinned fact is not a Cohort of that ledger", { key: cohortKey });
    }
    const result = cohort.data.result;
    if (!result || result.cardinality.semantics !== "EXACT" || result.cardinality.count < 1) {
      return bad(
        "a Cohort carries a demand only when Population has composed it with exact, non-empty membership",
        { key: cohortKey },
      );
    }
  }

  // WS-004 §27.2: pre-commit availability AS-OF-NOW at the canonical basis, sealed with the demand. Demand does
  // not create supply: none exists for this request when it is committed.
  const pre = d.pre_commit_availability;
  const clock = requirePrerequisite(
    group,
    state,
    TEMPORAL_STATE_KEY,
    "the canonical temporal state",
  );
  if (isRejection(clock)) return clock;
  const now = TemporalStateSchema.parse(clock.fact.value).canonical_time;
  if (clock.fact.version !== pre.temporal_state.version || compareTime(now, pre.at) !== 0) {
    return bad(
      "the pre-commit availability is read AS-OF-NOW at the canonical temporal basis it is committed at",
    );
  }
  const supply = worldFallbackEntityKey(world.entity_id, productionOutputReference(requestId));
  if (state.facts.has(supply)) {
    return bad("demand does not create supply: a physical result already exists for this request", {
      key: supply,
    });
  }
  return null;
}

function checkRealization(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  const r = EconomyRealizationSchema.parse(w.value);
  if (w.key !== economyRealizationKey(r.demand_envelope_id)) {
    return reject("REFERENCE_INVALID", "a realization is at the key derived from its demand", {
      key: w.key,
    });
  }
  // every upstream fact is read at its CURRENT version and depended upon (a stage pins what it read)
  const need = (key: string, what: string) => requirePrerequisite(group, state, key, what);
  const demandP = need(r.demand.fact_key, "the originating demand");
  if (isRejection(demandP)) return demandP;
  const requestP = need(r.request.fact_key, "the Production Request");
  if (isRejection(requestP)) return requestP;
  const opP = need(r.production.operation.fact_key, "the Production operation");
  if (isRejection(opP)) return opP;
  const completionP = need(r.production.completion.fact_key, "the Durable Completion Envelope");
  if (isRejection(completionP)) return completionP;
  const entityP = need(r.delivery_result.fact_key, "the World-State custodian's accepted entity");
  if (isRejection(entityP)) return entityP;

  const demand = EconomyDemandEnvelopeSchema.safeParse(demandP.fact.value);
  const request = ProductionRequestSchema.safeParse(requestP.fact.value);
  const op = ProductionOperationSchema.safeParse(opP.fact.value);
  const completion = DurableCompletionEnvelopeSchema.safeParse(completionP.fact.value);
  const entity = FallbackPhysicalEntitySchema.safeParse(entityP.fact.value);
  if (
    !demand.success ||
    !request.success ||
    !op.success ||
    !completion.success ||
    !entity.success
  ) {
    return reject(
      "REFERENCE_INVALID",
      "a realization reads a demand, request, operation, completion and entity",
    );
  }
  const derived = deriveRealization({
    demand: { key: demandP.fact.key, version: demandP.fact.version, value: demand.data },
    request: { key: requestP.fact.key, version: requestP.fact.version, value: request.data },
    operation: { key: opP.fact.key, version: opP.fact.version, value: op.data },
    completion: {
      key: completionP.fact.key,
      version: completionP.fact.version,
      value: completion.data,
    },
    entity: { key: entityP.fact.key, version: entityP.fact.version, value: entity.data },
    at: r.realized_at,
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key });
  if (!canonicalEqual(derived.value, r)) {
    return bad(
      "realized access is exactly what the accepted chain determines: the demanded good once, at the operation's boundary",
      { key: w.key },
    );
  }
  // published only as the IM-02 stage it is (the one rule load-time verification also applies): a raw
  // publication of the identical group under any other identity is not a realization
  const identity = stageAuthorityViolation(
    group,
    economyRealizationStage(op.data.operation_id),
    state.facts,
    op.data.timing.completion.at,
    "ADMISSION",
  );
  if (identity) return reject("REFERENCE_INVALID", identity, { key: w.key });
  return null;
}
