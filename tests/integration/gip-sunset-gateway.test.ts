/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// GIP Governance Instrument Sunset (sunset slice) — the existing player-authorized NULL-PC OOC target advance gateway drives the
// earned-boundary close. No new request authority exists: the pair stays `role.player` + `permission.player_choice.commit`, the
// target is the player's explicit choice, and the kernel alone selects what is due. A known-unregistered sunset is never crossed
// and never reported as success: the gateway's one refusal is the only difference the host can see.
// Register lineage: IA-04, IA-06 (partial); RC-05/15/16; IM-02, IM-06, IM-15, IM-16.
import { describe, expect, it } from "vitest";
import {
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  gipSunsetStage,
  temporalTransactionKey,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import { INSTRUMENT_A } from "@immortalis/testkit";
import {
  NULL_PC_COMMITTED,
  NULL_PC_REFUSAL,
  advanceNull,
  nullPcTransaction,
  trustedNullPcAdvance,
} from "../support/null-pc-advance.ts";
import {
  SUNSET_AT,
  SUNSET_LATER,
  SUNSET_MID,
  establishSunset,
  instrumentOf,
  seededPendingSunset,
  seededSunsetCampaign,
} from "../support/gip-sunset.ts";
import { tempDir } from "../support/tmp.ts";

const lifecycle = (s: Parameters<typeof instrumentOf>[0]) =>
  (instrumentOf(s)!.value as GovernanceInstrument).lifecycle_status;
const time = (s: Parameters<typeof instrumentOf>[0]) =>
  TemporalStateSchema.parse(s.campaign.store.getFact(TEMPORAL_STATE_KEY)!.value).canonical_time;

describe("the player-authorized NULL-PC OOC advance reaches the sunset through the real GIP stage provider", () => {
  it("a target short of the sunset commits and expires nothing; a target past it commits and expires the Instrument once, at the sunset", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    expect(
      await advanceNull(
        trustedNullPcAdvance(s, { target: SUNSET_MID, transaction: nullPcTransaction("tx-mid") }),
      ),
    ).toEqual(NULL_PC_COMMITTED);
    expect(lifecycle(s)).toBe("active");
    expect(time(s)).toEqual(SUNSET_MID);

    expect(
      await advanceNull(
        trustedNullPcAdvance(s, {
          target: SUNSET_LATER,
          transaction: nullPcTransaction("tx-late"),
        }),
      ),
    ).toEqual(NULL_PC_COMMITTED);
    expect(lifecycle(s)).toBe("expired");
    expect(instrumentOf(s)!.version).toBe(2);
    expect(time(s)).toEqual(SUNSET_LATER);
    const tx = s.campaign.store.getFact(temporalTransactionKey("tx-late"))!.value as any;
    expect(tx.context).toEqual({
      role: "role.player",
      permission: "permission.player_choice.commit",
    });
    expect(tx.requested).toEqual({ target: SUNSET_LATER, condition: null });
    expect(tx.stages.map((x: any) => x.stage)).toEqual([gipSunsetStage(INSTRUMENT_A)]);
    expect(tx.boundaries_crossed.map((b: any) => b.at)).toEqual([SUNSET_AT]);
    expect(s.campaign.verify()).toEqual([]);

    // retry by identity: nothing is written twice
    const head = s.campaign.store.head();
    expect(
      await advanceNull(
        trustedNullPcAdvance(s, {
          target: SUNSET_LATER,
          transaction: nullPcTransaction("tx-late"),
        }),
      ),
    ).toEqual(NULL_PC_COMMITTED);
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("the gateway never crosses a known-unregistered sunset and never reports success: it refuses with the one generic refusal, then succeeds once the enrollment is completed", async () => {
    const s = await seededPendingSunset(tempDir());
    const head = s.campaign.store.head();
    const refused = await advanceNull(
      trustedNullPcAdvance(s, { target: SUNSET_LATER, transaction: nullPcTransaction("tx-late") }),
    );
    expect(JSON.stringify(refused)).toBe(NULL_PC_REFUSAL);
    expect(s.campaign.store.head()).toEqual(head);
    expect(time(s)).not.toEqual(SUNSET_LATER);
    expect(lifecycle(s)).toBe("active");

    await s.gip.completeSunsetEnrollment({
      group_id: "complete-g",
      intent_id: "complete-i",
      cause: "complete-c",
      basis: "b",
      secrecy: "s",
    });
    expect(
      await advanceNull(
        trustedNullPcAdvance(s, {
          target: SUNSET_LATER,
          transaction: nullPcTransaction("tx-late"),
        }),
      ),
    ).toEqual(NULL_PC_COMMITTED);
    expect(lifecycle(s)).toBe("expired");
  });

  it("the transaction authority is never the host's: a role/permission other than the player pair yields an inert context and the generic refusal", async () => {
    const s = await seededSunsetCampaign(tempDir());
    await establishSunset(s);
    const head = s.campaign.store.head();
    const context = { role: "role.archivist", permission: "permission.canon.write" };
    const refused = await advanceNull(
      trustedNullPcAdvance(s, {
        target: SUNSET_LATER,
        transaction: nullPcTransaction("tx-x", { context }),
      }),
    );
    expect(JSON.stringify(refused)).toBe(NULL_PC_REFUSAL);
    expect(s.campaign.store.head()).toEqual(head);
    expect(lifecycle(s)).toBe("active");
  });
});
