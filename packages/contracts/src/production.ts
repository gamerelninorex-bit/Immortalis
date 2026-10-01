import { z } from "zod";
import { Id, Version } from "./ids.ts";
import { CanonicalTimeSchema, StageKeySchema, compareTime } from "./temporal.ts";
import { EntityId, FactRefSchema, OWNER_WORLD_STATE } from "./world-foundation.ts";

/**
 * Production & Resource Conservation Backbone Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-003 Production & Resources (Working Operational Draft v1)  §2 scope incl. completed durable output /
 *                                       physical-state handoff, §3 tiers A/C/D, §4 Capability-Access-Reserve,
 *                                       §8 labor interface (Tier A embedded), §9 shared constraints, §13A
 *                                       Request, §15 validation, §16 Turnless adapter, §19 interface declaration
 *   WG World Generation & World-State Kernel  Ownership Guards — F-016 Ratified Fallback Objective Physical-Entity
 *                                       Custody
 *   F-017 Whole-Engine Dependency Graph v0.3  §5.7 and CG-2 (durable completion / acceptance)
 *   RC-06 Claim, RC-07 StagedDelta / CommitGroup, RC-10 TemporalObject (minimum surfaces only)
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is also the structural
 * half of the exclusions: there is no field in which a labor quantity or coefficient, a competence, a price or
 * demand, a movement/transfer, a source-stock drawdown, a yield, a rate, a duration default, a priority or a
 * second writable physical condition could be stored. Quantities are exact non-negative integers in a
 * caller-named unit (a technical encoding of "exact"); no gameplay value is defined here (CAL-01, CAL-02, CAL-03
 * stay unresolved). Identifiers, owner/facet names and literals the sources do not prescribe are technical
 * encodings.
 */

// ---------------------------------------------------------------------------------------------
// Owners, facets and key spaces (IM-05; IM-03 for the World-State fallback custodian).
// ---------------------------------------------------------------------------------------------

/** WS-003 §2: Production & Resources. One facet: one start / one completion publishes atomically. */
export const OWNER_PRODUCTION = "production";
export const FACET_PRODUCTION_STATE = "production_state";
/** WG "F-016 Ratified Fallback Objective Physical-Entity Custody": World-State, as fallback custodian only. */
export const FACET_WORLD_FALLBACK_ENTITY = "world_fallback_physical_entity";

export const productionReserveKey = (reserveId: string): string =>
  `production/reserve/${reserveId}`;
export const productionClaimKey = (claimId: string): string => `production/claim/${claimId}`;
export const productionOperationKey = (operationId: string): string =>
  `production/operation/${operationId}`;
export const productionCompletionKey = (operationId: string): string =>
  `production/completion/${operationId}`;
/** The accepted fallback entity, in World-State's own key space, under the conserved output reference. */
export const worldFallbackEntityKey = (worldId: string, entityId: string): string =>
  `world/${worldId}/entity/${entityId}`;

/**
 * Identities derived from the operation identity alone (as stage identities are derived from the StageKey): a
 * request fixes at most one operation, an operation has one claim, one conserved output reference, one temporal
 * object and one completion boundary. Nothing here is a clock, a counter or a random value, so a retry or a
 * replay reaches the same identities and a second operation, claim or output can never be minted by accident.
 * The operation identity IS the request identity.
 */
export const productionClaimId = (operationId: string): string => `claim:${operationId}`;
export const productionOutputReference = (operationId: string): string => `durable:${operationId}`;
export const productionProcessId = (operationId: string): string =>
  `production-operation:${operationId}`;
export const productionObjectId = (operationId: string): string => `obj-production-${operationId}`;
export const productionBoundaryId = (operationId: string): string =>
  `boundary-production-completion-${operationId}`;

/** The two owner operations of CG-2: Production's completion, then the custodian's acceptance. */
export const PRODUCTION_OPERATION_COMPLETE = "production-complete-operation";
export const WORLD_OPERATION_ACCEPT_FALLBACK = "world-state-accept-fallback-durable";

export const productionCompletionStage = (operationId: string) =>
  ({
    causal_process_id: productionProcessId(operationId),
    owner_operation: { owner: OWNER_PRODUCTION, operation: PRODUCTION_OPERATION_COMPLETE },
    prospective_result_id: `completion:${operationId}`,
  }) as const;
export const worldAcceptanceStage = (operationId: string) =>
  ({
    causal_process_id: productionProcessId(operationId),
    owner_operation: { owner: OWNER_WORLD_STATE, operation: WORLD_OPERATION_ACCEPT_FALLBACK },
    prospective_result_id: `acceptance:${operationId}`,
  }) as const;

