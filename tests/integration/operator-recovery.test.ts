/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store to simulate lost replies, crashes and refused stages */
// Recovery for the local operator command-and-reopen mechanism (RC-16): a lost or ambiguous reply, a crash between durable
// writes, a refused stage and a held remainder. Each case closes, reopens and reconciles by the ORIGINAL identity, and must land
// on exactly the canon an uninterrupted run produces — no second journey, transaction, delivery or publication.
import { beforeAll, describe, expect, it } from "vitest";
import {
  logisticsDeliveryKey,
  logisticsTransferKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  worldEntityTransitionKey,
} from "@immortalis/contracts";
import { nodeFs } from "@immortalis/engine";
import { advance, reconcile, relocate, status } from "@immortalis/operator";
import { ACTOR_FIXTURE_EXTENSION, INSTRUMENT_A, instrumentFs } from "@immortalis/testkit";
import { PC, W, authorityCensus, movementSummary } from "../support/pc-movement.ts";
import { crashBefore, loseReplyAfter } from "../support/protocol-relocation.ts";
import { crashWhen, loseReplyWhen, refuseDeliveryStage } from "../support/protocol-advance.ts";
import {
  gipOf,
  gipSourcedCampaign,
  instrumentFact,
  lifecycleOf,
} from "../support/pc-gip-sunset.ts";
import { SUNSET_MID, sunsetInstrument } from "../support/gip-sunset.ts";
import { gipPublication } from "@immortalis/testkit";
import {
  RELOCATE_INPUT,
  copyCampaign,
  copyState,
  ctxOf,
  fixedIds,
  openSession,
  relocatedTemplate,
  scriptedTerminal,
  seedTemplate,
  sessionParams,
} from "../support/operator.ts";
import { LocalOperatorSession } from "@immortalis/operator";
import { tempDir } from "../support/tmp.ts";

let template: string;
let relocated: { campaignDir: string; operatorDir: string };
let referenceRelocation: string;
let referenceJourney: string;
const ADV = "adv-1";
const ADV_TX = `operator-advance:${ADV}`;

const hash = (s: Awaited<ReturnType<typeof openSession>>) => s.campaign.store.head().state_sha256;

beforeAll(async () => {
  template = await seedTemplate();
  // the uninterrupted references: the canon an unbroken run lands on
  const a = await openSession(copyCampaign(template));
  await relocate(ctxOf(a, scriptedTerminal("confirm"), fixedIds("rel-1")), RELOCATE_INPUT);
  referenceRelocation = hash(a);
  await a.close();
  relocated = await relocatedTemplate(template);
  const b = await openSession(copyState(relocated));
  await advance(ctxOf(b, scriptedTerminal("confirm"), fixedIds(ADV)));
  referenceJourney = hash(b);
  await b.close();
}, 180_000);

/** Reopens, reconciles (or re-issues what never reached the retained intents) and returns the settled session. */
async function settle(dirs: { campaignDir: string; operatorDir: string }) {
  const b = await openSession(dirs);
  const silent = scriptedTerminal();
  const results = await reconcile(ctxOf(b, silent));
  expect(silent.asked()).toBe(0);
  return { b, results };
}

describe("RC-16 lost reply or crash at each of the five relocation commits", () => {
  for (const step of [0, 1, 2, 3, 4]) {
    for (const [name, inject] of [
      ["reply lost after", loseReplyAfter],
      ["group not committed at", crashBefore],
    ] as const) {
      it(`${name} step ${step}: unknown, then reconciled by the original intent to the uninterrupted canon`, async () => {
        const dirs = copyCampaign(template);
        const s = await openSession(dirs);
        const restore = inject({ campaign: s.campaign } as any, step);
        const out = await relocate(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("rel-1")),
          RELOCATE_INPUT,
        );
        restore();
        expect(out.status).toBe("RELOCATION_OUTCOME_UNKNOWN");
        expect(status(s)).toMatchObject({ relocation: "CONFIRMED" });
        // an unknown outcome is neither a decline nor fresh permission: the session refuses to go on until reopened
        const t = scriptedTerminal();
        expect((await relocate(ctxOf(s, t), RELOCATE_INPUT)).status).toBe(
          "RECONCILIATION_REQUIRED",
        );
        expect((await advance(ctxOf(s, t))).status).toBe("RECONCILIATION_REQUIRED");
        expect(t.asked()).toBe(0);
        await s.close();

        const { b, results } = await settle(dirs);
        expect(results.map((r) => r.status)).toEqual(["RELOCATION_COMMITTED"]);
        expect(hash(b)).toBe(referenceRelocation);
        expect(authorityCensus({ campaign: b.campaign })).toMatchObject({ logistics: 1, total: 1 });
        expect(status(b)).toMatchObject({ relocation: "COMMITTED" });
        // reconciling again is a no-op
        expect((await reconcile(ctxOf(b, scriptedTerminal())))[0]!.status).toBe(
          "NOTHING_TO_RECONCILE",
        );
        expect(hash(b)).toBe(referenceRelocation);
        await b.close();
      }, 120_000);
    }
  }
});

