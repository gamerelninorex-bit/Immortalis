// Conformance evidence for the Diplomacy Relation Edge Governing-Citation Source-Fidelity Repair (twenty-third slice): a bounded
// provenance repair only. The nineteenth-slice Relation Edge citation attributed the Relation Edge to WS-008 §4; the frozen source
// (v1.1, F-027 pin 2026-09-24T07:01:45.312Z) makes §4 the Diplomatic Relevance / Reach Gate and §5.1 the Diplomatic Relation Edge.
// The historical citation is preserved byte-for-byte and accepted on load only through the existing FactKind.legacyRule
// mechanism; the current citation is the only one a new write may carry; the executable Relation Edge surface is unchanged.
// Register lineage: IA-01, IA-02 (partial; none promoted). IA-07 stays BLOCKED. GitHub Issue #11 is untouched.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RelationEdgeSchema } from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_FRAMEWORK_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DIPLOMACY_RELATION_EDGE_RULE,
  DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE,
  factKind,
} from "@immortalis/engine";
import { fullRelationEdge, relationEdge } from "@immortalis/testkit";
import { sha } from "../support/f027.ts";
import {
  EXPECTED_LEGACY_RULE_KIND_IDS,
  EXPECTED_LEGACY_RULE_SOURCE_SLOTS,
} from "../support/expected-surface.ts";

const relation = factKind("diplomacy_relation_edge");
const DIPLOMACY_DIR = "packages/engine/src/diplomacy";
const ENGINE_DIPLOMACY = readdirSync(DIPLOMACY_DIR).map((f) => join(DIPLOMACY_DIR, f));

// the construction-base (7a52943) DIPLOMACY_RELATION_EDGE_RULE, whole SourceRef, as committed Relation Edge facts carry it
const CONSTRUCTION_BASE_SHA256 = "5f4503e087b9601134f6988c1865e76d00723610933f0ae8b9a4837b29fbcce7";

describe("IA-01 source/version fidelity: the historical citation is preserved byte-for-byte", () => {
  it("the nineteenth-slice citation's sha256 is the construction-base value, and its text still carries the original §4 label", () => {
    expect(sha(DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE)).toBe(CONSTRUCTION_BASE_SHA256);
    expect(DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE.clause).toContain(
      "§4 Relation Edge (a sparse continuity object, not a duplicate ledger and not a universal relationship, trust or reputation score); §5.1 Relation Edge minimum surface",
    );
    expect(DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE.clause).not.toContain("Reach Gate");
  });

  it("the historical citation is whole-value immutable evidence: exact SourceRef fields", () => {
    const h = DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE;
    expect(Object.keys(h).sort()).toEqual([
      "artifact",
      "authority_lineage",
      "clause",
      "effective_basis",
      "native_pin",
      "supersedes",
    ]);
    expect(h.native_pin).toBe("2026-09-24T07:01:45.312Z");
    expect(h.effective_basis).toBe("pinned-by-spec-lock");
    expect(h.supersedes).toBeNull();
  });
});

