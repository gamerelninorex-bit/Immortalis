// Contract layer for the Turnless Temporal & Resolution Transaction Foundation: RC-03 TemporalRead,
// RC-04 StageKey, RC-05 ResolutionTransaction and the minimum RC-10 TemporalObject.
// Governing sources: F-014B §§2-4, 6, 7, 9, 13, 17; F-017 §§3-4 (spec lock f027). Brief §5.1.
// Every schema is strict: an unmodelled field is rejected, never carried (IA-02). CAL-01 stays
// UNCALIBRATED: nothing here accepts, infers or defaults an approximate-partition tolerance.
import { describe, expect, it } from "vitest";
import {
  BoundaryIndexSchema,
  CanonicalTimeSchema,
  PROHIBITED_STAGE_IDENTITY_DIMENSIONS,
  ResolutionRequestSchema,
  ResolutionTransactionSchema,
  StageKeySchema,
  TemporalObjectSchema,
  TemporalReadDeclarationSchema,
  TemporalReadSchema,
  TemporalStateSchema,
  parseStageKey,
} from "@immortalis/contracts";
import { stageId } from "@immortalis/engine";
import {
  BOUNDARY_ID,
  CONSUMER_STAGE,
  OBJECT_ENGAGED,
  PRODUCER_STAGE,
  SYNTH_CLOSE_NAME,
  SYNTH_OWNER,
  SYNTH_PRODUCER_RESULT_KEY,
  SYNTH_SOURCE_KEY,
  T0,
  T1,
  TB,
  at,
  closeBasis,
  dormantObject,
  engagedObject,
  stopAtBoundaryRequest,
} from "@immortalis/testkit";

const nowRead = (over: Record<string, unknown> = {}) => ({
  mode: "AS-OF-NOW",
  source: { owner: SYNTH_OWNER, fact_key: SYNTH_SOURCE_KEY },
  invalidators: [{ fact_key: SYNTH_SOURCE_KEY }],
  ...over,
});
const closeRead = (over: Record<string, unknown> = {}) => ({
  mode: "AS-OF-DECLARED-CLOSE",
  source: { owner: SYNTH_OWNER, fact_key: SYNTH_PRODUCER_RESULT_KEY },
  close_basis: closeBasis(),
  invalidators: [],
  ...over,
});
const basis = { version: 1, committed_by: "group-x" };
const valid = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe("RC-03 TemporalRead — NOW validity", () => {
  it("accepts a valid AS-OF-NOW read without a Close Basis", () => {
    expect(valid(TemporalReadDeclarationSchema, nowRead())).toBe(true);
    expect(valid(TemporalReadSchema, { ...nowRead(), source_basis: basis })).toBe(true);
  });
  it("rejects a NOW read that carries a Close Basis (named Close Basis when and only when CLOSE)", () => {
    expect(valid(TemporalReadDeclarationSchema, nowRead({ close_basis: closeBasis() }))).toBe(
      false,
    );
    expect(valid(TemporalReadDeclarationSchema, nowRead({ close_basis: null }))).toBe(false);
  });
});

describe("RC-03 TemporalRead — CLOSE validity", () => {
  it("accepts an AS-OF-DECLARED-CLOSE read and preserves the exact named Close Basis", () => {
    const parsed = TemporalReadDeclarationSchema.parse(closeRead());
    expect(parsed).toEqual(closeRead());
    if (parsed.mode !== "AS-OF-DECLARED-CLOSE") throw new Error("narrowing");
    expect(parsed.close_basis).toEqual({
      name: SYNTH_CLOSE_NAME,
      producer: { owner: SYNTH_OWNER, operation: "synthetic-produce" },
    });
  });
  it("a realized read carries the source version/provenance basis it was taken at", () => {
    expect(TemporalReadSchema.parse({ ...closeRead(), source_basis: basis })).toMatchObject({
      source_basis: basis,
    });
    expect(valid(TemporalReadSchema, closeRead())).toBe(false); // no basis: not a realized read
    expect(
      valid(TemporalReadSchema, { ...nowRead(), source_basis: { version: 0, committed_by: "g" } }),
    ).toBe(false);
  });
});

