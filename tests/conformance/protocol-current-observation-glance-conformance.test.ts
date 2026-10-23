// Conformance evidence for the Current Observation Glance read (BLUE v5.2 bounded brief 2026-10-15; I-001 §§3–5, 9–11; F-014D §§2, 4.1, 5, 6; F-014B
// §§4, 17; IM-13 → IM-14; IM-15 / IM-16; RC-14). Governing lock: spec/f027/spec-lock.json. No register row, status, source pin, gate, owner,
// fact kind or schema moved; this slice adds one contract, one protocol module and tests. Authentication is neither implemented nor claimed.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED) and certifies no AI perception: the semantic support is the retained,
// finite real-host exercise, and the scripted referee hosts in the tests are mechanism-only.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gates, lock, register, code } from "../support/f027.ts";
import { protocolIndexExports, PROTOCOL_ONLY_EVENT_SIGNAL_READ } from "../support/protocol.ts";

const MODULE = "packages/protocol/src/current-observation-glance.ts";
const CONTRACT = "packages/contracts/src/protocol-current-glance.ts";
const DOC = "docs/protocol-current-observation-glance-foundation.md";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
/** Source with comments AND string literals removed: only the identifiers and operators of the code remain. */
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const specifiersOf = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);

/** Byte-identical to the base 6e14c19: the read consumes every one of these, and edits none. */
const UNCHANGED: Readonly<Record<string, string>> = {
  "packages/engine/src/projection/event-signal.ts":
    "5fa2712c00ce8ea7df4720d26e1250ff484f6a3475ef156fe3527c514f9a7e47",
  "packages/engine/src/presentation/event-signal.ts":
    "314b6e38bcb0aee7467a3ebb284e55da45ac8f74fcbe82b1157ccd2923970345",
  "packages/contracts/src/projection.ts":
    "17e0c6288e6834f7f064014d1e90b6563f95268c89acabad621dbed318fce6c1",
  "packages/contracts/src/presentation.ts":
    "837c65d6b43182fd8ff165079105b9f800ee413bade527fba32d34d4c96af5fa",
  "packages/protocol/src/causal-event-signal.ts":
    "6b2d56f4953b1c7c0fa073b01b5743f81e8a540f719d9fe110f2740ebdcce3fb",
  "packages/protocol/src/event-signal.ts":
    "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
  "packages/contracts/src/protocol-causal.ts":
    "a535533b4ae92b71805634bc742627e45bb2223a0311631303b63c211ed588d5",
  "packages/contracts/src/protocol.ts":
    "426cb9e790b435d75a4f6a1df39c792616310421e17eb953aa2f382ae4370e0c",
  "packages/contracts/src/epistemic-access.ts":
    "a7f2d4bf7ae5abedfd34a3f73f45b67ebab3521c7ff60d6a93feeb823cad865c",
  "packages/engine/src/epistemic/observation.ts":
    "7c5ee28d4281fa7413cf9fcd7230f331c79ac6851e773e2ad58b96d4d1e1aef1",
  "packages/engine/src/epistemic/direct-observation.ts":
    "a0ca78beee98677b855fa863c449bf88a371b997713e68ce59807dbce8801033",
  "packages/engine/src/epistemic/declaration.ts":
    "754866e721064059052d4f37a170a7339d1a81eb29b9dd0ee9b9fa8f812b7257",
  "packages/engine/src/epistemic/integrity.ts":
    "577777d9fcee52b3b89fb26398ed8c32426b7e769a3ed5a6a13adb507287d7a7",
  "packages/engine/src/epistemic/admission.ts":
    "0172458a289e4014b15a1ae3179bd0b5d1cc8985af6acb984cf4818d130ec0d1",
  "packages/engine/src/temporal/coordinator.ts":
    "afe8c28a662f3c9e1f5329665c6fdf60d724775c389a447be56c7ed7a8e02318",
  "packages/operator/src/observation.ts":
    "f7f35fd9e4e3c5a4d45683be5f99b43567694a6772f2f26d1ff4f8e7e19147a2",
  "spec/f027/spec-lock.json": "88f40002275977f5774ea275d8c4ab4e25c630e30edfd305b507272dc892eff6",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
};

