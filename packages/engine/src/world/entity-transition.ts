import {
  ENTITY_TRANSITION_CLOSE_NAME,
  EntityTransitionCauseSchema,
  EntityTransitionCloseSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  FallbackPhysicalEntitySchema,
  OWNER_WORLD_STATE,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  WORLD_OPERATION_COMMIT_ENTITY_TRANSITION,
  WorldLocusSchema,
  compareTime,
  entityTransitionBoundaryId,
  entityTransitionId,
  entityTransitionObjectId,
  entityTransitionProcessId,
  entityTransitionStage,
  fail,
  ok,
  temporalObjectKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  ENTITY_TRANSITION_OBJECT_PREFIX,
  ENTITY_TRANSITION_PROCESS_PREFIX,
  READ_MODE_NOW,
  type CanonicalTime,
  type CommitGroup,
  type DependencyDeclaration,
  type EntityTransitionCause,
  type EntityTransitionClose,
  type FallbackPhysicalEntity,
  type LocusRef,
  type OwnerFact,
  type Result,
  type SourceFactRef,
  type TemporalObject,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageIdentityViolation } from "../production/admission.ts";

/**
 * The World-State entity-continuity seam (IM-03; WG "Ownership Guards — F-016 Ratified Fallback Objective
 * Physical-Entity Custody"; F-016 v0.4 §2 R-1 ECT-01 and §5 R-4 Entity Transition Close; F-017 CG-2's entity
 * half). For ONE already-accepted fallback physical entity, an already-established external causing result
 * requires one material same-entity locus change; World-State, as fallback custodian, commits the entity's new
 * authoritative current locus exactly once and seals it in ECT-01 under the named Entity Transition Close. The
 * causing owner establishes cause and causal outcome only and never becomes an entity or location writer.
 *
 * Nothing here is a new subsystem: no adapter and no writer exist. The transition acts only as an owner
 * operation the IM-02 coordinator resolves, and `entityCurrentLocus` is a read by identity. The accepted entity is
 * never rewritten: it stays the sealed record of the entity as accepted (its locality is the historical origin),
 * so Production's acceptance and Economy's realized access, which pin it, stay valid as history.
 */

/** A committed fact read by identity: its key, the version it was read at and its typed value. */
export interface EntityFactPin<T> {
  readonly key: string;
  readonly version: number;
  readonly value: T;
}

export interface EntityTransitionPrior {
  /** the causing result, in its own owner's key space */
  readonly cause: EntityFactPin<EntityTransitionCause> & { readonly owner: string };
  /** the accepted fallback entity being transitioned */
  readonly entity: EntityFactPin<FallbackPhysicalEntity>;
  /** the instant the stage resolved at */
  readonly at: CanonicalTime;
}

/**
 * Whether a causing result is its own source's fact lawfully readable by World-State: held in the SOURCE owner's
 * own key space (an owner registered beside the canonical ones, never a canonical, kernel, Population, Production,
 * Economy or World-State key space) and written by the source it names. Returns a message, or null.
 */
export function causeSourceViolation(
  key: string,
  owner: string,
  cause: EntityTransitionCause,
): string | null {
  if (resolveKey(key) !== null || owner === OWNER_WORLD_STATE) {
    return "a causing result is its source's own fact, never World-State's or another registered owner's";
  }
  if (cause.source.owner !== owner) return "a causing result is written by the source it names";
  return null;
}

/**
 * The single statement of the transition rule: the owner operation computes with it and IM-11 admission and
 * load-time verification re-derive with it, so a committed ECT-01 is exactly what the committed cause and the
 * accepted entity determine and nothing else. The entity's quantity, condition and existence are not inputs and
 * not outputs: they stay untouched in the entity's own fact.
 *
 * It invents nothing: no path, no duration, no capacity, no holder and no cause of its own. It refuses unless the
 * result names this very entity, stays within the entity's world, changes the locus materially and takes effect
 * at the instant the stage resolved at.
 */