describe("RC-03 TemporalRead — negative cases", () => {
  it("CLOSE without a Close Basis fails", () => {
    const { close_basis: _omit, ...without } = closeRead();
    void _omit;
    expect(valid(TemporalReadDeclarationSchema, without)).toBe(false);
    expect(valid(TemporalReadDeclarationSchema, closeRead({ close_basis: null }))).toBe(false);
  });
  it.each(["AS-OF-LATEST", "AS-OF-SLICE", "AS-OF-HORIZON", "CURRENT-ESTABLISHED", "as-of-now", ""])(
    "an invented read mode %j fails (no third temporal-read type)",
    (mode) => {
      expect(valid(TemporalReadDeclarationSchema, { ...nowRead(), mode })).toBe(false);
      expect(valid(TemporalReadDeclarationSchema, { ...closeRead(), mode })).toBe(false);
    },
  );
  it.each([
    ["a bare slice token", "slice-3"],
    ["a bare horizon token", "horizon:200"],
    ["a horizon smuggled beside the name", { ...closeBasis(), horizon: T1 }],
    ["a slice smuggled beside the name", { ...closeBasis(), slice: 3 }],
    ["a timestamp instead of a producer close", { name: "t=140", at: TB }],
    ["a name with no producer", { name: SYNTH_CLOSE_NAME }],
    ["a producer with no name", { producer: closeBasis().producer }],
  ])(
    "a horizon-dependent/arbitrary slice token cannot stand in for the producer Close Basis: %s",
    (_l, close_basis) => {
      expect(valid(TemporalReadDeclarationSchema, closeRead({ close_basis }))).toBe(false);
    },
  );
  it("carries no field in which a horizon, slice or tolerance could ride", () => {
    for (const extra of [{ horizon: T1 }, { slice: 1 }, { tolerance: 0.1 }, { third_mode: true }]) {
      expect(valid(TemporalReadDeclarationSchema, nowRead(extra))).toBe(false);
      expect(valid(TemporalReadDeclarationSchema, closeRead(extra))).toBe(false);
    }
  });
});

describe("RC-04 StageKey — identity shape", () => {
  const key = { ...PRODUCER_STAGE };
  it("accepts exactly the causal process, the owner operation and the prospective result", () => {
    expect(StageKeySchema.parse(key)).toEqual(key);
    expect(parseStageKey(key).ok).toBe(true);
  });
  it.each(["causal_process_id", "owner_operation", "prospective_result_id"])(
    "requires %s",
    (field) => {
      const { [field as keyof typeof key]: _omit, ...rest } = key;
      void _omit;
      const r = parseStageKey(rest);
      expect(!r.ok && r.error.code).toBe("STAGE_KEY_INVALID");
    },
  );
  it("requires the owner operation to be owner + operation, nothing more", () => {
    expect(parseStageKey({ ...key, owner_operation: { owner: "o" } }).ok).toBe(false);
    expect(
      parseStageKey({ ...key, owner_operation: { ...key.owner_operation, version: 2 } }).ok,
    ).toBe(false);
  });
});

describe("RC-04 StageKey — anti-fake identity", () => {
  it.each(PROHIBITED_STAGE_IDENTITY_DIMENSIONS)(
    "%s cannot be smuggled into a StageKey: rejected, and named as a prohibited dimension",
    (dimension) => {
      const r = parseStageKey({ ...PRODUCER_STAGE, [dimension]: 7 });
      expect(!r.ok && r.error.code).toBe("STAGE_KEY_PROHIBITED_DIMENSION");
      expect(!r.ok && r.error.details?.["dimensions"]).toEqual([dimension]);
      expect(StageKeySchema.safeParse({ ...PRODUCER_STAGE, [dimension]: 7 }).success).toBe(false);
    },
  );
  it("any other extra dimension is rejected too — rejection is structural, not a list lookup", () => {
    const r = parseStageKey({ ...PRODUCER_STAGE, attempt_nonce: "n" });
    expect(!r.ok && r.error.code).toBe("STAGE_KEY_INVALID");
  });
  it("a stage's derived identity is a function of the three identity fields alone", () => {
    const a = stageId(PRODUCER_STAGE);
    expect(stageId({ ...PRODUCER_STAGE })).toBe(a);
    expect(stageId(CONSUMER_STAGE)).not.toBe(a);
    expect(stageId({ ...PRODUCER_STAGE, prospective_result_id: "a-different-result" })).not.toBe(a);
  });
});

