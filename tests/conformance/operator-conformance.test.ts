// PR #67 H-1 recovery: re-pin the affected event-trigger/strict-boundary implementation; no frozen artifact or gate changes.
// Conformance evidence for the bounded local trusted PC command-and-reopen mechanism (@immortalis/operator). Governing lock:
// spec/f027/spec-lock.json (F-027 v1.0 composed with F-027-CD1 v1.0), unchanged. No register row, status, source pin, gate or
// lock moved: this slice adds a package, tests and a document only. The frozen Active-PC Post-Handover Physical Locus Ownership
// & Relocation Contract (pin 2026-10-08T01:25:36.611Z) is cited, never added to the lock. No remote authentication, interpreter,
// transport or game rule is implemented or claimed. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
// PF-6/F-028 stays BLOCKED / NOT ACTIVATED; IA/V rows are unpromoted.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const PKG = "packages/operator";
const SRC = `${PKG}/src`;
const DOC = "docs/local-operator-command-reopen-foundation.md";
const sha = (file: string) =>
  createHash("sha256")
    .update(readFileSync(file, "utf8").replace(/\r\n/g, "\n"), "utf8")
    .digest("hex");
const walk = (d: string): string[] =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".ts") ? [`${d}/${e.name}`] : [],
  );
const specifiers = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);
const importedNames = (file: string, from: string): string[] =>
  [
    ...readFileSync(file, "utf8").matchAll(
      new RegExp(`import (?:type )?\\{([^}]*)\\} from "${from}"`, "g"),
    ),
  ]
    .flatMap((m) => m[1]!.split(","))
    .map((n) => n.trim().replace(/^type /, ""))
    .filter(Boolean);

/** Everything the mechanism composes or must leave untouched, exactly as it stood at the base (main f0e4069). */
const UNCHANGED: Record<string, string> = {
  "spec/f027/spec-lock.json": "8546dd1f09e22a19c1748d513117783277b6d46b9e22f8cfcb6f47c171bf0cb7",
  "spec/f027/runtime-contract.md":
    "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "packages/protocol/src/pc-relocation.ts":
    "fd383cd4a49037233e357dcc4f2f566472f4c6a6083efe16cdbf3946fb30614a",
  "packages/protocol/src/pc-transfer-advance.ts":
    "92ac714a567384f2e4c4410f1525b9f803ea3821b5deee22da3e7ab5c3af6ee1",
  "packages/protocol/src/index.ts":
    "2abd69a045e19c9d08d937fc21a12c895a6eb3d612fbdd01719be31d94052be5",
  "packages/contracts/src/pc-movement.ts":
    "35c05f1e78aca3c11c32d141dbb43cdc99c71237027ed7dbceea4e3dd048ea10",
  "packages/contracts/src/protocol-relocation.ts":
    "9251e5f50811651f1f0973dd20f2c2b36af08094f32346d0a4f51fdd552e773d",
  "packages/contracts/src/protocol-advance.ts":
    "3f64a45e7fe169b61593cedc06a062ea3a4c4faed4538786abf2ec757c3f026a",
  "packages/contracts/src/protocol.ts":
    "426cb9e790b435d75a4f6a1df39c792616310421e17eb953aa2f382ae4370e0c",
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/contracts/src/logistics.ts":
    "44704b92e056bfc4b69896887b5798c15a97c1762301144c4cf790dd06e38382",
  "packages/engine/src/world/canonical-campaign.ts":
    "956f6fe71ce244037785a4d08ad09acfd419693f91c3f5698b875206a7c70b6e", // B61-A3 scoped delta (world/canonical-campaign.ts): pinned at the PR #61 head; main da14f15afdd6
  "packages/engine/src/persistence/file-package.ts":
    "f11ccfa9d6411f0d3130b1d215fe3642489666298e71548de82f6cb0091a83d6", // H-01 scoped delta (persistence/file-package.ts: single-writer lock safety): pinned at the H-01 head; main 9f503d0b219
  "packages/engine/src/owners/registry.ts":
    "c3c085fa2a124e9eb3ce86b03742f6be189851d017a461e7245dc2b33c9ad3a8", // B61-A3 scoped delta (owners/registry.ts): pinned at the PR #61 head; main 7ce3421f8847
  "packages/engine/src/temporal/coordinator.ts":
    "afe8c28a662f3c9e1f5329665c6fdf60d724775c389a447be56c7ed7a8e02318",
  "packages/protocol/src/null-pc-ooc-advance.ts":
    "b3fe9e0c2be291ae5ea6670df42e59fde1121a35c01254230a083dd676c17c68",
  "packages/protocol/src/null-pc-ooc-held-continuation.ts":
    "4040a181a8b081d5d9a8c265185b13a4d559e829500a5c5986e776e4b703343c",
  "packages/contracts/src/protocol-null-pc-advance.ts":
    "c7018747d8745074d8ced47daa49cadb57d4e296f944edb965a2be35f30ecf60",
  "packages/contracts/src/protocol-null-pc-held-advance.ts":
    "daff58a4dae82536f6802baf391e5e1d2cfa0ade4bc9594e3ecc9efa056b7cb2",
  "packages/engine/src/gip/provider.ts":
    "f1d6629d99aeb17f4f36265621fd6906447ef74336dd80b32e75c2561d874af5",
  "packages/engine/src/gip/adapter.ts":
    "2b73b74c3f32d245d88999115a74f4804f8bdcb03d16f9a2793fe61c5d2e1f8b",
  "packages/engine/src/logistics/adapter.ts":
    "e54a7b239bed8fe5f59599566b9888bc854fb7f932ca9ddd650f986aea54e943",
};

