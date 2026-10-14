// TEST SUPPORT for the ORIGINAL active-PC target-only temporal advance. The campaign is built ONLY by owner paths that already ship:
// `establish-locality` commits the world and locus, `author-character` releases and binds the character, `establish-character-locus`
// has World-State commit the qualified custody (each referee-qualified by the scripted host: plumbing only, proving no semantic
// result), then GIP's own adapter commits its institution, office, Scope Binding and `active` sunset-bearing Instrument (and its
// Temporal registration) and the Temporal owner establishes canonical time. Nothing here authors `expired`, a due flag, a stage, a
// custody or a verdict: the sunset instant is the Instrument's own declared term and the host's request is the operation name only.
import { expect } from "vitest";
import { GipAdapter, TemporalCoordinator, type CanonicalCampaign } from "@immortalis/engine";
import type { CanonicalTime } from "@immortalis/contracts";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcHeldTargetAdvanceContext,
  bindTrustedActivePcTargetAdvanceContext,
} from "@immortalis/protocol";
import {
  INSTITUTION_COURT,
  INSTRUMENT_A,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
  gipPublication,
  governanceInstrument,
  temporalPublication,
} from "@immortalis/testkit";
import { establishInstitution, establishOffice, establishScopeBinding } from "./gip.ts";
import { at, registrationLost, sunsetInstrument } from "./gip-sunset.ts";
import { LOCALITY_CAMPAIGN, openOrdinary, type LocalityDirs } from "./locality.ts";
import { PC_ID } from "./original-pc.ts";
import { boundCampaign, establishLocus, locusConsole } from "./original-pc-locus.ts";
import { movementProviders } from "./pc-movement.ts";
import { pcTargetTransaction, PC_TARGET_REQUEST, PC_TARGET_TX } from "./pc-target-advance.ts";
import { must } from "./temporal.ts";

export { PC_ID, LOCALITY_CAMPAIGN };

/** The canonical basis the Temporal owner is established at, and the target the player later confirms (fixture time unit). */
export const ORIGIN_TIME = at(100);

export interface OriginalSeeded {
  readonly dirs: LocalityDirs;
  readonly campaign: CanonicalCampaign;
  readonly coordinator: TemporalCoordinator;
}

/** How the sunset-bearing Instrument reaches the campaign. */
export type OriginalSunsetSetup = "registered" | "pending" | "no-sunset";

export const coordinatorOf = (campaign: CanonicalCampaign) =>
  new TemporalCoordinator(campaign.store, movementProviders());

/** Re-opens a campaign directory exactly as any ordinary process would (no fixture owner, no extension). */
export async function reopenOriginal(dirs: LocalityDirs): Promise<OriginalSeeded> {
  const campaign = await openOrdinary(dirs.campaignDir);
  return { dirs, campaign, coordinator: coordinatorOf(campaign) };
}

/**
 * An ORIGINAL character, authored and bound through the shipped command, WITHOUT any physical-locus custody: the campaign the
 * qualified custody is later committed into. No Temporal time, no GIP source and no Instrument exists yet.
 */
export async function boundOriginalCampaign(): Promise<LocalityDirs> {
  return boundCampaign();
}

/** Has World-State commit the qualified original custody through the shipped `establish-character-locus` command. */
export async function qualifyCustody(dirs: LocalityDirs): Promise<void> {
  const { result, terminal } = await establishLocus(dirs, locusConsole());
  expect(result.status, JSON.stringify(result.details) + terminal.said.join("\n")).toBe(
    "LOCUS_ESTABLISHED",
  );
}

/**
 * The original PC campaign with one institution, one office, one Scope Binding of that office and one ACTIVE Instrument whose
 * exact `sunset` term is enrolled with the Temporal kernel (or, as `setup`, left in GIP's crash window, or carrying no sunset),
 * and canonical time established at ORIGIN_TIME. With `custody: false` the character is bound but never given a physical locus.
 */
export async function originalSunsetCampaign(
  sunset: CanonicalTime | null,
  o: { setup?: OriginalSunsetSetup; custody?: boolean } = {},
): Promise<OriginalSeeded> {
  const dirs = await boundOriginalCampaign();
  if (o.custody !== false) await qualifyCustody(dirs);
  const s = await reopenOriginal(dirs);
  const gip = new GipAdapter(s.campaign.store);
  await establishInstitution({ gip }, 1, INSTITUTION_COURT);
  await establishOffice({ gip }, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishScopeBinding({ gip }, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
  await must(
    s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: ORIGIN_TIME }),
  );
  const setup = o.setup ?? "registered";
  if (setup === "no-sunset") {
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrument(
          INSTRUMENT_A,
          INSTITUTION_COURT,
          OFFICE_MAGISTRATE,
          SCOPE_BINDING_A,
        ),
      }),
    );
  } else {
    const input = { ...gipPublication(4), instrument: sunsetInstrument(INSTRUMENT_A, sunset!) };
    if (setup === "registered") await must(gip.establishSunsetInstrument(input));
    else {
      const lost = await new GipAdapter(
        registrationLost(s.campaign.store),
      ).establishSunsetInstrument(input);
      if (lost.ok || lost.error.code !== "UNKNOWN_OUTCOME")
        throw new Error(`the registration was not lost: ${JSON.stringify(lost)}`);
    }
  }
  return s;
}

/** The trusted side's binding after the player's separate choice to advance the original PC's campaign to `target`. */
export const trustedOriginalTarget = (
  s: Pick<OriginalSeeded, "campaign">,
  over: { pc_id?: unknown; target?: unknown; transaction?: unknown; campaign?: unknown } = {},
) =>
  bindTrustedActivePcTargetAdvanceContext({
    campaign: ("campaign" in over ? over.campaign : s.campaign) as never,
    pc_id: ("pc_id" in over ? over.pc_id : PC_ID) as never,
    target: ("target" in over ? over.target : at(300)) as CanonicalTime,
    transaction: ("transaction" in over ? over.transaction : pcTargetTransaction()) as never,
  });

/** The trusted side's binding after the player's NEW choice to continue the held work of `held`. */
export const trustedOriginalHeld = (
  s: Pick<OriginalSeeded, "campaign">,
  over: { pc_id?: unknown; held?: unknown; transaction?: unknown } = {},
  id = "tx-pc-target-resume-2",
) =>
  bindTrustedActivePcHeldTargetAdvanceContext({
    campaign: s.campaign,
    pc_id: ("pc_id" in over ? over.pc_id : PC_ID) as never,
    held: ("held" in over
      ? over.held
      : { from_transaction: PC_TARGET_TX, target: at(300) }) as never,
    transaction: ("transaction" in over ? over.transaction : pcTargetTransaction(id)) as never,
  });

/** The host's call: the operation name and nothing else (unless a hostile test states otherwise). */
export const advanceOriginal = (
  context: ReturnType<typeof trustedOriginalTarget>,
  ...request: [] | [unknown]
) => advanceActivePcToTarget(context, request.length === 0 ? PC_TARGET_REQUEST() : request[0]);
