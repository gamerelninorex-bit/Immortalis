import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";

const made: string[] = [];

/** Registers a fresh temp directory that is removed after the test file finishes. */
export function tempDir(prefix = "immortalis-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  made.push(dir);
  return dir;
}

afterAll(() => {
  for (const d of made.splice(0)) rmSync(d, { recursive: true, force: true });
});

export function copyDir(from: string): string {
  const to = tempDir("immortalis-copy-");
  cpSync(from, to, { recursive: true });
  return to;
}

/** name -> content for every file in a package directory (flat layout). */
export function snapshotDir(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir)
      .sort()
      .map((f) => [f, readFileSync(join(dir, f), "utf8")]),
  );
}
