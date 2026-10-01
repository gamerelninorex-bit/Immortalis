import {
  AccessEventSchema,
  AccessiblePacketSchema,
  KtiDevelopmentObjectSchema,
  KtiTransferBasisSchema,
  KtiTransferPackageSchema,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_KTI,
  SealedEngineProvenanceSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  ktiTransferStage,
  type CommitGroup,
  type KtiTransferBasis,
} from "@immortalis/contracts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  basisEvidenceViolation,
  deriveTransferPackage,
  ktiAccessClassViolation,
  packetSupportViolation,
  provenanceKeyOfPacket,
  transferPackageId,
} from "./derive.ts";

/**
 * IM-11 admission for the IM-09 KTI owner (IM-03 owner resolution; KTI v0.3 overlay §§1, 4, 5, 7; KTI v2.2 Candidate v0.3
 * §2 and Candidate v0.2 §4.2; Scaling Profile Candidate v0.3 Classes A and E; F-014D §§2.1, 17). Pure: a function of
 * (group, state) only, so it holds for a raw `store.commit` as much as for the owner paths. Key-space exclusivity (nobody
 * but `kti`/`kti_development` can write a `kti/…` key, and the KTI owner can write no canonical, kernel, Population,
 * Production, Economy, World-State, Logistics, Named-Actor or Epistemic key) is enforced by the owner registry before this
 * runs; this enforces that even the KTI owner can change its state in exactly three lawful ways, each create-only:
 *
 *  1. DEVELOPMENT OBJECT: one Class-A identity — KTI's own definition. It is no institution, actor, Population or world
 *     fact, and the write is the one `kti/object/…` key.
 *  2. TRANSFER BASIS: the authored programme declaration of one managed transfer, resting on exactly three committed
 *     facts it pins (the development object, the sealed packet and the packet's sealed provenance): the packet is the
 *     named recipient's own sealed Accessible Content Packet formed from a BOUNDED_SHARED_ACCESS event (so KTI consumes it
 *     only AFTER packet formation), the packet supports the object (its payload referent is the canonical object_id),
 *     and the identity is derived from exactly (source_id, recipient, object). The recipient is a lawful non-PC subject.
 *  3. TRANSFER PACKAGE, only as its IM-02 stage (the KTI result close): exactly what the committed basis, the sealed packet
 *     and the development object determine — read NOW, in declared order — published under the stage identity and the
 *     durable authority of an open transaction. Without a committed basis there is nothing to derive it from, so no
 *     consequence, caller or raw commit can conjure a package.
 */
export function ktiGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  if (group.writes.length === 1 && group.writes[0]!.expected_version === 0) {
    const w = group.writes[0]!;
    if (kindOf(w.key) === "kti_development_object") return checkObject(group, w);
    if (kindOf(w.key) === "kti_transfer_basis") return checkBasis(group, state, w);
    if (kindOf(w.key) === "kti_transfer_package") return checkPackage(group, state, w);
  }
  return reject(
    "VALUE_INVALID",
    "KTI state changes only by one development object, one transfer basis or one transfer result close, each created once",
  );
}

type Write = CommitGroup["writes"][number];

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

function canonicalTime(state: CampaignState) {
  const clock = state.facts.get(TEMPORAL_STATE_KEY);
  const time = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  return time?.success ? time.data.canonical_time : null;
}

function checkObject(group: CommitGroup, w: Write): Rejection | null {
  const parsed = KtiDevelopmentObjectSchema.safeParse(w.value);
  if (!parsed.success) return bad("the development object violates its contract", { key: w.key });
  if (w.key !== ktiDevelopmentObjectKey(parsed.data.object_id)) {
    return ref("the development object is at the key derived from its identity", { key: w.key });
  }
  const secrecy = ktiAccessClassViolation(w.secrecy);
  if (secrecy) return bad(secrecy, { key: w.key });
  if (group.reads.length !== 0 || group.depends_on.length !== 0) {
    return ref(
      "a development object is KTI's own definition: it reads and depends on no foreign fact",
      { key: w.key },
    );
  }
  return null;
}

