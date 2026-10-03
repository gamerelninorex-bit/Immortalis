/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary malformed values */
// Existing-Actor → PC Role Registry Handover Cutover Foundation — contract evidence for the Role Registry binding's second
// representable transition. Sources (exact pins live in spec/f027/spec-lock.json): IR pin 2026-09-25T00:17:26.287Z (§5 item 3,
// §6 Step 6, §17), I-002 pin 2026-09-25T00:15:54.536Z, WS-006 / F-014A pin 2026-09-25T00:18:36.828Z (W3-CP3 interface note);
// PC-CONTROL HANDOVER CONTRACT v1 (observed pin 2026-09-25T00:16:16.544Z, seam rule only; NOT a lock pin); RC-02 (foreign facts are
// referenced, never copied) and RC-13 (migration/handover data). Every schema is strict, which is also the structural half of the
// exclusions: no insertion fact, bridge, copied state, capability, second locus, mode or replacement is representable.
import { describe, expect, it } from "vitest";
import {
  EXISTING_ACTOR_HANDOVER,
  HandoverBasisSchema,
  HandoverTargetSchema,
  PlayerCharacterBindingSchema,
  actorCapabilityBasisKey,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  fixtureInsertionFact,
} from "@immortalis/testkit";
import { actorBasisPin } from "../support/existing-actor.ts";

const A = ACTOR_SMITH;
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;

const common = (): any => ({
  binding_slot: "role.player_character",
  active_pc: { fact_key: pcExistenceContractKey(A), entity_id: A },
  coupling: {
    world: { fact_key: worldProfileKey(W), entity_id: W },
    locus: { fact_key: worldLocusKey(W, L), entity_id: L },
  },
  prior_binding: null,
  replacement_binding: null,
  writer: { role: "role.archivist", permission: "permission.canon.write" },
});
const handover = (): any => ({
  ...common(),
  transition: {
    type: EXISTING_ACTOR_HANDOVER,
    basis: { pinned_versions: { pc: 1, world: 1, locus: 1, coupling: 1 } },
  },
  intrinsic_authority_migration: [
    { owner: "world_state", fact_key: worldActorCouplingKey(A), version: 1 },
    actorBasisPin(A, CAP_METALWORKING),
  ],
});
const activation = (): any => ({
  ...common(),
  transition: {
    type: "ACTIVATION",
    basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
  },
  intrinsic_authority_migration: [],
});
const parses = (v: unknown) => PlayerCharacterBindingSchema.safeParse(v).success;

describe("the binding has exactly two transitions, explicitly distinguished", () => {
  it("the first ACTIVATION of a fresh PC parses and round-trips byte-for-byte unchanged", () => {
    expect(PlayerCharacterBindingSchema.parse(activation())).toEqual(activation());
    expect(Object.keys(PlayerCharacterBindingSchema.parse(activation())).sort()).toEqual(
      Object.keys(activation()).sort(),
    );
  });

  it("the Existing-Actor → PC handover parses and round-trips unchanged under its own transition type", () => {
    expect(PlayerCharacterBindingSchema.parse(handover())).toEqual(handover());
    expect(EXISTING_ACTOR_HANDOVER).toBe("EXISTING_ACTOR_HANDOVER");
    expect(handover().transition.type).not.toBe(activation().transition.type);
  });

  it("the transition type alone selects the basis: neither basis is accepted under the other's type", () => {
    const crossed = handover();
    crossed.transition.basis = activation().transition.basis;
    expect(parses(crossed)).toBe(false);
    const crossedBack = activation();
    crossedBack.transition.basis = handover().transition.basis;
    expect(parses(crossedBack)).toBe(false);
  });

  it("every other transition kind fails closed", () => {
    for (const type of [
      "HANDOVER",
      "EXISTING_ACTOR",
      "DEACTIVATION",
      "RELEASE",
      "TRANSFER",
      "REACTIVATION",
      "REPLACEMENT",
      "SUCCESSION",
      "FORK",
      "DEFERRED_ACTIVATION",
    ]) {
      const v = handover();
      v.transition.type = type;
      expect(parses(v), type).toBe(false);
    }
  });
});

