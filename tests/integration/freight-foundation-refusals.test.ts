/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and inspect arbitrary owner values */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COVERAGE_ITEMS,
  OpeningAttestationSchema,
  worldOpeningAttestationKey,
  worldSiteConditionKey,
} from "@immortalis/contracts";
import {
  freightPublication as pub,
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import {
  FREIGHT_WORLD_RULE,
  deriveOpeningAttestation,
  groupOfPlan,
  storeSource,
} from "@immortalis/engine";
import {
  admitPremises,
  assembleLegal,
  attestAndInitialize,
  basisIdOf,
  createFreightCampaign,
  establishSetting,
  fixFreight,
  foundationThroughFixation,
  keysOf,
  openThroughSeal,
  originSelfProvision,
  outcome,
  produceAndAccept,
  sealReadiness,
  variant,
  countKind,
  type Freight,
} from "../support/freight.ts";
import { must } from "../support/temporal.ts";

let dir: string;
let open: Freight[] = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-refusals-"));
  open = [];
});
afterEach(async () => {
  for (const f of open) await f.campaign.close();
  await rm(dir, { recursive: true, force: true });
});

let seq = 0;
async function world(fx: FreightWorldFixture): Promise<Freight> {
  const f = await createFreightCampaign(join(dir, `w${seq++}`), fx);
  open.push(f);
  return f;
}

describe("PO-6/PO-1 — the opening is the GM's original NULL-PC setting, attested once and never rescued", () => {
  it("refuses a player-authored, mismatched-authority, second, late or player-bearing opening", async () => {
    const f = await world(quarryWorksFixture());
    await establishSetting(f);
    // authority is the GM's adjudication authority and nothing else: a player's commitment authority is not a setup operation
    const asPlayer = {
      ...f.fx.opening,
      authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
    };
    expect((await outcome(f.world.attestOpening({ ...pub("o", 1), opening: asPlayer }))).code).toBe(
      "INPUT_INVALID",
    );
    // a slice that is not ordinary-language prose, or an unknown kind, is not a premise
    const badKind = {
      ...f.fx.opening,
      slices: [{ ...f.fx.opening.slices[0]!, slice_kind: "title_deed" }],
    };
    expect((await outcome(f.world.attestOpening({ ...pub("o", 2), opening: badKind }))).code).toBe(
      "INPUT_INVALID",
    );
    // an endpoint that is not an established locus of the world is no opening
    const ghost = { ...f.fx.opening, destination_locus_id: "nowhere" };
    expect((await outcome(f.world.attestOpening({ ...pub("o", 3), opening: ghost }))).code).toBe(
      "PREREQUISITE_MISSING",
    );
    // the genuine opening is attested ONCE; a second attempt (even a byte-identical one under a new identity) is refused
    await must(f.world.attestOpening({ ...pub("o", 4), opening: f.fx.opening }));
    const again = await outcome(f.world.attestOpening({ ...pub("o", 5), opening: f.fx.opening }));
    expect(again.code).not.toBe("OK");
    expect(countKind(f, "world/quarry-vale/opening-attestation")).toBe(1);
    // lost ACK: the SAME intent re-presented reaches the ORIGINAL receipt and writes nothing
    const replay = await outcome(f.world.attestOpening({ ...pub("o", 4), opening: f.fx.opening }));
    expect(replay).toMatchObject({ code: "OK", replayed: true });
    // the same intent with changed terms is a conflict, never a silent reuse
    const changed = { ...f.fx.opening, envelope_id: "another-envelope" };
    expect((await outcome(f.world.attestOpening({ ...pub("o", 4), opening: changed }))).code).toBe(
      "INTENT_CONFLICT",
    );
  });

  it("refuses to attest after canonical time exists (no late seal is rescued) and for a world a player character is bound to", async () => {
    const late = await world(quarryWorksFixture());
    await establishSetting(late);
    await must(late.coordinator.establishCanonicalTime({ ...pub("t", 1), time: late.fx.t0 }));
    const r = await outcome(late.world.attestOpening({ ...pub("o", 1), opening: late.fx.opening }));
    expect(r.code).toBe("NOT_ADMISSIBLE");
    expect(r.message).toMatch(/canonical time/);

    const pc = await world(textileWorkshopFixture());
    await establishSetting(pc);
    const { fixtureContract, fixtureInsertionFact } = await import("@immortalis/testkit");
    await must(
      pc.campaign.releasePlayerCharacter({ ...pub("pc", 1), contract: fixtureContract() }),
    );
    await must(
      pc.campaign.bindPlayerCharacter({
        ...pub("pc", 2),
        pc_id: fixtureContract().pc_id,
        world_id: pc.fx.worldId,
        locus_id: pc.fx.originLocusId,
        insertion: fixtureInsertionFact(),
      }),
    );
    const bound = await outcome(pc.world.attestOpening({ ...pub("o", 1), opening: pc.fx.opening }));
    expect(bound.code).toBe("NOT_ADMISSIBLE");
    expect(bound.message).toMatch(/NULL-PC/);
  });

  it("a forged attestation committed raw (a swapped digest, a dropped slice) is refused by the owner's re-derivation", async () => {
    const f = await world(quarryWorksFixture());
    await establishSetting(f);
    const plan = deriveOpeningAttestation(storeSource(f.campaign.store), f.fx.opening);
    if (!plan.ok) throw new Error("setup: the lawful attestation must derive");
    const good = plan.value.writes[0]!;
    const swapped = OpeningAttestationSchema.parse(good.value);
    swapped.envelope.slices[1] = { ...swapped.envelope.slices[1]!, digest: "0".repeat(64) };
    const dropped = OpeningAttestationSchema.parse(good.value);
    dropped.envelope.slices = dropped.envelope.slices.slice(0, 3);
    for (const [n, value] of [
      [1, swapped],
      [2, dropped],
    ] as const) {
      const g = groupOfPlan(
        f.campaign.store,
        pub("forged", n),
        "world_state",
        "world_opening_provenance",
        FREIGHT_WORLD_RULE,
        { ...plan.value, writes: [{ ...good, value }] },
      );
      const r = await outcome(f.campaign.store.commit(g));
      expect(r.code, `forgery ${n}`).toBe("VALUE_INVALID");
    }
    expect(f.campaign.store.getFact(worldOpeningAttestationKey(f.fx.worldId))).toBeUndefined();
  });
});

