import {
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  OWNER_CULTURE,
  ResolutionTransactionSchema,
  TemporalObjectSchema,
  TransactionAuthoritySchema,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  temporalTransactionAuthorityKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { journaledStageViolation } from "../production/admission.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { contextPinnedKeys } from "./admission.ts";
import { cultureObjectViolation } from "./declaration.ts";
import {
  canonicalBindingViolation,
  cultureAccessClassViolation,
  cultureUpdateId,
  deriveSharedMeaning,
} from "./derive.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Culture state still tells one story
 * (IM-12 replay/recovery + IM-09). Replay proves the HISTORY is intact and canonical integrity proves each fact's owner,
 * schema, key identity and governing rule; this proves the facts still cohere:
 *
 *  - a sealed context is at the key its identity derives from exactly (referent, scope, context), is engine-side, binds a
 *    referent and a scope to committed canonical authority, rests on engaged inputs committed BEFORE it at (or, as history,
 *    behind) the versions it pins — no input is a Culture fact, none carries an unregistered basis — read exactly its pinned
 *    facts, and (while its inputs are unchanged) the evidence still establishes a single manifestation for exactly its
 *    referent, scope and context;
 *  - a shared meaning is exactly what its committed context and pinned evidence determine, was committed after all of
 *    them, only as the IM-02 stage under a durable transaction authority that read exactly those facts, and credited by a
 *    committed ResolutionTransaction — or by an interrupted one whose engaged object still awaits it; it never exists
 *    without its sealed context, nor a context without the evidence it seals;
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
    if (!parsed.success) continue;
    const c = parsed.data;
    if (cf.key !== cultureUpdateContextKey(c.update_id)) {
      bad(cf.key, "a context is at the key derived from its update identity");
      continue;
    }
    const secrecy = cultureAccessClassViolation(cf.secrecy);
    if (secrecy) bad(cf.key, secrecy);
    if (c.update_id !== cultureUpdateId(c.referent.fact_key, c.scope.fact_key, c.context)) {
      bad(cf.key, "the update identity is derived from exactly its referent, scope and context");
    }
    for (const [what, r] of [
      ["referent", c.referent],
      ["scope", c.scope],
    ] as const) {
      const binding = canonicalBindingViolation(byKey, r, "HISTORY");
      if (binding) bad(cf.key, `the ${what}: ${binding}`);
    }
    let unchanged = true;
    const evidence: { key: string; owner: string; version: number; value: unknown }[] = [];
    for (const inp of c.inputs) {
      const f = byKey.get(inp.fact_key);
      if (!f) {
        bad(cf.key, "a context rests on committed inputs");
        unchanged = false;
        continue;
      }
      if (f.version < inp.version) {
        bad(cf.key, "an input is not behind the version the context pins");
      } else if (f.version === inp.version && revisionOf(f) >= revisionOf(cf)) {
        bad(cf.key, "an input was not committed before the context that seals it");
      }
      if (f.version !== inp.version) unchanged = false;
      evidence.push({ key: f.key, owner: f.owner, version: f.version, value: f.value });
    }
    if (unchanged && evidence.length === c.inputs.length) {
      const derived = deriveSharedMeaning({
        context: { key: cf.key, owner: cf.owner, version: cf.version, value: c },
        evidence,
      });
      if (!derived.ok) bad(cf.key, derived.error.message);
    }
    const group = store.committedGroup(cf.provenance.intent_id);
    if (
      !group ||
      !canonicalEqual(
        group.reads.map((r) => r.key),
        [...contextPinnedKeys(c)],
      )
    ) {
      bad(cf.key, "a context read exactly its referent, its scope and its engaged inputs");
    }
  }

  for (const mf of meanings) {
    const parsed = CultureSharedMeaningSchema.safeParse(mf.value);
    if (!parsed.success) continue;
    const m = parsed.data;
    if (mf.key !== cultureSharedMeaningKey(m.update_id)) {
      bad(mf.key, "a shared meaning is at the key derived from its update identity");
      continue;
    }
    const secrecy = cultureAccessClassViolation(mf.secrecy);
    if (secrecy) bad(mf.key, secrecy);
    const contextFact = byKey.get(cultureUpdateContextKey(m.update_id));
    const context = contextFact
      ? CultureUpdateContextSchema.safeParse(contextFact.value)
      : undefined;
    if (!contextFact || !context?.success) {
      bad(mf.key, "a shared meaning has no sealed context");
      continue;
    }
    const c = context.data;
    const inputsFacts = c.inputs.map((i) => byKey.get(i.fact_key));
    if (inputsFacts.some((f) => f === undefined)) {
      bad(mf.key, "a shared meaning rests on its committed, pinned evidence");
      continue;
    }
    for (const [f, what] of [
      [contextFact, "sealed context"],
      ...inputsFacts.map((f) => [f!, "evidence input"] as const),
    ] as const) {
      if (revisionOf(f) >= revisionOf(mf)) {
        bad(mf.key, `the ${what} was not committed before the shared meaning that reads it`);
      }
    }
    if (c.inputs.every((i, idx) => inputsFacts[idx]!.version === i.version)) {
      const derived = deriveSharedMeaning({
        context: {
          key: contextFact.key,
          owner: contextFact.owner,
          version: contextFact.version,
          value: c,
        },
        evidence: inputsFacts.map((f) => ({
          key: f!.key,
          owner: f!.owner,
          version: f!.version,
          value: f!.value,
        })),
      });
      if (!derived.ok) bad(mf.key, derived.error.message);
      else if (!canonicalEqual(derived.value, m)) {
        bad(
          mf.key,
          "a shared meaning is exactly what its sealed context and pinned evidence determine",
        );
      }
    } else if (
      !canonicalEqual(m.establishment.evidence, c.inputs) ||
      m.establishment.update.fact_key !== contextFact.key
    ) {
      bad(mf.key, "a shared meaning references exactly its sealed context and its pinned evidence");
    }
    // committed only as its IM-02 stage, under the durable authority of the transaction that opened it
    const stage = cultureConventionStage(m.update_id);
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
      if (!canonicalEqual(readKeys, [contextFact.key, ...c.inputs.map((i) => i.fact_key)])) {
        bad(mf.key, "a close read exactly its sealed context and its engaged inputs");
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
