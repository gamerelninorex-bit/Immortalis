import { z } from "zod";
import { Id, Version } from "./ids.ts";
import { FALLBACK_BASIS, FACET_WORLD_FALLBACK_ENTITY } from "./production.ts";
import { CanonicalTimeSchema, StageKeySchema, compareTime } from "./temporal.ts";
import { EntityId, FactRefSchema, OWNER_WORLD_STATE } from "./world-foundation.ts";

/**
 * Single-Leg Logistics Transfer & Destination Handoff Backbone Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-010 Logistics (Working Operational Draft v1 / W3-OD-L; lock pin 2026-09-25T02:18:10.619Z)
 *       §2.1 Logistics owns (non-agentive movement-service commitment, transfer-process state, the authoritative
 *       current movement locus while a transfer is active), §2.2 does not own (entity identity, cargo
 *       identity/quantity/condition), §3.1 Movement Service Request (an interface envelope, not Logistics state),
 *       §3.2 Movement-Service Commitment, §3.4 Transfer Record, §9 lifecycle, §10.1 authoritative movement locus,
 *       §10.2 identity/quantity/condition stay with the substantive owner, §10.4 completion, §11 dispatch is not
 *       delivery, §20 temporal integration, §23 cross-owner completion handshake, §26 scaling guards,
 *       §27 failure conditions
 *   F-016 v0.4 ECT-01 (the destination handoff is World-State's existing Entity Transition Close)
 *   F-017 Whole-Engine Dependency Graph v0.3 (the §23 completion edge pair, as a lawful NOW order inside one
 *       engaged temporal object)
 *   RC-02 OwnerFact, RC-04 StageKey, RC-07 CommitGroup, RC-10 TemporalObject (minimum surfaces only)
 *
 * The bounded proof is ONE single-leg, uncontended, non-agentive movement of one already-accepted fallback
 * physical entity from the stationary locus World-State holds to another established locus of the same world:
 *
 *   request → commitment → dispatch (active transfer, Logistics is the movement locus) → delivery-complete result
 *   → World-State's ECT-01 destination commit → Logistics retires the transfer and releases the commitment.
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is also the structural half
 * of the exclusions: there is no field in which a route, a path, a carrier, a capacity, a rate, a priority, a
 * cargo quantity or condition, a loss, a partial delivery, a second leg, a diversion, a labor or agency claim or an
 * actor could be stored. Logistics holds the entity only by REFERENCE: it never copies identity, quantity or
 * condition, and the delivery result it emits is exactly the causing-result envelope World-State's existing
 * entity-transition seam already reads (it names where, never that the entity IS there).
 *
 * Current locus is ONE truth at every stage: before dispatch World-State's stationary locus; while the transfer is
 * active Logistics' movement locus; once World-State has committed the destination, that destination. See the
 * resolver in the engine (`resolveEntityLocus`). Identifiers, owner/facet names and literals the sources do not
 * prescribe are technical encodings.
 */

// ---------------------------------------------------------------------------------------------
// Owner, facet and key spaces (IM-05). One owner and facet: a commitment, a dispatch, a delivery result and a
// retirement are each one group. Every key space is entity-keyed: ONE movement slot per entity, so a second,
// competing or later movement of the same entity is a version conflict and never a sibling truth.
// ---------------------------------------------------------------------------------------------

export const OWNER_LOGISTICS = "logistics";
export const FACET_LOGISTICS_STATE = "logistics_state";

export const logisticsCommitmentKey = (worldId: string, entityId: string): string =>
  `logistics/commitment/${worldId}/${entityId}`;
export const logisticsTransferKey = (worldId: string, entityId: string): string =>
  `logistics/transfer/${worldId}/${entityId}`;
export const logisticsDeliveryKey = (worldId: string, entityId: string): string =>
  `logistics/delivery/${worldId}/${entityId}`;

