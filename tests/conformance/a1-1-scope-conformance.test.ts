// F-014B A1-1 (operator-side strict version 2 chronology capture) — SCOPE, REACHABILITY and LABELLING. T1 MECHANISM ONLY: this file judges no
// behaviour; the A1-C and A1-T tests do. It checks that the slice changed exactly the two production files its table declares, that the author
// verification inside the intake is the base commit's own text, that nothing the slice is forbidden to touch moved, that no host reaches the
// new request type, that the legacy controls and the version 1 direct route are untouched, and that the A1-1 tests label themselves.
//
//   A1-T07  reachability: the closed census of files that name a captured-route entry point, and the new request type named nowhere else
//   A1-T08  legacy controls and the version 1 direct route are byte-identical to the base commit
//   scope   the author verification clauses, and the out-of-scope paths, are byte-identical to the base commit
//   labels  every A1-1 test title says [mechanism only]; none claims a pass, an eligibility or a production admission
//
// Custody is the bytes at the pinned base commit (tests/support/a1-1-scoped-deltas.ts), never ancestry. Where that commit is not retrievable (a
// shallow checkout) the comparisons are SKIPPED and reported as skipped, never claimed.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  A1_1_BASE_COMMIT,
  A1_1_PACKAGE_PATHS,
  A1_1_TRANSITION,
} from "../support/a1-1-scoped-deltas.ts";

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
const baseReachable = git("cat-file", "-e", `${A1_1_BASE_COMMIT}^{commit}`) !== null;
const atBase = (path: string): Buffer | null => git("show", `${A1_1_BASE_COMMIT}:${path}`);
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === "node_modules"
      ? []
      : e.isDirectory()
        ? walk(join(dir, e.name))
        : e.name.endsWith(".ts")
          ? [join(dir, e.name)]
          : [],
  );

describe("A1-1 scope: the declared transition is the two production files and the author verification is the base commit's text", () => {
  it.skipIf(!baseReachable)(
    "A1-1 scope [mechanism only]: each declared file has its declared original and A1-1 length and diff scope, and no other path under apps/ or packages/ is a source change (tracked or not)",
    () => {
      for (const [path, t] of Object.entries(A1_1_TRANSITION)) {
        expect(atBase(path)!.length, `${path} original length`).toBe(t.baseBytes);
        expect(readFileSync(path).length, `${path} A1-1 length`).toBe(t.a1Bytes);
        const stat = lines(git("diff", "--numstat", A1_1_BASE_COMMIT, "--", path)).map((l) =>
          l.split("\t"),
        );
        expect(stat, `${path} numstat`).toEqual([[String(t.added), String(t.deleted), path]]);
      }
      // content only: a package manager may mark bin scripts executable in a working tree, which is a mode change, not a change of this slice
      const changed = lines(
        git(
          "-c",
          "core.fileMode=false",
          "diff",
          "--name-only",
          A1_1_BASE_COMMIT,
          "--",
          "apps",
          "packages",
        ),
      );
      const untracked = lines(
        git("ls-files", "--others", "--exclude-standard", "--", "apps", "packages"),
      );
      expect([...changed, ...untracked].sort()).toEqual([...A1_1_PACKAGE_PATHS].sort());
      // the declared allow-list is not a place to park files that did not change
      expect(A1_1_PACKAGE_PATHS.every((p) => changed.includes(p))).toBe(true);
    },
  );

  it.skipIf(!baseReachable)(
    "A1-1 scope [mechanism only]: the author verification inside the intake is byte-for-byte the base commit's text, and the scan is not vacuous",
    () => {
      const start = '      if (req.author.grade !== "ORIGINAL_MESSAGE_VERIFIED")';
      const end = "      const capture = await verifyCaptureForIntake(";
      const region = (text: string): string => {
        const a = text.indexOf(start);
        const b = text.indexOf(end);
        return a >= 0 && b > a ? text.slice(a, b) : "";
      };
      const path = "packages/operator/src/initial-setup.ts";
      const base = region(atBase(path)!.toString("utf8"));
      const now = region(readFileSync(path, "utf8"));
      expect(base.length).toBeGreaterThan(900);
      for (const clause of [
        "req.author.grade !== ",
        "AUTHOR_MESSAGE_HASH",
        "verifier.verifyOriginalMessage",
        "no genuine production method is selected",
      ])
        expect(base).toContain(clause);
      expect(now).toBe(base);
      // a changed clause is told apart
      expect(now.replace("!== ", "=== ")).not.toBe(base);
      expect(region("")).toBe("");
    },
  );

  it.skipIf(!baseReachable)(
    "A1-1 scope [mechanism only]: every path the slice is forbidden to touch is byte-identical to the base commit, tracked or not",
    () => {
      const FORBIDDEN = [
        "apps",
        // the D-3 protected gateways, their contracts and their three conformance suites
        "packages/protocol",
        "packages/contracts/src/protocol-pc-target-advance.ts",
        "packages/contracts/src/protocol-null-pc-advance.ts",
        "packages/contracts/src/protocol-null-pc-held-advance.ts",
        "tests/conformance/protocol-pc-target-advance-conformance.test.ts",
        "tests/conformance/protocol-null-pc-ooc-advance-conformance.test.ts",
        "tests/conformance/protocol-null-pc-ooc-held-continuation-conformance.test.ts",
        // Temporal: the kernel contract, integrity, admission, coordinator, bootstrap and the provider set
        "packages/contracts/src/temporal.ts",
        "packages/engine/src/temporal",
        // the owner registry and admission, the initial-setup engine (admission, identity, publish), the MS machinery, the A0 and B0 modules
        "packages/engine/src/owners",
        "packages/engine/src/initial-setup",
        "packages/engine/src/ms-setup",
        "packages/contracts/src/initial-locality.ts",
        "packages/contracts/src/temporal-origin.ts",
        "packages/contracts/src/temporal-gm-wait.ts",
        "packages/testkit",
        // the spec lock, its checker, the A0 source lock documents, the version 1 direct time route
        "spec/f027",
        "tools/check-spec.ts",
        "docs/f014b",
        "packages/operator/src/time-initialization.ts",
      ];
      for (const p of FORBIDDEN) {
        expect(
          lines(git("-c", "core.fileMode=false", "diff", "--name-only", A1_1_BASE_COMMIT, "--", p)),
          p,
        ).toEqual([]);
        expect(lines(git("ls-files", "--others", "--exclude-standard", "--", p)), p).toEqual([]);
      }
      // the guard is not vacuous: it finds the two files this slice DID change
      for (const p of A1_1_PACKAGE_PATHS)
        expect(
          lines(git("-c", "core.fileMode=false", "diff", "--name-only", A1_1_BASE_COMMIT, "--", p)),
        ).toEqual([p]);
    },
  );
});

