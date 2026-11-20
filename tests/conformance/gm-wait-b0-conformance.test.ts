// B0-70..B0-72 — scope, import and labelling conformance for F-014B package B0 (docs/f014b/b0-gm-request-contract.md §5.1, §6, §7).
//
// T1 mechanism component (BLUE v0.3 §4): strict request/refusal contract only; no B1 positive, no T0 PASS, no production capability; F-014B LC closures unchanged.
//
// What it checks, all of it clerical and none of it behavioural:
//   B0-70  every file the contract lists in section 5.1 is byte-identical to the base commit, read with `git show <base>:<path>` and compared with the
//          working tree. Nothing here states a hash of any file; custody is by commit and path. The two legacy B0 test files and the accepted source
//          lock are compared the same way against the commit BLUE accepted. Where that history is not reachable (a shallow checkout) the comparison is
//          skipped, never claimed; CI checks out the full history, so it runs there.
//   B0-71  the new module imports only zod and contracts modules, names no store, coordinator, journal, protocol package, origin-witness key, catalogue
//          reader or history-verification identifier, uses no clock, network, filesystem or randomness, and is not exported from the package index.
//   B0-72  every B0 test file labels every test title with one of the three permitted prefixes, carries its header comment, and uses none of the
//          forbidden words in a title or in code.
// Each scanner is first run on a specimen that it must flag and a specimen that it must not, so a scanner that matched nothing could not pass.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { code } from "../support/f027.ts";

/** The census base of the contract (section 5.1) and the commit at which BLUE accepted the source lock. */
const BASE = "0c9e74b9d5dc8845751a543ace777277b2cb1308";
const ACCEPTED = "b069f7355347aac61464c43fec5a14268220e524";

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
const reachable = (ref: string): boolean => git("cat-file", "-e", `${ref}^{commit}`) !== null;
const baseReachable = reachable(BASE);
const acceptedReachable = reachable(ACCEPTED);
/** Bytes of `path` at `ref`, or null when the path is not in that commit. */
const atRef = (ref: string, path: string): Buffer | null => git("show", `${ref}:${path}`);
const sameBytes = (a: Buffer | null, b: Buffer | null): boolean =>
  a !== null && b !== null && a.equals(b);
const lines = (b: Buffer | null): string[] =>
  (b?.toString("utf8") ?? "").split("\n").filter(Boolean);

/** Contract section 5.1: byte-identical under B0. */
const SECTION_5_1_FILES = [
  "packages/protocol/src/active-pc-target-advance.ts",
  "packages/protocol/src/null-pc-ooc-advance.ts",
  "packages/protocol/src/null-pc-ooc-held-continuation.ts",
  "packages/contracts/src/protocol-pc-target-advance.ts",
  "packages/contracts/src/protocol-null-pc-advance.ts",
  "packages/contracts/src/protocol-null-pc-held-advance.ts",
  "tests/conformance/protocol-pc-target-advance-conformance.test.ts",
  "tests/conformance/protocol-null-pc-ooc-advance-conformance.test.ts",
  "tests/conformance/protocol-null-pc-ooc-held-continuation-conformance.test.ts",
  "packages/protocol/src/pc-transfer-advance.ts",
  "packages/contracts/src/temporal.ts",
  "packages/engine/src/temporal/coordinator.ts",
  "packages/engine/src/temporal/admission.ts",
  "packages/engine/src/temporal/integrity.ts",
  "packages/engine/src/temporal/providers.ts",
  "packages/contracts/src/world-foundation.ts",
  "packages/engine/src/owners/admission.ts",
  "packages/engine/src/owners/registry.ts",
] as const;
/** Contract section 5.1: the two tree identities. B0 adds no file to either tree. */
const SECTION_5_1_TREES = ["packages/operator/src", "packages/protocol/src"] as const;

/** The files whose accepted content BLUE's B0 construction brief fixes: the two legacy-control tests and the source lock with its intake. */
const ACCEPTED_FILES = [
  "tests/contract/gm-wait-b0-legacy-schema-control.test.ts",
  "tests/security/gm-wait-b0-legacy-isolation.test.ts",
  "docs/f014b/b0-gm-request-contract.md",
  "docs/f014b/b0-preflight-submission.md",
] as const;

