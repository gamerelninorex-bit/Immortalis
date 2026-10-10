/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store to simulate lost replies and refused stages */
// RC-16 recovery for the operator's NULL-PC OOC commands: a lost reply, a crash at every durable cut of the campaign package and
// of the retained intents, an unknown outcome that refuses everything until reopen, and reconciliation by the ORIGINAL identity
// to exactly the canon an uninterrupted run produces — no second transaction, no second GIP expiry, no silent progression.
import { beforeAll, describe, expect, it } from "vitest";
import { nodeFs } from "@immortalis/engine";
import { nullAdvance, nullResume, reconcile, status } from "@immortalis/operator";
import { instrumentFs, REQ_1 } from "@immortalis/testkit";
import { SUNSET_AT } from "../support/gip-sunset.ts";
import { refuseNullPcDeliveryStage } from "../support/null-pc-advance.ts";
import { copyCampaign, copyState, ctxOf, fixedIds, scriptedTerminal } from "../support/operator.ts";
import {
  LOGISTICS_EXTENSION,
  PROD_T1,
  gipSunsetNullTemplate,
  instrumentVersion,
  lifecycleOf,
  logisticsNullTemplate,
  openNull,
  stateHash,
} from "../support/operator-null-pc.ts";

const WHEN = ["before", "after"] as const;
const ADV = "null-1";
const RES = "null-2";
let gipTemplate: string;
let heldDirs: { campaignDir: string; operatorDir: string };
let referenceAdvance: string;
let referenceResume: string;

beforeAll(async () => {
  gipTemplate = await gipSunsetNullTemplate();
  const a = await openNull(copyCampaign(gipTemplate));
  await nullAdvance(ctxOf(a, scriptedTerminal("confirm"), fixedIds(ADV)), { target: SUNSET_AT });
  referenceAdvance = stateHash(a);
  await a.close();

  // a campaign in which the first choice committed a truthful kernel hold (the delivery owner refused through the store)
  const logTemplate = await logisticsNullTemplate();
  heldDirs = copyCampaign(logTemplate);
  const s = await openNull(heldDirs, LOGISTICS_EXTENSION);
  const restore = refuseNullPcDeliveryStage(s, REQ_1);
  await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), { target: PROD_T1 });
  restore();
  await s.close();
  const b = await openNull(copyState(heldDirs), LOGISTICS_EXTENSION);
  await nullResume(ctxOf(b, scriptedTerminal("confirm"), fixedIds(RES)));
  referenceResume = stateHash(b);
  await b.close();
}, 240_000);

