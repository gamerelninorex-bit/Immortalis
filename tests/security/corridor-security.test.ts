// Trust boundary of the source-qualified local corridor admission: the module has no ambient authority; its confirmation is a one-time
// token for exactly the verb and the connection shown; the authored connection reaches only the operator's own console and the
// owner-verified package — never the retained-state directory, and no host-facing surface imports it or can create, list or search a
// corridor. The corridor is World-State's own fact: no other owner, including Logistics and a test requester, can write one.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { scriptedTerminal } from "../support/operator.ts";
import {
  CORRIDOR_STATEMENT_TEXT,
  NEW_LOCUS_ID,
  addCorridor,
  corridorDoc,
  twoLociCampaign,
  writeCorridor,
} from "../support/corridor.ts";

describe("the module has no ambient authority", () => {
  const src = code("packages/operator/src/corridor.ts");
  it("reaches no network, child process, environment or global state", () => {
    expect(src).not.toMatch(
      /node:(http|https|net|dgram|child_process|worker_threads|vm)|\bfetch\(|process\.env|globalThis|eval\(|new Function/,
    );
  });
  it("the file it reads is never written back, and it prints only through the operator's console", () => {
    expect(src).not.toMatch(/writeFileSync|appendFileSync|console\.|process\.stdout/);
    expect(readFileSync("packages/operator/src/corridor.ts", "utf8")).toContain("O_NOFOLLOW");
  });
  it("writes the operator's campaign only through the existing World-State corridor owner operation (the scratch check aside)", () => {
    expect(src).toContain("establishCorridor(");
    // the scratch package of the dry run republishes the committed world and loci to prove the owner path admits the corridor; the
    // operator's campaign is never given any other publication
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishCorridorParams)/,
      "",
    );
    expect(live).not.toBe(src);
    expect(live).not.toMatch(
      /\.(establishWorld|establishLocus|establishSourceCondition|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor)\(/,
    );
    expect(live).not.toMatch(/store\.commit\(|\.commit\(/);
    expect(live.match(/\.establish[A-Za-z]+\(/g)).toEqual([".establishCorridor("]);
  });
});

describe("no host-facing surface can create, list or search corridors", () => {
  for (const file of [
    "referee-mcp.ts",
    "referee-exchange.ts",
    "referee-session.ts",
    "player-view-mcp.ts",
    "player-view.ts",
    "observe-request-mcp.ts",
    "advance-request-mcp.ts",
    "observation.ts",
  ])
    it(`${file} does not import or name the corridor command or fact`, () => {
      const text = readFileSync(join("packages/operator/src", file), "utf8");
      expect(text).not.toMatch(/corridor|Corridor/);
    });
  // The one opt-in corridor-QUALIFIED confirmed relocation gateway (and the index that re-exports it) is the only host-facing surface that
  // names a corridor. It lets the trusted side bind one exact corridor key and refuses unless it is the committed connection; it never
  // creates, lists, searches or authors one, and its host request is the operation name alone.
  const QUALIFIED = new Set([
    "pc-corridor-relocation.ts",
    "index.ts",
    "protocol-corridor-relocation.ts",
  ]);
  it("no protocol or contract surface that a host sees names a corridor, but the one opt-in qualified relocation gateway, which never creates, lists or searches one", () => {
    for (const file of readdirSync("packages/protocol/src")) {
      const text = readFileSync(join("packages/protocol/src", file), "utf8");
      if (QUALIFIED.has(file)) {
        expect(text, file).not.toMatch(
          /establishCorridor|\.corridor\(|listFacts|startsWith\(|corridors\b/,
        );
        continue;
      }
      expect(text, file).not.toMatch(/corridor|Corridor/);
    }
    for (const file of readdirSync("packages/contracts/src").filter((f) =>
      /^(protocol|presentation|projection|referee)/.test(f),
    )) {
      const text = readFileSync(join("packages/contracts/src", file), "utf8");
      if (QUALIFIED.has(file)) {
        expect(text, file).not.toMatch(/establishCorridor|EstablishCorridor|corridorOfInput/);
        continue;
      }
      expect(text, file).not.toMatch(/corridor|Corridor/);
    }
  });
});

describe("the confirmation is a one-time token for exactly what was shown", () => {
  const ask = async (subject: string) => {
    const t = scriptedTerminal("confirm");
    return (await requestOperatorConfirmation(t, "establish-corridor", subject, ["shown"]))!;
  };

  it("cannot be consumed by another verb (including the locality's), another proposal, or twice", async () => {
    const subject = subjectOf({ verb: "establish-corridor", corridor_id: "a" });
    const token = await ask(subject);
    expect(consumeConfirmation(token, "establish-locality", subject)).toBe(false);
    expect(consumeConfirmation(token, "establish-additional-locality", subject)).toBe(false);
    expect(consumeConfirmation(token, "observe-surroundings", subject)).toBe(false);
    expect(consumeConfirmation(token, "establish-corridor", subjectOf({ corridor_id: "b" }))).toBe(
      false,
    );
    expect(consumeConfirmation(token, "establish-corridor", subject)).toBe(true);
    expect(consumeConfirmation(token, "establish-corridor", subject)).toBe(false);
  });

  it("is never satisfied by a pre-typed line or the end of input", async () => {
    expect(
      await requestOperatorConfirmation(scriptedTerminal("eof"), "establish-corridor", "s", []),
    ).toBeNull();
    expect(
      await requestOperatorConfirmation(scriptedTerminal("stale"), "establish-corridor", "s", []),
    ).toBeNull();
  });
});

describe("the authored connection reaches the operator's console and the package only", () => {
  it("the retained-state directory and the exchange directories hold none of its content", async () => {
    const dirs = await twoLociCampaign();
    const { result } = await addCorridor(dirs, writeCorridor(corridorDoc()));
    expect(result.status).toBe("CORRIDOR_READY");
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(dirs.operatorDir);
    expect(files.some((f) => /referee|exchange|observe|player-view/i.test(f))).toBe(false);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const secret of [NEW_LOCUS_ID, CORRIDOR_STATEMENT_TEXT, "corridor"])
        expect(text, `${f} must not hold ${secret}`).not.toContain(secret);
    }
  }, 60_000);
});
