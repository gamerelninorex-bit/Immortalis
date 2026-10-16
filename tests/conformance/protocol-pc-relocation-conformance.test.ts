// PR #67 H-1 recovery: re-pin the affected event-trigger/strict-boundary implementation; no frozen artifact or gate changes.
// Conformance evidence for the Trusted Confirmed Active-PC Single-Leg Movement Gateway (forty-first bounded slice, IM-15 / IM-16
// over the fortieth-slice PC → Logistics → World-State chain) and its Temporal enrollment (forty-second bounded slice: the same
// transfer's one already-defined Logistics temporal object, registered once through the existing TemporalCoordinator). Governing lock: spec/f027/spec-lock.json (F-027 v1.0 composed with
// F-027-CD1 v1.0), unchanged. No register row, status, source pin, gate or lock moved; this slice adds code, tests and a document
// only. The frozen Active-PC Post-Handover Physical Locus Ownership & Relocation Contract (pin 2026-10-08T01:25:36.611Z) is cited,
// never added to the lock. Authentication, sessions and the confirmation interaction are neither implemented nor claimed. Local
// success is NOT provider/recovery acceptance (IA-07 BLOCKED). PF-6/F-028 stays BLOCKED / NOT ACTIVATED.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gates, lock, register, code } from "../support/f027.ts";
import { protocolIndexExports, PROTOCOL_ONLY_EVENT_SIGNAL_READ } from "../support/protocol.ts";

const MODULE = "packages/protocol/src/pc-relocation.ts";
const CONTRACT = "packages/contracts/src/protocol-relocation.ts";
const DOC = "docs/protocol-pc-relocation-foundation.md";
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
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".ts") ? [`${d}/${e.name}`] : [],
  );

/** Every module the gateway composes or must leave untouched, as it stood at the forty-second base (main d8307d5). */
const UNCHANGED: Record<string, string> = {
  "packages/contracts/src/pc-movement.ts":
    "35c05f1e78aca3c11c32d141dbb43cdc99c71237027ed7dbceea4e3dd048ea10",
  "packages/contracts/src/logistics.ts":
    "44704b92e056bfc4b69896887b5798c15a97c1762301144c4cf790dd06e38382",
  "packages/contracts/src/protocol.ts":
    "426cb9e790b435d75a4f6a1df39c792616310421e17eb953aa2f382ae4370e0c",
  "packages/contracts/src/protocol-causal.ts":
    "a535533b4ae92b71805634bc742627e45bb2223a0311631303b63c211ed588d5",
  "packages/engine/src/pc-movement/derive.ts":
    "636f161378d319702782860ba99f70db62ac37887feb975c188681b05e7bfe15",
  "packages/engine/src/pc-movement/integrity.ts":
    "37d20ecd819d9ac330d17a183e00dbd29f81f697f6b4f6c123b5e893c4cdf0ff",
  "packages/engine/src/world/physical-subject.ts":
    "64b66f00c8efe66eb023cedd24f3f37c25affcbe394a39f8fb723d741a4510c5",
  "packages/engine/src/world/canonical-campaign.ts":
    "18fa5e9ea8c632d7aca468e08ce53e8ee513fe603ef73db9de5aa525f65c214c", // B61-A3 scoped delta (world/canonical-campaign.ts): pinned at the PR #61 head; main da14f15afdd6
  "packages/engine/src/logistics/adapter.ts":
    "e54a7b239bed8fe5f59599566b9888bc854fb7f932ca9ddd650f986aea54e943",
  "packages/engine/src/logistics/derive.ts":
    "96d1ee7fcaa317bcb3ce15e097671bcfebf9bf963f6c8694b15e0a1355ac4fa9",
  "packages/engine/src/logistics/admission.ts":
    "c936d655de7d8518b12b72a1591bd29950ecb619bb8a678777e5fd5a632d4a50",
  "packages/engine/src/logistics/declaration.ts":
    "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
  "packages/engine/src/logistics/locus.ts":
    "c265b8c99bd4f1345a9d8346d258de6149d071d73de0cd05aad26f80a3848038",
  "packages/engine/src/logistics/integrity.ts":
    "cc063bd929644d14d9ff7481f88299629842845beca669cdb0c7078122711c07",
  "packages/engine/src/logistics/provider.ts":
    "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  "packages/engine/src/owners/registry.ts":
    "f2d69980e67aeb7115a3f34f48760a5cba1f3891c73187a7744cc533f210aa98", // B61-A3 scoped delta (owners/registry.ts): pinned at the PR #61 head; main 7ce3421f8847
  "packages/engine/src/temporal/coordinator.ts":
    "afe8c28a662f3c9e1f5329665c6fdf60d724775c389a447be56c7ed7a8e02318",
  "packages/engine/src/projection/event-signal.ts":
    "5fa2712c00ce8ea7df4720d26e1250ff484f6a3475ef156fe3527c514f9a7e47",
  "packages/engine/src/presentation/event-signal.ts":
    "314b6e38bcb0aee7467a3ebb284e55da45ac8f74fcbe82b1157ccd2923970345",
  "packages/protocol/src/event-signal.ts":
    "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
  "packages/protocol/src/causal-event-signal.ts":
    "6b2d56f4953b1c7c0fa073b01b5743f81e8a540f719d9fe110f2740ebdcce3fb",
};

