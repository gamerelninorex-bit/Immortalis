/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// The ORIGINAL-CAMPAIGN BOOTSTRAP and the first consequential loop, driven by the shipped operator commands only — NO testkit owner
// setup, no direct adapter call to establish anything: initialize-time (the author's starting chronology) → prepare-collection (an
// accepted claim projected, an empty Reserve, the physical basis) → declare-closed-setting (the author's closed domain; the owners
// derive the coverage) → attest-cycle → collect → collect-continue → collect-finish → the receipt → reopen → another choice.
//
// WHAT THIS IS NOT: the referee and every console line are SCRIPTED by this test (plumbing only). It proves the mechanism, the
// ordering and the falsifying negatives; it is NOT a real player's choice, NOT a real GM's reading, and NOT First Playable evidence.
// A real transcript needs the Sovereign/player at the console and a connected GM through the authenticated exchange.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PcCollectionAdapter, type CanonicalCampaign } from "@immortalis/engine";
import {
  attestCycle,
  collect,
  collectContinue,
  collectFinish,
  declareClosedSetting,
  initializeTime,
  pcTargetAdvance,
  prepareCollection,
} from "@immortalis/operator";
import {
  ACCESS,
  LOCALITY_CAMPAIGN,
  LOCUS_ID,
  SOURCE_KEY,
  SOURCE_UNIT,
  WORLD_ID,
  openOrdinary,
} from "../support/locality.ts";
import { BASIS, PC_ID, PC_WORDS, observationCampaign } from "../support/observation.ts";
import {
  ACTUATOR_WORDS,
  TRAVERSAL_CANNOT,
  cycleAnswer,
  cycleWords,
  hostAnswer,
} from "../support/pc-collection.ts";
import { SALT, SALT_TAU, TAU_UNIT, decideOutcome } from "../support/pc-collection-original.ts";
import { ctxOf, fixedIds, openSession, scriptedTerminal } from "../support/operator.ts";

const fileOf = (c: unknown, mode = 0o600): string => {
  const path = join(mkdtempSync(join(tmpdir(), "immortalis-bootstrap-")), "setup.json");
  writeFileSync(path, JSON.stringify(c));
  chmodSync(path, mode);
  return path;
};
const chronology = {
  format: "immortalis-starting-chronology",
  format_version: 1,
  time: { unit: BASIS.unit, value: BASIS.value },
  statement: "SYNTHETIC FIXTURE: the morning the salt crew first reached the pans",
};
const preparation = {
  format: "immortalis-collection-preparation",
  format_version: 1,
  mechanism: {
    pc_id: PC_ID,
    mechanism_id: SALT.mechanism,
    claims: [{ section: "embodiment_topology", index: 0 }],
    actuator: { statement: ACTUATOR_WORDS },
    traversal: { statement: TRAVERSAL_CANNOT },
    cycle_duration: TAU_UNIT,
    cycle_quote: cycleWords(TAU_UNIT),
  },
  extraction_basis: {
    basis_id: SALT.basis,
    world_id: WORLD_ID,
    source_key: SOURCE_KEY,
    material_class: SALT.material,
    unit: SOURCE_UNIT,
    relies_on: { ...ACCESS },
  },
  reserve: {
    reserve_id: SALT.reserve,
    material_class: SALT.material,
    quantity: { amount: 0, unit: SOURCE_UNIT },
    condition: "dry",
    world_id: WORLD_ID,
    locus_id: LOCUS_ID,
  },
};
const declaration = {
  format: "immortalis-closed-setting-declaration",
  format_version: 1,
  world_id: WORLD_ID,
  locus_id: LOCUS_ID,
  domain: {
    designation: "SYNTHETIC FIXTURE: the salt pans",
    topology: "SYNTHETIC FIXTURE: one pan ringed by cliffs; no passage in or out",
  },
  closure: {
    statement:
      "SYNTHETIC FIXTURE: nothing else acts on the pans beyond what the owners cover; no autonomous process is declared.",
  },
  source_rights: [
    {
      source_key: SOURCE_KEY,
      ground:
        "SYNTHETIC FIXTURE: the loose salt on the pans is held by no one; no claim on it is established.",
    },
  ],
  workforce_scope: {
    statement:
      "SYNTHETIC FIXTURE: the representations held, if any, are all that account workforce for the pans.",
  },
};
const INPUT = (amount: number) => ({
  source: { world_id: WORLD_ID, source_key: SOURCE_KEY },
  reserve_id: SALT.reserve,
  quantity: { amount, unit: SOURCE_UNIT },
  mechanism_id: SALT.mechanism,
  basis_id: SALT.basis,
});
const gm = async (task: Parameters<typeof hostAnswer>[0]) =>
  hostAnswer(task, "OPEN", "NOT_AT_ISSUE");
