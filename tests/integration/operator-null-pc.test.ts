/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign's store to refuse a stage */
// The local operator's NULL-PC OOC commands over the REAL owners: ONE explicit target-only advance, and — separately and anew —
// ONE explicit choice to resume the remainder the kernel held. Positive GIP sunset witness (independently committed `active`
// Instrument, expired only by GIP's own provider at the earned boundary) against a before-boundary negative contrast; a real
// kernel-held `DEPENDENCY_UNRESOLVED` lineage recovered by a NEW confirmation. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED); no remote authentication, observer disclosure or narration is implemented or claimed.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  logisticsDeliveryKey,
  logisticsTransferKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  worldEntityTransitionKey,
} from "@immortalis/contracts";
import {
  LocalOperatorSession,
  advance,
  ledgerFileName,
  nullAdvance,
  nullResume,
  reconcile,
  relocate,
  status,
} from "@immortalis/operator";
import { FIXTURE_CAMPAIGN, FIXTURE_WORLD_ID, REQ_1 } from "@immortalis/testkit";
import { entityIdOf } from "../support/logistics.ts";
import { refuseNullPcDeliveryStage } from "../support/null-pc-advance.ts";
import { SUNSET_AT, SUNSET_LATER, SUNSET_MID, at } from "../support/gip-sunset.ts";
import {
  copyCampaign,
  ctxOf,
  fixedIds,
  RELOCATE_INPUT,
  openSession,
  scriptedTerminal,
  seedTemplate,
} from "../support/operator.ts";
import {
  LOGISTICS_EXTENSION,
  PROD_T1,
  gipSunsetNullTemplate,
  instrumentVersion,
  lifecycleOf,
  logisticsNullTemplate,
  nullSessionParams,
  openNull,
  readLedger,
  referenceNull,
  stateHash,
} from "../support/operator-null-pc.ts";

let gipTemplate: string;
let logTemplate: string;
const entity = entityIdOf(REQ_1);
const ADV = "null-1";
const ADV_TX = `operator-null-advance:${ADV}`;
const RES = "null-2";
const RES_TX = `operator-null-resume:${RES}`;
const RES3 = "null-3";
const RES3_TX = `operator-null-resume:${RES3}`;

beforeAll(async () => {
  gipTemplate = await gipSunsetNullTemplate();
  logTemplate = await logisticsNullTemplate();
}, 180_000);

const advanceTo = (target: { unit: string; value: number }) => ({ target });

