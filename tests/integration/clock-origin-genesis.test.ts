/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// F-014B A0 (CAL-TIME T-1) — the paired genesis through REAL code, non-MS route. T1 MECHANISM ONLY: the initial-message proofs and the
// isolated GM answers are labelled testkit fixtures; owner admission, the captured writer, time and replay are real. NOT original-message
// authenticity (A1), NOT a named client, NOT first-playable waiting.
//
// A0-T05 (positive, non-tautological): a genuine qualifying Input and Completion are seeded through the original fixture publication path
// with a strict v2 chronology capture; the REAL captured writer derives and atomically writes the pair from the pre-existing Completion's
// own committed Input; the journal is then replayed independently under the historical verifier, and exactly one qualified origin in one
// shared group is inspected. No fixture asserts the origin or the downstream verdict.
import { describe, expect, it } from "vitest";
import {
  CAPTURED_CHRONOLOGY_BASIS,
  SI_SCALE_DECLARATION,
  TEMPORAL_ORIGIN_FORMAT,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  TemporalOriginSchema,
  initialLocalityCompletionKey,
  initialSetupInputKey,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
  TEMPORAL_CAPTURED_V2_GENESIS_RULE,
  fixtureCanonicalAdmission,
  initializeCapturedChronology,
  resolveKey,
} from "@immortalis/engine";
import { FIXTURE_POLICY, harness, reopenFixtureCampaign } from "../support/initial-setup.ts";
import { admitInput } from "../support/clock-origin.ts";
import { must } from "../support/temporal.ts";

/** a v2 session driven to its Completion through the original fixture chain; no Temporal fact exists yet */
async function v2ThroughCompletion() {
  const h = await harness();
  expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();
  const admitted = await admitInput(h);
  expect(admitted.ok, JSON.stringify(admitted.published)).toBe(true);
  const result = await h.service.advance(admitted.setup_id);
  expect(result.status).toBe("COMPLETED");
  return { h, ...admitted };
}

describe("A0-T05: the paired genesis of a v2 captured chronology, non-MS", () => {
  it("the real writer derives the pair from the Completion's own Input; one shared group; exact reads and dependencies; strict replay", async () => {
    const { h, input } = await v2ThroughCompletion();
    const inputKey = initialSetupInputKey(input.world_id, input.locus_id, input.setup_id);
    const completionKey = initialLocalityCompletionKey(input.world_id, input.locus_id);
    const inputFact = h.store.getFact(inputKey)!;
    const completionFact = h.store.getFact(completionKey)!;
    // the v2 Input was admitted under exactly its route's v2 rule, never a v1 citation
    expect(inputFact.provenance.rule).toEqual(INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE);
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();

    const written = await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    expect(written.replayed).toBe(false);

    const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
    const origin = h.store.getFact(TEMPORAL_ORIGIN_KEY)!;
    // both version-one facts of ONE group, ONE rule, ONE owner/facet, the same basis and secrecy
    expect(state.version).toBe(1);
    expect(origin.version).toBe(1);
    expect(state.provenance.group_id).toBe(origin.provenance.group_id);
    expect(state.provenance.intent_id).toBe(origin.provenance.intent_id);
    expect(state.provenance.group_id).toMatch(/^captured-chronology:/);
    expect(state.provenance.rule).toEqual(TEMPORAL_CAPTURED_V2_GENESIS_RULE);
    expect(origin.provenance.rule).toEqual(TEMPORAL_CAPTURED_V2_GENESIS_RULE);
    expect([state.owner, state.facet]).toEqual(["temporal_kernel", "temporal_coordination"]);
    expect([origin.owner, origin.facet]).toEqual(["temporal_kernel", "temporal_coordination"]);
    expect(state.basis).toBe(CAPTURED_CHRONOLOGY_BASIS.ORIGINAL_MESSAGE_VERIFIED);
    expect(origin.basis).toBe(state.basis);
    expect(origin.secrecy).toBe(state.secrecy);
    expect(state.secrecy).toBe("engine-internal");

    // the state is the ordinary initial basis; the origin is the typed witness, with every field literally what the records say
    expect((state.value as any).canonical_time).toEqual({ unit: "seconds", value: 0 });
    expect((state.value as any).last_transaction).toBeNull();
    expect((state.value as any).continuation).toBeNull();
    expect(TemporalOriginSchema.safeParse(origin.value).success).toBe(true);
    expect(origin.value).toEqual({
      format: TEMPORAL_ORIGIN_FORMAT,
      format_version: 1,
      campaign_id: h.campaignId,
      origin: { unit: "seconds", value: 0 },
      scale: SI_SCALE_DECLARATION,
      chronology: {
        capture_format_version: 2,
        capture_ref: input.chronology.capture_ref,
        capture_hash: input.chronology.capture_hash,
        document_hash: input.chronology.document_hash,
        grade: "ORIGINAL_MESSAGE_VERIFIED",
      },
      governing: {
        completion: { fact_key: completionKey, version: completionFact.version },
        input: { fact_key: inputKey, version: inputFact.version },
      },
    });

    // the committed group: exactly the two version-zero writes, and reads / depends_on exactly the Completion and Input (no extra read)
    const group = h.store.committedGroup(state.provenance.intent_id)!;
    expect(group.writes.map((w) => w.key).sort()).toEqual([
      TEMPORAL_ORIGIN_KEY,
      TEMPORAL_STATE_KEY,
    ]);
    expect(group.writes.every((w) => w.expected_version === 0)).toBe(true);
    // (the order is the v1 writer's own: the Completion, then its Input)
    expect(group.reads).toEqual([
      { key: completionKey, version: completionFact.version },
      { key: inputKey, version: inputFact.version },
    ]);
    expect(group.depends_on).toEqual([
      completionFact.provenance.group_id,
      inputFact.provenance.group_id,
    ]);
    // and exactly one origin witness exists in the whole campaign
    expect(
      h.store.listFacts().filter((f) => resolveKey(f.key)?.kind.id === "temporal_origin"),
    ).toHaveLength(1);

    // idempotent by identity (lost-acknowledgement convergence, A0-T11 also covers the changed-capture case)
    const again = await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    expect(again.replayed).toBe(true);
    expect(h.store.listFacts().filter((f) => f.key === TEMPORAL_ORIGIN_KEY)).toHaveLength(1);

    expect(h.campaign.verify()).toEqual([]);

    // an INDEPENDENT replay: a fresh open under a changed policy identity cannot trust the checkpoint, so every group is re-judged by the
    // historical verifier from the empty state
    const head = h.store.head();
    await h.campaign.close();
    const forced = {
      ...fixtureCanonicalAdmission,
      historyVerificationId: fixtureCanonicalAdmission.historyVerificationId + "+test-force-replay",
    };
    const replayed = await must(CanonicalCampaign.open(h.dir, { testkitFixtureAdmission: forced }));
    expect(replayed.store.head().state_sha256).toBe(head.state_sha256);
    expect(replayed.verify()).toEqual([]);
    const replayedOrigins = replayed.store
      .listFacts()
      .filter((f) => resolveKey(f.key)?.kind.id === "temporal_origin");
    expect(replayedOrigins).toHaveLength(1);
    expect(replayedOrigins[0]!.provenance.group_id).toBe(
      replayed.store.getFact(TEMPORAL_STATE_KEY)!.provenance.group_id,
    );
    await replayed.close();

    // and the ordinary reopen under the shipped fixture policy
    const reopened = await must(reopenFixtureCampaign(h.dir));
    expect(reopened.store.head().state_sha256).toBe(head.state_sha256);
    expect(reopened.verify()).toEqual([]);
    await reopened.close();
  });
});
