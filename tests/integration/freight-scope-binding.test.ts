/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and inspect arbitrary owner values */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gipReadinessSealKey, gipScopeBindingKey, type OwnerFact } from "@immortalis/contracts";
import {
  freightPublication as pub,
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  FREIGHT_GIP_RULE,
  deriveDestinationAdequacy,
  deriveFreightCommitment,
  deriveFreightDispatch,
  deriveFreightFixation,
  deriveOriginSelfProvision,
  deriveReadinessSeal,
  evaluateClauses,
  groupOfPlan,
  openFileCampaign,
  storeSource,
  type FreightSource,
} from "@immortalis/engine";
import {
  admitPremises,
  admitService,
  admitServiceBasis,
  advanceTo,
  assembleLegal,
  attestAndInitialize,
  basisIdOf,
  createFreightCampaign,
  deliveryBoundary,
  dispatchFirst,
  consumeUse,
  enrollTransfer,
  establishSetting,
  fixFreight,
  keysOf,
  openThroughSeal,
  originSelfProvision,
  outcome,
  produceAndAccept,
  variant,
  type Freight,
} from "../support/freight.ts";
import { must } from "../support/temporal.ts";

let dir: string;
let open: Freight[] = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-scope-"));
  open = [];
});
afterEach(async () => {
  for (const f of open) await f.campaign.close().catch(() => undefined);
  await rm(dir, { recursive: true, force: true });
});
let seq = 0;
async function world(fx: FreightWorldFixture): Promise<Freight> {
  const f = await createFreightCampaign(join(dir, `w${seq++}`), fx);
  open.push(f);
  return f;
}

/** A world whose COMMITTED Scope Binding and/or whose source's QUALIFICATION of it is edited, everything else lawful. */
const edited = (
  base: () => FreightWorldFixture,
  edit: (fx: { scopeBinding: any; legal: any }) => void,
): FreightWorldFixture => variant(base(), edit as never);

const sealIn = async (f: Freight) =>
  outcome(f.gipFreight.sealReadiness({ ...pub("legal", 7), assembly: { world_id: f.fx.worldId } }));

/** Assemble the legal source and try to seal: the refusal's GIP answer and reason, and proof that nothing downstream followed. */
async function sealRefusal(fx: FreightWorldFixture, beforeSeal?: (f: Freight) => Promise<void>) {
  const f = await world(fx);
  await establishSetting(f);
  await attestAndInitialize(f);
  if (beforeSeal) await beforeSeal(f);
  await assembleLegal(f);
  const r = await sealIn(f);
  // no seal exists, and so no economic, production or logistics act can rely on one
  expect(f.campaign.store.getFact(gipReadinessSealKey(fx.sealId))).toBeUndefined();
  const downstream = await outcome(
    f.economy.resolveOriginSelfProvision({
      ...pub("origin", 1),
      resolution: { seal_id: fx.sealId, owner_event: keysOf(fx).lot },
    }),
  );
  expect(downstream.code).not.toBe("OK");
  const authored = f.campaign.store
    .listFacts()
    .filter((x) => ["economy", "production", "logistics"].includes(x.owner));
  expect(authored).toEqual([]);
  return r;
}
const reasonOf = (r: { details?: unknown }) =>
  r.details as { reason?: string; applicability?: string };

