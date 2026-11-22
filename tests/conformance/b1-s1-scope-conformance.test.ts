// F-014B B1 S1 (the canonical live-versus-historical origin safety guard) — CUSTODY, SCOPE and LABELLING. This file judges no behaviour; the
// integration tests of S1 do. It checks clerical facts only:
//
//   B1S1-C1  the frozen pre-S1 campaign packages are exactly the bytes recorded in tests/support/b1-s1-frozen-fixtures.ts
//   B1S1-C2  scope: the slice changed exactly the one declared production file (length and diff scope), nothing it is forbidden to touch moved,
//            and nothing outside tests/ changed beyond the declared tooling file
//   B1S1-C3  the engine's local copy of the reserved trigger literal equals the B0 constant (a bounded source-value pin); the live guard is
//            module-private (no new public engine name); the equality law is written once; the guard is named in no historical path; the B0
//            module is imported by no production file. The guard's BEHAVIOUR against the B0 pairing rows is judged by the integration tests.
//   B1S1-C4  the inert E1 baseline corpus is the exact recorded bytes and is run by nothing
//   B1S1-C5  labels: every S1 test title says what it is and claims nothing more; no test asserts commit ancestry
//
// Custody is bytes, never ancestry: a squash merge keeps a base commit retrievable but does not keep it in the merged history, so no test
// here asserts that any commit is an ancestor of HEAD. Where a base commit is needed for a diff and is not retrievable (a shallow checkout)
// the comparison is SKIPPED and reported as skipped, never claimed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as engine from "@immortalis/engine";
import { GM_INTERPRETED_PC_WAIT } from "../../packages/contracts/src/temporal-gm-wait.ts"; // the merged B0 module; unexported from the contracts index
import { B1_S1_E1_ARTIFACT } from "../support/b1-s1-evidence-custody.ts";
import { code } from "../support/f027.ts";
import {
  B1_S1_FROZEN_FILES,
  B1_S1_FROZEN_PACKAGES,
  B1_S1_FROZEN_ROOT,
} from "../support/b1-s1-frozen-fixtures.ts";
import {
  B1_S1_BASE_COMMIT,
  B1_S1_LITERAL_FILES,
  B1_S1_NON_PACKAGE_PATHS,
  B1_S1_PACKAGE_PATHS,
  B1_S1_TRANSITION,
  B1_S1_UNTOUCHED,
} from "../support/b1-s1-scoped-deltas.ts";
import {
  B1_S2S3_EVIDENCE_PREFIX,
  B1_S2S3_OUTSIDE_PACKAGE_PATHS,
  B1_S2S3_PACKAGE_PATHS,
  B1_S2S3_TOOLS_PATHS,
  B1_V2_WORKFLOW_PATH,
} from "../support/b1-s2s3-scoped-deltas.ts";
import {
  A1_2A_B0_PRODUCTION_USERS,
  A1_2A_EVIDENCE_PREFIX,
  A1_2A_LITERAL_FILES,
  A1_2A_PACKAGE_PATHS,
} from "../support/a1-2a-scoped-deltas.ts";

/** The lines the base commit carried inline in the stage-bearing arm and the production file no longer does: the moved comparison (see B1S1-C2). */
const MOVED_BLOCK_DELETIONS = 13;
const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");
const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );

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
const baseReachable = git("cat-file", "-e", `${B1_S1_BASE_COMMIT}^{commit}`) !== null;
const atBase = (path: string): Buffer | null => git("show", `${B1_S1_BASE_COMMIT}:${path}`);
/** Content only: a package manager may mark bin scripts executable in a working tree, which is a mode change, not a change of this slice. */
const changedSince = (...paths: string[]): string[] =>
  lines(git("-c", "core.fileMode=false", "diff", "--name-only", B1_S1_BASE_COMMIT, "--", ...paths));
const untrackedIn = (...paths: string[]): string[] =>
  lines(git("ls-files", "--others", "--exclude-standard", "--", ...paths));
// Every .ts file under the src directory of each package and each app, as the other conformance suites read the production roots.
const productionFiles = (): string[] =>
  ["packages", "apps"].flatMap((root) =>
    readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) =>
        existsSync(join(root, e.name, "src")) ? walk(join(root, e.name, "src")) : [],
      )
      .filter((f) => f.endsWith(".ts")),
  );

