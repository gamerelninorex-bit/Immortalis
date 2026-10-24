/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records and the delivered context */
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. It reproduces the SHAPE of the 24 October Render trial (an ordinary-shorthand human, an
// ordinary workshop scene, one finite loose source, one completed gathering) in a fresh, separate campaign built by the shipped paths, and
// pins what the observation question then DELIVERS to the referee host. The "host" is a script (PLUMBING ONLY; not an AI, not a game
// master's judgment); the trial's own campaign and its retained reading are not touched or read.
//
// What it pins is the TEXT delivered: the character's accepted words are the shorthand alone, the confirmed placement states neither a
// facing nor open eyes, and the scene's prose states no light, air, path or appearance, so the only consequence of the gathering is the
// mechanical sentence that it was completed. The keyword checks below are a pin of those delivered words; they do NOT claim that the absence
// of a keyword is the absence of a meaning (I-002 section 10 lets a source-grounded reading take an ordinary human's vision as strongly
// entailed by a baseline-human statement, and nothing here decides what a real host reads). What a real host reads of these words is not
// shown by this file. The scripted policy used in the second test is lexical and is NOT an authority on what a faithful host must derive.
// Position (a facing, open eyes), path and appearance have no delivered statement in this shape, so whatever the host takes of the
// faculty, a positive is not resting on them; the scripted outcome is the non-receipt, retained at that basis and not asked again. The
// repair for such a SAVED campaign is not in this file (its world, locus, contract and placement are sealed); the explicit campaigns of
// pc-collection-perception.test.ts and observation-foundation.test.ts are ONE constructive witness of a positive, not a required schema.
import { describe, expect, it } from "vitest";
import { RefereeAdjudicationAdapter, verifyEpistemicIntegrity } from "@immortalis/engine";
import { openOrdinary, SOURCE_KEY, WORLD_ID } from "../support/locality.ts";
import {
  BASIS,
  PC_ID,
  PC_WORDS,
  observationAnswer,
  observe,
  verbConsole,
} from "../support/observation.ts";
import { plainPolicy } from "../support/original-pc.ts";
import {
  SALT,
  SALT_TAU,
  collectAndComplete,
  originalCollectionCampaign,
} from "../support/pc-collection-original.ts";

const BOUNDARY = { unit: BASIS.unit, value: BASIS.value + 3 * SALT_TAU };

// the trial's inputs: ordinary shorthand and ordinary workshop prose that states no light, air, path or appearance
const SHORTHAND_BODY = "One ordinary human body";
const LAYOUT =
  "A single timber shed about eight paces by five, with a packed-earth floor, a long workbench along one wall and a door in the opposite wall.";
const STOCK = "The shed's loose salt lies in one unbagged heap at the foot of the workbench.";
const trialScene = (doc: any) => {
  doc.locus.designation = "A salt shed beside the pans";
  doc.locus.constraints = [
    { aspect: "layout", statement: LAYOUT },
    { aspect: "stock", statement: STOCK },
  ];
};

// keyword pins of the DELIVERED TEXT only (see the header): not a statement about what the words mean
const SIGHT_WORDS = /\b(sight|sighted|vision|see|sees|seeing|eye|eyes)\b/i;
const FACING_OR_EYES = /\b(facing|faces|eye|eyes)\b/i;
const EXPOSURE_ASPECTS = /^(light|air|path|surface|appearance|colou?r)\b/i;

async function reading<T>(dirs: { campaignDir: string }, fn: (c: any) => Promise<T> | T) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}

