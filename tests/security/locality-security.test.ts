// Trust boundary of the confirmed locality admission: the owner-only package and state directories, the one-time confirmation bound to
// its verb and exact subject, and the absence of any network, process or ambient-authority surface in the new module.
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { establish, freshDirs, setupDoc, writeSetup } from "../support/locality.ts";
import { scriptedTerminal } from "../support/operator.ts";

describe("the directories the command creates are closed to everyone else", () => {
  it("the new campaign package and the retained-intent directory are owner-only", async () => {
    const dirs = freshDirs();
    const { result } = await establish(dirs, writeSetup(setupDoc()));
    expect(result.status).toBe("LOCALITY_READY");
    expect(statSync(dirs.campaignDir).mode & 0o077).toBe(0);
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
  }, 60_000);
});

describe("the confirmation is a one-time token for exactly what was shown", () => {
  const ask = async (subject: string) => {
    const t = scriptedTerminal("confirm");
    const token = await requestOperatorConfirmation(t, "establish-locality", subject, ["shown"]);
    return token!;
  };

  it("cannot be consumed by another verb, another subject, or twice", async () => {
    const subject = subjectOf({ verb: "establish-locality", setup_id: "a" });
    const token = await ask(subject);
    expect(consumeConfirmation(token, "relocate", subject)).toBe(false);
    expect(consumeConfirmation(token, "establish-locality", subjectOf({ setup_id: "b" }))).toBe(
      false,
    );
    expect(consumeConfirmation(token, "establish-locality", subject)).toBe(true);
    expect(consumeConfirmation(token, "establish-locality", subject)).toBe(false);
  });

  it("cannot be forged by a caller", () => {
    const subject = subjectOf({ any: "thing" });
    const forged = Object.freeze({ verb: "establish-locality" as const, subject });
    expect(consumeConfirmation(forged, "establish-locality", subject)).toBe(false);
  });

  it("is never satisfied by a line typed before the challenge existed or by the end of input", async () => {
    const t = scriptedTerminal("eof");
    expect(await requestOperatorConfirmation(t, "establish-locality", "s", [])).toBeNull();
    const stale = scriptedTerminal("stale");
    expect(await requestOperatorConfirmation(stale, "establish-locality", "s", [])).toBeNull();
  });
});

describe("the new module has no ambient authority", () => {
  const src = code("packages/operator/src/locality.ts");
  it("reaches no network, child process, environment or global state", () => {
    expect(src).not.toMatch(
      /node:(http|https|net|dgram|child_process|worker_threads|vm)|\bfetch\(|process\.env|globalThis|eval\(|new Function/,
    );
  });
  it("the setup it reads is never written back, and it prints only through the operator's console", () => {
    expect(src).not.toMatch(/writeFileSync|appendFileSync|console\.|process\.stdout/);
    expect(readFileSync("packages/operator/src/locality.ts", "utf8")).toContain("O_NOFOLLOW");
  });
});
