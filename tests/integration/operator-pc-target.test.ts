/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign's store to refuse a stage */
// The local operator's ACTIVE-PC target commands over the REAL owners: ONE explicit target-only advance of a campaign whose active
// PC is stationary, and — separately and anew — ONE explicit choice to resume the remainder the kernel held. Positive GIP sunset
// witness (independently committed `active` Instrument, expired only by GIP's own provider at the earned boundary) against a
// before-boundary negative contrast; a real kernel-held `DEPENDENCY_UNRESOLVED` lineage recovered by a NEW confirmation. Local
// success is NOT provider/recovery acceptance (IA-07 BLOCKED); no remote authentication, observer disclosure or narration is
// implemented or claimed.
import { beforeAll, describe, expect, it } from "vitest";
import {
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  worldEntityTransitionKey,
} from "@immortalis/contracts";
import {
  advance,
  nullAdvance,
  nullResume,
  pcTargetAdvance,
  pcTargetResume,
  reconcile,
  relocate,
  status,
} from "@immortalis/operator";
import { SUNSET_AT, SUNSET_LATER, SUNSET_MID, at } from "../support/gip-sunset.ts";
import { refuseGipStageOf } from "../support/pc-target-advance.ts";
import {
  RELOCATE_INPUT,
  copyCampaign,
  ctxOf,
  fixedIds,
  openSession,
  scriptedTerminal,
  seedTemplate,
} from "../support/operator.ts";
import { gipSunsetNullTemplate, openNull } from "../support/operator-null-pc.ts";
import { gipOf } from "../support/pc-gip-sunset.ts";
import {
  canonicalTimeOf,
  driveGateway,
  gipSunsetPcTemplate,
  instrumentVersion,
  lifecycleOf,
  referenceTransaction,
  stateHash,
} from "../support/operator-pc-target.ts";
import { loseReplyWhenNull } from "../support/null-pc-advance.ts";
import { PC, W } from "../support/pc-movement.ts";
import { FIXTURE_CAMPAIGN } from "@immortalis/testkit";

let gipTemplate: string;
let plainTemplate: string;
const ADV = "pc-1";
const ADV_TX = `operator-pc-target-advance:${ADV}`;
const RES = "pc-2";
const RES_TX = `operator-pc-target-resume:${RES}`;
const advanceTo = (target: { unit: string; value: number }) => ({ target });

beforeAll(async () => {
  gipTemplate = await gipSunsetPcTemplate(SUNSET_MID);
  plainTemplate = await seedTemplate();
}, 180_000);

const record = (s: Awaited<ReturnType<typeof openSession>>, id: string) =>
  s.campaign.store.getFact(temporalTransactionKey(id))?.value as any;

