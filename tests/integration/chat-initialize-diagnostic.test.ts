/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON-RPC */
// The OPERATOR-ONLY initialize-negotiation diagnostic of the ordinary-chat endpoint (apps/phone/src/mcp-http.ts), 24 October bounded task.
//
// EVERYTHING IN THIS FILE IS A MECHANISM TEST. The client is a script that speaks OAuth and MCP; nothing here is a real chat host, a real
// player's choice or a witness of any visible ChatGPT control. What it proves: one bounded line per ACCEPTED initialize reaches the
// operator's sink with controlled values only (what the client asked for, what the server negotiated, whether it declared elicitation as an
// object, and whether the session is eligible for the existing eliciting transport); repeated identical initializes stay observable; a
// refused or malformed initialize writes nothing; nothing a client sent, no token and no identifier is ever echoed; the line reaches no
// player, tool or response; and a missing, throwing or rejecting sink changes nothing about the handshake. A log line is engineering evidence of
// what the client declared; it does not show that any client renders a confirmation control.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createPhoneServer,
  type PhoneDeps,
  type PhoneServer,
} from "../../apps/phone/src/server.ts";
import {
  Chat,
  PLAYER,
  REFEREE,
  chatConfig,
  freePort,
  humanConfirms,
  withHost,
} from "../support/chat-client.ts";
import { stubCollectionRecovery } from "../support/chat-recovery.ts";
import { tempDir } from "../support/tmp.ts";

const LINE =
  /^mcp initialize accepted: requested=(2025-06-18|2025-03-26|2024-11-05|OTHER) negotiated=(2025-06-18|2025-03-26|2024-11-05) elicitation=(ABSENT|OBJECT|OTHER) form=(true|false|n\/a) url=(true|false|n\/a) eligible=(true|false)$/;

const SCENARIO = {
  player_character: "pc-test-1",
  world: "world-test",
  source: "source-test",
  reserve: "reserve-test",
  quantity_unit: "lump",
  mechanism: "mech-test",
  basis: "basis-test",
};

/** a running server with the diagnostic sink under test, and a scripted chat linked to it */
async function rig(negotiation?: PhoneDeps["negotiation"], extra: PhoneDeps = {}) {
  const dir = tempDir("immortalis-init-diag-");
  mkdirSync(join(dir, "setup"), { recursive: true });
  mkdirSync(join(dir, "operator"), { recursive: true });
  writeFileSync(join(dir, "scenario.json"), JSON.stringify(SCENARIO));
  const config = await chatConfig({
    scenarioFile: join(dir, "scenario.json"),
    setupDir: join(dir, "setup"),
    operatorDir: join(dir, "operator"),
  });
  const app: PhoneServer = createPhoneServer(config, {
    pollMs: 300,
    ...extra,
    ...(negotiation ? { negotiation } : {}),
  });
  await app.listen();
  const chat = new Chat(`http://127.0.0.1:${config.port}`);
  expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
  return { app, chat, config, base: `http://127.0.0.1:${config.port}` };
}

const initialize = (
  chat: Chat,
  protocolVersion: unknown,
  capabilities: unknown,
  clientInfo: unknown = { name: "scripted-chat", version: "0" },
  extraHeaders: Record<string, string> = {},
) => chat.rpc("initialize", { protocolVersion, capabilities, clientInfo }, undefined, extraHeaders);

const collect = () => {
  const lines: string[] = [];
  return { lines, sink: (line: string) => void lines.push(line) };
};

