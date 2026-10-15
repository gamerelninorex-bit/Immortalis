/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements and poke saved packages */
// BLUE v5.2 — active-PC direct physical observation: crash, retry, reload and tamper. The observation spans several owners' separate,
// identity-derived commits (the referee's retained reading, the Epistemic owner's event, the Temporal engagement and its one transaction
// with the packet formation), so an interruption between any two leaves a real, partial campaign; the same command resumes by identity,
// re-asks nothing it already holds, forms nothing twice, and lands on exactly the campaign an uninterrupted run produces. And a saved
// campaign whose observation records were edited does not open silently. The scripted host is a policy the test wrote (plumbing only).
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  EpistemicAccessAdapter,
  RefereeAdjudicationAdapter,
  TemporalCoordinator,
  factKind,
  formObservedPacket,
  verifyEpistemicIntegrity,
  verifyRefereeIntegrity,
  verifyTemporalIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import { CommitGroupSchema, type OwnerFact } from "@immortalis/contracts";
import { openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { CAMPAIGN, runAuthor } from "../support/original-pc.ts";
import {
  observationCampaign,
  observationPolicy,
  observe,
  observeArgs,
  redScene,
  decide,
} from "../support/observation.ts";
import { tempDir } from "../support/tmp.ts";

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

/** What a campaign holds, by key, owner and version (the referee task identity is the one key normalized). */
async function shape(dirs: LocalityDirs) {
  const opened = await CanonicalCampaign.open(dirs.campaignDir, {
    buildId: "observation-recovery-reader",
    reclaimStaleLock: true,
  });
  if (!opened.ok) throw new Error(`did not open: ${JSON.stringify(opened.error)}`);
  const c = opened.value;
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

async function reference() {
  const { dirs } = await observationCampaign();
  const { result } = await observe(dirs);
  expect(result.status).toBe("OBSERVATION_RECEIVED");
  return shape(dirs);
}

const count = async (dirs: LocalityDirs, re: RegExp) => {
  const opened = await CanonicalCampaign.open(dirs.campaignDir, {
    buildId: "observation-recovery-reader",
    reclaimStaleLock: true,
  });
  if (!opened.ok) throw new Error("did not open");
  try {
    return opened.value.store.listFacts().filter((f) => re.test(f.key)).length;
  } finally {
    await opened.value.close();
  }
};

describe("a lost acknowledgement at each owner commit converges on the uninterrupted campaign", () => {
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
        const { dirs } = await observationCampaign();
        loseReply(proto, op, commit);
        const first = await observe(dirs);
        expect(first.result.status).toBe("CHARACTER_OUTCOME_UNKNOWN");
        vi.restoreAllMocks();
        // never more than one of each, however far it got
        expect(await count(dirs, /^access\/[^/]+\/event$/)).toBeLessThanOrEqual(1);
        expect(await count(dirs, /^access\/[^/]+\/packet\//)).toBeLessThanOrEqual(1);
        crashedHolder(dirs.campaignDir);
        const again = await observe(dirs, undefined, { reclaimStaleLock: true });
        expect(again.result.status).toBe("OBSERVATION_RECEIVED");
        expect(await shape(dirs)).toEqual(expected);
        expect(await count(dirs, /^access\/[^/]+\/packet\//)).toBe(1);
        expect(await count(dirs, /^temporal\/transaction\//)).toBe(1);
        const c = await openOrdinary(dirs.campaignDir);
        try {
          expect(c.verify()).toEqual([]);
        } finally {
          await c.close();
        }
      },
      240_000,
    );
});

describe("the event-triggered formation recovers at each durable commit without a boundary", () => {
  for (const boundary of ["authority", "packet", "transaction"] as const)
    for (const landed of [false, true])
      it(`${boundary} reply lost, commit ${landed ? "landed" : "absent"}: reopen and resume the same event`, async () => {
        const { dirs } = await observationCampaign();
        const c = await openOrdinary(dirs.campaignDir);
        const d = await decide(c);
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
          expect(
            reopened.store.listFacts().filter((f) => /^access\/[^/]+\/packet\//.test(f.key)),
          ).toHaveLength(1);
          expect(reopened.store.getFact("temporal/boundary-index")).toBeUndefined();
          expect(
            reopened.store.listFacts().filter((f) => /^temporal\/object\//.test(f.key)),
          ).toEqual([]);
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
      const { dirs } = await observationCampaign();
      const killed = await runAuthor(observeArgs(dirs), [phrase], {
        host: { dirs, policy: observationPolicy() },
        killAfter,
      });
      expect(killed.signal).toBe("SIGKILL");
      expect(await count(dirs, /^access\/[^/]+\/packet\//)).toBe(held);
      crashedHolder(dirs.campaignDir);
      const again = await runAuthor(observeArgs(dirs, ["--reclaim-stale-lock"]), [phrase], {
        host: { dirs, policy: observationPolicy() },
      });
      expect(again.stdout).toContain("STATUS OBSERVATION_RECEIVED");
      expect(await shape(dirs)).toEqual(expected);
      expect(await count(dirs, /^access\/[^/]+\/packet\//)).toBe(1);
    }, 240_000);
});

describe("load fails closed on a corrupted saved observation", { timeout: 600_000 }, () => {
  let master: string | null = null;
  async function saved(): Promise<string> {
    if (master === null) {
      const { dirs } = await observationCampaign({ scene: redScene() });
      const r = await observe(dirs);
      expect(r.result.status).toBe("OBSERVATION_RECEIVED");
      master = dirs.campaignDir;
    }
    const copy = join(tempDir("immortalis-observation-tamper-"), "campaign");
    cpSync(master, copy, { recursive: true });
    return copy;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { buildId: "tamper-test" });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code;
  };

  it("a valid saved campaign opens, and an edited saved state file does not (the loader's own refusal)", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
    for (const edit of [
      (f: any) => (f.value.payload.content = "a vast golden door"),
      (f: any) => (f.value.participants = ["pc-other"]),
    ]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => /^access\/[^/]+\/event$/.test(f.key)));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir)).not.toBe("OK");
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
  const packet = (f: OwnerFact[]) => by(f, /^access\/[^/]+\/packet\//);
  const prov = (f: OwnerFact[]) => by(f, /^access\/[^/]+\/provenance\//);
  const decision = (f: OwnerFact[]) =>
    f.find((x: any) => x.value?.operation === "F014D_DIRECT_PERCEPTION") as any;

  it("a healthy saved observation verifies", async () => {
    expect(await drift(() => undefined)).toBe("");
  });

  it("an edit of the saved event is raised by the Epistemic verifier: the event is exactly what its decision determines", async () => {
    const edits: Record<string, (f: any) => void> = {
      "payload content": (f) => (f.value.payload.content = "a vast golden door"),
      "payload referent": (f) => (f.value.payload.referent = "something else"),
      "an attribution presented": (f) => (f.value.payload.presented_attribution = "a seal"),
      "channel changed": (f) => (f.value.channel = "SPEECH"),
      "a representation dependency added": (f) => (f.value.representation = { capability_id: "c" }),
      "basis moved": (f) => (f.value.established_at.value = 7),
      "source version moved": (f) => (f.value.source.version = 9),
      "source fact moved": (f) => (f.value.source.fact_key = "world/x/profile"),
      "source owner moved": (f) => (f.value.source.owner = "pc_existence"),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(await drift((facts) => edit(event(facts))), name).toMatch(
        /exactly what its retained decision determines|source is committed|access is established/,
      );
    expect(
      await drift((facts) => {
        event(facts).value.participants = ["pc-other"];
      }),
    ).toMatch(/recipient|exactly what its retained decision determines/);
    expect(
      await drift((facts) => {
        delete event(facts).value.recipient_role;
      }),
    ).toMatch(/exactly what its retained decision determines|recipient is not the active/);
  });

  it("the observation citation is what makes an event observation-earned: re-labelling it invalidates its event trigger", async () => {
    expect(
      await drift(
        (facts) => (event(facts).provenance.rule = factKind("epistemic_access_event").rule),
      ),
    ).toMatch(/observation-earned event/);
  });

  it("an edit of the saved packet or sealed provenance is raised: a packet is exactly what its event determines", async () => {
    expect(await drift((f) => (packet(f).value.payload.content = "a vast golden door"))).toMatch(
      /exactly what its committed event determines/,
    );
    expect(await drift((f) => (packet(f).value.access.channel = "SPEECH"))).toMatch(
      /exactly what its committed event determines/,
    );
    expect(await drift((f) => (prov(f).value.source.version = 9))).toMatch(
      /engine-side record of its packet/,
    );
    expect(await drift((f) => (packet(f).secrecy = "epistemic.engine-sealed"))).toMatch(
      /actor-accessible/,
    );
    expect(await drift((f) => f.filter((x) => x !== prov(f)))).toMatch(/sealed provenance/);
    expect(await drift((f) => f.filter((x) => x !== event(f)))).toMatch(/no committed event/);
  });

  it("an edit of the retained reading is raised by the referee verifier, and a reading the receipt rests on cannot be removed", async () => {
    expect(await drift((f) => (decision(f).value.verdict = "OBSERVATION_OBSTRUCTED"))).toMatch(
      /verdict is not the one its answer derives/,
    );
    expect(await drift((f) => (decision(f).value.decision.payload.content = "x"))).toMatch(
      /quotation|derive|digest|exactly/,
    );
    expect(
      await drift(
        (f) => (decision(f).value.decision.position.premises[0].evidence_quote = "I am flying"),
      ),
    ).toMatch(/quotation/);
    expect(await drift((f) => (decision(f).value.input.statement = "I stand elsewhere."))).toMatch(
      /digest|statement/,
    );
    expect(await drift((f) => (decision(f).value.input.observed_at.value = 99))).toMatch(
      /digest|context/,
    );
    expect(await drift((f) => f.filter((x) => x !== decision(f)))).toMatch(
      /reads an? retained direct-perception decision|decision/,
    );
  });

  it("a saved trigger or sealed transaction cannot be changed to another basis, event or boundary", async () => {
    const tx = (f: OwnerFact[]) => by(f, /^temporal\/transaction\//);
    const authority = (f: OwnerFact[]) => by(f, /^temporal\/transaction-authority\//);
    expect(await drift((f) => (authority(f).value.trigger.ref = "other-event"))).toMatch(
      /observation|authority/,
    );
    expect(await drift((f) => (authority(f).value.requested.target.value += 1))).toMatch(
      /observation|authority/,
    );
    expect(await drift((f) => (tx(f).value.trigger.ref = "other-event"))).toMatch(
      /observation|authority/,
    );
    expect(
      await drift((f) => {
        tx(f).value.stages = [];
      }),
    ).toMatch(/single event-triggered packet stage/);
    expect(await drift((f) => f.filter((x) => !/^temporal\/transaction\//.test(x.key)))).not.toBe(
      "",
    );
  });
});
