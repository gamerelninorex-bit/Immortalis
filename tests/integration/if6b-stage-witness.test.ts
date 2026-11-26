import { describe, expect, it, vi } from "vitest";
import {
  FACET_PRODUCTION_STATE,
  FACET_WORLD_LOCUS,
  GmWaitMarkerSchema,
  GmWaitStagedTransactionSchema,
  GmWaitTransactionAuthoritySchema,
  JsonValueSchema,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  PRODUCTION_OPERATION_COMPLETE,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  temporalGmWaitMarkerKey,
  temporalObjectKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CanonicalTime,
  type CommitGroup,
  type GmWaitMarker,
  type StageKey,
  type TemporalObject,
} from "@immortalis/contracts";
import { factKind, groupSha256, type CampaignState } from "@immortalis/engine";
import { engagedObject } from "@immortalis/testkit";
import * as gmWait from "../../packages/engine/src/gm-wait-custody.ts";
import { temporalGroupCheck } from "../../packages/engine/src/temporal/admission.ts";
import { if6bSettlement } from "../../packages/engine/src/temporal/if6b-settlement.ts";
import { stageGroupId, stageIntentId } from "../../packages/engine/src/temporal/identity.ts";
import {
  IF6B_OCCURRENCE_OPERATION,
  IF6B_POLICY,
  if6bStageFor,
  installIf6b,
  if6bWorkHorizon,
  type If6bCommittedStage,
  qualifyIf6bOwnerStage,
  type If6bOwnerVerifier,
  type If6bStageWitness,
} from "../../packages/engine/src/temporal/if6b-stage.ts";
import {
  at,
  authorityGroupOf,
  custodyPolicy,
  FIXTURE_PC_ID,
  foreignGroup,
  lifecycle,
  must,
  seededRig,
  T0,
  TARGET,
  type Rig,
  tempDir,
  txOf,
} from "./b2-support.ts";

describe("IF-6b E1 TEST-ONLY owner witness structure", () => {
  it("binds the exact original prestate, same-group write and source; W2 still refuses the fixture as a caller claim", async () => {
    const rig = await seededRig(tempDir());
    try {
      const unopened = rig.store.canonicalState!();
      const { x } = await lifecycle(rig, "open");
      const state = rig.store.canonicalState!();
      const original = foreignGroup(101);
      const write = original.writes[0]!;
      const facet = FACET_PRODUCTION_STATE;
      const reservation = rig.prep.fact;
      const group: CommitGroup = {
        ...original,
        owner: OWNER_PRODUCTION,
        facet,
        cause: `transaction:${txOf(x)}`,
        reads: [{ key: reservation.key, version: reservation.version }],
        depends_on: [authorityGroupOf(rig.store, x), reservation.group_id],
        writes: [{ ...write, owner: OWNER_PRODUCTION, facet }],
      };
      const witness: If6bStageWitness = {
        class: "D3_COMPLETION",
        policy: IF6B_POLICY,
        campaign: group.campaign_id,
        pc: FIXTURE_PC_ID,
        x,
        at: T0,
        stage: {
          causal_process_id: "fixture-operation",
          owner_operation: { owner: OWNER_PRODUCTION, operation: PRODUCTION_OPERATION_COMPLETE },
          prospective_result_id: "fixture-completion",
        },
        groupId: group.group_id,
        groupDigest: groupSha256(group),
        ownerWriteKey: write.key,
        reservation,
        predecessors: [reservation],
      };
      const source: If6bOwnerVerifier = {
        class: "D3_COMPLETION",
        owner: OWNER_PRODUCTION,
        facet,
        operation: PRODUCTION_OPERATION_COMPLETE,
        // Deliberately synthetic. No actual producing-owner verifier is installed by this test.
        verify: () => witness,
      };
      const check = (sources: readonly If6bOwnerVerifier[]) =>
        qualifyIf6bOwnerStage(group, state, sources);
      expect(check([source])).toEqual(witness);
      expect(check([])).toBeUndefined();
      expect(check([source, source])).toBeUndefined();
      expect(check([{ ...source, operation: "economy-record-realized-access" }])).toBeUndefined();
      expect(qualifyIf6bOwnerStage(group, unopened, [source])).toBeUndefined();
      for (const mutation of [
        { x: "0".repeat(64) },
        { pc: "wrong-pc" },
        { at: at(101) },
        { at: { unit: "unrelated-clock", value: T0.value } },
        { at: at(99) },
        { groupId: "other-group" },
        { groupDigest: "0".repeat(64) },
        { ownerWriteKey: "missing/same-group/write" },
        { reservation: { ...reservation, version: reservation.version + 1 } },
        { predecessors: [] },
        { predecessors: [{ ...reservation, group_id: "wrong-parent" }] },
      ]) {
        expect(
          check([{ ...source, verify: () => ({ ...witness, ...mutation }) }]),
          JSON.stringify(mutation),
        ).toBeUndefined();
      }
      expect(qualifyIf6bOwnerStage({ ...group, depends_on: [] }, state, [source])).toBeUndefined();
      expect(qualifyIf6bOwnerStage({ ...group, writes: [] }, state, [source])).toBeUndefined();
      expect(await rig.store.commit(group)).toMatchObject({
        ok: false,
        error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } },
      });
      expect(rig.store.head().revision).toBe(state.revision);
      await must(rig.custody.sealOwn(x));
      expect(qualifyIf6bOwnerStage(group, rig.store.canonicalState!(), [source])).toBeUndefined();
    } finally {
      await rig.campaign.close();
    }
  });
});

