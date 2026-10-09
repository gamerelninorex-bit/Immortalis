import {
  CjaDecisionRecordSchema,
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  OWNER_CULTURE,
  ResolutionTransactionSchema,
  TemporalObjectSchema,
  TransactionAuthoritySchema,
  cjaDecisionKey,
  cultureContextCause,
  cultureContextGroupId,
  cultureContextIntentId,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  temporalTransactionAuthorityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { cjaSealedProofViolation } from "../culture-adjudication/derive.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { journaledStageViolation } from "../production/admission.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { cultureFactOf } from "./admission.ts";
import { cultureObjectViolation } from "./declaration.ts";
import {
  canonicalBindingViolation,
  contextPinnedKeys,
  cultureAccessClassViolation,
  cultureContextViolation,
  deriveSharedMeaning,
} from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Culture state still tells one story
 * (IM-12 replay/recovery + IM-09). Replay proves the HISTORY is intact and canonical integrity proves each fact's owner,
 * schema, key identity and governing rule; this proves the facts still cohere — WITHOUT a port, a model, or any live foreign
 * value:
 *
 *  - a sealed context is at the key its update identity derives from, is engine-side, committed as ONE group under the
 *    deterministic RC-16 identities that READ exactly its referent, scope, inputs and Cohort and depended on their groups; its
 *    identities re-derive; its referent and scope are still bound to canonical authority; and the immutable JOURNAL shows each
 *    cited source's committing group writing exactly the cited version, and the cited Population reconciliation committing the
 *    Cohort and the named close, before the context (the historical proof). A LATER foreign or Population version is never a
 *    violation: ordinary churn after seal does not invalidate sealed history;
 *  - a shared meaning is exactly what its committed context and its committed ESTABLISH_SUPPORTED decision determine, was
 *    committed after both, only as the IM-02 stage under a durable transaction authority that read EXACTLY those two facts, and
 *    credited by a committed ResolutionTransaction — or by an interrupted one whose engaged object still awaits it; it never
 *    exists without its sealed context and its decision;
 *  - every object touching the Culture key spaces obeys the registration rule.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers; it is never an advance
 * path and never a global social scan of the world.
 */
export function verifyCultureIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) => out.push({ key, code: "CULTURE_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const contexts = all.filter((f) => kindOf(f) === "culture_update_context");
  const meanings = all.filter((f) => kindOf(f) === "culture_shared_meaning");
  const objects = all.flatMap((f) => {
    if (kindOf(f) !== "temporal_object") return [];
    const o = TemporalObjectSchema.safeParse(f.value);
    return o.success &&
      (o.data.owning_ref.owner === OWNER_CULTURE ||
        o.data.dependencies.some(
          (d) =>
            d.stage.owner_operation.owner === OWNER_CULTURE ||
            d.reads.some((r) => r.source.fact_key.startsWith("culture/")) ||
            d.produces.some((k) => k.startsWith("culture/")),
        ))
      ? [{ fact: f, value: o.data }]
      : [];
  });
  if (contexts.length + meanings.length + objects.length === 0) return out;

  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  const transactions = all
    .filter((f) => kindOf(f) === "resolution_transaction")
    .flatMap((f) => {
      const t = ResolutionTransactionSchema.safeParse(f.value);
      return t.success ? [t.data] : [];
    });
  const cited = (groupId: string) =>
    transactions.some((t) => t.stages.some((s) => s.group_id === groupId));

  for (const cf of contexts) {
    const parsed = CultureUpdateContextSchema.safeParse(cf.value);
    if (!parsed.success) {
      bad(cf.key, "a context satisfies its Social Update Context contract");
      continue;
    }
    const c = parsed.data;
    if (cf.key !== cultureUpdateContextKey(c.update_id)) {
      bad(cf.key, "a context is at the key derived from its update identity");
      continue;
    }
    const secrecy = cultureAccessClassViolation(cf.secrecy);
    if (secrecy) bad(cf.key, secrecy);
    const own = cultureContextViolation(c);
    if (own) bad(cf.key, own);
    for (const [what, k] of [
      ["referent", c.distinction.referent_key],
      ["scope", c.distinction.scope_key],
    ] as const) {
      const binding = canonicalBindingViolation(byKey, k);
      if (binding) bad(cf.key, `the ${what}: ${binding}`);
    }
    const group = store.committedGroup(cf.provenance.intent_id);
    if (!group || group.writes.length !== 1 || group.writes[0]!.key !== cf.key) {
      bad(cf.key, "the committing group is in the journal and writes only this context");
      continue;
    }
    if (
      group.group_id !== cultureContextGroupId(c.update_id) ||
      group.intent_id !== cultureContextIntentId(c.update_id) ||
      group.cause !== cultureContextCause(c.update_id)
    ) {
      bad(
        cf.key,
        "the group and intent identities are the deterministic RC-16 identities of the update",
      );
    }
    const pinned = contextPinnedKeys(c);
    if (
      !canonicalEqual(
        group.reads.map((r) => r.key),
        [...pinned],
      )
    ) {
      bad(
        cf.key,
        "a context read exactly its referent, its scope, its engaged inputs and its Cohort",
      );
    }
    // the historical proof: the journal, not a current value — each cited source version was written by the cited group, the
    // sealed context read it and depended on that group, and the Cohort/close were committed by the cited reconciliation
    const proof = cjaSealedProofViolation(byKey, store, {
      context_ref: {
        owner: cf.owner,
        fact_key: cf.key,
        version: cf.version,
        committed_by_group_id: cf.provenance.group_id,
      },
      source_refs: c.inputs,
      constituency_ref: c.constituency,
    });
    if (proof) bad(cf.key, `${proof.code}: ${proof.message}`);
  }

  for (const mf of meanings) {
    const parsed = CultureSharedMeaningSchema.safeParse(mf.value);
    if (!parsed.success) {
      bad(mf.key, "a shared meaning satisfies its contract");
      continue;
    }
    const m = parsed.data;
    if (mf.key !== cultureSharedMeaningKey(m.slot_id)) {
      bad(mf.key, "a shared meaning is at the key derived from its state slot");
      continue;
    }
    const secrecy = cultureAccessClassViolation(mf.secrecy);
    if (secrecy) bad(mf.key, secrecy);
    const contextFact = byKey.get(cultureUpdateContextKey(m.establishment.update_id));
    const context = contextFact
      ? CultureUpdateContextSchema.safeParse(contextFact.value)
      : undefined;
    if (!contextFact || !context?.success) {
      bad(mf.key, "a shared meaning has no sealed context");
      continue;
    }
    const c = context.data;
    const decisionFact = byKey.get(cjaDecisionKey(c.update_id));
    if (!decisionFact || !CjaDecisionRecordSchema.safeParse(decisionFact.value).success) {
      bad(mf.key, "a shared meaning rests on its committed adjudication decision");
      continue;
    }
    for (const [f, what] of [
      [contextFact, "sealed context"],
      [decisionFact, "adjudication decision"],
    ] as const) {
      if (revisionOf(f) >= revisionOf(mf)) {
        bad(mf.key, `the ${what} was not committed before the shared meaning that reads it`);
      }
    }
    if (revisionOf(decisionFact) <= revisionOf(contextFact)) {
      bad(mf.key, "the adjudication decision was not committed after the sealed context");
    }
    const derived = deriveSharedMeaning({
      context: cultureFactOf(contextFact, c),
      decision: cultureFactOf(decisionFact, decisionFact.value as unknown),
    });
    if (!derived.ok) bad(mf.key, derived.error.message);
    else if (!canonicalEqual(derived.value, m)) {
      bad(
        mf.key,
        "a shared meaning is exactly what its sealed context and its committed decision determine",
      );
    }
    // committed only as its IM-02 stage, under the durable authority of the transaction that opened it
    const stage = cultureConventionStage(c.update_id, c.slot_id);
    const group = store.committedGroup(mf.provenance.intent_id);
    const authId = group?.cause.slice("transaction:".length);
    const authFact = authId ? byKey.get(temporalTransactionAuthorityKey(authId)) : undefined;
    const authority = authFact ? TransactionAuthoritySchema.safeParse(authFact.value) : undefined;
    if (!group || !authority?.success) {
      bad(mf.key, "a close has its journaled group and its transaction's durable authority");
    } else {
      const identity = journaledStageViolation(
        store,
        byKey,
        mf,
        stage,
        authority.data.opening.basis_time,
      );
      if (identity) bad(mf.key, identity);
      const readKeys = group.reads.map((r) => r.key);
      if (!canonicalEqual(readKeys, [contextFact.key, decisionFact.key])) {
        bad(
          mf.key,
          "a close read exactly its sealed context and its committed adjudication decision",
        );
      }
    }
    const awaiting = objects.some(
      (o) =>
        o.value.next_boundary !== null &&
        o.value.dependencies.some((d) => canonicalEqual(d.stage, stage)),
    );
    if (!cited(mf.provenance.group_id) && !awaiting) {
      bad(
        mf.key,
        "a close is credited by no resolution transaction and no engaged object awaits it",
      );
    }
  }

  for (const o of objects) {
    const violation = cultureObjectViolation(o.value, { facts: byKey });
    if (violation) bad(o.fact.key, violation);
  }
  return out;
}
