/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and group content */
// Economic Holding / Account position — enforcement: IM-11 admission re-derives every holding write, so a raw
// `store.commit`, a tampered group and a tampered persisted state are each refused by the intended rule, and the
// conserved position cannot be double-encumbered, rewritten, restored twice or credited from nowhere (WS-004 §2.1, §4,
// §20, §30 invariants 17–18). Identity, idempotency and concurrency are proved here; interrupted recovery is in
// economy-holding-recovery.test.ts.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  economyEncumbranceKey,
  economyHoldingKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EconomyAdapter,
  factKind,
  verifyEconomyIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_HOLDING_CAMPAIGN,
  HOLDING_1,
  HOLDING_2,
  PREMISE_2,
  establishHoldingInput,
  holdInstruction,
  holdingActPublication,
  holdingPublication,
  releaseInstruction,
} from "@immortalis/testkit";
import {
  holdingSummary,
  reopenHolding,
  seededHoldingCampaign,
  type HoldingSeeded,
} from "../support/economy-holding.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const HOLD_A = "hold-a";
const HOLD_B = "hold-b";
const holdingKey = economyHoldingKey(HOLDING_1);
const encKey = (id: string) => economyEncumbranceKey(HOLDING_1, id);

/** A store whose Economy groups are altered on the way in, to prove IM-11 (not the adapter) refuses them. */
function tamperStore(
  inner: CampaignStore,
  mutate: (g: CommitGroup) => CommitGroup,
): { store: CampaignStore; tampered: () => number } {
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

/** A raw, hand-built Economy group (what a caller bypassing the adapter would publish). */
const rawGroup = (
  s: HoldingSeeded,
  n: number,
  writes: Array<{ key: string; value: unknown; expected_version: number }>,
  over: Partial<CommitGroup> = {},
  w: Partial<{ owner: string; facet: string }> = {},
): CommitGroup => {
  const kind = factKind("economy_holding");
  return {
    campaign_id: s.campaign.store.head().campaign_id,
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    owner: kind.owner,
    facet: kind.facet,
    cause: `raw-cause-${n}`,
    rule: kind.rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: writes.map((x) => ({
      key: x.key,
      owner: w.owner ?? kind.owner,
      facet: w.facet ?? kind.facet,
      value: x.value as never,
      unit: null,
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      expected_version: x.expected_version,
    })),
    ...over,
  };
};

const holdA = async (s: HoldingSeeded, n = 1, version = 1, amount = 3) =>
  must(
    s.economy.holdEncumbrance({
      ...holdingActPublication(n),
      hold: holdInstruction(version, HOLD_A, amount),
    }),
  );

describe("owner exclusivity and the canonical write path (IA-03, IM-03, IM-11)", () => {
  it("refuses an Economy key written by another owner or facet, a key outside every key space, and a wrong authority or campaign", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const value = s.economy.holding(HOLDING_1)!.value;
    const base = (key: string) => [{ key, value, expected_version: 0 }];
    const store = s.campaign.store;
    const before = holdingSummary(store);
    const cases: Array<[string, CommitGroup, string]> = [
      [
        "another owner",
        rawGroup(
          s,
          1,
          base(economyHoldingKey("x")),
          { owner: "population", facet: "population_state" },
          { owner: "population", facet: "population_state" },
        ),
        "KEY_NOT_ADMITTED",
      ],
      [
        "another facet",
        rawGroup(
          s,
          2,
          base(economyHoldingKey("x")),
          { facet: "other_facet" },
          { facet: "other_facet" },
        ),
        "OWNER_NOT_REGISTERED",
      ],
      [
        "a key outside every key space",
        rawGroup(s, 3, base("economy/ledger/x")),
        "KEY_NOT_ADMITTED",
      ],
      [
        "a non-archivist authority",
        rawGroup(s, 4, base(economyHoldingKey("x")), {
          authority: { role: "role.player", permission: "permission.canon.write" },
        }),
        "AUTHORITY_DENIED",
      ],
      [
        "another campaign",
        rawGroup(s, 5, base(economyHoldingKey("x")), { campaign_id: "another-campaign" }),
        "CAMPAIGN_MISMATCH",
      ],
    ];
    for (const [, group, code] of cases) {
      const r = await store.commit(group);
      expect(r.ok ? "OK" : r.error.code).toBe(code);
    }
    expect(holdingSummary(store)).toEqual(before);
  });

  it("an extension owner cannot claim or write the holding key spaces", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const group = rawGroup(
      s,
      1,
      [
        {
          key: economyHoldingKey("claimed"),
          value: s.economy.holding(HOLDING_1)!.value,
          expected_version: 0,
        },
      ],
      {},
      {},
    );
    const r = await s.campaign.store.commit({
      ...group,
      owner: "logistics",
      facet: "logistics_state",
      writes: group.writes.map((w) => ({ ...w, owner: "logistics", facet: "logistics_state" })),
    });
    expect(r.ok ? "OK" : r.error.code).toBe("KEY_NOT_ADMITTED");
  });
});

