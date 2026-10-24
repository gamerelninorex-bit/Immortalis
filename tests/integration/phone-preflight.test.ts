/* eslint-disable @typescript-eslint/no-explicit-any -- tests read untyped owner facts and finding lists */
// The ordinary-chat route's OPERATOR PREFLIGHT (apps/phone/src/preflight.ts, scenario.ts, `main.ts preflight`).
//
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. The campaign is a separate one built by the shipped paths; the scripted host stands in for a
// referee (PLUMBING ONLY: not an AI, not a game master's judgment); nothing here is a real player's choice or a live witness. What it proves:
// every configuration defect that used to surface only as a cause-free refusal in the middle of play is named for the OPERATOR before a long
// setup, nothing is written to the campaign, a busy campaign is never a pass, and nothing of it is reachable by the player or the assistant.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  statSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { bindHost } from "@immortalis/operator";
import { runPlayerViewBindCli } from "../../packages/operator/src/player-view-mcp.ts";
import {
  playerViewSecretPath,
  playerViewDir,
} from "../../packages/operator/src/player-view-exchange.ts";
import { loadConfig, type PhoneConfig } from "../../apps/phone/src/config.ts";
import { PLAYER_COMMANDS } from "../../apps/phone/src/commands.ts";
import { preflightA, preflightB, type Finding } from "../../apps/phone/src/preflight.ts";
import { checkScenarioFile, SCENARIO_KEYS } from "../../apps/phone/src/scenario.ts";
import { prepareChat } from "../../apps/phone/src/prepare-chat.ts";
import { PLAYER, REFEREE, chatConfig } from "../support/chat-client.ts";
import {
  LOCALITY_CAMPAIGN,
  SOURCE_KEY,
  SOURCE_UNIT,
  WORLD_ID,
  openOrdinary,
} from "../support/locality.ts";
import {
  PC_ID,
  PC_WORDS,
  observationAnswer,
  observe,
  verbConsole,
} from "../support/observation.ts";
import { HOST_ID, plainPolicy } from "../support/original-pc.ts";
import { SALT, originalCollectionCampaign } from "../support/pc-collection-original.ts";
import { tempDir } from "../support/tmp.ts";

const SCENARIO = {
  player_character: PC_ID,
  world: WORLD_ID,
  source: SOURCE_KEY,
  reserve: SALT.reserve,
  quantity_unit: SOURCE_UNIT,
  mechanism: SALT.mechanism,
  basis: SALT.basis,
};
const VIEW_HOST = "glance-host";
const COLLECTION_HOST = "gm-collection";

describe("explicit operator chat preparation", () => {
  it("installs a private canon-checked scenario and the configured view, is repeatable, and preserves canon", async () => {
    const r = await rig();
    const input = join(dirname(r.scenarioFile), "input.json");
    writeScenario(input, SCENARIO);
    rmSync(r.scenarioFile);
    const before = await snapshot(r.dirs.campaignDir);
    expect(await prepareChat(r.config, input)).toMatchObject({ ok: true });
    expect(JSON.parse(readFileSync(r.scenarioFile, "utf8"))).toEqual(SCENARIO);
    expect(statSync(r.scenarioFile).mode & 0o777).toBe(0o600);
    expect(await prepareChat(r.config, input)).toMatchObject({ ok: true });
    expect(await snapshot(r.dirs.campaignDir)).toEqual(before);
    expect((await preflightB(r.config)).ok).toBe(true);
    expect((await prepareChat({ ...r.config, playerViewHostId: null }, input)).ok).toBe(false);
    expect((await prepareChat({ ...r.config, campaignId: "foreign-campaign" }, input)).ok).toBe(
      false,
    );
    writeScenario(input, { ...SCENARIO, player_character: "foreign-pc" });
    expect((await prepareChat(r.config, input)).ok).toBe(false);
    expect(JSON.parse(readFileSync(r.scenarioFile, "utf8"))).toEqual(SCENARIO);
    chmodSync(input, 0o666);
    expect((await prepareChat(r.config, input)).ok).toBe(false);
  });
});

interface Rig {
  readonly dirs: { campaignDir: string; operatorDir: string };
  readonly config: PhoneConfig;
  readonly scenarioFile: string;
}

const writeScenario = (file: string, v: unknown, mode = 0o600) => {
  writeFileSync(file, typeof v === "string" ? v : JSON.stringify(v), { mode });
  chmodSync(file, mode);
};

