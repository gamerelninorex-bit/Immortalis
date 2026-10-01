import { z } from "zod";
import { Id, Version } from "./ids.ts";
import { fail, ok, type Result } from "./result.ts";
import { SourceRefSchema } from "./source-ref.ts";
import { EntityId, PLAYER_CHOICE_AUTHORITY } from "./world-foundation.ts";

/**
 * Turnless Temporal & Resolution Transaction Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   F-014B Temporal Resolution Kernel v2  §2 kernel-owned state, §3 Temporal Object, §4 Cross-System
 *                                          Temporal Read (R-T1), §6 advance algorithm, §7 partition,
 *                                          §9 invalidation, §13 boundary index, §17 transaction/replay
 *   F-017 Whole-Engine Dependency Graph v0.3  §3 graph vocabulary and stage identity, §4 resolution law,
 *                                          §9 invalidation order (derived ordering only: no persisted graph)
 *   RC-03 TemporalRead, RC-04 StageKey, RC-05 ResolutionTransaction, RC-10 TemporalObject
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is also the
 * structural half of the anti-fake-identity rule: a StageKey has no field in which a horizon, a source
 * version, a retry count, a message count or an execution slice could be placed.
 *
 * Nothing here is a game rule or a calibration. Time is an opaque coordinate; the F-027 sources fix no
 * calendar, unit or granularity, and T0/Tb/T1 in the acceptance fixture are test coordinates.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet and key spaces (IM-02). Technical encodings; the assignment itself is F-014B §2's.
// ---------------------------------------------------------------------------------------------

/** F-014B §2 "Kernel-Owned State": shared orchestration only. Subsystems retain substantive ownership. */
export const OWNER_TEMPORAL_KERNEL = "temporal_kernel";
export const FACET_TEMPORAL_COORDINATION = "temporal_coordination";

export const TEMPORAL_STATE_KEY = "temporal/state";
export const TEMPORAL_BOUNDARY_INDEX_KEY = "temporal/boundary-index";
export const temporalObjectKey = (objectId: string): string => `temporal/object/${objectId}`;
export const temporalTransactionKey = (transactionId: string): string =>
  `temporal/transaction/${transactionId}`;

// ---------------------------------------------------------------------------------------------
// Canonical time. An opaque coordinate, not a tick counter: it only moves through a committed
// ResolutionTransaction (enforced at admission) and is never incremented by the passage of requests.
// ---------------------------------------------------------------------------------------------

