// BLUE H-PROVENANCE-3: the exhaustive census of the historical identity claims older conformance suites make about the source paths and trees PR #94
// changed. MECHANISM ONLY; a clerical source-faithfulness check, not a behavioural one.
//
// What it proves, in order:
//   1. the inventory (tests/support/historical-pin-inventory.ts) is complete and consistent: every claim is about a changed path in an examined suite;
//   2. a programmatic CENSUS of every examined suite as it is now: a pin on a path or tree PR #94 changed holds only its recorded historical value
//      (never a present-day one); every pin on a path PR #94 did not change still equals the working tree (the "exempted unchanged paths");
//   3. where the Git history is available, every recorded historical value matches its own commit: the value main (8fda533) carried, and where the
//      suite names a base commit, the value at THAT commit. A shallow checkout skips these and says so; it never claims them;
//   4. present-day identities are stated only in tests/support/present-day-identities.ts, and the table matches the working tree;
//   5. a contemporary hash substituted into a historical assertion is caught, and the genuine historical values are not flagged.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { A05_BASE_COMMIT, A05_SOURCE_DELTAS } from "../support/a05-scoped-deltas.ts";
import {
  RP1_STAGE2_BASE,
  RP1_STAGE2_BASE_TREE,
  RP1_STAGE2_DELTAS,
} from "../support/rp1-stage2-deltas.ts";
import { RP2_BASE, RP2_BASE_TREE, RP2_SOURCE_DELTAS } from "../support/rp2-source-deltas.ts";
import { A0_BASE_COMMIT, A0_PACKAGE_PATHS } from "../support/a0-scoped-deltas.ts";
import { A1_1_PACKAGE_PATHS } from "../support/a1-1-scoped-deltas.ts";
import { B1_S2S3_PACKAGE_PATHS } from "../support/b1-s2s3-scoped-deltas.ts";
import { A24_ADAPTER_DELTA } from "../support/a24-scoped-delta.ts";
import {
  A26_ADMISSION_DELTAS,
  A26_BASE_COMMIT,
  A26_BASE_COMMIT_DIRECTORY_SHA256,
  A26_CHANGED_SOURCE_FILES,
  A26_DISPATCHER,
} from "../support/a26-scoped-deltas.ts";
import {
  EXAMINED_SUITES,
  HISTORICAL_PIN_CLAIMS,
  HISTORICAL_TREE_CLAIMS,
  PR94_BASE,
  PR94_CHANGED_SOURCE_PATHS,
} from "../support/historical-pin-inventory.ts";
import { PRESENT_DAY_CODE_IDENTITIES, identityOf } from "../support/present-day-identities.ts";

/** A path-to-hash pin, in either shape the older suites use: `"path": "hash"` or `"path": { base: "hash", head: "hash" }`. */
const PIN =
  /"(?<path>(?:packages|apps|tools|spec|\.github)\/[^"]+|package\.json|pnpm-lock\.yaml)"\s*:\s*(?:\{\s*base:\s*"(?<base>[0-9a-f]{64})",\s*head:\s*"(?<head>[0-9a-f]{64})"|"(?<value>[0-9a-f]{64})")/gs;
interface Pin {
  readonly path: string;
  readonly value: string;
}
const pinsIn = (text: string): Pin[] =>
  [...text.matchAll(PIN)].map((m) => ({
    path: m.groups!["path"]!,
    value: (m.groups!["head"] ?? m.groups!["value"])!,
  }));

const changed = new Set(PR94_CHANGED_SOURCE_PATHS);
const changedTrees = new Set(HISTORICAL_TREE_CLAIMS.map((c) => c.dir));
const isChanged = (path: string): boolean => changed.has(path) || changedTrees.has(path);
const sha256 = (v: string | Buffer): string => createHash("sha256").update(v).digest("hex");

/** Every present-day identity (file or tree) a historical assertion must never carry. */
const contemporary = (): string[] => Object.values(PRESENT_DAY_CODE_IDENTITIES);
const contemporizedIn = (text: string): string[] => contemporary().filter((h) => text.includes(h));

