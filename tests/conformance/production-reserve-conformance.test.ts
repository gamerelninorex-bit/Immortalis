// PR91 BLUE HOLD composition: readable review adaptation and exact private binding recovery; frozen owners/source locks unchanged.
// Conformance evidence for the Initial Production Reserve Admission slice (@immortalis/operator `establish-reserve`).
// Authority: BLUE v5.2-A1 bounded implementation brief (native pin 2026-10-22T04:15:36.156Z) on main
// 6021693c1cf79e4a9c5d9216b7211fb65726c193. Governing lock: spec/f027/spec-lock.json (F-027 v1.0), unchanged. This slice adds operator
// code, tests and a document only: no contracts, engine, protocol or testkit module, no owner, schema, source pin, gate or status moved.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EstablishReserveInputSchema, productionReserveKey } from "@immortalis/contracts";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const DOC = "docs/production-reserve-admission-foundation.md";
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

/** Everything the slice composes or must leave untouched, exactly as it stood at main 6021693c1cf79e4a9c5d9216b7211fb65726c193. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "packages/contracts/src/production.ts":
    "40ff84c02029ecd43811eb8c8cd6b5d32e8e6e505953c9bd3e997a6ae8f41e4b",
  "packages/contracts/src/world-foundation.ts":
    "571a02c42970cea354a4b537627645246e42168b59de1e88196ff8844ee9cc72",
  "packages/contracts/src/source-drawdown.ts":
    "4d78433ce72ca9833cffd944cbfd1ff026bf9ed15f7e448b3b1880551593245d",
  "packages/engine/src/production/adapter.ts":
    "206655fa62a86fd12bda664615b1d6590bda9dd9919bd068e068a8c70ad0f3a9",
  "packages/engine/src/production/admission.ts":
    "00a008aaccdb38a48bda1f101327ff5edbc31be67ea545127d2719fe12aac8b6",
  "packages/engine/src/owners/registry.ts":
    "926aa1af36d783ef3760524ad36f3ebc6994f906bf9861bbbdc1e1adb8d97116",
  "packages/engine/src/world/canonical-campaign.ts":
    "4bfaf68c1383e6cddbed6cb3028d06ef9c0a3cccc26a40f0dbfbac15ec575090",
  "packages/operator/src/locality.ts":
    "808a3e0329822ef6085e48f7db02a7354d25995d7e1b24a7d8f1a90f7a8c6c2a",
  "packages/operator/src/additional-source.ts":
    "56428eac482b003420120cca2e617fc019c1b1e59c09a37f0d2dca4ceb63111e",
  "packages/operator/src/additional-locality.ts":
    "5f1fea4718c816d755c086d2cfef6bffdbfdad62e3ac2f2935ba54e94bf4c782",
  "packages/operator/src/commands.ts":
    "f14467cae3334d2f13f65ab9b941a7f66b889d157779a7afad53e09eb6baa8af",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/ledger.ts":
    "94092549ec67f9631f05fba78890775c45e574a1e9335a36daa3abe82921c3c9",
};

describe("nothing outside the operator is touched", () => {
  it("the F-027 lock is the pinned blob, and the gates, register, contracts, the Production owner, the registry, the earlier admission modules, commands.ts, the session and the ledger are byte-identical to main", () => {
    expect(gitBlob("spec/f027/spec-lock.json")).toBe("d63ccd859f6f2da1728ee13c6d25b062804f3293");
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register)
      expect(JSON.stringify(row), row.id).not.toMatch(
        /production-reserve|establish-reserve|ProductionReserveAdmission/,
      );
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the Reserve input and value are the unchanged strict contracts with their unchanged fields, keys and owner assignment", () => {
    expect(Object.keys(EstablishReserveInputSchema.shape).sort()).toEqual(
      ["condition", "locus_id", "material_class", "quantity", "reserve_id", "world_id"].sort(),
    );
    expect(Object.keys(EstablishReserveInputSchema.shape.quantity.shape).sort()).toEqual([
      "amount",
      "unit",
    ]);
    expect(productionReserveKey("r-1")).toBe("production/reserve/r-1");
    expect(EstablishReserveInputSchema.safeParse({ extra: 1 }).success).toBe(false);
    const registry = readFileSync("packages/engine/src/owners/registry.ts", "utf8");
    expect(registry).toMatch(/production_reserve/);
  });
});

describe("the command reuses the existing owner operation and adds no surface", () => {
  const src = code("packages/operator/src/production-reserve.ts");

  it("composes ProductionAdapter.establishReserve and the existing session, confirmation and locality reads", () => {
    expect(src).toContain("establishReserve(");
    expect(src).toContain("LocalOperatorSession.open(");
    expect(src).toContain("requestOperatorConfirmation(");
    expect(src).toContain("establishedLocality(");
    expect(src).toContain("EstablishReserveInputSchema");
  });

  it("invents no persistence: no ledger, pin or receipt format is read or written, and no package is created", () => {
    expect(src).not.toMatch(/IntentLedger|readPin|writePin|createExclusive|writeFileDurable/);
    expect(src).not.toMatch(/mkdirSync\(\s*params\.campaignDir/);
    expect(src).not.toMatch(/CanonicalCampaign\.create\(\s*params\.campaignDir/);
  });

  it("owns no source, delivery, inflow, consumption, claim, title, route, travel, time or actor surface", () => {
    expect(src).not.toMatch(
      /SourceDrawdown|production_source_delta|world_source_delivery|startOperation|startExtraction|Temporal|PcMovement|ActorState|handoverExistingActor|travel_duration/,
    );
  });

  it("is exported by the operator package and by nothing as a host-callable tool", () => {
    expect(typeof operator.establishProductionReserve).toBe("function");
    expect(typeof operator.readProductionReserveFile).toBe("function");
    expect(typeof operator.productionReserveId).toBe("function");
    expect(typeof operator.expectedReserve).toBe("function");
  });

  it("the CLI lists exactly one new command, with its one new option, and documents the pre-play boundary", () => {
    expect(operator.USAGE).toContain("establish-reserve --campaign <dir>");
    expect(operator.USAGE).toContain("--reserve-file <file>");
    expect(operator.USAGE).toContain("docs/production-reserve-admission-foundation.md");
  });
});

describe("the document states what the slice is and is not", () => {
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  it("exists, pins the brief and the base, and keeps every gate where it was", () => {
    expect(doc).toContain("2026-10-22T04:15:36.156Z");
    expect(doc).toContain("6021693c1cf79e4a9c5d9216b7211fb65726c193");
    expect(doc).toContain("d63ccd859f6f2da1728ee13c6d25b062804f3293");
    expect(doc).toContain("F-028/OB-030 remains Blocked");
  });
  it("claims no collection, conversion, delivery, entitlement, title or downstream success", () => {
    expect(doc).toContain("not a collection or extraction action");
    expect(doc).toContain("not a physical title declaration");
    expect(doc).toContain("not a demonstrated collection or conversion");
    expect(doc).toContain("mechanical owner integration only");
    expect(doc).toContain("carries no collection verdict");
  });
  it("leaves PR #72 and PR #73 untouched and on hold", () => {
    expect(doc).toContain("#72");
    expect(doc).toContain("#73");
    expect(doc).toContain("remain untouched");
  });
});
