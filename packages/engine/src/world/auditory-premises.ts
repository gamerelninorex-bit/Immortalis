import {
  ActorPhysicalPresenceSchema,
  ActorRawSensoryStateSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FACET_WORLD_LOCUS,
  OWNER_WORLD_STATE,
  TEMPORAL_STATE_KEY,
  WorldAcousticEmissionSchema,
  WorldLocusSchema,
  actorPhysicalPresenceKey,
  actorRawSensoryStateKey,
  actorSetupPlacementKey,
  pcExistenceContractKey,
  populationLedgerKey,
  worldAcousticEmissionKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  type ActorRawSensoryState,
  type CommitGroup,
  type OwnerFact,
  type WorldAcousticEmission,
  type WorldLocus,
} from "@immortalis/contracts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { resolveKey } from "../owners/registry.ts";
import { presenceRivalViolation, temporalCanonicalTime } from "./actor-presence.ts";
import { setupEligibilityViolation } from "./setup-eligibility.ts";

/**
 * S1-P1 — paired W1 raw auditory faculty/receptivity and W2 acoustic source premises (IM-03; WG "S1-P1 — BLUE executable
 * lowering freeze", native pin 2026-10-23T12:26:49.599Z, with its emitter-source executability clarification).
 *
 * The single statement of what a typed acoustic profile on a locus (W2a), an actor's raw sensory state (W1) and an acoustic
 * emission (W2b) must be, given the committed facts they are judged against. Each function is pure: write admission calls it
 * with the campaign state before the group, historical replay calls it with the real incremental pre-state, and the load verifier
 * calls it with the facts as they stood before the fact, so the three cannot drift. A capability basis, a coupling, a B2 presence,
 * an empty Health ledger or a profile's potential impulse is never a faculty or an event: only W1 and a committed emission are.
 *
 * Nothing here writes Health, Epistemic or Named-Actor state, produces an access event or a packet, or decides that anyone heard
 * anything. The causal order it enforces is: typed profile (before the world's setup closure) → R1 B1 → closure → initial Temporal
 * establishment → B2 → W1 → emission, every step at the SAME committed Temporal canonical time (no carry across elapsed time, no
 * backdating, no future read).
 */

type Facts = ReadonlyMap<string, OwnerFact>;

export const RAW_SENSORY_KIND = "actor_raw_sensory_state";
export const ACOUSTIC_EMISSION_KIND = "world_acoustic_emission";
const LOCUS_KIND = "world_locus";

/** The kinds this slice adds; a locus is P1-bearing only when it carries the optional typed profile. */
export const AUDITORY_PREMISES_FACT_KIND_IDS = [RAW_SENSORY_KIND, ACOUSTIC_EMISSION_KIND] as const;

const kindOf = (key: string): string | undefined => resolveKey(key)?.kind.id;

/** The locus a fact value is, when it parses as one and carries the typed profile; otherwise null. */
function profiledLocus(fact: OwnerFact): WorldLocus | null {
  if (kindOf(fact.key) !== LOCUS_KIND) return null;
  const parsed = WorldLocusSchema.safeParse(fact.value);
  return parsed.success && parsed.data.acoustic_profile_v1 !== undefined ? parsed.data : null;
}

/** Whether a fact belongs to the S1-P1 chain: a raw sensory state, an emission, or a locus authored with a typed profile. */
export const isAuditoryPremisesFact = (fact: OwnerFact): boolean => {
  const kind = kindOf(fact.key);
  return (
    kind === RAW_SENSORY_KIND || kind === ACOUSTIC_EMISSION_KIND || profiledLocus(fact) !== null
  );
};

const isEmissionKeyOf = (key: string, worldId: string, locusId: string): boolean =>
  key.startsWith(`world/${worldId}/locus/${locusId}/acoustic-emission/`);

// ---------------------------------------------------------------------------------------------
// Shared predicates
// ---------------------------------------------------------------------------------------------

/**
 * Whether an identity is one of an actor, a Player Character, a Population aggregate or a physical custodian: such an identity is
 * never an environmental emitter (no actor-initiated emission exists in stage one, and an emitter is a place's own source).
 */
