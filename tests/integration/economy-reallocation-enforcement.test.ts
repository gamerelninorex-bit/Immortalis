/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and group content */
// Conserved OOC reallocation between two Economic Holding / Account positions — enforcement and refusal: Economy alone
// re-derives eligibility and both resulting positions, so an unavailable, encumbered, incompatible, duplicate, stale,
// cross-campaign or authority/restriction-bearing instruction is refused without any debit or credit; a raw
// `store.commit`, a malformed or tampered group, a foreign owner, a missing or orphaned record and a tampered journal or
// state are each refused or detected (WS-004 §3, §4, §20, §30 invariants 17–18; IM-11, IM-12). Interrupted recovery is
// in economy-reallocation-recovery.test.ts.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  economyHoldingKey,
  economyReallocationKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EconomyAdapter,
  deriveReallocation,
  factKind,
  verifyEconomyIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  HOLDING_1,
  HOLDING_2,
  HOLDING_UNIT,
  PREMISE_1,
  REALLOCATION_1,
  establishHoldingInput,
  holdInstruction,
  holdingActPublication,
  holdingPublication,
  reallocationInstruction,
} from "@immortalis/testkit";
import {
  holdingSummary,
  seededReallocationCampaign,
  type HoldingSeeded,
} from "../support/economy-holding.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const key1 = economyHoldingKey(HOLDING_1);
const key2 = economyHoldingKey(HOLDING_2);
const recKey = economyReallocationKey(REALLOCATION_1);

const realloc = (
  s: HoldingSeeded,
  n: number,
  ...args: Parameters<typeof reallocationInstruction>
) =>
  s.economy.reallocateHoldings({
    ...holdingActPublication(n),
    reallocation: reallocationInstruction(...args),
  });

/** A store whose Economy groups are altered on the way in, to prove IM-11 (not the adapter) refuses them. */
function tamperStore(inner: CampaignStore, mutate: (g: CommitGroup) => CommitGroup) {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      n += 1;
      return inner.commit(mutate(g as CommitGroup));
    },
  };
  return { store, tampered: () => n };
}

const edit = (g: CommitGroup, key: string, f: (v: any) => void): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    if (w.key !== key) return w;
    const value = structuredClone(w.value) as any;
    f(value);
    return { ...w, value };
  }),
});

/** The group a lawful reallocation of `amount` from A to B commits, derived the way Economy derives it. */
function lawfulGroup(s: HoldingSeeded, amount = 3, over: Partial<CommitGroup> = {}): CommitGroup {
  const a = s.economy.holding(HOLDING_1)!;
  const b = s.economy.holding(HOLDING_2)!;
  const d = deriveReallocation({
    from: { value: a.value, version: a.fact.version },
    to: { value: b.value, version: b.fact.version },
    pinnedFromVersion: a.fact.version,
    pinnedToVersion: b.fact.version,
    reallocationId: REALLOCATION_1,
    instructionId: "instruction-reallocation-1",
    quantity: { amount, unit: HOLDING_UNIT },
  });
  if (!d.ok) throw new Error(d.error.message);
  const kind = factKind("economy_holding");
  const write = (key: string, value: unknown, expected_version: number) => ({
    key,
    owner: kind.owner,
    facet: kind.facet,
    value: value as never,
    unit: null,
    basis: "fixture-basis",
    secrecy: "fixture-visibility",
    expected_version,
  });
  return {
    campaign_id: s.campaign.store.head().campaign_id,
    group_id: "raw-group-1",
    intent_id: "raw-intent-1",
    owner: kind.owner,
    facet: kind.facet,
    cause: "raw-cause-1",
    rule: kind.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      write(key1, d.value.from, a.fact.version),
      write(key2, d.value.to, b.fact.version),
      write(recKey, d.value.reallocation, 0),
    ],
    ...over,
  };
}

