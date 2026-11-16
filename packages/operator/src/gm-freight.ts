import {
  GM_FREIGHT_UNAVAILABLE,
  GM_FREIGHT_UNAVAILABLE_MESSAGE,
  fail,
  type GmFreightErrorCode,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  bindTrustedGmFreightSession,
  runGmFreightOperation,
  type FsOps,
  type GmFreightResult,
} from "@immortalis/engine";
import { authorizeGmFreightHost } from "./gm-freight-exchange.ts";
import { verifyLocalOperator } from "./local-operator.ts";

/**
 * The HOST's half of the GM-native first-profile freight bridge (BLUE v6.2 Continuation Preflight): from an authenticated host that has
 * asked for one named tool with typed arguments, to the engine's `runGmFreightOperation`, and nothing in between that the host can steer.
 *
 * The host supplies no campaign, no operator, no role, no permission, no owner and no time. Everything below is selected and proved by
 * the trusted side, afresh on EVERY call (nothing is cached or kept open between calls, and the campaign's single-writer lock is held
 * only for the length of the call so the operator's own console is never starved):
 *
 *   1. the invoking operating-system user owns the campaign package (closed to everyone else) and the owner-only retained-state
 *      directory (`verifyLocalOperator`, the boundary the package already rests on). This identifies no person and is no remote login;
 *   2. the host is one the operator bound to THIS campaign's GM freight lane, holding its own secret (never a role or permission: a
 *      credential, a host name or a model name confers none; the referee, player-view, observation and time-advance credentials open
 *      nothing here);
 *   3. the campaign opens through the engine's owner-verified re-open (journal replay, canonical integrity) under its single-writer
 *      lock and is the campaign the host was bound to: a writer already active, a corrupted package or an I/O error fails closed, and
 *      nothing is repaired or altered to force a call. (Residue of an interrupted commit is never adopted; see below.)
 *
 * Only then is a trusted session bound and the ONE engine operation invoked. EVERY failure above is the same refusal, byte for byte, so
 * a caller cannot tell an unbound host from a wrong secret, another campaign, a foreign operator or a writer that is active.
 */

export interface GmFreightParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly stateDir: string;
  readonly hostId: string;
  readonly secret: string;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

export const GM_FREIGHT_BUILD_ID = "gm-freight-bridge";

const refusal = (): GmFreightResult =>
  fail<GmFreightErrorCode>(GM_FREIGHT_UNAVAILABLE, GM_FREIGHT_UNAVAILABLE_MESSAGE);

export async function callGmFreight(
  p: GmFreightParams,
  tool: string,
  args: unknown,
): Promise<GmFreightResult> {
  try {
    const owner = verifyLocalOperator(p.campaignDir, "campaign");
    const state = verifyLocalOperator(p.stateDir, "operator-state");
    if (!owner.ok || !state.ok || state.value.uid !== owner.value.uid) return refusal();
    const authorized = await authorizeGmFreightHost(
      { stateDir: p.stateDir, campaignId: p.campaignId, ...(p.ledgerFs ? { fs: p.ledgerFs } : {}) },
      owner.value.uid,
      p.hostId,
      p.secret,
    );
    if (!authorized.ok) return refusal();
    const opened = await CanonicalCampaign.open(p.campaignDir, {
      buildId: p.buildId ?? GM_FREIGHT_BUILD_ID,
      ...(p.campaignFs ? { fs: p.campaignFs } : {}),
    });
    if (!opened.ok) return refusal();
    const campaign = opened.value;
    try {
      // Residue of an interrupted commit (an unadopted journal tail or stray state file) is reported by the store and never adopted into canon.
      // Unlike the read-only lanes this lane does NOT refuse on it: reconciling a lost acknowledgement by re-presenting the same identities IS
      // this lane's recovery path (RC-16), and the next commit supersedes the residue. Only committed canon is ever read or written.
      if (campaign.store.head().campaign_id !== p.campaignId) return refusal();
      const session = bindTrustedGmFreightSession({ campaign, hostId: authorized.value.host_id });
      return await runGmFreightOperation(session, tool, args);
    } finally {
      await campaign.close().catch(() => undefined);
    }
  } catch {
    return refusal();
  }
}
