/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw JSON-RPC replies and raw persisted records */
// The LOCAL PLAYER-VIEW MCP TRANSPORT of the existing current Active-PC Glance read, as a REAL stdio process spoken to as an MCP client would
// speak to it (BLUE v5.2 bounded brief 2026-10-15; I-001 §§3–5, 9–11; F-014D §§2, 4.1, 5, 6; F-014B §§4, 17; Runtime Contract IM-15 / IM-16 /
// RC-14). Every campaign here is built only by the shipped commands (`establish-locality`, `author-character`, `establish-character-locus`, the
// Temporal owner's establishment) and the shipped `observe-surroundings` observation. The referee host there is a SCRIPTED policy the test wrote
// that reads the DELIVERED words (PLUMBING ONLY): it proves the TRANSPORT and the trusted binding — that a stdio MCP caller receives exactly
// what the existing gateway returns over the same canon, and nothing else — and certifies NOTHING about whether any AI reads any sentence
// correctly. The finite semantic support for what the producer establishes is the retained real-host exercise
// (docs/evidence/b52-direct-observation-live-host*), neither repeated nor extended here. The fixtures assert no verdict, receipt, packet,
// presentation or Glance success as an upstream fact: the expected value is whatever the unchanged direct gateway returns over the same canon.
import { chmodSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  EventSignalPresentationSchema,
  PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  nodeFs,
} from "@immortalis/engine";
import { authorizeHost, bindHost } from "@immortalis/operator";
import { stopAtBoundaryRequest } from "@immortalis/testkit";
import { at } from "../support/gip-sunset.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { PC_ID, observationCampaign, observe, screenScene } from "../support/observation.ts";
import {
  McpClient,
  PLAYER_VIEW_HOST,
  PLAYER_VIEW_TOOL,
  SERVER_BIN,
  bindHost as bindPlayerViewHost,
  copyDirs,
  directGlance,
  playerViewDir,
  serverArgs,
  withServer,
} from "../support/player-view.ts";
import { PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { must } from "../support/temporal.ts";

// each case starts one or more real server processes (a campaign open per call); CI runs the whole suite in parallel
vi.setConfig({ testTimeout: 120_000 });

const SCRIPTED_NOTE =
  "scripted referee host: plumbing only, certifies no semantic perception (see docs/evidence/b52-direct-observation-live-host.md)";

let observed: LocalityDirs;
let unobserved: LocalityDirs;
let screened: LocalityDirs;

beforeAll(async () => {
  observed = (await observationCampaign()).dirs;
  const r = await observe(observed);
  expect(r.result.status, `${SCRIPTED_NOTE}: ${JSON.stringify(r.result.details)}`).toBe(
    "OBSERVATION_RECEIVED",
  );
  unobserved = (await observationCampaign()).dirs;
  screened = (await observationCampaign({ scene: screenScene() })).dirs;
  const s = await observe(screened);
  expect(s.result.status, JSON.stringify(s.result.details)).toBe("OBSERVATION_NOT_ESTABLISHED");
}, 240_000);

/** Every file under a directory (recursively): path -> content. */
const treeOf = (dir: string, prefix = ""): Record<string, string> =>
  Object.fromEntries(
    readdirSync(dir)
      .sort()
      .flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory()
          ? Object.entries(treeOf(full, `${prefix}${name}/`))
          : [[`${prefix}${name}`, readFileSync(full, "utf8")] as const];
      }),
  );

const bound = async (dirs: LocalityDirs) => {
  const b = await bindPlayerViewHost(dirs);
  expect(b.code, b.out.join("\n")).toBe(0);
  return b;
};

/** One tool call against a fresh server for the given arrangement. */
const readOnce = async (
  dirs: LocalityDirs,
  secretFile: string,
  over: { hostId?: string; campaignId?: string } = {},
  args: unknown = {},
) => (await withServer(serverArgs(dirs, secretFile, over), (c) => c.call(args))).value;