describe("CanonicalTime", () => {
  it("is an opaque exact coordinate: integer, non-negative, with an explicit unit", () => {
    expect(CanonicalTimeSchema.parse(T0)).toEqual(T0);
    for (const bad of [
      { unit: "u", value: 1.5 },
      { unit: "u", value: -1 },
      { unit: "u", value: Number.NaN },
      { unit: "", value: 1 },
      { value: 1 },
      { unit: "u", value: 1, calendar: "gregorian" },
    ]) {
      expect(valid(CanonicalTimeSchema, bad)).toBe(false);
    }
  });
});

describe("RC-10 TemporalObject — exact fixture", () => {
  it("accepts the engaged exact-partition object and the dormant control", () => {
    expect(valid(TemporalObjectSchema, engagedObject())).toBe(true);
    expect(valid(TemporalObjectSchema, dormantObject())).toBe(true);
  });
  it.each([
    "object_id",
    "owning_ref",
    "last_resolved_basis",
    "partition",
    "next_boundary",
    "dependencies",
    "continuation",
    "invalidators",
    "information_latency",
  ])("requires %s (every minimum RC-10 field is material)", (field) => {
    const o: Record<string, unknown> = { ...engagedObject() };
    delete o[field];
    expect(valid(TemporalObjectSchema, o)).toBe(false);
  });
  it("EXACT-PARTITION is the only partition class; no tolerance exists, is defaulted or is accepted (CAL-01)", () => {
    const withPartition = (partition: unknown) => ({ ...engagedObject(), partition });
    expect(valid(TemporalObjectSchema, withPartition({ class: "EXACT-PARTITION" }))).toBe(true);
    expect(valid(TemporalObjectSchema, withPartition({ class: "APPROXIMATE-PARTITION" }))).toBe(
      false,
    );
    expect(
      valid(
        TemporalObjectSchema,
        withPartition({ class: "APPROXIMATE-PARTITION", tolerance: 0.01 }),
      ),
    ).toBe(false);
    expect(
      valid(TemporalObjectSchema, withPartition({ class: "EXACT-PARTITION", tolerance: 0 })),
    ).toBe(false);
    expect(valid(TemporalObjectSchema, withPartition({}))).toBe(false); // never defaulted
    expect(valid(TemporalObjectSchema, { ...engagedObject(), tolerance: 0 })).toBe(false);
  });
  it("the information-latency rule must state that no epistemic interruption is created", () => {
    const il = (v: unknown) => ({ ...engagedObject(), information_latency: v });
    expect(valid(TemporalObjectSchema, il({ creates_epistemic_interruption: false }))).toBe(true);
    expect(valid(TemporalObjectSchema, il({ creates_epistemic_interruption: true }))).toBe(false);
    expect(valid(TemporalObjectSchema, il({}))).toBe(false);
  });
  it("an earned boundary lies strictly after the last resolved basis, in the same unit", () => {
    expect(
      valid(TemporalObjectSchema, engagedObject({ next_boundary: { boundary_id: "b", at: T0 } })),
    ).toBe(false);
    expect(
      valid(
        TemporalObjectSchema,
        engagedObject({ next_boundary: { boundary_id: "b", at: at(50) } }),
      ),
    ).toBe(false);
    expect(
      valid(
        TemporalObjectSchema,
        engagedObject({ next_boundary: { boundary_id: "b", at: { unit: "other", value: 500 } } }),
      ),
    ).toBe(false);
  });
  it("no recurrence history: exactly one next boundary or none, never a list", () => {
    expect(
      valid(TemporalObjectSchema, {
        ...engagedObject(),
        next_boundary: [
          { boundary_id: "a", at: TB },
          { boundary_id: "b", at: T1 },
        ],
      }),
    ).toBe(false);
    expect(valid(TemporalObjectSchema, { ...engagedObject(), recurrence: { every: 10 } })).toBe(
      false,
    );
  });
  it("rejects duplicate stage declarations and two stages producing one fact", () => {
    const o = engagedObject();
    const [p, c] = o.dependencies;
    expect(valid(TemporalObjectSchema, { ...o, dependencies: [p, p] })).toBe(false);
    expect(
      valid(TemporalObjectSchema, { ...o, dependencies: [p, { ...c, produces: p!.produces }] }),
    ).toBe(false);
  });
  it("a dependency declaration's stage must be a valid StageKey (no smuggled dimension)", () => {
    const o = engagedObject();
    const [p, ...rest] = o.dependencies;
    const smuggled = { ...p, stage: { ...p!.stage, retry_count: 1 } };
    expect(valid(TemporalObjectSchema, { ...o, dependencies: [smuggled, ...rest] })).toBe(false);
  });
});

