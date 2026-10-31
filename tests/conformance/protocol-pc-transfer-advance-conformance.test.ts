// PR #67 H-1 recovery: re-pin the affected event-trigger/strict-boundary implementation; no frozen artifact or gate changes.
// Conformance evidence for the Trusted Player-Authorized Active-PC Stop-at-Delivery Temporal Advance Gateway (forty-third bounded
// slice, IM-15 / IM-16 over the existing Temporal kernel and the forty-first/forty-second relocation gateway). Governing lock:
// spec/f027/spec-lock.json (F-027 v1.0 composed with F-027-CD1 v1.0), unchanged. No register row, status, source pin, gate or lock
// moved; this slice adds code, tests and a document only. The frozen Active-PC Post-Handover Physical Locus Ownership & Relocation
// Contract (pin 2026-10-08T01:25:36.611Z) is cited, never added to the lock. Authentication, sessions and the confirmation
// interaction are neither implemented nor claimed. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
// PF-6/F-028 stays BLOCKED / NOT ACTIVATED.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gates, lock, register, code } from "../support/f027.ts";
import { protocolIndexExports, PROTOCOL_ONLY_EVENT_SIGNAL_READ } from "../support/protocol.ts";
import { expectNotALockPin } from "../support/lock.ts";

const MODULE = "packages/protocol/src/pc-transfer-advance.ts";
const CONTRACT = "packages/contracts/src/protocol-advance.ts";
const DOC = "docs/protocol-pc-transfer-advance-foundation.md";
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

/** Every module the gateway composes or must leave untouched, as it stood at the forty-third base (main 767f904). */
// Not listed here, on purpose: every source file PR #94 changed after this suite's base (spec/f027/spec-lock.json, packages/engine/src/owners/registry.ts
// and the other files named in tests/support/historical-pin-inventory.ts). "Byte-identical to the base" is no longer true of them, so the base's
// values are kept there as history (with their commit) and today's only in tests/support/present-day-identities.ts, never in this map.
const UNCHANGED: Record<string, string> = {
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/contracts/src/pc-movement.ts":
    "35c05f1e78aca3c11c32d141dbb43cdc99c71237027ed7dbceea4e3dd048ea10",
  "packages/contracts/src/logistics.ts":
    "2030cb9ad580464eebd52ec26d44fd8dfdddeb5e75fe171db69db3b881786df1",
  "packages/contracts/src/protocol-relocation.ts":
    "9251e5f50811651f1f0973dd20f2c2b36af08094f32346d0a4f51fdd552e773d",
  "packages/contracts/src/protocol.ts":
    "426cb9e790b435d75a4f6a1df39c792616310421e17eb953aa2f382ae4370e0c",
  "packages/contracts/src/protocol-causal.ts":
    "a535533b4ae92b71805634bc742627e45bb2223a0311631303b63c211ed588d5",
  "packages/engine/src/temporal/admission.ts":
    "7e079c4df4b756b741d04241f752d9c68ce12a6aa9938204d7afeee6f9b03b67",
  "packages/engine/src/temporal/graph.ts":
    "0c1eea854f40f176de165d8f62979fe3f4c8c87055b6def6996aa1b01dd8b124",
  "packages/engine/src/temporal/identity.ts":
    "8319d33aa9a5e0f15055600ec9aad3d9422adfe31e84a5c6d9c71cbfbc777c34",
  "packages/engine/src/temporal/integrity.ts":
    "8e0be8a4635d3827ee65a8388844b512c8fd2413f89cb254cb560e5e90d52918",
  "packages/engine/src/temporal/partition.ts":
    "000880a1d0daab2a3d994b80cbd76f75ecfc9edd7108273b321129ce7ea7d84a",
  "packages/engine/src/temporal/providers.ts":
    "8c0813fef2fa6f47d0da64fd698d107e58edbf7bee8708feeff22b94f4001841",
  "packages/engine/src/temporal/coordinator.ts":
    "5bdbc6cbf4cb4cc9a01f11f009ecc0767ac75d0e8373974ed09bd465a8febdd1",
  "packages/engine/src/world/entity-transition-provider.ts":
    "8fa5792dc8fd4f46e9ac4d0a3d54678a8eef7d3d8370921622d8a3ff8ea5b49a",
  "packages/engine/src/world/entity-transition.ts":
    "6eba3057099b2d331e4f846498bb9d3f6275fdabf1c76c23ed267795aa809e2b",
  "packages/engine/src/logistics/adapter.ts":
    "7e3517fdb0b0657fe26a56544a7b3e5751085d8b10e349172bf812aec28ed031",
  "packages/engine/src/logistics/declaration.ts":
    "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
  "packages/engine/src/logistics/derive.ts":
    "fb9e3e55e9549c9048f2aabae36e3c622245efb0d82bb62b1348f91bd5b5a6f4",
  "packages/engine/src/logistics/provider.ts":
    "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  "packages/engine/src/logistics/locus.ts":
    "c265b8c99bd4f1345a9d8346d258de6149d071d73de0cd05aad26f80a3848038",
  "packages/protocol/src/pc-relocation.ts":
    "fd383cd4a49037233e357dcc4f2f566472f4c6a6083efe16cdbf3946fb30614a",
  "packages/protocol/src/event-signal.ts":
    "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
  "packages/protocol/src/causal-event-signal.ts":
    "6b2d56f4953b1c7c0fa073b01b5743f81e8a540f719d9fe110f2740ebdcce3fb",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
};

