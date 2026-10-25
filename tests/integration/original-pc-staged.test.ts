/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap an owner operation to simulate a lost acknowledgement */
// The narrow staging seam the ordinary-chat front end uses on the SHIPPED `author-character` (BLUE v5.2-A1): the player's own words are
// supplied instead of the console questions, the keep+release and the placement are two separate runs, and nothing else about the
// operator path changes (the same Mirror, findings, challenge, owners and verification). The console tests keep their own coverage; these
// show the seam does not weaken it.
import { describe, expect, it, vi } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { compileContract, type CharacterDraft } from "@immortalis/operator";
import { headOf, openOrdinary } from "../support/locality.ts";
import {
  KEEP,
  PC_ID,
  PLACE,
  WORDS,
  author,
  localityCampaign,
  me,
  scriptedConsole,
  scriptedPolicy,
} from "../support/original-pc.ts";

const words: CharacterDraft = {
  identity: me(WORDS.identityFinal),
  contact: { kind: "CONTACT_ANCHOR", surfaces: [me(WORDS.contact)] },
  embodiment: me(WORDS.embodiment),
  continuity: me(WORDS.continuity),
  exceptions: [],
  open: [],
  possessions: [me(WORDS.possession)],
};
const said = (t: { said: string[] }) => t.said.join("\n");

