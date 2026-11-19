/* eslint-disable @typescript-eslint/no-explicit-any -- scripted authenticated MCP and owner readback */
// A04 mechanism evidence through the registered tool, authenticated client, operator and retained campaign.
import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SHORT,
  WORDS,
  draft,
  held,
  keepFiles,
  offer,
  ready,
  referee,
  run,
  wordsFile,
} from "../support/chat-character.ts";
import { pendingPath } from "../support/chat-setting.ts";
import { ACTUATOR, TRAVERSAL } from "../support/chat-route.ts";
import { authoredCharacter, cycle, ownerState } from "../support/authored-handling.ts";
import {
  openingSetting,
  openingSettled,
  reviewProposal,
  supportedOpening,
} from "../support/two-review-opening.ts";

const baseline = "One ordinary human body, with no unusual faculties.";
const shorthand = { identity: `  ${WORDS.identity}  `, baseline_human: `  ${baseline}  ` };
const open = "I leave the details of my earlier travels undecided.";
const exception = "My left hand is missing two fingers.";

describe("A04 registered original-character shorthand", () => {
  it.each([
    { name: "baseline alone" },
    { name: "open alone", open: [`  ${open}  `] },
    { name: "possessions alone", possessions: [`  ${WORDS.possession}  `] },
    { name: "exceptions alone", exceptions: [exception] },
    { name: "both optional lists", open: [open], possessions: [WORDS.possession] },
    {
      name: "all optional lists",
      open: [open],
      possessions: [WORDS.possession],
      exceptions: [exception],
    },
  ])(
    "releases and reopens the original review for $name",
    async ({ name, ...fields }) => {
      const r = await ready();
      const host = referee(r.s);
      try {
        const tools = (await r.chat.rpc("tools/list")).json.result.tools;
        const { inputSchema } = tools.find((t: any) => t.name === "propose_original_character");
        expect(inputSchema.properties).toHaveProperty("open");
        expect(inputSchema.properties).toHaveProperty("possessions");
        expect(inputSchema.properties).not.toHaveProperty("open_items");
        expect(inputSchema.properties).not.toHaveProperty("initial_possessions");

        const { proposed, finished } = await offer(r.chat, { ...shorthand, ...fields });
        expect(proposed.isError, name).toBe(false);
        expect(finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
        expect(finished.elicited).toEqual([]);
        expect(finished.result?._meta?.review).toBeUndefined();
        const mirror = finished.result.structuredContent.request_readback.character;
        for (const word of [WORDS.identity, baseline, ...Object.values(fields).flat()])
          expect(mirror).toContain(word.trim());
        expect(host.answered).toHaveLength(1);
        const h = await held(r.s);
        expect(h.characters).toHaveLength(1);
        expect(h.binding).toBeUndefined();
        expect(h.keys.some((key) => /inventory|^production\/reserve\//.test(key))).toBe(false);
        expect(h.characters[0]!.value).toMatchObject({
          identity_agency: { statement: WORDS.identity, provenance: "PLAYER-AUTHORED" },
          contact: { kind: "CONTACT_ANCHOR", surfaces: [{ statement: baseline }] },
          embodiment_topology: { statement: baseline },
          continuity_rule: { statement: baseline },
          baseline_exception: {
            safely_inherited: [],
            player_overrides: (fields.exceptions ?? []).map((statement) => ({ statement })),
            unresolved: (fields.open ?? []).map((word) => word.trim()),
          },
          entry_envelope: {
            items: (fields.possessions ?? []).map((word) => ({
              statement: word.trim(),
              provenance: "PLAYER-AUTHORED",
            })),
          },
        });
        expect(keepFiles(r.s)).toHaveLength(1);
      } finally {
        await host.stop();
        await r.app.close();
      }

      const fresh = await run(r.s, SHORT);
      try {
        const status = await fresh.chat.call("original_character_status");
        expect(status.data.character.state).toBe("RELEASED_UNBOUND");
        expect(JSON.stringify(status.data)).toContain(WORDS.identity);
      } finally {
        await fresh.app.close();
      }
    },
    120_000,
  );

  it("keeps the fully authored route with distinct contact, embodiment and continuity", async () => {
    const r = await ready();
    const host = referee(r.s);
    try {
      const { finished } = await offer(r.chat, draft({ open: [open], exceptions: [exception] }));
      expect(finished.data.result.status).toBe("CHARACTER_RELEASED_UNBOUND");
      expect(finished.elicited).toEqual([]);
      expect((await held(r.s)).characters[0]!.value).toMatchObject({
        contact: { surfaces: [{ statement: WORDS.contact }] },
        embodiment_topology: { statement: WORDS.embodiment },
        continuity_rule: { statement: WORDS.continuity },
        baseline_exception: { unresolved: [open], player_overrides: [{ statement: exception }] },
        entry_envelope: { items: [{ statement: WORDS.possession }] },
      });
    } finally {
      await host.stop();
      await r.app.close();
    }
  }, 120_000);

  it("takes authored starting presence and preparation through the ordinary owners", async () => {
    const r = await supportedOpening();
    try {
      await reviewProposal(r.chat, r.j, "propose_original_setting", openingSetting());
      const { opening } = authoredCharacter();
      const result = await reviewProposal(r.chat, r.j, "propose_original_character", {
        ...shorthand,
        open: [open],
        possessions: [WORDS.possession],
        exceptions: [ACTUATOR, TRAVERSAL, cycle],
        opening,
      });
      expect(result.isError).toBe(false);
      expect(await openingSettled(r.chat, r.j)).toMatchObject({ state: "PREPARED" });
      const state = await ownerState(r.s);
      expect(state).toMatchObject({ source: 5, reserves: [0], commitments: 0 });
      expect(state.pc).toMatchObject({
        baseline_exception: { unresolved: [open] },
        entry_envelope: { items: [{ statement: WORDS.possession }] },
      });
      expect((await held(r.s)).binding?.value.transition).toMatchObject({
        basis: { statement: WORDS.presence },
      });
      expect(r.j.reviews).toEqual([]);
    } finally {
      await r.stop();
    }
  }, 120_000);

  it("refuses malformed or unauthorized fields without a dispatch, record or confirmation", async () => {
    const r = await ready();
    try {
      const before = await held(r.s);
      const files = readdirSync(r.s.operatorDir).sort();
      const { opening } = authoredCharacter();
      for (const fields of [
        { unexpected: true },
        { open_items: [open] },
        { initial_possessions: [WORDS.possession] },
        { open: "not a list" },
        { open: [" "] },
        { possessions: [false] },
        { possessions: Array.from({ length: 13 }, () => WORDS.possession) },
        { exceptions: [null] },
        { contact: { kind: "CONTACT_ANCHOR", surfaces: [WORDS.contact] } },
        { embodiment: WORDS.embodiment },
        { continuity: WORDS.continuity },
        { confirmed: true },
        { campaign_id: "other-campaign" },
        { baseline_human: 1 },
        { baseline_human: "" },
        {
          exceptions: [ACTUATOR, TRAVERSAL],
          opening: {
            ...opening,
            preparation: { ...opening.preparation, cycle_quote: "It takes one invented second" },
          },
        },
      ]) {
        const result = await r.chat.call("propose_original_character", { ...shorthand, ...fields });
        expect(result.isError, JSON.stringify(fields)).toBe(true);
        expect(result.elicited).toEqual([]);
        expect(result.result?._meta?.review).toBeUndefined();
        if ("opening" in fields)
          expect(result.text).toContain("inconsistent first-opening preparation");
        expect(readdirSync(r.s.operatorDir).sort()).toEqual(files);
        expect(existsSync(pendingPath(r.s.config))).toBe(false);
        expect(wordsFile(r.s)).toBeNull();
      }
      expect(await held(r.s)).toEqual(before);
      expect(keepFiles(r.s)).toEqual([]);
    } finally {
      await r.app.close();
    }
  }, 120_000);
});
