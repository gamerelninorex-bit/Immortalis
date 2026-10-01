import { z } from "zod";
import { Id, Version } from "./ids.ts";
import { canonicalJson } from "./json.ts";
import {
  CanonicalTimeSchema,
  CloseBasisSchema,
  InvalidatorSchema,
  SourceFactRefSchema,
  StageKeySchema,
} from "./temporal.ts";
import { EntityId, FactRefSchema } from "./world-foundation.ts";

/**
 * Population & Cohort Reconciliation Backbone Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-001 Population, Labor & Migration (Draft 3)  §1 conservation, §2 residence/presence/burden,
 *                                                   §29B externally qualified views, §32 PCB-01
 *   WS-015 Cohort Reference Architecture (Draft v1) §II forms, §III persistent contract, §IV Burden
 *                                                   Locus, §VI–X ownership, composition, arithmetic
 *   F-017 Whole-Engine Dependency Graph v0.3        PCB-01 (due-trigger)
 *   RC-08 ConsequenceEnvelope, RC-12 CohortRef / PopulationBasis
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is also the
 * structural half of "a Cohort is never an actor": there is no field in which agency, belief or
 * behavior could be stored. Nothing here is a demographic rate, labor coefficient, capacity, cadence
 * or tolerance; no numeric default exists (CAL-01 and CAL-02 remain unresolved). Identifiers,
 * owner/facet names and literals that the sources do not prescribe are technical encodings.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key spaces (IM-04). The assignment is WS-001 / WS-015's: Population is the Unit/
// Count Custodian. One facet: a commit group is per owner/facet and the ledger, close and Cohort
// results of one reconciliation publish atomically.
// ---------------------------------------------------------------------------------------------

export const OWNER_POPULATION = "population";
export const FACET_POPULATION_STATE = "population_state";

export const populationLedgerKey = (ledgerId: string): string => `population/${ledgerId}/ledger`;
export const populationCloseKey = (ledgerId: string): string => `population/${ledgerId}/close`;
export const populationCohortKey = (ledgerId: string, cohortId: string): string =>
  `population/${ledgerId}/cohort/${cohortId}`;

/**
 * WS-001 §32 / F-017: Population's Close Basis is the ordinary demographic/labor reconciliation close,
 * independent of the player-requested horizon and of arbitrary partitioning. Its only fields are its
 * name and the producing owner operation (the RC-03 Close Basis shape): no horizon, slice or time.
 */
export const POPULATION_OPERATION_RECONCILE = "population-reconcile-close";
export const POPULATION_CLOSE_NAME = "population-ordinary-demographic-labor-reconciliation-close";
export const POPULATION_CLOSE_BASIS = {
  name: POPULATION_CLOSE_NAME,
  producer: { owner: OWNER_POPULATION, operation: POPULATION_OPERATION_RECONCILE },
} as const;

const PopulationCloseBasisSchema = CloseBasisSchema.refine(
  (b) => canonicalJson(b) === canonicalJson(POPULATION_CLOSE_BASIS),
  "the Close Basis must be the Population ordinary reconciliation close",
);

const sortedUnique = (xs: readonly string[]): boolean =>
  xs.every((x, i) => i === 0 || (xs[i - 1] as string) < x);

const SortedIds = z.array(EntityId).refine(sortedUnique, "must be sorted and free of duplicates");

// ---------------------------------------------------------------------------------------------
// Population Units. Residence, Presence and Burden Locus are separate facts (WS-001 §2, WS-015 §IV).
// ---------------------------------------------------------------------------------------------

/** A place a unit is resident at / present at / burdens. A free label: the sources fix no place model. */
export const PlaceRef = EntityId;

export const PopulationUnitSchema = z.strictObject({
  unit_id: EntityId,
  /** where the unit is assigned for demographic accounting (simulation residence, WS-001 §1) */
  residence: PlaceRef,
  /** where the unit physically is during the interval */
  presence: PlaceRef,
  /**
   * Population's recorded nonresident-labor burden allocation (WS-001 §25), when one exists. It
   * controls; absent it, burden is counted where the member is present (WS-015 §IV).
   */
  burden_allocation: PlaceRef.nullable(),
});
export type PopulationUnit = z.infer<typeof PopulationUnitSchema>;

