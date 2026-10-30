/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP client and raw owner readback */
// MECHANISM ONLY (scripted assistant, scripted plumbing referee hosts, real owners). BLUE HOLD H3: an independent world consequence composed
// with the CHAT TOOLS. The producer is an operator-authored Governance Instrument with an exact sunset, enrolled with the Temporal kernel by a
// lawful PRE-PLAY owner opening. The campaign has ONE Temporal-owned canonical-time origin: the operator's confirmed starting chronology; the
// governance opening requires it and makes no other. The chat route consumes it (the starting moment is already DONE) and never attempts a
// second one. No player request names, authors or schedules the expiry; the Production owner's closure rule still withholds a gathering whose
// interval touches another process's due boundary (C8/D-2 is not weakened); nothing the player is shown mentions the event.
// The chat tools have no way to pass time except a gathering, so the one step that makes the event due - a lawful advance of canonical time by
// the active-PC gateway - is taken at the gateway, between two chat sessions, exactly as the independent-consequence gateway test does.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  OWNER_GIP,
  gipInstrumentKey,
  gipSunsetStage,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  GIP_INSTRUMENT_RULE,
  stageGroupId,
  stageIntentId,
  transactionCause,
  verifyGipIntegrity,
} from "@immortalis/engine";
import { initializeTime } from "@immortalis/operator";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
} from "@immortalis/protocol";
import { ctxOf, openSession, scriptedTerminal } from "../support/operator.ts";
import { pcTargetTransaction } from "../support/pc-target-advance.ts";
import { draft, offer, place } from "../support/chat-character.ts";
import {
  CYCLE,
  DECLARATION,
  MOMENT,
  TAU,
  UNIT,
  embodiment,
  openOrdinary,
  preparation,
  resumed,
  stage,
  started,
  type Slot,
} from "../support/chat-route.ts";
import {
  BINDING_ID,
  INSTITUTION_ID,
  INSTRUMENT_ID,
  OFFICE_ID,
  addGovernance,
  governanceDoc,
  instrumentDoc,
  writeGovernance,
} from "../support/initial-timed-governance.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(chat: any, ok: (status: any) => boolean, rounds = 240) {
  let last: any;
  for (let i = 0; i < rounds; i++) {
    last = (await chat.call("play_status")).data;
    if (last && ok(last)) return last;
    await sleep(250);
  }
  throw new Error(`not reached: ${JSON.stringify(last)}`);
}
const finished = (s: any) =>
  s.goal !== null && ["DONE", "RETURNED", "INTERRUPTED"].includes(s.goal.outcome);
const NEUTRAL =
  /sunset|expire|instrument|ordinance|institution|office|governance|boundary|closure/i;

/**
 * The chat route with lawful PRE-PLAY owner openings BEFORE the character exists. The operator (service stopped; each command under its own
 * typed confirmation) first states the starting chronology - the campaign's ONE canonical-time origin, written by the Temporal owner - and
 * then opens the Governance Instrument whose exact sunset is enrolled with the kernel. Only then does the player's character exist: kept,
 * placed and prepared through the chat tools, with the starting moment already DONE.
 */
async function readyWithSunset(sunset: number): Promise<Slot> {
  const first = await started({ upTo: "SETTING" });
  const s = first.s;
  await first.stop();
  const origin = {
    format: "immortalis-starting-chronology",
    format_version: 1,
    time: { unit: UNIT, value: MOMENT.value },
    statement: MOMENT.statement,
  };
  const file = join(mkdtempSync(join(tmpdir(), "immortalis-chronology-")), "chronology.json");
  writeFileSync(file, JSON.stringify(origin));
  chmodSync(file, 0o600);
  const session = await openSession(
    s as any,
    {
      expectedCampaignId: s.config.campaignId,
      extension: undefined,
    } as any,
  );
  try {
    const t = await initializeTime(ctxOf(session, scriptedTerminal("confirm")), file);
    expect(t.status, JSON.stringify(t)).toBe("TIME_ESTABLISHED");
  } finally {
    await session.close();
  }
  const doc = governanceDoc();
  doc.canonical_time = { unit: UNIT, value: MOMENT.value };
  doc.instrument = instrumentDoc({ sunset_condition: { unit: UNIT, value: sunset } });
  const { result } = await addGovernance(s as any, writeGovernance(doc), ["confirm"], {
    campaignId: s.config.campaignId,
  });
  expect(result.status, JSON.stringify(result.details)).toBe("GOVERNANCE_READY");
  const r = await resumed(s);
  try {
    await r.chat.init({});
    const kept = await offer(r.chat, draft({ embodiment: embodiment(true) }));
    expect(kept.finished.data?.result?.status).toBe("CHARACTER_RELEASED_UNBOUND");
    const placed = await place(r.chat);
    expect(placed.finished.data?.result?.status).toBe("CHARACTER_BOUND");
    const located = await stage(r.chat, "establish_character_location");
    expect(located.finished.data?.exit_code, JSON.stringify(located.finished.data)).toBe(0);
    // the chat adapter CONSUMES the existing origin: the starting moment is already DONE, so no second origin is attempted
    const status = (await r.chat.call("collection_setup_status")).data;
    expect(JSON.stringify(status)).toMatch(/starting_moment[^}]*DONE|DONE[^}]*starting_moment/);
    for (const [tool, args] of [
      ["propose_collection_preparation", preparation(CYCLE)],
      ["declare_closed_setting", DECLARATION],
      ["finish_collection_setup", {}],
    ] as const) {
      const done = await stage(r.chat, tool, args);
      expect(
        done.finished.isError || done.finished.data?.exit_code !== 0,
        `${tool}: ${JSON.stringify(done.finished.data ?? done.finished.text)}`,
      ).toBe(false);
    }
    return s;
  } finally {
    await r.stop();
  }
}

