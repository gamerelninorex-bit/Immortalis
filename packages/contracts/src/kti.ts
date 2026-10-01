import { z } from "zod";
import { Id, Version } from "./ids.ts";
import type { StageKey } from "./temporal.ts";
import { StageKeySchema } from "./temporal.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * KTI Managed Transfer Package / Result-Close Backbone Foundation — executable contracts.
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-002 KTI (frozen F-027 pin 2026-09-26T02:44:38.319Z): the post-ratification KTI v0.3 source conformance overlay,
 *     KTI v2.2 Candidate v0.3 (M-2 broadcast mode-conformance delta; pin 2026-09-26T02:10:16.626Z, with Candidate v0.2
 *     §4.2 producer-side temporal cut and §4.3 transfer relationship), KTI Scaling Profile v1 Candidate v0.3 (Class A core
 *     development-object identity; Class E active Transfer Package; pin 2026-09-26T02:10:16.626Z), Concept 2 §2 (object
 *     classes), §9 (Intentional transfer package) and the KTI final scoped closure
 *   F-014D Epistemic Access §2.1, §17 (KTI Transfer Adapter), §18 — KTI consumes the sealed per-event evidence packet
 *     AS-OF-NOW after packet formation; F-014D reads KTI state only AS-OF-DECLARED-CLOSE, Close Basis = KTI result close
 *   RC-02 OwnerFact, RC-03 TemporalRead (AS-OF-DECLARED-CLOSE), RC-04 StageKey
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). That is the structural half of the KTI
 * guards: there is NO field in which a comprehension, competence / PARTIAL depth, reproduction, adoption, adherence,
 * belief, diffusion, continuity, headcount, person×skill state, institution identity, office, permission, Diplomacy
 * commitment, audience/cohort/faction scope or a number could be placed (KTI v0.3 §§2–3; Concept 2 §§8–9). A Transfer
 * Package is workflow state: it records that a materially managed transfer is active and nothing about what the recipient
 * understood, can do or has adopted. Nothing here is a game rule or a calibration.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet, key spaces, secrecy class (IM-09). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/** WS-002 / the lawful KTI owner (IM-09). One owner, one facet. */
export const OWNER_KTI = "kti";
export const FACET_KTI_DEVELOPMENT = "kti_development";

export const KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE = "kti-publish-transfer-result-close";
/**
 * The Close Basis name the KTI owner declares: "AS-OF-DECLARED-CLOSE; Close Basis = KTI result close" (KTI v0.2 §4.2,
 * F-014D §2.1, F-016 EK-02). Technical encoding of the source's name.
 */
export const KTI_RESULT_CLOSE = "kti-result-close";

/**
 * The access/secrecy class (RC-02) the KTI owner stamps on every KTI fact. KTI development workflow state is engine-side:
 * it is never an actor-accessible surface (F-014D §2.1 role-context rule: true source/holder identity is not an
 * admissible actor input), and admission and load verification require exactly this label.
 */
export const ACCESS_CLASS_KTI_ENGINE_SIDE = "kti.engine-sealed";

/** The Class-A core development-object identity (Scaling Profile Candidate v0.3 §2 Class A). */
export const ktiDevelopmentObjectKey = (objectId: string): string => `kti/object/${objectId}`;
/** The authored, sealed, pre-close programme declaration of one Transfer Package (the Class-E identity inputs). */
export const ktiTransferBasisKey = (packageId: string): string => `kti/transfer/${packageId}/basis`;
/** The active Transfer Package (Class E), committed only at the KTI result close. */
export const ktiTransferPackageKey = (packageId: string): string =>
  `kti/transfer/${packageId}/package`;

/**
 * The IM-02 stage whose commit IS the KTI result close of one Transfer Package (RC-04). Its identity is derived from the
 * package identity alone: a requested horizon, a source or packet version, a retry, a consumer or a slice is not an
 * identity dimension, so any later transaction that declares the same stage reaches the same committed result.
 */
export const ktiTransferStage = (packageId: string): StageKey => ({
  causal_process_id: `kti-transfer/${packageId}`,
  owner_operation: { owner: OWNER_KTI, operation: KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE },
  prospective_result_id: ktiTransferPackageKey(packageId),
});

// ---------------------------------------------------------------------------------------------
// Class A — core development-object identity (Concept 2 §2; Scaling Profile v0.3 Class A).
// ---------------------------------------------------------------------------------------------

/**
 * The six development-object classes of Concept 2 §2. Literal alternatives named by the source; nothing is added.
 * Broad fields (Navigation, Metallurgy, …) are containers for constituent objects, not objects.
 */
export const KTI_OBJECT_CLASSES = [
  "TECHNIQUE_TECHNOLOGY",
  "KNOWLEDGE_DISCIPLINE",
  "METHOD_PRACTICE",
  "DOCTRINE_PHILOSOPHY_IDEOLOGY",
  "INSTITUTIONAL_GOVERNMENT_MODEL",
  "REPRESENTATIONAL_INFORMATION_SYSTEM",
] as const;
export const KtiObjectClassSchema = z.enum(KTI_OBJECT_CLASSES);
export type KtiObjectClass = z.infer<typeof KtiObjectClassSchema>;