function checkBasis(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = KtiTransferBasisSchema.safeParse(w.value);
  if (!parsed.success) return bad("the transfer basis violates its contract", { key: w.key });
  const b: KtiTransferBasis = parsed.data;
  if (w.key !== ktiTransferBasisKey(b.package_id)) {
    return ref("the basis is at the key derived from its package identity", { key: w.key });
  }
  const secrecy = ktiAccessClassViolation(w.secrecy);
  if (secrecy) return bad(secrecy, { key: w.key });
  if (
    b.package_id !== transferPackageId(b.source_id, b.recipient, b.development_object.object_id)
  ) {
    return ref(
      "the package identity is derived from exactly its source_id, recipient and development object",
      { key: w.key },
    );
  }
  // the recipient is a lawful Named-Actor subject: no Player Character, no entity under player control, no aggregate
  const boundary = actorBoundaryViolation(state.facts, b.recipient);
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: w.key });

  const packetKind = resolveKey(b.packet.fact_key)?.kind.id;
  const provenanceKey = provenanceKeyOfPacket(b.packet.fact_key);
  if (packetKind !== "epistemic_accessible_packet" || !provenanceKey) {
    return ref("a transfer rests on a sealed F-014D Accessible Content Packet", {
      key: b.packet.fact_key,
    });
  }
  // exactly the three facts the basis pins, each at its current version and depended on (RC-07)
  if (group.reads.length !== 3) {
    return ref(
      "a basis reads exactly its development object, its sealed packet and the packet's sealed provenance",
      { key: w.key },
    );
  }
  const objectP = requirePrerequisite(
    group,
    state,
    b.development_object.fact_key,
    "the development object",
  );
  if (isRejection(objectP)) return objectP;
  const packetP = requirePrerequisite(group, state, b.packet.fact_key, "the sealed packet");
  if (isRejection(packetP)) return packetP;
  const provenanceP = requirePrerequisite(group, state, provenanceKey, "the sealed provenance");
  if (isRejection(provenanceP)) return provenanceP;

  if (
    objectP.fact.owner !== OWNER_KTI ||
    objectP.fact.key !== ktiDevelopmentObjectKey(b.development_object.object_id) ||
    objectP.fact.version !== b.development_object.version
  ) {
    return ref(
      "the development object is the committed KTI object the basis names, pinned at its current version",
      { key: b.development_object.fact_key },
    );
  }
  const object = KtiDevelopmentObjectSchema.safeParse(objectP.fact.value);
  if (!object.success || object.data.object_id !== b.development_object.object_id) {
    return bad("the development object violates its contract", {
      key: b.development_object.fact_key,
    });
  }
  const packet = AccessiblePacketSchema.safeParse(packetP.fact.value);
  if (
    packetP.fact.owner !== OWNER_EPISTEMIC_ACCESS ||
    packetP.fact.version !== b.packet.version ||
    !packet.success ||
    packet.data.recipient !== b.recipient
  ) {
    return ref(
      "the packet is the named recipient's own sealed Accessible Content Packet, pinned at its current version",
      { key: b.packet.fact_key },
    );
  }
  const provenance = SealedEngineProvenanceSchema.safeParse(provenanceP.fact.value);
  const eventFact = provenance.success
    ? state.facts.get(provenance.data.event.fact_key)
    : undefined;
  const event = eventFact ? AccessEventSchema.safeParse(eventFact.value) : undefined;
  if (!provenance.success || !eventFact || !event?.success) {
    return ref("the packet has its sealed provenance and the committed event it was formed from", {
      key: provenanceKey,
    });
  }
  const evidence = basisEvidenceViolation({
    basis: b,
    provenance: provenance.data,
    event: {
      key: eventFact.key,
      owner: eventFact.owner,
      version: eventFact.version,
      value: event.data,
    },
  });
  if (evidence) return ref(evidence, { key: b.packet.fact_key });
  const support = packetSupportViolation(packet.data, object.data);
  if (support) return ref(support, { key: b.packet.fact_key });
  // the packet's event identity is the one its key names (a forged pointer cannot redirect the evidence)
  if (provenance.data.event.fact_key !== accessEventKey(event.data.event_id)) {
    return ref("the provenance points at the event derived from its identity", {
      key: provenanceKey,
    });
  }
  return null;
}