export function emitterIdentityViolation(emitterId: string, facts: Facts): string | null {
  const slots: readonly (readonly [string, string])[] = [
    [pcExistenceContractKey(emitterId), "a Player Character contract"],
    [actorSetupPlacementKey(emitterId), "an actor setup placement"],
    [actorPhysicalPresenceKey(emitterId), "an actor physical presence"],
    [worldActorCouplingKey(emitterId), "an actor coupling"],
    [populationLedgerKey(emitterId), "a Population ledger"],
  ];
  for (const [key, what] of slots) {
    if (facts.has(key)) {
      return `the emitter identity ${emitterId} is ${what}: an environmental emitter is never an actor, a Player Character or an aggregate`;
    }
  }
  const rival = presenceRivalViolation(emitterId, facts.values());
  if (rival) return `the emitter identity is a physical custodian record: ${rival}`;
  for (const fact of facts.values()) {
    const kind = kindOf(fact.key);
    if (kind !== "named_actor_capability_basis" && kind !== "named_actor_capability") continue;
    const v = fact.value as { actor_id?: unknown } | null;
    if (typeof v === "object" && v !== null && v.actor_id === emitterId) {
      return `the emitter identity ${emitterId} is a Named Actor: an environmental emitter is never an actor`;
    }
  }
  return null;
}

/**
 * W2a: a locus authored WITH its typed acoustic profile. Valid only as the original source value of a locus, before the world's
 * setup closure and while the strict setup-eligibility predicate still holds; a later or backfilled profile is unrepresentable.
 * The locus kind is create-only, so every profile is by construction on a first version.
 */
export function acousticProfileLocusViolation(
  key: string,
  locus: WorldLocus,
  facts: Facts,
): string | null {
  const profile = locus.acoustic_profile_v1;
  if (profile === undefined) return null;
  const worldId = locus.world.entity_id;
  if (key !== worldLocusKey(worldId, locus.locus_id)) {
    return "a locus is at the slot derived from its world and locus identity";
  }
  if (facts.has(key)) {
    return "a typed acoustic profile is authored only with the original locus commit: no later version or rewrite exists";
  }
  if (facts.has(worldSetupClosureKey(worldId))) {
    return "the world's setup is already closed: a typed acoustic profile is a pre-seal source and cannot be inserted after the closure";
  }
  const eligibility = setupEligibilityViolation(facts.values());
  if (eligibility) {
    return `a typed acoustic profile is authored only while the world is still in setup: ${eligibility}`;
  }
  return emitterIdentityViolation(profile.environmental_emitter_basis.emitter_id, facts);
}

