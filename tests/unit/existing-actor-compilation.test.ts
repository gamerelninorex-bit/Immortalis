// Unit evidence for the existing-actor I-002 compilation rules (twenty-ninth slice). Each rule is the single statement used
// by IM-11 admission and by load verification: actorBoundaryViolation (the pre-binding exception), existingActorCompilation-
// Violation (what a compilation must be), existingActorBindingViolation / couplingBasisViolation (ordinary activation
// refuses it) and pcCapabilityEstablishmentViolation (ACCEPTED_GENERATION_HISTORY refuses it). All are pure and by identity.
// Register lineage: IA-02/IA-03 (partial); RC-02, RC-13; IM-03, IM-07. Sources: I-002 pin 2026-09-25T00:15:54.536Z;
// PC-Control Handover Contract v1 (W3-CP3 Blue Repair Overlay).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcExistenceContractKey,
  populationLedgerKey,
  worldProfileKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  actorBoundaryViolation,
  couplingBasisViolation,
  existingActorBindingViolation,
  existingActorCompilationViolation,
  pcCapabilityEstablishmentViolation,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SAILING,
  CAP_SWORDSMANSHIP,
  capabilityBasis,
  fixtureContract,
  pcCapabilityBasis,
} from "@immortalis/testkit";
import {
  actorBasisPin,
  actorCapabilityPin,
  existingActorContract,
} from "../support/existing-actor.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const factOf = (key: string, value: unknown, over: Partial<OwnerFact> = {}): OwnerFact => ({
  key,
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
const actorBasis = (actor = A, cap = C) =>
  factOf(actorCapabilityBasisKey(actor, cap), capabilityBasis(actor, cap));
const contractFact = (contract: unknown, actor = A) =>
  factOf(pcExistenceContractKey(actor), contract, {
    owner: "pc_existence",
    facet: "existence_contract",
  });
const facts = (...fs: OwnerFact[]) => new Map(fs.map((f) => [f.key, f]));

describe("actorBoundaryViolation: only an explicit existing-actor compilation keeps the actor under non-PC ownership", () => {
  it("a freshly generated PC's contract still closes the Named-Actor owner (unchanged)", () => {
    expect(actorBoundaryViolation(facts(contractFact(fixtureContract({ pc_id: A }))), A)).toMatch(
      /Player Character/,
    );
  });

  it("an explicit existing-actor compilation alone does not: the prior non-PC owner remains writable until the binding commit", () => {
    expect(actorBoundaryViolation(facts(contractFact(existingActorContract(A))), A)).toBeNull();
  });

  it("the exception is exactly the identified identity: another actor's compilation grants nothing", () => {
    expect(
      actorBoundaryViolation(
        facts(contractFact(existingActorContract(ACTOR_OTHER), ACTOR_OTHER)),
        A,
      ),
    ).toBeNull();
    // and a compilation of A grants nothing to a fresh contract of B
    expect(
      actorBoundaryViolation(
        facts(
          contractFact(existingActorContract(A)),
          contractFact(fixtureContract({ pc_id: ACTOR_OTHER }), ACTOR_OTHER),
        ),
        ACTOR_OTHER,
      ),
    ).toMatch(/Player Character/);
  });

  it("a contract that does not parse as an Existence Contract, or carries a mangled classification, is no exception (fails closed)", () => {
    const good = existingActorContract(A);
    for (const mangled of [
      {},
      "x",
      null,
      { ...good, existing_actor_compilation: { classification: "DEFERRED", source_state: [] } },
      { ...good, existing_actor_compilation: { ...good.existing_actor_compilation, extra: 1 } },
      { ...good, existing_actor_compilation: {} },
    ])
      expect(
        actorBoundaryViolation(facts(contractFact(mangled)), A),
        JSON.stringify(mangled),
      ).toMatch(/Player Character/);
  });

  it("once the Role Registry binding names the identity, the actor is under lawful player control again (the cutover is the binding)", () => {
    const binding = factOf(
      PLAYER_CHARACTER_BINDING_KEY,
      {
        binding_slot: "role.player_character",
        active_pc: { fact_key: pcExistenceContractKey(A), entity_id: A },
        coupling: {
          world: { fact_key: "world/w/profile", entity_id: "w" },
          locus: { fact_key: "world/w/locus/l", entity_id: "l" },
        },
        transition: {
          type: "ACTIVATION",
          basis: {
            bridge: "NATIVE_ALREADY_THERE",
            established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
            authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
            statement: "x",
            pinned_versions: { pc: 1, world: 1, locus: 1 },
          },
        },
        prior_binding: null,
        replacement_binding: null,
        intrinsic_authority_migration: [],
        writer: { role: "role.archivist", permission: "permission.canon.write" },
      },
      { owner: "role_registry", facet: "player_character_binding" },
    );
    expect(
      actorBoundaryViolation(facts(contractFact(existingActorContract(A)), binding), A),
    ).toMatch(/player-character control/);
  });

  it("the Population-aggregate boundary is unchanged, compilation or not", () => {
    expect(
      actorBoundaryViolation(
        facts(contractFact(existingActorContract(A)), factOf(populationLedgerKey(A), {})),
        A,
      ),
    ).toMatch(/Population ledger/);
  });

  it("is by identity only: it still asks three keys and scans nothing", () => {
    const asked: string[] = [];
    const spy = {
      get: (k: string) => (asked.push(k), undefined),
      has: (k: string) => (asked.push(k), false),
    };
    actorBoundaryViolation(spy, A);
    expect(asked.sort()).toEqual(
      [PLAYER_CHARACTER_BINDING_KEY, pcExistenceContractKey(A), populationLedgerKey(A)].sort(),
    );
  });
});

