// F-014B B2 (GM-wait Temporal custody; MECHANISM ONLY) — SCOPE. This slice changed exactly the files its table records, nothing it is forbidden to
// touch moved, every pin edit in an older suite corresponds to a real byte change recorded here, and the registry, the rules and the sunset rows
// are exactly what the construction brief declares. No behaviour is judged here (the B2-T01..T12 tests do).
//
// History checks use the Git objects named in tests/support/b2-scoped-deltas.ts; a shallow checkout (no history) skips them and says so, it never
// claims them.
import { IF6B_BASE_COMMIT, IF6B_PACKAGE_PATHS } from "../support/if6b-scoped-delta.ts";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  BOOTSTRAP_SUNSET_POLICY_CLOCK_ORIGIN_V1,
  BOOTSTRAP_SUNSET_POLICY_GM_WAIT_V1,
  GM_WAIT_CUSTODY_SUNSET_POLICY_DELTA,
  GM_WAIT_W2_HISTORY_POLICY_SEGMENT,
  TEMPORAL_FACT_KINDS,
  canonicalAdmission,
  factKind,
  fixtureCanonicalAdmission,
  policyCoverageViolations,
  sunsetPolicyOf,
} from "@immortalis/engine";
import { A0_SCOPED_DELTAS } from "../support/a0-scoped-deltas.ts";
import {
  B2_BASE_COMMIT,
  B2_EVIDENCE_PREFIX,
  B2_NEW_MODULES,
  B2_PACKAGE_PATHS,
  B2_PRESENT_DAY_FILES,
  B2_SCOPED_DELTAS,
  bytesNowGiven,
  unionPaths,
} from "../support/b2-scoped-deltas.ts";

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
const sha = (v: Buffer | string): string => createHash("sha256").update(v).digest("hex");
const reachable = (ref: string): boolean => git("cat-file", "-e", `${ref}^{commit}`) !== null;
const historyAvailable = reachable(B2_BASE_COMMIT);
const lines = (b: Buffer | null): string[] =>
  (b?.toString("utf8") ?? "").split("\n").filter(Boolean);
// content only: a package manager may mark bin scripts executable in a working tree, which is a mode change, not a change of this slice
const diffNames = (...paths: string[]): string[] =>
  lines(git("-c", "core.fileMode=false", "diff", "--name-only", B2_BASE_COMMIT, "--", ...paths));
const untracked = (...paths: string[]): string[] =>
  lines(git("ls-files", "--others", "--exclude-standard", "--", ...paths));

describe("the B2 scoped-delta table: every pin is a real byte change, recorded once, chained to the earlier slices", () => {
  it("each recorded head is the file's bytes now, and differs from its base", () => {
    for (const [path, d] of Object.entries(B2_SCOPED_DELTAS)) {
      const original = git("show", `${IF6B_BASE_COMMIT}:${path}`);
      expect(original === null ? null : sha(original), path).toBe(d.head);
      if (path !== "packages/engine/src/gm-wait-catalogue-current.ts")
        expect(sha(readFileSync(path)), path).toBe(d.head);
      expect(d.base, path).not.toBe(d.head);
    }
    expect(Object.keys(B2_SCOPED_DELTAS)).toHaveLength(10);
  });

  it("each recorded base is what the B2 base commit's own bytes hash to (where Git history is available)", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    for (const [path, d] of Object.entries(B2_SCOPED_DELTAS)) {
      const atBase = git("show", `${B2_BASE_COMMIT}:${path}`);
      expect(atBase === null ? null : sha(atBase), path).toBe(d.base);
    }
  });

  it("where the A0 table also records a path, A0's head is exactly this base (the chain of custody), and a broken chain is refused", () => {
    const chained = Object.keys(B2_SCOPED_DELTAS).filter((p) => A0_SCOPED_DELTAS[p]);
    expect(chained.sort()).toEqual([
      "packages/engine/src/initial-setup/sunset-guard.ts",
      "packages/engine/src/initial-setup/sunset-policy.ts",
      "packages/engine/src/temporal/admission.ts",
      "packages/engine/src/temporal/coordinator.ts",
    ]);
    for (const p of chained) {
      expect(A0_SCOPED_DELTAS[p]!.head, p).toBe(B2_SCOPED_DELTAS[p]!.base);
      expect(bytesNowGiven(p, A0_SCOPED_DELTAS[p]!.head), p).toBe(B2_SCOPED_DELTAS[p]!.head);
    }
    // a path B2 did not change keeps the older head as its identity now
    expect(bytesNowGiven("packages/engine/src/not-a-b2-path.ts", "x")).toBe("x");
    // and an older head that is not B2's base is a broken chain
    expect(() =>
      bytesNowGiven("packages/engine/src/commit/campaign-core.ts", "0".repeat(64)),
    ).toThrow(/chain of custody is broken/);
  });

  it("the new modules and the present-day files are named once each, and the table's path lists are disjoint", () => {
    const all = B2_PACKAGE_PATHS;
    expect(new Set(all).size).toBe(all.length);
    expect(unionPaths(all, all)).toEqual([...all].sort());
    expect(B2_NEW_MODULES).toEqual(
      expect.arrayContaining([
        "packages/contracts/src/temporal-custody.ts",
        "packages/engine/src/gm-wait-custody.ts",
        "packages/engine/src/gm-wait-identity.ts",
      ]),
    );
    expect([...B2_PRESENT_DAY_FILES].sort()).toEqual([
      "packages/contracts/src/index.ts",
      "packages/engine/src/index.ts",
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/owners/registry.ts",
    ]);
  });
});

