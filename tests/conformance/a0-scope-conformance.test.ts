// F-014B A0 (CAL-TIME T-1 clock-origin T1 mechanism) — SCOPE. This slice changed exactly the files its table records, nothing it is forbidden to
// touch moved, the accepted source-lock artifacts are the immutable bytes BLUE passed, every pin edit corresponds to a real byte change, and
// the registry, rules and sunset row are exactly what the lock declares. MECHANISM ONLY: no behaviour is judged here (the A0-T00..T17 tests do).
//
// History checks use the Git objects named in tests/support/a0-scoped-deltas.ts; a shallow checkout (no history) skips them and says so,
// it never claims them.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  CLOCK_ORIGIN_SUNSET_POLICY_DELTA,
  BOOTSTRAP_SUNSET_POLICY_CLOCK_ORIGIN_V1,
  BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1,
  INITIAL_SETUP_FACT_KINDS,
  INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE,
  INITIAL_SETUP_INPUT_MS_V3_RULE,
  INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
  MS_PRE_CLOCK_KINDS,
  TEMPORAL_CAPTURED_V2_GENESIS_RULE,
  TEMPORAL_FACT_KINDS,
  factKind,
  policyCoverageViolations,
  sunsetPolicyOf,
} from "@immortalis/engine";
import { FREIGHT_SCOPED_DELTAS } from "../support/freight-scoped-deltas.ts";
import { S4_SCOPED_DELTAS } from "../support/pc-standing-ledger-scoped-deltas.ts";
import {
  A0_BASE_COMMIT,
  A0_CENSUS_COMMIT,
  A0_CUSTODY_ARTIFACTS,
  A0_DECLARED_MAIN_INCLUSIONS,
  A0_INTEGRATED_MAIN_COMMIT,
  A0_NEW_MODULES,
  A0_OUTSIDE_PACKAGE_PATHS,
  A0_PACKAGE_PATHS,
  A0_PRESENT_DAY_FILES,
  A0_SCOPED_DELTAS,
  A0_SOURCE_LOCK_COMMIT,
} from "../support/a0-scoped-deltas.ts";
import { v1Capture, v2Capture } from "../support/clock-origin.ts";

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
const fileSha = (p: string): string => sha(readFileSync(p));
const reachable = (ref: string): boolean => git("cat-file", "-e", `${ref}^{commit}`) !== null;
const historyAvailable = reachable(A0_BASE_COMMIT);
const lines = (b: Buffer | null): string[] =>
  (b?.toString("utf8") ?? "").split("\n").filter(Boolean);

