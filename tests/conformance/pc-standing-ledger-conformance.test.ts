// S-4 initial Standing Instruction ledger — CONFORMANCE of the lowering to its source, brief and frozen inputs (BLUE brief Part B1, B6).
// MECHANISM ONLY. Governing lock: spec/f027/spec-lock.json (F-027 v1.0), which this construction does NOT edit; the S-4 sources are
// ratified design plus a BLUE bounded brief, never spec-lock pins, and the registry says so.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUILD_SPEC_IDENTITY,
  FACET_PC_STANDING_INSTRUCTION_LEDGER,
  PcStandingLedgerHeadSchema,
  PcStandingLedgerVersionSchema,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  BOOTSTRAP_SUNSET_POLICY_FREIGHT_V1,
  BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1,
  CanonicalCampaign,
  FACT_KINDS,
  PC_LEDGER_BINDING_RULE,
  PC_LEDGER_HISTORY_POLICY_SUFFIX,
  PC_LEDGER_RULE,
  PC_STANDING_LEDGER_FACT_KIND_IDS,
  PC_STANDING_LEDGER_FACT_KINDS,
  S4_BRIEF_SOURCE,
  S4_LEDGER_SOURCE,
  S4_RATIFICATION_SOURCE,
  SETUP_ELIGIBLE_KIND_IDS,
  canonicalAdmission,
  factKind,
  policyCoverageViolations,
  resolveKey,
} from "@immortalis/engine";
import { classifyGoverningRule } from "../../packages/engine/src/owners/governing-rule.ts";
import { A26_CHANGED_SOURCE_FILES } from "../support/a26-scoped-deltas.ts";
import { A24_ADAPTER_DELTA } from "../support/a24-scoped-delta.ts";
import { A05_SOURCE_DELTAS } from "../support/a05-scoped-deltas.ts";
import { FREIGHT_SCOPED_DELTAS } from "../support/freight-scoped-deltas.ts";
import {
  S4_BASE_COMMIT,
  S4_NEW_MODULES,
  S4_PRESENT_DAY_FILES,
  S4_SCOPED_DELTAS,
} from "../support/pc-standing-ledger-scoped-deltas.ts";

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
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("A8: the frozen inputs this construction must NOT change are byte-identical to the BLUE manifest (c6ea29d)", () => {
  // BLUE brief B6 (verified at the immutable commit c6ea29d3ccd7cadb83a622dc47704f449f63513b): length and full SHA-256
  // The spec lock's own SHA-256 is "today's lock identity", which only the suites that own it may state (current-look-lowering-conformance);
  // it is therefore compared with the build's generated mirror of the lock (`null` below) and with the base commit's bytes, never repeated.
  const frozen: readonly (readonly [string, number, string | null])[] = [
    [
      "packages/engine/src/world/setup-eligibility.ts",
      2389,
      "6a8b584be266f78c80cb087569e455d2ca399da00a0fea16866e9d5072be4738",
    ],
    ["spec/f027/spec-lock.json", 48377, null],
    [
      "IMPLEMENTATION_CHARTER.md",
      8703,
      "7701d44ba75f0c0523eb4430094025d8aaaf8c034a0e8beff7b993b7930aac48",
    ],
  ];
  for (const [path, length, digest] of frozen) {
    it(`${path} is ${length} bytes, SHA-256 ${digest === null ? "the build's own lock identity" : `${digest.slice(0, 16)}…`}: neither the setup-eligibility set, the spec lock nor the charter was edited`, () => {
      expect(readFileSync(path).length).toBe(length);
      expect(sha(path)).toBe(digest ?? BUILD_SPEC_IDENTITY.spec_lock_sha256);
      // and, where Git history is available, byte-identical to the immutable base commit
      const atBase = git("show", `${S4_BASE_COMMIT}:${path}`);
      if (atBase) expect(readFileSync(path).equals(atBase), path).toBe(true);
    });
  }

  it("the closed setup-eligibility set is exactly the nine R1 setup kinds: no ledger kind was added", () => {
    expect([...SETUP_ELIGIBLE_KIND_IDS].sort()).toEqual(
      [
        "actor_setup_placement",
        "named_actor_capability_basis",
        "pc_capability_basis",
        "pc_existence_contract",
        "world_actor_coupling",
        "world_corridor",
        "world_locus",
        "world_profile",
        "world_setup_closure",
      ].sort(),
    );
    for (const id of PC_STANDING_LEDGER_FACT_KIND_IDS)
      expect(SETUP_ELIGIBLE_KIND_IDS.has(id)).toBe(false);
  });
});

