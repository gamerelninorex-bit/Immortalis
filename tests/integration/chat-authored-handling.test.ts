/* eslint-disable @typescript-eslint/no-explicit-any -- authenticated scripted client and owner readback */
// SCRIPTED MECHANISM ONLY. Prior chat is represented by independently authored fixture words, not transcript ingestion or AI inference.
import { existsSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { acceptedClaims } from "../../apps/phone/src/route-stages.ts";
import { Chat, REFEREE } from "../support/chat-client.ts";
import { WORDS, keepFiles } from "../support/chat-character.ts";
import { ACTUATOR, MOMENT, TAU, TRAVERSAL, stage } from "../support/chat-route.ts";
import { run, slot } from "../support/chat-setting.ts";
import { authoredCharacter, cycle, ownerState } from "../support/authored-handling.ts";
import { routeMeter } from "../support/route-meter.ts";
import {
  openingSetting,
  openingSettled,
  reviewProposal,
  supportedOpening,
} from "../support/two-review-opening.ts";

it("served instructions and schema carry earlier authored handling into the first proposal with zero redundant confirmation", async () => {
  const s = await slot();
  const r = await run(s, {}, undefined, {});
  try {
    const init = await r.chat.rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "scripted-handling", version: "1" },
    });
    expect(init.json.result.instructions).toContain("from prior chat verbatim");
    const list = await r.chat.rpc("tools/list");
    const tool = list.json.result.tools.find((t: any) => t.name === "propose_original_character");
    expect(tool.description).toContain("from prior chat verbatim");
    expect(tool.description).toContain("Do not ask the player to repeat known details");
    expect(tool.description).toContain("without another approval");
    expect(tool.inputSchema.properties.opening.description).toContain(
      "preparation alone does not add",
    );
    expect(tool.inputSchema.properties.embodiment.description).toContain(
      "one-cycle words verbatim",
    );
  } finally {
    await r.app.close();
  }
});

it("each missing quote, unresolved-only words and cross-statement text refuse before dispatch, owner access or retained character mutation", async () => {
  const s = await slot();
  const r = await run(s, {}, undefined, {});
  const meter = routeMeter();
  try {
    const gm = new Chat(s.base);
    expect((await gm.link("referee", { referee: REFEREE })).ok).toBe(true);
    await gm.init({});
    expect(
      (await gm.call("propose_original_character", authoredCharacter())).json.error,
    ).toBeDefined();
    for (const omitted of [0, 1, 2, "open", "split"] as const) {
      const character = authoredCharacter();
      if (typeof omitted === "number") character.exceptions.splice(omitted, 1);
      else if (omitted === "open") {
        character.open = character.exceptions;
        character.exceptions = [];
      } else character.exceptions = [ACTUATOR.slice(0, 20), ACTUATOR.slice(20), TRAVERSAL, cycle];
      const before = meter.snapshot();
      const result = await r.chat.call("propose_original_character", character);
      expect(result.isError).toBe(true);
      expect(result.text).toContain("inconsistent first-opening preparation");
      expect(result.text).toContain("opening.preparation.");
      expect(result.elicited).toEqual([]);
      expect(meter.counts.opens).toBe(before.opens);
      expect(meter.counts.prepare_groups).toBe(before.prepare_groups);
      expect(existsSync(s.campaignDir)).toBe(false);
      expect(keepFiles(s)).toEqual([]);
      expect(
        readdirSync(s.operatorDir).filter((f) => /character-words|pending|chat-requests/.test(f)),
      ).toEqual([]);
    }
  } finally {
    meter.stop();
    await r.app.close();
  }
});

