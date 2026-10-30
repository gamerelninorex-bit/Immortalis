import {
  ExistenceContractSchema,
  PC_CLARIFICATION_BRANCH,
  PC_CLARIFICATION_QUESTION,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  PcDelegatedClarificationSchema,
  PcIntrinsicClarificationSchema,
  REFEREE_OP_I002,
  RefereeDecisionRecordSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  compareTime,
  pcExistenceContractKey,
  pcIntrinsicClarificationKey,
  type ClarifiedClaimRef,
  type I002ClarificationContext,
  type OwnerFact,
  type PcIntrinsicClarification,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
import { canonicalEqual } from "../hash.ts";
import {
  candidateDigest,
  clarificationCandidateItems,
  contextDigest,
  deriveI002,
  i002Context,
  refereeCandidateItems,
  refereeTaskId,
} from "../referee/derive.ts";
import type { ScanFacts } from "./determinations.ts";

/**
 * R-5 (NEWLY AUTHORIZED bounded repair; BLUE handoff v1, Notion pin 2026-10-17T09:28:13.827Z; I-002 §§8, 22–23 frozen, CPAA-C1 v0.3 F-2
 * ratified): the single statement of what a PROSPECTIVE intrinsic clarification must be, judged against committed facts. Used by
 * admission when the fact is written and again by load verification against the facts as they stood before it, so the two cannot drift.
 *
 * It judges identity, authority, provenance and SCOPE. It never supplies words, a number or a unit: the claims are the player's own.
 * The retained interpretation must be of exactly those words WITHIN the scope the owner re-derives from its own facts (BLUE H-1): the
 * released character's accepted baseline, the one precise branch and any prior closure of it. The branch has ONE slot per character,
 * so a second definition cannot enter by structure; the host's reading must be that the branch was still unresolved and that the
 * words state only the duration of the accepted actuator's cycle; a legacy classification (no scope) or one over another baseline
 * does not qualify. Whether the words state a rate is judged later, and only textually, by the mechanism that cites them.
 */

/** Does the quotation state this duration: its exact numeral (as a whole number, not part of another) and its canonical unit? */
export function statesExactDuration(
  quote: string,
  duration: { readonly unit: string; readonly value: number },
): boolean {
  const numeral = new RegExp(`(?<![0-9.])${duration.value}(?![0-9]|\\.[0-9])`);
  return numeral.test(quote) && quote.includes(duration.unit);
}

const MAX_STATEMENT = 500;
export const hasControlCharacters = (s: string): boolean => {
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

/** The identity of the ONE clarification slot of a character's branch: independent of the words, so a second definition cannot enter. */
export const pcClarificationIdOf = (pcId: string): string =>
  `clarification-${sha256Canonical({ pc: pcId, branch: PC_CLARIFICATION_BRANCH }).slice(0, 16)}`;

/** The identity of one presentation of the words (publication identities only; never a fact identity). */
export const pcClarificationWordsDigest = (statements: readonly string[]): string =>
  sha256Canonical({ clarification_words: statements }).slice(0, 16);

/** Does the character already have a collection commitment? A clarification is refused while any dependent collection exists. */
export function pcHasCollectionCommitment(pcId: string, facts: ScanFacts): boolean {
  if (!facts.values) return false;
  const prefix = `pc/${pcId}/collection/`;
  for (const f of facts.values())
    if (f.key.startsWith(prefix) && f.key.endsWith("/commitment")) return true;
  return false;
}

/**
 * The scope a clarification is interpreted within, derived from committed facts only: the character's accepted statements as its
 * released contract holds them, the precise branch and the fixed question, and every OTHER accepted clarification of the character
 * (a closure of this branch). `undefined` when the character has no released contract.
 */
export function pcClarificationScope(
  facts: ScanFacts,
  pcId: string,
  exceptKey?: string,
): I002ClarificationContext | undefined {
  const contract = parse(facts, pcExistenceContractKey(pcId), ExistenceContractSchema);
  if (!contract) return undefined;
  const prior: { clarification_id: string; statements: string[] }[] = [];
  if (facts.values) {
    const prefix = `pc/${pcId}/intrinsic-clarification/`;
    // H1: a Delegation Commit Record closes the very same branch: the character has ONE slot, whichever route filled it
    const delegated = `pc/${pcId}/delegated-clarification/`;
    for (const f of facts.values()) {
      if (f.key === exceptKey) continue;
      if (f.key.startsWith(prefix)) {
        const v = PcIntrinsicClarificationSchema.safeParse(f.value);
        if (v.success)
          prior.push({
            clarification_id: v.data.clarification_id,
            statements: v.data.claims.map((x) => x.statement),
          });
      } else if (f.key.startsWith(delegated)) {
        const v = PcDelegatedClarificationSchema.safeParse(f.value);
        if (v.success)
          prior.push({
            clarification_id: v.data.delegation_id,
            statements: v.data.sealed.claims.map((x) => x.statement),
          });
      }
    }
  }
  return {
    branch: PC_CLARIFICATION_BRANCH,
    question: PC_CLARIFICATION_QUESTION,
    baseline: refereeCandidateItems(contract.value).map((i) => ({ ...i })),
    prior_closures: prior,
  };
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
    c.clarification_id !== pcClarificationIdOf(c.pc_id)
  )
    return "a clarification is at the one slot, and has the identity, derived from its character and the branch";
  for (const s of statements)
    if (s.length > MAX_STATEMENT || hasControlCharacters(s))
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
  // the host's retained I-002 interpretation of EXACTLY these words WITHIN the scope the owner re-derives from its own facts
  const refereeFact = facts.get(c.referee.fact_key);
  if (!refereeFact || refereeFact.version !== c.referee.version)
    return "the retained referee interpretation is committed at the version the clarification cites";
  if (!/^referee\/[0-9a-f]{64}\/decision$/.test(refereeFact.key))
    return "the cited record is a retained referee decision";
  const record = RefereeDecisionRecordSchema.safeParse(refereeFact.value);
  if (!record.success || record.data.operation !== REFEREE_OP_I002)
    return "a clarification cites an I-002 interpretation";
  const r = record.data;
  if (r.subject.pc_id !== c.pc_id) return "the cited interpretation is for another character";
  const items = clarificationCandidateItems(statements);
  if (r.input.candidate_digest !== candidateDigest(items))
    return "the cited interpretation was made over other words than the clarification states";
  const scope = pcClarificationScope(facts, c.pc_id, key);
  if (!scope) return "the character's accepted baseline is committed";
  if (scope.prior_closures.length > 0)
    return "this branch of the character is already closed by an earlier accepted clarification: it is not redefined, amended or superseded here";
  if (!r.input.clarification || !canonicalEqual(r.input.clarification, scope))
    return "the cited interpretation was made within another scope than the character's accepted baseline, this branch and its prior closures: an ordinary classification does not qualify";
  const ctx = i002Context({
    campaign_id: r.campaign_id,
    attempt: r.attempt,
    pc_id: c.pc_id,
    items,
    clarification: scope,
  });
  if (r.input.digest !== contextDigest(ctx) || r.task_id !== refereeTaskId(ctx))
    return "the cited interpretation answers another question than the scoped clarification the owner derives";
  const derived = deriveI002(ctx, r.decision);
  if (!derived.ok || derived.verdict !== "CLOSED" || r.verdict !== "CLOSED")
    return "the cited interpretation must derive CLOSED within the scope: the branch still unresolved, and the words only the duration of the accepted actuator's cycle";
  const state = parse(facts, TEMPORAL_STATE_KEY, TemporalStateSchema);
  if (!state) return "a canonical time is established: a clarification is effective from a time";
  const order = compareTime(c.effective_from, state.value.canonical_time);
  // admission: the clarification is effective from exactly the canonical time now. Load verification cannot read the then-current
  // ADVANCING state, so it enforces only the sanity bound here and the exact acceptance time through `pcClarificationAcceptanceTime`
  if (order === null || (verify ? order > 0 : order !== 0))
    return "a clarification is effective from the canonical time at which it was accepted, never from an earlier or later time";
  if (!verify && pcHasCollectionCommitment(c.pc_id, facts))
    return "a clarification is refused while a dependent collection commitment exists: the clarification is prospective and retrofits no act";
  return null;
}

/** What the Temporal owner's sealed history says about one state version (see `pcClarificationAcceptanceTimeViolation`). */
export interface AcceptanceWitness {
  /** the TEMPORAL_STATE version the record's own commit group read */
  readonly read_version: number;
  /** the journal revision at which the record was committed */
  readonly revision: number;
  /** every committed Temporal transaction: the state version it opened at, the canonical time it read there, and its commit revision */
  readonly transactions: readonly {
    readonly state_version: number;
    readonly basis_time: { unit: string; value: number };
    readonly revision: number;
  }[];
  /** the current state */
  readonly current: { readonly version: number; readonly time: { unit: string; value: number } };
}

/**
 * BLUE H-2: the exact acceptance time, from the Temporal owner's own sealed, commit-ordered history rather than from the record's own
 * claim or the CURRENT clock. The record's commit group read the Temporal state at version `v`; every Temporal transaction that
 * advanced the clock is a sealed fact recording the state version it opened at and the canonical time it read there, so:
 *   - the time AT version v is the basis time of the transaction that opened at v, or, if none did, the current time (v is current);
 *   - the commit order must agree: the transaction that opened at v committed AFTER this record, the one that opened at v−1
 *     (which produced v) BEFORE it — so the read version cannot be shifted to suit a different time.
 * Later consumer reads of a record accepted earlier are unaffected: they never compare against the current clock.
 */
export function pcClarificationAcceptanceTimeViolation(
  c: { readonly effective_from: PcIntrinsicClarification["effective_from"] },
  w: AcceptanceWitness,
): string | null {
  const v = w.read_version;
  if (!Number.isSafeInteger(v) || v < 1 || v > w.current.version)
    return "the clarification read a Temporal state version that exists";
  const opened = w.transactions.find((t) => t.state_version === v);
  const produced = v > 1 ? w.transactions.find((t) => t.state_version === v - 1) : undefined;
  if (opened && opened.revision <= w.revision)
    return "the Temporal transaction that moved the clock on from the version the clarification read was committed after the clarification";
  if (v > 1 && (!produced || produced.revision >= w.revision))
    return "the Temporal transaction that produced the version the clarification read was committed before the clarification";
  const time = opened ? opened.basis_time : v === w.current.version ? w.current.time : undefined;
  if (!time) return "the canonical time at the version the clarification read is witnessed";
  if (!canonicalEqual(time, c.effective_from))
    return "a clarification is effective from exactly the canonical time the Temporal owner's history witnesses at its acceptance: no earlier, later or shifted time";
  return null;
}

export interface ClarifiedClaim {
  readonly ref: ClarifiedClaimRef;
  readonly statement: string;
  /** present only for a claim the player DELEGATED to role.gm (H1); the player's own R-5 words carry none */
  readonly provenance?: "PLAYER-DELEGATED";
}

/**
 * ONE accepted claim of the character's own R-5 (player-authored) clarification at its exact committed version, or the reason it does
 * not resolve. The delegated kind is resolved by `resolveClarifiedClaims` (delegation.ts), which dispatches on the cited key.
 */
export function resolvePlayerClarifiedClaim(
  pcId: string,
  ref: ClarifiedClaimRef,
  facts: ScanFacts,
): { ok: true; claim: ClarifiedClaim } | { ok: false; message: string } {
  const found = parse(facts, ref.clarification.fact_key, PcIntrinsicClarificationSchema);
  if (!found || found.fact.version !== ref.clarification.version)
    return {
      ok: false,
      message: "a cited clarification is committed at the exact version cited",
    };
  const c = found.value;
  if (c.pc_id !== pcId || found.fact.key !== pcIntrinsicClarificationKey(pcId, c.clarification_id))
    return { ok: false, message: "a cited clarification is this character's own" };
  const why = pcClarificationViolation(found.fact.key, c, facts, true);
  if (why) return { ok: false, message: `a cited clarification does not hold: ${why}` };
  const claim = c.claims[ref.index];
  if (!claim)
    return {
      ok: false,
      message: "a cited clarified claim is an accepted claim of the clarification",
    };
  return { ok: true, claim: { ref, statement: claim.statement } };
}
