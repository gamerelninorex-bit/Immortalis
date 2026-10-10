/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store and read raw fact values */
// A retained COMMITTED NULL-PC choice is believed only while canon's SEALED transaction under that identity carries the retained
// target, continuation branch / lineage and authorized material. A record that merely EXISTS under the same transaction identity
// — a valid restored campaign whose committed material differs — is stale: refused before any prompt, confirmation or write.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { nullAdvance, nullResume, reconcile, status } from "@immortalis/operator";
import { SUNSET_AT, SUNSET_MID } from "../support/gip-sunset.ts";
import { copyCampaign, ctxOf, fixedIds, scriptedTerminal } from "../support/operator.ts";
import {
  LOGISTICS_EXTENSION,
  PROD_T1,
  driveGateways,
  gipSunsetNullTemplate,
  ledgerPath,
  logisticsNullTemplate,
  openNull,
  referenceTransaction,
  stateHash,
} from "../support/operator-null-pc.ts";
import { refuseNullPcDeliveryStage } from "../support/null-pc-advance.ts";
import { REQ_1 } from "@immortalis/testkit";

type Dirs = { campaignDir: string; operatorDir: string };
const ADV = "stale-1";
const RES = "stale-2";
const ADV_TX = `operator-null-advance:${ADV}`;
const adv = (over: Record<string, unknown> = {}) => ({
  ...referenceTransaction("advance", ADV),
  ...over,
});
const res = (over: Record<string, unknown> = {}) => ({
  ...referenceTransaction("resume", RES),
  ...over,
});

let gipTemplate: string;
let logTemplate: string;
beforeAll(async () => {
  gipTemplate = await gipSunsetNullTemplate();
  logTemplate = await logisticsNullTemplate();
}, 180_000);

/** the operator's own run: the retained ledger (and the canon that goes with it) */
async function operatorGip(): Promise<Dirs> {
  const dirs = copyCampaign(gipTemplate);
  const s = await openNull(dirs);
  expect(
    (await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), { target: SUNSET_AT }))
      .status,
  ).toBe("NULL_PC_ADVANCE_COMMITTED");
  await s.close();
  return dirs;
}
async function operatorHeld(resume: boolean): Promise<Dirs> {
  const dirs = copyCampaign(logTemplate);
  const s = await openNull(dirs, LOGISTICS_EXTENSION);
  const restore = refuseNullPcDeliveryStage(s, REQ_1);
  await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), { target: PROD_T1 });
  restore();
  if (resume)
    expect((await nullResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)))).status).toBe(
      "NULL_PC_HELD_ADVANCE_COMMITTED",
    );
  await s.close();
  return dirs;
}

/** the operator's ledger paired with a DIFFERENT, valid campaign (its own history, restored under the ledger) */
const paired = (ledger: Dirs, restored: Dirs): Dirs => ({
  campaignDir: restored.campaignDir,
  operatorDir: ledger.operatorDir,
});

/** both commands refuse as stale before any prompt, and nothing — canon or ledger — moves */
async function expectStale(dirs: Dirs, extension?: typeof LOGISTICS_EXTENSION) {
  const ledgerBefore = readFileSync(ledgerPath(dirs), "utf8");
  const s = await openNull(dirs, extension);
  const hash = stateHash(s);
  const t = scriptedTerminal();
  expect((await nullAdvance(ctxOf(s, t), { target: SUNSET_AT })).status).toBe("STALE_INTENT");
  expect((await nullResume(ctxOf(s, t))).status).toBe("STALE_INTENT");
  expect(t.asked()).toBe(0);
  expect(t.said).toEqual([]);
  expect(stateHash(s)).toBe(hash);
  // nothing is confirmed-and-unreconciled, so there is nothing to reconcile; the retained choice is not rewritten
  expect((await reconcile(ctxOf(s, scriptedTerminal())))[0]!.status).toBe("NOTHING_TO_RECONCILE");
  await s.close();
  expect(readFileSync(ledgerPath(dirs), "utf8")).toBe(ledgerBefore);
}