it("an omission can be corrected from earlier words before seal; owners retain provenance, setup is inert, and a separately chosen one-unit move completes once", async () => {
  const r = await supportedOpening();
  try {
    await reviewProposal(r.chat, r.j, "propose_original_setting", openingSetting());
    const before = await ownerState(r.s);
    const omitted = authoredCharacter();
    omitted.exceptions = [];
    const refused = await reviewProposal(r.chat, r.j, "propose_original_character", omitted);
    expect(refused.isError).toBe(true);
    expect(await ownerState(r.s)).toEqual(before);
    expect(keepFiles(r.s)).toEqual([]);
    await reviewProposal(r.chat, r.j, "propose_original_character", authoredCharacter());
    expect(await openingSettled(r.chat, r.j)).toMatchObject({ state: "PREPARED" });
    const ready = await ownerState(r.s);
    expect(ready).toMatchObject({ source: 5, reserves: [0], time: MOMENT.value, commitments: 0 });
    const claims = acceptedClaims(ready.pc as any);
    for (const quote of [ACTUATOR, TRAVERSAL, cycle]) {
      const claim = claims.find((c) => c.statement === quote)!;
      expect(claim).toBeDefined();
      expect(ready.mechanism.authored_from.claims).toContainEqual(claim.locator);
    }
    expect(ready.order[0]!).toBeLessThan(ready.order[1]!);
    expect(ready.order[1]!).toBeLessThan(ready.order[2]!);
    const noHuman = () => {
      throw new Error("no redundant approval");
    };
    for (const [tool, args] of [
      ["collect", { amount: 1 }],
      ["continue_collection", {}],
      ["finish_collection", {}],
    ] as const)
      expect((await stage(r.chat, tool, args, noHuman)).finished.data.exit_code).toBe(0);
    const moved = await ownerState(r.s);
    expect(moved).toMatchObject({
      source: 4,
      reserves: [1],
      time: MOMENT.value + TAU,
      commitments: 1,
    });
    expect((await stage(r.chat, "finish_collection", {}, noHuman)).finished.data.exit_code).toBe(3);
    await stage(r.chat, "reconcile_last_action", {}, noHuman);
    expect(await ownerState(r.s)).toEqual(moved);
    expect(
      (
        await r.chat.call("revise_original_character", {
          edits: [{ op: "set", field: "embodiment", text: "A changed body" }],
        })
      ).isError,
    ).toBe(true);
    expect((await r.chat.call("propose_original_character", authoredCharacter())).isError).toBe(
      true,
    );
    expect(await ownerState(r.s)).toEqual(moved);
    expect(r.j.reviews).toEqual([]);
  } finally {
    await r.stop();
  }
}, 180_000);

for (const presence of [false, true])
  it(`no preparation remains valid (${presence ? "placement-only" : "standalone"}); no handling details are inferred`, async () => {
    const r = await supportedOpening();
    try {
      await reviewProposal(r.chat, r.j, "propose_original_setting", openingSetting());
      const character: any = {
        identity: "Bob",
        baseline_human: "An ordinary human with nothing special.",
      };
      if (presence) character.opening = { presence: WORDS.presence };
      const result = await reviewProposal(r.chat, r.j, "propose_original_character", character);
      expect(result.isError).toBe(false);
      if (presence)
        expect(await openingSettled(r.chat, r.j)).toMatchObject({ state: "MISSING_SOURCE" });
      const held = await ownerState(r.s);
      expect(held.pc).toBeDefined();
      expect(held).toMatchObject({
        source: 5,
        reserves: [],
        time: presence ? MOMENT.value : null,
        commitments: 0,
      });
      expect(held.mechanism).toBeUndefined();
      expect(r.j.reviews).toEqual([]);
    } finally {
      await r.stop();
    }
  }, 120_000);

it("matching text cannot override an owner refusal", async () => {
  const { hosts, routePolicy } = await import("../support/chat-route.ts");
  const s = await slot({ playerViewHostId: "view-host" });
  const hs = await hosts(
    s,
    routePolicy({ classify: [{ match: /hands of this body/, class: "UNRESOLVED_PC" }] }),
  );
  const r = await run(s, {}, undefined, {});
  const { journey } = await import("../support/two-review-opening.ts");
  const j = journey();
  try {
    await reviewProposal(r.chat, j, "propose_original_setting", openingSetting());
    const result = await reviewProposal(
      r.chat,
      j,
      "propose_original_character",
      authoredCharacter(),
    );
    expect(result.data?.exit_code).not.toBe(0);
    expect((await ownerState(s)).pc).toBeUndefined();
    expect(keepFiles(s)).toEqual([]);
    expect(j.reviews).toEqual([]);
  } finally {
    for (const h of hs) await h.stop();
    await r.app.close();
  }
}, 120_000);
