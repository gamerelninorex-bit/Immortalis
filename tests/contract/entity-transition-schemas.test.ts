// Contract evidence for the World-State Entity Continuity / Transition Close Backbone Foundation (seventh slice):
// the strict causing result and the strict ECT-01 Entity Transition Close. Malformed objects are rejected; no field
// exists in which a replacement entity, a cessation, a changed form, a changed quantity or condition, an agency
// count, a Population effect, a holder, a carrier, a path or an in-flight state could be stored.
// Register lineage: IA-02, IA-03; RC-02/04/10. Governing lock: spec/f027/spec-lock.json (F-027 v1.0).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENTITY_TRANSITION_CLOSE_BASIS,
  ENTITY_TRANSITION_CLOSE_NAME,
  EntityTransitionCauseSchema,
  EntityTransitionCloseSchema,
  entityTransitionBoundaryId,
  entityTransitionId,
  entityTransitionObjectId,
  entityTransitionProcessId,
  entityTransitionStage,
  parseStageKey,
  worldEntityTransitionKey,
} from "@immortalis/contracts";

const t = (value: number) => ({ unit: "u", value });
const ref = (world: string, locus: string) => ({
  world: { fact_key: `world/${world}/profile`, entity_id: world },
  locus: { fact_key: `world/${world}/locus/${locus}`, entity_id: locus },
});

const cause = (over: Record<string, unknown> = {}) => ({
  cause_id: "c-1",
  source: { owner: "some-owner", cause_ref: "event-1" },
  subject: { fact_key: "world/w/entity/e-1", entity_id: "e-1" },
  outcome: { kind: "SAME_ENTITY_LOCUS_CHANGE_REQUIRED", destination: ref("w", "l2") },
  timing: { established_at: t(100), occurs_at: t(200) },
  ...over,
});

const close = (over: Record<string, unknown> = {}) => ({
  transition_id: entityTransitionId("c-1"),
  entity: { fact_key: "world/w/entity/e-1", entity_id: "e-1", version: 1 },
  continuity: {
    relation: "SAME_ENTITY_CONTINUES",
    predecessor: "e-1",
    successor: "e-1",
    existence: "CONTINUES",
    form: "UNCHANGED",
    conserved: "QUANTITY_AND_CONDITION_UNCHANGED",
    basis: "CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLY",
  },
  locus: { from: ref("w", "l1"), to: ref("w", "l2") },
  cause: { owner: "some-owner", fact_key: "x/c-1", version: 1, cause_id: "c-1" },
  custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
  closed_at: t(200),
  close: { name: ENTITY_TRANSITION_CLOSE_NAME, stage: entityTransitionStage("c-1") },
  ...over,
});

describe("the causing result establishes cause and causal outcome only", () => {
  it("accepts the one representable outcome", () => {
    expect(EntityTransitionCauseSchema.safeParse(cause()).success).toBe(true);
  });
  it("has no field in which the entity's locus, continuity, existence, quantity or condition could be written", () => {
    for (const extra of [
      { current_locus: ref("w", "l2") },
      { continuity: "SAME_ENTITY_CONTINUES" },
      { existence: "CESSATION" },
      { quantity: { amount: 1, unit: "u" } },
      { condition: "damaged" },
      { form: "CHANGED" },
    ])
      expect(EntityTransitionCauseSchema.safeParse(cause(extra)).success).toBe(false);
    // and none inside the outcome or the subject reference
    expect(
      EntityTransitionCauseSchema.safeParse(
        cause({
          outcome: {
            kind: "SAME_ENTITY_LOCUS_CHANGE_REQUIRED",
            destination: ref("w", "l2"),
            entity_now_at: ref("w", "l2"),
          },
        }),
      ).success,
    ).toBe(false);
    expect(
      EntityTransitionCauseSchema.safeParse(
        cause({ subject: { fact_key: "a", entity_id: "e-1", quantity: 3 } }),
      ).success,
    ).toBe(false);
  });
  it("represents no other outcome kind (death, destruction, fission, fusion, animation, form change)", () => {
    for (const kind of [
      "CESSATION",
      "DESTRUCTION",
      "FISSION",
      "FUSION",
      "FORM_CHANGE",
      "ANIMATION",
    ])
      expect(
        EntityTransitionCauseSchema.safeParse(
          cause({ outcome: { kind, destination: ref("w", "l2") } }),
        ).success,
      ).toBe(false);
  });
  it("never takes effect before the basis it was established at, in one unit (taking effect AT it is the causing owner's own lawful timing, decided by the derivation)", () => {
    expect(
      EntityTransitionCauseSchema.safeParse(
        cause({ timing: { established_at: t(200), occurs_at: t(200) } }),
      ).success,
    ).toBe(true);
    for (const timing of [
      { established_at: t(300), occurs_at: t(200) },
      { established_at: { unit: "a", value: 1 }, occurs_at: { unit: "b", value: 2 } },
    ])
      expect(EntityTransitionCauseSchema.safeParse(cause({ timing })).success).toBe(false);
  });
});