describe("an INITIAL retained COMMITTED choice against a restored campaign holding the same transaction identity", () => {
  it("control: the very canon the operator committed is believed", async () => {
    const dirs = await operatorGip();
    const s = await openNull(dirs);
    const t = scriptedTerminal();
    // believed: the next command proceeds to its own prompt (declined here) instead of refusing as stale
    expect(
      (await nullAdvance(ctxOf(s, scriptedTerminal("decline")), { target: SUNSET_AT })).status,
    ).toBe("DECLINED");
    expect(t.asked()).toBe(0);
    await s.close();
  }, 120_000);

  it("a different committed target under the same identity is stale", async () => {
    const ledger = await operatorGip();
    const restored = copyCampaign(gipTemplate);
    await driveGateways(restored.campaignDir, undefined, [
      { transaction: adv(), target: SUNSET_MID },
    ]);
    await expectStale(paired(ledger, restored));
  }, 180_000);

  for (const [name, over] of [
    ["cause", { cause: "some-other-cause" }],
    [
      "trigger kind",
      { trigger: { kind: "some-other-trigger", ref: `operator-confirmation:${ADV}` } },
    ],
    ["trigger ref", { trigger: { kind: "operator-null-pc-advance-choice", ref: "elsewhere" } }],
    [
      "publication basis",
      { publication: { basis: "another-basis", secrecy: "local-operator-session" } },
    ],
    [
      "publication secrecy",
      { publication: { basis: "local-operator-confirmed-choice", secrecy: "another" } },
    ],
  ] as const)
    it(`different committed ${name} under the same identity and target is stale`, async () => {
      const ledger = await operatorGip();
      const restored = copyCampaign(gipTemplate);
      await driveGateways(restored.campaignDir, undefined, [
        { transaction: adv(over as Record<string, unknown>), target: SUNSET_AT },
      ]);
      await expectStale(paired(ledger, restored));
    }, 180_000);

  it("a mere footprint is not enough: the identity absent from canon altogether is stale too", async () => {
    const ledger = await operatorGip();
    await expectStale(paired(ledger, copyCampaign(gipTemplate)));
  }, 120_000);
});

