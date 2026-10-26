/* eslint-disable @typescript-eslint/no-explicit-any -- groups are inspected structurally */
// F-027-CD1 recovery: RC-16 UNKNOWN_OUTCOME reconciliation by the deterministic precommit/result intent identity BEFORE
// any new entropy exists; a failure injected before or after every durable step of the file package at both commits;
// concurrent-precommit convergence on exactly one lawful seed; and save → close → load → continue at every cut. A draw is
// never recomputed, re-seeded or re-rolled by a crash, a retry, a restart or a race.
// Register lineage: IA-06, IA-30 (partial); RC-09, RC-16; IM-11, IM-12, IM-17; F-027-CD1 CDE-01, CDR-02. Spec lock f027 +
// addendum F-027-CD1. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED, CAL-09 UNRUN).
import { describe, expect, it } from "vitest";
import {
  CausalDrawPrecommitSchema,
  causalDrawPrecommitIntentId,
  causalDrawPrecommitKey,
  causalDrawResultIntentId,
  causalDrawResultKey,
} from "@immortalis/contracts";
import { CanonicalCampaign, deriveResultRecord, nodeFs, preparePrior } from "@immortalis/engine";
import {
  CAND_A,
  CAND_B,
  DRAW_FIXTURE_EXTENSION,
  SEED_1,
  SEED_2,
  SEED_3,
  drawSpecification,
  instrumentFs,
  seededEntropy,
} from "@immortalis/testkit";
import {
  causalDrawFacts,
  crashBefore,
  defaultSpecification,
  drawAdapter,
  isPrecommitGroup,
  isResultGroup,
  journalMark,
  lostReply,
  must,
  reopenDraw,
  request,
  seededDrawCampaign,
  type DrawSeeded,
} from "../support/causal-draw.ts";
import { tempDir } from "../support/tmp.ts";

const codeOf = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "OK" : r.error!.code);
const digestOf = (s: DrawSeeded) => preparePrior(defaultSpecification(s)).draw_key_digest;
const seedOf = (s: DrawSeeded) =>
  CausalDrawPrecommitSchema.parse(
    s.campaign.store.getFact(causalDrawPrecommitKey(digestOf(s)))!.value,
  ).entropy_hex;
/** Everything that must hold of a finished draw, whatever happened on the way. */
function expectOneLawfulDraw(s: DrawSeeded, expectedSeed: string) {
  const d = digestOf(s);
  expect(causalDrawFacts(s.campaign.store).map((f) => f.key)).toEqual(
    [causalDrawPrecommitKey(d), causalDrawResultKey(d)].sort(),
  );
  expect(seedOf(s)).toBe(expectedSeed);
  const pre = s.campaign.store.getFact(causalDrawPrecommitKey(d))!;
  const derived = deriveResultRecord(pre, d);
  expect(derived.ok && derived.value).toEqual(
    s.campaign.store.getFact(causalDrawResultKey(d))!.value,
  );
  expect(s.campaign.store.getFact(causalDrawPrecommitKey(d))!.version).toBe(1);
  expect(s.campaign.store.getFact(causalDrawResultKey(d))!.version).toBe(1);
  expect(s.campaign.verify()).toEqual([]);
}

