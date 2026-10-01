/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and process output */
// World-State Entity Continuity / Transition Close — save → close → load → continue (acceptance 9, 10). The
// transition is one World-State stage of the existing IM-02 transaction over the existing persistence path: after
// a close and load it is still pending, still one, and a crash between its stage and its transaction converges
// by identity, in-process and across real operating-system processes.
// Register lineage: IA-06, IA-22, IA-30 (partial); RC-04, RC-05, RC-16; IM-02, IM-03, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { entityTransitionStage } from "@immortalis/contracts";
import { TemporalCoordinator, stageIntentId, type CampaignStore } from "@immortalis/engine";
import {
  CAUSE_1,
  DEST_LOCUS_ID,
  ENT_T_EFFECT,
  FIXTURE_LOCUS_ID,
  PROD_T1,
  REQ_1,
  entityConsumerResultKey,
  entityProviders,
  prodAdvanceRequest,
  transitionKeyOf,
} from "@immortalis/testkit";
import {
  acceptCauseRegister,
  currentLocusOfRequest,
  entSummary,
  registerConsumer,
  reopenEntity,
  seededEntityCampaign,
} from "../support/entity.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const stage = entityTransitionStage(CAUSE_1);
const locusIds = (s: { campaign: { store: CampaignStore } }) => {
  const r = currentLocusOfRequest(s.campaign as never, REQ_1)!;
  return { current: r.current.locus.entity_id, origin: r.origin.locus.entity_id };
};

