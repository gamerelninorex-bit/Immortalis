/* eslint-disable @typescript-eslint/no-explicit-any -- tests rewrite arbitrary fact values */
// R-4 (NEWLY AUTHORIZED; BLUE Lapse Settlement v1.2; independent review pending) — load verification, RED C-3. Replay proves the history is
// intact; these prove the loaded lapse facts still tell ONE story, judged against the sealed record's immutable pins and the owner facts, never
// re-derived from facts that moved afterwards: a consistent, replayable journal that is not canonical (a lapse that kept its claim, pinned a
// stale record, stated another plan, cited a drifted rule, or a release with no lapse or no retirement) is refused by the verifiers.
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  PRODUCTION_PC_COLLECTION_LAPSE_RULE,
  TemporalCoordinator,
  deriveLapse,
} from "@immortalis/engine";
import { productionSourceAccountKey, type CommitGroup } from "@immortalis/contracts";
import { ACTOR_FIXTURE_EXTENSION, FIXTURE_LOCUS_ID, advanceToRequest } from "@immortalis/testkit";
import { rogueReplay } from "../support/existing-actor.ts";
import {
  ACT_A,
  PC,
  SRC_SOURCE_KEY,
  T0,
  TAU,
  W,
  at,
  collectionCampaign,
  collectionProviders,
  confirmAndStart,
} from "../support/pc-collection.ts";
import { forge, keys } from "../support/pc-cessation.ts";
import {
  addLedger,
  advanceTo,
  lapseKey,
  resident,
  resumeHeld,
  settle,
  stateOf,
} from "../support/pc-lapse.ts";
import { tempDir } from "../support/tmp.ts";

const TARGET = T0.value + 4 * TAU;

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

/** premise lost mid-work, held at B, settled by the presenter; optionally the player's separate resume afterwards */
async function settled(resume: boolean): Promise<string> {
  const dir = tempDir("immortalis-col-lapse-rogue-");
  const s = await collectionCampaign({ dir });
  await confirmAndStart(s, ACT_A, 3);
  await advanceTo(s, T0.value + 4, "tx-pre");
  await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
  await advanceTo(s, TARGET, "tx-cross");
  const heldTx = stateOf(s).continuation!.from_transaction;
  expect((await settle(s)).ok).toBe(true);
  if (resume) expect((await resumeHeld(s, heldTx, at(TARGET), "tx-resume")).ok).toBe(true);
  await s.campaign.close();
  return dir;
}

const k = keys();
const accountKey = productionSourceAccountKey(W, SRC_SOURCE_KEY);
const lapse = lapseKey();
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
const isLapseRetirement = (g: CommitGroup) =>
  g.writes.some((w) => w.key === k.object) && g.rule.clause.startsWith("R-4 (d)(2)(e)");

describe("an R-4 history: the lawful journal opens, before and after the player's separate resume", () => {
  it("replaying the settled journal, and the journal after the resume consumed the held continuation, opens unchanged (the controls)", async () => {
    expect(await codes(await rogueReplay(await settled(false)))).toBe("OK");
    expect(await codes(await rogueReplay(await settled(true)))).toBe("OK");
  }, 240_000);
});

