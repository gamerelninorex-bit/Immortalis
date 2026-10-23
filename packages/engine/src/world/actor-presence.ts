import {
  ActorPhysicalPresenceSchema,
  ActorSetupPlacementSchema,
  ExistingActorCouplingSchema,
  OWNER_WORLD_STATE,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  WorldLocusSchema,
  WorldSetupClosureSchema,
  actorPhysicalPresenceKey,
  actorSetupPlacementKey,
  comparePlacementPins,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  type ActorPhysicalPresence,
  type ActorSetupPlacement,
  type CommitGroup,
  type OwnerFact,
  type WorldSetupClosure,
} from "@immortalis/contracts";
import { actorBoundaryViolation, existingActorSourceViolation } from "../actor/derive.ts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { resolveKey } from "../owners/registry.ts";
import { setupEligibilityViolation } from "./setup-eligibility.ts";

/**
 * R1 Stage-One v1.1 — First Non-PC Actor Physical Presence (IM-03; WG "Ownership Guards — F-016 Ratified Fallback Objective
 * Physical-Entity Custody" with the R1 Stage-One v1.1 successor and the Temporal R1 physical-presence read).
 *
 * The single statement of what an actor setup placement (B1), a world setup closure and a first physical presence (B2) must be,
 * given the committed facts they are judged against. Each function is pure: write admission calls it with the campaign state
 * before the group, historical replay calls it with the real incremental pre-state, and the load verifier calls it with the
 * facts as they stood before the fact, so the three cannot drift. A coupling, an opaque capability identity or host text is
 * never a position: only B1 → closure → (independent Temporal establishment) → B2 is.
 */

type Facts = ReadonlyMap<string, OwnerFact>;

const isFactRef = (r: { fact_key: string; entity_id: string }, key: string, id: string): boolean =>
  r.fact_key === key && r.entity_id === id;

/** The world and locus a pair of references names, judged against the committed facts at exactly the pinned versions. */
function worldLocusViolation(
  world: { fact_key: string; entity_id: string },
  locus: { fact_key: string; entity_id: string },
  pinned: { world: number; locus: number },
  facts: Facts,
): string | null {
  const worldKey = worldProfileKey(world.entity_id);
  const locusKey = worldLocusKey(world.entity_id, locus.entity_id);
  if (!isFactRef(world, worldKey, world.entity_id) || locus.fact_key !== locusKey) {
    return "world and locus references do not match their key identities";
  }
  const worldFact = facts.get(worldKey);
  const locusFact = facts.get(locusKey);
  if (!worldFact || !locusFact) return "the world and the locus are committed";
  if (worldFact.version !== pinned.world || locusFact.version !== pinned.locus) {
    return "the world and locus are pinned at exactly their committed versions";
  }
  const committed = WorldLocusSchema.safeParse(locusFact.value);
  if (!committed.success || !canonicalEqual(committed.data.world, world)) {
    return "the locus does not belong to the world being named";
  }
  return null;
}

/**
 * B1: an independently authored setup statement placing one already-existing non-PC actor at one locus. Inert setup evidence:
 * it asserts no custody and no presence.
 */
export function actorSetupPlacementViolation(
  key: string,
  p: ActorSetupPlacement,
  facts: Facts,
): string | null {
  if (key !== actorSetupPlacementKey(p.actor_id)) {
    return "a setup placement is at the slot derived from its actor identity";
  }
  const boundary = actorBoundaryViolation(facts, p.actor_id);
  if (boundary) return `the actor is not an existing non-PC actor: ${boundary}`;
  for (const pin of p.actor_state) {
    if (resolveKeyKind(pin.fact_key) !== "named_actor_capability_basis") {
      return `a setup source is the actor's own committed named_actor_capability_basis, never a capability close: ${pin.fact_key}`;
    }
  }
  const source = existingActorSourceViolation(p.actor_id, p.actor_state, facts);
  if (source) return source;
  const where = worldLocusViolation(p.world, p.locus, p.pinned_versions, facts);
  if (where) return where;
  if (facts.has(worldSetupClosureKey(p.world.entity_id))) {
    return "the world's setup is already closed: no setup placement may enter after its closure";
  }
  const coupling = facts.get(worldActorCouplingKey(p.actor_id));
  if (coupling) {
    const c = ExistingActorCouplingSchema.safeParse(coupling.value);
    if (!c.success || !couplingAgrees(c.data.coupling, p)) {
      return "the actor's committed coupling names a different world or locus than this setup placement";
    }
  }
  return setupEligibilityViolation(facts.values());
}

