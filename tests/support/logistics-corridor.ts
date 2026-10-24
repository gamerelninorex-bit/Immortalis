import {
  worldCorridorKey,
  type CanonicalTime,
  type EstablishCorridorInput,
} from "@immortalis/contracts";
import {
  DEST_LOCUS_ID,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  LOG_T_DELIVERY,
  MOVE_1,
  REQ_1,
  logPublication,
  movementRequestKey,
  publication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";
import {
  acceptLogEntity,
  commitMovementRequest,
  registerTransfer,
  type LogSeeded,
} from "./logistics.ts";
import { dispatchInput } from "@immortalis/testkit";

/**
 * Disposable, scenario-authored topology for the source-qualified corridor proof. Everything is a test coordinate: the corridor
 * statement is free test prose, and NO distance, duration, rate or access is defined here or anywhere in the proof.
 */
export const CORRIDOR_STATEMENT =
  "a footpath between the two settlements (test prose, never interpreted)";

export const corridorInput = (
  from = FIXTURE_LOCUS_ID,
  to = DEST_LOCUS_ID,
  over: Partial<EstablishCorridorInput> = {},
): EstablishCorridorInput => ({
  world_id: FIXTURE_WORLD_ID,
  from_locus_id: from,
  to_locus_id: to,
  statement: CORRIDOR_STATEMENT,
  ...over,
});

export const corridorKeyOf = (
  from = FIXTURE_LOCUS_ID,
  to = DEST_LOCUS_ID,
  world = FIXTURE_WORLD_ID,
) => worldCorridorKey(world, from, to);

/** A World-State publication of a corridor (its own identities, so no collision with the seeded canonical publications). */
export const corridorPublication = (n: number) => ({
  ...publication(500 + n),
  group_id: `corridor-group-${n}`,
  intent_id: `corridor-intent-${n}`,
  cause: `corridor-cause-${n}`,
});

export async function establishCorridor(
  s: Pick<LogSeeded, "campaign">,
  n = 1,
  input: EstablishCorridorInput = corridorInput(),
): Promise<void> {
  await must(s.campaign.establishCorridor({ ...corridorPublication(n), corridor: input }));
}

export const corridorCommit = (
  requestId: string,
  over: { corridor_key?: string; delivery_at?: CanonicalTime } = {},
) => ({
  request_key: movementRequestKey(requestId),
  corridor_key: over.corridor_key ?? corridorKeyOf(),
  delivery_at: over.delivery_at ?? LOG_T_DELIVERY,
});

/** accept the entity, commit its request, then the SOURCE-QUALIFIED commitment (the corridor must already be established) */
export async function acceptAndCommitViaCorridor(
  s: LogSeeded,
  entityRequest = REQ_1,
  moveId = MOVE_1,
  n = 1,
): Promise<void> {
  await acceptLogEntity(s, entityRequest, n);
  await commitMovementRequest(s, moveId, entityRequest, n);
  await must(
    s.logistics.commitCorridorMovement({ ...logPublication(n), commit: corridorCommit(moveId) }),
  );
}

/** the full pre-boundary setup of the corridor path: corridor, accept, commit via corridor, dispatch, register the transfer's object */
export async function corridorCommitDispatchRegister(
  s: LogSeeded,
  entityRequest = REQ_1,
  moveId = MOVE_1,
  n = 1,
): Promise<void> {
  await establishCorridor(s);
  await acceptAndCommitViaCorridor(s, entityRequest, moveId, n);
  await must(s.logistics.dispatch({ ...logPublication(100 + n), dispatch: dispatchInput(moveId) }));
  await registerTransfer(s, entityRequest, 30 + n);
}
