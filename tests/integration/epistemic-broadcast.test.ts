// F-014D BROADCAST_EXPOSURE Access / Dissemination Event — the event-only foundation, end to end. A deliberately
// outcome-neutral TEST producer commits a synthetic carrier and the audience authority BEFORE the event; the Epistemic owner
// then creates exactly ONE sealed, immutable BROADCAST_EXPOSURE event with its full event basis. The event is NOT a live
// dissemination producer's output, NOT individual receipt and NOT adoption: no recipient exists, no packet forms, no
// Population/Culture/KTI/Temporal state is written, and every recipient/packet path refuses it. Negative contrasts prove
// that nothing is forged, leaked or duplicated, for the public adapter and for raw store commits alike.
// Register lineage: IA-02, IA-03, IA-11 (partial), IA-14 (partial), IA-16 (partial); RC-02, RC-07, RC-11, RC-14, RC-16;
// IM-02, IM-03, IM-10, IM-11, IM-12. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ENGINE_SEALED,
  CANON_WRITE_AUTHORITY,
  TemporalStateSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  populationCohortKey,
  populationLedgerKey,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  type BroadcastExposureEvent,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  EPISTEMIC_ACCESS_BROADCAST_RULE,
  EPISTEMIC_ACCESS_RULE,
  EpistemicAccessAdapter,
  PopulationAdapter,
  epistemicPacketDeclaration,
  epistemicPacketProvider,
  verifyEpistemicIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  COHORT_BURDEN_L,
  EVENT_BROADCAST,
  EVENT_COUNCIL,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  PLACE_L,
  SOURCE_SCROLL,
  SOURCE_PUBLIC_ADDRESS,
  SYNTH_ACCESS_SOURCE_OWNER,
  disseminationObservationKey,
  SYNTH_DISSEMINATION_OBSERVER_OWNER,
  T0,
  accessEvent,
  accessPublication,
  broadcastEvent,
  burdenCohort,
  ledgerInput,
  packetAdvanceRequest,
  packetConsumerObject,
  popPublication,
  publication,
  fixtureLocus,
  sourceKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  epistemicSummary,
  establishAccess,
  establishBroadcast,
  observeDissemination,
  registerPacketConsumer,
  seededBroadcastCampaign,
  type EpistemicSeeded,
} from "../support/epistemic.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const B = EVENT_BROADCAST;
const bKey = accessEventKey(B);
const locusKey = worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID);
const LEDGER = "ledger-main";

const accessFacts = (s: EpistemicSeeded) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("access/"));
const factGroup = (s: EpistemicSeeded, key: string) =>
  s.campaign.store.getFact(key)!.provenance.group_id;
const head = (s: EpistemicSeeded) => s.campaign.store.head();

/** The foreign Population authority: one established ledger and one sparse Cohort of it (a real owner path, no roster read). */
async function withPopulation(s: EpistemicSeeded) {
  const pop = new PopulationAdapter(s.campaign.store);
  await must(
    pop.establishLedger({ ...popPublication(1), ledger: ledgerInput(LEDGER, undefined, T0) }),
  );
  await must(
    pop.instantiateCohort({ ...popPublication(2), ref: burdenCohort(COHORT_BURDEN_L, PLACE_L) }),
  );
  return pop;
}

/** A raw broadcast-event group exactly as an unauthorized (or sloppy) caller might build it: no adapter, no registry. */
function raw(
  s: EpistemicSeeded,
  over: Partial<CommitGroup> & {
    value?: unknown;
    key?: string;
    secrecy?: string;
    expected_version?: number;
  } = {},
  n = 900,
): CommitGroup {
  const { value, key, secrecy, expected_version, ...group } = over;
  const e = (value ?? broadcastEvent(B)) as BroadcastExposureEvent;
  const source = s.campaign.store.getFact(e.source?.fact_key ?? "")!;
  const audience = s.campaign.store.getFact(e.audience?.fact_key ?? "")!;
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "epistemic_access",
    facet: "epistemic_access",
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: EPISTEMIC_ACCESS_BROADCAST_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [
      { key: e.source?.fact_key ?? "", version: source?.version ?? 0 },
      { key: e.audience?.fact_key ?? "", version: audience?.version ?? 0 },
    ],
    depends_on: [...new Set([source, audience].flatMap((f) => (f ? [f.provenance.group_id] : [])))],
    writes: [
      {
        key: key ?? bKey,
        owner: group.owner ?? "epistemic_access",
        facet: group.facet ?? "epistemic_access",
        value: value === undefined ? (e as never) : (value as never),
        unit: null,
        basis: "access-fixture-basis",
        secrecy: secrecy ?? ACCESS_CLASS_ENGINE_SEALED,
        expected_version: expected_version ?? 0,
      },
    ],
    ...group,
  };
}

/** Everything a broadcast must leave untouched, captured before and compared after. */
const bystanders = (s: EpistemicSeeded) =>
  s.campaign.store
    .listFacts()
    .filter((f) => !f.key.startsWith("access/"))
    .map((f) => JSON.stringify(f));

