/* eslint-disable @typescript-eslint/no-explicit-any -- tests rewrite arbitrary fact values */
// BLUE clause D-1 (PC Collection Voluntary Cessation) — PROVISIONAL, proposed and NOT adopted — load verification. Replay proves the
// history is intact; these prove the loaded D-1 facts still tell ONE story: a consistent, replayable journal that is not canonical (a
// termination that kept its claim, progress that is not what the elapsed time derives, a release with no termination or no retirement, a
// request after the boundary, a stale target, a rule that drifted) is refused by the load verifiers, not trusted.
import { describe, expect, it } from "vitest";
import { CanonicalCampaign } from "@immortalis/engine";
import { productionSourceAccountKey, type CommitGroup } from "@immortalis/contracts";
import { ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import { rogueReplay } from "../support/existing-actor.ts";
import { tempDir } from "../support/tmp.ts";
import { PC_TARGET_COMMITTED, pcTargetTransaction } from "../support/pc-target-advance.ts";
import {
  ACT_A,
  PC,
  T0,
  W,
  SRC_SOURCE_KEY,
  at,
  collectionCampaign,
  confirmAndStart,
} from "../support/pc-collection.ts";
import { cease, keys } from "../support/pc-cessation.ts";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
} from "@immortalis/protocol";

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

/** a collection started, partly passed over (T0+10), then stopped through the whole confirmed chain */
async function stopped(): Promise<string> {
  const dir = tempDir("immortalis-col-cease-rogue-");
  const s = await collectionCampaign({ dir });
  await confirmAndStart(s, ACT_A, 3);
  expect(
    await advanceActivePcToTarget(
      bindTrustedActivePcTargetAdvanceContext({
        campaign: s.campaign as never,
        pc_id: PC,
        target: at(T0.value + 10),
        transaction: pcTargetTransaction("tx-mid") as never,
      }),
      { operation: "advance_active_pc_to_target" },
    ),
  ).toEqual(PC_TARGET_COMMITTED);
  expect((await cease(s)).ok).toBe(true);
  await s.campaign.close();
  return dir;
}

const k = keys();
const accountKey = productionSourceAccountKey(W, SRC_SOURCE_KEY);
/** rewrites the value of the one write at `key`, wherever the lawful run committed it */
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
/**
 * Drops every group `which` selects and strips, from every later group, the reads of the keys a dropped group wrote (a raw store
 * refuses a read of a version that no longer exists; the point of the mutation is the verifier, not that refusal). One closure per replay.
 */
const dropping = (which: (g: CommitGroup) => boolean) => {
  const gone = new Set<string>();
  const goneGroups = new Set<string>();
  return (g: CommitGroup): CommitGroup | null => {
    if (which(g)) {
      for (const w of g.writes) gone.add(w.key);
      goneGroups.add(g.group_id);
      return null;
    }
    return gone.size === 0
      ? g
      : {
          ...g,
          reads: g.reads.filter((r) => !gone.has(r.key)),
          depends_on: g.depends_on.filter((d) => !goneGroups.has(d)),
        };
  };
};
/** the retirement group (the registration group writes the same two keys under the kernel's own rule) */
const isRetirement = (g: CommitGroup) =>
  g.writes.some((w) => w.key === k.object) &&
  g.rule.clause.startsWith("D-1 proposed Temporal retirement");

describe("a D-1 history built OUTSIDE admission is refused by the load verifier", () => {
  it("replaying the lawful, stopped journal unchanged opens (the control)", async () => {
    expect(await codes(await rogueReplay(await stopped()))).toBe("OK");
  }, 120_000);

  it("each way of making a stopped collection, its request, its release or its retirement say what its premises did not is refused", async () => {
    const src = await stopped();
    const cases: Record<string, (g: CommitGroup) => CommitGroup | null> = {
      "termination progress rewritten": edit(
        k.termination,
        (v) => (v.derivation.cycles_fully_elapsed += 1),
      ),
      "termination stopped after the earned boundary": edit(k.termination, (v) => {
        v.derivation.stopped_at.value = T0.value + 21;
        v.derivation.elapsed.value = 21;
        v.derivation.cycles_fully_elapsed = 3;
      }),
      "termination stopped before the request": edit(k.termination, (v) => {
        v.derivation.stopped_at.value = T0.value + 2;
        v.derivation.elapsed.value = 2;
        v.derivation.cycles_fully_elapsed = 0;
      }),
      "termination pinned to a stale work version": edit(
        k.termination,
        (v) => (v.pins.work.version += 1),
      ),
      "the claim kept on the account by the termination group": (g) =>
        g.writes.some((w) => w.key === k.termination)
          ? {
              ...g,
              writes: g.writes.map((w) =>
                w.key === accountKey
                  ? {
                      ...w,
                      value: {
                        ...(w.value as any),
                        open: [
                          {
                            extraction_id: `pc-collect:${PC}:${ACT_A}`,
                            quantity: { amount: 3, unit: (w.value as any).unit },
                          },
                        ],
                      },
                    }
                  : w,
              ),
            }
          : g,
      "the request after the earned boundary": edit(k.cessation, (v) => {
        v.requested_at.value = T0.value + 21;
      }),
      "the request before the work began": edit(k.cessation, (v) => {
        v.requested_at.value = T0.value;
        v.requested_at.value -= 1;
      }),
      "the request pinned to a stale commitment": edit(
        k.cessation,
        (v) => (v.intent.target.commitment.version += 1),
      ),
      "the termination group governed by the plain drawdown rule": (g) =>
        g.writes.some((w) => w.key === k.termination)
          ? { ...g, rule: { ...g.rule, clause: "the plain drawdown rule" } }
          : g,
      "the retirement governed by the plain kernel rule": (g) =>
        isRetirement(g) ? { ...g, rule: { ...g.rule, clause: "the plain kernel rule" } } : g,
    };
    // dropped groups need a fresh closure per replay
    const fresh: Record<string, () => (g: CommitGroup) => CommitGroup | null> = {
      "the occupancy released with no termination": () =>
        dropping((g) => g.writes.some((w) => w.key === k.termination)),
      "the occupancy released with the pending boundary never retired": () =>
        dropping(isRetirement),
    };
    const all: [string, (g: CommitGroup) => CommitGroup | null][] = [
      ...Object.entries(cases),
      ...Object.entries(fresh).map(
        ([n, f]) => [n, f()] as [string, (g: CommitGroup) => CommitGroup | null],
      ),
    ];
    for (const [name, mutate] of all) {
      const out = await codes(await rogueReplay(src, mutate));
      expect(out, name).not.toBe("OK");
      expect(out, name).toMatch(/PC_COLLECTION_STATE|RULE_DRIFT|SOURCE_DRAWDOWN_STATE|TEMPORAL/);
    }
  }, 300_000);
});
