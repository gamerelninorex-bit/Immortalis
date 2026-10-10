/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store to simulate lost replies, crashes and refused stages */
import {
  PLAYER_CHOICE_AUTHORITY,
  gipInstrumentKey,
  type CanonicalTime,
  type CommitGroup,
} from "@immortalis/contracts";
import { GipAdapter } from "@immortalis/engine";
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
} from "@immortalis/testkit";
import { at, registrationLost, sunsetInstrument } from "./gip-sunset.ts";
import { gipOf, gipSourcedCampaign } from "./pc-gip-sunset.ts";
import { PC, type PcMoveSeeded } from "./pc-movement.ts";
import { must } from "./temporal.ts";

/**
 * SYNTHETIC TEST SUPPORT for the active-PC target-only advance. Every owner is the real one: the handover, custody, GIP's own
 * institution / office / Scope Binding / Instrument (and its Temporal registration) are committed by their owners before the
 * gateway is ever called. Nothing here authors `expired`, a due flag, a stage or a status; the sunset instant is the Instrument's
 * own declared term, and the host's request is the operation name and nothing else.
 */

/** The exact host request: the operation name and nothing else. */
export const PC_TARGET_REQUEST = (over: Record<string, unknown> = {}) => ({
  operation: "advance_active_pc_to_target",
  ...over,
});

export const PC_TARGET_REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "PC_TARGET_ADVANCE_UNAVAILABLE", message: "no advance is available" },
});
export const PC_TARGET_COMMITTED = { ok: true, value: { status: "PC_TARGET_ADVANCE_COMMITTED" } };
export const PC_TARGET_UNKNOWN = {
  ok: false,
  error: {
    code: "PC_TARGET_ADVANCE_OUTCOME_UNKNOWN",
    message: "the outcome is not known: present the same request again",
  },
};

export const PC_TARGET_TX = "tx-pc-target-advance";
export const PC_TARGET_TX2 = "tx-pc-target-resume-2";
export const PC_TARGET_TX3 = "tx-pc-target-resume-3";

/** The trusted side's authored transaction identity and provenance for the player's choice. */
export const pcTargetTransaction = (
  id: string = PC_TARGET_TX,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "player-pc-target-choice", ref: `choice-${id}` },
  context: { ...PLAYER_CHOICE_AUTHORITY },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

/** The trusted side's binding for one campaign, after the player's choice to advance the PC's campaign to `target`. */
export const trustedPcTarget = (
  s: Pick<PcMoveSeeded, "campaign">,
  over: { pc_id?: unknown; target?: unknown; transaction?: unknown; campaign?: unknown } = {},
) =>
  bindTrustedActivePcTargetAdvanceContext({
    campaign: ("campaign" in over ? over.campaign : s.campaign) as never,
    pc_id: ("pc_id" in over ? over.pc_id : PC) as never,
    target: ("target" in over ? over.target : at(300)) as CanonicalTime,
    transaction: ("transaction" in over ? over.transaction : pcTargetTransaction()) as never,
  });

/** The trusted side's binding after the player's NEW choice to continue the held work of `held`. */
export const trustedPcHeld = (
  s: Pick<PcMoveSeeded, "campaign">,
  over: { pc_id?: unknown; held?: unknown; transaction?: unknown; campaign?: unknown } = {},
) =>
  bindTrustedActivePcHeldTargetAdvanceContext({
    campaign: ("campaign" in over ? over.campaign : s.campaign) as never,
    pc_id: ("pc_id" in over ? over.pc_id : PC) as never,
    held: ("held" in over
      ? over.held
      : { from_transaction: PC_TARGET_TX, target: at(300) }) as never,
    transaction: ("transaction" in over
      ? over.transaction
      : pcTargetTransaction(PC_TARGET_TX2)) as never,
  });

/** The host's call. The request is passed through verbatim (an explicit `undefined` is a hostile request, not a default). */
export const advancePcTarget = (
  context: ReturnType<typeof trustedPcTarget>,
  ...request: [] | [unknown]
) => advanceActivePcToTarget(context, request.length === 0 ? PC_TARGET_REQUEST() : request[0]);

/** How the sunset-bearing Instrument reaches the campaign. */
export type StationarySunsetSetup = "registered" | "pending" | "no-sunset";

/**
 * A custodied, handed-over PC campaign (the PC stationary at its origin; no movement of any kind begun) with one institution, one
 * office, one Scope Binding of that office and one ACTIVE Instrument established through GIP's own adapter with `sunset` as its
 * exact term and registered with the Temporal kernel, left in GIP's crash window (published and receipted, registration lost), or
 * established with no sunset term. Canonical time stands at the fixture basis (100). Nothing about the lifecycle is `expired`.
 */
export async function stationarySunsetPcCampaign(
  sunset: CanonicalTime | null,
  setup: StationarySunsetSetup = "registered",
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
  return s;
}

/** Swap the store for one whose admission-time view refuses GIP's expiry stage (the stage's write is made inadmissible). */
export function refuseGipStageOf(s: Pick<PcMoveSeeded, "campaign">): () => void {
  const real = s.campaign.store;
  const isGip = (g: CommitGroup) => g.writes.some((w) => w.key === gipInstrumentKey(INSTRUMENT_A));
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return (g: CommitGroup) =>
          target.commit(
            isGip(g) && g.writes.length === 1 && g.owner === "gip"
              ? {
                  ...g,
                  writes: g.writes.map((w) => ({
                    ...w,
                    value: { ...(w.value as any), sunset_condition: at(999) },
                  })),
                }
              : g,
          );
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}

/** Every commit group, in the order it reached the store, recorded without altering any of them. */
export function recordCommits(s: Pick<PcMoveSeeded, "campaign">): () => readonly CommitGroup[] {
  const real = s.campaign.store;
  const seen: CommitGroup[] = [];
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) => {
          const r = await target.commit(g);
          if (r.ok) seen.push(g);
          return r;
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => seen;
}

export { crashWhen, loseReplyWhen } from "./protocol-advance.ts";
