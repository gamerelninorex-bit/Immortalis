/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies and raw persisted records */
// The HOST-REQUESTED, independently operator-CONFIRMED active-PC observation, end to end (BLUE v5.2-A1 bounded brief 2026-10-15; I-001 §§3–5,
// 9–11; F-014D §§2, 4.1, 5, 6; F-014B §§4, 17; F-017 §4). Every campaign here is built only by the shipped commands; the request side is a REAL
// stdio MCP process; the confirmation enters on the operator's console after the service drew its challenge; the existing producer
// (`observeSurroundings`, unchanged) is the only thing that decides, records and commits anything; the host then reads only through the
// existing, separately authenticated player-view server. The referee host in these tests is a SCRIPTED policy the test wrote that reads the
// DELIVERED words (PLUMBING ONLY): it proves the mechanism and certifies NOTHING about whether any AI perceives or reads any sentence
// correctly. The finite semantic support for what the producer establishes is the retained real-host exercise (docs/evidence/b52-direct-
// observation-live-host*), neither repeated nor extended here; one real configured host call of THIS mechanism is reported separately in
// docs/evidence/host-observation-request-real-host.md. The fixtures assert no verdict, receipt, packet, presentation or Glance success as an
// upstream fact: the expected value is whatever the unchanged direct gateway returns over the same canon.
import { chmodSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  nodeFs,
} from "@immortalis/engine";
import { stopAtBoundaryRequest } from "@immortalis/testkit";
import { at } from "../support/gip-sunset.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { PC_ID, observationCampaign, screenScene, verbConsole } from "../support/observation.ts";
import { scriptedConsole } from "../support/original-pc.ts";
import {
  answer,
  answerAsProcess,
  askOnce,
  bindRequestHost,
  observeRequestDir,
  REQUEST_HOST,
  REQUEST_REFUSAL,
  REQUEST_TOOL,
  RequestClient,
  requestFile,
  requestServerArgs,
} from "../support/observe-request.ts";
import {
  McpClient,
  SERVER_BIN,
  bindHost as bindPlayerViewHost,
  copyDirs,
  directGlance,
  serverArgs,
} from "../support/player-view.ts";
import { PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { must } from "../support/temporal.ts";
import { treeOf } from "../support/tree.ts";

// each case starts one or more real processes (a campaign open per call); CI runs the whole suite in parallel
vi.setConfig({ testTimeout: 120_000 });

let fresh: LocalityDirs;
let screened: LocalityDirs;

beforeAll(async () => {
  // qualified campaigns, time established, NOTHING observed yet
  fresh = (await observationCampaign()).dirs;
  screened = (await observationCampaign({ scene: screenScene() })).dirs;
}, 240_000);

const READ_TOOL = "read_current_observation_glance";

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

/** A campaign copy with both hosts bound: the one that may ASK and the separate one that may READ. */
async function armed(source: LocalityDirs) {
  const dirs = copyDirs(source);
  baseline = await observationFacts(dirs);
  const ask = await bindRequestHost(dirs);
  expect(ask.code, ask.out.join("\n")).toBe(0);
  const read = await bindPlayerViewHost(dirs);
  expect(read.code, read.out.join("\n")).toBe(0);
  return { dirs, ask, read };
}

let baseline: string[] = [];
const observationFacts = (dirs: LocalityDirs) =>
  openOrdinary(dirs.campaignDir).then(async (c) => {
    try {
      return c.store
        .listFacts()
        .filter((f) => f.key.startsWith("access/") || f.key.startsWith("referee/"))
        .map((f) => f.key);
    } finally {
      await c.close();
    }
  });

describe("positive: host request -> separate operator confirmation -> existing producer -> existing read", () => {
  it("a real stdio request, answered on the operator's console, earns the existing receipt, and the host reads the existing Glance byte for byte", async () => {
    const { dirs, ask, read } = await armed(fresh);

    // 1. the host speaks MCP to the REQUEST server: exactly one tool, no arguments, not a reader
    const c = new RequestClient(requestServerArgs(dirs, ask.secretFile));
    const init = await c.handshake();
    expect(init.result.serverInfo.name).toBe("immortalis-observe-request");
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

    // nothing is earned yet: the existing read refuses
    expect((await readGlance(dirs, read.secretFile)).text).toBe(PROTOCOL_REFUSAL);

    // 2. the host asks. The result says a request was left and that nothing happened
    const packageBefore = treeOf(dirs.campaignDir);
    const asked = await c.ask({});
    expect(asked.isError).toBe(false);
    const parsed = JSON.parse(asked.text);
    expect(parsed.ok).toBe(true);
    expect(parsed.value.status).toBe("OBSERVATION_REQUESTED");
    expect(parsed.value.message).toMatch(/Nothing has been observed/);
    // the request alone changed NO canonical byte and earned nothing
    expect(treeOf(dirs.campaignDir)).toEqual(packageBefore);
    expect(await observationFacts(dirs)).toEqual(baseline);
    expect((await readGlance(dirs, read.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    // an ask is pending in the operator's retained state, and it states no choice
    const file = JSON.parse(readFileSync(requestFile(dirs), "utf8"));
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

    // 3. the operator answers on the console: a fresh challenge, typed back
    const ans = await answer(dirs);
    expect(ans.result.status, JSON.stringify(ans.result.details)).toBe("OBSERVATION_RECEIVED");
    expect(ans.terminal.asked()).toBe(1);
    expect(ans.terminal.said.join("\n")).toMatch(/A HOST HAS ASKED/);
    expect(ans.terminal.said.join("\n")).toMatch(/not your choice/);
    expect(ans.terminal.typed[0]).toMatch(/^observe-surroundings [0-9a-f]{12}$/);
    // the ask is consumed
    expect(existsSync(requestFile(dirs))).toBe(false);

    // 4. the host now reads only through the existing read path: the existing presentation, byte for byte
    const direct = await directGlance(dirs);
    expect(JSON.parse(direct).ok).toBe(true);
    const viaHost = await readGlance(dirs, read.secretFile);
    expect(viaHost.isError).toBe(false);
    expect(viaHost.text).toBe(direct);
    expect(JSON.parse(viaHost.text).value.elements).toEqual([
      { element: "CONTACT", channel: "PERCEPTION" },
      { element: "REFERENT", text: "a patch on the wall facing the character" },
      { element: "CONTENT", text: "a broad patch of bright red on pale plaster" },
    ]);
    // the request transport neither returned nor carries any of it
    expect(asked.text).not.toMatch(/red|patch|plaster/);
    c.end();
    expect(await c.exit()).toBe(0);
    expect(await c.stderrText).toBe("");
  });

  it("works through the shipped binaries as real processes: the request tool, then the operator answer as a child process on its own standard input", async () => {
    const { dirs, ask, read } = await armed(fresh);
    const asked = await askOnce(dirs, ask.secretFile);
    expect(JSON.parse(asked.text).value.status).toBe("OBSERVATION_REQUESTED");
    const run = await answerAsProcess(dirs);
    expect(run.err).toBe("");
    expect(run.code, run.out).toBe(0);
    expect(run.out).toMatch(/STATUS OBSERVATION_RECEIVED/);
    expect(run.typed).toHaveLength(1);
    expect(run.typed[0]).toMatch(/^observe-surroundings [0-9a-f]{12}$/);
    expect((await readGlance(dirs, read.secretFile)).text).toBe(await directGlance(dirs));
  });
});

describe("independently falsifying negative: the same host request and the same human confirmation earn nothing when the world's evidence changes", () => {
  it("an opaque obstruction earns no receipt, packet or positive presentation, and the host sees only the one existing refusal", async () => {
    const { dirs, ask, read } = await armed(screened);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const ans = await answer(dirs);
    expect(ans.result.status, JSON.stringify(ans.result.details)).toBe(
      "OBSERVATION_NOT_ESTABLISHED",
    );
    expect(ans.terminal.asked()).toBe(1);
    // the sealed negative is retained engine-side; no receipt, event or packet exists
    const keys = await observationFacts(dirs);
    expect(keys.some((k) => k.startsWith("access/"))).toBe(false);
    const r = await readGlance(dirs, read.secretFile);
    expect(r.isError).toBe(true);
    expect(r.text).toBe(PROTOCOL_REFUSAL);
    // indistinguishable from a campaign that was never asked about
    const never = copyDirs(fresh);
    const neverRead = await bindPlayerViewHost(never);
    expect(neverRead.code).toBe(0);
    const n = await readGlance(never, neverRead.secretFile);
    expect(n.text).toBe(PROTOCOL_REFUSAL);
    // the operator console says the same for every non-receipt, and names no obstruction
    expect(ans.result.message).not.toMatch(/screen|obstruct|blocked|wood/i);
    expect(ans.terminal.said.join("\n")).not.toMatch(/screen|obstruct|blocked|wooden/i);
  });
});

describe("no-confirmation invariant: a host request alone commits nothing, and is never a confirmation", () => {
  it("any number of requests, valid or over-claiming, leave the package byte-identical and earn nothing", async () => {
    const { dirs, ask, read } = await armed(fresh);
    const before = treeOf(dirs.campaignDir);
    const c = new RequestClient(requestServerArgs(dirs, ask.secretFile));
    await c.handshake();
    for (let i = 0; i < 3; i += 1) expect(JSON.parse((await c.ask({})).text).ok).toBe(true);
    // fake confirmations, role claims and forged identities are over-claims: the one refusal, and nothing is carried
    const overclaims: unknown[] = [
      { confirmed: true },
      { confirmation: "observe-surroundings 000000000000" },
      { role: "role.player", permission: "permission.player_choice.commit" },
      {
        pc_id: PC_ID,
        campaign_id: LOCALITY_CAMPAIGN,
        session: "s-1",
        basis: { unit: "t", value: 100 },
      },
      { verdict: "OBSERVATION_ESTABLISHED" },
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
    expect(await observationFacts(dirs)).toEqual(baseline);
    expect((await readGlance(dirs, read.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    // the one pending ask stayed ONE ask, and states no confirmation
    const text = readFileSync(requestFile(dirs), "utf8");
    expect(text).not.toMatch(/confirm|yes|role\.|permission/i);
    expect(
      readdirSync(
        observeRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      ).filter((f) => f.startsWith("request")),
    ).toEqual(["request.json"]);
  });

  it("the ask stands for no confirmation: a console that declines (a wrong line, end of input, a stale phrase) observes and records nothing", async () => {
    for (const mode of ["wrong", "eof", "stale"] as const) {
      const { dirs, ask, read } = await armed(fresh);
      expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
      const before = treeOf(dirs.campaignDir);
      const console_ =
        mode === "wrong"
          ? scriptedConsole("yes")
          : mode === "eof"
            ? scriptedConsole(null)
            : scriptedConsole("observe-surroundings 000000000000");
      const ans = await answer(dirs, console_);
      expect(ans.result.status, mode).toBe("DECLINED");
      expect(console_.asked()).toBe(1);
      expect(treeOf(dirs.campaignDir), mode).toEqual(before);
      expect(await observationFacts(dirs)).toEqual(baseline);
      expect((await readGlance(dirs, read.secretFile)).text).toBe(PROTOCOL_REFUSAL);
      // a declined ask is consumed: the host must ask again, and the operator has nothing to answer
      expect(existsSync(requestFile(dirs))).toBe(false);
      expect((await answer(dirs, scriptedConsole())).result.status).toBe(
        "OBSERVATION_REQUEST_NONE",
      );
    }
  });

  it("an answer with no pending ask asks the operator nothing and changes nothing", async () => {
    const dirs = copyDirs(fresh);
    await bindRequestHost(dirs);
    const before = treeOf(dirs.campaignDir);
    const console_ = scriptedConsole();
    const ans = await answer(dirs, console_);
    expect(ans.result.status).toBe("OBSERVATION_REQUEST_NONE");
    expect(console_.asked()).toBe(0);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
  });
});

describe("authentication and binding: a hostile or unbound caller leaves no ask and learns nothing", () => {
  it("wrong, foreign, reused, malformed or absent secrets, a wrong host and a wrong campaign are the one opaque refusal and leave nothing pending", async () => {
    const { dirs, ask, read } = await armed(fresh);
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
      // the READ credential must open nothing on the request surface
      { name: "the player-view (read) secret", secret: read.secretFile },
    ];
    for (const k of cases) {
      const r = await askOnce(dirs, k.secret, k.over);
      expect(r.isError, k.name).toBe(true);
      expect(r.text, k.name).toBe(REQUEST_REFUSAL);
      expect(existsSync(requestFile(dirs)), k.name).toBe(false);
    }
    // and the REQUEST credential opens nothing on the read surface
    const readWithRequestSecret = await readGlance(dirs, ask.secretFile);
    expect(readWithRequestSecret.text).toBe(PROTOCOL_REFUSAL);
    // the genuine arrangement still works
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
  });

  it("a request host holds no read authority and the read host holds no request authority (the read server lists exactly its one read-only tool)", async () => {
    const { dirs, read } = await armed(fresh);
    const c = new McpClient(serverArgs(dirs, read.secretFile), SERVER_BIN);
    await c.handshake();
    const listed = await c.rpc("tools/list");
    expect(listed.result.tools.map((t: any) => t.name)).toEqual([READ_TOOL]);
    expect(listed.result.tools[0].annotations.readOnlyHint).toBe(true);
    const asked = await c.rpc("tools/call", { name: REQUEST_TOOL, arguments: {} });
    expect(asked.error?.message).toBe("unknown tool");
    c.end();
    await c.exit();
    expect(existsSync(requestFile(dirs))).toBe(false);
  });

  it("an unauthorized operating-system owner (a package open to others, a foreign retained-state mode) leaves no ask", async () => {
    const { dirs, ask } = await armed(fresh);
    chmodSync(dirs.campaignDir, 0o777);
    expect((await askOnce(dirs, ask.secretFile)).text).toBe(REQUEST_REFUSAL);
    chmodSync(dirs.campaignDir, 0o755);
    chmodSync(dirs.operatorDir, 0o755);
    expect((await askOnce(dirs, ask.secretFile)).text).toBe(REQUEST_REFUSAL);
    chmodSync(dirs.operatorDir, 0o700);
    expect(existsSync(requestFile(dirs))).toBe(false);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
  });

  it("a package with an uncommitted journal tail or a stray file fails closed: the request is refused, nothing is repaired", async () => {
    const { dirs, ask } = await armed(fresh);
    writeFileSync(join(dirs.campaignDir, "stray.tmp"), "residue");
    const before = treeOf(dirs.campaignDir);
    expect((await askOnce(dirs, ask.secretFile)).text).toBe(REQUEST_REFUSAL);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(existsSync(requestFile(dirs))).toBe(false);
  });

  it("a package whose time basis is not established leaves no ask", async () => {
    const bare = (await observationCampaign({ time: false })).dirs;
    const { dirs, ask } = await armed(bare);
    expect((await askOnce(dirs, ask.secretFile)).text).toBe(REQUEST_REFUSAL);
    expect(existsSync(requestFile(dirs))).toBe(false);
  });
});

describe("fail closed: an active writer, an interrupted or unreconciled package and an I/O error are never repaired to force a request", () => {
  it("a campaign opened elsewhere (a writer is active) refuses the request, leaves no ask, and the host may simply ask again once it is released", async () => {
    const { dirs, ask } = await armed(fresh);
    const writer = await CanonicalCampaign.open(dirs.campaignDir, { buildId: "writer-test" });
    expect(writer.ok).toBe(true);
    if (!writer.ok) return;
    try {
      const during = await askOnce(dirs, ask.secretFile);
      expect(during.isError).toBe(true);
      expect(during.text).toBe(REQUEST_REFUSAL);
      expect(existsSync(requestFile(dirs))).toBe(false);
    } finally {
      await writer.value.close();
    }
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
  });

  it("an uncommitted journal tail, a stale package lock or a tampered manifest is refused and left exactly as found", async () => {
    for (const damage of ["tail", "lock", "manifest"] as const) {
      const { dirs, ask } = await armed(fresh);
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
      expect(existsSync(requestFile(dirs)), damage).toBe(false);
    }
  });

  it("an I/O error while reading the retained state or the package, or while recording the ask, is the one refusal with nothing written", async () => {
    const { requestActivePcObservation } =
      await import("../../packages/operator/src/observe-request.ts");
    const { dirs, ask } = await armed(fresh);
    const secret = readFileSync(ask.secretFile, "utf8").trim();
    const params = {
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      stateDir: dirs.operatorDir,
      hostId: REQUEST_HOST,
      secret,
    };
    const throwing = {
      ...nodeFs,
      readFile: (path: string) =>
        /journal\.jsonl$|\.json$/.test(path)
          ? Promise.reject(new Error("EIO"))
          : nodeFs.readFile(path),
    };
    const failing = {
      ...nodeFs,
      createExclusive: () => Promise.reject(new Error("EIO")),
    };
    const before = treeOf(dirs.campaignDir);
    const refusal = JSON.stringify({
      ok: false,
      error: {
        code: "OBSERVATION_REQUEST_UNAVAILABLE",
        message: "no observation request can be recorded",
      },
    });
    for (const seam of [{ ledgerFs: throwing }, { campaignFs: throwing }, { ledgerFs: failing }])
      expect(JSON.stringify(await requestActivePcObservation({ ...params, ...seam }))).toBe(
        refusal,
      );
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(existsSync(requestFile(dirs))).toBe(false);
    // and the unharmed arrangement records
    expect((await requestActivePcObservation(params)).ok).toBe(true);
  });
});

describe("staleness: an ask is for one canonical basis and one proved character", () => {
  it("time advanced after the ask: the operator is asked nothing, the ask is discarded and the host must ask again", async () => {
    const { dirs, ask } = await armed(fresh);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const campaign = await openOrdinary(dirs.campaignDir);
    await must(
      new TemporalCoordinator(campaign.store, new StageProviderRegistry()).advance(
        stopAtBoundaryRequest("tx-after-request", {
          requested: { target: at(150), condition: null },
        }),
      ),
    );
    await campaign.close();
    const before = treeOf(dirs.campaignDir);
    const console_ = scriptedConsole();
    const ans = await answer(dirs, console_);
    expect(ans.result.status).toBe("OBSERVATION_REQUEST_STALE");
    expect(console_.asked()).toBe(0);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(existsSync(requestFile(dirs))).toBe(false);
    // a fresh ask at the new basis is answered, and earns the arrival at that basis
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    expect((await answer(dirs)).result.status).toBe("OBSERVATION_RECEIVED");
  });

  it("a stale ask is replaced, not multiplied, by a later request", async () => {
    const { dirs, ask } = await armed(fresh);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const first = JSON.parse(readFileSync(requestFile(dirs), "utf8"));
    const campaign = await openOrdinary(dirs.campaignDir);
    await must(
      new TemporalCoordinator(campaign.store, new StageProviderRegistry()).advance(
        stopAtBoundaryRequest("tx-replace-request", {
          requested: { target: at(160), condition: null },
        }),
      ),
    );
    await campaign.close();
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const second = JSON.parse(readFileSync(requestFile(dirs), "utf8"));
    expect(second.request_id).not.toBe(first.request_id);
    expect(second.basis).not.toEqual(first.basis);
  });

  it("a host binding removed after the ask: the ask is discarded and the operator is asked nothing", async () => {
    const { dirs, ask } = await armed(fresh);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const dir = observeRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN });
    const config = JSON.parse(readFileSync(join(dir, "config.json"), "utf8"));
    config.hosts = [];
    writeFileSync(join(dir, "config.json"), JSON.stringify(config));
    const console_ = scriptedConsole();
    const ans = await answer(dirs, console_);
    expect(ans.result.status).toBe("OBSERVATION_REQUEST_INVALID");
    expect(console_.asked()).toBe(0);
    expect(existsSync(requestFile(dirs))).toBe(false);
  });
});

describe("recovery, replay and concurrency", () => {
  it("repeated and concurrent requests converge on one ask; a replayed answer finds nothing new", async () => {
    const { dirs, ask } = await armed(fresh);
    const results = await Promise.all([0, 1, 2, 3].map(() => askOnce(dirs, ask.secretFile)));
    // each is either a recorded ask or (when the package lock was momentarily held by a sibling read) the one refusal, and one ask exists
    for (const r of results)
      expect([REQUEST_REFUSAL].includes(r.text) || JSON.parse(r.text).ok).toBe(true);
    expect(results.some((r) => JSON.parse(r.text).ok === true)).toBe(true);
    expect(existsSync(requestFile(dirs))).toBe(true);
    const first = await answer(dirs);
    expect(first.result.status).toBe("OBSERVATION_RECEIVED");
    const replay = await answer(dirs, scriptedConsole());
    expect(replay.result.status).toBe("OBSERVATION_REQUEST_NONE");
  });

  it("a second ask at an already-observed basis converges: the operator's answer shows the same records and asks for no new choice", async () => {
    const { dirs, ask, read } = await armed(fresh);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    expect((await answer(dirs)).result.status).toBe("OBSERVATION_RECEIVED");
    const keysBefore = await observationFacts(dirs);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const console_ = scriptedConsole();
    const again = await answer(dirs, console_);
    expect(again.result.status).toBe("OBSERVATION_RECEIVED");
    expect(console_.asked()).toBe(0);
    expect(await observationFacts(dirs)).toEqual(keysBefore);
    expect((await readGlance(dirs, read.secretFile)).text).toBe(await directGlance(dirs));
  });

  it("an interruption after the commit but before the ask is cleared converges on the next answer without a new choice", async () => {
    const { dirs, ask } = await armed(fresh);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    // the retained-state remove fails once: the observation committed, the ask stayed
    let failed = false;
    const ledgerFs = {
      ...nodeFs,
      remove: async (p: string) => {
        if (!failed && p.endsWith("request.json")) {
          failed = true;
          throw new Error("injected");
        }
        return nodeFs.remove(p);
      },
    };
    const first = await answer(dirs, verbConsole("observe-surroundings"), { ledgerFs });
    expect(first.result.status).toBe("OBSERVATION_RECEIVED");
    expect(failed).toBe(true);
    expect(existsSync(requestFile(dirs))).toBe(true);
    const keys = await observationFacts(dirs);
    const console_ = scriptedConsole();
    const second = await answer(dirs, console_);
    expect(second.result.status).toBe("OBSERVATION_RECEIVED");
    expect(console_.asked()).toBe(0);
    expect(await observationFacts(dirs)).toEqual(keys);
    expect(existsSync(requestFile(dirs))).toBe(false);
  });

  it("a referee that is unavailable or has not answered earns nothing, keeps the ask, and the same ask is answered once the host is back", async () => {
    const { dirs, ask, read } = await armed(fresh);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const down = await answer(dirs, verbConsole("observe-surroundings"), { refereePolls: 2 }, null);
    expect(["REFEREE_PENDING", "REFEREE_UNAVAILABLE"]).toContain(down.result.status);
    expect(existsSync(requestFile(dirs))).toBe(true);
    expect(await observationFacts(dirs)).toEqual(baseline);
    expect((await readGlance(dirs, read.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    const back = await answer(dirs);
    expect(back.result.status).toBe("OBSERVATION_RECEIVED");
  });

  it("an invalid referee decision (an answer the engine refuses) earns nothing and is not the player's choice or a verdict", async () => {
    const { dirs, ask, read } = await armed(fresh);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    const bad = await answer(
      dirs,
      verbConsole("observe-surroundings"),
      { refereePolls: 40 },
      (doc) =>
        doc["operation"] === "F014D_DIRECT_PERCEPTION"
          ? { task_id: doc["task_id"], garbage: true }
          : null,
    );
    expect(bad.result.status).not.toBe("OBSERVATION_RECEIVED");
    expect(await observationFacts(dirs)).toEqual(baseline);
    expect((await readGlance(dirs, read.secretFile)).text).toBe(PROTOCOL_REFUSAL);
  });

  it("a negative decision is immutable: a later ask at the same basis is answered from the retained reading and cannot be re-rolled", async () => {
    const { dirs, ask } = await armed(screened);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    expect((await answer(dirs)).result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    const keys = await observationFacts(dirs);
    expect(JSON.parse((await askOnce(dirs, ask.secretFile)).text).ok).toBe(true);
    expect((await answer(dirs)).result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    expect(await observationFacts(dirs)).toEqual(keys);
  });
});

describe("the secret and the operator's console stay out of every host-visible output", () => {
  it("no secret, path, challenge, identity or world word reaches the request tool's replies, and the secret file is owner-only", async () => {
    const { dirs, ask } = await armed(fresh);
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
        /obs-|access\/|world\/|locus_|provenance|sealed|chat-host|observe-surroundings [0-9a-f]/i,
      );
    }
    c.end();
    await c.exit();
    expect(await c.stderrText).toBe("");
  });
});
