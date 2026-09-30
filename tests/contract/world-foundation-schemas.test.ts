// Contract layer: typed values of the Canonical World Identity & Owner Foundation facts.
// Governing sources: WG Output Packet, I-002 §4/§7/§21/§26, IR §6 step 6, RC-02, RC-13 (spec lock f027).
// Every schema is strict: an unmodelled field is rejected, never carried (IA-02).
import { describe, expect, it } from "vitest";
import {
  BindingTargetSchema,
  CouplingBasisSchema,
  EntityId,
  InsertionFactSchema,
  ExistenceContractSchema,
  PlayerCharacterBindingSchema,
  PublicationSchema,
  WorldLocusSchema,
  WorldProfileSchema,
} from "@immortalis/contracts";
import {
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
} from "@immortalis/testkit";

const binding = () => ({
  binding_slot: "role.player_character",
  active_pc: { fact_key: "pc/p/existence-contract", entity_id: "p" },
  coupling: {
    world: { fact_key: "world/w/profile", entity_id: "w" },
    locus: { fact_key: "world/w/locus/l", entity_id: "l" },
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

describe("EntityId", () => {
  it.each(["w", "world-1", "a.b:c_d", "0x1"])("accepts %s", (id) => {
    expect(EntityId.safeParse(id).success).toBe(true);
  });
  it.each(["", "a/b", " a", "a ", "-a", "a\nb"])(
    "rejects %j (it is embedded in fact keys)",
    (id) => {
      expect(EntityId.safeParse(id).success).toBe(false);
    },
  );
});

describe("World Profile (WG Output Packet)", () => {
  it("accepts the four-part packet", () => {
    expect(WorldProfileSchema.safeParse(fixtureWorld()).success).toBe(true);
  });
  it.each(["world_id", "premise", "reference_causal_basis"] as const)("requires %s", (field) => {
    const w: Record<string, unknown> = { ...fixtureWorld() };
    delete w[field];
    expect(WorldProfileSchema.safeParse(w).success).toBe(false);
  });
  it("requires the two list parts to be stated, even when empty (no silent default)", () => {
    for (const field of ["material_world_law_departures", "insertion_supporting_constraints"]) {
      const w: Record<string, unknown> = { ...fixtureWorld() };
      delete w[field];
      expect(WorldProfileSchema.safeParse(w).success).toBe(false);
    }
  });
  it.each([
    { mode: "EXACT_NAMED_SETTING", setting: "s", era_version_continuity: null },
    { mode: "INSPIRED_BY", donor: "d", structural_grammar: "g" },
    { mode: "FACTUAL_HISTORICAL", scope: "s" },
    { mode: "ORIGINAL", established_canon: "c" },
  ])("carries WG reference mode $mode", (basis) => {
    expect(
      WorldProfileSchema.safeParse(fixtureWorld({ reference_causal_basis: basis as never }))
        .success,
    ).toBe(true);
  });
  it("does not represent a delegated world: that needs a sealed delegation record (not implemented)", () => {
    const delegated = { mode: "DELEGATED", basis: "surprise me" };
    expect(
      WorldProfileSchema.safeParse(fixtureWorld({ reference_causal_basis: delegated as never }))
        .success,
    ).toBe(false);
  });
  it("rejects PC-owned or population content smuggled into the profile", () => {
    for (const extra of [{ pc: { name: "x" } }, { population: 5000 }, { clock: 0 }]) {
      expect(WorldProfileSchema.safeParse({ ...fixtureWorld(), ...extra }).success).toBe(false);
    }
  });
});

describe("World locus", () => {
  it("references its world and copies none of it", () => {
    expect(WorldLocusSchema.safeParse(fixtureLocus()).success).toBe(true);
    expect(
      WorldLocusSchema.safeParse({ ...fixtureLocus(), world_profile: fixtureWorld() }).success,
    ).toBe(false);
  });
});

describe("I-002 Existence Contract", () => {
  it("accepts a released contract with the six-part minimum", () => {
    expect(ExistenceContractSchema.safeParse(fixtureContract()).success).toBe(true);
  });
  it.each([
    "identity_agency",
    "contact",
    "embodiment_topology",
    "continuity_rule",
    "baseline_exception",
    "entry_envelope",
    "release",
  ] as const)("requires %s", (field) => {
    const c: Record<string, unknown> = { ...fixtureContract() };
    delete c[field];
    expect(ExistenceContractSchema.safeParse(c).success).toBe(false);
  });
  it("requires a contact anchor or an explicit NO-CONTACT; an empty anchor is neither", () => {
    const noContact = {
      kind: "NO_CONTACT",
      statement: { statement: "s", provenance: "PLAYER-AUTHORED" },
    };
    expect(
      ExistenceContractSchema.safeParse(fixtureContract({ contact: noContact as never })).success,
    ).toBe(true);
    const empty = { kind: "CONTACT_ANCHOR", surfaces: [] };
    expect(
      ExistenceContractSchema.safeParse(fixtureContract({ contact: empty as never })).success,
    ).toBe(false);
  });
  it.each([
    "PLAYER-ADMITTED",
    "PLAYER-DELEGATED",
    "SYSTEM-HYPOTHESIS",
    "ACTOR-STANCE CLAIM",
    "SETTING-PREMISE",
  ])("host-context firewall: intrinsic canon cannot carry %s provenance", (provenance) => {
    const c = fixtureContract({
      identity_agency: { statement: "s", provenance: provenance as never },
    });
    expect(ExistenceContractSchema.safeParse(c).success).toBe(false);
  });
  it("does not hold world state, relationships, knowledge, skills or a binding", () => {
    for (const extra of [
      { world: {} },
      { locus: "x" },
      { relationships: [] },
      { knowledge: [] },
      { skills: [] },
      { binding: {} },
      { delegation: {} },
    ]) {
      expect(ExistenceContractSchema.safeParse({ ...fixtureContract(), ...extra }).success).toBe(
        false,
      );
    }
  });
  it("is RELEASED only with the Character Mirror acceptance record", () => {
    const c = fixtureContract();
    const noMirror = { ...c, release: { status: "RELEASED" } };
    expect(ExistenceContractSchema.safeParse(noMirror).success).toBe(false);
    const draft = { ...c, release: { ...c.release, status: "DRAFT" } };
    expect(ExistenceContractSchema.safeParse(draft).success).toBe(false);
    const emptyAcceptance = structuredClone(c);
    emptyAcceptance.release.mirror_acceptance.items_displayed_and_accepted = [];
    expect(ExistenceContractSchema.safeParse(emptyAcceptance).success).toBe(false);
  });
  it("the Mirror is accepted by role.player's choice authority, not by a persona", () => {
    const c = structuredClone(fixtureContract());
    (c.release.mirror_acceptance.accepted_by as { role: string }).role = "George";
    expect(ExistenceContractSchema.safeParse(c).success).toBe(false);
  });
});

describe("RC-13 IRB-01 Binding", () => {
  it("accepts a first activation", () => {
    expect(PlayerCharacterBindingSchema.safeParse(binding()).success).toBe(true);
  });
  it.each([
    ["deactivation", { transition: { type: "DEACTIVATION" } }],
    ["transfer", { transition: { type: "TRANSFER" } }],
    ["a prior binding", { prior_binding: { fact_key: "k", entity_id: "e" } }],
    ["a replacement binding", { replacement_binding: { fact_key: "k", entity_id: "e" } }],
    ["existing-actor authority migration", { intrinsic_authority_migration: [{ ref: "x" }] }],
    ["a persona writer", { writer: { role: "George", permission: "permission.canon.write" } }],
    [
      "a non-archivist writer",
      { writer: { role: "role.gm", permission: "permission.canon.write" } },
    ],
    ["a copied world", { world: { premise: "copy" } }],
  ])("is not representable: %s (not implemented; fails closed)", (_n, over) => {
    expect(PlayerCharacterBindingSchema.safeParse({ ...binding(), ...over }).success).toBe(false);
  });
  it("has no NULL record: NULL is the absence of the fact", () => {
    expect(PlayerCharacterBindingSchema.safeParse({ ...binding(), active_pc: null }).success).toBe(
      false,
    );
  });
});

describe("RC-13 coupling basis: the already-established IR insertion fact (IR §3, §5, §6 Step 3)", () => {
  const basis = () => ({
    ...fixtureInsertionFact(),
    pinned_versions: { pc: 1, world: 1, locus: 1 },
  });
  const withBasis = (b: unknown) => ({
    ...binding(),
    transition: { type: "ACTIVATION", basis: b },
  });

  it("accepts the one supported case: native/already-there, explicit player-authored, role.player", () => {
    expect(InsertionFactSchema.safeParse(fixtureInsertionFact()).success).toBe(true);
    expect(CouplingBasisSchema.safeParse(basis()).success).toBe(true);
    expect(PlayerCharacterBindingSchema.safeParse(withBasis(basis())).success).toBe(true);
  });

  it("a binding without a basis is not representable: coexistence of PC, world and locus is not a basis", () => {
    const b = binding();
    expect(
      PlayerCharacterBindingSchema.safeParse({ ...b, transition: { type: "ACTIVATION" } }).success,
    ).toBe(false);
    expect(
      PlayerCharacterBindingSchema.safeParse({
        ...b,
        transition: { type: "ACTIVATION", basis: null },
      }).success,
    ).toBe(false);
    expect(
      PlayerCharacterBindingSchema.safeParse({
        ...b,
        transition: { type: "ACTIVATION", basis: {} },
      }).success,
    ).toBe(false);
  });

  it.each([
    "ESTABLISHED_TRANSFER_APPROACH",
    "DEFERRED_ACTIVATION",
    "RECURRENT_BINDING",
    "DEGENERATE_COEXTENSIVE_BINDING",
    "NULL",
    "native/already-there ",
    "",
  ])("bridge mode %j is not implemented and fails closed (no bridge is invented)", (bridge) => {
    expect(
      InsertionFactSchema.safeParse(fixtureInsertionFact({ bridge: bridge as never })).success,
    ).toBe(false);
    expect(PlayerCharacterBindingSchema.safeParse(withBasis({ ...basis(), bridge })).success).toBe(
      false,
    );
  });

  it.each([
    "STRONG_SEMANTIC_IMPLICATION",
    "AUTHORITATIVE_WORLD_OR_PC_FACT",
    "SMALLEST_MATERIAL_CLARIFICATION",
    "EXPLICIT_BOUNDED_DELEGATION",
    "SYSTEM-HYPOTHESIS",
  ])("precedence class %s is not implemented and fails closed", (established_by) => {
    expect(
      InsertionFactSchema.safeParse(
        fixtureInsertionFact({ established_by: established_by as never }),
      ).success,
    ).toBe(false);
  });

  it.each([
    ["a persona", { role: "George", permission: "permission.player_choice.commit" }],
    [
      "an implementation identity",
      { role: "Claude", permission: "permission.player_choice.commit" },
    ],
    ["role.gm", { role: "role.gm", permission: "permission.rule.adjudicate" }],
    ["role.archivist", { role: "role.archivist", permission: "permission.canon.write" }],
    [
      "role.player without the choice permission",
      { role: "role.player", permission: "permission.canon.write" },
    ],
  ])(
    "the fact must be authored under role.player's choice authority, not %s",
    (_n, authored_under) => {
      expect(
        InsertionFactSchema.safeParse(
          fixtureInsertionFact({ authored_under: authored_under as never }),
        ).success,
      ).toBe(false);
    },
  );

  it("requires the authored statement and rejects an invented bridge mechanism or any extra field", () => {
    expect(InsertionFactSchema.safeParse(fixtureInsertionFact({ statement: "" })).success).toBe(
      false,
    );
    expect(
      InsertionFactSchema.safeParse({ ...fixtureInsertionFact(), statement: undefined }).success,
    ).toBe(false);
    for (const extra of [
      { mechanism: "portal" },
      { death_event: "truck" },
      { summoner: "x" },
      { transfer: {} },
    ]) {
      expect(InsertionFactSchema.safeParse({ ...fixtureInsertionFact(), ...extra }).success).toBe(
        false,
      );
      expect(CouplingBasisSchema.safeParse({ ...basis(), ...extra }).success).toBe(false);
    }
  });

  it("pins the exact PC, world and locus versions; a missing or malformed pin is rejected", () => {
    for (const bad of [
      {},
      { pc: 1, world: 1 },
      { pc: -1, world: 1, locus: 1 },
      { pc: 1.5, world: 1, locus: 1 },
      { pc: 1, world: 1, locus: 1, extra: 1 },
    ]) {
      expect(CouplingBasisSchema.safeParse({ ...basis(), pinned_versions: bad }).success).toBe(
        false,
      );
    }
    const noPins: Record<string, unknown> = { ...basis() };
    delete noPins["pinned_versions"];
    expect(CouplingBasisSchema.safeParse(noPins).success).toBe(false);
  });
});

describe("publication inputs", () => {
  it("require every lineage field; basis and secrecy are never defaulted", () => {
    expect(PublicationSchema.safeParse(publication(1)).success).toBe(true);
    for (const f of ["group_id", "intent_id", "cause", "basis", "secrecy"] as const) {
      const p: Record<string, unknown> = { ...publication(1) };
      delete p[f];
      expect(PublicationSchema.safeParse(p).success).toBe(false);
    }
  });
  it("binding targets are identities only", () => {
    expect(
      BindingTargetSchema.safeParse({ pc_id: "p", world_id: "w", locus_id: "l" }).success,
    ).toBe(true);
    expect(
      BindingTargetSchema.safeParse({ pc_id: "p", world_id: "w", locus_id: "l", owner: "x" })
        .success,
    ).toBe(false);
  });
});
