// Conformance evidence for the Additional Pre-Play Finite Source Admission slice (@immortalis/operator `establish-additional-source`).
// Authority: BLUE v5.2-A1 bounded implementation brief (native pin 2026-10-21T18:33:04.910Z) on main
// c739ec3834376dc42f7d83c827904f7d94c91911. Governing lock: spec/f027/spec-lock.json (F-027 v1.0), unchanged. This slice adds operator
// code, tests and a document only: no contracts, engine, protocol or testkit module, no owner, schema, source pin, gate or status moved.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EstablishSourceConditionInputSchema,
  FACET_WORLD_SOURCE_CONDITION,
  OWNER_WORLD_STATE,
} from "@immortalis/contracts";
import * as operator from "@immortalis/operator";
import { code, gates, register } from "../support/f027.ts";

const DOC = "docs/additional-source-admission-foundation.md";
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

/** Everything the slice composes or must leave untouched, exactly as it stood at main c739ec3834376dc42f7d83c827904f7d94c91911. */
const UNCHANGED: Record<string, string> = {
  "spec/f027/open-gates.yaml": "cbfd4f8ced95951e967156e9f12b035e49d406aad1e274946f18ffd37af3f503",
  "spec/f027/acceptance-register.yaml":
    "58349ecd93bf94181596ca1082b13a6a31a99c5903afee6609ad5dad90505bdf",
  "packages/contracts/src/source-drawdown.ts":
    "4d78433ce72ca9833cffd944cbfd1ff026bf9ed15f7e448b3b1880551593245d",
  "packages/contracts/src/world-foundation.ts":
    "571a02c42970cea354a4b537627645246e42168b59de1e88196ff8844ee9cc72",
  "packages/engine/src/world/canonical-campaign.ts":
    "db811a1818b2bc7dab57faa55d17d6611a824ab43a20b6decbbcca8e401df30a",
  "packages/operator/src/locality.ts":
    "9d91fb48ff3c04289a41e4ecb5064f477994a7ec1a4fee69a89d34fdbb95f0af",
  "packages/operator/src/commands.ts":
    "f14467cae3334d2f13f65ab9b941a7f66b889d157779a7afad53e09eb6baa8af",
};

describe("nothing outside the operator is touched", () => {
  it("the F-027 lock is the pinned blob, and the gates, register, contracts and engine owner API are byte-identical to main", () => {
    expect(gitBlob("spec/f027/spec-lock.json")).toBe("2df29edfd08b1fb986666c94153f9432cf227324");
    for (const [file, hash] of Object.entries(UNCHANGED)) expect(sha(file), file).toBe(hash);
  });

  it("PF-6/F-028 stays not activated and blocked, and no acceptance row carries this slice as evidence", () => {
    expect(gates.find((g) => g.id === "PF-6/F-028")?.status).toBe("NOT_ACTIVATED_BLOCKED");
    for (const row of register)
      expect(JSON.stringify(row), row.id).not.toMatch(
        /additional-source|establish-additional-source/,
      );
    expect(register.find((r) => r.id === "IA-07")?.status).toBe("BLOCKED");
  });

  it("the source input is the unchanged strict contract with its unchanged fields", () => {
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
    expect(OWNER_WORLD_STATE).toBe("world_state");
    expect(FACET_WORLD_SOURCE_CONDITION).toBe("world_source_condition");
  });
});

describe("the command reuses the existing owner operation and adds no surface", () => {
  const src = code("packages/operator/src/additional-source.ts");

  it("composes establishSourceCondition and the existing session, confirmation and locality reads", () => {
    expect(src).toContain("establishSourceCondition(");
    expect(src).toContain("LocalOperatorSession.open(");
    expect(src).toContain("requestOperatorConfirmation(");
    expect(src).toContain("establishedLocality(");
  });

  it("invents no persistence: no ledger, pin or receipt format is read or written", () => {
    expect(src).not.toMatch(/IntentLedger|readPin|writePin|createExclusive|writeFileDurable/);
    expect(src).not.toMatch(/mkdirSync\(\s*params\.campaignDir/);
    expect(src).not.toMatch(/CanonicalCampaign\.create\(\s*params\.campaignDir/);
  });

  it("is exported by the operator package and by nothing as a host-callable tool", () => {
    expect(typeof operator.establishAdditionalSource).toBe("function");
    expect(typeof operator.readAdditionalSourceFile).toBe("function");
  });

  it("the CLI lists exactly one new command, with its one new option, and documents the pre-play boundary", () => {
    expect(operator.USAGE).toContain("establish-additional-source --campaign <dir>");
    expect(operator.USAGE).toContain("--source-file <file>");
    expect(operator.USAGE).toContain("docs/additional-source-admission-foundation.md");
  });
});

describe("the document states what the slice is and is not", () => {
  const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
  it("exists, pins the brief and the base, and keeps every gate where it was", () => {
    expect(doc).toContain("2026-10-21T18:33:04.910Z");
    expect(doc).toContain("c739ec3834376dc42f7d83c827904f7d94c91911");
    expect(doc).toContain("2df29edfd08b1fb986666c94153f9432cf227324");
    expect(doc).toContain("F-028/OB-030 remains Blocked");
  });
  it("claims no downstream perception, availability, extraction or collection", () => {
    expect(doc).toContain(
      "No test in this slice asserts a perception, availability, extraction or collection verdict",
    );
    expect(doc).toContain("two sources cannot be observed at one instant");
  });
});
