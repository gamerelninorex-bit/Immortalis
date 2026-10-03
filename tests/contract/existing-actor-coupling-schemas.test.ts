/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary malformed values */
// Existing-Actor World-State Coupling Anchor Foundation — contract evidence for the one authoritative current actor↔locus/world
// coupling fact. Sources (exact pins live in spec/f027/spec-lock.json): WG at its lock pin 2026-09-25T13:44:22.668Z (Ownership
// Guards — F-016 Ratified Fallback Objective Physical-Entity Custody), WS-006 / F-014A pin 2026-09-25T00:18:36.828Z (v3.3 §6),
// IR pin 2026-09-25T00:17:26.287Z (§5 item 3, §17), I-002 pin 2026-09-25T00:15:54.536Z (§4.3); RC-02 (foreign facts are
// referenced, never copied). Every schema is strict: this is also the structural half of the exclusions.
import { describe, expect, it } from "vitest";
import {
  ExistingActorCouplingSchema,
  ExistingActorCouplingTargetSchema,
  FALLBACK_BASIS,
  FACET_WORLD_FALLBACK_ENTITY,
  OWNER_WORLD_STATE,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import { ALL_FACT_KINDS, factKind, resolveKey } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  fixtureInsertionFact,
} from "@immortalis/testkit";
import { actorBasisPin } from "../support/existing-actor.ts";

const valid = (): any => ({
  actor_id: ACTOR_SMITH,
  actor_state: [actorBasisPin()],
  coupling: {
    world: { fact_key: worldProfileKey(FIXTURE_WORLD_ID), entity_id: FIXTURE_WORLD_ID },
    locus: {
      fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
      entity_id: FIXTURE_LOCUS_ID,
    },
  },
  pinned_versions: { world: 1, locus: 1 },
  custodian: {
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_FALLBACK_ENTITY,
    basis: FALLBACK_BASIS,
  },
});
const parses = (v: unknown) => ExistingActorCouplingSchema.safeParse(v).success;

describe("the coupling is one strict, referencing fact", () => {
  it("the representative coupling parses and round-trips unchanged", () => {
    expect(ExistingActorCouplingSchema.parse(valid())).toEqual(valid());
  });

  it("every field is required: the actor, its pinned state, the world/locus references, their pinned versions and the custodian", () => {
    for (const field of Object.keys(valid())) {
      const v = valid();
      delete v[field];
      expect(parses(v), field).toBe(false);
    }
  });

  it("unknown fields are rejected at every level: nothing can be carried beside the coupling", () => {
    expect(parses({ ...valid(), extra: 1 })).toBe(false);
    expect(parses({ ...valid(), coupling: { ...valid().coupling, extra: 1 } })).toBe(false);
    expect(
      parses({
        ...valid(),
        coupling: { ...valid().coupling, world: { ...valid().coupling.world, extra: 1 } },
      }),
    ).toBe(false);
    expect(parses({ ...valid(), pinned_versions: { ...valid().pinned_versions, extra: 1 } })).toBe(
      false,
    );
    expect(parses({ ...valid(), custodian: { ...valid().custodian, extra: 1 } })).toBe(false);
    expect(parses({ ...valid(), actor_state: [{ ...actorBasisPin(), value: {} }] })).toBe(false);
  });

  it("no PC, binding, insertion basis, bridge, player-authored statement, capability, mode, movement or second locus can be stated", () => {
    const smuggled: Record<string, unknown> = {
      active_pc: { fact_key: "pc/p/existence-contract", entity_id: "p" },
      pc_id: "p",
      binding_slot: "role.player_character",
      transition: { type: "ACTIVATION" },
      insertion: fixtureInsertionFact(),
      basis: fixtureInsertionFact(),
      bridge: "NATIVE_ALREADY_THERE",
      established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
      authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      statement: "SYNTHETIC FIXTURE: here.",
      capability: "swordsmanship",
      capabilities: [],
      binding_mode: "DEFERRED",
      existing_actor_compilation: { classification: "EXISTING_ACTOR_COMPILATION" },
      prior_binding: null,
      replacement_binding: null,
      intrinsic_authority_migration: [],
      loci: [valid().coupling.locus],
      previous_locus: valid().coupling.locus,
      destination: valid().coupling.locus,
      movement: "x",
      holder: "x",
    };
    for (const [name, value] of Object.entries(smuggled))
      expect(parses({ ...valid(), [name]: value }), name).toBe(false);
  });

  it("exactly one locus: the coupling names one world reference and one locus reference, never several", () => {
    const v = valid();
    expect(parses({ ...v, coupling: { world: v.coupling.world, locus: [v.coupling.locus] } })).toBe(
      false,
    );
    expect(parses({ ...v, coupling: { world: [v.coupling.world], locus: v.coupling.locus } })).toBe(
      false,
    );
    expect(parses({ ...v, coupling: { world: v.coupling.world } })).toBe(false);
    expect(parses({ ...v, coupling: { locus: v.coupling.locus } })).toBe(false);
  });

  it("at least one pinned actor-state source is required, each exactly once at a committed version", () => {
    expect(parses({ ...valid(), actor_state: [] })).toBe(false);
    expect(parses({ ...valid(), actor_state: [actorBasisPin(), actorBasisPin()] })).toBe(false);
    expect(parses({ ...valid(), actor_state: [{ ...actorBasisPin(), version: 0 }] })).toBe(false);
    expect(parses({ ...valid(), actor_state: [{ ...actorBasisPin(), version: 1.5 }] })).toBe(false);
    expect(parses({ ...valid(), actor_state: [{ owner: "named_actor", fact_key: "k" }] })).toBe(
      false,
    );
  });

  it("the custodian is the World-State fallback custodian, and only it", () => {
    for (const custodian of [
      { ...valid().custodian, owner: "production" },
      { ...valid().custodian, owner: "named_actor" },
      { ...valid().custodian, owner: "pc_existence" },
      { ...valid().custodian, facet: "world_locus" },
      { ...valid().custodian, basis: "x" },
      null,
    ])
      expect(parses({ ...valid(), custodian }), JSON.stringify(custodian)).toBe(false);
  });

  it("pinned versions are integers (0 only so a missing prerequisite surfaces as such at admission)", () => {
    for (const bad of [-1, 1.5, "1", null])
      expect(parses({ ...valid(), pinned_versions: { world: bad, locus: 1 } }), String(bad)).toBe(
        false,
      );
  });

  it("identifiers are embedded in keys, so they cannot contain the key separator", () => {
    for (const actor_id of ["", "a/b", " a", "a b"])
      expect(parses({ ...valid(), actor_id }), actor_id).toBe(false);
  });
});