describe("S-4a: the ledger is a separate, non-intrinsic facet of the one existing PC owner", () => {
  it("holds exactly one ADVANCING head kind and one SEALED version kind, in a facet unrelated to existence_contract", () => {
    expect(PC_STANDING_LEDGER_FACT_KINDS.map((k) => [k.id, k.owner, k.facet, k.lifecycle])).toEqual(
      [
        [
          "pc_standing_instruction_ledger_head",
          "pc_existence",
          "standing_instruction_ledger",
          "ADVANCING",
        ],
        [
          "pc_standing_instruction_ledger_version",
          "pc_existence",
          "standing_instruction_ledger",
          "SEALED",
        ],
      ],
    );
    expect(FACET_PC_STANDING_INSTRUCTION_LEDGER).toBe("standing_instruction_ledger");
    expect(FACET_PC_STANDING_INSTRUCTION_LEDGER).not.toBe(factKind("pc_existence_contract").facet);
    // no new owner: pc_existence only (and the binding stays the Role Registry's)
    expect(new Set(PC_STANDING_LEDGER_FACT_KINDS.map((k) => k.owner))).toEqual(
      new Set(["pc_existence"]),
    );
    expect(factKind("player_character_binding").owner).toBe("role_registry");
  });

  it("the key spaces are exactly the pinned head/version keys, with no alias, fallback or non-canonical sequence", () => {
    const kindOf = (key: string) => resolveKey(key)?.kind.id;
    expect(kindOf("pc/p1/standing-instruction-ledger/head")).toBe(
      "pc_standing_instruction_ledger_head",
    );
    expect(kindOf("pc/p1/standing-instruction-ledger/version/1")).toBe(
      "pc_standing_instruction_ledger_version",
    );
    expect(resolveKey("pc/p1/standing-instruction-ledger/version/7")!.ids).toEqual(["p1", "7"]);
    for (const alias of [
      "pc/p1/standing-instruction-ledger",
      "pc/p1/standing-instruction-ledger/",
      "pc/p1/standing-instruction-ledger/head/1",
      "pc/p1/standing-instruction-ledger/version",
      "pc/p1/standing-instruction-ledger/version/0",
      "pc/p1/standing-instruction-ledger/version/01",
      "pc/p1/standing-instruction-ledger/version/-1",
      "pc/p1/standing-instruction-ledger/version/1.0",
      "pc/p1/standing-instruction-ledger/HEAD",
      "pc/p1/standing-instruction-ledger/version/1/extra",
      "pc/p1/instruction-ledger/head",
    ])
      expect(kindOf(alias), alias).toBeUndefined();
  });
});

