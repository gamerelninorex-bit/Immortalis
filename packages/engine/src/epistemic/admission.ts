import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessEventSchema,
  AccessiblePacketSchema,
  NamedActorCapabilitySchema,
  SealedEngineProvenanceSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  actorCapabilityKey,
  timeAtOrBefore,
  type AccessEvent,
  type CommitGroup,
} from "@immortalis/contracts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import { deriveAccessProducts, eventRecipient, sourceOwnerViolation } from "./derive.ts";

/**
 * IM-11 admission for the IM-10 Epistemic Access owner (IM-03 owner resolution; F-014D §§2, 2.1, 4.1, 4.2, 5, 9, 11, 14,
 * 18, 21, 24; RC-11). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the
 * owner paths. Key-space exclusivity (nobody but `epistemic_access` can write an `access/…` key, and the Epistemic owner
 * can write no canonical, kernel, Population, Production, Economy, World-State, Logistics or Named-Actor key) is enforced
 * by the owner registry before this runs; this enforces that even the Epistemic owner can change its state in exactly two
 * lawful ways, each create-only and re-derived:
 *
 *  1. ACCESS EVENT: one BOUNDED_SHARED_ACCESS event for one named non-PC recipient, resting on a committed foreign
 *     source/carrier fact that is PINNED (read at its current version and depended on) and never copied, established at
 *     or before the canonical basis (no future access), stamped engine-sealed.
 *  2. PACKET FORMATION, only as its IM-02 stage: exactly the two surfaces the committed event (and the committed
 *     capability, read at its declared close, where the payload's form depends on one) determine — the actor-safe
 *     Accessible Content Packet and the engine-only Sealed Engine Provenance — written together, once, under the stage
 *     identity and the durable authority of an open transaction. Without a committed event there is nothing to derive a
 *     packet from, so no consequence, caller or raw commit can conjure access.
 */
export function epistemicGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  if (group.writes.length === 1 && group.writes[0]!.expected_version === 0) {
    const w = group.writes[0]!;
    if (kindOf(w.key) === "epistemic_access_event") return checkEvent(group, state, w);
  }
  if (
    group.writes.length === 2 &&
    group.writes.every((w) => w.expected_version === 0) &&
    kindOf(group.writes[0]!.key) === "epistemic_accessible_packet" &&
    kindOf(group.writes[1]!.key) === "epistemic_sealed_provenance"
  ) {
    return checkFormation(group, state, group.writes[0]!, group.writes[1]!);
  }
  return reject(
    "VALUE_INVALID",
    "Epistemic access state changes only by one access event or one packet formation (the packet and its sealed provenance, together), each created once",
  );
}

type Write = CommitGroup["writes"][number];

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

function canonicalTime(state: CampaignState) {
  const clock = state.facts.get(TEMPORAL_STATE_KEY);
  const time = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  return time?.success ? time.data.canonical_time : null;
}

function checkEvent(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = AccessEventSchema.safeParse(w.value);
  if (!parsed.success) return bad("the access event violates its contract", { key: w.key });
  const e = parsed.data;
  if (w.key !== accessEventKey(e.event_id)) {
    return ref("the event is at the key derived from its identity", { key: w.key });
  }
  if (w.secrecy !== ACCESS_CLASS_ENGINE_SEALED) {
    return bad("an access event is engine-side: it carries the engine-sealed access class", {
      key: w.key,
    });
  }
  // the recipient is a lawful Named-Actor subject: no Player Character, no entity under player control, no aggregate
  const boundary = actorBoundaryViolation(state.facts, eventRecipient(e));
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: w.key });
  const foreign = sourceOwnerViolation(e.source.owner);
  if (foreign) return ref(foreign, { key: e.source.fact_key });
  // the causal route rests on a committed fact of its own owner, pinned at its current version and depended on
  const pinned = requirePrerequisite(group, state, e.source.fact_key, "the source/carrier");
  if (isRejection(pinned)) return pinned;
  if (pinned.fact.owner !== e.source.owner || pinned.fact.version !== e.source.version) {
    return ref(
      "the source is its owner's own committed fact, pinned at its current version and never copied",
      { key: e.source.fact_key },
    );
  }
  // no epistemic effect precedes its causal access route and no future state is knowable (F-014D §21.1)
  const now = canonicalTime(state);
  if (!now) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: TEMPORAL_STATE_KEY,
    });
  }
  if (!timeAtOrBefore(e.established_at, now)) {
    return ref("access is established at or before the canonical basis, never in its future", {
      key: w.key,
    });
  }
  return null;
}