describe("G-1 — the Scope Binding must bound THIS transaction: seal-time falsifiers (everything else valid)", () => {
  for (const [name, base] of [
    ["Quarry Works", quarryWorksFixture],
    ["Textile Workshop", textileWorkshopFixture],
  ] as const) {
    it(`${name}: a binding scoped to ANOTHER EXISTING WORLD is does_not_apply and nothing is sealed`, async () => {
      const fx = edited(base, (x) => (x.scopeBinding.scope_ref = "elsewhere-vale"));
      const r = await sealRefusal(fx, async (f) => {
        await must(
          f.campaign.establishWorld({
            ...pub("other", 1),
            world: { ...f.fx.world, world_id: "elsewhere-vale" },
          }),
        );
      });
      expect(r.code).toBe("WITHHELD");
      expect(reasonOf(r)).toMatchObject({
        applicability: "does_not_apply",
        reason: "SCOPE_BINDING_OF_ANOTHER_WORLD",
      });
    });

    it(`${name}: a binding scoped to an UNRESOLVABLE reference is unresolved, never applies`, async () => {
      const fx = edited(base, (x) => (x.scopeBinding.scope_ref = "the-old-borderlands"));
      const r = await sealRefusal(fx);
      expect(reasonOf(r)).toMatchObject({
        applicability: "unresolved",
        reason: "SCOPE_REF_UNQUALIFIED",
      });
    });
  }

  it("a binding whose authored target condition is not the one the source qualified is unresolved", async () => {
    const fx = edited(
      quarryWorksFixture,
      (x) => (x.scopeBinding.target_condition += " (and more)"),
    );
    expect(reasonOf(await sealRefusal(fx))).toMatchObject({
      applicability: "unresolved",
      reason: "SCOPE_TARGET_CONDITION_UNQUALIFIED",
    });
  });

  it("a qualified target that EXCLUDES the proposed origin, destination, material or purpose is does_not_apply", async () => {
    for (const edit of [
      (x: any) => (x.legal.scope_qualification.target.origin_locus_id = "somewhere-else"),
      (x: any) => (x.legal.scope_qualification.target.destination_locus_id = "somewhere-else"),
      (x: any) => (x.legal.scope_qualification.target.material_class = "another-material"),
      (x: any) => (x.legal.scope_qualification.target.purpose = "another-purpose"),
    ]) {
      const r = await sealRefusal(edited(quarryWorksFixture, edit));
      expect(reasonOf(r)).toMatchObject({
        applicability: "does_not_apply",
        reason: "SCOPE_TARGET_EXCLUDES_TRANSACTION",
      });
    }
  });

  it("a scope reference that is not the jurisdiction world is not resolved by this profile", async () => {
    const fx = edited(textileWorkshopFixture, (x) => {
      x.scopeBinding.scope_ref = x.legal.jurisdiction.origin_locus_id;
      x.legal.scope_qualification.scope_ref = x.legal.jurisdiction.origin_locus_id;
    });
    expect(reasonOf(await sealRefusal(fx))).toMatchObject({
      applicability: "unresolved",
      reason: "SCOPE_REF_NOT_THE_JURISDICTION_WORLD",
    });
  });

  it("an authored exception or conflict rule the source did not qualify is unresolved", async () => {
    const e = edited(quarryWorksFixture, (x) => (x.scopeBinding.exception_refs = ["war-levy"]));
    expect(reasonOf(await sealRefusal(e))).toMatchObject({
      applicability: "unresolved",
      reason: "SCOPE_EXCEPTIONS_UNQUALIFIED",
    });
    const c = edited(
      quarryWorksFixture,
      (x) => (x.scopeBinding.priority_or_conflict_rule_ref = "lex-posterior"),
    );
    expect(reasonOf(await sealRefusal(c))).toMatchObject({
      applicability: "unresolved",
      reason: "SCOPE_CONFLICT_RULE_UNQUALIFIED",
    });
  });

  it("an exception that REACHES the transaction is does_not_apply; one that provably does not is lawful only if the order's coverage evidences it", async () => {
    const qualify = (reaches: boolean, coverage: "evidenced" | "established_inapplicable") =>
      edited(quarryWorksFixture, (x) => {
        x.scopeBinding.exception_refs = ["war-levy"];
        x.legal.scope_qualification.exception_refs = ["war-levy"];
        x.legal.scope_qualification.exception_determinations = [
          { ref: "war-levy", reaches_transaction: reaches },
        ];
        x.legal.coverage.find((c: any) => c.item === "exceptions").disposition = coverage;
      });
    expect(reasonOf(await sealRefusal(qualify(true, "evidenced")))).toMatchObject({
      applicability: "does_not_apply",
      reason: "SCOPE_EXCEPTION_REACHES_TRANSACTION",
    });
    expect(reasonOf(await sealRefusal(qualify(false, "established_inapplicable")))).toMatchObject({
      applicability: "unresolved",
      reason: "SCOPE_EXCEPTIONS_NOT_EVIDENCED_BY_COVERAGE",
    });
    // positive control: an authored exception that provably does not reach, evidenced by the order's coverage, seals
    const f = await world(qualify(false, "evidenced"));
    await openThroughSeal(f);
    expect(f.campaign.store.getFact(gipReadinessSealKey(f.fx.sealId))).toBeDefined();
  });

  it("a conflict rule that DISPLACES the clauses is contested; a non-displacing one is lawful only if the coverage evidences priority", async () => {
    const qualify = (displaces: boolean, coverage: "evidenced" | "established_inapplicable") =>
      edited(textileWorkshopFixture, (x) => {
        x.scopeBinding.priority_or_conflict_rule_ref = "lex-posterior";
        x.legal.scope_qualification.priority_or_conflict_rule_ref = "lex-posterior";
        x.legal.scope_qualification.conflict_determination = { displaces_clauses: displaces };
        x.legal.coverage.find((c: any) => c.item === "priority_precedence").disposition = coverage;
      });
    expect(reasonOf(await sealRefusal(qualify(true, "evidenced")))).toMatchObject({
      applicability: "contested",
      reason: "SCOPE_CONFLICT_RULE_DISPLACES",
    });
    expect(reasonOf(await sealRefusal(qualify(false, "established_inapplicable")))).toMatchObject({
      applicability: "unresolved",
      reason: "SCOPE_CONFLICT_RULE_NOT_EVIDENCED_BY_COVERAGE",
    });
    const f = await world(qualify(false, "evidenced"));
    await openThroughSeal(f);
    expect(f.campaign.store.getFact(gipReadinessSealKey(f.fx.sealId))).toBeDefined();
  });

  it("an unresolved publication or notice requirement refuses readiness (the order's coverage disposes of it)", async () => {
    const fx = edited(quarryWorksFixture, (x) => {
      x.legal.coverage.find((c: any) => c.item === "publication_or_notice").disposition =
        "unresolved";
    });
    const r = await sealRefusal(fx);
    expect(r.code).toBe("WITHHELD");
    expect(r.details).toMatchObject({ applicability: "unresolved", item: "publication_or_notice" });
  });
});

