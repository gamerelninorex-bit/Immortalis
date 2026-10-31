import { z } from "zod";
import { AuthoritySchema } from "./commit.ts";
import { GM_ADJUDICATION_AUTHORITY } from "./culture-adjudication.ts";
import { Id, Sha256 } from "./ids.ts";
import { CanonicalTimeSchema } from "./temporal.ts";
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
 *   IR_PHYSICAL_PLACEMENT     — (original active-PC qualified physical-locus custody) I-002 §4.3 and Player-World Insertion §§2, 7, 12, 14, 17: the
 *                               host reads the accepted character's own embodiment statements and the player's separately confirmed
 *                               native-presence statement, as committed, against the committed World Profile and Locus and says whether
 *                               they support ONE material, spatial physical subject originally present at exactly that Locus — or an
 *                               incorporeal, coextensive, distributed, non-spatial, ambiguous, arrival-based, elsewhere or externally
 *                               dependent presence, which is never a physical-locus fact.
 *
 *   F014D_DIRECT_PERCEPTION   — (active-PC direct physical observation, BLUE v5.2) F-014D §§2, 5 steps 2-4, 6, 18, 24: the host reads the bounded,
 *                               source-pinned physical context of ONE current basis (the world and the locus as committed, the accepted
 *                               character's own statements, the player's confirmed native-presence statement, and the character's committed
 *                               physical custody) and says — anchored to verbatim quotations of those premises, never to a flag — whether
 *                               the character's sight is established, whether its exact viewing circumstances are established, whether the
 *                               path from the physical feature to the character is open or blocked, and the minimal raw appearance that
 *                               follows. It never decides recognition, comprehension, belief, memory, action or time.
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

/**
 * The direct-perception operation separates three roles (BLUE v5.2): `role.gm` + `permission.rule.adjudicate` INTERPRETS (the host's
 * answer, under `REFEREE_AUTHORITY`); `role.resolver` + `permission.resolution.execute` VALIDATES and derives the verdict (the engine's
 * deterministic coverage, quotation and premise-kind checks, stamped by the engine itself under its own trusted operation and never read
 * from an answer); and `role.archivist` + `permission.canon.write` COMMITS (every group). Persona, provider, model or tool identity
 * grants none of them.
 */
export const OBSERVATION_RESOLVER_AUTHORITY = {
  role: "role.resolver",
  permission: "permission.resolution.execute",
} as const;

export const REFEREE_OP_I002 = "I002_CLASSIFY";
export const REFEREE_OP_IR = "IR_NATIVE_COMPATIBILITY";
export const REFEREE_OP_PHYSICAL = "IR_PHYSICAL_PLACEMENT";
export const REFEREE_OP_OBSERVATION = "F014D_DIRECT_PERCEPTION";
/**
 * (GM-led first play, 30 October 2026) the GM's bounded scene resolution: the CURRENT VIEWING of one canonical basis (I-001 §4 Step 5 /
 * §8). Does an ORDINARY look (routine attention, turning, opening the eyes) cover the player's request at this basis, given the
 * character's accepted baseline, the committed world and locus and the confirmed placement, or does the request carry a materially new
 * commitment? The host rules; the World-State physical custodian publishes the SUPPORTED circumstance; a request alone is never a
 * physical result. (The appearance of a credited output is NOT a scene question: it is incidental narration, never an owner fact.)
 */
export const REFEREE_OP_SCENE = "GM_SCENE_RESOLUTION";
export const RefereeOperationSchema = z.enum([
  REFEREE_OP_I002,
  REFEREE_OP_IR,
  REFEREE_OP_PHYSICAL,
  REFEREE_OP_OBSERVATION,
  REFEREE_OP_SCENE,
]);
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
const F014D = {
  artifact: "https://app.notion.com/p/3e020af901e08103b81aec5f7119318e",
  native_pin: "2026-09-24T16:25:17.059Z",
} as const;

const I001 = {
  artifact: "https://app.notion.com/p/3e220af901e081c6b0f2edcfefe9e4d2",
  native_pin: "2026-09-25T00:17:49.551Z",
} as const;

