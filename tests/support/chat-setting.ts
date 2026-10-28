/* eslint-disable @typescript-eslint/no-explicit-any -- a scripted MCP client reads untyped JSON-RPC */
// TEST SUPPORT for the chat-requested ORIGINAL locality setup. Everything driven through it is a MECHANISM test: the "assistant" is a script
// that calls typed tools, the "human" is a script that answers an elicitation only where a test says so, and the shipped `establish-locality`
// operator path and the real World-State owners do all the work. No fixture owner is registered; nothing here supplies a status, an owner
// result or a confirmation.
import { chmodSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { vi } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { nodeFs } from "@immortalis/engine";
import { runCli } from "@immortalis/operator";
import { createPhoneServer, type PhoneDeps } from "../../apps/phone/src/server.ts";
import type { PhoneConfig } from "../../apps/phone/src/config.ts";
import { pendingPath } from "../../apps/phone/src/recovery.ts";
import { Chat, PLAYER, chatConfig, phraseOf, type Human } from "./chat-client.ts";
import { LOCALITY_CAMPAIGN, headOf, openOrdinary } from "./locality.ts";
import { tempDir } from "./tmp.ts";

export { LOCALITY_CAMPAIGN, headOf, openOrdinary, pendingPath };

/** A wholly fictional courtyard and twelve loose stone units: authored setting content for a test, not a production default or an outcome. */
export const WORLD = "world-courtyard";
export const LOCUS = "locus-courtyard";
export const SOURCE = "src-loose-stones";
export const STONES = 12;
export const courtyard = (): any => ({
  format: "immortalis-original-locality-setup",
  format_version: 1,
  world: {
    world_id: WORLD,
    premise: "A small invented walled courtyard where a handful of stones lie loose.",
    reference_causal_basis: {
      mode: "ORIGINAL",
      established_canon: "The courtyard is an invented place; its stones are as authored here.",
    },
    material_world_law_departures: [],
    insertion_supporting_constraints: [],
  },
  locus: {
    world_id: WORLD,
    locus_id: LOCUS,
    designation: "The walled courtyard",
    constraints: [],
  },
  source: {
    source_key: SOURCE,
    world_id: WORLD,
    locus_id: LOCUS,
    dimension: "ground-surface",
    material_class: "loose-stone",
    quantity: { amount: STONES, unit: "stone" },
    access_facts: [
      {
        aspect: "reach",
        statement: "Every stone can be reached by walking across the flagged floor.",
      },
    ],
    statement: "Twelve loose stones lie on the courtyard floor.",
  },
});

export interface Slot {
  client?: { clientId: string; access: string; refresh: string };
  readonly config: PhoneConfig;
  readonly root: string;
  readonly campaignDir: string;
  readonly operatorDir: string;
  readonly base: string;
}

/** A fresh, empty campaign slot: the campaign directory does not exist yet, and the operator directory is private as the operator requires. */
export async function slot(over: Partial<PhoneConfig> = {}): Promise<Slot> {
  const root = tempDir("immortalis-chat-setting-");
  chmodSync(root, 0o700);
  const operatorDir = join(root, "operator");
  mkdirSync(operatorDir, { mode: 0o700 });
  chmodSync(operatorDir, 0o700);
  const campaignDir = join(root, "campaign");
  const config = await chatConfig({
    campaignDir,
    campaignId: LOCALITY_CAMPAIGN,
    operatorDir,
    setupDir: join(operatorDir, "phone-setup"),
    scenarioFile: join(root, "no-scenario.json"),
    ...over,
  });
  return { config, root, campaignDir, operatorDir, base: `http://127.0.0.1:${config.port}` };
}

export interface Running {
  readonly app: ReturnType<typeof createPhoneServer>;
  readonly chat: Chat;
}

/** Starts the real service over the slot and links one player-scope client that declares elicitation. */
export async function run(
  s: Slot,
  deps: PhoneDeps = {},
  link: { scope: string; player?: string; referee?: string } = { scope: "player", player: PLAYER },
  caps: any = {},
): Promise<Running> {
  const app = createPhoneServer(s.config, { pollMs: 300, ...deps });
  await app.listen();
  const chat = new Chat(s.base);
  if (s.client && link.scope === "player" && link.player === PLAYER) {
    Object.assign(chat, s.client);
    const renewed = await chat.token({
      grant_type: "refresh_token",
      client_id: chat.clientId,
      refresh_token: chat.refresh,
    });
    if (renewed.status !== 200) throw new Error("could not refresh the original fixture grant");
    chat.access = renewed.json.access_token;
    chat.refresh = renewed.json.refresh_token;
  } else {
    const linked = await chat.link(link.scope, {
      ...(link.player !== undefined ? { player: link.player } : {}),
      ...(link.referee !== undefined ? { referee: link.referee } : {}),
    });
    if (!linked.ok) throw new Error("could not link the scripted client");
  }
  if (link.scope === "player" && link.player === PLAYER)
    s.client = { clientId: chat.clientId, access: chat.access, refresh: chat.refresh };
  await chat.init(caps);
  return { app, chat };
}

/** The human, as a script: reads every part, and types the exact phrase where (and only where) the engine's phrase is shown. */
export const reader: Human = (e) =>
  e.requestedSchema?.properties?.accept || /type exactly "/.test(e.message)
    ? {
        action: "accept",
        content: e.requestedSchema?.properties?.accept
          ? { accept: true }
          : { reply: phraseOf(e.message) },
      }
    : { action: "accept", content: {} };

export const readsAndDeclines: Human = (e) =>
  e.requestedSchema?.properties?.accept || /type exactly "/.test(e.message)
    ? { action: "decline" }
    : { action: "accept", content: {} };

export const readsAndTypes =
  (typed: string | ((message: string) => string)): Human =>
  (e) =>
    e.requestedSchema?.properties?.accept || /type exactly "/.test(e.message)
      ? {
          action: "accept",
          content: e.requestedSchema?.properties?.accept
            ? { accept: false }
            : { reply: typeof typed === "function" ? typed(e.message) : typed },
        }
      : { action: "accept", content: {} };

/** Follows the one action in progress until it is FINISHED (or `limit` calls), answering the human through `human`. */
export async function follow(chat: Chat, human: Human | null = reader, limit = 12) {
  let last: any;
  let after = 0;
  const elicited: string[] = [];
  for (let i = 0; i < limit; i++) {
    last = await chat.call("await_action", { after, wait_seconds: 10 }, human ?? undefined);
    for (const e of last.elicited) elicited.push(e.message);
    if (last.data === undefined || last.data.state === "FINISHED") break;
    after = last.data.next_after ?? after;
  }
  return { ...last, elicited };
}

/** Proposes `doc` and follows it to its end, the player confirming through the client's own elicitation. */
export async function establishViaChat(chat: Chat, doc: any = courtyard(), human: Human = reader) {
  const proposed = await chat.call("propose_original_setting", doc);
  if (proposed.isError) return { proposed, finished: proposed };
  return { proposed, finished: await follow(chat, human) };
}

export const pinFiles = (s: Slot): string[] =>
  (existsSync(s.operatorDir) ? readdirSync(s.operatorDir) : []).filter((f) =>
    f.startsWith("locality-setup-"),
  );

/** The facts the campaign holds, read afresh with the ordinary registry (the campaign is closed while this runs). */
export async function facts(s: Slot) {
  const c = await openOrdinary(s.campaignDir);
  try {
    return {
      keys: c.store.listFacts().map((f) => f.key),
      source: c.sourceCondition(WORLD, SOURCE)?.value,
      world: c.world(WORLD)?.value,
      locus: c.locus(WORLD, LOCUS)?.value,
    };
  } finally {
    await c.close();
  }
}

/** Makes one owner operation of the OPERATOR'S campaign lose its acknowledgement: it commits, or (`commit` false) never reaches the store. */
const lost = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;
export function loseReply(
  op: "establishWorld" | "establishLocus" | "establishSourceCondition",
  commit: boolean,
) {
  const scratch = new WeakSet<object>();
  const create = CanonicalCampaign.create;
  vi.spyOn(CanonicalCampaign, "create").mockImplementation(async (dir: string, p: any) => {
    const made = await create.call(CanonicalCampaign, dir, p);
    if (made.ok && dir.includes("dry-run")) scratch.add(made.value);
    return made;
  });
  const original = (CanonicalCampaign.prototype as any)[op] as (
    ...a: unknown[]
  ) => Promise<unknown>;
  vi.spyOn(CanonicalCampaign.prototype as any, op).mockImplementation(async function (
    this: object,
    ...args: unknown[]
  ) {
    if (scratch.has(this)) return original.apply(this, args);
    if (commit) await original.apply(this, args);
    return lost;
  });
}

export const reference = async () => {
  const s = await slot();
  const r = await run(s);
  try {
    await establishViaChat(r.chat);
    return headOf(s.campaignDir);
  } finally {
    await r.app.close();
  }
};

/**
 * The shipped command with the durable publication of the retained setup identity failing AFTER its exclusive create landed: the identity is
 * on disk, nothing else exists. `state.broken` can be switched off to let the same command run normally afterwards.
 */
export const pinPublishFails =
  (state: { broken: boolean }): NonNullable<PhoneDeps["runCli"]> =>
  (argv, env) =>
    runCli(argv, {
      ...env,
      ...(state.broken
        ? {
            ledgerFs: {
              ...nodeFs,
              writeFileDurable: async (path: string, data: string) => {
                if (/locality-setup-[0-9a-f]+\.json$/.test(path)) throw new Error("disk failed");
                return nodeFs.writeFileDurable(path, data);
              },
            },
          }
        : {}),
    });
