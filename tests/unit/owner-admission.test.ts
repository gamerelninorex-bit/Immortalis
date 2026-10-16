// IM-03 admission, tested on the pure commit core (no filesystem): owner exclusivity, key spaces,
// typed values, sealing and dependency direction. Register lineage: IA-02, IA-03 (partial), IA-28 (partial).
import { describe, expect, it } from "vitest";
import {
  BUILD_SPEC_IDENTITY,
  CANON_WRITE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CampaignCore,
  FACT_KINDS,
  canonicalAdmission,
  couplingBasisViolation,
  emptyState,
  factKind,
  resolveKey,
  type FactKindId,
} from "@immortalis/engine";
import {
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  TEST_OWNERS,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
} from "@immortalis/testkit";

const C = "c1";
const core = () =>
  new CampaignCore({
    campaignId: C,
    specLockSha256: BUILD_SPEC_IDENTITY.spec_lock_sha256,
    owners: CANONICAL_OWNER_REGISTRY,
    admission: canonicalAdmission,
    state: emptyState(C),
    headSha256: "0".repeat(64),
  });

const WORLD = worldProfileKey(FIXTURE_WORLD_ID);
const LOCUS = worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID);
const PC = pcExistenceContractKey(FIXTURE_PC_ID);

/** A group for `kind`, with owner/facet/rule taken from the registry unless overridden. */
function g(
  n: number,
  kind: FactKindId,
  key: string,
  value: unknown,
  over: Partial<CommitGroup> = {},
  writeOver: Record<string, unknown> = {},
): CommitGroup {
  const k = factKind(kind);
  return {
    campaign_id: C,
    group_id: `g${n}`,
    intent_id: `i${n}`,
    owner: k.owner,
    facet: k.facet,
    cause: `c${n}`,
    rule: k.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key,
        owner: k.owner,
        facet: k.facet,
        value: value as never,
        unit: null,
        basis: "b",
        secrecy: "s",
        expected_version: 0,
        ...writeOver,
      },
    ],
    ...over,
  };
}

function commit(c: CampaignCore, group: CommitGroup) {
  const p = c.prepare(group);
  if (p.ok && p.value.kind === "apply") c.accept(p.value);
  return p.ok ? "OK" : p.error.code;
}

const bindingValue = () => ({
  binding_slot: "role.player_character",
  active_pc: { fact_key: PC, entity_id: FIXTURE_PC_ID },
  coupling: {
    world: { fact_key: WORLD, entity_id: FIXTURE_WORLD_ID },
    locus: { fact_key: LOCUS, entity_id: FIXTURE_LOCUS_ID },
  },
  transition: {
    type: "ACTIVATION",
    basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
  },
  prior_binding: null,
  replacement_binding: null,
  intrinsic_authority_migration: [],
  writer: { role: "role.archivist", permission: "permission.canon.write" },
});

/** world (g1), locus (g2), PC (g3): the prerequisites of a binding. */
function seeded(): CampaignCore {
  const c = core();
  expect(commit(c, g(1, "world_profile", WORLD, fixtureWorld()))).toBe("OK");
  expect(
    commit(
      c,
      g(2, "world_locus", LOCUS, fixtureLocus(), {
        reads: [{ key: WORLD, version: 1 }],
        depends_on: ["g1"],
      }),
    ),
  ).toBe("OK");
  expect(commit(c, g(3, "pc_existence_contract", PC, fixtureContract()))).toBe("OK");
  return c;
}
const bindGroup = (n: number, over: Partial<CommitGroup> = {}) =>
  g(n, "player_character_binding", PLAYER_CHARACTER_BINDING_KEY, bindingValue(), {
    reads: [
      { key: PC, version: 1 },
      { key: WORLD, version: 1 },
      { key: LOCUS, version: 1 },
    ],
    depends_on: ["g3", "g1", "g2"],
    ...over,
  });