describe("existing owners and predecessors are untouched: the gateway consumes them, never edits or duplicates them", () => {
  it("the PC movement contract, the PC-owned facts, Logistics, World-State custody, the owner registry, the Temporal kernel, IM-13/IM-14 and the two read-only operations are byte-identical to the base, except the B61-A3 scoped deltas (PR #61) pinned at its head", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("no engine module, owner registration or fact kind was added: the whole slice is one protocol module, one contract and tests", () => {
    expect(readdirSync("packages/protocol/src").sort()).toEqual([
      "active-pc-target-advance.ts",
      "causal-event-signal.ts",
      "current-observation-glance.ts",
      "event-signal.ts",
      "index.ts",
      "null-pc-ooc-advance.ts",
      "null-pc-ooc-held-continuation.ts",
      "pc-collection.ts",
      "pc-relocation.ts",
      "pc-transfer-advance.ts",
    ]);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    expect(protocolIndexExports()).toContain('export * from "./pc-relocation.ts";');
    const pkg = JSON.parse(readFileSync("packages/protocol/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@immortalis/contracts": "workspace:*",
      "@immortalis/engine": "workspace:*",
    });
  });

  it("no engine, other contracts or testkit module names the protocol package or the gateway", () => {
    for (const f of [
      ...walk("packages/engine/src"),
      ...walk("packages/contracts/src").filter((x) => x !== CONTRACT),
      ...walk("packages/testkit/src"),
    ])
      expect(code(f), f).not.toMatch(
        /@immortalis\/protocol|commitConfirmedPcRelocation|bindTrustedConfirmedPcRelocationContext/,
      );
  });
});

describe("the module composes the existing owner paths only, and takes no authority from the host", () => {
  it("imports the contracts and the engine only, and from the engine only the Logistics adapter, the existing Temporal coordinator and its helper, and the campaign type", () => {
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
      "LogisticsAdapter",
      "StageProviderRegistry",
      "TemporalCoordinator",
      "logisticsTemporalObject",
      "type CanonicalCampaign",
    ]);
  });

  it("invokes each of the four existing owner publications exactly once, in their ratified order", () => {
    const src = identifiers(MODULE);
    const order = [
      "commitPcVoluntaryMovement(",
      "establishPcMovementRequest(",
      "logistics.commitMovement(",
      "logistics.dispatch(",
    ].map((n) => src.lastIndexOf(n));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const n of ["logistics.commitMovement(", "logistics.dispatch("])
      expect(src.split(n).length - 1, n).toBe(1);
    // the PC-side publications are named in the campaign facade and called once each in the step list
    expect(src.match(/campaign\.commitPcVoluntaryMovement\(/g)).toHaveLength(2);
    expect(src.match(/campaign\.establishPcMovementRequest\(/g)).toHaveLength(2);
  });

  it("registers the transfer's object exactly once, after the dispatch, by the existing helper and coordinator, and hand-writes no object, stage, read or boundary", () => {
    const src = identifiers(MODULE);
    expect(src.match(/\.registerObject\(/g)).toHaveLength(1);
    expect(src.match(/logisticsTemporalObject\(/g)).toHaveLength(1);
    expect(src.match(/new TemporalCoordinator\(/g)).toHaveLength(1);
    expect(src.lastIndexOf("logistics.dispatch(")).toBeLessThan(
      src.indexOf("await enrollTransfer("),
    );
    // the registered object is the helper's, untouched: nothing here spreads, shortens or authors one
    expect(src).not.toMatch(
      /next_boundary|dependencies|continuation|invalidators|information_latency|partition|last_resolved_basis|boundary_id|\.at\b|dependsOn|declares_close|EXACT-PARTITION/,
    );
    // identity is the PC's alone, through the same derived publication shape as the four movement steps
    expect(code(MODULE)).toMatch(/publication\("temporal"\)/);
  });

  it("states no authority itself: the player's role and permission, the canon-write authority and every owner or fact literal are absent", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    expect(src).not.toMatch(
      /PLAYER_CHOICE_AUTHORITY|CANON_WRITE_AUTHORITY|OWNER_|FACET_|\bFACT_KIND|factKind|\bauthored_under:\s*\{|\brole\b|\bpermission\b/,
    );
    // the authored authority is reached only through the existing strict choice schema
    expect(identifiers(MODULE)).toMatch(
      /PcMovementCommitInputSchema\.safeParse\(trusted\.choice\)/,
    );
    expect(code(MODULE)).not.toMatch(/role\.player|permission\.player_choice|role\.archivist/);
  });

  it("derives identities from the canonical PC identity only, and takes the request's parsed value for validation, never for content", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(/parsed\.data|request\./);
    expect(src).toMatch(/choice\.pc_id/);
    expect(src).not.toMatch(
      /Date\b|Math\.random|performance|randomUUID|crypto|counter|Symbol\.for/i,
    );
  });

  it("has no confirmation flag: nothing is called `confirmed` as a field, parameter or default; the binder is the only attestation", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    expect(src).not.toMatch(
      /\bconfirmed\s*[:?=]|\bisConfirmed\b|\bconfirmation\s*[:?=]|\bapproved\b/i,
    );
    // the host-visible schemas carry exactly one field each: the operation name, and the status
    const fieldLists = [...code(CONTRACT).matchAll(/z\.strictObject\(\{([^}]*)\}\)/g)].map((m) =>
      [...m[1]!.matchAll(/^\s*(\w+):/gm)].map((f) => f[1]),
    );
    expect(fieldLists).toEqual([["operation"], ["status"]]);
    expect(readFileSync(CONTRACT, "utf8").match(/export const PROTOCOL_OP_/g)).toHaveLength(1);
  });

  it("neither module nor contract has authentication, credential, token, session, account or tenant vocabulary", () => {
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /\bauth\w*\b|\bcredential\w*\b|\btoken\b|\bsession\b|\baccount\b|\btenant\b|\bpassword\b|\bsecret\b|\bcampaignId\b|\bcampaign_id\b/i,
    );
  });
});

