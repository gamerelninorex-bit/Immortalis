// BLUE v5.2 conformance — the local player-view MCP transport of the existing current Active-PC Glance read (bounded brief 2026-10-15, native pin
// 2026-10-15T09:56:12.551Z; exact base 76b3209739f47e047e7e4ea22e079410ec1a87cf). The slice adds operator-side modules, tests and documents. It moves
// no spec-lock pin, runtime-contract snapshot, acceptance-register row, status or open gate (OB-030 / F-028 stay Blocked; PF-6 stays unactivated),
// edits none of the gateway, projection, presentation, producer or referee modules it consumes or stands beside, and adds no owner, fact kind, schema,
// persistent key or dependency. Implementation pins change openly; frozen design, source lock, acceptance status and gates do not.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE } from "@immortalis/contracts";
import { code, gates, lock, register } from "../support/f027.ts";
import { PROTOCOL_ONLY_EVENT_SIGNAL_READ, protocolIndexExports } from "../support/protocol.ts";

const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".ts") ? [`${d}/${e.name}`] : [],
  );
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

/** Byte-identical to the base 76b3209: the transport consumes or stands beside every one of these, and edits none. */
const UNCHANGED: Readonly<Record<string, string>> = {
  // the frozen specification snapshot, the lock, the register and the gates
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/README.md": "aed7da7bd7b40002125849b2cbff39b73bd85f2a4c0664cc0f08eb558e7a15cb",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  // the Glance gateway (IM-15), its contract, and the projection (IM-13) and presentation (IM-14) it composes
  "packages/protocol/src/current-observation-glance.ts":
    "2ddad80dbc7b1d79a452a1066f8ad3f3efcef5f43e101d789369d5947da32607",
  "packages/contracts/src/protocol-current-glance.ts":
    "c51e39c962137b912e05ce24a6590038afead2b32a891e145a43ece1b909ccba",
  "packages/protocol/src/index.ts":
    "48931f5d25d9a4490d88bbbca5d925ee7534eddff4a64e2a55ed7cec08c8d58f",
  "packages/protocol/src/causal-event-signal.ts":
    "6b2d56f4953b1c7c0fa073b01b5743f81e8a540f719d9fe110f2740ebdcce3fb",
  "packages/protocol/src/event-signal.ts":
    "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
  "packages/engine/src/projection/event-signal.ts":
    "5fa2712c00ce8ea7df4720d26e1250ff484f6a3475ef156fe3527c514f9a7e47",
  "packages/engine/src/presentation/event-signal.ts":
    "314b6e38bcb0aee7467a3ebb284e55da45ac8f74fcbe82b1157ccd2923970345",
  // the observation producer and the operator modules the trusted read re-uses without edit
  "packages/operator/src/observation.ts":
    "f7f35fd9e4e3c5a4d45683be5f99b43567694a6772f2f26d1ff4f8e7e19147a2",
  "packages/operator/src/original-pc.ts":
    "ea023957d3ddd4e8dbab14111213d2d46d057a27564f59a413bb65e18a0d3f55",
  "packages/operator/src/original-pc-keep.ts":
    "0c8614f5245770f6b65b4989c520eca3b710ce598146194605832173e572e30c",
  "packages/operator/src/local-operator.ts":
    "1bf152e2a05e64474beb661b215c33b1e4ab318ceff845856aaef916de3250a8",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  // the interpreter-only referee surface (a distinct, independently authenticated authority) and the operator command set
  "packages/operator/src/referee-mcp.ts":
    "0499a87bd642f66c1968888f4156067177926b48f8e56b578ffc8c81fbd3a399",
  "packages/operator/src/referee-exchange.ts":
    "59179f98e55b5774ef33c830be28da4cdfdc3985ed7c508e5f2d7d81060e3612",
  "packages/operator/src/referee-session.ts":
    "92a09f989789734efcdd4388d74b1b7535d9b4a7135276253b2e2ab27c018526",
  "packages/operator/src/cli.ts":
    "bdf3ad73053383f6272baf0cf17b22b6950d17ded0d789a501592dae5277691e",
  "packages/operator/src/index.ts":
    "f5c1ed2f38eb7540da5a467f7c7012c7ffc5e14a7ddb50247728e1936739f552",
  "packages/operator/src/confirmation.ts":
    "14bb6413dbd968c13879b0457627ddfe693322df84ad0ad89490ece0f9e2f971",
};

const NEW_MODULES = [
  // BLUE v5.2-A1 (host-requested time advance): eight further modules, added mechanically and bound by advance-request-conformance.test.ts
  "advance-request-answer-bin.ts",
  "advance-request-answer.ts",
  "advance-request-bin.ts",
  "advance-request-bind-bin.ts",
  "advance-request-cli.ts",
  "advance-request-exchange.ts",
  "advance-request-mcp.ts",
  "advance-request.ts",
  // BLUE v5.2-A1 (host-requested observation): eight further modules, added mechanically and bound by observe-request-conformance.test.ts
  "observe-request-answer-bin.ts",
  "observe-request-answer.ts",
  "observe-request-bin.ts",
  "observe-request-bind-bin.ts",
  "observe-request-cli.ts",
  "observe-request-exchange.ts",
  "observe-request-mcp.ts",
  "observe-request.ts",
  "player-view-bin.ts",
  "player-view-bind-bin.ts",
  "player-view-exchange.ts",
  "player-view-mcp.ts",
  "player-view.ts",
];

