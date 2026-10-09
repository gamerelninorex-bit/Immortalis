import { z } from "zod";
import { Id, Version } from "./ids.ts";
import {
  OWNER_PRODUCTION,
  PositiveQuantitySchema,
  ProductionQuantitySchema,
  ProductionSupportBasisSchema,
} from "./production.ts";
import { CanonicalTimeSchema, StageKeySchema, compareTime } from "./temporal.ts";
import { EntityId, FactRefSchema, OWNER_WORLD_STATE, Text } from "./world-foundation.ts";

/**
 * Exact Finite Raw-Source Drawdown & Conserved Production Reserve Inflow — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-003 Production & Resources (Working Operational Draft v1)  §4 Capability–Access–Reserve–Source Contract,
 *                                       §4A Source Stock / Renewal Execution Contract (Source Condition, Production-caused
 *                                       Source Delta, typed PHYSICAL exhaustion), §4B Source Boundary Basis (Pending
 *                                       Drawdown, delivery, watermark), §10, §14 steps 6/10/12, §15, §16
 *   WG World Generation & World-State Kernel  Ownership Guards — World Generation May Own (world-side state; integration of
 *                                       committed outputs from functional owners); Interface Handoffs — To Production
 *   F-017 Whole-Engine Dependency Graph v0.3  §5.5, §5.7, CG-2 (staged owner order)
 *   RC-02 OwnerFact, RC-04 StageKey, RC-06 Claim, RC-07 StagedDelta / CommitGroup, RC-10 TemporalObject
 *
 * The slice is ONE exact, episodic, Tier D, non-transformative extraction of a same-form, same-unit raw material from a
 * canonical World-State Source Condition whose recoverable amount is exact and finite, into a conserved Production Reserve.
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is also the structural half of the
 * exclusions — there is no field in which a yield, a ratio, a rate, a renewal or regeneration, a carried flow or flow
 * profile, a Next Boundary Basis, an unknown or latent quantity, a Source Estimate, a labor quantity or coefficient, a
 * transformation, an ACCESS exhaustion, a source split/merge/re-key or a price could be stored. Quantities are exact
 * non-negative integers in a caller-named unit (a technical encoding of "exact"). The numbers a fixture uses are test
 * evidence, never adopted coefficients (CAL-01, CAL-02, CAL-03 stay unresolved).
 *
 * Who writes what (WS-003 §4A, WG):
 *   World-State  — the Source Condition (truth, possibly latent; here exact), and, on consuming the actual Production-caused
 *                  Source Delta, the net Source Condition and any actual PHYSICAL exhaustion. Production never authors the
 *                  remaining physical endowment.
 *   Production   — its own Capability / Access basis, the Extraction (the pinned request and the commitment), the
 *                  Production-caused Source Delta (cause, magnitude, precise source-resolution key, provenance) held as the
 *                  key's Pending Drawdown (Tier D discrete residue) until World-State delivers it, the per-key account
 *                  (watermark and open commitments) and, only after delivery, the Reserve inflow.
 */

// ---------------------------------------------------------------------------------------------
// Owners, facets and key spaces.
// ---------------------------------------------------------------------------------------------

/** World-State, as the owner of Source Condition truth (WS-003 §4A "Identify owner"; WG "World Generation May Own"). */
export const FACET_WORLD_SOURCE_CONDITION = "world_source_condition";

export const worldSourceConditionKey = (worldId: string, sourceKey: string): string =>
  `world/${worldId}/source/${sourceKey}`;
export const worldSourceDeliveryKey = (worldId: string, deliveryId: string): string =>
  `world/${worldId}/source-delivery/${deliveryId}`;
export const productionExtractionBasisKey = (basisId: string): string =>
  `production/extraction-basis/${basisId}`;
export const productionExtractionKey = (extractionId: string): string =>
  `production/extraction/${extractionId}`;
export const productionSourceDeltaKey = (extractionId: string): string =>
  `production/source-delta/${extractionId}`;
export const productionSourceAccountKey = (worldId: string, sourceKey: string): string =>
  `production/source-account/${worldId}/${sourceKey}`;