export function deriveEntityTransition(
  p: EntityTransitionPrior,
): Result<EntityTransitionClose, "NOT_TRANSITIONABLE"> {
  const { cause, entity } = p;
  const refuse = (message: string) => fail("NOT_TRANSITIONABLE", message);
  const c = cause.value;
  const e = entity.value;

  const source = causeSourceViolation(cause.key, cause.owner, c);
  if (source) return refuse(source);
  // an established result is read as established: its owner's later lifecycle is its own and never rewrites a
  // transition already sealed against it
  if (cause.version !== 1)
    return refuse("a causing result is read at its establishment (version 1)");
  if (
    entity.key !== worldFallbackEntityKey(e.locality.world.entity_id, e.entity_id) ||
    c.subject.fact_key !== entity.key ||
    c.subject.entity_id !== e.entity_id
  )
    return refuse("the causing result names this accepted entity, by its own key");
  const to = c.outcome.destination;
  if (
    to.world.fact_key !== worldProfileKey(to.world.entity_id) ||
    to.locus.fact_key !== worldLocusKey(to.world.entity_id, to.locus.entity_id)
  )
    return refuse("destination references do not match their key identities");
  if (to.world.entity_id !== e.locality.world.entity_id)
    return refuse("a same-entity transition stays within the entity's world");
  if (to.locus.entity_id === e.locality.locus.entity_id)
    return refuse("a material transition changes the entity's locus");
  if (compareTime(p.at, c.timing.occurs_at) !== 0)
    return refuse("the outcome takes effect at its own declared instant");

  const value = EntityTransitionCloseSchema.safeParse({
    transition_id: entityTransitionId(c.cause_id),
    entity: { fact_key: entity.key, entity_id: e.entity_id, version: entity.version },
    continuity: {
      relation: "SAME_ENTITY_CONTINUES",
      predecessor: e.entity_id,
      successor: e.entity_id,
      existence: "CONTINUES",
      form: "UNCHANGED",
      conserved: "QUANTITY_AND_CONDITION_UNCHANGED",
      basis: "CAUSING_RESULT_CHANGES_CURRENT_LOCUS_ONLY",
    },
    locus: { from: e.locality, to },
    cause: {
      owner: cause.owner,
      fact_key: cause.key,
      version: cause.version,
      cause_id: c.cause_id,
    },
    custodian: {
      owner: OWNER_WORLD_STATE,
      facet: FACET_WORLD_FALLBACK_ENTITY,
      basis: FALLBACK_BASIS,
    },
    closed_at: p.at,
    close: { name: ENTITY_TRANSITION_CLOSE_NAME, stage: entityTransitionStage(c.cause_id) },
  });
  if (!value.success) return refuse("the result is not a representable Entity Transition Close");
  return ok(value.data);
}

// ---------------------------------------------------------------------------------------------
// The one current-locus resolver. Origin is history; the transition, when it exists, is current.
// ---------------------------------------------------------------------------------------------

/**
 * The current locus of an entity (WG: World-State is the custodian of the entity's objective world-side facts):
 * the destination of its Entity Transition Close when one exists, else the locality it was accepted at.
 */
export const currentLocusOf = (
  entity: FallbackPhysicalEntity,
  transition: EntityTransitionClose | undefined,
): LocusRef => (transition ? transition.locus.to : entity.locality);

export interface EntityCurrentLocus {
  readonly entity: { readonly fact: OwnerFact; readonly value: FallbackPhysicalEntity };
  readonly transition:
    { readonly fact: OwnerFact; readonly value: EntityTransitionClose } | undefined;
  /** where the entity was accepted: history that stays true after a transition */
  readonly origin: LocusRef;
  /** the one authoritative current locus */
  readonly current: LocusRef;
}

/** Reads the entity and its transition by identity (two reads, no scan) and resolves its current locus. */
export function entityCurrentLocus(
  source: { getFact(key: string): OwnerFact | undefined },
  worldId: string,
  entityId: string,
): EntityCurrentLocus | undefined {
  const entityFact = source.getFact(worldFallbackEntityKey(worldId, entityId));
  if (!entityFact) return undefined;
  const entity = FallbackPhysicalEntitySchema.parse(entityFact.value);
  const transitionFact = source.getFact(worldEntityTransitionKey(worldId, entityId));
  const transition = transitionFact
    ? { fact: transitionFact, value: EntityTransitionCloseSchema.parse(transitionFact.value) }
    : undefined;
  return {
    entity: { fact: entityFact, value: entity },
    transition,
    origin: entity.locality,
    current: currentLocusOf(entity, transition?.value),
  };
}

