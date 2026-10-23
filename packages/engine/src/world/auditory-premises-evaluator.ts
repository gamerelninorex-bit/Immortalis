import {
  ActorPhysicalPresenceSchema,
  ActorRawSensoryStateSchema,
  WorldAcousticEmissionSchema,
  WorldLocusSchema,
  actorPhysicalPresenceKey,
  actorRawSensoryStateKey,
  worldAcousticEmissionKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  type CanonicalTime,
  type FactRef,
  type FactVersionPin,
  type OwnerFact,
} from "@immortalis/contracts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import { canonicalEqual } from "../hash.ts";
import { rawSensoryPremisesViolation } from "./auditory-premises.ts";
import type { CampaignStore } from "../persistence/store.ts";

/**
 * S1-P1 Auditory Premises — the pure, read-only composition (WG "S1-P1 — BLUE executable lowering freeze", "Composition, close
 * and acceptance boundary"; F-014D "S1-P1 Upstream Auditory Premises Consumer Boundary").
 *
 * It reads the ACTUAL committed exact pins of one actor's R1 B2 presence, W1 raw sensory state, the typed profile of the original
 * locus and one source-owned acoustic emission, and answers one question about the World-State physical SOURCE premises:
 *
 *  - `SOURCE_PREMISES_READY_FOR_HEALTH`: every physical premise exists, in the lawful causal and Temporal order, so that a
 *    SUBSEQUENT event-basis Health Sensory Function Close may be requested. It is a proposal to run Health later. It is not a
 *    hearing, not a Health `AVAILABLE`, not an access event, packet, receipt, retention or knowledge, and no singleton
 *    `BOUNDED_SHARED_ACCESS` or `BROADCAST_EXPOSURE` may stand for it.
 *  - `REFUSED`: a conclusive negative of the faculty or of the channel/source (raw transduction absent, not receptive, no typed
 *    profile, no qualified or actual emission, an emission at another locus, a non-actor subject).
 *  - `UNRESOLVED`: a premise is missing, unknown, stale, malformed, contradictory or its Temporal or journal order conflicts.
 *
 * It is NOT a canonical fact: it takes a reader, never a writer, performs no commit, touches no Health, Epistemic, Named-Actor or
 * cognition state, and reads no clock (every instant it compares was fixed by the committed Temporal state at its own admission,
 * which the historical verifier re-proves; elapsed time after the event does not change the answer, elapsed time BETWEEN the
 * premises does). Every negative has no positive candidate.
 */

export const SOURCE_PREMISES_READY_FOR_HEALTH = "SOURCE_PREMISES_READY_FOR_HEALTH" as const;

/** Conclusive negatives of the faculty or of the channel/source. */
export const AUDITORY_REFUSAL_CODES = [
  "ACTOR_NOT_LAWFUL_NON_PC",
  "ACOUSTIC_PROFILE_ABSENT",
  "NO_ACTUAL_EMISSION",
  "EMITTER_NOT_QUALIFIED",
  "EMISSION_NOT_AT_ACTOR_LOCUS",
  "RAW_TRANSDUCTION_ABSENT",
  "ORDINARY_RECEPTIVITY_NONRECEPTIVE",
] as const;
export type AuditoryRefusalCode = (typeof AUDITORY_REFUSAL_CODES)[number];

/** Missing, unknown, stale, malformed, contradictory or order-conflicted premises. */
export const AUDITORY_UNRESOLVED_CODES = [
  "LOCUS_MISSING",
  "SETUP_CLOSURE_MISSING",
  "PRESENCE_MISSING",
  "RAW_SENSORY_MISSING",
  "OWNER_RULE_NOT_VERIFIED",
  "SOURCE_MALFORMED",
  "PREMISE_PIN_MISMATCH",
  "TEMPORAL_BASIS_CONFLICT",
  "CAUSAL_ORDER_CONFLICT",
  "RAW_TRANSDUCTION_UNKNOWN",
  "ORDINARY_RECEPTIVITY_UNKNOWN",
] as const;
export type AuditoryUnresolvedCode = (typeof AUDITORY_UNRESOLVED_CODES)[number];

/** What the evaluator reads: committed facts, journal positions and the evidence that the owner rules ran. Never a writer. */
export type AuditoryPremisesReader = Pick<CampaignStore, "getFact" | "lookupReceipt"> &
  Partial<Pick<CampaignStore, "ruleCheckedGroupIds">>;

/** One actor, one world/locus, one candidate emission: the whole question. */
export interface AuditoryPremisesRequest {
  readonly actor_id: string;
  readonly world_id: string;
  readonly locus_id: string;
  readonly emission_id: string;
}

