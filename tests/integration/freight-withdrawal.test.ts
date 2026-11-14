import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  economyFreightAllocationKey,
  economyFreightCloseKey,
  logisticsCommitmentKey,
  logisticsTransferKey,
  logisticsUnusedReleaseKey,
} from "@immortalis/contracts";
import {
  freightPublication as pub,
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import {
  ALL_FACT_KINDS,
  FREIGHT_ECONOMY_RULE,
  FREIGHT_FACT_KIND_IDS,
  FREIGHT_LOGISTICS_RULE,
  deriveFreightDispatch,
  groupOfPlan,
  sha256Canonical,
  storeSource,
} from "@immortalis/engine";
import {
  admitService,
  admitServiceBasis,
  advanceTo,
  basisIdOf,
  consumeUse,
  countOwner,
  createFreightCampaign,
  deliveryBoundary,
  dispatchFirst,
  enrollTransfer,
  foundationThroughFixation,
  keysOf,
  outcome,
  type Freight,
} from "../support/freight.ts";
import { must } from "../support/temporal.ts";

let dir: string;
let open: Freight[] = [];
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "imm-freight-withdrawal-"));
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

/** World-State owner-admits a PROSPECTIVE physical change of the objective condition. */
async function changeCondition(f: Freight, outcomeOf: "STANDING" | "CEASED", n: number) {
  await must(
    f.world.admitSiteConditionChange({
      ...pub("change", n),
      change: {
        world_id: f.fx.worldId,
        condition_id: f.fx.siteCondition.condition_id,
        change_id: `change-${n}`,
        statement:
          outcomeOf === "CEASED"
            ? "SYNTHETIC FIXTURE: the damaged section was pulled down and the breach walled off for good."
            : "SYNTHETIC FIXTURE: the masons re-surveyed the breach; the same pieces remain damaged.",
        outcome: outcomeOf,
        authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
      },
    }),
  );
}
const req = (ref: string) => ({ request: { request_ref: ref } });
const slotStates = (f: Freight, ref: string) => {
  const s = f.economy.slots(ref)!;
  return [s.directive_use, s.cargo, s.requirement].map((x) => ({
    status: x!.value.state.status,
    version: x!.fact.version,
  }));
};

