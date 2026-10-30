/* eslint-disable @typescript-eslint/no-explicit-any -- scripted host documents and raw owner facts are untyped JSON */
// MECHANISM ONLY. The Game Master here is a script whose rules this test wrote, the player is a script, the owners are real. These tests show
// what the ENGINE enforces about a scene ruling (verbatim anchoring, the kind of premise a claim may rest on, withheld values, the derived
// verdict, sparse owner publication, changed-input task identity, retention). They do NOT show that any AI host reads a request as a Game
// Master would: that, and every named-client or retained-storage claim, is UNRUN.
import { chmodSync, cpSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { REFEREE_AUTHORITY } from "@immortalis/contracts";
import { RefereeAdjudicationAdapter, type CanonicalCampaign } from "@immortalis/engine";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { pcTargetTransaction } from "../support/pc-target-advance.ts";
import { openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { BASIS, PC_ID, PC_WORDS, observe, verbConsole } from "../support/observation.ts";
import { plainPolicy, type Policy } from "../support/original-pc.ts";
import {
  SALT_TAU,
  collectAndComplete,
  originalCollectionCampaign,
} from "../support/pc-collection-original.ts";
import { GLANCE_REQUEST } from "../support/protocol.ts";
import {
  bindScene,
  perceptionPolicy,
  sceneAnswer,
  scenePolicy,
  startScene,
  withGranules,
} from "../support/scene.ts";

const boundary = { unit: BASIS.unit, value: BASIS.value + 3 * SALT_TAU };
const LOOK = "at the pale material I have just gathered";

let master: LocalityDirs;
beforeAll(async () => {
  // a placement that states neither a direction nor open eyes: the case the legacy question leaves unresolved
  const made = await originalCollectionCampaign({
    scene: withGranules(),
    presence: PC_WORDS.presenceBare,
  });
  const c = await openOrdinary(made.dirs.campaignDir);
  try {
    await collectAndComplete(c, "act-scene", 3, "tx-scene", boundary);
  } finally {
    await c.close();
  }
  master = made.dirs;
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

const perceive: Policy = perceptionPolicy(plainPolicy);

/** the owners' own facts, read afresh and independently of the code under test */
async function owners(dirs: LocalityDirs) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    const facts = c.store.listFacts();
    const by = (re: RegExp) => facts.filter((f) => re.test(f.key));
    return {
      viewing: by(/^world-state\/pc\/[^/]+\/current-viewing\//),
      appearance: by(/^world\/[^/]+\/output-appearance\//),
      decisions: by(/^referee\/[0-9a-f]{64}\/decision$/),
      events: by(/^access\/[^/]+\/event$/),
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value as number,
      raw: Object.fromEntries(facts.map((f) => [f.key, JSON.stringify(f)])),
      verify: c.verify(),
    };
  } finally {
    await c.close();
  }
}

const kindOf = (f: any): string => f.value.operation;

async function glance(dirs: LocalityDirs) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return readCurrentObservationGlance(
      bindTrustedCurrentPlayerContext({ view: c.store, recipient_id: PC_ID }),
      GLANCE_REQUEST(),
    );
  } finally {
    await c.close();
  }
}

describe("a natural look, ruled by the Game Master and consumed by the perception question", () => {
  it("the legacy question leaves the placement-only character without a look (the unresolved case); once a scene host is bound the SAME look is a lawful receipted observation, the old negative untouched", async () => {
    const dirs = copy();
    const before = await owners(dirs);
    expect(before.viewing).toHaveLength(0);
    expect(before.appearance).toHaveLength(0);

    // 1. no scene host bound: the unchanged legacy question is asked, and nothing establishes the viewing position
    const legacy = await observe(
      dirs,
      verbConsole("observe-surroundings"),
      { attention: LOOK },
      perceive,
    );
    expect(legacy.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    const negative = await owners(dirs);
    expect(negative.viewing).toHaveLength(0);
    expect(negative.appearance).toHaveLength(0);
    expect(negative.events).toHaveLength(0);
    expect(negative.decisions.map(kindOf)).toContain("F014D_DIRECT_PERCEPTION");
    const t0 = negative.decisions.filter((f) => kindOf(f) === "F014D_DIRECT_PERCEPTION");
    expect(t0).toHaveLength(1);
    expect((t0[0]!.value as any).verdict).toBe("OBSERVATION_UNRESOLVED");

    // 2. the operator binds the GM scene host; the same character looks again at the same canonical basis
    await bindScene(dirs.operatorDir);
    const gm = startScene(dirs.operatorDir, scenePolicy());
    let second: Awaited<ReturnType<typeof observe>>;
    try {
      second = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: LOOK },
        perceive,
      );
    } finally {
      await gm.stop();
    }
    expect(second.result.status, JSON.stringify(second.result.details)).toBe(
      "OBSERVATION_RECEIVED",
    );
    expect(gm.answered).toHaveLength(3); // one appearance ruling, one classification of the words, one physical ruling of the basis

    const after = await owners(dirs);
    // the old negative decision is byte-identical; the new question has its own identity
    expect(after.raw[t0[0]!.key]).toBe(negative.raw[t0[0]!.key]);
    const t1 = after.decisions.filter((f) => kindOf(f) === "F014D_DIRECT_PERCEPTION");
    expect(t1).toHaveLength(2);
    const fresh = t1.find((f) => f.key !== t0[0]!.key)!;
    expect((fresh.value as any).verdict).toBe("OBSERVATION_ESTABLISHED");
    // sparse owner publication: exactly one viewing circumstance and one appearance, from the GM's retained rulings
    expect(after.viewing).toHaveLength(1);
    expect(after.appearance).toHaveLength(1);
    const scene = after.decisions.filter((f) => kindOf(f) === "GM_SCENE_RESOLUTION");
    expect(scene).toHaveLength(3);
    expect(scene.map((f) => (f.value as any).verdict).sort()).toEqual([
      "APPEARANCE_RESOLVED",
      "LOOK_ORDINARY",
      "VIEWING_SUPPORTED",
    ]);
    // the appearance carries no quantity, material, ownership or source identifier
    const appearance = JSON.stringify(after.appearance[0]!.value);
    expect(appearance).toContain("pale, dry, granular crystals");
    // (it REFERENCES the producing owner's delivery by key; it copies no value from it)
    expect(appearance).not.toMatch(/"amount"|"quantity"|"material|"reserve|"source_key"/i);
    // what it SAYS (the aspects) names no material, unit or number
    expect(JSON.stringify((after.appearance[0]!.value as any).aspects)).not.toMatch(
      /salt|sack|\d|\b(one|two|three|four|five)\b/i,
    );
    expect(appearance).not.toMatch(/(?<![\w:.-])3(?![\w:.-])/);
    // the receipt was earned: one event, and it cites the owner-published facts
    expect(after.events).toHaveLength(1);
    const cited = (fresh.value as any).input.refs.map((r: any) => r.fact_key);
    expect(cited).toContain(after.viewing[0]!.key);
    expect(cited).toContain(after.appearance[0]!.key);
    // the look passed no time
    expect(after.time).toBe(before.time);
    expect(after.verify).toEqual([]);

    // 3. the player's Glance shows the appearance the owner resolved (not the wall, not the mechanical sentence)
    const shown = await glance(dirs);
    expect(shown.ok, JSON.stringify(shown)).toBe(true);
    expect(JSON.stringify(shown)).toContain("pale, dry, granular crystals");
    expect(JSON.stringify(shown)).not.toMatch(
      /\bred\b|gathering|completed|source-delivery|salt|\b3\b/,
    );
  }, 300_000);

  it("the same look repeated asks nobody again: the retained rulings and decision answer, nothing is rerolled", async () => {
    const dirs = copy();
    await bindScene(dirs.operatorDir);
    const gm = startScene(dirs.operatorDir, scenePolicy());
    try {
      const first = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: LOOK },
        perceive,
      );
      expect(first.result.status).toBe("OBSERVATION_RECEIVED");
      const held = await owners(dirs);
      const asked = gm.answered.length;
      // a scene host that would now rule differently is never consulted: a published circumstance is found by its identity
      const flipped = startScene(dirs.operatorDir, scenePolicy({ vetoes: /./ }), "gm-scene");
      const again = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: LOOK },
        perceive,
      );
      await flipped.stop();
      expect(again.result.status).toBe("OBSERVATION_RECEIVED");
      expect(gm.answered).toHaveLength(asked);
      expect(flipped.answered).toHaveLength(0);
      const after = await owners(dirs);
      expect(after.raw).toEqual(held.raw);
    } finally {
      await gm.stop();
    }
  }, 300_000);

  it("a request that carries a materially new commitment is returned to the player: nothing is published, the perception question is never asked, no time passes", async () => {
    const dirs = copy();
    await bindScene(dirs.operatorDir);
    const gm = startScene(dirs.operatorDir, scenePolicy());
    try {
      const before = await owners(dirs);
      const r = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: "after I climb onto the wall, at the far side" },
        perceive,
      );
      expect(r.result.status).toBe("OBSERVATION_NEEDS_CHOICE");
      expect(JSON.stringify(r.result)).not.toMatch(/climb|wall|salt|\b3\b/i);
      const after = await owners(dirs);
      expect(after.viewing).toHaveLength(0);
      expect(after.events).toHaveLength(0);
      expect(after.decisions.some((f) => kindOf(f) === "F014D_DIRECT_PERCEPTION")).toBe(false);
      expect(after.time).toBe(before.time);
      const ruled = after.decisions.filter((f) => kindOf(f) === "GM_SCENE_RESOLUTION");
      expect(ruled.some((f) => (f.value as any).verdict === "PLAYER_CHOICE_REQUIRED")).toBe(true);
    } finally {
      await gm.stop();
    }
  }, 300_000);

  it("a reworded look at a basis whose circumstance already stands is still ruled on: a materially new commitment in the new words is returned, not dropped", async () => {
    const dirs = copy();
    await bindScene(dirs.operatorDir);
    const gm = startScene(dirs.operatorDir, scenePolicy());
    try {
      const first = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: LOOK },
        perceive,
      );
      expect(first.result.status).toBe("OBSERVATION_RECEIVED");
      const held = await owners(dirs);
      expect(held.viewing).toHaveLength(1);
      const asked = gm.answered.length;
      const again = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: "after I climb onto the wall, at the far side" },
        perceive,
      );
      expect(again.result.status).toBe("OBSERVATION_NEEDS_CHOICE");
      expect(gm.answered.length).toBe(asked + 1); // exactly one new ruling: on the new words
      const after = await owners(dirs);
      // the published circumstance and the receipt stand untouched; nothing was added but the sealed ruling on the new words
      expect(after.viewing.map((f) => after.raw[f.key])).toEqual(
        held.viewing.map((f) => held.raw[f.key]),
      );
      expect(after.events).toHaveLength(1);
      expect(after.time).toBe(held.time);
      // an ordinary rewording needs no new publication
      const ordinary = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: "at the grain" },
        perceive,
      );
      expect(ordinary.result.status).toBe("OBSERVATION_RECEIVED");
      expect((await owners(dirs)).viewing).toHaveLength(1);
    } finally {
      await gm.stop();
    }
  }, 300_000);

  it("a negative physical result is not rerolled by wording: a paraphrase at the unchanged basis cannot promote it, new words are still classified, and only a changed basis is a new task", async () => {
    const dirs = copy();
    await bindScene(dirs.operatorDir);
    const veto = /ordinary, fully functioning colour vision/;
    const physical = (after: Awaited<ReturnType<typeof owners>>) =>
      after.decisions
        .filter((f) => kindOf(f) === "GM_SCENE_RESOLUTION")
        .map((f) => (f.value as any).verdict)
        .filter((v: string) => v.startsWith("VIEWING_"));
    // 1. a look the character's own words veto: the physical result of this basis is negative, retained as sealed evidence only
    const unfavourable = startScene(dirs.operatorDir, scenePolicy({ vetoes: veto }));
    try {
      const a = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: LOOK },
        perceive,
      );
      expect(a.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    } finally {
      await unfavourable.stop();
    }
    const held = await owners(dirs);
    expect(physical(held)).toEqual(["VIEWING_NOT_SUPPORTED"]);
    expect(held.viewing).toHaveLength(0); // no synthetic negative fact is ever published
    // 2. the Game Master would now answer favourably to anything: it must never be asked the physical question again at this basis
    const favourable = startScene(dirs.operatorDir, scenePolicy());
    try {
      for (const words of ["at the grain of what I gathered", "at the stuff on the ground", null]) {
        const r = await observe(
          dirs,
          verbConsole("observe-surroundings"),
          words === null ? {} : { attention: words },
          perceive,
        );
        expect(r.result.status, String(words)).toBe("OBSERVATION_NOT_ESTABLISHED");
      }
      // new words are classified (fresh), the physical question is not asked: two paraphrases, two classifications, nothing else
      expect(favourable.answered).toHaveLength(2);
      // and a materially new commitment in new words is still returned to the player, not folded into the negative
      const climb = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: "after I climb onto the wall, at the far side" },
        perceive,
      );
      expect(climb.result.status).toBe("OBSERVATION_NEEDS_CHOICE");
      expect(favourable.answered).toHaveLength(3);
      const after = await owners(dirs);
      expect(after.viewing).toHaveLength(0);
      expect(after.events).toHaveLength(0);
      expect(after.decisions.filter((f) => kindOf(f) === "F014D_DIRECT_PERCEPTION")).toHaveLength(
        held.decisions.filter((f) => kindOf(f) === "F014D_DIRECT_PERCEPTION").length,
      );
      expect(physical(after)).toEqual(["VIEWING_NOT_SUPPORTED"]);
      // the sealed old negative is byte-identical
      for (const f of held.decisions) expect(after.raw[f.key]).toBe(held.raw[f.key]);
    } finally {
      await favourable.stop();
    }
    // 3. a genuinely changed basis (canonical time moved through a lawful advance) is a NEW lawful task, and now the same favourable answer holds
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const moved = await advanceActivePcToTarget(
        bindTrustedActivePcTargetAdvanceContext({
          campaign: c,
          pc_id: PC_ID,
          target: { unit: BASIS.unit, value: boundary.value + 5 },
          transaction: pcTargetTransaction("tx-h2-moved") as never,
        }),
        { operation: "advance_active_pc_to_target" },
      );
      expect(moved.ok).toBe(true);
    } finally {
      await c.close();
    }
    const later = startScene(dirs.operatorDir, scenePolicy());
    try {
      const b = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: LOOK },
        perceive,
      );
      expect(b.result.status, JSON.stringify(b.result.details)).toBe("OBSERVATION_RECEIVED");
    } finally {
      await later.stop();
    }
    const end = await owners(dirs);
    expect(end.viewing).toHaveLength(1);
    expect(physical(end).sort()).toEqual(["VIEWING_NOT_SUPPORTED", "VIEWING_SUPPORTED"]);
    for (const f of held.decisions) expect(end.raw[f.key]).toBe(held.raw[f.key]);
  }, 300_000);

  it("the character's own words can veto a look: the ruling is retained as evidence and nothing is published or perceived", async () => {
    const dirs = copy();
    await bindScene(dirs.operatorDir);
    // the veto is read from the DELIVERED character words (the fixture character has ordinary sight, so the script finds nothing to quote)
    const gm = startScene(
      dirs.operatorDir,
      scenePolicy({ vetoes: /ordinary, fully functioning colour vision/ }),
    );
    try {
      const r = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: LOOK },
        perceive,
      );
      expect(r.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
      const after = await owners(dirs);
      expect(after.viewing).toHaveLength(0);
      expect(after.events).toHaveLength(0);
      expect(
        after.decisions
          .filter((f) => kindOf(f) === "GM_SCENE_RESOLUTION")
          .map((f) => (f.value as any).verdict),
      ).toContain("VIEWING_NOT_SUPPORTED");
      expect(after.decisions.some((f) => kindOf(f) === "F014D_DIRECT_PERCEPTION")).toBe(false);
    } finally {
      await gm.stop();
    }
  }, 300_000);

  it("a world that states nothing of how the loose material looks yields no appearance: the GM cannot invent one, and the look consumes none", async () => {
    const dirs = copy();
    await bindScene(dirs.operatorDir);
    const gm = startScene(dirs.operatorDir, scenePolicy({ unresolvedAppearance: true }));
    try {
      const r = await observe(
        dirs,
        verbConsole("observe-surroundings"),
        { attention: LOOK },
        perceive,
      );
      const after = await owners(dirs);
      expect(after.appearance).toHaveLength(0);
      expect(
        after.decisions
          .filter((f) => kindOf(f) === "GM_SCENE_RESOLUTION")
          .map((f) => (f.value as any).verdict),
      ).toContain("APPEARANCE_UNRESOLVED");
      // whatever the perception question then does, it does not state an appearance the owners never resolved
      expect(JSON.stringify(r.result)).not.toContain("pale, dry, granular");
      expect(JSON.stringify(await glance(dirs))).not.toContain("pale, dry, granular");
    } finally {
      await gm.stop();
    }
  }, 300_000);
});