/**
 * Identities derived from the request identity alone (as stage identities are derived from the StageKey): one
 * request fixes one commitment, one transfer, one delivery result, one causal process, one temporal object and one
 * earned boundary. Nothing here is a clock, a counter or a random value, so a retry or a replay reaches the same
 * identities and a second commitment, transfer or delivery can never be minted by accident.
 */
export const logisticsCommitmentId = (requestId: string): string => `commitment:${requestId}`;
export const logisticsTransferId = (requestId: string): string => `transfer:${requestId}`;
/** The identity of the delivery-complete result: it is also the cause identity of World-State's transition. */
export const LOGISTICS_DELIVERY_PREFIX = "delivery:";
export const logisticsDeliveryId = (requestId: string): string =>
  `${LOGISTICS_DELIVERY_PREFIX}${requestId}`;
export const LOGISTICS_PROCESS_PREFIX = "logistics-transfer:";
export const logisticsProcessId = (requestId: string): string =>
  `${LOGISTICS_PROCESS_PREFIX}${requestId}`;
export const LOGISTICS_OBJECT_PREFIX = "obj-logistics-";
export const logisticsObjectId = (requestId: string): string =>
  `${LOGISTICS_OBJECT_PREFIX}${requestId}`;
export const logisticsBoundaryId = (requestId: string): string =>
  `boundary-logistics-delivery-${requestId}`;
/** The request a delivery identity was derived from, or null when it is not a Logistics delivery identity. */
export const logisticsRequestIdOfDelivery = (deliveryId: string): string | null =>
  deliveryId.startsWith(LOGISTICS_DELIVERY_PREFIX) &&
  deliveryId.length > LOGISTICS_DELIVERY_PREFIX.length
    ? deliveryId.slice(LOGISTICS_DELIVERY_PREFIX.length)
    : null;

/**
 * The two Logistics owner operations of the one engaged temporal object. Between them lies World-State's own
 * destination commit (the ECT-01 stage): Logistics completion → destination/substantive-owner commit → Logistics
 * retirement (WS-010 §10.4, §23).
 */
export const LOGISTICS_OPERATION_ESTABLISH_DELIVERY = "logistics-establish-delivery";
export const LOGISTICS_OPERATION_RETIRE_TRANSFER = "logistics-retire-transfer";

export const logisticsDeliveryStage = (requestId: string) =>
  ({
    causal_process_id: logisticsProcessId(requestId),
    owner_operation: { owner: OWNER_LOGISTICS, operation: LOGISTICS_OPERATION_ESTABLISH_DELIVERY },
    prospective_result_id: logisticsDeliveryId(requestId),
  }) as const;
export const logisticsRetirementStage = (requestId: string) =>
  ({
    causal_process_id: logisticsProcessId(requestId),
    owner_operation: { owner: OWNER_LOGISTICS, operation: LOGISTICS_OPERATION_RETIRE_TRANSFER },
    prospective_result_id: `retirement:${requestId}`,
  }) as const;

const Locality = z.strictObject({ world: FactRefSchema, locus: FactRefSchema });
const FactPin = z.strictObject({ fact_key: Id, version: Version.min(1) });
/** A World-State corridor read by Logistics: its owner, its own key and the exact committed version read. */
const CorridorPin = z.strictObject({
  owner: z.literal(OWNER_WORLD_STATE),
  fact_key: Id,
  version: Version.min(1),
});

/** The substantive owner of the moved entity: World-State's fallback custodian. Logistics is never it. */
const SubstantiveOwner = z.strictObject({
  owner: z.literal(OWNER_WORLD_STATE),
  facet: z.literal(FACET_WORLD_FALLBACK_ENTITY),
  basis: z.literal(FALLBACK_BASIS),
});