describe("positive mechanism ONLY: one sealed, immutable BROADCAST_EXPOSURE event with its full event basis", () => {
  it("creates exactly ONE event fact for a World-State locus audience: sealed, engine-side, create-only, event-only", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const before = bystanders(s);
    const written = await establishBroadcast(s, 1, B);

    const fact = s.campaign.store.getFact(bKey)!;
    expect(fact.owner).toBe("epistemic_access");
    expect(fact.facet).toBe("epistemic_access");
    expect(fact.version).toBe(1);
    expect(fact.secrecy).toBe(ACCESS_CLASS_ENGINE_SEALED);
    expect(fact.value).toEqual(written);
    expect(fact.provenance.rule).toEqual(EPISTEMIC_ACCESS_BROADCAST_RULE);
    expect(fact.provenance.rule).not.toEqual(EPISTEMIC_ACCESS_RULE);

    // the whole causal basis is preserved: payload, presented attribution, source pin, reach/channel, audience, exceptions
    expect(fact.value).toMatchObject({
      mode: "BROADCAST_EXPOSURE",
      source: {
        owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
        fact_key: disseminationObservationKey(SOURCE_PUBLIC_ADDRESS),
        version: 1,
      },
      audience: { owner: "world_state", fact_key: locusKey, version: 1 },
      reach: {
        channel: expect.stringContaining("SYNTHETIC FIXTURE"),
        conditions: expect.any(String),
      },
      payload: { presented_attribution: expect.any(String) },
      exceptions: [],
    });

    // it rests on exactly its two pinned foreign facts, and on nothing else
    const group = s.campaign.store.committedGroup(fact.provenance.intent_id)!;
    expect(group.reads).toEqual([
      { key: disseminationObservationKey(SOURCE_PUBLIC_ADDRESS), version: 1 },
      { key: locusKey, version: 1 },
    ]);
    expect(new Set(group.depends_on)).toEqual(
      new Set([
        factGroup(s, disseminationObservationKey(SOURCE_PUBLIC_ADDRESS)),
        factGroup(s, locusKey),
      ]),
    );
    expect(group.writes.map((w) => w.key)).toEqual([bKey]);

    // event-only: no recipient expansion, no packet, no provenance of individual receipt; no foreign fact touched or written
    expect(accessFacts(s).map((f) => f.key)).toEqual([bKey]);
    expect(bystanders(s)).toEqual(before);
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
  });

  it("rests on an independent, committed, test-owned causal dissemination observation made to the very audience authority it references — not on the event's own conditions", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const obsKey = disseminationObservationKey(SOURCE_PUBLIC_ADDRESS);
    const observation = s.campaign.store.getFact(obsKey)!;
    const revision = (key: string) =>
      s.campaign.store.lookupReceipt(s.campaign.store.getFact(key)!.provenance.intent_id)!.revision;

    // the observation exists, and is complete, BEFORE any Epistemic event or any access fact exists
    expect(accessFacts(s)).toEqual([]);
    expect(observation.owner).toBe(SYNTH_DISSEMINATION_OBSERVER_OWNER);
    expect(observation.owner).not.toBe("epistemic_access");
    expect(observation.value).toMatchObject({
      observed: expect.stringContaining("announced aloud"),
      made_to: { fact_key: locusKey, version: 1 },
    });

    // it is the observer's own causal fact: its group read the audience authority at the pinned version and depends on the
    // group that committed it, so the audience reference demonstrably pre-dates the observation that rests on it
    const group = s.campaign.store.committedGroup(observation.provenance.intent_id)!;
    expect(group.owner).toBe(SYNTH_DISSEMINATION_OBSERVER_OWNER);
    expect(group.reads).toEqual([{ key: locusKey, version: 1 }]);
    expect(group.depends_on).toEqual([factGroup(s, locusKey)]);
    expect(revision(locusKey)).toBeLessThan(revision(obsKey));

    // the Epistemic event then rests on exactly that observation and that audience; it is later than both
    const written = await establishBroadcast(s, 1, B);
    expect(written.source).toEqual({
      owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
      fact_key: obsKey,
      version: 1,
    });
    expect(written.audience.fact_key).toBe(
      (observation.value as { made_to: { fact_key: string } }).made_to.fact_key,
    );
    expect(revision(obsKey)).toBeLessThan(revision(bKey));
    // the event restates nothing the observation did not independently record: its authored conditions are not the witness
    expect(JSON.stringify(observation.value)).not.toContain(written.reach.conditions);
    expect(JSON.stringify(observation.value)).not.toContain(written.reach.channel);
    // and the observation is untouched by the event: no Epistemic write reached the observer's key space
    expect(s.campaign.store.getFact(obsKey)).toEqual(observation);

    // mechanism-only: the engine validates provenance (owner, kind, pins, order, basis), never what was observed or how far
    // it reached; physical reach, presence, attention and individual lowering are not adjudicated anywhere here
    expect(s.access.broadcastExposure(B)!.value.reach).toEqual(written.reach);
  });

  it("reads back by key as an engine-side typed value only: it is never a recipient event, a packet or an actor read", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const written = await establishBroadcast(s, 1, B);
    expect(s.access.broadcastExposure(B)!.value).toEqual(written);
    expect(s.access.broadcastExposure(B)!.fact.key).toBe(bKey);
    expect(s.access.disseminationEvent(B)!.value.mode).toBe("BROADCAST_EXPOSURE");
    // not a recipient event, and no packet or sealed provenance exists for any recipient
    expect(s.access.event(B)).toBeUndefined();
    for (const r of [ACTOR_SMITH, ACTOR_OTHER, FIXTURE_PC_ID]) {
      expect(s.access.packet(B, r)).toBeUndefined();
      expect(s.access.engineSealedProvenance(B, r)).toBeUndefined();
    }
    expect(s.access.broadcastExposure("event-absent")).toBeUndefined();
    // a recipient event is not returned as a broadcast
    await establishAccess(s, 2, EVENT_COUNCIL);
    expect(s.access.broadcastExposure(EVENT_COUNCIL)).toBeUndefined();
    expect(s.access.event(EVENT_COUNCIL)!.value.mode).toBe("BOUNDED_SHARED_ACCESS");
  });

  it("also rests on an authoritative Population ledger or Cohort audience reference, which is a scope reference and never a roster", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await withPopulation(s);
    const before = bystanders(s);
    const ledgerRef = {
      owner: "population" as const,
      fact_key: populationLedgerKey(LEDGER),
      version: s.campaign.store.getFact(populationLedgerKey(LEDGER))!.version,
    };
    const cohortRef = {
      owner: "population" as const,
      fact_key: populationCohortKey(LEDGER, COHORT_BURDEN_L),
      version: s.campaign.store.getFact(populationCohortKey(LEDGER, COHORT_BURDEN_L))!.version,
    };
    await establishBroadcast(s, 1, "event-ledger", { audience: ledgerRef });
    await establishBroadcast(s, 2, "event-cohort", { audience: cohortRef });
    expect(s.access.broadcastExposure("event-ledger")!.value.audience).toEqual(ledgerRef);
    expect(s.access.broadcastExposure("event-cohort")!.value.audience).toEqual(cohortRef);
    // the Population facts are byte-identical: the event wrote no aggregate-exposure or any other Population state, and copied no member
    expect(bystanders(s)).toEqual(before);
    for (const id of ["event-ledger", "event-cohort"])
      expect(JSON.stringify(s.campaign.store.getFact(accessEventKey(id))!.value)).not.toMatch(
        /"u-[0-9]"|members|roster/,
      );
    expect(accessFacts(s)).toHaveLength(2);
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
  });

  it("is deterministic and idempotent: identical input reaches the identical state; a re-presented intent reconciles to the original receipt", async () => {
    const a = await seededBroadcastCampaign(tempDir());
    const b = await seededBroadcastCampaign(tempDir());
    await establishBroadcast(a, 1, B);
    await establishBroadcast(b, 1, B);
    expect(head(a).state_sha256).toBe(head(b).state_sha256);
    expect(head(a).journal_head_sha256).toBe(head(b).journal_head_sha256);

    const settled = head(a);
    const again = await a.access.establishBroadcastExposure({
      ...accessPublication(1),
      event: broadcastEvent(B),
    });
    expect(again.ok).toBe(true);
    expect(head(a)).toEqual(settled);
    expect(a.campaign.store.getFact(bKey)!.version).toBe(1);
    expect(a.campaign.store.listFacts().filter((f) => f.key === bKey)).toHaveLength(1);
  });

  it("is outcome-neutral and downstream-free: no packet, Temporal, KTI, Population, Culture or actor state, no clock change, no stage and no consequence", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const quiet = epistemicSummary(s.campaign, s.coordinator);
    await establishBroadcast(s, 1, B);
    const after = epistemicSummary(s.campaign, s.coordinator);
    expect(after.state).toEqual(quiet.state);
    expect(after.index).toEqual(quiet.index);
    expect(after.objects).toEqual(quiet.objects);
    expect(after.transactions).toEqual(quiet.transactions);
    expect(after.actor).toEqual(quiet.actor);
    expect(after.population).toEqual(quiet.population);
    expect(after.consumer).toEqual(quiet.consumer);
    expect(after.access.map((f) => f.key)).toEqual([bKey]);
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) =>
          /^(kti|culture|gip|diplomacy|economy|logistics|production|projection)\//.test(f.key),
        ),
    ).toEqual([]);
    // the commit advanced the journal by exactly one group and no unrelated work happened
    expect(after.head.journal_entries).toBe(quiet.head.journal_entries + 1);
  });

  it("leaves a BOUNDED_SHARED_ACCESS path in the same campaign byte-for-byte what it would have been without the broadcast", async () => {
    const lone = await seededBroadcastCampaign(tempDir());
    const both = await seededBroadcastCampaign(tempDir());
    for (const s of [lone, both]) {
      const event = await establishAccess(s, 2, EVENT_COUNCIL, ACTOR_SMITH);
      await registerPacketConsumer(s, "c1", event, null, 3);
    }
    await establishBroadcast(both, 1, B);
    for (const s of [lone, both])
      await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    for (const read of [
      (s: EpistemicSeeded) => s.access.packet(EVENT_COUNCIL, ACTOR_SMITH)!.value,
      (s: EpistemicSeeded) => s.access.engineSealedProvenance(EVENT_COUNCIL, ACTOR_SMITH)!.value,
      (s: EpistemicSeeded) => s.access.event(EVENT_COUNCIL)!.value,
    ])
      expect(read(both)).toEqual(read(lone));
    expect(both.access.packet(EVENT_COUNCIL, ACTOR_SMITH)!.fact.provenance.rule).toEqual(
      EPISTEMIC_ACCESS_RULE,
    );
    expect(both.access.broadcastExposure(B)!.fact.version).toBe(1);
    expect(verifyEpistemicIntegrity(both.campaign.store)).toEqual([]);
  });
});

