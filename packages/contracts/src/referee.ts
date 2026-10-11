import { z } from "zod";
import { AuthoritySchema } from "./commit.ts";
import { GM_ADJUDICATION_AUTHORITY } from "./culture-adjudication.ts";
import { Id, Sha256 } from "./ids.ts";
import { EntityId } from "./world-foundation.ts";

/**
 * The host-callable AI referee (PR #61, BLUE B61-A3 under the Sovereign's Option B directive of 11 October 2026): the contracts of
 * the TWO bounded interpretation tasks an external, compatible AI host performs for the engine, and of the immutable decision
 * evidence the engine retains.
 *
 *   I002_CLASSIFY             — I-002 (Player Character Generation) §2.1, §6 Step 6, §7, §21: the host separates what a player's own
 *                               words say about THEIR OWN character (intrinsic, finite Entry Envelope, intentionally open) from what
 *                               they assert about the world, an office, an institution or an independent actor.
 *   IR_NATIVE_COMPATIBILITY   — Player-World Insertion & Reconciliation §3, §5, §7: the host reads the player's separately authored
 *                               native-presence statement (native/already-there versus any arrival, portal, transfer or summoning)
 *                               and whether it contradicts the committed World Profile (premise and ORIGINAL established canon
 *                               included), law departures, insertion constraints, Locus designation and constraints.
 *
 * What is here is mechanism, never meaning. A host's answer carries NO canon, NO role and NO permission: the engine alone validates
 * it (closed vocabularies, verbatim-quoted grounds, full coverage of what was delivered, a verdict DERIVED from the answer and never
 * taken from it), and a decision is retained as a create-only record under `role.gm` + `permission.rule.adjudicate` bound by the
 * trusted operation, never by the answer. The record is infrastructure provenance (RC-09 shaped, create-only, immutable), like the
 * Culture adjudication record it reuses engineering patterns from; it is not a Culture owner, a world owner, a PC owner or a game rule.
 */

export const OWNER_REFEREE_KERNEL = "referee_adjudication_kernel";
export const FACET_REFEREE_PROVENANCE = "referee_provenance";
export const REFEREE_DECISION_BASIS = "referee-host-decision";
export const REFEREE_SECRECY = "engine-internal";
export const REFEREE_RECORD_VERSION = 1;

/** The same trusted precondition the Role Registry fixes for adjudication. No new role or permission identifier exists. */
export const REFEREE_AUTHORITY = GM_ADJUDICATION_AUTHORITY;

export const REFEREE_OP_I002 = "I002_CLASSIFY";
export const REFEREE_OP_IR = "IR_NATIVE_COMPATIBILITY";
export const RefereeOperationSchema = z.enum([REFEREE_OP_I002, REFEREE_OP_IR]);
export type RefereeOperation = z.infer<typeof RefereeOperationSchema>;

export const RefereeTaskIdSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const refereeDecisionKey = (taskId: string): string => `referee/${taskId}/decision`;
export const refereeDecisionGroupId = (taskId: string): string => `referee:group:v1:${taskId}`;
export const refereeDecisionIntentId = (taskId: string): string => `referee:intent:v1:${taskId}`;
export const refereeDecisionCause = (taskId: string): string => `referee:decision:v1:${taskId}`;

// ---------------------------------------------------------------------------------------------
// The closed source clauses a host may cite. Each is an exact pinned frozen source; `text` is the
// short excerpt delivered with the task so the host reasons from the source and not from memory.
// ---------------------------------------------------------------------------------------------

const I002 = {
  artifact: "https://app.notion.com/p/5a520af901e0829eadb201bccd6c4718",
  native_pin: "2026-09-25T00:15:54.536Z",
} as const;
const IR = {
  artifact: "https://app.notion.com/p/3e320af901e081a3a669c1c0b842c9df",
  native_pin: "2026-09-25T00:17:26.287Z",
} as const;

