import {
  EXISTING_ACTOR_HANDOVER,
  ExistenceContractSchema,
  ExistingActorCouplingSchema,
  FACET_PC_CAPABILITY_PROFILE,
  FACET_PC_COLLECTION_MECHANISM,
  FACET_PC_INTRINSIC_CLARIFICATION,
  FACET_PC_VOLUNTARY_COMMITMENT,
  FACET_POPULATION_PC_OCCUPANCY,
  FACET_POPULATION_WORKFORCE_SCOPE,
  FACET_WORLD_SCENE_CLOSURE,
  pcCollectionRequestId,
  FACET_WORLD_FALLBACK_ENTITY,
  FACET_WORLD_LOCUS,
  FACET_WORLD_SOURCE_CONDITION,
  OWNER_CAUSAL_DRAW_KERNEL,
  OWNER_DIPLOMACY,
  OWNER_ECONOMY,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_GIP,
  OWNER_CULTURE,
  OWNER_CULTURE_ADJUDICATION_KERNEL,
  OWNER_REFEREE_KERNEL,
  OWNER_KTI,
  OWNER_LOGISTICS,
  OWNER_NAMED_ACTOR,
  OWNER_PC_EXISTENCE,
  OWNER_POPULATION,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  OWNER_TEMPORAL_KERNEL,
  PlayerCharacterBindingSchema,
  WorldCorridorSchema,
  WorldLocusSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  actorSetupPlacementKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  type CommitGroup,
  type ExistenceContract,
  type OwnerFact,
  type PlayerCharacterBinding,
} from "@immortalis/contracts";
import type { CampaignState, WriteAdmission } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { namedActorGroupCheck } from "../actor/admission.ts";
import { existingActorSourceViolation } from "../actor/derive.ts";
import { causalDrawGroupCheck } from "../causal-draw/admission.ts";
import { diplomacyGroupCheck } from "../diplomacy/admission.ts";
import { economyGroupCheck } from "../economy/admission.ts";
import { epistemicGroupCheck } from "../epistemic/admission.ts";
import { gipGroupCheck } from "../gip/admission.ts";
import { cultureGroupCheck } from "../culture/admission.ts";
import { cultureAdjudicationGroupCheck } from "../culture-adjudication/admission.ts";
import { refereeGroupCheck, refereeQualificationViolation } from "../referee/admission.ts";
import { ktiGroupCheck } from "../kti/admission.ts";
import { logisticsGroupCheck } from "../logistics/admission.ts";
import { pcCapabilityGroupCheck } from "../pc-capability/admission.ts";
import {
  pcCollectionGroupCheck,
  sceneClosureGroupCheck,
  workforceScopeGroupCheck,
  pcOccupancyGroupCheck,
  pcReachGroupCheck,
} from "../pc-collection/admission.ts";
import { pcMovementGroupCheck } from "../pc-movement/derive.ts";
import { populationGroupCheck } from "../population/admission.ts";
import { productionGroupCheck } from "../production/admission.ts";
import { isDrawdownProductionKey, sourceDrawdownGroupCheck } from "../source-drawdown/admission.ts";
import { temporalGroupCheck } from "../temporal/admission.ts";
import { existingActorCouplingViolation } from "../world/actor-coupling.ts";
import {
  PRESENCE_EXCLUSION,
  presenceBearing,
  worldActorPresenceHistoricalCheck,
} from "../world/actor-presence.ts";
import {
  acousticProfileLocusViolation,
  auditoryPremisesHistoricalCheck,
  worldAcousticEmissionGroupCheck,
} from "../world/auditory-premises.ts";
import { worldCorridorViolation } from "../world/corridor.ts";
import { worldEntityGroupCheck } from "../world/fallback-custody.ts";
import { worldSourceGroupCheck } from "../world/source-condition.ts";
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
  if (isRejection(world)) return world;
  // S1-P1 W2a: a typed acoustic profile is a pre-seal source authored only with the original locus commit
  if (locus.acoustic_profile_v1 !== undefined) {
    const violation = acousticProfileLocusViolation(key, locus, state.facts);
    if (violation) return reject("REFERENCE_INVALID", violation, { key });
  }
  return null;
}

