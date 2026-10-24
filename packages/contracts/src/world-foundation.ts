import { z } from "zod";
import { Id, Version } from "./ids.ts";

/**
 * Canonical World Identity & Owner Foundation — typed values for the four canonical facts of this
 * slice. Each schema is `strict`: an unknown field is rejected, never carried, so a value cannot
 * smuggle a copy of a foreign owner's fact (RC-02 guard) or unmodelled state into canon (IA-02).
 *
 * Governing sources (exact pins live in the owner registry and spec/f027/spec-lock.json):
 *   WG   World Generation §Output Packet — World Profile, §Interface Handoffs, §Ownership Guards
 *   I-002 Player Character Generation §2, §4 (six-part minimum Existence Contract), §7, §21, §26
 *   IR   Player–World Insertion §2, §6 step 6, §17; PC-Control Handover Contract; F-014C Role Registry
 *   RC-02 OwnerFact, RC-13 IRB-01 Binding
 *
 * Nothing here is a game rule. Where a source lists something as "may include" the field is a free
 * label, not a closed vocabulary; where a source names literal alternatives (reference modes, claim
 * provenance classes, NO-CONTACT) they are carried as literals.
 */

/**
 * Stable identity of a world, locus or player character. A technical encoding constraint only:
 * identifiers are embedded in fact keys, so they must not contain the key separator.
 */
export const EntityId = Id.regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "invalid entity identifier");

/** Free prose exactly as authored: non-empty, no leading/trailing whitespace. */
export const Text = z
  .string()
  .min(1)
  .refine((s) => s === s.trim(), "text must not have surrounding whitespace");

// ---------------------------------------------------------------------------------------------
// Owners and facets (IM-03 / IM-07). Technical identifiers; the assignment itself is the source's.
// ---------------------------------------------------------------------------------------------

/** World Generation / World-State (IM-03). */
export const OWNER_WORLD_STATE = "world_state";
export const FACET_WORLD_PROFILE = "world_profile";
export const FACET_WORLD_LOCUS = "world_locus";
/** I-002 Existence Contract (IM-07). */
export const OWNER_PC_EXISTENCE = "pc_existence";
export const FACET_EXISTENCE_CONTRACT = "existence_contract";
/** Role Registry / F-014C — durable holder of the operative role.player_character binding. */
export const OWNER_ROLE_REGISTRY = "role_registry";
export const FACET_PLAYER_CHARACTER_BINDING = "player_character_binding";

// ---------------------------------------------------------------------------------------------
// Fact keys. One key space per fact kind; a key space belongs to exactly one owner/facet.
// ---------------------------------------------------------------------------------------------

export const worldProfileKey = (worldId: string): string => `world/${worldId}/profile`;
export const worldLocusKey = (worldId: string, locusId: string): string =>
  `world/${worldId}/locus/${locusId}`;
export const pcExistenceContractKey = (pcId: string): string => `pc/${pcId}/existence-contract`;
/** One slot: an active PC reference or NULL (RC-13). One active binding per role.player (Handover). */
export const PLAYER_CHARACTER_BINDING_KEY = "role-registry/binding/role.player_character";

// ---------------------------------------------------------------------------------------------
// References. Foreign facts are referenced, never copied (RC-02 guard).
// ---------------------------------------------------------------------------------------------

export const FactRefSchema = z.strictObject({ fact_key: Id, entity_id: EntityId });
export type FactRef = z.infer<typeof FactRefSchema>;

// ---------------------------------------------------------------------------------------------
// World Profile (WG Output Packet) — owner world_state / facet world_profile.
// ---------------------------------------------------------------------------------------------

/**
 * Reference / Causal Basis, by WG "Step 4 — Resolve Reference Mode". `D. Original / Delegated`:
 * only the ORIGINAL half is representable here. A delegated world needs a sealed delegation record
 * (WG Delegation Adapter), which this slice does not implement, so it fails closed.
 */