describe("PO-4 — Foundation exit: a genuinely sourced W2/W3 cancels under no L0, with F4 at the close's own cut", () => {
  it("W2: any authoritative GIP write after the seal permanently disables the profile; the request is protected, then closed once", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    // (Logistics' own service basis is an independent admission and may exist; the F exit itself writes nothing of Logistics')
    await admitServiceBasis(f);
    const before = countOwner(f, "logistics");
    // a separate campaign act in the same world's GIP owner: another institution is established (unrelated play proceeds)
    await must(
      f.gip.establishInstitution({
        ...pub("other", 1),
        institution: {
          institution_id: "rival-works",
          identity_label: "A rival works",
          continuity_status: "continuing",
        },
      }),
    );
    // GIP's own derived answer is now unresolved for every clause, and Economy stores no eligibility
    const answers = f.gipFreight.applicability(f.fx.sealId, [
      { clause: "C-04", subject: {} },
    ]).answers;
    expect(answers[0]).toMatchObject({
      applicability: "unresolved",
      reason: "GIP_OWNER_HEAD_CHANGED",
    });
    await must(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref) }));
    const w = f.economy.withdrawal(ref)!.value;
    expect(w.cause).toMatchObject({
      kind: "W2",
      applicability: "unresolved",
      gip_reason: "GIP_OWNER_HEAD_CHANGED",
    });
    expect(w.effect).toBe("PROTECTION_ONLY_RELEASES_NOTHING_CLOSES_NOTHING");
    // protection only: the three slots are still claimed; nothing released
    expect(slotStates(f, ref).every((s) => s.status === "claimed" && s.version === 1)).toBe(true);
    // the cargo is protected: no second request can be fixed, and Logistics is refused
    expect(
      (
        await outcome(
          f.economy.resolveFreightFixation({
            ...pub("c6", 9),
            resolution: { seal_id: f.fx.sealId, owner_event: keysOf(f.fx).entity },
          }),
        )
      ).code,
    ).toBe("WITHHELD");
    const l0 = await outcome(
      f.logistics.admitService({
        ...pub("l0", 1),
        admission: { request_ref: ref, basis_id: basisIdOf(f) },
      }),
    );
    expect(l0.code).toBe("NOT_ADMISSIBLE");
    expect(l0.details).toMatchObject({ act_level_non_commit: true, f1: false });
    // the one terminal close, with F4 at its own cut
    await must(f.economy.closeWithdrawnRequest({ ...pub("c", 1), ...req(ref) }));
    expect(slotStates(f, ref).every((s) => s.status === "released" && s.version === 2)).toBe(true);
    expect(f.economy.allocation(ref)!.value.state.status).toBe("terminal");
    expect(f.economy.close(ref)!.value.no_dispatch_basis.kind).toBe(
      "NO_SERVICE_FENCED_AT_THIS_CUT",
    );
    expect(f.economy.holding(f.fx.worldId, keysOf(f.fx).entityId)!.value.status).toBe("available");
    // a second close or a second protective admission is refused; the later verifier refuses the terminal request
    expect(
      (await outcome(f.economy.closeWithdrawnRequest({ ...pub("c", 2), ...req(ref) }))).code,
    ).toBe("NOT_ADMISSIBLE");
    expect((await outcome(f.economy.admitWithdrawal({ ...pub("w", 2), ...req(ref) }))).code).toBe(
      "NOT_ADMISSIBLE",
    );
    expect(f.logistics.verifyRequest(ref).verdict).toBe("REFUSED");
    // E2 is also disabled for this first profile: the GIP head differs from the seal permanently
    expect(
      (
        await outcome(
          f.economy.resolveFreightFixation({
            ...pub("c6", 10),
            resolution: { seal_id: f.fx.sealId, owner_event: f.economy.close(ref)!.fact.key },
          }),
        )
      ).code,
    ).toBe("WITHHELD");
    // the F exit wrote no Logistics fact
    expect(countOwner(f, "logistics")).toBe(before);
  });

  it("a protected World-State governing-premise change (P-3) disables the profile; physical writes of the profile itself never do", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    // R-1 witness: condition, specification, lot, production, acceptance and the freight fixation all happened AFTER the seal
    const heads = (await import("@immortalis/engine")).protectedHeadChange(
      storeSource(f.campaign.store),
      f.gipFreight.readinessSeal(f.fx.sealId)!.seal.world_state_protected_heads,
    );
    expect(heads).toBeNull();
    expect(
      f.gipFreight.applicability(f.fx.sealId, [{ clause: "C-04", subject: {} }]).answers[0]!
        .applicability,
    ).toBe("applies");
    // an owner-admitted jurisdiction premise of class P-3 advances ONLY its own class head and ends prospective use
    await must(
      f.world.admitGoverningPremise({
        ...pub("p3", 1),
        premise: {
          world_id: f.fx.worldId,
          premise_id: "south-store-annexed",
          protected_class: "P-3",
          action: "new",
          subject: "the South Store's jurisdiction",
          statement:
            "SYNTHETIC FIXTURE: the town annexes the quay lane, changing whose ground the South Store stands on.",
          authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
        },
      }),
    );
    expect(f.world.governingPremiseHead(f.fx.worldId, "P-3")!.value.count).toBe(1);
    expect(f.world.governingPremiseHead(f.fx.worldId, "P-4")).toBeUndefined();
    expect(
      f.gipFreight.applicability(f.fx.sealId, [{ clause: "C-04", subject: {} }]).answers[0],
    ).toMatchObject({
      applicability: "unresolved",
      reason: "PROTECTED_HEAD_CHANGED_P-3",
    });
    await must(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref) }));
    expect(f.economy.withdrawal(ref)!.value.cause).toMatchObject({ kind: "W2" });
    // an unclassified governing premise is refused at the owner (no P-5); a raw write of a premise without its head is refused
    const bad = await outcome(
      f.world.admitGoverningPremise({
        ...pub("p5", 1),
        premise: {
          world_id: f.fx.worldId,
          premise_id: "x",
          protected_class: "P-5",
          action: "new",
          subject: "s",
          statement: "t",
          authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
        },
      }),
    );
    expect(bad.code).toBe("INPUT_INVALID");
  });

  it("W3 with no Logistics service: an owner-admitted cessation closes once; caller narration and an unknown response withdraw nothing", async () => {
    for (const fixture of [quarryWorksFixture, textileWorkshopFixture]) {
      const f = await world(fixture());
      const ref = await foundationThroughFixation(f);
      expect((await outcome(f.economy.admitWithdrawal({ ...pub("w", 0), ...req(ref) }))).code).toBe(
        "NOT_ADMISSIBLE",
      );
      // closing without protection first is refused
      expect(
        (await outcome(f.economy.closeWithdrawnRequest({ ...pub("c", 0), ...req(ref) }))).code,
      ).toBe("NOT_ADMISSIBLE");
      await changeCondition(f, "CEASED", 1);
      await must(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref) }));
      expect(f.economy.withdrawal(ref)!.value.cause).toMatchObject({
        kind: "W3",
        dependency: "site_condition",
      });
      await must(f.economy.closeWithdrawnRequest({ ...pub("c", 1), ...req(ref) }));
      expect(slotStates(f, ref).every((s) => s.status === "released")).toBe(true);
      expect(f.logistics.verifyRequest(ref).verdict).toBe("REFUSED");
      expect(countOwner(f, "logistics")).toBe(0);
    }
  });

  it("the F-only verifier is read-only: it creates no service and no fact, and refuses a request once protected", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    const revision = f.campaign.store.head().revision;
    const v = f.logistics.verifyRequest(ref);
    expect(v.verdict).toBe("VERIFIED_LIVE_REQUEST_NO_SERVICE");
    if (v.verdict === "VERIFIED_LIVE_REQUEST_NO_SERVICE")
      expect(v.logistics_keys).toEqual([
        { fact_key: logisticsCommitmentKey(f.fx.worldId, keysOf(f.fx).entityId), version: 0 },
        { fact_key: logisticsTransferKey(f.fx.worldId, keysOf(f.fx).entityId), version: 0 },
      ]);
    expect(f.campaign.store.head().revision).toBe(revision);
    expect(f.logistics.verifyRequest("freight:not-a-request:1").verdict).toBe("REFUSED");
    await changeCondition(f, "CEASED", 1);
    expect(f.logistics.verifyRequest(ref).verdict).toBe("REFUSED"); // the requirement no longer stands
  });
});

