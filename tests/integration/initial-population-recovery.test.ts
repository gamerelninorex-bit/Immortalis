/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap store operations to simulate lost acknowledgements */
// Crash / retry for the initial local Population and residency Cohort (RC-16). The crash matrix: before the ledger, after the ledger but
// before the Cohort, after the Cohort but before the reply, after the close but before the readback, an incompatible replay, and an
// uncertain store outcome — plus a real SIGKILL of the shipped binary at each durable cut and a failure before AND after EVERY mutating
// filesystem operation of the whole command. Each case reopens and re-presents the SAME confirmed proposal, which must land on exactly the
// campaign an uninterrupted run produces — never a second, altered or substituted ledger or Cohort, never a Cohort without its ledger,
// never a duplicated unit, and never a success claimed before the owner-verified readback of both.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { populationCohortKey, populationLedgerKey } from "@immortalis/contracts";
import { CanonicalCampaign, PopulationAdapter, nodeFs } from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { instrumentFs } from "@immortalis/testkit";
import {
  COHORT_ID,
  LEDGER_ID,
  LOCALITY_CAMPAIGN,
  PLACE_QUAY,
  addPopulation,
  bindPlayer,
  closeObject,
  cohortDoc,
  engageClose,
  headOf,
  held,
  openOrdinary,
  openWitness,
  populationArgs,
  populationDoc,
  timedCampaign,
  writePopulation,
} from "../support/initial-population.ts";
import { runShipped } from "../support/locality.ts";

afterEach(() => vi.restoreAllMocks());

