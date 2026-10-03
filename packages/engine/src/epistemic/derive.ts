import {
  ACTOR_PROFILE_CAPABILITY_CLOSE,
  OWNER_EPISTEMIC_ACCESS,
  OWNER_NAMED_ACTOR,
  OWNER_PC_EXISTENCE,
  OWNER_ROLE_REGISTRY,
  OWNER_TEMPORAL_KERNEL,
  PC_CAPABILITY_CLOSE,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  RECIPIENT_ROLE_PLAYER_CHARACTER,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  actorCapabilityKey,
  actorCapabilityStage,
  fail,
  ok,
  pcCapabilityKey,
  pcCapabilityStage,
  populationLedgerKey,
  type AccessEvent,
  type AccessiblePacket,
  type NamedActorCapability,
  type OwnerFact,
  type PcCapability,
  type Result,
  type SealedEngineProvenance,
  type StageKey,
} from "@immortalis/contracts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import { canonicalEqual } from "../hash.ts";
import { isPcCapabilityKey } from "../pc-capability/declaration.ts";
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
 * its close are referenced. A Named-Actor recipient's capability is the Named-Actor owner's, read at the actor-profile
 * capability close; the canonically bound active Player Character's is the I-002 PC capability, read at the PC Capability
 * Close (F-016 Phase 2B PCC-03). Neither ever stands in for the other.
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
  readonly fact: AccessFact<NamedActorCapability | PcCapability>;
  readonly committed_by: string;
}

/** True when the event names the active Player Character as its recipient (an assertion checked against the Role Registry). */
export const isPcRecipientEvent = (event: AccessEvent): boolean =>
  event.recipient_role === RECIPIENT_ROLE_PLAYER_CHARACTER;

/** The one capability a payload's form depends on, exactly as its owner publishes it and as its close names it. */
export interface RequiredCapability {
  readonly owner: string;
  readonly key: string;
  readonly close_name: string;
  readonly close_stage: StageKey;
}

/**
 * The single statement of which capability read an event's representation requires, or null when it depends on none. The
 * owner follows the recipient and nothing else: there is no fallback from the PC capability to a Named-Actor capability, nor
 * the reverse.
 */
export function requiredCapability(event: AccessEvent): RequiredCapability | null {
  if (event.representation === null) return null;
  const recipient = eventRecipient(event);
  const capabilityId = event.representation.capability_id;
  return isPcRecipientEvent(event)
    ? {
        owner: OWNER_PC_EXISTENCE,
        key: pcCapabilityKey(recipient, capabilityId),
        close_name: PC_CAPABILITY_CLOSE,
        close_stage: pcCapabilityStage(recipient, capabilityId),
      }
    : {
        owner: OWNER_NAMED_ACTOR,
        key: actorCapabilityKey(recipient, capabilityId),
        close_name: ACTOR_PROFILE_CAPABILITY_CLOSE,
        close_stage: actorCapabilityStage(recipient, capabilityId),
      };
}

/**
 * Who may be an event's recipient, judged on committed state by identity (no scan). A Named-Actor recipient is the existing
 * Named-Actor boundary, reused unchanged (`actorBoundaryViolation`: no PC, no entity under player control, no Population
 * ledger). The active-PC recipient is exactly the entity the committed Role Registry binding `role.player_character` names:
 * an I-002 Existence Contract alone, another identity or an unbound identity is no PC recipient, and a Population ledger
 * identity is never one. Returns a message, or null.
 */
export function recipientBoundaryViolation(
  facts: Pick<ReadonlyMap<string, OwnerFact>, "get" | "has">,
  event: AccessEvent,
): string | null {
  if (!isPcRecipientEvent(event)) return actorBoundaryViolation(facts, eventRecipient(event));
  const recipient = eventRecipient(event);
  if (facts.has(populationLedgerKey(recipient))) {
    return "the identity is a Population ledger: an aggregate is never an individual recipient";
  }
  const binding = facts.get(PLAYER_CHARACTER_BINDING_KEY);
  const bound = binding ? PlayerCharacterBindingSchema.safeParse(binding.value) : undefined;
  if (
    !binding ||
    binding.owner !== OWNER_ROLE_REGISTRY ||
    !bound?.success ||
    bound.data.active_pc.entity_id !== recipient
  ) {
    return "the recipient is not the active Player Character the Role Registry binding role.player_character names: an Existence Contract alone, another identity or an unbound identity is no PC recipient";
  }
  return null;
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
        "a payload whose form depends on no capability reads none",
      );
    }
    intelligibility = { result: "REPRESENTATION_ACCESSIBLE", basis: "NO_CAPABILITY_DEPENDENCY" };
  } else {
    const c = input.capability;
    if (c === null) {
      return fail(
        "CAPABILITY_ABSENT",
        "a payload whose form depends on a capability reads that capability at its declared close",
      );
    }
    const required = requiredCapability(e)!;
    const held = c.fact.value;
    if (
      c.fact.owner !== required.owner ||
      c.fact.key !== required.key ||
      ("pc_id" in held ? held.pc_id : held.actor_id) !== recipient ||
      held.capability_id !== e.representation.capability_id ||
      held.close.name !== required.close_name ||
      !canonicalEqual(held.close.stage, required.close_stage)
    ) {
      return fail(
        "CAPABILITY_INVALID",
        "the capability is the recipient's own committed capability for the faculty the payload requires, of the owner that holds it for this recipient",
      );
    }
    if (c.committed_by !== stageGroupId(required.close_stage)) {
      return fail(
        "CAPABILITY_NOT_AT_CLOSE",
        "the capability is read at its owner's declared capability close itself",
      );
    }
    intelligibility = {
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "ESTABLISHED_CAPABILITY",
      capability: {
        capability_id: e.representation.capability_id,
        fact_key: c.fact.key,
        version: c.fact.version,
        close: { name: held.close.name, group_id: c.committed_by },
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
 * requirement; it is never an information source). An active-PC event additionally never rests on the PC owner's capability
 * key spaces: a PC capability is visible cross-owner only AS-OF-DECLARED-CLOSE (F-016 Phase 2B PCC-03), never as a pinned
 * source read at its current version.
 */
export function eventSourceViolation(event: AccessEvent): string | null {
  const owner = sourceOwnerViolation(event.source.owner);
  if (owner) return owner;
  if (
    isPcRecipientEvent(event) &&
    event.source.owner === OWNER_PC_EXISTENCE &&
    isPcCapabilityKey(event.source.fact_key)
  ) {
    return "a PC capability is read only at the PC Capability Close as a representational requirement, never as an information source";
  }
  return null;
}

/** The owner-level part of the source rule (see `eventSourceViolation`). */
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
