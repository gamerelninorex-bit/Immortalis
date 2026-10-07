// Conformance evidence for the Trusted-Context Active-PC Event-Signal Protocol Read Foundation (thirty-seventh bounded slice,
// IM-15 / IM-16 over IM-13 → IM-14 / RC-14). Each block names its register ID; governing lock: spec/f027/spec-lock.json (F-027
// v1.0 composed with F-027-CD1 v1.0). IA-18 / IA-19 / IA-20 / IA-21 / IA-28 keep their statuses (see `partial_evidence`): this
// slice covers only the one operation it names, no status or gate moved. Authentication is neither implemented nor claimed.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as protocol from "@immortalis/protocol";
import { code, gates, lock, register } from "../support/f027.ts";
import { protocolIndexExports, PROTOCOL_ONLY_EVENT_SIGNAL_READ } from "../support/protocol.ts";

const MODULE = "packages/protocol/src/event-signal.ts";
const CONTRACT = "packages/contracts/src/protocol.ts";
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

const SLICE_TESTS = [
  "tests/contract/protocol-event-signal-schemas.test.ts",
  "tests/unit/protocol-event-signal.test.ts",
  "tests/integration/protocol-event-signal.test.ts",
  "tests/security/protocol-event-signal-security.test.ts",
  "tests/conformance/protocol-event-signal-conformance.test.ts",
];

describe("IA-01 source/version fidelity (protocol read aspect)", () => {
  it("IM-15 / IM-16 are in the frozen Runtime Contract; its snapshot and the open-gates snapshot are byte-identical to the predecessor's", () => {
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    const rc = readFileSync("spec/f027/runtime-contract.md", "utf8");
    expect(rc).toMatch(/IM-15 Host Protocol Gateway/);
    expect(rc).toMatch(/IM-16 Security \/ Campaign-Isolation Boundary/);
  });

  it("no source pin moved: the NPK and I-001 pins are those the predecessor path was built on", () => {
    expect(lock.frozen_sources.find((s) => s.id === "NPK")!.native_pin).toBe(
      "2026-09-25T00:18:32.532Z",
    );
    expect(lock.frozen_sources.find((s) => s.id === "I-001")!.native_pin).toBe(
      "2026-09-25T00:17:49.551Z",
    );
  });
});

describe("IA-03 owner exclusivity: the protocol adds no owner, facet, key space, fact kind, adapter or writer", () => {
  it("the existing IM-13 projection and IM-14 presentation (modules and contracts) are byte-identical to PR #37 / #38: the operation consumes them, never edits or duplicates them", () => {
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
  });

  it("the protocol package is two modules, re-exports exactly the one, and depends on the contracts and engine only", () => {
    expect(readdirSync("packages/protocol/src").sort()).toEqual(["event-signal.ts", "index.ts"]);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    const pkg = JSON.parse(readFileSync("packages/protocol/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@immortalis/contracts": "workspace:*",
      "@immortalis/engine": "workspace:*",
    });
    expect(Object.keys(protocol).sort()).toEqual([
      "bindTrustedEventSignalContext",
      "readCurrentEventSignalPresentation",
    ]);
  });

  it("no engine, contracts or testkit module names the protocol package or its operation", () => {
    const walk = (d: string): string[] =>
      readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".ts") ? [`${d}/${e.name}`] : [],
      );
    for (const f of [
      ...walk("packages/engine/src"),
      ...walk("packages/contracts/src"),
      ...walk("packages/testkit/src"),
    ])
      expect(code(f), f).not.toMatch(
        /@immortalis\/protocol|readCurrentEventSignalPresentation|bindTrustedEventSignalContext/,
      );
  });
});

