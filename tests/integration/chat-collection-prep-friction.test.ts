/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// Regressions against AVOIDABLE FRICTION in the chat-requested collection-preparation route (BLUE Revision 2, A2 acceptance amendment,
// "Regressions against avoidable friction"): what is already settled is not asked again, nothing is approved that does not need the
// player, status mutates nothing and restarts nothing, and the consent that IS required stays required - fresh, whole, and the human's.
//
// EVERYTHING HERE IS A MECHANISM TEST (a scripted assistant, a scripted human, scripted PLUMBING referee hosts, the real owners).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ACTUATOR,
  CYCLE,
  DECLARATION,
  FOUR_OPS,
  HANDLING,
  MOMENT,
  TRAVERSAL,
  chain,
  cloneSlot,
  openOrdinary,
  pendingFiles,
  preparation,
  reader,
  readsAndDeclines,
  resumed,
  routePolicy,
  routeRecord,
  scriptedPolicy,
  stage,
  started,
  status,
  type Position,
  type Slot,
} from "../support/chat-route.ts";

const ANY = /[0-9a-f]{12}/g;
const mask = (t: string): string => t.replace(ANY, "<phrase>");

/** the campaign head and the operator directory's file names: what a read must leave exactly as it found them */
async function fingerprint(s: Slot) {
  const c = await openOrdinary(s.campaignDir);
  try {
    const h = c.store.head();
    return {
      revision: h.revision,
      state: h.state_sha256,
      files: readdirSync(s.operatorDir).sort(),
    };
  } finally {
    await c.close();
  }
}

let accepted: Partial<Record<Position, Slot>>;
let r5: Partial<Record<Position, Slot>>;
beforeAll(async () => {
  accepted = await chain({ cycle: true });
  r5 = await chain({ cycle: false });
}, 400_000);
afterAll(() => vi.restoreAllMocks());

