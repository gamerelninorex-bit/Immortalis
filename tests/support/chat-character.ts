/* eslint-disable @typescript-eslint/no-explicit-any -- a scripted MCP client reads untyped JSON-RPC */
// TEST SUPPORT for the chat-requested ORIGINAL character (BLUE v5.2-A1). Everything driven through it is a MECHANISM test: the "assistant"
// is a script that calls typed tools, the "human" is a script that answers an elicitation only where a test says so, the "referee host" is
// the scripted PLUMBING host of the original-pc tests (it demonstrates what the engine enforces, nothing about whether an AI understood a
// sentence), and the shipped `author-character` operator path and the real owners do all the work. The world and place are admitted by the
// shipped `establish-locality` path through the chat tools of the previous slice. No fixture owner is registered; nothing here supplies a
// status, an owner result, a keep, a binding or a confirmation.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { bindHost } from "@immortalis/operator";
import { LOCALITY_CAMPAIGN, openOrdinary } from "./locality.ts";
import {
  HOST_ID,
  plainPolicy,
  scriptedPolicy,
  startScriptedHost,
  type Policy,
  type ScriptedHost,
} from "./original-pc.ts";
import {
  LOCUS,
  WORLD,
  courtyard,
  establishViaChat,
  follow,
  reader,
  run,
  slot,
  type Running,
  type Slot,
} from "./chat-setting.ts";
import type { Chat, Human } from "./chat-client.ts";
import type { PhoneDeps } from "../../apps/phone/src/server.ts";

export { LOCALITY_CAMPAIGN, LOCUS, WORLD, follow, openOrdinary, reader, run, slot };
export type { Running, Slot };

/** A wholly fictional, ordinary continuing adult: authored content for a test, not a production default or an outcome. */
export const WORDS = {
  identity: "Maren Voss, an ordinary human salt-raker of about forty winters",
  contact: "A weathered woman in a salt-stained coat who speaks the local tongue",
  embodiment: "One ordinary human body",
  continuity: "I remain myself for as long as I live; when my body dies I am dead.",
  possession: "A salt-raker's knife and a coil of rope",
  presence: "I have always lived here: I am originally present in the walled courtyard.",
} as const;

export const draft = (over: Record<string, unknown> = {}): any => ({
  identity: WORDS.identity,
  contact: { kind: "CONTACT_ANCHOR", surfaces: [WORDS.contact] },
  embodiment: WORDS.embodiment,
  continuity: WORDS.continuity,
  exceptions: [],
  open: [],
  possessions: [WORDS.possession],
  ...over,
});

/** The shorter waits a test uses where the referee host is not expected to answer (the real defaults are minutes). */
export const SHORT: PhoneDeps = { character: { refereePolls: 30, refereePollMs: 20 } };

export const FOUR_OPS = [
  "I002_CLASSIFY",
  "IR_NATIVE_COMPATIBILITY",
  "IR_PHYSICAL_PLACEMENT",
  "F014D_DIRECT_PERCEPTION",
] as const;

/** The trusted operator binds a referee host (a deployment step; never a tool). */
export async function bind(
  s: Slot,
  operations: readonly string[] = FOUR_OPS,
  hostId: string = HOST_ID,
): Promise<void> {
  const bound = await bindHost({
    stateDir: s.operatorDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorUid: process.getuid!(),
    hostId,
    operations: operations as any,
  });
  if (!bound.ok) throw new Error(`host not bound: ${bound.error.code}`);
}

/** Runs the scripted referee host (plumbing only) over the slot's real exchange until stopped. */
export const referee = (s: Slot, policy: Policy = plainPolicy): ScriptedHost =>
  startScriptedHost({ operatorDir: s.operatorDir } as any, policy);

export { plainPolicy, scriptedPolicy };

/** A slot whose original setting was admitted through the previous slice's chat path and whose referee host is bound. */
export async function ready(
  deps: PhoneDeps = SHORT,
  mutate: (doc: any) => void = () => undefined,
): Promise<Running & { s: Slot }> {
  const s = await slot();
  await bind(s);
  const r = await run(s, deps);
  const doc = courtyard();
  mutate(doc);
  const est = await establishViaChat(r.chat, doc);
  if (est.finished.data?.result?.status !== "LOCALITY_READY")
    throw new Error("the original setting was not established");
  return { ...r, s };
}

