import {
  ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  COMMUNICATIVE_CONVENTION_CLOSE,
  CJA_OPPORTUNITY_ID,
  CULTURE_SLOT_PREFIX,
  CjaDecisionRecordSchema,
  OWNER_CULTURE,
  OWNER_CULTURE_ADJUDICATION_KERNEL,
  cjaDecisionKey,
  cultureConventionStage,
  cultureUpdateContextKey,
  fail,
  ok,
  type CjaDistinction,
  type CjaSealedInputRef,
  type CultureSharedMeaning,
  type CultureUpdateContext,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { ALL_FACT_KINDS, resolveKey, type FactKindId } from "../owners/registry.ts";
import {
  cjaCausalProcessId,
  cjaConstituencyViolation,
  cjaCultureUpdateId,
  cjaDistinctionDigest,
  cjaRecordViolation,
  cjaSourceViolation,
} from "../culture-adjudication/derive.ts";

/**
 * Pure derivations of the Culture established shared meaning / norm path (WS-005 Draft v2 §§1-4, 8; Concept v2 §§1-2, 4, 8;
 * Scaling Profile v2 §§2-4; merged F-027-CJA1). Each is the single statement of its rule: the owner operation computes with it
 * and IM-11 admission and load-time verification re-derive with it, so a committed shared meaning/norm is exactly what its
 * sealed Social Update Context and its ONE committed ESTABLISH_SUPPORTED adjudication decision determine — and nothing else.
 *
 * They invent nothing: no meaning, norm, class of meanings, prevalence, percentage, count, score, strength, adoption, belief,
 * motive, number, default, roll or threshold. The manifestation is the GM's, copied verbatim from the committed decision; the
 * evidence is never re-read at the close.
 */

/** A committed fact read by identity: its key, owner, version, committing group and value. */
export interface CultureFact<T> {
  readonly key: string;
  readonly owner: string;
  readonly version: number;
  readonly group_id: string;
  readonly value: T;
}

/**
 * The Culture STATE SLOT of one material distinction: exactly (referent, scope, context) — "admitted material (scope,
 * referent, context) distinctions" (Scaling Profile v2 §2 cardinality basis) — and nothing else. The trigger, the evidence,
 * the manifestation, the time, the retry and the slice are not identity dimensions. It is NOT the update identity.
 */
export const cultureSlotId = (d: CjaDistinction): string =>
  `${CULTURE_SLOT_PREFIX}${sha256Canonical({
    referent_key: d.referent_key,
    scope_key: d.scope_key,
    context_id: d.context_id,
  })}`;

/**
 * The canonical authorities a referent or scope can be bound to in this slice: a committed World-State locus (a place) or a
 * committed GIP Institution Identity (an institution). Both are items the source itself lists as materially established
 * referents. Any other kind — and in particular a Population Cohort, which is the separate participating constituency — cannot
 * be bound as a referent or scope and fails closed.
 */
export const CULTURE_BINDABLE_KIND_IDS: readonly FactKindId[] = [
  "world_locus",
  "gip_institution_identity",
];

/**
 * A referent or scope must be an existing, committed canonical fact of a bindable kind, held by its own registered owner and
 * facet, valid against its own contract. Returns a message, or null.
 */
export function canonicalBindingViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
  key: string,
): string | null {
  const kind = resolveKey(key)?.kind;
  if (!kind || !CULTURE_BINDABLE_KIND_IDS.includes(kind.id)) {
    return "a referent or scope binds only to a committed canonical World-State locus or GIP Institution Identity: anything else cannot be bound to existing canonical authority";
  }
  const fact = facts.get(key);
  if (!fact) return "the referent or scope is not a committed canonical fact";
  if (fact.owner !== kind.owner || fact.facet !== kind.facet) {
    return "the referent or scope is held by its own registered canonical owner";
  }
  if (!kind.valueSchema.safeParse(fact.value).success) {
    return "the referent or scope violates its own canonical contract";
  }
  return null;
}

