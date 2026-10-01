// Unit evidence for the Named-Actor capability derivations, the object registration rule and the one owner operation
// (ninth slice). Each derivation is the single statement of its rule: owner operation, IM-11 admission and load-time
// verification all use it. Register lineage: IA-02/IA-03/IA-14 (partial); RC-02/03/04; IM-02, IM-07.
import { describe, expect, it } from "vitest";
import {
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  pcExistenceContractKey,
  populationLedgerKey,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageUnresolvedError,
  actorBoundaryViolation,
  causeOwnerViolation,
  deriveCapability,
  namedActorCapabilityCloseProvider,
  namedActorCapabilityCloseRead,
  namedActorCapabilityDeclaration,
  namedActorObjectViolation,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  basisConsumerDeclaration,
  capabilityBasis,
  capabilityConsumerObject,
  closeConsumerDeclaration,
  nowConsumerDeclaration,
} from "@immortalis/testkit";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const basis = (over = {}) => capabilityBasis(A, C, over);
const basisFact = (b = basis(), over: Partial<OwnerFact> = {}): OwnerFact => ({
  key: actorCapabilityBasisKey(b.actor_id, b.capability_id),
  owner: "named_actor",
  facet: "actor_profile",
  value: b as never,
  unit: null,
  basis: "b",
  secrecy: "s",
  version: 1,
  provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} as never },
  ...over,
});
const facts = (...fs: OwnerFact[]) => new Map(fs.map((f) => [f.key, f]));
const fakeFact = (key: string, value: unknown = {}): OwnerFact =>
  basisFact(basis(), { key, value: value as never });

describe("deriveCapability: exactly what the basis determines (acceptance 2, 3)", () => {
  const asFact = (b = basis(), over = {}) => ({
    key: actorCapabilityBasisKey(b.actor_id, b.capability_id),
    owner: "named_actor",
    version: 1,
    value: b,
    ...over,
  });

  it("transcribes the authored marker, pins the basis, names the close — and adds no other state", () => {
    const d = deriveCapability(asFact());
    expect(d.ok && d.value).toEqual({
      actor_id: A,
      capability_id: C,
      marker: "C",
      basis: { fact_key: actorCapabilityBasisKey(A, C), version: 1 },
      close: { name: ACTOR_PROFILE_CAPABILITY_CLOSE, stage: actorCapabilityStage(A, C) },
    });
  });

  it("carries every marker form unchanged: each grade, EX with its descriptor, and ungraded — no conversion", () => {
    for (const marker of [
      "C",
      "B",
      "A",
      "S",
      { ex: "SYNTHETIC FIXTURE: a causal descriptor" },
      null,
    ] as const) {
      const d = deriveCapability(asFact(basis({ marker })));
      expect(d.ok && d.value.marker).toEqual(marker);
    }
  });

  it("is deterministic: identical input, identical output; no clock, randomness or counter participates", () => {
    expect(deriveCapability(asFact())).toEqual(deriveCapability(asFact()));
    const v2 = deriveCapability(asFact(basis(), { version: 7 }));
    expect(v2.ok && v2.value.basis.version).toBe(7);
  });

  it("refuses a basis that is not the Named-Actor owner's own, or not at the key derived from its identities", () => {
    expect(deriveCapability(asFact(basis(), { owner: "world_state" })).ok).toBe(false);
    expect(deriveCapability(asFact(basis(), { key: actorCapabilityBasisKey("other", C) })).ok).toBe(
      false,
    );
    expect(deriveCapability(asFact(basis(), { key: actorCapabilityKey(A, C) })).ok).toBe(false);
  });
});