describe("the GIP sunset: independently grounded positive against the before-boundary contrast", () => {
  it("a pre-existing committed `active` Instrument is expired by GIP's own provider only when the chosen target reaches its earned sunset", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    // the independently established cause: an ACTIVE Instrument, the campaign at SUNSET_START, no active character
    expect(lifecycleOf(s)).toBe("active");
    expect(s.campaign.binding()).toBeUndefined();
    const v0 = instrumentVersion(s);
    const t = scriptedTerminal("confirm");
    const out = await nullAdvance(ctxOf(s, t, fixedIds(ADV)), advanceTo(SUNSET_AT));
    expect(out.status).toBe("NULL_PC_ADVANCE_COMMITTED");
    // the owner's own transition, never the operator's: a new version of GIP's own slot, written inside the kernel's transaction
    expect(lifecycleOf(s)).toBe("expired");
    expect(instrumentVersion(s)).toBe(v0 + 1);
    const tx = s.campaign.store.getFact(temporalTransactionKey(ADV_TX))!.value as any;
    expect(tx.requested).toEqual({ target: SUNSET_AT, condition: null });
    expect(tx.continues).toBeNull();
    expect(tx.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(tx.context).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
    // the instrument was written by the stage under that transaction's authority, not by a raw operator write
    expect(s.campaign.store.getFact(temporalTransactionAuthorityKey(ADV_TX))).toBeDefined();
    expect(status(s)).toMatchObject({ ooc_choices: [{ kind: "ADVANCE", status: "COMMITTED" }] });
    // the console named the exact target and a transaction status only
    const shown = [...t.said, out.message].join("\n");
    expect(shown).toMatch(/exactly 200 \S+/);
    expect(shown).not.toMatch(/expired|sunset|lifecycle|gip|DEPENDENCY|operator-null|sha256/i);
    await s.close();
  }, 120_000);

  it("a target BEYOND the earned boundary also expires it once, at the boundary, and time reaches the chosen target", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    expect(
      (
        await nullAdvance(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
          advanceTo(SUNSET_LATER),
        )
      ).status,
    ).toBe("NULL_PC_ADVANCE_COMMITTED");
    expect(lifecycleOf(s)).toBe("expired");
    const state = s.campaign.store.getFact("temporal/state")!.value as any;
    expect(state.canonical_time).toEqual(SUNSET_LATER);
    expect(state.continuation).toBeNull();
    await s.close();
  }, 120_000);

  it("NEGATIVE contrast: the SAME Instrument, a valid target BEFORE its earned boundary — nothing expires, nothing is written to GIP", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    const v0 = instrumentVersion(s);
    const out = await nullAdvance(
      ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
      advanceTo(SUNSET_MID),
    );
    expect(out.status).toBe("NULL_PC_ADVANCE_COMMITTED");
    expect(lifecycleOf(s)).toBe("active");
    expect(instrumentVersion(s)).toBe(v0);
    const state = s.campaign.store.getFact("temporal/state")!.value as any;
    expect(state.canonical_time).toEqual(SUNSET_MID);
    // the sunset is still earned and pending: a LATER, separately chosen target reaches it
    expect(
      (
        await nullAdvance(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("null-later")),
          advanceTo(SUNSET_AT),
        )
      ).status,
    ).toBe("NULL_PC_ADVANCE_COMMITTED");
    expect(lifecycleOf(s)).toBe("expired");
    expect(status(s).ooc_choices).toEqual([
      { kind: "ADVANCE", status: "COMMITTED" },
      { kind: "ADVANCE", status: "COMMITTED" },
    ]);
    await s.close();
  }, 120_000);

  it("is fact-for-fact the unchanged gateway driven directly with the same material: the operator adds nothing and omits nothing", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(SUNSET_AT));
    const operatorHash = stateHash(s);
    await s.close();
    const ref = copyCampaign(gipTemplate);
    expect(
      await referenceNull(ref, undefined, [{ kind: "advance", uid: ADV, target: SUNSET_AT }]),
    ).toBe(operatorHash);
  }, 120_000);

  it("writes only the owners' own fact families: GIP's Instrument slot and the kernel's transaction records", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    const before = new Map(s.campaign.store.listFacts().map((f) => [f.key, f.version]));
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(SUNSET_AT));
    const changed = s.campaign.store
      .listFacts()
      .filter((f) => before.get(f.key) !== f.version)
      .map((f) => f.key);
    const allowed = [
      /^gip\/instrument\//,
      /^temporal\/(state|transaction\/|transaction-authority\/|boundary-index|object\/|stage\/)/,
    ];
    expect(changed.length).toBeGreaterThan(2);
    for (const key of changed)
      expect(
        allowed.some((r) => r.test(key)),
        key,
      ).toBe(true);
    await s.close();
  }, 120_000);

  it("replay by identity changes nothing: reconcile after the commit is NOTHING_TO_RECONCILE, a reopen replays the same identity without a second effect", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(SUNSET_AT));
    const hash = stateHash(s);
    const silent = scriptedTerminal();
    expect((await reconcile(ctxOf(s, silent)))[0]!.status).toBe("NOTHING_TO_RECONCILE");
    expect(silent.asked()).toBe(0);
    await s.close();
    const b = await openNull(dirs);
    expect(stateHash(b)).toBe(hash);
    expect(lifecycleOf(b)).toBe("expired");
    expect(status(b)).toMatchObject({ ooc_choices: [{ kind: "ADVANCE", status: "COMMITTED" }] });
    // a second, separately confirmed choice to the same instant is a distinct transaction; GIP is not expired a second time
    const v = instrumentVersion(b);
    expect(
      (
        await nullAdvance(
          ctxOf(b, scriptedTerminal("confirm"), fixedIds("null-again")),
          advanceTo(SUNSET_AT),
        )
      ).status,
    ).toBe("NULL_PC_ADVANCE_COMMITTED");
    expect(instrumentVersion(b)).toBe(v);
    expect(lifecycleOf(b)).toBe("expired");
    await b.close();
  }, 120_000);
});