/**
 * What one engaged input must be for the context to rest on it, judged without reading its value: a fact of a non-Culture
 * owner (Culture is never its own evidence, and a Culture result is never an input to the update that produces it), outside
 * every Culture and adjudication key space, carrying exactly one lawful read basis. A declared-close basis would need a
 * registered producer close; none is registered for any evidence owner, so it is CONDITIONAL and stops at SEAL
 * (F-017 successor delta, CS-UPD). Returns a message, or null.
 */
export function inputBasisViolation(input: CjaSealedInputRef): string | null {
  if (
    input.owner === OWNER_CULTURE ||
    input.fact_key.startsWith("culture/") ||
    input.owner === OWNER_CULTURE_ADJUDICATION_KERNEL
  ) {
    return "the Culture owner is never its own evidence: an input is a foreign owner's committed fact";
  }
  if (input.read.basis !== "AS-OF-NOW") {
    return "an AS-OF-DECLARED-CLOSE input needs its owner's registered, specifically named close: none is registered, so the dependent conclusion is CONDITIONAL and stops at seal";
  }
  return null;
}

/** The ordered, de-duplicated keys a context's group pins: referent, scope, each engaged input, then the Cohort. */
export const contextPinnedKeys = (c: CultureUpdateContext): readonly string[] => [
  ...new Set([
    c.distinction.referent_key,
    c.distinction.scope_key,
    ...c.inputs.map((i) => i.fact_key),
    c.constituency.cohort_fact_key,
  ]),
];

/**
 * A sealed context's own consistency, independent of any store: its identities re-derive from its fields; its inputs are
 * distinct foreign upstream references with the one registered basis; its trigger is one of them; its constituency is a
 * well-formed Cohort scope at the named Population close, vouched LIVE. Outcome-neutral: it judges nothing about what the
 * sources establish. Returns a message, or null.
 */
export function cultureContextViolation(c: CultureUpdateContext): string | null {
  if (c.causal_process_id !== cjaCausalProcessId(c.trigger_ref)) {
    return "the causal process is derived from the one committed trigger_ref";
  }
  const derived = cjaCultureUpdateId({
    causal_process_id: c.causal_process_id,
    opportunity_id: CJA_OPPORTUNITY_ID,
    distinction_digest: cjaDistinctionDigest(c.distinction),
    owner_operation_id: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  });
  if (c.update_id !== derived) {
    return "the update identity is derived from the trigger, the fixed opportunity, the distinction and the Communicative Convention Close operation";
  }
  if (c.slot_id !== cultureSlotId(c.distinction)) {
    return "the Culture state slot is derived from exactly the referent, scope and context";
  }
  const sources = cjaSourceViolation({
    source_refs: c.inputs,
    trigger_ref: c.trigger_ref,
    context_ref: {
      owner: OWNER_CULTURE,
      fact_key: cultureUpdateContextKey(c.update_id),
      version: 1,
      committed_by_group_id: "",
    },
  });
  if (sources) return sources.message;
  for (const i of c.inputs) {
    const basis = inputBasisViolation(i);
    if (basis) return basis;
  }
  const scope = cjaConstituencyViolation(c.constituency);
  if (scope) return scope.message;
  if (!c.constituency.close_vouch.live_population_admission) {
    return "a Culture context rests on a LIVE Population close-vouch: a test-owned stand-in vouch is never accepted as a live PCB-01 attestation";
  }
  return null;
}

/**
 * The agreement between a committed adjudication decision and the sealed context it adjudicated: every identity and every
 * sealed reference the decision carries is exactly the context's own, and the decision's context reference is this very
 * context fact at its version and committing group. Returns a message, or null.
 */
