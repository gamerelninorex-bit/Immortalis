import {
  AuthoritySchema,
  CANON_WRITE_AUTHORITY,
  I002HostDecisionSchema,
  IrHostDecisionSchema,
  OBSERVATION_RESOLVER_AUTHORITY,
  ObservationHostDecisionSchema,
  REFEREE_AUTHORITY,
  REFEREE_OP_I002,
  REFEREE_OP_IR,
  REFEREE_OP_OBSERVATION,
  REFEREE_OP_PHYSICAL,
  REFEREE_OP_SCENE,
  PhysicalHostDecisionSchema,
  SceneHostDecisionSchema,
  REFEREE_RECORD_VERSION,
  REFEREE_DECISION_BASIS,
  REFEREE_SECRECY,
  RefereeDecisionRecordSchema,
  fail,
  ok,
  refereeDecisionCause,
  refereeDecisionGroupId,
  refereeDecisionIntentId,
  refereeDecisionKey,
  type CommitGroup,
  type I002ClarificationContext,
  type I002HostDecision,
  type CanonicalTime,
  type IrHostDecision,
  type ObservationHostDecision,
  type OwnerFact,
  type PhysicalHostDecision,
  type RefereeDecisionRecord,
  type RefereeRefusalCode,
  type RefereeVerdict,
  type Result,
  type SceneHostDecision,
} from "@immortalis/contracts";
import { assertCjaCanonical } from "../culture-adjudication/canon.ts";
import { canonicalEqual } from "../hash.ts";
import {
  REFEREE_OBSERVATION_RULE,
  REFEREE_PHYSICAL_RULE,
  REFEREE_SCENE_RULE,
  factKind,
} from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import {
  appearanceContext,
  appearanceWithheld,
  candidateDigest,
  committedCanonicalTime,
  contextDigest,
  deriveI002,
  deriveIr,
  deriveObservation,
  derivePhysical,
  deriveScene,
  i002Context,
  irContext,
  observationContext,
  observationWithheld,
  physicalContext,
  recordContextViolation,
  refereeTaskId,
  statementDigest,
  viewingContext,
  type AppearanceContext,
  type CandidateItem,
  type I002Context,
  type IrContext,
  type ObservationContext,
  type PhysicalContext,
  type SceneContext,
  type SceneRequest,
  type ViewingContext,
} from "./derive.ts";

export type RefereeErrorCode = RefereeRefusalCode | StoreCommitErrorCode;

/** Who answered: the concrete host the TRUSTED campaign configuration bound to the operation (never read from the answer), and the model label it self-reported. */
export interface RefereeHost {
  readonly host_id: string;
  readonly claimed_model: string | null;
}

export interface RefereeOutcome {
  readonly task_id: string;
  readonly verdict: RefereeVerdict;
  readonly disposition: "COMMITTED" | "REPLAYED";
  /** the typed record a consumer reads and depends on */
  readonly record: { readonly key: string; readonly version: number; readonly group_id: string };
  readonly receipt: CommitOutcome["receipt"];
}

/** Stores whose last commit for a task had an unknown outcome: the answer that attempt carried. */
const unreconciled = new WeakMap<CampaignStore, Map<string, string>>();

/**
 * The host-callable AI referee's owner path (`referee_adjudication_kernel / referee_provenance`): builds the exact context a host
 * is delivered, validates a host's answer against it, derives the verdict, and retains it create-only. It calls no model and no
 * host; a host's answer is untrusted input handed to it by the trusted operation.
 *
 * Order (mirrors the Culture adjudication adapter's, whose engineering pattern it reuses and none of whose Culture-only meaning):
 *   (i)  the trusted `role.gm` + `permission.rule.adjudicate` operation context — FIRST, before any lookup or disclosure, replay included;
 *   (ii) the untrusted answer is well-formed plain JSON and satisfies its contract;
 *   (iii) the context is REBUILT from committed facts (IR) or the delivered candidate (I-002); the task identity is derived from it;
 *   (iv) an existing committed decision for the task recovers (identical) or conflicts (different) and replaces nothing;
 *   (v)  the answer's coverage, quotations and coherence are validated and the verdict is derived;
 *   (vi) ONE create-only archivist publication, reading and depending on the cited committed facts.
 */