describe("the KEEP stage: the player's words, the whole Mirror once, the human's own phrase, the release - and no placement", () => {
  it("asks exactly one thing (the keep), releases, reports released-and-unbound, and the placement stage then asks exactly one thing", async () => {
    const dirs = await localityCampaign();
    const kept = await author(dirs, scriptedConsole(KEEP), {
      chat: { stage: "KEEP", draft: words },
    });
    expect(kept.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(kept.terminal.asked()).toBe(1);
    expect(said(kept.terminal)).toContain("CHARACTER MIRROR");
    expect(said(kept.terminal)).not.toContain("identity>");
    expect(said(kept.terminal)).not.toContain('Type "change"');
    expect(said(kept.terminal)).not.toContain("PLACEMENT");
    const c1 = await openOrdinary(dirs.campaignDir);
    expect(c1.playerCharacter(PC_ID)).toBeDefined();
    expect(c1.binding()).toBeUndefined();
    await c1.close();

    const placed = await author(dirs, scriptedConsole(PLACE), {
      chat: { stage: "PLACE", presence: WORDS.presence },
    });
    expect(placed.result.status).toBe("CHARACTER_BOUND");
    expect(placed.terminal.asked()).toBe(1);
    expect(said(placed.terminal)).not.toContain("presence>");
    const c2 = await openOrdinary(dirs.campaignDir);
    expect(c2.binding()!.value.transition).toMatchObject({
      basis: { statement: WORDS.presence, bridge: "NATIVE_ALREADY_THERE" },
    });
    await c2.close();
  }, 120_000);

  it("a decline, an end of input, a wrong phrase and the console's own 'change' all keep nothing: there is no edit grammar in the staged run", async () => {
    for (const line of ["no", null, "keep-character 000000000000", "change"] as const) {
      const dirs = await localityCampaign();
      const before = await headOf(dirs.campaignDir);
      const out = await author(dirs, scriptedConsole(line), {
        chat: { stage: "KEEP", draft: words },
      });
      expect(out.result.status).toBe("DECLINED");
      expect(out.terminal.asked()).toBe(1);
      expect(await headOf(dirs.campaignDir)).toEqual(before);
    }
  }, 120_000);

  it("a candidate the referee did not close is shown with its findings, is offered no phrase, and asks nothing", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const out = await author(
      dirs,
      scriptedConsole(),
      {
        chat: {
          stage: "KEEP",
          draft: { ...words, possessions: ["A hundred independent sworn soldiers"] },
        },
      },
      scriptedPolicy({ classify: [{ match: /soldiers/, class: "ACTOR_STANCE_CLAIM" }] }),
    );
    expect(out.result.status).toBe("DECLINED");
    expect(out.result.details.join(" ")).toContain("referee");
    expect(out.terminal.asked()).toBe(0);
    expect(said(out.terminal)).toContain("NOT accepted: ACTOR_STANCE_CLAIM");
    expect(said(out.terminal)).not.toMatch(/type exactly "keep-character/);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 120_000);

  it("a kept character is finished from what was kept and is never asked again; a different candidate offered after the keep is a conflict", async () => {
    const dirs = await localityCampaign();
    vi.spyOn(CanonicalCampaign.prototype as any, "releasePlayerCharacter").mockResolvedValue({
      ok: false,
      error: { code: "UNKNOWN_OUTCOME", message: "lost" },
    });
    const first = await author(dirs, scriptedConsole(KEEP), {
      chat: { stage: "KEEP", draft: words },
    });
    vi.restoreAllMocks();
    expect(first.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
    const other = await author(dirs, scriptedConsole(), {
      chat: { stage: "KEEP", draft: { ...words, identity: "Somebody else" } },
    });
    expect(other.result.status).toBe("CHARACTER_CONFLICT");
    expect(other.terminal.asked()).toBe(0);
    const resumed = await author(dirs, scriptedConsole(), { chat: { stage: "KEEP" } });
    expect(resumed.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(resumed.terminal.asked()).toBe(0);
    expect(said(resumed.terminal)).toContain("RESUMING");
    // the same words offered again after the release are likewise not asked again
    const same = await author(dirs, scriptedConsole(), { chat: { stage: "KEEP", draft: words } });
    expect(same.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(same.terminal.asked()).toBe(0);
    expect(compileContract(PC_ID, words)).toBeTruthy();
  }, 120_000);
});

describe("the PLACE stage: only a released character, only the player's own statement, only the human's own phrase", () => {
  it("refuses with nothing asked or written when no character was kept, and when one was kept but not released", async () => {
    const dirs = await localityCampaign();
    const before = await headOf(dirs.campaignDir);
    const out = await author(dirs, scriptedConsole(), {
      chat: { stage: "PLACE", presence: WORDS.presence },
    });
    expect(out.result.status).toBe("CHARACTER_NONE");
    expect(out.terminal.asked()).toBe(0);
    expect(await headOf(dirs.campaignDir)).toEqual(before);
  }, 60_000);

  it("a declined or empty placement leaves exactly released-and-unbound; an already-bound character is reported, not asked", async () => {
    const dirs = await localityCampaign();
    await author(dirs, scriptedConsole(KEEP), { chat: { stage: "KEEP", draft: words } });
    const declined = await author(dirs, scriptedConsole("no"), {
      chat: { stage: "PLACE", presence: WORDS.presence },
    });
    expect(declined.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    const empty = await author(dirs, scriptedConsole(), {
      chat: { stage: "PLACE", presence: "   " },
    });
    expect(empty.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
    expect(empty.terminal.asked()).toBe(0);
    const bound = await author(dirs, scriptedConsole(PLACE), {
      chat: { stage: "PLACE", presence: WORDS.presence },
    });
    expect(bound.result.status).toBe("CHARACTER_BOUND");
    const again = await author(dirs, scriptedConsole(), {
      chat: { stage: "PLACE", presence: WORDS.presence },
    });
    expect(again.result.status).toBe("CHARACTER_BOUND");
    expect(again.terminal.asked()).toBe(0);
  }, 120_000);

  it("a stage offered the other stage's input is an invalid request: nothing is asked", async () => {
    const dirs = await localityCampaign();
    for (const chat of [
      { stage: "KEEP", presence: "x" },
      { stage: "PLACE", draft: words, presence: "x" },
      { stage: "PLACE" },
    ] as const) {
      const out = await author(dirs, scriptedConsole(), { chat: chat as never });
      expect(out.result.status).toBe("INVALID_REQUEST");
      expect(out.terminal.asked()).toBe(0);
    }
  }, 60_000);
});