describe("MECHANISM (24 October diagnostic): one bounded operator line per ACCEPTED initialize, controlled values only", () => {
  it("reports what the client asked for, what was negotiated, and the eliciting-transport eligibility, for each capability shape", async () => {
    const cases: [string, unknown, unknown, string][] = [
      [
        "an elicitation object on the latest protocol",
        "2025-06-18",
        { elicitation: {} },
        "requested=2025-06-18 negotiated=2025-06-18 elicitation=OBJECT form=false url=false eligible=true",
      ],
      [
        "an elicitation object that declares form and url",
        "2025-06-18",
        { elicitation: { form: {}, url: {} } },
        "requested=2025-06-18 negotiated=2025-06-18 elicitation=OBJECT form=true url=true eligible=true",
      ],
      [
        "an elicitation object that declares only form",
        "2025-06-18",
        { elicitation: { form: {} } },
        "requested=2025-06-18 negotiated=2025-06-18 elicitation=OBJECT form=true url=false eligible=true",
      ],
      [
        "no capability at all",
        "2025-06-18",
        {},
        "requested=2025-06-18 negotiated=2025-06-18 elicitation=ABSENT form=n/a url=n/a eligible=false",
      ],
      [
        "other capabilities but no elicitation",
        "2025-06-18",
        { tools: {}, sampling: {} },
        "requested=2025-06-18 negotiated=2025-06-18 elicitation=ABSENT form=n/a url=n/a eligible=false",
      ],
      ...(["true", 1, "yes", null, []] as unknown[]).map(
        (scalar): [string, unknown, unknown, string] => [
          `a non-object elicitation (${JSON.stringify(scalar)})`,
          "2025-06-18",
          { elicitation: scalar },
          "requested=2025-06-18 negotiated=2025-06-18 elicitation=OTHER form=n/a url=n/a eligible=false",
        ],
      ),
      [
        "a supported older protocol that declares elicitation",
        "2025-03-26",
        { elicitation: {} },
        "requested=2025-03-26 negotiated=2025-03-26 elicitation=OBJECT form=false url=false eligible=false",
      ],
      [
        "the oldest supported protocol",
        "2024-11-05",
        { elicitation: {} },
        "requested=2024-11-05 negotiated=2024-11-05 elicitation=OBJECT form=false url=false eligible=false",
      ],
      [
        "an unsupported newer protocol (the server answers with its latest)",
        "2025-11-25",
        { elicitation: { form: {} } },
        "requested=OTHER negotiated=2025-06-18 elicitation=OBJECT form=true url=false eligible=true",
      ],
      [
        "an unsupported protocol string",
        "SENTINEL-PROTOCOL",
        { elicitation: {} },
        "requested=OTHER negotiated=2025-06-18 elicitation=OBJECT form=false url=false eligible=true",
      ],
    ];
    const { lines, sink } = collect();
    const s = await rig(sink);
    try {
      for (const [why, protocol, capabilities, expected] of cases) {
        lines.length = 0;
        const r: any = await initialize(s.chat, protocol, capabilities);
        expect(r.json?.result?.protocolVersion, why).toMatch(/^20\d\d-\d\d-\d\d$/);
        expect(lines, why).toEqual([`mcp initialize accepted: ${expected}`]);
        expect(lines[0], why).toMatch(LINE);
        // the negotiated value the line states is the one the client was answered with
        expect(lines[0], why).toContain(`negotiated=${r.json.result.protocolVersion}`);
      }
    } finally {
      await s.app.close();
    }
  });

  it("repeated identical initializes are each reported (nothing de-duplicates them)", async () => {
    const { lines, sink } = collect();
    const s = await rig(sink);
    try {
      for (let i = 0; i < 4; i++) await initialize(s.chat, "2025-06-18", { elicitation: {} });
      expect(lines).toHaveLength(4);
      expect(new Set(lines).size).toBe(1); // identical text, four events
    } finally {
      await s.app.close();
    }
  });

  it("an unauthorized, wrong-host or malformed initialize writes no line", async () => {
    const { lines, sink } = collect();
    const s = await rig(sink);
    try {
      const body = (params: unknown, id: unknown = 1) =>
        JSON.stringify({ jsonrpc: "2.0", id, method: "initialize", params });
      const good = {
        protocolVersion: "2025-06-18",
        capabilities: { elicitation: {} },
        clientInfo: { name: "x", version: "0" },
      };
      // no token, a forged token, a token for nothing
      for (const authorization of [undefined, "Bearer forged.token.value", "Basic abc"]) {
        const res = await fetch(`${s.base}/mcp`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(authorization ? { authorization } : {}),
          },
          body: body(good),
        });
        expect(res.status).toBe(401);
      }
      // a request that does not carry the endpoint's public name
      expect(
        await withHost(s.base, "/mcp", "evil.example", {
          authorization: `Bearer ${s.chat.access}`,
        }),
      ).toBe(421);
      // authenticated but malformed: each is refused, none is "accepted"
      for (const bad of [
        { capabilities: {}, clientInfo: { name: "x", version: "0" } },
        { protocolVersion: "2025-06-18", clientInfo: { name: "x", version: "0" } },
        { protocolVersion: "2025-06-18", capabilities: {} },
        {
          protocolVersion: "2025-06-18",
          capabilities: [],
          clientInfo: { name: "x", version: "0" },
        },
        { protocolVersion: 7, capabilities: {}, clientInfo: { name: "x", version: "0" } },
        { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: 1, version: "0" } },
      ]) {
        const r: any = await s.chat.rpc("initialize", bad);
        expect(r.json?.error?.code).toBe(-32602);
      }
      expect(lines).toEqual([]);
    } finally {
      await s.app.close();
    }
  });

  it("nothing a client sent, no token and no identifier is ever logged: the line is built from the whitelist alone", async () => {
    const { lines, sink } = collect();
    const s = await rig(sink);
    try {
      const sentinel = {
        name: "SENTINEL-CLIENT-NAME",
        version: "SENTINEL-CLIENT-VERSION",
        cap: "SENTINEL-CAP-KEY",
        capValue: "SENTINEL-CAP-VALUE",
        form: "SENTINEL-FORM-KEY",
        header: "SENTINEL-HEADER-VALUE",
        proto: "SENTINEL-PROTOCOL",
      };
      const r: any = await initialize(
        s.chat,
        sentinel.proto,
        {
          experimental: { [sentinel.cap]: sentinel.capValue },
          elicitation: { [sentinel.form]: {}, form: {}, url: {} },
          [`${sentinel.cap}-TOP`]: { deep: sentinel.capValue },
        },
        { name: sentinel.name, version: sentinel.version, title: sentinel.capValue },
        { "x-sentinel": sentinel.header, "user-agent": sentinel.header },
      );
      const sessionId = r.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();
      await initialize(s.chat, "2025-06-18", { elicitation: {} });
      expect(lines).toHaveLength(2);
      const forbidden = [
        ...Object.values(sentinel),
        s.chat.access,
        s.chat.refresh,
        s.chat.clientId,
        sessionId as string,
        PLAYER,
        REFEREE,
        s.config.campaignId,
        s.config.operatorDir,
        s.config.campaignDir,
        "Bearer",
        "127.0.0.1",
      ].filter((v) => typeof v === "string" && v.length > 0);
      for (const line of lines) {
        expect(line).toMatch(LINE);
        for (const word of forbidden) expect(line, `leaked: ${word}`).not.toContain(word);
      }
      // the first line states only the categories: an unknown protocol and an object that declares form and url
      expect(lines[0]).toBe(
        "mcp initialize accepted: requested=OTHER negotiated=2025-06-18 elicitation=OBJECT form=true url=true eligible=true",
      );
    } finally {
      await s.app.close();
    }
  });

  it("the line reaches no response, tool result or player view, and the handshake answer is the same with or without the sink", async () => {
    const { lines, sink } = collect();
    const watched = await rig(sink);
    const plain = await rig(undefined);
    try {
      const params = {
        protocolVersion: "2025-06-18",
        capabilities: { elicitation: {} },
        clientInfo: { name: "scripted-chat", version: "0" },
      };
      const a: any = await watched.chat.rpc("initialize", params);
      const b: any = await plain.chat.rpc("initialize", params);
      expect(lines).toHaveLength(1);
      // the same answer, byte for byte (the session id is the only random part and is a header)
      expect(JSON.stringify(a.json)).toBe(JSON.stringify(b.json));
      expect([...a.headers.keys()].sort()).toEqual([...b.headers.keys()].sort());
      watched.chat.session = a.headers.get("mcp-session-id");
      await fetch(`${watched.base}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(watched.chat as any).headers() },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      });
      const listed: any = await watched.chat.rpc("tools/list", {});
      const everything = JSON.stringify([a.json, listed.json]);
      for (const word of ["accepted:", "negotiated=", "eligible=", "elicitation=", "requested="])
        expect(everything).not.toContain(word);
    } finally {
      await watched.app.close();
      await plain.app.close();
    }
  });
});

describe("MECHANISM (24 October diagnostic): a missing, throwing or rejecting sink changes nothing", () => {
  it("initialize succeeds, answers the same and stays usable when the sink throws, rejects or is absent", async () => {
    const params = {
      protocolVersion: "2025-06-18",
      capabilities: { elicitation: { form: {} } },
      clientInfo: { name: "scripted-chat", version: "0" },
    };
    const sinks: [string, PhoneDeps["negotiation"] | undefined][] = [
      [
        "throwing",
        () => {
          throw new Error("the sink is broken");
        },
      ],
      [
        "rejecting",
        (async () => {
          throw new Error("the sink rejected");
        }) as unknown as PhoneDeps["negotiation"],
      ],
      ["absent", undefined],
    ];
    let reference = "";
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => void unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    for (const [why, sink] of sinks) {
      const s = await rig(sink);
      try {
        const r: any = await s.chat.rpc("initialize", params);
        expect(r.status, why).toBe(200);
        expect(r.json?.result?.protocolVersion, why).toBe("2025-06-18");
        reference ||= JSON.stringify(r.json);
        expect(JSON.stringify(r.json), why).toBe(reference);
        s.chat.session = r.headers.get("mcp-session-id");
        await fetch(`${s.base}/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(s.chat as any).headers() },
          body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        });
        const listed: any = await s.chat.rpc("tools/list", {});
        expect(listed.json?.result?.tools?.length, why).toBeGreaterThan(0);
        // and a second handshake on the same server is still accepted
        expect(((await s.chat.rpc("initialize", params)) as any).status, why).toBe(200);
        await new Promise((r2) => setTimeout(r2, 50)); // let a rejecting sink's rejection surface
      } finally {
        await s.app.close();
      }
    }
    process.off("unhandledRejection", onUnhandled);
    expect(unhandled).toEqual([]); // a rejecting sink is handled, never left to the process
  });
});

