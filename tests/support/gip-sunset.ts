import {
  CanonicalCampaign,
  GipAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  gipSunsetExpiryProvider,
  type CampaignStore,
} from "@immortalis/engine";
import {
  gipInstrumentKey,
  type CanonicalTime,
  type CommitGroup,
  type GovernanceInstrument,
  type ResolutionRequest,
} from "@immortalis/contracts";
import {
  INSTITUTION_COURT,
  INSTRUMENT_A,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
  TIME_UNIT,
  gipPublication,
  governanceInstrument,
  temporalPublication,
} from "@immortalis/testkit";
import {
  establishInstitution,
  establishOffice,
  establishScopeBinding,
  seededGipCampaign,
  type GipSeeded,
} from "./gip.ts";
import { must } from "./temporal.ts";

/** Synthetic test coordinates in the fixture time unit: the campaign's start, a sunset, and a later instant. */
export const at = (value: number): CanonicalTime => ({ unit: TIME_UNIT, value });
export const SUNSET_START = at(100);
export const SUNSET_MID = at(150);
export const SUNSET_AT = at(200);
export const SUNSET_LATER = at(300);
export const OTHER_SUNSET_AT = at(250);

export interface SunsetSeeded extends GipSeeded {
  readonly coordinator: TemporalCoordinator;
}

/** A coordinator over a store, with the real GIP sunset provider and nothing else registered. */
export const sunsetCoordinator = (store: CampaignStore, providers = [gipSunsetExpiryProvider]) =>
  new TemporalCoordinator(store, new StageProviderRegistry(providers));

/**
 * A campaign with NO player character (the NULL-PC OOC state), one continuing institution, one office, one Scope Binding of
 * that office and the canonical temporal basis SUNSET_START. No Instrument exists yet.
 */
export async function seededSunsetCampaign(
  dir: string,
  o: { buildId?: string; providers?: Parameters<typeof sunsetCoordinator>[1] } = {},
): Promise<SunsetSeeded> {
  const s = await seededGipCampaign(dir, { canonical: false, buildId: o.buildId ?? "sunset-seed" });
  await establishInstitution(s, 1, INSTITUTION_COURT);
  await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishScopeBinding(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
  const coordinator = sunsetCoordinator(s.campaign.store, o.providers);
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: SUNSET_START }));
  return { ...s, coordinator };
}

/** Re-wires a reopened campaign (after a close) exactly as the seed did. */
export function wireSunset(
  campaign: CanonicalCampaign,
  providers?: Parameters<typeof sunsetCoordinator>[1],
): SunsetSeeded {
  return {
    campaign,
    gip: new GipAdapter(campaign.store),
    coordinator: sunsetCoordinator(campaign.store, providers),
  };
}

/**
 * An ACTIVE Instrument authored with an exact `sunset_condition`. Nothing about its lifecycle is `expired`: whether it ever is
 * depends only on the registered term and canonical time.
 */
export const sunsetInstrument = (
  instrumentId = INSTRUMENT_A,
  sunset: CanonicalTime = SUNSET_AT,
  over: Partial<GovernanceInstrument> = {},
): GovernanceInstrument =>
  governanceInstrument(instrumentId, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
    sunset_condition: sunset,
    ...over,
  });

export const instrumentOf = (s: Pick<SunsetSeeded, "campaign">, id = INSTRUMENT_A) =>
  s.campaign.store.getFact(gipInstrumentKey(id));

/** The player-authorized, target-only temporal request. */
export const advanceTo = (
  id: string,
  target: CanonicalTime,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "player-ooc-advance-choice", ref: `choice-${id}` },
  continues: null,
  requested: { target, condition: null },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

/** Establishes the standard sunset-bearing Instrument (GIP publication, then the Temporal registration). */
export async function establishSunset(
  s: Pick<SunsetSeeded, "gip">,
  n = 4,
  instrument: GovernanceInstrument = sunsetInstrument(),
) {
  return must(s.gip.establishSunsetInstrument({ ...gipPublication(n), instrument }));
}

/**
 * A view of a store that LOSES the Temporal registration of a sunset: the interval between GIP's publication and the kernel's
 * registration (a crash, a restart or a lost reply there). Every other commit passes through unchanged; the registration is
 * refused as an unknown outcome and nothing is written.
 */
export function registrationLost(inner: CampaignStore): CampaignStore {
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === "commit")
        return (g: CommitGroup) =>
          g.writes.some((w) => w.key.startsWith("temporal/object/"))
            ? Promise.resolve({
                ok: false,
                error: {
                  code: "UNKNOWN_OUTCOME",
                  message: "crash before the Temporal registration",
                },
              })
            : target.commit(g);
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

/**
 * The campaign in the crash window: GIP's publication of the sunset-bearing Instrument and its enrollment receipt are durable,
 * the Temporal kernel's registration is not. Returns the lost attempt too.
 */
export async function seededPendingSunset(
  dir: string,
  instrument: GovernanceInstrument = sunsetInstrument(),
  n = 4,
) {
  const s = await seededSunsetCampaign(dir);
  const lost = await new GipAdapter(registrationLost(s.campaign.store)).establishSunsetInstrument({
    ...gipPublication(n),
    instrument,
  });
  if (lost.ok || lost.error.code !== "UNKNOWN_OUTCOME")
    throw new Error(`the registration was not lost: ${JSON.stringify(lost)}`);
  return s;
}

/** The value without one key (a field is omitted, never set to undefined). */
export const omit = <T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> =>
  Object.fromEntries(Object.entries(value).filter(([k]) => k !== key)) as Omit<T, K>;