describe("IF-6b earned interruption cut", () => {
  it("holds the early cut through unresolved source and occurrence, and releases it only on verified contrary evidence", () => {
    const stage = {
      causal_process_id: "original-enrolment",
      owner_operation: { owner: "world_state", operation: "world-state-occur-addressed-notice" },
      prospective_result_id: "original-occurrence",
    };
    const boundary = {
      entry: { object_id: "notice-object", boundary_id: "notice-boundary", at: at(100) },
      stage,
    };
    const makeRecord = (occurrence?: If6bCommittedStage["occurrence"]): If6bCommittedStage => ({
      at: boundary.entry.at,
      rule: foreignGroup(101).rule,
      record: {
        stage,
        reads: [],
        group_id: "original-occurrence-group",
        intent_id: "original-occurrence-intent",
        revision: 5,
        group_sha256: "0".repeat(64),
        writes: [{ key: "original-enrolment", version: 2 }],
        validation: { invariants: ["original-owner"] },
      },
      ...(occurrence ? { occurrence } : {}),
    });
    expect(if6bWorkHorizon(boundary, at(200), [])).toEqual(at(100));
    expect(
      if6bWorkHorizon(boundary, at(200), [
        makeRecord({ key: "owner-occurrence", version: 1, group_id: "original-occurrence-group" }),
      ]),
    ).toEqual(at(100));
    expect(if6bWorkHorizon(boundary, at(200), [makeRecord()])).toEqual(at(200));
    expect(if6bWorkHorizon(boundary, at(90), [])).toEqual(at(90));
  });
});

