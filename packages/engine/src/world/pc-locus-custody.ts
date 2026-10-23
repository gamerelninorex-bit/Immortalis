import {
  EXISTING_ACTOR_HANDOVER,
  ORIGINAL_ACTIVATION,
  ExistenceContractSchema,
  ExistingActorCouplingSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  FALLBACK_BASIS,
  OWNER_WORLD_STATE,
  PLAYER_CHARACTER_BINDING_KEY,
  PcPhysicalLocusCustodySchema,
  PlayerCharacterBindingSchema,
  RefereeDecisionRecordSchema,
  fail,
  logisticsCommitmentKey,
  logisticsTransferKey,
  ok,
  pcExistenceContractKey,
  refereeDecisionKey,
  worldActorCouplingKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
  type OriginalPcPhysicalLocusCustodyTarget,
  type PcPhysicalLocusCustody,
  type Result,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { PRESENCE_EXCLUSION, presenceBearing } from "./actor-presence.ts";
import { existingActorHandoverViolation } from "../owners/admission.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import {
  WORLD_PC_LOCUS_CUSTODY_RULE,
  WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE,
} from "../owners/registry.ts";
import {
  nativeQualificationViolation,
  physicalQualificationViolation,
} from "../referee/admission.ts";

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
 * Whether a custody record is the predecessor, post-handover one. The frozen Post-Handover contract's movement branch is LIMITED TO
 * HANDOVER: the later consumers of the stationary custody (voluntary movement, the stationary active-PC target advance, the PC
 * transfer advance) stay exactly as they were and do not take an original-activation custody, which establishes where the PC
 * stationarily IS and nothing else.
 */
export const isPostHandoverCustody = (c: PcPhysicalLocusCustody): boolean =>
  c.basis.established_from === EXISTING_ACTOR_HANDOVER;

/** Shared by both bases: the slot is derived from the PC identity and the references match their key identities. */
function slotViolation(key: string, c: PcPhysicalLocusCustody): string | null {
  if (key !== worldPcLocusCustodyKey(c.pc_id)) {
    return "a custody record is at the slot derived from its PC identity";
  }
  const worldId = c.stationary_locus.world.entity_id;
  if (
    c.stationary_locus.world.fact_key !== worldProfileKey(worldId) ||
    c.stationary_locus.locus.fact_key !== worldLocusKey(worldId, c.stationary_locus.locus.entity_id)
  ) {
    return "custody references do not match their key identities";
  }
  return null;
}

/** Shared by both bases: no other current-locus authority exists for the identity (exactly one authority answers where the PC is). */
function rivalAuthorityViolation(worldId: string, pcId: string, facts: FactView): string | null {
  if (
    facts.has(worldFallbackEntityKey(worldId, pcId)) ||
    facts.has(worldEntityTransitionKey(worldId, pcId)) ||
    facts.has(logisticsCommitmentKey(worldId, pcId)) ||
    facts.has(logisticsTransferKey(worldId, pcId))
  ) {
    return "another current-locus authority already exists for this identity: exactly one authority answers where the PC is";
  }
  return null;
}

/**
 * The ORIGINAL first-activation custody record the committed binding, world, locus and the two cited referee decisions determine
 * for `target.pc_id`. Pure and mechanical: the caller names the identity and the two retained decisions by key; the stationary
 * locus is exactly the binding's coupled world and locus and every version is read from committed state. Nothing is inferred,
 * defaulted, repaired or player-authored, and no verdict is read from the caller: whether the decisions qualify is judged
 * by `pcPhysicalLocusCustodyViolation`. Refused when a prerequisite is not there, so a locus is never invented.
 */
