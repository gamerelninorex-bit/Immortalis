import { describe, it, expect } from "vitest";
import {
  CampaignCore,
  CANONICAL_OWNER_REGISTRY,
  MsSetupPublisher,
  GipAdapter,
  msFenceCheck,
  msFenceFullCheck,
  inspectMsFenceView,
  msFenceMetrics,
  emptyState,
  msR1GroupCheck,
  msActorGroupCheck,
  bootstrapInitialTimePrecondition,
  verifyMsIntegrity,
  resolveKey,
  type CampaignState,
} from "@immortalis/engine";
import { gipPublication, institutionIdentity } from "@immortalis/testkit";
import { msHarness } from "../support/ms-setup.ts";
import { must } from "../support/temporal.ts";

describe("C5 generic derived fence, transition binding and independent C6 prefix", () => {
  it("agrees with the stateless oracle for each lawful transition and unrelated refusal in no-MS, active and released states", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    await must(
      new GipAdapter(h.store).establishInstitution({
        ...gipPublication(1),
        institution: institutionIdentity(),
      }),
    );
    const unrelated = h.trace.at(-1)!.group;
    for (const t of h.trace) {
      expect(msFenceCheck(t.group, t.before)).toEqual(msFenceFullCheck(t.group, t.before));
      expect(msFenceCheck(unrelated, t.before)).toEqual(msFenceFullCheck(unrelated, t.before));
    }
    const view = inspectMsFenceView(h.state());
    expect(view).toMatchObject({ released: true, hasMs: true });
    const scans = msFenceMetrics.scans;
    expect(msFenceCheck(unrelated, h.state())).toBeNull();
    expect(msFenceMetrics.scans).toBe(scans);
    await h.campaign.close();
  });
  it("fails closed for absent, copied, wrong-campaign, stale or caller-forged bindings", async () => {
    const h = await msHarness(),
      group = h.trace.at(-1)!.group,
      state = h.state();
    for (const altered of [
      { ...state },
      { ...state, campaign_id: "wrong" },
      { ...state, revision: state.revision + 1 },
      { ...state, msFenceView: { released: true, hasMs: false } },
    ] as CampaignState[])
      expect(msFenceCheck(group, altered)).toMatchObject({
        details: { reason: "MS_FENCE_UNKNOWN" },
      });
    await h.campaign.close();
  });
  it("leaves a rejected/prepared state unchanged, advances on adoption once and does not repeat an idempotent receipt", async () => {
    const h = await msHarness(),
      first = h.trace[0]!.group;
    const core = new CampaignCore({
      campaignId: h.campaignId,
      owners: CANONICAL_OWNER_REGISTRY,
      admission: h.admission,
      state: emptyState(h.campaignId),
      headSha256: "0".repeat(64),
      specLockSha256: "0".repeat(64),
    });
    const prior = inspectMsFenceView(core.state),
      prepared = core.prepare(first);
    expect(prepared.ok).toBe(true);
    expect(inspectMsFenceView(core.state)).toBe(prior);
    if (!prepared.ok || prepared.value.kind !== "apply") throw new Error("expected preparation");
    expect(inspectMsFenceView(prepared.value.nextState)).toBeNull();
    expect(core.prepare({ ...first, campaign_id: "alien" }).ok).toBe(false);
    expect(inspectMsFenceView(core.state)).toBe(prior);
    core.accept(prepared.value);
    const adopted = inspectMsFenceView(core.state);
    expect(adopted?.revision).toBe(1);
    expect(core.prepare(first)).toMatchObject({ ok: true, value: { kind: "replay" } });
    expect(inspectMsFenceView(core.state)).toBe(adopted);
    await h.campaign.close();
  });
  it("independently refuses an extra legal-looking pre-B2 fact with the generic fence disabled, wrong t0, early closure and legacy source rules", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const get = (kind: string) =>
      h.trace.find((t) => resolveKey(t.group.writes[0]!.key)?.kind.id === kind)!;
    const b2 = get("actor_physical_presence"),
      b1 = get("actor_setup_placement"),
      closure = get("world_setup_closure"),
      time = get("temporal_state");
    await must(
      new GipAdapter(h.store).establishInstitution({
        ...gipPublication(3),
        institution: institutionIdentity("late-fixture"),
      }),
    );
    const extra = h.store.getFact(h.trace.at(-1)!.group.writes[0]!.key)!;
    const forged = { ...b2.before, facts: new Map(b2.before.facts).set(extra.key, extra) };
    expect(msR1GroupCheck(b2.group, forged)).not.toBeNull();
    const wrong = structuredClone(b2.group);
    (wrong.writes[0]!.value as { effective_instant: { value: number } }).effective_instant.value++;
    expect(msR1GroupCheck(wrong, b2.before)).not.toBeNull();
    expect(msR1GroupCheck(closure.group, b1.before)).not.toBeNull();
    for (const t of [b1, closure, b2]) {
      const g = structuredClone(t.group);
      g.rule = { ...g.rule, native_pin: "2000-01-01T00:00:00.000Z" };
      expect(msR1GroupCheck(g, t.before)).not.toBeNull();
    }
    for (const key of time.group.reads.map((r) => r.key)) {
      const g = structuredClone(time.group);
      g.reads = g.reads.filter((r) => r.key !== key);
      expect(bootstrapInitialTimePrecondition(g, time.before)).not.toBeNull();
    }
    const extraDep = structuredClone(time.group);
    extraDep.depends_on.push("unrelated");
    expect(bootstrapInitialTimePrecondition(extraDep, time.before)).not.toBeNull();
    const existence = get("named_actor_existence_basis"),
      bad = structuredClone(existence.group);
    (
      bad.writes[0]!.value as { origin_licence: { leaf_sha256: string } }
    ).origin_licence.leaf_sha256 = "1".repeat(64);
    expect(msActorGroupCheck(bad, existence.before)).not.toBeNull();
    expect(verifyMsIntegrity(h.store)).toEqual([]);
    expect(
      verifyMsIntegrity({
        ...h.store,
        head: () => h.store.head(),
        listFacts: () => h.store.listFacts(),
        lookupReceipt: (id) => h.store.lookupReceipt(id),
        committedGroup: (id) => h.store.committedGroup(id),
        committedGroupById: (id) => h.store.committedGroupById!(id),
        ruleCheckedGroupIds: () => new Set(),
      } as typeof h.store),
    ).not.toEqual([]);
    await h.campaign.close();
  });
  it("keeps receipt retries from repeating the setup milestone", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    const before = h.state(),
      view = inspectMsFenceView(before),
      count = h.trace.length;
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    expect(inspectMsFenceView(h.state())).toBe(view);
    expect(h.trace).toHaveLength(count);
    expect(await new MsSetupPublisher(h.store).presence()).toMatchObject({ ok: true });
    expect(h.trace).toHaveLength(count);
    await h.campaign.close();
  });
});
