// ENFORCEMENT of the AI referee seam (PR #61, BLUE B61-A3) through the shipped `author-character` command.
//
// TRUTH LEVEL. Every "host" in this file is a SCRIPTED policy the test wrote (see tests/support/original-pc.ts). These tests prove
// PLUMBING and ENFORCEMENT only: that the engine asks, vouches for the host, validates the answer against the delivered text, derives
// the verdict itself, refuses to offer a keep or a placement it did not derive, and writes nothing when the question is not closed.
// They prove NOTHING about whether any AI understood any sentence; that is a separate, labelled, live exercise.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { pendingTasks, proofOf, readTask, refereeDir, secretPath } from "@immortalis/operator";
import { headOf, type setupDoc } from "../support/locality.ts";
import {
  HOST_ID,
  PC_ID,
  STANDARD,
  WORDS,
  author,
  localityCampaign,
  me,
  plainPolicy,
  respondingConsole,
  scriptedConsole,
  scriptedPolicy,
  startScriptedHost,
  type Line,
  type Policy,
} from "../support/original-pc.ts";
import { LOCALITY_CAMPAIGN } from "../support/locality.ts";

const KEEP_LAST: Line = (said) => {
  for (let i = said.length - 1; i >= 0; i--) {
    const m = /type exactly "(keep-character [0-9a-f]{12})"/.exec(said[i]!);
    if (m) return m[1]!;
  }
  throw new Error("no keep phrase was printed");
};
const text = (said: readonly string[]) => said.join("\n");

const OFFICE = "I hold the legal office of governor of this city";
const GUARDS = "A hundred independent sworn soldiers answer my orders";
const ELICIT_WITH = (identity: string): Line[] => [
  identity,
  WORDS.contact,
  "",
  WORDS.embodiment,
  WORDS.continuity,
  "",
  "",
  "",
];

const withCampaign = async <T>(dir: string, work: (c: CanonicalCampaign) => Promise<T>) => {
  const opened = await CanonicalCampaign.open(dir, { buildId: "test-independent" });
  if (!opened.ok) throw new Error("did not open");
  try {
    return await work(opened.value);
  } finally {
    await opened.value.close();
  }
};

const offices = scriptedPolicy({
  classify: [
    { match: /governor/, class: "WORLD_STATE_ASSERTION" },
    { match: /soldiers/, class: "ACTOR_STANCE_CLAIM" },
  ],
});