describe("positive: a genuine stdio MCP exchange returns exactly the existing presentation", () => {
  it("speaks MCP, exposes exactly one argument-free read-only tool, and the call equals the direct gateway byte for byte", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const c = new McpClient(serverArgs(dirs, b.secretFile));
    const init = await c.handshake();
    expect(init.result.serverInfo.name).toBe("immortalis-player-view");
    expect(init.result.capabilities).toEqual({ tools: {} });
    const listed = await c.rpc("tools/list");
    expect(listed.result.tools).toHaveLength(1);
    const tool = listed.result.tools[0];
    expect(tool.name).toBe(PLAYER_VIEW_TOOL);
    expect(tool.name).toBe(PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE);
    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: {},
      additionalProperties: false,
    });
    expect(tool.annotations.readOnlyHint).toBe(true);

    const direct = await directGlance(dirs);
    expect(JSON.parse(direct).ok).toBe(true);
    const viaMcp = await c.call({});
    expect(viaMcp.isError).toBe(false);
    expect(viaMcp.text).toBe(direct);
    // the same value whether the arguments are an empty object or absent altogether
    expect((await c.call(undefined)).text).toBe(direct);

    const parsed = JSON.parse(viaMcp.text);
    expect(EventSignalPresentationSchema.safeParse(parsed.value).success).toBe(true);
    expect(parsed.value.viewpoint).toEqual({ role: "role.player_character", entity_id: PC_ID });
    expect(parsed.value.elements).toEqual([
      { element: "CONTACT", channel: "PERCEPTION" },
      { element: "REFERENT", text: "a patch on the wall facing the character" },
      { element: "CONTENT", text: "a broad patch of bright red on pale plaster" },
    ]);
    // the host was handed nothing it could carry: no event id, owner key, basis, source, path, host id or secret
    const secret = readFileSync(b.secretFile, "utf8").trim();
    for (const text of [viaMcp.text, JSON.stringify(init), JSON.stringify(listed)]) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain(dirs.campaignDir);
      expect(text).not.toContain(dirs.operatorDir);
      expect(text).not.toMatch(
        /obs-|access\/|world\/|referee|locus_|decision|BOUNDED_SHARED|provenance|sealed|chat-host/i,
      );
    }
    c.end();
    expect(await c.exit()).toBe(0);
    // no log, prompt or standard error carries the secret or a path
    const stderr = await c.stderrText;
    expect(stderr).toBe("");
    for (const line of c.stdoutLines) expect(line).not.toContain(secret);
  });

  it("the shipped bind action is the only way a host is bound, prints the secret's PATH and never its contents, and the binding keeps only a digest", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const secret = readFileSync(b.secretFile, "utf8").trim();
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    for (const line of b.out) expect(line).not.toContain(secret);
    expect(b.out.join("\n")).toContain(b.secretFile);
    expect(statSync(b.secretFile).mode & 0o777).toBe(0o600);
    const config = join(
      playerViewDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      "config.json",
    );
    expect(statSync(config).mode & 0o777).toBe(0o600);
    const text = readFileSync(config, "utf8");
    expect(text).not.toContain(secret);
    expect(JSON.parse(text).hosts).toHaveLength(1);
    // a second bind of the same identity is refused and changes nothing
    const before = treeOf(dirs.operatorDir);
    const again = await bindPlayerViewHost(dirs);
    expect(again.code).not.toBe(0);
    expect(treeOf(dirs.operatorDir)).toEqual(before);
  });

  it("works through the shipped bind binary as a real process, end to end", async () => {
    const dirs = copyDirs(observed);
    const c = new McpClient(
      [
        "--campaign",
        dirs.campaignDir,
        "--campaign-id",
        LOCALITY_CAMPAIGN,
        "--host-id",
        PLAYER_VIEW_HOST,
        "--operator-dir",
        dirs.operatorDir,
      ],
      "packages/operator/src/player-view-bind-bin.ts",
    );
    expect(await c.exit()).toBe(0);
    const secretFile = join(
      playerViewDir({ stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      `${PLAYER_VIEW_HOST}.secret`,
    );
    const out = await readOnce(dirs, secretFile);
    expect(out.text).toBe(await directGlance(dirs));
  });
});