/** a separate collection campaign, the referee hosts bound by the shipped binder, and a config whose scenario names it */
async function rig(over: Partial<PhoneConfig> = {}, bindCollectionHost = true): Promise<Rig> {
  const { dirs } = await originalCollectionCampaign();
  const dir = tempDir("immortalis-preflight-");
  const scenarioFile = join(dir, "chat-scenario.json");
  writeScenario(scenarioFile, SCENARIO);
  if (bindCollectionHost) {
    const bound = await bindHost({
      stateDir: dirs.operatorDir,
      campaignId: LOCALITY_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: COLLECTION_HOST,
      operations: ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"],
    });
    if (!bound.ok) throw new Error(`host not bound: ${bound.error.code}`);
  }
  const config = await chatConfig({
    campaignDir: dirs.campaignDir,
    operatorDir: dirs.operatorDir,
    campaignId: LOCALITY_CAMPAIGN,
    refereeHostIds: [HOST_ID, COLLECTION_HOST],
    scenarioFile,
    setupDir: join(dir, "setup"),
    playerViewHostId: VIEW_HOST,
    ...over,
  });
  return { dirs, config, scenarioFile };
}

const bindView = (r: Rig) =>
  runPlayerViewBindCli(
    [
      "--campaign",
      r.dirs.campaignDir,
      "--campaign-id",
      LOCALITY_CAMPAIGN,
      "--host-id",
      VIEW_HOST,
      "--operator-dir",
      r.dirs.operatorDir,
    ],
    { out: () => undefined, error: () => undefined },
  );

const by = (fs: readonly Finding[], id: string) => fs.filter((f) => f.id === id);
const sev = (fs: readonly Finding[], id: string) => by(fs, id).map((f) => f.severity);
const text = (fs: readonly Finding[]) => fs.map((f) => `${f.id} ${f.message}`).join("\n");

/** every fact of the campaign with its version: preflight must leave all of it exactly as it found it */
const snapshot = async (campaignDir: string) => {
  const c = await openOrdinary(campaignDir);
  try {
    return c.store.listFacts().map((f) => `${f.key}@${f.version}`);
  } finally {
    await c.close();
  }
};