describe("IM-11 re-derives the opening premise: a raw or invalid premise is rejected, never magically approved", () => {
  const open =
    (over: (v: any) => void, key = economyHoldingKey("h-raw")) =>
    async () => {
      const s = await seededHoldingCampaign(tempDir());
      const v: any = structuredClone(s.economy.holding(HOLDING_1)!.value);
      v.holding_id = "h-raw";
      over(v);
      const before = holdingSummary(s.campaign.store);
      const r = await s.campaign.store.commit(
        rawGroup(s, 1, [{ key, value: v, expected_version: 0 }]),
      );
      if (!r.ok) expect(holdingSummary(s.campaign.store)).toEqual(before);
      return r.ok ? "OK" : `${r.error.code}: ${r.error.message}`;
    };
  it("accepts exactly the lawful opening (control)", async () => {
    expect(await open(() => undefined)()).toBe("OK");
  });
  it.each([
    [
      "an opening that is already partly encumbered",
      (v: any) => {
        v.quantity_or_bounded_position.available = 4;
        v.quantity_or_bounded_position.encumbered = 3;
      },
      /VALUE_INVALID: an opening holding holds its whole/,
    ],
    [
      "an unconserved position (value created)",
      (v: any) => {
        v.quantity_or_bounded_position.available = 9;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "an unconserved position (value destroyed)",
      (v: any) => {
        v.quantity_or_bounded_position.available = 1;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a restricted partition",
      (v: any) => {
        v.quantity_or_bounded_position.restricted = 1;
        v.quantity_or_bounded_position.available = 6;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a restriction or authority reference (no producer exists)",
      (v: any) => {
        v.restriction_or_authority_ref = { owner: "gip", fact_key: "gip/x", version: 1 };
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a zero guessed amount",
      (v: any) => {
        v.quantity_or_bounded_position = {
          unit: "u",
          established: 0,
          available: 0,
          encumbered: 0,
          restricted: 0,
        };
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a negative amount",
      (v: any) => {
        v.quantity_or_bounded_position.available = -1;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a fractional amount",
      (v: any) => {
        v.quantity_or_bounded_position.established = 7.5;
        v.quantity_or_bounded_position.available = 7.5;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a missing holder",
      (v: any) => {
        delete v.holder_ref;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "an empty holder",
      (v: any) => {
        v.holder_ref = "";
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a missing object",
      (v: any) => {
        delete v.object_ref;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "missing provenance",
      (v: any) => {
        delete v.provenance_ref;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "provenance that is not an OOC premise (e.g. issuance)",
      (v: any) => {
        v.provenance_ref.kind = "PAYMENT_INTENT";
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a legal title / issuance / reservation claim",
      (v: any) => {
        v.nature = "LEGAL_TITLE";
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a non-active lifecycle",
      (v: any) => {
        v.lifecycle_status = "transferred";
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a smuggled price or currency field",
      (v: any) => {
        v.price = 3;
      },
      /VALUE_INVALID: value violates/,
    ],
    [
      "a smuggled physical reservation field",
      (v: any) => {
        v.reserve_ref = "reserve-1";
      },
      /VALUE_INVALID: value violates/,
    ],
  ] as const)("rejects %s", async (_name, mutate, why) => {
    expect(await open(mutate)()).toMatch(why);
  });
  it("rejects a holding whose identity is not its key", async () => {
    expect(await open(() => undefined, economyHoldingKey("another-id"))()).toMatch(
      /VALUE_INVALID: holding_id does not match the key/,
    );
  });
});

describe("IM-11 re-derives every hold: Economy's partition, not the group's claim (WS-004 §20, §4)", () => {
  async function tamperedHold(mutate: (g: CommitGroup) => CommitGroup) {
    const s = await seededHoldingCampaign(tempDir());
    const t = tamperStore(s.campaign.store, mutate);
    const economy = new EconomyAdapter(t.store);
    const before = holdingSummary(s.campaign.store);
    const r = await economy.holdEncumbrance({
      ...holdingActPublication(1),
      hold: holdInstruction(1, HOLD_A, 3),
    });
    expect(t.tampered()).toBe(1);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    return r.ok ? "OK" : `${r.error.code}: ${r.error.message}`;
  }
  it("the untampered group commits (control)", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const t = tamperStore(s.campaign.store, (g) => g);
    await must(
      new EconomyAdapter(t.store).holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 4, encumbered: 3 });
  });
  const cases: Array<[string, (g: CommitGroup) => CommitGroup, RegExp]> = [
    [
      "an encumbrance that does not partition the position (value destroyed)",
      (g) =>
        edit(g, holdingKey, (v) => {
          v.quantity_or_bounded_position.available = 3;
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a partition that creates value",
      (g) =>
        edit(g, holdingKey, (v) => {
          v.quantity_or_bounded_position.available = 7;
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a conserved but wrong partition (the encumbered amount is not the hold's)",
      (g) =>
        edit(g, holdingKey, (v) => {
          v.quantity_or_bounded_position.available = 1;
          v.quantity_or_bounded_position.encumbered = 6;
        }),
      /exactly the partition of the same conserved position/,
    ],
    [
      "a hold larger than what is available (a forged quantity)",
      (g) =>
        edit(
          edit(g, encKey(HOLD_A), (v) => {
            v.quantity.amount = 9;
          }),
          holdingKey,
          (v) => {
            v.quantity_or_bounded_position.available = 0;
            v.quantity_or_bounded_position.encumbered = 7;
          },
        ),
      /not wholly available/,
    ],
    [
      "a hold in another unit",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.quantity.unit = "another-unit";
        }),
      /own unit/,
    ],
    [
      "an encumbrance admitted against a version that is not the current one",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.admitted_at_holding_version = 5;
        }),
      /no longer current/,
    ],
    [
      "an encumbrance that is born cancelled",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.lifecycle_status = "cancelled";
          v.cancellation = { basis: "OOC_SCENARIO_CANCELLATION_INSTRUCTION", instruction_id: "c" };
        }),
      /exactly the partition of the same conserved position/,
    ],
    [
      "an encumbrance that asserts in-world consent",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.authorization.in_world_consent = "ASSERTED";
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "an encumbrance that claims a legal priority, payment or physical reservation",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.nature = "PAYMENT_AND_LEGAL_PRIORITY";
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "an encumbrance of another holding",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.holding = { fact_key: economyHoldingKey(HOLDING_2), holding_id: HOLDING_2 };
        }),
      /VALUE_INVALID: encumbrance identity does not match the key/,
    ],
    [
      "an encumbrance that rewrites the premise (a different holder)",
      (g) =>
        edit(g, holdingKey, (v) => {
          v.holder_ref = "someone-else";
        }),
      /exactly the partition of the same conserved position/,
    ],
    [
      "an encumbrance that rewrites the established amount",
      (g) =>
        edit(g, holdingKey, (v) => {
          v.quantity_or_bounded_position.established = 10;
          v.quantity_or_bounded_position.available = 7;
        }),
      /exactly the partition of the same conserved position/,
    ],
    [
      "a hold without its encumbrance (the partition alone)",
      (g) => ({ ...g, writes: g.writes.filter((w) => w.key === holdingKey) }),
      /Economy state changes only by/,
    ],
    [
      "an encumbrance without the partition",
      (g) => ({ ...g, writes: g.writes.filter((w) => w.key !== holdingKey) }),
      /Economy state changes only by/,
    ],
    [
      "a hold smuggling a second encumbrance (double encumbrance in one group)",
      (g) => ({
        ...g,
        writes: [
          ...g.writes,
          {
            ...g.writes[1]!,
            key: encKey("hold-extra"),
            value: edit(g, encKey(HOLD_A), (v) => {
              v.encumbrance_id = "hold-extra";
            }).writes[1]!.value,
          },
        ],
      }),
      /Economy state changes only by/,
    ],
  ];
  it.each(cases)("rejects %s", async (_name, mutate, why) => {
    expect(await tamperedHold(mutate)).toMatch(why);
  });
});

describe("IM-11 re-derives every release: only the recorded amount, only once (WS-004 §20 step 6)", () => {
  async function tamperedRelease(mutate: (g: CommitGroup) => CommitGroup) {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    const t = tamperStore(s.campaign.store, mutate);
    const before = holdingSummary(s.campaign.store);
    const r = await new EconomyAdapter(t.store).releaseEncumbrance({
      ...holdingActPublication(2),
      release: releaseInstruction(1, HOLD_A),
    });
    expect(t.tampered()).toBe(1);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    return r.ok ? "OK" : `${r.error.code}: ${r.error.message}`;
  }
  it("the untampered release commits (control)", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    const t = tamperStore(s.campaign.store, (g) => g);
    await must(
      new EconomyAdapter(t.store).releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 7, encumbered: 0 });
  });
  const cases: Array<[string, (g: CommitGroup) => CommitGroup, RegExp]> = [
    [
      "a restoration of more than was encumbered (value created)",
      (g) =>
        edit(g, holdingKey, (v) => {
          v.quantity_or_bounded_position.available = 8;
          v.quantity_or_bounded_position.encumbered = -1;
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a restoration that leaves the amount encumbered (value destroyed)",
      (g) =>
        edit(g, holdingKey, (v) => {
          v.quantity_or_bounded_position.available = 4;
          v.quantity_or_bounded_position.encumbered = 0;
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a conserved but wrong restoration",
      (g) =>
        edit(g, holdingKey, (v) => {
          v.quantity_or_bounded_position.available = 5;
          v.quantity_or_bounded_position.encumbered = 2;
        }),
      /exactly the restoration of the recorded encumbered amount/,
    ],
    [
      "a partition that restores while the hold stays active",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.lifecycle_status = "active";
          v.cancellation = null;
        }),
      /a release records its cancellation instruction/,
    ],
    [
      "a cancellation that rewrites the hold's quantity",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.quantity.amount = 1;
        }),
      /exactly the restoration of the recorded encumbered amount/,
    ],
    [
      "a cancellation that reuses the hold's own instruction",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.cancellation.instruction_id = v.authorization.instruction_id;
        }),
      /VALUE_INVALID: value violates/,
    ],
    [
      "a cancelled hold with no recorded cancellation",
      (g) =>
        edit(g, encKey(HOLD_A), (v) => {
          v.cancellation = null;
        }),
      /VALUE_INVALID: value violates/,
    ],
  ];
  it.each(cases)("rejects %s", async (_name, mutate, why) => {
    expect(await tamperedRelease(mutate)).toMatch(why);
  });

  it("a raw release of an already-cancelled hold is refused (the amount cannot be restored twice)", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    await must(
      s.economy.releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    const h = s.economy.holding(HOLDING_1)!;
    const e = s.economy.encumbrance(HOLDING_1, HOLD_A)!;
    const forgedHolding: any = structuredClone(h.value);
    forgedHolding.quantity_or_bounded_position.available = 10; // would overshoot; conservation breaks
    const again: any = structuredClone(e.value);
    again.cancellation.instruction_id = "cancel-twice";
    const before = holdingSummary(s.campaign.store);
    const r = await s.campaign.store.commit(
      rawGroup(s, 9, [
        { key: holdingKey, value: h.value, expected_version: h.fact.version },
        { key: encKey(HOLD_A), value: again, expected_version: e.fact.version },
      ]),
    );
    expect(r.ok ? "OK" : r.error.message).toMatch(
      /only a still-active encumbrance can be released, once/,
    );
    expect(holdingSummary(s.campaign.store)).toEqual(before);
  });

  it("a raw commit that is exactly the derived hold is lawful: admission, not the adapter, is the rule", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const h = s.economy.holding(HOLDING_1)!;
    const after: any = structuredClone(h.value);
    after.quantity_or_bounded_position.available = 4;
    after.quantity_or_bounded_position.encumbered = 3;
    const enc = {
      encumbrance_id: HOLD_A,
      holding: { fact_key: holdingKey, holding_id: HOLDING_1 },
      admitted_at_holding_version: 1,
      quantity: { amount: 3, unit: h.value.quantity_or_bounded_position.unit },
      authorization: {
        basis: "OOC_SCENARIO_HOLD_INSTRUCTION",
        instruction_id: "raw-instruction",
        in_world_consent: "NOT_ASSERTED",
      },
      lifecycle_status: "active",
      cancellation: null,
      nature: "ECONOMIC_ENCUMBRANCE_NOT_PHYSICAL_RESERVATION_PAYMENT_SETTLEMENT_OR_LEGAL_PRIORITY",
    };
    const ok = await s.campaign.store.commit(
      rawGroup(s, 1, [
        { key: holdingKey, value: after, expected_version: 1 },
        { key: encKey(HOLD_A), value: enc, expected_version: 0 },
      ]),
    );
    expect(ok.ok).toBe(true);
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 4, encumbered: 3 });
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("identity and idempotency: a replay creates nothing, a changed intent or hold identity is never applied twice", () => {
  it("re-presenting the same hold (same intent, same content) replays the original receipt and changes nothing", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const first = await holdA(s);
    const before = holdingSummary(s.campaign.store);
    const again = await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 4, encumbered: 3 });
  });

  it("replays even after the world has moved on (the hold was later released): still no second effect", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    await must(
      s.economy.releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    const again = await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 3),
      }),
    );
    expect(again.replayed).toBe(true);
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 7, encumbered: 0 });
  });

  it("a changed intent identity for the same hold is a duplicate commitment and is refused", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    const before = holdingSummary(s.campaign.store);
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(2),
          hold: holdInstruction(2, HOLD_A, 1),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
  });

  it("the same intent with changed content (quantity, instruction, pinned version, hold identity) is a conflict, not a reuse", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    const before = holdingSummary(s.campaign.store);
    for (const hold of [
      holdInstruction(1, HOLD_A, 4),
      holdInstruction(1, HOLD_A, 3, { instruction_id: "another-instruction" }),
      holdInstruction(2, HOLD_A, 3),
      holdInstruction(1, HOLD_B, 3),
    ]) {
      expect(await codeOf(s.economy.holdEncumbrance({ ...holdingActPublication(1), hold }))).toBe(
        "INTENT_CONFLICT",
      );
    }
    expect(holdingSummary(s.campaign.store)).toEqual(before);
  });

  it("a group identity that belongs to a different intent is refused", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    const before = holdingSummary(s.campaign.store);
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(2),
          group_id: holdingActPublication(1).group_id,
          hold: holdInstruction(2, HOLD_B, 1),
        }),
      ),
    ).toBe("GROUP_ID_CONFLICT");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
  });

  it("a cancellation replays once and a changed cancellation intent is refused", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    const first = await must(
      s.economy.releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    const before = holdingSummary(s.campaign.store);
    const again = await must(
      s.economy.releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(
      await codeOf(
        s.economy.releaseEncumbrance({
          ...holdingActPublication(2),
          release: releaseInstruction(1, HOLD_A, { instruction_id: "different-cancel" }),
        }),
      ),
    ).toBe("INTENT_CONFLICT");
    expect(holdingSummary(s.campaign.store)).toEqual(before);
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 7, encumbered: 0 });
  });

  it("the same hold identity may exist under two holdings, scoped to its own holding", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await must(
      s.economy.establishHolding({
        ...holdingPublication(2),
        holding: establishHoldingInput({ holding_id: HOLDING_2, amount: 5, premise_id: PREMISE_2 }),
      }),
    );
    await holdA(s);
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(1, HOLD_A, 2, { holding_id: HOLDING_2 }),
      }),
    );
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 4, encumbered: 3 });
    expect(s.economy.availability(HOLDING_2)).toMatchObject({ available: 3, encumbered: 2 });
  });

  it("refuses a stale pinned version, an unknown holding, a unit mismatch and invalid input without mutation", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    const before = holdingSummary(s.campaign.store);
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(2),
          hold: holdInstruction(1, HOLD_B, 1),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(3),
          hold: holdInstruction(1, HOLD_B, 1, { holding_id: "no-such" }),
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(4),
          hold: holdInstruction(2, HOLD_B, 1, { unit: "other-unit" }),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    for (const hold of [
      { ...holdInstruction(2, HOLD_B, 1), quantity: { amount: 0, unit: "unit-synthetic" } },
      { ...holdInstruction(2, HOLD_B, 1), quantity: { amount: -1, unit: "unit-synthetic" } },
      { ...holdInstruction(2, HOLD_B, 1), quantity: { amount: 1.5, unit: "unit-synthetic" } },
      { ...holdInstruction(2, HOLD_B, 1), hold_id: "" },
      { ...holdInstruction(2, HOLD_B, 1), holding_version: 0 },
      { ...holdInstruction(2, HOLD_B, 1), available: 4 },
      { ...holdInstruction(2, HOLD_B, 1), balance_after: 1 },
      { ...holdInstruction(2, HOLD_B, 1), committed: true },
      { ...holdInstruction(2, HOLD_B, 1), approved: true },
    ] as unknown[]) {
      expect(await codeOf(s.economy.holdEncumbrance({ ...holdingActPublication(5), hold }))).toBe(
        "INPUT_INVALID",
      );
    }
    expect(holdingSummary(s.campaign.store)).toEqual(before);
  });
});

