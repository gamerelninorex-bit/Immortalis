/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary fact values */
// Unit evidence for the existing-actor capability carry-forward rule. `pcCarryForwardViolation` is the single statement of
// what an EXISTING_ACTOR_CARRY_FORWARD establishment must be (used by IM-11 admission at the receive AND at the close, and by
// load verification); `deriveCarryForwardBasis` the single statement of the mechanical basis the owner path builds;
// `pcCapabilityBoundaryViolation` the one-owner boundary that admits the Named-Actor predecessor only for a carry-forward.
// All are pure functions of committed facts, by identity. Nothing here resolves, grades or draws.
// Register lineage: IA-02/IA-03 (partial); RC-02, RC-13; IM-03, IM-07, IM-11. Sources: WS-016 pin 2026-09-24T17:38:59.210Z;
// WS-006 pin 2026-09-25T00:18:36.828Z; PC-Control Handover Contract v1 (seam rule only).
import { describe, expect, it } from "vitest";
import {
  EXISTING_ACTOR_HANDOVER,
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  pcExistenceContractKey,
  populationLedgerKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type ComparativeMarker,
  type OwnerFact,
  type PcCapabilityBasis,
  type PlayerCharacterBinding,
} from "@immortalis/contracts";
import {
  deriveCarryForwardBasis,
  pcBasisIsCarryForward,
  pcBasisPrerequisites,
  pcCapabilityBoundaryViolation,
  pcCapabilityEstablishmentViolation,
  pcCarryForwardViolation,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureInsertionFact,
  pcCapabilityBasis,
} from "@immortalis/testkit";
import { existingActorContract } from "../support/existing-actor.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;

const factOf = (k: string, value: unknown, over: Partial<OwnerFact> = {}): OwnerFact => ({
  key: k,
  owner: "named_actor",
  facet: "actor_profile",
  value: value as never,
  unit: null,
  basis: "b",
  secrecy: "s",
  version: 1,
  provenance: { group_id: `g-${k}`, intent_id: "i", cause: "c", rule: {} as never },
  ...over,
});
const actorCapability = (
  marker: unknown = "C",
  actor = A,
  cap = C,
  over: Partial<OwnerFact> = {},
) =>
  factOf(
    actorCapabilityKey(actor, cap),
    {
      actor_id: actor,
      capability_id: cap,
      marker,
      basis: { fact_key: actorCapabilityBasisKey(actor, cap), version: 1 },
      close: {
        name: "actor-profile-capability-close",
        stage: actorCapabilityStage(actor, cap),
      },
    },
    over,
  );
const contractFact = (contract: unknown = existingActorContract(A), actor = A) =>
  factOf(pcExistenceContractKey(actor), contract, {
    owner: "pc_existence",
    facet: "existence_contract",
  });
const handover = (over: Record<string, unknown> = {}): any => ({
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
    { owner: "world_state", fact_key: worldActorCouplingKey(A), version: 1 },
  ],
  writer: { role: "role.archivist", permission: "permission.canon.write" },
  ...over,
});
const bindingFact = (value: PlayerCharacterBinding | unknown = handover(), over = {}) =>
  factOf(PLAYER_CHARACTER_BINDING_KEY, value, {
    owner: "role_registry",
    facet: "player_character_binding",
    ...over,
  });
const facts = (...fs: OwnerFact[]) => new Map(fs.map((f) => [f.key, f]));
const lawful = (marker: unknown = "C") =>
  facts(actorCapability(marker), contractFact(), bindingFact());

const carried = (over: Partial<PcCapabilityBasis> = {}): PcCapabilityBasis => ({
  pc_id: A,
  capability_id: C,
  marker: "C",
  establishment: {
    method: "EXISTING_ACTOR_CARRY_FORWARD",
    handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 1 },
    source: { fact_key: actorCapabilityKey(A, C), version: 1 },
  },
  ...over,
});
const violation = (basis: PcCapabilityBasis, f: ReadonlyMap<string, OwnerFact>) =>
  pcCapabilityEstablishmentViolation(basis, f);