function resolveKeyKind(key: string): string | undefined {
  return resolveKey(key)?.kind.id;
}

/** Whether a coupling's world and locus are the ones a placement or presence names (identity equality, never a second locator). */
export function couplingAgrees(
  coupling: { world: { entity_id: string }; locus: { entity_id: string } },
  placed: { world: { entity_id: string }; locus: { entity_id: string } },
): boolean {
  return (
    coupling.world.entity_id === placed.world.entity_id &&
    coupling.locus.entity_id === placed.locus.entity_id
  );
}

/**
 * What a committed coupling must still agree with: the actor's setup placement and presence, whichever was committed first.
 * Used by the coupling's own admission/load check (a coupling written after B1 or B2) so the two directions cannot drift.
 */
export function couplingPlacementViolation(
  actorId: string,
  coupling: { world: { entity_id: string }; locus: { entity_id: string } },
  facts: Pick<Facts, "get">,
): string | null {
  for (const [what, key, schema] of [
    ["setup placement", actorSetupPlacementKey(actorId), ActorSetupPlacementSchema],
    ["physical presence", actorPhysicalPresenceKey(actorId), ActorPhysicalPresenceSchema],
  ] as const) {
    const fact = facts.get(key);
    if (!fact) continue;
    const parsed = schema.safeParse(fact.value);
    if (!parsed.success || !couplingAgrees(coupling, parsed.data)) {
      return `the coupling names a different world or locus than the actor's committed ${what}`;
    }
  }
  return null;
}

/** The B1 records of one world in the facts, as the canonically sorted key/version inventory a closure must list. */
export function sameWorldPlacementInventory(
  worldId: string,
  facts: Facts,
): { fact_key: string; version: number }[] {
  const out: { fact_key: string; version: number }[] = [];
  for (const fact of facts.values()) {
    if (resolveKeyKind(fact.key) !== "actor_setup_placement") continue;
    const parsed = ActorSetupPlacementSchema.safeParse(fact.value);
    if (parsed.success && parsed.data.world.entity_id === worldId) {
      out.push({ fact_key: fact.key, version: fact.version });
    }
  }
  return out.sort(comparePlacementPins);
}

/** The one closure of a world: the complete, sorted, same-world B1 inventory, committed once while setup eligibility holds. */
export function worldSetupClosureViolation(
  key: string,
  c: WorldSetupClosure,
  facts: Facts,
): string | null {
  const worldId = c.world.entity_id;
  if (key !== worldSetupClosureKey(worldId)) {
    return "a closure is at the slot derived from its world identity";
  }
  if (c.world.fact_key !== worldProfileKey(worldId) || !facts.has(c.world.fact_key)) {
    return "the closure names a committed world profile";
  }
  const expected = sameWorldPlacementInventory(worldId, facts);
  if (!canonicalEqual(c.placements, expected)) {
    return "the closure lists exactly the complete, sorted inventory of this world's committed setup placements: no omission, duplicate, foreign-world or future entry";
  }
  return setupEligibilityViolation(facts.values());
}

/** Scan targets of the exact-identity physical-custody exclusion: kind → the identity literal it carries. */
const RIVAL_IDENTITY: Readonly<Record<string, (v: Record<string, unknown>) => unknown>> = {
  world_fallback_entity: (v) => v["entity_id"],
  world_entity_transition: (v) => (v["entity"] as { entity_id?: unknown } | undefined)?.entity_id,
  world_pc_locus_custody: (v) => v["pc_id"],
  player_character_binding: (v) =>
    (v["active_pc"] as { entity_id?: unknown } | undefined)?.entity_id,
  logistics_commitment: (v) => (v["moved"] as { entity_id?: unknown } | undefined)?.entity_id,
  logistics_transfer: (v) => (v["moved"] as { entity_id?: unknown } | undefined)?.entity_id,
};