describe("registry: every key space has exactly one owner/facet and there is no fallback", () => {
  it("resolves each key to a single fact kind", () => {
    expect(resolveKey(WORLD)?.kind.id).toBe("world_profile");
    expect(resolveKey(LOCUS)?.kind.id).toBe("world_locus");
    expect(resolveKey(PC)?.kind.id).toBe("pc_existence_contract");
    expect(resolveKey(PLAYER_CHARACTER_BINDING_KEY)?.kind.id).toBe("player_character_binding");
    expect(resolveKey("anything/else")).toBeNull();
    expect(resolveKey("world/w/unknown")).toBeNull();
  });
  it("no key can belong to two kinds", () => {
    for (const key of [WORLD, LOCUS, PC, PLAYER_CHARACTER_BINDING_KEY]) {
      expect(FACT_KINDS.filter((k) => k.keyPattern.test(key))).toHaveLength(1);
    }
  });
  it("registers world_state/{world_profile, world_locus}, pc_existence/{existence_contract, pc_capability_profile}, role_registry/player_character_binding, the IM-02 kernel temporal_kernel/temporal_coordination, the IM-04 owner population/population_state, the IM-05 owner production/production_state, the IM-06 owner economy/economy_state, the IM-05 Logistics owner logistics/logistics_state, the IM-07 Named-Actor owner named_actor/actor_profile, the IM-10 Epistemic Access owner epistemic_access/epistemic_access, the IM-09 KTI owner kti/kti_development, the IM-06 GIP owner gip/gip_institution_identity, the IM-06 Diplomacy owner diplomacy/diplomacy_external_recognition, the infrastructure-only IM-12 Causal Draw owner causal_draw_kernel/draw_provenance, the infrastructure-only IM-12 Culture adjudication-record owner culture_adjudication_kernel/adjudication_provenance, the infrastructure-only IM-12 referee owner referee_adjudication_kernel/referee_provenance, the World-State fallback physical-entity facet, the World-State Source Condition facet, and nothing else", () => {
    const flat = [...CANONICAL_OWNER_REGISTRY].map(([o, fs]) => [o, [...fs].sort()]);
    expect(flat).toEqual([
      // the fifth slice adds World-State's fallback physical-entity custody (WG, F-016 R-1) as one more facet
      // the exact finite raw-source drawdown slice adds World-State's Source Condition (WS-003 §4A) as one more facet of the same owner
      [
        "world_state",
        [
          "world_fallback_physical_entity",
          "world_locus",
          "world_profile",
          "world_source_condition",
        ],
      ],
      // IM-07 (twenty-eighth slice): the PC capability profile is a second FACET of the one existing PC owner, never a second PC owner
      [
        "pc_existence",
        [
          "existence_contract",
          "pc_capability_profile",
          "pc_collection_mechanism",
          "pc_voluntary_commitment",
        ],
      ],
      ["role_registry", ["player_character_binding"]],
      ["temporal_kernel", ["temporal_coordination"]],
      // IM-04 (fourth slice): Population is the sole Unit/Count custodian, one facet
      ["population", ["population_pc_occupancy", "population_state"]],
      // IM-05 (fifth slice): Production, one facet; there is no fallback Production owner
      ["production", ["production_state"]],
      // IM-06 (sixth slice): Economy, one facet; there is no fallback Economy owner
      ["economy", ["economy_state"]],
      // IM-05 (eighth slice): Logistics, one facet; there is no fallback Logistics owner
      ["logistics", ["logistics_state"]],
      // IM-07 (ninth slice): the Named-Actor owner, one actor-profile facet; there is no fallback actor owner
      ["named_actor", ["actor_profile"]],
      // IM-10 (tenth slice): the Epistemic Access owner, one facet; there is no fallback Epistemic owner
      ["epistemic_access", ["epistemic_access"]],
      // IM-09 (eleventh slice): the KTI owner, one facet; there is no fallback KTI owner
      ["kti", ["kti_development"]],
      // IM-09 (forty-sixth slice): the Culture & Society owner, one facet; there is no fallback Culture owner
      ["culture", ["culture_social"]],
      // IM-06 (twelfth slice): the GIP owner, one Institution Identity facet; there is no fallback GIP owner
      ["gip", ["gip_institution_identity"]],
      // IM-06 (seventeenth slice): the Diplomacy owner, one External Recognition facet; there is no fallback Diplomacy owner
      // IM-06 (eighteenth slice): the same Diplomacy owner gains one exclusive Externalized Claim / Dispute facet; no second owner
      // IM-06 (nineteenth slice): the same Diplomacy owner gains one exclusive Relation Edge facet; no second owner
      [
        "diplomacy",
        [
          "diplomacy_external_recognition",
          "diplomacy_externalized_claim_dispute",
          "diplomacy_framework",
          "diplomacy_relation_edge",
        ],
      ],
      // IM-12 (twenty-sixth slice, F-027-CD1): the infrastructure-only Causal Draw provenance owner, one facet; it owns no world fact
      ["causal_draw_kernel", ["draw_provenance"]],
      // IM-12 (F-027-CJA1, consumer-free prerequisite): the infrastructure-only adjudication-record owner, one facet; it owns no Culture fact
      ["culture_adjudication_kernel", ["adjudication_provenance"]],
      // IM-12 (PR #61, B61-A3): the infrastructure-only host-driven AI referee provenance owner, one facet; it owns no world, PC or binding fact
      ["referee_adjudication_kernel", ["referee_provenance"]],
    ]);
  });
});