describe("IA-01 current citation fidelity: WS-008 §4 is the Reach Gate and §5.1 is the Relation Edge", () => {
  it("the current citation is pinned, and is not the historical one", () => {
    expect(sha(DIPLOMACY_RELATION_EDGE_RULE)).toBe(
      "2773a95cccc8671238fa29406bdaa7ee23ca8fcc2f46763a37f299919783162a",
    );
    expect(DIPLOMACY_RELATION_EDGE_RULE).not.toEqual(DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE);
  });

  it("only the clause differs: the same WS-008 artifact, exact native pin, authority lineage, effective basis and supersedes treatment", () => {
    for (const k of [
      "artifact",
      "native_pin",
      "authority_lineage",
      "effective_basis",
      "supersedes",
    ] as const)
      expect(DIPLOMACY_RELATION_EDGE_RULE[k], k).toEqual(
        DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE[k],
      );
    expect(DIPLOMACY_RELATION_EDGE_RULE.native_pin).toBe("2026-09-24T07:01:45.312Z");
    expect(DIPLOMACY_RELATION_EDGE_RULE.supersedes).toBeNull();
    expect(DIPLOMACY_RELATION_EDGE_RULE.authority_lineage.join("\n")).toContain("F-016 Phase 2C");
    expect(DIPLOMACY_RELATION_EDGE_RULE.authority_lineage.join("\n")).toContain(
      "2026-09-24T07:01:45.312Z",
    );
    expect(DIPLOMACY_RELATION_EDGE_RULE.clause).not.toBe(
      DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE.clause,
    );
  });

  it("§4 is identified as the Diplomatic Relevance / Reach Gate and §5.1 as the Diplomatic Relation Edge", () => {
    const clause = DIPLOMACY_RELATION_EDGE_RULE.clause;
    expect(clause).toContain("§4 Diplomatic Relevance / Reach Gate (no all-pairs scan;");
    expect(clause).toContain("no persistent diplomatic-capacity score is created");
    expect(clause).toContain("no Reach calculation implemented");
    expect(clause).toContain(
      "§5.1 Diplomatic Relation Edge (a sparse future-causal continuity edge, not a duplicate ledger; minimum surface: relation_id, party_refs[], relation_scope, optional rupture_or_suspension_status, optional provenance_ref, lifecycle_status)",
    );
  });

  it("the current citation makes no claim that §4 is the Relation Edge", () => {
    const clause = DIPLOMACY_RELATION_EDGE_RULE.clause;
    expect(clause).not.toContain("§4 Relation Edge");
    expect(clause).not.toMatch(/§4[^;]*Relation Edge/);
    expect(clause).not.toContain("§5.1 Relation Edge minimum surface");
    // the segment between "§4" and the next clause separator names the Reach Gate only
    const segment = /§4 ([^;]*);/.exec(clause)![1]!;
    expect(segment.startsWith("Diplomatic Relevance / Reach Gate")).toBe(true);
    expect(segment).not.toMatch(/Relation Edge|relation_id|party_refs|lifecycle_status/);
  });

  it("the unchanged clauses are still cited verbatim", () => {
    for (const c of [
      "v1.1 §§2.1-2.2 Diplomacy-owned persistent state (the durable fact that an external relation materially continues)",
      "§24 Required Invariants (stable state carries forward; no universal diplomacy tick)",
      "§§29.3/29.7 R-3 / R-7 (channel_refs[], recognition_refs[], active_claim_dispute_refs[], instrument_refs[] and framework_refs[] are derived, non-authoritative indexes rebuilt from source records and are not authored persistent fields; no all-pairs scan; no universal watcher)",
      "post-establishment rupture, suspension, restoration, retirement and lifecycle mutation, and any derived index or Recognition / Claim-Dispute association, not implemented",
    ])
      expect(DIPLOMACY_RELATION_EDGE_RULE.clause).toContain(c);
  });

  it("the other Diplomacy kinds' citations are byte-for-byte unchanged and none is reused for the Edge", () => {
    expect(sha(DIPLOMACY_RECOGNITION_RULE)).toBe(
      "baf7fc4dfc91a5062ae4169cc7f430cb63a24f8d553b2a5cde61150f7f872764",
    );
    expect(sha(DIPLOMACY_CLAIM_DISPUTE_RULE)).toBe(
      "021cc0b4ddc153606f1a02767fff507e54276b6818889ed244866f539f56d630",
    );
    expect(sha(DIPLOMACY_FRAMEWORK_RULE)).toBe(
      "c71fa6185ec63162531d9379c8d8847cf8a11f2248fb5b4dec9c6bdf5e21ed7d",
    );
  });
});

