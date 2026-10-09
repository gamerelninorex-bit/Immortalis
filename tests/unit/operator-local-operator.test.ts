import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultOperatorDir,
  ensureOperatorStateDirectory,
  judgeOperatorDirectory,
  verifyLocalOperator,
} from "@immortalis/operator";
import { tempDir } from "../support/tmp.ts";

const dir = (mode: number, uid = 1000, isDirectory = true) => ({ isDirectory, uid, mode });

describe("the local operator is the operating-system user who owns the chosen directory", () => {
  it("judges the campaign package: owned by the operator and not writable by group or other", () => {
    expect(judgeOperatorDirectory(dir(0o40700), 1000, "campaign")).toBeNull();
    expect(judgeOperatorDirectory(dir(0o40755), 1000, "campaign")).toBeNull();
    expect(judgeOperatorDirectory(dir(0o40775), 1000, "campaign")).toBe("WRITABLE_BY_OTHERS");
    expect(judgeOperatorDirectory(dir(0o40707), 1000, "campaign")).toBe("WRITABLE_BY_OTHERS");
    expect(judgeOperatorDirectory(dir(0o40700, 1001), 1000, "campaign")).toBe("FOREIGN_OWNER");
    expect(judgeOperatorDirectory(dir(0o40700, 0), 1000, "campaign")).toBe("FOREIGN_OWNER");
    expect(judgeOperatorDirectory(dir(0o100600, 1000, false), 1000, "campaign")).toBe(
      "NOT_A_DIRECTORY",
    );
  });

  it("judges the retained-intent directory: owned by the operator and closed to every other user", () => {
    expect(judgeOperatorDirectory(dir(0o40700), 1000, "operator-state")).toBeNull();
    for (const mode of [0o40750, 0o40705, 0o40755, 0o40770]) {
      expect(judgeOperatorDirectory(dir(mode), 1000, "operator-state")).toBe(
        "ACCESSIBLE_BY_OTHERS",
      );
    }
    expect(judgeOperatorDirectory(dir(0o40700, 1), 1000, "operator-state")).toBe("FOREIGN_OWNER");
  });

  it("verifies real directories for the invoking user", () => {
    const campaign = tempDir();
    expect(verifyLocalOperator(campaign, "campaign")).toMatchObject({
      ok: true,
      value: { kind: "os-user", uid: process.getuid!() },
    });
    chmodSync(campaign, 0o770);
    expect(verifyLocalOperator(campaign, "campaign")).toMatchObject({
      ok: false,
      error: { code: "WRITABLE_BY_OTHERS" },
    });
    const file = join(tempDir(), "f");
    writeFileSync(file, "");
    expect(verifyLocalOperator(file, "campaign")).toMatchObject({
      ok: false,
      error: { code: "NOT_A_DIRECTORY" },
    });
    expect(verifyLocalOperator(join(tempDir(), "missing"), "campaign")).toMatchObject({
      ok: false,
      error: { code: "UNREADABLE" },
    });
  });

  it("creates the retained-intent directory owner-only and never loosens or tightens an existing one", () => {
    const parent = tempDir();
    const created = join(parent, "a", "b");
    ensureOperatorStateDirectory(created);
    expect(verifyLocalOperator(created, "operator-state").ok).toBe(true);
    const loose = join(parent, "loose");
    mkdirSync(loose, { mode: 0o755 });
    chmodSync(loose, 0o755);
    ensureOperatorStateDirectory(loose);
    expect(verifyLocalOperator(loose, "operator-state")).toMatchObject({
      ok: false,
      error: { code: "ACCESSIBLE_BY_OTHERS" },
    });
  });

  it("keeps the retained intents beside, never inside, the campaign package", () => {
    expect(defaultOperatorDir("/x/saves/camp")).toBe("/x/saves/camp.operator");
    expect(defaultOperatorDir("/x/saves/camp/")).toBe("/x/saves/camp.operator");
  });
});
