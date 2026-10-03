// Unit evidence for the Existing-Actor World-State Coupling Anchor rules. Each is the single statement used by IM-11 admission
// and by load verification: deriveExistingActorCoupling (what the publication determines), existingActorCouplingViolation (what
// a coupling must be against committed facts), couplingActorStillNonPcViolation (what must still hold whatever the commit order),
// existingActorSourceViolation (the actor-own-state statement shared with the existing-actor compilation) and
// coupledActorFreshContractViolation (a coupled actor is not re-authored as a fresh PC). All are pure and by identity.
// Register lineage: IA-02/IA-03 (partial); RC-02; IM-03, IM-07. Sources: WG pin 2026-09-25T13:44:22.668Z; WS-006 pin
// 2026-09-25T00:18:36.828Z; IR pin 2026-09-25T00:17:26.287Z; PC-Control Handover Contract v1 (seam rule only).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  pcExistenceContractKey,
  populationLedgerKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type ExistingActorCoupling,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  coupledActorFreshContractViolation,
  couplingActorStillNonPcViolation,
  deriveExistingActorCoupling,
  existingActorCouplingViolation,
  existingActorSourceViolation,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  capabilityBasis,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
} from "@immortalis/testkit";
import { actorBasisPin, existingActorContract } from "../support/existing-actor.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;
const key = worldActorCouplingKey(A);

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
const facts = (...fs: OwnerFact[]) => new Map(fs.map((f) => [f.key, f]));
const lawful = () => facts(actorBasis(), world(), locus());

const target = { actor_id: A, world_id: W, locus_id: L, actor_state: [actorBasisPin(A, C)] };
const coupling = (over: Partial<ExistingActorCoupling> = {}): ExistingActorCoupling => ({
  ...deriveExistingActorCoupling(target, () => 1),
  ...over,
});

describe("deriveExistingActorCoupling: the publication determines the whole value, mechanically", () => {
  it("names the references from the identities, pins the committed versions and fixes the custodian", () => {
    const versions: Record<string, number> = {
      [worldProfileKey(W)]: 3,
      [worldLocusKey(W, L)]: 7,
    };
    const c = deriveExistingActorCoupling(target, (k) => versions[k] ?? 0);
    expect(c.coupling).toEqual({
      world: { fact_key: worldProfileKey(W), entity_id: W },
      locus: { fact_key: worldLocusKey(W, L), entity_id: L },
    });
    expect(c.pinned_versions).toEqual({ world: 3, locus: 7 });
    expect(c.custodian).toMatchObject({
      owner: "world_state",
      facet: "world_fallback_physical_entity",
    });
    expect(c.actor_id).toBe(A);
    expect(c.actor_state).toEqual(target.actor_state);
  });

  it("a missing world or locus is pinned at version 0, which no committed fact can equal", () => {
    expect(deriveExistingActorCoupling(target, () => 0).pinned_versions).toEqual({
      world: 0,
      locus: 0,
    });
  });

  it("copies the pins: mutating the result never reaches the caller's target", () => {
    const c = deriveExistingActorCoupling(target, () => 1);
    c.actor_state[0]!.version = 9;
    expect(target.actor_state[0]!.version).toBe(1);
  });
});

