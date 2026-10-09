/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and journal values */
// GIP Governance Instrument Sunset (sunset slice) — interrupted registration and recovery. GIP's publication and the Temporal
// kernel's boundary registration are two owners' commits: a crash, a lost reply or a restart between them must neither lose a future
// material sunset nor let canonical time pass it. Re-presenting the SAME authorized intent (or completing the receipt) safely finishes
// the enrollment exactly once; until then a player advance that would cross the known-unregistered sunset is refused and reports no
// success. The earned-boundary close itself survives a failure at every durable step and at the stage/kernel-commit seam.
// Register lineage: IA-04, IA-06, IA-22 (partial); RC-05/07/10/16; IM-02, IM-06, IM-11, IM-12, IM-17.
import { describe, expect, it } from "vitest";
import {
  GIP_SUNSET_ENROLLMENT_KEY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  ResolutionTransactionSchema,
  gipInstrumentKey,
  gipSunsetObjectId,
  gipSunsetStage,
  temporalObjectKey,
  temporalTransactionKey,
  type CommitGroup,
  type GovernanceInstrument,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  GipAdapter,
  nodeFs,
  transactionIntentId,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import { INSTRUMENT_A, INSTRUMENT_B, gipPublication, instrumentFs } from "@immortalis/testkit";
import {
  omit,
  OTHER_SUNSET_AT,
  SUNSET_AT,
  SUNSET_LATER,
  SUNSET_MID,
  SUNSET_START,
  advanceTo,
  at,
  establishSunset,
  instrumentOf,
  registrationLost,
  seededPendingSunset,
  seededSunsetCampaign,
  sunsetCoordinator,
  sunsetInstrument,
  wireSunset,
  type SunsetSeeded,
} from "../support/gip-sunset.ts";
import { reopenGip } from "../support/gip.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const sunsetKey = temporalObjectKey(gipSunsetObjectId(INSTRUMENT_A));
const lifecycle = (s: Pick<SunsetSeeded, "campaign">, id = INSTRUMENT_A) =>
  (instrumentOf(s, id)!.value as GovernanceInstrument).lifecycle_status;
const index = (s: Pick<SunsetSeeded, "campaign">) =>
  (s.campaign.store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)?.value as any)?.entries ?? [];
const canonicalTime = (s: Pick<SunsetSeeded, "campaign">) =>
  TemporalStateSchema.parse(s.campaign.store.getFact(TEMPORAL_STATE_KEY)!.value).canonical_time;
const kernelAndGip = (s: Pick<SunsetSeeded, "campaign">) =>
  s.campaign.store
    .listFacts()
    .filter((f) => f.key.startsWith("gip/") || f.key.startsWith("temporal/"));