describe("the GIP sunset: independently grounded positive against the before-boundary contrast", () => {
  it("a pre-existing committed `active` Instrument is expired by GIP's own provider only when the chosen target reaches its earned sunset; the active PC does not move", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    // the independently established cause: an ACTIVE Instrument, a stationary active PC, the campaign at the fixture basis
    expect(lifecycleOf(s)).toBe("active");
    expect(s.campaign.binding()?.value.active_pc.entity_id).toBe(PC);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "STATIONARY_AT_ORIGIN" });
    const v0 = instrumentVersion(s);
    const t = scriptedTerminal("confirm");
    const out = await pcTargetAdvance(ctxOf(s, t, fixedIds(ADV)), advanceTo(SUNSET_LATER));
    expect(out.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    // the owner's own transition, never the operator's: a new version of GIP's own slot, written inside the kernel's transaction
    expect(lifecycleOf(s)).toBe("expired");
    expect(instrumentVersion(s)).toBe(v0 + 1);
    const tx = record(s, ADV_TX);
    expect(tx.requested).toEqual({ target: SUNSET_LATER, condition: null });
    expect(tx.continues).toBeNull();
    expect(tx.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(tx.context).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
    expect(tx.stages).toHaveLength(1);
    // the instrument was written by the stage under that transaction's authority, not by a raw operator write
    expect(s.campaign.store.getFact(temporalTransactionAuthorityKey(ADV_TX))).toBeDefined();
    expect(canonicalTimeOf(s)).toEqual(SUNSET_LATER);
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "STATIONARY_AT_ORIGIN" });
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
    expect(status(s)).toMatchObject({
      pc_target_choices: [{ kind: "ADVANCE", status: "COMMITTED" }],
      ooc_choices: [],
      advances: [],
      relocation: "NONE",
    });
    // the console named the exact target, the character and a transaction status only
    const shown = [...t.said, out.message].join("\n");
    expect(shown).toMatch(/exactly 300 \S+/);
    expect(shown).toContain(PC);
    expect(shown).toMatch(/and not\s+an action the character takes/);
    expect(shown).not.toMatch(/expired|sunset|lifecycle|gip|DEPENDENCY|operator-pc-target|sha256/i);
    await s.close();
  }, 120_000);

  it("a target exactly AT the earned boundary also expires it once", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    expect(
      (
        await pcTargetAdvance(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
          advanceTo(SUNSET_MID),
        )
      ).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(lifecycleOf(s)).toBe("expired");
    expect(canonicalTimeOf(s)).toEqual(SUNSET_MID);
    await s.close();
  }, 120_000);

  it("NEGATIVE contrast: the SAME Instrument, a valid target BEFORE its earned boundary — nothing expires, nothing is written to GIP; a later separate choice reaches it", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    const v0 = instrumentVersion(s);
    const out = await pcTargetAdvance(
      ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
      advanceTo(at(120)),
    );
    expect(out.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(lifecycleOf(s)).toBe("active");
    expect(instrumentVersion(s)).toBe(v0);
    expect(canonicalTimeOf(s)).toEqual(at(120));
    expect(record(s, ADV_TX).stages).toEqual([]);
    // the sunset is still earned and pending: a LATER, separately chosen target reaches it
    expect(
      (
        await pcTargetAdvance(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("pc-later")),
          advanceTo(SUNSET_AT),
        )
      ).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(lifecycleOf(s)).toBe("expired");
    expect(instrumentVersion(s)).toBe(v0 + 1);
    expect(status(s).pc_target_choices).toEqual([
      { kind: "ADVANCE", status: "COMMITTED" },
      { kind: "ADVANCE", status: "COMMITTED" },
    ]);
    await s.close();
  }, 120_000);

  it("the mechanism adds nothing to and omits nothing from canon: the final state equals the unchanged gateway driven directly", async () => {
    const reference = await driveGateway(copyCampaign(gipTemplate).campaignDir, [
      { transaction: referenceTransaction("advance", ADV), target: SUNSET_LATER },
    ]);
    const s = await openSession(copyCampaign(gipTemplate));
    await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), {
      target: SUNSET_LATER,
    });
    expect(stateHash(s)).toBe(reference);
    await s.close();
  }, 120_000);
});

describe("the choice is the operator's own, exact and confirmed", () => {
  it("a declined, mistyped, other-verb or absent confirmation changes nothing and retains nothing", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    const hash = stateHash(s);
    for (const reply of [
      "decline",
      "eof",
      "stale",
      (p: string) => p.replace(/^pc-target-advance/, "null-advance"),
      (p: string) => p.replace(/^pc-target-advance/, "advance"),
      (p: string) => p.replace(/^pc-target-advance/, "pc-target-resume"),
      (p: string) => p.replace(/^pc-target-advance/, "relocate"),
      (p: string) => `${p} `.toUpperCase(),
    ] as const) {
      const out = await pcTargetAdvance(ctxOf(s, scriptedTerminal(reply)), {
        target: SUNSET_LATER,
      });
      expect(out.status).toBe("DECLINED");
      expect(stateHash(s)).toBe(hash);
      expect(status(s).pc_target_choices).toEqual([]);
    }
    await s.close();
  }, 120_000);

  it("invalid input (a duration, a date, a non-integer, a negative, an over-claiming field) is refused before any prompt", async () => {
    const s = await openSession(copyCampaign(gipTemplate));
    for (const input of [
      undefined,
      null,
      {},
      { target: "2026-10-10" },
      { target: { unit: "x" } },
      { target: { unit: SUNSET_AT.unit, value: -1 } },
      { target: { unit: SUNSET_AT.unit, value: 1.5 } },
      { target: SUNSET_AT, role: "role.player" },
      { target: SUNSET_AT, pc_id: "actor-other" },
      { target: SUNSET_AT, confirmed: true },
      { target: SUNSET_AT, transaction_id: "x" },
      { target: { ...SUNSET_AT, calendar: "x" } },
      { duration: 5 },
    ]) {
      const t = scriptedTerminal();
      expect((await pcTargetAdvance(ctxOf(s, t), input)).status, JSON.stringify(input)).toBe(
        "INVALID_INPUT",
      );
      expect(t.asked()).toBe(0);
    }
    await s.close();
  }, 120_000);

  it("a target in another unit, in the past, or short of nothing is the kernel's refusal after confirmation: nothing is written and nothing is retained", async () => {
    const s = await openSession(copyCampaign(gipTemplate));
    const hash = stateHash(s);
    for (const target of [{ unit: "another-unit", value: 300 }, at(50)]) {
      const out = await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm")), advanceTo(target));
      expect(out.status, JSON.stringify(target)).toBe("UNAVAILABLE");
      expect(stateHash(s)).toBe(hash);
      expect(status(s).pc_target_choices).toEqual([]);
    }
    expect(lifecycleOf(s)).toBe("active");
    await s.close();
  }, 120_000);
});

