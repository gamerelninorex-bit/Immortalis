// Conformance evidence for the Trusted Confirmed Active-PC Corridor-Qualified Relocation Gateway (IM-15 / IM-16 over the existing
// post-handover PC → Logistics → World-State chain and the World-State corridor read of PR #82). Authority: the BLUE v5.2-A1 bounded
// implementation brief (native pin 2026-10-22T16:13:49.400Z) on main 3b06e6591303e72ee7523555dc08d13c4c9c7d5b. Governing lock:
// spec/f027/spec-lock.json (F-027 v1.0), unchanged. The slice adds one protocol module, one host-visible contract, the narrowing of ONE
// Logistics derivation refusal, tests and a document: no owner, facet, fact kind, source pin, gate, status, temporal coordinator,
// delivery/retirement stage, entity-transition module, Logistics stage provider or PC-movement owner path moved. The frozen
// Post-Handover contract (pin 2026-10-08T01:25:36.611Z) is cited, never added to the lock. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED). PF-6/F-028 stays BLOCKED / NOT ACTIVATED.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { code, gates, lock, register } from "../support/f027.ts";
import { protocolIndexExports, PROTOCOL_ONLY_EVENT_SIGNAL_READ } from "../support/protocol.ts";
import { expectNotALockPin } from "../support/lock.ts";

