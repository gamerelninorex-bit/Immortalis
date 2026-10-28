/* eslint-disable @typescript-eslint/no-explicit-any -- the scripted chat client reads untyped JSON */
// Operation-specific recovery of the chat-requested collection-preparation route (BLUE Revision 2): a lost acknowledgement at EVERY owner
// commit of EVERY stage - the physical custody and its referee evidence, the chronology, the R-5 classification and clarification, the
// three preparation publications, both declaration owners, the cycle attestation - converges, through the player's ordinary conversation,
// on the campaign an UNINTERRUPTED journey makes: by the original retained identities, with no rollback, no duplicate fact, no new identity,
// and no human authorization duplicated or skipped. A stage that still needs a human confirmation asks for it AFRESH; one the owners prove
// complete asks for nothing.
//
// EVERYTHING HERE IS A MECHANISM TEST (a scripted assistant, a scripted human, scripted PLUMBING referee hosts, the real owners).
import { existsSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  PcCollectionAdapter,
  ProductionAdapter,
  RefereeAdjudicationAdapter,
  SourceDrawdownAdapter,
  TemporalCoordinator,
} from "@immortalis/engine";
import { shape } from "../support/chat-character.ts";
import {
  DECLARATION,
  HANDLING,
  MOMENT,
  chain,
  cloneSlot,
  converge,
  pendingFiles,
  preparation,
  reader,
  resumed,
  stage,
  status,
  CYCLE,
  type Position,
  type Slot,
} from "../support/chat-route.ts";
import type { Human } from "../support/chat-client.ts";

afterEach(() => vi.restoreAllMocks());

const UNKNOWN = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;

/** Makes one owner operation lose its acknowledgement: it commits (or, when `commit` is false, never reaches the store). */
function loseReply(target: { prototype: object }, op: string, commit: boolean) {
  const proto = target.prototype as any;
  const original = proto[op] as (...a: unknown[]) => Promise<unknown>;
  vi.spyOn(proto, op).mockImplementation(async function (this: object, ...args: unknown[]) {
    if (commit) await original.apply(this, args);
    return UNKNOWN;
  });
}

/** a scripted human that counts the confirmations it was asked for (each is the final part of a review, the one that carries the phrase) */
function counting(): { human: Human; asked: () => number } {
  let n = 0;
  return {
    asked: () => n,
    human: (e) => {
      if (e.requestedSchema?.properties?.accept || e.requestedSchema?.properties?.reply) n++;
      return reader(e);
    },
  };
}

let accepted: Partial<Record<Position, Slot>>;
let r5: Partial<Record<Position, Slot>>;
let wantedAccepted: unknown;
let wantedR5: unknown;
beforeAll(async () => {
  accepted = await chain({ cycle: true });
  r5 = await chain({ cycle: false });
  wantedAccepted = await shape(accepted["READY"]!);
  wantedR5 = await shape(r5["READY"]!);
}, 400_000);
afterAll(() => vi.restoreAllMocks());

interface Case {
  readonly name: string;
  readonly branch: "accepted" | "r5";
  readonly at: Position;
  readonly tool: string;
  readonly args: any;
  /** the line of the route status that the stage under test owns */
  readonly line: string;
  readonly target: { prototype: object };
  readonly op: string;
  readonly commit: boolean;
  /** the barrier the owners' evidence leaves: RESUME (confirmed, partly committed) or NONE (proven complete, or proven to have changed nothing) */
  readonly barrier: "RESUME" | "NONE";
  /** how many times the player is asked in all: once for the attempt, again only where the owners do not prove the stage complete */
  readonly asks: number;
}