describe("PO-4/PO-5 — withdrawal with an existing L0: F2 is Logistics' own unused release, never a post-delivery release", () => {
  it("W3 → protection only → F2 (immutable event, Transfer Record guarded absent) → Economy's close consumes the registered F2", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    const k = keysOf(f.fx);
    const commitmentKey = logisticsCommitmentKey(f.fx.worldId, k.entityId);
    expect(f.campaign.store.getFact(commitmentKey)!.version).toBe(1);
    await changeCondition(f, "STANDING", 1);
    await must(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref) }));
    const guard = f.economy.withdrawal(ref)!.value.logistics_guard;
    expect(guard).toMatchObject({
      branch: "SERVICE_COMMITTED_NOT_DISPATCHED",
      commitment: { status: "COMMITTED", version: 1 },
    });
    // W alone releases nothing and needs no no-dispatch proof; the commitment still stands
    expect(slotStates(f, ref).every((s) => s.status === "claimed")).toBe(true);
    // C before Logistics' unused release is refused: a service is committed
    const early = await outcome(f.economy.closeWithdrawnRequest({ ...pub("c", 1), ...req(ref) }));
    expect(early.code).toBe("NOT_ADMISSIBLE");
    expect(early.message).toMatch(/unused release precedes/);
    // L1 is an act-level non-commit now (and not F1)
    const l1 = await outcome(f.logistics.dispatchFirst({ ...pub("l1", 1), ...req(ref) }));
    expect(l1.code).toBe("NOT_ADMISSIBLE");
    expect(l1.details).toMatchObject({ act_level_non_commit: true, f1: false });
    // F2: Logistics' owner-committed unused release
    await must(f.logistics.releaseUnusedService({ ...pub("f2", 1), ...req(ref) }));
    const released = f.campaign.store.getFact(commitmentKey)!;
    expect(released.version).toBe(2);
    expect((released.value as { state: { status: string } }).state.status).toBe("RELEASED_UNUSED");
    const event = f.logistics.unusedRelease(ref)!;
    expect(event.value).toMatchObject({
      outcome: "F2",
      no_dispatch: "TRANSFER_RECORD_GUARDED_ABSENT_IN_THIS_COMMIT",
    });
    expect(f.logistics.serviceSlot(basisIdOf(f))!.value.state.status).toBe("FREE");
    // the release event, the commitment and the freed slot were ONE commit, and the Transfer Record key was pinned at zero
    expect(released.provenance.group_id).toBe(event.fact.provenance.group_id);
    const releaseGroup = f.campaign.store.committedGroup(event.fact.provenance.intent_id)!;
    expect(
      releaseGroup.reads.find((r) => r.key === logisticsTransferKey(f.fx.worldId, k.entityId)),
    ).toEqual({ key: logisticsTransferKey(f.fx.worldId, k.entityId), version: 0 });
    // F2 twice is refused; so is any later dispatch
    expect(
      (await outcome(f.logistics.releaseUnusedService({ ...pub("f2", 2), ...req(ref) }))).code,
    ).toBe("NOT_ADMISSIBLE");
    // Economy's C guards the RELEASED key at its exact observed version/status and registers the typed external F2 outcome
    await must(f.economy.closeWithdrawnRequest({ ...pub("c", 2), ...req(ref) }));
    const close = f.economy.close(ref)!.value;
    expect(close.no_dispatch_basis).toMatchObject({
      kind: "UNUSED_RELEASE_REGISTERED",
      registration: {
        outcome: "F2",
        event: {
          fact_key: logisticsUnusedReleaseKey(ref),
          content_sha256: sha256Canonical(event.value),
        },
        commitment: { version: 2, status: "RELEASED_UNUSED" },
      },
    });
    expect(slotStates(f, ref).every((s) => s.status === "released" && s.version === 2)).toBe(true);
    const closeGroup = f.campaign.store.committedGroup(
      f.economy.close(ref)!.fact.provenance.intent_id,
    )!;
    expect(closeGroup.reads.find((r) => r.key === commitmentKey)).toEqual({
      key: commitmentKey,
      version: 2,
    });
    expect(economyFreightCloseKey(ref)).toBe(f.economy.close(ref)!.fact.key);
  });

  it("F2 is Logistics' act only after Economy's protective admission, and never for a dispatched service", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    // Logistics does not release on its own motion
    const alone = await outcome(f.logistics.releaseUnusedService({ ...pub("f2", 0), ...req(ref) }));
    expect(alone.code).toBe("NOT_ADMISSIBLE");
    expect(alone.message).toMatch(/follows Economy's protective withdrawal-pending/);
    // a committed first dispatch defeats unused withdrawal, release and close: the original transit continues
    await dispatchFirst(f, ref);
    await changeCondition(f, "CEASED", 1);
    const w = await outcome(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref) }));
    expect(w.code).toBe("NOT_ADMISSIBLE");
    expect(w.message).toMatch(/first dispatch is committed/);
    expect(
      (await outcome(f.logistics.releaseUnusedService({ ...pub("f2", 1), ...req(ref) }))).message,
    ).toMatch(/first dispatch is committed/);
    expect(
      (await outcome(f.economy.closeWithdrawnRequest({ ...pub("c", 1), ...req(ref) }))).code,
    ).toBe("NOT_ADMISSIBLE");
    // the transit remains protected and proceeds through E1, enrollment and the earned boundary
    await consumeUse(f, ref);
    await enrollTransfer(f);
    await must(advanceTo(f, "tx-deliver", deliveryBoundary(f)));
    expect(f.economy.allocation(ref)!.value.state.status).toBe("received");
  });

  it("a stale first dispatch derived before the trigger is defeated at commit; a dispatch that wins first defeats the withdrawal", async () => {
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    await admitServiceBasis(f);
    await admitService(f, ref);
    // hold a real L1 group derived NOW, from the real derivation
    const plan = deriveFreightDispatch(storeSource(f.campaign.store), ref);
    if (!plan.ok) throw new Error("setup");
    const held = groupOfPlan(
      f.campaign.store,
      pub("l1-held", 1),
      "logistics",
      "logistics_state",
      FREIGHT_LOGISTICS_RULE,
      plan.value,
    );
    // a concurrent owner admission invalidates what the dispatch relied on
    await changeCondition(f, "STANDING", 1);
    const stale = await outcome(f.campaign.store.commit(held));
    expect(stale.code).toBe("STALE_READ");
    expect(
      f.campaign.store.getFact(logisticsTransferKey(f.fx.worldId, keysOf(f.fx).entityId)),
    ).toBeUndefined();
    // protection then wins and the request is withdrawn without a dispatch
    await must(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref) }));
    await must(f.logistics.releaseUnusedService({ ...pub("f2", 1), ...req(ref) }));
    await must(f.economy.closeWithdrawnRequest({ ...pub("c", 1), ...req(ref) }));
    expect(f.economy.allocation(ref)!.value.state.status).toBe("terminal");
  });

  it("two concurrent protective admissions: exactly one wins, create-once", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    await changeCondition(f, "STANDING", 1);
    const [a, b] = await Promise.all([
      outcome(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref) })),
      outcome(f.economy.admitWithdrawal({ ...pub("w", 2), ...req(ref) })),
    ]);
    expect([a.code, b.code].filter((c) => c === "OK")).toHaveLength(1);
    expect(f.economy.allocation(ref)!.fact.version).toBe(2);
    expect(economyFreightAllocationKey(ref)).toBeTruthy();
  });
});