describe("the A0 scoped-delta table: every pin is a real byte change, recorded once, chained to the earlier slices", () => {
  it("each recorded head is the file's bytes now, and differs from its base", () => {
    for (const [path, d] of Object.entries(A0_SCOPED_DELTAS)) {
      expect(fileSha(path), path).toBe(d.head);
      expect(d.base, path).not.toBe(d.head);
    }
    expect(Object.keys(A0_SCOPED_DELTAS)).toHaveLength(15);
  });

  it("each recorded base is what the A0 base commit's own bytes hash to (where Git history is available)", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    for (const [path, d] of Object.entries(A0_SCOPED_DELTAS)) {
      const atBase = git("show", `${A0_BASE_COMMIT}:${path}`);
      expect(atBase === null ? null : sha(atBase), path).toBe(d.base);
    }
  });

  it("where an earlier slice's table also records a path, that table's head is exactly this base (the chain of custody)", () => {
    const earlier = (path: string) => S4_SCOPED_DELTAS[path] ?? FREIGHT_SCOPED_DELTAS[path];
    const chained = Object.keys(A0_SCOPED_DELTAS).filter((p) => earlier(p));
    expect(chained.sort()).toEqual([
      "packages/engine/src/initial-setup/sunset-guard.ts",
      "packages/engine/src/initial-setup/sunset-policy.ts",
      "packages/engine/src/temporal/admission.ts",
      "packages/engine/src/temporal/coordinator.ts",
    ]);
    for (const p of chained) expect(earlier(p)!.head, p).toBe(A0_SCOPED_DELTAS[p]!.base);
  });

  it("the census files this slice relies on were byte-identical at the base: main moved only vitest.config.ts since the census commit", () => {
    if (!reachable(A0_CENSUS_COMMIT) || !historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the census commit is not reachable");
    expect(lines(git("diff", "--name-only", A0_CENSUS_COMMIT, A0_BASE_COMMIT))).toEqual([
      "vitest.config.ts",
    ]);
  });

  it("this slice changed exactly the recorded files under packages/ and apps/, tracked or not, and no other path", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    // content only: a package manager may mark bin scripts executable in a working tree, which is a mode change, not a change of this slice
    const changed = lines(
      git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        A0_BASE_COMMIT,
        "--",
        "apps",
        "packages",
      ),
    );
    const untracked = lines(
      git("ls-files", "--others", "--exclude-standard", "--", "apps", "packages"),
    );
    // main moved after the A0 intake: B0 (PR #117) added one pure request module under packages/, declared in the table; against the A0 base
    // the difference is exactly the A0 paths plus that declared inclusion, and against the integrated main (below) it is the A0 paths alone
    expect([...changed, ...untracked].sort()).toEqual(
      [...A0_PACKAGE_PATHS, ...A0_DECLARED_MAIN_INCLUSIONS].sort(),
    );
    // every recorded present-day / delta file really changed; the allow-list is not a place to park files that did not
    for (const p of [...Object.keys(A0_SCOPED_DELTAS), ...A0_PRESENT_DAY_FILES])
      expect(changed.includes(p), p).toBe(true);
    for (const p of A0_NEW_MODULES)
      expect(untracked.includes(p) || changed.includes(p), p).toBe(true);
    // and outside packages/ it touched the lock and the checker only (among spec/ and tools/)
    const outside = lines(
      git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        A0_BASE_COMMIT,
        "--",
        "spec",
        "tools",
      ),
    );
    expect(outside.sort()).toEqual([...A0_OUTSIDE_PACKAGE_PATHS].sort());
  });

  it("against the integrated main, this slice changed exactly the recorded files under packages/ and apps/ and added no file there beyond them", () => {
    if (!reachable(A0_INTEGRATED_MAIN_COMMIT))
      return console.warn("SKIPPED: the integrated main commit is not reachable");
    // the integrated main is an ancestor of the working tree's HEAD: the merge was not a rewrite
    expect(
      git("merge-base", "--is-ancestor", A0_INTEGRATED_MAIN_COMMIT, "HEAD") !== null,
      "integrated main is an ancestor of HEAD",
    ).toBe(true);
    const changed = lines(
      git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        A0_INTEGRATED_MAIN_COMMIT,
        "--",
        "apps",
        "packages",
      ),
    );
    const untracked = lines(
      git("ls-files", "--others", "--exclude-standard", "--", "apps", "packages"),
    );
    expect([...changed, ...untracked].sort()).toEqual([...A0_PACKAGE_PATHS].sort());
    // the declared main inclusions are in main already: this slice does not change them
    for (const p of A0_DECLARED_MAIN_INCLUSIONS) {
      expect(changed.includes(p), `${p} changed against the integrated main`).toBe(false);
      expect(git("cat-file", "-e", `${A0_INTEGRATED_MAIN_COMMIT}:${p}`) !== null, p).toBe(true);
      expect(
        git("cat-file", "-e", `${A0_BASE_COMMIT}:${p}`) === null,
        `${p} is not in the A0 base`,
      ).toBe(true);
    }
    // and outside packages/ it touched the lock and the checker only (among spec/ and tools/)
    const outside = lines(
      git(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        A0_INTEGRATED_MAIN_COMMIT,
        "--",
        "spec",
        "tools",
      ),
    );
    expect(outside.sort()).toEqual([...A0_OUTSIDE_PACKAGE_PATHS].sort());
  });
});