/** A process id that provably belongs to no running process: what the lock of a crashed process names. */
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is what is restored. */
function crashedHolder(campaignDir: string): void {
  const lock = join(campaignDir, "LOCK");
  if (existsSync(lock))
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: LOCALITY_CAMPAIGN })}\n`);
}

type Stage = "ledger" | "cohort";
const KEYS: Record<Stage, string> = {
  ledger: populationLedgerKey(LEDGER_ID),
  cohort: populationCohortKey(LEDGER_ID, COHORT_ID),
};

/**
 * Makes ONE commit of the OPERATOR'S live campaign misbehave. `lose`: it commits and the acknowledgement is lost; `drop`: it never
 * reaches the store; `refuse`: a known, definitive refusal. The scratch package the command admission-checks the proposal on beforehand
 * is a different store and is left alone. Returns the stages the live campaign attempted, in order.
 */
function misbehave(stage: Stage, how: "lose" | "drop" | "refuse") {
  const calls: Stage[] = [];
  const open = LocalOperatorSession.open;
  vi.spyOn(LocalOperatorSession, "open").mockImplementation(async (p) => {
    const opened = await open.call(LocalOperatorSession, p);
    if (opened.ok) {
      const store = opened.value.campaign.store;
      const commit = store.commit.bind(store);
      vi.spyOn(store, "commit").mockImplementation(async (group: any) => {
        const key = group.writes[0]?.key as string;
        const which = (Object.keys(KEYS) as Stage[]).find((s) => KEYS[s] === key);
        if (which) calls.push(which);
        if (which !== stage) return commit(group);
        if (how === "refuse")
          return { ok: false, error: { code: "VALUE_INVALID", message: "refused" } } as any;
        if (how === "lose") await commit(group);
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as any;
      });
    }
    return opened;
  });
  return calls;
}

async function reference() {
  const dirs = await timedCampaign();
  expect((await addPopulation(dirs, writePopulation(populationDoc()))).result.status).toBe(
    "POPULATION_READY",
  );
  return headOf(dirs.campaignDir);
}

describe("a lost acknowledgement of either commit converges on the uninterrupted campaign", () => {
  const cases: [Stage, "lose" | "drop", string, boolean, boolean, number][] = [
    // stage, how, name, ledger held, cohort held, asks on the rerun
    [
      "ledger",
      "drop",
      "before the ledger: the ledger never reached the store; the rerun asks once and commits both",
      false,
      false,
      1,
    ],
    [
      "ledger",
      "lose",
      "the ledger landed but its reply was lost: the Cohort was never attempted, and the rerun asks once and commits it",
      true,
      false,
      1,
    ],
    [
      "cohort",
      "drop",
      "after the ledger, before the Cohort: the Cohort never reached the store; the rerun asks once and commits it",
      true,
      false,
      1,
    ],
    [
      "cohort",
      "lose",
      "after the Cohort, before the reply: the rerun verifies both without asking again",
      true,
      true,
      0,
    ],
  ];
  for (const [stage, how, name, ledger, cohort, asks] of cases)
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = await timedCampaign();
        const file = writePopulation(populationDoc());
        const calls = misbehave(stage, how);
        const first = await addPopulation(dirs, file);
        expect(first.result.status).toBe("POPULATION_OUTCOME_UNKNOWN");
        // the Cohort is attempted only after the ledger acknowledged; a ledger of unknown outcome is never followed by a Cohort
        expect(calls).toEqual(stage === "ledger" ? ["ledger"] : ["ledger", "cohort"]);
        vi.restoreAllMocks();

        // the claim is never made on the strength of the reply: the store holds exactly what landed, and never a Cohort without its ledger
        const now = await held(dirs.campaignDir).catch(() => undefined);
        if (now) {
          expect({ ledger: now.ledger, cohort: now.cohort }).toEqual({ ledger, cohort });
          expect(now.violations).toEqual([]);
        }

        crashedHolder(dirs.campaignDir);
        const again = await addPopulation(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status).toBe("POPULATION_READY");
        expect(again.terminal.asked()).toBe(asks);
        expect(await headOf(dirs.campaignDir)).toEqual(expected);
      },
      120_000,
    );

  it("a ledger without its Cohort is never reported established, and the console text names only the remaining stage", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    misbehave("cohort", "drop");
    expect((await addPopulation(dirs, file)).result.status).toBe("POPULATION_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const again = await addPopulation(dirs, file, ["decline"], { reclaimStaleLock: true });
    expect(again.result.status).toBe("DECLINED");
    expect(again.terminal.said.join("\n")).toContain("to commit, in this order: cohort");
    expect(again.terminal.said.join("\n")).not.toContain("ledger →");
    expect(await held(dirs.campaignDir)).toEqual({ ledger: true, cohort: false, violations: [] });
  }, 120_000);
});

describe("a known refusal of the Cohort after the ledger committed is INCOMPLETE, never established", () => {
  it("reports the partial state, then the same proposal finishes it with no duplicated unit", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    misbehave("cohort", "refuse");
    const first = await addPopulation(dirs, file);
    expect(first.result.status).toBe("POPULATION_INCOMPLETE");
    expect(first.result.details.join("\n")).toContain("not committed: cohort");
    vi.restoreAllMocks();
    expect(await held(dirs.campaignDir)).toEqual({ ledger: true, cohort: false, violations: [] });

    const again = await addPopulation(dirs, file);
    expect(again.result.status).toBe("POPULATION_READY");
    expect(again.terminal.asked()).toBe(1);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
    const c = await openOrdinary(dirs.campaignDir);
    try {
      const units = new PopulationAdapter(c.store).ledger(LEDGER_ID)!.value.units;
      expect(units.map((u) => u.unit_id)).toEqual(
        populationDoc().ledger.units.map((u: any) => u.unit_id),
      );
      expect(c.store.getFact(populationLedgerKey(LEDGER_ID))!.version).toBe(1);
    } finally {
      await c.close();
    }
  }, 120_000);

  it("an incompatible proposal offered while a ledger is held without its Cohort is refused, never substituted", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    misbehave("cohort", "refuse");
    expect((await addPopulation(dirs, file)).result.status).toBe("POPULATION_INCOMPLETE");
    vi.restoreAllMocks();
    const head = await headOf(dirs.campaignDir);

    const changes: ((d: any) => void)[] = [
      (d) => d.ledger.units.pop(),
      (d) => (d.ledger.units[0].presence = PLACE_QUAY),
      (d) => (d.ledger.units[0].burden_allocation = PLACE_QUAY),
      (d) => (d.cohort.cohort_id = "cohort-other"),
      (d) => (d.ledger.ledger_id = "ledger-other"),
    ];
    for (const change of changes) {
      const doc = populationDoc();
      change(doc);
      if (doc.ledger.ledger_id !== LEDGER_ID) {
        doc.cohort.scope.ledger_id = doc.ledger.ledger_id;
        doc.cohort.invalidators = [{ fact_key: populationLedgerKey(doc.ledger.ledger_id) }];
      }
      const { result, terminal } = await addPopulation(dirs, writePopulation(doc), []);
      expect(result.status).toBe("LEDGER_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
    }
    expect(await held(dirs.campaignDir)).toEqual({ ledger: true, cohort: false, violations: [] });
  }, 120_000);

  it("a Cohort another writer committed under the same key while the ledger waits is a conflict: it is neither adopted nor replaced", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    misbehave("cohort", "refuse");
    expect((await addPopulation(dirs, file)).result.status).toBe("POPULATION_INCOMPLETE");
    vi.restoreAllMocks();

    // someone else instantiates a different Cohort under the same identifier, through the owner's own operation
    const c = await openOrdinary(dirs.campaignDir);
    const other = await new PopulationAdapter(c.store).instantiateCohort({
      group_id: "somebody-else",
      intent_id: "somebody-else-intent",
      cause: "somebody-else-cause",
      basis: "elsewhere",
      secrecy: "elsewhere",
      ref: cohortDoc({ cardinality_semantics: "UNQUANTIFIED" }),
    });
    expect(other.ok, JSON.stringify(other)).toBe(true);
    await c.close();
    const head = await headOf(dirs.campaignDir);

    const { result, terminal } = await addPopulation(dirs, file, []);
    expect(result.status).toBe("COHORT_CONFLICT");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a character bound between the ledger and the resumed Cohort closes the path: no Cohort is written", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    misbehave("cohort", "refuse");
    expect((await addPopulation(dirs, file)).result.status).toBe("POPULATION_INCOMPLETE");
    vi.restoreAllMocks();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addPopulation(dirs, file, ["confirm"]);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect((await held(dirs.campaignDir)).cohort).toBe(false);
  }, 120_000);

  it("a ledger Population has already reconciled closes the path: the resumed Cohort is not written over a closed ledger", async () => {
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    misbehave("cohort", "refuse");
    expect((await addPopulation(dirs, file)).result.status).toBe("POPULATION_INCOMPLETE");
    vi.restoreAllMocks();
    // no Cohort exists, so Population's genuine close advances only the ledger (and its close) when registered with no Cohort
    const w = await openWitness(dirs.campaignDir);
    try {
      expect((await engageClose(w, closeObject(LEDGER_ID, []))).ok).toBe(true);
      expect(w.campaign.store.getFact(populationLedgerKey(LEDGER_ID))!.version).toBe(2);
    } finally {
      await w.campaign.close();
    }
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addPopulation(dirs, file, ["confirm"]);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("an owner refusal of the ledger writes nothing", () => {
  it("a definitive refusal of the first publication leaves the campaign untouched and the Cohort unattempted", async () => {
    const dirs = await timedCampaign();
    const head = await headOf(dirs.campaignDir);
    const calls = misbehave("ledger", "refuse");
    const { result } = await addPopulation(dirs, writePopulation(populationDoc()));
    expect(result.status).toBe("POPULATION_REFUSED");
    expect(calls).toEqual(["ledger"]);
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("a reopen that fails after the commit is not a success; the rerun verifies by identity", () => {
  it("VERIFICATION_FAILED while both facts are durable, then READY on the rerun without a second write", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    const open = CanonicalCampaign.open;
    let calls = 0;
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (dir: string, o: any) => {
      calls++;
      if (calls >= 2) return { ok: false, error: { code: "REOPEN_LOST", message: "lost" } } as any;
      return open.call(CanonicalCampaign, dir, o);
    });
    const first = await addPopulation(dirs, file);
    expect(first.result.status).toBe("POPULATION_VERIFICATION_FAILED");
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(expected);

    const again = await addPopulation(dirs, file, []);
    expect(again.result.status).toBe("POPULATION_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same proposal confirmed again", async () => {
    const expected = await reference();
    const file = writePopulation(populationDoc());

    const probeDirs = await timedCampaign();
    const probe = instrumentFs(nodeFs);
    expect(
      (await addPopulation(probeDirs, file, ["confirm"], { campaignFs: probe.fs })).result.status,
    ).toBe("POPULATION_READY");
    const total = probe.count();
    expect(total).toBeGreaterThan(8);

    const seen = new Set<string>();
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await timedCampaign();
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const first = await addPopulation(dirs, file, ["confirm"], { campaignFs: faulty.fs });
        seen.add(first.result.status);
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("LEDGER_CONFLICT");
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("COHORT_CONFLICT");

        // whatever was durable at the cut, a Cohort is never present without its ledger
        const cut = await held(dirs.campaignDir).catch(() => undefined);
        if (cut) expect(cut.cohort && !cut.ledger, `op ${failAt} ${when}`).toBe(false);

        crashedHolder(dirs.campaignDir);
        const again = await addPopulation(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status, `op ${failAt} ${when}`).toBe("POPULATION_READY");
        expect(again.terminal.asked()).toBeLessThanOrEqual(1);
        expect(await headOf(dirs.campaignDir), `op ${failAt} ${when}`).toEqual(expected);
        const c = await openOrdinary(dirs.campaignDir);
        expect(c.verify()).toEqual([]);
        expect(c.store.getFact(populationLedgerKey(LEDGER_ID))!.version).toBe(1);
        await c.close();
      }
    }
    // the faults genuinely produced refused, ambiguous, incomplete or unverified outcomes — not only clean runs
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has("POPULATION_READY") && seen.size === 1).toBe(false);
  }, 1_800_000);
});

describe("a real kill of the shipped binary", () => {
  it("killed at the console, before anything is written: the rerun reclaims the stale lock and commits both once", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const before = await headOf(dirs.campaignDir);
    const file = writePopulation(populationDoc());
    const killed = await runShipped(populationArgs(dirs, file), [], { killAfter: /To confirm/ });
    expect(killed.signal).toBe("SIGKILL");
    expect(await headOf(dirs.campaignDir).catch(() => before)).toEqual(before);

    const locked = await runShipped(populationArgs(dirs, file), ["confirm"]);
    expect(locked.code).not.toBe(0);
    expect(locked.stdout).toContain("SESSION_UNAVAILABLE");

    const rerun = await runShipped(populationArgs(dirs, file, ["--reclaim-stale-lock"]), [
      "confirm",
    ]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS POPULATION_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the ledger and before the Cohort: the rerun asks once about the Cohort only and finishes the same population", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    const killed = await runShipped(populationArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS ledger COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(populationArgs(dirs, file, ["--reclaim-stale-lock"]), [
      "confirm",
    ]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("to commit, in this order: cohort");
    expect(rerun.stdout).toContain("STATUS POPULATION_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the Cohort and before the acknowledgement: the rerun verifies both by identity without asking again", async () => {
    const expected = await reference();
    const dirs = await timedCampaign();
    const file = writePopulation(populationDoc());
    const killed = await runShipped(populationArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS cohort COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(populationArgs(dirs, file, ["--reclaim-stale-lock"]));
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS POPULATION_READY");
    expect(rerun.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});
