/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store to simulate lost replies, crashes and refused stages */
import {
  PLAYER_CHOICE_AUTHORITY,
  logisticsDeliveryKey,
  type CommitGroup,
  type ResolutionRequest,
} from "@immortalis/contracts";
import {
  advanceConfirmedPcTransferToDelivery,
  bindTrustedConfirmedPcTransferAdvanceContext,
} from "@immortalis/protocol";
import { PC, W, type PcMoveSeeded } from "./pc-movement.ts";
import { relocate, trustedRelocation } from "./protocol-relocation.ts";

/** The exact host request: the operation name and nothing else. */
export const ADVANCE_REQUEST = (over: Record<string, unknown> = {}) => ({
  operation: "advance_confirmed_pc_transfer_to_delivery",
  ...over,
});

export const ADVANCE_REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "ADVANCE_UNAVAILABLE", message: "no advance is available" },
});
export const ADVANCE_COMMITTED = { ok: true, value: { status: "ADVANCE_COMMITTED" } };
export const ADVANCE_UNKNOWN = {
  ok: false,
  error: {
    code: "ADVANCE_OUTCOME_UNKNOWN",
    message: "the outcome is not known: present the same request again",
  },
};

export const ADVANCE_TX = "tx-pc-player-advance";

/**
 * The trusted side's authored transaction identity and provenance for the player's SEPARATE progression choice. The role and
 * permission are stated here by the trusted side (the engine never states or defaults them).
 */
export const advanceTransaction = (
  id: string = ADVANCE_TX,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "player-advance-choice", ref: `choice-${id}` },
  context: { ...PLAYER_CHOICE_AUTHORITY },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

/** The trusted side's binding for one campaign, after the player's separate choice to advance toward the delivery boundary. */
export const trustedAdvance = (
  s: Pick<PcMoveSeeded, "campaign">,
  over: { pc_id?: unknown; transaction?: unknown; campaign?: unknown } = {},
) =>
  bindTrustedConfirmedPcTransferAdvanceContext({
    campaign: ("campaign" in over ? over.campaign : s.campaign) as never,
    pc_id: ("pc_id" in over ? over.pc_id : PC) as never,
    transaction: ("transaction" in over ? over.transaction : advanceTransaction()) as never,
  });

/** The host's call. The request is passed through verbatim (an explicit `undefined` is a hostile request, not a default). */
export const advance = (context: ReturnType<typeof trustedAdvance>, ...request: [] | [unknown]) =>
  advanceConfirmedPcTransferToDelivery(
    context,
    request.length === 0 ? ADVANCE_REQUEST() : request[0],
  );

/** A campaign whose PC has committed the relocation through the ratified gateway: in transfer, enrolled, no time advanced. */
export async function relocatedCampaign(
  make: () => Promise<PcMoveSeeded>,
  dir?: string,
): Promise<PcMoveSeeded> {
  void dir;
  const s = await make();
  const r = await relocate(trustedRelocation(s));
  if (!r.ok) throw new Error("the relocation fixture did not commit");
  return s;
}

/** The literal request the gateway must build for the PC's one in-transfer movement (derived from the PC's request identity). */
export const expectedAdvanceRequest = (
  object_id: string,
  boundary_id: string,
  id: string = ADVANCE_TX,
): ResolutionRequest => {
  const t = advanceTransaction(id) as any;
  return {
    transaction_id: t.transaction_id,
    cause: t.cause,
    trigger: t.trigger,
    continues: null,
    requested: { target: null, condition: { kind: "STOP_AFTER_BOUNDARY", object_id, boundary_id } },
    context: t.context,
    publication: t.publication,
  };
};

/** Swap the campaign's store for one that refuses (IM-11) the Logistics delivery stage by corrupting its effective instant. */
export function refuseDeliveryStage(s: PcMoveSeeded): () => void {
  const real = s.campaign.store;
  const deliveryKey = logisticsDeliveryKey(W, PC);
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return (g: CommitGroup) =>
          target.commit(
            g.writes.some((w) => w.key === deliveryKey)
              ? {
                  ...g,
                  writes: g.writes.map((w) =>
                    w.key === deliveryKey
                      ? {
                          ...w,
                          value: (({ ...v }: any) => ({
                            ...v,
                            timing: { ...v.timing, occurs_at: { unit: "t", value: 999999 } },
                          }))(w.value as any),
                        }
                      : w,
                  ),
                }
              : g,
          );
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}

/** Swap the campaign's store for one that commits the group matching `pred` and then LOSES the reply (an unknown outcome). */
export function loseReplyWhen(s: PcMoveSeeded, pred: (g: CommitGroup) => boolean): () => void {
  const real = s.campaign.store;
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) => {
          const r = await target.commit(g);
          return pred(g)
            ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
            : r;
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}

/** Swap the campaign's store for one that commits NOTHING (an unknown outcome) for the first group matching `pred`. */
export function crashWhen(s: PcMoveSeeded, pred: (g: CommitGroup) => boolean): () => void {
  const real = s.campaign.store;
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) =>
          pred(g)
            ? ({
                ok: false,
                error: { code: "UNKNOWN_OUTCOME", message: "simulated crash before this group" },
              } as never)
            : target.commit(g);
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}
