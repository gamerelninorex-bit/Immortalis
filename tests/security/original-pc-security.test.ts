// Security and trust-boundary evidence for the Original Player-Character Authorship & Native First Activation slice. Static checks over the
// module's own source plus bounded behavioural checks through the real command. Local success is NOT provider/recovery acceptance
// (IA-07 BLOCKED); no remote authentication, human-presence proof or player identity namespace is implemented or claimed.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_STATEMENT_CHARS } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { headOf } from "../support/locality.ts";
import { WORDS, author, localityCampaign, scriptedConsole } from "../support/original-pc.ts";

const MODULE = "packages/operator/src/original-pc.ts";
const identifiers = (file: string): string =>
  code(file)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
const specifiers = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/from "([^"]+)"/g)].map((m) => m[1]!);

describe("the module cannot reach authority it was not given", () => {
  it("imports only node:crypto, the contracts and engine packages and its sibling operator modules: no fixture, testkit, protocol gateway or test support", () => {
    for (const s of specifiers(MODULE))
      expect(
        s === "node:crypto" ||
          s.startsWith("./") ||
          ["@immortalis/contracts", "@immortalis/engine"].includes(s),
        s,
      ).toBe(true);
    expect(code(MODULE)).not.toMatch(/SYNTH|FIXTURE|testkit|fixture/);
  });

  it("opens no network, process, dynamic-code or environment surface, and reads no clock or random value into an identity", () => {
    expect(identifiers(MODULE)).not.toMatch(
      /\bfetch\b|node:(?:http|https|net|tls|dgram|child_process|vm|worker_threads|cluster)|\beval\b|new Function|process\.env|\brequire\(|import\(|Date\.now|new Date|Math\.random|randomUUID|randomBytes/,
    );
  });

  it("names no role, permission or owner constant of its own: the player's authority is the contract's, never a caller's", () => {
    expect(identifiers(MODULE)).not.toMatch(
      /OWNER_|FACET_|\bfactKind\b|role\.archivist|permission\.canon\.write/,
    );
  });
});

describe("the console input is bounded and cannot restyle the console", () => {
  it("an oversized statement is refused three times and the character is left uncreated", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const big = "x".repeat(MAX_STATEMENT_CHARS + 1);
    const { result, terminal } = await author(dirs, scriptedConsole(big, big, big));
    expect(result.status).toBe("DECLINED");
    expect(terminal.said.filter((l) => l.startsWith("NOT ACCEPTED"))).toHaveLength(3);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("an escape sequence typed as a statement is refused, and what is shown back is JSON-quoted", async () => {
    const dirs = await localityCampaign();
    const { terminal } = await author(
      dirs,
      scriptedConsole(
        "\u001b[2J\u001b[Hfake",
        "\u001b[31mred",
        WORDS.identityFirst,
        WORDS.contact,
        "",
        WORDS.embodiment,
        WORDS.continuity,
        "",
        "",
        "",
        "no",
      ),
    );
    expect(terminal.said.some((l) => l.includes("control characters"))).toBe(true);
    for (const l of terminal.said) expect(l).not.toContain("\u001b");
  }, 60_000);
});
