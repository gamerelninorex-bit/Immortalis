import {
  ExistenceContractSchema,
  FACET_PC_CAPABILITY_PROFILE,
  FACET_WORLD_FALLBACK_ENTITY,
  OWNER_CAUSAL_DRAW_KERNEL,
  OWNER_DIPLOMACY,
  OWNER_ECONOMY,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_GIP,
  OWNER_KTI,
  OWNER_LOGISTICS,
  OWNER_NAMED_ACTOR,
  OWNER_PC_EXISTENCE,
  OWNER_POPULATION,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  OWNER_TEMPORAL_KERNEL,
  PlayerCharacterBindingSchema,
  WorldLocusSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type ExistenceContract,
  type OwnerFact,
  type PlayerCharacterBinding,
} from "@immortalis/contracts";
import type { CampaignState, WriteAdmission } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { namedActorGroupCheck } from "../actor/admission.ts";
import { causalDrawGroupCheck } from "../causal-draw/admission.ts";
import { diplomacyGroupCheck } from "../diplomacy/admission.ts";
import { economyGroupCheck } from "../economy/admission.ts";
import { epistemicGroupCheck } from "../epistemic/admission.ts";
import { gipGroupCheck } from "../gip/admission.ts";
import { ktiGroupCheck } from "../kti/admission.ts";
import { logisticsGroupCheck } from "../logistics/admission.ts";
import { pcCapabilityGroupCheck } from "../pc-capability/admission.ts";
import { populationGroupCheck } from "../population/admission.ts";
import { productionGroupCheck } from "../production/admission.ts";
import { temporalGroupCheck } from "../temporal/admission.ts";
import { worldEntityGroupCheck } from "../world/fallback-custody.ts";
import { resolveKey, type FactKind } from "./registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "./rejection.ts";

function checkLocus(group: CommitGroup, state: CampaignState, key: string, value: unknown) {
  const locus = WorldLocusSchema.parse(value);
  const worldKey = worldProfileKey(locus.world.entity_id);
  if (
    locus.world.fact_key !== worldKey ||
    key !== worldLocusKey(locus.world.entity_id, locus.locus_id)
  ) {
    return reject("REFERENCE_INVALID", "locus world reference does not match its key identity", {
      key,
    });
  }
  const world = requirePrerequisite(group, state, worldKey, "the world profile");
  return isRejection(world) ? world : null;
}

/**
 * Verifies, from committed facts alone, that a binding's retained coupling basis is sufficient to
 * authorize the represented first activation (IR §6 Step 3 / §5, RC-13). Used by admission when the
 * binding is written and again by verifyCanonicalIntegrity on every load, so the two cannot drift.
 * The schema has already limited the basis to the one supported case (native/already-there,
 * explicit player-authored, role.player commitment); this checks it against the facts it cites:
 *
 *  - the PC contract it was established against is a released Existence Contract (the Character
 *    Mirror was accepted before binding), and
 *  - every pinned version is the version of the committed PC contract, world profile and locus — the
 *    basis was established against these facts, not merely alongside them.
 *
 * Returns a message, or null when sufficient.
 */
export function couplingBasisViolation(
  binding: PlayerCharacterBinding,
  facts: { readonly pc: OwnerFact; readonly world: OwnerFact; readonly locus: OwnerFact },
): string | null {
  if (!ExistenceContractSchema.safeParse(facts.pc.value).success) {
    return "the PC existence contract is not a released Existence Contract";
  }
  const existingActor = existingActorBindingViolation(facts.pc.value);
  if (existingActor) return existingActor;
  const pins = binding.transition.basis.pinned_versions;
  if (
    pins.pc !== facts.pc.version ||
    pins.world !== facts.world.version ||
    pins.locus !== facts.locus.version
  ) {
    return "the coupling basis was not established against the committed PC, world and locus versions";
  }
  return null;
}

/**
 * The ordinary activation path is the FIRST `ACTIVATION` of a freshly generated PC on its explicit, player-authored, native
 * coupling basis. An Existence Contract that compiles an already-existing non-PC actor is a different classification whose
 * control cutover is the Existing-Actor → PC Role Registry handover (PC-Control Handover Contract v1, "Single Commit
 * Point"): not implemented, so this path refuses it rather than reuse a first-activation basis that would present the
 * actor's established state as player-authored. Returns a message for such a contract, or null.
 */
export function existingActorBindingViolation(contractValue: unknown): string | null {
  const contract = ExistenceContractSchema.safeParse(contractValue);
  if (!contract.success || contract.data.existing_actor_compilation === undefined) return null;
  return "the Existence Contract compiles an already-existing actor: ordinary first ACTIVATION is not the Existing-Actor → PC handover, which is not implemented, so the actor's prior owner remains the writable owner";
}