/**
 * Identities derived from the extraction identity alone (as the Production operation derives its own): the extraction
 * identity IS the request identity, so a request fixes at most one extraction, one delta, one delivery, one temporal object
 * and one boundary. Nothing here is a clock, a counter or a random value, so a retry or a replay reaches the same identities.
 */
export const EXTRACTION_OBJECT_PREFIX = "obj-extraction-";
export const EXTRACTION_PROCESS_PREFIX = "production-extraction:";
export const productionExtractionObjectId = (extractionId: string): string =>
  `${EXTRACTION_OBJECT_PREFIX}${extractionId}`;
export const productionExtractionProcessId = (extractionId: string): string =>
  `${EXTRACTION_PROCESS_PREFIX}${extractionId}`;
export const productionExtractionBoundaryId = (extractionId: string): string =>
  `boundary-extraction-${extractionId}`;

/** The three owner operations of one drawdown, in dependency order: Production emits, World-State delivers, Production credits. */
export const PRODUCTION_OPERATION_EMIT_SOURCE_DELTA = "production-emit-source-delta";
export const WORLD_OPERATION_DELIVER_SOURCE_DRAWDOWN = "world-state-deliver-source-drawdown";
export const PRODUCTION_OPERATION_CREDIT_RESERVE_INFLOW = "production-credit-reserve-inflow";

export const productionSourceDeltaStage = (extractionId: string) =>
  ({
    causal_process_id: productionExtractionProcessId(extractionId),
    owner_operation: {
      owner: OWNER_PRODUCTION,
      operation: PRODUCTION_OPERATION_EMIT_SOURCE_DELTA,
    },
    prospective_result_id: `source-delta:${extractionId}`,
  }) as const;
export const worldSourceDeliveryStage = (extractionId: string) =>
  ({
    causal_process_id: productionExtractionProcessId(extractionId),
    owner_operation: {
      owner: OWNER_WORLD_STATE,
      operation: WORLD_OPERATION_DELIVER_SOURCE_DRAWDOWN,
    },
    prospective_result_id: `source-delivery:${extractionId}`,
  }) as const;
export const productionReserveInflowStage = (extractionId: string) =>
  ({
    causal_process_id: productionExtractionProcessId(extractionId),
    owner_operation: {
      owner: OWNER_PRODUCTION,
      operation: PRODUCTION_OPERATION_CREDIT_RESERVE_INFLOW,
    },
    prospective_result_id: `reserve-inflow:${extractionId}`,
  }) as const;

const Locality = z.strictObject({ world: FactRefSchema, locus: FactRefSchema });
export type SourceLocality = z.infer<typeof Locality>;

const sortedUniqueBy = <T>(xs: readonly T[], id: (x: T) => string): boolean =>
  xs.every((x, i) => i === 0 || id(xs[i - 1] as T) < id(x));

// ---------------------------------------------------------------------------------------------
// World-State Source Condition (WS-003 §4A; WG). Owner world_state / facet world_source_condition.
// ---------------------------------------------------------------------------------------------

/** A physically relevant access fact of the source: a free authored label and statement, never a closed vocabulary. */
export const SourceAccessFactSchema = z.strictObject({ aspect: Id, statement: Text });
export type SourceAccessFact = z.infer<typeof SourceAccessFactSchema>;

/**
 * The canonical World-State Source Condition at one source-resolution key: the exact, finite, recoverable amount of one
 * material, in one unit, at one world locus, established BEFORE any extraction as an initial setting fact. It is world
 * truth, not a Source Estimate: there is no estimate, range, latent or probabilistic field, so an estimated, latent or
 * unresolved condition is unrepresentable. Source dimensions/sub-locations are separate keys (`dimension` is the label the
 * owner resolves). There is no rate, renewal, regeneration, flow or Next Boundary Basis field: this slice admits no carried
 * flow, so none can be claimed (WS-003 §4B).
 *
 * Conservation is a property of the value, exactly as for a Reserve:
 *   established = recoverable + Σ delivered      (each delivery recorded once, by identity)
 * `exhaustion` is the typed PHYSICAL exhaustion (WS-003 §4A "Type exhaustion explicitly"): an authoritative source-owner fact
 * about what physically remains. ACCESS exhaustion is a Production-side effort/yield curve and is not representable here.
 */
