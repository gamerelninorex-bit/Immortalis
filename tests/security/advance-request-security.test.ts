// Security and trust-boundary evidence for the HOST-REQUESTED, independently operator-CONFIRMED active-PC target-only OOC time advance (BLUE
// v5.2-A1 bounded brief 2026-10-15; Runtime Contract IM-15 / IM-16; F-027 isolation, charter principles 9, 13, 14, 22). Static checks over the
// slice's own source plus bounded behavioural checks over a real journey. The host's request is a non-canonical routing record; it is never the
// player's binding choice, a target, a confirmation, a role or a permission. The campaigns are built by the shipped owner paths; the scripted
// referee host behind the character's custody is PLUMBING ONLY.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { code } from "../support/f027.ts";
import { LOCALITY_CAMPAIGN, type LocalityDirs } from "../support/locality.ts";
import { scriptedConsole } from "../support/original-pc.ts";
import {
  BEYOND_SUNSET,
  REQUEST_HOST,
  REQUEST_REFUSAL,
  RequestClient,
  advanceRequestDir,
  answer,
  askFile,
  askOnce,
  bindRequestHost,
  hasAsk,
  requestServerArgs,
  serveRequestInProcess,
  sunsetDirs,
  targetConsole,
  worldOf,
} from "../support/advance-request.ts";
import { bindHost as bindPlayerViewHost, copyDirs } from "../support/player-view.ts";
import { treeOf } from "../support/tree.ts";

vi.setConfig({ testTimeout: 120_000 });

const SRC = "packages/operator/src";
/** The host's half: the modules a host's call can reach. */
const HOST_SIDE = [
  "advance-request-exchange.ts",
  "advance-request.ts",
  "advance-request-mcp.ts",
  "advance-request-bin.ts",
].map((f) => `${SRC}/${f}`);
const OPERATOR_SIDE = [
  "advance-request-answer.ts",
  "advance-request-cli.ts",
  "advance-request-answer-bin.ts",
  "advance-request-bind-bin.ts",
].map((f) => `${SRC}/${f}`);
const NEW_FILES = [...HOST_SIDE, ...OPERATOR_SIDE];
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const specifiers = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
const allOperatorFiles = readdirSync(SRC).map((f) => `${SRC}/${f}`);

