import type {
  ExistenceContract,
  InsertionFact,
  Publication,
  WorldLocus,
  WorldProfile,
} from "@immortalis/contracts";

/**
 * SYNTHETIC TEST DATA for the Canonical World Identity & Owner Foundation. The prose below is
 * fixture text, not IMMORTALIS canon, and carries no game semantics. It deliberately supplies no
 * owner, facet, authority or rule: those come only from the specification-backed registry in
 * @immortalis/engine. Production code must never import this package (Bootstrap Plan §2.2).
 */
export const FIXTURE_CAMPAIGN = "campaign-world-foundation-1";
export const FIXTURE_WORLD_ID = "world-fixture-1";
export const FIXTURE_LOCUS_ID = "locus-fixture-1";
export const FIXTURE_PC_ID = "pc-fixture-1";

export const fixtureWorld = (over: Partial<WorldProfile> = {}): WorldProfile => ({
  world_id: FIXTURE_WORLD_ID,
  premise: "SYNTHETIC FIXTURE: an original, bounded test setting.",
  reference_causal_basis: {
    mode: "ORIGINAL",
    established_canon: "SYNTHETIC FIXTURE: nothing beyond this sentence is established.",
  },
  material_world_law_departures: [],
  insertion_supporting_constraints: [
    { aspect: "era", statement: "SYNTHETIC FIXTURE: an unspecified fixture era." },
  ],
  ...over,
});

export const fixtureLocus = (over: Partial<WorldLocus> = {}): WorldLocus => ({
  locus_id: FIXTURE_LOCUS_ID,
  world: { fact_key: `world/${FIXTURE_WORLD_ID}/profile`, entity_id: FIXTURE_WORLD_ID },
  designation: "SYNTHETIC FIXTURE: one bounded test locality.",
  constraints: [],
  ...over,
});

export const fixtureContract = (over: Partial<ExistenceContract> = {}): ExistenceContract => ({
  pc_id: FIXTURE_PC_ID,
  identity_agency: {
    statement: "SYNTHETIC FIXTURE: one continuing agency.",
    provenance: "PLAYER-AUTHORED",
  },
  contact: {
    kind: "CONTACT_ANCHOR",
    surfaces: [{ statement: "SYNTHETIC FIXTURE: a visible form.", provenance: "PLAYER-AUTHORED" }],
  },
  embodiment_topology: {
    statement: "SYNTHETIC FIXTURE: one body.",
    provenance: "PLAYER-AUTHORED",
  },
  continuity_rule: {
    statement: "SYNTHETIC FIXTURE: continuity follows the one body.",
    provenance: "PLAYER-AUTHORED",
  },
  baseline_exception: {
    safely_inherited: [],
    player_overrides: [],
    hypotheses: [],
    unresolved: [],
  },
  entry_envelope: { items: [] },
  release: {
    status: "RELEASED",
    mirror_acceptance: {
      accepted_by: { role: "role.player", permission: "permission.player_choice.commit" },
      items_displayed_and_accepted: ["fixture-mirror-item-1"],
    },
  },
  ...over,
});

/** Lineage/identity for the n-th publication; `basis` and `secrecy` are opaque authored input. */
export const publication = (n: number, over: Partial<Publication> = {}): Publication => ({
  group_id: `wf-group-${n}`,
  intent_id: `wf-intent-${n}`,
  cause: `wf-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
  ...over,
});

/**
 * The explicit, already-established IR insertion fact the acceptance fixture supplies for the
 * native/already-there case (IR §6 Step 3). The binding service never infers this from the
 * existence of the PC, world and locus; a test that omits it must see the binding fail closed.
 */
export const fixtureInsertionFact = (over: Partial<InsertionFact> = {}): InsertionFact => ({
  bridge: "NATIVE_ALREADY_THERE",
  established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
  authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
  statement: "SYNTHETIC FIXTURE: the character is already at this locality; no bridge is involved.",
  ...over,
});
