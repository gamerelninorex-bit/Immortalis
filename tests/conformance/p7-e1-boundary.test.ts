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
    expect(proof).toContain("readonly nativeEvidence?: NativeEvidenceHandle;");
    expect(proof).toContain("installedNativeVerifier(evidence, {");
    // the verifier is installed ONCE (write-once), by the native module at load and by nothing else in the tree
    expect(proof).toMatch(/if \(installedNativeVerifier !== null\)\s*\n\s*throw new Error/);
    const sites: string[] = [];
    const walk = (rel: string) => {
      for (const e of readdirSync(join(REPO_ROOT, rel), { withFileTypes: true })) {
        const next = `${rel}/${e.name}`;
        if (e.isDirectory()) walk(next);
        else if (e.name.endsWith(".ts") && /^installNativeReceiptVerifier\(/m.test(text(next)))
          sites.push(next);
      }
    };
    walk("tests");
    expect(sites, "the one top-level installation").toEqual([helper]);
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

  it("the E0 proof module gained NO import (its boundary suite is untouched); the native module imports only the owners' read-side functions, contracts and the E0 module", () => {
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
      ].sort(),
    );
    for (const i of importsOf(helper))
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
          "./proof.ts",
        ],
        i,
      ).toContain(i);
  });
});
