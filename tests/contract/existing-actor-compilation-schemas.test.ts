// Existing-Actor I-002 Pre-Binding Compilation & Ownership Boundary Foundation — contract evidence for the one explicit
// classification an Existence Contract may carry. Sources (exact pins live in spec/f027/spec-lock.json): I-002 at its lock
// pin 2026-09-25T00:15:54.536Z (§2, §4, §7, §21, §26); the sovereign-ratified PC-CONTROL HANDOVER CONTRACT v1 — W3-CP3
// Blue Repair Overlay and I-002 v2.4 (named by the slice brief; not lock pins). RC-02 (foreign facts are referenced, never
// copied) and RC-13.
import { describe, expect, it } from "vitest";
import {
  EXISTING_ACTOR_COMPILATION,
  canonicalJson,
  ExistenceContractSchema,
  ExistingActorCompilationSchema,
  ExistingActorSourcePinSchema,
} from "@immortalis/contracts";
import { fixtureContract } from "@immortalis/testkit";
import { actorBasisPin, existingActorContract } from "../support/existing-actor.ts";

const valid = () => ({
  classification: EXISTING_ACTOR_COMPILATION,
  source_state: [actorBasisPin()],
});
const parses = (v: unknown) => ExistingActorCompilationSchema.safeParse(v).success;

describe("the classification is the only distinction, and it is strict", () => {
  it("a fresh Player Character's contract is unchanged: no field, the same serialization, the same value", () => {
    const fresh = fixtureContract();
    const parsed = ExistenceContractSchema.parse(fresh);
    expect("existing_actor_compilation" in parsed).toBe(false);
    expect(canonicalJson(parsed)).toBe(canonicalJson(fresh));
    expect(
      ExistenceContractSchema.safeParse({ ...fresh, existing_actor_compilation: null }).success,
    ).toBe(false);
  });

  it("an existing-actor compilation is an Existence Contract carrying the one explicit classification and its source pins", () => {
    const contract = existingActorContract();
    expect(ExistenceContractSchema.safeParse(contract).success).toBe(true);
    expect(contract.existing_actor_compilation).toEqual(valid());
    expect(EXISTING_ACTOR_COMPILATION).toBe("EXISTING_ACTOR_COMPILATION");
  });

  it("the classification names exactly one literal: no other classification, mode or third value can be stated", () => {
    for (const classification of [
      "DEFERRED",
      "ACTIVE-LIMITED",
      "ACTIVE",
      "FRESH_GENERATION",
      "existing_actor_compilation",
      "",
      null,
      undefined,
      1,
    ])
      expect(parses({ ...valid(), classification }), String(classification)).toBe(false);
    expect(parses({ source_state: [actorBasisPin()] })).toBe(false);
  });

  it("at least one pinned source is required, each exactly once at a committed version", () => {
    expect(parses({ ...valid(), source_state: [] })).toBe(false);
    expect(parses({ classification: EXISTING_ACTOR_COMPILATION })).toBe(false);
    expect(parses({ ...valid(), source_state: [actorBasisPin(), actorBasisPin()] })).toBe(false);
    expect(parses({ ...valid(), source_state: [actorBasisPin(undefined, undefined, 0)] })).toBe(
      false,
    );
    expect(parses({ ...valid(), source_state: [actorBasisPin(undefined, undefined, 1.5)] })).toBe(
      false,
    );
    expect(
      parses({
        ...valid(),
        source_state: [actorBasisPin(), actorBasisPin(undefined, "capability-other")],
      }),
    ).toBe(true);
  });

  it("a source pin is an exact reference — owner, key, version — and carries no copy of the foreign owner's state", () => {
    const pin = actorBasisPin();
    expect(ExistingActorSourcePinSchema.safeParse(pin).success).toBe(true);
    for (const extra of [
      { value: { marker: "C" } },
      { marker: "C" },
      { facts: [] },
      { statement: "copied" },
      { actor_state: {} },
    ])
      expect(ExistingActorSourcePinSchema.safeParse({ ...pin, ...extra }).success).toBe(false);
    for (const missing of ["owner", "fact_key", "version"])
      expect(
        ExistingActorSourcePinSchema.safeParse(
          Object.fromEntries(Object.entries(pin).filter(([k]) => k !== missing)),
        ).success,
      ).toBe(false);
  });

  it("no binding mode, readiness condition, score, timer, scheduler or handover record can be stated on the compilation", () => {
    for (const extra of [
      { binding_mode: "DEFERRED" },
      { binding_mode: "ACTIVE-LIMITED" },
      { readiness_condition: "x" },
      { agency_score: 3 },
      { deadline: "2026-01-01" },
      { schedule: "weekly" },
      { handover: { to: "role.player_character" } },
      { prior_owner: "named_actor" },
      { capability_carry_forward: [] },
      { owner_state: {} },
    ]) {
      expect(parses({ ...valid(), ...extra }), JSON.stringify(extra)).toBe(false);
      expect(
        ExistenceContractSchema.safeParse({
          ...existingActorContract(),
          existing_actor_compilation: { ...valid(), ...extra },
        }).success,
      ).toBe(false);
    }
    // nor beside the compilation, on the contract itself
    for (const extra of [
      { binding_mode: "DEFERRED" },
      { handover: {} },
      { prior_owner: "named_actor" },
    ])
      expect(
        ExistenceContractSchema.safeParse({ ...existingActorContract(), ...extra }).success,
      ).toBe(false);
  });

  it("the rest of the Existence Contract is untouched: strict, released-only, six-part minimum", () => {
    const c = existingActorContract();
    for (const missing of [
      "identity_agency",
      "contact",
      "embodiment_topology",
      "continuity_rule",
      "baseline_exception",
      "entry_envelope",
      "release",
    ])
      expect(
        ExistenceContractSchema.safeParse(
          Object.fromEntries(Object.entries(c).filter(([k]) => k !== missing)),
        ).success,
        missing,
      ).toBe(false);
    expect(
      ExistenceContractSchema.safeParse({ ...c, release: { ...c.release, status: "DRAFT" } })
        .success,
    ).toBe(false);
  });
});