describe("MECHANISM: phase A names every configuration defect in words, before any setup", () => {
  let r: Rig;
  beforeAll(async () => {
    r = await rig();
  }, 180_000);

  it("is silent about chat when the route is off, and clear when it is on and well configured", async () => {
    const off = await preflightA({ ...r.config, publicUrl: null });
    expect(off.ok).toBe(true);
    expect(sev(off.findings, "A3")).toEqual(["SKIP"]);
    const on = await preflightA(r.config);
    expect(on.ok, text(on.findings)).toBe(true);
    expect(sev(on.findings, "A4")).toEqual(["PASS"]);
    expect(sev(on.findings, "A5")).toEqual(["PASS"]);
  });

  it("names each defect of the scenario file (missing, a link, not JSON, not an object, a missing key, an offered-nowhere key, a value the engine would refuse, a writable file, an oversized file)", async () => {
    const dir = tempDir("immortalis-preflight-scenario-");
    const f = join(dir, "s.json");
    const cases: [string, () => void, RegExp][] = [
      ["missing", () => rmSync(f, { force: true }), /scenario file does not exist/],
      [
        "symbolic link",
        () => {
          rmSync(f, { force: true });
          writeScenario(join(dir, "real.json"), SCENARIO);
          symlinkSync(join(dir, "real.json"), f);
        },
        /symbolic link/,
      ],
      ["not JSON", () => writeScenario(f, "{ nope"), /not valid JSON/],
      ["not an object", () => writeScenario(f, "[1]"), /not a JSON object/],
      [
        "missing key",
        () => {
          const rest: Record<string, string> = { ...SCENARIO };
          delete rest["basis"];
          writeScenario(f, rest);
        },
        /lacks: basis/,
      ],
      [
        "extra key",
        () => writeScenario(f, { ...SCENARIO, host: "x" }),
        /keys that are not offered: host/,
      ],
      [
        "leading dot",
        () => writeScenario(f, { ...SCENARIO, world: ".world" }),
        /value for world is not a valid identity/,
      ],
      [
        "bad unit",
        () => writeScenario(f, { ...SCENARIO, quantity_unit: "bad/unit" }),
        /value for quantity_unit is not a valid unit/,
      ],
      [
        "not text",
        () => writeScenario(f, { ...SCENARIO, source: 4 }),
        /value for source is not text/,
      ],
      [
        "group/other writable",
        () => writeScenario(f, SCENARIO, 0o666),
        /writable by its group or by others \(mode 666\)/,
      ],
      [
        "oversized",
        () => writeScenario(f, JSON.stringify({ ...SCENARIO, pad: "x".repeat(5000) })),
        /larger than 4096 bytes/,
      ],
    ];
    for (const [name, make, expected] of cases) {
      rmSync(f, { force: true });
      make();
      const strict = checkScenarioFile(f, { strict: true });
      expect(strict.ok, name).toBe(false);
      expect((strict as { defect: string }).defect, name).toMatch(expected);
      const report = await preflightA({ ...r.config, scenarioFile: f });
      expect(report.ok, name).toBe(false);
      expect(sev(report.findings, "A4"), name).toEqual(["FAIL"]);
      expect(text(report.findings), name).toMatch(expected);
    }
    // the running service reads the same file as before: owner and mode are the preflight's demand, not a new runtime refusal
    rmSync(f, { force: true });
    writeScenario(f, SCENARIO, 0o666);
    expect(checkScenarioFile(f).ok).toBe(true);
    expect(SCENARIO_KEYS).toHaveLength(7);
  });

  it("names the unset player-view host as the reason every Glance read refuses, and a loose scenario's owner", async () => {
    const report = await preflightA({ ...r.config, playerViewHostId: null });
    expect(report.ok).toBe(false);
    expect(sev(report.findings, "A5")).toEqual(["FAIL"]);
    expect(text(report.findings)).toMatch(/IMMORTALIS_PLAYER_VIEW_HOST_ID is not set/);
    expect(text(report.findings)).toMatch(/looks exactly like a non-receipt/);
    const foreign = await preflightA(r.config, { uid: (process.getuid!() + 1) % 65534 });
    expect(foreign.ok).toBe(false);
    expect(text(by(foreign.findings, "A4"))).toMatch(
      /the scenario file is not owned by the user that runs the service/,
    );
    expect(text(by(foreign.findings, "A1"))).toMatch(/operator directory is not owned/);
  });

  it("can probe the public origin: an unauthenticated /mcp must answer 401; 421 means the origin and the host disagree; an unreachable origin fails", async () => {
    const answer = (status: number) => (async () => new Response("{}", { status })) as typeof fetch;
    const ok = await preflightA(r.config, { probe: true, fetch: answer(401) });
    expect(sev(ok.findings, "A6")).toEqual(["PASS"]);
    const mismatch = await preflightA(r.config, { probe: true, fetch: answer(421) });
    expect(sev(mismatch.findings, "A6")).toEqual(["FAIL"]);
    expect(text(mismatch.findings)).toMatch(/421.*does not match/);
    const open = await preflightA(r.config, { probe: true, fetch: answer(200) });
    expect(text(open.findings)).toMatch(
      /answered 200; an unauthenticated call must be answered 401/,
    );
    const down = await preflightA(r.config, {
      probe: true,
      fetch: (async () => {
        throw new Error("down");
      }) as typeof fetch,
    });
    expect(text(down.findings)).toMatch(/could not be reached/);
    expect((await preflightA(r.config)).findings.some((f) => f.id === "A6")).toBe(false); // no network unless asked
  });

  it("the service refuses a host identity the exchanges would reject (it would bind nowhere, and every read would refuse)", () => {
    const env = {
      IMMORTALIS_CAMPAIGN_DIR: "/data/campaign",
      IMMORTALIS_CAMPAIGN_ID: "campaign-test",
      IMMORTALIS_OPERATOR_DIR: "/data/operator",
      IMMORTALIS_PLAYER_TOKEN: PLAYER,
      IMMORTALIS_REFEREE_TOKEN: REFEREE,
      IMMORTALIS_REFEREE_HOST_IDS: "gm-setup,gm-collection",
    };
    expect(loadConfig({ ...env, IMMORTALIS_PLAYER_VIEW_HOST_ID: "glance-host" }).ok).toBe(true);
    for (const bad of ["view:host", "-glance", ".glance", "a".repeat(65)]) {
      const c = loadConfig({ ...env, IMMORTALIS_PLAYER_VIEW_HOST_ID: bad });
      expect(c.ok, bad).toBe(false);
      expect(JSON.stringify((c as any).problems), bad).toMatch(/PLAYER_VIEW_HOST_ID/);
    }
    for (const bad of ["gm:setup", "-gm", ".gm"]) {
      const c = loadConfig({ ...env, IMMORTALIS_REFEREE_HOST_IDS: `gm-ok,${bad}` });
      expect(c.ok, bad).toBe(false);
      expect(JSON.stringify((c as any).problems), bad).toMatch(/referee host identity/);
    }
  });
});

