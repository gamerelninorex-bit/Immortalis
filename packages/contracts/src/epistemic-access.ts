import { z } from "zod";
import { ACTOR_PROFILE_CAPABILITY_CLOSE } from "./actor-capability.ts";
import { Id, Version } from "./ids.ts";
import { PC_CAPABILITY_CLOSE } from "./pc-capability.ts";
import type { StageKey } from "./temporal.ts";
import { CanonicalTimeSchema } from "./temporal.ts";
import { OWNER_POPULATION } from "./population.ts";
import { EntityId, OWNER_WORLD_STATE, Text } from "./world-foundation.ts";

/**
 * Epistemic Access / Sealed Accessible Content Packet Backbone Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   F-014D Epistemic Access — Working Operational Draft v2, Sovereign-ratified (W1-PS2 provenance-split amendment
 *                             ratified 2026-09-25; lock pin 2026-09-24T16:25:17.059Z) §§2, 2.1, 4.1, 4.2, 5, 9, 11, 14,
 *                             18, 21, 24
 *   RC-11 SealedContext / AccessEvent, RC-14 Projection guard, RC-03 TemporalRead (AS-OF-DECLARED-CLOSE), RC-04 StageKey
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is the structural half of the
 * F-014D guards: there is NO field in which broadcast/audience/cohort/membership/office/group authority, a
 * comprehension, recognition, inference, credibility, belief, stance or decision, a numeric score, a roll, a latency or
 * a route through a message/record/memory could be placed (F-014D §§2, 4.4, 9, 18, 24). The Accessible Content Packet
 * has no field in which the true source, holder, carrier chain or any engine reference could be placed (§2.1 role-context
 * rule, §11, §18); they exist only in the separate Sealed Engine Provenance. Nothing here is a game rule or a calibration.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet, key spaces, secrecy classes (IM-10). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/** F-014D / the lawful Epistemic Access owner (IM-10). */
export const OWNER_EPISTEMIC_ACCESS = "epistemic_access";
export const FACET_EPISTEMIC_ACCESS = "epistemic_access";

export const EPISTEMIC_OPERATION_FORM_ACCESSIBLE_PACKET = "epistemic-form-accessible-packet";

/**
 * The secrecy/access class (RC-02) the owner stamps. The engine-side event and the Sealed Engine Provenance are
 * engine-sealed; only the Accessible Content Packet is actor-accessible (F-014D §2.1, §18). Admission and load
 * verification require exactly these labels, so the separation is a property of the committed state, not a convention.
 */
export const ACCESS_CLASS_ENGINE_SEALED = "epistemic.engine-sealed";
export const ACCESS_CLASS_ACTOR_ACCESSIBLE = "epistemic.actor-accessible";

/** The one Access / Dissemination Event mode this construction can create (F-014D §4.2, §9). */
export const MODE_BOUNDED_SHARED_ACCESS = "BOUNDED_SHARED_ACCESS";
/**
 * The second Access / Dissemination Event mode (F-014D §4.4): ONE immutable engine-side event for public or very large
 * dissemination, retained INSTEAD OF recipient copies. It is event-only: it is never an individual receipt, an Accessible
 * Content Packet, access-established evidence, Temporal Knowledge Time, comprehension input, KTI receipt or actor-access
 * state, and it writes no Population, Culture or KTI aggregate-exposure state (§2.1 mode-consumer invariant, §4.4, §13).
 * Individual lowering from it (event-basis reach, presence, attention, §21.11) is NOT implemented and has no
 * representation here: every recipient/packet consumer discriminates on the mode and refuses it.
 */
export const MODE_BROADCAST_EXPOSURE = "BROADCAST_EXPOSURE";

/**
 * The Role Registry slot the one canonically bound active Player Character occupies (the literal `binding_slot` of the Role
 * Registry binding fact). An event may name it as its recipient role (F-014D §4.2 explicit named participant); it is only an
 * assertion that admission, registration and load verification check against the committed Role Registry binding by
 * identity, never a classification the event can establish by itself and never PC state.
 */
export const RECIPIENT_ROLE_PLAYER_CHARACTER = "role.player_character";

export const accessEventKey = (eventId: string): string => `access/${eventId}/event`;
export const accessPacketKey = (eventId: string, recipientId: string): string =>
  `access/${eventId}/packet/${recipientId}`;
export const accessProvenanceKey = (eventId: string, recipientId: string): string =>
  `access/${eventId}/provenance/${recipientId}`;