const sortedUnique = (xs: readonly string[]): boolean =>
  xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);
const SortedIds = z.array(EntityId).refine(sortedUnique, "must be sorted and free of duplicates");

// ---------------------------------------------------------------------------------------------
// Exact quantity (a technical encoding of "exact"; carries no gameplay default).
// ---------------------------------------------------------------------------------------------

export const ProductionQuantitySchema = z.strictObject({
  amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  unit: Id,
});
export type ProductionQuantity = z.infer<typeof ProductionQuantitySchema>;
export const PositiveQuantitySchema = ProductionQuantitySchema.refine(
  (q) => q.amount > 0,
  "a represented quantity is positive",
);

const Locality = z.strictObject({ world: FactRefSchema, locus: FactRefSchema });

// ---------------------------------------------------------------------------------------------
// Production Request carrier (WS-003 §13A). The request's SOURCE owns it, in the source's own key space;
// Production consumes it as an input, never as proof that output exists, and only pins it.
// ---------------------------------------------------------------------------------------------

export const ProductionRequestSchema = z.strictObject({
  request_id: EntityId,
  /** the demand/procurement/allocation source reference (an opaque reference, never a copied fact) */
  source: z.strictObject({ owner: Id, cause_ref: Id }),
  /** requested good/function/output and quantity */
  requested_output: z.strictObject({ output_class: Id, quantity: PositiveQuantitySchema }),
  /** location/scope: the canonical world and locus */
  scope: Locality,
  /** an established priority/authority reference where one exists: none is representable here */
  priority_authority_ref: z.null(),
});
export type ProductionRequest = z.infer<typeof ProductionRequestSchema>;

// ---------------------------------------------------------------------------------------------
// Production Reserve (WS-003 §2, §4, §10 Tier D): the production-side physical reserve identity, quantity and
// condition while held by Production. Conservation is a property of the value:
//   established = held + Σ consumed       (each consuming operation recorded once)
// ---------------------------------------------------------------------------------------------

export const ProductionReserveSchema = z
  .strictObject({
    reserve_id: EntityId,
    /** the material the reserve holds: a label, never a vocabulary */
    material_class: Id,
    established: ProductionQuantitySchema,
    /** held now */
    quantity: ProductionQuantitySchema,
    /** exactly-once consumption record: one entry per consuming operation */
    consumed: z.array(z.strictObject({ operation_id: EntityId, quantity: PositiveQuantitySchema })),
    /** qualitative condition label while held by Production */
    condition: Id,
    /** attached to the canonical world/locus: referenced, never copied */
    locality: Locality,
    /**
     * Held locally by Production. `in_transfer` (WS-003 §2) needs an authoritative Logistics movement locus,
     * which this slice does not implement, so it is not representable.
     */
    holding: z.literal("HELD_LOCAL_BY_PRODUCTION"),
    /** open claims on this reserve (WS-003 §9 / §19 "open claim references"), by identity */
    claims: SortedIds,
  })
  .superRefine((r, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (!sortedUnique(r.consumed.map((c) => c.operation_id)))
      bad("consumption is recorded once per operation, sorted", ["consumed"]);
    const unit = r.established.unit;
    if (r.quantity.unit !== unit || r.consumed.some((c) => c.quantity.unit !== unit))
      bad("a reserve is accounted in one unit", ["quantity"]);
    const spent = r.consumed.reduce((n, c) => n + c.quantity.amount, 0);
    if (r.established.amount - spent !== r.quantity.amount)
      bad("established quantity = held quantity + consumed quantity", ["quantity"]);
  });
export type ProductionReserve = z.infer<typeof ProductionReserveSchema>;

// ---------------------------------------------------------------------------------------------
// RC-06 Claim — transient coordination evidence that protects one conserved Reserve quantity.
// Never title, inventory, fictional ownership or an automatic winner.
// ---------------------------------------------------------------------------------------------

