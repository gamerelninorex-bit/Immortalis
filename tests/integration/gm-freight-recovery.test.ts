/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw tool results */
import { appendFileSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { GmFreightResult } from "@immortalis/engine";
import { CanonicalCampaign, nodeFs } from "@immortalis/engine";
import { GM_FREIGHT_TOOLS } from "@immortalis/contracts";
import { instrumentFs, quarryWorksFixture, textileWorkshopFixture } from "@immortalis/testkit";
import { callGmFreight } from "../../packages/operator/src/gm-freight.ts";
import {
  attestRequest,
  authorThroughSeal,
  legalRequest,
  newGmRig,
  operatorStartsChronology,
  playerAdvancesTo,
  receiptOf,
  settingRequest,
  type GmRig,
} from "../support/gm-freight.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

/**
 * Crash, lost acknowledgement and strict-replay recovery at EVERY durable cut of EVERY mutating GM tool call. MECHANISM ONLY (T1) over
 * real local files: it is not retained-host, provider or hosted-continuity evidence.
 *
 * For each mutating tool at its natural point in the chain: a campaign is copied, the call is run with the filesystem failing at exactly one
 * mutating operation (before it takes effect, or after it took effect so that the caller sees a failure: the lost acknowledgement), the
 * dead process's package lock is reclaimed by the operator, the campaign is re-opened under strict replay (every first-profile group
 * re-derived against its true pre-state) and verified, `gm_freight_reconcile` reports what committed, and the SAME call with the SAME
 * operation_id is presented again. It must converge on a final canonical state byte-identical to the uninterrupted run, and a faulted call
 * that left a commit behind must never have been reported as a plain refusal.
 */

const tool = GM_FREIGHT_TOOLS;
let n = 0;
const cleanup: string[] = [];
afterAll(async () => {
  for (const d of cleanup) await rm(d, { recursive: true, force: true });
});

const cloneRig = async (rig: GmRig): Promise<GmRig> => {
  const dir = join(tempDir("imm-gm-cut-"), `c${n++}`);
  await cp(rig.campaignDir, dir, { recursive: true });
  return {
    ...rig,
    campaignDir: dir,
    params: { ...rig.params, campaignDir: dir },
    call: (t, a, over) => callGmFreight({ ...rig.params, campaignDir: dir, ...over }, t, a),
  };
};

const head = async (rig: GmRig) => {
  const c = await must(CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-cut-read" }));
  try {
    expect(c.verify()).toEqual([]);
    return { revision: c.store.head().revision, state: c.store.head().state_sha256 };
  } finally {
    await c.close();
  }
};

interface Cut {
  readonly name: string;
  /** the host's retry token the call carries */
  readonly operation: string;
  /** the call under test, with the host's own retry token */
  readonly call: (rig: GmRig, over?: Record<string, unknown>) => Promise<GmFreightResult>;
}

interface Tally {
  scenarios: number;
  unknown: number;
  ok: number;
  unavailable: number;
}

async function cutMatrix(prefixRig: GmRig, cut: Cut): Promise<Tally> {
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

const wrap =
  (t: string, args: (rig: GmRig) => unknown): Cut["call"] =>
  (rig, over) =>
    callGmFreight({ ...rig.params, campaignDir: rig.campaignDir, ...over }, t, args(rig));

describe("recovery at every durable cut of every mutating GM call — Quarry Works (MECHANISM ONLY)", () => {
  const fx = quarryWorksFixture();

  it("establish_setting", async () => {
    const prefix = await newGmRig(fx);
    const m = await cutMatrix(prefix, {
      name: "establish_setting",
      operation: "cut-setting",
      call: wrap(tool.establishSetting, (r) => settingRequest(r.fx, "cut-setting")),
    });
    expect(m.scenarios).toBeGreaterThan(20);
    expect(m.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("attest_opening", async () => {
    const prefix = await newGmRig(fx);
    receiptOf(await prefix.call(tool.establishSetting, settingRequest(fx)));
    const m = await cutMatrix(prefix, {
      name: "attest_opening",
      operation: "cut-attest",
      call: wrap(tool.attestOpening, (r) => attestRequest(r.fx, "cut-attest")),
    });
    expect(m.scenarios).toBeGreaterThan(4);
  }, 900_000);

  it("establish_legal (seven discrete owner acts)", async () => {
    const prefix = await newGmRig(fx);
    receiptOf(await prefix.call(tool.establishSetting, settingRequest(fx)));
    receiptOf(await prefix.call(tool.attestOpening, attestRequest(fx)));
    expect(await operatorStartsChronology(prefix)).toBe("TIME_ESTABLISHED");
    const m = await cutMatrix(prefix, {
      name: "establish_legal",
      operation: "cut-legal",
      call: wrap(tool.establishLegal, (r) => legalRequest(r.fx, "cut-legal")),
    });
    expect(m.scenarios).toBeGreaterThan(30);
    expect(m.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("initiate, first ask (premises, C-05, Production's operation and its registration)", async () => {
    const prefix = await newGmRig(fx);
    await authorThroughSeal(prefix);
    const m = await cutMatrix(prefix, {
      name: "initiate-1",
      operation: "cut-go-1",
      call: wrap(tool.initiate, (r) => ({ operation_id: "cut-go-1", world_id: r.fx.worldId })),
    });
    expect(m.scenarios).toBeGreaterThan(30);
  }, 900_000);

  it("initiate, second ask (E0 through enrolment) after the player's advance", async () => {
    const prefix = await newGmRig(fx);
    await authorThroughSeal(prefix);
    const go = receiptOf(
      await prefix.call(tool.initiate, { operation_id: "go-1", world_id: fx.worldId }),
    );
    if (go.awaiting?.kind !== "PLAYER_OOC_TIME_ADVANCE")
      throw new Error("expected the production boundary");
    expect(await playerAdvancesTo(prefix, go.awaiting.to)).toBe("NULL_PC_ADVANCE_COMMITTED");
    const m = await cutMatrix(prefix, {
      name: "initiate-2",
      operation: "cut-go-2",
      call: wrap(tool.initiate, (r) => ({ operation_id: "cut-go-2", world_id: r.fx.worldId })),
    });
    expect(m.scenarios).toBeGreaterThan(30);
  }, 900_000);
});

describe("recovery — Textile Workshop: the receipt and adequacy cuts (MECHANISM ONLY)", () => {
  it("initiate after the delivery boundary (adequacy)", async () => {
    const fx = textileWorkshopFixture();
    const prefix = await newGmRig(fx);
    await authorThroughSeal(prefix);
    let go = receiptOf(
      await prefix.call(tool.initiate, { operation_id: "go-1", world_id: fx.worldId }),
    );
    for (let i = 2; go.awaiting?.kind === "PLAYER_OOC_TIME_ADVANCE"; i++) {
      expect(await playerAdvancesTo(prefix, go.awaiting.to)).toBe("NULL_PC_ADVANCE_COMMITTED");
      if (go.awaiting.reason === "SERVICE_DELIVERY_BOUNDARY") break;
      go = receiptOf(
        await prefix.call(tool.initiate, { operation_id: `go-${i}`, world_id: fx.worldId }),
      );
    }
    const m = await cutMatrix(prefix, {
      name: "initiate-adequacy",
      operation: "cut-go-ad",
      call: wrap(tool.initiate, (r) => ({ operation_id: "cut-go-ad", world_id: r.fx.worldId })),
    });
    expect(m.scenarios).toBeGreaterThan(6);
  }, 900_000);
});
