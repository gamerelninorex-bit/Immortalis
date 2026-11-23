// F-014B B2-T07 (static half) — the GM tool and every production surface have NO positive source-author or write path into GM-wait custody. STATIC
// source inspection only: it judges which files name which symbols and imports, and nothing about behaviour (the integration tests judge that).
//
// The custody writer, the origin-proof mint and the group builders live in ONE module owned by the Temporal kernel. Production code outside the
// commit core, the admission / registry / persistence wiring and the Temporal owner must not reach them: the configured-GM adapter consumes status
// and forwards verified input only, and the Temporal owner is the sole canonical writer.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const PRODUCTION_ROOTS = [
  "apps",
  "packages/contracts/src",
  "packages/engine/src",
  "packages/operator/src",
  "packages/protocol/src",
];
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    if (n === "node_modules") return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
const files = PRODUCTION_ROOTS.flatMap((r) => walk(join(ROOT, r))).map((p) => relative(ROOT, p));
const text = (f: string) => readFileSync(join(ROOT, f), "utf8");

/** the only production modules that may import the custody module: the core that holds the fence, the admission/registry/persistence wiring, the Temporal owner */
const MAY_IMPORT_CUSTODY = new Set([
  "packages/engine/src/commit/campaign-core.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/owners/extension.ts",
  "packages/engine/src/owners/registry.ts",
  "packages/engine/src/persistence/checkpoint-package.ts",
  "packages/engine/src/persistence/file-package.ts",
  "packages/engine/src/temporal/admission.ts",
  "packages/engine/src/temporal/integrity.ts",
  "packages/engine/src/index.ts",
]);
/** the symbols that write, mint or build custody: named in no production file but the module that defines them (the index only re-exports the module) */
const WRITE_SYMBOLS = [
  "GmWaitCustody",
  "gmWaitOriginProof",
  "GmWaitOriginProof",
  "buildMarkerGroup",
  "buildOpenGroup",
  "buildSealGroup",
  "buildNoOpenGroup",
  "buildReconcileGroup",
];

describe("B2-T07 static boundary of the GM-wait custody", () => {
  it("[control] the inspection sees the production tree and the custody module", () => {
    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain("packages/engine/src/gm-wait-custody.ts");
    expect(files).toContain("apps/phone/src/gm-wait-tool.ts");
  });

  it("no production file imports the custody module except the core, the wiring and the Temporal owner", () => {
    const importers = files.filter((f) =>
      /from ["'][^"']*gm-wait-custody(\.ts)?["']/.test(text(f)),
    );
    for (const f of importers)
      expect(MAY_IMPORT_CUSTODY.has(f) || f.startsWith("packages/engine/src/temporal/"), f).toBe(
        true,
      );
    expect(
      importers.filter(
        (f) =>
          f.startsWith("apps/") ||
          f.startsWith("packages/operator/") ||
          f.startsWith("packages/protocol/"),
      ),
    ).toEqual([]);
  });

  it("no production file other than the custody module itself names a write, mint or build symbol (the engine index only re-exports the module)", () => {
    for (const symbol of WRITE_SYMBOLS) {
      const users = files.filter((f) => new RegExp(`\\b${symbol}\\b`).test(text(f)));
      expect(
        users.filter((f) => f !== "packages/engine/src/gm-wait-custody.ts"),
        symbol,
      ).toEqual([]);
    }
  });

  it("the GM wait tool and the trusted ingress stay read-only: they name no custody symbol and no commit", () => {
    for (const f of [
      "apps/phone/src/gm-wait-tool.ts",
      "packages/operator/src/gm-wait-ingress.ts",
    ]) {
      const t = text(f);
      for (const symbol of [...WRITE_SYMBOLS, "gm-wait-custody", "fixtureCanonicalAdmission"])
        expect(t, `${f} / ${symbol}`).not.toContain(symbol);
      expect(t, `${f} must not publish`).not.toMatch(/\.commit\(/);
    }
  });

  it("the TESTKIT-ONLY fixture admission, which alone can qualify a synthetic preparation, is imported by no app, operator or protocol file", () => {
    const users = files.filter(
      (f) =>
        /\bfixture(Ms)?CanonicalAdmission\b/.test(text(f)) &&
        (f.startsWith("apps/") ||
          f.startsWith("packages/operator/") ||
          f.startsWith("packages/protocol/")),
    );
    expect(users).toEqual([]);
  });

  it("the B0 wire module remains unexported from the contracts index, and the custody schemas carry no write authority of their own", () => {
    const index = text("packages/contracts/src/index.ts");
    expect(index).not.toContain("temporal-gm-wait");
    // a schema is not a writer: the contracts package contains no commit call for custody
    expect(text("packages/contracts/src/temporal.ts")).not.toMatch(/\.commit\(/);
    expect(text("packages/contracts/src/temporal-custody.ts")).not.toMatch(/\.commit\(/);
    expect(index).toContain('"./temporal-custody.ts"');
  });
});
