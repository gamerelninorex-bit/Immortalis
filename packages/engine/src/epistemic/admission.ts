import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessDisseminationEventSchema,
  AccessEventSchema,
  AccessiblePacketSchema,
  NamedActorCapabilitySchema,
  PcCapabilitySchema,
  SealedEngineProvenanceSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  timeAtOrBefore,
  timeEquals,
  type AccessEvent,
  type BroadcastExposureEvent,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  EPISTEMIC_ACCESS_BROADCAST_RULE,
  EPISTEMIC_ACCESS_RULE,
  resolveKey,
} from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  broadcastReferenceViolation,
  deriveAccessProducts,
  eventRecipient,
  isBroadcastEvent,
  eventSourceViolation,
  isPcRecipientEvent,
  recipientBoundaryViolation,
  requiredCapability,
} from "./derive.ts";

/**
 * IM-11 admission for the IM-10 Epistemic Access owner (IM-03 owner resolution; F-014D §§2, 2.1, 4.1, 4.2, 5, 9, 11, 14,
 * 18, 21, 24; RC-11). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the
 * owner paths. Key-space exclusivity (nobody but `epistemic_access` can write an `access/…` key, and the Epistemic owner
 * can write no canonical, kernel, Population, Production, Economy, World-State, Logistics or Named-Actor key) is enforced
 * by the owner registry before this runs; this enforces that even the Epistemic owner can change its state in exactly two
 * lawful ways, each create-only and re-derived:
 *
 *  1. ACCESS EVENT: one BOUNDED_SHARED_ACCESS event for one named recipient — a non-PC Named-Actor subject, or the active
 *     Player Character the committed Role Registry binding names (and only when the event asserts that role) — resting on a committed foreign
 *     source/carrier fact that is PINNED (read at its current version and depended on) and never copied, established at
 *     or before the canonical basis (no future access), stamped engine-sealed.
 *  1b. BROADCAST_EXPOSURE EVENT (F-014D §4.4), the same key, the other immutable mode: one event-only record resting on a
 *     committed foreign source/carrier AND a committed authoritative World-State locus or Population ledger/Cohort audience
 *     REFERENCE, each PINNED (read at its current version and depended on, never copied), under its own governing-rule
 *     citation, no future dissemination basis, engine-sealed. It forms no packet, names no recipient and writes nothing else.
 *  2. PACKET FORMATION, only as its IM-02 stage: exactly the two surfaces the committed event (and the committed
 *     capability, read at its declared close, where the payload's form depends on one) determine — the actor-safe
 *     Accessible Content Packet and the engine-only Sealed Engine Provenance — written together, once, under the stage
 *     identity and the durable authority of an open transaction. Without a committed event there is nothing to derive a
 *     packet from, so no consequence, caller or raw commit can conjure access.
 */
export function epistemicGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  // a new write carries the CURRENT governing-rule citation: the superseded one is accepted on load for predecessor facts
  // only, so a raw commit cannot stamp it on an active-PC fact
  const rule = () =>
    canonicalEqual(group.rule, EPISTEMIC_ACCESS_RULE)
      ? null
      : ref(
          "an Epistemic fact is committed under the current governing-rule citation of its kind",
          {
            key: group.writes[0]!.key,
          },
        );
  // a BROADCAST_EXPOSURE event carries its own current citation and no other
  const broadcastRule = (g: CommitGroup, w: CommitGroup["writes"][number]) =>
    canonicalEqual(g.rule, EPISTEMIC_ACCESS_BROADCAST_RULE)
      ? null
      : ref(
          "a BROADCAST_EXPOSURE event is committed under the governing-rule citation of its mode",
          { key: w.key },
        );
  if (group.writes.length === 1 && group.writes[0]!.expected_version === 0) {
    const w = group.writes[0]!;
    if (kindOf(w.key) === "epistemic_access_event") {
      const parsed = AccessDisseminationEventSchema.safeParse(w.value);
      if (parsed.success && isBroadcastEvent(parsed.data)) {
        return broadcastRule(group, w) ?? checkBroadcastEvent(group, state, w, parsed.data);
      }
      return rule() ?? checkEvent(group, state, w);
    }
  }
  if (
    group.writes.length === 2 &&
    group.writes.every((w) => w.expected_version === 0) &&
    kindOf(group.writes[0]!.key) === "epistemic_accessible_packet" &&
    kindOf(group.writes[1]!.key) === "epistemic_sealed_provenance"
  ) {
    return rule() ?? checkFormation(group, state, group.writes[0]!, group.writes[1]!);
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
  // the recipient is a lawful Named-Actor subject (no Player Character, no entity under player control, no aggregate) or,
  // only when the event asserts the role, exactly the active Player Character the Role Registry binding names
  const boundary = recipientBoundaryViolation(state.facts, e);
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: w.key });
  const foreign = eventSourceViolation(e);
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

