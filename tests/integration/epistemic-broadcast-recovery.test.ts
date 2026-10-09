/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// F-014D BROADCAST_EXPOSURE event — save → close → load → continue, a crash and a lost reply at the one durable step of
// the event publication, and load-time failure on a corrupted or inconsistent save. The event reuses the existing
// persistence, receipts, journal and sealing: after any crash, retry, replay or reload it exists exactly once, keeps its
// exact original mode, audience reference, payload and evidence, expands to no recipient, and is never re-classified,
// improved or backfilled. A package built around admission (a rogue store) is detected on load by the Epistemic verifier
// from committed state alone, so the source/owner/ordering rules hold against raw commits and reopen, not only the adapter.
// Register lineage: IA-06, IA-11 (partial), IA-16 (partial), IA-22 (partial); RC-05, RC-11, RC-16; IM-03, IM-10, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_STATE_KEY,
  accessEventKey,
  accessPacketKey,
  worldLocusKey,
  worldProfileKey,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  EPISTEMIC_ACCESS_BROADCAST_RULE,
  EPISTEMIC_ACCESS_RULE,
  createFileCampaign,
  verifyEpistemicIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  EPISTEMIC_FIXTURE_EXTENSION,
  EVENT_BROADCAST,
  EVENT_COUNCIL,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  SOURCE_SPEAKER,
  T0,
  accessPublication,
  broadcastEvent,
  group,
  packetAdvanceRequest,
  sourceGroup,
  sourceKey,
  write,
} from "@immortalis/testkit";
import {
  establishAccess,
  establishBroadcast,
  registerPacketConsumer,
  reopenEpistemic,
  seededEpistemicCampaign,
} from "../support/epistemic.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const B = EVENT_BROADCAST;
const bKey = accessEventKey(B);
const locusKey = worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID);

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
const isEventGroup = (g: any) => g.writes.some((w: any) => w.key === bKey);
const accessKeys = (store: CampaignStore) =>
  store
    .listFacts()
    .filter((f) => f.key.startsWith("access/"))
    .map((f) => f.key);

async function referenceHead() {
  const s = await seededEpistemicCampaign(tempDir());
  await establishBroadcast(s, 1, B);
  const head = s.campaign.store.head();
  await s.campaign.close();
  return head;
}

