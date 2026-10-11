import {
  ExistenceContractSchema,
  FACET_PC_VOLUNTARY_COMMITMENT,
  MovementServiceRequestSchema,
  OWNER_PC_EXISTENCE,
  PLAYER_CHARACTER_BINDING_KEY,
  PcMovementCommitInputSchema,
  PcMovementCommitmentSchema,
  PcPhysicalLocusCustodySchema,
  PlayerCharacterBindingSchema,
  WorldLocusSchema,
  fail,
  ok,
  pcExistenceContractKey,
  pcMovementCommitmentId,
  pcMovementCommitmentKey,
  pcMovementRequestId,
  pcMovementRequestKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  PC_MOVEMENT_INTENT_KIND,
  type CommitGroup,
  type MovementServiceRequest,
  type OwnerFact,
  type PcMovementCommitInput,
  type PcMovementCommitment,
  type Result,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import {
  isPostHandoverCustody,
  pcPhysicalLocusCustodyViolation,
  type FactView,
} from "../world/pc-locus-custody.ts";

/**
 * The Active-PC voluntary-movement commitment-of-record and the PC-owned Movement Service Request (IM-07; the frozen
 * Post-Handover Physical Locus Ownership & Relocation Contract §4, §8, §10, §14; WS-010 §3.1; I-002 as the current lawful
 * PC-state owner).
 *
 * The PLAYER authors willingness only: one voluntary relocation of the continuing PC to one already-established lawful locus, under
 * role.player + permission.player_choice.commit. That commitment-of-record is not a world result, not a Logistics commitment and
 * not arrival; the PC-owned Movement Service Request is derived from it mechanically and is exactly the existing WS-010 §3.1
 * envelope. Neither invents a route, a duration, a cost, a success or a willingness: Logistics never creates willingness, and the
 * moved physical subject is admitted separately, from the lawful physical custodian (the PC's custody record), never from a
 * fabricated fallback entity.
 */

const refuse = (message: string) => fail("PREREQUISITE_MISSING", message);

/**
 * The commitment-of-record a structured lawful player commitment determines. Pure and mechanical: the caller names identities and
 * its authored authority only; every pin is a version read from committed state. Refused when a prerequisite is not committed (a
 * missing referent is never invented; it is pinned at 0 only for the caller to surface as PREREQUISITE_MISSING at admission).
 */
export function derivePcMovementCommitment(
  input: PcMovementCommitInput,
  source: { getFact(key: string): OwnerFact | undefined },
): Result<PcMovementCommitment, "PREREQUISITE_MISSING"> {
  const version = (k: string): number => source.getFact(k)?.version ?? 0;
  const pcId = input.pc_id;
  const worldKey = worldProfileKey(input.destination.world_id);
  const locusKey = worldLocusKey(input.destination.world_id, input.destination.locus_id);
  const value = PcMovementCommitmentSchema.safeParse({
    commitment_id: pcMovementCommitmentId(pcId),
    pc_id: pcId,
    authored_under: input.authored_under,
    intent: {
      kind: PC_MOVEMENT_INTENT_KIND,
      destination: {
        world: { fact_key: worldKey, entity_id: input.destination.world_id },
        locus: { fact_key: locusKey, entity_id: input.destination.locus_id },
      },
    },
    basis: {
      pinned_versions: {
        pc: version(pcExistenceContractKey(pcId)),
        binding: version(PLAYER_CHARACTER_BINDING_KEY),
        custody: version(worldPcLocusCustodyKey(pcId)),
        world: version(worldKey),
        locus: version(locusKey),
      },
    },
    committer: { owner: OWNER_PC_EXISTENCE, facet: FACET_PC_VOLUNTARY_COMMITMENT },
  });
  return value.success ? ok(value.data) : refuse("the result is not a representable commitment");
}

/** Whether a raw structured input is a lawful player commitment shape (exposed for the publication boundary). */
export const parsePcMovementCommitInput = (v: unknown) => PcMovementCommitInputSchema.safeParse(v);

/**
 * The PC-owned Movement Service Request a commitment-of-record determines: exactly the existing envelope, naming the continuing PC
 * as the moved subject by reference to its World-State physical custody record, the commitment-of-record as its cause, and the one
 * destination locus. There is no priority/authority reference (none is representable).
 */
export function derivePcMovementRequest(commitment: PcMovementCommitment): MovementServiceRequest {
  const pcId = commitment.pc_id;
  return {
    request_id: pcMovementRequestId(pcId),
    source: { owner: OWNER_PC_EXISTENCE, cause_ref: pcMovementCommitmentKey(pcId) },
    subject: { fact_key: worldPcLocusCustodyKey(pcId), entity_id: pcId },
    destination: commitment.intent.destination,
    priority_authority_ref: null,
  };
}

/**
 * The single statement of what a voluntary-movement commitment-of-record must be, given the committed facts it is judged against
 * (used by admission when it is written and again by load verification against the facts as they stood BEFORE it, so the two cannot
 * drift). It judges identity, ownership, authority and provenance only:
 *
 *  - the fact is at the slot derived from its PC identity, with the identity derived from it (one journey slot per PC);
 *  - the operative binding names this very PC, at exactly the pinned version (an absent, other or stale binding fails);
 *  - the PC's released contract and its one stationary physical-custody record (PR #41, the sole current-locus authority while
 *    stationary) are committed at the pinned versions, and the custody record still holds as the one authority
 *    (`pcPhysicalLocusCustodyViolation`: another current-locus authority, a stale pin or a forged record fails);
 *  - the destination is an established locus of the PC's own world, at the pinned versions, distinct from where the PC stationarily is.
 *
 * Returns a message, or null when the commitment holds.
 */
export function pcMovementCommitmentViolation(
  key: string,
  c: PcMovementCommitment,
  facts: FactView,
): string | null {
  const pcId = c.pc_id;
  if (key !== pcMovementCommitmentKey(pcId) || c.commitment_id !== pcMovementCommitmentId(pcId)) {
    return "a movement commitment is at the slot, and has the identity, derived from its PC identity";
  }
  const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const binding = bindingFact ? PlayerCharacterBindingSchema.safeParse(bindingFact.value) : null;
  if (!bindingFact || !binding?.success) return "no active PC binding is committed";
  if (binding.data.active_pc.entity_id !== pcId) {
    return "the active PC binding names this very PC: a wrong or inactive PC cannot commit to movement";
  }
  const pcFact = facts.get(pcExistenceContractKey(pcId));
  if (!pcFact || !ExistenceContractSchema.safeParse(pcFact.value).success) {
    return "the PC's released contract is committed";
  }
  const custodyKey = worldPcLocusCustodyKey(pcId);
  const custodyFact = facts.get(custodyKey);
  const custody = custodyFact ? PcPhysicalLocusCustodySchema.safeParse(custodyFact.value) : null;
  if (!custodyFact || !custody?.success) {
    return "the PC's physical-locus custody record is committed: nothing is moved from an invented or inferred locus";
  }
  if (!isPostHandoverCustody(custody.data)) {
    return "voluntary movement is limited to the post-handover branch: an original-activation custody states where the PC stationarily is and implies no movement";
  }
  const custodyViolation = pcPhysicalLocusCustodyViolation(custodyKey, custody.data, facts);
  if (custodyViolation)
    return `the PC's custody does not hold as the one authority: ${custodyViolation}`;
  const d = c.intent.destination;
  const worldKey = worldProfileKey(d.world.entity_id);
  const locusKey = worldLocusKey(d.world.entity_id, d.locus.entity_id);
  if (d.world.fact_key !== worldKey || d.locus.fact_key !== locusKey) {
    return "destination references do not match their key identities";
  }
  const world = facts.get(worldKey);
  const locusFact = facts.get(locusKey);
  const locus = locusFact ? WorldLocusSchema.safeParse(locusFact.value) : null;
  if (!world || !locusFact || !locus?.success || locus.data.world.entity_id !== d.world.entity_id) {
    return "the destination is an established lawful locus of its world: a commitment creates none";
  }
  const pins = c.basis.pinned_versions;
  if (
    pins.pc !== pcFact.version ||
    pins.binding !== bindingFact.version ||
    pins.custody !== custodyFact.version ||
    pins.world !== world.version ||
    pins.locus !== locusFact.version
  ) {
    return "the commitment was not authored against the committed contract, binding, custody, world and locus versions: a stale or forged commitment fails";
  }
  if (d.world.entity_id !== custody.data.stationary_locus.world.entity_id) {
    return "a single-leg movement stays within the PC's world";
  }
  if (d.locus.entity_id === custody.data.stationary_locus.locus.entity_id) {
    return "a relocation changes the PC's locus: the destination is not where the PC already is";
  }
  return null;
}

/**
 * The single statement of what the PC-owned Movement Service Request must be: exactly the request the committed commitment-of-record
 * determines (so a forged, altered or foreign request has no lawful value), and the commitment it derives from still holds.
 */
export function pcMovementRequestViolation(
  key: string,
  r: MovementServiceRequest,
  facts: FactView,
): string | null {
  const pcId = r.subject.entity_id;
  if (key !== pcMovementRequestKey(pcId)) {
    return "a PC-owned movement request is at the slot derived from its PC identity";
  }
  const commitmentKey = pcMovementCommitmentKey(pcId);
  const commitmentFact = facts.get(commitmentKey);
  const commitment = commitmentFact
    ? PcMovementCommitmentSchema.safeParse(commitmentFact.value)
    : null;
  if (!commitmentFact || !commitment?.success) {
    return "a PC-owned request exists only for a committed player commitment: Logistics and World-State create no willingness";
  }
  const violation = pcMovementCommitmentViolation(commitmentKey, commitment.data, facts);
  if (violation) return `the commitment-of-record does not hold: ${violation}`;
  if (!canonicalEqual(r, derivePcMovementRequest(commitment.data))) {
    return "a PC-owned request is exactly what the player's commitment-of-record determines: the PC, to the committed destination, once";
  }
  return null;
}

/**
 * IM-11 admission of the PC-movement facet (a third facet of the one PC owner). Exactly one write: the commitment-of-record, or the
 * PC-owned request. Each reads and depends on every foreign fact it references at its current version (never copied) and
 * re-derives its rule, so Logistics, World-State, a consumer or a raw `store.commit` cannot create, alter or duplicate either.
 */
export function pcMovementGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length !== 1) {
    return reject("VALUE_INVALID", "one publication establishes exactly one PC movement fact");
  }
  const w = group.writes[0]!;
  const kind = resolveKey(w.key)?.kind.id;
  const need = (key: string, what: string) => requirePrerequisite(group, state, key, what);
  if (kind === "pc_movement_commitment") {
    const c = PcMovementCommitmentSchema.parse(w.value);
    const d = c.intent.destination;
    const prerequisites: readonly (readonly [string, string])[] = [
      [pcExistenceContractKey(c.pc_id), "the PC's released contract"],
      [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
      [worldPcLocusCustodyKey(c.pc_id), "the PC's physical-locus custody record"],
      [d.world.fact_key, "the destination world profile"],
      [d.locus.fact_key, "the destination locus"],
    ];
    for (const [key, what] of prerequisites) {
      const p = need(key, what);
      if (isRejection(p)) return p;
    }
    const violation = pcMovementCommitmentViolation(w.key, c, state.facts);
    return violation ? reject("REFERENCE_INVALID", violation, { key: w.key }) : null;
  }
  if (kind === "pc_movement_request") {
    const r = MovementServiceRequestSchema.parse(w.value);
    const prerequisites: readonly (readonly [string, string])[] = [
      [pcMovementCommitmentKey(r.subject.entity_id), "the player's movement commitment-of-record"],
      [r.subject.fact_key, "the PC's physical-locus custody record"],
      [r.destination.locus.fact_key, "the destination locus"],
    ];
    for (const [key, what] of prerequisites) {
      const p = need(key, what);
      if (isRejection(p)) return p;
    }
    const violation = pcMovementRequestViolation(w.key, r, state.facts);
    return violation ? reject("REFERENCE_INVALID", violation, { key: w.key }) : null;
  }
  return reject("VALUE_INVALID", "the PC movement facet holds only the commitment and the request");
}
