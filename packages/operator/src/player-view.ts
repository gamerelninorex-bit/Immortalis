import {
  PROJECTION_UNAVAILABLE,
  PROJECTION_UNAVAILABLE_MESSAGE,
  fail,
  ok,
  type Result,
} from "@immortalis/contracts";
import { CanonicalCampaign, verifyEpistemicIntegrity, type FsOps } from "@immortalis/engine";
import {
  bindTrustedCurrentPlayerContext,
  readCurrentObservationGlance,
  type ReadCurrentObservationGlanceResult,
} from "@immortalis/protocol";
import { verifyLocalOperator } from "./local-operator.ts";
import { readKeep } from "./original-pc-keep.ts";
import { BUILD_ID, bindingProblems, releaseProblems } from "./original-pc.ts";
import { authorizePlayerViewHost } from "./player-view-exchange.ts";

/**
 * The trusted side of the local player-view transport (BLUE v5.2 bounded brief 2026-10-15): from a host that has asked for nothing but the
 * operation, to the existing current-observation Glance read, and nothing in between that the host can steer.
 *
 * The host supplies no campaign, character, event, time, basis, owner, permission, source or packet. Everything below is selected and proved
 * by the trusted side, afresh on EVERY call (nothing is cached or kept open between calls):
 *
 *   1. the invoking operating-system user owns the campaign package (closed to everyone else) and the owner-only retained-state directory
 *      (`verifyLocalOperator`, the boundary the package already rests on). This identifies no person and is no remote login;
 *   2. the host is the one the operator bound to this campaign, holding its own secret (never a role or permission: a credential or a
 *      host or model name confers none);
 *   3. the campaign opens through the engine's owner-verified re-open (journal replay, canonical integrity) under its single-writer lock,
 *      with no uncommitted journal tail or stray file: a writer already active, an interrupted commit, an unreconciled package or an I/O
 *      error fails closed, and nothing is repaired or altered to force a read;
 *   4. the ONE authorized player view and the canonical active-PC binding AGREE: the character the operator bound this host to, the
 *      character the operator's retained keep names and the character the Role Registry binding makes the active PC are one character,
 *      and the release and the binding are exactly the ones the shipped authoring command published for that keep (the same proofs the
 *      observation command makes). Where that cannot be proved the read is refused.
 *
 * Only then is `bindTrustedCurrentPlayerContext({ view, recipient_id })` built from the current canon and
 * `readCurrentObservationGlance` invoked, UNCHANGED, with the one strict request. Whatever it returns is returned: the existing
 * `EventSignalPresentation` or the existing `PROJECTION_UNAVAILABLE` refusal. EVERY failure above is that same refusal, byte for byte, so a
 * caller cannot tell an unbound host from a wrong secret, another campaign, a mismatched character, a writer that is active or an
 * observation that was never earned. Nothing is written to the package, the ledger or the binding; the campaign is open only for the length
 * of the read and the open itself writes no canon (it takes and releases the package lock).
 */

export interface PlayerViewReadParams {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly stateDir: string;
  readonly hostId: string;
  readonly secret: string;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
}

export type PlayerViewRefusalCode =
  "OPERATOR_UNVERIFIED" | "CAMPAIGN_UNAVAILABLE" | "CAMPAIGN_NOT_RECONCILED" | "VIEW_UNPROVEN";

export interface AuthorizedPlayerView {
  readonly campaign: CanonicalCampaign;
  readonly pcId: string;
  readonly operatorUid: number;
}

/**
 * Opens the campaign and proves the one authorized player view against canon. The caller closes `campaign`. On any failure the campaign is
 * already closed. Used by the read (which drops the cause) and by the operator's bind action (which reports it to the operator).
 */
