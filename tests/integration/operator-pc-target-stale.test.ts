/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store and read raw fact values */
// A retained COMMITTED active-PC target choice is believed only while canon's SEALED transaction under that identity carries the
// retained target, continuation branch / lineage and authorized material, for the very character it was confirmed for. A record
// that merely EXISTS under the same transaction identity — a valid restored campaign whose committed material differs — is stale:
// refused before any prompt, confirmation or write; and a ledger naming another character is refused too.
import { readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  LocalOperatorSession,
  pcTargetAdvance,
  pcTargetResume,
  reconcile,
  status,
} from "@immortalis/operator";
import { ACTOR_FIXTURE_EXTENSION, FIXTURE_CAMPAIGN } from "@immortalis/testkit";
import { SUNSET_LATER, SUNSET_MID } from "../support/gip-sunset.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import { refuseGipStageOf } from "../support/pc-target-advance.ts";
import {
  driveGateway,
  gipSunsetPcTemplate,
  ledgerPath,
  readLedger,
  referenceTransaction,
  stateHash,
} from "../support/operator-pc-target.ts";

type Dirs = { campaignDir: string; operatorDir: string };
const ADV = "stale-1";
const RES = "stale-2";
const ADV_TX = `operator-pc-target-advance:${ADV}`;
const adv = (over: Record<string, unknown> = {}) => ({
  ...referenceTransaction("advance", ADV),
  ...over,
});
const res = (over: Record<string, unknown> = {}) => ({
  ...referenceTransaction("resume", RES),
  ...over,
});
const TARGET = { target: SUNSET_LATER };

let gipTemplate: string;
beforeAll(async () => {
  gipTemplate = await gipSunsetPcTemplate(SUNSET_MID);
}, 180_000);

/** the operator's own run: the retained ledger (and the canon that goes with it) */
async function operatorRun(resume: boolean): Promise<Dirs> {
  const dirs = copyCampaign(gipTemplate);
  const s = await openSession(dirs);
  if (resume) {
    const restore = refuseGipStageOf(s);
    await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), TARGET);
    restore();
    expect(
      (await pcTargetResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)))).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
  } else {
    expect(
      (await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), TARGET)).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
  }
  await s.close();
  return dirs;
}

/** the operator's ledger paired with a DIFFERENT, valid campaign (its own history, restored under the ledger) */
const paired = (ledger: Dirs, restored: Dirs): Dirs => ({
  campaignDir: restored.campaignDir,
  operatorDir: ledger.operatorDir,
});

/** both commands refuse as stale before any prompt, and nothing — canon or ledger — moves */
async function expectStale(dirs: Dirs) {
  const ledgerBefore = readFileSync(ledgerPath(dirs), "utf8");
  const s = await openSession(dirs);
  const hash = stateHash(s);
  const t = scriptedTerminal();
  expect((await pcTargetAdvance(ctxOf(s, t), TARGET)).status).toBe("STALE_INTENT");
  expect((await pcTargetResume(ctxOf(s, t))).status).toBe("STALE_INTENT");
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
    const dirs = await operatorRun(false);
    const s = await openSession(dirs);
    // believed: the next command proceeds to its own prompt (declined here) instead of refusing as stale
    expect((await pcTargetAdvance(ctxOf(s, scriptedTerminal("decline")), TARGET)).status).toBe(
      "DECLINED",
    );
    await s.close();
  }, 120_000);

  it("a different committed target under the same identity is stale", async () => {
    const ledger = await operatorRun(false);
    const restored = copyCampaign(gipTemplate);
    await driveGateway(restored.campaignDir, [{ transaction: adv(), target: SUNSET_MID }]);
    await expectStale(paired(ledger, restored));
  }, 180_000);

  for (const [name, over] of [
    ["cause", { cause: "some-other-cause" }],
    [
      "trigger kind",
      { trigger: { kind: "some-other-trigger", ref: `operator-confirmation:${ADV}` } },
    ],
    ["trigger ref", { trigger: { kind: "operator-pc-target-advance-choice", ref: "elsewhere" } }],
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
      const ledger = await operatorRun(false);
      const restored = copyCampaign(gipTemplate);
      await driveGateway(restored.campaignDir, [
        { transaction: adv(over as Record<string, unknown>), target: SUNSET_LATER },
      ]);
      await expectStale(paired(ledger, restored));
    }, 180_000);

  it("a mere footprint is not enough: the identity absent from canon altogether is stale too", async () => {
    const ledger = await operatorRun(false);
    await expectStale(paired(ledger, copyCampaign(gipTemplate)));
  }, 120_000);
});

