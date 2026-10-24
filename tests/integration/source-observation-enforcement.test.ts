/* eslint-disable @typescript-eslint/no-explicit-any -- tests build raw, hostile groups and objects */
// BLUE v5.2-A1 — SOURCE-QUALIFIED original-PC observation: ENFORCEMENT. Every case here is an attempt to earn a receipt that pins a Source
// Condition WITHOUT the qualified, scoped interpretation and the authoritative reads: a raw store commit, a retargeted or forged event, a
// reading scoped at a source the character's locus does not hold, an appearance of the wrong fact, a spoofed role, a hand-written source
// citation. The owners' own admission refuses each, and a refused write leaves the campaign exactly as it was. The decisions are retained by
// the engine's own adapter from a SCRIPTED host (plumbing only); nothing here says whether any AI reads any sentence correctly.
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ENGINE_SEALED,
  CANON_WRITE_AUTHORITY,
  OBSERVATION_EVENT_BASIS,
  OWNER_WORLD_STATE,
  PLAYER_CHOICE_AUTHORITY,
  REFEREE_AUTHORITY,
  REFEREE_DECISION_BASIS,
  REFEREE_SECRECY,
  accessEventKey,
  observationEventCause,
  observationEventGroupId,
  observationEventIntentId,
  refereeDecisionCause,
  refereeDecisionGroupId,
  refereeDecisionIntentId,
  refereeDecisionKey,
  worldSourceConditionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
  EpistemicAccessAdapter,
  REFEREE_OBSERVATION_RULE,
  RefereeAdjudicationAdapter,
  contextDigest,
  deriveObservationEvent,
  factKind,
  formObservedPacket,
  observationEventDependencies,
  observationEventReads,
  observationRecordOf,
  recordContextViolation,
  refereeTaskId,
  verifyEpistemicIntegrity,
  verifyRefereeIntegrity,
} from "@immortalis/engine";
import { publication } from "@immortalis/testkit";
import { LOCUS_ID, WORLD_ID, openOrdinary } from "../support/locality.ts";
import {
  EXPOSED,
  PC_ID,
  SOURCE_KEY,
  sourceAnswer,
  sourceCampaign,
} from "../support/source-observation.ts";

const codeOf = async (p: Promise<{ ok: boolean; error?: { code: string } }>) => {
  const r = await p;
  return r.ok ? "OK" : (r.error?.code ?? "?");
};
const OTHER = "src-elsewhere";

async function ready() {
  const { dirs } = await sourceCampaign();
  const campaign: CanonicalCampaign = await openOrdinary(dirs.campaignDir);
  // a source of the same world at ANOTHER locus, committed by the World-State owner: a lawful fact, but not the character's to look at
  const locus = await campaign.establishLocus({
    ...publication(902),
    locus: {
      locus_id: "locus-elsewhere",
      world: { fact_key: `world/${WORLD_ID}/profile`, entity_id: WORLD_ID },
      designation: "Another place in the same world",
      constraints: [],
    },
  });
  if (!locus.ok) throw new Error(JSON.stringify(locus));
  const src = await campaign.establishSourceCondition({
    ...publication(903),
    source: {
      source_key: OTHER,
      world_id: WORLD_ID,
      locus_id: "locus-elsewhere",
      dimension: "elsewhere-crust",
      material_class: "elsewhere-material",
      quantity: { amount: 9, unit: "bucket" },
      access_facts: [{ aspect: "exposure", statement: EXPOSED }],
      statement: "A deposit elsewhere.",
    },
  });
  if (!src.ok) throw new Error(JSON.stringify(src));
  return { dirs, campaign };
}

async function decide(
  campaign: CanonicalCampaign,
  source: string | null = SOURCE_KEY,
  attempt = 0,
) {
  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const task = adapter.observationTask({
    pc_id: PC_ID,
    attempt,
    ...(source !== null ? { source_key: source } : {}),
  });
  if (!task.ok) throw new Error(JSON.stringify(task.error));
  const recorded = await adapter.recordObservation({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: "engine-direct-test", claimed_model: null },
    pc_id: PC_ID,
    attempt,
    ...(source !== null ? { source_key: source } : {}),
    answer: sourceAnswer({ task_id: task.value.task_id, context: task.value.context }),
  });
  if (!recorded.ok) throw new Error(JSON.stringify(recorded.error));
  return { ...recorded.value, context: task.value.context };
}

