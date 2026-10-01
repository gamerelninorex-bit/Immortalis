import {
  EntityTransitionCauseSchema,
  EntityTransitionCloseSchema,
  FallbackPhysicalEntitySchema,
  ResolutionTransactionSchema,
  TemporalObjectSchema,
  entityTransitionObjectId,
  entityTransitionStage,
  temporalObjectKey,
  worldEntityTransitionKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { stageIdentityViolation } from "../production/admission.ts";
import {
  causeSourceViolation,
  deriveEntityTransition,
  entityTransitionObjectViolation,
  isEntityTransitionObject,
} from "./entity-transition.ts";
import type { IntegrityViolation } from "./integrity.ts";

/**
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's entity transitions still tell
 * one story (IM-12 replay/recovery + the World-State fallback custodian). Replay proves the HISTORY is intact and
 * canonical integrity proves each fact's type; this proves the facts still cohere:
 *
 *  - a transition is exactly what its committed causing result determines for the accepted entity it pins — the
 *    same re-derivation admission uses — so its origin is the entity's accepted locus (history), there is one
 *    transition per entity and the entity stays the sealed record it was accepted as (never rewritten);
 *  - it names the committed cause and entity it pins, was committed after both, and is published only as its
 *    IM-02 stage, credited by a committed ResolutionTransaction or an interrupted one still awaiting its engaged,
 *    unretired boundary (never a retired boundary with an uncited transition);
 *  - an entity-transition temporal object is the one derived from its cause, and a retired boundary never leaves
 *    an accepted subject without its transition.
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyEntityTransitionIntegrity(
  store: CampaignStore,
): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "ENTITY_TRANSITION_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const transitions = all.filter((f) => kindOf(f) === "world_entity_transition");
  const objects = all.flatMap((f) => {
    if (kindOf(f) !== "temporal_object") return [];
    const o = TemporalObjectSchema.safeParse(f.value);
    return o.success && isEntityTransitionObject(o.data) ? [{ fact: f, value: o.data }] : [];
  });
  if (transitions.length === 0 && objects.length === 0) return out;

  const parsed = <T>(
    f: OwnerFact | undefined,
    schema: { safeParse(v: unknown): { success: boolean; data?: T } },
  ): T | undefined => {
    if (!f) return undefined;
    const r = schema.safeParse(f.value);
    return r.success ? (r.data as T) : undefined;
  };
  const transactions = all
    .filter((f) => kindOf(f) === "resolution_transaction")
    .flatMap((f) => {
      const t = parsed(f, ResolutionTransactionSchema);
      return t ? [t] : [];
    });
  const cited = (groupId: string) =>
    transactions.some((t) => t.stages.some((s) => s.group_id === groupId));
  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;

  for (const tf of transitions) {
    const t = parsed(tf, EntityTransitionCloseSchema);
    if (!t) continue;
    const causeFact = byKey.get(t.cause.fact_key);
    const entityFact = byKey.get(t.entity.fact_key);
    const cause = parsed(causeFact, EntityTransitionCauseSchema);
    const entity = parsed(entityFact, FallbackPhysicalEntitySchema);
    if (!causeFact || !entityFact || !cause || !entity) {
      bad(tf.key, "a transition has no committed causing result or accepted entity");
      continue;
    }
    if (
      tf.key !== worldEntityTransitionKey(t.locus.from.world.entity_id, t.entity.entity_id) ||
      causeFact.owner !== t.cause.owner ||
      causeFact.version < t.cause.version ||
      entityFact.version < t.entity.version
    ) {
      bad(tf.key, "a transition pins the causing result and the entity it names");
      continue;
    }
    const source = causeSourceViolation(causeFact.key, causeFact.owner, cause);
    if (source) bad(tf.key, source);
    // Re-derived against the cause and entity at the versions pinned. A pin is history: the sources keep their
    // own lifecycle, so when one has moved past it the derivation is checked only where the source is unchanged.
    if (causeFact.version === t.cause.version && entityFact.version === t.entity.version) {
      const derived = deriveEntityTransition({
        cause: {
          key: causeFact.key,
          owner: causeFact.owner,
          version: causeFact.version,
          value: cause,
        },
        entity: { key: entityFact.key, version: entityFact.version, value: entity },
        at: t.closed_at,
      });
      if (!derived.ok || !canonicalEqual(derived.value, t)) {
        bad(tf.key, "a transition is exactly what the committed cause determines for the entity");
      }
    }
    const identity = stageIdentityViolation(tf.provenance, entityTransitionStage(t.cause.cause_id));
    if (identity) bad(tf.key, identity);
    if (!canonicalEqual(t.close.stage, entityTransitionStage(t.cause.cause_id))) {
      bad(tf.key, "the Entity Transition Close is the stage derived from the cause");
    }
    const obj = parsed(
      byKey.get(temporalObjectKey(entityTransitionObjectId(t.cause.cause_id))),
      TemporalObjectSchema,
    );
    const unretired = obj?.next_boundary != null;
    if (!obj) bad(tf.key, "a transition has no engaged temporal object");
    if (!cited(tf.provenance.group_id) && !unretired)
      bad(
        tf.key,
        "a transition is credited by no resolution transaction and its boundary is retired",
      );
    // ordering is against the versions pinned: a source that has since advanced was re-committed legitimately later
    const pinnedRevisions = [
      ...(causeFact.version === t.cause.version ? [revisionOf(causeFact)] : []),
      ...(entityFact.version === t.entity.version ? [revisionOf(entityFact)] : []),
    ];
    if (pinnedRevisions.some((r) => revisionOf(tf) <= r))
      bad(tf.key, "the transition was not committed after the cause and the entity it pins");
  }

  // an entity-transition object is the one derived from its cause; a retired boundary leaves no transition-less subject
  for (const o of objects) {
    const violation = entityTransitionObjectViolation(o.value, { facts: byKey }, false);
    if (violation) {
      bad(o.fact.key, violation);
      continue;
    }
    const stage = o.value.dependencies[0]!;
    const causeFact = byKey.get(stage.reads[0]!.source.fact_key);
    const cause = parsed(causeFact, EntityTransitionCauseSchema);
    if (!cause) continue;
    const slot = byKey.get(
      worldEntityTransitionKey(cause.outcome.destination.world.entity_id, cause.subject.entity_id),
    );
    const retired = o.value.next_boundary === null;
    if (retired && !slot) {
      bad(o.fact.key, "a retired entity-transition boundary has its transition");
    }
  }
  return out;
}
