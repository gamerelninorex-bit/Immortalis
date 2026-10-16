/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and ledger values */
// BLUE clause D-1 (PC Collection Voluntary Cessation) — PROVISIONAL, proposed and NOT adopted — the NON-FIXTURE ingress. The only way a
// cessation reaches `bindTrustedConfirmedPcCessationContext` here is the operator's own fresh, SEPARATE console confirmation of exactly
// that stop (the same existing player-confirmation authority the start and the time choice use; a confirmation of the start is not one):
// the PC and the act come from the retained, confirmed collection and from canon, never from operator input, and everything after the
// confirmation is the owners' own chain. Negatives: every unconfirmed, declined, stale, mistyped, not-in-flight or invented stop writes
// nothing. A scripted console proves transport and enforcement only; it is not a live player.
import { describe, expect, it } from "vitest";
import { cease, collect, collectContinue, pcTargetAdvance, reconcile } from "@immortalis/operator";
import { PcCollectionAdapter } from "@immortalis/engine";
import { pcCollectionCessationKey } from "@immortalis/contracts";
import { SRC_BASIS_ID, SRC_RESERVE, SRC_SOURCE_KEY, SRC_UNIT } from "@immortalis/testkit";
import { MECH, PC, T0, TAU, W, collectionCampaign, hostAnswer } from "../support/pc-collection.ts";
import { keys } from "../support/pc-cessation.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { readLedger } from "../support/operator-pc-target.ts";
import { tempDir } from "../support/tmp.ts";

type Session = Awaited<ReturnType<typeof openSession>>;

async function template(): Promise<string> {
  const dir = tempDir("immortalis-operator-cease-");
  const s = await collectionCampaign({ dir });
  await s.campaign.close();
  return dir;
}

const INPUT = (amount = 3) => ({
  source: { world_id: W, source_key: SRC_SOURCE_KEY },
  reserve_id: SRC_RESERVE,
  quantity: { amount, unit: SRC_UNIT },
  mechanism_id: MECH,
  basis_id: SRC_BASIS_ID,
});
const gm = async (task: Parameters<typeof hostAnswer>[0]) =>
  hostAnswer(task, "OPEN", "NOT_AT_ISSUE");
const act = (uid: string) => `operator-act-${uid}`;
const sourceAmount = (s: Session) =>
  (s.campaign.store.getFact(`world/${W}/source/${SRC_SOURCE_KEY}`)!.value as any).recoverable
    .amount;
const reserveAmount = (s: Session) =>
  (s.campaign.store.getFact(`production/reserve/${SRC_RESERVE}`)!.value as any).quantity.amount;
const holdOf = (s: Session) => new PcCollectionAdapter(s.campaign.store).hold(PC);
const sha = (s: Session) => s.campaign.store.head().state_sha256;
const advance = (s: Session, value: number, uid: string) =>
  pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(uid)), {
    target: { unit: T0.unit, value },
  });

/** a confirmed attempt that Production has started and that time has partly passed over */
async function inFlight(s: Session, at = T0.value + 10) {
  expect(
    (await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c1")), INPUT())).status,
  ).toBe("COLLECTION_COMMITTED");
  expect((await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost: gm })).status).toBe(
    "COLLECTION_COMMITTED",
  );
  expect((await advance(s, at, "t1")).status).toBe("PC_TARGET_ADVANCE_COMMITTED");
  expect(holdOf(s)).toEqual({ state: "IN_FLIGHT", act_id: act("c1") });
}