describe("an UNKNOWN outcome is reconciled by identity before any new entropy exists (RC-16)", () => {
  it("a precommit that crashed before it was durable: the same adapter refuses to create entropy; a recovered adapter, having proved nothing committed, may", async () => {
    const s = await seededDrawCampaign(tempDir());
    const crashed = drawAdapter(crashBefore(s.campaign.store, isPrecommitGroup), s.entropy);
    expect(codeOf(await crashed.draw(request(defaultSpecification(s))))).toBe("UNKNOWN_OUTCOME");
    expect(s.entropy.calls()).toBe(1);
    expect(causalDrawFacts(s.campaign.store)).toEqual([]);
    // retries on the SAME (poisoned) adapter/store never mint a second seed
    for (let i = 0; i < 3; i++) {
      expect(codeOf(await crashed.draw(request(defaultSpecification(s))))).toBe("UNKNOWN_OUTCOME");
    }
    expect(s.entropy.calls()).toBe(1);
    // recovery: canonical state proves no precommit/result exists, so NEW entropy is lawful
    const recovered = seededEntropy(SEED_2);
    const fresh = drawAdapter(s.campaign.store, recovered);
    const out = await must(fresh.draw(request(defaultSpecification(s))));
    expect(out.disposition).toBe("NEW_DRAW");
    expect(recovered.calls()).toBe(1);
    expectOneLawfulDraw(s, SEED_2);
    await s.campaign.close();
  });

  it("a precommit whose reply was lost: it IS durable; reconciliation finds it and continues from ITS seed with no new entropy", async () => {
    const s = await seededDrawCampaign(tempDir());
    const lost = drawAdapter(lostReply(s.campaign.store, isPrecommitGroup), s.entropy);
    expect(codeOf(await lost.draw(request(defaultSpecification(s))))).toBe("UNKNOWN_OUTCOME");
    const d = digestOf(s);
    // the intent identity is deterministic: it reconciles to a receipt, never to "failed"
    expect(s.campaign.store.lookupReceipt(causalDrawPrecommitIntentId(d))).not.toBeNull();
    expect(s.campaign.store.lookupReceipt(causalDrawResultIntentId(d))).toBeNull();
    // the committed precommit is found BY IDENTITY and continued from; no second seed is ever generated
    const retry = await must(lost.draw(request(defaultSpecification(s))));
    expect(retry.disposition).toBe("RESUMED_PRECOMMIT");
    expect(s.entropy.calls()).toBe(1);

    const later = seededEntropy(SEED_2);
    const out = await must(
      drawAdapter(s.campaign.store, later).draw(request(defaultSpecification(s))),
    );
    expect(out.disposition).toBe("REPLAYED_RESULT");
    expect(later.calls()).toBe(0);
    expectOneLawfulDraw(s, SEED_1);
    await s.campaign.close();
  });

  it("a result that crashed or whose reply was lost: the committed seed yields the one result, exactly once", async () => {
    for (const wrap of [crashBefore, lostReply]) {
      const s = await seededDrawCampaign(tempDir());
      const broken = drawAdapter(wrap(s.campaign.store, isResultGroup), s.entropy);
      expect(codeOf(await broken.draw(request(defaultSpecification(s))))).toBe("UNKNOWN_OUTCOME");
      const later = seededEntropy(SEED_2);
      const out = await must(
        drawAdapter(s.campaign.store, later).draw(request(defaultSpecification(s))),
      );
      expect(out.disposition).toBe(wrap === lostReply ? "REPLAYED_RESULT" : "RESUMED_PRECOMMIT");
      expect(later.calls()).toBe(0);
      expectOneLawfulDraw(s, SEED_1);
      await s.campaign.close();
    }
  });

  it("an unknown outcome on one draw withholds new entropy from EVERY draw on that store until it is reopened and reconciled", async () => {
    const s = await seededDrawCampaign(tempDir());
    const crashed = drawAdapter(crashBefore(s.campaign.store, isPrecommitGroup), s.entropy);
    expect(codeOf(await crashed.draw(request(defaultSpecification(s))))).toBe("UNKNOWN_OUTCOME");
    const spec = defaultSpecification(s);
    const other = {
      ...spec,
      draw_key: { ...spec.draw_key, opportunity_id: "another-opportunity" },
    };
    expect(codeOf(await crashed.draw(request(other)))).toBe("UNKNOWN_OUTCOME");
    expect(s.entropy.calls()).toBe(1);
    await s.campaign.close();
  });
});

