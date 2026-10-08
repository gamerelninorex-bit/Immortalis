import {
  ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  FACET_CULTURE_SOCIAL,
  OWNER_CULTURE,
  cultureSharedMeaningKey,
} from "@immortalis/contracts";
import { CULTURE_RULE } from "../owners/registry.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import { deriveSharedMeaning } from "./derive.ts";

/**
 * IM-09 — the one Culture owner operation (WS-005 Draft v2 §4.5), exposed to the IM-02 coordinator through the owner-adapter
 * seam: it commits one established shared meaning/norm at the Culture owner's declared Communicative Convention Close. Pure
 * and deterministic: identical input, identical writes; nothing is drawn, rolled or defaulted. It reads exactly the committed
 * sealed context and the committed evidence inputs the context pins, in order, and invents nothing: no meaning, norm,
 * prevalence, adoption, belief, motive or number. It throws StageUnresolvedError (nothing committed, nothing credited,
 * dependents wait) when its sources do not lawfully establish a shared meaning/norm — the "unresolved, write nothing" outcome.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const cultureConventionCloseProvider: StageProvider = {
  owner: OWNER_CULTURE,
  facet: FACET_CULTURE_SOCIAL,
  operation: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  rule: CULTURE_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    if (input.reads.length < 2)
      throw unresolved(
        "SOURCE_ABSENT",
        "a Communicative Convention Close reads exactly its sealed context and its engaged evidence",
      );
    const contextFact = input.reads[0]!.fact;
    const context = CultureUpdateContextSchema.safeParse(contextFact.value);
    if (!context.success) throw unresolved("SOURCE_INVALID", "the context violates its contract");
    const key = cultureSharedMeaningKey(context.data.update_id);
    if (input.produces.length !== 1 || input.produces[0] !== key)
      throw unresolved("SOURCE_INVALID", "the close does not write its own meaning slot");
    if (input.prior.has(key))
      throw unresolved("SOURCE_INVALID", "the shared meaning is already committed at its close");
    const derived = deriveSharedMeaning({
      context: {
        key: contextFact.key,
        owner: contextFact.owner,
        version: contextFact.version,
        value: context.data,
      },
      evidence: input.reads.slice(1).map((r) => ({
        key: r.fact.key,
        owner: r.fact.owner,
        version: r.fact.version,
        value: r.fact.value,
      })),
    });
    if (!derived.ok) {
      throw unresolved(
        derived.error.code === "EVIDENCE_BASIS_UNREGISTERED" ? "SOURCE_ABSENT" : "SOURCE_INVALID",
        derived.error.message,
      );
    }
    CultureSharedMeaningSchema.parse(derived.value);
    return [
      {
        key,
        value: derived.value as never,
        unit: null,
        // the fact inherits the authored basis label of the context it commits; never defaulted. The access class is the
        // owner's: a Culture fact is engine-side.
        basis: contextFact.basis,
        secrecy: ACCESS_CLASS_CULTURE_ENGINE_SIDE,
      },
    ];
  },
};
