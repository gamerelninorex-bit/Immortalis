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
    "87e768a4d743db942db7404cd29379567a52a7ee6ca49ef9e8af5e2ad68977d3",
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
    "da14f15afdd6024e7d3ff3996fab0c1f711e013addda368aa38f92696608e761",
  "packages/engine/src/persistence/file-package.ts":
    "9f503d0b219457f9086bf6963e774e3d5dcf74d18c4643a8c7658085ab8b6933",
  "packages/engine/src/owners/registry.ts":
    "f5664f8bd7d39fb3bbe076d5aa2f587c79db76838d7d796e93e5a40215ab509e",
  "packages/engine/src/temporal/coordinator.ts":
    "e95b8128a39824d1599eef3047f82198fd22677bdd4b7e1987eac2e89287dbdc",
  "packages/engine/src/logistics/adapter.ts":
    "e54a7b239bed8fe5f59599566b9888bc854fb7f932ca9ddd650f986aea54e943",
};

describe("existing owners, gateways and the frozen artifacts are untouched: the mechanism consumes them, never edits or duplicates them", () => {
  it("the two gateways, their contracts, the PC/Logistics/Temporal owners, the campaign and package, the owner registry and the F-027 artifacts are byte-identical to the base", () => {
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("the protocol package gained no host operation and no module: the five-operation surface is as it was", () => {
    expect(readdirSync("packages/protocol/src").sort()).toEqual([
      "causal-event-signal.ts",
      "event-signal.ts",
      "index.ts",
      "null-pc-ooc-advance.ts",
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

  it("takes from the protocol package exactly the two binders and the two operations of the relocation and the progression", () => {
    const names = walk(SRC).flatMap((f) => importedNames(f, "@immortalis/protocol"));
    expect(names.sort()).toEqual([
      "advanceConfirmedPcTransferToDelivery",
      "bindTrustedConfirmedPcRelocationContext",
      "bindTrustedConfirmedPcTransferAdvanceContext",
      "commitConfirmedPcRelocation",
    ]);
  });

  it("takes from the engine only the campaign open, the file-system seam, read-only owner adapters and canonical equality", () => {
    const names = [
      ...new Set(walk(SRC).flatMap((f) => importedNames(f, "@immortalis/engine"))),
    ].sort();
    expect(names).toEqual([
      "CanonicalCampaign",
      "FileCampaignOptions",
      "FsOps",
      "LogisticsAdapter",
      "StageOwnerExtension",
      "StageProviderRegistry",
      "TemporalCoordinator",
      "canonicalEqual",
      "nodeFs",
    ]);
  });

  it("exposes exactly the local operator surface and nothing that names a host operation, a role or a confirmation flag", () => {
    expect(Object.keys(operator).sort()).toEqual([
      "EXIT",
      "IntentLedger",
      "LEDGER_FORMAT",
      "LEDGER_FORMAT_VERSION",
      "LocalOperatorSession",
      "OPERATOR_PUBLICATION_BASIS",
      "OPERATOR_PUBLICATION_SECRECY",
      "USAGE",
      "advance",
      "consumeConfirmation",
      "defaultOperatorDir",
      "ensureOperatorStateDirectory",
      "judgeOperatorDirectory",
      "ledgerFileName",
      "reconcile",
      "relocate",
      "requestOperatorConfirmation",
      "runCli",
      "status",
      "stdioTerminal",
      "subjectOf",
      "verifyLocalOperator",
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
      "reconcile",
      "OS user",
      "no remote authentication",
    ])
      expect(doc, must).toContain(must);
  });
});
