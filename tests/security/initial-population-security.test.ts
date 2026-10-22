// Trust boundary of the initial Population admission: the module has no ambient authority; its confirmation is a one-time token for
// exactly the verb and the proposal shown; the full proposal (ledger, units, places and Cohort) reaches only the operator's own console
// and the owner-verified package — never the retained-state directory, and no host-facing surface imports it, names it, or can create,
// list or search Populations or Cohorts. No model, MCP client or command-line flag can attest the human choice.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { scriptedTerminal } from "../support/operator.ts";
import { runShipped } from "../support/locality.ts";
import {
  COHORT_ID,
  LEDGER_ID,
  PLACE_FIELDS,
  PLACE_QUAY,
  addPopulation,
  populationArgs,
  populationDoc,
  timedCampaign,
  writePopulation,
} from "../support/initial-population.ts";

const SRC = "packages/operator/src/initial-population.ts";

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
  it("writes the operator's campaign only through the two existing Population owner operations (the scratch check aside)", () => {
    expect(src).toContain("establishLedger(");
    expect(src).toContain("instantiateCohort(");
    // the scratch package of the dry run republishes the committed world and locus to prove the owner path admits the population; the
    // operator's campaign is never given any other publication
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishInitialPopulationParams)/,
      "",
    );
    expect(live).not.toBe(src);
    expect(live).not.toMatch(
      /\.(establishWorld|establishLocus|establishSourceCondition|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor|establishCanonicalTime|registerObject|advance)\(/,
    );
    expect(live).not.toMatch(/store\.commit\(|\.commit\(|CanonicalCampaign\.create/);
    // exactly the two owner operations are called on the live campaign's adapter
    expect(live.match(/\.(establish|instantiate)[A-Za-z]+\(/g)?.sort()).toEqual([
      ".establishLedger(",
      ".instantiateCohort(",
    ]);
  });
  it("authors no owner, facet, authority, role or permission of its own, and never a close, a result or a reconciliation", () => {
    expect(src).not.toMatch(
      /CANON_WRITE_AUTHORITY|role\.archivist|permission\.canon|factKind|OWNER_|FACET_/,
    );
    expect(src).not.toMatch(
      /populationStageProvider|populationCloseKey|ReconciliationClose|ConsequenceEnvelope|populationReconcile|composeCohortResult|applyEnvelopes/,
    );
  });
});

describe("no host-facing surface can create, list or search Populations or Cohorts", () => {
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
    it(`${file} does not import or name the population command`, () => {
      const text = readFileSync(join("packages/operator/src", file), "utf8");
      expect(text).not.toMatch(
        /initial-population|establishInitialPopulation|establish-population|establishLedger|instantiateCohort|PopulationAdapter/,
      );
    });

  it("no protocol or host package names the command or the Population owner operations", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const f of walk("packages/protocol/src").filter((x) => x.endsWith(".ts")))
      expect(readFileSync(f, "utf8"), f).not.toMatch(
        /establishLedger|instantiateCohort|establish-population|establishInitialPopulation/,
      );
  });
});

describe("the confirmation is a one-time token for exactly what was shown", () => {
  const ask = async (subject: string) => {
    const t = scriptedTerminal("confirm");
    return (await requestOperatorConfirmation(t, "establish-population", subject, ["shown"]))!;
  };

  it("cannot be consumed by another verb (including the Reserve's, the locality's and the source's), another proposal, or twice", async () => {
    const subject = subjectOf({ verb: "establish-population", ledger_id: "a" });
    const token = await ask(subject);
    for (const other of [
      "establish-reserve",
      "establish-locality",
      "establish-additional-source",
      "establish-additional-locality",
      "observe-surroundings",
    ] as const)
      expect(consumeConfirmation(token, other, subject), other).toBe(false);
    expect(consumeConfirmation(token, "establish-population", subjectOf({ ledger_id: "b" }))).toBe(
      false,
    );
    expect(consumeConfirmation(token, "establish-population", subject)).toBe(true);
    expect(consumeConfirmation(token, "establish-population", subject)).toBe(false);
  });

  it("another verb's token cannot stand for it", async () => {
    const subject = subjectOf({ verb: "establish-population", ledger_id: "a" });
    const t = scriptedTerminal("confirm");
    const other = (await requestOperatorConfirmation(t, "establish-reserve", subject, []))!;
    expect(consumeConfirmation(other, "establish-population", subject)).toBe(false);
  });

  it("is never satisfied by a pre-typed line or the end of input", async () => {
    expect(
      await requestOperatorConfirmation(scriptedTerminal("eof"), "establish-population", "s", []),
    ).toBeNull();
    expect(
      await requestOperatorConfirmation(scriptedTerminal("stale"), "establish-population", "s", []),
    ).toBeNull();
  });

  it("no command-line flag can attest the confirmation, a role, an owner, a status or a result", async () => {
    const dirs = await timedCampaign();
    for (const flag of [
      "--confirm",
      "--yes",
      "--role",
      "--owner",
      "--status",
      "--force",
      "--count",
      "--members",
    ]) {
      const run = await runShipped([
        ...populationArgs(dirs, writePopulation(populationDoc())),
        flag,
        "x",
      ]);
      expect(run.code, flag).toBe(64);
    }
  }, 60_000);
});

describe("the authored population reaches the operator's console and the package only", () => {
  it("the retained-state directory and the exchange directories hold none of the population's content", async () => {
    const dirs = await timedCampaign();
    const { result } = await addPopulation(dirs, writePopulation(populationDoc()));
    expect(result.status).toBe("POPULATION_READY");
    expect(statSync(dirs.operatorDir).mode & 0o077).toBe(0);
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    const files = walk(dirs.operatorDir);
    expect(files.some((f) => /referee|exchange|observe|player-view/i.test(f))).toBe(false);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const secret of [LEDGER_ID, COHORT_ID, "unit-04", PLACE_QUAY, PLACE_FIELDS])
        expect(text, `${f} must not hold ${secret}`).not.toContain(secret);
    }
  }, 60_000);

  it("an authored identifier cannot carry a raw control sequence to the console: it is refused before anything is shown", async () => {
    const dirs = await timedCampaign();
    const hostile = populationDoc();
    hostile.ledger.units[0].presence = "quay\u001b[2J";
    const { result, terminal } = await addPopulation(dirs, writePopulation(hostile), []);
    expect(result.status).toBe("INVALID_POPULATION");
    expect(terminal.asked()).toBe(0);
    const ok = await addPopulation(dirs, writePopulation(populationDoc()), ["decline"]);
    // eslint-disable-next-line no-control-regex -- the point of the check is that no control character is printed
    expect(ok.terminal.said.join("\n")).not.toMatch(/\u001b/);
  });
});
