import {
  FACET_GIP_INSTITUTION_IDENTITY,
  GIP_OPERATION_EXPIRE_AT_SUNSET,
  GovernanceInstrumentSchema,
  OWNER_GIP,
  compareTime,
  gipInstrumentKey,
  gipSunsetInstrumentOfProcess,
} from "@immortalis/contracts";
import { GIP_INSTRUMENT_RULE } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveSunsetExpiry } from "./derive.ts";
import { gipSunsetDeclaration, instrumentSourceKeys } from "./declaration.ts";

/**
 * IM-06 — GIP's one Temporal owner operation (WS-007 §4.1/§4.3/§21.2), exposed to the IM-02 coordinator through the owner-adapter
 * seam: at the earned Temporal boundary of one Instrument's exact `sunset_condition`, GIP's own scoped, deterministic stage
 * commits `lifecycle_status = expired` on that same Instrument slot and changes nothing else. It is not a political actor, a
 * collective decision or a legal adjudication: it interprets only the exact comparable pre-declared sunset instant and the
 * Instrument's current committed `active` lifecycle. Pure and deterministic: identical input, identical writes; nothing is drawn,
 * rolled or defaulted.
 *
 * It resolves only at the boundary the Instrument declared (never at a requested horizon) and otherwise throws
 * StageUnresolvedError: nothing is published, nothing is credited, the dependents wait and the Instrument stays active.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const gipSunsetExpiryProvider: StageProvider = {
  owner: OWNER_GIP,
  facet: FACET_GIP_INSTITUTION_IDENTITY,
  operation: GIP_OPERATION_EXPIRE_AT_SUNSET,
  rule: GIP_INSTRUMENT_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const instrumentId = gipSunsetInstrumentOfProcess(input.stage.causal_process_id);
    if (!instrumentId)
      throw unresolved("SOURCE_INVALID", "a sunset stage names the Instrument it expires");
    const key = gipInstrumentKey(instrumentId);
    const priorFact = input.prior.get(key);
    if (!priorFact)
      throw unresolved("SOURCE_ABSENT", "a sunset stage advances a committed Instrument");
    if (input.produces.length !== 1 || input.produces[0] !== key)
      throw unresolved("SOURCE_INVALID", "a sunset stage writes its own Instrument slot only");
    const instrument = GovernanceInstrumentSchema.safeParse(priorFact.value);
    if (!instrument.success || instrument.data.instrument_id !== instrumentId)
      throw unresolved("SOURCE_INVALID", "the Instrument is malformed or is not the staged one");
    const i = instrument.data;
    const sunset = i.sunset_condition;
    if (!sunset) throw unresolved("SOURCE_INVALID", "the Instrument carries no sunset_condition");
    // the stage is exactly the declaration derived from the Instrument, with its two committed GIP sources read in order
    const declaration = gipSunsetDeclaration(i);
    const keys = instrumentSourceKeys(i);
    if (
      !declaration ||
      !keys ||
      input.reads.length !== 2 ||
      input.reads[0]!.fact.key !== keys.office ||
      input.reads[1]!.fact.key !== keys.binding
    )
      throw unresolved(
        "SOURCE_ABSENT",
        "a sunset stage reads exactly the Instrument's committed source office and Scope Binding",
      );
    // resolved only AT the Instrument's own earned boundary: neither earlier nor at a requested horizon
    if (compareTime(input.span.to, sunset) !== 0)
      throw unresolved("BASIS_MISMATCH", "a sunset resolves at the declared sunset instant only");
    const derived = deriveSunsetExpiry(i);
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    return [
      {
        key,
        value: derived.value as never,
        unit: null,
        // basis/secrecy are inherited from the Instrument it advances; never defaulted
        basis: priorFact.basis,
        secrecy: priorFact.secrecy,
      },
    ];
  },
};
