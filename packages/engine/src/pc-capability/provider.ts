import {
  FACET_PC_CAPABILITY_PROFILE,
  OWNER_PC_EXISTENCE,
  PC_OPERATION_PUBLISH_CAPABILITY_CLOSE,
  PcCapabilityBasisSchema,
  PcCapabilitySchema,
  pcCapabilityKey,
} from "@immortalis/contracts";
import { PC_CAPABILITY_RULE } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { derivePcCapability } from "./derive.ts";

/**
 * IM-07 — the one PC capability owner operation (WS-016 §27.1; F-016 PCC-02), exposed to the IM-02 coordinator through
 * the owner-adapter seam: it publishes one PC capability at the PC Capability Close. Pure and deterministic: identical
 * input, identical writes. It reads exactly one fact — the received basis — and invents nothing: no grade, prior, roll or
 * numeric value. It throws StageUnresolvedError (nothing published, nothing credited, dependents wait) when its one source
 * does not lawfully support a capability.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const pcCapabilityCloseProvider: StageProvider = {
  owner: OWNER_PC_EXISTENCE,
  facet: FACET_PC_CAPABILITY_PROFILE,
  operation: PC_OPERATION_PUBLISH_CAPABILITY_CLOSE,
  rule: PC_CAPABILITY_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    if (input.reads.length !== 1)
      throw unresolved("SOURCE_ABSENT", "a PC capability close reads exactly one received basis");
    const basisFact = input.reads[0]!.fact;
    const basis = PcCapabilityBasisSchema.safeParse(basisFact.value);
    if (!basis.success) throw unresolved("SOURCE_INVALID", "the basis violates its contract");
    const key = pcCapabilityKey(basis.data.pc_id, basis.data.capability_id);
    if (input.produces.length !== 1 || input.produces[0] !== key)
      throw unresolved("SOURCE_INVALID", "the close does not write its own PC/capability slot");
    if (input.prior.has(key))
      throw unresolved("SOURCE_INVALID", "the capability is already published at its close");
    const derived = derivePcCapability({
      key: basisFact.key,
      owner: basisFact.owner,
      version: basisFact.version,
      value: basis.data,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    PcCapabilitySchema.parse(derived.value);
    return [
      {
        key,
        value: derived.value as never,
        unit: null,
        // the capability inherits the labels of the received basis it publishes; never defaulted
        basis: basisFact.basis,
        secrecy: basisFact.secrecy,
      },
    ];
  },
};
