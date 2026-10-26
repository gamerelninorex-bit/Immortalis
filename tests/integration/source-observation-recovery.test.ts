import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements and poke saved packages */
// BLUE v5.2-A1 — SOURCE-QUALIFIED original-PC observation: crash, retry, reload, tamper and a REAL later change of the source. The
// observation spans several owners' separate, identity-derived commits (the referee's retained reading, the Epistemic owner's event that
// pins the Source Condition, the Temporal engagement and its one transaction with the packet formation), so an interruption between any two
// leaves a real, partial campaign; the same command resumes by identity, re-asks nothing it already holds, forms nothing twice, and lands
// on exactly the campaign an uninterrupted run produces. A saved campaign whose source citation was edited does not verify, and a source
// the owners later changed (a real Production-caused delivery, never a hand edit) neither invalidates nor rewrites what was observed of
// it. The scripted host is a policy the test wrote (plumbing only: no claim about any AI's reading).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  EpistemicAccessAdapter,
  RefereeAdjudicationAdapter,
  TemporalCoordinator,
  formObservedPacket,
  observationRecordOf,
  recordContextViolation,
  verifyEpistemicIntegrity,
  verifyRefereeIntegrity,
  verifyTemporalIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  AccessEventSchema,
  CommitGroupSchema,
  REFEREE_AUTHORITY,
  WorldSourceConditionSchema,
  worldSourceConditionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { CAMPAIGN, runAuthor } from "../support/original-pc.ts";
