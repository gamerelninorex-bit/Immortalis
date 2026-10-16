/* eslint-disable @typescript-eslint/no-explicit-any -- tests rewrite arbitrary fact values */
// CPAA-C1 v0.3 — load verification of the F-1/F-2/F-3 facts. A consistent, replayable journal that is not canonical (an attestation whose
// hook or grounds were rewritten, a commitment pinned to a stale attestation, a representation flipped, a scene verdict or its evidence
// rewritten, an unestablished class that nevertheless started work) is refused by the load verifiers, not trusted.
import { describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  pcCollectionAttestationKey,
  popPcOccupancyKey,
  popPcRepresentationKey,
  pcCollectionCommitmentKey,
  pcCollectionReachKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import { rogueReplay } from "../support/existing-actor.ts";
import { tempDir } from "../support/tmp.ts";
import { ACT_A, PC, collectionCampaign, confirmAndStart } from "../support/pc-collection.ts";

const codes = async (dir: string): Promise<string> => {
  const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
  if (r.ok) {
    await r.value.close();
    return "OK";
  }
  return r.error.code === "CANON_INTEGRITY"
    ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
    : r.error.code;
};
async function started(): Promise<string> {
  const dir = tempDir("immortalis-col-v03-rogue-");
  const s = await collectionCampaign({ dir });
  await confirmAndStart(s, ACT_A, 3);
  await s.campaign.close();
  return dir;
}
const edit =
  (key: string, f: (v: any) => void) =>
  (g: CommitGroup): CommitGroup => ({
    ...g,
    writes: g.writes.map((w) => {
      if (w.key !== key) return w;
      const v = structuredClone(w.value) as any;
      f(v);
      return { ...w, value: v };
    }),
  });
const attKey = pcCollectionAttestationKey(PC, "mech-hands-1");

describe("a v0.3 history built OUTSIDE admission is refused by the load verifier", () => {
  it("the lawful journal replays unchanged (the control); each rewrite of an attestation, a representation, a scene judgment or a pin is refused", async () => {
    const src = await started();
    expect(await codes(await rogueReplay(src))).toBe("OK");
    const cases: Record<string, (g: CommitGroup) => CommitGroup> = {
      "attestation hook rewritten": edit(attKey, (v) => (v.temporal_hook.per_cycle.value += 1)),
      "attestation cycle ground rewritten": edit(
        attKey,
        (v) => (v.cycle_ground = "one handful every few moments"),
      ),
      "attestation effective after the canonical time": edit(
        attKey,
        (v) => (v.effective_from.value += 100000),
      ),
      "attestation unquoted ground": edit(
        attKey,
        (v) => (v.grounds = ["a thing the content never says"]),
      ),
      "commitment pinned to another attestation version": edit(
        pcCollectionCommitmentKey(PC, ACT_A),
        (v) => (v.basis.cycle.attestation.version += 1),
      ),
      "representation flipped to included": edit(
        popPcRepresentationKey(PC),
        (v) => (v.status = "INCLUDED"),
      ),
      "representation pinned to no ledger": edit(
        popPcRepresentationKey(PC),
        (v) => (v.ledgers = []),
      ),
      "occupancy pinned to another determination": edit(
        popPcOccupancyKey(PC),
        (v) => (v.representation.fact_key = "population-pc/someone-else/representation"),
      ),
      "scene verdict rewritten": edit(
        pcCollectionReachKey(PC, ACT_A),
        (v) => (v.scene_verdict = "ENGAGED_NOT_SOLITARY"),
      ),
      "scene evidence rewritten": edit(pcCollectionReachKey(PC, ACT_A), (v) =>
        v.scene_evidence.presence_here.push({
          unit_id: "unit-x",
          statement: "Population records unit unit-x as present",
        }),
      ),
      "scene verdict withheld yet work started": edit(pcCollectionReachKey(PC, ACT_A), (v) => {
        v.answer.scene.reading = "NOT_ESTABLISHED";
        v.scene_verdict = "WITHHELD";
      }),
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const out = await codes(await rogueReplay(src, mutate));
      expect(out, name).not.toBe("OK");
      expect(out, name).toMatch(
        /PC_COLLECTION_STATE|RULE_DRIFT|CANON|TEMPORAL|SOURCE_DRAWDOWN_STATE/,
      );
    }
  }, 300_000);
});