export interface AuditoryPremisesReady {
  readonly result: typeof SOURCE_PREMISES_READY_FOR_HEALTH;
  readonly actor_id: string;
  readonly world: FactRef;
  readonly locus: FactRef;
  /** the one Temporal canonical time all three physical premises were established at */
  readonly event_instant: CanonicalTime;
  /** the exact committed pins the answer rests on */
  readonly premises: {
    readonly locus: FactVersionPin;
    readonly presence: FactVersionPin;
    readonly raw_sensory: FactVersionPin;
    readonly emission: FactVersionPin;
  };
  /** the only thing this result proposes; it grants nothing */
  readonly next_required: "HEALTH_SENSORY_FUNCTION_CLOSE";
}
export interface AuditoryPremisesRefused {
  readonly result: "REFUSED";
  readonly code: AuditoryRefusalCode;
  readonly message: string;
}
export interface AuditoryPremisesUnresolved {
  readonly result: "UNRESOLVED";
  readonly code: AuditoryUnresolvedCode;
  readonly message: string;
}
export type AuditoryPremisesResult =
  AuditoryPremisesReady | AuditoryPremisesRefused | AuditoryPremisesUnresolved;

const refused = (code: AuditoryRefusalCode, message: string): AuditoryPremisesRefused => ({
  result: "REFUSED",
  code,
  message,
});
const unresolved = (code: AuditoryUnresolvedCode, message: string): AuditoryPremisesUnresolved => ({
  result: "UNRESOLVED",
  code,
  message,
});