describe("MECHANISM: phase B checks the campaign read-only and names the failing identity", () => {
  let r: Rig;
  beforeAll(async () => {
    r = await rig();
  }, 180_000);

  it("a correctly set up campaign passes every identity, the referee coverage and (once bound) the player-view host, and writes nothing", async () => {
    const before = await snapshot(r.dirs.campaignDir);
    const unbound = await preflightB(r.config);
    expect(unbound.ok, text(unbound.findings)).toBe(true);
    for (const id of [
      "B0",
      ...Array.from({ length: 12 }, (_, i) => `B${i + 1}`),
      "B13",
      "B14",
      "B15",
    ])
      expect(sev(unbound.findings, id), id).toEqual(["PASS"]);
    expect(text(by(unbound.findings, "B16"))).toMatch(/not bound yet; the first read binds it/);
    expect(await bindView(r)).toBe(0);
    const bound = await preflightB(r.config);
    expect(bound.ok, text(bound.findings)).toBe(true);
    expect(sev(bound.findings, "B16")).toEqual(["PASS"]);
    expect(sev(bound.findings, "B17")).toEqual(["PASS"]);
    expect(text(by(bound.findings, "B16"))).toMatch(/bound to the scenario character/);
    expect(await snapshot(r.dirs.campaignDir)).toEqual(before); // read-only: every fact, at its version, as it was
    // nothing it prints is a secret
    const all = text([...unbound.findings, ...bound.findings]);
    expect(all).not.toContain(PLAYER);
    expect(all).not.toContain(REFEREE);
    expect(all).not.toMatch(/[0-9a-f]{64}/);
  }, 120_000);

  it("each of the seven scenario identities, wrong, is named by its key and fails the preflight", async () => {
    const wrong: [keyof typeof SCENARIO, string, RegExp][] = [
      ["player_character", `${PC_ID}-x`, /player_character .*no existence contract/],
      ["world", `${WORLD_ID}-x`, /world .*no world profile/],
      ["source", `${SOURCE_KEY}-x`, /source .*no Source Condition/],
      ["reserve", `${SALT.reserve}-x`, /reserve .*no Production Reserve/],
      ["quantity_unit", "bale", /quantity_unit bale is not the unit of source/],
      ["mechanism", `${SALT.mechanism}-x`, /mechanism .*not committed for/],
      ["basis", `${SALT.basis}-x`, /basis .*no extraction basis/],
    ];
    for (const [key, value, expected] of wrong) {
      writeScenario(r.scenarioFile, { ...SCENARIO, [key]: value });
      const report = await preflightB(r.config);
      expect(report.ok, key).toBe(false);
      expect(
        report.findings
          .filter((f) => f.severity === "FAIL")
          .map((f) => f.message)
          .join("\n"),
        key,
      ).toMatch(expected);
    }
    writeScenario(r.scenarioFile, SCENARIO);
    expect((await preflightB(r.config)).ok).toBe(true);
  }, 120_000);

  it("an unreadable scenario, an unopenable campaign and a held writer lock each stop it: the lock is BUSY, never a pass", async () => {
    writeScenario(r.scenarioFile, "{ nope");
    const noScenario = await preflightB(r.config);
    expect(noScenario.ok).toBe(false);
    expect(text(noScenario.findings)).toMatch(
      /the scenario cannot be read, so no identity can be checked/,
    );
    writeScenario(r.scenarioFile, SCENARIO);

    const missing = await preflightB({
      ...r.config,
      campaignDir: join(r.config.campaignDir, "nowhere"),
    });
    expect(sev(missing.findings, "B0")).toEqual(["FAIL"]);
    expect(text(missing.findings)).toMatch(/the campaign did not open/);

    const held = await openOrdinary(r.dirs.campaignDir); // a running command holds the campaign's single-writer lock
    try {
      const busy = await preflightB(r.config);
      expect(busy.ok).toBe(false);
      expect(sev(busy.findings, "B0")).toEqual(["BUSY"]);
      expect(busy.findings).toHaveLength(1); // nothing else was claimed
    } finally {
      await held.close();
    }
    expect((await preflightB(r.config)).ok).toBe(true);
  }, 120_000);

  it("names a referee host that is listed but unbound, and the readings no listed host is bound for", async () => {
    const ghost = await preflightB({
      ...r.config,
      refereeHostIds: [HOST_ID, COLLECTION_HOST, "ghost-host"],
    });
    expect(ghost.ok).toBe(false);
    expect(text(by(ghost.findings, "B13"))).toMatch(
      /listed in the environment but not bound: ghost-host/,
    );
    const noCollection = await preflightB({ ...r.config, refereeHostIds: [HOST_ID] });
    expect(noCollection.ok).toBe(false);
    expect(text(by(noCollection.findings, "B14"))).toMatch(
      /PC_COLLECTION_CYCLE, PC_COLLECTION_REACH .*would stay pending/,
    );
    const fresh = await rig({}, false);
    const noCollectionHost = await preflightB(fresh.config);
    expect(sev(noCollectionHost.findings, "B14")).toEqual(["FAIL"]);
    expect(sev(noCollectionHost.findings, "B13")).toEqual(["FAIL"]); // the listed collection host is not bound at all
  }, 180_000);

  it("names a player-view host that is bound to another character, or whose secret file is gone, loose or does not match", async () => {
    const v = await rig();
    expect(await bindView(v)).toBe(0);
    expect((await preflightB(v.config)).ok).toBe(true);
    const secret = playerViewSecretPath(
      { stateDir: v.dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN },
      VIEW_HOST,
    );
    const original = readFileSync(secret, "utf8");
    // loose
    chmodSync(secret, 0o644);
    expect(text((await preflightB(v.config)).findings)).toMatch(
      /secret file is missing, readable by others or does not match/,
    );
    chmodSync(secret, 0o600);
    // not the bound secret
    writeFileSync(secret, "f".repeat(64), { mode: 0o600 });
    expect(sev((await preflightB(v.config)).findings, "B17")).toEqual(["FAIL"]);
    // gone: the binding stays, a rebind is refused, so every read would refuse
    rmSync(secret);
    const gone = await preflightB(v.config);
    expect(sev(gone.findings, "B17")).toEqual(["FAIL"]);
    expect(text(gone.findings)).toMatch(/a rebind is refused, so every read would be refused/);
    writeFileSync(secret, original, { mode: 0o600 });
    expect((await preflightB(v.config)).ok).toBe(true);
    // bound to another character
    const cfgFile = join(
      playerViewDir({ stateDir: v.dirs.operatorDir, campaignId: LOCALITY_CAMPAIGN }),
      "config.json",
    );
    const cfg = JSON.parse(readFileSync(cfgFile, "utf8"));
    cfg.hosts[0].pc_id = "pc-someone-else";
    writeFileSync(cfgFile, JSON.stringify(cfg), { mode: 0o600 });
    const other = await preflightB(v.config);
    expect(other.ok).toBe(false);
    expect(text(by(other.findings, "B16"))).toMatch(/bound to pc-someone-else, not to /);
    expect(readdirSync(v.dirs.operatorDir).length).toBeGreaterThan(0);
  }, 180_000);
});