export const REFEREE_SOURCES = {
  "I002-2": {
    ...I002,
    clause: "§2 Ownership Contract",
    text: "I-002 owns the player-character's intrinsic self-definition, identity/agency topology, minimal embodiment topology, continuity rule, character-local capabilities, dependencies and exceptions, and bounded Entry-Envelope contents. It does NOT own surrounding world substrate or independent world-state; current population, factions, institutions, armies, settlements or economies; independently agentic followers/retainers/occupants; actual placement inside the destination world; NPC interpretation/choice.",
  },
  "I002-2.1": {
    ...I002,
    clause: "§2.1 Role / Authority Declaration",
    text: "role.player supplies PC authorship. role.gm interprets declarations and applies authorship/ownership rules. World authority is never PC-authored input through I-002.",
  },
  "I002-4.6": {
    ...I002,
    clause: "§4.6 Entry-Envelope Boundary",
    text: "Identify what may accompany the PC as bounded character-local starting state without instantiating independent society.",
  },
  "I002-6.6": {
    ...I002,
    clause: "§6 Step 6 — Validate Authorship / Entry Envelope",
    text: "Before hand-off, reject or reroute any claim that would silently create independent actors, population, institution, territory, economy, remote infrastructure, unlimited external support, or current external loyalty/resources, unless another lawful owner explicitly establishes it. SETTING-PREMISE may be accepted/rejected by World Generation; PC-RELATIONAL STANDING becomes real only when its world/institutional basis is established; ACTOR-STANCE CLAIM is never directly accepted as player-authored actor state; formal office powers do not imply compliance.",
  },
  "I002-7": {
    ...I002,
    clause: "§7 Claim Provenance Classes",
    text: "PLAYER-AUTHORED (explicitly stated by player); SAFELY-INHERITED; UNRESOLVED (intentionally open); SETTING-PREMISE (proposed opening world structure awaiting World Generation); PC-RELATIONAL STANDING (proposed structural relation such as office/title/legal position/ownership awaiting the relevant world/institutional basis); ACTOR-STANCE CLAIM (player statement about independent actor stance; never direct actor canon); SETTING-LAW PROPOSAL; ORIGIN-MEMORY / ASSERTION (PC-relative memory/belief about external state, not present world truth). Do not promote hypothesis, memory, office claim, or stance claim to world truth by convenience.",
  },
  "I002-21": {
    ...I002,
    clause: "§21 Generation Hand-Off Test",
    text: "Hand off only when no unresolved claim blocks lawful World Generation or Insertion, and world-owned assertions are authority-classified and routed rather than silently adopted, and Entry-Envelope state is bounded.",
  },
  "IR-3": {
    ...IR,
    clause: "§6 Step 3 — Determine whether a bridge exists",
    text: "Classify: native/already-there (no transfer bridge required); established transfer/approach; deferred activation; recurrent binding; degenerate coextensive binding; NULL. If no bridge exists, do not invent one.",
  },
  "IR-5": {
    ...IR,
    clause: "§5 Precedence for Insertion Facts",
    text: "Use: 1. explicit player-authored fact; 2. strong semantic implication; 3. authoritative world/PC fact already established; ... No silent invention of material insertion facts. A genre label alone does not choose a mechanism.",
  },
  "IR-7": {
    ...IR,
    clause: "§7 Placement / Compatibility",
    text: "Apply: established world baseline + explicit accepted PC exception. If PC/world facts directly conflict and no precedence exists: clarify, consume explicit delegation, or leave unresolved; do not weaken either side for convenience.",
  },
  "IR-9": {
    ...IR,
    clause: "§9 Genre / Connective Detail Rule",
    text: "Presentation may not invent a death event, a portal device, a summoner, a vessel or another causal transition mechanism. Decorate an established bridge; do not invent the bridge for flavor.",
  },
  "IR-18": {
    ...IR,
    clause: "§18 Failure / No-Op Conditions",
    text: "Return UNRESOLVED / ROUTE when exact PC/world constraints conflict without precedence, or a required player-authored fork is open.",
  },
} as const;

export type RefereeRuleId = keyof typeof REFEREE_SOURCES;
export const REFEREE_RULE_IDS = Object.keys(REFEREE_SOURCES) as [RefereeRuleId, ...RefereeRuleId[]];
export const RefereeRuleIdSchema = z.enum(REFEREE_RULE_IDS);

// ---------------------------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------------------------

const Grounds = z.string().min(1).max(600);
const Quote = z.string().min(1).max(500);
const RuleIds = z.array(RefereeRuleIdSchema).min(1).max(6);

// ---------------------------------------------------------------------------------------------
// I002_CLASSIFY
// ---------------------------------------------------------------------------------------------