describe("existing owners, the Temporal kernel, the relocation gateway and the frozen artifacts are untouched: the gateway consumes them, never edits or duplicates them", () => {
  it("the Temporal kernel and schemas, Logistics, World-State custody and ECT-01, the relocation gateway, IM-13/IM-14 and the frozen F-027 snapshot artifacts (not the lock or the owner registry, which F-027 v0.8 changed on purpose) are byte-identical to the base, except the B61-A3 scoped deltas (PR #61) pinned at its head (except the source files PR #94 changed after this base, recorded as history in tests/support/historical-pin-inventory.ts and not compared with the working tree)", () => {
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
      "pc-corridor-relocation.ts",
      "pc-relocation.ts",
      "pc-transfer-advance.ts",
    ]);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    expect(protocolIndexExports()).toContain('export * from "./pc-transfer-advance.ts";');
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
        /@immortalis\/protocol|advanceConfirmedPcTransferToDelivery|bindTrustedConfirmedPcTransferAdvanceContext/,
      );
  });

  it("the protocol module reaches no testkit, fixture or test support: no fixture is a production source of authority", () => {
    for (const f of [MODULE, CONTRACT]) {
      expect(
        specifiersOf(f).every((s) => !/testkit|fixture|tests\//i.test(s)),
        f,
      ).toBe(true);
      expect(code(f), f).not.toMatch(/SYNTH|FIXTURE|fixture|testkit/);
    }
  });
});

