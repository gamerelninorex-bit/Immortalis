import {
  ACCESS_CLASS_KTI_ENGINE_SIDE,
  AccessiblePacketSchema,
  FACET_KTI_DEVELOPMENT,
  KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE,
  KtiDevelopmentObjectSchema,
  KtiTransferBasisSchema,
  KtiTransferPackageSchema,
  OWNER_KTI,
  ktiTransferPackageKey,
} from "@immortalis/contracts";
import { KTI_RULE } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveTransferPackage } from "./derive.ts";

/**
 * IM-09 — the one KTI owner operation (KTI v2.2 Candidate v0.2 §4.2; F-014D §17), exposed to the IM-02 coordinator through
 * the owner-adapter seam: it publishes one active Transfer Package at the KTI owner's declared result close. Pure and
 * deterministic: identical input, identical writes; nothing is drawn, rolled or defaulted. It reads exactly the committed
 * basis, the sealed packet it rests on and the development object, and invents nothing: no comprehension, competence,
 * reproduction, adoption, adherence, belief or number. It throws StageUnresolvedError (nothing published, nothing credited,
 * dependents wait) when its sources do not lawfully support a package.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const ktiTransferResultCloseProvider: StageProvider = {
  owner: OWNER_KTI,
  facet: FACET_KTI_DEVELOPMENT,
  operation: KTI_OPERATION_PUBLISH_TRANSFER_RESULT_CLOSE,
  rule: KTI_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    if (input.reads.length !== 3)
      throw unresolved(
        "SOURCE_ABSENT",
        "a result close reads exactly its basis, its sealed packet and its development object",
      );
    const basisFact = input.reads[0]!.fact;
    const packetFact = input.reads[1]!.fact;
    const objectFact = input.reads[2]!.fact;
    const basis = KtiTransferBasisSchema.safeParse(basisFact.value);
    if (!basis.success) throw unresolved("SOURCE_INVALID", "the basis violates its contract");
    const packet = AccessiblePacketSchema.safeParse(packetFact.value);
    if (!packet.success) throw unresolved("SOURCE_INVALID", "the packet violates its contract");
    const object = KtiDevelopmentObjectSchema.safeParse(objectFact.value);
    if (!object.success)
      throw unresolved("SOURCE_INVALID", "the development object violates its contract");
    const key = ktiTransferPackageKey(basis.data.package_id);
    if (input.produces.length !== 1 || input.produces[0] !== key)
      throw unresolved("SOURCE_INVALID", "the close does not write its own package slot");
    if (input.prior.has(key))
      throw unresolved("SOURCE_INVALID", "the package is already published at its close");
    const derived = deriveTransferPackage({
      basis: {
        key: basisFact.key,
        owner: basisFact.owner,
        version: basisFact.version,
        value: basis.data,
      },
      packet: {
        key: packetFact.key,
        owner: packetFact.owner,
        version: packetFact.version,
        value: packet.data,
      },
      object: {
        key: objectFact.key,
        owner: objectFact.owner,
        version: objectFact.version,
        value: object.data,
      },
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    KtiTransferPackageSchema.parse(derived.value);
    return [
      {
        key,
        value: derived.value as never,
        unit: null,
        // the package inherits the authored basis label of the programme it publishes; never defaulted. The access class is
        // the owner's: KTI workflow state is engine-side.
        basis: basisFact.basis,
        secrecy: ACCESS_CLASS_KTI_ENGINE_SIDE,
      },
    ];
  },
};