describe("existing owners, the gateway, the referee surface and the specification are untouched: the transport consumes them, never edits or duplicates them", () => {
  it("the F-027 lock, runtime-contract snapshot, register and gates, IM-13/IM-14/IM-15, the observation producer and the referee surface are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the spec lock is the same Git blob the PR #68 closeout verified, and the frozen pins are the brief's", () => {
    const blob = createHash("sha1")
      .update(`blob ${readFileSync("spec/f027/spec-lock.json").length}\0`)
      .update(readFileSync("spec/f027/spec-lock.json"))
      .digest("hex");
    expect(blob).toBe("43e4325789488e155c60f2deae5028e44286d795");
    const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!.native_pin;
    expect(pin("I-001")).toBe("2026-09-25T00:17:49.551Z");
    expect(pin("F-014D")).toBe("2026-09-24T16:25:17.059Z");
    expect(pin("F-014B")).toBe("2026-09-25T23:42:29.547Z");
    expect(pin("NPK")).toBe("2026-09-25T00:18:32.532Z");
  });

  it("the operator package gained exactly the five transport modules (and, mechanically, the sixteen BLUE v5.2-A1 request modules), and the engine, contracts, protocol and testkit packages gained nothing", () => {
    expect(readdirSync("packages/operator/src").sort()).toEqual(
      [
        "actor-observation.ts",
        "additional-locality.ts",
        "additional-source.ts",
        "bin.ts",
        "cli.ts",
        "commands.ts",
        "confirmation.ts",
        "corridor.ts",
        "index.ts",
        "initial-local-demand.ts",
        "initial-population.ts",
        "initial-timed-governance.ts",
        "ledger.ts",
        "local-operator.ts",
        "locality-pin.ts",
        "locality.ts",
        "observation.ts",
        "ooc.ts",
        "original-pc-keep.ts",
        "original-pc-locus.ts",
        "original-pc.ts",
        "production-reserve.ts",
        "referee-bin.ts",
        "referee-exchange.ts",
        "referee-mcp.ts",
        "referee-session.ts",
        "session.ts",
        "terminal.ts",
        ...NEW_MODULES,
      ].sort(),
    );
    expect(readdirSync("packages/protocol/src").sort()).toEqual([
      "active-pc-target-advance.ts",
      "causal-event-signal.ts",
      "current-observation-glance.ts",
      "event-signal.ts",
      "index.ts",
      "null-pc-ooc-advance.ts",
      "null-pc-ooc-held-continuation.ts",
      "pc-corridor-relocation.ts",
      "pc-relocation.ts",
      "pc-transfer-advance.ts",
    ]);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    expect(readdirSync("packages").sort()).toEqual([
      "contracts",
      "engine",
      "operator",
      "protocol",
      "testkit",
    ]);
    for (const f of [
      ...walk("packages/engine/src"),
      ...walk("packages/contracts/src"),
      ...walk("packages/testkit/src"),
      ...walk("packages/protocol/src"),
    ])
      expect(code(f), f).not.toMatch(
        /player-view|PlayerView|immortalis-player-view|playerViewRequestOf/,
      );
  });

  it("no dependency was added, and the package gained exactly the two entry points", () => {
    const pkg = JSON.parse(readFileSync("packages/operator/package.json", "utf8")) as {
      dependencies: Record<string, string>;
      bin: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@immortalis/contracts": "workspace:*",
      "@immortalis/engine": "workspace:*",
      "@immortalis/protocol": "workspace:*",
      zod: JSON.parse(readFileSync("packages/contracts/package.json", "utf8")).dependencies.zod,
    });
    expect(pkg.bin).toEqual({
      "immortalis-operator": "./src/bin.ts",
      "immortalis-referee": "./src/referee-bin.ts",
      "immortalis-player-view": "./src/player-view-bin.ts",
      "immortalis-player-view-bind": "./src/player-view-bind-bin.ts",
      // BLUE v5.2-A1 (host-requested observation): three further entry points, added mechanically; the player-view entries are unchanged
      "immortalis-observe-request": "./src/observe-request-bin.ts",
      "immortalis-observe-request-bind": "./src/observe-request-bind-bin.ts",
      "immortalis-observe-request-answer": "./src/observe-request-answer-bin.ts",
      // BLUE v5.2-A1 (host-requested time advance): three further entry points, added mechanically; the entries above are unchanged
      "immortalis-advance-request": "./src/advance-request-bin.ts",
      "immortalis-advance-request-bind": "./src/advance-request-bind-bin.ts",
      "immortalis-advance-request-answer": "./src/advance-request-answer-bin.ts",
    });
    expect(JSON.parse(readFileSync("package.json", "utf8")).devDependencies).not.toHaveProperty(
      "@modelcontextprotocol/sdk",
    );
  });
});

