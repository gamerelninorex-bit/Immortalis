import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements and poke saved packages */
// Crash / retry / reopen for the original active-PC qualified physical-locus custody (BLUE v5.1). The physical-placement decision (the
// referee's create-only provenance) and the custody (World-State's create-only fact) are two owners' separate publications, so an
// interruption between them leaves a bound character with a retained decision and NO physical locus; it is reported as exactly that, the
// same command resumes without re-refereeing or double placing, and a custody whose reply was lost is recognised by its identity. Every
// rerun must land on the campaign an uninterrupted run produces. The scripted host is a policy the test wrote (plumbing only).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAYER_CHARACTER_BINDING_KEY, worldPcLocusCustodyKey } from "@immortalis/contracts";
import { CanonicalCampaign, RefereeAdjudicationAdapter, nodeFs } from "@immortalis/engine";
import { instrumentFs } from "@immortalis/testkit";
import { headOf, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { CAMPAIGN, PC_ID, runAuthor, shapeOf } from "../support/original-pc.ts";
import {
  boundCampaign,
  establishLocus,
  locusArgs,
  locusConsole,
} from "../support/original-pc-locus.ts";

afterEach(() => vi.restoreAllMocks());

const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is what is restored. */
function crashedHolder(campaignDir: string): void {
  const lock = join(campaignDir, "LOCK");
  if (existsSync(lock))
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: CAMPAIGN })}\n`);
}

const unknown = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;

function loseReply(proto: object, op: string, commit: boolean) {
  const original = (proto as any)[op] as (...a: unknown[]) => Promise<unknown>;
  vi.spyOn(proto as any, op).mockImplementation(async function (this: object, ...args: unknown[]) {
    if (commit) await original.apply(this, args);
    return unknown;
  });
}

async function reference() {
  const dirs = await boundCampaign();
  const { result } = await establishLocus(dirs, locusConsole());
  expect(result.status).toBe("LOCUS_ESTABLISHED");
  return shapeOf(dirs);
}

const custodyCount = async (dirs: LocalityDirs) => {
  // a killed process leaves its lock behind with a dead holder; reading what it left means taking that over explicitly
  const opened = await CanonicalCampaign.open(dirs.campaignDir, {
    buildId: "locus-recovery-reader",
    reclaimStaleLock: true,
  });
  if (!opened.ok) throw new Error(`did not open: ${JSON.stringify(opened.error)}`);
  const c = opened.value;
  try {
    return c.store.listFacts().filter((f) => f.key === worldPcLocusCustodyKey(PC_ID)).length;
  } finally {
    await c.close();
  }
};

describe("a lost acknowledgement at each of the two owner commits converges on the uninterrupted campaign", () => {
  const cases = [
    [
      CanonicalCampaign.prototype,
      "establishOriginalPcPhysicalLocusCustody",
      true,
      "the custody landed but its reply was lost (after the ambiguous commit)",
      1,
    ],
    [
      CanonicalCampaign.prototype,
      "establishOriginalPcPhysicalLocusCustody",
      false,
      "the custody never reached the store (after qualification, before the physical commit)",
      0,
    ],
    [
      RefereeAdjudicationAdapter.prototype,
      "recordPhysical",
      true,
      "the physical-placement evidence landed but its reply was lost",
      0,
    ],
    [
      RefereeAdjudicationAdapter.prototype,
      "recordPhysical",
      false,
      "the physical-placement evidence never reached the store (before qualification is retained)",
      0,
    ],
  ] as const;
  for (const [proto, op, commit, name, custody] of cases) {
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = await boundCampaign();
        loseReply(proto, op, commit);
        const first = await establishLocus(dirs, locusConsole());
        expect(first.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
        vi.restoreAllMocks();
        expect(await custodyCount(dirs)).toBe(custody);
        crashedHolder(dirs.campaignDir);
        const again = await establishLocus(dirs, locusConsole(), { reclaimStaleLock: true });
        expect(again.result.status).toBe("LOCUS_ESTABLISHED");
        expect(await shapeOf(dirs)).toEqual(expected);
        expect(await custodyCount(dirs)).toBe(1);
        const campaign = await openOrdinary(dirs.campaignDir);
        expect(campaign.pcPhysicalLocusCustody(PC_ID)!.fact.version).toBe(1);
        expect(campaign.verify()).toEqual([]);
        await campaign.close();
      },
      120_000,
    );
  }

  it("a custody whose reply was lost is found by its identity on the next run: nothing is asked, nothing is written", async () => {
    const dirs = await boundCampaign();
    loseReply(CanonicalCampaign.prototype, "establishOriginalPcPhysicalLocusCustody", true);
    const first = await establishLocus(dirs, locusConsole());
    expect(first.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    const head = await headOf(dirs.campaignDir);
    crashedHolder(dirs.campaignDir);
    const again = await establishLocus(dirs, locusConsole(), { reclaimStaleLock: true }, null);
    expect(again.result.status).toBe("LOCUS_ESTABLISHED");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("an unexpected failure after the qualification is an unknown outcome, never a clean success or refusal", async () => {
    const dirs = await boundCampaign();
    vi.spyOn(
      CanonicalCampaign.prototype as any,
      "establishOriginalPcPhysicalLocusCustody",
    ).mockRejectedValue(new Error("boom"));
    const first = await establishLocus(dirs, locusConsole());
    expect(first.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const again = await establishLocus(dirs, locusConsole(), { reclaimStaleLock: true });
    expect(again.result.status).toBe("LOCUS_ESTABLISHED");
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same command again", async () => {
    const expected = await reference();

    const probeDirs = await boundCampaign();
    const probe = instrumentFs(nodeFs);
    const probed = await establishLocus(probeDirs, locusConsole(), { campaignFs: probe.fs });
    expect(probed.result.status).toBe("LOCUS_ESTABLISHED");
    const total = probe.count();
    expect(total).toBeGreaterThan(2);

    for (let n = 1; n <= total; n++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await boundCampaign();
        const { fs } = instrumentFs(nodeFs, { failAt: n, when });
        const first = await establishLocus(dirs, locusConsole(), { campaignFs: fs });
        crashedHolder(dirs.campaignDir);
        const again = await establishLocus(dirs, locusConsole(), { reclaimStaleLock: true });
        expect(again.result.status, `${when} op ${n}`).toBe("LOCUS_ESTABLISHED");
        // a command that had already reported the custody (the fault was in releasing the lock) asks and writes nothing more
        if (first.result.status === "LOCUS_ESTABLISHED") expect(again.terminal.asked()).toBe(0);
        expect(await shapeOf(dirs), `${when} op ${n}`).toEqual(expected);
      }
    }
  }, 900_000);
});

describe("the shipped binary as a real process: kill at each interruption point, then run again", () => {
  const phrase = (said: readonly string[]): string => {
    for (let i = said.length - 1; i >= 0; i--) {
      const m = /type exactly "(establish-character-locus [0-9a-f]{12})"/.exec(said[i]!);
      if (m) return m[1]!;
    }
    throw new Error("no confirmation phrase was printed");
  };

  it("end to end in one process; a second, separate process reads the persisted custody; an ordinary open verifies it", async () => {
    const dirs = await boundCampaign();
    const run = await runAuthor(locusArgs(dirs), [phrase], { host: { dirs } });
    expect(run.stderr).toBe("");
    expect(run.code).toBe(0);
    expect(run.stdout).toContain("STATUS LOCUS_ESTABLISHED");
    expect(run.stdout).toContain("PROGRESS referee DECIDED");
    expect(run.stdout).toContain("PROGRESS physical locus COMMITTED");
    const second = await runAuthor(locusArgs(dirs), [], { host: null });
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("STATUS LOCUS_ESTABLISHED");
    const c = await openOrdinary(dirs.campaignDir);
    expect(c.verify()).toEqual([]);
    expect(c.pcPhysicalLocusCustody(PC_ID)?.value.basis.established_from).toBe("ACTIVATION");
    await c.close();
  }, 180_000);

  for (const [name, killAfter, held] of [
    [
      "after qualification (the decision is retained) but before the physical commit",
      /PROGRESS referee DECIDED/,
      false,
    ],
    [
      "right after the physical commit, before the report and the fresh reopen",
      /PROGRESS physical locus COMMITTED/,
      true,
    ],
  ] as const)
    it(`killed ${name}: the same command converges and writes nothing twice`, async () => {
      const expected = await reference();
      const dirs = await boundCampaign();
      const killed = await runAuthor(locusArgs(dirs), [phrase], { host: { dirs }, killAfter });
      expect(killed.signal).toBe("SIGKILL");
      expect(await custodyCount(dirs)).toBe(held ? 1 : 0);
      // a killed process leaves its lock behind with a dead holder
      crashedHolder(dirs.campaignDir);
      const again = await runAuthor(locusArgs(dirs, ["--reclaim-stale-lock"]), [phrase], {
        host: { dirs },
      });
      expect(again.stdout).toContain("STATUS LOCUS_ESTABLISHED");
      expect(await shapeOf(dirs)).toEqual(expected);
      expect(await custodyCount(dirs)).toBe(1);
      const decisions = (await openOrdinary(dirs.campaignDir)).store
        .listFacts()
        .filter((f) => (f.value as any).operation === "IR_PHYSICAL_PLACEMENT");
      expect(decisions).toHaveLength(1);
    }, 180_000);
});

describe("load fails closed on a corrupted saved custody", { timeout: 300_000 }, () => {
  async function saved(): Promise<string> {
    const dirs = await boundCampaign();
    await establishLocus(dirs, locusConsole());
    return dirs.campaignDir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { buildId: "tamper-test" });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };
  const tamper = async (edit: (j: any) => void) => {
    const dir = await saved();
    const p = join(dir, stateFile(dir));
    const j = legacyStateFixture(p);
    edit(j);
    writeFileSync(p, JSON.stringify(j));
    return openOutcome(dir);
  };
  const custody = (j: any) => j.facts.find((f: any) => f.key === worldPcLocusCustodyKey(PC_ID));

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  it("an edit of the saved custody record — identity, locus, pins, qualifying decisions, basis, rule, extras — is not silently normalized", async () => {
    const edits: Record<string, (f: any) => void> = {
      "PC identity moved": (f) => (f.value.pc_id = "pc-other"),
      "locus moved": (f) => (f.value.stationary_locus.locus.entity_id = "locus-x"),
      "world moved": (f) => (f.value.stationary_locus.world.entity_id = "world-x"),
      "contract pin moved": (f) => (f.value.basis.pinned_versions.pc = 2),
      "binding pin moved": (f) => (f.value.basis.pinned_versions.binding = 2),
      "world pin moved": (f) => (f.value.basis.pinned_versions.world = 0),
      "locus pin moved": (f) => (f.value.basis.pinned_versions.locus = 2),
      "native decision swapped for the physical one": (f) =>
        (f.value.basis.qualified_by.native = f.value.basis.qualified_by.physical),
      "physical decision swapped for the native one": (f) =>
        (f.value.basis.qualified_by.physical = f.value.basis.qualified_by.native),
      "decision version moved": (f) => (f.value.basis.qualified_by.physical.version = 2),
      "basis re-labelled as the handover": (f) =>
        (f.value.basis.established_from = "EXISTING_ACTOR_HANDOVER"),
      "a coupling smuggled in": (f) => (f.value.basis.pinned_versions.coupling = 1),
      "custodian changed": (f) => (f.value.custodian.owner = "logistics"),
      "a movement smuggled in": (f) => (f.value.movement = { to: "locus-x" }),
      "owner changed": (f) => (f.owner = "logistics"),
      "version changed": (f) => (f.version = 2),
      "rule changed": (f) => (f.provenance.rule.clause = "something else"),
      "handover rule substituted (the exclusive citation is the original-activation one)": (f) => {
        f.provenance.rule.authority_lineage = f.provenance.rule.authority_lineage.slice(0, 2);
      },
    };
    for (const [name, edit] of Object.entries(edits)) {
      expect(await tamper((j) => edit(custody(j))), name).not.toBe("OK");
    }
  }, 300_000);

  it("an edit of what the custody rests on — the physical decision's answer or verdict, the binding, the contract — is not accepted", async () => {
    const decision = (j: any, op: string) => j.facts.find((f: any) => f.value?.operation === op);
    const edits: Record<string, (j: any) => void> = {
      "physical verdict flipped to eligible after the answer said otherwise": (j) =>
        (decision(j, "IR_PHYSICAL_PLACEMENT").value.decision.embodiment.mode = "INCORPOREAL"),
      "physical verdict edited": (j) =>
        (decision(j, "IR_PHYSICAL_PLACEMENT").value.verdict = "NOT_PHYSICAL_SINGLE_LOCUS"),
      "physical statement edited": (j) =>
        (decision(j, "IR_PHYSICAL_PLACEMENT").value.input.statement = "I stand elsewhere."),
      "native decision removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.value?.operation !== "IR_NATIVE_COMPATIBILITY")),
      "physical decision removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.value?.operation !== "IR_PHYSICAL_PLACEMENT")),
      "binding removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== PLAYER_CHARACTER_BINDING_KEY)),
      "binding statement edited": (j) => {
        const b = j.facts.find((f: any) => f.value?.binding_slot === "role.player_character");
        b.value.transition.basis.statement = "I stand elsewhere.";
      },
    };
    for (const [name, edit] of Object.entries(edits)) {
      expect(await tamper(edit), name).not.toBe("OK");
    }
  }, 300_000);

  it("removing the saved custody while keeping the journal fails, as does a second record under another identity", async () => {
    expect(
      await tamper(
        (j) => (j.facts = j.facts.filter((f: any) => f.key !== worldPcLocusCustodyKey(PC_ID))),
      ),
    ).not.toBe("OK");
    expect(
      await tamper((j) => {
        const copy = structuredClone(custody(j));
        copy.key = worldPcLocusCustodyKey("pc-other");
        copy.value.pc_id = "pc-other";
        j.facts.push(copy);
      }),
    ).not.toBe("OK");
  });

  it("a journal edit of the custody's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain('"established_from":"ACTIVATION"');
    const edited = text.replace(
      '"established_from":"ACTIVATION"',
      '"established_from":"ACTIVATIOM"',
    );
    expect(edited).not.toBe(text);
    writeFileSync(journal, edited);
    expect(await openOutcome(dir)).not.toBe("OK");
  });
});
