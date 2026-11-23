// B1 S2/S3 scope, import and labelling conformance (F-014B: the GM-wait source catalogue S2 and the present-only read oracle S3).
// MECHANISM ONLY: this file judges no behaviour (the S2 and S3 suites do); it checks that the slice added exactly the paths its table
// declares, changed no forbidden file, imports and uses nothing it must not, and labels itself.
//
//   scope    the declared paths exist; they are the only source change under apps/ or packages/; outside tests/ nothing else moved
//   forbid   every file and tree the work order forbids is byte-identical to the base commit, tracked or not
//   imports  the production modules import only zod, @immortalis/contracts and their own siblings; no clock, randomness, filesystem or network;
//            the B0 request module and the engine index are untouched by them
//   wiring   `siOriginWitnessViolation` has exactly the declared production callers (the A0 "unwired" pin, superseded for category 8 only)
//   labels   every S2/S3 test title says what it is ([S2], [S3] or [scope]) and [mechanism only], and claims nothing more
//
// Custody is bytes at the pinned base commit, never ancestry. Where that commit is not retrievable (a shallow checkout) the comparisons are
// SKIPPED and reported as skipped, never claimed. Each text scanner is first run on a specimen it must flag and a specimen it must not.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  B3_PACKAGE_PATHS,
  B3_NON_PACKAGE_PATHS,
  B3_SOURCE_PATHS,
} from "../support/b3-scoped-deltas.ts";
import {
  B1_S2S3_BASE_COMMIT,
  B1_S2S3_EVIDENCE_PREFIX,
  B1_S2S3_OUTSIDE_PACKAGE_PATHS,
  B1_S2S3_PACKAGE_PATHS,
  B1_S2S3_SI_ORIGIN_WITNESS_PRODUCTION_CALLERS,
  B1_V2_WORKFLOW_PATH,
} from "../support/b1-s2s3-scoped-deltas.ts";
import { B1_S1_PACKAGE_PATHS } from "../support/b1-s1-scoped-deltas.ts";
import { A1_2A_EVIDENCE_PREFIX, A1_2A_PACKAGE_PATHS } from "../support/a1-2a-scoped-deltas.ts";
import { B2_EVIDENCE_PREFIX, B2_PACKAGE_PATHS, unionPaths } from "../support/b2-scoped-deltas.ts";

