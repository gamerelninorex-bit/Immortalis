import {
  DurableCompletionEnvelopeSchema,
  ECONOMY_OPERATION_REALIZE_ACCESS,
  EconomyDemandEnvelopeSchema,
  FACET_ECONOMY_STATE,
  FallbackPhysicalEntitySchema,
  OWNER_ECONOMY,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  ProductionOperationSchema,
  ProductionRequestSchema,
  type OwnerFact,
} from "@immortalis/contracts";
import { ECONOMY_RULE, resolveKey } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveRealization } from "./derive.ts";

/**
 * IM-06 — the Economy realized-access operation (WS-004 §8 step 6, §21, §27.2, §27.14), exposed to the IM-02
 * coordinator through the owner-adapter seam. Pure and deterministic: identical input, identical writes. It is
 * the third stage of an Economy-sourced operation's one temporal object, a dependent of the World-State
 * custodian's acceptance: it reads the committed demand, request, operation, completion and the custodian's
 * accepted entity, and records the realized access — or throws StageUnresolvedError (no credit, nothing
 * published) when the chain does not support it.
 *
 * It invents nothing: no price, purchasing capability, entitlement, preference, substitution or partial
 * satisfaction. It resolves only at the operation's own declared boundary instant, never a requested horizon.
 * basis/secrecy are inherited from the demand it answers.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const economyRealizationProvider: StageProvider = {
  owner: OWNER_ECONOMY,
  facet: FACET_ECONOMY_STATE,
  operation: ECONOMY_OPERATION_REALIZE_ACCESS,
  rule: ECONOMY_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const readOf = (owner: string, kind: string): OwnerFact => {
      const found = input.reads.filter(
        (r) => r.fact.owner === owner && resolveKey(r.fact.key)?.kind.id === kind,
      );
      if (found.length !== 1)
        throw unresolved("SOURCE_ABSENT", `a realization reads exactly one ${kind}`);
      return found[0]!.fact;
    };
    const demandFact = readOf(OWNER_ECONOMY, "economy_demand");
    const requestFact = readOf(OWNER_ECONOMY, "economy_request");
    const opFact = readOf(OWNER_PRODUCTION, "production_operation");
    const completionFact = readOf(OWNER_PRODUCTION, "production_completion");
    const entityFact = readOf(OWNER_WORLD_STATE, "world_fallback_entity");
    const [key] = input.produces;
    if (input.produces.length !== 1 || !key || input.prior.has(key))
      throw unresolved("SOURCE_INVALID", "a realization creates one result, once");
    const demand = EconomyDemandEnvelopeSchema.safeParse(demandFact.value);
    const request = ProductionRequestSchema.safeParse(requestFact.value);
    const op = ProductionOperationSchema.safeParse(opFact.value);
    const completion = DurableCompletionEnvelopeSchema.safeParse(completionFact.value);
    const entity = FallbackPhysicalEntitySchema.safeParse(entityFact.value);
    if (
      !demand.success ||
      !request.success ||
      !op.success ||
      !completion.success ||
      !entity.success
    )
      throw unresolved("SOURCE_INVALID", "a source of the realization is malformed");
    const derived = deriveRealization({
      demand: { key: demandFact.key, version: demandFact.version, value: demand.data },
      request: { key: requestFact.key, version: requestFact.version, value: request.data },
      operation: { key: opFact.key, version: opFact.version, value: op.data },
      completion: {
        key: completionFact.key,
        version: completionFact.version,
        value: completion.data,
      },
      entity: { key: entityFact.key, version: entityFact.version, value: entity.data },
      at: input.span.to,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    return [
      {
        key,
        value: derived.value as never,
        unit: null,
        basis: demandFact.basis,
        secrecy: demandFact.secrecy,
      },
    ];
  },
};
