import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { tempDir } from "../support/tmp.ts";

const child = (dir: string, kind: string, action: string, cut?: string) => {
  const run = spawnSync(
    process.execPath,
    [
      "--disable-warning=ExperimentalWarning",
      "--experimental-strip-types",
      "tests/support/rp1-restart-child.ts",
      dir,
      kind,
      action,
      ...(cut ? [cut] : []),
    ],
    { encoding: "utf8" },
  );
  expect(run.signal, run.stderr).toBe(cut ? "SIGKILL" : null);
  if (!cut) expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout) as { result: unknown; counts: Record<string, number> };
};

it.each(["advance", "observe"])(
  "resumes the original %s credential after the binding process dies",
  (kind) => {
    const dir = tempDir("rp1-host-restart-");
    const operator = join(dir, "operator");
    mkdirSync(operator, { mode: 0o700 });
    expect(child(dir, kind, "bind", "publish").result).toBe("interrupted");
    const exchange = join(operator, readdirSync(operator)[0]!);
    const path = join(exchange, "host-a.secret");
    const original = readFileSync(path);
    const inode = statSync(path).ino;
    expect(child(dir, kind, "bind").result).toBe("bound");
    expect(readFileSync(path).equals(original)).toBe(true);
    expect(statSync(path).ino).toBe(inode);
    expect(child(dir, kind, "authorize").result).toBe("pc-a");
    expect(child(dir, kind, "bind").result).toBe("HOST_EXISTS");
  },
  30_000,
);

it.each([
  ["pending", "new"],
  ["goal", "COMMITTING"],
  ["route", "I steady the branch."],
])(
  "reopens a whole %s record after a process dies at replacement",
  (kind, readback) => {
    const dir = tempDir("rp1-record-restart-");
    expect(child(dir, kind, "prepare").result).toBe(true);
    expect(child(dir, kind, "write", "publish").result).toBe("interrupted");
    expect(child(dir, kind, "read").result).toBe(readback);
    expect(child(dir, kind, "write").result).toBe(true);
  },
  30_000,
);

it.each(["pending", "route"])(
  "retries %s removal after a process dies at unlink",
  (kind) => {
    const dir = tempDir("rp1-removal-restart-");
    expect(child(dir, kind, "prepare").result).toBe(true);
    expect(child(dir, kind, "remove", "remove").result).toBe("interrupted");
    expect(child(dir, kind, "read").result).toBe("NONE");
    const retry = child(dir, kind, "remove");
    expect(retry.result).toBe(true);
    expect(retry.counts.sync).toBe(1);
  },
  30_000,
);