describe("existing owners, projection, presentation and predecessors are untouched: the read consumes them, never edits or duplicates them", () => {
  it("IM-13, IM-14, their contracts, the sibling protocol operations, the Epistemic observation owner path, the Temporal coordinator, the operator observation command and the F-027 artifacts are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the protocol package gained exactly one module and the index re-exports it, with the same dependencies", () => {
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
    expect(protocolIndexExports()).toContain('export * from "./current-observation-glance.ts";');
    const pkg = JSON.parse(readFileSync("packages/protocol/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@immortalis/contracts": "workspace:*",
      "@immortalis/engine": "workspace:*",
    });
  });

  it("no engine module, owner registration, fact kind, schema or persistent key was added or changed: the slice is one contract, one protocol module and tests", () => {
    expect(readdirSync("packages/engine/src/projection")).toEqual(["event-signal.ts"]);
    expect(readdirSync("packages/engine/src/presentation")).toEqual(["event-signal.ts"]);
    expect(readdirSync("packages")).toEqual(
      expect.arrayContaining(["contracts", "engine", "operator", "protocol", "testkit"]),
    );
    expect(readFileSync("packages/contracts/src/index.ts", "utf8")).toContain(
      'export * from "./protocol-current-glance.ts";',
    );
    expect(identifiers(CONTRACT)).not.toMatch(/factKind|registerOwner|OWNER_|Key\b|migration/);
  });
});

