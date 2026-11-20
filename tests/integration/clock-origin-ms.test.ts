// F-014B A0 (CAL-TIME T-1 grant 5) — the MS v3 route with a strict v2 captured chronology. T1 MECHANISM ONLY: the MS actor answers are
// labelled testkit fixtures; the MS owners, fence, the paired clock step, the live B2 prefix and the SEALED historical check are real.
//
// A0-T12 (positive, non-tautological): a genuine MS Input (v2 rule) and Completion are seeded through the original fixture path; the REAL
// MS actor service runs issue -> response -> existence -> B1 -> closure -> PAIR -> B2 by itself; the journal is replayed independently.
// A0-T13 (negatives), A0-T14 (historical). A0-T04 MS direction: a v2 MS Input pairs only with the MS v3 Completion rule.
import { describe, expect, it } from "vitest";
import {
  INITIAL_SETUP_RULES,
  INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE,
  INITIAL_SETUP_INPUT_MS_V3_RULE,
  INITIAL_LOCALITY_COMPLETION_MS_V3_RULE,
  MS_PRE_CLOCK_KINDS,
  TEMPORAL_CAPTURED_V2_GENESIS_RULE,
  CanonicalCampaign,
  inspectMsFenceView,
  isMsCompletionRule,
  isMsInputRule,
  resolveKey,
  verifyMsIntegrity,
} from "@immortalis/engine";
import {
  InitialLocalityCompletionSchema,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  type OwnerFact,
} from "@immortalis/contracts";
import { governing } from "../support/clock-origin.ts";
import { msHarness, mustMsReopen } from "../support/ms-setup.ts";
import { must } from "../support/temporal.ts";

type Ms = Awaited<ReturnType<typeof msHarness>>;
const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
const byKind = (h: Ms, kind: string) => h.store.listFacts().filter((f) => kindOf(f) === kind);
const reason = (v: { details?: unknown } | null): string | undefined =>
  (v?.details as { reason?: string } | undefined)?.reason;

/** the complete MS chain with a v2 captured chronology: a genuine v2 MS Input and Completion, then the real actor service */
async function lawfulV2() {
  const h = await msHarness({ v2: {} });
  expect(h.setup).toMatchObject({ status: "COMPLETED" });
  expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
  return h;
}