describe("the mode and the original audience reference are immutable (F-014D §4.2, §4.4, §14)", () => {
  it("a conflicting event of the same identity — another payload, audience or mode — is refused and the original is untouched", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await withPopulation(s);
    await establishBroadcast(s, 1, B);
    const original = JSON.stringify(s.campaign.store.getFact(bKey));
    const settled = head(s);
    const other = broadcastEvent(B, {
      payload: {
        ...broadcastEvent(B).payload,
        content: "SYNTHETIC FIXTURE: a more convenient payload.",
      },
    });
    const repoint = broadcastEvent(B, {
      audience: {
        owner: "population",
        fact_key: populationLedgerKey(LEDGER),
        version: s.campaign.store.getFact(populationLedgerKey(LEDGER))!.version,
      },
    });
    for (const [n, event] of [
      [2, other],
      [3, repoint],
    ] as const)
      expect(
        await codeOf(s.access.establishBroadcastExposure({ ...accessPublication(n), event })),
        `intent ${n}`,
      ).toBe("VERSION_CONFLICT");
    // a recipient event of the same identity cannot take the broadcast's key either
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(4),
          event: accessEvent(B, ACTOR_SMITH),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    // re-using the committed intent with a different value is a conflict, never a silent reuse
    expect(
      await codeOf(s.access.establishBroadcastExposure({ ...accessPublication(1), event: other })),
    ).not.toBe("OK");
    expect(JSON.stringify(s.campaign.store.getFact(bKey))).toBe(original);
    expect(head(s)).toEqual(settled);
  });

  it("a recipient event cannot be reclassified as a broadcast, nor a broadcast as a recipient event", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL);
    await establishBroadcast(s, 2, B);
    const boundedFact = JSON.stringify(s.campaign.store.getFact(accessEventKey(EVENT_COUNCIL)));
    const broadcastFact = JSON.stringify(s.campaign.store.getFact(bKey));
    expect(
      await codeOf(
        s.access.establishBroadcastExposure({
          ...accessPublication(3),
          event: broadcastEvent(EVENT_COUNCIL),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    // a raw amendment that flips the mode or rewrites the reference is not an amendment the sealed kind supports
    for (const [key, value] of [
      [bKey, accessEvent(B, ACTOR_SMITH)],
      [bKey, broadcastEvent(B, { reach: { channel: "x", conditions: "y" } })],
      [accessEventKey(EVENT_COUNCIL), broadcastEvent(EVENT_COUNCIL)],
    ] as const) {
      const committed = s.campaign.store.committedGroup(
        s.campaign.store.getFact(key)!.provenance.intent_id,
      )!;
      expect(
        await codeOf(
          s.campaign.store.commit(
            raw(s, {
              key,
              value,
              expected_version: 1,
              rule: key === bKey ? EPISTEMIC_ACCESS_BROADCAST_RULE : EPISTEMIC_ACCESS_RULE,
              reads: committed.reads,
              depends_on: committed.depends_on,
            }),
          ),
        ),
        key,
      ).toBe("AMENDMENT_NOT_SUPPORTED");
    }
    expect(JSON.stringify(s.campaign.store.getFact(accessEventKey(EVENT_COUNCIL)))).toBe(
      boundedFact,
    );
    expect(JSON.stringify(s.campaign.store.getFact(bKey))).toBe(broadcastFact);
  });
});

describe("negative contrast: an unsupported broadcast fails closed with no forged receipt, no leak and no duplicate", () => {
  /** Every refusal below leaves the head, the access key spaces and every bystander exactly as they were. */
  async function refused(
    s: EpistemicSeeded,
    attempt: () => Promise<{ ok: boolean; error?: { code: string } }>,
    expected: string | RegExp,
  ) {
    const settled = head(s);
    const before = bystanders(s);
    const code = await codeOf(attempt());
    if (typeof expected === "string") expect(code).toBe(expected);
    else expect(code).toMatch(expected);
    expect(head(s)).toEqual(settled);
    expect(bystanders(s)).toEqual(before);
    expect(accessFacts(s)).toEqual([]);
  }
  const viaAdapter =
    (s: EpistemicSeeded, event: unknown, n = 1) =>
    () =>
      s.access.establishBroadcastExposure({ ...accessPublication(n), event });

  it("absent source, absent audience: the carrier and the audience authority must already be committed", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, {
          source: {
            owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
            fact_key: sourceKey("source-absent"),
            version: 1,
          },
        }),
      ),
      "PREREQUISITE_MISSING",
    );
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, {
          audience: {
            owner: "world_state",
            fact_key: worldLocusKey(FIXTURE_WORLD_ID, "locus-absent"),
            version: 1,
          },
        }),
      ),
      "PREREQUISITE_MISSING",
    );
    // an uncommitted audience in the Population key space is no audience either
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, {
          audience: { owner: "population", fact_key: populationLedgerKey(LEDGER), version: 1 },
        }),
      ),
      "PREREQUISITE_MISSING",
    );
  });

  it("wrong-owner source or audience: a pin names the owner that really holds the committed fact", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await withPopulation(s);
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, {
          source: {
            owner: "world_state",
            fact_key: disseminationObservationKey(SOURCE_PUBLIC_ADDRESS),
            version: 1,
          },
        }),
      ),
      "REFERENCE_INVALID",
    );
    // the audience claims Population but names a World-State locus, and the reverse
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, { audience: { owner: "population", fact_key: locusKey, version: 1 } }),
      ),
      "REFERENCE_INVALID",
    );
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, {
          audience: { owner: "world_state", fact_key: populationLedgerKey(LEDGER), version: 1 },
        }),
      ),
      "REFERENCE_INVALID",
    );
  });

  it("stale or post-event pins: the carrier and audience are read at their current committed version, never an earlier or a later one", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    // the carrier moves on to version 2 AFTER the pin the event would claim
    await observeDissemination(s, 750, SOURCE_PUBLIC_ADDRESS, locusKey, 1);
    expect(
      s.campaign.store.getFact(disseminationObservationKey(SOURCE_PUBLIC_ADDRESS))!.version,
    ).toBe(2);
    await refused(s, viaAdapter(s, broadcastEvent(B)), "REFERENCE_INVALID");
    // a pin ahead of anything committed (a version that does not exist yet) is no basis either
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, {
          source: {
            owner: SYNTH_ACCESS_SOURCE_OWNER,
            fact_key: sourceKey(SOURCE_SCROLL),
            version: 9,
          },
        }),
      ),
      "REFERENCE_INVALID",
    );
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, { audience: { owner: "world_state", fact_key: locusKey, version: 4 } }),
      ),
      "REFERENCE_INVALID",
    );
    // the same carrier read at the version actually current is lawful
    await establishBroadcast(s, 60, B, {
      source: {
        owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
        fact_key: disseminationObservationKey(SOURCE_PUBLIC_ADDRESS),
        version: 2,
      },
    });
    expect(s.access.broadcastExposure(B)!.value.source.version).toBe(2);
  });

  it("a dissemination basis other than the current canonical basis is refused: the future is unknowable and the past is unverifiable", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    for (const basis of [
      { ...T0, value: T0.value + 1000 },
      { ...T0, value: T0.value + 1 },
      { ...T0, value: T0.value - 1 },
      { ...T0, value: 0 },
      { unit: "another-unit", value: T0.value },
    ])
      await refused(
        s,
        viaAdapter(s, broadcastEvent(B, { dissemination_basis: basis })),
        "REFERENCE_INVALID",
      );
    // the current canonical basis is the lawful positive
    await establishBroadcast(s, 5, B);
    expect(s.access.broadcastExposure(B)!.value.dissemination_basis).toEqual(T0);
  });

  it("a retroactively dated broadcast cannot cite a source and an audience that arrived only after the earlier basis it claims (F-014D §21.11)", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    // the canonical basis moves on: an ordinary consequence resolves to a later instant
    const event = await establishAccess(s, 2, EVENT_COUNCIL, ACTOR_SMITH);
    await registerPacketConsumer(s, "c1", event, null, 3);
    await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    const later = TemporalStateSchema.parse(s.coordinator.state()!.fact.value).canonical_time;
    expect(later.value).toBeGreaterThan(T0.value);

    // a NEW audience authority and a NEW independent observation of a dissemination made to it arrive only now, after T0
    await must(
      s.campaign.establishLocus({
        ...publication(70),
        locus: fixtureLocus({ locus_id: "locus-late" }),
      }),
    );
    const lateLocus = worldLocusKey(FIXTURE_WORLD_ID, "locus-late");
    await observeDissemination(s, 760, "source-late-address", lateLocus);
    const lateEvent = (basis: typeof later) =>
      broadcastEvent(B, {
        source: {
          owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
          fact_key: disseminationObservationKey("source-late-address"),
          version: 1,
        },
        audience: { owner: "world_state", fact_key: lateLocus, version: 1 },
        dissemination_basis: basis,
      });

    // both are present and current at commit, but they did not exist at T0: the retroactive claim fails closed
    const settled = head(s);
    expect(
      await codeOf(
        s.access.establishBroadcastExposure({ ...accessPublication(4), event: lateEvent(T0) }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(await codeOf(s.campaign.store.commit(raw(s, { value: lateEvent(T0) }, 4)))).toBe(
      "REFERENCE_INVALID",
    );
    expect(head(s)).toEqual(settled);
    expect(s.access.broadcastExposure(B)).toBeUndefined();

    // the same evidence at the current canonical basis, and the earlier carrier at the earlier basis no longer, are the contrast
    await must(
      s.access.establishBroadcastExposure({ ...accessPublication(5), event: lateEvent(later) }),
    );
    expect(s.access.broadcastExposure(B)!.value.dissemination_basis).toEqual(later);
    expect(
      await codeOf(
        s.access.establishBroadcastExposure({
          ...accessPublication(6),
          event: broadcastEvent("event-early", { dissemination_basis: T0 }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
  });

  it("forged or unsupported audience authority: only a World-State locus or a Population ledger/Cohort identifies an audience", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await withPopulation(s);
    // owners outside the two audience authorities are not representable at all
    for (const owner of [
      "pc_existence",
      "named_actor",
      "epistemic_access",
      "role_registry",
      "temporal_kernel",
      SYNTH_DISSEMINATION_OBSERVER_OWNER,
    ])
      await refused(
        s,
        viaAdapter(
          s,
          broadcastEvent(B, {
            audience: {
              owner,
              fact_key: pcExistenceContractKey(FIXTURE_PC_ID),
              version: 1,
            } as never,
          }),
        ),
        "INPUT_INVALID",
      );
    // facts of an audience OWNER that are not an area or population identity are refused: a world profile, a ledger's close
    for (const [owner, fact_key] of [
      ["world_state", worldProfileKey(FIXTURE_WORLD_ID)],
      ["world_state", pcExistenceContractKey(FIXTURE_PC_ID)],
      ["population", "population/ledger-main/close"],
      ["world_state", accessEventKey(EVENT_COUNCIL)],
      ["world_state", disseminationObservationKey(SOURCE_PUBLIC_ADDRESS)],
    ] as const)
      await refused(
        s,
        viaAdapter(s, broadcastEvent(B, { audience: { owner, fact_key, version: 1 } })),
        /^(REFERENCE_INVALID|PREREQUISITE_MISSING)$/,
      );
    // the carrier cannot also be the audience authority
    await refused(
      s,
      viaAdapter(
        s,
        broadcastEvent(B, { source: { owner: "world_state", fact_key: locusKey, version: 1 } }),
      ),
      "REFERENCE_INVALID",
    );
  });

  it("a source the Epistemic owner, the kernel or the Named-Actor owner holds is not a carrier", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL);
    const settled = head(s);
    for (const source of [
      { owner: "epistemic_access", fact_key: accessEventKey(EVENT_COUNCIL), version: 1 },
      { owner: "temporal_kernel", fact_key: "temporal/state", version: 1 },
    ])
      expect(
        await codeOf(
          s.access.establishBroadcastExposure({
            ...accessPublication(2),
            event: broadcastEvent(B, { source }),
          }),
        ),
        source.owner,
      ).toBe("REFERENCE_INVALID");
    expect(head(s)).toEqual(settled);
    expect(s.access.broadcastExposure(B)).toBeUndefined();
  });

  it("missing causal basis or reach/channel conditions: every required element is required", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const good: Record<string, unknown> = { ...broadcastEvent(B) };
    for (const field of [
      "source",
      "dissemination_basis",
      "payload",
      "reach",
      "audience",
      "exceptions",
      "event_id",
    ]) {
      const event = { ...good };
      delete event[field];
      await refused(s, viaAdapter(s, event), "INPUT_INVALID");
    }
    for (const reach of [
      { channel: "", conditions: "x" },
      { conditions: "x" },
      { channel: "x" },
      null,
    ])
      await refused(s, viaAdapter(s, { ...good, reach }), "INPUT_INVALID");
  });

  it("a historical roster, per-individual snapshot or recipient list cannot stand in for the event-basis reference", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const audience = broadcastEvent(B).audience;
    for (const event of [
      { ...broadcastEvent(B), audience: { ...audience, members: [ACTOR_SMITH, ACTOR_OTHER] } },
      { ...broadcastEvent(B), audience: [ACTOR_SMITH, ACTOR_OTHER] },
      { ...broadcastEvent(B), roster: [ACTOR_SMITH] },
      { ...broadcastEvent(B), participants: [ACTOR_SMITH, ACTOR_OTHER] },
      { ...broadcastEvent(B), recipients: [ACTOR_SMITH] },
      { ...broadcastEvent(B), cohort_membership_as_of: T0 },
      { ...broadcastEvent(B), is_broadcast: true },
    ])
      await refused(s, viaAdapter(s, event), "INPUT_INVALID");
  });

  it("a malformed dual-mode event is refused, through the adapter, through the recipient-set method and as a raw value", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const dual = { ...broadcastEvent(B), participants: [ACTOR_SMITH] };
    const hybrid = { ...accessEvent(B, ACTOR_SMITH), audience: broadcastEvent(B).audience };
    await refused(s, viaAdapter(s, dual), "INPUT_INVALID");
    await refused(
      s,
      () => s.access.establishBoundedSharedAccess({ ...accessPublication(2), event: hybrid }),
      "INPUT_INVALID",
    );
    await refused(
      s,
      () =>
        s.access.establishBoundedSharedAccess({
          ...accessPublication(3),
          event: broadcastEvent(B),
        }),
      "BROADCAST_EXPOSURE_UNSUPPORTED",
    );
    await refused(
      s,
      () => s.campaign.store.commit(raw(s, { value: dual })),
      /^(VALUE_INVALID|SCHEMA_INVALID)$/,
    );
    await refused(
      s,
      () => s.campaign.store.commit(raw(s, { value: hybrid, rule: EPISTEMIC_ACCESS_RULE })),
      /^(VALUE_INVALID|SCHEMA_INVALID)$/,
    );
  });

  it("the broadcast request is not an arbitrary flag: the recipient-set method never approximates it, and the request alone establishes nothing", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await refused(
      s,
      () =>
        s.access.establishBoundedSharedAccess({
          ...accessPublication(1),
          event: { ...accessEvent(B, ACTOR_SMITH), mode: "BROADCAST_EXPOSURE" },
        }),
      "BROADCAST_EXPOSURE_UNSUPPORTED",
    );
    await refused(
      s,
      () =>
        s.access.establishBroadcastExposure({
          ...accessPublication(2),
          event: { ...accessEvent(B, ACTOR_SMITH), is_broadcast: true },
        }),
      "INPUT_INVALID",
    );
    await refused(
      s,
      () =>
        s.access.establishBroadcastExposure({
          ...accessPublication(3),
          event: accessEvent(B, ACTOR_SMITH),
        }),
      "INPUT_INVALID",
    );
  });
});