export const WorldSourceConditionSchema = z
  .strictObject({
    source_key: EntityId,
    locality: Locality,
    /** the materially distinct Source Condition dimension or sub-location this key resolves */
    dimension: Id,
    material_class: Id,
    depth: z.literal("EXACT_FINITE"),
    establishment: z.strictObject({
      kind: z.literal("INITIAL_SETTING_FACT"),
      statement: Text,
      quantity: PositiveQuantitySchema,
    }),
    /** the current NET recoverable amount: the figure no consumer may treat as current before every pending delivery */
    recoverable: ProductionQuantitySchema,
    /** exactly-once delivery record: one entry per delivered Source Delta, sorted */
    delivered: z.array(z.strictObject({ delivery_id: EntityId, quantity: PositiveQuantitySchema })),
    access_facts: z.array(SourceAccessFactSchema),
    exhaustion: z.strictObject({ kind: z.literal("PHYSICAL"), delivery_id: EntityId }).nullable(),
  })
  .superRefine((s, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (!sortedUniqueBy(s.delivered, (d) => d.delivery_id))
      bad("delivery is recorded once per Source Delta, sorted", ["delivered"]);
    const unit = s.establishment.quantity.unit;
    if (s.recoverable.unit !== unit || s.delivered.some((d) => d.quantity.unit !== unit))
      bad("a Source Condition is accounted in one unit", ["recoverable"]);
    const spent = s.delivered.reduce((n, d) => n + d.quantity.amount, 0);
    if (s.establishment.quantity.amount - spent !== s.recoverable.amount)
      bad("established quantity = recoverable quantity + delivered quantity", ["recoverable"]);
    if (new Set(s.access_facts.map((a) => a.aspect)).size !== s.access_facts.length)
      bad("an access fact is stated once per aspect", ["access_facts"]);
    if ((s.recoverable.amount === 0) !== (s.exhaustion !== null))
      bad("PHYSICAL exhaustion is exactly a Source Condition with nothing recoverable", [
        "exhaustion",
      ]);
    if (s.exhaustion && !s.delivered.some((d) => d.delivery_id === s.exhaustion?.delivery_id))
      bad("PHYSICAL exhaustion is the result of a recorded delivery", ["exhaustion"]);
  });
export type WorldSourceCondition = z.infer<typeof WorldSourceConditionSchema>;

/**
 * The World-State delivery record: the owner consumed one actual Production-caused Source Delta and committed the net
 * Source Condition (WS-003 §4B(4) "records the contributing flows ... as cold provenance"). Sealed; it exists only as the
 * World-State delivery stage and is what Production's Reserve inflow depends on. It states the delta consumed, the source
 * versions before and after, the recoverable quantity before and after and whether the delivery physically exhausted the key.
 */
export const WorldSourceDeliverySchema = z
  .strictObject({
    delivery_id: EntityId,
    source: z.strictObject({
      fact_key: Id,
      source_key: EntityId,
      version_before: Version.min(1),
      version_after: Version.min(2),
    }),
    delta: z.strictObject({ fact_key: Id, version: Version.min(1) }),
    delivered: PositiveQuantitySchema,
    before: ProductionQuantitySchema,
    after: ProductionQuantitySchema,
    exhausted: z.boolean(),
    delivered_at: CanonicalTimeSchema,
    /** the contributing drawdown, as cold provenance: one discrete episodic contribution, never a declared rate */
    contribution: z.strictObject({
      extraction_id: EntityId,
      accounting: z.literal("DISCRETE_EPISODIC_RESIDUE"),
    }),
    close_stage: StageKeySchema,
  })
  .superRefine((d, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (
      d.before.unit !== d.delivered.unit ||
      d.after.unit !== d.delivered.unit ||
      d.before.amount - d.delivered.amount !== d.after.amount
    )
      bad("before − delivered = after, in one unit", ["after"]);
    if (d.exhausted !== (d.after.amount === 0))
      bad("a delivery exhausts the key exactly when nothing remains recoverable", ["exhausted"]);
    if (d.source.version_after !== d.source.version_before + 1)
      bad("one delivery advances the Source Condition by exactly one version", ["source"]);
    if (d.contribution.extraction_id !== d.delivery_id)
      bad("the delivery is the delivery of its own extraction's delta", ["contribution"]);
  });