describe("MECHANISM: the dry run shows what the referee would be shown, never what it concluded", () => {
  it("reports the structure by default, the words only on request, and a retained reading only as the fact that one exists", async () => {
    const r = await rig();
    const first = await preflightB(r.config);
    expect(text(by(first.findings, "B18"))).toMatch(/no reading is retained for it yet/);
    expect(text(by(first.findings, "B19"))).toMatch(
      /statement\(s\) of the character .*world fact\(s\) \[.*locus\.designation/,
    );
    const bare = text(first.findings);
    expect(bare).not.toContain("colour vision"); // the statements themselves are not printed...
    expect(bare).not.toContain(PC_WORDS.presence);
    expect(text(by(first.findings, "B20"))).toMatch(
      /safely conventional intrinsic baseline properties/,
    );
    const verbatim = await preflightB(r.config, { verbatim: true });
    expect(text(verbatim.findings)).toContain(PC_WORDS.presence); // ...unless the operator asks at their own console
    expect(text(verbatim.findings)).toContain("colour vision");

    // a look is made (a scripted host; plumbing only): the preflight now reports THAT a reading is retained, and nothing of what it says
    const policy = (doc: any) =>
      doc["operation"] === "F014D_DIRECT_PERCEPTION"
        ? observationAnswer(doc, { noFaculty: true })
        : plainPolicy(doc);
    const looked = await observe(r.dirs, verbConsole("observe-surroundings"), {}, policy);
    expect(looked.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    const after = await preflightB(r.config);
    expect(text(by(after.findings, "B18"))).toMatch(/ALREADY RETAINED .* ask no one/);
    expect(text(after.findings)).not.toMatch(
      /OBSERVATION_|UNRESOLVED|ESTABLISHED|OBSTRUCTED|nothing was received|NOT_ESTABLISHED/,
    );
  }, 180_000);

  it("is not offered to the player or the assistant: no command, tool or import reaches it", () => {
    expect(Object.keys(PLAYER_COMMANDS).filter((c) => /preflight/i.test(c))).toEqual([]);
    for (const f of [
      "server.ts",
      "chat-tools.ts",
      "mcp-http.ts",
      "oauth.ts",
      "commands.ts",
      "pages.ts",
    ]) {
      const code = readFileSync(join("apps/phone/src", f), "utf8");
      expect(code, f).not.toMatch(/(from|import)\s*\(?\s*["'][^"']*preflight/i);
    }
    const main = readFileSync("apps/phone/src/main.ts", "utf8");
    expect(main).toMatch(/process\.argv\[2\] === "preflight"/);
  });
});

describe("MECHANISM: `main.ts preflight` is the operator's command, with exit codes and no secret in its output", () => {
  it("exits 0 when clear, 1 on a defect, 64 on a usage error; it prints no secret", async () => {
    const r = await rig();
    const run = (args: string[], over: Record<string, string> = {}) =>
      spawnSync(
        process.execPath,
        [
          "--experimental-strip-types",
          "--disable-warning=ExperimentalWarning",
          "apps/phone/src/main.ts",
          "preflight",
          ...args,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            PATH: process.env["PATH"] ?? "",
            IMMORTALIS_CAMPAIGN_DIR: r.config.campaignDir,
            IMMORTALIS_CAMPAIGN_ID: LOCALITY_CAMPAIGN,
            IMMORTALIS_OPERATOR_DIR: r.config.operatorDir,
            IMMORTALIS_PLAYER_TOKEN: PLAYER,
            IMMORTALIS_REFEREE_TOKEN: REFEREE,
            IMMORTALIS_REFEREE_HOST_IDS: `${HOST_ID},${COLLECTION_HOST}`,
            IMMORTALIS_TRANSPORT: "insecure-loopback",
            PORT: "8080",
            IMMORTALIS_PUBLIC_URL: "http://127.0.0.1:8080",
            IMMORTALIS_SCENARIO_FILE: r.scenarioFile,
            IMMORTALIS_PLAYER_VIEW_HOST_ID: VIEW_HOST,
            ...over,
          },
        },
      );
    const clear = run(["--phase", "A"]);
    expect(clear.status, clear.stdout + clear.stderr).toBe(0);
    expect(clear.stdout).toMatch(/\[PASS\] A\/A4 the scenario file is a valid seven-key file/);
    const full = run([]);
    expect(full.status, full.stdout + full.stderr).toBe(0);
    expect(full.stdout).toMatch(/\[PASS\] B\/B12 the mechanism's cycle is attested/);
    expect(full.stdout + full.stderr).not.toContain(PLAYER);
    expect(full.stdout + full.stderr).not.toContain(REFEREE);
    writeScenario(r.scenarioFile, { ...SCENARIO, world: `${WORLD_ID}-x` });
    const defect = run([]);
    expect(defect.status).toBe(1);
    expect(defect.stdout).toMatch(/\[FAIL\] B\/B4 world .*no world profile/);
    writeScenario(r.scenarioFile, SCENARIO);
    const usage = run(["--phase", "Z"]);
    expect(usage.status).toBe(64);
    expect(usage.stderr).toMatch(/usage: main\.ts preflight/);
    const extra = run(["--bogus"]);
    expect(extra.status).toBe(64);
    mkdirSync(join(r.config.setupDir), { recursive: true });
  }, 240_000);
});
