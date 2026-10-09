import {
  CJA_CAUSAL_PROCESS_PREFIX,
  CJA_DECISION_BASIS,
  CJA_OPPORTUNITY_ID,
  CJA_SCHEMA_VERSION,
  CJA_SECRECY,
  GM_ADJUDICATION_AUTHORITY,
  OWNER_CULTURE_ADJUDICATION_KERNEL,
  OWNER_POPULATION,
  POPULATION_CLOSE_BASIS,
  cjaDecisionGroupId,
  cjaDecisionId,
  cjaDecisionIntentId,
  type CjaAuthoredJudgment,
  type CjaCitation,
  type CjaContextAttestation,
  type CjaDecisionRecord,
  type CjaDistinction,
  type CjaFindings,
  type CjaRefusalCode,
  type CjaSealedInputRef,
  type CjaTriggerRef,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { CJA1_RULE, resolveKey } from "../owners/registry.ts";
import { cjaDigest } from "./canon.ts";

/**
 * One statement of each CJA1 rule, used by the adapter, IM-11 admission and load verification so the three cannot drift
 * (the same shape as the other owners' `derive.ts`). Pure: no clock, no entropy, no store write, no model call. Nothing here
 * invents a social meaning, a threshold, a score or a number: the only judgment is the adjudicator's, and this module only
 * checks that it is structurally lawful.
 */

/** A structural refusal: a typed CJA1 §11 code and a message. Never a substantive NOT_SUPPORTED / UNRESOLVED verdict. */
export interface CjaViolation {
  readonly code: CjaRefusalCode;
  readonly message: string;
}
const v = (code: CjaRefusalCode, message: string): CjaViolation => ({ code, message });

// ---------------------------------------------------------------------------------------------
// CJA1 §3.2 identity
// ---------------------------------------------------------------------------------------------

/** `causal_process_id := "cjadj:trigger:v1:" + sha256Canonical(trigger_ref)` — from the ONE committed triggering fact. */
export const cjaCausalProcessId = (trigger: CjaTriggerRef): string =>
  CJA_CAUSAL_PROCESS_PREFIX +
  cjaDigest({
    owner: trigger.owner,
    fact_key: trigger.fact_key,
    version: trigger.version,
    committed_by_group_id: trigger.committed_by_group_id,
  });

/** `distinction_digest := sha256Canonical({ referent_key, scope_key, context_id })`. */
export const cjaDistinctionDigest = (d: CjaDistinction): string =>
  cjaDigest({ referent_key: d.referent_key, scope_key: d.scope_key, context_id: d.context_id });

/** `culture_update_id := sha256Canonical({ causal_process_id, opportunity_id, distinction_digest, owner_operation_id })`. */
export const cjaCultureUpdateId = (parts: {
  readonly causal_process_id: string;
  readonly opportunity_id: string;
  readonly distinction_digest: string;
  readonly owner_operation_id: string;
}): string =>
  cjaDigest({
    causal_process_id: parts.causal_process_id,
    opportunity_id: parts.opportunity_id,
    distinction_digest: parts.distinction_digest,
    owner_operation_id: parts.owner_operation_id,
  });

// ---------------------------------------------------------------------------------------------
// Record metadata and group identity
// ---------------------------------------------------------------------------------------------

/** The fixed OwnerFact metadata of an adjudication record: `unit = null`, its exact basis and engine-internal secrecy. */
export function cjaMetadataViolation(meta: {
  readonly unit: string | null;
  readonly basis: string;
  readonly secrecy: string;
}): string | null {
  if (meta.unit !== null) return "an adjudication record has no unit: unit is null";
  if (meta.basis !== CJA_DECISION_BASIS) {
    return `the basis of an adjudication record is exactly "${CJA_DECISION_BASIS}"`;
  }
  if (meta.secrecy !== CJA_SECRECY) {
    return `an adjudication record is engine-internal: secrecy is exactly "${CJA_SECRECY}"`;
  }
  return null;
}

/** The deterministic RC-16 identities and governing rule of the one committing group. Returns a message, or null. */
export function cjaGroupIdentityViolation(
  group: Pick<CommitGroup, "group_id" | "intent_id" | "cause" | "rule">,
  cultureUpdateId: string,
): string | null {
  if (
    group.group_id !== cjaDecisionGroupId(cultureUpdateId) ||
    group.intent_id !== cjaDecisionIntentId(cultureUpdateId)
  ) {
    return "the group and intent identities are the deterministic RC-16 identities of the update";
  }
  if (group.cause !== cjaDecisionId(cultureUpdateId)) {
    return "the cause of an adjudication group is its decision_id";
  }
  if (!canonicalEqual(group.rule, CJA1_RULE)) {
    return "an adjudication group is governed by the F-027-CJA1 SourceRef";
  }
  return null;
}

/** The ordered, de-duplicated groups an adjudication group depends on: the sealed context's, then each source's. */
export const cjaDependsOn = (
  record: Pick<CjaDecisionRecord, "context_ref" | "source_refs">,
): string[] => [
  ...new Set([
    record.context_ref.committed_by_group_id,
    ...record.source_refs.map((s) => s.committed_by_group_id),
  ]),
];

// ---------------------------------------------------------------------------------------------
// Sealed-reference rules
// ---------------------------------------------------------------------------------------------

const ADJUDICATION_PREFIX = "adjudication-culture/";

/** CJA1 §6.2: every sealed input is a distinct, foreign, upstream reference; the trigger is one of them. */
export function cjaSourceViolation(
  record: Pick<CjaDecisionRecord, "source_refs" | "trigger_ref" | "context_ref">,
): CjaViolation | null {
  const keys = new Set<string>();
  for (const s of record.source_refs) {
    if (keys.has(s.fact_key)) {
      return v(
        "CITATION_CLOSURE_VIOLATION",
        "a sealed input is engaged once: a fact is not counted twice",
      );
    }
    keys.add(s.fact_key);
    if (
      s.fact_key === record.context_ref.fact_key ||
      s.owner === record.context_ref.owner ||
      s.owner === OWNER_CULTURE_ADJUDICATION_KERNEL ||
      s.fact_key.startsWith(ADJUDICATION_PREFIX)
    ) {
      return v(
        "CITATION_CLOSURE_VIOLATION",
        "a sealed input is a foreign upstream fact: never the context itself, an adjudication record or the consuming owner's own (downstream) result",
      );
    }
    if (s.read.basis === "AS-OF-DECLARED-CLOSE" && s.read.close_basis.producer.owner !== s.owner) {
      return v(
        "CLOSE_BASIS_INVALID_AT_SEAL",
        "an AS-OF-DECLARED-CLOSE input names its own owner's specifically named close",
      );
    }
  }
  const t = record.trigger_ref;
  const trigger = record.source_refs.find(
    (s) =>
      s.owner === t.owner &&
      s.fact_key === t.fact_key &&
      s.version === t.version &&
      s.committed_by_group_id === t.committed_by_group_id,
  );
  if (!trigger) {
    return v(
      "IDENTITY_INVALID",
      "the triggering fact is one of the sealed context inputs, with the exact version and committing group",
    );
  }
  return null;
}

const sameCitation = (a: CjaCitation, b: CjaCitation): boolean =>
  a.owner === b.owner && a.fact_key === b.fact_key && a.version === b.version;

/** A citation names exactly a sealed input; the same key at another owner/version is a version mismatch, not an input. */
function citationViolation(
  c: CjaCitation,
  sources: readonly CjaSealedInputRef[],
  what: string,
): CjaViolation | null {
  const byKey = sources.find((s) => s.fact_key === c.fact_key);
  if (!byKey) {
    return v(
      "CITATION_CLOSURE_VIOLATION",
      `${what} cites a fact outside the sealed context inputs: ${c.fact_key}`,
    );
  }
  if (!sameCitation(byKey, c)) {
    return v(
      "CITATION_VERSION_MISMATCH",
      `${what} cites an owner/version different from the sealed reference: ${c.fact_key}`,
    );
  }
  return null;
}

/**
 * CJA1 §6.2 EXACT CITATION CLOSURE: every sealed input appears once and only once in `assessment[]` (in the sealed order); every
 * finding citation names a sealed input; and contradictory evidence is accounted for (cited by at least one finding).
 * Any breach is a structural REFUSAL, never a substantive NOT_SUPPORTED.
 */
export function cjaClosureViolation(
  sources: readonly CjaSealedInputRef[],
  assessment: CjaDecisionRecord["assessment"],
  findings: CjaFindings,
): CjaViolation | null {
  if (assessment.length !== sources.length) {
    return v(
      "CITATION_CLOSURE_VIOLATION",
      "assessment[] holds exactly one entry per sealed input: an input is omitted or extra",
    );
  }
  for (const [i, a] of assessment.entries()) {
    const bad = citationViolation(a.ref, sources, "an assessment");
    if (bad) return bad;
    if (!sameCitation(sources[i]!, a.ref)) {
      return v(
        "CITATION_CLOSURE_VIOLATION",
        "assessment[] lists each sealed input once, in the sealed order",
      );
    }
  }
  const cited = new Set<string>();
  for (const name of ["A", "B", "C"] as const) {
    for (const c of findings[name].citations) {
      const bad = citationViolation(c, sources, `finding ${name}`);
      if (bad) return bad;
      cited.add(c.fact_key);
    }
  }
  for (const a of assessment) {
    if (a.classification === "CONTRADICTS" && !cited.has(a.ref.fact_key)) {
      return v(
        "CITATION_CLOSURE_VIOLATION",
        `contradictory evidence must be accounted for by an admission finding: ${a.ref.fact_key}`,
      );
    }
  }
  return null;
}

/**
 * CJA1 §6.3 (C6) coherence between the verdict and the findings:
 *  - ESTABLISH_SUPPORTED: A, B and C all SATISFIED, a candidate_manifestation, a constituency_ref, at least one assessment
 *    SUPPORTS and material_uncertainty NULL;
 *  - DERIVE_WITHOUT_PERSISTENCE: finding B NOT_SATISFIED;
 *  - NOT_SUPPORTED and UNRESOLVED: no further constraint.
 * A record failing this is a structural REFUSAL, never a valid substantive verdict.
 */
export function cjaCoherenceViolation(
  r: Pick<
    CjaDecisionRecord,
    | "verdict"
    | "findings"
    | "assessment"
    | "candidate_manifestation"
    | "constituency_ref"
    | "material_uncertainty"
  >,
): CjaViolation | null {
  const bad = (message: string) => v("JUDGMENT_INCOHERENT", message);
  if (r.verdict === "ESTABLISH_SUPPORTED") {
    if (!(["A", "B", "C"] as const).every((k) => r.findings[k].status === "SATISFIED")) {
      return bad("ESTABLISH_SUPPORTED requires admission findings A, B and C all SATISFIED");
    }
    if (r.candidate_manifestation === null) {
      return bad("ESTABLISH_SUPPORTED requires a candidate_manifestation");
    }
    if (r.constituency_ref === null) {
      return bad("ESTABLISH_SUPPORTED requires a constituency_ref");
    }
    if (!r.assessment.some((a) => a.classification === "SUPPORTS")) {
      return bad("ESTABLISH_SUPPORTED requires at least one assessment that SUPPORTS");
    }
    if (r.material_uncertainty !== null) {
      return bad("ESTABLISH_SUPPORTED requires material_uncertainty NULL");
    }
  } else if (r.verdict === "DERIVE_WITHOUT_PERSISTENCE") {
    if (r.findings.B.status !== "NOT_SATISFIED") {
      return bad("DERIVE_WITHOUT_PERSISTENCE requires admission finding B NOT_SATISFIED");
    }
  }
  return null;
}

/** CJA1 §5.1: a constituency is a Population Cohort bound by identity at the named Population ordinary close. */
export function cjaConstituencyViolation(
  c: CjaDecisionRecord["constituency_ref"],
): CjaViolation | null {
  if (c === null) return null;
  const kind = resolveKey(c.cohort_fact_key)?.kind;
  if (kind?.id !== "population_cohort") {
    return v(
      "CONSTITUENCY_INVALID",
      "a constituency binds to a Population Cohort by identity (an RC-12 Cohort key); nothing else is a first-proof scope",
    );
  }
  if (!canonicalEqual(c.close_basis, POPULATION_CLOSE_BASIS)) {
    return v(
      "CONSTITUENCY_INVALID",
      "the Cohort is read at the named Population ordinary demographic/labor reconciliation close",
    );
  }
  return null;
}

/** The Port A attestation's own identity claims, against the one registered consumer operation. */
export function cjaAttestationIdentityViolation(
  att: CjaContextAttestation,
  consumerOperation: string,
): CjaViolation | null {
  if (att.opportunity_id !== CJA_OPPORTUNITY_ID) {
    return v("IDENTITY_INVALID", "the opportunity is the fixed v1 literal");
  }
  if (att.owner_operation_id !== consumerOperation) {
    return v(
      "IDENTITY_INVALID",
      "the owner operation is the one registered consumer's Communicative Convention Close operation",
    );
  }
  if (att.causal_process_id !== cjaCausalProcessId(att.trigger_ref)) {
    return v(
      "IDENTITY_INVALID",
      "the causal process is derived from the one committed trigger_ref",
    );
  }
  return null;
}

/**
 * The self-consistency of a record, independent of any store: its identities re-derive from its own fields; its Cohort scope
 * is lawful; its sealed references are closed; its judgment is coherent. One statement, used by the adapter, admission and
 * load verification.
 */
export function cjaRecordViolation(r: CjaDecisionRecord): CjaViolation | null {
  const q = r.culture_question;
  if (r.distinction_digest !== cjaDistinctionDigest(q)) {
    return v(
      "IDENTITY_INVALID",
      "distinction_digest is derived from exactly referent, scope and context",
    );
  }
  if (r.causal_process_id !== cjaCausalProcessId(r.trigger_ref)) {
    return v(
      "IDENTITY_INVALID",
      "the causal process is derived from the one committed trigger_ref",
    );
  }
  if (
    r.culture_update_id !==
    cjaCultureUpdateId({
      causal_process_id: r.causal_process_id,
      opportunity_id: r.opportunity_id,
      distinction_digest: r.distinction_digest,
      owner_operation_id: r.owner_operation_id,
    })
  ) {
    return v(
      "IDENTITY_INVALID",
      "culture_update_id is derived from the process, opportunity, distinction and operation",
    );
  }
  if (r.decision_id !== cjaDecisionId(r.culture_update_id)) {
    return v("IDENTITY_INVALID", "decision_id is cjadj:v1:<culture_update_id>");
  }
  if (r.schema_version !== CJA_SCHEMA_VERSION) {
    return v("DECISION_INTEGRITY_FAILURE", "the schema version is 1");
  }
  return (
    cjaConstituencyViolation(r.constituency_ref) ??
    cjaSourceViolation(r) ??
    cjaClosureViolation(r.source_refs, r.assessment, r.findings) ??
    cjaCoherenceViolation(r)
  );
}

/** The adapter-stamped operation precondition recorded on every record. */
export const CJA_ADJUDICATION_CONTEXT = {
  role: GM_ADJUDICATION_AUTHORITY.role,
  permission: GM_ADJUDICATION_AUTHORITY.permission,
  basis: "TRUSTED_IN_PROCESS_PRECONDITION",
} as const;

/** The record a verified attestation and an authored judgment determine — everything not authored is copied, never invented. */
export function buildCjaRecord(
  att: CjaContextAttestation,
  authored: CjaAuthoredJudgment,
): CjaDecisionRecord {
  const distinction_digest = cjaDistinctionDigest(att.distinction);
  const culture_update_id = cjaCultureUpdateId({
    causal_process_id: att.causal_process_id,
    opportunity_id: att.opportunity_id,
    distinction_digest,
    owner_operation_id: att.owner_operation_id,
  });
  return structuredClone({
    schema_version: CJA_SCHEMA_VERSION,
    decision_id: cjaDecisionId(culture_update_id),
    culture_update_id,
    distinction_digest,
    causal_process_id: att.causal_process_id,
    opportunity_id: CJA_OPPORTUNITY_ID,
    owner_operation_id: att.owner_operation_id,
    trigger_ref: att.trigger_ref,
    context_ref: att.context,
    source_refs: att.inputs,
    constituency_ref: att.constituency,
    rule_ref: authored.rule_ref,
    adjudication_context: { ...CJA_ADJUDICATION_CONTEXT },
    assessment: authored.assessment,
    culture_question: { ...att.distinction, consumer_question: att.consumer_question },
    candidate_manifestation: authored.candidate_manifestation,
    findings: authored.findings,
    verdict: authored.verdict,
    material_uncertainty: authored.material_uncertainty,
  }) as CjaDecisionRecord;
}

/** The authored part of a committed record, for comparing a re-presented judgment with the committed one. */
export const cjaAuthoredOf = (r: CjaDecisionRecord): CjaAuthoredJudgment => ({
  culture_update_id: r.culture_update_id,
  rule_ref: r.rule_ref,
  assessment: r.assessment,
  findings: r.findings,
  verdict: r.verdict,
  candidate_manifestation: r.candidate_manifestation,
  material_uncertainty: r.material_uncertainty,
});

// ---------------------------------------------------------------------------------------------
// The sealed context's historical proof (CJA1 §§4.2, 7.2 (iv), 8.2) — judged against committed state, never a live re-read
// ---------------------------------------------------------------------------------------------

/** The read-only history the proofs consult: the journal's exact group by intent and the receipt's revision. */
export interface CjaJournal {
  committedGroup(intentId: string): CommitGroup | null;
  lookupReceipt(intentId: string): { readonly revision: number } | null;
}

/**
 * Verifies, from committed state alone, that a record's references are exactly the sealed context's — WITHOUT re-reading any
 * foreign value:
 *
 *  - the sealed context fact is committed at the cited version by the cited group under the cited owner;
 *  - (with a journal) that context's journaled group READ every cited source at its cited version and DEPENDED on its
 *    committing group — the historical proof that the reference was sealed beforehand; and it precedes the context;
 *  - a cited version is never ahead of the live fact and, where it is still current, was committed by the cited group.
 *    A LATER version of the source is NOT a violation: foreign owner version advances after seal never invalidate a sealed
 *    judgment (CJA1 §§4.2, 7.3).
 *
 * `absent` reports a missing sealed context fact (the dependency is not available), distinct from a mismatch.
 */
export function cjaSealedProofViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
  journal: CjaJournal | null,
  r: Pick<CjaDecisionRecord, "context_ref" | "source_refs" | "constituency_ref">,
): (CjaViolation & { readonly absent?: true }) | null {
  const ctx = facts.get(r.context_ref.fact_key);
  if (!ctx) {
    return { ...v("CONTEXT_MISMATCH", "the sealed context is not committed"), absent: true };
  }
  if (
    ctx.owner !== r.context_ref.owner ||
    ctx.version !== r.context_ref.version ||
    ctx.provenance.group_id !== r.context_ref.committed_by_group_id
  ) {
    return v(
      "CONTEXT_MISMATCH",
      "the sealed context is the committed fact at the cited owner, version and committing group",
    );
  }
  if (ctx.owner === OWNER_CULTURE_ADJUDICATION_KERNEL || ctx.key.startsWith(ADJUDICATION_PREFIX)) {
    return v("CONTEXT_MISMATCH", "the sealed context is not an adjudication record");
  }
  const group = journal?.committedGroup(ctx.provenance.intent_id) ?? null;
  if (journal && !group) {
    return v(
      "HISTORICAL_SOURCE_PROOF_MISSING",
      "the sealed context's committing group is not in the journal",
    );
  }
  const contextRevision = journal?.lookupReceipt(ctx.provenance.intent_id)?.revision ?? 0;
  for (const s of r.source_refs) {
    const live = facts.get(s.fact_key);
    if (!live || live.owner !== s.owner) {
      return v(
        live ? "CITATION_VERSION_MISMATCH" : "HISTORICAL_SOURCE_PROOF_MISSING",
        `a sealed input is not a committed fact of its cited owner: ${s.fact_key}`,
      );
    }
    if (s.version > live.version) {
      return v(
        "CITATION_VERSION_MISMATCH",
        `a sealed input version cannot be ahead of the committed fact: ${s.fact_key}`,
      );
    }
    if (s.version === live.version) {
      if (live.provenance.group_id !== s.committed_by_group_id) {
        return v(
          "CITATION_VERSION_MISMATCH",
          `a sealed input was committed by a different group than cited: ${s.fact_key}`,
        );
      }
      const at = journal?.lookupReceipt(live.provenance.intent_id)?.revision;
      if (journal && (at === undefined || at >= contextRevision)) {
        return v(
          "HISTORICAL_SOURCE_PROOF_MISSING",
          `a sealed input was not committed before the sealed context: ${s.fact_key}`,
        );
      }
    }
    if (group) {
      const read = group.reads.some((x) => x.key === s.fact_key && x.version === s.version);
      const depended = group.depends_on.includes(s.committed_by_group_id);
      if (!read || !depended) {
        return v(
          "HISTORICAL_SOURCE_PROOF_MISSING",
          `the sealed context did not read the cited version and depend on its committing group: ${s.fact_key}`,
        );
      }
    }
  }
  const c = r.constituency_ref;
  if (c) {
    const live = facts.get(c.cohort_fact_key);
    // a Cohort is bound by IDENTITY (CURRENT-ONLY): its seal-time version is attested, never re-read at an older version
    if (live && (c.cohort_version > live.version || live.owner !== OWNER_POPULATION)) {
      return v(
        "CONSTITUENCY_INVALID",
        "the Cohort is a Population-owned fact and its seal-time version is not ahead of the committed fact",
      );
    }
  }
  return null;
}