export type WorldSourceDelivery = z.infer<typeof WorldSourceDeliverySchema>;

// ---------------------------------------------------------------------------------------------
// Production Capability / Access basis (WS-003 §4 "Capability is not inventory", "Access is not capability";
// §8 Tier A embedded labor). Owner production / facet production_state.
// ---------------------------------------------------------------------------------------------

/**
 * Production's own, distinct Capability / Access premise for ONE source key and ONE material. Capability and Access are
 * separate sections (§4: "Access is not capability"). It exists only for the narrow path: ordinary direct raw physical
 * collection under embedded, NON-material Tier A labor, no material specialist/KTI/labor coefficient and no separate
 * legal or Logistics encumbrance — each a literal, so a labor-calibrated, specialist, encumbered or transformative
 * extraction is unrepresentable. It carries no `can_extract` or `succeeded` assertion: the Source's existence establishes
 * neither capability nor permission (§4 "Access to raw material does not imply extraction ... capability"), and the
 * source-owned physical access fact it relies on is NAMED here and checked against the World-State Source Condition.
 */
export const ExtractionBasisSchema = z.strictObject({
  basis_id: EntityId,
  source: z.strictObject({ fact_key: Id, source_key: EntityId }),
  material_class: Id,
  unit: Id,
  locality: Locality,
  capability: z.strictObject({
    kind: z.literal("DIRECT_RAW_PHYSICAL_COLLECTION"),
    support: ProductionSupportBasisSchema,
  }),
  access: z.strictObject({
    mode: z.literal("DIRECT_PHYSICAL"),
    /** the source-owned access fact (aspect and statement) this basis relies on, verbatim */
    relies_on: SourceAccessFactSchema,
    encumbrance: z.literal("NONE"),
  }),
});
export type ExtractionBasis = z.infer<typeof ExtractionBasisSchema>;

// ---------------------------------------------------------------------------------------------
// The Extraction: the pinned request and Production's commitment (RC-06 analogue on a source quantity).
// ---------------------------------------------------------------------------------------------

/**
 * One exact, episodic extraction, started on one pinned request against one Source Condition and one destination Reserve.
 * Sealed: it is the authored intent and its pins, never rewritten from a later consequence (F-017: an earlier request is not
 * rewritten from a later result). Its progress is derived from the facts that follow it (delta, delivery, Reserve inflow), so
 * no stage rewrites it. The quantity is the request's own, never supplied by the caller; whether the drawdown can occur is
 * Production's determination (and the source owner's), recorded by admission, never the request's or a fixture's.
 */
export const ProductionExtractionSchema = z
  .strictObject({
    extraction_id: EntityId,
    /** the pinned foreign request; never copied */
    request: z.strictObject({
      owner: Id,
      fact_key: Id,
      request_id: EntityId,
      version: Version.min(1),
    }),
    basis: z.strictObject({ fact_key: Id, basis_id: EntityId, version: Version.min(1) }),
    source: z.strictObject({ fact_key: Id, source_key: EntityId, version: Version.min(1) }),
    reserve: z.strictObject({ fact_key: Id, reserve_id: EntityId }),
    account: z.strictObject({ fact_key: Id }),
    material_class: Id,
    quantity: PositiveQuantitySchema,
    support_basis: ProductionSupportBasisSchema,
    timing: z.strictObject({
      started_at: CanonicalTimeSchema,
      /** the one explicit boundary of this extraction: a declared value, fixture evidence, never a Production default */
      boundary: z.strictObject({ boundary_id: Id, at: CanonicalTimeSchema }),
    }),
  })
  .superRefine((e, ctx) => {
    if (compareTime(e.timing.started_at, e.timing.boundary.at) !== -1)
      ctx.addIssue({
        code: "custom",
        message: "the extraction boundary lies after the start",
        path: ["timing"],
      });
  });
