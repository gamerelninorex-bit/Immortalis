import { z } from "zod";
import { Id, Sha256, Version } from "./ids.ts";
import {
  CJA_OPPORTUNITY_ID,
  CjaConstituencyRefSchema,
  CjaContextAttestationSchema,
} from "./culture-adjudication.ts";
import type { StageKey } from "./temporal.ts";
import { StageKeySchema } from "./temporal.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * Culture & Society — Established Shared Meaning / Norm Result-Close Backbone — executable contracts (forty-sixth bounded
 * slice, amended same-PR recovery).
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-005 Culture & Society (frozen F-027 pin 2026-09-26T07:23:03.549Z): the Blue post-ratification closeout composing the
 *     Sovereign-ratified Concept v2 (substantive pin 2026-09-26T06:43:39.156Z), Operational Draft v2 (conformed pin
 *     2026-09-26T07:22:08.130Z) and Scaling Profile v2 (conformed pin 2026-09-26T07:23:21.709Z), with the conformed F-016
 *     and F-017 successor deltas (both pin 2026-09-26T07:20:59.108Z): Draft v2 §1 (minimum-information contract), §2
 *     (admission and deletion), §3 (the sealed Social Update Context, CS-UPD), §4.5 (commit once; a meaning or norm change
 *     declares the Communicative Convention Close), §8 (validation and failure behaviour); Concept v2 §§1-2, 4, 8
 *   RC-02 OwnerFact, RC-03 TemporalRead, RC-04 StageKey
 *   the merged F-027-CJA1 adjudication record (`./culture-adjudication.ts`): Sovereign-approved, NOT native-pinned and NOT
 *     spec-locked; its identifiers are provisional technical literals, never frozen Culture source-defined identifiers
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). The ratified minimum-information contract
 * (Draft v2 §1) fixes NO class or enumeration of meanings or norms: the manifestation of a shared meaning or norm is an opaque
 * identifier AUTHORED BY THE GM'S IMMUTABLE ADJUDICATION and interpreted by nothing. The sealed context is OUTCOME-NEUTRAL: it
 * names the question, the engaged sources and their provenance, and the participating Cohort scope — it carries no verdict, no
 * manifestation, no "recognition" conclusion and no admission flag. There is NO field in which a prevalence, percentage, count,
 * score, strength, adoption, belief, motive, loyalty, legality, authority, competence, comprehension, headcount, roster, actor
 * choice or any number could be placed (Concept v2 §8 anti-imports). Nothing here is a game rule or a calibration.
 */

// ---------------------------------------------------------------------------------------------
// Owner / facet, key spaces, secrecy class (IM-09). Technical encodings; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/** WS-005 / the lawful Culture & Society owner (IM-09). One owner, one facet. */
export const OWNER_CULTURE = "culture";
export const FACET_CULTURE_SOCIAL = "culture_social";

export const CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE =
  "culture-commit-communicative-convention-close";
/**
 * The Close Basis name the Culture owner declares for a meaning/norm change: "AS-OF-DECLARED-CLOSE: Communicative Convention
 * Close" (Draft v2 §4.5, §6; F-017 successor delta LC-03). Technical encoding of the source's name. A relation or aggregate
 * position change would declare the Social Relation Close instead; that close is NOT implemented here.
 */
export const COMMUNICATIVE_CONVENTION_CLOSE = "communicative-convention-close";

/**
 * The access/secrecy class (RC-02) the Culture owner stamps on every Culture fact. The source defines no actor-accessible
 * surface for a committed social fact (CUL-AF requires awareness to be established through the actor's own knowledge state
 * and Epistemic Access, never Cohort membership), so a Culture fact is engine-side and admission and load verification
 * require exactly this label.
 */
export const ACCESS_CLASS_CULTURE_ENGINE_SIDE = "culture.engine-sealed";

/**
 * The sealed Social Update Context of one UPDATE, committed BEFORE its adjudication and its close. It is keyed by the CJA1
 * `culture_update_id`: an update is one independently committed trigger × the fixed opportunity × one material distinction ×
 * this owner's close operation. A true distinct trigger is a distinct update.
 */
export const cultureUpdateContextKey = (updateId: string): string =>
  `culture/update/${updateId}/context`;
/**
 * The established shared meaning/norm, committed only at the Communicative Convention Close, keyed by the Culture STATE SLOT:
 * exactly one slot per material referent × scope × context distinction (Scaling Profile v2 §2 cardinality basis). The slot is
 * NOT the update: a later distinct update for an OCCUPIED slot may never overwrite it (occupied-slot evolution is deferred).
 */
export const cultureSharedMeaningKey = (slotId: string): string => `culture/meaning/${slotId}`;
export const CULTURE_SLOT_PREFIX = "culture-slot-";

/** The RC-16 identities of the one context-sealing group of an update: deterministic from the update identity alone. */
export const cultureContextGroupId = (updateId: string): string =>
  `culture:context:group:v1:${updateId}`;
export const cultureContextIntentId = (updateId: string): string =>
  `culture:context:intent:v1:${updateId}`;
export const cultureContextCause = (updateId: string): string => `culture:context:v1:${updateId}`;