async function owners(s: Slot) {
  const c = await openOrdinary(s.campaignDir);
  try {
    const instrument = c.store.getFact(gipInstrumentKey(INSTRUMENT_ID));
    return {
      instrument: instrument
        ? { version: instrument.version, status: (instrument.value as any).lifecycle_status }
        : null,
      reserve: (
        c.store.listFacts().find((f) => f.key.startsWith("production/reserve/"))!.value as any
      ).quantity.amount as number,
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value as number,
      origin: c.store.getFact("temporal/state")!.provenance.intent_id as string,
      head: c.store.head().state_sha256,
      gip: verifyGipIntegrity(c.store),
      verify: c.verify(),
      index: (c.store.getFact("temporal/boundary-index")?.value as any)?.entries ?? [],
    };
  } finally {
    await c.close();
  }
}

// the first handful is done at MOMENT + TAU, the second at MOMENT + 2 TAU: the sunset is the very instant the second one would complete
const SUNSET = MOMENT.value + 2 * TAU;

describe("an independent consequence composed with the chat tools", () => {
  it("one origin: the chat route consumes the opening's chronology and never writes a second; a redundant restatement replays, an inconsistent one is refused and changes nothing", async () => {
    const s = await readyWithSunset(SUNSET);
    const before = await owners(s);
    expect(before.origin).toMatch(/^starting-chronology:/);
    expect(before.time).toBe(MOMENT.value);
    expect(before.instrument).toEqual({ version: 1, status: "active" });
    const r = await resumed(s);
    try {
      await r.chat.init({});
      // the identical moment is the same chronology: it replays what the owner holds
      const same = await stage(r.chat, "state_starting_moment", MOMENT);
      expect(same.finished.isError, JSON.stringify(same.finished.data)).toBe(false);
      expect(same.finished.data?.done?.step).toBe("CHRONOLOGY");
      expect(same.finished.data?.done?.message).toMatch(/already established; nobody was asked/);
      expect((await owners(s)).head).toBe(before.head);
      // a different moment is never a second origin: it is refused and nothing is reset, overwritten or written
      const other = await stage(r.chat, "state_starting_moment", {
        ...MOMENT,
        value: MOMENT.value + 1,
      });
      expect(other.finished.isError).toBe(true);
      expect(JSON.stringify(other.finished.text ?? other.finished.data)).toMatch(
        /already has an origin: it is established once and is never reset or replaced\. Nothing was dispatched/,
      );
      const after = await owners(s);
      expect(after.head).toBe(before.head);
      expect(after.time).toBe(MOMENT.value);
      expect(after.origin).toBe(before.origin);
    } finally {
      await r.stop();
    }
  }, 600_000);

  it("a gathering before the sunset is exact; one whose interval touches it is withheld without a reason; the event resolves at its instant on a lawful advance; the next gathering is exact", async () => {
    const s = await readyWithSunset(SUNSET);
    let r = await resumed(s);
    try {
      await r.chat.init({});
      // 1. one handful ends before the sunset: exact, and the Instrument is untouched
      expect((await r.chat.call("gather", { amount: 1, until: "complete" })).isError).toBe(false);
      const one = await until(r.chat, finished);
      expect(one.goal.outcome).toBe("DONE");
      const mid = await owners(s);
      expect(mid.reserve).toBe(1);
      expect(mid.time).toBe(MOMENT.value + TAU);
      expect(mid.instrument).toEqual({ version: 1, status: "active" });
      expect(mid.index).toHaveLength(1);

      // 2. the next handful would end exactly at the sunset: the owner's closure rule withholds it. Nothing is debited, credited or passed,
      //    and nothing the player is told says why. The event is neither skipped nor hidden.
      expect((await r.chat.call("gather", { amount: 1, until: "complete" })).isError).toBe(false);
      const clash = await until(r.chat, (x) => finished(x) && x.goal.outcome === "RETURNED");
      expect(clash.goal.returned).toBe("NOT_ADMITTED");
      expect(JSON.stringify(clash)).not.toMatch(NEUTRAL);
      const held = await owners(s);
      expect(held.reserve).toBe(1);
      expect(held.time).toBe(MOMENT.value + TAU);
      expect(held.instrument).toEqual({ version: 1, status: "active" });
      expect(held.index).toHaveLength(1);
    } finally {
      await r.stop();
    }

    // 3. canonical time passes through the lawful active-PC advance (the one step the chat tools do not offer). It does not author the event:
    //    GIP's own stage expires the Instrument once, AT the sunset, changing nothing but its lifecycle status.
    const c = await openOrdinary(s.campaignDir);
    try {
      const moved = await advanceActivePcToTarget(
        bindTrustedActivePcTargetAdvanceContext({
          campaign: c,
          pc_id: c.binding()!.value.active_pc.entity_id,
          target: { unit: UNIT, value: SUNSET + 4 },
          transaction: pcTargetTransaction("tx-chat-wait") as never,
        }),
        { operation: "advance_active_pc_to_target" },
      );
      expect(moved.ok, JSON.stringify(moved)).toBe(true);
    } finally {
      await c.close();
    }
    const done = await owners(s);
    expect(done.time).toBe(SUNSET + 4);
    expect(done.instrument).toEqual({ version: 2, status: "expired" });
    expect(done.index).toHaveLength(0);
    expect(done.reserve).toBe(1);
    // it resolved AT the sunset instant, never at the requested horizon: the transaction names the boundary
    const c2 = await openOrdinary(s.campaignDir);
    try {
      expect(
        JSON.stringify(
          c2.store.listFacts().filter((f) => f.key.startsWith("temporal/transaction/")),
        ),
      ).toContain(`"value":${SUNSET}`);
    } finally {
      await c2.close();
    }

    // 4. back in the chat, with nothing else falling due, the gathering is exactly what the owners compute
    r = await resumed(s);
    try {
      await r.chat.init({});
      expect((await r.chat.call("gather", { amount: 2, until: "complete" })).isError).toBe(false);
      const two = await until(
        r.chat,
        (x) => finished(x) && x.goal.amount === 2 && x.goal.outcome === "DONE",
      );
      expect(two.goal.outcome).toBe("DONE");
      const end = await owners(s);
      expect(end.reserve).toBe(3);
      expect(end.time).toBe(SUNSET + 4 + 2 * TAU);
      expect(end.instrument).toEqual({ version: 2, status: "expired" });
      expect(end.gip).toEqual([]);
      expect(end.verify).toEqual([]);
      const glance = await r.chat.call("read_current_observation_glance");
      for (const surface of [JSON.stringify(two), JSON.stringify(glance.data ?? glance.text)])
        expect(surface).not.toMatch(NEUTRAL);
    } finally {
      await r.stop();
    }
  }, 900_000);

  it("a hand-written expiry on the chat-built campaign is refused - with or without the producer's stage identity - because the only cause of expiry is the earned boundary", async () => {
    const s = await readyWithSunset(SUNSET);
    const c = await openOrdinary(s.campaignDir);
    try {
      const head = c.store.head();
      const fact = c.store.getFact(gipInstrumentKey(INSTRUMENT_ID))!;
      const office = c.store.getFact(`gip/institution/${INSTITUTION_ID}/office/${OFFICE_ID}`)!;
      const binding = c.store.getFact(
        `gip/institution/${INSTITUTION_ID}/office/${OFFICE_ID}/scope-binding/${BINDING_ID}`,
      )!;
      let n = 0;
      for (const identity of [true, false]) {
        n++;
        const stg = gipSunsetStage(INSTRUMENT_ID);
        const group: CommitGroup = {
          campaign_id: s.config.campaignId,
          group_id: identity ? stageGroupId(stg) : `forged-g-${n}`,
          intent_id: identity ? stageIntentId(stg) : `forged-i-${n}`,
          owner: OWNER_GIP,
          facet: "gip_institution_identity",
          cause: identity ? transactionCause("tx-forged") : `forged-c-${n}`,
          rule: GIP_INSTRUMENT_RULE,
          authority: { ...CANON_WRITE_AUTHORITY },
          reads: [
            { key: office.key, version: office.version },
            { key: binding.key, version: binding.version },
          ],
          depends_on: [office.provenance.group_id, binding.provenance.group_id],
          writes: [
            {
              key: fact.key,
              owner: OWNER_GIP,
              facet: "gip_institution_identity",
              value: { ...(fact.value as object), lifecycle_status: "expired" } as never,
              unit: null,
              basis: fact.basis,
              secrecy: fact.secrecy,
              expected_version: 1,
            },
          ],
        };
        expect((await c.store.commit(group)).ok, `identity ${identity}`).toBe(false);
      }
      expect(c.store.head()).toEqual(head);
      expect((c.store.getFact(fact.key)!.value as any).lifecycle_status).toBe("active");
    } finally {
      await c.close();
    }
  }, 600_000);
});
