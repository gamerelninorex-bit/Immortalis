import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CanonicalTimeSchema,
  EntityId,
  NULL_PC_OOC_ADVANCE_COMMITTED,
  NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN,
  NULL_PC_OOC_HELD_ADVANCE_COMMITTED,
  NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN,
  PC_RELOCATION_COMMITTED,
  PC_TRANSFER_ADVANCE_COMMITTED,
  PLAYER_CHOICE_AUTHORITY,
  PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER,
  PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET,
  PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION,
  PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE,
  PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN,
  RELOCATION_OUTCOME_UNKNOWN,
  logisticsBoundaryId,
  logisticsObjectId,
  pcMovementRequestId,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CanonicalTime,
  type PcMovementCommitInput,
} from "@immortalis/contracts";
import {
  LogisticsAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  canonicalEqual,
  type CanonicalCampaign,
} from "@immortalis/engine";
import {
  advanceConfirmedPcTransferToDelivery,
  advanceNullPcOocToTarget,
  bindTrustedConfirmedPcRelocationContext,
  bindTrustedConfirmedPcTransferAdvanceContext,
  bindTrustedNullPcOocHeldContinuationContext,
  bindTrustedNullPcOocTargetAdvanceContext,
  commitConfirmedPcRelocation,
  resumeNullPcOocHeldAdvance,
} from "@immortalis/protocol";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import type {
  AdvanceIntent,
  NullAdvanceIntent,
  NullResumeIntent,
  RelocationIntent,
} from "./ledger.ts";
import { OOC_BANNER, OOC_BOUNDARY_NOTE, OOC_DEBUG_NOTE } from "./ooc.ts";
import type { LocalOperatorSession } from "./session.ts";
import type { OperatorTerminal } from "./terminal.ts";

/**
 * The operator's two player choices over ONE already-supported post-handover active-PC single-leg relocation, run through the
 * EXISTING strict host-protocol gateways (`commitConfirmedPcRelocation`, `advanceConfirmedPcTransferToDelivery`) and nothing else.
 *
 * Each command reads the current canonical state, states the exact choice to the operator, obtains the operator's own explicit
 * confirmation of exactly that choice (a distinct confirmation for each of the two choices), retains the confirmed intent
 * durably, and only then binds a FRESH trusted context from this session's campaign and invokes the gateway. The operator's
 * input is intent only: it never carries a role, permission, identity, owner result, status or "confirmed" flag, and the service
 * authors the gateway material (role, permission, identities, publication labels) itself from what the operator confirmed.
 *
 * Nothing here creates a campaign, a PC, a binding, a custody record or a destination (a missing antecedent refuses), advances
 * time except through the gateway's one existing operation, narrates an outcome, or reads a world fact beyond what the choice is
 * made of. The only statuses reported are the gateway's three minimum ones and the service's own neutral ones.
 */

export type CommandStatus =
  | typeof PC_RELOCATION_COMMITTED
  | typeof RELOCATION_OUTCOME_UNKNOWN
  | typeof PC_TRANSFER_ADVANCE_COMMITTED
  | typeof PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN
  | typeof NULL_PC_OOC_ADVANCE_COMMITTED
  | typeof NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN
  | typeof NULL_PC_OOC_HELD_ADVANCE_COMMITTED
  | typeof NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN
  | "DECLINED"
  | "UNAVAILABLE"
  | "INVALID_INPUT"
  | "SESSION_CLOSED"
  | "RECONCILIATION_REQUIRED"
  | "CHANGED_CHOICE"
  | "STALE_INTENT"
  | "NOTHING_TO_RECONCILE";

export interface CommandResult {
  readonly status: CommandStatus;
  readonly message: string;
}

