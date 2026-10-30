import {
  BUILD_SPEC_IDENTITY,
  ExistenceContractSchema,
  PC_CLARIFICATION_BRANCH,
  PC_DELEGATION_METHOD_CLASS,
  PC_DELEGATION_METHOD_VERSION,
  PC_DELEGATION_QUESTION,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  PcDelegatedClarificationSchema,
  PcDelegatedSelectionAnswerSchema,
  PcDelegatedSelectionTaskSchema,
  PcDelegationScopeSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  compareTime,
  fail,
  ok,
  pcDelegatedClarificationKey,
  pcExistenceContractKey,
  type CanonicalTime,
  type ClarifiedClaimRef,
  type OwnerFact,
  type PcDelegatedClarification,
  type PcDelegatedSelectionTask,
  type PcDelegationScope,
  type Result,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
import {
  hasControlCharacters,
  pcClarificationScope,
  pcHasCollectionCommitment,
  resolvePlayerClarifiedClaim,
  statesExactDuration,
  type ClarifiedClaim,
} from "./clarification.ts";
import type { ScanFacts } from "./determinations.ts";

/**
 * H1 (BLUE same-PR repair authorization; I-002 §9 Delegation / Hidden-Seed Adapter; CPAA-C1 v0.3 F-2 "lawfully player-authored or
 * delegated"): the single statement of what a DELEGATED selection of the one-unit serial handling cycle must be. The player commits a
 * bounded scope (their own words, a unit, a shortest and a longest whole number); `role.gm` selects inside it; the owner re-derives
 * every check from committed facts and from the sealed content itself, at admission and again at every load.
 *
 * It never supplies the selection: the number and the wording are the host's, validated, never invented here. A record claims no
 * validation it has not earned, carries no player-authored provenance, shares the ONE slot of the branch with the R-5 clarification,
 * and is refused once any dependent collection commitment exists (I-002 §9: a delegation first offered after hand-off is lawful only
 * when no consequence depending on it is pending).
 */

const MIN_QUOTE_LENGTH = 8;
const MAX_STATEMENT = 300;
const MAX_CONSTRAINT_WORDS = 500;
const NUMERALS = /[0-9]+(?:\.[0-9]+)?/g;

/** The identity of the ONE delegated slot of a character's branch: independent of the selection, so a second one cannot enter. */
export const pcDelegationIdOf = (pcId: string): string =>
  `delegation-${sha256Canonical({ pc: pcId, branch: PC_CLARIFICATION_BRANCH, route: "delegated" }).slice(0, 16)}`;

/** The accepted baseline the host was delivered, by digest: the generation basis the record names. */
export const pcDelegationBaselineDigest = (
  baseline: PcDelegatedSelectionTask["baseline"],
): string => sha256Canonical({ delegation_baseline: baseline });

/** The content seal: binds the selected content to the character, the committed scope and the task it answered. */
export function pcDelegationSeal(d: {
  readonly pc_id: string;
  readonly scope: PcDelegationScope;
  readonly generation_basis: PcDelegatedClarification["generation_basis"];
  readonly sealed: Omit<PcDelegatedClarification["sealed"], "seal">;
}): string {
  return sha256Canonical({
    delegation_seal: {
      pc_id: d.pc_id,
      scope: d.scope,
      generation_basis: d.generation_basis,
      claims: d.sealed.claims,
      duration: d.sealed.duration,
      reading: d.sealed.reading,
    },
  });
}

const parse = <T>(
  facts: ScanFacts,
  key: string,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): { fact: OwnerFact; value: T } | undefined => {
  const fact = facts.get(key);
  const v = fact ? schema.safeParse(fact.value) : undefined;
  return fact && v?.success ? { fact, value: v.data as T } : undefined;
};

/** The delegated records a character holds (normally zero or one), by key shape. Empty when the view cannot enumerate. */
export function pcDelegatedRecords(
  pcId: string,
  facts: ScanFacts,
): readonly { fact: OwnerFact; value: PcDelegatedClarification }[] {
  if (!facts.values) return [];
  const prefix = `pc/${pcId}/delegated-clarification/`;
  const found: { fact: OwnerFact; value: PcDelegatedClarification }[] = [];
  for (const f of facts.values()) {
    if (!f.key.startsWith(prefix)) continue;
    const v = PcDelegatedClarificationSchema.safeParse(f.value);
    if (v.success) found.push({ fact: f, value: v.data });
  }
  return found;
}

/**
 * The bounded task `role.gm` answers, built from committed facts only (the accepted baseline, any earlier closure of the branch) and
 * the scope the player committed. `PREREQUISITE_MISSING` without a released contract, so nothing is invented for a character that
 * has none.
 */
export function buildDelegatedSelectionTask(
  facts: ScanFacts,
  pcId: string,
  scope: unknown,
  exceptKey?: string,
): Result<PcDelegatedSelectionTask, "PREREQUISITE_MISSING"> {
  const s = PcDelegationScopeSchema.safeParse(scope);
  if (!s.success)
    return fail("PREREQUISITE_MISSING", "the delegation scope is not a well-formed bounded scope");
  const clarification = pcClarificationScope(facts, pcId, exceptKey);
  if (!clarification)
    return fail(
      "PREREQUISITE_MISSING",
      "the character's released contract is committed: a delegation follows a released character, it creates none",
    );
  const body = {
    pc_id: pcId,
    branch: PC_CLARIFICATION_BRANCH,
    question: PC_DELEGATION_QUESTION,
    scope: s.data,
    method: { class: PC_DELEGATION_METHOD_CLASS, version: PC_DELEGATION_METHOD_VERSION },
    baseline: clarification.baseline.map((i) => ({
      item_id: i.item_id,
      slot: i.slot,
      text: i.text,
    })),
    prior_closures: clarification.prior_closures,
  };
  return ok(PcDelegatedSelectionTaskSchema.parse({ ...body, digest: sha256Canonical(body) }));
}

/** What a validated host answer means. A refusal is genuine and writes nothing; only SELECTED can be committed. */
export type DelegatedSelectionReading =
  | {
      readonly kind: "SELECTED";
      readonly duration: CanonicalTime;
      readonly statement: string;
      readonly baseline_ground: string;
      readonly statement_ground: string;
    }
  | { readonly kind: "ALREADY_STATED" | "CLOSED" | "OUT_OF_SCOPE" };

const boundedStatement = (s: string): boolean =>
  s.length <= MAX_STATEMENT && !hasControlCharacters(s);

/**
 * Validates the host's UNTRUSTED selection against the task it was delivered. A genuine negative (the branch is stated in the
 * baseline, closed, or the request leaves the duration of the accepted actuator's cycle) is returned as a refusal and selects nothing;
 * a selection is accepted only when the number lies inside the committed candidate space in the campaign's unit, the statement states
 * exactly that number and unit and no other number, and every ground is a verbatim quotation. Anything else is `ANSWER_INVALID`.
 */
export function interpretDelegatedSelection(
  task: PcDelegatedSelectionTask,
  answer: unknown,
): Result<DelegatedSelectionReading, "ANSWER_INVALID"> {
  const a = PcDelegatedSelectionAnswerSchema.safeParse(answer);
  if (!a.success)
    return fail("ANSWER_INVALID", "the selection is not a well-formed delegated selection");
  if (a.data.task_digest !== task.digest)
    return fail("ANSWER_INVALID", "the selection answers a different task");
  if (
    a.data.branch !== "UNRESOLVED_BEFORE" ||
    a.data.scope !== "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE"
  ) {
    if (a.data.selection !== null || a.data.baseline_ground !== null)
      return fail("ANSWER_INVALID", "a reading that settles nothing carries no selection");
    return ok({
      kind:
        a.data.branch === "ALREADY_STATED_IN_BASELINE"
          ? "ALREADY_STATED"
          : a.data.branch === "CONTRADICTS_PRIOR_CLOSURE"
            ? "CLOSED"
            : "OUT_OF_SCOPE",
    });
  }
  const sel = a.data.selection;
  if (sel === null)
    return fail("ANSWER_INVALID", "a reading that the branch is unresolved carries the selection");
  const space = task.scope.candidate_space;
  if (sel.value < space.shortest || sel.value > space.longest)
    return fail("ANSWER_INVALID", "the selected number lies inside the committed candidate space");
  const duration: CanonicalTime = { unit: space.unit, value: sel.value };
  if (!boundedStatement(sel.statement))
    return fail("ANSWER_INVALID", "the statement is bounded text without control characters");
  if (!statesExactDuration(sel.statement, duration))
    return fail(
      "ANSWER_INVALID",
      "the statement states exactly the selected number and the canonical unit",
    );
  if ((sel.statement.match(NUMERALS) ?? []).some((n) => n !== String(sel.value)))
    return fail("ANSWER_INVALID", "the statement states no number other than the selected one");
  if (
    sel.statement_ground.length < MIN_QUOTE_LENGTH ||
    !sel.statement.includes(sel.statement_ground) ||
    !statesExactDuration(sel.statement_ground, duration)
  )
    return fail(
      "ANSWER_INVALID",
      "the statement ground is a verbatim part of the statement that states the duration",
    );
  const ground = a.data.baseline_ground;
  if (
    ground === null ||
    ground.length < MIN_QUOTE_LENGTH ||
    !task.baseline.some((i) => i.text.includes(ground))
  )
    return fail(
      "ANSWER_INVALID",
      "the baseline ground is a verbatim quotation of the accepted baseline",
    );
  return ok({
    kind: "SELECTED",
    duration,
    statement: sel.statement,
    baseline_ground: ground,
    statement_ground: sel.statement_ground,
  });
}

/** `null` when the delegated record holds against the committed facts, else the first reason it does not. */
export function pcDelegationViolation(
  key: string,
  d: PcDelegatedClarification,
  facts: ScanFacts,
  verify = false,
): string | null {
  if (
    key !== pcDelegatedClarificationKey(d.pc_id, d.delegation_id) ||
    d.delegation_id !== pcDelegationIdOf(d.pc_id)
  )
    return "a delegation is at the one slot, and has the identity, derived from its character and the branch";
  const claim = d.sealed.claims[0]!;
  if (!boundedStatement(claim.statement))
    return "the sealed statement is bounded text without control characters";
  if (
    d.scope.constraint_words !== null &&
    (d.scope.constraint_words.length > MAX_CONSTRAINT_WORDS ||
      hasControlCharacters(d.scope.constraint_words))
  )
    return "the player's constraint words are bounded text without control characters";
  const contractKey = pcExistenceContractKey(d.pc_id);
  const contract = parse(facts, contractKey, ExistenceContractSchema);
  if (!contract)
    return "the character's own released contract is committed: a delegation follows a released character, it creates none";
  if (d.contract.fact_key !== contractKey || d.contract.version !== contract.fact.version)
    return "the delegation follows the character's own released contract at its committed version";
  const binding = parse(facts, PLAYER_CHARACTER_BINDING_KEY, PlayerCharacterBindingSchema);
  if (!binding || binding.value.active_pc.entity_id !== d.pc_id)
    return "the delegated character is the operative bound player character: another or unbound character cannot be delegated here";
  if (
    d.binding.fact_key !== PLAYER_CHARACTER_BINDING_KEY ||
    d.binding.version !== binding.fact.version
  )
    return "the delegation follows the operative binding at its committed version";
  const state = parse(facts, TEMPORAL_STATE_KEY, TemporalStateSchema);
  if (!state) return "a canonical time is established: a delegation is effective from a time";
  if (d.scope.candidate_space.unit !== state.value.canonical_time.unit)
    return "the candidate space is in the campaign's canonical unit of time";
  // the owner re-derives the task the host was delivered from its own facts: the baseline, the branch and every closure of it
  const task = buildDelegatedSelectionTask(facts, d.pc_id, d.scope, key);
  if (!task.ok) return task.error.message;
  if (task.value.prior_closures.length > 0)
    return "this branch of the character is already closed by an earlier accepted clarification or delegation: it is not redefined, amended or superseded here";
  if (
    d.generation_basis.task_digest !== task.value.digest ||
    d.generation_basis.baseline_digest !== pcDelegationBaselineDigest(task.value.baseline)
  )
    return "the delegation was made over another baseline, scope or branch than the owner derives from the character's accepted content";
  // the validation is RE-DERIVED from the sealed content, never read from the record
  const unit = d.scope.candidate_space.unit;
  if (d.sealed.duration.unit !== unit) return "the selected duration is in the committed unit";
  if (
    d.sealed.duration.value < d.scope.candidate_space.shortest ||
    d.sealed.duration.value > d.scope.candidate_space.longest
  )
    return "the selected content lies within the committed candidate space";
  if (!statesExactDuration(claim.statement, d.sealed.duration))
    return "the sealed statement states exactly the selected number and unit";
  if ((claim.statement.match(NUMERALS) ?? []).some((n) => n !== String(d.sealed.duration.value)))
    return "the sealed statement states no number other than the selected one";
  const r = d.sealed.reading;
  if (
    r.statement_ground.length < MIN_QUOTE_LENGTH ||
    !claim.statement.includes(r.statement_ground) ||
    !statesExactDuration(r.statement_ground, d.sealed.duration)
  )
    return "the statement ground is a verbatim part of the sealed statement that states the duration";
  if (
    r.baseline_ground.length < MIN_QUOTE_LENGTH ||
    !task.value.baseline.some((i) => i.text.includes(r.baseline_ground))
  )
    return "the baseline ground is a verbatim quotation of the character's accepted baseline";
  if (
    d.sealed.seal !==
    pcDelegationSeal({
      pc_id: d.pc_id,
      scope: d.scope,
      generation_basis: d.generation_basis,
      sealed: d.sealed,
    })
  )
    return "the selected content is sealed: its seal binds the content, the scope and the task it answered";
  if (
    !verify &&
    (d.governing_package.line !== BUILD_SPEC_IDENTITY.line ||
      d.governing_package.package_version !== BUILD_SPEC_IDENTITY.package_version ||
      d.governing_package.package_native_pin !== BUILD_SPEC_IDENTITY.package_native_pin)
  )
    return "the delegation names the governing package version this build implements";
  const order = compareTime(d.effective_from, state.value.canonical_time);
  // admission: effective from exactly the canonical time now (load verification enforces the sanity bound; the exact acceptance time
  // is witnessed by the Temporal owner's own sealed history, see integrity)
  if (order === null || (verify ? order > 0 : order !== 0))
    return "a delegation is effective from the canonical time at which it was accepted, never from an earlier or later time";
  if (!verify && pcHasCollectionCommitment(d.pc_id, facts))
    return "a delegation is refused while a dependent collection commitment exists: a delegation first offered after a consequence depends on it is declined and the branch stays unresolved";
  return null;
}

/**
 * The Character Mirror's confirmation of a delegation (I-002 §9: it confirms scope, method class and seal). It is what the player is
 * shown: their committed scope, the method class and version, the executing role, that the selection is sealed (with the seal), when
 * it is effective and the governing package. `content` is the selected statement: this branch's content is not concealed, because
 * the preparation quotes it verbatim, so there is nothing hidden to spoil.
 */
export interface DelegationMirror {
  readonly scope: {
    readonly branch: string;
    readonly your_words: string | null;
    readonly shortest: number;
    readonly longest: number;
    readonly unit: string;
  };
  readonly method: { readonly class: string; readonly version: string; readonly random: false };
  readonly executed_by: "role.gm";
  readonly provenance: "PLAYER-DELEGATED";
  readonly sealed: true;
  readonly seal: string;
  readonly effective_from: CanonicalTime;
  readonly governing_package: string;
  readonly content: string;
}

export function pcDelegationMirror(d: PcDelegatedClarification): DelegationMirror {
  return {
    scope: {
      branch: d.scope.branch,
      your_words: d.scope.constraint_words,
      shortest: d.scope.candidate_space.shortest,
      longest: d.scope.candidate_space.longest,
      unit: d.scope.candidate_space.unit,
    },
    method: { class: d.method.class, version: d.method.version, random: false },
    executed_by: "role.gm",
    provenance: "PLAYER-DELEGATED",
    sealed: true,
    seal: d.sealed.seal,
    effective_from: d.effective_from,
    governing_package: `${d.governing_package.line} ${d.governing_package.package_version}`,
    content: d.sealed.claims[0]!.statement,
  };
}

/**
 * The accepted claims a mechanism (or its attestation) cites among the character's clarifications and delegations: each reference
 * names a committed record of THIS character at its exact (sealed) version that itself holds, and a claim that exists in it. The
 * player's own R-5 words and a delegated selection are told apart by the KEY they sit at, and a delegated claim carries its
 * provenance on to the host that attests it. Returns the claims with their committed wording, or the reason one does not resolve.
 */
export function resolveClarifiedClaims(
  pcId: string,
  refs: readonly ClarifiedClaimRef[] | undefined,
  facts: ScanFacts,
): { ok: true; claims: readonly ClarifiedClaim[] } | { ok: false; message: string } {
  const claims: ClarifiedClaim[] = [];
  for (const ref of refs ?? []) {
    if (!ref.clarification.fact_key.startsWith(`pc/${pcId}/delegated-clarification/`)) {
      const player = resolvePlayerClarifiedClaim(pcId, ref, facts);
      if (!player.ok) return player;
      claims.push(player.claim);
      continue;
    }
    const found = parse(facts, ref.clarification.fact_key, PcDelegatedClarificationSchema);
    if (!found || found.fact.version !== ref.clarification.version)
      return { ok: false, message: "a cited delegation is committed at the exact version cited" };
    const d = found.value;
    if (d.pc_id !== pcId || found.fact.key !== pcDelegatedClarificationKey(pcId, d.delegation_id))
      return { ok: false, message: "a cited delegation is this character's own" };
    const why = pcDelegationViolation(found.fact.key, d, facts, true);
    if (why) return { ok: false, message: `a cited delegation does not hold: ${why}` };
    const claim = d.sealed.claims[ref.index];
    if (!claim)
      return { ok: false, message: "a cited delegated claim is a sealed claim of the delegation" };
    claims.push({ ref, statement: claim.statement, provenance: "PLAYER-DELEGATED" });
  }
  return { ok: true, claims };
}