describe("ECT-01: the same entity continues; only the current locus changes", () => {
  it("accepts the one representable relation", () => {
    expect(EntityTransitionCloseSchema.safeParse(close()).success).toBe(true);
  });
  it("is strict: no replacement, cessation, form change, quantity, condition, agency count or Population effect field", () => {
    for (const extra of [
      { successor_entity: "e-2" },
      { cessation: true },
      { form_change: "x" },
      { quantity: { amount: 1, unit: "u" } },
      { condition: "c" },
      { agency_topology: { autonomous_entities: 2 } },
      { population_transition_envelope: {} },
      { holder: "someone" },
      { in_transit: true },
    ])
      expect(EntityTransitionCloseSchema.safeParse(close(extra)).success).toBe(false);
  });
  it("represents no continuity relation other than 'same entity continues, unchanged but for locus'", () => {
    const base = close().continuity;
    for (const c of [
      { relation: "NEW_SUCCESSOR" },
      { relation: "PREDECESSOR_ENDED" },
      { relation: "CONTINUITY_DISPUTED" },
      { existence: "CEASES" },
      { form: "CHANGED" },
      { conserved: "QUANTITY_CHANGED" },
      { basis: "ANYTHING_ELSE" },
    ])
      expect(
        EntityTransitionCloseSchema.safeParse(close({ continuity: { ...base, ...c } })).success,
      ).toBe(false);
  });
  it("names ONE entity as predecessor and successor", () => {
    const base = close().continuity;
    expect(
      EntityTransitionCloseSchema.safeParse(close({ continuity: { ...base, successor: "e-2" } }))
        .success,
    ).toBe(false);
    expect(
      EntityTransitionCloseSchema.safeParse(close({ continuity: { ...base, predecessor: "e-0" } }))
        .success,
    ).toBe(false);
  });
  it("requires a MATERIAL transition within one world: the locus changes and the world does not", () => {
    expect(
      EntityTransitionCloseSchema.safeParse(
        close({ locus: { from: ref("w", "l1"), to: ref("w", "l1") } }),
      ).success,
    ).toBe(false);
    expect(
      EntityTransitionCloseSchema.safeParse(
        close({ locus: { from: ref("w", "l1"), to: ref("v", "l2") } }),
      ).success,
    ).toBe(false);
  });
  it("is committed by World-State as fallback custodian only, and the close is the one named close", () => {
    expect(
      EntityTransitionCloseSchema.safeParse(
        close({ custodian: { ...close().custodian, owner: "production" } }),
      ).success,
    ).toBe(false);
    expect(
      EntityTransitionCloseSchema.safeParse(
        close({ close: { name: "Some Other Close", stage: entityTransitionStage("c-1") } }),
      ).success,
    ).toBe(false);
    expect(ENTITY_TRANSITION_CLOSE_NAME).toBe("Entity Transition Close");
    expect(ENTITY_TRANSITION_CLOSE_BASIS).toEqual({
      name: "Entity Transition Close",
      producer: { owner: "world_state", operation: "world-state-commit-entity-transition" },
    });
  });
  it("pins the cause and the entity at a committed (non-zero) version", () => {
    expect(
      EntityTransitionCloseSchema.safeParse(
        close({ entity: { fact_key: "k", entity_id: "e-1", version: 0 } }),
      ).success,
    ).toBe(false);
    expect(
      EntityTransitionCloseSchema.safeParse(close({ cause: { ...close().cause, version: 0 } }))
        .success,
    ).toBe(false);
  });
});

describe("identities derive from the cause identity alone; the stage excludes every prohibited dimension", () => {
  it("one cause fixes one transition, process, object, boundary and stage", () => {
    expect(entityTransitionId("c-1")).toBe("transition:c-1");
    expect(entityTransitionProcessId("c-1")).toBe("entity-transition:c-1");
    expect(entityTransitionObjectId("c-1")).toBe("obj-entity-transition-c-1");
    expect(entityTransitionBoundaryId("c-1")).toBe("boundary-entity-transition-c-1");
    expect(entityTransitionStage("c-1")).toEqual({
      causal_process_id: "entity-transition:c-1",
      owner_operation: {
        owner: "world_state",
        operation: "world-state-commit-entity-transition",
      },
      prospective_result_id: "transition:c-1",
    });
    expect(entityTransitionStage("c-1")).toEqual(entityTransitionStage("c-1"));
    expect(entityTransitionStage("c-1")).not.toEqual(entityTransitionStage("c-2"));
  });
  it("is a valid RC-04 StageKey, and a horizon, version, retry or slice is not an identity dimension of it", () => {
    expect(parseStageKey(entityTransitionStage("c-1")).ok).toBe(true);
    for (const d of ["horizon", "source_version", "retry_count", "execution_slice"])
      expect(parseStageKey({ ...entityTransitionStage("c-1"), [d]: 1 }).ok).toBe(false);
  });
  it("the transition lives in World-State's own key space, one slot per entity", () => {
    expect(worldEntityTransitionKey("w", "e-1")).toBe("world/w/entity/e-1/transition");
  });
});

describe("the contract models no excluded domain", () => {
  it("has no movement, transfer, route, pathfinding, carrier, dispatch, capacity, throughput, KTI, health, military, price or Population field", () => {
    const text = readFileSync("packages/contracts/src/entity-transition.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
      .toLowerCase();
    for (const word of [
      "in_transfer",
      "transfer",
      "route",
      "pathfinding",
      "carrier",
      "dispatch",
      "logistics",
      "movement",
      "capacity",
      "throughput",
      "hub",
      "kti",
      "health",
      "military",
      "price",
      "demand",
      "population",
      "stochastic",
      "random",
      "tick",
    ])
      expect(text, word).not.toContain(word);
  });
});
