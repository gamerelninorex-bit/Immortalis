import {
  ACCESS_CLASS_CULTURE_ENGINE_SIDE,
  COMMUNICATIVE_CONVENTION_CLOSE,
  CultureEvidenceReadingSchema,
  OWNER_CULTURE,
  cultureConventionStage,
  cultureUpdateContextKey,
  fail,
  ok,
  type CultureCanonicalRef,
  type CultureInput,
  type CultureSharedMeaning,
  type CultureUpdateContext,
  type OwnerFact,
  type Result,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
import { ALL_FACT_KINDS, resolveKey, type FactKindId } from "../owners/registry.ts";

/**
 * Pure derivations of the Culture established shared meaning / norm path (WS-005 Draft v2 §§1-4, 8; Concept v2 §§1-2, 4, 8;
 * Scaling Profile v2 §§2-4). Each is the single statement of its rule: the owner operation computes with it and IM-11
 * admission and load-time verification re-derive with it, so a committed shared meaning/norm is exactly what its sealed
 * Social Update Context and the committed evidence it pins determine — and nothing else.
 *
 * They invent nothing: no meaning, norm, class of meanings, prevalence, percentage, count, score, strength, adoption, belief,
 * motive, number, default, roll or threshold. The evidence is read for the referent, scope, context and manifestation it
 * states, and nothing is inferred from its mere existence, from contact, from a policy, from a packet or its refusal, from a
 * KTI receipt or from a Cohort count.
 */

/** A committed fact read by identity: its key, the owner that wrote it, the version it was read at and its value. */
export interface CultureFact<T> {
  readonly key: string;
  readonly owner: string;
  readonly version: number;
  readonly value: T;
}

/**
 * The deterministic identity of one update slot: exactly (referent, scope, context) — "admitted material (scope, referent,
 * context) distinctions" (Scaling Profile v2 §2 cardinality basis) — and nothing else. The evidence, the manifestation, the
 * time, the retry and the slice are not identity dimensions, so a second sealing for the same distinction reaches the same,
 * occupied slot instead of overwriting it or creating a sibling.
 */
export const cultureUpdateId = (referentKey: string, scopeKey: string, context: string): string =>
  `culture-update-${sha256Canonical({ referent: referentKey, scope: scopeKey, context })}`;

/**
 * The canonical authorities a referent or scope can be bound to in this slice: a committed World-State locus (a place) or a
 * committed GIP Institution Identity (an institution). Both are items the source itself lists as materially established
 * referents ("good, role, group, practice, institution, place, symbol, channel or other setting-valid object"). Any other
 * kind — and in particular a Population Cohort (the optional Cohort attachment is not introduced; no headcount substitutes
 * for it) — cannot be bound and fails closed (brief §3: "Where a needed scope or referent cannot be bound to existing
 * canonical authority, fail closed").
 */
export const CULTURE_BINDABLE_KIND_IDS: readonly FactKindId[] = [
  "world_locus",
  "gip_institution_identity",
];

/**
 * A referent or scope must be an existing, committed canonical fact of a bindable kind, held by its own registered owner and
 * facet, valid against its own contract. `mode` "SEAL" additionally requires the pinned version to be the current one (the
 * context is sealed against what exists); "HISTORY" accepts a pin at or behind the current version (a load judges history).
 * Returns a message, or null.
 */
export function canonicalBindingViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
  ref: CultureCanonicalRef,
  mode: "SEAL" | "HISTORY",
): string | null {
  const resolved = resolveKey(ref.fact_key);
  const kind = resolved?.kind;
  if (!kind || !CULTURE_BINDABLE_KIND_IDS.includes(kind.id)) {
    return "a referent or scope binds only to a committed canonical World-State locus or GIP Institution Identity: anything else cannot be bound to existing canonical authority";
  }
  const fact = facts.get(ref.fact_key);
  if (!fact) return "the referent or scope is not a committed canonical fact";
  if (fact.owner !== kind.owner || fact.facet !== kind.facet) {
    return "the referent or scope is held by its own registered canonical owner";
  }
  if (!kind.valueSchema.safeParse(fact.value).success) {
    return "the referent or scope violates its own canonical contract";
  }
  if (mode === "SEAL" ? fact.version !== ref.version : fact.version < ref.version) {
    return mode === "SEAL"
      ? "the referent or scope is pinned at its current version"
      : "the referent or scope is not behind the version the context pins";
  }
  return null;
}