/** WS-015 §IV: the single place a unit's ordinary burden is counted. Never inferred from residence. */
export const burdenLocus = (u: PopulationUnit): string => u.burden_allocation ?? u.presence;

export const INDEXED_POPULATION_FACTS = ["RESIDENCE", "PRESENCE", "BURDEN_LOCUS"] as const;
export type IndexedPopulationFact = (typeof INDEXED_POPULATION_FACTS)[number];

/** The place a unit has for exactly one indexed Population fact. Labor Claim is not representable. */
export const indexedPlace = (u: PopulationUnit, fact: IndexedPopulationFact): string =>
  fact === "RESIDENCE" ? u.residence : fact === "PRESENCE" ? u.presence : burdenLocus(u);

// ---------------------------------------------------------------------------------------------
// Cardinality semantics (WS-015 §III.8). UNQUANTIFIED is barred from conserved/additive arithmetic.
// ---------------------------------------------------------------------------------------------

export const CardinalitySchema = z.discriminatedUnion("semantics", [
  z.strictObject({ semantics: z.literal("EXACT"), count: z.number().int().nonnegative() }),
  z
    .strictObject({
      semantics: z.literal("BOUNDED"),
      lower: z.number().int().nonnegative(),
      upper: z.number().int().nonnegative(),
    })
    .refine((c) => c.lower <= c.upper, "lower bound exceeds upper bound"),
  z.strictObject({ semantics: z.literal("UNQUANTIFIED") }),
]);
export type Cardinality = z.infer<typeof CardinalitySchema>;

// ---------------------------------------------------------------------------------------------
// Basis stamp (WS-015 §III.12, WS-001 §29B): the single temporal basis a Population result was
// composed at, with the constituent versions used. A stamped result is validated against its own
// stamp, never against a later current criterion.
// ---------------------------------------------------------------------------------------------

const ConstituentSchema = z.strictObject({ key: Id, version: Version.min(1) });

export const BasisStampSchema = z.strictObject({
  basis: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("ESTABLISHMENT"), point: CanonicalTimeSchema }),
    z.strictObject({
      kind: z.literal("RECONCILIATION_CLOSE"),
      close_basis: PopulationCloseBasisSchema,
      resolution_point: CanonicalTimeSchema,
    }),
  ]),
  constituents: z.array(ConstituentSchema),
});
export type BasisStamp = z.infer<typeof BasisStampSchema>;

// ---------------------------------------------------------------------------------------------
// RC-12 PopulationBasis — the authoritative Unit/Count ledger of one disjoint resident population.
// ---------------------------------------------------------------------------------------------

export const PopulationBasisSchema = z
  .strictObject({
    ledger_id: EntityId,
    /** ontology-neutral unit class (WS-015 §XX): a label, never a species/sapience assumption */
    unit_class: Id,
    /** Unit/Count Custodian (WS-015 §III.2) */
    count_custodian: z.literal(OWNER_POPULATION),
    /** attachment to the existing canonical world / locality: referenced, never copied */
    locality: z.strictObject({ world: FactRefSchema, locus: FactRefSchema }),
    /** a disjoint resident population (WS-001 §1) */
    overlap: z.literal("DISJOINT_RESIDENT_POPULATION"),
    units: z.array(PopulationUnitSchema),
    count: z.strictObject({ semantics: z.literal("EXACT"), count: z.number().int().nonnegative() }),
    /** envelopes Population has consumed, exactly once each (RC-08 guard) */
    consumed_envelopes: SortedIds,
    basis_stamp: BasisStampSchema,
  })
  .superRefine((p, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (!sortedUnique(p.units.map((u) => u.unit_id)))
      bad("units must be sorted by unit_id with no duplicates (a unit is counted once)", ["units"]);
    if (p.count.count !== p.units.length) bad("the count must equal the units held", ["count"]);
  });
export type PopulationBasis = z.infer<typeof PopulationBasisSchema>;