/**
 * Exact-identity rivals of a presence-bearing actor (all worlds): a fallback physical entity, an entity transition, active-PC
 * locus custody, the operative PC binding or a Logistics physical subject carrying the SAME canonical literal. Identities are
 * compared as literals only; no alias is derived. An unbound `pc_existence_contract` (existing-actor compilation included) is not
 * a current physical custodian and is not a rival.
 */
export function presenceRivalViolation(actorId: string, facts: Iterable<OwnerFact>): string | null {
  for (const fact of facts) {
    const kind = resolveKeyKind(fact.key);
    const identity = kind === undefined ? undefined : RIVAL_IDENTITY[kind];
    if (identity === undefined) continue;
    const value = fact.value;
    if (
      typeof value === "object" &&
      value !== null &&
      identity(value as Record<string, unknown>) === actorId
    ) {
      return `the identity ${actorId} is already a current physical custodian record (${kind}) under another owner: ${fact.key}`;
    }
  }
  return null;
}

/** B2: the actor's one first current physical locus, derived from a closed B1 and the Temporal canonical time before it. */
export function actorPhysicalPresenceViolation(
  key: string,
  p: ActorPhysicalPresence,
  facts: Facts,
  options: { readonly checkClock: boolean } = { checkClock: true },
): string | null {
  if (key !== actorPhysicalPresenceKey(p.actor_id)) {
    return "a presence is at the slot derived from its actor identity (one per actor, across every world)";
  }
  const boundary = actorBoundaryViolation(facts, p.actor_id);
  if (boundary) return `the actor is not an existing non-PC actor: ${boundary}`;
  const where = worldLocusViolation(
    p.world,
    p.locus,
    { world: p.pinned_versions.world, locus: p.pinned_versions.locus },
    facts,
  );
  if (where) return where;
  const placementFact = facts.get(actorSetupPlacementKey(p.actor_id));
  const placement = placementFact
    ? ActorSetupPlacementSchema.safeParse(placementFact.value)
    : undefined;
  if (!placementFact || !placement?.success) return "the actor's setup placement is committed";
  if (placementFact.version !== p.pinned_versions.placement) {
    return "the setup placement is pinned at exactly its committed version";
  }
  if (
    !canonicalEqual(placement.data.world, p.world) ||
    !canonicalEqual(placement.data.locus, p.locus)
  ) {
    return "the presence names the world and locus of its setup placement, and no other";
  }
  const closureFact = facts.get(worldSetupClosureKey(p.world.entity_id));
  const closure = closureFact ? WorldSetupClosureSchema.safeParse(closureFact.value) : undefined;
  if (!closureFact || !closure?.success) return "the world's setup closure is committed";
  if (closureFact.version !== p.pinned_versions.closure) {
    return "the closure is pinned at exactly its committed version";
  }
  if (
    !closure.data.placements.some(
      (e) => e.fact_key === placementFact.key && e.version === placementFact.version,
    )
  ) {
    return "a setup placement is inert as a basis for presence until a valid closure lists it";
  }
  const rival = presenceRivalViolation(p.actor_id, facts.values());
  if (rival) return rival;
  if (options.checkClock) {
    const clock = temporalCanonicalTime(facts);
    if (clock === null)
      return "no Temporal canonical time is committed: a presence is never established without one";
    if (!canonicalEqual(clock, p.effective_instant)) {
      return "the effective instant is the Temporal canonical time of the state before this fact, never caller-authored";
    }
  }
  return null;
}