describe("the gateway advances no time, resolves nothing, plans no route and holds no state of its own", () => {
  it("reaches no advance, continuation, time establishment, resolution, scheduler, clock, listing or scan; its one store write is the replay of its own committed registration", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(
      /\.advance\b|continueRemainder|establishCanonicalTime|\.boundaryIndex\b|\.transaction\b|\.listFacts\b|\.head\b|\.verify\b|\.close\b|\.save\b|\.load\b|\.getFact\b|CausalDraw|schedul|setTimeout|setInterval|\bnew Date\b|retry|\bcache\b|localStorage/i,
    );
    expect(src.match(/store\.commit\(/g)).toEqual(["store.commit("]);
    expect(src).toMatch(/store\.commit\(prior\)/);
    expect(src.match(/\.committedGroup\(/g)).toHaveLength(1);
    expect(src).not.toMatch(
      /route|path\w*find|distance|speed|duration|calibrat|carrier|passenger|hazard|obstacle|rollback|cancel|divert/i,
    );
  });

  it("the only module-level state is the private context registry, a WeakMap holding the bound campaign facade and values, never canon data", () => {
    const src = identifiers(MODULE);
    expect(src.match(/^(?:let|var)\s/gm)).toBeNull();
    expect(src.match(/^const \w+ = new \w+/gm)).toEqual(["const bindings = new WeakMap"]);
    expect(src).not.toMatch(/^export (?:const|let|var) /m);
  });

  it("no node built-in, network, filesystem, MCP, HTTP or provider library is imported, and no server or transport file exists", () => {
    for (const f of [MODULE, CONTRACT])
      for (const spec of specifiersOf(f))
        expect(spec, `${f}: ${spec}`).not.toMatch(
          /^node:|mcp|http|ws|express|fastify|fs|net|sdk|openai|anthropic/i,
        );
    expect(identifiers(MODULE)).not.toMatch(
      /\bfetch\b|\brequire\b|\bimport\(|\bfs\b|\bnet\b|\bhttp\w*\b|WebSocket|\bmcp\b|\bendpoint\b|\bserver\b|\bprovider\b/i,
    );
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

  it("the foundation document records the authority, the trust boundary, the sequence, the recovery rule and what is not implemented", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const text of [
      "2026-10-08T04:49:44.583Z",
      "8c7d8c35be143f38080a7b44a439728a8e84d4d0",
      "2026-10-08T01:25:36.611Z",
      "3f320af901e08166ad96ca0fc5e5069d",
      "commit_confirmed_pc_relocation",
      "bindTrustedConfirmedPcRelocationContext",
      "RELOCATION_COMMITTED",
      "RELOCATION_UNAVAILABLE",
      "RELOCATION_OUTCOME_UNKNOWN",
      "Not implemented",
      "2026-10-08T06:07:17.605Z",
      "d8307d513493ea50a2bbc583f1fb4a99ddfcaed1",
      "Temporal enrollment",
      "advances no time",
      "PF-6/F-028",
    ])
      expect(doc, text).toContain(text);
  });
});

describe("register, lock and gate honesty: nothing moved", () => {
  it("no spec snapshot or source pin differs from the predecessor's, and the frozen relocation contract is not a lock pin", () => {
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.frozen_sources.find((s) => s.id === "I-001")!.native_pin).toBe(
      "2026-09-25T00:17:49.551Z",
    );
    expect(lock.frozen_sources.find((s) => s.id === "I-002")!.native_pin).toBe(
      "2026-09-25T00:15:54.536Z",
    );
    expect(JSON.stringify(lock)).not.toContain("3f320af901e08166ad96ca0fc5e5069d");
  });

  it("no register row was promoted or mentions this slice", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(/forty-first|pc-relocation|PcRelocation/);
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