describe("Economy refuses what it cannot lawfully derive, with no debit or credit (WS-004 §3, §4, §20)", () => {
  async function refused(
    run: (s: HoldingSeeded) => Promise<unknown>,
    code: string,
    seed: (dir: string) => Promise<HoldingSeeded> = (dir) => seededReallocationCampaign(dir),
  ) {
    const s = await seed(tempDir());
    const before = holdingSummary(s.campaign.store);
    expect(await codeOf(run(s) as never)).toBe(code);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.campaign.verify()).toEqual([]);
    expect(s.economy.reallocation(REALLOCATION_1)).toBeUndefined();
    return s;
  }

  it("an opening available of 2 cannot send 3", async () => {
    await refused(
      (s) => realloc(s, 1, 1, 1, 3, { from: HOLDING_2, to: HOLDING_1 }),
      "INSUFFICIENT_AVAILABLE",
    );
    await refused(
      (s) => realloc(s, 1, 1, 1, 3),
      "INSUFFICIENT_AVAILABLE",
      (dir) => seededReallocationCampaign(dir, { amountA: 2 }),
    );
  });

  it("a source encumbered 5 of 7 cannot send 3, and the encumbrance is untouched by the refusal", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, "hold-a", 5),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    expect(await codeOf(realloc(s, 2, 2, 1, 3))).toBe("INSUFFICIENT_AVAILABLE");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.economy.encumbrance(HOLDING_1, "hold-a")!.value.lifecycle_status).toBe("active");
  });

  it("an incompatible object or unit is never converted: no debit, no credit", async () => {
    // another object: a third position of a different object
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.establishHolding({
        ...holdingPublication(3),
        holding: establishHoldingInput({
          holding_id: "holding-3",
          holder_ref: "holder-third",
          object_ref: "object-other",
          amount: 4,
          premise_id: "premise-3",
        }),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    expect(await codeOf(realloc(s, 1, 1, 1, 3, { to: "holding-3" }))).toBe(
      "INSUFFICIENT_AVAILABLE",
    );
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    // another unit: a third position of the same object in a different unit
    await must(
      s.economy.establishHolding({
        ...holdingPublication(4),
        holding: establishHoldingInput({
          holding_id: "holding-4",
          holder_ref: "holder-fourth",
          unit: "unit-other",
          amount: 4,
          premise_id: "premise-4",
        }),
      }),
    );
    const before2 = holdingSummary(s.campaign.store);
    expect(await codeOf(realloc(s, 2, 1, 1, 3, { to: "holding-4" }))).toBe(
      "INSUFFICIENT_AVAILABLE",
    );
    // an instruction in the wrong unit for two correctly-united positions
    expect(await codeOf(realloc(s, 3, 1, 1, 3, { unit: "unit-other" }))).toBe(
      "INSUFFICIENT_AVAILABLE",
    );
    expect(holdingSummary(s.campaign.store)).toEqual(before2);
  });

  it("a missing or unknown position (either side) is refused", async () => {
    await refused(
      (s) => realloc(s, 1, 1, 1, 3, { from: "holding-unknown" }),
      "PREREQUISITE_MISSING",
    );
    await refused((s) => realloc(s, 1, 1, 1, 3, { to: "holding-unknown" }), "PREREQUISITE_MISSING");
    await refused(
      (s) => realloc(s, 1, 1, 1, 3, { from: "holding-unknown", to: "holding-unknown-too" }),
      "PREREQUISITE_MISSING",
    );
  });

  it("the same position as both sides is refused", async () => {
    await refused(
      (s) => realloc(s, 1, 1, 1, 1, { from: HOLDING_1, to: HOLDING_1 }),
      "INPUT_INVALID",
    );
  });

  it("a cross-campaign or missing-campaign instruction is refused before any result", async () => {
    await refused(
      (s) => realloc(s, 1, 1, 1, 3, { campaign_id: "another-campaign" }),
      "INPUT_INVALID",
    );
    await refused((s) => {
      const { campaign_id: _omitted, ...withoutCampaign } = reallocationInstruction(1, 1, 3);
      void _omitted;
      return s.economy.reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: withoutCampaign,
      });
    }, "INPUT_INVALID");
  });

  it("an instruction can carry no result, verdict, approval, restriction/authority, title, price or consent", async () => {
    const extras: Array<[string, unknown]> = [
      ["from_after", { available: 4 }],
      ["to_after", { available: 5 }],
      ["transfer_succeeded", true],
      ["economically_settled", true],
      ["approved", true],
      ["winner", HOLDING_2],
      ["owner_result", "ACCEPTED"],
      ["in_world_consent", "ASSERTED"],
      ["restriction_or_authority_ref", "authority-1"],
      ["legal_priority", 1],
      ["title", "deed-1"],
      ["price", { amount: 1, unit: HOLDING_UNIT }],
      ["settlement_date", "2026-10-10"],
    ];
    for (const [field, value] of extras)
      await refused(
        (s) =>
          s.economy.reallocateHoldings({
            ...holdingActPublication(1),
            reallocation: { ...reallocationInstruction(1, 1, 3), [field]: value },
          }),
        "INPUT_INVALID",
      );
    // nor inside either side's reference or the quantity
    await refused(
      (s) =>
        s.economy.reallocateHoldings({
          ...holdingActPublication(1),
          reallocation: {
            ...reallocationInstruction(1, 1, 3),
            from: { ...reallocationInstruction(1, 1, 3).from, restriction_or_authority_ref: "a" },
          },
        }),
      "INPUT_INVALID",
    );
    // a malformed amount (zero, negative, fractional) or malformed versions are not instructions at all
    for (const amount of [0, -1, 1.5])
      await refused((s) => realloc(s, 1, 1, 1, amount), "INPUT_INVALID");
    await refused((s) => realloc(s, 1, 0, 1, 3), "INPUT_INVALID");
  });

  it("stale versions on either position are refused; a re-read then succeeds", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, "hold-a", 1),
      }),
    ); // A now at version 2
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(1, "hold-b", 1, { holding_id: HOLDING_2 }),
      }),
    ); // B now at version 2
    const before = holdingSummary(s.campaign.store);
    expect(await codeOf(realloc(s, 3, 1, 2, 3))).toBe("VERSION_CONFLICT");
    expect(await codeOf(realloc(s, 4, 2, 1, 3))).toBe("VERSION_CONFLICT");
    expect(await codeOf(realloc(s, 5, 9, 2, 3))).toBe("VERSION_CONFLICT");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    await must(realloc(s, 6, 2, 2, 3));
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 3, encumbered: 1 });
    expect(s.economy.availability(HOLDING_2)).toMatchObject({ available: 4, encumbered: 1 });
  });

  it("positions of different visibility cannot share one reallocation record", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(
      s.economy.establishHolding({
        ...holdingPublication(3),
        secrecy: "another-visibility",
        holding: establishHoldingInput({
          holding_id: "holding-3",
          holder_ref: "holder-third",
          amount: 4,
          premise_id: "premise-3",
        }),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    expect(await codeOf(realloc(s, 1, 1, 1, 3, { to: "holding-3" }))).toBe("INPUT_INVALID");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
  });
});