describe("pcCarryForwardViolation: the carry-forward is judged on identity, ownership, provenance and exactness", () => {
  it("the lawful carry-forward holds, for every marker form, including the explicit null", () => {
    const markers: (ComparativeMarker | null)[] = [
      "C",
      "B",
      "A",
      "S",
      { ex: "SYNTHETIC FIXTURE: a descriptor" },
      null,
    ];
    for (const marker of markers) {
      expect(violation(carried({ marker }), lawful(marker)), JSON.stringify(marker)).toBeNull();
      // the establishment dispatch is exactly the one carry-forward statement
      expect(
        pcCarryForwardViolation(
          carried({ marker }),
          carried({ marker }).establishment as any,
          lawful(marker),
        ),
      ).toBeNull();
      expect(pcBasisIsCarryForward(carried({ marker }))).toBe(true);
    }
    expect(pcBasisIsCarryForward(pcCapabilityBasis())).toBe(false);
  });

  it("the handover binding is required, owned by the Role Registry and the exact version pinned", () => {
    expect(violation(carried(), facts(actorCapability(), contractFact()))).toMatch(
      /handover is not committed/,
    );
    expect(
      violation(
        carried(),
        facts(actorCapability(), contractFact(), bindingFact(handover(), { owner: "named_actor" })),
      ),
    ).toMatch(/not committed/);
    expect(
      violation(
        carried(),
        facts(actorCapability(), contractFact(), bindingFact(handover(), { version: 2 })),
      ),
    ).toMatch(/exact version/);
  });

  it("an ordinary ACTIVATION, another identity's binding or a malformed binding is no cutover basis", () => {
    const activation = handover({
      intrinsic_authority_migration: [],
      transition: {
        type: "ACTIVATION",
        basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
      },
    });
    const messageOf = (binding: unknown) =>
      violation(carried(), facts(actorCapability(), contractFact(), bindingFact(binding)));
    expect(messageOf(activation)).toMatch(/not the EXISTING_ACTOR_HANDOVER of this identity/);
    expect(
      messageOf(
        handover({
          active_pc: { fact_key: pcExistenceContractKey(ACTOR_OTHER), entity_id: ACTOR_OTHER },
        }),
      ),
    ).toMatch(/not the EXISTING_ACTOR_HANDOVER of this identity/);
    expect(messageOf({ not: "a binding" })).toMatch(/handover is not committed/);
  });

  it("the handover consumed this identity's released existing-actor compilation at the version committed now", () => {
    const f = (c: OwnerFact) => facts(actorCapability(), c, bindingFact());
    expect(violation(carried(), f(contractFact(fixtureContract({ pc_id: A }))))).toMatch(
      /existing-actor compilation/,
    );
    expect(violation(carried(), f(contractFact({ not: "a contract" })))).toMatch(
      /existing-actor compilation/,
    );
    expect(violation(carried(), f(contractFact(existingActorContract(A), A) as any))).toBeNull();
    expect(violation(carried(), f({ ...contractFact(), version: 2 } as OwnerFact))).toMatch(
      /consumed the Existence Contract/,
    );
    expect(
      violation(carried(), f({ ...contractFact(), owner: "named_actor" } as OwnerFact)),
    ).toMatch(/existing-actor compilation/);
  });

  it("the source is this identity's own committed Named-Actor capability: a basis, another capability, another identity or another owner is none", () => {
    const base = (src: OwnerFact) => facts(src, contractFact(), bindingFact());
    // a mere basis
    const basisKey = actorCapabilityBasisKey(A, C);
    const basisOnly = carried({
      establishment: {
        ...(carried().establishment as any),
        source: { fact_key: basisKey, version: 1 },
      },
    });
    expect(violation(basisOnly, base(factOf(basisKey, { marker: "C" })))).toMatch(
      /own Named-Actor capability for this capability/,
    );
    // absent
    expect(violation(carried(), facts(contractFact(), bindingFact()))).toMatch(/not committed/);
    // owned by the PC owner or the wrong facet
    expect(
      violation(carried(), base(actorCapability("C", A, C, { owner: "pc_existence" }))),
    ).toMatch(/not committed/);
    expect(violation(carried(), base(actorCapability("C", A, C, { facet: "x" })))).toMatch(
      /not committed/,
    );
    // another identity / capability fact stored under this key
    expect(
      violation(
        carried(),
        base(actorCapability("C", ACTOR_OTHER, C, { key: actorCapabilityKey(A, C) })),
      ),
    ).toMatch(/not a Named-Actor capability of this identity/);
    expect(
      violation(
        carried(),
        base(actorCapability("C", A, CAP_SWORDSMANSHIP, { key: actorCapabilityKey(A, C) })),
      ),
    ).toMatch(/not a Named-Actor capability of this identity/);
    // a source pinned to another capability's key is refused whatever it holds
    const other = carried({
      establishment: {
        ...(carried().establishment as any),
        source: { fact_key: actorCapabilityKey(A, CAP_SWORDSMANSHIP), version: 1 },
      },
    });
    expect(
      violation(
        other,
        facts(actorCapability("C", A, CAP_SWORDSMANSHIP), contractFact(), bindingFact()),
      ),
    ).toMatch(/own Named-Actor capability for this capability/);
    // a stale pin
    expect(violation(carried(), base(actorCapability("C", A, C, { version: 2 })))).toMatch(
      /exact version/,
    );
  });

  it("the carried marker is exactly the source's: any other grade, EX descriptor or null is refused", () => {
    expect(violation(carried({ marker: "B" }), lawful("C"))).toMatch(/exactly the source/);
    expect(violation(carried({ marker: null }), lawful("C"))).toMatch(/exactly the source/);
    expect(violation(carried({ marker: "C" }), lawful(null))).toMatch(/exactly the source/);
    expect(violation(carried({ marker: { ex: "a" } }), lawful({ ex: "b" }))).toMatch(
      /exactly the source/,
    );
    expect(violation(carried({ marker: { ex: "a" } }), lawful({ ex: "a" }))).toBeNull();
  });

  it("the fresh-PC rule is untouched: ACCEPTED_GENERATION_HISTORY still refuses a compilation, and still accepts a fresh contract at its exact version", () => {
    const fresh = fixtureContract({ pc_id: A });
    const agh = pcCapabilityBasis(A, C, {
      establishment: {
        method: "ACCEPTED_GENERATION_HISTORY",
        contract: { fact_key: pcExistenceContractKey(A), version: 1 },
        claims: [{ section: "identity_agency", index: 0 }],
      },
    });
    expect(pcCapabilityEstablishmentViolation(agh, facts(contractFact(fresh)))).toBeNull();
    expect(pcCapabilityEstablishmentViolation(agh, facts(contractFact()))).toMatch(
      /compiles an already-existing actor/,
    );
  });
});