describe("IA-01 registration: one historical entry, through the existing legacyRule mechanism only", () => {
  it("the Relation Edge kind records the corrected citation and registers exactly the preserved nineteenth-slice one", () => {
    expect(relation.rule).toBe(DIPLOMACY_RELATION_EDGE_RULE);
    expect(relation.valueSchema).toBe(RelationEdgeSchema);
    expect(relation.legacyRule).toBeDefined();
    expect(relation.legacyRule!.rule).toBe(DIPLOMACY_RELATION_EDGE_RULE_NINETEENTH_SLICE);
    expect(Object.keys(relation.legacyRule!).sort()).toEqual(["admits", "rule"]);
  });

  it("the historical entry admits exactly values satisfying the strict Relation Edge schema, and nothing else", () => {
    const { admits } = relation.legacyRule!;
    expect(admits(relationEdge())).toBe(true);
    expect(admits(fullRelationEdge())).toBe(true);
    for (const v of [
      { ...relationEdge(), channel_refs: [] },
      { ...relationEdge(), recognition_refs: ["r"] },
      { ...relationEdge(), active_claim_dispute_refs: [] },
      { ...relationEdge(), instrument_refs: [] },
      { ...relationEdge(), framework_refs: [] },
      { ...relationEdge(), extra: 1 },
      { ...relationEdge(), party_refs: "a" },
      { ...relationEdge(), lifecycle_status: ["a"] },
      { ...relationEdge(), relation_id: "" },
      {},
      null,
      "relation",
    ])
      expect(admits(v), JSON.stringify(v)).toBe(false);
    expect(RelationEdgeSchema.safeParse(relationEdge()).success).toBe(true);
  });

  it("the compatibility is not generalized: three kinds in all, no second slot on the Relation Edge kind, and the load check is unchanged", () => {
    // (the inventory is the central oracle's, EXPECTED_LEGACY_RULE_*: this suite states the claim against it, not a literal)
    expect(ALL_FACT_KINDS.filter((k) => k.legacyRule).map((k) => k.id)).toEqual([
      ...EXPECTED_LEGACY_RULE_KIND_IDS,
    ]);
    expect(
      readFileSync("packages/engine/src/owners/registry.ts", "utf8").match(/legacyRule\s*[?]?:/g),
    ).toHaveLength(EXPECTED_LEGACY_RULE_SOURCE_SLOTS);
    expect(readFileSync("packages/engine/src/world/integrity.ts", "utf8")).toMatch(
      /const legacy = kind\.legacyRule;/,
    );
  });

  it("no write, admission or adapter path references the historical citation: only the registry does", () => {
    for (const f of ENGINE_DIPLOMACY)
      expect(readFileSync(f, "utf8"), f).not.toContain("NINETEENTH_SLICE");
    expect(readFileSync("packages/engine/src/world/integrity.ts", "utf8")).not.toContain(
      "NINETEENTH_SLICE",
    );
  });
});

describe("IA-02 no silent semantic invention: provenance labeling changed, the executable surface did not", () => {
  it("the authored Relation Edge contract is the strict WS-008 §5.1 core with the same fields as before", () => {
    const shape = Object.keys((RelationEdgeSchema as unknown as { shape: object }).shape).sort();
    expect(shape).toEqual([
      "lifecycle_status",
      "party_refs",
      "provenance_ref",
      "relation_id",
      "relation_scope",
      "rupture_or_suspension_status",
    ]);
    expect(relation.id).toBe("diplomacy_relation_edge");
    expect(relation.lifecycle).toBe("ADVANCING");
    expect(relation.owner).toBe("diplomacy");
    expect(relation.facet).toBe("diplomacy_relation_edge");
    expect(relation.keyPattern.source).toBe(
      "^diplomacy\\/relation\\/([A-Za-z0-9][A-Za-z0-9._:-]*)$",
    );
  });

  it("the repair adds no randomness, probability, Reach, association or scheduling code to the Diplomacy engine", () => {
    for (const f of ENGINE_DIPLOMACY) {
      const text = readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
      expect(text, f).not.toMatch(
        /Math\.random|randomBytes|randomUUID|\bseed\b|\bprobab|setTimeout|setInterval|\breach[A-Z(]/i,
      );
    }
  });
});