describe("an R-4 history built OUTSIDE admission is refused by the load verifier", () => {
  it("each way of making a lapse, its release or its retirement say what its premises did not is refused", async () => {
    const src = await settled(false);
    const cases: Record<string, (g: CommitGroup) => CommitGroup | null> = {
      "lapse pinned to a stale work version": edit(lapse, (v) => (v.pins.work.version += 1)),
      "lapse pinned to a stale commitment version": edit(
        lapse,
        (v) => (v.pins.commitment.version += 1),
      ),
      "lapse stating a different held boundary": edit(
        lapse,
        (v) => (v.derivation.boundary_at.value += 1),
      ),
      "lapse stating a different interval start": edit(
        lapse,
        (v) => (v.derivation.started_at.value += 1),
      ),
      "lapse pinned to a held transaction at a stale version": edit(
        lapse,
        (v) => (v.pins.held_transaction.version += 1),
      ),
      "lapse naming another stage": edit(lapse, (v) => (v.pins.stage.prospective_result_id += "x")),
      "the claim kept on the account by the lapse group": (g) =>
        g.writes.some((w) => w.key === lapse)
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
      "the lapse group governed by the plain drawdown rule": (g) =>
        g.writes.some((w) => w.key === lapse)
          ? { ...g, rule: { ...g.rule, clause: "the plain drawdown rule" } }
          : g,
      "the retirement governed by the plain kernel rule": (g) =>
        isLapseRetirement(g) ? { ...g, rule: { ...g.rule, clause: "the plain kernel rule" } } : g,
    };
    const fresh: Record<string, () => (g: CommitGroup) => CommitGroup | null> = {
      "the occupancy released with no lapse": () =>
        dropping((g) => g.writes.some((w) => w.key === lapse)),
      "the occupancy released with the pending boundary never retired": () =>
        dropping(isLapseRetirement),
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
  }, 600_000);
});

describe("RED C-1 on load: a lapse derived from a sole cause committed after the crossing opened is refused by the load verifier", () => {
  it("a lapse forced past the presenter's guard by a raw commit (admission cannot read revisions) is not a canonical campaign", async () => {
    const dir = tempDir("immortalis-col-lapse-sibling-");
    const s = await collectionCampaign({ dir });
    await confirmAndStart(s, ACT_A, 3);
    await advanceTo(s, T0.value + 4, "tx-pre");
    // an owner write (a resident arrives) committed the instant the crossing opens: after the opening, before the stage, undeclared
    const inner = s.campaign.store;
    let fired = false;
    const wrapped = new Proxy(inner, {
      get(target, prop) {
        const member = (target as any)[prop];
        if (prop !== "commit") return typeof member === "function" ? member.bind(target) : member;
        return async (group: any) => {
          const out = await target.commit(group);
          if (
            !fired &&
            out.ok &&
            group.writes.some((w: any) =>
              String(w.key).startsWith("temporal/transaction-authority/"),
            )
          ) {
            fired = true;
            await addLedger(s, "ledger-sibling", [resident("unit-sibling", FIXTURE_LOCUS_ID)], 956);
          }
          return out;
        };
      },
    });
    const crossed = await new TemporalCoordinator(wrapped as never, collectionProviders()).advance(
      advanceToRequest("tx-sibling", at(TARGET)),
    );
    expect(crossed.ok && fired).toBe(true);
    // the presenter refuses it; the owners' admission, which has no revision to read, derives the same record from the current facts
    expect((await settle(s)).ok).toBe(false);
    const facts = {
      get: (key: string) => inner.getFact(key),
      has: (key: string) => inner.getFact(key) !== undefined,
      values: () => inner.listFacts(),
    };
    const derived = deriveLapse(PC, ACT_A, facts);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    const account = inner.getFact(productionSourceAccountKey(W, SRC_SOURCE_KEY))!;
    const group = forge(
      s,
      "lapse-sibling",
      "production",
      "production_state",
      PRODUCTION_PC_COLLECTION_LAPSE_RULE,
      [
        { key: lapse, value: derived.value, expected_version: 0 },
        {
          key: accountKey,
          value: { ...(account.value as any), open: [] },
          expected_version: account.version,
        },
      ],
      [
        k.commitment,
        k.work,
        derived.value.pins.extraction.fact_key,
        derived.value.pins.held_transaction.fact_key,
        k.occupancy,
        k.clock,
        k.index,
        k.object,
        accountKey,
      ],
    );
    expect((await inner.commit(group)).ok).toBe(true);
    await s.campaign.close();
    const out = await codes(dir);
    expect(out).toMatch(/PC_COLLECTION_STATE/);
  }, 240_000);
});
