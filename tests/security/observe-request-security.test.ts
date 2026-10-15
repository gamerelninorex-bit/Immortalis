// Security and trust-boundary evidence for the HOST-REQUESTED, independently operator-CONFIRMED active-PC observation (BLUE v5.2-A1 bounded brief
// 2026-10-15; Runtime Contract IM-15 / IM-16; F-027 isolation, charter principles 9, 13, 14, 22). Static checks over the slice's own source plus
// bounded behavioural checks over a real journey. The host's request is a non-canonical routing record; it is never the player's binding choice,
// the referee's judgment, a confirmation or a role. The campaigns are built by the shipped commands; the scripted referee host is PLUMBING ONLY.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { code } from "../support/f027.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { PC_ID, observationCampaign, verbConsole } from "../support/observation.ts";
import { scriptedConsole } from "../support/original-pc.ts";
import {
  answer,
  askOnce,
  bindRequestHost,
  observeRequestDir,
  REQUEST_HOST,
  REQUEST_REFUSAL,
  RequestClient,
  askFile,
  hasAsk,
  requestServerArgs,
  serveRequestInProcess,
} from "../support/observe-request.ts";
import { bindHost as bindPlayerViewHost, copyDirs, directGlance } from "../support/player-view.ts";
import { PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { treeOf } from "../support/tree.ts";

vi.setConfig({ testTimeout: 120_000 });

const SRC = "packages/operator/src";
/** The host's half: the modules a host's call can reach. */
const HOST_SIDE = [
  "observe-request-exchange.ts",
  "observe-request.ts",
  "observe-request-mcp.ts",
  "observe-request-bin.ts",
].map((f) => `${SRC}/${f}`);
const OPERATOR_SIDE = [
  "observe-request-answer.ts",
  "observe-request-cli.ts",
  "observe-request-answer-bin.ts",
  "observe-request-bind-bin.ts",
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
  it("imports only node built-ins, zod, the contracts and engine packages and a few trusted siblings: no confirmation, observation, referee, terminal or protocol gateway", () => {
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
            "./observation.ts",
            "./terminal.ts",
            "./ooc.ts",
            "./referee-exchange.ts",
            "./referee-session.ts",
            "./referee-mcp.ts",
            "./commands.ts",
            "./cli.ts",
            "./original-pc.ts",
            "./original-pc-locus.ts",
            "./observe-request-answer.ts",
            "./observe-request-cli.ts",
          ],
          `${f} imports ${s}`,
        ).not.toContain(s);
    for (const f of NEW_FILES) expect(code(f), f).not.toMatch(/SYNTH|FIXTURE|testkit|fixture/);
  });

  it("the host's half can neither make nor consume a confirmation, ask a referee, observe, or write: those identifiers are absent from it", () => {
    for (const f of HOST_SIDE)
      expect(identifiers(f), f).not.toMatch(
        /requestOperatorDecision|requestOperatorConfirmation|consumeConfirmation|subjectOf|observeSurroundings|askObservation|RefereeAdjudicationAdapter|formObservedPacket|OperatorTerminal|stdioTerminal|\.ask\(/,
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
    for (const f of NEW_FILES.filter((x) => !x.endsWith("/observe-request-exchange.ts")))
      expect(identifiers(f), f).not.toMatch(/randomBytes|randomUUID|createHmac/);
  });

  it("never writes canon and never names an owner, role, permission, fact kind, journal or commit surface", () => {
    for (const f of HOST_SIDE)
      expect(identifiers(f), f).not.toMatch(
        /\.commit\(|\.registerObject\(|\.advance\(|establishCanonicalTime|continueRemainder|\.dispatch\(|establishWorld|establishLocus|releasePlayerCharacter|bindPlayerCharacter|establishPcPhysicalLocusCustody|CanonicalCampaign\.create|createFileCampaign|CANON_WRITE_AUTHORITY|OWNER_|FACET_|\bfactKind\b|REFEREE_AUTHORITY|PLAYER_CHOICE_AUTHORITY|IntentLedger|appendDurable|truncate/,
      );
    for (const f of NEW_FILES)
      expect(code(f), f).not.toMatch(
        /role\.player|role\.gm|role\.archivist|permission\.player_choice|permission\.report\.render|permission\.rule\.adjudicate|permission\.canon\.write/,
      );
  });

  it("the ask is built from the trusted side only: the proved character and the canonical basis, never a host argument", () => {
    const host = identifiers(`${SRC}/observe-request.ts`);
    // the request's argument is consulted only to decide that it is empty
    expect(host.match(/\bargs\b/g)!.length).toBeLessThanOrEqual(8);
    expect(host).toMatch(/pc_id: view\.value\.pcId/);
    expect(host).toMatch(/host_id: p\.hostId/);
    expect(host).toMatch(/committedCanonicalTime\(/);
    // it reads no observation, packet, event, decision or world identity: it cannot depend on hidden observation state
    expect(host).not.toMatch(
      /accessEventKey|accessPacketKey|observationEventId|isObservationEarnedFact|observationRecordOf|observationTask|F014D|referee\/|\.world\(|\.locus\(/,
    );
  });

  it("the operator's half reaches the choice only through the unchanged observeSurroundings, and holds no confirmation of its own", () => {
    const op = identifiers(`${SRC}/observe-request-answer.ts`);
    expect(op.match(/observeSurroundings\(/g)).toHaveLength(1);
    expect(op).not.toMatch(
      /requestOperatorDecision|requestOperatorConfirmation|consumeConfirmation|subjectOf|askObservation|RefereeAdjudicationAdapter|formObservedPacket|\.ask\(|OperatorConfirmation/,
    );
    // it neither constructs a confirmation token nor types into the terminal: it only says what is being asked
    expect(op.match(/terminal\.\w+/g)!.every((t) => t === "terminal.say")).toBe(true);
  });

  it("the glance gateway and its binder are still called exactly once each in the whole operator package, and never by the slice", () => {
    const all = allOperatorFiles.map((f) => identifiers(f)).join("\n");
    expect(all.match(/bindTrustedCurrentPlayerContext\(/g)).toHaveLength(1);
    expect(all.match(/readCurrentObservationGlance\(/g)).toHaveLength(1);
    for (const f of NEW_FILES)
      expect(code(f), f).not.toMatch(
        /readCurrentObservationGlance|bindTrustedCurrentPlayerContext|read_current_observation_glance|PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE/,
      );
  });

  it("every other operator module is blind to the request surface: the read server and the interpreter-only referee surface gained no request authority", () => {
    for (const f of allOperatorFiles.filter((x) => !NEW_FILES.includes(x)))
      expect(code(f), f).not.toMatch(
        /observe-request|request_active_pc_observation|OBSERVE_REQUEST/,
      );
    // and the request surface never presents itself as the read credential
    for (const f of NEW_FILES)
      expect(code(f), f).not.toMatch(
        /readPlayerView|authorizePlayerViewHost|PLAYER_VIEW_TOOL|playerViewRequestOf/,
      );
  });

  it("the command lines offer no flag that names a character, role, permission, event, time, confirmation or secret", () => {
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
      "referee-wait",
      "request-wait",
    ]);
  });
});

describe("behaviour at the boundary", () => {
  let fresh: LocalityDirs;
  beforeAll(async () => {
    fresh = (await observationCampaign()).dirs;
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
  const CALL = (id: number, args?: unknown, name = "request_active_pc_observation") =>
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
      CALL(4, { confirmed: true }), // an over-claim
      CALL(5, { role: "role.player" }),
      CALL(6, ["x"]),
      '{"id":7,"method":"tools/call"}', // not JSON-RPC 2.0
      "null",
    ];
    const run = await serveRequestInProcess(dirs, ask.secretFile, lines);
    expect(run.code).toBe(0);
    expect(run.errors).toEqual([]);
    // the only reads are the secret file; the package and the retained state were never opened by a refused message
    expect(run.campaignCalls).toEqual([]);
    expect(run.ledgerCalls).toEqual([]);
    expect(existsAsk(dirs)).toBe(false);
    const overclaims = run.replies.filter((r) => r.id === 4 || r.id === 5 || r.id === 6);
    for (const r of overclaims) expect(r.result.content[0].text).toBe(REQUEST_REFUSAL);
  });

  const existsAsk = (dirs: LocalityDirs) => hasAsk(dirs);

  it("a valid request writes to the retained state only the one ask, and to the package nothing but the lock it takes and releases", async () => {
    const { dirs, ask } = await armed();
    const before = treeOf(dirs.campaignDir);
    const run = await serveRequestInProcess(dirs, ask.secretFile, [INIT, INITIALIZED, CALL(1)]);
    expect(JSON.parse(run.replies[1]!.result.content[0].text).ok).toBe(true);
    const mutating = (calls: string[]) =>
      [...new Set(calls)].filter((c) => !["readFile", "fileSize", "list", "mkdirp"].includes(c));
    // no journal append, truncation or durable file rewrite in the package
    expect(
      mutating(run.campaignCalls).filter((c) => /append|truncate|writeFileDurable/.test(c)),
    ).toEqual([]);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    // the retained state received exactly one new file besides the configuration: the ask
    expect(
      readdirSync(
        observeRequestDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
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

  it("a forged ask written straight into the retained state is only ever a prompt: shape, bound host, character and basis are re-proved, and a decline observes nothing", async () => {
    const { dirs, ask, read } = await armed();
    expect((await askOnce(dirs, ask.secretFile)).isError).toBe(false);
    const askPath = askFile(dirs);
    const genuine = JSON.parse(readFileSync(askPath, "utf8"));
    const forgeries: Record<string, unknown>[] = [
      { ...genuine, confirmed: true },
      { ...genuine, confirmation: "observe-surroundings 0123456789ab" },
      { ...genuine, role: "role.player" },
    ];
    for (const forged of forgeries) {
      writeFileSync(askPath, JSON.stringify(forged));
      const console_ = scriptedConsole();
      const r = await answer(dirs, console_);
      expect(r.result.status).toBe("OBSERVATION_REQUEST_INVALID");
      expect(console_.asked()).toBe(0);
    }
    // a well-formed ask for a host this operator never bound, or another character: discarded, nothing asked
    for (const forged of [
      { ...genuine, host_id: "intruder" },
      { ...genuine, pc_id: "pc-someone-else" },
    ]) {
      writeFileSync(askPath, JSON.stringify(forged));
      const console_ = scriptedConsole();
      expect((await answer(dirs, console_)).result.status).toBe("OBSERVATION_REQUEST_INVALID");
      expect(console_.asked()).toBe(0);
    }
    // a well-formed ask for the bound host is a prompt and nothing more: a console that does not type the fresh phrase observes nothing
    writeFileSync(askPath, JSON.stringify(genuine));
    const before = treeOf(dirs.campaignDir);
    const refused = await answer(dirs, scriptedConsole(`observe-surroundings ${"0".repeat(12)}`));
    expect(refused.result.status).toBe("DECLINED");
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(await readViaDirect(dirs)).toBe(PROTOCOL_REFUSAL);
    expect(read.code).toBe(0);
  });

  const readViaDirect = (dirs: LocalityDirs) => directGlance(dirs);

  it("two operators answering the same ask at once commit exactly one observation, and the host reads exactly what the existing gateway returns", async () => {
    const { dirs, ask } = await armed();
    expect((await askOnce(dirs, ask.secretFile)).isError).toBe(false);
    const both = await Promise.all([
      answer(dirs, verbConsole("observe-surroundings")),
      answer(dirs, verbConsole("observe-surroundings")),
    ]);
    const statuses = both.map((b) => b.result.status).sort();
    // one commits; the other finds the package busy, the ask consumed, or converges on the same records: never a second, different observation
    expect(statuses).toContain("OBSERVATION_RECEIVED");
    for (const s of statuses)
      expect([
        "OBSERVATION_RECEIVED",
        "SESSION_UNAVAILABLE",
        "OBSERVATION_REQUEST_NONE",
        "OBSERVATION_REQUEST_UNAVAILABLE",
      ]).toContain(s);
    const c = await openOrdinary(dirs.campaignDir);
    const packets = c.store
      .listFacts()
      .filter((f) => f.key.startsWith("access/") && f.key.includes(PC_ID));
    await c.close();
    expect(packets.length).toBeGreaterThan(0);
    const keys = packets.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(JSON.parse(await directGlance(dirs)).ok).toBe(true);
    expect(REQUEST_HOST).toBe("chat-host-1");
  });
});