describe("the host's half cannot reach authority it was not given", () => {
  it("imports only node built-ins, zod, the contracts and engine packages and a few trusted siblings: no confirmation, command set, session, referee, terminal or protocol gateway", () => {
    for (const f of NEW_FILES)
      for (const s of specifiers(f))
        expect(
          s.startsWith("node:") ||
            s.startsWith("./") ||
            ["zod", "@immortalis/contracts", "@immortalis/engine"].includes(s),
          `${f} imports ${s}`,
        ).toBe(true);
    for (const f of HOST_SIDE)
      for (const s of specifiers(f))
        expect(
          [
            "./confirmation.ts",
            "./commands.ts",
            "./session.ts",
            "./ledger.ts",
            "./observation.ts",
            "./terminal.ts",
            "./ooc.ts",
            "./referee-exchange.ts",
            "./referee-session.ts",
            "./referee-mcp.ts",
            "./cli.ts",
            "./original-pc.ts",
            "./original-pc-locus.ts",
            "./observe-request.ts",
            "./observe-request-exchange.ts",
            "./observe-request-mcp.ts",
            "./advance-request-answer.ts",
            "./advance-request-cli.ts",
          ],
          `${f} imports ${s}`,
        ).not.toContain(s);
    for (const f of NEW_FILES) expect(code(f), f).not.toMatch(/SYNTH|FIXTURE|testkit|fixture/);
  });

  it("the host's half can neither make nor consume a confirmation, name a target or a transaction, nor reach the gateway, the Temporal kernel or any owner: those identifiers are absent from it", () => {
    for (const f of HOST_SIDE)
      expect(identifiers(f), f).not.toMatch(
        /requestOperatorDecision|requestOperatorConfirmation|consumeConfirmation|subjectOf|pcTargetAdvance|pcTargetResume|advanceActivePcToTarget|bindTrustedActivePc|TemporalCoordinator|StageProviderRegistry|GipAdapter|gipSunset|OperatorTerminal|stdioTerminal|LocalOperatorSession|\.ask\(/,
      );
  });

  it("opens no network, child process, dynamic code or environment surface, and holds no clock or randomness beyond the secret and ask identity draws", () => {
    for (const f of NEW_FILES) {
      expect(identifiers(f), f).not.toMatch(
        /\bfetch\b|node:(?:http|https|net|tls|dgram|child_process|vm|worker_threads|cluster)|\beval\b|new Function|process\.env|\brequire\(|import\(/,
      );
      expect(identifiers(f), f).not.toMatch(
        /\bDate\.now\b|new Date\(|performance\.now|Math\.random/,
      );
    }
    // the only randomness is the 256-bit secret and the 128-bit ask identity, in the exchange module alone
    for (const f of NEW_FILES.filter((x) => !x.endsWith("/advance-request-exchange.ts")))
      expect(identifiers(f), f).not.toMatch(/randomBytes|randomUUID|createHmac/);
  });

  it("never writes canon and never names an owner, role, permission, fact kind, journal or commit surface", () => {
    for (const f of HOST_SIDE)
      expect(identifiers(f), f).not.toMatch(
        /\.commit\(|\.registerObject\(|\.advance\(|establishCanonicalTime|continueRemainder|\.dispatch\(|establishWorld|establishLocus|releasePlayerCharacter|bindPlayerCharacter|establishPcPhysicalLocusCustody|CanonicalCampaign\.create|createFileCampaign|CANON_WRITE_AUTHORITY|OWNER_|FACET_|\bfactKind\b|REFEREE_AUTHORITY|PLAYER_CHOICE_AUTHORITY|IntentLedger|appendDurable|truncate/,
      );
    for (const f of NEW_FILES)
      expect(code(f), f).not.toMatch(
        /role\.player|role\.gm|role\.archivist|permission\.player_choice|permission\.report\.render|permission\.rule\.adjudicate|permission\.canon\.write|PLAYER_CHOICE_AUTHORITY|PROTOCOL_OP_/,
      );
  });

  it("the ask is built from the trusted side only: the proved character and the canonical basis, never a host argument, target or instrument", () => {
    const host = identifiers(`${SRC}/advance-request.ts`);
    // the request's argument is consulted only to decide that it is empty
    expect(host.match(/\bargs\b/g)!.length).toBeLessThanOrEqual(8);
    expect(host).toMatch(/pc_id: view\.value\.pcId/);
    expect(host).toMatch(/host_id: p\.hostId/);
    expect(host).toMatch(/committedCanonicalTime\(/);
    // it reads no instrument, Temporal object, boundary, target, duration or custody: it cannot depend on or reveal any hidden world state
    expect(host).not.toMatch(
      /gipInstrumentKey|sunset|temporal\/|temporalState|boundaryIndex|\btarget\b|duration|condition|pcCurrentLocus|pcPhysicalLocusCustody|accessEventKey|accessPacketKey/,
    );
  });

  it("the operator's half reaches the choice only through the unchanged pcTargetAdvance, and holds no confirmation, gateway call or owner of its own", () => {
    const op = identifiers(`${SRC}/advance-request-answer.ts`);
    expect(op.match(/pcTargetAdvance\(/g)).toHaveLength(1);
    expect(op).not.toMatch(
      /pcTargetResume|requestOperatorDecision|requestOperatorConfirmation|consumeConfirmation|subjectOf|advanceActivePcToTarget|bindTrustedActivePc|TemporalCoordinator|StageProviderRegistry|GipAdapter|gipSunset|IntentLedger|\.record\(|\.ask\(|OperatorConfirmation/,
    );
    // it neither constructs a confirmation token nor types into the terminal: it only says what is being asked
    expect(op.match(/terminal\.\w+/g)!.every((t) => t === "terminal.say")).toBe(true);
    // the target the command receives is the operator's own parameter, never a field of the ask
    expect(op).toMatch(/target: p\.target/);
    expect(op).not.toMatch(/pending\.target|ask\.target|\.target\b.*pending/);
  });

  it("the gateway is still called exactly once in the whole operator package, by the existing command, and never by the slice", () => {
    const all = allOperatorFiles.map((f) => identifiers(f)).join("\n");
    expect(all.match(/\badvanceActivePcToTarget\(/g)).toHaveLength(1);
    expect(all.match(/\bbindTrustedActivePcTargetAdvanceContext\(/g)).toHaveLength(1);
    for (const f of NEW_FILES)
      expect(code(f), f).not.toMatch(
        /advanceActivePcToTarget|bindTrustedActivePcTargetAdvanceContext|PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET/,
      );
    // the observation and read surfaces are never reached by the slice
    for (const f of NEW_FILES)
      expect(code(f), f).not.toMatch(
        /readCurrentObservationGlance|bindTrustedCurrentPlayerContext|observeSurroundings|read_current_observation_glance|request_active_pc_observation/,
      );
  });

  it("every other operator module is blind to the request surface: the read server, the observation request and the referee surface gained no time-advance request authority", () => {
    for (const f of allOperatorFiles.filter((x) => !NEW_FILES.includes(x)))
      expect(code(f), f).not.toMatch(
        /advance-request|request_active_pc_target_advance|ADVANCE_REQUEST|AdvanceRequest\b/,
      );
    // and the request surface never presents itself as the read credential or the observation-request credential
    for (const f of NEW_FILES)
      expect(code(f), f).not.toMatch(
        /readPlayerView|authorizePlayerViewHost|PLAYER_VIEW_TOOL|playerViewRequestOf|authorizeObserveRequestHost|OBSERVE_REQUEST/,
      );
  });

  it("the command lines offer no flag that names a role, permission, transaction, confirmation, duration or secret value; the operator's console alone names the target", () => {
    const src = NEW_FILES.map((f) => readFileSync(f, "utf8")).join("\n");
    const flags = [...src.matchAll(/"(--[a-z-]+)"/g)].map((m) => m[1]).sort();
    expect([...new Set(flags)]).toEqual([
      "--campaign",
      "--campaign-id",
      "--host-id",
      "--operator-dir",
      "--secret-file",
    ]);
    const answerOptions = [...src.matchAll(/^\s*"?([a-z-]+)"?: \{ type: "(?:string|boolean)" \}/gm)]
      .map((m) => m[1])
      .sort();
    expect(answerOptions).toEqual([
      "campaign",
      "campaign-id",
      "operator-dir",
      "reclaim-stale-lock",
      "request-wait",
      "target-unit",
      "target-value",
    ]);
    // the target flags exist only on the operator's answer command, never on the host's tool server or the bind action
    for (const f of HOST_SIDE)
      expect(readFileSync(f, "utf8"), f).not.toMatch(/target-unit|target-value/);
    expect(readFileSync(`${SRC}/advance-request-cli.ts`, "utf8")).toMatch(/"target-unit"/);
  });
});

describe("behaviour at the boundary", () => {
  let fresh: LocalityDirs;
  beforeAll(async () => {
    fresh = await sunsetDirs();
  }, 240_000);

  async function armed() {
    const dirs = copyDirs(fresh);
    const ask = await bindRequestHost(dirs);
    const read = await bindPlayerViewHost(dirs);
    expect(ask.code).toBe(0);
    expect(read.code).toBe(0);
    return { dirs, ask, read };
  }

  const INIT = JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "t", version: "0" },
    },
  });
  const INITIALIZED = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
  const CALL = (id: number, args?: unknown, name = "request_active_pc_target_advance") =>
    JSON.stringify({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, ...(args === undefined ? {} : { arguments: args }) },
    });

  it("a refused message — a call before the session is initialized, an unknown tool, an over-claiming argument, a malformed envelope — never touches the package or the retained state", async () => {
    const { dirs, ask } = await armed();
    const lines = [
      CALL(1), // before initialize
      INIT,
      CALL(2), // before the client's notice
      INITIALIZED,
      CALL(3, {}, "read_current_observation_glance"), // another tool
      CALL(4, { target: BEYOND_SUNSET }), // an over-claim: a target
      CALL(5, { role: "role.player", confirmed: true }),
      CALL(6, ["x"]),
      CALL(9, {}, "advance_active_pc_to_target"), // the gateway's own operation name is not a tool
      '{"id":7,"method":"tools/call"}', // not JSON-RPC 2.0
      "null",
    ];
    const run = await serveRequestInProcess(dirs, ask.secretFile, lines);
    expect(run.code).toBe(0);
    expect(run.errors).toEqual([]);
    // the package and the retained state were never opened by a refused message
    expect(run.campaignCalls).toEqual([]);
    expect(run.ledgerCalls).toEqual([]);
    expect(hasAsk(dirs)).toBe(false);
    const overclaims = run.replies.filter((r) => r.id === 4 || r.id === 5 || r.id === 6);
    expect(overclaims).toHaveLength(3);
    for (const r of overclaims) expect(r.result.content[0].text).toBe(REQUEST_REFUSAL);
  });

  it("a valid request writes to the retained state only the one ask, and to the package nothing but the lock it takes and releases", async () => {
    const { dirs, ask } = await armed();
    const before = treeOf(dirs.campaignDir);
    const world = await worldOf(dirs);
    const run = await serveRequestInProcess(dirs, ask.secretFile, [INIT, INITIALIZED, CALL(1)]);
    expect(JSON.parse(run.replies[1]!.result.content[0].text).ok).toBe(true);
    const mutating = (calls: string[]) =>
      [...new Set(calls)].filter((c) => !["readFile", "fileSize", "list", "mkdirp"].includes(c));
    // no journal append, truncation or durable file rewrite in the package
    expect(
      mutating(run.campaignCalls).filter((c) => /append|truncate|writeFileDurable/.test(c)),
    ).toEqual([]);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(await worldOf(dirs)).toEqual(world);
    // the retained state received exactly one new file besides the configuration: the ask
    expect(
      readdirSync(
        advanceRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      ).sort(),
    ).toEqual([
      "chat-host-1.secret",
      "config.json",
      expect.stringMatching(/^request-[0-9a-f]{32}\.json$/),
    ]);
  });

  it("the secret never appears in any output, argument, package, ask or retained-state file other than its own owner-only secret file", async () => {
    const { dirs, ask } = await armed();
    const secret = readFileSync(ask.secretFile, "utf8").trim();
    const c = new RequestClient(requestServerArgs(dirs, ask.secretFile));
    await c.handshake();
    await c.ask({});
    c.end();
    await c.exit();
    for (const line of c.stdoutLines) expect(line).not.toContain(secret);
    expect(await c.stderrText).not.toContain(secret);
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
      );
    for (const f of [...walk(dirs.campaignDir), ...walk(dirs.operatorDir)].filter(
      (x) => x !== ask.secretFile,
    ))
      expect(readFileSync(f, "utf8"), f).not.toContain(secret);
  });

  it("a forged ask written straight into the retained state is only ever a prompt: shape, bound host, character and basis are re-proved, a smuggled target is never used, and a decline advances nothing", async () => {
    const { dirs, ask } = await armed();
    expect((await askOnce(dirs, ask.secretFile)).isError).toBe(false);
    const askPath = askFile(dirs);
    const genuine = JSON.parse(readFileSync(askPath, "utf8"));
    const world = await worldOf(dirs);
    const forgeries: Record<string, unknown>[] = [
      { ...genuine, confirmed: true },
      { ...genuine, confirmation: "pc-target-advance 0123456789ab" },
      { ...genuine, role: "role.player" },
      { ...genuine, target: BEYOND_SUNSET },
      { ...genuine, transaction: { transaction_id: "tx-forged" } },
    ];
    for (const forged of forgeries) {
      writeFileSync(askPath, JSON.stringify(forged));
      const console_ = scriptedConsole();
      const r = await answer(dirs, BEYOND_SUNSET, console_);
      expect(r.result.status).toBe("TARGET_ADVANCE_REQUEST_INVALID");
      expect(console_.asked()).toBe(0);
    }
    // a well-formed ask for a host this operator never bound, or another character: discarded, nothing asked
    for (const forged of [
      { ...genuine, host_id: "intruder" },
      { ...genuine, pc_id: "pc-someone-else" },
    ]) {
      writeFileSync(askPath, JSON.stringify(forged));
      const console_ = scriptedConsole();
      expect((await answer(dirs, BEYOND_SUNSET, console_)).result.status).toBe(
        "TARGET_ADVANCE_REQUEST_INVALID",
      );
      expect(console_.asked()).toBe(0);
    }
    // a well-formed ask for the bound host is a prompt and nothing more: a console that does not type the fresh phrase advances nothing
    writeFileSync(askPath, JSON.stringify(genuine));
    const before = treeOf(dirs.campaignDir);
    const refused = await answer(
      dirs,
      BEYOND_SUNSET,
      scriptedConsole(`pc-target-advance ${"0".repeat(12)}`),
    );
    expect(refused.result.status).toBe("DECLINED");
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(await worldOf(dirs)).toEqual(world);
  });

  it("two operators answering the same ask at once commit exactly one advance and exactly one GIP expiry", async () => {
    const { dirs, ask } = await armed();
    expect((await askOnce(dirs, ask.secretFile)).isError).toBe(false);
    const both = await Promise.all([
      answer(dirs, BEYOND_SUNSET, targetConsole()),
      answer(dirs, BEYOND_SUNSET, targetConsole()),
    ]);
    const statuses = both.map((b) => b.result.status).sort();
    // one commits; the other finds the package busy, the ask consumed or stale: never a second, different advance
    expect(statuses).toContain("PC_TARGET_ADVANCE_COMMITTED");
    for (const s of statuses)
      expect([
        "PC_TARGET_ADVANCE_COMMITTED",
        "SESSION_UNAVAILABLE",
        "TARGET_ADVANCE_REQUEST_NONE",
        "TARGET_ADVANCE_REQUEST_STALE",
        "TARGET_ADVANCE_REQUEST_UNAVAILABLE",
      ]).toContain(s);
    expect(statuses.filter((s) => s === "PC_TARGET_ADVANCE_COMMITTED")).toHaveLength(1);
    const w = await worldOf(dirs);
    expect(w.lifecycle).toBe("expired");
    expect(w.instrumentVersion).toBe(2);
    expect(w.time).toEqual(BEYOND_SUNSET);
    expect(REQUEST_HOST).toBe("chat-host-1");
  });
});