describe("real owners write their own facts (IA-03)", () => {
  it("commits world, locus, PC and then the binding", () => {
    const c = seeded();
    expect(commit(c, bindGroup(4))).toBe("OK");
    expect([...c.state.facts.keys()].sort()).toEqual(
      [LOCUS, PC, PLAYER_CHARACTER_BINDING_KEY, WORLD].sort(),
    );
  });
  it("test-only owners are not registered for canonical writes (no arbitrary owner/facet)", () => {
    const c = core();
    const [owner] = [...TEST_OWNERS.keys()];
    const facet = [...(TEST_OWNERS.get(owner as string) ?? [])][0] as string;
    const w = g(
      1,
      "world_profile",
      WORLD,
      fixtureWorld(),
      { owner: owner as string, facet },
      { owner: owner as string, facet },
    );
    expect(commit(c, w)).toBe("OWNER_NOT_REGISTERED");
  });
  it("a key outside every key space is rejected even for a registered owner (no fallback owner)", () => {
    const c = core();
    expect(commit(c, g(1, "world_profile", "world-state-misc/x", fixtureWorld()))).toBe(
      "KEY_NOT_ADMITTED",
    );
  });
});

describe("owner exclusivity (IA-03)", () => {
  it.each([
    ["role_registry writes a world locus key", "player_character_binding", LOCUS, fixtureLocus()],
    ["pc_existence writes the world profile key", "pc_existence_contract", WORLD, fixtureWorld()],
    ["world_state writes the PC contract key", "world_profile", PC, fixtureContract()],
    [
      "world_state writes the binding key",
      "world_profile",
      PLAYER_CHARACTER_BINDING_KEY,
      bindingValue(),
    ],
    [
      "pc_existence writes the binding key",
      "pc_existence_contract",
      PLAYER_CHARACTER_BINDING_KEY,
      bindingValue(),
    ],
    ["the locus facet writes the profile key", "world_locus", WORLD, fixtureWorld()],
    ["the profile facet writes a locus key", "world_profile", LOCUS, fixtureLocus()],
  ] as [string, FactKindId, string, unknown][])(
    "%s -> KEY_NOT_ADMITTED",
    (_n, asKind, key, value) => {
      expect(commit(core(), g(1, asKind, key, value))).toBe("KEY_NOT_ADMITTED");
    },
  );

  it("a second writable truth for an existing foreign fact is refused", () => {
    const c = seeded();
    // role_registry tries to take over the committed world profile: the core refuses the owner change.
    const takeover = g(
      9,
      "player_character_binding",
      WORLD,
      fixtureWorld(),
      {},
      { expected_version: 1 },
    );
    expect(commit(c, takeover)).toBe("FACT_OWNER_CONFLICT");
    expect(c.state.facts.get(WORLD)?.owner).toBe("world_state");
  });

  it("a PC contract cannot carry a copy of the world, nor a binding a copy of the PC (strict values)", () => {
    expect(
      commit(
        core(),
        g(1, "pc_existence_contract", PC, { ...fixtureContract(), world: fixtureWorld() }),
      ),
    ).toBe("VALUE_INVALID");
    const c = seeded();
    expect(
      commit(
        c,
        bindGroup(4, {
          writes: [
            {
              ...bindGroup(4).writes[0]!,
              value: { ...bindingValue(), pc: fixtureContract() } as never,
            },
          ],
        }),
      ),
    ).toBe("VALUE_INVALID");
  });

  it("one group writes one owner/facet: a binding group cannot also write a world fact", () => {
    const c = seeded();
    const mixed = bindGroup(4, {
      writes: [
        ...bindGroup(4).writes,
        {
          ...g(0, "world_profile", worldProfileKey("w2"), fixtureWorld({ world_id: "w2" }))
            .writes[0]!,
        },
      ],
    });
    expect(commit(c, mixed)).toBe("WRITE_OWNER_MISMATCH");
  });
});