/**
 * The IM-02 stage whose commit IS the formation of one recipient's sealed Accessible Content Packet (RC-04). Its identity
 * is derived from the event and the recipient alone: a requested horizon, a source or capability version, a retry, a
 * consumer or a slice is not an identity dimension, so any later transaction that declares the same stage reaches the
 * same committed packet and never forms a rival.
 */
export const accessPacketStage = (eventId: string, recipientId: string): StageKey => ({
  causal_process_id: `epistemic-access/${eventId}/${recipientId}`,
  owner_operation: {
    owner: OWNER_EPISTEMIC_ACCESS,
    operation: EPISTEMIC_OPERATION_FORM_ACCESSIBLE_PACKET,
  },
  prospective_result_id: accessPacketKey(eventId, recipientId),
});

// ---------------------------------------------------------------------------------------------
// The Access / Dissemination Event (F-014D §4.2) — engine-side, BOUNDED_SHARED_ACCESS only.
// ---------------------------------------------------------------------------------------------

/**
 * The carrier/channel features of a DIRECT, co-present route: the only routes whose receipt is established at one
 * observation basis without travel, latency, retrieval or reconstruction. Message, record, memory, monitoring and
 * broadcast channels (F-014D §§7, 8, 10, 15, 4.4) are out of scope and unrepresentable.
 */
export const ACCESS_CHANNELS = ["PERCEPTION", "SPEECH"] as const;
export const AccessChannelSchema = z.enum(ACCESS_CHANNELS);
export type AccessChannel = z.infer<typeof AccessChannelSchema>;

/**
 * The true source/holder/carrier context the event rests on, REFERENCED and never copied (RC-02 guard): a committed
 * foreign fact pinned at the version it was read at. It carries no value. The source's owner gains no Epistemic write
 * authority by being referenced: only the Epistemic owner may write an `access/…` key.
 */
export const AccessSourcePinSchema = z.strictObject({
  owner: Id,
  fact_key: Id,
  version: Version.min(1),
});
export type AccessSourcePin = z.infer<typeof AccessSourcePinSchema>;

/**
 * The actual payload the route carried, and what the payload/carrier PRESENTED about its own source (F-014D §4.1
 * "Actual Payload", "Presented Source Attribution"). The attribution is only what was perceivable in, or claimed by, the
 * payload at the observation basis; it may be false and is never the true source. Bounded prose exactly as authored.
 */
export const AccessPayloadSchema = z.strictObject({
  referent: Text,
  content: Text,
  presented_attribution: Text.nullable(),
});
export type AccessPayload = z.infer<typeof AccessPayloadSchema>;

/**
 * A payload never carries the engine reference of its true source (RC-02 guard; F-014D §2.1 role-context rule): shared by
 * every event mode, so neither can place the sealed source identity in actor-reachable prose.
 */
function payloadCarriesNoSourceReference(
  e: { source: { fact_key: string }; payload: AccessPayload },
  ctx: z.RefinementCtx,
): void {
  const refer = (text: string | null, path: string) => {
    if (text?.includes(e.source.fact_key)) {
      ctx.addIssue({
        code: "custom",
        message: "a payload does not carry the engine reference of its true source",
        path: ["payload", path],
      });
    }
  };
  refer(e.payload.content, "content");
  refer(e.payload.referent, "referent");
  refer(e.payload.presented_attribution, "presented_attribution");
}

/**
 * One BOUNDED_SHARED_ACCESS event for an explicit, named participant set. The set is exactly one named recipient in this
 * construction — a non-PC Named-Actor subject, or (only when `recipient_role` names `role.player_character`) the entity the
 * canonical Role Registry binding names as the active Player Character: there is no cohort/scene identifier, membership reference, office, group or audience field, so
 * bare membership or authority cannot manufacture receipt (F-014D §2, §5 step 2, §9, §24) and a later roster cannot
 * backfill earlier participation (§4.2, §21.12). The mode is a literal fixed at creation; the fact is sealed
 * (create-only), so it can neither be reclassified nor have its participant reference rewritten (§4.2, §14).
 *
 * `representation` names the one capability, if any, on which the payload's representational form (language, notation,
 * decoding) depends (F-014D §4.1 "Representational Intelligibility", §5 step 4); null states that the payload's form depends
 * on no capability. It is a requirement on the payload, never a capability, a level or a score. Which owner's capability it
 * names follows the recipient and is never a fallback: a Named-Actor recipient's Named-Actor capability, or the active
 * Player Character's I-002 PC capability read at the PC Capability Close (F-016 Phase 2B PCC-03). Absent `recipient_role`
 * (every event committed before the active-PC path existed) the recipient is a Named-Actor subject, unchanged.
 */