describe("what A0 must NOT change is byte-identical to the A0 base", () => {
  const FORBIDDEN = [
    // protected D-3 gateways and their conformance neighbours, the kernel contract and its integrity verifier
    "packages/protocol",
    "packages/contracts/src/temporal.ts",
    "packages/engine/src/temporal/integrity.ts",
    // legacy operator and phone surfaces: v1-only parsers keep refusing v2, the capture store, intake and direct initialize-time stay
    "packages/operator",
    "apps",
    // MS machinery A0 does not touch: the R1 pin discipline, the publishers and the ten-clause manifest's source
    "packages/engine/src/ms-setup/r1.ts",
    "packages/engine/src/ms-setup/publisher.ts",
    "packages/engine/src/ms-setup/admission.ts",
    "packages/engine/src/ms-setup/protocol.ts",
    "packages/engine/src/ms-setup/rules.ts",
    "spec/f027/ms-setup-v08-manifest.json",
    // the frozen runtime contract, register and gates (IA rows stay NOT_IMPLEMENTED), and the shared testkit
    "spec/f027/runtime-contract.md",
    "spec/f027/acceptance-register.yaml",
    "spec/f027/open-gates.yaml",
    "packages/testkit",
    "packages/engine/src/world/integrity.ts",
    "packages/engine/src/persistence",
    "packages/engine/src/commit",
  ];
  it("no forbidden path moved since the base (tracked or not)", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    for (const p of FORBIDDEN) {
      expect(
        lines(git("-c", "core.fileMode=false", "diff", "--name-only", A0_BASE_COMMIT, "--", p)),
        p,
      ).toEqual([]);
      expect(lines(git("ls-files", "--others", "--exclude-standard", "--", p)), p).toEqual([]);
    }
  });

  it("the Temporal directory gained no file (its exact listing is asserted elsewhere), and the three D-3 gateways are among the untouched", () => {
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
    for (const g of [
      "packages/protocol/src/active-pc-target-advance.ts",
      "packages/protocol/src/null-pc-ooc-advance.ts",
      "packages/protocol/src/null-pc-ooc-held-continuation.ts",
    ])
      expect(
        FORBIDDEN.some((f) => g.startsWith(f)),
        g,
      ).toBe(true);
  });

  it("MS_PRE_CLOCK_KINDS is exactly the seventeen kinds it always held: the origin is NOT a pre-clock kind", () => {
    expect([...MS_PRE_CLOCK_KINDS].sort()).toEqual(
      [
        "world_profile",
        "world_locus",
        "world_source_condition",
        "pc_existence_contract",
        "pc_capability_basis",
        "referee_decision",
        "initial_setup_input",
        "initial_setup_invocation",
        "initial_setup_response",
        "initial_setup_grant",
        "initial_locality_completion",
        "initial_setup_disposition",
        "initial_actor_setup_issue",
        "initial_actor_setup_response",
        "named_actor_existence_basis",
        "actor_setup_placement",
        "world_setup_closure",
      ].sort(),
    );
  });
});