describe("identity and idempotency: the same instruction takes effect once, a changed one is never applied twice", () => {
  it("re-presenting the same reallocation (same intent, same content) replays the original receipt and changes nothing", async () => {
    const s = await seededReallocationCampaign(tempDir());
    const first = await must(realloc(s, 1, 1, 1, 3));
    const before = holdingSummary(s.campaign.store);
    const again = await must(realloc(s, 1, 1, 1, 3));
    expect(again.replayed).toBe(true);
    expect(again.receipt.group_sha256).toBe(first.receipt.group_sha256);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 4 });
    expect(s.economy.availability(HOLDING_2)).toMatchObject({ available: 5 });
  });

  it("the same intent with changed content (amount, versions, instruction, positions, reallocation identity) is a conflict", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(realloc(s, 1, 1, 1, 3));
    const before = holdingSummary(s.campaign.store);
    for (const changed of [
      reallocationInstruction(1, 1, 2),
      reallocationInstruction(2, 1, 3),
      reallocationInstruction(1, 2, 3),
      reallocationInstruction(1, 1, 3, { instruction_id: "another-instruction" }),
      reallocationInstruction(1, 1, 3, { reallocation_id: "reallocation-9" }),
      reallocationInstruction(1, 1, 3, { from: HOLDING_2, to: HOLDING_1 }),
    ])
      expect(
        await codeOf(
          s.economy.reallocateHoldings({ ...holdingActPublication(1), reallocation: changed }),
        ),
      ).toBe("INTENT_CONFLICT");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
  });

  it("a changed intent for the same reallocation is a duplicate and is refused; a reused reallocation identity is spent", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(realloc(s, 1, 1, 1, 3));
    const before = holdingSummary(s.campaign.store);
    // the same content under a NEW intent: positions have moved on and the identity is spent
    expect(await codeOf(realloc(s, 2, 1, 1, 3))).toBe("VERSION_CONFLICT");
    // freshly read versions, same reallocation identity, even another amount
    expect(await codeOf(realloc(s, 3, 2, 2, 1))).toBe("VERSION_CONFLICT");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    // a group identity that belongs to a different intent is refused
    expect(
      await codeOf(
        s.economy.reallocateHoldings({
          group_id: holdingActPublication(1).group_id,
          intent_id: "another-intent",
          cause: "another-cause",
          reallocation: reallocationInstruction(2, 2, 1, { reallocation_id: "reallocation-2" }),
        }),
      ),
    ).not.toBe("OK");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
  });

  it("replays after the world has moved on (a later hold on the receiver): still no second effect", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await must(realloc(s, 1, 1, 1, 3));
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(2, "hold-b", 5, { holding_id: HOLDING_2 }),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    const again = await must(realloc(s, 1, 1, 1, 3));
    expect(again.replayed).toBe(true);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.economy.availability(HOLDING_2)).toMatchObject({ available: 0, encumbered: 5 });
  });
});

