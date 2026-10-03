import {
  NamedActorCapabilityBasisSchema,
  NamedActorCapabilitySchema,
  ResolutionTransactionSchema,
  TransactionAuthoritySchema,
  TemporalObjectSchema,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultKey,
  temporalTransactionAuthorityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { journaledStageViolation } from "../production/admission.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { namedActorObjectViolation } from "./declaration.ts";
import {
  actorBoundaryViolation,
  capabilityDrawDigest,
  causeOwnerViolation,
  deriveCapability,
  isRandomizedBasis,
  randomizedEstablishmentViolation,
} from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Named-Actor capability state still
 * tells one story (IM-12 replay/recovery + IM-07). Replay proves the HISTORY is intact and canonical integrity proves
 * each fact's owner, schema, marker, key identity and governing rule; this proves the facts still cohere:
 *
 *  - an establishment basis cites causes that are committed, owned by the source they name, foreign and not kernel
 *    state, at (or, as history, behind) the versions pinned, all committed BEFORE the basis; and its actor was no
 *    Player Character, no entity under player control and no Population ledger when the basis was committed;
 *  - a RANDOMIZED basis is exactly what its committed Causal Draw determines (the same re-derivation admission uses): the
 *    stable draw of its slot, a prior defined by the Named-Actor owner from exactly its causes, a marker that is the
 *    owner's reading of the selected candidate, a result committed before the basis, and a committing group that read
 *    that exact result and depended on its group; and a deterministic basis never sidestepped a committed draw;
 *  - a capability is exactly what its committed basis determines (the same re-derivation admission uses), names the
 *    close stage derived from its actor and capability, was committed after its basis, under no boundary violation,
 *    only as its IM-02 stage under a durable transaction authority, and is credited by a committed
 *    ResolutionTransaction — or by an interrupted one whose engaged object still awaits its boundary;
 *  - a capability never exists without its basis, and every object touching the Named-Actor key spaces obeys the
 *    registration rule (a capability is visible cross-owner only AS-OF-DECLARED-CLOSE).
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyNamedActorIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "NAMED_ACTOR_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const bases = all.filter((f) => kindOf(f) === "named_actor_capability_basis");
  const capabilities = all.filter((f) => kindOf(f) === "named_actor_capability");
  const objects = all.flatMap((f) => {
    if (kindOf(f) !== "temporal_object") return [];
    const o = TemporalObjectSchema.safeParse(f.value);
    return o.success &&
      (o.data.owning_ref.owner === "named_actor" ||
        o.data.dependencies.some(
          (d) =>
            d.stage.owner_operation.owner === "named_actor" ||
            d.reads.some((r) => r.source.fact_key.startsWith("actor/")) ||
            d.produces.some((k) => k.startsWith("actor/")),
        ))
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
    get: (k: string) => {
      const f = byKey.get(k);
      return f && revisionOf(f) < revision ? f : undefined;
    },
    has: (k: string) => {
      const f = byKey.get(k);
      return f !== undefined && revisionOf(f) < revision;
    },
  });

  for (const bf of bases) {
    const basis = NamedActorCapabilityBasisSchema.safeParse(bf.value);
    if (!basis.success) continue;
    const b = basis.data;
    if (bf.key !== actorCapabilityBasisKey(b.actor_id, b.capability_id)) {
      bad(bf.key, "a basis is at the key derived from its actor and capability");
      continue;
    }
    const boundary = actorBoundaryViolation(factsBefore(revisionOf(bf)), b.actor_id);
    if (boundary) bad(bf.key, boundary);
    for (const cause of b.establishment.causes) {
      const f = byKey.get(cause.fact_key);
      const foreign = causeOwnerViolation(cause.owner);
      if (foreign) bad(bf.key, foreign);
      if (!f || f.owner !== cause.owner || f.version < cause.version) {
        bad(
          bf.key,
          `a cause is committed, owned by its named source and not behind its pin: ${cause.fact_key}`,
        );
        continue;
      }
      // ordering is against the version pinned: a source that has since advanced was re-committed legitimately later
      if (f.version === cause.version && revisionOf(f) >= revisionOf(bf)) {
        bad(bf.key, `a cause was not committed before the basis that cites it: ${cause.fact_key}`);
      }
    }
    const digest = capabilityDrawDigest(b.actor_id, b.capability_id);
    if (isRandomizedBasis(b)) {
      const violation = randomizedEstablishmentViolation(b, byKey);
      if (violation) {
        bad(bf.key, violation);
        continue;
      }
      const result = byKey.get(causalDrawResultKey(digest))!;
      if (revisionOf(result) >= revisionOf(bf)) {
        bad(
          bf.key,
          "the Causal Draw result was not committed before the establishment that reads it",
        );
      }
      const group = store.committedGroup(bf.provenance.intent_id);
      if (
        !group ||
        !group.reads.some((r) => r.key === result.key && r.version === result.version) ||
        !group.depends_on.includes(causalDrawResultGroupId(digest))
      ) {
        bad(
          bf.key,
          "a randomized establishment read the exact Causal Draw result and depended on its canonical result group",
        );
      }
    } else {
      // a deterministic basis never sidesteps Causal Draw evidence that already existed for its slot
      for (const key of [causalDrawPrecommitKey(digest), causalDrawResultKey(digest)]) {
        const evidence = byKey.get(key);
        if (evidence && revisionOf(evidence) < revisionOf(bf)) {
          bad(
            bf.key,
            "a deterministic basis was committed over an existing Causal Draw for its slot",
          );
          break;
        }
      }
    }
  }

  for (const cf of capabilities) {
    const cap = NamedActorCapabilitySchema.safeParse(cf.value);
    if (!cap.success) continue;
    const c = cap.data;
    if (cf.key !== actorCapabilityKey(c.actor_id, c.capability_id)) {
      bad(cf.key, "a capability is at the key derived from its actor and capability");
      continue;
    }
    const stage = actorCapabilityStage(c.actor_id, c.capability_id);
    if (!canonicalEqual(c.close.stage, stage)) {
      bad(cf.key, "the capability close is the stage derived from its actor and capability");
    }
    const basisFact = byKey.get(actorCapabilityBasisKey(c.actor_id, c.capability_id));
    const basis = basisFact
      ? NamedActorCapabilityBasisSchema.safeParse(basisFact.value)
      : undefined;
    if (!basisFact || !basis?.success) {
      bad(cf.key, "a capability has no committed establishment basis");
      continue;
    }
    if (c.basis.fact_key !== basisFact.key || c.basis.version !== basisFact.version) {
      bad(cf.key, "a capability pins the establishment basis it was derived from");
    }
    const derived = deriveCapability({
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
    const boundary = actorBoundaryViolation(factsBefore(revisionOf(cf)), c.actor_id);
    if (boundary) bad(cf.key, boundary);
    // published only as its IM-02 stage, under the durable authority of the transaction that opened it
    const group = store.committedGroup(cf.provenance.intent_id);
    const authId = group?.cause.slice("transaction:".length);
    const authFact = authId ? byKey.get(temporalTransactionAuthorityKey(authId)) : undefined;
    const authority = authFact ? TransactionAuthoritySchema.safeParse(authFact.value) : undefined;
    if (!group || !authority?.success) {
      bad(
        cf.key,
        "a capability close has its journaled group and its transaction's durable authority",
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
        "a capability close is credited by no resolution transaction and no engaged object awaits it",
      );
    }
  }

  for (const o of objects) {
    const violation = namedActorObjectViolation(o.value, { facts: byKey });
    if (violation) bad(o.fact.key, violation);
  }
  return out;
}
