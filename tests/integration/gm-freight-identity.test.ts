/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw tool results */
import { describe, expect, it } from "vitest";
import type { GmFreightReconciliation } from "@immortalis/contracts";
import {
  CanonicalCampaign,
  DEFAULT_MAX_ACTS_PER_CALL,
  encodeIdPart,
  gmFreightActIdentity,
  stepName,
  type GmFreightResult,
} from "@immortalis/engine";
import {
  GM_FREIGHT_TOOLS,
  economyFreightCloseKey,
  economyFreightRequestRef,
  productionInputLotKey,
} from "@immortalis/contracts";
import {
  freightPublication,
  quarryWorksFixture,
  textileWorkshopFixture,
} from "@immortalis/testkit";
import {
  admitService,
  admitServiceBasis,
  attestAndInitialize,
  establishSetting,
  fixFreight,
  openFreightCampaign,
  variant,
  type Freight,
} from "../support/freight.ts";
import {
  attestRequest,
  authorThroughSeal,
  legalRequest,
  newGmRig,
  playerAdvancesTo,
  receiptOf,
  settingRequest,
  statusOf,
  stepNames,
  type GmRig,
} from "../support/gm-freight.ts";
import { must } from "../support/temporal.ts";

/**
 * BLUE's HOLD on the first head (R-1, R-2, R-6, R-7, R-8), each discriminated by a case the first head could not pass. MECHANISM ONLY (T1).
 * Where a case needs an envelope or a request history the bridge itself would never produce, it is SEEDED through the owners' own adapters
 * and labelled so; the bridge then reads, and acts on, only what the owners hold.
 */