/** The kinds of committed Named-Actor state that identify an already-existing actor as the source of a compilation. */
const EXISTING_ACTOR_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "named_actor_capability_basis",
  "named_actor_capability",
]);

/**
 * The single statement of what an existing-actor compilation must be, given committed facts (PC-Control Handover Contract
 * v1 "Existing Actor → PC" 1, 3, 4 and "Existing-Actor Confirmation Surface"; I-002 §2 and §7). Used by admission when the
 * contract is written and again by verifyCanonicalIntegrity on every load, so the two cannot drift. It judges identity and
 * provenance only, never the sufficiency of the compilation:
 *
 *  - every pinned source is the identified actor's OWN committed state: a Named-Actor owner fact of an accepted source kind
 *    whose key identity is this contract's `pc_id`, owned by the owner the pin names, at exactly the version pinned. So a
 *    fresh Player Character, which has no such state, cannot state the classification, and a pin to another actor's state,
 *    to the PC owner's own state or to any other owner's state fails closed;
 *  - the compilation is no blank-slate player-authorship pass (Existing Actor → PC step 4: "Do not open a fresh
 *    biography-authorship pass for already-established world history"; Confirmation Surface: undisplayed compiled detail
 *    is SAFELY-INHERITED / compiler-owned inference, not player-authored): every claim is SAFELY-INHERITED and there are
 *    no player overrides.
 *
 * Returns a message, or null when the compilation holds (or the contract is no compilation).
 */
export function existingActorCompilationViolation(
  contract: ExistenceContract,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): string | null {
  const compilation = contract.existing_actor_compilation;
  if (compilation === undefined) return null;
  const claims = [
    contract.identity_agency,
    ...(contract.contact.kind === "CONTACT_ANCHOR"
      ? contract.contact.surfaces
      : [contract.contact.statement]),
    contract.embodiment_topology,
    contract.continuity_rule,
    ...contract.baseline_exception.safely_inherited,
    ...contract.baseline_exception.player_overrides,
    ...contract.entry_envelope.items,
  ];
  if (
    contract.baseline_exception.player_overrides.length > 0 ||
    claims.some((c) => c.provenance !== "SAFELY-INHERITED")
  ) {
    return "an existing-actor compilation is no player-authorship pass over already-established state: every claim is SAFELY-INHERITED and there are no player overrides";
  }
  for (const pin of compilation.source_state) {
    const resolved = resolveKey(pin.fact_key);
    if (
      !resolved ||
      !EXISTING_ACTOR_SOURCE_KINDS.has(resolved.kind.id) ||
      resolved.kind.owner !== OWNER_NAMED_ACTOR ||
      resolved.ids[0] !== contract.pc_id
    ) {
      return `a source is the identified actor's own committed Named-Actor state: ${pin.fact_key}`;
    }
    const fact = facts.get(pin.fact_key);
    if (!fact || fact.owner !== pin.owner || fact.owner !== OWNER_NAMED_ACTOR) {
      return `a source is committed and owned by the Named-Actor owner it names: ${pin.fact_key}`;
    }
    if (fact.version !== pin.version) {
      return `a source is pinned at its exact committed version: ${pin.fact_key}`;
    }
  }
  return null;
}

function checkExistenceContract(group: CommitGroup, state: CampaignState, value: unknown) {
  const contract = ExistenceContractSchema.parse(value);
  if (contract.existing_actor_compilation === undefined) return null;
  // the sources are foreign facts: read at their current version and depended on, never copied
  for (const pin of contract.existing_actor_compilation.source_state) {
    const source = requirePrerequisite(group, state, pin.fact_key, "the existing actor's state");
    if (isRejection(source)) return source;
  }
  const violation = existingActorCompilationViolation(contract, state.facts);
  return violation
    ? reject("REFERENCE_INVALID", violation, { key: pcExistenceContractKey(contract.pc_id) })
    : null;
}