/**
 * A BROADCAST_EXPOSURE event: the source/carrier and the audience authority are each a committed, foreign, correctly owned
 * fact pinned at its current version (so neither can be stale, uncommitted, or a later roster read back into an earlier
 * event), the references are lawful kinds, and the dissemination basis is not in the future. Exactly those two reads and
 * the groups that committed them: no other read or dependency can ride on it.
 */
function checkBroadcastEvent(
  group: CommitGroup,
  state: CampaignState,
  w: Write,
  e: BroadcastExposureEvent,
): Rejection | null {
  if (w.key !== accessEventKey(e.event_id)) {
    return ref("the event is at the key derived from its identity", { key: w.key });
  }
  if (w.secrecy !== ACCESS_CLASS_ENGINE_SEALED) {
    return bad("an access event is engine-side: it carries the engine-sealed access class", {
      key: w.key,
    });
  }
  const violation = broadcastReferenceViolation(e);
  if (violation) return ref(violation, { key: w.key });
  const refs = [
    { pin: e.source, what: "the source/carrier" },
    { pin: e.audience, what: "the audience authority" },
  ] as const;
  if (
    group.reads.length !== refs.length ||
    refs.some((r, i) => group.reads[i]!.key !== r.pin.fact_key)
  ) {
    return ref(
      "a broadcast event reads exactly its source/carrier and its audience authority, in that order",
      { key: w.key },
    );
  }
  const groups = new Set<string>();
  for (const { pin, what } of refs) {
    const pinned = requirePrerequisite(group, state, pin.fact_key, what);
    if (isRejection(pinned)) return pinned;
    if (pinned.fact.owner !== pin.owner || pinned.fact.version !== pin.version) {
      return ref(
        `${what} is its owner's own committed fact, pinned at its current version and never copied`,
        { key: pin.fact_key },
      );
    }
    groups.add(pinned.fact.provenance.group_id);
  }
  if (group.depends_on.length !== groups.size || group.depends_on.some((g) => !groups.has(g))) {
    return ref(
      "a broadcast event depends on exactly the groups that committed its two references",
      {
        key: w.key,
      },
    );
  }
  // F-014D §21.1, §21.11–12: no dissemination effect lies in the future of the canonical basis, and no foreign record carries
  // a past-basis time stamp, so the pinned source and audience cannot be shown to have existed AS OF an earlier basis. An
  // earlier basis would let evidence committed after it establish the earlier event, so only the CURRENT canonical basis is
  // admitted: an unverifiable historical-basis claim fails closed rather than being certified.
  const now = canonicalTime(state);
  if (!now) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: TEMPORAL_STATE_KEY,
    });
  }
  if (!timeEquals(e.dissemination_basis, now)) {
    return ref(
      "a broadcast is based at the current canonical basis only: its source and audience carry no past-basis time stamp, so an earlier or future basis cannot be verified",
      { key: w.key },
    );
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
  const dissemination = AccessDisseminationEventSchema.safeParse(eventFact.value);
  if (dissemination.success && isBroadcastEvent(dissemination.data)) {
    return reject(
      "VALUE_INVALID",
      "a BROADCAST_EXPOSURE event is never individual receipt: no packet or sealed provenance forms from it, however lowering might later be established",
      { key: eventKey },
    );
  }
  const event = AccessEventSchema.safeParse(eventFact.value);
  if (!event.success || eventRecipient(event.data) !== recipient) {
    return ref("the event names this recipient and is a valid access event", { key: eventKey });
  }
  // the Player-Character / aggregate boundary holds at formation as well, in the class the event asserted: an entity that
  // came under player control between a Named-Actor event and the formation is no longer a lawful Named-Actor subject, and
  // an event that asserts the active-PC role forms only while the Role Registry binding names its recipient
  const boundary = recipientBoundaryViolation(state.facts, event.data);
  if (boundary) return reject("KEY_NOT_ADMITTED", boundary, { key: packetW.key });
  const e: AccessEvent = event.data;

  // exactly the declared reads, in declared order, each at its current version and depended on (RC-07)
  const expected = [eventKey];
  const needed = requiredCapability(e);
  const needsCapability = needed !== null;
  if (needed) expected.push(needed.key);
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
      "a formation reads exactly its event (NOW) and, where the payload's form depends on one, the recipient's capability at its owner's declared close, each at its current version",
      { key: packetW.key },
    );
  }
  let capability = null;
  if (needsCapability) {
    const capFact = state.facts.get(expected[1]!)!;
    const cap = (isPcRecipientEvent(e) ? PcCapabilitySchema : NamedActorCapabilitySchema).safeParse(
      capFact.value,
    );
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