describe("the read composes the existing path only, and takes no authority, identity, basis or time from the host", () => {
  it("imports the contracts and the engine only, and from the engine only the existing projection, presentation, observation identity and verification rule", () => {
    expect(specifiersOf(MODULE).sort()).toEqual(["@immortalis/contracts", "@immortalis/engine"]);
    const engineImport = readFileSync(MODULE, "utf8").match(
      /import \{([^}]*)\} from "@immortalis\/engine"/,
    )![1]!;
    expect(
      engineImport
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .sort(),
    ).toEqual([
      "deriveEventSignalProjection",
      "isObservationEarnedFact",
      "observationEventId",
      "observationEventViolation",
      "observationRecordOf",
      "presentEventSignal",
      "type ProjectionStateView",
    ]);
  });

  it("calls the projection once and the presenter once, constructing no presentation, projection, packet or fact itself", () => {
    const src = identifiers(MODULE);
    expect(src.match(/deriveEventSignalProjection\(/g)).toHaveLength(1);
    expect(src.match(/presentEventSignal\(/g)).toHaveLength(1);
    expect(src.match(/observationEventId\(/g)).toHaveLength(1);
    expect(src.match(/observationEventViolation\(/g)).toHaveLength(1);
    expect(src).not.toMatch(
      /EventSignalPresentationSchema|EventSignalProjectionSchema|PRESENTATION_NPK|PROJECTION_EVENT_SIGNAL|AccessEventSchema|AccessiblePacketSchema|element|elements|viewpoint|accessPacket|isPcRecipientEvent|recipientBoundary|ResolutionTransaction|compareTime|timeEquals/,
    );
  });

  it("the parsed request is used for validation, never read: no event identity, recipient, basis or time can come from the host", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(/parsed\.data|request\.|request\[/);
    expect(src).toMatch(/event_id: eventId/);
    expect(src).toMatch(
      /deriveEventSignalProjection\(view, \{ event_id: eventId, recipient_id \}\)/,
    );
  });

  it("the only time read is the Temporal owner's committed canonical state, by identity, and nothing is written to it", () => {
    const src = identifiers(MODULE);
    expect(src.match(/view\.getFact\(TEMPORAL_STATE_KEY\)/g)).toHaveLength(1);
    expect(src).not.toMatch(/Date\b|performance|setTimeout|Math\.random|process\.hrtime/);
  });

  it("the contract has exactly one operation and no field but the operation, and neither file has authentication or tenant vocabulary", () => {
    expect(readFileSync(CONTRACT, "utf8").match(/export const PROTOCOL_OP_/g)).toHaveLength(1);
    expect(identifiers(CONTRACT)).not.toMatch(
      /event_id|eventId|campaign|recipient|role|permission|viewpoint|binding|source|provenance|path|basis|time|key\b/i,
    );
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /\bauth\w*\b|\bcredential\w*\b|\btoken\b|\bsession\b|\baccount\b|\btenant\b|\bpassword\b|\bsecret\b|\bcampaignId\b/i,
    );
  });
});

describe("the read is read-only, causally inert and has no discovery surface", () => {
  it("reaches only the two read-by-identity view methods: no write, commit, listing, scan, advance, scheduler, clock, randomness, retry or persistence", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(
      /\.commit\b|\.advance\b|\.register\w*|\.establish\w*|\.listFacts\b|\.head\b|\.verify\b|\.close\b|\.save\b|\.load\b|\.write\w*|formObservedPacket|Adapter|Coordinator|CausalDraw|schedul|setTimeout|setInterval|Date\b|Math\.random|performance|\bprocess\b|retry|\bcache\b|localStorage/i,
    );
    expect([...new Set([...src.matchAll(/view\.(\w+)/g)].map((m) => m[1]))].sort()).toEqual([
      "committedGroup",
      "getFact",
    ]);
  });

  it("RC-14: the gateway has one fixed shape — a single early return (a forged handle has no view), then every step runs and one verdict is taken", () => {
    const src = identifiers(MODULE);
    const body = src.slice(src.indexOf("export function readCurrentObservationGlance"));
    expect(body.match(/\breturn\b/g)).toHaveLength(2);
    expect(body).toMatch(/if \(bound === undefined\) return refusal\(\);/);
    expect(body).toMatch(
      /return requestOk && qualified && presented\.ok \? presented : refusal\(\);/,
    );
    // no branch between the reads: each step is individually guarded, none is conditional on an earlier result
    expect(body).not.toMatch(/\bif\b[^;]*\bview\./);
    expect(body.match(/view\.getFact\(/g)).toHaveLength(9);
    expect(body.match(/view\.committedGroup\(/g)).toHaveLength(1);
    expect(src.match(/observationEventViolation\(/g)).toHaveLength(1);
    expect(src.match(/deriveEventSignalProjection\(/g)).toHaveLength(1);
  });

  it("has no enumeration, search, inbox, queue, batch, priority, salience, dedup, replay or history vocabulary", () => {
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /\bfor\b|\bwhile\b|\.map\(|\.filter\(|\.find\(|\.sort\(|\.reduce\(|\.forEach\(|\bObject\.(keys|values|entries)\b|inbox|queue|batch|cursor|ledger|priorit|salien|urgen|dedup|replay|history|latest|\blist\b|\bscan\b|\bsearch\b|\bnext\b/i,
    );
  });

  it("the only module-level state is the private trusted-context registry, a WeakMap holding no campaign data of its own", () => {
    const src = identifiers(MODULE);
    expect(src.match(/^(?:let|var)\s/gm)).toBeNull();
    expect(src.match(/^const \w+ = new \w+/gm)).toEqual(["const playerBindings = new WeakMap"]);
  });

  it("no node built-in, network, filesystem, MCP, HTTP, model or provider library is imported, and no engine, contracts (other than the contract) or testkit module names the read", () => {
    for (const f of [MODULE, CONTRACT])
      for (const spec of specifiersOf(f))
        expect(spec, `${f}: ${spec}`).not.toMatch(
          /^node:|mcp|http|ws|express|fastify|fs|net|sdk|openai|anthropic/i,
        );
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".ts") ? [`${d}/${e.name}`] : [],
      );
    for (const f of [
      ...walk("packages/engine/src"),
      ...walk("packages/contracts/src").filter((x) => x !== CONTRACT),
      ...walk("packages/testkit/src"),
    ])
      expect(code(f), f).not.toMatch(
        /@immortalis\/protocol|readCurrentObservationGlance|bindTrustedCurrentPlayerContext|read_current_observation_glance/,
      );
  });

  it("the operator's observation command is unchanged and still delivers through the causal path only", () => {
    expect(code("packages/operator/src/observation.ts")).not.toMatch(
      /readCurrentObservationGlance|bindTrustedCurrentPlayerContext/,
    );
  });
});

describe("register, lock and gate honesty: nothing moved, and the document claims no more than was built", () => {
  it("no spec snapshot or source pin differs, no register row is PASS/FAIL or mentions this slice, and I-001 / F-014D / F-014B / NPK stay at their lock pins", () => {
    const pin = (id: string) => lock.frozen_sources.find((s) => s.id === id)!.native_pin;
    expect(pin("I-001")).toBe("2026-09-25T00:17:49.551Z");
    expect(pin("F-014D")).toBe("2026-09-24T16:25:17.059Z");
    expect(pin("F-014B")).toBe("2026-09-25T23:42:29.547Z");
    expect(pin("NPK")).toBe("2026-09-25T00:18:32.532Z");
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(
      /current-observation-glance|current observation glance/i,
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

  it("the foundation document states what is and is not claimed and cites the brief, the lock and the retained real-host evidence", () => {
    const doc = readFileSync(DOC, "utf8");
    expect(doc).toContain("3fa20af901e08156b336e15ce388f964");
    expect(doc).toContain("6e14c19bbbb67acc67fa48299bd5c28dfdcf4a5b");
    expect(doc).toMatch(/No PASS acceptance is claimed/);
    expect(doc).toMatch(/mechanism-only/i);
    expect(doc).toMatch(/certifies live-model perception/);
    expect(doc).toMatch(/Independent BLUE .*review remains/);
    expect(doc).toMatch(/OB-030/);
    expect(doc).toContain("docs/evidence/b52-direct-observation-live-host.md");
    expect(doc).toMatch(/authentication is (neither|not)/i);
  });
});