// ---------------------------------------------------------------------------------------------
// IM-02 declaration: one cause is ONE temporal object with ONE earned boundary (the outcome's own instant) and
// ONE declared stage, whose commit is the named Entity Transition Close.
// ---------------------------------------------------------------------------------------------

export interface CauseFact {
  readonly key: string;
  readonly owner: string;
  readonly value: EntityTransitionCause;
}

export function entityTransitionDeclaration(cause: CauseFact): DependencyDeclaration {
  const c = cause.value;
  const now = (source: SourceFactRef) => ({
    mode: READ_MODE_NOW as typeof READ_MODE_NOW,
    source,
    invalidators: [{ fact_key: source.fact_key }],
  });
  const world = c.outcome.destination.world;
  return {
    stage: entityTransitionStage(c.cause_id),
    reads: [
      now({ owner: cause.owner, fact_key: cause.key }),
      now({ owner: OWNER_WORLD_STATE, fact_key: c.subject.fact_key }),
      now({ owner: OWNER_WORLD_STATE, fact_key: world.fact_key }),
      now({ owner: OWNER_WORLD_STATE, fact_key: c.outcome.destination.locus.fact_key }),
    ],
    produces: [worldEntityTransitionKey(world.entity_id, c.subject.entity_id)],
    declares_close: { name: ENTITY_TRANSITION_CLOSE_NAME },
  };
}

/**
 * The temporal object of one causing result. A pure function of the cause, so registration admission can demand
 * exactly this object and nothing else (a hand-written object cannot smuggle a different stage, read, boundary or
 * recurrence).
 */
export function entityTransitionTemporalObject(cause: CauseFact): TemporalObject {
  const declaration = entityTransitionDeclaration(cause);
  const c = cause.value;
  return {
    object_id: entityTransitionObjectId(c.cause_id),
    owning_ref: { owner: OWNER_WORLD_STATE, process_id: entityTransitionProcessId(c.cause_id) },
    last_resolved_basis: c.timing.established_at,
    partition: { class: "EXACT-PARTITION" },
    next_boundary: {
      boundary_id: entityTransitionBoundaryId(c.cause_id),
      at: c.timing.occurs_at,
    },
    dependencies: [declaration],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: declaration.reads.map((r) => ({ fact_key: r.source.fact_key })),
    information_latency: { creates_epistemic_interruption: false },
  };
}

const isTransitionStage = (s: { owner: string; operation: string }): boolean =>
  s.owner === OWNER_WORLD_STATE && s.operation === WORLD_OPERATION_COMMIT_ENTITY_TRANSITION;

/** Whether a temporal object declares the transition stage or names a transition process. */
export const isEntityTransitionObject = (o: TemporalObject): boolean =>
  o.dependencies.some((d) => isTransitionStage(d.stage.owner_operation)) ||
  (o.owning_ref.owner === OWNER_WORLD_STATE &&
    o.owning_ref.process_id.startsWith(ENTITY_TRANSITION_PROCESS_PREFIX));

/**
 * RC-10: an entity-transition temporal object is exactly the one derived from its committed causing result (one
 * earned boundary: the outcome's declared instant; its one stage; EXACT-PARTITION; no recurrence). Applies to every
 * object that declares the transition stage or names a transition process, so a hand-written object cannot
 * smuggle a different boundary, read, stage or owner. `registered` is the registration-time form (the subject must
 * be an accepted entity that has not transitioned); the load-time form allows the resolved basis and retired
 * boundary an object legitimately has after its transaction.
 */