describe("B1-S1 custody: the frozen pre-S1 campaign packages", () => {
  it("B1S1-C1 the frozen tree holds exactly the recorded files, each with its recorded length and SHA-256", () => {
    const found = walk(B1_S1_FROZEN_ROOT)
      .map((f) => f.slice(B1_S1_FROZEN_ROOT.length + 1))
      .sort();
    expect(found).toEqual(Object.keys(B1_S1_FROZEN_FILES).sort());
    for (const [path, want] of Object.entries(B1_S1_FROZEN_FILES)) {
      const bytes = readFileSync(`${B1_S1_FROZEN_ROOT}/${path}`);
      expect(bytes.length, `${path} length`).toBe(want.bytes);
      expect(sha256(bytes), `${path} sha256`).toBe(want.sha256);
    }
    // the comparison is not vacuous: one flipped byte and one extra byte are each told apart
    const sample = readFileSync(`${B1_S1_FROZEN_ROOT}/zero/package/manifest.json`);
    const flipped = Buffer.from(sample);
    flipped[0] = (flipped[0]! + 1) % 256;
    expect(sha256(flipped)).not.toBe(sha256(sample));
    expect(sha256(Buffer.concat([sample, Buffer.from("x")]))).not.toBe(sha256(sample));
  });

  it("B1S1-C1 each package holds the transactions and revisions its table row names, and its custody file agrees with its journal", () => {
    for (const [name, row] of Object.entries(B1_S1_FROZEN_PACKAGES)) {
      const dir = `${B1_S1_FROZEN_ROOT}/${name}`;
      const expected = JSON.parse(readFileSync(`${dir}/expected.json`, "utf8"));
      const manifest = JSON.parse(readFileSync(`${dir}/package/manifest.json`, "utf8"));
      const journal = readFileSync(`${dir}/package/journal.jsonl`, "utf8").trim().split("\n");
      expect(expected.headRevision, `${name} head`).toBe(row.headRevision);
      expect(expected.summary.head.revision, `${name} summary head`).toBe(row.headRevision);
      expect(journal.length, `${name} journal entries`).toBe(row.headRevision);
      expect(manifest.head.checkpoint.revision, `${name} checkpoint`).toBe(row.checkpointRevision);
      // the history index of a real checkpoint exists exactly when the checkpoint is past the genesis
      const index = manifest.head.checkpoint.index;
      expect(index === null, `${name} index`).toBe(row.checkpointRevision === 0);
      if (index)
        expect(existsSync(`${dir}/package/${index.file}`), `${name} index file`).toBe(true);
      // the last journal line is the head revision, and the recorded head digest is the journal head
      const last = JSON.parse(journal[journal.length - 1]!);
      expect(last.receipt.revision, `${name} last receipt`).toBe(row.headRevision);
    }
    const zero = JSON.parse(readFileSync(`${B1_S1_FROZEN_ROOT}/zero/expected.json`, "utf8"));
    expect(zero.revisions["tx-old-ordinary"]).toBe(B1_S1_FROZEN_PACKAGES.zero.ordinaryRevision);
    expect(zero.revisions["tx-old-literal"]).toBe(B1_S1_FROZEN_PACKAGES.zero.literalRevision);
    const stage = JSON.parse(readFileSync(`${B1_S1_FROZEN_ROOT}/stage/expected.json`, "utf8"));
    const stageCapture = stage.captures["tx-pc-target-advance"];
    expect(stageCapture.authorityReceipt.revision).toBe(
      B1_S1_FROZEN_PACKAGES.stage.authorityRevision,
    );
    expect(stageCapture.sealReceipt.revision).toBe(B1_S1_FROZEN_PACKAGES.stage.sealRevision);
    const cut = JSON.parse(readFileSync(`${B1_S1_FROZEN_ROOT}/interrupted/expected.json`, "utf8"));
    const cutCapture = cut.captures["tx-pc-target-advance"];
    expect(cutCapture.authorityReceipt.revision).toBe(
      B1_S1_FROZEN_PACKAGES.interrupted.authorityRevision,
    );
    expect(cutCapture.seal).toBeNull();
    // repair round 1: the authority with NO credited stage and NO seal (the authority-open is the head), and the authority sealed stage-free
    const only = JSON.parse(
      readFileSync(`${B1_S1_FROZEN_ROOT}/authority-only/expected.json`, "utf8"),
    );
    const onlyCapture = only.captures["tx-pc-target-advance"];
    expect(onlyCapture.authorityReceipt.revision).toBe(
      B1_S1_FROZEN_PACKAGES["authority-only"].authorityRevision,
    );
    expect(onlyCapture.authorityReceipt.revision).toBe(
      B1_S1_FROZEN_PACKAGES["authority-only"].headRevision,
    );
    expect(onlyCapture.seal).toBeNull();
    const free = JSON.parse(
      readFileSync(`${B1_S1_FROZEN_ROOT}/authority-then-stage-free-seal/expected.json`, "utf8"),
    );
    const freeRow = B1_S1_FROZEN_PACKAGES["authority-then-stage-free-seal"];
    const freeCapture = free.captures["tx-pc-target-advance"];
    expect(freeCapture.authorityReceipt.revision).toBe(freeRow.authorityRevision);
    expect(freeCapture.sealReceipt.revision).toBe(freeRow.sealRevision);
    expect(freeCapture.seal.value.stages).toEqual([]);
    expect(free.revisions["tx-pc-target-resume-2"]).toBe(freeRow.continuationSealRevision);
    // the packages built through the shipped gateway were all last saved by the one build id the earlier gateway packages record
    for (const name of [
      "stage",
      "interrupted",
      "authority-only",
      "authority-then-stage-free-seal",
    ]) {
      const m = JSON.parse(
        readFileSync(`${B1_S1_FROZEN_ROOT}/${name}/package/manifest.json`, "utf8"),
      );
      expect(m.last_saved_with.build_id, name).toBe("b1s1-e2-reopen");
      expect(m.created_with.build_id, name).toBe("immortalis-operator");
    }
  });
});

