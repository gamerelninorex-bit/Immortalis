import {
  PcCollectionCommitmentSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  type CanonicalTime,
} from "@immortalis/contracts";
import { PcCollectionAdapter } from "@immortalis/engine";
import { openCharacterCampaign } from "./character-evidence.ts";
import type { PhoneConfig } from "./config.ts";

/**
 * The OWNER-GROUNDED, READ-ONLY account of the player's gathering, from one owner-verified open of the campaign: what the PC owner,
 * Production, Population and Temporal hold NOW. It replaces nothing an owner decides and carries no cache: it is recomputed from canon
 * every time, so a stale receipt of an earlier request can never be presented as the current state. A status string is never evidence.
 *
 * It names the PHASE of the player's latest attempt and nothing about WHY an attempt was not admitted (the reach and scene readings are
 * sealed owner evidence, and a refusal says nothing about its cause): "NOT_ADMITTED" is the same whether the material was out of reach,
 * the scene was not closed or Population refused. No source or Reserve quantity is read: those belong to their owners and to no
 * player-facing account of this route.
 */
/** the quantity an attempt asked for, exactly as its commitment-of-record holds it (what an adopting goal is compared with) */
export interface AttemptQuantity {
  readonly amount: number;
  readonly unit: string;
}
export type PlayPhase =
  /** no gathering attempt of the character is on record */
  | { readonly phase: "NO_ATTEMPT" }
  /** the player's willingness is committed; the reach reading and Production's admission have not happened */
  | { readonly phase: "COMMITTED"; readonly act_id: string; readonly quantity: AttemptQuantity }
  /** the owners did not admit the work (a denial, or a reach reading that did not establish access); nothing was gathered */
  | { readonly phase: "NOT_ADMITTED"; readonly act_id: string; readonly quantity: AttemptQuantity }
  /** Production admitted the work; canonical time has not yet reached its earned completion */
  | {
      readonly phase: "IN_FLIGHT";
      readonly act_id: string;
      readonly quantity: AttemptQuantity;
      readonly completes_at: CanonicalTime;
    }
  /** the work reached its earned completion and the Reserve inflow is credited */
  | { readonly phase: "COMPLETED"; readonly act_id: string; readonly quantity: AttemptQuantity }
  /** the work ended without completion (a separately chosen cessation, or a lapse the owners settled) */
  | { readonly phase: "STOPPED"; readonly act_id: string; readonly quantity: AttemptQuantity }
  /** the work is held and needs the operator or an owner-backed reconcile; nothing this account can settle */
  | { readonly phase: "HELD"; readonly act_id: string; readonly quantity: AttemptQuantity };

export type PlayRead =
  | {
      readonly kind: "OPEN";
      readonly time: CanonicalTime | null;
      readonly attempts: number;
      readonly latest: PlayPhase;
    }
  | { readonly kind: "UNAVAILABLE"; readonly detail: string };

const BUILD_ID = "immortalis-chat-play-readback";
const COMMITMENT_KEY = /^pc\/([^/]+)\/collection\/([^/]+)\/commitment$/;

/** Reads the player's gathering state. A lock held by a running command, an unverifiable package or an unreadable record is UNAVAILABLE. */
export async function readPlay(config: PhoneConfig): Promise<PlayRead> {
  const open = await openCharacterCampaign(config, BUILD_ID);
  if (!open.ok)
    return {
      kind: "UNAVAILABLE",
      detail:
        open.state.kind === "NO_SETTING"
          ? "no setting is established yet"
          : "the campaign cannot be read now (a command may be running)",
    };
  const { campaign } = open;
  try {
    const clock = campaign.store.getFact(TEMPORAL_STATE_KEY);
    const state = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
    const time = state?.success ? state.data.canonical_time : null;
    const pc = campaign.binding()?.value.active_pc.entity_id ?? null;
    if (pc === null) return { kind: "OPEN", time, attempts: 0, latest: { phase: "NO_ATTEMPT" } };
    const adapter = new PcCollectionAdapter(campaign.store);
    const commitments = campaign.store
      .listFacts()
      .filter((f) => {
        const m = COMMITMENT_KEY.exec(f.key);
        return m !== null && m[1] === pc;
      })
      .map((f) => ({ fact: f, parsed: PcCollectionCommitmentSchema.safeParse(f.value) }))
      .filter((c) => c.parsed.success);
    if (commitments.length === 0)
      return { kind: "OPEN", time, attempts: 0, latest: { phase: "NO_ATTEMPT" } };
    // the latest attempt is the one with the highest commit revision (a real order); never an identifier's spelling
    const byRevision = commitments
      .map((c) => ({
        act: c.parsed.data!.act_id,
        revision: campaign.store.lookupReceipt(c.fact.provenance.intent_id)?.revision ?? 0,
      }))
      .sort((a, b) => a.revision - b.revision);
    const act = byRevision.at(-1)!.act;
    const asked = commitments.find((c) => c.parsed.data!.act_id === act)!.parsed.data!.intent
      .quantity;
    const quantity: AttemptQuantity = { amount: asked.amount, unit: asked.unit };
    const attempts = commitments.length;
    const reach = adapter.reach(pc, act);
    const hold = adapter.hold(pc);
    const occ = adapter.occupancyState(pc);
    const extraction = adapter.extraction(pc, act);
    let latest: PlayPhase;
    if (adapter.closed(pc, act)) latest = { phase: "COMPLETED", act_id: act, quantity };
    else if (hold.state === "IN_FLIGHT" && hold.act_id === act && extraction)
      latest = {
        phase: "IN_FLIGHT",
        act_id: act,
        quantity,
        completes_at: extraction.value.timing.boundary.at,
      };
    else if (hold.state !== "NONE") latest = { phase: "HELD", act_id: act, quantity };
    else if (occ.state === "RELEASED" && occ.act_id === act)
      latest =
        occ.why === "DENIED"
          ? { phase: "NOT_ADMITTED", act_id: act, quantity }
          : { phase: "STOPPED", act_id: act, quantity };
    else if (reach !== undefined && reach.value.verdict === "NOT_REACHABLE" && !extraction)
      latest = { phase: "NOT_ADMITTED", act_id: act, quantity };
    else latest = { phase: "COMMITTED", act_id: act, quantity };
    return { kind: "OPEN", time, attempts, latest };
  } finally {
    await campaign.close();
  }
}
