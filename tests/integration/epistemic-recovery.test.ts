/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// Epistemic Access — save → close → load → continue across every meaningful durable cut of the access lifecycle, a
// failure at every durable step of the one new multi-step boundary this slice introduces (the authored event publication,
// then the packet-formation transaction: authority, capability close, packet + sealed provenance, consuming stage, kernel
// group), and load-time failure on a corrupted or inconsistent save. The Epistemic path reuses the existing persistence,
// receipts, journal and stage-identity machinery: after any crash, retry, replay or reload the event, the packet and the
// sealed provenance each exist exactly once, keep their identity, the provenance separation and the capability-close
// reference, and are never re-formed, improved or re-rolled (no randomness exists).
// Register lineage: IA-06, IA-11 (partial), IA-16 (partial), IA-22 (partial), IA-30 (partial); RC-04, RC-05, RC-11, RC-16;
// IM-02, IM-03, IM-10, IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  actorCapabilityKey,
  actorCapabilityStage,
  pcExistenceContractKey,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  EPISTEMIC_ACCESS_RULE,
  EpistemicAccessAdapter,
  createFileCampaign,
  stageGroupId,
  stageIntentId,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  EPISTEMIC_FIXTURE_EXTENSION,
  EVENT_COUNCIL,
  FIXTURE_CAMPAIGN,
  SOURCE_SPEAKER,
  accessEvent,
  accessPublication,
  fixtureContract,
  group,
  historyGroup,
  packetAdvanceRequest,
  packetConsumerResultKey,
  sourceGroup,
  sourceKey,
  write,
} from "@immortalis/testkit";
import {
  epistemicCoordinator,
  epistemicSummary,
  establishAccess,
  establishCapability,
  registerPacketConsumer,
  reopenEpistemic,
  seededEpistemicCampaign,
  type EpistemicSeeded,
} from "../support/epistemic.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const E = EVENT_COUNCIL;
const eventKey = accessEventKey(E);
const packetKey = accessPacketKey(E, A);
const provKey = accessProvenanceKey(E, A);
const capKey = actorCapabilityKey(A, C);
const capStage = actorCapabilityStage(A, C);
const stage = accessPacketStage(E, A);
const withCapability = { representation: { capability_id: C } };
const advance = (s: Pick<EpistemicSeeded, "coordinator">) =>
  s.coordinator.advance(packetAdvanceRequest("tx-1", "c1"));

/** A store that "crashes" (nothing committed, unknown outcome) before the first group the predicate names. */
function crashBefore(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: any) =>
      block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } } as never)
        : inner.commit(g),
  };
}
/** A store that COMMITS the group the predicate names and then loses the reply (unknown outcome). */
function lostReply(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    ...crashBefore(inner, () => false),
    commit: async (g: any) => {
      const r = await inner.commit(g);
      return block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
        : r;
    },
  };
}
const isCapabilityGroup = (g: any) =>
  g.owner === "named_actor" && g.writes.some((w: any) => w.key === capKey);
const isFormationGroup = (g: any) => g.writes.some((w: any) => w.key === packetKey);
const isConsumerGroup = (g: any) =>
  g.writes.some((w: any) => w.key === packetConsumerResultKey("c1"));
const isKernelGroup = (g: any) => g.group_id.startsWith("transaction-group:");
const isAuthorityGroup = (g: any) => g.group_id.startsWith("transaction-authority-group:");
const isEventGroup = (g: any) => g.writes.some((w: any) => w.key === eventKey);

/** Establishes the capability basis, then the event that depends on it, and registers the consequence. */
async function prepare(s: EpistemicSeeded) {
  const basis = await establishCapability(s, 1);
  const event = await establishAccess(s, 2, E, A, withCapability);
  await registerPacketConsumer(s, "c1", event, basis, 3);
}

/** The deterministic reference: the whole lifecycle, uninterrupted. */
async function referenceRun() {
  const s = await seededEpistemicCampaign(tempDir());
  await prepare(s);
  await must(advance(s));
  const head = s.campaign.store.head();
  const summary = epistemicSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}