describe("G-1 — read time: every material applicability read re-qualifies the binding, so no downstream act follows", () => {
  /** the source as the act sees it, with the sealed Scope Binding changed at the SAME version (the head is untouched on purpose) */
  const withBinding = (f: Freight, change: (v: any) => void): FreightSource => {
    const real = storeSource(f.campaign.store);
    const key = f.fx.instrument.scope_binding_ref;
    return {
      ...real,
      getFact: (k: string) => {
        const x = real.getFact(k);
        if (!x || k !== key) return x;
        const copy = structuredClone(x) as OwnerFact;
        change(copy.value);
        return copy;
      },
    };
  };
  const defects: readonly [string, (v: any) => void, RegExp][] = [
    [
      "another world",
      (v) => (v.scope_ref = "elsewhere-vale"),
      /SCOPE_(BINDING_OF_ANOTHER_WORLD|REF_UNQUALIFIED)/,
    ],
    [
      "different target text",
      (v) => (v.target_condition = "anything at all"),
      /SCOPE_TARGET_CONDITION_UNQUALIFIED/,
    ],
    ["an unqualified exception", (v) => (v.exception_refs = ["x"]), /SCOPE_EXCEPTIONS_UNQUALIFIED/],
    [
      "an unqualified conflict rule",
      (v) => (v.priority_or_conflict_rule_ref = "y"),
      /SCOPE_CONFLICT_RULE_UNQUALIFIED/,
    ],
  ];

  /** each act: its lawful derivation succeeds on the true cut, and is withheld on the same cut with a defective binding */
  const acts: readonly [
    string,
    (f: Freight) => Promise<string | undefined>,
    (src: FreightSource, f: Freight, ref: string | undefined) => { ok: boolean },
  ][] = [
    [
      "C-05 origin self-provision",
      async (f) => {
        await openThroughSeal(f);
        await admitPremises(f);
        return undefined;
      },
      (src, f) => deriveOriginSelfProvision(src, f.fx.sealId, keysOf(f.fx).lot),
    ],
    [
      "E0 / C-06 fixation",
      async (f) => {
        await openThroughSeal(f);
        await admitPremises(f);
        await originSelfProvision(f);
        await produceAndAccept(f);
        return undefined;
      },
      (src, f) => deriveFreightFixation(src, f.fx.sealId, keysOf(f.fx).entity),
    ],
    [
      "L0 service admission",
      async (f) => {
        await openThroughSeal(f);
        await admitPremises(f);
        await originSelfProvision(f);
        await produceAndAccept(f);
        const ref = await fixFreight(f);
        await admitServiceBasis(f);
        return ref;
      },
      (src, f, ref) => deriveFreightCommitment(src, ref!, basisIdOf(f)),
    ],
    [
      "L1 first dispatch",
      async (f) => {
        await openThroughSeal(f);
        await admitPremises(f);
        await originSelfProvision(f);
        await produceAndAccept(f);
        const ref = await fixFreight(f);
        await admitServiceBasis(f);
        await admitService(f, ref);
        return ref;
      },
      (src, _f, ref) => deriveFreightDispatch(src, ref!),
    ],
    [
      "AD destination adequacy",
      async (f) => {
        await openThroughSeal(f);
        await admitPremises(f);
        await originSelfProvision(f);
        await produceAndAccept(f);
        const ref = await fixFreight(f);
        await admitServiceBasis(f);
        await admitService(f, ref);
        await dispatchFirst(f, ref);
        await consumeUse(f, ref);
        await enrollTransfer(f);
        await must(advanceTo(f, "tx-deliver", deliveryBoundary(f)));
        return ref;
      },
      (src, _f, ref) => deriveDestinationAdequacy(src, ref!),
    ],
  ];

  for (const [name, reach, derive] of acts)
    it(`${name}: lawful on the true cut; withheld under every binding defect`, async () => {
      const f = await world(quarryWorksFixture());
      const ref = await reach(f);
      expect(
        derive(storeSource(f.campaign.store), f, ref).ok,
        "control: the true cut derives",
      ).toBe(true);
      for (const [label, change, reason] of defects) {
        const planned = derive(withBinding(f, change), f, ref) as {
          ok: boolean;
          error?: { code: string; details?: unknown; message: string };
        };
        expect(planned.ok, `${name} under ${label}`).toBe(false);
        expect(JSON.stringify(planned.error), `${name} under ${label}`).toMatch(reason);
      }
    });

  it("GIP's own answer is never `applies` for any clause while the binding is defective", async () => {
    const f = await world(textileWorkshopFixture());
    await openThroughSeal(f);
    const queries = ["C-01", "C-02", "C-03", "C-04", "C-05", "C-06", "C-07"].map((clause) => ({
      clause: clause as never,
      subject: {},
    }));
    const lawful = evaluateClauses(storeSource(f.campaign.store), f.fx.sealId, queries);
    expect(lawful.answers.every((a) => a.applicability === "applies")).toBe(true);
    expect(lawful.reads).toContain(f.fx.instrument.scope_binding_ref);
    for (const [label, change] of defects) {
      const r = evaluateClauses(withBinding(f, change), f.fx.sealId, queries);
      expect(
        r.answers.every((a) => a.applicability !== "applies"),
        label,
      ).toBe(true);
    }
  });
});

