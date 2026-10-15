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
    for (const f of allOperatorFiles.filter((x) => !NEW_FILES.includes(x)))
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

  it("a caller that never completes the handshake, or sends calls out of order, still receives nothing but protocol replies", async () => {
    const source = (await observationCampaign()).dirs;
    expect((await observe(source)).result.status).toBe("OBSERVATION_RECEIVED");
    const dirs = copyDirs(source);
    const b = await bindHost(dirs);
    // a tool call before any initialize is served by the same rules: authorization is per call, never per session
    const c = new McpClient(serverArgs(dirs, b.secretFile));
    const direct = await directGlance(dirs);
    expect((await c.call({})).text).toBe(direct);
    c.end();
    expect(await c.exit()).toBe(0);
    // and a caller that is not bound gets the refusal, never the presentation, however it frames the call
    const stranger = new McpClient(serverArgs(dirs, b.secretFile, { hostId: "stranger" }));
    const r = await stranger.call({});
    expect(r.isError).toBe(true);
    expect(r.text).toBe(PROTOCOL_REFUSAL);
    stranger.end();
    await stranger.exit();
  });
});