describe("this slice changed exactly the recorded paths, and nothing it is forbidden to touch moved", () => {
  it("under packages/ and apps/ the changed and added files are exactly the recorded ones (tracked or not)", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    const changed = diffNames("apps", "packages");
    const added = untracked("apps", "packages");
    // later slices (an A-/B-series package after this one) extend the allow-list through their own tables; at this head there is none
    expect([...changed, ...added].sort()).toEqual(unionPaths(B2_PACKAGE_PATHS, IF6B_PACKAGE_PATHS));
    const merged = lines(
      git("diff", "--name-only", B2_BASE_COMMIT, IF6B_BASE_COMMIT, "--", "apps", "packages"),
    );
    expect(merged.sort()).toEqual([...B2_PACKAGE_PATHS].sort());
    // every recorded present-day / delta file really changed; the allow-list is not a place to park files that did not
    for (const p of [...Object.keys(B2_SCOPED_DELTAS), ...B2_PRESENT_DAY_FILES])
      expect(changed.includes(p), p).toBe(true);
    for (const p of B2_NEW_MODULES) expect(added.includes(p) || changed.includes(p), p).toBe(true);
  });

  it("outside packages/ and apps/ the slice touched no spec, tool, workflow, manifest or lockfile; its evidence is the only addition under docs/", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    expect(diffNames("spec", "tools", ".github", "package.json", "pnpm-lock.yaml")).toEqual([]);
    // evidence is new files only, under the declared prefix (tracked once committed, untracked before)
    for (const p of [...diffNames("docs"), ...untracked("docs")])
      expect(p.startsWith(B2_EVIDENCE_PREFIX), p).toBe(true);
  });

  const FORBIDDEN = [
    // every held feature's home and every other builder's surface
    "apps",
    "packages/operator",
    "packages/protocol",
    "packages/testkit",
    // the legacy Temporal kernel contract and the modules the slice does not touch: the player-origin transaction schema stays byte-identical
    "packages/contracts/src/temporal.ts",
    "packages/contracts/src/temporal-gm-wait.ts",
    "packages/contracts/src/temporal-origin.ts",
    "packages/engine/src/temporal/identity.ts",
    "packages/engine/src/temporal/bootstrap.ts",
    "packages/engine/src/temporal/captured-chronology.ts",
    "packages/engine/src/temporal/graph.ts",
    "packages/engine/src/temporal/partition.ts",
    "packages/engine/src/temporal/providers.ts",
    // the owners, the World-State / Named-Actor / Health writers and the present-only reader and catalogue sources
    "packages/engine/src/world",
    "packages/engine/src/actor",
    "packages/engine/src/gm-wait-catalogue.ts",
    "packages/engine/src/gm-wait-present-reader.ts",
    "packages/engine/src/ms-setup",
    "packages/engine/src/economy",
    "packages/engine/src/population",
    "packages/engine/src/culture",
    "packages/engine/src/gip",
    "packages/engine/src/freight",
    "packages/engine/src/pc-movement",
    // the retained catalogue archives and the frozen specification
    "packages/engine/gm-wait-catalogue/manifests/e9049723f8b217d0557bcd4dcbfd126a58cb9777b82663e5c6f17a6842510500.json",
    "packages/engine/gm-wait-catalogue/manifests/f3393ad446efcd3915ecf081c5ce35fd041a5952a1a38848f9da1a8bf5c56062.json",
    "spec",
  ];
  it("no forbidden path moved since the base (tracked or not)", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    for (const p of FORBIDDEN) {
      expect(diffNames(p), p).toEqual([]);
      expect(untracked(p), p).toEqual([]);
    }
  });

  it("the production code of this slice names no held feature: no World-State notice, Named Actor duty, Health or positive S4 writer", () => {
    for (const f of [
      "packages/engine/src/gm-wait-custody.ts",
      "packages/engine/src/gm-wait-identity.ts",
      "packages/contracts/src/temporal-custody.ts",
    ]) {
      const text = readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(text, f).not.toMatch(
        /world[-_]state[-_]notice|named[-_]actor[-_]duty|health[-_]write|evaluateAllEnrolled|s4[-_]admission/i,
      );
    }
  });
});