describe("source citations: the exact S-4 pins, honestly labelled (ratified design + BLUE brief, NOT spec-locked)", () => {
  it("pins the three Notion natives exactly as the brief records them", () => {
    expect(S4_LEDGER_SOURCE).toEqual({
      artifact: "https://app.notion.com/p/41920af901e0818faf11c80a4fc59e9c",
      native_pin: "2026-11-15T13:54:22.606Z",
    });
    expect(S4_RATIFICATION_SOURCE).toEqual({
      artifact: "https://app.notion.com/p/41920af901e0816db645d2d43d12e6a5",
      native_pin: "2026-11-15T14:02:45.229Z",
    });
    expect(S4_BRIEF_SOURCE).toEqual({
      artifact: "https://app.notion.com/p/41b20af901e08196ac56e27f0d91e4b7",
      native_pin: "2026-11-17T04:59:46.616Z",
    });
  });

  for (const [name, rule] of [
    ["ledger kinds", PC_LEDGER_RULE],
    ["binding S-4 citation", PC_LEDGER_BINDING_RULE],
  ] as const) {
    it(`the ${name} cite S-4 v0.4, its Sovereign ratification and the BLUE brief, and claim no spec-lock pin`, () => {
      expect(rule.artifact).toBe(S4_LEDGER_SOURCE.artifact);
      expect(rule.native_pin).toBe(S4_LEDGER_SOURCE.native_pin);
      const lineage = rule.authority_lineage.join("\n");
      for (const s of [S4_RATIFICATION_SOURCE, S4_BRIEF_SOURCE, S4_LEDGER_SOURCE]) {
        expect(lineage).toContain(s.native_pin);
        expect(lineage).toContain(s.artifact);
      }
      expect(rule.effective_basis).toBe("ratified-design-blue-bounded-brief-not-spec-locked");
      expect(rule.effective_basis).not.toBe("pinned-by-spec-lock");
      expect(rule.supersedes).toBeNull();
    });
  }

  it("the ledger rule names the ratified clauses it lowers, and names no Class 2 / GM-reader / waiting authority", () => {
    for (const clause of [
      "S-4a",
      "S-4c",
      "S-4d",
      "ENGINE_ORIGIN_LEDGER_CLOSURE",
      "START_OF_LEDGER",
      "never PLAYER-AUTHORED",
    ])
      expect(PC_LEDGER_RULE.clause).toContain(clause);
    expect(PC_LEDGER_RULE.authority_lineage.join("\n")).toContain("NOT part of this lowering");
  });

  it("every ledger kind carries exactly the ledger rule", () => {
    for (const k of PC_STANDING_LEDGER_FACT_KINDS) {
      expect(k.rule).toEqual(PC_LEDGER_RULE);
      expect(k.legacyRule).toBeUndefined();
    }
  });
});

describe("the binding's frozen citation is untouched; the S-4 citation is an additive CURRENT alternate", () => {
  it("FACT_KINDS (the frozen-lock registration) is exactly as it was: the binding still cites the spec-locked IR rule, with no alternate", () => {
    const binding = FACT_KINDS.find((k) => k.id === "player_character_binding")!;
    expect(binding.alternateRules).toBeUndefined();
    expect(binding.rule.effective_basis).toBe("pinned-by-spec-lock");
    expect(binding.rule.artifact).not.toBe(S4_LEDGER_SOURCE.artifact);
    expect(FACT_KINDS).toHaveLength(4);
  });

  it("the registry's effective binding kind adds exactly the S-4 citation as an alternate, admitting any binding value", () => {
    const binding = factKind("player_character_binding");
    expect(binding.rule).toEqual(FACT_KINDS.find((k) => k.id === "player_character_binding")!.rule);
    expect(binding.alternateRules).toHaveLength(1);
    expect(binding.alternateRules![0]!.rule).toEqual(PC_LEDGER_BINDING_RULE);
    expect(binding.alternateRules![0]!.admits({})).toBe(true);
    expect(PC_LEDGER_BINDING_RULE).not.toEqual(binding.rule);
  });

  it("citation classification: the original and the S-4 citation are each lawful on the binding; neither is lawful on a ledger kind", () => {
    const binding = factKind("player_character_binding");
    expect(classifyGoverningRule(binding, binding.rule, {})).toBe("CURRENT");
    expect(classifyGoverningRule(binding, PC_LEDGER_BINDING_RULE, {})).toBe("ALTERNATE");
    expect(classifyGoverningRule(binding, PC_LEDGER_RULE, {})).toBe("INVALID");
    const head = factKind("pc_standing_instruction_ledger_head");
    expect(classifyGoverningRule(head, PC_LEDGER_RULE, {})).toBe("CURRENT");
    expect(classifyGoverningRule(head, PC_LEDGER_BINDING_RULE, {})).toBe("INVALID");
    expect(classifyGoverningRule(head, binding.rule, {})).toBe("INVALID");
  });
});