describe("IA-18 / IA-28 the operation derives no authority from the host and invents no role, permission or authentication", () => {
  it("the module imports only the contracts and the engine, and from the engine only the existing projection, presentation and view type", () => {
    const specs = specifiersOf(MODULE);
    expect(specs.sort()).toEqual(["@immortalis/contracts", "@immortalis/engine"]);
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

  it("the module has no authentication, credential, token, session, account, tenant, role or permission vocabulary", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    expect(src).not.toMatch(
      /\bauth\w*\b|\bcredential\w*\b|\btoken\b|\bsession\b|\baccount\b|\btenant\b|\bpassword\b|\bsecret\b|\broles?\b|\bpermissions?\b|\bcampaignId\b|\bcampaign_id\b/i,
    );
  });

  it("the module composes the existing path and constructs no presentation, projection or fact itself", () => {
    const src = identifiers(MODULE);
    expect(src).toMatch(/deriveEventSignalProjection\(/);
    expect(src).toMatch(/presentEventSignal\(/);
    expect(src).not.toMatch(
      /EventSignalPresentationSchema|EventSignalProjectionSchema|PRESENTATION_NPK|PROJECTION_EVENT_SIGNAL|element|elements|viewpoint|provenance|accessPacket|accessEvent|OWNER_|isPcRecipientEvent|recipientBoundary|TemporalState/,
    );
  });
});

describe("IA-21 the operation is read-only and causally inert", () => {
  it("the module reaches only the two read-by-identity view methods: no write, commit, listing, advance, scheduler, Causal Draw, clock, randomness, timer, retry or persistence", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(
      /\.commit\b|\.advance\b|\.register\w*|\.establish\w*|\.listFacts\b|\.head\b|\.verify\b|\.close\b|\.save\b|\.load\b|\.write\w*|CausalDraw|causal|schedul|setTimeout|setInterval|Date\b|Math\.random|performance|\bprocess\b|retry|\bcache\b|localStorage/i,
    );
    expect([...src.matchAll(/view\.(\w+)/g)].map((m) => m[1]).sort()).toEqual([
      "committedGroup",
      "getFact",
    ]);
  });

  it("the only module-level state is the private context registry, a WeakMap holding no campaign data of its own", () => {
    const lets = identifiers(MODULE).match(/^(?:let|var)\s/gm);
    expect(lets).toBeNull();
    expect(identifiers(MODULE).match(/^const \w+ = new \w+/gm)).toEqual([
      "const bindings = new WeakMap",
    ]);
  });
});

describe("IM-15 transport and provider neutrality: no host transport, server, deployment, provider, filesystem or network surface", () => {
  it("the module and contract import no node built-in, network, filesystem, MCP, HTTP or provider library", () => {
    for (const f of [MODULE, CONTRACT])
      for (const spec of specifiersOf(f))
        expect(spec, `${f}: ${spec}`).not.toMatch(
          /^node:|mcp|http|ws|express|fastify|fs|net|sdk|openai|anthropic/i,
        );
    expect(identifiers(MODULE)).not.toMatch(
      /\bfetch\b|\brequire\b|\bimport\(|\bfs\b|\bnet\b|\bhttp\w*\b|WebSocket|\bmcp\b|\bendpoint\b|\bserver\b|\bprovider\b/i,
    );
  });

  it("no MCP/HTTP/WebSocket package, server entrypoint, migration manifest, deployment or provider file was added", () => {
    for (const absent of [
      "packages/mcp",
      "packages/server",
      "packages/protocol/src/server.ts",
      "packages/protocol/src/mcp.ts",
      "packages/protocol/src/http.ts",
      "packages/protocol/src/auth.ts",
      "migrations/manifests/protocol.json",
      "Dockerfile",
    ])
      expect(existsSync(absent), absent).toBe(false);
  });
});

describe("scope: nothing outside the bounded slice was implemented", () => {
  it("exactly one allowlisted operation name exists, and the request contract carries no authority, source or path field", () => {
    const src = readFileSync(CONTRACT, "utf8");
    expect(src.match(/export const PROTOCOL_OP_/g)).toHaveLength(1);
    expect(identifiers(CONTRACT)).not.toMatch(
      /campaign|recipient|role|permission|viewpoint|binding|source|provenance|path|key\b/i,
    );
  });
});

describe("acceptance-register and open-gate honesty", () => {
  it("no row was promoted: nothing is PASS/FAIL", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
  });

  it("IA-18 / IA-19 / IA-20 / IA-21 gained narrowly scoped partial evidence and stayed NOT_IMPLEMENTED with no full evidence", () => {
    for (const id of ["IA-18", "IA-19", "IA-20", "IA-21"]) {
      const row = register.find((r) => r.id === id)!;
      expect(row.status, id).toBe("NOT_IMPLEMENTED");
      expect(row.evidence, id).toBeNull();
      const scope = row.partial_evidence!.scope;
      expect(scope, id).toMatch(/thirty-seventh slice/);
      expect(scope, id).toMatch(/exactly one allowlisted, read-only protocol operation/);
      expect(scope, id).toMatch(/authentication[^.]*NOT modelled, implemented or claimed/);
      expect(scope, id).toMatch(/so the row stays NOT_IMPLEMENTED/);
      expect(row.partial_evidence!.tests, id).toEqual(SLICE_TESTS);
    }
    expect(register.find((r) => r.id === "IA-19")!.partial_evidence!.scope).toMatch(
      /NOT a claim that authentication, session, tenant or full campaign isolation is complete/,
    );
  });

  it("IA-28 stays BLOCKED with its earlier partial evidence kept and the new evidence added narrowly; IA-17 gained lineage only", () => {
    const ia28 = register.find((r) => r.id === "IA-28")!;
    expect(ia28.status).toBe("BLOCKED");
    expect(ia28.evidence).toBeNull();
    expect(ia28.partial_evidence!.scope).toMatch(
      /The caller is trusted engine code: no authentication exists/,
    );
    expect(ia28.partial_evidence!.scope).toMatch(/no new role or permission was introduced/);
    expect(ia28.partial_evidence!.tests).toEqual(
      expect.arrayContaining(["tests/unit/owner-admission.test.ts", ...SLICE_TESTS]),
    );
    const ia17 = register.find((r) => r.id === "IA-17")!;
    expect(ia17.status).toBe("NOT_IMPLEMENTED");
    expect(ia17.evidence).toBeNull();
    expect(ia17.partial_evidence!.tests).toContain(
      "tests/integration/protocol-event-signal.test.ts",
    );
    for (const row of [ia28, ia17])
      for (const t of row.partial_evidence!.tests) expect(existsSync(t), t).toBe(true);
    for (const t of SLICE_TESTS) expect(existsSync(t), t).toBe(true);
  });

  it("every open gate stays at its recorded status; PF-6/F-028, provider, deployment and migration stay inactive; IA-07/IA-24/IA-27 stay BLOCKED", () => {
    const statusOf = (id: string) => gates.find((g) => g.id === id)?.status;
    expect(statusOf("PF-6/F-028")).toBe("NOT_ACTIVATED_BLOCKED");
    expect(statusOf("PROVIDER")).toBe("NOT_ADOPTED");
    expect(statusOf("DEPLOYMENT")).toBe("NOT_ACTIVATED");
    expect(statusOf("MIG-01..MIG-10")).toBe("DECLARATIVE_ONLY");
    expect(statusOf("OB-016")).toBe("OPEN_CODE_ERA_CONFORMANCE");
    for (const id of ["IA-07", "IA-24", "IA-27"])
      expect(register.find((r) => r.id === id)?.status).toBe("BLOCKED");
  });
});
