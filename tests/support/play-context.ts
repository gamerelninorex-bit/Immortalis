/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP replies and raw owner readback are untyped JSON */
// TEST SUPPORT for the player-safe supported-play briefing. MECHANISM ONLY: the "assistant" is a script that calls typed tools, the
// referee and Game Master hosts are scripts whose rules the tests wrote (they demonstrate what the engine ENFORCES about an answer, never
// that an AI host reads a request as a Game Master would), and every owner is real. Genuine-host and named-client results are UNRUN, and a
// local temporary directory is not retained storage. Nothing here writes an owner fact, a keep, a binding, an observation or a briefing.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import * as canonicalIntegrity from "../../packages/engine/src/world/integrity.ts";
import { vi } from "vitest";
import type { Policy } from "./original-pc.ts";
import {
  ACTUATOR,
  CYCLE,
  DECLARATION,
  MOMENT,
  TRAVERSAL,
  cloneSlot,
  follow,
  openOrdinary,
  preparation,
  resumed,
  routePolicy,
  stage,
  started,
  type RouteRun,
  type Slot,
} from "./chat-route.ts";
import { PC_WORDS, SCENE, redScene } from "./observation.ts";
import {
  PILE_LOOK,
  bindScene,
  perceptionPolicy,
  scenePolicy,
  startScene,
  type SceneRule,
} from "./scene.ts";

export { PILE_LOOK };

export const LOOK = "at the pale material I have just gathered";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** every file of a tree with its bytes' digest: what "left exactly as found" means */
export function treeOf(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (statSync(p).isFile())
        out[p.slice(dir.length)] = createHash("sha256").update(readFileSync(p)).digest("hex");
    }
  };
  walk(dir);
  return out;
}