describe("save → close → load → continue preserves the exact original event (acceptance: replay and recovery)", () => {
  it("the reopened event is byte-identical: exact mode, audience reference, payload, reach/channel, exceptions and sealed provenance", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    const written = await establishBroadcast(s, 1, B, {
      exceptions: ["SYNTHETIC FIXTURE: the sealed east gate was out of earshot"],
    });
    const fact = structuredClone(s.campaign.store.getFact(bKey)!);
    const head = s.campaign.store.head();
    await s.campaign.close();

    const r = await reopenEpistemic(dir);
    expect(r.campaign.store.getFact(bKey)).toEqual(fact);
    expect(r.access.broadcastExposure(B)!.value).toEqual(written);
    expect(r.access.broadcastExposure(B)!.fact.provenance.rule).toEqual(
      EPISTEMIC_ACCESS_BROADCAST_RULE,
    );
    const reopened = r.campaign.store.head();
    expect(reopened.state_sha256).toBe(head.state_sha256);
    expect(reopened.journal_head_sha256).toBe(head.journal_head_sha256);
    expect(r.campaign.verify()).toEqual([]);
    // no recipient expansion, no packet, no later roster: exactly the one event
    expect(accessKeys(r.campaign.store)).toEqual([bKey]);
    expect(r.access.event(B)).toBeUndefined();
    await r.campaign.close();
  });

  it("continues after a reload: a re-presented intent reconciles to the original receipt, a conflicting one is refused, and further work leaves the event untouched", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await establishBroadcast(s, 1, B);
    await s.campaign.close();

    const r = await reopenEpistemic(dir);
    const original = structuredClone(r.campaign.store.getFact(bKey)!);
    const settled = r.campaign.store.head();
    // the same intent, identical input: reconciled, nothing new is written
    expect(
      await codeOf(
        r.access.establishBroadcastExposure({ ...accessPublication(1), event: broadcastEvent(B) }),
      ),
    ).toBe("OK");
    expect(r.campaign.store.head()).toEqual(settled);
    // a conflicting event of the same identity, and a later live audience/roster, are refused
    expect(
      await codeOf(
        r.access.establishBroadcastExposure({
          ...accessPublication(2),
          event: broadcastEvent(B, {
            payload: {
              ...broadcastEvent(B).payload,
              content: "SYNTHETIC FIXTURE: a revised payload.",
            },
          }),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    expect(r.campaign.store.getFact(bKey)).toEqual(original);

    // independent work continues: another broadcast, and a recipient event with its packet formation
    await establishBroadcast(r, 3, "event-second");
    const bounded = await establishAccess(r, 4, EVENT_COUNCIL, ACTOR_SMITH);
    await registerPacketConsumer(r, "c1", bounded, null, 5);
    await must(r.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    expect(r.campaign.store.getFact(bKey)).toEqual(original);
    expect(r.access.packet(EVENT_COUNCIL, ACTOR_SMITH)).toBeDefined();
    expect(r.access.packet(B, ACTOR_SMITH)).toBeUndefined();
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();

    // and it loads again with everything intact
    const again = await reopenEpistemic(dir, "access-reopen-2");
    expect(again.campaign.store.getFact(bKey)).toEqual(original);
    expect(again.access.broadcastExposure("event-second")).toBeDefined();
    expect(again.campaign.verify()).toEqual([]);
    await again.campaign.close();
  });
});

describe("a crash and a lost reply at the one durable step of the event publication", () => {
  it("a crash before the commit writes nothing; the retry creates the one event and reaches the uninterrupted state", async () => {
    const reference = await referenceHead();
    const s = await seededEpistemicCampaign(tempDir());
    const crashing = new (s.access.constructor as any)(crashBefore(s.campaign.store, isEventGroup));
    const r = await crashing.establishBroadcastExposure({
      ...accessPublication(1),
      event: broadcastEvent(B),
    });
    expect(r.ok).toBe(false);
    expect(accessKeys(s.campaign.store)).toEqual([]);
    await establishBroadcast(s, 1, B);
    expect(accessKeys(s.campaign.store)).toEqual([bKey]);
    expect(s.campaign.store.head().state_sha256).toBe(reference.state_sha256);
    expect(s.campaign.store.head().journal_head_sha256).toBe(reference.journal_head_sha256);
    await s.campaign.close();
  });

  it("an UNKNOWN outcome after the commit is reconciled by identity: one event, no sibling, no second version, the same receipt", async () => {
    const reference = await referenceHead();
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    const lossy = new (s.access.constructor as any)(lostReply(s.campaign.store, isEventGroup));
    const lost = await lossy.establishBroadcastExposure({
      ...accessPublication(1),
      event: broadcastEvent(B),
    });
    expect(lost.ok).toBe(false);
    // the event exists; several retries (fresh adapters) reach the same receipt and never a sibling
    const receipt = s.campaign.store.lookupReceipt(accessPublication(1).intent_id)!;
    const fact = structuredClone(s.campaign.store.getFact(bKey)!);
    for (let i = 0; i < 3; i++)
      expect(
        await codeOf(
          s.access.establishBroadcastExposure({
            ...accessPublication(1),
            event: broadcastEvent(B),
          }),
        ),
      ).toBe("OK");
    expect(s.campaign.store.lookupReceipt(accessPublication(1).intent_id)).toEqual(receipt);
    expect(s.campaign.store.getFact(bKey)).toEqual(fact);
    expect(s.campaign.store.getFact(bKey)!.version).toBe(1);
    expect(accessKeys(s.campaign.store)).toEqual([bKey]);
    expect(s.campaign.store.head().state_sha256).toBe(reference.state_sha256);
    await s.campaign.close();
    const reopened = await reopenEpistemic(dir);
    expect(reopened.campaign.store.getFact(bKey)).toEqual(fact);
    await reopened.campaign.close();
  });
});

describe("load fails closed on a corrupted or inconsistent save", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir);
    await establishBroadcast(s, 1, B, { exceptions: ["SYNTHETIC FIXTURE: an exception"] });
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

  it("an edit of the saved event (mode, audience, source pin, reach, payload, exceptions, time, class, owner) is not silently normalized", async () => {
    const edits: Record<string, (fact: any) => void> = {
      "mode reclassified to bounded": (f) => (f.value.mode = "BOUNDED_SHARED_ACCESS"),
      "mode renamed": (f) => (f.value.mode = "BROADCAST"),
      "participant added": (f) => (f.value.participants = [ACTOR_SMITH]),
      "roster added to the audience": (f) => (f.value.audience.members = [ACTOR_SMITH]),
      "roster added to the event": (f) => (f.value.roster = [ACTOR_SMITH]),
      "audience repointed": (f) => (f.value.audience.fact_key = worldProfileKey(FIXTURE_WORLD_ID)),
      "audience owner altered": (f) => (f.value.audience.owner = "population"),
      "audience version altered": (f) => (f.value.audience.version = 5),
      "audience removed": (f) => delete f.value.audience,
      "source pin altered": (f) => (f.value.source.version = 5),
      "source owner altered": (f) => (f.value.source.owner = "named_actor"),
      "reach altered": (f) => (f.value.reach.conditions = "everywhere, always"),
      "reach removed": (f) => delete f.value.reach,
      payload: (f) => (f.value.payload.content = "a more convenient payload"),
      "exceptions erased": (f) => (f.value.exceptions = []),
      "basis time in the future": (f) =>
        (f.value.dissemination_basis = { unit: "u", value: 99999 }),
      "event class opened": (f) => (f.secrecy = "epistemic.actor-accessible"),
      "event owner changed": (f) => (f.owner = "world_state"),
      "event version changed": (f) => (f.version = 2),
      "event citation swapped for the recipient-event citation": (f) =>
        (f.provenance.rule = EPISTEMIC_ACCESS_RULE),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === bKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a packet or sealed provenance appended under the broadcast event, or a foreign audience fact edited, is not silently accepted", async () => {
    const additions: Record<string, (j: any) => void> = {
      "a packet planted": (j) =>
        j.facts.push({
          ...j.facts.find((f: any) => f.key === bKey),
          key: accessPacketKey(B, ACTOR_SMITH),
          secrecy: "epistemic.actor-accessible",
        }),
      "the audience locus edited": (j) =>
        (j.facts.find((f: any) => f.key === locusKey).value.designation = "a different place"),
      "the audience locus removed": (j) => {
        j.facts = j.facts.filter((f: any) => f.key !== locusKey);
      },
      "the carrier removed": (j) => {
        j.facts = j.facts.filter((f: any) => f.key !== sourceKey(SOURCE_SPEAKER));
      },
    };
    for (const [name, edit] of Object.entries(additions)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j);
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a journal edit of the event's committed group fails replay", async () => {
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

  /** A package built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(
    build: (s: CampaignStore, n: () => number) => Promise<void>,
  ): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...EPISTEMIC_FIXTURE_EXTENSION.owners]),
      }),
    );
    let n = 0;
    await build(s, () => ++n);
    await s.close();
    return dir;
  }
  // the lawful foreign facts, copied from a genuine seeded campaign and re-committed as ordinary groups
  const donor = (async () => {
    const d = await seededEpistemicCampaign(tempDir());
    const facts = new Map<string, OwnerFact>();
    for (const k of [worldProfileKey(FIXTURE_WORLD_ID), locusKey, TEMPORAL_STATE_KEY])
      facts.set(k, d.campaign.store.getFact(k)!);
    await d.campaign.close();
    return facts;
  })();
  const copy = (n: number, f: OwnerFact) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(f.key, f.value, {
          owner: f.owner,
          facet: f.facet,
          secrecy: f.secrecy,
          basis: f.basis,
          unit: f.unit,
        }),
      ],
      { owner: f.owner, facet: f.facet, rule: f.provenance.rule },
    );
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
        rule: EPISTEMIC_ACCESS_BROADCAST_RULE,
        ...groupOver,
      },
    );
  /** the canonical order: world, locus, clock, carrier — then whatever the variant adds */
  async function foundation(s: CampaignStore, n: () => number) {
    const facts = await donor;
    await must(s.commit(copy(n(), facts.get(worldProfileKey(FIXTURE_WORLD_ID))!)));
    await must(s.commit(copy(n(), facts.get(locusKey)!))); // group-2
    await must(s.commit(copy(n(), facts.get(TEMPORAL_STATE_KEY)!)));
    await must(s.commit(sourceGroup(FIXTURE_CAMPAIGN, 4, SOURCE_SPEAKER))); // access-source-group-4
  }
  const carrierGroupFor = () => `access-source-group-4`;
  const lawfulPins = () => ({
    reads: [
      { key: sourceKey(SOURCE_SPEAKER), version: 1 },
      { key: locusKey, version: 1 },
    ],
    depends_on: [carrierGroupFor(), "group-2"],
  });

  it("control: a history built around admission but lawful in every respect opens", async () => {
    const dir = await rogue(async (s, n) => {
      await foundation(s, n);
      await must(s.commit(put(10, bKey, broadcastEvent(B), {}, lawfulPins())));
    });
    expect(await openOutcome(dir)).toBe("OK");
  });

  it("a source or an audience committed AFTER the event that rests on it is detected on load: no post-basis evidence establishes an earlier event", async () => {
    // the carrier is committed after the event (the event read it at version 0, a state that no longer holds)
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          const facts = await donor;
          await must(s.commit(copy(n(), facts.get(worldProfileKey(FIXTURE_WORLD_ID))!)));
          await must(s.commit(copy(n(), facts.get(locusKey)!)));
          await must(s.commit(copy(n(), facts.get(TEMPORAL_STATE_KEY)!)));
          await must(
            s.commit(
              put(
                10,
                bKey,
                broadcastEvent(B),
                {},
                {
                  reads: [
                    { key: sourceKey(SOURCE_SPEAKER), version: 0 },
                    { key: locusKey, version: 1 },
                  ],
                  depends_on: ["group-2"],
                },
              ),
            ),
          );
          await must(s.commit(sourceGroup(FIXTURE_CAMPAIGN, 11, SOURCE_SPEAKER)));
        }),
      ),
    ).toMatch(/EPISTEMIC_ACCESS_STATE/);
    // the audience authority is committed after the event
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          const facts = await donor;
          await must(s.commit(copy(n(), facts.get(worldProfileKey(FIXTURE_WORLD_ID))!)));
          await must(s.commit(copy(n(), facts.get(TEMPORAL_STATE_KEY)!)));
          await must(s.commit(sourceGroup(FIXTURE_CAMPAIGN, 4, SOURCE_SPEAKER)));
          await must(
            s.commit(
              put(
                10,
                bKey,
                broadcastEvent(B),
                {},
                {
                  reads: [
                    { key: sourceKey(SOURCE_SPEAKER), version: 1 },
                    { key: locusKey, version: 0 },
                  ],
                  depends_on: [carrierGroupFor()],
                },
              ),
            ),
          );
          await must(s.commit(copy(11, facts.get(locusKey)!)));
        }),
      ),
    ).toMatch(/EPISTEMIC_ACCESS_STATE/);
  });

  it("a forged or unsupported audience authority, a wrong-owner reference and a source that is not foreign are each detected on load", async () => {
    const bad: Record<string, Parameters<typeof broadcastEvent>[1]> = {
      "audience is the world profile": {
        audience: { owner: "world_state", fact_key: worldProfileKey(FIXTURE_WORLD_ID), version: 1 },
      },
      "audience names the wrong owner": {
        audience: { owner: "population", fact_key: locusKey, version: 1 },
      },
      "audience is not a committed fact": {
        audience: {
          owner: "world_state",
          fact_key: worldLocusKey(FIXTURE_WORLD_ID, "locus-absent"),
          version: 1,
        },
      },
      "audience pinned ahead of anything committed": {
        audience: { owner: "world_state", fact_key: locusKey, version: 3 },
      },
      "source names the wrong owner": {
        source: { owner: "world_state", fact_key: sourceKey(SOURCE_SPEAKER), version: 1 },
      },
      "source is the Epistemic owner's own state": {
        source: { owner: "epistemic_access", fact_key: sourceKey(SOURCE_SPEAKER), version: 1 },
      },
      "source is also the audience authority": {
        source: { owner: "world_state", fact_key: locusKey, version: 1 },
      },
      "dissemination in the future of the canonical basis": {
        dissemination_basis: { ...T0, value: T0.value + 5000 },
      },
    };
    for (const [name, patch] of Object.entries(bad)) {
      const dir = await rogue(async (s, n) => {
        await foundation(s, n);
        await must(s.commit(put(10, bKey, broadcastEvent(B, patch), {}, lawfulPins())));
      });
      expect(await openOutcome(dir), name).toMatch(/EPISTEMIC_ACCESS_STATE/);
    }
  });

  it("a committed group that did not read exactly its two pins, or that rests on a recipient-event citation, is detected on load", async () => {
    const dir = await rogue(async (s, n) => {
      await foundation(s, n);
      await must(
        s.commit(
          put(
            10,
            bKey,
            broadcastEvent(B),
            {},
            {
              reads: [{ key: sourceKey(SOURCE_SPEAKER), version: 1 }],
              depends_on: [carrierGroupFor()],
            },
          ),
        ),
      );
    });
    expect(await openOutcome(dir)).toMatch(/EPISTEMIC_ACCESS_STATE/);
    // the recipient-event citation is the kind's other lawful citation, and is still not the citation of this mode
    const cited = await rogue(async (s, n) => {
      await foundation(s, n);
      await must(
        s.commit(
          put(10, bKey, broadcastEvent(B), {}, { ...lawfulPins(), rule: EPISTEMIC_ACCESS_RULE }),
        ),
      );
    });
    expect(await openOutcome(cited)).toMatch(/EPISTEMIC_ACCESS_STATE/);
    // a drifted citation is rule drift
    const drifted = await rogue(async (s, n) => {
      await foundation(s, n);
      await must(
        s.commit(
          put(
            10,
            bKey,
            broadcastEvent(B),
            {},
            {
              ...lawfulPins(),
              rule: { ...EPISTEMIC_ACCESS_BROADCAST_RULE, clause: "drifted" },
            },
          ),
        ),
      );
    });
    expect(await openOutcome(drifted)).toMatch(/RULE_DRIFT/);
  });

  it("an event class opened to actors and a packet written for the broadcast are each detected on load", async () => {
    expect(
      await openOutcome(
        await rogue(async (s, n) => {
          await foundation(s, n);
          await must(
            s.commit(
              put(
                10,
                bKey,
                broadcastEvent(B),
                { secrecy: "epistemic.actor-accessible" },
                lawfulPins(),
              ),
            ),
          );
        }),
      ),
    ).toMatch(/EPISTEMIC_ACCESS_STATE/);
    const planted = await rogue(async (s, n) => {
      await foundation(s, n);
      await must(s.commit(put(10, bKey, broadcastEvent(B), {}, lawfulPins())));
      await must(
        s.commit(
          put(
            11,
            accessPacketKey(B, ACTOR_SMITH),
            {
              recipient: ACTOR_SMITH,
              payload: { referent: "r", content: "c" },
              presented_attribution: null,
              access: { result: "RECEIVED", channel: "SPEECH", established_at: T0 },
              intelligibility: {
                result: "REPRESENTATION_ACCESSIBLE",
                basis: "NO_CAPABILITY_DEPENDENCY",
              },
            },
            { secrecy: "epistemic.actor-accessible" },
            { rule: EPISTEMIC_ACCESS_RULE },
          ),
        ),
      );
    });
    expect(await openOutcome(planted)).toMatch(/EPISTEMIC_ACCESS_STATE/);
  });

  it("the live diagnostic verifier agrees with load: a lawful campaign reports no violation", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await establishBroadcast(s, 1, B);
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });
});