describe("the publication target names identities and pins only", () => {
  const target = () => ({
    actor_id: ACTOR_SMITH,
    world_id: FIXTURE_WORLD_ID,
    locus_id: FIXTURE_LOCUS_ID,
    actor_state: [actorBasisPin()],
  });
  it("accepts exactly identities and actor-state pins", () => {
    expect(ExistingActorCouplingTargetSchema.safeParse(target()).success).toBe(true);
    for (const extra of ["insertion", "pinned_versions", "custodian", "pc_id", "statement"])
      expect(
        ExistingActorCouplingTargetSchema.safeParse({ ...target(), [extra]: 1 }).success,
        extra,
      ).toBe(false);
    expect(
      ExistingActorCouplingTargetSchema.safeParse({ ...target(), actor_state: [] }).success,
    ).toBe(false);
  });
});

describe("the key space is one slot per actor identity, disjoint from every other fact kind", () => {
  it("is derived from the actor identity alone, across every world", () => {
    expect(worldActorCouplingKey(ACTOR_SMITH)).toBe(`world-state/actor/${ACTOR_SMITH}/coupling`);
    expect(worldActorCouplingKey(ACTOR_SMITH)).not.toBe(worldActorCouplingKey(ACTOR_OTHER));
    expect(worldActorCouplingKey(ACTOR_SMITH)).not.toContain(FIXTURE_WORLD_ID);
  });

  it("resolves to exactly the one registered World-State kind, and no other kind's key space matches it", () => {
    const key = worldActorCouplingKey(ACTOR_SMITH);
    expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)).map((k) => k.id)).toEqual([
      "world_actor_coupling",
    ]);
    const resolved = resolveKey(key)!;
    expect(resolved.ids).toEqual([ACTOR_SMITH]);
    expect(resolved.kind).toMatchObject({
      owner: "world_state",
      facet: "world_fallback_physical_entity",
      lifecycle: "SEALED",
      im: "IM-03",
    });
    expect(factKind("world_actor_coupling").valueSchema).toBe(ExistingActorCouplingSchema);
  });

  it("no sibling key (a second slot, a per-world slot, an entity or transition key) is a coupling key", () => {
    for (const key of [
      `world-state/actor/${ACTOR_SMITH}/coupling-2`,
      `world-state/actor/${ACTOR_SMITH}/coupling/x`,
      `world-state/actor/${ACTOR_SMITH}`,
      `world/${FIXTURE_WORLD_ID}/actor/${ACTOR_SMITH}/coupling`,
      `world/${FIXTURE_WORLD_ID}/entity/${ACTOR_SMITH}`,
      `world/${FIXTURE_WORLD_ID}/entity/${ACTOR_SMITH}/transition`,
      `actor/${ACTOR_SMITH}/coupling`,
      `pc/${ACTOR_SMITH}/coupling`,
    ])
      expect(resolveKey(key)?.kind.id ?? null, key).not.toBe("world_actor_coupling");
  });
});