describe("existingActorCompilationViolation: what a compilation must be, from committed facts", () => {
  const ok = () => facts(actorBasis());

  it("an ordinary fresh contract is no compilation and is judged by nothing here", () => {
    expect(existingActorCompilationViolation(fixtureContract({ pc_id: A }), facts())).toBeNull();
  });

  it("a compilation pinned to the identified actor's own committed state, at its exact version, holds", () => {
    expect(existingActorCompilationViolation(existingActorContract(A), ok())).toBeNull();
    // either kind of Named-Actor fact identifies the actor; several sources are lawful
    const both = facts(
      actorBasis(),
      factOf(actorCapabilityKey(A, C), { marker: "C" }),
      actorBasis(A, CAP_SWORDSMANSHIP),
    );
    expect(
      existingActorCompilationViolation(
        existingActorContract(A, [
          actorBasisPin(A, C),
          actorCapabilityPin(A, C),
          actorBasisPin(A, CAP_SWORDSMANSHIP),
        ]),
        both,
      ),
    ).toBeNull();
  });

  it("a source that is not committed, or is committed at another version or by another owner, fails closed", () => {
    expect(existingActorCompilationViolation(existingActorContract(A), facts())).toMatch(
      /committed and owned by the Named-Actor owner/,
    );
    expect(
      existingActorCompilationViolation(existingActorContract(A, [actorBasisPin(A, C, 2)]), ok()),
    ).toMatch(/exact committed version/);
    expect(
      existingActorCompilationViolation(
        existingActorContract(A, [{ ...actorBasisPin(A, C), owner: "world_state" }]),
        ok(),
      ),
    ).toMatch(/committed and owned/);
    expect(
      existingActorCompilationViolation(
        existingActorContract(A),
        facts(
          factOf(actorCapabilityBasisKey(A, C), capabilityBasis(A, C), {
            owner: "SYNTHETIC-ACTOR-HISTORY",
          }),
        ),
      ),
    ).toMatch(/committed and owned/);
  });

  it("a source must be the identified actor's own state: another actor's, another owner's or another kind's fails closed", () => {
    // another actor's state
    expect(
      existingActorCompilationViolation(
        existingActorContract(A, [actorBasisPin(ACTOR_OTHER, C)]),
        facts(actorBasis(ACTOR_OTHER, C)),
      ),
    ).toMatch(/identified actor's own committed Named-Actor state/);
    // the PC owner's own state, a world fact, a Population ledger, the binding and the contract itself
    for (const key of [
      pcCapabilityBasisKey(A, CAP_SAILING),
      worldProfileKey("w1"),
      populationLedgerKey(A),
      PLAYER_CHARACTER_BINDING_KEY,
      pcExistenceContractKey(A),
      "not/a/registered/key",
    ])
      expect(
        existingActorCompilationViolation(
          existingActorContract(A, [{ owner: "named_actor", fact_key: key, version: 1 }]),
          facts(factOf(key, {})),
        ),
        key,
      ).toMatch(/identified actor's own committed Named-Actor state/);
  });

  it("a compilation is no blank-slate player-authorship pass: any PLAYER-AUTHORED claim or player override fails closed", () => {
    const authored = {
      statement: "SYNTHETIC FIXTURE: authored.",
      provenance: "PLAYER-AUTHORED" as const,
    };
    const inherited = {
      statement: "SYNTHETIC FIXTURE: inherited.",
      provenance: "SAFELY-INHERITED" as const,
    };
    const base = existingActorContract(A);
    const cases = {
      identity_agency: { identity_agency: authored },
      contact_anchor: { contact: { kind: "CONTACT_ANCHOR" as const, surfaces: [authored] } },
      no_contact: { contact: { kind: "NO_CONTACT" as const, statement: authored } },
      embodiment: { embodiment_topology: authored },
      continuity: { continuity_rule: authored },
      entry_envelope: { entry_envelope: { items: [authored] } },
      override: {
        baseline_exception: {
          ...base.baseline_exception,
          player_overrides: [authored],
        },
      },
    };
    for (const [name, over] of Object.entries(cases))
      expect(existingActorCompilationViolation({ ...base, ...over }, ok()), name).toMatch(
        /no player-authorship pass/,
      );
    // an inherited NO_CONTACT statement and inherited envelope items are lawful
    expect(
      existingActorCompilationViolation(
        {
          ...base,
          contact: { kind: "NO_CONTACT", statement: inherited },
          entry_envelope: { items: [inherited] },
        },
        ok(),
      ),
    ).toBeNull();
  });
});

describe("ordinary activation refuses an existing-actor compilation", () => {
  it("existingActorBindingViolation names a compilation and nothing else", () => {
    expect(existingActorBindingViolation(existingActorContract(A))).toMatch(
      /Existing-Actor → PC handover, which is its own EXISTING_ACTOR_HANDOVER transition/,
    );
    expect(existingActorBindingViolation(fixtureContract())).toBeNull();
    // a malformed value is refused by the typed-contract rule, not misread here
    expect(existingActorBindingViolation({})).toBeNull();
    expect(existingActorBindingViolation(null)).toBeNull();
  });

  it("couplingBasisViolation (admission and load) refuses a binding whose PC is a compilation, and still accepts a fresh PC", () => {
    const binding = {
      transition: { basis: { pinned_versions: { pc: 1, world: 1, locus: 1 } } },
    } as never;
    const fact = (value: unknown): OwnerFact => factOf("k", value);
    expect(
      couplingBasisViolation(binding, {
        pc: fact(existingActorContract(A)),
        world: fact({}),
        locus: fact({}),
      }),
    ).toMatch(/already-existing actor/);
    expect(
      couplingBasisViolation(binding, {
        pc: fact(fixtureContract()),
        world: fact({}),
        locus: fact({}),
      }),
    ).toBeNull();
  });
});

describe("ACCEPTED_GENERATION_HISTORY refuses an existing-actor compilation", () => {
  const basis = (pcId: string) =>
    pcCapabilityBasis(pcId, CAP_SAILING, {
      establishment: {
        method: "ACCEPTED_GENERATION_HISTORY",
        contract: { fact_key: pcExistenceContractKey(pcId), version: 1 },
        claims: [{ section: "baseline_exception.safely_inherited", index: 0 }],
      },
    });

  it("the compilation is refused even with a located, accepted claim at its exact version", () => {
    const refused = pcCapabilityEstablishmentViolation(
      basis(A),
      facts(contractFact(existingActorContract(A))),
    );
    expect(refused).toMatch(/compiles an already-existing actor/);
    expect(refused).toMatch(/not implemented/);
  });

  it("the same basis over a fresh contract is accepted exactly as before (unchanged)", () => {
    const fresh = fixtureContract({
      pc_id: A,
      baseline_exception: {
        safely_inherited: [
          { statement: "SYNTHETIC FIXTURE: inherited.", provenance: "SAFELY-INHERITED" },
        ],
        player_overrides: [],
        hypotheses: [],
        unresolved: [],
      },
    });
    expect(pcCapabilityEstablishmentViolation(basis(A), facts(contractFact(fresh)))).toBeNull();
  });
});
