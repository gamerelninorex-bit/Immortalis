/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw tool results */
import { appendFileSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, expect } from "vitest";
import type { GmFreightResult } from "@immortalis/engine";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import { GM_FREIGHT_TOOLS } from "@immortalis/contracts";
import { instrumentFs } from "@immortalis/testkit";
import { callGmFreight } from "../../packages/operator/src/gm-freight.ts";
import type { GmRig } from "./gm-freight.ts";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

/**
 * The crash / lost-acknowledgement cut machinery shared by the recovery suites. For one prefix state and one call it runs the call with the
 * filesystem failing at exactly one durable operation (before it takes effect, or after it took effect so the caller sees a failure), lets
 * the operator reclaim the dead lock, re-opens under strict replay, reconciles by identity, presents the SAME call again, and requires a final
 * canonical state byte-identical to the uninterrupted run. MECHANISM ONLY (T1) over real local files.
 */

const tool = GM_FREIGHT_TOOLS;
let n = 0;
const cleanup: string[] = [];
afterAll(async () => {
  for (const d of cleanup) await rm(d, { recursive: true, force: true });
});

export const cloneRig = async (rig: GmRig): Promise<GmRig> => {
  const dir = join(tempDir("imm-gm-cut-"), `c${n++}`);
  await cp(rig.campaignDir, dir, { recursive: true });
  return {
    ...rig,
    campaignDir: dir,
    params: { ...rig.params, campaignDir: dir },
    call: (t, a, over) => callGmFreight({ ...rig.params, campaignDir: dir, ...over }, t, a),
  };
};

export const head = async (rig: GmRig) => {
  const c = await must(CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-cut-read" }));
  try {
    expect(c.verify()).toEqual([]);
    return { revision: c.store.head().revision, state: c.store.head().state_sha256 };
  } finally {
    await c.close();
  }
};

export interface Cut {
  readonly name: string;
  /** the host's retry token the call carries */
  readonly operation: string;
  /** the call under test, with the host's own retry token */
  readonly call: (rig: GmRig, over?: Record<string, unknown>) => Promise<GmFreightResult>;
}

export interface Tally {
  scenarios: number;
  unknown: number;
  ok: number;
  unavailable: number;
}

export async function cutMatrix(prefixRig: GmRig, cut: Cut): Promise<Tally> {
  const tally: Tally = { scenarios: 0, unknown: 0, ok: 0, unavailable: 0 };
  // the uninterrupted reference from this prefix
  const ref = await cloneRig(prefixRig);
  expect((await cut.call(ref)).ok, `${cut.name}: the reference run`).toBe(true);
  const refHead = await head(ref);
  // how many durable steps does the whole call take (open, commits, close)?
  const probeRig = await cloneRig(prefixRig);
  const probe = instrumentFs(nodeFs);
  expect((await cut.call(probeRig, { campaignFs: probe.fs })).ok).toBe(true);
  const total = probe.count();
  expect(total, `${cut.name} takes durable steps`).toBeGreaterThanOrEqual(3);

  const before = await head(prefixRig);
  for (let failAt = 1; failAt <= total; failAt++) {
    for (const when of ["before", "after"] as const) {
      const rig = await cloneRig(prefixRig);
      const inst = instrumentFs(nodeFs, { failAt, when });
      const result = await cut.call(rig, { campaignFs: inst.fs });
      if (result.ok) tally.ok++;
      else if (result.error.code === "GM_FREIGHT_OUTCOME_UNKNOWN") tally.unknown++;
      else tally.unavailable++;
      // the dead process's lock is reclaimed by the operator (the engine honours a reclaim only for a provably dead holder)
      await rm(join(rig.campaignDir, "LOCK"), { force: true });

      // restart under strict replay; whatever the faulted call left must verify
      const afterCrash = await head(rig);
      if (afterCrash.revision > before.revision)
        expect(
          !result.ok &&
            ["GM_FREIGHT_REFUSED", "GM_FREIGHT_INPUT_INVALID"].includes(result.error.code),
          `${cut.name} @${failAt}/${when}: a call that left a commit behind is never reported as a plain refusal`,
        ).toBe(false);

      // reconcile by identity, then present the SAME call again: it converges
      const rec: any = await rig.call(tool.reconcile, {
        operation_id: cut.operation,
        world_id: rig.fx.worldId,
      });
      expect(rec.ok, `${cut.name} @${failAt}/${when}: reconcile`).toBe(true);
      const again = await cut.call(rig);
      expect(
        again.ok,
        `${cut.name} @${failAt}/${when}: the same call again (${JSON.stringify(again)})`,
      ).toBe(true);
      const final = await head(rig);
      expect(final.revision, `${cut.name} @${failAt}/${when}: revision`).toBe(refHead.revision);
      expect(final.state, `${cut.name} @${failAt}/${when}: state`).toBe(refHead.state);
      tally.scenarios++;
      await rm(rig.campaignDir, { recursive: true, force: true });
    }
  }
  await rm(ref.campaignDir, { recursive: true, force: true });
  await rm(probeRig.campaignDir, { recursive: true, force: true });
  // evidence: the scenario counts, retained when an evidence directory is named (nothing else reads this)
  const evidence = process.env["GM_FREIGHT_EVIDENCE_DIR"];
  if (evidence)
    appendFileSync(
      join(evidence, "recovery-matrix.jsonl"),
      `${JSON.stringify({ world: prefixRig.fx.label, cut: cut.name, durable_steps: total, ...tally })}\n`,
    );
  return tally;
}

export const wrap =
  (t: string, args: (rig: GmRig) => unknown): Cut["call"] =>
  (rig, over) =>
    callGmFreight({ ...rig.params, campaignDir: rig.campaignDir, ...over }, t, args(rig));
