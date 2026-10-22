import {
  AccessDisseminationEventSchema,
  AccessEventSchema,
  BoundaryIndexSchema,
  EPISTEMIC_OPERATION_FORM_ACCESSIBLE_PACKET,
  OWNER_EPISTEMIC_ACCESS,
  OBSERVATION_TRIGGER_KIND,
  READ_MODE_NOW,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  observationTransactionId,
  observationTransactionCause,
  temporalObjectKey,
  timeEquals,
  compareTime,
  type AccessEvent,
  type CanonicalTime,
  type OwnerFact,
  type ResolutionRequest,
  type ResolutionTransaction,
  type DependencyDeclaration,
  type TemporalObject,
  type TemporalReadDeclaration,
} from "@immortalis/contracts";
import { namedActorCapabilityCloseRead } from "../actor/declaration.ts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE,
  EPISTEMIC_ACCESS_OBSERVATION_RULE,
} from "../owners/registry.ts";
import { pcCapabilityCloseRead } from "../pc-capability/declaration.ts";
import {
  eventRecipient,
  formationKeys,
  isBroadcastEvent,
  isPcRecipientEvent,
  recipientBoundaryViolation,
} from "./derive.ts";

/**
 * Builders and the registration rule for the Epistemic side of the temporal declaration (RC-10 dependency declarations;
 * F-014D §2.1 R-T1; F-017 §3 CLOSE). An Accessible Content Packet is formed only when a dependent consequence materially
 * requires it (F-014D §3 consequential trigger), so its one stage is declared INSIDE the engaged object of that
 * consequence, ahead of it: the Epistemic stage forms the packet, reading the committed event NOW and — where the
 * payload's form depends on one — the recipient's capability AS-OF-DECLARED-CLOSE, and the consequence reads the formed
 * packet AS-OF-NOW (F-014D §2.1: "F-014A consumes the sealed Accessible Content Packet AS-OF-NOW after packet
 * formation"), so it cannot resolve before it. Direct observation uses its committed causal event instead, without a Temporal object or boundary.
 */

const ID = "[A-Za-z0-9][A-Za-z0-9._:-]*";
const KEY_SPACES = {
  event: new RegExp(`^access/(${ID})/event$`),
  packet: new RegExp(`^access/(${ID})/packet/(${ID})$`),
  provenance: new RegExp(`^access/(${ID})/provenance/(${ID})$`),
} as const;

/** The event and recipient an Epistemic packet key names, or null. */
export const packetOfKey = (key: string): { eventId: string; recipientId: string } | null => {
  const m = KEY_SPACES.packet.exec(key);
  return m ? { eventId: m[1]!, recipientId: m[2]! } : null;
};

/** The Epistemic owner's own event read: NOW, by the one stage that forms the packet from it. */
export const epistemicEventRead = (eventId: string): TemporalReadDeclaration => ({
  mode: READ_MODE_NOW,
  source: { owner: OWNER_EPISTEMIC_ACCESS, fact_key: accessEventKey(eventId) },
  invalidators: [{ fact_key: accessEventKey(eventId) }],
});

/**
 * The only read a downstream consequence may declare of an Epistemic fact: the formed, actor-safe packet, AS-OF-NOW after
 * packet formation (F-014D §2.1). Neither the event nor the Sealed Engine Provenance is a cross-owner read.
 */
export const epistemicPacketRead = (
  eventId: string,
  recipientId: string,
): TemporalReadDeclaration => ({
  mode: READ_MODE_NOW,
  source: { owner: OWNER_EPISTEMIC_ACCESS, fact_key: accessPacketKey(eventId, recipientId) },
  invalidators: [],
});

/**
 * The one stage whose commit forms the packet of one event/recipient: it reads its committed event (NOW) and, where the
 * payload's form depends on a capability, that capability AS-OF-DECLARED-CLOSE, naming the declared close of the owner that
 * holds it for this recipient (F-014D §2.1: Close Basis = F-014A actor-profile capability close for a Named-Actor
 * recipient; "PC Capability Close" for the active Player Character, F-016 Phase 2B PCC-03, through the existing PC
 * close-read builder). It writes the actor-safe packet and the Sealed Engine Provenance together.
 */
export function epistemicPacketDeclaration(event: AccessEvent): DependencyDeclaration {
  const recipient = eventRecipient(event);
  return {
    stage: accessPacketStage(event.event_id, recipient),
    reads: [
      epistemicEventRead(event.event_id),
      ...(event.representation
        ? [
            isPcRecipientEvent(event)
              ? pcCapabilityCloseRead(recipient, event.representation.capability_id)
              : namedActorCapabilityCloseRead(recipient, event.representation.capability_id),
          ]
        : []),
    ],
    produces: [...formationKeys(event.event_id, recipient)],
    declares_close: null,
  };
}