describe("B1-S1 scope: one production file changed, by its declared amount, and nothing it is forbidden to touch", () => {
  it.skipIf(!baseReachable)(
    "B1S1-C2 the declared file has its declared original and S1 length and diff scope (additive, plus ONE pure move), and no other path under apps/ or packages/ is a source change (tracked or not)",
    () => {
      for (const [path, t] of Object.entries(B1_S1_TRANSITION)) {
        expect(atBase(path)!.length, `${path} original length`).toBe(t.baseBytes);
        expect(readFileSync(path).length, `${path} S1 length`).toBe(t.s1Bytes);
        const stat = lines(git("diff", "--numstat", B1_S1_BASE_COMMIT, "--", path)).map((l) =>
          l.split("\t"),
        );
        expect(stat, `${path} numstat`).toEqual([[String(t.added), String(t.deleted), path]]);
        // the only deletions are the stage-bearing arm's inline authority comparison, moved into one helper (see the next case)
        expect(t.deleted, `${path} deletions are the moved block`).toBe(MOVED_BLOCK_DELETIONS);
      }
      const changed = changedSince("apps", "packages");
      // Declared inclusion (F-014B B1 S2/S3, a later slice): its new package paths, policed by that slice's own table and suite.
      expect([...changed, ...untrackedIn("apps", "packages")].sort()).toEqual(
        [...B1_S1_PACKAGE_PATHS, ...B1_S2S3_PACKAGE_PATHS, ...A1_2A_PACKAGE_PATHS].sort(),
      );
      // the declared allow-list is not a place to park files that did not change
      expect(B1_S1_PACKAGE_PATHS.every((p) => changed.includes(p))).toBe(true);
    },
  );

  it.skipIf(!baseReachable)(
    "B1S1-C2 outside tests/ the only other changed path is the declared formatter ignore list: no source, spec, tool, document, workflow or manifest file moves",
    () => {
      const outside = [...changedSince("."), ...untrackedIn(".")].filter(
        (p) => !p.startsWith("tests/"),
      );
      // Declared inclusion (F-014B B1 S2/S3): its new package paths, its tooling and its evidence directory (policed by that slice's own suite).
      const s2s3 = new Set([
        ...B1_S2S3_PACKAGE_PATHS,
        ...A1_2A_PACKAGE_PATHS,
        ...B1_S2S3_OUTSIDE_PACKAGE_PATHS,
      ]);
      const expected = new Set([...B1_S1_PACKAGE_PATHS, ...B1_S1_NON_PACKAGE_PATHS, ...s2s3]);
      expect(
        [
          ...new Set(
            outside.filter(
              (p) => !p.startsWith(B1_S2S3_EVIDENCE_PREFIX) && !p.startsWith(A1_2A_EVIDENCE_PREFIX),
            ),
          ),
        ].sort(),
      ).toEqual([...expected].sort());
    },
  );

  it.skipIf(!baseReachable)(
    "B1S1-C2 every path the slice is forbidden to touch (the historical verifier's file and identity, the D-3 integrity, coordinator, owner registry, the typed contract, the gateways, the B0 module and its tests, the A0 and A1-1 modules, the spec lock) is byte-identical to the base commit, tracked or not",
    () => {
      const successorPaths = new Set([
        ...B1_S2S3_TOOLS_PATHS,
        ...A1_2A_PACKAGE_PATHS,
        B1_V2_WORKFLOW_PATH,
      ]);
      for (const p of B1_S1_UNTOUCHED) {
        expect(
          changedSince(p).filter((x) => !successorPaths.has(x)),
          p,
        ).toEqual([]);
        expect(
          untrackedIn(p).filter((x) => !successorPaths.has(x)),
          p,
        ).toEqual([]);
      }
      // the guard is not vacuous: it finds the one file this slice DID change
      for (const p of B1_S1_PACKAGE_PATHS) expect(changedSince(p)).toEqual([p]);
    },
  );

  it.skipIf(!baseReachable)(
    "B1S1-C2 the diff of the changed file names no historical verifier and no verifier identity: it adds the live guard and nothing that replay can reach",
    () => {
      for (const p of B1_S1_PACKAGE_PATHS) {
        const diff = git("diff", "-U0", B1_S1_BASE_COMMIT, "--", p)!.toString("utf8");
        // code lines only: the guard's comments say that replay runs the historical verifier, which is the point
        const touched = diff
          .split("\n")
          .filter((l) => /^[+-][^+-]/.test(l) && !/^[+-]\s*(\/\/|\/?\*)/.test(l));
        expect(touched.length, p).toBeGreaterThan(0);
        for (const l of touched) {
          expect(l, p).not.toMatch(/verifyHistorical|historyVerificationId|temporalOriginPairing/);
        }
      }
    },
  );

  it.skipIf(!baseReachable)(
    "B1S1-C2 the deletions are a PURE MOVE: every compared field line the base carried inline in the stage-bearing arm now stands, verbatim and in order, in the one helper, and the law is written exactly once",
    () => {
      const ADMISSION = "packages/engine/src/temporal/admission.ts";
      const removed = git("diff", "-U0", B1_S1_BASE_COMMIT, "--", ADMISSION)!
        .toString("utf8")
        .split("\n")
        .filter((l) => /^-[^-]/.test(l))
        .map((l) => l.slice(1).trim());
      expect(removed).toHaveLength(MOVED_BLOCK_DELETIONS);
      // the wrappers of the old inline condition; everything else removed is a compared-field line
      const wrappers = [
        "const a = TransactionAuthoritySchema.safeParse(auth.fact.value);",
        "if (",
        ") {",
      ];
      for (const w of wrappers) expect(removed).toContain(w);
      const moved = removed.filter((l) => !wrappers.includes(l));
      expect(moved).toHaveLength(MOVED_BLOCK_DELETIONS - wrappers.length);
      const now = readFileSync(ADMISSION, "utf8")
        .split("\n")
        .map((l) => l.trim());
      const at = now.findIndex((_, i) => moved.every((m, k) => now[i + k] === m));
      expect(at, "the moved comparison stands contiguous and verbatim").toBeGreaterThan(-1);
      expect(now[at - 1]).toBe("return (");
      expect(now[at - 2]).toBe("const a = TransactionAuthoritySchema.safeParse(authority);");
      // ONE law: each compared field is spelled once in code, in the helper, and both arms call that helper
      const source = code(ADMISSION);
      for (const field of moved.filter((m) => m.startsWith("!canonicalEqual")))
        expect(source.split(field).length - 1, field).toBe(1);
      expect(source.split("a.data.cause !== tx.cause").length - 1).toBe(1);
      expect(source.split("departsFromItsAuthority(").length - 1).toBe(3); // the definition and the two arms
      // the non-vacuity of the scanner: the base spelled the same law once, inline
      const base = atBase(ADMISSION)!.toString("utf8");
      expect(base.split("a.data.cause !== tx.cause").length - 1).toBe(1);
      expect(base).not.toContain("departsFromItsAuthority");
    },
  );
});