describe("a committed but unregistered sunset is never crossed: the kernel's refusal is the only thing the operator sees", () => {
  it("the confirmed choice is refused, writes nothing and is forgotten; a target short of the sunset still commits; completing GIP's enrollment lifts the refusal", async () => {
    const pendingTemplate = await gipSunsetPcTemplate(SUNSET_MID, "pending");
    const s = await openSession(copyCampaign(pendingTemplate));
    const hash = stateHash(s);
    const refused = await pcTargetAdvance(
      ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
      advanceTo(SUNSET_LATER),
    );
    expect(refused.status).toBe("UNAVAILABLE");
    expect(stateHash(s)).toBe(hash);
    expect(lifecycleOf(s)).toBe("active");
    expect(status(s).pc_target_choices).toEqual([]);
    expect(
      (
        await pcTargetAdvance(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("pc-short")),
          advanceTo(at(120)),
        )
      ).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(lifecycleOf(s)).toBe("active");
    expect(
      (
        await gipOf(s).completeSunsetEnrollment({
          group_id: "complete-g",
          intent_id: "complete-i",
          cause: "complete-c",
          basis: "b",
          secrecy: "s",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await pcTargetAdvance(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("pc-late")),
          advanceTo(SUNSET_LATER),
        )
      ).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(lifecycleOf(s)).toBe("expired");
    await s.close();
  }, 180_000);
});

describe("the command exists only for a campaign with a stationary active character", () => {
  it("a campaign with NO active character refuses before any prompt (and the NULL-PC command still serves it)", async () => {
    const nullTemplate = await gipSunsetNullTemplate();
    const dirs = copyCampaign(nullTemplate);
    const s = await openNull(dirs);
    const hash = stateHash(s);
    const t = scriptedTerminal();
    expect((await pcTargetAdvance(ctxOf(s, t), advanceTo(SUNSET_AT))).status).toBe("UNAVAILABLE");
    expect((await pcTargetResume(ctxOf(s, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    expect(t.said).toEqual([]);
    expect(stateHash(s)).toBe(hash);
    expect(
      (await nullAdvance(ctxOf(s, scriptedTerminal("confirm")), advanceTo(SUNSET_AT))).status,
    ).toBe("NULL_PC_ADVANCE_COMMITTED");
    await s.close();
  }, 120_000);

  it("a character whose movement is begun is refused: before the relocation is progressed no target advance is offered", async () => {
    const dirs = copyCampaign(plainTemplate);
    const s = await openSession(dirs);
    expect((await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT)).status).toBe(
      "RELOCATION_COMMITTED",
    );
    const hash = stateHash(s);
    const t = scriptedTerminal();
    expect((await pcTargetAdvance(ctxOf(s, t), advanceTo(SUNSET_AT))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    expect(stateHash(s)).toBe(hash);
    // the stop-at-delivery progression is unchanged, and afterwards the settled character is stationary again
    expect((await advance(ctxOf(s, scriptedTerminal("confirm")))).status).toBe("ADVANCE_COMMITTED");
    const out = await pcTargetAdvance(
      ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)),
      advanceTo({ unit: SUNSET_AT.unit, value: 500 }),
    );
    expect(out.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(s.campaign.pcCurrentLocus(PC)).toMatchObject({ phase: "DESTINATION_COMMITTED" });
    await s.close();
  }, 180_000);

  it("the NULL-PC commands refuse a campaign with an active character; the active-PC command is not a way around that", async () => {
    const s = await openSession(copyCampaign(gipTemplate));
    const t = scriptedTerminal();
    expect((await nullAdvance(ctxOf(s, t), advanceTo(SUNSET_AT))).status).toBe("UNAVAILABLE");
    expect((await nullResume(ctxOf(s, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    await s.close();
  }, 120_000);
});

describe("a kernel-held lineage is resumed only by a NEW, separately confirmed choice", () => {
  async function held() {
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    const restore = refuseGipStageOf(s);
    expect(
      (
        await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), {
          target: SUNSET_LATER,
        })
      ).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
    restore();
    return { dirs, s };
  }

  it("the first choice's truthful hold leaves GIP untouched; nothing resumes by status, reconcile or reopen; the resume has its own verb, challenge and identity", async () => {
    const { dirs, s } = await held();
    expect(record(s, ADV_TX).outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(lifecycleOf(s)).toBe("active");
    const hash = stateHash(s);
    // no new initial choice while the remainder is held; nothing is prompted
    const t0 = scriptedTerminal();
    expect((await pcTargetAdvance(ctxOf(s, t0), advanceTo(SUNSET_LATER))).status).toBe(
      "UNAVAILABLE",
    );
    expect(t0.asked()).toBe(0);
    expect((await reconcile(ctxOf(s, scriptedTerminal())))[0]!.status).toBe("NOTHING_TO_RECONCILE");
    expect(status(s).pc_target_choices).toEqual([{ kind: "ADVANCE", status: "COMMITTED" }]);
    expect(stateHash(s)).toBe(hash);
    await s.close();

    const b = await openSession(dirs);
    expect(stateHash(b)).toBe(hash);
    expect(lifecycleOf(b)).toBe("active");
    // a declined resume resumes nothing
    expect((await pcTargetResume(ctxOf(b, scriptedTerminal("decline")))).status).toBe("DECLINED");
    expect(stateHash(b)).toBe(hash);
    // the confirmed one is its own choice with its own verb and fresh challenge
    const t = scriptedTerminal("confirm");
    const out = await pcTargetResume(ctxOf(b, t, fixedIds(RES)));
    expect(out.status).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(t.said.join("\n")).toMatch(/choice #2/);
    expect(t.said.join("\n")).toMatch(/type exactly "pc-target-resume [0-9a-f]{12}"/);
    expect(t.said.join("\n")).toMatch(/exactly\s+|300 \S+/);
    const resumed = record(b, RES_TX);
    expect(resumed.continues).toBe(ADV_TX);
    expect(resumed.requested).toEqual({ target: SUNSET_LATER, condition: null });
    expect(lifecycleOf(b)).toBe("expired");
    expect(canonicalTimeOf(b)).toEqual(SUNSET_LATER);
    expect(status(b).pc_target_choices).toEqual([
      { kind: "ADVANCE", status: "COMMITTED" },
      { kind: "RESUME", status: "COMMITTED" },
    ]);
    // nothing remains to resume
    const t2 = scriptedTerminal();
    expect((await pcTargetResume(ctxOf(b, t2))).status).toBe("UNAVAILABLE");
    expect(t2.asked()).toBe(0);
    await b.close();
  }, 240_000);

  it("a resume with no held remainder is refused before any prompt; a persisting fault commits another truthful hold and a third choice resumes only the latest", async () => {
    const plain = await openSession(copyCampaign(gipTemplate));
    const t = scriptedTerminal();
    expect((await pcTargetResume(ctxOf(plain, t))).status).toBe("UNAVAILABLE");
    expect(t.asked()).toBe(0);
    await plain.close();

    const { s } = await held();
    const restore = refuseGipStageOf(s);
    expect(
      (await pcTargetResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)))).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
    restore();
    expect(lifecycleOf(s)).toBe("active");
    expect(record(s, RES_TX).outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(
      (await pcTargetResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds("pc-3")))).status,
    ).toBe("PC_TARGET_ADVANCE_COMMITTED");
    expect(record(s, "operator-pc-target-resume:pc-3").continues).toBe(RES_TX);
    expect(lifecycleOf(s)).toBe("expired");
    expect(status(s).pc_target_choices.map((c) => c.kind)).toEqual(["ADVANCE", "RESUME", "RESUME"]);
    await s.close();
  }, 240_000);

  it("the final state equals the unchanged gateway driven directly with the documented material", async () => {
    const reference = await driveGateway(copyCampaign(gipTemplate).campaignDir, [
      { transaction: referenceTransaction("advance", ADV), target: SUNSET_LATER, hold: true },
      {
        transaction: referenceTransaction("resume", RES),
        target: SUNSET_LATER,
        from: ADV_TX,
      },
    ]);
    const { s } = await held();
    await pcTargetResume(ctxOf(s, scriptedTerminal("confirm"), fixedIds(RES)));
    expect(stateHash(s)).toBe(reference);
    await s.close();
  }, 240_000);
});

describe("an unreconciled choice holds everything, and a confirmed intent is never repeated by a new choice", () => {
  it("a reply lost after the gateway committed leaves the intent CONFIRMED: relocate, advance, new choices and resume all refuse until reconcile finishes it by its original identity", async () => {
    const dirs = copyCampaign(gipTemplate);
    const s = await openSession(dirs);
    loseReplyWhenNull(s, (g) => g.writes.some((w) => w.key.startsWith("temporal/transaction/")));
    const out = await pcTargetAdvance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)), {
      target: SUNSET_LATER,
    });
    expect(out.status).toBe("PC_TARGET_ADVANCE_OUTCOME_UNKNOWN");
    expect(status(s).pc_target_choices).toEqual([{ kind: "ADVANCE", status: "CONFIRMED" }]);
    // an ambiguous session refuses everything but close
    const t0 = scriptedTerminal();
    expect((await pcTargetAdvance(ctxOf(s, t0), advanceTo(SUNSET_LATER))).status).toBe(
      "RECONCILIATION_REQUIRED",
    );
    expect(t0.asked()).toBe(0);
    await s.close();

    const b = await openSession(dirs);
    const t = scriptedTerminal();
    for (const result of [
      await pcTargetAdvance(ctxOf(b, t), advanceTo(SUNSET_LATER)),
      await pcTargetResume(ctxOf(b, t)),
      await relocate(ctxOf(b, t), RELOCATE_INPUT),
      await advance(ctxOf(b, t)),
    ])
      expect(result.status).toBe("RECONCILIATION_REQUIRED");
    expect(t.asked()).toBe(0);
    const v = instrumentVersion(b);
    const results = await reconcile(ctxOf(b, scriptedTerminal()));
    expect(results.map((r) => r.status)).toEqual(["PC_TARGET_ADVANCE_COMMITTED"]);
    expect(instrumentVersion(b)).toBe(v);
    expect(lifecycleOf(b)).toBe("expired");
    expect(status(b).pc_target_choices).toEqual([{ kind: "ADVANCE", status: "COMMITTED" }]);
    // reconciling again is a no-op
    expect((await reconcile(ctxOf(b, scriptedTerminal())))[0]!.status).toBe("NOTHING_TO_RECONCILE");
    await b.close();
  }, 180_000);
});

describe("the retained campaign identity is enforced", () => {
  it("a different campaign id is refused as a mismatch and no command runs", async () => {
    const { LocalOperatorSession } = await import("@immortalis/operator");
    const dirs = copyCampaign(gipTemplate);
    const opened = await LocalOperatorSession.open({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      expectedCampaignId: `${FIXTURE_CAMPAIGN}-other`,
      extension: (await import("@immortalis/testkit")).ACTOR_FIXTURE_EXTENSION,
    });
    expect(opened.ok).toBe(false);
  }, 120_000);
});