describe("RC-16 lost reply or crash inside the confirmed progression", () => {
  const groups: [string, (g: any) => boolean][] = [
    [
      "the transaction's durable opening",
      (g) => g.writes.some((w: any) => w.key === temporalTransactionAuthorityKey(ADV_TX)),
    ],
    [
      "Logistics' delivery",
      (g) => g.writes.some((w: any) => w.key === logisticsDeliveryKey(W, PC)),
    ],
    [
      "World-State's destination commit",
      (g) => g.writes.some((w: any) => w.key === worldEntityTransitionKey(W, PC)),
    ],
    [
      "Logistics' retirement",
      (g) =>
        g.owner === "logistics" && g.writes.some((w: any) => w.key === logisticsTransferKey(W, PC)),
    ],
    [
      "the transaction record",
      (g) => g.writes.some((w: any) => w.key === temporalTransactionKey(ADV_TX)),
    ],
  ];
  for (const [label, pred] of groups) {
    for (const [name, inject] of [
      ["reply lost after", loseReplyWhen],
      ["group not committed at", crashWhen],
    ] as const) {
      it(`${name} ${label}: unknown, then the SAME transaction reconciles to the uninterrupted canon`, async () => {
        const dirs = copyState(relocated);
        const s = await openSession(dirs);
        const restore = inject({ campaign: s.campaign } as any, pred);
        const out = await advance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)));
        restore();
        expect(out.status).toBe("ADVANCE_OUTCOME_UNKNOWN");
        expect(status(s)).toMatchObject({ advances: ["CONFIRMED"] });
        // while unreconciled no new progression choice can be made
        const t = scriptedTerminal();
        expect((await advance(ctxOf(s, t))).status).toBe("RECONCILIATION_REQUIRED");
        expect(t.asked()).toBe(0);
        await s.close();

        // even a fresh session refuses to mint a second progression until the first is reconciled
        const again = await openSession(dirs);
        const t2 = scriptedTerminal();
        expect((await advance(ctxOf(again, t2))).status).toBe("RECONCILIATION_REQUIRED");
        expect(t2.asked()).toBe(0);
        await again.close();

        const { b, results } = await settle(dirs);
        expect(results.map((r) => r.status)).toEqual(["ADVANCE_COMMITTED"]);
        expect(hash(b)).toBe(referenceJourney);
        expect(authorityCensus({ campaign: b.campaign })).toMatchObject({
          destination: 1,
          total: 1,
        });
        expect(status(b)).toMatchObject({ advances: ["COMMITTED"] });
        await b.close();
      }, 120_000);
    }
  }
});