import { observeArgs } from "../support/observation.ts";
import { GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";
import {
  EXPOSED,
  NEUTRAL_CONTENT,
  PC_ID,
  SECRET,
  SOURCE_KEY,
  drawFromSource,
  observeSource,
  sourceAnswer,
  sourceCampaign,
  sourcePolicy,
} from "../support/source-observation.ts";
import { WORLD_ID } from "../support/locality.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { PRODUCTION_FIXTURE_EXTENSION } from "@immortalis/testkit";

afterEach(() => vi.restoreAllMocks());

const deadPid = (): number => spawnSync(process.execPath, ["-e", ""]).pid;
/** An in-process "crash" leaves the lock naming THIS live process; a real crash leaves a dead holder, which is what is restored. */
function crashedHolder(campaignDir: string): void {
  const lock = join(campaignDir, "LOCK");
  if (existsSync(lock))
    writeFileSync(lock, `${JSON.stringify({ pid: deadPid(), campaign_id: CAMPAIGN })}\n`);
}

const unknown = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;
function loseReply(proto: object, op: string, commit: boolean) {
  const original = (proto as any)[op] as (...a: unknown[]) => Promise<unknown>;
  vi.spyOn(proto as any, op).mockImplementation(async function (this: object, ...args: unknown[]) {
    if (commit) await original.apply(this, args);
    return unknown;
  });
}

const open = async (dirs: LocalityDirs) => {
  const opened = await CanonicalCampaign.open(dirs.campaignDir, {
    buildId: "source-observation-recovery-reader",
    reclaimStaleLock: true,
  });
  if (!opened.ok) throw new Error(`did not open: ${JSON.stringify(opened.error)}`);
  return opened.value;
};
/** What a campaign holds, by key, owner and version (the referee task identity is the one key normalized). */
async function shape(dirs: LocalityDirs) {
  const c = await open(dirs);
  try {
    return {
      revision: c.store.head().revision,
      facts: c.store
        .listFacts()
        .map((f) => ({
          key: f.key.replace(/^referee\/[0-9a-f]{64}\//, "referee/<task>/"),
          owner: f.owner,
          version: f.version,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    };
  } finally {
    await c.close();
  }
}
const count = async (dirs: LocalityDirs, re: RegExp) => {
  const c = await open(dirs);
  try {
    return c.store.listFacts().filter((f) => re.test(f.key)).length;
  } finally {
    await c.close();
  }
};
const sourceFact = (c: CanonicalCampaign) =>
  c.store.getFact(worldSourceConditionKey(WORLD_ID, SOURCE_KEY))!;
const glance = (c: CanonicalCampaign) =>
  JSON.stringify(
    readCurrentObservationGlance(
      bindTrustedCurrentPlayerContext({ view: c.store, recipient_id: PC_ID }),
      GLANCE_REQUEST(),
    ),
  );
const events = (c: CanonicalCampaign) =>
  c.store
    .listFacts()
    .filter((f) => /^access\/[^/]+\/event$/.test(f.key))
    .map((f) => ({ fact: f, event: AccessEventSchema.parse(f.value) }));

/** Retains a source-scoped direct-perception decision through the engine's own adapter (plumbing-only scripted answer). */
async function decideSource(c: CanonicalCampaign, attempt = 0) {
  const adapter = new RefereeAdjudicationAdapter(c.store);
  const task = adapter.observationTask({ pc_id: PC_ID, attempt, source_key: SOURCE_KEY });
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  const recorded = await adapter.recordObservation({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: "engine-direct-test", claimed_model: null },
    pc_id: PC_ID,
    attempt,
    source_key: SOURCE_KEY,
    answer: sourceAnswer({ task_id: task.value.task_id, context: task.value.context }),
  });
  if (!recorded.ok) throw new Error(JSON.stringify(recorded.error));
  return recorded.value;
}

async function reference() {
  const { dirs } = await sourceCampaign();
  const { result } = await observeSource(dirs);
  expect(result.status).toBe("OBSERVATION_RECEIVED");
  return shape(dirs);
}

describe("a lost acknowledgement at each owner commit converges on the uninterrupted source-scoped campaign", () => {
  const cases = [
    [
      RefereeAdjudicationAdapter.prototype,
      "recordObservation",
      true,
      "the retained reading landed but its reply was lost",
    ],
    [
      RefereeAdjudicationAdapter.prototype,
      "recordObservation",
      false,
      "the retained reading never reached the store",
    ],
    [
      EpistemicAccessAdapter.prototype,
      "establishObservedAccess",
      true,
      "the event landed but its reply was lost",
    ],
    [
      EpistemicAccessAdapter.prototype,
      "establishObservedAccess",
      false,
      "the event never reached the store",
    ],
    [
      TemporalCoordinator.prototype,
      "advance",
      true,
      "the transaction and the packet landed but the reply was lost",
    ],
    [TemporalCoordinator.prototype, "advance", false, "the transaction never reached the store"],
  ] as const;
  for (const [proto, op, commit, name] of cases)
    it(
      name,
      async () => {
        const expected = await reference();
        const { dirs } = await sourceCampaign();
        loseReply(proto, op, commit);
        const first = await observeSource(dirs);
        expect(first.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
        vi.restoreAllMocks();
        // never more than one of each, however far it got
        expect(await count(dirs, /^access\/[^/]+\/event$/)).toBeLessThanOrEqual(1);
        expect(await count(dirs, /^access\/[^/]+\/packet\//)).toBeLessThanOrEqual(1);
        crashedHolder(dirs.campaignDir);
        const again = await observeSource(dirs, undefined, {}, { reclaimStaleLock: true });
        expect(again.result.status).toBe("OBSERVATION_RECEIVED");
        expect(await shape(dirs)).toEqual(expected);
        expect(await count(dirs, /^access\/[^/]+\/packet\//)).toBe(1);
        expect(await count(dirs, /^temporal\/transaction\//)).toBe(1);
        const c = await openOrdinary(dirs.campaignDir);
        try {
          expect(c.verify()).toEqual([]);
          expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
          expect(JSON.parse(glance(c)).ok).toBe(true);
        } finally {
          await c.close();
        }
      },
      240_000,
    );
});

describe("the event-triggered formation of a source-scoped observation recovers at each durable commit without a boundary", () => {
  for (const boundary of ["authority", "packet", "transaction"] as const)
    for (const landed of [false, true])
      it(`${boundary} reply lost, commit ${landed ? "landed" : "absent"}: reopen and resume the same event`, async () => {
        const { dirs } = await sourceCampaign();
        const c = await openOrdinary(dirs.campaignDir);
        const d = await decideSource(c);
        const inner = c.store;
        let interrupted = false;
        const wrapped: CampaignStore = {
          descriptor: inner.descriptor,
          head: () => inner.head(),
          getFact: (k) => inner.getFact(k),
          listFacts: () => inner.listFacts(),
          lookupReceipt: (i) => inner.lookupReceipt(i),
          committedGroup: (i) => inner.committedGroup(i),
          close: () => inner.close(),
          commit: async (group) => {
            const pattern =
              boundary === "authority"
                ? /^temporal\/transaction-authority\//
                : boundary === "packet"
                  ? /^access\/[^/]+\/packet\//
                  : /^temporal\/transaction\//;
            const parsed = CommitGroupSchema.safeParse(group);
            if (
              !interrupted &&
              parsed.success &&
              parsed.data.writes.some((w) => pattern.test(w.key))
            ) {
              interrupted = true;
              if (landed) await inner.commit(group);
              return unknown;
            }
            return inner.commit(group);
          },
        };
        try {
          expect((await formObservedPacket(wrapped, d.record.key)).ok).toBe(false);
          expect(interrupted).toBe(true);
          expect(c.verify()).toEqual([]);
        } finally {
          await c.close();
        }
        const reopened = await openOrdinary(dirs.campaignDir);
        try {
          expect((await formObservedPacket(reopened.store, d.record.key)).ok).toBe(true);
          expect(reopened.verify()).toEqual([]);
          expect(verifyEpistemicIntegrity(reopened.store)).toEqual([]);
          expect(
            reopened.store.listFacts().filter((f) => /^access\/[^/]+\/packet\//.test(f.key)),
          ).toHaveLength(1);
          // the pinned source is the committed one, untouched by the observation
          expect(events(reopened)[0]!.event.source).toEqual({
            owner: "world_state",
            fact_key: worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
            version: 1,
          });
          expect(reopened.store.getFact("temporal/boundary-index")).toBeUndefined();
        } finally {
          await reopened.close();
        }
      }, 120_000);
});

describe("a process killed mid-command converges on the uninterrupted campaign", () => {
  const phrase = (said: readonly string[]): string => {
    for (let i = said.length - 1; i >= 0; i--) {
      const m = /To confirm, type exactly "(observe-surroundings [0-9a-f]+)"/.exec(said[i]!);
      if (m) return m[1]!;
    }
    throw new Error("the service printed no observe-surroundings challenge");
  };
  for (const [name, killAfter, held] of [
    ["after the retained reading, before the event", /PROGRESS referee DECIDED/, 0],
    ["after the whole formation, before the delivery", /PROGRESS observation COMMITTED/, 1],
  ] as const)
    it(`killed ${name}: the same command converges and writes nothing twice`, async () => {
      const expected = await reference();
      const { dirs } = await sourceCampaign();
      const args = (over: string[] = []) => observeArgs(dirs, ["--source", SOURCE_KEY, ...over]);
      const killed = await runAuthor(args(), [phrase], {
        host: { dirs, policy: sourcePolicy() },
        killAfter,
      });
      expect(killed.signal).toBe("SIGKILL");
      expect(await count(dirs, /^access\/[^/]+\/packet\//)).toBe(held);
      crashedHolder(dirs.campaignDir);
      const again = await runAuthor(args(["--reclaim-stale-lock"]), [phrase], {
        host: { dirs, policy: sourcePolicy() },
      });
      expect(again.stdout).toContain("STATUS OBSERVATION_RECEIVED");
      expect(await shape(dirs)).toEqual(expected);
      expect(await count(dirs, /^access\/[^/]+\/packet\//)).toBe(1);
    }, 240_000);
});

describe("a later change of the source, made by the owners' own drawdown, neither invalidates nor rewrites what was observed of it", () => {
  const T1 = { boundary: 140, target: 200 } as const;
  // Production's requester is an unregistered extension owner (no shipped command makes a request), so a campaign that has drawn from
  // its source can only be opened with that extension: everything after the drawdown is engine-direct, over the owners' own adapters.
  const openExt = async (dirs: LocalityDirs) =>
    must(
      Promise.resolve(
        CanonicalCampaign.open(dirs.campaignDir, {
          buildId: "source-observation-ext-reader",
          extension: PRODUCTION_FIXTURE_EXTENSION,
        }),
      ),
    );
  const withExt = async <T>(dirs: LocalityDirs, fn: (c: CanonicalCampaign) => Promise<T> | T) => {
    const c = await openExt(dirs);
    try {
      return await fn(c);
    } finally {
      await c.close();
    }
  };

  it("the earlier receipt still verifies and its packet is not rewritten; the glance is the one refusal once the basis has moved (storage is no recall basis)", async () => {
    const { dirs } = await sourceCampaign();
    expect((await observeSource(dirs)).result.status).toBe("OBSERVATION_RECEIVED");
    const before = await openOrdinary(dirs.campaignDir);
    let packetBefore: unknown;
    let eventBefore: unknown;
    try {
      expect(JSON.parse(glance(before)).ok).toBe(true);
      packetBefore = before.store.listFacts().find((f) => /\/packet\//.test(f.key))!.value;
      eventBefore = events(before)[0]!.fact.value;
    } finally {
      await before.close();
    }
    await drawFromSource(dirs, { n: 1, amount: 30, ...T1, first: true });

    await withExt(dirs, (c) => {
      // the owners changed the source: a real delivery advanced it, net of the extraction, to version 2
      const now = sourceFact(c);
      expect(now.version).toBe(2);
      expect(WorldSourceConditionSchema.parse(now.value).recoverable.amount).toBe(
        SECRET.amount - 30,
      );
      // ... and what was observed of it is exactly what it was: same event pinning version 1, same packet, no re-derived content
      expect(events(c)).toHaveLength(1);
      expect(events(c)[0]!.fact.value).toEqual(eventBefore);
      expect(events(c)[0]!.event.source.version).toBe(1);
      expect(c.store.listFacts().find((f) => /\/packet\//.test(f.key))!.value).toEqual(
        packetBefore,
      );
      // verification accepts the cited version as history, and never rewrites it
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      expect(verifyRefereeIntegrity(c.store)).toEqual([]);
      expect(verifyTemporalIntegrity(c.store)).toEqual([]);
      // the arrival is no longer current: not revived from storage, and no cause is distinguishable
      expect(glance(c)).toBe(PROTOCOL_REFUSAL);
      // the historical reading is verified from the record alone, and its scope is still one of that record: it cannot be relabelled
      const record = observationRecordOf(
        c.store.listFacts().find((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION"),
      )!;
      const factOf = (k: string) => c.store.getFact(k);
      expect(recordContextViolation(record, factOf)).toBeNull();
      const relabelled = structuredClone(record) as any;
      relabelled.decision.payload.source_fact_id = "locus.designation";
      expect(recordContextViolation(relabelled, factOf)).toMatchObject({
        code: "DECISION_INCOHERENT",
      });
    });
  });

  it("a new look at the later basis is a new, separate observation that pins the source at its NEW version and withholds the new net amount too", async () => {
    const { dirs } = await sourceCampaign();
    expect((await observeSource(dirs)).result.status).toBe("OBSERVATION_RECEIVED");
    await drawFromSource(dirs, { n: 1, amount: 30, ...T1, first: true });

    await withExt(dirs, async (c) => {
      const adapter = new RefereeAdjudicationAdapter(c.store);
      const task = adapter.observationTask({ pc_id: PC_ID, attempt: 0, source_key: SOURCE_KEY });
      expect(task.ok).toBe(true);
      if (!task.ok) return;
      const ask = (rule: Parameters<typeof sourceAnswer>[1]) =>
        adapter.evaluateObservation(
          task.value.context,
          sourceAnswer({ task_id: task.value.task_id, context: task.value.context }, rule),
        );
      // the net remaining amount (90) and the delivered amount (30) are withheld as well as the established one (120)
      for (const content of [
        "about 90 pale lumps lie bare",
        "thirty is 30 of them",
        "all 120 of them",
      ]) {
        const refused = ask({ content });
        expect(refused.ok, content).toBe(false);
        if (!refused.ok) expect(refused.error.code).toBe("GROUNDS_UNSUPPORTED");
      }
      expect(ask({}).ok).toBe(true);
      expect(events(c)).toHaveLength(1);

      // the new look is its own observation at the new basis
      const d = await decideSource(c);
      const formed = await formObservedPacket(c.store, d.record.key);
      expect(formed.ok, JSON.stringify(formed)).toBe(true);
      const evs = events(c);
      expect(evs).toHaveLength(2);
      expect(evs.map((e) => e.event.source.version).sort()).toEqual([1, 2]);
      expect(new Set(evs.map((e) => e.event.event_id)).size).toBe(2);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      expect(c.verify()).toEqual([]);
      const out = JSON.parse(glance(c));
      expect(out.ok).toBe(true);
      expect(JSON.stringify(out)).not.toMatch(/\b(30|90|120)\b/);
    });
  });

  it("a source the owners have exhausted is physically gone: it is refused by the one message of an absent source, and nothing is written", async () => {
    const { dirs } = await sourceCampaign();
    await drawFromSource(dirs, { n: 1, amount: SECRET.amount, ...T1, first: true });
    await withExt(dirs, (c) => {
      // PHYSICAL exhaustion is the owners' own: nothing recoverable remains and the delivery that emptied it is recorded
      const s = WorldSourceConditionSchema.parse(sourceFact(c).value);
      expect(s.recoverable.amount).toBe(0);
      expect(s.exhaustion?.kind).toBe("PHYSICAL");
      const adapter = new RefereeAdjudicationAdapter(c.store);
      const exhausted = adapter.observationTask({
        pc_id: PC_ID,
        attempt: 0,
        source_key: SOURCE_KEY,
      });
      const absent = adapter.observationTask({ pc_id: PC_ID, attempt: 0, source_key: "src-nope" });
      expect(exhausted.ok).toBe(false);
      expect(JSON.stringify(exhausted)).toBe(JSON.stringify(absent));
      // an ordinary (unscoped) look is still askable: only the exhausted source is not a candidate
      expect(adapter.observationTask({ pc_id: PC_ID, attempt: 0 }).ok).toBe(true);
      expect(events(c)).toEqual([]);
    });
  });
});

describe(
  "load fails closed on a corrupted saved source-scoped observation",
  { timeout: 600_000 },
  () => {
    let master: string | null = null;
    async function saved(): Promise<string> {
      if (master === null) {
        const { dirs } = await sourceCampaign();
        const r = await observeSource(dirs);
        expect(r.result.status).toBe("OBSERVATION_RECEIVED");
        master = dirs.campaignDir;
      }
      const copy = join(tempDir("immortalis-source-observation-tamper-"), "campaign");
      cpSync(master, copy, { recursive: true });
      return copy;
    }
    const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;

    it("a valid saved campaign opens, and an edited saved source, source pin or reading does not (the loader's own refusal)", async () => {
      const ok = await CanonicalCampaign.open(await saved(), { buildId: "tamper-test" });
      expect(ok.ok).toBe(true);
      if (ok.ok) await ok.value.close();
      for (const edit of [
        (j: any) =>
          (j.facts.find((f: any) => /\/source\//.test(f.key)).value.access_facts[0].statement =
            "A dark pit."),
        (j: any) =>
          (j.facts.find((f: any) => /^access\/[^/]+\/event$/.test(f.key)).value.source.version = 2),
        (j: any) =>
          (j.facts.find((f: any) => /^access\/[^/]+\/event$/.test(f.key)).value.source.fact_key =
            "world/x/profile"),
      ]) {
        const dir = await saved();
        const p = join(dir, stateFile(dir));
        const j = legacyStateFixture(p);
        edit(j);
        writeFileSync(p, JSON.stringify(j));
        const r = await CanonicalCampaign.open(dir, { buildId: "tamper-test" });
        expect(r.ok).toBe(false);
      }
    });

    // The loader's state hash refuses ANY edited file, so it cannot show that the OWNERS' verifiers see an edit. These cases hand the
    // verifiers a store whose committed facts were altered in memory (the hash chain bypassed) and assert the specific violation raised.
    async function drift(mutate: (facts: OwnerFact[]) => unknown) {
      const dir = await saved();
      const opened = await CanonicalCampaign.open(dir, { buildId: "drift-test" });
      if (!opened.ok) throw new Error("did not open");
      const c = opened.value;
      try {
        const inner = c.store;
        const facts = structuredClone([...inner.listFacts()]) as OwnerFact[];
        const result = mutate(facts);
        const out = Array.isArray(result) ? (result as OwnerFact[]) : facts;
        const bound: CampaignStore = {
          descriptor: inner.descriptor,
          head: () => inner.head(),
          getFact: (k) => out.find((f) => f.key === k),
          listFacts: () => out,
          lookupReceipt: (i) => inner.lookupReceipt(i),
          committedGroup: (i) => inner.committedGroup(i),
          commit: (g) => inner.commit(g),
          close: () => inner.close(),
        };
        return [
          ...verifyEpistemicIntegrity(bound),
          ...verifyRefereeIntegrity(bound),
          ...verifyTemporalIntegrity(bound),
        ]
          .map((v) => v.message)
          .join(" | ");
      } finally {
        await c.close();
      }
    }
    const by = (facts: OwnerFact[], re: RegExp) => facts.find((f) => re.test(f.key)) as any;
    const event = (f: OwnerFact[]) => by(f, /^access\/[^/]+\/event$/);
    const prov = (f: OwnerFact[]) => by(f, /^access\/[^/]+\/provenance\//);
    const decision = (f: OwnerFact[]) =>
      f.find((x: any) => x.value?.operation === "F014D_DIRECT_PERCEPTION") as any;
    const source = (f: OwnerFact[]) => by(f, /^world\/[^/]+\/source\//);

    it("a healthy saved source-scoped observation verifies", async () => {
      expect(await drift(() => undefined)).toBe("");
    });

    it("an event whose source pin was retargeted — at the locus, the world, another source, an older or newer version — is not what its decision determines", async () => {
      const edits: Record<string, (f: any) => void> = {
        "pinned at the locus instead": (f) =>
          (f.value.source.fact_key = "world/world-ashfall/locus/locus-salt-pans"),
        "pinned at the world instead": (f) =>
          (f.value.source.fact_key = "world/world-ashfall/profile"),
        "pinned at another source": (f) =>
          (f.value.source.fact_key = "world/world-ashfall/source/src-other"),
        "pinned at a newer version": (f) => (f.value.source.version = 9),
        "pinned at the next version": (f) => (f.value.source.version = 2),
      };
      for (const [name, edit] of Object.entries(edits))
        expect(await drift((facts) => edit(event(facts))), name).toMatch(
          /exactly what its retained decision determines|source is committed|access is established/,
        );
      expect(await drift((facts) => (prov(facts).value.source.version = 9))).toMatch(
        /engine-side record of its packet/,
      );
    });

    it("a retained reading whose source citation was edited, dropped, duplicated or retargeted no longer re-derives", async () => {
      const refs = (f: OwnerFact[]) => decision(f).value.input.refs as any[];
      const cases: Record<string, (f: OwnerFact[]) => unknown> = {
        "the source citation dropped": (f) => refs(f).pop(),
        "the source citation retargeted at the locus": (f) =>
          (refs(f)[5].fact_key = refs(f)[4].fact_key),
        "the source citation retargeted at another world's source": (f) =>
          (refs(f)[5].fact_key = "world/w2/source/src-salt-pan-1"),
        "the source citation duplicated": (f) => refs(f).push({ ...refs(f)[5] }),
        "the source citation at another version": (f) => (refs(f)[5].version = 9),
        "the appearance relabelled as a locus fact's": (f) =>
          (decision(f).value.decision.payload.source_fact_id = "locus.designation"),
      };
      for (const [name, edit] of Object.entries(cases))
        expect(await drift((f) => edit(f)), name).not.toBe("");
    });

    it("the source fact edited in place (the same version) no longer matches what the reading was asked and answered on", async () => {
      expect(
        await drift((f) => (source(f).value.access_facts[0].statement = "A dark pit lies here.")),
      ).toMatch(/digest|context|re-derive|no longer|quotation/i);
      // a source the world has since advanced is history, not a violation (the real-delivery case above); here only its OWN facts are edited
      expect(await drift((f) => f.filter((x) => x !== source(f)))).not.toBe("");
      expect(
        await drift((f) => (source(f).value.locality.locus.entity_id = "locus-elsewhere")),
      ).not.toBe("");
    });

    it("the reading's verdict cannot be raised or lowered, and the established appearance cannot be swapped", async () => {
      expect(await drift((f) => (decision(f).value.verdict = "OBSERVATION_OBSTRUCTED"))).toMatch(
        /verdict is not the one its answer derives/,
      );
      expect(
        await drift((f) => (decision(f).value.decision.payload.content = "a vast golden door")),
      ).not.toBe("");
      expect(NEUTRAL_CONTENT.length).toBeGreaterThan(0);
      expect(EXPOSED.length).toBeGreaterThan(0);
    });
  },
);
