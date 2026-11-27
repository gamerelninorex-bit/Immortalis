import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALL_FACT_KINDS,
  canonicalAdmission,
  sha256Canonical,
  resolveKey,
} from "@immortalis/engine";
import { WORKSHOP_FACT_KINDS } from "../../packages/engine/src/owners/workshop/index.ts";
import {
  GM_WAIT_CATALOGUE_CURRENT_SHA256,
  GM_WAIT_CATALOGUE_RETAINED_SHA256,
} from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { valueSchemaFingerprint } from "../../packages/engine/src/gm-wait-catalogue.ts";

import {
  B3_BASE_COMMIT,
  B3_E_CATALOGUE_PATH,
  B3_E_CATALOGUE_SHA256,
  B3_NON_PACKAGE_PATHS,
  B3_PACKAGE_PATHS,
  B3_SHARED_DELTAS,
  gitB3BaseFile,
} from "../support/b3-scoped-deltas.ts";
import { atB3EconomyBase, B3_E_BASE_COMMIT } from "../support/if6b-scoped-delta.ts";
import { tempDir } from "../support/tmp.ts";

const baseCatalogue = "7707ff8ec86a9564dae2b026e730386f26fadfd4011c2934d0cc19dd5a6f09ed";
type KindEntry = { readonly id: string; readonly value_schema_fp: string };
const entries = (sha: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../packages/engine/gm-wait-catalogue/manifests/${sha}.json`, import.meta.url),
      "utf8",
    ),
  ).kinds as KindEntry[];

const installerBinPaths = [
  "advance-request-answer",
  "advance-request",
  "advance-request-bind",
  "gm-freight",
  "gm-freight-bind",
  "observe-request-answer",
  "observe-request",
  "observe-request-bind",
  "player-view",
  "player-view-bind",
  "referee",
  "referee-console",
].map((name) => `packages/operator/src/${name}-bin.ts`);

// The pinned pnpm bin linker sets this exact executable mode.
const installerBinMode = 0o755;

function b3EconomyGitScope(base: string, roots: string[], cwd = process.cwd()) {
  const git = (...args: string[]) => execFileSync("git", args, { cwd });
  const fields = (bytes: Buffer) => bytes.toString("utf8").split("\0").slice(0, -1);
  const delta = (...refs: string[]) => {
    const raw = fields(
      git(
        "-c",
        "core.fileMode=true",
        "diff",
        "--raw",
        "-z",
        "--no-renames",
        ...refs,
        "--",
        ...roots,
      ),
    );
    const changes = [];
    for (let i = 0; i < raw.length; i += 2) {
      const [oldMode, newMode, , , status] = raw[i]!.slice(1).split(" ");
      changes.push({ path: raw[i + 1]!, oldMode, newMode, status });
    }
    return changes;
  };
  return {
    committed: delta(base, "HEAD"),
    staged: delta("--cached", "HEAD"),
    worktree: delta().filter(({ path, oldMode, newMode, status }) => {
      if (
        !installerBinPaths.includes(path) ||
        status !== "M" ||
        oldMode !== "100644" ||
        newMode !== "100755"
      )
        return true;
      const file = join(cwd, path);
      const mode = lstatSync(file).mode & 0o7777;
      return mode !== installerBinMode || !readFileSync(file).equals(git("show", `HEAD:${path}`));
    }),
    untracked: fields(git("ls-files", "-z", "--others", "--exclude-standard", "--", ...roots)),
  };
}

describe("B3 catalogue and historical source custody", () => {
  it("T107, adds exactly the ten granted kinds and preserves every earlier entry", () => {
    const original = entries(baseCatalogue);
    const head = entries(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    const staged = head.find((kind) => kind.id === "resolution_transaction")!;
    expect(staged.value_schema_fp).not.toBe(
      original.find((kind) => kind.id === staged.id)!.value_schema_fp,
    );
    expect(head).toEqual(
      original.map((kind) =>
        kind.id === staged.id ? { ...kind, value_schema_fp: staged.value_schema_fp } : kind,
      ),
    );
    expect(ALL_FACT_KINDS).toHaveLength(124);
    const qualification = JSON.parse(
      readFileSync(new URL("../fixtures/b3-qualification-registry.json", import.meta.url), "utf8"),
    );
    const actual = WORKSHOP_FACT_KINDS.map((k) => ({
      id: k.id,
      owner: k.owner,
      facet: k.facet,
      im: k.im,
      rc: [...k.rc],
      lifecycle: k.lifecycle,
      key_pattern: { source: k.keyPattern.source, flags: k.keyPattern.flags },
      value_schema_fp: valueSchemaFingerprint(k.valueSchema),
      rule_ref: sha256Canonical(k.rule),
      legacy_refs: [],
      later_legacy_refs: [],
      alternate_refs: [],
      disposition: "UNDECLARED",
    })).sort((a, b) => a.id.localeCompare(b.id));
    expect(actual).toEqual(qualification);
    expect(resolveKey("health/pc/example/condition/" + "a".repeat(64))).toBeNull();
    expect(resolveKey("gip/local-completion-notice/campaign/example/charter")).toBeNull();
    const instrument = head.find(({ id }) => id === "gip_governance_instrument");
    expect(instrument?.value_schema_fp).toBe(
      "deaa7427138be17680a43ae60721e0e659457c30cf54c67f3c7189be25e1b792",
    );
    expect(sha256Canonical(instrument)).toBe(
      sha256Canonical(original.find(({ id }) => id === "gip_governance_instrument")),
    );
  });

  it("checks the exact tracked and untracked B3 scope against merged B2", () => {
    const paths = [
      "apps",
      "packages",
      "docs",
      "spec",
      "tools",
      ".github",
      "package.json",
      "pnpm-lock.yaml",
    ];
    const git = (...args: string[]) =>
      execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
    const actual = [
      ...new Set([
        ...git("-c", "core.fileMode=false", "diff", "--name-only", B3_BASE_COMMIT, "--", ...paths),
        ...git("ls-files", "--others", "--exclude-standard", "--", ...paths),
      ]),
    ].sort();
    expect(actual).toEqual([...B3_PACKAGE_PATHS, ...B3_NON_PACKAGE_PATHS].sort());
    const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
    for (const [path, pin] of Object.entries(B3_SHARED_DELTAS)) {
      expect(sha(gitB3BaseFile(path)), path).toBe(pin.base);
      expect(sha(readFileSync(path)), path).toBe(pin.head);
      expect(pin.base, path).not.toBe(pin.head);
    }
  });

  it("keeps the original deny policy and records only the dormant Health provider addition", () => {
    const manifest = (sha: string) =>
      JSON.parse(
        readFileSync(
          new URL(`../../packages/engine/gm-wait-catalogue/manifests/${sha}.json`, import.meta.url),
          "utf8",
        ),
      );
    const before = manifest(baseCatalogue);
    const head = manifest(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    expect(head.policy).toMatchObject({
      default_disposition: "UNDECLARED",
      evaluator: { id: "NONE_SECTION_10_NOT_ACCEPTED" },
      live_admission: { id: "NOT_INSTALLED_NO_GM_WRITER" },
      historical_verification: before.policy.historical_verification,
    });
    const successors = head.providers.filter(({ owner }: { owner: string }) => owner === "health");
    expect(successors).toHaveLength(1);
    expect(successors[0]).toMatchObject({
      status: "DORMANT",
      disposition: "UNDECLARED",
      site_ids: [],
    });
    expect(head.providers.filter(({ owner }: { owner: string }) => owner !== "health")).toEqual(
      before.providers,
    );
  });

  it("B3-E extends the accepted catalogue only with its scoped runtime source fingerprints", () => {
    const folder = "packages/engine/gm-wait-catalogue/manifests";
    const pointer = "packages/engine/src/gm-wait-catalogue-current.ts";
    const runtime = [
      "packages/engine/src/owners/admission.ts",
      "packages/engine/src/owners/workshop/generation.ts",
      "packages/engine/src/owners/workshop/lane-x.ts",
      "packages/engine/src/temporal/if6b-stage.ts",
    ];
    const roots = [
      "apps",
      "packages",
      "spec",
      "tools",
      ".github",
      "package.json",
      "pnpm-lock.yaml",
    ];
    const paths = (args: string[]) =>
      execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
    const { committed, staged, worktree, untracked } = b3EconomyGitScope(B3_E_BASE_COMMIT, roots);
    expect(committed).toHaveLength(runtime.length + 2);
    expect(committed).toEqual(
      expect.arrayContaining([
        ...[...runtime, pointer].map((path) => ({
          path,
          oldMode: "100644",
          newMode: "100644",
          status: "M",
        })),
        { path: B3_E_CATALOGUE_PATH, oldMode: "000000", newMode: "100644", status: "A" },
      ]),
    );
    expect(staged, "staged changes").toEqual([]);
    expect(worktree, "unstaged changes").toEqual([]);
    expect(untracked, "untracked files").toEqual([]);

    const previous = "f7a4b7ee4094fdf8efa3d17a2f9ee4d3bea36114ce227c6e839489dd10ab9948";
    const priorPointer = atB3EconomyBase(pointer);
    expect(createHash("sha256").update(priorPointer).digest("hex")).toBe(
      "718171b29ee1624a2bf7216164c5c5e7b3bff418f4c36c4e75d7dd5a7ea5c5c5",
    );
    const priorDigests = paths(["ls-tree", "-r", "--name-only", B3_E_BASE_COMMIT, "--", folder]);
    for (const path of priorDigests) {
      expect(readFileSync(path).equals(atB3EconomyBase(path)), path).toBe(true);
    }
    expect(GM_WAIT_CATALOGUE_RETAINED_SHA256).toEqual(
      [
        ...priorDigests.map((path) => path.slice(folder.length + 1, -5)),
        B3_E_CATALOGUE_SHA256,
      ].sort(),
    );
    expect(GM_WAIT_CATALOGUE_CURRENT_SHA256).toBe(B3_E_CATALOGUE_SHA256);
    const bytes = readFileSync(B3_E_CATALOGUE_PATH);
    expect(bytes).toHaveLength(389714);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(B3_E_CATALOGUE_SHA256);

    const baseline = JSON.parse(atB3EconomyBase(`${folder}/${previous}.json`).toString("utf8"));
    const current = JSON.parse(bytes.toString("utf8"));
    const before = baseline.policy.source_policy.files;
    expect(current.policy.source_policy.files.map((entry: { path: string }) => entry.path)).toEqual(
      before.map((entry: { path: string }) => entry.path),
    );
    expect(
      current.policy.source_policy.files
        .filter((entry: { sha256: string }, index: number) => entry.sha256 !== before[index].sha256)
        .map((entry: { path: string }) => entry.path),
    ).toEqual(runtime);
    current.policy.source_policy.files = before;
    expect(current).toEqual(baseline);
  });

  it("excludes the superseded B3-E draft catalogue from historical admission", () => {
    expect(GM_WAIT_CATALOGUE_RETAINED_SHA256).not.toContain(
      "2673baaca7f32711815f4fafb81dbc5c1bcc16394dc7412763d7f4e89f2eb4d4",
    );
  });

  it("keeps the pre-B3 production history verifier", () => {
    expect(canonicalAdmission.historyVerificationId).toMatch(
      /GM-WAIT-W2-CUSTODY-V1@2026-11-22T17:48:36\.869Z$/,
    );
  });
});

it("accepts the twelve installer mode changes and detects their negative twins", () => {
  const cwd = tempDir("b3-e-git-scope-");
  const git = (...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" });
  const commit = (message: string) =>
    git(
      "-c",
      "user.name=B3-E test",
      "-c",
      "user.email=b3-e@example.invalid",
      "commit",
      "-qm",
      message,
    );
  const other = "packages/operator/src/gm-wait-bind-bin.ts";
  const added = "packages/operator/src/extra-bin.ts";
  const contentTwin = installerBinPaths[0]!;
  const wrongModeTwin = installerBinPaths[1]!;
  const stagedTwin = installerBinPaths[2]!;
  const file = (path: string) => join(cwd, path);
  git("init", "-q");
  mkdirSync(file("packages/operator/src"), { recursive: true });
  for (const path of [...installerBinPaths, other]) {
    writeFileSync(file(path), "original\n", { mode: 0o644 });
  }
  git("add", "packages");
  commit("base");
  const base = git("rev-parse", "HEAD").trim();
  git("config", "core.fileMode", "false");
  const scope = () => b3EconomyGitScope(base, ["packages"], cwd);
  for (const path of installerBinPaths) chmodSync(file(path), installerBinMode);
  expect(scope()).toEqual({ committed: [], staged: [], worktree: [], untracked: [] });

  writeFileSync(file(contentTwin), "modified\n");
  chmodSync(file(wrongModeTwin), installerBinMode ^ 0o040);
  chmodSync(file(other), installerBinMode);
  writeFileSync(file(added), "new\n");
  git("update-index", "--chmod=+x", "--", stagedTwin);
  expect(
    scope()
      .worktree.map(({ path }) => path)
      .sort(),
  ).toEqual([contentTwin, wrongModeTwin, other].sort());
  expect(scope().untracked).toEqual([added]);
  expect(scope().staged).toEqual([
    { path: stagedTwin, oldMode: "100644", newMode: "100755", status: "M" },
  ]);
  commit("committed mode change");
  expect(scope().committed).toEqual([
    { path: stagedTwin, oldMode: "100644", newMode: "100755", status: "M" },
  ]);
});
