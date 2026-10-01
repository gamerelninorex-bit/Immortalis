import {
  CANON_WRITE_AUTHORITY,
  logisticsBoundaryId,
  logisticsObjectId,
  type CanonicalTime,
  type CommitGroup,
  type MovementServiceRequest,
  type ResolutionRequest,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  economyRealizationProvider,
  productionCompletionProvider,
  worldEntityTransitionProvider,
  worldFallbackAcceptanceProvider,
  type StageOwnerExtension,
  type WriteAdmission,
} from "@immortalis/engine";
import { FIXTURE_WORLD_ID } from "./canonical-fixtures.ts";
import {
  DEST_LOCUS_ID,
  ENTITY_FIXTURE_EXTENSION,
  acceptedEntityId,
  acceptedEntityKey,
  entityConsumerCloseProvider,
  entityConsumerNowProvider,
  locusRef,
} from "./entity-fixtures.ts";
import { PROD_T1, prodAdvanceRequest } from "./production-fixtures.ts";
import { SYNTH_RULE, at } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Single-Leg Logistics Transfer & Destination Handoff Backbone Foundation. Every owner,
 * key, identifier and coordinate below is a fixture, not IMMORTALIS canon: it carries no game semantics and no
 * calibration — in particular NO travel time, duration, capacity, throughput, route or priority is defined here
 * (the declared delivery boundary is a test coordinate, never a Logistics default). The Logistics owner and the
 * World-State fallback custodian are NOT synthetic and live in @immortalis/engine; what is synthetic is the
 * OTHER party of the proof — a test movement REQUESTER that commits Movement Service Requests in its own key
 * space (the interface envelope WS-010 §3.1 puts with the requesting owner), registered through an extension that
 * cannot write a canonical, kernel, Population, Production, Economy, World-State or Logistics key space. It is no
 * canonical gameplay subsystem and never becomes the owner of Logistics state, of the entity or of its location.
 * Production code must never import this package (Bootstrap Plan §2.2).
 */
export const SYNTH_MOVEMENT_REQUESTER_OWNER = "SYNTHETIC-MOVEMENT-REQUESTER";
const REQUESTER_FACET = "synthetic-movement-requester";
const REQUESTER_PREFIX = "synthetic-movement-request/";

const REQUESTER_ADMISSION: WriteAdmission = {
  check(group) {
    for (const w of group.writes) {
      if (!w.key.startsWith(REQUESTER_PREFIX)) {
        return {
          code: "KEY_NOT_ADMITTED",
          message: "not this synthetic owner's key",
          details: { key: w.key },
        };
      }
    }
    return null;
  },
};

/** The entity proof's parties (production requester, cause owner, consumer) plus the movement requester. */
export const LOGISTICS_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([
    ...ENTITY_FIXTURE_EXTENSION.owners,
    [SYNTH_MOVEMENT_REQUESTER_OWNER, new Set([REQUESTER_FACET])],
  ]),
  admission: {
    check(group, state) {
      if (group.owner === SYNTH_MOVEMENT_REQUESTER_OWNER)
        return REQUESTER_ADMISSION.check(group, state);
      return ENTITY_FIXTURE_EXTENSION.admission?.check(group, state) ?? null;
    },
  },
};

// -- coordinates (test coordinates only) -------------------------------------------------------------------
/** the explicit, declared delivery boundary of the primary movement (fixture evidence, never a default) */
export const LOG_T_DELIVERY = at(200);
/** a later canonical instant, after the commitment, to dispatch at (a test coordinate) */
export const LOG_T_DISPATCH_LATER = at(160);
/** a later, unrelated boundary */
export const LOG_T_OTHER = at(260);
export { PROD_T1 };

export const MOVE_1 = "move-1";
export const MOVE_2 = "move-2";
export const MOVE_OTHER = "move-other";

export const movementRequestKey = (requestId: string): string => `${REQUESTER_PREFIX}${requestId}`;

/** A movement request for the accepted entity of production request `entityRequestId`. */
export const movementRequest = (
  requestId: string,
  entityRequestId: string,
  over: { destination?: string; destination_world?: string } & Partial<
    Omit<MovementServiceRequest, "destination">
  > = {},
): MovementServiceRequest => {
  const { destination, destination_world, ...rest } = over;
  return {
    request_id: requestId,
    source: { owner: SYNTH_MOVEMENT_REQUESTER_OWNER, cause_ref: `synthetic-need-${requestId}` },
    subject: {
      fact_key: acceptedEntityKey(entityRequestId),
      entity_id: acceptedEntityId(entityRequestId),
    },
    destination: locusRef(destination ?? DEST_LOCUS_ID, destination_world ?? FIXTURE_WORLD_ID),
    priority_authority_ref: null,
    ...rest,
  };
};

/** A synthetic-requester publication: create (version 0) or advance. */
export function movementRequestGroup(
  campaignId: string,
  n: number,
  requestId: string,
  value: unknown,
  expectedVersion = 0,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `mov-fixture-group-${n}`,
    intent_id: `mov-fixture-intent-${n}`,
    owner: SYNTH_MOVEMENT_REQUESTER_OWNER,
    facet: REQUESTER_FACET,
    cause: `mov-fixture-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key: movementRequestKey(requestId),
        owner: SYNTH_MOVEMENT_REQUESTER_OWNER,
        facet: REQUESTER_FACET,
        value: value as never,
        unit: null,
        basis: "mov-fixture-basis",
        secrecy: "mov-fixture-secrecy",
        expected_version: expectedVersion,
      },
    ],
  };
}

export const commitInput = (requestId: string, over: { delivery_at?: CanonicalTime } = {}) => ({
  request_key: movementRequestKey(requestId),
  delivery_at: over.delivery_at ?? LOG_T_DELIVERY,
});
export const dispatchInput = (requestId: string) => ({
  request_key: movementRequestKey(requestId),
});

export const logisticsProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionCompletionProvider,
    worldFallbackAcceptanceProvider,
    economyRealizationProvider,
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
    entityConsumerNowProvider,
    entityConsumerCloseProvider,
  ]);

export const logPublication = (n: number) => ({
  group_id: `log-group-${n}`,
  intent_id: `log-intent-${n}`,
  cause: `log-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** Toward PROD_T1, stopping once the transfer's declared delivery boundary has resolved. */
export const logStopAtBoundaryRequest = (
  id: string,
  requestId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest =>
  prodAdvanceRequest(id, PROD_T1, {
    requested: {
      target: PROD_T1,
      condition: {
        kind: "STOP_AFTER_BOUNDARY",
        object_id: logisticsObjectId(requestId),
        boundary_id: logisticsBoundaryId(requestId),
      },
    },
    ...over,
  });

export { prodAdvanceRequest };
