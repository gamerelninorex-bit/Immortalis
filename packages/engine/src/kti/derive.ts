import {
  ACCESS_CLASS_KTI_ENGINE_SIDE,
  KTI_RESULT_CLOSE,
  MODE_BOUNDED_SHARED_ACCESS,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_KTI,
  accessEventKey,
  accessProvenanceKey,
  fail,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferStage,
  ok,
  type AccessEvent,
  type AccessiblePacket,
  type KtiDevelopmentObject,
  type KtiTransferBasis,
  type KtiTransferPackage,
  type Result,
  type SealedEngineProvenance,
} from "@immortalis/contracts";
import { packetOfKey } from "../epistemic/declaration.ts";
import { sha256Canonical } from "../hash.ts";

/**
 * Pure derivations of the KTI Managed Transfer Package path (KTI v0.3 overlay §§1, 4, 5; KTI v2.2 Candidate v0.3 §2 and
 * Candidate v0.2 §4.2; Scaling Profile Candidate v0.3 Class A and Class E; Concept 2 §9; F-014D §§2.1, 17). Each is the
 * single statement of its rule: the owner operation computes with it and IM-11 admission and load-time verification
 * re-derive with it, so a committed Transfer Package is exactly what its committed basis, its sealed packet and its
 * development object determine — and nothing else.
 *
 * They invent nothing: no comprehension, competence, reproduction, adoption, adherence, belief, diffusion, continuity,
 * number, default, roll or threshold. The packet is read for its recipient and the subject it names, and nothing about
 * what the recipient made of it.
 */

/** A committed fact read by identity: its key, the owner that wrote it, the version it was read at and its value. */
export interface KtiFact<T> {
  readonly key: string;
  readonly owner: string;
  readonly version: number;
  readonly value: T;
}

/**
 * The deterministic identity of one Transfer Package programme: exactly (source_id, recipient, development object) — "one
 * package per materially managed source × recipient × development-object transfer programme" (Scaling Profile Class E) —
 * and nothing else. The packet, event, time, retry, slice and F-014D provenance are not identity dimensions, so a second
 * declaration for the same programme reaches the same slot.
 */
export const transferPackageId = (sourceId: string, recipient: string, objectId: string): string =>
  `transfer-${sha256Canonical({ source_id: sourceId, recipient, object_id: objectId })}`;

/**
 * Packet-to-development-object linkage (explicit, fail closed): for this bounded foundation the packet's Content / Referent
 * (F-014D §4.1: a bounded claim, observation, record or PAYLOAD REFERENCE) must BE the canonical KTI `object_id`. This is an
 * opaque canonical-reference equality, not a language match: prose, a synonym, another reference scheme or an ambiguous label
 * does not support the object, and nothing is interpreted, normalized, mapped or compared fuzzily.
 */
export function packetSupportViolation(
  packet: AccessiblePacket,
  object: KtiDevelopmentObject,
): string | null {
  return packet.payload.referent === object.object_id
    ? null
    : "the packet does not support the development object: its payload referent is not the canonical KTI object identity";
}

/**
 * What the sealed F-014D evidence must say for a basis to rest on it (KTI v2.2 Candidate v0.3 §2 mode-consumer invariant:
 * KTI discriminates every Access / Dissemination Event by immutable mode): the provenance records exactly this packet and
 * recipient, and the event it was formed from is a committed BOUNDED_SHARED_ACCESS event whose one named participant is the
 * recipient. The programme `source_id` is NOT compared with the true source the provenance records: they are different
 * concepts, and nothing of the sealed provenance is copied into KTI. Returns a message, or null.
 */
