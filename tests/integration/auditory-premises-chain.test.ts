/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// S1-P1 — the paired W1/W2 source-premise chain: the positive witnesses, built ONLY through real owner admission from raw physical
// source facts. Nothing here (and nothing a fixture can do) asserts the read's output, an individual perception, a Health
// availability or a "can hear" flag; the answer is derived by the pure read from what the owners committed.
import { describe, expect, it } from "vitest";
import {
  actorPhysicalPresenceKey,
  actorSetupPlacementKey,
  comparePlacementPins,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
} from "@immortalis/contracts";
import { ALL_FACT_KINDS, resolveKey } from "@immortalis/engine";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import {
  A,
  EMISSION_KEY,
  L,
  RAW_KEY,
  W,
  commitEmission,
  commitRaw,
  evaluate,
  fullChain,
  p1Chain,
  p1Scene,
  rawPins,
  rawSensoryValue,
} from "../support/auditory-premises.ts";

describe("the lawful chain", () => {
  it("commits profile, B1, closure, clock, B2, W1 and emission through real admission and the pure read returns the proposal only", async () => {
    const s = await p1Scene(tempDir());
    await p1Chain(s);
    expect(s.campaign.verify()).toEqual([]);
    const r = evaluate(s);
    expect(r.result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    if (r.result !== "SOURCE_PREMISES_READY_FOR_HEALTH") throw new Error("unreachable");
    expect(r.next_required).toBe("HEALTH_SENSORY_FUNCTION_CLOSE");
    expect(r.premises.raw_sensory).toEqual({ fact_key: RAW_KEY, version: 1 });
    expect(s.campaign.store.getFact(RAW_KEY)!.version).toBe(1);
    expect(s.campaign.store.getFact(EMISSION_KEY)!.version).toBe(1);
  });

  it("the producer lifecycle is strictly ordered in the journal: profile, B1, closure, clock, B2, W1, emission", async () => {
    const s = await p1Scene(tempDir());
    await p1Chain(s);
    const at = (key: string) =>
      s.campaign.store.lookupReceipt(s.campaign.store.getFact(key)!.provenance.intent_id)!.revision;
    const order = [
      worldLocusKey(W, L),
      actorSetupPlacementKey(A),
      worldSetupClosureKey(W),
      "temporal/state",
      actorPhysicalPresenceKey(A),
      RAW_KEY,
      EMISSION_KEY,
    ].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });

  it("accepts the premises in natural order and with the actor's own setup placement and the world's closure also named", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    const pin = (k: string) => ({ fact_key: k, version: s.campaign.store.getFact(k)!.version });
    const natural = [
      pin(worldProfileKey(W)),
      pin(worldLocusKey(W, L)),
      pin(actorPhysicalPresenceKey(A)),
      pin(actorSetupPlacementKey(A)),
      pin(worldSetupClosureKey(W)),
    ];
    // not the canonical key order: the order is not significant
    expect(natural).not.toEqual([...natural].sort(comparePlacementPins));
    const store = s.campaign.store;
    const all = [...rawPins(), actorSetupPlacementKey(A), worldSetupClosureKey(W)];
    const reads = all.map((key) => ({ key, version: store.getFact(key)!.version }));
    const depends_on = [...new Set(all.map((k) => store.getFact(k)!.provenance.group_id))];
    // naming a premise the group does not read is refused: a named premise is read and depended on like any other pin
    const unread = await commitRaw(s, { dependency_refs: natural });
    expect(!unread.ok && unread.error.message).toMatch(/must read a named physical premise/);
    await must(commitRaw(s, { dependency_refs: natural }, A, L, { reads, depends_on }));
    await must(commitEmission(s));
    expect(evaluate(s).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the physical-form statement and its provenance are the owner's raw authorship: a different statement gives the same positive", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    await must(
      commitRaw(s, {
        physical_form_statement:
          "A hill-born body: wide-set ears, broad auditory canals and an unusually thick inner-ear bone, all intact.",
        source_provenance:
          "World-State fallback custodian, as authored in the setting's anatomy notes.",
      }),
    );
    await must(commitEmission(s));
    expect(evaluate(s).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    expect((s.campaign.store.getFact(RAW_KEY)!.value as any).modality).toBe("AIRBORNE_HEARING");
    void rawSensoryValue;
  });
});

describe("nothing else is produced: no observation, epistemic event, receipt, packet, Health fact or player state", () => {
  const ALLOWED = [
    "actor_physical_presence",
    "actor_raw_sensory_state",
    "actor_setup_placement",
    "named_actor_capability_basis",
    "temporal_state",
    "world_acoustic_emission",
    "world_locus",
    "world_profile",
    "world_setup_closure",
  ];

  it("the committed fact kinds of the whole positive chain are exactly the nine physical and setup kinds", async () => {
    const s = await p1Scene(tempDir());
    await p1Chain(s);
    evaluate(s);
    const kinds = [
      ...new Set(s.campaign.store.listFacts().map((f) => resolveKey(f.key)!.kind.id)),
    ].sort();
    expect(kinds).toEqual(ALLOWED);
    for (const k of kinds)
      expect(k, "no epistemic, referee, binding, PC, Health or culture kind").not.toMatch(
        /^(epistemic|referee|player_character|pc_|culture|health|kti|economy|logistics|population|production)/,
      );
  });

  it("no registered kind can state a Health condition, an access event or a receipt on the P1 owners' behalf", () => {
    const mine = ALL_FACT_KINDS.filter(
      (k) => k.id === "actor_raw_sensory_state" || k.id === "world_acoustic_emission",
    );
    expect(mine.map((k) => [k.id, k.owner])).toEqual([
      ["actor_raw_sensory_state", "world_state"],
      ["world_acoustic_emission", "world_state"],
    ]);
    expect(ALL_FACT_KINDS.filter((k) => /health/i.test(k.id))).toEqual([]);
  });

  it("a second actor-free read of the same chain stays the one positive and creates nothing", async () => {
    const s = await p1Scene(tempDir());
    await p1Chain(s);
    const n = s.campaign.store.listFacts().length;
    for (let i = 0; i < 3; i++) expect(evaluate(s).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    expect(s.campaign.store.listFacts().length).toBe(n);
  });
});