const MESSAGES: Record<CommandStatus, string> = {
  RELOCATION_COMMITTED:
    "the relocation is committed; no time has advanced and this is not an arrival",
  RELOCATION_OUTCOME_UNKNOWN:
    "the outcome is not known; close, reopen and reconcile it by its original identity",
  ADVANCE_COMMITTED:
    "the advance transaction is committed; this is a transaction status, not a report of arrival, perception or knowledge",
  ADVANCE_OUTCOME_UNKNOWN:
    "the outcome is not known; close, reopen and reconcile it by its original identity",
  NULL_PC_ADVANCE_COMMITTED:
    "the OOC advance transaction is committed; this is a transaction status only, not a report that the target was attained, that anything occurred, or what anyone perceives or knows",
  NULL_PC_ADVANCE_OUTCOME_UNKNOWN:
    "the outcome is not known; close, reopen and reconcile it by its original identity",
  NULL_PC_HELD_ADVANCE_COMMITTED:
    "the OOC resume transaction is committed; this is a transaction status only, not a report that the target was attained, that anything occurred, or what anyone perceives or knows",
  NULL_PC_HELD_ADVANCE_OUTCOME_UNKNOWN:
    "the outcome is not known; close, reopen and reconcile it by its original identity",
  DECLINED: "not confirmed; nothing was changed",
  UNAVAILABLE: "no such action is available",
  INVALID_INPUT: "the input is not a valid choice",
  SESSION_CLOSED: "the session is closed",
  RECONCILIATION_REQUIRED:
    "an earlier confirmed choice is not yet reconciled; reopen the campaign and reconcile it first",
  CHANGED_CHOICE: "a different choice was already confirmed and cannot be replaced",
  STALE_INTENT: "the retained intent does not match the campaign",
  NOTHING_TO_RECONCILE: "there is nothing to reconcile",
};

const result = (status: CommandStatus): CommandResult => ({ status, message: MESSAGES[status] });

/**
 * Labels the gateways require and F-027 gives no vocabulary for (RC-02 basis / secrecy). They are technical encodings authored
 * by this trusted side: not interpreted by the PC, Logistics or Temporal owners, and no visibility or confidentiality semantics.
 */
export const OPERATOR_PUBLICATION_BASIS = "local-operator-confirmed-choice";
export const OPERATOR_PUBLICATION_SECRECY = "local-operator-session";

export interface CommandContext {
  readonly session: LocalOperatorSession;
  readonly terminal: OperatorTerminal;
  /** the source of newly minted, immutable intent identities (default: random UUIDs) */
  readonly newId?: () => string;
}

const RelocateInputSchema = z.strictObject({
  destination: z.strictObject({ world_id: EntityId, locus_id: EntityId }),
  delivery_at: CanonicalTimeSchema,
});
export type RelocateInput = z.infer<typeof RelocateInputSchema>;

const activePc = (campaign: CanonicalCampaign): string | undefined =>
  campaign.binding()?.value.active_pc.entity_id;

function guard(ctx: CommandContext): CommandResult | undefined {
  if (!ctx.session.isOpen) return result("SESSION_CLOSED");
  if (ctx.session.isAmbiguous) return result("RECONCILIATION_REQUIRED");
  return undefined;
}

// -- relocation ----------------------------------------------------------------------------------------------------------------

type CanonFootprint = "NONE" | "MATCHES" | "DIFFERS";

/** What canon holds of this PC's one journey: its commitment-of-record's destination and, once made, Logistics' declared boundary. */
interface Journey {
  readonly destination: { readonly world_id: string; readonly locus_id: string } | null;
  readonly delivery_at: CanonicalTime | null;
}

function journeyOf(campaign: CanonicalCampaign, pcId: string, worldId: string): Journey {
  const commitment = campaign.pcMovementCommitment(pcId)?.value;
  if (!commitment) return { destination: null, delivery_at: null };
  const to = commitment.intent.destination;
  const logistics = new LogisticsAdapter(campaign.store).commitment(worldId, pcId)?.value;
  return {
    destination: { world_id: to.world.entity_id, locus_id: to.locus.entity_id },
    delivery_at: logistics ? logistics.delivery.at : null,
  };
}

const sameDestination = (
  a: { readonly world_id: string; readonly locus_id: string },
  b: { readonly world_id: string; readonly locus_id: string },
): boolean => a.world_id === b.world_id && a.locus_id === b.locus_id;