/** The group the Epistemic owner commits for a decision, built by hand so a test can change any part of it. */
function rawEventGroup(
  campaign: CanonicalCampaign,
  decisionKey: string,
  over: { event?: (e: any) => void; group?: (g: any) => void } = {},
): CommitGroup {
  const decision = campaign.store.getFact(decisionKey)!;
  const record = observationRecordOf(decision)!;
  const derived = deriveObservationEvent(record);
  const event: any = structuredClone(derived.ok ? derived.value : {});
  over.event?.(event);
  const kind = factKind("epistemic_access_event");
  const group: any = {
    campaign_id: campaign.store.head().campaign_id,
    group_id: observationEventGroupId(event.event_id),
    intent_id: observationEventIntentId(event.event_id),
    owner: kind.owner,
    facet: kind.facet,
    cause: observationEventCause(event.event_id),
    rule: EPISTEMIC_ACCESS_OBSERVATION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: observationEventReads(record, decision),
    depends_on: observationEventDependencies(record, decision.provenance.group_id),
    writes: [
      {
        key: accessEventKey(event.event_id),
        owner: kind.owner,
        facet: kind.facet,
        value: event,
        unit: null,
        basis: OBSERVATION_EVENT_BASIS,
        secrecy: ACCESS_CLASS_ENGINE_SEALED,
        expected_version: 0,
      },
    ],
  };
  over.group?.(group);
  return group;
}

/** A raw publication of a retained reading, built as the referee adapter builds it, from a record the test chose. */
function rawDecisionGroup(campaign: CanonicalCampaign, record: any): CommitGroup {
  const kind = factKind("referee_decision");
  return {
    campaign_id: campaign.store.head().campaign_id,
    group_id: refereeDecisionGroupId(record.task_id),
    intent_id: refereeDecisionIntentId(record.task_id),
    owner: kind.owner,
    facet: kind.facet,
    cause: refereeDecisionCause(record.task_id),
    rule: REFEREE_OBSERVATION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: record.input.refs.map((x: any) => ({ key: x.fact_key, version: x.version })),
    depends_on: [...new Set(record.input.refs.map((x: any) => x.group_id))] as string[],
    writes: [
      {
        key: refereeDecisionKey(record.task_id),
        owner: kind.owner,
        facet: kind.facet,
        value: record,
        unit: null,
        basis: REFEREE_DECISION_BASIS,
        secrecy: REFEREE_SECRECY,
        expected_version: 0,
      },
    ],
  };
}

const accessKeys = (c: CanonicalCampaign) =>
  c.store
    .listFacts()
    .map((f) => f.key)
    .filter((k) => k.startsWith("access/"));
/** The direct-perception readings only (the character's earlier I-002, IR and placement readings are other operations of the same owner). */
const decisionKeys = (c: CanonicalCampaign) =>
  c.store
    .listFacts()
    .filter((f) => (f.value as any)?.operation === "F014D_DIRECT_PERCEPTION")
    .map((f) => f.key);

