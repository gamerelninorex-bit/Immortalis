import {
  OWNER_PC_EXISTENCE,
  actorCapabilityKey,
  PLAYER_CHARACTER_BINDING_KEY,
  PcCapabilityBasisSchema,
  PcCapabilitySchema,
  ResolutionTransactionSchema,
  TemporalObjectSchema,
  TransactionAuthoritySchema,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  temporalTransactionAuthorityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { journaledStageViolation } from "../production/admission.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { isPcCapabilityKey, pcCapabilityObjectViolation } from "./declaration.ts";
import {
  derivePcCapability,
  pcBasisIsCarryForward,
  pcBasisPrerequisites,
  pcCapabilityBoundaryViolation,
  pcCapabilityEstablishmentViolation,
} from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's PC capability state still tells one
 * story (IM-12 replay/recovery + IM-07). Replay proves the HISTORY is intact and canonical integrity proves each fact's
 * owner/facet, schema, marker, key identity and governing rule; this proves the facts still cohere:
 *
 *  - a received basis pins its own PC's released Existence Contract (committed, owned by the PC owner, at the version
 *    pinned, committed BEFORE the basis) and cites only accepted claims of it, and its group read that exact contract and
 *    depended on the group that committed it; and when it was committed the Named-Actor owner did not already hold the
 *    identity's capability and the identity was no Population ledger. A carry-forward basis instead pins the committed
 *    EXISTING_ACTOR_HANDOVER binding and the identity's own Named-Actor capability (each read at its exact version, depended
 *    on, committed before the basis), carries that capability's marker exactly, and the source precedes the handover;
 *  - a capability is exactly what its committed basis determines (the same re-derivation admission uses), names the close
 *    stage derived from its PC and capability, was committed after its basis, under no boundary violation, only as its
 *    IM-02 stage under a durable transaction authority, and is credited by a committed ResolutionTransaction — or by an
 *    interrupted one whose engaged object still awaits its boundary;
 *  - a capability never exists without its basis, and every object touching the PC capability key spaces obeys the
 *    registration rule (a capability is visible cross-owner only AS-OF-DECLARED-CLOSE).
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyPcCapabilityIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "PC_CAPABILITY_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const bases = all.filter((f) => kindOf(f) === "pc_capability_basis");
  const capabilities = all.filter((f) => kindOf(f) === "pc_capability");
  const objects = all.flatMap((f) => {
    if (kindOf(f) !== "temporal_object") return [];
    const o = TemporalObjectSchema.safeParse(f.value);
    return o.success &&
      o.data.dependencies.some(
        (d) =>
          d.stage.owner_operation.owner === OWNER_PC_EXISTENCE ||
          d.reads.some((r) => isPcCapabilityKey(r.source.fact_key)) ||
          d.produces.some(isPcCapabilityKey),
      )
      ? [{ fact: f, value: o.data }]
      : [];
  });
  if (bases.length + capabilities.length + objects.length === 0) return out;

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
    has: (k: string) => {
      const f = byKey.get(k);
      return f !== undefined && revisionOf(f) < revision;
    },
  });

  for (const bf of bases) {
    const basis = PcCapabilityBasisSchema.safeParse(bf.value);
    if (!basis.success) continue;
    const b = basis.data;
    if (bf.key !== pcCapabilityBasisKey(b.pc_id, b.capability_id)) {
      bad(bf.key, "a basis is at the key derived from its PC and capability");
      continue;
    }
    const established = pcCapabilityEstablishmentViolation(b, byKey);
    if (established) {
      bad(bf.key, established);
      continue;
    }
    const carried = pcBasisIsCarryForward(b);
    const group = store.committedGroup(bf.provenance.intent_id);
    for (const need of pcBasisPrerequisites(b)) {
      const target = byKey.get(need.key);
      if (!target) {
        bad(bf.key, `${need.what} is not committed`);
        continue;
      }
      if (revisionOf(target) >= revisionOf(bf)) {
        bad(bf.key, `${need.what} was not committed before the basis that cites it`);
      }
      if (
        !group ||
        !group.reads.some((r) => r.key === target.key && r.version === target.version) ||
        !group.depends_on.includes(target.provenance.group_id)
      ) {
        bad(
          bf.key,
          `a received basis read the exact fact it cites and depended on the group that committed it: ${need.key}`,
        );
      }
    }
    if (carried) {
      // The carried source is the actor's already-authoritative pre-handover capability: it must have been committed
      // BEFORE the handover binding (the cutover), which in turn precedes the carry-forward.
      const binding = byKey.get(PLAYER_CHARACTER_BINDING_KEY);
      const source = byKey.get(actorCapabilityKey(b.pc_id, b.capability_id));
      if (binding && source && revisionOf(source) >= revisionOf(binding)) {
        bad(
          bf.key,
          "the carried Named-Actor capability was not committed before the handover that is the ownership cutover",
        );
      }
    }
    const boundary = pcCapabilityBoundaryViolation(
      factsBefore(revisionOf(bf)),
      b.pc_id,
      b.capability_id,
      carried,
    );
    if (boundary) bad(bf.key, boundary);
  }

  for (const cf of capabilities) {
    const cap = PcCapabilitySchema.safeParse(cf.value);
    if (!cap.success) continue;
    const c = cap.data;
    if (cf.key !== pcCapabilityKey(c.pc_id, c.capability_id)) {
      bad(cf.key, "a capability is at the key derived from its PC and capability");
      continue;
    }
    const stage = pcCapabilityStage(c.pc_id, c.capability_id);
    if (!canonicalEqual(c.close.stage, stage)) {
      bad(cf.key, "the PC Capability Close is the stage derived from its PC and capability");
    }
    const basisFact = byKey.get(pcCapabilityBasisKey(c.pc_id, c.capability_id));
    const basis = basisFact ? PcCapabilityBasisSchema.safeParse(basisFact.value) : undefined;
    if (!basisFact || !basis?.success) {
      bad(cf.key, "a capability has no committed received basis");
      continue;
    }
    if (c.basis.fact_key !== basisFact.key || c.basis.version !== basisFact.version) {
      bad(cf.key, "a capability pins the received basis it was derived from");
    }
    const derived = derivePcCapability({
      key: basisFact.key,
      owner: basisFact.owner,
      version: basisFact.version,
      value: basis.data,
    });
    if (!derived.ok || !canonicalEqual(derived.value, c)) {
      bad(cf.key, "a capability is exactly what its committed basis determines");
    }
    if (revisionOf(cf) <= revisionOf(basisFact)) {
      bad(cf.key, "the capability was not committed after the basis it publishes");
    }
    const boundary = pcCapabilityBoundaryViolation(
      factsBefore(revisionOf(cf)),
      c.pc_id,
      c.capability_id,
      pcBasisIsCarryForward(basis.data),
    );
    if (boundary) bad(cf.key, boundary);
    // published only as its IM-02 stage, under the durable authority of the transaction that opened it
    const group = store.committedGroup(cf.provenance.intent_id);
    const authId = group?.cause.slice("transaction:".length);
    const authFact = authId ? byKey.get(temporalTransactionAuthorityKey(authId)) : undefined;
    const authority = authFact ? TransactionAuthoritySchema.safeParse(authFact.value) : undefined;
    if (!group || !authority?.success) {
      bad(
        cf.key,
        "a PC Capability Close has its journaled group and its transaction's durable authority",
      );
    } else {
      const identity = journaledStageViolation(
        store,
        byKey,
        cf,
        stage,
        authority.data.opening.basis_time,
      );
      if (identity) bad(cf.key, identity);
    }
    const awaiting = objects.some(
      (o) =>
        o.value.next_boundary !== null &&
        o.value.dependencies.some((d) => canonicalEqual(d.stage, stage)),
    );
    if (!cited(cf.provenance.group_id) && !awaiting) {
      bad(
        cf.key,
        "a PC Capability Close is credited by no resolution transaction and no engaged object awaits it",
      );
    }
  }

  for (const o of objects) {
    const violation = pcCapabilityObjectViolation(o.value, { facts: byKey });
    if (violation) bad(o.fact.key, violation);
  }
  return out;
}