describe("concurrency: incompatible simultaneous claims never double-encumber (WS-004 §4, §30 invariant 18)", () => {
  it("two holds both pinned at the same version: exactly one is admitted, the other fails closed, the total never exceeds the position", async () => {
    const s = await seededHoldingCampaign(tempDir());
    const results = await Promise.all([
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 4),
      }),
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(1, HOLD_B, 4),
      }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok)!;
    expect(loser.ok ? "" : loser.error.code).toMatch(/VERSION_CONFLICT|INSUFFICIENT_AVAILABLE/);
    const a = s.economy.availability(HOLDING_1)!;
    expect(a.available + a.encumbered).toBe(7);
    expect(a).toMatchObject({ available: 3, encumbered: 4 });
    expect(s.campaign.verify()).toEqual([]);
    // exactly one encumbrance exists
    const holds = s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("economy/encumbrance/"));
    expect(holds).toHaveLength(1);
  });

  it("a stale loser re-reads and is then judged on the real remaining availability (not awarded by arrival order)", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await Promise.all([
      s.economy.holdEncumbrance({
        ...holdingActPublication(1),
        hold: holdInstruction(1, HOLD_A, 4),
      }),
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(1, HOLD_B, 4),
      }),
    ]);
    const winner = s.economy.encumbrance(HOLDING_1, HOLD_A) ? HOLD_A : HOLD_B;
    const loser = winner === HOLD_A ? HOLD_B : HOLD_A;
    expect(
      await codeOf(
        s.economy.holdEncumbrance({
          ...holdingActPublication(3),
          hold: holdInstruction(2, loser, 4),
        }),
      ),
    ).toBe("INSUFFICIENT_AVAILABLE");
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(4),
        hold: holdInstruction(2, loser, 3),
      }),
    );
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 0, encumbered: 7 });
  });

  it("a simultaneous hold and cancellation serialize: no amount is lost or duplicated", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    const results = await Promise.all([
      s.economy.releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
      s.economy.holdEncumbrance({
        ...holdingActPublication(3),
        hold: holdInstruction(2, HOLD_B, 4),
      }),
    ]);
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(1);
    const a = s.economy.availability(HOLDING_1)!;
    expect(a.available + a.encumbered).toBe(7);
    const active = s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("economy/encumbrance/"))
      .map((f) => f.value as any)
      .filter((v) => v.lifecycle_status === "active")
      .reduce((n, v) => n + v.quantity.amount, 0);
    expect(a.encumbered).toBe(active);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the same cancellation presented twice at once restores exactly once", async () => {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    await Promise.all([
      s.economy.releaseEncumbrance({
        ...holdingActPublication(2),
        release: releaseInstruction(1, HOLD_A),
      }),
      s.economy.releaseEncumbrance({
        ...holdingActPublication(3),
        release: releaseInstruction(1, HOLD_A, { instruction_id: "cancel-other" }),
      }),
    ]);
    expect(s.economy.availability(HOLDING_1)).toMatchObject({ available: 7, encumbered: 0 });
    expect(s.economy.encumbrance(HOLDING_1, HOLD_A)!.fact.version).toBe(2);
    expect(s.economy.holding(HOLDING_1)!.fact.version).toBe(3);
  });
});

