import {
  CohortFactSchema,
  DurableCompletionEnvelopeSchema,
  EconomyDemandEnvelopeSchema,
  EconomyRealizationSchema,
  FallbackPhysicalEntitySchema,
  OWNER_ECONOMY,
  PopulationBasisSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  ResolutionTransactionSchema,
  TemporalObjectSchema,
  economyDemandKey,
  economyRealizationStage,
  populationCohortKey,
  populationLedgerKey,
  productionObjectId,
  productionOutputReference,
  temporalObjectKey,
  worldFallbackEntityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { stageIdentityViolation } from "../production/admission.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { deriveEconomyRequest, deriveRealization } from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Economy state still tells
 * one story (IM-12 replay/recovery + IM-06 + the Population, Production and custodian facts it references).
 * Replay proves the HISTORY is intact and canonical integrity proves each fact's type; this proves the facts
 * still cohere:
 *
 *  - every demand has exactly the one request it allocated to, derived from it and published with it, its
 *    carrier is a committed Population fact at or beyond the pinned version (Population keeps advancing; the
 *    pin records what Economy resolved against and nothing is copied), and no supply existed when it was
 *    committed (a physical result for its request was accepted strictly after it);
 *  - every request belongs to a demand;
 *  - every realization is exactly what the committed chain determines — the same re-derivation admission uses —
 *    pins the versions it read, exists only for an accepted entity, is published only as its IM-02 stage, was
 *    committed after the acceptance it depends on, and is credited by a committed transaction or is an
 *    interrupted one awaiting its engaged, unretired boundary;
 *  - a retired boundary of an Economy-sourced operation never leaves an accepted result without its Economy
 *    consequence.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyEconomyIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "ECONOMY_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const ofKind = (id: string) => all.filter((f) => kindOf(f) === id);
  const demands = ofKind("economy_demand");
  const requests = ofKind("economy_request");
  const realizations = ofKind("economy_realization");
  if (demands.length + requests.length + realizations.length === 0) return out;

  const parsed = <T>(
    f: OwnerFact | undefined,
    schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  ): T | undefined => {
    if (!f) return undefined;
    const r = schema.safeParse(f.value);
    return r.success ? (r.data as T) : undefined;
  };
  const transactions = all
    .filter((f) => kindOf(f) === "resolution_transaction")
    .flatMap((f) => {
      const t = parsed(f, ResolutionTransactionSchema);
      return t ? [t] : [];
    });
  const cited = (groupId: string) =>
    transactions.some((t) => t.stages.some((s) => s.group_id === groupId));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;

  for (const df of demands) {
    const d = parsed(df, EconomyDemandEnvelopeSchema);
    if (!d) continue;
    const requestFact = byKey.get(d.allocation.request.fact_key);
    const request = parsed(requestFact, ProductionRequestSchema);
    if (
      !requestFact ||
      !request ||
      requestFact.owner !== OWNER_ECONOMY ||
      requestFact.version !== 1 ||
      !canonicalEqual(request, deriveEconomyRequest(d))
    ) {
      bad(
        df.key,
        "a demand has exactly the one Production Request it allocated to, derived from it",
      );
    } else if (requestFact.provenance.group_id !== df.provenance.group_id) {
      bad(df.key, "the demand and its request were not published atomically in one group");
    }
    // the carrier: a committed Population fact at or beyond the pinned version (referenced, never copied)
    const pin = d.carrier_basis_ref;
    const ledgerFact = byKey.get(populationLedgerKey(d.carrier_ref.ledger_id));
    const ledger = parsed(ledgerFact, PopulationBasisSchema);
    if (
      !ledgerFact ||
      !ledger ||
      ledgerFact.key !== pin.ledger.fact_key ||
      ledgerFact.version < pin.ledger.version ||
      !canonicalEqual(ledger.locality.world, d.material_scope.world) ||
      !canonicalEqual(ledger.locality.locus, d.material_scope.locus)
    ) {
      bad(df.key, "a demand's carrier is a committed Population ledger at its own locality");
    }
    if (d.carrier_ref.kind === "POPULATION_UNIT") {
      const unitId = d.carrier_ref.unit_id;
      const everHeld = ledger?.units.some((u) => u.unit_id === unitId);
      // a Unit may later exit; the demand's carrier identity is then a historical, pinned reference
      if (ledger && !everHeld && ledgerFact && ledgerFact.version === pin.ledger.version)
        bad(df.key, "a Unit carrier is a Unit of the ledger it was pinned at");
    } else {
      const cohortFact = byKey.get(
        populationCohortKey(d.carrier_ref.ledger_id, d.carrier_ref.cohort_id),
      );
      const cohort = parsed(cohortFact, CohortFactSchema);
      if (
        !cohortFact ||
        !cohort ||
        cohortFact.key !== pin.cohort?.fact_key ||
        cohortFact.version < pin.cohort.version
      )
        bad(df.key, "a Cohort carrier is a committed Population Cohort at or beyond its pin");
    }
    // no supply existed when the demand was committed: demand does not create supply, and realized output
    // never feeds the pre-commit availability test
    const entityFact = byKey.get(
      worldFallbackEntityKey(
        d.material_scope.world.entity_id,
        productionOutputReference(d.allocation.request.request_id),
      ),
    );
    if (entityFact && revisionOf(entityFact) <= revisionOf(df))
      bad(df.key, "a physical result for the request existed before the demand was committed");
  }

  for (const rf of requests) {
    const owned = demands.some(
      (df) => parsed(df, EconomyDemandEnvelopeSchema)?.allocation.request.fact_key === rf.key,
    );
    if (!owned) bad(rf.key, "an Economy request has no demand that allocated to it");
  }

  for (const zf of realizations) {
    const r = parsed(zf, EconomyRealizationSchema);
    if (!r) continue;
    const get = (key: string) => byKey.get(key);
    const demandFact = get(economyDemandKey(r.demand_envelope_id));
    const requestFact = get(r.request.fact_key);
    const opFact = get(r.production.operation.fact_key);
    const completionFact = get(r.production.completion.fact_key);
    const entityFact = get(r.delivery_result.fact_key);
    const demand = parsed(demandFact, EconomyDemandEnvelopeSchema);
    const request = parsed(requestFact, ProductionRequestSchema);
    const op = parsed(opFact, ProductionOperationSchema);
    const completion = parsed(completionFact, DurableCompletionEnvelopeSchema);
    const entity = parsed(entityFact, FallbackPhysicalEntitySchema);
    if (
      !demandFact ||
      !requestFact ||
      !opFact ||
      !completionFact ||
      !entityFact ||
      !demand ||
      !request ||
      !op ||
      !completion ||
      !entity
    ) {
      bad(
        zf.key,
        "a realized access has no committed demand, request, operation, completion or accepted entity",
      );
      continue;
    }
    const derived = deriveRealization({
      demand: { key: demandFact.key, version: demandFact.version, value: demand },
      request: { key: requestFact.key, version: requestFact.version, value: request },
      operation: { key: opFact.key, version: opFact.version, value: op },
      completion: { key: completionFact.key, version: completionFact.version, value: completion },
      entity: { key: entityFact.key, version: entityFact.version, value: entity },
      at: r.realized_at,
    });
    if (!derived.ok || !canonicalEqual(derived.value, r)) {
      bad(zf.key, "a realized access is exactly what the accepted chain determines");
    }
    const identity = stageIdentityViolation(
      zf.provenance,
      economyRealizationStage(r.production.operation.operation_id),
    );
    if (identity) bad(zf.key, identity);
    const obj = parsed(
      byKey.get(temporalObjectKey(productionObjectId(r.production.operation.operation_id))),
      TemporalObjectSchema,
    );
    const unretired = obj?.next_boundary != null;
    if (!cited(zf.provenance.group_id) && !unretired)
      bad(
        zf.key,
        "a realized access is credited by no resolution transaction and its boundary is retired",
      );
    if (revisionOf(zf) <= revisionOf(entityFact))
      bad(zf.key, "the realized access was not committed after the acceptance it depends on");
  }

  // a retired boundary of an Economy-sourced operation never leaves an accepted result without its consequence
  for (const of_ of ofKind("production_operation")) {
    const op = parsed(of_, ProductionOperationSchema);
    if (!op || op.request.owner !== OWNER_ECONOMY) continue;
    const obj = parsed(
      byKey.get(temporalObjectKey(productionObjectId(op.operation_id))),
      TemporalObjectSchema,
    );
    const retired = obj !== undefined && obj.next_boundary === null;
    const reserve = parsed(byKey.get(op.reserve.fact_key), ProductionReserveSchema);
    const hasEntity =
      reserve !== undefined &&
      byKey.has(
        worldFallbackEntityKey(
          reserve.locality.world.entity_id,
          op.transformation.output.reference,
        ),
      );
    const hasResult = realizations.some(
      (z) =>
        parsed(z, EconomyRealizationSchema)?.production.operation.operation_id === op.operation_id,
    );
    if (retired && op.status.state === "COMPLETED" && hasEntity && !hasResult)
      bad(of_.key, "a retired boundary of an Economy-sourced operation has its Economy result");
  }
  return out;
}
