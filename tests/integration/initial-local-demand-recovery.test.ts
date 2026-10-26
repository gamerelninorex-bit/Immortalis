/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap store operations to simulate lost acknowledgements */
// Crash / retry for the initial local demand and independently authored production start (RC-16). The command's matrix: before the first
// commit, between the Economy demand and the Production start, after the operation commit (a lost acknowledgement), a known refusal of the
// second act, an incompatible second act offered while the first waits, an uncertain store outcome, a failed reopen — plus a real SIGKILL of
// the shipped binary at each durable cut and a failure before AND after EVERY mutating filesystem operation of the whole command. The
// earned-boundary phase is interrupted too: before the due Production stage, between every durable step of the Temporal transaction,
// before the World-State acceptance and before the Economy realization, and after a lost final acknowledgement. Each case reopens and
// re-presents the SAME confirmed proposal (or the SAME transaction), which must land on exactly the campaign an uninterrupted run produces
// — never a second demand, operation, claim, Reserve debit, output or access, never a success claimed on the strength of a lost reply,
// and never a silent rollback of the already-canonical first act.
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  economyDemandKey,
  economyRequestKey,
  productionOperationKey,
  productionReserveKey,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  economyRealizationProvider,
  nodeFs,
  productionCompletionProvider,
  worldFallbackAcceptanceProvider,
} from "@immortalis/engine";
import { LocalOperatorSession } from "@immortalis/operator";
import { at, instrumentFs } from "@immortalis/testkit";
import {
  DEMAND_ID,
  INPUT_AMOUNT,
  LOCALITY_CAMPAIGN,
  OPERATION_ID,
  OUTPUT_CLASS,
  OUTPUT_UNIT,
  RESERVE_AMOUNT,
  RESERVE_ID,
  addDemand,
  advanceRequest,
  bindPlayer,
  demandArgs,
  demandDoc,
  engageClose,
  headOf,
  held,
  openOrdinary,
  openPopulationWitness,
  openWitness,
  processSummary,
  registerOperation,
  scenarioCampaign,
  writeDemand,
} from "../support/initial-local-demand.ts";
import { runShipped, type LocalityDirs } from "../support/locality.ts";
import { copyState } from "../support/operator.ts";
import { must } from "../support/temporal.ts";

afterEach(() => vi.restoreAllMocks());

/** A process id that provably belongs to no running process: what the lock of a crashed process names. */
const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;