describe("MECHANISM (24 October diagnostic): the logged eligibility is what the transport then does", () => {
  /** a stand-in for the shipped command that proposes, asks, and finishes by the typed phrase (it never answers itself) */
  const cli: NonNullable<PhoneDeps["runCli"]> = async (argv, env) => {
    const t = env.terminal!;
    if (argv[0] === "status") return 0;
    t.say("PROPOSAL collect");
    const phrase = "collect 0123456789ab";
    t.say(`To confirm, type exactly "${phrase}"`);
    const typed = await t.ask(">");
    t.say(typed === phrase ? "STATUS COMMITTED" : "STATUS DECLINED");
    return typed === phrase ? 0 : 1;
  };
  it.each([
    ["eligible=true", "2025-06-18", { elicitation: {} }, 1, "FINISHED"],
    ["eligible=false (no capability)", "2025-06-18", {}, 0, "AWAITING_CONFIRMATION"],
    [
      "eligible=false (older protocol)",
      "2025-03-26",
      { elicitation: {} },
      0,
      "AWAITING_CONFIRMATION",
    ],
  ] as const)(
    "%s: the transport elicits exactly when the line says so",
    async (why, protocol, capabilities, elicited, state) => {
      const { lines, sink } = collect();
      const s = await rig(sink, {
        runCli: cli,
        recovery: {
          ...stubCollectionRecovery(cli),
          captureObservation: async () => null,
          observationEvidence: async () => ({ kind: "NONE" as const }),
          completeObservation: async () => ({ kind: "NONE" as const }),
        },
      });
      try {
        const init: any = await initialize(s.chat, protocol, capabilities);
        s.chat.session = init.headers.get("mcp-session-id");
        await fetch(`${s.base}/mcp`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(s.chat as any).headers() },
          body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
        });
        expect((await s.chat.call("collect", { amount: 1 })).isError).toBe(false);
        const r: any = await s.chat.call("await_action", { wait_seconds: 2 }, humanConfirms);
        expect(lines, why).toHaveLength(1);
        expect(lines[0]).toContain(`eligible=${elicited === 1}`);
        expect(r.elicited, why).toHaveLength(elicited);
        expect(r.data?.state, why).toBe(state);
      } finally {
        await s.app.close();
      }
    },
    60_000,
  );
});

