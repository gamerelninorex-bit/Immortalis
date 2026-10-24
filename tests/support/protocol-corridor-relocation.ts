/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store to simulate lost replies, crashes and a drifted source */
import {
  PROTOCOL_OP_COMMIT_CONFIRMED_PC_CORRIDOR_RELOCATION,
  worldCorridorKey,
  type CanonicalTime,
  type CommitGroup,
  type PcMovementCommitInput,
} from "@immortalis/contracts";
import {
  bindTrustedConfirmedPcCorridorRelocationContext,
  commitConfirmedPcCorridorRelocation,
} from "@immortalis/protocol";
import { FIXTURE_LOCUS_ID, LOG_T_DELIVERY, fixtureDestinationLocus } from "@immortalis/testkit";
import { corridorInput, establishCorridor } from "./logistics-corridor.ts";
import {
  DEST_LOCUS_ID,
  OTHER_DEST,
  PC,
  W,
  custodiedCampaign,
  mvPublication,
  type PcMoveSeeded,
} from "./pc-movement.ts";
import { RELOCATION_MATERIAL, confirmedChoice } from "./protocol-relocation.ts";
import { must } from "./temporal.ts";

/**
 * SYNTHETIC TEST SUPPORT for the corridor-qualified confirmed relocation gateway. The owners are the real ones; the corridor is the
 * SHIPPED World-State owner operation (`establishCorridor`), authored independently of any PC action, and the gateway's chain is the
 * existing PC → Logistics → Temporal → World-State one. Only the delivery boundary is a fixture coordinate (an explicit, externally
 * declared value, never a default) and the corridor statement is free test prose; no duration, speed or access exists anywhere here.
 */
export const ORIGIN = FIXTURE_LOCUS_ID;
export { DEST_LOCUS_ID, OTHER_DEST, PC, W };

/** The key of the one A→B corridor the proof qualifies the relocation by. */
export const CORRIDOR_KEY = worldCorridorKey(W, ORIGIN, DEST_LOCUS_ID);

/** A host request for the corridor gateway: the operation name only, plus whatever hostile extras a test presents. */
export const CORRIDOR_REQUEST = (over: Record<string, unknown> = {}) => ({
  operation: PROTOCOL_OP_COMMIT_CONFIRMED_PC_CORRIDOR_RELOCATION,
  ...over,
});

/** The post-handover PC at its custody origin, one established destination locus, and the ONE source-owned A→B corridor. */
export async function corridorCampaign(dir?: string): Promise<PcMoveSeeded> {
  const s = await custodiedCampaign(dir);
  await establishCorridor(s, 1, corridorInput(ORIGIN, DEST_LOCUS_ID));
  return s;
}

/** A second established locus of the fixture world (a corridor is never a way to create one). */
export const establishOtherLocus = async (s: Pick<PcMoveSeeded, "campaign">, n = 1) =>
  must(
    s.campaign.establishLocus({
      ...mvPublication(800 + n),
      locus: fixtureDestinationLocus(OTHER_DEST),
    }),
  );

/** The trusted side's binding for one campaign, after the player's confirmation of `choice` and the corridor the variant requires. */
export const trustedCorridorRelocation = (
  s: Pick<PcMoveSeeded, "campaign">,
  over: {
    choice?: unknown;
    corridor_key?: unknown;
    delivery_at?: unknown;
    publication?: unknown;
  } = {},
) =>
  bindTrustedConfirmedPcCorridorRelocationContext({
    campaign: s.campaign,
    choice: ("choice" in over ? over.choice : confirmedChoice()) as PcMovementCommitInput,
    corridor_key: ("corridor_key" in over ? over.corridor_key : CORRIDOR_KEY) as string,
    delivery_at: ("delivery_at" in over ? over.delivery_at : LOG_T_DELIVERY) as CanonicalTime,
    publication: ("publication" in over ? over.publication : RELOCATION_MATERIAL) as never,
  });

/** The host's call. The request is passed through verbatim (an explicit `undefined` is a hostile request, not a default). */
export const relocateViaCorridor = (
  context: ReturnType<typeof trustedCorridorRelocation>,
  ...request: [] | [unknown]
) =>
  commitConfirmedPcCorridorRelocation(
    context,
    request.length === 0 ? CORRIDOR_REQUEST() : request[0],
  );

/** Swap the campaign's store for one that answers one key with an edited copy of its fact (a drifted, foreign or stale source). */
export function driftFact(
  s: Pick<PcMoveSeeded, "campaign">,
  key: string,
  edit: (fact: any) => any,
): { restore: () => void; commits: CommitGroup[] } {
  const real = s.campaign.store;
  const commits: CommitGroup[] = [];
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "getFact")
        return (k: string) => {
          const f = target.getFact(k);
          return k === key && f ? edit(structuredClone(f)) : f;
        };
      if (prop === "commit")
        return (g: CommitGroup) => {
          commits.push(g);
          return target.commit(g);
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return { restore: () => ((s.campaign as any).store = real), commits };
}
