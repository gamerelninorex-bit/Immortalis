import {
  EXISTING_ACTOR_HANDOVER,
  ExistenceContractSchema,
  ExistingActorCouplingSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  OWNER_WORLD_STATE,
  PLAYER_CHARACTER_BINDING_KEY,
  PcPhysicalLocusCustodySchema,
  PlayerCharacterBindingSchema,
  fail,
  logisticsCommitmentKey,
  logisticsTransferKey,
  ok,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
  type PcPhysicalLocusCustody,
  type Result,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { existingActorHandoverViolation } from "../owners/admission.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";

/**
 * The Active-PC Post-Handover Physical Locus Custody (IM-03; WG "Ownership Guards — F-016 Ratified Fallback Objective
 * Physical-Entity Custody"; WS-006 / F-014A v3.3 §6 Two-Target Write Rule; IR §17; I-002 §4.3; the frozen Active-PC Post-Handover
 * Physical Locus Ownership & Relocation Contract §§4–7, 9, 13).
 *
 * The World-State fallback custodian's ONE authoritative statement of where the active Player Character stationarily IS, made
 * immediately after the completed Existing-Actor → PC handover and taken only from that handover's consumed World-State
 * coupling. It is a stationary record only: it moves nothing, requests nothing, admits no Logistics subject and writes no
 * Role Registry binding, Existence Contract, coupling or Temporal fact. The binding's `coupling.world` / `coupling.locus`
 * stay a binding-time referent (the handover rule has already made them equal to the coupling's), and the consumed coupling
 * stays immutable provenance: neither is ever read here as the PC's current locus, and this record never repeats a locus
 * taken from the binding.
 *
 * One current locus is ONE truth: the sealed, create-only slot per PC identity guarantees one custody record (a second is a
 * version conflict), and a PC that is already represented by another current-locus authority (a fallback entity, an ECT-01
 * transition or a Logistics commitment/transfer under its identity) is refused, so there is never a rival authority.
 */

/** A committed fact view: the committed facts as they stood at the time of the write being judged. */
export type FactView = Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">;

/** The same view with the operative binding hidden: the handover rule is judged against the facts BEFORE the cutover. */
const apartFromBinding = (facts: FactView): FactView => ({
  get: (k) => (k === PLAYER_CHARACTER_BINDING_KEY ? undefined : facts.get(k)),
  has: (k) => k !== PLAYER_CHARACTER_BINDING_KEY && facts.has(k),
});

/**
 * The custody record the committed handover determines for `pcId`. Pure and mechanical: the caller names the identity only;
 * the locus is the consumed coupling's locus and every other field is a fixed encoding (the custodian) or a version read from
 * committed state. Nothing is inferred, defaulted, repaired or player-authored. Refused when the binding or coupling is not
 * there, so a locus is never invented.
 */
export function derivePcPhysicalLocusCustody(
  pcId: string,
  source: { getFact(key: string): OwnerFact | undefined },
): Result<PcPhysicalLocusCustody, "PREREQUISITE_MISSING"> {
  const facts = { get: (k: string) => source.getFact(k) };
  const missing = (message: string) => fail("PREREQUISITE_MISSING", message);
  const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact ? PlayerCharacterBindingSchema.safeParse(bindingFact.value) : null;
  if (!bindingFact || !binding?.success || binding.data.active_pc.entity_id !== pcId) {
    return missing("no active PC binding names this identity");
  }
  const couplingFact = facts.get(worldActorCouplingKey(pcId));
  const coupling = couplingFact ? ExistingActorCouplingSchema.safeParse(couplingFact.value) : null;
  if (!couplingFact || !coupling?.success) {
    return missing("the handover's consumed World-State coupling is not committed");
  }
  const pcKey = pcExistenceContractKey(pcId);
  const worldKey = coupling.data.coupling.world.fact_key;
  const locusKey = coupling.data.coupling.locus.fact_key;
  const version = (k: string): number => facts.get(k)?.version ?? 0;
  const value = PcPhysicalLocusCustodySchema.safeParse({
    pc_id: pcId,
    stationary_locus: {
      world: coupling.data.coupling.world,
      locus: coupling.data.coupling.locus,
    },
    basis: {
      established_from: EXISTING_ACTOR_HANDOVER,
      pinned_versions: {
        pc: version(pcKey),
        binding: bindingFact.version,
        coupling: couplingFact.version,
        world: version(worldKey),
        locus: version(locusKey),
      },
    },
    custodian: {
      owner: OWNER_WORLD_STATE,
      facet: FACET_WORLD_FALLBACK_ENTITY,
      basis: FALLBACK_BASIS,
    },
  });
  return value.success
    ? ok(value.data)
    : missing("the result is not a representable custody record");
}

/**
 * The single statement of what a custody record must be, given the committed facts it is judged against (used by admission when
 * the fact is written and again by load verification, against the facts as they stood BEFORE it, so the two cannot drift). It
 * judges identity, ownership and provenance only:
 *
 *  - the fact is at the slot derived from its PC identity, and its references match their key identities;
 *  - the operative binding names this very PC and is the Existing-Actor → PC handover (a first ACTIVATION consumes no World-State
 *    coupling and supplies no authoritative placement, so nothing is inferred from the binding's referent);
 *  - that handover still holds as the one existing handover statement (`existingActorHandoverViolation`, judged against the
 *    facts before the cutover): the released compilation contract, the committed coupling, exact versions, exact migration data;
 *  - the pinned versions are the exact current versions of the contract, binding, coupling, world and locus: a stale pin fails;
 *  - the stationary locus is EXACTLY the consumed coupling's locus (and so, by the handover rule, equals the binding referent;
 *    the coupling, not the binding, is what it is taken from);
 *  - no other current-locus authority exists for the identity: no fallback entity, no ECT-01 transition and no Logistics
 *    commitment or transfer under it.
 *
 * Returns a message, or null when the custody record holds.
 */
export function pcPhysicalLocusCustodyViolation(
  key: string,
  c: PcPhysicalLocusCustody,
  facts: FactView,
): string | null {
  if (key !== worldPcLocusCustodyKey(c.pc_id)) {
    return "a custody record is at the slot derived from its PC identity";
  }
  const worldId = c.stationary_locus.world.entity_id;
  const worldKey = worldProfileKey(worldId);
  const locusKey = worldLocusKey(worldId, c.stationary_locus.locus.entity_id);
  if (
    c.stationary_locus.world.fact_key !== worldKey ||
    c.stationary_locus.locus.fact_key !== locusKey
  ) {
    return "custody references do not match their key identities";
  }
  const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact ? PlayerCharacterBindingSchema.safeParse(bindingFact.value) : null;
  if (!bindingFact || !binding?.success) return "no active PC binding is committed";
  if (binding.data.active_pc.entity_id !== c.pc_id) {
    return "the active PC binding names this very PC identity: the continuing canonical identity is reused, never duplicated";
  }
  if (binding.data.transition.type !== EXISTING_ACTOR_HANDOVER) {
    return "the custody is established only after the completed Existing-Actor → PC handover: a first activation supplies no World-State coupling basis, and the binding's referent is never read as a placement";
  }
  const handover = existingActorHandoverViolation(binding.data, apartFromBinding(facts));
  if (handover) return `the handover does not hold: ${handover}`;

  const pcFact = facts.get(pcExistenceContractKey(c.pc_id));
  const contract = pcFact ? ExistenceContractSchema.safeParse(pcFact.value) : null;
  const couplingKey = worldActorCouplingKey(c.pc_id);
  const couplingFact = facts.get(couplingKey);
  const coupling = couplingFact ? ExistingActorCouplingSchema.safeParse(couplingFact.value) : null;
  const world = facts.get(worldKey);
  const locus = facts.get(locusKey);
  if (!pcFact || !contract?.success || !couplingFact || !coupling?.success || !world || !locus) {
    return "the handover's contract, coupling, world and locus are committed";
  }
  const pins = c.basis.pinned_versions;
  if (
    pins.pc !== pcFact.version ||
    pins.binding !== bindingFact.version ||
    pins.coupling !== couplingFact.version ||
    pins.world !== world.version ||
    pins.locus !== locus.version
  ) {
    return "the custody was not established against the committed contract, binding, coupling, world and locus versions";
  }
  if (!canonicalEqual(c.stationary_locus, coupling.data.coupling)) {
    return "the stationary locus is exactly the consumed coupling's locus: a rival or inferred placement is not accepted";
  }
  if (
    facts.has(worldFallbackEntityKey(worldId, c.pc_id)) ||
    facts.has(worldEntityTransitionKey(worldId, c.pc_id)) ||
    facts.has(logisticsCommitmentKey(worldId, c.pc_id)) ||
    facts.has(logisticsTransferKey(worldId, c.pc_id))
  ) {
    return "another current-locus authority already exists for this identity: exactly one authority answers where the PC is";
  }
  return null;
}

/**
 * IM-11 admission of one custody record (the custodian's fact kind beside the accepted entity, its transition and the actor
 * coupling). It writes exactly one fact, reads and depends on each foreign fact it references at its current version (the PC's
 * contract, the binding, the coupling, the world, the locus: never copied), and re-derives the rule above, so Production,
 * Logistics, a consumer or a raw `store.commit` cannot create a rival, a copy, a custody for a PC that was not handed over or
 * one that rests on stale, forged or inferred evidence.
 */
export function worldPcLocusCustodyGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  if (group.writes.length !== 1) {
    return reject(
      "VALUE_INVALID",
      "one custody record establishes exactly one PC's stationary locus",
    );
  }
  const w = group.writes[0]!;
  const c = PcPhysicalLocusCustodySchema.parse(w.value);
  // dependency direction: the PC's contract, the binding that consumed it, the coupling, then the world and the locus
  const prerequisites: readonly (readonly [string, string])[] = [
    [pcExistenceContractKey(c.pc_id), "the PC's released compilation contract"],
    [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
    [worldActorCouplingKey(c.pc_id), "the handover's consumed World-State coupling"],
    [c.stationary_locus.world.fact_key, "the world profile"],
    [c.stationary_locus.locus.fact_key, "the world locus"],
  ];
  for (const [key, what] of prerequisites) {
    const p = requirePrerequisite(group, state, key, what);
    if (isRejection(p)) return p;
  }
  const violation = pcPhysicalLocusCustodyViolation(w.key, c, state.facts);
  return violation ? reject("REFERENCE_INVALID", violation, { key: w.key }) : null;
}