describe("historical verification identity: checkpoint evidence earned before S-4 is never trusted", () => {
  it("the production policy identity retains the exact S-4 suffix before A01, forcing a strict first replay", () => {
    const BEFORE =
      "R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z+GM-INITIAL-BOOTSTRAP-V9@2026-11-01T12:13:53.634Z+C1C2-V0.4@2026-11-03T00:51:23.053Z+INITIAL_LOCALITY_PARSER_V2+INITIAL_LOCALITY_PROVENANCE_V1+MS-SETUP-V08@2026-11-09T00:43:08.394Z+MS_ACTOR_PARSER_V1+ROADBED-FREIGHT-FI@2026-11-13T06:14:52.876Z";
    const id = canonicalAdmission.historyVerificationId!;
    expect(id).toBe(`${BEFORE}${PC_LEDGER_HISTORY_POLICY_SUFFIX}+POPULATION-STAGE-AUTHORITY-V2`);
    expect(PC_LEDGER_HISTORY_POLICY_SUFFIX).toContain(S4_LEDGER_SOURCE.native_pin);
    expect(PC_LEDGER_HISTORY_POLICY_SUFFIX).toContain(S4_RATIFICATION_SOURCE.native_pin);
    expect(PC_LEDGER_HISTORY_POLICY_SUFFIX).toContain(S4_BRIEF_SOURCE.native_pin);
    expect(id).not.toBe(BEFORE);
  });
});

describe("reviewed sunset policy: the two ledger kinds have rows, and no existing row changed", () => {
  it("the S-4 table is the freight table plus the two ledger rows, and covers exactly ALL_FACT_KINDS", () => {
    expect(BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1).toHaveLength(ALL_FACT_KINDS.length);
    expect(
      BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1.slice(0, BOOTSTRAP_SUNSET_POLICY_FREIGHT_V1.length),
    ).toEqual(BOOTSTRAP_SUNSET_POLICY_FREIGHT_V1);
    const rows = BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1.slice(
      BOOTSTRAP_SUNSET_POLICY_FREIGHT_V1.length,
    );
    expect(rows.map((r) => [r.kind, r.policy])).toEqual(
      PC_STANDING_LEDGER_FACT_KIND_IDS.map((k) => [k, "OWNER_CHECKS_ONLY"]),
    );
    expect(
      policyCoverageViolations(
        BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1,
        ALL_FACT_KINDS.map((k) => k.id),
        Object.fromEntries(BOOTSTRAP_SUNSET_POLICY_S4_LEDGER_V1.map((r) => [r.kind, r.policy])),
      ),
    ).toEqual([]);
  });
});

describe("scope exclusions: no instruction authoring, no GM reader, no public tool, no waiting (BLUE brief B5)", () => {
  it("the carrier cannot represent an instruction, an amendment, a revocation or an authorship claim", () => {
    const keys = (s: unknown) => Object.keys((s as { shape: Record<string, unknown> }).shape);
    expect(keys(PcStandingLedgerVersionSchema).sort()).toEqual(
      ["content_sha256", "instructions", "origin", "pc_id", "previous", "sequence"].sort(),
    );
    expect(keys(PcStandingLedgerHeadSchema).sort()).toEqual(["content_sha256", "current", "pc_id"]);
  });

  it("the campaign gained exactly three ledger methods, none of which takes an instruction", () => {
    const names = Object.getOwnPropertyNames(CanonicalCampaign.prototype).filter((n) =>
      /standing|ledger|instruction/i.test(n),
    );
    expect(names.sort()).toEqual(
      [
        "initializePcStandingInstructionLedger",
        "qualifyLegacyPcStandingInstructionLedger",
        "standingInstructionLedger",
      ].sort(),
    );
  });

  it("no protocol, MCP, GM-facing or player-facing source mentions the ledger: it is internal bookkeeping only", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        return n === "node_modules"
          ? []
          : statSync(p).isDirectory()
            ? walk(p)
            : p.endsWith(".ts")
              ? [p]
              : [];
      });
    const surfaces = [
      ...walk("packages/protocol/src"),
      ...walk("packages/operator/src"),
      ...walk("apps"),
    ];
    const mentions = surfaces.filter((f) =>
      /standing-?instruction|standingInstructionLedger|PcStandingLedger/i.test(
        readFileSync(f, "utf8"),
      ),
    );
    // the ONE operator path that creates a character initializes its ledger; nothing else may read, expose or name it
    expect(mentions.map((f) => f.replaceAll("\\", "/"))).toEqual([
      "packages/operator/src/original-pc.ts",
    ]);
  });
});