describe("load-time verification detects a holding that no longer tells one conserved story", () => {
  async function drifted(mutate: (facts: OwnerFact[]) => OwnerFact[]) {
    const s = await seededHoldingCampaign(tempDir());
    await holdA(s);
    await must(
      s.economy.holdEncumbrance({
        ...holdingActPublication(2),
        hold: holdInstruction(2, HOLD_B, 2),
      }),
    );
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
  it("detects value created or destroyed in the holding (encumbered ≠ the sum of active holds)", async () => {
    expect(
      await drifted(
        editFact(holdingKey, (v) => {
          v.quantity_or_bounded_position.available += 1;
          v.quantity_or_bounded_position.encumbered -= 1;
        }),
      ),
    ).toMatch(/encumbered amount is exactly the sum of its still-active encumbrances/);
  });
  it("detects a hold that was dropped, or a cancelled hold that still encumbers", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== encKey(HOLD_B)))).toMatch(
      /encumbered amount is exactly the sum/,
    );
    expect(
      await drifted(
        editFact(encKey(HOLD_B), (v) => {
          v.lifecycle_status = "cancelled";
          v.cancellation = { basis: "OOC_SCENARIO_CANCELLATION_INSTRUCTION", instruction_id: "c" };
        }),
      ),
    ).toMatch(/encumbered amount is exactly the sum/);
  });
  it("detects an orphaned encumbrance, a foreign unit and an unreachable admitted version", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== holdingKey))).toMatch(
      /belongs to a committed holding/,
    );
    expect(
      await drifted(
        editFact(encKey(HOLD_A), (v) => {
          v.quantity.unit = "another-unit";
        }),
      ),
    ).toMatch(/holding's own unit/);
    expect(
      await drifted(
        editFact(encKey(HOLD_A), (v) => {
          v.admitted_at_holding_version = 99;
        }),
      ),
    ).toMatch(/holding version that exists/);
  });
  it("detects a malformed holding or an encumbrance at a key that is not its identity", async () => {
    expect(
      await drifted(
        editFact(holdingKey, (v) => {
          v.quantity_or_bounded_position.established = 99;
        }),
      ),
    ).toMatch(/well-formed conserved position/);
    expect(
      await drifted(
        editFact(encKey(HOLD_A), (v) => {
          v.encumbrance_id = "someone-else";
        }),
      ),
    ).toMatch(/well formed at the key derived/);
  });
});

