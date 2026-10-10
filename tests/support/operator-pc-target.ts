/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign's store to simulate refused stages */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAYER_CHOICE_AUTHORITY,
  gipInstrumentKey,
  type CanonicalTime,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcHeldTargetAdvanceContext,
  bindTrustedActivePcTargetAdvanceContext,
} from "@immortalis/protocol";
import {
  ledgerFileName,
  type LocalOperatorSession as Session,
  type SessionParams,
} from "@immortalis/operator";
import { ACTOR_FIXTURE_EXTENSION, FIXTURE_CAMPAIGN, INSTRUMENT_A } from "@immortalis/testkit";
import { SUNSET_MID } from "./gip-sunset.ts";
import { PC } from "./pc-movement.ts";
import {
  refuseGipStageOf,
  stationarySunsetPcCampaign,
  type StationarySunsetSetup,
} from "./pc-target-advance.ts";
import { tempDir } from "./tmp.ts";

/**
 * TEST SUPPORT for the operator's active-PC target commands. Every owner is the REAL one and every world fact is committed through
 * its own owner path before the command runs: the handover, the PC's custody, and GIP's institution, office, Scope Binding and
 * `active` sunset-bearing Instrument (with its Temporal registration). Nothing here supplies an `expired` lifecycle, a Temporal
 * verdict, a status or a confirmation: the scripted console only TYPES in answer to the printed challenge, and the operator is
 * never given a field with which to name an owner result.
 */

/**
 * A CLOSED campaign directory: the active PC stationary at its origin (post-handover custody), no movement begun, one institution,
 * one office, one Scope Binding and one ACTIVE Instrument established through GIP with `sunset` as its exact term and registered
 * with the Temporal kernel (or, as `setup`, left in GIP's crash window with the registration lost). Canonical time stands at the
 * fixture basis (100). Nothing about the lifecycle is `expired`.
 */
export async function gipSunsetPcTemplate(
  sunset: CanonicalTime = SUNSET_MID,
  setup: StationarySunsetSetup = "registered",
): Promise<string> {
  const dir = tempDir("immortalis-operator-pc-target-");
  const s = await stationarySunsetPcCampaign(sunset, setup, dir);
  await s.campaign.close();
  return dir;
}

export const lifecycleOf = (s: Pick<Session, "campaign">): string =>
  (s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!.value as GovernanceInstrument)
    .lifecycle_status;

export const instrumentVersion = (s: Pick<Session, "campaign">): number =>
  s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!.version;

export const canonicalTimeOf = (s: Pick<Session, "campaign">): CanonicalTime =>
  (s.campaign.store.getFact("temporal/state")!.value as any).canonical_time;

/** The retained-intent file as the trusted side wrote it (read by the test, never by the mechanism under test). */
export const ledgerPath = (dirs: { operatorDir: string }): string =>
  join(dirs.operatorDir, ledgerFileName(FIXTURE_CAMPAIGN));
export const readLedger = (dirs: { operatorDir: string }): any =>
  JSON.parse(readFileSync(ledgerPath(dirs), "utf8"));

/** The canonical state hash of an opened session's campaign. */
export const stateHash = (s: Pick<Session, "campaign">): string =>
  s.campaign.store.head().state_sha256;

const MATERIAL = {
  basis: "local-operator-confirmed-choice",
  secrecy: "local-operator-session",
};

/** The transaction material the service is documented to author, written out independently of the mechanism. */
export const referenceTransaction = (kind: "advance" | "resume", uid: string) => ({
  transaction_id: `operator-pc-target-${kind}:${uid}`,
  cause: `operator-pc-target-${kind}-cause:${uid}`,
  trigger: { kind: `operator-pc-target-${kind}-choice`, ref: `operator-confirmation:${uid}` },
  context: { ...PLAYER_CHOICE_AUTHORITY },
  publication: { ...MATERIAL },
});

export type GatewayStep = {
  /** the transaction material, written independently of the mechanism under test (override any field to differ) */
  readonly transaction: ReturnType<typeof referenceTransaction>;
  readonly target: CanonicalTime;
  /** a resume of this held transaction; absent for an initial choice */
  readonly from?: string;
  /** refuse GIP's expiry stage through the store for this step (a genuine kernel hold) */
  readonly hold?: boolean;
};

/**
 * Drives the UNCHANGED gateway directly on a closed campaign, committing whatever transaction material the test states. Returns
 * the final canonical state hash. A "restored campaign" holding a record under an identity the operator's retained intent does NOT
 * describe is built this way. Every step must commit.
 */
export async function driveGateway(
  campaignDir: string,
  steps: readonly GatewayStep[],
): Promise<string> {
  const opened = await CanonicalCampaign.open(campaignDir, {
    buildId: "operator-pc-target-reference",
    extension: ACTOR_FIXTURE_EXTENSION,
  });
  if (!opened.ok) throw new Error("reference campaign did not open");
  const campaign = opened.value;
  for (const [n, step] of steps.entries()) {
    const restore = step.hold ? refuseGipStageOf({ campaign }) : () => undefined;
    const outcome = await advanceActivePcToTarget(
      step.from === undefined
        ? bindTrustedActivePcTargetAdvanceContext({
            campaign,
            pc_id: PC,
            target: step.target,
            transaction: step.transaction,
          })
        : bindTrustedActivePcHeldTargetAdvanceContext({
            campaign,
            pc_id: PC,
            held: { from_transaction: step.from, target: step.target },
            transaction: step.transaction,
          }),
      { operation: "advance_active_pc_to_target" },
    );
    restore();
    if (!outcome.ok) throw new Error(`the reference step ${n} did not commit`);
  }
  const hash = campaign.store.head().state_sha256;
  await campaign.close();
  return hash;
}

export type { SessionParams };
