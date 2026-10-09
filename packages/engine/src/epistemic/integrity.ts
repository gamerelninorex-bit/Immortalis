import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessDisseminationEventSchema,
  AccessEventSchema,
  AccessiblePacketSchema,
  NamedActorCapabilitySchema,
  PcCapabilitySchema,
  ResolutionTransactionSchema,
  SealedEngineProvenanceSchema,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  TransactionAuthoritySchema,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  temporalTransactionAuthorityKey,
  timeAtOrBefore,
  type BroadcastExposureEvent,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import {
  EPISTEMIC_ACCESS_BROADCAST_RULE,
  EPISTEMIC_ACCESS_RULE_TENTH_SLICE,
  resolveKey,
} from "../owners/registry.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { journaledStageViolation } from "../production/admission.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { epistemicObjectViolation } from "./declaration.ts";
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
 * Re-verifies, from committed state and the journal alone, that a loaded campaign's Epistemic Access state still tells one
 * story (IM-12 replay/recovery + IM-10). Replay proves the HISTORY is intact and canonical integrity proves each fact's
 * owner, schema, key identity and governing rule; this proves the facts still cohere:
 *
 *  - an access event rests on a source that is committed, owned by the source it names, foreign and not kernel,
 *    Epistemic or Named-Actor state (nor, for an active-PC event, a PC capability key), at (or, as history, behind) the
 *    version pinned and committed BEFORE the event; its recipient was, when the event was committed, either (no role
 *    asserted) no Player Character, no entity under player control and no Population ledger, or (the active-PC role
 *    asserted) exactly the entity the Role Registry binding then named and no Population ledger; it is engine-sealed, and its access time does not lie in the future of the canonical basis;
 *  - a packet and its Sealed Engine Provenance exist together, in one group, each carrying its own access class (the
 *    packet actor-accessible, the provenance engine-sealed); the packet is exactly what its committed event (and capability
 *    close) determines, the provenance is exactly the engine-side record of that formation, and they were committed after
 *    the event (and the capability close) under no boundary violation, only as the IM-02 stage under a durable transaction
 *    authority, and credited by a committed ResolutionTransaction — or by an interrupted one whose engaged object still
 *    awaits its boundary;
 *  - a packet never exists without its event, nor a provenance without its packet, and every object touching the
 *    Epistemic key spaces obeys the registration rule (an actor-side consequence reads only the packet, AS-OF-NOW).
 *
 * Cost: lists committed facts once per open (a diagnostic path, CAL-06), like the other verifiers.
 */
