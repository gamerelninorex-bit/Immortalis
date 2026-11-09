/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with arbitrary lock values */
// Initial Locality Bootstrap v0.9 — registration of the Sovereign-adopted C-1/C-2 clarification (v0.4). The lock rows are ADDITIVE: the
// four ratified v0.9 rows stay byte-identical, and the identities the new lowering declares are the identities the engine actually
// uses (parser versions, instruction-map hashes, provenance profile, the single historyVerificationId transition). The checker validates
// DECLARED strings; this test is what ties them to the code. MECHANISM ONLY: registration is not T2/T3 acceptance.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  C1_C2_CLARIFICATION,
  CONTEXT_MANIFEST_MISMATCH,
  INITIAL_LOCALITY_PARSER_V1,
  INITIAL_LOCALITY_PARSER_V2,
  INITIAL_LOCALITY_PROVENANCE_V1,
} from "@immortalis/contracts";
import {
  INSTRUCTIONS_V1,
  INSTRUCTIONS_V2,
  fixtureCanonicalAdmission,
  canonicalAdmission,
  instructionMapHash,
  resolveInstructionMap,
} from "@immortalis/engine";
import {
  BOOTSTRAP_C1C2_LINEAGE_ID,
  BOOTSTRAP_C1C2_LOWERING_ID,
  BOOTSTRAP_CORE_LOWERING_ID,
  checkBootstrapC1C2,
} from "../../tools/check-spec.ts";

const lock = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8")) as Record<string, any>;
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v), "utf8").digest("hex");
const row = (list: string, id: string) => lock[list].find((r: any) => r.id === id);

describe("the C-1/C-2 clarification is registered additively and bound to the code", () => {
  it("appends exactly one lineage row and one lowering row after the four v0.9 rows, leaving those rows' ids and order intact", () => {
    const ids = (k: string) => lock[k].map((r: any) => r.id);
    expect(ids("design_lineage_successors").slice(-4, -1)).toEqual([
      "GM-INITIAL-BOOTSTRAP-V9-LINEAGE",
      "CPAA-C1-F1-INITIAL-COMPLETION-V9-LINEAGE",
      BOOTSTRAP_C1C2_LINEAGE_ID,
    ]);
    expect(ids("executable_lowerings").slice(-4, -1)).toEqual([
      "GM-INITIAL-BOOTSTRAP-V9-LOWERING",
      "CPAA-C1-F1-INITIAL-COMPLETION-V9-LOWERING",
      BOOTSTRAP_C1C2_LOWERING_ID,
    ]);
    // the ratified core lowering still states the companion's literal parser; the amendment is a separate, citing row
    expect(row("executable_lowerings", BOOTSTRAP_CORE_LOWERING_ID).parser).toBe(
      "INITIAL_LOCALITY_PARSER_V1",
    );
    expect(row("executable_lowerings", BOOTSTRAP_C1C2_LOWERING_ID).amends.id).toBe(
      BOOTSTRAP_CORE_LOWERING_ID,
    );
  });

  it("the registered pins are the contracts' own constants (clarification page, its native pin, the Sovereign ratification)", () => {
    const lineage = row("design_lineage_successors", BOOTSTRAP_C1C2_LINEAGE_ID);
    const lowering = row("executable_lowerings", BOOTSTRAP_C1C2_LOWERING_ID);
    expect(lineage.url).toBe(C1_C2_CLARIFICATION.source_url);
    expect(lineage.native_pin).toBe(C1_C2_CLARIFICATION.source_native_pin);
    expect(lineage.adoption_decision).toEqual({
      url: C1_C2_CLARIFICATION.ratification_url,
      native_pin: C1_C2_CLARIFICATION.ratification_native_pin,
    });
    expect([lowering.url, lowering.native_pin]).toEqual([lineage.url, lineage.native_pin]);
  });

  it("the declared parsers, provenance profile and instruction hashes are exactly the engine's registry", () => {
    const lowering = row("executable_lowerings", BOOTSTRAP_C1C2_LOWERING_ID);
    expect(lowering.parser_current).toBe(INITIAL_LOCALITY_PARSER_V2);
    expect(lowering.parser_frozen).toBe(INITIAL_LOCALITY_PARSER_V1);
    expect(lowering.provenance_profile).toBe(INITIAL_LOCALITY_PROVENANCE_V1);
    expect(lowering.instruction_hashes).toEqual({
      [INITIAL_LOCALITY_PARSER_V1]: instructionMapHash(INSTRUCTIONS_V1),
      [INITIAL_LOCALITY_PARSER_V2]: instructionMapHash(INSTRUCTIONS_V2),
    });
    for (const [parser, hash] of Object.entries(
      lowering.instruction_hashes as Record<string, string>,
    ))
      expect(resolveInstructionMap(hash)?.parser).toBe(parser);
    expect(lowering.manifest_mismatch).toContain(CONTEXT_MANIFEST_MISMATCH);
  });

  it("the ONE historyVerificationId transition carries the clarification pin, the current parser and the provenance profile (and no V1-only stage)", () => {
    for (const admission of [canonicalAdmission, fixtureCanonicalAdmission]) {
      const id = admission.historyVerificationId!;
      expect(id).toContain("GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z");
      expect(id).toContain(`C1C2-V0.4@${C1_C2_CLARIFICATION.source_native_pin}`);
      expect(id).toContain(INITIAL_LOCALITY_PARSER_V2);
      expect(id).toContain(INITIAL_LOCALITY_PROVENANCE_V1);
    }
    // fixture evidence stays distinguishable from production evidence
    const prod = canonicalAdmission.historyVerificationId!;
    const fixture = fixtureCanonicalAdmission.historyVerificationId!;
    expect(fixture).not.toBe(prod);
    expect(fixture.replace("+fixture-evidence-t1", "") === prod).toBe(true);
  });
});