export const ProductionClaimSchema = z
  .strictObject({
    claim_id: EntityId,
    /** transaction/group: the operation whose start committed it */
    operation_id: EntityId,
    /** conserved key/capacity/ref */
    conserved: z.strictObject({
      kind: z.literal("PRODUCTION_RESERVE_QUANTITY"),
      fact_key: Id,
      reserve_id: EntityId,
    }),
    /** quantity or supported bound */
    quantity: PositiveQuantitySchema,
    /** incompatible interval / overlap basis: the same reserve quantity cannot support two live claims */
    overlap_basis: z.literal("SAME_RESERVE_QUANTITY_UNTIL_CONSUMED"),
    interval: z.strictObject({ from: CanonicalTimeSchema, until: CanonicalTimeSchema }),
    /** lawful priority/authority basis if one exists: none exists here, so none is representable */
    priority_basis: z.null(),
    lifecycle: z.discriminatedUnion("status", [
      z.strictObject({ status: z.literal("ACTIVE") }),
      z.strictObject({
        status: z.literal("CONSUMED"),
        at: CanonicalTimeSchema,
        by_stage: StageKeySchema,
      }),
    ]),
    /** lineage: the pinned request that caused it */
    lineage: z.strictObject({
      request: z.strictObject({ owner: Id, fact_key: Id, version: Version.min(1) }),
    }),
  })
  .superRefine((c, ctx) => {
    if (compareTime(c.interval.from, c.interval.until) !== -1)
      ctx.addIssue({
        code: "custom",
        message: "a claim interval runs forward in one unit",
        path: ["interval"],
      });
  });
export type ProductionClaim = z.infer<typeof ProductionClaimSchema>;

// ---------------------------------------------------------------------------------------------
// The transformation, the Tier A support basis and the Production operation (WS-003 §3 Tier C).
// ---------------------------------------------------------------------------------------------

/** One exact, explicitly declared transformation: nothing is derived, scaled or defaulted (no yield, no rate). */
export const ProductionTransformationSchema = z.strictObject({
  input: z.strictObject({ material_class: Id, quantity: PositiveQuantitySchema }),
  output: z.strictObject({
    /** the stable conserved output reference (derived from the operation identity) */
    reference: EntityId,
    output_class: Id,
    quantity: PositiveQuantitySchema,
    condition: Id,
  }),
});
export type ProductionTransformation = z.infer<typeof ProductionTransformationSchema>;

/**
 * WS-003 §3 Tier A / §8: ordinary embedded labor and support, explicitly NON-material to the tested answer.
 * No Population reference, no KTI reference and no labor quantity exists in this contract: a labor-calibrated
 * path (CAL-02 / L-50) is unrepresentable.
 */
export const ProductionSupportBasisSchema = z.strictObject({
  tier: z.literal("TIER_A_EMBEDDED_BASELINE"),
  labor: z.literal("NON_MATERIAL_EMBEDDED"),
  specialist_competence: z.literal("NON_MATERIAL"),
});

export const ProductionOperationSchema = z
  .strictObject({
    operation_id: EntityId,
    /** the pinned foreign request; never copied */
    request: z.strictObject({
      owner: Id,
      fact_key: Id,
      request_id: EntityId,
      version: Version.min(1),
    }),
    reserve: z.strictObject({ fact_key: Id, reserve_id: EntityId }),
    claim: z.strictObject({ fact_key: Id, claim_id: EntityId }),
    transformation: ProductionTransformationSchema,
    support_basis: ProductionSupportBasisSchema,
    timing: z.strictObject({
      started_at: CanonicalTimeSchema,
      /** the one explicit, declared completion boundary: fixture evidence, never a Production default */
      completion: z.strictObject({ boundary_id: Id, at: CanonicalTimeSchema }),
    }),
    status: z.discriminatedUnion("state", [
      z.strictObject({ state: z.literal("IN_PROGRESS") }),
      z.strictObject({
        state: z.literal("COMPLETED"),
        completed_at: CanonicalTimeSchema,
        completion_fact_key: Id,
      }),
    ]),
  })
  .superRefine((o, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (compareTime(o.timing.started_at, o.timing.completion.at) !== -1)
      bad("the completion boundary lies after the start", ["timing"]);
    if (
      o.status.state === "COMPLETED" &&
      compareTime(o.status.completed_at, o.timing.completion.at) !== 0
    )
      bad("completion happens at exactly the declared boundary", ["status"]);
  });
export type ProductionOperation = z.infer<typeof ProductionOperationSchema>;

// ---------------------------------------------------------------------------------------------
// Durable Completion Envelope (WS-003 §2; F-017 CG-2). Sealed provenance, never a current physical state.
// ---------------------------------------------------------------------------------------------

export const FALLBACK_BASIS = "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER" as const;

