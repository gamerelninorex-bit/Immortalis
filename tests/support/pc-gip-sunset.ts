import { GipAdapter } from "@immortalis/engine";
import {
  gipInstrumentKey,
  type CanonicalTime,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import {
  INSTITUTION_COURT,
  INSTRUMENT_A,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
  gipPublication,
  governanceInstrument,
} from "@immortalis/testkit";
import { establishInstitution, establishOffice, establishScopeBinding } from "./gip.ts";
import { registrationLost, sunsetInstrument } from "./gip-sunset.ts";
import { custodiedCampaign, type PcMoveSeeded } from "./pc-movement.ts";
import { relocatedCampaign } from "./protocol-advance.ts";
import { must } from "./temporal.ts";

/**
 * SYNTHETIC TEST SUPPORT for the active-PC advance over a registered GIP sunset. Every owner is the real one: GIP's own adapter
 * publishes the Instrument, its enrollment receipt and the Temporal registration, and the ratified relocation gateway commits the
 * PC's movement. Nothing here authors `expired`, a due flag or a stage: the sunset instant is the Instrument's own declared term.
 */
export const gipOf = (s: Pick<PcMoveSeeded, "campaign">) => new GipAdapter(s.campaign.store);

export const instrumentFact = (s: Pick<PcMoveSeeded, "campaign">, id = INSTRUMENT_A) =>
  s.campaign.store.getFact(gipInstrumentKey(id));

export const lifecycleOf = (s: Pick<PcMoveSeeded, "campaign">) =>
  (instrumentFact(s)!.value as GovernanceInstrument).lifecycle_status;

/** One institution, one office and one Scope Binding of that office (GIP's committed sources), in a custodied PC campaign. */
export async function gipSourcedCampaign(dir?: string): Promise<PcMoveSeeded> {
  const s = await custodiedCampaign(dir);
  const gip = gipOf(s);
  await establishInstitution({ gip }, 1, INSTITUTION_COURT);
  await establishOffice({ gip }, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishScopeBinding({ gip }, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
  return s;
}

/** How the Instrument reaches the campaign before the PC's movement is committed. */
export type SunsetSetup = "registered" | "pending" | "no-sunset";

/**
 * A custodied PC campaign with one ACTIVE Instrument — established with `sunset` as its exact term and registered with the
 * Temporal kernel, left in GIP's crash window (published and receipted, registration lost), or established with no sunset term —
 * and then the ratified relocation: in transfer, enrolled, no time advanced.
 */
export async function sunsetPcCampaign(
  sunset: CanonicalTime | null,
  setup: SunsetSetup = "registered",
  dir?: string,
): Promise<PcMoveSeeded> {
  const s = await gipSourcedCampaign(dir);
  if (setup === "no-sunset") {
    await must(
      gipOf(s).establishGovernanceInstrument({
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
    if (setup === "registered") await must(gipOf(s).establishSunsetInstrument(input));
    else {
      const lost = await new GipAdapter(
        registrationLost(s.campaign.store),
      ).establishSunsetInstrument(input);
      if (lost.ok || lost.error.code !== "UNKNOWN_OUTCOME")
        throw new Error(`the registration was not lost: ${JSON.stringify(lost)}`);
    }
  }
  return relocatedCampaign(async () => s);
}