const same = (head: ReturnType<CampaignStore["head"]>, ref: ReturnType<CampaignStore["head"]>) => {
  expect(head.state_sha256).toBe(ref.state_sha256);
  expect(head.journal_entries).toBe(ref.journal_entries);
  expect(head.journal_head_sha256).toBe(ref.journal_head_sha256);
};
const versions = (s: EpistemicSeeded) => {
  const f = (k: string) => s.campaign.store.getFact(k)?.version ?? 0;
  return {
    event: f(eventKey),
    packet: f(packetKey),
    provenance: f(provKey),
    capability: f(capKey),
    consumer: f(packetConsumerResultKey("c1")),
  };
};

type Cut = {
  name: string;
  build: (s: EpistemicSeeded) => Promise<void>;
  versions: ReturnType<typeof versions>;
};
const cuts: Cut[] = [
  {
    name: "causal history and carriers committed, no event yet",
    build: async () => {},
    versions: { event: 0, packet: 0, provenance: 0, capability: 0, consumer: 0 },
  },
  {
    name: "event sealed, its consequence not yet registered",
    build: async (s) => {
      await establishCapability(s, 1);
      await establishAccess(s, 2, E, A, withCapability);
    },
    versions: { event: 1, packet: 0, provenance: 0, capability: 0, consumer: 0 },
  },
  {
    name: "consequence registered, boundary not yet resolved",
    build: prepare,
    versions: { event: 1, packet: 0, provenance: 0, capability: 0, consumer: 0 },
  },
  {
    name: "capability close committed, packet formation not",
    build: async (s) => {
      await prepare(s);
      const r = await epistemicCoordinator(crashBefore(s.campaign.store, isFormationGroup)).advance(
        packetAdvanceRequest("tx-1", "c1"),
      );
      expect(r.ok).toBe(false);
    },
    versions: { event: 1, packet: 0, provenance: 0, capability: 1, consumer: 0 },
  },
  {
    name: "packet and sealed provenance committed, consuming stage not",
    build: async (s) => {
      await prepare(s);
      const r = await epistemicCoordinator(crashBefore(s.campaign.store, isConsumerGroup)).advance(
        packetAdvanceRequest("tx-1", "c1"),
      );
      expect(r.ok).toBe(false);
    },
    versions: { event: 1, packet: 1, provenance: 1, capability: 1, consumer: 0 },
  },
  {
    name: "all stages committed, the kernel transaction not",
    build: async (s) => {
      await prepare(s);
      await epistemicCoordinator(crashBefore(s.campaign.store, isKernelGroup)).advance(
        packetAdvanceRequest("tx-1", "c1"),
      );
    },
    versions: { event: 1, packet: 1, provenance: 1, capability: 1, consumer: 1 },
  },
  {
    name: "completed and sealed by its transaction",
    build: async (s) => {
      await prepare(s);
      await must(advance(s));
    },
    versions: { event: 1, packet: 1, provenance: 1, capability: 1, consumer: 1 },
  },
];