describe("tampering with the persisted journal or state fails the open under the existing integrity model", () => {
  it("rejects an edited journal and an edited state file", async () => {
    const dir = tempDir();
    const s = await seededHoldingCampaign(dir);
    await holdA(s);
    await s.campaign.close();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("OOC_SCENARIO_HOLD_INSTRUCTION");
    writeFileSync(journal, text.replace('"encumbered":3', '"encumbered":0'));
    expect((await CanonicalCampaign.open(dir)).ok).toBe(false);

    const dir2 = tempDir();
    const s2 = await seededHoldingCampaign(dir2);
    await holdA(s2);
    await s2.campaign.close();
    const stateFile = readdirSync(dir2)
      .filter((f) => /^state\./.test(f))
      .sort()
      .pop()!;
    const state = readFileSync(join(dir2, stateFile), "utf8");
    expect(state).toMatch(/"encumbered":\s*3/);
    writeFileSync(join(dir2, stateFile), state.replace(/"encumbered":(\s*)3/, '"encumbered":$10'));
    expect((await CanonicalCampaign.open(dir2)).ok).toBe(false);
  });

  it("a restart over an untampered campaign verifies and recovers the same position", async () => {
    const dir = tempDir();
    const s = await seededHoldingCampaign(dir);
    await holdA(s);
    await s.campaign.close();
    const r = await reopenHolding(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.economy.availability(HOLDING_1)).toMatchObject({ available: 4, encumbered: 3 });
    expect(FIXTURE_HOLDING_CAMPAIGN).toBe(r.campaign.store.head().campaign_id);
    await r.campaign.close();
  });
});