describe("IM-11 admission holds for a raw store commit and a tampered group, not only for the public adapter", () => {
  it("accepts the one lawful raw group (control) and nothing the adapter would not build", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    expect(await codeOf(s.campaign.store.commit(raw(s)))).toBe("OK");
    expect(s.access.broadcastExposure(B)!.value).toEqual(broadcastEvent(B));
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
  });

  it("refuses every deviation of the group: citation, reads, order, dependencies, class, key, pin, owner and authority", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const lawful = raw(s);
    const source = lawful.reads[0]!;
    const audience = lawful.reads[1]!;
    const groups = lawful.depends_on;
    const deviations: Record<
      string,
      [Partial<CommitGroup> & { secrecy?: string; key?: string }, string | RegExp]
    > = {
      "the BOUNDED citation on a broadcast": [{ rule: EPISTEMIC_ACCESS_RULE }, "REFERENCE_INVALID"],
      "an altered citation": [
        { rule: { ...EPISTEMIC_ACCESS_BROADCAST_RULE, clause: "x" } },
        "REFERENCE_INVALID",
      ],
      "the audience read omitted": [
        { reads: [source], depends_on: [groups[0]!] },
        "REFERENCE_INVALID",
      ],
      "the source read omitted": [{ reads: [audience] }, "REFERENCE_INVALID"],
      "the reads reversed": [{ reads: [audience, source] }, "REFERENCE_INVALID"],
      "a further read": [
        { reads: [source, audience, { key: sourceKey(SOURCE_SCROLL), version: 1 }] },
        "REFERENCE_INVALID",
      ],
      "a stale audience read": [{ reads: [source, { ...audience, version: 7 }] }, "STALE_READ"],
      "no dependencies": [{ depends_on: [] }, "REFERENCE_INVALID"],
      // a real, committed group that is not one of the two references' own
      "an unrelated dependency": [
        { depends_on: [...groups, factGroup(s, pcExistenceContractKey(FIXTURE_PC_ID))] },
        "REFERENCE_INVALID",
      ],
      "a dependency on a group that does not exist": [
        { depends_on: [...groups, "raw-elsewhere"] },
        "MISSING_DEPENDENCY",
      ],
      "an actor-accessible class": [{ secrecy: "epistemic.actor-accessible" }, "VALUE_INVALID"],
      "an unclassified class": [{ secrecy: "public" }, "VALUE_INVALID"],
      "a key not derived from the identity": [
        { key: accessEventKey("event-other") },
        /^(VALUE_INVALID|REFERENCE_INVALID)$/,
      ],
      "a role without canon-write authority": [
        { authority: { role: "role.gm", permission: "permission.canon.write" } },
        "AUTHORITY_DENIED",
      ],
    };
    for (const [name, [over, expected]] of Object.entries(deviations)) {
      const settled = head(s);
      const { secrecy, key, ...groupOver } = over;
      const code = await codeOf(
        s.campaign.store.commit({
          ...lawful,
          ...groupOver,
          writes: [
            {
              ...lawful.writes[0]!,
              ...(secrecy ? { secrecy } : {}),
              ...(key ? { key } : {}),
            },
          ],
        }),
      );
      if (typeof expected === "string") expect(code, name).toBe(expected);
      else expect(code, name).toMatch(expected);
      expect(head(s), name).toEqual(settled);
    }
    expect(accessFacts(s)).toEqual([]);
  });

  it("owner exclusivity: the carrier's owner, the audience owners and every other owner are refused the event key, and the Epistemic owner cannot write an audience key", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await withPopulation(s);
    for (const [owner, facet] of [
      [SYNTH_DISSEMINATION_OBSERVER_OWNER, "synthetic-dissemination-observer"],
      [SYNTH_ACCESS_SOURCE_OWNER, "synthetic-access-source"],
      ["world_state", "world_locus"],
      ["population", "population_state"],
      ["named_actor", "actor_profile"],
      ["temporal_kernel", "temporal_coordination"],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw(s, { owner, facet }))), owner).toBe(
        "KEY_NOT_ADMITTED",
      );
    for (const key of [
      locusKey,
      populationLedgerKey(LEDGER),
      populationCohortKey(LEDGER, COHORT_BURDEN_L),
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw(s, { key, expected_version: 1 }))),
        key,
      ).toMatch(/^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/);
    for (const key of [
      "access/e1/audience/a1",
      "access/e1/broadcast",
      "access/e1/cohort/c1",
      "access/e1/receipt/a1",
      "access/e1/exposure",
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { key }))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
    expect(accessFacts(s)).toEqual([]);
  });

  it("a raw commit whose pinned facts are the wrong owner, the wrong kind or uncommitted is refused with nothing written", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const forged = (patch: Partial<BroadcastExposureEvent>) => {
      const value = broadcastEvent(B, patch);
      // an honest group for the pins it CLAIMS where they exist (so only the pin itself is wrong)
      return raw(s, { value });
    };
    for (const patch of [
      {
        audience: {
          owner: "world_state",
          fact_key: pcExistenceContractKey(FIXTURE_PC_ID),
          version: 1,
        },
      },
      {
        audience: { owner: "world_state", fact_key: worldProfileKey(FIXTURE_WORLD_ID), version: 1 },
      },
      { audience: { owner: "population", fact_key: locusKey, version: 1 } },
      {
        source: {
          owner: "world_state",
          fact_key: disseminationObservationKey(SOURCE_PUBLIC_ADDRESS),
          version: 1,
        },
      },
      {
        source: {
          owner: SYNTH_DISSEMINATION_OBSERVER_OWNER,
          fact_key: disseminationObservationKey(SOURCE_PUBLIC_ADDRESS),
          version: 2,
        },
      },
      {
        source: {
          owner: "epistemic_access",
          fact_key: disseminationObservationKey(SOURCE_PUBLIC_ADDRESS),
          version: 1,
        },
      },
    ] as Partial<BroadcastExposureEvent>[])
      expect(await codeOf(s.campaign.store.commit(forged(patch))), JSON.stringify(patch)).toBe(
        "REFERENCE_INVALID",
      );
    expect(accessFacts(s)).toEqual([]);
  });
});

