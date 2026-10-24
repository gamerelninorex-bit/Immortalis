/* eslint-disable @typescript-eslint/no-explicit-any -- tests record raw commit groups */
// Trust boundary of the initial timed governance admission: the module has no ambient authority; outside its throwaway dry run it writes
// the operator's campaign only through the four existing GIP owner operations, and it has no clock, advance, expiry, lifecycle or
// stage-provider surface of any kind; its confirmation is a one-time token for exactly the verb and the proposal shown; the full proposal
// reaches only the operator's own console and the owner-verified package — never the retained-state directory, and no host-facing surface
// imports it, names it, or can create, list or search GIP state. No model, MCP client or command-line flag can attest the human choice.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EXIT,
  LocalOperatorSession,
  consumeConfirmation,
  requestOperatorConfirmation,
  runCli,
  subjectOf,
} from "@immortalis/operator";
import { code } from "../support/f027.ts";
import { scriptedTerminal } from "../support/operator.ts";
import {
  INSTITUTION_ID,
  INSTRUMENT_ID,
  addGovernance,
  governanceArgs,
  governanceDoc,
  timedCampaign,
  writeGovernance,
} from "../support/initial-timed-governance.ts";

const SRC = "packages/operator/src/initial-timed-governance.ts";

afterEach(() => vi.restoreAllMocks());

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
  it("writes the operator's campaign only through the four existing GIP owner operations (the scratch check aside)", () => {
    expect(src).toContain("establishInstitution(");
    expect(src).toContain("establishOffice(");
    expect(src).toContain("establishScopeBinding(");
    expect(src).toContain("establishSunsetInstrument(");
    // the throwaway package of the dry run receives the campaign's canonical time through the Temporal owner's own ordinary route and the
    // four records through the same owner operations; the operator's campaign is never given any other publication
    const live = src.replace(
      /async function dryRun[\s\S]*?\n}\n(?=\s*export interface EstablishInitialTimedGovernanceParams)/,
      "",
    );
    expect(live).not.toBe(src);
    expect(live).not.toMatch(
      /\.(establishWorld|establishLocus|establishSourceCondition|establishGovernanceInstrument|completeSunsetEnrollment|releasePlayerCharacter|bindPlayerCharacter|handoverExistingActor|coupleExistingActor|establishCanonicalTime|registerObject|advance|continueRemainder)\(/,
    );
    expect(live).not.toMatch(/store\.commit\(|\.commit\(|CanonicalCampaign\.create/);
    expect(live.replace(/import[\s\S]*?from\s+"[^"]+";/g, "")).not.toMatch(
      /TemporalCoordinator|StageProviderRegistry/,
    );
    // exactly the four owner operations are called on the live campaign's adapter
    expect(live.match(/\.(establish|complete)[A-Za-z]+\(/g)?.sort()).toEqual([
      ".establishInstitution(",
      ".establishOffice(",
      ".establishScopeBinding(",
      ".establishSunsetInstrument(",
    ]);
    // and the scratch check's time is the only place a coordinator appears
    expect(src.match(/new TemporalCoordinator\(/g)).toHaveLength(1);
    expect(src.match(/\.establishCanonicalTime\(/g)).toHaveLength(1);
  });
  it("authors no owner, facet, authority, role or permission of its own", () => {
    expect(src).not.toMatch(
      /CANON_WRITE_AUTHORITY|role\.archivist|permission\.canon|permission\.player|factKind|OWNER_|FACET_/,
    );
  });
  it("has no advance, expiry, lifecycle write, stage provider or clock — time and lifecycle are only READ or DERIVED for comparison", () => {
    expect(src).not.toMatch(
      /gipSunsetExpiryProvider|deriveSunsetExpiry|GIP_OPERATION_EXPIRE_AT_SUNSET|gipSunsetStage\(|StageProvider\b|barrier|continueRemainder|\.advance\(|resolveStage|Date\.now|new Date\(|setTimeout|setInterval|performance\.now/,
    );
    // lifecycle appears only as the authored `active` premise it refuses to depart from, and `expired` is never written
    expect(src).not.toMatch(/["']expired["']|lifecycle_status\s*[:=]\s*["'](?!active)/);
    // the only read of canonical time is the committed state, compared with the authored time
    expect(src.match(/getFact\(TEMPORAL_STATE_KEY\)/g)).toHaveLength(1);
    expect(src).toContain("timeEquals(");
  });
});

describe("at run time the live campaign receives exactly five commits, none of them the operator's own owner write", () => {
  it("records every group the live session commits: four GIP groups, then the Temporal owner's registration — no time, transaction, lifecycle or foreign write", async () => {
    const dirs = await timedCampaign();
    const groups: any[] = [];
    const open = LocalOperatorSession.open;
    vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
      const opened = await open.call(LocalOperatorSession, p);
      if (opened.ok) {
        const store = opened.value.campaign.store;
        const commit = store.commit.bind(store);
        vi.spyOn(store, "commit").mockImplementation(async (g: any) => {
          groups.push(structuredClone(g));
          return commit(g);
        });
      }
      return opened;
    });
    const { result } = await addGovernance(dirs, writeGovernance(governanceDoc()));
    expect(result.status).toBe("GOVERNANCE_READY");
    expect(groups.map((g) => g.owner)).toEqual(["gip", "gip", "gip", "gip", "temporal_kernel"]);
    const keys = groups.flatMap((g) => g.writes.map((w: any) => w.key as string));
    expect(keys).toEqual([
      `gip/institution/${INSTITUTION_ID}/identity`,
      expect.stringMatching(/^gip\/institution\/[^/]+\/office\/[^/]+$/),
      expect.stringMatching(/\/scope-binding\//),
      `gip/instrument/${INSTRUMENT_ID}`,
      "gip/sunset-enrollment",
      `temporal/object/obj-gip-sunset-${INSTRUMENT_ID}`,
      "temporal/boundary-index",
    ]);
    // never the canonical time, a transaction, a stage, a second version of anything, or a lifecycle other than the authored one
    for (const g of groups)
      for (const w of g.writes) {
        expect(w.key).not.toBe("temporal/state");
        expect(w.key).not.toMatch(/^temporal\/transaction/);
        if (w.key.startsWith("gip/instrument/")) {
          expect(w.expected_version).toBe(0);
          expect(w.value.lifecycle_status).toBe("active");
        }
      }
  }, 120_000);
});

describe("no host-facing surface can create, list or search GIP state", () => {
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
    it(`${file} does not import or name the governance command`, () => {
      const text = readFileSync(join("packages/operator/src", file), "utf8");
      expect(text).not.toMatch(
        /initial-timed-governance|establishInitialTimedGovernance|establish-timed-governance|establishSunsetInstrument|establishInstitution|establishOffice|establishScopeBinding|GipAdapter/,
      );
    });

  it("no protocol or host package names the command or the GIP establishment operations", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
      );
    for (const f of walk("packages/protocol/src").filter((x) => x.endsWith(".ts")))
      expect(readFileSync(f, "utf8"), f).not.toMatch(
        /establishSunsetInstrument|establishInstitution|establishOffice|establishScopeBinding|establish-timed-governance|establishInitialTimedGovernance/,
      );
  });
});

describe("the confirmation is a one-time token for exactly what was shown", () => {
  const ask = async (subject: string) => {
    const t = scriptedTerminal("confirm");
    return (await requestOperatorConfirmation(t, "establish-timed-governance", subject, [
      "shown",
    ]))!;
  };

  it("cannot be consumed by another verb, another proposal, or twice", async () => {
    const subject = subjectOf({ verb: "establish-timed-governance", governance_id: "a" });
    const token = await ask(subject);
    for (const other of [
      "establish-population",
      "establish-reserve",
      "establish-locality",
      "establish-additional-source",
      "establish-additional-locality",
      "observe-surroundings",
      "advance",
    ] as const)
      expect(consumeConfirmation(token, other, subject), other).toBe(false);
    expect(
      consumeConfirmation(token, "establish-timed-governance", subjectOf({ governance_id: "b" })),
    ).toBe(false);
    expect(consumeConfirmation(token, "establish-timed-governance", subject)).toBe(true);
    expect(consumeConfirmation(token, "establish-timed-governance", subject)).toBe(false);
  });

  it("another verb's token cannot stand for it, in particular not an advance's", async () => {
    const subject = subjectOf({ verb: "establish-timed-governance", governance_id: "a" });
    for (const verb of ["establish-population", "advance", "null-advance"] as const) {
      const t = scriptedTerminal("confirm");
      const other = (await requestOperatorConfirmation(t, verb, subject, []))!;
      expect(consumeConfirmation(other, "establish-timed-governance", subject), verb).toBe(false);
    }
  });

  it("is never satisfied by a pre-typed line or the end of input", async () => {
    expect(
      await requestOperatorConfirmation(
        scriptedTerminal("eof"),
        "establish-timed-governance",
        "s",
        [],
      ),
    ).toBeNull();
    expect(
      await requestOperatorConfirmation(
        scriptedTerminal("stale"),
        "establish-timed-governance",
        "s",
        [],
      ),
    ).toBeNull();
  });

  it("no command-line flag can attest the confirmation, a role, an owner, a status, a time or a result", async () => {
    // in-process: the argument parser refuses an unknown option before any package, file or console is touched
    const dirs = await timedCampaign();
    for (const flag of [
      "--confirm",
      "--yes",
      "--role",
      "--owner",
      "--status",
      "--force",
      "--now",
      "--advance",
      "--expire",
      "--sunset",
      "--lifecycle",
      "--target",
    ]) {
      const out: string[] = [];
      const exit = await runCli(
        [...governanceArgs(dirs, writeGovernance(governanceDoc())), flag, "x"],
        {
          out: (line) => out.push(line),
        },
      );
      expect(exit, flag).toBe(EXIT.USAGE);
      expect(out.join("\n"), flag).not.toContain("GOVERNANCE_READY");
    }
  });
});

describe("the authored opening reaches the operator's console and the package only", () => {
  it("the retained-state directory and the exchange directories hold none of the governance content", async () => {
    const dirs = await timedCampaign();
    const { result } = await addGovernance(dirs, writeGovernance(governanceDoc()));
    expect(result.status).toBe("GOVERNANCE_READY");
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
        INSTITUTION_ID,
        INSTRUMENT_ID,
        "holder-ref-warden-seat",
        "Moot of the Salt",
      ])
        expect(text, `${f} must not hold ${secret}`).not.toContain(secret);
    }
  }, 60_000);

  it("a raw control sequence in any authored text is refused before anything is shown, and never reaches the console", async () => {
    const dirs = await timedCampaign();
    const hostile = governanceDoc();
    hostile.office.removal_rule = "Removable\u001b[2J by the moot.";
    const { result, terminal } = await addGovernance(dirs, writeGovernance(hostile), []);
    expect(result.status).toBe("INVALID_GOVERNANCE");
    expect(terminal.asked()).toBe(0);
    const ok = await addGovernance(dirs, writeGovernance(governanceDoc()), ["decline"]);
    // eslint-disable-next-line no-control-regex -- the point of the check is that no control character is printed
    expect(ok.terminal.said.join("\n")).not.toMatch(/\u001b/);
    // the shown text is JSON-quoted: an authored quote or backslash cannot break out of its line
    const quoting = governanceDoc();
    quoting.institution.identity_label = 'The "Moot" \\ of the pans';
    const shown = await addGovernance(dirs, writeGovernance(quoting), ["decline"]);
    expect(shown.terminal.said.join("\n")).toContain('label: "The \\"Moot\\" \\\\ of the pans"');
  });
});
