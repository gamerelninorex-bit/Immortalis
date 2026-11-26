// F-014B B1-01–B1-09. Static mechanism evidence under spec/f027/spec-lock.json.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GmWaitCatalogueManifestV1Schema,
  GmWaitCatalogueManifestV2Schema,
  catalogueCanonicalBytes,
  catalogueCoverageViolations,
  catalogueDigest,
  staticVerdict,
  validateManifest,
  verifySuppliedDigest,
} from "../../packages/engine/src/gm-wait-catalogue.ts";
import {
  GM_WAIT_CATALOGUE_CURRENT_SHA256,
  GM_WAIT_CATALOGUE_RETAINED_SHA256,
} from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { ALL_FACT_KINDS, type FactKind } from "../../packages/engine/src/owners/registry.ts";
import {
  MANIFEST_DIR,
  REPO_ROOT,
  buildCensus,
  generate,
} from "../../tools/gen-gm-wait-catalogue.ts";

const v1Digest = "f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062";
const source = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");
const manifestBytes = (digest: string) => source(`${MANIFEST_DIR}/${digest}.json`);
const v2Bytes = manifestBytes(GM_WAIT_CATALOGUE_CURRENT_SHA256);
const v2 = GmWaitCatalogueManifestV2Schema.parse(JSON.parse(v2Bytes));