describe("shared temporal state and the active boundary index (F-014B §2, §13)", () => {
  const state = (over: Record<string, unknown> = {}) => ({
    canonical_time: TB,
    last_transaction: "tx-1",
    continuation: { from_transaction: "tx-1", toward: T1, unresolved_dependents: [] },
    ...over,
  });
  it("holds canonical time and the lawful stop/remainder continuation", () => {
    expect(valid(TemporalStateSchema, state())).toBe(true);
    expect(valid(TemporalStateSchema, state({ continuation: null }))).toBe(true);
    expect(
      valid(TemporalStateSchema, {
        canonical_time: T0,
        last_transaction: null,
        continuation: null,
      }),
    ).toBe(true);
  });
  it("rejects a turn counter, a tick, an inconsistent continuation and an empty one", () => {
    expect(valid(TemporalStateSchema, state({ turn: 3 }))).toBe(false);
    expect(valid(TemporalStateSchema, state({ tick: 3 }))).toBe(false);
    expect(
      valid(
        TemporalStateSchema,
        state({
          continuation: { from_transaction: "tx-9", toward: T1, unresolved_dependents: [] },
        }),
      ),
    ).toBe(false);
    expect(
      valid(
        TemporalStateSchema,
        state({
          continuation: { from_transaction: "tx-1", toward: TB, unresolved_dependents: [] },
        }),
      ),
    ).toBe(false);
    expect(
      valid(
        TemporalStateSchema,
        state({
          continuation: { from_transaction: "tx-1", toward: null, unresolved_dependents: [] },
        }),
      ),
    ).toBe(false);
    expect(
      valid(TemporalStateSchema, {
        canonical_time: T0,
        last_transaction: null,
        continuation: state().continuation,
      }),
    ).toBe(false);
  });
  it("the index is sorted, unique per object, single-unit and holds active entries only", () => {
    const e = (object_id: string, t: ReturnType<typeof at>) => ({
      object_id,
      boundary_id: "b",
      at: t,
    });
    expect(valid(BoundaryIndexSchema, { entries: [] })).toBe(true);
    expect(valid(BoundaryIndexSchema, { entries: [e("a", TB), e("b", T1)] })).toBe(true);
    expect(valid(BoundaryIndexSchema, { entries: [e("b", T1), e("a", TB)] })).toBe(false);
    expect(valid(BoundaryIndexSchema, { entries: [e("a", TB), e("a", T1)] })).toBe(false);
    expect(
      valid(BoundaryIndexSchema, {
        entries: [e("a", TB), { ...e("b", T1), at: { unit: "x", value: 300 } }],
      }),
    ).toBe(false);
    expect(valid(BoundaryIndexSchema, { entries: [], history: [] })).toBe(false);
  });
});