describe("save → close → load → continue at every durable cut of the access lifecycle (acceptance 14)", () => {
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, verifies, and the continuation converges on the uninterrupted result`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededEpistemicCampaign(dir);
      await cut.build(s);
      expect(versions(s)).toEqual(cut.versions);
      const before = epistemicSummary(s.campaign, s.coordinator);
      expect(s.campaign.verify()).toEqual([]);
      await s.campaign.close();
      const r = await reopenEpistemic(dir);
      expect(r.campaign.verify()).toEqual([]);
      // a valid event, packet, sealed provenance and capability-close reference survive unchanged
      expect(epistemicSummary(r.campaign, r.coordinator)).toEqual(before);
      expect(versions(r)).toEqual(cut.versions);
      // continue: whatever the cut, finishing the lifecycle reaches the reference result
      if (cut.versions.event === 0) {
        await establishCapability(r, 1);
        await establishAccess(r, 2, E, A, withCapability);
      }
      if (cut.versions.event === 0 || cut.name.startsWith("event sealed"))
        await registerPacketConsumer(
          r,
          "c1",
          r.access.event(E)!.value,
          r.actors.basis(A, C)!.value,
          3,
        );
      if (!cut.name.startsWith("completed")) await must(advance(r));
      else expect((await must(advance(r))).replayed).toBe(true);
      same(r.campaign.store.head(), ref.head);
      expect(epistemicSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the continuation reads the same packet after a reload: identity, provenance separation and capability-close reference are preserved; nothing is re-formed or re-rolled", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await prepare(s);
    await must(advance(s));
    const packet = structuredClone(s.campaign.store.getFact(packetKey)!);
    const prov = structuredClone(s.campaign.store.getFact(provKey)!);
    const receipt = s.campaign.store.lookupReceipt(stageIntentId(stage))!;
    await s.campaign.close();
    const r = await reopenEpistemic(dir);
    expect(r.campaign.store.getFact(packetKey)).toEqual(packet);
    expect(r.campaign.store.getFact(provKey)).toEqual(prov);
    expect(r.campaign.store.lookupReceipt(stageIntentId(stage))).toEqual(receipt);
    // packet identity: the same key, the same stage-derived group and intent
    expect(r.access.packet(E, A)!.formation_group).toBe(stageGroupId(stage));
    // provenance separation: the actor-accessible surface still holds no engine reference; the sealed one still does
    expect(JSON.stringify(r.access.packet(E, A)!.value)).not.toContain(sourceKey(SOURCE_SPEAKER));
    expect(r.access.engineSealedProvenance(E, A)!.value.source.fact_key).toBe(
      sourceKey(SOURCE_SPEAKER),
    );
    expect(r.access.packet(E, A)!.fact.secrecy).toBe("epistemic.actor-accessible");
    expect(r.access.engineSealedProvenance(E, A)!.fact.secrecy).toBe("epistemic.engine-sealed");
    // capability-close reference
    expect(r.access.packet(E, A)!.value.intelligibility).toMatchObject({
      basis: "ESTABLISHED_CAPABILITY",
      capability: { fact_key: capKey, close: { group_id: stageGroupId(capStage) } },
    });
    // idempotent recovery: continuing replays; no group is committed again
    const again = await must(advance(r));
    expect(again.replayed).toBe(true);
    expect(r.campaign.store.getFact(packetKey)).toEqual(packet);
    expect(r.campaign.store.getFact(provKey)).toEqual(prov);
    await r.campaign.close();
  });
});

describe("a failure at EVERY durable step converges by identity (acceptance 13, 14)", () => {
  const converge = async (
    build: (s: EpistemicSeeded) => Promise<void>,
    finish: (s: EpistemicSeeded) => Promise<void>,
  ) => {
    const ref = await referenceRun();
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await build(s);
    await s.campaign.close();
    const r = await reopenEpistemic(dir);
    await finish(r);
    same(r.campaign.store.head(), ref.head);
    expect(epistemicSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  };

  it("the EVENT publication: a crash before it, and a lost reply after it, each converge on one event", async () => {
    // crash before the group takes effect
    {
      const s = await seededEpistemicCampaign(tempDir());
      const adapter = new EpistemicAccessAdapter(crashBefore(s.campaign.store, isEventGroup));
      const r = await adapter.establishBoundedSharedAccess({
        ...accessPublication(1),
        event: accessEvent(E, A),
      });
      expect(!r.ok && r.error.code).toBe("UNKNOWN_OUTCOME");
      expect(s.access.event(E)).toBeUndefined();
      // reconcile by identity, then retry: exactly one event
      await establishAccess(s, 1, E);
      expect(s.access.event(E)!.fact.version).toBe(1);
      await s.campaign.close();
    }
    // lost reply AFTER it took effect: re-presenting converges on the existing result, even after its carrier advanced
    {
      const s = await seededEpistemicCampaign(tempDir());
      const adapter = new EpistemicAccessAdapter(lostReply(s.campaign.store, isEventGroup));
      const lost = await adapter.establishBoundedSharedAccess({
        ...accessPublication(1),
        event: accessEvent(E, A),
      });
      expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
      const committed = s.access.event(E)!;
      expect(committed.fact.version).toBe(1);
      await must(
        s.campaign.store.commit(
          sourceGroup(FIXTURE_CAMPAIGN, 90, SOURCE_SPEAKER, "SYNTHETIC FIXTURE: moved on", 1),
        ),
      );
      const head = s.campaign.store.head();
      const replay = await must(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(1),
          event: accessEvent(E, A),
        }),
      );
      expect(replay.replayed).toBe(true);
      expect(s.campaign.store.head()).toEqual(head);
      expect(s.access.event(E)).toEqual(committed);
      // a CHANGED intent under the same identity is a conflict, never a silent reuse of the old receipt
      const changed = await s.access.establishBoundedSharedAccess({
        ...accessPublication(1),
        event: accessEvent(E, A, { channel: "PERCEPTION" }),
      });
      expect(changed.ok).toBe(false);
      expect(s.access.event(E)!.value.channel).toBe("SPEECH");
      await s.campaign.close();
    }
  });

  it("the FORMATION TRANSACTION: a crash before each durable step (authority, capability close, formation, consuming stage, kernel group) converges on the identical campaign", async () => {
    for (const [name, block] of [
      ["authority", isAuthorityGroup],
      ["capability close", isCapabilityGroup],
      ["formation", isFormationGroup],
      ["consuming stage", isConsumerGroup],
      ["kernel group", isKernelGroup],
    ] as const) {
      await converge(
        async (s) => {
          await prepare(s);
          const r = await epistemicCoordinator(crashBefore(s.campaign.store, block)).advance(
            packetAdvanceRequest("tx-1", "c1"),
          );
          expect(r.ok, name).toBe(false);
        },
        async (s) => void (await must(advance(s))),
      );
    }
  });

  it("the FORMATION TRANSACTION: a lost reply after each durable step converges, and a committed formation is adopted, never recomputed or re-published", async () => {
    for (const [name, block] of [
      ["capability close", isCapabilityGroup],
      ["formation", isFormationGroup],
      ["consuming stage", isConsumerGroup],
      ["kernel group", isKernelGroup],
    ] as const) {
      await converge(
        async (s) => {
          await prepare(s);
          const r = await epistemicCoordinator(lostReply(s.campaign.store, block)).advance(
            packetAdvanceRequest("tx-1", "c1"),
          );
          expect(r.ok, name).toBe(false);
          // the lost reply did not lose the effect: the group is durably there, exactly once
          if (name === "formation") expect(s.campaign.store.getFact(packetKey)).toBeDefined();
        },
        async (s) => {
          const r = await must(advance(s));
          if (name !== "kernel group") expect(r.adopted.length).toBeGreaterThan(0);
          if (name === "capability close") expect(r.adopted).toContainEqual(capStage);
          if (name === "formation") expect(r.adopted).toContainEqual(stage);
        },
      );
    }
  });

  it("an UNKNOWN outcome is reconciled by identity before any retry can create another result: no sibling packet, no second formation, no improved packet", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await prepare(s);
    await epistemicCoordinator(lostReply(s.campaign.store, isFormationGroup)).advance(
      packetAdvanceRequest("tx-1", "c1"),
    );
    // the formation exists; several retries (a fresh coordinator each) reach the same receipt and never a sibling
    const receipt = s.campaign.store.lookupReceipt(stageIntentId(stage))!;
    const packet = structuredClone(s.campaign.store.getFact(packetKey)!);
    for (let i = 0; i < 3; i++) await must(advance(s));
    expect(s.campaign.store.lookupReceipt(stageIntentId(stage))).toEqual(receipt);
    expect(s.campaign.store.getFact(packetKey)).toEqual(packet);
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("access/") && f.key.includes("/packet/")),
    ).toHaveLength(1);
    expect(s.campaign.store.listFacts().filter((f) => f.key.includes("/provenance/"))).toHaveLength(
      1,
    );
    expect(s.campaign.store.getFact(packetKey)!.version).toBe(1);
    expect(s.campaign.store.getFact(packetKey)!.provenance.group_id).toBe(stageGroupId(stage));
    await s.campaign.close();
  });
});

describe("load fails closed on a corrupted or inconsistent save (acceptance 13, 14)", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await prepare(s);
    await must(advance(s));
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: EPISTEMIC_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  it("an edit of the saved packet or sealed provenance — owner, facet, schema, class, payload, attribution, intelligibility, close reference or provenance — is not silently normalized", async () => {
    const edits: Record<string, [string, (fact: any) => void]> = {
      "payload rewritten": [
        packetKey,
        (f) => (f.value.payload.content = "a more convenient payload"),
      ],
      "attribution replaced": [
        packetKey,
        (f) => (f.value.presented_attribution = "the true source"),
      ],
      "true source leaked into the packet": [
        packetKey,
        (f) => (f.value.source = { owner: "SYNTHETIC-ACCESS-SOURCE" }),
      ],
      "comprehension added to the packet": [
        packetKey,
        (f) => (f.value.comprehension = "understood"),
      ],
      "intelligibility removed": [packetKey, (f) => (f.value.intelligibility = { basis: "x" })],
      "capability version altered": [
        packetKey,
        (f) => (f.value.intelligibility.capability.version = 9),
      ],
      "close group altered": [
        packetKey,
        (f) => (f.value.intelligibility.capability.close.group_id = "elsewhere"),
      ],
      "packet class sealed": [packetKey, (f) => (f.secrecy = "epistemic.engine-sealed")],
      "packet owner changed": [packetKey, (f) => (f.owner = "world_state")],
      "packet facet changed": [packetKey, (f) => (f.facet = "packet")],
      "packet version changed": [packetKey, (f) => (f.version = 2)],
      "packet provenance group altered": [packetKey, (f) => (f.provenance.group_id = "raw-group")],
      "provenance source altered": [provKey, (f) => (f.value.source.fact_key = "synthetic/other")],
      "provenance class opened": [provKey, (f) => (f.secrecy = "epistemic.actor-accessible")],
      "provenance capability dropped": [provKey, (f) => (f.value.capability_close = null)],
      "provenance payload added": [provKey, (f) => (f.value.payload = { content: "x" })],
    };
    for (const [name, [key, edit]] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === key));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("an edit of the saved event (mode, participant, source pin, channel, payload, requirement, time) is not silently normalized either", async () => {
    const edits: Record<string, (fact: any) => void> = {
      "mode reclassified": (f) => (f.value.mode = "BROADCAST_EXPOSURE"),
      "participant replaced": (f) => (f.value.participants = ["actor-other"]),
      "participant added": (f) => (f.value.participants = [A, "actor-other"]),
      "audience added": (f) => (f.value.audience = { area: "town" }),
      "source pin altered": (f) => (f.value.source.version = 5),
      "source owner altered": (f) => (f.value.source.owner = "named_actor"),
      "channel altered": (f) => (f.value.channel = "BROADCAST"),
      payload: (f) => (f.value.payload.content = "a more convenient payload"),
      requirement: (f) => (f.value.representation = null),
      "time in the future": (f) => (f.value.established_at = { unit: "u", value: 99999 }),
      "event class opened": (f) => (f.secrecy = "epistemic.actor-accessible"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === eventKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a journal edit of the packet's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("the gate is opened at first light");
    writeFileSync(
      journal,
      text.replace("the gate is opened at first light", "the gate is opened at dusk"),
    );
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a build that does not register the Epistemic Access owner cannot open the campaign", async () => {
    const dir = await saved();
    const r = await CanonicalCampaign.open(dir);
    expect(r.ok).toBe(false);
  });

  /** A package built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...EPISTEMIC_FIXTURE_EXTENSION.owners]),
      }),
    );
    await build(s);
    await s.close();
    return dir;
  }
  const put = (n: number, key: string, value: unknown, over: any = {}, groupOver: any = {}) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(key, value as never, {
          owner: "epistemic_access",
          facet: "epistemic_access",
          secrecy: "epistemic.engine-sealed",
          ...over,
        }),
      ],
      {
        owner: "epistemic_access",
        facet: "epistemic_access",
        rule: EPISTEMIC_ACCESS_RULE,
        ...groupOver,
      },
    );
  const carrier = (n: number) => sourceGroup(FIXTURE_CAMPAIGN, n, SOURCE_SPEAKER);
  const goodEvent = () => accessEvent(E, A);
  const pin = { reads: [{ key: sourceKey(SOURCE_SPEAKER), version: 1 }] };

  it("a packet or sealed provenance with no committed event, a raw (non-stage) formation and a provenance with no packet are EPISTEMIC_ACCESS_STATE", async () => {
    // a packet with no committed event
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(
            s.commit(
              put(
                1,
                packetKey,
                {
                  recipient: A,
                  payload: { referent: "r", content: "c" },
                  presented_attribution: null,
                  access: {
                    result: "RECEIVED",
                    channel: "SPEECH",
                    established_at: { unit: "u", value: 1 },
                  },
                  intelligibility: {
                    result: "REPRESENTATION_ACCESSIBLE",
                    basis: "NO_CAPABILITY_DEPENDENCY",
                  },
                },
                { secrecy: "epistemic.actor-accessible" },
              ),
            ),
          );
        }),
      ),
    ).toMatch(/EPISTEMIC_ACCESS_STATE/);
    // a provenance with no packet
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(carrier(1)));
          await must(s.commit(put(2, eventKey, goodEvent(), {}, pin)));
          await must(
            s.commit(
              put(3, provKey, {
                event: { fact_key: eventKey, version: 1 },
                recipient: A,
                packet: { fact_key: packetKey },
                source: goodEvent().source,
                channel: "SPEECH",
                capability_close: null,
              }),
            ),
          );
        }),
      ),
    ).toMatch(/EPISTEMIC_ACCESS_STATE/);
  });

  it("owner drift, rule drift, an unregistered Epistemic key, an overwritten seal and a malformed value are each detected on load", async () => {
    expect(
      await openOutcome(
        await rogue(
          async (s) => void (await must(s.commit(put(1, "access/e1/belief/a1", { stance: "x" })))),
        ),
      ),
    ).toBe("UNREGISTERED_KEY");
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(
              s.commit(
                put(
                  1,
                  eventKey,
                  goodEvent(),
                  { owner: "world_state", facet: "world_profile" },
                  { owner: "world_state", facet: "world_profile" },
                ),
              ),
            )),
        ),
      ),
    ).toMatch(/WRONG_OWNER_FACET/);
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(
              s.commit(
                put(
                  1,
                  eventKey,
                  goodEvent(),
                  {},
                  { rule: { ...EPISTEMIC_ACCESS_RULE, clause: "drifted" } },
                ),
              ),
            )),
        ),
      ),
    ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...goodEvent(), mode: "BROADCAST_EXPOSURE" },
      { ...goodEvent(), participants: [A, "actor-other"] },
      { ...goodEvent(), event_id: "someone-else" },
    ])
      expect(
        await openOutcome(
          await rogue(async (s) => void (await must(s.commit(put(1, eventKey, bad))))),
        ),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(carrier(1)));
          await must(s.commit(put(2, eventKey, goodEvent(), {}, pin)));
          await must(
            s.commit(
              put(3, eventKey, accessEvent(E, A, { channel: "PERCEPTION" }), {
                expected_version: 1,
              }),
            ),
          );
        }),
      ),
    ).toMatch(/UNSUPPORTED_AMENDMENT/);
  });

  it("an event written for a Player Character's identity is detected on load, by receipt order", async () => {
    const dir = await rogue(async (s) => {
      await must(s.commit(historyGroup(FIXTURE_CAMPAIGN, 1, `${A}-biography`)));
      await must(s.commit(carrier(2)));
      await must(
        s.commit(
          group(
            FIXTURE_CAMPAIGN,
            3,
            [
              write(pcExistenceContractKey(A), fixtureContract({ pc_id: A }) as never, {
                owner: "pc_existence",
                facet: "existence_contract",
              }),
            ],
            { owner: "pc_existence", facet: "existence_contract" },
          ),
        ),
      );
      await must(s.commit(put(4, eventKey, goodEvent(), {}, pin)));
    });
    expect(await openOutcome(dir)).toMatch(/EPISTEMIC_ACCESS_STATE/);
  });
});
