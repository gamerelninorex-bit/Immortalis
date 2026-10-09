import {
  FACET_PRODUCTION_STATE,
  OWNER_PRODUCTION,
  PRODUCTION_OPERATION_CREDIT_RESERVE_INFLOW,
  PRODUCTION_OPERATION_EMIT_SOURCE_DELTA,
  ProductionExtractionSchema,
  ProductionReserveSchema,
  SourceDeltaSchema,
  WorldSourceDeliverySchema,
  compareTime,
  type OwnerFact,
} from "@immortalis/contracts";
import { PRODUCTION_SOURCE_DRAWDOWN_RULE, resolveKey } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveReserveInflow, deriveSourceDelta, parseAccount, pinned } from "./derive.ts";

/**
 * IM-05 — the two Production operations of one exact finite raw-source drawdown (WS-003 §4A, §4B; brief steps 3 and 5),
 * exposed to the IM-02 coordinator through the owner-adapter seam. Pure and deterministic: identical input, identical
 * writes. They invent nothing: no yield, rate, cadence, duration, partial fill or priority. Each resolves only at the
 * extraction's own declared boundary — never at a horizon someone requested — and otherwise throws StageUnresolvedError:
 * the stage is not credited and nothing is published. basis/secrecy are inherited from the facts a stage answers.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

const kindOf = (key: string) => resolveKey(key)?.kind.id;

/** Stage 1: Production emits the Production-caused Source Delta, which is the key's Pending Drawdown until delivered. */
export const productionSourceDeltaProvider: StageProvider = {
  owner: OWNER_PRODUCTION,
  facet: FACET_PRODUCTION_STATE,
  operation: PRODUCTION_OPERATION_EMIT_SOURCE_DELTA,
  rule: PRODUCTION_SOURCE_DRAWDOWN_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const reads = input.reads.filter((r) => kindOf(r.fact.key) === "production_extraction");
    const [key] = input.produces;
    if (
      reads.length !== 1 ||
      input.reads.length !== 1 ||
      input.produces.length !== 1 ||
      !key ||
      kindOf(key) !== "production_source_delta" ||
      input.prior.has(key)
    )
      throw unresolved(
        "SOURCE_INVALID",
        "a Source Delta is emitted from exactly one extraction, once",
      );
    const exFact = reads[0]!.fact;
    const ex = pinned(exFact, ProductionExtractionSchema);
    if (!ex) throw unresolved("SOURCE_INVALID", "the extraction is malformed");
    if (compareTime(input.span.to, ex.value.timing.boundary.at) !== 0)
      throw unresolved("BASIS_MISMATCH", "a Source Delta is emitted at the declared boundary only");
    const delta = deriveSourceDelta(ex);
    if (SourceDeltaSchema.safeParse(delta).success !== true)
      throw unresolved("SOURCE_INVALID", "the drawdown is not a representable Source Delta");
    return [
      { key, value: delta as never, unit: null, basis: exFact.basis, secrecy: exFact.secrecy },
    ];
  },
};

/** Stage 3: Production credits the Reserve inflow, once, after World-State's delivery of that very delta. */
export const productionReserveInflowProvider: StageProvider = {
  owner: OWNER_PRODUCTION,
  facet: FACET_PRODUCTION_STATE,
  operation: PRODUCTION_OPERATION_CREDIT_RESERVE_INFLOW,
  rule: PRODUCTION_SOURCE_DRAWDOWN_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const one = (kind: string): OwnerFact => {
      const found = input.reads.filter((r) => kindOf(r.fact.key) === kind);
      if (found.length !== 1)
        throw unresolved("SOURCE_ABSENT", `an inflow reads exactly one ${kind}`);
      return found[0]!.fact;
    };
    const deliveryFact = one("world_source_delivery");
    const deltaFact = one("production_source_delta");
    const exFact = one("production_extraction");
    const reserveKey = input.produces.find((k) => kindOf(k) === "production_reserve");
    const accountKey = input.produces.find((k) => kindOf(k) === "production_source_account");
    if (input.reads.length !== 3 || input.produces.length !== 2 || !reserveKey || !accountKey)
      throw unresolved("SOURCE_INVALID", "an inflow advances one Reserve and one account");
    const reserveFact = input.prior.get(reserveKey);
    const accountFact = input.prior.get(accountKey);
    if (!reserveFact || !accountFact)
      throw unresolved(
        "SOURCE_ABSENT",
        "an inflow advances an established Reserve and an opened account",
      );
    const extraction = pinned(exFact, ProductionExtractionSchema);
    const delta = pinned(deltaFact, SourceDeltaSchema);
    const delivery = pinned(deliveryFact, WorldSourceDeliverySchema);
    const reserve = ProductionReserveSchema.safeParse(reserveFact.value);
    const account = parseAccount(accountFact);
    if (!extraction || !delta || !delivery || !reserve.success || !account)
      throw unresolved("SOURCE_INVALID", "a source of the inflow is malformed");
    if (compareTime(input.span.to, extraction.value.timing.boundary.at) !== 0)
      throw unresolved("BASIS_MISMATCH", "an inflow resolves at the declared boundary only");
    const derived = deriveReserveInflow({
      extraction,
      delta,
      delivery,
      reserve: reserve.data,
      account,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    const inherit = (f: OwnerFact) => ({ unit: null, basis: f.basis, secrecy: f.secrecy });
    return [
      { key: reserveKey, value: derived.value.reserve as never, ...inherit(reserveFact) },
      { key: accountKey, value: derived.value.account as never, ...inherit(accountFact) },
    ];
  },
};