export const CanonicalTimeSchema = z.strictObject({
  /** The coordinate's unit. F-027 prescribes none, so it is opaque and never defaulted. */
  unit: Id,
  value: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type CanonicalTime = z.infer<typeof CanonicalTimeSchema>;

/** -1 / 0 / 1, or null when the two coordinates are in different units and so are not comparable. */
export function compareTime(a: CanonicalTime, b: CanonicalTime): -1 | 0 | 1 | null {
  if (a.unit !== b.unit) return null;
  return a.value < b.value ? -1 : a.value > b.value ? 1 : 0;
}
export const timeBefore = (a: CanonicalTime, b: CanonicalTime): boolean => compareTime(a, b) === -1;
export const timeAtOrBefore = (a: CanonicalTime, b: CanonicalTime): boolean => {
  const c = compareTime(a, b);
  return c === -1 || c === 0;
};
export const timeEquals = (a: CanonicalTime, b: CanonicalTime): boolean => compareTime(a, b) === 0;

// ---------------------------------------------------------------------------------------------
// RC-03 — TemporalRead
// ---------------------------------------------------------------------------------------------

/**
 * F-014B §4 / F-017 §3: a Close Basis names the PRODUCER's reconciliation/close semantics. It must be
 * independent of the player-requested horizon and of arbitrary partitioning, so its only fields are
 * the close's name and the producing owner operation: there is no place for a horizon, a slice or a
 * timestamp. A token that merely looks like a close is additionally rejected by the coordinator unless
 * the producer's own declaration names it (see `CLOSE_BASIS_UNDECLARED`).
 */
export const CloseBasisSchema = z.strictObject({
  name: Id,
  producer: z.strictObject({ owner: Id, operation: Id }),
});
export type CloseBasis = z.infer<typeof CloseBasisSchema>;

/** A source-fact change that invalidates an unresolved consumer (F-014B §9). */
export const InvalidatorSchema = z.strictObject({ fact_key: Id });
export type Invalidator = z.infer<typeof InvalidatorSchema>;

export const SourceFactRefSchema = z.strictObject({ owner: Id, fact_key: Id });
export type SourceFactRef = z.infer<typeof SourceFactRefSchema>;

export const READ_MODE_NOW = "AS-OF-NOW";
export const READ_MODE_CLOSE = "AS-OF-DECLARED-CLOSE";

const readCore = { source: SourceFactRefSchema, invalidators: z.array(InvalidatorSchema) };

/**
 * A declared read (what a stage or object says it will read). Exactly two modes exist, and a named
 * Close Basis exists when and only when the mode is AS-OF-DECLARED-CLOSE: the NOW member has no
 * `close_basis` field at all, so a NOW read cannot carry one, and a CLOSE read cannot omit it.
 * "No third temporal-read type may be invented."
 */
export const TemporalReadDeclarationSchema = z.discriminatedUnion("mode", [
  z.strictObject({ ...readCore, mode: z.literal(READ_MODE_NOW) }),
  z.strictObject({
    ...readCore,
    mode: z.literal(READ_MODE_CLOSE),
    close_basis: CloseBasisSchema,
  }),
]);
export type TemporalReadDeclaration = z.infer<typeof TemporalReadDeclarationSchema>;

/**
 * The source version/provenance basis a read was actually taken at. `committed_by` is the group that
 * committed that version of the source fact (its RC-16 identity).
 */
export const SourceBasisSchema = z.strictObject({
  version: Version.min(1),
  committed_by: Id,
});
export type SourceBasis = z.infer<typeof SourceBasisSchema>;

/** RC-03: a realized read = its declaration plus the exact source version/provenance it observed. */
export const TemporalReadSchema = z.discriminatedUnion("mode", [
  z.strictObject({ ...readCore, source_basis: SourceBasisSchema, mode: z.literal(READ_MODE_NOW) }),
  z.strictObject({
    ...readCore,
    source_basis: SourceBasisSchema,
    mode: z.literal(READ_MODE_CLOSE),
    close_basis: CloseBasisSchema,
  }),
]);
export type TemporalRead = z.infer<typeof TemporalReadSchema>;

// ---------------------------------------------------------------------------------------------
// RC-04 — StageKey
// ---------------------------------------------------------------------------------------------

/**
 * F-017 §3 stage identity: (causal event/process identity, owner operation, prospective
 * decision/result identity). Input/source version is provenance and an invalidation key, never an
 * identity dimension; a Resolution Slice is an execution grouping, never a source of identity or lag;
 * repartitioning or changing the requested horizon does not rename a stage or cut an edge.
 */
export const StageKeySchema = z.strictObject({
  causal_process_id: Id,
  owner_operation: z.strictObject({ owner: Id, operation: Id }),
  prospective_result_id: Id,
});
export type StageKey = z.infer<typeof StageKeySchema>;

/**
 * Names that are never stage-identity dimensions (RC-04 guard; F-017 §3). Used only to give a precise
 * diagnosis: rejection itself is structural (the schema is strict), so a dimension missing from this
 * list is rejected all the same.
 */
export const PROHIBITED_STAGE_IDENTITY_DIMENSIONS = [
  "requested_horizon",
  "horizon",
  "target",
  "source_version",
  "input_version",
  "version",
  "provider_version",
  "provider",
  "retry",
  "retry_count",
  "attempt",
  "message_count",
  "execution_slice",
  "slice",
  "partition",
  "repartition",
] as const;

export type StageKeyErrorCode = "STAGE_KEY_INVALID" | "STAGE_KEY_PROHIBITED_DIMENSION";

/** Validates a candidate StageKey; a prohibited identity dimension is named in the failure. */
export function parseStageKey(input: unknown): Result<StageKey, StageKeyErrorCode> {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    const present = PROHIBITED_STAGE_IDENTITY_DIMENSIONS.filter((d) => d in input);
    if (present.length > 0) {
      return fail(
        "STAGE_KEY_PROHIBITED_DIMENSION",
        "a StageKey's identity is exactly (causal process, owner operation, prospective result); horizon, source version, retry, message count and slice/repartition are not identity dimensions",
        { dimensions: present },
      );
    }
  }
  const parsed = StageKeySchema.safeParse(input);
  if (!parsed.success) {
    return fail("STAGE_KEY_INVALID", "not a valid StageKey", {
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  return ok(parsed.data);
}

// ---------------------------------------------------------------------------------------------
// RC-10 — TemporalObject (minimum surface required by the bounded proof)
// ---------------------------------------------------------------------------------------------

/**
 * One declared stage of the governed temporal work: its identity, what it reads (with each read's
 * NOW/CLOSE declaration and named Close Basis), the owner-fact keys its owner operation will write
 * (so the dependency graph can be indexed by stage before anything is computed), and the producer
 * Close its commit constitutes, if any. This is the object's "dependency declarations" (RC-10); the
 * graph built from them is transient and is never persisted (F-017 §2 DERIVE).
 */
/**
 * The discrete Population facets a consumer's CLOSE read may depend on (F-017 PCB-01 / WS-001 §32:
 * "person-use, membership, presence, eligibility, availability or commitment-feasibility"). A consumer
 * whose read is a continuous aggregate declares none and has no barrier.
 */
export const DISCRETE_POPULATION_FACETS = [
  "PERSON_USE",
  "MEMBERSHIP",
  "PRESENCE",
  "ELIGIBILITY",
  "AVAILABILITY",
  "COMMITMENT_FEASIBILITY",
] as const;

/**
 * PCB-01 — Pending Population Consequence Barrier (F-017 §3 at pin 2026-09-25T23:42:27.802Z; WS-001
 * §32). A consumer that reads a Population close AS-OF-DECLARED-CLOSE and whose answer is discrete
 * declares the engaged Population scope it depends on, where Population's pending consequence
 * envelopes are carried, and the (dormant) Population reconciliation object whose declared stage is
 * the next eligible reconciliation. It is a declaration, not a scheduler: IM-02 evaluates it only
 * when the consumer is itself engaged, and it makes the reconciliation due only when its frozen
 * conditions hold. `close_basis` names the Population close the gated CLOSE reads consume.
 */
export const PendingConsequenceBarrierSchema = z.strictObject({
  barrier: z.literal("PCB-01"),
  population: z.strictObject({ ledger_id: EntityId, cohort_id: EntityId.nullable() }),
  discrete_facets: z.array(z.enum(DISCRETE_POPULATION_FACETS)).min(1),
  consequence_sources: z.array(SourceFactRefSchema).min(1),
  reconciliation_object_id: EntityId,
  close_basis: CloseBasisSchema,
});
export type PendingConsequenceBarrier = z.infer<typeof PendingConsequenceBarrierSchema>;

/**
 * Retained, independently verifiable evidence that a PCB-01 due claim was true (F-017 PCB-01). It is
 * deliberately thin: WHICH consumed envelopes made the reconciliation due, and on which structural basis.
 * Everything it must be checked against — the consumed envelopes, the Cohort's membership before and after,
 * the single resolution point — is in the committed Population stage group itself (the single canon), and
 * the verifier RE-DERIVES the triggers from that group: a recorded claim that differs, or that no condition
 * supports, is rejected at raw admission and again on load. It is a record, not a second log.
 */
export const PCB01_TRIGGER_BASES = [
  "LEDGER_SCOPE",
  "COHORT_MEMBER_EXIT",
  "COHORT_QUALIFYING_ENTRY",
  "COHORT_NOT_YET_COMPOSED",
] as const;
export const Pcb01EvidenceSchema = z
  .strictObject({
    scope: z.strictObject({ ledger_id: EntityId, cohort_id: EntityId.nullable() }),
    /** the consumer's boundary instant: the single resolution point the reconciliation resolved at */
    instant: CanonicalTimeSchema,
    triggers: z
      .array(z.strictObject({ envelope_id: EntityId, basis: z.enum(PCB01_TRIGGER_BASES) }))
      .min(1),
  })
  .superRefine((e, ctx) => {
    const ids = e.triggers.map((t) => t.envelope_id);
    if (!ids.every((id, i) => i === 0 || (ids[i - 1] as string) < id))
      ctx.addIssue({
        code: "custom",
        message: "triggers are sorted by envelope with no duplicates",
        path: ["triggers"],
      });
  });
export type Pcb01Evidence = z.infer<typeof Pcb01EvidenceSchema>;

export const DependencyDeclarationSchema = z
  .strictObject({
    stage: StageKeySchema,
    reads: z.array(TemporalReadDeclarationSchema),
    /** owner-fact keys the stage's owner operation writes */
    produces: z.array(Id).min(1),
    /** when non-null, committing this stage IS the producer's named close (F-017 §3 CLOSE) */
    declares_close: z.strictObject({ name: Id }).nullable(),
    /** PCB-01 due-trigger declaration (consumer side); absent for every other stage */
    pending_consequence_barrier: PendingConsequenceBarrierSchema.optional(),
  })
  .superRefine((d, ctx) => {
    const b = d.pending_consequence_barrier;
    if (!b) return;
    const gated = d.reads.some(
      (r) =>
        r.mode === READ_MODE_CLOSE &&
        r.close_basis.name === b.close_basis.name &&
        r.close_basis.producer.owner === b.close_basis.producer.owner &&
        r.close_basis.producer.operation === b.close_basis.producer.operation,
    );
    if (!gated) {
      ctx.addIssue({
        code: "custom",
        message: "a PCB-01 barrier gates at least one AS-OF-DECLARED-CLOSE read of its close basis",
        path: ["pending_consequence_barrier"],
      });
    }
  });
export type DependencyDeclaration = z.infer<typeof DependencyDeclarationSchema>;

export const BoundarySchema = z.strictObject({ boundary_id: Id, at: CanonicalTimeSchema });
export type Boundary = z.infer<typeof BoundarySchema>;

/**
 * F-014B §7: EXACT-PARTITION is the only partition class representable. APPROXIMATE-PARTITION needs a
 * justified per-mechanic tolerance, which is UNCALIBRATED (CAL-01): it is unrepresentable here, and
 * there is no field in which a tolerance could be supplied, defaulted or inferred.
 */
export const PartitionDeclarationSchema = z.strictObject({ class: z.literal("EXACT-PARTITION") });

export const TemporalObjectSchema = z
  .strictObject({
    object_id: EntityId,
    /** owning/source reference sufficient to locate the governed temporal work */
    owning_ref: z.strictObject({ owner: Id, process_id: Id }),
    /** last resolved temporal basis */
    last_resolved_basis: CanonicalTimeSchema,
    /** behavior/partition declaration */
    partition: PartitionDeclarationSchema,
    /** the one earned next material boundary, only where explicit indexing earns its cost (F-014B §13) */
    next_boundary: BoundarySchema.nullable(),
    /** dependency declarations */
    dependencies: z.array(DependencyDeclarationSchema),
    /** continuation/reconciliation basis: carry from the last resolved basis; no reconciliation is due */
    continuation: z.strictObject({
      resume_from: z.literal("LAST_RESOLVED_BASIS"),
      reconciliation_due: z.tuple([]),
    }),
    /** invalidators of the object's own unresolved projection */
    invalidators: z.array(InvalidatorSchema),
    /** information-latency rule: this fixture creates no epistemic interruption (F-014B §10 not engaged) */
    information_latency: z.strictObject({ creates_epistemic_interruption: z.literal(false) }),
  })
  .superRefine((o, ctx) => {
    const bad = (message: string, path: (string | number)[] = []) =>
      ctx.addIssue({ code: "custom", message, path });
    if (o.next_boundary) {
      const c = compareTime(o.last_resolved_basis, o.next_boundary.at);
      if (c === null)
        bad("boundary and last resolved basis are in different units", ["next_boundary"]);
      else if (c !== -1)
        bad("an earned boundary must lie after the last resolved basis", ["next_boundary"]);
    }
    const stages = new Set<string>();
    const produced = new Set<string>();
    const closes = new Set<string>();
    o.dependencies.forEach((d, i) => {
      const id = JSON.stringify([
        d.stage.causal_process_id,
        d.stage.owner_operation.owner,
        d.stage.owner_operation.operation,
        d.stage.prospective_result_id,
      ]);
      if (stages.has(id)) bad("duplicate stage declaration", ["dependencies", i]);
      stages.add(id);
      for (const k of d.produces) {
        if (produced.has(k))
          bad(`fact key ${k} is produced by two declared stages`, ["dependencies", i]);
        produced.add(k);
      }
      if (d.declares_close) {
        if (closes.has(d.declares_close.name)) bad("duplicate close name", ["dependencies", i]);
        closes.add(d.declares_close.name);
      }
    });
  });
export type TemporalObject = z.infer<typeof TemporalObjectSchema>;

// ---------------------------------------------------------------------------------------------
// Shared temporal state (F-014B §2): canonical time and the lawful stop/remainder continuation.
// ---------------------------------------------------------------------------------------------

export const UNRESOLVED_REASONS = [
  /** a NOW cycle over stage identity (F-017 §4.6) that no authorized GROUP resolves */
  "INSTANTANEOUS_CYCLE",
  /** the dependency order (NOW and CLOSE) cannot be satisfied although no NOW cycle exists */
  "UNSATISFIABLE_ORDER",
  /** a CLOSE read whose Close Basis the producer's own declaration does not name */
  "CLOSE_BASIS_UNDECLARED",
  /** a CLOSE read whose producer close is not among the engaged stages */
  "PREDECESSOR_ABSENT",
  /** a NOW read whose source fact is not committed */
  "SOURCE_ABSENT",
  /** a read whose declared source owner is not the owner of the committed fact */
  "SOURCE_OWNER_MISMATCH",
  /** no owner adapter is registered for the declared owner operation */
  "PROVIDER_ABSENT",
  /** a CLOSE source that is no longer the named producer close: its fact moved past the close */
  "CLOSE_SOURCE_ADVANCED",
  /** IM-11 rejected the staged group at validation: nothing was published and nothing is credited */
  "VALIDATION_REJECTED",
  /** an engaged predecessor is itself unresolved */
  "PREDECESSOR_BLOCKED",
  /** a stage's inputs are not established at ONE temporal basis: it fails closed, never mixes times */
  "BASIS_MISMATCH",
  /** a read's source value violates its typed contract: nothing is credited from it */
  "SOURCE_INVALID",
] as const;
export const UnresolvedReasonSchema = z.enum(UNRESOLVED_REASONS);
export type UnresolvedReason = z.infer<typeof UnresolvedReasonSchema>;

export const UnresolvedDependentSchema = z.strictObject({
  stage: StageKeySchema,
  reason: UnresolvedReasonSchema,
});
export type UnresolvedDependent = z.infer<typeof UnresolvedDependentSchema>;

export const TemporalStateSchema = z
  .strictObject({
    canonical_time: CanonicalTimeSchema,
    /** the transaction that established `canonical_time`; null only for the initial basis */
    last_transaction: EntityId.nullable(),
    /** lawful stop/remainder continuity: what remains unresolved after the last stop */
    continuation: z
      .strictObject({
        from_transaction: EntityId,
        /** the requested target still to be reached from `canonical_time`; null when none */
        toward: CanonicalTimeSchema.nullable(),
        unresolved_dependents: z.array(UnresolvedDependentSchema),
      })
      .nullable(),
  })
  .superRefine((s, ctx) => {
    const bad = (message: string) =>
      ctx.addIssue({ code: "custom", message, path: ["continuation"] });
    if (s.last_transaction === null && s.continuation !== null) {
      bad("the initial basis has no continuation");
    }
    if (s.continuation) {
      const { toward, unresolved_dependents } = s.continuation;
      if (toward === null && unresolved_dependents.length === 0) bad("an empty continuation");
      if (toward !== null && compareTime(s.canonical_time, toward) !== -1) {
        bad("the remainder target must lie after the canonical time");
      }
      if (s.continuation.from_transaction !== s.last_transaction) {
        bad("the continuation must come from the last transaction");
      }
    }
  });
export type TemporalState = z.infer<typeof TemporalStateSchema>;

/** F-014B §13 active material-boundary index: active entries only, never recurrence history. */
export const BoundaryIndexSchema = z
  .strictObject({
    entries: z.array(
      z.strictObject({ object_id: EntityId, boundary_id: Id, at: CanonicalTimeSchema }),
    ),
  })
  .superRefine((idx, ctx) => {
    const bad = (message: string) => ctx.addIssue({ code: "custom", message, path: ["entries"] });
    const seen = new Set<string>();
    idx.entries.forEach((e, i) => {
      if (seen.has(e.object_id)) bad(`object ${e.object_id} has more than one active boundary`);
      seen.add(e.object_id);
      const prev = idx.entries[i - 1];
      if (!prev) return;
      const c = compareTime(prev.at, e.at);
      if (c === null) bad("entries are in different units");
      else if (c === 1 || (c === 0 && prev.object_id >= e.object_id)) {
        bad("entries must be sorted by (time, object_id)");
      }
    });
  });
export type BoundaryIndex = z.infer<typeof BoundaryIndexSchema>;

// ---------------------------------------------------------------------------------------------
// RC-05 — ResolutionTransaction
// ---------------------------------------------------------------------------------------------

/** Active role/permission context: only the already-approved player-choice pair; no new authority. */
export const TransactionContextSchema = z.strictObject({
  role: z.literal(PLAYER_CHOICE_AUTHORITY.role),
  permission: z.literal(PLAYER_CHOICE_AUTHORITY.permission),
});

/**
 * The authorized caller's declared stop predicate (F-014B W3-CP3 overlay: "Temporal stops only on the
 * declared transaction predicates supplied by the authorized caller"). The one predicate the bounded
 * fixture needs: stop once the named material boundary's dependency closure has committed.
 */
export const StopConditionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("STOP_AFTER_BOUNDARY"),
    object_id: EntityId,
    boundary_id: Id,
  }),
]);
export type StopCondition = z.infer<typeof StopConditionSchema>;

