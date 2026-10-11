/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit arbitrary fact values */
// Active-PC Post-Handover Physical Locus Custody — the single rule, by identity, against the committed facts of a real handed-over
// campaign (no mocks of the owners): the same function admission and load verification apply.
import { describe, expect, it } from "vitest";
import {
  EXISTING_ACTOR_HANDOVER,
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldPcLocusCustodyKey,
  type OwnerFact,
  type PcPhysicalLocusCustody,
} from "@immortalis/contracts";
import { fixtureInsertionFact } from "@immortalis/testkit";
import { derivePcPhysicalLocusCustody, pcPhysicalLocusCustodyViolation } from "@immortalis/engine";
import { PC, custodyKey, handedOverCampaign } from "../support/pc-locus-custody.ts";

async function setup() {
  const s = await handedOverCampaign();
  const facts = new Map<string, OwnerFact>(
    s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f)]),
  );
  const derived = derivePcPhysicalLocusCustody(PC, s.campaign.store);
  if (!derived.ok) throw new Error(derived.error.message);
  const custody: PcPhysicalLocusCustody = derived.value;
  const judge = (c: PcPhysicalLocusCustody = custody, m: Map<string, OwnerFact> = facts) =>
    pcPhysicalLocusCustodyViolation(custodyKey(), c, m);
  return { facts, custody, judge };
}

describe("pcPhysicalLocusCustodyViolation", () => {
  it("holds for the record the completed handover determines", async () => {
    const { judge, custody } = await setup();
    expect(judge()).toBeNull();
    expect(custody.basis.established_from).toBe(EXISTING_ACTOR_HANDOVER);
  });

  it("is at the slot derived from the PC identity", async () => {
    const { custody } = await setup();
    expect(
      pcPhysicalLocusCustodyViolation(worldPcLocusCustodyKey("other"), custody, new Map()),
    ).toMatch(/slot derived from its PC identity/);
  });

  it("needs a committed active binding that names this PC", async () => {
    const { facts, judge, custody } = await setup();
    const none = new Map(facts);
    none.delete(PLAYER_CHARACTER_BINDING_KEY);
    expect(judge(custody, none)).toMatch(/no active PC binding/);
    const other = structuredClone(facts.get(PLAYER_CHARACTER_BINDING_KEY)!);
    (other.value as any).active_pc.entity_id = "actor-other";
    expect(judge(custody, new Map(facts).set(PLAYER_CHARACTER_BINDING_KEY, other))).toMatch(
      /names this very PC identity/,
    );
  });

  it("is lawful only after the completed handover: a first ACTIVATION binding is refused", async () => {
    const { facts, judge, custody } = await setup();
    const activation = structuredClone(facts.get(PLAYER_CHARACTER_BINDING_KEY)!);
    (activation.value as any).transition = {
      type: "ACTIVATION",
      basis: { ...fixtureInsertionFact(), pinned_versions: { pc: 1, world: 1, locus: 1 } },
    };
    (activation.value as any).intrinsic_authority_migration = [];
    expect(judge(custody, new Map(facts).set(PLAYER_CHARACTER_BINDING_KEY, activation))).toMatch(
      /only after the completed Existing-Actor → PC handover/,
    );
  });

  it("re-judges the handover itself: a binding whose consumed coupling or contract is gone or stale fails", async () => {
    const { facts, judge, custody } = await setup();
    const noCoupling = new Map(facts);
    noCoupling.delete(worldActorCouplingKey(PC));
    expect(judge(custody, noCoupling)).toMatch(/the handover does not hold/);
    const noContract = new Map(facts);
    noContract.delete(pcExistenceContractKey(PC));
    expect(judge(custody, noContract)).toMatch(/the handover does not hold/);
    const moved = structuredClone(facts.get(worldActorCouplingKey(PC))!);
    (moved.value as any).coupling.locus.entity_id = "locus-x";
    expect(judge(custody, new Map(facts).set(worldActorCouplingKey(PC), moved))).toMatch(
      /the handover does not hold/,
    );
  });

  it("pins the exact current versions of the contract, binding, coupling, world and locus", async () => {
    const { judge, custody } = await setup();
    for (const pin of ["pc", "binding", "coupling", "world", "locus"] as const) {
      const stale = structuredClone(custody);
      (stale.basis.pinned_versions as Record<string, number>)[pin]! += 1;
      expect(judge(stale), pin).toMatch(/not established against the committed/);
    }
  });

  it("states exactly the consumed coupling's locus, never another", async () => {
    const { judge, custody } = await setup();
    const elsewhere = structuredClone(custody);
    elsewhere.stationary_locus.locus = { fact_key: "world/w/locus/x", entity_id: "x" };
    expect(judge(elsewhere)).not.toBeNull();
  });

  it("refuses an identity that is already represented by another current-locus authority", async () => {
    const { facts, judge, custody } = await setup();
    const world = custody.stationary_locus.world.entity_id;
    const any = [...facts.values()][0]!;
    for (const key of [
      `world/${world}/entity/${PC}`,
      `world/${world}/entity/${PC}/transition`,
      `logistics/commitment/${world}/${PC}`,
      `logistics/transfer/${world}/${PC}`,
    ])
      expect(judge(custody, new Map(facts).set(key, { ...any, key })), key).toMatch(
        /another current-locus authority/,
      );
  });
});

describe("derivePcPhysicalLocusCustody", () => {
  it("is a pure function of the committed facts: the same facts give the same record", async () => {
    const s = await handedOverCampaign();
    const a = derivePcPhysicalLocusCustody(PC, s.campaign.store);
    const b = derivePcPhysicalLocusCustody(PC, s.campaign.store);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
  });

  it("invents nothing: no binding, no coupling or another identity yields PREREQUISITE_MISSING", async () => {
    const s = await handedOverCampaign();
    for (const id of ["actor-nobody", "actor-other"]) {
      const r = derivePcPhysicalLocusCustody(id, s.campaign.store);
      expect(!r.ok && r.error.code).toBe("PREREQUISITE_MISSING");
    }
  });
});
