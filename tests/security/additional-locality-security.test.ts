// Trust boundary of the additional pre-play locality admission: the module has no ambient authority; its confirmation is a one-time
// token for exactly the verb and the proposal shown; the full proposal (quantity, material, keys, statements) reaches only the operator's
// own console and the owner-verified package — never the retained-state directory, and no host-facing surface imports it.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { scriptedTerminal } from "../support/operator.ts";
import {
  NEW_ACCESS,
  NEW_CONSTRAINT,
  NEW_DESIGNATION,
  NEW_LOCUS_ID,
  NEW_SOURCE_KEY,
  addLocality,
  localityCampaign,
  localityDoc,
  writeLocality,
} from "../support/additional-locality.ts";

describe("the module has no ambient authority", () => {
  const src = code("packages/operator/src/additional-locality.ts");
  it("reaches no network, child process, environment or global state", () => {
    expect(src).not.toMatch(
      /node:(http|https|net|dgram|child_process|worker_threads|vm)|\bfetch\(|process\.env|globalThis|eval\(|new Function/,
    );
  });
  it("the file it reads is never written back, and it prints only through the operator's console", () => {
    expect(src).not.toMatch(/writeFileSync|appendFileSync|console\.|process\.stdout/);
    expect(readFileSync("packages/operator/src/additional-locality.ts", "utf8")).toContain(
      "O_NOFOLLOW",
    );
  });
  it("writes the operator's campaign only through the existing World-State locus and source owner operations (the scratch check aside)", () => {
    expect(src).toContain("establishLocus(");
    expect(src).toContain("establishSourceCondition(");
    // the scratch package of the dry run republishes the committed world to prove the owner path admits the locus and source; the
    // operator's campaign is never given any other publication
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishAdditionalLocalityParams)/,
      "",
    );
    expect(live).not.toBe(src);
    expect(live).not.toMatch(
      /\.(establishWorld|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor)\(/,
    );
    expect(live).not.toMatch(/store\.commit\(|\.commit\(/);
    // exactly the two owner operations are called on the live campaign
    expect(live.match(/\.establish[A-Za-z]+\(/g)?.sort()).toEqual([
      ".establishLocus(",
      ".establishSourceCondition(",
    ]);
  });
});

describe("no host-facing surface can create, list or search loci or sources", () => {
  for (const file of [
    "referee-mcp.ts",
    "referee-exchange.ts",
    "referee-session.ts",
    "player-view-mcp.ts",
    "observe-request-mcp.ts",
    "advance-request-mcp.ts",
  ])
    it(`${file} does not import or name the additional-locality command`, () => {
      const text = readFileSync(join("packages/operator/src", file), "utf8");
      expect(text).not.toMatch(
        /additional-locality|establishAdditionalLocality|AdditionalLocality/,
      );
    });
});

describe("the confirmation is a one-time token for exactly what was shown", () => {
  const ask = async (subject: string) => {
    const t = scriptedTerminal("confirm");
    return (await requestOperatorConfirmation(t, "establish-additional-locality", subject, [
      "shown",
    ]))!;
  };

  it("cannot be consumed by another verb (including the locality's and the source's), another proposal, or twice", async () => {
    const subject = subjectOf({ verb: "establish-additional-locality", additional_id: "a" });
    const token = await ask(subject);
    expect(consumeConfirmation(token, "establish-locality", subject)).toBe(false);
    expect(consumeConfirmation(token, "establish-additional-source", subject)).toBe(false);
    expect(consumeConfirmation(token, "observe-surroundings", subject)).toBe(false);
    expect(
      consumeConfirmation(
        token,
        "establish-additional-locality",
        subjectOf({ additional_id: "b" }),
      ),
    ).toBe(false);
    expect(consumeConfirmation(token, "establish-additional-locality", subject)).toBe(true);
    expect(consumeConfirmation(token, "establish-additional-locality", subject)).toBe(false);
  });

  it("is never satisfied by a pre-typed line or the end of input", async () => {
    expect(
      await requestOperatorConfirmation(
        scriptedTerminal("eof"),
        "establish-additional-locality",
        "s",
        [],
      ),
    ).toBeNull();
    expect(
      await requestOperatorConfirmation(
        scriptedTerminal("stale"),
        "establish-additional-locality",
        "s",
        [],
      ),
    ).toBeNull();
  });
});

describe("the authored proposal reaches the operator's console and the package only", () => {
  it("the retained-state directory and the exchange directories hold none of its content", async () => {
    const dirs = await localityCampaign();
    const { result } = await addLocality(dirs, writeLocality(localityDoc()));
    expect(result.status).toBe("ADDITIONAL_LOCALITY_READY");
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(dirs.operatorDir);
    expect(files.some((f) => /referee|exchange|observe|player-view/i.test(f))).toBe(false);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const secret of [
        NEW_SOURCE_KEY,
        NEW_LOCUS_ID,
        "blue-clay",
        NEW_DESIGNATION,
        NEW_CONSTRAINT.statement,
        NEW_ACCESS.statement,
        "30 basket",
      ])
        expect(text, `${f} must not hold ${secret}`).not.toContain(secret);
    }
  }, 60_000);
});