describe("a crash at every durable write of the operator's own commands", () => {
  const WHEN = ["before", "after"] as const;

  it("relocation: every mutating filesystem operation of the campaign package, before and after", async () => {
    // count the operations one uninterrupted relocation performs
    const dirs0 = copyCampaign(template);
    const probe = instrumentFs(nodeFs);
    const s0 = await openSession(dirs0, { campaignFs: probe.fs });
    const afterOpen = probe.count();
    await relocate(ctxOf(s0, scriptedTerminal("confirm"), fixedIds("rel-1")), RELOCATE_INPUT);
    const total = probe.count();
    await s0.close();
    expect(total - afterOpen).toBeGreaterThan(10);

    const seen = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= total; failAt++) {
      for (const when of WHEN) {
        const dirs = copyCampaign(template);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openSession(dirs, { campaignFs: faulty.fs });
        const out = await relocate(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("rel-1")),
          RELOCATE_INPUT,
        );
        seen.add(out.status);
        expect(
          ["RELOCATION_COMMITTED", "RELOCATION_OUTCOME_UNKNOWN", "UNAVAILABLE"],
          `op ${failAt} ${when}`,
        ).toContain(out.status);
        await s.close().catch(() => undefined);
        // reopen with a healthy filesystem (a crash left residue the reopen reports and never adopts)
        const b = await openSession(dirs);
        if (status(b).relocation === "NONE")
          expect(
            (
              await relocate(
                ctxOf(b, scriptedTerminal("confirm"), fixedIds("rel-1")),
                RELOCATE_INPUT,
              )
            ).status,
          ).toBe("RELOCATION_COMMITTED");
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(hash(b), `op ${failAt} ${when}`).toBe(referenceRelocation);
        expect(status(b)).toMatchObject({ relocation: "COMMITTED" });
        await b.close();
      }
    }
    // the injected faults genuinely produced ambiguous outcomes, not just clean runs
    expect(seen.has("RELOCATION_OUTCOME_UNKNOWN")).toBe(true);
  }, 600_000);

  it("relocation: both durable writes of the retained intents, before and after", async () => {
    for (const failAt of [1, 2]) {
      for (const when of WHEN) {
        const dirs = copyCampaign(template);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openSession(dirs, { ledgerFs: faulty.fs });
        const out = await relocate(
          ctxOf(s, scriptedTerminal("confirm"), fixedIds("rel-1")),
          RELOCATE_INPUT,
        );
        expect(["RELOCATION_COMMITTED", "RELOCATION_OUTCOME_UNKNOWN", "UNAVAILABLE"]).toContain(
          out.status,
        );
        await s.close();
        const b = await openSession(dirs);
        if (status(b).relocation === "NONE")
          await relocate(ctxOf(b, scriptedTerminal("confirm"), fixedIds("rel-1")), RELOCATE_INPUT);
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(hash(b), `ledger op ${failAt} ${when}`).toBe(referenceRelocation);
        expect(status(b)).toMatchObject({ relocation: "COMMITTED" });
        await b.close();
      }
    }
  }, 300_000);

  it("progression: both durable writes of the retained intents, before and after", async () => {
    for (const failAt of [1, 2]) {
      for (const when of WHEN) {
        const dirs = copyState(relocated);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openSession(dirs, { ledgerFs: faulty.fs });
        const out = await advance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)));
        expect(["ADVANCE_COMMITTED", "ADVANCE_OUTCOME_UNKNOWN", "UNAVAILABLE"]).toContain(
          out.status,
        );
        await s.close();
        const b = await openSession(dirs);
        if (status(b).advances.length === 0)
          await advance(ctxOf(b, scriptedTerminal("confirm"), fixedIds(ADV)));
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(hash(b), `ledger op ${failAt} ${when}`).toBe(referenceJourney);
        expect(status(b)).toMatchObject({ advances: ["COMMITTED"] });
        await b.close();
      }
    }
  }, 300_000);

  it("progression: every mutating filesystem operation of the campaign package, before and after", async () => {
    const dirs0 = copyState(relocated);
    const probe = instrumentFs(nodeFs);
    const s0 = await openSession(dirs0, { campaignFs: probe.fs });
    const afterOpen = probe.count();
    await advance(ctxOf(s0, scriptedTerminal("confirm"), fixedIds(ADV)));
    const total = probe.count();
    await s0.close();
    expect(total - afterOpen).toBeGreaterThan(10);

    const seen = new Set<string>();
    for (let failAt = afterOpen + 1; failAt <= total; failAt++) {
      for (const when of WHEN) {
        const dirs = copyState(relocated);
        const faulty = instrumentFs(nodeFs, { failAt, when });
        const s = await openSession(dirs, { campaignFs: faulty.fs });
        const out = await advance(ctxOf(s, scriptedTerminal("confirm"), fixedIds(ADV)));
        seen.add(out.status);
        expect(
          ["ADVANCE_COMMITTED", "ADVANCE_OUTCOME_UNKNOWN", "UNAVAILABLE"],
          `op ${failAt} ${when}`,
        ).toContain(out.status);
        await s.close().catch(() => undefined);
        const b = await openSession(dirs);
        if (status(b).advances.length === 0)
          expect((await advance(ctxOf(b, scriptedTerminal("confirm"), fixedIds(ADV)))).status).toBe(
            "ADVANCE_COMMITTED",
          );
        else await reconcile(ctxOf(b, scriptedTerminal()));
        expect(hash(b), `op ${failAt} ${when}`).toBe(referenceJourney);
        expect(status(b)).toMatchObject({ advances: ["COMMITTED"] });
        await b.close();
      }
    }
    expect(seen.has("ADVANCE_OUTCOME_UNKNOWN")).toBe(true);
  }, 900_000);
});