export const AccessEventSchema = z
  .strictObject({
    event_id: EntityId,
    mode: z.literal(MODE_BOUNDED_SHARED_ACCESS),
    participants: z.array(EntityId).length(1),
    source: AccessSourcePinSchema,
    channel: AccessChannelSchema,
    /** the access-established basis time (F-014D §2.1 outputs): a provenance anchor, never a third Temporal Read form */
    established_at: CanonicalTimeSchema,
    payload: AccessPayloadSchema,
    representation: z.strictObject({ capability_id: EntityId }).nullable(),
    recipient_role: z.literal(RECIPIENT_ROLE_PLAYER_CHARACTER).optional(),
  })
  .superRefine(payloadCarriesNoSourceReference);
export type AccessEvent = z.infer<typeof AccessEventSchema>;

// ---------------------------------------------------------------------------------------------
// The Access / Dissemination Event (F-014D §4.4) — BROADCAST_EXPOSURE mode, event-only.
// ---------------------------------------------------------------------------------------------

/**
 * The coarse audience REFERENCE of a BROADCAST_EXPOSURE event: one committed, authoritative foreign fact that already
 * identifies an area or population — a World-State locus, or a Population ledger or Cohort — pinned at the version it was
 * read at and never copied (RC-02 guard). It is a reference to the owner's identity, never a roster: there is no member,
 * recipient, snapshot, count or per-individual field, so it cannot establish individual receipt and no later roster can
 * stand in for it (F-014D §4.4, §4.2, §21.12). Which facts are lawful audience authorities is re-derived from the owner
 * registry by identity (the key must name one of those fact kinds and its owner), never chosen by the event.
 */
export const AccessAudienceRefSchema = z.strictObject({
  owner: z.enum([OWNER_WORLD_STATE, OWNER_POPULATION]),
  fact_key: Id,
  version: Version.min(1),
});
export type AccessAudienceRef = z.infer<typeof AccessAudienceRefSchema>;

/**
 * The reach and channel conditions of the dissemination as AUTHORED (F-014D §4.4 "reach/channel conditions"): bounded prose
 * recorded exactly and read by no engine rule. The sources define no vocabulary, scale, range, threshold or evaluation for
 * reach, presence or attention, so none is invented here; they are retained so that a LATER, separate and not-implemented
 * event-basis lowering has the original conditions, never an engine verdict. They are not a receipt determination.
 */
export const AccessReachSchema = z.strictObject({
  channel: Text,
  conditions: Text,
});
export type AccessReach = z.infer<typeof AccessReachSchema>;

/**
 * One BROADCAST_EXPOSURE event (F-014D §4.4): event identity and causal basis (the pinned foreign source/carrier and the
 * dissemination basis time), the actual payload with the Presented Source Attribution, the reach/channel conditions, the
 * coarse authoritative audience reference, and the material exclusions or known exceptions (an empty list states there are
 * none; the engine derives none). The mode is a literal fixed at creation and the fact is sealed (create-only), so it can
 * be neither reclassified nor have its audience reference rewritten (§4.4, §14).
 *
 * There is NO participant, recipient, packet, receipt, access-established time, comprehension, Knowledge Time, KTI, Population
 * or Culture field, and `participants` is unmodelled: a dual-mode value is rejected by the strict shape, and a broadcast
 * event is never approximated by copying it to recipients. `dissemination_basis` is the causal basis time of the
 * dissemination — deliberately NOT named an access-established time, because this event establishes no access.
 */
export const BroadcastExposureEventSchema = z
  .strictObject({
    event_id: EntityId,
    mode: z.literal(MODE_BROADCAST_EXPOSURE),
    source: AccessSourcePinSchema,
    dissemination_basis: CanonicalTimeSchema,
    payload: AccessPayloadSchema,
    reach: AccessReachSchema,
    audience: AccessAudienceRefSchema,
    exceptions: z.array(Text),
  })
  .superRefine(payloadCarriesNoSourceReference);
export type BroadcastExposureEvent = z.infer<typeof BroadcastExposureEventSchema>;

/**
 * The Access / Dissemination Event family under the one canonical key `access/<event>/event`: exactly one of the two
 * immutable modes, discriminated on the literal `mode`. The BOUNDED_SHARED_ACCESS branch is `AccessEventSchema`, unchanged.
 */
export const AccessDisseminationEventSchema = z.discriminatedUnion("mode", [
  AccessEventSchema,
  BroadcastExposureEventSchema,
]);
export type AccessDisseminationEvent = z.infer<typeof AccessDisseminationEventSchema>;