describe("I-002: the keep is offered only when the engine derives CLOSED from the referee's answer on exactly this candidate", () => {
  it("an office claim: shown with the referee's finding, no keep phrase, nothing written", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await author(
      dirs,
      scriptedConsole(...ELICIT_WITH(OFFICE), "no"),
      {},
      offices,
    );
    expect(result.status).toBe("DECLINED");
    const said = text(terminal.said);
    expect(said).toContain("NOT accepted: WORLD_STATE_ASSERTION");
    expect(said).toContain("cannot be kept yet");
    expect(said).not.toMatch(/type exactly "keep-character/);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("a follower claim at possession is not the character's own; removing it in a revision gives a keep, and only then a release", async () => {
    const dirs = await localityCampaign();
    const { result, terminal } = await author(
      dirs,
      scriptedConsole(
        WORDS.identityFirst,
        WORDS.contact,
        "",
        WORDS.embodiment,
        WORDS.continuity,
        "",
        "",
        GUARDS,
        "",
        "change",
        "remove possession 1",
        "",
        KEEP_LAST,
        "",
      ),
      {},
      offices,
    );
    expect(result.status, JSON.stringify(result.details) + text(terminal.said)).toBe(
      "CHARACTER_RELEASED_UNBOUND",
    );
    const said = text(terminal.said);
    expect(said).toContain("NOT accepted: ACTOR_STANCE_CLAIM");
    await withCampaign(dirs.campaignDir, async (c) => {
      expect(JSON.stringify(c.playerCharacter(PC_ID)!.value)).not.toContain("soldiers");
    });
  }, 60_000);

  it("a MIXED statement is not applied for the player: the part that is theirs is offered, not substituted", async () => {
    const dirs = await localityCampaign();
    const mixed = `${WORDS.identityFirst} and I am the baron of this marsh`;
    const policy: Policy = (doc) => {
      const base = plainPolicy(doc) as { items?: Record<string, unknown>[] };
      if (doc["operation"] !== "I002_CLASSIFY") return base;
      return {
        ...base,
        items: base.items!.map((i) =>
          i["slot"] === "identity"
            ? {
                ...i,
                class: "MIXED",
                rule_ids: ["I002-6.6"],
                grounds: "scripted host: the baron claim goes beyond the character",
                evidence_quote: "I am the baron of this marsh",
                intrinsic_excerpt: WORDS.identityFirst,
                other_classes: ["WORLD_STATE_ASSERTION"],
              }
            : i,
        ),
      };
    };
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await author(
      dirs,
      scriptedConsole(...ELICIT_WITH(mixed), "no"),
      {},
      policy,
    );
    expect(result.status).toBe("DECLINED");
    expect(text(terminal.said)).toContain("the part that is yours");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("an ambiguous statement is put back to the player as the referee's one question, with no keep", async () => {
    const dirs = await localityCampaign();
    const policy = scriptedPolicy({ classify: [{ match: /somewhat/, class: "AMBIGUOUS" }] });
    const { result, terminal } = await author(
      dirs,
      scriptedConsole(...ELICIT_WITH("I am somewhat known around here"), "no"),
      {},
      policy,
    );
    expect(result.status).toBe("DECLINED");
    const said = text(terminal.said);
    expect(said).toContain("question for you");
    expect(said).not.toMatch(/type exactly "keep-character/);
  }, 60_000);
});

describe("the referee seam fails closed", () => {
  it("no host bound: nothing is asked of the player, nothing is written, and nothing human or scripted stands in", async () => {
    const dirs = await localityCampaign();
    rmSync(refereeDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }), {
      recursive: true,
    });
    const before = await headOf(dirs.campaignDir);
    const { result, terminal } = await author(dirs, scriptedConsole(), {}, null);
    expect(result.status).toBe("REFEREE_UNAVAILABLE");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("a host that has not answered is PENDING, never a verdict; the same question is found again with the answer it later receives", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const silent = await author(
      dirs,
      respondingConsole(STANDARD),
      { refereePolls: 2, refereePollMs: 1 },
      null,
    );
    expect(silent.result.status).toBe("REFEREE_PENDING");
    expect(await headOf(dirs.campaignDir)).toEqual(before);
    const later = await author(dirs, respondingConsole(STANDARD));
    expect(later.result.status).toBe("CHARACTER_BOUND");
  }, 60_000);

  it("a forged proof is never used: every attempt is set aside and the command ends without a verdict or a write", async () => {
    const dirs = await localityCampaign();
    const p = { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN };
    let stopped = false;
    const forged = new Set<string>();
    const loop = (async () => {
      while (!stopped) {
        try {
          for (const t of await pendingTasks(p)) {
            if (forged.has(t.task_id)) continue;
            const task = await readTask(p, t.task_id);
            if (!task.ok) continue;
            const answer = plainPolicy(task.value.document);
            const file = join(refereeDir(p), "decisions", `${t.task_id}.json`);
            writeFileSync(
              file,
              JSON.stringify({
                format: "immortalis-operator-referee-decision",
                format_version: 1,
                task_id: t.task_id,
                host_id: HOST_ID,
                claimed_model: null,
                answer,
                proof: "0".repeat(64),
              }),
              { flag: "wx" },
            );
            forged.add(t.task_id);
          }
        } catch {
          // not yet created
        }
        await new Promise((r) => setTimeout(r, 5));
      }
    })();
    const before = await headOf(dirs.campaignDir);
    try {
      const { result } = await author(dirs, respondingConsole(STANDARD), {}, null);
      expect(result.status).toBe("REFEREE_ANSWER_REFUSED");
    } finally {
      stopped = true;
      await loop;
    }
    expect(forged.size).toBeGreaterThan(1);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("an answer altered after the host signed it, or signed for another task, is not vouched for", async () => {
    const dirs = await localityCampaign();
    const p = { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN };
    const secret = readFileSync(secretPath(p, HOST_ID), "utf8").trim();
    let stopped = false;
    const done = new Set<string>();
    const loop = (async () => {
      while (!stopped) {
        try {
          for (const t of await pendingTasks(p)) {
            if (done.has(t.task_id)) continue;
            const task = await readTask(p, t.task_id);
            if (!task.ok) continue;
            const answer = plainPolicy(task.value.document) as { items: Record<string, unknown>[] };
            // signed for the CORRECT answer, then one item's grounds changed
            const proof = proofOf(secret, t.task_id, task.value.nonce, null, answer);
            const altered = {
              ...answer,
              items: answer.items.map((i, n) => (n === 0 ? { ...i, grounds: "changed later" } : i)),
            };
            writeFileSync(
              join(refereeDir(p), "decisions", `${t.task_id}.json`),
              JSON.stringify({
                format: "immortalis-operator-referee-decision",
                format_version: 1,
                task_id: t.task_id,
                host_id: HOST_ID,
                claimed_model: null,
                answer: altered,
                proof,
              }),
              { flag: "wx" },
            );
            done.add(t.task_id);
          }
        } catch {
          // not yet created
        }
        await new Promise((r) => setTimeout(r, 5));
      }
    })();
    try {
      const { result } = await author(dirs, respondingConsole(STANDARD), {}, null);
      expect(result.status).toBe("REFEREE_ANSWER_REFUSED");
    } finally {
      stopped = true;
      await loop;
    }
  }, 60_000);

  it("an answer that does not cover every delivered item is set aside and the question is asked again; the later valid answer is the one used", async () => {
    const dirs = await localityCampaign();
    let first = true;
    const policy: Policy = (doc) => {
      const a = plainPolicy(doc) as { items?: unknown[] };
      if (doc["operation"] === "I002_CLASSIFY" && first) {
        first = false;
        return { ...a, items: a.items!.slice(1) };
      }
      return a;
    };
    const { result } = await author(dirs, respondingConsole(STANDARD), {}, policy);
    expect(result.status).toBe("CHARACTER_BOUND");
    const sets = readdirSync(
      join(refereeDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }), "decisions"),
    ).filter((f) => f.endsWith(".rejected.json"));
    expect(sets).toHaveLength(1);
  }, 60_000);

  it("an answer for the wrong operation or by an unbound host is not accepted by the exchange", async () => {
    const dirs = await localityCampaign();
    const p = { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN };
    mkdirSync(join(refereeDir(p), "decisions"), { recursive: true });
    // no task exists: nothing can be answered
    const { submitDecision } = await import("@immortalis/operator");
    const w = await submitDecision(
      { ...p, operatorUid: process.getuid!() },
      {
        host_id: HOST_ID,
        secret: "0".repeat(64),
        task_id: "f".repeat(64),
        claimed_model: null,
        answer: {},
      },
    );
    expect(w.ok).toBe(false);
  }, 30_000);
});

const doc = (mutate: (d: ReturnType<typeof setupDoc>) => void) => mutate;

describe("IR: a native presence binds only when the engine derives BIND_ELIGIBLE from the referee's reading of the committed world", () => {
  const conflicts: [string, (d: ReturnType<typeof setupDoc>) => void, RegExp][] = [
    [
      "a contradiction that exists only in the world premise",
      doc((d) => {
        d.world.premise = "A marsh in which no human has ever lived.";
      }),
      /no human has ever lived/,
    ],
    [
      "a contradiction that exists only in the established canon",
      doc((d) => {
        d.world.reference_causal_basis.established_canon =
          "Ashfall Marsh is invented; nothing that breathes has ever lived there.";
      }),
      /nothing that breathes has ever lived/,
    ],
    [
      "a world constraint",
      doc((d) => {
        d.world.insertion_supporting_constraints = [
          { aspect: "inhabitants", statement: "No humans have ever lived in the marsh." },
        ];
      }),
      /No humans have ever lived/,
    ],
    [
      "a locus constraint",
      doc((d) => {
        d.locus.constraints = [
          { aspect: "access", statement: "Nothing that breathes may enter the salt pans." },
        ];
      }),
      /Nothing that breathes/,
    ],
    [
      "a world-law departure",
      doc((d) => {
        d.world.material_world_law_departures = ["Living flesh cannot cross the tideline."];
      }),
      /Living flesh cannot cross/,
    ],
  ];
  for (const [name, mutate, re] of conflicts) {
    it(`${name}: the character stays released and unbound`, async () => {
      const dirs = await localityCampaign(mutate);
      const { result, terminal } = await author(
        dirs,
        respondingConsole(STANDARD),
        {},
        scriptedPolicy({ ir: { contradicts: re } }),
      );
      expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      expect(text(terminal.said)).toContain("CONTRADICTS");
      expect(text(terminal.said)).not.toMatch(/type exactly "place-character/);
      await withCampaign(dirs.campaignDir, async (c) => {
        expect(c.playerCharacter(PC_ID)).toBeDefined();
        expect(c.binding()).toBeUndefined();
      });
    }, 60_000);
  }

  it("a constraint that does not bear on the character does not block: no blanket refusal on a non-empty constraint list", async () => {
    const dirs = await localityCampaign((d) => {
      d.world.insertion_supporting_constraints = [
        { aspect: "weather", statement: "The wind is always from the west." },
      ];
    });
    const { result } = await author(dirs, respondingConsole(STANDARD));
    expect(result.status).toBe("CHARACTER_BOUND");
  }, 60_000);

  it("a referee that cannot tell is UNRESOLVED: the player is asked, and nothing is bound", async () => {
    const dirs = await localityCampaign((d) => {
      d.world.insertion_supporting_constraints = [
        { aspect: "customs", statement: "Outsiders are not spoken of." },
      ];
    });
    const { result, terminal } = await author(
      dirs,
      respondingConsole(STANDARD),
      {},
      scriptedPolicy({ ir: { unclear: /Outsiders/ } }),
    );
    expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(text(terminal.said)).toContain("UNCLEAR");
    await withCampaign(dirs.campaignDir, async (c) => expect(c.binding()).toBeUndefined());
  }, 60_000);

  it("a portal or arrival is not a native presence: nothing is invented, nothing is bound", async () => {
    const dirs = await localityCampaign();
    const { result, terminal } = await author(
      dirs,
      scriptedConsole(
        ...ELICIT_WITH(me(WORDS.identityFirst)),
        KEEP_LAST,
        "I arrived here through a portal from elsewhere",
      ),
      {},
      scriptedPolicy({ ir: { bridge: { match: /portal/, mode: "PORTAL" } } }),
    );
    expect(result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    const said = text(terminal.said);
    expect(said).toContain("PORTAL");
    expect(said).not.toMatch(/type exactly "place-character/);
    await withCampaign(dirs.campaignDir, async (c) => expect(c.binding()).toBeUndefined());
  }, 60_000);
});

describe("the host's authority is the engine's, not the host's", () => {
  it("a host that is not bound to the IR operation is not heard for it", async () => {
    const dirs = await localityCampaign();
    // rebind the campaign to a host allowed only the I-002 operation
    const p = { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN };
    const cfgPath = join(refereeDir(p), "config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    cfg.hosts[0].operations = ["I002_CLASSIFY"];
    writeFileSync(cfgPath, JSON.stringify(cfg));
    const host = startScriptedHost(dirs);
    try {
      const { result } = await author(
        dirs,
        respondingConsole(STANDARD),
        { refereePolls: 30, refereePollMs: 5 },
        null,
      );
      // the character is released on the I-002 answer, but the IR question is never answered by a host not bound to it
      expect(["CHARACTER_RELEASED_UNBOUND", "REFEREE_PENDING"]).toContain(result.status);
      await withCampaign(dirs.campaignDir, async (c) => expect(c.binding()).toBeUndefined());
    } finally {
      await host.stop();
    }
  }, 60_000);
});
