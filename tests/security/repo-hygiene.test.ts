import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Static config check (Bootstrap Plan §7.1 / §11.4): bootstrap carries placeholders only, no secrets.
const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\bsk-[A-Za-z0-9]{32,}\b/,
];

const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  {
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);

describe("repository hygiene", () => {
  it("has no committed environment files", () => {
    expect(files.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".example"))).toEqual([]);
  });

  it("has no obvious credential material in repository content", () => {
    for (const f of files) {
      if (f === "pnpm-lock.yaml" || f === import.meta.filename.replace(`${process.cwd()}/`, "")) {
        continue;
      }
      const text = readFileSync(f, "utf8");
      for (const p of SECRET_PATTERNS) expect(text, `${f} matches ${p}`).not.toMatch(p);
    }
  });
});