describe("producer-bound admission: the receipt is the retained, source-scoped reading and nothing the caller supplies", () => {
  it("control: the group derived from an ESTABLISHED source-scoped reading commits (by a raw store commit), once, pinning that Source Condition", async () => {
    const { campaign } = await ready();
    try {
      const d = await decide(campaign);
      expect(d.verdict).toBe("OBSERVATION_ESTABLISHED");
      const group = rawEventGroup(campaign, d.record.key);
      expect(await codeOf(campaign.store.commit(group))).toBe("OK");
      const event = group.writes[0]!.value as any;
      expect(event.source).toEqual({
        owner: OWNER_WORLD_STATE,
        fact_key: worldSourceConditionKey(WORLD_ID, SOURCE_KEY),
        version: 1,
      });
      expect(accessKeys(campaign)).toHaveLength(1);
      expect(
        await codeOf(
          new EpistemicAccessAdapter(campaign.store).establishObservedAccess({
            decision_key: d.record.key,
          }),
        ),
      ).toBe("OK");
      expect(accessKeys(campaign)).toHaveLength(1);
      expect(verifyEpistemicIntegrity(campaign.store)).toEqual([]);
    } finally {
      await campaign.close();
    }
  }, 120_000);

  it("refuses every raw event whose source pin is not exactly the one Source Condition its retained decision cites", async () => {
    const { campaign } = await ready();
    try {
      const d = await decide(campaign);
      const head = campaign.store.head().state_sha256;
      const sourceKey = worldSourceConditionKey(WORLD_ID, SOURCE_KEY);
      const hostile: Record<string, Parameters<typeof rawEventGroup>[2]> = {
        "pinned at the locus instead of the source": {
          event: (e) => (e.source.fact_key = `world/${WORLD_ID}/locus/${LOCUS_ID}`),
        },
        "pinned at the world instead of the source": {
          event: (e) => (e.source.fact_key = `world/${WORLD_ID}/profile`),
        },
        "pinned at another source of the same world": {
          event: (e) => (e.source.fact_key = worldSourceConditionKey(WORLD_ID, OTHER)),
        },
        "pinned at the source's next version": { event: (e) => (e.source.version += 1) },
        "pinned under another owner": {
          event: (e) => (e.source.owner = "referee_adjudication_kernel"),
        },
        "a source key the decision never cited": {
          event: (e) => (e.source.fact_key = worldSourceConditionKey(WORLD_ID, "src-invented")),
        },
        "the source premise left out of the reads": {
          group: (g) => (g.reads = g.reads.filter((r: any) => r.key !== sourceKey)),
        },
        "the source premise read at another version": {
          group: (g) => (g.reads.at(-1).version += 1),
        },
        "the source's committing group left out of the dependencies": {
          group: (g) => (g.depends_on = g.depends_on.slice(0, -1)),
        },
      };
      for (const [name, over] of Object.entries(hostile)) {
        const r = await campaign.store.commit(rawEventGroup(campaign, d.record.key, over));
        expect(r.ok, name).toBe(false);
        expect(campaign.store.head().state_sha256, name).toBe(head);
        expect(accessKeys(campaign), name).toEqual([]);
      }
    } finally {
      await campaign.close();
    }
  }, 180_000);

  it("refuses a spoofed role or permission on a source-scoped event, and on the reading itself", async () => {
    const { campaign } = await ready();
    try {
      const d = await decide(campaign);
      for (const authority of [
        { ...REFEREE_AUTHORITY },
        { ...PLAYER_CHOICE_AUTHORITY },
        { role: "role.gm", permission: "permission.canon.write" },
        { role: "host.tool", permission: "permission.canon.write" },
      ])
        expect(
          await codeOf(
            campaign.store.commit(
              rawEventGroup(campaign, d.record.key, { group: (g) => (g.authority = authority) }),
            ),
          ),
        ).toBe("AUTHORITY_DENIED");
      expect(accessKeys(campaign)).toEqual([]);
      const spoof = await new RefereeAdjudicationAdapter(campaign.store).recordObservation({
        operation: { ...PLAYER_CHOICE_AUTHORITY },
        host: { host_id: "x", claimed_model: null },
        pc_id: PC_ID,
        attempt: 5,
        source_key: SOURCE_KEY,
        answer: {},
      });
      expect(spoof.ok ? "OK" : spoof.error.code).toBe("AUTHORITY_DENIED");
    } finally {
      await campaign.close();
    }
  }, 120_000);
});

