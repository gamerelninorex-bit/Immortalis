// Conformance evidence for the Additional Pre-Play Locality With One Source slice (@immortalis/operator `establish-additional-locality`).
// Authority: BLUE v5.2-A1 bounded implementation brief (native pin 2026-10-22T01:26:01.691Z) on main
// a10421dd2f433bc5bdd90d03ff39ebccfc96448b. Governing lock: spec/f027/spec-lock.json (F-027 v1.0), unchanged. This slice adds operator
// code, tests and a document only: no contracts, engine, protocol or testkit module, no owner, schema, source pin, gate or status moved.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EstablishSourceConditionInputSchema,
  FACET_WORLD_LOCUS,
  FACET_WORLD_SOURCE_CONDITION,
  OWNER_WORLD_STATE,
  WorldLocusSchema,
} from "@immortalis/contracts";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const DOC = "docs/additional-locality-admission-foundation.md";
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

/** Everything the slice composes or must leave untouched, exactly as it stood at main a10421dd2f433bc5bdd90d03ff39ebccfc96448b. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "packages/contracts/src/source-drawdown.ts":
    "4d78433ce72ca9833cffd944cbfd1ff026bf9ed15f7e448b3b1880551593245d",
  "packages/contracts/src/world-foundation.ts":
    "571a02c42970cea354a4b537627645246e42168b59de1e88196ff8844ee9cc72",
  "packages/engine/src/world/canonical-campaign.ts":
    "77ae6d56368de99ec37db452eb5453345dd279c4accc2f2d6dd3a060d9b33e47",
  "packages/operator/src/locality.ts":
    "9d91fb48ff3c04289a41e4ecb5064f477994a7ec1a4fee69a89d34fdbb95f0af",
  "packages/operator/src/commands.ts":
    "826a8d68e7151f7a69f5ceace19fdfbd03941c28d327de0b5dd3d5a2fbdacad7",
  "packages/operator/src/session.ts":
    "01a0d46c417d24f568070e348dc4ea0e373e99bac66b098f92a849575c927574",
};

describe("nothing outside the operator is touched", () => {
  it("the F-027 lock is the pinned blob, and the gates, register, contracts, engine owner API, locality.ts, commands.ts and the session are byte-identical to main", () => {
    expect(gitBlob("spec/f027/spec-lock.json")).toBe("2df29edfd08b1fb986666c94153f9432cf227324");
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register)
      expect(JSON.stringify(row), row.id).not.toMatch(
        /additional-locality|establish-additional-locality/,
      );
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the source input and the locus value are the unchanged strict contracts with their unchanged fields", () => {
    expect(Object.keys(EstablishSourceConditionInputSchema.shape).sort()).toEqual(
      [
        "access_facts",
        "dimension",
        "locus_id",
        "material_class",
        "quantity",
        "source_key",
        "statement",
        "world_id",
      ].sort(),
    );
    // the four original fields are unchanged; S1-P1 W2a added the one OPTIONAL typed acoustic_profile_v1 (absent on every locus this
    // slice authors, so its serialization and its admission are exactly what they were)
    expect(Object.keys(WorldLocusSchema.shape).sort()).toEqual(
      ["acoustic_profile_v1", "constraints", "designation", "locus_id", "world"].sort(),
    );
    expect(WorldLocusSchema.shape.acoustic_profile_v1.safeParse(undefined).success).toBe(true);
    expect(OWNER_WORLD_STATE).toBe("world_state");
    expect(FACET_WORLD_LOCUS).toBe("world_locus");
    expect(FACET_WORLD_SOURCE_CONDITION).toBe("world_source_condition");
  });

  it("the predecessor additional-source module changed only by exporting two read-only helpers it already had", () => {
    expect(sha("packages/operator/src/additional-source.ts")).toBe(
      "56428eac482b003420120cca2e617fc019c1b1e59c09a37f0d2dca4ceb63111e",
    );
    const text = readFileSync("packages/operator/src/additional-source.ts", "utf8");
    expect(text).toContain("export function sourceProblems(");
    expect(text).toContain("export function establishedLocality(");
    expect(text).toContain("export type EstablishedLocality =");
  });
});

describe("the command reuses the existing owner operations in dependency order and adds no surface", () => {
  const src = code("packages/operator/src/additional-locality.ts");

  it("composes establishLocus then establishSourceCondition and the existing session, confirmation and locality reads", () => {
    expect(src).toContain("establishLocus(");
    expect(src).toContain("establishSourceCondition(");
    expect(src).toContain("LocalOperatorSession.open(");
    expect(src).toContain("requestOperatorConfirmation(");
    expect(src).toContain("establishedLocality(");
    // the live commit loop publishes the locus stage before the source stage
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface Establish)/,
      "",
    );
    expect(live.indexOf("campaign.establishLocus(")).toBeGreaterThan(-1);
    expect(live.indexOf("campaign.establishLocus(")).toBeLessThan(
      live.indexOf("campaign.establishSourceCondition("),
    );
    expect(src).toMatch(/stages:\s*readonly \[Stage, Stage\]|name: "locus"[\s\S]*name: "source"/);
  });

  it("invents no persistence: no ledger, pin or receipt format is read or written, and no package is created", () => {
    expect(src).not.toMatch(/IntentLedger|readPin|writePin|createExclusive|writeFileDurable/);
    expect(src).not.toMatch(/mkdirSync\(\s*params\.campaignDir/);
    expect(src).not.toMatch(/CanonicalCampaign\.create\(\s*params\.campaignDir/);
  });

  it("owns no route, distance, edge, travel, time or actor surface", () => {
    expect(src).not.toMatch(/travel_duration|PcMovement|Temporal|ActorState|handoverExistingActor/);
  });

  it("is exported by the operator package and by nothing as a host-callable tool", () => {
    expect(typeof operator.establishAdditionalLocality).toBe("function");
    expect(typeof operator.readAdditionalLocalityFile).toBe("function");
    expect(typeof operator.additionalLocalityId).toBe("function");
  });

  it("the CLI lists exactly one new command, with its one new option, and documents the pre-play boundary", () => {
    expect(operator.USAGE).toContain("establish-additional-locality --campaign <dir>");
    expect(operator.USAGE).toContain("--locality-file <file>");
    expect(operator.USAGE).toContain("docs/additional-locality-admission-foundation.md");
  });
});

describe("the document states what the slice is and is not", () => {
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  it("exists, pins the brief and the base, and keeps every gate where it was", () => {
    expect(doc).toContain("2026-10-22T01:26:01.691Z");
    expect(doc).toContain("a10421dd2f433bc5bdd90d03ff39ebccfc96448b");
    expect(doc).toContain("2df29edfd08b1fb986666c94153f9432cf227324");
    expect(doc).toContain("F-028/OB-030 remains Blocked");
  });
  it("claims no route, travel, movement, perception, availability, extraction or collection", () => {
    expect(doc).toContain(
      "No test in this slice asserts a route, travel, movement, perception, availability, extraction or collection verdict",
    );
    expect(doc).toContain("A character at the first locus is not co-located with the new source");
  });
  it("leaves PR #72 and PR #73 untouched and on hold", () => {
    expect(doc).toContain("#72");
    expect(doc).toContain("#73");
    expect(doc).toContain("remain untouched");
  });
});
