/* eslint-disable @typescript-eslint/no-explicit-any -- scripted authenticated MCP/component client */
// Mechanism evidence only: scripted author/referee and real service/operators/owners. No Work client acceptance.
import { expect } from "vitest";
import type { PhoneDeps } from "../../apps/phone/src/server.ts";
import { REVIEW_CALLBACK, REVIEW_MIME } from "../../apps/phone/src/review-card.ts";
import type { Chat } from "./chat-client.ts";
import { courtyard } from "./chat-setting.ts";
import { draft, WORDS } from "./chat-character.ts";
import { MOMENT, DECLARATION, preparation, embodiment } from "./chat-route.ts";
export const UI_CAPS = {
  extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [REVIEW_MIME] } },
};
export const openingSetting = () => {
  const doc = courtyard();
  doc.locus.constraints.push({
    aspect: "lighting",
    statement: "It is daylight, with a clear view across the yard.",
  });
  doc.world.premise =
    "A small invented walled courtyard used as a wood yard, with five chopped logs on its floor.";
  doc.world.reference_causal_basis.established_canon =
    "This is an invented courtyard and wood yard; its logs are as authored here.";
  doc.source.access_facts[0].statement =
    "Every log can be reached by walking across the flagged floor.";
  doc.source.quantity.amount = 5;
  doc.source.statement = "Five chopped logs lie on the yard floor.";
  doc.source.material_class = "chopped-wood";
  doc.source.quantity.unit = "Pcs";
  return {
    ...doc,
    opening: {
      chronology: MOMENT,
      declaration: {
        ...DECLARATION,
        source_ground: "These five loose logs have no established claimant.",
      },
      reserve_condition: "dry",
    },
  };
};
export const openingCharacter = () => ({
  ...draft({ embodiment: embodiment(true).replace("one handful every", "one chopped log every") }),
  opening: {
    presence: WORDS.presence,
    preparation: {
      ...preparation(),
      cycle_quote: preparation().cycle_quote.replace("one handful every", "one chopped log every"),
    },
  },
});
export interface Journey {
  reviews: {
    category: string;
    material: string;
    proposal: string;
    decision: string;
    channel: "ui" | "elicitation";
  }[];
  tools: number;
  model: string[];
  privateCapabilities: string[];
}
export const journey = (): Journey => ({
  reviews: [],
  tools: 0,
  model: [],
  privateCapabilities: [],
});
export async function call(chat: Chat, j: Journey, name: string, args: any = {}) {
  j.tools++;
  const r = await chat.call(name, args, () => {
    throw new Error("elicitation is ABSENT in the inline UI fixture");
  });
  const visible = JSON.stringify({
    content: r.result?.content,
    structuredContent: r.result?.structuredContent,
  });
  j.model.push(visible);
  expect(visible).not.toMatch(/\/confirm|type exactly/);
  return r;
}
/** Simulated component control event: private _meta bypasses the scripted model. Real component bridge separately exercised in unit harness. */
export async function accept(chat: Chat, j: Journey, r: any, decision = "accept") {
  const v = r.result?._meta?.review;
  expect(
    v,
    `complete component-private review: ${JSON.stringify(r.result?.content)}`,
  ).toBeDefined();
  expect(JSON.stringify(r.result.content)).not.toContain(v.capability);
  expect(JSON.stringify(r.result.structuredContent)).not.toContain(v.capability);
  j.privateCapabilities.push(v.capability);
  j.reviews.push({
    category: v.category,
    material: v.material,
    proposal: v.proposal_id,
    decision,
    channel: "ui",
  });
  const a = await call(chat, j, REVIEW_CALLBACK, {
    proposal_id: v.proposal_id,
    digest: v.digest,
    capability: v.capability,
    decision,
  });
  expect(a.isError).toBe(false);
  return a;
}
export async function reviewProposal(
  chat: Chat,
  j: Journey,
  name: string,
  args: any,
  decision = "accept",
) {
  let r = await call(chat, j, name, args);
  for (let i = 0; i < 30 && !r.result?._meta?.review && !r.isError; i++)
    r = await call(chat, j, "await_action", { after: 0, wait_seconds: 1 });
  await accept(chat, j, r, decision);
  for (let i = 0; i < 30; i++) {
    r = await call(chat, j, "await_action", { after: 0, wait_seconds: 1 });
    if (r.data?.state === "FINISHED" || r.result?.structuredContent?.opening?.state === "REALIZING")
      return r;
  }
  throw new Error("reviewed root operation did not settle");
}
export async function openingSettled(chat: Chat, j: Journey) {
  for (let i = 0; i < 120; i++) {
    const r = await call(chat, j, "await_action", { after: 0, wait_seconds: 1 });
    expect(r.result?._meta?.review, "no redundant technical review").toBeUndefined();
    const o = r.result?.structuredContent?.opening;
    if (o && o.state !== "REALIZING") return o;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("opening did not settle");
}

/** A fresh, empty, original-author slot with actual operators/owners and scripted referee plumbing. */
export async function supportedOpening(deps: PhoneDeps = {}) {
  const { slot, run } = await import("./chat-setting.ts");
  const { hosts } = await import("./chat-route.ts");
  const s = await slot({ playerViewHostId: "view-host" });
  const referees = await hosts(s);
  const r = await run(s, deps, undefined, UI_CAPS);
  const j = journey();
  return {
    ...r,
    s,
    j,
    hosts: referees,
    stop: async () => {
      for (const h of referees) await h.stop();
      await r.app.close();
    },
  };
}
export async function completeOpening(
  r: Awaited<ReturnType<typeof supportedOpening>>,
  setting = openingSetting(),
  character = openingCharacter(),
) {
  await reviewProposal(r.chat, r.j, "propose_original_setting", setting);
  await reviewProposal(r.chat, r.j, "propose_original_character", character);
  const opening = await openingSettled(r.chat, r.j);
  expect(opening).toMatchObject({ state: "PREPARED" });
  return opening;
}