/** The slots of a candidate character, as the delivered items name them. */
export const REFEREE_CANDIDATE_SLOTS = [
  "identity",
  "embodiment",
  "continuity",
  "contact",
  "no_contact",
  "exception",
  "possession",
  "open",
] as const;
export type RefereeCandidateSlot = (typeof REFEREE_CANDIDATE_SLOTS)[number];

export const I002_ITEM_CLASSES = [
  "INTRINSIC_PC",
  "ENTRY_ENVELOPE_FINITE",
  "UNRESOLVED_PC",
  "ORIGIN_MEMORY",
  "SETTING_PREMISE",
  "PC_RELATIONAL_STANDING",
  "ACTOR_STANCE_CLAIM",
  "WORLD_STATE_ASSERTION",
  "SETTING_LAW_PROPOSAL",
  "MIXED",
  "AMBIGUOUS",
] as const;
export type I002ItemClass = (typeof I002_ITEM_CLASSES)[number];
export const I002ItemClassSchema = z.enum(I002_ITEM_CLASSES);

/** The classes that name something that is NOT the player's own character-local claim. */
export const I002_NON_INTRINSIC_CLASSES = [
  "ORIGIN_MEMORY",
  "SETTING_PREMISE",
  "PC_RELATIONAL_STANDING",
  "ACTOR_STANCE_CLAIM",
  "WORLD_STATE_ASSERTION",
  "SETTING_LAW_PROPOSAL",
] as const;
const NonIntrinsicClassSchema = z.enum(I002_NON_INTRINSIC_CLASSES);

/** The ONE class each slot admits as the player's own: anything else is not admitted into the Existence Contract. */
export const I002_ADMITTED_CLASS: Readonly<Record<RefereeCandidateSlot, I002ItemClass>> = {
  identity: "INTRINSIC_PC",
  embodiment: "INTRINSIC_PC",
  continuity: "INTRINSIC_PC",
  contact: "INTRINSIC_PC",
  no_contact: "INTRINSIC_PC",
  exception: "INTRINSIC_PC",
  possession: "ENTRY_ENVELOPE_FINITE",
  open: "UNRESOLVED_PC",
};

export const I002ItemDecisionSchema = z.strictObject({
  item_id: Id,
  /** echoed; the engine checks it equals the delivered item's slot */
  slot: z.enum(REFEREE_CANDIDATE_SLOTS),
  class: I002ItemClassSchema,
  rule_ids: RuleIds,
  grounds: Grounds,
  /** a verbatim excerpt of the item's text that shows why it is not (only) the player's own; required for every class that is not admitted-as-own */
  evidence_quote: Quote.nullable(),
  /** MIXED only: the verbatim part of the text that IS the player's own, offered for the player to keep; never applied by the engine */
  intrinsic_excerpt: Quote.nullable(),
  /** MIXED only: what the rest is */
  other_classes: z.array(NonIntrinsicClassSchema).max(6),
  /** AMBIGUOUS only: the one narrow question to put to the player */
  clarification: z.string().min(1).max(300).nullable(),
});
export type I002ItemDecision = z.infer<typeof I002ItemDecisionSchema>;

export const I002HostDecisionSchema = z.strictObject({
  task_id: RefereeTaskIdSchema,
  items: z.array(I002ItemDecisionSchema).min(1).max(64),
});
export type I002HostDecision = z.infer<typeof I002HostDecisionSchema>;

// ---------------------------------------------------------------------------------------------
// IR_NATIVE_COMPATIBILITY
// ---------------------------------------------------------------------------------------------

export const IR_READING_MODES = [
  "NATIVE_ALREADY_THERE",
  "ARRIVAL",
  "PORTAL",
  "TRANSFER",
  "SUMMONING",
  "OTHER_UNSUPPORTED",
  "AMBIGUOUS",
] as const;
export type IrReadingMode = (typeof IR_READING_MODES)[number];

export const IR_RELATIONS = ["SUPPORTS", "NOT_RELEVANT", "CONTRADICTS", "UNCLEAR"] as const;
export type IrRelation = (typeof IR_RELATIONS)[number];

export const IrFactAssessmentSchema = z.strictObject({
  fact_id: Id,
  relation: z.enum(IR_RELATIONS),
  rule_ids: RuleIds,
  grounds: Grounds,
  /** a verbatim excerpt of that fact's text; required for SUPPORTS and CONTRADICTS */
  evidence_quote: Quote.nullable(),
});
export type IrFactAssessment = z.infer<typeof IrFactAssessmentSchema>;

