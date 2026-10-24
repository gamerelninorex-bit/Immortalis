/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and ledger values */
// CPAA-C1 (v0.3 design ratified; implementation acceptance pending) — the NON-FIXTURE ingress. The only way a collection attempt reaches `bindTrustedConfirmedPcCollectionContext`
// here is the operator's own fresh console confirmation of exactly that attempt (the same existing player-confirmation authority the
// relocation and the time-advance choices use): the act identity is minted by the trusted side before the first write, retained
// durably, and everything after it is the owners' own path. Nothing below calls the test fixture `trustedCollection`.
// Positive: confirmed attempt → commitment/request → role.gm reading → Production's start → the player's SEPARATE time choice → source
// 5→2, Reserve 0→3. Negatives: every unconfirmed or invented attempt writes nothing. A scripted reading host proves transport only.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  collect,
  collectContinue,
  collectFinish,
  pcTargetAdvance,
  reconcile,
} from "@immortalis/operator";
import { T0, TAU, W, MECH, PC, collectionCampaign, hostAnswer } from "../support/pc-collection.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { SRC_BASIS_ID, SRC_RESERVE, SRC_SOURCE_KEY, SRC_UNIT } from "@immortalis/testkit";
import { readLedger } from "../support/operator-pc-target.ts";
import { pcCollectionCommitmentKey, pcCollectionRequestKey } from "@immortalis/contracts";

/** A CLOSED campaign directory: the active PC, its authored contract and mechanism, a source of five, an empty Reserve, the basis. */
async function template(o: Parameters<typeof collectionCampaign>[0] = {}): Promise<string> {
  const dir = (await import("../support/tmp.ts")).tempDir("immortalis-operator-collect-");
  const s = await collectionCampaign({ ...o, dir });
  await s.campaign.close();
  return dir;
}

const INPUT = (amount = 3, over: Record<string, unknown> = {}) => ({
  source: { world_id: W, source_key: SRC_SOURCE_KEY },
  reserve_id: SRC_RESERVE,
  quantity: { amount, unit: SRC_UNIT },
  mechanism_id: MECH,
  basis_id: SRC_BASIS_ID,
  ...over,
});

/** The scripted `role.gm` host: it reads the verbatim quotations of the delivered task and states readings only (never a verdict). */
const gm =
  (
    path: "OPEN" | "CLOSED" = "OPEN",
    mechanism: "ABLE_TO_PASS" | "UNABLE_TO_PASS" | "NOT_AT_ISSUE" = "NOT_AT_ISSUE",
  ) =>
  async (task: Parameters<typeof hostAnswer>[0]) =>
    hostAnswer(task, path, mechanism);

const sourceAmount = (s: Awaited<ReturnType<typeof openSession>>) =>
  (s.campaign.store.getFact(`world/${W}/source/${SRC_SOURCE_KEY}`)!.value as any).recoverable
    .amount;
const reserveAmount = (s: Awaited<ReturnType<typeof openSession>>) =>
  (s.campaign.store.getFact(`production/reserve/${SRC_RESERVE}`)!.value as any).quantity.amount;
const act = (uid: string) => `operator-act-${uid}`;