export interface Journey {
  readonly proposed: any;
  readonly finished: any;
}

export async function offer(
  chat: Chat,
  input: any = draft(),
  human: Human | null = reader,
): Promise<Journey> {
  const proposed = await chat.call("propose_original_character", input);
  if (proposed.isError || proposed.data?.state === "FINISHED" || human === null)
    return { proposed, finished: proposed };
  return { proposed, finished: await follow(chat, human, 20) };
}

export async function place(
  chat: Chat,
  statement: string = WORDS.presence,
  human: Human | null = reader,
): Promise<Journey> {
  const proposed = await chat.call("place_original_character", { statement });
  if (proposed.isError || proposed.data?.state === "FINISHED" || human === null)
    return { proposed, finished: proposed };
  return { proposed, finished: await follow(chat, human, 20) };
}

/** The facts the campaign holds of the character, read afresh with the ordinary registry (the service is closed while this runs). */
export async function held(s: Slot) {
  const c = await openOrdinary(s.campaignDir);
  try {
    const facts = c.store.listFacts();
    return {
      characters: facts.filter(
        (f) => f.owner === "pc_existence" && f.facet === "existence_contract",
      ),
      binding: c.binding(),
      referee: facts.filter((f) => f.owner === "referee_adjudication_kernel"),
      revision: c.store.head().revision,
      keys: facts.map((f) => f.key),
    };
  } finally {
    await c.close();
  }
}

export const keepFiles = (s: Slot): string[] =>
  (existsSync(s.operatorDir) ? readdirSync(s.operatorDir) : []).filter((f) =>
    f.startsWith("character-keep-"),
  );
export const wordsFile = (s: Slot): string | null => {
  const f = (existsSync(s.operatorDir) ? readdirSync(s.operatorDir) : []).find((n) =>
    n.startsWith("chat-character."),
  );
  return f ? join(s.operatorDir, f) : null;
};
export const readWords = (s: Slot): any => {
  const f = wordsFile(s);
  return f ? JSON.parse(readFileSync(f, "utf8")) : null;
};

/** Every text a tool result carried, in order, from now on (what the model could see). */
export function watch(chat: Chat): string[] {
  const seen: string[] = [];
  const original = chat.call.bind(chat);
  chat.call = (async (...a: Parameters<Chat["call"]>) => {
    const out = await original(...a);
    seen.push(JSON.stringify(out.json ?? null));
    return out;
  }) as Chat["call"];
  return seen;
}

/** The retained keep secret and the lane secrets: nothing the model sees may carry any of them. */
export function secretsOf(s: Slot): string[] {
  const out: string[] = [s.config.playerToken, s.config.refereeToken];
  for (const f of keepFiles(s))
    out.push(JSON.parse(readFileSync(join(s.operatorDir, f), "utf8")).secret);
  return out;
}

/** What a campaign holds, without publication identities that are keyed by a per-keep secret (two independent runs differ there legitimately). */
export async function shape(s: Slot) {
  const c = await openOrdinary(s.campaignDir);
  try {
    const facts = c.store.listFacts();
    const pc = facts.find((f) => f.owner === "pc_existence" && f.facet === "existence_contract");
    return {
      revision: c.store.head().revision,
      facts: facts
        .map((f) => ({
          key: f.key.replace(/^referee\/[0-9a-f]{64}\//, "referee/<task>/"),
          owner: f.owner,
          facet: f.facet,
          version: f.version,
          ...(f.owner === "referee_adjudication_kernel"
            ? {
                referee: [
                  (f.value as { operation: string }).operation,
                  (f.value as { verdict: string }).verdict,
                ],
              }
            : {}),
        }))
        .sort(
          (a, b) =>
            a.key.localeCompare(b.key) ||
            JSON.stringify((a as { referee?: unknown }).referee).localeCompare(
              JSON.stringify((b as { referee?: unknown }).referee),
            ),
        ),
      character: pc?.value,
      binding: c.binding()?.value,
    };
  } finally {
    await c.close();
  }
}
