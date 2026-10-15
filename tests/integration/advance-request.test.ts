// The HOST-REQUESTED, independently operator-CONFIRMED active-PC target-only OOC time advance, end to end (BLUE v5.2-A1 bounded brief
// 2026-10-15; F-014B §§2–4, 6, 9–11, 13, 15, 17–20; I-001 §§2–4, 8, 14, 17, 20; GIP WS-007 §§2, 4.1, 4.3, 21.2, 22, 24.2). Every campaign here is
// built only by the shipped owner paths (original-PC activation, World-State's qualified custody, GIP's own institution, office, Scope Binding
// and `active` sunset-bearing Instrument with its Temporal registration, the Temporal owner's canonical time). The request side is a REAL stdio
// MCP process; the target and the confirmation enter on the operator's console after the service drew its challenge; the existing shipped
// `pc-target-advance` command, the existing `advanceActivePcToTarget` gateway, the real Temporal kernel and GIP's own sunset provider are the
// only things that commit, resolve or expire anything. The expected result is NEVER stated by a fixture: the Instrument is `active` before, and
// `expired` only where the kernel resolved GIP's own registered boundary.
//
// WHAT THESE TESTS PROVE AND DO NOT PROVE. The scripted console only TYPES the phrase the service printed, and the scripted referee host behind
// the character's custody is plumbing: this proves request transport, routing and the preservation of the existing choice+owner execution. It
// does NOT prove genuine human identity (the operating-system user is verified, not a person), AI natural-language understanding, or a complete
// ordinary gameplay loop. A time advance is not an in-world wait, earns the character no knowledge, and no test claims otherwise.
import { chmodSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { LOCALITY_CAMPAIGN, type LocalityDirs } from "../support/locality.ts";
import { scriptedConsole } from "../support/original-pc.ts";
import {
  BEFORE_SUNSET,
  BEYOND_SUNSET,
  PC_ID,
  REQUEST_HOST,
  REQUEST_REFUSAL,
  REQUEST_TOOL,
  RequestClient,
  SUNSET,
  advanceRequestDir,
  answer,
  answerAsProcess,
  askFile,
  askOnce,
  at,
  bindRequestHost,
  hasAsk,
  requestServerArgs,
  sunsetDirs,
  targetConsole,
  worldOf,
} from "../support/advance-request.ts";
import {
  McpClient,
  bindHost as bindPlayerViewHost,
  copyDirs,
  serverArgs,
} from "../support/player-view.ts";
import { PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { treeOf } from "../support/tree.ts";

// each case starts one or more real processes (a campaign open per call); CI runs the whole suite in parallel
vi.setConfig({ testTimeout: 120_000 });

let fresh: LocalityDirs;

beforeAll(async () => {
  // ONE original-PC campaign, an `active` sunset-bearing Instrument, canonical time at 100; nothing advanced yet
  fresh = await sunsetDirs();
}, 240_000);

const READ_TOOL = "read_current_observation_glance";

/** A campaign copy with both hosts bound: the one that may ASK for a time advance and the separate one that may READ. */
async function armed(source: LocalityDirs = fresh) {
  const dirs = copyDirs(source);
  const ask = await bindRequestHost(dirs);
  expect(ask.code, ask.out.join("\n")).toBe(0);
  const read = await bindPlayerViewHost(dirs);
  expect(read.code, read.out.join("\n")).toBe(0);
  return { dirs, ask, read };
}

/** The existing player-view server's one read, against a fresh process. */
async function readGlance(dirs: LocalityDirs, secretFile: string) {
  const c = new McpClient(serverArgs(dirs, secretFile));
  try {
    await c.handshake();
    const r = await c.call({}, READ_TOOL);
    c.end();
    await c.exit();
    return r;
  } finally {
    c.end();
  }
}

describe("the antecedents are independently owner-committed; nothing says `expired` before the operator's choice is executed", () => {
  it("the campaign is at canonical time 100 with GIP's own `active` Instrument whose registered sunset lies ahead of it", async () => {
    const w = await worldOf(fresh);
    expect(w.time).toEqual(at(100));
    expect(w.lifecycle).toBe("active");
    expect(w.instrumentVersion).toBe(1);
    expect(w.transactions).toEqual([]);
    expect(SUNSET.value).toBeGreaterThan(w.time.value);
  });
});

describe("positive: host request -> separate operator target and confirmation -> existing command and gateway -> GIP's own sunset", () => {
  it("a real stdio request alone changes nothing; the operator's own exact target and fresh confirmation commit the transaction, and only the real GIP stage expires the Instrument", async () => {
    const { dirs, ask, read } = await armed();
    const before = await worldOf(dirs);

    // 1. the host speaks MCP to the REQUEST server: exactly one tool, no arguments, not a reader, no target
    const c = new RequestClient(requestServerArgs(dirs, ask.secretFile));
    const init = await c.handshake();
    expect(init.result.serverInfo.name).toBe("immortalis-advance-request");
    expect(init.result.capabilities).toEqual({ tools: {} });
    const listed = await c.rpc("tools/list");
    expect(listed.result.tools).toHaveLength(1);
    const tool = listed.result.tools[0];
    expect(tool.name).toBe(REQUEST_TOOL);
    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    expect(tool.annotations.readOnlyHint).toBe(false);

    // 2. the host asks. The result says a request was left and that no time advanced
    const packageBefore = treeOf(dirs.campaignDir);
    const asked = await c.ask({});
    expect(asked.isError).toBe(false);
    const parsed = JSON.parse(asked.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.value.status).toBe("TARGET_ADVANCE_REQUESTED");
    expect(parsed.value.message).toMatch(/No time has advanced/);
    // the request alone changed NO canonical byte: no time, no transaction, no GIP write
    expect(treeOf(dirs.campaignDir)).toEqual(packageBefore);
    expect(await worldOf(dirs)).toEqual(before);
    // an ask is pending in the operator's retained state; it states no target, no choice, no confirmation, no role
    const file = JSON.parse(readFileSync(askFile(dirs), "utf8"));
    expect(Object.keys(file).sort()).toEqual(
      [
        "basis",
        "campaign_id",
        "format",
        "format_version",
        "host_id",
        "operator_uid",
        "pc_id",
        "request_id",
      ].sort(),
    );
    expect(file.pc_id).toBe(PC_ID);
    expect(file.host_id).toBe(REQUEST_HOST);
    expect(file.basis).toEqual(at(100));
    expect(readFileSync(askFile(dirs), "utf8")).not.toMatch(
      /target|duration|condition|confirm|role\.|permission|transaction|advance_active/i,
    );

    // 3. the operator answers on the console: THE OPERATOR names the exact target; a fresh challenge is typed back
    const ans = await answer(dirs, BEYOND_SUNSET);
    expect(ans.result.status, JSON.stringify(ans.result)).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(ans.terminal.asked()).toBe(1);
    const said = ans.terminal.said.join("\n");
    expect(said).toMatch(/A HOST HAS ASKED THAT YOU CONSIDER ADVANCING THE WORLD'S TIME/);
    expect(said).toMatch(/names no target/);
    expect(said).toContain(`advance the world's canonical time to exactly ${BEYOND_SUNSET.value}`);
    expect(ans.terminal.typed[0]).toMatch(/^pc-target-advance [0-9a-f]{12}$/);
    // the ask is consumed
    expect(hasAsk(dirs)).toBe(false);

    // 4. the owners' own results: the kernel committed ONE transaction to the operator's target, GIP's stage ran once at ITS sunset
    const after = await worldOf(dirs);
    expect(after.time).toEqual(BEYOND_SUNSET);
    expect(after.transactions.length).toBeGreaterThan(0);
    expect(after.lifecycle).toBe("expired");
    expect(after.instrumentVersion).toBe(2);
    expect(await verifyCampaign(dirs)).toEqual([]);

    // 5. no player knowledge came of it: the existing read refuses exactly as before the request (nothing was perceived)
    expect((await readGlance(dirs, read.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    // the request transport neither returned nor carries any of it
    expect(asked.text).not.toMatch(/expired|sunset|instrument|committed/i);
    c.end();
    expect(await c.exit()).toBe(0);
    expect(await c.stderrText).toBe("");
  });

  it("works through the shipped binaries as real processes: the request tool, then the operator answer as a child process on its own standard input", async () => {
    const { dirs, ask } = await armed();
    const asked = await askOnce(dirs, ask.secretFile);
    expect(JSON.parse(asked.text).value.status).toBe("TARGET_ADVANCE_REQUESTED");
    const run = await answerAsProcess(dirs);
    expect(run.err).toBe("");
    expect(run.code, run.out).toBe(0);
    expect(run.out).toMatch(/STATUS PC_TARGET_ADVANCE_COMMITTED/);
    expect(run.typed).toHaveLength(1);
    expect(run.typed[0]).toMatch(/^pc-target-advance [0-9a-f]{12}$/);
    const w = await worldOf(dirs);
    expect(w.time).toEqual(BEYOND_SUNSET);
    expect(w.lifecycle).toBe("expired");
  });
});

describe("independently falsifying negative A: the same request and the same confirmation expire nothing when the confirmed target is short of the sunset", () => {
  it("the kernel commits to the operator's earlier target, and GIP's Instrument stays `active` (no fixture supplies a verdict or a due flag)", async () => {
    const { dirs, ask } = await armed();
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const ans = await answer(dirs, BEFORE_SUNSET);
    expect(ans.result.status, JSON.stringify(ans.result)).toBe("PC_TARGET_ADVANCE_COMMITTED");
    const w = await worldOf(dirs);
    expect(w.time).toEqual(BEFORE_SUNSET);
    expect(w.lifecycle).toBe("active");
    expect(w.instrumentVersion).toBe(1);
    // the very same antecedents, asked again, then taken beyond the sunset: only now does GIP's own stage run
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    expect((await answer(dirs, BEYOND_SUNSET)).result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    const later = await worldOf(dirs);
    expect(later.time).toEqual(BEYOND_SUNSET);
    expect(later.lifecycle).toBe("expired");
  });
});

describe("authority negative B: the request is never a confirmation, a target or a role", () => {
  it("a host that asks, however often and with whatever over-claims, leaves the package byte-identical and advances nothing", async () => {
    const { dirs, ask } = await armed();
    const before = treeOf(dirs.campaignDir);
    const world = await worldOf(dirs);
    const c = new RequestClient(requestServerArgs(dirs, ask.secretFile));
    await c.handshake();
    for (let i = 0; i < 3; i += 1) expect(JSON.parse((await c.ask({})).text).ok).toBe(true);
    // targets, durations, conditions, roles, permissions, fake confirmations and forged identities are over-claims: the one refusal
    const overclaims: unknown[] = [
      { target: { unit: "t", value: 999 } },
      { target: BEYOND_SUNSET },
      { duration: 50 },
      { condition: "until-sunset" },
      { confirmed: true },
      { confirmation: "pc-target-advance 000000000000" },
      { role: "role.player", permission: "permission.player_choice.commit" },
      { operation: "advance_active_pc_to_target" },
      { transaction: { transaction_id: "tx-forged" } },
      { pc_id: PC_ID, campaign_id: LOCALITY_CAMPAIGN, session: "s-1", basis: at(100) },
      { verdict: "COMMITTED", status: "PC_TARGET_ADVANCE_COMMITTED" },
      [],
      "yes",
      0,
      null,
    ];
    for (const args of overclaims) {
      const r = await c.call(args, REQUEST_TOOL);
      expect(r.isError, JSON.stringify(args)).toBe(true);
      expect(r.text).toBe(REQUEST_REFUSAL);
    }
    c.end();
    await c.exit();
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(await worldOf(dirs)).toEqual(world);
    // the three valid asks stayed ONE ask
    expect(
      readdirSync(
        advanceRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      ).filter((f) => f.startsWith("request")),
    ).toHaveLength(1);
  });

  it("the ask stands for no confirmation: a console that declines (a wrong line, end of input, a stale phrase, a reused phrase) advances and records nothing", async () => {
    for (const mode of ["wrong", "eof", "stale"] as const) {
      const { dirs, ask } = await armed();
      expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
      const before = treeOf(dirs.campaignDir);
      const world = await worldOf(dirs);
      const console_ =
        mode === "wrong"
          ? scriptedConsole("yes")
          : mode === "eof"
            ? scriptedConsole(null)
            : scriptedConsole("pc-target-advance 000000000000");
      const ans = await answer(dirs, BEYOND_SUNSET, console_);
      expect(ans.result.status, mode).toBe("DECLINED");
      expect(console_.asked()).toBe(1);
      expect(treeOf(dirs.campaignDir), mode).toEqual(before);
      expect(await worldOf(dirs), mode).toEqual(world);
      // a declined ask is consumed: the host must ask again, and the operator has nothing to answer
      expect(hasAsk(dirs)).toBe(false);
      expect((await answer(dirs, BEYOND_SUNSET, scriptedConsole())).result.status).toBe(
        "TARGET_ADVANCE_REQUEST_NONE",
      );
    }
  });

  it("an answer with no pending ask asks the operator nothing and changes nothing", async () => {
    const dirs = copyDirs(fresh);
    await bindRequestHost(dirs);
    const before = treeOf(dirs.campaignDir);
    const console_ = scriptedConsole();
    const ans = await answer(dirs, BEYOND_SUNSET, console_);
    expect(ans.result.status).toBe("TARGET_ADVANCE_REQUEST_NONE");
    expect(console_.asked()).toBe(0);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
  });

  it("a target the operator mistypes (another unit, a past target) is refused or stopped by the existing command, gateway and kernel, and the ask is not turned into another target", async () => {
    const { dirs, ask } = await armed();
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const world = await worldOf(dirs);
    // a malformed target is the existing command's INVALID_INPUT, and the ask is kept for the operator to answer again
    const bad = await answer(dirs, { unit: "t", value: -1 }, scriptedConsole());
    expect(bad.result.status).toBe("INVALID_INPUT");
    expect(hasAsk(dirs)).toBe(true);
    // a past target (before canonical time 100) is judged by the gateway and the kernel, not here: nothing advances
    const past = await answer(dirs, at(50));
    expect(past.result.status).not.toBe("PC_TARGET_ADVANCE_COMMITTED");
    const w = await worldOf(dirs);
    expect(w.time).toEqual(world.time);
    expect(w.lifecycle).toBe("active");
  });
});

describe("authentication and binding: a hostile or unbound caller leaves no ask and learns nothing", () => {
  it("wrong, foreign, reused, malformed or absent secrets, a wrong host and a wrong campaign are the one opaque refusal and leave nothing pending", async () => {
    const { dirs, ask, read } = await armed();
    const second = await bindRequestHost(dirs, "chat-host-2");
    expect(second.code).toBe(0);
    const wrong = join(dirs.operatorDir, "wrong.secret");
    writeFileSync(wrong, `${"ab".repeat(32)}\n`, { mode: 0o600 });
    chmodSync(wrong, 0o600);
    const cases: {
      name: string;
      secret: string;
      over?: { hostId?: string; campaignId?: string };
    }[] = [
      { name: "another request host's secret", secret: second.secretFile },
      { name: "an unbound host identity", secret: ask.secretFile, over: { hostId: "never-bound" } },
      { name: "a valid but wrong secret", secret: wrong },
      {
        name: "another campaign identity",
        secret: ask.secretFile,
        over: { campaignId: "campaign-other" },
      },
      // the READ credential must open nothing on the time-advance request surface
      { name: "the player-view (read) secret", secret: read.secretFile },
    ];
    for (const k of cases) {
      const r = await askOnce(dirs, k.secret, k.over);
      expect(r.isError, k.name).toBe(true);
      expect(r.text, k.name).toBe(REQUEST_REFUSAL);
      expect(hasAsk(dirs), k.name).toBe(false);
    }
    // and the REQUEST credential opens nothing on the read surface
    expect((await readGlance(dirs, ask.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    // the genuine arrangement still works
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
  });

  it("an observation-request credential and a referee credential open nothing here, and this credential opens nothing there", async () => {
    const { dirs, ask } = await armed();
    const { bindObserveRequestHost, observeRequestSecretPath } =
      await import("../../packages/operator/src/observe-request-exchange.ts").then((m) => ({
        bindObserveRequestHost: m.bindObserveRequestHost,
        observeRequestSecretPath: m.observeRequestSecretPath,
      }));
    const bound = await bindObserveRequestHost({
      stateDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: REQUEST_HOST,
      pcId: PC_ID,
    });
    expect(bound.ok).toBe(true);
    const observeSecret = observeRequestSecretPath(
      { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN },
      REQUEST_HOST,
    );
    // the observation-request secret, same host name, is no entitlement to ask for a time advance
    const r = await askOnce(dirs, observeSecret);
    expect(r.text).toBe(REQUEST_REFUSAL);
    expect(hasAsk(dirs)).toBe(false);
    // and the time-advance request secret is no entitlement to ask for an observation
    const { requestActivePcObservation } =
      await import("../../packages/operator/src/observe-request.ts");
    const refused = await requestActivePcObservation({
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      stateDir: dirs.operatorDir,
      hostId: REQUEST_HOST,
      secret: readFileSync(ask.secretFile, "utf8").trim(),
    });
    expect(refused.ok).toBe(false);
  });

  it("an unauthorized operating-system owner (a package open to others, a foreign retained-state mode) leaves no ask", async () => {
    const { dirs, ask } = await armed();
    chmodSync(dirs.campaignDir, 0o777);
    expect((await askOnce(dirs, ask.secretFile)).text).toBe(REQUEST_REFUSAL);
    chmodSync(dirs.campaignDir, 0o755);
    chmodSync(dirs.operatorDir, 0o755);
    expect((await askOnce(dirs, ask.secretFile)).text).toBe(REQUEST_REFUSAL);
    chmodSync(dirs.operatorDir, 0o700);
    expect(hasAsk(dirs)).toBe(false);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
  });

  it("a package with a stray file fails closed: the request is refused, nothing is repaired", async () => {
    const { dirs, ask } = await armed();
    writeFileSync(join(dirs.campaignDir, "stray.tmp"), "residue");
    const before = treeOf(dirs.campaignDir);
    expect((await askOnce(dirs, ask.secretFile)).text).toBe(REQUEST_REFUSAL);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(hasAsk(dirs)).toBe(false);
  });
});

describe("fail closed: an active writer and an interrupted or unreconciled package are never repaired to force a request", () => {
  it("a campaign opened elsewhere (a writer is active) refuses the request, leaves no ask, and the host may simply ask again once it is released", async () => {
    const { dirs, ask } = await armed();
    const writer = await CanonicalCampaign.open(dirs.campaignDir, { buildId: "writer-test" });
    expect(writer.ok).toBe(true);
    if (!writer.ok) return;
    try {
      const during = await askOnce(dirs, ask.secretFile);
      expect(during.isError).toBe(true);
      expect(during.text).toBe(REQUEST_REFUSAL);
      expect(hasAsk(dirs)).toBe(false);
    } finally {
      await writer.value.close();
    }
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
  });

  it("an uncommitted journal tail, a stale package lock or a tampered manifest is refused and left exactly as found", async () => {
    for (const damage of ["tail", "lock", "manifest"] as const) {
      const { dirs, ask } = await armed();
      const manifest = join(dirs.campaignDir, "manifest.json");
      const original = readFileSync(manifest, "utf8");
      if (damage === "tail")
        writeFileSync(join(dirs.campaignDir, "journal.jsonl"), '{"uncommitted":true}\n', {
          flag: "a",
        });
      else if (damage === "lock")
        writeFileSync(
          join(dirs.campaignDir, "LOCK"),
          JSON.stringify({ campaign_id: LOCALITY_CAMPAIGN, pid: 2 ** 22 - 1, nonce: "x" }),
        );
      else writeFileSync(manifest, original.replace(LOCALITY_CAMPAIGN, "campaign-forged"));
      const before = treeOf(dirs.campaignDir);
      const r = await askOnce(dirs, ask.secretFile);
      expect(r.isError, damage).toBe(true);
      expect(r.text, damage).toBe(REQUEST_REFUSAL);
      expect(treeOf(dirs.campaignDir), damage).toEqual(before);
      expect(hasAsk(dirs), damage).toBe(false);
    }
  });

  it("a campaign with no established canonical basis leaves no ask", async () => {
    // a bound character with custody but no Temporal establishment is not an authorized basis for a request
    const { boundOriginalCampaign, qualifyCustody } =
      await import("../support/original-pc-target.ts");
    const bare = await boundOriginalCampaign();
    await qualifyCustody(bare);
    const { dirs, ask } = await armed(bare);
    expect((await askOnce(dirs, ask.secretFile)).text).toBe(REQUEST_REFUSAL);
    expect(hasAsk(dirs)).toBe(false);
  });
});

describe("a campaign whose character cannot lawfully be advanced: the operator's console refuses opaquely and no time or GIP change follows", () => {
  it("an original character with NO qualified custody: the request may be left, the confirmed target is refused by the existing command, nothing advances", async () => {
    const { originalSunsetCampaign } = await import("../support/original-pc-target.ts");
    const s = await originalSunsetCampaign(SUNSET, { custody: false });
    await s.campaign.close();
    const { dirs, ask } = await armed(s.dirs);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const world = await worldOf(dirs);
    const ans = await answer(dirs, BEYOND_SUNSET, scriptedConsole());
    expect(ans.result.status).toBe("UNAVAILABLE");
    const w = await worldOf(dirs);
    expect(w.time).toEqual(world.time);
    expect(w.lifecycle).toBe("active");
    expect(w.transactions).toEqual([]);
  });
});

describe("staleness: an ask is for one canonical basis and one proved character", () => {
  it("time advanced after the ask: the operator is asked nothing, the ask is discarded and the host must ask again", async () => {
    const { dirs, ask } = await armed();
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    // a lawful, separate advance through the operator's own shipped `pc-target-advance` command (no host ask involved) moves the basis
    const moved = await runShippedAdvance(dirs, BEFORE_SUNSET);
    expect(moved).toBe(0);
    const before = treeOf(dirs.campaignDir);
    const console_ = scriptedConsole();
    const ans = await answer(dirs, BEYOND_SUNSET, console_);
    expect(ans.result.status).toBe("TARGET_ADVANCE_REQUEST_STALE");
    expect(console_.asked()).toBe(0);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(hasAsk(dirs)).toBe(false);
    // a fresh ask at the new basis is answered, and the operator's own target is then committed
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    expect((await answer(dirs, BEYOND_SUNSET)).result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect((await worldOf(dirs)).lifecycle).toBe("expired");
  });

  it("a stale ask is replaced, not multiplied, by a later request", async () => {
    const { dirs, ask } = await armed();
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const first = JSON.parse(readFileSync(askFile(dirs), "utf8"));
    expect(await runShippedAdvance(dirs, at(110))).toBe(0);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const second = JSON.parse(readFileSync(askFile(dirs), "utf8"));
    expect(second.request_id).not.toBe(first.request_id);
    expect(second.basis).toEqual(at(110));
  });

  it("a host binding removed after the ask: the ask is discarded and the operator is asked nothing", async () => {
    const { dirs, ask } = await armed();
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const dir = advanceRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN });
    const config = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    config.hosts = [];
    writeFileSync(join(dir, "config.json"), JSON.stringify(config));
    const console_ = scriptedConsole();
    const ans = await answer(dirs, BEYOND_SUNSET, console_);
    expect(ans.result.status).toBe("TARGET_ADVANCE_REQUEST_INVALID");
    expect(console_.asked()).toBe(0);
    expect(hasAsk(dirs)).toBe(false);
    const w = await worldOf(dirs);
    expect(w.lifecycle).toBe("active");
  });
});

describe("recovery, replay and concurrency", () => {
  it("repeated and concurrent requests converge on one ask; a replayed answer finds nothing new and commits no second advance", async () => {
    const { dirs, ask } = await armed();
    const results = await Promise.all([0, 1, 2, 3].map(() => askOnce(dirs, ask.secretFile)));
    for (const r of results)
      expect([REQUEST_REFUSAL].includes(r.text) || JSON.parse(r.text).ok).toBe(true);
    expect(results.some((r) => JSON.parse(r.text).ok === true)).toBe(true);
    expect(hasAsk(dirs)).toBe(true);
    const first = await answer(dirs, BEYOND_SUNSET);
    expect(first.result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    const after = await worldOf(dirs);
    const replay = await answer(dirs, BEYOND_SUNSET, scriptedConsole());
    expect(replay.result.status).toBe("TARGET_ADVANCE_REQUEST_NONE");
    expect(await worldOf(dirs)).toEqual(after);
  });

  it("an interruption after the commit but before the ask is cleared converges on the next answer without a second choice or a second expiry", async () => {
    const { dirs, ask } = await armed();
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const { nodeFs } = await import("@immortalis/engine");
    // the retained-state remove fails once: the advance committed, the ask stayed
    let failed = false;
    const ledgerFs = {
      ...nodeFs,
      remove: async (p: string) => {
        if (!failed && /request-[0-9a-f]{32}\.json$/.test(p)) {
          failed = true;
          throw new Error("injected");
        }
        return nodeFs.remove(p);
      },
    };
    const first = await answer(dirs, BEYOND_SUNSET, targetConsole(), { ledgerFs });
    expect(first.result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(failed).toBe(true);
    expect(hasAsk(dirs)).toBe(true);
    const settled = await worldOf(dirs);
    expect(settled.lifecycle).toBe("expired");
    // the leftover ask is for a basis that is no longer current: it is stale, discarded, and asks the operator for nothing
    const console_ = scriptedConsole();
    const second = await answer(dirs, BEYOND_SUNSET, console_);
    expect(second.result.status).toBe("TARGET_ADVANCE_REQUEST_STALE");
    expect(console_.asked()).toBe(0);
    expect(hasAsk(dirs)).toBe(false);
    expect(await worldOf(dirs)).toEqual(settled);
  });

  it("the committed advance survives close and reopen: a later authoritative read still finds `expired` exactly once, at the same version", async () => {
    const { dirs, ask } = await armed();
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    expect((await answer(dirs, BEYOND_SUNSET)).result.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    const a = await worldOf(dirs);
    const b = await worldOf(dirs);
    expect(b).toEqual(a);
    expect(a.lifecycle).toBe("expired");
    expect(a.instrumentVersion).toBe(2);
    expect(await verifyCampaign(dirs)).toEqual([]);
  });
});

describe("the secret and the operator's console stay out of every host-visible output", () => {
  it("no secret, path, challenge, identity or world word reaches the request tool's replies, and the secret file is owner-only", async () => {
    const { dirs, ask } = await armed();
    const secret = readFileSync(ask.secretFile, "utf8").trim();
    expect(statSync(ask.secretFile).mode & 0o777).toBe(0o600);
    for (const line of ask.out) expect(line).not.toContain(secret);
    expect(ask.out.join("\n")).toContain(ask.secretFile);
    const c = new RequestClient(requestServerArgs(dirs, ask.secretFile));
    const init = await c.handshake();
    const listed = await c.rpc("tools/list");
    const r = await c.ask({});
    for (const text of [JSON.stringify(init), JSON.stringify(listed), r.text]) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain(dirs.campaignDir);
      expect(text).not.toContain(dirs.operatorDir);
      expect(text).not.toMatch(
        /gip|instrument|sunset|expired|world\/|locus_|provenance|chat-host|pc-target-advance [0-9a-f]/i,
      );
    }
    c.end();
    await c.exit();
    expect(await c.stderrText).toBe("");
  });
});

/** The operator's own shipped `pc-target-advance` command (no host ask involved), typed on a scripted console. Returns its exit code. */
async function runShippedAdvance(dirs: LocalityDirs, target: { unit: string; value: number }) {
  const { runCli } = await import("@immortalis/operator");
  return runCli(
    [
      "pc-target-advance",
      "--campaign",
      dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--operator-dir",
      dirs.operatorDir,
      "--target-unit",
      target.unit,
      "--target-value",
      String(target.value),
    ],
    { terminal: targetConsole(), out: () => undefined },
  );
}

/** The campaign's own integrity check, through the ordinary re-open. */
async function verifyCampaign(dirs: LocalityDirs): Promise<readonly unknown[]> {
  const { openOrdinary } = await import("../support/locality.ts");
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return c.verify();
  } finally {
    await c.close();
  }
}