describe("D-1 operator ingress: the player's separate console confirmation is the only way a stop reaches the owners", () => {
  it("confirm the start, let time pass, then confirm the STOP: the owners' chain runs, nothing is credited, and the PC may then choose again", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    await inFlight(s);
    expect(sourceAmount(s)).toBe(5);

    const t = scriptedTerminal("confirm");
    const out = await cease(ctxOf(s, t, fixedIds("z1")));
    expect(out.status).toBe("COLLECTION_COMMITTED");
    expect(t.asked()).toBe(1);
    const shown = t.said.join("\n");
    expect(shown).toContain("THE CHARACTER STOPS THE COLLECTION");
    expect(shown).toContain(PC);
    expect(shown).toContain(act("c1"));
    expect(shown).toMatch(/NEW choice to stop, separate from the choice to begin/);
    expect(shown).toMatch(/awards nothing/);
    expect(shown).toMatch(/PROVISIONAL/);

    // the confirmed intent was retained durably under the retained act's identity, and the chain ran to its end
    const ledger = readLedger({ operatorDir: dirs.operatorDir });
    const stop = ledger.intents.find((i: any) => i.kind === "COLLECTION_CESSATION");
    expect(stop).toMatchObject({
      status: "COMMITTED",
      pc_id: PC,
      choice: { pc_id: PC, act_id: act("c1") },
    });
    expect(s.campaign.store.getFact(pcCollectionCessationKey(PC, act("c1")))).toBeDefined();
    const adapter = new PcCollectionAdapter(s.campaign.store);
    expect(adapter.termination(PC, act("c1"))!.value.derivation).toMatchObject({
      stopped_at: { value: T0.value + 10 },
      cycles_fully_elapsed: 1,
      units_credited: 0,
    });
    expect(adapter.occupancy(PC)!.value.status).toBe("RELEASED_TERMINATED");
    expect(holdOf(s)).toEqual({ state: "NONE" });
    expect(sourceAmount(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);

    // asking again after it is done asks nothing and writes nothing
    const head = sha(s);
    const again = scriptedTerminal();
    expect((await cease(ctxOf(s, again, fixedIds("z2")))).status).toBe("COLLECTION_COMMITTED");
    expect(again.asked()).toBe(0);
    expect(sha(s)).toBe(head);

    // reopen: the stop is durable and every verifier agrees
    await s.close();
    const r = await openSession(dirs);
    expect(holdOf(r)).toEqual({ state: "NONE" });
    expect(sourceAmount(r)).toBe(5);

    // the PC may choose again, and a new confirmed attempt for 3 completes against the real, unchanged source
    expect(
      (await collect(ctxOf(r, scriptedTerminal("confirm"), fixedIds("c2")), INPUT())).status,
    ).toBe("COLLECTION_COMMITTED");
    expect((await collectContinue({ ...ctxOf(r, scriptedTerminal()), reachHost: gm })).status).toBe(
      "COLLECTION_COMMITTED",
    );
    expect((await advance(r, T0.value + 10 + 3 * TAU, "t2")).status).toBe(
      "PC_TARGET_ADVANCE_COMMITTED",
    );
    expect(sourceAmount(r)).toBe(2);
    expect(reserveAmount(r)).toBe(3);
    await r.close();
  }, 180_000);
});

describe("D-1 operator ingress: no unconfirmed, declined, wrong-verb, not-in-flight or invented stop reaches the owners", () => {
  it("a declined, mistyped, stale, wrong-verb or end-of-input confirmation commits nothing and retains nothing", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    await inFlight(s);
    const head = sha(s);
    for (const reply of [
      "decline",
      "eof",
      "stale",
      (p: string) => p.replace(/^\S+/, "collect"), // a confirmation of the START is not one of the STOP
      (p: string) => p.replace(/^\S+/, "advance"),
      () => "",
    ] as const) {
      const t = scriptedTerminal(reply as never);
      const out = await cease(ctxOf(s, t, fixedIds("n1")));
      expect(out.status, String(reply)).toBe("DECLINED");
      expect(t.asked()).toBe(1);
      expect(sha(s)).toBe(head);
      expect(s.ledger.cessations()).toHaveLength(0);
      expect(holdOf(s)).toEqual({ state: "IN_FLIGHT", act_id: act("c1") });
    }
    await s.close();
  }, 180_000);

  it("a stop that canon does not hold in flight is never offered: the console is not even asked", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    const asked = async (expected: string) => {
      const t = scriptedTerminal("confirm");
      const head = sha(s);
      expect((await cease(ctxOf(s, t, fixedIds("n2")))).status).toBe(expected);
      expect(t.asked()).toBe(0);
      expect(sha(s)).toBe(head);
      expect(s.ledger.cessations()).toHaveLength(0);
    };
    // nothing confirmed at all
    await asked("NOTHING_TO_RECONCILE");
    // confirmed and committed, but never started: no work to stop
    expect(
      (await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c1")), INPUT())).status,
    ).toBe("COLLECTION_COMMITTED");
    expect(holdOf(s)).toEqual({ state: "NONE" });
    await asked("UNAVAILABLE");
    // started and then closed at its earned boundary: a closed output is never stoppable
    expect((await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost: gm })).status).toBe(
      "COLLECTION_COMMITTED",
    );
    expect((await advance(s, T0.value + 3 * TAU, "t1")).status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(sourceAmount(s)).toBe(2);
    await asked("UNAVAILABLE");
    expect(reserveAmount(s)).toBe(3);
    await s.close();
  }, 180_000);

  it("the ledger refuses a cessation of an act it never retained, a second cessation of one act, and any field that states a result", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    await inFlight(s);
    const base = (
      over: Record<string, unknown> = {},
      id = "operator-intent:s1",
      actId = act("c1"),
    ) => ({
      kind: "COLLECTION_CESSATION" as const,
      intent_id: id,
      pc_id: PC,
      choice: {
        pc_id: PC,
        act_id: actId,
        authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      },
      publication: {
        cause: "operator-cessation-cause:x",
        basis: "local-operator-confirmed-choice",
        secrecy: "local-operator-session",
      },
      ...over,
    });
    // an act the ledger never retained
    expect((await s.ledger.record(base({}, "operator-intent:s0", act("never")) as never)).ok).toBe(
      false,
    );
    // a result, a credit or a boundary is not representable in a retained intent
    for (const extra of [
      { units_credited: 3 },
      { boundary_at: { unit: T0.unit, value: 1 } },
      { result: "STOPPED" },
    ])
      expect((await s.ledger.record(base(extra) as never)).ok).toBe(false);
    // a foreign authority is not representable
    expect(
      (
        await s.ledger.record(
          base({
            choice: {
              pc_id: PC,
              act_id: act("c1"),
              authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
            },
          }) as never,
        )
      ).ok,
    ).toBe(false);
    expect(s.ledger.cessations()).toHaveLength(0);
    // the lawful one is retained once; a second cessation of that act is a conflict
    expect((await s.ledger.record(base() as never)).ok).toBe(true);
    expect((await s.ledger.record(base({}, "operator-intent:s2") as never)).ok).toBe(false);
    await s.close();
  }, 180_000);
});

