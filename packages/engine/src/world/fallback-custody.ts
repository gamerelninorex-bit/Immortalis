import {
  DurableCompletionEnvelopeSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  FallbackPhysicalEntitySchema,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  WORLD_OPERATION_ACCEPT_FALLBACK,
  WorldLocusSchema,
  productionCompletionKey,
  worldAcceptanceStage,
  worldFallbackEntityKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  type CommitGroup,
  type DurableCompletionEnvelope,
  type FallbackPhysicalEntity,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { WORLD_FALLBACK_RULE, resolveKey } from "../owners/registry.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import { worldActorCouplingGroupCheck } from "./actor-coupling.ts";
import {
  PRESENCE_EXCLUSION,
  presenceBearing,
  worldActorPresenceGroupCheck,
} from "./actor-presence.ts";
import { worldTransitionGroupCheck } from "./entity-transition.ts";
import { worldPcLocusCustodyGroupCheck } from "./pc-locus-custody.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";

/**
 * The World-State fallback objective physical-entity custodian (IM-03; WG "Ownership Guards — F-016 Ratified
 * Fallback Objective Physical-Entity Custody"; WS-003 §2; F-017 CG-2). It is the second half of CG-2: it
 * accepts the SAME conserved reference Production completed, exactly once, and from then on is the sole writer
 * of the durable's physical identity, conserved quantity and condition. It is not a generic Asset or Inventory
 * subsystem: it has one fact kind, create-only (no amendment mechanism exists), keyed by the conserved
 * reference, and it has no adapter method at all — it acts only as an owner operation the IM-02 coordinator
 * resolves, so nothing but an accepted Durable Completion Envelope can create a durable in the world.
 */
export function deriveAcceptedEntity(
  envelope: DurableCompletionEnvelope,
  envelopeVersion: number,
): FallbackPhysicalEntity {
  return {
    entity_id: envelope.conserved_reference,
    entity_class: envelope.completed.output_class,
    quantity: envelope.completed.quantity,
    condition: envelope.completed.condition,
    locality: envelope.locality,
    custodian: {
      owner: OWNER_WORLD_STATE,
      facet: FACET_WORLD_FALLBACK_ENTITY,
      basis: FALLBACK_BASIS,
    },
    accepted_from: {
      owner: OWNER_PRODUCTION,
      fact_key: productionCompletionKey(envelope.operation_id),
      version: envelopeVersion,
      operation_id: envelope.operation_id,
    },
  };
}

/**
 * IM-11 admission of one acceptance. Re-derived from the pinned Durable Completion Envelope, so Production,
 * a consumer or a raw store commit cannot create, alter or duplicate the physical entity: it exists only as
 * the acceptance of the one conserved reference a committed completion carries, at that completion's exact
 * quantity and condition, pinned to the world and locus it is attached to. Create-only (sealed), keyed by the
 * conserved reference: a second acceptance of the same reference is a version conflict.
 */
export function worldEntityGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  // R1 Stage-One v1.1: the actor setup placement, the once-per-world closure and the first physical presence (actor-presence.ts)
  if (
    group.writes.some((w) => {
      const id = resolveKey(w.key)?.kind.id;
      return (
        id === "actor_setup_placement" ||
        id === "world_setup_closure" ||
        id === "actor_physical_presence"
      );
    })
  )
    return worldActorPresenceGroupCheck(group, state);
  // the custodian's fact kind for an existing non-PC actor's one current locus coupling (actor-coupling.ts)
  if (group.writes.some((w) => resolveKey(w.key)?.kind.id === "world_actor_coupling"))
    return worldActorCouplingGroupCheck(group, state);
  // the custodian's fact kind for the active PC's one stationary physical locus (pc-locus-custody.ts)
  if (group.writes.some((w) => resolveKey(w.key)?.kind.id === "world_pc_locus_custody"))
    return worldPcLocusCustodyGroupCheck(group, state);
  // the custodian's other fact kind: the one same-entity transition (entity-transition.ts)
  if (group.writes.some((w) => resolveKey(w.key)?.kind.id === "world_entity_transition"))
    return worldTransitionGroupCheck(group, state);
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  if (group.writes.length !== 1)
    return bad("one acceptance accepts exactly one conserved reference");
  const w = group.writes[0]!;
  const entity = FallbackPhysicalEntitySchema.parse(w.value);
  const completionKey = productionCompletionKey(entity.accepted_from.operation_id);
  if (entity.accepted_from.fact_key !== completionKey) {
    return reject(
      "REFERENCE_INVALID",
      "an acceptance cites its operation's Durable Completion Envelope",
    );
  }
  const completion = requirePrerequisite(
    group,
    state,
    completionKey,
    "the Durable Completion Envelope",
  );
  if (isRejection(completion)) return completion;
  const envelope = DurableCompletionEnvelopeSchema.safeParse(completion.fact.value);
  if (!envelope.success) {
    return reject("REFERENCE_INVALID", "the cited fact is not a Durable Completion Envelope");
  }
  const { world, locus } = entity.locality;
  const locusKey = worldLocusKey(world.entity_id, locus.entity_id);
  if (world.fact_key !== worldProfileKey(world.entity_id) || locus.fact_key !== locusKey) {
    return reject("REFERENCE_INVALID", "locality references do not match their key identities");
  }
  const worldFact = requirePrerequisite(group, state, world.fact_key, "the world profile");
  if (isRejection(worldFact)) return worldFact;
  const locusFact = requirePrerequisite(group, state, locusKey, "the world locus");
  if (isRejection(locusFact)) return locusFact;
  const committedLocus = WorldLocusSchema.safeParse(locusFact.fact.value);
  if (!committedLocus.success || committedLocus.data.world.entity_id !== world.entity_id) {
    return reject("REFERENCE_INVALID", "the locus does not belong to the world", { key: locusKey });
  }
  if (
    w.key !== envelope.data.destination_custodian.entity_fact_key ||
    w.key !== worldFallbackEntityKey(world.entity_id, envelope.data.conserved_reference)
  ) {
    return reject(
      "REFERENCE_INVALID",
      "the accepted entity lives at the destination the completion named",
    );
  }
  // One authority answers "where is it?" (frozen Post-Handover contract §9): a conserved reference that is an active PC's
  // identity is never also a Production-accepted fallback entity, so no rival physical subject exists beside the PC's custody
  if (state.facts.has(worldPcLocusCustodyKey(entity.entity_id))) {
    return reject(
      "REFERENCE_INVALID",
      "an active PC's identity is never accepted as a fallback physical entity: its physical-locus custody is the one authority",
      { key: w.key },
    );
  }
  // likewise a presence-bearing non-PC actor's identity is never also a fallback physical entity (R1 exact-identity exclusion)
  if (presenceBearing(entity.entity_id, state.facts)) {
    return reject("REFERENCE_INVALID", PRESENCE_EXCLUSION, { key: w.key });
  }
  if (!canonicalEqual(entity, deriveAcceptedEntity(envelope.data, completion.fact.version))) {
    return bad(
      "an acceptance is exactly the completed durable: the same conserved reference, quantity and condition, once",
    );
  }
  // available only through its IM-02 stage (the same rule load-time verification applies)
  const identity = stageAuthorityViolation(
    group,
    worldAcceptanceStage(entity.accepted_from.operation_id),
    state.facts,
    envelope.data.completed_at,
    "ADMISSION",
  );
  if (identity) return reject("REFERENCE_INVALID", identity, { key: w.key });
  return null;
}