describe("the registry, the rules and the sunset rows are exactly what the brief declares", () => {
  const NEW = ["temporal_gm_wait_marker", "temporal_gm_wait_pc_index"];

  it("the two kinds join the Temporal kinds after temporal_origin, under the same owner and facet; the base kinds carry no alternate", () => {
    const ids = TEMPORAL_FACT_KINDS.map((k) => k.id);
    expect(ids.slice(0, -2).at(-1)).toBe("temporal_origin");
    expect(ids.slice(-2)).toEqual(NEW);
    for (const k of TEMPORAL_FACT_KINDS) expect(k.alternateRules, k.id).toBeUndefined();
    const marker = factKind("temporal_gm_wait_marker");
    const index = factKind("temporal_gm_wait_pc_index");
    for (const k of [marker, index])
      expect([k.owner, k.facet, k.im]).toEqual([
        "temporal_kernel",
        "temporal_coordination",
        "IM-02",
      ]);
    expect([marker.lifecycle, index.lifecycle]).toEqual(["SEALED", "ADVANCING"]);
    // their key spaces are disjoint from each other and from every other kind: exactly one kind matches each key
    const x = "a".repeat(64);
    for (const [key, id] of [
      [`temporal/gm-wait/marker/${x}`, "temporal_gm_wait_marker"],
      ["temporal/gm-wait/by-pc/pc-1", "temporal_gm_wait_pc_index"],
    ] as const)
      expect(ALL_FACT_KINDS.filter((k) => k.keyPattern.test(key)).map((k) => k.id)).toEqual([id]);
    for (const bad of [
      "temporal/gm-wait/marker/",
      `temporal/gm-wait/marker/${x.toUpperCase()}`,
      `temporal/gm-wait/marker/${x}0`,
      "temporal/gm-wait/by-pc/",
      "temporal/gm-wait/by-pc/a/b",
      "temporal/gm-wait/other",
    ])
      expect(
        ALL_FACT_KINDS.filter((k) => k.id.startsWith("temporal_gm_wait") && k.keyPattern.test(bad)),
        bad,
      ).toEqual([]);
  });

  it("the durable opening authority gains exactly one alternate (the strict GM variant) in the shipped registry, and the transaction its stored union", () => {
    const authority = factKind("temporal_transaction_authority");
    expect(authority.alternateRules).toHaveLength(1);
    expect(factKind("resolution_transaction").alternateRules).toBeUndefined();
  });

  it("the sunset policy gains exactly two OWNER_CHECKS_ONLY rows, mirroring temporal_state, over the clock-origin table, and covers every registered kind", () => {
    expect(GM_WAIT_CUSTODY_SUNSET_POLICY_DELTA.map((r) => [r.kind, r.policy])).toEqual([
      ["temporal_gm_wait_marker", "OWNER_CHECKS_ONLY"],
      ["temporal_gm_wait_pc_index", "OWNER_CHECKS_ONLY"],
    ]);
    for (const k of NEW) {
      expect(sunsetPolicyOf(k)!.effect).toBe(sunsetPolicyOf("temporal_state")!.effect);
      expect(sunsetPolicyOf(k)!.policy).toBe(sunsetPolicyOf("temporal_state")!.policy);
    }
    // the existing rows are untouched
    expect(
      BOOTSTRAP_SUNSET_POLICY_GM_WAIT_V1.slice(0, BOOTSTRAP_SUNSET_POLICY_CLOCK_ORIGIN_V1.length),
    ).toEqual(BOOTSTRAP_SUNSET_POLICY_CLOCK_ORIGIN_V1);
    expect(BOOTSTRAP_SUNSET_POLICY_GM_WAIT_V1).toHaveLength(ALL_FACT_KINDS.length);
    expect(
      policyCoverageViolations(
        BOOTSTRAP_SUNSET_POLICY_GM_WAIT_V1,
        ALL_FACT_KINDS.map((k) => k.id),
        Object.fromEntries(BOOTSTRAP_SUNSET_POLICY_GM_WAIT_V1.map((r) => [r.kind, r.policy])),
      ),
    ).toEqual([]);
    expect(ALL_FACT_KINDS).toHaveLength(124);
  });

  it("the historical-verification identity gains the W2 custody segment last, in the production and the fixture admission alike; nothing else moves", () => {
    for (const admission of [canonicalAdmission, fixtureCanonicalAdmission])
      expect(admission.historyVerificationId!.endsWith(GM_WAIT_W2_HISTORY_POLICY_SEGMENT)).toBe(
        true,
      );
    // the earlier composition is an exact prefix: only the one segment was appended
    expect(canonicalAdmission.historyVerificationId).toContain(
      "+CAL-TIME-T1-CLOCK-ORIGIN@2026-11-18T22:23:26.085Z+MS-V3-CLOCK-STEP-B2-ORIGIN+GM-WAIT-W2-CUSTODY-V1@",
    );
    expect(fixtureCanonicalAdmission.historyVerificationId).not.toBe(
      canonicalAdmission.historyVerificationId,
    );
  });

  it("the Temporal directory gained no file: the custody and identity modules live at the engine source root, as the B1 catalogue modules do", () => {
    expect(readdirSync("packages/engine/src/temporal").sort()).toEqual([
      "admission.ts",
      "bootstrap.ts",
      "captured-chronology.ts",
      "coordinator.ts",
      "graph.ts",
      "identity.ts",
      "integrity.ts",
      "partition.ts",
      "providers.ts",
    ]);
  });
});
