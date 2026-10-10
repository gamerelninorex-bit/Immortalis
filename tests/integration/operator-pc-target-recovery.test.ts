/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store to simulate lost replies and refused stages */
// RC-16 recovery for the operator's ACTIVE-PC target commands: a lost reply, a crash at every durable cut of the campaign package
// and of the retained intents, an unknown outcome that refuses everything until reopen, and reconciliation by the ORIGINAL identity
// to exactly the canon an uninterrupted run produces — no second transaction, no second GIP expiry, no silent progression.
import { beforeAll, describe, expect, it } from "vitest";
import { nodeFs } from "@immortalis/engine";
import { pcTargetAdvance, pcTargetResume, reconcile, status } from "@immortalis/operator";
import { instrumentFs } from "@immortalis/testkit";
import { SUNSET_LATER } from "../support/gip-sunset.ts";
import { copyCampaign, copyState, ctxOf, fixedIds, openSession } from "../support/operator.ts";
import { scriptedTerminal } from "../support/operator.ts";
import { refuseGipStageOf } from "../support/pc-target-advance.ts";
import {
  gipSunsetPcTemplate,
  instrumentVersion,
  lifecycleOf,
  stateHash,
} from "../support/operator-pc-target.ts";

const WHEN = ["before", "after"] as const;
const ADV = "pc-1";
const RES = "pc-2";
const TARGET = { target: SUNSET_LATER };
let gipTemplate: string;
let heldDirs: { campaignDir: string; operatorDir: string };
let referenceAdvance: string;
let referenceResume: string;

beforeAll(async () => {
  gipTemplate = await gipSunsetPcTemplate();
  const a = await openSession(copyCampaign(gipTemplate));
  await pcTargetAdvance(ctxOf(a, scriptedTerminal("confirm"), fixedIds(ADV)), TARGET);
  referenceAdvance = stateHash(a);
  await a.close();

  // a campaign in which the first choice committed a truthful kernel hold (GIP's stage refused through the store)
  heldDirs = copyCampaign(gipTemplate);
  const s = await openSession(heldDirs);
  const restore = refuseGipStageOf(s);
  await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), TARGET);
  restore();
  await s.close();
  const b = await openSession(copyState(heldDirs));
  await pcTargetResume(ctxOf(b, scriptedTerminal("confirm"), fixedIds(RES)));
  referenceResume = stateHash(b);
  await b.close();
}, 240_000);

describe("lost reply or crash at each durable cut of the active-PC target advance", () => {
  it("every mutating filesystem operation of the campaign package, before and after: unknown, then reconciled to the uninterrupted canon, GIP expired once", async () => {
    const probe = instrumentFs(nodeFs);
    const s0 = await openSession(copyCampaign(gipTemplate), { campaignFs: probe.fs });
    const afterOpen = probe.count();
    await pcTargetAdvance(ctxOf(s0, scriptedTerminal("confirm"), fixedIds(ADV)), TARGET);
    const total = probe.count();
    await s0.close();
    expect(total - afterOpen).toBeGreaterThan(5);

    const seen = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= total; failAt++) {
      for (const when of WHEN) {
        const dirs = copyCampaign(gipTemplate);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openSession(dirs, { campaignFs: faulty.fs });
        const out = await pcTargetAdvance(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
          TARGET,
        );
        seen.add(out.status);
        expect(
          ["PC_TARGET_ADVANCE_COMMITTED", "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN", "UNAVAILABLE"],
          `op ${failAt} ${when}`,
        ).toContain(out.status);
        // an unknown outcome refuses everything but close: nothing is retried in this session
        if (out.status === "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN") {
          const t = scriptedTerminal();
          expect((await pcTargetAdvance(ctxOf(s, t), TARGET)).status).toBe(
            "RECONCILIATION_REQUIRED",
          );
          expect((await pcTargetResume(ctxOf(s, t))).status).toBe("RECONCILIATION_REQUIRED");
          expect(t.asked()).toBe(0);
        }
        await s.close().catch(() => undefined);
        const b = await openSession(dirs);
        if (status(b).pc_target_choices.length === 0)
          expect(
            (await pcTargetAdvance(ctxOf(b, scriptedTerminal("confirm"), fixedIds(ADV)), TARGET))
              .status,
          ).toBe("PC_TARGET_ADVANCE_COMMITTED");
        else {
          const silent = scriptedTerminal();
          await reconcile(ctxOf(b, silent));
          expect(silent.asked()).toBe(0);
        }
        expect(stateHash(b), `op ${failAt} ${when}`).toBe(referenceAdvance);
        expect(lifecycleOf(b)).toBe("expired");
        expect(status(b).pc_target_choices).toEqual([{ kind: "ADVANCE", status: "COMMITTED" }]);
        await b.close();
      }
    }
    expect(seen.has("PC_TARGET_ADVANCE_OUTCOME_UNKNOWN")).toBe(true);
  }, 900_000);

  it("both durable writes of the retained intents, before and after", async () => {
    for (const failAt of [1, 2]) {
      for (const when of WHEN) {
        const dirs = copyCampaign(gipTemplate);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openSession(dirs, { ledgerFs: faulty.fs });
        const out = await pcTargetAdvance(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
          TARGET,
        );
        expect(
          ["PC_TARGET_ADVANCE_COMMITTED", "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN", "UNAVAILABLE"],
          `ledger op ${failAt} ${when}`,
        ).toContain(out.status);
        await s.close();
        const b = await openSession(dirs);
        if (status(b).pc_target_choices.length === 0)
          await pcTargetAdvance(ctxOf(b, scriptedTerminal("confirm"), fixedIds(ADV)), TARGET);
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(stateHash(b), `ledger op ${failAt} ${when}`).toBe(referenceAdvance);
        expect(status(b).pc_target_choices).toEqual([{ kind: "ADVANCE", status: "COMMITTED" }]);
        await b.close();
      }
    }
  }, 300_000);

  it("a crash that commits nothing leaves the intent CONFIRMED; reopen, status and a new choice never repeat it: only reconcile finishes it, by its original identity", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    const real = s.campaign.store;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async () => ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } });
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    expect(
      (await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), TARGET)).status,
    ).toBe("PC_TARGET_ADVANCE_OUTCOME_UNKNOWN");
    await s.close();

    const b = await openSession(dirs);
    const before = stateHash(b);
    expect(lifecycleOf(b)).toBe("active");
    expect(status(b).pc_target_choices).toEqual([{ kind: "ADVANCE", status: "CONFIRMED" }]);
    const t = scriptedTerminal();
    expect((await pcTargetAdvance(ctxOf(b, t), TARGET)).status).toBe("RECONCILIATION_REQUIRED");
    expect(stateHash(b)).toBe(before);
    expect(t.asked()).toBe(0);
    expect((await reconcile(ctxOf(b, t))).map((r) => r.status)).toEqual([
      "PC_TARGET_ADVANCE_COMMITTED",
    ]);
    expect(stateHash(b)).toBe(referenceAdvance);
    expect(instrumentVersion(b)).toBe(2);
    await b.close();
  }, 120_000);
});