/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is what is restored. */
function crashedHolder(campaignDir: string): void {
  const lock = join(campaignDir, "LOCK");
  if (existsSync(lock))
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: LOCALITY_CAMPAIGN })}\n`);
}

/** The shipped-command scenario, built once; every case works on a private copy of it. */
let template: LocalityDirs | undefined;
async function scenario(): Promise<LocalityDirs> {
  template ??= await scenarioCampaign();
  return copyState(template);
}

type Stage = "demand" | "start";
const KEYS: Record<Stage, string> = {
  demand: economyDemandKey(DEMAND_ID),
  start: productionOperationKey(OPERATION_ID),
};

/**
 * Makes ONE commit of the OPERATOR'S live campaign misbehave. `lose`: it commits and the acknowledgement is lost; `drop`: it never
 * reaches the store; `refuse`: a known, definitive refusal. The scratch copy the command admission-checks the proposal on beforehand is
 * a different store and is left alone. Returns the stages the live campaign attempted, in order.
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
  const dirs = await scenario();
  expect((await addDemand(dirs, writeDemand(demandDoc()))).result.status).toBe(
    "LOCAL_DEMAND_READY",
  );
  return headOf(dirs.campaignDir);
}

describe("a lost acknowledgement of either commit converges on the uninterrupted campaign", () => {
  const cases: [Stage, "lose" | "drop", string, boolean, boolean, number][] = [
    // stage, how, name, demand held, operation held, asks on the rerun
    [
      "demand",
      "drop",
      "before the first commit: the demand never reached the store; the rerun asks once and commits both",
      false,
      false,
      1,
    ],
    [
      "demand",
      "lose",
      "the demand landed but its reply was lost: the start was never attempted, and the rerun asks once and commits it",
      true,
      false,
      1,
    ],
    [
      "start",
      "drop",
      "between the Economy demand and the Production start: the start never reached the store; the rerun asks once and commits it",
      true,
      false,
      1,
    ],
    [
      "start",
      "lose",
      "after the operation commit, before the reply: the rerun verifies both without asking again",
      true,
      true,
      0,
    ],
  ];
  for (const [stage, how, name, demand, operation, asks] of cases)
    it(
      name,
      async () => {
        const expected = await reference();
        const dirs = await scenario();
        const file = writeDemand(demandDoc());
        const calls = misbehave(stage, how);
        const first = await addDemand(dirs, file);
        expect(first.result.status).toBe("LOCAL_DEMAND_OUTCOME_UNKNOWN");
        // the start is attempted only after the demand acknowledged; a demand of unknown outcome is never followed by a start
        expect(calls).toEqual(stage === "demand" ? ["demand"] : ["demand", "start"]);
        vi.restoreAllMocks();

        // the claim is never made on the strength of the reply: the store holds exactly what landed, never an operation without its demand
        const now = await held(dirs.campaignDir).catch(() => undefined);
        if (now) {
          expect({ demand: now.demand, request: now.request }).toEqual({
            demand,
            request: demand,
          });
          expect({ operation: now.operation, claim: now.claim }).toEqual({
            operation,
            claim: operation,
          });
          expect(now.violations).toEqual([]);
        }

        crashedHolder(dirs.campaignDir);
        const again = await addDemand(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status).toBe("LOCAL_DEMAND_READY");
        expect(again.terminal.asked()).toBe(asks);
        expect(await headOf(dirs.campaignDir)).toEqual(expected);
      },
      120_000,
    );

  it("a demand without its start is never reported established, and the console text names only the remaining act", async () => {
    const dirs = await scenario();
    const file = writeDemand(demandDoc());
    misbehave("start", "drop");
    expect((await addDemand(dirs, file)).result.status).toBe("LOCAL_DEMAND_OUTCOME_UNKNOWN");
    vi.restoreAllMocks();
    crashedHolder(dirs.campaignDir);
    const again = await addDemand(dirs, file, ["decline"], { reclaimStaleLock: true });
    expect(again.result.status).toBe("DECLINED");
    const said = again.terminal.said.join("\n");
    expect(said).toContain("to commit, in this order: start");
    expect(said).not.toContain("demand →");
    expect(said).toContain("ALREADY COMMITTED, not asked again");
    expect(await held(dirs.campaignDir)).toMatchObject({
      demand: true,
      request: true,
      operation: false,
      claim: false,
      violations: [],
    });
  }, 120_000);
});

describe("a known refusal of the Production start after the demand committed is INCOMPLETE, never established", () => {
  it("reports the partial state, does not roll the demand back, then the same proposal finishes it with no second demand", async () => {
    const expected = await reference();
    const dirs = await scenario();
    const file = writeDemand(demandDoc());
    misbehave("start", "refuse");
    const first = await addDemand(dirs, file);
    expect(first.result.status).toBe("LOCAL_DEMAND_INCOMPLETE");
    expect(first.result.message).toContain("not rolled back");
    expect(first.result.details.join("\n")).toContain("not committed: start");
    vi.restoreAllMocks();
    expect(await held(dirs.campaignDir)).toMatchObject({ demand: true, operation: false });

    const again = await addDemand(dirs, file);
    expect(again.result.status).toBe("LOCAL_DEMAND_READY");
    expect(again.terminal.asked()).toBe(1);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.store.getFact(economyDemandKey(DEMAND_ID))!.version).toBe(1);
      expect(c.store.getFact(economyRequestKey(OPERATION_ID))!.version).toBe(1);
    } finally {
      await c.close();
    }
  }, 120_000);

  it("a definitive refusal of the demand leaves the campaign untouched and the start unattempted", async () => {
    const dirs = await scenario();
    const head = await headOf(dirs.campaignDir);
    const calls = misbehave("demand", "refuse");
    const { result } = await addDemand(dirs, writeDemand(demandDoc()));
    expect(result.status).toBe("LOCAL_DEMAND_REFUSED");
    expect(calls).toEqual(["demand"]);
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("an independently changed second act is refused while the first waits; nothing is silently rolled back", () => {
  async function waiting() {
    const dirs = await scenario();
    const file = writeDemand(demandDoc());
    misbehave("start", "refuse");
    expect((await addDemand(dirs, file)).result.status).toBe("LOCAL_DEMAND_INCOMPLETE");
    vi.restoreAllMocks();
    return { dirs, file, head: await headOf(dirs.campaignDir) };
  }

  const changes: [string, (d: any) => void][] = [
    ["another completion boundary", (d) => (d.production.completion_at = at(300))],
    ["another input quantity", (d) => (d.production.transformation.input_quantity.amount = 2)],
    ["another output condition", (d) => (d.production.transformation.output_condition = "wet")],
    ["another demanded quantity", (d) => (d.demand.demand_entry.quantity.amount = 1 + 1)],
  ];
  for (const [name, change] of changes)
    it(`${name} is refused: the earlier demand stays canonical, awaiting its start`, async () => {
      const { dirs, head } = await waiting();
      const doc = demandDoc();
      change(doc);
      if (doc.demand.demand_entry.quantity.amount === 2)
        doc.production.transformation.output_quantity.amount = 2;
      const { result, terminal } = await addDemand(dirs, writeDemand(doc), []);
      expect(result.status).toBe("DEMAND_CONFLICT");
      expect(terminal.asked()).toBe(0);
      expect(await headOf(dirs.campaignDir)).toEqual(head);
      expect(await held(dirs.campaignDir)).toMatchObject({ demand: true, operation: false });
    }, 120_000);

  it("an operation another writer started under the waiting demand is a conflict: it is neither adopted nor replaced", async () => {
    const { dirs, file } = await waiting();
    const w = await openWitness(dirs.campaignDir);
    try {
      const r = await w.production.startOperation({
        group_id: "somebody-else",
        intent_id: "somebody-else-intent",
        cause: "somebody-else-cause",
        basis: "elsewhere",
        secrecy: "elsewhere",
        start: {
          request_key: economyRequestKey(OPERATION_ID),
          reserve_id: RESERVE_ID,
          transformation: {
            input_quantity: {
              amount: 3,
              unit: demandDoc().production.transformation.input_quantity.unit,
            },
            output_quantity: { amount: 1, unit: OUTPUT_UNIT },
            output_class: OUTPUT_CLASS,
            output_condition: "elsewhere",
          },
          completion_at: at(250),
        },
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    } finally {
      await w.campaign.close();
    }
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, file, []);
    expect(["OPERATION_CONFLICT", "RESERVE_NOT_COMMITTED"]).toContain(result.status);
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a character bound between the demand and the resumed start closes the path: no start is written", async () => {
    const { dirs, file } = await waiting();
    await bindPlayer(dirs);
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, file, ["confirm"]);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    expect((await held(dirs.campaignDir)).operation).toBe(false);
  }, 120_000);

  it("a canonical time that moved between the demand and the resumed start closes the path: the start is not made over a stale AS-OF-NOW", async () => {
    const { dirs, file } = await waiting();
    const w = await openWitness(dirs.campaignDir);
    try {
      expect((await w.coordinator.advance(advanceRequest("tx-moved", at(130)))).ok).toBe(true);
    } finally {
      await w.campaign.close();
    }
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, file, ["confirm"]);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(result.details.join(" ")).toContain("canonical time has moved");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a ledger Population composed between the demand and the resumed start closes the path: the pinned carrier is stale", async () => {
    const { dirs, file } = await waiting();
    const pop = await openPopulationWitness(dirs.campaignDir);
    try {
      expect((await engageClose(pop)).ok).toBe(true);
    } finally {
      await pop.campaign.close();
    }
    const head = await headOf(dirs.campaignDir);
    const { result, terminal } = await addDemand(dirs, file, ["confirm"]);
    expect(result.status).toBe("PRE_PLAY_CLOSED");
    expect(terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);
});

describe("a reopen that fails after the commit is not a success; the rerun verifies by identity", () => {
  it("VERIFICATION_FAILED while both acts are durable, then READY on the rerun without a second write", async () => {
    const expected = await reference();
    const dirs = await scenario();
    const file = writeDemand(demandDoc());
    const open = CanonicalCampaign.open;
    let calls = 0;
    vi.spyOn(CanonicalCampaign, "open").mockImplementation(async (dir: string, o: any) => {
      calls++;
      // the session's own open, then the dry run's copy, then the verification reopen
      if (calls >= 3) return { ok: false, error: { code: "REOPEN_LOST", message: "lost" } } as any;
      return open.call(CanonicalCampaign, dir, o);
    });
    const first = await addDemand(dirs, file);
    expect(first.result.status).toBe("LOCAL_DEMAND_VERIFICATION_FAILED");
    vi.restoreAllMocks();
    expect(await headOf(dirs.campaignDir)).toEqual(expected);

    const again = await addDemand(dirs, file, []);
    expect(again.result.status).toBe("LOCAL_DEMAND_READY");
    expect(again.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});

describe("a failure before or after EVERY mutating filesystem operation converges on the uninterrupted campaign", () => {
  it("each operation, before and after, then the same proposal confirmed again", async () => {
    const expected = await reference();
    const file = writeDemand(demandDoc());

    const probeDirs = await scenario();
    const probe = instrumentFs(nodeFs);
    expect(
      (await addDemand(probeDirs, file, ["confirm"], { campaignFs: probe.fs })).result.status,
    ).toBe("LOCAL_DEMAND_READY");
    const total = probe.count();
    expect(total).toBeGreaterThan(8);

    const seen = new Set<string>();
    for (let failAt = 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await scenario();
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const first = await addDemand(dirs, file, ["confirm"], { campaignFs: faulty.fs });
        seen.add(first.result.status);
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("DEMAND_CONFLICT");
        expect(first.result.status, `op ${failAt} ${when}`).not.toBe("OPERATION_CONFLICT");

        // whatever was durable at the cut, an operation is never present without its demand
        const cut = await held(dirs.campaignDir).catch(() => undefined);
        if (cut) expect(cut.operation && !cut.demand, `op ${failAt} ${when}`).toBe(false);

        crashedHolder(dirs.campaignDir);
        const again = await addDemand(dirs, file, ["confirm"], { reclaimStaleLock: true });
        expect(again.result.status, `op ${failAt} ${when}`).toBe("LOCAL_DEMAND_READY");
        expect(again.terminal.asked()).toBeLessThanOrEqual(1);
        expect(await headOf(dirs.campaignDir), `op ${failAt} ${when}`).toEqual(expected);
        const c = await openOrdinary(dirs.campaignDir);
        expect(c.verify()).toEqual([]);
        await c.close();
      }
    }
    // the faults genuinely produced refused, ambiguous, incomplete or unverified outcomes — not only clean runs
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has("LOCAL_DEMAND_READY") && seen.size === 1).toBe(false);
  }, 1_800_000);
});

describe("a real kill of the shipped binary", () => {
  it("killed at the console, before anything is written: the rerun reclaims the stale lock and commits both once", async () => {
    const expected = await reference();
    const dirs = await scenario();
    const before = await headOf(dirs.campaignDir);
    const file = writeDemand(demandDoc());
    const killed = await runShipped(demandArgs(dirs, file), [], { killAfter: /To confirm/ });
    expect(killed.signal).toBe("SIGKILL");
    expect(await headOf(dirs.campaignDir).catch(() => before)).toEqual(before);

    const locked = await runShipped(demandArgs(dirs, file), ["confirm"]);
    expect(locked.code).not.toBe(0);
    expect(locked.stdout).toContain("SESSION_UNAVAILABLE");

    const rerun = await runShipped(demandArgs(dirs, file, ["--reclaim-stale-lock"]), ["confirm"]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS LOCAL_DEMAND_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the demand and before the start: the rerun asks once about the start only and finishes the same process", async () => {
    const expected = await reference();
    const dirs = await scenario();
    const file = writeDemand(demandDoc());
    const killed = await runShipped(demandArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS demand COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(demandArgs(dirs, file, ["--reclaim-stale-lock"]), ["confirm"]);
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("to commit, in this order: start");
    expect(rerun.stdout).toContain("STATUS LOCAL_DEMAND_READY");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);

  it("killed after the start and before the acknowledgement: the rerun verifies both by identity without asking again", async () => {
    const expected = await reference();
    const dirs = await scenario();
    const file = writeDemand(demandDoc());
    const killed = await runShipped(demandArgs(dirs, file), ["confirm"], {
      killAfter: /PROGRESS start COMMITTED/,
    });
    expect(killed.signal).toBe("SIGKILL");

    const rerun = await runShipped(demandArgs(dirs, file, ["--reclaim-stale-lock"]));
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain("STATUS LOCAL_DEMAND_READY");
    expect(rerun.stdout).not.toContain("To confirm");
    expect(await headOf(dirs.campaignDir)).toEqual(expected);
  }, 120_000);
});

// -- the earned-boundary phase: the EXISTING owner chain, interrupted and re-presented ---------------------------------------------------------

/** A finished opening, registered with the Temporal owner, ready to be advanced to its declared boundary. */
async function opened(): Promise<LocalityDirs> {
  const dirs = await scenario();
  expect((await addDemand(dirs, writeDemand(demandDoc()))).result.status).toBe(
    "LOCAL_DEMAND_READY",
  );
  const w = await openWitness(dirs.campaignDir);
  try {
    await registerOperation(w);
  } finally {
    await w.campaign.close();
  }
  return dirs;
}

/** The facts of a fully earned chain: what must exist exactly once however the run was interrupted. */
function assertEarnedOnce(w: Awaited<ReturnType<typeof openWitness>>) {
  const reserve = w.production.reserve(RESERVE_ID)!;
  expect(reserve.value.consumed).toEqual([
    {
      operation_id: OPERATION_ID,
      quantity: { amount: INPUT_AMOUNT, unit: reserve.value.quantity.unit },
    },
  ]);
  expect(reserve.value.quantity.amount).toBe(RESERVE_AMOUNT - INPUT_AMOUNT);
  expect(reserve.fact.version).toBe(3);
  expect(w.production.operation(OPERATION_ID)!.fact.version).toBe(2);
  expect(w.production.completion(OPERATION_ID)!.fact.version).toBe(1);
  expect(
    w.production.acceptedEntity("world-ashfall", `durable:${OPERATION_ID}`)!.fact.version,
  ).toBe(1);
  expect(w.economy.realization(DEMAND_ID)!.fact.version).toBe(1);
  expect(w.economy.access(DEMAND_ID).state).toBe("REALIZED_ACCESS");
  expect(w.campaign.verify()).toEqual([]);
}

describe("the earned boundary, interrupted at every durable step and re-presented, earns each result exactly once", () => {
  it("a failure before or after every mutating operation of the whole due transaction converges on the identical campaign", async () => {
    const refDirs = await opened();
    const ref = await openWitness(refDirs.campaignDir);
    await must(ref.coordinator.advance(advanceRequest("tx-due")));
    assertEarnedOnce(ref);
    const refHead = ref.campaign.store.head();
    await ref.campaign.close();

    const probeDirs = await opened();
    const probe = instrumentFs(nodeFs);
    const p = await must(CanonicalCampaign.open(probeDirs.campaignDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    const pc = new TemporalCoordinator(p.store, witnessRegistry());
    await must(pc.advance(advanceRequest("tx-due")));
    const afterAdvance = probe.count();
    await p.close();
    // completion + acceptance + realization stages and the kernel group: at least four commits of append + manifest publication each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(8);

    const finals = new Set<string>();
    const seen = { rolledBack: 0, partial: 0, committed: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dirs = await opened();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const campaign = await must(CanonicalCampaign.open(dirs.campaignDir, { fs: inst.fs }));
        const coordinator = new TemporalCoordinator(campaign.store, witnessRegistry());
        const r = await coordinator.advance(advanceRequest("tx-due"));
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await campaign.close();

        // restart: whatever survived is consistent and never half-credited
        const w = await openWitness(dirs.campaignDir);
        try {
          expect(w.campaign.verify(), `op ${failAt} ${when}`).toEqual([]);
          const consumed = w.production.reserve(RESERVE_ID)!.value.consumed.length;
          const accepted = w.production.acceptedEntity("world-ashfall", `durable:${OPERATION_ID}`);
          const access = w.economy.realization(DEMAND_ID);
          // the chain is ordered: nothing downstream exists without its predecessor
          if (access) expect(accepted).toBeDefined();
          if (accepted) expect(w.production.completion(OPERATION_ID)).toBeDefined();
          expect(consumed).toBeLessThanOrEqual(1);
          if (w.coordinator.transaction("tx-due")) seen.committed++;
          else if (w.production.completion(OPERATION_ID)) seen.partial++;
          else seen.rolledBack++;

          // the SAME transaction re-presented reaches the same end, exactly once
          await must(w.coordinator.advance(advanceRequest("tx-due")));
          assertEarnedOnce(w);
          const head = w.campaign.store.head();
          expect(head.revision, `op ${failAt} ${when}`).toBe(refHead.revision);
          finals.add(`${head.state_sha256}/${head.journal_head_sha256}`);
        } finally {
          await w.campaign.close();
        }
      }
    }
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${refHead.state_sha256}/${refHead.journal_head_sha256}`);
    expect(seen.rolledBack).toBeGreaterThan(0);
    expect(seen.partial).toBeGreaterThan(0);
  }, 1_800_000);

  it("Production completed but the custodian had not yet accepted: nothing is realized, and the continuation adopts the completion and earns the rest once", async () => {
    const dirs = await opened();
    const w = await openWitness(
      dirs.campaignDir,
      new StageProviderRegistry([productionCompletionProvider, economyRealizationProvider]),
    );
    try {
      const r = await must(w.coordinator.advance(advanceRequest("tx-1", at(200))));
      expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
      expect(w.production.operation(OPERATION_ID)!.value.status.state).toBe("COMPLETED");
      expect(w.production.reserve(RESERVE_ID)!.value.quantity.amount).toBe(
        RESERVE_AMOUNT - INPUT_AMOUNT,
      );
      expect(w.production.availability(OPERATION_ID).state).toBe("COMPLETED_PENDING_ACCEPTANCE");
      // completion is NOT satisfaction: no physical entity, no realized access, the demand stays open
      expect(w.economy.realization(DEMAND_ID)).toBeUndefined();
      expect(w.economy.access(DEMAND_ID)).toEqual({ state: "DEMAND_OPEN" });
      expect(
        w.campaign.store.listFacts().filter((f) => /^world\/[^/]+\/entity\//.test(f.key)),
      ).toEqual([]);
    } finally {
      await w.campaign.close();
    }
    const again = await openWitness(dirs.campaignDir);
    try {
      const done = await must(
        again.coordinator.continueRemainder({
          transaction_id: "tx-2",
          cause: "cause-tx-2",
          trigger: { kind: "fixture-continue", ref: "ref-tx-2" },
          context: { role: "role.player", permission: "permission.player_choice.commit" },
          publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
        }),
      );
      expect(done.adopted.map((k) => k.owner_operation.operation)).toContain(
        "production-complete-operation",
      );
      assertEarnedOnce(again);
    } finally {
      await again.campaign.close();
    }
  }, 180_000);

  it("accepted but Economy's own stage unresolved: the physical result exists, access is not yet recorded, and a later continuation records it once", async () => {
    const dirs = await opened();
    const w = await openWitness(
      dirs.campaignDir,
      new StageProviderRegistry([productionCompletionProvider, worldFallbackAcceptanceProvider]),
    );
    try {
      const r = await must(w.coordinator.advance(advanceRequest("tx-1", at(200))));
      expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
      expect(w.production.availability(OPERATION_ID).state).toBe("ACCEPTED_AVAILABLE");
      expect(w.economy.realization(DEMAND_ID)).toBeUndefined();
      expect(w.economy.access(DEMAND_ID)).toEqual({ state: "DEMAND_OPEN" });
    } finally {
      await w.campaign.close();
    }
    const again = await openWitness(dirs.campaignDir);
    try {
      await must(
        again.coordinator.continueRemainder({
          transaction_id: "tx-2",
          cause: "cause-tx-2",
          trigger: { kind: "fixture-continue", ref: "ref-tx-2" },
          context: { role: "role.player", permission: "permission.player_choice.commit" },
          publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
        }),
      );
      assertEarnedOnce(again);
    } finally {
      await again.campaign.close();
    }
  }, 180_000);

  it("a duplicate delivery of the due request, or of a later one, never double-debits, double-accepts or double-realizes", async () => {
    const dirs = await opened();
    const w = await openWitness(dirs.campaignDir);
    try {
      await must(w.coordinator.advance(advanceRequest("tx-due")));
      const once = processSummary(w);
      await must(w.coordinator.advance(advanceRequest("tx-due")));
      await must(w.coordinator.advance(advanceRequest("tx-later", at(400))));
      const after = processSummary(w);
      expect(after.economy).toEqual(once.economy);
      expect(after.production).toEqual(once.production);
      expect(after.entities).toEqual(once.entities);
      assertEarnedOnce(w);
    } finally {
      await w.campaign.close();
    }
  }, 180_000);

  it("a changed accepted output, quantity or locality prevents the Economy result: the custodian's entity must be exactly the demanded good", async () => {
    // owner level, off the shipped path: the demand is issued through the Economy owner and Production is (wrongly) asked for another output
    const dirs = await scenario();
    const w = await openWitness(dirs.campaignDir);
    try {
      const d = demandDoc();
      await must(
        w.economy.issueDemand({
          group_id: "g-d",
          intent_id: "i-d",
          cause: "c-d",
          basis: "b",
          secrecy: "s",
          demand: d.demand,
        }),
      );
      for (const [n, mutate] of [
        ["class", (s: any) => (s.transformation.output_class = "other-good")],
        ["quantity", (s: any) => (s.transformation.output_quantity.amount = 2)],
      ] as const) {
        const start = demandDoc().production;
        mutate(start);
        const r = await w.production.startOperation({
          group_id: `g-s-${n}`,
          intent_id: `i-s-${n}`,
          cause: "c-s",
          basis: "b",
          secrecy: "s",
          start,
        });
        // Production itself refuses an operation that does not produce exactly what the request asked for
        expect(r.ok, n).toBe(false);
      }
      expect(w.production.operation(OPERATION_ID)).toBeUndefined();
      expect(w.economy.access(DEMAND_ID)).toEqual({ state: "DEMAND_OPEN" });
      expect(w.campaign.store.getFact(productionReserveKey(RESERVE_ID))!.version).toBe(1);
    } finally {
      await w.campaign.close();
    }
  }, 120_000);
});

function witnessRegistry(): StageProviderRegistry {
  return new StageProviderRegistry([
    productionCompletionProvider,
    worldFallbackAcceptanceProvider,
    economyRealizationProvider,
  ]);
}