describe("MECHANISM: a campaign authored the way the Render trial describes is delivered a question whose words state no facing, eyes, light, air, path or appearance; with a scripted host the result is the retained non-receipt", () => {
  it("delivers no statement that uses a sight keyword, states a facing or eyes, or states a light, air, path or appearance - only the mechanical sentence that the gathering was completed", async () => {
    const { dirs } = await originalCollectionCampaign({
      scene: trialScene,
      body: SHORTHAND_BODY,
      presence: PC_WORDS.presenceBare,
    });
    await reading(dirs, async (c) => {
      await collectAndComplete(c, "act-1", 3, "tx-collect-1", BOUNDARY);
      const task = new RefereeAdjudicationAdapter(c.store).observationTask({
        pc_id: PC_ID,
        attempt: 0,
      });
      expect(task.ok, JSON.stringify(task)).toBe(true);
      const ctx = (task as any).value.context;
      // the character's own statements: the delivered words use no sight keyword (a pin of the text, not of the meaning)
      expect(ctx.pc.map((i: any) => i.text).join(" | ")).not.toMatch(SIGHT_WORDS);
      // the confirmed placement: where the character is, and nothing about a facing or open eyes
      expect(ctx.statement).toBe(PC_WORDS.presenceBare);
      expect(ctx.statement).not.toMatch(FACING_OR_EYES);
      // the world facts: the setting's own prose and the one mechanical consequence, and no statement of light, air, path or appearance
      const facts: any[] = ctx.facts;
      expect(facts.map((f) => f.fact_id).sort()).toEqual(
        [
          "locus.constraint.1",
          "locus.constraint.2",
          "locus.designation",
          "outcome.collection",
          "world.basis",
          "world.premise",
        ].sort(),
      );
      for (const f of facts.filter((x) => x.fact_id.startsWith("locus.constraint.")))
        expect(f.text, f.fact_id).not.toMatch(EXPOSURE_ASPECTS);
      expect(facts.find((f) => f.fact_id === "outcome.collection").text).toMatch(
        /^The gathering of 3 \S+ of raw-salt from the source at this place has been completed\.$/,
      );
      // the question cites its five base premises and the sealed delivery of the character's own collection
      expect(ctx.refs).toHaveLength(6);
    });
  }, 180_000);

  it("with a scripted (lexical, plumbing-only) host the shipped observe-surroundings returns the neutral non-receipt, retains the reading, and a second look at the same basis asks no one; nothing in the canon moves", async () => {
    const { dirs } = await originalCollectionCampaign({
      scene: trialScene,
      body: SHORTHAND_BODY,
      presence: PC_WORDS.presenceBare,
    });
    const before = await reading(dirs, async (c) => {
      await collectAndComplete(c, "act-1", 3, "tx-collect-1", BOUNDARY);
      return {
        source: (c.store.getFact(`world/${WORLD_ID}/source/${SOURCE_KEY}`)!.value as any)
          .recoverable.amount,
        reserve: (c.store.getFact(`production/reserve/${SALT.reserve}`)!.value as any).quantity
          .amount,
        time: c.store.getFact("temporal/state")!.value,
      };
    });
    expect(before).toMatchObject({ source: 117, reserve: 3 });

    // the scripted host is a keyword policy: it establishes nothing from these words. That is a property of the script, NOT a ruling on what a faithful
    // host must read (I-002 section 10); what the test pins is the mechanism that follows an unresolved reading
    const policy = (doc: any) =>
      doc["operation"] === "F014D_DIRECT_PERCEPTION" ? observationAnswer(doc) : plainPolicy(doc);
    const first = await observe(dirs, verbConsole("observe-surroundings"), {}, policy);
    expect(first.result.status, JSON.stringify(first.result.details)).toBe(
      "OBSERVATION_NOT_ESTABLISHED",
    );
    expect(first.result.details).toEqual(["nothing was received at this basis"]); // no reason, no element, no verdict is told
    expect(first.host!.answered).toHaveLength(1);

    const second = await observe(dirs, verbConsole("observe-surroundings"), {}, policy);
    expect(second.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    expect(second.terminal.asked()).toBe(0); // the retained reading is found, not confirmed again
    expect(second.host!.answered).toHaveLength(0); // and the host is not asked again, nor rerolled

    await reading(dirs, (c) => {
      const readings = c.store
        .listFacts()
        .filter((f: any) => f.value?.operation === "F014D_DIRECT_PERCEPTION");
      expect(readings).toHaveLength(1);
      expect(readings[0].value.verdict).toBe("OBSERVATION_UNRESOLVED"); // an unresolved reading is audit evidence, never a "did not perceive" fact
      expect(
        c.store
          .listFacts()
          .map((f: any) => f.key)
          .filter((k: string) => k.startsWith("access/")),
      ).toEqual([]);
      expect(
        (c.store.getFact(`world/${WORLD_ID}/source/${SOURCE_KEY}`)!.value as any).recoverable
          .amount,
      ).toBe(before.source);
      expect(
        (c.store.getFact(`production/reserve/${SALT.reserve}`)!.value as any).quantity.amount,
      ).toBe(before.reserve);
      expect(c.store.getFact("temporal/state")!.value).toEqual(before.time); // looking advances no time
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
  }, 180_000);
});
