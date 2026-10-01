import {
  FACET_PRODUCTION_STATE,
  OWNER_PRODUCTION,
  PRODUCTION_OPERATION_COMPLETE,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionReserveSchema,
  compareTime,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey, PRODUCTION_RULE } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveCompletion } from "./derive.ts";

/**
 * IM-05 — the Production completion operation (WS-003 §14; CG-2 first half), exposed to the IM-02 coordinator
 * through the owner-adapter seam. Pure and deterministic: identical input, identical writes. At the operation's
 * one explicitly declared boundary it consumes the claimed input exactly once, closes the claim and seals the
 * Durable Completion Envelope on one conserved output reference; the durable is NOT available for ordinary use
 * until the destination custodian accepts that same reference.
 *
 * It invents nothing: no yield, rate, cadence or duration, no priority. It resolves only at the boundary the
 * operation declared — never at a horizon someone requested — and otherwise throws StageUnresolvedError: the
 * stage is not credited and nothing is published. basis/secrecy are inherited from the facts it advances.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const productionCompletionProvider: StageProvider = {
  owner: OWNER_PRODUCTION,
  facet: FACET_PRODUCTION_STATE,
  operation: PRODUCTION_OPERATION_COMPLETE,
  rule: PRODUCTION_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const byKind = (id: string): [string, OwnerFact][] =>
      [...input.prior].filter(([k]) => resolveKey(k)?.kind.id === id);
    const one = (id: string): [string, OwnerFact] => {
      const found = byKind(id);
      if (
        found.length !== 1 ||
        input.produces.filter((k) => resolveKey(k)?.kind.id === id).length !== 1
      )
        throw unresolved("SOURCE_ABSENT", `a completion advances exactly one ${id}`);
      return found[0]!;
    };
    const [opKey, opFact] = one("production_operation");
    const [reserveKey, reserveFact] = one("production_reserve");
    const [claimKey, claimFact] = one("production_claim");
    const completionKey = input.produces.find(
      (k) => resolveKey(k)?.kind.id === "production_completion",
    );
    if (!completionKey || input.prior.has(completionKey) || input.produces.length !== 4)
      throw unresolved("SOURCE_INVALID", "a completion creates one envelope, once");
    const op = ProductionOperationSchema.safeParse(opFact.value);
    const reserve = ProductionReserveSchema.safeParse(reserveFact.value);
    const claim = ProductionClaimSchema.safeParse(claimFact.value);
    if (!op.success || !reserve.success || !claim.success)
      throw unresolved("SOURCE_INVALID", "the operation, reserve or claim is malformed");
    // resolved only AT the operation's own declared boundary, never at a requested horizon
    if (compareTime(input.span.to, op.data.timing.completion.at) !== 0)
      throw unresolved("BASIS_MISMATCH", "a completion resolves at the declared boundary only");
    const derived = deriveCompletion({
      operation: op.data,
      reserve: reserve.data,
      reserveVersion: reserveFact.version,
      claim: claim.data,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    const d = derived.value;
    const inherit = (f: OwnerFact) => ({ unit: null, basis: f.basis, secrecy: f.secrecy });
    return [
      { key: opKey, value: d.operation as never, ...inherit(opFact) },
      { key: reserveKey, value: d.reserve as never, ...inherit(reserveFact) },
      { key: claimKey, value: d.claim as never, ...inherit(claimFact) },
      { key: completionKey, value: d.envelope as never, ...inherit(opFact) },
    ];
  },
};