describe("the crash window between GIP's publication and the Temporal registration", () => {
  it("GIP's Instrument and receipt are durable, the sunset is a known-unregistered material term, and nothing is lost or executed", async () => {
    const s = await seededPendingSunset(tempDir());
    const instrument = instrumentOf(s)!;
    expect([instrument.version, lifecycle(s)]).toEqual([1, "active"]);
    const receipt = s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)!;
    expect(receipt.value).toEqual({
      instrument_id: INSTRUMENT_A,
      sunset_at: SUNSET_AT,
      basis_time: SUNSET_START,
    });
    expect(receipt.provenance.group_id).toBe(instrument.provenance.group_id);
    // the kernel holds no object and no boundary: found by the receipt's key alone, never by scanning Instruments
    expect(s.campaign.store.getFact(sunsetKey)).toBeUndefined();
    expect(index(s)).toEqual([]);
    expect(s.gip.sunsetEnrollment()).toMatchObject({ registered: false });
    expect(canonicalTime(s)).toEqual(SUNSET_START);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a player advance that would reach the unregistered sunset is refused and reports no success; nothing is written and time does not move", async () => {
    const s = await seededPendingSunset(tempDir());
    const head = s.campaign.store.head();
    for (const [id, target] of [
      ["tx-at", SUNSET_AT],
      ["tx-later", SUNSET_LATER],
      ["tx-after", at(SUNSET_AT.value + 1)],
    ] as const)
      expect(await codeOf(s.coordinator.advance(advanceTo(id, target))), id).toBe(
        "ENROLLMENT_PENDING",
      );
    expect(s.campaign.store.head()).toEqual(head);
    expect(canonicalTime(s)).toEqual(SUNSET_START);
    expect(lifecycle(s)).toBe("active");
    expect(s.campaign.store.getFact(temporalTransactionKey("tx-later"))).toBeUndefined();
  });

  it("an advance short of the unregistered sunset is not blocked: only crossing known-unregistered material work is", async () => {
    const s = await seededPendingSunset(tempDir());
    await must(s.coordinator.advance(advanceTo("tx-mid", SUNSET_MID)));
    expect(canonicalTime(s)).toEqual(SUNSET_MID);
    expect(await codeOf(s.coordinator.advance(advanceTo("tx-at", SUNSET_AT)))).toBe(
      "ENROLLMENT_PENDING",
    );
    expect(await codeOf(s.coordinator.advance(advanceTo("tx-last", at(SUNSET_AT.value - 1))))).toBe(
      "OK",
    );
    expect(lifecycle(s)).toBe("active");
  });

  it("kernel admission refuses a raw transaction that reaches the unregistered sunset, whoever builds it (the coordinator's refusal is not the only guard)", async () => {
    // a lawful lazy-carry transaction, committed on a twin campaign, edited to stop at the sunset on this one
    const twin = await seededPendingSunset(tempDir());
    await must(twin.coordinator.advance(advanceTo("tx-raw", SUNSET_MID)));
    const lawful = twin.campaign.store.committedGroup(transactionIntentId("tx-raw"))!;
    const s = await seededPendingSunset(tempDir());
    const head = s.campaign.store.head();
    const edited = structuredClone(lawful) as any;
    for (const w of edited.writes) {
      if (w.key === TEMPORAL_STATE_KEY) w.value.canonical_time = SUNSET_LATER;
      if (w.key === temporalTransactionKey("tx-raw")) {
        w.value.requested.target = SUNSET_LATER;
        w.value.outcome.actual_stop = SUNSET_LATER;
      }
    }
    const refused = await s.campaign.store.commit(edited as CommitGroup);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.message).toMatch(/unregistered sunset/);
    expect(s.campaign.store.head()).toEqual(head);
    // …while the unedited lawful transaction (short of the sunset) commits on this campaign too
    expect((await s.campaign.store.commit(structuredClone(lawful) as CommitGroup)).ok).toBe(true);
    expect(canonicalTime(s)).toEqual(SUNSET_MID);
  });

  it("re-presenting the SAME authorized intent replays GIP's publication and registers the sunset exactly once; then the advance succeeds and expires it", async () => {
    const s = await seededPendingSunset(tempDir());
    const before = s.campaign.store.head();
    const out = await must(
      s.gip.establishSunsetInstrument({ ...gipPublication(4), instrument: sunsetInstrument() }),
    );
    expect(out.instrument.replayed).toBe(true);
    expect(out.registration.replayed).toBe(false);
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(instrumentOf(s)!.version).toBe(1);
    expect(s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)!.version).toBe(1);
    expect(index(s)).toHaveLength(1);
    expect(s.gip.sunsetEnrollment()?.registered).toBe(true);
    // and a third presentation is a pure replay
    const settled = s.campaign.store.head();
    const again = await must(
      s.gip.establishSunsetInstrument({ ...gipPublication(4), instrument: sunsetInstrument() }),
    );
    expect([again.instrument.replayed, again.registration.replayed]).toEqual([true, true]);
    expect(s.campaign.store.head()).toEqual(settled);

    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));
    expect(lifecycle(s)).toBe("expired");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("completing the receipt without the original intent registers the same object, from committed state alone", async () => {
    const s = await seededPendingSunset(tempDir());
    const done = await must(s.gip.completeSunsetEnrollment(gipPublication(40)));
    expect(done.replayed).toBe(false);
    expect(s.gip.sunsetEnrollment()?.registered).toBe(true);
    const object = s.campaign.store.getFact(sunsetKey)!;
    expect((object.value as any).last_resolved_basis).toEqual(SUNSET_START);
    expect((object.value as any).next_boundary.at).toEqual(SUNSET_AT);
    // nothing to complete the second time: the registration replays by identity
    expect((await must(s.gip.completeSunsetEnrollment(gipPublication(41)))).replayed).toBe(true);
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_AT)));
    expect(lifecycle(s)).toBe("expired");
  });

  it("the receipt survives save → close → load: the reopened campaign still refuses to cross it, verifies, and recovery completes there", async () => {
    const dir = tempDir();
    const s = await seededPendingSunset(dir);
    const saved = structuredClone(kernelAndGip(s));
    await s.campaign.close();

    const r = wireSunset((await reopenGip(dir)).campaign);
    expect(r.campaign.verify()).toEqual([]);
    expect(kernelAndGip(r)).toEqual(saved);
    expect(r.gip.sunsetEnrollment()).toMatchObject({ registered: false });
    expect(await codeOf(r.coordinator.advance(advanceTo("tx-1", SUNSET_AT)))).toBe(
      "ENROLLMENT_PENDING",
    );
    await must(
      r.gip.establishSunsetInstrument({ ...gipPublication(4), instrument: sunsetInstrument() }),
    );
    await must(r.coordinator.advance(advanceTo("tx-2", SUNSET_AT)));
    expect(lifecycle(r)).toBe("expired");
    await r.campaign.close();
  });

  it("another sunset-bearing Instrument waits for the first enrollment to be completed; unrelated Instruments and work are not blocked", async () => {
    const s = await seededPendingSunset(tempDir());
    const head = s.campaign.store.head();
    expect(
      await codeOf(
        s.gip.establishSunsetInstrument({
          ...gipPublication(5),
          instrument: sunsetInstrument(INSTRUMENT_B, OTHER_SUNSET_AT),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_B))).toBeUndefined();
    // an Instrument that carries no sunset has no enrollment to wait for
    const plain = omit(sunsetInstrument(INSTRUMENT_B), "sunset_condition");
    await must(s.gip.establishGovernanceInstrument({ ...gipPublication(6), instrument: plain }));
    // once the first is completed, the second is established and enrolled
    await must(s.gip.completeSunsetEnrollment(gipPublication(40)));
    await must(
      s.gip.establishSunsetInstrument({
        ...gipPublication(7),
        instrument: sunsetInstrument("instrument-c-1", OTHER_SUNSET_AT),
      }),
    );
    expect(s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)!.version).toBe(2);
    expect(index(s)).toHaveLength(2);
  });

  it("a lost REPLY after the registration committed converges: the retry replays it and nothing is registered twice", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const lostReply = new Proxy(s.campaign.store, {
      get(target, prop) {
        if (prop === "commit")
          return async (g: CommitGroup) => {
            const r = await target.commit(g);
            return g.writes.some((w) => w.key.startsWith("temporal/object/"))
              ? { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } }
              : r;
          };
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    }) as CampaignStore;
    const first = await new GipAdapter(lostReply).establishSunsetInstrument({
      ...gipPublication(4),
      instrument: sunsetInstrument(),
    });
    expect(!first.ok && first.error.code).toBe("UNKNOWN_OUTCOME");
    // the registration DID commit: the sunset is enrolled; the retry replays both publications
    expect(s.gip.sunsetEnrollment()?.registered).toBe(true);
    const head = s.campaign.store.head();
    const retry = await must(
      s.gip.establishSunsetInstrument({ ...gipPublication(4), instrument: sunsetInstrument() }),
    );
    expect([retry.instrument.replayed, retry.registration.replayed]).toEqual([true, true]);
    expect(s.campaign.store.head()).toEqual(head);
    expect(index(s)).toHaveLength(1);
  });
});