const MODULE = "packages/protocol/src/pc-corridor-relocation.ts";
const CONTRACT = "packages/contracts/src/protocol-corridor-relocation.ts";
const DOC = "docs/protocol-pc-corridor-relocation-foundation.md";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const gitBlob = (file: string) => {
  const body = readFileSync(file);
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${body.length}\0`), body]))
    .digest("hex");
};
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
/** The text of one top-level function of the module, by its declaration to the next top-level declaration. */
const bodyOf = (file: string, from: string, to: string): string => {
  const src = identifiers(file);
  return src.slice(src.indexOf(from), src.indexOf(to));
};

/** Everything the slice composes or must leave untouched, exactly as it stood at main 3b06e6591303e72ee7523555dc08d13c4c9c7d5b. */
const UNCHANGED: Record<string, string> = {
  "packages/protocol/src/pc-relocation.ts":
    "fd383cd4a49037233e357dcc4f2f566472f4c6a6083efe16cdbf3946fb30614a",
  "packages/contracts/src/protocol-relocation.ts":
    "9251e5f50811651f1f0973dd20f2c2b36af08094f32346d0a4f51fdd552e773d",
  "packages/contracts/src/logistics.ts":
    "2030cb9ad580464eebd52ec26d44fd8dfdddeb5e75fe171db69db3b881786df1",
  "packages/contracts/src/world-corridor.ts":
    "931b7494f3566495d9397f3a35558e8d92bfd90ba148b717d26dcf542abc83e7",
  "packages/contracts/src/pc-movement.ts":
    "35c05f1e78aca3c11c32d141dbb43cdc99c71237027ed7dbceea4e3dd048ea10",
  "packages/engine/src/logistics/adapter.ts":
    "7e3517fdb0b0657fe26a56544a7b3e5751085d8b10e349172bf812aec28ed031",
  "packages/engine/src/logistics/admission.ts":
    "3c3c1a577e274139c26c266781ac2839e7123b76e545d24fcceb4b798df67bcd",
  "packages/engine/src/logistics/integrity.ts":
    "4eb298089ebfd930f40d80a1ea6fb433bfc4308f7aef2454c469f1ae773f1fef",
  "packages/engine/src/logistics/locus.ts":
    "c265b8c99bd4f1345a9d8346d258de6149d071d73de0cd05aad26f80a3848038",
  "packages/engine/src/logistics/provider.ts":
    "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  "packages/engine/src/logistics/declaration.ts":
    "275092dad76b75a328ad35462cbce3fab272c9e76f450c6aac322ccb6c2e18a3",
  "packages/engine/src/world/corridor.ts":
    "e442abfca8f34cb07d64dc152b96bc40dd590278b3bb0fe304d78f7686f3b18b",
  "packages/engine/src/world/canonical-campaign.ts":
    "4bfaf68c1383e6cddbed6cb3028d06ef9c0a3cccc26a40f0dbfbac15ec575090",
  "packages/engine/src/owners/registry.ts":
    "926aa1af36d783ef3760524ad36f3ebc6994f906bf9861bbbdc1e1adb8d97116",
  "packages/engine/src/temporal/coordinator.ts":
    "5bdbc6cbf4cb4cc9a01f11f009ecc0767ac75d0e8373974ed09bd465a8febdd1",
  "packages/engine/src/pc-movement/derive.ts":
    "636f161378d319702782860ba99f70db62ac37887feb975c188681b05e7bfe15",
  "packages/engine/src/pc-movement/integrity.ts":
    "37d20ecd819d9ac330d17a183e00dbd29f81f697f6b4f6c123b5e893c4cdf0ff",
  "packages/engine/src/world/physical-subject.ts":
    "64b66f00c8efe66eb023cedd24f3f37c25affcbe394a39f8fb723d741a4510c5",
  "packages/engine/src/world/entity-transition.ts":
    "6eba3057099b2d331e4f846498bb9d3f6275fdabf1c76c23ed267795aa809e2b",
  "packages/engine/src/world/pc-locus-custody.ts":
    "d54ee795a20712fc64f01c85a86d9de602e87a161b21af35c6610bcbb006ab9f",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
};

/** The one engine file this slice edits: the Logistics derivation whose active-PC corridor refusal is narrowed. */
const DERIVE = "packages/engine/src/logistics/derive.ts";
const DERIVE_AT_SLICE_HEAD = "fb9e3e55e9549c9048f2aabae36e3c622245efb0d82bb62b1348f91bd5b5a6f4";

describe("existing owners and predecessors are untouched: the gateway consumes them, never edits or duplicates them", () => {
  it("the sibling gateway, its contract, the PC movement owner path, Logistics' adapter/admission/integrity, World-State custody, the corridor, the owner registry and the Temporal kernel are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the F-027 spec lock is unchanged: blob d63ccd859f6f2da1728ee13c6d25b062804f3293", () => {
    expect(gitBlob("spec/f027/spec-lock.json")).toBe("d63ccd859f6f2da1728ee13c6d25b062804f3293");
  });

  it("the one engine edit is the Logistics derivation, narrowed and nothing else: the route-less foundation, every other refusal and the single corridor read remain", () => {
    expect(sha(DERIVE)).toBe(DERIVE_AT_SLICE_HEAD);
    const src = code(DERIVE);
    // the old blanket refusal of the active PC is gone ...
    expect(src).not.toMatch(/does not move the active PC/);
    // ... the PC is still moved only by its OWN PC-owned request, and a PC-owned request still moves only its own PC ...
    expect(src).toContain(
      'if (e.kind === "ACTIVE_PC" && request.key !== pcMovementRequestKey(e.entity_id))',
    );
    expect(src).toContain(
      'if (e.kind === "FALLBACK_ENTITY" && request.owner === OWNER_PC_EXISTENCE)',
    );
    // ... the one-transition limitation still fails closed, and the corridor is judged by the one shared violation
    expect(src).toContain("if (p.transitioned)");
    expect(src.match(/corridorReadViolation\(/g)).toHaveLength(2);
    // the optional pin is still absent (never `undefined`) for the route-less commitment
    expect(src).toContain("...(p.corridor !== undefined");
  });

  it("no engine, other contracts or testkit module names the protocol package or this gateway", () => {
    for (const f of [
      ...walk("packages/engine/src"),
      ...walk("packages/contracts/src").filter((x) => x !== CONTRACT),
      ...walk("packages/testkit/src"),
    ])
      expect(code(f), f).not.toMatch(
        /@immortalis\/protocol|commitConfirmedPcCorridorRelocation|bindTrustedConfirmedPcCorridorRelocationContext/,
      );
  });

  it("no owner, facet, fact kind, key space or sealing rule was added: the whole slice is one protocol module, one contract, one derivation narrowing and tests", () => {
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
    expect(protocolIndexExports()).toContain('export * from "./pc-corridor-relocation.ts";');
    const pkg = JSON.parse(readFileSync("packages/protocol/package.json", "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@immortalis/contracts": "workspace:*",
      "@immortalis/engine": "workspace:*",
    });
  });
});

describe("the module composes the existing owner paths only, takes no authority from the host, and does its source check before any write", () => {
  it("imports the contracts, the engine and only the sibling's result TYPE; from the engine only the Logistics adapter, the existing Temporal coordinator and helper, the one corridor violation and the campaign type", () => {
    expect(specifiersOf(MODULE).sort()).toEqual([
      "./pc-relocation.ts",
      "@immortalis/contracts",
      "@immortalis/engine",
    ]);
    expect(readFileSync(MODULE, "utf8")).toMatch(
      /import type \{ CommitConfirmedPcRelocationResult \} from "\.\/pc-relocation\.ts";/,
    );
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
      "corridorReadViolation",
      "logisticsTemporalObject",
      "type CanonicalCampaign",
    ]);
  });

  it("the source preflight runs BEFORE the first owner publication, and the preflight itself only reads: no commit, scan, list or registration", () => {
    const src = identifiers(MODULE);
    expect(src.indexOf("sourcePreflight(campaign.store")).toBeGreaterThan(0);
    expect(src.indexOf("sourcePreflight(campaign.store")).toBeLessThan(
      src.lastIndexOf("campaign.commitPcVoluntaryMovement("),
    );
    const preflight = bodyOf(MODULE, "function sourcePreflight(", "async function enrollTransfer(");
    expect(preflight).not.toMatch(
      /\.commit\(|\.registerObject\(|\.listFacts\b|\.head\b|\.verify\b|\.close\b|await\b|commitPcVoluntaryMovement|establishPcMovementRequest|commitCorridorMovement|dispatch/,
    );
    expect(preflight).toMatch(/corridorReadViolation\(/);
    // the corridor key is derived from the facts and compared with the binding, never taken from it
    expect(preflight).toMatch(/corridorKey !== worldCorridorKey\(/);
  });

  it("invokes each of the four existing owner publications exactly once, in their ratified order, with the SOURCE-QUALIFIED Logistics commitment and never the route-less one", () => {
    const src = identifiers(MODULE);
    const order = [
      "commitPcVoluntaryMovement(",
      "establishPcMovementRequest(",
      "logistics.commitCorridorMovement(",
      "logistics.dispatch(",
    ].map((n) => src.lastIndexOf(n));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const n of ["logistics.commitCorridorMovement(", "logistics.dispatch("])
      expect(src.split(n).length - 1, n).toBe(1);
    expect(src).not.toMatch(/\.commitMovement\(/);
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
    expect(src).not.toMatch(
      /next_boundary|dependencies|continuation|invalidators|information_latency|partition|last_resolved_basis|boundary_id|dependsOn|declares_close|EXACT-PARTITION/,
    );
  });

  it("states no authority itself: the player's role and permission, the canon-write authority and every owner or fact literal are absent", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    expect(src).not.toMatch(
      /PLAYER_CHOICE_AUTHORITY|CANON_WRITE_AUTHORITY|OWNER_|FACET_|\bFACT_KIND|factKind|\bauthored_under:\s*\{|\brole\b|\bpermission\b/,
    );
    expect(identifiers(MODULE)).toMatch(
      /PcMovementCommitInputSchema\.safeParse\(trusted\.choice\)/,
    );
    expect(code(MODULE)).not.toMatch(/role\.player|permission\.player_choice|role\.archivist/);
  });

  it("derives identities from the canonical PC identity only, in its own namespace, never from the host request, a clock or randomness", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(/parsed\.data|request\./);
    expect(src).toMatch(/choice\.pc_id/);
    expect(src).not.toMatch(
      /Date\b|Math\.random|performance|randomUUID|crypto|counter|Symbol\.for/i,
    );
    expect(code(MODULE)).toContain("`pc-corridor-relocation-group:${step}:${pcId}`");
    expect(code(MODULE)).toContain("`pc-corridor-relocation-intent:${step}:${pcId}`");
  });

  it("the host-visible contract is the operation name alone, and no corridor, route, world, PC, time, confirmation or authority field exists in it", () => {
    const fieldLists = [...code(CONTRACT).matchAll(/z\.strictObject\(\{([^}]*)\}\)/g)].map((m) =>
      [...m[1]!.matchAll(/^\s*(\w+):/gm)].map((f) => f[1]),
    );
    expect(fieldLists).toEqual([["operation"]]);
    expect(readFileSync(CONTRACT, "utf8").match(/export const PROTOCOL_OP_/g)).toHaveLength(1);
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /\bconfirmed\s*[:?=]|\bisConfirmed\b|\bconfirmation\s*[:?=]|\bapproved\b/i,
    );
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /\bauth\w*\b|\bcredential\w*\b|\btoken\b|\bsession\b|\baccount\b|\btenant\b|\bpassword\b|\bsecret\b|\bcampaignId\b|\bcampaign_id\b/i,
    );
  });
});

describe("the gateway advances no time, resolves nothing, plans no route, invents no duration and holds no state of its own", () => {
  it("reaches no advance, continuation, time establishment, resolution, scheduler, clock, listing or scan; its one store write is the replay of its own committed registration", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(
      /\.advance\b|continueRemainder|establishCanonicalTime|\.boundaryIndex\b|\.transaction\b|\.listFacts\b|\.head\b|\.verify\b|\.close\b|\.save\b|\.load\b|CausalDraw|schedul|setTimeout|setInterval|\bnew Date\b|retry|\bcache\b|localStorage/i,
    );
    expect(src.match(/store\.commit\(/g)).toEqual(["store.commit("]);
    expect(src).toMatch(/store\.commit\(prior\)/);
    expect(src.match(/\.committedGroup\(/g)).toHaveLength(1);
    // no route search, no duration, speed, access or feasibility vocabulary: the corridor is read for its topology alone
    expect(src).not.toMatch(
      /path\w*find|shortest|distance|speed|duration|calibrat|carrier|passenger|hazard|obstacle|rollback|cancel|divert|feasib|capacity|passab/i,
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
      /\bfetch\b|\brequire\b|\bimport\(|\bfs\b|\bnet\b|\bhttp\w*\b|WebSocket|\bmcp\b|\bendpoint\b|\bserver\b|\bprovider\b|process\.env/i,
    );
    for (const absent of ["packages/mcp", "packages/server", "packages/protocol/src/server.ts"])
      expect(existsSync(absent), absent).toBe(false);
  });

  it("no host-facing MCP surface or operator command imports or names the gateway: it has no tool, phone or client entry", () => {
    for (const f of walk("packages/operator/src"))
      expect(code(f), f).not.toMatch(
        /commitConfirmedPcCorridorRelocation|bindTrustedConfirmedPcCorridorRelocationContext|PROTOCOL_OP_COMMIT_CONFIRMED_PC_CORRIDOR_RELOCATION/,
      );
  });

  it("the foundation document records the authority, the trust boundary, the preflight, the one engine change, the recovery rule and what is not claimed", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const text of [
      "MECHANISM ONLY",
      "2026-10-22T16:13:49.400Z",
      "3b06e6591303e72ee7523555dc08d13c4c9c7d5b",
      "d63ccd859f6f2da1728ee13c6d25b062804f3293",
      "2026-10-08T01:25:36.611Z",
      "commit_confirmed_pc_corridor_relocation",
      "bindTrustedConfirmedPcCorridorRelocationContext",
      "commitConfirmedPcCorridorRelocation",
      "RELOCATION_COMMITTED",
      "RELOCATION_UNAVAILABLE",
      "RELOCATION_OUTCOME_UNKNOWN",
      "before any PC commitment or request",
      "The corridor supplies no transit time, speed, right of access, feasibility, cost, cap, arrival or guarantee",
      "The one engine change",
      "never retroactively upgraded",
      "original-activation",
      "F-028/OB-030 remains Blocked",
      "#72",
      "#73",
    ])
      expect(doc, text).toContain(text);
  });
});

describe("register, lock and gate honesty: nothing moved", () => {
  it("no spec snapshot or source pin differs from the predecessor's, and the frozen relocation contract is not a lock pin", () => {
    expect(lock.snapshot_files["spec/f027/open-gates.yaml"]).toBe(
      "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
    );
    expect(lock.frozen_sources.find((s) => s.id === "I-002")!.native_pin).toBe(
      "2026-09-25T00:15:54.536Z",
    );
    expectNotALockPin(lock, "3f320af901e08166ad96ca0fc5e5069d");
  });

  it("no register row was promoted or mentions this slice", () => {
    expect(register.filter((r) => r.status === "PASS" || r.status === "FAIL")).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(/corridor-relocation|CorridorRelocation/);
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