export const ReferenceCausalBasisSchema = z.discriminatedUnion("mode", [
  z.strictObject({
    mode: z.literal("EXACT_NAMED_SETTING"),
    setting: Text,
    /** era/version/continuity, only where materially divergent (WG Step 4A) */
    era_version_continuity: Text.nullable(),
  }),
  z.strictObject({
    mode: z.literal("INSPIRED_BY"),
    donor: Text,
    /** the minimum useful structural grammar; never imported canon (WG Step 4B) */
    structural_grammar: Text,
  }),
  z.strictObject({ mode: z.literal("FACTUAL_HISTORICAL"), scope: Text }),
  z.strictObject({ mode: z.literal("ORIGINAL"), established_canon: Text }),
]);

/** A world-side constraint. `aspect` is a free label (WG: "may include broad locus, era, domain…"). */
export const WorldConstraintSchema = z.strictObject({ aspect: Id, statement: Text });

export const WorldProfileSchema = z.strictObject({
  world_id: EntityId,
  /** World Identity / Premise: the broad reality being simulated, in the player's wording */
  premise: Text,
  reference_causal_basis: ReferenceCausalBasisSchema,
  /** only departures already needed to constrain present causality; empty = none */
  material_world_law_departures: z.array(Text),
  /** minimum world-side state Insertion needs; must not solve PC identity or insertion geometry */
  insertion_supporting_constraints: z.array(WorldConstraintSchema),
});
export type WorldProfile = z.infer<typeof WorldProfileSchema>;

// ---------------------------------------------------------------------------------------------
// World locus — owner world_state / facet world_locus. Not asserted to be a World-State Node.
// ---------------------------------------------------------------------------------------------

/**
 * S1-P1 W2a — the OPTIONAL typed, geometry-free, whole-locus acoustic eligibility of one locus (WG "S1-P1 — BLUE executable
 * lowering freeze: paired W1 raw-hearing and W2 acoustic-source premises", native pin 2026-10-23T12:26:49.599Z, "W2: pre-seal
 * typed acoustic geometry-free constraint and bounded emission" and the emitter-source executability clarification).
 *
 * It is authored ONLY inside the original `world_locus` source value, before that world's `world_setup_closure`; admission and
 * historical verification refuse every later or backfilled profile. Absence is lawful and means no P1 full-locus premise, so an
 * existing saved locus is neither rewritten nor invalidated. The three `coverage_basis` statements are independent
 * source-authored physical claims about this specific locus, not interpreted `constraints` text; `exclusions` is empty in this
 * first stage (any actual or unknown exclusion is nonqualifying); `environmental_emitter_basis` states the concrete
 * environmental source able to produce one bounded impulse, never that the impulse happened. Type-checking proves a bounded
 * owner-authored physical premise, not a propagation simulation: there is no position, direction, ray, attenuation figure,
 * neighbouring locus, path, duration or recurrence field in which one could be stated.
 */
export const AIRBORNE_SOUND = "AIRBORNE_SOUND" as const;

export const EnvironmentalEmitterBasisSchema = z.strictObject({
  /** the concrete environmental source's identity: the one an emission must name (never an actor, a PC or a fallback entity) */
  emitter_id: EntityId,
  physical_source_statement: Text,
  bounded_impulse_possible_statement: Text,
});
export type EnvironmentalEmitterBasis = z.infer<typeof EnvironmentalEmitterBasisSchema>;

export const AcousticProfileV1Schema = z
  .strictObject({
    channel: z.literal(AIRBORNE_SOUND),
    scope: z.literal("FULL_LOCUS"),
    coverage: z.literal("FULL_LOCUS_STRONG"),
    coverage_basis: z.strictObject({
      whole_locus_reach: Text,
      no_material_obstruction: Text,
      no_material_attenuation: Text,
    }),
    exclusions: z.tuple([]),
    environmental_emitter_basis: EnvironmentalEmitterBasisSchema,
  })
  .superRefine((p, ctx) => {
    // "independently authored": a technical encoding of independence is that no two physical statements are the same text
    const statements = [
      p.coverage_basis.whole_locus_reach,
      p.coverage_basis.no_material_obstruction,
      p.coverage_basis.no_material_attenuation,
      p.environmental_emitter_basis.physical_source_statement,
      p.environmental_emitter_basis.bounded_impulse_possible_statement,
    ];
    if (new Set(statements).size !== statements.length) {
      ctx.addIssue({
        code: "custom",
        message:
          "the coverage basis and the environmental emitter basis are independently authored: no two physical statements are the same text",
        path: ["coverage_basis"],
      });
    }
  });