describe("the accepted source-lock artifacts are the immutable bytes BLUE passed", () => {
  it("their size and SHA-256 are the custody table's now, and (where the commit is reachable) at the source-lock commit", () => {
    for (const [path, c] of Object.entries(A0_CUSTODY_ARTIFACTS)) {
      const bytes = readFileSync(path);
      expect(bytes.length, path).toBe(c.bytes);
      expect(sha(bytes), path).toBe(c.sha256);
    }
    // the sizes BLUE's PASS brief records for the two artifacts it names
    expect(A0_CUSTODY_ARTIFACTS["docs/f014b/a0-clock-origin-source-lock.md"]!.bytes).toBe(90405);
    expect(
      A0_CUSTODY_ARTIFACTS["tests/contract/chronology-v1-baseline-corpus.test.ts"]!.bytes,
    ).toBe(11598);
    if (!reachable(A0_SOURCE_LOCK_COMMIT))
      return console.warn("SKIPPED: shallow checkout, the source-lock commit is not reachable");
    // Custody (BLUE Q5) is the accepted bytes at the pinned commit, which the loop below and the unconditional working-tree
    // check above hold. It is NOT ancestry: A0 reached main by a squash merge, which keeps the source-lock commit retrievable
    // (it is the pinned custody pointer) but does not keep it in main's history, so an ancestry assertion fails on main by
    // construction, as the post-merge main run showed. The pre-merge branch did retain it; that was incidental, not custody.
    for (const path of Object.keys(A0_CUSTODY_ARTIFACTS)) {
      const atCommit = git("show", `${A0_SOURCE_LOCK_COMMIT}:${path}`);
      expect(atCommit && sha(atCommit), path).toBe(A0_CUSTODY_ARTIFACTS[path]!.sha256);
    }
  });
});