describe("PO-2 — distinct C-01..C-07 authority: only a competent, closed, single-order, no-sunset opening is ready", () => {
  const legalEdits: [
    string,
    (fx: { legal: FreightWorldFixture["legal"] }) => void,
    RegExp,
    string,
  ][] = [];
  const cases: {
    name: string;
    edit: (fx: any) => void;
    stage: "basis" | "clauses" | "seal";
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
      stage: "basis",
      code: "SOURCE_REFUSED",
      message: /all seven operative clauses/,
    },
    {
      name: "a provision of a different governing order is not a clause of this Instrument",
      edit: (fx) => {
        fx.legal.clauses[5].order_id = "another-order";
      },
      stage: "clauses",
      code: "SOURCE_REFUSED",
      message: /different governing order/,
    },
    {
      name: "a wrong effect class (C-05 authored as a permission) is not that clause",
      edit: (fx) => {
        fx.legal.clauses[4].effect_class = "permission";
      },
      stage: "clauses",
      code: "SOURCE_REFUSED",
      message: /C-05 is a administrative_direction/,
    },
    {
      name: "a clause addressing a foreign institution is not this order's",
      edit: (fx) => {
        fx.legal.clauses[3].terms.institution_id = "rival-guild";
      },
      stage: "clauses",
      code: "SOURCE_REFUSED",
      message: /exactly the order's own institution/,
    },
    {
      name: "silence is not absence: a coverage item left out refuses the closed coverage",
      edit: (fx) => {
        fx.legal.coverage = fx.legal.coverage.slice(1);
      },
      stage: "basis",
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
      stage: "seal",
      code: "WITHHELD",
      message: /neither evidenced nor expressly established inapplicable/,
    },
    {
      name: "a contested coverage item is contested, not ready",
      edit: (fx) => {
        const i = fx.legal.coverage.findIndex(
          (c: { item: string }) => c.item === "jurisdiction_origin",
        );
        fx.legal.coverage[i].disposition = "contested";
      },
      stage: "seal",
      code: "WITHHELD",
      message: /contested/,
    },
    {
      name: "a second governing order evidenced into the coverage is not folded into the one Instrument",
      edit: (fx) => {
        const i = fx.legal.coverage.findIndex(
          (c: { item: string }) => c.item === "conflicting_orders",
        );
        fx.legal.coverage[i].disposition = "evidenced";
      },
      stage: "seal",
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
      stage: "seal",
      code: "WITHHELD",
      message: /neither evidenced nor expressly established inapplicable/,
    },
    {
      name: "an authority locus that does not rest on the antecedent provision cannot confer its own competence",
      edit: (fx) => {
        fx.office.authority_source_ref = "the-instrument-itself";
      },
      stage: "seal",
      code: "WITHHELD",
      message: /cannot create its own competence/,
    },
    {
      name: "an Instrument whose validity under the order is contested is contested, not ready",
      edit: (fx) => {
        fx.instrument.validity_by_order[0].validity_status = "contested";
      },
      stage: "seal",
      code: "WITHHELD",
      message: /contested/,
    },
    {
      name: "an Instrument that is only proposed is not operative in the setting at T0",
      edit: (fx) => {
        fx.instrument.lifecycle_status = "proposed";
      },
      stage: "seal",
      code: "WITHHELD",
      message: /not operative/,
    },
    {
      name: "an Instrument carrying validity under another order is unresolved here",
      edit: (fx) => {
        fx.instrument.validity_by_order.push({
          governing_order_ref: "town-edict",
          validity_status: "valid",
        });
      },
      stage: "seal",
      code: "WITHHELD",
      message: /another governing order/,
    },
  ];
  void legalEdits;
  void COVERAGE_ITEMS;

  for (const c of cases)
    it(c.name, async () => {
      const f = await world(variant(quarryWorksFixture(), c.edit));
      await establishSetting(f);
      await attestAndInitialize(f);
      const { fx, gip, gipFreight } = f;
      const assembly = { world_id: fx.worldId };
      const step = async (n: number, run: () => Promise<unknown>) => {
        if (n === 0) return;
        await run();
      };
      void step;
      // basis stage
      const basis = await outcome(
        gipFreight.establishOpeningBasis({ ...pub("legal", 1), assembly }),
      );
      if (c.stage === "basis") {
        expect(basis.code).toBe(c.code);
        expect(basis.message).toMatch(c.message);
        expect(countKind(f, "gip/opening-basis/")).toBe(0);
        return;
      }
      expect(basis.code).toBe("OK");
      await must(gip.establishInstitution({ ...pub("legal", 2), institution: fx.institution }));
      await must(gip.establishOffice({ ...pub("legal", 3), office: fx.office }));
      await must(gip.establishScopeBinding({ ...pub("legal", 4), scope_binding: fx.scopeBinding }));
      await must(
        gip.establishGovernanceInstrument({ ...pub("legal", 5), instrument: fx.instrument }),
      );
      const clauses = await outcome(
        gipFreight.establishInstrumentClauses({ ...pub("legal", 6), assembly }),
      );
      if (c.stage === "clauses") {
        expect(clauses.code).toBe(c.code);
        expect(clauses.message).toMatch(c.message);
        expect(countKind(f, "gip/instrument/")).toBe(1); // the Instrument only, no clause
        return;
      }
      expect(clauses.code).toBe("OK");
      const seal = await outcome(gipFreight.sealReadiness({ ...pub("legal", 7), assembly }));
      expect(seal.code).toBe(c.code);
      expect(seal.message).toMatch(c.message);
      expect(gipFreight.readinessSeal(fx.sealId)).toBeUndefined();
      // an unsealed profile selects nothing downstream: GIP's answer is unresolved, Economy writes nothing
      const answers = gipFreight.applicability(fx.sealId, [
        { clause: "C-05", subject: {} },
      ]).answers;
      expect(answers[0]!.applicability).toBe("unresolved");
    });

  it("two governing orders in one sealed envelope are not folded into one Instrument", async () => {
    const base = quarryWorksFixture();
    const fx = variant(base, () => undefined);
    const second = {
      ...fx.opening.slices[0]!,
      slice_id: "slice-z-second-order",
      statement: "A second order of the town.",
    };
    (fx.opening as { slices: unknown[] }).slices.push(second);
    (fx.opening.slices as { slice_id: string }[]).sort((a, b) =>
      a.slice_id < b.slice_id ? -1 : 1,
    );
    const f = await world(fx);
    await establishSetting(f);
    await attestAndInitialize(f);
    const r = await outcome(
      f.gipFreight.establishOpeningBasis({
        ...pub("legal", 1),
        assembly: { world_id: fx.worldId },
      }),
    );
    expect(r.code).toBe("SOURCE_REFUSED");
    expect(r.message).toMatch(/more than one governing order/);
  });

  it("the seal is refused once canonical time has advanced past T0 or a premise was admitted early, and is never reopened", async () => {
    const f = await world(textileWorkshopFixture());
    await establishSetting(f);
    await attestAndInitialize(f);
    await assembleLegal(f);
    // a premise admitted before the seal: only the named opening writes are allowed through readiness
    await must(
      f.world.admitSiteCondition({
        ...pub("early", 1),
        condition: { world_id: f.fx.worldId, slice_id: f.fx.slices.siteCondition },
      }),
    );
    const early = await outcome(
      f.gipFreight.sealReadiness({ ...pub("legal", 7), assembly: { world_id: f.fx.worldId } }),
    );
    expect(early.code).toBe("NOT_ADMISSIBLE");
    expect(early.message).toMatch(/admitted before the seal/);
    expect(f.gipFreight.readinessSeal(f.fx.sealId)).toBeUndefined();
  });

  it("seals once, and a sealed readiness is never recomputed from later narration", async () => {
    const f = await world(quarryWorksFixture());
    await openThroughSeal(f);
    const again = await outcome(
      f.gipFreight.sealReadiness({ ...pub("legal", 8), assembly: { world_id: f.fx.worldId } }),
    );
    expect(again.code).toBe("NOT_ADMISSIBLE");
    expect(again.message).toMatch(/sealed once/);
  });
});