// ---------------------------------------------------------------------------------------------
// RC-08 ConsequenceEnvelope — a typed Entry/Exit supplied by its causal owner. Population records
// the resulting membership/count change; it does not manufacture the causal event (WS-001 §1).
// ---------------------------------------------------------------------------------------------

export const EXIT_DISPOSITIONS = ["REVERSIBLE_MEMBERSHIP_EXIT", "CESSATION"] as const;

export const ConsequenceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("ENTRY"),
    /** ontology-specific causal adapter (WS-001 §1): a label, never a universal vocabulary */
    adapter: Id,
    unit: PopulationUnitSchema,
  }),
  z.strictObject({
    kind: z.literal("EXIT"),
    adapter: Id,
    /** WS-001 §1: reversible membership/residence exit is never silently recorded as cessation */
    disposition: z.enum(EXIT_DISPOSITIONS),
    unit_id: EntityId,
    /** the authoritative continuity / lawful re-entry reference a REVERSIBLE exit preserves */
    continuity_ref: Id.nullable(),
  }),
]);
export type Consequence = z.infer<typeof ConsequenceSchema>;

export const ConsequenceEnvelopeSchema = z
  .strictObject({
    /** causing event / envelope instance identity: deduplication is by instance, not by cause class */
    envelope_id: EntityId,
    causing_event: z.strictObject({ owner: Id, event_id: EntityId }),
    /** affected entity / scope */
    affected: z.strictObject({ ledger_id: EntityId, unit_ids: SortedIds.min(1) }),
    /** exposure / interval basis: the resolution point the consequence is effective at */
    basis: z.strictObject({ at: CanonicalTimeSchema }),
    consequence: ConsequenceSchema,
    /** authoritative writer: the causal owner, never Population */
    writer: z.strictObject({ owner: Id }),
    downstream_consumer: z.strictObject({
      owner: z.literal(OWNER_POPULATION),
      ledger_id: EntityId,
    }),
  })
  .superRefine((e, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const unit =
      e.consequence.kind === "ENTRY" ? e.consequence.unit.unit_id : e.consequence.unit_id;
    if (e.affected.unit_ids.length !== 1 || e.affected.unit_ids[0] !== unit)
      bad("the affected units must be exactly the consequence's unit", ["affected"]);
    if (e.affected.ledger_id !== e.downstream_consumer.ledger_id)
      bad("the affected scope is the consuming ledger", ["affected"]);
    if (e.writer.owner === OWNER_POPULATION)
      bad("Population is never the writer of a consequence it consumes", ["writer"]);
    if (e.consequence.kind === "EXIT") {
      const reversible = e.consequence.disposition === "REVERSIBLE_MEMBERSHIP_EXIT";
      if (reversible !== (e.consequence.continuity_ref !== null))
        bad("a reversible exit preserves a continuity reference; cessation carries none", [
          "consequence",
        ]);
    }
  });
export type ConsequenceEnvelope = z.infer<typeof ConsequenceEnvelopeSchema>;

/**
 * The carrier shape in which a causal owner holds the pending envelopes addressed to one Population
 * ledger, in the causal owner's OWN key space (the envelope's authoritative writer owns it; Population
 * only reads it). Technical encoding: the sources fix no carrier vocabulary.
 */
export const ConsequenceRegisterSchema = z
  .strictObject({ ledger_id: EntityId, envelopes: z.array(ConsequenceEnvelopeSchema) })
  .superRefine((r, ctx) => {
    if (!sortedUnique(r.envelopes.map((e) => e.envelope_id)))
      ctx.addIssue({ code: "custom", message: "envelope ids are unique and sorted", path: [] });
    if (r.envelopes.some((e) => e.downstream_consumer.ledger_id !== r.ledger_id))
      ctx.addIssue({
        code: "custom",
        message: "an envelope is addressed to another ledger",
        path: [],
      });
  });
export type ConsequenceRegister = z.infer<typeof ConsequenceRegisterSchema>;

// ---------------------------------------------------------------------------------------------
// The ordinary reconciliation close (WS-001 §1 identity, §32). The conservation identity
//   Closing = Opening + typed Entries − typed Exits
// is a property of the contract itself: a close that violates it is not a representable value.
// ---------------------------------------------------------------------------------------------

