// Conformance evidence for the F-027-CJA1 consumer-free adjudication-record prerequisite (Sovereign-approved v1.1; NOT
// native-pinned and NOT spec-locked: the spec lock is untouched and this test pins that). The register rows are not
// advanced. No production Culture owner, consumer, host/GM ingress, model call or live Population attestation exists here.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  CULTURE_ADJUDICATION_FACT_KINDS,
  CultureAdjudicationAdapter,
  F027_CJA1_SOURCE,
  resolveKey,
} from "@immortalis/engine";
import { BUILD_SPEC_IDENTITY } from "@immortalis/contracts";
import { code, lock } from "../support/f027.ts";
import { expectedAdapterMethods, expectedKindIds } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";
import { checkSpec } from "../../tools/check-spec.ts";

const DIR = "packages/engine/src/culture-adjudication";
const SOURCES = [
  ...readdirSync(DIR).map((f) => join(DIR, f)),
  "packages/contracts/src/culture-adjudication.ts",
];
const CJA1_URL = "https://app.notion.com/p/3f420af901e0815dae8ac3912a1214fe";

describe("source fidelity: CJA1 is a Sovereign-approved source that is not claimed as promoted authority", () => {
  it("the spec lock and every frozen snapshot are exactly as before", () => {
    const raw = JSON.parse(readFileSync("spec/f027/spec-lock.json", "utf8"));
    expect(raw.package.native_pin).toBe("2026-09-29T00:40:44.707Z");
    expect(JSON.stringify(raw)).not.toContain("3f420af901e0815dae8ac3912a1214fe");
    expect(JSON.stringify(raw)).not.toContain("CJA1");
    expect(lock.snapshot_files["spec/f027/runtime-contract.md"]).toBe(
      "ab2f6385e598c306a4bc2cae91cde5b798ae53d18d176a39ef8a4024d63696fd",
    );
    expect(BUILD_SPEC_IDENTITY.snapshot_files).toEqual(lock.snapshot_files);
    expect(checkSpec(".")).toEqual([]);
  });

  it("the record kind cites CJA1 as sovereign-approved, not native-pinned, not spec-locked", () => {
    expect(F027_CJA1_SOURCE.artifact).toBe(CJA1_URL);
    const [kind] = CULTURE_ADJUDICATION_FACT_KINDS;
    expect(kind!.rule.artifact).toBe(CJA1_URL);
    expect(kind!.rule.effective_basis).toBe("sovereign-approved-not-native-pinned-not-spec-locked");
    expect(kind!.rule.supersedes).toBeNull();
    expect(kind!.im).toBe("IM-12");
    expect(kind!.rc).toEqual(["RC-02", "RC-09", "RC-16"]);
    expect(kind!.lifecycle).toBe("SEALED");
  });

  it("the spec-lock addenda are unchanged (CD1 only)", () => {
    const addenda = (lock as unknown as { implementation_authority_addenda: { id: string }[] })
      .implementation_authority_addenda;
    expect(addenda.map((a) => a.id)).toEqual(["F-027-CD1"]);
  });
});