export function basisEvidenceViolation(input: {
  readonly basis: KtiTransferBasis;
  readonly provenance: SealedEngineProvenance;
  readonly event: KtiFact<AccessEvent>;
}): string | null {
  const { basis, provenance, event } = input;
  if (
    provenance.packet.fact_key !== basis.packet.fact_key ||
    provenance.recipient !== basis.recipient
  ) {
    return "the sealed provenance is the record of exactly this packet and recipient";
  }
  if (
    event.owner !== OWNER_EPISTEMIC_ACCESS ||
    event.key !== provenance.event.fact_key ||
    event.key !== accessEventKey(event.value.event_id)
  ) {
    return "the packet was formed from its own committed Epistemic access event";
  }
  if (event.value.mode !== MODE_BOUNDED_SHARED_ACCESS) {
    return "KTI consumes only BOUNDED_SHARED_ACCESS evidence: an unlowered broadcast is never receipt";
  }
  if (event.value.participants.length !== 1 || event.value.participants[0] !== basis.recipient) {
    return "the recipient is the one named participant of the access event, never a wider scope";
  }
  return null;
}

/** The key of the sealed provenance of the packet a basis names, or null when it names no packet. */
export const provenanceKeyOfPacket = (packetKey: string): string | null => {
  const target = packetOfKey(packetKey);
  return target ? accessProvenanceKey(target.eventId, target.recipientId) : null;
};

/**
 * The Transfer Package this basis, packet and development object determine, published at the KTI result close. Fails
 * closed (never degrades to a partial package) when the references are not exactly the committed facts they name, when the
 * packet is not the recipient's own sealed packet, or when the packet does not support the object.
 */
export function deriveTransferPackage(input: {
  readonly basis: KtiFact<KtiTransferBasis>;
  readonly packet: KtiFact<AccessiblePacket>;
  readonly object: KtiFact<KtiDevelopmentObject>;
}): Result<KtiTransferPackage> {
  const { basis, packet, object } = input;
  const b = basis.value;
  if (basis.owner !== OWNER_KTI) {
    return fail("BASIS_INVALID", "the transfer basis is the KTI owner's own fact");
  }
  if (basis.key !== ktiTransferBasisKey(b.package_id)) {
    return fail("BASIS_INVALID", "the basis is at the key derived from its package identity");
  }
  if (
    b.package_id !== transferPackageId(b.source_id, b.recipient, b.development_object.object_id)
  ) {
    return fail(
      "BASIS_INVALID",
      "the package identity is derived from exactly its source_id, recipient and development object",
    );
  }
  if (
    packet.owner !== OWNER_EPISTEMIC_ACCESS ||
    packet.key !== b.packet.fact_key ||
    packet.version !== b.packet.version ||
    packetOfKey(packet.key)?.recipientId !== b.recipient ||
    packet.value.recipient !== b.recipient
  ) {
    return fail(
      "PACKET_INVALID",
      "the packet is the recipient's own sealed Accessible Content Packet, at the version the basis pins",
    );
  }
  if (
    object.owner !== OWNER_KTI ||
    object.key !== ktiDevelopmentObjectKey(b.development_object.object_id) ||
    object.key !== b.development_object.fact_key ||
    object.version !== b.development_object.version ||
    object.value.object_id !== b.development_object.object_id
  ) {
    return fail(
      "OBJECT_INVALID",
      "the development object is the committed KTI object the basis names, at the version it pins",
    );
  }
  const support = packetSupportViolation(packet.value, object.value);
  if (support) return fail("PACKET_OBJECT_UNSUPPORTED", support);
  return ok({
    package_id: b.package_id,
    status: "ACTIVE",
    source_id: b.source_id,
    recipient: b.recipient,
    development_object: { ...b.development_object },
    packet: { ...b.packet },
    basis: { fact_key: basis.key, version: basis.version },
    close: { name: KTI_RESULT_CLOSE, stage: ktiTransferStage(b.package_id) },
  });
}

/** Every KTI fact carries exactly the engine-side class; a conformance helper for admission and load verification. */
export const ktiAccessClassViolation = (secrecy: string): string | null =>
  secrecy === ACCESS_CLASS_KTI_ENGINE_SIDE
    ? null
    : "a KTI fact is engine-side: it carries the engine-sealed KTI access class";
