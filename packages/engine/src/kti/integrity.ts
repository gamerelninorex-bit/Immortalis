import {
  AccessEventSchema,
  AccessiblePacketSchema,
  KtiDevelopmentObjectSchema,
  KtiTransferBasisSchema,
  KtiTransferPackageSchema,
  ResolutionTransactionSchema,
  SealedEngineProvenanceSchema,
  TemporalObjectSchema,
  TransactionAuthoritySchema,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  ktiTransferStage,
  temporalTransactionAuthorityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { journaledStageViolation } from "../production/admission.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { ktiObjectViolation } from "./declaration.ts";
import {
  basisEvidenceViolation,
  deriveTransferPackage,
  ktiAccessClassViolation,
  packetSupportViolation,
  provenanceKeyOfPacket,
  transferPackageId,
} from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's KTI state still tells one story
 * (IM-12 replay/recovery + IM-09). Replay proves the HISTORY is intact and canonical integrity proves each fact's owner,
 * schema, key identity and governing rule; this proves the facts still cohere:
 *
 *  - a development object is at the key its identity derives, is engine-side, and was committed reading and depending on
 *    nothing foreign;
 *  - a transfer basis rests on a development object, a sealed packet and the packet's sealed provenance that were all
 *    committed BEFORE it, at (or, as history, behind) the versions it pins; the packet is the recipient's own and was formed
 *    from a BOUNDED_SHARED_ACCESS event naming that one recipient; the packet supports the object (its payload referent is the
 *    canonical object_id); the package identity is derived from exactly (source_id, recipient, object); and the
 *    recipient was no Player Character, no entity under player control and no Population ledger when it was committed;
 *  - a package is exactly what its committed basis, packet and object determine, was committed after all three, only as the
 *    IM-02 stage under a durable transaction authority that read exactly those three facts, and credited by a committed
 *    ResolutionTransaction — or by an interrupted one whose engaged object still awaits its boundary; it never exists
 *    without its basis, nor a basis without its object and packet;
 *  - every object touching the KTI key spaces obeys the registration rule (a consequence reads only the package,
 *    AS-OF-DECLARED-CLOSE, naming the KTI result close).
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyKtiIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "KTI_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const ktiObjects = all.filter((f) => kindOf(f) === "kti_development_object");
  const bases = all.filter((f) => kindOf(f) === "kti_transfer_basis");
  const packages = all.filter((f) => kindOf(f) === "kti_transfer_package");
  const objects = all.flatMap((f) => {
    if (kindOf(f) !== "temporal_object") return [];
    const o = TemporalObjectSchema.safeParse(f.value);
    return o.success &&
      (o.data.owning_ref.owner === "kti" ||
        o.data.dependencies.some(
          (d) =>
            d.stage.owner_operation.owner === "kti" ||
            d.reads.some((r) => r.source.fact_key.startsWith("kti/")) ||
            d.produces.some((k) => k.startsWith("kti/")),
        ))
      ? [{ fact: f, value: o.data }]
      : [];
  });
  if (ktiObjects.length + bases.length + packages.length + objects.length === 0) return out;

  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  const transactions = all
    .filter((f) => kindOf(f) === "resolution_transaction")
    .flatMap((f) => {
      const t = ResolutionTransactionSchema.safeParse(f.value);
      return t.success ? [t.data] : [];
    });
  const cited = (groupId: string) =>
    transactions.some((t) => t.stages.some((s) => s.group_id === groupId));
  /** The committed facts as they stood BEFORE `revision`: the boundary is judged at the time of the write. */
  const factsBefore = (revision: number) => ({
    get: (k: string) => {
      const f = byKey.get(k);
      return f && revisionOf(f) < revision ? f : undefined;
    },
    has: (k: string) => {
      const f = byKey.get(k);
      return f !== undefined && revisionOf(f) < revision;
    },
  });

  for (const of_ of ktiObjects) {
    const parsed = KtiDevelopmentObjectSchema.safeParse(of_.value);
    if (!parsed.success) continue;
    if (of_.key !== ktiDevelopmentObjectKey(parsed.data.object_id)) {
      bad(of_.key, "a development object is at the key derived from its identity");
      continue;
    }
    const secrecy = ktiAccessClassViolation(of_.secrecy);
    if (secrecy) bad(of_.key, secrecy);
    const group = store.committedGroup(of_.provenance.intent_id);
    if (!group || group.reads.length !== 0 || group.depends_on.length !== 0) {
      bad(
        of_.key,
        "a development object is KTI's own definition: it reads and depends on nothing foreign",
      );
    }
  }

  for (const bf of bases) {
    const parsed = KtiTransferBasisSchema.safeParse(bf.value);
    if (!parsed.success) continue;
    const b = parsed.data;
    if (bf.key !== ktiTransferBasisKey(b.package_id)) {
      bad(bf.key, "a basis is at the key derived from its package identity");
      continue;
    }
    const secrecy = ktiAccessClassViolation(bf.secrecy);
    if (secrecy) bad(bf.key, secrecy);
    if (
      b.package_id !== transferPackageId(b.source_id, b.recipient, b.development_object.object_id)
    ) {
      bad(
        bf.key,
        "the package identity is derived from exactly its source_id, recipient and development object",
      );
    }
    const boundary = actorBoundaryViolation(factsBefore(revisionOf(bf)), b.recipient);
    if (boundary) bad(bf.key, boundary);
    const objectFact = byKey.get(b.development_object.fact_key);
    const object = objectFact ? KtiDevelopmentObjectSchema.safeParse(objectFact.value) : undefined;
    const packetFact = byKey.get(b.packet.fact_key);
    const packet = packetFact ? AccessiblePacketSchema.safeParse(packetFact.value) : undefined;
    const provKey = provenanceKeyOfPacket(b.packet.fact_key);
    const provFact = provKey ? byKey.get(provKey) : undefined;
    const prov = provFact ? SealedEngineProvenanceSchema.safeParse(provFact.value) : undefined;
    const eventFact = prov?.success ? byKey.get(prov.data.event.fact_key) : undefined;
    const event = eventFact ? AccessEventSchema.safeParse(eventFact.value) : undefined;
    if (
      !objectFact ||
      !object?.success ||
      objectFact.owner !== "kti" ||
      object.data.object_id !== b.development_object.object_id ||
      objectFact.key !== ktiDevelopmentObjectKey(b.development_object.object_id)
    ) {
      bad(bf.key, "a basis rests on a committed KTI development object");
      continue;
    }
    if (!packetFact || !packet?.success || packetFact.owner !== "epistemic_access") {
      bad(bf.key, "a basis rests on a committed sealed Accessible Content Packet");
      continue;
    }
    if (!provFact || !prov?.success || !eventFact || !event?.success) {
      bad(bf.key, "a basis rests on the sealed provenance and event of its packet");
      continue;
    }
    for (const [f, pinned, what] of [
      [objectFact, b.development_object.version, "development object"],
      [packetFact, b.packet.version, "packet"],
    ] as const) {
      if (f.version < pinned) bad(bf.key, `the ${what} is not behind the version the basis pins`);
      else if (f.version === pinned && revisionOf(f) >= revisionOf(bf))
        bad(bf.key, `the ${what} was not committed before the basis that rests on it`);
    }
    if (revisionOf(provFact) >= revisionOf(bf)) {
      bad(bf.key, "the sealed provenance was not committed before the basis that rests on it");
    }
    const evidence = basisEvidenceViolation({
      basis: b,
      provenance: prov.data,
      event: {
        key: eventFact.key,
        owner: eventFact.owner,
        version: eventFact.version,
        value: event.data,
      },
    });
    if (evidence) bad(bf.key, evidence);
    const support = packetSupportViolation(packet.data, object.data);
    if (support) bad(bf.key, support);
    const group = store.committedGroup(bf.provenance.intent_id);
    const readKeys = group?.reads.map((r) => r.key) ?? [];
    if (
      !group ||
      !canonicalEqual(readKeys, [b.development_object.fact_key, b.packet.fact_key, provKey])
    ) {
      bad(
        bf.key,
        "a basis read exactly its development object, its sealed packet and its sealed provenance",
      );
    }
  }

  for (const pf of packages) {
    const parsed = KtiTransferPackageSchema.safeParse(pf.value);
    if (!parsed.success) continue;
    const pkg = parsed.data;
    if (pf.key !== ktiTransferPackageKey(pkg.package_id)) {
      bad(pf.key, "a package is at the key derived from its identity");
      continue;
    }
    const secrecy = ktiAccessClassViolation(pf.secrecy);
    if (secrecy) bad(pf.key, secrecy);
    const basisFact = byKey.get(ktiTransferBasisKey(pkg.package_id));
    const basis = basisFact ? KtiTransferBasisSchema.safeParse(basisFact.value) : undefined;
    if (!basisFact || !basis?.success) {
      bad(pf.key, "a package has no committed basis");
      continue;
    }
    const b = basis.data;
    const packetFact = byKey.get(b.packet.fact_key);
    const packet = packetFact ? AccessiblePacketSchema.safeParse(packetFact.value) : undefined;
    const objectFact = byKey.get(b.development_object.fact_key);
    const object = objectFact ? KtiDevelopmentObjectSchema.safeParse(objectFact.value) : undefined;
    if (!packetFact || !packet?.success || !objectFact || !object?.success) {
      bad(pf.key, "a package rests on its committed sealed packet and development object");
      continue;
    }
    for (const [f, what] of [
      [basisFact, "basis"],
      [packetFact, "packet"],
      [objectFact, "development object"],
    ] as const) {
      if (revisionOf(f) >= revisionOf(pf)) {
        bad(pf.key, `the ${what} was not committed before the package that reads it`);
      }
    }
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
    if (!derived.ok) bad(pf.key, derived.error.message);
    else if (!canonicalEqual(derived.value, pkg)) {
      bad(
        pf.key,
        "a package is exactly what its basis, sealed packet and development object determine",
      );
    }
    const boundary = actorBoundaryViolation(factsBefore(revisionOf(pf)), b.recipient);
    if (boundary) bad(pf.key, boundary);
    // published only as its IM-02 stage, under the durable authority of the transaction that opened it
    const stage = ktiTransferStage(pkg.package_id);
    const group = store.committedGroup(pf.provenance.intent_id);
    const authId = group?.cause.slice("transaction:".length);
    const authFact = authId ? byKey.get(temporalTransactionAuthorityKey(authId)) : undefined;
    const authority = authFact ? TransactionAuthoritySchema.safeParse(authFact.value) : undefined;
    if (!group || !authority?.success) {
      bad(pf.key, "a result close has its journaled group and its transaction's durable authority");
    } else {
      const identity = journaledStageViolation(
        store,
        byKey,
        pf,
        stage,
        authority.data.opening.basis_time,
      );
      if (identity) bad(pf.key, identity);
      const readKeys = group.reads.map((r) => r.key);
      if (!canonicalEqual(readKeys, [basisFact.key, packetFact.key, objectFact.key])) {
        bad(
          pf.key,
          "a result close read exactly its basis, its sealed packet and its development object",
        );
      }
    }
    const awaiting = objects.some(
      (o) =>
        o.value.next_boundary !== null &&
        o.value.dependencies.some((d) => canonicalEqual(d.stage, stage)),
    );
    if (!cited(pf.provenance.group_id) && !awaiting) {
      bad(
        pf.key,
        "a result close is credited by no resolution transaction and no engaged object awaits it",
      );
    }
  }

  for (const o of objects) {
    const violation = ktiObjectViolation(o.value, { facts: byKey });
    if (violation) bad(o.fact.key, violation);
  }
  return out;
}
