import { z } from "zod";
import { Id, Version } from "./ids.ts";
import type { StageKey } from "./temporal.ts";
import { CloseBasisSchema, StageKeySchema } from "./temporal.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * Culture & Society — Established Shared Meaning / Norm Result-Close Backbone Foundation — executable contracts
 * (forty-sixth bounded slice).
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WS-005 Culture & Society (frozen F-027 pin 2026-09-26T07:23:03.549Z): the Blue post-ratification closeout composing the
 *     Sovereign-ratified Concept v2 (substantive pin 2026-09-26T06:43:39.156Z), Operational Draft v2 (conformed pin
 *     2026-09-26T07:22:08.130Z) and Scaling Profile v2 (conformed pin 2026-09-26T07:23:21.709Z), with the conformed F-016
 *     and F-017 successor deltas (both pin 2026-09-26T07:20:59.108Z): Draft v2 §1 (minimum-information contract), §2
 *     (admission and deletion), §3 (the sealed Social Update Context, CS-UPD), §4.5 (commit once; a meaning or norm change
 *     declares the Communicative Convention Close), §8 (validation and failure behaviour); Concept v2 §§1-2, 4, 8
 *   RC-02 OwnerFact, RC-03 TemporalRead, RC-04 StageKey
 *
 * Every schema is strict: an unmodelled field is rejected, never carried (IA-02). The ratified minimum-information contract
 * (Draft v2 §1) fixes NO class or enumeration of meanings or norms, so none exists here: the manifestation of a shared
 * meaning or norm is an opaque identifier read from sealed evidence and interpreted by nothing. There is NO field in which a
 * prevalence, percentage, count, score, strength, adoption, belief, motive, loyalty, legality, authority, competence,
 * comprehension, Cohort membership, actor choice or any number could be placed (Concept v2 §8 anti-imports). Nothing here is
 * a game rule or a calibration.
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

/** The sealed Social Update Context of one update (CS-UPD), committed BEFORE its close. */
export const cultureUpdateContextKey = (updateId: string): string =>
  `culture/update/${updateId}/context`;
/** The established shared meaning/norm, committed only at the Communicative Convention Close. */
export const cultureSharedMeaningKey = (updateId: string): string => `culture/meaning/${updateId}`;

/**
 * The IM-02 stage whose commit IS the Communicative Convention Close of one update (RC-04). Its identity is derived from the
 * update identity alone: a requested horizon, an input or source version, a retry, a consumer or a slice is not an identity
 * dimension, so any later transaction that declares the same stage reaches the same committed result.
 */
export const cultureConventionStage = (updateId: string): StageKey => ({
  causal_process_id: `culture-update/${updateId}`,
  owner_operation: {
    owner: OWNER_CULTURE,
    operation: CULTURE_OPERATION_COMMIT_COMMUNICATIVE_CONVENTION_CLOSE,
  },
  prospective_result_id: cultureSharedMeaningKey(updateId),
});

// ---------------------------------------------------------------------------------------------
// The sealed Social Update Context (CS-UPD) — Draft v2 §3.
// ---------------------------------------------------------------------------------------------

/**
 * A reference to an existing, committed canonical fact by its authoritative address and the version the context was sealed
 * against. A referent or scope is bound to existing canonical authority (Draft v2 §8: "an ontology-valid referent … an
 * authoritative … reference rather than copied count") or the context fails closed; nothing is copied from the referenced
 * fact and nothing is created from it.
 */
export const CultureCanonicalRefSchema = z.strictObject({ fact_key: Id, version: Version.min(1) });
export type CultureCanonicalRef = z.infer<typeof CultureCanonicalRefSchema>;

/**
 * The one lawful read basis of one engaged input (Draft v2 §3; F-016/F-017 CS-UPD): "AS-OF-NOW only after its owner commit,
 * or AS-OF-DECLARED-CLOSE with that owner's specifically named close". Exactly one is carried, never both and never a third.
 * The CLOSE member carries the producer's named close verbatim; no producer close of any evidence owner is registered by
 * this slice, so such an input is representable but safe-stops its dependent conclusion (an undeclared basis is
 * CONDITIONAL, F-017 successor delta).
 */
export const CultureInputReadSchema = z.discriminatedUnion("basis", [
  z.strictObject({ basis: z.literal("AS-OF-NOW") }),
  z.strictObject({
    basis: z.literal("AS-OF-DECLARED-CLOSE"),
    close_basis: CloseBasisSchema,
  }),
]);
export type CultureInputRead = z.infer<typeof CultureInputReadSchema>;

/**
 * One causally engaged input of the Social Update Context: the source fact and its owner, pinned at the version sealed, with
 * its one lawful read basis. The fact stays with its owner; only the reference is held here (no copied value, count or roster).
 */
export const CultureInputSchema = z.strictObject({
  owner: Id,
  fact_key: Id,
  version: Version.min(1),
  read: CultureInputReadSchema,
});
export type CultureInput = z.infer<typeof CultureInputSchema>;