describe("typed values and identity", () => {
  it("rejects a value that violates the owner's contract", () => {
    expect(commit(core(), g(1, "world_profile", WORLD, { world_id: FIXTURE_WORLD_ID }))).toBe(
      "VALUE_INVALID",
    );
  });
  it("rejects a value whose identity disagrees with its key (stable canonical identity)", () => {
    expect(commit(core(), g(1, "world_profile", WORLD, fixtureWorld({ world_id: "other" })))).toBe(
      "VALUE_INVALID",
    );
    expect(
      commit(core(), g(1, "pc_existence_contract", PC, fixtureContract({ pc_id: "other" }))),
    ).toBe("VALUE_INVALID");
  });
});

describe("sealed canon is create-only until an owner amendment mechanism exists", () => {
  it.each([
    [
      "world profile",
      "world_profile" as const,
      WORLD,
      () => fixtureWorld({ premise: "SYNTHETIC: rewritten" }),
    ],
    ["PC contract", "pc_existence_contract" as const, PC, () => fixtureContract()],
  ])("%s cannot be overwritten (no retcon)", (_n, kind, key, value) => {
    const c = seeded();
    expect(commit(c, g(9, kind, key, value(), {}, { expected_version: 1 }))).toBe(
      "AMENDMENT_NOT_SUPPORTED",
    );
    expect(c.state.facts.get(key)?.version).toBe(1);
  });
  it("the binding cannot be replaced or deactivated by overwrite", () => {
    const c = seeded();
    expect(commit(c, bindGroup(4))).toBe("OK");
    const again = g(
      9,
      "player_character_binding",
      PLAYER_CHARACTER_BINDING_KEY,
      bindingValue(),
      {
        reads: bindGroup(4).reads,
        depends_on: bindGroup(4).depends_on,
      },
      { expected_version: 1 },
    );
    expect(commit(c, again)).toBe("AMENDMENT_NOT_SUPPORTED");
  });
});

describe("dependency direction (IR: binding cannot feed backward to create its own prerequisite)", () => {
  it("a locus cannot precede its world", () => {
    const c = core();
    const locusFirst = g(1, "world_locus", LOCUS, fixtureLocus(), {
      reads: [{ key: WORLD, version: 0 }],
    });
    expect(commit(c, locusFirst)).toBe("PREREQUISITE_MISSING");
    expect(c.state.facts.size).toBe(0);
  });
  it("a locus must read and depend on the world it references", () => {
    const c = core();
    expect(commit(c, g(1, "world_profile", WORLD, fixtureWorld()))).toBe("OK");
    expect(commit(c, g(2, "world_locus", LOCUS, fixtureLocus(), { depends_on: ["g1"] }))).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      commit(
        c,
        g(3, "world_locus", LOCUS, fixtureLocus(), { reads: [{ key: WORLD, version: 1 }] }),
      ),
    ).toBe("REFERENCE_INVALID");
  });
  it("a binding cannot commit with nothing established, and creates nothing as a side effect", () => {
    const c = core();
    const honest = bindGroup(1, {
      reads: [PC, WORLD, LOCUS].map((key) => ({ key, version: 0 })),
      depends_on: [],
    });
    expect(commit(c, honest)).toBe("PREREQUISITE_MISSING");
    // pretending the prerequisites exist is caught by the core before admission is even reached
    expect(commit(c, bindGroup(2, { depends_on: [] }))).toBe("STALE_READ");
    expect(c.state.facts.size).toBe(0);
  });
  it.each([
    ["the PC", PC],
    ["the world", WORLD],
    ["the locus", LOCUS],
  ])("a binding cannot commit while %s is missing", (_n, missing) => {
    const c = core();
    const seed: [FactKindId, string, unknown, Partial<CommitGroup>][] = [
      ["world_profile", WORLD, fixtureWorld(), {}],
      [
        "world_locus",
        LOCUS,
        fixtureLocus(),
        { reads: [{ key: WORLD, version: 1 }], depends_on: ["g1"] },
      ],
      ["pc_existence_contract", PC, fixtureContract(), {}],
    ];
    seed.forEach(([kind, key, value, over], i) => {
      // a locus cannot exist without its world, so a missing world takes its locus with it
      const skipped = key === missing || (missing === WORLD && key === LOCUS);
      if (!skipped) expect(commit(c, g(i + 1, kind, key, value, over))).toBe("OK");
    });
    const b = bindGroup(4, {
      reads: [
        { key: PC, version: c.state.facts.get(PC)?.version ?? 0 },
        { key: WORLD, version: c.state.facts.get(WORLD)?.version ?? 0 },
        { key: LOCUS, version: c.state.facts.get(LOCUS)?.version ?? 0 },
      ],
      depends_on: [...c.state.facts.values()].map((f) => f.provenance.group_id),
    });
    expect(commit(c, b)).toBe("PREREQUISITE_MISSING");
    expect(c.state.facts.has(PLAYER_CHARACTER_BINDING_KEY)).toBe(false);
  });
  it("a binding must pin its prerequisites: reads at current versions and their committing groups", () => {
    const c = seeded();
    expect(commit(c, bindGroup(4, { reads: [] }))).toBe("REFERENCE_INVALID");
    expect(commit(c, bindGroup(5, { depends_on: ["g3"] }))).toBe("REFERENCE_INVALID");
  });
  it("a binding cannot couple a locus to a world it does not belong to", () => {
    const c = seeded();
    const otherWorld = "world-other";
    expect(
      commit(
        c,
        g(4, "world_profile", worldProfileKey(otherWorld), fixtureWorld({ world_id: otherWorld })),
      ),
    ).toBe("OK");
    const v = bindingValue();
    v.coupling.world = { fact_key: worldProfileKey(otherWorld), entity_id: otherWorld };
    // keys must be consistent with the locus id; the locus fact for that world does not exist
    v.coupling.locus = {
      fact_key: worldLocusKey(otherWorld, FIXTURE_LOCUS_ID),
      entity_id: FIXTURE_LOCUS_ID,
    };
    const b = bindGroup(5, {
      reads: [
        { key: PC, version: 1 },
        { key: worldProfileKey(otherWorld), version: 1 },
        { key: worldLocusKey(otherWorld, FIXTURE_LOCUS_ID), version: 0 },
      ],
      depends_on: ["g3", "g4"],
      writes: [{ ...bindGroup(5).writes[0]!, value: v as never }],
    });
    expect(commit(c, b)).toBe("PREREQUISITE_MISSING");
  });
  it("binding references must match their own key identities", () => {
    const c = seeded();
    const v = bindingValue();
    v.active_pc = { fact_key: PC, entity_id: "someone-else" };
    expect(
      commit(c, bindGroup(4, { writes: [{ ...bindGroup(4).writes[0]!, value: v as never }] })),
    ).toBe("REFERENCE_INVALID");
  });
});