describe("load-time verification fails closed when canonical time has reached a sunset that was never registered", () => {
  it("a loaded campaign whose temporal state stands at or past a still-unregistered sunset is reported, and one short of it is not", async () => {
    const s = await seededPendingSunset(tempDir());
    const real = s.campaign.store;
    const withClock = (time: typeof SUNSET_AT): CampaignStore =>
      new Proxy(real, {
        get(target, prop) {
          if (prop === "listFacts")
            return () =>
              target
                .listFacts()
                .map((f: OwnerFact) =>
                  f.key === TEMPORAL_STATE_KEY
                    ? { ...f, value: { ...(f.value as object), canonical_time: time } }
                    : f,
                );
          const v = Reflect.get(target, prop, target);
          return typeof v === "function" ? v.bind(target) : v;
        },
      }) as CampaignStore;
    expect(verifyGipIntegrity(withClock(SUNSET_MID))).toEqual([]);
    for (const time of [SUNSET_AT, SUNSET_LATER])
      expect(verifyGipIntegrity(withClock(time)).map((v) => v.key)).toEqual([
        GIP_SUNSET_ENROLLMENT_KEY,
      ]);
  });
});

describe("a failure at EVERY durable step of the sunset-bearing establishment converges by identity on one world", () => {
  it("each crash point reopens verified (never an Instrument without its receipt, never an object without both), the retry finishes the enrollment, and every crash point reaches the identical campaign", async () => {
    const seed = async (dir: string) => {
      const s = await seededSunsetCampaign(dir);
      await s.campaign.close();
    };
    const establish = (c: CanonicalCampaign) =>
      new GipAdapter(c.store).establishSunsetInstrument({
        ...gipPublication(4),
        instrument: sunsetInstrument(),
      });

    const probeDir = tempDir();
    await seed(probeDir);
    const probe = instrumentFs(nodeFs);
    const pc = await must(CanonicalCampaign.open(probeDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(establish(pc));
    const afterCommit = probe.count();
    const reference = pc.store.head().state_sha256;
    await pc.close();
    expect(afterCommit - afterOpen).toBeGreaterThanOrEqual(8); // two commits

    const finals = new Set<string>();
    const seen = { none: 0, instrumentOnly: 0, both: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterCommit; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const c = await must(CanonicalCampaign.open(dir, { fs: inst.fs }));
        const r = await establish(c);
        if (!r.ok) expect(r.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();

        // "Restart": reopen with the real filesystem
        const reopened = await must(CanonicalCampaign.open(dir));
        expect(reopened.verify(), `${failAt}/${when}`).toEqual([]);
        const store = reopened.store;
        const hasInstrument = store.getFact(gipInstrumentKey(INSTRUMENT_A)) !== undefined;
        const hasReceipt = store.getFact(GIP_SUNSET_ENROLLMENT_KEY) !== undefined;
        const hasObject = store.getFact(sunsetKey) !== undefined;
        // one atomic GIP group: the Instrument and its receipt exist together or not at all; the kernel object needs both
        expect(hasInstrument, `${failAt}/${when}`).toBe(hasReceipt);
        if (hasObject) expect(hasInstrument).toBe(true);
        if (!hasInstrument) seen.none++;
        else if (!hasObject) seen.instrumentOnly++;
        else seen.both++;
        // the interrupted state may not be crossed, whichever step it stopped at
        const wired = wireSunset(reopened);
        if (hasInstrument && !hasObject)
          expect(await codeOf(wired.coordinator.advance(advanceTo("tx-probe", SUNSET_AT)))).toBe(
            "ENROLLMENT_PENDING",
          );

        const retry = await must(establish(reopened));
        expect(retry.instrument.replayed).toBe(hasInstrument);
        expect(retry.registration.replayed).toBe(hasObject);
        expect(index(wired)).toHaveLength(1);
        expect(reopened.verify()).toEqual([]);
        finals.add(store.head().state_sha256);
        await reopened.close();
        const again = await CanonicalCampaign.open(dir);
        expect(again.ok).toBe(true);
        if (again.ok) await again.value.close();
      }
    }
    expect([...finals]).toEqual([reference]); // every crash point converges on the world the uninterrupted run reaches
    expect(seen.none).toBeGreaterThan(0);
    expect(seen.instrumentOnly).toBeGreaterThan(0);
    expect(seen.both).toBeGreaterThan(0);
  }, 120_000);
});

describe("the earned-boundary close survives a failure at every durable step and at the stage / kernel-commit seam", () => {
  const request = () => advanceTo("tx-1", SUNSET_LATER);

  it("a failure injected before or after every durable step of the crossing advance converges on the identical campaign with the Instrument expired exactly once", async () => {
    const seed = async (dir: string) => {
      const s = await seededSunsetCampaign(dir);
      await establishSunset(s);
      await s.campaign.close();
    };
    const run = (c: CanonicalCampaign) => sunsetCoordinator(c.store).advance(request());

    const probeDir = tempDir();
    await seed(probeDir);
    const probe = instrumentFs(nodeFs);
    const pc = await must(CanonicalCampaign.open(probeDir, { fs: probe.fs }));
    const afterOpen = probe.count();
    await must(run(pc));
    const afterCommit = probe.count();
    const reference = pc.store.head().state_sha256;
    await pc.close();
    expect(afterCommit - afterOpen).toBeGreaterThanOrEqual(12); // authority, stage, kernel group

    const finals = new Set<string>();
    const seen = { instrumentActive: 0, instrumentExpired: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterCommit; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const c = await must(CanonicalCampaign.open(dir, { fs: inst.fs }));
        const r = await run(c);
        if (!r.ok) expect(["UNKNOWN_OUTCOME", "STORE_POISONED"]).toContain(r.error.code);
        await c.close();

        const reopened = await must(CanonicalCampaign.open(dir));
        expect(reopened.verify(), `${failAt}/${when}`).toEqual([]);
        const w = wireSunset(reopened);
        const version = instrumentOf(w)!.version;
        // never a sibling Instrument, never a third version
        expect([1, 2]).toContain(version);
        if (version === 1) seen.instrumentActive++;
        else seen.instrumentExpired++;
        const retry = await must(run(reopened));
        expect(retry.transaction.outcome.actual_stop).toEqual(SUNSET_LATER);
        expect(lifecycle(w)).toBe("expired");
        expect(instrumentOf(w)!.version).toBe(2);
        expect(index(w)).toEqual([]);
        expect(reopened.verify(), `${failAt}/${when}`).toEqual([]);
        finals.add(reopened.store.head().state_sha256);
        await reopened.close();
      }
    }
    expect([...finals]).toEqual([reference]);
    expect(seen.instrumentActive).toBeGreaterThan(0);
    expect(seen.instrumentExpired).toBeGreaterThan(0);
  }, 180_000);

  /** A coordinator over a store that loses the kernel's transaction commit (the stage group is already durable). */
  const kernelCommitLost = (inner: CampaignStore): CampaignStore =>
    new Proxy(inner, {
      get(target, prop) {
        if (prop === "commit")
          return (g: CommitGroup) =>
            g.writes.some((w) => w.key.startsWith("temporal/transaction/"))
              ? Promise.resolve({
                  ok: false,
                  error: { code: "UNKNOWN_OUTCOME", message: "crash before the kernel group" },
                })
              : target.commit(g);
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    }) as CampaignStore;

  it("between the stage and the Temporal close: GIP's expiry is durable once, canonical time and the boundary are not; the same transaction adopts the stage and closes", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    const lost = await sunsetCoordinator(kernelCommitLost(s.campaign.store)).advance(request());
    expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");

    // the interrupted state, as a reopened campaign sees it
    expect(lifecycle(s)).toBe("expired");
    expect(instrumentOf(s)!.version).toBe(2);
    expect(canonicalTime(s)).toEqual(SUNSET_START);
    expect(index(s)).toHaveLength(1);
    expect(s.campaign.store.getFact(temporalTransactionKey("tx-1"))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
    // the interrupted transaction cannot be bypassed: canonical time still cannot pass the active boundary
    const stageFact = instrumentOf(s)!;

    const done = await must(sunsetCoordinator(s.campaign.store).advance(request()));
    expect(done.replayed).toBe(false);
    expect(done.adopted).toEqual([gipSunsetStage(INSTRUMENT_A)]);
    expect(instrumentOf(s)).toEqual(stageFact); // adopted, never recomputed or re-expired
    expect(instrumentOf(s)!.version).toBe(2);
    expect(canonicalTime(s)).toEqual(SUNSET_LATER);
    expect(index(s)).toEqual([]);
    const tx = ResolutionTransactionSchema.parse(
      s.campaign.store.getFact(temporalTransactionKey("tx-1"))!.value,
    );
    expect(tx.stages.map((x) => x.stage)).toEqual([gipSunsetStage(INSTRUMENT_A)]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("between the authority and the stage: the opened transaction is re-presented and completes exactly once", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    const stageLost = new Proxy(s.campaign.store, {
      get(target, prop) {
        if (prop === "commit")
          return (g: CommitGroup) =>
            g.owner === "gip"
              ? Promise.resolve({
                  ok: false,
                  error: { code: "UNKNOWN_OUTCOME", message: "crash before the stage" },
                })
              : target.commit(g);
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    }) as CampaignStore;
    const lost = await sunsetCoordinator(stageLost).advance(request());
    expect(lost.ok).toBe(false);
    // the authority is durable, the stage is not: the Instrument is untouched and the time has not moved
    expect(s.campaign.store.getFact("temporal/transaction-authority/tx-1")).toBeDefined();
    expect(lifecycle(s)).toBe("active");
    expect(canonicalTime(s)).toEqual(SUNSET_START);
    const done = await must(sunsetCoordinator(s.campaign.store).advance(request()));
    expect(lifecycle(s)).toBe("expired");
    expect(done.transaction.stages).toHaveLength(1);
    expect(instrumentOf(s)!.version).toBe(2);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a lost reply after the kernel group committed: the retry is a pure replay and writes nothing", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    await must(sunsetCoordinator(s.campaign.store).advance(request()));
    const head = s.campaign.store.head();
    const fact = structuredClone(instrumentOf(s));
    const retry = await must(sunsetCoordinator(s.campaign.store).advance(request()));
    expect(retry.replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(head);
    expect(instrumentOf(s)).toEqual(fact);
  });

  it("registrationLost / the seeded pending campaign also reopens through the file package and recovers by the same identity", async () => {
    const dir = tempDir();
    const s = await seededSunsetCampaign(dir);
    const lost = await new GipAdapter(registrationLost(s.campaign.store)).establishSunsetInstrument(
      {
        ...gipPublication(4),
        instrument: sunsetInstrument(),
      },
    );
    expect(lost.ok).toBe(false);
    await s.campaign.close();
    const r = wireSunset((await reopenGip(dir)).campaign);
    await must(
      r.gip.establishSunsetInstrument({ ...gipPublication(4), instrument: sunsetInstrument() }),
    );
    await must(r.coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));
    expect(lifecycle(r)).toBe("expired");
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  });
});