export function decisionContextViolation(
  context: CultureFact<CultureUpdateContext>,
  decision: CultureFact<unknown>,
): string | null {
  const c = context.value;
  if (
    decision.owner !== OWNER_CULTURE_ADJUDICATION_KERNEL ||
    decision.key !== cjaDecisionKey(c.update_id)
  ) {
    return "the decision is the adjudication kernel's committed record of exactly this update";
  }
  const parsed = CjaDecisionRecordSchema.safeParse(decision.value);
  if (!parsed.success) return "the decision violates its adjudication record contract";
  const r = parsed.data;
  if (cjaRecordViolation(r) !== null) return "the decision is not a lawful adjudication record";
  const q = r.culture_question;
  const same =
    r.culture_update_id === c.update_id &&
    r.causal_process_id === c.causal_process_id &&
    r.opportunity_id === c.opportunity_id &&
    r.owner_operation_id === c.owner_operation_id &&
    q.referent_key === c.distinction.referent_key &&
    q.scope_key === c.distinction.scope_key &&
    q.context_id === c.distinction.context_id &&
    q.consumer_question === c.consumer_question &&
    canonicalEqual(r.trigger_ref, c.trigger_ref) &&
    canonicalEqual(r.source_refs, c.inputs) &&
    canonicalEqual(r.constituency_ref, c.constituency) &&
    canonicalEqual(r.context_ref, {
      owner: context.owner,
      fact_key: context.key,
      version: context.version,
      committed_by_group_id: context.group_id,
    });
  return same
    ? null
    : "the decision adjudicated exactly this sealed context: its update, trigger, sources, constituency and context reference are the context's own";
}

/**
 * The shared meaning/norm this sealed context and its ONE committed decision determine, published at the Communicative
 * Convention Close. Fails closed (never degrades to a partial or guessed fact) when the context is not exactly the sealed
 * Culture fact of its own identity, when the decision is not the committed adjudication of exactly this context, or when the
 * decision is not ESTABLISH_SUPPORTED: NOT_SUPPORTED, UNRESOLVED and DERIVE_WITHOUT_PERSISTENCE create no Culture fact. The
 * manifestation is the one the immutable judgment authored.
 */
export function deriveSharedMeaning(input: {
  readonly context: CultureFact<CultureUpdateContext>;
  readonly decision: CultureFact<unknown>;
}): Result<CultureSharedMeaning> {
  const { context, decision } = input;
  const c = context.value;
  if (context.owner !== OWNER_CULTURE) {
    return fail("CONTEXT_INVALID", "the update context is the Culture owner's own fact");
  }
  if (context.key !== cultureUpdateContextKey(c.update_id)) {
    return fail("CONTEXT_INVALID", "the context is at the key derived from its update identity");
  }
  const contextViolation = cultureContextViolation(c);
  if (contextViolation) return fail("CONTEXT_INVALID", contextViolation);
  const mismatch = decisionContextViolation(context, decision);
  if (mismatch) return fail("DECISION_INVALID", mismatch);
  const record = CjaDecisionRecordSchema.parse(decision.value);
  if (record.verdict !== "ESTABLISH_SUPPORTED" || record.candidate_manifestation === null) {
    return fail(
      "DECISION_NOT_ESTABLISHING",
      `a ${record.verdict} decision creates no Culture fact: only an ESTABLISH_SUPPORTED judgment fills an empty slot`,
    );
  }
  return ok({
    slot_id: c.slot_id,
    status: "ESTABLISHED",
    referent_key: c.distinction.referent_key,
    scope_key: c.distinction.scope_key,
    context_id: c.distinction.context_id,
    manifestation: record.candidate_manifestation,
    establishment: {
      update_id: c.update_id,
      context: { fact_key: context.key, version: context.version },
      decision: {
        fact_key: decision.key,
        version: decision.version,
        decision_id: record.decision_id,
      },
    },
    close: {
      name: COMMUNICATIVE_CONVENTION_CLOSE,
      stage: cultureConventionStage(c.update_id, c.slot_id),
    },
  });
}

/** Every Culture fact carries exactly the engine-side class; a conformance helper for admission and load verification. */
export const cultureAccessClassViolation = (secrecy: string): string | null =>
  secrecy === ACCESS_CLASS_CULTURE_ENGINE_SIDE
    ? null
    : "a Culture fact is engine-side: it carries the engine-sealed Culture access class";

/** True for a registered fact kind id of the Culture owner (a key-space helper for guards). */
export const isCultureKind = (id: string | undefined): boolean =>
  ALL_FACT_KINDS.some((k) => k.id === id && k.owner === OWNER_CULTURE);