export const RequestedSchema = z
  .strictObject({
    target: CanonicalTimeSchema.nullable(),
    condition: StopConditionSchema.nullable(),
  })
  .refine(
    (r) => r.target !== null || r.condition !== null,
    "a target and/or a condition is required",
  );

export const TriggerSchema = z.strictObject({ kind: Id, ref: Id });

/**
 * The immutable input of one outer resolution. Identity is the caller-supplied `transaction_id`: there
 * is no universal turn number, and campaign revision, journal position, requested horizon, retry
 * count, message count and wall-clock time are neither accepted nor substituted for it. `basis` and
 * `secrecy` (RC-02) have no F-027 vocabulary; they are authored, preserved verbatim and never
 * defaulted.
 */
export const ResolutionRequestSchema = z.strictObject({
  transaction_id: EntityId,
  cause: Id,
  trigger: TriggerSchema,
  /** the earlier transaction whose persisted remainder this continues, if any */
  continues: EntityId.nullable(),
  requested: RequestedSchema,
  context: TransactionContextSchema,
  publication: z.strictObject({ basis: Id, secrecy: Id }),
});
export type ResolutionRequest = z.infer<typeof ResolutionRequestSchema>;

export const StageRecordSchema = z.strictObject({
  stage: StageKeySchema,
  /** realized reads: each declaration with the exact source version/provenance it was taken at */
  reads: z.array(TemporalReadSchema),
  /** authoritative reference to the committed group and its receipt (RC-16) */
  group_id: Id,
  intent_id: Id,
  revision: z.number().int().positive(),
  group_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** the committed delta, by reference: which owner facts were written, at which version */
  writes: z.array(z.strictObject({ key: Id, version: Version.min(1) })).min(1),
  /** validation outcome: the invariants the receipt asserts */
  validation: z.strictObject({ invariants: z.array(Id).min(1) }),
});
export type StageRecord = z.infer<typeof StageRecordSchema>;

