import { z } from "zod";
import { Id, Version } from "./ids.ts";
import { PositiveQuantitySchema, productionProcessId } from "./production.ts";
import { CanonicalTimeSchema, StageKeySchema, TEMPORAL_STATE_KEY } from "./temporal.ts";
import { EntityId, FactRefSchema, OWNER_WORLD_STATE } from "./world-foundation.ts";

/**
 * Economy Demand → Production Request → Realized Access Backbone Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-004 Economy / Exchange / Demand (Working Operational Draft v1.1)
 *       §2.1 Economy-owned state (Demand Envelopes, allocation claims, realized access conclusions),
 *       §2.2 explicit non-ownership (goods, stock, population count/membership, Cohort identity),
 *       §3 persistence rule, §5.1–§5.3 demand source / Demand Envelope / Carrier Cohort,
 *       §8 effective demand and allocation claims ("purchasing power cannot create absent goods"),
 *       §11 Economic Claim ("not a universal property registry"), §20 commitment and conservation
 *       ("Economy never holds a physical reservation"), §21 realized flow ("delivery/result ref from
 *       downstream owner"), §27.1 Population / Cohort, §27.2 Production / Resources ("demand does not create
 *       supply; realized output may not feed the same pre-commit availability test"), §27.13 temporal,
 *       §27.14 R-T1 staged order
 *   WS-003 §13A Production Request (the carrier Production already consumes; see ./production.ts)
 *   F-017 Whole-Engine Dependency Graph v0.3 — the implicated Economy↔Production interface only
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is also the structural
 * half of the exclusions: there is no field in which a population count or membership, a stock, a title or
 * holding, a reservation, a price, a currency amount, a purchasing capability, an entitlement, a route, a
 * delivery or a movement could be stored. Economy references a Population carrier by identity and pinned
 * version and never copies it; it references the physical result by identity and pinned version and never
 * holds it. Quantities reuse Production's exact non-negative-integer encoding; no gameplay value is defined
 * here. Identifiers, owner/facet names and literals the sources do not prescribe are technical encodings.
 */

// ---------------------------------------------------------------------------------------------
// Owner, facet and key spaces (IM-06). One facet: a demand and its one Production Request publish
// atomically, and each realization is one group.
// ---------------------------------------------------------------------------------------------

export const OWNER_ECONOMY = "economy";
export const FACET_ECONOMY_STATE = "economy_state";

export const economyDemandKey = (demandId: string): string => `economy/demand/${demandId}`;
export const economyRequestKey = (requestId: string): string => `economy/request/${requestId}`;
export const economyRealizationKey = (demandId: string): string =>
  `economy/realization/${demandId}`;

/**
 * Identities derived from the demand identity alone, so a demand fixes at most ONE Production Request (and,
 * through Production's own derivation, one operation, one claim, one conserved output reference and one
 * temporal object). Nothing here is a clock, a counter or a random value: a retry or a replay reaches the same
 * identities and a second request can never be minted by accident. The Production operation identity IS the
 * request identity (WS-003 §13A, as implemented by Production).
 */
const REQUEST_PREFIX = "request:";
export const economyRequestId = (demandId: string): string => `${REQUEST_PREFIX}${demandId}`;
/** The demand a request identity was derived from, or null when it is not an Economy request identity. */
export const economyDemandIdOfRequest = (requestId: string): string | null =>
  requestId.startsWith(REQUEST_PREFIX) && requestId.length > REQUEST_PREFIX.length
    ? requestId.slice(REQUEST_PREFIX.length)
    : null;

/**
 * The Economy owner operation of the third stage of one operation's temporal object: after the World-State
 * custodian accepted the physical result (CG-2), Economy records the realized access. It shares the operation's
 * causal process, so the whole chain is one process with one earned boundary.
 */
export const ECONOMY_OPERATION_REALIZE_ACCESS = "economy-record-realized-access";
export const economyRealizationStage = (operationId: string) =>
  ({
    causal_process_id: productionProcessId(operationId),
    owner_operation: { owner: OWNER_ECONOMY, operation: ECONOMY_OPERATION_REALIZE_ACCESS },
    prospective_result_id: `realization:${operationId}`,
  }) as const;

// ---------------------------------------------------------------------------------------------
// The carrier (WS-004 §5.1 demand source, §5.3 Carrier Cohort): an already-committed Population Unit or
// Cohort, referenced by identity and pinned at the version it was resolved against. Economy copies none of
// its count, membership or Cohort identity: this value has no field in which they could be stored.
// ---------------------------------------------------------------------------------------------

export const DemandCarrierRefSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("POPULATION_UNIT"), ledger_id: EntityId, unit_id: EntityId }),
  z.strictObject({
    kind: z.literal("POPULATION_COHORT"),
    ledger_id: EntityId,
    cohort_id: EntityId,
  }),
]);
export type DemandCarrierRef = z.infer<typeof DemandCarrierRefSchema>;

const FactPin = z.strictObject({ fact_key: Id, version: Version.min(1) });

const Locality = z.strictObject({ world: FactRefSchema, locus: FactRefSchema });