/**
 * The IM-02 stage whose commit IS the Communicative Convention Close of one update (RC-04). Its identity is derived from the
 * update identity and the state slot alone: a requested horizon, an input or source version, a retry, a consumer or a slice
 * is not an identity dimension, so any later transaction that declares the same stage reaches the same committed result.
 */
export const cultureConventionStage = (updateId: string, slotId: string): StageKey => ({
  causal_process_id: `culture-update/${updateId}`,
  owner_operation: {
    owner: OWNER_CULTURE,
    operation: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  },
  prospective_result_id: cultureSharedMeaningKey(slotId),
});

// ---------------------------------------------------------------------------------------------
// The sealed Social Update Context (CS-UPD) — Draft v2 §3; F-027-CJA1 §§3-5, 9.1.
// ---------------------------------------------------------------------------------------------

/**
 * The sealed, causally engaged, OUTCOME-NEUTRAL Social Update Context of ONE update (Draft v2 §3). It is exactly the
 * information the F-027-CJA1 context attestation (PORT A) must supply, held in Culture's own fact:
 *
 *  - the material distinction (referent × scope × context) and the question the later consumer needs answered;
 *  - the ONE earlier, independently COMMITTED foreign trigger fact/group, and the engaged source observations — each an
 *    immutable REFERENCE (owner, key, version, committing group, one lawful read basis), never a copied value, count or roster;
 *  - ONE RC-12 Population Cohort as the participating social-scope anchor, bound by IDENTITY at the named Population ordinary
 *    close, with the live close-vouch obtained AT SEAL — its CURRENT-ONLY value is never copied or re-read.
 *
 * Context admission does not and cannot judge whether the sources establish a cultural outcome: negative, contradictory and
 * not-probative sources are admissible. `update_id` is the CJA1 `culture_update_id` re-derived from the trigger, the fixed
 * opportunity, the distinction and this owner's close operation; `slot_id` is the Culture state slot of the distinction alone.
 */
export const CultureUpdateContextSchema = CjaContextAttestationSchema.omit({
  context: true,
  constituency: true,
  opportunity_id: true,
  owner_operation_id: true,
}).extend({
  update_id: Sha256,
  slot_id: EntityId,
  opportunity_id: z.literal(CJA_OPPORTUNITY_ID),
  owner_operation_id: z.literal(CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE),
  constituency: CjaConstituencyRefSchema,
});
export type CultureUpdateContext = z.infer<typeof CultureUpdateContextSchema>;

/**
 * What a caller supplies to SEAL a context: keys and read bases only. Every version, committing group, identity and the
 * constituency vouch is derived by the Culture owner from committed state and the Population port, never supplied.
 */
export const CultureSealRequestSchema = z.strictObject({
  referent_key: Id,
  scope_key: Id,
  context_id: EntityId,
  /** the engaged source facts, in order; the trigger is one of them */
  inputs: z
    .array(
      z.strictObject({
        fact_key: Id,
        read: z.discriminatedUnion("basis", [
          z.strictObject({ basis: z.literal("AS-OF-NOW") }),
          z.strictObject({ basis: z.literal("AS-OF-DECLARED-CLOSE"), close_name: Id }),
        ]),
      }),
    )
    .min(1),
  trigger_fact_key: Id,
  /** the ONE RC-12 Cohort scope */
  cohort_fact_key: Id,
  consumer_question: z.string().min(1),
});
export type CultureSealRequest = z.infer<typeof CultureSealRequestSchema>;

// ---------------------------------------------------------------------------------------------
// The Culture-owned fact, committed at the Communicative Convention Close — Draft v2 §1, §4.5.
// ---------------------------------------------------------------------------------------------

/**
 * One materially established shared meaning or norm, owned by Culture & Society and committed once at its Communicative
 * Convention Close. It is exactly what its sealed context and its ONE committed ESTABLISH_SUPPORTED adjudication decision
 * determine — and nothing else.
 *
 * It carries only the ratified minimum (Draft v2 §1): the material `referent`, `scope` and `context`, the `manifestation` (the
 * social meaning or norm itself, opaque and authored by the immutable judgment), the establishment status — the single literal
 * `ESTABLISHED` — and the cause/version/close provenance: the update and context it was sealed from, the decision it rests on
 * (by reference, never copied) and the close it was published at. No uncertainty or contestation field, no Cohort value,
 * headcount, prevalence, strength or lifecycle transition exists.
 */
export const CultureSharedMeaningSchema = z.strictObject({
  slot_id: EntityId,
  status: z.literal("ESTABLISHED"),
  referent_key: Id,
  scope_key: Id,
  context_id: EntityId,
  manifestation: EntityId,
  establishment: z.strictObject({
    update_id: Sha256,
    context: z.strictObject({ fact_key: Id, version: Version.min(1) }),
    decision: z.strictObject({
      fact_key: Id,
      version: Version.min(1),
      decision_id: Id,
    }),
  }),
  close: z.strictObject({
    name: z.literal(COMMUNICATIVE_CONVENTION_CLOSE),
    stage: StageKeySchema,
  }),
});
export type CultureSharedMeaning = z.infer<typeof CultureSharedMeaningSchema>;
