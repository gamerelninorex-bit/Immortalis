/* eslint-disable @typescript-eslint/no-explicit-any -- scripted host documents, raw owner facts and tampered journals are untyped JSON */
// F-027 v0.8 (31 October 2026) - the two source-locked current-look citations, exercised against REAL owners. MECHANISM ONLY: the Game Master
// is a script whose rules the test wrote; nothing here shows that any AI host reads a look as a Game Master would, and nothing here shows
// Health clearance (Health S1), a named client or retained storage. Those, H3/D-2 and the historical L5/F014D-6-MAIN debt stay open.
//
//  1. a fresh disposable campaign establishes the lawful viewing and scene rulings UNDER THE NEW CITATIONS and replays strictly;
//  2. the earlier citations (hash-pinned TEST DATA, never a production export) are refused as NEW WRITES at admission;
//  3. a history that carries them is refused at LOAD (fail closed, no legacy reader), and the refused open leaves the journal untouched;
//  4. all seven engine-derived scene verdicts, and that only VIEWING_SUPPORTED reaches the physical owner;
//  5. the scene citation admits the scene operation's real retained record and no other operation's.
import { createHash } from "node:crypto";
import { chmodSync, cpSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  REFEREE_AUTHORITY,
  REFEREE_OP_SCENE,
  refereeDecisionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  REFEREE_FACT_KINDS,
  REFEREE_OBSERVATION_RULE,
  REFEREE_PHYSICAL_RULE,
  REFEREE_RULE,
  REFEREE_SCENE_RULE,
  RefereeAdjudicationAdapter,
  WORLD_PC_CURRENT_VIEWING_RULE,
  createFileCampaign,
} from "@immortalis/engine";
import { openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { BASIS, PC_ID, PC_WORDS, observe, redScene, verbConsole } from "../support/observation.ts";
import { plainPolicy } from "../support/original-pc.ts";
import {
  SALT_TAU,
  collectAndComplete,
  originalCollectionCampaign,
} from "../support/pc-collection-original.ts";
import {
  PRE_LOWERING_SCENE_RULE,
  PRE_LOWERING_VIEWING_RULE,
} from "../support/pre-lowering-citations.ts";
import {
  bindScene,
  perceptionPolicy,
  sceneAnswer,
  scenePolicy,
  startScene,
} from "../support/scene.ts";
import { tempDir } from "../support/tmp.ts";

const boundary = { unit: BASIS.unit, value: BASIS.value + 3 * SALT_TAU };
const LOOK = "at the pale material I have just gathered";
const perceive = perceptionPolicy(plainPolicy);
const SCENE_KEY = /^referee\/[0-9a-f]{64}\/decision$/;
const VIEWING_KEY = /^world-state\/pc\/[^/]+\/current-viewing\//;

let master: LocalityDirs;
beforeAll(async () => {
  const made = await originalCollectionCampaign({ scene: redScene(), presence: PC_WORDS.presence });
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

const fileSha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");

/** the lawful history: one supported look through the real operator path, on a private copy */
async function lawfulLook(): Promise<LocalityDirs> {
  const dirs = copy();
  await bindScene(dirs.operatorDir);
  const gm = startScene(dirs.operatorDir, scenePolicy());
  try {
    const r = await observe(
      dirs,
      verbConsole("observe-surroundings"),
      { attention: LOOK },
      perceive,
    );
    expect(r.result.status, JSON.stringify(r.result)).toBe("OBSERVATION_RECEIVED");
  } finally {
    await gm.stop();
  }
  return dirs;
}

/** the lawful groups of the supported look, as committed */
async function lawfulGroups(dirs: LocalityDirs) {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    const facts = c.store.listFacts();
    const scene = facts.filter(
      (f) => SCENE_KEY.test(f.key) && (f.value as any).operation === REFEREE_OP_SCENE,
    );
    const physical = scene.find((f) => (f.value as any).verdict === "VIEWING_SUPPORTED")!;
    const viewing = facts.find((f) => VIEWING_KEY.test(f.key))!;
    return {
      physical: c.store.committedGroup(physical.provenance.intent_id)!,
      worded: c.store.committedGroup(
        scene.find((f) => (f.value as any).verdict === "LOOK_ORDINARY")!.provenance.intent_id,
      )!,
      viewing: c.store.committedGroup(viewing.provenance.intent_id)!,
    };
  } finally {
    await c.close();
  }
}

let lawful: LocalityDirs;
let groups: Awaited<ReturnType<typeof lawfulGroups>>;
beforeAll(async () => {
  lawful = await lawfulLook();
  groups = await lawfulGroups(lawful);
}, 300_000);

const head = (c: CanonicalCampaign) => {
  const h = c.store.head();
  return { revision: h.revision, state: h.state_sha256, journal: h.journal_head_sha256 };
};

describe("a fresh disposable campaign establishes the lawful viewing and scene rulings under the new citations", () => {
  it("every retained fact carries the citation of its own kind or value class, and the others are not licensed through the scene rule", async () => {
    const c = await openOrdinary(lawful.campaignDir);
    try {
      const facts = c.store.listFacts();
      const viewing = facts.filter((f) => VIEWING_KEY.test(f.key));
      expect(viewing).toHaveLength(1);
      expect(viewing[0]!.provenance.rule).toEqual(WORLD_PC_CURRENT_VIEWING_RULE);
      expect(viewing[0]!.provenance.rule.effective_basis).toBe("pinned-by-spec-lock");
      const byOperation = new Map<string, unknown[]>();
      for (const f of facts.filter((x) => SCENE_KEY.test(x.key))) {
        const op = (f.value as any).operation as string;
        byOperation.set(op, [...(byOperation.get(op) ?? []), f.provenance.rule]);
      }
      const expected: Record<string, unknown> = {
        GM_SCENE_RESOLUTION: REFEREE_SCENE_RULE,
        F014D_DIRECT_PERCEPTION: REFEREE_OBSERVATION_RULE,
        IR_PHYSICAL_PLACEMENT: REFEREE_PHYSICAL_RULE,
      };
      expect(byOperation.get(REFEREE_OP_SCENE)).toHaveLength(2); // the words' classification and the basis's physical ruling
      for (const [op, rules] of byOperation)
        for (const rule of rules) expect(rule, op).toEqual(expected[op] ?? REFEREE_RULE);
      // the kind-level base rule and the other value classes were not touched by the scene lowering
      expect(REFEREE_RULE.effective_basis).toBe(
        "sovereign-approved-not-native-pinned-not-spec-locked",
      );
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  }, 300_000);

  it("the journal replays strictly: reopening twice reproduces the same state and head, and appends nothing", async () => {
    const journal = join(lawful.campaignDir, "journal.jsonl");
    const before = fileSha(journal);
    const heads: unknown[] = [];
    for (let i = 0; i < 2; i++) {
      const c = await openOrdinary(lawful.campaignDir);
      try {
        heads.push(head(c));
        expect(c.verify()).toEqual([]);
      } finally {
        await c.close();
      }
    }
    expect(heads[1]).toEqual(heads[0]);
    expect(fileSha(journal)).toBe(before);
  }, 300_000);
});

describe("the earlier citations are refused as NEW WRITES at admission, and nothing is journalled by the refusal", () => {
  it("a scene decision under the earlier scene citation, the kind-level rule or the observation rule is refused; the identical write under the new citation is admitted", async () => {
    const c = await openOrdinary(copy().campaignDir);
    try {
      const before = head(c);
      // only the governing citation differs from the lawful group: its identities are the ones its task derives, so a refusal can only be
      // about the citation (a refused group is not journalled, so the control below may still use the lawful identities)
      const groupOf = (_n: string, rule: CommitGroup["rule"]): CommitGroup => ({
        ...groups.physical,
        rule,
      });
      for (const [n, rule] of [
        ["earlier", PRE_LOWERING_SCENE_RULE],
        ["kind", REFEREE_RULE],
        ["observation", REFEREE_OBSERVATION_RULE],
        ["viewing", WORLD_PC_CURRENT_VIEWING_RULE],
      ] as const) {
        const refused: any = await c.store.commit(groupOf(n, rule));
        expect(refused.ok, n).toBe(false);
        // refused for its governing citation, not for any other reason
        expect(refused.error.code, n).toBe("VALUE_INVALID");
        expect(refused.error.message, n).toMatch(
          /carries the (scene|direct-perception) governing citation/,
        );
        expect(head(c), `${n}: no journal mutation`).toEqual(before);
      }
      // the control: the very group the lawful path wrote
      const admitted = await c.store.commit({ ...groups.physical });
      expect(admitted.ok, JSON.stringify(admitted)).toBe(true);
      expect(head(c).revision).toBe(before.revision + 1);
    } finally {
      await c.close();
    }
  }, 300_000);

  it("a viewing record under the earlier viewing citation, the scene rule or the kind-level rule is refused; under the new citation it is admitted", async () => {
    const c = await openOrdinary(copy().campaignDir);
    try {
      // the physical ruling the record rests on is committed lawfully first
      expect((await c.store.commit({ ...groups.physical })).ok).toBe(true);
      const before = head(c);
      const groupOf = (n: string, rule: CommitGroup["rule"]): CommitGroup => ({
        ...groups.viewing,
        group_id: `old-viewing-${n}-group`,
        intent_id: `old-viewing-${n}-intent`,
        rule,
      });
      for (const [n, rule] of [
        ["earlier", PRE_LOWERING_VIEWING_RULE],
        ["scene", REFEREE_SCENE_RULE],
        ["kind", REFEREE_RULE],
      ] as const) {
        const refused: any = await c.store.commit(groupOf(n, rule));
        expect(refused.ok, n).toBe(false);
        expect(refused.error.code, n).toBe("VALUE_INVALID");
        expect(refused.error.message, n).toBe(
          "a viewing record carries its own governing citation",
        );
        expect(head(c), `${n}: no journal mutation`).toEqual(before);
      }
      expect(c.store.listFacts().some((f) => VIEWING_KEY.test(f.key))).toBe(false);
      const admitted = await c.store.commit({ ...groups.viewing });
      expect(admitted.ok, JSON.stringify(admitted)).toBe(true);
      expect(c.store.listFacts().filter((f) => VIEWING_KEY.test(f.key))).toHaveLength(1);
    } finally {
      await c.close();
    }
  }, 300_000);

  it("the physical owner's own publication path is unchanged: a retained supported ruling publishes once, and a second attempt adds nothing", async () => {
    const dirs = copy();
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect((await c.store.commit({ ...groups.physical })).ok).toBe(true);
      const taskId = /referee\/([0-9a-f]{64})\/decision/.exec(groups.physical.writes[0]!.key)![1]!;
      const publication = (n: string) => ({
        group_id: `scene:${n}:group`,
        intent_id: `scene:${n}:intent`,
        cause: `scene:${n}:cause`,
        basis: "gm-scene-ruling-publication",
        secrecy: "operator-visible",
        pc_id: PC_ID,
        ruling_task_id: taskId,
      });
      const first = await c.establishPcCurrentViewing(publication("a"));
      expect(first.ok, JSON.stringify(first)).toBe(true);
      const held = c.store.listFacts().filter((f) => VIEWING_KEY.test(f.key));
      expect(held).toHaveLength(1);
      expect(held[0]!.provenance.rule).toEqual(WORLD_PC_CURRENT_VIEWING_RULE);
      const afterFirst = head(c);
      const second = await c.establishPcCurrentViewing(publication("b"));
      expect(second.ok).toBe(false); // sealed: the first established result is preserved
      expect(head(c)).toEqual(afterFirst);
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  }, 300_000);
});

/**
 * A package built by a store with NO admission: the committed groups of a lawful package replayed in journal order into a fresh store,
 * `mutate` altering or dropping each. It is a consistent, replayable history that is not canonical, so only the load verifiers can refuse
 * it (the same device the other recovery suites use, here for ANY campaign id).
 */
async function replayWith(
  srcDir: string,
  mutate: (g: CommitGroup) => CommitGroup,
): Promise<string> {
  const entries = readFileSync(join(srcDir, "journal.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as { group: CommitGroup; receipt: { group_sha256: string } });
  const dir = tempDir();
  const created = await createFileCampaign(dir, {
    campaignId: entries[0]!.group.campaign_id,
    owners: CANONICAL_OWNER_REGISTRY,
  });
  if (!created.ok) throw new Error(`rogue store: ${JSON.stringify(created.error)}`);
  const store = created.value;
  // a mutated group has a new receipt digest; later groups that cite it follow it
  const renamed = new Map<string, string>();
  for (const e of entries) {
    let text = JSON.stringify(e.group);
    for (const [from, to] of renamed) text = text.replaceAll(from, to);
    const committed = await store.commit(mutate(JSON.parse(text) as CommitGroup));
    if (!committed.ok) throw new Error(`rogue replay: ${JSON.stringify(committed.error)}`);
    if (committed.value.receipt.group_sha256 !== e.receipt.group_sha256)
      renamed.set(e.receipt.group_sha256, committed.value.receipt.group_sha256);
  }
  await store.close();
  return dir;
}

const isViewing = (g: CommitGroup) => g.writes.some((w) => VIEWING_KEY.test(w.key));
const isScene = (g: CommitGroup) =>
  g.writes.some((w) => SCENE_KEY.test(w.key) && (w.value as any).operation === REFEREE_OP_SCENE);

async function openRefusal(dir: string) {
  const journal = join(dir, "journal.jsonl");
  const before = fileSha(journal);
  const opened = await CanonicalCampaign.open(dir, { buildId: "current-look-citation-test" });
  const after = fileSha(journal);
  expect(after, "the refused open appended, truncated or rewrote nothing").toBe(before);
  if (opened.ok) {
    await opened.value.close();
    return { ok: true as const };
  }
  return {
    ok: false as const,
    code: opened.error.code,
    violations: (
      (opened.error.details?.["violations"] ?? []) as { code: string; key: string }[]
    ).map((v) => v.code),
  };
}

describe("a history that carries the earlier citations is refused at load: fail closed, no legacy reader, no journal mutation", () => {
  it("the control: the lawful history, replayed through the same store unchanged, opens", async () => {
    const dir = await replayWith(lawful.campaignDir, (g) => g);
    expect(await openRefusal(dir)).toEqual({ ok: true });
  }, 300_000);

  it("a viewing fact under the earlier viewing citation, a scene decision under the earlier scene citation, or both, is refused as CANON_INTEGRITY", async () => {
    const cases: Record<string, (g: CommitGroup) => CommitGroup> = {
      "earlier viewing citation": (g) =>
        isViewing(g) ? { ...g, rule: PRE_LOWERING_VIEWING_RULE } : g,
      "earlier scene citation": (g) => (isScene(g) ? { ...g, rule: PRE_LOWERING_SCENE_RULE } : g),
      "both earlier citations": (g) =>
        isViewing(g)
          ? { ...g, rule: PRE_LOWERING_VIEWING_RULE }
          : isScene(g)
            ? { ...g, rule: PRE_LOWERING_SCENE_RULE }
            : g,
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const dir = await replayWith(lawful.campaignDir, mutate);
      const refused = await openRefusal(dir);
      expect(refused.ok, name).toBe(false);
      if (!refused.ok) {
        expect(refused.code, name).toBe("CANON_INTEGRITY");
        // the citation is the drift: RULE_DRIFT, and the verifier of the kind that carries it names it as well
        expect(refused.violations, name).toContain("RULE_DRIFT");
        if (name !== "earlier scene citation")
          expect(refused.violations, name).toContain("SCENE_STATE");
        if (name !== "earlier viewing citation")
          expect(refused.violations, name).toContain("REFEREE_STATE");
      }
    }
  }, 600_000);
});

describe("the seven engine-derived scene verdicts: only VIEWING_SUPPORTED reaches the physical owner", () => {
  const WORDS = "after I climb onto the wall";
  const VETO = /ordinary, fully functioning colour vision/;
  type Case = {
    verdict: string;
    statement: string | null;
    answer: (doc: any) => any;
  };
  const supported = (doc: any) => sceneAnswer(doc);
  const cases: Case[] = [
    { verdict: "VIEWING_SUPPORTED", statement: null, answer: supported },
    {
      verdict: "VIEWING_NOT_SUPPORTED",
      statement: null,
      answer: (doc) => sceneAnswer(doc, { vetoes: VETO }),
    },
    {
      // no lawful negative support and not affirmatively supported: uncertainty, never obstruction
      verdict: "VIEWING_UNRESOLVED",
      statement: null,
      answer: (doc) => {
        const a: any = sceneAnswer(doc);
        a.viewing.state = "NOT_ESTABLISHED";
        a.viewing.premises = [];
        a.viewing.statement = null;
        return a;
      },
    },
    { verdict: "PLAYER_CHOICE_REQUIRED", statement: WORDS, answer: (doc) => sceneAnswer(doc) },
    { verdict: "LOOK_ORDINARY", statement: LOOK, answer: (doc) => sceneAnswer(doc) },
    {
      verdict: "LOOK_UNCLEAR",
      statement: LOOK,
      answer: (doc) => {
        const a: any = sceneAnswer(doc);
        a.viewing.request.classification = "UNCLEAR";
        return a;
      },
    },
    {
      // a delivered fact the host finds contradicted: a conflict, never an invented obstruction
      verdict: "SCENE_WORLD_CONFLICT",
      statement: null,
      answer: (doc) => {
        const a: any = sceneAnswer(doc);
        const fact = doc.context.facts[0];
        a.assessments[0] = {
          fact_id: fact.fact_id,
          relation: "CONTRADICTS",
          rule_ids: ["IR-7"],
          grounds: "scripted host: contradicts the delivered world fact",
          evidence_quote: fact.text.slice(0, 12),
        };
        return a;
      },
    },
  ];

  for (const c of cases)
    it(`${c.verdict}: derived by the engine from the answer, retained as sealed evidence${c.verdict === "VIEWING_SUPPORTED" ? ", and published once by the physical owner" : ", and published by nobody"}`, async () => {
      const campaign = await openOrdinary(copy().campaignDir);
      try {
        const adapter = new RefereeAdjudicationAdapter(campaign.store);
        const task = adapter.viewingTask({
          pc_id: PC_ID,
          attempt: 0,
          request: { kind: "LOOK", statement: c.statement },
        });
        if (!task.ok) throw new Error(JSON.stringify(task.error));
        const doc = { task_id: task.value.task_id, context: task.value.context };
        const answer = c.answer(doc);
        // the verdict is the engine's: it is derived from the answer, never read from it
        expect(JSON.stringify(answer)).not.toContain(c.verdict);
        const evaluated: any = adapter.evaluateScene(doc.context, answer);
        expect(evaluated.ok, JSON.stringify(evaluated)).toBe(true);
        expect(evaluated.value.verdict).toBe(c.verdict);
        const recorded: any = await adapter.recordScene({
          operation: { ...REFEREE_AUTHORITY },
          host: { host_id: "engine-direct-test", claimed_model: null },
          pc_id: PC_ID,
          attempt: 0,
          kind: "CURRENT_VIEWING",
          request: { kind: "LOOK", statement: c.statement },
          answer,
        } as any);
        expect(recorded.ok, JSON.stringify(recorded)).toBe(true);
        expect(recorded.value.verdict).toBe(c.verdict);
        const retained = campaign.store.getFact(refereeDecisionKey(doc.task_id))!;
        expect(retained.provenance.rule).toEqual(REFEREE_SCENE_RULE);
        const published = await campaign.establishPcCurrentViewing({
          group_id: "scene:v:group",
          intent_id: "scene:v:intent",
          cause: "scene:v:cause",
          basis: "gm-scene-ruling-publication",
          secrecy: "operator-visible",
          pc_id: PC_ID,
          ruling_task_id: doc.task_id,
        });
        const viewing = campaign.store.listFacts().filter((f) => VIEWING_KEY.test(f.key));
        if (c.verdict === "VIEWING_SUPPORTED") {
          expect(published.ok, JSON.stringify(published)).toBe(true);
          expect(viewing).toHaveLength(1);
          expect(viewing[0]!.provenance.rule).toEqual(WORLD_PC_CURRENT_VIEWING_RULE);
        } else {
          expect(published.ok).toBe(false);
          expect(viewing).toHaveLength(0);
        }
        expect(campaign.verify()).toEqual([]);
      } finally {
        await campaign.close();
      }
    }, 300_000);
});

describe("the scene citation admits the scene operation's real retained record and no other operation's", () => {
  it("every retained decision of the lawful history is admitted by exactly its own citation", async () => {
    const c = await openOrdinary(lawful.campaignDir);
    try {
      const alternates = REFEREE_FACT_KINDS[0]!.alternateRules!;
      const [, , scene] = alternates;
      expect(scene!.rule).toBe(REFEREE_SCENE_RULE);
      const decisions = c.store.listFacts().filter((f) => SCENE_KEY.test(f.key));
      const operations = new Set(decisions.map((f) => (f.value as any).operation as string));
      expect(operations.has("GM_SCENE_RESOLUTION")).toBe(true);
      expect(operations.has("F014D_DIRECT_PERCEPTION")).toBe(true);
      expect(operations.size).toBeGreaterThanOrEqual(3);
      for (const f of decisions) {
        const op = (f.value as any).operation as string;
        expect(scene!.admits(f.value), `${op} by the scene rule`).toBe(
          op === "GM_SCENE_RESOLUTION",
        );
        // and by the alternate that names it, when it has one
        if (op === "F014D_DIRECT_PERCEPTION") expect(alternates[1]!.admits(f.value)).toBe(true);
        if (op === "IR_PHYSICAL_PLACEMENT") expect(alternates[0]!.admits(f.value)).toBe(true);
        expect(alternates[1]!.admits(f.value), `${op} by the observation rule`).toBe(
          op === "F014D_DIRECT_PERCEPTION",
        );
        expect(alternates[0]!.admits(f.value), `${op} by the physical rule`).toBe(
          op === "IR_PHYSICAL_PLACEMENT",
        );
      }
    } finally {
      await c.close();
    }
  }, 300_000);
});