describe("E2 — a later, genuinely new request for the same entity needs the old terminal close and free slots", () => {
  it("W3 → C → E2 under a NEW identity with renewed authority, carried through service, dispatch and delivery", async () => {
    const f = await world(quarryWorksFixture());
    const ref1 = await foundationThroughFixation(f);
    const k = keysOf(f.fx);
    await admitServiceBasis(f);
    await admitService(f, ref1);
    await changeCondition(f, "STANDING", 1); // the same damaged pieces remain, but the pinned condition moved: W3
    await must(f.economy.admitWithdrawal({ ...pub("w", 1), ...req(ref1) }));
    await must(f.logistics.releaseUnusedService({ ...pub("f2", 1), ...req(ref1) }));
    await must(f.economy.closeWithdrawnRequest({ ...pub("c", 1), ...req(ref1) }));
    // E2 with the cargo slot still claimed would be refused; now it is released: a new request fixes under fresh authority
    const closeKey = f.economy.close(ref1)!.fact.key;
    await must(
      f.economy.resolveFreightFixation({
        ...pub("e2", 1),
        resolution: { seal_id: f.fx.sealId, owner_event: closeKey },
      }),
    );
    const ref2 = f.economy.currentRequestRef(f.fx.sealId)!;
    expect(ref2).not.toBe(ref1);
    const second = f.economy.freightRequest(ref2)!.value;
    expect(second.prior_unused_close).toMatchObject({ request_ref: ref1 });
    expect(second.requirement.condition.version).toBe(2);
    // the old identity is history: still terminal, its original receipts untouched
    expect(f.economy.allocation(ref1)!.value.state.status).toBe("terminal");
    expect(f.economy.freightRequest(ref1)!.fact.version).toBe(1);
    // a replay of the SAME E2 intent returns the original act; it does not fix a third request
    const replay = await outcome(
      f.economy.resolveFreightFixation({
        ...pub("e2", 1),
        resolution: { seal_id: f.fx.sealId, owner_event: closeKey },
      }),
    );
    expect(replay).toMatchObject({ code: "OK", replayed: true });
    // the same service basis (its slot freed by F2) serves the new request on the entity's one slot at a later version
    await admitService(f, ref2, 2);
    const c2 = f.campaign.store.getFact(logisticsCommitmentKey(f.fx.worldId, k.entityId))!;
    expect(c2.version).toBe(3);
    await dispatchFirst(f, ref2, 2);
    await consumeUse(f, ref2, 2);
    await enrollTransfer(f, 2);
    await must(advanceTo(f, "tx-deliver-2", deliveryBoundary(f)));
    await must(f.economy.recordDestinationAdequacy({ ...pub("ad", 2), ...req(ref2) }));
    expect(f.economy.adequacyStatus(ref2)).toBe(
      "WHOLE_RECEIVED_QUANTITY_AVAILABLE_FOR_SITE_PROVISIONING",
    );
    expect(f.economy.adequacyStatus(ref1)).toBe("CLOSED_UNUSED");
    expect(f.economy.useConsumption(second.directive_use_id)!.value.request.request_ref).toBe(ref2);
  });

  it("E2 is refused while the old request is not closed, and after a dispatch has consumed the slots", async () => {
    const f = await world(textileWorkshopFixture());
    const ref = await foundationThroughFixation(f);
    const k = keysOf(f.fx);
    const open = await outcome(
      f.economy.resolveFreightFixation({
        ...pub("e2", 1),
        resolution: { seal_id: f.fx.sealId, owner_event: k.entity },
      }),
    );
    expect(open.code).toBe("WITHHELD");
    await admitServiceBasis(f);
    await admitService(f, ref);
    await dispatchFirst(f, ref);
    await consumeUse(f, ref);
    const spent = await outcome(
      f.economy.resolveFreightFixation({
        ...pub("e2", 2),
        resolution: { seal_id: f.fx.sealId, owner_event: k.entity },
      }),
    );
    expect(spent.code).toBe("WITHHELD");
    expect(spent.message).toMatch(/not stationary and unengaged|occupied or already consumed/);
  });
});