const EntryRecordSchema = z.strictObject({
  envelope_id: EntityId,
  unit_id: EntityId,
  adapter: Id,
  causing_event: z.strictObject({ owner: Id, event_id: EntityId }),
});
const ExitRecordSchema = z.strictObject({
  envelope_id: EntityId,
  unit_id: EntityId,
  adapter: Id,
  disposition: z.enum(EXIT_DISPOSITIONS),
  continuity_ref: Id.nullable(),
  causing_event: z.strictObject({ owner: Id, event_id: EntityId }),
});

export const ReconciliationCloseSchema = z
  .strictObject({
    ledger_id: EntityId,
    close_basis: PopulationCloseBasisSchema,
    /** the stage that produced this close: identity is (process, operation, result), never a horizon */
    close_stage: StageKeySchema,
    /** the single resolution point the close was composed at */
    resolution_point: CanonicalTimeSchema,
    opening: z.strictObject({
      count: z.number().int().nonnegative(),
      ledger_version: Version.min(1),
    }),
    entries: z.array(EntryRecordSchema),
    exits: z.array(ExitRecordSchema),
    closing: z.strictObject({
      count: z.number().int().nonnegative(),
      ledger_version: Version.min(2),
    }),
    /** the envelopes consumed by this close: exactly its entries and exits, each once */
    consumed_envelopes: SortedIds,
  })
  .superRefine((c, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (c.opening.count + c.entries.length - c.exits.length !== c.closing.count)
      bad("Closing Population must equal Opening Population + Entries - Exits", ["closing"]);
    if (c.closing.ledger_version !== c.opening.ledger_version + 1)
      bad("a close advances the ledger by exactly one version", ["closing"]);
    const ids = [
      ...c.entries.map((e) => e.envelope_id),
      ...c.exits.map((e) => e.envelope_id),
    ].sort();
    if (canonicalJson(ids) !== canonicalJson(c.consumed_envelopes))
      bad("the consumed envelopes are exactly the entries and exits recorded", [
        "consumed_envelopes",
      ]);
    for (const x of c.exits)
      if ((x.disposition === "REVERSIBLE_MEMBERSHIP_EXIT") !== (x.continuity_ref !== null))
        bad("a reversible exit preserves a continuity reference; cessation carries none", [
          "exits",
        ]);
  });
export type ReconciliationClose = z.infer<typeof ReconciliationCloseSchema>;

// ---------------------------------------------------------------------------------------------
// RC-12 CohortRef (WS-015 §III). Sparse: instantiated only where a consumer's answer needs it.
// ---------------------------------------------------------------------------------------------

export const COHORT_FORMS = ["CONSERVED_PARTITION", "OVERLAPPING_VIEW"] as const;
export const CARDINALITY_SEMANTICS = ["EXACT", "BOUNDED", "UNQUANTIFIED"] as const;

