/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with arbitrary lock values */
// F-014B A0 — spec-lock custody and encoding (BLUE S11 Q5; A0 scoped Hard Preflight PASS, "custody encoding"). The lowering row carries ONE
// native Notion url/pin (BLUE's A0 PASS brief) and a four-entry `authority_lineage` (T-1 source, Sovereign ratification, BLUE decisions
// record, the GitHub pointer to the immutable accepted source-lock document). `tools/check-spec.ts` asserts every one of those values by
// EXACT equality, including the commit SHA and the path; this test shows that each tampering is caught, and that the checker's values are
// the very values the engine carries. MECHANISM ONLY: registration is not acceptance.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  A0_BLUE_DECISIONS_RECORD,
  A0_BLUE_PASS_BRIEF,
  A0_SOURCE_LOCK_CUSTODY,
  CAL_TIME_T1_HISTORY_POLICY_SEGMENT,
  CAL_TIME_T1_LINEAGE_ID,
  CAL_TIME_T1_LOWERING_ID,
  CAL_TIME_T1_RATIFICATION,
  CAL_TIME_T1_SOURCE,
  INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE,
  INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
  MS_HISTORY_POLICY_SUFFIX,
  MS_V3_CLOCK_ORIGIN_HISTORY_POLICY_SEGMENT,
  TEMPORAL_CAPTURED_V2_GENESIS_RULE,
  canonicalAdmission,
} from "@immortalis/engine";
import {
  CLOCK_ORIGIN,
  CLOCK_ORIGIN_AUTHORITY_LINEAGE,
  REQUIRED_DESIGN_LINEAGE,
  REQUIRED_EXECUTABLE_LOWERINGS,
  checkClockOriginLowering,
  checkSpec,
} from "../../tools/check-spec.ts";

const lock = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8")) as Record<string, any>;
const read = (rel: string) => readFileSync(rel, "utf8");
const row = (list: string, id: string) => lock[list].find((r: any) => r.id === id);
const lowering = () => row("executable_lowerings", CLOCK_ORIGIN.lowering_id);

describe("the lowering row carries one native citation and a checked authority lineage", () => {
  it("is appended after the ROADBED rows (lineage and lowering, both last), exactly once each, never executable as lineage", () => {
    const ids = (k: string) => lock[k].map((r: any) => r.id);
    expect(ids("design_lineage_successors").slice(-2)).toEqual([
      "ROADBED-FREIGHT-FI-LINEAGE",
      CLOCK_ORIGIN.lineage_id,
    ]);
    expect(ids("executable_lowerings").slice(-2)).toEqual([
      "ROADBED-FREIGHT-FI-LOWERING",
      CLOCK_ORIGIN.lowering_id,
    ]);
    const lineage = row("design_lineage_successors", CLOCK_ORIGIN.lineage_id);
    expect(lineage).toMatchObject({
      of_frozen_source: null,
      status: "DESIGN_RATIFIED",
      executable: false,
      narrows_frozen_pin: false,
      supersedes: null,
      superseded_by: null,
      url: CLOCK_ORIGIN.t1.url,
      native_pin: CLOCK_ORIGIN.t1.pin,
    });
    expect(lineage.sections).toHaveLength(5);
    expect(REQUIRED_DESIGN_LINEAGE[CLOCK_ORIGIN.lineage_id]).toBeDefined();
    expect(REQUIRED_EXECUTABLE_LOWERINGS[CLOCK_ORIGIN.lowering_id]).toBeDefined();
  });

  it("holds exactly ONE native Notion url/pin: BLUE's A0 PASS brief; the other sources live in the checked authority_lineage", () => {
    const r = lowering();
    expect(r.url).toBe(CLOCK_ORIGIN.brief.url);
    expect(r.native_pin).toBe(CLOCK_ORIGIN.brief.pin);
    expect(r.authority_lineage).toEqual(CLOCK_ORIGIN_AUTHORITY_LINEAGE);
    expect(r.authority_lineage).toHaveLength(4);
    expect(r.authority_lineage[0]).toContain(`${CLOCK_ORIGIN.t1.url} @ ${CLOCK_ORIGIN.t1.pin}`);
    expect(r.authority_lineage[1]).toContain(
      `${CLOCK_ORIGIN.ratification.url} @ ${CLOCK_ORIGIN.ratification.pin}`,
    );
    expect(r.authority_lineage[2]).toContain(
      `${CLOCK_ORIGIN.decisions.url} @ ${CLOCK_ORIGIN.decisions.pin}`,
    );
    // the custody pointer: repository, immutable commit SHA, immutable path (never a branch or PR head)
    expect(r.authority_lineage[3]).toBe(
      "gamerelninorex-bit/Immortalis@37ba11bd0f0f068a22731f87351a0fd9a16a885b:docs/f014b/a0-clock-origin-source-lock.md",
    );
    expect(r.cites_design_lineage).toEqual([
      CLOCK_ORIGIN.lineage_id,
      "GM-INITIAL-BOOTSTRAP-V9-LINEAGE",
    ]);
    expect(r.fact_kinds).toEqual(["temporal_origin", "temporal_state", "initial_setup_input"]);
    expect(r.primary_im).toBe("IM-02");
    expect(Object.hasOwn(r, "operation")).toBe(false);
  });

  it("the checker accepts the repository as it is", () => {
    expect(checkSpec(process.cwd())).toEqual([]);
    expect(checkClockOriginLowering(lock["executable_lowerings"], read)).toEqual([]);
  });
});

