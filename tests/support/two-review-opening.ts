/* eslint-disable @typescript-eslint/no-explicit-any -- scripted authenticated MCP/component client */
// Mechanism evidence only: scripted author/referee and real service/operators/owners. No Work client acceptance.
import { expect } from "vitest";
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
  ...draft({ embodiment: embodiment(true) }),
  opening: { presence: WORDS.presence, preparation: preparation() },
});
export interface Journey {
  reviews: { category: string; material: string; proposal: string }[];
  tools: number;
  model: string[];
}
export const journey = (): Journey => ({ reviews: [], tools: 0, model: [] });
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
  j.reviews.push({ category: v.category, material: v.material, proposal: v.proposal_id });
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
    if (r.data?.state === "FINISHED") return r;
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