describe("coupling basis: a lawful IR basis is required, not inferred from coexistence (RC-13, IR §6 Step 3)", () => {
  const withBasis = (basis: unknown) => {
    const v: Record<string, unknown> = { ...bindingValue() };
    v["transition"] = { type: "ACTIVATION", basis };
    return bindGroup(4, { writes: [{ ...bindGroup(4).writes[0]!, value: v as never }] });
  };
  const goodBasis = () => ({
    ...fixtureInsertionFact(),
    pinned_versions: { pc: 1, world: 1, locus: 1 },
  });
  const bindingFact = (c: CampaignCore) => c.state.facts.has(PLAYER_CHARACTER_BINDING_KEY);

  it("positive: a binding carrying the supported basis, pinned to the committed facts, commits and retains it", () => {
    const c = seeded();
    expect(commit(c, withBasis(goodBasis()))).toBe("OK");
    expect(c.state.facts.get(PLAYER_CHARACTER_BINDING_KEY)?.value).toMatchObject({
      transition: { type: "ACTIVATION", basis: goodBasis() },
    });
  });

  it("negative: PC, world and locus all committed, but no basis at all -> fail closed, nothing committed", () => {
    const c = seeded();
    const v: Record<string, unknown> = { ...bindingValue() };
    v["transition"] = { type: "ACTIVATION" };
    const noBasis = bindGroup(4, { writes: [{ ...bindGroup(4).writes[0]!, value: v as never }] });
    expect(commit(c, noBasis)).toBe("VALUE_INVALID");
    expect(bindingFact(c)).toBe(false);
    expect(c.state.revision).toBe(3);
  });

  it.each([
    ["an empty basis", {}],
    ["a null basis", null],
    [
      "no pins",
      (() => {
        const b: Record<string, unknown> = { ...goodBasis() };
        delete b["pinned_versions"];
        return b;
      })(),
    ],
    ["an unsupported bridge", { ...goodBasis(), bridge: "ESTABLISHED_TRANSFER_APPROACH" }],
    ["a deferred activation", { ...goodBasis(), bridge: "DEFERRED_ACTIVATION" }],
    [
      "an unsupported precedence class",
      { ...goodBasis(), established_by: "EXPLICIT_BOUNDED_DELEGATION" },
    ],
    [
      "persona authority",
      {
        ...goodBasis(),
        authored_under: { role: "George", permission: "permission.player_choice.commit" },
      },
    ],
    ["an empty statement", { ...goodBasis(), statement: "" }],
    ["an invented bridge mechanism", { ...goodBasis(), mechanism: "portal" }],
  ])("negative: %s is malformed/unsupported -> VALUE_INVALID, nothing committed", (_n, basis) => {
    const c = seeded();
    expect(commit(c, withBasis(basis))).toBe("VALUE_INVALID");
    expect(bindingFact(c)).toBe(false);
  });

  it.each([
    ["pc", { pc: 2, world: 1, locus: 1 }],
    ["world", { pc: 1, world: 2, locus: 1 }],
    ["locus", { pc: 1, world: 1, locus: 2 }],
    ["pc (version 0)", { pc: 0, world: 1, locus: 1 }],
    ["every fact (version 0)", { pc: 0, world: 0, locus: 0 }],
  ])(
    "negative: a basis not established against the committed %s version -> REFERENCE_INVALID",
    (_n, pinned_versions) => {
      const c = seeded();
      expect(commit(c, withBasis({ ...goodBasis(), pinned_versions }))).toBe("REFERENCE_INVALID");
      expect(bindingFact(c)).toBe(false);
    },
  );

  it("a missing prerequisite is still reported as such, before the basis is weighed", () => {
    const c = core();
    const unpinned = { ...goodBasis(), pinned_versions: { pc: 0, world: 0, locus: 0 } };
    const v: Record<string, unknown> = { ...bindingValue() };
    v["transition"] = { type: "ACTIVATION", basis: unpinned };
    const g0 = bindGroup(1, {
      reads: [PC, WORLD, LOCUS].map((key) => ({ key, version: 0 })),
      depends_on: [],
      writes: [{ ...bindGroup(1).writes[0]!, value: v as never }],
    });
    expect(commit(c, g0)).toBe("PREREQUISITE_MISSING");
    expect(c.state.facts.size).toBe(0);
  });

  it("couplingBasisViolation is the single verifier: sufficient only for a released PC and exact pins", () => {
    const c = seeded();
    const fact = (k: string) => c.state.facts.get(k)!;
    const facts = { pc: fact(PC), world: fact(WORLD), locus: fact(LOCUS) };
    const b = withBasis(goodBasis()).writes[0]!.value as never;
    const parsed = b as unknown as Parameters<typeof couplingBasisViolation>[0];
    expect(couplingBasisViolation(parsed, facts)).toBeNull();
    // a PC fact that is not a released Existence Contract cannot authorize an activation
    const notReleased = { ...facts.pc, value: { pc_id: FIXTURE_PC_ID } };
    expect(couplingBasisViolation(parsed, { ...facts, pc: notReleased })).toMatch(/released/);
    // pins that do not match the committed versions do not authorize one either
    expect(
      couplingBasisViolation(parsed, { ...facts, world: { ...facts.world, version: 2 } }),
    ).toMatch(/not established against/);
  });
});