const tool = GM_FREIGHT_TOOLS;
const refusal = (r: GmFreightResult) => {
  if (r.ok) throw new Error("expected a refusal");
  return r.error as { code: string; message: string; details: any };
};
const heads = async (rig: GmRig) => {
  const c = await must(
    CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-test-read" }),
  );
  try {
    return { revision: c.store.head().revision, state: c.store.head().state_sha256 };
  } finally {
    await c.close();
  }
};
const factsOf = async (rig: GmRig) => {
  const c = await must(
    CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-test-read" }),
  );
  try {
    return c.store
      .listFacts()
      .map((f) => ({ key: f.key, owner: f.owner, version: f.version, value: f.value }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
  } finally {
    await c.close();
  }
};
const seeded = async <T>(rig: GmRig, run: (f: Freight) => Promise<T>): Promise<T> => {
  const f = await openFreightCampaign(rig.campaignDir, rig.fx);
  try {
    return await run(f);
  } finally {
    await f.campaign.close();
  }
};

describe("R-1 — an act's identity is injective, and is the host's token AND the world AND the exact source identity", () => {
  it("the encoding never maps two different identities to one, over a hostile corpus", () => {
    const corpus = [
      "a",
      "a:b",
      "a_b",
      "a_3a_b",
      "a-b",
      "a.b",
      "a@b",
      "a_40_b",
      "A",
      "ä",
      "a b",
      "a/b",
      "a\\b",
      "",
      "_",
      "__",
      "_5f_",
      "5f",
      "𝒳",
      "w:1",
      "w_1",
      "w_3a_1",
      "slice-d:lot",
      "slice-d_lot",
      "slice-d-lot",
    ];
    const seen = new Map<string, string>();
    for (const s of corpus) {
      const e = encodeIdPart(s);
      expect(e, `${JSON.stringify(s)} contains a separator`).not.toMatch(/[:@]/);
      expect(
        seen.get(e),
        `${JSON.stringify(s)} and ${JSON.stringify(seen.get(e))} collide`,
      ).toBeUndefined();
      seen.set(e, s);
    }
    // the first head's slug mapped these to the SAME step name: two source identities, one act
    expect(stepName("input-lot", "slice-d:lot")).not.toBe(stepName("input-lot", "slice-d_lot"));
    expect(stepName("withdraw-admit", "freight:s:1")).not.toBe(
      stepName("withdraw-admit", "freight_s_1"),
    );
  });

  it("an act in another world, under another token or on another source identity never shares a group or intent identity", () => {
    const ids = [
      gmFreightActIdentity("tok", "w:1", "attest-opening"),
      gmFreightActIdentity("tok", "w_1", "attest-opening"),
      gmFreightActIdentity("tok", "w_3a_1", "attest-opening"),
      gmFreightActIdentity("tok2", "w:1", "attest-opening"),
      gmFreightActIdentity("tok", "w:1", "site-change"),
      gmFreightActIdentity("tok", "w:1", stepName("input-lot", "a:b")),
      gmFreightActIdentity("tok", "w:1", stepName("input-lot", "a_b")),
    ];
    for (const key of ["group_id", "intent_id"] as const) {
      const all = ids.map((i) => i[key]);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it("reconcile answers for ONE world: the same token in another world is a different set of acts", async () => {
    const rig = await newGmRig(quarryWorksFixture());
    receiptOf(await rig.call(tool.establishSetting, settingRequest(rig.fx, "tok")));
    const here = receiptOf(
      await rig.call(tool.reconcile, { operation_id: "tok", world_id: rig.fx.worldId }),
    ) as unknown as GmFreightReconciliation;
    expect(here.committed.map((s) => s.step)).toEqual([
      "setting-corridor",
      "setting-destination",
      "setting-origin",
      "setting-world",
    ]);
    const elsewhere = receiptOf(
      await rig.call(tool.reconcile, { operation_id: "tok", world_id: `${rig.fx.worldId}:other` }),
    ) as unknown as GmFreightReconciliation;
    expect(elsewhere.committed).toEqual([]);
    // and a reconcile with no world is no longer a valid request (the question has no answer without one)
    expect(refusal(await rig.call(tool.reconcile, { operation_id: "tok" })).code).toBe(
      "GM_FREIGHT_INPUT_INVALID",
    );
  }, 120_000);
});

describe("R-2 — the seal is irreversible, so an envelope that cannot carry the profile is refused before it is written, and one already sealed is reported honestly", () => {
  const twinOf = (fx: any, kind: string) => {
    const base = fx.opening.slices.find((s: any) => s.slice_kind === kind);
    const twin = JSON.parse(JSON.stringify(base));
    twin.slice_id = `slice-z-${kind}-twin`;
    fx.opening.slices.push(twin);
  };
  const without = (fx: any, kind: string) => {
    fx.opening.slices = fx.opening.slices.filter((s: any) => s.slice_kind !== kind);
  };
  const cases: {
    name: string;
    edit: (fx: any) => void;
    problem: { slice_kind: string; expected: string; found: number };
  }[] = [
    {
      name: "no legal slice",
      edit: (fx) => without(fx, "legal"),
      problem: { slice_kind: "legal", expected: "exactly 1", found: 0 },
    },
    {
      name: "two legal slices",
      edit: (fx) => twinOf(fx, "legal"),
      problem: { slice_kind: "legal", expected: "exactly 1", found: 2 },
    },
    {
      name: "no site condition",
      edit: (fx) => without(fx, "site_condition"),
      problem: { slice_kind: "site_condition", expected: "exactly 1", found: 0 },
    },
    {
      name: "two site conditions",
      edit: (fx) => twinOf(fx, "site_condition"),
      problem: { slice_kind: "site_condition", expected: "exactly 1", found: 2 },
    },
    {
      name: "no material specification",
      edit: (fx) => without(fx, "material_specification"),
      problem: { slice_kind: "material_specification", expected: "exactly 1", found: 0 },
    },
    {
      name: "two material specifications",
      edit: (fx) => twinOf(fx, "material_specification"),
      problem: { slice_kind: "material_specification", expected: "exactly 1", found: 2 },
    },
    {
      name: "no input lot",
      edit: (fx) => without(fx, "input_lot"),
      problem: { slice_kind: "input_lot", expected: "at least 1", found: 0 },
    },
    {
      name: "no service premise",
      edit: (fx) => without(fx, "service_premise"),
      problem: { slice_kind: "service_premise", expected: "exactly 1", found: 0 },
    },
    {
      name: "two service premises (the sources name no rule choosing one)",
      edit: (fx) => twinOf(fx, "service_premise"),
      problem: { slice_kind: "service_premise", expected: "exactly 1", found: 2 },
    },
  ];

  it.each(cases)(
    "$name: refused at attest, with the exact problem, and nothing is written",
    async (c) => {
      const fx = variant(quarryWorksFixture(), c.edit);
      const rig = await newGmRig(fx);
      receiptOf(await rig.call(tool.establishSetting, settingRequest(fx)));
      const before = await heads(rig);
      const r = refusal(await rig.call(tool.attestOpening, attestRequest(fx)));
      expect(r.code).toBe("GM_FREIGHT_REFUSED");
      expect(r.details.halted.step).toBe("attest-opening");
      expect(r.details.halted.code).toBe("ENVELOPE_CANNOT_CARRY_THE_PROFILE");
      expect(r.details.halted.details.problems).toEqual([c.problem]);
      expect(await heads(rig)).toEqual(before);
    },
    120_000,
  );

  it("an envelope the bridge would never have written (SEEDED through World-State: two service premises) is NOT_ACTIONABLE, the legal source is refused, and nothing is written", async () => {
    const fx = variant(quarryWorksFixture(), (f: any) => twinOf(f, "service_premise"));
    (fx.opening.slices as { slice_id: string }[]).sort((a, b) =>
      a.slice_id < b.slice_id ? -1 : 1,
    );
    const rig = await newGmRig(fx);
    await seeded(rig, async (f) => {
      await establishSetting(f);
      await attestAndInitialize(f); // OWNER-SEEDED: the envelope and canonical time, through the owners' own adapters
    });
    const before = await heads(rig);

    const legal = refusal(await rig.call(tool.establishLegal, legalRequest(fx)));
    expect(legal.details.halted.code).toBe("SEALED_ENVELOPE_CANNOT_CARRY_THE_PROFILE");
    expect(legal.details.halted.details.problems).toEqual([
      { slice_kind: "service_premise", expected: "exactly 1", found: 2 },
    ]);

    const go = receiptOf(
      await rig.call(tool.initiate, { operation_id: "go", world_id: fx.worldId }),
    );
    expect(go.steps).toEqual([]);
    expect(go.awaiting).toMatchObject({
      kind: "NOT_ACTIONABLE",
      reason: "SEALED_ENVELOPE_CANNOT_CARRY_THE_PROFILE",
      problems: [{ slice_kind: "service_premise", expected: "exactly 1", found: 2 }],
    });
    const status = statusOf(await rig.call(tool.status, { world_id: fx.worldId }));
    expect(status.awaiting).toMatchObject({ kind: "NOT_ACTIONABLE" });
    // nothing the GM can author changes this, and the bridge did not pretend otherwise by writing anything
    expect(await heads(rig)).toEqual(before);
  }, 120_000);
});

describe("R-6 — the owners select the profile's slices; the bridge neither indexes the first nor guesses", () => {
  it("a decoy lot that sorts first and does not qualify is never admitted; the lot Economy's content rule selects is", async () => {
    const fx = variant(quarryWorksFixture(), (f: any) => {
      const base = f.opening.slices.find((s: any) => s.slice_kind === "input_lot");
      const decoy = JSON.parse(JSON.stringify(base));
      decoy.slice_id = "slice-a-decoy-lot";
      decoy.premise.lot_id = "decoy-lot";
      decoy.premise.dedicated_operation.output.output_class = "some-other-material";
      f.opening.slices.push(decoy);
      f.opening.slices.sort((a: any, b: any) => (a.slice_id < b.slice_id ? -1 : 1));
    });
    const rig = await newGmRig(fx);
    await authorThroughSeal(rig);
    const go = receiptOf(
      await rig.call(tool.initiate, { operation_id: "go", world_id: fx.worldId }),
    );
    expect(stepNames(go)).toEqual([
      "site-condition@slice-b-site-condition",
      "material-specification@slice-c-material-specification",
      "input-lot@slice-d-input-lot",
      "c05-origin-self-provision",
      "production-start",
      "production-register",
    ]);
    const c = await must(
      CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-test-read" }),
    );
    try {
      expect(c.store.getFact(productionInputLotKey("decoy-lot"))).toBeUndefined();
      expect(c.store.getFact(productionInputLotKey(fx.inputLot.lot_id))).toBeDefined();
    } finally {
      await c.close();
    }
  }, 180_000);
});

describe.each([
  ["Quarry Works", quarryWorksFixture],
  ["Textile Workshop", textileWorkshopFixture],
] as const)(
  "R-7 — the request chain is the owners' own cargo-slot history, however long — %s",
  (_l, fixture) => {
    it("nine renewals in, the bridge still finds the current request, continues from it, and reconciles every act", async () => {
      const rig = await newGmRig(fixture());
      const { fx } = rig;
      await authorThroughSeal(rig);
      const go1 = receiptOf(
        await rig.call(tool.initiate, { operation_id: "go-1", world_id: fx.worldId }),
      );
      if (go1.awaiting?.kind !== "PLAYER_OOC_TIME_ADVANCE")
        throw new Error("expected the boundary");
      expect(await playerAdvancesTo(rig, go1.awaiting.to)).toBe("NULL_PC_ADVANCE_COMMITTED");

      const CYCLES = 9; // the first head enumerated at most eight requests
      const refs: string[] = [];
      for (let i = 1; i <= CYCLES; i++) {
        // OWNER-SEEDED: E0 (first) or E2 (after the previous closed request) and L0, leaving a committed, undispatched service
        const ref = await seeded(rig, async (f) => {
          if (i === 1) {
            const r = await fixFreight(f);
            await admitServiceBasis(f);
            await admitService(f, r, 1);
            return r;
          }
          await must(
            f.economy.resolveFreightFixation({
              ...freightPublication("e2", i),
              resolution: { seal_id: fx.sealId, owner_event: economyFreightCloseKey(refs[i - 2]!) },
            }),
          );
          const r = f.economy.currentRequestRef(fx.sealId)!;
          await admitService(f, r, i);
          return r;
        });
        refs.push(ref);
        expect(ref).toBe(economyFreightRequestRef(fx.sealId, 2 * i - 1));
        receiptOf(
          await rig.call(tool.reportSiteChange, {
            operation_id: `change-${i}`,
            world_id: fx.worldId,
            condition_id: fx.siteCondition.condition_id,
            change_id: `re-survey-${i}`,
            statement: "SYNTHETIC FIXTURE: re-surveyed; the same pieces remain damaged.",
            outcome: "STANDING",
          }),
        );
        const w = receiptOf(
          await rig.call(tool.withdraw, { operation_id: `w-${i}`, world_id: fx.worldId }),
        );
        expect(stepNames(w)).toEqual([
          stepName("withdraw-admit", ref),
          stepName("withdraw-f2-release", ref),
          stepName("withdraw-close", ref),
        ]);
      }

      // the ninth request is closed; the bridge must see IT as the current one, not stop at the eighth
      const status = statusOf(await rig.call(tool.status, { world_id: fx.worldId }));
      expect(status.request?.request_ref).toBe(refs[CYCLES - 1]);
      expect(status.request?.allocation_status).toBe("terminal");
      const rec = receiptOf(
        await rig.call(tool.reconcile, { operation_id: `w-${CYCLES}`, world_id: fx.worldId }),
      ) as unknown as GmFreightReconciliation;
      expect(rec.committed.map((s) => s.step).sort()).toEqual(
        [
          stepName("withdraw-admit", refs[CYCLES - 1]!),
          stepName("withdraw-close", refs[CYCLES - 1]!),
          stepName("withdraw-f2-release", refs[CYCLES - 1]!),
        ].sort(),
      );

      const next = receiptOf(
        await rig.call(tool.initiate, { operation_id: "go-next", world_id: fx.worldId }),
      );
      expect(stepNames(next)[0]).toBe(stepName("e2-fixation-after", refs[CYCLES - 1]!));
      expect(next.status!.request?.request_ref).toBe(
        economyFreightRequestRef(fx.sealId, 2 * CYCLES + 1),
      );
      const c = await must(
        CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-test-read" }),
      );
      try {
        expect(c.verify()).toEqual([]);
      } finally {
        await c.close();
      }
    }, 600_000);
  },
);

describe("R-8 — a per-call ceiling is a continuation, never a failure and never a silent stop", () => {
  const FIRST_ASK = [
    "site-condition@slice-b-site-condition",
    "material-specification@slice-c-material-specification",
    "input-lot@slice-d-input-lot",
    "c05-origin-self-provision",
    "production-start",
    "production-register",
  ];

  it("the ceiling is trusted-side configuration with a documented default", () => {
    expect(DEFAULT_MAX_ACTS_PER_CALL).toBe(32);
  });

  it("stopping at the ceiling says MORE_OWNER_WORK_DUE; presenting the ask again continues, and the end state equals the uncapped run's", async () => {
    const capped = await newGmRig(quarryWorksFixture());
    await authorThroughSeal(capped);
    const limits = { maxActsPerCall: 2 };
    const seen: string[] = [];
    let last = receiptOf(
      await capped.call(
        tool.initiate,
        { operation_id: "cap-1", world_id: capped.fx.worldId },
        { limits },
      ),
    );
    expect(stepNames(last)).toHaveLength(2);
    expect(last.awaiting).toMatchObject({ kind: "MORE_OWNER_WORK_DUE" });
    seen.push(...stepNames(last));
    for (let i = 2; last.awaiting?.kind === "MORE_OWNER_WORK_DUE" && i < 10; i++) {
      last = receiptOf(
        await capped.call(
          tool.initiate,
          { operation_id: `cap-${i}`, world_id: capped.fx.worldId },
          { limits },
        ),
      );
      seen.push(...stepNames(last));
    }
    expect(seen).toEqual(FIRST_ASK);
    expect(last.awaiting).toMatchObject({ kind: "PLAYER_OOC_TIME_ADVANCE" });

    const free = await newGmRig(quarryWorksFixture());
    await authorThroughSeal(free);
    const all = receiptOf(
      await free.call(tool.initiate, { operation_id: "free", world_id: free.fx.worldId }),
    );
    expect(stepNames(all)).toEqual(FIRST_ASK);
    // the owners hold the same facts either way (the whole-state hash legitimately differs: it records the two runs' different tokens)
    expect(await factsOf(capped)).toEqual(await factsOf(free));
    expect((await heads(capped)).revision).toBe((await heads(free)).revision);
  }, 300_000);

  it("a ceiling exactly equal to the remaining owner work is NOT reported as more work due: the real wait is", async () => {
    const rig = await newGmRig(quarryWorksFixture());
    await authorThroughSeal(rig);
    const r = receiptOf(
      await rig.call(
        tool.initiate,
        { operation_id: "exact", world_id: rig.fx.worldId },
        { limits: { maxActsPerCall: FIRST_ASK.length } },
      ),
    );
    expect(stepNames(r)).toEqual(FIRST_ASK);
    expect(r.awaiting).toMatchObject({ kind: "PLAYER_OOC_TIME_ADVANCE" });
  }, 180_000);

  it("no host request can set, see or exceed the ceiling: it is not a field of any request", async () => {
    const rig = await newGmRig(quarryWorksFixture());
    await authorThroughSeal(rig);
    for (const field of ["maxActsPerCall", "max_acts", "limits", "limit"]) {
      const r = refusal(
        await rig.call(tool.initiate, { operation_id: "x", world_id: rig.fx.worldId, [field]: 1 }),
      );
      expect(r.code).toBe("GM_FREIGHT_INPUT_INVALID");
    }
  }, 120_000);
});