export async function openAuthorizedPlayerView(p: {
  readonly campaignDir: string;
  readonly campaignId: string;
  readonly stateDir: string;
  readonly buildId?: string;
  readonly campaignFs?: FsOps;
  readonly ledgerFs?: FsOps;
  /** a character the caller already holds a binding for; it must be the proved one */
  readonly boundPcId?: string;
}): Promise<Result<AuthorizedPlayerView, PlayerViewRefusalCode>> {
  const owner = verifyLocalOperator(p.campaignDir, "campaign");
  const state = verifyLocalOperator(p.stateDir, "operator-state");
  if (!owner.ok || !state.ok || state.value.uid !== owner.value.uid)
    return fail("OPERATOR_UNVERIFIED", "the local operator is not verified for this campaign");
  const opened = await CanonicalCampaign.open(p.campaignDir, {
    buildId: p.buildId ?? BUILD_ID,
    ...(p.campaignFs ? { fs: p.campaignFs } : {}),
  });
  if (!opened.ok) return fail("CAMPAIGN_UNAVAILABLE", "the campaign cannot be opened");
  const campaign = opened.value;
  try {
    const refused = await proofOf(campaign, p, owner.value.uid);
    if (refused !== null) {
      await campaign.close();
      return fail(refused, "the authorized player view cannot be proved");
    }
    const pcId = campaign.binding()!.value.active_pc.entity_id;
    return ok({ campaign, pcId, operatorUid: owner.value.uid });
  } catch {
    await campaign.close().catch(() => undefined);
    return fail("VIEW_UNPROVEN", "the authorized player view cannot be proved");
  }
}

async function proofOf(
  campaign: CanonicalCampaign,
  p: {
    readonly campaignId: string;
    readonly stateDir: string;
    readonly ledgerFs?: FsOps;
    readonly boundPcId?: string;
  },
  operatorUid: number,
): Promise<PlayerViewRefusalCode | null> {
  if (campaign.store.head().campaign_id !== p.campaignId) return "CAMPAIGN_UNAVAILABLE";
  const residue = campaign.store.residue;
  if (residue.journal_tail_bytes > 0 || residue.other_files.length > 0)
    return "CAMPAIGN_NOT_RECONCILED";
  if (campaign.verify().length > 0 || verifyEpistemicIntegrity(campaign.store).length > 0)
    return "CAMPAIGN_NOT_RECONCILED";

  const keepRead = await readKeep({
    dir: p.stateDir,
    campaignId: p.campaignId,
    operatorUid,
    ...(p.ledgerFs ? { fs: p.ledgerFs } : {}),
  });
  if (!keepRead.ok || keepRead.value === null) return "VIEW_UNPROVEN";
  const keep = keepRead.value;
  const binding = campaign.binding();
  const pc = campaign.playerCharacter(keep.pc_id);
  if (!binding || !pc) return "VIEW_UNPROVEN";
  // the bound host's character, the operator's kept character and the canonical active character are ONE character
  if (
    binding.value.active_pc.entity_id !== keep.pc_id ||
    (p.boundPcId !== undefined && p.boundPcId !== keep.pc_id)
  )
    return "VIEW_UNPROVEN";
  if (releaseProblems(p.campaignId, pc.fact, keep, campaign.store).length > 0)
    return "VIEW_UNPROVEN";
  if (bindingProblems({ campaign, campaignId: p.campaignId, keep }, pc.fact).length > 0)
    return "VIEW_UNPROVEN";
  return null;
}

const refusal = (): ReadCurrentObservationGlanceResult =>
  fail(PROJECTION_UNAVAILABLE, PROJECTION_UNAVAILABLE_MESSAGE);

/**
 * The one trusted read. `request` is the host's untrusted input, handed on to the unchanged gateway (which refuses anything but its one
 * strict request). Returns exactly what the gateway returns, or the gateway's own refusal when the player view cannot be proved.
 */
export async function readPlayerViewGlance(
  p: PlayerViewReadParams,
  request: unknown,
): Promise<ReadCurrentObservationGlanceResult> {
  try {
    const owner = verifyLocalOperator(p.campaignDir, "campaign");
    if (!owner.ok) return refusal();
    const authorized = await authorizePlayerViewHost(
      { stateDir: p.stateDir, campaignId: p.campaignId, ...(p.ledgerFs ? { fs: p.ledgerFs } : {}) },
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
    try {
      const context = bindTrustedCurrentPlayerContext({
        view: view.value.campaign.store,
        recipient_id: view.value.pcId,
      });
      return readCurrentObservationGlance(context, request);
    } finally {
      await view.value.campaign.close().catch(() => undefined);
    }
  } catch {
    return refusal();
  }
}
