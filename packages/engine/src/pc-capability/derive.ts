import {
  EXISTING_ACTOR_HANDOVER,
  ExistenceContractSchema,
  FACET_ACTOR_PROFILE,
  NamedActorCapabilitySchema,
  OWNER_NAMED_ACTOR,
  OWNER_PC_EXISTENCE,
  OWNER_ROLE_REGISTRY,
  PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY,
  PC_ESTABLISHMENT_EXISTING_ACTOR_CARRY_FORWARD,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  fail,
  ok,
  pcCapabilityBasisKey,
  pcCapabilityStage,
  pcExistenceContractKey,
  populationLedgerKey,
  PC_CAPABILITY_CLOSE,
  type Claim,
  type ExistenceContract,
  type OwnerFact,
  type PcCapability,
  type PcCapabilityBasis,
  type PcClaimLocator,
  type PcExistingActorCarryForwardEstablishment,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";

/**
 * Pure derivations of the PC capability path (WS-016 §3, §4, §11, §27.1; the Integration Map §2 I-002 bounded
 * amendment; F-016 Phase 2B PCC-01 to PCC-03). Each is the single statement of its rule: the owner operation computes
 * with it and IM-11 admission and load-time verification re-derive with it, so a committed PC capability is exactly what
 * its committed basis determines, and nothing else.
 *
 * They invent nothing: no numeric value, rank, default grade, roll, prior, deferred derivation or sufficiency judgment.
 * The marker is received in the basis; the capability only transcribes it, adds the provenance pointer and names the
 * PC Capability Close.
 */

/** A committed fact read by identity: its key, the owner that wrote it, the version it was read at and its value. */
export interface PcFact<T> {
  readonly key: string;
  readonly owner: string;
  readonly version: number;
  readonly value: T;
}

/** The capability this basis determines, published at the PC Capability Close (F-016 PCC-02; WS-016 §27.1). */
export function derivePcCapability(basis: PcFact<PcCapabilityBasis>): Result<PcCapability> {
  const b = basis.value;
  if (basis.owner !== OWNER_PC_EXISTENCE) {
    return fail("BASIS_INVALID", "the received basis is the one PC owner's own fact");
  }
  if (basis.key !== pcCapabilityBasisKey(b.pc_id, b.capability_id)) {
    return fail("BASIS_INVALID", "the basis is at the key derived from its PC and capability");
  }
  return ok({
    pc_id: b.pc_id,
    capability_id: b.capability_id,
    marker: b.marker,
    basis: { fact_key: basis.key, version: basis.version },
    close: {
      name: PC_CAPABILITY_CLOSE,
      stage: pcCapabilityStage(b.pc_id, b.capability_id),
    },
  });
}

/**
 * The accepted claim a locator points at in a released Existence Contract, or undefined when it points at nothing. A
 * hypothesis or an unresolved item has no locator, so only accepted, intrinsic-provenance claims can be located.
 */
export function pcClaimAt(contract: ExistenceContract, at: PcClaimLocator): Claim | undefined {
  const single = (claim: Claim): Claim | undefined => (at.index === 0 ? claim : undefined);
  switch (at.section) {
    case "identity_agency":
      return single(contract.identity_agency);
    case "embodiment_topology":
      return single(contract.embodiment_topology);
    case "continuity_rule":
      return single(contract.continuity_rule);
    case "contact":
      return contract.contact.kind === "CONTACT_ANCHOR"
        ? contract.contact.surfaces[at.index]
        : single(contract.contact.statement);
    case "baseline_exception.safely_inherited":
      return contract.baseline_exception.safely_inherited[at.index];
    case "baseline_exception.player_overrides":
      return contract.baseline_exception.player_overrides[at.index];
    case "entry_envelope":
      return contract.entry_envelope.items[at.index];
  }
}

/**
 * The single statement of what a received establishment must be, given the committed Existence Contract (WS-016 §4 PC
 * gate, §11, §13): the pinned fact is THIS PC's own released Existence Contract, committed and read at the version
 * pinned, and every cited claim is an accepted claim of it. It judges identity and provenance only: whether the cited
 * claims warrant the marker is the authored/accepted generation content's judgment — no source supplies a rule from
 * accepted claims to a grade, and the engine does not invent one (so a grade is never inferred from fame or reputation by
 * the engine, and never granted without an accepted claim to point at). Returns a message, or null.
 */
export function pcCapabilityEstablishmentViolation(
  basis: PcCapabilityBasis,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): string | null {
  const e = basis.establishment;
  if (e.method === PC_ESTABLISHMENT_EXISTING_ACTOR_CARRY_FORWARD) {
    return pcCarryForwardViolation(basis, e, facts);
  }
  if (e.contract.fact_key !== pcExistenceContractKey(basis.pc_id)) {
    return "the establishment pins this PC's own Existence Contract: a PC capability is established from its own accepted generation history";
  }
  const fact = facts.get(e.contract.fact_key);
  if (!fact || fact.owner !== OWNER_PC_EXISTENCE) {
    return "the PC's Existence Contract is not committed by the PC owner";
  }
  const contract = ExistenceContractSchema.safeParse(fact.value);
  if (!contract.success || contract.data.pc_id !== basis.pc_id) {
    return "the PC's Existence Contract is not a released Existence Contract of this PC";
  }
  if (contract.data.existing_actor_compilation !== undefined) {
    return "the Existence Contract compiles an already-existing actor: ACCEPTED_GENERATION_HISTORY would present the actor's inherited mastery as player-authored, Mirror-derived mastery; an actor's established capability enters the PC only by the distinct EXISTING_ACTOR_CARRY_FORWARD establishment";
  }
  if (fact.version !== e.contract.version) {
    return "the establishment is pinned to the committed Existence Contract at its exact version";
  }
  for (const claim of e.claims) {
    if (pcClaimAt(contract.data, claim) === undefined) {
      return `the cited claim is not an accepted claim of the Existence Contract: ${claim.section}[${claim.index}]`;
    }
  }
  return null;
}

/**
 * The single statement of what an EXISTING_ACTOR_CARRY_FORWARD establishment must be, given the committed facts (PC-Control
 * Handover Contract v1 "Single Commit Point" and "Existing Actor → PC"; WS-016 §§2, 25, 32; F-014A v3.3 W3-CP3). It judges
 * identity, ownership, provenance and exactness only — it resolves nothing:
 *
 *  - the cutover basis is the committed Role Registry binding, at the version pinned, whose transition is the
 *    EXISTING_ACTOR_HANDOVER of THIS identity (an ordinary ACTIVATION, another identity or an absent binding is no basis),
 *    and it consumed THIS identity's released existing-actor compilation contract at its committed version;
 *  - the source is this identity's own committed `named_actor_capability` for this capability, owned by the Named-Actor
 *    owner, at exactly the version pinned. A mere `named_actor_capability_basis`, an absent capability or another
 *    identity's/capability's fact is no source;
 *  - the basis marker is the source's marker EXACTLY (`null` included): no reroll, world prior, Causal Draw, Mirror
 *    derivation, regrade or recalibration exists here.
 *
 * Precedence of the source over the handover is NOT decidable from a fact map (it needs commit order). It is an invariant
 * of the cutover itself: once the binding names the identity, the Named-Actor owner refuses every write for it
 * (`actorBoundaryViolation`), so a committed source necessarily preceded the binding; the load verifier re-proves it from
 * the committed revisions. Returns a message, or null.
 */
export function pcCarryForwardViolation(
  basis: PcCapabilityBasis,
  e: PcExistingActorCarryForwardEstablishment,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): string | null {
  const binding = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const bound = binding ? PlayerCharacterBindingSchema.safeParse(binding.value) : undefined;
  if (!binding || binding.owner !== OWNER_ROLE_REGISTRY || !bound?.success) {
    return "the Existing-Actor → PC handover is not committed: a carry-forward has no cutover basis, and an actor's capability is never carried into a PC that was not handed over";
  }
  if (binding.version !== e.handover.version) {
    return "the carry-forward is pinned to the committed handover binding at its exact version";
  }
  if (
    bound.data.transition.type !== EXISTING_ACTOR_HANDOVER ||
    bound.data.active_pc.entity_id !== basis.pc_id
  ) {
    return "the committed binding is not the EXISTING_ACTOR_HANDOVER of this identity: an ordinary ACTIVATION, or another identity's binding, is no basis for carrying an actor's capability";
  }
  const contract = facts.get(pcExistenceContractKey(basis.pc_id));
  const parsed = contract ? ExistenceContractSchema.safeParse(contract.value) : undefined;
  if (
    !contract ||
    contract.owner !== OWNER_PC_EXISTENCE ||
    !parsed?.success ||
    parsed.data.pc_id !== basis.pc_id ||
    parsed.data.existing_actor_compilation === undefined
  ) {
    return "the PC's Existence Contract is not the released existing-actor compilation of this identity";
  }
  if (bound.data.transition.basis.pinned_versions.pc !== contract.version) {
    return "the handover consumed the Existence Contract at the version committed now";
  }
  if (e.source.fact_key !== actorCapabilityKey(basis.pc_id, basis.capability_id)) {
    return "the source is this identity's own Named-Actor capability for this capability (a basis, another identity or another capability is no source)";
  }
  const source = facts.get(e.source.fact_key);
  if (!source || source.owner !== OWNER_NAMED_ACTOR || source.facet !== FACET_ACTOR_PROFILE) {
    return "the source Named-Actor capability is not committed: only an already-authoritative capability carries, never a mere basis";
  }
  if (source.version !== e.source.version) {
    return "the carry-forward is pinned to the committed source capability at its exact version";
  }
  const capability = NamedActorCapabilitySchema.safeParse(source.value);
  if (
    !capability.success ||
    capability.data.actor_id !== basis.pc_id ||
    capability.data.capability_id !== basis.capability_id
  ) {
    return "the source is not a Named-Actor capability of this identity and capability";
  }
  if (!canonicalEqual(capability.data.marker, basis.marker)) {
    return "the carried marker is exactly the source capability's marker: it is neither re-resolved nor altered";
  }
  return null;
}

/**
 * The basis a carry-forward of one identity's capability determines, built MECHANICALLY from committed facts (the one
 * statement the adapter uses; admission and load verification re-derive with `pcCarryForwardViolation`): the committed
 * handover binding and the identity's committed Named-Actor capability are cited by exact version, and the source's marker
 * is transcribed unchanged (`null` included). Nothing is resolved here — no reroll, world prior, Causal Draw, Mirror
 * derivation, regrading or recalibration. Fails closed when there is no committed handover or no authoritative source
 * capability (a mere basis is not one).
 */
export function deriveCarryForwardBasis(
  pcId: string,
  capabilityId: string,
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get">,
): Result<PcCapabilityBasis, "PREREQUISITE_MISSING" | "REFERENCE_INVALID"> {
  const binding = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  if (!binding) {
    return fail(
      "PREREQUISITE_MISSING",
      "the Existing-Actor → PC handover is not committed: nothing is carried before the ownership cutover",
    );
  }
  const sourceKey = actorCapabilityKey(pcId, capabilityId);
  const source = facts.get(sourceKey);
  if (!source) {
    return fail(
      "PREREQUISITE_MISSING",
      "the actor's authoritative capability is not committed: only an already-authoritative capability carries, never a mere basis",
    );
  }
  const capability =
    source.owner === OWNER_NAMED_ACTOR && source.facet === FACET_ACTOR_PROFILE
      ? NamedActorCapabilitySchema.safeParse(source.value)
      : undefined;
  if (!capability?.success) {
    return fail("REFERENCE_INVALID", "the source is not a committed Named-Actor capability");
  }
  return ok({
    pc_id: pcId,
    capability_id: capabilityId,
    marker: capability.data.marker,
    establishment: {
      method: PC_ESTABLISHMENT_EXISTING_ACTOR_CARRY_FORWARD,
      handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: binding.version },
      source: { fact_key: sourceKey, version: source.version },
    },
  });
}

