/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store to simulate lost replies and crashes */
import {
  PLAYER_CHOICE_AUTHORITY,
  logisticsCommitmentKey,
  logisticsTransferKey,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  type CanonicalTime,
  type CommitGroup,
  type PcMovementCommitInput,
} from "@immortalis/contracts";
import {
  bindTrustedConfirmedPcRelocationContext,
  commitConfirmedPcRelocation,
} from "@immortalis/protocol";
import { LOG_T_DELIVERY } from "@immortalis/testkit";
import { DEST_LOCUS_ID, PC, W, blockingStore, type PcMoveSeeded } from "./pc-movement.ts";
import { RELOCATION_REQUEST } from "./protocol.ts";

export const RELOCATION_MATERIAL = {
  cause: "relocation-cause",
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
} as const;

/** The exact choice a player confirmed: what a trusted service states, never defaulted by the engine. */
export const confirmedChoice = (
  over: { pc_id?: string; world_id?: string; locus_id?: string; authored_under?: unknown } = {},
): PcMovementCommitInput =>
  ({
    pc_id: over.pc_id ?? PC,
    destination: { world_id: over.world_id ?? W, locus_id: over.locus_id ?? DEST_LOCUS_ID },
    authored_under: "authored_under" in over ? over.authored_under : { ...PLAYER_CHOICE_AUTHORITY },
  }) as PcMovementCommitInput;

/** The trusted side's binding for one campaign, after the player's confirmation of `choice`. */
export const trustedRelocation = (
  s: Pick<PcMoveSeeded, "campaign">,
  over: {
    choice?: unknown;
    delivery_at?: unknown;
    publication?: unknown;
  } = {},
) =>
  bindTrustedConfirmedPcRelocationContext({
    campaign: s.campaign,
    choice: ("choice" in over ? over.choice : confirmedChoice()) as PcMovementCommitInput,
    delivery_at: ("delivery_at" in over ? over.delivery_at : LOG_T_DELIVERY) as CanonicalTime,
    publication: ("publication" in over ? over.publication : RELOCATION_MATERIAL) as never,
  });

/** The host's call. The request is passed through verbatim (an explicit `undefined` is a hostile request, not a default). */
export const relocate = (
  context: ReturnType<typeof trustedRelocation>,
  ...request: [] | [unknown]
) => commitConfirmedPcRelocation(context, request.length === 0 ? RELOCATION_REQUEST() : request[0]);

/** The four facts the gateway's chain leaves behind, by key. */
export const RELOCATION_KEYS = [
  pcMovementCommitmentKey(PC),
  pcMovementRequestKey(PC),
  logisticsCommitmentKey(W, PC),
  logisticsTransferKey(W, PC),
];

/** The four groups the gateway commits, in order: PC commitment, PC request, Logistics commitment, Logistics dispatch. */
export const stepPredicates: readonly ((g: CommitGroup) => boolean)[] = [
  (g) => g.writes.some((w) => w.key === pcMovementCommitmentKey(PC)),
  (g) => g.writes.some((w) => w.key === pcMovementRequestKey(PC)),
  (g) => g.writes.some((w) => w.key === logisticsCommitmentKey(W, PC)),
  (g) => g.writes.some((w) => w.key === logisticsTransferKey(W, PC)),
];

/** Swap the campaign's store for one that commits NOTHING (an unknown outcome) for the first group the predicate names. */
export function crashBefore(s: PcMoveSeeded, step: number): () => void {
  const real = s.campaign.store;
  const blocked = blockingStore(real, stepPredicates[step]!);
  (s.campaign as any).store = blocked.store;
  return () => ((s.campaign as any).store = real);
}

/** Swap the campaign's store for one that commits the group of `step` and then LOSES the reply (an unknown outcome). */
export function loseReplyAfter(s: PcMoveSeeded, step: number): () => void {
  const real = s.campaign.store;
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) => {
          const r = await target.commit(g);
          return stepPredicates[step]!(g)
            ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
            : r;
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}