describe("the operator's confirmation is the only ingress: positive over the whole chain", () => {
  it("confirm → commitment and request → reading → start → the player's separate time choice → source 5→2, Reserve 0→3; a second confirmed attempt for 3 meets the real 2", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    expect(sourceAmount(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);

    // the player confirms ONE exact attempt at the console
    const t = scriptedTerminal("confirm");
    const out = await collect(ctxOf(s, t, fixedIds("c1")), INPUT());
    expect(out.status).toBe("COLLECTION_COMMITTED");
    expect(t.asked()).toBe(1);
    const shown = t.said.join("\n");
    expect(shown).toContain(PC);
    expect(shown).toMatch(/attempt to collect 3 \S+ of/);
    expect(shown).toMatch(/willingness to ATTEMPT only/);
    // the immutable act identity was minted by the trusted side and retained BEFORE canon held anything of it
    const ledger = readLedger({ operatorDir: dirs.operatorDir });
    expect(ledger.intents).toHaveLength(1);
    expect(ledger.intents[0]).toMatchObject({
      kind: "COLLECTION",
      status: "COMMITTED",
      pc_id: PC,
      choice: { act_id: act("c1"), quantity: { amount: 3 } },
    });
    expect(s.campaign.store.getFact(pcCollectionCommitmentKey(PC, act("c1")))).toBeDefined();
    expect(s.campaign.store.getFact(pcCollectionRequestKey(PC, act("c1")))).toBeDefined();
    // willingness only: nothing is extracted and nothing moved
    expect(sourceAmount(s)).toBe(5);

    // the reading and Production's own start (no new question, no new confirmation)
    const started = await collectContinue({
      ...ctxOf(s, scriptedTerminal(), fixedIds("x")),
      reachHost: gm(),
    });
    expect(started.status).toBe("COLLECTION_COMMITTED");
    expect(sourceAmount(s)).toBe(5);

    // while the work is pending the operator's arbitrary-target route refuses WHATEVER horizon is asked: short of the boundary, at it,
    // beyond it, or malformed — the refusal is a fact about the pending work, never a function of the requested time (C8)
    const end = T0.value + 3 * TAU;
    for (const value of [T0.value + 1, end - 1, end, end + 100]) {
      const t1 = scriptedTerminal("confirm");
      const refused = await pcTargetAdvance(ctxOf(s, t1, fixedIds(`r${value}`)), {
        target: { unit: T0.unit, value },
      });
      expect(refused.status, String(value)).toBe("UNAVAILABLE");
      expect(t1.asked()).toBe(0);
    }
    expect((await pcTargetAdvance(ctxOf(s, scriptedTerminal(), fixedIds("rx")), {})).status).toBe(
      "UNAVAILABLE",
    );
    expect(sourceAmount(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);

    // the player's SEPARATE finish choice: no horizon is stated, the target is derived from the admitted work, and it needs its own
    // confirmation
    const tf = scriptedTerminal("confirm");
    const finished = await collectFinish(ctxOf(s, tf, fixedIds("t2")));
    expect(finished.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(tf.asked()).toBe(1);
    expect(tf.said.join("\n")).toMatch(/You state no time here/);
    expect(tf.said.join("\n")).toContain(`${end} ${T0.unit}`);
    expect(sourceAmount(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    // with nothing pending, the arbitrary-target route is available again
    expect(
      (
        await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds("t3")), {
          target: { unit: T0.unit, value: end + 1 },
        })
      ).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");

    // act B: a NEW confirmation for 3 meets the real remaining 2 at Production's own admission
    const second = await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c2")), INPUT());
    expect(second.status).toBe("COLLECTION_COMMITTED");
    expect(
      readLedger({ operatorDir: dirs.operatorDir }).intents.filter(
        (i: any) => i.kind === "COLLECTION",
      ),
    ).toHaveLength(2);
    const refused = await collectContinue({
      ...ctxOf(s, scriptedTerminal(), fixedIds("x")),
      reachHost: gm(),
    });
    expect(refused.status).toBe("UNAVAILABLE");
    expect(sourceAmount(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    await s.close();
  }, 120_000);

  it("reopen: a retained CONFIRMED attempt that never reached canon is reconciled by its ORIGINAL act identity, not a new one", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    // the trusted side retained the confirmed attempt and then crashed before the gateway was invoked
    const retained = await s.ledger.record({
      kind: "COLLECTION",
      intent_id: "operator-intent:lost",
      pc_id: PC,
      choice: {
        pc_id: PC,
        act_id: act("lost"),
        source: { world_id: W, source_key: SRC_SOURCE_KEY },
        reserve_id: SRC_RESERVE,
        quantity: { amount: 3, unit: SRC_UNIT },
        authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      },
      mechanism_id: MECH,
      basis_id: SRC_BASIS_ID,
      publication: {
        cause: "operator-collection-cause:lost",
        basis: "local-operator-confirmed-choice",
        secrecy: "local-operator-session",
      },
    });
    expect(retained.ok).toBe(true);
    await s.close();

    const r = await openSession(dirs);
    expect(r.campaign.store.getFact(pcCollectionCommitmentKey(PC, act("lost")))).toBeUndefined();
    const out = await reconcile(ctxOf(r, scriptedTerminal()));
    expect(out.map((o) => o.status)).toEqual(["COLLECTION_COMMITTED"]);
    expect(r.campaign.store.getFact(pcCollectionCommitmentKey(PC, act("lost")))).toBeDefined();
    expect(readLedger({ operatorDir: dirs.operatorDir }).intents[0].status).toBe("COMMITTED");
    // and presenting it again writes nothing new
    const head = r.campaign.store.head().state_sha256;
    expect((await reconcile(ctxOf(r, scriptedTerminal()))).map((o) => o.status)).toEqual([
      "NOTHING_TO_RECONCILE",
    ]);
    expect(r.campaign.store.head().state_sha256).toBe(head);
    await r.close();
  }, 120_000);
});

describe("no unconfirmed or invented attempt reaches the owners", () => {
  const untouched = async (
    attempt: (
      s: Awaited<ReturnType<typeof openSession>>,
      dirs: ReturnType<typeof copyCampaign>,
    ) => Promise<unknown>,
    shared?: string,
  ) => {
    const dirs = copyCampaign(shared ?? (await template()));
    const s = await openSession(dirs);
    const head = s.campaign.store.head().state_sha256;
    const out = await attempt(s, dirs);
    expect(s.campaign.store.head().state_sha256).toBe(head);
    expect(s.ledger.collections()).toHaveLength(0);
    await s.close();
    return out;
  };

  it("a declined, mistyped, stale or end-of-input confirmation commits nothing and retains nothing", async () => {
    const shared = await template();
    for (const reply of [
      "decline",
      "eof",
      "stale",
      () => "collect 000000000000",
      () => "",
    ] as const) {
      const t = scriptedTerminal(reply as never);
      const out = (await untouched(
        (s) => collect(ctxOf(s, t, fixedIds("n1")), INPUT()),
        shared,
      )) as any;
      expect(out.status, String(reply)).toBe("DECLINED");
      expect(t.asked()).toBe(1);
    }
  }, 120_000);

  it("an attempt that names an antecedent canon does not hold is never offered: the console is not even asked", async () => {
    const shared = await template();
    for (const over of [
      { source: { world_id: W, source_key: "no-such-source" } },
      { reserve_id: "no-such-reserve" },
      { mechanism_id: "no-such-mechanism" },
    ]) {
      const t = scriptedTerminal("confirm");
      const out = (await untouched(
        (s) => collect(ctxOf(s, t, fixedIds("n2")), INPUT(3, over)),
        shared,
      )) as any;
      expect(out.status, JSON.stringify(over)).toBe("UNAVAILABLE");
      expect(t.asked()).toBe(0);
    }
  }, 120_000);

  it("an input that tries to state an identity, authority, boundary, duration, verdict or result is not a choice", async () => {
    const shared = await template();
    for (const extra of [
      { act_id: "act-mine" },
      { authored_under: { role: "role.player", permission: "permission.player_choice.commit" } },
      { role: "role.player" },
      { boundary_at: { unit: T0.unit, value: 101 } },
      { duration: { unit: T0.unit, value: 1 } },
      { verdict: "REACHABLE" },
      { confirmed: true },
      { pc_id: "someone-else" },
    ]) {
      const t = scriptedTerminal("confirm");
      const out = (await untouched(
        (s) => collect(ctxOf(s, t, fixedIds("n3")), INPUT(3, extra)),
        shared,
      )) as any;
      expect(out.status, JSON.stringify(extra)).toBe("INVALID_INPUT");
      expect(t.asked()).toBe(0);
    }
    for (const bad of [
      undefined,
      null,
      3,
      "collect",
      [],
      { quantity: { amount: 0, unit: SRC_UNIT } },
    ]) {
      const t = scriptedTerminal("confirm");
      const out = (await untouched(
        (s) => collect(ctxOf(s, t, fixedIds("n4")), bad),
        shared,
      )) as any;
      expect(out.status, JSON.stringify(bad)).toBe("INVALID_INPUT");
      expect(t.asked()).toBe(0);
    }
  }, 120_000);

  it("continuing with no confirmed attempt does nothing, whoever supplies a reading; a missing or ungrounded reading holds a confirmed attempt", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    const head = s.campaign.store.head().state_sha256;
    // nothing confirmed: a host cannot create the player's decision, with or without a reading
    expect(
      (await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost: gm() })).status,
    ).toBe("NOTHING_TO_RECONCILE");
    expect(s.campaign.store.head().state_sha256).toBe(head);

    // confirmed, but no reading source is configured: the attempt is held (committed, not started, nothing occupied)
    expect(
      (await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("h1")), INPUT())).status,
    ).toBe("COLLECTION_COMMITTED");
    const held = s.campaign.store.head().state_sha256;
    expect((await collectContinue(ctxOf(s, scriptedTerminal()))).status).toBe("UNAVAILABLE");
    // a reading that states a verdict, an unquoted ground, or is not an object is set aside
    for (const reachHost of [
      async (task: any) => ({ ...hostAnswer(task, "OPEN", "NOT_AT_ISSUE"), verdict: "REACHABLE" }),
      async (task: any) => ({
        ...hostAnswer(task, "OPEN", "NOT_AT_ISSUE"),
        path: { reading: "OPEN", grounds: ["the way is wide open and clear"] },
      }),
      async () => "REACHABLE",
      async () => null,
      async () => {
        throw new Error("host unavailable");
      },
    ]) {
      expect((await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost })).status).toBe(
        "UNAVAILABLE",
      );
      expect(s.campaign.store.head().state_sha256).toBe(held);
    }
    expect(sourceAmount(s)).toBe(5);
    await s.close();
  }, 120_000);

  it("a different attempt cannot replace an unfinished confirmed one, and no earlier confirmation stands for a later attempt", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    // retain a CONFIRMED (never presented) attempt, then ask for a DIFFERENT amount: refused without asking
    await s.ledger.record({
      kind: "COLLECTION",
      intent_id: "operator-intent:open",
      pc_id: PC,
      choice: {
        pc_id: PC,
        act_id: act("open"),
        source: { world_id: W, source_key: SRC_SOURCE_KEY },
        reserve_id: SRC_RESERVE,
        quantity: { amount: 3, unit: SRC_UNIT },
        authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      },
      mechanism_id: MECH,
      basis_id: SRC_BASIS_ID,
      publication: {
        cause: "c",
        basis: "local-operator-confirmed-choice",
        secrecy: "local-operator-session",
      },
    });
    const t = scriptedTerminal("confirm");
    expect((await collect(ctxOf(s, t, fixedIds("n5")), INPUT(2))).status).toBe("CHANGED_CHOICE");
    expect(t.asked()).toBe(0);
    await s.close();
  }, 120_000);

  it("the finish is offered only for work positively in flight, and it needs its own confirmation: no work, a declined or an end-of-input confirmation moves no time", async () => {
    const dirs = copyCampaign(await template());
    const s = await openSession(dirs);
    const head = () => s.campaign.store.head().state_sha256;
    const start = head();
    // nothing is in flight: the console is not even asked
    const none = scriptedTerminal("confirm");
    expect((await collectFinish(ctxOf(s, none, fixedIds("n0")))).status).toBe("UNAVAILABLE");
    expect(none.asked()).toBe(0);
    expect(head()).toBe(start);
    // a confirmed attempt that is merely committed (not started) is not in flight either
    expect(
      (await collect(ctxOf(s, scriptedTerminal("confirm"), fixedIds("c1")), INPUT())).status,
    ).toBe("COLLECTION_COMMITTED");
    const committed = head();
    expect(
      (await collectFinish(ctxOf(s, scriptedTerminal("confirm"), fixedIds("n1")))).status,
    ).toBe("UNAVAILABLE");
    expect(head()).toBe(committed);
    // in flight: a declined or ended confirmation moves nothing
    expect(
      (await collectContinue({ ...ctxOf(s, scriptedTerminal()), reachHost: gm() })).status,
    ).toBe("COLLECTION_COMMITTED");
    const flying = head();
    expect(
      (await collectFinish(ctxOf(s, scriptedTerminal("decline"), fixedIds("n2")))).status,
    ).toBe("DECLINED");
    expect((await collectFinish(ctxOf(s, scriptedTerminal("eof"), fixedIds("n3")))).status).toBe(
      "DECLINED",
    );
    expect(head()).toBe(flying);
    expect(sourceAmount(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    await s.close();
  }, 180_000);
});