/**
 * What one engaged input must be for the context to rest on it, judged without reading its value: a fact of a non-Culture
 * owner (Culture is never its own evidence, and a Culture result is never an input to the update that produces it), outside
 * every Culture key space, carrying exactly one lawful read basis. A declared-close basis would need a registered producer
 * close; none is registered for any evidence owner, so it is CONDITIONAL and stops the dependent conclusion
 * (F-017 successor delta, CS-UPD). Returns a message, or null.
 */
export function inputBasisViolation(input: CultureInput): string | null {
  if (input.owner === OWNER_CULTURE || input.fact_key.startsWith("culture/")) {
    return "the Culture owner is never its own evidence: an input is a non-Culture owner's committed fact";
  }
  if (input.read.basis !== "AS-OF-NOW") {
    return "an AS-OF-DECLARED-CLOSE input needs its owner's registered, specifically named close: none is registered, so the dependent conclusion is CONDITIONAL and stops";
  }
  return null;
}

/**
 * The shared meaning/norm this sealed context and the committed evidence it pins determine, published at the Communicative
 * Convention Close. Fails closed (never degrades to a partial or guessed fact) when the context is not exactly the sealed
 * Culture fact of its own identity, when an input is not exactly the committed fact it pins at its version, when an input
 * has no lawful basis, when a fact does not state — as exactly the Culture-defined reading — a CONTINUING shared recognition
 * for this very referent, scope and context, or when the evidence does not agree on a single manifestation (contestation is
 * not implemented, so a disagreeing set establishes nothing).
 */
export function deriveSharedMeaning(input: {
  readonly context: CultureFact<CultureUpdateContext>;
  readonly evidence: readonly CultureFact<unknown>[];
}): Result<CultureSharedMeaning> {
  const { context, evidence } = input;
  const c = context.value;
  if (context.owner !== OWNER_CULTURE) {
    return fail("CONTEXT_INVALID", "the update context is the Culture owner's own fact");
  }
  if (context.key !== cultureUpdateContextKey(c.update_id)) {
    return fail("CONTEXT_INVALID", "the context is at the key derived from its update identity");
  }
  if (c.update_id !== cultureUpdateId(c.referent.fact_key, c.scope.fact_key, c.context)) {
    return fail(
      "CONTEXT_INVALID",
      "the update identity is derived from exactly its referent, scope and context",
    );
  }
  if (new Set(c.inputs.map((i) => i.fact_key)).size !== c.inputs.length) {
    return fail("CONTEXT_INVALID", "an input is engaged once: a fact is not counted twice");
  }
  if (evidence.length !== c.inputs.length) {
    return fail("EVIDENCE_INVALID", "the evidence is exactly the inputs the context seals");
  }
  const manifestations = new Set<string>();
  for (const [i, inp] of c.inputs.entries()) {
    const fact = evidence[i]!;
    const basis = inputBasisViolation(inp);
    if (basis) return fail("EVIDENCE_BASIS_UNREGISTERED", basis, { key: inp.fact_key });
    if (fact.key !== inp.fact_key || fact.owner !== inp.owner || fact.version !== inp.version) {
      return fail(
        "EVIDENCE_INVALID",
        "an input is the committed fact of its owner at the version the context sealed",
        { key: inp.fact_key },
      );
    }
    const reading = CultureEvidenceReadingSchema.safeParse(fact.value);
    if (!reading.success) {
      return fail(
        "EVIDENCE_NOT_ESTABLISHING",
        "the input does not state a continuing shared recognition: contact, policy, packet or receipt facts are not evidence of a shared meaning or norm",
        { key: inp.fact_key },
      );
    }
    const r = reading.data;
    if (
      r.referent !== c.referent.fact_key ||
      r.scope !== c.scope.fact_key ||
      r.context !== c.context
    ) {
      return fail(
        "EVIDENCE_NOT_ESTABLISHING",
        "the input is evidence for exactly the sealed referent, scope and context",
        { key: inp.fact_key },
      );
    }
    manifestations.add(r.manifestation);
  }
  if (manifestations.size !== 1) {
    return fail(
      "EVIDENCE_DISAGREES",
      "the evidence does not agree on one manifestation: contestation is not implemented, so nothing is established",
    );
  }
  return ok({
    update_id: c.update_id,
    status: "ESTABLISHED",
    referent: { ...c.referent },
    scope: { ...c.scope },
    context: c.context,
    manifestation: [...manifestations][0]!,
    establishment: {
      update: { fact_key: context.key, version: context.version },
      evidence: c.inputs.map((inp) => structuredClone(inp)),
    },
    close: { name: COMMUNICATIVE_CONVENTION_CLOSE, stage: cultureConventionStage(c.update_id) },
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
