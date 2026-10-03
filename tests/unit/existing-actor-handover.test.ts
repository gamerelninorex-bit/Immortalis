/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary fact values */
// Unit evidence for the Existing-Actor → PC handover rule. `existingActorHandoverViolation` is the single statement used by
// IM-11 admission and by load verification (against the facts as they stood before the binding), and
// `expectedHandoverMigration` the single statement of the exact references a handover carries. Both are pure and by identity.
// `actorBoundaryViolation` is shown to be the one cutover: open before the binding, closed after it, history untouched.
// Register lineage: IA-02/IA-03 (partial); RC-02, RC-13; IM-03, IM-07. Sources: IR pin 2026-09-25T00:17:26.287Z; I-002 pin
// 2026-09-25T00:15:54.536Z; WS-006 pin 2026-09-25T00:18:36.828Z; PC-Control Handover Contract v1 (seam rule only).
import { describe, expect, it } from "vitest";
import {
  EXISTING_ACTOR_HANDOVER,
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  pcExistenceContractKey,
  populationLedgerKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type OwnerFact,
  type PlayerCharacterBinding,
} from "@immortalis/contracts";
import {
  actorBoundaryViolation,
  deriveExistingActorCoupling,
  existingActorHandoverViolation,
  expectedHandoverMigration,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  capabilityBasis,
  fixtureContract,
  fixtureLocus,
  fixtureWorld,
} from "@immortalis/testkit";
import { actorBasisPin, existingActorContract } from "../support/existing-actor.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;
const couplingKey = worldActorCouplingKey(A);

const factOf = (k: string, value: unknown, over: Partial<OwnerFact> = {}): OwnerFact => ({
  key: k,
  owner: "named_actor",
  facet: "actor_profile",
  value: value as never,
  unit: null,
  basis: "b",
  secrecy: "s",
  version: 1,
  provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} as never },
  ...over,
});
const actorBasis = (actor = A) =>
  factOf(actorCapabilityBasisKey(actor, C), capabilityBasis(actor, C));
const world = () =>
  factOf(worldProfileKey(W), fixtureWorld(), { owner: "world_state", facet: "world_profile" });
const locus = (over = {}) =>
  factOf(worldLocusKey(W, L), fixtureLocus(over), { owner: "world_state", facet: "world_locus" });
const contractFact = (contract: unknown, actor = A) =>
  factOf(pcExistenceContractKey(actor), contract, {
    owner: "pc_existence",
    facet: "existence_contract",
  });
const couplingFact = (over: Record<string, unknown> = {}) =>
  factOf(
    couplingKey,
    {
      ...deriveExistingActorCoupling(
        { actor_id: A, world_id: W, locus_id: L, actor_state: [actorBasisPin(A, C)] },
        () => 1,
      ),
      ...over,
    },
    { owner: "world_state", facet: "world_fallback_physical_entity" },
  );
const facts = (...fs: OwnerFact[]) => new Map(fs.map((f) => [f.key, f]));
/** The committed facts a lawful handover consumes: actor state, world, locus, the compilation and the coupling. */
const lawful = (...extra: OwnerFact[]) =>
  facts(
    actorBasis(),
    world(),
    locus(),
    contractFact(existingActorContract(A)),
    couplingFact(),
    ...extra,
  );

const handover = (over: Partial<PlayerCharacterBinding> = {}): PlayerCharacterBinding => ({
  binding_slot: "role.player_character",
  active_pc: { fact_key: pcExistenceContractKey(A), entity_id: A },
  coupling: {
    world: { fact_key: worldProfileKey(W), entity_id: W },
    locus: { fact_key: worldLocusKey(W, L), entity_id: L },
  },
  transition: {
    type: EXISTING_ACTOR_HANDOVER,
    basis: { pinned_versions: { pc: 1, world: 1, locus: 1, coupling: 1 } },
  },
  prior_binding: null,
  replacement_binding: null,
  intrinsic_authority_migration: [
    { owner: "world_state", fact_key: couplingKey, version: 1 },
    actorBasisPin(A, C),
  ],
  writer: { role: "role.archivist", permission: "permission.canon.write" },
  ...over,
});

describe("expectedHandoverMigration: the exact references the handover carries, by identity", () => {
  it("is the coupling first, then the compilation's pinned actor state in order — references, never copies", () => {
    const contract = existingActorContract(A, [actorBasisPin(A, C), actorBasisPin(A, "cap-2")]);
    expect(expectedHandoverMigration(couplingFact(), contract)).toEqual([
      { owner: "world_state", fact_key: couplingKey, version: 1 },
      actorBasisPin(A, C),
      actorBasisPin(A, "cap-2"),
    ]);
    expect(JSON.stringify(expectedHandoverMigration(couplingFact(), contract))).not.toContain(
      "marker",
    );
  });

  it("carries the coupling's committed version, not a constant", () => {
    expect(expectedHandoverMigration(couplingFact(), existingActorContract(A))[0]!.version).toBe(1);
    const moved = { ...couplingFact(), version: 4 };
    expect(expectedHandoverMigration(moved, existingActorContract(A))[0]!.version).toBe(4);
  });
});