function checkBinding(group: CommitGroup, state: CampaignState, value: unknown) {
  const b = PlayerCharacterBindingSchema.parse(value);
  const pcKey = pcExistenceContractKey(b.active_pc.entity_id);
  const worldKey = worldProfileKey(b.coupling.world.entity_id);
  const locusKey = worldLocusKey(b.coupling.world.entity_id, b.coupling.locus.entity_id);
  if (
    b.active_pc.fact_key !== pcKey ||
    b.coupling.world.fact_key !== worldKey ||
    b.coupling.locus.fact_key !== locusKey
  ) {
    return reject("REFERENCE_INVALID", "binding references do not match their key identities");
  }
  // Prerequisites are checked in dependency order: PC and world before the locus that hangs off it.
  const pc = requirePrerequisite(group, state, pcKey, "the released PC existence contract");
  if (isRejection(pc)) return pc;
  const existingActor = existingActorBindingViolation(pc.fact.value);
  if (existingActor) return reject("REFERENCE_INVALID", existingActor, { key: pcKey });
  const world = requirePrerequisite(group, state, worldKey, "the world profile");
  if (isRejection(world)) return world;
  const locus = requirePrerequisite(group, state, locusKey, "the world locus");
  if (isRejection(locus)) return locus;
  // The locus must be a locus of the bound world (its own committed reference, not the caller's word).
  const committed = WorldLocusSchema.safeParse(locus.fact.value);
  if (!committed.success || !canonicalEqual(committed.data.world, b.coupling.world)) {
    return reject("REFERENCE_INVALID", "the locus does not belong to the world being coupled", {
      key: locusKey,
    });
  }
  const insufficient = couplingBasisViolation(b, {
    pc: pc.fact,
    world: world.fact,
    locus: locus.fact,
  });
  if (insufficient)
    return reject("REFERENCE_INVALID", insufficient, { key: PLAYER_CHARACTER_BINDING_KEY });
  return null;
}

/**
 * IM-03 admission for the Canonical World Identity & Owner Foundation. For every write it enforces:
 *
 *  1. Key space: the key belongs to exactly one registered fact kind and that kind's owner/facet is
 *     the group's. There is no fallback owner (IA-03, RC-02).
 *  2. Typed value: the value satisfies the kind's strict schema, and the identity embedded in the
 *     key is the identity inside the value (stable canonical identity).
 *  3. Sealed canon: the sealed kinds are create-only. Overwriting a sealed world baseline, a released
 *     Existence Contract or the binding needs an owner-defined amendment/transition mechanism
 *     (WG seal; I-002 Intrinsic Amendment Event; IR transitions) that is not implemented.
 *  4. Dependency direction: a locus needs its world; the binding needs the PC contract, the world
 *     and the locus — all already committed, read at their current versions, and depended upon. The
 *     binding group writes only the binding, so it cannot create its own prerequisites (IR: "Binding
 *     cannot feed backward to create its own prerequisite").
 *  5. Coupling basis: the binding must carry the already-established IR coupling (native/already-
 *     there, explicit player-authored) pinned to those exact facts; coexistence of the PC, world and
 *     locus is not itself a lawful basis (see couplingBasisViolation). A binding without it is
 *     rejected by the typed value (VALUE_INVALID), so a raw store.commit cannot bypass the rule.
 *
 *  6. Existing-actor compilation: a contract carrying the explicit `existing_actor_compilation` classification must pin
 *     (read and depend on) the identified actor's own committed Named-Actor state and carry only SAFELY-INHERITED claims
 *     (see existingActorCompilationViolation); ordinary first ACTIVATION refuses such a contract (see
 *     existingActorBindingViolation), because the binding commit is the control cutover and the Existing-Actor → PC handover
 *     that would make it lawful is not implemented.
 *
 * Pure: a function of (group, state) only.
 */
