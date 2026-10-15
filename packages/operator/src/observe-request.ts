import { fail, ok, type CanonicalTime, type Result } from "@immortalis/contracts";
import { committedCanonicalTime, type FsOps } from "@immortalis/engine";
import { verifyLocalOperator } from "./local-operator.ts";
import { authorizeObserveRequestHost, recordObserveRequest } from "./observe-request-exchange.ts";
import { openAuthorizedPlayerView } from "./player-view.ts";

/**
 * The HOST's half of the host-requested, independently operator-confirmed active-PC look (BLUE v5.2-A1 bounded brief 2026-10-15).
 *
 * `requestActivePcObservation`: a compatible host may ASK that the operator consider a look. The ask is a non-canonical routing record in
 * the owner-only retained-state directory and NOTHING ELSE: no canonical write, no observation decision or receipt, no packet, no intent,
 * no time, no confirmation, no referee question. It is not the player's choice and it is not the referee's judgment, and nothing in it can be
 * turned into either. The host supplies no argument (any argument is an over-claim and refuses the call): the campaign, the character and
 * the basis are selected and proved by the trusted side, afresh on every call.
 *
 * This module imports nothing of confirmation, observation, the referee surface or the terminal: it CANNOT make a choice, ask a referee,
 * confirm, or commit. The player's choice is made, if at all, by the operator's own half (`observe-request-answer.ts`), which runs the
 * existing `observeSurroundings` unchanged on the operator's console. The host may afterwards read only what the existing player-view read
 * returns (a separately authenticated server and credential): the existing Glance presentation or its one opaque refusal.
 */

// ---------------------------------------------------------------------------------------------
// the host's half
// ---------------------------------------------------------------------------------------------

export interface ObserveRequestParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly stateDir: string;
  readonly hostId: string;
  readonly secret: string;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

export const OBSERVE_REQUEST_UNAVAILABLE = "OBSERVATION_REQUEST_UNAVAILABLE";
export const OBSERVE_REQUEST_UNAVAILABLE_MESSAGE = "no observation request can be recorded";

/** What the host is told on success: that an ask was left, and (in words) exactly what that is and is not. Nothing of canon is in it. */
export const OBSERVE_REQUESTED_MESSAGE =
  "A request was left for the player. Nothing has been observed and nothing has been decided: the player must separately choose and confirm on their own console, and may decline. This request is not that choice. Read the character's current awareness afterwards; a refusal there says nothing about why.";

export interface ObserveRequested {
  readonly status: "OBSERVATION_REQUESTED";
  readonly message: string;
}

export type ObserveRequestResult = Result<ObserveRequested, typeof OBSERVE_REQUEST_UNAVAILABLE>;

const refusal = (): ObserveRequestResult =>
  fail(OBSERVE_REQUEST_UNAVAILABLE, OBSERVE_REQUEST_UNAVAILABLE_MESSAGE);

/**
 * The one trusted request. `args` is the host's untrusted input: the operation takes none, so ANYTHING at all (a confirmation, a role, a
 * character, a basis, a verdict) is an over-claim that refuses the call before the package or the retained state is touched.
 *
 * EVERY failure is the same refusal, so a caller cannot tell an unbound host from a wrong secret, another campaign, a mismatched character,
 * an active writer or an unestablished basis. Writes only the one non-canonical ask, and only after the host, the operating-system owner,
 * the campaign, the character and the canonical basis have all been proved.
 */
export async function requestActivePcObservation(
  p: ObserveRequestParams,
  args?: unknown,
): Promise<ObserveRequestResult> {
  try {
    const empty =
      args === undefined ||
      (typeof args === "object" &&
        args !== null &&
        !Array.isArray(args) &&
        Object.keys(args).length === 0);
    if (!empty) return refusal();
    const owner = verifyLocalOperator(p.campaignDir, "campaign");
    if (!owner.ok) return refusal();
    const exchange = {
      stateDir: p.stateDir,
      campaignId: p.campaignId,
      ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
    };
    const authorized = await authorizeObserveRequestHost(
      exchange,
      owner.value.uid,
      p.hostId,
      p.secret,
    );
    if (!authorized.ok) return refusal();
    const view = await openAuthorizedPlayerView({
      campaignDir: p.campaignDir,
      campaignId: p.campaignId,
      stateDir: p.stateDir,
      boundPcId: authorized.value.pc_id,
      ...(p.buildId !== undefined ? { buildId: p.buildId } : {}),
      ...(p.campaignFs ? { campaignFs: p.campaignFs } : {}),
      ...(p.ledgerFs ? { ledgerFs: p.ledgerFs } : {}),
    });
    if (!view.ok) return refusal();
    let basis: CanonicalTime | null;
    try {
      // only the canonical basis is read: no scene, observation, decision or packet is consulted to decide anything here
      basis = committedCanonicalTime((k) => view.value.campaign.store.getFact(k));
    } finally {
      await view.value.campaign.close().catch(() => undefined);
    }
    if (basis === null) return refusal();
    const recorded = await recordObserveRequest(exchange, {
      campaign_id: p.campaignId,
      operator_uid: owner.value.uid,
      host_id: p.hostId,
      pc_id: view.value.pcId,
      basis,
    });
    if (!recorded.ok) return refusal();
    return ok({ status: "OBSERVATION_REQUESTED", message: OBSERVE_REQUESTED_MESSAGE });
  } catch {
    return refusal();
  }
}