describe("RC-05 ResolutionRequest / ResolutionTransaction", () => {
  it("accepts the bounded request: a target and a declared stop condition", () => {
    expect(valid(ResolutionRequestSchema, stopAtBoundaryRequest())).toBe(true);
  });
  it("needs a target and/or a condition", () => {
    const none = { ...stopAtBoundaryRequest(), requested: { target: null, condition: null } };
    expect(valid(ResolutionRequestSchema, none)).toBe(false);
    const onlyTarget = { ...stopAtBoundaryRequest(), requested: { target: T1, condition: null } };
    expect(valid(ResolutionRequestSchema, onlyTarget)).toBe(true);
  });
  it.each([
    ["turn", 4],
    ["turn_number", 4],
    ["requested_horizon", 10],
    ["retry_count", 1],
    ["message_count", 9],
    ["campaign_revision", 12],
    ["wall_clock", "now"],
    ["slices", [110]],
  ])(
    "a universal turn number, revision, retry/message count, horizon or slice is not an input: %s",
    (k, v) => {
      expect(valid(ResolutionRequestSchema, { ...stopAtBoundaryRequest(), [k]: v })).toBe(false);
    },
  );
  it("uses only the already-approved player-choice role/permission context; it mints no authority", () => {
    const ctx = (context: unknown) => ({ ...stopAtBoundaryRequest(), context });
    expect(
      valid(
        ResolutionRequestSchema,
        ctx({ role: "role.player", permission: "permission.player_choice.commit" }),
      ),
    ).toBe(true);
    for (const bad of [
      { role: "role.archivist", permission: "permission.canon.write" },
      { role: "role.narrator", permission: "permission.player_choice.commit" },
      { role: "role.player", permission: "permission.time.advance" },
      { role: "role.player" },
    ]) {
      expect(valid(ResolutionRequestSchema, ctx(bad))).toBe(false);
    }
  });

  // A hand-built valid transaction: what a stop at Tb with a remainder toward T1 looks like.
  const sha = "a".repeat(64);
  const stage = (s: typeof PRODUCER_STAGE | typeof CONSUMER_STAGE, n: number) => ({
    stage: s,
    reads: [{ ...nowRead(), source_basis: basis }],
    group_id: `stage-group:${n}`,
    intent_id: `stage-intent:${n}`,
    revision: 10 + n,
    group_sha256: sha,
    writes: [{ key: "synthetic/k", version: 1 }],
    validation: { invariants: ["authority-present"] },
  });
  const tx = (): Record<string, unknown> => ({
    transaction_id: "tx-1",
    cause: "cause-tx-1",
    trigger: { kind: "fixture-advance-request", ref: "ref-1" },
    continues: null,
    opening: { basis_time: T0, state_version: 1 },
    requested: stopAtBoundaryRequest().requested,
    context: { role: "role.player", permission: "permission.player_choice.commit" },
    engaged: [
      {
        object_id: OBJECT_ENGAGED,
        fact_key: `temporal/object/${OBJECT_ENGAGED}`,
        version_before: 1,
        version_after: 2,
      },
    ],
    boundaries_crossed: [{ object_id: OBJECT_ENGAGED, boundary_id: BOUNDARY_ID, at: TB }],
    stages: [stage(PRODUCER_STAGE, 1), stage(CONSUMER_STAGE, 2)],
    rule_versions: [
      {
        artifact: "a",
        native_pin: "p",
        clause: "c",
        authority_lineage: ["l"],
        effective_basis: "b",
        supersedes: null,
      },
    ],
    outcome: {
      actual_stop: TB,
      stop_reason: "CONDITION_SATISFIED",
      remainder: { from: TB, to: T1 },
      unresolved_dependents: [],
    },
  });
  it("accepts a complete transaction", () => {
    expect(valid(ResolutionTransactionSchema, tx())).toBe(true);
  });
  it.each([
    "transaction_id",
    "cause",
    "trigger",
    "continues",
    "opening",
    "requested",
    "context",
    "engaged",
    "boundaries_crossed",
    "stages",
    "rule_versions",
    "outcome",
  ])(
    "requires %s (completeness: bounded target/condition, stop/remainder, engaged, provenance, commit evidence)",
    (field) => {
      const t = tx();
      delete t[field];
      expect(valid(ResolutionTransactionSchema, t)).toBe(false);
    },
  );
  it.each(["actual_stop", "stop_reason", "remainder", "unresolved_dependents"])(
    "the outcome requires %s",
    (field) => {
      const t = tx();
      const outcome = { ...(t["outcome"] as Record<string, unknown>) };
      delete outcome[field];
      expect(valid(ResolutionTransactionSchema, { ...t, outcome })).toBe(false);
    },
  );
  it.each([
    "stage",
    "reads",
    "group_id",
    "intent_id",
    "revision",
    "group_sha256",
    "writes",
    "validation",
  ])("a committed-stage record requires %s", (field) => {
    const t = tx();
    const s = { ...stage(PRODUCER_STAGE, 1) } as Record<string, unknown>;
    delete s[field];
    expect(valid(ResolutionTransactionSchema, { ...t, stages: [s] })).toBe(false);
  });
  it("enforces the stop/remainder invariants", () => {
    const withOutcome = (o: Record<string, unknown>) => ({
      ...tx(),
      outcome: { ...(tx()["outcome"] as object), ...o },
    });
    // a stop before the opening basis, or past the target, is not a lawful stop
    expect(
      valid(
        ResolutionTransactionSchema,
        withOutcome({ actual_stop: at(50), remainder: { from: at(50), to: T1 } }),
      ),
    ).toBe(false);
    expect(
      valid(
        ResolutionTransactionSchema,
        withOutcome({ actual_stop: at(300), remainder: null, stop_reason: "TARGET_REACHED" }),
      ),
    ).toBe(false);
    // a remainder must run from the actual stop to the requested target
    expect(
      valid(ResolutionTransactionSchema, withOutcome({ remainder: { from: T0, to: T1 } })),
    ).toBe(false);
    expect(
      valid(ResolutionTransactionSchema, withOutcome({ remainder: { from: TB, to: at(150) } })),
    ).toBe(false);
    // target reached means stop == target and no remainder
    expect(valid(ResolutionTransactionSchema, withOutcome({ stop_reason: "TARGET_REACHED" }))).toBe(
      false,
    );
    expect(
      valid(
        ResolutionTransactionSchema,
        withOutcome({ actual_stop: T1, stop_reason: "TARGET_REACHED", remainder: null }),
      ),
    ).toBe(true);
    // unresolved dependents exist exactly when the stop is DEPENDENCY_UNRESOLVED
    const u = { stage: CONSUMER_STAGE, reason: "PREDECESSOR_ABSENT" };
    expect(valid(ResolutionTransactionSchema, withOutcome({ unresolved_dependents: [u] }))).toBe(
      false,
    );
    expect(
      valid(
        ResolutionTransactionSchema,
        withOutcome({ stop_reason: "DEPENDENCY_UNRESOLVED", unresolved_dependents: [u] }),
      ),
    ).toBe(true);
    expect(
      valid(ResolutionTransactionSchema, withOutcome({ stop_reason: "DEPENDENCY_UNRESOLVED" })),
    ).toBe(false);
  });
  it("a turn number, revision or horizon cannot stand in for transaction identity", () => {
    for (const extra of [
      { turn: 1 },
      { revision: 12 },
      { requested_horizon: 10 },
      { retry_count: 0 },
    ]) {
      expect(valid(ResolutionTransactionSchema, { ...tx(), ...extra })).toBe(false);
    }
  });
});