export const canonicalAdmission: WriteAdmission = {
  check(group, state) {
    for (const w of group.writes) {
      const resolved = resolveKey(w.key);
      if (!resolved) {
        return reject(
          "KEY_NOT_ADMITTED",
          "key is outside every registered key space; there is no fallback owner",
          {
            key: w.key,
          },
        );
      }
      const { kind, ids } = resolved;
      if (kind.owner !== w.owner || kind.facet !== w.facet) {
        return reject("KEY_NOT_ADMITTED", "key belongs to a different owner/facet", {
          key: w.key,
          owner: kind.owner,
          facet: kind.facet,
        });
      }
      if (kind.lifecycle === "SEALED" && w.expected_version !== 0) {
        return reject(
          "AMENDMENT_NOT_SUPPORTED",
          "sealed canon cannot be overwritten; no amendment mechanism is implemented",
          { key: w.key },
        );
      }
      const parsed = kind.valueSchema.safeParse(w.value);
      if (!parsed.success) {
        return reject("VALUE_INVALID", `value violates the ${kind.id} contract`, {
          key: w.key,
          issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }
      const mismatch = identityMismatch(kind, ids, parsed.data);
      if (mismatch) return reject("VALUE_INVALID", mismatch, { key: w.key });
      const dependent = dependencyCheck(kind, group, state, w.key, parsed.data);
      if (dependent) return dependent;
    }
    // IM-02 kernel groups: cross-fact rules over the whole group (a transaction with its state,
    // boundary-index and engaged-object updates).
    if (group.owner === OWNER_TEMPORAL_KERNEL) return temporalGroupCheck(group, state);
    // IM-04 Population groups: conservation and Cohort derivation are re-derived over the whole group.
    if (group.owner === OWNER_POPULATION) return populationGroupCheck(group, state);
    // IM-05 Production groups: conservation, claims and completion are re-derived over the whole group.
    if (group.owner === OWNER_PRODUCTION) return productionGroupCheck(group, state);
    // IM-06 Economy groups: the request is re-derived from its demand and realized access from the accepted chain.
    if (group.owner === OWNER_ECONOMY) return economyGroupCheck(group, state);
    // IM-05 Logistics groups: a commitment, a dispatch, a delivery result and a retirement are each re-derived.
    if (group.owner === OWNER_LOGISTICS) return logisticsGroupCheck(group, state);
    // IM-07 Named-Actor capability groups: an establishment basis and a capability close are each re-derived.
    if (group.owner === OWNER_NAMED_ACTOR) return namedActorGroupCheck(group, state);
    // IM-07 PC capability profile groups (a facet of the one I-002 PC owner): a received basis and a PC Capability Close are each re-derived.
    if (group.owner === OWNER_PC_EXISTENCE && group.facet === FACET_PC_CAPABILITY_PROFILE)
      return pcCapabilityGroupCheck(group, state);
    // IM-10 Epistemic Access groups: an access event and a packet formation (packet + sealed provenance) are each re-derived.
    if (group.owner === OWNER_EPISTEMIC_ACCESS) return epistemicGroupCheck(group, state);
    // IM-09 KTI groups: a development object, a transfer basis and a Transfer Package result close are each re-derived.
    if (group.owner === OWNER_KTI) return ktiGroupCheck(group, state);
    // IM-06 GIP groups: one Institution Identity, Office / Authority Locus, Authority Scope Binding or Governance Instrument establishment, each created once.
    if (group.owner === OWNER_GIP) return gipGroupCheck(group, state);
    // IM-06 Diplomacy groups: one External Recognition, Externalized Claim / Dispute, Relation Edge or Framework establishment, created once.
    if (group.owner === OWNER_DIPLOMACY) return diplomacyGroupCheck(group, state);
    // IM-12 Causal Draw provenance groups (F-027-CD1): one precommit or one result, each created once and re-derived.
    if (group.owner === OWNER_CAUSAL_DRAW_KERNEL) return causalDrawGroupCheck(group, state);
    // IM-03 World-State fallback physical-entity custody: an acceptance is re-derived from the completion, and an
    // entity transition from its causing result and the accepted entity.
    if (group.owner === OWNER_WORLD_STATE && group.facet === FACET_WORLD_FALLBACK_ENTITY)
      return worldEntityGroupCheck(group, state);
    return null;
  },
};

export function identityMismatch(
  kind: FactKind,
  ids: readonly string[],
  value: unknown,
): string | null {
  const v = value as Record<string, unknown>;
  switch (kind.id) {
    case "world_profile":
      return v["world_id"] === ids[0] ? null : "world_id does not match the key";
    case "world_locus":
      return v["locus_id"] === ids[1] && (v["world"] as { entity_id: string }).entity_id === ids[0]
        ? null
        : "locus identity does not match the key";
    case "pc_existence_contract":
      return v["pc_id"] === ids[0] ? null : "pc_id does not match the key";
    case "player_character_binding":
    case "temporal_state":
    case "temporal_boundary_index":
      return null;
    case "temporal_object":
      return v["object_id"] === ids[0] ? null : "object_id does not match the key";
    case "resolution_transaction":
    case "temporal_transaction_authority":
      return v["transaction_id"] === ids[0] ? null : "transaction_id does not match the key";
    case "population_ledger":
    case "population_close":
      return v["ledger_id"] === ids[0] ? null : "ledger_id does not match the key";
    case "production_reserve":
      return v["reserve_id"] === ids[0] ? null : "reserve_id does not match the key";
    case "production_claim":
      return v["claim_id"] === ids[0] ? null : "claim_id does not match the key";
    case "production_operation":
    case "production_completion":
      return v["operation_id"] === ids[0] ? null : "operation_id does not match the key";
    case "economy_demand":
      return v["demand_envelope_id"] === ids[0]
        ? null
        : "demand_envelope_id does not match the key";
    case "economy_request":
      return v["request_id"] === ids[0] ? null : "request_id does not match the key";
    case "economy_realization":
      return v["demand_envelope_id"] === ids[0]
        ? null
        : "demand_envelope_id does not match the key";
    case "world_fallback_entity": {
      const locality = v["locality"] as { world: { entity_id: string } };
      return v["entity_id"] === ids[1] && locality.world.entity_id === ids[0]
        ? null
        : "entity identity does not match the key";
    }
    case "world_entity_transition": {
      const locus = v["locus"] as { from: { world: { entity_id: string } } };
      const entity = v["entity"] as { entity_id: string };
      return entity.entity_id === ids[1] && locus.from.world.entity_id === ids[0]
        ? null
        : "transition identity does not match the key";
    }
    case "logistics_commitment": {
      const moved = v["moved"] as { entity_id: string };
      const origin = v["origin"] as { world: { entity_id: string } };
      return moved.entity_id === ids[1] && origin.world.entity_id === ids[0]
        ? null
        : "commitment identity does not match the key";
    }
    case "logistics_transfer": {
      const moved = v["moved"] as { fact_key: string; entity_id: string };
      return moved.entity_id === ids[1] && moved.fact_key === `world/${ids[0]}/entity/${ids[1]}`
        ? null
        : "transfer identity does not match the key";
    }
    case "logistics_delivery": {
      const subject = v["subject"] as { entity_id: string };
      const to = (v["outcome"] as { destination: { world: { entity_id: string } } }).destination;
      return subject.entity_id === ids[1] && to.world.entity_id === ids[0]
        ? null
        : "delivery identity does not match the key";
    }
    case "named_actor_capability_basis":
    case "named_actor_capability":
      return v["actor_id"] === ids[0] && v["capability_id"] === ids[1]
        ? null
        : "actor and capability identity does not match the key";
    case "pc_capability_basis":
    case "pc_capability":
      return v["pc_id"] === ids[0] && v["capability_id"] === ids[1]
        ? null
        : "PC and capability identity does not match the key";
    case "epistemic_access_event":
      return v["event_id"] === ids[0] ? null : "event identity does not match the key";
    case "epistemic_accessible_packet":
      return v["recipient"] === ids[1] ? null : "recipient identity does not match the key";
    case "epistemic_sealed_provenance":
      return v["recipient"] === ids[1] &&
        (v["event"] as { fact_key: string }).fact_key === `access/${ids[0]}/event`
        ? null
        : "event and recipient identity does not match the key";
    case "gip_institution_identity":
      return v["institution_id"] === ids[0] ? null : "institution_id does not match the key";
    case "gip_office_authority_locus":
      return v["institution_id"] === ids[0] && v["office_id"] === ids[1]
        ? null
        : "institution and office identity does not match the key";
    case "gip_scope_binding":
      return v["institution_id"] === ids[0] &&
        v["office_id"] === ids[1] &&
        v["scope_binding_id"] === ids[2]
        ? null
        : "institution, office and scope binding identity does not match the key";
    case "gip_governance_instrument":
      return v["instrument_id"] === ids[0] ? null : "instrument_id does not match the key";
    case "diplomacy_external_recognition":
      return v["recognition_id"] === ids[0] ? null : "recognition_id does not match the key";
    case "diplomacy_claim_dispute":
      return v["dispute_id"] === ids[0] ? null : "dispute_id does not match the key";
    case "diplomacy_relation_edge":
      return v["relation_id"] === ids[0] ? null : "relation_id does not match the key";
    case "diplomacy_framework":
      return v["framework_id"] === ids[0] ? null : "framework_id does not match the key";
    case "kti_development_object":
      return v["object_id"] === ids[0]
        ? null
        : "development-object identity does not match the key";
    case "kti_transfer_basis":
    case "kti_transfer_package":
      return v["package_id"] === ids[0] ? null : "package identity does not match the key";
    case "causal_draw_precommit":
    case "causal_draw_result":
      return v["draw_id"] === `cdraw:v1:${ids[0]}` ? null : "draw_id does not match the key";
    case "population_cohort": {
      const ref = v["ref"] as { cohort_id: string; scope: { ledger_id: string } };
      return ref.cohort_id === ids[1] && ref.scope.ledger_id === ids[0]
        ? null
        : "cohort identity does not match the key";
    }
  }
}

function dependencyCheck(
  kind: FactKind,
  group: CommitGroup,
  state: CampaignState,
  key: string,
  value: unknown,
): Rejection | null {
  switch (kind.id) {
    case "world_locus":
      return checkLocus(group, state, key, value);
    case "pc_existence_contract":
      return checkExistenceContract(group, state, value);
    case "player_character_binding":
      return checkBinding(group, state, value);
    default:
      return null;
  }
}