export function deriveOriginalPcPhysicalLocusCustody(
  target: OriginalPcPhysicalLocusCustodyTarget,
  source: { getFact(key: string): OwnerFact | undefined },
): Result<PcPhysicalLocusCustody, "PREREQUISITE_MISSING"> {
  const missing = (message: string) => fail("PREREQUISITE_MISSING", message);
  const pcId = target.pc_id;
  const bindingFact = source.getFact(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact ? PlayerCharacterBindingSchema.safeParse(bindingFact.value) : null;
  if (!bindingFact || !binding?.success || binding.data.active_pc.entity_id !== pcId) {
    return missing("no active PC binding names this identity");
  }
  const pcFact = source.getFact(pcExistenceContractKey(pcId));
  const nativeFact = source.getFact(target.native_qualified_by);
  const physicalFact = source.getFact(target.physical_qualified_by);
  if (!pcFact || !nativeFact || !physicalFact) {
    return missing("the released character and both qualifying referee decisions are committed");
  }
  const version = (k: string): number => source.getFact(k)?.version ?? 0;
  const { world, locus } = binding.data.coupling;
  const value = PcPhysicalLocusCustodySchema.safeParse({
    pc_id: pcId,
    stationary_locus: { world, locus },
    basis: {
      established_from: ORIGINAL_ACTIVATION,
      pinned_versions: {
        pc: pcFact.version,
        binding: bindingFact.version,
        world: version(world.fact_key),
        locus: version(locus.fact_key),
      },
      qualified_by: {
        native: { fact_key: nativeFact.key, version: nativeFact.version },
        physical: { fact_key: physicalFact.key, version: physicalFact.version },
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
 * judges identity, ownership and provenance only, and there are exactly two mutually exclusive bases:
 *
 *  - EXISTING_ACTOR_HANDOVER (the predecessor branch, unchanged): see `handoverCustodyViolation`;
 *  - ACTIVATION (an ORIGINAL first-activated PC): see `activationCustodyViolation`.
 *
 * A custody that satisfies one basis never satisfies the other, and the binding's referent is never read as a placement on its own.
 * Returns a message, or null when the custody record holds.
 */
export function pcPhysicalLocusCustodyViolation(
  key: string,
  c: PcPhysicalLocusCustody,
  facts: FactView,
): string | null {
  const shared = slotViolation(key, c);
  if (shared) return shared;
  const basis = c.basis;
  return basis.established_from === EXISTING_ACTOR_HANDOVER
    ? handoverCustodyViolation(c, basis, facts)
    : activationCustodyViolation(c, basis, facts);
}

type HandoverBasis = Extract<
  PcPhysicalLocusCustody["basis"],
  { established_from: typeof EXISTING_ACTOR_HANDOVER }
>;
type ActivationBasis = Extract<
  PcPhysicalLocusCustody["basis"],
  { established_from: typeof ORIGINAL_ACTIVATION }
>;

/**
 * The predecessor branch, byte for byte the rule that was implemented before the original first-activation branch existed:
 *
 *  - the operative binding names this very PC and is the Existing-Actor → PC handover (a first ACTIVATION consumes no World-State
 *    coupling, so this basis is never available to it);
 *  - that handover still holds as the one existing handover statement (`existingActorHandoverViolation`, judged against the
 *    facts before the cutover): the released compilation contract, the committed coupling, exact versions, exact migration data;
 *  - the pinned versions are the exact current versions of the contract, binding, coupling, world and locus: a stale pin fails;
 *  - the stationary locus is EXACTLY the consumed coupling's locus (and so, by the handover rule, equals the binding referent;
 *    the coupling, not the binding, is what it is taken from);
 *  - no other current-locus authority exists for the identity: no fallback entity, no ECT-01 transition and no Logistics
 *    commitment or transfer under it.
 */
function handoverCustodyViolation(
  c: PcPhysicalLocusCustody,
  basis: HandoverBasis,
  facts: FactView,
): string | null {
  const worldId = c.stationary_locus.world.entity_id;
  const worldKey = worldProfileKey(worldId);
  const locusKey = worldLocusKey(worldId, c.stationary_locus.locus.entity_id);
  const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact ? PlayerCharacterBindingSchema.safeParse(bindingFact.value) : null;
  if (!bindingFact || !binding?.success) return "no active PC binding is committed";
  if (binding.data.active_pc.entity_id !== c.pc_id) {
    return "the active PC binding names this very PC identity: the continuing canonical identity is reused, never duplicated";
  }
  if (binding.data.transition.type !== EXISTING_ACTOR_HANDOVER) {
    return "a handover-basis custody is established only after the completed Existing-Actor → PC handover: a first activation supplies no World-State coupling basis, and the binding's referent is never read as a placement";
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
  const pins = basis.pinned_versions;
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
  return rivalAuthorityViolation(worldId, c.pc_id, facts);
}

/**
 * The ORIGINAL first-activation branch (World-State fallback custody; IR §§2, 7, 12, 14, 17; I-002 §§2, 4.3, 17.2). The Role
 * Registry binding's coupling is a binding-time referent: it becomes the PC's current physical locus ONLY because two retained
 * referee decisions, judged on the committed facts, qualify it:
 *
 *  - the operative binding is the first ACTIVATION of exactly this PC (native, explicit player-authored, `NATIVE_ALREADY_THERE`),
 *    never the handover, and no actor coupling exists for the identity (a fresh PC is not a manufactured existing actor);
 *  - the stationary locus is exactly the binding's coupled world and locus, which the physical-placement decision names;
 *  - the pinned versions are the exact current versions of the released contract, the binding, the world and the locus, and equal
 *    the versions the binding itself pinned for the contract, world and locus;
 *  - the cited native/compatibility decision qualifies THIS binding (`BIND_ELIGIBLE` over its preserved statement at its pins);
 *  - the cited physical-placement decision is `PHYSICAL_ELIGIBLE` for THIS character over THIS statement, citing exactly the
 *    contract, binding, world and locus at the custody's pins; both decisions are the ones their own task identity derives;
 *  - no other current-locus authority exists for the identity.
 */
function activationCustodyViolation(
  c: PcPhysicalLocusCustody,
  basis: ActivationBasis,
  facts: FactView,
): string | null {
  const worldId = c.stationary_locus.world.entity_id;
  const worldKey = worldProfileKey(worldId);
  const locusKey = worldLocusKey(worldId, c.stationary_locus.locus.entity_id);
  const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact ? PlayerCharacterBindingSchema.safeParse(bindingFact.value) : null;
  if (!bindingFact || !binding?.success) return "no active PC binding is committed";
  const b = binding.data;
  if (b.active_pc.entity_id !== c.pc_id) {
    return "the active PC binding names this very PC identity: the continuing canonical identity is reused, never duplicated";
  }
  if (b.transition.type !== ORIGINAL_ACTIVATION) {
    return "an original-activation custody rests on the first ACTIVATION of the PC; the existing-actor handover has its own, exclusive basis";
  }
  if (facts.has(worldActorCouplingKey(c.pc_id))) {
    return "a freshly authored PC has no actor coupling: an existing actor's identity is never placed by the original-activation basis";
  }
  const pcFact = facts.get(pcExistenceContractKey(c.pc_id));
  const contract = pcFact ? ExistenceContractSchema.safeParse(pcFact.value) : null;
  const world = facts.get(worldKey);
  const locus = facts.get(locusKey);
  if (!pcFact || !contract?.success || !world || !locus) {
    return "the released character, the world and the locus are committed";
  }
  if (contract.data.existing_actor_compilation !== undefined) {
    return "an existing actor's compilation is never placed by the original-activation basis";
  }
  if (!canonicalEqual(c.stationary_locus, b.coupling)) {
    return "the stationary locus is exactly the world and locus the qualified binding couples: a rival or inferred placement is not accepted";
  }
  const pins = basis.pinned_versions;
  if (
    pins.pc !== pcFact.version ||
    pins.binding !== bindingFact.version ||
    pins.world !== world.version ||
    pins.locus !== locus.version
  ) {
    return "the custody was not established against the committed contract, binding, world and locus versions";
  }
  const bp = b.transition.basis.pinned_versions;
  if (bp.pc !== pins.pc || bp.world !== pins.world || bp.locus !== pins.locus) {
    return "the binding was established against other contract, world and locus versions than the custody pins";
  }
  const decision = (pin: { fact_key: string; version: number }, what: string) => {
    const fact = facts.get(pin.fact_key);
    const parsed = fact ? RefereeDecisionRecordSchema.safeParse(fact.value) : null;
    if (!fact || !parsed?.success) return `${what} is committed`;
    if (fact.version !== pin.version) return `${what} is pinned at its committed version`;
    if (pin.fact_key !== refereeDecisionKey(parsed.data.task_id))
      return `${what} is at the key its task derives`;
    return parsed.data;
  };
  const native = decision(
    basis.qualified_by.native,
    "the qualifying native/compatibility decision",
  );
  if (typeof native === "string") return native;
  const nativeBad = nativeQualificationViolation(native, b);
  if (nativeBad) return `the native presence is not qualified: ${nativeBad.message}`;
  const physical = decision(
    basis.qualified_by.physical,
    "the qualifying physical-placement decision",
  );
  if (typeof physical === "string") return physical;
  const physicalBad = physicalQualificationViolation(physical, b, pins);
  if (physicalBad) return `the physical placement is not qualified: ${physicalBad}`;
  return rivalAuthorityViolation(worldId, c.pc_id, facts);
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
  // R1 exact-identity exclusion, the mirror of the binding refusal: one current physical custodian per canonical identity
  if (presenceBearing(c.pc_id, state.facts)) {
    return reject("REFERENCE_INVALID", PRESENCE_EXCLUSION, { key: w.key });
  }
  // dependency direction: the PC's contract, the binding that consumed it, the coupling (handover) or the qualifying decisions
  // (original activation), then the world and the locus
  const basis = c.basis;
  const prerequisites: readonly (readonly [string, string])[] =
    basis.established_from === EXISTING_ACTOR_HANDOVER
      ? [
          [pcExistenceContractKey(c.pc_id), "the PC's released compilation contract"],
          [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
          [worldActorCouplingKey(c.pc_id), "the handover's consumed World-State coupling"],
          [c.stationary_locus.world.fact_key, "the world profile"],
          [c.stationary_locus.locus.fact_key, "the world locus"],
        ]
      : [
          [pcExistenceContractKey(c.pc_id), "the PC's released contract"],
          [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
          [c.stationary_locus.world.fact_key, "the world profile"],
          [c.stationary_locus.locus.fact_key, "the world locus"],
          [basis.qualified_by.native.fact_key, "the qualifying native/compatibility decision"],
          [basis.qualified_by.physical.fact_key, "the qualifying physical-placement decision"],
        ];
  for (const [key, what] of prerequisites) {
    const p = requirePrerequisite(group, state, key, what);
    if (isRejection(p)) return p;
  }
  // each basis is written under its own governing citation, exclusively
  const expectedRule =
    basis.established_from === EXISTING_ACTOR_HANDOVER
      ? WORLD_PC_LOCUS_CUSTODY_RULE
      : WORLD_PC_LOCUS_ORIGINAL_ACTIVATION_RULE;
  if (basis.established_from === ORIGINAL_ACTIVATION && !canonicalEqual(group.rule, expectedRule)) {
    return reject(
      "VALUE_INVALID",
      "an original-activation custody carries its own governing citation",
      { key: w.key },
    );
  }
  const violation = pcPhysicalLocusCustodyViolation(w.key, c, state.facts);
  return violation ? reject("REFERENCE_INVALID", violation, { key: w.key }) : null;
}