export type AcousticProfileV1 = z.infer<typeof AcousticProfileV1Schema>;

export const WorldLocusSchema = z.strictObject({
  locus_id: EntityId,
  /** the world this locus belongs to (reference, not a copy) */
  world: FactRefSchema,
  /** the broad locus as authored */
  designation: Text,
  constraints: z.array(WorldConstraintSchema),
  /**
   * S1-P1 W2a: present only for a locus authored together with its typed whole-locus acoustic eligibility before its world's
   * setup closure (see AcousticProfileV1Schema); absent for every other locus, whose serialization is unchanged. Optional by
   * encoding, not by meaning: its absence is "no P1 full-locus premise".
   */
  acoustic_profile_v1: AcousticProfileV1Schema.optional(),
});
export type WorldLocus = z.infer<typeof WorldLocusSchema>;

// ---------------------------------------------------------------------------------------------
// I-002 Existence Contract — owner pc_existence / facet existence_contract.
// ---------------------------------------------------------------------------------------------

/**
 * Claim provenance (I-002 §7). Only the two classes that may lawfully define intrinsic canon
 * without a further record are representable. PLAYER-ADMITTED (host/personal context, §3) and
 * PLAYER-DELEGATED (needs a Delegation Commit Record, §9) are NOT implemented and fail closed;
 * SYSTEM-HYPOTHESIS, SETTING-PREMISE, PC-RELATIONAL STANDING, ACTOR-STANCE CLAIM, SETTING-LAW
 * PROPOSAL and ORIGIN-MEMORY are not intrinsic canon. This is the host-context firewall.
 */
export const IntrinsicProvenance = z.enum(["PLAYER-AUTHORED", "SAFELY-INHERITED"]);

const claimOf = <P extends z.ZodType>(provenance: P) =>
  z.strictObject({ statement: Text, provenance });
export const ClaimSchema = claimOf(IntrinsicProvenance);
export type Claim = z.infer<typeof ClaimSchema>;

/** §4.2: at least one world-facing contact surface, or an explicit NO-CONTACT (never omitted). */
export const ContactSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("CONTACT_ANCHOR"), surfaces: z.array(ClaimSchema).min(1) }),
  z.strictObject({ kind: z.literal("NO_CONTACT"), statement: ClaimSchema }),
]);

/**
 * The explicit identification of an Existence Contract that COMPILES an already-existing, lawfully non-PC actor into the
 * minimum I-002 form, instead of generating a fresh Player Character (PC-Control Handover Contract v1, W3-CP3 Blue Repair
 * Overlay, "Existing Actor → PC" steps 1, 3, 4; "Single Commit Point"). Its presence is the whole distinction, and it is
 * strict so that no other classification can be stated (in particular no binding mode, readiness condition, score or timer:
 * this slice emits no I-002 v2.4 DEFERRED / ACTIVE-LIMITED binding mode, because none of its ownership semantics depends on one).
 *
 * `source_state` pins the already-existing authoritative actor/entity state the compilation was made from, by exact owner,
 * fact key and version. Foreign facts are referenced and never copied (RC-02 guard), so nothing of the foreign owner's state
 * can be carried in this value. Which owners'/kinds' facts may serve as a source, and that each is the identified actor's
 * own committed state, is verified by admission and load verification (they know the registry); the schema fixes only the
 * shape.
 *
 * What the classification does NOT do: it does not transfer, end or copy the prior owner's writable state — the binding
 * commit is the only control/ownership cutover, and that Role Registry transition is the distinct EXISTING_ACTOR_HANDOVER (see PlayerCharacterBindingSchema).
 */
export const EXISTING_ACTOR_COMPILATION = "EXISTING_ACTOR_COMPILATION";