function checkPackage(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = KtiTransferPackageSchema.safeParse(w.value);
  if (!parsed.success) return bad("the transfer package violates its contract", { key: w.key });
  const pkg = parsed.data;
  if (w.key !== ktiTransferPackageKey(pkg.package_id)) {
    return ref("the package is at the key derived from its identity", { key: w.key });
  }
  const secrecy = ktiAccessClassViolation(w.secrecy);
  if (secrecy) return bad(secrecy, { key: w.key });
  const basisKey = ktiTransferBasisKey(pkg.package_id);
  const basisFact = state.facts.get(basisKey);
  if (!basisFact) {
    return reject(
      "PREREQUISITE_MISSING",
      "a package is published only from a committed basis: a transfer cannot be conjured",
      { key: basisKey },
    );
  }
  const basis = KtiTransferBasisSchema.safeParse(basisFact.value);
  if (!basis.success) return bad("the basis violates its contract", { key: basisKey });
  const b = basis.data;
  // the Player-Character / aggregate boundary holds at the close as well: an entity that came under player control
  // between the basis and the close is no longer a lawful Named-Actor recipient
  const boundary = actorBoundaryViolation(state.facts, b.recipient);
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: w.key });

  // exactly the declared reads, in declared order, each at its current version and depended on (RC-07)
  const expected = [basisKey, b.packet.fact_key, b.development_object.fact_key];
  if (
    group.reads.length !== expected.length ||
    expected.some((k, i) => group.reads[i]!.key !== k) ||
    expected.some((k, i) => {
      const f = state.facts.get(k);
      return (
        !f || group.reads[i]!.version !== f.version || group.depends_on[i] !== f.provenance.group_id
      );
    })
  ) {
    return ref(
      "a result close reads exactly its basis, its sealed packet (NOW, after packet formation) and its development object, each at its current version",
      { key: w.key },
    );
  }
  const packetFact = state.facts.get(b.packet.fact_key)!;
  const objectFact = state.facts.get(b.development_object.fact_key)!;
  const packet = AccessiblePacketSchema.safeParse(packetFact.value);
  const object = KtiDevelopmentObjectSchema.safeParse(objectFact.value);
  if (!packet.success) return bad("the packet violates its contract", { key: packetFact.key });
  if (!object.success)
    return bad("the development object violates its contract", { key: objectFact.key });
  const derived = deriveTransferPackage({
    basis: { key: basisFact.key, owner: basisFact.owner, version: basisFact.version, value: b },
    packet: {
      key: packetFact.key,
      owner: packetFact.owner,
      version: packetFact.version,
      value: packet.data,
    },
    object: {
      key: objectFact.key,
      owner: objectFact.owner,
      version: objectFact.version,
      value: object.data,
    },
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key });
  if (!canonicalEqual(derived.value, pkg)) {
    return bad(
      "a package is exactly what its basis, sealed packet and development object determine: an active, KTI-owned managed-transfer record that references them, with no other state",
      { key: w.key },
    );
  }
  const now = canonicalTime(state);
  if (!now) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: TEMPORAL_STATE_KEY,
    });
  }
  const identity = stageAuthorityViolation(
    group,
    ktiTransferStage(pkg.package_id),
    state.facts,
    now,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: w.key });
  return null;
}
