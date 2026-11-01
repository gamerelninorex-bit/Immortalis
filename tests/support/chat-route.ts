/* eslint-disable @typescript-eslint/no-explicit-any -- a scripted MCP client and scripted referee documents are untyped JSON */
// TEST SUPPORT for the chat-requested collection-preparation route (BLUE Revision 2, A2). EVERYTHING DRIVEN THROUGH THIS FILE IS A MECHANISM
// TEST: the "assistant" is a script that calls typed tools, the "human" is a script that answers an elicitation only where a test says so,
// the "referee hosts" are the scripted PLUMBING hosts of the original-pc tests (they demonstrate what the engine enforces, nothing about
// whether an AI understood a sentence), and the shipped operator commands and the real owners do all the work. The setting and the
// character are admitted by the merged chat tools of the previous slices; nothing here writes an owner fact, a keep, a binding, a
// chronology, a preparation, a declaration, an attestation or a scenario, and nothing supplies a confirmation.
import { chmodSync, cpSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { statesExactDuration } from "@immortalis/engine";
import type { PhoneDeps } from "../../apps/phone/src/server.ts";
import { Chat, chatConfig, humanDeclines, type Human } from "./chat-client.ts";
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
import { hostAnswer } from "./pc-collection.ts";
import { tempDir } from "./tmp.ts";

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
/** H1: the SEPARATE least-privilege host of the delegated selection (a deployment opts in by listing and binding it) */
export const DELEGATE_OPS = ["PC_COLLECTION_DELEGATE"] as const;
export const DELEGATE_HOST = "gm-delegate";
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

/** the statement the scripted role.gm writes for a delegated selection (authored test content, never a default) */
export const delegatedStatement = (n: number, unit: string = UNIT): string =>
  `Handling one handful of loose material takes this body ${n} ${unit}`;

/**
 * The scripted role.gm selection (PLUMBING ONLY): a faithful selection inside the delivered bounds. `pick` chooses the number from the
 * task (default: five above the shortest bound, clamped to the longest); `over` forms a falsifier.
 */
export function delegateSelection(
  task: any,
  o: { pick?: (task: any) => number; over?: Record<string, unknown> } = {},
): unknown {
  const space = task.scope.candidate_space;
  const n = o.pick
    ? o.pick(task)
    : space.longest === null
      ? space.shortest + 5
      : Math.min(space.longest, space.shortest + 5);
  const statement = delegatedStatement(n, space.unit);
  const ground = task.baseline
    .map((i: any) => i.text as string)
    .find((t: string) => t.includes(ACTUATOR));
  return {
    task_digest: task.digest,
    branch: "UNRESOLVED_BEFORE",
    scope: "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE",
    baseline_ground: ground ? ACTUATOR : null,
    selection: { value: n, statement, statement_ground: statement },
    ...(o.over ?? {}),
  };
}

/** The scripted policy for every referee operation of the route: the setup readings of the earlier slices, and the cycle reading. */
export function routePolicy(
  rules: Parameters<typeof scriptedPolicy>[0] = {},
  cycle: { negative?: boolean } = {},
  delegate: (task: any) => unknown = (task) => delegateSelection(task),
): Policy {
  const base = scriptedPolicy(rules);
  return (doc) =>
    doc["operation"] === "PC_COLLECTION_CYCLE"
      ? cycleReading(doc["context"], cycle.negative === true)
      : doc["operation"] === "PC_COLLECTION_REACH"
        ? hostAnswer(doc["context"], "OPEN", "NOT_AT_ISSUE")
        : doc["operation"] === "PC_COLLECTION_DELEGATE"
          ? delegate(doc["context"])
          : base(doc);
}

/**
 * A byte-for-byte private copy of a quiescent slot (the service and the scripted hosts stopped, no lock held), on its own port: how a
 * recovery case reaches the stage it tests without repeating the stages before it. Same campaign identity, hosts and configuration.
 */
export async function cloneSlot(base: Slot): Promise<Slot> {
  const root = tempDir("immortalis-chat-route-clone-");
  chmodSync(root, 0o700);
  cpSync(base.root, root, { recursive: true });
  // a copied directory is not created with the source's private mode: the operator's trust checks demand it
  const privateDirs = (dir: string): void => {
    chmodSync(dir, 0o700);
    for (const e of readdirSync(dir, { withFileTypes: true }))
      if (e.isDirectory()) privateDirs(join(dir, e.name));
  };
  privateDirs(root);
  const operatorDir = join(root, "operator");
  const campaignDir = join(root, "campaign");
  const config = await chatConfig({
    campaignDir,
    campaignId: base.config.campaignId,
    operatorDir,
    setupDir: join(operatorDir, "phone-setup"),
    scenarioFile: join(root, "no-scenario.json"),
    refereeHostIds: base.config.refereeHostIds,
    playerViewHostId: base.config.playerViewHostId,
  });
  return {
    config,
    root,
    campaignDir,
    operatorDir,
    base: `http://127.0.0.1:${config.port}`,
    ...(base.client ? { client: { ...base.client } } : {}),
  };
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
  which: readonly ("setup" | "collection" | "delegate")[] = ["setup", "collection"],
  setupOps: readonly string[] = FOUR_OPS,
): Promise<ScriptedHost[]> {
  const out: ScriptedHost[] = [];
  if (which.includes("setup")) {
    await bind(s, setupOps, SETUP_HOST);
    out.push(startScriptedHost({ operatorDir: s.operatorDir } as any, policy, SETUP_HOST));
  }
  if (which.includes("collection")) {
    await bind(s, COLLECTION_OPS, COLLECTION_HOST);
    out.push(startScriptedHost({ operatorDir: s.operatorDir } as any, policy, COLLECTION_HOST));
  }
  if (which.includes("delegate")) {
    await bind(s, DELEGATE_OPS, DELEGATE_HOST);
    out.push(startScriptedHost({ operatorDir: s.operatorDir } as any, policy, DELEGATE_HOST));
  }
  return out;
}

/** Starts a scripted host for each already-bound referee host of a slot (the operator's binding step is not repeated). */
export function startHosts(
  s: Slot,
  policy: Policy = routePolicy(),
  which: readonly ("setup" | "collection" | "delegate")[] = ["setup", "collection"],
): ScriptedHost[] {
  return which.map((w) =>
    startScriptedHost(
      { operatorDir: s.operatorDir } as any,
      policy,
      w === "setup" ? SETUP_HOST : w === "delegate" ? DELEGATE_HOST : COLLECTION_HOST,
    ),
  );
}

/** A service over an existing (possibly cloned) slot, with scripted referee hosts, linked to one player client. */
export async function resumed(
  s: Slot,
  o: {
    deps?: PhoneDeps;
    policy?: Policy;
    which?: readonly ("setup" | "collection" | "delegate")[];
  } = {},
): Promise<RouteRun> {
  const list = startHosts(s, o.policy ?? routePolicy(), o.which);
  const r = await run(s, o.deps ?? {});
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

export interface RouteOptions {
  readonly characterWords?: { readonly embodiment?: string; readonly presence?: string };
  /** the character words (default: the accepted-cycle branch) */
  readonly cycle?: boolean;
  readonly deps?: PhoneDeps;
  readonly policy?: Policy;
  readonly which?: readonly ("setup" | "collection" | "delegate")[];
  /** the player-view host the service is configured with (null = unset) */
  readonly view?: string | null;
  readonly mutateSetting?: (doc: any) => void;
  /** the operations the setup host is bound for (default: the four setup operations) */
  readonly setupOps?: readonly string[];
  /** stop the setup early: after the setting only, or after the kept character (default: after its placement) */
  readonly upTo?: "SETTING" | "KEPT" | "PLACED";
}

/**
 * A fresh, empty slot through the setting, the kept character and its placement, by the merged chat tools: the starting point of the
 * route. The service lists two referee hosts, both bound, and has a player-view host configured.
 */
export async function started(o: RouteOptions = {}): Promise<RouteRun> {
  const s = await slot({
    refereeHostIds: [
      SETUP_HOST,
      COLLECTION_HOST,
      ...(o.which?.includes("delegate") ? [DELEGATE_HOST] : []),
    ],
    playerViewHostId: o.view === undefined ? "view-host" : o.view,
  });
  const list = await hosts(s, o.policy ?? routePolicy(), o.which, o.setupOps);
  const r = await run(s, o.deps ?? {});
  const finish = (): RouteRun => ({
    ...r,
    s,
    hosts: list,
    stop: async () => {
      for (const h of list) await h.stop();
      await r.app.close().catch(() => undefined);
    },
  });
  const doc = courtyard();
  o.mutateSetting?.(doc);
  const est = await establishViaChat(r.chat, doc);
  if (est.finished.data?.result?.status !== "LOCALITY_READY")
    throw new Error("the original setting was not established");
  if (o.upTo === "SETTING") return finish();
  const kept = await offer(
    r.chat,
    draft({ embodiment: o.characterWords?.embodiment ?? embodiment(o.cycle ?? true) }),
  );
  if (kept.finished.data?.result?.status !== "CHARACTER_RELEASED_UNBOUND")
    throw new Error(`the character was not kept: ${JSON.stringify(kept.finished.data?.result)}`);
  if (o.upTo === "KEPT") return finish();
  const placed = await place(r.chat, o.characterWords?.presence);
  if (placed.finished.data?.result?.status !== "CHARACTER_BOUND")
    throw new Error("the character was not placed");
  return finish();
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

/** how far along the route a template stands */
export type Position =
  "CHARACTER" | "LOCUS" | "MOMENT" | "HANDLING" | "PREPARED" | "DECLARED" | "READY";

/**
 * A QUIESCENT slot (service and scripted hosts stopped) after the stages up to `position`, each walked by the chat tools. Cases that test
 * what happens NEXT clone it, so a recovery or refusal case does not repeat the stages before it.
 */
export async function template(position: Position, o: RouteOptions = {}): Promise<Slot> {
  const r = await started(o);
  try {
    const cycle = o.cycle ?? true;
    const steps: [Position, () => Promise<any>][] = [
      ["LOCUS", () => stage(r.chat, "establish_character_location")],
      ["MOMENT", () => stage(r.chat, "state_starting_moment", MOMENT)],
      ...(cycle
        ? []
        : ([["HANDLING", () => stage(r.chat, "state_handling_duration", { words: HANDLING })]] as [
            Position,
            () => Promise<any>,
          ][])),
      [
        "PREPARED",
        () =>
          stage(r.chat, "propose_collection_preparation", preparation(cycle ? CYCLE : HANDLING)),
      ],
      ["DECLARED", () => stage(r.chat, "declare_closed_setting", DECLARATION)],
      ["READY", () => stage(r.chat, "finish_collection_setup", {}, reader)],
    ];
    for (const [at, step] of steps) {
      if (position === "CHARACTER") break;
      const done = await step();
      if (done.finished.isError || done.finished.data?.exit_code !== 0)
        throw new Error(
          `${at} did not complete: ${JSON.stringify(done.finished.data ?? done.finished.text)}`,
        );
      if (at === position) break;
    }
  } finally {
    await r.stop();
  }
  return r.s;
}

/**
 * The templates of EVERY position of one journey, each a quiescent slot built by cloning the previous one and walking ONE more stage
 * through the chat tools: the whole journey is walked once, and a case that tests what happens next clones the position it needs.
 */
export async function chain(o: RouteOptions = {}): Promise<Partial<Record<Position, Slot>>> {
  const cycle = o.cycle ?? true;
  const first = await started(o);
  await first.stop();
  const out: Partial<Record<Position, Slot>> = { CHARACTER: first.s };
  const steps: [Position, string, any][] = [
    ["LOCUS", "establish_character_location", {}],
    ["MOMENT", "state_starting_moment", MOMENT],
    ...(cycle
      ? []
      : ([["HANDLING", "state_handling_duration", { words: HANDLING }]] as [
          Position,
          string,
          any,
        ][])),
    ["PREPARED", "propose_collection_preparation", preparation(cycle ? CYCLE : HANDLING)],
    ["DECLARED", "declare_closed_setting", DECLARATION],
    ["READY", "finish_collection_setup", {}],
  ];
  let previous = first.s;
  for (const [position, tool, args] of steps) {
    const s = await cloneSlot(previous);
    const r = await resumed(s, o.policy ? { policy: o.policy } : {});
    try {
      const done = await stage(r.chat, tool, args);
      if (done.finished.isError || done.finished.data?.exit_code !== 0)
        throw new Error(
          `${position} did not complete: ${JSON.stringify(done.finished.data ?? done.finished.text)}`,
        );
    } finally {
      await r.stop();
    }
    out[position] = s;
    previous = s;
  }
  return out;
}

/** the tool and arguments an ordinary conversation uses for the stage the status names next */
const argsFor = (tool: string, cycle: boolean): any =>
  tool === "state_starting_moment"
    ? MOMENT
    : tool === "state_handling_duration"
      ? { words: HANDLING }
      : tool === "propose_collection_preparation"
        ? preparation(cycle ? CYCLE : HANDLING)
        : tool === "declare_closed_setting"
          ? DECLARATION
          : {};

/**
 * The player's ordinary conversation after ANY interruption: do what the status says, until the campaign is prepared. A barrier names its
 * own remedy (reconcile, or resume); a stage whose words are retained is resumed without being asked for them again; otherwise the stage
 * the status names is offered. Returns the trail of what the status said at each step (so a case can assert the path it took).
 */
export async function converge(
  r: Running,
  o: {
    cycle?: boolean;
    human?: Human;
    limit?: number;
    /** stop as soon as this holds of the status (default: the campaign is prepared) */
    until?: (route: any) => boolean;
  } = {},
): Promise<string[]> {
  const trail: string[] = [];
  for (let i = 0; i < (o.limit ?? 12); i++) {
    const route = (await r.chat.call("collection_setup_status")).data.route;
    // This script knows which authored fixture it is exercising. Production
    // status does not decide cycle meaning from a number/unit in arbitrary prose.
    const next =
      o.cycle === false && route.next?.if_handling_duration_unresolved
        ? route.next.if_handling_duration_unresolved
        : route.next;
    trail.push(`${route.barrier}/${next?.tool ?? "-"}${next?.retained ? "+retained" : ""}`);
    if (o.until ? o.until(route) : route.readiness.prepared_to_request_collection) return trail;
    if (route.barrier === "RECONCILE") {
      await r.chat.call("reconcile_last_action");
      await follow(r.chat, null);
    } else if (route.barrier === "RESUME" || next?.retained) {
      await r.chat.call("resume_collection_setup");
      await follow(r.chat, o.human ?? reader);
    } else if (next) {
      const out = await r.chat.call(next.tool, argsFor(next.tool, o.cycle ?? true));
      if (!out.isError && out.data?.run_id) await follow(r.chat, o.human ?? reader);
    } else throw new Error(`cannot converge from ${trail.join(" -> ")}: ${JSON.stringify(route)}`);
  }
  throw new Error(`did not converge: ${trail.join(" -> ")}`);
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