describe("the transport composes the existing path only, and takes no authority, identity, basis or time from the host", () => {
  it("takes from the protocol package only the Glance binder, the Glance read and its result type, and from the contracts the one operation and the one refusal", () => {
    const protocolNames = (file: string) =>
      [
        ...readFileSync(file, "utf8").matchAll(
          /import (?:type )?\{([^}]*)\} from "@immortalis\/protocol"/g,
        ),
      ].flatMap((m) =>
        m[1]!
          .split(",")
          .map((n) => n.trim().replace(/^type /, ""))
          .filter(Boolean),
      );
    const all = NEW_MODULES.flatMap((m) => protocolNames(`packages/operator/src/${m}`));
    expect([...new Set(all)].sort()).toEqual([
      "ReadCurrentObservationGlanceResult",
      "bindTrustedCurrentPlayerContext",
      "readCurrentObservationGlance",
    ]);
    const src = NEW_MODULES.map((m) => identifiers(`packages/operator/src/${m}`)).join("\n");
    expect(new Set(src.match(/PROTOCOL_OP_[A-Z_]+/g))).toEqual(
      new Set(["PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE"]),
    );
    expect(PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE).toBe("read_current_observation_glance");
  });

  it("the tool surface is exactly one tool named for the existing operation, with no input property", () => {
    const text = readFileSync("packages/operator/src/player-view-mcp.ts", "utf8");
    expect(text.match(/\bname:\s*PLAYER_VIEW_TOOL/g)).toHaveLength(1);
    const tools = text.slice(text.indexOf("const TOOLS = ["), text.indexOf("] as const;"));
    expect(tools.match(/\bname:/g)).toHaveLength(1);
    expect(text).toContain(
      'inputSchema: { type: "object", properties: {}, additionalProperties: false }',
    );
    expect(text).toContain(
      "export const PLAYER_VIEW_TOOL = PROTOCOL_OP_READ_CURRENT_OBSERVATION_GLANCE;",
    );
  });

  it("every failure the host can observe is the existing refusal, built from the contracts' own constants and never from a message of its own", () => {
    for (const m of ["player-view.ts", "player-view-mcp.ts"]) {
      const src = code(`packages/operator/src/${m}`);
      expect(src, m).toContain("PROJECTION_UNAVAILABLE_MESSAGE");
      expect(src, m).not.toMatch(/no projection is available/);
    }
  });
});

describe("register, lock and gate honesty: nothing moved, and the documents claim no more than was built", () => {
  it("no register row is PASS/FAIL or mentions this slice, and the sources stay at their lock pins", () => {
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(
      /player-view|player view|current-observation-glance/i,
    );
  });

  it("every open gate stays at its recorded status; PF-6/F-028, provider, deployment and migration stay inactive; IA-07 stays BLOCKED", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the foundation document cites the brief, the base and the lock, and states what is and is not claimed", () => {
    const doc = readFileSync("docs/protocol-player-view-mcp-foundation.md", "utf8");
    expect(doc).toContain("3fa20af901e081fa9b03d6a44aea18b2");
    expect(doc).toContain("2026-10-15T09:56:12.551Z");
    expect(doc).toContain("76b3209739f47e047e7e4ea22e079410ec1a87cf");
    expect(doc).toMatch(/No PASS acceptance is claimed/);
    expect(doc).toMatch(/mechanism-only/i);
    expect(doc).toMatch(/certifies live-model perception/);
    expect(doc).toMatch(/Independent BLUE review remains/);
    expect(doc).toMatch(/OB-030/);
    expect(doc).toMatch(/no person and no remote login/i);
    expect(doc).toMatch(/\*\*confers no role and no permission\*\*/);
    expect(doc).toContain("docs/evidence/b52-direct-observation-live-host.md");
    expect(doc).toContain("evidence/player-view-mcp-real-host.md");
  });

  it("the real-host report is separate from the scripted evidence and claims no semantic validation", () => {
    const report = readFileSync("docs/evidence/player-view-mcp-real-host.md", "utf8");
    expect(report).toMatch(/Reported \*\*separately\*\*/);
    expect(report).toMatch(/not acceptance/);
    expect(report).toMatch(/scripted, plumbing-only/);
    expect(report).not.toMatch(/\bPASS\b(?! acceptance)/);
    const calls = JSON.parse(
      readFileSync("docs/evidence/player-view-mcp-real-host/host-calls.json", "utf8"),
    ) as { runs: { events: { event: string; is_error?: boolean; text?: string }[] }[] };
    const results = calls.runs.map((r) => r.events.find((e) => e.event === "tool_result")!);
    expect(results.map((r) => r.is_error)).toEqual([false, true]);
    expect(JSON.parse(results[0]!.text!).ok).toBe(true);
    expect(results[1]!.text).toBe(
      '{"ok":false,"error":{"code":"PROJECTION_UNAVAILABLE","message":"no projection is available"}}',
    );
    expect(JSON.stringify(calls)).not.toMatch(/\/tmp\/|scratchpad|secret/i);
  });
});