describe("a held-resume lineage against restored campaigns holding the same transaction identities", () => {
  it("control: the canon the operator committed (initial hold, then resume) is believed", async () => {
    const dirs = await operatorHeld(true);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    expect(
      (await nullAdvance(ctxOf(s, scriptedTerminal("decline")), { target: PROD_T1 })).status,
    ).toBe("DECLINED");
    await s.close();
  }, 180_000);

  it("the held transaction exists with a different cause: resume is NOT offered (a footprint no longer suffices)", async () => {
    const ledger = await operatorHeld(false);
    const restored = copyCampaign(logTemplate);
    await driveGateways(restored.campaignDir, LOGISTICS_EXTENSION, [
      { transaction: adv({ cause: "some-other-cause" }), target: PROD_T1, hold: true },
    ]);
    // the kernel really does hold a remainder FROM that identity — exactly what the old check accepted
    const probe = await openNull(paired(ledger, restored), LOGISTICS_EXTENSION);
    expect(
      (probe.campaign.store.getFact("temporal/state")!.value as any).continuation,
    ).toMatchObject({
      from_transaction: ADV_TX,
    });
    await probe.close();
    await expectStale(paired(ledger, restored), LOGISTICS_EXTENSION);
  }, 180_000);

  it("the held transaction exists with a different target: stale", async () => {
    const ledger = await operatorHeld(false);
    const restored = copyCampaign(logTemplate);
    // an earlier target that leaves nothing held: the identity exists, sealed, for another request
    await driveGateways(restored.campaignDir, LOGISTICS_EXTENSION, [
      { transaction: adv(), target: { ...PROD_T1, value: PROD_T1.value - 1 } },
    ]);
    await expectStale(paired(ledger, restored), LOGISTICS_EXTENSION);
  }, 180_000);

  it("the resume exists with different committed material (same identity, same lineage): stale", async () => {
    const ledger = await operatorHeld(true);
    const restored = copyCampaign(logTemplate);
    await driveGateways(restored.campaignDir, LOGISTICS_EXTENSION, [
      { transaction: adv(), target: PROD_T1, hold: true },
      { transaction: res({ cause: "some-other-cause" }), target: PROD_T1, from: ADV_TX },
    ]);
    await expectStale(paired(ledger, restored), LOGISTICS_EXTENSION);
  }, 180_000);

  it("the resume exists but continues a DIFFERENT held transaction (another lineage branch): stale", async () => {
    const ledger = await operatorHeld(true);
    const restored = copyCampaign(logTemplate);
    const middle = `operator-null-resume:${RES}-middle`;
    await driveGateways(restored.campaignDir, LOGISTICS_EXTENSION, [
      { transaction: adv(), target: PROD_T1, hold: true },
      // still held: the lineage runs A → middle → RES, whereas the operator retained A → RES
      {
        transaction: { ...referenceTransaction("resume", `${RES}-middle`) },
        target: PROD_T1,
        from: ADV_TX,
        hold: true,
      },
      { transaction: res(), target: PROD_T1, from: middle },
    ]);
    // every record is individually well-formed and the initial one matches the operator's retained choice
    await expectStale(paired(ledger, restored), LOGISTICS_EXTENSION);
  }, 180_000);

  it("the resume's own record matches but its predecessor was not a truthfully unresolved transaction for that target: stale", async () => {
    const ledger = await operatorHeld(true);
    const restored = copyCampaign(logTemplate);
    // the initial transaction completed (no hold) before the resume identity was ever used; the resume identity is then
    // committed as an INITIAL choice (continues null) — the continuation branch differs from the retained resume
    await driveGateways(restored.campaignDir, LOGISTICS_EXTENSION, [
      { transaction: adv(), target: PROD_T1 },
      { transaction: res(), target: { ...PROD_T1, value: PROD_T1.value + 5 } },
    ]);
    await expectStale(paired(ledger, restored), LOGISTICS_EXTENSION);
  }, 180_000);
});

describe("a CONFIRMED (unreconciled) choice whose identity canon holds with different material is never replayed", () => {
  it("reconcile reports STALE_INTENT, calls no gateway, writes nothing, and the choice stays unsettled", async () => {
    // the operator confirmed target SUNSET_AT and crashed before the gateway wrote anything
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    (s.campaign as any).store = new Proxy(s.campaign.store, {
      get(target, prop) {
        if (prop === "commit")
          return async () => ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } });
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    expect(
      (
        await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), {
          target: SUNSET_AT,
        })
      ).status,
    ).toBe("NULL_PC_ADVANCE_OUTCOME_UNKNOWN");
    await s.close();
    // restored under that ledger: a valid campaign that already holds the SAME identity for ANOTHER target
    const restored = copyCampaign(gipTemplate);
    await driveGateways(restored.campaignDir, undefined, [
      { transaction: adv(), target: SUNSET_MID },
    ]);
    const b = await openNull(paired(dirs, restored));
    const hash = stateHash(b);
    expect(status(b).ooc_choices).toEqual([{ kind: "ADVANCE", status: "CONFIRMED" }]);
    const silent = scriptedTerminal();
    expect((await reconcile(ctxOf(b, silent))).map((r) => r.status)).toEqual(["STALE_INTENT"]);
    expect(silent.asked()).toBe(0);
    expect(stateHash(b)).toBe(hash);
    expect(status(b).ooc_choices).toEqual([{ kind: "ADVANCE", status: "CONFIRMED" }]);
    // the session is not ambiguous (nothing was attempted) and a new choice is still refused until this one is settled
    expect((await nullAdvance(ctxOf(b, scriptedTerminal()), { target: SUNSET_AT })).status).toBe(
      "RECONCILIATION_REQUIRED",
    );
    await b.close();
  }, 180_000);
});
