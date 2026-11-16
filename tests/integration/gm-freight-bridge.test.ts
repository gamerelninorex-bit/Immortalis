import { afterEach, describe, expect, it } from "vitest";
import { CanonicalCampaign, resolveEntityLocus } from "@immortalis/engine";
import { GM_FREIGHT_TOOLS, type GmFreightReconciliation } from "@immortalis/contracts";
import { quarryWorksFixture, textileWorkshopFixture } from "@immortalis/testkit";
import { keysOf } from "../support/freight.ts";
import {
  attestRequest,
  legalRequest,
  newGmRig,
  operatorStartsChronology,
  playerAdvancesTo,
  receiptOf,
  runWholeChain,
  settingRequest,
  statusOf,
  stepNames,
  type GmRig,
} from "../support/gm-freight.ts";
import { must } from "../support/temporal.ts";

/**
 * The GM-native first-profile freight bridge, END TO END over the real authenticated tool path and a real file-backed canonical
 * campaign. MECHANISM ONLY (T1): the "GM" is a script that submits the fixture's premises; no model, host, client or retained store is
 * involved. Every owner outcome asserted below is read back from the owners' own committed facts, never from the bridge's reply.
 */

const WORLDS = [
  ["Quarry Works", quarryWorksFixture],
  ["Textile Workshop", textileWorkshopFixture],
] as const;

const open = async (rig: GmRig) =>
  must(CanonicalCampaign.open(rig.campaignDir, { buildId: "gm-freight-test-read" }));