describe("lost reply or crash at each durable cut of the held-lineage resume", () => {
  it("every mutating filesystem operation of the campaign package, before and after, reconciles to the uninterrupted resume", async () => {
    const probe = instrumentFs(nodeFs);
    const s0 = await openSession(copyState(heldDirs), { campaignFs: probe.fs });
    const afterOpen = probe.count();
    await pcTargetResume(ctxOf(s0, scriptedTerminal("confirm"), fixedIds(RES)));
    const total = probe.count();
    await s0.close();
    expect(total - afterOpen).toBeGreaterThan(5);

    const seen = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= total; failAt++) {
      for (const when of WHEN) {
        const dirs = copyState(heldDirs);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openSession(dirs, { campaignFs: faulty.fs });
        const out = await pcTargetResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)));
        seen.add(out.status);
        expect(
          ["PC_TARGET_ADVANCE_COMMITTED", "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN", "UNAVAILABLE"],
          `op ${failAt} ${when}`,
        ).toContain(out.status);
        await s.close().catch(() => undefined);
        const b = await openSession(dirs);
        if (status(b).pc_target_choices.length === 1)
          expect(
            (await pcTargetResume(ctxOf(b, scriptedTerminal("confirm"), fixedIds(RES)))).status,
          ).toBe("PC_TARGET_ADVANCE_COMMITTED");
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(stateHash(b), `op ${failAt} ${when}`).toBe(referenceResume);
        expect(status(b).pc_target_choices).toEqual([
          { kind: "ADVANCE", status: "COMMITTED" },
          { kind: "RESUME", status: "COMMITTED" },
        ]);
        await b.close();
      }
    }
    expect(seen.has("PC_TARGET_ADVANCE_OUTCOME_UNKNOWN")).toBe(true);
  }, 900_000);

  it("both durable writes of the retained intents, before and after", async () => {
    for (const failAt of [1, 2]) {
      for (const when of WHEN) {
        const dirs = copyState(heldDirs);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openSession(dirs, { ledgerFs: faulty.fs });
        await pcTargetResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)));
        await s.close();
        const b = await openSession(dirs);
        if (status(b).pc_target_choices.length === 1)
          await pcTargetResume(ctxOf(b, scriptedTerminal("confirm"), fixedIds(RES)));
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(stateHash(b), `ledger op ${failAt} ${when}`).toBe(referenceResume);
        await b.close();
      }
    }
  }, 300_000);

  it("a confirmed-but-unreconciled resume is never repeated by a reopen, a status or a new choice: only reconcile finishes it, by its original identity", async () => {
    const dirs = copyState(heldDirs);
    const s = await openSession(dirs);
    const real = s.campaign.store;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async () => ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } });
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    expect(
      (await pcTargetResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)))).status,
    ).toBe("PC_TARGET_ADVANCE_OUTCOME_UNKNOWN");
    await s.close();
    const b = await openSession(dirs);
    const held = stateHash(b);
    expect(status(b).pc_target_choices.at(-1)).toEqual({ kind: "RESUME", status: "CONFIRMED" });
    const t = scriptedTerminal();
    expect((await pcTargetResume(ctxOf(b, t))).status).toBe("RECONCILIATION_REQUIRED");
    expect((await pcTargetAdvance(ctxOf(b, t), TARGET)).status).toBe("RECONCILIATION_REQUIRED");
    expect(stateHash(b)).toBe(held);
    expect(t.asked()).toBe(0);
    expect((await reconcile(ctxOf(b, t))).map((r) => r.status)).toEqual([
      "PC_TARGET_ADVANCE_COMMITTED",
    ]);
    expect(stateHash(b)).toBe(referenceResume);
    await b.close();
  }, 120_000);
});
