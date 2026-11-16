/* eslint-disable @typescript-eslint/no-explicit-any -- tests edit authored fixture premises */
import { describe, expect, it } from "vitest";
import type { GmFreightResult } from "@immortalis/engine";
import { CanonicalCampaign, GipAdapter } from "@immortalis/engine";
import { GM_FREIGHT_TOOLS } from "@immortalis/contracts";
import {
  freightPublication,
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import { variant } from "../support/freight.ts";
import {
  attestRequest,
  legalRequest,
  newGmRig,
  operatorStartsChronology,
  playerAdvancesTo,
  receiptOf,
  settingRequest,
  statusOf,
  stepNames,
  type GmRig,
} from "../support/gm-freight.ts";
import { must } from "../support/temporal.ts";

/**
 * The material refusals, through the bridge. MECHANISM ONLY (T1). Each case is an authored premise that is NOT lawful or NOT sufficient; the
 * bridge forwards the GM's authorship and the OWNER refuses the affected act, reports its own bounded reason, preserves every earlier
 * committed act, and invents no helpful outcome. The bridge never decides these: an owner does.
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

/** a rig whose original envelope is attested and whose chronology is stated, but whose legal source is not yet established */
async function throughChronology(fx: FreightWorldFixture): Promise<GmRig> {
  const rig = await newGmRig(fx);
  receiptOf(await rig.call(tool.establishSetting, settingRequest(fx)));
  receiptOf(await rig.call(tool.attestOpening, attestRequest(fx)));
  expect(await operatorStartsChronology(rig)).toBe("TIME_ESTABLISHED");
  return rig;
}

describe("PO-2 through the bridge — only a competent, closed, single-order, no-sunset opening is ready", () => {
  const cases: {
    name: string;
    edit: (fx: any) => void;
    step: "legal-opening-basis" | "legal-clauses" | "legal-seal";
    code: string;
    message: RegExp;
  }[] = [
    {
      name: "permission alone (no C-05/C-06/C-07 direction) never supplies a choice",
      edit: (fx) => {
        fx.legal.clauses = fx.legal.clauses.filter((c: { clause: string }) =>
          ["C-01", "C-02", "C-03", "C-04"].includes(c.clause),
        );
      },
      step: "legal-opening-basis",
      code: "SOURCE_REFUSED",
      message: /all seven operative clauses/,
    },
    {
      name: "a provision of a different governing order is not a clause of this Instrument",
      edit: (fx) => {
        fx.legal.clauses[5].order_id = "another-order";
      },
      step: "legal-clauses",
      code: "SOURCE_REFUSED",
      message: /different governing order/,
    },
    {
      name: "a wrong effect class (C-05 authored as a permission) is not that clause",
      edit: (fx) => {
        fx.legal.clauses[4].effect_class = "permission";
      },
      step: "legal-clauses",
      code: "SOURCE_REFUSED",
      message: /C-05 is a administrative_direction/,
    },
    {
      name: "a clause addressing a foreign institution is not this order's",
      edit: (fx) => {
        fx.legal.clauses[3].terms.institution_id = "rival-guild";
      },
      step: "legal-clauses",
      code: "SOURCE_REFUSED",
      message: /exactly the order's own institution/,
    },
    {
      name: "silence is not absence: a coverage item left out refuses the closed coverage",
      edit: (fx) => {
        fx.legal.coverage = fx.legal.coverage.slice(1);
      },
      step: "legal-opening-basis",
      code: "SOURCE_REFUSED",
      message: /silence is not absence/,
    },
    {
      name: "an unresolved publication/notice requirement is not readiness",
      edit: (fx) => {
        const i = fx.legal.coverage.findIndex(
          (c: { item: string }) => c.item === "publication_or_notice",
        );
        fx.legal.coverage[i].disposition = "unresolved";
      },
      step: "legal-seal",
      code: "WITHHELD",
      message: /neither evidenced nor expressly established inapplicable/,
    },
    {
      name: "a permission that expires (a sunset not expressly excluded) is Variant B, not this profile",
      edit: (fx) => {
        const i = fx.legal.coverage.findIndex(
          (c: { item: string }) => c.item === "sunset_or_expiry",
        );
        fx.legal.coverage[i].disposition = "evidenced";
      },
      step: "legal-seal",
      code: "WITHHELD",
      message: /neither evidenced nor expressly established inapplicable/,
    },
    {
      name: "an authority locus that does not rest on the antecedent provision cannot confer its own competence",
      edit: (fx) => {
        fx.office.authority_source_ref = "the-instrument-itself";
      },
      step: "legal-seal",
      code: "WITHHELD",
      message: /cannot create its own competence/,
    },
    {
      name: "an Instrument whose validity under the order is contested is contested, not ready",
      edit: (fx) => {
        fx.instrument.validity_by_order[0].validity_status = "contested";
      },
      step: "legal-seal",
      code: "WITHHELD",
      message: /contested/,
    },
    {
      name: "an Instrument that is only proposed is not operative in the setting at T0",
      edit: (fx) => {
        fx.instrument.lifecycle_status = "proposed";
      },
      step: "legal-seal",
      code: "WITHHELD",
      message: /not operative/,
    },
  ];

  for (const [label, fixture] of [
    ["Quarry Works", quarryWorksFixture],
    ["Textile Workshop", textileWorkshopFixture],
  ] as const)
    for (const c of cases)
      it(`${label}: ${c.name}`, async () => {
        const fx = variant(fixture(), c.edit);
        const rig = await throughChronology(fx);
        const r = refusal(await rig.call(tool.establishLegal, legalRequest(fx)));
        expect(r.code).toBe("GM_FREIGHT_REFUSED");
        // the owner's own answer, bounded: which act, its refusal class and its reason
        expect(r.details.halted.step).toBe(c.step);
        expect(r.details.halted.code).toBe(c.code);
        expect(r.details.halted.message).toMatch(c.message);
        // every EARLIER act stands; the refused act and everything after it were never written
        const order = [
          "legal-opening-basis",
          "legal-institution",
          "legal-office",
          "legal-scope-binding",
          "legal-instrument",
          "legal-clauses",
          "legal-seal",
        ];
        expect(r.details.steps.map((s: { step: string }) => s.step)).toEqual(
          order.slice(0, order.indexOf(c.step)),
        );
        const status = statusOf(await rig.call(tool.status, { world_id: fx.worldId }));
        expect(status.milestones["legal_sealed"]).toBe(false);
        // an unsealed profile selects nothing downstream: asking for the chain only asks again for the legal source
        const go = receiptOf(
          await rig.call(tool.initiate, { operation_id: "go", world_id: fx.worldId }),
        );
        expect(go.steps).toEqual([]);
        expect(go.awaiting).toMatchObject({ kind: "GM_AUTHORING", tool: tool.establishLegal });
      }, 120_000);
});

describe("the sealed original envelope and the setting's order of authorship", () => {
  it("is attested once, never late, and never from a premise that states what an owner must earn", async () => {
    const fx = quarryWorksFixture();
    const rig = await newGmRig(fx);
    // an envelope before the setting exists is the owner's refusal (the world and both sites are established first)
    const early = refusal(await rig.call(tool.attestOpening, attestRequest(fx)));
    expect(early.code).toBe("GM_FREIGHT_REFUSED");
    expect(early.details.halted.code).toBe("PREREQUISITE_MISSING");
    receiptOf(await rig.call(tool.establishSetting, settingRequest(fx)));

    // a slice that states a downstream verdict is not a premise: it has no field in the typed reading, so nothing is committed
    const before = await heads(rig);
    const withVerdict: any = JSON.parse(JSON.stringify(attestRequest(fx)));
    withVerdict.opening.slices[2].premise.result = "twelve blocks are delivered and accepted";
    const invalid = refusal(await rig.call(tool.attestOpening, withVerdict));
    expect(invalid.code).toBe("GM_FREIGHT_INPUT_INVALID");
    expect(await heads(rig)).toEqual(before);
    // a role, a permission or an authorship asserted by the model is an over-claim, not a credential
    for (const claim of [
      { authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" } },
      { role: "role.gm" },
      { permission: "permission.canon.write" },
    ]) {
      const forged: any = JSON.parse(JSON.stringify(attestRequest(fx)));
      Object.assign(forged.opening, claim);
      expect(refusal(await rig.call(tool.attestOpening, forged)).code).toBe(
        "GM_FREIGHT_INPUT_INVALID",
      );
    }
    expect(await heads(rig)).toEqual(before);

    receiptOf(await rig.call(tool.attestOpening, attestRequest(fx)));
    // a second envelope (even with a new token) is refused by the owner and the first stands
    const second = refusal(await rig.call(tool.attestOpening, attestRequest(fx, "another-token")));
    expect(second.code).toBe("GM_FREIGHT_REFUSED");
    // canonical time exists: no late attestation is rescued
    const late = await newGmRig(textileWorkshopFixture());
    receiptOf(await late.call(tool.establishSetting, settingRequest(late.fx)));
    expect(await operatorStartsChronology(late)).toBe("TIME_ESTABLISHED");
    const lateRefusal = refusal(await late.call(tool.attestOpening, attestRequest(late.fx)));
    expect(lateRefusal.code).toBe("GM_FREIGHT_REFUSED");
    expect(lateRefusal.details.halted.code).toBe("NOT_ADMISSIBLE");
  }, 180_000);

  it("changed terms under the same token are a conflict at every authored act", async () => {
    const fx = quarryWorksFixture();
    const rig = await throughChronology(fx);
    receiptOf(await rig.call(tool.establishLegal, legalRequest(fx, "legal-token")));
    const changed: any = JSON.parse(JSON.stringify(legalRequest(fx, "legal-token")));
    changed.office = {
      ...changed.office,
      competence_scope: "a competence the GM revised after the fact",
    };
    const conflict = refusal(await rig.call(tool.establishLegal, changed));
    expect(conflict.code).toBe("GM_FREIGHT_INTENT_CONFLICT");
    expect(conflict.details.halted.step).toBe("legal-office");
  }, 120_000);
});

describe("material refusals after the seal: the owners judge the premises the GM specified", () => {
  it("withholds C-05 when no dedicated lot exists, and when two qualifying lots tie, and writes no Production or Economy fact", async () => {
    const none = variant(quarryWorksFixture(), (fx) => {
      fx.opening.slices = fx.opening.slices.filter(
        (s: { slice_kind: string }) => s.slice_kind !== "input_lot",
      );
    });
    const rigNone = await throughChronology(none);
    receiptOf(await rigNone.call(tool.establishLegal, legalRequest(none)));
    const r0 = refusal(
      await rigNone.call(tool.initiate, { operation_id: "go", world_id: none.worldId }),
    );
    expect(r0.details.halted.step).toBe("c05-origin-self-provision");
    expect(r0.details.halted.code).toBe("WITHHELD");
    expect(r0.details.halted.message).toMatch(/no dedicated source lot qualifies/);

    const tie = quarryWorksFixture();
    const twin = JSON.parse(
      JSON.stringify(tie.opening.slices.find((s) => s.slice_kind === "input_lot")),
    );
    twin.slice_id = "slice-d-input-lot-twin";
    twin.premise.lot_id = "twin-lot";
    (tie.opening as { slices: unknown[] }).slices.push(twin);
    (tie.opening.slices as { slice_id: string }[]).sort((a, b) =>
      a.slice_id < b.slice_id ? -1 : 1,
    );
    const rigTie = await throughChronology(tie);
    receiptOf(await rigTie.call(tool.establishLegal, legalRequest(tie)));
    const r1 = refusal(
      await rigTie.call(tool.initiate, { operation_id: "go", world_id: tie.worldId }),
    );
    expect(r1.details.halted.code).toBe("WITHHELD");
    expect(r1.details.halted.message).toMatch(/a tie is never broken/);
    // both lots and the condition and specification were admitted by their owners; nothing of Economy or Production was started
    expect(r1.details.steps.map((s: { step: string }) => s.step)).toEqual([
      "site-condition-slice-b-site-condition",
      "material-specification-slice-c-material-specification",
      "input-lot-slice-d-input-lot",
      "input-lot-slice-d-input-lot-twin",
    ]);
  }, 180_000);

  it("refuses a service that cannot carry the whole cargo and a service whose handling is incompatible, at the owner's own act", async () => {
    for (const edit of [
      (fx: any) => {
        fx.service.handling.max_quantity.amount = 3; // the requirement is whole: a part is not a shipment
      },
      (fx: any) => {
        fx.service.handling.material_class = "some-other-material";
      },
    ]) {
      const fx = variant(quarryWorksFixture(), edit);
      const rig = await throughChronology(fx);
      receiptOf(await rig.call(tool.establishLegal, legalRequest(fx)));
      const go1 = receiptOf(
        await rig.call(tool.initiate, { operation_id: "go-1", world_id: fx.worldId }),
      );
      if (go1.awaiting?.kind !== "PLAYER_OOC_TIME_ADVANCE")
        throw new Error("expected the production boundary");
      expect(await playerAdvancesTo(rig, go1.awaiting.to)).toBe("NULL_PC_ADVANCE_COMMITTED");
      const r = refusal(
        await rig.call(tool.initiate, { operation_id: "go-2", world_id: fx.worldId }),
      );
      expect(r.code).toBe("GM_FREIGHT_REFUSED");
      // the request was fixed, and nothing was dispatched: the unsuitable service is refused, never worked around
      const done: string[] = r.details.steps.map((s: { step: string }) => s.step);
      expect(done).toContain("e0-fixation");
      expect(done.some((s) => s.startsWith("l1-first-dispatch"))).toBe(false);
      expect(r.details.halted.step).toMatch(/^(service-basis|l0-service-admission)/);
      const status = statusOf(await rig.call(tool.status, { world_id: fx.worldId }));
      expect(status.milestones["first_dispatch_l1_f3"]).toBe(false);
    }
  }, 240_000);

  it("a GIP write after the seal makes the clauses unresolved: this profile alone is disabled and Economy fixes nothing", async () => {
    const fx = quarryWorksFixture();
    const rig = await throughChronology(fx);
    receiptOf(await rig.call(tool.establishLegal, legalRequest(fx)));
    // any authoritative GIP write anywhere, here raw through the owner's own adapter (a competing authority from outside the bridge)
    const c = await must(
      CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-test-gip" }),
    );
    await must(
      new GipAdapter(c.store).establishInstitution({
        ...freightPublication("rival", 1),
        institution: {
          institution_id: "rival-works",
          identity_label: "A rival works established after the seal",
          continuity_status: "continuing",
        },
      }),
    );
    await c.close();
    const r = refusal(await rig.call(tool.initiate, { operation_id: "go", world_id: fx.worldId }));
    expect(r.code).toBe("GM_FREIGHT_REFUSED");
    expect(r.details.halted.step).toBe("c05-origin-self-provision");
    expect(r.details.steps.map((s: { step: string }) => s.step)).toEqual([
      "site-condition-slice-b-site-condition",
      "material-specification-slice-c-material-specification",
      "input-lot-slice-d-input-lot",
    ]);
  }, 120_000);
});

describe("the call itself: forged, foreign and out-of-order", () => {
  it("a world that does not exist, or that another campaign holds, is not read or written", async () => {
    const fx = quarryWorksFixture();
    const rig = await newGmRig(fx);
    const status = statusOf(await rig.call(tool.status, { world_id: "no-such-world" }));
    expect(status.stage).toBe("setting_established");
    const go = receiptOf(
      await rig.call(tool.initiate, { operation_id: "go", world_id: "no-such-world" }),
    );
    expect(go.steps).toEqual([]);
    expect(go.awaiting).toMatchObject({ kind: "GM_AUTHORING", tool: tool.establishSetting });
  }, 60_000);

  it("asking early, twice, or after completion is safe: the chain proceeds only by owner state, and never twice", async () => {
    const fx = textileWorkshopFixture();
    const rig = await throughChronology(fx);
    receiptOf(await rig.call(tool.establishLegal, legalRequest(fx)));
    const a = receiptOf(
      await rig.call(tool.initiate, { operation_id: "go-a", world_id: fx.worldId }),
    );
    // the same ask again while the player's time has not moved: nothing is due, nothing is written
    const b = receiptOf(
      await rig.call(tool.initiate, { operation_id: "go-b", world_id: fx.worldId }),
    );
    expect(b.steps).toEqual([]);
    expect(b.awaiting).toEqual(a.awaiting);
    // the same token again: the already-committed acts are reported by identity (the original receipts)
    const again = receiptOf(
      await rig.call(tool.initiate, { operation_id: "go-a", world_id: fx.worldId }),
    );
    expect(again.steps).toEqual([]);
    expect(again.committed_under_token.map((s) => s.step)).toEqual([...stepNames(a)].sort());
  }, 180_000);
});