// ---------------------------------------------------------------------------------------------
// Movement Service Request (WS-010 §3.1): an interface envelope from another owner, held in THAT owner's own key
// space. Logistics consumes and pins it; it is not Logistics-owned state, and it transfers no ownership of the
// moved thing or of the downstream purpose. Authorization is the source owner's own establishment of the request:
// Logistics adjudicates no authority, and none is representable (the priority/authority reference is null).
// ---------------------------------------------------------------------------------------------

export const MovementServiceRequestSchema = z.strictObject({
  request_id: EntityId,
  /** the requesting owner and its own reference (an opaque reference, never a copied fact) */
  source: z.strictObject({ owner: Id, cause_ref: Id }),
  /** the moved entity: referenced, never copied (identity, quantity and condition stay with World-State) */
  subject: z.strictObject({ fact_key: Id, entity_id: EntityId }),
  /** the destination or use locus: an established locus of the entity's world */
  destination: Locality,
  /** a lawful priority/allocation authority reference where one exists: none is representable here */
  priority_authority_ref: z.null(),
});
export type MovementServiceRequest = z.infer<typeof MovementServiceRequestSchema>;

// ---------------------------------------------------------------------------------------------
// Movement-Service Commitment (WS-010 §3.2, §4.1): the authoritative Logistics commitment for NON-AGENTIVE
// movement service only. It carries no capacity amount (no arbitration exists), no path/hub/carrier basis (no
// routing exists) and no external commitment reference (no agentive carrier exists). Terms are immutable; the only
// lifecycle is COMMITTED → RELEASED, and release is lawful only as the retirement stage, after the destination
// owner's commit (WS-010 §10.4, §23.5).
// ---------------------------------------------------------------------------------------------

export const LogisticsCommitmentSchema = z
  .strictObject({
    commitment_id: EntityId,
    /** the pinned foreign request; never copied */
    request: z.strictObject({
      owner: Id,
      fact_key: Id,
      request_id: EntityId,
      version: Version.min(1),
    }),
    /**
     * Present ONLY on the explicitly source-qualified path: the World-State corridor (the topological fact that the origin locus is
     * connected to the destination locus, in that order) this commitment read, pinned at the version read and never copied. Its
     * absence is the route-less foundation commitment, unchanged and still lawful. The pin supplies no duration, access, capability or
     * delivery: it only records which source-owned connection Logistics read before it committed.
     */
    corridor: CorridorPin.optional(),
    /** the moved entity, pinned at the version read: identity, quantity and condition stay with its owner */
    moved: z.strictObject({
      fact_key: Id,
      entity_id: EntityId,
      version: Version.min(1),
      substantive_owner: SubstantiveOwner,
    }),
    /** the stationary World-State locus the entity leaves: its accepted locality, history that stays true */
    origin: Locality,
    destination: Locality,
    service_basis: z.literal("NON_AGENTIVE_SINGLE_LEG_UNCONTENDED"),
    committed_at: CanonicalTimeSchema,
    /** the one explicit, declared delivery boundary: fixture evidence, never a Logistics default (no calibration) */
    delivery: z.strictObject({ boundary_id: Id, at: CanonicalTimeSchema }),
    /** WS-010 §23.5: the commitment is released only after the destination owner's commit */
    release_condition: z.literal("AFTER_DESTINATION_OWNER_COMMIT"),
    state: z.discriminatedUnion("status", [
      z.strictObject({ status: z.literal("COMMITTED") }),
      z.strictObject({
        status: z.literal("RELEASED"),
        released_at: CanonicalTimeSchema,
        destination_commit: FactPin,
        by_stage: StageKeySchema,
      }),
    ]),
  })
  .superRefine((c, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (compareTime(c.committed_at, c.delivery.at) !== -1)
      bad("the delivery boundary lies after the commitment", ["delivery"]);
    if (c.origin.world.entity_id !== c.destination.world.entity_id)
      bad("a single-leg movement stays within its world", ["destination"]);
    if (c.origin.locus.entity_id === c.destination.locus.entity_id)
      bad("a movement changes the locus", ["destination"]);
  });