describe("positive F1 terminal refusal is WITHHELD: no Logistics refusal kind, key, state or receipt exists", () => {
  it("registers no refusal/F1 kind anywhere, and the withdrawal vocabulary has neither W1 nor W4", async () => {
    expect(
      ALL_FACT_KINDS.map((k) => k.id).filter((id) => /refus|f1|denied|reject/i.test(id)),
    ).toEqual([]);
    expect(FREIGHT_FACT_KIND_IDS.filter((id: string) => id.startsWith("logistics_"))).toEqual([
      "logistics_service_basis",
      "logistics_service_slot",
      "logistics_unused_release",
      "logistics_freight_dispatch_enrollment",
    ]);
    const f = await world(quarryWorksFixture());
    const ref = await foundationThroughFixation(f);
    // a raw, caller-selected W1 (or W4) withdrawal is unrepresentable
    const plan = { writes: [], reads: [] };
    void plan;
    const forged = (kind: string) => ({
      request: { fact_key: "x", request_ref: ref, version: 1 },
      act: "withdrawal-pending",
      cause: { kind, reason: "FORGED" },
      entity: { fact_key: "x", entity_id: "y" },
      logistics_guard: { branch: "NO_SERVICE_FOR_THIS_REQUEST" },
      cut_basis_revision: 0,
      admitted_at: f.fx.t0,
      effect: "PROTECTION_ONLY_RELEASES_NOTHING_CLOSES_NOTHING",
    });
    for (const kind of ["W1", "W4"]) {
      const g = groupOfPlan(
        f.campaign.store,
        pub("forged", kind === "W1" ? 1 : 2),
        "economy",
        "economy_state",
        FREIGHT_ECONOMY_RULE,
        {
          reads: [],
          writes: [
            { key: `economy/freight-withdrawal/${ref}`, value: forged(kind), expected_version: 0 },
          ],
        },
      );
      expect((await outcome(f.campaign.store.commit(g))).code, kind).toBe("VALUE_INVALID");
    }
    // a capacity shortfall or an unadmitted service basis is NOT F1: the request stays pending and protected
    await changeCondition(f, "STANDING", 1);
    const noBasis = f.logistics.serviceResolution(ref, basisIdOf(f));
    expect(noBasis).toMatchObject({
      outcome: "NOT_ADMITTED",
      f1_positive: "WITHHELD_SOURCE_UNRESOLVED",
      effect: "NONE_REQUEST_STAYS_PENDING_AND_PROTECTED",
    });
    expect(f.economy.allocation(ref)!.value.state.status).toBe("pending");
  });
});