describe("A0-T12: the MS v3 chain with a v2 captured chronology", () => {
  it("issue, response, existence, B1, closure, the PAIR, B2: one qualified origin in one shared group, exact MS time pins, strict reopen", async () => {
    const h = await lawfulV2();
    expect(verifyMsIntegrity(h.store)).toEqual([]);
    expect(h.campaign.verify()).toEqual([]);
    expect(inspectMsFenceView(h.state())).toMatchObject({ released: true });

    // the MS Input and Completion carry exactly the MS citations; the Input's is the T-1 MS v2 rule, never an MS_SOURCE clause
    const g = governing(h);
    expect(g.inputFact.provenance.rule).toEqual(INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE);
    expect(g.input.chronology.format_version).toBe(2);
    expect(isMsInputRule(g.inputFact.provenance.rule)).toBe(true);
    expect(isMsCompletionRule(g.completion.provenance.rule)).toBe(true);
    expect(g.completion.provenance.rule).toEqual(INITIAL_LOCALITY_COMPLETION_MS_V3_RULE);

    // the pair: version one, ONE group, ONE rule
    const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
    const origin = h.store.getFact(TEMPORAL_ORIGIN_KEY)!;
    expect([state.version, origin.version]).toEqual([1, 1]);
    expect(state.provenance.group_id).toBe(origin.provenance.group_id);
    expect(state.provenance.rule).toEqual(TEMPORAL_CAPTURED_V2_GENESIS_RULE);
    expect(origin.provenance.rule).toEqual(TEMPORAL_CAPTURED_V2_GENESIS_RULE);
    expect(byKind(h, "temporal_origin")).toHaveLength(1);
    const group = h.store.committedGroup(state.provenance.intent_id)!;
    expect(group.writes.map((w) => w.key).sort()).toEqual([
      TEMPORAL_ORIGIN_KEY,
      TEMPORAL_STATE_KEY,
    ]);
    expect(group.writes.every((w) => w.expected_version === 0)).toBe(true);

    // reads and depends_on are EXACTLY the existing MS time pins: the Completion, its Input, the closure and the placement
    const closure = byKind(h, "world_setup_closure")[0]!;
    const placement = byKind(h, "actor_setup_placement")[0]!;
    const pins = [g.completion, g.inputFact, closure, placement]
      .map((f) => ({ key: f.key, version: f.version }))
      .sort((a, b) => (a.key < b.key ? -1 : 1));
    expect(group.reads).toEqual(pins);
    expect([...group.depends_on].sort()).toEqual(
      [
        ...new Set(
          [g.completion, g.inputFact, closure, placement].map((f) => f.provenance.group_id),
        ),
      ].sort(),
    );

    // B2 (the presence) still pins temporal/state version 1, and reads no origin
    const presence = byKind(h, "actor_physical_presence")[0]!;
    const presenceGroup = h.store.committedGroup(presence.provenance.intent_id)!;
    expect(presenceGroup.reads).toContainEqual({ key: TEMPORAL_STATE_KEY, version: 1 });
    expect(presenceGroup.reads.some((r) => r.key === TEMPORAL_ORIGIN_KEY)).toBe(false);
    expect(presenceGroup.depends_on).toContain(state.provenance.group_id);
    // the origin is NOT a pre-clock kind
    expect(MS_PRE_CLOCK_KINDS.has("temporal_origin")).toBe(false);

    // strict reopen under the same admission, and an independent replay under a changed policy identity
    const head = h.store.head();
    await h.campaign.close();
    const reopened = await mustMsReopen(h);
    expect(reopened.store.head()).toEqual(head);
    expect(reopened.verify()).toEqual([]);
    expect(verifyMsIntegrity(reopened.store)).toEqual([]);
    await reopened.close();
    const forced = {
      ...h.admission,
      historyVerificationId: h.admission.historyVerificationId + "+test-force-replay",
    };
    const replayed = await must(CanonicalCampaign.open(h.dir, { testkitFixtureAdmission: forced }));
    expect(replayed.store.head()).toEqual(head);
    expect(replayed.verify()).toEqual([]);
    expect(verifyMsIntegrity(replayed.store)).toEqual([]);
    expect(replayed.store.listFacts().filter((f) => kindOf(f) === "temporal_origin")).toHaveLength(
      1,
    );
    await replayed.close();
  });

  it("the v1 MS chain is unchanged: a state-only clock step under the kernel rule, no origin, and it still verifies", async () => {
    const h = await msHarness();
    expect(await h.actorService.advance()).toEqual({ status: "COMPLETED" });
    expect(byKind(h, "temporal_origin")).toHaveLength(0);
    const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
    expect(h.store.committedGroup(state.provenance.intent_id)!.writes).toHaveLength(1);
    expect(verifyMsIntegrity(h.store)).toEqual([]);
    expect(h.campaign.verify()).toEqual([]);
    await h.campaign.close();
  });
});

describe("A0-T04 (MS direction): a v2 MS Input pairs only with the MS v3 Completion rule, live and on replay", () => {
  it("crossing the Input's or the Completion's rule between the arms and routes is refused", async () => {
    const h = await msHarness({ v2: {} });
    const g = governing(h);
    const inputStep = h.trace.find((t) => t.group.writes[0]!.key === g.inputKey)!;
    const completionStep = h.trace.find((t) => t.group.writes[0]!.key === g.completionKey)!;
    // the lawful steps pass both the live check and the historical verifier
    for (const step of [inputStep, completionStep]) {
      expect(h.admission.verifyHistorical!(step.group, step.before)).toBeNull();
    }
    // a v2 MS Input under the MS v3 v1 rule, and under the non-MS rules
    for (const [name, rule] of [
      ["the MS v3 v1 rule", INITIAL_SETUP_INPUT_MS_V3_RULE],
      ["the CORE_V9 v1 rule", INITIAL_SETUP_RULES.initial_setup_input],
    ] as const) {
      const crossed = { ...inputStep.group, rule };
      for (const verdict of [
        h.admission.check(crossed, inputStep.before),
        h.admission.verifyHistorical!(crossed, inputStep.before),
      ])
        expect(verdict, name).not.toBeNull();
    }
    // the MS v2 Input pairs only with the MS Completion citation: the CORE_V9 rule on the Completion is a route-pair violation
    const crossedCompletion = {
      ...completionStep.group,
      rule: INITIAL_SETUP_RULES.initial_locality_completion,
    };
    for (const verdict of [
      h.admission.check(crossedCompletion, completionStep.before),
      h.admission.verifyHistorical!(crossedCompletion, completionStep.before),
    ])
      expect(reason(verdict)).toBe("MS_ROUTE_PAIR");
    // and the Completion is the MS rule itself
    const c = InitialLocalityCompletionSchema.parse(g.completion.value);
    expect(c.input).toEqual({ fact_key: g.inputKey, version: g.inputFact.version });
    await h.campaign.close();
  });
});