describe("an unlowered BROADCAST_EXPOSURE is never individual receipt: every recipient and packet path refuses it", () => {
  it("a raw packet formation for any recipient is refused, whatever the content: nothing is conjured", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await establishBroadcast(s, 1, B);
    const event = s.campaign.store.getFact(bKey)!;
    const packet = {
      recipient: ACTOR_SMITH,
      payload: {
        referent: "the gate rota",
        content: "SYNTHETIC FIXTURE: the gate is opened at first light.",
      },
      presented_attribution: null,
      access: { result: "RECEIVED", channel: "SPEECH", established_at: T0 },
      intelligibility: { result: "REPRESENTATION_ACCESSIBLE", basis: "NO_CAPABILITY_DEPENDENCY" },
    };
    const provenance = {
      event: { fact_key: bKey, version: 1 },
      recipient: ACTOR_SMITH,
      packet: { fact_key: accessPacketKey(B, ACTOR_SMITH) },
      source: broadcastEvent(B).source,
      channel: "SPEECH",
      capability_close: null,
    };
    const w = (key: string, value: unknown, secrecy: string) => ({
      key,
      owner: "epistemic_access",
      facet: "epistemic_access",
      value: value as never,
      unit: null,
      basis: "access-fixture-basis",
      secrecy,
      expected_version: 0,
    });
    const settled = head(s);
    const code = await codeOf(
      s.campaign.store.commit({
        campaign_id: FIXTURE_CAMPAIGN,
        owner: "epistemic_access",
        facet: "epistemic_access",
        group_id: "raw-formation-group",
        intent_id: "raw-formation-intent",
        cause: "raw-formation-cause",
        rule: EPISTEMIC_ACCESS_RULE,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [{ key: event.key, version: event.version }],
        depends_on: [event.provenance.group_id],
        writes: [
          w(accessPacketKey(B, ACTOR_SMITH), packet, "epistemic.actor-accessible"),
          w(accessProvenanceKey(B, ACTOR_SMITH), provenance, ACCESS_CLASS_ENGINE_SEALED),
        ],
      }),
    );
    expect(code).toBe("VALUE_INVALID");
    expect(head(s)).toEqual(settled);
    expect(accessFacts(s).map((f) => f.key)).toEqual([bKey]);
    expect(s.access.packet(B, ACTOR_SMITH)).toBeUndefined();
  });

  it("no temporal object can declare a packet formation from a broadcast event, and the owner operation refuses to form one", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await establishBroadcast(s, 1, B);
    // the declaration a recipient event would derive, aimed at the broadcast's identity and a named recipient
    const stand_in = accessEvent(B, ACTOR_SMITH);
    const settled = head(s);
    const objectCode = await codeOf(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: packetConsumerObject("c-broadcast", stand_in, null),
      }),
    );
    expect(objectCode).not.toBe("OK");
    expect(head(s)).toEqual(settled);
    // the stage a stand-in event declares is unreachable: the owner operation refuses the broadcast fact outright
    expect(epistemicPacketDeclaration(stand_in).stage).toEqual(accessPacketStage(B, ACTOR_SMITH));
    const fact = s.campaign.store.getFact(bKey)!;
    expect(() =>
      epistemicPacketProvider.compute({
        reads: [{ read: {} as never, fact }],
        produces: [accessPacketKey(B, ACTOR_SMITH), accessProvenanceKey(B, ACTOR_SMITH)],
        prior: new Map(),
      } as never),
    ).toThrow(/BROADCAST_EXPOSURE event is never individual receipt/);
  });

  it("the recipient-set event of the same campaign still forms its packet while the broadcast forms none", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const event = await establishAccess(s, 1, EVENT_COUNCIL, ACTOR_SMITH);
    await establishBroadcast(s, 2, B);
    await registerPacketConsumer(s, "c1", event, null, 3);
    await must(s.coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    expect(s.access.packet(EVENT_COUNCIL, ACTOR_SMITH)).toBeDefined();
    expect(
      accessFacts(s)
        .filter((f) => f.key.includes(`/${B}/`))
        .map((f) => f.key),
    ).toEqual([bKey]);
    expect(verifyEpistemicIntegrity(s.campaign.store)).toEqual([]);
  });

  it("the diagnostic verifier flags a packet planted under a broadcast event, even one written around admission", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await establishBroadcast(s, 1, B);
    const store: CampaignStore = s.campaign.store;
    expect(verifyEpistemicIntegrity(store)).toEqual([]);
    // the verifier is exercised against a rogue history in the recovery suite; here the live store stays clean and refuses the plant
    expect(
      await codeOf(
        store.commit({
          campaign_id: FIXTURE_CAMPAIGN,
          owner: "epistemic_access",
          facet: "epistemic_access",
          group_id: "plant",
          intent_id: "plant",
          cause: "plant",
          rule: EPISTEMIC_ACCESS_RULE,
          authority: { ...CANON_WRITE_AUTHORITY },
          reads: [],
          depends_on: [],
          writes: [
            {
              key: accessPacketKey(B, ACTOR_SMITH),
              owner: "epistemic_access",
              facet: "epistemic_access",
              value: { recipient: ACTOR_SMITH } as never,
              unit: null,
              basis: "x",
              secrecy: "epistemic.actor-accessible",
              expected_version: 0,
            },
          ],
        }),
      ),
    ).not.toBe("OK");
    expect(accessFacts(s).map((f) => f.key)).toEqual([bKey]);
  });
});