describe("existingActorCouplingViolation: what a coupling must be", () => {
  it("a coupling of an actor with its own committed state to an established locus of an established world holds", () => {
    expect(existingActorCouplingViolation(key, coupling(), lawful())).toBeNull();
  });

  it("is at the slot derived from the actor identity", () => {
    expect(
      existingActorCouplingViolation(worldActorCouplingKey(ACTOR_OTHER), coupling(), lawful()),
    ).toMatch(/slot derived from its actor identity/);
  });

  it("references must match their key identities", () => {
    const bad = coupling({
      coupling: {
        world: { fact_key: worldProfileKey("world-x"), entity_id: W },
        locus: { fact_key: worldLocusKey(W, L), entity_id: L },
      },
    });
    expect(existingActorCouplingViolation(key, bad, lawful())).toMatch(/key identities/);
  });

  it("the actor must be an existing NON-PC actor: a fresh contract, the bound PC and a Population aggregate are not", () => {
    const withFresh = facts(
      actorBasis(),
      world(),
      locus(),
      contractFact(fixtureContract({ pc_id: A })),
    );
    expect(existingActorCouplingViolation(key, coupling(), withFresh)).toMatch(
      /not an existing non-PC actor/,
    );
    const bound = facts(
      actorBasis(),
      world(),
      locus(),
      factOf(
        PLAYER_CHARACTER_BINDING_KEY,
        {
          binding_slot: "role.player_character",
          active_pc: { fact_key: pcExistenceContractKey(A), entity_id: A },
          coupling: {
            world: { fact_key: worldProfileKey(W), entity_id: W },
            locus: { fact_key: worldLocusKey(W, L), entity_id: L },
          },
          transition: {
            type: "ACTIVATION",
            basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
          },
          prior_binding: null,
          replacement_binding: null,
          intrinsic_authority_migration: [],
          writer: { role: "role.archivist", permission: "permission.canon.write" },
        },
        { owner: "role_registry", facet: "player_character_binding" },
      ),
    );
    expect(existingActorCouplingViolation(key, coupling(), bound)).toMatch(
      /under lawful player-character control/,
    );
    const ledger = facts(
      actorBasis(),
      world(),
      locus(),
      factOf(populationLedgerKey(A), {}, { owner: "population" }),
    );
    expect(existingActorCouplingViolation(key, coupling(), ledger)).toMatch(/Population ledger/);
  });

  it("an existing-actor compilation of the actor is NOT a PC: coupling stays lawful before and after it", () => {
    const compiled = facts(actorBasis(), world(), locus(), contractFact(existingActorContract(A)));
    expect(existingActorCouplingViolation(key, coupling(), compiled)).toBeNull();
    expect(couplingActorStillNonPcViolation(A, compiled)).toBeNull();
  });

  it("every source is the actor's own committed state at the pinned version; another actor's, another owner's or another version fails", () => {
    expect(
      existingActorCouplingViolation(
        key,
        coupling({ actor_state: [actorBasisPin(A, C, 2)] }),
        lawful(),
      ),
    ).toMatch(/exact committed version/);
    expect(
      existingActorCouplingViolation(
        key,
        coupling({ actor_state: [actorBasisPin(ACTOR_OTHER, C)] }),
        lawful(),
      ),
    ).toMatch(/own committed Named-Actor state/);
    expect(
      existingActorCouplingViolation(
        key,
        coupling({
          actor_state: [
            { owner: "world_state", fact_key: actorCapabilityBasisKey(A, C), version: 1 },
          ],
        }),
        lawful(),
      ),
    ).toMatch(/owned by the Named-Actor owner/);
    expect(existingActorCouplingViolation(key, coupling(), facts(world(), locus()))).toMatch(
      /owned by the Named-Actor owner/,
    );
  });

  it("the world and the locus must be committed at exactly the versions pinned, and the locus must belong to the world", () => {
    expect(existingActorCouplingViolation(key, coupling(), facts(actorBasis(), locus()))).toMatch(
      /committed/,
    );
    expect(existingActorCouplingViolation(key, coupling(), facts(actorBasis(), world()))).toMatch(
      /committed/,
    );
    expect(
      existingActorCouplingViolation(
        key,
        coupling({ pinned_versions: { world: 2, locus: 1 } }),
        lawful(),
      ),
    ).toMatch(/committed world and locus versions/);
    expect(
      existingActorCouplingViolation(
        key,
        coupling({ pinned_versions: { world: 1, locus: 0 } }),
        lawful(),
      ),
    ).toMatch(/committed world and locus versions/);
    const foreign = facts(
      actorBasis(),
      world(),
      locus({ world: { fact_key: worldProfileKey("world-x"), entity_id: "world-x" } }),
    );
    expect(existingActorCouplingViolation(key, coupling(), foreign)).toMatch(
      /does not belong to the world/,
    );
    const malformed = facts(actorBasis(), world(), factOf(worldLocusKey(W, L), { nonsense: true }));
    expect(existingActorCouplingViolation(key, coupling(), malformed)).toMatch(
      /does not belong to the world/,
    );
  });
});

describe("couplingActorStillNonPcViolation: whatever the commit order, the coupled identity is no PC but by compilation", () => {
  it("a fresh Existence Contract for the coupled identity is a rival", () => {
    expect(
      couplingActorStillNonPcViolation(A, facts(contractFact(fixtureContract({ pc_id: A })))),
    ).toMatch(/no longer an existing non-PC actor/);
    expect(couplingActorStillNonPcViolation(A, facts())).toBeNull();
    expect(
      couplingActorStillNonPcViolation(
        A,
        facts(contractFact(fixtureContract({ pc_id: ACTOR_OTHER }), ACTOR_OTHER)),
      ),
    ).toBeNull();
  });
});

describe("coupledActorFreshContractViolation: a coupled actor cannot be re-authored as a fresh PC", () => {
  const coupled = facts(
    factOf(key, {}, { owner: "world_state", facet: "world_fallback_physical_entity" }),
  );
  it("refuses a fresh contract for a coupled identity only", () => {
    expect(coupledActorFreshContractViolation(fixtureContract({ pc_id: A }), coupled)).toMatch(
      /already coupled/,
    );
    expect(
      coupledActorFreshContractViolation(fixtureContract({ pc_id: ACTOR_OTHER }), coupled),
    ).toBeNull();
    expect(coupledActorFreshContractViolation(fixtureContract({ pc_id: A }), facts())).toBeNull();
  });
  it("lets the explicit existing-actor compilation name it", () => {
    expect(coupledActorFreshContractViolation(existingActorContract(A), coupled)).toBeNull();
  });
});

describe("existingActorSourceViolation: shared with the compilation, so the two cannot drift", () => {
  it("is exactly the compilation's source statement", () => {
    expect(existingActorSourceViolation(A, [actorBasisPin(A, C)], lawful())).toBeNull();
    expect(existingActorSourceViolation(A, [actorBasisPin(ACTOR_OTHER, C)], lawful())).toMatch(
      /own committed/,
    );
    expect(existingActorSourceViolation(A, [], lawful())).toBeNull();
  });
});