describe("a held-resume lineage against restored campaigns holding the same transaction identities", () => {
  it("control: the canon the operator committed (initial hold, then resume) is believed", async () => {
    const dirs = await operatorRun(true);
    const s = await openSession(dirs);
    expect((await pcTargetAdvance(ctxOf(s, scriptedTerminal("decline")), TARGET)).status).toBe(
      "DECLINED",
    );
    await s.close();
  }, 180_000);

  it("the resume exists with different committed material (same identity, same lineage): stale", async () => {
    const ledger = await operatorRun(true);
    const restored = copyCampaign(gipTemplate);
    await driveGateway(restored.campaignDir, [
      { transaction: adv(), target: SUNSET_LATER, hold: true },
      { transaction: res({ cause: "some-other-cause" }), target: SUNSET_LATER, from: ADV_TX },
    ]);
    await expectStale(paired(ledger, restored));
  }, 180_000);

  it("the resume exists but continues a DIFFERENT held transaction (another lineage branch): stale", async () => {
    const ledger = await operatorRun(true);
    const restored = copyCampaign(gipTemplate);
    const middle = `operator-pc-target-resume:${RES}-middle`;
    await driveGateway(restored.campaignDir, [
      { transaction: adv(), target: SUNSET_LATER, hold: true },
      // still held: the lineage runs A → middle → RES, whereas the operator retained A → RES
      {
        transaction: referenceTransaction("resume", `${RES}-middle`),
        target: SUNSET_LATER,
        from: ADV_TX,
        hold: true,
      },
      { transaction: res(), target: SUNSET_LATER, from: middle },
    ]);
    await expectStale(paired(ledger, restored));
  }, 180_000);

  it("the resume identity is committed as an INITIAL choice in the restored campaign (the continuation branch differs): stale", async () => {
    const ledger = await operatorRun(true);
    const restored = copyCampaign(gipTemplate);
    await driveGateway(restored.campaignDir, [
      { transaction: adv(), target: SUNSET_LATER },
      { transaction: res(), target: { ...SUNSET_LATER, value: SUNSET_LATER.value + 5 } },
    ]);
    await expectStale(paired(ledger, restored));
  }, 180_000);
});

describe("the retained choice belongs to the character it was confirmed for", () => {
  it("a ledger naming another character is refused as stale before any prompt", async () => {
    const dirs = await operatorRun(false);
    const file = readLedger(dirs);
    file.intents[0].pc_id = "actor-other";
    writeFileSync(ledgerPath(dirs), JSON.stringify(file, null, 2));
    const s = await openSession(dirs);
    const t = scriptedTerminal();
    expect((await pcTargetAdvance(ctxOf(s, t), TARGET)).status).toBe("STALE_INTENT");
    expect(t.asked()).toBe(0);
    await s.close();
  }, 120_000);

  it("a ledger whose lineage the trusted side could not have confirmed is refused when the session opens", async () => {
    const dirs = await operatorRun(true);
    const file = readLedger(dirs);
    // a resume that continues a transaction no retained choice has
    file.intents[1].held.from_transaction = "operator-pc-target-advance:never-confirmed";
    writeFileSync(ledgerPath(dirs), JSON.stringify(file, null, 2));
    const opened = await LocalOperatorSession.open({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      expectedCampaignId: FIXTURE_CAMPAIGN,
      extension: ACTOR_FIXTURE_EXTENSION,
    });
    expect(opened.ok).toBe(false);

    // a resume carrying a different character than the choice it continues
    const dirs2 = await operatorRun(true);
    const file2 = readLedger(dirs2);
    file2.intents[1].pc_id = "actor-other";
    writeFileSync(ledgerPath(dirs2), JSON.stringify(file2, null, 2));
    expect(
      (
        await LocalOperatorSession.open({
          campaignDir: dirs2.campaignDir,
          operatorDir: dirs2.operatorDir,
          expectedCampaignId: FIXTURE_CAMPAIGN,
          extension: ACTOR_FIXTURE_EXTENSION,
        })
      ).ok,
    ).toBe(false);
  }, 240_000);
});

describe("a CONFIRMED (unreconciled) choice whose identity canon holds with different material is never replayed", () => {
  it("reconcile reports STALE_INTENT, calls no gateway, writes nothing, and the choice stays unsettled", async () => {
    // the operator confirmed the target and crashed before the gateway wrote anything
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    (s.campaign as any).store = new Proxy(s.campaign.store, {
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
    // restored under that ledger: a valid campaign that already holds the SAME identity for ANOTHER target
    const restored = copyCampaign(gipTemplate);
    await driveGateway(restored.campaignDir, [{ transaction: adv(), target: SUNSET_MID }]);
    const b = await openSession(paired(dirs, restored));
    const hash = stateHash(b);
    expect(status(b).pc_target_choices).toEqual([{ kind: "ADVANCE", status: "CONFIRMED" }]);
    const silent = scriptedTerminal();
    expect((await reconcile(ctxOf(b, silent))).map((r) => r.status)).toEqual(["STALE_INTENT"]);
    expect(silent.asked()).toBe(0);
    expect(stateHash(b)).toBe(hash);
    expect(status(b).pc_target_choices).toEqual([{ kind: "ADVANCE", status: "CONFIRMED" }]);
    // a new choice is still refused until this one is settled
    expect((await pcTargetAdvance(ctxOf(b, scriptedTerminal()), TARGET)).status).toBe(
      "RECONCILIATION_REQUIRED",
    );
    await b.close();
  }, 180_000);
});
