import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nodeFs } from "@immortalis/engine";
import {
  instrumentFs,
  quarryWorksFixture,
  textileWorkshopFixture,
  type FreightWorldFixture,
} from "@immortalis/testkit";
import {
  branchSteps,
  createFreightCampaign,
  mainSteps,
  openFreightCampaign,
  settingSteps,
  type Freight,
  type Step,
} from "../support/freight.ts";

/**
 * PO-5 recovery: for EVERY freight durable act, a failure at every durable file step (before it takes effect and after it
 * does) leaves a campaign that reopens under strict replay with every first-profile group re-derived against its true
 * pre-state, accepts the SAME act re-presented (reaching the original receipt, or making the act once), and then completes
 * the whole chain to a final canonical state byte-identical to an uninterrupted run. SCRIPTED MECHANISM / local files only:
 * this is not retained-host, provider or hosted-continuity evidence.
 */

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "imm-freight-matrix-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

let n = 0;
const fresh = (): string => join(root, `d${n++}`);

async function runSteps(f: Freight, steps: readonly Step[]): Promise<void> {
  for (const step of steps) await step.run(f);
}

/** Seeds a campaign by running `prefix` and closes it; returns its directory. */
async function seedDir(fx: FreightWorldFixture, prefix: readonly Step[]): Promise<string> {
  const dir = fresh();
  const f = await createFreightCampaign(dir, fx);
  await runSteps(f, prefix);
  await f.campaign.close();
  return dir;
}
async function copyOf(dir: string): Promise<string> {
  const to = fresh();
  await cp(dir, to, { recursive: true });
  return to;
}

interface Matrix {
  readonly scenarios: number;
  readonly outcomes: { unknown: number; ok: number };
}

async function cutMatrix(
  fx: FreightWorldFixture,
  steps: readonly Step[],
  only: (step: Step) => boolean,
): Promise<Matrix> {
  const tally = { scenarios: 0, outcomes: { unknown: 0, ok: 0 } };
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    if (!only(step)) continue;
    const prefixDir = await seedDir(fx, steps.slice(0, i));

    // the uninterrupted reference from this prefix
    const refDir = await copyOf(prefixDir);
    const ref = await openFreightCampaign(refDir, fx);
    await runSteps(ref, steps.slice(i));
    const refHead = ref.campaign.store.head();
    await ref.campaign.close();

    // how many durable file steps does this act take?
    const probeDir = await copyOf(prefixDir);
    const probe = instrumentFs(nodeFs);
    const p = await openFreightCampaign(probeDir, fx, { fs: probe.fs });
    const afterOpen = probe.count();
    await step.run(p);
    const durable = probe.count() - afterOpen;
    await p.campaign.close();
    expect(durable, `${step.name} takes durable steps`).toBeGreaterThanOrEqual(1);

    for (let failAt = afterOpen + 1; failAt <= afterOpen + durable; failAt++) {
      for (const when of ["before", "after"] as const) {
        const dir = await copyOf(prefixDir);
        const inst = instrumentFs(nodeFs, { failAt, when });
        const x = await openFreightCampaign(dir, fx, { fs: inst.fs });
        let crashed = false;
        try {
          await step.run(x);
        } catch {
          crashed = true;
        }
        tally.outcomes[crashed ? "unknown" : "ok"]++;
        await x.campaign.close().catch(() => undefined);

        // restart: strict replay + every first-profile group re-derived against its actual pre-state
        const re = await openFreightCampaign(dir, fx);
        expect(re.campaign.verify(), `${step.name} @${failAt}/${when}: verify`).toEqual([]);
        // the SAME act re-presented converges (original receipt, or made once), then the chain completes
        try {
          await step.run(re);
          await runSteps(re, steps.slice(i + 1));
        } catch (e) {
          throw new Error(`${step.name} @${failAt}/${when} (crashed=${crashed}): ${String(e)}`);
        }
        const head = re.campaign.store.head();
        expect(head.revision, `${step.name} @${failAt}/${when}: revision`).toBe(refHead.revision);
        expect(head.state_sha256, `${step.name} @${failAt}/${when}: state`).toBe(
          refHead.state_sha256,
        );
        expect(re.campaign.verify()).toEqual([]);
        await re.campaign.close();
        await rm(dir, { recursive: true, force: true });
        tally.scenarios++;
      }
    }
    await rm(prefixDir, { recursive: true, force: true });
    await rm(refDir, { recursive: true, force: true });
    await rm(probeDir, { recursive: true, force: true });
  }
  console.info(`FREIGHT_CUT_MATRIX ${JSON.stringify({ world: fx.label, ...tally })}`);
  return tally;
}

const FREIGHT_ACTS = new Set([
  "attest-opening",
  "opening-basis",
  "clauses",
  "seal",
  "site-condition",
  "material-specification",
  "input-lot",
  "C-05",
  "start-production",
  "advance-production-and-acceptance",
  "E0-fixation",
  "service-basis",
  "L0",
  "L1-F3",
  "E1",
  "TE",
  "advance-LD-WT-LR-ER",
  "AD",
]);

describe("PO-5 — crash, lost acknowledgement and strict-replay recovery at every freight durable cut", () => {
  it("Quarry Works: every act of the main chain converges on the uninterrupted final state", async () => {
    const fx = quarryWorksFixture();
    const steps = [...settingSteps(), ...mainSteps(fx)];
    const m = await cutMatrix(fx, steps, (s) => FREIGHT_ACTS.has(s.name));
    expect(m.scenarios).toBeGreaterThan(100);
    expect(m.outcomes.unknown).toBeGreaterThan(0);
  }, 900_000);

  it("Textile Workshop: the dispatch → consumption → enrollment → delivery cuts converge too", async () => {
    const fx = textileWorkshopFixture();
    const steps = [...settingSteps(), ...mainSteps(fx)];
    const m = await cutMatrix(fx, steps, (s) =>
      ["E0-fixation", "L0", "L1-F3", "E1", "TE", "advance-LD-WT-LR-ER", "AD"].includes(s.name),
    );
    expect(m.scenarios).toBeGreaterThan(30);
  }, 900_000);

  it("the withdrawal branch (W → F2 → C → E2 → a second full delivery) converges at every cut", async () => {
    const fx = quarryWorksFixture();
    const main = mainSteps(fx);
    const upToL0 = main.slice(0, main.findIndex((s) => s.name === "L0") + 1);
    const steps = [...settingSteps(), ...upToL0, ...branchSteps(fx)];
    const names = new Set(branchSteps(fx).map((s) => s.name));
    const m = await cutMatrix(
      fx,
      steps,
      (s) => names.has(s.name) && s.name !== "prospective-change",
    );
    expect(m.scenarios).toBeGreaterThan(40);
  }, 900_000);
});