export const CohortRefSchema = z
  .strictObject({
    /** stable reference */
    cohort_id: EntityId,
    unit_class: Id,
    /** Unit/Count Custodian: always Population */
    count_custodian: z.literal(OWNER_POPULATION),
    /**
     * Criterion Owner. Population-owned criterion: `ref` is null. An external criterion is referenced
     * (owner + fact key), never copied: Population stores only the lawful derived result and provenance.
     */
    criterion: z.strictObject({ owner: Id, ref: SourceFactRefSchema.nullable() }),
    /** exactly one indexed Population fact; Labor Claim has no representation in this slice */
    indexed_fact: z.enum(INDEXED_POPULATION_FACTS),
    /** membership scope: the units whose indexed fact is `place` in the ledger */
    scope: z.strictObject({ ledger_id: EntityId, place: PlaceRef }),
    membership_basis: z.enum([
      "INDEXED_FACT_AT_PLACE",
      "INDEXED_FACT_AT_PLACE_AND_EXTERNAL_CRITERION",
    ]),
    form: z.enum(COHORT_FORMS),
    cardinality_semantics: z.enum(CARDINALITY_SEMANTICS),
    /** a partition declares the partition it is a disjoint sibling of; a view declares overlap */
    overlap: z.discriminatedUnion("declaration", [
      z.strictObject({ declaration: z.literal("DISJOINT_PARTITION"), partition_id: EntityId }),
      z.strictObject({ declaration: z.literal("OVERLAPPING") }),
    ]),
    /** AS-OF-DECLARED-CLOSE at Population's ordinary close; AS-OF-NOW has no declared same-point edge */
    temporal_read: z.strictObject({
      mode: z.literal("AS-OF-DECLARED-CLOSE"),
      close_basis: PopulationCloseBasisSchema,
    }),
    /** CURRENT-ONLY is the default; VERSIONED needs a named consumer's historical read (not here) */
    retention: z.literal("CURRENT-ONLY"),
    invalidators: z.array(InvalidatorSchema).min(1),
    /** the single retirement predicate (WS-015 §XV); no retirement operation exists in this slice */
    retirement: z.strictObject({
      predicate: z.literal("ZERO_LIVE_DEPENDENCIES_AND_NO_REMAINING_NEED"),
    }),
  })
  .superRefine((r, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const external = r.criterion.owner !== OWNER_POPULATION;
    if (external !== (r.criterion.ref !== null))
      bad("an external criterion is referenced; a Population-owned criterion has no reference", [
        "criterion",
      ]);
    if (r.criterion.ref && r.criterion.ref.owner !== r.criterion.owner)
      bad("the criterion reference must belong to the Criterion Owner", ["criterion"]);
    if (
      r.membership_basis !==
      (external ? "INDEXED_FACT_AT_PLACE_AND_EXTERNAL_CRITERION" : "INDEXED_FACT_AT_PLACE")
    )
      bad("the membership basis must agree with the criterion owner", ["membership_basis"]);
    if ((r.form === "CONSERVED_PARTITION") !== (r.overlap.declaration === "DISJOINT_PARTITION"))
      bad("a conserved partition declares its partition; an overlapping view declares overlap", [
        "overlap",
      ]);
  });
export type CohortRef = z.infer<typeof CohortRefSchema>;

/** The Population-produced derived result of a Cohort, stamped with the single basis it was composed at. */
export const CohortResultSchema = z
  .strictObject({
    cardinality: CardinalitySchema,
    /** member ids; present exactly when the cardinality is EXACT */
    members: SortedIds.nullable(),
    basis_stamp: BasisStampSchema,
  })
  .superRefine((r, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message, path: ["members"] });
    if (r.basis_stamp.basis.kind !== "RECONCILIATION_CLOSE")
      bad("a derived result is stamped with a Population reconciliation close");
    if (r.cardinality.semantics === "EXACT") {
      if (r.members === null || r.members.length !== r.cardinality.count)
        bad("an exact cardinality carries exactly its members");
    } else if (r.members !== null) {
      bad("only an exact cardinality carries members");
    }
  });
export type CohortResult = z.infer<typeof CohortResultSchema>;

export const CohortFactSchema = z.strictObject({
  ref: CohortRefSchema,
  /** null until the first reconciliation composes it */
  result: CohortResultSchema.nullable(),
});
export type CohortFact = z.infer<typeof CohortFactSchema>;

/**
 * The carrier an external Criterion Owner publishes, in its own key space: the units that qualify, at
 * the single resolution point the criterion is established for. Population composes it with its own
 * Units/partition at that same point or fails closed (WS-015 §VII). Technical encoding.
 */
export const ExternalCriterionSchema = z.strictObject({
  resolution_point: CanonicalTimeSchema,
  qualifying_unit_ids: SortedIds,
});
export type ExternalCriterion = z.infer<typeof ExternalCriterionSchema>;

/** Inputs of the two Population publications that are not reconciliations (authored setup). */
export const EstablishLedgerInputSchema = z.strictObject({
  ledger_id: EntityId,
  unit_class: Id,
  world_id: EntityId,
  locus_id: EntityId,
  units: z.array(PopulationUnitSchema),
  /** the resolution point the opening state is established at */
  point: CanonicalTimeSchema,
});
export type EstablishLedgerInput = z.infer<typeof EstablishLedgerInputSchema>;
