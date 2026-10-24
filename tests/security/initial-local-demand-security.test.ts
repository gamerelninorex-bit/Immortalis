// Trust boundary of the initial local demand admission: the module has no ambient authority; its confirmation is a one-time token for
// exactly the verb and the two acts shown; the full proposal reaches only the operator's own console and the owner-verified package —
// never the retained-state directory, and no host-facing surface imports it, names it, or can create, list or search demands,
// Production operations or Economy facts. It is unavailable during live in-character play. No model, MCP client or command-line flag can
// attest the human choice, supply an output, a satisfaction or a realized access, or write the Economy, Production or World-State owners.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXIT,
  consumeConfirmation,
  requestOperatorConfirmation,
  runCli,
  subjectOf,
} from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { scriptedTerminal } from "../support/operator.ts";
import {
  DEMAND_ID,
  RESERVE_ID,
  addDemand,
  bindPlayer,
  demandArgs,
  demandDoc,
  headOf,
  scenarioCampaign,
  writeDemand,
} from "../support/initial-local-demand.ts";

const SRC = "packages/operator/src/initial-local-demand.ts";

describe("the module has no ambient authority", () => {
  const src = code(SRC);
  it("reaches no network, child process, environment or global state", () => {
    expect(src).not.toMatch(
      /node:(http|https|net|dgram|child_process|worker_threads|vm)|\bfetch\(|process\.env|globalThis|eval\(|new Function/,
    );
  });
  it("the file it reads is never written back, and it prints only through the operator's console", () => {
    expect(src).not.toMatch(/writeFileSync|appendFileSync|console\.|process\.stdout/);
    expect(readFileSync(SRC, "utf8")).toContain("O_NOFOLLOW");
  });
  it("writes the operator's campaign only through the two existing owner operations (the scratch copy aside)", () => {
    expect(src).toContain("issueDemand(");
    expect(src).toContain("startOperation(");
    // the dry run opens a COPY of the package's committed files in a private scratch directory; the operator's campaign is never given
    // any other publication
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishInitialLocalDemandParams)/,
      "",
    );
    expect(live).not.toBe(src);
    const body = live.replace(/import[\s\S]*?from\s+"[^"]+";/g, "");
    expect(live).not.toMatch(
      /\.(establishWorld|establishLocus|establishSourceCondition|establishLedger|instantiateCohort|establishReserve|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor|establishCanonicalTime|registerObject|advance)\(/,
    );
    expect(body).not.toMatch(
      /store\.commit\(|\.commit\(|CanonicalCampaign\.create|mkdtempSync|copyFileSync/,
    );
    // the scratch copy never reaches the campaign directory for writing
    const dry = src.slice(
      src.indexOf("async function dryRun"),
      src.indexOf("export interface Estab"),
    );
    expect(dry).toContain("mkdtempSync(join(tmpdir()");
    expect(dry).toContain("rmSync(scratch");
    expect(dry).not.toMatch(
      /copyFileSync\(\s*join\(copy|copyFileSync\([^)]*campaignDir\s*,\s*join\(params/,
    );
  });
  it("authors no owner, facet, authority, role or permission of its own, and never a completion, an acceptance, a realization or a verdict", () => {
    expect(src).not.toMatch(
      /CANON_WRITE_AUTHORITY|role\.archivist|permission\.canon|factKind|OWNER_|FACET_/,
    );
    expect(src).not.toMatch(
      /productionCompletionKey|worldFallbackEntityKey|DurableCompletionEnvelope|FallbackPhysicalEntity|EconomyRealizationSchema|deriveRealization|ECONOMY_OPERATION_REALIZE_ACCESS|worldAcceptanceStage|realized_access/,
    );
    // the only Economy realization name it holds is the key it READS to learn that setup is closed
    expect(src.match(/economyRealizationKey\(/g)).toHaveLength(1);
  });
});

describe("no host-facing surface can create, list or search demands, operations or Economy facts", () => {
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
    it(`${file} does not import or name the demand command`, () => {
      const text = readFileSync(join("packages/operator/src", file), "utf8");
      expect(text).not.toMatch(
        /initial-local-demand|establishInitialLocalDemand|establish-local-demand|issueDemand|startOperation|EconomyAdapter|ProductionAdapter/,
      );
    });

  it("no protocol or host package names the command or the Economy and Production owner operations", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const f of walk("packages/protocol/src").filter((x) => x.endsWith(".ts")))
      expect(readFileSync(f, "utf8"), f).not.toMatch(
        /issueDemand|startOperation|establish-local-demand|establishInitialLocalDemand/,
      );
  });
});

describe("the confirmation is a one-time token for exactly what was shown", () => {
  const ask = async (subject: string) => {
    const t = scriptedTerminal("confirm");
    return (await requestOperatorConfirmation(t, "establish-local-demand", subject, ["shown"]))!;
  };

  it("cannot be consumed by another verb (including the Population's, the Reserve's and the locality's), another proposal, or twice", async () => {
    const subject = subjectOf({ verb: "establish-local-demand", demand_id: "a" });
    const token = await ask(subject);
    for (const other of [
      "establish-population",
      "establish-reserve",
      "establish-locality",
      "establish-timed-governance",
      "establish-additional-source",
      "observe-surroundings",
    ] as const)
      expect(consumeConfirmation(token, other, subject), other).toBe(false);
    expect(
      consumeConfirmation(token, "establish-local-demand", subjectOf({ demand_id: "b" })),
    ).toBe(false);
    expect(consumeConfirmation(token, "establish-local-demand", subject)).toBe(true);
    expect(consumeConfirmation(token, "establish-local-demand", subject)).toBe(false);
  });

  it("another verb's token cannot stand for it", async () => {
    const subject = subjectOf({ verb: "establish-local-demand", demand_id: "a" });
    const t = scriptedTerminal("confirm");
    const other = (await requestOperatorConfirmation(t, "establish-population", subject, []))!;
    expect(consumeConfirmation(other, "establish-local-demand", subject)).toBe(false);
  });

  it("is never satisfied by a pre-typed line or the end of input", async () => {
    expect(
      await requestOperatorConfirmation(scriptedTerminal("eof"), "establish-local-demand", "s", []),
    ).toBeNull();
    expect(
      await requestOperatorConfirmation(
        scriptedTerminal("stale"),
        "establish-local-demand",
        "s",
        [],
      ),
    ).toBeNull();
  });

  it("no command-line flag can attest the confirmation, a role, an owner, a status, an output or a result", async () => {
    // in-process: the argument parser refuses an unknown option before any package, file or console is touched
    const dirs = await scenarioCampaign();
    const head = await headOf(dirs.campaignDir);
    for (const flag of [
      "--confirm",
      "--yes",
      "--role",
      "--owner",
      "--status",
      "--force",
      "--output",
      "--satisfied",
      "--priority",
      "--time",
    ]) {
      const out: string[] = [];
      const exit = await runCli([...demandArgs(dirs, writeDemand(demandDoc())), flag, "x"], {
        out: (line) => out.push(line),
      });
      expect(exit, flag).toBe(EXIT.USAGE);
      expect(out.join("\n"), flag).not.toContain("LOCAL_DEMAND_READY");
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("the command is unavailable during live in-character play", () => {
  it("a bound player character refuses it, with no prompt and no write, whatever the document", async () => {
    const dirs = await scenarioCampaign();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, writeDemand(demandDoc()), []);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("the authored process reaches the operator's console and the package only", () => {
  it("the retained-state directory and the exchange directories hold none of the process's content", async () => {
    const dirs = await scenarioCampaign();
    const { result } = await addDemand(dirs, writeDemand(demandDoc()));
    expect(result.status).toBe("LOCAL_DEMAND_READY");
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(dirs.operatorDir);
    expect(files.some((f) => /referee|exchange|observe|player-view/i.test(f))).toBe(false);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const secret of [DEMAND_ID, RESERVE_ID, "cured-salt", "dry-cured"])
        expect(text, `${f} must not hold ${secret}`).not.toContain(secret);
    }
  }, 60_000);

  it("an authored identifier cannot carry a raw control sequence to the console: it is refused before anything is shown", async () => {
    const dirs = await scenarioCampaign();
    const hostile = demandDoc();
    hostile.production.transformation.output_condition = "dry\u001b[2J";
    const { result, terminal } = await addDemand(dirs, writeDemand(hostile), []);
    expect(result.status).toBe("INVALID_PROCESS");
    expect(terminal.asked()).toBe(0);
    const ok = await addDemand(dirs, writeDemand(demandDoc()), ["decline"]);
    // eslint-disable-next-line no-control-regex -- the point of the check is that no control character is printed
    expect(ok.terminal.said.join("\n")).not.toMatch(/\u001b/);
  }, 120_000);

  it("the scratch directory the owner-path check uses is removed, and holds no lock or journal beyond the command", async () => {
    const dirs = await scenarioCampaign();
    const { readdirSync: ls } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const scratchNames = () =>
      ls(tmpdir()).filter((n) => n.startsWith("immortalis-initial-local-demand-dry-run-"));
    const before = scratchNames();
    expect((await addDemand(dirs, writeDemand(demandDoc()))).result.status).toBe(
      "LOCAL_DEMAND_READY",
    );
    expect(scratchNames()).toEqual(before);
  }, 120_000);
});
