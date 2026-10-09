// Refusal and adversity for the local operator command-and-reopen mechanism: every case fails closed, shows only a permitted
// status, preserves the exact owner facts, and leaves no duplicate, cross-campaign effect or hidden-state leak.
import { appendFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PLAYER_CHOICE_AUTHORITY, logisticsDeliveryKey } from "@immortalis/contracts";
import {
  LEDGER_FORMAT,
  LEDGER_FORMAT_VERSION,
  LocalOperatorSession,
  advance,
  ledgerFileName,
  reconcile,
  relocate,
  status,
} from "@immortalis/operator";
import {
  bindTrustedConfirmedPcRelocationContext,
  commitConfirmedPcRelocation,
} from "@immortalis/protocol";
import { ACTOR_FIXTURE_EXTENSION, FIXTURE_LOCUS_ID, at } from "@immortalis/testkit";
import { PC, W, authorityCensus, movementSummary } from "../support/pc-movement.ts";
import { handedOverCampaign } from "../support/pc-locus-custody.ts";
import { seededExistingActorCampaign } from "../support/existing-actor.ts";
import {
  DEST_LOCUS_ID,
  FIXTURE_CAMPAIGN,
  LOG_T_DELIVERY,
  RELOCATE_INPUT,
  copyCampaign,
  ctxOf,
  openSession,
  scriptedTerminal,
  seedTemplate,
  sessionParams,
} from "../support/operator.ts";
import { copyDir, tempDir } from "../support/tmp.ts";

let template: string;
let noPcTemplate: string;
let noCustodyTemplate: string;
beforeAll(async () => {
  template = await seedTemplate();
  const noPc = tempDir("immortalis-operator-nopc-");
  await (await seededExistingActorCampaign(noPc)).campaign.close();
  noPcTemplate = noPc;
  const noCustody = tempDir("immortalis-operator-nocustody-");
  await (await handedOverCampaign(noCustody)).campaign.close();
  noCustodyTemplate = noCustody;
}, 180_000);

const frozen = (s: Awaited<ReturnType<typeof openSession>>) =>
  movementSummary({ campaign: s.campaign });

/** a command that must refuse BEFORE it ever asks the operator anything, and change nothing */
async function refusesQuietly(
  s: Awaited<ReturnType<typeof openSession>>,
  run: (t: ReturnType<typeof scriptedTerminal>) => Promise<{ status: string }>,
  expected: string,
) {
  const before = frozen(s);
  const t = scriptedTerminal();
  expect((await run(t)).status).toBe(expected);
  expect(t.asked()).toBe(0);
  expect(t.said).toEqual([]);
  expect(frozen(s)).toEqual(before);
}

describe("the operator's input is intent only", () => {
  it("rejects every extra, missing or mistyped field of the relocation choice without asking anything", async () => {
    const s = await openSession(copyCampaign(template));
    const base = RELOCATE_INPUT;
    const bad: unknown[] = [
      undefined,
      null,
      "relocate to the market",
      {},
      { ...base, confirmed: true },
      { ...base, pc_id: PC },
      { ...base, authored_under: { ...PLAYER_CHOICE_AUTHORITY } },
      { ...base, role: "role.player" },
      { ...base, transaction_id: "tx" },
      { ...base, destination: { ...base.destination, route: ["a", "b"] } },
      { ...base, destination: [base.destination] },
      { ...base, destination: { world_id: W } },
      { ...base, destination: { world_id: " ", locus_id: "x" } },
      { ...base, delivery_at: { unit: base.delivery_at.unit } },
      { ...base, delivery_at: { unit: base.delivery_at.unit, value: -1 } },
      { ...base, delivery_at: { unit: base.delivery_at.unit, value: 1.5 } },
      { destination: base.destination },
    ];
    for (const input of bad)
      await refusesQuietly(s, (t) => relocate(ctxOf(s, t), input), "INVALID_INPUT");
    await s.close();
  }, 120_000);
});