describe("a failure injected before or after every durable step of the file package converges on one lawful draw", () => {
  it("covers the precommit commit and the result commit of one draw", async () => {
    const seed = async (dir: string) => {
      const s = await seededDrawCampaign(dir);
      await s.campaign.close();
    };
    const open = (dir: string, fs: any) =>
      must(CanonicalCampaign.open(dir, { extension: DRAW_FIXTURE_EXTENSION, fs }));

    const probeDir = tempDir();
    await seed(probeDir);
    const probe = instrumentFs(nodeFs);
    const pc = await open(probeDir, probe.fs);
    const afterOpen = probe.count();
    const wired = {
      campaign: pc,
      entropy: seededEntropy(SEED_1),
      inputs: [],
    } as unknown as DrawSeeded;
    const adapter = drawAdapter(pc.store, wired.entropy);
    const inputs = ["i1", "i2"].map((id) => pc.store.getFact(`synthetic-draw-owner/input/${id}`)!);
    const spec = drawSpecification(inputs);
    await must(adapter.draw(request(spec)));
    const afterDraw = probe.count();
    await pc.close();
    expect(afterDraw - afterOpen).toBeGreaterThanOrEqual(4); // two commits, each append + manifest

    const seen = { precommitDurable: 0, precommitLost: 0, resultDurable: 0 };
    for (let failAt = afterOpen + 1; failAt <= afterDraw; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = tempDir();
        await seed(dir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const c = await open(dir, inst.fs);
        const ins = ["i1", "i2"].map((id) => c.store.getFact(`synthetic-draw-owner/input/${id}`)!);
        const first = seededEntropy(SEED_1);
        const sameAdapter = drawAdapter(c.store, first);
        const r = await sameAdapter.draw(request(drawSpecification(ins)));
        // a failure of the best-effort cleanup after a durable commit is invisible; every other one is UNKNOWN_OUTCOME
        if (!r.ok) {
          expect(r.error.code, `${failAt}/${when}`).toBe("UNKNOWN_OUTCOME");
          // the poisoned store withholds EVERY further commit and any new entropy until it is reopened and reconciled
          const retry = await sameAdapter.draw(request(drawSpecification(ins)));
          expect(["UNKNOWN_OUTCOME", "STORE_POISONED"]).toContain(codeOf(retry));
        }
        expect(first.calls()).toBe(1);
        await c.close().catch(() => undefined);

        // restart with the real filesystem; reconcile by the deterministic identities
        const reopened = await reopenDraw(dir, { entropy: seededEntropy(SEED_2) });
        const d = digestOf(reopened);
        const precommitDurable =
          reopened.campaign.store.lookupReceipt(causalDrawPrecommitIntentId(d)) !== null;
        const resultDurable =
          reopened.campaign.store.lookupReceipt(causalDrawResultIntentId(d)) !== null;
        // never partial: a fact exists exactly when its receipt does
        expect(reopened.campaign.store.getFact(causalDrawPrecommitKey(d)) !== undefined).toBe(
          precommitDurable,
        );
        expect(reopened.campaign.store.getFact(causalDrawResultKey(d)) !== undefined).toBe(
          resultDurable,
        );
        expect(reopened.campaign.verify()).toEqual([]);
        if (resultDurable) seen.resultDurable++;
        else if (precommitDurable) seen.precommitDurable++;
        else seen.precommitLost++;

        const out = await must(reopened.adapter.draw(request(defaultSpecification(reopened))));
        // new entropy exists ONLY when canonical recovery proved no precommit
        expect(reopened.entropy.calls(), `${failAt}/${when}`).toBe(precommitDurable ? 0 : 1);
        expect(out.disposition).toBe(
          resultDurable ? "REPLAYED_RESULT" : precommitDurable ? "RESUMED_PRECOMMIT" : "NEW_DRAW",
        );
        expectOneLawfulDraw(reopened, precommitDurable ? SEED_1 : SEED_2);
        const finalMark = journalMark(reopened.campaign.store);
        await reopened.campaign.close();

        // and once more: a further restart replays and writes nothing
        const again = await reopenDraw(dir, { entropy: seededEntropy(SEED_3) });
        expect(
          (await must(again.adapter.draw(request(defaultSpecification(again))))).disposition,
        ).toBe("REPLAYED_RESULT");
        expect(again.entropy.calls()).toBe(0);
        expect(journalMark(again.campaign.store)).toEqual(finalMark);
        await again.campaign.close();
      }
    }
    // the sweep really crossed the interesting boundaries
    expect(seen.precommitLost).toBeGreaterThan(0);
    expect(seen.precommitDurable).toBeGreaterThan(0);
    expect(seen.resultDurable).toBeGreaterThan(0);
  });
});