describe("B1-S1 pairing: the engine's local literal against the B0 constant, and the guard's visibility", () => {
  const ADMISSION = "packages/engine/src/temporal/admission.ts";
  /** The exports the module carried at the base commit, and still carries: S1 adds no public name to the engine. */
  const BASE_EXPORTS = [
    "continuationRequestViolation",
    "populationReadViolation",
    "temporalGroupCheck",
  ] as const;
  const PRIVATE = [
    "livePlayerPairTriggerViolation",
    "departsFromItsAuthority",
    "completesItsOwnOpenedAuthority",
    "GM_WAIT_TRIGGER_KIND",
  ] as const;
  /** every declaration form that would make `name` an export of a module (the scanner is pinned on a specimen below) */
  const exportsName = (text: string, name: string): boolean =>
    new RegExp(
      [
        `export\\s+(?:async\\s+)?(?:function\\*?|const|let|var|class|type|interface|enum)\\s+${name}\\b`,
        `export\\s*(?:type\\s*)?\\{[^}]*\\b${name}\\b[^}]*\\}`,
        `export\\s+default\\s+${name}\\b`,
      ].join("|"),
    ).test(text);

  it("B1S1-C3 the engine's local constant is spelled once and equals the B0 constant (a bounded source-value pin: the literal is read from the source text and compared with the B0 module imported by relative path)", () => {
    const source = readFileSync(ADMISSION, "utf8");
    const m = [...source.matchAll(/^const GM_WAIT_TRIGGER_KIND = "([^"]*)";$/gm)];
    expect(m.length).toBe(1);
    expect(m[0]![1]).toBe(GM_INTERPRETED_PC_WAIT);
    // the constant is used by the guard and by nothing else in the file
    expect(code(ADMISSION).split("GM_WAIT_TRIGGER_KIND").length - 1).toBe(2);
    // the pin is not vacuous: a one-character difference is told apart
    expect(`${GM_INTERPRETED_PC_WAIT}x`).not.toBe(m[0]![1]);
    expect(GM_INTERPRETED_PC_WAIT.toLowerCase()).not.toBe(m[0]![1]);
  });

  it("B1S1-C3 the production files that spell the literal are exactly the B0 module and the engine's local copy, each with its recorded reason", () => {
    const spelling = productionFiles()
      .filter((f) => readFileSync(f, "utf8").includes(GM_INTERPRETED_PC_WAIT))
      .sort();
    // (F-014B A1-2a adds one declared local copy in the operator package, pinned equal to the B0 constant by its own suite)
    expect(spelling).toEqual(
      [...Object.keys(B1_S1_LITERAL_FILES), ...Object.keys(A1_2A_LITERAL_FILES)].sort(),
    );
    for (const reason of Object.values(B1_S1_LITERAL_FILES))
      expect(reason.length).toBeGreaterThan(20);
  });

  it("B1S1-C3 the live guard is NOT a public name: neither admission.ts nor the engine index exports it or any helper of this slice, and the module exports exactly what it did at the base commit", async () => {
    const source = readFileSync(ADMISSION, "utf8");
    for (const name of PRIVATE)
      expect(exportsName(source, name), `source exports ${name}`).toBe(false);
    // the runtime namespaces say the same as the text
    const module = await import("../../packages/engine/src/temporal/admission.ts");
    expect(Object.keys(module).sort()).toEqual([...BASE_EXPORTS]);
    for (const name of PRIVATE) {
      expect(name in module, `module has ${name}`).toBe(false);
      expect(name in engine, `engine index has ${name}`).toBe(false);
    }
    // and at the base commit the module's declared exports were the same three
    const baseSource = atBase(ADMISSION)?.toString("utf8");
    if (baseSource) {
      const declared = [
        ...baseSource.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)/gm),
      ].map((m) => m[1]!);
      expect(declared.sort()).toEqual([...BASE_EXPORTS]);
    }
    // the scanner is not vacuous: it finds each way of exporting a name, and passes a private function
    for (const specimen of [
      "export function livePlayerPairTriggerViolation(a) {}",
      "export const livePlayerPairTriggerViolation = () => null;",
      "export async function livePlayerPairTriggerViolation() {}",
      "export { x, livePlayerPairTriggerViolation };",
      "export { livePlayerPairTriggerViolation as other };",
      "export default livePlayerPairTriggerViolation;",
    ])
      expect(exportsName(specimen, "livePlayerPairTriggerViolation"), specimen).toBe(true);
    expect(
      exportsName("function livePlayerPairTriggerViolation() {}", "livePlayerPairTriggerViolation"),
    ).toBe(false);
    expect(
      exportsName(
        "export function livePlayerPairTriggerViolation2() {}",
        "livePlayerPairTriggerViolation",
      ),
    ).toBe(false);
  });

  it("B1S1-C3 the guard is named in the changed file only (its definition and its two placements), the completion exception is named once beside its call, and the B0 module and its unphased classifier are used by no production file", () => {
    const files = productionFiles();
    const count = (name: string) =>
      files.map((f) => [f, code(f).split(name).length - 1] as const).filter(([, n]) => n > 0);
    expect(count("livePlayerPairTriggerViolation")).toEqual([[ADMISSION, 3]]);
    expect(count("completesItsOwnOpenedAuthority")).toEqual([[ADMISSION, 2]]); // the definition and its one call
    expect(count("departsFromItsAuthority")).toEqual([[ADMISSION, 3]]); // the definition and the two arms
    const b0 = "packages/contracts/src/temporal-gm-wait.ts";
    // code only: the guard's comment names the B0 module as the reason the engine cannot import it
    // (F-014B A1-2a: the phone service hands the unchanged B0 parser to the operator ingress; its one declared user is exempt)
    for (const f of files.filter((x) => x !== b0 && !(x in A1_2A_B0_PRODUCTION_USERS)))
      expect(code(f), f).not.toMatch(/temporal-gm-wait|temporalOriginPairing|parseGmWaitRequest/);
    // the unphased DENY is used in no historical path: the historical verifier's file does not mention the guard or the literal
    expect(readFileSync("packages/engine/src/owners/admission.ts", "utf8")).not.toMatch(
      /livePlayerPairTriggerViolation|completesItsOwnOpenedAuthority|GM_WAIT_TRIGGER_KIND|GM_INTERPRETED_PC_WAIT/,
    );
    // and the contracts index still does not export the B0 module
    expect(readFileSync("packages/contracts/src/index.ts", "utf8")).not.toMatch(/temporal-gm-wait/);
  });
});