export const ExistingActorSourcePinSchema = z.strictObject({
  owner: Id,
  fact_key: Id,
  version: Version.min(1),
});
export type ExistingActorSourcePin = z.infer<typeof ExistingActorSourcePinSchema>;

export const ExistingActorCompilationSchema = z
  .strictObject({
    classification: z.literal(EXISTING_ACTOR_COMPILATION),
    source_state: z.array(ExistingActorSourcePinSchema).min(1),
  })
  .superRefine((c, ctx) => {
    if (new Set(c.source_state.map((s) => s.fact_key)).size !== c.source_state.length) {
      ctx.addIssue({
        code: "custom",
        message: "a source fact is pinned once",
        path: ["source_state"],
      });
    }
  });
export type ExistingActorCompilation = z.infer<typeof ExistingActorCompilationSchema>;

export const PLAYER_CHOICE_AUTHORITY = {
  role: "role.player",
  permission: "permission.player_choice.commit",
} as const;

export const ExistenceContractSchema = z.strictObject({
  pc_id: EntityId,
  /** §4.1 identity / agency boundary */
  identity_agency: ClaimSchema,
  /** §4.2 narrative contact anchor / NO-CONTACT */
  contact: ContactSchema,
  /** §4.3 embodiment topology */
  embodiment_topology: ClaimSchema,
  /** §4.4 continuity rule */
  continuity_rule: ClaimSchema,
  /** §4.5 baseline / exception boundary */
  baseline_exception: z.strictObject({
    safely_inherited: z.array(claimOf(z.literal("SAFELY-INHERITED"))),
    player_overrides: z.array(claimOf(z.literal("PLAYER-AUTHORED"))),
    hypotheses: z.array(Text),
    unresolved: z.array(Text),
  }),
  /** §4.6 entry-envelope boundary; empty = nothing accompanies the PC */
  entry_envelope: z.strictObject({ items: z.array(ClaimSchema) }),
  /**
   * Present only for the compilation of an already-existing non-PC actor (see ExistingActorCompilationSchema); absent for a
   * freshly generated Player Character, whose serialization is unchanged. Optional by encoding, not by meaning: the field's
   * absence is the fresh-generation classification.
   */
  existing_actor_compilation: ExistingActorCompilationSchema.optional(),
  /**
   * Generation Hand-Off (§21, §26): the contract is RELEASED only with the Character Mirror
   * acceptance record. The engine records what was displayed and accepted verbatim; whether that
   * set is the complete mandatory confirmation set is an I-001/I-002 interface concern that is not
   * implemented here.
   */
  release: z.strictObject({
    status: z.literal("RELEASED"),
    mirror_acceptance: z.strictObject({
      accepted_by: z.strictObject({
        role: z.literal(PLAYER_CHOICE_AUTHORITY.role),
        permission: z.literal(PLAYER_CHOICE_AUTHORITY.permission),
      }),
      items_displayed_and_accepted: z.array(Id).min(1),
    }),
  }),
});
export type ExistenceContract = z.infer<typeof ExistenceContractSchema>;

// ---------------------------------------------------------------------------------------------
// RC-13 IRB-01 Binding — owner role_registry / facet player_character_binding.
// ---------------------------------------------------------------------------------------------

/**
 * The already-established insertion fact that authorizes a first activation (IR §3 input 3, §5,
 * §6 Step 3). Insertion consumes an established coupling; it never invents one ("If no bridge
 * exists, do not invent one"; "No silent invention of material insertion facts"). The binding
 * therefore carries the evidence of why the PC is lawfully coupled to the locus, not just that a PC,
 * a world and a locus exist.
 *
 * Only the smallest lawful case is representable, and everything else fails closed:
 *  - `bridge`: IR Step 3's "native/already-there — no transfer bridge required". Established
 *    transfer/approach, deferred activation, recurrent binding, degenerate coextensive binding and
 *    NULL are NOT implemented, and no bridge mechanism (portal, summoning, death…) can be stated.
 *  - `established_by`: IR §5 precedence item 1, "explicit player-authored fact". Strong semantic
 *    implication, an authoritative fact already established elsewhere, clarification and explicit
 *    delegation (which needs a Delegation Commit Record) are NOT implemented.
 *  - `authored_under`: a player commitment is fixed only by role.player +
 *    permission.player_choice.commit (Runtime/Translation v0.2 §5.2 rule 1), never by a persona.
 *  - `statement`: the fact in the player's authored wording, preserved verbatim.
 */
