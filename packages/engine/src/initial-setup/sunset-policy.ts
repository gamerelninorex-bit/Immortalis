/**
 * BOOTSTRAP_SUNSET_POLICY_V9 — the COMPLETE explicit, normative policy of OPTION_A_V9 (Initial Locality Bootstrap v0.9 companion,
 * "CPAA Projection and Canonical Sunset"): one row for each of the 84 baseline registry kinds and the six bootstrap kinds (90 rows).
 * GENERATED verbatim from the companion table; no row is synthesized from a default, and a changed permissive policy needs review.
 * Completeness is an executable test obligation (tests/conformance/initial-completion-sunset-policy.test.ts imports the actual
 * ALL_FACT_KINDS and compares the exact ID sets), not a default-expansion procedure. A runtime unknown kind is UNREVIEWED_BLOCK.
 *
 * The `effect` text is the companion's exact wording, kept for the reviewed-policy comparison.
 */
export const SUNSET_POLICIES = [
  "END_NON_PC_COUPLING",
  "END_NON_PC_PLACEMENT",
  "END_NON_PC_PRESENCE",
  "OWNER_CHECKS_ONLY",
  "RECHECK_PC_STANDING",
  "RECHECK_POPULATION",
  "RECHECK_SCENE",
  "SELECTED_KEY_UNCHANGED",
  "SELECTED_SOURCE_FIELDS",
  "UNREVIEWED_BLOCK",
] as const;
export type SunsetPolicy = (typeof SUNSET_POLICIES)[number];

export interface SunsetPolicyRow {
  readonly kind: string;
  readonly policy: SunsetPolicy;
  readonly effect: string;
}