describe("B1-S1 custody: the inert E1 baseline corpus", () => {
  const A = B1_S1_E1_ARTIFACT;

  it("B1S1-C4 the inert copy is the exact recorded bytes (length, SHA-256 and git blob id), carried under a suffix no runner, formatter or linter reads", () => {
    const bytes = readFileSync(A.path);
    expect(bytes.length).toBe(A.bytes);
    expect(sha256(bytes)).toBe(A.sha256);
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    expect(blob).toBe(A.blobId);
    expect(A.path.endsWith(".test.ts")).toBe(false);
    expect(A.path.endsWith(".txt")).toBe(true);
    expect(readdirSync("tests/fixtures/b1-s1-evidence")).toEqual([A.path.split("/").pop()]);
    // nothing the test projects would run lives under the fixtures tree
    expect(walk("tests/fixtures").filter((f) => f.endsWith(".test.ts"))).toEqual([]);
    // where the original commit is retrievable it is the same bytes (retrievable is not required: custody is the recorded digest)
    const original = git("show", `${A.commit}:${A.originalPath}`);
    if (original) expect(original.equals(bytes)).toBe(true);
  });

  it("B1S1-C4 the corpus holds its 13 recorded cases, and the table says what S1 does to each of them", () => {
    const text = readFileSync(A.path, "utf8");
    const ids = [...text.matchAll(/\bit\(\s*"(H1-[A-Z]\d)\b/g)].map((m) => m[1]!);
    expect(ids).toEqual([...A.cases]);
    expect(Object.keys(A.atS1)).toEqual([...A.cases]);
    const flips = Object.entries(A.atS1)
      .filter(([, v]) => v.startsWith("flips"))
      .map(([k]) => k);
    expect(flips).toEqual([...A.flips]);
  });
});

describe("B1-S1 labels: every S1 test says what it is and claims nothing more", () => {
  const INTEGRATION = [
    "tests/integration/b1-s1-live-origin-guard.test.ts",
    "tests/integration/b1-s1-live-origin-acceptance.test.ts",
    "tests/integration/b1-s1-old-authority-completion.test.ts",
  ] as const;
  const SELF = "tests/conformance/b1-s1-scope-conformance.test.ts";
  const TITLE = /\bit(?:\.skipIf\([^)]*\))?\(\s*([`"])((?:(?!\1)[^\\\n])+)\1/g;
  const titles = (text: string): string[] => [...text.matchAll(TITLE)].map((m) => m[2]!);
  const LABELS = ["[existing law]", "[s1 guard]", "[pure]"] as const;
  const FORBIDDEN = /\bPASS\b|\bELIGIBLE\b|admitted by production|production[- ]admitted/;

  it("B1S1-C5 the scanner reads plain and template titles, flags an unlabelled title and a title that claims a pass, and passes a labelled one", () => {
    const specimen = [
      "it",
      '("A [s1 guard] one", () => 1);\n',
      "it.skipIf(x)",
      '("B [existing law] two", () => 2);\n',
      "it",
      "(`C [pure] ${x} three`, () => 3);",
    ].join("");
    expect(titles(specimen)).toEqual([
      "A [s1 guard] one",
      "B [existing law] two",
      "C [pure] ${x} three",
    ]);
    const labelled = (t: string) => LABELS.some((l) => t.includes(l));
    expect(labelled("A [s1 guard] one")).toBe(true);
    expect(labelled("A one")).toBe(false);
    expect(FORBIDDEN.test("A [s1 guard] the guard PASS")).toBe(true);
    expect(FORBIDDEN.test("A [s1 guard] passes and eligibility are other words")).toBe(false);
  });

  it("B1S1-C5 every test title of the S1 integration files carries a label, every title of every S1 file is free of claims of a pass or eligibility, and the conformance titles carry their id", () => {
    for (const file of INTEGRATION) {
      const text = readFileSync(file, "utf8");
      const all = titles(text);
      expect(all.length, file).toBeGreaterThan(10);
      for (const t of all) expect(FORBIDDEN.test(t), `${file}: ${t}`).toBe(false);
      // a test title follows an indented `it(`; describe titles only group
      const tests = [
        ...text.matchAll(/^\s+it(?:\.skipIf\([^)]*\))?\(\s*([`"])((?:(?!\1)[^\\\n])+)\1/gm),
      ].map((m) => m[2]!);
      expect(tests.length, file).toBeGreaterThan(10);
      for (const t of tests)
        expect(
          LABELS.some((l) => t.includes(l)),
          `${file}: ${t}`,
        ).toBe(true);
    }
    const own = titles(readFileSync(SELF, "utf8"));
    for (const t of own) expect(FORBIDDEN.test(t), t).toBe(false);
    for (const t of own.filter((x) => x.startsWith("B1S1-C")))
      expect(/^B1S1-C[1-5]\b/.test(t), t).toBe(true);
  });

  it("B1S1-C5 no S1 test asserts commit ancestry: a squash merge keeps a commit retrievable but not in the merged history", () => {
    // the patterns are assembled so that this file does not carry them itself
    const ancestry = new RegExp(
      [["merge", "base"].join("-"), ["is", "ancestor"].join("-")].join("|"),
    );
    const files = [
      ...INTEGRATION,
      SELF,
      "tests/support/b1-s1-rigs.ts",
      "tests/support/b1-s1-frozen-fixtures.ts",
      "tests/support/b1-s1-scoped-deltas.ts",
      "tests/support/b1-s1-evidence-custody.ts",
    ];
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(ancestry);
    expect(ancestry.test(`${["merge", "base"].join("-")} --x`)).toBe(true);
  });
});