describe("B0 refusal-only: the files that B0 must not change", () => {
  it.skipIf(!baseReachable)(
    "B0 refusal-only: every section 5.1 file is byte-identical to the base commit",
    () => {
      for (const path of SECTION_5_1_FILES) {
        const atBase = atRef(BASE, path);
        expect(atBase, `${path} exists at the base`).not.toBeNull();
        expect(sameBytes(atBase, readFileSync(path)), path).toBe(true);
      }
      // the comparison is not vacuous: the same file with one byte changed is told apart from the base
      const sample = atRef(BASE, SECTION_5_1_FILES[0])!;
      const flipped = Buffer.from(sample);
      flipped[0] = (flipped[0]! + 1) % 256;
      expect(sameBytes(sample, flipped)).toBe(false);
      expect(sameBytes(sample, Buffer.from(sample))).toBe(true);
    },
  );

  it.skipIf(!baseReachable)(
    "B0 refusal-only: the operator and protocol source trees are those of the base commit, with no file added, removed or changed",
    () => {
      for (const tree of SECTION_5_1_TREES) {
        // content only: a package manager may mark bin scripts executable in a working tree, which is a mode change, not a change of content
        const changed = lines(
          git("-c", "core.fileMode=false", "diff", "--name-only", BASE, "--", tree),
        );
        const untracked = lines(git("ls-files", "--others", "--exclude-standard", "--", tree));
        const tracked = lines(git("ls-files", "--", tree)).sort();
        const atBase = lines(git("ls-tree", "-r", "--name-only", BASE, "--", tree)).sort();
        expect(atBase.length, `${tree} is not empty at the base`).toBeGreaterThan(0);
        expect(changed, `${tree} changed`).toEqual([]);
        expect(untracked, `${tree} untracked`).toEqual([]);
        expect(tracked, `${tree} file list`).toEqual(atBase);
      }
    },
  );

  it.skipIf(!acceptedReachable)(
    "B0 refusal-only: the two legacy-control tests, the accepted source lock and its intake are byte-identical to the accepted commit",
    () => {
      for (const path of ACCEPTED_FILES) {
        const accepted = atRef(ACCEPTED, path);
        expect(accepted, `${path} exists at the accepted commit`).not.toBeNull();
        expect(sameBytes(accepted, readFileSync(path)), path).toBe(true);
      }
    },
  );
});

// ---------------------------------------------------------------------------------------------
// B0-71: the module
// ---------------------------------------------------------------------------------------------

const MODULE = "packages/contracts/src/temporal-gm-wait.ts";