describe("actorBoundaryViolation: PC authorship and aggregate identity (acceptance 5, 6)", () => {
  it("a free actor identity is lawful", () => {
    expect(actorBoundaryViolation(facts(), A)).toBeNull();
  });
  it("a Player Character identity is never a Named Actor, bound or not", () => {
    expect(actorBoundaryViolation(facts(fakeFact(pcExistenceContractKey(A))), A)).toMatch(
      /Player Character/,
    );
  });
  it("the entity the Role Registry binding names as the active PC is under lawful player control", () => {
    const binding = fakeFact(PLAYER_CHARACTER_BINDING_KEY, {
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
    });
    expect(actorBoundaryViolation(facts(binding), A)).toMatch(/player-character control/);
    expect(actorBoundaryViolation(facts(binding), "someone-else")).toBeNull();
  });
  it("a malformed binding grants no exemption and invents no refusal", () => {
    expect(
      actorBoundaryViolation(
        facts(fakeFact(PLAYER_CHARACTER_BINDING_KEY, { active_pc: { entity_id: A } })),
        A,
      ),
    ).toBeNull();
  });
  it("a Population ledger identity is an aggregate: it never receives an individual mastery record", () => {
    expect(actorBoundaryViolation(facts(fakeFact(populationLedgerKey(A))), A)).toMatch(
      /Population ledger/,
    );
  });
  it("is by identity only: it asks three keys and scans nothing", () => {
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

describe("causeOwnerViolation: causes are foreign facts, referenced (acceptance 2)", () => {
  it("refuses the actor owner's own state and kernel coordination state as a cause; any foreign owner is lawful", () => {
    expect(causeOwnerViolation("named_actor")).not.toBeNull();
    expect(causeOwnerViolation("temporal_kernel")).not.toBeNull();
    for (const owner of ["world_state", "population", "production", "SYNTHETIC-ACTOR-HISTORY"])
      expect(causeOwnerViolation(owner)).toBeNull();
  });
});

describe("the declaration and the registration rule: a capability is read only at its close (acceptance 4, 8)", () => {
  const objectOf = (over: Partial<TemporalObject> = {}) =>
    capabilityConsumerObject("c1", basis(), over);
  const bf = () => facts(basisFact());

  it("the close stage reads exactly its sealed basis NOW and produces exactly one capability, declaring the close", () => {
    const d = namedActorCapabilityDeclaration(basis());
    expect(d.stage).toEqual(actorCapabilityStage(A, C));
    expect(d.reads).toHaveLength(1);
    expect(d.reads[0]).toMatchObject({
      mode: "AS-OF-NOW",
      source: { owner: "named_actor", fact_key: actorCapabilityBasisKey(A, C) },
    });
    expect(d.produces).toEqual([actorCapabilityKey(A, C)]);
    expect(d.declares_close).toEqual({ name: ACTOR_PROFILE_CAPABILITY_CLOSE });
  });

  it("the consumer's read is AS-OF-DECLARED-CLOSE naming the actor owner's close and operation", () => {
    const r = namedActorCapabilityCloseRead(A, C);
    expect(r).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "named_actor", fact_key: actorCapabilityKey(A, C) },
      close_basis: {
        name: ACTOR_PROFILE_CAPABILITY_CLOSE,
        producer: { owner: "named_actor", operation: "named-actor-publish-capability-close" },
      },
    });
  });

  it("the derived object passes; the stage and the close read of one capability are lawful together", () => {
    expect(namedActorObjectViolation(objectOf(), { facts: bf() })).toBeNull();
  });

  it("refuses a consumer that reads the capability AS-OF-NOW: a later effective time cannot bypass the close", () => {
    const o = objectOf({
      dependencies: [namedActorCapabilityDeclaration(basis()), nowConsumerDeclaration("c1", A, C)],
    });
    expect(namedActorObjectViolation(o, { facts: bf() })).toMatch(/AS-OF-DECLARED-CLOSE/);
  });

  it("refuses any cross-owner read of the uncommitted establishment basis", () => {
    const o = objectOf({
      dependencies: [
        namedActorCapabilityDeclaration(basis()),
        basisConsumerDeclaration("c1", A, C),
      ],
    });
    expect(namedActorObjectViolation(o, { facts: bf() })).toMatch(/not a cross-owner read/);
  });

  it("refuses a CLOSE read that names another close, producer or invalidator shape", () => {
    const read = namedActorCapabilityCloseRead(A, C);
    for (const bad of [
      {
        ...read,
        close_basis: { ...(read as { close_basis: object }).close_basis, name: "some-other-close" },
      },
      {
        ...read,
        close_basis: {
          ...(read as { close_basis: object }).close_basis,
          producer: { owner: "other", operation: "op" },
        },
      },
      { ...read, invalidators: [] },
    ]) {
      const d = { ...closeConsumerDeclaration("c1", A, C), reads: [bad] as never };
      const o = objectOf({ dependencies: [namedActorCapabilityDeclaration(basis()), d] });
      expect(namedActorObjectViolation(o, { facts: bf() }), JSON.stringify(bad)).not.toBeNull();
    }
  });

  it("refuses a capability close declared for a basis that is not committed: a consequence cannot conjure the capability it needs", () => {
    expect(namedActorObjectViolation(objectOf(), { facts: facts() })).toMatch(
      /committed establishment basis/,
    );
    const wrong = facts(basisFact(basis(), { value: { ...basis(), actor_id: 5 } as never }));
    expect(namedActorObjectViolation(objectOf(), { facts: wrong })).toMatch(
      /committed establishment basis/,
    );
  });

  it("refuses a Named-Actor stage that is not exactly the one derived from its basis (a smuggled read, produce or close)", () => {
    const real = namedActorCapabilityDeclaration(basis());
    for (const forged of [
      { ...real, reads: [] },
      { ...real, produces: [actorCapabilityKey(A, "other")] },
      { ...real, declares_close: null },
      { ...real, declares_close: { name: "x" } },
      { ...real, reads: [...real.reads, namedActorCapabilityCloseRead(A, "other")] },
    ]) {
      const o = objectOf({ dependencies: [forged as never, closeConsumerDeclaration("c1", A, C)] });
      expect(namedActorObjectViolation(o, { facts: bf() }), JSON.stringify(forged)).not.toBeNull();
    }
  });

  it("refuses a second Named-Actor operation, a foreign stage that produces a Named-Actor key, and a Named-Actor-owned object", () => {
    const real = namedActorCapabilityDeclaration(basis());
    const second = {
      ...real,
      stage: {
        ...real.stage,
        owner_operation: { owner: "named_actor", operation: "named-actor-develop" },
      },
    };
    expect(
      namedActorObjectViolation(objectOf({ dependencies: [second] }), { facts: bf() }),
    ).toMatch(/exactly one stage/);
    const foreign = {
      ...closeConsumerDeclaration("c1", A, C),
      produces: [actorCapabilityKey(A, C)],
    };
    expect(
      namedActorObjectViolation(objectOf({ dependencies: [foreign] }), { facts: bf() }),
    ).toMatch(/only the Named-Actor owner/);
    const owned = objectOf({ owning_ref: { owner: "named_actor", process_id: "p" } });
    expect(namedActorObjectViolation(owned, { facts: bf() })).toMatch(
      /no standalone Named-Actor object/,
    );
  });

  it("refuses a read of a Named-Actor key space that is neither a capability nor its basis", () => {
    const d = {
      ...closeConsumerDeclaration("c1", A, C),
      reads: [
        {
          mode: "AS-OF-NOW",
          source: { owner: "named_actor", fact_key: "actor/x/other" },
          invalidators: [],
        },
      ] as never,
    };
    expect(namedActorObjectViolation(objectOf({ dependencies: [d] }), { facts: bf() })).toMatch(
      /names a capability or its establishment basis/,
    );
  });

  it("an object that touches no Named-Actor key space is not this rule's concern", () => {
    const d = { ...closeConsumerDeclaration("c1", A, C), reads: [], produces: ["synthetic/x"] };
    expect(
      namedActorObjectViolation(objectOf({ dependencies: [d] }), { facts: facts() }),
    ).toBeNull();
  });
});

describe("the capability-close owner operation: pure, fail-closed, inventing nothing (acceptance 3, 8)", () => {
  const input = (over: Record<string, unknown> = {}) => ({
    stage: actorCapabilityStage(A, C),
    produces: [actorCapabilityKey(A, C)],
    span: { from: { unit: "u", value: 1 }, to: { unit: "u", value: 2 }, elapsed: 1 },
    reads: [{ read: {} as never, fact: basisFact() }],
    prior: new Map<string, OwnerFact>(),
    ...over,
  });
  const reason = (f: () => unknown) => {
    try {
      f();
    } catch (e) {
      if (e instanceof StageUnresolvedError) return e.reason;
      throw e;
    }
    return "RESOLVED";
  };

  it("publishes the one capability the basis determines and inherits the basis' authored labels", () => {
    const [w, ...rest] = namedActorCapabilityCloseProvider.compute(input());
    expect(rest).toEqual([]);
    expect(w).toMatchObject({
      key: actorCapabilityKey(A, C),
      unit: null,
      basis: "b",
      secrecy: "s",
    });
    expect(w!.value).toMatchObject({ actor_id: A, capability_id: C, marker: "C" });
  });

  it("is deterministic and independent of the span (a requested horizon or elapsed amount changes nothing)", () => {
    const a = namedActorCapabilityCloseProvider.compute(input());
    const b = namedActorCapabilityCloseProvider.compute(
      input({
        span: { from: { unit: "u", value: 0 }, to: { unit: "u", value: 999 }, elapsed: 999 },
      }),
    );
    expect(a).toEqual(b);
  });

  it("is unresolved — publishing nothing — on a missing, extra or malformed source, a wrong slot, or a capability already published", () => {
    expect(reason(() => namedActorCapabilityCloseProvider.compute(input({ reads: [] })))).toBe(
      "SOURCE_ABSENT",
    );
    expect(
      reason(() =>
        namedActorCapabilityCloseProvider.compute(
          input({
            reads: [
              { read: {} as never, fact: basisFact() },
              { read: {} as never, fact: basisFact() },
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_ABSENT");
    expect(
      reason(() =>
        namedActorCapabilityCloseProvider.compute(
          input({
            reads: [
              { read: {} as never, fact: basisFact(basis(), { value: { marker: "S" } as never }) },
            ],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        namedActorCapabilityCloseProvider.compute(
          input({ produces: [actorCapabilityKey(A, "other")] }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(reason(() => namedActorCapabilityCloseProvider.compute(input({ produces: [] })))).toBe(
      "SOURCE_INVALID",
    );
    expect(
      reason(() =>
        namedActorCapabilityCloseProvider.compute(
          input({ prior: new Map([[actorCapabilityKey(A, C), basisFact()]]) }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        namedActorCapabilityCloseProvider.compute(
          input({
            reads: [{ read: {} as never, fact: basisFact(basis(), { owner: "world_state" }) }],
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
  });
});