describe("canonical antecedents are consumed, never created", () => {
  it("refuses with no prompt when the destination is not established", async () => {
    const s = await openSession(copyCampaign(template));
    for (const destination of [
      { world_id: W, locus_id: "locus-nowhere" },
      { world_id: "world-nowhere", locus_id: DEST_LOCUS_ID },
    ])
      await refusesQuietly(
        s,
        (t) => relocate(ctxOf(s, t), { ...RELOCATE_INPUT, destination }),
        "UNAVAILABLE",
      );
    // and nothing was invented: no locus, world, commitment or ledger entry exists
    expect(s.campaign.locus(W, "locus-nowhere")).toBeUndefined();
    expect(s.campaign.pcMovementCommitment(PC)).toBeUndefined();
    expect(status(s)).toMatchObject({ relocation: "NONE" });
    await s.close();
  }, 120_000);

  it("refuses with no prompt when there is no active PC, or no post-handover custody", async () => {
    for (const t of [noPcTemplate, noCustodyTemplate]) {
      const s = await openSession(copyCampaign(t));
      await refusesQuietly(s, (term) => relocate(ctxOf(s, term), RELOCATE_INPUT), "UNAVAILABLE");
      await refusesQuietly(s, (term) => advance(ctxOf(s, term)), "UNAVAILABLE");
      await s.close();
    }
  }, 120_000);

  it("refuses to progress a movement that was never started", async () => {
    const s = await openSession(copyCampaign(template));
    await refusesQuietly(s, (t) => advance(ctxOf(s, t)), "UNAVAILABLE");
    expect(authorityCensus({ campaign: s.campaign })).toMatchObject({ stationary: 1, total: 1 });
    await s.close();
  }, 120_000);
});

describe("an owner's refusal after a confirmed choice leaves canon untouched and the choice forgotten", () => {
  it("a destination that is the origin is refused by the owners; nothing is retained", async () => {
    const s = await openSession(copyCampaign(template));
    const before = frozen(s);
    const t = scriptedTerminal("confirm");
    const out = await relocate(ctxOf(s, t), {
      ...RELOCATE_INPUT,
      destination: { world_id: W, locus_id: FIXTURE_LOCUS_ID },
    });
    expect(out.status).toBe("UNAVAILABLE");
    expect(frozen(s)).toEqual(before);
    expect(status(s)).toMatchObject({ relocation: "NONE" });
    // a lawful choice is then still available and commits once
    const ok = await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    expect(ok.status).toBe("RELOCATION_COMMITTED");
    await s.close();
  }, 120_000);

  it("a delivery boundary Logistics refuses leaves only the PC-side willingness, is retained, and may be restated with a fresh confirmation", async () => {
    const dirs = copyCampaign(template);
    const s = await openSession(dirs);
    const t = scriptedTerminal("confirm");
    const unusable = { unit: "not-the-campaign-time-unit", value: 5 };
    const first = await relocate(ctxOf(s, t), { ...RELOCATE_INPUT, delivery_at: unusable });
    expect(first.status).toBe("UNAVAILABLE");
    // the PC's commitment-of-record committed; no transfer, no object, the PC is still stationary
    expect(s.campaign.pcMovementCommitment(PC)).toBeDefined();
    expect(authorityCensus({ campaign: s.campaign })).toMatchObject({ stationary: 1, total: 1 });
    expect(status(s)).toMatchObject({ relocation: "CONFIRMED" });
    // the retained choice reconciles to the same refusal, without another question
    const again = scriptedTerminal();
    expect(
      (await relocate(ctxOf(s, again), { ...RELOCATE_INPUT, delivery_at: unusable })).status,
    ).toBe("UNAVAILABLE");
    expect(again.asked()).toBe(0);
    // a different DESTINATION cannot replace it (one journey per PC) …
    await refusesQuietly(
      s,
      (term) =>
        relocate(ctxOf(s, term), {
          ...RELOCATE_INPUT,
          destination: { world_id: W, locus_id: FIXTURE_LOCUS_ID },
        }),
      "CHANGED_CHOICE",
    );
    // … but the same destination with a usable declared boundary is a new choice, and needs its own confirmation
    const declined = await relocate(ctxOf(s, scriptedTerminal("decline")), RELOCATE_INPUT);
    expect(declined.status).toBe("DECLINED");
    expect(status(s)).toMatchObject({ relocation: "CONFIRMED" });
    const t2 = scriptedTerminal("confirm");
    expect((await relocate(ctxOf(s, t2), RELOCATE_INPUT)).status).toBe("RELOCATION_COMMITTED");
    expect(t2.asked()).toBe(1);
    expect(authorityCensus({ campaign: s.campaign })).toMatchObject({ logistics: 1, total: 1 });
    await s.close();
  }, 120_000);
});

