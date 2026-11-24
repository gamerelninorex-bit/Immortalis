// F-014B P-7 E1 - the static boundary of the native witness: test-only, read-only, outside every shared surface. MECHANISM ONLY.
import { readFileSync } from "node:fs";
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
      "writeFile",
      "appendFile",
      "Date.now",
      "Math.random",
      "process.",
    ])
      expect(source.includes(token), token).toBe(false);
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

  it("the E0 proof module gained no import: its allow-listed, read-only import set is unchanged", () => {
    const imports = [
      ...text("tests/support/p7-section10/proof.ts").matchAll(
        /^} from "([^"]+)";|^import [^\n]*from "([^"]+)";/gm,
      ),
    ].map((m) => m[1] ?? m[2]);
    for (const i of imports)
      expect(
        [
          "@immortalis/contracts",
          "../../../packages/engine/src/hash.ts",
          "../../../packages/engine/src/gm-wait-catalogue.ts",
          "../../../packages/engine/src/epistemic/derive.ts",
          "../../../packages/engine/src/epistemic/declaration.ts",
        ],
        i,
      ).toContain(i);
  });
});
