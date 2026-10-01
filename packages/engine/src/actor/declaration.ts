import {
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  BoundaryIndexSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  compareTime,
  temporalObjectKey,
  NAMED_ACTOR_OPERATION_PUBLISH_CAPABILITY_CLOSE,
  NamedActorCapabilityBasisSchema,
  OWNER_NAMED_ACTOR,
  READ_MODE_CLOSE,
  READ_MODE_NOW,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  type DependencyDeclaration,
  type NamedActorCapabilityBasis,
  type TemporalObject,
  type TemporalReadDeclaration,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";

/**
 * Builders and the registration rule for the Named-Actor side of the temporal declaration (RC-10 dependency
 * declarations; WS-016 §27, §27.1; F-017 §3 CLOSE). A Named-Actor capability is established only when a dependent
 * consequence materially requires it (WS-016 §16 trigger), so its one stage is declared INSIDE the engaged object of
 * that consequence, ahead of it: the actor owner's close stage commits the capability, and the consequence reads it
 * AS-OF-DECLARED-CLOSE and cannot resolve before it. There is no standalone Named-Actor object, boundary, tick or sweep.
 */

const SOURCE_KEYS = {
  basis: /^actor\/[A-Za-z0-9][A-Za-z0-9._:-]*\/capability-basis\/[A-Za-z0-9][A-Za-z0-9._:-]*$/,
  capability: /^actor\/[A-Za-z0-9][A-Za-z0-9._:-]*\/capability\/[A-Za-z0-9][A-Za-z0-9._:-]*$/,
} as const;
const CAPABILITY_KEY =
  /^actor\/([A-Za-z0-9][A-Za-z0-9._:-]*)\/capability\/([A-Za-z0-9][A-Za-z0-9._:-]*)$/;

/** The actor and capability a Named-Actor close stage names (from its prospective result identity), or null. */
export const capabilityOfKey = (key: string): { actorId: string; capabilityId: string } | null => {
  const m = CAPABILITY_KEY.exec(key);
  return m ? { actorId: m[1]!, capabilityId: m[2]! } : null;
};

/** The one stage whose commit is the capability close of one actor/capability: reads its sealed basis, writes the capability. */
export function namedActorCapabilityDeclaration(
  basis: NamedActorCapabilityBasis,
): DependencyDeclaration {
  const basisKey = actorCapabilityBasisKey(basis.actor_id, basis.capability_id);
  return {
    stage: actorCapabilityStage(basis.actor_id, basis.capability_id),
    reads: [
      {
        mode: READ_MODE_NOW,
        source: { owner: OWNER_NAMED_ACTOR, fact_key: basisKey },
        invalidators: [{ fact_key: basisKey }],
      },
    ],
    produces: [actorCapabilityKey(basis.actor_id, basis.capability_id)],
    declares_close: { name: ACTOR_PROFILE_CAPABILITY_CLOSE },
  };
}

/**
 * The only read a cross-owner consumer may declare of a Named-Actor capability: AS-OF-DECLARED-CLOSE, naming the
 * actor owner's declared close (WS-016 §27.1: "Every cross-owner consumer reads capability AS-OF-DECLARED-CLOSE").
 */
export function namedActorCapabilityCloseRead(
  actorId: string,
  capabilityId: string,
): TemporalReadDeclaration {
  const key = actorCapabilityKey(actorId, capabilityId);
  return {
    mode: READ_MODE_CLOSE,
    source: { owner: OWNER_NAMED_ACTOR, fact_key: key },
    close_basis: {
      name: ACTOR_PROFILE_CAPABILITY_CLOSE,
      producer: {
        owner: OWNER_NAMED_ACTOR,
        operation: NAMED_ACTOR_OPERATION_PUBLISH_CAPABILITY_CLOSE,
      },
    },
    invalidators: [{ fact_key: key }],
  };
}

/**
 * RC-10 / WS-016 §27.1 registration rule for every object that touches the Named-Actor key spaces or owner. Applies at
 * registration and at load, so a hand-written object cannot smuggle a different stage, a NOW read of a capability, a
 * read of the uncommitted basis or a Named-Actor-owned engagement:
 *
 *  - no object is owned by the Named-Actor owner (a capability is established only inside the object of the dependent
 *    consequence that materially requires it);
 *  - every Named-Actor stage is exactly the declaration derived from a COMMITTED, valid establishment basis (so a
 *    consequence can never conjure a capability: without a committed basis there is nothing to declare);
 *  - the basis is read only by that stage; every other read of a Named-Actor capability is AS-OF-DECLARED-CLOSE naming
 *    the actor owner's declared close — never AS-OF-NOW, and never the basis, so an uncommitted fact is not visible;
 *  - no stage outside the actor owner declares that it produces a Named-Actor key;
 *  - at registration, a capability close is declared by exactly one engaged object per instant (an IM-02 rule: a stage
 *    is declared by exactly one engaged object): another consequence due at the same instant reads the close
 *    AS-OF-DECLARED-CLOSE and declares no second stage. Checked against the active boundary index by identity.
 */
export function namedActorObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered = false,
): string | null {
  if (o.owning_ref.owner === OWNER_NAMED_ACTOR) {
    return "a Named-Actor capability is established only inside the engaged object of a dependent consequence: there is no standalone Named-Actor object";
  }
  for (const d of o.dependencies) {
    const isActorStage = d.stage.owner_operation.owner === OWNER_NAMED_ACTOR;
    if (!isActorStage) {
      if (d.produces.some((k) => k.startsWith("actor/"))) {
        return "only the Named-Actor owner's stage produces a Named-Actor fact";
      }
    } else {
      if (d.stage.owner_operation.operation !== NAMED_ACTOR_OPERATION_PUBLISH_CAPABILITY_CLOSE) {
        return "the Named-Actor owner declares exactly one stage: the capability close";
      }
      const target = capabilityOfKey(d.stage.prospective_result_id);
      const basisFact = target
        ? state.facts.get(actorCapabilityBasisKey(target.actorId, target.capabilityId))
        : undefined;
      const basis = basisFact
        ? NamedActorCapabilityBasisSchema.safeParse(basisFact.value)
        : undefined;
      if (!target || !basisFact || !basis?.success || basisFact.owner !== OWNER_NAMED_ACTOR) {
        return "a Named-Actor capability close is declared only for a committed establishment basis: a consequence cannot create the capability it needs";
      }
      if (!canonicalEqual(d, namedActorCapabilityDeclaration(basis.data))) {
        return "a Named-Actor stage is exactly the declaration derived from its establishment basis";
      }
    }
    for (const r of d.reads) {
      if (r.source.owner !== OWNER_NAMED_ACTOR && !r.source.fact_key.startsWith("actor/")) continue;
      if (SOURCE_KEYS.basis.test(r.source.fact_key)) {
        if (!isActorStage) {
          return "the establishment basis is not a cross-owner read: a capability is visible only at its declared close";
        }
      } else if (SOURCE_KEYS.capability.test(r.source.fact_key)) {
        const target = capabilityOfKey(r.source.fact_key)!;
        const required = namedActorCapabilityCloseRead(target.actorId, target.capabilityId);
        if (!canonicalEqual(r, required) || r.source.owner !== OWNER_NAMED_ACTOR) {
          return "a Named-Actor capability is read only AS-OF-DECLARED-CLOSE, naming the actor owner's declared close";
        }
      } else {
        return "a read of a Named-Actor key space names a capability or its establishment basis";
      }
    }
  }
  return registered ? duplicateCloseViolation(o, state) : null;
}

/** Another engaged object due at the same instant that already declares one of this object's Named-Actor closes. */
function duplicateCloseViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
): string | null {
  if (!o.next_boundary) return null;
  const mine = o.dependencies.filter((d) => d.stage.owner_operation.owner === OWNER_NAMED_ACTOR);
  if (mine.length === 0) return null;
  const indexFact = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  const index = indexFact ? BoundaryIndexSchema.safeParse(indexFact.value) : undefined;
  if (!index?.success) return null;
  for (const entry of index.data.entries) {
    if (entry.object_id === o.object_id || compareTime(entry.at, o.next_boundary.at) !== 0)
      continue;
    const other = state.facts.get(temporalObjectKey(entry.object_id));
    const parsed = other ? TemporalObjectSchema.safeParse(other.value) : undefined;
    if (
      parsed?.success &&
      parsed.data.dependencies.some((d) => mine.some((m) => canonicalEqual(m.stage, d.stage)))
    ) {
      return "a capability close is declared by exactly one engaged object per instant: another consequence due at that instant already declares it, so this one reads it AS-OF-DECLARED-CLOSE without declaring a second stage";
    }
  }
  return null;
}