describe("deriveCarryForwardBasis: the one mechanical statement of the basis, with nothing resolved", () => {
  it("transcribes the source's marker unchanged and cites the exact handover and source versions", () => {
    for (const marker of ["C", "S", { ex: "SYNTHETIC FIXTURE: a descriptor" }, null]) {
      const f = new Map([...lawful(marker)].map(([k, v]) => [k, v]));
      f.set(PLAYER_CHARACTER_BINDING_KEY, bindingFact(handover(), { version: 3 }));
      const r = deriveCarryForwardBasis(A, C, f);
      expect(r.ok && r.value).toEqual({
        pc_id: A,
        capability_id: C,
        marker,
        establishment: {
          method: "EXISTING_ACTOR_CARRY_FORWARD",
          handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 3 },
          source: { fact_key: actorCapabilityKey(A, C), version: 1 },
        },
      });
    }
  });

  it("fails closed with no handover, no authoritative capability (a basis alone is none) or a source that is not a Named-Actor capability", () => {
    const code = (f: ReadonlyMap<string, OwnerFact>) => {
      const r = deriveCarryForwardBasis(A, C, f);
      return r.ok ? "OK" : r.error.code;
    };
    expect(code(facts(actorCapability()))).toBe("PREREQUISITE_MISSING");
    expect(code(facts(bindingFact()))).toBe("PREREQUISITE_MISSING");
    expect(code(facts(bindingFact(), factOf(actorCapabilityBasisKey(A, C), { marker: "C" })))).toBe(
      "PREREQUISITE_MISSING",
    );
    expect(code(facts(bindingFact(), actorCapability("C", A, C, { owner: "pc_existence" })))).toBe(
      "REFERENCE_INVALID",
    );
    expect(code(facts(bindingFact(), actorCapability({ nope: 1 })))).toBe("REFERENCE_INVALID");
  });

  it("is pure: the same facts give the same basis, and the committed facts are not touched", () => {
    const f = lawful("A");
    const before = structuredClone([...f]);
    const one = deriveCarryForwardBasis(A, C, f);
    const two = deriveCarryForwardBasis(A, C, f);
    expect(one).toEqual(two);
    expect([...f]).toEqual(before);
  });
});

describe("the prerequisites and the one-owner boundary", () => {
  it("a carry-forward reads and depends on the contract, the handover binding and the source; a fresh PC only its contract", () => {
    expect(pcBasisPrerequisites(carried()).map((n) => n.key)).toEqual([
      pcExistenceContractKey(A),
      PLAYER_CHARACTER_BINDING_KEY,
      actorCapabilityKey(A, C),
    ]);
    expect(pcBasisPrerequisites(pcCapabilityBasis(A, C)).map((n) => n.key)).toEqual([
      pcExistenceContractKey(A),
    ]);
  });

  it("the Named-Actor predecessor is a rival owner for a fresh basis and cold provenance only for a carry-forward; a Population ledger is never given a record", () => {
    const held = { has: (k: string) => k === actorCapabilityKey(A, C) };
    const heldBasis = { has: (k: string) => k === actorCapabilityBasisKey(A, C) };
    expect(pcCapabilityBoundaryViolation(held, A, C)).toMatch(
      /already held by the Named-Actor owner/,
    );
    expect(pcCapabilityBoundaryViolation(heldBasis, A, C)).toMatch(
      /already held by the Named-Actor owner/,
    );
    expect(pcCapabilityBoundaryViolation(held, A, C, false)).not.toBeNull();
    expect(pcCapabilityBoundaryViolation(held, A, C, true)).toBeNull();
    expect(pcCapabilityBoundaryViolation(heldBasis, A, C, true)).toBeNull();
    const ledger = { has: (k: string) => k === populationLedgerKey(A) };
    expect(pcCapabilityBoundaryViolation(ledger, A, C, true)).toMatch(/Population ledger/);
    expect(pcCapabilityBoundaryViolation({ has: () => false }, A, C, true)).toBeNull();
  });
});