describe("refusals: no owner write, no leak, no silent progression", () => {
  const untouched = async (
    dirs: ReturnType<typeof copyCampaign>,
    attempt: (s: Awaited<ReturnType<typeof openNull>>) => Promise<string>,
    expected: string,
  ) => {
    const s = await openNull(dirs);
    const hash = stateHash(s);
    expect(await attempt(s)).toBe(expected);
    expect(stateHash(s)).toBe(hash);
    expect(lifecycleOf(s)).toBe("active");
    await s.close();
  };

  it("declined, mistyped, wrong-verb, stale, pre-typed and absent confirmations change nothing and retain nothing", async () => {
    const dirs = copyCampaign(gipTemplate);
    for (const reply of [
      "decline",
      "eof",
      "stale",
      (c: string) => c.replace("null-advance", "advance"),
      (c: string) => c.replace("null-advance", "null-resume"),
      (c: string) => c.replace("null-advance", "relocate"),
      (c: string) => `${c}x`,
    ] as const)
      await untouched(
        dirs,
        async (s) =>
          (await nullAdvance(ctxOf(s, scriptedTerminal(reply)), advanceTo(SUNSET_AT))).status,
        "DECLINED",
      );
    const s = await openNull(dirs);
    expect(status(s).ooc_choices).toEqual([]);
    await s.close();
  }, 180_000);

  it("a malformed, extra-field, duration-like or incomparable target is refused before any prompt; the kernel refuses a past or foreign-unit one without a write", async () => {
    const dirs = copyCampaign(gipTemplate);
    for (const bad of [
      undefined,
      null,
      {},
      { target: null },
      { target: { unit: "t", value: -1 } },
      { target: { unit: "t", value: 1.5 } },
      { target: { unit: "", value: 1 } },
      { target: { unit: "t" } },
      { target: { value: 1 } },
      { target: { ...SUNSET_AT, extra: 1 } },
      { target: SUNSET_AT, duration: 5 },
      { target: SUNSET_AT, confirmed: true },
      { target: SUNSET_AT, role: "role.player" },
      { target: SUNSET_AT, transaction_id: "x" },
      { target: "2026-10-10" },
      { target: 200 },
    ]) {
      const t = scriptedTerminal();
      await untouched(
        dirs,
        async (s) => (await nullAdvance(ctxOf(s, t), bad)).status,
        "INVALID_INPUT",
      );
      expect(t.asked()).toBe(0);
    }
    // valid shape, refused by the existing kernel: confirmed, retained, refused with no footprint, therefore forgotten
    for (const target of [at(50), { unit: "other-unit", value: 400 }]) {
      const s = await openNull(dirs);
      const hash = stateHash(s);
      expect(
        (await nullAdvance(ctxOf(s, scriptedTerminal("confirm")), advanceTo(target))).status,
      ).toBe("UNAVAILABLE");
      expect(stateHash(s)).toBe(hash);
      expect(status(s).ooc_choices).toEqual([]);
      expect(readLedger(dirs).intents).toEqual([]);
      await s.close();
    }
  }, 180_000);

  it("an active character makes both commands unavailable before any prompt", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    // a campaign WITH a bound character: stand-in view of the same campaign whose operative binding exists
    const real = s.campaign.binding.bind(s.campaign);
    (s.campaign as any).binding = () => ({ value: { active_pc: { entity_id: "pc-x" } } });
    const t = scriptedTerminal();
    expect((await nullAdvance(ctxOf(s, t), advanceTo(SUNSET_AT))).status).toBe("UNAVAILABLE");
    expect((await nullResume(ctxOf(s, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    (s.campaign as any).binding = real;
    await s.close();
  }, 120_000);

  it("wrong campaign identity and a closed session open nothing and prompt nothing", async () => {
    const dirs = copyCampaign(gipTemplate);
    const wrong = await LocalOperatorSession.open(
      nullSessionParams(dirs, undefined, { expectedCampaignId: "some-other-campaign" }),
    );
    expect(wrong.ok).toBe(false);
    const s = await openNull(dirs);
    await s.close();
    const t = scriptedTerminal();
    expect((await nullAdvance(ctxOf(s, t), advanceTo(SUNSET_AT))).status).toBe("SESSION_CLOSED");
    expect((await nullResume(ctxOf(s, t))).status).toBe("SESSION_CLOSED");
    expect(t.asked()).toBe(0);
  }, 120_000);

  it("resume is unavailable without a retained, committed choice and a kernel-held remainder: nothing is asked, nothing is written", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    const t = scriptedTerminal();
    expect((await nullResume(ctxOf(s, t))).status).toBe("UNAVAILABLE");
    // a completed advance leaves nothing to resume
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(SUNSET_AT));
    expect((await nullResume(ctxOf(s, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    await s.close();
  }, 120_000);
});

describe("the local-operator boundary and the earlier active-PC commands are unaffected", () => {
  it("a real active character makes both NULL-PC commands unavailable before any prompt, and the active-PC relocate/advance still work", async () => {
    const pcTemplate = await seedTemplate();
    const dirs = copyCampaign(pcTemplate);
    const s = await openSession(dirs);
    expect(s.campaign.binding()).toBeDefined();
    const t = scriptedTerminal();
    expect((await nullAdvance(ctxOf(s, t), advanceTo(SUNSET_AT))).status).toBe("UNAVAILABLE");
    expect((await nullResume(ctxOf(s, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    expect((await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT)).status).toBe(
      "RELOCATION_COMMITTED",
    );
    expect((await advance(ctxOf(s, scriptedTerminal("confirm")))).status).toBe("ADVANCE_COMMITTED");
    expect(status(s)).toMatchObject({
      relocation: "COMMITTED",
      advances: ["COMMITTED"],
      ooc_choices: [],
    });
    await s.close();
  }, 180_000);

  it("a package writable by group/other, a ledger of another campaign, and a malformed ledger refuse the session before any command", async () => {
    const dirs = copyCampaign(gipTemplate);
    chmodSync(dirs.campaignDir, 0o775);
    const writable = await LocalOperatorSession.open(nullSessionParams(dirs));
    expect(writable.ok).toBe(false);
    chmodSync(dirs.campaignDir, 0o755);

    const s = await openNull(dirs);
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(SUNSET_MID));
    await s.close();
    const path = `${dirs.operatorDir}/${ledgerFileName(FIXTURE_CAMPAIGN)}`;
    const good = readFileSync(path, "utf8");
    writeFileSync(path, JSON.stringify({ ...JSON.parse(good), campaign_id: "another-campaign" }));
    expect((await LocalOperatorSession.open(nullSessionParams(dirs))).ok).toBe(false);
    writeFileSync(path, good.replace('"NULL_ADVANCE"', '"NULL_TELEPORT"'));
    expect((await LocalOperatorSession.open(nullSessionParams(dirs))).ok).toBe(false);
    writeFileSync(path, good);
    const again = await openNull(dirs);
    expect(status(again).ooc_choices).toEqual([{ kind: "ADVANCE", status: "COMMITTED" }]);
    await again.close();
  }, 120_000);
});

describe("a real kernel-held lineage is recovered only by a NEW, separately confirmed choice", () => {
  const entityDelivered = (s: { campaign: any }) =>
    s.campaign.store.getFact(worldEntityTransitionKey(FIXTURE_WORLD_ID, entity)) !== undefined;
  const heldFrom = (s: { campaign: any }) =>
    (s.campaign.store.getFact("temporal/state")!.value as any).continuation?.from_transaction;

  it("an owner stage that cannot resolve commits a truthful hold; nothing retries it; a new confirmed choice consumes exactly it", async () => {
    const dirs = copyCampaign(logTemplate);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    const first = await nullAdvance(
      ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
      advanceTo(PROD_T1),
    );
    // the status says only that a transaction committed; the world did NOT deliver
    expect(first.status).toBe("NULL_PC_ADVANCE_COMMITTED");
    expect(entityDelivered(s)).toBe(false);
    const heldTx = s.campaign.store.getFact(temporalTransactionKey(ADV_TX))!.value as any;
    expect(heldTx.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(heldFrom(s)).toBe(ADV_TX);
    // the console never reported the stop reason
    expect(first.message).not.toMatch(/held|unresolved|DEPENDENCY|continuation/i);
    // another initial progression is not available while the remainder stands (and prompts nothing)
    const idle = scriptedTerminal();
    expect((await nullAdvance(ctxOf(s, idle), advanceTo(PROD_T1))).status).toBe("UNAVAILABLE");
    expect(idle.asked()).toBe(0);
    restore();

    // reconcile, status, a repeated session and a reopen retry nothing
    const frozen = stateHash(s);
    expect((await reconcile(ctxOf(s, scriptedTerminal())))[0]!.status).toBe("NOTHING_TO_RECONCILE");
    expect(stateHash(s)).toBe(frozen);
    await s.close();
    const b = await openNull(dirs, LOGISTICS_EXTENSION);
    expect(stateHash(b)).toBe(frozen);
    expect(heldFrom(b)).toBe(ADV_TX);

    // declining, or confirming with the wrong verb, resumes nothing; the earlier confirmation authorizes nothing
    expect((await nullResume(ctxOf(b, scriptedTerminal("decline")))).status).toBe("DECLINED");
    expect(
      (
        await nullResume(
          ctxOf(
            b,
            scriptedTerminal((c) => c.replace("null-resume", "null-advance")),
          ),
        )
      ).status,
    ).toBe("DECLINED");
    expect(stateHash(b)).toBe(frozen);
    expect(status(b).ooc_choices).toEqual([{ kind: "ADVANCE", status: "COMMITTED" }]);

    // a NEW confirmation, a NEW immutable identity: the original held lineage, the same target-only request, verbatim
    const t = scriptedTerminal("confirm");
    const out = await nullResume(ctxOf(b, t, fixedIds(RES)));
    expect(out.status).toBe("NULL_PC_HELD_ADVANCE_COMMITTED");
    expect(t.said.join("\n")).toMatch(/choice #2/);
    expect(t.said.join("\n")).toMatch(/SAME target it confirmed/);
    const second = b.campaign.store.getFact(temporalTransactionKey(RES_TX))!.value as any;
    expect(second.continues).toBe(ADV_TX);
    expect(second.requested).toEqual(heldTx.requested);
    expect(second.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(entityDelivered(b)).toBe(true);
    expect(b.campaign.store.getFact(logisticsDeliveryKey(FIXTURE_WORLD_ID, entity))).toBeDefined();
    expect(heldFrom(b)).toBeUndefined();
    expect(status(b).ooc_choices).toEqual([
      { kind: "ADVANCE", status: "COMMITTED" },
      { kind: "RESUME", status: "COMMITTED" },
    ]);
    // nothing further is available: the hold is consumed
    const none = scriptedTerminal();
    expect((await nullResume(ctxOf(b, none))).status).toBe("UNAVAILABLE");
    expect(none.asked()).toBe(0);
    const doneHash = stateHash(b);
    await b.close();

    // fact-for-fact the unchanged gateways driven directly through the same lineage
    const ref = copyCampaign(logTemplate);
    expect(
      await referenceNull(
        ref,
        LOGISTICS_EXTENSION,
        [
          { kind: "advance", uid: ADV, target: PROD_T1 },
          { kind: "resume", uid: RES, from: ADV_TX, target: PROD_T1 },
        ],
        {
          prepare: (c) => {
            restoreRef = refuseNullPcDeliveryStage({ campaign: c }, REQ_1);
          },
          between: (_c, i) => {
            if (i === 0) restoreRef();
          },
        },
      ),
    ).toBe(doneHash);
  }, 240_000);

  let restoreRef: () => void = () => undefined;

  it("a persisting fault commits another truthful hold: no phantom arrival; a third, separate choice resumes only the latest", async () => {
    const dirs = copyCampaign(logTemplate);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(PROD_T1));
    const again = await nullResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)));
    expect(again.status).toBe("NULL_PC_HELD_ADVANCE_COMMITTED");
    expect(entityDelivered(s)).toBe(false);
    expect(heldFrom(s)).toBe(RES_TX);
    expect(
      (s.campaign.store.getFact(temporalTransactionKey(RES_TX))!.value as any).outcome.stop_reason,
    ).toBe("DEPENDENCY_UNRESOLVED");
    restore();
    // the third choice's lineage is the latest hold, and its target is still the first choice's
    const t = scriptedTerminal("confirm");
    expect((await nullResume(ctxOf(s, t, fixedIds(RES3)))).status).toBe(
      "NULL_PC_HELD_ADVANCE_COMMITTED",
    );
    expect(t.said.join("\n")).toMatch(/choice #2/);
    const third = s.campaign.store.getFact(temporalTransactionKey(RES3_TX))!.value as any;
    expect(third.continues).toBe(RES_TX);
    expect(third.requested).toEqual({ target: PROD_T1, condition: null });
    expect(entityDelivered(s)).toBe(true);
    expect(s.campaign.store.getFact(logisticsTransferKey(FIXTURE_WORLD_ID, entity))).toBeDefined();
    expect(status(s).ooc_choices.map((c) => c.kind)).toEqual(["ADVANCE", "RESUME", "RESUME"]);
    await s.close();
  }, 240_000);

  it("a hold the operator never chose (no retained committed choice names it) cannot be resumed", async () => {
    const dirs = copyCampaign(logTemplate);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(PROD_T1));
    restore();
    await s.close();
    // the same campaign under an operator directory that retains none of this operator's choices
    const stranger = {
      campaignDir: dirs.campaignDir,
      operatorDir: copyCampaign(logTemplate).operatorDir,
    };
    const b = await openNull(stranger, LOGISTICS_EXTENSION);
    const t = scriptedTerminal();
    expect((await nullResume(ctxOf(b, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    await b.close();
  }, 120_000);

  it("a retained COMMITTED choice that canon no longer holds (an older save restored) is stale, not believed", async () => {
    const dirs = copyCampaign(logTemplate);
    const s = await openNull(dirs, LOGISTICS_EXTENSION);
    const restore = refuseNullPcDeliveryStage(s, REQ_1);
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(PROD_T1));
    restore();
    await s.close();
    // restore the OLD campaign (before the choice) under the ledger that remembers it
    const old = copyCampaign(logTemplate);
    const b = await openNull(
      { campaignDir: old.campaignDir, operatorDir: dirs.operatorDir },
      LOGISTICS_EXTENSION,
    );
    const t = scriptedTerminal();
    expect((await nullAdvance(ctxOf(b, t), advanceTo(PROD_T1))).status).toBe("STALE_INTENT");
    expect((await nullResume(ctxOf(b, t))).status).toBe("STALE_INTENT");
    expect(t.asked()).toBe(0);
    await b.close();
  }, 120_000);
});

describe("the retained intent exists, confirmed, BEFORE the gateway is invoked", () => {
  it("the ledger already holds the CONFIRMED choice (identity, exact target, provenance) when the kernel's first group arrives", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openNull(dirs);
    const real = s.campaign.store;
    let seen: any;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return (g: any) => {
            seen ??= JSON.parse(
              readFileSync(`${dirs.operatorDir}/${ledgerFileName(FIXTURE_CAMPAIGN)}`, "utf8"),
            );
            return target.commit(g);
          };
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    await nullAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), advanceTo(SUNSET_AT));
    expect(seen.intents).toHaveLength(1);
    expect(seen.intents[0]).toMatchObject({
      kind: "NULL_ADVANCE",
      status: "CONFIRMED",
      target: SUNSET_AT,
      transaction: {
        transaction_id: ADV_TX,
        context: { role: "role.player", permission: "permission.player_choice.commit" },
      },
    });
    expect(readLedger(dirs).intents[0].status).toBe("COMMITTED");
    await s.close();
  }, 120_000);
});
