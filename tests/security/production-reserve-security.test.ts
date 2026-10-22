// Trust boundary of the initial Production Reserve admission: the module has no ambient authority; its confirmation is a one-time token
// for exactly the verb and the Reserve shown; the full Reserve (identifier, material, quantity, condition, location) reaches only the
// operator's own console and the owner-verified package — never the retained-state directory, and no host-facing surface imports it,
// names it, or can create, list or search Reserves. No model, MCP client or command-line flag can attest the human choice.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { scriptedTerminal } from "../support/operator.ts";
import { runShipped } from "../support/locality.ts";
import {
  RESERVE_CONDITION,
  RESERVE_ID,
  RESERVE_MATERIAL,
  addReserve,
  localityCampaign,
  reserveArgs,
  reserveDoc,
  writeReserve,
} from "../support/production-reserve.ts";

describe("the module has no ambient authority", () => {
  const src = code("packages/operator/src/production-reserve.ts");
  it("reaches no network, child process, environment or global state", () => {
    expect(src).not.toMatch(
      /node:(http|https|net|dgram|child_process|worker_threads|vm)|\bfetch\(|process\.env|globalThis|eval\(|new Function/,
    );
  });
  it("the Reserve file it reads is never written back, and it prints only through the operator's console", () => {
    expect(src).not.toMatch(/writeFileSync|appendFileSync|console\.|process\.stdout/);
    expect(readFileSync("packages/operator/src/production-reserve.ts", "utf8")).toContain(
      "O_NOFOLLOW",
    );
  });
  it("writes the operator's campaign only through the existing Production Reserve owner operation (the scratch check aside)", () => {
    expect(src).toContain("establishReserve(");
    // the scratch package of the dry run republishes the committed world and locus to prove the owner path admits the Reserve; the
    // operator's campaign is never given any other publication
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishProductionReserveParams)/,
      "",
    );
    expect(live).not.toBe(src);
    expect(live).not.toMatch(
      /\.(establishWorld|establishLocus|establishSourceCondition|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor|startOperation|startExtraction|establishBasis)\(/,
    );
    expect(live).not.toMatch(/store\.commit\(|\.commit\(|CanonicalCampaign\.create/);
    expect(live.match(/\.establish[A-Za-z]+\(/g)).toEqual([".establishReserve("]);
    // never a source delta, a delivery, an inflow, a consumption or a claim
    expect(src).not.toMatch(
      /SourceDrawdownAdapter|production_source_delta|world_source_delivery|inflows:|consumed:\s*\[\s*\{|startOperation|startExtraction/,
    );
  });
  it("authors no owner, facet, authority, role or permission of its own", () => {
    expect(src).not.toMatch(
      /CANON_WRITE_AUTHORITY|role\.archivist|permission\.canon|factKind|OWNER_|FACET_/,
    );
  });
});

describe("no host-facing surface can create, list or search Reserves", () => {
  for (const file of [
    "referee-mcp.ts",
    "referee-exchange.ts",
    "referee-session.ts",
    "player-view-mcp.ts",
    "player-view-exchange.ts",
    "player-view.ts",
    "observe-request-mcp.ts",
    "observe-request-exchange.ts",
    "advance-request-mcp.ts",
    "advance-request-exchange.ts",
  ])
    it(`${file} does not import or name the Reserve command`, () => {
      const text = readFileSync(join("packages/operator/src", file), "utf8");
      expect(text).not.toMatch(
        /production-reserve|establishProductionReserve|ProductionReserve|establish-reserve|establishReserve/,
      );
    });

  it("no protocol or host package names the command or the Production Reserve owner operation", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const f of walk("packages/protocol/src").filter((x) => x.endsWith(".ts")))
      expect(readFileSync(f, "utf8"), f).not.toMatch(
        /establishReserve|establish-reserve|establishProductionReserve/,
      );
  });
});

describe("the confirmation is a one-time token for exactly what was shown", () => {
  const ask = async (subject: string) => {
    const t = scriptedTerminal("confirm");
    return (await requestOperatorConfirmation(t, "establish-reserve", subject, ["shown"]))!;
  };

  it("cannot be consumed by another verb (including the locality's and the source's), another Reserve, or twice", async () => {
    const subject = subjectOf({ verb: "establish-reserve", reserve_id: "a" });
    const token = await ask(subject);
    expect(consumeConfirmation(token, "establish-locality", subject)).toBe(false);
    expect(consumeConfirmation(token, "establish-additional-source", subject)).toBe(false);
    expect(consumeConfirmation(token, "establish-additional-locality", subject)).toBe(false);
    expect(consumeConfirmation(token, "observe-surroundings", subject)).toBe(false);
    expect(consumeConfirmation(token, "establish-reserve", subjectOf({ reserve_id: "b" }))).toBe(
      false,
    );
    expect(consumeConfirmation(token, "establish-reserve", subject)).toBe(true);
    expect(consumeConfirmation(token, "establish-reserve", subject)).toBe(false);
  });

  it("another verb's token cannot stand for it", async () => {
    const subject = subjectOf({ verb: "establish-reserve", reserve_id: "a" });
    const t = scriptedTerminal("confirm");
    const other = (await requestOperatorConfirmation(
      t,
      "establish-additional-source",
      subject,
      [],
    ))!;
    expect(consumeConfirmation(other, "establish-reserve", subject)).toBe(false);
  });

  it("is never satisfied by a pre-typed line or the end of input", async () => {
    expect(
      await requestOperatorConfirmation(scriptedTerminal("eof"), "establish-reserve", "s", []),
    ).toBeNull();
    expect(
      await requestOperatorConfirmation(scriptedTerminal("stale"), "establish-reserve", "s", []),
    ).toBeNull();
  });

  it("no command-line flag can attest the confirmation, a role, an owner or a status", async () => {
    const dirs = await localityCampaign();
    for (const flag of ["--confirm", "--yes", "--role", "--owner", "--status", "--force"]) {
      const run = await runShipped([...reserveArgs(dirs, writeReserve(reserveDoc())), flag, "x"]);
      expect(run.code, flag).toBe(64);
    }
  });
});

describe("the authored Reserve reaches the operator's console and the package only", () => {
  it("the retained-state directory and the exchange directories hold none of the Reserve's content", async () => {
    const dirs = await localityCampaign();
    const { result } = await addReserve(dirs, writeReserve(reserveDoc()));
    expect(result.status).toBe("RESERVE_READY");
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(dirs.operatorDir);
    expect(files.some((f) => /referee|exchange|observe|player-view/i.test(f))).toBe(false);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const secret of [RESERVE_ID, RESERVE_MATERIAL, RESERVE_CONDITION, "dry-stacked"])
        expect(text, `${f} must not hold ${secret}`).not.toContain(secret);
    }
  }, 60_000);

  it("the console shows the authored text with no raw control sequence (an identifier cannot carry one)", async () => {
    const dirs = await localityCampaign();
    const hostile = reserveDoc({ condition: "dry\u001b[2J" });
    const { result, terminal } = await addReserve(dirs, writeReserve(hostile), []);
    expect(result.status).toBe("INVALID_RESERVE");
    expect(terminal.asked()).toBe(0);
    const ok = await addReserve(dirs, writeReserve(reserveDoc()), ["decline"]);
    // eslint-disable-next-line no-control-regex -- the point of the check is that no control character is printed
    expect(ok.terminal.said.join("\n")).not.toMatch(/\u001b/);
  });
});
