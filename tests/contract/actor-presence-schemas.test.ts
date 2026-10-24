// R1 Stage-One v1.1 — the strict value shapes. Strictness is the structural half of the exclusions: B1 is inert setup evidence (no
// custody, no presence, no custodian), the closure asserts an inventory only, and B2 alone carries the fixed initial non-PC custody
// epoch and the Temporal-derived instant. Nothing states a movement, a successor, a viewpoint or a sensory faculty.
import { describe, expect, it } from "vitest";
import {
  ActorPhysicalPresenceSchema,
  ActorSetupPlacementSchema,
  NON_PC_INITIAL,
  WorldSetupClosureSchema,
  comparePlacementPins,
} from "@immortalis/contracts";
import { closureValue, placementValue, presenceValue } from "../support/actor-presence.ts";

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe("B1 actor_setup_placement", () => {
  it("accepts exactly the frozen shape and no field in which custody, presence, a viewpoint or a faculty could be stated", () => {
    expect(ok(ActorSetupPlacementSchema, placementValue())).toBe(true);
    for (const extra of [
      { initial_custody: NON_PC_INITIAL },
      { custodian: { owner: "world_state" } },
      { effective_instant: { unit: "tick", value: 1 } },
      { facing: "north" },
      { sense: "hearing" },
      { position: "doorway" },
    ])
      expect(
        ok(ActorSetupPlacementSchema, { ...placementValue(), ...extra }),
        JSON.stringify(extra),
      ).toBe(false);
    for (const missing of [
      "actor_id",
      "world",
      "locus",
      "actor_state",
      "pinned_versions",
      "statement",
    ]) {
      const value = placementValue() as Record<string, unknown>;
      delete value[missing];
      expect(ok(ActorSetupPlacementSchema, value), missing).toBe(false);
    }
    expect(ok(ActorSetupPlacementSchema, placementValue({ actor_state: [] }))).toBe(false);
    expect(ok(ActorSetupPlacementSchema, placementValue({ statement: "" }))).toBe(false);
    expect(ok(ActorSetupPlacementSchema, placementValue({ statement: " padded " }))).toBe(false);
  });
});

describe("world_setup_closure", () => {
  it("is a world reference and a sorted key/version inventory, empty allowed, with no custody", () => {
    expect(ok(WorldSetupClosureSchema, closureValue([]))).toBe(true);
    expect(
      ok(
        WorldSetupClosureSchema,
        closureValue([{ fact_key: "world-state/actor/a/setup-placement", version: 1 }]),
      ),
    ).toBe(true);
    expect(ok(WorldSetupClosureSchema, { ...closureValue([]), custodian: {} })).toBe(false);
    expect(
      ok(WorldSetupClosureSchema, { ...closureValue([]), initial_custody: NON_PC_INITIAL }),
    ).toBe(false);
    expect(ok(WorldSetupClosureSchema, closureValue([{ fact_key: "k", version: 0 }]))).toBe(false);
  });

  it("the canonical order is ascending by key", () => {
    const pins = [
      { fact_key: "b", version: 1 },
      { fact_key: "a", version: 1 },
    ];
    expect([...pins].sort(comparePlacementPins).map((p) => p.fact_key)).toEqual(["a", "b"]);
  });
});

describe("B2 actor_physical_presence", () => {
  it("carries the fixed initial custody epoch, the World-State fallback custodian literals and a canonical instant", () => {
    expect(ok(ActorPhysicalPresenceSchema, presenceValue())).toBe(true);
    expect(ok(ActorPhysicalPresenceSchema, presenceValue({ initial_custody: "PC" }))).toBe(false);
    expect(
      ok(
        ActorPhysicalPresenceSchema,
        presenceValue({ custodian: { owner: "x", facet: "y", basis: "z" } }),
      ),
    ).toBe(false);
    expect(ok(ActorPhysicalPresenceSchema, presenceValue({ effective_instant: "now" }))).toBe(
      false,
    );
    expect(
      ok(
        ActorPhysicalPresenceSchema,
        presenceValue({ effective_instant: { unit: "tick", value: -1 } }),
      ),
    ).toBe(false);
    for (const extra of [{ move: {} }, { destination: {} }, { successor: 2 }, { second_locus: {} }])
      expect(ok(ActorPhysicalPresenceSchema, { ...presenceValue(), ...extra })).toBe(false);
    for (const missing of ["placement", "closure", "world", "locus"]) {
      const pinned = { world: 1, locus: 1, placement: 1, closure: 1 } as Record<string, number>;
      delete pinned[missing];
      expect(
        ok(ActorPhysicalPresenceSchema, presenceValue({ pinned_versions: pinned })),
        missing,
      ).toBe(false);
    }
  });
});
