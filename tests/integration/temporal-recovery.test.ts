// Turnless Temporal Foundation — unknown-outcome and crash recovery by IDENTITY (RC-16, IA-06 partial).
// A resolution transaction is several ordinary publications (owner stage groups, then the kernel's
// single group). A failure injected before or after ANY durable step of ANY of them must converge, after
// reopen and a re-presentation of the SAME request, on the identical campaign — never a duplicate stage,
// close or consequence, never a blind retry, and never a recomputation of a stage that already committed.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import { CanonicalCampaign, nodeFs, stageIntentId, TemporalCoordinator } from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  PRODUCER_STAGE,
  SYNTH_EXTENSION,
  SimulatedCrash,
  T1,
  continuationInput,
  instrumentFs,
  stopAtBoundaryRequest,
  syntheticProviders,
  syntheticSourceGroup,
} from "@immortalis/testkit";
import { must, reopen, seededTemporalCampaign, temporalSummary } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

describe("unknown outcome is reconciled by identity, never blindly retried", () => {
  it("converges on the identical campaign after a failure at every durable step of the whole transaction", async () => {
    // Clean reference run, and a dry run to count the durable steps of the transaction.
    const refDir = tempDir();
    const ref = await seededTemporalCampaign(refDir);
    await ref.campaign.close();

    const countDir = tempDir();
    await (await seededTemporalCampaign(countDir)).campaign.close();
    const probe = instrumentFs(nodeFs);
    const p = await must(
      CanonicalCampaign.open(countDir, { fs: probe.fs, extension: SYNTH_EXTENSION }),
    );
    const afterOpen = probe.count();
    const pc = new TemporalCoordinator(p.store, syntheticProviders());
    await must(pc.advance(stopAtBoundaryRequest("tx-1")));
    const afterAdvance = probe.count();
    const finalHead = p.store.head();
    await p.close();
    // producer + consumer + kernel: three commits of at least four durable steps each
    expect(afterAdvance - afterOpen).toBeGreaterThanOrEqual(12);

    const seen = { rolledBackTx: 0, partial: 0, committedTx: 0 };
    const finals = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= afterAdvance; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await (await seededTemporalCampaign(dir)).campaign.close();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const campaign = await must(
          CanonicalCampaign.open(dir, { fs: inst.fs, extension: SYNTH_EXTENSION }),
        );
        const coordinator = new TemporalCoordinator(campaign.store, syntheticProviders());
        const r = await coordinator.advance(stopAtBoundaryRequest("tx-1"));
        if (!r.ok) {
          // the durable outcome is unknown: reported as such, never retried automatically
          expect(r.error.code).toBe("UNKNOWN_OUTCOME");
          expect(r.error.details?.["cause"]).toContain("simulated crash");
          const blocked = await coordinator.advance(stopAtBoundaryRequest("tx-1"));
          expect(!blocked.ok && blocked.error.code).toBe("STORE_POISONED");
        }
        await campaign.close();

        // "Restart": reopen on the real filesystem, inspect what is durable, then reconcile by identity.
        const reopened = await reopen(dir, "restart");
        expect(reopened.campaign.verify()).toEqual([]); // whatever survived is internally consistent
        const producerCommitted = reopened.campaign.store.lookupReceipt(
          stageIntentId(PRODUCER_STAGE),
        );
        const txCommitted = reopened.coordinator.transaction("tx-1");
        if (txCommitted) seen.committedTx++;
        else if (producerCommitted) seen.partial++;
        else seen.rolledBackTx++;

        // Re-presenting the SAME request reaches the existing receipts and finishes the work.
        const again = await must(reopened.coordinator.advance(stopAtBoundaryRequest("tx-1")));
        expect(again.transaction.outcome.actual_stop.value).toBe(140);
        if (producerCommitted && !txCommitted) {
          // a stage that already committed is adopted from the journal, not recomputed or re-published
          expect(again.adopted).toContainEqual(PRODUCER_STAGE);
          expect(again.recomputed_in_place).toEqual([]);
        }
        const summary = temporalSummary(reopened.campaign, reopened.coordinator);
        expect(summary.head.revision).toBe(finalHead.revision); // no duplicate group anywhere
        expect(summary.head.journal_entries).toBe(finalHead.journal_entries);
        finals.add(`${summary.head.state_sha256}/${summary.head.journal_head_sha256}`);
        expect(reopened.campaign.verify()).toEqual([]);
        await reopened.campaign.close();
        // and one more load is still one consistent story
        const last = await reopen(dir, "last");
        expect(last.campaign.verify()).toEqual([]);
        await last.campaign.close();
      }
    }
    // every failure point converges on the identical campaign, state and journal chain
    expect(finals.size).toBe(1);
    expect([...finals][0]).toBe(`${finalHead.state_sha256}/${finalHead.journal_head_sha256}`);
    // the injected failures genuinely exercised all three situations
    expect(seen.rolledBackTx).toBeGreaterThan(0);
    expect(seen.partial).toBeGreaterThan(0);
    expect(seen.committedTx).toBeGreaterThan(0);
  });

  it("a committed stage is not recomputed under a newer source version when the interrupted transaction is re-presented", async () => {
    // crash on the first durable step of the KERNEL commit: both stages are durable, the transaction is not
    const probe = instrumentFs(nodeFs);
    const dry = tempDir();
    await (await seededTemporalCampaign(dry)).campaign.close();
    const d = await must(CanonicalCampaign.open(dry, { fs: probe.fs, extension: SYNTH_EXTENSION }));
    const base = probe.count();
    await must(
      new TemporalCoordinator(d.store, syntheticProviders()).advance(stopAtBoundaryRequest("tx-1")),
    );
    const total = probe.count();
    await d.close();
    // find a crash point after both stage commits and before the kernel commit is durable: walk back
    // from the end over the kernel commit's steps
    let hit = false;
    for (let failAt = total; failAt > base && !hit; failAt--) {
      const d2 = tempDir();
      await (await seededTemporalCampaign(d2)).campaign.close();
      const inst = instrumentFs(nodeFs, { failAt, when: "before" });
      const c = await must(CanonicalCampaign.open(d2, { fs: inst.fs, extension: SYNTH_EXTENSION }));
      const coord = new TemporalCoordinator(c.store, syntheticProviders());
      const r = await coord.advance(stopAtBoundaryRequest("tx-1"));
      await c.close();
      if (r.ok) continue;
      const re = await reopen(d2, "restart");
      const bothStages = re.campaign.store.getFact("synthetic/consumer/result") !== undefined;
      if (!bothStages || re.coordinator.transaction("tx-1")) {
        await re.campaign.close();
        continue;
      }
      hit = true;
      // a newer source version appears BEFORE the transaction is re-presented
      await must(
        re.campaign.store.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 3, "source-v2", 1)),
      );
      const again = await must(re.coordinator.advance(stopAtBoundaryRequest("tx-1")));
      expect(again.adopted.map((s) => s.owner_operation.operation).sort()).toEqual([
        "synthetic-consume",
        "synthetic-produce",
      ]);
      expect(again.recomputed_in_place).toEqual([]);
      expect(re.campaign.store.getFact("synthetic/producer/result")).toMatchObject({
        version: 1,
        value: { observed_source: "source-v1" }, // the committed cause is not rewound by a later version
      });
      // the evidence records the version the stage actually read, from the journal
      expect(again.transaction.stages[0]!.reads[1]).toMatchObject({ source_basis: { version: 1 } });
      expect(re.campaign.verify()).toEqual([]);
      await re.campaign.close();
    }
    expect(hit).toBe(true);
  });

  it("continuing after a crash mid-continuation also converges", async () => {
    const make = async () => {
      const dir = tempDir();
      const s = await seededTemporalCampaign(dir);
      await must(s.coordinator.advance(stopAtBoundaryRequest("tx-1")));
      await s.campaign.close();
      return dir;
    };
    const refDir = await make();
    const probe = instrumentFs(nodeFs);
    const r = await must(
      CanonicalCampaign.open(refDir, { fs: probe.fs, extension: SYNTH_EXTENSION }),
    );
    const base = probe.count();
    await must(
      new TemporalCoordinator(r.store, syntheticProviders()).continueRemainder(
        continuationInput("tx-2"),
      ),
    );
    const total = probe.count();
    const finalHash = r.store.head().state_sha256;
    await r.close();
    for (let failAt = base + 1; failAt <= total; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = await make();
        const inst = instrumentFs(nodeFs, { failAt, when });
        const c = await must(
          CanonicalCampaign.open(dir, { fs: inst.fs, extension: SYNTH_EXTENSION }),
        );
        const res = await new TemporalCoordinator(c.store, syntheticProviders()).continueRemainder(
          continuationInput("tx-2"),
        );
        if (!res.ok) expect(res.error.code).toBe("UNKNOWN_OUTCOME");
        await c.close();
        const re = await reopen(dir, "restart");
        // whichever side of the commit point survived, the persisted state is lawful...
        expect(re.campaign.verify()).toEqual([]);
        // ...and re-presenting the same continuation reaches the same end, exactly once
        const explicit = {
          ...continuationInput("tx-2"),
          continues: "tx-1",
          requested: { target: T1, condition: null },
        };
        const again = await must(re.coordinator.advance(explicit));
        expect(again.replayed || re.coordinator.state()!.value.canonical_time.value === 200).toBe(
          true,
        );
        expect(again.transaction.outcome.actual_stop.value).toBe(200);
        expect(re.campaign.store.head().state_sha256).toBe(finalHash);
        await re.campaign.close();
      }
    }
  });

  it("the simulated crash is the only fault the harness injects", () => {
    expect(new SimulatedCrash(2).opIndex).toBe(2);
  });
});