const prepareArgs = preparation(CYCLE);
const cases: Case[] = [
  // the physical custody: the referee's reading, then the World-State custody
  {
    name: "the physical-placement evidence landed but its reply was lost",
    branch: "accepted",
    at: "CHARACTER",
    tool: "establish_character_location",
    line: "physical_location",
    args: {},
    target: RefereeAdjudicationAdapter,
    op: "recordPhysical",
    commit: true,
    barrier: "NONE",
    asks: 2,
  },
  {
    name: "the physical-placement evidence never reached the store",
    branch: "accepted",
    at: "CHARACTER",
    tool: "establish_character_location",
    line: "physical_location",
    args: {},
    target: RefereeAdjudicationAdapter,
    op: "recordPhysical",
    commit: false,
    barrier: "NONE",
    asks: 2,
  },
  {
    name: "the custody landed but its reply was lost",
    branch: "accepted",
    at: "CHARACTER",
    tool: "establish_character_location",
    line: "physical_location",
    args: {},
    target: CanonicalCampaign,
    op: "establishOriginalPcPhysicalLocusCustody",
    commit: true,
    barrier: "NONE",
    asks: 1,
  },
  {
    name: "the custody never reached the store",
    branch: "accepted",
    at: "CHARACTER",
    tool: "establish_character_location",
    line: "physical_location",
    args: {},
    target: CanonicalCampaign,
    op: "establishOriginalPcPhysicalLocusCustody",
    commit: false,
    barrier: "NONE",
    asks: 2,
  },
  // the starting chronology: ONE Temporal publication
  {
    name: "the chronology landed but its reply was lost",
    branch: "accepted",
    at: "LOCUS",
    tool: "state_starting_moment",
    line: "starting_moment",
    args: MOMENT,
    target: TemporalCoordinator,
    op: "establishCanonicalTime",
    commit: true,
    barrier: "NONE",
    asks: 1,
  },
  {
    name: "the chronology never reached the store",
    branch: "accepted",
    at: "LOCUS",
    tool: "state_starting_moment",
    line: "starting_moment",
    args: MOMENT,
    target: TemporalCoordinator,
    op: "establishCanonicalTime",
    commit: false,
    barrier: "NONE",
    asks: 2,
  },
  // the R-5 clarification: the referee's classification evidence, then the PC owner's record
  {
    name: "the classification evidence of the player's words landed but its reply was lost",
    branch: "r5",
    at: "MOMENT",
    tool: "state_handling_duration",
    line: "handling_duration",
    args: { words: HANDLING },
    target: RefereeAdjudicationAdapter,
    op: "recordI002",
    commit: true,
    barrier: "NONE",
    asks: 2,
  },
  {
    name: "the classification evidence never reached the store",
    branch: "r5",
    at: "MOMENT",
    tool: "state_handling_duration",
    line: "handling_duration",
    args: { words: HANDLING },
    target: RefereeAdjudicationAdapter,
    op: "recordI002",
    commit: false,
    barrier: "NONE",
    asks: 2,
  },
  {
    name: "the accepted clarification landed but its reply was lost",
    branch: "r5",
    at: "MOMENT",
    tool: "state_handling_duration",
    line: "handling_duration",
    args: { words: HANDLING },
    target: PcCollectionAdapter,
    op: "clarify",
    commit: true,
    barrier: "NONE",
    asks: 1,
  },
  {
    name: "the clarification never reached the store",
    branch: "r5",
    at: "MOMENT",
    tool: "state_handling_duration",
    line: "handling_duration",
    args: { words: HANDLING },
    target: PcCollectionAdapter,
    op: "clarify",
    commit: false,
    barrier: "NONE",
    asks: 2,
  },
  // the preparation: mechanism, then the empty Reserve, then the extraction basis - three owners, three separate publications
  {
    name: "the mechanism landed but its reply was lost: the confirmed preparation is partly committed",
    branch: "accepted",
    at: "MOMENT",
    tool: "propose_collection_preparation",
    line: "collection_preparation",
    args: prepareArgs,
    target: PcCollectionAdapter,
    op: "establishMechanism",
    commit: true,
    barrier: "RESUME",
    asks: 2,
  },
  {
    name: "the mechanism never reached the store: nothing of the preparation landed",
    branch: "accepted",
    at: "MOMENT",
    tool: "propose_collection_preparation",
    line: "collection_preparation",
    args: prepareArgs,
    target: PcCollectionAdapter,
    op: "establishMechanism",
    commit: false,
    barrier: "NONE",
    asks: 2,
  },
  {
    name: "the Reserve landed but its reply was lost",
    branch: "accepted",
    at: "MOMENT",
    tool: "propose_collection_preparation",
    line: "collection_preparation",
    args: prepareArgs,
    target: ProductionAdapter,
    op: "establishReserve",
    commit: true,
    barrier: "RESUME",
    asks: 2,
  },
  {
    name: "the Reserve never reached the store: only the mechanism landed",
    branch: "accepted",
    at: "MOMENT",
    tool: "propose_collection_preparation",
    line: "collection_preparation",
    args: prepareArgs,
    target: ProductionAdapter,
    op: "establishReserve",
    commit: false,
    barrier: "RESUME",
    asks: 2,
  },
  {
    name: "the extraction basis landed but its reply was lost: the preparation is whole",
    branch: "accepted",
    at: "MOMENT",
    tool: "propose_collection_preparation",
    line: "collection_preparation",
    args: prepareArgs,
    target: SourceDrawdownAdapter,
    op: "establishBasis",
    commit: true,
    barrier: "NONE",
    asks: 1,
  },
  {
    name: "the extraction basis never reached the store: two of three landed",
    branch: "accepted",
    at: "MOMENT",
    tool: "propose_collection_preparation",
    line: "collection_preparation",
    args: prepareArgs,
    target: SourceDrawdownAdapter,
    op: "establishBasis",
    commit: false,
    barrier: "RESUME",
    asks: 2,
  },
  // the declaration: World-State's scene closure, then Population's workforce scope
  {
    name: "the scene closure landed but its reply was lost: the declaration is partly committed",
    branch: "accepted",
    at: "PREPARED",
    tool: "declare_closed_setting",
    line: "closed_setting",
    args: DECLARATION,
    target: PcCollectionAdapter,
    op: "establishSceneClosure",
    commit: true,
    barrier: "RESUME",
    asks: 2,
  },
  {
    name: "the scene closure never reached the store: nothing of the declaration landed",
    branch: "accepted",
    at: "PREPARED",
    tool: "declare_closed_setting",
    line: "closed_setting",
    args: DECLARATION,
    target: PcCollectionAdapter,
    op: "establishSceneClosure",
    commit: false,
    barrier: "NONE",
    asks: 2,
  },
  {
    name: "the workforce scope landed but its reply was lost: the declaration is whole",
    branch: "accepted",
    at: "PREPARED",
    tool: "declare_closed_setting",
    line: "closed_setting",
    args: DECLARATION,
    target: PcCollectionAdapter,
    op: "establishWorkforceScope",
    commit: true,
    barrier: "NONE",
    asks: 1,
  },
  {
    name: "the workforce scope never reached the store: only the closure landed",
    branch: "accepted",
    at: "PREPARED",
    tool: "declare_closed_setting",
    line: "closed_setting",
    args: DECLARATION,
    target: PcCollectionAdapter,
    op: "establishWorkforceScope",
    commit: false,
    barrier: "RESUME",
    asks: 2,
  },
  // the finishing stage: the referee's attestation (a human is never asked), then the service's installation
  {
    name: "the cycle attestation landed but its reply was lost: only the installation is left",
    branch: "accepted",
    at: "DECLARED",
    tool: "finish_collection_setup",
    line: "connection",
    args: {},
    target: PcCollectionAdapter,
    op: "attestCycle",
    commit: true,
    barrier: "NONE",
    asks: 0,
  },
  {
    name: "the cycle attestation never reached the store",
    branch: "accepted",
    at: "DECLARED",
    tool: "finish_collection_setup",
    line: "connection",
    args: {},
    target: PcCollectionAdapter,
    op: "attestCycle",
    commit: false,
    barrier: "NONE",
    asks: 0,
  },
];