/** What canon holds of the journey, compared with the choice a retained intent confirmed. */
function relocationFootprint(
  campaign: CanonicalCampaign,
  intent: RelocationIntent,
): CanonFootprint {
  const journey = journeyOf(campaign, intent.pc_id, intent.choice.destination.world_id);
  if (!journey.destination) return "NONE";
  if (!sameDestination(journey.destination, intent.choice.destination)) return "DIFFERS";
  if (journey.delivery_at && !canonicalEqual(journey.delivery_at, intent.delivery_at))
    return "DIFFERS";
  return "MATCHES";
}

async function presentRelocation(
  ctx: CommandContext,
  intent: RelocationIntent,
): Promise<CommandResult> {
  const { session } = ctx;
  const campaign = session.campaign;
  const before = campaign.store.head().revision;
  const context = bindTrustedConfirmedPcRelocationContext({
    campaign,
    choice: intent.choice,
    delivery_at: intent.delivery_at,
    publication: intent.publication,
  });
  const outcome = await commitConfirmedPcRelocation(context, {
    operation: PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION,
  });
  if (outcome.ok) {
    const marked = await session.ledger.markCommitted(intent.intent_id);
    if (!marked.ok) {
      session.markAmbiguous();
      return result("RELOCATION_OUTCOME_UNKNOWN");
    }
    return result(PC_RELOCATION_COMMITTED);
  }
  if (outcome.error.code === RELOCATION_OUTCOME_UNKNOWN) {
    session.markAmbiguous();
    return result(RELOCATION_OUTCOME_UNKNOWN);
  }
  // a refusal: an intent that left no footprint had no effect and is forgotten; one that did stays for reconciliation
  if (
    campaign.store.head().revision === before &&
    relocationFootprint(campaign, intent) === "NONE"
  ) {
    const forgotten = await session.ledger.discard(intent.intent_id);
    if (!forgotten.ok) session.markAmbiguous();
  }
  return result("UNAVAILABLE");
}

/**
 * The first player choice: relocate the active PC to ONE destination, with the delivery boundary the operator declares.
 * `input` is intent only. A choice already retained for this campaign is never re-asked and never replaced: the same choice
 * reconciles by its original identity. A different one replaces it only if the retained one never took effect, or took effect
 * only as the PC-side willingness (same destination) so that nothing but the declared boundary is still open; it then needs a
 * fresh confirmation of its own. Once Logistics has committed the journey nothing replaces it.
 */
