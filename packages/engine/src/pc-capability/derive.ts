import {
  ExistenceContractSchema,
  OWNER_PC_EXISTENCE,
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
  type Result,
} from "@immortalis/contracts";

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
    return "the Existence Contract compiles an already-existing actor: ACCEPTED_GENERATION_HISTORY would present the actor's inherited mastery as player-authored, Mirror-derived mastery, and carrying an actor's capability into the PC is the existing-actor-to-PC carry-forward, which is not implemented";
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
 * The one-owner boundary of a PC capability (WS-016 §32 "duplicate ownership of PC or Named-Actor state", §28; WS-006
 * W3-CP3: F-014A is writable only under lawful non-PC actor ownership). By identity only — no scan:
 *
 *  - the same identity and capability must not already be held by the Named-Actor owner (its basis or its capability): a
 *    second owner of one capability is exactly the duplicate ownership the protocol forbids, and carrying an existing
 *    actor's fact into the PC is the existing-actor-to-PC handover, which is not implemented and fails closed;
 *  - an identity that is a Population ledger's own is an aggregate, never given an individual mastery record.
 *
 * Returns a message, or null when the identity/capability is free for the PC owner as far as committed facts show.
 */
export function pcCapabilityBoundaryViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "has">,
  pcId: string,
  capabilityId: string,
): string | null {
  if (
    facts.has(actorCapabilityBasisKey(pcId, capabilityId)) ||
    facts.has(actorCapabilityKey(pcId, capabilityId))
  ) {
    return "the identity's capability is already held by the Named-Actor owner: a capability has one owner, and the existing-actor-to-PC handover is not implemented";
  }
  if (facts.has(populationLedgerKey(pcId))) {
    return "the identity is a Population ledger: an aggregate is never given an individual Character Capability record";
  }
  return null;
}
