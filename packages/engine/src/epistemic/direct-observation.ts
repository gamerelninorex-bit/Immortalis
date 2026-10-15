import {
  AccessEventSchema,
  OBSERVATION_EVENT_BASIS,
  OBSERVATION_TRIGGER_KIND,
  PLAYER_CHOICE_AUTHORITY,
  accessEventKey,
  accessPacketStage,
  fail,
  observationRegistrationCause,
  observationRegistrationGroupId,
  observationRegistrationIntentId,
  observationTransactionCause,
  observationTransactionId,
  ok,
  type Result,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import type { CampaignStore } from "../persistence/store.ts";
import { StageProviderRegistry } from "../temporal/providers.ts";
import { TemporalCoordinator } from "../temporal/coordinator.ts";
import { EpistemicAccessAdapter } from "./adapter.ts";
import { observationEngagement } from "./declaration.ts";
import { epistemicPacketProvider } from "./provider.ts";
import { deriveObservationEvent, observationRecordOf } from "./observation.ts";

/**
 * The OBSERVATION-EARNED packet formation (BLUE v5.2, F-014D §3 consequential trigger, §5 steps 2-4, §6, §21; F-014B §6): the one
 * orchestration that takes a retained, engine-derived OBSERVATION_ESTABLISHED direct-perception decision to a sealed Accessible Content
 * Packet — and nothing else. In this order, each step by identity and so idempotent across a lost reply, a crash and a reopen:
 *
 *   1. the Epistemic owner commits the observation-earned event (derived from the decision; see `establishObservedAccess`);
 *   2. the event's own one-shot, current-basis engagement is registered with the Temporal kernel (no consequence, no downstream actor or
 *      world result, no recurrence and no elapsed time: see `observationEngagement`);
 *   3. ONE resolution transaction is requested whose target is the canonical time itself, so the kernel selects exactly that earned
 *      boundary, runs the existing `epistemicPacketProvider` stage under the transaction's durable authority, and records the one
 *      transaction. Canonical time does not move; nothing is invented.
 *
 * It is committed-before-consumed (event, then engagement, then packet), and a formation already committed is adopted, never re-formed:
 * the same decision again reaches the same records. It reads and writes no actor-side state, grants no recognition, comprehension, belief,
 * memory or action, and is NOT triggered by a display or a refresh: its only caller is the player's separate, confirmed choice to look.
 */

export type ObservationFormationCode =
  | "OBSERVATION_NOT_ESTABLISHED"
  | "OBSERVATION_RECORD_INVALID"
  | "ENGAGEMENT_REFUSED"
  | "TRANSACTION_REFUSED"
  | "FORMATION_UNRESOLVED"
  | "STORE_FATAL"
  | "INPUT_INVALID"
  | string;

export interface ObservationFormed {
  readonly event_id: string;
  readonly recipient_id: string;
  readonly transaction_id: string;
  /** the whole formation had already committed: nothing was written */
  readonly replayed: boolean;
}

const isFatal = (code: string): boolean =>
  code === "UNKNOWN_OUTCOME" || code === "STORE_POISONED" || code === "STORE_CLOSED";

export async function formObservedPacket(
  store: CampaignStore,
  decisionKey: string,
): Promise<Result<ObservationFormed, ObservationFormationCode>> {
  const record = observationRecordOf(store.getFact(decisionKey));
  if (!record)
    return fail("INPUT_INVALID", "the cited decision is not a retained direct-perception decision");
  const derived = deriveObservationEvent(record);
  if (!derived.ok) return fail(derived.error.code, derived.error.message);
  const derivedEvent = derived.value;
  const eventId = derivedEvent.event_id;
  const recipient = derivedEvent.participants[0]!;

  // 1. the event
  const event = await new EpistemicAccessAdapter(store).establishObservedAccess({
    decision_key: decisionKey,
  });
  if (!event.ok) {
    const winner = store.getFact(accessEventKey(eventId));
    // an event that THIS decision already earned is its replay (a lost reply, a restart); an event another decision earned, or any
    // other refusal, is a refusal: a different reading of an already observed instant never replaces or re-earns the observation
    const earnedBy = winner
      ? store.committedGroup(winner.provenance.intent_id)?.reads[0]?.key
      : undefined;
    if (
      isFatal(event.error.code) ||
      !winner ||
      earnedBy !== decisionKey ||
      !canonicalEqual(winner.value, derivedEvent)
    )
      return fail(
        event.error.code === "VALUE_INVALID" || event.error.code === "REFERENCE_INVALID"
          ? "OBSERVATION_REFUSED"
          : event.error.code,
        event.error.message,
      );
  }
  const eventFact = store.getFact(accessEventKey(eventId));
  const committed = eventFact ? AccessEventSchema.safeParse(eventFact.value) : undefined;
  if (!eventFact || !committed?.success)
    return fail("OBSERVATION_RECORD_INVALID", "the committed observation event is not readable");

  // 2. its one-shot engagement
  const coordinator = new TemporalCoordinator(
    store,
    new StageProviderRegistry([epistemicPacketProvider]),
  );
  const engagement = observationEngagement(committed.data);
  if (!coordinator.object(engagement.object_id)) {
    const registered = await coordinator.registerObject({
      group_id: observationRegistrationGroupId(eventId),
      intent_id: observationRegistrationIntentId(eventId),
      cause: observationRegistrationCause(eventId),
      basis: OBSERVATION_EVENT_BASIS,
      secrecy: "engine-internal",
      object: engagement,
    });
    if (!registered.ok)
      return fail(
        isFatal(registered.error.code) ? registered.error.code : "ENGAGEMENT_REFUSED",
        registered.error.message,
      );
  }

  // 3. the one transaction, to the canonical time itself
  const transactionId = observationTransactionId(eventId);
  const advanced = await coordinator.advance({
    transaction_id: transactionId,
    cause: observationTransactionCause(eventId),
    trigger: { kind: OBSERVATION_TRIGGER_KIND, ref: eventId },
    continues: null,
    requested: { target: committed.data.established_at, condition: null },
    context: { ...PLAYER_CHOICE_AUTHORITY },
    publication: { basis: OBSERVATION_EVENT_BASIS, secrecy: "engine-internal" },
  });
  if (!advanced.ok)
    return fail(
      isFatal(advanced.error.code) ? advanced.error.code : "TRANSACTION_REFUSED",
      advanced.error.message,
    );
  const stage = accessPacketStage(eventId, recipient);
  const t = advanced.value.transaction;
  if (
    t.outcome.unresolved_dependents.length > 0 ||
    !t.stages.some((s) => canonicalEqual(s.stage, stage))
  )
    return fail("FORMATION_UNRESOLVED", "the observation's packet formation did not close");
  return ok({
    event_id: eventId,
    recipient_id: recipient,
    transaction_id: transactionId,
    replayed: advanced.value.replayed,
  });
}