/**
 * The deletion-test admission gate (Draft v2 §2) restated as authored literals, exactly as the Class-A / Class-E creation
 * gates of the KTI foundation are: "(a) continuing social recognition/meaning itself has independent causal inertia, (b)
 * another owner's authoritative state cannot reconstruct it faithfully or cheaply, and (c) it may materially alter a later
 * answer". The engine does not compute whether the test is met; it states that the sealed context is presented under it.
 * The evidence, not the literal, is what establishes anything.
 */
export const CultureAdmissionTestSchema = z.strictObject({
  independent_causal_inertia: z.literal(true),
  not_faithfully_reconstructable: z.literal(true),
  may_alter_later_answer: z.literal(true),
});

/**
 * The sealed, causally engaged Social Update Context of ONE update (Draft v2 §3). It names the question — the material
 * `referent`, the `scope` it is socially established for and the `context` (setting) it holds in — and the engaged inputs,
 * each with its one lawful read basis, sealed BEFORE resolution so that no downstream consequence can backfill it.
 *
 * It carries NO meaning, norm or manifestation: those are read from the committed evidence, never asserted by whoever seals the
 * context (an establishment is evidence-based, not a caller assertion that a group adopted a norm). `update_id` is derived from
 * exactly (referent, scope, context) and nothing else, so one slot exists per material referent × scope × context distinction
 * (Scaling Profile v2 §2 cardinality basis) and a retry, a second construction or a conflicting sealing reaches the same,
 * occupied slot. `scope` is a bound canonical reference; the optional Cohort attachment is NOT introduced, and no headcount
 * substitutes for it.
 */
export const CultureUpdateContextSchema = z.strictObject({
  update_id: EntityId,
  admission: CultureAdmissionTestSchema,
  referent: CultureCanonicalRefSchema,
  scope: CultureCanonicalRefSchema,
  context: EntityId,
  inputs: z.array(CultureInputSchema).min(1),
});
export type CultureUpdateContext = z.infer<typeof CultureUpdateContextSchema>;

/**
 * The Culture-defined reading of an evidence fact (CS-UPD): the minimum a committed non-Culture owner fact must state for the
 * Culture owner to read it as evidence that a manifestation is continuing socially recognised for a referent, scope and
 * context. A fact that does not parse as exactly this reading — a contact, a policy, a packet or its refusal, a KTI transfer
 * receipt, a Cohort count — is not evidence of a shared meaning or norm and is refused, never reinterpreted (Draft v2 §2:
 * "Establish no state on mere contact, hypothetical possibility, cultural stereotype, world truth or policy enactment alone").
 *
 * `manifestation` is an opaque identifier: the source fixes no meaning/norm vocabulary and none is invented. The literal
 * `recognition` is the engineer-chosen encoding of the owner's statement that the recognition is CONTINUING and shared; it is
 * not a score, a level or a prevalence. This slice registers NO live producer of such evidence: the only producer is an
 * explicitly test-owned fixture.
 */
export const CultureEvidenceReadingSchema = z.strictObject({
  referent: Id,
  scope: Id,
  context: EntityId,
  manifestation: EntityId,
  recognition: z.literal("CONTINUING_SHARED_RECOGNITION"),
});
export type CultureEvidenceReading = z.infer<typeof CultureEvidenceReadingSchema>;

// ---------------------------------------------------------------------------------------------
// The Culture-owned fact, committed at the Communicative Convention Close — Draft v2 §1, §4.5.
// ---------------------------------------------------------------------------------------------

/**
 * One materially established shared meaning or norm, owned by Culture & Society and committed once at its Communicative
 * Convention Close. It is exactly what its sealed context and the committed evidence it pins determine.
 *
 * It carries only the ratified minimum (Draft v2 §1): the material `referent`, the `scope` and `context`, the `manifestation`
 * (the social meaning or norm itself, opaque), the establishment status — the single literal `ESTABLISHED`, because a later
 * retained status or retirement is never fabricated from the absence of an event — and the cause/version/close provenance:
 * the context it was sealed from, the evidence it rests on (by reference, never copied) and the close it was published at.
 * No uncertainty or contestation field is carried because none is established here (a contested or disagreeing evidence set
 * establishes nothing); no Cohort attachment, prevalence, count, strength or lifecycle transition exists.
 */
export const CultureSharedMeaningSchema = z.strictObject({
  update_id: EntityId,
  status: z.literal("ESTABLISHED"),
  referent: CultureCanonicalRefSchema,
  scope: CultureCanonicalRefSchema,
  context: EntityId,
  manifestation: EntityId,
  establishment: z.strictObject({
    update: z.strictObject({ fact_key: Id, version: Version.min(1) }),
    evidence: z.array(CultureInputSchema).min(1),
  }),
  close: z.strictObject({
    name: z.literal(COMMUNICATIVE_CONVENTION_CLOSE),
    stage: StageKeySchema,
  }),
});
export type CultureSharedMeaning = z.infer<typeof CultureSharedMeaningSchema>;