describe("existingActorHandoverViolation: what the handover must be, from committed facts", () => {
  it("accepts the lawful handover", () => {
    expect(existingActorHandoverViolation(handover(), lawful())).toBeNull();
  });

  it("judges only a handover: the first ACTIVATION is no concern of this rule", () => {
    const activation = {
      ...handover(),
      transition: { type: "ACTIVATION" },
    } as unknown as PlayerCharacterBinding;
    expect(existingActorHandoverViolation(activation, lawful())).toBeNull();
  });

  it("a missing, malformed or fresh contract is no handover subject", () => {
    const without = new Map(lawful());
    without.delete(pcExistenceContractKey(A));
    expect(existingActorHandoverViolation(handover(), without)).toMatch(
      /not a released Existence Contract/,
    );
    expect(existingActorHandoverViolation(handover(), lawful(contractFact({ pc_id: A })))).toMatch(
      /not a released Existence Contract/,
    );
    expect(
      existingActorHandoverViolation(
        handover(),
        lawful(contractFact(fixtureContract({ pc_id: A }))),
      ),
    ).toMatch(/no existing-actor compilation/);
  });

  it("a compilation that no longer holds — stale or foreign pinned actor state — is refused", () => {
    const stale = lawful(contractFact(existingActorContract(A, [actorBasisPin(A, C, 2)])));
    expect(existingActorHandoverViolation(handover(), stale)).toMatch(/exact committed version/);
    const foreign = lawful(contractFact(existingActorContract(A, [actorBasisPin(ACTOR_OTHER, C)])));
    expect(existingActorHandoverViolation(handover(), foreign)).toMatch(/own committed/);
    const unowned = new Map(lawful());
    unowned.delete(actorCapabilityBasisKey(A, C));
    expect(existingActorHandoverViolation(handover(), unowned)).not.toBeNull();
  });

  it("no committed coupling: the handover creates and infers no placement", () => {
    const without = new Map(lawful());
    without.delete(couplingKey);
    expect(existingActorHandoverViolation(handover(), without)).toMatch(
      /coupling is not committed/,
    );
    expect(
      existingActorHandoverViolation(handover(), lawful(factOf(couplingKey, { nonsense: 1 }))),
    ).toMatch(/coupling is not committed/);
  });

  it("a coupling that is not that actor's, or no longer holds, is refused", () => {
    expect(
      existingActorHandoverViolation(handover(), lawful(couplingFact({ actor_id: ACTOR_OTHER }))),
    ).toMatch(/does not hold/);
    expect(
      existingActorHandoverViolation(
        handover(),
        lawful(couplingFact({ pinned_versions: { world: 2, locus: 1 } })),
      ),
    ).toMatch(/does not hold/);
    // the actor became a Population aggregate before the cutover
    const aggregate = lawful(factOf(populationLedgerKey(A), {}, { owner: "population" }));
    expect(existingActorHandoverViolation(handover(), aggregate)).toMatch(/does not hold/);
  });

  it("a world or locus that is not exactly the coupling's — a rival placement — is refused, whatever else is committed", () => {
    for (const moved of [
      { locus: { fact_key: worldLocusKey(W, "locus-2"), entity_id: "locus-2" } },
      { world: { fact_key: worldProfileKey("world-2"), entity_id: "world-2" } },
    ]) {
      const b = handover({ coupling: { ...handover().coupling, ...moved } });
      expect(existingActorHandoverViolation(b, lawful())).toMatch(/rival placement/);
    }
  });

  it("every pinned version must be the committed version of the contract, world, locus and coupling", () => {
    for (const field of ["pc", "world", "locus", "coupling"] as const) {
      for (const bad of [0, 2]) {
        const b = handover();
        const t: any = b.transition;
        t.basis = { pinned_versions: { ...t.basis.pinned_versions, [field]: bad } };
        expect(existingActorHandoverViolation(b, lawful()), `${field}=${bad}`).toMatch(
          /not established against the committed/,
        );
      }
    }
  });

  it("the migration data is exactly the references to the coupling and the compilation's pinned state", () => {
    const base = handover();
    const variants: ((m: any[]) => any[])[] = [
      (m) => m.slice(1),
      (m) => m.slice(0, 1),
      (m) => [...m].reverse(),
      (m) => [{ ...m[0], version: 2 }, m[1]],
      (m) => [m[0], { ...m[1], version: 2 }],
      (m) => [m[0], { ...m[1], owner: "world_state" }],
      (m) => [...m, { owner: "world_state", fact_key: worldProfileKey(W), version: 1 }],
    ];
    for (const v of variants) {
      const b = {
        ...base,
        intrinsic_authority_migration: v(base.intrinsic_authority_migration as any[]),
      };
      expect(existingActorHandoverViolation(b as never, lawful())).toMatch(/migration data/);
    }
  });
});

describe("actorBoundaryViolation is the one cutover: open before the binding, closed after it, history untouched", () => {
  const bindingFact = (b: PlayerCharacterBinding) =>
    factOf(PLAYER_CHARACTER_BINDING_KEY, b, {
      owner: "role_registry",
      facet: "player_character_binding",
    });

  it("before the binding the compiled, coupled actor is a lawful Named-Actor subject", () => {
    expect(actorBoundaryViolation(lawful(), A)).toBeNull();
  });

  it("after the handover binding the identity is under lawful player control; other identities are unaffected", () => {
    const after = lawful(bindingFact(handover()));
    expect(actorBoundaryViolation(after, A)).toMatch(/lawful player-character control/);
    expect(actorBoundaryViolation(after, ACTOR_OTHER)).toBeNull();
    // the facts committed before are still there, untouched: the boundary reads, it never rewrites
    expect(after.get(actorCapabilityBasisKey(A, C))).toEqual(actorBasis());
    expect(after.get(couplingKey)).toEqual(couplingFact());
  });

  it("a binding that does not parse as a binding closes nothing; a handover judged BEFORE its own commit sees the actor open", () => {
    expect(actorBoundaryViolation(lawful(bindingFact({ nonsense: 1 } as never)), A)).toBeNull();
    expect(existingActorHandoverViolation(handover(), lawful())).toBeNull();
    // judged against the facts INCLUDING the binding, the same actor is closed: why load verification uses the facts before it
    expect(actorBoundaryViolation(lawful(bindingFact(handover())), A)).not.toBeNull();
  });
});