const git = (...args: string[]): Buffer | null => {
  try {
    return execFileSync("git", args, {
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    return null;
  }
};
const lines = (b: Buffer | null): string[] =>
  (b?.toString("utf8") ?? "").split("\n").filter(Boolean);
const baseReachable = git("cat-file", "-e", `${B1_S2S3_BASE_COMMIT}^{commit}`) !== null;
/** Content only: a package manager may mark bin scripts executable in a working tree, which is a mode change, not a change of this slice. */
const changedSince = (...paths: string[]): string[] =>
  lines(
    git("-c", "core.fileMode=false", "diff", "--name-only", B1_S2S3_BASE_COMMIT, "--", ...paths),
  );
const untrackedIn = (...paths: string[]): string[] =>
  lines(git("ls-files", "--others", "--exclude-standard", "--", ...paths));
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === "node_modules"
      ? []
      : e.isDirectory()
        ? walk(join(dir, e.name))
        : [join(dir, e.name)],
  );

/** Strips line and block comments and string-free whitespace noise so the code scanners judge code, not prose. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const productionModules = B1_S2S3_PACKAGE_PATHS.filter(
  (p) => p.startsWith("packages/engine/src/") && p.endsWith(".ts"),
);

describe("[scope] [mechanism only] B1 S2/S3 declared scope", () => {
  it("[scope] [mechanism only] every declared package path exists, and the table has no duplicate", () => {
    for (const p of B1_S2S3_PACKAGE_PATHS) expect(existsSync(p), p).toBe(true);
    expect(new Set(B1_S2S3_PACKAGE_PATHS).size).toBe(B1_S2S3_PACKAGE_PATHS.length);
  });

  it.skipIf(!baseReachable)(
    "[scope] [mechanism only] the declared paths are the only source change under apps/ or packages/ (tracked or not), and each really is new",
    () => {
      const changed = changedSince("apps", "packages");
      const untracked = untrackedIn("apps", "packages");
      // Declared inclusion (F-014B B1 S1, merged first): its one Temporal admission file, policed by that slice's own table and suite.
      // (and the F-014B B2 slice's recorded paths, which that slice's own table and suite police)
      expect([...changed, ...untracked].sort()).toEqual(
        unionPaths(
          B1_S1_PACKAGE_PATHS,
          A1_2A_PACKAGE_PATHS,
          B1_S2S3_PACKAGE_PATHS,
          B2_PACKAGE_PATHS,
          B3_PACKAGE_PATHS,
        ),
      );
      // every declared path is an ADDED file: absent from the base commit
      for (const p of B1_S2S3_PACKAGE_PATHS)
        expect(git("cat-file", "-e", `${B1_S2S3_BASE_COMMIT}:${p}`), `${p} is new`).toBeNull();
    },
  );

  it.skipIf(!baseReachable)(
    "[scope] [mechanism only] outside tests/ the only other changed paths are the declared tooling, the formatter ignore line and the evidence directory",
    () => {
      const outside = [...changedSince("."), ...untrackedIn(".")].filter(
        (p) => !p.startsWith("tests/"),
      );
      const declared = new Set([
        ...B1_S1_PACKAGE_PATHS,
        ...A1_2A_PACKAGE_PATHS,
        ...B1_S2S3_PACKAGE_PATHS,
        ...B1_S2S3_OUTSIDE_PACKAGE_PATHS,
        ...B2_PACKAGE_PATHS,
        ...B3_PACKAGE_PATHS,
        ...B3_SOURCE_PATHS,
      ]);
      const unexpected = outside.filter(
        (p) =>
          !declared.has(p) &&
          !p.startsWith(B1_S2S3_EVIDENCE_PREFIX) &&
          !p.startsWith(A1_2A_EVIDENCE_PREFIX) &&
          !p.startsWith(B2_EVIDENCE_PREFIX) &&
          !B3_NON_PACKAGE_PATHS.includes(p),
      );
      expect(unexpected).toEqual([]);
      for (const p of B1_S2S3_OUTSIDE_PACKAGE_PATHS)
        expect(outside.includes(p), `${p} changed`).toBe(true);
    },
  );
});

describe("[scope] [mechanism only] B1 S2/S3 forbidden files are byte-identical to the base commit", () => {
  // The work order (issue #122): no change to admission, owner admission, the coordinator writer, the historical verifier, the canonical
  // key registry, extension routing, the F-027 spec lock, any host or driver, the contracts index and the B0 module, or any wire schema.
  const FORBIDDEN = [
    "packages/engine/src/temporal",
    "packages/engine/src/owners",
    "packages/engine/src/index.ts",
    "packages/engine/src/persistence",
    "packages/engine/src/commit",
    "packages/engine/src/initial-setup",
    "packages/engine/src/ms-setup",
    "packages/contracts",
    "packages/protocol",
    "packages/operator",
    "packages/testkit",
    "apps",
    "spec",
    "tools/check-spec.ts",
    "docs/f014b",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "vitest.config.ts",
    "eslint.config.js",
    ".github",
  ];
  it.skipIf(!baseReachable)(
    "[scope] [mechanism only] no forbidden path changed, tracked or not, and the guard is not vacuous",
    () => {
      // (the one Temporal admission file F-014B B1 S1 declares in its own table, and the paths F-014B A1-2a declares in its own, are the only changes another slice may carry here)
      // (and the F-014B B2 slice's recorded paths, declared by its own table and suite)
      const otherSlices = new Set([
        ...B1_S1_PACKAGE_PATHS,
        ...A1_2A_PACKAGE_PATHS,
        B1_V2_WORKFLOW_PATH,
        ...B2_PACKAGE_PATHS,
        ...B3_PACKAGE_PATHS,
        ...B3_SOURCE_PATHS,
      ]);
      for (const p of FORBIDDEN) {
        expect(
          changedSince(p).filter((x) => !otherSlices.has(x)),
          p,
        ).toEqual([]);
        expect(
          untrackedIn(p).filter((x) => !otherSlices.has(x)),
          p,
        ).toEqual([]);
      }
      // not vacuous: the guard finds a path this slice DID change (the formatter ignore list)
      expect(changedSince(".prettierignore")).toEqual([".prettierignore"]);
    },
  );
});

describe("[scope] [mechanism only] B1 S2/S3 production modules are pure and isolated", () => {
  const IMPORT = /\bfrom\s+"([^"]+)"/g;
  const importsOf = (text: string): string[] =>
    [...code(text).matchAll(IMPORT)].map((m) => m[1] as string);
  const ALLOWED = /^(zod|@immortalis\/contracts|\.\/(hash|gm-wait-catalogue)\.ts)$/;
  const IMPURE =
    /\bDate\b|\bMath\.random\b|\bprocess\b|performance\.now|\bfetch\s*\(|\brequire\s*\(|from\s+"node:|\bsetTimeout\b|\bcrypto\./;
  const B0_OR_GM =
    /temporal-gm-wait|GM_INTERPRETED_PC_WAIT|role\.gm|permission\.rule\.adjudicate|GM_ADJUDICATION_AUTHORITY/;

  it("[scope] [mechanism only] the import scanner flags a forbidden specimen and accepts a clean one", () => {
    expect(
      importsOf('import { a } from "./owners/registry.ts";').every((s) => ALLOWED.test(s)),
    ).toBe(false);
    expect(
      importsOf('import { a } from "./hash.ts";\nimport { z } from "zod";').every((s) =>
        ALLOWED.test(s),
      ),
    ).toBe(true);
    expect(IMPURE.test("const t = Date.now();")).toBe(true);
    expect(IMPURE.test("const t = 1;")).toBe(false);
    expect(B0_OR_GM.test('import x from "../../contracts/src/temporal-gm-wait.ts"')).toBe(true);
  });

  it("[scope] [mechanism only] each production module imports only zod, the contracts package and its siblings", () => {
    for (const p of productionModules) {
      const bad = importsOf(readFileSync(p, "utf8")).filter((s) => !ALLOWED.test(s));
      expect(bad, p).toEqual([]);
    }
  });

  it("[scope] [mechanism only] each production module uses no clock, randomness, filesystem, process or network, and names neither the B0 request module nor a GM literal", () => {
    for (const p of productionModules) {
      const c = code(readFileSync(p, "utf8"));
      expect(IMPURE.test(c), `${p} impurity`).toBe(false);
      expect(B0_OR_GM.test(c), `${p} B0/GM`).toBe(false);
    }
  });

  it("[scope] [mechanism only] the engine package index does not export the S2/S3 modules", () => {
    const index = readFileSync("packages/engine/src/index.ts", "utf8");
    expect(index).not.toMatch(/gm-wait-catalogue|gm-wait-present-reader/);
  });
});

describe("[scope] [mechanism only] category 8 wiring: the A0 unwired pin superseded for the one declared caller", () => {
  const files = (): string[] =>
    [...walk("packages"), ...walk("apps")]
      .filter((f) => /\.(ts|mts|js|mjs)$/.test(f) && !f.includes("node_modules"))
      .filter((f) => readFileSync(f, "utf8").includes("siOriginWitnessViolation"))
      .sort();
  it("[scope] [mechanism only] siOriginWitnessViolation is named in production code only in its declaration and the declared callers", () => {
    expect(files()).toEqual(
      [
        "packages/contracts/src/temporal-origin.ts",
        ...B1_S2S3_SI_ORIGIN_WITNESS_PRODUCTION_CALLERS,
      ].sort(),
    );
    for (const p of B1_S2S3_SI_ORIGIN_WITNESS_PRODUCTION_CALLERS) {
      expect(B1_S2S3_PACKAGE_PATHS.includes(p), `${p} is a declared package path`).toBe(true);
    }
  });
});

describe("[scope] [mechanism only] B1 S2/S3 tests label themselves", () => {
  const TITLE =
    /(?<![.\w])(?:it|test)(?:\.\w+\((?:[^()]|\([^()]*\))*\))?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  const titlesOf = (text: string): string[] => [...text.matchAll(TITLE)].map((m) => m[2] as string);
  const LABEL = /^\[(B1|S2|S3|scope)\] \[mechanism only\] /;
  const CLAIM =
    /\b(PASS(ES|ED)?|certif\w+|production[- ]ready|playable|safe to wait|eligible for production)\b/i;

  it("[scope] [mechanism only] the title scanner reads titles and the rules flag a bad specimen", () => {
    const specimen =
      'it("[S2] [mechanism only] ok", () => {});\nit.skipIf(!x)("[S3] [mechanism only] bad PASSES", () => {});\nit("no label", () => {});';
    expect(titlesOf(specimen)).toEqual([
      "[S2] [mechanism only] ok",
      "[S3] [mechanism only] bad PASSES",
      "no label",
    ]);
    expect(titlesOf(specimen).filter((t) => !LABEL.test(t))).toEqual(["no label"]);
    expect(titlesOf(specimen).filter((t) => CLAIM.test(t))).toEqual([
      "[S3] [mechanism only] bad PASSES",
    ]);
  });

  it("[scope] [mechanism only] every title in every B1 S2/S3 test file carries its label and claims nothing beyond what it checks", () => {
    const mine = readdirSync("tests/conformance")
      .filter((f) => /^(b1-s2s3-|gm-wait-(catalogue|present))/.test(f) && f.endsWith(".test.ts"))
      .map((f) => join("tests/conformance", f))
      .concat(
        existsSync("tests/integration")
          ? readdirSync("tests/integration")
              .filter((f) => /^gm-wait-(catalogue|present)/.test(f))
              .map((f) => join("tests/integration", f))
          : [],
      );
    expect(mine.length).toBeGreaterThan(0);
    for (const f of mine) {
      const titles = titlesOf(readFileSync(f, "utf8"));
      expect(titles.length, f).toBeGreaterThan(0);
      for (const t of titles) {
        expect(LABEL.test(t), `${f}: ${t}`).toBe(true);
        expect(CLAIM.test(t), `${f}: ${t}`).toBe(false);
      }
    }
  });
});
