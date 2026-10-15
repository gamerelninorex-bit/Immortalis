import {
  AccessDisseminationEventSchema,
  AccessEventSchema,
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  EPISTEMIC_OPERATION_FORM_ACCESSIBLE_PACKET,
  FACET_EPISTEMIC_ACCESS,
  NamedActorCapabilitySchema,
  OWNER_EPISTEMIC_ACCESS,
  OBSERVATION_TRIGGER_KIND,
  accessEventKey,
  fail,
  ok,
  PcCapabilitySchema,
} from "@immortalis/contracts";
import { EPISTEMIC_ACCESS_RULE } from "../owners/registry.ts";
import { epistemicPacketDeclaration, observationTriggerViolation } from "./declaration.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import {
  deriveAccessProducts,
  eventRecipient,
  formationKeys,
  isBroadcastEvent,
  isPcRecipientEvent,
  type CapabilityCloseRead,
} from "./derive.ts";

/**
 * IM-10 — the one Epistemic Access owner operation (F-014D §5 steps 2–4, §18), exposed to the IM-02 coordinator through
 * the owner-adapter seam: it forms one recipient's Accessible Content Packet and its Sealed Engine Provenance at once.
 * Pure and deterministic: identical input, identical writes; nothing is drawn, rolled or defaulted. It reads exactly the
 * committed event and, where the payload's form depends on one, the recipient's capability AS-OF-DECLARED-CLOSE (the
 * Named-Actor owner's, or — for the active Player Character — the PC owner's at the PC Capability Close), and
 * invents nothing: no comprehension, inference, credibility, belief or number. It throws StageUnresolvedError (nothing
 * published, nothing credited, dependents wait) when its sources do not lawfully support a packet.
 */
const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

export const epistemicPacketProvider: StageProvider = {
  owner: OWNER_EPISTEMIC_ACCESS,
  facet: FACET_EPISTEMIC_ACCESS,
  operation: EPISTEMIC_OPERATION_FORM_ACCESSIBLE_PACKET,
  rule: EPISTEMIC_ACCESS_RULE,
  eventTrigger: {
    kind: OBSERVATION_TRIGGER_KIND,
    derive(request, at, getFact) {
      const fact = getFact(accessEventKey(request.trigger.ref));
      const violation = observationTriggerViolation(request, fact, at);
      if (violation) return fail("OBSERVATION_TRIGGER_INVALID", violation);
      return ok({
        sourceKey: fact!.key,
        declaration: epistemicPacketDeclaration(AccessEventSchema.parse(fact!.value)),
      });
    },
  },
  compute(input: StageInput): readonly StageWrite[] {
    if (input.reads.length < 1 || input.reads.length > 2)
      throw unresolved(
        "SOURCE_ABSENT",
        "a packet reads its event and at most one capability close",
      );
    const eventFact = input.reads[0]!.fact;
    const dissemination = AccessDisseminationEventSchema.safeParse(eventFact.value);
    if (dissemination.success && isBroadcastEvent(dissemination.data)) {
      throw unresolved(
        "SOURCE_INVALID",
        "a BROADCAST_EXPOSURE event is never individual receipt: no packet forms from it",
      );
    }
    const event = AccessEventSchema.safeParse(eventFact.value);
    if (!event.success) throw unresolved("SOURCE_INVALID", "the event violates its contract");
    const keys = formationKeys(event.data.event_id, eventRecipient(event.data));
    if (input.produces.length !== keys.length || keys.some((k) => !input.produces.includes(k))) {
      throw unresolved(
        "SOURCE_INVALID",
        "the formation does not write its own packet and provenance",
      );
    }
    if (keys.some((k) => input.prior.has(k))) {
      throw unresolved(
        "SOURCE_INVALID",
        "the packet is already formed: it is sealed and never re-formed",
      );
    }
    let capability: CapabilityCloseRead | null = null;
    if (input.reads.length === 2) {
      const capFact = input.reads[1]!.fact;
      const cap = (
        isPcRecipientEvent(event.data) ? PcCapabilitySchema : NamedActorCapabilitySchema
      ).safeParse(capFact.value);
      if (!cap.success) throw unresolved("SOURCE_INVALID", "the capability violates its contract");
      capability = {
        fact: { key: capFact.key, owner: capFact.owner, version: capFact.version, value: cap.data },
        committed_by: capFact.provenance.group_id,
      };
    }
    const derived = deriveAccessProducts({
      event: {
        key: eventFact.key,
        owner: eventFact.owner,
        version: eventFact.version,
        value: event.data,
      },
      capability,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    // the packet and the sealed provenance are two surfaces with two access classes; the event's authored basis label is
    // inherited and never defaulted
    return [
      {
        key: keys[0],
        value: derived.value.packet as never,
        unit: null,
        basis: eventFact.basis,
        secrecy: ACCESS_CLASS_ACTOR_ACCESSIBLE,
      },
      {
        key: keys[1],
        value: derived.value.provenance as never,
        unit: null,
        basis: eventFact.basis,
        secrecy: ACCESS_CLASS_ENGINE_SEALED,
      },
    ];
  },
};
