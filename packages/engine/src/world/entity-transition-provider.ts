import {
  EntityTransitionCauseSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  OWNER_WORLD_STATE,
  WORLD_OPERATION_COMMIT_ENTITY_TRANSITION,
  compareTime,
  worldEntityTransitionKey,
} from "@immortalis/contracts";
import { WORLD_ENTITY_TRANSITION_RULE, resolveKey } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveEntityTransition } from "./entity-transition.ts";
import { parsePhysicalSubject, physicalSubjectOf } from "./physical-subject.ts";

/**
 * The IM-02 owner-adapter operation of the World-State fallback custodian's entity transition (F-016 v0.4 §2 R-1:
 * "World-State or the more-specific entity custodian commits existence/cessation/form exactly once and ECT-01
 * references the causing result"). Pure and deterministic. It reads the committed causing result, the accepted
 * entity, the world and the destination locus; it commits that one same-entity locus change and nothing else, or
 * throws StageUnresolvedError: nothing is published and the transition stays pending. Its commit IS the named
 * Entity Transition Close (declared by the stage's own declaration, never by a requested horizon).
 *
 * It invents nothing: no cause, path, duration or holder, and it resolves only at the instant the cause declares.
 * basis/secrecy are inherited from the accepted entity it advances the custody of, never defaulted. It has no
 * adapter method at all: nothing but a committed causing result can move an entity.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const worldEntityTransitionProvider: StageProvider = {
  owner: OWNER_WORLD_STATE,
  facet: FACET_WORLD_FALLBACK_ENTITY,
  operation: WORLD_OPERATION_COMMIT_ENTITY_TRANSITION,
  rule: WORLD_ENTITY_TRANSITION_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    // the physical subject: an accepted fallback entity, or the active PC's physical-locus custody record
    const entities = input.reads.filter((r) => {
      const kind = resolveKey(r.fact.key)?.kind.id;
      return (
        r.fact.owner === OWNER_WORLD_STATE &&
        (kind === "world_fallback_entity" || kind === "world_pc_locus_custody")
      );
    });
    // the causing result lives in its source's own key space: the one read no registered key space holds — or,
    // for a movement Logistics committed to, Logistics' own registered delivery-complete result
    const causes = input.reads.filter((r) => {
      const kind = resolveKey(r.fact.key)?.kind.id;
      return kind === undefined || kind === "logistics_delivery";
    });
    if (entities.length !== 1 || causes.length !== 1)
      throw unresolved(
        "SOURCE_ABSENT",
        "a transition reads exactly one causing result and one accepted entity",
      );
    const entityFact = entities[0]!.fact;
    const causeFact = causes[0]!.fact;
    const entity = parsePhysicalSubject(entityFact.value);
    const cause = EntityTransitionCauseSchema.safeParse(causeFact.value);
    if (!entity || !cause.success)
      throw unresolved("SOURCE_INVALID", "the cause or the entity violates its typed contract");
    const subject = physicalSubjectOf(entity);
    const key = worldEntityTransitionKey(subject.locality.world.entity_id, subject.entity_id);
    if (input.produces.length !== 1 || input.produces[0] !== key)
      throw unresolved("SOURCE_INVALID", "the transition does not write its entity's own slot");
    if (input.prior.has(key)) {
      throw unresolved("SOURCE_INVALID", "the entity has already transitioned");
    }
    // resolved only AT the cause's own declared instant, never at a requested horizon
    if (compareTime(input.span.to, cause.data.timing.occurs_at) !== 0)
      throw unresolved("BASIS_MISMATCH", "a transition resolves at the declared instant only");
    const derived = deriveEntityTransition({
      cause: {
        key: causeFact.key,
        owner: causeFact.owner,
        version: causeFact.version,
        value: cause.data,
      },
      entity: { key: entityFact.key, version: entityFact.version, value: entity },
      at: input.span.to,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    return [
      {
        key,
        value: derived.value as never,
        unit: null,
        basis: entityFact.basis,
        secrecy: entityFact.secrecy,
      },
    ];
  },
};
