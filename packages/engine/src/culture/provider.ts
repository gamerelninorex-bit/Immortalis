import {
  ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  FACET_CULTURE_SOCIAL,
  OWNER_CULTURE,
  cjaDecisionKey,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
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
 * and deterministic: identical input, identical writes; nothing is drawn, rolled or defaulted, and NO model is called. It reads
 * EXACTLY two facts, both AS-OF-NOW — the committed sealed context and the committed immutable adjudication decision — and
 * invents nothing: no meaning, norm, prevalence, adoption, belief, motive or number. The manifestation is the one the GM's
 * judgment authored. It throws StageUnresolvedError (nothing committed, nothing credited, dependents wait) when its sources do
 * not lawfully establish a shared meaning/norm: an absent or malformed decision, and every NOT_SUPPORTED, UNRESOLVED or
 * DERIVE_WITHOUT_PERSISTENCE decision, write NO Culture fact.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const cultureConventionCloseProvider: StageProvider = {
  owner: OWNER_CULTURE,
  facet: FACET_CULTURE_SOCIAL,
  operation: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  rule: CULTURE_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    if (input.reads.length !== 2) {
      throw unresolved(
        "SOURCE_ABSENT",
        "a Communicative Convention Close reads exactly its sealed context and its committed adjudication decision",
      );
    }
    const contextFact = input.reads[0]!.fact;
    const decisionFact = input.reads[1]!.fact;
    const context = CultureUpdateContextSchema.safeParse(contextFact.value);
    if (!context.success) throw unresolved("SOURCE_INVALID", "the context violates its contract");
    const c = context.data;
    if (
      contextFact.key !== cultureUpdateContextKey(c.update_id) ||
      decisionFact.key !== cjaDecisionKey(c.update_id)
    ) {
      throw unresolved(
        "SOURCE_INVALID",
        "the close reads the context and decision of its own update",
      );
    }
    const key = cultureSharedMeaningKey(c.slot_id);
    if (input.produces.length !== 1 || input.produces[0] !== key)
      throw unresolved("SOURCE_INVALID", "the close does not write its own meaning slot");
    if (input.prior.has(key))
      throw unresolved(
        "SOURCE_INVALID",
        "the Culture slot is occupied: occupied-slot evolution is deferred and never overwritten",
      );
    const derived = deriveSharedMeaning({
      context: {
        key: contextFact.key,
        owner: contextFact.owner,
        version: contextFact.version,
        group_id: contextFact.provenance.group_id,
        value: c,
      },
      decision: {
        key: decisionFact.key,
        owner: decisionFact.owner,
        version: decisionFact.version,
        group_id: decisionFact.provenance.group_id,
        value: decisionFact.value,
      },
    });
    if (!derived.ok) {
      throw unresolved("SOURCE_INVALID", derived.error.message);
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