describe("owner exclusivity: an infrastructure-only owner and no Culture owner", () => {
  it("registers exactly one kind, one owner, one facet, and no `culture` owner exists", () => {
    expect(CULTURE_ADJUDICATION_FACT_KINDS.map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "culture_adjudication_kernel" }),
    );
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "culture_adjudication_kernel")).toHaveLength(1);
    expect([...CANONICAL_OWNER_REGISTRY.get("culture_adjudication_kernel")!]).toEqual([
      "adjudication_provenance",
    ]);
    expect([...CANONICAL_OWNER_REGISTRY.keys()].filter((o) => o === "culture")).toEqual([]);
    expect(
      ALL_FACT_KINDS.filter(
        (k) => /^culture/.test(k.owner) && k.owner !== "culture_adjudication_kernel",
      ),
    ).toEqual([]);
  });

  it("the key space is exactly adjudication-culture/<64 hex>/decision and resolves to the one kind", () => {
    const id = "a".repeat(64);
    expect(resolveKey(`adjudication-culture/${id}/decision`)?.kind.id).toBe(
      "culture_adjudication_decision",
    );
    for (const bad of [
      `adjudication-culture/${id}/other`,
      `adjudication-culture/${id.slice(1)}/decision`,
      `adjudication-culture/${id.toUpperCase()}/decision`,
      `culture/${id}/decision`,
    ]) {
      expect(resolveKey(bad)?.kind.id).not.toBe("culture_adjudication_decision");
    }
  });

  it("the adapter's whole public surface is one operation and one typed read: no writer, amender or Culture-fact writer", () => {
    expect(adapterMethods(CultureAdjudicationAdapter)).toEqual(
      expectedAdapterMethods("CultureAdjudicationAdapter"),
    );
    expect(expectedAdapterMethods("CultureAdjudicationAdapter")).toEqual([
      "adjudicate",
      "decision",
    ]);
  });

  it("publishes through one `.commit(` and only the shared layer is wired at two seams", () => {
    expect(code(`${DIR}/adapter.ts`).match(/\.commit\(/g)).toHaveLength(1);
    expect(code("packages/engine/src/owners/admission.ts")).toMatch(
      /cultureAdjudicationGroupCheck/,
    );
    expect(code("packages/engine/src/world/canonical-campaign.ts")).toMatch(
      /verifyCultureAdjudicationIntegrity/,
    );
    for (const f of SOURCES) {
      expect(/\.commit\(/.test(code(f)), f).toBe(f.endsWith("/adapter.ts"));
    }
  });

  it("no other owner module knows the adjudication layer", () => {
    for (const dir of [
      "diplomacy",
      "economy",
      "epistemic",
      "gip",
      "kti",
      "logistics",
      "population",
      "production",
      "temporal",
      "causal-draw",
    ]) {
      for (const f of readdirSync(`packages/engine/src/${dir}`)) {
        expect(code(`packages/engine/src/${dir}/${f}`), `${dir}/${f}`).not.toMatch(
          /culture-adjudication|CultureAdjudication|culture_adjudication|cjadj/,
        );
      }
    }
  });
});

describe("no excluded surface exists in the modules", () => {
  it("imports nothing from the unmerged Culture contract, a model, a network, a clock or entropy", () => {
    for (const f of SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(
        /node:fs|node:net|node:http|fetch\(|Math\.random|Date\.now|new Date|randomBytes|randomUUID|performance\.now|setTimeout|setInterval|anthropic|openai|llm\b/i,
      );
      expect(text, f).not.toMatch(/from "[^"]*(culture-fixtures|\/culture\.ts|culture\/)/);
    }
  });

  it("claims no live human or LLM authentication and no live Population attestation", () => {
    for (const f of SOURCES) {
      const text = code(f);
      expect(text, f).not.toMatch(/authenticated_human|AUTHENTICATED_HUMAN|verifiedPrincipal/);
    }
    const contracts = code("packages/contracts/src/culture-adjudication.ts");
    expect(contracts).toMatch(/live_population_admission: z\.literal\(false\)/);
    expect(contracts).toMatch(/TRUSTED_IN_PROCESS_PRECONDITION/);
  });

  it("the adapter never scans: only the integrity verifier lists facts", () => {
    for (const f of SOURCES) {
      const text = code(f);
      const lists = /\.listFacts\(/.test(text);
      expect(lists, f).toBe(f.endsWith("/integrity.ts"));
    }
  });

  it("holds the authority check before any lookup and the replay before the port", () => {
    const adapter = code(`${DIR}/adapter.ts`);
    const body = adapter.slice(
      adapter.indexOf("async adjudicate("),
      adapter.indexOf("  decision(\n"),
    );
    const order = [
      "AuthoritySchema.safeParse",
      "assertCjaCanonical(",
      "CjaAuthoredJudgmentSchema.safeParse",
      "this.#store.getFact(key)",
      "this.#replay(",
      "unreconciled.get(",
      "this.#verifyContext(",
      "RULE_MISMATCH",
      "this.#publish(",
    ].map((n) => body.indexOf(n));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("holds no mutable module state beyond one weak per-store reconciliation register", () => {
    for (const f of SOURCES) expect(code(f), f).not.toMatch(/^(let|var)\s/m);
    expect(code(`${DIR}/adapter.ts`).match(/^const \w+ = new Weak(Set|Map)/gm)).toHaveLength(1);
  });

  it("does not hash source files by accident: the frozen F-027 spec files are byte-identical", () => {
    const sha = (p: string) => createHash("sha256").update(readFileSync(p)).digest("hex");
    for (const [path, hash] of Object.entries(lock.snapshot_files)) {
      if (!path.startsWith("spec/")) continue;
      expect(sha(path), path).toBe(hash);
    }
  });
});