describe("G-1 — raw commit and replay: a seal over an unqualified binding is refused live and rejected on reopen", () => {
  it("the owner's re-derivation refuses the forged seal; a permissive store accepts it and strict replay rejects the campaign", async () => {
    const fx = edited(
      quarryWorksFixture,
      (x) => (x.scopeBinding.scope_ref = "the-old-borderlands"),
    );
    const f = await world(fx);
    await establishSetting(f);
    await attestAndInitialize(f);
    await assembleLegal(f);
    // the seal a LAWFUL binding would have produced (derived over a cut where the binding is the qualified one)
    const lawful = quarryWorksFixture();
    const real = storeSource(f.campaign.store);
    const key = gipScopeBindingKey(
      lawful.institution.institution_id,
      lawful.office.office_id,
      lawful.scopeBinding.scope_binding_id,
    );
    const asIfQualified: FreightSource = {
      ...real,
      getFact: (k) => {
        const x = real.getFact(k);
        if (!x || k !== key) return x;
        const copy = structuredClone(x) as OwnerFact;
        copy.value = structuredClone(lawful.scopeBinding) as unknown as OwnerFact["value"];
        return copy;
      },
    };
    const plan = deriveReadinessSeal(asIfQualified, fx.worldId);
    expect(plan.ok, "the forged seal is derivable over the pretended cut").toBe(true);
    if (!plan.ok) return;
    const group = groupOfPlan(
      f.campaign.store,
      pub("forged-seal", 1),
      "gip",
      "gip_institution_identity",
      FREIGHT_GIP_RULE,
      plan.value,
    );
    const live = await outcome(f.campaign.store.commit(group));
    expect(live.code, "live admission re-derives over the real binding").not.toBe("OK");
    expect(`${live.code} ${live.message}`).toMatch(/Scope Binding|WITHHELD|VALUE_INVALID|bound/i);
    expect(f.campaign.store.getFact(gipReadinessSealKey(fx.sealId))).toBeUndefined();

    // a store without owner admission lets it in; only replay can catch it
    await f.campaign.close();
    const permissive = await openFileCampaign(f.dir, {
      owners: CANONICAL_OWNER_REGISTRY,
      admission: { check: () => null },
    });
    if (!permissive.ok) throw new Error(JSON.stringify(permissive.error));
    expect((await permissive.value.commit(group)).ok).toBe(true);
    await permissive.value.close();
    const reopened = await CanonicalCampaign.open(f.dir, { buildId: "scope-replay-check" });
    expect(reopened.ok).toBe(false);
    if (!reopened.ok)
      expect(JSON.stringify(reopened.error)).toMatch(
        /historical verification|not a valid transition|REPLAY_MISMATCH/,
      );
  });
});