describe("a concurrent precommit race creates one lawful draw", () => {
  it("two callers with different provisional seeds: exactly one commits; the loser discards its seed, recovers the committed precommit and continues from it", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    const a = drawAdapter(s.campaign.store, seededEntropy(SEED_1));
    const eB = seededEntropy(SEED_2);
    const b = drawAdapter(s.campaign.store, eB);
    const before = s.campaign.store.head().journal_entries;
    const [ra, rb] = await Promise.all([a.draw(request(spec)), b.draw(request(spec))]);
    const oa = await must(Promise.resolve(ra));
    const ob = await must(Promise.resolve(rb));
    expect([oa.disposition, ob.disposition].sort()).toEqual(["NEW_DRAW", "RESUMED_PRECOMMIT"]);
    expect(oa.selected_candidate_id).toBe(ob.selected_candidate_id);
    expect(oa.draw_id).toBe(ob.draw_id);
    // the loser really generated a provisional seed (it passed the gate) and then discarded it
    expect(eB.calls()).toBe(1);
    expect(s.campaign.store.head().journal_entries).toBe(before + 2);
    expectOneLawfulDraw(s, SEED_1);
    await s.campaign.close();
  });

  it("several racing callers converge: one precommit, one result, one answer", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    const seeds = [SEED_1, SEED_2, SEED_3, "5a".repeat(32)];
    const adapters = seeds.map((seed) => drawAdapter(s.campaign.store, seededEntropy(seed)));
    const outs = await Promise.all(adapters.map((a) => a.draw(request(spec))));
    const ok = await Promise.all(outs.map((o) => must(Promise.resolve(o))));
    expect(new Set(ok.map((o) => o.selected_candidate_id)).size).toBe(1);
    expect(ok.filter((o) => o.disposition === "NEW_DRAW")).toHaveLength(1);
    expect(causalDrawFacts(s.campaign.store)).toHaveLength(2);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });

  it("a racing caller with a DIFFERENT prior under the same draw_id is DRAW_IDENTITY_CONFLICT, never a second seed or a second opportunity", async () => {
    const s = await seededDrawCampaign(tempDir());
    const a = drawAdapter(s.campaign.store, seededEntropy(SEED_1));
    const b = drawAdapter(s.campaign.store, seededEntropy(SEED_2));
    const different = drawSpecification(s.inputs, {
      candidates: [
        { candidate_id: CAND_A, weight: "1" },
        { candidate_id: CAND_B, weight: "1" },
      ],
    });
    const [ra, rb] = await Promise.all([
      a.draw(request(defaultSpecification(s))),
      b.draw(request(different)),
    ]);
    expect(codeOf(ra)).toBe("OK");
    expect(codeOf(rb)).toBe("DRAW_IDENTITY_CONFLICT");
    expectOneLawfulDraw(s, SEED_1);
    await s.campaign.close();
  });

  it("the same adapter asked twice at once draws once", async () => {
    const s = await seededDrawCampaign(tempDir(), { entropy: seededEntropy(SEED_1, SEED_2) });
    const spec = defaultSpecification(s);
    const [x, y] = await Promise.all([
      s.adapter.draw(request(spec)),
      s.adapter.draw(request(spec)),
    ]);
    const ox = await must(Promise.resolve(x));
    const oy = await must(Promise.resolve(y));
    expect(ox.selected_candidate_id).toBe(oy.selected_candidate_id);
    expectOneLawfulDraw(s, SEED_1);
    await s.campaign.close();
  });
});

describe("save → close → load → continue at every durable cut of a draw", () => {
  it("nothing committed: a reload has no draw and a draw proceeds with fresh entropy", async () => {
    const dir = tempDir();
    const s = await seededDrawCampaign(dir);
    await s.campaign.close();
    const r = await reopenDraw(dir, { entropy: seededEntropy(SEED_2) });
    expect(causalDrawFacts(r.campaign.store)).toEqual([]);
    expect((await must(r.adapter.draw(request(defaultSpecification(r))))).disposition).toBe(
      "NEW_DRAW",
    );
    expectOneLawfulDraw(r, SEED_2);
    await r.campaign.close();
  });

  it("precommit committed, result not: it reloads, verifies, and the continuation uses the COMMITTED seed and never samples again", async () => {
    const dir = tempDir();
    const s = await seededDrawCampaign(dir);
    await drawAdapter(crashBefore(s.campaign.store, isResultGroup), s.entropy).draw(
      request(defaultSpecification(s)),
    );
    expect(causalDrawFacts(s.campaign.store)).toHaveLength(1);
    const before = s.campaign.store.getFact(causalDrawPrecommitKey(digestOf(s)))!;
    await s.campaign.close();
    const r = await reopenDraw(dir, { entropy: seededEntropy(SEED_3) });
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.store.getFact(causalDrawPrecommitKey(digestOf(r)))).toEqual(before);
    const out = await must(r.adapter.draw(request(defaultSpecification(r))));
    expect(out.disposition).toBe("RESUMED_PRECOMMIT");
    expect(r.entropy.calls()).toBe(0);
    expectOneLawfulDraw(r, SEED_1);
    await r.campaign.close();
  });

  it("completed: a reload replays the same candidate, and every reload after it, byte for byte", async () => {
    const dir = tempDir();
    const s = await seededDrawCampaign(dir);
    const first = await must(s.adapter.draw(request(defaultSpecification(s))));
    const head = s.campaign.store.head();
    await s.campaign.close();
    for (let i = 0; i < 3; i++) {
      const r = await reopenDraw(dir, { entropy: seededEntropy(SEED_3) });
      expect(r.campaign.verify()).toEqual([]);
      expect(r.campaign.store.head().journal_head_sha256).toBe(head.journal_head_sha256);
      const out = await must(r.adapter.draw(request(defaultSpecification(r))));
      expect(out.selected_candidate_id).toBe(first.selected_candidate_id);
      expect(out.disposition).toBe("REPLAYED_RESULT");
      expect(r.entropy.calls()).toBe(0);
      await r.campaign.close();
    }
  });
});
