// Trust boundary of the additional pre-play finite source admission: the module has no ambient authority; its confirmation is a
// one-time token for exactly the verb and the source shown; the full source (quantity, material, key, statement) reaches only the
// operator's own console and the owner-verified package — never the retained-state directory, and no host-facing surface imports it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { scriptedTerminal } from "../support/operator.ts";
import {
  SECOND_ACCESS,
  SECOND_KEY,
  addSource,
  localityCampaign,
  sourceDoc,
  writeSource,
} from "../support/additional-source.ts";

describe("the module has no ambient authority", () => {
  const src = code("packages/operator/src/additional-source.ts");
  it("reaches no network, child process, environment or global state", () => {
    expect(src).not.toMatch(
      /node:(http|https|net|dgram|child_process|worker_threads|vm)|\bfetch\(|process\.env|globalThis|eval\(|new Function/,
    );
  });
  it("the source it reads is never written back, and it prints only through the operator's console", () => {
    expect(src).not.toMatch(/writeFileSync|appendFileSync|console\.|process\.stdout/);
    expect(readFileSync("packages/operator/src/additional-source.ts", "utf8")).toContain(
      "O_NOFOLLOW",
    );
  });
  it("writes the operator's campaign only through the existing World-State source owner operation (the scratch check aside)", () => {
    expect(src).toContain("establishSourceCondition(");
    // the scratch package of the dry run republishes the committed world and locus to prove the owner path admits the source; the
    // operator's campaign is never given any other publication
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishAdditionalSourceParams)/,
      "",
    );
    expect(live).not.toBe(src);
    expect(live).not.toMatch(
      /\.(establishWorld|establishLocus|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor)\(/,
    );
    expect(live).not.toMatch(/store\.commit\(|\.commit\(/);
  });
});

describe("no host-facing surface can create, list or search sources", () => {
  for (const file of [
    "referee-mcp.ts",
    "referee-exchange.ts",
    "referee-session.ts",
    "player-view-mcp.ts",
    "observe-request-mcp.ts",
    "advance-request-mcp.ts",
  ])
    it(`${file} does not import or name the additional-source command`, () => {
      const text = readFileSync(join("packages/operator/src", file), "utf8");
      expect(text).not.toMatch(/additional-source|establishAdditionalSource|AdditionalSource/);
    });
});

describe("the confirmation is a one-time token for exactly what was shown", () => {
  const ask = async (subject: string) => {
    const t = scriptedTerminal("confirm");
    return (await requestOperatorConfirmation(t, "establish-additional-source", subject, [
      "shown",
    ]))!;
  };

  it("cannot be consumed by another verb (including the locality's), another source, or twice", async () => {
    const subject = subjectOf({ verb: "establish-additional-source", source_id: "a" });
    const token = await ask(subject);
    expect(consumeConfirmation(token, "establish-locality", subject)).toBe(false);
    expect(consumeConfirmation(token, "observe-surroundings", subject)).toBe(false);
    expect(
      consumeConfirmation(token, "establish-additional-source", subjectOf({ source_id: "b" })),
    ).toBe(false);
    expect(consumeConfirmation(token, "establish-additional-source", subject)).toBe(true);
    expect(consumeConfirmation(token, "establish-additional-source", subject)).toBe(false);
  });

  it("is never satisfied by a pre-typed line or the end of input", async () => {
    expect(
      await requestOperatorConfirmation(
        scriptedTerminal("eof"),
        "establish-additional-source",
        "s",
        [],
      ),
    ).toBeNull();
    expect(
      await requestOperatorConfirmation(
        scriptedTerminal("stale"),
        "establish-additional-source",
        "s",
        [],
      ),
    ).toBeNull();
  });
});

describe("the authored source reaches the operator's console and the package only", () => {
  it("the retained-state directory and the exchange directories hold none of the source's content", async () => {
    const dirs = await localityCampaign();
    const { result } = await addSource(dirs, writeSource(sourceDoc()));
    expect(result.status).toBe("ADDITIONAL_SOURCE_READY");
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(dirs.operatorDir);
    expect(files.some((f) => /referee|exchange|observe|player-view/i.test(f))).toBe(false);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const secret of [SECOND_KEY, "grey-salt", SECOND_ACCESS.statement, "45"])
        expect(text, `${f} must not hold ${secret}`).not.toContain(secret);
    }
  }, 60_000);
});