const cycleHost = async (task: any) => cycleAnswer(task);
const amountOf = (c: CanonicalCampaign) =>
  (c.store.getFact(`world/${WORLD_ID}/source/${SOURCE_KEY}`)!.value as any).recoverable.amount;
const reserveOf = (c: CanonicalCampaign) =>
  (c.store.getFact(`production/reserve/${SALT.reserve}`)!.value as any).quantity.amount;
const open = (dirs: { campaignDir: string; operatorDir: string }) =>
  openSession(dirs, { expectedCampaignId: LOCALITY_CAMPAIGN });

describe("the original-campaign bootstrap and the first consequential loop, by the shipped commands only", () => {
  it("a campaign begins with NO canonical time; every step is a separate, confirmed, owner-derived act; the loop then runs to a conserved, observable consequence and survives reopen", async () => {
    const embodiment = `${PC_WORDS.embodiment}; ${ACTUATOR_WORDS}; ${cycleWords(TAU_UNIT)}; ${TRAVERSAL_CANNOT}`;
    const { dirs } = await observationCampaign({ time: false, words: { embodiment } });
    const s = await open(dirs);
    const head = () => s.campaign.store.head().state_sha256;
    const confirm = (id: string) => ctxOf(s, scriptedTerminal("confirm"), fixedIds(id));

    // 0. nothing can be prepared or declared without the origin of time; nothing is written
    const begin = head();
    expect((await prepareCollection(confirm("p0"), fileOf(preparation))).status).toBe(
      "UNAVAILABLE",
    );
    expect((await declareClosedSetting(confirm("d0"), fileOf(declaration))).status).toBe(
      "UNAVAILABLE",
    );
    expect(head()).toBe(begin);

    // 1. the author states the starting chronology, once
    expect((await initializeTime(confirm("t0"), fileOf(chronology))).status).toBe(
      "TIME_ESTABLISHED",
    );

    // 2. the physical preparation (an accepted claim projected, an EMPTY reserve, the basis): no material, no right, no scene
    expect((await prepareCollection(confirm("p1"), fileOf(preparation))).status).toBe(
      "COLLECTION_COMMITTED",
    );
    expect(reserveOf(s.campaign)).toBe(0);
    expect(amountOf(s.campaign)).toBe(120);

    // 3. the exact act is not offered until the cycle is attested; nothing is asked of the player
    const unattested = scriptedTerminal("confirm");
    expect((await collect(ctxOf(s, unattested, fixedIds("c0")), INPUT(3))).status).toBe(
      "UNAVAILABLE",
    );
    expect(unattested.asked()).toBe(0);
    expect(
      (
        await attestCycle(
          { ...ctxOf(s, scriptedTerminal()), attestHost: cycleHost },
          { mechanism_id: SALT.mechanism },
        )
      ).status,
    ).toBe("COLLECTION_COMMITTED");

    // 4. the player's own confirmed attempt is committed (a willingness only)…
    expect((await collect(confirm("c1"), INPUT(3))).status).toBe("COLLECTION_COMMITTED");
    // …but with no closed-setting declaration the scene is not established: the reading is never asked for, nothing starts
    const before = head();
    expect((await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost: gm })).status).toBe(
      "UNAVAILABLE",
    );
    expect(head()).toBe(before);
    expect(new PcCollectionAdapter(s.campaign.store).hold(PC_ID)).toEqual({ state: "NONE" });

    // 5. the author declares the setting closed; the owners derive what it covers
    expect((await declareClosedSetting(confirm("d1"), fileOf(declaration))).status).toBe(
      "SETTING_DECLARED",
    );
    const adapter = new PcCollectionAdapter(s.campaign.store);
    const closure = adapter.sceneClosure(WORLD_ID, LOCUS_ID)!.value;
    expect(closure.covered.pcs).toEqual([PC_ID]);
    expect(closure.covered.actors).toEqual([]);
    expect(closure.covered.population_ledgers).toEqual([]);
    // an identical re-declaration is recognised as current: nothing is written, no new version re-opens anything
    const declared = head();
    expect((await declareClosedSetting(confirm("d2"), fileOf(declaration))).status).toBe(
      "SETTING_DECLARED",
    );
    expect(head()).toBe(declared);

    // 6. now the reading is asked for and Production starts the work
    expect((await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost: gm })).status).toBe(
      "COLLECTION_COMMITTED",
    );
    expect(adapter.hold(PC_ID)).toMatchObject({ state: "IN_FLIGHT" });
    expect(amountOf(s.campaign)).toBe(120);

    // 7. while the work is pending the arbitrary-target route refuses WHATEVER horizon is asked
    for (const value of [
      BASIS.value + 1,
      BASIS.value + 3 * SALT_TAU - 1,
      BASIS.value + 3 * SALT_TAU,
      BASIS.value + 10_000,
    ]) {
      const t = scriptedTerminal("confirm");
      expect(
        (
          await pcTargetAdvance(ctxOf(s, t, fixedIds(`h${value}`)), {
            target: { unit: BASIS.unit, value },
          })
        ).status,
      ).toBe("UNAVAILABLE");
      expect(t.asked()).toBe(0);
    }

    // 8. the player's separately confirmed FINISH: no horizon, the target derived from the admitted work
    const finish = scriptedTerminal("confirm");
    expect((await collectFinish(ctxOf(s, finish, fixedIds("f1")))).status).toBe(
      "PC_TARGET_ADVANCE_COMMITTED",
    );
    expect(finish.said.join("\n")).toContain(`${BASIS.value + 3 * SALT_TAU} ${BASIS.unit}`);
    expect(amountOf(s.campaign)).toBe(117);
    expect(reserveOf(s.campaign)).toBe(3);
    await s.close();

    // 9. canonical truth alone is not knowledge: the character learns of the gathering only through the direct-perception receipt
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.store.listFacts().filter((f) => f.key.startsWith("access/"))).toEqual([]);
      expect(amountOf(c)).toBe(117);
      const d = await decideOutcome(c, { of: "outcome" });
      expect(d.recorded.ok, JSON.stringify(d.recorded)).toBe(true);
      expect(d.context.facts.map((f) => f.fact_id)).toContain("outcome.collection");
    } finally {
      await c.close();
    }

    // 10. reopen: the consequence is durable, and the PC's NEXT choice meets the real remainder (Production alone decides scarcity)
    const r = await open(dirs);
    expect(amountOf(r.campaign)).toBe(117);
    expect(reserveOf(r.campaign)).toBe(3);
    expect(
      (await collect(ctxOf(r, scriptedTerminal("confirm"), fixedIds("c2")), INPUT(118))).status,
    ).toBe("COLLECTION_COMMITTED");
    expect((await collectContinue({ ...ctxOf(r, scriptedTerminal()), reachHost: gm })).status).toBe(
      "UNAVAILABLE",
    );
    expect(amountOf(r.campaign)).toBe(117);
    expect(reserveOf(r.campaign)).toBe(3);
    await r.close();
  }, 300_000);
});
