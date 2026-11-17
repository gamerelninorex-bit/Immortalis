// S-4 initial Standing Instruction ledger — the one shipped native-character path (BLUE brief B4 "GM-native / player-facing"):
// opening the ledger is INTERNAL bookkeeping inside normal character creation. The player is asked nothing new, is shown nothing new
// and meets no new terminology; the ledger is committed (engine origin, empty) strictly BEFORE the binding that consumes it; a character
// that is only released has none yet; and rerunning, or reading the status, creates and reveals nothing.
// Level: T1 mechanism only. No host, model or provider judgement is involved; T2/T3/retained are UNRUN.
import { describe, expect, it } from "vitest";
import {
  LEDGER_ORIGIN_ENGINE_CLOSURE,
  PLAYER_CHARACTER_BINDING_KEY,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
} from "@immortalis/contracts";
import { LocalOperatorSession, characterStatus } from "@immortalis/operator";
import { headOf, openOrdinary } from "../support/locality.ts";
import {
  PC_ID,
  STANDARD,
  author,
  localityCampaign,
  respondingConsole,
} from "../support/original-pc.ts";
import { LOCALITY_CAMPAIGN } from "../support/locality.ts";

/**
 * Measured on the pristine pre-S-4 base (`c6ea29d3`, same fixture, same scripted answers): one full journey asks the player exactly
 * this many things and prints exactly this many lines. The S-4 build must neither add nor remove any.
 */
const PRISTINE_ASKED = 16;
const PRISTINE_LINES = 96;
const ONE_EXCEPTION = ["I have sailed these waters since childhood"];

/** Words that would be new terminology for the player. None may appear anywhere in what the player is shown. */
const NEW_TERMS = /ledger|standing|instruction/i;

describe("S-4 ledger inside the shipped native-character path: invisible to the player, committed before the binding", () => {
  it("a full journey asks and prints exactly what it did before S-4, mentions none of the new vocabulary, and binds", async () => {
    const dirs = await localityCampaign();
    const { result, terminal } = await author(
      dirs,
      respondingConsole({ ...STANDARD, exceptions: ONE_EXCEPTION }),
    );
    expect(result.status).toBe("CHARACTER_BOUND");
    expect(terminal.asked()).toBe(PRISTINE_ASKED);
    expect(terminal.said).toHaveLength(PRISTINE_LINES);
    expect(terminal.said.filter((line) => NEW_TERMS.test(line))).toEqual([]);
    expect(JSON.stringify(result)).not.toMatch(NEW_TERMS);
  }, 120_000);

  it("the ledger is the character's own, empty, engine-origin, and strictly older than the binding that consumes it", async () => {
    const dirs = await localityCampaign();
    const { result } = await author(
      dirs,
      respondingConsole({ ...STANDARD, exceptions: ONE_EXCEPTION }),
    );
    expect(result.status).toBe("CHARACTER_BOUND");
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
      const head = c.store.getFact(pcStandingLedgerHeadKey(PC_ID))!;
      const version = c.store.getFact(pcStandingLedgerVersionKey(PC_ID, 1))!;
      const binding = c.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
      expect(head).toMatchObject({ owner: "pc_existence", facet: "standing_instruction_ledger" });
      expect(version).toMatchObject({
        owner: "pc_existence",
        facet: "standing_instruction_ledger",
      });
      const v = version.value as {
        origin: { kind: string };
        instructions: unknown[];
        previous: unknown;
      };
      expect(v.origin.kind).toBe(LEDGER_ORIGIN_ENGINE_CLOSURE);
      expect(v.instructions).toEqual([]);
      expect(v.previous).toBeNull();
      // one atomic group for both ledger facts, separate from and older than the binding's own group
      expect(head.provenance.group_id).toBe(version.provenance.group_id);
      expect(binding.provenance.group_id).not.toBe(head.provenance.group_id);
      const bindingGroup = c.store.committedGroup(binding.provenance.intent_id)!;
      expect(bindingGroup.depends_on).toContain(head.provenance.group_id);
      expect(bindingGroup.reads).toEqual(
        expect.arrayContaining([
          { key: pcStandingLedgerHeadKey(PC_ID), version: head.version },
          { key: pcStandingLedgerVersionKey(PC_ID, 1), version: version.version },
        ]),
      );
      // the ledger reads the character's own contract (the "newly created PC" origin), not the binding
      const ledgerGroup = c.store.committedGroup(head.provenance.intent_id)!;
      expect(ledgerGroup.writes.map((w) => w.key).sort()).toEqual(
        [pcStandingLedgerHeadKey(PC_ID), pcStandingLedgerVersionKey(PC_ID, 1)].sort(),
      );
      expect(ledgerGroup.reads.map((r) => r.key)).not.toContain(PLAYER_CHARACTER_BINDING_KEY);
    } finally {
      await c.close();
    }
  }, 120_000);

  it("a rerun after the journey, and the status read, ask nothing, print nothing new, write nothing and open no second ledger", async () => {
    const dirs = await localityCampaign();
    await author(dirs, respondingConsole({ ...STANDARD, exceptions: ONE_EXCEPTION }));
    const head = await headOf(dirs.campaignDir);
    const again = await author(dirs, respondingConsole(STANDARD));
    expect(again.result.status).toBe("CHARACTER_BOUND");
    expect(again.terminal.asked()).toBe(0);
    expect(again.terminal.said.filter((line) => NEW_TERMS.test(line))).toEqual([]);
    expect(await headOf(dirs.campaignDir)).toEqual(head);
    const opened = await LocalOperatorSession.open({
      campaignDir: dirs.campaignDir,
      operatorDir: dirs.operatorDir,
      expectedCampaignId: LOCALITY_CAMPAIGN,
    });
    if (!opened.ok) throw new Error("did not open");
    try {
      const status = await characterStatus(opened.value, dirs.operatorDir);
      expect(status.status).toBe("CHARACTER_BOUND");
      expect(JSON.stringify(status)).not.toMatch(NEW_TERMS);
    } finally {
      await opened.value.close();
    }
    expect(await headOf(dirs.campaignDir)).toEqual(head);
  }, 120_000);

  it("a character that is only released has no ledger yet (it is opened at placement); the resumed placement opens it, then binds", async () => {
    const dirs = await localityCampaign();
    const first = await author(
      dirs,
      respondingConsole({ ...STANDARD, exceptions: ONE_EXCEPTION, skipPlace: true }),
    );
    expect(first.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(first.terminal.said.filter((line) => NEW_TERMS.test(line))).toEqual([]);
    const released = await openOrdinary(dirs.campaignDir);
    try {
      expect(released.store.getFact(pcStandingLedgerHeadKey(PC_ID))).toBeUndefined();
      expect(released.store.getFact(pcStandingLedgerVersionKey(PC_ID, 1))).toBeUndefined();
      expect(released.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
    } finally {
      await released.close();
    }
    const resumed = await author(dirs, respondingConsole(STANDARD));
    expect(resumed.result.status).toBe("CHARACTER_BOUND");
    expect(resumed.terminal.said.filter((line) => NEW_TERMS.test(line))).toEqual([]);
    const c = await openOrdinary(dirs.campaignDir);
    try {
      expect(c.verify()).toEqual([]);
      expect(c.store.getFact(pcStandingLedgerHeadKey(PC_ID))).toBeDefined();
      expect(c.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeDefined();
    } finally {
      await c.close();
    }
  }, 120_000);
});