describe("independently falsifying negative: the same qualified campaign without an earned observation reads as nothing", () => {
  it("an opaque screen earns nothing, and a campaign never observed, each give the one opaque refusal with the error flag", async () => {
    for (const source of [screened, unobserved]) {
      const dirs = copyDirs(source);
      const b = await bound(dirs);
      const r = await readOnce(dirs, b.secretFile);
      expect(r.isError).toBe(true);
      expect(r.text).toBe(PROTOCOL_REFUSAL);
      expect(await directGlance(dirs)).toBe(PROTOCOL_REFUSAL);
      // the world fact alone (the committed premise) is never presented
      const c = await openOrdinary(dirs.campaignDir);
      expect(c.store.listFacts().filter((f) => f.key.startsWith("access/"))).toEqual([]);
      await c.close();
    }
  });
});

describe("persistence and stability: reads write nothing, a reopen reproduces only a still-current read", () => {
  it("repeated reads leave the package, the retained state and canonical time byte-identical", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const packageBefore = treeOf(dirs.campaignDir);
    const stateBefore = treeOf(dirs.operatorDir);
    const direct = await directGlance(dirs);
    const run = await withServer(serverArgs(dirs, b.secretFile), async (c) => {
      const seen: string[] = [];
      for (let i = 0; i < 4; i += 1) seen.push((await c.call({})).text);
      await c.call({ event_id: "x" });
      return seen;
    });
    for (const text of run.value) expect(text).toBe(direct);
    expect(treeOf(dirs.campaignDir)).toEqual(packageBefore);
    expect(treeOf(dirs.operatorDir)).toEqual(stateBefore);
    // the package lock was taken and released: nothing is left behind
    expect(readdirSync(dirs.campaignDir).filter((f) => /lock/i.test(f))).toEqual([]);
  });

  it("a restart of the transport after the same basis reproduces the same read", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const first = await readOnce(dirs, b.secretFile);
    const second = await readOnce(dirs, b.secretFile);
    expect(second.text).toBe(first.text);
    expect(JSON.parse(first.text).ok).toBe(true);
  });

  it("after canonical time advances the old observation does not reappear, in this process or after a reopen; a new look is its own arrival", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const c = new McpClient(serverArgs(dirs, b.secretFile));
    await c.handshake();
    expect(JSON.parse((await c.call({})).text).ok).toBe(true);
    // the Temporal owner advances time between two calls of the SAME running transport (the campaign lock is free between calls)
    const campaign = await openOrdinary(dirs.campaignDir);
    await must(
      new TemporalCoordinator(campaign.store, new StageProviderRegistry()).advance(
        stopAtBoundaryRequest("tx-after-player-view", {
          requested: { target: at(150), condition: null },
        }),
      ),
    );
    await campaign.close();
    const after = await c.call({});
    expect(after.isError).toBe(true);
    expect(after.text).toBe(PROTOCOL_REFUSAL);
    c.end();
    await c.exit();
    expect((await readOnce(dirs, b.secretFile)).text).toBe(PROTOCOL_REFUSAL);

    // a new, separately chosen observation at the new basis is then the current arrival (the shipped command; scripted host: plumbing only)
    expect((await observe(dirs)).result.status).toBe("OBSERVATION_RECEIVED");
    const renewed = await readOnce(dirs, b.secretFile);
    expect(JSON.parse(renewed.text).ok).toBe(true);
    expect(renewed.text).toBe(await directGlance(dirs));
  });

  it("a newer sealed transaction at the same basis supersedes the arrival: the transport fails closed", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    expect(JSON.parse((await readOnce(dirs, b.secretFile)).text).ok).toBe(true);
    const campaign = await openOrdinary(dirs.campaignDir);
    const advanced = await new TemporalCoordinator(
      campaign.store,
      new StageProviderRegistry(),
    ).advance(
      stopAtBoundaryRequest("tx-same-basis-player-view", {
        requested: { target: at(100), condition: null },
      }),
    );
    expect(advanced.ok).toBe(true);
    await campaign.close();
    expect((await readOnce(dirs, b.secretFile)).text).toBe(PROTOCOL_REFUSAL);
  });
});