/** True when the basis is the inherited-mastery establishment of an already-handed-over existing actor. */
export const pcBasisIsCarryForward = (basis: PcCapabilityBasis): boolean =>
  basis.establishment.method === PC_ESTABLISHMENT_EXISTING_ACTOR_CARRY_FORWARD;

/**
 * The committed facts a received basis must read at their current version and depend on (pinned, never copied): the PC's
 * Existence Contract for a fresh PC; for a carry-forward additionally the handover binding and the source capability.
 */
export function pcBasisPrerequisites(
  basis: PcCapabilityBasis,
): readonly { readonly key: string; readonly what: string }[] {
  const e = basis.establishment;
  if (e.method === PC_ESTABLISHMENT_ACCEPTED_GENERATION_HISTORY) {
    return [{ key: e.contract.fact_key, what: "the PC's released Existence Contract" }];
  }
  return [
    {
      key: pcExistenceContractKey(basis.pc_id),
      what: "the PC's released existing-actor Existence Contract",
    },
    { key: e.handover.fact_key, what: "the committed Existing-Actor → PC handover binding" },
    { key: e.source.fact_key, what: "the actor's committed Named-Actor capability" },
  ];
}

/**
 * The one-owner boundary of a PC capability (WS-016 §32 "duplicate ownership of PC or Named-Actor state", §28; WS-006
 * W3-CP3: F-014A is writable only under lawful non-PC actor ownership). By identity only — no scan:
 *
 *  - the same identity and capability must not already be held by the Named-Actor owner (its basis or its capability): a
 *    second owner of one capability is exactly the duplicate ownership the protocol forbids — EXCEPT for an
 *    EXISTING_ACTOR_CARRY_FORWARD (`carriedForward`), whose very source is that Named-Actor capability. That is lawful
 *    because the carry-forward is only admitted against the committed handover, after which the actor owner is no longer
 *    writable (`actorBoundaryViolation`): the predecessor is immutable cold provenance/history, not a rival owner;
 *  - an identity that is a Population ledger's own is an aggregate, never given an individual mastery record.
 *
 * Returns a message, or null when the identity/capability is free for the PC owner as far as committed facts show.
 */
export function pcCapabilityBoundaryViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "has">,
  pcId: string,
  capabilityId: string,
  carriedForward = false,
): string | null {
  if (
    !carriedForward &&
    (facts.has(actorCapabilityBasisKey(pcId, capabilityId)) ||
      facts.has(actorCapabilityKey(pcId, capabilityId)))
  ) {
    return "the identity's capability is already held by the Named-Actor owner: a capability has one owner, and an existing actor's capability enters the PC only by the distinct EXISTING_ACTOR_CARRY_FORWARD after the handover";
  }
  if (facts.has(populationLedgerKey(pcId))) {
    return "the identity is a Population ledger: an aggregate is never given an individual Character Capability record";
  }
  return null;
}