describe("save → close → load → continue across the pending transition (acceptance 10)", () => {
  it("the transition is still pending after a close and load, and the continuation commits it exactly once", async () => {
    const dir = tempDir();
    const s = await seededEntityCampaign(dir);
    await acceptCauseRegister(s);
    await registerConsumer(s, CAUSE_1, REQ_1, 41);
    const before = entSummary(s.campaign, s.coordinator);
    expect(locusIds(s)).toEqual({ current: FIXTURE_LOCUS_ID, origin: FIXTURE_LOCUS_ID });
    await s.campaign.close();

    const re = await reopenEntity(dir, "reload");
    expect(re.campaign.verify()).toEqual([]);
    expect(entSummary(re.campaign, re.coordinator)).toEqual(before);
    // reloading re-resolves nothing: the entity is still at its accepted locus, nothing has transitioned
    expect(re.campaign.store.getFact(transitionKeyOf(REQ_1))).toBeUndefined();
    expect(locusIds(re)).toEqual({ current: FIXTURE_LOCUS_ID, origin: FIXTURE_LOCUS_ID });

    const r = await must(re.coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1)));
    expect(r.transaction.stages.map((x) => x.stage.owner_operation.operation)).toEqual([
      "world-state-commit-entity-transition",
      "synthetic-entity-transition-consume-now",
    ]);
    const after = entSummary(re.campaign, re.coordinator);
    expect(locusIds(re)).toEqual({ current: DEST_LOCUS_ID, origin: FIXTURE_LOCUS_ID });
    expect(after.transitions).toHaveLength(1);
    await re.campaign.close();

    // and again after a second close and load: still exactly one, replay writes nothing
    const again = await reopenEntity(dir, "reload-2");
    expect(again.campaign.verify()).toEqual([]);
    expect(entSummary(again.campaign, again.coordinator)).toEqual(after);
    const replay = await must(
      again.coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1)),
    );
    expect(replay.replayed).toBe(true);
    expect(entSummary(again.campaign, again.coordinator)).toEqual(after);
    expect(locusIds(again)).toEqual({ current: DEST_LOCUS_ID, origin: FIXTURE_LOCUS_ID });
    await again.campaign.close();
  });

  it("a crash between the transition's stage and its transaction is adopted by identity: one transition, one consumer result, no sibling locus", async () => {
    const dir = tempDir();
    const s = await seededEntityCampaign(dir);
    await acceptCauseRegister(s);
    await registerConsumer(s, CAUSE_1, REQ_1, 41);

    // the transition's stage and the consumer's commit; the kernel group never lands (the process "crashes" first)
    let killed = 0;
    const crashing: CampaignStore = {
      descriptor: s.campaign.store.descriptor,
      head: () => s.campaign.store.head(),
      getFact: (k) => s.campaign.store.getFact(k),
      listFacts: () => s.campaign.store.listFacts(),
      lookupReceipt: (i) => s.campaign.store.lookupReceipt(i),
      committedGroup: (i) => s.campaign.store.committedGroup(i),
      close: () => s.campaign.store.close(),
      commit: async (g: any) => {
        // the transaction group (not its opening authority, which is an earlier kernel commit)
        if (g.owner === "temporal_kernel" && g.group_id.startsWith("transaction-group:")) {
          killed++;
          return {
            ok: false,
            error: { code: "UNKNOWN_OUTCOME", message: "simulated crash before the kernel group" },
          } as never;
        }
        return s.campaign.store.commit(g);
      },
    };
    const interrupted = await new TemporalCoordinator(crashing, entityProviders()).advance(
      prodAdvanceRequest("tx-transition", PROD_T1),
    );
    expect(killed).toBe(1);
    expect(interrupted.ok).toBe(false);
    await s.campaign.close();

    const re = await reopenEntity(dir, "after-crash");
    // the stage committed durably; the transaction did not: an interrupted path the existing model allows
    expect(re.campaign.store.lookupReceipt(stageIntentId(stage))).not.toBeNull();
    expect(re.coordinator.transaction("tx-transition")).toBeUndefined();
    expect(re.coordinator.object(`obj-entity-transition-${CAUSE_1}`)!.value.next_boundary).toEqual({
      boundary_id: `boundary-entity-transition-${CAUSE_1}`,
      at: ENT_T_EFFECT,
    });
    expect(re.campaign.verify()).toEqual([]); // internally consistent: an unretired boundary awaits its transaction
    const tf = re.campaign.store.getFact(transitionKeyOf(REQ_1))!;
    expect(tf.version).toBe(1);

    // continuing: the committed stage is ADOPTED (never recomputed, never a sibling), the transaction records it
    const r = await must(re.coordinator.advance(prodAdvanceRequest("tx-transition", PROD_T1)));
    // (the transition's stage and the downstream reader's stage had both committed before the kernel group)
    expect(r.adopted).toHaveLength(2);
    expect(r.adopted).toContainEqual(stage);
    expect(r.recomputed_in_place).toEqual([]);
    expect(re.campaign.store.getFact(transitionKeyOf(REQ_1))).toEqual(tf);
    expect(re.campaign.store.getFact(entityConsumerResultKey(CAUSE_1))!.version).toBe(1);
    expect(re.campaign.store.listFacts().filter((f) => f.key.endsWith("/transition"))).toHaveLength(
      1,
    );
    expect(re.campaign.verify()).toEqual([]);
    expect(locusIds(re)).toEqual({ current: DEST_LOCUS_ID, origin: FIXTURE_LOCUS_ID });
    await re.campaign.close();
  });

  it("real operating-system processes: create → close → load → continue, replay, and a second continue writes nothing", () => {
    const dir = tempDir();
    const script = join(import.meta.dirname, "fixtures", "entity-process.ts");
    const run = (phase: string) =>
      JSON.parse(
        execFileSync(process.execPath, ["--experimental-strip-types", script, phase, dir], {
          encoding: "utf8",
        }),
      );
    const created = run("create");
    expect(created.violations).toEqual([]);
    expect(created.locus).toEqual({
      current: FIXTURE_LOCUS_ID,
      origin: FIXTURE_LOCUS_ID,
      transitioned: false,
    });
    const loaded = run("load");
    expect(loaded.violations).toEqual([]);
    expect(loaded.summary).toEqual(created.summary);
    expect(loaded.locus).toEqual(created.locus);
    const cont = run("continue");
    expect(cont.violations).toEqual([]);
    expect(cont.afterReplay).toEqual(cont.after);
    expect(cont.replayed).toBe(true);
    // nothing but the transition (and its reader and the kernel records) appeared; the entity is byte-untouched
    expect(cont.before.transitions).toEqual([]);
    expect(cont.after.transitions.map((f: any) => f.key)).toEqual([transitionKeyOf(REQ_1)]);
    expect(cont.after.entities).toEqual(cont.before.entities);
    expect(cont.after.production).toEqual(cont.before.production);
    expect(cont.after.canonical).toEqual(cont.before.canonical);
    expect(cont.locus).toEqual({
      current: DEST_LOCUS_ID,
      origin: FIXTURE_LOCUS_ID,
      transitioned: true,
    });
    // a fresh process after the continue sees the same single transition
    const last = run("load");
    expect(last.violations).toEqual([]);
    expect(last.summary.transitions).toEqual(cont.after.transitions);
    expect(last.locus).toEqual(cont.locus);
  }, 120_000);
});