describe("MECHANISM (24 October diagnostic): the service entry point writes each accepted initialize to the operator's stderr, never de-duplicated", () => {
  it("two identical initializes against the real `main.ts` are two identical lines on stderr, carrying nothing else", async () => {
    const dir = tempDir("immortalis-init-diag-main-");
    mkdirSync(join(dir, "setup"), { recursive: true });
    mkdirSync(join(dir, "operator"), { recursive: true, mode: 0o700 });
    mkdirSync(join(dir, "campaign"), { recursive: true });
    const port = await freePort();
    const child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        "apps/phone/src/main.ts",
      ],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env["PATH"] ?? "",
          IMMORTALIS_CAMPAIGN_DIR: join(dir, "campaign"),
          IMMORTALIS_CAMPAIGN_ID: "campaign-test",
          IMMORTALIS_OPERATOR_DIR: join(dir, "operator"),
          IMMORTALIS_SETUP_DIR: join(dir, "setup"),
          IMMORTALIS_PLAYER_TOKEN: PLAYER,
          IMMORTALIS_REFEREE_TOKEN: REFEREE,
          IMMORTALIS_REFEREE_HOST_IDS: "gm-setup,gm-collection",
          IMMORTALIS_TRANSPORT: "insecure-loopback",
          PORT: String(port),
          IMMORTALIS_PUBLIC_URL: `http://127.0.0.1:${port}`,
        },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += String(c)));
    child.stderr.on("data", (c) => (stderr += String(c)));
    const exited = new Promise<number | null>((resolve) => child.once("exit", resolve));
    try {
      for (let i = 0; i < 200 && !stdout.includes("listening on"); i++)
        await new Promise((r) => setTimeout(r, 50));
      expect(stdout, stderr).toContain("listening on");
      const chat = new Chat(`http://127.0.0.1:${port}`);
      expect((await chat.link("player", { player: PLAYER })).ok).toBe(true);
      await initialize(chat, "2025-06-18", { elicitation: {} });
      await initialize(chat, "2025-06-18", { elicitation: {} });
      await initialize(chat, "2025-06-18", {}, { name: "SENTINEL-MAIN-CLIENT", version: "9" });
      await new Promise((r) => setTimeout(r, 200));
      const mine = stderr
        .split("\n")
        .filter((l) => l.includes("mcp initialize accepted:"))
        .map((l) => l.replace(/^immortalis-phone: /, ""));
      expect(mine).toEqual([
        "mcp initialize accepted: requested=2025-06-18 negotiated=2025-06-18 elicitation=OBJECT form=false url=false eligible=true",
        "mcp initialize accepted: requested=2025-06-18 negotiated=2025-06-18 elicitation=OBJECT form=false url=false eligible=true",
        "mcp initialize accepted: requested=2025-06-18 negotiated=2025-06-18 elicitation=ABSENT form=n/a url=n/a eligible=false",
      ]);
      for (const secret of [chat.access, chat.refresh, PLAYER, REFEREE, "SENTINEL-MAIN-CLIENT"])
        expect(stderr).not.toContain(secret);
      expect(stdout).not.toContain("mcp initialize accepted");
    } finally {
      child.kill("SIGTERM");
      await exited;
    }
  }, 60_000);
});
