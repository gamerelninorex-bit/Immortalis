/* eslint-disable @typescript-eslint/no-explicit-any -- scripted host documents and raw owner facts are untyped JSON */
// F-027 v0.8 / RED O-3 - ratified clause 3 of the Active-PC Current-Look section, at the MECHANISM level, and the Stage A limit. MECHANISM ONLY:
// the Game Master is a script. Nothing here shows Health clearance (Health S1) or that any host reads a character's faculty as a Game
// Master would; the scene task carries no Health record and no separately owned sensory record, and these tests say so rather than hide it.
import { createHash } from "node:crypto";
import { chmodSync, cpSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  OBSERVATION_PLACEMENT_REF,
  PcCurrentViewingSchema,
  REFEREE_AUTHORITY,
  refereeDecisionKey,
} from "@immortalis/contracts";
import { RefereeAdjudicationAdapter } from "@immortalis/engine";
import { openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { BASIS, PC_ID, PC_WORDS, observe, redScene, verbConsole } from "../support/observation.ts";
import { plainPolicy } from "../support/original-pc.ts";
import {
  SALT_TAU,
  collectAndComplete,
  originalCollectionCampaign,
} from "../support/pc-collection-original.ts";
import {
  bindScene,
  perceptionPolicy,
  sceneAnswer,
  scenePolicy,
  startScene,
} from "../support/scene.ts";

const boundary = { unit: BASIS.unit, value: BASIS.value + 3 * SALT_TAU };
const LOOK = "at the pale material I have just gathered";
const VIEWING_KEY = /^world-state\/pc\/[^/]+\/current-viewing\//;

let master: LocalityDirs;
let lawful: LocalityDirs;
beforeAll(async () => {
  const made = await originalCollectionCampaign({ scene: redScene(), presence: PC_WORDS.presence });
  const c = await openOrdinary(made.dirs.campaignDir);
  try {
    await collectAndComplete(c, "act-scene", 3, "tx-scene", boundary);
  } finally {
    await c.close();
  }
  master = made.dirs;
  lawful = copy();
  await bindScene(lawful.operatorDir);
  const gm = startScene(lawful.operatorDir, scenePolicy());
  try {
    const r = await observe(
      lawful,
      verbConsole("observe-surroundings"),
      { attention: LOOK },
      perceptionPolicy(plainPolicy),
    );
    expect(r.result.status).toBe("OBSERVATION_RECEIVED");
  } finally {
    await gm.stop();
  }
}, 300_000);

/** a private byte-for-byte copy of the completed collection (same identities, same hosts, nothing observed yet) */
function copy(): LocalityDirs {
  const root = dirname(master.campaignDir);
  const to = join(dirname(root), `copy-${Math.random().toString(36).slice(2)}`);
  cpSync(root, to, { recursive: true });
  const priv = (d: string): void => {
    chmodSync(d, 0o700);
    for (const e of readdirSync(d, { withFileTypes: true }))
      if (e.isDirectory()) priv(join(d, e.name));
  };
  priv(to);
  return {
    campaignDir: join(to, master.campaignDir.slice(root.length + 1)),
    operatorDir: join(to, master.operatorDir.slice(root.length + 1)),
  };
}

describe("ratified clause 3 at the mechanism level, and the Stage A limit: no Health and no separately owned sensory record", () => {
  async function bareQuestion() {
    const campaign = await openOrdinary(copy().campaignDir);
    const adapter = new RefereeAdjudicationAdapter(campaign.store);
    const task = adapter.viewingTask({
      pc_id: PC_ID,
      attempt: 0,
      request: { kind: "LOOK", statement: null },
    });
    if (!task.ok) throw new Error(JSON.stringify(task.error));
    return {
      campaign,
      adapter,
      doc: { task_id: task.value.task_id, context: task.value.context } as any,
    };
  }
  const ruled = (adapter: RefereeAdjudicationAdapter, doc: any, answer: unknown): any =>
    adapter.evaluateScene(doc.context, answer);

  it("uncertainty is never upgraded to VIEWING_SUPPORTED: a ruling with no quoted lawful premise, or one resting on a baseline that was not delivered, on a speculative quotation, on world facts or on its own product, is refused", async () => {
    const { campaign, adapter, doc } = await bareQuestion();
    try {
      const lawful = sceneAnswer(doc) as any;
      // the control: the character's accepted ordinary baseline, quoted from a delivered item, is the lawful positive
      expect(ruled(adapter, doc, lawful)).toMatchObject({
        ok: true,
        value: { verdict: "VIEWING_SUPPORTED" },
      });
      const refuse = (edit: (a: any) => void, code: string, why: string) => {
        const a: any = JSON.parse(JSON.stringify(lawful));
        edit(a);
        const r = ruled(adapter, doc, a);
        expect(r.ok, why).toBe(false);
        expect(r.error.code, why).toBe(code);
      };
      // an empty premise list: silence is not evidence of a faculty or a path
      refuse((a) => (a.viewing.premises = []), "GROUNDS_UNSUPPORTED", "no premise");
      // L12 (BLUE): the confirmed placement says where the character is and how, never that the character can see. A positive ruling must
      // quote at least one PC_STATEMENT; the placement alone, or with world facts, is refused even though every quotation is genuine
      const placement = {
        from: "PLACEMENT_STATEMENT",
        ref: OBSERVATION_PLACEMENT_REF,
        evidence_quote: doc.context.statement.slice(0, 20),
      };
      expect(doc.context.statement).toContain(placement.evidence_quote);
      refuse(
        (a) => (a.viewing.premises = [placement]),
        "GROUNDS_UNSUPPORTED",
        "the placement alone",
      );
      refuse(
        (a) =>
          (a.viewing.premises = [
            placement,
            {
              from: "WORLD_FACT",
              ref: doc.context.facts[0].fact_id,
              evidence_quote: doc.context.facts[0].text.slice(0, 12),
            },
          ]),
        "GROUNDS_UNSUPPORTED",
        "the placement with a world fact",
      );
      // world facts alone say nothing about the character's faculty or routine bodily ability
      refuse(
        (a) =>
          (a.viewing.premises = [
            {
              from: "WORLD_FACT",
              ref: doc.context.facts[0].fact_id,
              evidence_quote: doc.context.facts[0].text.slice(0, 12),
            },
          ]),
        "GROUNDS_UNSUPPORTED",
        "world fact alone",
      );
      // a baseline the delivered items do not contain (withheld, or only imagined by the host): no such item can be cited,
      refuse(
        (a) =>
          (a.viewing.premises = [
            {
              from: "PC_STATEMENT",
              ref: "mirror/embodiment/not-delivered",
              evidence_quote: "ordinary human body",
            },
          ]),
        "COVERAGE_INCOMPLETE",
        "an item that was not delivered",
      );
      // ... and a delivered item cannot be quoted for words it does not hold (a speculative baseline)
      refuse(
        (a) => (a.viewing.premises[0].evidence_quote = "a body that can fly"),
        "GROUNDS_UNSUPPORTED",
        "a speculative quotation",
      );
      // a downstream asserted verdict is never its own upstream evidence: a ruling cannot rest on the viewing it produces
      refuse(
        (a) =>
          a.viewing.premises.push({
            from: "CURRENT_VIEWING",
            ref: "viewing.current",
            evidence_quote: '"state":"SUPPORTED"',
          }),
        "DECISION_INCOHERENT",
        "its own product",
      );
      // the supported statement is explanatory text and may carry no engine reference
      refuse(
        (a) => (a.viewing.statement = `${PC_ID} can look`),
        "GROUNDS_UNSUPPORTED",
        "an engine reference in the statement",
      );
    } finally {
      await campaign.close();
    }
  }, 300_000);

  it("L12 invariants: a placement COMPLEMENTS a quoted PC baseline, may still ground a veto, and every verdict derivation is unchanged", async () => {
    const { campaign, adapter, doc } = await bareQuestion();
    try {
      const lawful = sceneAnswer(doc) as any;
      const placement = {
        from: "PLACEMENT_STATEMENT",
        ref: OBSERVATION_PLACEMENT_REF,
        evidence_quote: doc.context.statement.slice(0, 20),
      };
      // the lawful PC baseline plus the placement is accepted: the placement is not forbidden, only never sufficient
      const both: any = JSON.parse(JSON.stringify(lawful));
      both.viewing.premises = [...both.viewing.premises, placement];
      expect(ruled(adapter, doc, both)).toMatchObject({
        ok: true,
        value: { verdict: "VIEWING_SUPPORTED" },
      });
      // a veto may rest on the placement (spatial constraints and vetoes are what it is for): still VIEWING_NOT_SUPPORTED
      const veto: any = JSON.parse(JSON.stringify(lawful));
      veto.viewing.state = "NOT_SUPPORTED";
      veto.viewing.statement = null;
      veto.viewing.premises = [placement];
      expect(ruled(adapter, doc, veto)).toMatchObject({
        ok: true,
        value: { verdict: "VIEWING_NOT_SUPPORTED" },
      });
      // an unsettled ruling needs no faculty premise and stays UNRESOLVED, never an obstruction and never a positive
      const open: any = JSON.parse(JSON.stringify(lawful));
      open.viewing.state = "NOT_ESTABLISHED";
      open.viewing.statement = null;
      open.viewing.premises = [];
      expect(ruled(adapter, doc, open)).toMatchObject({
        ok: true,
        value: { verdict: "VIEWING_UNRESOLVED" },
      });
    } finally {
      await campaign.close();
    }
  }, 300_000);

  it("L12: a placement-only supported ruling is refused when RECORDED too - no sealed decision, no viewing fact, no journal mutation - and the lawful baseline ruling still publishes", async () => {
    const { campaign, adapter, doc } = await bareQuestion();
    try {
      const before = {
        revision: campaign.store.head().revision,
        facts: campaign.store.listFacts().length,
      };
      const placementOnly = sceneAnswer(doc, { placementOnly: true }) as any;
      expect(placementOnly.viewing.premises.map((p: any) => p.from)).toEqual([
        "PLACEMENT_STATEMENT",
      ]);
      const refused: any = await adapter.recordScene({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: "engine-direct-test", claimed_model: null },
        pc_id: PC_ID,
        attempt: 0,
        kind: "CURRENT_VIEWING",
        request: { kind: "LOOK", statement: null },
        answer: placementOnly,
      } as any);
      expect(refused.ok).toBe(false);
      expect(refused.error.code).toBe("GROUNDS_UNSUPPORTED");
      expect(campaign.store.head().revision).toBe(before.revision);
      expect(campaign.store.listFacts()).toHaveLength(before.facts);
      expect(campaign.store.getFact(refereeDecisionKey(doc.task_id))).toBeUndefined();
      expect(campaign.store.listFacts().some((f) => VIEWING_KEY.test(f.key))).toBe(false);
      // nothing retained means nothing to publish: the physical owner refuses
      const published = await campaign.establishPcCurrentViewing({
        group_id: "scene:l12:group",
        intent_id: "scene:l12:intent",
        cause: "scene:l12:cause",
        basis: "gm-scene-ruling-publication",
        secrecy: "operator-visible",
        pc_id: PC_ID,
        ruling_task_id: doc.task_id,
      });
      expect(published.ok).toBe(false);
      expect(campaign.store.head().revision).toBe(before.revision);
      // the lawful PC-baseline positive on the SAME task is unaffected: recorded once, published once
      const lawfulRecord: any = await adapter.recordScene({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: "engine-direct-test", claimed_model: null },
        pc_id: PC_ID,
        attempt: 0,
        kind: "CURRENT_VIEWING",
        request: { kind: "LOOK", statement: null },
        answer: sceneAnswer(doc),
      } as any);
      expect(lawfulRecord.ok, JSON.stringify(lawfulRecord)).toBe(true);
      expect(lawfulRecord.value.verdict).toBe("VIEWING_SUPPORTED");
    } finally {
      await campaign.close();
    }
  }, 300_000);

  it("L12 on the operator path: a Game Master that rules on the placement alone is refused, nothing is published or perceived, and the campaign journal is byte-identical", async () => {
    const dirs = copy();
    const journal = join(dirs.campaignDir, "journal.jsonl");
    const fileSha = () => createHash("sha256").update(readFileSync(journal)).digest("hex");
    const before = fileSha();
    await bindScene(dirs.operatorDir);
    const gm = startScene(dirs.operatorDir, scenePolicy({ placementOnly: true }));
    try {
      // a BARE look asks the physical question only (a worded look first classifies the words, which seals a different, legitimate task)
      const r = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        {},
        perceptionPolicy(plainPolicy),
      );
      expect(r.result.status, JSON.stringify(r.result)).not.toBe("OBSERVATION_RECEIVED");
      expect(gm.answered.length).toBeGreaterThan(0); // the Game Master WAS asked and answered placement-only
    } finally {
      await gm.stop();
    }
    expect(fileSha()).toBe(before);
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const facts = c.store.listFacts();
      expect(facts.some((f) => VIEWING_KEY.test(f.key))).toBe(false);
      expect(facts.some((f) => /^access\//.test(f.key))).toBe(false);
      expect(
        facts.some(
          (f) =>
            /^referee\/[0-9a-f]{64}\/decision$/.test(f.key) &&
            (f.value as any).operation === "GM_SCENE_RESOLUTION",
        ),
      ).toBe(false);
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  }, 300_000);

  it("the scene task carries no Health record and no separately owned sensory record, and the supported record asserts feasibility only: it has no field for position, facing, sightline, eye state, sensory function, target visibility, appearance, perception or Health", async () => {
    const { campaign, doc } = await bareQuestion();
    try {
      expect(JSON.stringify(doc.context)).not.toMatch(/health|sensory|faculty_state|impair/i);
      expect(Object.keys(doc.context).sort()).toEqual(
        [
          "attempt",
          "campaign_id",
          "facts",
          "kind",
          "observed_at",
          "operation",
          "pc",
          "refs",
          "request",
          "statement",
          "subject",
        ].sort(),
      );
      // nothing of the campaign is a Health fact either: an empty Health ledger is what the owners hold, and it was not read as a finding
      expect(campaign.store.listFacts().some((f) => /health/i.test(f.key))).toBe(false);
    } finally {
      await campaign.close();
    }
    const c = await openOrdinary(lawful.campaignDir);
    try {
      const fact = c.store.listFacts().find((f) => VIEWING_KEY.test(f.key))!;
      const value = fact.value as any;
      expect(Object.keys(value).sort()).toEqual(
        [
          "basis",
          "circumstance",
          "custodian",
          "observed_at",
          "pc_id",
          "request",
          "ruled_by",
          "ruling",
          "viewing_id",
        ].sort(),
      );
      expect(Object.keys(value.circumstance).sort()).toEqual(["state", "statement"]);
      expect(value.circumstance.state).toBe("SUPPORTED");
      for (const extra of [
        "position",
        "facing",
        "sightline",
        "eye_state",
        "sensory_function",
        "target_visibility",
        "appearance",
        "perception",
        "recipient_knowledge",
        "health",
      ])
        expect(PcCurrentViewingSchema.safeParse({ ...value, [extra]: "x" }).success, extra).toBe(
          false,
        );
      // the GM's statement stays explanatory journal text: the typed premise the perception question receives does not carry it
      const task = new RefereeAdjudicationAdapter(c.store).observationTask({
        pc_id: PC_ID,
        attempt: 0,
      });
      if (!task.ok) throw new Error(JSON.stringify(task.error));
      const delivered = task.value.context.facts.find((f) => f.from === "viewing")!;
      expect(delivered.text).not.toContain(value.circumstance.statement);
    } finally {
      await c.close();
    }
  }, 300_000);
});
