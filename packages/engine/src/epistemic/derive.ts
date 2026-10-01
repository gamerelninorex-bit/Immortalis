import {
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_NAMED_ACTOR,
  OWNER_TEMPORAL_KERNEL,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  actorCapabilityKey,
  actorCapabilityStage,
  fail,
  ok,
  type AccessEvent,
  type AccessiblePacket,
  type NamedActorCapability,
  type Result,
  type SealedEngineProvenance,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { stageGroupId } from "../temporal/identity.ts";

/**
 * Pure derivations of the Epistemic Access path (F-014D §§2.1, 4.1, 5 steps 2–4, 11, 18; RC-11, RC-14). Each is the
 * single statement of its rule: the owner operation computes with it and IM-11 admission and load-time verification
 * re-derive with it, so a committed Accessible Content Packet and its Sealed Engine Provenance are exactly what the
 * committed event (and, where the payload's form depends on one, the committed capability close) determine — and nothing
 * else.
 *
 * They invent nothing: no comprehension, recognition, inference, credibility, belief, number, default, roll or threshold.
 * The recipient's capability marker is never read, compared or converted: only the committed capability's identity and
 * its close are referenced.
 */

/** A committed fact read by identity: its key, the owner that wrote it, the version it was read at and its value. */
export interface AccessFact<T> {
  readonly key: string;
  readonly owner: string;
  readonly version: number;
  readonly value: T;
}

/** The capability fact as read AS-OF-DECLARED-CLOSE: the fact and the group that committed the version read. */
export interface CapabilityCloseRead {
  readonly fact: AccessFact<NamedActorCapability>;
  readonly committed_by: string;
}

export interface AccessProducts {
  readonly packet: AccessiblePacket;
  readonly provenance: SealedEngineProvenance;
}

/** The one recipient of the event's explicit bounded participant set. */
export const eventRecipient = (event: AccessEvent): string => event.participants[0]!;

/**
 * The packet and the Sealed Engine Provenance this event determines, as two separate surfaces. Fails closed (never
 * degrades to a partial or "best effort" packet) when the capability the payload depends on is not the recipient's own
 * committed capability read at its declared close.
 */
export function deriveAccessProducts(input: {
  readonly event: AccessFact<AccessEvent>;
  readonly capability: CapabilityCloseRead | null;
}): Result<AccessProducts> {
  const e = input.event.value;
  if (input.event.owner !== OWNER_EPISTEMIC_ACCESS) {
    return fail("EVENT_INVALID", "the access event is the Epistemic owner's own fact");
  }
  if (input.event.key !== accessEventKey(e.event_id)) {
    return fail("EVENT_INVALID", "the event is at the key derived from its identity");
  }
  const recipient = eventRecipient(e);
  const packetKey = accessPacketKey(e.event_id, recipient);
  let intelligibility: AccessiblePacket["intelligibility"];
  let capabilityClose: SealedEngineProvenance["capability_close"] = null;
  if (e.representation === null) {
    if (input.capability !== null) {
      return fail(
        "CAPABILITY_NOT_REQUIRED",
        "a payload whose form depends on no Named-Actor capability reads none",
      );
    }
    intelligibility = { result: "REPRESENTATION_ACCESSIBLE", basis: "NO_CAPABILITY_DEPENDENCY" };
  } else {
    const c = input.capability;
    if (c === null) {
      return fail(
        "CAPABILITY_ABSENT",
        "a payload whose form depends on a Named-Actor capability reads that capability at its declared close",
      );
    }
    const wanted = actorCapabilityKey(recipient, e.representation.capability_id);
    const close = actorCapabilityStage(recipient, e.representation.capability_id);
    if (
      c.fact.owner !== OWNER_NAMED_ACTOR ||
      c.fact.key !== wanted ||
      c.fact.value.actor_id !== recipient ||
      c.fact.value.capability_id !== e.representation.capability_id ||
      c.fact.value.close.name !== ACTOR_PROFILE_CAPABILITY_CLOSE ||
      !canonicalEqual(c.fact.value.close.stage, close)
    ) {
      return fail(
        "CAPABILITY_INVALID",
        "the capability is the recipient's own committed capability for the faculty the payload requires",
      );
    }
    if (c.committed_by !== stageGroupId(close)) {
      return fail(
        "CAPABILITY_NOT_AT_CLOSE",
        "the capability is read at the Named-Actor owner's declared capability close itself",
      );
    }
    intelligibility = {
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "ESTABLISHED_CAPABILITY",
      capability: {
        capability_id: e.representation.capability_id,
        fact_key: c.fact.key,
        version: c.fact.version,
        close: { name: ACTOR_PROFILE_CAPABILITY_CLOSE, group_id: c.committed_by },
      },
    };
    capabilityClose = {
      fact_key: c.fact.key,
      version: c.fact.version,
      committed_by: c.committed_by,
    };
  }
  return ok({
    packet: {
      recipient,
      payload: { referent: e.payload.referent, content: e.payload.content },
      presented_attribution: e.payload.presented_attribution,
      access: { result: "RECEIVED", channel: e.channel, established_at: e.established_at },
      intelligibility,
    },
    provenance: {
      event: { fact_key: input.event.key, version: input.event.version },
      recipient,
      packet: { fact_key: packetKey },
      source: { ...e.source },
      channel: e.channel,
      capability_close: capabilityClose,
    },
  });
}

/** The keys one packet formation writes, in the declared order: the actor-safe packet, then the sealed provenance. */
export const formationKeys = (eventId: string, recipientId: string): readonly [string, string] => [
  accessPacketKey(eventId, recipientId),
  accessProvenanceKey(eventId, recipientId),
];

/**
 * The sources an event may rest on: foreign, committed, and never the Epistemic owner's own state, kernel coordination
 * state or the Named-Actor owner's capability (a capability is read only at its close, as a representational
 * requirement; it is never an information source).
 */
export function sourceOwnerViolation(owner: string): string | null {
  if (owner === OWNER_EPISTEMIC_ACCESS) {
    return "a source is a foreign fact, referenced and never the Epistemic owner's own state";
  }
  if (owner === OWNER_TEMPORAL_KERNEL) {
    return "kernel coordination state is no information source";
  }
  if (owner === OWNER_NAMED_ACTOR) {
    return "a Named-Actor capability is read only at its close as a representational requirement, never as an information source";
  }
  return null;
}