const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

/**
 * The IM-02 owner-adapter operation of the custodian (CG-2's second half). Pure and deterministic. It reads
 * the committed Durable Completion Envelope (and the world and locus), accepts that same conserved reference
 * and nothing else, or throws StageUnresolvedError: the durable then stays completed-but-unavailable, nothing
 * is published and nothing is credited. It invents nothing: basis/secrecy are inherited from the completion
 * it accepts, never defaulted.
 */
export const worldFallbackAcceptanceProvider: StageProvider = {
  owner: OWNER_WORLD_STATE,
  facet: FACET_WORLD_FALLBACK_ENTITY,
  operation: WORLD_OPERATION_ACCEPT_FALLBACK,
  rule: WORLD_FALLBACK_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const read = input.reads.find((r) => r.fact.owner === OWNER_PRODUCTION);
    if (!read) throw unresolved("SOURCE_ABSENT", "no Durable Completion Envelope was read");
    const envelope = DurableCompletionEnvelopeSchema.safeParse(read.fact.value);
    if (!envelope.success) {
      throw unresolved("SOURCE_INVALID", "the completion is not a Durable Completion Envelope");
    }
    const key = envelope.data.destination_custodian.entity_fact_key;
    if (input.produces.length !== 1 || input.produces[0] !== key) {
      throw unresolved(
        "SOURCE_INVALID",
        "the acceptance does not write the destination the completion named",
      );
    }
    if (input.prior.has(key)) {
      throw unresolved("SOURCE_INVALID", "the conserved reference is already accepted");
    }
    return [
      {
        key,
        value: deriveAcceptedEntity(envelope.data, read.fact.version) as never,
        unit: null,
        basis: read.fact.basis,
        secrecy: read.fact.secrecy,
      },
    ];
  },
};