/** Source with comments removed, for specimens that are not files (the same two rules as the shared reader `code`). */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Module specifiers named by a source text: static imports and re-exports, side-effect imports, dynamic imports and require calls. */
const specifiers = (source: string): string[] => [
  ...[...source.matchAll(/\bfrom\s+"([^"]+)"/g)].map((m) => m[1]!),
  ...[...source.matchAll(/^\s*import\s+"([^"]+)"/gm)].map((m) => m[1]!),
  ...[...source.matchAll(/\b(?:import|require)\s*\(\s*(?:"([^"]+)"|[^)]*)\)/g)].map(
    (m) => m[1] ?? "<computed>",
  ),
];

/** Names the module must never carry, anywhere, comments included (contract section 6 and B0-71). */
const FORBIDDEN_NAMES: ReadonlyArray<readonly [string, RegExp]> = [
  ["a store", /store/i],
  ["a coordinator", /coordinator/i],
  ["a journal", /journal/i],
  ["the protocol package", /protocol/i],
  ["an engine or package import", /@immortalis\/|packages\/engine/],
  [
    "the temporal origin key",
    /temporal\/origin|temporal_origin|temporal-origin|origin[_ ]witness/i,
  ],
  ["a catalogue reader", /catalogue[-_ ]?reader|read[-_ ]?catalogue/i],
  ["the history verification identifier", /history[-_ ]?verification/i],
];
/** Constructs a pure module has no use for, in code only: a clock, the network, the filesystem, randomness, module state, a dynamic load. */
const FORBIDDEN_CODE: ReadonlyArray<readonly [string, RegExp]> = [
  ["a clock", /\bDate\b|\bperformance\b|\bsetTimeout\b|\bsetInterval\b|\bhrtime\b/],
  [
    "the network",
    /\bfetch\b|\bXMLHttpRequest\b|\bWebSocket\b|\bnode:(?:http|https|net|dgram|dns)\b/,
  ],
  ["the filesystem", /\bnode:fs\b|\breadFile|\bwriteFile|\bexistsSync\b|\bprocess\b/],
  ["randomness", /\bMath\.random\b|\bcrypto\b/],
  ["module state", /^(?:let|var)\s/m],
  ["a dynamic load", /\bimport\s*\(|\brequire\s*\(/],
];

/** Everything wrong with a module text, as readable strings. */
const problems = (
  source: string,
  stripped: string,
  existing: (spec: string) => boolean,
): string[] => {
  const out: string[] = [];
  for (const spec of specifiers(stripped)) {
    const allowed =
      spec === "zod" ||
      (/^\.\/[a-z0-9-]+\.ts$/.test(spec) && spec !== "./index.ts" && existing(spec));
    if (!allowed) out.push(`import of ${spec}`);
  }
  for (const [what, re] of FORBIDDEN_NAMES) if (re.test(source)) out.push(`names ${what}`);
  for (const [what, re] of FORBIDDEN_CODE) if (re.test(stripped)) out.push(`uses ${what}`);
  return out;
};

describe("B0 refusal-only: the new module", () => {
  const contractsFile = (spec: string): boolean =>
    existsSync(`packages/contracts/src/${spec.slice(2)}`);

  it("B0 refusal-only: the scanner flags a specimen with every kind of fault and passes a clean one", () => {
    const dirty = [
      'import { z } from "zod";',
      'import { Engine } from "@immortalis/engine";',
      'import { x } from "../../engine/src/temporal/coordinator.ts";',
      'import { y } from "./index.ts";',
      'import { w } from "./does-not-exist.ts";',
      'const lazy = await import("node:fs");',
      "let counter = 0;",
      "const now = Date.now();",
      "const t = fetch('x');",
      "const r = Math.random();",
      "// a journal, a store, the protocol package, temporal/origin, a catalogue reader, historyVerificationId",
    ].join("\n");
    const found = problems(dirty, stripComments(dirty), contractsFile);
    for (const needle of [
      "import of @immortalis/engine",
      "import of ../../engine/src/temporal/coordinator.ts",
      "import of ./index.ts",
      "import of ./does-not-exist.ts",
      "import of node:fs",
      "names a store",
      "names a coordinator",
      "names a journal",
      "names the protocol package",
      "names the temporal origin key",
      "names a catalogue reader",
      "names the history verification identifier",
      "uses a clock",
      "uses the network",
      "uses randomness",
      "uses module state",
      "uses a dynamic load",
    ])
      expect(found, needle).toContain(needle);
    const clean = [
      'import { z } from "zod";',
      'import { Id } from "./ids.ts";',
      "export const a = 1;",
    ].join("\n");
    expect(problems(clean, stripComments(clean), contractsFile)).toEqual([]);
  });

  it("B0 refusal-only: the module imports only zod and contracts modules and names no store, coordinator, protocol package, origin key, catalogue reader or history-verification identifier", () => {
    expect(existsSync(MODULE)).toBe(true);
    expect(problems(readFileSync(MODULE, "utf8"), code(MODULE), contractsFile)).toEqual([]);
    // it does import zod and the contracts it composes, so the allow-list is exercised and not empty
    const named = specifiers(code(MODULE));
    expect(named).toContain("zod");
    expect(named.filter((s) => s.startsWith("./")).length).toBeGreaterThan(3);
    // and it is not exported from the package index: BLUE did not clear that without a separate source review
    expect(readFileSync("packages/contracts/src/index.ts", "utf8")).not.toMatch(/temporal-gm-wait/);
    expect(readFileSync("packages/contracts/package.json", "utf8")).not.toMatch(/temporal-gm-wait/);
  });
});

// ---------------------------------------------------------------------------------------------
// B0-72: labels and headers
// ---------------------------------------------------------------------------------------------

/** The new test files carry the B0-only labels; the files that characterize existing behaviour carry the legacy label. */
const NEW_TEST_FILES = [
  "tests/contract/gm-wait-b0-schemas.test.ts",
  "tests/unit/gm-wait-b0-origin-pairing.test.ts",
  "tests/unit/gm-wait-b0-si-subday.test.ts",
  "tests/unit/gm-wait-b0-sealed-identity.test.ts",
  "tests/conformance/gm-wait-b0-conformance.test.ts",
] as const;
const LEGACY_TEST_FILES = [
  "tests/contract/gm-wait-b0-legacy-schema-control.test.ts",
  "tests/security/gm-wait-b0-legacy-isolation.test.ts",
] as const;
const NEW_LABELS = ["B0 refusal-only:", "B0 shape control (not admission):"] as const;
const LEGACY_LABEL = "B0 refusal-only (legacy control):";

/** Words that must appear in no title and in no code of a B0 test. They are assembled from pieces so that this file does not carry them itself. */
const WORDS = [
  ["PA", "SS"],
  ["ELIGI", "BLE"],
  ["ADMIT", "TED"],
  ["T", "0"],
  ["B", "1"],
].map((p) => p.join(""));
/** The header sentence of contract section 6, verbatim; its forbidden words are taken from the assembled list above, so this file does not spell them. */
const [W_PASS, , , W_T0, W_B1] = WORDS as [string, string, string, string, string];
const HEADER = `T1 mechanism component (BLUE v0.3 §4): strict request/refusal contract only; no ${W_B1} positive, no ${W_T0} ${W_PASS}, no production capability; F-014B LC closures unchanged.`;
const LEGACY_NEGATION = `no ${W_B1} positive and no ${W_T0} ${W_PASS}`;

const TITLE_WORDS = new RegExp(`\\b(?:${WORDS.join("|")})\\b`, "i");
const CODE_WORDS = new RegExp(`\\b(?:${WORDS.join("|")})\\b`);

/** The first argument of every it( / describe( call that is a plain or template string literal, in source order, with the call forms that are not. */
const titlesOf = (stripped: string): { titles: string[]; unreadable: number } => {
  const calls = [
    ...stripped.matchAll(/\b(?:it|describe)(?:\.[A-Za-z]+(?:\([^)]*\))?)*\(\s*([^\s])/g),
  ];
  const titles = [
    ...stripped.matchAll(
      /\b(?:it|describe)(?:\.[A-Za-z]+(?:\([^)]*\))?)*\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g,
    ),
  ].map((m) => m[2]!);
  return { titles, unreadable: calls.length - titles.length };
};

describe("B0 refusal-only: the test labels", () => {
  it("B0 refusal-only: the title scanner reads plain and template titles, and the word scanner flags a forbidden word and nothing else", () => {
    const [IT, DESCRIBE] = [
      ["i", "t"],
      ["des", "cribe"],
    ].map((p) => p.join(""));
    const specimen = [
      `${DESCRIBE}("B0 refusal-only: a group", () => {`,
      `  ${IT}("B0 shape control (not admission): one", () => {});`,
      `  ${IT}.skipIf(x)(`,
      '    "B0 refusal-only: two",',
      "    () => {},",
      "  );",
      `  ${IT}(\`B0 refusal-only (legacy control): \${id} three\`, () => {});`,
      "  edit('not a test title');",
      "});",
    ].join("\n");
    const { titles, unreadable } = titlesOf(specimen);
    expect(titles).toEqual([
      "B0 refusal-only: a group",
      "B0 shape control (not admission): one",
      "B0 refusal-only: two",
      "B0 refusal-only (legacy control): ${id} three",
    ]);
    expect(unreadable).toBe(0);
    // a call whose first argument is not a string literal is counted, not skipped
    expect(titlesOf(`${IT}(name, () => {});`).unreadable).toBe(1);
    for (const w of WORDS) expect(TITLE_WORDS.test(`B0 refusal-only: the ${w} word`), w).toBe(true);
    expect(
      TITLE_WORDS.test("B0 refusal-only: passes, parses, admits and eligibility are other words"),
    ).toBe(false);
    expect(TITLE_WORDS.test("B0 refusal-only (legacy control): B0-26 and B0-60..64")).toBe(false);
  });

  it("B0 refusal-only: the B0 test files are exactly the expected ones, each title has its permitted label, and no title or code uses a forbidden word", () => {
    const found = ["unit", "contract", "conformance", "security", "integration"]
      .flatMap((d) =>
        readdirSync(`tests/${d}`)
          .filter((f) => f.startsWith("gm-wait-b0-") && f.endsWith(".test.ts"))
          .map((f) => `tests/${d}/${f}`),
      )
      .sort();
    expect(found).toEqual([...NEW_TEST_FILES, ...LEGACY_TEST_FILES].sort());
    for (const file of [...NEW_TEST_FILES, ...LEGACY_TEST_FILES]) {
      const legacy = (LEGACY_TEST_FILES as readonly string[]).includes(file);
      const stripped = code(file);
      const { titles, unreadable } = titlesOf(stripped);
      expect(titles.length, `${file} has titles`).toBeGreaterThan(0);
      expect(unreadable, `${file} has a test call whose title is not a string literal`).toBe(0);
      for (const title of titles) {
        const labelled = legacy
          ? title.startsWith(LEGACY_LABEL)
          : NEW_LABELS.some((l) => title.startsWith(l));
        expect(labelled, `${file}: ${title}`).toBe(true);
        expect(TITLE_WORDS.test(title), `${file}: ${title}`).toBe(false);
      }
    }
    // the new files, which this work wrote, also keep the words out of their code and strings
    for (const file of NEW_TEST_FILES) expect(CODE_WORDS.test(code(file)), file).toBe(false);
  });

  it("B0 refusal-only: each new test file carries the contract's header comment, and each legacy file states that it characterizes existing behaviour only", () => {
    for (const file of NEW_TEST_FILES) {
      const head = readFileSync(file, "utf8").split("\n").slice(0, 12).join("\n");
      expect(head, file).toContain(`// ${HEADER}`);
    }
    for (const file of LEGACY_TEST_FILES) {
      const head = readFileSync(file, "utf8").split("\n").slice(0, 12).join("\n");
      expect(head, file).toContain("CHARACTERIZES EXISTING BEHAVIOUR ONLY");
      expect(head, file).toContain("preparatory work under BLUE's 20 Nov 2026 gate interpretation");
      expect(head, file).toContain("It implements nothing");
      expect(head, file).toContain(LEGACY_NEGATION);
    }
  });
});
