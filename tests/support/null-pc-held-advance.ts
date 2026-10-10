import { PROD_T1 } from "@immortalis/testkit";
import type { CanonicalTime } from "@immortalis/contracts";
import {
  bindTrustedNullPcOocHeldContinuationContext,
  resumeNullPcOocHeldAdvance,
} from "@immortalis/protocol";
import type { LogSeeded } from "./logistics.ts";
import { NULL_PC_TX, nullPcTransaction } from "./null-pc-advance.ts";

export {
  NULL_PC_TX,
  crashWhenNull,
  loseReplyWhenNull,
  nullPcTransaction,
  refuseNullPcDeliveryStage,
  seededNullPcCampaign,
  seededNullPcSyntheticCampaign,
  trustedNullPcAdvance,
  advanceNull,
} from "./null-pc-advance.ts";

/** The exact host request: the operation name and nothing else. */
export const HELD_REQUEST = (over: Record<string, unknown> = {}) => ({
  operation: "resume_null_pc_ooc_held_advance",
  ...over,
});

export const HELD_REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "NULL_PC_HELD_ADVANCE_UNAVAILABLE", message: "no advance is available" },
});
export const HELD_COMMITTED = { ok: true, value: { status: "NULL_PC_HELD_ADVANCE_COMMITTED" } };
export const HELD_UNKNOWN = {
  ok: false,
  error: {
    code: "NULL_PC_HELD_ADVANCE_OUTCOME_UNKNOWN",
    message: "the outcome is not known: present the same request again",
  },
};

export const HELD_TX2 = "tx-null-pc-ooc-resume-2";
export const HELD_TX3 = "tx-null-pc-ooc-resume-3";

/**
 * The trusted side's binding for one campaign, after the player's NEW OOC choice to resume the held work of `held` (by default the
 * initial NULL-PC choice `NULL_PC_TX`, authorized toward `PROD_T1`) under the new choice's identity and provenance.
 */
export const trustedHeld = (
  s: Pick<LogSeeded, "campaign">,
  over: { held?: unknown; transaction?: unknown; campaign?: unknown } = {},
) =>
  bindTrustedNullPcOocHeldContinuationContext({
    campaign: ("campaign" in over ? over.campaign : s.campaign) as never,
    held: ("held" in over
      ? over.held
      : { from_transaction: NULL_PC_TX, target: PROD_T1 as CanonicalTime }) as never,
    transaction: ("transaction" in over ? over.transaction : nullPcTransaction(HELD_TX2)) as never,
  });

/** The host's call. The request is passed through verbatim (an explicit `undefined` is a hostile request, not a default). */
export const resumeHeld = (context: ReturnType<typeof trustedHeld>, ...request: [] | [unknown]) =>
  resumeNullPcOocHeldAdvance(context, request.length === 0 ? HELD_REQUEST() : request[0]);