// -- Git-backed verification ----------------------------------------------------------------------------------------------------------------
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
const fileAt = (ref: string, path: string): string | null => {
  const b = git("show", `${ref}:${path}`);
  return b === null ? null : sha256(b);
};
const treeAt = (ref: string, dir: string): string | null => {
  const names = git("ls-tree", "-r", "--name-only", ref, "--", dir);
  if (names === null) return null;
  const h = createHash("sha256");
  for (const f of names.toString("utf8").split("\n").filter(Boolean).sort()) {
    const b = git("show", `${ref}:${f}`);
    if (b === null) return null;
    h.update(`${f}\0${sha256(b)}\n`);
  }
  return h.digest("hex");
};
const historyAvailable = reachable(PR94_BASE.sha);

describe("the inventory is the census: complete, consistent and about paths PR #94 really changed", () => {
  it("every examined suite exists, every claim is about an examined suite and a changed path, and no claim is listed twice", () => {
    expect(EXAMINED_SUITES).toHaveLength(28);
    expect(HISTORICAL_PIN_CLAIMS).toHaveLength(131);
    expect(HISTORICAL_TREE_CLAIMS).toHaveLength(4);
    for (const suite of EXAMINED_SUITES) expect(existsSync(suite), suite).toBe(true);
    const seen = new Set<string>();
    for (const c of HISTORICAL_PIN_CLAIMS) {
      expect(EXAMINED_SUITES, c.suite).toContain(c.suite);
      expect(changed.has(c.path), `${c.suite} ${c.path}`).toBe(true);
      expect(c.main_carried).toMatch(/^[0-9a-f]{64}$/);
      if (c.named_value !== null) expect(c.named_ref, `${c.suite} ${c.path}`).not.toBeNull();
      const key = `${c.suite}\0${c.path}\0${c.map}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
    for (const c of HISTORICAL_TREE_CLAIMS) {
      expect(existsSync(c.dir), c.dir).toBe(true);
      expect(c.main_carried).toMatch(/^[0-9a-f]{64}$/);
    }
    // 23 distinct changed paths carry claims: the two F-027 sources, the owner registry and the 21 files of the present-day table
    expect(new Set(HISTORICAL_PIN_CLAIMS.map((c) => c.path)).size).toBe(23);
    expect(
      Object.keys(PRESENT_DAY_CODE_IDENTITIES).filter((p) => !statSync(p).isDirectory()),
    ).toHaveLength(21);
  });

  it("no recorded historical value is a present-day identity: every claim, and every tree, differs from what the working tree holds now", () => {
    for (const c of HISTORICAL_PIN_CLAIMS) {
      expect(c.main_carried, `${c.suite} ${c.path}`).not.toBe(identityOf(c.path));
      if (c.named_value !== null)
        expect(c.named_value, `${c.suite} ${c.path}`).not.toBe(identityOf(c.path));
    }
    for (const c of HISTORICAL_TREE_CLAIMS)
      expect(c.main_carried, c.dir).not.toBe(identityOf(c.dir));
  });
});

describe("census of the examined suites as they stand: changed paths hold only history, unchanged paths still equal the working tree", () => {
  const rows = EXAMINED_SUITES.flatMap((suite) =>
    pinsIn(readFileSync(suite, "utf8")).map((pin) => ({ suite, ...pin })),
  );

  it("scans every pin of every examined suite: 510 pins, 40 on changed paths (history kept), 470 on unchanged paths (exempted, still true)", () => {
    const onChanged = rows.filter((r) => isChanged(r.path));
    const exempt = rows.filter((r) => !isChanged(r.path));
    // 578 = 581 less the three byte-identity pins of packages/operator/src/player-view.ts that the observe-request, advance-request and
    // source-observation suites carried: the play-context slice deliberately changed that file (see the comment in each suite's map)
    // F-2: the five removed guards are restored, including the duplicate H-07 R1 pin.
    // 526 = 578 less 52 pins of paths the ROADBED R3-T25 freight slice changed (coordinator/admission, logistics, persistence, economy and
    // production modules): each older suite replaced that pin with a comment, as the M-S slice did, and the paths are pinned instead as scoped
    // deltas in tests/support/freight-scoped-deltas.ts. All 52 were on unchanged-since-main paths, so the 40 history pins are untouched.
    // 518 = 526 less 8 pins of paths the ROADBED GM freight bridge slice changed (the two NULL-PC gateways, which additionally register the shipped
    // first-profile freight receipt provider, and the operator manifest, which gains two entry points): each older suite replaced that pin with a
    // comment and the paths are pinned instead as scoped deltas in tests/support/gm-freight-scoped-deltas.ts. All 8 were on unchanged-since-main paths.
    // 516 = 518 less A01's two unchanged-since-base assertions: initial-population's Population admission
    // and integrity pins. That suite preserves the original digests in comments, never new source identities.
    // 513 = 516 less A26's three former live pins: the commit directory and two source-drawdown admission pins.
    // The original digests are verified against the exact A26 base below.
    for (const [path, count] of [
      ["packages/engine/src/temporal", 0],
      ["packages/engine/src/commit", 0],
      ["packages/engine/src/world/actor-presence.ts", 2],
      ["packages/engine/src/world/actor-presence-integrity.ts", 1],
    ] as const)
      expect(
        rows.filter((r) => r.path === path),
        path,
      ).toHaveLength(count);
    // RP-1 Stage 2 retains the two former live Observe Exchange pins in the Stage 2 baseline.
    // RP-2 retains the former live Population derivation pin at the initial Population suite's base below.
    expect(rows).toHaveLength(510);
    expect(onChanged).toHaveLength(40);
    expect(exempt).toHaveLength(470);
    // the exempted unchanged paths are exactly that: not touched by PR #94, and the pin is still what the working tree holds
    for (const r of exempt) {
      expect(existsSync(r.path), `${r.suite} ${r.path}`).toBe(true);
      expect(r.value, `${r.suite} ${r.path}`).toBe(identityOf(r.path));
    }
  });

  it("every pin left on a changed path or tree is a recorded historical value of that suite, and none is a present-day identity", () => {
    const kept = HISTORICAL_PIN_CLAIMS.filter((c) => c.action === "kept-as-history");
    for (const r of rows.filter((x) => isChanged(x.path))) {
      const claim = kept.find(
        (c) => c.suite === r.suite && c.path === r.path && c.main_carried === r.value,
      );
      expect(
        claim,
        `${r.suite} ${r.path}: a pin on a changed path must be its recorded history`,
      ).toBeDefined();
      expect(r.value).not.toBe(identityOf(r.path));
    }
    // and every "removed" claim is really gone from its suite's pins (the path is no longer asserted there)
    for (const c of HISTORICAL_PIN_CLAIMS.filter((x) => x.action === "removed"))
      expect(
        rows.some((r) => r.suite === c.suite && r.path === c.path),
        `${c.suite} ${c.path} must not be pinned any more`,
      ).toBe(false);
  });

  it("no examined suite and no document anywhere states a present-day identity of a changed file or tree", () => {
    const allowed = new Set([
      "tests/support/present-day-identities.ts",
      "tests/conformance/historical-pin-provenance-conformance.test.ts",
    ]);
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, e.name);
        if (e.isDirectory()) walk(path);
        else if (/\.(ts|md)$/.test(e.name) && !allowed.has(path)) {
          const hits = contemporizedIn(readFileSync(path, "utf8"));
          if (hits.length > 0) found.push(`${path}: ${hits.join(", ")}`);
        }
      }
    };
    walk("tests");
    walk("docs");
    expect(found).toEqual([]);
  });
});

describe("A26-CB1 preserves the historical identities and pins the current admission delta", () => {
  it("pins each current file of the admission delta", () => {
    for (const [path, identity] of Object.entries(A26_ADMISSION_DELTAS))
      expect(identityOf(path), path).toBe(identity.head);
  });

  it.skipIf(!reachable(A26_BASE_COMMIT) || !reachable(A24_ADAPTER_DELTA.baseCommit))(
    "preserves the original pins and changes only the recorded package files",
    () => {
      expect(treeAt(A26_BASE_COMMIT, "packages/engine/src/commit")).toBe(
        A26_BASE_COMMIT_DIRECTORY_SHA256,
      );
      expect(fileAt(A26_BASE_COMMIT, A26_DISPATCHER.path)).toBe(A26_DISPATCHER.base);
      for (const [path, identity] of Object.entries(A26_ADMISSION_DELTAS))
        expect(fileAt(A26_BASE_COMMIT, path), path).toBe(identity.base);
      const changed = git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        A26_BASE_COMMIT,
        A24_ADAPTER_DELTA.baseCommit,
        "--",
        "packages",
      );
      expect(changed?.toString("utf8").trim().split("\n").sort()).toEqual(
        [...A26_CHANGED_SOURCE_FILES].sort(),
      );
    },
  );
});

describe("A24-CB1 pins the bounded Diplomacy adapter correction", () => {
  it("pins the exact current adapter bytes", () => {
    expect(identityOf(A24_ADAPTER_DELTA.path)).toBe(A24_ADAPTER_DELTA.headSha256);
  });

  it.skipIf(!reachable(A24_ADAPTER_DELTA.baseCommit) || !reachable(A05_BASE_COMMIT))(
    "preserves the original adapter pin and bounds the A24 package delta to that path",
    () => {
      const { baseCommit, path, baseSha256 } = A24_ADAPTER_DELTA;
      expect(fileAt(baseCommit, path)).toBe(baseSha256);
      const changed = git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        baseCommit,
        A05_BASE_COMMIT,
        "--",
        "packages",
      );
      expect(changed?.toString("utf8").trim()).toBe(path);
    },
  );
});

describe("RP-1 A05 pins the protected-store delta", () => {
  it("pins the exact current private-store source and filesystem seam", () => {
    for (const [path, d] of Object.entries(A05_SOURCE_DELTAS))
      expect(identityOf(path), path).toBe(d.head);
  });

  it.skipIf(!reachable(A05_BASE_COMMIT))(
    "preserves each base pin and bounds the Stage 1 package delta to the recorded paths",
    () => {
      for (const [path, d] of Object.entries(A05_SOURCE_DELTAS))
        expect(fileAt(A05_BASE_COMMIT, path), path).toBe(d.base);
      const changed = git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        A05_BASE_COMMIT,
        RP1_STAGE2_BASE_TREE,
        "--",
        "packages",
      );
      expect(changed?.toString("utf8").trim().split("\n").sort()).toEqual(
        Object.keys(A05_SOURCE_DELTAS).sort(),
      );
    },
  );
});

describe("RP-1 Stage 2 pins the request binding and retained-file delta", () => {
  it("keeps the exact baseline bytes and only the recorded production delta", () => {
    if (reachable(RP1_STAGE2_BASE))
      expect(git("rev-parse", `${RP1_STAGE2_BASE}^{tree}`)?.toString("utf8").trim()).toBe(
        RP1_STAGE2_BASE_TREE,
      );
    for (const [path, delta] of Object.entries(RP1_STAGE2_DELTAS)) {
      expect(fileAt(RP1_STAGE2_BASE_TREE, path), path).toBe(delta.base);
      expect(fileAt(RP2_BASE_TREE, path), path).toBe(delta.head);
      expect(identityOf(path), path).toBe(delta.head);
    }
    const output = git(
      "diff",
      "--name-only",
      RP1_STAGE2_BASE_TREE,
      RP2_BASE_TREE,
      "--",
      "apps",
      "packages",
    );
    expect(output?.toString("utf8").trim().split("\n").sort()).toEqual(
      Object.keys(RP1_STAGE2_DELTAS).sort(),
    );
  });
});

describe("RP-2 pins the four authorized production repairs", () => {
  it("verifies the baseline, current blobs and exact production scope", () => {
    expect(git("rev-parse", `${RP2_BASE}^{tree}`)?.toString("utf8").trim()).toBe(RP2_BASE_TREE);
    for (const [path, delta] of Object.entries(RP2_SOURCE_DELTAS)) {
      expect(git("rev-parse", `${RP2_BASE_TREE}:${path}`)?.toString("utf8").trim(), path).toBe(
        delta.base,
      );
      expect(git("hash-object", path)?.toString("utf8").trim(), path).toBe(delta.head);
    }
    const changed: string[] = [];
    for (const [command, args] of [
      ["diff", ["--name-only", RP2_BASE_TREE]],
      ["ls-files", ["--others", "--exclude-standard"]],
    ] as const) {
      const output = git("-c", "core.fileMode=false", command, ...args, "--", "apps", "packages");
      expect(output).not.toBeNull();
      changed.push(...output!.toString("utf8").trim().split("\n").filter(Boolean));
    }
    // F-014B A0 (a later slice, based on the tree after RP-2) added its own recorded paths under packages/: its table and
    // tests/conformance/a0-scope-conformance.test.ts police them; the four RP-2 repairs above are checked exactly as before
    // Declared inclusion (F-014B B0, PR #117): the one new pure GM waiting request module. It is not exported from the package index and changes no existing file.
    // Declared inclusion (F-014B A1-1): the two existing operator files in tests/support/a1-1-scoped-deltas.ts (the strict version 2 capture and the
    // widened intake type); no new file. That slice's own table and tests/conformance/a1-1-scope-conformance.test.ts police them.
    expect(changed.sort()).toEqual(
      [
        ...Object.keys(RP2_SOURCE_DELTAS),
        ...A0_PACKAGE_PATHS,
        "packages/contracts/src/temporal-gm-wait.ts",
        ...A1_1_PACKAGE_PATHS,
        ...B1_S2S3_PACKAGE_PATHS,
      ].sort(),
    );
    const lockPath = "spec/f027/spec-lock.json";
    const baselineLock = git("rev-parse", `${RP2_BASE_TREE}:${lockPath}`)?.toString("utf8").trim();
    expect(baselineLock).toMatch(/^[0-9a-f]{40}$/);
    // RP-2 left the lock exactly as its base tree had it: main after RP-2 (and PR #115), the A0 base, carries the very same blob. F-014B A0
    // then extended the lock ADDITIVELY (one lineage row and one lowering row, appended last); that change is policed by tools/check-spec.ts,
    // tests/conformance/clock-origin-custody-conformance.test.ts and tests/conformance/a0-scope-conformance.test.ts, not by this RP-2 claim.
    expect(git("rev-parse", `${A0_BASE_COMMIT}:${lockPath}`)?.toString("utf8").trim()).toBe(
      baselineLock,
    );
    expect(git("hash-object", lockPath)?.toString("utf8").trim()).not.toBe(baselineLock);
  });

  it("verifies the original initial Population and pre-RP-2 referee identities at their historical trees", () => {
    expect(
      fileAt(
        "40527749b68781f008c6b59e97f5cf90db24618b",
        "packages/engine/src/population/derive.ts",
      ),
    ).toBe("8a632d495e294e8e3d421190945755fee80d82f58fb673b5b02bacdc38158e0f");
    expect(fileAt(RP2_BASE_TREE, "packages/operator/src/referee-exchange.ts")).toBe(
      "4a90c9c2fbd76ca69611652d4af86d172d4e3155b245eea835e8b411b1d5a4ed",
    );
    expect(treeAt(RP2_BASE_TREE, "packages/operator/src")).toBe(
      "7f0ba91b496d58ccb382fee13fe3833e93c562b735c63affc30608734cbe4752",
    );
  });
});

describe("the recorded history is true: each value matches its own Git commit (verified where the history is present)", () => {
  // CI's shallow checkout has no history: these are SKIPPED there and reported as skipped, never as passed.
  const only = it.skipIf(!historyAvailable);

  only(
    "the value each suite carried at main is the SHA-256 of the path at main, and the main text of the suite contains it",
    () => {
      for (const c of HISTORICAL_PIN_CLAIMS) {
        expect(fileAt(PR94_BASE.sha, c.path), `${c.path} at ${PR94_BASE.ref}`).toBe(c.main_carried);
        const suiteAtMain = git("show", `${PR94_BASE.sha}:${c.suite}`);
        expect(suiteAtMain, `${c.suite} at ${PR94_BASE.ref}`).not.toBeNull();
        expect(suiteAtMain!.toString("utf8"), `${c.suite} carried ${c.path}`).toContain(
          c.main_carried,
        );
      }
    },
  );

  only(
    "where a suite names a base commit that is reachable, the recorded value is the SHA-256 of the path AT THAT commit",
    () => {
      let checked = 0;
      for (const c of HISTORICAL_PIN_CLAIMS.filter((x) => x.named_ref !== null)) {
        if (!reachable(c.named_ref!)) continue;
        expect(fileAt(c.named_ref!, c.path), `${c.path} at ${c.named_ref}`).toBe(c.named_value);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(0);
    },
  );

  only(
    "the tree values are the trees main carried (same algorithm as auditory-premises-conformance)",
    () => {
      for (const c of HISTORICAL_TREE_CLAIMS)
        expect(treeAt(PR94_BASE.sha, c.dir), `${c.dir} at ${PR94_BASE.ref}`).toBe(c.main_carried);
    },
  );

  it("the suites that name a base commit are exactly those the inventory records it for (shape check; the Git proof is above)", () => {
    const named = HISTORICAL_PIN_CLAIMS.filter((c) => c.named_ref !== null);
    expect(named.length).toBeGreaterThan(0);
    for (const c of named) expect(c.named_ref).toMatch(/^[0-9a-f]{7,40}$/);
  });
});

describe("present-day identities live in ONE table, which matches the working tree, and a contemporary hash in a historical assertion is caught", () => {
  it("the present-day table (21 files and 4 trees) equals the working tree; it is the only place that states them", () => {
    for (const [path, expected] of Object.entries(PRESENT_DAY_CODE_IDENTITIES))
      expect(identityOf(path), path).toBe(expected);
    expect(Object.keys(PRESENT_DAY_CODE_IDENTITIES)).toHaveLength(25);
  });

  it("a present-day hash substituted into a base, slice-head or scoped-delta assertion is caught for EVERY changed file and tree", () => {
    for (const [path, today] of Object.entries(PRESENT_DAY_CODE_IDENTITIES)) {
      const asBase = `/** Byte-identical to the base e799fb8 */\nconst UNCHANGED = {\n  "${path}":\n    "${today}",\n};`;
      const asHead = `// pinned at the slice head\nconst MODIFIED = { "${path}": "${today}" };`;
      const asDelta = `const SCOPED_DELTAS = { "${path}": { base: "${"0".repeat(64)}", head: "${today}" } };`;
      for (const text of [asBase, asHead, asDelta])
        expect(contemporizedIn(text), `${path} in ${text.slice(0, 40)}`).toEqual([today]);
    }
  });

  it("the genuine historical values (main-carried and at the named commits) are never flagged", () => {
    for (const c of HISTORICAL_PIN_CLAIMS) {
      const values = [c.main_carried, ...(c.named_value ? [c.named_value] : [])];
      for (const v of values)
        expect(
          contemporizedIn(`// pinned at the slice head\n"${c.path}": "${v}",`),
          `${c.suite} ${c.path}`,
        ).toEqual([]);
    }
    for (const c of HISTORICAL_TREE_CLAIMS)
      expect(contemporizedIn(`"${c.dir}": "${c.main_carried}",`), c.dir).toEqual([]);
  });

  it("the census parser sees what the guard guards: a synthetic suite re-pinned to today is reported by BOTH checks", () => {
    const path = "packages/operator/src/cli.ts";
    const text = `const UNCHANGED = { "${path}": "${PRESENT_DAY_CODE_IDENTITIES[path]}" };`;
    expect(pinsIn(text)).toEqual([{ path, value: PRESENT_DAY_CODE_IDENTITIES[path] }]);
    expect(isChanged(path)).toBe(true);
    expect(pinsIn(text)[0]!.value).toBe(identityOf(path)); // a changed path pinned at today's value: exactly what the census forbids
    expect(contemporizedIn(text)).toEqual([PRESENT_DAY_CODE_IDENTITIES[path]]);
  });
});