const historyAvailable = git("cat-file", "-e", `${S4_BASE_COMMIT}^{commit}`) !== null;

describe("scope: this slice changed exactly the predecessor files it records", () => {
  it("each recorded delta is pinned at its head bytes, and its base is the freight slice's head (the chain of custody)", () => {
    for (const [path, d] of Object.entries(S4_SCOPED_DELTAS)) {
      expect(sha(path), path).toBe(d.head);
      expect(d.base, path).not.toBe(d.head);
      expect(FREIGHT_SCOPED_DELTAS[path]?.head, path).toBe(d.base);
    }
  });

  it("each recorded base is what the base commit's own bytes hash to (where Git history is available)", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    for (const [path, d] of Object.entries(S4_SCOPED_DELTAS)) {
      const atBase = git("show", `${S4_BASE_COMMIT}:${path}`);
      expect(atBase === null ? null : createHash("sha256").update(atBase).digest("hex"), path).toBe(
        d.base,
      );
    }
  });

  it("nothing under packages/ changed except the recorded deltas, the present-day-table files and this slice's own new modules", () => {
    if (!historyAvailable)
      return console.warn("SKIPPED: shallow checkout, the base commit is not reachable");
    // content only: a package manager may mark bin scripts executable in a working tree, which is a mode change, not a change of this slice
    const lines = (b: Buffer | null) => (b?.toString("utf8") ?? "").split("\n").filter(Boolean);
    const changed = lines(
      git("-c", "core.fileMode=false", "diff", "--name-only", S4_BASE_COMMIT, "--", "packages"),
    );
    const untracked = lines(git("ls-files", "--others", "--exclude-standard", "--", "packages"));
    const allowed = new Set([
      ...Object.keys(S4_SCOPED_DELTAS),
      ...S4_PRESENT_DAY_FILES,
      ...S4_NEW_MODULES,
    ]);
    const reviewedHead = "b93c79af0fa8e2de0384ea74003900dcc58b8822";
    const historical = git(
      "-c",
      "core.fileMode=false",
      "diff",
      "--name-only",
      S4_BASE_COMMIT,
      reviewedHead,
      "--",
      "packages",
    );
    expect(historical, "authentic S-4 reviewed head is required").not.toBeNull();
    for (const p of lines(historical)) expect(allowed.has(p), p).toBe(true);
    // Retain the live tracked/untracked guard while accounting for the subsequent A01, A26, A24 and A05 paths.
    const combinedAllowed = new Set([
      ...allowed,
      "packages/engine/src/population/admission.ts",
      "packages/engine/src/population/integrity.ts",
      "packages/engine/src/population/stage-authority.ts",
      ...A26_CHANGED_SOURCE_FILES,
      A24_ADAPTER_DELTA.path,
      ...Object.keys(A05_SOURCE_DELTAS),
    ]);
    for (const p of [...changed, ...untracked]) expect(combinedAllowed.has(p), p).toBe(true);
    // ... and every recorded file really did change (the allow-list is not a place to park files that did not)
    for (const p of [...Object.keys(S4_SCOPED_DELTAS), ...S4_PRESENT_DAY_FILES])
      expect(changed.includes(p), p).toBe(true);
    for (const p of S4_NEW_MODULES)
      expect(untracked.includes(p) || changed.includes(p), p).toBe(true);
  });
});