describe("the checker asserts EXACT equality, so each tampering of the custody is caught", () => {
  const withRow = (edit: (r: any) => void) => {
    const rows = structuredClone(lock["executable_lowerings"]) as any[];
    edit(rows.find((r) => r.id === CLOCK_ORIGIN.lowering_id));
    return checkClockOriginLowering(rows, read);
  };
  const lineageAt = (i: number, f: (s: string) => string) => (r: any) =>
    (r.authority_lineage[i] = f(r.authority_lineage[i]));
  const flip = (c: string) => (c === "0" ? "1" : "0");

  it("a changed commit SHA, path, repository or pointer form", () => {
    expect(withRow(lineageAt(3, (s) => s.replace("37ba11b", flip("3") + "7ba11b")))).not.toEqual(
      [],
    );
    expect(withRow(lineageAt(3, (s) => s.replace(/.$/, "x")))).not.toEqual([]);
    expect(
      withRow(lineageAt(3, (s) => s.replace("gamerelninorex-bit", "someone-else"))),
    ).not.toEqual([]);
    expect(
      withRow(lineageAt(3, (s) => s.replace("a0-clock-origin-source-lock", "b0-gm-request"))),
    ).not.toEqual([]);
    // an editable PR head or a branch name is not an immutable commit pointer
    expect(
      withRow(
        lineageAt(
          3,
          () =>
            "gamerelninorex-bit/Immortalis@claude/f014b-a0-source-lock:docs/f014b/a0-clock-origin-source-lock.md",
        ),
      ),
    ).not.toEqual([]);
    // free prose in place of the pointer
    expect(
      withRow(lineageAt(3, () => "see the A0 source lock document in the repository")),
    ).not.toEqual([]);
  });

  it("a changed T-1 source, ratification or decisions record, a dropped, extra or reordered entry", () => {
    for (const i of [0, 1, 2]) {
      expect(withRow(lineageAt(i, (s) => s.replace(/@ 2026/, "@ 2025")))).not.toEqual([]);
      expect(withRow(lineageAt(i, (s) => s.replace("41", "42")))).not.toEqual([]);
    }
    expect(withRow((r) => r.authority_lineage.pop())).not.toEqual([]);
    expect(withRow((r) => r.authority_lineage.shift())).not.toEqual([]);
    expect(
      withRow((r) => r.authority_lineage.push("an additional second source authority")),
    ).not.toEqual([]);
    expect(withRow((r) => r.authority_lineage.reverse())).not.toEqual([]);
    expect(
      withRow(
        (r) =>
          ([r.authority_lineage[0], r.authority_lineage[1]] = [
            r.authority_lineage[1],
            r.authority_lineage[0],
          ]),
      ),
    ).not.toEqual([]);
    expect(withRow((r) => delete r.authority_lineage)).not.toEqual([]);
  });

  it("changed rule, owner, writer, precondition, history segments or retained MS suffix", () => {
    for (const edit of [
      (r: any) => (r.genesis_rule = "KERNEL_RULE"),
      (r: any) => (r.input_rules = r.input_rules.slice(0, 1)),
      (r: any) => (r.temporal_owner = "temporal_kernel/other"),
      (r: any) => (r.temporal_writer = "initialize-time"),
      (r: any) => (r.temporal_precondition = "none"),
      (r: any) => (r.history_policy_segments = r.history_policy_segments.slice(0, 1)),
      (r: any) => (r.history_policy_segments[1] = "+MS-V3-CLOCK-STEP"),
      (r: any) => (r.history_policy_suffix = "+MS-SETUP-V08@x"),
      (r: any) => delete r.technical_encoding_review,
    ])
      expect(withRow(edit)).not.toEqual([]);
  });

  it("the generic row check also holds the single native url/pin, the kinds, the lineage and the ordered exclusions", () => {
    const root = mkdtempSync(join(tmpdir(), "immortalis-a0-check-spec-"));
    for (const rel of [
      "spec/f027/runtime-contract.md",
      "spec/f027/acceptance-register.yaml",
      "spec/f027/open-gates.yaml",
      "spec/f027/spec-lock.json",
      "spec/f027/ms-setup-v08-manifest.json",
      "packages/contracts/src/spec-identity.ts",
      "packages/engine/src/initial-setup/rules.ts",
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/owners/registry.ts",
    ]) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      cpSync(rel, join(root, rel));
    }
    // the acceptance register names test files by path: the repository's own tests are linked in, not copied
    symlinkSync(resolve("tests"), join(root, "tests"), "dir");
    expect(checkSpec(root)).toEqual([]);
    const tamper = (edit: (l: any) => void) => {
      const l = structuredClone(lock);
      edit(l.executable_lowerings.find((r: any) => r.id === CLOCK_ORIGIN.lowering_id));
      writeFileSync(join(root, "spec/f027/spec-lock.json"), JSON.stringify(l, null, 2) + "\n");
      const found = checkSpec(root);
      writeFileSync(join(root, "spec/f027/spec-lock.json"), read("spec/f027/spec-lock.json"));
      return found;
    };
    expect(tamper((r) => (r.url = CLOCK_ORIGIN.t1.url)).join("\n")).toMatch(/must name/);
    expect(tamper((r) => (r.native_pin = CLOCK_ORIGIN.t1.pin)).join("\n")).toMatch(
      /pinned at exactly/,
    );
    expect(tamper((r) => r.fact_kinds.reverse()).join("\n")).toMatch(/exactly its fact kinds/);
    expect(tamper((r) => (r.cites_design_lineage = [CLOCK_ORIGIN.lineage_id])).join("\n")).toMatch(
      /design lineage it lowers/,
    );
    expect(tamper((r) => r.does_not.reverse()).join("\n")).toMatch(/ordered does_not exclusions/);
    expect(tamper((r) => (r.operation = "X")).join("\n")).toMatch(/no operation key/);
    expect(tamper((r) => (r.authority_lineage[3] = "x")).join("\n")).toMatch(/authority_lineage/);
    // the generated identity must follow the lock
    writeFileSync(
      join(root, "spec/f027/spec-lock.json"),
      read("spec/f027/spec-lock.json").replace("A0 bounded", "A0 BOUNDED"),
    );
    expect(checkSpec(root).join("\n")).toMatch(/out of date/);
  });

  it("the code is held to the row: a source that lacks a segment, the composed identity or the single genesis alternate is reported", () => {
    const patched = (file: string, from: string | RegExp, to: string) => (rel: string) =>
      rel === file ? read(rel).replace(from, to) : read(rel);
    const rules = "packages/engine/src/initial-setup/rules.ts";
    const admission = "packages/engine/src/owners/admission.ts";
    const registry = "packages/engine/src/owners/registry.ts";
    const rows = lock["executable_lowerings"];
    expect(
      checkClockOriginLowering(rows, patched(rules, '"+MS-V3-CLOCK-STEP-B2-ORIGIN"', '"+MS-V3-X"')),
    ).not.toEqual([]);
    expect(
      checkClockOriginLowering(
        rows,
        patched(rules, "export const TEMPORAL_CAPTURED_V2_GENESIS_RULE", "const X"),
      ),
    ).not.toEqual([]);
    expect(
      checkClockOriginLowering(
        rows,
        patched(
          rules,
          /native_pin: "2026-11-18T22:23:26.085Z"/,
          'native_pin: "2026-11-18T22:23:26.086Z"',
        ),
      ),
    ).not.toEqual([]);
    expect(
      checkClockOriginLowering(
        rows,
        patched(
          rules,
          /37ba11bd0f0f068a22731f87351a0fd9a16a885b/,
          "47ba11bd0f0f068a22731f87351a0fd9a16a885b",
        ),
      ),
    ).not.toEqual([]);
    expect(
      checkClockOriginLowering(
        rows,
        patched(admission, "${MS_V3_CLOCK_ORIGIN_HISTORY_POLICY_SEGMENT}`", "`"),
      ),
    ).not.toEqual([]);
    expect(
      checkClockOriginLowering(
        rows,
        patched(
          registry,
          "              rule: TEMPORAL_CAPTURED_V2_GENESIS_RULE,",
          '              rule: TEMPORAL_CAPTURED_V2_GENESIS_RULE,\n            },\n            {\n              rule: factKind("temporal_state").rule,',
        ),
      ),
    ).not.toEqual([]);
  });
});