describe("A1-T07 [mechanism only] reachability: no shipped host reaches the operator capture", () => {
  const ENTRY =
    /\b(InitialSetupService|MsInitialActorService|ChronologyCaptureStore|PrivateRunner|MsActorRunner|captureStartingChronology|initializeCapturedChronology|verifyCaptureForIntake)\b/;
  const NEW_SURFACE = /\b(CaptureRequestV2|declares_one_si_second_per_unit)\b/;
  const production = () =>
    ["apps", "packages", "tools"].flatMap(walk).filter((f) => !f.startsWith("packages/testkit/"));

  it("A1-T07 [mechanism only] the files that name a captured-route entry point are exactly the declared seven, and the new request type is named in one file only", () => {
    const named = production()
      .filter((f) => ENTRY.test(readFileSync(f, "utf8")))
      .sort();
    // the seventh is the F-014B A0 OB-030 measurement harness, a declared non-package file that only calls the writer to seed fixture journals
    expect(named).toEqual([
      "packages/engine/src/temporal/captured-chronology.ts",
      "packages/operator/src/chronology-capture.ts",
      "packages/operator/src/initial-runner.ts",
      "packages/operator/src/initial-setup.ts",
      "packages/operator/src/ms-actor-runner.ts",
      "packages/operator/src/ms-initial-actor.ts",
      "tools/a0-ob030-benchmark.ts",
    ]);
    expect(
      production()
        .filter((f) => NEW_SURFACE.test(readFileSync(f, "utf8")))
        .sort(),
    ).toEqual(["packages/operator/src/chronology-capture.ts"]);
    // the scanners are not vacuous: they flag a synthetic host wiring and a synthetic use of the new request type
    expect(ENTRY.test("const s = new InitialSetupService(deps);")).toBe(true);
    expect(NEW_SURFACE.test("const r: CaptureRequestV2 = req;")).toBe(true);
    expect(NEW_SURFACE.test("const r = { declares_one_si_second_per_unit: true };")).toBe(true);
    expect(ENTRY.test(readFileSync("apps/phone/src/server.ts", "utf8"))).toBe(false);
  });

  it("A1-T07 [mechanism only] no host constructs an operator-confirmed capture: the only production callers of the capture producer are the operator modules themselves", () => {
    const callers = production()
      .filter((f) => /\bcaptureStartingChronology\s*\(/.test(readFileSync(f, "utf8")))
      .sort();
    expect(callers).toEqual(["packages/operator/src/chronology-capture.ts"]);
  });
});

describe("A1-T08 [mechanism only] the legacy controls and the version 1 direct route are untouched", () => {
  it.skipIf(!baseReachable)(
    "A1-T08 [mechanism only] the version 1 direct time route, the natural-chat chronology path and the legacy control suites are byte-identical to the base commit",
    () => {
      const same = [
        "packages/operator/src/time-initialization.ts",
        "packages/operator/src/closed-setting.ts",
        "apps/phone/src/route-stages.ts",
        "apps/phone/src/chat-tools.ts",
        "tests/integration/legacy-package-compat.test.ts",
        "tests/integration/phone-bridge.test.ts",
        "tests/integration/initial-setup-falsifiers.test.ts",
        "tests/unit/protected-store.test.ts",
      ];
      for (const p of same) {
        const base = atBase(p);
        expect(base, `${p} exists at the base`).not.toBeNull();
        expect(base!.equals(readFileSync(p)), p).toBe(true);
      }
      // not vacuous: one byte of difference is told apart
      const sample = atBase(same[0]!)!;
      const flipped = Buffer.from(sample);
      flipped[0] = (flipped[0]! + 1) % 256;
      expect(sample.equals(flipped)).toBe(false);
    },
  );
});

describe("A1-1 labels: every A1-1 test says what it is and claims nothing more", () => {
  const FILES = [
    "tests/unit/operator-capture-v2.test.ts",
    "tests/integration/operator-capture-existing-law.test.ts",
    "tests/integration/operator-capture-v2-chain.test.ts",
    "tests/conformance/a1-1-scope-conformance.test.ts",
  ] as const;
  const TITLE = /\b(?:it|describe)(?:\.skipIf\([^)]*\))?\(\s*([`"])((?:(?!\1)[^\\\n])+)\1/g;
  const titles = (text: string): string[] => [...text.matchAll(TITLE)].map((m) => m[2]!);
  const FORBIDDEN =
    /\bPASS\b|\bELIGIBLE\b|admitted by production|production[- ]admitted|production result/;
  const labelled = (t: string): boolean => /^A1-/.test(t) && /\[mechanism only\]/.test(t);
  // the three group-level titles of this file and the "describe" headers need only the A1 id; tests need the label too
  const testTitles = (text: string): string[] =>
    [...text.matchAll(/\bit(?:\.skipIf\([^)]*\))?\(\s*([`"])((?:(?!\1)[^\\\n])+)\1/g)].map(
      (m) => m[2]!,
    );

  it("A1-1 labels [mechanism only]: the scanner flags an unlabelled title and a title that claims a pass, and passes a labelled one", () => {
    expect(labelled("A1-T01 [mechanism only] derives the capture")).toBe(true);
    expect(labelled("A1-T01 derives the capture")).toBe(false);
    expect(labelled("derives the capture [mechanism only]")).toBe(false);
    expect(FORBIDDEN.test("A1-T01 [mechanism only] the chain PASS")).toBe(true);
    expect(FORBIDDEN.test("A1-T01 [mechanism only] eligible for nothing")).toBe(false);
    // (the specimens are assembled so that this file's own text never contains a title-shaped call of its own)
    const specimen = ["it", '("a", () => 1);\n', "it.skipIf(x)", '("b", () => 2);'].join("");
    expect(testTitles(specimen)).toEqual(["a", "b"]);
    expect(titles(["describe", '("A1-C01 x", () => {});'].join(""))).toEqual(["A1-C01 x"]);
  });

  it("A1-1 labels [mechanism only]: every test title carries its A1 id and [mechanism only]; no title claims more than the mechanism, and each file's header says MECHANISM ONLY", () => {
    for (const file of FILES) {
      const text = readFileSync(file, "utf8");
      const tests = testTitles(text);
      expect(tests.length, file).toBeGreaterThan(0);
      for (const t of tests) expect(labelled(t), `${file}: ${t}`).toBe(true);
      for (const t of titles(text)) {
        expect(FORBIDDEN.test(t), `${file}: ${t}`).toBe(false);
        expect(/^A1-/.test(t), `${file}: ${t}`).toBe(true);
      }
      expect(text, file).toContain("MECHANISM ONLY");
    }
  });
});
