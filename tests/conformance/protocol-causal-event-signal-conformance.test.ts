// Conformance evidence for the Trusted-Causal Active-PC Event-Signal Delivery Foundation (thirty-eighth bounded slice, IM-15 /
// IM-16 over IM-13 → IM-14 / RC-14). Governing lock: spec/f027/spec-lock.json (F-027 v1.0 composed with F-027-CD1 v1.0). No
// register row, status, source pin, gate or lock moved; this slice adds tests and code only. Authentication is neither
// implemented nor claimed. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gates, lock, register, code } from "../support/f027.ts";

const MODULE = "packages/protocol/src/causal-event-signal.ts";
const CONTRACT = "packages/contracts/src/protocol-causal.ts";
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

describe("existing path and predecessors are untouched: the operation consumes them, never edits or duplicates them", () => {
  it("IM-13, IM-14 and their contracts are byte-identical to PR #37 / #38, and the PR #39 operation and contract to PR #39", () => {
    expect(sha("packages/engine/src/projection/event-signal.ts")).toBe(
      "5fa2712c00ce8ea7df4720d26e1250ff484f6a3475ef156fe3527c514f9a7e47",
    );
    expect(sha("packages/engine/src/presentation/event-signal.ts")).toBe(
      "314b6e38bcb0aee7467a3ebb284e55da45ac8f74fcbe82b1157ccd2923970345",
    );
    expect(sha("packages/contracts/src/projection.ts")).toBe(
      "17e0c6288e6834f7f064014d1e90b6563f95268c89acabad621dbed318fce6c1",
    );
    expect(sha("packages/contracts/src/presentation.ts")).toBe(
      "837c65d6b43182fd8ff165079105b9f800ee413bade527fba32d34d4c96af5fa",
    );
    expect(sha("packages/protocol/src/event-signal.ts")).toBe(
      "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
    );
    expect(sha("packages/contracts/src/protocol.ts")).toBe(
      "426cb9e790b435d75a4f6a1df39c792616310421e17eb953aa2f382ae4370e0c",
    );
  });

  it("the protocol package is exactly the index and the two operation modules, with the same dependencies", () => {
    expect(readdirSync("packages/protocol/src").sort()).toEqual([
      "active-pc-target-advance.ts",
      "causal-event-signal.ts",
      "current-observation-glance.ts",
      "event-signal.ts",
      "index.ts",
      "null-pc-ooc-advance.ts",
      "null-pc-ooc-held-continuation.ts",
      "pc-collection.ts",
      "pc-corridor-relocation.ts",
      "pc-relocation.ts",
      "pc-transfer-advance.ts",
    ]);
    const pkg = JSON.parse(readFileSync("packages/protocol/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@immortalis/contracts": "workspace:*",
      "@immortalis/engine": "workspace:*",
    });
  });
});

describe("the module composes the existing path only, and takes no authority from the host", () => {
  it("imports the contracts and the engine only, and from the engine only the existing projection, presentation and view type", () => {
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
    ).toEqual(["deriveEventSignalProjection", "presentEventSignal", "type ProjectionStateView"]);
  });

  it("calls the projection once and the presenter once, constructing no presentation, projection or fact itself", () => {
    const src = identifiers(MODULE);
    expect(src.match(/deriveEventSignalProjection\(/g)).toHaveLength(1);
    expect(src.match(/presentEventSignal\(/g)).toHaveLength(1);
    expect(src).not.toMatch(
      /EventSignalPresentationSchema|EventSignalProjectionSchema|PRESENTATION_NPK|PROJECTION_EVENT_SIGNAL|element|elements|viewpoint|provenance|accessPacket|accessEvent|OWNER_|isPcRecipientEvent|recipientBoundary|TemporalState/,
    );
  });

  it("the event identity comes only from the trusted binding: the parsed request is used for validation, never read", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(/parsed\.data|request\./);
    expect(src).toMatch(/event_id: bound\.event_id/);
    expect(src).toMatch(/recipient_id: bound\.recipient_id/);
  });

  it("neither module nor contract has authentication, credential, token, session, account or tenant vocabulary, and the contract has no field but the operation", () => {
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /\bauth\w*\b|\bcredential\w*\b|\btoken\b|\bsession\b|\baccount\b|\btenant\b|\bpassword\b|\bsecret\b|\bpermissions?\b|\bcampaignId\b|\bcampaign_id\b/i,
    );
    expect(identifiers(CONTRACT)).not.toMatch(
      /event_id|eventId|campaign|recipient|role|permission|viewpoint|binding|source|provenance|path|key\b/i,
    );
    expect(readFileSync(CONTRACT, "utf8").match(/export const PROTOCOL_OP_/g)).toHaveLength(1);
  });
});

describe("the operation is read-only, causally inert and has no discovery or multiplicity surface", () => {
  it("reaches only the two read-by-identity view methods: no write, commit, listing, scan, advance, scheduler, clock, randomness, retry or persistence", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(
      /\.commit\b|\.advance\b|\.register\w*|\.establish\w*|\.listFacts\b|\.head\b|\.verify\b|\.close\b|\.save\b|\.load\b|\.write\w*|CausalDraw|schedul|setTimeout|setInterval|Date\b|Math\.random|performance|\bprocess\b|retry|\bcache\b|localStorage/i,
    );
    expect([...src.matchAll(/view\.(\w+)/g)].map((m) => m[1]).sort()).toEqual([
      "committedGroup",
      "getFact",
    ]);
  });

  it("has no enumeration, search, inbox, queue, batch, order, priority, salience, dedup or replay vocabulary", () => {
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /\bfor\b|\bwhile\b|\.map\(|\.filter\(|\.find\(|\.sort\(|\.reduce\(|\.forEach\(|\bObject\.(keys|values|entries)\b|inbox|queue|batch|index|cursor|ledger|priorit|salien|urgen|dedup|replay|history|latest|\blist\b|\bscan\b|\bsearch\b|\bnext\b/i,
    );
  });

  it("the only module-level state is the private causal context registry, a WeakMap holding no campaign data of its own", () => {
    const src = identifiers(MODULE);
    expect(src.match(/^(?:let|var)\s/gm)).toBeNull();
    expect(src.match(/^const \w+ = new \w+/gm)).toEqual(["const causalBindings = new WeakMap"]);
  });

  it("no node built-in, network, filesystem, MCP, HTTP or provider library is imported", () => {
    for (const f of [MODULE, CONTRACT])
      for (const spec of specifiersOf(f))
        expect(spec, `${f}: ${spec}`).not.toMatch(
          /^node:|mcp|http|ws|express|fastify|fs|net|sdk|openai|anthropic/i,
        );
  });

  it("no engine, contracts (other than the contract itself) or testkit module names the protocol package or its operation", () => {
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
        /@immortalis\/protocol|deliverCausalEventSignalPresentation|bindTrustedCausalEventSignalContext/,
      );
  });
});

describe("register, lock and gate honesty: nothing moved", () => {
  it("no spec snapshot or source pin differs from the predecessor's, and no register row is PASS/FAIL or mentions this slice", () => {
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.frozen_sources.find((s) => s.id === "NPK")!.native_pin).toBe(
      "2026-09-25T00:18:32.532Z",
    );
    expect(lock.frozen_sources.find((s) => s.id === "I-001")!.native_pin).toBe(
      "2026-09-25T00:17:49.551Z",
    );
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(/thirty-eighth|causal-event-signal/);
  });

  it("every open gate stays at its recorded status; PF-6/F-028, provider, deployment and migration stay inactive", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
  });
});
