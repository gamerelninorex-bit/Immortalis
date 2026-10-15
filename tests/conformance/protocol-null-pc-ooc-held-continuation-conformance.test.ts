// PR #67 H-1 recovery: re-pin the affected event-trigger/strict-boundary implementation; no frozen artifact or gate changes.
// Conformance evidence for the Trusted Separately Player-Authorized NULL-PC OOC Held-Continuation Temporal Advance Gateway (IM-15 /
// IM-16 over the existing Temporal kernel and the real shipped owner stage providers). Governing lock: spec/f027/spec-lock.json
// (F-027 v1.0 composed with F-027-CD1 v1.0), unchanged. No register row, status, source pin, gate or lock moved; this slice adds
// code, tests and a document only. Authentication, sessions and the OOC choice interaction are neither implemented nor claimed.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED). PF-6/F-028 stays BLOCKED / NOT ACTIVATED.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gates, lock, register, code } from "../support/f027.ts";
import { protocolIndexExports, PROTOCOL_ONLY_EVENT_SIGNAL_READ } from "../support/protocol.ts";

const MODULE = "packages/protocol/src/null-pc-ooc-held-continuation.ts";
const INITIAL = "packages/protocol/src/null-pc-ooc-advance.ts";
const CONTRACT = "packages/contracts/src/protocol-null-pc-held-advance.ts";
const DOC = "docs/protocol-null-pc-ooc-held-continuation-foundation.md";
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
const providerList = (file: string): string =>
  readFileSync(file, "utf8")
    .match(/new StageProviderRegistry\(\[([\s\S]*?)\]\)/)![1]!
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .join(",");

/** Every module the gateway composes or must leave untouched, as it stood at the base (main d25aa14). */
const UNCHANGED: Record<string, string> = {
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/contracts/src/protocol-advance.ts":
    "3f64a45e7fe169b61593cedc06a062ea3a4c4faed4538786abf2ec757c3f026a",
  "packages/contracts/src/protocol-relocation.ts":
    "9251e5f50811651f1f0973dd20f2c2b36af08094f32346d0a4f51fdd552e773d",
  "packages/contracts/src/protocol.ts":
    "426cb9e790b435d75a4f6a1df39c792616310421e17eb953aa2f382ae4370e0c",
  "packages/contracts/src/protocol-causal.ts":
    "a535533b4ae92b71805634bc742627e45bb2223a0311631303b63c211ed588d5",
  "packages/contracts/src/world-foundation.ts":
    "c22e815d803c4c677db8d3c1d47c9ddf920ac386db2809de37dfd42d47ba9337",
  "packages/engine/src/temporal/admission.ts":
    "1aa8b4acca2d0fe9967e93c07ef6d52479e7eba8b96d726e9923149afea0d193",
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
    "afe8c28a662f3c9e1f5329665c6fdf60d724775c389a447be56c7ed7a8e02318",
  "packages/engine/src/world/canonical-campaign.ts":
    "956f6fe71ce244037785a4d08ad09acfd419693f91c3f5698b875206a7c70b6e", // B61-A3 scoped delta (world/canonical-campaign.ts): pinned at the PR #61 head; main da14f15afdd6
  "packages/engine/src/world/entity-transition-provider.ts":
    "8fa5792dc8fd4f46e9ac4d0a3d54678a8eef7d3d8370921622d8a3ff8ea5b49a",
  "packages/engine/src/world/fallback-custody.ts":
    "61cc0d588e94c3dac156e25f3dd6a578e7670ce4124c82229f6efbb71ae657f8",
  "packages/engine/src/logistics/provider.ts":
    "c85b24ea7c721d1230cb69e7a0f3926409974723d79f592eb9186b784fa7a111",
  "packages/engine/src/production/provider.ts":
    "9780cbcf860633de5d7f46e355f8e1fad3a4b1d69d5696ff75b277f6cd55690c",
  "packages/engine/src/economy/provider.ts":
    "f3140211dc6b86f111799faa0ac42aeb6aebfd472d4132612165c087481bd283",
  "packages/engine/src/population/provider.ts":
    "794b2f6b876e4d1c75602534580be7dfbe7ba4fc8bbed6c7a291746449c17dcf",
  "packages/engine/src/population/barrier.ts":
    "f9e49354a379144fb3244ce33b2f758f4eb459aabd8aeb13183168eabdfeec1b",
  "packages/engine/src/epistemic/provider.ts":
    "bfe7857aad391ec1374210ebf81bbb76dfb062ae7a5e27958b3adfcd4891dc5e",
  "packages/engine/src/kti/provider.ts":
    "515db339766dd1ed18fde72d1698b13747b103b73449963b6f8dbdeff4d2f50e",
  "packages/engine/src/actor/provider.ts":
    "294369e690f0d7c70d5f3750e60809ceabff54768ec4cca2c423e2434a984a2d",
  "packages/engine/src/pc-capability/provider.ts":
    "74fc2146cc4692ef42fd50f1d501bb210d476037f973620e8f3d83e18e5f061f",
  "packages/engine/src/owners/registry.ts":
    "c3c085fa2a124e9eb3ce86b03742f6be189851d017a461e7245dc2b33c9ad3a8", // B61-A3 scoped delta (owners/registry.ts): pinned at the PR #61 head; main 7ce3421f8847
  "packages/protocol/src/pc-relocation.ts":
    "fd383cd4a49037233e357dcc4f2f566472f4c6a6083efe16cdbf3946fb30614a",
  "packages/protocol/src/pc-transfer-advance.ts":
    "92ac714a567384f2e4c4410f1525b9f803ea3821b5deee22da3e7ab5c3af6ee1",
  "packages/protocol/src/event-signal.ts":
    "9b1713f26f43b1eb58725ce5e88ea3499a52c5ede08d8838de7d1367d9f5031d",
  "packages/protocol/src/causal-event-signal.ts":
    "6b2d56f4953b1c7c0fa073b01b5743f81e8a540f719d9fe110f2740ebdcce3fb",
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "packages/protocol/src/null-pc-ooc-advance.ts":
    "b3fe9e0c2be291ae5ea6670df42e59fde1121a35c01254230a083dd676c17c68",
  "packages/contracts/src/protocol-null-pc-advance.ts":
    "c7018747d8745074d8ced47daa49cadb57d4e296f944edb965a2be35f30ecf60",
};

