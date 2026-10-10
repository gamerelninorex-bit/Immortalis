/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and swap the campaign's store to simulate refused stages */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PLAYER_CHOICE_AUTHORITY,
  gipInstrumentKey,
  type CanonicalTime,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import { CanonicalCampaign, type StageOwnerExtension } from "@immortalis/engine";
import {
  advanceNullPcOocToTarget,
  bindTrustedNullPcOocHeldContinuationContext,
  bindTrustedNullPcOocTargetAdvanceContext,
  resumeNullPcOocHeldAdvance,
} from "@immortalis/protocol";
import {
  ledgerFileName,
  LocalOperatorSession,
  type LocalOperatorSession as Session,
  type SessionParams,
} from "@immortalis/operator";
import { FIXTURE_CAMPAIGN, INSTRUMENT_A, LOGISTICS_FIXTURE_EXTENSION } from "@immortalis/testkit";
import { acceptCommitDispatchRegister } from "./logistics.ts";
import { establishSunset, seededSunsetCampaign, sunsetInstrument } from "./gip-sunset.ts";
import { seededNullPcCampaign, PROD_T1 } from "./null-pc-advance.ts";
import { tempDir } from "./tmp.ts";

/**
 * TEST SUPPORT for the operator's NULL-PC OOC commands. Every owner is the REAL one and every world fact is committed through
 * its own owner path: the GIP institution, office, Scope Binding and `active` sunset-bearing Instrument (with the Temporal
 * registration) through GIP's own adapter, and the Logistics chain through the Logistics owner. Nothing here supplies an
 * `expired` lifecycle, a Temporal verdict, a status or a confirmation: the scripted console only TYPES in answer to the printed
 * challenge, and the operator is never given a field with which to name an owner result.
 */
export { PROD_T1 };

export const nullSessionParams = (
  dirs: { campaignDir: string; operatorDir: string },
  extension?: StageOwnerExtension,
  over: Partial<SessionParams> = {},
): SessionParams => ({
  campaignDir: dirs.campaignDir,
  operatorDir: dirs.operatorDir,
  expectedCampaignId: FIXTURE_CAMPAIGN,
  ...(extension ? { extension } : {}),
  ...over,
});

export async function openNull(
  dirs: { campaignDir: string; operatorDir: string },
  extension?: StageOwnerExtension,
  over: Partial<SessionParams> = {},
): Promise<Session> {
  const opened = await LocalOperatorSession.open(nullSessionParams(dirs, extension, over));
  if (!opened.ok) throw new Error(`session did not open: ${JSON.stringify(opened.error)}`);
  return opened.value;
}

/**
 * A CLOSED NULL-PC campaign (no PC is ever released or bound) holding one institution, one office, one Scope Binding and one
 * ACTIVE Instrument established through GIP with `sunset` as its exact term and registered with the Temporal kernel. Canonical
 * time stands at SUNSET_START (100) in the fixture unit. Nothing about the lifecycle is `expired`.
 */
export async function gipSunsetNullTemplate(sunsetAt?: CanonicalTime): Promise<string> {
  const dir = tempDir("immortalis-operator-null-gip-");
  const s = await seededSunsetCampaign(dir);
  await establishSunset(s, 4, sunsetAt ? sunsetInstrument(INSTRUMENT_A, sunsetAt) : undefined);
  await s.campaign.close();
  return dir;
}

/**
 * A CLOSED NULL-PC campaign whose registered Temporal work is one real Logistics transfer (accepted, committed, dispatched and
 * registered through the Logistics owner) with a delivery boundary at PROD_T1, so a NULL-PC advance to PROD_T1 engages the real
 * Logistics delivery → World-State destination → Logistics retirement chain.
 */
export async function logisticsNullTemplate(): Promise<string> {
  const dir = tempDir("immortalis-operator-null-log-");
  const s = await seededNullPcCampaign(dir);
  await acceptCommitDispatchRegister(s);
  await s.campaign.close();
  return dir;
}

export const LOGISTICS_EXTENSION = LOGISTICS_FIXTURE_EXTENSION;

export const lifecycleOf = (s: Pick<Session, "campaign">): string =>
  (s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!.value as GovernanceInstrument)
    .lifecycle_status;

export const instrumentVersion = (s: Pick<Session, "campaign">): number =>
  s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!.version;

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
  transaction_id: `operator-null-${kind}:${uid}`,
  cause: `operator-null-${kind}-cause:${uid}`,
  trigger: { kind: `operator-null-pc-${kind}-choice`, ref: `operator-confirmation:${uid}` },
  context: { ...PLAYER_CHOICE_AUTHORITY },
  publication: { ...MATERIAL },
});

/**
 * The same choices driven by the UNCHANGED gateways directly. Returns the final canonical state hash: the mechanism must add
 * nothing to, and omit nothing from, canon. `between` runs after the first gateway call (to lift an injected fault).
 */
export async function referenceNull(
  dirs: { campaignDir: string },
  extension: StageOwnerExtension | undefined,
  steps: readonly (
    | { kind: "advance"; uid: string; target: CanonicalTime }
    | { kind: "resume"; uid: string; from: string; target: CanonicalTime }
  )[],
  hooks: {
    prepare?: (campaign: CanonicalCampaign) => void;
    between?: (campaign: CanonicalCampaign, step: number) => void;
  } = {},
): Promise<string> {
  const opened = await CanonicalCampaign.open(dirs.campaignDir, {
    buildId: "operator-null-reference",
    ...(extension ? { extension } : {}),
  });
  if (!opened.ok) throw new Error("reference campaign did not open");
  const campaign = opened.value;
  hooks.prepare?.(campaign);
  let n = 0;
  for (const step of steps) {
    const outcome =
      step.kind === "advance"
        ? await advanceNullPcOocToTarget(
            bindTrustedNullPcOocTargetAdvanceContext({
              campaign,
              target: step.target,
              transaction: referenceTransaction("advance", step.uid),
            }),
            { operation: "advance_null_pc_ooc_to_target" },
          )
        : await resumeNullPcOocHeldAdvance(
            bindTrustedNullPcOocHeldContinuationContext({
              campaign,
              held: { from_transaction: step.from, target: step.target },
              transaction: referenceTransaction("resume", step.uid),
            }),
            { operation: "resume_null_pc_ooc_held_advance" },
          );
    if (!outcome.ok) throw new Error(`the reference step ${n} did not commit`);
    hooks.between?.(campaign, n++);
  }
  const hash = campaign.store.head().state_sha256;
  await campaign.close();
  return hash;
}