export function evaluateAuditoryPremises(
  reader: AuditoryPremisesReader,
  request: AuditoryPremisesRequest,
): AuditoryPremisesResult {
  const { actor_id: actorId, world_id: worldId, locus_id: locusId } = request;
  const worldKey = worldProfileKey(worldId);
  const locusKey = worldLocusKey(worldId, locusId);
  const emissionKey = worldAcousticEmissionKey(worldId, locusId, request.emission_id);
  const presenceKey = actorPhysicalPresenceKey(actorId);
  const rawKey = actorRawSensoryStateKey(actorId);
  const closureKey = worldSetupClosureKey(worldId);

  // 1. the sources, each by exact key: a missing source is never invented
  const worldFact = reader.getFact(worldKey);
  const locusFact = reader.getFact(locusKey);
  if (!worldFact || !locusFact) {
    return unresolved("LOCUS_MISSING", "the world and the original locus are not committed");
  }
  const locusParsed = WorldLocusSchema.safeParse(locusFact.value);
  if (!locusParsed.success) {
    return unresolved("SOURCE_MALFORMED", "the locus does not parse as a world_locus");
  }
  const profile = locusParsed.data.acoustic_profile_v1;
  if (profile === undefined) {
    return refused(
      "ACOUSTIC_PROFILE_ABSENT",
      "the original locus carries no typed pre-seal acoustic profile: free-text constraints establish no whole-locus acoustic premise",
    );
  }
  const emissionFact = reader.getFact(emissionKey);
  if (!emissionFact) {
    return refused(
      "NO_ACTUAL_EMISSION",
      "no source-authored emission is committed: the profile's possible impulse is not an event",
    );
  }
  const presenceFact = reader.getFact(presenceKey);
  if (!presenceFact) {
    return unresolved(
      "PRESENCE_MISSING",
      "the actor's committed R1 B2 physical presence is missing (a coupling, a capability basis or a setup placement is not a position)",
    );
  }
  const rawFact = reader.getFact(rawKey);
  if (!rawFact) {
    return unresolved(
      "RAW_SENSORY_MISSING",
      "the actor's owner-authored raw sensory state (W1) is missing (a capability basis or a coupling is not a faculty)",
    );
  }
  const closureFact = reader.getFact(closureKey);
  if (!closureFact) {
    return unresolved("SETUP_CLOSURE_MISSING", "the world's setup closure is not committed");
  }

  // 2. the evidence that the owner rules demonstrably ran for every group the answer rests on
  const ran = reader.ruleCheckedGroupIds?.();
  const chain = [locusFact, closureFact, presenceFact, rawFact, emissionFact];
  if (ran === undefined || chain.some((f) => !ran.has(f.provenance.group_id))) {
    return unresolved(
      "OWNER_RULE_NOT_VERIFIED",
      "the owner admission or historical verification did not demonstrably run for every premise: a snapshot that says nothing is not a pass",
    );
  }

  // 3. every premise is exactly what its contract says
  const presence = ActorPhysicalPresenceSchema.safeParse(presenceFact.value);
  const raw = ActorRawSensoryStateSchema.safeParse(rawFact.value);
  const emission = WorldAcousticEmissionSchema.safeParse(emissionFact.value);
  if (!presence.success || !raw.success || !emission.success) {
    return unresolved("SOURCE_MALFORMED", "a premise does not parse as its contract");
  }
  const b2 = presence.data;
  const w1 = raw.data;
  const em = emission.data;

  // 4. the subject is a lawful non-PC actor: a PC or aggregate is a conclusive negative of this producer
  const boundary = actorBoundaryViolation(
    { get: (k) => reader.getFact(k), has: (k) => reader.getFact(k) !== undefined },
    actorId,
  );
  if (boundary) return refused("ACTOR_NOT_LAWFUL_NON_PC", boundary);

  // 5. identities and exact pins
  if (
    b2.actor_id !== actorId ||
    w1.actor_id !== actorId ||
    presenceFact.version !== 1 ||
    rawFact.version !== 1 ||
    emissionFact.version !== 1 ||
    em.emission_id !== request.emission_id
  ) {
    return unresolved(
      "PREMISE_PIN_MISMATCH",
      "a premise is not this actor's, this emission's or its first version",
    );
  }
  // the channel: the emission is at the actor's own locus (no neighbour, path or propagation exists in stage one)
  if (b2.locus.entity_id !== locusId || b2.world.entity_id !== worldId) {
    return refused(
      "EMISSION_NOT_AT_ACTOR_LOCUS",
      "the actor is not physically at the emission's locus: stage one models no neighbour, corridor, direction or attenuation",
    );
  }
  if (
    !canonicalEqual(b2.world, w1.world) ||
    !canonicalEqual(b2.locus, w1.locus) ||
    w1.presence.fact_key !== presenceKey ||
    w1.presence.version !== presenceFact.version
  ) {
    return unresolved(
      "PREMISE_PIN_MISMATCH",
      "W1 does not name the exact committed B2 presence, world and locus",
    );
  }
  if (rawSensoryPremisesViolation(w1, (k) => reader.getFact(k)) !== null) {
    return unresolved(
      "PREMISE_PIN_MISMATCH",
      "W1's premises are not the committed world, locus and B2 (and optionally this actor's setup placement and this world's closure) at their exact committed versions",
    );
  }
  if (
    em.world.fact_key !== worldKey ||
    em.locus.fact_key !== locusKey ||
    em.emitting_source.fact_key !== locusKey ||
    em.emitting_source.version !== locusFact.version ||
    em.profile_locus_version !== locusFact.version
  ) {
    return unresolved(
      "PREMISE_PIN_MISMATCH",
      "the emission does not name the exact original locus version that carries the typed profile",
    );
  }

  // 6. the source: the emission is from the emitter the original profile names
  if (profile.environmental_emitter_basis.emitter_id !== em.emitter_id) {
    return refused(
      "EMITTER_NOT_QUALIFIED",
      "the emission's emitter is not the one the original profile's environmental emitter basis names",
    );
  }

  // 7. Temporal basis: one defensible event basis, no carry across elapsed time, no backdating
  if (
    !canonicalEqual(b2.effective_instant, w1.effective_instant) ||
    !canonicalEqual(w1.effective_instant, em.event_instant)
  ) {
    return unresolved(
      "TEMPORAL_BASIS_CONFLICT",
      "B2, W1 and the emission were not established at one Temporal canonical time: presence is not carried across elapsed time and no premise is backfilled",
    );
  }

  // 8. causal order in the journal: profile before the closure, closure before B2, B2 before W1, W1 before the emission
  const at = (fact: OwnerFact): number | null =>
    reader.lookupReceipt(fact.provenance.intent_id)?.revision ?? null;
  const [rLocus, rClosure, rB2, rW1, rEmission] = [
    at(locusFact),
    at(closureFact),
    at(presenceFact),
    at(rawFact),
    at(emissionFact),
  ];
  if (
    rLocus === null ||
    rClosure === null ||
    rB2 === null ||
    rW1 === null ||
    rEmission === null ||
    !(rLocus < rClosure && rClosure < rB2 && rB2 < rW1 && rW1 < rEmission)
  ) {
    return unresolved(
      "CAUSAL_ORDER_CONFLICT",
      "the journal order is not typed profile, closure, B2, W1, emission: no premise is established after the event it would qualify",
    );
  }
  if (em.source_provenance === w1.source_provenance) {
    return unresolved(
      "CAUSAL_ORDER_CONFLICT",
      "the emission and the raw sensory state share one provenance: they are not independently authored",
    );
  }

  // 9. the faculty: conclusive negatives refuse, unknowns do not resolve
  if (w1.raw_transduction === "ABSENT") {
    return refused("RAW_TRANSDUCTION_ABSENT", "the actor has no raw airborne-sound transduction");
  }
  if (w1.ordinary_receptivity === "NONRECEPTIVE") {
    return refused(
      "ORDINARY_RECEPTIVITY_NONRECEPTIVE",
      "the actor is physically not receptive to airborne sound at this basis",
    );
  }
  if (w1.raw_transduction === "UNKNOWN") {
    return unresolved("RAW_TRANSDUCTION_UNKNOWN", "the actor's raw transduction is unknown");
  }
  if (w1.ordinary_receptivity === "UNKNOWN") {
    return unresolved(
      "ORDINARY_RECEPTIVITY_UNKNOWN",
      "the actor's ordinary receptivity is unknown",
    );
  }

  return {
    result: SOURCE_PREMISES_READY_FOR_HEALTH,
    actor_id: actorId,
    world: b2.world,
    locus: b2.locus,
    event_instant: em.event_instant,
    premises: {
      locus: { fact_key: locusKey, version: locusFact.version },
      presence: { fact_key: presenceKey, version: presenceFact.version },
      raw_sensory: { fact_key: rawKey, version: rawFact.version },
      emission: { fact_key: emissionKey, version: emissionFact.version },
    },
    next_required: "HEALTH_SENSORY_FUNCTION_CLOSE",
  };
}