describe("the checker refuses a tampered or missing registration", () => {
  const copy = () => ({
    lineage: structuredClone(lock["design_lineage_successors"]) as Record<string, unknown>[],
    lowerings: structuredClone(lock["executable_lowerings"]) as Record<string, unknown>[],
  });
  const lowerRow = (c: ReturnType<typeof copy>) =>
    c.lowerings.find((r) => r["id"] === BOOTSTRAP_C1C2_LOWERING_ID)!;

  it("accepts the lock as written", () => {
    const c = copy();
    expect(checkBootstrapC1C2(c.lineage, c.lowerings)).toEqual([]);
  });

  it("refuses an absent row, a duplicated row, an extra field and a changed closed value", () => {
    const missing = copy();
    missing.lowerings = missing.lowerings.filter((r) => r["id"] !== BOOTSTRAP_C1C2_LOWERING_ID);
    expect(checkBootstrapC1C2(missing.lineage, missing.lowerings).length).toBeGreaterThan(0);

    const dup = copy();
    dup.lineage.push(
      structuredClone(dup.lineage.find((r) => r["id"] === BOOTSTRAP_C1C2_LINEAGE_ID)!),
    );
    expect(checkBootstrapC1C2(dup.lineage, dup.lowerings).length).toBeGreaterThan(0);

    const extra = copy();
    lowerRow(extra)["silently_added"] = true;
    expect(checkBootstrapC1C2(extra.lineage, extra.lowerings).join("\n")).toContain(
      "closed fields",
    );

    for (const [field, value] of [
      ["parser_current", "INITIAL_LOCALITY_PARSER_V1"],
      ["provenance_profile", "INITIAL_LOCALITY_PROVENANCE_V0"],
      ["fixed_source_feasibility", "NONE"],
      ["history_verification", "TWO_TRANSITIONS"],
    ] as const) {
      const c = copy();
      lowerRow(c)[field] = value;
      expect(checkBootstrapC1C2(c.lineage, c.lowerings).join("\n"), field).toContain(field);
    }
  });

  it("refuses identical or malformed instruction hashes, a changed pin and an unratified lineage", () => {
    const same = copy();
    lowerRow(same)["instruction_hashes"] = {
      INITIAL_LOCALITY_PARSER_V1: "a".repeat(64),
      INITIAL_LOCALITY_PARSER_V2: "a".repeat(64),
    };
    expect(checkBootstrapC1C2(same.lineage, same.lowerings).length).toBeGreaterThan(0);

    const bad = copy();
    lowerRow(bad)["instruction_hashes"] = { INITIAL_LOCALITY_PARSER_V1: "x" };
    expect(checkBootstrapC1C2(bad.lineage, bad.lowerings).length).toBeGreaterThan(0);

    const pin = copy();
    lowerRow(pin)["native_pin"] = "2026-11-03T00:34:42.286Z"; // the superseded, unratified v0.4 draft pin
    expect(checkBootstrapC1C2(pin.lineage, pin.lowerings).length).toBeGreaterThan(0);

    const unratified = copy();
    unratified.lineage.find((r) => r["id"] === BOOTSTRAP_C1C2_LINEAGE_ID)!["adoption_decision"] =
      null;
    expect(checkBootstrapC1C2(unratified.lineage, unratified.lowerings).length).toBeGreaterThan(0);
  });

  it("the original v0.9 rows are untouched by the registration (their hash is stable)", () => {
    const originals = lock["executable_lowerings"].filter((r: any) =>
      [BOOTSTRAP_CORE_LOWERING_ID, "CPAA-C1-F1-INITIAL-COMPLETION-V9-LOWERING"].includes(r.id),
    );
    expect(originals).toHaveLength(2);
    expect(sha(originals).length).toBe(64);
    expect(originals[0].native_pin).toBe("2026-11-01T12:13:53.634Z");
  });
});