describe("a held remainder is consumed only by a newly confirmed transaction", () => {
  it("a stage that cannot resolve commits a truthful held stop; nothing retries it; a second confirmed choice finishes it", async () => {
    const dirs = copyState(relocated);
    const s = await openSession(dirs);
    const restore = refuseDeliveryStage({ campaign: s.campaign } as any);
    const first = await advance(ctxOf(s, scriptedTerminal("confirm"), fixedIds("held-1")));
    expect(first.status).toBe("ADVANCE_COMMITTED");
    // the status says only that a transaction committed; the world did NOT deliver
    expect(s.campaign.pcCurrentLocus(PC)?.phase).toBe("IN_TRANSFER");
    expect(s.campaign.store.getFact(worldEntityTransitionKey(W, PC))).toBeUndefined();
    const held = (s.campaign.store.getFact("temporal/state")!.value as any).continuation;
    expect(held).toMatchObject({ from_transaction: "operator-advance:held-1", toward: null });
    restore();

    // nothing is retried by reconciliation, by a status, by reopening, or by simply time passing in the session
    const frozen = movementSummary({ campaign: s.campaign });
    expect((await reconcile(ctxOf(s, scriptedTerminal())))[0]!.status).toBe("NOTHING_TO_RECONCILE");
    expect(status(s)).toMatchObject({ advances: ["COMMITTED"] });
    expect(movementSummary({ campaign: s.campaign })).toEqual(frozen);
    await s.close();

    const b = await openSession(dirs);
    expect(movementSummary({ campaign: b.campaign })).toEqual(frozen);
    // the previous confirmation does not progress anything; declining the new one changes nothing
    expect((await advance(ctxOf(b, scriptedTerminal("decline")))).status).toBe("DECLINED");
    expect(movementSummary({ campaign: b.campaign })).toEqual(frozen);
    // a newly confirmed choice, with its own identity, consumes exactly the held remainder
    const t = scriptedTerminal("confirm");
    expect((await advance(ctxOf(b, t, fixedIds("held-2")))).status).toBe("ADVANCE_COMMITTED");
    expect(t.said.join("\n")).toMatch(/choice #2/);
    const second = b.campaign.store.getFact(temporalTransactionKey("operator-advance:held-2"))!
      .value as any;
    expect(second.continues).toBe("operator-advance:held-1");
    expect(second.requested).toEqual(
      (b.campaign.store.getFact(temporalTransactionKey("operator-advance:held-1"))!.value as any)
        .requested,
    );
    expect(authorityCensus({ campaign: b.campaign })).toMatchObject({ destination: 1, total: 1 });
    expect(status(b)).toMatchObject({ advances: ["COMMITTED", "COMMITTED"] });
    await b.close();
  }, 180_000);
});

describe("independently due registered work resolves in the kernel's own order, without the operator naming it", () => {
  it("a registered GIP sunset earned before the delivery boundary is expired by GIP while the PC is delivered", async () => {
    const dir = tempDir("immortalis-operator-gip-");
    const seeded = await gipSourcedCampaign(dir);
    const input = { ...gipPublication(4), instrument: sunsetInstrument(INSTRUMENT_A, SUNSET_MID) };
    const est = await gipOf(seeded).establishSunsetInstrument(input);
    expect(est.ok).toBe(true);
    await seeded.campaign.close();

    const dirs = copyCampaign(dir);
    const s = await openSession(dirs);
    expect(lifecycleOf({ campaign: s.campaign })).toBe("active");
    await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    // the relocation alone expired nothing
    expect(lifecycleOf({ campaign: s.campaign })).toBe("active");
    expect((await advance(ctxOf(s, scriptedTerminal("confirm")))).status).toBe("ADVANCE_COMMITTED");
    expect(lifecycleOf({ campaign: s.campaign })).toBe("expired");
    expect(instrumentFact({ campaign: s.campaign })).toBeDefined();
    expect(authorityCensus({ campaign: s.campaign })).toMatchObject({ destination: 1, total: 1 });
    await s.close();
  }, 180_000);
});

describe("campaign isolation across two campaigns with identical identities", () => {
  it("each campaign keeps its own retained intents; choices in one never touch the other", async () => {
    const one = copyCampaign(template);
    const two = copyCampaign(template);
    const a = await openSession(one);
    const b = await openSession(two);
    await relocate(ctxOf(a, scriptedTerminal("confirm")), RELOCATE_INPUT);
    expect(status(a)).toMatchObject({ relocation: "COMMITTED" });
    expect(status(b)).toMatchObject({ relocation: "NONE" });
    expect(authorityCensus({ campaign: b.campaign })).toMatchObject({ stationary: 1, total: 1 });
    await a.close();
    await b.close();
  }, 120_000);

  it("a campaign opened without the owner registration it was written with is refused, not partly loaded", async () => {
    const dirs = copyCampaign(template);
    const opened = await LocalOperatorSession.open({
      ...sessionParams(dirs),
      extension: undefined,
    } as any);
    expect(opened.ok).toBe(false);
    void ACTOR_FIXTURE_EXTENSION;
  }, 60_000);
});
