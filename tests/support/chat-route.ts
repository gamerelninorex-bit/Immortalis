/* eslint-disable @typescript-eslint/no-explicit-any -- a scripted MCP client and scripted referee documents are untyped JSON */
// TEST SUPPORT for the chat-requested collection-preparation route (BLUE Revision 2, A2). EVERYTHING DRIVEN THROUGH THIS FILE IS A MECHANISM
// TEST: the "assistant" is a script that calls typed tools, the "human" is a script that answers an elicitation only where a test says so,
// the "referee hosts" are the scripted PLUMBING hosts of the original-pc tests (they demonstrate what the engine enforces, nothing about
// whether an AI understood a sentence), and the shipped operator commands and the real owners do all the work. The setting and the
// character are admitted by the merged chat tools of the previous slices; nothing here writes an owner fact, a keep, a binding, a
// chronology, a preparation, a declaration, an attestation or a scenario, and nothing supplies a confirmation.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { statesExactDuration } from "@immortalis/engine";
import type { PhoneDeps } from "../../apps/phone/src/server.ts";
import { Chat, humanDeclines, type Human } from "./chat-client.ts";
import {
  FOUR_OPS,
  SHORT,
  bind,
  draft,
  follow,
  offer,
  place,
  plainPolicy,
  readWords,
  referee,
  run,
  scriptedPolicy,
  slot,
  WORDS,
  type Running,
  type Slot,
} from "./chat-character.ts";
import { courtyard, establishViaChat, reader, readsAndDeclines } from "./chat-setting.ts";
import { openOrdinary } from "./locality.ts";
import type { Policy, ScriptedHost } from "./original-pc.ts";
import { startScriptedHost } from "./original-pc.ts";

export {
  FOUR_OPS,
  SHORT,
  WORDS,
  courtyard,
  follow,
  humanDeclines,
  offer,
  openOrdinary,
  place,
  plainPolicy,
  reader,
  readsAndDeclines,
  run,
  scriptedPolicy,
  slot,
};
export type { Running, Slot };

/** the unit the scripted author counts time in, and the number of it one handling cycle takes (authored test content, not a default) */
export const UNIT = "second";
export const TAU = 12;
export const ACTUATOR = "the hands of this body gather loose material by hand";
export const TRAVERSAL = "these hands cannot pass a sealed barrier";
export const CYCLE = `one handful every ${TAU} ${UNIT}`;
/** the R-5 player's own account of the one unresolved duration (a test human's words, not a default) */
export const HANDLING = `It takes me ${TAU} ${UNIT} to lift and carry one lump`;
export const COLLECTION_OPS = ["PC_COLLECTION_CYCLE", "PC_COLLECTION_REACH"] as const;
export const SETUP_HOST = "gm-setup";
export const COLLECTION_HOST = "gm-collection";

/** the character words of the two branches: the accepted-cycle branch states the exact cycle; the R-5 branch states an actuator and no duration */
export const embodiment = (cycle: boolean): string =>
  `One ordinary human body; ${ACTUATOR}; ${cycle ? `${CYCLE}; ` : ""}${TRAVERSAL}`;

/** The scripted collection host's reading of the cycle task (PLUMBING ONLY): quotes the segment of the delivered words that states the exact duration. */
export function cycleReading(task: any, negative = false): unknown {
  const segments: string[] = [
    ...task.claims.map((c: any) => c.statement),
    ...(task.clarified ?? []).map((c: any) => c.statement),
  ].flatMap((t: string) => t.split(/[;.]/).map((x) => x.trim()));
  const ground = segments.find((t) => t.length >= 8 && statesExactDuration(t, task.cycle));
  return {
    task_digest: task.digest,
    reading: negative || !ground ? "NOT_ESTABLISHED" : "ONE_SAME_FORM_UNIT_ONE_SERIAL_CYCLE",
    actuator_ground: task.actuator,
    cycle_ground: ground ?? task.actuator,
    grounds: [task.actuator],
  };
}

/** The scripted policy for every referee operation of the route: the setup readings of the earlier slices, and the cycle reading. */
export function routePolicy(
  rules: Parameters<typeof scriptedPolicy>[0] = {},
  cycle: { negative?: boolean } = {},
): Policy {
  const base = scriptedPolicy(rules);
  return (doc) =>
    doc["operation"] === "PC_COLLECTION_CYCLE"
      ? cycleReading(doc["context"], cycle.negative === true)
      : base(doc);
}

export interface RouteRun extends Running {
  readonly s: Slot;
  readonly hosts: ScriptedHost[];
  /** stops the scripted referee hosts and the service */
  readonly stop: () => Promise<void>;
}

/** Binds the two hosts this service lists (the operator's step), and starts a scripted host for each. */
export async function hosts(
  s: Slot,
  policy: Policy = routePolicy(),
  which: readonly ("setup" | "collection")[] = ["setup", "collection"],
): Promise<ScriptedHost[]> {
  const out: ScriptedHost[] = [];
  if (which.includes("setup")) {
    await bind(s, FOUR_OPS, SETUP_HOST);
    out.push(startScriptedHost({ operatorDir: s.operatorDir } as any, policy, SETUP_HOST));
  }
  if (which.includes("collection")) {
    await bind(s, COLLECTION_OPS, COLLECTION_HOST);
    out.push(startScriptedHost({ operatorDir: s.operatorDir } as any, policy, COLLECTION_HOST));
  }
  return out;
}

