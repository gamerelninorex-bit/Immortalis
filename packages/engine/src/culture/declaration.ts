import {
  BoundaryIndexSchema,
  COMMUNICATIVE_CONVENTION_CLOSE,
  CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  CultureUpdateContextSchema,
  OWNER_CULTURE,
  READ_MODE_CLOSE,
  READ_MODE_NOW,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  compareTime,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  temporalObjectKey,
  type CultureUpdateContext,
  type DependencyDeclaration,
  type TemporalObject,
  type TemporalReadDeclaration,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";

/**
 * Builders and the registration rule for the Culture side of the temporal declaration (RC-10 dependency declarations; WS-005
 * Draft v2 §§3, 4.5, 7; F-017 successor delta CS-UPD and CUL-AF; F-017 §3 CLOSE). A shared meaning/norm is committed only
 * when a dependent consequence materially requires it (a material trigger, never a periodic drift tick), so its one stage is
 * declared INSIDE the engaged object of that consequence, ahead of it: the Culture owner's stage reads its sealed Social
 * Update Context and the engaged evidence inputs it pins — each exactly AS-OF-NOW after its owner commit — and commits the
 * meaning/norm at the Communicative Convention Close; a consequence reads the committed fact only AS-OF-NOW after that close
 * (ECUL-01 / GCUL-01 / CUL-AF) or AS-OF-DECLARED-CLOSE naming it (LC-03), so it can neither resolve before the close nor
 * write back into the sealed context. There is no standalone Culture object, boundary, tick, scheduler or sweep.
 */

const ID = "[A-Za-z0-9][A-Za-z0-9._:-]*";
const KEY_SPACES = {
  context: new RegExp(`^culture/update/(${ID})/context$`),
  meaning: new RegExp(`^culture/meaning/(${ID})$`),
} as const;

/** The update identity a Culture meaning key names, or null. */
export const updateOfMeaningKey = (key: string): string | null => {
  const m = KEY_SPACES.meaning.exec(key);
  return m ? m[1]! : null;
};

const cultureNowRead = (key: string): TemporalReadDeclaration => ({
  mode: READ_MODE_NOW,
  source: { owner: OWNER_CULTURE, fact_key: key },
  invalidators: [{ fact_key: key }],
});

/**
 * The one stage whose commit is the Communicative Convention Close of one update: it reads its sealed context (NOW) and each
 * engaged evidence input the context pins (NOW, after its owner's commit — the only basis this slice registers) in the
 * context's order, and writes the shared meaning/norm. It declares the Communicative Convention Close (F-017 §3 CLOSE).
 * Null when an input carries no registered basis (CONDITIONAL: the dependent conclusion stops, nothing is declared).
 */
export function cultureConventionDeclaration(
  context: CultureUpdateContext,
): DependencyDeclaration | null {
  if (context.inputs.some((i) => i.read.basis !== "AS-OF-NOW")) return null;
  return {
    stage: cultureConventionStage(context.update_id),
    reads: [
      cultureNowRead(cultureUpdateContextKey(context.update_id)),
      ...context.inputs.map((i): TemporalReadDeclaration => ({
        mode: READ_MODE_NOW,
        source: { owner: i.owner, fact_key: i.fact_key },
        invalidators: [],
      })),
    ],
    produces: [cultureSharedMeaningKey(context.update_id)],
    declares_close: { name: COMMUNICATIVE_CONVENTION_CLOSE },
  };
}

/**
 * A downstream consequence's read of the committed shared meaning/norm, AS-OF-NOW after the Communicative Convention Close
 * (ECUL-01, GCUL-01, CUL-AF, ASR-03: "AS-OF-NOW after the applicable Culture close"). It stays a NOW edge in the
 * instantaneous graph; the close that precedes it is stage order, not a third lag. Only the fact is readable: never the
 * sealed context or its evidence.
 */
export const cultureSharedMeaningNowRead = (updateId: string): TemporalReadDeclaration =>
  cultureNowRead(cultureSharedMeaningKey(updateId));

/**
 * The AS-OF-DECLARED-CLOSE form of the same read, naming the Culture owner's declared Communicative Convention Close (LC-03:
 * "AS-OF-DECLARED-CLOSE: Communicative Convention Close").
 */
export function cultureConventionCloseRead(updateId: string): TemporalReadDeclaration {
  const key = cultureSharedMeaningKey(updateId);
  return {
    mode: READ_MODE_CLOSE,
    source: { owner: OWNER_CULTURE, fact_key: key },
    close_basis: {
      name: COMMUNICATIVE_CONVENTION_CLOSE,
      producer: {
        owner: OWNER_CULTURE,
        operation: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
      },
    },
    invalidators: [{ fact_key: key }],
  };
}

/**
 * RC-10 / WS-005 registration rule for every object that touches the Culture key spaces or owner. Applies at registration
 * and at load, so a hand-written object cannot smuggle a different stage, a read of the sealed context, a Culture-owned
 * engagement or a foreign producer of a Culture fact:
 *
 *  - no object is owned by the Culture owner (a result is committed only inside the object of the dependent consequence that
 *    materially requires it: no standalone Culture process, tick or sweep);
 *  - every Culture stage is exactly the declaration derived from a COMMITTED, valid sealed context (so a consequence can
 *    never conjure an update: without a committed context there is nothing to declare);
 *  - the sealed context is read only by that stage; every other read of a Culture fact is the shared meaning/norm, AS-OF-NOW
 *    after the close or AS-OF-DECLARED-CLOSE naming the Communicative Convention Close — never the context, so a consequence
 *    can never see (or backfill) the input assembly of the update it consumes;
 *  - no stage outside the Culture owner declares that it produces a Culture key;
 *  - at registration, a close is declared by exactly one engaged object per instant (an IM-02 rule: a stage is declared by
 *    exactly one engaged object): another consequence due at the same instant reads the fact and declares no second stage.
 */
export function cultureObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered = false,
): string | null {
  if (o.owning_ref.owner === OWNER_CULTURE) {
    return "a Culture result is committed only inside the engaged object of a dependent consequence: there is no standalone Culture object";
  }
  for (const d of o.dependencies) {
    const isCulture = d.stage.owner_operation.owner === OWNER_CULTURE;
    if (!isCulture) {
      if (d.produces.some((k) => k.startsWith("culture/"))) {
        return "only the Culture owner's stage produces a Culture fact";
      }
    } else {
      if (
        d.stage.owner_operation.operation !==
        CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE
      ) {
        return "the Culture owner declares exactly one stage: the Communicative Convention Close";
      }
      const updateId = updateOfMeaningKey(d.stage.prospective_result_id);
      const contextFact = updateId ? state.facts.get(cultureUpdateContextKey(updateId)) : undefined;
      const context = contextFact
        ? CultureUpdateContextSchema.safeParse(contextFact.value)
        : undefined;
      if (!updateId || !contextFact || !context?.success || contextFact.owner !== OWNER_CULTURE) {
        return "a Culture close is declared only for a committed sealed Social Update Context: a consequence cannot create the update it needs";
      }
      const expected = cultureConventionDeclaration(context.data);
      if (!expected || !canonicalEqual(d, expected)) {
        return "a Culture stage is exactly the declaration derived from its sealed Social Update Context";
      }
    }
    if (isCulture) continue;
    for (const r of d.reads) {
      if (r.source.owner !== OWNER_CULTURE && !r.source.fact_key.startsWith("culture/")) continue;
      if (r.source.owner !== OWNER_CULTURE)
        return "a Culture key space is read as its owner's fact";
      const id = updateOfMeaningKey(r.source.fact_key);
      if (!id || KEY_SPACES.context.test(r.source.fact_key)) {
        return "the sealed Social Update Context is not a cross-owner read: a shared meaning/norm is visible only after the Communicative Convention Close";
      }
      if (
        !canonicalEqual(r, cultureSharedMeaningNowRead(id)) &&
        !canonicalEqual(r, cultureConventionCloseRead(id))
      ) {
        return "a Culture shared meaning/norm is read only AS-OF-NOW after the Communicative Convention Close or AS-OF-DECLARED-CLOSE naming it";
      }
    }
  }
  return registered ? duplicateCloseViolation(o, state) : null;
}

/** Another engaged object due at the same instant that already declares one of this object's Culture closes. */
function duplicateCloseViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
): string | null {
  if (!o.next_boundary) return null;
  const mine = o.dependencies.filter((d) => d.stage.owner_operation.owner === OWNER_CULTURE);
  if (mine.length === 0) return null;
  const indexFact = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  const index = indexFact ? BoundaryIndexSchema.safeParse(indexFact.value) : undefined;
  if (!index?.success) return null;
  for (const entry of index.data.entries) {
    if (entry.object_id === o.object_id || compareTime(entry.at, o.next_boundary.at) !== 0)
      continue;
    const other = state.facts.get(temporalObjectKey(entry.object_id));
    const parsed = other ? TemporalObjectSchema.safeParse(other.value) : undefined;
    if (
      parsed?.success &&
      parsed.data.dependencies.some((d) => mine.some((m) => canonicalEqual(m.stage, d.stage)))
    ) {
      return "a Culture close is declared by exactly one engaged object per instant: another consequence due at that instant already declares it, so this one reads the fact without declaring a second stage";
    }
  }
  return null;
}