export const DurableCompletionEnvelopeSchema = z
  .strictObject({
    operation_id: EntityId,
    /** the one conserved output reference */
    conserved_reference: EntityId,
    /** completed quantity and completion condition (a historical record of the completion, not a state) */
    completed: z.strictObject({
      output_class: Id,
      quantity: PositiveQuantitySchema,
      condition: Id,
    }),
    completed_at: CanonicalTimeSchema,
    locality: Locality,
    /** destination physical-state custodian: the World-State fallback, as no more-specific owner exists */
    destination_custodian: z.strictObject({
      owner: z.literal(OWNER_WORLD_STATE),
      facet: z.literal(FACET_WORLD_FALLBACK_ENTITY),
      entity_fact_key: Id,
      basis: z.literal(FALLBACK_BASIS),
    }),
    /** the custodian must accept this same reference, once; availability begins only then */
    acceptance_basis: z.literal("SAME_CONSERVED_REFERENCE_ACCEPTED_EXACTLY_ONCE"),
    /** separately owned title/holding/control/use references "where relevant": none is relevant here */
    external_references: z.tuple([]),
    /**
     * The RC-07 minimum retained evidence of the Production delta that completed it: the reserve it consumed
     * from, its before basis (version and quantity), the delta and the after quantity.
     */
    delta: z.strictObject({
      reserve: z.strictObject({
        fact_key: Id,
        version_before: Version.min(1),
        version_after: Version.min(2),
      }),
      before: PositiveQuantitySchema,
      consumed: PositiveQuantitySchema,
      after: ProductionQuantitySchema,
    }),
    /** the Production stage whose commit constitutes this completion (identity, never a horizon) */
    close_stage: StageKeySchema,
  })
  .superRefine((e, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const { before, consumed, after } = e.delta;
    if (before.unit !== consumed.unit || after.unit !== consumed.unit)
      bad("the delta is accounted in one unit", ["delta"]);
    if (before.amount - consumed.amount !== after.amount)
      bad("before − consumed = after", ["delta"]);
    if (e.delta.reserve.version_after !== e.delta.reserve.version_before + 1)
      bad("one completion advances the reserve by exactly one version", ["delta"]);
  });
export type DurableCompletionEnvelope = z.infer<typeof DurableCompletionEnvelopeSchema>;

// ---------------------------------------------------------------------------------------------
// The World-State fallback objective physical-entity (WG F-016 Ratified Fallback Objective Physical-Entity
// Custody). After acceptance World-State is the sole writer of its identity, existence, quantity and condition.
// ---------------------------------------------------------------------------------------------

export const FallbackPhysicalEntitySchema = z.strictObject({
  /** physical identity: the SAME conserved reference Production completed */
  entity_id: EntityId,
  entity_class: Id,
  /** conserved quantity where applicable */
  quantity: PositiveQuantitySchema,
  /** physical condition: the only writable current condition of the durable */
  condition: Id,
  /**
   * The locality the durable was ACCEPTED at: sealed history, never rewritten. The entity's current locus is
   * resolved from it and from the entity's Entity Transition Close, if one exists (see ./entity-transition.ts).
   */
  locality: Locality,
  custodian: z.strictObject({
    owner: z.literal(OWNER_WORLD_STATE),
    facet: z.literal(FACET_WORLD_FALLBACK_ENTITY),
    basis: z.literal(FALLBACK_BASIS),
  }),
  /** what was accepted: the Production completion, by reference (provenance, not a copy of Production state) */
  accepted_from: z.strictObject({
    owner: z.literal(OWNER_PRODUCTION),
    fact_key: Id,
    version: Version.min(1),
    operation_id: EntityId,
  }),
});
export type FallbackPhysicalEntity = z.infer<typeof FallbackPhysicalEntitySchema>;

// ---------------------------------------------------------------------------------------------
// Inputs of the two authored Production publications that are not stage operations.
// ---------------------------------------------------------------------------------------------

export const EstablishReserveInputSchema = z.strictObject({
  reserve_id: EntityId,
  material_class: Id,
  quantity: ProductionQuantitySchema,
  condition: Id,
  world_id: EntityId,
  locus_id: EntityId,
});
export type EstablishReserveInput = z.infer<typeof EstablishReserveInputSchema>;

export const StartOperationInputSchema = z.strictObject({
  /** the operation identity IS the request identity */
  request_key: Id,
  reserve_id: EntityId,
  transformation: z.strictObject({
    input_quantity: PositiveQuantitySchema,
    output_quantity: PositiveQuantitySchema,
    output_class: Id,
    output_condition: Id,
  }),
  /** the explicit completion boundary of this operation (a declared value, never a Production default) */
  completion_at: CanonicalTimeSchema,
});
export type StartOperationInput = z.infer<typeof StartOperationInputSchema>;
