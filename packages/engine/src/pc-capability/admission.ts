import {
  PcCapabilityBasisSchema,
  PcCapabilitySchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { PC_CAPABILITY_RULE, resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  derivePcCapability,
  pcBasisIsCarryForward,
  pcBasisPrerequisites,
  pcCapabilityBoundaryViolation,
  pcCapabilityEstablishmentViolation,
} from "./derive.ts";
import { isPcRandomizedBasis, pcCapabilityDrawStateExists } from "./randomized.ts";

/**
 * IM-11 admission for the PC capability profile facet of the one I-002 PC owner (IM-03 owner resolution; WS-016 §§2, 3,
 * 4, 11, 27.1, 28; F-016 PCC-01 to PCC-03). Pure: a function of (group, state) only, so it holds for a raw `store.commit`
 * as much as for the owner paths. Key-space exclusivity (nobody but `pc_existence`/`pc_capability_profile` can write a
 * `pc/<pc>/capability…` key, and that facet can write no Existence Contract, canonical, kernel, Population, Production,
 * Economy, World-State, Logistics, Named-Actor or foreign key) is enforced by the owner registry before this runs; this
 * enforces that even the PC capability facet can change its state in exactly two lawful ways, each create-only and
 * re-derived, each under the current governing-rule citation of its kind (the superseded one is accepted on load for
 * predecessor facts only and is never stamped on a new write):
 *
 *  1. RECEIVED BASIS: the record of one already-established capability of one PC — established EITHER by ACCEPTED
 *     generation history, as accepted claims of that PC's own committed, released Existence Contract, which the group reads
 *     at its current version and depends on (read and pinned, never copied), for an identity/capability that the
 *     Named-Actor owner does not already hold and that is no Population ledger; OR, distinctly, by EXISTING_ACTOR_CARRY_
 *     FORWARD: the same identity/capability's already-authoritative Named-Actor capability, carried exactly across the
 *     committed EXISTING_ACTOR_HANDOVER (the contract, the binding and the source are each read at their current version
 *     and depended on); OR, distinctly, by a WORLD-PRIOR establishment of a capability the actor never had fixed before the
 *     handover: its causes (and, only where genuine uncertainty remained, the committed Causal Draw result, whose canonical
 *     group the basis depends on) are read at their current version and depended on, and once Causal Draw evidence exists
 *     for the slot only the establishment that reads it may fill the slot. The methods never share a provenance path.
 *  2. PC CAPABILITY CLOSE, only as its IM-02 stage: exactly what the committed basis determines, published under the stage
 *     identity and the durable authority of an open transaction. Without a committed basis there is nothing to derive it
 *     from, so no consequence, caller or raw commit can conjure a capability.
 */
export function pcCapabilityGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  if (group.writes.length === 1 && group.writes[0]!.expected_version === 0) {
    const w = group.writes[0]!;
    // a new write carries the CURRENT governing-rule citation: the superseded one is accepted on load for predecessor facts
    // only, so a raw commit cannot stamp it on a world-prior basis (or on the close of one)
    if (
      (kindOf(w.key) === "pc_capability_basis" || kindOf(w.key) === "pc_capability") &&
      !canonicalEqual(group.rule, PC_CAPABILITY_RULE)
    ) {
      return ref(
        "a PC capability fact is committed under the current governing-rule citation of its kind",
        {
          key: w.key,
        },
      );
    }
    if (kindOf(w.key) === "pc_capability_basis") return checkBasis(group, state, w);
    if (kindOf(w.key) === "pc_capability") return checkCapabilityClose(group, state, w);
  }
  return reject(
    "VALUE_INVALID",
    "PC capability state changes only by one received basis or one PC Capability Close, each created once",
  );
}

type Write = CommitGroup["writes"][number];

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

function checkBasis(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const b = PcCapabilityBasisSchema.parse(w.value);
  if (w.key !== pcCapabilityBasisKey(b.pc_id, b.capability_id)) {
    return ref("the basis is at the key derived from its PC and capability", { key: w.key });
  }
  // once Causal Draw evidence exists for the slot, only the establishment that reads it may fill it: the draw can be
  // neither bypassed by a deterministic, carried or generated basis nor redrawn
  if (
    !isPcRandomizedBasis(b) &&
    pcCapabilityDrawStateExists(state.facts, b.pc_id, b.capability_id)
  ) {
    return ref(
      "Causal Draw evidence exists for this establishment: only the establishment that reads the committed draw may fill the slot",
      { key: w.key },
    );
  }
  for (const need of pcBasisPrerequisites(b)) {
    const pinned = requirePrerequisite(group, state, need.key, need.what);
    if (isRejection(pinned)) return pinned;
    if (
      need.cause &&
      (pinned.fact.owner !== need.cause.owner || pinned.fact.version !== need.cause.version)
    ) {
      return ref(
        "a cause is its source owner's own committed fact, pinned at its current version and never copied",
        { key: need.key },
      );
    }
  }
  const established = pcCapabilityEstablishmentViolation(b, state.facts);
  if (established) return ref(established, { key: w.key });
  const boundary = pcCapabilityBoundaryViolation(
    state.facts,
    b.pc_id,
    b.capability_id,
    pcBasisIsCarryForward(b),
  );
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: w.key });
  return null;
}

function checkCapabilityClose(
  group: CommitGroup,
  state: CampaignState,
  w: Write,
): Rejection | null {
  const c = PcCapabilitySchema.parse(w.value);
  if (w.key !== pcCapabilityKey(c.pc_id, c.capability_id)) {
    return ref("the capability is at the key derived from its PC and capability", { key: w.key });
  }
  const basisKey = pcCapabilityBasisKey(c.pc_id, c.capability_id);
  const basisP = requirePrerequisite(group, state, basisKey, "the received basis");
  if (isRejection(basisP)) return basisP;
  const basis = PcCapabilityBasisSchema.safeParse(basisP.fact.value);
  if (!basis.success || basisP.fact.version !== c.basis.version || c.basis.fact_key !== basisKey) {
    return ref("the basis is pinned at its current version", { key: basisKey });
  }
  if (group.reads.length !== 1) {
    return ref("a PC capability close reads exactly its received basis", { key: w.key });
  }
  // the one-owner boundary and the establishment hold at the close as well
  const established = pcCapabilityEstablishmentViolation(basis.data, state.facts);
  if (established) return ref(established, { key: w.key });
  const boundary = pcCapabilityBoundaryViolation(
    state.facts,
    c.pc_id,
    c.capability_id,
    pcBasisIsCarryForward(basis.data),
  );
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: w.key });
  const derived = derivePcCapability({
    key: basisP.fact.key,
    owner: basisP.fact.owner,
    version: basisP.fact.version,
    value: basis.data,
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key });
  if (!canonicalEqual(derived.value, c)) {
    return bad(
      "a PC capability is exactly what its received basis determines: the received marker, its basis pointer and its close, with no other state",
      { key: w.key },
    );
  }
  const clock = state.facts.get(TEMPORAL_STATE_KEY);
  const time = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  if (!time?.success) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: TEMPORAL_STATE_KEY,
    });
  }
  const identity = stageAuthorityViolation(
    group,
    pcCapabilityStage(c.pc_id, c.capability_id),
    state.facts,
    time.data.canonical_time,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: w.key });
  return null;
}
