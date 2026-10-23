// Conformance evidence for the Initial Local Demand & Independently Authored Production Start slice (@immortalis/operator
// `establish-local-demand`). Authority: BLUE v5.2-A1 bounded implementation brief (native pin 2026-10-22T11:14:14.183Z) on main
// b6a959f050c08b22126e505ce21e38bb66939e34. Governing lock: spec/f027/spec-lock.json (F-027 v1.0), unchanged. This slice adds operator
// code, tests and a document only: no contracts, engine, protocol or testkit module, no owner, schema, source pin, gate or status moved.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EconomyDemandEnvelopeSchema,
  EconomyRealizationSchema,
  IssueDemandInputSchema,
  OWNER_ECONOMY,
  ProductionOperationSchema,
  ProductionRequestSchema,
  StartOperationInputSchema,
  economyDemandKey,
  economyRealizationKey,
  economyRequestId,
  economyRequestKey,
  productionOperationKey,
  productionReserveKey,
} from "@immortalis/contracts";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const DOC = "docs/initial-local-demand-admission-foundation.md";
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

/** Everything the slice composes or must leave untouched, exactly as it stood at main b6a959f050c08b22126e505ce21e38bb66939e34. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "packages/contracts/src/economy.ts":
    "53703c6eab2f1129c27b44f1c03904fdba60e33777523d0d95a570efb8b75e33",
  "packages/contracts/src/production.ts":
    "40ff84c02029ecd43811eb8c8cd6b5d32e8e6e505953c9bd3e997a6ae8f41e4b",
  "packages/contracts/src/population.ts":
    "68b17151e1b359440c6481ff093adcdfa299577ccf7cb77452bbdfaabebb07d9",
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/contracts/src/world-foundation.ts":
    "c22e815d803c4c677db8d3c1d47c9ddf920ac386db2809de37dfd42d47ba9337",
  "packages/engine/src/economy/adapter.ts":
    "677fef09f6a62d8e51574380f40725f5695c40f6a5384e92005fdc395038e1af",
  "packages/engine/src/economy/admission.ts":
    "ff5171fbc89339164f8f08e2af4534209c3ece13b3a070a6fb87e40c365beda0",
  "packages/engine/src/economy/derive.ts":
    "0248ff1d7999482d69ec7ff289f68334306e95e442cf092595dfb98c9e4e414b",
  "packages/engine/src/economy/provider.ts":
    "f3140211dc6b86f111799faa0ac42aeb6aebfd472d4132612165c087481bd283",
  "packages/engine/src/economy/integrity.ts":
    "93548d9357bc317fe9dd253956353ee840424ac69eaa41e2287a0f7825e2145b",
  "packages/engine/src/production/adapter.ts":
    "206655fa62a86fd12bda664615b1d6590bda9dd9919bd068e068a8c70ad0f3a9",
  "packages/engine/src/production/admission.ts":
    "00a008aaccdb38a48bda1f101327ff5edbc31be67ea545127d2719fe12aac8b6",
  "packages/engine/src/production/derive.ts":
    "9eb905d6e45590ee96ea961515dcba64e9b9adb6dbd88b3f92f06d3f6598cd1c",
  "packages/engine/src/production/provider.ts":
    "9780cbcf860633de5d7f46e355f8e1fad3a4b1d69d5696ff75b277f6cd55690c",
  "packages/engine/src/production/integrity.ts":
    "858fd65d9e5829c095362b67c340fc8bfb3c9e8fc07db6864d3788cfb435dd2c",
  "packages/engine/src/temporal/coordinator.ts":
    "afe8c28a662f3c9e1f5329665c6fdf60d724775c389a447be56c7ed7a8e02318",
  "packages/engine/src/temporal/providers.ts":
    "8c0813fef2fa6f47d0da64fd698d107e58edbf7bee8708feeff22b94f4001841",
  "packages/engine/src/owners/registry.ts":
    "2247b43cde66b48295b8b5371a37e16d381c165ca82e2ed4afd33440f24a879a",
  "packages/operator/src/locality.ts":
    "9d91fb48ff3c04289a41e4ecb5064f477994a7ec1a4fee69a89d34fdbb95f0af",
  "packages/operator/src/additional-source.ts":
    "56428eac482b003420120cca2e617fc019c1b1e59c09a37f0d2dca4ceb63111e",
  "packages/operator/src/additional-locality.ts":
    "5f1fea4718c816d755c086d2cfef6bffdbfdad62e3ac2f2935ba54e94bf4c782",
  "packages/operator/src/production-reserve.ts":
    "1450ef0711436d94c8f0738cdc5ce71e3d9a5e63c911bbc576ceda2c85a73efe",
  "packages/operator/src/initial-population.ts":
    "ad1824ac0d0c70d6d48ea5df315c6136c14a5cd9198613a15e40dfaf5cc04968",
  "packages/operator/src/initial-timed-governance.ts":
    "d73ad973c9ce40c1a2be91d95d1ee94cc52607310e510d4b511a592417df5334",
  "packages/operator/src/commands.ts":
    "826a8d68e7151f7a69f5ceace19fdfbd03941c28d327de0b5dd3d5a2fbdacad7",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
  "packages/operator/src/ledger.ts":
    "cecba030deca45997cfca4a4833f1f101c2797749cd58b036dbc01ac2683e79f",
  "packages/operator/src/ooc.ts":
    "082877d345b80e61f7e8f962e26b25a971377acf5859cabd1078d78dbbbd348e",
  "packages/operator/src/terminal.ts":
    "05c70dbf9b74a9518f1d249980f1372803c3dcfe2b802eb245d93a1ec14ecd0d",
};

describe("nothing outside the operator is touched", () => {
  it("the F-027 lock is the pinned blob, and the gates, register, contracts, the Economy, Production and Temporal owners, the registry, the earlier admission modules, commands.ts, the session and the ledger are byte-identical to main", () => {
    expect(gitBlob("spec/f027/spec-lock.json")).toBe("98830019d8aea67392808308e588678c99d57e2c");
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register)
      expect(JSON.stringify(row), row.id).not.toMatch(
        /initial-local-demand|establish-local-demand|InitialLocalDemand/,
      );
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the two authored inputs and the records they produce are the unchanged strict contracts with their unchanged fields, keys and owner", () => {
    const keys = (s: { shape: Record<string, unknown> }) => Object.keys(s.shape).sort();
    expect(keys(IssueDemandInputSchema as never)).toEqual(
      ["carrier", "demand_entry", "demand_envelope_id"].sort(),
    );
    expect(keys(StartOperationInputSchema as never)).toEqual(
      ["completion_at", "request_key", "reserve_id", "transformation"].sort(),
    );
    expect(keys(EconomyDemandEnvelopeSchema as never)).toEqual(
      [
        "allocation",
        "carrier_basis_ref",
        "carrier_ref",
        "demand_entry",
        "demand_envelope_id",
        "material_scope",
        "pre_commit_availability",
      ].sort(),
    );
    expect(keys(ProductionRequestSchema as never)).toEqual(
      ["priority_authority_ref", "request_id", "requested_output", "scope", "source"].sort(),
    );
    expect(keys(ProductionOperationSchema as never)).toEqual(
      [
        "claim",
        "operation_id",
        "request",
        "reserve",
        "status",
        "support_basis",
        "timing",
        "transformation",
      ].sort(),
    );
    expect(keys(EconomyRealizationSchema as never)).toEqual(
      [
        "close_stage",
        "delivery_result",
        "demand",
        "demand_envelope_id",
        "production",
        "realized_access",
        "realized_at",
        "request",
      ].sort(),
    );
    expect(OWNER_ECONOMY).toBe("economy");
    expect(economyDemandKey("d")).toBe("economy/demand/d");
    expect(economyRequestKey("request:d")).toBe("economy/request/request:d");
    expect(economyRequestId("d")).toBe("request:d");
    expect(economyRealizationKey("d")).toBe("economy/realization/d");
    expect(productionOperationKey("request:d")).toBe("production/operation/request:d");
    expect(productionReserveKey("r")).toBe("production/reserve/r");
    expect(IssueDemandInputSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(StartOperationInputSchema.safeParse({ extra: 1 }).success).toBe(false);
  });
});

describe("the command reuses the two existing owner operations in dependency order and adds no surface", () => {
  const src = code("packages/operator/src/initial-local-demand.ts");
  const live = src.replace(
    /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishInitialLocalDemandParams)/,
    "",
  );

  it("composes the Economy and Production owner operations and the existing session, confirmation and locality reads", () => {
    for (const needle of [
      "issueDemand(",
      "startOperation(",
      "LocalOperatorSession.open(",
      "requestOperatorConfirmation(",
      "establishedLocality(",
      "IssueDemandInputSchema",
      "StartOperationInputSchema",
      "EconomyDemandEnvelopeSchema",
      "ProductionOperationSchema",
    ])
      expect(src, needle).toContain(needle);
  });

  it("the live commit chain publishes the demand and its request, THEN the Production start", () => {
    const at = (s: string) => live.indexOf(s);
    expect(at("economy.issueDemand(")).toBeGreaterThan(-1);
    expect(at("economy.issueDemand(")).toBeLessThan(at("production.startOperation("));
    // exactly the two owner operations are called on the live campaign's adapters
    expect(live.match(/\b(?:economy|production)\.[A-Za-z]+\(/g)?.sort()).toEqual([
      "economy.issueDemand(",
      "production.startOperation(",
    ]);
  });

  it("the second act is a separate owner publication with its own identity, never part of the demand's", () => {
    expect(src).toContain("operator-initial-local-demand:${id}:${name}");
    expect(src).toContain('"demand" | "start"');
    expect(live).not.toMatch(/store\.commit\(|[^.]\bcommit\(/);
  });

  it("derives its expected values independently of the owner adapters and derivations", () => {
    expect(src).not.toMatch(
      /deriveEconomyRequest|deriveRealization|deriveAcceptedEntity|deriveHold/,
    );
    expect(src).toContain("export function expectedDemand(");
    expect(src).toContain("export function expectedStart(");
  });

  it("invents no persistence: no ledger, pin or receipt format is read or written, and no package is created in the operator's directory", () => {
    expect(src).not.toMatch(/IntentLedger|readPin|writePin|createExclusive|writeFileDurable/);
    expect(src).not.toMatch(/mkdirSync\(\s*params\.campaignDir/);
    expect(src).not.toMatch(/CanonicalCampaign\.create\(/);
    // the dry run reads the campaign's committed files and writes only inside its own scratch directory
    expect(src.match(/copyFileSync\(/g)).toHaveLength(1);
    expect(src).toContain("join(params.campaignDir, name), join(copy, name)");
    expect(src).not.toMatch(/writeFileSync|appendFileSync|renameSync|unlinkSync/);
  });

  it("owns no live time, advance, registration, stage or provider surface — time is only READ for comparison", () => {
    expect(src.replace(/import[\s\S]*?from\s+"[^"]+";/g, "")).not.toMatch(
      /establishCanonicalTime|TemporalCoordinator|registerObject|StageProviderRegistry|productionCompletionProvider|worldFallbackAcceptanceProvider|economyRealizationProvider|productionTemporalObject|\.advance\(|continueRemainder|PcMovement|ActorState|handoverExistingActor|travel_duration/,
    );
    expect(src).toContain("TEMPORAL_STATE_KEY");
    expect(src.match(/getFact\(TEMPORAL_STATE_KEY\)/g)).toHaveLength(1);
  });

  it("is exported by the operator package and by nothing as a host-callable tool", () => {
    expect(typeof operator.establishInitialLocalDemand).toBe("function");
    expect(typeof operator.readInitialLocalDemandFile).toBe("function");
    expect(typeof operator.initialLocalDemandId).toBe("function");
    expect(typeof operator.expectedDemand).toBe("function");
    expect(typeof operator.expectedRequest).toBe("function");
    expect(typeof operator.expectedStart).toBe("function");
  });

  it("the CLI lists exactly one new command, with its one new option, and documents the pre-play boundary", () => {
    expect(operator.USAGE).toContain("establish-local-demand --campaign <dir>");
    expect(operator.USAGE).toContain("--demand-file <file>");
    expect(operator.USAGE).toContain("docs/initial-local-demand-admission-foundation.md");
    expect(operator.USAGE).toContain("NO time is advanced");
    expect(operator.USAGE).toContain("the demand is NOT satisfied");
    expect(operator.USAGE).toContain("before any character is bound");
  });

  it("the new command's own help says it commits canonical facts and never claims it leaves the package unaltered", () => {
    const from = operator.USAGE.indexOf("establish-local-demand: for a campaign");
    const to = operator.USAGE.indexOf("locality-status:", from);
    expect(from).toBeGreaterThan(-1);
    expect(to).toBeGreaterThan(from);
    const help = operator.USAGE.slice(from, to).replace(/\s+/g, " ");
    expect(help).toContain("never creates, adopts, repairs or clears a campaign package");
    expect(help).toContain(
      "does commit the two separately confirmed owner acts (the demand with its request, then the Production operation with its claim and the Reserve's open claim) as canonical facts into the existing fresh pre-play package",
    );
    expect(help).not.toMatch(/never creates or alters a campaign package|never alters/);
    // the independent acts, the confirmation, the sequencing and the exclusions are intact
    for (const kept of [
      "SEPARATE act",
      "ONE explicit typed confirmation",
      "committed first and the Production start only after them",
      "an earlier demand is never rolled back",
      "NO time is advanced",
      "the demand is NOT satisfied",
    ])
      expect(help, kept).toContain(kept);
  });
});

describe("the document states what the slice is and is not", () => {
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  it("exists, pins the brief and the base, and keeps every gate where it was", () => {
    expect(doc).toContain("2026-10-22T11:14:14.183Z");
    expect(doc).toContain("b6a959f050c08b22126e505ce21e38bb66939e34");
    expect(doc).toContain("98830019d8aea67392808308e588678c99d57e2c");
    expect(doc).toContain("F-028/OB-030 remains Blocked");
  });
  it("separates the two acts, claims no time, output or satisfaction by the command, and rolls nothing back", () => {
    expect(doc).toContain("TWO separately authored opening acts");
    expect(doc).toContain("The demand never grants the second act");
    expect(doc).toContain("advances **no time**");
    expect(doc).toContain("registers no Temporal object");
    expect(doc).toContain("never silently rolled back or misreported");
    expect(doc).toContain("An independently changed second act");
  });
  it("scopes the witness to the existing owner chain plus the admission seam and names the missing external prerequisites", () => {
    expect(doc).toContain(
      "only the existing deterministic owner chain plus the new admission seam",
    );
    expect(doc).toContain("true-world productivity calibration");
    expect(doc).toContain("EXTERNAL PREREQUISITE MISSING");
  });
  it("leaves PR #72 and PR #73, and the saved campaign, untouched and on hold", () => {
    expect(doc).toContain("#72");
    expect(doc).toContain("#73");
    expect(doc).toContain("remain untouched and on hold");
    expect(doc).toContain("campaign-r5-phone");
    expect(doc).toContain("pc-namar-1");
  });
});
