import { describe, it, expect } from "vitest";
import {
  INITIAL_SETUP_RULES,
  resolveKey,
  verifyMsIntegrity,
  verifyCanonicalIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import { msHarness } from "../support/ms-setup.ts";

describe("final-snapshot MS Input/Completion route pairing", () => {
  for (const changed of ["initial_setup_input", "initial_locality_completion"] as const)
    it("refuses a legacy " + changed + " paired with its MS counterpart at tier 2", async () => {
      const h = await msHarness();
      expect(verifyMsIntegrity(h.store)).toEqual([]);
      expect(verifyCanonicalIntegrity(h.store)).toEqual([]);
      const original = h.store.listFacts().find((f) => resolveKey(f.key)?.kind.id === changed)!;
      const altered = {
        ...original,
        provenance: { ...original.provenance, rule: INITIAL_SETUP_RULES[changed] },
      };
      const changedGroup = (id: string) => {
        const group = h.store.committedGroup(id);
        return group?.intent_id === original.provenance.intent_id
          ? { ...group, rule: altered.provenance.rule }
          : group;
      };
      // Corroborate the altered source group too, isolating route pairing from a generic
      // snapshot-vs-journal mismatch. No replay or current-source reconstruction is used.
      const snapshot: CampaignStore = {
        ...h.store,
        head: () => h.store.head(),
        getFact: (key) => (key === altered.key ? altered : h.store.getFact(key)),
        listFacts: () => h.store.listFacts().map((f) => (f.key === altered.key ? altered : f)),
        lookupReceipt: (id) => h.store.lookupReceipt(id),
        committedGroup: changedGroup,
        committedGroupById: (id) => {
          const group = h.store.committedGroupById!(id);
          return group ? changedGroup(group.intent_id) : null;
        },
        ruleCheckedGroupIds: () => h.store.ruleCheckedGroupIds!(),
      };
      // CanonicalCampaign's snapshot composition includes this owner-specific tier alongside
      // the generic world/PC checks; neither tier is replaced by historical replay here.
      const composed = (store: CampaignStore) => [
        ...verifyCanonicalIntegrity(store),
        ...verifyMsIntegrity(store),
      ];
      for (const verify of [verifyMsIntegrity, composed])
        expect(verify(snapshot)).toContainEqual(
          expect.objectContaining({
            message: "MS Input/Completion route pairing differs",
          }),
        );
      await h.campaign.close();
    });
});