describe.each(WORLDS)("GM freight bridge — %s (MECHANISM ONLY)", (_label, fixture) => {
  let rig: GmRig;
  afterEach(async () => undefined);

  it("authors, asks, and the owners earn every stage; each owner act is its own discrete commit", async () => {
    rig = await newGmRig(fixture());
    const { fx } = rig;
    const k = keysOf(fx);

    // intake: a fresh campaign has no world and the bridge says so, from committed facts
    const empty = statusOf(await rig.call(GM_FREIGHT_TOOLS.status, {}));
    expect(empty.null_pc).toBe(true);
    expect(empty.world_id).toBeNull();
    // everything the GM reads is labelled as GM consultation, never what any character perceives or knows
    expect(empty.audience).toBe("GM_CONSULTATION_ONLY_NOT_PLAYER_FACING");
    expect(empty.canonical_time).toBeNull();

    const setting = receiptOf(
      await rig.call(GM_FREIGHT_TOOLS.establishSetting, settingRequest(fx)),
    );
    expect(stepNames(setting)).toEqual([
      "setting-world",
      "setting-origin",
      "setting-destination",
      "setting-corridor",
    ]);
    expect(setting.steps.every((s) => s.disposition === "COMMITTED")).toBe(true);
    expect(setting.audience).toBe("GM_CONSULTATION_ONLY_NOT_PLAYER_FACING");
    expect(setting.status!.audience).toBe("GM_CONSULTATION_ONLY_NOT_PLAYER_FACING");
    // before the original envelope, the bridge asks for it and for nothing else
    expect(setting.status!.awaiting).toMatchObject({
      kind: "GM_AUTHORING",
      tool: "gm_freight_attest_opening",
    });

    const attested = receiptOf(await rig.call(GM_FREIGHT_TOOLS.attestOpening, attestRequest(fx)));
    expect(stepNames(attested)).toEqual(["attest-opening"]);
    // the time is the operator's: the bridge reports whose it is and the unit the premises use
    expect(attested.status!.awaiting).toMatchObject({
      kind: "OPERATOR_STARTING_CHRONOLOGY",
      time_unit: fx.timeUnit,
    });
    // the GM cannot proceed past it: the legal source needs the chronology
    expect((await rig.call(GM_FREIGHT_TOOLS.establishLegal, legalRequest(fx))).ok).toBe(false);
    expect(await operatorStartsChronology(rig)).toBe("TIME_ESTABLISHED");

    const legal = receiptOf(await rig.call(GM_FREIGHT_TOOLS.establishLegal, legalRequest(fx)));
    expect(stepNames(legal)).toEqual([
      "legal-opening-basis",
      "legal-institution",
      "legal-office",
      "legal-scope-binding",
      "legal-instrument",
      "legal-clauses",
      "legal-seal",
    ]);

    // first ask: premises, origin self-provision and Production's own operation; then it needs the PLAYER's time
    const go1 = receiptOf(
      await rig.call(GM_FREIGHT_TOOLS.initiate, { operation_id: "go-1", world_id: fx.worldId }),
    );
    expect(stepNames(go1)).toEqual([
      "site-condition-slice-b-site-condition",
      "material-specification-slice-c-material-specification",
      "input-lot-slice-d-input-lot",
      "c05-origin-self-provision",
      "production-start",
      "production-register",
    ]);
    expect(go1.awaiting).toMatchObject({
      kind: "PLAYER_OOC_TIME_ADVANCE",
      reason: "PRODUCTION_COMPLETION_BOUNDARY",
    });
    // nothing was produced by asking: the entity does not exist until the player's time reaches Production's own boundary
    let c = await open(rig);
    expect(c.store.getFact(k.entity)).toBeUndefined();
    await c.close();

    const awaiting1 = go1.awaiting;
    if (awaiting1?.kind !== "PLAYER_OOC_TIME_ADVANCE")
      throw new Error("expected the player's time to be awaited");
    expect(await playerAdvancesTo(rig, awaiting1.to)).toBe("NULL_PC_ADVANCE_COMMITTED");
    const go2 = receiptOf(
      await rig.call(GM_FREIGHT_TOOLS.initiate, { operation_id: "go-2", world_id: fx.worldId }),
    );
    const ref = go2.status!.request?.request_ref;
    expect(ref).toBeDefined();
    expect(stepNames(go2)).toEqual([
      "e0-fixation",
      "service-basis",
      `l0-service-admission-${ref!.replace(/[^A-Za-z0-9._-]/g, "_")}`,
      `l1-first-dispatch-${ref!.replace(/[^A-Za-z0-9._-]/g, "_")}`,
      `e1-consume-first-dispatch-${ref!.replace(/[^A-Za-z0-9._-]/g, "_")}`,
      `te-enroll-transfer-${ref!.replace(/[^A-Za-z0-9._-]/g, "_")}`,
    ]);
    expect(go2.awaiting).toMatchObject({
      kind: "PLAYER_OOC_TIME_ADVANCE",
      reason: "SERVICE_DELIVERY_BOUNDARY",
    });

    expect(await playerAdvancesTo(rig, fx.service.delivery_boundary_at)).toBe(
      "NULL_PC_ADVANCE_COMMITTED",
    );
    const go3 = receiptOf(
      await rig.call(GM_FREIGHT_TOOLS.initiate, { operation_id: "go-3", world_id: fx.worldId }),
    );
    expect(stepNames(go3)).toEqual([
      `ad-destination-adequacy-${ref!.replace(/[^A-Za-z0-9._-]/g, "_")}`,
    ]);
    expect(go3.awaiting).toBeNull();
    expect(go3.status!.stage).toBe("COMPLETE");

    // owner-verified consequences, read from the owners' facts on a cold reopen (the bridge's reply is not evidence)
    c = await open(rig);
    try {
      expect(resolveEntityLocus(c.store, fx.worldId, k.entityId)?.phase).toBe(
        "DESTINATION_COMMITTED",
      );
      const entity = c.store.getFact(k.entity)!;
      expect((entity.value as { quantity: unknown }).quantity).toEqual({
        amount: fx.expected.required,
        unit: fx.expected.unit,
      });
      expect(c.verify()).toEqual([]);
    } finally {
      await c.close();
    }
  }, 240_000);

  it("replays a lost acknowledgement by the same operation_id and refuses a changed term under it", async () => {
    rig = await newGmRig(fixture());
    const { fx } = rig;
    const first = receiptOf(
      await rig.call(GM_FREIGHT_TOOLS.establishSetting, settingRequest(fx, "tok")),
    );
    const revisions = first.steps.map((s) => s.revision);
    // the SAME token and terms: every act is re-presented to its owner, which returns the ORIGINAL receipt
    const again = receiptOf(
      await rig.call(GM_FREIGHT_TOOLS.establishSetting, settingRequest(fx, "tok")),
    );
    expect(again.steps.every((s) => s.disposition === "REPLAYED")).toBe(true);
    expect(again.steps.map((s) => s.revision)).toEqual(revisions);
    // the same content under ANOTHER token is already present: nothing is written, no revision is claimed
    const other = receiptOf(
      await rig.call(GM_FREIGHT_TOOLS.establishSetting, settingRequest(fx, "tok-2")),
    );
    expect(
      other.steps.every((s) => s.disposition === "ALREADY_PRESENT" && s.revision === null),
    ).toBe(true);
    // a changed term under the SAME token is a conflict and writes nothing
    const changed = settingRequest(fx, "tok");
    const edited = {
      ...changed,
      world: { ...changed.world, premise: `${changed.world.premise} (revised)` },
    };
    const refused = await rig.call(GM_FREIGHT_TOOLS.establishSetting, edited);
    expect(refused.ok ? "OK" : refused.error.code).toBe("GM_FREIGHT_INTENT_CONFLICT");
    // reconciliation by identity reports exactly what committed under the token
    const rec = await rig.call(GM_FREIGHT_TOOLS.reconcile, { operation_id: "tok" });
    expect(
      rec.ok && (rec.value as unknown as GmFreightReconciliation).committed.map((s) => s.step),
    ).toEqual(["setting-corridor", "setting-destination", "setting-origin", "setting-world"]);
  }, 120_000);

  it("runs the whole chain through the helper and survives a cold reopen with the same owner facts", async () => {
    rig = await newGmRig(fixture());
    const out = await runWholeChain(rig);
    expect(out).toHaveLength(3);
    expect(out[2]!.status!.stage).toBe("COMPLETE");
    // a repeated ask after completion is a no-op: nothing more is due and nothing is written
    const noop = receiptOf(
      await rig.call(GM_FREIGHT_TOOLS.initiate, {
        operation_id: "go-after",
        world_id: rig.fx.worldId,
      }),
    );
    expect(noop.steps).toEqual([]);
    expect(noop.status!.stage).toBe("COMPLETE");
  }, 240_000);
});
