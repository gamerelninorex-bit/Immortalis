/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap owner operations to simulate lost acknowledgements and poke saved packages */
// BLUE v5.2-A1 — NON-PC NAMED-ACTOR SOURCE-QUALIFIED DIRECT PERCEPTION: crash, retry, reload and tamper. The perception spans several owners'
// separate, identity-derived commits (the referee's retained reading, the Epistemic owner's event that pins the Source Condition, and the one
// event-triggered transaction with the packet formation), so an interruption between any two leaves a real, partial campaign; the same request
// resumes by identity, re-asks nothing it already holds, forms nothing twice, and lands on exactly the campaign an uninterrupted run produces.
// A reopened campaign derives the identical identities and payload without duplicates, and a saved campaign whose reading, event or source was
// edited does not verify. The scripted host is a policy the test wrote (plumbing only: no claim about any AI's reading).
import { cpSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  EpistemicAccessAdapter,
  RefereeAdjudicationAdapter,
  TemporalCoordinator,
  actorObservationEventId,
  actorObservationRecordOf,
  formActorObservedPacket,
  recordContextViolation,
  verifyEpistemicIntegrity,
  verifyRefereeIntegrity,
  verifyTemporalIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  REFEREE_AUTHORITY,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  refereeDecisionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { ACTOR_BOUNDARY_T, ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import {
  ACTOR,
  SIGHT,
  SOURCE,
  actorAnswer,
  actorScene,
  decide,
  reopenScene,
  type ActorScene,
} from "../support/actor-observation.ts";
import { tempDir } from "../support/tmp.ts";

afterEach(() => vi.restoreAllMocks());

const unknown = { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "reply lost" } } as const;
function loseReply(proto: object, op: string, commit: boolean) {
  const original = (proto as any)[op] as (...a: unknown[]) => Promise<unknown>;
  return vi.spyOn(proto as any, op).mockImplementation(async function (
    this: object,
    ...args: unknown[]
  ) {
    if (commit) await original.apply(this, args);
    return unknown;
  });
}

const eventId = actorObservationEventId(ACTOR, ACTOR_BOUNDARY_T);
const shape = (store: CampaignStore) =>
  store
    .listFacts()
    .map((f) => ({
      key: f.key.replace(/^referee\/[0-9a-f]{64}\//, "referee/<task>/"),
      owner: f.owner,
      version: f.version,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
const allVerifiers = (store: CampaignStore) => [
  ...verifyEpistemicIntegrity(store),
  ...verifyRefereeIntegrity(store),
  ...verifyTemporalIntegrity(store),
];

/** A scene in its own directory (so the package can be closed, copied and reopened), with its reading retained but nothing formed. */
async function decided() {
  const dir = tempDir();
  const s = await actorScene(dir);
  const d = await decide(s);
  return { dir, s, d };
}

/** What the full uninterrupted run holds: the shape, the packet and the provenance. */
async function reference() {
  const { s, d } = await decided();
  expect((await formActorObservedPacket(s.campaign.store, d.record.key)).ok).toBe(true);
  const out = {
    shape: shape(s.campaign.store),
    packet: structuredClone(s.campaign.store.getFact(accessPacketKey(eventId, ACTOR))!.value),
    provenance: structuredClone(
      s.campaign.store.getFact(accessProvenanceKey(eventId, ACTOR))!.value,
    ),
  };
  await s.campaign.close();
  return out;
}

describe("a closed and reopened campaign holds the identical observation, once", () => {
  it("reopens with every identity and the payload unchanged, verifies, and forming it again writes nothing", async () => {
    const { dir, s, d } = await decided();
    expect((await formActorObservedPacket(s.campaign.store, d.record.key)).ok).toBe(true);
    const before = shape(s.campaign.store);
    const packet = structuredClone(s.campaign.store.getFact(accessPacketKey(eventId, ACTOR))!);
    await s.campaign.close();

    const r = await reopenScene(dir);
    expect(shape(r.campaign.store)).toEqual(before);
    expect(r.campaign.store.getFact(accessPacketKey(eventId, ACTOR))).toEqual(packet);
    expect(allVerifiers(r.campaign.store)).toEqual([]);
    expect(r.campaign.verify()).toEqual([]);
    const head = r.campaign.store.head();
    const again = await formActorObservedPacket(r.campaign.store, d.record.key);
    expect(again.ok && again.value.replayed).toBe(true);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    // the retained reading is recovered, never re-decided, and its identity is the question's
    const redo = await decide(r);
    expect(redo.disposition).toBe("REPLAYED");
    expect(redo.task_id).toBe(d.task_id);
    expect(shape(r.campaign.store)).toEqual(before);
    await r.campaign.close();
  });

  it("a crash after the reading but before the event: the package reopens holding only the reading, and the request completes it by identity", async () => {
    const want = await reference();
    const { dir, s, d } = await decided();
    await s.campaign.close();
    const r = await reopenScene(dir);
    expect(r.campaign.store.listFacts().some((f) => f.key.startsWith("access/"))).toBe(false);
    expect((await formActorObservedPacket(r.campaign.store, d.record.key)).ok).toBe(true);
    expect(shape(r.campaign.store)).toEqual(want.shape);
    expect(r.campaign.store.getFact(accessPacketKey(eventId, ACTOR))!.value).toEqual(want.packet);
    expect(r.campaign.store.getFact(accessProvenanceKey(eventId, ACTOR))!.value).toEqual(
      want.provenance,
    );
    expect(allVerifiers(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });
});

describe("an interruption between any two owners' commits resumes by identity to exactly the uninterrupted campaign", () => {
  it("a lost reply on the event (committed, unacknowledged) is recovered: the formation finishes and writes nothing twice", async () => {
    const want = await reference();
    const { s, d } = await decided();
    const spy = loseReply(EpistemicAccessAdapter.prototype, "establishActorObservedAccess", true);
    const lost = await formActorObservedPacket(s.campaign.store, d.record.key);
    expect(lost.ok).toBe(false);
    expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
    // the event DID commit; no packet exists yet
    expect(s.campaign.store.getFact(accessEventKey(eventId))).toBeDefined();
    expect(s.campaign.store.getFact(accessPacketKey(eventId, ACTOR))).toBeUndefined();
    spy.mockRestore();
    const resumed = await formActorObservedPacket(s.campaign.store, d.record.key);
    expect(resumed.ok, JSON.stringify(resumed)).toBe(true);
    expect(shape(s.campaign.store)).toEqual(want.shape);
    expect(s.campaign.store.getFact(accessPacketKey(eventId, ACTOR))!.value).toEqual(want.packet);
    expect(s.campaign.store.getFact(accessProvenanceKey(eventId, ACTOR))!.value).toEqual(
      want.provenance,
    );
    expect(allVerifiers(s.campaign.store)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a lost reply on the event that did NOT commit is recovered the same way: the event is written once", async () => {
    const want = await reference();
    const { s, d } = await decided();
    const spy = loseReply(EpistemicAccessAdapter.prototype, "establishActorObservedAccess", false);
    const lost = await formActorObservedPacket(s.campaign.store, d.record.key);
    expect(lost.ok).toBe(false);
    expect(s.campaign.store.getFact(accessEventKey(eventId))).toBeUndefined();
    spy.mockRestore();
    expect((await formActorObservedPacket(s.campaign.store, d.record.key)).ok).toBe(true);
    expect(shape(s.campaign.store)).toEqual(want.shape);
    expect(allVerifiers(s.campaign.store)).toEqual([]);
  });

  it("a crash after the event but before the packet formation (the transaction never ran) resumes: the formation runs once", async () => {
    const want = await reference();
    const { s, d } = await decided();
    const spy = vi
      .spyOn(TemporalCoordinator.prototype, "advance")
      .mockResolvedValue(unknown as never);
    const lost = await formActorObservedPacket(s.campaign.store, d.record.key);
    expect(lost.ok).toBe(false);
    expect(s.campaign.store.getFact(accessEventKey(eventId))).toBeDefined();
    expect(s.campaign.store.getFact(accessPacketKey(eventId, ACTOR))).toBeUndefined();
    // the partial campaign is lawful as it stands: an event awaiting its own formation is not a violation
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
    spy.mockRestore();
    const resumed = await formActorObservedPacket(s.campaign.store, d.record.key);
    expect(resumed.ok).toBe(true);
    expect(shape(s.campaign.store)).toEqual(want.shape);
    expect(allVerifiers(s.campaign.store)).toEqual([]);
  });

  it("a lost reply on the packet-formation transaction (committed, unacknowledged) is recovered as a replay", async () => {
    const want = await reference();
    const { s, d } = await decided();
    const spy = loseReply(TemporalCoordinator.prototype, "advance", true);
    const lost = await formActorObservedPacket(s.campaign.store, d.record.key);
    expect(lost.ok).toBe(false);
    expect(s.campaign.store.getFact(accessPacketKey(eventId, ACTOR))).toBeDefined();
    spy.mockRestore();
    const resumed = await formActorObservedPacket(s.campaign.store, d.record.key);
    expect(resumed.ok && resumed.value.replayed).toBe(true);
    expect(shape(s.campaign.store)).toEqual(want.shape);
    expect(allVerifiers(s.campaign.store)).toEqual([]);
  });

  it("a lost reply on the retained reading is reconciled by its deterministic identity: the same answer recovers, a different one is a conflict", async () => {
    const dir = tempDir();
    const s = await actorScene(dir);
    const task = s.referee.actorObservationTask({
      actor_id: ACTOR,
      capability_id: SIGHT,
      source_key: SOURCE,
      attempt: 0,
    });
    if (!task.ok) throw new Error("task");
    const answer = actorAnswer({ task_id: task.value.task_id, context: task.value.context });
    const store = s.campaign.store;
    const original = store.commit.bind(store);
    vi.spyOn(store, "commit").mockImplementation(async (g) => {
      await original(g);
      return unknown as never;
    });
    const input = {
      operation: { ...REFEREE_AUTHORITY },
      host: { host_id: "engine-direct-test", claimed_model: null },
      actor_id: ACTOR,
      capability_id: SIGHT,
      source_key: SOURCE,
      attempt: 0,
      answer,
    };
    const lost = await s.referee.recordActorObservation(input);
    expect(lost.ok).toBe(false);
    expect(store.getFact(refereeDecisionKey(task.value.task_id))).toBeDefined();
    vi.restoreAllMocks();
    // a DIFFERENT answer is refused while the earlier attempt's outcome is unreconciled; reopened, the same question finds its answer
    await s.campaign.close();
    const r = await reopenScene(dir);
    const again = await r.referee.recordActorObservation(input);
    expect(again.ok && again.value.disposition).toBe("REPLAYED");
    const other = await r.referee.recordActorObservation({
      ...input,
      answer: actorAnswer(
        { task_id: task.value.task_id, context: task.value.context },
        { content: "something else entirely" },
      ),
    });
    expect(other.ok).toBe(false);
    expect(!other.ok && other.error.code).toBe("DECISION_CONFLICT");
    expect(verifyRefereeIntegrity(r.campaign.store)).toEqual([]);
    await r.campaign.close();
  });
});

describe("load fails closed on a corrupted saved actor observation", { timeout: 600_000 }, () => {
  let master: string | null = null;
  async function saved(): Promise<string> {
    if (master === null) {
      const { dir, s, d } = await decided();
      expect((await formActorObservedPacket(s.campaign.store, d.record.key)).ok).toBe(true);
      await s.campaign.close();
      master = dir;
    }
    const copy = join(tempDir("immortalis-actor-observation-tamper-"), "campaign");
    cpSync(master, copy, { recursive: true });
    return copy;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const open = (dir: string, buildId: string) =>
    CanonicalCampaign.open(dir, { buildId, extension: ACTOR_FIXTURE_EXTENSION });

  it("a valid saved campaign opens, and an edited saved reading, event or source does not (the loader's own refusal)", async () => {
    const ok = await open(await saved(), "tamper-test");
    expect(ok.ok).toBe(true);
    if (ok.ok) await ok.value.close();
    for (const edit of [
      (j: any) =>
        (j.facts.find((f: any) => /\/source\//.test(f.key)).value.access_facts[0].statement =
          "A dark pit."),
      (j: any) =>
        (j.facts.find((f: any) => /^access\/[^/]+\/event$/.test(f.key)).value.source.version = 2),
      (j: any) =>
        (j.facts.find((f: any) => /^access\/[^/]+\/event$/.test(f.key)).value.participants = [
          "actor-other",
        ]),
      (j: any) =>
        (j.facts.find(
          (f: any) => f.value?.operation === "F014D_ACTOR_DIRECT_PERCEPTION",
        ).value.verdict = "OBSERVATION_OBSTRUCTED"),
    ]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j);
      writeFileSync(p, JSON.stringify(j));
      const r = await open(dir, "tamper-test");
      expect(r.ok).toBe(false);
    }
  });

  // The loader's state hash refuses ANY edited file, so it cannot show that the OWNERS' verifiers see an edit. These cases hand the
  // verifiers a store whose committed facts were altered in memory (the hash chain bypassed) and assert the specific violation raised.
  async function drift(mutate: (facts: OwnerFact[]) => unknown) {
    const dir = await saved();
    const opened = await open(dir, "drift-test");
    if (!opened.ok) throw new Error("did not open");
    const c = opened.value;
    try {
      const inner = c.store;
      const facts = structuredClone([...inner.listFacts()]) as OwnerFact[];
      const result = mutate(facts);
      // a mutation that returns a list of facts replaces the committed set (a dropped fact); any other value is an assignment's result
      const isFacts = (r: unknown): r is OwnerFact[] =>
        Array.isArray(r) &&
        r.every((x) => typeof x === "object" && x !== null && "key" in x && "value" in x);
      const out = isFacts(result) ? result : facts;
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
      return allVerifiers(bound)
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
    f.find((x: any) => x.value?.operation === "F014D_ACTOR_DIRECT_PERCEPTION") as any;
  const source = (f: OwnerFact[]) => by(f, /^world\/[^/]+\/source\//);
  const coupling = (f: OwnerFact[]) => by(f, /^world-state\/actor\/[^/]+\/coupling$/);
  const capability = (f: OwnerFact[]) => by(f, /^actor\/[^/]+\/capability\//);

  it("a healthy saved actor observation verifies", async () => {
    expect(await drift(() => undefined)).toBe("");
  });

  it("an event whose source pin was retargeted — at the locus, the world, another source, an older or newer version — is not what its decision determines", async () => {
    const edits: Record<string, (f: any) => void> = {
      "pinned at the locus instead": (f) =>
        (f.value.source.fact_key = "world/world-fixture-1/locus/locus-fixture-1"),
      "pinned at the world instead": (f) =>
        (f.value.source.fact_key = "world/world-fixture-1/profile"),
      "pinned at another source": (f) =>
        (f.value.source.fact_key = "world/world-fixture-1/source/source-other"),
      "pinned at a newer version": (f) => (f.value.source.version = 9),
      "pinned at the next version": (f) => (f.value.source.version = 2),
      "retargeted at another recipient": (f) => (f.value.participants = ["actor-other"]),
      "asserting the PC role": (f) => (f.value.recipient_role = "role.player_character"),
      "the payload swapped": (f) => (f.value.payload.content = "a vast golden door"),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(await drift((facts) => edit(event(facts))), name).not.toBe("");
    expect(await drift((facts) => (prov(facts).value.source.version = 9))).toMatch(
      /engine-side record of its packet/,
    );
    expect(
      await drift((facts) => (packet(facts).value.payload.content = "a vast golden door")),
    ).toMatch(/exactly what its committed event determines/);
  });

  it("a retained reading whose citations were edited, dropped, duplicated or retargeted no longer re-derives", async () => {
    const refs = (f: OwnerFact[]) => decision(f).value.input.refs as any[];
    const cases: Record<string, (f: OwnerFact[]) => unknown> = {
      "the source citation dropped": (f) => refs(f).pop(),
      "the source citation retargeted at the locus": (f) =>
        (refs(f)[4].fact_key = refs(f)[3].fact_key),
      "the source citation retargeted at another world's source": (f) =>
        (refs(f)[4].fact_key = "world/w2/source/source-main"),
      "the source citation duplicated": (f) => refs(f).push({ ...refs(f)[4] }),
      "the source citation at another version": (f) => (refs(f)[4].version = 9),
      "the capability citation retargeted at another actor's": (f) =>
        (refs(f)[0].fact_key = "actor/actor-other/capability/keen-sight"),
      "the coupling citation dropped": (f) => refs(f).splice(1, 1),
      "the appearance relabelled as a locus fact's": (f) =>
        (decision(f).value.decision.payload.source_fact_id = "locus.designation"),
      "the subject retargeted at another actor": (f) =>
        (decision(f).value.subject = { actor_id: "actor-other" }),
      "the observation basis moved": (f) => (decision(f).value.input.observed_at.value = 141),
    };
    for (const [name, edit] of Object.entries(cases))
      expect(await drift((f) => edit(f)), name).not.toBe("");
  });

  it("the premises edited in place (the same version) no longer match what the reading was asked and answered on", async () => {
    expect(
      await drift((f) => (source(f).value.access_facts[0].statement = "A dark pit lies here.")),
    ).toMatch(/digest|context|re-derive|no longer|quotation/i);
    expect(await drift((f) => f.filter((x) => x !== source(f)))).not.toBe("");
    expect(await drift((f) => f.filter((x) => x !== coupling(f)))).not.toBe("");
    expect(await drift((f) => f.filter((x) => x !== capability(f)))).not.toBe("");
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
    expect(NEUTRAL.length).toBeGreaterThan(0);
  });

  it("a source or capability the owners later advanced is history, not a violation: the record verifies from what it retains", async () => {
    const dir = await saved();
    const opened = await open(dir, "history-test");
    if (!opened.ok) throw new Error("did not open");
    const c = opened.value;
    try {
      const record = actorObservationRecordOf(
        c.store.listFacts().find((f) => decision([f]) !== undefined),
      )!;
      const advanced = (key: string, version: number) => (k: string) => {
        const f = c.store.getFact(k);
        return f && k === key ? ({ ...structuredClone(f), version } as OwnerFact) : f;
      };
      const sourceKey = record.input.refs[4]!.fact_key;
      expect(recordContextViolation(record, advanced(sourceKey, 2))).toBeNull();
      // a record cited at a version the committed fact has NOT reached is stale, not history
      expect(recordContextViolation(record, advanced(sourceKey, 0))).toMatchObject({
        code: "CONTEXT_STALE",
      });
    } finally {
      await c.close();
    }
  });
});

const NEUTRAL = "a low heap of pale, crystalline crust lying bare on the floor";
export type { ActorScene, RefereeAdjudicationAdapter };
