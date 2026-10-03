import {
  NamedActorCapabilityBasisSchema,
  NamedActorCapabilitySchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  actorCapabilityStage,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  actorBoundaryViolation,
  capabilityDrawStateExists,
  causeOwnerViolation,
  deriveCapability,
  isRandomizedBasis,
  randomizedEstablishmentViolation,
} from "./derive.ts";

/**
 * IM-11 admission for the IM-07 Named-Actor capability owner (IM-03 owner resolution; WS-016 §§2, 3, 4, 16, 20, 27.1,
 * 28; WS-006 W3-CP3 PC-control handover). Pure: a function of (group, state) only, so it holds for a raw
 * `store.commit` as much as for the owner paths. Key-space exclusivity (nobody but `named_actor`/`actor_profile` can
 * write an `actor/…` key, and the actor owner can write no canonical, kernel, Population, Production, Economy,
 * World-State, Logistics or foreign key) is enforced by the owner registry before this runs; this enforces that even
 * the Named-Actor owner can change its state in exactly two lawful ways, each create-only and re-derived:
 *
 *  1. ESTABLISHMENT BASIS: the authored record of one capability of one Named Actor — established from committed
 *     foreign facts that are PINNED (read at their current version and depended on) and never copied, for an identity
 *     that is no Player Character, no entity under player control and no Population ledger. It is either causally
 *     determined by those causes, or — only where genuine uncertainty remained — randomized within the owner's bounded
 *     prior by a COMMITTED Causal Draw (F-027-CD1 CD-CC-01): the group then reads that exact result fact/version and
 *     depends on its canonical result group, and the marker is re-derived as the owner's reading of the selected
 *     candidate. Once Causal Draw evidence exists for the slot, only the establishment that reads it may fill the slot,
 *     so the randomized path can be neither bypassed nor redrawn.
 *  2. CAPABILITY CLOSE, only as its IM-02 stage: exactly what the committed basis determines, published under the
 *     stage identity and the durable authority of an open transaction. Without a committed basis there is nothing to
 *     derive it from, so no consequence, caller or raw commit can conjure a capability.
 */
export function namedActorGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  if (group.writes.length === 1 && group.writes[0]!.expected_version === 0) {
    const w = group.writes[0]!;
    if (kindOf(w.key) === "named_actor_capability_basis") return checkBasis(group, state, w);
    if (kindOf(w.key) === "named_actor_capability") return checkCapabilityClose(group, state, w);
  }
  return reject(
    "VALUE_INVALID",
    "Named-Actor capability state changes only by one establishment basis or one capability close, each created once",
  );
}

type Write = CommitGroup["writes"][number];

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

function checkBasis(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const b = NamedActorCapabilityBasisSchema.parse(w.value);
  if (w.key !== actorCapabilityBasisKey(b.actor_id, b.capability_id)) {
    return ref("the basis is at the key derived from its actor and capability", { key: w.key });
  }
  const boundary = actorBoundaryViolation(state.facts, b.actor_id);
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: w.key });
  if (
    !isRandomizedBasis(b) &&
    capabilityDrawStateExists(state.facts, b.actor_id, b.capability_id)
  ) {
    return ref(
      "Causal Draw evidence exists for this establishment: only the establishment that reads the committed draw may fill the slot",
      { key: w.key },
    );
  }
  for (const cause of b.establishment.causes) {
    const foreign = causeOwnerViolation(cause.owner);
    if (foreign) return ref(foreign, { key: cause.fact_key });
    const pinned = requirePrerequisite(group, state, cause.fact_key, "a causal input");
    if (isRejection(pinned)) return pinned;
    if (pinned.fact.owner !== cause.owner || pinned.fact.version !== cause.version) {
      return ref(
        "a cause is its source owner's own committed fact, pinned at its current version and never copied",
        { key: cause.fact_key },
      );
    }
  }
  if (isRandomizedBasis(b)) {
    // the committed draw result is a prerequisite: read at its exact version, its result group depended on
    const result = requirePrerequisite(
      group,
      state,
      b.establishment.draw.result.fact_key,
      "the committed Causal Draw result",
    );
    if (isRejection(result)) return result;
    const violation = randomizedEstablishmentViolation(b, state.facts);
    if (violation) return bad(violation, { key: w.key });
  }
  return null;
}

function checkCapabilityClose(
  group: CommitGroup,
  state: CampaignState,
  w: Write,
): Rejection | null {
  const c = NamedActorCapabilitySchema.parse(w.value);
  if (w.key !== actorCapabilityKey(c.actor_id, c.capability_id)) {
    return ref("the capability is at the key derived from its actor and capability", {
      key: w.key,
    });
  }
  const basisKey = actorCapabilityBasisKey(c.actor_id, c.capability_id);
  const basisP = requirePrerequisite(group, state, basisKey, "the establishment basis");
  if (isRejection(basisP)) return basisP;
  const basis = NamedActorCapabilityBasisSchema.safeParse(basisP.fact.value);
  if (!basis.success || basisP.fact.version !== c.basis.version || c.basis.fact_key !== basisKey) {
    return ref("the basis is pinned at its current version", { key: basisKey });
  }
  if (group.reads.length !== 1) {
    return ref("a capability close reads exactly its establishment basis", { key: w.key });
  }
  // the PC-authorship boundary holds at the close as well: an entity that came under player control (or became an
  // aggregate identity) between the basis and the close is no longer a lawful Named-Actor subject
  const boundary = actorBoundaryViolation(state.facts, c.actor_id);
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: w.key });
  const derived = deriveCapability({
    key: basisP.fact.key,
    owner: basisP.fact.owner,
    version: basisP.fact.version,
    value: basis.data,
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key });
  if (!canonicalEqual(derived.value, c)) {
    return bad(
      "a capability is exactly what its establishment basis determines: the authored marker, its basis pointer and its close, with no other state",
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
    actorCapabilityStage(c.actor_id, c.capability_id),
    state.facts,
    time.data.canonical_time,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: w.key });
  return null;
}
