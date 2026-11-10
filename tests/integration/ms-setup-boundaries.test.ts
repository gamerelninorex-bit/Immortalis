/* eslint-disable @typescript-eslint/no-explicit-any -- falsifying sealed source/value mutations */
import { describe, it, expect } from "vitest";
import {
  actorBoundaryViolation,
  msActorEligibility,
  msActorGroupCheck,
  msR1GroupCheck,
  msPrefixViolation,
  resolveKey,
  type CampaignState,
} from "@immortalis/engine";
import {
  pcExistenceContractKey,
  populationLedgerKey,
  TEMPORAL_STATE_KEY,
  MS_CONSTRAINT_PATH,
  type OwnerFact,
} from "@immortalis/contracts";
import { fixtureContract } from "@immortalis/testkit";
import { msHarness } from "../support/ms-setup.ts";

const replace = (state: CampaignState, fact: OwnerFact): CampaignState => ({
  ...state,
  facts: new Map(state.facts).set(fact.key, fact),
});

describe("MS source, identity, inventory and time boundary falsifiers", () => {
  it("refuses wrong actual Grant, indexed origin and an actor-forbidding restriction before Completion", async () => {
    const h = await msHarness();
    const t = h.trace.find(
      (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "initial_locality_completion",
    )!;
    const c = structuredClone(t.group.writes[0]!.value) as any;
    expect(msActorEligibility(t.before, c)).toBeNull();
    for (const origin of ["ACTOR_DECISION", "WORLD_COMPLETION", "ENGINE_DERIVED"]) {
      const wrong = structuredClone(c);
      wrong.selection.provenance.find((p: any) => p.path === MS_CONSTRAINT_PATH).origin = origin;
      expect(msActorEligibility(t.before, wrong), origin).toMatchObject({ code: "MS_ACTOR_SCOPE" });
    }
    for (const field of ["fact_key", "version"]) {
      const wrong = structuredClone(c);
      const p = wrong.selection.provenance.find((p: any) => p.path === MS_CONSTRAINT_PATH);
      p.grant[field] = field === "version" ? 2 : "wrong-grant";
      expect(msActorEligibility(t.before, wrong), field).toMatchObject({ code: "MS_ACTOR_SCOPE" });
    }
    const grant = structuredClone(t.before.facts.get(c.grant.fact_key)!);
    (grant.value as any).restrictions = [
      { predicate: "NO_NON_PC_ACTORS", evidence_quote: "SYNTHETIC FIXTURE: no actors" },
    ];
    expect(msActorEligibility(replace(t.before, grant), c)).toMatchObject({
      code: "MS_ACTOR_SCOPE",
    });
    const missing = { ...t.before, facts: new Map(t.before.facts) };
    missing.facts.delete(c.grant.fact_key);
    expect(msActorEligibility(missing, c)).toMatchObject({ code: "MS_ACTOR_SCOPE" });
    await h.campaign.close();
  });

  it("refuses an occupied actor spelling, PC identity and Population aggregate independently of the generic fence", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const t = h.trace.find(
      (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "named_actor_existence_basis",
    )!;
    const b1 = h.trace.find(
      (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "actor_setup_placement",
    )!;
    const actor = (t.group.writes[0]!.value as any).actor_id;
    expect(msActorGroupCheck(t.group, t.before)).toBeNull();
    const occupied = b1.after.facts.get(b1.group.writes[0]!.key)!;
    expect(msActorGroupCheck(t.group, replace(t.before, occupied))).toMatchObject({
      details: { reason: "MS_ACTOR_COLLISION" },
    });
    for (const [key, value] of [
      [pcExistenceContractKey(actor), fixtureContract({ pc_id: actor })],
      [populationLedgerKey(actor), {}],
    ] as const) {
      const kind = resolveKey(key)!.kind;
      const collision = {
        ...occupied,
        key,
        value,
        owner: kind.owner,
        facet: kind.facet,
        provenance: { ...occupied.provenance, rule: kind.rule },
      };
      const state = replace(t.before, collision);
      expect(actorBoundaryViolation(state.facts, actor), key).not.toBeNull();
      expect(msActorGroupCheck(t.group, state), key).not.toBeNull();
    }
    await h.campaign.close();
  });

  it("refuses B1 source owner/key/version substitutions, forged existence proof and incomplete or extra closure inventories", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const get = (kind: string) =>
      h.trace.find((t) => resolveKey(t.group.writes[0]!.key)?.kind.id === kind)!;
    const b1 = get("actor_setup_placement"),
      closure = get("world_setup_closure"),
      existence = get("named_actor_existence_basis");
    for (const [field, value] of [
      ["owner", "pc_existence"],
      ["fact_key", "named-actor/foreign/existence-basis"],
      ["version", 2],
    ] as const) {
      const group = structuredClone(b1.group);
      (group.writes[0]!.value as any).actor_state[0][field] = value;
      expect(msR1GroupCheck(group, b1.before), field).not.toBeNull();
    }
    const proof = structuredClone(existence.group);
    (proof.writes[0]!.value as any).source_proof.proof_hash = "f".repeat(64);
    expect(msActorGroupCheck(proof, existence.before)).not.toBeNull();
    for (const placements of [
      [],
      [{ fact_key: "world-state/actor/foreign/setup-placement", version: 1 }],
    ]) {
      const group = structuredClone(closure.group);
      (group.writes[0]!.value as any).placements = placements;
      expect(msR1GroupCheck(group, closure.before)).not.toBeNull();
    }
    const extra = structuredClone(closure.before.facts.get(b1.group.writes[0]!.key)!);
    extra.key = "world-state/actor/foreign/setup-placement";
    (extra.value as any).actor_id = "foreign";
    expect(msR1GroupCheck(closure.group, replace(closure.before, extra))).not.toBeNull();
    await h.campaign.close();
  });

  it("refuses foreign or unknown prefix facts, extra B2 inventory and a clock advanced beyond captured t0", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const b2 = h.trace.find(
      (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "actor_physical_presence",
    )!;
    const input = h.trace.find(
      (t) => resolveKey(t.group.writes[0]!.key)?.kind.id === "initial_setup_input",
    )!.group.writes[0]!.value as any;
    const sample = b2.before.facts.values().next().value!;
    for (const key of ["unregistered/foreign", "world/foreign/profile"]) {
      const extra = { ...sample, key };
      const state = replace(b2.before, extra);
      expect(msPrefixViolation(state.facts, input, "B2"), key).not.toBeNull();
      expect(msR1GroupCheck(b2.group, state), key).not.toBeNull();
    }
    const extra = structuredClone(b2.after.facts.get(b2.group.writes[0]!.key)!);
    extra.key = "world-state/actor/foreign/presence";
    (extra.value as any).actor_id = "foreign";
    expect(msR1GroupCheck(b2.group, replace(b2.before, extra))).not.toBeNull();
    const time = structuredClone(b2.before.facts.get(TEMPORAL_STATE_KEY)!);
    time.version++;
    (time.value as any).canonical_time.value++;
    expect(msR1GroupCheck(b2.group, replace(b2.before, time))).not.toBeNull();
    await h.campaign.close();
  });
});
