import { CjaDecisionRecordSchema, cjaDecisionKey, type CommitGroup } from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { resolveKey } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";
import {
  cjaDependsOn,
  cjaGroupIdentityViolation,
  cjaMetadataViolation,
  cjaRecordViolation,
  cjaSealedProofViolation,
} from "./derive.ts";

/**
 * IM-11 admission for the infrastructure-only `culture_adjudication_kernel / adjudication_provenance` owner (CJA1 §§2, 7, 9.1).
 * Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the adapter. Key-space
 * exclusivity (nobody else can write an `adjudication-culture/…` key, and this owner can write nothing else — in particular
 * no Culture manifestation, Population Cohort, GIP, KTI, ASR, belief, economic or world fact) is enforced by the owner
 * registry before this runs; this enforces that even the adjudication owner changes state in exactly one lawful way,
 * create-only and re-derived:
 *
 *  - ONE RC-09 judgment record per culture_update_id (regardless of outcome): its key, identities and fixed OwnerFact
 *    metadata are the ones §3 derives; its sealed references are closed, its judgment coherent (C6) and its Cohort scope lawful;
 *  - its group READS exactly the sealed context fact at the current version (never live foreign evidence or Cohort versions)
 *    and DEPENDS on exactly the context's committing group and the necessary prior source groups, by identity;
 *  - the sealed context is committed at the cited owner, version and group, and no cited source is ahead of the committed fact.
 *    A LATER foreign version is not a violation: foreign version advances after seal never invalidate a sealed judgment.
 *
 * The role.gm + permission.rule.adjudicate precondition is a TRUSTED IN-PROCESS check of the adapter operation (CJA1 §7.1); the
 * store knows only the archivist publication authority, which the commit core enforces. The journal-backed historical
 * proof of each source is re-verified at load (integrity), because admission is a function of state alone.
 */
export function cultureAdjudicationGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.writes.length === 1 && group.writes[0]!.expected_version === 0) {
    const w = group.writes[0]!;
    if (resolveKey(w.key)?.kind.id === "culture_adjudication_decision") {
      return checkDecision(group, state, w);
    }
  }
  return reject(
    "VALUE_INVALID",
    "adjudication state changes only by one decision record, created once",
  );
}

type Write = CommitGroup["writes"][number];

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

function checkDecision(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = CjaDecisionRecordSchema.safeParse(w.value);
  if (!parsed.success) return bad("the adjudication record violates its contract", { key: w.key });
  const r = parsed.data;
  const metadata = cjaMetadataViolation(w);
  if (metadata) return bad(metadata, { key: w.key });
  if (w.key !== cjaDecisionKey(r.culture_update_id)) {
    return ref("the record is at the key its update identity derives", { key: w.key });
  }
  const identity = cjaGroupIdentityViolation(group, r.culture_update_id);
  if (identity) return ref(identity, { key: w.key });
  const violation = cjaRecordViolation(r);
  if (violation) return bad(violation.message, { key: w.key, cja_code: violation.code });
  // the group reads ONLY the sealed context, at its current version
  const context = state.facts.get(r.context_ref.fact_key);
  if (
    group.reads.length !== 1 ||
    !context ||
    group.reads[0]!.key !== r.context_ref.fact_key ||
    group.reads[0]!.version !== context.version
  ) {
    return ref("the group reads exactly the sealed context at its current version", { key: w.key });
  }
  // ... and depends on exactly the context's group and the necessary prior source groups
  const expected = cjaDependsOn(r);
  if (
    group.depends_on.length !== expected.length ||
    expected.some((g) => !group.depends_on.includes(g))
  ) {
    return ref(
      "the group depends on exactly the sealed context's group and the cited source groups",
      {
        key: w.key,
      },
    );
  }
  const proof = cjaSealedProofViolation(state.facts, null, r);
  if (proof) {
    return proof.absent
      ? reject("PREREQUISITE_MISSING", proof.message, { key: r.context_ref.fact_key })
      : ref(proof.message, { key: w.key, cja_code: proof.code });
  }
  return null;
}