export async function relocate(ctx: CommandContext, input: unknown): Promise<CommandResult> {
  const refused = guard(ctx);
  if (refused) return refused;
  const parsed = RelocateInputSchema.safeParse(input);
  if (!parsed.success) return result("INVALID_INPUT");
  const { session, terminal } = ctx;
  const campaign = session.campaign;
  const pcId = activePc(campaign);
  if (!pcId) return result("UNAVAILABLE");
  const { destination, delivery_at } = parsed.data;
  const choice: PcMovementCommitInput = {
    pc_id: pcId,
    destination,
    authored_under: { ...PLAYER_CHOICE_AUTHORITY },
  };

  const retained = session.ledger.relocation();
  if (retained) {
    if (retained.pc_id !== pcId) return result("STALE_INTENT");
    if (
      canonicalEqual(retained.choice, choice) &&
      canonicalEqual(retained.delivery_at, delivery_at)
    )
      return reconcileRelocation(ctx, retained);
    const held = journeyOf(campaign, pcId, retained.choice.destination.world_id);
    const open =
      retained.status === "CONFIRMED" &&
      held.delivery_at === null &&
      (held.destination === null || sameDestination(held.destination, destination));
    if (!open) return result("CHANGED_CHOICE");
  }

  // current canonical antecedents; none is ever created here
  const custody = campaign.pcPhysicalLocusCustody(pcId);
  const locus = campaign.pcCurrentLocus(pcId);
  if (!custody || !locus || !campaign.locus(destination.world_id, destination.locus_id))
    return result("UNAVAILABLE");
  const journey = journeyOf(campaign, pcId, destination.world_id);
  if (
    (journey.destination && !sameDestination(journey.destination, destination)) ||
    (journey.delivery_at && !canonicalEqual(journey.delivery_at, delivery_at)) ||
    (!journey.destination && locus.phase !== "STATIONARY_AT_ORIGIN")
  )
    return result("UNAVAILABLE");
  const origin = custody.value.stationary_locus;

  const subject = subjectOf({
    verb: "relocate",
    campaign_id: session.campaignId,
    pc_id: pcId,
    destination,
    delivery_at,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "relocate", subject, [
    `CONFIRMATION 1 OF 2 — RELOCATION`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    ``,
    `THE CHARACTER'S CHOICE (the one thing you are confirming):`,
    `  character: ${pcId}`,
    `  relocate to: ${destination.world_id} / ${destination.locus_id}`,
    `  (operator/debug: the character is currently stationed at ${origin.world.entity_id} / ${origin.locus.entity_id})`,
    ``,
    ...OOC_BOUNDARY_NOTE,
    `  declared boundary: ${delivery_at.value} ${delivery_at.unit}`,
    ``,
    `Confirming commits the character to this one relocation and starts the movement.`,
    `It advances no time and delivers nothing; progressing it is a separate, second confirmation.`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "relocate", subject)) return result("UNAVAILABLE");

  const intent: Omit<RelocationIntent, "seq" | "status"> = {
    kind: "RELOCATION",
    intent_id: `operator-intent:${(ctx.newId ?? randomUUID)()}`,
    pc_id: pcId,
    choice,
    delivery_at,
    publication: {
      cause: `operator-relocation-cause:${session.campaignId}:${pcId}`,
      basis: OPERATOR_PUBLICATION_BASIS,
      secrecy: OPERATOR_PUBLICATION_SECRECY,
    },
  };
  const kept = retained
    ? await session.ledger.replaceRelocation(retained.intent_id, intent)
    : await session.ledger.record(intent);
  if (!kept.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentRelocation(ctx, kept.value as RelocationIntent);
}

async function reconcileRelocation(
  ctx: CommandContext,
  intent: RelocationIntent,
): Promise<CommandResult> {
  const footprint = relocationFootprint(ctx.session.campaign, intent);
  if (footprint === "DIFFERS") return result("CHANGED_CHOICE");
  // a retained status of COMMITTED is believed only while canon holds the journey
  if (intent.status === "COMMITTED" && footprint === "NONE") return result("STALE_INTENT");
  return presentRelocation(ctx, intent);
}

// -- progression ---------------------------------------------------------------------------------------------------------------

/** The registered Logistics object of the PC's movement and whether its one boundary is still pending (read only). */
function pendingBoundary(
  campaign: CanonicalCampaign,
  pcId: string,
):
  | { readonly object_id: string; readonly boundary_id: string; readonly at: CanonicalTime }
  | undefined {
  const objectId = logisticsObjectId(pcMovementRequestId(pcId));
  const object = new TemporalCoordinator(campaign.store, new StageProviderRegistry()).object(
    objectId,
  )?.value;
  const boundary = object?.next_boundary;
  if (!boundary || boundary.boundary_id !== logisticsBoundaryId(pcMovementRequestId(pcId)))
    return undefined;
  return { object_id: objectId, boundary_id: boundary.boundary_id, at: boundary.at };
}

async function presentAdvance(ctx: CommandContext, intent: AdvanceIntent): Promise<CommandResult> {
  const { session } = ctx;
  const campaign = session.campaign;
  const before = campaign.store.head().revision;
  const context = bindTrustedConfirmedPcTransferAdvanceContext({
    campaign,
    pc_id: intent.pc_id,
    transaction: intent.transaction,
  });
  const outcome = await advanceConfirmedPcTransferToDelivery(context, {
    operation: PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER,
  });
  if (outcome.ok) {
    const marked = await session.ledger.markCommitted(intent.intent_id);
    if (!marked.ok) {
      session.markAmbiguous();
      return result(PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN);
    }
    return result(PC_TRANSFER_ADVANCE_COMMITTED);
  }
  const id = intent.transaction.transaction_id;
  const footprint =
    campaign.store.getFact(temporalTransactionKey(id)) !== undefined ||
    campaign.store.getFact(temporalTransactionAuthorityKey(id)) !== undefined;
  if (outcome.error.code === PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN || footprint) {
    session.markAmbiguous();
    return result(PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN);
  }
  if (campaign.store.head().revision !== before) {
    session.markAmbiguous();
    return result(PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN);
  }
  const forgotten = await session.ledger.discard(intent.intent_id);
  if (!forgotten.ok) session.markAmbiguous();
  return result("UNAVAILABLE");
}

/**
 * The second, independently chosen player choice: progress the PC's started movement to its delivery boundary (stop at
 * delivery). It takes no operator input at all — the boundary, object and any held remainder are read by the gateway from the
 * Temporal kernel's own registered state — and it needs its own confirmation and its own, newly minted, immutable transaction
 * identity. A held remainder is consumed only by a transaction confirmed here; a previous confirmation never progresses anything.
 */
export async function advance(ctx: CommandContext): Promise<CommandResult> {
  const refused = guard(ctx);
  if (refused) return refused;
  const { session, terminal } = ctx;
  const campaign = session.campaign;
  const pcId = activePc(campaign);
  if (!pcId) return result("UNAVAILABLE");

  const relocation = session.ledger.relocation();
  if (relocation) {
    if (relocation.pc_id !== pcId) return result("STALE_INTENT");
    if (relocation.status === "CONFIRMED") return result("RECONCILIATION_REQUIRED");
    if (relocationFootprint(campaign, relocation) === "NONE") return result("STALE_INTENT");
  }
  if (session.ledger.advances().some((a) => a.status === "CONFIRMED"))
    return result("RECONCILIATION_REQUIRED");

  const locus = campaign.pcCurrentLocus(pcId);
  const boundary = pendingBoundary(campaign, pcId);
  if (!locus || locus.phase === "STATIONARY_AT_ORIGIN" || !boundary) return result("UNAVAILABLE");

  const ordinal = session.ledger.advances().length + 1;
  const subject = subjectOf({
    verb: "advance",
    campaign_id: session.campaignId,
    pc_id: pcId,
    object_id: boundary.object_id,
    boundary_id: boundary.boundary_id,
    ordinal,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "advance", subject, [
    `CONFIRMATION 2 OF 2 — PROGRESSION (choice #${ordinal})`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    `  character: ${pcId}`,
    ``,
    `This is a new choice, separate from the relocation: advance time to the movement's declared`,
    `scenario boundary, ${boundary.at.value} ${boundary.at.unit} (the out-of-character value declared at the relocation, not a`,
    `calculated travel time), and no further. The world resolves whatever falls due on the way.`,
    `The result reports a transaction status only; it is not a report of arrival, perception or knowledge.`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "advance", subject)) return result("UNAVAILABLE");

  const uid = (ctx.newId ?? randomUUID)();
  const retained = await session.ledger.record({
    kind: "ADVANCE",
    intent_id: `operator-intent:${uid}`,
    pc_id: pcId,
    transaction: {
      transaction_id: `operator-advance:${uid}`,
      cause: `operator-advance-cause:${uid}`,
      trigger: { kind: "operator-progression-choice", ref: `operator-confirmation:${uid}` },
      context: { ...PLAYER_CHOICE_AUTHORITY },
      publication: { basis: OPERATOR_PUBLICATION_BASIS, secrecy: OPERATOR_PUBLICATION_SECRECY },
    },
  });
  if (!retained.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentAdvance(ctx, retained.value as AdvanceIntent);
}

// -- NULL-PC OOC time progression and recovery ---------------------------------------------------------------------------------

/**
 * The operator's two NULL-PC OOC choices, for a campaign with NO active character: (1) ONE explicit target-only advance, and (2)
 * — separately and anew, after the kernel committed an unfinished remainder of an earlier one — ONE explicit choice to resume
 * exactly that remainder. Each is routed through the already shipped IM-15 host gateways (`advanceNullPcOocToTarget`,
 * `resumeNullPcOocHeldAdvance`), never through the Temporal coordinator, and each is confirmed with its own verb and fresh
 * challenge, retained BEFORE the gateway is invoked, and given its own newly minted, immutable transaction identity. The target is
 * the operator's exact canonical time: not a duration, calendar, estimate or default. Nothing here authors a Temporal resolution,
 * a GIP status or any owner fact, and a committed status is a transaction status, never attainment, occurrence or knowledge.
 */

const NullAdvanceInputSchema = z.strictObject({ target: CanonicalTimeSchema });
export type NullAdvanceInput = z.infer<typeof NullAdvanceInputSchema>;

const temporalState = (campaign: CanonicalCampaign) =>
  new TemporalCoordinator(campaign.store, new StageProviderRegistry()).state()?.value;

const hasFootprint = (campaign: CanonicalCampaign, transactionId: string): boolean =>
  campaign.store.getFact(temporalTransactionKey(transactionId)) !== undefined ||
  campaign.store.getFact(temporalTransactionAuthorityKey(transactionId)) !== undefined;

/** Common refusals of both NULL-PC commands: closed/ambiguous session, an active character, an unreconciled choice, a stale record. */
function nullPcGuard(ctx: CommandContext): CommandResult | undefined {
  const refused = guard(ctx);
  if (refused) return refused;
  const { session } = ctx;
  if (activePc(session.campaign)) return result("UNAVAILABLE");
  if (session.ledger.intents().some((i) => i.status === "CONFIRMED"))
    return result("RECONCILIATION_REQUIRED");
  // a retained COMMITTED is believed only while canon holds that transaction (an older save restored under it is stale)
  if (
    session.ledger
      .nullPcChoices()
      .some(
        (c) =>
          c.status === "COMMITTED" && !hasFootprint(session.campaign, c.transaction.transaction_id),
      )
  )
    return result("STALE_INTENT");
  return undefined;
}

const nullTransaction = (kind: "advance" | "resume", uid: string) => ({
  transaction_id: `operator-null-${kind}:${uid}`,
  cause: `operator-null-${kind}-cause:${uid}`,
  trigger: { kind: `operator-null-pc-${kind}-choice`, ref: `operator-confirmation:${uid}` },
  context: { ...PLAYER_CHOICE_AUTHORITY },
  publication: { basis: OPERATOR_PUBLICATION_BASIS, secrecy: OPERATOR_PUBLICATION_SECRECY },
});

async function presentNullChoice(
  ctx: CommandContext,
  intent: NullAdvanceIntent | NullResumeIntent,
): Promise<CommandResult> {
  const { session } = ctx;
  const campaign = session.campaign;
  const before = campaign.store.head().revision;
  const initial = intent.kind === "NULL_ADVANCE";
  const committed = initial ? NULL_PC_OOC_ADVANCE_COMMITTED : NULL_PC_OOC_HELD_ADVANCE_COMMITTED;
  const unknown = initial
    ? NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN
    : NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN;
  const outcome =
    intent.kind === "NULL_ADVANCE"
      ? await advanceNullPcOocToTarget(
          bindTrustedNullPcOocTargetAdvanceContext({
            campaign,
            target: intent.target,
            transaction: intent.transaction,
          }),
          { operation: PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET },
        )
      : await resumeNullPcOocHeldAdvance(
          bindTrustedNullPcOocHeldContinuationContext({
            campaign,
            held: intent.held,
            transaction: intent.transaction,
          }),
          { operation: PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE },
        );
  if (outcome.ok) {
    const marked = await session.ledger.markCommitted(intent.intent_id);
    if (!marked.ok) {
      session.markAmbiguous();
      return result(unknown);
    }
    return result(committed);
  }
  // a failure after anything may have committed is never "safely no advancement"; a refusal that left no footprint had no effect
  if (
    outcome.error.code === unknown ||
    hasFootprint(campaign, intent.transaction.transaction_id) ||
    campaign.store.head().revision !== before
  ) {
    session.markAmbiguous();
    return result(unknown);
  }
  const forgotten = await session.ledger.discard(intent.intent_id);
  if (!forgotten.ok) session.markAmbiguous();
  return result("UNAVAILABLE");
}

/**
 * The first NULL-PC choice: advance the campaign's canonical time to ONE exact target the operator names, and no further. The
 * target is intent only (a strict canonical-time value); the gateway and the Temporal kernel judge it (another unit, a past
 * target, an absent basis, a held remainder and every unresolved stage are refused or stopped by them, not decided here).
 */
export async function nullAdvance(ctx: CommandContext, input: unknown): Promise<CommandResult> {
  const refused = nullPcGuard(ctx);
  if (refused) return refused;
  const parsed = NullAdvanceInputSchema.safeParse(input);
  if (!parsed.success) return result("INVALID_INPUT");
  const { session, terminal } = ctx;
  const { target } = parsed.data;
  // an unfinished remainder can only be taken up by the separate resume choice; this gateway never consumes or overrides it
  const state = temporalState(session.campaign);
  if (!state || state.continuation !== null) return result("UNAVAILABLE");

  const ordinal = session.ledger.nullPcChoices().length + 1;
  const subject = subjectOf({
    verb: "null-advance",
    campaign_id: session.campaignId,
    target,
    ordinal,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "null-advance", subject, [
    `CONFIRMATION — OOC TIME ADVANCE, NO ACTIVE CHARACTER (choice #${ordinal})`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    ``,
    `YOUR CHOICE (the one thing you are confirming):`,
    `  advance the world's canonical time to exactly ${target.value} ${target.unit}, and no further.`,
    ``,
    `This is an exact target you chose from outside the world: not a duration, a calendar date, a forecast or a default.`,
    `The world resolves whatever falls due by that target, each by its own owner. The result reports a transaction status only;`,
    `it does not say that the target was attained, that anything occurred, or what any character perceives or knows.`,
    `Progressing any further later is a separate choice with its own confirmation.`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "null-advance", subject)) return result("UNAVAILABLE");

  const uid = (ctx.newId ?? randomUUID)();
  const retained = await session.ledger.record({
    kind: "NULL_ADVANCE",
    intent_id: `operator-intent:${uid}`,
    target,
    transaction: nullTransaction("advance", uid),
  });
  if (!retained.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentNullChoice(ctx, retained.value as NullAdvanceIntent);
}

/**
 * The separate, second NULL-PC choice: resume exactly the remainder the kernel committed for an earlier choice of this operator.
 * It takes no operator input: the lineage is the one the kernel actually holds, matched to the retained choice that was confirmed
 * (whose target is the one the operator originally confirmed, never a new one). It needs its own confirmation and its own newly
 * minted transaction identity; the earlier confirmation never stands for it, and nothing resumes on reopen, retry or reconcile.
 */
export async function nullResume(ctx: CommandContext): Promise<CommandResult> {
  const refused = nullPcGuard(ctx);
  if (refused) return refused;
  const { session, terminal } = ctx;
  const state = temporalState(session.campaign);
  if (!state || state.continuation === null) return result("UNAVAILABLE");
  const choices = session.ledger.nullPcChoices();
  const earlierIndex = choices.findIndex(
    (c) => c.transaction.transaction_id === state.continuation!.from_transaction,
  );
  const earlier = choices[earlierIndex];
  if (!earlier || earlier.status !== "COMMITTED") return result("UNAVAILABLE");
  const held = {
    from_transaction: earlier.transaction.transaction_id,
    target: earlier.kind === "NULL_ADVANCE" ? earlier.target : earlier.held.target,
  };
  const earlierOrdinal = earlierIndex + 1;

  const ordinal = choices.length + 1;
  const subject = subjectOf({
    verb: "null-resume",
    campaign_id: session.campaignId,
    held,
    ordinal,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "null-resume", subject, [
    `CONFIRMATION — OOC RESUME OF AN EARLIER ADVANCE, NO ACTIVE CHARACTER (choice #${ordinal})`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    ``,
    `YOUR CHOICE (the one thing you are confirming):`,
    `  take up the remainder of your earlier choice #${earlierOrdinal} toward the SAME target it confirmed,`,
    `  ${held.target.value} ${held.target.unit}, and no further. No new target can be stated here.`,
    ``,
    `This is a new choice, separate from choice #${earlierOrdinal}: that confirmation does not authorize this one, and nothing`,
    `resumes on its own. The world resolves whatever falls due on the way, each by its own owner. The result reports a transaction`,
    `status only; it does not say that the target was attained, that anything occurred, or what any character perceives or knows.`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "null-resume", subject)) return result("UNAVAILABLE");

  const uid = (ctx.newId ?? randomUUID)();
  const retained = await session.ledger.record({
    kind: "NULL_RESUME",
    intent_id: `operator-intent:${uid}`,
    held,
    transaction: nullTransaction("resume", uid),
  });
  if (!retained.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentNullChoice(ctx, retained.value as NullResumeIntent);
}

// -- reconciliation ------------------------------------------------------------------------------------------------------------

/**
 * Reconciles every confirmed-but-unsettled intent by its ORIGINAL identity, in the order they were confirmed: the retained
 * choice and transaction are presented again to the unchanged gateways, which replay what committed and finish what did not.
 * It asks nothing of the operator (the choice was already confirmed, and nothing here can create a new one) and stops at the
 * first intent that does not commit.
 */
export async function reconcile(ctx: CommandContext): Promise<readonly CommandResult[]> {
  const refused = guard(ctx);
  if (refused) return [refused];
  const pending = ctx.session.ledger.intents().filter((i) => i.status === "CONFIRMED");
  if (pending.length === 0) return [result("NOTHING_TO_RECONCILE")];
  const campaign = ctx.session.campaign;
  const pcId = activePc(campaign);
  const results: CommandResult[] = [];
  for (const intent of [...pending].sort((a, b) => a.seq - b.seq)) {
    let outcome: CommandResult;
    if (intent.kind === "NULL_ADVANCE" || intent.kind === "NULL_RESUME") {
      // a NULL-PC choice is only ever presented while the campaign still has no active character
      if (pcId) {
        results.push(result("STALE_INTENT"));
        break;
      }
      outcome = await presentNullChoice(ctx, intent);
    } else {
      if (!pcId || intent.pc_id !== pcId) {
        results.push(result("STALE_INTENT"));
        break;
      }
      outcome =
        intent.kind === "RELOCATION"
          ? await reconcileRelocation(ctx, intent)
          : await presentAdvance(ctx, intent);
    }
    results.push(outcome);
    if (
      outcome.status !== PC_RELOCATION_COMMITTED &&
      outcome.status !== PC_TRANSFER_ADVANCE_COMMITTED &&
      outcome.status !== NULL_PC_OOC_ADVANCE_COMMITTED &&
      outcome.status !== NULL_PC_OOC_HELD_ADVANCE_COMMITTED
    )
      break;
  }
  return results;
}

/** The operator's retained choices, as the trusted side remembers them. No canonical world state is read or reported. */
export interface StatusReport {
  readonly campaign_id: string;
  readonly operator: string;
  readonly relocation: "NONE" | "CONFIRMED" | "COMMITTED";
  readonly advances: readonly ("CONFIRMED" | "COMMITTED")[];
  /** the NULL-PC OOC choices, in the order confirmed (retained status only; never a world report) */
  readonly ooc_choices: readonly {
    readonly kind: "ADVANCE" | "RESUME";
    readonly status: "CONFIRMED" | "COMMITTED";
  }[];
}

export function status(session: LocalOperatorSession): StatusReport {
  return {
    campaign_id: session.campaignId,
    operator: `${session.operator.username} (uid ${session.operator.uid})`,
    relocation: session.ledger.relocation()?.status ?? "NONE",
    advances: session.ledger.advances().map((a) => a.status),
    ooc_choices: session.ledger.nullPcChoices().map((c) => ({
      kind: c.kind === "NULL_ADVANCE" ? "ADVANCE" : "RESUME",
      status: c.status,
    })),
  };
}