export const STOP_REASONS = [
  "TARGET_REACHED",
  "CONDITION_SATISFIED",
  "DEPENDENCY_UNRESOLVED",
] as const;

export const ResolutionTransactionSchema = z
  .strictObject({
    transaction_id: EntityId,
    cause: Id,
    trigger: TriggerSchema,
    continues: EntityId.nullable(),
    /** opening temporal basis/time: the canonical time and the version of the state it was read at */
    opening: z.strictObject({ basis_time: CanonicalTimeSchema, state_version: Version.min(1) }),
    requested: RequestedSchema,
    /** active role/permission context */
    context: TransactionContextSchema,
    /**
     * Causally engaged references (RC-05): EVERY temporal object whose due boundary the transaction
     * selected and whose declared dependency graph it engaged, whether or not the work completed.
     * `boundary` distinguishes the two cases, and only RETIRED objects are ever mutated:
     *   RETIRED       every declared stage committed; the boundary was crossed and retired and the
     *                 object advanced (`version_after`).
     *   STILL_ACTIVE  at least one declared stage is unresolved; the object and its earned boundary
     *                 are untouched and stay in the active index. Recording that it was engaged does
     *                 not mutate it.
     */
    engaged: z.array(
      z.discriminatedUnion("boundary", [
        z.strictObject({
          boundary: z.literal("RETIRED"),
          object_id: EntityId,
          fact_key: Id,
          version_before: Version.min(1),
          version_after: Version.min(1),
        }),
        z.strictObject({
          boundary: z.literal("STILL_ACTIVE"),
          object_id: EntityId,
          fact_key: Id,
          version_before: Version.min(1),
        }),
        /**
         * PCB-01: a Population reconciliation object with NO earned boundary, engaged only because a
         * consumer's declared barrier made its reconciliation due. It resolves at the consumer's
         * boundary instant and records that it did (`version_after`); it was never in the active index.
         */
        z.strictObject({
          boundary: z.literal("DUE_RECONCILED"),
          object_id: EntityId,
          fact_key: Id,
          version_before: Version.min(1),
          version_after: Version.min(1),
          due_for: StageKeySchema,
          trigger: z.literal("PCB-01"),
          /** why it was due: re-derived and re-verified from the committed stage group */
          evidence: Pcb01EvidenceSchema,
        }),
        /** PCB-01 reconciliation that could not lawfully complete: not credited, not mutated. */
        z.strictObject({
          boundary: z.literal("DUE_UNRESOLVED"),
          object_id: EntityId,
          fact_key: Id,
          version_before: Version.min(1),
          due_for: StageKeySchema,
          trigger: z.literal("PCB-01"),
        }),
      ]),
    ),
    /** material boundaries crossed: exactly the RETIRED engaged objects' boundaries */
    boundaries_crossed: z.array(
      z.strictObject({ object_id: EntityId, boundary_id: Id, at: CanonicalTimeSchema }),
    ),
    /** committed groups/receipts, in resolution order */
    stages: z.array(StageRecordSchema),
    /** rule versions the committed groups were written under (RC-01) */
    rule_versions: z.array(SourceRefSchema),
    /** actual stop and the unresolved remainder */
    outcome: z.strictObject({
      actual_stop: CanonicalTimeSchema,
      stop_reason: z.enum(STOP_REASONS),
      remainder: z.strictObject({ from: CanonicalTimeSchema, to: CanonicalTimeSchema }).nullable(),
      /** unresolved dependent remainder */
      unresolved_dependents: z.array(UnresolvedDependentSchema),
    }),
  })
  .superRefine((t, ctx) => {
    const bad = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: "custom", message, path });
    const { actual_stop, stop_reason, remainder, unresolved_dependents } = t.outcome;
    const c = compareTime(t.opening.basis_time, actual_stop);
    if (c === null || c === 1)
      bad("the actual stop may not precede the opening basis", ["outcome"]);
    const target = t.requested.target;
    if (target) {
      const ct = compareTime(actual_stop, target);
      if (ct === null || ct === 1)
        bad("the actual stop may not pass the requested target", ["outcome"]);
    }
    if (remainder) {
      if (
        !target ||
        !timeEquals(remainder.to, target) ||
        !timeEquals(remainder.from, actual_stop)
      ) {
        bad("the remainder must run from the actual stop to the requested target", [
          "outcome",
          "remainder",
        ]);
      }
      if (compareTime(remainder.from, remainder.to) !== -1) {
        bad("an empty remainder is represented as null", ["outcome", "remainder"]);
      }
    }
    if (stop_reason === "TARGET_REACHED") {
      if (!target || !timeEquals(actual_stop, target) || remainder !== null) {
        bad("TARGET_REACHED means the stop equals the target with no remainder", ["outcome"]);
      }
      // a declared stop condition names a due boundary, so the target cannot be reached past it
      if (t.requested.condition !== null) {
        bad("a transaction with a requested condition cannot stop as TARGET_REACHED", ["outcome"]);
      }
    }
    if (stop_reason === "CONDITION_SATISFIED") {
      const cond = t.requested.condition;
      // Not merely a non-null condition: the exact requested boundary must have been crossed (and
      // retired) by THIS transaction, and the stop is that boundary's instant.
      const crossed = cond
        ? t.boundaries_crossed.find(
            (b) => b.object_id === cond.object_id && b.boundary_id === cond.boundary_id,
          )
        : undefined;
      if (!cond || !crossed || !timeEquals(crossed.at, actual_stop)) {
        bad(
          "CONDITION_SATISFIED requires this transaction to have crossed the requested boundary, stopping at its instant",
          ["outcome"],
        );
      }
    }
    if ((stop_reason === "DEPENDENCY_UNRESOLVED") !== unresolved_dependents.length > 0) {
      bad("unresolved dependents exist exactly when the stop is DEPENDENCY_UNRESOLVED", [
        "outcome",
      ]);
    }
    const engaged = new Set(t.engaged.map((e) => e.object_id));
    if (engaged.size !== t.engaged.length) bad("duplicate engaged reference", ["engaged"]);
    const retired = new Set(
      t.engaged.filter((e) => e.boundary === "RETIRED").map((e) => e.object_id),
    );
    const crossedIds = new Set(t.boundaries_crossed.map((b) => b.object_id));
    if (
      crossedIds.size !== t.boundaries_crossed.length ||
      crossedIds.size !== retired.size ||
      [...crossedIds].some((id) => !retired.has(id))
    ) {
      bad(
        "the boundaries crossed are exactly those of the engaged objects whose boundary was retired",
        ["boundaries_crossed"],
      );
    }
    const stillActive = t.engaged.filter((e) => e.boundary === "STILL_ACTIVE");
    if ((stop_reason === "DEPENDENCY_UNRESOLVED") !== stillActive.length > 0) {
      bad(
        "an engaged object keeps its boundary active exactly when the stop is DEPENDENCY_UNRESOLVED",
        ["engaged"],
      );
    }
    const groups = new Set<string>();
    for (const s of t.stages) {
      if (groups.has(s.group_id) || groups.has(s.intent_id))
        bad("duplicate committed group", ["stages"]);
      groups.add(s.group_id);
      groups.add(s.intent_id);
    }
  });
export type ResolutionTransaction = z.infer<typeof ResolutionTransactionSchema>;