describe("MECHANISM: what is already settled is reused - nobody is asked again, nothing is dispatched", () => {
  it("every stage offered again with the very same input is reported done: no run, no question, no approval, no owner write", async () => {
    const s = await cloneSlot(accepted["READY"]!);
    const r = await resumed(s);
    try {
      const before = await fingerprint(s);
      const again: [string, any][] = [
        ["establish_character_location", {}],
        ["state_starting_moment", MOMENT],
        ["propose_collection_preparation", preparation(CYCLE)],
        ["declare_closed_setting", DECLARATION],
        ["finish_collection_setup", {}],
      ];
      for (const [tool, args] of again) {
        const out = await r.chat.call(tool, args);
        expect(out.isError, `${tool}: ${out.text}`).toBe(false);
        expect(out.elicited).toEqual([]);
        expect(out.data.done.message).toContain("nobody was asked");
        expect(out.data.run_id).toBeUndefined();
        expect(out.data.route.readiness.prepared_to_request_collection).toBe(true);
      }
      expect(await fingerprint(s)).toEqual(before);
      expect(pendingFiles(s)).toEqual([]);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("an accepted cycle is not clarified again; a different origin of time is never offered a reset; a different preparation is never put over a committed one", async () => {
    const s = await cloneSlot(accepted["READY"]!);
    const r = await resumed(s);
    try {
      const before = await fingerprint(s);
      const words = await r.chat.call("state_handling_duration", { words: HANDLING });
      expect(words.isError).toBe(true);
      expect(words.text).toContain("no clarification applies");
      const moved = await r.chat.call("state_starting_moment", { ...MOMENT, value: 99 });
      expect(moved.isError).toBe(true);
      expect(moved.text).toContain("never reset or replaced");
      const other = await r.chat.call("propose_collection_preparation", {
        ...preparation(CYCLE),
        reserve_condition: "damp",
      });
      expect(other.isError).toBe(true);
      expect(other.text).toContain("is never replaced here");
      expect(other.elicited).toEqual([]);
      expect(await fingerprint(s)).toEqual(before);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("a CHANGED declaration is a new review with a fresh confirmation (the owners' facts are re-derived); the player's old confirmation stands for nothing else", async () => {
    const s = await cloneSlot(accepted["READY"]!);
    const r = await resumed(s);
    try {
      const changed = {
        ...DECLARATION,
        closure_statement: "Nothing but the owners' own facts acts here",
      };
      const out = await stage(r.chat, "declare_closed_setting", changed);
      expect(out.finished.elicited).toHaveLength(1);
      expect(out.finished.elicited[0]).toContain(changed.closure_statement);
      expect(out.finished.data.result.status).toBe("SETTING_DECLARED");
      // the change was the author's: it is current, and the finished route still stands
      expect(out.finished.data.route.readiness.prepared_to_request_collection).toBe(true);
    } finally {
      await r.stop();
    }
  }, 120_000);
});

describe("MECHANISM: a status read is a read - it mutates nothing, recreates no question and restarts no settled stage", () => {
  const where: Position[] = ["CHARACTER", "LOCUS", "MOMENT", "PREPARED", "DECLARED", "READY"];
  for (const position of where)
    it(`at ${position}: three reads change no owner state, no retained record and no pending record, and read the same each time`, async () => {
      const s = await cloneSlot(accepted[position]!);
      const r = await resumed(s);
      try {
        const before = await fingerprint(s);
        const record = routeRecord(s);
        const first = await status(r.chat);
        const second = await status(r.chat);
        const third = await status(r.chat);
        expect(second).toEqual(first);
        expect(third).toEqual(first);
        expect(first.route.readiness.campaign_started).toBe(false);
        expect(await fingerprint(s)).toEqual(before);
        expect(routeRecord(s)).toEqual(record);
        expect(pendingFiles(s)).toEqual([]);
        // nothing is running: a read starts no stage
        expect((await r.chat.call("await_action", { wait_seconds: 1 })).isError).toBe(true);
      } finally {
        await r.stop();
      }
    }, 120_000);

  it("the status names the ONE next step and exactly what only the player can still say - nothing the owners or the retained words already hold", async () => {
    const s = await cloneSlot(accepted["LOCUS"]!);
    const r = await resumed(s);
    try {
      const a = (await status(r.chat)).route;
      expect(a.next).toMatchObject({ tool: "state_starting_moment" });
      expect(a.next.ask_the_player).toHaveLength(3);
    } finally {
      await r.stop();
    }
    const p = await cloneSlot(accepted["MOMENT"]!);
    const q = await resumed(p);
    try {
      const b = (await status(q.chat)).route;
      expect(b.next).toMatchObject({
        tool: "propose_collection_preparation",
        canonical_unit: "second",
      });
      // the character's own accepted statements the host may quote, and ONE thing only the author can state
      expect(b.next.ask_the_player).toEqual([
        "the condition the (empty) local Reserve will keep material in, in their own word",
      ]);
      expect(JSON.stringify(b.next.accepted_statements)).toContain(ACTUATOR);
      expect(JSON.stringify(b.next.accepted_statements)).toContain(TRAVERSAL);
      expect(JSON.stringify(b.next.accepted_statements)).toContain(CYCLE);
    } finally {
      await q.stop();
    }
  }, 120_000);
});

describe("MECHANISM: declined consent is a decline - nothing is written, the player's words are kept, and they are never asked for them again", () => {
  const cases: {
    name: string;
    at: () => Slot;
    tool: string;
    args: () => any;
    verb: string;
    kept: "chronology" | "handling" | "preparation" | "declaration" | null;
  }[] = [
    {
      name: "the physical location",
      at: () => accepted["CHARACTER"]!,
      tool: "establish_character_location",
      args: () => ({}),
      verb: "establish-character-locus",
      kept: null,
    },
    {
      name: "the starting moment",
      at: () => accepted["LOCUS"]!,
      tool: "state_starting_moment",
      args: () => MOMENT,
      verb: "initialize-time",
      kept: "chronology",
    },
    {
      name: "the player's own handling duration (R-5)",
      at: () => r5["MOMENT"]!,
      tool: "state_handling_duration",
      args: () => ({ words: HANDLING }),
      verb: "accept-clarification",
      kept: "handling",
    },
    {
      name: "the collection preparation",
      at: () => accepted["MOMENT"]!,
      tool: "propose_collection_preparation",
      args: () => preparation(CYCLE),
      verb: "prepare-collection",
      kept: "preparation",
    },
    {
      name: "the closed-setting declaration",
      at: () => accepted["PREPARED"]!,
      tool: "declare_closed_setting",
      args: () => DECLARATION,
      verb: "declare-closed-setting",
      kept: "declaration",
    },
  ];
  for (const c of cases)
    it(`${c.name}: declined, then offered again from the retained words and confirmed afresh`, async () => {
      const s = await cloneSlot(c.at());
      let r = await resumed(s);
      try {
        const before = await fingerprint(s);
        const declined = await stage(r.chat, c.tool, c.args(), readsAndDeclines);
        const shown = declined.finished.elicited as string[];
        expect(shown).toHaveLength(1);
        expect(shown[0]).toContain(`type exactly "${c.verb} `);
        expect(declined.finished.data.result.status).toBe("DECLINED");
        // nothing was written, nothing is pending, and the barrier is not held
        expect(declined.finished.data.outcome).toBeUndefined();
        expect(await fingerprint(s)).toEqual({ ...before, files: expect.any(Array) });
        expect(pendingFiles(s)).toEqual([]);
        expect(declined.finished.data.route.barrier).toBe("NONE");
        if (c.kept === null) {
          // the physical location kept no words: the player simply asks for it again
          const again = await stage(r.chat, c.tool, c.args());
          expect(again.finished.data.exit_code).toBe(0);
          return;
        }
        // the player's own words are retained (never as consent) so the stage is offered again without asking for them
        expect(routeRecord(s)[c.kept]).not.toBeNull();
        expect(declined.finished.data.route.next).toMatchObject({
          retained: true,
          ask_the_player: [],
        });
        // ... even across a restart of the service
        await r.stop();
        r = await resumed(s);
        const kept = (await status(r.chat)).route.next;
        expect(kept).toMatchObject({ retained: true, ask_the_player: [] });
        const redone = await stage(r.chat, "resume_collection_setup");
        const second = redone.finished.elicited as string[];
        expect(second).toHaveLength(1);
        // the very same review, with a FRESH challenge: the earlier one stands for nothing
        expect(mask(second[0]!)).toBe(mask(shown[0]!));
        expect(second[0]).not.toBe(shown[0]);
        expect(redone.finished.data.exit_code).toBe(0);
        expect(redone.finished.data.result.status).not.toBe("DECLINED");
        // once the stage stands in canon, what the player said for it is no longer retained
        expect(routeRecord(s)?.[c.kept] ?? null).toBeNull();
      } finally {
        await r.stop();
      }
    }, 180_000);

  it("a wrong, guessed or earlier phrase and silence confirm nothing at any human stage", async () => {
    const s = await cloneSlot(accepted["MOMENT"]!);
    const r = await resumed(s);
    try {
      const before = await fingerprint(s);
      const earlier: string[] = [];
      for (const typed of [
        "prepare-collection 000000000000",
        "declare-closed-setting 000000000000",
        "",
      ]) {
        const out = await stage(
          r.chat,
          "propose_collection_preparation",
          preparation(CYCLE),
          (e) =>
            /type exactly "/.test(e.message)
              ? (earlier.push(/type exactly "([^"]+)"/.exec(e.message)![1]!),
                { action: "accept", content: { reply: typed } })
              : { action: "accept", content: {} },
        );
        expect(out.finished.data.result.status).toBe("DECLINED");
      }
      // a phrase from an EARLIER question confirms nothing in a later one
      const stale = await stage(
        r.chat,
        "propose_collection_preparation",
        preparation(CYCLE),
        (e) =>
          /type exactly "/.test(e.message)
            ? { action: "accept", content: { reply: earlier[0]! } }
            : { action: "accept", content: {} },
      );
      expect(stale.finished.data.result.status).toBe("DECLINED");
      expect((await fingerprint(s)).state).toBe(before.state);
    } finally {
      await r.stop();
    }
  }, 120_000);
});

describe("MECHANISM: an unmet prerequisite is named exactly, before the player is asked anything", () => {
  it("every stage before the character is placed is refused with where to start; a refusal asks the player nothing", async () => {
    const early = await started({ upTo: "SETTING" });
    try {
      for (const [tool, args] of [
        ["establish_character_location", {}],
        ["propose_collection_preparation", preparation(CYCLE)],
        ["finish_collection_setup", {}],
      ] as const) {
        const out = await early.chat.call(tool, args);
        expect(out.isError, tool).toBe(true);
        expect(out.elicited).toEqual([]);
        expect(out.text).toContain("the character is not kept and placed yet");
      }
      expect((await status(early.chat)).route.next).toMatchObject({
        tool: "propose_original_character",
      });
    } finally {
      await early.stop();
    }
    // the cheap earlier stages that need only the setting are NOT held back by the character
    const s = await cloneSlot(accepted["CHARACTER"]!);
    const r = await resumed(s);
    try {
      for (const [tool, args] of [
        ["propose_collection_preparation", preparation(CYCLE)],
        ["declare_closed_setting", DECLARATION],
        ["finish_collection_setup", {}],
      ] as const) {
        const out = await r.chat.call(tool, args);
        expect(out.isError, tool).toBe(true);
        expect(out.elicited).toEqual([]);
        expect(out.text).toMatch(/comes first|not established yet|not complete/);
      }
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("quotations that are not the character's own accepted words are refused with the accepted statements named; nothing is put to the human", async () => {
    const s = await cloneSlot(accepted["MOMENT"]!);
    const r = await resumed(s);
    try {
      const forged = await r.chat.call("propose_collection_preparation", {
        ...preparation(CYCLE),
        actuator_quote: "the hands of this body can lift a mountain",
      });
      expect(forged.isError).toBe(true);
      expect(forged.text).toContain("not a verbatim part of any accepted statement");
      const wrongNumber = await r.chat.call("propose_collection_preparation", {
        ...preparation(CYCLE),
        cycle_value: 13,
      });
      expect(wrongNumber.isError).toBe(true);
      expect(wrongNumber.text).toContain("must say the number and the unit itself");
      expect(wrongNumber.elicited).toEqual([]);
      expect(pendingFiles(s)).toEqual([]);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("the R-5 branch is not offered for words that state no number and unit, nor before time exists", async () => {
    const s = await cloneSlot(r5["LOCUS"]!);
    const r = await resumed(s);
    try {
      const early = await r.chat.call("state_handling_duration", { words: HANDLING });
      expect(early.isError).toBe(true);
      expect(early.text).toContain("starting moment is not established yet");
    } finally {
      await r.stop();
    }
    const p = await cloneSlot(r5["MOMENT"]!);
    const q = await resumed(p);
    try {
      const vague = await q.chat.call("state_handling_duration", {
        words: "It takes me a good while to lift and carry one lump",
      });
      expect(vague.isError).toBe(true);
      expect(vague.text).toContain("number in digits");
      expect(vague.elicited).toEqual([]);
      // and the preparation waits for the player's own account rather than inventing one
      const early = await q.chat.call("propose_collection_preparation", preparation(HANDLING));
      expect(early.isError).toBe(true);
      expect(early.text).toContain("state_handling_duration");
    } finally {
      await q.stop();
    }
  }, 120_000);

  it("a missing referee grant, an unset player-view host and a referee that did not establish the cycle are each named and each changes nothing", async () => {
    // no listed host is bound for the physical reading
    const noPhysical = await started({
      setupOps: ["I002_CLASSIFY", "IR_NATIVE_COMPATIBILITY", "F014D_DIRECT_PERCEPTION"],
    });
    try {
      const out = await noPhysical.chat.call("establish_character_location");
      expect(out.isError).toBe(true);
      expect(out.text).toContain("physically is");
      expect(out.elicited).toEqual([]);
      const route = (await status(noPhysical.chat)).route;
      expect(route.blockers).toContain("REFEREE_GRANT_MISSING:IR_PHYSICAL_PLACEMENT");
    } finally {
      await noPhysical.stop();
    }
    // the service has no player-view host: finishing is a named configuration blocker, and the attestation is not even asked for
    const s = await cloneSlot(accepted["DECLARED"]!);
    const bare = { ...s, config: { ...s.config, playerViewHostId: null } } as Slot;
    const r = await resumed(bare);
    try {
      const route = (await status(r.chat)).route;
      expect(route.blockers).toContain("PLAYER_VIEW_HOST_UNSET");
      const out = await r.chat.call("finish_collection_setup");
      expect(out.isError).toBe(true);
      expect(out.text).toContain("player-view host");
    } finally {
      await r.stop();
    }
  }, 240_000);
});

void FOUR_OPS;
void routePolicy;
void scriptedPolicy;
void reader;
void existsSync;
void readFileSync;
void join;
