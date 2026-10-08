/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary invalid values */
// Active-PC Post-Handover Physical Locus Custody — contract. Every schema is strict: an unmodelled field is rejected, never
// carried (IA-02), which is also the structural half of the exclusions (no movement, request, destination, route, duration,
// transfer, in-transfer state, holder, inventory or second locus can be stated).
import { describe, expect, it } from "vitest";
import {
  PcPhysicalLocusCustodySchema,
  PcPhysicalLocusCustodyTargetSchema,
  worldActorCouplingKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import { ALL_FACT_KINDS, factKind, resolveKey } from "@immortalis/engine";

const valid = () => ({
  pc_id: "pc-1",
  stationary_locus: {
    world: { fact_key: "world/w1/profile", entity_id: "w1" },
    locus: { fact_key: "world/w1/locus/l1", entity_id: "l1" },
  },
  basis: {
    established_from: "EXISTING_ACTOR_HANDOVER",
    pinned_versions: { pc: 1, binding: 1, coupling: 1, world: 1, locus: 1 },
  },
  custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
});
const parses = (v: unknown) => PcPhysicalLocusCustodySchema.safeParse(v).success;

describe("the custody record is one strict stationary fact", () => {
  it("accepts exactly the one lawful shape", () => {
    expect(parses(valid())).toBe(true);
    expect(Object.keys(PcPhysicalLocusCustodySchema.shape).sort()).toEqual(
      ["basis", "custodian", "pc_id", "stationary_locus"].sort(),
    );
  });

  it("rejects every unmodelled field, at every level (no movement, request, destination, route, duration, transfer, holder or second locus)", () => {
    for (const field of [
      "movement",
      "movement_request",
      "request",
      "commitment",
      "destination",
      "route",
      "path",
      "duration",
      "travel_time",
      "transfer",
      "in_transfer",
      "current_locus",
      "binding_locus",
      "previous_locus",
      "inventory",
      "holder",
      "willingness",
      "motive",
    ]) {
      const top: any = valid();
      top[field] = "x";
      expect(parses(top), `top-level ${field}`).toBe(false);
      const nested: any = valid();
      nested.stationary_locus[field] = "x";
      expect(parses(nested), `stationary_locus.${field}`).toBe(false);
      const basis: any = valid();
      basis.basis[field] = "x";
      expect(parses(basis), `basis.${field}`).toBe(false);
    }
  });

  it("rejects a missing or malformed identity, locus, basis, pin or custodian", () => {
    for (const edit of [
      (v: any) => delete v.pc_id,
      (v: any) => delete v.stationary_locus,
      (v: any) => delete v.stationary_locus.locus,
      (v: any) => delete v.basis,
      (v: any) => delete v.basis.pinned_versions.binding,
      (v: any) => delete v.basis.pinned_versions.coupling,
      (v: any) => (v.basis.pinned_versions.pc = -1),
      (v: any) => (v.basis.pinned_versions.locus = 1.5),
      (v: any) => (v.basis.established_from = "ACTIVATION"),
      (v: any) => (v.basis.established_from = "EXISTING_ACTOR_COMPILATION"),
      (v: any) => delete v.custodian,
      (v: any) => (v.custodian.owner = "logistics"),
      (v: any) => (v.custodian.owner = "role_registry"),
      (v: any) => (v.custodian.facet = "logistics_state"),
      (v: any) => (v.custodian.basis = "OTHER"),
      (v: any) => (v.stationary_locus = [v.stationary_locus]),
      (v: any) => (v.pc_id = ""),
    ]) {
      const v: any = valid();
      edit(v);
      expect(parses(v)).toBe(false);
    }
  });

  it("the establishment target names the PC identity only", () => {
    expect(PcPhysicalLocusCustodyTargetSchema.safeParse({ pc_id: "pc-1" }).success).toBe(true);
    for (const extra of ["world_id", "locus_id", "destination", "route", "duration", "binding"])
      expect(
        PcPhysicalLocusCustodyTargetSchema.safeParse({ pc_id: "pc-1", [extra]: "x" }).success,
        extra,
      ).toBe(false);
    expect(PcPhysicalLocusCustodyTargetSchema.safeParse({}).success).toBe(false);
  });
});

describe("one slot per PC identity, in a key space of its own", () => {
  it("the key is derived from the PC identity alone and is disjoint from the actor-coupling, entity, transition and binding key spaces", () => {
    const key = worldPcLocusCustodyKey("pc-1");
    expect(key).toBe("world-state/pc/pc-1/locus-custody");
    expect(worldPcLocusCustodyKey("pc-2")).not.toBe(key);
    expect(new Set([key, worldActorCouplingKey("pc-1")]).size).toBe(2);
    expect(key).not.toBe(worldFallbackEntityKey("w1", "pc-1"));
    expect(key).not.toBe(worldEntityTransitionKey("w1", "pc-1"));
    const matching = ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key));
    expect(matching.map((k) => k.id)).toEqual(["world_pc_locus_custody"]);
    for (const other of [
      worldActorCouplingKey("pc-1"),
      worldFallbackEntityKey("w1", "pc-1"),
      worldEntityTransitionKey("w1", "pc-1"),
      "world-state/pc/pc-1/coupling",
      "world-state/pc/pc-1/locus-custody/extra",
    ])
      expect(resolveKey(other)?.kind.id, other).not.toBe("world_pc_locus_custody");
  });

  it("the kind is SEALED (create-only) under the existing World-State owner and fallback facet", () => {
    const kind = factKind("world_pc_locus_custody");
    expect([kind.owner, kind.facet, kind.lifecycle, kind.im, kind.rc]).toEqual([
      "world_state",
      "world_fallback_physical_entity",
      "SEALED",
      "IM-03",
      ["RC-02"],
    ]);
    expect(kind.valueSchema).toBe(PcPhysicalLocusCustodySchema);
  });
});