const insertionFactShape = {
  bridge: z.literal("NATIVE_ALREADY_THERE"),
  established_by: z.literal("EXPLICIT_PLAYER_AUTHORED_FACT"),
  authored_under: z.strictObject({
    role: z.literal(PLAYER_CHOICE_AUTHORITY.role),
    permission: z.literal(PLAYER_CHOICE_AUTHORITY.permission),
  }),
  statement: Text,
};
export const InsertionFactSchema = z.strictObject(insertionFactShape);
export type InsertionFact = z.infer<typeof InsertionFactSchema>;

/**
 * The persisted coupling basis: the insertion fact plus the exact versions of the PC contract,
 * world profile and locus it was established against, so it can be re-verified from committed
 * state alone after reload. Admission requires each pin to equal the current version of a
 * committed prerequisite, so a committed binding never carries version 0.
 */
export const CouplingBasisSchema = z.strictObject({
  ...insertionFactShape,
  pinned_versions: z.strictObject({ pc: Version, world: Version, locus: Version }),
});
export type CouplingBasis = z.infer<typeof CouplingBasisSchema>;

/**
 * The Existing-Actor → PC handover transition (PC-Control Handover Contract v1, W3-CP3 Blue Repair Overlay: "Single Commit
 * Point", "Existing Actor → PC" 1–5; IR §6 Step 6 and §17; RC-13 migration/handover data; I-002 v2.4 "Embodiment Before
 * Operative PC Control"). It is the Role Registry binding commit of an ALREADY-EXISTING, lawfully non-PC actor, and it is
 * explicitly distinct from `ACTIVATION`, the first activation of a freshly generated PC.
 *
 * It states no insertion fact, bridge, player-authored statement or placement of its own: the world and locus are exactly
 * those of the actor's already-committed World-State coupling (`world-state/actor/<actor_id>/coupling`), which this
 * transition CONSUMES (IR §5 item 3, "authoritative world/PC fact already established"). A rival placement is therefore not
 * representable. The basis pins the exact committed versions it was established against — the released compilation
 * contract, the world profile, the locus and the coupling — so it can be re-verified from committed state alone after reload.
 * Admission requires each pin to equal the current version of a committed fact, so a committed handover never carries 0.
 */
export const EXISTING_ACTOR_HANDOVER = "EXISTING_ACTOR_HANDOVER";

export const HandoverBasisSchema = z.strictObject({
  pinned_versions: z.strictObject({
    pc: Version,
    world: Version,
    locus: Version,
    coupling: Version,
  }),
});
export type HandoverBasis = z.infer<typeof HandoverBasisSchema>;

/**
 * RC-13 `intrinsic_authority_migration`: an EXACT reference (owner, fact key, committed version) to already-established
 * authoritative state the handover consumed. Foreign state is preserved by reference, never copied (RC-02 guard), and the
 * Role Registry owns no migration ledger: the referenced facts stay exactly where and as they were committed (the actor's
 * prior facts remain provenance/history). A missing referent is pinned at 0 so it surfaces as PREREQUISITE_MISSING at
 * admission; no committed binding carries 0.
 */
export const AuthoritativeStateRefSchema = z.strictObject({
  owner: Id,
  fact_key: Id,
  version: Version,
});
export type AuthoritativeStateRef = z.infer<typeof AuthoritativeStateRefSchema>;

/**
 * Two transitions are representable: the first ACTIVATION of a PC generated by I-002 (empty migration), and the
 * Existing-Actor → PC handover (a non-empty migration of exact references). Deactivation, release, transfer, reactivation,
 * replacement/succession/fork and deferred activation are not implemented, so their transitions, any non-null
 * `prior_binding` / `replacement_binding` and any migration on an ACTIVATION cannot be expressed and fail closed.
 *
 * The NULL state (no active PC) is the absence of the fact, never a written record. RC-13's
 * "effective commit" is the fact's provenance (group/intent) and its receipt; its "lawful
 * initiating choice/transition" is `transition`, which carries the basis it consumed.
 */