/** True when the committed event fact is ACTOR-OBSERVATION-EARNED: committed under the governing citation of the actor direct-perception path. */
export const isActorObservationEarnedFact = (fact: { provenance: { rule: unknown } }): boolean =>
  canonicalEqual(fact.provenance.rule, EPISTEMIC_ACCESS_ACTOR_OBSERVATION_RULE);

/** True when the committed event fact is OBSERVATION-EARNED: committed under the governing citation of the direct-perception path. */
export const isObservationEarnedFact = (fact: { provenance: { rule: unknown } }): boolean =>
  canonicalEqual(fact.provenance.rule, EPISTEMIC_ACCESS_OBSERVATION_RULE);

/**
 * True when the committed event triggers its own packet formation: it is observation-earned by the active Player Character's direct
 * perception OR by a non-PC Named Actor's. The two share one event-triggered formation and nothing else; `isObservationEarnedFact` stays
 * the Player Character's predicate (the current-observation Glance reads it).
 */
export const isEventTriggeredFormationFact = (fact: { provenance: { rule: unknown } }): boolean =>
  isObservationEarnedFact(fact) || isActorObservationEarnedFact(fact);

/**
 * F-017 §§3–4: a committed event can trigger its own dependency-ordered owner stage.
 * This is NOT a material boundary query or a TemporalObject registration. It accepts
 * only the already-earned, raw direct-perception event at the unchanged current basis.
 * RC-04/05/16 bind one transaction identity to that event, including on recovery.
 */
export function observationTriggerViolation(
  request: Pick<
    ResolutionRequest,
    "transaction_id" | "cause" | "trigger" | "continues" | "requested"
  >,
  fact: OwnerFact | undefined,
  at: CanonicalTime,
): string | null {
  const parsed = fact ? AccessEventSchema.safeParse(fact.value) : undefined;
  if (
    !fact ||
    !parsed?.success ||
    fact.owner !== OWNER_EPISTEMIC_ACCESS ||
    !isEventTriggeredFormationFact(fact) ||
    fact.key !== accessEventKey(parsed.data.event_id)
  )
    return "only a committed observation-earned event triggers direct packet formation";
  const event = parsed.data;
  if (
    event.channel !== "PERCEPTION" ||
    event.representation !== null ||
    request.trigger.kind !== OBSERVATION_TRIGGER_KIND ||
    request.trigger.ref !== event.event_id ||
    request.transaction_id !== observationTransactionId(event.event_id) ||
    request.cause !== observationTransactionCause(event.event_id) ||
    request.continues !== null ||
    request.requested.condition !== null ||
    request.requested.target === null ||
    !timeEquals(request.requested.target, at) ||
    !timeEquals(event.established_at, at)
  )
    return "an observation triggers exactly its own formation transaction at its current access basis";
  return null;
}

/** The sealed transaction records the real event stage and no crossed boundary. */
export function observationTransactionViolation(
  tx: ResolutionTransaction,
  fact: OwnerFact | undefined,
): string | null {
  const why = observationTriggerViolation(tx, fact, tx.opening.basis_time);
  if (why) return why;
  const event = AccessEventSchema.parse(fact!.value);
  if (
    tx.engaged.length !== 0 ||
    tx.boundaries_crossed.length !== 0 ||
    tx.stages.length !== 1 ||
    !canonicalEqual(
      tx.stages[0]!.stage,
      accessPacketStage(event.event_id, eventRecipient(event)),
    ) ||
    !timeEquals(tx.outcome.actual_stop, tx.opening.basis_time) ||
    tx.outcome.stop_reason !== "TARGET_REACHED" ||
    tx.outcome.remainder !== null ||
    tx.outcome.unresolved_dependents.length !== 0
  )
    return "an observation transaction records its single event-triggered packet stage and crosses no boundary";
  return null;
}

/**
 * RC-10 / F-014D §2.1 registration rule for every object that touches the Epistemic key spaces or owner. Applies at
 * registration and at load, so a hand-written object cannot smuggle a different stage, a read of the engine-side event or
 * sealed provenance, a different capability read or an Epistemic-owned engagement:
 *
 *  - no persisted object is owned by Epistemics; an observation-earned event
 *    triggers its own formation directly, with no object or indexed boundary;
 *  - every Epistemic stage is exactly the declaration derived from a COMMITTED, valid access event (so a consequence can
 *    never conjure access: without a committed event there is nothing to declare), and an active-PC event's stage is
 *    declared only while the committed Role Registry binding names its recipient;
 *  - the event is read only by that stage; Sealed Engine Provenance is read by NO declared stage (it is available only
 *    to lawful engine-side consumers through the owner's typed read, never as an actor-side input); every other read of
 *    an Epistemic fact is the packet, AS-OF-NOW, by a stage that is not itself an Epistemic stage;
 *  - no stage outside the Epistemic owner declares that it produces an Epistemic key;
 *  - at registration, a packet formation is declared by exactly one engaged object per instant (an IM-02 rule: a stage is
 *    declared by exactly one engaged object): another consequence due at the same instant reads the packet and declares
 *    no second stage. Checked against the active boundary index by identity.
 */