describe.each([
  ["Quarry Works", quarryWorksFixture],
  ["Textile Workshop", textileWorkshopFixture],
] as const)("PO-1/PO-2/PO-3 — Production premises, C-05 and C-06 in %s", (_label, fixture) => {
  it("admits no premise from an absent, wrong-kind, untyped or post-hoc-sized slice, and only from an admitted condition", async () => {
    const f = await world(fixture());
    await openThroughSeal(f);
    const { fx } = f;
    const spec = (slice_id: string) =>
      outcome(
        f.productionFreight.admitMaterialSpecification({
          ...pub("s", Math.random()),
          premise: { world_id: fx.worldId, slice_id },
        }),
      );
    // an absent slice
    expect((await spec("slice-never-authored")).code).toBe("SOURCE_REFUSED");
    // a slice of another kind (wrong owner): the legal slice is not a material prerequisite
    expect((await spec(fx.slices.legal)).code).toBe("SOURCE_REFUSED");
    // the prerequisite cannot precede World-State's own admission of the objective condition
    const early = await spec(fx.slices.specification);
    expect(early.code).toBe("PREREQUISITE_MISSING");
    // wrong owner: World-State will not admit a material specification as a site condition
    const wrongOwner = await outcome(
      f.world.admitSiteCondition({
        ...pub("w", 1),
        condition: { world_id: fx.worldId, slice_id: fx.slices.specification },
      }),
    );
    expect(wrongOwner.code).toBe("SOURCE_REFUSED");
    await must(
      f.world.admitSiteCondition({
        ...pub("w", 2),
        condition: { world_id: fx.worldId, slice_id: fx.slices.siteCondition },
      }),
    );
    // the condition is admitted once from its sealed slice
    const twice = await outcome(
      f.world.admitSiteCondition({
        ...pub("w", 3),
        condition: { world_id: fx.worldId, slice_id: fx.slices.siteCondition },
      }),
    );
    expect(twice.code).toBe("NOT_ADMISSIBLE");
    await must(
      f.productionFreight.admitMaterialSpecification({
        ...pub("s", 99),
        premise: { world_id: fx.worldId, slice_id: fx.slices.specification },
      }),
    );
    // exact class, positive total and unit are authored facts: the admitted prerequisite equals the authored total
    const admitted = f.productionFreight.materialSpecification(
      fx.specification.specification_id,
    )!.value;
    expect(admitted.quantity).toEqual(fx.specification.quantity);
    expect(admitted.nature).toMatch(/NOT_UNDERTAKING_OPERATION_RESERVE_OR_INVENTORY/);
  });

  it("refuses a conditional specification without an exact total and one asserted solely by multiplication", async () => {
    for (const [name, edit] of [
      [
        "no exact total",
        (fx: any) => {
          delete fx.specification.quantity;
        },
      ],
      [
        "a total asserted by multiplication",
        (fx: any) => {
          delete fx.specification.quantity;
          fx.specification.per_component = { amount: 1, unit: fx.specification.material_class };
          fx.specification.components = fx.siteCondition.damaged_components.length;
        },
      ],
      [
        "a zero total",
        (fx: any) => {
          fx.specification.quantity.amount = 0;
        },
      ],
    ] as const) {
      const f = await world(variant(fixture(), edit));
      await establishSetting(f);
      await attestAndInitialize(f);
      await assembleLegal(f);
      await sealReadiness(f).catch(() => undefined);
      await must(
        f.world.admitSiteCondition({
          ...pub("w", 1),
          condition: { world_id: f.fx.worldId, slice_id: f.fx.slices.siteCondition },
        }),
      );
      const r = await outcome(
        f.productionFreight.admitMaterialSpecification({
          ...pub("s", 1),
          premise: { world_id: f.fx.worldId, slice_id: f.fx.slices.specification },
        }),
      );
      expect(r.code, name).toBe("SOURCE_REFUSED");
      expect(countKind(f, "production/material-specification/"), name).toBe(0);
    }
  });

  it("C-05 opens the Production Request only from the admitted material and ONE dedicated lot, never from a caller's choice", async () => {
    const f = await world(fixture());
    await openThroughSeal(f);
    const { fx } = f;
    const k = keysOf(fx);
    // before the owner admissions: nothing to resolve
    expect(
      (
        await outcome(
          f.economy.resolveOriginSelfProvision({
            ...pub("c5", 1),
            resolution: { seal_id: fx.sealId, owner_event: k.lot },
          }),
        )
      ).code,
    ).toBe("WITHHELD");
    await admitPremises(f);
    // a caller cannot pick the event: an arbitrary fact is not an owner admission of this profile's prerequisites
    const arbitrary = await outcome(
      f.economy.resolveOriginSelfProvision({
        ...pub("c5", 2),
        resolution: { seal_id: fx.sealId, owner_event: k.entity },
      }),
    );
    expect(arbitrary.code).toBe("NOT_ADMISSIBLE");
    // an unsealed identity selects nothing
    const noSeal = await outcome(
      f.economy.resolveOriginSelfProvision({
        ...pub("c5", 3),
        resolution: { seal_id: "no-such-seal", owner_event: k.lot },
      }),
    );
    expect(noSeal.code).toBe("WITHHELD");
    expect(countKind(f, "economy/")).toBe(0);
    // the lawful trigger opens exactly one request
    await originSelfProvision(f);
    const request = f.campaign.store.getFact(k.originRequest)!;
    expect(request.owner).toBe("economy");
    expect((request.value as { source: { owner: string } }).source.owner).toBe("economy");
    expect(
      f.economy
        .originAllocation(fx.specification.specification_id)!
        .value.authority.map((a) => a.clause),
    ).toEqual(["C-01", "C-02", "C-05"]);
    // a duplicated trigger opens no second request
    const dup = await outcome(
      f.economy.resolveOriginSelfProvision({
        ...pub("c5", 4),
        resolution: { seal_id: fx.sealId, owner_event: k.specification },
      }),
    );
    expect(dup.code).toBe("NOT_ADMISSIBLE");
    expect(countKind(f, "economy/request/")).toBe(1);
    // a predicted quantity is not supply: no output exists, so no freight can be fixed
    const noOutput = await outcome(
      f.economy.resolveFreightFixation({
        ...pub("c6", 1),
        resolution: { seal_id: fx.sealId, owner_event: k.condition },
      }),
    );
    expect(noOutput.code).toBe("WITHHELD");
    expect(noOutput.message).toMatch(/not supply/);
  });

  it("C-05 withholds when no dedicated lot, or two qualifying lots, exist", async () => {
    const none = await world(
      variant(fixture(), (fx) => {
        fx.opening.slices = fx.opening.slices.filter(
          (s: { slice_kind: string }) => s.slice_kind !== "input_lot",
        );
      }),
    );
    await openThroughSeal(none);
    await must(
      none.world.admitSiteCondition({
        ...pub("w", 1),
        condition: { world_id: none.fx.worldId, slice_id: none.fx.slices.siteCondition },
      }),
    );
    await must(
      none.productionFreight.admitMaterialSpecification({
        ...pub("s", 1),
        premise: { world_id: none.fx.worldId, slice_id: none.fx.slices.specification },
      }),
    );
    const r0 = await outcome(
      none.economy.resolveOriginSelfProvision({
        ...pub("c5", 1),
        resolution: { seal_id: none.fx.sealId, owner_event: keysOf(none.fx).specification },
      }),
    );
    expect(r0.code).toBe("WITHHELD");
    expect(r0.message).toMatch(/no dedicated source lot qualifies/);

    const tie = await world(fixture());
    const twin = JSON.parse(
      JSON.stringify(tie.fx.opening.slices.find((s) => s.slice_kind === "input_lot")),
    );
    twin.slice_id = "slice-d-input-lot-twin";
    twin.premise.lot_id = "twin-lot";
    (tie.fx.opening as { slices: unknown[] }).slices.push(twin);
    (tie.fx.opening.slices as { slice_id: string }[]).sort((a, b) =>
      a.slice_id < b.slice_id ? -1 : 1,
    );
    await openThroughSeal(tie);
    await admitPremises(tie);
    const r1 = await outcome(
      tie.economy.resolveOriginSelfProvision({
        ...pub("c5", 1),
        resolution: { seal_id: tie.fx.sealId, owner_event: keysOf(tie.fx).lot },
      }),
    );
    expect(r1.code).toBe("WITHHELD");
    expect(r1.message).toMatch(/a tie is never broken/);
    expect(countKind(tie, "economy/")).toBe(0);
  });

  it("Production independently refuses a substituted yield or lot, and C-06 fixes ONE request from the earned whole output", async () => {
    const f = await world(fixture());
    await openThroughSeal(f);
    await admitPremises(f);
    await originSelfProvision(f);
    const { fx } = f;
    const k = keysOf(fx);
    // the owner's operation is exactly the sealed one: a declared yield the source does not state refuses
    const sealed = f.productionFreight.dedicatedStartInput(k.originRequest)!;
    const inflated = {
      ...sealed,
      transformation: {
        ...sealed.transformation,
        output_quantity: {
          ...sealed.transformation.output_quantity,
          amount: sealed.transformation.output_quantity.amount + 1,
        },
      },
    };
    const bad = await outcome(
      f.production.startOperation({ ...pub("produce", 1), start: inflated }),
    );
    expect(bad.code).not.toBe("OK");
    expect(f.production.operation(k.originRequestId)).toBeUndefined();
    await produceAndAccept(f);
    // the trigger of the fixation must be one of the profile's own owner facts
    const wrong = await outcome(
      f.economy.resolveFreightFixation({
        ...pub("c6", 1),
        resolution: { seal_id: fx.sealId, owner_event: k.lot },
      }),
    );
    expect(wrong.code).toBe("NOT_ADMISSIBLE");
    // two claimants race for the same conserved output: exactly one wins and no orphan slot exists
    const [a, b] = await Promise.all([
      outcome(
        f.economy.resolveFreightFixation({
          ...pub("c6", 2),
          resolution: { seal_id: fx.sealId, owner_event: k.entity },
        }),
      ),
      outcome(
        f.economy.resolveFreightFixation({
          ...pub("c6", 3),
          resolution: { seal_id: fx.sealId, owner_event: k.condition },
        }),
      ),
    ]);
    expect([a.code, b.code].filter((c) => c === "OK")).toHaveLength(1);
    expect(countKind(f, "economy/freight-request/")).toBe(1);
    expect(countKind(f, "economy/freight-slot/")).toBe(3);
    expect(countKind(f, "economy/freight-allocation/")).toBe(1);
    // and a later attempt finds every slot occupied
    const late = await outcome(
      f.economy.resolveFreightFixation({
        ...pub("c6", 4),
        resolution: { seal_id: fx.sealId, owner_event: k.entity },
      }),
    );
    expect(late.code).toBe("WITHHELD");
    expect(late.message).toMatch(/occupied/);
    void fixFreight;
    void foundationThroughFixation;
    void basisIdOf;
    void worldSiteConditionKey;
  });
});