// ---------------------------------------------------------------------------------------------
// The Accessible Content Packet (F-014D §18) — actor-safe.
// ---------------------------------------------------------------------------------------------

/**
 * The authoritative capability-state reference an intelligibility result rests on: the committed fact, the version and
 * the capability close it was read at (F-014D §2.1: AS-OF-DECLARED-CLOSE, Close Basis = F-014A actor-profile capability
 * close for a Named-Actor recipient; "PC Capability Close" for the active Player Character, F-016 Phase 2B PCC-02/PCC-03).
 * A reference, never a copy: no marker, grade or capability value travels in the packet (RC-02 guard). Which close name
 * is lawful follows the owner of the referenced fact and is re-derived, never chosen by the packet.
 */
export const CapabilityCloseReferenceSchema = z.strictObject({
  capability_id: EntityId,
  fact_key: Id,
  version: Version.min(1),
  close: z.strictObject({
    name: z.enum([ACTOR_PROFILE_CAPABILITY_CLOSE, PC_CAPABILITY_CLOSE]),
    group_id: Id,
  }),
});
export type CapabilityCloseReference = z.infer<typeof CapabilityCloseReferenceSchema>;

/**
 * Representational intelligibility (F-014D §4.1, §5 step 4): whether the payload is available in a form the recipient can
 * ACCESS, established either because it depends on no Named-Actor capability, or because the Named-Actor owner's committed
 * capability for the required faculty exists at its declared close. It is a determination about access to the form, NOT
 * comprehension, significance, inference, credibility, belief or action (§5 step 4, §18, §24: access ≠ comprehension).
 * It reads established capability state rather than creating an Epistemic score; the marker is not compared, converted or
 * thresholded (no source defines how a grade bears on accessibility).
 */
export const RepresentationalIntelligibilitySchema = z.discriminatedUnion("basis", [
  z.strictObject({
    result: z.literal("REPRESENTATION_ACCESSIBLE"),
    basis: z.literal("NO_CAPABILITY_DEPENDENCY"),
  }),
  z.strictObject({
    result: z.literal("REPRESENTATION_ACCESSIBLE"),
    basis: z.literal("ESTABLISHED_CAPABILITY"),
    capability: CapabilityCloseReferenceSchema,
  }),
]);
export type RepresentationalIntelligibility = z.infer<typeof RepresentationalIntelligibilitySchema>;

/**
 * The actor-safe handoff packet (F-014D §18): payload, Presented Source Attribution, access basis, representational
 * intelligibility and the authoritative capability-state reference — and NOTHING else. The schema has no field for the
 * true source/holder/carrier, the event or provenance identity, any engine reference, a contradiction (not modelled), a
 * comprehension, recognition, inference, credibility, belief, stance, decision or behaviour. Sealed Engine Provenance
 * is excluded and cannot be added: the schema is strict.
 */
export const AccessiblePacketSchema = z.strictObject({
  recipient: EntityId,
  payload: z.strictObject({ referent: Text, content: Text }),
  presented_attribution: Text.nullable(),
  access: z.strictObject({
    result: z.literal("RECEIVED"),
    channel: AccessChannelSchema,
    established_at: CanonicalTimeSchema,
  }),
  intelligibility: RepresentationalIntelligibilitySchema,
});
export type AccessiblePacket = z.infer<typeof AccessiblePacketSchema>;

// ---------------------------------------------------------------------------------------------
// Sealed Engine Provenance (F-014D §2.1, §4.1, §22) — engine-side only.
// ---------------------------------------------------------------------------------------------

/**
 * The engine-only provenance of one formed packet: the event it was formed from, the true source/holder pin, the carrier
 * channel and the capability close it was read against. It is sealed, never actor-admissible merely because the engine
 * possesses it (F-014D §2.1 role-context rule), and it is never referenced from the packet. It refers to the packet (not
 * the reverse), so the actor-visible surface alone cannot be followed back to the engine record.
 */
export const SealedEngineProvenanceSchema = z.strictObject({
  event: z.strictObject({ fact_key: Id, version: Version.min(1) }),
  recipient: EntityId,
  packet: z.strictObject({ fact_key: Id }),
  source: AccessSourcePinSchema,
  channel: AccessChannelSchema,
  capability_close: z
    .strictObject({ fact_key: Id, version: Version.min(1), committed_by: Id })
    .nullable(),
});
export type SealedEngineProvenance = z.infer<typeof SealedEngineProvenanceSchema>;
