/* eslint-disable @typescript-eslint/no-explicit-any -- raw owner readback */
// MECHANISM ONLY (real owners and the real active-PC advance gateway the chat adapter's `collect-finish` drives; the producer's opening is
// seeded through its own owner adapter as a disposable test premise). One bounded independent world consequence through an
// ALREADY-LAWFUL causal producer: a Governance Instrument with an exact sunset, enrolled with the Temporal kernel, is expired by GIP's own
// stage when canonical time reaches the sunset. No player request names, authors or schedules the expiry. The Production owner's own closure
// rule WITHHOLDS a gathering whose interval contains another process's due boundary (the event is never suppressed or skipped to keep the
// gathering simple); the event resolves at its instant on a lawful advance; the next gathering is exactly what the owners compute; nothing the
// player is shown mentions it. (The chat route cannot compose an operator-authored opening: see docs/gm-led-first-play.md L9.) This is NOT a
// generic event or NPC framework and claims no non-PC actor's initiative.
import { beforeAll, describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  OWNER_GIP,
  gipInstrumentKey,
  gipSunsetStage,
  type CanonicalTime,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  GIP_INSTRUMENT_RULE,
  GipAdapter,
  formObservedPacket,
  stageGroupId,
  stageIntentId,
  transactionCause,
  verifyGipIntegrity,
  type CanonicalCampaign,
} from "@immortalis/engine";
import {
  INSTITUTION_COURT,
  INSTRUMENT_A,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
} from "@immortalis/testkit";
import { chmodSync, cpSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { establishInstitution, establishOffice, establishScopeBinding } from "../support/gip.ts";
import { establishSunset, sunsetInstrument } from "../support/gip-sunset.ts";
import { openOrdinary, type LocalityDirs } from "../support/locality.ts";
import { BASIS, PC_ID } from "../support/observation.ts";
import {
  SALT_TAU,
  collectAndComplete,
  decideOutcome,
  originalCollectionCampaign,
} from "../support/pc-collection-original.ts";
import { pcTargetTransaction } from "../support/pc-target-advance.ts";
import { GLANCE_REQUEST } from "../support/protocol.ts";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
} from "@immortalis/protocol";

const at = (value: number): CanonicalTime => ({ unit: BASIS.unit, value });
// three handfuls end at BASIS + 3 * tau; the first is done at BASIS + tau
const END = at(BASIS.value + 3 * SALT_TAU);
const MID = at(BASIS.value + SALT_TAU + 3); // inside the second handful
const BEYOND = at(BASIS.value + 1000);

let master: LocalityDirs;
beforeAll(async () => {
  master = (await originalCollectionCampaign()).dirs;
}, 300_000);

function copy(): LocalityDirs {
  const root = dirname(master.campaignDir);
  const to = join(dirname(root), `copy-${Math.random().toString(36).slice(2)}`);
  cpSync(root, to, { recursive: true });
  const priv = (d: string): void => {
    chmodSync(d, 0o700);
    for (const e of readdirSync(d, { withFileTypes: true }))
      if (e.isDirectory()) priv(join(d, e.name));
  };
  priv(to);
  return {
    campaignDir: join(to, master.campaignDir.slice(root.length + 1)),
    operatorDir: join(to, master.operatorDir.slice(root.length + 1)),
  };
}

