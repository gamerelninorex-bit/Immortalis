import { createHash } from "node:crypto";
import { atMergedB2, IF6B_SHARED_DELTAS } from "../support/if6b-scoped-delta.ts";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { describe, expect, it } from "vitest";
import { IF6B_BASE_COMMIT, IF6B_PACKAGE_PATHS } from "../support/if6b-scoped-delta.ts";

const gitLines = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);

describe("IF-6b independent draft scope", () => {
  it("adds only the prospective owner witness module and census over merged B2", () => {
    const roots = [
      "apps",
      "packages",
      ".github",
      "tools",
      "spec",
      "package.json",
      "pnpm-lock.yaml",
    ];
    const delta = [
      ...gitLines(
        "-c",
        "core.fileMode=false",
        "diff",
        "--name-only",
        IF6B_BASE_COMMIT,
        "--",
        ...roots,
      ),
      ...gitLines("ls-files", "--others", "--exclude-standard", "--", ...roots),
    ];
    expect(delta.sort()).toEqual([...IF6B_PACKAGE_PATHS].sort());
  });
  it("keeps the exact B2 registry, providers, extension fence and deny policy", () => {
    const readCatalogue = (digest: string) =>
      JSON.parse(
        readFileSync(`packages/engine/gm-wait-catalogue/manifests/${digest}.json`, "utf8"),
      );
    const baseline = readCatalogue(
      "7707ff8ec86a9564dae2b026e730386f26fadfd4011c2934d0cc19dd5a6f09ed",
    );
    const current = readCatalogue(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    for (const field of ["rules", "providers", "extension_dispatch", "event_triggers", "sites"])
      expect(current[field], field).toEqual(baseline[field]);
    const kindIndex = baseline.kinds.findIndex(
      (kind: { id: string }) => kind.id === "resolution_transaction",
    );
    expect(kindIndex).toBeGreaterThanOrEqual(0);
    expect(current.kinds[kindIndex].value_schema_fp).not.toBe(
      baseline.kinds[kindIndex].value_schema_fp,
    );
    expect(current.kinds).toEqual(
      baseline.kinds.map((kind: { id: string }, i: number) =>
        i === kindIndex ? { ...kind, value_schema_fp: current.kinds[i].value_schema_fp } : kind,
      ),
    );
    const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    for (const [path, pins] of Object.entries(IF6B_SHARED_DELTAS)) {
      expect(hash(atMergedB2(path)), path).toBe(pins.base);
      expect(hash(readFileSync(path)), path).toBe(pins.head);
    }
    expect(current.policy).toMatchObject({
      evaluator: baseline.policy.evaluator,
      historical_verification: baseline.policy.historical_verification,
      live_admission: baseline.policy.live_admission,
    });
  });
});