export function epistemicObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered = false,
): string | null {
  if (o.owning_ref.owner === OWNER_EPISTEMIC_ACCESS) {
    return "no standalone Epistemic object: direct observation uses its committed event trigger, never an indexed boundary";
  }
  for (const d of o.dependencies) {
    const isEpistemic = d.stage.owner_operation.owner === OWNER_EPISTEMIC_ACCESS;
    if (!isEpistemic) {
      if (d.produces.some((k) => k.startsWith("access/"))) {
        return "only the Epistemic owner's stage produces an Epistemic fact";
      }
    } else {
      if (d.stage.owner_operation.operation !== EPISTEMIC_OPERATION_FORM_ACCESSIBLE_PACKET) {
        return "the Epistemic owner declares exactly one stage: the formation of an Accessible Content Packet";
      }
      const target = packetOfKey(d.stage.prospective_result_id);
      const eventFact = target ? state.facts.get(accessEventKey(target.eventId)) : undefined;
      const dissemination = eventFact
        ? AccessDisseminationEventSchema.safeParse(eventFact.value)
        : undefined;
      if (dissemination?.success && isBroadcastEvent(dissemination.data)) {
        return "a BROADCAST_EXPOSURE event is never individual receipt: no packet formation is declared from it";
      }
      const event = eventFact ? AccessEventSchema.safeParse(eventFact.value) : undefined;
      if (
        !target ||
        !eventFact ||
        !event?.success ||
        eventFact.owner !== OWNER_EPISTEMIC_ACCESS ||
        eventRecipient(event.data) !== target.recipientId ||
        event.data.event_id !== target.eventId
      ) {
        return "an Epistemic packet is formed only for a committed access event: a consequence cannot create the access it needs";
      }
      if (!canonicalEqual(d, epistemicPacketDeclaration(event.data))) {
        return "an Epistemic stage is exactly the declaration derived from its committed event";
      }
      if (
        isEventTriggeredFormationFact(eventFact) &&
        o.owning_ref.owner !== OWNER_EPISTEMIC_ACCESS
      ) {
        return "an observation-earned event's packet is formed only by that event's own causal trigger, never inside a consequence that could time it elsewhere";
      }
      if (isPcRecipientEvent(event.data) && recipientBoundaryViolation(state.facts, event.data)) {
        return "an Epistemic packet for the active Player Character is declared only while the Role Registry binding role.player_character names that recipient";
      }
    }
    for (const r of d.reads) {
      if (r.source.owner !== OWNER_EPISTEMIC_ACCESS && !r.source.fact_key.startsWith("access/")) {
        continue;
      }
      if (r.source.owner !== OWNER_EPISTEMIC_ACCESS) {
        return "an Epistemic key space is read as its owner's fact";
      }
      if (KEY_SPACES.event.test(r.source.fact_key)) {
        if (!isEpistemic) {
          return "the access event is engine-side: it is not a cross-owner read, and an actor-side consequence reads only the formed packet";
        }
      } else if (KEY_SPACES.provenance.test(r.source.fact_key)) {
        return "sealed engine provenance is read by no declared stage: it is never an actor-admissible input";
      } else {
        const target = packetOfKey(r.source.fact_key);
        if (!target || isEpistemic) {
          return "an Epistemic stage reads only its event and the recipient's capability close; a read of an Epistemic key space names the packet";
        }
        if (!canonicalEqual(r, epistemicPacketRead(target.eventId, target.recipientId))) {
          return "an Epistemic packet is read only AS-OF-NOW, after its formation";
        }
      }
    }
  }
  return registered ? duplicateFormationViolation(o, state) : null;
}

/** Another engaged object due at the same instant that already declares one of this object's packet formations. */
function duplicateFormationViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
): string | null {
  if (!o.next_boundary) return null;
  const mine = o.dependencies.filter(
    (d) => d.stage.owner_operation.owner === OWNER_EPISTEMIC_ACCESS,
  );
  if (mine.length === 0) return null;
  const indexFact = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  const index = indexFact ? BoundaryIndexSchema.safeParse(indexFact.value) : undefined;
  if (!index?.success) return null;
  for (const entry of index.data.entries) {
    if (entry.object_id === o.object_id || compareTime(entry.at, o.next_boundary.at) !== 0)
      continue;
    const other = state.facts.get(temporalObjectKey(entry.object_id));
    const parsed = other ? TemporalObjectSchema.safeParse(other.value) : undefined;
    if (
      parsed?.success &&
      parsed.data.dependencies.some((d) => mine.some((m) => canonicalEqual(m.stage, d.stage)))
    ) {
      return "a packet formation is declared by exactly one engaged object per instant: another consequence due at that instant already declares it, so this one reads the packet AS-OF-NOW without declaring a second stage";
    }
  }
  return null;
}
