import { describe, expect, it } from "vitest";
import {
  FACET_PRODUCTION_STATE,
  OWNER_PRODUCTION,
  PRODUCTION_OPERATION_COMPLETE,
  type CommitGroup,
} from "@immortalis/contracts";
import { groupSha256 } from "@immortalis/engine";
import {
  IF6B_POLICY,
  qualifyIf6bOwnerStage,
  type If6bOwnerVerifier,
  type If6bStageWitness,
} from "../../packages/engine/src/owners/if6b-stage.ts";
import {
  at,
  authorityGroupOf,
  FIXTURE_PC_ID,
  foreignGroup,
  lifecycle,
  must,
  seededRig,
  T0,
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