describe("the checker's custody values are the values the engine carries", () => {
  it("the T-1 source, ratification, decisions record, PASS brief, custody pointer, ids and segments are one set of values", () => {
    expect(CAL_TIME_T1_SOURCE).toEqual({
      artifact: CLOCK_ORIGIN.t1.url,
      native_pin: CLOCK_ORIGIN.t1.pin,
    });
    expect(CAL_TIME_T1_RATIFICATION).toEqual({
      artifact: CLOCK_ORIGIN.ratification.url,
      native_pin: CLOCK_ORIGIN.ratification.pin,
    });
    expect(A0_BLUE_DECISIONS_RECORD).toEqual({
      artifact: CLOCK_ORIGIN.decisions.url,
      native_pin: CLOCK_ORIGIN.decisions.pin,
    });
    expect(A0_BLUE_PASS_BRIEF).toEqual({
      artifact: CLOCK_ORIGIN.brief.url,
      native_pin: CLOCK_ORIGIN.brief.pin,
    });
    expect(A0_SOURCE_LOCK_CUSTODY).toBe(CLOCK_ORIGIN_AUTHORITY_LINEAGE[3]);
    expect(CAL_TIME_T1_LINEAGE_ID).toBe(CLOCK_ORIGIN.lineage_id);
    expect(CAL_TIME_T1_LOWERING_ID).toBe(CLOCK_ORIGIN.lowering_id);
    expect([CAL_TIME_T1_HISTORY_POLICY_SEGMENT, MS_V3_CLOCK_ORIGIN_HISTORY_POLICY_SEGMENT]).toEqual(
      CLOCK_ORIGIN.segments,
    );
    expect(MS_HISTORY_POLICY_SUFFIX).toBe(CLOCK_ORIGIN.retained_ms_suffix);
    expect(canonicalAdmission.historyVerificationId!.endsWith(CLOCK_ORIGIN.segments.join(""))).toBe(
      true,
    );
  });

  it("each of the three rules cites the adopted T-1 source at its pin (never an MS_SOURCE clause), pinned-by-spec-lock, superseding nothing", () => {
    for (const rule of [
      TEMPORAL_CAPTURED_V2_GENESIS_RULE,
      INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
      INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE,
    ]) {
      expect(rule.artifact).toBe(CLOCK_ORIGIN.t1.url);
      expect(rule.native_pin).toBe(CLOCK_ORIGIN.t1.pin);
      expect(rule.effective_basis).toBe("pinned-by-spec-lock");
      expect(rule.supersedes).toBeNull();
      expect(rule.authority_lineage.join("\n")).toContain(A0_SOURCE_LOCK_CUSTODY);
      expect(rule.authority_lineage.join("\n")).toContain(CLOCK_ORIGIN.ratification.url);
      expect(rule.authority_lineage.join("\n")).toContain(CLOCK_ORIGIN.decisions.url);
    }
    expect(CLOCK_ORIGIN.rules).toEqual([
      "TEMPORAL_CAPTURED_V2_GENESIS_RULE",
      "INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE",
      "INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE",
    ]);
    // the three clauses are distinct
    expect(
      new Set([
        TEMPORAL_CAPTURED_V2_GENESIS_RULE.clause,
        INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE.clause,
        INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE.clause,
      ]).size,
    ).toBe(3);
  });
});