describe("the module composes the existing kernel and owner providers only, and takes no authority or time from the host", () => {
  it("imports the contracts and the engine only, and from the engine only the Logistics adapter, the existing Temporal coordinator and registry, the four real stage providers, the canonical equality, the existing helper and the campaign type", () => {
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
      "canonicalEqual",
      "gipSunsetExpiryProvider",
      "logisticsDeliveryProvider",
      "logisticsRetirementProvider",
      "logisticsTemporalObject",
      "type CanonicalCampaign",
      "worldEntityTransitionProvider",
    ]);
  });

  it("registers exactly the real owner providers of the existing delivery chain and GIP's own sunset expiry, and no other", () => {
    const src = identifiers(MODULE);
    expect(src.match(/new StageProviderRegistry\(/g)).toHaveLength(1);
    expect(src.match(/new TemporalCoordinator\(/g)).toHaveLength(1);
    expect(src).toMatch(
      /new StageProviderRegistry\(\[\s*worldEntityTransitionProvider,\s*logisticsDeliveryProvider,\s*logisticsRetirementProvider,\s*gipSunsetExpiryProvider,\s*\]\)/,
    );
  });

  it("drives the one existing advance exactly once, with no target, only the derived or held continuation and the existing stop condition, and reaches no other kernel entry", () => {
    const src = identifiers(MODULE);
    expect(src.match(/\.advance\(/g)).toHaveLength(1);
    expect(src).not.toMatch(
      /continueRemainder|establishCanonicalTime|registerObject|\.listFacts\b|\.verify\b|\.close\b|\.save\b|\.load\b|\.commit\(|\.committedGroup\(|\.lookupReceipt\(/,
    );
    const call = readFileSync(MODULE, "utf8").match(
      /coordinator\.advance\(\{[\s\S]*?\}\s*satisfies ResolutionRequest\)/,
    )![0];
    expect(call).toContain("continues,");
    expect(call).toContain("requested,");
    expect(src).toMatch(/const requested = \{ target: null, condition \} as const/);
    expect(src).toMatch(/const condition = \{ kind: "", \.\.\.own \} as const/);
    expect(readFileSync(MODULE, "utf8")).toContain('kind: "STOP_AFTER_BOUNDARY"');
    expect(identifiers(MODULE).match(/\btarget\b/g)).toHaveLength(1);
  });

  it("states no authority itself: the player's role and permission, the canon-write authority and every owner or fact literal are absent", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    expect(src).not.toMatch(
      /PLAYER_CHOICE_AUTHORITY|CANON_WRITE_AUTHORITY|OWNER_(?!LOGISTICS)|FACET_|\bFACT_KIND|factKind|\bauthored_under:\s*\{|\brole\b|\bpermission\b/,
    );
    expect(code(MODULE)).not.toMatch(/role\.player|permission\.player_choice|role\.archivist/);
    // the authored role and permission are reached only through the existing strict request schema
    expect(identifiers(MODULE)).toMatch(/ResolutionRequestSchema\.pick\(/);
    expect(identifiers(MODULE)).toMatch(
      /AdvanceTransactionSchema\.safeParse\(trusted\.transaction\)/,
    );
  });

  it("takes the request's parsed value for validation, never for content, and owns no clock, counter, random or retry state", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(/parsed\.data|(?<![.\w])request\./);
    expect(src).not.toMatch(
      /Date\b|Math\.random|performance|randomUUID|crypto|counter|Symbol\.for|setTimeout|setInterval|schedul|retry|\bcache\b|localStorage/i,
    );
    // time is only ever READ from committed state (comparisons); no time is authored, constructed or supplied here
    expect(src).not.toMatch(/\bcanonical_time\b|\bat\s*:|\bunit\s*:|\bvalue\s*:/);
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

describe("the gateway invents no time, route, journey or presentation and holds no state of its own", () => {
  it("plans no route and reaches no travel, distance, speed, capacity, cancellation, perception, narration or knowledge vocabulary", () => {
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /route|path\w*find|distance|speed|duration|calibrat|carrier|passenger|hazard|obstacle|rollback|cancel|divert|reroute|percept|narrat|recogni|\bknow\w*|presentation|projection/i,
    );
  });

  it("the only module-level state is the private context registry, a WeakMap holding the bound campaign facade and values, and a constant set of ambiguous store codes, never canon data", () => {
    const src = identifiers(MODULE);
    expect(src.match(/^(?:let|var)\s/gm)).toBeNull();
    expect(src.match(/^const \w+ = new \w+/gm)).toEqual([
      "const bindings = new WeakMap",
      "const AMBIGUOUS = new Set",
    ]);
    expect(src).not.toMatch(/^export (?:const|let|var) /m);
  });

  it("no node built-in, network, filesystem, MCP, HTTP or provider library is imported, and no server or transport file exists", () => {
    for (const f of [MODULE, CONTRACT])
      for (const spec of specifiersOf(f))
        expect(spec, `${f}: ${spec}`).not.toMatch(
          /^node:|mcp|http|ws|express|fastify|fs|net|sdk|openai|anthropic/i,
        );
    expect(identifiers(MODULE)).not.toMatch(
      /\bfetch\b|\brequire\b|\bimport\(|\bfs\b|\bnet\b|\bhttp\w*\b|WebSocket|\bmcp\b|\bendpoint\b|\bserver\b|\bprovider\b(?<!Provider)/i,
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

  it("the foundation document records the authority, the trust boundary, the literal request, the recovery rule, the stop-reason decision and what is not implemented", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const text of [
      "2026-10-08T07:04:05.128Z",
      "767f904b1934a318edbde97a174259be1e866a32",
      "3f320af901e081cb8068e876fa48e621",
      "2026-10-08T01:25:36.611Z",
      "advance_confirmed_pc_transfer_to_delivery",
      "bindTrustedConfirmedPcTransferAdvanceContext",
      "ADVANCE_COMMITTED",
      "ADVANCE_UNAVAILABLE",
      "ADVANCE_OUTCOME_UNKNOWN",
      "STOP_AFTER_BOUNDARY",
      "TemporalCoordinator.advance",
      "Not implemented",
      "Residuals",
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
    expect(lock.snapshot_files["spec/f027/acceptance-register.yaml"]).toBe(
      "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
    );
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.frozen_sources.find((s) => s.id === "F-014B")!.native_pin).toBe(
      "2026-09-25T23:42:29.547Z",
    );
    expect(lock.frozen_sources.find((s) => s.id === "I-001")!.native_pin).toBe(
      "2026-09-25T00:17:49.551Z",
    );
    expectNotALockPin(lock, "3f320af901e08166ad96ca0fc5e5069d");
  });

  it("no register row was promoted or mentions this slice", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(
      /forty-third|pc-transfer-advance|PcTransferAdvance/,
    );
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