export const PlayerCharacterBindingSchema = z
  .strictObject({
    binding_slot: z.literal("role.player_character"),
    /** active PC reference (RC-13) */
    active_pc: FactRefSchema,
    /** active locus relation (IR §6 step 6): the coupled world and locus, by reference */
    coupling: z.strictObject({ world: FactRefSchema, locus: FactRefSchema }),
    /** lawful initiating transition (RC-13), with the established basis it consumed */
    transition: z.discriminatedUnion("type", [
      z.strictObject({ type: z.literal("ACTIVATION"), basis: CouplingBasisSchema }),
      z.strictObject({ type: z.literal(EXISTING_ACTOR_HANDOVER), basis: HandoverBasisSchema }),
    ]),
    prior_binding: z.null(),
    replacement_binding: z.null(),
    /** empty for ACTIVATION; for the handover, the exact references to the established state it consumed */
    intrinsic_authority_migration: z.array(AuthoritativeStateRefSchema),
    /** writer identity/permission (RC-13): the authorized archivist path, never a persona */
    writer: z.strictObject({
      role: z.literal("role.archivist"),
      permission: z.literal("permission.canon.write"),
    }),
  })
  .superRefine((b, ctx) => {
    const migration = b.intrinsic_authority_migration;
    if (b.transition.type === "ACTIVATION" && migration.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "a first ACTIVATION migrates no intrinsic authority",
        path: ["intrinsic_authority_migration"],
      });
    }
    if (b.transition.type === EXISTING_ACTOR_HANDOVER && migration.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "an existing-actor handover references the established state it consumed",
        path: ["intrinsic_authority_migration"],
      });
    }
    if (new Set(migration.map((m) => m.fact_key)).size !== migration.length) {
      ctx.addIssue({
        code: "custom",
        message: "a migrated fact is referenced once",
        path: ["intrinsic_authority_migration"],
      });
    }
  });
export type PlayerCharacterBinding = z.infer<typeof PlayerCharacterBindingSchema>;

// ---------------------------------------------------------------------------------------------
// Publication inputs (authored setup). Not facts; validated at the service boundary.
// ---------------------------------------------------------------------------------------------

/**
 * Identity and lineage of one publication. All of it is caller-supplied: idempotence (RC-16) needs
 * the same intent to be re-presentable after a lost reply or restart, so nothing is generated from a
 * clock or RNG. `basis` and `secrecy` are RC-02 material fields for which F-027 defines no
 * vocabulary; they are authored setup input, preserved verbatim and never defaulted (IA-02).
 */
export const PublicationSchema = z.strictObject({
  group_id: Id,
  intent_id: Id,
  cause: Id,
  basis: Id,
  secrecy: Id,
});
export type Publication = z.infer<typeof PublicationSchema>;

/** What a binding couples: identities only. The referenced facts are read, never copied. */
export const BindingTargetSchema = z.strictObject({
  pc_id: EntityId,
  world_id: EntityId,
  locus_id: EntityId,
});
export type BindingTarget = z.infer<typeof BindingTargetSchema>;

/**
 * What an Existing-Actor → PC handover names: the identities only, which must equal the actor's committed coupling. There
 * is deliberately no insertion fact, bridge or placement field (the coupling is the authoritative basis), so a rival
 * placement is rejected as an unknown field.
 */
export const HandoverTargetSchema = BindingTargetSchema;
export type HandoverTarget = BindingTarget;

/** Structural view of a schema failure, so consumers need not depend on the schema library. */
export interface SchemaIssues {
  readonly issues: readonly { readonly path: readonly PropertyKey[]; readonly message: string }[];
}
/** Structural view of a schema: consumers validate values without importing the schema library. */
export interface ValueSchema<T = unknown> {
  safeParse(
    value: unknown,
  ):
    | { readonly success: true; readonly data: T }
    | { readonly success: false; readonly error: SchemaIssues };
  parse(value: unknown): T;
}