// ---------------------------------------------------------------------------------------------
// Demand Envelope + the fixed allocation relation (WS-004 §5.2, §2.1 "allocation claims where Economy is the
// current authoritative keeper of the economic relation"). Create-only: it is the originating demand, and
// Economy can neither rewrite it, nor the request, nor the availability it was committed against.
// ---------------------------------------------------------------------------------------------

export const EconomyDemandEnvelopeSchema = z
  .strictObject({
    demand_envelope_id: EntityId,
    /** the authoritative demand source: a Population Unit or Cohort, by identity */
    carrier_ref: DemandCarrierRefSchema,
    /** the committed Population facts the carrier was resolved against, pinned (referenced, never copied) */
    carrier_basis_ref: z.strictObject({
      ledger: FactPin,
      cohort: FactPin.nullable(),
    }),
    /** the canonical world/locus the demand is carried at */
    material_scope: Locality,
    /** the one material demand: the good demanded and its exact quantity */
    demand_entry: z.strictObject({ output_class: Id, quantity: PositiveQuantitySchema }),
    /**
     * The fixed Allocation relation: this demand is allocated to exactly one Production Request, held in
     * Economy's own key space. It is an ECONOMIC claim; it is not physical stock, title, a reservation or an
     * inventory (WS-004 §11, §20). Production alone opens the physical claim on its own Reserve.
     */
    allocation: z.strictObject({
      relation: z.literal("ONE_DEMAND_ONE_PRODUCTION_REQUEST"),
      request: z.strictObject({ fact_key: Id, request_id: EntityId }),
      nature: z.literal("ECONOMIC_ALLOCATION_CLAIM_NOT_STOCK_TITLE_OR_RESERVATION"),
    }),
    /**
     * WS-004 §27.2: "pre-commit availability AS-OF-NOW before Economy commits a claim". It is sealed with the
     * demand: when the demand was committed no supply existed for its request. Realized output can never be
     * written back into it ("realized output may not feed the same pre-commit availability test").
     */
    pre_commit_availability: z.strictObject({
      read: z.literal("AS-OF-NOW"),
      at: CanonicalTimeSchema,
      temporal_state: z.strictObject({
        fact_key: z.literal(TEMPORAL_STATE_KEY),
        version: Version.min(1),
      }),
      supply_for_request: z.literal("ABSENT"),
    }),
  })
  .superRefine((d, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const cohort = d.carrier_ref.kind === "POPULATION_COHORT";
    if (cohort !== (d.carrier_basis_ref.cohort !== null))
      bad("a Cohort carrier pins its Cohort fact; a Unit carrier pins only its ledger", [
        "carrier_basis_ref",
      ]);
  });
export type EconomyDemandEnvelope = z.infer<typeof EconomyDemandEnvelopeSchema>;

// ---------------------------------------------------------------------------------------------
// Realized access (WS-004 §8 step 6, §2.1 "realized access conclusions", §21 "delivery/result ref from
// downstream owner"). The Economy-owned consequence of a demand whose physical result the World-State custodian
// has accepted. It is a record of ACCESS: the physical entity stays with its custodian, and nothing here is a
// holding, title, reservation or second inventory. Create-only.
// ---------------------------------------------------------------------------------------------

export const EconomyRealizationSchema = z.strictObject({
  demand_envelope_id: EntityId,
  /** the originating demand and its request, pinned (never rewritten) */
  demand: FactPin,
  request: z.strictObject({ fact_key: Id, request_id: EntityId, version: Version.min(1) }),
  /** the Production choice that made the output, referenced */
  production: z.strictObject({
    operation: z.strictObject({ fact_key: Id, operation_id: EntityId, version: Version.min(2) }),
    completion: FactPin,
  }),
  /** the downstream owner's result: the custodian's accepted entity under the SAME conserved reference */
  delivery_result: z.strictObject({
    owner: z.literal(OWNER_WORLD_STATE),
    fact_key: Id,
    entity_id: EntityId,
    version: Version.min(1),
  }),
  realized_access: z.strictObject({
    basis: z.literal("CUSTODIAN_ACCEPTED_SAME_CONSERVED_REFERENCE"),
    output_class: Id,
    quantity: PositiveQuantitySchema,
    physical_custody: z.literal("REMAINS_WITH_WORLD_STATE_FALLBACK_CUSTODIAN"),
  }),
  /** the operation's own declared boundary instant: never a requested horizon */
  realized_at: CanonicalTimeSchema,
  /** the Economy stage whose commit constitutes this result (identity, never a horizon) */
  close_stage: StageKeySchema,
});
export type EconomyRealization = z.infer<typeof EconomyRealizationSchema>;

// ---------------------------------------------------------------------------------------------
// Input of the one authored Economy publication that is not a stage operation.
// ---------------------------------------------------------------------------------------------

export const IssueDemandInputSchema = z.strictObject({
  demand_envelope_id: EntityId,
  carrier: DemandCarrierRefSchema,
  demand_entry: z.strictObject({ output_class: Id, quantity: PositiveQuantitySchema }),
});
export type IssueDemandInput = z.infer<typeof IssueDemandInputSchema>;
