import { fail, ok, type CanonicalTime, type Result } from "@immortalis/contracts";
import { committedCanonicalTime, type FsOps } from "@immortalis/engine";
import { verifyLocalOperator } from "./local-operator.ts";
import { authorizeAdvanceRequestHost, recordAdvanceRequest } from "./advance-request-exchange.ts";
import { openAuthorizedPlayerView } from "./player-view.ts";

/**
 * The HOST's half of the host-requested, independently operator-confirmed active-PC target-only OOC time advance (BLUE v5.2-A1 bounded brief
 * 2026-10-15, "Host-Requested Active-PC Target-Only OOC Time").
 *
 * `requestActivePcTargetAdvance`: a compatible host may ASK that the operator consider an out-of-character advance of canonical time. The ask
 * is a non-canonical administrative routing record in the owner-only retained-state directory and NOTHING ELSE: no canonical write, no
 * target, no duration, no condition, no time, no intent, no transaction identity, no role or permission, no confirmation, no actor order and
 * no outcome. It is not the player's choice, it is not an in-world wait or action, and nothing in it can be turned into either. The host
 * supplies no argument (any argument is an over-claim and refuses the call): the campaign, the character and the basis are selected and
 * proved by the trusted side, afresh on every call.
 *
 * This module imports nothing of confirmation, the command set, the Temporal coordinator, the protocol gateway or the terminal: it CANNOT
 * make a choice, name a target, confirm, or advance anything. The player's choice (the exact target, and the confirmation of exactly that) is
 * made, if at all, by the operator's own half (`advance-request-answer.ts`), which runs the existing shipped `pcTargetAdvance` command
 * unchanged on the operator's console, which in turn invokes the existing `advanceActivePcToTarget` gateway. Whether anything falls due, and
 * what, is decided by the Temporal kernel and each owning domain; the host's ask contributes nothing to it.
 */

// ---------------------------------------------------------------------------------------------
// the host's half
// ---------------------------------------------------------------------------------------------

export interface AdvanceRequestParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly stateDir: string;
  readonly hostId: string;
  readonly secret: string;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

export const ADVANCE_REQUEST_UNAVAILABLE = "TARGET_ADVANCE_REQUEST_UNAVAILABLE";
export const ADVANCE_REQUEST_UNAVAILABLE_MESSAGE = "no time-advance request can be recorded";

/** What the host is told on success: that an ask was left, and (in words) exactly what that is and is not. Nothing of canon is in it. */
export const ADVANCE_REQUESTED_MESSAGE =
  "A request was left for the player. No time has advanced and nothing has been decided: the player must separately name an exact target and confirm it on their own console, and may decline. This request names no target, is not that choice and does not mean the world will change. Do not tell the player that time passed or that anything happened because you asked.";

export interface AdvanceRequested {
  readonly status: "TARGET_ADVANCE_REQUESTED";
  readonly message: string;
}

export type AdvanceRequestResult = Result<AdvanceRequested, typeof ADVANCE_REQUEST_UNAVAILABLE>;

const refusal = (): AdvanceRequestResult =>
  fail(ADVANCE_REQUEST_UNAVAILABLE, ADVANCE_REQUEST_UNAVAILABLE_MESSAGE);

/**
 * The one trusted request. `args` is the host's untrusted input: the operation takes none, so ANYTHING at all (a target, a duration, a
 * condition, a confirmation, a role, a permission, a character, a basis, a transaction identity, a verdict) is an over-claim that refuses the
 * call before the package or the retained state is touched.
 *
 * EVERY failure is the same refusal, so a caller cannot tell an unbound host from a wrong secret, another campaign, a mismatched character,
 * an active writer or an unestablished basis. Writes only the one non-canonical ask, and only after the host, the operating-system owner,
 * the campaign, the character and the canonical basis have all been proved.
 */
export async function requestActivePcTargetAdvance(
  p: AdvanceRequestParams,
  args?: unknown,
): Promise<AdvanceRequestResult> {
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
    const authorized = await authorizeAdvanceRequestHost(
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
    let recorded;
    try {
      // only the canonical basis is read: no scene, observation, custody, instrument or Temporal object is consulted to decide anything here
      const basis: CanonicalTime | null = committedCanonicalTime((k) =>
        view.value.campaign.store.getFact(k),
      );
      if (basis === null) return refusal();
      // the ask is left WHILE the campaign's single-writer lock is held: the basis just read cannot move, and no other request can read a
      // basis, prune stale asks or leave one until this one has finished (the custody note in advance-request-exchange.ts)
      recorded = await recordAdvanceRequest(exchange, {
        campaign_id: p.campaignId,
        operator_uid: owner.value.uid,
        host_id: p.hostId,
        pc_id: view.value.pcId,
        basis,
      });
    } finally {
      await view.value.campaign.close().catch(() => undefined);
    }
    if (!recorded.ok) return refusal();
    return ok({ status: "TARGET_ADVANCE_REQUESTED", message: ADVANCE_REQUESTED_MESSAGE });
  } catch {
    return refusal();
  }
}