describe("the handover carries references to established state, never a placement, a copy or a capability", () => {
  it("the basis is exactly the four pinned versions: contract, world, locus and coupling", () => {
    expect(Object.keys(HandoverBasisSchema.shape)).toEqual(["pinned_versions"]);
    const ok = { pinned_versions: { pc: 1, world: 1, locus: 1, coupling: 1 } };
    expect(HandoverBasisSchema.safeParse(ok).success).toBe(true);
    for (const missing of ["pc", "world", "locus", "coupling"]) {
      const v = structuredClone(ok) as any;
      delete v.pinned_versions[missing];
      expect(HandoverBasisSchema.safeParse(v).success, missing).toBe(false);
    }
    // a missing referent may be pinned at 0 (so admission can say PREREQUISITE_MISSING); a negative or fractional pin never
    for (const bad of [-1, 1.5, "1", null]) {
      const v = structuredClone(ok) as any;
      v.pinned_versions.coupling = bad;
      expect(HandoverBasisSchema.safeParse(v).success, String(bad)).toBe(false);
    }
  });

  it("unknown fields are rejected at every level: no insertion fact, bridge, statement, copy or second locus", () => {
    const edits: Record<string, (v: any) => void> = {
      "top-level extra": (v) => (v.binding_mode = "DEFERRED"),
      "an insertion statement": (v) => (v.transition.basis.statement = "x"),
      "a bridge": (v) => (v.transition.basis.bridge = "NATIVE_ALREADY_THERE"),
      "an establishing class": (v) => (v.transition.basis.established_by = "EXPLICIT"),
      "an authoring authority": (v) => (v.transition.basis.authored_under = {}),
      "an embedded coupling copy": (v) => (v.transition.basis.coupling = {}),
      "a pin extra": (v) => (v.transition.basis.pinned_versions.actor_state = 1),
      "a second locus": (v) => (v.coupling.second_locus = {}),
      "a transition extra": (v) => (v.transition.reason = "x"),
      "a copied capability": (v) => (v.intrinsic_authority_migration[1].marker = "S"),
      "a copied value": (v) => (v.intrinsic_authority_migration[0].value = {}),
      "a handover record": (v) => (v.handover = {}),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const v = handover();
      edit(v);
      expect(parses(v), name).toBe(false);
    }
  });

  it("the migration is a list of exact owner / fact key / version references: nothing else is a migration entry", () => {
    for (const bad of [
      { from: "named_actor", to: "pc_existence" },
      { owner: "named_actor", fact_key: "k" },
      { owner: "named_actor", fact_key: "k", version: -1 },
      { owner: "named_actor", fact_key: "k", version: 1.5 },
      { owner: "", fact_key: "k", version: 1 },
      "world-state/actor/x/coupling",
      null,
    ]) {
      const v = handover();
      v.intrinsic_authority_migration = [bad];
      expect(parses(v), JSON.stringify(bad)).toBe(false);
    }
  });

  it("a handover references what it consumed (non-empty); a first ACTIVATION migrates nothing; no reference repeats", () => {
    const empty = handover();
    empty.intrinsic_authority_migration = [];
    expect(parses(empty)).toBe(false);
    const migrating = activation();
    migrating.intrinsic_authority_migration = handover().intrinsic_authority_migration;
    expect(parses(migrating)).toBe(false);
    const repeated = handover();
    repeated.intrinsic_authority_migration.push({ ...repeated.intrinsic_authority_migration[0] });
    expect(parses(repeated)).toBe(false);
    const distinct = handover();
    distinct.intrinsic_authority_migration.push({
      owner: "named_actor",
      fact_key: actorCapabilityBasisKey(A, "capability-second"),
      version: 1,
    });
    expect(parses(distinct)).toBe(true);
  });

  it("there is still one writer, no prior or replacement binding and no other slot", () => {
    for (const edit of [
      (v: any) => (v.prior_binding = v.active_pc),
      (v: any) => (v.replacement_binding = v.active_pc),
      (v: any) =>
        (v.writer = { role: "role.player", permission: "permission.player_choice.commit" }),
      (v: any) => (v.binding_slot = "role.second_character"),
    ]) {
      const v = handover();
      edit(v);
      expect(parses(v)).toBe(false);
    }
  });

  it("the handover input names identities only: a placement, insertion or unknown field is not representable", () => {
    const ids = { pc_id: A, world_id: W, locus_id: L };
    expect(HandoverTargetSchema.safeParse(ids).success).toBe(true);
    for (const extra of [
      { insertion: fixtureInsertionFact() },
      { coupling: {} },
      { capability: "c" },
      { binding_mode: "DEFERRED" },
    ])
      expect(HandoverTargetSchema.safeParse({ ...ids, ...extra }).success).toBe(false);
    for (const missing of Object.keys(ids)) {
      const v: any = { ...ids };
      delete v[missing];
      expect(HandoverTargetSchema.safeParse(v).success, missing).toBe(false);
    }
  });
});