/** The Temporal owner's canonical time in the given facts, or null when none is committed or the state is malformed. */
export function temporalCanonicalTime(facts: Pick<Facts, "get">): unknown {
  const state = facts.get(TEMPORAL_STATE_KEY);
  if (!state) return null;
  const parsed = TemporalStateSchema.safeParse(state.value);
  return parsed.success ? parsed.data.canonical_time : null;
}

/** Whether an exact-identity record of this id already exists in a presence slot: the O(1) guard of every later physical writer. */
export const presenceBearing = (entityId: string, facts: Pick<Facts, "has">): boolean =>
  facts.has(actorPhysicalPresenceKey(entityId));

/** The single message every later writer (fallback entity, transition, PC custody, binding) gives for an existing presence. */
export const PRESENCE_EXCLUSION =
  "the identity is a presence-bearing non-PC actor: the World-State physical presence is its one current physical custodian, and no rival owner or binding handover exists until a separately ratified atomic cutover";

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

/** IM-11 admission of a group that writes one of the R1 presence-chain kinds (single write each, create-only). */
export function worldActorPresenceGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.owner !== OWNER_WORLD_STATE) return null;
  if (group.writes.length !== 1) {
    return reject("VALUE_INVALID", "one R1 presence-chain fact is committed per group");
  }
  const w = group.writes[0]!;
  const kind = resolveKeyKind(w.key);
  if (kind === "actor_setup_placement") {
    const p = ActorSetupPlacementSchema.parse(w.value);
    const missing = pinAll(group, state, [
      ...p.actor_state.map((s) => [s.fact_key, "the actor's own Named-Actor basis"] as const),
      [p.world.fact_key, "the world profile"],
      [p.locus.fact_key, "the world locus"],
    ]);
    if (missing) return missing;
    const violation = actorSetupPlacementViolation(w.key, p, state.facts);
    return violation ? refInvalid(violation, { key: w.key }) : null;
  }
  if (kind === "world_setup_closure") {
    const c = WorldSetupClosureSchema.parse(w.value);
    const missing = pinAll(group, state, [
      [c.world.fact_key, "the world profile"],
      ...c.placements.map((e) => [e.fact_key, "a listed setup placement"] as const),
    ]);
    if (missing) return missing;
    const violation = worldSetupClosureViolation(w.key, c, state.facts);
    return violation ? refInvalid(violation, { key: w.key }) : null;
  }
  if (kind === "actor_physical_presence") {
    const p = ActorPhysicalPresenceSchema.parse(w.value);
    if (w.expected_version !== 0 || state.facts.has(w.key)) {
      return reject(
        "AMENDMENT_NOT_SUPPORTED",
        "stage one admits only the initial presence record: every successor, move and carry is refused",
        { key: w.key },
      );
    }
    const missing = pinAll(group, state, [
      [p.world.fact_key, "the world profile"],
      [p.locus.fact_key, "the world locus"],
      [actorSetupPlacementKey(p.actor_id), "the actor's setup placement"],
      [worldSetupClosureKey(p.world.entity_id), "the world's setup closure"],
      [TEMPORAL_STATE_KEY, "the Temporal state"],
    ]);
    if (missing) return missing;
    const violation = actorPhysicalPresenceViolation(w.key, p, state.facts);
    return violation ? refInvalid(violation, { key: w.key }) : null;
  }
  return null;
}

/**
 * The narrow, pure historical verification of an R1 group against the real incremental pre-state (replay): the same rules
 * admission applies, run for groups that write an R1 presence-chain kind only. Everything else returns null at once.
 */
export function worldActorPresenceHistoricalCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (!group.writes.some((w) => R1_KINDS.has(resolveKeyKind(w.key) ?? ""))) return null;
  return worldActorPresenceGroupCheck(group, state);
}

const R1_KINDS: ReadonlySet<string> = new Set([
  "actor_setup_placement",
  "world_setup_closure",
  "actor_physical_presence",
]);

/** Whether a fact belongs to the R1 presence chain. */
export const isActorPresenceChainFact = (fact: OwnerFact): boolean =>
  R1_KINDS.has(resolveKeyKind(fact.key) ?? "");