function checkCorridor(group: CommitGroup, state: CampaignState, key: string, value: unknown) {
  const c = WorldCorridorSchema.parse(value);
  // the world and both endpoints are read at their current versions and depended on, never created here, in dependency order
  for (const [pin, what] of [
    [c.world.fact_key, "the world profile"],
    [c.from.fact_key, "the corridor's origin locus"],
    [c.to.fact_key, "the corridor's destination locus"],
  ] as const) {
    const required = requirePrerequisite(group, state, pin, what);
    if (isRejection(required)) return required;
  }
  const violation = worldCorridorViolation(key, value, state.facts);
  return violation ? reject("REFERENCE_INVALID", violation, { key }) : null;
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
  if (binding.transition.type === EXISTING_ACTOR_HANDOVER) {
    return "the binding is not a first ACTIVATION: the Existing-Actor → PC handover is judged by its own rule";
  }
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
 * control cutover is the distinct Existing-Actor → PC Role Registry handover (PC-Control Handover Contract v1, "Single Commit
 * Point"; see `existingActorHandoverViolation`): this path refuses it rather than reuse a first-activation basis that would
 * present the actor's established state as player-authored. Returns a message for such a contract, or null.
 */
export function existingActorBindingViolation(contractValue: unknown): string | null {
  const contract = ExistenceContractSchema.safeParse(contractValue);
  if (!contract.success || contract.data.existing_actor_compilation === undefined) return null;
  return "the Existence Contract compiles an already-existing actor: ordinary first ACTIVATION is not the Existing-Actor → PC handover, which is its own EXISTING_ACTOR_HANDOVER transition, so the actor's prior owner remains the writable owner";
}

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
  return existingActorSourceViolation(contract.pc_id, compilation.source_state, facts);
}

/** The exact references an Existing-Actor → PC handover must carry (RC-13 `intrinsic_authority_migration`), in order. */
export function expectedHandoverMigration(
  coupling: OwnerFact,
  contract: ExistenceContract,
): readonly { owner: string; fact_key: string; version: number }[] {
  return [
    { owner: coupling.owner, fact_key: coupling.key, version: coupling.version },
    ...(contract.existing_actor_compilation?.source_state.map((s) => ({ ...s })) ?? []),
  ];
}

/**
 * The single statement of what the Existing-Actor → PC Role Registry handover must be, given the committed facts as they
 * stood BEFORE the binding commit (PC-Control Handover Contract v1 "Single Commit Point", "Existing Actor → PC" 1–5; IR §5
 * item 3 and §6 Step 6; RC-13 migration data; WG "existing-actor → PC" clause). Used by admission when the binding is
 * written and again by load verification, so the two cannot drift. It judges identity, ownership and provenance only:
 *
 *  - the PC's contract is a released I-002 Existence Contract carrying the explicit `EXISTING_ACTOR_COMPILATION`
 *    classification for this same identity, and the compilation still holds against committed state (so a fresh PC, a
 *    missing or malformed compilation, or one whose pinned actor state is stale or foreign, cannot be handed over);
 *  - the same actor's already-committed World-State coupling exists and is the authoritative world/locus basis: it still
 *    holds as an existing non-PC actor's coupling (`existingActorCouplingViolation`, the one statement the coupling
 *    uses) and the binding's world and locus are EXACTLY the coupling's. No placement is created, inferred or accepted
 *    from the caller, so there is no rival placement;
 *  - the basis pins the exact committed versions of the contract, world, locus and coupling it consumed;
 *  - the migration data is exactly the references to the established state consumed — the coupling and the compilation's
 *    pinned actor state — each at its exact committed version; nothing is copied and nothing is invented.
 *
 * It never writes, ends or copies anything: the actor's prior facts stay where and as committed (provenance/history), and
 * no capability moves. Returns a message, or null when the handover holds (or the binding is no handover).
 */
export function existingActorHandoverViolation(
  binding: PlayerCharacterBinding,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">,
): string | null {
  const t = binding.transition;
  if (t.type !== EXISTING_ACTOR_HANDOVER) return null;
  const actorId = binding.active_pc.entity_id;
  const pcFact = facts.get(pcExistenceContractKey(actorId));
  const contract = pcFact ? ExistenceContractSchema.safeParse(pcFact.value) : undefined;
  if (!pcFact || !contract?.success) {
    return "the PC existence contract is not a released Existence Contract";
  }
  if (contract.data.existing_actor_compilation === undefined) {
    return "the Existence Contract is no existing-actor compilation: a freshly generated PC's control begins with ordinary ACTIVATION, never the handover";
  }
  const compilation = existingActorCompilationViolation(contract.data, facts);
  if (compilation) return compilation;

  const couplingKey = worldActorCouplingKey(actorId);
  const couplingFact = facts.get(couplingKey);
  const coupling = couplingFact
    ? ExistingActorCouplingSchema.safeParse(couplingFact.value)
    : undefined;
  if (!couplingFact || !coupling?.success) {
    return "the actor's authoritative World-State coupling is not committed: the handover consumes it and never creates or infers a placement";
  }
  const held = existingActorCouplingViolation(couplingKey, coupling.data, facts);
  if (held) return `the actor's committed coupling does not hold: ${held}`;
  if (
    !canonicalEqual(binding.coupling.world, coupling.data.coupling.world) ||
    !canonicalEqual(binding.coupling.locus, coupling.data.coupling.locus)
  ) {
    return "the handover's actor, world and locus are exactly the committed coupling's: a rival placement is not accepted";
  }
  const world = facts.get(binding.coupling.world.fact_key);
  const locus = facts.get(binding.coupling.locus.fact_key);
  if (!world || !locus) return "the coupled world and locus are committed";
  const pins = t.basis.pinned_versions;
  if (
    pins.pc !== pcFact.version ||
    pins.world !== world.version ||
    pins.locus !== locus.version ||
    pins.coupling !== couplingFact.version
  ) {
    return "the handover was not established against the committed contract, world, locus and coupling versions";
  }
  if (
    !canonicalEqual(
      binding.intrinsic_authority_migration,
      expectedHandoverMigration(couplingFact, contract.data),
    )
  ) {
    return "the handover's migration data is exactly the exact references to the coupling and the compilation's pinned actor state it consumed";
  }
  return null;
}

/**
 * An identity already coupled to a world locus as an existing non-PC actor (the Existing-Actor World-State Coupling Anchor)
 * is under lawful non-PC ownership, so it cannot be re-authored as a FRESH Player Character: that would be a blank-slate
 * authorship pass over already-established state and, with a first ACTIVATION, a second authoritative current locus for the
 * same identity. Only the explicit existing-actor compilation (the Handover Contract's compile step) may name it. Returns a
 * message when `contract` is a fresh contract for an identity that is already coupled, else null.
 */
export function coupledActorFreshContractViolation(
  contract: ExistenceContract,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "has">,
): string | null {
  if (contract.existing_actor_compilation !== undefined) return null;
  if (presenceBearing(contract.pc_id, facts) || facts.has(actorSetupPlacementKey(contract.pc_id)))
    return `a fresh Player Character cannot re-author an identity that holds a setup placement or physical presence: ${PRESENCE_EXCLUSION}`;
  return facts.has(worldActorCouplingKey(contract.pc_id))
    ? "the identity is already coupled to a world locus as an existing non-PC actor: a fresh Player Character cannot re-author it, and only the existing-actor compilation may name it"
    : null;
}

function checkExistenceContract(group: CommitGroup, state: CampaignState, value: unknown) {
  const contract = ExistenceContractSchema.parse(value);
  // a release that cites a referee decision must be the one that decision qualifies (a release citing none is simply not attested)
  const qualification = refereeQualificationViolation(group, (k) => state.facts.get(k), "RELEASE", {
    contract,
  });
  if (qualification)
    return reject(qualification.code, qualification.message, {
      key: pcExistenceContractKey(contract.pc_id),
    });
  const coupled = coupledActorFreshContractViolation(contract, state.facts);
  if (coupled)
    return reject("REFERENCE_INVALID", coupled, { key: pcExistenceContractKey(contract.pc_id) });
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
  // a presence-bearing non-PC actor is refused in BOTH branches before the binding commits, so no PC-custody write can follow
  if (presenceBearing(b.active_pc.entity_id, state.facts)) {
    return reject("REFERENCE_INVALID", PRESENCE_EXCLUSION, { key: PLAYER_CHARACTER_BINDING_KEY });
  }
  // a first ACTIVATION that cites a referee decision must be the one that decision qualifies
  const qualification = refereeQualificationViolation(group, (k) => state.facts.get(k), "BIND", {
    binding: b,
  });
  if (qualification)
    return reject(qualification.code, qualification.message, { key: PLAYER_CHARACTER_BINDING_KEY });
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
  const handover = b.transition.type === EXISTING_ACTOR_HANDOVER;
  if (!handover) {
    const existingActor = existingActorBindingViolation(pc.fact.value);
    if (existingActor) return reject("REFERENCE_INVALID", existingActor, { key: pcKey });
  }
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
  if (handover) {
    // The handover consumes already-established foreign state: the actor's committed coupling and the state migrated by
    // reference. Each is read at its current version and depended on (never copied, never created here); the group
    // writes only the binding, which is the one commit point (Single Commit Point).
    const couplingKey = worldActorCouplingKey(b.active_pc.entity_id);
    const coupling = requirePrerequisite(
      group,
      state,
      couplingKey,
      "the actor's committed World-State coupling",
    );
    if (isRejection(coupling)) return coupling;
    for (const ref of b.intrinsic_authority_migration) {
      if (ref.fact_key === couplingKey) continue;
      const migrated = requirePrerequisite(
        group,
        state,
        ref.fact_key,
        "the established state the handover migrates by reference",
      );
      if (isRejection(migrated)) return migrated;
    }
    const violation = existingActorHandoverViolation(b, state.facts);
    return violation
      ? reject("REFERENCE_INVALID", violation, { key: PLAYER_CHARACTER_BINDING_KEY })
      : null;
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
 *     existingActorBindingViolation), because the binding commit is the control cutover and only the distinct
 *     Existing-Actor → PC handover transition makes it lawful.
 *  7. Existing-actor handover: a binding whose transition is `EXISTING_ACTOR_HANDOVER` must consume the same actor's committed
 *     World-State coupling as its authoritative world/locus basis and migrate exact references to the established state
 *     by reference (see existingActorHandoverViolation). It is the single commit point after which the Named-Actor
 *     boundary (`actorBoundaryViolation`) refuses further actor-side writes; nothing before it changes that owner.
 *
 * Pure: a function of (group, state) only.
 */
export const canonicalAdmission: WriteAdmission = {
  // Checkpoint evidence is reusable only under this same historical rule policy. Any semantic
  // change to R1 or S1-P1 historical verification must change this identity (and force strict replay).
  historyVerificationId:
    "R1-stage-one-v1.1@2026-10-23T09:27:39.157Z+S1-P1@2026-10-23T12:26:49.599Z",
  verifyHistorical(group, state) {
    return (
      worldActorPresenceHistoricalCheck(group, state) ??
      auditoryPremisesHistoricalCheck(group, state)
    );
  },
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
    if (group.owner === OWNER_POPULATION)
      return group.facet === FACET_POPULATION_PC_OCCUPANCY
        ? pcOccupancyGroupCheck(group, state)
        : group.facet === FACET_POPULATION_WORKFORCE_SCOPE
          ? workforceScopeGroupCheck(group, state)
          : populationGroupCheck(group, state);
    // IM-05 Production groups: conservation, claims and completion are re-derived over the whole group.
    if (group.owner === OWNER_PRODUCTION)
      return group.writes.some((w) => isDrawdownProductionKey(w.key))
        ? sourceDrawdownGroupCheck(group, state)
        : productionGroupCheck(group, state);
    // IM-06 Economy groups: the request is re-derived from its demand and realized access from the accepted chain.
    if (group.owner === OWNER_ECONOMY) return economyGroupCheck(group, state);
    // IM-05 Logistics groups: a commitment, a dispatch, a delivery result and a retirement are each re-derived.
    if (group.owner === OWNER_LOGISTICS) return logisticsGroupCheck(group, state);
    // IM-07 Named-Actor capability groups: an establishment basis and a capability close are each re-derived.
    if (group.owner === OWNER_NAMED_ACTOR) return namedActorGroupCheck(group, state);
    // IM-07 PC capability profile groups (a facet of the one I-002 PC owner): a received basis and a PC Capability Close are each re-derived.
    if (group.owner === OWNER_PC_EXISTENCE && group.facet === FACET_PC_CAPABILITY_PROFILE)
      return pcCapabilityGroupCheck(group, state);
    // IM-07 PC movement groups (a third facet of the one I-002 PC owner): the player's commitment-of-record and the PC-owned request are each re-derived.
    if (group.owner === OWNER_PC_EXISTENCE && group.facet === FACET_PC_VOLUNTARY_COMMITMENT)
      return group.writes.some((w) => resolveKey(w.key)?.kind.id.startsWith("pc_collection_"))
        ? pcCollectionGroupCheck(group, state)
        : pcMovementGroupCheck(group, state);
    // CPAA-C1 v0.2 PROVISIONAL: the P-1 intrinsic exact-cycle mechanism (a further facet of the one PC owner), re-derived.
    if (group.owner === OWNER_PC_EXISTENCE && group.facet === FACET_PC_COLLECTION_MECHANISM)
      return pcCollectionGroupCheck(group, state);
    // R-5: the prospective intrinsic clarification (a further facet of the one PC owner), re-derived.
    if (group.owner === OWNER_PC_EXISTENCE && group.facet === FACET_PC_INTRINSIC_CLARIFICATION)
      return pcCollectionGroupCheck(group, state);
    // IM-10 Epistemic Access groups: an access event and a packet formation (packet + sealed provenance) are each re-derived.
    if (group.owner === OWNER_EPISTEMIC_ACCESS) return epistemicGroupCheck(group, state);
    // IM-09 KTI groups: a development object, a transfer basis and a Transfer Package result close are each re-derived.
    if (group.owner === OWNER_KTI) return ktiGroupCheck(group, state);
    // IM-09 Culture groups: a sealed Social Update Context and a Communicative Convention Close are each re-derived.
    if (group.owner === OWNER_CULTURE) return cultureGroupCheck(group, state);
    // IM-06 GIP groups: one Institution Identity, Office / Authority Locus, Authority Scope Binding or Governance Instrument establishment, each created once.
    if (group.owner === OWNER_GIP) return gipGroupCheck(group, state);
    // IM-06 Diplomacy groups: one External Recognition, Externalized Claim / Dispute, Relation Edge or Framework establishment, created once.
    if (group.owner === OWNER_DIPLOMACY) return diplomacyGroupCheck(group, state);
    // IM-12 Causal Draw provenance groups (F-027-CD1): one precommit or one result, each created once and re-derived.
    if (group.owner === OWNER_CAUSAL_DRAW_KERNEL) return causalDrawGroupCheck(group, state);
    // IM-12 Culture adjudication provenance groups (F-027-CJA1): one decision record, created once and re-derived.
    if (group.owner === OWNER_CULTURE_ADJUDICATION_KERNEL)
      return cultureAdjudicationGroupCheck(group, state);
    // IM-12 referee provenance groups (PR #61, B61-A3): one decision record per task, created once and re-derived.
    if (group.owner === OWNER_REFEREE_KERNEL)
      return group.writes.some((w) => resolveKey(w.key)?.kind.id === "pc_collection_reach_decision")
        ? pcReachGroupCheck(group, state)
        : refereeGroupCheck(group, state);
    // IM-03 World-State fallback physical-entity custody: an acceptance is re-derived from the completion, and an
    // entity transition from its causing result and the accepted entity.
    if (group.owner === OWNER_WORLD_STATE && group.facet === FACET_WORLD_FALLBACK_ENTITY)
      return worldEntityGroupCheck(group, state);
    // IM-03 World-State Source Condition: an establishment, and a delivery re-derived from the actual Production-caused Source Delta.
    if (group.owner === OWNER_WORLD_STATE && group.facet === FACET_WORLD_SOURCE_CONDITION)
      return worldSourceGroupCheck(group, state);
    // CPAA-C1 v0.3 bounded semantic delegation (newly authorized): the scene closure, derived from the owners' facts.
    if (group.owner === OWNER_WORLD_STATE && group.facet === FACET_WORLD_SCENE_CLOSURE)
      return sceneClosureGroupCheck(group, state);
    // IM-03 S1-P1 W2b: an acoustic emission is the locus's own physical event, judged against its original typed profile.
    if (group.owner === OWNER_WORLD_STATE && group.facet === FACET_WORLD_LOCUS)
      return worldAcousticEmissionGroupCheck(group, state);
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
    case "world_corridor": {
      const world = v["world"] as { entity_id: string };
      const from = v["from"] as { entity_id: string };
      const to = v["to"] as { entity_id: string };
      return world.entity_id === ids[0] && from.entity_id === ids[1] && to.entity_id === ids[2]
        ? null
        : "corridor identity does not match the key";
    }
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
    case "production_extraction_basis":
      return v["basis_id"] === ids[0] ? null : "basis_id does not match the key";
    case "production_extraction":
      return v["extraction_id"] === ids[0] ? null : "extraction_id does not match the key";
    case "production_source_delta":
      return v["delta_id"] === ids[0] ? null : "delta_id does not match the key";
    case "production_source_account": {
      const source = v["source"] as { source_key: string };
      const locality = v["locality"] as { world: { entity_id: string } };
      return source.source_key === ids[1] && locality.world.entity_id === ids[0]
        ? null
        : "source-resolution key does not match the account key";
    }
    case "world_source_condition": {
      const locality = v["locality"] as { world: { entity_id: string } };
      return v["source_key"] === ids[1] && locality.world.entity_id === ids[0]
        ? null
        : "source-resolution key does not match the key";
    }
    case "world_source_delivery": {
      const source = v["source"] as { fact_key: string };
      return v["delivery_id"] === ids[1] && source.fact_key.startsWith(`world/${ids[0]}/source/`)
        ? null
        : "delivery identity does not match the key";
    }
    case "pc_collection_commitment":
      return v["pc_id"] === ids[0] && v["act_id"] === ids[1]
        ? null
        : "pc_id and act_id do not match the key";
    case "pc_collection_request":
      return v["request_id"] === pcCollectionRequestId(ids[0]!, ids[1]!)
        ? null
        : "request_id does not match the key";
    case "pc_collection_mechanism":
      return v["pc_id"] === ids[0] && v["mechanism_id"] === ids[1]
        ? null
        : "pc_id and mechanism_id do not match the key";
    case "pc_collection_reach_decision":
      return v["pc_id"] === ids[0] && v["act_id"] === ids[1]
        ? null
        : "pc_id and act_id do not match the key";
    case "pc_intrinsic_clarification":
      return v["pc_id"] === ids[0] && v["clarification_id"] === ids[1]
        ? null
        : "pc_id and clarification_id do not match the key";
    case "pc_collection_cycle_attestation":
      return v["pc_id"] === ids[0] &&
        (v["mechanism"] as { fact_key: string }).fact_key ===
          `pc/${ids[0]}/collection-mechanism/${ids[1]}`
        ? null
        : "pc_id and mechanism do not match the key";
    case "population_pc_representation":
      return v["pc_id"] === ids[0] ? null : "pc_id does not match the key";
    case "world_scene_closure": {
      const l = v["locality"] as { world_id: string; locus_id: string };
      return l.world_id === ids[0] && l.locus_id === ids[1]
        ? null
        : "the closure's world and locus do not match the key";
    }
    case "population_workforce_scope": {
      const l = v["locality"] as { world_id: string; locus_id: string };
      return l.world_id === ids[0] && l.locus_id === ids[1]
        ? null
        : "the scope's world and locus do not match the key";
    }
    case "pc_collection_cessation":
      return v["pc_id"] === ids[0] && v["act_id"] === ids[1]
        ? null
        : "pc_id and act_id do not match the key";
    case "production_pc_collection_termination":
      return v["termination_id"] === ids[0] ? null : "termination_id does not match the key";
    case "production_pc_collection_lapse":
      return v["lapse_id"] === ids[0] ? null : "lapse_id does not match the key";
    case "population_pc_occupancy":
      return v["pc_id"] === ids[0] ? null : "pc_id does not match the key";
    case "production_pc_collection_work":
      return v["work_id"] === ids[0] ? null : "work_id does not match the key";
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
    case "economy_holding":
      return v["holding_id"] === ids[0] ? null : "holding_id does not match the key";
    case "economy_encumbrance": {
      const holding = v["holding"] as { fact_key: string; holding_id: string };
      return v["encumbrance_id"] === ids[1] &&
        holding.holding_id === ids[0] &&
        holding.fact_key === `economy/holding/${ids[0]}`
        ? null
        : "encumbrance identity does not match the key";
    }
    case "economy_reallocation":
      return v["reallocation_id"] === ids[0] ? null : "reallocation_id does not match the key";
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
    case "world_actor_coupling":
      return v["actor_id"] === ids[0] ? null : "actor identity does not match the key";
    case "world_pc_locus_custody":
      return v["pc_id"] === ids[0] ? null : "PC identity does not match the key";
    case "actor_setup_placement":
    case "actor_physical_presence":
      return v["actor_id"] === ids[0] ? null : "actor identity does not match the key";
    case "world_setup_closure":
      return (v["world"] as { entity_id: string }).entity_id === ids[0]
        ? null
        : "world identity does not match the key";
    case "actor_raw_sensory_state":
      return v["actor_id"] === ids[0] ? null : "actor identity does not match the key";
    case "world_acoustic_emission":
      return v["emission_id"] === ids[2] &&
        (v["world"] as { entity_id: string }).entity_id === ids[0] &&
        (v["locus"] as { entity_id: string }).entity_id === ids[1]
        ? null
        : "emission identity does not match the key";
    case "logistics_commitment": {
      const moved = v["moved"] as { entity_id: string };
      const origin = v["origin"] as { world: { entity_id: string } };
      return moved.entity_id === ids[1] && origin.world.entity_id === ids[0]
        ? null
        : "commitment identity does not match the key";
    }
    case "logistics_transfer": {
      const moved = v["moved"] as { fact_key: string; entity_id: string };
      return moved.entity_id === ids[1] &&
        (moved.fact_key === `world/${ids[0]}/entity/${ids[1]}` ||
          moved.fact_key === worldPcLocusCustodyKey(ids[1]!))
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
    case "pc_movement_commitment":
      return v["pc_id"] === ids[0] ? null : "PC identity does not match the key";
    case "pc_movement_request":
      return (v["subject"] as { entity_id: string }).entity_id === ids[0]
        ? null
        : "PC identity does not match the key";
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
    case "gip_sunset_enrollment":
      // a fixed key space of one slot: the key embeds no identity
      return null;
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
    case "culture_update_context":
      return v["update_id"] === ids[0] ? null : "update identity does not match the key";
    case "culture_shared_meaning":
      return v["slot_id"] === ids[0] ? null : "state slot identity does not match the key";
    case "culture_adjudication_decision":
      return v["culture_update_id"] === ids[0] ? null : "culture_update_id does not match the key";
    case "referee_decision":
      return v["task_id"] === ids[0] ? null : "task_id does not match the key";
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
    case "world_corridor":
      return checkCorridor(group, state, key, value);
    case "pc_existence_contract":
      return checkExistenceContract(group, state, value);
    case "player_character_binding":
      return checkBinding(group, state, value);
    default:
      return null;
  }
}