describe("a committed choice is never replaced, re-asked or duplicated", () => {
  it("the same choice replays without a question and writes nothing; a changed destination or boundary is refused", async () => {
    const s = await openSession(copyCampaign(template));
    expect((await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT)).status).toBe(
      "RELOCATION_COMMITTED",
    );
    const before = frozen(s);
    const q = scriptedTerminal();
    expect((await relocate(ctxOf(s, q), RELOCATE_INPUT)).status).toBe("RELOCATION_COMMITTED");
    expect(q.asked()).toBe(0);
    expect(frozen(s)).toEqual(before);
    await refusesQuietly(
      s,
      (t) =>
        relocate(ctxOf(s, t), {
          ...RELOCATE_INPUT,
          destination: { world_id: W, locus_id: FIXTURE_LOCUS_ID },
        }),
      "CHANGED_CHOICE",
    );
    await refusesQuietly(
      s,
      (t) => relocate(ctxOf(s, t), { ...RELOCATE_INPUT, delivery_at: at(999) }),
      "CHANGED_CHOICE",
    );
    await s.close();
  }, 120_000);

  it("after delivery there is nothing left to progress: no question, no second transaction", async () => {
    const s = await openSession(copyCampaign(template));
    await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    expect((await advance(ctxOf(s, scriptedTerminal("confirm")))).status).toBe("ADVANCE_COMMITTED");
    expect(s.campaign.store.getFact(logisticsDeliveryKey(W, PC))).toBeDefined();
    await refusesQuietly(s, (t) => advance(ctxOf(s, t)), "UNAVAILABLE");
    // re-presenting the delivered relocation replays and writes nothing
    const before = frozen(s);
    expect((await relocate(ctxOf(s, scriptedTerminal()), RELOCATE_INPUT)).status).toBe(
      "RELOCATION_COMMITTED",
    );
    expect(frozen(s)).toEqual(before);
    await s.close();
  }, 120_000);

  it("a relocation the operator did not make through this mechanism is not re-confirmed over, and a different choice is not blindly replayed", async () => {
    const dirs = copyCampaign(template);
    // someone else (a trusted caller, not this mechanism) already started the journey toward the same destination
    const raw = await LocalOperatorSession.open(sessionParams(dirs));
    if (!raw.ok) throw new Error("did not open");
    const direct = await commitConfirmedPcRelocation(
      bindTrustedConfirmedPcRelocationContext({
        campaign: raw.value.campaign,
        choice: {
          pc_id: PC,
          destination: { world_id: W, locus_id: DEST_LOCUS_ID },
          authored_under: { ...PLAYER_CHOICE_AUTHORITY },
        },
        delivery_at: LOG_T_DELIVERY,
        publication: { cause: "direct", basis: "direct", secrecy: "direct" },
      }),
      { operation: "commit_confirmed_pc_relocation" },
    );
    expect(direct.ok).toBe(true);
    // a contradicting declared boundary or destination is refused before any question
    await refusesQuietly(
      raw.value,
      (t) => relocate(ctxOf(raw.value, t), { ...RELOCATE_INPUT, delivery_at: at(999) }),
      "UNAVAILABLE",
    );
    await raw.value.close();
  }, 120_000);
});

