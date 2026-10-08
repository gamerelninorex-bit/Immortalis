/* eslint-disable @typescript-eslint/no-explicit-any -- the state under judgment is a hand-built view */
// Unit evidence for the reverse of PR #41's rival-authority guard: a conserved reference that is an active PC's identity is never
// accepted as a Production fallback entity, so the PC never has two physical-subject records (frozen Post-Handover contract §9).
import { describe, expect, it } from "vitest";
import {
  FallbackPhysicalEntitySchema,
  productionCompletionKey,
  worldAcceptanceStage,
  worldFallbackEntityKey,
  worldPcLocusCustodyKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { stageIntentId, worldEntityGroupCheck } from "@immortalis/engine";
import { FIXTURE_WORLD_ID } from "@immortalis/testkit";
import { acceptLogEntity, entityIdOf, seededLogisticsCampaign } from "../support/logistics.ts";
import { REQ_1 } from "../support/logistics.ts";
import { tempDir } from "../support/tmp.ts";

describe("a fallback entity is never accepted under an active PC's identity", () => {
  it("the acceptance is refused by the PC guard once the identity is a PC's custody record, and by no PC guard before", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    const entityId = entityIdOf(REQ_1);
    const store = s.campaign.store;
    const entityKey = worldFallbackEntityKey(FIXTURE_WORLD_ID, entityId);
    const entity = FallbackPhysicalEntitySchema.parse(store.getFact(entityKey)!.value);
    const group = store.committedGroup(
      stageIntentId(worldAcceptanceStage(entity.accepted_from.operation_id)),
    )!;
    expect(group).toBeDefined();
    expect(productionCompletionKey(entity.accepted_from.operation_id)).toBe(
      entity.accepted_from.fact_key,
    );
    // the state as it stood BEFORE the acceptance: everything but the accepted entity
    const before = new Map<string, OwnerFact>(
      store
        .listFacts()
        .filter((f) => f.key !== entityKey)
        .map((f) => [f.key, f]),
    );
    const judge = (facts: Map<string, OwnerFact>) =>
      worldEntityGroupCheck(group, { facts } as never);
    // (replaying an old acceptance against a later clock is refused by the stage-authority rule; what matters is that it is NOT the
    // PC guard that refuses it)
    expect((judge(before) as any)?.message ?? "").not.toMatch(/active PC/);
    // the same identity already held by an active PC's physical-locus custody record
    const withCustody = new Map(before);
    withCustody.set(worldPcLocusCustodyKey(entityId), {} as never);
    const refused = judge(withCustody) as any;
    expect(refused).not.toBeNull();
    expect(refused.code).toBe("REFERENCE_INVALID");
    expect(refused.message).toMatch(/active PC/);
  });
});