describe("the engine refuses a scene ruling that is not anchored, whoever sends it", () => {
  let campaign: CanonicalCampaign;
  let adapter: RefereeAdjudicationAdapter;
  beforeAll(async () => {
    campaign = await openOrdinary(copy().campaignDir);
    adapter = new RefereeAdjudicationAdapter(campaign.store);
  });

  // the physical question is asked of the basis alone (a bare look); the player's words are classified by a separate task
  const viewingDoc = (statement: string | null = null) => {
    const task = adapter.viewingTask({
      pc_id: PC_ID,
      attempt: 0,
      request: { kind: "LOOK", statement },
    });
    if (!task.ok) throw new Error(JSON.stringify(task.error));
    return { task_id: task.value.task_id, context: task.value.context };
  };
  const record = (doc: any, answer: unknown, statement: string | null = null) =>
    adapter.recordScene({
      operation: { ...REFEREE_AUTHORITY },
      host: { host_id: "engine-direct-test", claimed_model: null },
      pc_id: PC_ID,
      attempt: 0,
      kind: "CURRENT_VIEWING",
      request: { kind: "LOOK", statement },
      answer,
    } as any);

  it("a ruling that rests on the request alone is not a physical result", async () => {
    const doc = viewingDoc();
    const refused = await record(doc, sceneAnswer(doc, { requestOnly: true }));
    expect(refused.ok).toBe(false);
    expect((refused as any).error.code).toBe("GROUNDS_UNSUPPORTED");
  });

  it("a ruling whose statement carries an engine reference is refused", async () => {
    const doc = viewingDoc();
    const refused = await record(doc, sceneAnswer(doc, { statement: `${PC_ID} can look` }));
    expect(refused.ok).toBe(false);
    expect((refused as any).error.code).toBe("GROUNDS_UNSUPPORTED");
  });

  it("an answer for another task, a quotation that is not in the premise, and an uncovered fact are each refused", async () => {
    const doc = viewingDoc();
    const wrongTask = { ...(sceneAnswer(doc) as any), task_id: "0".repeat(64) };
    expect(((await record(doc, wrongTask)) as any).error.code).toBe("TASK_MISMATCH");
    const forged: any = sceneAnswer(doc);
    forged.viewing.premises[0].evidence_quote = "a body that can fly";
    expect(((await record(doc, forged)) as any).error.code).toBe("GROUNDS_UNSUPPORTED");
    const uncovered: any = sceneAnswer(doc);
    uncovered.assessments = uncovered.assessments.slice(1);
    expect(((await record(doc, uncovered)) as any).error.code).toBe("COVERAGE_INCOMPLETE");
  });

  it("a bare look has no request statement to quote, and a worded one must quote it", async () => {
    const bare = viewingDoc(null);
    const quoted: any = sceneAnswer({
      ...bare,
      context: { ...bare.context, request: { kind: "LOOK", statement: LOOK } },
    });
    const refusedBare = await record(bare, { ...quoted, task_id: bare.task_id }, null);
    expect(refusedBare.ok).toBe(false);
    const worded = viewingDoc(LOOK);
    const unquoted: any = sceneAnswer(worded);
    unquoted.viewing.request.evidence_quote = "something the player never said";
    expect(((await record(worded, unquoted, LOOK)) as any).error.code).toBe("GROUNDS_UNSUPPORTED");
  });

  it("the physical question is asked of the basis alone: its task identity carries no wording, and the words are classified by their own task", () => {
    const a = viewingDoc(null);
    const b = viewingDoc(null);
    expect(a.task_id).toBe(b.task_id);
    expect(JSON.stringify(a.context)).not.toContain(LOOK);
    const x = viewingDoc(LOOK);
    const y = viewingDoc("at the pale stuff I gathered");
    expect(new Set([a.task_id, x.task_id, y.task_id]).size).toBe(3);
  });

  it("a worded request is only classified: an answer that also rules on the physical circumstance is refused, and so is a bare look that claims a commitment", async () => {
    const worded = viewingDoc(LOOK);
    const ruling: any = sceneAnswer(worded);
    // the same words, answered as if they carried a physical ruling (the reroll an unchanged basis must never offer)
    ruling.viewing.state = "SUPPORTED";
    ruling.viewing.statement = "Nothing prevents an ordinary look now.";
    ruling.viewing.premises = [
      {
        from: "PC_STATEMENT",
        ref: worded.context.pc[0].item_id,
        evidence_quote: worded.context.pc[0].text.slice(0, 12),
      },
    ];
    const refused: any = await record(worded, ruling, LOOK);
    expect(refused.ok).toBe(false);
    expect(refused.error.code).toBe("DECISION_INCOHERENT");
    const bare = viewingDoc(null);
    const claimed: any = sceneAnswer(bare);
    claimed.viewing.request.classification = "MATERIAL_NEW_COMMITMENT";
    expect(((await record(bare, claimed)) as any).error.code).toBe("DECISION_INCOHERENT");
  });

  it("an appearance may carry no count, material or source: the producing owner withholds them", async () => {
    const task = adapter.appearanceTask({
      pc_id: PC_ID,
      attempt: 0,
      extraction_id: `pc-collect:${PC_ID}:act-scene`,
    });
    if (!task.ok) throw new Error(JSON.stringify(task.error));
    const doc = { task_id: task.value.task_id, context: task.value.context };
    for (const leak of [
      "three pale granular lumps",
      "3 pale granular lumps",
      "pale lumps of raw salt",
      "pale lumps from src-salt-pan-1",
    ]) {
      const refused = await adapter.recordScene({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: "engine-direct-test", claimed_model: null },
        pc_id: PC_ID,
        attempt: 0,
        kind: "OUTPUT_APPEARANCE",
        extraction_id: `pc-collect:${PC_ID}:act-scene`,
        answer: sceneAnswer(doc, { appearance: leak }),
      } as any);
      expect(refused.ok, leak).toBe(false);
    }
  });

  it("the physical owner publishes nothing from a ruling that is not VIEWING_SUPPORTED, from a forged one, or from one made for a stale basis", async () => {
    const material = viewingDoc("after I climb onto the wall");
    const recorded: any = await record(
      material,
      sceneAnswer(material),
      "after I climb onto the wall",
    );
    expect(recorded.ok).toBe(true);
    expect(recorded.value.verdict).toBe("PLAYER_CHOICE_REQUIRED");
    const publication = (task: string) => ({
      group_id: `forge:${task}:group`,
      intent_id: `forge:${task}:intent`,
      cause: `forge:${task}:cause`,
      basis: "gm-scene-ruling-publication",
      secrecy: "operator-visible",
      pc_id: PC_ID,
      ruling_task_id: task,
    });
    const refused = await campaign.establishPcCurrentViewing(publication(material.task_id));
    expect(refused.ok).toBe(false);
    const forged = await campaign.establishPcCurrentViewing(publication("f".repeat(64)));
    expect(forged.ok).toBe(false);
    expect(campaign.store.listFacts().some((f) => /\/current-viewing\//.test(f.key))).toBe(false);
  });
});