export type LogisticsCommitment = z.infer<typeof LogisticsCommitmentSchema>;

// ---------------------------------------------------------------------------------------------
// Transfer Record (WS-010 §3.4, §10.1): exists only from dispatch. While IN_TRANSFER it is the sole authoritative
// current movement locus of the entity. It is never the owner of the entity and holds no quantity or condition. It
// is retired only by the retirement stage, after the destination owner has committed (§10.4, §23.5).
// ---------------------------------------------------------------------------------------------

export const LogisticsTransferSchema = z
  .strictObject({
    transfer_id: EntityId,
    /** the commitment backing the transfer, pinned at its establishment (terms are immutable) */
    commitment: z.strictObject({
      fact_key: Id,
      commitment_id: EntityId,
      version: Version.min(1),
    }),
    request: z.strictObject({ request_id: EntityId }),
    /** the moved entity: referenced, never copied */
    moved: z.strictObject({ fact_key: Id, entity_id: EntityId }),
    /** the canonical basis the dispatch committed at; the delivery result is established from it */
    dispatched_at: CanonicalTimeSchema,
    state: z.discriminatedUnion("status", [
      z.strictObject({
        status: z.literal("IN_TRANSFER"),
        /**
         * The authoritative current movement locus (WS-010 §10.1): from dispatch until the destination owner's
         * commit the entity carries this reference instead of a rival current location. A single leg between two
         * established loci: no path, no carrier, no position exists.
         */
        movement_locus: z.strictObject({
          authority: z.literal("LOGISTICS_TRANSFER_RECORD"),
          leg: z.literal("SINGLE_LEG"),
          from: Locality,
          to: Locality,
        }),
      }),
      z.strictObject({
        status: z.literal("RETIRED"),
        /** the movement locus is closed: it is the destination owner's commit that now answers "where" */
        movement_locus: z.literal("CLOSED"),
        /** WS-010 §10.4(1): Logistics' own delivery-complete result, pinned */
        delivery: FactPin,
        /** WS-010 §23.5: the destination/substantive owner's committed result, pinned: retirement follows it */
        destination_commit: FactPin,
        retired_at: CanonicalTimeSchema,
        by_stage: StageKeySchema,
      }),
    ]),
  })
  .superRefine((t, ctx) => {
    if (t.state.status === "RETIRED" && t.state.delivery.version !== 1)
      ctx.addIssue({
        code: "custom",
        message: "a delivery result is read at its establishment (version 1)",
        path: ["state"],
      });
  });
export type LogisticsTransfer = z.infer<typeof LogisticsTransferSchema>;

// ---------------------------------------------------------------------------------------------
// Inputs of the two authored Logistics publications that are not stage operations.
// ---------------------------------------------------------------------------------------------

export const CommitMovementInputSchema = z.strictObject({
  /** the key of the committed Movement Service Request in its source's own key space */
  request_key: Id,
  /** the explicit, declared delivery boundary of this commitment (a declared value, never a Logistics default) */
  delivery_at: CanonicalTimeSchema,
});
export type CommitMovementInput = z.infer<typeof CommitMovementInputSchema>;

/**
 * The explicitly source-qualified commitment: the request and the declared delivery boundary as for `CommitMovementInput`, plus the
 * key of the World-State corridor Logistics must read and pin. The corridor key is named, never searched for, and it supplies no
 * delivery boundary: the declared boundary stays the caller's, and no route, duration or access is representable.
 */
export const CommitCorridorMovementInputSchema = z.strictObject({
  request_key: Id,
  corridor_key: Id,
  delivery_at: CanonicalTimeSchema,
});
export type CommitCorridorMovementInput = z.infer<typeof CommitCorridorMovementInputSchema>;

export const DispatchMovementInputSchema = z.strictObject({
  request_key: Id,
});
export type DispatchMovementInput = z.infer<typeof DispatchMovementInputSchema>;