describe("D-1 operator ingress: a confirmed stop that did not finish is reconciled by its ORIGINAL identity", () => {
  it("a retained CONFIRMED cessation that never reached canon, and one whose chain stopped half-way, are both finished by reconcile, never re-asked", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    await inFlight(s);
    // the trusted side retained the confirmed stop and then crashed before the gateway was invoked
    const retained = await s.ledger.record({
      kind: "COLLECTION_CESSATION",
      intent_id: "operator-intent:lost-stop",
      pc_id: PC,
      choice: {
        pc_id: PC,
        act_id: act("c1"),
        authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      },
      publication: {
        cause: "operator-cessation-cause:lost",
        basis: "local-operator-confirmed-choice",
        secrecy: "local-operator-session",
      },
    });
    expect(retained.ok).toBe(true);
    // and the chain is left half-way: the PC's request is committed, Production has not resolved it
    const requested = await new PcCollectionAdapter(s.campaign.store).cease({
      group_id: "lost-group",
      intent_id: "lost-intent",
      cause: "lost-cause",
      basis: "local-operator-confirmed-choice",
      secrecy: "local-operator-session",
      cessation: {
        pc_id: PC,
        act_id: act("c1"),
        authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      },
    });
    expect(requested.ok).toBe(true);
    expect(holdOf(s)).toEqual({ state: "CESSATION_REQUESTED", act_id: act("c1") });
    await s.close();

    const r = await openSession(dirs);
    expect(holdOf(r)).toEqual({ state: "CESSATION_REQUESTED", act_id: act("c1") });
    const t = scriptedTerminal();
    const out = await reconcile(ctxOf(r, t));
    expect(out.map((o) => o.status)).toEqual(["COLLECTION_COMMITTED"]);
    expect(t.asked()).toBe(0);
    expect(holdOf(r)).toEqual({ state: "NONE" });
    expect(readLedger({ operatorDir: dirs.operatorDir }).intents.at(-1).status).toBe("COMMITTED");
    expect(r.campaign.store.getFact(keys(act("c1")).termination)).toBeDefined();
    // presenting it again writes nothing new
    const head = sha(r);
    expect((await reconcile(ctxOf(r, scriptedTerminal()))).map((o) => o.status)).toEqual([
      "NOTHING_TO_RECONCILE",
    ]);
    expect(sha(r)).toBe(head);
    expect(sourceAmount(r)).toBe(5);
    expect(reserveAmount(r)).toBe(0);
    await r.close();
  }, 180_000);
});