describe("concurrency: simultaneous incompatible claims never double-spend a position (WS-004 §4, §30 invariant 18)", () => {
  it("two reallocations of the same source pinned at the same versions: exactly one is admitted, the total never changes", async () => {
    const s = await seededReallocationCampaign(tempDir());
    const results = await Promise.all([
      realloc(s, 1, 1, 1, 4, { reallocation_id: "reallocation-a" }),
      realloc(s, 2, 1, 1, 4, { reallocation_id: "reallocation-b" }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok)!;
    expect(loser.ok ? "" : loser.error.code).toMatch(/VERSION_CONFLICT|INSUFFICIENT_AVAILABLE/);
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 3 });
    expect(s.economy.availability(HOLDING_2)).toMatchObject({ available: 6 });
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("economy/reallocation/")),
    ).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a stale loser re-reads and is then judged on the real remaining availability", async () => {
    const s = await seededReallocationCampaign(tempDir());
    await Promise.all([
      realloc(s, 1, 1, 1, 4, { reallocation_id: "reallocation-a" }),
      realloc(s, 2, 1, 1, 4, { reallocation_id: "reallocation-b" }),
    ]);
    const winner = s.economy.reallocation("reallocation-a") ? "reallocation-a" : "reallocation-b";
    const loser = winner === "reallocation-a" ? "reallocation-b" : "reallocation-a";
    expect(await codeOf(realloc(s, 3, 2, 2, 4, { reallocation_id: loser }))).toBe(
      "INSUFFICIENT_AVAILABLE",
    );
    await must(realloc(s, 4, 2, 2, 3, { reallocation_id: loser }));
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 0 });
    expect(s.economy.availability(HOLDING_2)).toMatchObject({ available: 9 });
  });

  it("a simultaneous hold and reallocation of the same source serialize: the available amount is spent once", async () => {
    const s = await seededReallocationCampaign(tempDir());
    const results = await Promise.all([
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, "hold-a", 5),
      }),
      realloc(s, 2, 1, 1, 5),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const a = s.economy.availability(HOLDING_1)!;
    const b = s.economy.availability(HOLDING_2)!;
    expect(a.available + a.encumbered + b.available + b.encumbered).toBe(9);
    expect(a.available).toBe(2);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a simultaneous reallocation and a hold on the RECEIVER serialize (the receiver's version is part of the claim)", async () => {
    const s = await seededReallocationCampaign(tempDir());
    const results = await Promise.all([
      realloc(s, 1, 1, 1, 3),
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(1, "hold-b", 2, { holding_id: HOLDING_2 }),
      }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const a = s.economy.availability(HOLDING_1)!;
    const b = s.economy.availability(HOLDING_2)!;
    expect(a.available + a.encumbered + b.available + b.encumbered).toBe(9);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("IM-11 re-derives every reallocation: Economy's result, not the group's claim", () => {
  async function tampered(mutate: (g: CommitGroup) => CommitGroup) {
    const s = await seededReallocationCampaign(tempDir());
    const t = tamperStore(s.campaign.store, mutate);
    const before = holdingSummary(s.campaign.store);
    const r = await new EconomyAdapter(t.store).reallocateHoldings({
      ...holdingActPublication(1),
      reallocation: reallocationInstruction(1, 1, 3),
    });
    expect(t.tampered()).toBe(1);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    return r.ok ? "OK" : `${r.error.code}: ${r.error.message}`;
  }

  it("the untampered group commits (control), and a raw commit of exactly the derived group is lawful", async () => {
    const s = await seededReallocationCampaign(tempDir());
    const t = tamperStore(s.campaign.store, (g) => g);
    await must(
      new EconomyAdapter(t.store).reallocateHoldings({
        ...holdingActPublication(1),
        reallocation: reallocationInstruction(1, 1, 3),
      }),
    );
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 4 });

    const raw = await seededReallocationCampaign(tempDir());
    const r = await raw.campaign.store.commit(lawfulGroup(raw));
    expect(r.ok).toBe(true);
    expect(raw.economy.availability(HOLDING_1)).toMatchObject({ available: 4 });
    expect(raw.economy.availability(HOLDING_2)).toMatchObject({ available: 5 });
    expect(raw.campaign.verify()).toEqual([]);
  });

  const cases: Array<[string, (g: CommitGroup) => CommitGroup, RegExp]> = [
    [
      "value destroyed (the source debited, the receiver not credited)",
      (g) =>
        edit(g, key2, (v) => {
          v.quantity_or_bounded_position.available = 2;
          v.quantity_or_bounded_position.reallocated_in = 0;
        }),
      /VALUE_INVALID/,
    ],
    [
      "value created (the receiver credited more than the source was debited)",
      (g) =>
        edit(g, key2, (v) => {
          v.quantity_or_bounded_position.available = 6;
          v.quantity_or_bounded_position.reallocated_in = 4;
        }),
      /exactly the conserved movement/,
    ],
    [
      "an unrecorded credit: the receiver's available grows but its reallocated-in does not",
      (g) =>
        edit(g, key2, (v) => {
          delete v.quantity_or_bounded_position.reallocated_in;
        }),
      /VALUE_INVALID/,
    ],
    [
      "the source's debit hidden: available falls but nothing is recorded as moved out",
      (g) =>
        edit(g, key1, (v) => {
          delete v.quantity_or_bounded_position.reallocated_out;
        }),
      /VALUE_INVALID/,
    ],
    [
      "a rewritten established amount",
      (g) =>
        edit(g, key1, (v) => {
          v.quantity_or_bounded_position.established = 4;
          v.quantity_or_bounded_position.available = 4;
          delete v.quantity_or_bounded_position.reallocated_out;
        }),
      /exactly the conserved movement/,
    ],
    [
      "a conserved but wrong amount (the record says 3, the positions moved 2)",
      (g) =>
        edit(
          edit(g, key1, (v) => {
            v.quantity_or_bounded_position.available = 5;
            v.quantity_or_bounded_position.reallocated_out = 2;
          }),
          key2,
          (v) => {
            v.quantity_or_bounded_position.available = 4;
            v.quantity_or_bounded_position.reallocated_in = 2;
          },
        ),
      /exactly the conserved movement/,
    ],
    [
      "a record larger than what is wholly available on the source",
      (g) =>
        edit(
          edit(
            edit(g, recKey, (v) => {
              v.quantity.amount = 9;
            }),
            key1,
            (v) => {
              v.quantity_or_bounded_position.available = 0;
              v.quantity_or_bounded_position.reallocated_out = 7;
            },
          ),
          key2,
          (v) => {
            v.quantity_or_bounded_position.available = 9;
            v.quantity_or_bounded_position.reallocated_in = 7;
          },
        ),
      /not wholly available/,
    ],
    [
      "a record in another unit",
      (g) =>
        edit(g, recKey, (v) => {
          v.quantity.unit = "another-unit";
        }),
      /own unit/,
    ],
    [
      "a record of another object",
      (g) =>
        edit(g, recKey, (v) => {
          v.object_ref = "another-object";
        }),
      /exactly the conserved movement/,
    ],
    [
      "a record that names versions that are not the current ones",
      (g) =>
        edit(g, recKey, (v) => {
          v.from.admitted_at_holding_version = 5;
        }),
      /no longer current/,
    ],
    [
      "a record that names another holder than the position's",
      (g) =>
        edit(g, recKey, (v) => {
          v.to.holder_ref = "someone-else";
        }),
      /exactly the conserved movement/,
    ],
    [
      "a record that asserts in-world consent",
      (g) =>
        edit(g, recKey, (v) => {
          v.authorization.in_world_consent = "ASSERTED";
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a record that claims a title, payment or settlement",
      (g) =>
        edit(g, recKey, (v) => {
          v.nature = "TITLE_TRANSFER_AND_PAYMENT";
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a record carrying a smuggled result or verdict",
      (g) =>
        edit(g, recKey, (v) => {
          v.transfer_succeeded = true;
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a position that gained a restriction or authority condition",
      (g) =>
        edit(g, key1, (v) => {
          v.restriction_or_authority_ref = "authority-1";
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a position that became restricted",
      (g) =>
        edit(g, key2, (v) => {
          v.quantity_or_bounded_position.restricted = 1;
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a receiver whose opening provenance was rewritten",
      (g) =>
        edit(g, key2, (v) => {
          v.provenance_ref.premise_id = PREMISE_1;
        }),
      /exactly the conserved movement/,
    ],
    [
      "a receiver whose holder was changed",
      (g) =>
        edit(g, key2, (v) => {
          v.holder_ref = "someone-else";
        }),
      /exactly the conserved movement/,
    ],
    [
      "the sides swapped in the record (its source is the receiver)",
      (g) =>
        edit(g, recKey, (v) => {
          [v.from, v.to] = [v.to, v.from];
        }),
      /not wholly available/,
    ],
    [
      "a record with the same position as both sides",
      (g) =>
        edit(g, recKey, (v) => {
          v.to = structuredClone(v.from);
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a record at a key that is not its identity",
      (g) => ({
        ...g,
        writes: g.writes.map((w) =>
          w.key === recKey ? { ...w, key: economyReallocationKey("someone-else") } : w,
        ),
      }),
      /does not match the key|key derived from its identity/,
    ],
  ];
  it.each(cases)("%s", async (_name, mutate, expected) => {
    expect(await tampered(mutate)).toMatch(expected);
  });
});

describe("a malformed, partial or foreign group is refused as a raw commit", () => {
  async function rawRefused(build: (s: HoldingSeeded) => CommitGroup) {
    const s = await seededReallocationCampaign(tempDir());
    const before = holdingSummary(s.campaign.store);
    const r = await s.campaign.store.commit(build(s));
    expect(r.ok).toBe(false);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 7 });
    expect(s.economy.availability(HOLDING_2)).toMatchObject({ available: 2 });
    return r.ok ? "OK" : r.error.code;
  }

  it("a partial group: only one side advanced, or the record alone, or one side with the record (no partial debit/credit)", async () => {
    await rawRefused((s) => {
      const g = lawfulGroup(s);
      return { ...g, writes: [g.writes[0]!, g.writes[2]!] };
    });
    await rawRefused((s) => {
      const g = lawfulGroup(s);
      return { ...g, writes: [g.writes[1]!, g.writes[2]!] };
    });
    await rawRefused((s) => {
      const g = lawfulGroup(s);
      return { ...g, writes: [g.writes[0]!, g.writes[1]!] };
    });
    await rawRefused((s) => {
      const g = lawfulGroup(s);
      return { ...g, writes: [g.writes[2]!] };
    });
  });

  it("an orphaned resulting position: the same position twice, or a third foreign write", async () => {
    await rawRefused((s) => {
      const g = lawfulGroup(s);
      return { ...g, writes: [g.writes[0]!, g.writes[0]!, g.writes[2]!] };
    });
    await rawRefused((s) => {
      const g = lawfulGroup(s);
      return {
        ...g,
        writes: [
          ...g.writes,
          { ...g.writes[2]!, key: economyReallocationKey("reallocation-2"), expected_version: 0 },
        ],
      };
    });
  });

  it("a record that is not created (expected_version ≠ 0) or a position that is not advanced (expected_version 0)", async () => {
    await rawRefused((s) => {
      const g = lawfulGroup(s);
      return {
        ...g,
        writes: g.writes.map((w) => (w.key === recKey ? { ...w, expected_version: 1 } : w)),
      };
    });
    await rawRefused((s) => {
      const g = lawfulGroup(s);
      return {
        ...g,
        writes: g.writes.map((w) => (w.key === key1 ? { ...w, expected_version: 0 } : w)),
      };
    });
  });

  it("stale expected versions are refused by the store's own concurrency protection", async () => {
    const code = await rawRefused((s) => {
      const g = lawfulGroup(s);
      return {
        ...g,
        writes: g.writes.map((w) => (w.key === key2 ? { ...w, expected_version: 2 } : w)),
      };
    });
    expect(code).toMatch(/VERSION_CONFLICT|VALUE_INVALID|PREREQUISITE_MISSING/);
  });

  it("a foreign owner, facet, authority, campaign or key space cannot write the reallocation or its positions", async () => {
    const base = async (mutate: (g: CommitGroup) => CommitGroup) =>
      rawRefused((s) => mutate(lawfulGroup(s)));
    expect(
      await base((g) => ({
        ...g,
        owner: "population",
        facet: "population_state",
        writes: g.writes.map((w) => ({ ...w, owner: "population", facet: "population_state" })),
      })),
    ).toMatch(/^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/);
    expect(
      await base((g) => ({
        ...g,
        owner: "logistics",
        facet: "logistics_state",
        writes: g.writes.map((w) => ({ ...w, owner: "logistics", facet: "logistics_state" })),
      })),
    ).toMatch(/^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/);
    expect(
      await base((g) => ({
        ...g,
        authority: { role: "role.player", permission: "permission.canon.write" },
      })),
    ).toBe("AUTHORITY_DENIED");
    expect(await base((g) => ({ ...g, campaign_id: "another-campaign" }))).toBe(
      "CAMPAIGN_MISMATCH",
    );
    expect(
      await base((g) => ({
        ...g,
        writes: g.writes.map((w) => ({ ...w, facet: "other_facet" })),
        facet: "other_facet",
      })),
    ).toBe("OWNER_NOT_REGISTERED");
  });
});

describe("load-time verification detects reallocated positions that no longer tell one conserved story", () => {
  async function drifted(mutate: (facts: OwnerFact[]) => OwnerFact[]) {
    const s = await seededReallocationCampaign(tempDir());
    await must(realloc(s, 1, 1, 1, 3));
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const out = verifyEconomyIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const editFact = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("a healthy campaign verifies", async () => {
    expect(await drifted((f) => f)).toBe("");
  });
  it("detects value moved without a recorded cause, or recorded without moving", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== recKey))).toMatch(
      /transferred-in|reallocated-in amount is exactly the sum/,
    );
    expect(
      await drifted(
        editFact(key2, (v) => {
          v.quantity_or_bounded_position.reallocated_in = 1;
          v.quantity_or_bounded_position.available = 3;
        }),
      ),
    ).toMatch(/reallocated-in amount is exactly the sum/);
    expect(
      await drifted(
        editFact(key1, (v) => {
          delete v.quantity_or_bounded_position.reallocated_out;
          v.quantity_or_bounded_position.available = 7;
        }),
      ),
    ).toMatch(/reallocated-out amount is exactly the sum/);
  });
  it("detects value created or destroyed in a position (not a conserved partition)", async () => {
    expect(
      await drifted(
        editFact(key2, (v) => {
          v.quantity_or_bounded_position.available += 1;
        }),
      ),
    ).toMatch(/well-formed conserved position/);
    expect(
      await drifted(
        editFact(key1, (v) => {
          v.quantity_or_bounded_position.available -= 1;
        }),
      ),
    ).toMatch(/well-formed conserved position/);
  });
  it("detects an orphaned record, a foreign unit or object, a foreign holder and an unreachable admitted version", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== key2))).toMatch(
      /names two committed positions/,
    );
    expect(
      await drifted(
        editFact(recKey, (v) => {
          v.quantity.unit = "another-unit";
        }),
      ),
    ).toMatch(/one object and one unit/);
    expect(
      await drifted(
        editFact(recKey, (v) => {
          v.object_ref = "another-object";
        }),
      ),
    ).toMatch(/one object and one unit/);
    expect(
      await drifted(
        editFact(recKey, (v) => {
          v.from.holder_ref = "someone-else";
        }),
      ),
    ).toMatch(/positions and their holders as committed/);
    expect(
      await drifted(
        editFact(recKey, (v) => {
          v.to.admitted_at_holding_version = 99;
        }),
      ),
    ).toMatch(/position versions that exist/);
  });
  it("detects a malformed record or one at a key that is not its identity", async () => {
    expect(
      await drifted(
        editFact(recKey, (v) => {
          v.reallocation_id = "someone-else";
        }),
      ),
    ).toMatch(/well formed at the key derived/);
    expect(
      await drifted(
        editFact(recKey, (v) => {
          v.to.holding_id = v.from.holding_id;
        }),
      ),
    ).toMatch(/well formed at the key derived/);
  });
});

describe("tampering with the persisted journal or state fails the open under the existing integrity model", () => {
  it("rejects an edited journal and an edited state file", async () => {
    const dir = tempDir();
    const s = await seededReallocationCampaign(dir);
    await must(realloc(s, 1, 1, 1, 3));
    await s.campaign.close();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("OOC_SCENARIO_REALLOCATION_INSTRUCTION");
    writeFileSync(journal, text.replace('"available":5', '"available":6'));
    expect((await CanonicalCampaign.open(dir)).ok).toBe(false);

    const dir2 = tempDir();
    const s2 = await seededReallocationCampaign(dir2);
    await must(realloc(s2, 1, 1, 1, 3));
    await s2.campaign.close();
    const stateFile = readdirSync(dir2)
      .filter((f) => /^state\./.test(f))
      .sort()
      .pop()!;
    const state = readFileSync(join(dir2, stateFile), "utf8");
    expect(state).toMatch(/"available":\s*5/);
    writeFileSync(join(dir2, stateFile), state.replace(/"available":(\s*)5/, '"available":$16'));
    expect((await CanonicalCampaign.open(dir2)).ok).toBe(false);
  });
});
