// The pure assembly of the player-safe supported-play briefing: its shape is closed, its embedded observation is the gateway's own value
// or refusal with nothing added, and a briefing that could not be read says so without disclosing anything.
import {
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  fail,
} from "@immortalis/contracts";
import { describe, expect, it } from "vitest";
import {
  SCOPE_NOTICE,
  assembleBriefing,
  unavailableContext,
  type PlayContextRead,
} from "../../apps/phone/src/play-context.ts";

const refusal = fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);
const account = {
  play: { kind: "OPEN", time: null, attempts: 0, latest: { phase: "NO_ATTEMPT" } } as const,
  next: "No gathering is open. A new gathering needs the player's request.",
};

describe("assembleBriefing", () => {
  const read: PlayContextRead = {
    status: "QUALIFIED",
    setting: {
      state: "ESTABLISHED",
      readback: {
        world_id: "w",
        locus_id: "l",
        locus_designation: "A place",
        source_key: "s",
        dimension: "d",
        material_class: "m",
        established: { amount: 12, unit: "stone" },
      },
    },
    character: {
      state: "BOUND",
      readback: {
        character_id: "pc",
        world_id: "w",
        locus_id: "l",
        mirror: [{ section: "Identity", label: "form", text: "One body" }],
        presence: "I am here",
      },
    },
    play: account.play,
    observation: refusal,
  };

  it("has exactly the four named parts and the fixed scope notice, in order", () => {
    const b = assembleBriefing(read, account);
    expect(Object.keys(b)).toEqual([
      "status",
      "authored_starting_context",
      "out_of_character",
      "character_awareness",
      "scope_notice",
    ]);
    expect(Object.keys(b.authored_starting_context)).toEqual(["setting", "character"]);
    expect(Object.keys(b.out_of_character)).toEqual(["play", "next"]);
    expect(Object.keys(b.character_awareness)).toEqual(["current_observation"]);
    expect(b.scope_notice).toBe(SCOPE_NOTICE);
  });

  it("keeps out-of-character status apart from what the character has perceived", () => {
    const b = assembleBriefing(read, account);
    expect(JSON.stringify(b.character_awareness)).not.toMatch(/phase|time|attempts|goal|next/);
    expect(JSON.stringify(b.out_of_character)).not.toMatch(/PROJECTION|presentation|elements/);
  });

  it("embeds the gateway's own value or refusal untouched: no source, diagnostic, interpretation or memory field", () => {
    expect(assembleBriefing(read, account).character_awareness.current_observation).toBe(refusal);
    const earned = {
      ok: true as const,
      value: {
        presentation: "NPK_EVENT_SIGNAL" as const,
        disposable: true as const,
        form: "EVENT_SIGNAL" as const,
        viewpoint: { role: "role.player_character" as const, entity_id: "pc" },
        elements: [
          { element: "CONTACT" as const, channel: "PERCEPTION" as const },
          { element: "REFERENT" as const, text: "a thing" },
          { element: "CONTENT" as const, text: "its look" },
        ],
      },
    };
    const b = assembleBriefing({ ...read, observation: earned as never }, account);
    expect(b.character_awareness.current_observation).toBe(earned);
    expect(JSON.stringify(b.character_awareness)).toBe(
      `{"current_observation":${JSON.stringify(earned)}}`,
    );
  });

  it("the fixed notice names no cause or owner machinery (the neutral-word guard of the independent-consequence suite)", () => {
    expect(SCOPE_NOTICE).not.toMatch(
      /sunset|expire|instrument|ordinance|institution|office|governance|boundary|closure|reach|verdict|task|secret|token/i,
    );
  });

  it("says nothing the notice does not: the notice grants and establishes nothing", () => {
    expect(SCOPE_NOTICE).toMatch(/limited to the information it carries/);
    expect(SCOPE_NOTICE).toMatch(/does not establish any constraint, permission or fact/);
    expect(SCOPE_NOTICE).toMatch(/grants no action authority/);
    expect(SCOPE_NOTICE).toMatch(/established quantity is not what remains now/);
  });
});

describe("a briefing that could not be read", () => {
  it("is UNAVAILABLE in every part, with the opaque refusal and the reason it gave, and no readback", () => {
    const u = unavailableContext({ kind: "UNAVAILABLE", detail: "the server is closing" });
    expect(u).toEqual({
      status: "UNAVAILABLE",
      setting: { state: "UNAVAILABLE" },
      character: { state: "UNAVAILABLE" },
      play: { kind: "UNAVAILABLE", detail: "the server is closing" },
      observation: refusal,
    });
    expect(JSON.stringify(u)).not.toMatch(/readback|mirror|presence/);
  });
});