describe("the registry, rules and sunset row are exactly what the lock declares", () => {
  it("temporal_origin joins the Temporal kinds as the last, SEALED, under the same owner and facet; the base kinds carry no alternate", () => {
    expect(TEMPORAL_FACT_KINDS.map((k) => k.id).at(-1)).toBe("temporal_origin");
    for (const k of TEMPORAL_FACT_KINDS) expect(k.alternateRules, k.id).toBeUndefined();
    const origin = factKind("temporal_origin");
    expect([origin.owner, origin.facet, origin.lifecycle, origin.im]).toEqual([
      "temporal_kernel",
      "temporal_coordination",
      "SEALED",
      "IM-02",
    ]);
    expect(origin.rule).toBe(TEMPORAL_CAPTURED_V2_GENESIS_RULE);
    expect(origin.alternateRules).toBeUndefined();
    expect(origin.keyPattern.test("temporal/origin")).toBe(true);
    for (const bad of [
      "temporal/origin/",
      "temporal/origin/x",
      "temporal/Origin",
      "temporal/origins",
    ])
      expect(origin.keyPattern.test(bad), bad).toBe(false);
  });

  it("the genesis rule is temporal_state's ONLY alternate in the shipped registry, and admits only an initial basis", () => {
    const state = factKind("temporal_state");
    expect(state.alternateRules).toHaveLength(1);
    const [alt] = state.alternateRules!;
    expect(alt!.rule).toBe(TEMPORAL_CAPTURED_V2_GENESIS_RULE);
    const initial = {
      canonical_time: { unit: "seconds", value: 0 },
      last_transaction: null,
      continuation: null,
    };
    expect(alt!.admits(initial)).toBe(true);
    expect(alt!.admits({ ...initial, last_transaction: "tx-1" })).toBe(false);
    expect(alt!.admits({ canonical_time: { unit: "seconds", value: 0 } })).toBe(false);
    expect(alt!.admits(null)).toBe(false);
    expect(state.rule).not.toBe(TEMPORAL_CAPTURED_V2_GENESIS_RULE);
  });

  it("initial_setup_input keeps its rule and the original MS alternate untouched and adds exactly the two v2 alternates, each v2-only", () => {
    const kind = INITIAL_SETUP_FACT_KINDS.find((k) => k.id === "initial_setup_input")!;
    expect(kind.alternateRules!.map((a) => a.rule)).toEqual([
      INITIAL_SETUP_INPUT_MS_V3_RULE,
      INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
      INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE,
    ]);
    const base = {
      format: "immortalis-initial-setup-input",
      format_version: 1,
      world_id: "w",
      locus_id: "l",
      source: { fact_key: "s", version: 1 },
      pc: null,
      setup_id: "a".repeat(64),
      scope_fingerprint: "b".repeat(64),
      setup_message: "m",
      author: {
        grade: "ORIGINAL_MESSAGE_VERIFIED",
        client: "c",
        oauth_grant: "g",
        request_ref: "r",
        original_message_hash: "c".repeat(64),
        method_id: "x",
        proof_hash: "d".repeat(64),
      },
      genesis: [],
      projection_hash: "e".repeat(64),
      pre_state: { head: "revision:1", basis_hash: "f".repeat(64) },
      runner: {
        runner_id: "initial-locality-runner-v1",
        key_id: "k",
        public_key: "p",
        instruction_hash: "1".repeat(64),
        driver_id: "d",
        driver_config_hash: "2".repeat(64),
      },
      parser: "INITIAL_LOCALITY_PARSER_V2",
    };
    const v1 = { ...base, chronology: v1Capture({ campaignId: "c" }) };
    const v2 = { ...base, chronology: v2Capture({ campaignId: "c" }) };
    const [, v2NonMs, v2Ms] = kind.alternateRules!;
    // the original MS alternate admits by schema parse alone (so a v2 value parses): the correspondence is owner admission's, not this predicate's
    expect(kind.alternateRules![0]!.admits(v1)).toBe(true);
    for (const alt of [v2NonMs!, v2Ms!]) {
      expect(alt.admits(v2)).toBe(true);
      expect(alt.admits(v1)).toBe(false);
      expect(alt.admits({ ...v2, extra: 1 })).toBe(false);
      expect(alt.admits(null)).toBe(false);
    }
  });

  it("the sunset policy gains exactly one OWNER_CHECKS_ONLY row for temporal_origin, mirroring temporal_state, and covers every registered kind", () => {
    expect(CLOCK_ORIGIN_SUNSET_POLICY_DELTA.map((r) => [r.kind, r.policy])).toEqual([
      ["temporal_origin", "OWNER_CHECKS_ONLY"],
    ]);
    expect(sunsetPolicyOf("temporal_origin")!.effect).toBe(
      sunsetPolicyOf("temporal_state")!.effect,
    );
    expect(sunsetPolicyOf("temporal_origin")!.policy).toBe(
      sunsetPolicyOf("temporal_state")!.policy,
    );
    // the existing rows are untouched
    expect(
      BOOTSTRAP_SUNSET_POLICY_CLOCK_ORIGIN_V1.slice(0, BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1.length),
    ).toEqual(BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1);
    expect(BOOTSTRAP_SUNSET_POLICY_CLOCK_ORIGIN_V1).toHaveLength(ALL_FACT_KINDS.length);
    expect(
      policyCoverageViolations(
        BOOTSTRAP_SUNSET_POLICY_CLOCK_ORIGIN_V1,
        ALL_FACT_KINDS.map((k) => k.id),
        Object.fromEntries(BOOTSTRAP_SUNSET_POLICY_CLOCK_ORIGIN_V1.map((r) => [r.kind, r.policy])),
      ),
    ).toEqual([]);
    expect(ALL_FACT_KINDS).toHaveLength(122);
  });
});

describe("the category-8 predicate is unwired: it has no caller outside tests, no store and no read", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
    );
  it("siOriginWitnessViolation appears in production code only where it is declared and re-exported", () => {
    const hits = [...walk("packages"), ...walk("apps")]
      .filter((f) => /\.(ts|mts|js|mjs)$/.test(f) && !f.includes("node_modules"))
      .filter((f) => readFileSync(f, "utf8").includes("siOriginWitnessViolation"));
    expect(hits).toEqual(["packages/contracts/src/temporal-origin.ts"]);
    const source = readFileSync("packages/contracts/src/temporal-origin.ts", "utf8");
    const body = source.slice(source.indexOf("export function siOriginWitnessViolation"));
    // a pure function of (witness, clock, campaign): no import of a store, no engine, no filesystem, no clock, no random
    expect(body).not.toMatch(
      /\bstore\b|\bgetFact\b|\blistFacts\b|readFile|Date\b|Math\.random|process\./,
    );
    expect(source).not.toMatch(/from "(?!zod|\.\/)[^"]+"/);
  });
});