/** the canonical head and the whole package, read afresh and independently of the adapter and of the code under test */
export async function canonOf(dir: string) {
  const c = await openOrdinary(dir);
  try {
    const head = c.store.head();
    const facts = c.store.listFacts();
    return {
      revision: head.revision,
      state: head.state_sha256,
      journal: head.journal_head_sha256,
      facts: facts.length,
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value as number,
      source: (c.store.getFact("world/world-courtyard/source/src-loose-stones")?.value as any)
        ?.recoverable?.amount as number | undefined,
      reserve: (facts.find((f) => f.key.startsWith("production/reserve/"))?.value as any)?.quantity
        ?.amount as number | undefined,
      commitments: facts.filter(
        (f) => f.key.includes("/collection/") && f.key.endsWith("/commitment"),
      ).length,
      events: facts.filter((f) => /^access\/[^/]+\/event$/.test(f.key)).length,
      viewings: facts.filter((f) => /^world-state\/pc\/[^/]+\/current-viewing\//.test(f.key))
        .length,
      verify: c.verify(),
    };
  } finally {
    await c.close();
  }
}

/** what the package's own `open` and `verify` do is the common verified-open cost of ANY open; what happens outside them is the operation's */
export async function metered<T>(op: () => Promise<T>, storeProto: any) {
  const campaignProto = CanonicalCampaign.prototype as any;
  const counts = {
    open: 0,
    listDirect: 0,
    listInOpen: 0,
    verifyDirect: 0,
    ownerVerificationPasses: 0,
    fsReads: 0,
    fsReadBytes: 0,
    fsWrites: 0,
    fsWriteBytes: 0,
    fsMetadataReads: 0,
    getFact: 0,
    group: 0,
  };
  const ownerVerifier = vi.spyOn(canonicalIntegrity, "verifyCanonicalIntegrity");
  const fsOriginal = { ...nodeFs };
  for (const name of ["readFile", "readRange"] as const)
    (nodeFs as any)[name] = async (...args: any[]) => {
      const bytes = await (fsOriginal[name] as any)(...args);
      counts.fsReads++;
      counts.fsReadBytes += bytes.length;
      return bytes;
    };
  nodeFs.readRangeSync = (...args) => {
    const bytes = fsOriginal.readRangeSync(...args);
    counts.fsReads++;
    counts.fsReadBytes += bytes.length;
    return bytes;
  };
  for (const name of ["fileSize", "list"] as const)
    (nodeFs as any)[name] = async (...args: any[]) => {
      counts.fsMetadataReads++;
      return (fsOriginal[name] as any)(...args);
    };
  for (const name of [
    "writeFileDurable",
    "appendDurable",
    "createExclusive",
    "mkdirp",
    "truncate",
    "remove",
  ] as const)
    (nodeFs as any)[name] = async (...args: any[]) => {
      counts.fsWrites++;
      if (typeof args[1] === "string" || Buffer.isBuffer(args[1]))
        counts.fsWriteBytes += Buffer.byteLength(args[1]);
      return (fsOriginal[name] as any)(...args);
    };
  const trace: string[] = [];
  const out = { counts, trace, value: undefined as unknown as T };
  let inOpen = 0;
  let inVerify = 0;
  const original = {
    open: CanonicalCampaign.open,
    list: storeProto.listFacts,
    getFact: storeProto.getFact,
    group: storeProto.committedGroup,
    verify: campaignProto.verify,
  };
  (CanonicalCampaign as any).open = async function (...a: unknown[]) {
    counts.open++;
    inOpen++;
    try {
      return await (original.open as any).apply(this, a);
    } finally {
      inOpen--;
    }
  };
  storeProto.listFacts = function (...a: unknown[]) {
    if (inOpen > 0 || inVerify > 0) counts.listInOpen++;
    else counts.listDirect++;
    return original.list.apply(this, a);
  };
  storeProto.getFact = function (key: string) {
    counts.getFact++;
    if (inOpen === 0 && inVerify === 0) trace.push(`fact ${key}`);
    return original.getFact.call(this, key);
  };
  storeProto.committedGroup = function (id: string) {
    counts.group++;
    if (inOpen === 0 && inVerify === 0) trace.push(`group ${id}`);
    return original.group.call(this, id);
  };
  campaignProto.verify = function (...a: unknown[]) {
    counts.verifyDirect++;
    inVerify++;
    try {
      return original.verify.apply(this, a);
    } finally {
      inVerify--;
    }
  };
  try {
    out.value = await op();
  } finally {
    counts.ownerVerificationPasses = ownerVerifier.mock.calls.length;
    ownerVerifier.mockRestore();
    Object.assign(nodeFs, fsOriginal);
    (CanonicalCampaign as any).open = original.open;
    storeProto.listFacts = original.list;
    storeProto.getFact = original.getFact;
    storeProto.committedGroup = original.group;
    campaignProto.verify = original.verify;
  }
  return out;
}

/** the store class of a campaign opened in this process (the metering seam) */
export async function storeProtoOf(dir: string): Promise<any> {
  const c = await openOrdinary(dir);
  try {
    return Object.getPrototypeOf(c.store);
  } finally {
    await c.close();
  }
}

export const policyOf = (): Policy => perceptionPolicy(routePolicy());

export interface Building {
  /** a quiescent READY slot: setting, kept and placed character, location, moment, preparation, declaration, finished; nothing gathered or looked at */
  readonly ready: Slot;
}

/**
 * The first-play route walked once by the merged chat tools, ending READY: the sparse setting, a kept and placed character, the
 * collection preparation and the closed-setting declaration. `body` is the character's authored body statement (a stated constraint
 * lives there).
 */
export async function buildReady(body: string = PC_WORDS.embodiment): Promise<Building> {
  const r = await started({
    mutateSetting: redScene(),
    policy: policyOf(),
    characterWords: {
      embodiment: `${body}; ${ACTUATOR}; ${CYCLE}; ${TRAVERSAL}`,
      presence: PC_WORDS.presence,
    },
  });
  await bindScene(r.s.operatorDir);
  const gm = startScene(r.s.operatorDir, scenePolicy());
  try {
    for (const [tool, args] of [
      ["establish_character_location", {}],
      ["state_starting_moment", MOMENT],
      ["propose_collection_preparation", preparation(CYCLE)],
      [
        "declare_closed_setting",
        { ...DECLARATION, domain_designation: "The stone alcove", domain_topology: SCENE.geometry },
      ],
      ["finish_collection_setup", {}],
    ] as const) {
      const done = await stage(r.chat, tool, args);
      if (done.finished.isError) throw new Error(`${tool}: ${JSON.stringify(done.finished.data)}`);
    }
  } finally {
    await gm.stop();
    await r.stop();
  }
  return { ready: r.s };
}

/** follows the goal through `play_status` (what a host does) until the predicate holds */
export async function until(chat: any, ok: (status: any) => boolean, rounds = 240) {
  let last: any;
  for (let i = 0; i < rounds; i++) {
    last = (await chat.call("play_status")).data;
    if (last && ok(last)) return last;
    await sleep(250);
  }
  throw new Error(`not reached: ${JSON.stringify(last)}`);
}
export const finished = (s: any) =>
  s.goal !== null && ["DONE", "RETURNED", "INTERRUPTED"].includes(s.goal.outcome);

/** a service over a private clone of `from`, with the scripted referee hosts, and optionally the scripted scene host (the Game Master) */
export async function serviceOver(
  from: Slot,
  o: { scene?: SceneRule | null; configure?: (s: Slot) => Slot } = {},
): Promise<RouteRun & { gm: ReturnType<typeof startScene> | null }> {
  const clone = o.configure ? o.configure(await cloneSlot(from)) : await cloneSlot(from);
  const r = await resumed(clone, { policy: policyOf() });
  const gm =
    o.scene === null || o.scene === undefined
      ? null
      : startScene(clone.operatorDir, scenePolicy(o.scene));
  const stop = r.stop;
  return {
    ...r,
    gm,
    stop: async () => {
      await gm?.stop();
      await stop();
    },
  };
}

/** One gather to its earned end, then one look in the player's own words; the service stays up. */
export async function gatherAndLook(r: RouteRun, amount = 3) {
  expectOk(await r.chat.call("gather", { amount, until: "complete" }), "gather");
  const gathered = await until(r.chat, finished);
  const look = await stage(r.chat, "observe_surroundings", { attention: LOOK });
  return { gathered, look };
}

function expectOk(call: any, what: string): void {
  if (call.isError) throw new Error(`${what}: ${call.text}`);
}

export { follow };
