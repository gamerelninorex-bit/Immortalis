/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw persisted records and raw scripted-host documents */
// BLUE v5.2-A1 — SOURCE-QUALIFIED original-PC observation: the production command, end to end, over a REAL, owner-written World-State
// Source Condition, with a SCRIPTED referee host.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. The Source Condition in every campaign here is genuinely upstream: the shipped `establish-locality`
// path has the World-State owner commit it (we read it back and check its owner, facet, version and committing group) before any character
// exists. The scripted host is a policy the TEST wrote that reads the DELIVERED words by regular expression (PLUMBING ONLY). So these tests
// prove the ENGINE's mechanism: that a source-scoped question, a receipt that pins that source, a packet and a read follow causally and in
// order from a retained, engine-derived reading and from nothing else; that the host is never given, and the player never receives, what the
// source's owner withholds; that a source that is hidden, unsupported, undescribed, absent, elsewhere or unsettled earns no packet; and that
// one character has one observation per canonical instant. They prove NOTHING about whether any AI reads any sentence correctly: that is
// genuine AI-host semantic evidence (level 2) and level 3 (normal chat acceptance) is not claimed either. The positive and the negative
// differ by ONE physical sentence of the source's own access fact; the fixtures state no verdict, receipt, packet or Glance outcome.
import { describe, expect, it } from "vitest";
import {
  AccessEventSchema,
  AccessiblePacketSchema,
  OBSERVATION_BASE_REFS,
  REFEREE_AUTHORITY,
  RefereeDecisionRecordSchema,
  SealedEngineProvenanceSchema,
  WorldSourceConditionSchema,
  worldSourceConditionKey,
} from "@immortalis/contracts";
import {
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
  RefereeAdjudicationAdapter,
  canonicalEqual,
  formObservedPacket,
  verifyEpistemicIntegrity,
  type CanonicalCampaign,
} from "@immortalis/engine";
import {
  bindTrustedCausalEventSignalContext,
  bindTrustedCurrentPlayerContext,
  deliverCausalEventSignalPresentation,
  readCurrentObservationGlance,
} from "@immortalis/protocol";
import { publication } from "@immortalis/testkit";
import { LOCUS_ID, WORLD_ID, openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { PC_WORDS, observe, observationCampaign, verbConsole } from "../support/observation.ts";
import { CAUSAL_REQUEST, GLANCE_REQUEST, PROTOCOL_REFUSAL } from "../support/protocol.ts";
import { plainPolicy, type Policy } from "../support/original-pc.ts";
import {
  BASIS,
  BURIED,
  EXPOSED,
  NEUTRAL_CONTENT,
  NEUTRAL_REFERENT,
  PC_ID,
  SECRET,
  SILENT,
  SOURCE_KEY,
  observeSource,
  sourceAnswer,
  sourceCampaign,
  sourceScene,
} from "../support/source-observation.ts";

/** Hex identities (task, nonce, group) can contain any short digit string by chance; a withheld number is searched for outside them. */
const bare = (text: string): string => text.replace(/[0-9a-f]{16,}/g, "");

const reading = async <T>(dirs: LocalityDirs, fn: (c: CanonicalCampaign) => Promise<T> | T) => {
  const c = await openOrdinary(dirs.campaignDir);
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
};
const observationRecords = (c: CanonicalCampaign) =>
  c.store.listFacts().flatMap((f) => {
    const r = RefereeDecisionRecordSchema.safeParse(f.value);
    return r.success && r.data.operation === "F014D_DIRECT_PERCEPTION" ? [r.data] : [];
  });
const accessKeys = (c: CanonicalCampaign) =>
  c.store
    .listFacts()
    .map((f) => f.key)
    .filter((k) => k.startsWith("access/"));
const head = (c: CanonicalCampaign) => {
  const h = c.store.head();
  return { revision: h.revision, state: h.state_sha256, journal: h.journal_head_sha256 };
};
const glance = (c: CanonicalCampaign, recipient = PC_ID) =>
  JSON.stringify(
    readCurrentObservationGlance(
      bindTrustedCurrentPlayerContext({ view: c.store, recipient_id: recipient }),
      GLANCE_REQUEST(),
    ),
  );
const eventIdOf = (c: CanonicalCampaign): string =>
  c.store
    .listFacts()
    .find((f) => /^access\/[^/]+\/event$/.test(f.key))!
    .key.split("/")[1]!;

/** A policy that answers like `sourceAnswer` but keeps every document it was handed, so what the host received can be inspected. */
const recording = (docs: unknown[], rule = {}): Policy => {
  return (doc) => {
    if (doc["operation"] !== "F014D_DIRECT_PERCEPTION") return plainPolicy(doc);
    docs.push(structuredClone(doc));
    return sourceAnswer(doc, rule);
  };
};

const received = async (
  o: Parameters<typeof sourceCampaign>[0] = {},
  rule: Parameters<typeof observeSource>[2] = {},
) => {
  const { dirs } = await sourceCampaign(o);
  const r = await observeSource(dirs, undefined, rule);
  return { dirs, ...r };
};

describe("the positive: a world-owned source at the PC's own locus is observed through the referee, the Epistemic owner, the packet and the glance", () => {
  it("the Source Condition is genuinely upstream: committed by World-State before any character, at version 1, never by the observation", async () => {
    const { dirs } = await sourceCampaign();
    await reading(dirs, (c) => {
      const fact = c.store.getFact(worldSourceConditionKey(WORLD_ID, SOURCE_KEY))!;
      expect(fact.owner).toBe("world_state");
      expect(fact.facet).toBe("world_source_condition");
      expect(fact.version).toBe(1);
      expect(fact.provenance.group_id).toMatch(/^operator-locality:[0-9a-f]{32}:source$/);
      const s = WorldSourceConditionSchema.parse(fact.value);
      expect(s.locality.locus.entity_id).toBe(LOCUS_ID);
      expect(s.access_facts).toEqual([{ aspect: "exposure", statement: EXPOSED }]);
      expect(s.recoverable).toEqual({ amount: SECRET.amount, unit: SECRET.unit });
      // nothing of perception exists yet
      expect(accessKeys(c)).toEqual([]);
      expect(observationRecords(c)).toEqual([]);
    });
  });

  it("forms the event that pins the Source Condition and the packet it triggers; canonical time does not move; the player is shown only the raw appearance", async () => {
    const { dirs } = await sourceCampaign();
    const docs: any[] = [];
    const before = await reading(dirs, (c) => c.store.listFacts().map((f) => f.key));
    const { result, terminal } = await observe(
      dirs,
      undefined,
      { sourceKey: SOURCE_KEY },
      recording(docs),
    );
    expect(result.status, JSON.stringify(result.details)).toBe("OBSERVATION_RECEIVED");
    expect(result.details.join("\n")).toContain(`referent: ${NEUTRAL_REFERENT}`);
    expect(result.details.join("\n")).toContain(`content: ${NEUTRAL_CONTENT}`);

    await reading(dirs, (c) => {
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      const added = c.store
        .listFacts()
        .map((f) => f.key)
        .filter((k) => !before.includes(k))
        .map((k) => k.replace(/[0-9a-f]{32,64}/g, "<id>"));
      // exactly the owners' own records: the decision, the event, the transaction (+ authority), the packet and the sealed provenance
      expect(added.sort()).toEqual(
        [
          "access/obs-<id>/event",
          `access/obs-<id>/packet/${PC_ID}`,
          `access/obs-<id>/provenance/${PC_ID}`,
          "referee/<id>/decision",
          "temporal/transaction-authority/observation-tx-obs-<id>",
          "temporal/transaction/observation-tx-obs-<id>",
        ].sort(),
      );
      // the source itself was never touched by being looked at
      expect(c.store.getFact(worldSourceConditionKey(WORLD_ID, SOURCE_KEY))!.version).toBe(1);

      const f = (re: RegExp) => c.store.listFacts().filter((x) => re.test(x.key));
      const eventFact = f(/^access\/[^/]+\/event$/)[0]!;
      const packetFact = f(/^access\/[^/]+\/packet\//)[0]!;
      const provFact = f(/^access\/[^/]+\/provenance\//)[0]!;
      const event = AccessEventSchema.parse(eventFact.value);
      const packet = AccessiblePacketSchema.parse(packetFact.value);
      const prov = SealedEngineProvenanceSchema.parse(provFact.value);
      expect(canonicalEqual(eventFact.provenance.rule, EPISTEMIC_ACCESS_OBSERVATION_RULE)).toBe(
        true,
      );
      expect(event.participants).toEqual([PC_ID]);
      expect(event.channel).toBe("PERCEPTION");
      expect(event.established_at).toEqual(BASIS);
      // the receipt pins the ONE Source Condition, at the version the reading cited, owned by World-State
      expect(event.source).toEqual({
        owner: "world_state",
        fact_key: worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
        version: 1,
      });
      expect(prov.source).toEqual(event.source);
      // the group reads the decision first and then every premise it cites, the source last
      const group = c.store.committedGroup(eventFact.provenance.intent_id)!;
      expect(group.reads.map((r) => r.key.replace(/[0-9a-f]{64}/, "<task>"))).toEqual([
        "referee/<task>/decision",
        `pc/${PC_ID}/existence-contract`,
        "role-registry/binding/role.player_character",
        `world-state/pc/${PC_ID}/locus-custody`,
        `world/${WORLD_ID}/profile`,
        `world/${WORLD_ID}/locus/${LOCUS_ID}`,
        worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
      ]);
      // the packet holds the raw appearance and nothing of the source
      expect(packetFact.secrecy).toBe("epistemic.actor-accessible");
      expect(packet.payload).toEqual({ referent: NEUTRAL_REFERENT, content: NEUTRAL_CONTENT });
      const text = bare(JSON.stringify(packetFact.value));
      for (const hidden of [
        SOURCE_KEY,
        SECRET.material,
        SECRET.dimension,
        String(SECRET.amount),
        SECRET.unit,
        "source",
        WORLD_ID,
        LOCUS_ID,
      ])
        expect(text, hidden).not.toContain(hidden);

      // the retained reading: scoped to the source, an established verdict derived by the engine, its appearance OF that source
      const [record] = observationRecords(c);
      expect(record!.verdict).toBe("OBSERVATION_ESTABLISHED");
      expect(record!.input.refs).toHaveLength(OBSERVATION_BASE_REFS + 1);
      expect(record!.input.refs[OBSERVATION_BASE_REFS]).toEqual({
        fact_key: worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
        version: 1,
        group_id: c.store.getFact(worldSourceConditionKey(WORLD_ID, SOURCE_KEY))!.provenance
          .group_id,
      });
      expect(record!.decision.payload!.source_fact_id).toBe("source.access.1");
      expect(record!.validated_under.role).toBe("role.resolver");
      // canonical time is exactly where it was
      expect((c.store.getFact("temporal/state")!.value as any).canonical_time).toEqual(BASIS);
    });

    // the host was asked ONE scoped question, and was never given what the source's owner withholds
    expect(docs.length).toBeGreaterThanOrEqual(1);
    const doc = bare(JSON.stringify(docs[0]));
    for (const hidden of [
      SOURCE_KEY,
      SECRET.material,
      SECRET.dimension,
      SECRET.statement,
      String(SECRET.amount),
      "recoverable",
      "exhaustion",
      "EXACT_FINITE",
      "INITIAL_SETTING_FACT",
    ])
      expect(doc, hidden).not.toContain(hidden);
    expect(docs[0].context.facts.filter((x: any) => x.from === "source")).toEqual([
      {
        fact_id: "source.access.1",
        from: "source",
        label: "source access fact (exposure)",
        text: `exposure: ${EXPOSED}`,
      },
    ]);
    expect(docs[0].context.refs).toHaveLength(OBSERVATION_BASE_REFS + 1);
    expect(docs[0].purpose).toContain("scoped to ONE physical feature");
    // the console said what was chosen and never what the source holds
    const said = terminal.said.join("\n");
    expect(said).toContain(`candidate source named by you: ${SOURCE_KEY}`);
    for (const hidden of [SECRET.material, String(SECRET.amount), SECRET.statement])
      expect(said, hidden).not.toContain(hidden);
  });

  it("the guarded glance reads exactly the earned arrival, equal byte for byte to the causal delivery, and discloses neither the source nor its values", async () => {
    const { dirs } = await received();
    await reading(dirs, (c) => {
      const out = glance(c);
      const parsed = JSON.parse(out);
      expect(parsed.ok, out).toBe(true);
      expect(parsed.value.elements).toEqual([
        { element: "CONTACT", channel: "PERCEPTION" },
        { element: "REFERENT", text: NEUTRAL_REFERENT },
        { element: "CONTENT", text: NEUTRAL_CONTENT },
      ]);
      const viaCausal = deliverCausalEventSignalPresentation(
        bindTrustedCausalEventSignalContext({
          view: c.store,
          recipient_id: PC_ID,
          event_id: eventIdOf(c),
        }),
        CAUSAL_REQUEST(),
      );
      expect(out).toBe(JSON.stringify(viaCausal));
      expect(out).not.toMatch(
        /obs-|access\/|world\/|referee|source|locus_|decision|BOUNDED_SHARED|provenance|sealed/i,
      );
      for (const hidden of [SOURCE_KEY, SECRET.material, String(SECRET.amount), SECRET.unit])
        expect(bare(out), hidden).not.toContain(hidden);
      // a wrong client is the one opaque refusal
      expect(glance(c, "someone-else")).toBe(PROTOCOL_REFUSAL);
    });
  });

  it("replay and reopen: the same choice at the same basis converges on the same records and writes nothing; a fresh open verifies clean", async () => {
    const { dirs } = await received();
    const first = await reading(dirs, (c) => ({ head: head(c), out: glance(c) }));
    const again = await observeSource(dirs);
    expect(again.result.status, JSON.stringify(again.result.details)).toBe("OBSERVATION_RECEIVED");
    // nothing was asked of the host or the console a second time
    expect(again.host?.answered).toEqual([]);
    const second = await reading(dirs, (c) => {
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      expect(observationRecords(c)).toHaveLength(1);
      return { head: head(c), out: glance(c) };
    });
    expect(second).toEqual(first);
  });

  it("the operator names a candidate, not the outcome: a second, different source at the same locus is observed as itself and pins itself", async () => {
    const { dirs } = await sourceCampaign();
    const other = "src-second-pan";
    await reading(dirs, async (c) => {
      const out = await c.establishSourceCondition({
        ...publication(901),
        source: {
          source_key: other,
          world_id: WORLD_ID,
          locus_id: LOCUS_ID,
          dimension: "second-crust",
          material_class: "second-material",
          quantity: { amount: 7, unit: "bucket" },
          access_facts: [{ aspect: "exposure", statement: EXPOSED }],
          statement: "A second, smaller deposit holds exactly 7 buckets of a second material.",
        },
      });
      expect(out.ok, JSON.stringify(out)).toBe(true);
    });
    const r = await observeSource(dirs, undefined, {}, { sourceKey: other });
    expect(r.result.status, JSON.stringify(r.result.details)).toBe("OBSERVATION_RECEIVED");
    await reading(dirs, (c) => {
      const event = AccessEventSchema.parse(
        c.store.listFacts().find((f) => /^access\/[^/]+\/event$/.test(f.key))!.value,
      );
      expect(event.source.fact_key).toBe(worldSourceConditionKey(WORLD_ID, other));
      const [rec] = observationRecords(c);
      expect(rec!.input.refs.at(-1)!.fact_key).toBe(worldSourceConditionKey(WORLD_ID, other));
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
  });
});

describe("the independent negatives: the same character, light, geometry, source values and basis; ONE sentence of the source's own access fact differs", () => {
  const same = async (access: string | null, words?: Parameters<typeof sourceCampaign>[0]) =>
    sourceCampaign({
      ...(words ?? {}),
      access: access === null ? [] : [{ aspect: "exposure", statement: access }],
    });
  const nothingEarned = async (dirs: LocalityDirs, verdict: string | null) =>
    reading(dirs, (c) => {
      expect(accessKeys(c)).toEqual([]);
      expect(c.verify()).toEqual([]);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
      // the reading is retained as sealed audit evidence, whatever it derived, and is no receipt
      const recs = observationRecords(c);
      if (verdict === null) expect(recs).toEqual([]);
      else expect(recs.map((r) => r.verdict)).toEqual([verdict]);
      // the glance is the one refusal and equals the refusal of a campaign nothing was ever observed in
      expect(glance(c)).toBe(PROTOCOL_REFUSAL);
    });

  it("a source its owner states is covered by an opaque slab: the engine derives OBSTRUCTED from the quoted covering fact, and nothing is earned", async () => {
    const { dirs } = await same(BURIED);
    const r = await observeSource(dirs);
    expect(r.result.status, JSON.stringify(r.result.details)).toBe("OBSERVATION_NOT_ESTABLISHED");
    expect(r.result.details.join("\n")).not.toMatch(/slab|stone|cover|obstruct|block/i);
    await nothingEarned(dirs, "OBSERVATION_OBSTRUCTED");
    // the only difference from the positive's upstream fact is that one sentence
    const positive = await same(EXPOSED);
    const pick = (d: LocalityDirs) =>
      reading(d, (c) =>
        WorldSourceConditionSchema.parse(
          c.store.getFact(worldSourceConditionKey(WORLD_ID, SOURCE_KEY))!.value,
        ),
      );
    const a = await pick(dirs);
    const b = await pick(positive.dirs);
    expect({ ...a, access_facts: null }).toEqual({ ...b, access_facts: null });
    expect(a.access_facts[0]!.statement).toBe(BURIED);
    expect(b.access_facts[0]!.statement).toBe(EXPOSED);
  });

  it("a source whose owner states nothing about whether it can be seen is UNRESOLVED, never an obstruction, and earns nothing", async () => {
    const { dirs } = await same(SILENT);
    const r = await observeSource(dirs);
    expect(r.result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    await nothingEarned(dirs, "OBSERVATION_UNRESOLVED");
  });

  it("a character whose own statements establish no sight, or whose placement states no facing or open eyes, earns nothing from an exposed source", async () => {
    for (const words of [
      { embodiment: PC_WORDS.embodimentBare },
      { presence: PC_WORDS.presenceBare },
    ]) {
      const { dirs } = await same(EXPOSED, { words });
      const r = await observeSource(dirs);
      expect(r.result.status, JSON.stringify(words)).toBe("OBSERVATION_NOT_ESTABLISHED");
      await nothingEarned(dirs, "OBSERVATION_UNRESOLVED");
    }
  });

  it("a host that cannot settle the path, and one that contradicts a committed fact, earn nothing", async () => {
    const unsettled = await same(EXPOSED);
    expect(
      (await observeSource(unsettled.dirs, undefined, { pathUnknown: true })).result.status,
    ).toBe("OBSERVATION_NOT_ESTABLISHED");
    await nothingEarned(unsettled.dirs, "OBSERVATION_UNRESOLVED");
    const conflict = await same(EXPOSED);
    expect(
      (await observeSource(conflict.dirs, undefined, { contradicts: /lies bare/ })).result.status,
    ).toBe("OBSERVATION_NOT_ESTABLISHED");
    await nothingEarned(conflict.dirs, "OBSERVATION_WORLD_CONFLICT");
  });

  it("the very sentence that denies sight is the only thing that changed: a scene that exposes the source earns, one that covers it does not", async () => {
    const lit = await received();
    const covered = await same(BURIED);
    expect((await observeSource(covered.dirs)).result.status).toBe("OBSERVATION_NOT_ESTABLISHED");
    await reading(lit.dirs, (c) => expect(JSON.parse(glance(c)).ok).toBe(true));
    await reading(covered.dirs, (c) => expect(glance(c)).toBe(PROTOCOL_REFUSAL));
  });
});

describe("fail closed: an absent, malformed, undescribed or mis-scoped source is refused before the host is asked, with one message, writing nothing", () => {
  const refused = async (
    dirs: LocalityDirs,
    sourceKey: string,
    status = "OBSERVATION_NOT_AVAILABLE",
  ) => {
    const docs: any[] = [];
    const before = await reading(dirs, (c) => head(c));
    const r = await observe(dirs, undefined, { sourceKey }, recording(docs));
    expect(r.result.status, `${sourceKey}: ${JSON.stringify(r.result.details)}`).toBe(status);
    expect(docs, "the host is never asked").toEqual([]);
    expect(r.terminal.asked(), "nothing is asked of the console").toBe(0);
    await reading(dirs, (c) => {
      expect(head(c)).toEqual(before);
      expect(observationRecords(c)).toEqual([]);
      expect(accessKeys(c)).toEqual([]);
    });
    return r.result;
  };

  it("an absent source key, a malformed key and a key of a fact that is not a Source Condition are refused", async () => {
    const { dirs } = await sourceCampaign();
    const absent = await refused(dirs, "src-does-not-exist");
    // no detail distinguishes an absent source from any other unavailable one
    for (const key of ["src-also-absent", "pc-maren", "profile", LOCUS_ID])
      expect(JSON.stringify(await refused(dirs, key))).toBe(JSON.stringify(absent));
    await refused(dirs, "not a valid/key", "INVALID_REQUEST");
    await refused(dirs, "", "INVALID_REQUEST");
  });

  it("a source that states no access fact has nothing descriptive to be seen by: refused, identically", async () => {
    const { dirs } = await sourceCampaign({ access: [] });
    const { dirs: other } = await sourceCampaign();
    const unavailable = await refused(other, "src-does-not-exist");
    expect(JSON.stringify(await refused(dirs, SOURCE_KEY))).toBe(JSON.stringify(unavailable));
  });

  it("a source at another locus of the world is refused: the source must be local to the character's own custody", async () => {
    const { dirs } = await sourceCampaign();
    await reading(dirs, async (c) => {
      const locus = await c.establishLocus({
        ...publication(902),
        locus: {
          locus_id: "locus-elsewhere",
          world: { fact_key: `world/${WORLD_ID}/profile`, entity_id: WORLD_ID },
          designation: "Another place in the same world",
          constraints: [],
        },
      });
      expect(locus.ok, JSON.stringify(locus)).toBe(true);
      const src = await c.establishSourceCondition({
        ...publication(903),
        source: {
          source_key: "src-elsewhere",
          world_id: WORLD_ID,
          locus_id: "locus-elsewhere",
          dimension: "elsewhere-crust",
          material_class: "elsewhere-material",
          quantity: { amount: 9, unit: "bucket" },
          access_facts: [{ aspect: "exposure", statement: EXPOSED }],
          statement: "A deposit elsewhere.",
        },
      });
      expect(src.ok, JSON.stringify(src)).toBe(true);
    });
    const unavailable = await refused(dirs, "src-does-not-exist");
    expect(JSON.stringify(await refused(dirs, "src-elsewhere"))).toBe(JSON.stringify(unavailable));
  });

  it("an engine-direct question for a source the character's locus does not hold is refused by the adapter itself, not only by the command", async () => {
    const { dirs } = await sourceCampaign();
    await reading(dirs, (c) => {
      const adapter = new RefereeAdjudicationAdapter(c.store);
      const ok = adapter.observationTask({ pc_id: PC_ID, attempt: 0, source_key: SOURCE_KEY });
      expect(ok.ok).toBe(true);
      for (const key of ["src-nope", "", "a/b", SOURCE_KEY.toUpperCase()]) {
        const r = adapter.observationTask({ pc_id: PC_ID, attempt: 0, source_key: key });
        expect(r.ok, key).toBe(false);
        if (!r.ok) expect(r.error.message).toBe("no source is available to this observation");
      }
    });
  });
});

describe("what the source's owner withholds never reaches the player: forged or leaking answers are refused by the engine, whatever the host says", () => {
  const leaks: readonly [string, Record<string, string>][] = [
    ["the source key", { referent: `the ${SOURCE_KEY} heap` }],
    ["the material class", { content: "a heap of raw salt lying bare" }],
    ["the exact quantity", { content: `about ${SECRET.amount} pale lumps lie bare` }],
    ["the engine fact reference", { content: "see source.access.1 for the heap" }],
  ];
  for (const [what, over] of leaks)
    it(`an appearance carrying ${what} is refused: no decision, event, packet or provenance exists`, async () => {
      const { dirs } = await sourceCampaign();
      const r = await observeSource(dirs, undefined, over);
      expect(r.result.status, JSON.stringify(r.result.details)).toBe("REFEREE_ANSWER_REFUSED");
      await reading(dirs, (c) => {
        expect(observationRecords(c)).toEqual([]);
        expect(accessKeys(c)).toEqual([]);
        expect(c.verify()).toEqual([]);
      });
    });

  it("an appearance stated to be of a neighbouring fact, not of the source the choice is about, is refused", async () => {
    const { dirs } = await sourceCampaign();
    const r = await observeSource(dirs, undefined, { ofFact: "locus.designation" });
    expect(r.result.status).toBe("REFEREE_ANSWER_REFUSED");
    await reading(dirs, (c) => {
      expect(observationRecords(c)).toEqual([]);
      expect(accessKeys(c)).toEqual([]);
    });
  });

  it("an ordinary (unscoped) observation in the same campaign is unchanged: it earns the world or locus appearance and pins no source", async () => {
    const { dirs } = await observationCampaign({
      scene: sourceScene(undefined, (doc) => {
        doc.locus.constraints.push({
          aspect: "surface",
          statement:
            "The north wall is whitewashed plaster with one broad patch of bright red paint, about an arm-span wide, at the height of a seated person's eyes.",
        });
      }),
    });
    const r = await observe(dirs, verbConsole("observe-surroundings"), {}, (doc) =>
      doc["operation"] === "F014D_DIRECT_PERCEPTION"
        ? sourceAnswer(doc, {
            ofFact: "locus.constraint.5",
            referent: "a patch on the wall facing the character",
            content: "a broad patch of bright red on pale plaster",
          })
        : plainPolicy(doc),
    );
    // the ordinary question has no `source.` facts at all
    expect(r.result.status, JSON.stringify(r.result.details)).toBe("OBSERVATION_RECEIVED");
    await reading(dirs, (c) => {
      const [rec] = observationRecords(c);
      expect(rec!.input.refs).toHaveLength(OBSERVATION_BASE_REFS);
      expect(rec!.decision.payload!.source_fact_id).toBe("locus.constraint.5");
      const event = AccessEventSchema.parse(
        c.store.listFacts().find((f) => /^access\/[^/]+\/event$/.test(f.key))!.value,
      );
      expect(event.source.fact_key).toBe(`world/${WORLD_ID}/locus/${LOCUS_ID}`);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
  });
});

describe("one observation per character per canonical instant: a different scope never replaces or is shown as an earned one", () => {
  it("a source-scoped observation holds the basis: an ordinary look and a look at another source are refused, change nothing, and the earned one still reads", async () => {
    const { dirs } = await received();
    const first = await reading(dirs, (c) => ({ head: head(c), out: glance(c) }));
    const ordinary = await observe(dirs, undefined, {}, (doc) =>
      doc["operation"] === "F014D_DIRECT_PERCEPTION" ? sourceAnswer(doc, {}) : plainPolicy(doc),
    );
    expect(ordinary.result.status, JSON.stringify(ordinary.result.details)).toBe(
      "OBSERVATION_NOT_AVAILABLE",
    );
    expect(ordinary.result.details.join("\n")).toContain("another scope already holds");
    expect(ordinary.terminal.asked()).toBe(0);
    const other = await observeSource(dirs, undefined, {}, { sourceKey: "src-second-pan" });
    expect(other.result.status).toBe("OBSERVATION_NOT_AVAILABLE");
    const after = await reading(dirs, (c) => ({ head: head(c), out: glance(c) }));
    expect(after).toEqual(first);
  });

  it("an ordinary observation holds the basis too: a source-scoped look at the same instant is refused, writes nothing, and the earned one still reads", async () => {
    const { dirs } = await observationCampaign({
      scene: sourceScene(undefined, (doc) => {
        doc.locus.constraints.push({
          aspect: "surface",
          statement:
            "The north wall is whitewashed plaster with one broad patch of bright red paint, about an arm-span wide, at the height of a seated person's eyes.",
        });
      }),
    });
    const ordinary = await observe(dirs, verbConsole("observe-surroundings"), {}, (doc) =>
      doc["operation"] === "F014D_DIRECT_PERCEPTION"
        ? sourceAnswer(doc, {
            ofFact: "locus.constraint.5",
            referent: "a patch on the wall facing the character",
            content: "a broad patch of bright red on pale plaster",
          })
        : plainPolicy(doc),
    );
    expect(ordinary.result.status).toBe("OBSERVATION_RECEIVED");
    const first = await reading(dirs, (c) => ({ head: head(c), out: glance(c) }));
    const scoped = await observeSource(dirs);
    expect(scoped.result.status, JSON.stringify(scoped.result.details)).toBe(
      "OBSERVATION_NOT_AVAILABLE",
    );
    const after = await reading(dirs, (c) => ({ head: head(c), out: glance(c) }));
    expect(after).toEqual(first);
  });

  it("at the engine: a second, different retained reading of the same instant never earns a second event or replaces the first", async () => {
    const { dirs } = await received();
    await reading(dirs, async (c) => {
      const adapter = new RefereeAdjudicationAdapter(c.store);
      // a different reading of the same instant — scoped differently (no source) — retained create-only under its own task identity
      const task = adapter.observationTask({ pc_id: PC_ID, attempt: 7 });
      expect(task.ok).toBe(true);
      if (!task.ok) return;
      const answer = sourceAnswer(
        { task_id: task.value.task_id, context: task.value.context },
        { ofFact: "locus.designation" },
      );
      const recorded = await adapter.recordObservation({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: "engine-direct-test", claimed_model: null },
        pc_id: PC_ID,
        attempt: 7,
        answer,
      });
      expect(recorded.ok, JSON.stringify(recorded)).toBe(true);
      if (!recorded.ok) return;
      expect(recorded.value.verdict).toBe("OBSERVATION_ESTABLISHED");
      const first = glance(c);
      const before = head(c);
      const formed = await formObservedPacket(c.store, recorded.value.record.key);
      expect(formed.ok).toBe(false);
      // the first event, packet and read are exactly what they were; nothing was written, replaced or re-earned
      expect(head(c)).toEqual(before);
      expect(accessKeys(c)).toHaveLength(3);
      expect(glance(c)).toBe(first);
      expect(verifyEpistemicIntegrity(c.store)).toEqual([]);
    });
  });
});