describe("existing owners, the Temporal kernel, the predecessor gateways and the frozen artifacts are untouched: the gateway consumes them, never edits or duplicates them", () => {
  it("the Temporal kernel and schemas, every shipped owner stage provider, the canonical campaign, the owner registry, the initial NULL-PC gateway and its contract, the predecessor gateways and the frozen F-027 artifacts are byte-identical to the base, except the B61-A3 scoped deltas (PR #61) pinned at its head", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("no engine module, owner registration or fact kind was added: the whole slice is one protocol module, one contract and tests", () => {
    expect(readdirSync("packages/protocol/src").sort()).toEqual([
      "active-pc-target-advance.ts",
      "causal-event-signal.ts",
      "event-signal.ts",
      "index.ts",
      "null-pc-ooc-advance.ts",
      "null-pc-ooc-held-continuation.ts",
      "pc-relocation.ts",
      "pc-transfer-advance.ts",
    ]);
    expect(protocolIndexExports()).toEqual(PROTOCOL_ONLY_EVENT_SIGNAL_READ);
    expect(protocolIndexExports()).toContain('export * from "./null-pc-ooc-held-continuation.ts";');
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
        /@immortalis\/protocol|resumeNullPcOocHeldAdvance|bindTrustedNullPcOocHeldContinuationContext/,
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

  it("the initial gateway is not relaxed or shared: it still refuses a held continuation, and this module does not import it", () => {
    expect(sha(INITIAL)).toBe(UNCHANGED[INITIAL]);
    expect(code(INITIAL)).toMatch(/state\.continuation !== null/);
    expect(code(INITIAL)).toMatch(/existing\.continues !== null\) return refusal\(\)/);
    expect(specifiersOf(MODULE).sort()).toEqual(["@immortalis/contracts", "@immortalis/engine"]);
    expect(identifiers(MODULE)).not.toMatch(/advanceNullPcOocToTarget|bindTrustedNullPcOocTarget/);
  });
});

describe("the module composes the existing kernel and shipped owner providers only, and takes no authority, time, target or continuation from the host", () => {
  it("imports the contracts and the engine only, and from the engine only the existing Temporal coordinator and registry, the shipped owner stage providers, the Population barrier evaluator, the canonical equality helper and the campaign type", () => {
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
      "StageProviderRegistry",
      "TemporalCoordinator",
      "canonicalEqual",
      "economyRealizationProvider",
      "epistemicPacketProvider",
      "gipSunsetExpiryProvider",
      "ktiTransferResultCloseProvider",
      "logisticsDeliveryProvider",
      "logisticsRetirementProvider",
      "namedActorCapabilityCloseProvider",
      "pcCapabilityCloseProvider",
      "populationBarrierEvaluator",
      "populationStageProvider",
      "productionCompletionProvider",
      "productionReserveInflowProvider",
      "productionSourceDeltaProvider",
      "type CanonicalCampaign",
      "worldEntityTransitionProvider",
      "worldFallbackAcceptanceProvider",
      "worldSourceDeliveryProvider",
    ]);
  });

  it("registers exactly the fifteen real shipped owner stage providers, in the same set as the initial NULL-PC gateway (no drift, no fixture, no wrapper, no new provider) with the existing Population barrier evaluator", () => {
    const src = identifiers(MODULE);
    expect(src.match(/new StageProviderRegistry\(/g)).toHaveLength(1);
    expect(src.match(/new TemporalCoordinator\(/g)).toHaveLength(1);
    expect(providerList(MODULE)).toBe(providerList(INITIAL));
    expect(providerList(MODULE).split(",")).toHaveLength(15);
    expect(src).toMatch(
      /new TemporalCoordinator\(\s*store,\s*ownerProviders\(\),\s*populationBarrierEvaluator,?\s*\)/,
    );
    expect(src).not.toMatch(/\bStageProvider\b(?!Registry)|compute\s*\(|\bregister\(/);
  });

  it("drives the one existing advance exactly once, continuing exactly the bound held transaction with the recorded request verbatim, and reaches no other kernel entry", () => {
    const src = identifiers(MODULE);
    expect(src.match(/\.advance\(/g)).toHaveLength(1);
    expect(src).not.toMatch(
      /continueRemainder|establishCanonicalTime|registerObject|\.listFacts\b|\.verify\b|\.close\b|\.save\b|\.load\b|\.commit\(|\.committedGroup\(|\.lookupReceipt\(/,
    );
    const call = readFileSync(MODULE, "utf8").match(
      /coordinator\.advance\(\{[\s\S]*?\}\s*satisfies ResolutionRequest\)/,
    )![0];
    expect(call).toContain("...transaction,");
    expect(call).toContain("continues: heldId,");
    expect(call).toContain("requested,");
    // the request is the sealed held record's, never constructed here: no target, condition, kind or boundary is authored
    expect(src).not.toMatch(/STOP_AFTER_BOUNDARY|\bkind\s*:|object_id|boundary_id|condition\s*:/);
    expect(identifiers(MODULE)).toMatch(/requested \?\?= tx\.requested/);
  });

  it("adds no due-work admission rule: it never reads the boundary index or the engaged objects", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(
      /boundaryIndex|timeAtOrBefore|timeBefore|compareTime|\.entries\b|\bobject\(/,
    );
  });

  it("proves the NULL state before it reads any Temporal state, and consumes only the exact bound hold", () => {
    const src = identifiers(MODULE);
    const nullCheck = src.indexOf("campaign.binding() !== undefined");
    expect(nullCheck).toBeGreaterThan(0);
    expect(nullCheck).toBeLessThan(src.indexOf("new TemporalCoordinator("));
    expect(nullCheck).toBeLessThan(src.indexOf("coordinator.state()"));
    expect(nullCheck).toBeLessThan(
      src.indexOf("coordinator.transaction(transaction.transaction_id)"),
    );
    expect(src.match(/campaign\.binding\(\) !== undefined/g)).toHaveLength(1);
    expect(src).toMatch(/held\.from_transaction !== heldId/);
    expect(src).toMatch(/existing\.continues !== heldId/);
  });

  it("states no authority itself: the player's role and permission, the canon-write authority and every owner or fact literal are absent", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    expect(src).not.toMatch(
      /PLAYER_CHOICE_AUTHORITY|CANON_WRITE_AUTHORITY|OWNER_|FACET_|\bFACT_KIND|factKind|\bauthored_under:\s*\{|\brole\b|\bpermission\b/,
    );
    expect(code(MODULE)).not.toMatch(/role\.player|permission\.player_choice|role\.archivist/);
    // the authored role and permission are reached only through the existing strict request schema
    expect(identifiers(MODULE)).toMatch(/ResolutionRequestSchema\.pick\(/);
    expect(identifiers(MODULE)).toMatch(
      /AdvanceTransactionSchema\.safeParse\(trusted\.transaction\)/,
    );
    // the held target and identity are reached only through the existing schemas
    expect(identifiers(MODULE)).toMatch(/CanonicalTimeSchema\.safeParse\(/);
    expect(identifiers(MODULE)).toMatch(/EntityId\.safeParse\(/);
  });

  it("takes the request's parsed value for validation, never for content, and owns no clock, calendar, duration, counter, random or retry state", () => {
    const src = identifiers(MODULE);
    expect(src).not.toMatch(/parsed\.data|(?<![.\w])request\./);
    expect(src).not.toMatch(
      /Date\b|Math\.random|performance|randomUUID|crypto|counter|Symbol\.for|setTimeout|setInterval|schedul|retry|\bcache\b|localStorage|calendar|duration|recurr|cron/i,
    );
    expect(src).not.toMatch(/\bcanonical_time\b|\bat\s*:|\bunit\s*:|\bvalue\s*:/);
  });

  it("has no confirmation flag: nothing is called `confirmed` as a field, parameter or default; the binder is the only attestation", () => {
    const src = identifiers(MODULE) + identifiers(CONTRACT);
    expect(src).not.toMatch(
      /\bconfirmed\s*[:?=]|\bisConfirmed\b|\bconfirmation\s*[:?=]|\bapproved\b/i,
    );
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

describe("the gateway invents no time, interpretation, journey or presentation and holds no state of its own", () => {
  it("reaches no natural-language, wait, observer, perception, narration, knowledge or event-discovery vocabulary", () => {
    expect(identifiers(MODULE) + identifiers(CONTRACT)).not.toMatch(
      /percept|narrat|recogni|\bknow\w*|presentation|projection|observer|glance|omniscien|interpret|parse\w*Text|\bwait\b|\bskip\b|rollback|cancel|reroute/i,
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
      /\bfetch\b|\brequire\b|\bimport\(|\bfs\b|\bnet\b|\bhttp\w*\b|WebSocket|\bmcp\b|\bendpoint\b|\bserver\b/i,
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

  it("the foundation document records the authority, the trust boundary, the literal request, the NULL-state rule, the recovery rule, the stop-reason decision and what is not implemented", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const text of [
      "2026-10-10T04:44:16.891Z",
      "d25aa14a9099cf75ad068aa475a6b73111a5f96d",
      "3f520af901e081ec938fc6b3a62fa6d1",
      "W3-CP3",
      "resume_null_pc_ooc_held_advance",
      "bindTrustedNullPcOocHeldContinuationContext",
      "resumeNullPcOocHeldAdvance",
      "NULL_PC_HELD_ADVANCE_COMMITTED",
      "NULL_PC_HELD_ADVANCE_UNAVAILABLE",
      "NULL_PC_HELD_ADVANCE_OUTCOME_UNKNOWN",
      "role.player_character = NULL",
      "TemporalCoordinator.advance",
      "Not implemented",
      "Residuals",
      "PF-6/F-028",
    ])
      expect(doc, text).toContain(text);
  });
});

describe("register, lock and gate honesty: nothing moved", () => {
  it("no spec snapshot or source pin differs from the predecessor's", () => {
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
    expect(lock.frozen_sources.find((s) => s.id === "F-014D")!.native_pin).toBe(
      "2026-09-24T16:25:17.059Z",
    );
  });

  it("no register row was promoted or mentions this slice", () => {
    expect(
      register.filter((r) => r.status !== "NOT_IMPLEMENTED" && r.status !== "BLOCKED"),
    ).toEqual([]);
    expect(JSON.stringify(register)).not.toMatch(
      /held-continuation|NullPcOocHeld|NULL_PC_HELD_ADVANCE/,
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