/** The committed pre-state Temporal time, or the message that none lawful exists. */
function clockViolation(facts: Facts, instant: unknown, what: string): string | null {
  const clock = temporalCanonicalTime(facts);
  if (clock === null) {
    return `no Temporal canonical time is committed: ${what} is never established without one`;
  }
  if (!canonicalEqual(clock, instant)) {
    return `the instant is the Temporal canonical time of the state before this fact, never caller-authored: ${what} is not backdated, forward-dated or carried across elapsed time`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// W1
// ---------------------------------------------------------------------------------------------

/**
 * The physical premises a raw sensory fact may name, judged against what is committed: the R1 chain of exactly this actor and
 * world, never a capability, a coupling or any other owner's fact. The world, the locus and the B2 presence are required (the
 * source: "the exact relevant physical premises, including B2"); this actor's own setup placement and this world's closure may
 * also be named; each named premise is pinned at exactly its committed version; the order is not significant. Shared by
 * admission, historical replay, the load verifier and the pure read, so none of them can drift.
 */
export function rawSensoryPremisesViolation(
  w: ActorRawSensoryState,
  get: (key: string) => OwnerFact | undefined,
): string | null {
  const worldKey = worldProfileKey(w.world.entity_id);
  const locusKey = worldLocusKey(w.world.entity_id, w.locus.entity_id);
  const presenceKey = actorPhysicalPresenceKey(w.actor_id);
  const allowed = new Set([
    worldKey,
    locusKey,
    presenceKey,
    actorSetupPlacementKey(w.actor_id),
    worldSetupClosureKey(w.world.entity_id),
  ]);
  const named = new Set(w.dependency_refs.map((r) => r.fact_key));
  for (const required of [worldKey, locusKey, presenceKey]) {
    if (!named.has(required)) {
      return `the premises include the committed world, locus and B2 presence: ${required} is not named`;
    }
  }
  for (const ref of w.dependency_refs) {
    if (!allowed.has(ref.fact_key)) {
      return `no capability basis, coupling or other fact serves as a faculty premise: ${ref.fact_key} is not a physical premise of this actor and world`;
    }
    const fact = get(ref.fact_key);
    if (!fact || fact.version !== ref.version) {
      return `the premise ${ref.fact_key} is pinned at exactly its committed version`;
    }
  }
  return null;
}

/**
 * W1: the original, owner-authored raw auditory faculty and immediate receptivity of one already-existing, non-PC actor, first
 * version only, at the SAME committed Temporal canonical time as the actor's R1 B2 presence. `checkClock` is false only for the
 * load verifier, which cannot see the Temporal state as it stood and leaves that statement to the historical verifier.
 */
export function actorRawSensoryStateViolation(
  key: string,
  w: ActorRawSensoryState,
  facts: Facts,
  options: { readonly checkClock: boolean } = { checkClock: true },
): string | null {
  if (key !== actorRawSensoryStateKey(w.actor_id)) {
    return "a raw sensory fact is at the slot derived from its actor identity and modality";
  }
  const boundary = actorBoundaryViolation(facts, w.actor_id);
  if (boundary) return `the actor is not an existing non-PC actor: ${boundary}`;
  const rival = presenceRivalViolation(w.actor_id, facts.values());
  if (rival) return rival;

  const worldId = w.world.entity_id;
  const worldKey = worldProfileKey(worldId);
  const locusKey = worldLocusKey(worldId, w.locus.entity_id);
  if (w.world.fact_key !== worldKey || w.locus.fact_key !== locusKey) {
    return "world and locus references do not match their key identities";
  }
  const worldFact = facts.get(worldKey);
  const locusFact = facts.get(locusKey);
  if (!worldFact || !locusFact) return "the world and the locus are committed";
  const locus = WorldLocusSchema.safeParse(locusFact.value);
  if (!locus.success || !canonicalEqual(locus.data.world, w.world)) {
    return "the locus does not belong to the world being named";
  }

  const presenceFact = facts.get(w.presence.fact_key);
  if (!presenceFact) return "the actor's R1 physical presence (B2) is committed";
  const presence = ActorPhysicalPresenceSchema.safeParse(presenceFact.value);
  if (
    w.presence.fact_key !== actorPhysicalPresenceKey(w.actor_id) ||
    kindOf(presenceFact.key) !== "actor_physical_presence" ||
    presenceFact.owner !== OWNER_WORLD_STATE ||
    presenceFact.facet !== FACET_WORLD_FALLBACK_ENTITY ||
    !presence.success ||
    presence.data.actor_id !== w.actor_id
  ) {
    return "the presence pin is the actor's own committed World-State fallback-custodian presence";
  }
  if (presenceFact.version !== w.presence.version || presenceFact.version !== 1) {
    return "the presence is pinned at exactly its committed first version: stage one admits no successor presence";
  }
  if (
    !canonicalEqual(presence.data.world, w.world) ||
    !canonicalEqual(presence.data.locus, w.locus)
  ) {
    return "the raw sensory fact names the world and locus of the actor's committed presence, and no other";
  }
  if (
    presence.data.pinned_versions.world !== worldFact.version ||
    presence.data.pinned_versions.locus !== locusFact.version
  ) {
    return "the world and locus are at the versions the presence was established against";
  }

  const premises = rawSensoryPremisesViolation(w, (k) => facts.get(k));
  if (premises) return premises;

  if (!canonicalEqual(presence.data.effective_instant, w.effective_instant)) {
    return "the presence is not carried across elapsed canonical time: its effective instant must equal this fact's (a stale B2 yields no raw sensory fact)";
  }
  if (options.checkClock) {
    const clock = clockViolation(facts, w.effective_instant, "a raw sensory fact");
    if (clock) return clock;
  }
  for (const fact of facts.values()) {
    if (!isEmissionKeyOf(fact.key, worldId, w.locus.entity_id)) continue;
    const emission = WorldAcousticEmissionSchema.safeParse(fact.value);
    if (!emission.success || canonicalEqual(emission.data.event_instant, w.effective_instant)) {
      return `an acoustic emission of this locus at this instant is already committed: a raw sensory fact is never established after the event it would qualify (${fact.key})`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// W2b
// ---------------------------------------------------------------------------------------------

/** The committed B2 and W1 of one actor that an emission may follow. */
export interface EmissionPrecedent {
  readonly presence: OwnerFact;
  readonly raw: OwnerFact;
}

/**
 * The stage-one chains a physical emission at this world, locus and event basis may follow (WG S1-P1 §W2: "Emission follows R1 B2
 * and W1 at the same defensible event basis with journal order resolving same-time causes; no backdating"). The emission names no
 * listener and this binds it to none: it requires only that the committed facts ALREADY contain, for one lawful non-PC actor at
 * this very locus, the exact first-version R1 B2 and the exact first-version W1 that pins it, both established at this event
 * instant. A fact that exists in the pre-state was journaled before the emission, so the order B2 → W1 → emission is carried by
 * existence; W1's own rule carries B2 → W1. No B2, no W1, a stale B2 or W1 (another instant), another locus, a successor, or an
 * actor that is no longer a lawful non-PC actor yields no precedent.
 */
export function emissionPrecedents(
  worldId: string,
  locusId: string,
  instant: unknown,
  facts: Facts,
): EmissionPrecedent[] {
  const out: EmissionPrecedent[] = [];
  for (const raw of facts.values()) {
    if (kindOf(raw.key) !== RAW_SENSORY_KIND || raw.version !== 1) continue;
    if (raw.owner !== OWNER_WORLD_STATE || raw.facet !== FACET_WORLD_FALLBACK_ENTITY) continue;
    const parsed = ActorRawSensoryStateSchema.safeParse(raw.value);
    if (!parsed.success) continue;
    const w = parsed.data;
    if (raw.key !== actorRawSensoryStateKey(w.actor_id)) continue;
    if (w.world.entity_id !== worldId || w.locus.entity_id !== locusId) continue;
    if (!canonicalEqual(w.effective_instant, instant)) continue;
    const presence = facts.get(w.presence.fact_key);
    if (
      !presence ||
      presence.key !== actorPhysicalPresenceKey(w.actor_id) ||
      presence.version !== 1 ||
      presence.owner !== OWNER_WORLD_STATE ||
      presence.facet !== FACET_WORLD_FALLBACK_ENTITY
    ) {
      continue;
    }
    const b2 = ActorPhysicalPresenceSchema.safeParse(presence.value);
    if (
      !b2.success ||
      b2.data.actor_id !== w.actor_id ||
      !canonicalEqual(b2.data.world, w.world) ||
      !canonicalEqual(b2.data.locus, w.locus) ||
      !canonicalEqual(b2.data.effective_instant, instant)
    ) {
      continue;
    }
    if (rawSensoryPremisesViolation(w, (k) => facts.get(k)) !== null) continue;
    if (actorBoundaryViolation(facts, w.actor_id) !== null) continue;
    out.push({ presence, raw });
  }
  return out;
}

/**
 * W2b: one genuine, instantaneous, source-authored airborne-sound event at a locus whose ORIGINAL source value carries the typed
 * environmental emitter that could produce it. The potential impulse the profile states is not the event; the event is this
 * separately committed fact at the committed Temporal canonical time, with provenance distinct from the profile's own statements.
 */
export function worldAcousticEmissionViolation(
  key: string,
  e: WorldAcousticEmission,
  facts: Facts,
  options: { readonly checkClock: boolean } = { checkClock: true },
): string | null {
  const worldId = e.world.entity_id;
  const locusId = e.locus.entity_id;
  if (key !== worldAcousticEmissionKey(worldId, locusId, e.emission_id)) {
    return "an emission is at the slot derived from its world, locus and emission identity";
  }
  const worldKey = worldProfileKey(worldId);
  const locusKey = worldLocusKey(worldId, locusId);
  if (e.world.fact_key !== worldKey || e.locus.fact_key !== locusKey) {
    return "world and locus references do not match their key identities";
  }
  if (!facts.has(worldKey)) return "the world is committed";
  const locusFact = facts.get(locusKey);
  if (!locusFact) return "the locus is committed";
  const locus = WorldLocusSchema.safeParse(locusFact.value);
  if (
    !locus.success ||
    locusFact.owner !== OWNER_WORLD_STATE ||
    locusFact.facet !== FACET_WORLD_LOCUS ||
    !canonicalEqual(locus.data.world, e.world)
  ) {
    return "the source is a World-State locus of the world being named";
  }
  if (
    e.emitting_source.fact_key !== locusKey ||
    e.emitting_source.version !== locusFact.version ||
    e.profile_locus_version !== locusFact.version ||
    locusFact.version !== 1
  ) {
    return "the emitting source is the exact original (first) world_locus version that carries the typed environmental emitter, and the profile version names the same commit";
  }
  const profile = locus.data.acoustic_profile_v1;
  if (profile === undefined) {
    return "the locus carries no typed pre-seal acoustic profile and no environmental emitter: there is no qualified source";
  }
  if (profile.environmental_emitter_basis.emitter_id !== e.emitter_id) {
    return "the emitter is the one the pre-seal profile's environmental emitter basis names, and no other";
  }
  const identity = emitterIdentityViolation(e.emitter_id, facts);
  if (identity) return identity;
  if (!facts.has(worldSetupClosureKey(worldId))) {
    return "the world's setup is not closed: an emission follows the closure, the initial Temporal establishment, B2 and W1";
  }
  const basis = profile.environmental_emitter_basis;
  const own = [
    profile.coverage_basis.whole_locus_reach,
    profile.coverage_basis.no_material_obstruction,
    profile.coverage_basis.no_material_attenuation,
    basis.physical_source_statement,
    basis.bounded_impulse_possible_statement,
  ];
  if (own.includes(e.source_provenance)) {
    return "the event provenance is distinct from the profile's own statements: a possible impulse is never evidence that the impulse happened";
  }
  if (e.audible_material === basis.bounded_impulse_possible_statement) {
    return "the audible material is the actual emitted characteristics, not the profile's statement of what could be emitted";
  }
  if (options.checkClock) {
    const clock = clockViolation(facts, e.event_instant, "an emission");
    if (clock) return clock;
  }
  if (emissionPrecedents(worldId, locusId, e.event_instant, facts).length === 0) {
    return "the emission follows an actual committed R1 B2 and World-State W1 of one non-PC actor at this locus, both established at this same event basis: no such chain is committed (a missing, stale, successor, other-locus or post-event premise yields no P1-qualified emission)";
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// IM-11 admission
// ---------------------------------------------------------------------------------------------

const refInvalid = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

function pinAll(
  group: CommitGroup,
  state: CampaignState,
  pins: readonly (readonly [string, string])[],
): Rejection | null {
  for (const [key, what] of pins) {
    const pinned = requirePrerequisite(group, state, key, what);
    if (isRejection(pinned)) return pinned;
  }
  return null;
}

/** IM-11 admission of a group that writes a W1 raw sensory state (single write, first version only). */
export function worldActorRawSensoryGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.owner !== OWNER_WORLD_STATE || group.facet !== FACET_WORLD_FALLBACK_ENTITY) return null;
  const writes = group.writes.filter((w) => kindOf(w.key) === RAW_SENSORY_KIND);
  if (writes.length === 0) return null;
  if (group.writes.length !== 1) {
    return reject("VALUE_INVALID", "one raw sensory fact is committed per group");
  }
  const w = group.writes[0]!;
  const parsed = ActorRawSensoryStateSchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", `value violates the ${RAW_SENSORY_KIND} contract`, {
      key: w.key,
    });
  }
  const v = parsed.data;
  if (w.expected_version !== 0 || state.facts.has(w.key)) {
    return reject(
      "AMENDMENT_NOT_SUPPORTED",
      "stage one admits only the first raw sensory record: every replacement, carry across elapsed time, changed form or other modality is refused",
      { key: w.key },
    );
  }
  const missing = pinAll(group, state, [
    [v.world.fact_key, "the world profile"],
    [v.locus.fact_key, "the world locus"],
    [v.presence.fact_key, "the actor's R1 physical presence"],
    [TEMPORAL_STATE_KEY, "the Temporal state"],
  ]);
  if (missing) return missing;
  const violation = actorRawSensoryStateViolation(w.key, v, state.facts);
  if (violation) return refInvalid(violation, { key: w.key });
  // every further premise the fact names (its setup placement, the world's closure) is read at its version and depended on too
  const fixed = new Set([v.world.fact_key, v.locus.fact_key, v.presence.fact_key]);
  return pinAll(
    group,
    state,
    v.dependency_refs
      .filter((r) => !fixed.has(r.fact_key))
      .map((r) => [r.fact_key, "a named physical premise"] as const),
  );
}

/** IM-11 admission of a group that writes a W2b acoustic emission (single write, create-only). */
export function worldAcousticEmissionGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.owner !== OWNER_WORLD_STATE || group.facet !== FACET_WORLD_LOCUS) return null;
  const writes = group.writes.filter((w) => kindOf(w.key) === ACOUSTIC_EMISSION_KIND);
  if (writes.length === 0) return null;
  if (group.writes.length !== 1) {
    return reject("VALUE_INVALID", "one acoustic emission is committed per group");
  }
  const w = group.writes[0]!;
  const parsed = WorldAcousticEmissionSchema.safeParse(w.value);
  if (!parsed.success) {
    return reject("VALUE_INVALID", `value violates the ${ACOUSTIC_EMISSION_KIND} contract`, {
      key: w.key,
    });
  }
  const e = parsed.data;
  const missing = pinAll(group, state, [
    [e.world.fact_key, "the world profile"],
    [e.locus.fact_key, "the original locus carrying the environmental emitter"],
    [worldSetupClosureKey(e.world.entity_id), "the world's setup closure"],
    [TEMPORAL_STATE_KEY, "the Temporal state"],
  ]);
  if (missing) return missing;
  const violation = worldAcousticEmissionViolation(w.key, e, state.facts);
  if (violation) return refInvalid(violation, { key: w.key });
  // the chain the emission follows is pinned by exact version in the journal, like every other premise a group relies on
  let first: Rejection | null = null;
  for (const p of emissionPrecedents(
    e.world.entity_id,
    e.locus.entity_id,
    e.event_instant,
    state.facts,
  )) {
    const pinned = pinAll(group, state, [
      [p.presence.key, "the followed actor's R1 B2 presence"],
      [p.raw.key, "the followed actor's raw sensory state (W1)"],
    ]);
    if (pinned === null) return null;
    first ??= pinned;
  }
  return first;
}

/**
 * The narrow, pure historical verification of an S1-P1 group against the real incremental pre-state (replay): the same rules
 * admission applies, run for groups that write one of the P1 kinds, or a locus carrying a typed profile, only. Everything else
 * returns null at once, so legacy journals replay exactly as before.
 */
export function auditoryPremisesHistoricalCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.owner !== OWNER_WORLD_STATE) return null;
  if (group.facet === FACET_WORLD_FALLBACK_ENTITY) {
    return worldActorRawSensoryGroupCheck(group, state);
  }
  if (group.facet !== FACET_WORLD_LOCUS) return null;
  const emission = worldAcousticEmissionGroupCheck(group, state);
  if (emission) return emission;
  for (const w of group.writes) {
    if (kindOf(w.key) !== LOCUS_KIND) continue;
    const parsed = WorldLocusSchema.safeParse(w.value);
    if (!parsed.success || parsed.data.acoustic_profile_v1 === undefined) continue;
    const violation = acousticProfileLocusViolation(w.key, parsed.data, state.facts);
    if (violation) return refInvalid(violation, { key: w.key });
  }
  return null;
}