export function entityTransitionObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered: boolean,
): string | null {
  if (!isEntityTransitionObject(o)) return null;
  const stage = o.dependencies.find((d) => isTransitionStage(d.stage.owner_operation));
  if (!o.object_id.startsWith(ENTITY_TRANSITION_OBJECT_PREFIX)) {
    return "an entity-transition temporal object has the identity derived from its cause";
  }
  const causeId = o.object_id.slice(ENTITY_TRANSITION_OBJECT_PREFIX.length);
  const causeRead = stage?.reads[0];
  const causeFact = causeRead ? state.facts.get(causeRead.source.fact_key) : undefined;
  const cause = causeFact ? EntityTransitionCauseSchema.safeParse(causeFact.value) : undefined;
  if (
    !causeRead ||
    !causeFact ||
    !cause?.success ||
    causeFact.owner !== causeRead.source.owner ||
    cause.data.cause_id !== causeId ||
    causeSourceViolation(causeFact.key, causeFact.owner, cause.data) !== null
  ) {
    return "an entity-transition temporal object names a committed causing result that fixes it";
  }
  const { world } = cause.data.outcome.destination;
  // The causing owner keeps its own lifecycle: once its result has advanced past the establishment the transition
  // (if any) is checked against that history by the integrity verifier, and the object by its identities alone.
  if (!registered && causeFact.version !== 1) return null;
  if (registered) {
    const entityFact = state.facts.get(cause.data.subject.fact_key);
    const entity = entityFact
      ? FallbackPhysicalEntitySchema.safeParse(entityFact.value)
      : undefined;
    if (!entityFact || !entity?.success) {
      return "only an already-accepted entity earns a transition boundary";
    }
    if (state.facts.has(worldEntityTransitionKey(world.entity_id, cause.data.subject.entity_id))) {
      return "an entity that already transitioned earns no further transition boundary";
    }
    // the destination is an established locus of the entity's world (a transition never creates its destination)
    const destLocus = state.facts.get(cause.data.outcome.destination.locus.fact_key);
    const locus = destLocus ? WorldLocusSchema.safeParse(destLocus.value) : undefined;
    if (
      !state.facts.has(world.fact_key) ||
      !locus?.success ||
      locus.data.world.entity_id !== world.entity_id
    ) {
      return "only an established locus of the entity's world is a destination: a transition creates none";
    }
    // a cause that cannot lawfully transition its entity earns no boundary (it would only hold time unresolved)
    const derived = deriveEntityTransition({
      cause: {
        key: causeFact.key,
        owner: causeFact.owner,
        version: causeFact.version,
        value: cause.data,
      },
      entity: { key: entityFact.key, version: entityFact.version, value: entity.data },
      at: cause.data.timing.occurs_at,
    });
    if (!derived.ok) {
      return `a cause that cannot lawfully transition its entity earns no boundary: ${derived.error.message}`;
    }
  }
  const expected = entityTransitionTemporalObject({
    key: causeFact.key,
    owner: causeFact.owner,
    value: cause.data,
  });
  const loose = (x: TemporalObject) => ({ ...x, last_resolved_basis: null, next_boundary: null });
  if (!canonicalEqual(loose(o), loose(expected))) {
    return "an entity-transition temporal object is exactly the object derived from its cause";
  }
  if (registered) {
    if (
      !canonicalEqual(o.next_boundary, expected.next_boundary) ||
      !canonicalEqual(o.last_resolved_basis, expected.last_resolved_basis)
    )
      return "an entity-transition temporal object earns exactly the outcome's declared boundary";
  } else if (o.next_boundary !== null && !canonicalEqual(o.next_boundary, expected.next_boundary)) {
    return "an entity-transition temporal object's boundary is the outcome's declared instant";
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// IM-11 admission of one transition.
// ---------------------------------------------------------------------------------------------

/**
 * IM-11 admission of one Entity Transition Close. Re-derived from the pinned causing result and the accepted
 * entity, so the cause owner, a consumer, Production, Economy or a raw store commit cannot create, alter or
 * duplicate the entity's transition: it exists only as the one consequence a committed causing result determines,
 * for the one entity it names, at the instant it declares. Create-only (sealed), one slot per entity: a second
 * transition of the same entity is a version conflict. The entity itself is not in the group — it cannot be
 * rewritten by a transition — and the transition is lawful only as its IM-02 stage, at its engaged boundary.
 */
export function worldTransitionGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  const ref = (message: string, details?: Record<string, unknown>) =>
    reject("REFERENCE_INVALID", message, details);
  if (group.writes.length !== 1) return bad("one transition closes exactly one entity transition");
  const w = group.writes[0]!;
  const t = EntityTransitionCloseSchema.parse(w.value);
  const causeId = t.cause.cause_id;
  const world = t.locus.to.world;
  if (
    w.key !== worldEntityTransitionKey(t.locus.from.world.entity_id, t.entity.entity_id) ||
    t.transition_id !== entityTransitionId(causeId) ||
    t.entity.fact_key !== worldFallbackEntityKey(t.locus.from.world.entity_id, t.entity.entity_id)
  ) {
    return ref(
      "the transition is at the key derived from its entity, and its identity from its cause",
    );
  }

  // every upstream fact is read at its CURRENT version and depended upon (a stage pins what it read)
  const need = (key: string, what: string) => requirePrerequisite(group, state, key, what);
  const causeP = need(t.cause.fact_key, "the causing result");
  if (isRejection(causeP)) return causeP;
  const entityP = need(t.entity.fact_key, "the accepted entity");
  if (isRejection(entityP)) return entityP;
  const worldP = need(world.fact_key, "the world profile");
  if (isRejection(worldP)) return worldP;
  const locusP = need(t.locus.to.locus.fact_key, "the destination locus");
  if (isRejection(locusP)) return locusP;
  const locus = WorldLocusSchema.safeParse(locusP.fact.value);
  if (!locus.success || locus.data.world.entity_id !== world.entity_id) {
    return ref("the destination locus does not belong to the world", {
      key: t.locus.to.locus.fact_key,
    });
  }
  if (causeP.fact.owner !== t.cause.owner || causeP.fact.version !== t.cause.version) {
    return ref("the causing result is pinned at its current version, by its own owner", {
      key: t.cause.fact_key,
    });
  }
  if (entityP.fact.version !== t.entity.version) {
    return ref("the entity is pinned at its current version", { key: t.entity.fact_key });
  }
  const cause = EntityTransitionCauseSchema.safeParse(causeP.fact.value);
  const entity = FallbackPhysicalEntitySchema.safeParse(entityP.fact.value);
  if (!cause.success || !entity.success) {
    return ref("a transition reads a causing result and an accepted entity");
  }
  const derived = deriveEntityTransition({
    cause: {
      key: causeP.fact.key,
      owner: causeP.fact.owner,
      version: causeP.fact.version,
      value: cause.data,
    },
    entity: { key: entityP.fact.key, version: entityP.fact.version, value: entity.data },
    at: t.closed_at,
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key });
  if (!canonicalEqual(derived.value, t)) {
    return bad(
      "a transition is exactly what the cause determines: the same entity, from its accepted locus to the declared destination, once",
      { key: w.key },
    );
  }
  // published only as its IM-02 stage (the one rule load-time verification also applies)
  const identity = stageIdentityViolation(group, entityTransitionStage(causeId));
  if (identity) return ref(identity, { key: w.key });
  // it commits only at its engaged, unretired, declared boundary (the object is the engagement)
  const obj = state.facts.get(temporalObjectKey(entityTransitionObjectId(causeId)));
  const clock = state.facts.get(TEMPORAL_STATE_KEY);
  const o = obj ? TemporalObjectSchema.safeParse(obj.value) : undefined;
  const s = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  if (
    !o?.success ||
    !s?.success ||
    !o.data.next_boundary ||
    o.data.next_boundary.boundary_id !== entityTransitionBoundaryId(causeId) ||
    compareTime(o.data.next_boundary.at, cause.data.timing.occurs_at) !== 0 ||
    ![-1, 0].includes(compareTime(s.data.canonical_time, cause.data.timing.occurs_at) ?? 1)
  ) {
    return ref(
      "a transition is committed only for an engaged cause whose declared boundary has not been retired",
    );
  }
  return null;
}
