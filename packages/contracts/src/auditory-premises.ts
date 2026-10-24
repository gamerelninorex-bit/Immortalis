import { z } from "zod";
import { actorPhysicalPresenceKey } from "./actor-presence.ts";
import { Id, Version } from "./ids.ts";
import { CanonicalTimeSchema } from "./temporal.ts";
import { AIRBORNE_SOUND, EntityId, FactRefSchema, Text } from "./world-foundation.ts";

/**
 * S1-P1 — paired W1 raw auditory faculty/receptivity and W2 acoustic source premises — executable contract.
 *
 * Governing source (exact pin in the owner registry and spec/f027/spec-lock.json): WG World Generation & World-State Kernel,
 * "S1-P1 — BLUE executable lowering freeze: paired W1 raw-hearing and W2 acoustic-source premises — 23 October 2026" with its
 * "emitter-source executability clarification", native pin 2026-10-23T12:26:49.599Z. The consumer boundary is F-014D "S1-P1
 * Upstream Auditory Premises Consumer Boundary", native pin 2026-10-23T12:28:14.041Z: a physical-input boundary only.
 *
 * TWO World-State physical-source facts are represented here (the typed `acoustic_profile_v1` of a locus is part of the existing
 * strict `world_locus` contract in world-foundation.ts):
 *
 *  - W1 `actor_raw_sensory_state`: the original, owner-authored RAW physical auditory faculty and immediate ordinary receptivity of
 *    one already-existing, non-PC actor, as a World-State fallback-custodian fact (ADVANCING in kind, restricted in stage one to
 *    its first version). It is an anatomical/physical fact. It is never a Health clearance, a capability score, a viewpoint or an
 *    epistemic event, and a capability basis or a coupling never implies it.
 *  - W2b `world_acoustic_emission`: one genuine, source-authored, instantaneous, create-only airborne-sound EVENT at a locus whose
 *    original source value carries the typed environmental emitter that could produce it. The profile's potential impulse is not
 *    evidence that sound happened; this separately committed fact, at a committed Temporal event basis, is.
 *
 * Every schema is strict, which is also the structural half of the exclusions: there is no field in which a Health condition, a
 * `PERCEIVED`/`AVAILABLE` verdict, an attended meaning, a viewpoint, a duration, a recurrence, a neighbouring locus, a direction,
 * an attenuation, a recipient or an actor-initiated cause could be stated. Foreign state is REFERENCED by exact pin, never copied.
 * Identifiers and literals the source does not prescribe are technical encodings.
 */

/** The one modality of stage one. */
export const AIRBORNE_HEARING = "AIRBORNE_HEARING" as const;

/** W1: one slot per actor identity (across every world) and modality, first version only. */
export const actorRawSensoryStateKey = (actorId: string): string =>
  `world-state/actor/${actorId}/raw-sensory/${AIRBORNE_HEARING}`;

/** W2b: one create-only slot per emission identity, under its world and locus. */
export const worldAcousticEmissionKey = (
  worldId: string,
  locusId: string,
  emissionId: string,
): string => `world/${worldId}/locus/${locusId}/acoustic-emission/${emissionId}`;

/** An exact committed `{fact_key, version}` pin (the shape every W1 dependency and the emission's source use). */
export const FactVersionPinSchema = z.strictObject({ fact_key: Id, version: Version });
export type FactVersionPin = z.infer<typeof FactVersionPinSchema>;

export const RAW_TRANSDUCTION = ["PRESENT", "ABSENT", "UNKNOWN"] as const;
export const ORDINARY_RECEPTIVITY = ["RECEPTIVE", "NONRECEPTIVE", "UNKNOWN"] as const;

export const ActorRawSensoryStateSchema = z
  .strictObject({
    actor_id: EntityId,
    /** the established world and the locus of that world the actor is physically at (the committed B2's own): references */
    world: FactRefSchema,
    locus: FactRefSchema,
    /** the exact committed R1 B2 `actor_physical_presence` this fact rests on */
    presence: FactVersionPinSchema,
    modality: z.literal(AIRBORNE_HEARING),
    /** the independently authored physical-form statement of the World-State physical fallback custodian */
    physical_form_statement: Text,
    raw_transduction: z.enum(RAW_TRANSDUCTION),
    ordinary_receptivity: z.enum(ORDINARY_RECEPTIVITY),
    /** the independent source-authorship basis (never a GM assertion of perception) */
    source_provenance: Text,
    /** the Temporal owner's canonical time read from the committed Temporal state before this fact; never caller-authored */
    effective_instant: CanonicalTimeSchema,
    /** the exact relevant physical premises, B2 included; verified against committed state by admission and load verification */
    dependency_refs: z.array(FactVersionPinSchema),
  })
  .superRefine((w, ctx) => {
    const bad = (message: string, path: string[]) =>
      ctx.addIssue({ code: "custom", message, path });
    if (w.source_provenance === w.physical_form_statement) {
      bad("the provenance is independent of the physical-form statement it supports", [
        "source_provenance",
      ]);
    }
    const refs = w.dependency_refs;
    if (new Set(refs.map((r) => r.fact_key)).size !== refs.length) {
      bad("a premise is pinned once", ["dependency_refs"]);
    }
    if (!refs.some((r) => r.fact_key === w.presence.fact_key && r.version === w.presence.version)) {
      bad("the premises include the exact B2 presence pin", ["dependency_refs"]);
    }
    if (w.presence.fact_key !== actorPhysicalPresenceKey(w.actor_id)) {
      bad("the presence pin is the B2 slot derived from the actor identity", ["presence"]);
    }
  });
export type ActorRawSensoryState = z.infer<typeof ActorRawSensoryStateSchema>;

export const WorldAcousticEmissionSchema = z.strictObject({
  emission_id: EntityId,
  world: FactRefSchema,
  locus: FactRefSchema,
  /** the version of the locus whose typed profile qualifies this emission: its original, pre-seal source commit */
  profile_locus_version: Version,
  /** the concrete environmental emitter: the one the pinned profile's `environmental_emitter_basis` names */
  emitter_id: EntityId,
  /** the exact original `world_locus` version that carries that emitter basis */
  emitting_source: FactVersionPinSchema,
  channel: z.literal(AIRBORNE_SOUND),
  /** the actual emitted acoustic characteristics/fragments only */
  audible_material: Text,
  /** the Temporal owner's canonical time read from the committed Temporal state at emission; never caller-authored */
  event_instant: CanonicalTimeSchema,
  /** the event provenance, distinct from the profile's own statements */
  source_provenance: Text,
});
export type WorldAcousticEmission = z.infer<typeof WorldAcousticEmissionSchema>;