describe("F-014B static catalogue v2 [mechanism only]", { timeout: 30_000 }, () => {
  it("[B1] [mechanism only] B1-01 / B1-07 preserves exact v1 and denies stale, missing and forged bytes for a fresh digest check", () => {
    const bytes = manifestBytes(v1Digest);
    expect(Buffer.byteLength(bytes)).toBe(330227);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(v1Digest);
    const archived = GmWaitCatalogueManifestV1Schema.parse(JSON.parse(bytes));
    expect(catalogueCanonicalBytes(archived)).toBe(bytes);
    expect(catalogueDigest(archived)).toBe(v1Digest);
    expect(GM_WAIT_CATALOGUE_RETAINED_SHA256).toContain(v1Digest);
    const authority = {
      current: GM_WAIT_CATALOGUE_CURRENT_SHA256,
      retained: new Map([
        [v1Digest, bytes],
        [GM_WAIT_CATALOGUE_CURRENT_SHA256, v2Bytes],
      ]),
    };
    expect(verifySuppliedDigest(v1Digest, authority)).toBe("DIGEST_STALE_RETAINED");
    expect(verifySuppliedDigest(v1Digest, { ...authority, current: v1Digest })).toBe("OK_CURRENT");
    expect(verifySuppliedDigest("0".repeat(64), authority)).toBe("DIGEST_UNKNOWN");
    expect(verifySuppliedDigest("invalid", authority)).toBe("DIGEST_MALFORMED");
    authority.retained.set(v1Digest, bytes + " ");
    expect(verifySuppliedDigest(v1Digest, authority)).toBe("MANIFEST_BYTES_MISMATCH");
  });

  it("[B1] [mechanism only] B1-02 normalizes v2 policy file and nested set order and refuses duplicate tuples", async () => {
    expect(validateManifest(v2)).toEqual([]);
    expect((await generate()).bytes).toBe(v2Bytes);
    const permuted = structuredClone(v2);
    permuted.policy.source_policy.files.reverse();
    permuted.kinds.reverse();
    permuted.scope.ast_roots.reverse();
    expect(validateManifest(permuted).map((v) => v.code)).toEqual([
      "UNSORTED_SET",
      "UNSORTED_SET",
      "UNSORTED_SET",
    ]);
    expect(catalogueCanonicalBytes(permuted)).toBe(v2Bytes);
    permuted.policy.source_policy.files.push(permuted.policy.source_policy.files[0]!);
    expect(() => catalogueCanonicalBytes(permuted)).toThrow(/DUPLICATE_TUPLE/);
  });

  it("[B1] [mechanism only] B1-03 detects an added reflected fact kind and its previously unlisted rule and source", async () => {
    const installed = ALL_FACT_KINDS as FactKind[];
    const first = installed[0]!;
    const id = "test_b1_rogue_kind" as FactKind["id"];
    const pin = "2026-11-22T00:00:00.000Z";
    installed.push({ ...first, id, rule: { ...first.rule, native_pin: pin } });
    try {
      const candidate = await buildCensus();
      expect(catalogueCoverageViolations(candidate, v2)).toEqual(
        expect.arrayContaining([
          { code: "KIND_NOT_IN_MANIFEST", key: id },
          { code: "RULE_NOT_IN_MANIFEST", key: expect.any(String) },
          { code: "SOURCE_NOT_IN_MANIFEST", key: expect.stringContaining(pin) },
        ]),
      );
    } finally {
      installed.pop();
    }
  });

  it("[B1] [mechanism only] B1-04 changes identity for a historical predicate body with unchanged reflected policy metadata", async () => {
    const path = "packages/engine/src/owners/registry.ts";
    const original = source(path);
    const changed = original.replace(
      "rule: PC_LEDGER_BINDING_RULE, admits: () => true",
      "rule: PC_LEDGER_BINDING_RULE, admits: () => false",
    );
    expect(changed).not.toBe(original);
    const overlay = new Map([[path, changed]]);
    const census = await buildCensus({ overlay });
    expect(catalogueCoverageViolations(census, v2)).toEqual([
      { code: "SOURCE_POLICY_CHANGED", key: path },
    ]);
    const candidate = await generate({ overlay });
    expect(candidate.manifest.kinds).toEqual(v2.kinds);
    expect(candidate.manifest.policy.historical_verification).toEqual(
      v2.policy.historical_verification,
    );
    expect(candidate.digest).not.toBe(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    const retained = new Map([
      [candidate.digest, candidate.bytes],
      [GM_WAIT_CATALOGUE_CURRENT_SHA256, v2Bytes],
    ]);
    expect(
      verifySuppliedDigest(GM_WAIT_CATALOGUE_CURRENT_SHA256, {
        current: candidate.digest,
        retained,
      }),
    ).toBe("DIGEST_STALE_RETAINED");
  });

  it("[B1] [mechanism only] B1-05 / B1-08 represents five classes and denies unproven positive ones for both member types", () => {
    const kindSchema = GmWaitCatalogueManifestV2Schema.shape.kinds.element;
    const providerSchema = GmWaitCatalogueManifestV2Schema.shape.providers.element;
    const vocabulary = [
      "ACTIONABLE_OR_UNSAFE",
      "INERT",
      "INTERRUPTION_GUARDED",
      "PASSIVE_PROVEN",
      "UNDECLARED",
    ];
    expect([...kindSchema.shape.disposition.options].sort()).toEqual(vocabulary);
    expect([...providerSchema.shape.disposition.options].sort()).toEqual(vocabulary);
    expect(v2.policy).toMatchObject({
      epistemic: "ACTIONABLE_OR_UNSAFE",
      default_disposition: "UNDECLARED",
      evaluator: { id: "NONE_SECTION_10_NOT_ACCEPTED" },
      live_admission: { id: "NOT_INSTALLED_NO_GM_WRITER" },
      source_policy: { unproven_declarations: "DENY" },
    });
    for (const disposition of ["INERT", "INTERRUPTION_GUARDED", "PASSIVE_PROVEN"] as const) {
      const candidate = structuredClone(v2);
      candidate.kinds[0]!.disposition = disposition;
      candidate.providers[0]!.disposition = disposition;
      expect(GmWaitCatalogueManifestV2Schema.safeParse(candidate).success).toBe(true);
      expect(validateManifest(candidate).map((v) => v.code)).toEqual([
        "UNPROVEN_DISPOSITION",
        "UNPROVEN_DISPOSITION",
      ]);
      expect(() => catalogueDigest(candidate)).toThrow(/UNPROVEN_DISPOSITION/);
      expect(staticVerdict(candidate, { kind: candidate.kinds[0]!.id })).toEqual({
        coverage: "IN_MANIFEST",
        disposition: "UNDECLARED",
        epistemic: "ACTIONABLE_OR_UNSAFE",
        permits: false,
      });
    }
  });

  it("[B1] [mechanism only] B1-06 records the unretired historical extension gap and the nine B2 returns and B3 reserved extension history refusal", () => {
    expect(v2.extension_dispatch).toMatchObject({
      function: "storeBindings",
      // seven at B1, nine under F-014B B2: the common GM-wait fence adds one early return to each of check and verifyHistorical
      early_return_count: 10,
      historical_verification_of_extension_groups: "SKIPPED",
      historical_coverage: "UNRETIRED_DENY",
      extension_owners: [],
    });
  });

  it("[B1] [mechanism only] B1-09 binds the exact design-only ratification and applicable RED riders", () => {
    const red = {
      page_uuid: "42020af9-01e0-81ba-9830-d14070ec9789",
      native_pin: "2026-11-22T13:02:53.745Z",
    };
    const ratification = {
      page_uuid: "42020af9-01e0-81f6-9ab3-e6c32e4f19e7",
      native_pin: "2026-11-22T13:06:43.623Z",
    };
    expect(v2.sources).toContainEqual({
      origin: "ADOPTED_INPUT",
      ...red,
      label: expect.any(String),
      ratification,
      clauses: ["R-3", "R-5", "R-6", "R-7e", "R-8", "R-9", "R-E.1", "R-H.1 (prerequisite only)"],
    });
    expect(v2.sources).toContainEqual({
      origin: "ADOPTED_INPUT",
      ...ratification,
      label: expect.stringContaining("design only"),
      ratification: null,
      clauses: [
        "D1",
        "D2",
        "D3(a)",
        "D4(c)",
        "D4(e)",
        "N8",
        "R-9 (controlling reading)",
        "R-E with R-E.1",
      ],
    });
    for (const entry of v2.sources)
      if (entry.origin === "ADOPTED_INPUT")
        for (const grant of ["D3(b)", "R-DUTY", "R-H"]) expect(entry.clauses).not.toContain(grant);
  });
});