describe("lost reply or crash at each durable cut of the NULL-PC advance", () => {
  it("every mutating filesystem operation of the campaign package, before and after: unknown, then reconciled to the uninterrupted canon, GIP expired once", async () => {
    const probe = instrumentFs(nodeFs);
    const s0 = await openNull(copyCampaign(gipTemplate), undefined, { campaignFs: probe.fs });
    const afterOpen = probe.count();
    await nullAdvance(ctxOf(s0, scriptedTerminal("confirm"), fixedIds(ADV)), { target: SUNSET_AT });
    const total = probe.count();
    await s0.close();
    expect(total - afterOpen).toBeGreaterThan(5);

    const seen = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= total; failAt++) {
      for (const when of WHEN) {
        const dirs = copyCampaign(gipTemplate);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openNull(dirs, undefined, { campaignFs: faulty.fs });
        const out = await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), {
          target: SUNSET_AT,
        });
        seen.add(out.status);
        expect(
          ["NULL_PC_ADVANCE_COMMITTED", "NULL_PC_ADVANCE_OUTCOME_UNKNOWN", "UNAVAILABLE"],
          `op ${failAt} ${when}`,
        ).toContain(out.status);
        // an unknown outcome refuses everything but close: nothing is retried in this session
        if (out.status === "NULL_PC_ADVANCE_OUTCOME_UNKNOWN") {
          const t = scriptedTerminal();
          expect((await nullAdvance(ctxOf(s, t), { target: SUNSET_AT })).status).toBe(
            "RECONCILIATION_REQUIRED",
          );
          expect((await nullResume(ctxOf(s, t))).status).toBe("RECONCILIATION_REQUIRED");
          expect(t.asked()).toBe(0);
        }
        await s.close().catch(() => undefined);
        const b = await openNull(dirs);
        if (status(b).ooc_choices.length === 0)
          expect(
            (
              await nullAdvance(ctxOf(b, scriptedTerminal("confirm"), fixedIds(ADV)), {
                target: SUNSET_AT,
              })
            ).status,
          ).toBe("NULL_PC_ADVANCE_COMMITTED");
        else {
          const silent = scriptedTerminal();
          await reconcile(ctxOf(b, silent));
          expect(silent.asked()).toBe(0);
        }
        expect(stateHash(b), `op ${failAt} ${when}`).toBe(referenceAdvance);
        expect(lifecycleOf(b)).toBe("expired");
        expect(status(b).ooc_choices).toEqual([{ kind: "ADVANCE", status: "COMMITTED" }]);
        await b.close();
      }
    }
    expect(seen.has("NULL_PC_ADVANCE_OUTCOME_UNKNOWN")).toBe(true);
  }, 900_000);

  it("both durable writes of the retained intents, before and after", async () => {
    for (const failAt of [1, 2]) {
      for (const when of WHEN) {
        const dirs = copyCampaign(gipTemplate);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openNull(dirs, undefined, { ledgerFs: faulty.fs });
        const out = await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), {
          target: SUNSET_AT,
        });
        expect(
          ["NULL_PC_ADVANCE_COMMITTED", "NULL_PC_ADVANCE_OUTCOME_UNKNOWN", "UNAVAILABLE"],
          `ledger op ${failAt} ${when}`,
        ).toContain(out.status);
        await s.close();
        const b = await openNull(dirs);
        if (status(b).ooc_choices.length === 0)
          await nullAdvance(ctxOf(b, scriptedTerminal("confirm"), fixedIds(ADV)), {
            target: SUNSET_AT,
          });
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(stateHash(b), `ledger op ${failAt} ${when}`).toBe(referenceAdvance);
        expect(status(b).ooc_choices).toEqual([{ kind: "ADVANCE", status: "COMMITTED" }]);
        await b.close();
      }
    }
  }, 300_000);

  it("a reply lost after the gateway committed leaves the intent CONFIRMED; reconcile replays by identity and never asks again", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    const real = s.campaign.store;
    // commit every group, but report the kernel's transaction record (the last group) as an unknown outcome
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async (g: any) => {
            const r = await target.commit(g);
            return g.writes.some((w: any) => w.key.startsWith("temporal/transaction/"))
              ? { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } }
              : r;
          };
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    const out = await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), {
      target: SUNSET_AT,
    });
    expect(out.status).toBe("NULL_PC_ADVANCE_OUTCOME_UNKNOWN");
    expect(status(s).ooc_choices).toEqual([{ kind: "ADVANCE", status: "CONFIRMED" }]);
    await s.close();

    const b = await openNull(dirs);
    // a new choice is refused until the confirmed one is reconciled
    const t = scriptedTerminal();
    expect((await nullAdvance(ctxOf(b, t), { target: SUNSET_AT })).status).toBe(
      "RECONCILIATION_REQUIRED",
    );
    expect(t.asked()).toBe(0);
    const v = instrumentVersion(b);
    const results = await reconcile(ctxOf(b, scriptedTerminal()));
    expect(results.map((r) => r.status)).toEqual(["NULL_PC_ADVANCE_COMMITTED"]);
    expect(instrumentVersion(b)).toBe(v);
    expect(stateHash(b)).toBe(referenceAdvance);
    // reconciling again is a no-op
    expect((await reconcile(ctxOf(b, scriptedTerminal())))[0]!.status).toBe("NOTHING_TO_RECONCILE");
    await b.close();
  }, 120_000);
});