/** the producer's opening: an institution, an office, a Scope Binding and ONE active Instrument with an exact sunset, registered with the kernel */
async function seeded(sunset: CanonicalTime) {
  const dirs = copy();
  const campaign = await openOrdinary(dirs.campaignDir);
  const gip = new GipAdapter(campaign.store);
  await establishInstitution({ gip }, 1, INSTITUTION_COURT);
  await establishOffice({ gip }, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishScopeBinding({ gip }, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
  await establishSunset({ gip }, 4, sunsetInstrument(INSTRUMENT_A, sunset));
  return { dirs, campaign };
}

const status = (c: CanonicalCampaign) => {
  const f = c.store.getFact(gipInstrumentKey(INSTRUMENT_A))!;
  return { version: f.version, status: (f.value as any).lifecycle_status as string };
};
const reserve = (c: CanonicalCampaign) =>
  (c.store.listFacts().find((f) => f.key.startsWith("production/reserve/"))!.value as any).quantity
    .amount as number;
const timeOf = (c: CanonicalCampaign) =>
  (c.store.getFact("temporal/state")!.value as any).canonical_time.value as number;
const index = (c: CanonicalCampaign) =>
  (c.store.getFact("temporal/boundary-index")?.value as any)?.entries ?? [];

describe("an independent consequence the player never asked for", () => {
  it("a due independent event is never suppressed to keep a gathering simple: the clashing gather is withheld, the event resolves at its instant through a lawful advance, and the next gathering is exact", async () => {
    const { campaign } = await seeded(MID);
    try {
      expect(status(campaign)).toEqual({ version: 1, status: "active" });
      expect(index(campaign)).toHaveLength(1);
      expect(timeOf(campaign)).toBe(BASIS.value);

      // 1. a gathering whose interval contains the sunset: the owner's closure does not cover an interval in which another process falls
      //    due, so the class WITHHOLDS. Nothing is debited or credited, no time passes, and the event is neither skipped nor hidden.
      await expect(collectAndComplete(campaign, "act-clash", 3, "tx-clash", END)).rejects.toThrow(
        /start was refused/,
      );
      expect(reserve(campaign)).toBe(0);
      expect(timeOf(campaign)).toBe(BASIS.value);
      expect(status(campaign)).toEqual({ version: 1, status: "active" });
      expect(index(campaign)).toHaveLength(1);

      // 2. time then passes through a lawful advance that does not author the event: the producer's own stage expires the Instrument once,
      //    AT the sunset instant (never at the requested horizon), changing nothing but its lifecycle status
      const target = at(MID.value + 2);
      const advanced = await advanceActivePcToTarget(
        bindTrustedActivePcTargetAdvanceContext({
          campaign,
          pc_id: PC_ID,
          target,
          transaction: pcTargetTransaction("tx-wait") as never,
        }),
        { operation: "advance_active_pc_to_target" },
      );
      expect(advanced.ok).toBe(true);
      expect(timeOf(campaign)).toBe(target.value);
      expect(status(campaign)).toEqual({ version: 2, status: "expired" });
      expect(index(campaign)).toHaveLength(0);
      expect(
        JSON.stringify(
          campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/transaction/")),
        ),
      ).toContain(`"value":${MID.value}`);

      // 3. with nothing else falling due, the gathering is exactly what the owners compute
      await collectAndComplete(
        campaign,
        "act-after",
        3,
        "tx-after",
        at(target.value + 3 * SALT_TAU),
      );
      expect(reserve(campaign)).toBe(3);
      expect(timeOf(campaign)).toBe(target.value + 3 * SALT_TAU);
      expect(status(campaign)).toEqual({ version: 2, status: "expired" });
      expect(verifyGipIntegrity(campaign.store)).toEqual([]);
      expect(campaign.verify()).toEqual([]);

      // the earned Glance (a separate, later look) is silent about it
      const decision = await decideOutcome(campaign, { of: "scene" });
      expect(decision.recorded.ok).toBe(true);
      const record = campaign.store
        .listFacts()
        .find((f) => (f.value as any).operation === "F014D_DIRECT_PERCEPTION")!;
      expect((await formObservedPacket(campaign.store, record.key)).ok).toBe(true);
      const shown = readCurrentObservationGlance(
        bindTrustedCurrentPlayerContext({ view: campaign.store, recipient_id: PC_ID }),
        GLANCE_REQUEST(),
      );
      expect(shown.ok).toBe(true);
      expect(JSON.stringify(shown)).not.toMatch(
        /sunset|expire|instrument|institution|office|magistrate|governance/i,
      );
    } finally {
      await campaign.close();
    }
  }, 300_000);

  it("no cause, no consequence: a sunset beyond the work's end leaves the Instrument active with its boundary intact", async () => {
    const { campaign } = await seeded(BEYOND);
    try {
      await collectAndComplete(campaign, "act-beyond", 3, "tx-beyond", END);
      expect(reserve(campaign)).toBe(3);
      expect(status(campaign)).toEqual({ version: 1, status: "active" });
      expect(index(campaign)).toHaveLength(1);
      expect(verifyGipIntegrity(campaign.store)).toEqual([]);
    } finally {
      await campaign.close();
    }
  }, 300_000);

  it("a hand-written expiry is refused - with or without the producer's stage identity - because the only cause of expiry is the earned boundary", async () => {
    const { campaign } = await seeded(BEYOND);
    try {
      const head = campaign.store.head();
      const fact = campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!;
      const office = campaign.store.getFact(
        `gip/institution/${INSTITUTION_COURT}/office/${OFFICE_MAGISTRATE}`,
      )!;
      const binding = campaign.store.getFact(
        `gip/institution/${INSTITUTION_COURT}/office/${OFFICE_MAGISTRATE}/scope-binding/${SCOPE_BINDING_A}`,
      )!;
      let n = 0;
      for (const identity of [true, false]) {
        n++;
        const stage = gipSunsetStage(INSTRUMENT_A);
        const group: CommitGroup = {
          campaign_id: campaign.store.head().campaign_id,
          group_id: identity ? stageGroupId(stage) : `forged-g-${n}`,
          intent_id: identity ? stageIntentId(stage) : `forged-i-${n}`,
          owner: OWNER_GIP,
          facet: "gip_institution_identity",
          cause: identity ? transactionCause("tx-forged") : `forged-c-${n}`,
          rule: GIP_INSTRUMENT_RULE,
          authority: { ...CANON_WRITE_AUTHORITY },
          reads: [
            { key: office.key, version: office.version },
            { key: binding.key, version: binding.version },
          ],
          depends_on: [office.provenance.group_id, binding.provenance.group_id],
          writes: [
            {
              key: fact.key,
              owner: OWNER_GIP,
              facet: "gip_institution_identity",
              value: { ...(fact.value as object), lifecycle_status: "expired" } as never,
              unit: null,
              basis: fact.basis,
              secrecy: fact.secrecy,
              expected_version: 1,
            },
          ],
        };
        expect((await campaign.store.commit(group)).ok, `identity ${identity}`).toBe(false);
      }
      expect(campaign.store.head()).toEqual(head);
      expect(status(campaign)).toEqual({ version: 1, status: "active" });
    } finally {
      await campaign.close();
    }
  }, 300_000);
});