describe("a retained reading cannot be scoped at a source the character's locus does not hold, however it is written", () => {
  it("the owner's own refusals: a source at another locus, an absent source and an invalid key retain nothing", async () => {
    const { campaign } = await ready();
    try {
      const adapter = new RefereeAdjudicationAdapter(campaign.store);
      const before = campaign.store.head().state_sha256;
      for (const key of [OTHER, "src-absent", "a/b", ""]) {
        const task = adapter.observationTask({ pc_id: PC_ID, attempt: 0, source_key: key });
        expect(task.ok, key).toBe(false);
        const recorded = await adapter.recordObservation({
          operation: { ...REFEREE_AUTHORITY },
          host: { host_id: "x", claimed_model: null },
          pc_id: PC_ID,
          attempt: 0,
          source_key: key,
          answer: {},
        });
        expect(recorded.ok, key).toBe(false);
      }
      expect(campaign.store.head().state_sha256).toBe(before);
      expect(decisionKeys(campaign)).toEqual([]);
    } finally {
      await campaign.close();
    }
  }, 120_000);

  it("a hand-written reading whose sixth citation is a source elsewhere, or no source, or the locus, is refused by admission and writes nothing", async () => {
    const { campaign } = await ready();
    try {
      const good = await decide(campaign);
      const record = structuredClone(
        observationRecordOf(campaign.store.getFact(good.record.key))!,
      ) as any;
      // forge: the very same reading, rebuilt as if it had been scoped at the source elsewhere
      const elsewhere = campaign.store.getFact(worldSourceConditionKey(WORLD_ID, OTHER))!;
      const head = campaign.store.head().state_sha256;
      const forged: Record<string, (r: any) => void> = {
        "scoped at a source at another locus": (r) => {
          r.input.refs[5] = {
            fact_key: elsewhere.key,
            version: elsewhere.version,
            group_id: elsewhere.provenance.group_id,
          };
        },
        "the source citation replaced by the locus": (r) => {
          r.input.refs[5] = { ...r.input.refs[4] };
        },
        "a seventh citation": (r) => {
          r.input.refs.push({ ...r.input.refs[5] });
        },
        "an ordinary (five-citation) reading whose appearance is claimed of a source fact": (r) => {
          r.input.refs.pop();
        },
        "a source-scoped reading whose appearance is of the locus": (r) => {
          r.decision.payload.source_fact_id = "locus.designation";
        },
      };
      for (const [name, edit] of Object.entries(forged)) {
        const r = structuredClone(record);
        edit(r);
        // a fresh task identity, so the attempt is a new create-only record and not a replay of the real one
        r.attempt = 9;
        r.task_id = refereeTaskId({ ...good.context, attempt: 9 });
        r.decision.task_id = r.task_id;
        r.input.digest = contextDigest({ ...good.context, attempt: 9 });
        const refused = await campaign.store.commit(rawDecisionGroup(campaign, r));
        expect(refused.ok, name).toBe(false);
        expect(campaign.store.head().state_sha256, name).toBe(head);
      }
      expect(decisionKeys(campaign)).toEqual([good.record.key]);
      expect(verifyRefereeIntegrity(campaign.store)).toEqual([]);

      // and the refusal is for the intended rule, not an accident of the forgery's digests: re-derived from the committed facts it cites,
      // a reading scoped at a source that is not at the character's own locus has no context at all, with the one message of an absent source
      const mislocated = structuredClone(record);
      mislocated.input.refs[5] = {
        fact_key: elsewhere.key,
        version: elsewhere.version,
        group_id: elsewhere.provenance.group_id,
      };
      expect(recordContextViolation(mislocated, (k) => campaign.store.getFact(k))).toMatchObject({
        code: "CONTEXT_UNAVAILABLE",
        message: "no source is available to this observation",
      });
      expect(recordContextViolation(record, (k) => campaign.store.getFact(k))).toBeNull();
    } finally {
      await campaign.close();
    }
  }, 180_000);

  it("a reading that is not an established one earns no event, by the adapter or by hand, whatever it cites", async () => {
    const { campaign } = await ready();
    try {
      const adapter = new RefereeAdjudicationAdapter(campaign.store);
      const task = adapter.observationTask({ pc_id: PC_ID, attempt: 3, source_key: SOURCE_KEY });
      expect(task.ok).toBe(true);
      if (!task.ok) return;
      const recorded = await adapter.recordObservation({
        operation: { ...REFEREE_AUTHORITY },
        host: { host_id: "engine-direct-test", claimed_model: null },
        pc_id: PC_ID,
        attempt: 3,
        source_key: SOURCE_KEY,
        answer: sourceAnswer(
          { task_id: task.value.task_id, context: task.value.context },
          { noFaculty: true },
        ),
      });
      expect(recorded.ok && recorded.value.verdict).toBe("OBSERVATION_UNRESOLVED");
      if (!recorded.ok) return;
      expect(
        await codeOf(
          new EpistemicAccessAdapter(campaign.store).establishObservedAccess({
            decision_key: recorded.value.record.key,
          }),
        ),
      ).toBe("OBSERVATION_NOT_ESTABLISHED");
      expect(await codeOf(formObservedPacket(campaign.store, recorded.value.record.key))).toBe(
        "OBSERVATION_NOT_ESTABLISHED",
      );
      expect(accessKeys(campaign)).toEqual([]);
    } finally {
      await campaign.close();
    }
  }, 120_000);
});