export const IrHostDecisionSchema = z.strictObject({
  task_id: RefereeTaskIdSchema,
  reading: z.strictObject({
    mode: z.enum(IR_READING_MODES),
    rule_ids: RuleIds,
    grounds: Grounds,
    /** a verbatim excerpt of the player's statement */
    evidence_quote: Quote,
  }),
  assessments: z.array(IrFactAssessmentSchema).min(1).max(96),
  clarification: z.string().min(1).max(300).nullable(),
});
export type IrHostDecision = z.infer<typeof IrHostDecisionSchema>;

// ---------------------------------------------------------------------------------------------
// The verdicts (always DERIVED by the engine from the answer, never taken from it)
// ---------------------------------------------------------------------------------------------

export const I002_VERDICTS = ["CLOSED", "BLOCKED", "CLARIFY"] as const;
export const IR_VERDICTS = [
  "BIND_ELIGIBLE",
  "UNSUPPORTED_BRIDGE",
  "WORLD_CONFLICT",
  "UNRESOLVED",
] as const;
export const RefereeVerdictSchema = z.enum([...I002_VERDICTS, ...IR_VERDICTS]);
export type RefereeVerdict = z.infer<typeof RefereeVerdictSchema>;

// ---------------------------------------------------------------------------------------------
// The retained decision evidence
// ---------------------------------------------------------------------------------------------

export const RefereeInputRefSchema = z.strictObject({
  fact_key: Id,
  version: z.number().int().positive(),
  group_id: Id,
});
export type RefereeInputRef = z.infer<typeof RefereeInputRefSchema>;

const RecordCore = {
  record_version: z.literal(REFEREE_RECORD_VERSION),
  task_id: RefereeTaskIdSchema,
  campaign_id: Id,
  attempt: z.number().int().nonnegative(),
  /** the trusted operation context under which the engine accepted the answer; never read from the answer */
  authority: AuthoritySchema,
  /** the concrete host the trusted campaign configuration bound to this operation, and the model label it SELF-reported (provenance only) */
  host: z.strictObject({ host_id: Id, claimed_model: z.string().min(1).max(160).nullable() }),
  subject: z.strictObject({ pc_id: EntityId }),
  input: z.strictObject({
    /** sha256 over the canonical task context the host was given */
    digest: Sha256,
    /** I002: sha256 over the delivered candidate items; the released Existence Contract must derive exactly these */
    candidate_digest: Sha256.nullable(),
    /** I002: the delivered candidate itself (the player's own words, as delivered), so the digest re-derives from the record alone */
    candidate: z
      .array(
        z.strictObject({
          item_id: Id,
          slot: z.enum(REFEREE_CANDIDATE_SLOTS),
          text: z.string().min(1).max(600),
        }),
      )
      .max(64)
      .nullable(),
    /** IR: sha256 over the player's native-presence statement, and the statement itself, verbatim */
    statement_digest: Sha256.nullable(),
    statement: z.string().min(1).max(600).nullable(),
    /** the committed facts the context was built from, at the versions delivered (IR only; foreign facts are referenced, never copied) */
    refs: z.array(RefereeInputRefSchema).max(8),
  }),
};

export const RefereeDecisionRecordSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    ...RecordCore,
    operation: z.literal(REFEREE_OP_I002),
    decision: I002HostDecisionSchema,
    verdict: z.enum(I002_VERDICTS),
  }),
  z.strictObject({
    ...RecordCore,
    operation: z.literal(REFEREE_OP_IR),
    decision: IrHostDecisionSchema,
    verdict: z.enum(IR_VERDICTS),
  }),
]);
export type RefereeDecisionRecord = z.infer<typeof RefereeDecisionRecordSchema>;

/** Why an answer, or a request, is refused. None of these writes anything. */
export type RefereeRefusalCode =
  | "AUTHORITY_DENIED"
  | "DECISION_INPUT_INVALID"
  | "TASK_MISMATCH"
  | "COVERAGE_INCOMPLETE"
  | "GROUNDS_UNSUPPORTED"
  | "DECISION_INCOHERENT"
  | "CONTEXT_UNAVAILABLE"
  | "CONTEXT_STALE"
  | "DECISION_CONFLICT"
  | "DECISION_INTEGRITY_FAILURE";