/**
 * One KTI development-object identity: "one canonical identity per materially persistent development object … No
 * faction/object state is stored in A" (Scaling Profile Class A; Concept 2 §9 "the development object definition remains
 * singular"). It carries the canonical `object_id`, the object's class and the Class-A creation gate ("create only when …
 * materially future-causal", restated as a literal). It carries no separate label, alias or synonym: the packet → object link
 * of this bounded foundation is the canonical `object_id` itself (a packet's `payload.referent` must BE the `object_id`; see
 * the derivation), an opaque canonical-reference equality and never a language match.
 *
 * The object is KTI's own definition: it is not an institution, not an actor, not a Population fact and not a world fact,
 * and the schema has no field in which any of those, a faction/recipient relationship, a competence, a maturity rung or a
 * qualifier could be placed.
 */
export const KtiDevelopmentObjectSchema = z.strictObject({
  object_id: EntityId,
  object_class: KtiObjectClassSchema,
  materiality: z.literal("MATERIALLY_FUTURE_CAUSAL"),
});
export type KtiDevelopmentObject = z.infer<typeof KtiDevelopmentObjectSchema>;

// ---------------------------------------------------------------------------------------------
// Class E — the active Transfer Package (Concept 2 §9; Scaling Profile v0.3 Class E).
// ---------------------------------------------------------------------------------------------

/** A reference to the committed development object, by identity and pinned version. */
export const KtiObjectRefSchema = z.strictObject({
  object_id: EntityId,
  fact_key: Id,
  version: Version.min(1),
});

/** A reference to the sealed F-014D Accessible Content Packet, by committed identity and pinned version. */
export const KtiPacketRefSchema = z.strictObject({ fact_key: Id, version: Version.min(1) });

/**
 * The authored, sealed programme declaration of one Transfer Package, committed BEFORE its result close (Scaling Profile
 * Class E: "one package per materially managed source × recipient × development-object transfer programme while
 * cross-resolution workflow state is required"; Concept 2 §9: "only when the transfer is materially active").
 *
 * `source_id` is the opaque programme source — the source party / source faction of the deliberate transfer programme
 * (Concept 2 §9). It is NOT the F-014D true source/holder/carrier recorded in the sealed provenance, may differ from it, and
 * is an identity dimension parallel to the recipient, never a copied foreign fact value.
 *
 * `package_id` is deterministic: it is derived from exactly (source_id, recipient, development object) and nothing else — not
 * the packet, event, time, retry or slice — so a second declaration for the same programme reaches the same, already
 * occupied, slot. The explicit KTI-owner publication of this basis is the establishment of the Class-E workflow record: a
 * formed or received packet never creates one. The recipient is the one named recipient the packet establishes; there is no faction, cohort, scope,
 * audience, mode or membership field, so no wider recipient can be inferred and BROADCAST_EXPOSURE is unrepresentable
 * (KTI v0.3 §2 mode-consumer invariant).
 *
 * `management` is the Class-E gate as a literal ("create for a real managed transfer"): it states that the transfer is
 * materially managed across resolution boundaries — never a score, level or outcome.
 */
export const KtiTransferBasisSchema = z.strictObject({
  package_id: EntityId,
  management: z.literal("CROSS_RESOLUTION_MANAGED"),
  source_id: EntityId,
  recipient: EntityId,
  development_object: KtiObjectRefSchema,
  packet: KtiPacketRefSchema,
});
export type KtiTransferBasis = z.infer<typeof KtiTransferBasisSchema>;

/**
 * The active Transfer Package: KTI-owned workflow state and nothing else. It states that one materially managed
 * development transfer, from the programme `source_id` to `recipient`, of `development_object`, is ACTIVE, and it references (never copies)
 * the sealed packet that evidenced the access, the authored basis and the development object it rests on. It holds no
 * comprehension, competence, reproduction, adoption, adherence, belief, diffusion, continuity or retention, no
 * transmitted-means list, bottleneck or burden (no source structure for them is in this slice), no F-014D event or
 * provenance (in particular no F-014D true source/holder/carrier), and no completion or retirement state: `status` is the single literal ACTIVE.
 *
 * `close` names the KTI result close this record is published at: other owners may read it only AS-OF-DECLARED-CLOSE
 * naming that close (KTI v0.2 §4.2).
 */
export const KtiTransferPackageSchema = z.strictObject({
  package_id: EntityId,
  status: z.literal("ACTIVE"),
  source_id: EntityId,
  recipient: EntityId,
  development_object: KtiObjectRefSchema,
  packet: KtiPacketRefSchema,
  basis: z.strictObject({ fact_key: Id, version: Version.min(1) }),
  close: z.strictObject({
    name: z.literal(KTI_RESULT_CLOSE),
    stage: StageKeySchema,
  }),
});
export type KtiTransferPackage = z.infer<typeof KtiTransferPackageSchema>;