describe("sessions, handles and campaigns do not cross", () => {
  it("a closed session refuses every command and exposes no campaign", async () => {
    const s = await openSession(copyCampaign(template));
    await s.close();
    expect(s.isOpen).toBe(false);
    expect(() => s.campaign).toThrow();
    const t = scriptedTerminal();
    expect((await relocate(ctxOf(s, t), RELOCATE_INPUT)).status).toBe("SESSION_CLOSED");
    expect((await advance(ctxOf(s, t))).status).toBe("SESSION_CLOSED");
    expect((await reconcile(ctxOf(s, t)))[0]!.status).toBe("SESSION_CLOSED");
    expect(t.asked()).toBe(0);
  }, 120_000);

  it("an earlier session cannot act on the reopened campaign, and a second session cannot open while one holds the lock", async () => {
    const dirs = copyCampaign(template);
    const a = await openSession(dirs);
    const earlierCampaign = a.campaign;
    const locked = await LocalOperatorSession.open(sessionParams(dirs));
    expect(locked).toMatchObject({
      ok: false,
      error: { code: "CAMPAIGN_UNAVAILABLE", details: { code: "LOCKED" } },
    });
    await a.close();
    const b = await openSession(dirs);
    const before = frozen(b);
    expect((await relocate(ctxOf(a, scriptedTerminal("confirm")), RELOCATE_INPUT)).status).toBe(
      "SESSION_CLOSED",
    );
    expect(frozen(b)).toEqual(before);
    // a trusted context bound to the earlier, closed campaign cannot mutate the reopened one either
    const stale = bindTrustedConfirmedPcRelocationContext({
      campaign: earlierCampaign,
      choice: {
        pc_id: PC,
        destination: { world_id: W, locus_id: DEST_LOCUS_ID },
        authored_under: { ...PLAYER_CHOICE_AUTHORITY },
      },
      delivery_at: LOG_T_DELIVERY,
      publication: { cause: "c", basis: "b", secrecy: "s" },
    });
    const old = await commitConfirmedPcRelocation(stale, {
      operation: "commit_confirmed_pc_relocation",
    });
    expect(old.ok).toBe(false);
    expect(frozen(b)).toEqual(before);
    await b.close();
  }, 120_000);

  it("the campaign the operator names must be the one opened, and the lock is released", async () => {
    const dirs = copyCampaign(template);
    const wrong = await LocalOperatorSession.open(
      sessionParams(dirs, { expectedCampaignId: "another" }),
    );
    expect(wrong).toMatchObject({ ok: false, error: { code: "CAMPAIGN_MISMATCH" } });
    const right = await LocalOperatorSession.open(sessionParams(dirs));
    expect(right.ok).toBe(true);
    if (right.ok) await right.value.close();
  }, 120_000);

  it("retained intents of another campaign or operator, or a corrupted ledger, are refused and never adopted", async () => {
    const dirs = copyCampaign(template);
    const file = join(dirs.operatorDir, ledgerFileName(FIXTURE_CAMPAIGN));
    const base = {
      format: LEDGER_FORMAT,
      format_version: LEDGER_FORMAT_VERSION,
      campaign_id: FIXTURE_CAMPAIGN,
      operator_uid: process.getuid!(),
      next_seq: 1,
      intents: [],
    };
    const attempts: [string, unknown, string][] = [
      [
        "another campaign",
        { ...base, campaign_id: "another-campaign" },
        "LEDGER_CAMPAIGN_MISMATCH",
      ],
      [
        "another operator",
        { ...base, operator_uid: process.getuid!() + 1 },
        "LEDGER_OPERATOR_MISMATCH",
      ],
      ["an unknown field", { ...base, confirmed: true }, "LEDGER_MALFORMED"],
      ["not JSON", "{not json", "LEDGER_MALFORMED"],
    ];
    const s0 = await openSession(dirs);
    await s0.close();
    for (const [, content, code] of attempts) {
      writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
      const opened = await LocalOperatorSession.open(sessionParams(dirs));
      expect(opened).toMatchObject({
        ok: false,
        error: { code: "STATE_UNAVAILABLE", details: { code } },
      });
    }
    // the refused attempts left the package unlocked and unchanged
    expect(readdirSync(dirs.campaignDir)).not.toContain("LOCK");
  }, 120_000);

  it("a retained choice that the campaign no longer holds (an older save restored under it) is stale, not believed", async () => {
    const dirs = copyCampaign(template);
    const s = await openSession(dirs);
    await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    await s.close();
    // restore the saved campaign from before the relocation, keeping the retained intents
    const restored = copyDir(template);
    const stale = { campaignDir: restored, operatorDir: dirs.operatorDir };
    const r = await openSession(stale);
    const before = frozen(r);
    await refusesQuietly(r, (t) => relocate(ctxOf(r, t), RELOCATE_INPUT), "STALE_INTENT");
    await refusesQuietly(r, (t) => advance(ctxOf(r, t)), "STALE_INTENT");
    expect(frozen(r)).toEqual(before);
    await r.close();
  }, 120_000);

  it("a corrupted saved campaign is refused on reopen with its lock released", async () => {
    const dirs = copyCampaign(template);
    const s = await openSession(dirs);
    await relocate(ctxOf(s, scriptedTerminal("confirm")), RELOCATE_INPUT);
    await s.close();
    appendFileSync(join(dirs.campaignDir, "journal.jsonl"), '{"tampered":true}\n');
    // residue beyond the committed length is reported, never adopted
    const withResidue = await openSession(dirs);
    expect(withResidue.campaign.store.residue.journal_tail_bytes).toBeGreaterThan(0);
    await withResidue.close();
    const journal = join(dirs.campaignDir, "journal.jsonl");
    const lines = readFileSync(journal, "utf8").split("\n");
    lines[0] = lines[0]!.replace(/"intent_id":"/, '"intent_id":"x');
    writeFileSync(journal, lines.join("\n"));
    const refused = await LocalOperatorSession.open(sessionParams(dirs));
    expect(refused).toMatchObject({ ok: false, error: { code: "CAMPAIGN_UNAVAILABLE" } });
    expect(readdirSync(dirs.campaignDir)).not.toContain("LOCK");
  }, 120_000);
});

void ACTOR_FIXTURE_EXTENSION;