describe("lost reply or crash at each durable cut of the held-lineage resume", () => {
  it("every mutating filesystem operation of the campaign package, before and after, reconciles to the uninterrupted resume", async () => {
    const probe = instrumentFs(nodeFs);
    const s0 = await openNull(copyState(heldDirs), LOGISTICS_EXTENSION, { campaignFs: probe.fs });
    const afterOpen = probe.count();
    await nullResume(ctxOf(s0, scriptedTerminal("confirm"), fixedIds(RES)));
    const total = probe.count();
    await s0.close();
    expect(total - afterOpen).toBeGreaterThan(5);

    const seen = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= total; failAt++) {
      for (const when of WHEN) {
        const dirs = copyState(heldDirs);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openNull(dirs, LOGISTICS_EXTENSION, { campaignFs: faulty.fs });
        const out = await nullResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)));
        seen.add(out.status);
        expect(
          ["NULL_PC_HELD_ADVANCE_COMMITTED", "NULL_PC_HELD_ADVANCE_OUTCOME_UNKNOWN", "UNAVAILABLE"],
          `op ${failAt} ${when}`,
        ).toContain(out.status);
        await s.close().catch(() => undefined);
        const b = await openNull(dirs, LOGISTICS_EXTENSION);
        if (status(b).ooc_choices.length === 1)
          expect(
            (await nullResume(ctxOf(b, scriptedTerminal("confirm"), fixedIds(RES)))).status,
          ).toBe("NULL_PC_HELD_ADVANCE_COMMITTED");
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(stateHash(b), `op ${failAt} ${when}`).toBe(referenceResume);
        expect(status(b).ooc_choices).toEqual([
          { kind: "ADVANCE", status: "COMMITTED" },
          { kind: "RESUME", status: "COMMITTED" },
        ]);
        await b.close();
      }
    }
    expect(seen.has("NULL_PC_HELD_ADVANCE_OUTCOME_UNKNOWN")).toBe(true);
  }, 900_000);

  it("both durable writes of the retained intents, before and after", async () => {
    for (const failAt of [1, 2]) {
      for (const when of WHEN) {
        const dirs = copyState(heldDirs);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openNull(dirs, LOGISTICS_EXTENSION, { ledgerFs: faulty.fs });
        await nullResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)));
        await s.close();
        const b = await openNull(dirs, LOGISTICS_EXTENSION);
        if (status(b).ooc_choices.length === 1)
          await nullResume(ctxOf(b, scriptedTerminal("confirm"), fixedIds(RES)));
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(stateHash(b), `ledger op ${failAt} ${when}`).toBe(referenceResume);
        await b.close();
      }
    }
  }, 300_000);

  it("a confirmed-but-unreconciled resume is never repeated by a reopen, a status or a new choice: only reconcile finishes it, by its original identity", async () => {
    const dirs = copyState(heldDirs);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const real = s.campaign.store;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async () => ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } });
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    expect((await nullResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)))).status).toBe(
      "NULL_PC_HELD_ADVANCE_OUTCOME_UNKNOWN",
    );
    await s.close();
    const b = await openNull(dirs, LOGISTICS_EXTENSION);
    const held = stateHash(b);
    expect(status(b).ooc_choices.at(-1)).toEqual({ kind: "RESUME", status: "CONFIRMED" });
    const t = scriptedTerminal();
    expect((await nullResume(ctxOf(b, t))).status).toBe("RECONCILIATION_REQUIRED");
    expect((await nullAdvance(ctxOf(b, t), { target: PROD_T1 })).status).toBe(
      "RECONCILIATION_REQUIRED",
    );
    expect(stateHash(b)).toBe(held);
    expect(t.asked()).toBe(0);
    expect((await reconcile(ctxOf(b, t))).map((r) => r.status)).toEqual([
      "NULL_PC_HELD_ADVANCE_COMMITTED",
    ]);
    expect(stateHash(b)).toBe(referenceResume);
    await b.close();
  }, 120_000);
});