export function verifyEpistemicIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const bad = (key: string, message: string) =>
    out.push({ key, code: "EPISTEMIC_ACCESS_STATE", message });
  const all = store.listFacts();
  const byKey = new Map<string, OwnerFact>(all.map((f) => [f.key, f]));
  const kindOf = (f: OwnerFact) => resolveKey(f.key)?.kind.id;
  const events = all.filter((f) => kindOf(f) === "epistemic_access_event");
  const packets = all.filter((f) => kindOf(f) === "epistemic_accessible_packet");
  const provenances = all.filter((f) => kindOf(f) === "epistemic_sealed_provenance");
  const objects = all.flatMap((f) => {
    if (kindOf(f) !== "temporal_object") return [];
    const o = TemporalObjectSchema.safeParse(f.value);
    return o.success &&
      (o.data.owning_ref.owner === "epistemic_access" ||
        o.data.dependencies.some(
          (d) =>
            d.stage.owner_operation.owner === "epistemic_access" ||
            d.reads.some((r) => r.source.fact_key.startsWith("access/")) ||
            d.produces.some((k) => k.startsWith("access/")),
        ))
      ? [{ fact: f, value: o.data }]
      : [];
  });
  if (events.length + packets.length + provenances.length + objects.length === 0) return out;

  const revisionOf = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? 0;
  const transactions = all
    .filter((f) => kindOf(f) === "resolution_transaction")
    .flatMap((f) => {
      const t = ResolutionTransactionSchema.safeParse(f.value);
      return t.success ? [t.data] : [];
    });
  const cited = (groupId: string) =>
    transactions.some((t) => t.stages.some((s) => s.group_id === groupId));
  /** The committed facts as they stood BEFORE `revision`: the boundary is judged at the time of the write. */
  const factsBefore = (revision: number) => ({
    get: (k: string) => {
      const f = byKey.get(k);
      return f && revisionOf(f) < revision ? f : undefined;
    },
    has: (k: string) => {
      const f = byKey.get(k);
      return f !== undefined && revisionOf(f) < revision;
    },
  });
  const clock = byKey.get(TEMPORAL_STATE_KEY);
  const time = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;

  /**
   * A BROADCAST_EXPOSURE event: event-only. Its source/carrier and its audience authority are each committed, owned by the
   * owner the event names, not behind the pinned version, and were committed BEFORE the event (so neither is post-basis
   * evidence or a later roster read back into it); the group that committed it read exactly those two facts at exactly the
   * pinned versions; it is engine-sealed, under its own governing-rule citation, and its dissemination basis does not lie
   * in the future of the canonical basis.
   */
  const verifyBroadcastEvent = (ef: OwnerFact, e: BroadcastExposureEvent) => {
    if (ef.key !== accessEventKey(e.event_id)) {
      bad(ef.key, "an event is at the key derived from its identity");
      return;
    }
    if (ef.secrecy !== ACCESS_CLASS_ENGINE_SEALED) {
      bad(ef.key, "an access event is engine-side: it carries the engine-sealed access class");
    }
    if (!canonicalEqual(ef.provenance.rule, EPISTEMIC_ACCESS_BROADCAST_RULE)) {
      bad(ef.key, "a BROADCAST_EXPOSURE event carries the governing-rule citation of its mode");
    }
    const violation = broadcastReferenceViolation(e);
    if (violation) bad(ef.key, violation);
    for (const [what, pin] of [
      ["source/carrier", e.source],
      ["audience authority", e.audience],
    ] as const) {
      const fact = byKey.get(pin.fact_key);
      if (!fact || fact.owner !== pin.owner || fact.version < pin.version) {
        bad(
          ef.key,
          `the ${what} is committed, owned by its named owner and not behind its pin: ${pin.fact_key}`,
        );
      } else if (fact.version === pin.version && revisionOf(fact) >= revisionOf(ef)) {
        bad(ef.key, `the ${what} was not committed before the event that rests on it`);
      }
    }
    const group = store.committedGroup(ef.provenance.intent_id);
    if (
      !group ||
      !canonicalEqual(
        group.reads.map((r) => [r.key, r.version]),
        [
          [e.source.fact_key, e.source.version],
          [e.audience.fact_key, e.audience.version],
        ],
      )
    ) {
      bad(ef.key, "a broadcast event was committed reading exactly its source and audience pins");
    }
    if (!time?.success || !timeAtOrBefore(e.dissemination_basis, time.data.canonical_time)) {
      bad(ef.key, "dissemination is based at or before the canonical basis, never in its future");
    }
  };

  for (const ef of events) {
    const dissemination = AccessDisseminationEventSchema.safeParse(ef.value);
    if (dissemination.success && isBroadcastEvent(dissemination.data)) {
      verifyBroadcastEvent(ef, dissemination.data);
      continue;
    }
    const parsed = AccessEventSchema.safeParse(ef.value);
    if (!parsed.success) continue;
    const e = parsed.data;
    if (ef.key !== accessEventKey(e.event_id)) {
      bad(ef.key, "an event is at the key derived from its identity");
      continue;
    }
    if (ef.secrecy !== ACCESS_CLASS_ENGINE_SEALED) {
      bad(ef.key, "an access event is engine-side: it carries the engine-sealed access class");
    }
    const boundary = recipientBoundaryViolation(factsBefore(revisionOf(ef)), e);
    if (boundary) bad(ef.key, boundary);
    const foreign = eventSourceViolation(e);
    if (foreign) bad(ef.key, foreign);
    const src = byKey.get(e.source.fact_key);
    if (!src || src.owner !== e.source.owner || src.version < e.source.version) {
      bad(
        ef.key,
        `the source is committed, owned by its named owner and not behind its pin: ${e.source.fact_key}`,
      );
    } else if (src.version === e.source.version && revisionOf(src) >= revisionOf(ef)) {
      bad(ef.key, `the source was not committed before the event that rests on it`);
    }
    if (!time?.success || !timeAtOrBefore(e.established_at, time.data.canonical_time)) {
      bad(ef.key, "access is established at or before the canonical basis, never in its future");
    }
  }

  for (const pf of packets) {
    const packet = AccessiblePacketSchema.safeParse(pf.value);
    const resolved = resolveKey(pf.key);
    const eventId = resolved?.ids[0];
    const recipient = resolved?.ids[1];
    if (!packet.success || !eventId || !recipient) continue;
    if (pf.key !== accessPacketKey(eventId, recipient) || packet.data.recipient !== recipient) {
      bad(pf.key, "a packet is at the key derived from its event and recipient");
      continue;
    }
    if (pf.secrecy !== ACCESS_CLASS_ACTOR_ACCESSIBLE) {
      bad(
        pf.key,
        "only the packet is actor-accessible: it carries the actor-accessible access class",
      );
    }
    const eventFact = byKey.get(accessEventKey(eventId));
    const dissemination = eventFact
      ? AccessDisseminationEventSchema.safeParse(eventFact.value)
      : undefined;
    if (dissemination?.success && isBroadcastEvent(dissemination.data)) {
      bad(
        pf.key,
        "a BROADCAST_EXPOSURE event is never individual receipt: no packet exists for it",
      );
      continue;
    }
    const event = eventFact ? AccessEventSchema.safeParse(eventFact.value) : undefined;
    if (!eventFact || !event?.success || eventRecipient(event.data) !== recipient) {
      bad(pf.key, "a packet has no committed event naming its recipient");
      continue;
    }
    const provFact = byKey.get(accessProvenanceKey(eventId, recipient));
    if (!provFact) {
      bad(pf.key, "a packet is formed with its sealed provenance, which is absent");
    } else if (
      provFact.provenance.group_id !== pf.provenance.group_id ||
      provFact.secrecy !== ACCESS_CLASS_ENGINE_SEALED
    ) {
      bad(
        pf.key,
        "the packet and its sealed provenance are written together, each with its own access class",
      );
    }
    // the superseded governing-rule citation is true provenance only for facts of a Named-Actor recipient's event
    if (
      isPcRecipientEvent(event.data) &&
      [pf, provFact].some(
        (f) => f && canonicalEqual(f.provenance.rule, EPISTEMIC_ACCESS_RULE_TENTH_SLICE),
      )
    ) {
      bad(
        pf.key,
        "an active-PC recipient's packet and provenance carry the current governing-rule citation, never the superseded one",
      );
    }
    let capability = null;
    const required = requiredCapability(event.data);
    if (required) {
      const capFact = byKey.get(required.key);
      const cap = capFact
        ? (isPcRecipientEvent(event.data)
            ? PcCapabilitySchema
            : NamedActorCapabilitySchema
          ).safeParse(capFact.value)
        : undefined;
      if (!capFact || !cap?.success) {
        bad(pf.key, "a packet depends on a capability that is not committed");
        continue;
      }
      if (revisionOf(capFact) >= revisionOf(pf)) {
        bad(pf.key, "the capability close was not committed before the packet that reads it");
      }
      capability = {
        fact: { key: capFact.key, owner: capFact.owner, version: capFact.version, value: cap.data },
        committed_by: capFact.provenance.group_id,
      };
    }
    if (revisionOf(eventFact) >= revisionOf(pf)) {
      bad(pf.key, "the event was not committed before the packet formed from it");
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
    if (!derived.ok) {
      bad(pf.key, derived.error.message);
    } else {
      if (!canonicalEqual(derived.value.packet, packet.data)) {
        bad(pf.key, "a packet is exactly what its committed event determines");
      }
      const prov = provFact ? SealedEngineProvenanceSchema.safeParse(provFact.value) : undefined;
      if (!prov?.success || !canonicalEqual(derived.value.provenance, prov.data)) {
        bad(pf.key, "the sealed provenance is exactly the engine-side record of its packet");
      }
    }
    const boundary = recipientBoundaryViolation(factsBefore(revisionOf(pf)), event.data);
    if (boundary) bad(pf.key, boundary);
    // formed only as its IM-02 stage, under the durable authority of the transaction that opened it
    const stage = accessPacketStage(eventId, recipient);
    const group = store.committedGroup(pf.provenance.intent_id);
    const authId = group?.cause.slice("transaction:".length);
    const authFact = authId ? byKey.get(temporalTransactionAuthorityKey(authId)) : undefined;
    const authority = authFact ? TransactionAuthoritySchema.safeParse(authFact.value) : undefined;
    if (!group || !authority?.success) {
      bad(
        pf.key,
        "a packet formation has its journaled group and its transaction's durable authority",
      );
    } else {
      const identity = journaledStageViolation(
        store,
        byKey,
        pf,
        stage,
        authority.data.opening.basis_time,
      );
      if (identity) bad(pf.key, identity);
      const readKeys = group.reads.map((r) => r.key);
      const expectedKeys = required ? [eventFact.key, required.key] : [eventFact.key];
      if (!canonicalEqual(readKeys, expectedKeys)) {
        bad(pf.key, "a formation read exactly its event and, if required, the capability close");
      }
    }
    const awaiting = objects.some(
      (o) =>
        o.value.next_boundary !== null &&
        o.value.dependencies.some((d) => canonicalEqual(d.stage, stage)),
    );
    if (!cited(pf.provenance.group_id) && !awaiting) {
      bad(
        pf.key,
        "a packet formation is credited by no resolution transaction and no engaged object awaits it",
      );
    }
  }

  for (const vf of provenances) {
    const resolved = resolveKey(vf.key);
    const eventId = resolved?.ids[0];
    const recipient = resolved?.ids[1];
    if (!eventId || !recipient) continue;
    if (vf.key !== accessProvenanceKey(eventId, recipient)) {
      bad(vf.key, "sealed provenance is at the key derived from its event and recipient");
      continue;
    }
    if (!byKey.has(accessPacketKey(eventId, recipient))) {
      bad(vf.key, "sealed provenance exists only with the packet it records");
    }
  }

  for (const o of objects) {
    const violation = epistemicObjectViolation(o.value, { facts: byKey });
    if (violation) bad(o.fact.key, violation);
  }
  return out;
}