describe("existing owners, gateways and the frozen artifacts are untouched: the mechanism consumes them, never edits or duplicates them", () => {
  it("the active-PC and NULL-PC gateways, their contracts, the GIP sunset provider, the PC/Logistics/Temporal owners, the campaign and package, the owner registry and the F-027 artifacts are byte-identical to the base, except the B61-A3 scoped deltas (PR #61) pinned at its head", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the operator gained no protocol host operation and no module of its own: the protocol surface is the seven operations it was given", () => {
    expect(readdirSync("packages/protocol/src").sort()).toEqual([
      "active-pc-target-advance.ts",
      "causal-event-signal.ts",
      "current-observation-glance.ts",
      "event-signal.ts",
      "index.ts",
      "null-pc-ooc-advance.ts",
      "null-pc-ooc-held-continuation.ts",
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

  it("the workspace holds exactly the four earlier packages and this one, and no earlier package names it", () => {
    expect(readdirSync("packages").sort()).toEqual([
      "contracts",
      "engine",
      "operator",
      "protocol",
      "testkit",
    ]);
    for (const f of ["engine", "contracts", "testkit", "protocol"].flatMap((p) =>
      walk(`packages/${p}/src`),
    ))
      expect(code(f), f).not.toMatch(
        /@immortalis\/operator|LocalOperatorSession|requestOperatorConfirmation/,
      );
  });
});

describe("the package composes only the existing gateways and canonical reads", () => {
  it("depends on exactly the contracts, engine, protocol and the schema library the contracts already pin", () => {
    const pkg = JSON.parse(readFileSync(`${PKG}/package.json`, "utf8")) as {
      name: string;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("@immortalis/operator");
    expect(pkg.dependencies).toEqual({
      "@immortalis/contracts": "workspace:*",
      "@immortalis/engine": "workspace:*",
      "@immortalis/protocol": "workspace:*",
      zod: JSON.parse(readFileSync("packages/contracts/package.json", "utf8")).dependencies.zod,
    });
  });

  it("takes from the protocol package exactly the six binders and the five operations: relocation and progression, NULL-PC advance and held resume, and the active-PC target advance", () => {
    // the local player-view transport (BLUE v5.2 bounded brief 2026-10-15) is bound by its own, narrower check below
    const names = walk(SRC)
      .filter((f) => !f.includes("/player-view"))
      .flatMap((f) => importedNames(f, "@immortalis/protocol"));
    expect(names.sort()).toEqual([
      "advanceActivePcToTarget",
      "advanceConfirmedPcTransferToDelivery",
      "advanceNullPcOocToTarget",
      "bindTrustedActivePcHeldTargetAdvanceContext",
      "bindTrustedActivePcTargetAdvanceContext",
      "bindTrustedCausalEventSignalContext",
      "bindTrustedConfirmedPcRelocationContext",
      "bindTrustedConfirmedPcTransferAdvanceContext",
      "bindTrustedNullPcOocHeldContinuationContext",
      "bindTrustedNullPcOocTargetAdvanceContext",
      "commitConfirmedPcRelocation",
      "deliverCausalEventSignalPresentation",
      "resumeNullPcOocHeldAdvance",
    ]);
  });

  it("the local player-view transport takes from the protocol package only the Glance binder, the Glance read and its result type, and nothing else", () => {
    const names = walk(SRC)
      .filter((f) => f.includes("/player-view"))
      .flatMap((f) => importedNames(f, "@immortalis/protocol"));
    expect([...new Set(names)].sort()).toEqual([
      "ReadCurrentObservationGlanceResult",
      "bindTrustedCurrentPlayerContext",
      "readCurrentObservationGlance",
    ]);
  });

  it("takes from the engine only the campaign open, the file-system seam, read-only owner adapters and canonical equality", () => {
    const names = [
      ...new Set(walk(SRC).flatMap((f) => importedNames(f, "@immortalis/engine"))),
    ].sort();
    expect(names).toEqual([
      "CandidateItem",
      "CanonicalCampaign",
      "FileCampaignOptions",
      "FsOps",
      "I002Context",
      "IrContext",
      "LogisticsAdapter",
      "ObservationContext",
      "PhysicalContext",
      "RefereeAdjudicationAdapter",
      "StageOwnerExtension",
      "StageProviderRegistry",
      "TemporalCoordinator",
      "canonicalEqual",
      "committedCanonicalTime",
      "deriveI002",
      "deriveIr",
      "deriveObservation",
      "derivePhysical",
      "formObservedPacket",
      "nodeFs",
      "observationEventId",
      "refereeCandidateItems",
      "refereeQualificationViolation",
      "verifyEpistemicIntegrity",
    ]);
  });

  it("exposes exactly the local operator surface and nothing that names a host operation, a role or a confirmation flag", () => {
    expect(Object.keys(operator).sort()).toEqual([
      "DELEGATION_NONE_TEXT",
      "EMPTY_DRAFT",
      "EXIT",
      "IntentLedger",
      "LEDGER_FORMAT",
      "LEDGER_FORMAT_VERSION",
      "LOCALITY_SETUP_FORMAT",
      "LOCALITY_SETUP_FORMAT_VERSION",
      "LocalOperatorSession",
      "LocalitySetupSchema",
      "MAX_LIST_ITEMS",
      "MAX_STATEMENT_CHARS",
      "OOC_BANNER",
      "OOC_BOUNDARY_NOTE",
      "OOC_DEBUG_NOTE",
      "OPERATOR_PUBLICATION_BASIS",
      "OPERATOR_PUBLICATION_SECRECY",
      "REFEREE_CONFIG_FORMAT",
      "REFEREE_DECISION_FORMAT",
      "REFEREE_MCP_USAGE",
      "REFEREE_TASK_FORMAT",
      "USAGE",
      "WORLD_CLAIMS_NONE_TEXT",
      "additionalSourceId",
      "advance",
      "applyEdits",
      "askI002",
      "askIr",
      "askObservation",
      "askPhysical",
      "authorCharacter",
      "authorizeHost",
      "awaitDecision",
      "bindHost",
      "bindingIdOf",
      "characterStatus",
      "compileContract",
      "consumeConfirmation",
      "custodyProblems",
      "defaultOperatorDir",
      "ensureOperatorStateDirectory",
      "establishAdditionalSource",
      "establishCharacterLocus",
      "establishLocality",
      "findingsLines",
      "isSetAside",
      "judgeOperatorDirectory",
      "judgeStatement",
      "ledgerFileName",
      "localitySetupId",
      "localityStatus",
      "locusIdOf",
      "mirrorItems",
      "mirrorPanel",
      "missingOf",
      "nullAdvance",
      "nullResume",
      "observeSurroundings",
      "parseEdit",
      "pcTargetAdvance",
      "pcTargetResume",
      "pendingTasks",
      "proofOf",
      "publishTask",
      "readAdditionalSourceFile",
      "readConfig",
      "readLocalitySetupFile",
      "readTask",
      "reconcile",
      "refereeConfigured",
      "refereeDir",
      "releaseEvidenceProblems",
      "releaseIdOf",
      "releaseProblems",
      "relocate",
      "requestOperatorConfirmation",
      "requestOperatorDecision",
      "runCli",
      "runRefereeMcpCli",
      "secretPath",
      "serveRefereeMcp",
      "setAsideDecision",
      "status",
      "stdioTerminal",
      "subjectOf",
      "submitDecision",
      "taskDocument",
      "verifyLocalOperator",
      "vouchedDecision",
    ]);
  });

  it("the shipped binary registers no owner extension: an embedding supplies the registrations a saved campaign was written with", () => {
    const bin = code(`${SRC}/bin.ts`);
    expect(bin).toMatch(/runCli\(process\.argv\.slice\(2\)\)/);
    expect(bin).not.toMatch(/extension|testkit|fixture/i);
    expect(specifiers(`${SRC}/bin.ts`)).toEqual(["./cli.ts"]);
  });
});

describe("register, lock and gate honesty", () => {
  it("PF-6/F-028 stays not activated and blocked; no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register) {
      const text = JSON.stringify(row);
      expect(text, row.id).not.toMatch(/operator-|packages\/operator|local-operator/);
    }
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the document states the boundary, the limits and the untouched governance", () => {
    expect(existsSync(DOC)).toBe(true);
    const doc = readFileSync(DOC, "utf8");
    for (const must of [
      "Not claimed",
      "PF-6/F-028",
      "IA-07",
      "two distinct",
      "delivery boundary",
      "OOC DEVELOPMENT / SCENARIO INSTRUMENTATION",
      "conditional foundation evidence",
      "not a travel time",
      "2026-10-09T17:37:14.077Z",
      "reconcile",
      "OS user",
      "no remote authentication",
    ])
      expect(doc, must).toContain(must);
  });

  it("the document states the NULL-PC slice's boundary: base, brief pin, separate choices, transaction-only status, residuals and untouched governance", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const must of [
      "NULL-PC OOC time progression and held recovery",
      "33ac954c045e7705425cc25fa95ccb44a0229cfc",
      "2026-10-10T05:50:48.025Z",
      "null-advance",
      "null-resume",
      "NULL_PC_ADVANCE_COMMITTED",
      "NULL_PC_HELD_ADVANCE_COMMITTED",
      "Committed means a transaction committed",
      "Not claimed",
      "Operator-only visibility of a remainder",
      "PF-6/F-028 remains BLOCKED / NOT ACTIVATED",
      "IA-07",
      "byte for byte",
    ])
      expect(doc, must).toContain(must);
  });

  it("the document states the active-PC target slice's boundary: base, brief pin, separate choices, transaction-only status, residuals and untouched governance", () => {
    const doc = readFileSync(DOC, "utf8");
    for (const must of [
      "Active-PC target-only time progression and held recovery",
      "97c3788c5d9132973cfd6ddac08bc955f2ffe988",
      "2026-10-10T09:39:40.741Z",
      "pc-target-advance",
      "pc-target-resume",
      "PC_TARGET_ADVANCE_COMMITTED",
      "Committed means a transaction committed",
      "stationary",
      "Not claimed",
      "Operator-only visibility of a remainder",
      "OB-030",
      "PF-6/F-028",
      "IA-07",
    ])
      expect(doc, must).toContain(must);
  });
});
