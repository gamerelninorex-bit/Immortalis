import {
  ExistenceContractSchema,
  PC_CLARIFICATION_BRANCH,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  PcIntrinsicClarificationSchema,
  REFEREE_OP_I002,
  RefereeDecisionRecordSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  compareTime,
  pcExistenceContractKey,
  pcIntrinsicClarificationKey,
  type ClarifiedClaimRef,
  type OwnerFact,
  type PcIntrinsicClarification,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
import { candidateDigest, clarificationCandidateItems } from "../referee/derive.ts";
import type { ScanFacts } from "./determinations.ts";

/**
 * R-5 (NEWLY AUTHORIZED bounded repair; BLUE handoff v1, Notion pin 2026-10-17T09:28:13.827Z; I-002 §§8, 22–23 frozen, CPAA-C1 v0.3 F-2
 * ratified): the single statement of what a PROSPECTIVE intrinsic clarification must be, judged against committed facts. Used by
 * admission when the fact is written and again by load verification against the facts as they stood before it, so the two cannot drift.
 *
 * It judges identity, authority and provenance only. It never supplies words, a number or a unit: the claims are the player's own,
 * the host's classification of exactly those words is retained and cited, and whether the words state a rate is judged later, and
 * only textually, by the mechanism that cites them.
 */

const MAX_STATEMENT = 500;
const hasControl = (s: string): boolean => {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
};

const parse = <T>(
  facts: ScanFacts,
  key: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): { fact: OwnerFact; value: T } | undefined => {
  const fact = facts.get(key);
  const v = fact ? schema.safeParse(fact.value) : undefined;
  return fact && v?.success ? { fact, value: v.data as T } : undefined;
};

/** The identity of a clarification: derived from the character, the branch and the exact words, so presenting it again reconciles. */
export const pcClarificationIdOf = (pcId: string, statements: readonly string[]): string =>
  `clarification-${sha256Canonical({ pc: pcId, branch: PC_CLARIFICATION_BRANCH, statements }).slice(0, 16)}`;

/** Does the character already have a collection commitment? A clarification is refused while any dependent collection exists. */
export function pcHasCollectionCommitment(pcId: string, facts: ScanFacts): boolean {
  if (!facts.values) return false;
  const prefix = `pc/${pcId}/collection/`;
  for (const f of facts.values())
    if (f.key.startsWith(prefix) && f.key.endsWith("/commitment")) return true;
  return false;
}

/** `null` when the clarification holds against the committed facts, else the first reason it does not. */
export function pcClarificationViolation(
  key: string,
  c: PcIntrinsicClarification,
  facts: ScanFacts,
  verify = false,
): string | null {
  const statements = c.claims.map((x) => x.statement);
  if (
    key !== pcIntrinsicClarificationKey(c.pc_id, c.clarification_id) ||
    c.clarification_id !== pcClarificationIdOf(c.pc_id, statements)
  )
    return "a clarification is at the slot, and has the identity, derived from its character and the exact words";
  for (const s of statements)
    if (s.length > MAX_STATEMENT || hasControl(s))
      return "a clarified statement is the player's own words: bounded text without control characters";
  const contractKey = pcExistenceContractKey(c.pc_id);
  const contract = parse(facts, contractKey, ExistenceContractSchema);
  if (!contract)
    return "the character's own released contract is committed: a clarification follows a released character, it creates none";
  if (c.contract.fact_key !== contractKey || c.contract.version !== contract.fact.version)
    return "the clarification follows the character's own released contract at its committed version";
  const binding = parse(facts, PLAYER_CHARACTER_BINDING_KEY, PlayerCharacterBindingSchema);
  if (!binding || binding.value.active_pc.entity_id !== c.pc_id)
    return "the clarified character is the operative bound player character: another or unbound character cannot be clarified here";
  if (
    c.binding.fact_key !== PLAYER_CHARACTER_BINDING_KEY ||
    c.binding.version !== binding.fact.version
  )
    return "the clarification follows the operative binding at its committed version";
  // the host's retained I-002 classification of EXACTLY these words
  const refereeFact = facts.get(c.referee.fact_key);
  if (!refereeFact || refereeFact.version !== c.referee.version)
    return "the retained referee classification is committed at the version the clarification cites";
  if (!/^referee\/[0-9a-f]{64}\/decision$/.test(refereeFact.key))
    return "the cited record is a retained referee decision";
  const record = RefereeDecisionRecordSchema.safeParse(refereeFact.value);
  if (!record.success || record.data.operation !== REFEREE_OP_I002)
    return "a clarification cites an I-002 classification";
  const r = record.data;
  if (r.verdict !== "CLOSED")
    return "a clarification cites a classification whose derived verdict is CLOSED: every word is accepted as the player's own character";
  if (r.subject.pc_id !== c.pc_id) return "the cited classification is for another character";
  if (r.input.candidate_digest !== candidateDigest(clarificationCandidateItems(statements)))
    return "the cited classification was made over other words than the clarification states";
  // prospective: effective from the canonical time of acceptance, never earlier work
  const state = parse(facts, TEMPORAL_STATE_KEY, TemporalStateSchema);
  if (!state) return "a canonical time is established: a clarification is effective from a time";
  const now = state.value.canonical_time;
  const order = compareTime(c.effective_from, now);
  if (order === null || (verify ? order > 0 : order !== 0))
    return "a clarification is effective from the canonical time at which it was accepted, never from an earlier or later time";
  if (!verify && pcHasCollectionCommitment(c.pc_id, facts))
    return "a clarification is refused while a dependent collection commitment exists: the clarification is prospective and retrofits no act";
  return null;
}

export interface ClarifiedClaim {
  readonly ref: ClarifiedClaimRef;
  readonly statement: string;
}

/**
 * The accepted claims a mechanism (or its attestation) cites among the character's clarifications: each reference names a committed
 * clarification of THIS character at its exact (sealed) version that itself holds, and a claim that exists in it. Returns the claims
 * with their committed wording, or the reason one does not resolve.
 */
export function resolveClarifiedClaims(
  pcId: string,
  refs: readonly ClarifiedClaimRef[] | undefined,
  facts: ScanFacts,
): { ok: true; claims: readonly ClarifiedClaim[] } | { ok: false; message: string } {
  const claims: ClarifiedClaim[] = [];
  for (const ref of refs ?? []) {
    const found = parse(facts, ref.clarification.fact_key, PcIntrinsicClarificationSchema);
    if (!found || found.fact.version !== ref.clarification.version)
      return {
        ok: false,
        message: "a cited clarification is committed at the exact version cited",
      };
    const c = found.value;
    if (
      c.pc_id !== pcId ||
      found.fact.key !== pcIntrinsicClarificationKey(pcId, c.clarification_id)
    )
      return { ok: false, message: "a cited clarification is this character's own" };
    const why = pcClarificationViolation(found.fact.key, c, facts, true);
    if (why) return { ok: false, message: `a cited clarification does not hold: ${why}` };
    const claim = c.claims[ref.index];
    if (!claim)
      return {
        ok: false,
        message: "a cited clarified claim is an accepted claim of the clarification",
      };
    claims.push({ ref, statement: claim.statement });
  }
  return { ok: true, claims };
}
