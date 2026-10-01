import {
  FACET_ACTOR_PROFILE,
  NAMED_ACTOR_OPERATION_PUBLISH_CAPABILITY_CLOSE,
  NamedActorCapabilityBasisSchema,
  NamedActorCapabilitySchema,
  OWNER_NAMED_ACTOR,
  actorCapabilityKey,
} from "@immortalis/contracts";
import { NAMED_ACTOR_RULE } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveCapability } from "./derive.ts";

/**
 * IM-07 — the one Named-Actor owner operation (WS-016 §16 step 5, §27.1), exposed to the IM-02 coordinator through
 * the owner-adapter seam: it publishes one capability at the actor owner's declared capability close. Pure and
 * deterministic: identical input, identical writes. It reads exactly one fact — the sealed establishment basis — and
 * invents nothing: no grade, prior, roll or numeric value. It throws StageUnresolvedError (nothing published, nothing
 * credited, dependents wait) when its one source does not lawfully support a capability.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const namedActorCapabilityCloseProvider: StageProvider = {
  owner: OWNER_NAMED_ACTOR,
  facet: FACET_ACTOR_PROFILE,
  operation: NAMED_ACTOR_OPERATION_PUBLISH_CAPABILITY_CLOSE,
  rule: NAMED_ACTOR_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    if (input.reads.length !== 1)
      throw unresolved("SOURCE_ABSENT", "a capability close reads exactly one establishment basis");
    const basisFact = input.reads[0]!.fact;
    const basis = NamedActorCapabilityBasisSchema.safeParse(basisFact.value);
    if (!basis.success) throw unresolved("SOURCE_INVALID", "the basis violates its contract");
    const key = actorCapabilityKey(basis.data.actor_id, basis.data.capability_id);
    if (input.produces.length !== 1 || input.produces[0] !== key)
      throw unresolved("SOURCE_INVALID", "the close does not write its own actor/capability slot");
    if (input.prior.has(key))
      throw unresolved("SOURCE_INVALID", "the capability is already published at its close");
    const derived = deriveCapability({
      key: basisFact.key,
      owner: basisFact.owner,
      version: basisFact.version,
      value: basis.data,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    NamedActorCapabilitySchema.parse(derived.value);
    return [
      {
        key,
        value: derived.value as never,
        unit: null,
        // the capability inherits the labels of the authored basis it publishes; never defaulted
        basis: basisFact.basis,
        secrecy: basisFact.secrecy,
      },
    ];
  },
};
