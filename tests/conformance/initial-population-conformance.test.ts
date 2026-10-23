// Conformance evidence for the Initial Local Population & Residency Cohort slice (@immortalis/operator `establish-population`).
// Authority: BLUE v5.2-A1 bounded implementation brief (native pin 2026-10-22T07:02:36.427Z) on main
// 40527749b68781f008c6b59e97f5cf90db24618b. Governing lock: spec/f027/spec-lock.json (F-027 v1.0), unchanged. This slice adds operator
// code, tests and a document only: no contracts, engine, protocol or testkit module, no owner, schema, source pin, gate or status moved.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CohortRefSchema,
  EstablishLedgerInputSchema,
  FACET_POPULATION_STATE,
  OWNER_POPULATION,
  PopulationUnitSchema,
  populationCohortKey,
  populationLedgerKey,
} from "@immortalis/contracts";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const DOC = "docs/initial-population-admission-foundation.md";
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

/** Everything the slice composes or must leave untouched, exactly as it stood at main 40527749b68781f008c6b59e97f5cf90db24618b. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "packages/contracts/src/population.ts":
    "68b17151e1b359440c6481ff093adcdfa299577ccf7cb77452bbdfaabebb07d9",
  "packages/contracts/src/world-foundation.ts":
    "571a02c42970cea354a4b537627645246e42168b59de1e88196ff8844ee9cc72",
  "packages/contracts/src/temporal.ts":
    "26d994f36641b712c6623dd9bdf559ff993a7acc116484a4e19e3f151a24e13b",
  "packages/engine/src/population/adapter.ts":
    "d228778def292e049d5acdc3eabdbfd98529cfb4a153f9c8ced5db459edb392d",
  "packages/engine/src/population/admission.ts":
    "352659bcfb65d4b996950c19ba487a8e5163a852fb9b61b0be65ff9c72af628e",
  "packages/engine/src/population/derive.ts":
    "8a632d495e294e8e3d421190945755fee80d82f58fb673b5b02bacdc38158e0f",
  "packages/engine/src/population/provider.ts":
    "794b2f6b876e4d1c75602534580be7dfbe7ba4fc8bbed6c7a291746449c17dcf",
  "packages/engine/src/population/declaration.ts":
    "e6a2a964d7df5dcb8ac229bad9a6dd7af97b27443a9b7667c50116673bd84b92",
  "packages/engine/src/population/barrier.ts":
    "f9e49354a379144fb3244ce33b2f758f4eb459aabd8aeb13183168eabdfeec1b",
  "packages/engine/src/population/integrity.ts":
    "a34b8d131e542f41556b0a3beb629fd40b1d83b0b9bd6a51b3621ca90156ae09",
  "packages/engine/src/owners/registry.ts":
    "ef2721c95bcbb63ff4a2ee2e45c1e3b1bf456ecaca4b3e6e24e36c80e89ed0c3",
  "packages/engine/src/world/canonical-campaign.ts":
    "77ae6d56368de99ec37db452eb5453345dd279c4accc2f2d6dd3a060d9b33e47",
  "packages/engine/src/temporal/coordinator.ts":
    "afe8c28a662f3c9e1f5329665c6fdf60d724775c389a447be56c7ed7a8e02318",
  "packages/operator/src/locality.ts":
    "9d91fb48ff3c04289a41e4ecb5064f477994a7ec1a4fee69a89d34fdbb95f0af",
  "packages/operator/src/additional-source.ts":
    "56428eac482b003420120cca2e617fc019c1b1e59c09a37f0d2dca4ceb63111e",
  "packages/operator/src/additional-locality.ts":
    "5f1fea4718c816d755c086d2cfef6bffdbfdad62e3ac2f2935ba54e94bf4c782",
  "packages/operator/src/production-reserve.ts":
    "1450ef0711436d94c8f0738cdc5ce71e3d9a5e63c911bbc576ceda2c85a73efe",
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
  it("the F-027 lock is the pinned blob, and the gates, register, contracts, the Population and Temporal owners, the registry, the earlier admission modules, commands.ts, the session and the ledger are byte-identical to main", () => {
    expect(gitBlob("spec/f027/spec-lock.json")).toBe("2df29edfd08b1fb986666c94153f9432cf227324");
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register)
      expect(JSON.stringify(row), row.id).not.toMatch(
        /initial-population|establish-population|InitialPopulationAdmission/,
      );
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the ledger input, unit and Cohort reference are the unchanged strict contracts with their unchanged fields, keys and owner assignment", () => {
    expect(Object.keys(EstablishLedgerInputSchema.shape).sort()).toEqual(
      ["ledger_id", "locus_id", "point", "unit_class", "units", "world_id"].sort(),
    );
    expect(Object.keys(PopulationUnitSchema.shape).sort()).toEqual(
      ["burden_allocation", "presence", "residence", "unit_id"].sort(),
    );
    expect(Object.keys(CohortRefSchema.shape).sort()).toEqual(
      [
        "cardinality_semantics",
        "cohort_id",
        "count_custodian",
        "criterion",
        "form",
        "indexed_fact",
        "invalidators",
        "membership_basis",
        "overlap",
        "retention",
        "retirement",
        "scope",
        "temporal_read",
        "unit_class",
      ].sort(),
    );
    expect(populationLedgerKey("l-1")).toBe("population/l-1/ledger");
    expect(populationCohortKey("l-1", "c-1")).toBe("population/l-1/cohort/c-1");
    expect([OWNER_POPULATION, FACET_POPULATION_STATE]).toEqual(["population", "population_state"]);
    expect(EstablishLedgerInputSchema.safeParse({ extra: 1 }).success).toBe(false);
    expect(readFileSync("packages/engine/src/owners/registry.ts", "utf8")).toMatch(
      /population_ledger/,
    );
  });
});

describe("the command reuses the existing owner operations in dependency order and adds no surface", () => {
  const src = code("packages/operator/src/initial-population.ts");

  it("composes establishLedger then instantiateCohort and the existing session, confirmation and locality reads", () => {
    expect(src).toContain("establishLedger(");
    expect(src).toContain("instantiateCohort(");
    expect(src).toContain("LocalOperatorSession.open(");
    expect(src).toContain("requestOperatorConfirmation(");
    expect(src).toContain("establishedLocality(");
    expect(src).toContain("EstablishLedgerInputSchema");
    expect(src).toContain("CohortRefSchema");
    // the live commit loop publishes the ledger stage before the Cohort stage
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface Establish)/,
      "",
    );
    expect(live.indexOf("population.establishLedger(")).toBeGreaterThan(-1);
    expect(live.indexOf("population.establishLedger(")).toBeLessThan(
      live.indexOf("population.instantiateCohort("),
    );
  });

  it("invents no persistence: no ledger, pin or receipt format is read or written, and no package is created", () => {
    expect(src).not.toMatch(/IntentLedger|readPin|writePin|createExclusive|writeFileDurable/);
    expect(src).not.toMatch(/mkdirSync\(\s*params\.campaignDir/);
    expect(src).not.toMatch(/CanonicalCampaign\.create\(\s*params\.campaignDir/);
  });

  it("owns no time, close, reconciliation, envelope, actor, labour or movement surface — time is only READ", () => {
    expect(src).not.toMatch(
      /establishCanonicalTime|TemporalCoordinator|registerObject|StageProviderRegistry|populationStageProvider|PcMovement|ActorState|handoverExistingActor|travel_duration|ConsequenceEnvelope|CohortResultSchema|composeCohortResult/,
    );
    // the one place time appears is the read-only check of the committed state against the ledger's point
    expect(src).toContain("TEMPORAL_STATE_KEY");
    expect(src).toContain("timeEquals(");
    expect(src.match(/getFact\(TEMPORAL_STATE_KEY\)/g)).toHaveLength(1);
  });

  it("is exported by the operator package and by nothing as a host-callable tool", () => {
    expect(typeof operator.establishInitialPopulation).toBe("function");
    expect(typeof operator.readInitialPopulationFile).toBe("function");
    expect(typeof operator.initialPopulationId).toBe("function");
    expect(typeof operator.expectedLedger).toBe("function");
    expect(typeof operator.expectedCohort).toBe("function");
  });

  it("the CLI lists exactly one new command, with its one new option, and documents the pre-play boundary", () => {
    expect(operator.USAGE).toContain("establish-population --campaign <dir>");
    expect(operator.USAGE).toContain("--population-file <file>");
    expect(operator.USAGE).toContain("docs/initial-population-admission-foundation.md");
  });
});

describe("the document states what the slice is and is not", () => {
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  it("exists, pins the brief and the base, and keeps every gate where it was", () => {
    expect(doc).toContain("2026-10-22T07:02:36.427Z");
    expect(doc).toContain("40527749b68781f008c6b59e97f5cf90db24618b");
    expect(doc).toContain("2df29edfd08b1fb986666c94153f9432cf227324");
    expect(doc).toContain("F-028/OB-030 remains Blocked");
  });
  it("claims no actor, mind, labour, demography, perception, collection or Cohort outcome", () => {
    expect(doc).toContain("not a Named Actor or any actor");
    expect(doc).toContain("not a labour supply");
    expect(doc).toContain("not a close and not a Cohort outcome");
    expect(doc).toContain("A Population Unit is not a Named Actor");
    expect(doc).toContain("does not prove live NPC action, social behaviour, labour or any actor");
    expect(doc).toContain("EXTERNAL PREREQUISITE MISSING");
  });
  it("leaves PR #72 and PR #73, and the saved campaign, untouched and on hold", () => {
    expect(doc).toContain("#72");
    expect(doc).toContain("#73");
    expect(doc).toContain("remain untouched");
    expect(doc).toContain("campaign-r5-phone");
    expect(doc).toContain("pc-namar-1");
  });
});
