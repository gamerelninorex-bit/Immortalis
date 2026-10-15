/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies */
// Security and trust-boundary evidence for the local PLAYER-VIEW MCP transport (BLUE v5.2 bounded brief 2026-10-15; Runtime Contract IM-15 /
// IM-16, RC-14; F-027 isolation). Static checks over the transport's own source plus bounded behavioural checks over a real journey. The
// transport authenticates a LOCAL process to a LOCAL operator-written binding and proves the one authorized player view against canon on every
// call; it implements and claims NO remote authentication, login, tenant or person identity. A credential, a host name or a model name confers
// no role and no permission. The campaigns are built by the shipped commands; the scripted referee host is PLUMBING ONLY (no semantic claim).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ProjectionStateView } from "@immortalis/engine";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import {
  openAuthorizedPlayerView,
  readPlayerViewGlance,
} from "../../packages/operator/src/player-view.ts";
import { playerViewRequestOf } from "../../packages/operator/src/player-view-mcp.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { PC_ID, observationCampaign, observe, screenScene } from "../support/observation.ts";
import {
  McpClient,
  PLAYER_VIEW_HOST,
  bindHost,
  copyDirs,
  directGlance,
  serveInProcess,
  serverArgs,
  withServer,
} from "../support/player-view.ts";
import { PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { code } from "../support/f027.ts";

vi.setConfig({ testTimeout: 120_000 });

const SRC = "packages/operator/src";
const NEW_FILES = [
  "player-view-exchange.ts",
  "player-view.ts",
  "player-view-mcp.ts",
  "player-view-bin.ts",
  "player-view-bind-bin.ts",
].map((f) => `${SRC}/${f}`);
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const specifiers = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
const allOperatorFiles = readdirSync(SRC).map((f) => `${SRC}/${f}`);

describe("the transport cannot reach authority it was not given", () => {
  it("its modules import only node built-ins, zod, the contracts, engine and protocol packages, and their siblings: no testkit, fixture or test support", () => {
    for (const f of NEW_FILES)
      for (const s of specifiers(f))
        expect(
          s.startsWith("node:") ||
            s.startsWith("./") ||
            ["zod", "@immortalis/contracts", "@immortalis/engine", "@immortalis/protocol"].includes(
              s,
            ),
          `${f} imports ${s}`,
        ).toBe(true);
    for (const f of NEW_FILES) expect(code(f), f).not.toMatch(/SYNTH|FIXTURE|testkit|fixture/);
  });

  it("opens no network, child process, dynamic code or environment surface, and holds no clock or randomness beyond the secret draw", () => {
    for (const f of NEW_FILES) {
      expect(identifiers(f), f).not.toMatch(
        /\bfetch\b|node:(?:http|https|net|tls|dgram|child_process|vm|worker_threads|cluster)|\beval\b|new Function|process\.env|\brequire\(|import\(/,
      );
      expect(identifiers(f), f).not.toMatch(
        /\bDate\.now\b|new Date\(|performance\.now|Math\.random/,
      );
    }
    // the only randomness is the 256-bit secret the bind action draws, in the exchange module alone
    for (const f of NEW_FILES.filter((x) => !x.endsWith("/player-view-exchange.ts")))
      expect(identifiers(f), f).not.toMatch(/randomBytes|randomUUID|createHmac/);
  });

  it("never writes canon and never names an owner, role, permission, fact kind, journal or commit surface", () => {
    for (const f of NEW_FILES)
      expect(identifiers(f), f).not.toMatch(
        /\.commit\(|\.registerObject\(|\.advance\(|establishCanonicalTime|continueRemainder|\.dispatch\(|establishWorld|establishLocus|releasePlayerCharacter|bindPlayerCharacter|establishPcPhysicalLocusCustody|CanonicalCampaign\.create|createFileCampaign|CANON_WRITE_AUTHORITY|OWNER_|FACET_|\bfactKind\b|REFEREE_AUTHORITY|PLAYER_CHOICE_AUTHORITY|IntentLedger|appendDurable|truncate/,
      );
    for (const f of NEW_FILES)
      expect(code(f), f).not.toMatch(
        /role\.player|role\.gm|role\.archivist|permission\.player_choice|permission\.report\.render|permission\.rule\.adjudicate|permission\.canon\.write/,
      );
  });

  it("the transport module never opens the package, and only the trusted-side module builds the context, from canon and never from the host", () => {
    const mcp = identifiers(`${SRC}/player-view-mcp.ts`);
    expect(mcp).not.toMatch(/CanonicalCampaign|openFileCampaign|\.store\b|getFact|committedGroup/);
    // exactly one binder call and one gateway call in the whole operator package, both in the trusted-side module
    const all = allOperatorFiles.map((f) => identifiers(f)).join("\n");
    expect(all.match(/bindTrustedCurrentPlayerContext\(/g)).toHaveLength(1);
    expect(all.match(/readCurrentObservationGlance\(/g)).toHaveLength(1);
    const trusted = identifiers(`${SRC}/player-view.ts`);
    expect(trusted.match(/bindTrustedCurrentPlayerContext\(/g)).toHaveLength(1);
    expect(trusted.match(/readCurrentObservationGlance\(/g)).toHaveLength(1);
    // the recipient is the character proved against canon (never a parameter, a host argument or a request field)
    const call = /bindTrustedCurrentPlayerContext\(\{([^}]*)\}\)/.exec(trusted)![1]!;
    expect(call.replace(/\s+/g, " ").trim()).toBe(
      "view: view.value.campaign.store, recipient_id: view.value.pcId,",
    );
    expect(trusted).toMatch(/const pcId = campaign\.binding\(\)!\.value\.active_pc\.entity_id/);
    // the trusted-side proof names no observation, packet, event, decision or time identity: it cannot depend on hidden observation state
    expect(trusted).not.toMatch(
      /accessEventKey|accessPacketKey|observationEventId|TEMPORAL_STATE_KEY|isObservationEarnedFact|observationRecordOf|F014D|referee\//,
    );
  });

  it("every other operator module is blind to the transport: the interpreter-only referee surface gained no player read", () => {
    // BLUE v5.2-A1 (host-requested observation): its `observe-request*` modules are bound by observe-request-security.test.ts (they may reach the
    // read transport's `openAuthorizedPlayerView` proof, and never its gateway call, binder, tool name or credential)
    // BLUE v5.2-A1 (host-requested time advance): its `advance-request*` modules reach the same `openAuthorizedPlayerView` proof and are bound
    // by advance-request-security.test.ts (they never call the read gateway, its binder, its tool name or its credential)
    for (const f of allOperatorFiles.filter(
      (x) =>
        !NEW_FILES.includes(x) &&
        !x.includes("/observe-request") &&
        !x.includes("/advance-request"),
    ))
      expect(code(f), f).not.toMatch(
        /readCurrentObservationGlance|bindTrustedCurrentPlayerContext|read_current_observation_glance|PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE|player-view/,
      );
  });

  it("the command line offers no flag that names a character, role, permission, event, time or secret", () => {
    const src = NEW_FILES.map((f) => readFileSync(f, "utf8")).join("\n");
    const flags = [...src.matchAll(/"(--[a-z-]+)"/g)].map((m) => m[1]).sort();
    expect([...new Set(flags)]).toEqual([
      "--campaign",
      "--campaign-id",
      "--host-id",
      "--operator-dir",
      "--secret-file",
    ]);
  });
});

describe("what the host can say maps to the one strict request, on the same read path as a valid one (RC-14)", () => {
  let observedDirs: LocalityDirs;
  beforeAll(async () => {
    observedDirs = (await observationCampaign()).dirs;
    expect((await observe(observedDirs)).result.status).toBe("OBSERVATION_RECEIVED");
  }, 120_000);

  it("a valid call and every over-claiming call perform the identical ordered identity reads against the campaign view", async () => {
    const c = await openOrdinary(observedDirs.campaignDir);
    try {
      const trace = (args: unknown) => {
        const calls: string[] = [];
        const view: ProjectionStateView = {
          getFact: (k) => (calls.push("getFact"), c.store.getFact(k)),
          committedGroup: (id) => (calls.push("committedGroup"), c.store.committedGroup(id)),
        };
        const out = JSON.stringify(
          readCurrentObservationGlance(
            bindTrustedCurrentPlayerContext({ view, recipient_id: PC_ID }),
            playerViewRequestOf(args),
          ),
        );
        return { out, calls };
      };
      const valid = trace(undefined);
      expect(JSON.parse(valid.out).ok).toBe(true);
      expect(trace({}).calls).toEqual(valid.calls);
      for (const claim of [
        { event_id: "obs-1" },
        { recipient_id: "pc-other" },
        { role: "role.archivist" },
        { operation: "read_current_observation_glance" },
        null,
        [],
        "s",
        42,
        true,
      ]) {
        const t = trace(claim);
        expect(t.out, JSON.stringify(claim)).toBe(PROTOCOL_REFUSAL);
        expect(t.calls, JSON.stringify(claim)).toEqual(valid.calls);
      }
    } finally {
      await c.close();
    }
  });

  it("the trusted-side proof is identical whatever the concealed observation state: none, obstructed and earned all prove the same view", async () => {
    const earned = copyDirs(observedDirs);
    const fresh = (await observationCampaign()).dirs;
    const blocked = (await observationCampaign({ scene: screenScene() })).dirs;
    expect((await observe(blocked)).result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    const proved: unknown[] = [];
    for (const dirs of [earned, fresh, blocked]) {
      const view = await openAuthorizedPlayerView({
        campaignDir: dirs.campaignDir,
        campaignId: LOCALITY_CAMPAIGN,
        stateDir: dirs.operatorDir,
      });
      expect(view.ok).toBe(true);
      if (view.ok) {
        proved.push({ pc: view.value.pcId, uid: view.value.operatorUid });
        await view.value.campaign.close();
      }
    }
    expect(proved).toEqual([
      { pc: PC_ID, uid: process.getuid!() },
      { pc: PC_ID, uid: process.getuid!() },
      { pc: PC_ID, uid: process.getuid!() },
    ]);
  });
});

describe("no extra long-lived secret in a prompt, a log or the package", () => {
  it("the secret exists only in its owner-only file (and its digest in the binding): not in any output, argument, package or retained-state file", async () => {
    const source = (await observationCampaign()).dirs;
    expect((await observe(source)).result.status).toBe("OBSERVATION_RECEIVED");
    const dirs = copyDirs(source);
    const b = await bindHost(dirs);
    expect(b.code).toBe(0);
    const secret = readFileSync(b.secretFile, "utf8").trim();
    const args = serverArgs(dirs, b.secretFile);
    expect(args.join(" ")).not.toContain(secret);
    const run = await withServer(args, async (c) => {
      const replies = [(await c.call({})).text, (await c.call({ x: 1 })).text];
      const tools = JSON.stringify(await c.rpc("tools/list"));
      return [...replies, tools];
    });
    expect(run.exit).toBe(0);
    expect(run.stderr).toBe("");
    for (const text of [...run.value, ...run.stdout, ...b.out, ...b.err])
      expect(text).not.toContain(secret);
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((n) =>
        statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)],
      );
    for (const file of [...walk(dirs.campaignDir), ...walk(dirs.operatorDir)])
      if (file !== b.secretFile) expect(readFileSync(file, "utf8"), file).not.toContain(secret);
    // the server process was never handed the secret in its environment either
    expect(JSON.stringify(process.env)).not.toContain(secret);
  });
});

describe("a hostile or unbound caller learns nothing before authorization, and nothing distinguishes the causes of a refusal", () => {
  it("every unauthorized arrangement answers with the same bytes as a campaign that never earned an observation", async () => {
    const source = (await observationCampaign()).dirs;
    expect((await observe(source)).result.status).toBe("OBSERVATION_RECEIVED");
    const dirs = copyDirs(source);
    const b = await bindHost(dirs);
    expect(b.code).toBe(0);
    const secret = readFileSync(b.secretFile, "utf8").trim();
    const base = {
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      stateDir: dirs.operatorDir,
      hostId: PLAYER_VIEW_HOST,
      secret,
    };
    const request = playerViewRequestOf(undefined);
    expect(JSON.parse(JSON.stringify(await readPlayerViewGlance(base, request))).ok).toBe(true);
    const direct = JSON.parse(await directGlance(dirs));
    expect(direct.ok).toBe(true);
    for (const [name, p] of Object.entries({
      "unbound host": { ...base, hostId: "nobody" },
      "wrong secret": { ...base, secret: "cd".repeat(32) },
      "malformed secret": { ...base, secret: "" },
      "another campaign identity": { ...base, campaignId: "campaign-other" },
      "no such package": { ...base, campaignDir: `${dirs.campaignDir}-absent` },
      "no such state directory": { ...base, stateDir: `${dirs.operatorDir}-absent` },
    })) {
      const out = JSON.stringify(await readPlayerViewGlance(p, request));
      expect(out, name).toBe(PROTOCOL_REFUSAL);
    }
  });

  it("a caller that is not bound gets the refusal, never the presentation, however it frames the call", async () => {
    const source = (await observationCampaign()).dirs;
    expect((await observe(source)).result.status).toBe("OBSERVATION_RECEIVED");
    const dirs = copyDirs(source);
    const b = await bindHost(dirs);
    const stranger = new McpClient(serverArgs(dirs, b.secretFile, { hostId: "stranger" }));
    await stranger.handshake();
    const r = await stranger.call({});
    expect(r.isError).toBe(true);
    expect(r.text).toBe(PROTOCOL_REFUSAL);
    stranger.end();
    await stranger.exit();
  });
});

describe("MCP admission and lifecycle (BLUE H-1): a malformed or out-of-phase message is refused before anything is read or disclosed", () => {
  let dirs: LocalityDirs;
  let secretFile: string;
  let direct: string;
  beforeAll(async () => {
    const source = (await observationCampaign()).dirs;
    expect((await observe(source)).result.status).toBe("OBSERVATION_RECEIVED");
    dirs = copyDirs(source);
    secretFile = (await bindHost(dirs)).secretFile;
    direct = await directGlance(dirs);
    expect(JSON.parse(direct).ok).toBe(true); // the campaign has an earned, current observation
  }, 120_000);

  const INIT = {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test-client", version: "0" },
  };
  const CALL_PARAMS = { name: "read_current_observation_glance", arguments: {} };
  /** The text that would only appear in a delivered presentation. */
  const LEAK = /PERCEPTION|CONTACT|REFERENT|bright red|NPK_EVENT_SIGNAL|"ok":true/;

  it("the review's own example — a tools/call without jsonrpc 2.0 — is refused, in every stage, on a real stdio process", async () => {
    const c = new McpClient(serverArgs(dirs, secretFile));
    // before initialization
    const bare = await c.raw(JSON.stringify({ id: 1, method: "tools/call", params: CALL_PARAMS }));
    expect(bare.error.code).toBe(-32600);
    expect(JSON.stringify(bare)).not.toMatch(LEAK);
    // after a complete, valid initialization the same malformed message is still refused
    await c.handshake();
    for (const wrong of [undefined, "1.0", "2", 2, "2.0 ", null, ["2.0"]]) {
      const r = await c.raw(
        JSON.stringify({ jsonrpc: wrong, id: 2, method: "tools/call", params: CALL_PARAMS }),
      );
      expect(r.error.code, String(wrong)).toBe(-32600);
      expect(r.result, String(wrong)).toBeUndefined();
      expect(JSON.stringify(r), String(wrong)).not.toMatch(LEAK);
    }
    // the session is unharmed by the refusals: the well-formed call is served
    expect((await c.call({})).text).toBe(direct);
    c.end();
    expect(await c.exit()).toBe(0);
  });

  it("request identities that are not strings or integers are refused on a real stdio process, and a normal identity is served afterwards", async () => {
    const c = new McpClient(serverArgs(dirs, secretFile));
    await c.handshake();
    for (const id of [1.5, true, false, null, {}, [], 2 ** 53]) {
      const r = await c.raw(
        JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: CALL_PARAMS }),
      );
      expect(r.error.code, JSON.stringify(id)).toBe(-32600);
      expect(r.id).toBeNull();
      expect(JSON.stringify(r)).not.toMatch(LEAK);
    }
    expect((await c.call({})).text).toBe(direct);
    c.end();
    await c.exit();
  });

  it("a tool call before initialize, and between initialize and the client's notice, is refused on a real stdio process; the proper handshake then serves", async () => {
    const c = new McpClient(serverArgs(dirs, secretFile));
    const early = await c.raw(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: CALL_PARAMS }),
    );
    expect(early.error).toEqual({ code: -32600, message: "server not initialized" });
    expect(JSON.stringify(early)).not.toMatch(LEAK);
    const listing = await c.raw(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }));
    expect(listing.error.code).toBe(-32600);
    expect(JSON.stringify(listing)).not.toContain("read_current_observation_glance");
    // initialize answered, the client's notice not yet sent
    const init = await c.raw(
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "initialize", params: INIT }),
    );
    expect(init.result.serverInfo.name).toBe("immortalis-player-view");
    const between = await c.raw(
      JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: CALL_PARAMS }),
    );
    expect(between.error.code).toBe(-32600);
    expect(JSON.stringify(between)).not.toMatch(LEAK);
    // a second initialize does not restart or bypass anything
    const again = await c.raw(
      JSON.stringify({ jsonrpc: "2.0", id: 5, method: "initialize", params: INIT }),
    );
    expect(again.error.code).toBe(-32600);
    c.notify("notifications/initialized");
    const served = await c.call({});
    expect(served.isError).toBe(false);
    expect(served.text).toBe(direct);
    c.end();
    expect(await c.exit()).toBe(0);
  });

  it("an under-specified initialize does not start the session: the call that follows it is refused on a real stdio process", async () => {
    for (const params of [
      undefined,
      {},
      { protocolVersion: "2025-06-18" },
      { protocolVersion: "2025-06-18", capabilities: {} },
      { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "c" } },
      { protocolVersion: "2025-06-18", clientInfo: { name: "c", version: "0" } },
      { capabilities: {}, clientInfo: { name: "c", version: "0" } },
    ]) {
      const c = new McpClient(serverArgs(dirs, secretFile));
      const init = await c.raw(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          ...(params === undefined ? {} : { params }),
        }),
      );
      expect(init.error.code, JSON.stringify(params)).toBe(-32602);
      c.notify("notifications/initialized");
      const call = await c.raw(
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: CALL_PARAMS }),
      );
      expect(call.error.code, JSON.stringify(params)).toBe(-32600);
      expect(JSON.stringify(call)).not.toMatch(LEAK);
      c.end();
      await c.exit();
    }
  });

  it("a malformed initialized notification (params not an object) does not start the session on a real stdio process, and the proper notice then does", async () => {
    for (const bad of [7, "x", true, null, []]) {
      const c = new McpClient(serverArgs(dirs, secretFile));
      const init = await c.raw(
        JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT }),
      );
      expect(init.result.serverInfo.name).toBe("immortalis-player-view");
      // a notification has no reply: the next request's reply is the only observable
      c.notify("notifications/initialized", bad);
      const early = await c.raw(
        JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: CALL_PARAMS }),
      );
      expect(early.error, JSON.stringify(bad)).toEqual({
        code: -32600,
        message: "server not initialized",
      });
      expect(JSON.stringify(early)).not.toMatch(LEAK);
      // the malformed notice consumed nothing: a valid one (metadata included) now starts the session
      c.notify("notifications/initialized", { _meta: { note: "ok" } });
      const served = await c.call({});
      expect(served.isError).toBe(false);
      expect(served.text).toBe(direct);
      c.end();
      expect(await c.exit()).toBe(0);
    }
  });

  it("a malformed initialized notification touches neither the package nor the retained state", async () => {
    const served = await serveInProcess(dirs, secretFile, [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: 7 }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: CALL_PARAMS }),
    ]);
    expect(served.replies.map((r: any) => r.error?.code ?? "ok")).toEqual(["ok", -32600]);
    expect(served.campaignCalls).toEqual([]);
    expect(served.ledgerCalls).toEqual([]);
  });

  it("none of these touches the campaign: the package and the retained state are not opened, read or locked, and the normal initialized exchange then does read", async () => {
    const malformed = [
      JSON.stringify({ id: 1, method: "tools/call", params: CALL_PARAMS }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: CALL_PARAMS }),
      JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      }),
      JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: CALL_PARAMS }),
      JSON.stringify({ jsonrpc: "1.0", id: 6, method: "initialize", params: INIT }),
      JSON.stringify({ jsonrpc: "2.0", id: 1.5, method: "initialize", params: INIT }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/call", params: CALL_PARAMS }),
      JSON.stringify({ jsonrpc: "2.0", id: 8, method: "initialize", params: INIT }),
      JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/call", params: CALL_PARAMS }), // initialized but the notice is missing
      JSON.stringify({ jsonrpc: "2.0", id: 10, method: "tools/call", params: "x" }),
      "{ not json",
      "[]",
    ];
    const before = readdirSync(dirs.campaignDir).sort();
    const refused = await serveInProcess(dirs, secretFile, malformed);
    expect(refused.code).toBe(0);
    expect(refused.campaignCalls).toEqual([]);
    expect(refused.ledgerCalls).toEqual([]);
    expect(readdirSync(dirs.campaignDir).sort()).toEqual(before);
    for (const r of refused.replies) expect(JSON.stringify(r)).not.toMatch(LEAK);
    expect(refused.replies.filter((r: any) => r.result && r.id !== 8)).toEqual([]);

    // the normal, initialized exchange on the same arrangement DOES perform the trusted read
    const served = await serveInProcess(dirs, secretFile, [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: INIT }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: CALL_PARAMS }),
    ]);
    expect(served.replies).toHaveLength(2);
    expect(served.replies[1].result.content[0].text).toBe(direct);
    expect(served.replies[1].result.isError).toBeUndefined();
    expect(served.campaignCalls.length).toBeGreaterThan(0);
    expect(served.ledgerCalls.length).toBeGreaterThan(0);
  });

  it("legitimate MCP metadata is preserved: extra client capabilities and info, _meta on a call, and an older supported protocol version", async () => {
    const served = await serveInProcess(dirs, secretFile, [
      JSON.stringify({
        jsonrpc: "2.0",
        id: "init-1",
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: { roots: { listChanged: true }, sampling: {}, experimental: {} },
          clientInfo: { name: "another-client", title: "Another Client", version: "9.9.9" },
        },
      }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: "ping-1", method: "ping" }),
      JSON.stringify({ jsonrpc: "2.0", id: "list-1", method: "tools/list", params: {} }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: { ...CALL_PARAMS, _meta: { progressToken: "t" } },
      }),
    ]);
    expect(served.replies.map((r: any) => r.id)).toEqual(["init-1", "ping-1", "list-1", "call-1"]);
    expect(served.replies[0].result.protocolVersion).toBe("2024-11-05");
    expect(served.replies[2].result.tools).toHaveLength(1);
    expect(served.replies[3].result.content[0].text).toBe(direct);
  });
});