describe("authority: canonical writes need role.archivist + permission.canon.write (IA-28, narrow)", () => {
  it.each([
    ["a persona", { role: "George", permission: "permission.canon.write" }],
    ["an implementation identity", { role: "Claude", permission: "permission.canon.write" }],
    ["role.gm", { role: "role.gm", permission: "permission.canon.write" }],
    ["role.player", { role: "role.player", permission: "permission.player_choice.commit" }],
    [
      "archivist without canon.write",
      { role: "role.archivist", permission: "permission.archive.version" },
    ],
  ])("%s cannot publish a world, PC or binding fact", (_n, authority) => {
    expect(commit(core(), g(1, "world_profile", WORLD, fixtureWorld(), { authority }))).toBe(
      "AUTHORITY_DENIED",
    );
    const c = seeded();
    expect(commit(c, bindGroup(4, { authority }))).toBe("AUTHORITY_DENIED");
    expect(c.state.facts.has(PLAYER_CHARACTER_BINDING_KEY)).toBe(false);
  });
});

describe("admission is pure and only consulted for new commits", () => {
  it("gives the same answer twice for the same input", () => {
    const c = seeded();
    const group = bindGroup(4);
    expect(canonicalAdmission.check(group, c.state)).toEqual(
      canonicalAdmission.check(group, c.state),
    );
  });
});