describe("the broadcast adapter's boundaries", () => {
  it("a fresh adapter over the same store reads the same event: the value lives in the one canon, not in the adapter", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await establishBroadcast(s, 1, B);
    const again = new EpistemicAccessAdapter(s.campaign.store);
    expect(again.broadcastExposure(B)!.value).toEqual(broadcastEvent(B));
  });

  it("a publication cannot choose the class, the owner, the citation or the rule: a caller-supplied label is ignored", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    await must(
      s.access.establishBroadcastExposure({
        ...accessPublication(1),
        secrecy: "epistemic.actor-accessible",
        rule: EPISTEMIC_ACCESS_RULE,
        owner: "world_state",
        event: broadcastEvent(B),
      } as never),
    );
    const fact = s.access.broadcastExposure(B)!.fact;
    expect(fact.secrecy).toBe(ACCESS_CLASS_ENGINE_SEALED);
    expect(fact.owner).toBe("epistemic_access");
    expect(fact.provenance.rule).toEqual(EPISTEMIC_ACCESS_BROADCAST_RULE);
  });

  it("invalid publications and values commit nothing", async () => {
    const s = await seededBroadcastCampaign(tempDir());
    const settled = head(s);
    for (const input of [
      { ...accessPublication(1), intent_id: "", event: broadcastEvent(B) },
      { ...accessPublication(2), group_id: "", event: broadcastEvent(B) },
      { ...accessPublication(3), event: null },
      { ...accessPublication(4), event: "BROADCAST_EXPOSURE" },
      { ...accessPublication(5), event: broadcastEvent("") },
      { ...accessPublication(6), event: broadcastEvent("bad id") },
    ])
      expect(await codeOf(s.access.establishBroadcastExposure(input as never))).toBe(
        "INPUT_INVALID",
      );
    expect(head(s)).toEqual(settled);
  });
});
