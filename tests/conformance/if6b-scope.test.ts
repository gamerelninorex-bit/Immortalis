import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { IF6B_BASE_COMMIT, IF6B_PACKAGE_PATHS } from "../support/if6b-scoped-delta.ts";

const gitLines = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);

describe("IF-6b independent draft scope", () => {
  it("adds exactly the prospective owner witness module over merged B2, with no installation or workflow edit", () => {
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
    expect(delta).toEqual(IF6B_PACKAGE_PATHS);
  });
});