export const BOOTSTRAP_SUNSET_POLICY_V9: readonly SunsetPolicyRow[] = [
  {
    kind: "actor_physical_presence",
    policy: "END_NON_PC_PRESENCE",
    effect:
      "Post-Completion ActorPhysicalPresenceSchema value v ends the exception iff `sameSelectedRefs(v.world,v.locus,C)`; paths are `value.world.entity_id/fact_key` and `value.locus.entity_id/fact_key`.",
  },
  {
    kind: "actor_raw_sensory_state",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "actor_setup_placement",
    policy: "END_NON_PC_PLACEMENT",
    effect:
      "Post-Completion ActorSetupPlacementSchema value v ends the exception iff `sameSelectedRefs(v.world,v.locus,C)`; paths are `value.world.entity_id/fact_key` and `value.locus.entity_id/fact_key`.",
  },
  {
    kind: "causal_draw_precommit",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "causal_draw_result",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "culture_adjudication_decision",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "culture_shared_meaning",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "culture_update_context",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "diplomacy_claim_dispute",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "diplomacy_external_recognition",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "diplomacy_framework",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "diplomacy_relation_edge",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "economy_demand",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "economy_encumbrance",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "Not a natural-source rights producer by analogy. No new claim without an adopted typed producer/binding; actual foreign-owner checks remain.",
  },
  {
    kind: "economy_holding",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "Not a natural-source rights producer by analogy. No new claim without an adopted typed producer/binding; actual foreign-owner checks remain.",
  },
  {
    kind: "economy_realization",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "economy_reallocation",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "Not a natural-source rights producer by analogy. No new claim without an adopted typed producer/binding; actual foreign-owner checks remain.",
  },
  {
    kind: "economy_request",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "epistemic_access_event",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "This record alone does not assert new non-PC presence or rights. Preserve its exact World-State/PC/Epistemic owner, standing, scope, provenance, knowledge, reach and temporal checks; it grants no physical locomotion or unsupported perception.",
  },
  {
    kind: "epistemic_accessible_packet",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "This record alone does not assert new non-PC presence or rights. Preserve its exact World-State/PC/Epistemic owner, standing, scope, provenance, knowledge, reach and temporal checks; it grants no physical locomotion or unsupported perception.",
  },
  {
    kind: "epistemic_sealed_provenance",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "This record alone does not assert new non-PC presence or rights. Preserve its exact World-State/PC/Epistemic owner, standing, scope, provenance, knowledge, reach and temporal checks; it grants no physical locomotion or unsupported perception.",
  },
  {
    kind: "gip_governance_instrument",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "gip_institution_identity",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "gip_office_authority_locus",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "gip_scope_binding",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "gip_sunset_enrollment",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "initial_locality_completion",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct presence/rights sunset. Exact sealed-source, reservation, scope, authority, phase, parser and replay checks remain mandatory; infrastructure never supplies a new premise by mere existence.",
  },
  {
    kind: "initial_setup_disposition",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct presence/rights sunset. Exact sealed-source, reservation, scope, authority, phase, parser and replay checks remain mandatory; infrastructure never supplies a new premise by mere existence.",
  },
  {
    kind: "initial_setup_grant",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct presence/rights sunset. Exact sealed-source, reservation, scope, authority, phase, parser and replay checks remain mandatory; infrastructure never supplies a new premise by mere existence.",
  },
  {
    kind: "initial_setup_input",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct presence/rights sunset. Exact sealed-source, reservation, scope, authority, phase, parser and replay checks remain mandatory; infrastructure never supplies a new premise by mere existence.",
  },
  {
    kind: "initial_setup_invocation",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct presence/rights sunset. Exact sealed-source, reservation, scope, authority, phase, parser and replay checks remain mandatory; infrastructure never supplies a new premise by mere existence.",
  },
  {
    kind: "initial_setup_response",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct presence/rights sunset. Exact sealed-source, reservation, scope, authority, phase, parser and replay checks remain mandatory; infrastructure never supplies a new premise by mere existence.",
  },
  {
    kind: "kti_development_object",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "kti_transfer_basis",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "kti_transfer_package",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "logistics_commitment",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "logistics_delivery",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "logistics_transfer",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "named_actor_capability",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "Capability alone is not location or a source claim. Actual linking through placement/coupling/presence invokes that linking kind's adverse policy; all owner checks remain.",
  },
  {
    kind: "named_actor_capability_basis",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "Capability alone is not location or a source claim. Actual linking through placement/coupling/presence invokes that linking kind's adverse policy; all owner checks remain.",
  },
  {
    kind: "pc_capability",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_capability_basis",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_collection_cessation",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_collection_commitment",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_collection_cycle_attestation",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_collection_mechanism",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_collection_reach_decision",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_collection_request",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_delegated_clarification",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_existence_contract",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_intrinsic_clarification",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "pc_movement_commitment",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "This record alone does not assert new non-PC presence or rights. Preserve its exact World-State/PC/Epistemic owner, standing, scope, provenance, knowledge, reach and temporal checks; it grants no physical locomotion or unsupported perception.",
  },
  {
    kind: "pc_movement_request",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "This record alone does not assert new non-PC presence or rights. Preserve its exact World-State/PC/Epistemic owner, standing, scope, provenance, knowledge, reach and temporal checks; it grants no physical locomotion or unsupported perception.",
  },
  {
    kind: "player_character_binding",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "population_close",
    policy: "RECHECK_POPULATION",
    effect:
      "Re-derive existing World-State/Population coverage-currentness and representations. Missing/stale/incompatible coverage withholds; this kind alone proves no new non-PC presence or labor.",
  },
  {
    kind: "population_cohort",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "population_ledger",
    policy: "RECHECK_POPULATION",
    effect:
      "Re-derive existing World-State/Population coverage-currentness and representations. Missing/stale/incompatible coverage withholds; this kind alone proves no new non-PC presence or labor.",
  },
  {
    kind: "population_pc_occupancy",
    policy: "RECHECK_PC_STANDING",
    effect:
      "Existing PC location/occupancy/membership checks remain mandatory. This kind alone does not assert non-PC presence; changed location or invalid standing can still withhold.",
  },
  {
    kind: "population_pc_representation",
    policy: "RECHECK_PC_STANDING",
    effect:
      "Existing PC location/occupancy/membership checks remain mandatory. This kind alone does not assert non-PC presence; changed location or invalid standing can still withhold.",
  },
  {
    kind: "population_workforce_scope",
    policy: "RECHECK_POPULATION",
    effect:
      "Re-derive existing World-State/Population coverage-currentness and representations. Missing/stale/incompatible coverage withholds; this kind alone proves no new non-PC presence or labor.",
  },
  {
    kind: "production_claim",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_completion",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_extraction",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_extraction_basis",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_operation",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_pc_collection_lapse",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_pc_collection_termination",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_pc_collection_work",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_reserve",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "production_source_account",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct solitude sunset from lawful source drawdown/delivery; all source, conservation and actual foreign-engagement/admission refusals remain effective.",
  },
  {
    kind: "production_source_delta",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct solitude sunset from lawful source drawdown/delivery; all source, conservation and actual foreign-engagement/admission refusals remain effective.",
  },
  {
    kind: "referee_decision",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct presence/rights sunset. Exact sealed-source, reservation, scope, authority, phase, parser and replay checks remain mandatory; infrastructure never supplies a new premise by mere existence.",
  },
  {
    kind: "resolution_transaction",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "temporal_boundary_index",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "temporal_object",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "temporal_state",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "temporal_transaction_authority",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct new non-PC presence/rights assertion from this kind alone. All existing owner, standing, scope, foreign-engagement, conservation, timing and due-event checks remain effective; actual adverse outcomes still withhold.",
  },
  {
    kind: "world_acoustic_emission",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "world_actor_coupling",
    policy: "END_NON_PC_COUPLING",
    effect:
      "Post-Completion ExistingActorCouplingSchema value v ends the exception iff `sameSelectedRefs(v.coupling.world,v.coupling.locus,C)`; paths are `value.coupling.world.entity_id/fact_key` and `value.coupling.locus.entity_id/fact_key`.",
  },
  {
    kind: "world_corridor",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "world_entity_transition",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "world_fallback_entity",
    policy: "UNREVIEWED_BLOCK",
    effect:
      "A post-Completion admission conservatively withholds this bounded exception until its effect has an explicitly reviewed policy. Existing canon is retained; this is not rejection of the other owner's lawful write.",
  },
  {
    kind: "world_locus",
    policy: "SELECTED_KEY_UNCHANGED",
    effect:
      "A change to the exact selected world/locus key invalidates the Completion basis; an unrelated key has no direct effect.",
  },
  {
    kind: "world_pc_current_viewing",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "This record alone does not assert new non-PC presence or rights. Preserve its exact World-State/PC/Epistemic owner, standing, scope, provenance, knowledge, reach and temporal checks; it grants no physical locomotion or unsupported perception.",
  },
  {
    kind: "world_pc_locus_custody",
    policy: "RECHECK_PC_STANDING",
    effect:
      "Existing PC location/occupancy/membership checks remain mandatory. This kind alone does not assert non-PC presence; changed location or invalid standing can still withhold.",
  },
  {
    kind: "world_profile",
    policy: "SELECTED_KEY_UNCHANGED",
    effect:
      "A change to the exact selected world/locus key invalidates the Completion basis; an unrelated key has no direct effect.",
  },
  {
    kind: "world_scene_closure",
    policy: "RECHECK_SCENE",
    effect:
      "The Option A projection's own write does not sunset its premise. Validate the exact rule, Completion dependencies and owner-derived compatible closure at the actual pre-state; stale/adverse/incompatible closure withholds. No recursive requirement to have this output before its first projection.",
  },
  {
    kind: "world_setup_closure",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct presence/rights sunset. Exact sealed-source, reservation, scope, authority, phase, parser and replay checks remain mandatory; infrastructure never supplies a new premise by mere existence.",
  },
  {
    kind: "world_source_condition",
    policy: "SELECTED_SOURCE_FIELDS",
    effect:
      "For the selected source, changes to source_key, locality, dimension, material_class, depth, establishment or access_facts invalidate the premise. Lawful recoverable/delivered/exhaustion-only changes do not directly sunset it; availability/conservation checks still apply.",
  },
  {
    kind: "world_source_delivery",
    policy: "OWNER_CHECKS_ONLY",
    effect:
      "No direct solitude sunset from lawful source drawdown/delivery; all source, conservation and actual foreign-engagement/admission refusals remain effective.",
  },
];