export class RefereeAdjudicationAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /** The context of an I-002 task for a candidate character (the player's own words, delivered as they are). */
  i002Task(input: {
    pc_id: string;
    attempt: number;
    items: readonly CandidateItem[];
    /** R-5: the scope of a clarification (built from committed facts by the PC owner's `pcClarificationScope`) */
    clarification?: I002ClarificationContext | undefined;
  }): {
    context: I002Context;
    task_id: string;
  } {
    const context = i002Context({
      campaign_id: this.#store.head().campaign_id,
      attempt: input.attempt,
      pc_id: input.pc_id,
      items: input.items,
      clarification: input.clarification,
    });
    return { context, task_id: refereeTaskId(context) };
  }

  /** The context of an IR task, built ONLY from committed facts plus the player's statement. */
  irTask(input: {
    pc_id: string;
    world_id: string;
    locus_id: string;
    attempt: number;
    statement: string;
  }): Result<{ context: IrContext; task_id: string }, RefereeErrorCode> {
    const built = irContext((k) => this.#store.getFact(k), {
      campaign_id: this.#store.head().campaign_id,
      ...input,
    });
    return built.ok
      ? ok({ context: built.context, task_id: refereeTaskId(built.context) })
      : fail(built.code, built.message);
  }

  /** Validates an I-002 answer and derives its verdict WITHOUT writing anything (what the operator shows before a keep). */
  evaluateI002(
    context: I002Context,
    answer: unknown,
  ): Result<{ verdict: RefereeVerdict; decision: I002HostDecision }, RefereeErrorCode> {
    const parsed = parseAnswer(I002HostDecisionSchema, answer);
    if (!parsed.ok) return parsed;
    const derived = deriveI002(context, parsed.value);
    return derived.ok
      ? ok({ verdict: derived.verdict, decision: parsed.value })
      : fail(derived.refusal.code, derived.refusal.message);
  }

  /** Validates an IR answer against the context rebuilt from committed facts and derives its verdict WITHOUT writing anything. */
  evaluateIr(
    context: IrContext,
    answer: unknown,
  ): Result<{ verdict: RefereeVerdict; decision: IrHostDecision }, RefereeErrorCode> {
    const parsed = parseAnswer(IrHostDecisionSchema, answer);
    if (!parsed.ok) return parsed;
    const derived = deriveIr(context, parsed.value);
    return derived.ok
      ? ok({ verdict: derived.verdict, decision: parsed.value })
      : fail(derived.refusal.code, derived.refusal.message);
  }

  /**
   * The context of a physical-placement task, built ONLY from committed facts: the released character, the operative first-ACTIVATION
   * binding (whose preserved native statement is the statement), and the world and locus the binding couples.
   */
  physicalTask(input: {
    pc_id: string;
    attempt: number;
  }): Result<{ context: PhysicalContext; task_id: string }, RefereeErrorCode> {
    const built = physicalContext((k) => this.#store.getFact(k), {
      campaign_id: this.#store.head().campaign_id,
      ...input,
    });
    return built.ok
      ? ok({ context: built.context, task_id: refereeTaskId(built.context) })
      : fail(built.code, built.message);
  }

  /** Validates a physical-placement answer against the context rebuilt from committed facts and derives its verdict WITHOUT writing anything. */
  evaluatePhysical(
    context: PhysicalContext,
    answer: unknown,
  ): Result<{ verdict: RefereeVerdict; decision: PhysicalHostDecision }, RefereeErrorCode> {
    const parsed = parseAnswer(PhysicalHostDecisionSchema, answer);
    if (!parsed.ok) return parsed;
    const derived = derivePhysical(context, parsed.value);
    return derived.ok
      ? ok({ verdict: derived.verdict, decision: parsed.value })
      : fail(derived.refusal.code, derived.refusal.message);
  }

  /** Retains an I-002 decision for a candidate (create-only). */
  recordI002(input: {
    operation: unknown;
    host: RefereeHost;
    pc_id: string;
    attempt: number;
    items: readonly CandidateItem[];
    clarification?: I002ClarificationContext | undefined;
    answer: unknown;
  }): Promise<Result<RefereeOutcome, RefereeErrorCode>> {
    const denied = this.#authority(input.operation);
    if (denied) return Promise.resolve(denied);
    const { context } = this.i002Task(input);
    const evaluated = this.evaluateI002(context, input.answer);
    if (!evaluated.ok) return Promise.resolve(evaluated);
    const record: RefereeDecisionRecord = {
      record_version: REFEREE_RECORD_VERSION,
      task_id: refereeTaskId(context),
      campaign_id: context.campaign_id,
      attempt: context.attempt,
      authority: { ...REFEREE_AUTHORITY },
      host: { ...input.host },
      subject: { pc_id: input.pc_id },
      input: {
        digest: contextDigest(context),
        candidate_digest: candidateDigest(context.candidate),
        candidate: context.candidate.map((c) => ({ ...c })),
        ...(context.clarification ? { clarification: context.clarification } : {}),
        statement_digest: null,
        statement: null,
        refs: [],
      },
      operation: REFEREE_OP_I002,
      decision: evaluated.value.decision,
      verdict: evaluated.value.verdict as "CLOSED" | "BLOCKED" | "CLARIFY",
    };
    return this.#publish(record);
  }

  /** Retains an IR decision (create-only), the context rebuilt from the committed facts. */
  recordIr(input: {
    operation: unknown;
    host: RefereeHost;
    pc_id: string;
    world_id: string;
    locus_id: string;
    attempt: number;
    statement: string;
    answer: unknown;
  }): Promise<Result<RefereeOutcome, RefereeErrorCode>> {
    const denied = this.#authority(input.operation);
    if (denied) return Promise.resolve(denied);
    const task = this.irTask(input);
    if (!task.ok) return Promise.resolve(task);
    const { context } = task.value;
    const evaluated = this.evaluateIr(context, input.answer);
    if (!evaluated.ok) return Promise.resolve(evaluated);
    const record: RefereeDecisionRecord = {
      record_version: REFEREE_RECORD_VERSION,
      task_id: refereeTaskId(context),
      campaign_id: context.campaign_id,
      attempt: context.attempt,
      authority: { ...REFEREE_AUTHORITY },
      host: { ...input.host },
      subject: { pc_id: input.pc_id },
      input: {
        digest: contextDigest(context),
        candidate_digest: null,
        candidate: null,
        statement_digest: statementDigest(context.statement),
        statement: context.statement,
        refs: context.refs.map((r) => ({ ...r })),
      },
      operation: REFEREE_OP_IR,
      decision: evaluated.value.decision,
      verdict: evaluated.value.verdict as
        "BIND_ELIGIBLE" | "UNSUPPORTED_BRIDGE" | "WORLD_CONFLICT" | "UNRESOLVED",
    };
    return this.#publish(record);
  }

  /** Retains a physical-placement decision (create-only), the context rebuilt from the committed facts. */
  recordPhysical(input: {
    operation: unknown;
    host: RefereeHost;
    pc_id: string;
    attempt: number;
    answer: unknown;
  }): Promise<Result<RefereeOutcome, RefereeErrorCode>> {
    const denied = this.#authority(input.operation);
    if (denied) return Promise.resolve(denied);
    const task = this.physicalTask(input);
    if (!task.ok) return Promise.resolve(task);
    const { context } = task.value;
    const evaluated = this.evaluatePhysical(context, input.answer);
    if (!evaluated.ok) return Promise.resolve(evaluated);
    const record: RefereeDecisionRecord = {
      record_version: REFEREE_RECORD_VERSION,
      task_id: refereeTaskId(context),
      campaign_id: context.campaign_id,
      attempt: context.attempt,
      authority: { ...REFEREE_AUTHORITY },
      host: { ...input.host },
      subject: { pc_id: input.pc_id },
      input: {
        digest: contextDigest(context),
        candidate_digest: null,
        candidate: null,
        statement_digest: statementDigest(context.statement),
        statement: context.statement,
        refs: context.refs.map((r) => ({ ...r })),
      },
      operation: REFEREE_OP_PHYSICAL,
      decision: evaluated.value.decision,
      verdict: evaluated.value.verdict as
        | "PHYSICAL_ELIGIBLE"
        | "NOT_PHYSICAL_SINGLE_LOCUS"
        | "PHYSICAL_WORLD_CONFLICT"
        | "PHYSICAL_UNRESOLVED",
    };
    return this.#publish(record);
  }

  /**
   * The context of a direct-perception task (BLUE v5.2), built ONLY from committed facts at the CURRENT canonical basis: the caller names
   * the character and the attempt, and — only when the TRUSTED side has chosen one existing candidate source to investigate — that one
   * source's key. It names no scene, target, fact or expected result. Refused when no canonical basis is established.
   */
  observationTask(input: {
    pc_id: string;
    attempt: number;
    source_key?: string;
    /** default: the owner-published viewing circumstance and appearance of THIS basis are part of the question when they exist */
    scene?: { viewing: "AUTO" | "NONE"; appearance: "AUTO" | "NONE" };
  }): Result<{ context: ObservationContext; task_id: string }, RefereeErrorCode> {
    const facts = (k: string) => this.#store.getFact(k);
    const at = committedCanonicalTime(facts);
    if (!at) return fail("CONTEXT_UNAVAILABLE", "no canonical temporal basis is established");
    const built = observationContext(facts, {
      campaign_id: this.#store.head().campaign_id,
      observed_at: at,
      ...input,
    });
    return built.ok
      ? ok({ context: built.context, task_id: refereeTaskId(built.context) })
      : fail(built.code, built.message);
  }

  /** Validates a direct-perception answer against the context rebuilt from committed facts and derives its verdict WITHOUT writing anything. */
  evaluateObservation(
    context: ObservationContext,
    answer: unknown,
  ): Result<{ verdict: RefereeVerdict; decision: ObservationHostDecision }, RefereeErrorCode> {
    const parsed = parseAnswer(ObservationHostDecisionSchema, answer);
    if (!parsed.ok) return parsed;
    // the values a source-scoped appearance may never carry are re-read from the committed Source Condition the question pins
    const withheld = observationWithheld((k) => this.#store.getFact(k), context);
    if (!withheld) return fail("CONTEXT_UNAVAILABLE", "no source is available to this observation");
    const derived = deriveObservation(context, parsed.value, withheld);
    return derived.ok
      ? ok({ verdict: derived.verdict, decision: parsed.value })
      : fail(derived.refusal.code, derived.refusal.message);
  }

  /**
   * Retains a direct-perception decision (create-only), whatever its derived verdict: a receipt is made only from OBSERVATION_ESTABLISHED
   * (by the Epistemic owner), and a negative or unresolved reading is kept as sealed audit evidence and nothing else. The context is
   * rebuilt from the committed facts at the CURRENT basis; the caller supplies no fact, scene, target or time.
   */
  recordObservation(input: {
    operation: unknown;
    host: RefereeHost;
    pc_id: string;
    attempt: number;
    source_key?: string;
    answer: unknown;
  }): Promise<Result<RefereeOutcome, RefereeErrorCode>> {
    const denied = this.#authority(input.operation);
    if (denied) return Promise.resolve(denied);
    const task = this.observationTask(input);
    if (!task.ok) return Promise.resolve(task);
    const { context } = task.value;
    const evaluated = this.evaluateObservation(context, input.answer);
    if (!evaluated.ok) return Promise.resolve(evaluated);
    const record: RefereeDecisionRecord = {
      record_version: REFEREE_RECORD_VERSION,
      task_id: refereeTaskId(context),
      campaign_id: context.campaign_id,
      attempt: context.attempt,
      authority: { ...REFEREE_AUTHORITY },
      host: { ...input.host },
      subject: { pc_id: input.pc_id },
      input: {
        digest: contextDigest(context),
        candidate_digest: null,
        candidate: null,
        statement_digest: statementDigest(context.statement),
        statement: context.statement,
        refs: context.refs.map((r) => ({ ...r })),
        observed_at: { ...context.observed_at } as CanonicalTime,
      },
      validated_under: { ...OBSERVATION_RESOLVER_AUTHORITY },
      operation: REFEREE_OP_OBSERVATION,
      decision: evaluated.value.decision,
      verdict: evaluated.value.verdict as
        | "OBSERVATION_ESTABLISHED"
        | "OBSERVATION_OBSTRUCTED"
        | "OBSERVATION_UNRESOLVED"
        | "OBSERVATION_WORLD_CONFLICT",
    };
    return this.#publish(record);
  }

  /**
   * The current-viewing question (GM_SCENE_RESOLUTION): committed facts at the CURRENT canonical basis plus the trusted side's request.
   * The caller names the character, the attempt and the request - never a circumstance, a fact or an expected result.
   */
  viewingTask(input: {
    pc_id: string;
    attempt: number;
    request: SceneRequest;
  }): Result<{ context: ViewingContext; task_id: string }, RefereeErrorCode> {
    const facts = (k: string) => this.#store.getFact(k);
    const at = committedCanonicalTime(facts);
    if (!at) return fail("CONTEXT_UNAVAILABLE", "no canonical temporal basis is established");
    const built = viewingContext(facts, {
      campaign_id: this.#store.head().campaign_id,
      observed_at: at,
      ...input,
    });
    return built.ok
      ? ok({ context: built.context, task_id: refereeTaskId(built.context) })
      : fail(built.code, built.message);
  }

  /** The output-appearance question for ONE credited delivery of the character's own collection (no observer, request or time). */
  appearanceTask(input: {
    pc_id: string;
    attempt: number;
    extraction_id: string;
  }): Result<{ context: AppearanceContext; task_id: string }, RefereeErrorCode> {
    const built = appearanceContext((k) => this.#store.getFact(k), {
      campaign_id: this.#store.head().campaign_id,
      ...input,
    });
    return built.ok
      ? ok({ context: built.context, task_id: refereeTaskId(built.context) })
      : fail(built.code, built.message);
  }

  /** Validates a scene answer against the context and derives its verdict WITHOUT writing anything. */
  evaluateScene(
    context: SceneContext,
    answer: unknown,
  ): Result<{ verdict: RefereeVerdict; decision: SceneHostDecision }, RefereeErrorCode> {
    const parsed = parseAnswer(SceneHostDecisionSchema, answer);
    if (!parsed.ok) return parsed;
    const withheld =
      context.kind === "OUTPUT_APPEARANCE"
        ? appearanceWithheld((k) => this.#store.getFact(k), context)
        : undefined;
    if (withheld === null)
      return fail("CONTEXT_UNAVAILABLE", "no credited delivery is available to this appearance");
    const derived = deriveScene(context, parsed.value, withheld ?? undefined);
    return derived.ok
      ? ok({ verdict: derived.verdict, decision: parsed.value })
      : fail(derived.refusal.code, derived.refusal.message);
  }

  /**
   * Retains a scene decision (create-only), whatever its derived verdict: a physical owner publishes only from VIEWING_SUPPORTED or
   * APPEARANCE_RESOLVED, and every other ruling is kept as sealed audit evidence and nothing else.
   */
  recordScene(
    input:
      | {
          operation: unknown;
          host: RefereeHost;
          pc_id: string;
          attempt: number;
          kind: "CURRENT_VIEWING";
          request: SceneRequest;
          answer: unknown;
        }
      | {
          operation: unknown;
          host: RefereeHost;
          pc_id: string;
          attempt: number;
          kind: "OUTPUT_APPEARANCE";
          extraction_id: string;
          answer: unknown;
        },
  ): Promise<Result<RefereeOutcome, RefereeErrorCode>> {
    const denied = this.#authority(input.operation);
    if (denied) return Promise.resolve(denied);
    const task =
      input.kind === "CURRENT_VIEWING" ? this.viewingTask(input) : this.appearanceTask(input);
    if (!task.ok) return Promise.resolve(task);
    const context: SceneContext = task.value.context;
    const evaluated = this.evaluateScene(context, input.answer);
    if (!evaluated.ok) return Promise.resolve(evaluated);
    const statement = context.kind === "CURRENT_VIEWING" ? context.request.statement : null;
    const record: RefereeDecisionRecord = {
      record_version: REFEREE_RECORD_VERSION,
      task_id: refereeTaskId(context),
      campaign_id: context.campaign_id,
      attempt: context.attempt,
      authority: { ...REFEREE_AUTHORITY },
      host: { ...input.host },
      subject: { pc_id: input.pc_id },
      input: {
        digest: contextDigest(context),
        candidate_digest: null,
        candidate: null,
        statement_digest: statement === null ? null : statementDigest(statement),
        statement,
        refs: context.refs.map((r) => ({ ...r })),
        observed_at:
          context.kind === "CURRENT_VIEWING" ? ({ ...context.observed_at } as CanonicalTime) : null,
      },
      validated_under: { ...OBSERVATION_RESOLVER_AUTHORITY },
      operation: REFEREE_OP_SCENE,
      decision: evaluated.value.decision,
      verdict: evaluated.value.verdict as
        | "VIEWING_SUPPORTED"
        | "VIEWING_NOT_SUPPORTED"
        | "VIEWING_UNRESOLVED"
        | "PLAYER_CHOICE_REQUIRED"
        | "APPEARANCE_RESOLVED"
        | "APPEARANCE_UNRESOLVED"
        | "SCENE_WORLD_CONFLICT",
    };
    return this.#publish(record);
  }

  /** The committed decision of a task, by identity (an exact key, never a scan). */
  decision(taskId: string): { fact: OwnerFact; value: RefereeDecisionRecord } | undefined {
    if (!/^[0-9a-f]{64}$/.test(taskId)) return undefined;
    const fact = this.#store.getFact(refereeDecisionKey(taskId));
    const value = fact ? RefereeDecisionRecordSchema.safeParse(fact.value) : undefined;
    return fact && value?.success ? { fact, value: value.data } : undefined;
  }

  // -- steps ------------------------------------------------------------------------------------

  #authority(operation: unknown): Result<never, RefereeErrorCode> | null {
    const claimed = AuthoritySchema.safeParse(operation);
    return claimed.success &&
      claimed.data.role === REFEREE_AUTHORITY.role &&
      claimed.data.permission === REFEREE_AUTHORITY.permission
      ? null
      : fail(
          "AUTHORITY_DENIED",
          "the referee decision is accepted only under the trusted operation context role.gm + permission.rule.adjudicate",
        );
  }

  async #publish(record: RefereeDecisionRecord): Promise<Result<RefereeOutcome, RefereeErrorCode>> {
    const parsed = RefereeDecisionRecordSchema.safeParse(record);
    if (!parsed.success)
      return fail("DECISION_INPUT_INVALID", "the decision record violates its contract");
    const r = parsed.data;
    const key = refereeDecisionKey(r.task_id);
    const committed = this.#store.getFact(key);
    if (committed) return this.#replay(r, committed);

    const answerDigest = answerHash(r);
    const pending = unreconciled.get(this.#store)?.get(r.task_id);
    if (pending !== undefined && pending !== answerDigest)
      return fail(
        "UNKNOWN_OUTCOME",
        "an earlier commit for this task had an unknown outcome; reopen the campaign and reconcile by the deterministic identity before any other answer",
      );

    // the recorded context must be exactly the one the cited committed facts (or the delivered candidate) derive
    const violation = recordContextViolation(r, (k) => this.#store.getFact(k));
    if (violation) return fail(violation.code, violation.message);

    const kind = factKind("referee_decision");
    const reads = r.input.refs.map((x) => ({ key: x.fact_key, version: x.version }));
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: refereeDecisionGroupId(r.task_id),
      intent_id: refereeDecisionIntentId(r.task_id),
      owner: kind.owner,
      facet: kind.facet,
      cause: refereeDecisionCause(r.task_id),
      rule:
        r.operation === REFEREE_OP_PHYSICAL
          ? REFEREE_PHYSICAL_RULE
          : r.operation === REFEREE_OP_OBSERVATION
            ? REFEREE_OBSERVATION_RULE
            : r.operation === REFEREE_OP_SCENE
              ? REFEREE_SCENE_RULE
              : kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...new Set(r.input.refs.map((x) => x.group_id))],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: r as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: REFEREE_DECISION_BASIS,
          secrecy: REFEREE_SECRECY,
          expected_version: 0,
        },
      ],
    };
    const outcome = await this.#store.commit(group);
    if (!outcome.ok) {
      if (outcome.error.code === "UNKNOWN_OUTCOME" || outcome.error.code === "STORE_POISONED") {
        const map = unreconciled.get(this.#store) ?? new Map<string, string>();
        map.set(r.task_id, answerDigest);
        unreconciled.set(this.#store, map);
        return outcome;
      }
      const winner = this.#store.getFact(key);
      return winner ? this.#replay(r, winner) : outcome;
    }
    const fact = this.#store.getFact(key);
    if (!fact)
      return fail("DECISION_INTEGRITY_FAILURE", "the committed referee record is not readable");
    return ok({
      task_id: r.task_id,
      verdict: r.verdict,
      disposition: "COMMITTED",
      record: { key: fact.key, version: fact.version, group_id: fact.provenance.group_id },
      receipt: outcome.value.receipt,
    });
  }

  /** The same answer recovers; a different one is a conflict that replaces nothing — the host is never rerolled. */
  #replay(r: RefereeDecisionRecord, fact: OwnerFact): Result<RefereeOutcome, RefereeErrorCode> {
    const held = RefereeDecisionRecordSchema.safeParse(fact.value);
    if (!held.success)
      return fail("DECISION_INTEGRITY_FAILURE", "the committed referee record is malformed");
    if (!canonicalEqual(held.data.decision, r.decision) || !canonicalEqual(held.data.host, r.host))
      return fail(
        "DECISION_CONFLICT",
        "this immutable task identity has a committed decision with different content; it is not a new reading of the same situation",
      );
    const receipt = this.#store.lookupReceipt(fact.provenance.intent_id);
    if (!receipt)
      return fail("DECISION_INTEGRITY_FAILURE", "a committed referee record has no receipt");
    return ok({
      task_id: held.data.task_id,
      verdict: held.data.verdict,
      disposition: "REPLAYED",
      record: { key: fact.key, version: fact.version, group_id: fact.provenance.group_id },
      receipt,
    });
  }
}

function answerHash(r: RefereeDecisionRecord): string {
  return JSON.stringify([r.decision, r.host]);
}

/** Well-formed plain JSON that satisfies the answer's contract; anything else is refused before it is looked at further. */
function parseAnswer<T>(
  schema: {
    safeParse(v: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
        };
  },
  answer: unknown,
): Result<T, RefereeErrorCode> {
  try {
    assertCjaCanonical(answer);
  } catch {
    return fail("DECISION_INPUT_INVALID", "the answer is not well-formed plain JSON");
  }
  const parsed = schema.safeParse(answer);
  if (!parsed.success)
    return fail("DECISION_INPUT_INVALID", "the answer violates its contract", {
      issues: parsed.error.issues
        .slice(0, 5)
        .map((i) => `${i.path.map(String).join(".")}: ${i.message}`),
    });
  return ok(parsed.data);
}