function checkFormation(
  group: CommitGroup,
  state: CampaignState,
  packetW: Write,
  provW: Write,
): Rejection | null {
  const packetResolved = resolveKey(packetW.key);
  const provResolved = resolveKey(provW.key);
  const eventId = packetResolved?.ids[0];
  const recipient = packetResolved?.ids[1];
  if (
    !eventId ||
    !recipient ||
    provResolved?.ids[0] !== eventId ||
    provResolved.ids[1] !== recipient ||
    packetW.key !== accessPacketKey(eventId, recipient) ||
    provW.key !== accessProvenanceKey(eventId, recipient)
  ) {
    return ref("a formation writes exactly one recipient's packet and its own sealed provenance", {
      key: packetW.key,
    });
  }
  if (packetW.secrecy !== ACCESS_CLASS_ACTOR_ACCESSIBLE) {
    return bad(
      "only the packet is actor-accessible: it carries the actor-accessible access class",
      {
        key: packetW.key,
      },
    );
  }
  if (provW.secrecy !== ACCESS_CLASS_ENGINE_SEALED) {
    return bad("sealed engine provenance carries the engine-sealed access class", {
      key: provW.key,
    });
  }
  const eventKey = accessEventKey(eventId);
  const eventFact = state.facts.get(eventKey);
  if (!eventFact) {
    return reject(
      "PREREQUISITE_MISSING",
      "a packet forms only from a committed access event: access cannot be conjured",
      { key: eventKey },
    );
  }
  const event = AccessEventSchema.safeParse(eventFact.value);
  if (!event.success || eventRecipient(event.data) !== recipient) {
    return ref("the event names this recipient and is a valid access event", { key: eventKey });
  }
  // the Player-Character / aggregate boundary holds at formation as well: an entity that came under player control
  // between the event and the formation is no longer a lawful Named-Actor subject
  const boundary = actorBoundaryViolation(state.facts, recipient);
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: packetW.key });
  const e: AccessEvent = event.data;

  // exactly the declared reads, in declared order, each at its current version and depended on (RC-07)
  const expected = [eventKey];
  const needsCapability = e.representation !== null;
  if (needsCapability)
    expected.push(actorCapabilityKey(recipient, e.representation!.capability_id));
  if (
    group.reads.length !== expected.length ||
    expected.some((k, i) => group.reads[i]!.key !== k) ||
    expected.some((k, i) => {
      const f = state.facts.get(k);
      return (
        !f || group.reads[i]!.version !== f.version || group.depends_on[i] !== f.provenance.group_id
      );
    })
  ) {
    return ref(
      "a formation reads exactly its event (NOW) and, where the payload's form depends on one, the recipient's capability at its declared close, each at its current version",
      { key: packetW.key },
    );
  }
  let capability = null;
  if (needsCapability) {
    const capFact = state.facts.get(expected[1]!)!;
    const cap = NamedActorCapabilitySchema.safeParse(capFact.value);
    if (!cap.success) return bad("the capability violates its contract", { key: capFact.key });
    capability = {
      fact: { key: capFact.key, owner: capFact.owner, version: capFact.version, value: cap.data },
      committed_by: capFact.provenance.group_id,
    };
  }
  const derived = deriveAccessProducts({
    event: { key: eventFact.key, owner: eventFact.owner, version: eventFact.version, value: e },
    capability,
  });
  if (!derived.ok) return bad(derived.error.message, { key: packetW.key });
  if (
    !AccessiblePacketSchema.safeParse(packetW.value).success ||
    !SealedEngineProvenanceSchema.safeParse(provW.value).success ||
    !canonicalEqual(packetW.value, derived.value.packet) ||
    !canonicalEqual(provW.value, derived.value.provenance)
  ) {
    return bad(
      "a packet is exactly what its committed event determines — the actor-safe payload, presented attribution, access basis, intelligibility and capability-close reference — and its sealed provenance is held separately",
      { key: packetW.key },
    );
  }
  const now = canonicalTime(state);
  if (!now) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: TEMPORAL_STATE_KEY,
    });
  }
  const identity = stageAuthorityViolation(
    group,
    accessPacketStage(eventId, recipient),
    state.facts,
    now,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: packetW.key });
  return null;
}
