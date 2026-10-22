/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw scripted-host documents */
// BLUE v5.2-A1 — NON-PC NAMED-ACTOR SOURCE-QUALIFIED DIRECT PERCEPTION through the trusted operator command (`observe-actor`) and the REAL
// referee file exchange. The request is the trusted operator's, never a host's or a model's; one separate typed confirmation names the actor,
// the capability and the source; the host is asked ONE bounded question and answers through the exchange; the engine validates the answer
// and derives the verdict; only an established reading earns a receipt; and the operator is shown ids, never the actor's packet. The scripted
// host is a policy the test wrote (plumbing only: no claim about any AI's reading).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  actorObservationEventId,
  verifyEpistemicIntegrity,
  verifyRefereeIntegrity,
} from "@immortalis/engine";
import { accessEventKey, accessPacketKey } from "@immortalis/contracts";
import { runCli } from "@immortalis/operator";
import { ACTOR_BOUNDARY_T, ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import {
  ACTOR,
  ALL_OPERATIONS,
  BURIED,
  FIXTURE_CAMPAIGN,
  NEUTRAL_CONTENT,
  NEUTRAL_REFERENT,
  SECRET,
  SIGHT,
  SOURCE,
  SOURCE_ELSEWHERE,
  SOURCE_OTHER,
  actorAnswer,
  actorPolicy,
  actorScene,
  bindActorHost,
  freshActorDirs,
  observeActorCommand,
  verbConsole,
  type ActorPolicy,
  type ActorSceneOptions,
  type LocalityDirs,
} from "../support/actor-observation.ts";

const eventId = actorObservationEventId(ACTOR, ACTOR_BOUNDARY_T);

async function operatorScene(o: ActorSceneOptions = {}, bind = true): Promise<LocalityDirs> {
  const dirs = freshActorDirs();
  const s = await actorScene(dirs.campaignDir, o);
  await s.campaign.close();
  if (bind) await bindActorHost(dirs);
  return dirs;
}

async function reopen(dirs: LocalityDirs) {
  const opened = await CanonicalCampaign.open(dirs.campaignDir, {
    buildId: "actor-observation-operator-reader",
    extension: ACTOR_FIXTURE_EXTENSION,
    reclaimStaleLock: true,
  });
  if (!opened.ok) throw new Error(`did not open: ${JSON.stringify(opened.error)}`);
  return opened.value;
}
const accessKeys = async (dirs: LocalityDirs) => {
  const c = await reopen(dirs);
  try {
    return c.store
      .listFacts()
      .filter((f) => f.key.startsWith("access/"))
      .map((f) => f.key)
      .sort();
  } finally {
    await c.close();
  }
};
const revision = async (dirs: LocalityDirs) => {
  const c = await reopen(dirs);
  try {
    return c.store.head().revision;
  } finally {
    await c.close();
  }
};

describe("observe-actor: the trusted operator's request earns the actor's receipt through the real exchange", () => {
  it("asks the host once, records the event and the actor's packet, and shows the operator only identities", async () => {
    const dirs = await operatorScene();
    const seen: any[] = [];
    const policy: ActorPolicy = (doc) => {
      seen.push(doc);
      return actorPolicy()(doc);
    };
    const run = await observeActorCommand(dirs, verbConsole("observe-actor"), {}, policy);
    expect(run.result.status, JSON.stringify(run.result)).toBe("ACTOR_OBSERVATION_RECORDED");
    expect(run.terminal.asked()).toBe(1);
    // exactly one question was answered, by the host the trusted binding named
    expect(run.host!.answered).toHaveLength(1);
    expect(run.result.details).toEqual([
      `campaign: ${FIXTURE_CAMPAIGN}`,
      `actor: ${ACTOR}`,
      `basis: ${ACTOR_BOUNDARY_T.value} ${ACTOR_BOUNDARY_T.unit} (unchanged)`,
      `event: ${accessEventKey(eventId)}`,
      `packet: ${accessPacketKey(eventId, ACTOR)}`,
    ]);
    // the operator is NEVER shown the appearance (it is the actor's), the setting, the secrets or the host's reasoning
    const shown = JSON.stringify([run.result, run.terminal.said]);
    for (const hidden of [
      NEUTRAL_CONTENT,
      NEUTRAL_REFERENT,
      SECRET.material,
      SECRET.statement,
      "120",
      "full view",
      "stone hall",
      "scripted host",
    ])
      expect(shown).not.toContain(hidden);
    // the confirmation states what is asked and what is not decided
    expect(run.terminal.said.join("\n")).toMatch(/OBSERVE ACTOR - a separate, fresh choice/);
    expect(run.terminal.said.join("\n")).toMatch(
      /decides nothing about what the actor makes of it/,
    );

    // the host's document: the source's access facts only, never its key, quantity, material, dimension or statement
    expect(seen.length).toBeGreaterThan(0);
    const doc = seen[0];
    expect(doc.operation).toBe("F014D_ACTOR_DIRECT_PERCEPTION");
    const sent = JSON.stringify(doc);
    for (const hidden of [SOURCE, SECRET.material, SECRET.dimension, SECRET.statement, "120"])
      expect(sent).not.toContain(hidden);
    expect(sent).toContain("(the scoped source: withheld)");
    expect(doc.context.facts.some((f: any) => f.fact_id === "source.access.1")).toBe(true);

    // a fresh owner-verified open reads exactly the records back
    expect(await accessKeys(dirs)).toEqual(
      [
        accessEventKey(eventId),
        accessPacketKey(eventId, ACTOR),
        `access/${eventId}/provenance/${ACTOR}`,
      ].sort(),
    );
    const c = await reopen(dirs);
    try {
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      expect(verifyRefereeIntegrity(c.store)).toEqual([]);
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  });

  it("running it again at the same basis reaches the same records: nothing is asked, confirmed or written", async () => {
    const dirs = await operatorScene();
    const first = await observeActorCommand(dirs);
    expect(first.result.status).toBe("ACTOR_OBSERVATION_RECORDED");
    const before = await revision(dirs);
    const again = await observeActorCommand(dirs, verbConsole("observe-actor"));
    expect(again.result.status).toBe("ACTOR_OBSERVATION_RECORDED");
    expect(again.terminal.asked()).toBe(0);
    expect(again.host!.answered).toHaveLength(0);
    expect(await revision(dirs)).toBe(before);
    expect(again.result.details).toEqual(first.result.details);
  });

  it("a declined confirmation observes nothing and changes nothing", async () => {
    const dirs = await operatorScene();
    const before = await revision(dirs);
    const run = await observeActorCommand(dirs, verbConsole("observe-actor", false));
    expect(run.result.status).toBe("DECLINED");
    expect(run.host!.answered).toHaveLength(0);
    expect(await revision(dirs)).toBe(before);
    expect(await accessKeys(dirs)).toEqual([]);
  });

  it("a confirmation typed for another verb is no confirmation", async () => {
    const dirs = await operatorScene();
    const run = await observeActorCommand(dirs, verbConsole("observe-surroundings"));
    expect(run.result.status).toBe("DECLINED");
    expect(await accessKeys(dirs)).toEqual([]);
  });
});

describe("observe-actor: every non-receipt is the same message, and a retained reading is never re-asked", () => {
  const cases: Record<string, { scene?: ActorSceneOptions; policy?: ActorPolicy }> = {
    "the source is buried": { scene: { access: [{ aspect: "exposure", statement: BURIED }] } },
    "the actor has no sense it can cite": { policy: actorPolicy({ noFaculty: true }) },
    "the viewing circumstances are not established": { policy: actorPolicy({ noPosition: true }) },
    "the path is unsettled": { policy: actorPolicy({ pathUnknown: true }) },
  };
  it("tells an obstruction, an unsettled premise and an absence apart from none of them", async () => {
    const messages = new Set<string>();
    for (const [name, c] of Object.entries(cases)) {
      const dirs = await operatorScene(c.scene ?? {});
      const run = await observeActorCommand(dirs, undefined, {}, c.policy ?? actorPolicy());
      expect(run.result.status, name).toBe("ACTOR_OBSERVATION_NOT_ESTABLISHED");
      messages.add(JSON.stringify([run.result.message, run.result.details]));
      expect(await accessKeys(dirs), name).toEqual([]);
      // the retained reading is sealed evidence; running it again asks nobody and confirms nothing
      const answeredBefore = run.host!.answered.length;
      const again = await observeActorCommand(dirs, verbConsole("observe-actor"));
      expect(again.result.status, name).toBe("ACTOR_OBSERVATION_NOT_ESTABLISHED");
      expect(again.terminal.asked(), name).toBe(0);
      expect(again.host!.answered, name).toHaveLength(0);
      expect(answeredBefore).toBe(1);
    }
    expect(messages.size).toBe(1);
  });
});

describe("observe-actor: what cannot be asked is refused before the player is asked anything", () => {
  it("refuses invalid identities, an absent or mislocated source and an unbound capability with nothing changed", async () => {
    const dirs = await operatorScene({ otherLocus: true, otherSource: true });
    const before = await revision(dirs);
    for (const over of [
      { actorId: "not a valid id!" },
      { capabilityId: "" },
      { sourceKey: "source never committed" },
      { sourceKey: "source-never-committed" },
      { sourceKey: SOURCE_ELSEWHERE },
      { capabilityId: "keen-hearing" },
      { actorId: "actor-other" },
    ]) {
      const run = await observeActorCommand(dirs, verbConsole("observe-actor"), over);
      expect(
        ["INVALID_REQUEST", "ACTOR_OBSERVATION_NOT_AVAILABLE"],
        JSON.stringify(over),
      ).toContain(run.result.status);
      expect(run.terminal.asked()).toBe(0);
      expect(run.host!.answered).toHaveLength(0);
    }
    expect(await revision(dirs)).toBe(before);
  });

  it("an observation of another source holds the basis: it is never shown as, nor replaced by, the requested one", async () => {
    const dirs = await operatorScene({ otherSource: true });
    expect((await observeActorCommand(dirs)).result.status).toBe("ACTOR_OBSERVATION_RECORDED");
    const before = await revision(dirs);
    const other = await observeActorCommand(dirs, verbConsole("observe-actor"), {
      sourceKey: SOURCE_OTHER,
    });
    expect(other.result.status).toBe("ACTOR_OBSERVATION_NOT_AVAILABLE");
    expect(other.terminal.asked()).toBe(0);
    expect(await revision(dirs)).toBe(before);
  });

  it("is unavailable when no host is bound, and pending (nothing changed) when the bound host is not bound to this operation", async () => {
    const unbound = await operatorScene({}, false);
    const a = await observeActorCommand(unbound, verbConsole("observe-actor"), {}, null);
    expect(a.result.status).toBe("REFEREE_UNAVAILABLE");
    expect(await accessKeys(unbound)).toEqual([]);

    const dirs = await operatorScene({}, false);
    await bindActorHost(
      dirs,
      ALL_OPERATIONS.filter((o) => o !== "F014D_ACTOR_DIRECT_PERCEPTION"),
    );
    const before = await revision(dirs);
    const b = await observeActorCommand(
      dirs,
      verbConsole("observe-actor"),
      { refereePolls: 6, refereePollMs: 5 },
      actorPolicy(),
    );
    expect(b.result.status).toBe("REFEREE_PENDING");
    // the host was refused at the exchange for this operation: nothing it said was used
    expect(b.host!.answered).toHaveLength(0);
    expect(await revision(dirs)).toBe(before);
  });

  it("sets aside an answer the engine cannot validate and asks again; the invalid answer is never used", async () => {
    const dirs = await operatorScene();
    let asked = 0;
    const policy: ActorPolicy = (doc) => {
      if (doc["operation"] !== "F014D_ACTOR_DIRECT_PERCEPTION") return null;
      asked++;
      const good: any = actorAnswer(doc);
      // the first attempt quotes words the premise does not contain
      if (doc["context"].attempt === 0)
        good.faculty.premises[0].evidence_quote = "perfect eyesight";
      return good;
    };
    const run = await observeActorCommand(dirs, undefined, {}, policy);
    expect(run.result.status, JSON.stringify(run.result)).toBe("ACTOR_OBSERVATION_RECORDED");
    expect(asked).toBeGreaterThanOrEqual(2);
    const c = await reopen(dirs);
    try {
      const decisions = c.store.listFacts().filter((f) => f.key.startsWith("referee/"));
      expect(decisions).toHaveLength(1);
      expect((decisions[0]!.value as any).attempt).toBe(1);
    } finally {
      await c.close();
    }
  });
});

describe("the command line", () => {
  it("runs observe-actor with the embedding's owner registrations, and the shipped usage names it", async () => {
    const dirs = await operatorScene();
    const lines: string[] = [];
    const host = (await import("../support/actor-observation.ts")).startActorHost(
      dirs,
      actorPolicy(),
    );
    try {
      const code = await runCli(
        [
          "observe-actor",
          "--campaign",
          dirs.campaignDir,
          "--campaign-id",
          FIXTURE_CAMPAIGN,
          "--operator-dir",
          dirs.operatorDir,
          "--actor",
          ACTOR,
          "--capability",
          SIGHT,
          "--source",
          SOURCE,
        ],
        {
          terminal: verbConsole("observe-actor"),
          extension: ACTOR_FIXTURE_EXTENSION,
          out: (l) => lines.push(l),
        },
      );
      expect(lines.join("\n")).toMatch(/STATUS ACTOR_OBSERVATION_RECORDED/);
      expect(code).toBe(0);
    } finally {
      await host.stop();
    }
    // without the embedding's registrations (the shipped binary) the campaign is not even opened: nothing is claimed
    const bare: string[] = [];
    const refused = await runCli(
      [
        "observe-actor",
        "--campaign",
        dirs.campaignDir,
        "--campaign-id",
        FIXTURE_CAMPAIGN,
        "--operator-dir",
        dirs.operatorDir,
        "--actor",
        ACTOR,
        "--capability",
        SIGHT,
        "--source",
        SOURCE,
      ],
      { terminal: verbConsole("observe-actor"), out: (l) => bare.push(l) },
    );
    expect(refused).not.toBe(0);
    expect(bare.join("\n")).toMatch(/STATUS SESSION_UNAVAILABLE/);
    // a command line missing the actor, the capability or the source is a usage error
    const usage: string[] = [];
    expect(
      await runCli(["observe-actor", "--campaign", dirs.campaignDir, "--campaign-id", "x"], {
        out: (l) => usage.push(l),
      }),
    ).toBe(64);
    expect(usage.join("\n")).toMatch(/observe-actor/);
  });

  it("referee-bind-host binds the fifth operation only when the trusted operator asks for it", async () => {
    for (const flag of [false, true]) {
      const dirs = freshActorDirs();
      const s = await actorScene(dirs.campaignDir);
      await s.campaign.close();
      const lines: string[] = [];
      const code = await runCli(
        [
          "referee-bind-host",
          "--campaign",
          dirs.campaignDir,
          "--campaign-id",
          FIXTURE_CAMPAIGN,
          "--operator-dir",
          dirs.operatorDir,
          "--host-id",
          "bound-host",
          ...(flag ? ["--actor-perception"] : []),
        ],
        { extension: ACTOR_FIXTURE_EXTENSION, out: (l) => lines.push(l) },
      );
      expect(code).toBe(0);
      expect(lines.join("\n")).toMatch(
        flag ? /for the five referee operations/ : /for the four referee operations/,
      );
      const dir = readdirSync(dirs.operatorDir).find((f) => f.startsWith("referee-"))!;
      const config = JSON.parse(readFileSync(join(dirs.operatorDir, dir, "config.json"), "utf8"));
      expect(config.hosts[0].operations.includes("F014D_ACTOR_DIRECT_PERCEPTION")).toBe(flag);
      expect(config.hosts[0].operations.includes("F014D_DIRECT_PERCEPTION")).toBe(true);
    }
  });
});