async function withInterruptedStage(
  check: (fixture: {
    state: CampaignState;
    rig: Rig;
    x: string;
    marker: GmWaitMarker;
    stage: StageKey;
    earned: CanonicalTime;
    object: TemporalObject;
    record: If6bCommittedStage;
  }) => void,
) {
  const rig = await seededRig(tempDir());
  try {
    const { x } = await lifecycle(rig, "open");
    const original = rig.store.canonicalState!()!;
    const facts = new Map(original.facts);
    const state = { ...original, facts };
    const marker = GmWaitMarkerSchema.parse(facts.get(temporalGmWaitMarkerKey(x))?.value);
    const stage: StageKey = {
      causal_process_id: marker.preparation.fact.key,
      owner_operation: { owner: OWNER_WORLD_STATE, operation: IF6B_OCCURRENCE_OPERATION },
      prospective_result_id: "test-occurrence",
    };
    const earned = at(TARGET.value - 10);
    const object: TemporalObject = {
      ...engagedObject(),
      object_id: "obj-workshop-notice-" + x,
      owning_ref: { owner: OWNER_WORLD_STATE, process_id: marker.preparation.fact.key },
      next_boundary: { boundary_id: "test-occurrence-boundary", at: earned },
      dependencies: [
        { stage, reads: [], produces: ["world/test-occurrence"], declares_close: null },
      ],
    };
    const clock = facts.get(TEMPORAL_STATE_KEY)!;
    const objectKey = temporalObjectKey(object.object_id);
    facts.set(objectKey, { ...clock, key: objectKey, value: JsonValueSchema.parse(object) });
    facts.set(TEMPORAL_BOUNDARY_INDEX_KEY, {
      ...clock,
      key: TEMPORAL_BOUNDARY_INDEX_KEY,
      value: { entries: [{ ...object.next_boundary!, object_id: object.object_id }] },
    });
    const group_id = stageGroupId(stage);
    const occurrence = { key: object.dependencies[0]!.produces[0]!, version: 1, group_id };
    const record: If6bCommittedStage = {
      at: earned,
      occurrence,
      rule: foreignGroup(101).rule,
      record: {
        stage,
        reads: [],
        group_id,
        intent_id: stageIntentId(stage),
        revision: state.revision + 1,
        group_sha256: "0".repeat(64),
        writes: [{ key: occurrence.key, version: occurrence.version }],
        validation: { invariants: ["test-original-owner"] },
      },
    };
    check({ state, rig, x, marker, stage, earned, object, record });
  } finally {
    await rig.campaign.close();
  }
}