describe("authentication and binding: a hostile or unbound caller fails before any field is disclosed", () => {
  it("a wrong, foreign, reused, malformed or absent secret, a wrong host and a wrong campaign identity are the one opaque refusal", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const other = await bindPlayerViewHost(dirs, "chat-host-2");
    expect(other.code).toBe(0);

    // the OTHER host's genuine secret, presented as this host's: not authorized
    expect((await readOnce(dirs, other.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    // an unbound host identity holding a real secret file
    expect((await readOnce(dirs, b.secretFile, { hostId: "never-bound" })).text).toBe(
      PROTOCOL_REFUSAL,
    );
    // a syntactically valid but wrong secret
    const wrong = join(dirs.operatorDir, "wrong.secret");
    writeFileSync(wrong, `${"ab".repeat(32)}\n`, { mode: 0o600 });
    chmodSync(wrong, 0o600);
    expect((await readOnce(dirs, wrong)).text).toBe(PROTOCOL_REFUSAL);
    // the same genuine host and secret against another campaign identity
    expect((await readOnce(dirs, b.secretFile, { campaignId: "campaign-other" })).text).toBe(
      PROTOCOL_REFUSAL,
    );
    // the genuine arrangement still reads
    expect(JSON.parse((await readOnce(dirs, b.secretFile)).text).ok).toBe(true);
  });

  it("a malformed, unreadable, symlinked, over-permissive or oversized secret file stops the server before any call", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const secret = readFileSync(b.secretFile, "utf8").trim();
    const bad = {
      malformed: ["not-a-secret\n", 0o600],
      short: [`${secret.slice(0, 63)}\n`, 0o600],
      "group-readable": [`${secret}\n`, 0o640],
      oversized: [`${secret}\n${"x".repeat(400)}`, 0o600],
    } as const;
    for (const [name, [text, mode]] of Object.entries(bad)) {
      const file = join(dirs.operatorDir, `${name}.secret`);
      writeFileSync(file, text);
      chmodSync(file, mode);
      const c = new McpClient(serverArgs(dirs, file));
      expect(await c.exit(), name).toBe(64);
      expect(await c.stderrText, name).toContain("usage:");
      expect(await c.stderrText, name).not.toContain(secret);
    }
    const missing = new McpClient(serverArgs(dirs, join(dirs.operatorDir, "absent.secret")));
    expect(await missing.exit()).toBe(64);
    // a repeated, unknown or valueless flag is a usage error as well
    const dup = new McpClient([...serverArgs(dirs, b.secretFile), "--host-id", "again"]);
    expect(await dup.exit()).toBe(64);
    const unknown = new McpClient([...serverArgs(dirs, b.secretFile), "--role", "role.archivist"]);
    expect(await unknown.exit()).toBe(64);
  });

  it("the referee host's secret opens nothing here, and a player-view secret opens nothing at the referee exchange: two distinct authority surfaces", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const refereeBind = await bindHost({
      stateDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: PLAYER_VIEW_HOST,
      operations: ["F014D_DIRECT_PERCEPTION"],
    });
    expect(refereeBind.ok).toBe(true);
    if (!refereeBind.ok) return;
    // the referee host bears the SAME host identity but its own secret: refused here
    const asReferee = await readOnce(dirs, refereeBind.value.secret_file);
    expect(asReferee.isError).toBe(true);
    expect(asReferee.text).toBe(PROTOCOL_REFUSAL);
    // and the player-view secret is not a referee credential
    const secret = readFileSync(b.secretFile, "utf8").trim();
    const refereeAuth = await authorizeHost(
      { stateDir: dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN, operatorUid: process.getuid!() },
      PLAYER_VIEW_HOST,
      secret,
      "F014D_DIRECT_PERCEPTION",
    );
    expect(refereeAuth.ok).toBe(false);
    // the referee's tool server exposes no player read
    const referee = new McpClient(
      [
        "--operator-dir",
        dirs.operatorDir,
        "--campaign-id",
        LOCALITY_CAMPAIGN,
        "--host-id",
        PLAYER_VIEW_HOST,
        "--secret-file",
        refereeBind.value.secret_file,
      ],
      "packages/operator/src/referee-bin.ts",
    );
    await referee.handshake();
    const tools = (await referee.rpc("tools/list")).result.tools.map((t: any) => t.name);
    expect(tools).toEqual(["referee_list_tasks", "referee_get_task", "referee_submit_decision"]);
    referee.end();
    await referee.exit();
  });

  it("a tampered binding is the opaque refusal: another operator, another campaign, another character or a corrupt file", async () => {
    const base = copyDirs(observed);
    const b0 = await bound(base);
    const configPath = join(
      playerViewDir({ stateDir: base.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      "config.json",
    );
    const original = JSON.parse(readFileSync(configPath, "utf8"));
    const variants: Record<string, (c: any) => void> = {
      "another operating-system user": (c) => (c.operator_uid += 1),
      "another campaign": (c) => (c.campaign_id = "campaign-other"),
      "another character": (c) => (c.hosts[0].pc_id = "pc-someone-else"),
      "an extra field": (c) => (c.role = "role.player_character"),
      "a wrong format": (c) => (c.format = "immortalis-operator-referee-config"),
    };
    for (const [name, mutate] of Object.entries(variants)) {
      const doc = structuredClone(original);
      mutate(doc);
      writeFileSync(configPath, JSON.stringify(doc));
      expect((await readOnce(base, b0.secretFile)).text, name).toBe(PROTOCOL_REFUSAL);
    }
    writeFileSync(configPath, "{ not json");
    expect((await readOnce(base, b0.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    writeFileSync(configPath, JSON.stringify(original));
    expect(JSON.parse((await readOnce(base, b0.secretFile)).text).ok).toBe(true);
  });

  it("the character the host is bound to, the operator's kept character and the canonical active PC must agree, and an absent keep is refused", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    // remove the operator's retained keep: the authorized view can no longer be proved, so nothing is read
    const keep = readdirSync(dirs.operatorDir).find((f) => f.startsWith("character-keep-"))!;
    const keepPath = join(dirs.operatorDir, keep);
    const keepText = readFileSync(keepPath, "utf8");
    writeFileSync(keepPath, JSON.stringify({ ...JSON.parse(keepText), pc_id: "pc-someone-else" }));
    expect((await readOnce(dirs, b.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    writeFileSync(keepPath, keepText);
    expect(JSON.parse((await readOnce(dirs, b.secretFile)).text).ok).toBe(true);
    // a campaign whose character was never bound/placed cannot be bound to a host at all
    const bare = copyDirs(observed);
    const bareKeep = readdirSync(bare.operatorDir).find((f) => f.startsWith("character-keep-"))!;
    writeFileSync(join(bare.operatorDir, bareKeep), "{}");
    const refused = await bindPlayerViewHost(bare);
    expect(refused.code).not.toBe(0);
    expect(readdirSync(bare.operatorDir).some((f) => f.startsWith("player-view-"))).toBe(false);
  });

  it("the operating-system boundary: a package others can write, or a retained-state directory others can open, is not served", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    chmodSync(dirs.campaignDir, 0o775);
    expect((await readOnce(dirs, b.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    chmodSync(dirs.campaignDir, 0o755);
    chmodSync(dirs.operatorDir, 0o750);
    expect((await readOnce(dirs, b.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    chmodSync(dirs.operatorDir, 0o700);
    expect(JSON.parse((await readOnce(dirs, b.secretFile)).text).ok).toBe(true);
  });
});

describe("fail closed: an active writer, an interrupted or unreconciled package and an I/O error are never repaired to force a read", () => {
  it("a campaign opened elsewhere (a writer is active) reads as the opaque refusal, and reads again once released", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const writer = await CanonicalCampaign.open(dirs.campaignDir, { buildId: "writer-test" });
    expect(writer.ok).toBe(true);
    if (!writer.ok) return;
    try {
      const during = await readOnce(dirs, b.secretFile);
      expect(during.isError).toBe(true);
      expect(during.text).toBe(PROTOCOL_REFUSAL);
    } finally {
      await writer.value.close();
    }
    expect(JSON.parse((await readOnce(dirs, b.secretFile)).text).ok).toBe(true);
  });

  it("an uncommitted journal tail or a stray file is refused and left exactly as found", async () => {
    for (const damage of ["tail", "stray"] as const) {
      const dirs = copyDirs(observed);
      const b = await bound(dirs);
      if (damage === "tail")
        writeFileSync(join(dirs.campaignDir, "journal.jsonl"), '{"uncommitted":true}\n', {
          flag: "a",
        });
      else writeFileSync(join(dirs.campaignDir, "notes.txt"), "left behind");
      const before = treeOf(dirs.campaignDir);
      const r = await readOnce(dirs, b.secretFile);
      expect(r.isError, damage).toBe(true);
      expect(r.text, damage).toBe(PROTOCOL_REFUSAL);
      expect(treeOf(dirs.campaignDir), damage).toEqual(before);
    }
  });

  it("a stale package lock left by a dead process is never taken over by a read", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const first = readdirSync(dirs.campaignDir).length;
    writeFileSync(
      join(dirs.campaignDir, "LOCK"),
      JSON.stringify({ campaign_id: LOCALITY_CAMPAIGN, pid: 2 ** 22 - 1, nonce: "x" }),
    );
    const before = treeOf(dirs.campaignDir);
    const r = await readOnce(dirs, b.secretFile);
    expect(r.text).toBe(PROTOCOL_REFUSAL);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
    expect(readdirSync(dirs.campaignDir).length).toBe(first + 1);
  });

  it("a tampered journal or manifest never opens, and an unreadable retained-state file is refused", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const manifest = join(dirs.campaignDir, "manifest.json");
    const text = readFileSync(manifest, "utf8");
    writeFileSync(manifest, text.replace(LOCALITY_CAMPAIGN, "campaign-forged"));
    expect((await readOnce(dirs, b.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    writeFileSync(manifest, text);
    expect(JSON.parse((await readOnce(dirs, b.secretFile)).text).ok).toBe(true);
  });

  it("an I/O error while reading the retained state or the package is the opaque refusal, with nothing written", async () => {
    const { readPlayerViewGlance } = await import("../../packages/operator/src/player-view.ts");
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const secret = readFileSync(b.secretFile, "utf8").trim();
    const params = {
      campaignDir: dirs.campaignDir,
      campaignId: LOCALITY_CAMPAIGN,
      stateDir: dirs.operatorDir,
      hostId: PLAYER_VIEW_HOST,
      secret,
    };
    const request = { operation: "read_current_observation_glance" };
    const ok = JSON.stringify(await readPlayerViewGlance(params, request));
    expect(JSON.parse(ok).ok).toBe(true);
    // the fault hits the data being read (the journal and the retained records), not the lock's own bookkeeping
    const throwing = {
      ...nodeFs,
      readFile: (path: string) =>
        /journal\.jsonl$|\.json$/.test(path)
          ? Promise.reject(new Error("EIO"))
          : nodeFs.readFile(path),
    };
    const before = treeOf(dirs.campaignDir);
    expect(
      JSON.stringify(await readPlayerViewGlance({ ...params, ledgerFs: throwing }, request)),
    ).toBe(PROTOCOL_REFUSAL);
    expect(
      JSON.stringify(await readPlayerViewGlance({ ...params, campaignFs: throwing }, request)),
    ).toBe(PROTOCOL_REFUSAL);
    expect(treeOf(dirs.campaignDir)).toEqual(before);
  });
});

describe("a malformed or over-claiming host request is refused and never honoured", () => {
  it("any argument at all — event, campaign, character, basis, time, role, permission, source, packet — is the opaque refusal while the empty call serves", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const direct = await directGlance(dirs);
    await withServer(serverArgs(dirs, b.secretFile), async (c) => {
      expect((await c.call({})).text).toBe(direct);
      const claims: unknown[] = [
        { operation: "read_current_observation_glance" },
        { operation: "listFacts" },
        { event_id: "obs-1" },
        { campaign_id: "campaign-other" },
        { recipient_id: "pc-other" },
        { pc_id: PC_ID },
        { at: 100 },
        { time: { unit: "x", value: 1 } },
        { basis: "direct-perception-observation" },
        { role: "role.archivist" },
        { permission: "permission.canon.write" },
        { available: true },
        { receipt: true },
        { packet: {} },
        { source: "world/x/profile" },
        { context: {} },
        { view: {} },
        { host_id: "other-host" },
        { secret: "ab".repeat(32) },
        { limit: 1 },
        [],
        ["read_current_observation_glance"],
        "read_current_observation_glance",
        42,
        null,
        true,
      ];
      for (const claim of claims) {
        const r = await c.call(claim);
        expect(r.isError, JSON.stringify(claim)).toBe(true);
        expect(r.text, JSON.stringify(claim)).toBe(PROTOCOL_REFUSAL);
      }
      expect((await c.call({})).text).toBe(direct);
    });
  });

  it("a name other than the one tool, a malformed envelope and an unknown method disclose and read nothing", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    await withServer(serverArgs(dirs, b.secretFile), async (c) => {
      for (const name of [
        "referee_list_tasks",
        "run_shell",
        "list_facts",
        "READ_CURRENT_OBSERVATION_GLANCE",
        "read_current_event_signal_presentation",
        "deliver_causal_event_signal_presentation",
        "",
      ]) {
        const msg = await c.rpc("tools/call", { name, arguments: {} });
        expect(msg.error?.code, name).toBe(-32602);
        expect(msg.result, name).toBeUndefined();
      }
      expect((await c.rpc("tools/call", {})).error.code).toBe(-32602);
      expect((await c.rpc("resources/list")).error.code).toBe(-32601);
      expect((await c.rpc("no/such/method")).error.code).toBe(-32601);
      expect((await c.raw("{ not json")).error.code).toBe(-32700);
      expect((await c.raw("[]")).error.code).toBe(-32600);
      expect((await c.raw("null")).error.code).toBe(-32600);
      expect((await c.raw(JSON.stringify({ jsonrpc: "2.0", id: 1 }))).error.code).toBe(-32600);
      expect(
        (await c.raw(JSON.stringify({ jsonrpc: "2.0", id: {}, method: "ping" }))).error.code,
      ).toBe(-32600);
      expect((await c.raw("x".repeat(70_000))).error.code).toBe(-32600);
      expect((await c.rpc("ping")).result).toEqual({});
    });
  });
});

describe("isolation: each transport reads only its own campaign, whatever the identities look like", () => {
  it("an observation in one campaign is invisible to another with identical character and world identities, and cross-wiring is refused", async () => {
    const a = copyDirs(observed);
    const b = copyDirs(unobserved);
    const ba = await bound(a);
    const bb = await bound(b);
    expect(JSON.parse((await readOnce(a, ba.secretFile)).text).ok).toBe(true);
    expect((await readOnce(b, bb.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    // A's secret and retained state pointed at B's package, and the reverse
    const crossed: LocalityDirs = { campaignDir: b.campaignDir, operatorDir: a.operatorDir };
    expect((await readOnce(crossed, ba.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    const crossed2: LocalityDirs = { campaignDir: a.campaignDir, operatorDir: b.operatorDir };
    expect((await readOnce(crossed2, bb.secretFile)).text).toBe(PROTOCOL_REFUSAL);
    // B's secret against A's package with B's retained state
    expect((await readOnce(crossed2, ba.secretFile)).text).toBe(PROTOCOL_REFUSAL);
  });
});

describe("the server holds no authority of its own: it never opens the package at start, and a started server survives a campaign that vanishes", () => {
  it("starting the server reads nothing of the campaign; the package is first touched by a call", async () => {
    const dirs = copyDirs(observed);
    const b = await bound(dirs);
    const c = new McpClient(serverArgs(dirs, b.secretFile));
    await c.handshake();
    // moving the package away after start: the call is the opaque refusal, never a crash and never a stale read
    const direct = await directGlance(dirs);
    expect((await c.call({})).text).toBe(direct);
    const moved = `${dirs.campaignDir}.moved`;
    const { renameSync } = await import("node:fs");
    renameSync(dirs.campaignDir, moved);
    expect((await c.call({})).text).toBe(PROTOCOL_REFUSAL);
    renameSync(moved, dirs.campaignDir);
    expect((await c.call({})).text).toBe(direct);
    c.end();
    expect(await c.exit()).toBe(0);
  });
});

// keep the server path referenced for the process-level checks above
void SERVER_BIN;
