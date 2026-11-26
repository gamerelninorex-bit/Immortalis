// F-014B P-7 E1 - the static boundary of the native witness: test-only, read-only, outside every shared surface. MECHANISM ONLY.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AST_ROOTS, REPO_ROOT } from "../../tools/gen-gm-wait-catalogue.ts";

const text = (rel: string): string => readFileSync(join(REPO_ROOT, rel), "utf8");
const helper = "tests/support/p7-section10/native-observation.ts";
const files = [helper, "tests/integration/p7-e1-direct-observation.test.ts"];

describe("P7-E1 boundary: the native witness is read-only test support, never production code [mechanism only]", () => {
  it("the witness holds only the store's read methods: its store type has no commit and no close", () => {
    const source = text(helper);
    const decl = /export type ReadOnlyStore = Pick<\s*CampaignStore,([\s\S]*?)>;/.exec(source);
    expect(decl).not.toBeNull();
    const picked = [...decl![1]!.matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]);
    expect(picked.sort()).toEqual(
      ["committedGroup", "committedGroupById", "getFact", "head", "lookupReceipt"].sort(),
    );
    for (const token of [
      ".commit(",
      ".close(",
      ".listFacts",
      "listFacts(",
      "writeFile",
      "appendFile",
      "Date.now",
      "Math.random",
      "process.",
    ])
      expect(source.includes(token), token).toBe(false);
  });

  it("the verdict is never caller-supplied: the checker context carries only issued evidence, and no structural witness/callback API remains", () => {
    const proof = text("tests/support/p7-section10/proof.ts");
    const native = text(helper);
    // F-1: the retired structural witness (a public `verify` returning a caller-supplied `ok`) is gone from the context
    for (const retired of [
      "NativeObservationWitness",
      "NativeObservationVerdict",
      "nativeObservation",
    ])
      expect(proof.includes(retired), `proof.ts still has ${retired}`).toBe(false);
    expect(proof).toContain("readonly nativeEvidence?: NativeEvidence;");
    expect(proof).toContain("verifyNativeReceipt(evidence, {");
    // the verifier is imported STATICALLY: no installer, setter, registration or mutable slot exists anywhere under tests/ (BLUE delta 2)
    for (const retired of [
      "installNativeReceiptVerifier",
      "installedNativeVerifier",
      "NativeEvidenceHandle",
      "NativeReceiptVerifier",
    ]) {
      const hits: string[] = [];
      const walk = (rel: string) => {
        for (const e of readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })) {
          const next = `${rel}/${e.name}`;
          if (e.isDirectory()) walk(next);
          else if (e.name.endsWith(".ts") && !next.endsWith("p7-e1-boundary.test.ts")) {
            const body = text(next);
            // a mention in the E1 integration test's refusal assertions is a STRING, never a definition or an export
            if (
              new RegExp(
                `(?:export\\s+(?:async\\s+)?(?:function|const|let|var|class|type|interface)\\s+${retired}\\b)|(?:^let\\s+${retired}\\b)`,
                "m",
              ).test(body)
            )
              hits.push(next);
          }
        }
      };
      walk("tests");
      expect(hits, `${retired} must not be defined or exported anywhere`).toEqual([]);
    }
    // and neither module has a mutable module-level slot at all
    expect(proof).not.toMatch(/^let\s/m);
    expect(native).not.toMatch(/^let\s/m);
    // the evidence is an issued opaque value: the registry is module-private and only `bindNativeEvidence` writes to it
    expect(native).toMatch(/const ISSUED = new WeakMap</);
    expect([...native.matchAll(/ISSUED\.set\(/g)]).toHaveLength(1);
    expect(native).not.toMatch(/export (const|let) ISSUED/);
    const exported = [
      ...native.matchAll(/^export (?:async )?(?:function|const|class) (\w+)/gm),
    ].map((m) => m[1]);
    expect(exported.sort()).toEqual(
      [
        "bindNativeEvidence",
        "forgeConsistently",
        "forgeGroupConsistently",
        "overlayStore",
        "revisionOf",
        "verifyNativeReceipt",
      ].sort(),
    );
  });

  it("every new E1 file lives under tests/ and outside every catalogue AST root, so no shared digest or path-lock moves", () => {
    for (const f of [...files, "tests/conformance/p7-e1-boundary.test.ts"]) {
      expect(f.startsWith("tests/"), f).toBe(true);
      expect(
        AST_ROOTS.some((r) => f.startsWith(`${r}/`)),
        f,
      ).toBe(false);
    }
  });

  it("the E0 proof module's import set is its E0 set plus EXACTLY the one BLUE-authorized native verifier; the native module imports only the owners' read-side functions and contracts, never the checker (no cycle)", () => {
    const importsOf = (rel: string) =>
      [...text(rel).matchAll(/^} from "([^"]+)";|^import [^\n]*from "([^"]+)";/gm)].map(
        (m) => m[1] ?? m[2],
      );
    expect(importsOf("tests/support/p7-section10/proof.ts").sort()).toEqual(
      [
        "@immortalis/contracts",
        "../../../packages/engine/src/hash.ts",
        "../../../packages/engine/src/gm-wait-catalogue.ts",
        "../../../packages/engine/src/epistemic/derive.ts",
        "../../../packages/engine/src/epistemic/declaration.ts",
        "./native-observation.ts",
      ].sort(),
    );
    const nativeImports = importsOf(helper);
    expect(
      nativeImports.some(
        (i) => (i ?? "").includes("proof.ts") || (i ?? "").includes("evaluator.ts"),
      ),
      "the native module must not import the checker",
    ).toBe(false);
    for (const i of nativeImports)
      expect(
        [
          "@immortalis/contracts",
          "../../../packages/engine/src/hash.ts",
          "../../../packages/engine/src/epistemic/derive.ts",
          "../../../packages/engine/src/epistemic/declaration.ts",
          "../../../packages/engine/src/epistemic/observation.ts",
          "../../../packages/engine/src/owners/registry.ts",
          "../../../packages/engine/src/persistence/store.ts",
          "../../../packages/engine/src/production/admission.ts",
          "../../../packages/engine/src/temporal/identity.ts",
        ],
        i,
      ).toContain(i);
  });

  it("the exact E0 allowlist addition is the one native verifier and nothing else, and the E0 forbidden list is untouched", () => {
    const e0 = text("tests/conformance/p7-section10-proof.test.ts");
    const allowed = /const allowed = new Set\(\[([\s\S]*?)\]\);/.exec(e0);
    expect(allowed).not.toBeNull();
    const entries = [...allowed![1]!.matchAll(/^\s*"([^"]+)",/gm)].map((m) => m[1]);
    expect(entries.sort()).toEqual(
      [
        "@immortalis/contracts",
        "../../../packages/engine/src/hash.ts",
        "../../../packages/engine/src/gm-wait-catalogue.ts",
        "../../../packages/engine/src/epistemic/derive.ts",
        "../../../packages/engine/src/epistemic/declaration.ts",
        "./proof.ts",
        "./native-observation.ts",
      ].sort(),
    );
    for (const forbidden of [
      "/gm-wait-catalogue-current/",
      "/gen-gm-wait-catalogue/",
      "/gm-wait-custody/",
      "/owners\\/(registry|admission)/",
      "/\\/commit\\//",
      "/persistence/",
      "/protocol/",
      "/apps\\//",
      "/testkit/",
      "/node:/",
    ])
      expect(e0.includes(forbidden), `the E0 forbidden pattern ${forbidden} is still there`).toBe(
        true,
      );
  });
});