describe("MECHANISM: a lost acknowledgement at each owner commit of each stage converges on the uninterrupted campaign", () => {
  for (const c of cases)
    it(`${c.name}: ${c.barrier === "RESUME" ? "only the same retained input, confirmed afresh, finishes it" : c.asks === 0 ? "nobody is asked, and the service finishes what is missing" : c.asks === 1 ? "the owners prove it complete, so nobody is asked again" : "the stage is simply offered again, and confirmed afresh"}`, async () => {
      const slots = c.branch === "accepted" ? accepted : r5;
      const s = await cloneSlot(slots[c.at]!);
      const r = await resumed(s);
      const counted = counting();
      try {
        loseReply(c.target, c.op, c.commit);
        const first = await stage(r.chat, c.tool, c.args, counted.human);
        vi.restoreAllMocks();
        const data = first.finished.data;
        expect(data.state).toBe("FINISHED");
        // the command's own reply was lost: the owners' records are what settle it
        if (c.barrier === "RESUME") {
          expect(data.outcome).toBe("UNCERTAIN");
          expect(data.recovery).toContain("resume_collection_setup");
          const route = (await status(r.chat)).route;
          expect(route.barrier).toBe("RESUME");
          expect(route.next).toMatchObject({ tool: "resume_collection_setup" });
          // every other mutation waits for exactly that
          const other = await r.chat.call("declare_closed_setting", DECLARATION);
          expect(other.isError).toBe(true);
          expect(other.text).toContain("resume_collection_setup");
          expect(other.elicited).toEqual([]);
        } else {
          expect(data.outcome).toBeUndefined();
          expect(pendingFiles(s)).toEqual([]);
        }
        // the player's ordinary conversation, until THIS stage stands (and no further): the confirmations asked for it are counted
        const done = (route: any) =>
          route.barrier === "NONE" &&
          route.stages.some((l: any) => l.stage === c.line && l.state === "DONE");
        const trail = await converge(r, {
          cycle: c.branch === "accepted",
          human: counted.human,
          until: done,
        });
        expect(trail.at(-1)).toMatch(/^NONE\//);
        // One real author review per new stage; unchanged accepted receipts need zero repeat approval. Native presence already covers physical custody.
        expect(counted.asked()).toBe(0);
        // ... and then the rest of the journey, which is the uninterrupted one
        await converge(r, { cycle: c.branch === "accepted" });
        // the campaign an uninterrupted journey makes: no duplicate fact, no second identity, no skipped or repeated authorization
        await r.stop();
        expect(await shape(s)).toEqual(c.branch === "accepted" ? wantedAccepted : wantedR5);
        expect(pendingFiles(s)).toEqual([]);
        expect(existsSync(s.config.scenarioFile)).toBe(true);
      } finally {
        await r.stop();
      }
    }, 240_000);
});
