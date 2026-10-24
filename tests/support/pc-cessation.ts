/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary fact values */
import {
  CANON_WRITE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  PLAYER_CHOICE_AUTHORITY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  pcCollectionCessationKey,
  pcCollectionCommitmentKey,
  popPcOccupancyKey,
  productionExtractionObjectId,
  productionPcCollectionTerminationKey,
  productionPcCollectionWorkKey,
  temporalObjectKey,
  worldPcLocusCustodyKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { advanceToRequest } from "@immortalis/testkit";
import {
  bindTrustedConfirmedPcCessationContext,
  ceaseConfirmedPcCollection,
} from "@immortalis/protocol";
import { ACT_A, PC, at, extractionId, type CollectionSeeded } from "./pc-collection.ts";
import { must } from "./temporal.ts";

/**
 * SYNTHETIC TEST SUPPORT for the BLUE clause D-1 (PC Collection Voluntary Cessation) PROVISIONAL candidate lowering (proposed, NOT
 * adopted). The trusted context stands for the player's SEPARATE confirmation of the stop; the operator command is the non-fixture
 * ingress and is exercised in `operator-pc-cessation.test.ts`. Nothing here is live proof of a player, a host or a reading.
 */
export const CEASE_REQ = { operation: "cease_confirmed_pc_collection" };

export const cessationChoice = (actId = ACT_A, over: Record<string, unknown> = {}) => ({
  pc_id: PC,
  act_id: actId,
  authored_under: { ...PLAYER_CHOICE_AUTHORITY },
  ...over,
});

export const trustedCessation = (
  s: Pick<CollectionSeeded, "campaign">,
  actId = ACT_A,
  over: { choice?: unknown; campaign?: unknown } = {},
) =>
  bindTrustedConfirmedPcCessationContext({
    campaign: ("campaign" in over ? over.campaign : s.campaign) as never,
    choice: ("choice" in over ? over.choice : cessationChoice(actId)) as never,
    publication: {
      cause: `cause-cease-${actId}`,
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
    },
  });

/** The host's call after the player's separate confirmation of the stop. */
export const cease = (s: Pick<CollectionSeeded, "campaign">, actId = ACT_A) =>
  ceaseConfirmedPcCollection(trustedCessation(s, actId), CEASE_REQ);

export const ceasePublication = (n: string) => ({
  group_id: `cease-group-${n}`,
  intent_id: `cease-intent-${n}`,
  cause: `cease-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** A raw time advance through the Temporal kernel itself (not the PC's gateway): used to model time passing by other means. */
export const rawAdvance = (s: CollectionSeeded, id: string, target: number) =>
  s.coordinator.advance(advanceToRequest(id, at(target)));
export const rawAdvanceOk = async (s: CollectionSeeded, id: string, target: number) =>
  must(rawAdvance(s, id, target));

export const objectIdOf = (actId = ACT_A) => productionExtractionObjectId(extractionId(actId));
export const indexHasObject = (s: CollectionSeeded, actId = ACT_A): boolean =>
  s.coordinator.boundaryIndex().entries.some((e) => e.object_id === objectIdOf(actId));
export const revision = (s: Pick<CollectionSeeded, "campaign">): number =>
  s.campaign.store.head().revision;

/** The keys the cessation, termination, release and retirement concern. */
export const keys = (actId = ACT_A) => ({
  cessation: pcCollectionCessationKey(PC, actId),
  termination: productionPcCollectionTerminationKey(extractionId(actId)),
  occupancy: popPcOccupancyKey(PC),
  object: temporalObjectKey(objectIdOf(actId)),
  index: TEMPORAL_BOUNDARY_INDEX_KEY,
  work: productionPcCollectionWorkKey(extractionId(actId)),
  commitment: pcCollectionCommitmentKey(PC, actId),
  binding: PLAYER_CHARACTER_BINDING_KEY,
  custody: worldPcLocusCustodyKey(PC),
  clock: TEMPORAL_STATE_KEY,
});

/**
 * A hand-built raw commit group (the way a hostile or buggy caller of `store.commit` would build one): the writes are exactly what
 * is passed, each stamped with the kind's owner and facet, and the reads and dependencies pin the named facts at their CURRENT
 * versions, so only the group's own content decides whether admission accepts it.
 */
export function forge(
  s: Pick<CollectionSeeded, "campaign">,
  n: string,
  owner: string,
  facet: string,
  rule: CommitGroup["rule"],
  writes: readonly { key: string; value: unknown; expected_version: number }[],
  readKeys: readonly string[],
): CommitGroup {
  const store = s.campaign.store;
  return {
    campaign_id: store.head().campaign_id,
    group_id: `forge-group-${n}`,
    intent_id: `forge-intent-${n}`,
    owner,
    facet,
    cause: `forge-cause-${n}`,
    rule,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: readKeys.map((k) => ({ key: k, version: store.getFact(k)?.version ?? 0 })),
    depends_on: [...new Set(readKeys.flatMap((k) => store.getFact(k)?.provenance.group_id ?? []))],
    writes: writes.map((w) => ({
      key: w.key,
      owner,
      facet,
      value: w.value as any,
      unit: null,
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      expected_version: w.expected_version,
    })),
  };
}

export const refusedWith = async (
  p: Promise<{ ok: boolean; error?: { code: string; message?: string } }>,
): Promise<string> => {
  const r = await p;
  if (r.ok) throw new Error("expected a refusal but the commit was admitted");
  return r.error?.code ?? "NO_CODE";
};
