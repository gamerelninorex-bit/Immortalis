/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Contract evidence for the World-State corridor and the explicitly source-qualified Logistics pin. Every schema is strict: an unmodelled
// field is rejected, never carried (IA-02). That is also the structural half of the exclusions: there is no field in which a distance, a
// travel time, a speed, a capacity, a right of access, a hazard verdict, a route, a passability or feasibility claim, an actor's
// agreement or a delivery could be stored — the source prescribes none, and none is invented.
import { describe, expect, it } from "vitest";
import {
  CommitCorridorMovementInputSchema,
  CommitMovementInputSchema,
  EstablishCorridorInputSchema,
  LogisticsCommitmentSchema,
  WorldCorridorSchema,
  corridorOfInput,
  worldCorridorKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import { CANONICAL_OWNER_REGISTRY, factKind, resolveKey } from "@immortalis/engine";

const W = "world-1";
const input = {
  world_id: W,
  from_locus_id: "locus-a",
  to_locus_id: "locus-b",
  statement: "a path",
};
const corridor = corridorOfInput(input);
const t = (value: number) => ({ unit: "u", value });

describe("WorldCorridorSchema", () => {
  it("is exactly the world, the two endpoint references and the authored statement", () => {
    expect(corridor).toEqual({
      world: { fact_key: worldProfileKey(W), entity_id: W },
      from: { fact_key: worldLocusKey(W, "locus-a"), entity_id: "locus-a" },
      to: { fact_key: worldLocusKey(W, "locus-b"), entity_id: "locus-b" },
      statement: "a path",
    });
    expect(WorldCorridorSchema.safeParse(corridor).success).toBe(true);
    expect(Object.keys(corridor).sort()).toEqual(["from", "statement", "to", "world"]);
  });

  it.each([
    "distance",
    "duration",
    "travel_time",
    "speed",
    "rate",
    "throughput",
    "capacity",
    "passable",
    "access",
    "right_of_access",
    "hazard",
    "hazards",
    "route",
    "cost",
    "carrier",
    "usable",
    "feasible",
    "delivered",
    "outcome",
    "reverse",
    "bidirectional",
    "via",
    "agreed_by",
    "version",
    "owner",
  ])("has no place for %s", (field) => {
    expect(WorldCorridorSchema.safeParse({ ...corridor, [field]: 1 }).success).toBe(false);
  });

  it("refuses a corridor whose references are not the keys its identities derive, or whose endpoints are the same locus", () => {
    const base = structuredClone(corridor) as any;
    const cases: ((c: any) => void)[] = [
      (c) => (c.world.fact_key = "world/other/profile"),
      (c) => (c.from.fact_key = worldLocusKey("other", "locus-a")),
      (c) => (c.to.fact_key = worldLocusKey(W, "locus-zzz")),
      (c) => ((c.to.entity_id = c.from.entity_id), (c.to.fact_key = c.from.fact_key)),
      (c) => (c.statement = ""),
      (c) => (c.statement = " padded "),
    ];
    for (const mutate of cases) {
      const c = structuredClone(base);
      mutate(c);
      expect(WorldCorridorSchema.safeParse(c).success).toBe(false);
    }
  });

  it("the ordered pair is the key, so the reverse is a different key", () => {
    expect(worldCorridorKey(W, "locus-a", "locus-b")).toBe(`world/${W}/corridor/locus-a/locus-b`);
    expect(worldCorridorKey(W, "locus-a", "locus-b")).not.toBe(
      worldCorridorKey(W, "locus-b", "locus-a"),
    );
  });
});

describe("EstablishCorridorInputSchema", () => {
  it("accepts identities and a statement only", () => {
    expect(EstablishCorridorInputSchema.safeParse(input).success).toBe(true);
    for (const extra of ["duration", "reverse", "version", "world", "from", "to", "owner"])
      expect(EstablishCorridorInputSchema.safeParse({ ...input, [extra]: 1 }).success).toBe(false);
    for (const missing of Object.keys(input)) {
      const i = { ...input } as any;
      delete i[missing];
      expect(EstablishCorridorInputSchema.safeParse(i).success).toBe(false);
    }
    expect(EstablishCorridorInputSchema.safeParse({ ...input, from_locus_id: "a/b" }).success).toBe(
      false,
    );
  });
});

describe("the registered kind", () => {
  it("is World-State's own, in the existing locus facet, sealed, and owned by no new owner or facet", () => {
    const kind = factKind("world_corridor");
    expect(kind.owner).toBe("world_state");
    expect(kind.facet).toBe("world_locus");
    expect(kind.lifecycle).toBe("SEALED");
    // the existing owner and the existing facets only: nothing new was registered for World-State
    expect([...CANONICAL_OWNER_REGISTRY.get("world_state")!].sort()).toEqual(
      [
        "world_fallback_physical_entity",
        "world_locus",
        "world_profile",
        "world_scene_closure",
        "world_source_condition",
      ].sort(),
    );
    expect(resolveKey(worldCorridorKey(W, "locus-a", "locus-b"))).toMatchObject({
      kind: { id: "world_corridor" },
      ids: [W, "locus-a", "locus-b"],
    });
    // no other key space is shadowed by the new one
    expect(resolveKey(worldLocusKey(W, "corridor"))?.kind.id).toBe("world_locus");
    expect(resolveKey(`world/${W}/corridor/locus-a`)).toBeNull();
    expect(resolveKey(`world/${W}/corridor/a/b/c`)).toBeNull();
  });
});

describe("the Logistics commitment pin", () => {
  const base = {
    commitment_id: "commitment:m-1",
    request: { owner: "mover", fact_key: "mover/request/m-1", request_id: "m-1", version: 1 },
    moved: {
      fact_key: `world/${W}/entity/e-1`,
      entity_id: "e-1",
      version: 1,
      substantive_owner: {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
      },
    },
    origin: {
      world: { fact_key: worldProfileKey(W), entity_id: W },
      locus: { fact_key: worldLocusKey(W, "locus-a"), entity_id: "locus-a" },
    },
    destination: {
      world: { fact_key: worldProfileKey(W), entity_id: W },
      locus: { fact_key: worldLocusKey(W, "locus-b"), entity_id: "locus-b" },
    },
    service_basis: "NON_AGENTIVE_SINGLE_LEG_UNCONTENDED",
    committed_at: t(100),
    delivery: { boundary_id: "boundary-logistics-delivery-m-1", at: t(200) },
    release_condition: "AFTER_DESTINATION_OWNER_COMMIT",
    state: { status: "COMMITTED" },
  };
  const pin = {
    owner: "world_state",
    fact_key: worldCorridorKey(W, "locus-a", "locus-b"),
    version: 1,
  };

  it("the route-less foundation commitment is unchanged: no corridor field is required, defaulted or emitted", () => {
    const parsed = LogisticsCommitmentSchema.parse(base);
    expect("corridor" in parsed).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain("corridor");
  });
  it("the source-qualified commitment carries exactly the owner, key and version of the corridor read, never its body", () => {
    expect(LogisticsCommitmentSchema.parse({ ...base, corridor: pin }).corridor).toEqual(pin);
    const bad: any[] = [
      { ...pin, owner: "logistics" },
      { ...pin, version: 0 },
      { ...pin, from: "locus-a" },
      { ...pin, travel_time: 3 },
      { ...pin, statement: "a path" },
      { fact_key: pin.fact_key, version: 1 },
      null,
    ];
    for (const p of bad)
      expect(LogisticsCommitmentSchema.safeParse({ ...base, corridor: p }).success).toBe(false);
  });
  it("the source-qualified input names the request, the corridor and the DECLARED boundary — nothing else, and no default", () => {
    const ok = {
      request_key: "mover/request/m-1",
      corridor_key: pin.fact_key,
      delivery_at: t(200),
    };
    expect(CommitCorridorMovementInputSchema.safeParse(ok).success).toBe(true);
    for (const missing of Object.keys(ok)) {
      const i = { ...ok } as any;
      delete i[missing];
      expect(CommitCorridorMovementInputSchema.safeParse(i).success).toBe(false);
    }
    for (const extra of ["duration", "route", "feasible", "travel_time"])
      expect(CommitCorridorMovementInputSchema.safeParse({ ...ok, [extra]: 1 }).success).toBe(
        false,
      );
    // the foundation input is unchanged: it accepts no corridor
    expect(CommitMovementInputSchema.safeParse({ ...ok }).success).toBe(false);
    expect(
      CommitMovementInputSchema.safeParse({
        request_key: ok.request_key,
        delivery_at: ok.delivery_at,
      }).success,
    ).toBe(true);
  });
});