export const REFEREE_SOURCES = {
  "I001-5": {
    ...I001,
    clause: "§4 Step 5 — Route Goal-Level Intent",
    text: "Infer ordinary intermediate means when: they are plainly implied by the goal; the PC can reasonably perform them; no material boundary intervenes. Stop compression when a material obstacle, danger, cost, resistance, permission issue, uncertainty, interruption or consequential branch appears.",
  },
  "I001-8": {
    ...I001,
    clause: "§8 Goal-Level Intent Compression Adapter",
    text: "Infer: reaching; ordinary opening/closing; retrieval; routine walking/turning/stairs/doors; other mundane means strongly implied by the goal. Do not infer: breaking a lock; trespassing against a meaningful restriction; consuming a scarce resource; activating a costly power; selecting among consequential routes/options; attacking, stealing, deceiving or another materially distinct commitment unless the goal clearly contains it. Infer routine means; never infer consequential commitment.",
  },
  "I001-17": {
    ...I001,
    clause: "§17 Temporal Guard",
    text: "Interface activity does not create simulation time. Goal-level compression may compress player commands, never causal time.",
  },
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
  "I002-4.3": {
    ...I002,
    clause: "§4.3 Embodiment Topology",
    text: "What form/locus or loci currently constitute the PC at the intrinsic level? Examples may include: one body; several same-agency bodies; host-dependent embodiment; distributed substrate; incorporeal manifestation; null/no-current-body state; total-domain/coextensive self. Position, local damage, local condition and other world-locus differences belong to Insertion/world/runtime owners and do not force I-002 per-locus records. Do not resolve more physical detail than current causality requires.",
  },
  "I002-17.2": {
    ...I002,
    clause: "§17.2 Total-Domain / Coextensive Self",
    text: "If the PC is literally the whole simulated domain, require explicit player confirmation of that coextensive meaning and World Generation acceptance. Insertion may then be degenerate rather than spatial.",
  },
  "IR-2": {
    ...IR,
    clause: "§2 Ownership Contract",
    text: "Insertion/Reconciliation owns: binding to one world locus, several loci, a host/shared embodiment relation, a distributed/incorporeal substrate, or a degenerate non-spatial relation where already established; reconciliation of already-established PC-side and world-side constraints at the coupling seam. Insertion does not own: PC identity/continuity/agency topology; the world baseline or independent world facts; actor motives, stance or choices; PC/actor knowledge; temporal cadence/duration.",
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
  "IR-12": {
    ...IR,
    clause: "§12 Independent Actor Boundary",
    text: "Insertion may establish that a PC encounters/is found by/occupies/shares a locus with an independent actor. Insertion may not invent that actor's: motive; loyalty; willingness; adoption decision; hostility; concession; private knowledge.",
  },
  "IR-14": {
    ...IR,
    clause: "§14 Total-Domain",
    text: "If PC self = accepted ontological domain then insertion is degenerate: no spatial arrival; no portal; no spawn coordinate; no bridge invented.",
  },
  "IR-17": {
    ...IR,
    clause: "§17 Persistence / Write-Back",
    text: "Authoritative durable writes route to their owners: active role.player_character binding → Role Registry / F-014C; world placement/overlap → World owner; intrinsic PC change → I-002; actor state → Actor owner; PC/actor knowledge → Epistemic owner.",
  },
  "IR-18": {
    ...IR,
    clause: "§18 Failure / No-Op Conditions",
    text: "Return UNRESOLVED / ROUTE when exact PC/world constraints conflict without precedence, or a required player-authored fork is open.",
  },
  "F014D-2": {
    ...F014D,
    clause: "§2 Ownership Contract",
    text: "F-014D owns: causal information route to a recipient; source / carrier / channel provenance; actual observed, transmitted, retrieved or remembered payload; receipt / access; representational intelligibility prerequisites such as sensory availability and whether established language/notation/format/decoding capability permits the payload to be accessed. F-014D does not own: objective world truth or hidden-state generation; named-actor comprehension, inference, misreading, credibility weighting, belief/stance, willingness or decision.",
  },
  "F014D-5": {
    ...F014D,
    clause: "§5 Six-Step Epistemic Hot Path, Steps 2-4",
    text: "Step 2 — Establish the Causal Route: identify the real path source/holder → carrier/channel → recipient. Do not create access merely from group membership, institutional authority without receipt, engine/GM/host knowledge, player OOC knowledge, another actor's private state or objective truth. Step 4 — Resolve Receipt and Representational Intelligibility: did the recipient actually receive/perceive/retrieve the payload? Is the relevant sensory modality available? This step does not decide actor-specific comprehension, significance, inference, credibility, belief or action.",
  },
  "F014D-6": {
    ...F014D,
    clause: "§6 Direct Perception Adapter",
    text: "Trigger: an actor can materially perceive world state directly. Procedure: 1. read authoritative world state at the lawful observation basis; 2. apply actual sensory position/range/obstruction/channel; 3. form only the perceptible payload; 4. hand off inference to capability + Actor Fidelity. Perception does not grant ontology. Seeing an unknown machine does not imply knowing its mechanism; observing agency does not imply correctly classifying the agent.",
  },
  "F014D-18": {
    ...F014D,
    clause: "§18 Named Actor / Actor Fidelity Handoff",
    text: "The operational handoff is an Accessible Content Packet: payload; Presented Source Attribution and actor-admissible carrier/channel features only; access basis; representational intelligibility. Sealed Engine Provenance is excluded from the Accessible Content Packet and from actor-side cognition.",
  },
  "F014D-24": {
    ...F014D,
    clause: "§24 Failure Conditions",
    text: "The draft fails if it permits: host or cross-role leakage; engine omniscience → actor omniscience; future/post-basis knowledge leakage; authority = receipt; record exists = actor knows; access = comprehension; narrative revelation creating access; backdated access, retrospective exceptional-route invention or outcome-conditioned background knowledge.",
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

/**
 * R-5 (NEWLY AUTHORIZED; BLUE H-1): the scope an I-002 CLARIFICATION is interpreted within. A clarification settles ONE named, still
 * unresolved operative detail of an already accepted character; so the host is delivered the character's accepted baseline, the precise
 * branch and any prior accepted closure of it, and answers whether the branch is still unresolved and whether the new words state ONLY
 * that detail (the duration of one handling cycle of the ACTUATOR the baseline already accepts) or add or change a capability. Present
 * only in a clarification task: an ordinary classification carries and answers none of it.
 */
export const I002_CLARIFICATION_BRANCH_READINGS = [
  "UNRESOLVED_BEFORE",
  "ALREADY_STATED_IN_BASELINE",
  "CONTRADICTS_PRIOR_CLOSURE",
] as const;
export const I002_CLARIFICATION_SCOPE_READINGS = [
  "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE",
  "ADDS_OR_CHANGES_A_CAPABILITY_OR_ACTUATOR",
  "UNCLEAR",
] as const;
const ClarificationItem = z.strictObject({
  item_id: Id,
  slot: z.enum(REFEREE_CANDIDATE_SLOTS),
  text: z.string().min(1).max(600),
});
export const I002ClarificationContextSchema = z.strictObject({
  branch: Id,
  /** the fixed question the branch puts to the player (never composed by a caller) */
  question: z.string().min(1).max(600),
  /** the character's accepted statements, as the released Existence Contract holds them, in Mirror order */
  baseline: z.array(ClarificationItem).min(1).max(64),
  /** earlier accepted closures of this very branch (none may exist for a new one to be accepted) */
  prior_closures: z
    .array(
      z.strictObject({
        clarification_id: Id,
        statements: z.array(z.string().min(1).max(600)).min(1).max(3),
      }),
    )
    .max(3),
});
export type I002ClarificationContext = z.infer<typeof I002ClarificationContextSchema>;
export const I002ClarificationReadingSchema = z.strictObject({
  branch: z.enum(I002_CLARIFICATION_BRANCH_READINGS),
  scope: z.enum(I002_CLARIFICATION_SCOPE_READINGS),
  /** a verbatim quotation of the BASELINE that states the actuator whose cycle the new words time; required for the compatible scope, else null */
  baseline_ground: z.string().min(8).max(500).nullable(),
  /** a verbatim quotation of the new words that state the duration */
  candidate_ground: z.string().min(8).max(500),
  /** UNCLEAR only: the one narrow question */
  clarification: z.string().min(1).max(300).nullable(),
});
export type I002ClarificationReading = z.infer<typeof I002ClarificationReadingSchema>;

export const I002HostDecisionSchema = z.strictObject({
  task_id: RefereeTaskIdSchema,
  items: z.array(I002ItemDecisionSchema).min(1).max(64),
  /** R-5: present exactly when the task is a clarification (see I002ClarificationContextSchema) */
  clarification: I002ClarificationReadingSchema.optional(),
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
// IR_PHYSICAL_PLACEMENT
// ---------------------------------------------------------------------------------------------

/**
 * What form constitutes the PC, as the PC's own accepted statements say it. The non-`SINGLE_MATERIAL_BODY` modes are the examples
 * I-002 §4.3 itself lists (several same-agency bodies, host-dependent embodiment, distributed substrate, incorporeal manifestation,
 * null/no-current-body state, total-domain/coextensive self); `AMBIGUOUS` is the host saying the statements do not settle it.
 */
export const PHYSICAL_EMBODIMENT_MODES = [
  "SINGLE_MATERIAL_BODY",
  "SEVERAL_SAME_AGENCY_BODIES",
  "HOST_DEPENDENT",
  "DISTRIBUTED_SUBSTRATE",
  "INCORPOREAL",
  "NO_CURRENT_BODY",
  "TOTAL_DOMAIN_COEXTENSIVE",
  "AMBIGUOUS",
] as const;
export type PhysicalEmbodimentMode = (typeof PHYSICAL_EMBODIMENT_MODES)[number];

/** Where the player's own native-presence statement says the character is, relative to the ONE delivered locus. */
export const PHYSICAL_PRESENCE_MODES = [
  "NATIVE_AT_THIS_LOCUS",
  "ELSEWHERE",
  "SEVERAL_LOCI",
  "NON_SPATIAL",
  "BRIDGE_OR_ARRIVAL",
  "AMBIGUOUS",
] as const;
export type PhysicalPresenceMode = (typeof PHYSICAL_PRESENCE_MODES)[number];

/** The kind of a claim, inside the statement, about something that is not the player's own character: Insertion may not invent it (IR §12). */
export const PHYSICAL_DEPENDENCY_KINDS = [
  "INDEPENDENT_ACTOR_COOPERATION",
  "EXTERNAL_RIGHT_OR_ACCESS",
  "OTHER_EXTERNAL_CLAIM",
] as const;
export type PhysicalDependencyKind = (typeof PHYSICAL_DEPENDENCY_KINDS)[number];

/**
 * How such a claim bears on the PHYSICAL presence the statement also states. `CONTINGENT`: the presence at this locus is stated to hold
 * only through the claim (by leave of, because of, for as long as the actor allows), so the physical fact could not be established
 * without accepting the claim, which IR §12 forbids. `CONJUNCTIVE`: the claim is stated ALONGSIDE a presence the player's own words
 * establish by themselves; the presence stands on those words, and the claim is not accepted, not committed and not part of any fact
 * the custody records (it stays what IR §15 calls an unverified assertion).
 */
export const PHYSICAL_CLAIM_BEARINGS = ["CONTINGENT", "CONJUNCTIVE"] as const;
export type PhysicalClaimBearing = (typeof PHYSICAL_CLAIM_BEARINGS)[number];

export const PhysicalHostDecisionSchema = z.strictObject({
  task_id: RefereeTaskIdSchema,
  embodiment: z.strictObject({
    mode: z.enum(PHYSICAL_EMBODIMENT_MODES),
    /** the delivered character statement the reading rests on */
    item_id: Id,
    rule_ids: RuleIds,
    grounds: Grounds,
    /** a verbatim excerpt of that character statement */
    evidence_quote: Quote,
  }),
  presence: z.strictObject({
    mode: z.enum(PHYSICAL_PRESENCE_MODES),
    rule_ids: RuleIds,
    grounds: Grounds,
    /** a verbatim excerpt of the player's native-presence statement */
    evidence_quote: Quote,
  }),
  /**
   * every claim in the statement about an independent actor's cooperation, an external right or another external claim, each with how it
   * bears on the presence; empty when the statement states none. None of them is ever accepted by the answer or by the custody.
   */
  external_claims: z
    .array(
      z.strictObject({
        kind: z.enum(PHYSICAL_DEPENDENCY_KINDS),
        bearing: z.enum(PHYSICAL_CLAIM_BEARINGS),
        rule_ids: RuleIds,
        grounds: Grounds,
        evidence_quote: Quote,
      }),
    )
    .max(6),
  assessments: z.array(IrFactAssessmentSchema).min(1).max(96),
  clarification: z.string().min(1).max(300).nullable(),
});
export type PhysicalHostDecision = z.infer<typeof PhysicalHostDecisionSchema>;

// ---------------------------------------------------------------------------------------------
// F014D_DIRECT_PERCEPTION
// ---------------------------------------------------------------------------------------------

/**
 * Where a premise of the observation question comes from, as the delivered context names it. The host cites ONLY delivered text,
 * each time by a verbatim quotation, and the engine fixes what each kind of premise may establish (see `deriveObservation`):
 *   PC_STATEMENT         one of the accepted character's own I-002 statements (`context.pc`, by `item_id`): the ONLY premise that can
 *                        establish the character's intrinsic sensory faculty (I-002 §4.3: no sensory ability is invented from a label);
 *   PLACEMENT_STATEMENT  the player's confirmed native-presence statement the committed binding preserves verbatim (`context.statement`,
 *                        `ref` = `placement.statement`): may establish the character's exact viewing circumstances when it affirmatively
 *                        states them, as may specific lawful physical-owner evidence. A shared locus and the faculty alone do not;
 *   CURRENT_VIEWING      (only when the World-State physical custodian published one for THIS basis) the owner-published, SUPPORTED current viewing
 *                        ordinary-look feasibility (`context.facts`, `fact_id` `viewing.current`): fixed typed verdict, instant, five-version
 *                        basis and lawful provenance only. GM circumstance prose is not delivered. This kind cannot establish faculty,
 *                        position, orientation, eye state, path or payload; retained as a readable kind, never as sensory evidence;
 *   WORLD_FACT           a committed world, locus or (source-scoped questions only) Source Condition access fact (`context.facts`, by
 *                        `fact_id`): the physical setting, the light, the air path, any obstruction, and the owner-authored access or
 *                        appearance circumstance of the one source the question is scoped to.
 */
export const OBSERVATION_PREMISE_KINDS = [
  "PC_STATEMENT",
  "PLACEMENT_STATEMENT",
  "WORLD_FACT",
  "CURRENT_VIEWING",
] as const;
export type ObservationPremiseKind = (typeof OBSERVATION_PREMISE_KINDS)[number];
/** The `ref` of a PLACEMENT_STATEMENT premise: there is exactly one such statement in a delivered context. */
export const OBSERVATION_PLACEMENT_REF = "placement.statement";
/**
 * The facts every direct-perception question cites, in order: the released character, the binding, the custody, the world and the locus.
 * A question the trusted side scoped to ONE Source Condition cites that source as a sixth, at this index, and never any other.
 */
export const OBSERVATION_BASE_REFS = 5;

export const ObservationPremiseSchema = z.strictObject({
  from: z.enum(OBSERVATION_PREMISE_KINDS),
  ref: Id,
  /** a verbatim excerpt of the cited premise's delivered text */
  evidence_quote: Quote,
});
export type ObservationPremise = z.infer<typeof ObservationPremiseSchema>;

const Trimmed = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((t) => t === t.trim(), "text must not have surrounding whitespace");

/** F-014D §5 step 4 Q2 / §6 step 2: what is established about ONE element of the direct-perception question. */
const ElementOf = <S extends readonly [string, ...string[]]>(states: S) =>
  z.strictObject({
    state: z.enum(states),
    premises: z.array(ObservationPremiseSchema).max(8),
    rule_ids: RuleIds,
    grounds: Grounds,
  });

export const OBSERVATION_FACULTY_STATES = ["ESTABLISHED", "NOT_ESTABLISHED"] as const;
export const OBSERVATION_POSITION_STATES = ["ESTABLISHED", "NOT_ESTABLISHED"] as const;
export const OBSERVATION_PATH_STATES = ["OPEN", "BLOCKED", "NOT_ESTABLISHED"] as const;

/**
 * The minimal perceptible payload (F-014D §6 step 3): the raw appearance only. `source_fact_id` names the ONE delivered world, locus or
 * source fact the appearance is of (the engine pins that committed fact as the event's foreign source); `basis` anchors the appearance in
 * verbatim quotations of delivered WORLD_FACT text. It carries no recognition, function, identity, place name or hidden composition:
 * the schema has no field for them, and the engine refuses any engine reference, and any withheld source value, in the text.
 */
export const ObservationPayloadSchema = z.strictObject({
  source_fact_id: Id,
  referent: Trimmed(200),
  content: Trimmed(500),
  basis: z.array(ObservationPremiseSchema).min(1).max(8),
});
export type ObservationPayload = z.infer<typeof ObservationPayloadSchema>;

export const ObservationHostDecisionSchema = z.strictObject({
  task_id: RefereeTaskIdSchema,
  /** F-014D §5 step 4 Q2: is the character's sight (the relevant sensory modality) established? */
  faculty: ElementOf(OBSERVATION_FACULTY_STATES),
  /** F-014D §6 step 2 "actual sensory position": are the character's own exact viewing circumstances established? */
  position: ElementOf(OBSERVATION_POSITION_STATES),
  /** F-014D §6 step 2 "range/obstruction/channel": is the path from the physical feature to the character open, blocked, or not established? */
  path: ElementOf(OBSERVATION_PATH_STATES),
  /** the raw appearance; null unless the whole direct-perception question is affirmatively answered */
  payload: ObservationPayloadSchema.nullable(),
  /** every delivered world and locus fact assessed exactly once, as in the IR operations */
  assessments: z.array(IrFactAssessmentSchema).min(1).max(96),
  /** material forks the delivered premises leave open, stated explicitly (retained evidence; the engine derives nothing from them) */
  unresolved_forks: z.array(Grounds).max(6),
});
export type ObservationHostDecision = z.infer<typeof ObservationHostDecisionSchema>;

// ---------------------------------------------------------------------------------------------
// GM_SCENE_RESOLUTION
// ---------------------------------------------------------------------------------------------

export const SCENE_KINDS = ["CURRENT_VIEWING"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

/** What the player's request is, as the host reads it against I-001 §8: an ordinary look, or something materially more. */
export const SCENE_REQUEST_CLASSES = [
  "ORDINARY_LOOK",
  "MATERIAL_NEW_COMMITMENT",
  "UNCLEAR",
] as const;
export const SCENE_VIEWING_STATES = ["SUPPORTED", "NOT_SUPPORTED", "NOT_ESTABLISHED"] as const;

/**
 * The premises a scene ruling may rest on. Every premise is a verbatim quotation of DELIVERED text, and the kind fixes what it may
 * establish (see `deriveScene`): the character's baseline only on `PC_STATEMENT`, the confirmed placement only on `PLACEMENT_STATEMENT`,
 * the physical setting only on `WORLD_FACT`. A viewing ruling never rests on the player's REQUEST alone: a narrative declaration is not a
 * physical result.
 */
const ScenePremiseSchema = ObservationPremiseSchema;

const SceneViewingSchema = z.strictObject({
  /** I-001 §8: is the request an ORDINARY look (routine attention, turning, opening the eyes) or a materially new commitment? */
  request: z.strictObject({
    classification: z.enum(SCENE_REQUEST_CLASSES),
    rule_ids: RuleIds,
    grounds: Grounds,
    /** a verbatim excerpt of the delivered request statement; null exactly when no statement was delivered (a bare look) */
    evidence_quote: Quote.nullable(),
  }),
  state: z.enum(SCENE_VIEWING_STATES),
  premises: z.array(ScenePremiseSchema).max(8),
  rule_ids: RuleIds,
  grounds: Grounds,
  /** Explanatory, non-authoritative GM narration retained verbatim; establishes no position, orientation, eye state or other world truth. */
  statement: Trimmed(300).nullable(),
});

export const SceneHostDecisionSchema = z.strictObject({
  task_id: RefereeTaskIdSchema,
  kind: z.enum(SCENE_KINDS),
  viewing: SceneViewingSchema.nullable(),
  /**
   * RETIRED (31 October 2026 Stage A): a scene ruling no longer has an appearance. The only value ever accepted is null (or absent); the
   * field stays readable solely so that a current-viewing ruling retained by an earlier build of this branch, which carried
   * `appearance: null`, still reads.
   */
  appearance: z.null().optional(),
  /** every delivered world and locus fact assessed exactly once, as in the other operations */
  assessments: z.array(IrFactAssessmentSchema).min(1).max(96),
  /** material forks the delivered premises leave open, stated explicitly (retained evidence; the engine derives nothing from them) */
  unresolved_forks: z.array(Grounds).max(6),
});
export type SceneHostDecision = z.infer<typeof SceneHostDecisionSchema>;

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
/** Distinct from the IR verdicts on purpose: a native/compatibility verdict can never be read as a physicality verdict, nor the reverse. */
export const PHYSICAL_VERDICTS = [
  "PHYSICAL_ELIGIBLE",
  "NOT_PHYSICAL_SINGLE_LOCUS",
  "PHYSICAL_WORLD_CONFLICT",
  "PHYSICAL_UNRESOLVED",
] as const;
/**
 * The direct-perception verdicts. Only OBSERVATION_ESTABLISHED can ever be a receipt. OBSERVATION_OBSTRUCTED is the established
 * physical negative (the path is blocked, anchored to quoted world premises); OBSERVATION_UNRESOLVED is everything the delivered
 * premises leave unsettled — a missing faculty or insufficient premises is never read as an obstruction.
 */
export const OBSERVATION_VERDICTS = [
  "OBSERVATION_ESTABLISHED",
  "OBSERVATION_OBSTRUCTED",
  "OBSERVATION_UNRESOLVED",
  "OBSERVATION_WORLD_CONFLICT",
] as const;
/**
 * The scene verdicts. `VIEWING_SUPPORTED` is the only one a physical owner may publish from. The physical question
 * is asked of the BASIS ALONE (no wording): the player's words are classified separately (`LOOK_ORDINARY`, `LOOK_UNCLEAR`, or
 * `PLAYER_CHOICE_REQUIRED`), so a paraphrase can never reopen a physical result already ruled at an unchanged basis. A request that
 * carries a materially new commitment is `PLAYER_CHOICE_REQUIRED`: it is returned to the player, never resolved here. Everything the
 * delivered premises leave unsettled is UNRESOLVED, never an obstruction.
 */
export const SCENE_VERDICTS = [
  "VIEWING_SUPPORTED",
  "VIEWING_NOT_SUPPORTED",
  "VIEWING_UNRESOLVED",
  "PLAYER_CHOICE_REQUIRED",
  "LOOK_ORDINARY",
  "LOOK_UNCLEAR",
  "SCENE_WORLD_CONFLICT",
] as const;
export const RefereeVerdictSchema = z.enum([
  ...I002_VERDICTS,
  ...IR_VERDICTS,
  ...PHYSICAL_VERDICTS,
  ...OBSERVATION_VERDICTS,
  ...SCENE_VERDICTS,
]);
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
    /** R-5: an I-002 CLARIFICATION's delivered scope (baseline, branch, prior closures), so the context re-derives from the record alone; absent for every other task */
    clarification: I002ClarificationContextSchema.optional(),
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
    /** IR / physical placement: sha256 over the player's native-presence statement, and the statement itself, verbatim (physical: the committed binding's) */
    statement_digest: Sha256.nullable(),
    statement: z.string().min(1).max(600).nullable(),
    /** the committed facts the context was built from, at the versions delivered (IR and physical placement; foreign facts are referenced, never copied) */
    refs: z.array(RefereeInputRefSchema).max(8),
  }),
};

/** The observation record's input: the common one plus the canonical time of the basis the question was asked at (a part of the question). */
const ObservationRecordInput = RecordCore.input.extend({ observed_at: CanonicalTimeSchema });

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
  z.strictObject({
    ...RecordCore,
    operation: z.literal(REFEREE_OP_PHYSICAL),
    decision: PhysicalHostDecisionSchema,
    verdict: z.enum(PHYSICAL_VERDICTS),
  }),
  z.strictObject({
    ...RecordCore,
    input: ObservationRecordInput,
    /** the trusted operation context under which the ENGINE validated the answer and derived the verdict; never read from the answer */
    validated_under: z.strictObject({
      role: z.literal(OBSERVATION_RESOLVER_AUTHORITY.role),
      permission: z.literal(OBSERVATION_RESOLVER_AUTHORITY.permission),
    }),
    operation: z.literal(REFEREE_OP_OBSERVATION),
    decision: ObservationHostDecisionSchema,
    verdict: z.enum(OBSERVATION_VERDICTS),
  }),
  z.strictObject({
    ...RecordCore,
    /** the viewing question's canonical basis */
    input: ObservationRecordInput,
    /** the trusted operation context under which the ENGINE validated the answer and derived the verdict; never read from an answer */
    validated_under: z.strictObject({
      role: z.literal(OBSERVATION_RESOLVER_AUTHORITY.role),
      permission: z.literal(OBSERVATION_RESOLVER_AUTHORITY.permission),
    }),
    operation: z.literal(REFEREE_OP_SCENE),
    decision: SceneHostDecisionSchema,
    verdict: z.enum(SCENE_VERDICTS),
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