export interface RouteOptions {
  /** the character words (default: the accepted-cycle branch) */
  readonly cycle?: boolean;
  readonly deps?: PhoneDeps;
  readonly policy?: Policy;
  readonly which?: readonly ("setup" | "collection")[];
  /** the player-view host the service is configured with (null = unset) */
  readonly view?: string | null;
  readonly mutateSetting?: (doc: any) => void;
}

/**
 * A fresh, empty slot through the setting, the kept character and its placement, by the merged chat tools: the starting point of the
 * route. The service lists two referee hosts, both bound, and has a player-view host configured.
 */
export async function started(o: RouteOptions = {}): Promise<RouteRun> {
  const s = await slot({
    refereeHostIds: [SETUP_HOST, COLLECTION_HOST],
    playerViewHostId: o.view === undefined ? "view-host" : o.view,
  });
  const list = await hosts(s, o.policy ?? routePolicy(), o.which);
  const r = await run(s, o.deps ?? {});
  const doc = courtyard();
  o.mutateSetting?.(doc);
  const est = await establishViaChat(r.chat, doc);
  if (est.finished.data?.result?.status !== "LOCALITY_READY")
    throw new Error("the original setting was not established");
  const kept = await offer(r.chat, draft({ embodiment: embodiment(o.cycle ?? true) }));
  if (kept.finished.data?.result?.status !== "CHARACTER_RELEASED_UNBOUND")
    throw new Error(`the character was not kept: ${JSON.stringify(kept.finished.data?.result)}`);
  const placed = await place(r.chat);
  if (placed.finished.data?.result?.status !== "CHARACTER_BOUND")
    throw new Error("the character was not placed");
  return {
    ...r,
    s,
    hosts: list,
    stop: async () => {
      for (const h of list) await h.stop();
      await r.app.close().catch(() => undefined);
    },
  };
}

/** The tool call and the human's confirmation, followed to the end of the action (answering only where the human script does). */
export async function stage(
  chat: Chat,
  tool: string,
  args: any = {},
  human: Human | null = reader,
  limit = 20,
) {
  const started = await chat.call(tool, args);
  if (
    started.isError ||
    started.data?.state === "FINISHED" ||
    human === null ||
    !started.data?.run_id
  )
    return { started, finished: started };
  return { started, finished: await follow(chat, human, limit) };
}

// -- the player's own inputs of the scripted test author (authored test content, never a default) ----------------------------------------
export const MOMENT = {
  statement: "The morning the stonecutters first reached the courtyard",
  value: 7,
  unit: UNIT,
};
export const preparation = (cycleQuote: string = CYCLE): any => ({
  actuator_quote: ACTUATOR,
  traversal_quote: TRAVERSAL,
  cycle_quote: cycleQuote,
  cycle_value: TAU,
  reserve_condition: "dry",
});
export const DECLARATION = {
  domain_designation: "The walled courtyard",
  domain_topology: "One flagged yard ringed by a high wall with no gate in use",
  closure_statement: "Nothing else acts in the courtyard beyond what its owners hold",
  source_ground: "The loose stones belong to no one and no claim on them is established",
  workforce_statement: "Only those the owners hold account for any labour in the yard",
};

/** The whole route after the character, with a scripted human who confirms each stage; returns each stage's finished result in order. */
export async function walk(r: RouteRun, o: { cycle?: boolean } = {}) {
  const cycle = o.cycle ?? true;
  const out: Record<string, any> = {};
  out["locus"] = await stage(r.chat, "establish_character_location");
  out["moment"] = await stage(r.chat, "state_starting_moment", MOMENT);
  if (!cycle) out["handling"] = await stage(r.chat, "state_handling_duration", { words: HANDLING });
  out["preparation"] = await stage(
    r.chat,
    "propose_collection_preparation",
    preparation(cycle ? CYCLE : HANDLING),
  );
  out["declaration"] = await stage(r.chat, "declare_closed_setting", DECLARATION);
  out["finish"] = await stage(r.chat, "finish_collection_setup", {}, reader);
  return out;
}

/** the route status the host reads */
export const status = async (chat: Chat) => (await chat.call("collection_setup_status")).data;

/** Every owner fact key the campaign holds, read afresh with the ordinary registry (the service must be closed or idle). */
export async function keys(s: Slot): Promise<string[]> {
  const c = await openOrdinary(s.campaignDir);
  try {
    return c.store.listFacts().map((f) => f.key);
  } finally {
    await c.close();
  }
}

export const pendingFiles = (s: Slot): string[] =>
  (existsSync(s.operatorDir) ? readdirSync(s.operatorDir) : []).filter((f) =>
    f.startsWith("chat-pending-operation."),
  );
export const routeRecord = (s: Slot): any => {
  const f = (existsSync(s.operatorDir) ? readdirSync(s.operatorDir) : []).find((n) =>
    n.startsWith("chat-route."),
  );
  return f ? JSON.parse(readFileSync(join(s.operatorDir, f), "utf8")) : null;
};
export { readWords };
