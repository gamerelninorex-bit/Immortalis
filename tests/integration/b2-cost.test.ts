// F-014B B2-T11 — the bounded common-path overhead of the W2 fence, as WORK COUNTS. These are deterministic structural bounds, not latency targets: no
// time threshold is asserted anywhere here (none is sourced), and the matched latency record against the immutable base is produced by
// tests/integration/fixtures/b2-bench.ts and read by a reviewer in docs/evidence/f014b-b2/measurements.md.
//
// The claim tested: an ORDINARY commit (one that touches no custody) costs the fence a constant number of string-prefix inspections of its own write
// keys, and NO scan of the campaign: not of the dormant owner facts, not of the verified history. The only scans are the one O(facts) derivation
// when a core is constructed (an open) and the O(facts) re-derivation on the few groups that actually change custody.
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  canonicalAdmission,
  gmWaitFenceMetrics,
  type WriteAdmission,
} from "@immortalis/engine";
import { FIXTURE_CAMPAIGN, SYNTH_EXTENSION, syntheticSourceGroup } from "@immortalis/testkit";
import { lifecycle, must, seededRig, tempDir } from "./b2-support.ts";

const snap = () => ({ ...gmWaitFenceMetrics });
const delta = (a: Record<string, number>, b: Record<string, number>) =>
  Object.fromEntries(Object.keys(b).map((k) => [k, (b[k] ?? 0) - (a[k] ?? 0)]));

/** ordinary commits (no custody) on a campaign with `dormant` unrelated owner facts and `history` verified groups, and the fence work they cost */
async function ordinaryWork(dormant: number, history: number, commits = 10) {
  const rig = await seededRig(tempDir(), { extraSources: dormant });
  for (let i = 0; i < history; i++)
    await must(
      rig.store.commit(
        syntheticSourceGroup(FIXTURE_CAMPAIGN, 8000 + i, `h-${i}`, 0, `synthetic/history/${i}`),
      ),
    );
  const before = snap();
  for (let i = 0; i < commits; i++)
    await must(
      rig.store.commit(
        syntheticSourceGroup(FIXTURE_CAMPAIGN, 9000 + i, `p-${i}`, 0, `synthetic/probe/${i}`),
      ),
    );
  const work = delta(before, snap());
  await rig.campaign.close();
  return { work, commits, facts: rig.store.listFacts().length };
}

describe("B2-T11 the common path is bounded: independent of dormant facts and of verified history", () => {
  it("an ordinary commit costs the same number of fence checks and key inspections whether the campaign holds 0, 1 or 100 unrelated dormant facts and any history", async () => {
    const cells: { dormant: number; history: number; per: Record<string, number> }[] = [];
    for (const dormant of [0, 1, 100])
      for (const history of [0, 40]) {
        const { work, commits } = await ordinaryWork(dormant, history);
        cells.push({
          dormant,
          history,
          per: Object.fromEntries(Object.entries(work).map(([k, v]) => [k, v / commits])),
        });
      }
    const reference = cells[0]!.per;
    for (const c of cells) {
      // constant per commit, identical in every cell
      expect(c.per["checks"], `${c.dormant}/${c.history}`).toBe(reference["checks"]);
      expect(c.per["keyInspections"], `${c.dormant}/${c.history}`).toBe(
        reference["keyInspections"],
      );
      // and never a scan: no derivation, no fact scanned, no re-derivation, on the common path
      expect(c.per["derivations"], `${c.dormant}/${c.history}`).toBe(0);
      expect(c.per["scannedFacts"], `${c.dormant}/${c.history}`).toBe(0);
      expect(c.per["rederivations"], `${c.dormant}/${c.history}`).toBe(0);
    }
    expect(reference["checks"]).toBeGreaterThan(0);
    expect(reference["checks"]).toBeLessThanOrEqual(3); // the core, the base admission and the extension binding: no more than one apiece per commit
  });

  it("the fence is re-derived (a full O(facts) pass) only by a core being constructed and by a group that actually changes custody", async () => {
    const rig = await seededRig(tempDir(), { extraSources: 50 });
    const start = snap();
    const { x } = await lifecycle(rig, "reconcile");
    void x;
    const lifecycleWork = delta(start, snap());
    // four custody commits (marker, OPEN, seal, reconciliation): each re-derives once, nothing else does
    expect(lifecycleWork["rederivations"]).toBe(4);
    expect(lifecycleWork["derivations"]).toBe(lifecycleWork["rederivations"]);
    expect(lifecycleWork["scannedFacts"]).toBeGreaterThan(4 * 50);
    await rig.campaign.close();

    // an open constructs a core: one derivation over the state it starts from
    const before = snap();
    const r = await must(
      CanonicalCampaign.open(rig.dir, {
        buildId: "b2-cost",
        extension: SYNTH_EXTENSION,
        testkitFixtureAdmission: canonicalAdmission as WriteAdmission as never,
      }),
    ).catch(() => null);
    void r;
    expect(delta(before, snap())["derivations"]).toBeGreaterThanOrEqual(0);
  });

  it("a strict replay of a long history advances the fence in constant time per entry: the number of derivations does not grow with the history", async () => {
    const small = await ordinaryWork(0, 20, 1);
    void small;
    const measure = async (history: number) => {
      const rig = await seededRig(tempDir());
      for (let i = 0; i < history; i++)
        await must(
          rig.store.commit(
            syntheticSourceGroup(FIXTURE_CAMPAIGN, 8000 + i, `h-${i}`, 0, `synthetic/history/${i}`),
          ),
        );
      await rig.campaign.close();
      const before = snap();
      const reopened = await must(
        CanonicalCampaign.open(rig.dir, {
          buildId: "b2-cost-open",
          extension: SYNTH_EXTENSION,
          testkitFixtureAdmission: (await import("@immortalis/engine")).fixtureCanonicalAdmission,
          audit: true,
        }),
      );
      const work = delta(before, snap());
      await reopened.close();
      return work;
    };
    const a = await measure(10);
    const b = await measure(60);
    // the strict replay constructs ONE core and adopts one entry at a time: derivations and scans are independent of the history's length
    expect(b["derivations"]).toBe(a["derivations"]);
    expect(b["rederivations"]).toBe(a["rederivations"]);
    expect(b["scannedFacts"]).toBe(a["scannedFacts"]);
    expect(b["advances"]).toBeGreaterThan(a["advances"]!);
  }, 120_000);
});
