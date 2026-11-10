import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import * as engine from "@immortalis/engine";
import { MS_FACT_KIND_IDS, canonicalJson } from "@immortalis/contracts";
const json = (p: string) => JSON.parse(readFileSync(p, "utf8"));
describe("M-S exact ratified source and additive registration", () => {
  it("expands all ten rule citations from the exact externally bound eleven-entry manifest", () => {
    const m = json("spec/f027/ms-setup-v08-manifest.json");
    expect(engine.sha256Bytes(readFileSync("spec/f027/ms-setup-v08-manifest.json"))).toBe(
      "d5d3bf6d8226a511f2ef22d37877be55dd8575aa27362aa26df607be975724b2",
    );
    expect(m.authority_lineage).toHaveLength(11);
    expect(m.clause).toHaveLength(10);
    for (const clause of m.clause) {
      expect((engine as Record<string, unknown>)[clause]).toEqual({
        ...m.source,
        clause,
        authority_lineage: m.authority_lineage,
        effective_basis: "pinned-by-spec-lock",
        supersedes: null,
      });
    }
    expect(Buffer.byteLength(engine.MS_ACTOR_INSTRUCTION)).toBe(583);
    expect(engine.sha256Bytes(Buffer.from(engine.MS_ACTOR_INSTRUCTION))).toBe(
      "566cf9006c7648f37f9b050b6ae6b7f0f0a7754b5bd92556a6a47be9d1439f1d",
    );
  });
  it("preserves every one of the original 23 sources, seven lowerings and CD1, adding exactly one lineage/lowering", () => {
    const base = json("tests/fixtures/ms-setup-v08/base-spec-lock.json"),
      head = json("spec/f027/spec-lock.json");
    expect(head.frozen_sources).toEqual(base.frozen_sources);
    expect(head.frozen_sources).toHaveLength(23);
    expect(head.implementation_authority_addenda).toEqual(base.implementation_authority_addenda);
    expect(head.executable_lowerings).toHaveLength(8);
    expect(head.executable_lowerings.slice(0, 7)).toEqual(base.executable_lowerings);
    expect(head.design_lineage_successors.slice(0, -1)).toEqual(base.design_lineage_successors);
    expect(head.snapshot_files).toEqual(base.snapshot_files);
  });
  it("retains all ninety policy rows verbatim and covers exactly ninety-three registered kinds with the restrictive delta", () => {
    expect(engine.BOOTSTRAP_SUNSET_POLICY_V9).toEqual(
      json("tests/fixtures/ms-setup-v08/base-sunset-policy.json"),
    );
    const rows = engine.BOOTSTRAP_SUNSET_POLICY_MS_V08;
    expect(rows).toHaveLength(93);
    expect(engine.ALL_FACT_KINDS).toHaveLength(93);
    expect(rows.slice(0, 90)).toEqual(engine.BOOTSTRAP_SUNSET_POLICY_V9);
    expect(rows.slice(90).map((r) => r.kind)).toEqual([...MS_FACT_KIND_IDS]);
    expect(rows.slice(90).every((r) => r.policy === "UNREVIEWED_BLOCK")).toBe(true);
    expect(rows.map((r) => r.kind).sort()).toEqual(engine.ALL_FACT_KINDS.map((k) => k.id).sort());
    expect(new Set(rows.map((r) => r.kind)).size).toBe(93);
    expect(canonicalJson(engine.MS_RUNTIME_COMPATIBILITY)).toContain(
      "STRICT_REPLAY_ON_POLICY_CHANGE",
    );
    expect(engine.canonicalAdmission.historyVerificationId).toBe(
      basePolicy + engine.MS_HISTORY_POLICY_SUFFIX,
    );
    expect(engine.fixtureCanonicalAdmission.historyVerificationId).toBe(
      basePolicy + "+fixture-evidence-t1" + engine.MS_HISTORY_POLICY_SUFFIX,
    );
  });
});
const basePolicy =
  "R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1";