describe("IF-6b settlement and stage admission", () => {
  it("rejects double credit, unclaimed stages and credit at the wrong earned time", async () => {
    await withInterruptedStage(({ state, x, marker, object, record }) => {
      const authority = GmWaitTransactionAuthoritySchema.parse(
        state.facts.get(temporalTransactionAuthorityKey(txOf(x)))?.value,
      );
      const rule = factKind("temporal_state").rule;
      const settle = (basis: CampaignState, stages: readonly If6bCommittedStage[]) =>
        if6bSettlement(basis, authority, marker, stages, rule);
      expect(settle(state, [record])?.transaction.outcome.stop_reason).toBe("INTERRUPTED");

      const otherStage = { ...record.record.stage, prospective_result_id: "orphan-stage" };
      const orphan: If6bCommittedStage = {
        at: record.at,
        rule: record.rule,
        record: {
          ...record.record,
          stage: otherStage,
          group_id: stageGroupId(otherStage),
          intent_id: stageIntentId(otherStage),
          writes: [{ key: "world/orphan-stage", version: 1 }],
        },
      };
      expect(settle(state, [record, orphan])).toBeUndefined();
      expect(settle(state, [{ ...record, at: at(record.at.value - 1) }])).toBeUndefined();

      const duplicate = { ...object, object_id: "obj-z-duplicate-credit" };
      const originalFact = state.facts.get(temporalObjectKey(object.object_id))!;
      const indexFact = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)!;
      const duplicateKey = temporalObjectKey(duplicate.object_id);
      const facts = new Map(state.facts);
      facts.set(duplicateKey, {
        ...originalFact,
        key: duplicateKey,
        value: JsonValueSchema.parse(duplicate),
      });
      facts.set(indexFact.key, {
        ...indexFact,
        value: {
          entries: [object, duplicate].map((item) => ({
            ...item.next_boundary!,
            object_id: item.object_id,
          })),
        },
      });
      expect(settle({ ...state, facts }, [record])).toBeUndefined();
    });
  });

  it("checks interrupted retirement even when the future index suffix needs no object reads", async () => {
    await withInterruptedStage(({ state, x, record }) => {
      gmWait.registerGmWaitFence(state, { ...gmWait.deriveGmWaitFence(state), stages: [record] });
      const rule = factKind("temporal_state").rule;
      const built = gmWait.buildSealGroup(state.facts, x, rule, state);
      if (!built.ok) throw new Error(built.error.message);
      const seal = built.value;
      const txKey = temporalTransactionKey(txOf(x));
      const tx = GmWaitStagedTransactionSchema.parse(
        seal.writes.find((w) => w.key === txKey)?.value,
      );
      expect(tx.outcome.stop_reason).toBe("INTERRUPTED");
      const indexWrite = seal.writes.find((w) => w.key === TEMPORAL_BOUNDARY_INDEX_KEY)!;
      const check = (index: typeof indexWrite | undefined) =>
        temporalGroupCheck(
          {
            ...seal,
            writes: [
              ...seal.writes.filter((write) => write !== indexWrite),
              ...(index ? [index] : []),
            ],
          },
          state,
          {
            policy: { ...custodyPolicy(), preparation: "FIXTURE", isCanonicalOwner: () => true },
            live: true,
          },
        );
      // Isolate the generic transaction check from custody's independent seal reconstruction.
      const custody = vi.spyOn(gmWait, "gmWaitCustodyCheck").mockReturnValue(null);
      try {
        expect(check(indexWrite)).toBeNull();
        expect(check(undefined)).toMatchObject({
          message: "resolved boundaries must leave the active boundary index",
        });
        expect(
          check({ ...indexWrite, value: state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)!.value }),
        ).toMatchObject({
          message: "the index may lose only the resolved boundaries of retired objects",
        });
      } finally {
        custody.mockRestore();
      }
    });
  });

  it("refuses an extra undeclared write even when its owner supplies a matching occurrence witness", async () => {
    await withInterruptedStage(({ state, rig, x, marker, stage, earned, record }) => {
      const reservation = rig.prep.fact;
      const scope = marker.policy.history_verification_id + "+" + IF6B_POLICY;
      const markerKey = temporalGmWaitMarkerKey(x);
      const facts = new Map(state.facts);
      facts.set(markerKey, {
        ...facts.get(markerKey)!,
        value: { ...marker, policy: { ...marker.policy, history_verification_id: scope } },
      });
      const basis = { ...state, facts };
      const fence = gmWait.deriveGmWaitFence(basis);
      const original = foreignGroup(101);
      const write = {
        ...original.writes[0]!,
        key: record.occurrence!.key,
        owner: OWNER_WORLD_STATE,
        facet: FACET_WORLD_LOCUS,
      };
      const group: CommitGroup = {
        ...original,
        group_id: stageGroupId(stage),
        intent_id: stageIntentId(stage),
        owner: OWNER_WORLD_STATE,
        facet: FACET_WORLD_LOCUS,
        cause: "transaction:" + txOf(x),
        reads: [{ key: reservation.key, version: reservation.version }],
        depends_on: [reservation.group_id, authorityGroupOf(rig.store, x)],
        writes: [write],
      };
      const admission = installIf6b(
        { historyVerificationId: scope },
        {
          preparation: () => true,
          ownerVerifiers: [
            {
              class: "RH_OCCURRENCE",
              owner: OWNER_WORLD_STATE,
              facet: FACET_WORLD_LOCUS,
              operation: IF6B_OCCURRENCE_OPERATION,
              verify(candidate) {
                return {
                  class: "RH_OCCURRENCE",
                  policy: IF6B_POLICY,
                  campaign: basis.campaign_id,
                  pc: FIXTURE_PC_ID,
                  x,
                  at: earned,
                  stage,
                  groupId: candidate.group_id,
                  groupDigest: groupSha256(candidate),
                  ownerWriteKey: write.key,
                  reservation,
                  predecessors: [reservation],
                  occurrence: record.occurrence!,
                };
              },
            },
          ],
        },
      );
      expect(if6bStageFor(group, basis, fence, admission)?.stage).toEqual(stage);
      expect(
        if6bStageFor(
          { ...group, writes: [write, { ...write, key: "world/undeclared-write" }] },
          basis,
          fence,
          admission,
        ),
      ).toBeUndefined();
    });
  });
});