export type ProductionExtraction = z.infer<typeof ProductionExtractionSchema>;

/**
 * The Production-caused Source Delta (WS-003 §4A "Emit the Production-caused Source Delta"): cause, magnitude at the
 * cheapest faithful precision (an exact integer here), the precise source-resolution key and provenance. Production does not
 * compute the resulting authoritative source condition. While undelivered it IS the key's Pending Drawdown: an episodic,
 * Tier D, discrete residue — `accounting` has the one literal and there is no rate field, so the same extraction can never
 * also be a rate contribution (§4B(3): "never both"). Sealed and create-only: it exists once, as Production's emit stage.
 */
export const SourceDeltaSchema = z.strictObject({
  delta_id: EntityId,
  cause: z.strictObject({
    kind: z.literal("PRODUCTION_EXTRACTION_DRAWDOWN"),
    extraction: z.strictObject({ fact_key: Id, version: Version.min(1) }),
    request: z.strictObject({ owner: Id, fact_key: Id, version: Version.min(1) }),
  }),
  magnitude: PositiveQuantitySchema,
  source: z.strictObject({ fact_key: Id, source_key: EntityId }),
  material_class: Id,
  accounting: z.literal("DISCRETE_EPISODIC_RESIDUE"),
  emitted_at: CanonicalTimeSchema,
  close_stage: StageKeySchema,
});
export type SourceDelta = z.infer<typeof SourceDeltaSchema>;

/**
 * Production's per-key account for one source-resolution key (WS-003 §4B(3): the pending state is "keyed by the source
 * owner's current resolution key"). It opens with the first admission onto the key, its watermark at that commit instant.
 * `open` lists each extraction committed against the key and not yet closed (its Reserve credited), by identity: an entry is
 * a commitment (coordination evidence protecting a source quantity from a second use), and the extraction's phase (committed,
 * delta emitted = pending, delivered) is derived from the facts that follow it, never stored twice. The watermark advances
 * with each delivery's close. The account never holds a remaining-endowment figure: that is World-State's.
 */
export const SourceAccountSchema = z
  .strictObject({
    source: z.strictObject({ fact_key: Id, source_key: EntityId }),
    locality: Locality,
    material_class: Id,
    unit: Id,
    watermark: CanonicalTimeSchema,
    open: z.array(z.strictObject({ extraction_id: EntityId, quantity: PositiveQuantitySchema })),
  })
  .superRefine((a, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (!sortedUniqueBy(a.open, (o) => o.extraction_id))
      bad("a commitment is recorded once per extraction, sorted", ["open"]);
    if (a.open.some((o) => o.quantity.unit !== a.unit))
      bad("an account is kept in one unit", ["open"]);
  });
export type SourceAccount = z.infer<typeof SourceAccountSchema>;

// ---------------------------------------------------------------------------------------------
// Inputs of the authored publications that are not stage operations.
// ---------------------------------------------------------------------------------------------

export const EstablishSourceConditionInputSchema = z.strictObject({
  source_key: EntityId,
  world_id: EntityId,
  locus_id: EntityId,
  dimension: Id,
  material_class: Id,
  quantity: PositiveQuantitySchema,
  access_facts: z.array(SourceAccessFactSchema),
  statement: Text,
});
export type EstablishSourceConditionInput = z.infer<typeof EstablishSourceConditionInputSchema>;

export const EstablishExtractionBasisInputSchema = z.strictObject({
  basis_id: EntityId,
  world_id: EntityId,
  source_key: EntityId,
  material_class: Id,
  unit: Id,
  relies_on: SourceAccessFactSchema,
});
export type EstablishExtractionBasisInput = z.infer<typeof EstablishExtractionBasisInputSchema>;

export const StartExtractionInputSchema = z.strictObject({
  /** the extraction identity IS the request identity */
  request_key: Id,
  basis_id: EntityId,
  world_id: EntityId,
  source_key: EntityId,
  reserve_id: EntityId,
  /** the explicit boundary of this extraction (a declared value, never a Production default) */
  boundary_at: CanonicalTimeSchema,
});
export type StartExtractionInput = z.infer<typeof StartExtractionInputSchema>;
