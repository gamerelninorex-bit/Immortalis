import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  CanonicalTimeSchema,
  COLLECTION_OUTCOME_UNKNOWN,
  EntityId,
  PC_COLLECTION_COMMITTED,
  PROTOCOL_OP_CEASE_CONFIRMED_PC_COLLECTION,
  PROTOCOL_OP_COMMIT_CONFIRMED_PC_COLLECTION,
  PROTOCOL_OP_GET_PC_COLLECTION_REACH_TASK,
  PROTOCOL_OP_START_CONFIRMED_PC_COLLECTION,
  PROTOCOL_OP_SUBMIT_PC_COLLECTION_REACH,
  PositiveQuantitySchema,
  ResolutionTransactionSchema,
  TransactionAuthoritySchema,
  NULL_PC_OOC_ADVANCE_COMMITTED,
  NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN,
  NULL_PC_OOC_HELD_ADVANCE_COMMITTED,
  NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN,
  PC_RELOCATION_COMMITTED,
  PC_TARGET_ADVANCE_COMMITTED,
  PC_TARGET_ADVANCE_OUTCOME_UNKNOWN,
  PC_TRANSFER_ADVANCE_COMMITTED,
  PLAYER_CHOICE_AUTHORITY,
  PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET,
  PROTOCOL_OP_ADVANCE_CONFIRMED_PC_TRANSFER,
  PROTOCOL_OP_ADVANCE_NULL_PC_OOC_TO_TARGET,
  PROTOCOL_OP_COMMIT_CONFIRMED_PC_RELOCATION,
  PROTOCOL_OP_RESUME_NULL_PC_OOC_HELD_ADVANCE,
  PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN,
  RELOCATION_OUTCOME_UNKNOWN,
  logisticsBoundaryId,
  logisticsObjectId,
  pcCollectionCessationKey,
  pcCollectionCommitmentKey,
  pcMovementRequestId,
  productionReserveKey,
  worldSourceConditionKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CanonicalTime,
  type PcCollectionCommitInput,
  type PcCollectionCycleTask,
  type PcCollectionReachTask,
  type PcMovementCommitInput,
} from "@immortalis/contracts";
import {
  LogisticsAdapter,
  PcCollectionAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  canonicalEqual,
  type CanonicalCampaign,
} from "@immortalis/engine";
import {
  advanceActivePcToTarget,
  advanceConfirmedPcTransferToDelivery,
  advanceNullPcOocToTarget,
  bindTrustedActivePcHeldTargetAdvanceContext,
  bindTrustedActivePcTargetAdvanceContext,
  bindTrustedConfirmedPcCessationContext,
  bindTrustedConfirmedPcCollectionContext,
  ceaseConfirmedPcCollection,
  bindTrustedConfirmedPcRelocationContext,
  bindTrustedConfirmedPcTransferAdvanceContext,
  bindTrustedNullPcOocHeldContinuationContext,
  bindTrustedNullPcOocTargetAdvanceContext,
  commitConfirmedPcCollection,
  commitConfirmedPcRelocation,
  getPcCollectionReachTask,
  resumeNullPcOocHeldAdvance,
  startConfirmedPcCollection,
  submitPcCollectionReach,
} from "@immortalis/protocol";
import { consumeConfirmation, requestOperatorConfirmation, subjectOf } from "./confirmation.ts";
import type {
  AdvanceIntent,
  CollectionCessationIntent,
  CollectionIntent,
  NullAdvanceIntent,
  NullResumeIntent,
  PcTargetAdvanceIntent,
  PcTargetIntent,
  PcTargetResumeIntent,
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
  | typeof PC_TARGET_ADVANCE_COMMITTED
  | typeof PC_TARGET_ADVANCE_OUTCOME_UNKNOWN
  | typeof PC_COLLECTION_COMMITTED
  | typeof COLLECTION_OUTCOME_UNKNOWN
  | "TIME_ESTABLISHED"
  | "SETTING_DECLARED"
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
  PC_TARGET_ADVANCE_COMMITTED:
    "the character's advance transaction is committed; this is a transaction status only, not a report that the target was attained, that anything occurred, or what the character or anyone perceives or knows",
  PC_TARGET_ADVANCE_OUTCOME_UNKNOWN:
    "the outcome is not known; close, reopen and reconcile it by its original identity",
  COLLECTION_COMMITTED:
    "the collection step is committed; this is a transaction status only, not a report that anything was collected, that time passed, or what the character or anyone perceives or knows",
  COLLECTION_OUTCOME_UNKNOWN:
    "the outcome is not known; close, reopen and reconcile it by its original identity",
  TIME_ESTABLISHED:
    "the campaign's starting chronology is established once; this is its origin only, not the passing of any time, an arrival or anything perceived",
  SETTING_DECLARED:
    "the closed setting is declared by its author; the owners derived its coverage. It is not a player choice, a grant of any right beyond its stated grounds, or the passing of any time",
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
  /**
   * The `role.gm` host that reads the physical reach of a confirmed collection attempt (CPAA-C1 v0.2 PROVISIONAL): given the bounded task
   * it returns its UNTRUSTED reading, which the engine validates and from which it derives the verdict. Absent: no reading is available
   * and the attempt stays held. Nothing here is the player's confirmation.
   */
  readonly reachHost?: (task: PcCollectionReachTask) => Promise<unknown>;
  /**
   * The I-002 compiler/adjudicator `role.gm` host that attests the PC's serial handling cycle (CPAA-C1 v0.3 F-2): given the bounded task it
   * returns its UNTRUSTED reading, which the engine validates; `role.archivist` then writes the owner's attestation. A referee act BEFORE any
   * player choice, never the player's confirmation. Absent: no attestation is available and no exact act is offered.
   */
  readonly attestHost?: (task: PcCollectionCycleTask) => Promise<unknown>;
}

const RelocateInputSchema = z.strictObject({
  destination: z.strictObject({ world_id: EntityId, locus_id: EntityId }),
  delivery_at: CanonicalTimeSchema,
});
export type RelocateInput = z.infer<typeof RelocateInputSchema>;

const activePc = (campaign: CanonicalCampaign): string | undefined =>
  campaign.binding()?.value.active_pc.entity_id;

/**
 * A collection that holds the PC's time (in flight, invalidated, registered or part-way through its stop) refuses EVERY arbitrary-target
 * or resume route, whatever horizon is asked and whether or not that horizon would cross the work's own boundary or a hidden one: the
 * refusal is a fact about the pending work, never a function of the requested time (C8). The only routes that move that work are the
 * separately confirmed finish (target derived from the admitted work, no caller horizon) and the separately confirmed cessation.
 */
function collectionPending(campaign: CanonicalCampaign): CommandResult | undefined {
  const pc = activePc(campaign);
  return pc !== undefined && new PcCollectionAdapter(campaign.store).hold(pc).state !== "NONE"
    ? result("UNAVAILABLE")
    : undefined;
}

function guard(ctx: CommandContext): CommandResult | undefined {
  if (!ctx.session.isOpen) return result("SESSION_CLOSED");
  if (ctx.session.isAmbiguous) return result("RECONCILIATION_REQUIRED");
  return undefined;
}

/** An active-PC target choice that is confirmed but not yet settled holds the PC where it is: nothing may move it until reconciled. */
function unreconciledPcTarget(ctx: CommandContext): CommandResult | undefined {
  return ctx.session.ledger.pcTargetChoices().some((c) => c.status === "CONFIRMED")
    ? result("RECONCILIATION_REQUIRED")
    : undefined;
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
  const refused = guard(ctx) ?? unreconciledPcTarget(ctx);
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
  const refused =
    guard(ctx) ?? unreconciledPcTarget(ctx) ?? collectionPending(ctx.session.campaign);
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

/**
 * How canon stands toward ONE retained NULL-PC choice, judged from the kernel's own records under the choice's transaction
 * identity — never from their mere existence:
 *
 *   NONE      canon holds no record under that identity
 *   PARTIAL   the opened transaction's authority matches the choice, the sealed record is not (yet) committed
 *   SEALED    the sealed record matches the choice, and so does the opened authority wherever the kernel opened one (it does
 *             so only when the transaction engaged work; a quiet carry to the target seals with none)
 *   DIFFERS   a record under that identity exists but is not the choice (another target, branch, lineage or material), or is
 *             not a valid kernel record at all
 *
 * "Matches" means the exact retained material: the target-only request (`requested` = { target, condition: null }), the
 * continuation branch (`continues` null for an initial choice, the held transaction for a resume), the cause, the trigger, the
 * authorized context and — on the authority, the only record that carries them — the publication labels. A resume must also
 * continue a sealed, truthfully unresolved transaction that asked for the same target.
 */
type CanonStanding = "NONE" | "PARTIAL" | "SEALED" | "DIFFERS";

type TargetChoice =
  NullAdvanceIntent | NullResumeIntent | PcTargetAdvanceIntent | PcTargetResumeIntent;

const isInitialChoice = (
  choice: TargetChoice,
): choice is NullAdvanceIntent | PcTargetAdvanceIntent =>
  choice.kind === "NULL_ADVANCE" || choice.kind === "PC_TARGET_ADVANCE";

function canonStanding(campaign: CanonicalCampaign, choice: TargetChoice): CanonStanding {
  const t = choice.transaction;
  const target = isInitialChoice(choice) ? choice.target : choice.held.target;
  const continues = isInitialChoice(choice) ? null : choice.held.from_transaction;
  const material = {
    transaction_id: t.transaction_id,
    cause: t.cause,
    trigger: t.trigger,
    continues,
    requested: { target, condition: null },
    context: t.context,
  };
  const same = (record: object): boolean =>
    Object.entries(material).every(([k, v]) =>
      canonicalEqual((record as Record<string, unknown>)[k], v),
    );

  const opened = campaign.store.getFact(temporalTransactionAuthorityKey(t.transaction_id));
  const sealed = campaign.store.getFact(temporalTransactionKey(t.transaction_id));
  let authorityMatches = false;
  if (opened) {
    const parsed = TransactionAuthoritySchema.safeParse(opened.value);
    if (
      !parsed.success ||
      !same(parsed.data) ||
      !canonicalEqual(parsed.data.publication, t.publication)
    )
      return "DIFFERS";
    authorityMatches = true;
  }
  if (sealed) {
    const parsed = ResolutionTransactionSchema.safeParse(sealed.value);
    if (!parsed.success || !same(parsed.data)) return "DIFFERS";
    // the kernel opens a transaction's authority only when it engages work; a quiet carry seals with none. A sealed record that
    // engaged work without its opened authority is not a transaction the kernel could have committed
    if (parsed.data.engaged.length > 0 && !authorityMatches) return "DIFFERS";
  }
  if (!isInitialChoice(choice) && (opened || sealed)) {
    const from = campaign.store.getFact(temporalTransactionKey(choice.held.from_transaction));
    const prior = from ? ResolutionTransactionSchema.safeParse(from.value) : undefined;
    if (
      !prior?.success ||
      prior.data.outcome.stop_reason !== "DEPENDENCY_UNRESOLVED" ||
      !canonicalEqual(prior.data.requested, material.requested)
    )
      return "DIFFERS";
  }
  return sealed ? "SEALED" : opened ? "PARTIAL" : "NONE";
}

/** Common refusals of both NULL-PC commands: closed/ambiguous session, an active character, an unreconciled choice, a stale record. */
function nullPcGuard(ctx: CommandContext): CommandResult | undefined {
  const refused = guard(ctx);
  if (refused) return refused;
  const { session } = ctx;
  if (activePc(session.campaign)) return result("UNAVAILABLE");
  if (session.ledger.intents().some((i) => i.status === "CONFIRMED"))
    return result("RECONCILIATION_REQUIRED");
  // a retained COMMITTED is believed only while canon holds the very choice that was confirmed: its sealed record must carry the
  // retained target, continuation branch and authorized material (an older or different save restored under it is stale, even
  // when a record exists under the same transaction identity)
  if (
    session.ledger
      .nullPcChoices()
      .some((c) => c.status === "COMMITTED" && canonStanding(session.campaign, c) !== "SEALED")
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
  // a record already under this identity that is not the confirmed choice is never replayed, repaired or adopted
  if (canonStanding(campaign, intent) === "DIFFERS") return result("STALE_INTENT");
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

// -- ACTIVE-PC target-only time progression and recovery ----------------------------------------------------------------------

/**
 * The operator's two ACTIVE-PC target-only choices, for a campaign WITH an active character that is stationary: (1) ONE explicit
 * target-only advance, and (2) — separately and anew, after the kernel committed an unfinished remainder of an earlier one — ONE
 * explicit choice to resume exactly that remainder. Both are routed through the one already shipped IM-15 host gateway
 * (`advanceActivePcToTarget`), never through the Temporal coordinator, and each is confirmed with its own verb and fresh challenge,
 * retained BEFORE the gateway is invoked, and given its own newly minted, immutable transaction identity. The target is the
 * operator's exact canonical time: not a duration, calendar, estimate or default; it is not what the character chose or waits for.
 * Whether the character may be advanced at all (stationary, nothing of its own in flight, no indispensable interruption being
 * bypassed) is judged by the gateway from canonical state, not here. Nothing here authors a Temporal resolution, a GIP status or any
 * owner fact, and a committed status is a transaction status, never attainment, occurrence, perception or knowledge.
 */

const pcTargetTransaction = (kind: "advance" | "resume", uid: string) => ({
  transaction_id: `operator-pc-target-${kind}:${uid}`,
  cause: `operator-pc-target-${kind}-cause:${uid}`,
  trigger: { kind: `operator-pc-target-${kind}-choice`, ref: `operator-confirmation:${uid}` },
  context: { ...PLAYER_CHOICE_AUTHORITY },
  publication: { basis: OPERATOR_PUBLICATION_BASIS, secrecy: OPERATOR_PUBLICATION_SECRECY },
});

/** Common refusals of both active-PC target commands: closed/ambiguous session, no character, an unreconciled or stale choice. */
function pcTargetGuard(ctx: CommandContext): CommandResult | string {
  const refused = guard(ctx);
  if (refused) return refused;
  const { session } = ctx;
  const pcId = activePc(session.campaign);
  if (!pcId) return result("UNAVAILABLE");
  if (session.ledger.intents().some((i) => i.status === "CONFIRMED"))
    return result("RECONCILIATION_REQUIRED");
  const choices = session.ledger.pcTargetChoices();
  // a retained choice made for another character is not this campaign's; a retained COMMITTED is believed only while canon holds
  // the very choice that was confirmed (its sealed record carries the retained target, branch and authorized material)
  if (
    choices.some(
      (c) =>
        c.pc_id !== pcId ||
        (c.status === "COMMITTED" && canonStanding(session.campaign, c) !== "SEALED"),
    )
  )
    return result("STALE_INTENT");
  return pcId;
}

async function presentPcTargetChoice(
  ctx: CommandContext,
  intent: PcTargetIntent,
): Promise<CommandResult> {
  const { session } = ctx;
  const campaign = session.campaign;
  // a record already under this identity that is not the confirmed choice is never replayed, repaired or adopted
  if (canonStanding(campaign, intent) === "DIFFERS") return result("STALE_INTENT");
  const before = campaign.store.head().revision;
  const outcome = await advanceActivePcToTarget(
    intent.kind === "PC_TARGET_ADVANCE"
      ? bindTrustedActivePcTargetAdvanceContext({
          campaign,
          pc_id: intent.pc_id,
          target: intent.target,
          transaction: intent.transaction,
        })
      : bindTrustedActivePcHeldTargetAdvanceContext({
          campaign,
          pc_id: intent.pc_id,
          held: intent.held,
          transaction: intent.transaction,
        }),
    { operation: PROTOCOL_OP_ADVANCE_ACTIVE_PC_TO_TARGET },
  );
  if (outcome.ok) {
    const marked = await session.ledger.markCommitted(intent.intent_id);
    if (!marked.ok) {
      session.markAmbiguous();
      return result(PC_TARGET_ADVANCE_OUTCOME_UNKNOWN);
    }
    return result(PC_TARGET_ADVANCE_COMMITTED);
  }
  // a failure after anything may have committed is never "safely no advancement"; a refusal that left no footprint had no effect
  if (
    outcome.error.code === PC_TARGET_ADVANCE_OUTCOME_UNKNOWN ||
    hasFootprint(campaign, intent.transaction.transaction_id) ||
    campaign.store.head().revision !== before
  ) {
    session.markAmbiguous();
    return result(PC_TARGET_ADVANCE_OUTCOME_UNKNOWN);
  }
  const forgotten = await session.ledger.discard(intent.intent_id);
  if (!forgotten.ok) session.markAmbiguous();
  return result("UNAVAILABLE");
}

/** Where canon says the character stands now, for the operator's console only: nothing the character perceives or knows. */
function stationedAt(campaign: CanonicalCampaign, pcId: string): string | undefined {
  const locus = campaign.pcCurrentLocus(pcId);
  const here = locus?.stationary;
  return here ? `${here.world.entity_id} / ${here.locus.entity_id}` : undefined;
}

/**
 * The first active-PC choice: advance the campaign's canonical time, with its one active and stationary character, to ONE exact
 * target the operator names, and no further. The target is intent only (a strict canonical-time value); the gateway and the
 * Temporal kernel judge it (another unit, a past target, an absent basis, a held remainder, a character that is not stationary
 * and every unresolved stage are refused or stopped by them, not decided here).
 */
export async function pcTargetAdvance(ctx: CommandContext, input: unknown): Promise<CommandResult> {
  const guarded = pcTargetGuard(ctx);
  if (typeof guarded !== "string") return guarded;
  const pcId = guarded;
  const pending = collectionPending(ctx.session.campaign);
  if (pending) return pending;
  const parsed = NullAdvanceInputSchema.safeParse(input);
  if (!parsed.success) return result("INVALID_INPUT");
  const { session, terminal } = ctx;
  const { target } = parsed.data;
  // an unfinished remainder can only be taken up by the separate resume choice; this gateway never consumes or overrides it
  const state = temporalState(session.campaign);
  const where = stationedAt(session.campaign, pcId);
  if (!state || state.continuation !== null || !where) return result("UNAVAILABLE");

  const ordinal = session.ledger.pcTargetChoices().length + 1;
  const subject = subjectOf({
    verb: "pc-target-advance",
    campaign_id: session.campaignId,
    pc_id: pcId,
    target,
    ordinal,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "pc-target-advance", subject, [
    `CONFIRMATION — OOC TIME ADVANCE, ACTIVE CHARACTER (choice #${ordinal})`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    `  character: ${pcId}`,
    `  (operator/debug: canon places the character, stationary, at ${where})`,
    ``,
    `YOUR CHOICE (the one thing you are confirming):`,
    `  advance the world's canonical time to exactly ${target.value} ${target.unit}, and no further.`,
    ``,
    `This is an exact target you chose from outside the world: not a duration, a calendar date, a forecast or a default, and not`,
    `an action the character takes. The world resolves whatever falls due by that target, each by its own owner. The result`,
    `reports a transaction status only; it does not say that the target was attained, that anything occurred, or what the`,
    `character or anyone perceives or knows.`,
    `Progressing any further later is a separate choice with its own confirmation.`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "pc-target-advance", subject))
    return result("UNAVAILABLE");

  const uid = (ctx.newId ?? randomUUID)();
  const retained = await session.ledger.record({
    kind: "PC_TARGET_ADVANCE",
    intent_id: `operator-intent:${uid}`,
    pc_id: pcId,
    target,
    transaction: pcTargetTransaction("advance", uid),
  });
  if (!retained.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentPcTargetChoice(ctx, retained.value as PcTargetAdvanceIntent);
}

/**
 * The separate, second active-PC choice: resume exactly the remainder the kernel committed for an earlier choice of this operator.
 * It takes no operator input: the lineage is the one the kernel actually holds, matched to the retained choice that was confirmed
 * (whose target is the one the operator originally confirmed, never a new one). It needs its own confirmation and its own newly
 * minted transaction identity; the earlier confirmation never stands for it, and nothing resumes on reopen, retry or reconcile.
 */
export async function pcTargetResume(ctx: CommandContext): Promise<CommandResult> {
  const guarded = pcTargetGuard(ctx);
  if (typeof guarded !== "string") return guarded;
  const pcId = guarded;
  const pending = collectionPending(ctx.session.campaign);
  if (pending) return pending;
  const { session, terminal } = ctx;
  const state = temporalState(session.campaign);
  if (!state || state.continuation === null) return result("UNAVAILABLE");
  const choices = session.ledger.pcTargetChoices();
  const earlierIndex = choices.findIndex(
    (c) => c.transaction.transaction_id === state.continuation!.from_transaction,
  );
  const earlier = choices[earlierIndex];
  const where = stationedAt(session.campaign, pcId);
  if (!earlier || earlier.status !== "COMMITTED" || !where) return result("UNAVAILABLE");
  const held = {
    from_transaction: earlier.transaction.transaction_id,
    target: earlier.kind === "PC_TARGET_ADVANCE" ? earlier.target : earlier.held.target,
  };
  const earlierOrdinal = earlierIndex + 1;

  const ordinal = choices.length + 1;
  const subject = subjectOf({
    verb: "pc-target-resume",
    campaign_id: session.campaignId,
    pc_id: pcId,
    held,
    ordinal,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "pc-target-resume", subject, [
    `CONFIRMATION — OOC RESUME OF AN EARLIER ADVANCE, ACTIVE CHARACTER (choice #${ordinal})`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    `  character: ${pcId}`,
    `  (operator/debug: canon places the character, stationary, at ${where})`,
    ``,
    `YOUR CHOICE (the one thing you are confirming):`,
    `  take up the remainder of your earlier choice #${earlierOrdinal} toward the SAME target it confirmed,`,
    `  ${held.target.value} ${held.target.unit}, and no further. No new target can be stated here.`,
    ``,
    `This is a new choice, separate from choice #${earlierOrdinal}: that confirmation does not authorize this one, and nothing`,
    `resumes on its own. The world resolves whatever falls due on the way, each by its own owner. The result reports a transaction`,
    `status only; it does not say that the target was attained, that anything occurred, or what the character or anyone perceives or knows.`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "pc-target-resume", subject)) return result("UNAVAILABLE");

  const uid = (ctx.newId ?? randomUUID)();
  const retained = await session.ledger.record({
    kind: "PC_TARGET_RESUME",
    intent_id: `operator-intent:${uid}`,
    pc_id: pcId,
    held,
    transaction: pcTargetTransaction("resume", uid),
  });
  if (!retained.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentPcTargetChoice(ctx, retained.value as PcTargetResumeIntent);
}

// -- CPAA-C1 v0.2 PROVISIONAL: the player's confirmed collection attempt ---------------------------------------------------------

const CollectInputSchema = z.strictObject({
  source: z.strictObject({ world_id: EntityId, source_key: EntityId }),
  reserve_id: EntityId,
  quantity: PositiveQuantitySchema,
  mechanism_id: EntityId,
  basis_id: EntityId,
});
export type CollectInput = z.infer<typeof CollectInputSchema>;

const sameChoice = (a: PcCollectionCommitInput, b: PcCollectionCommitInput): boolean =>
  canonicalEqual({ ...a, act_id: "" }, { ...b, act_id: "" });

/** Presents the retained, confirmed attempt's commitment-of-record and PC-owned request to the unchanged gateway (idempotent by identity). */
async function presentCollection(
  ctx: CommandContext,
  intent: CollectionIntent,
): Promise<CommandResult> {
  const { session } = ctx;
  const campaign = session.campaign;
  const before = campaign.store.head().revision;
  const outcome = await commitConfirmedPcCollection(collectionContext(ctx, intent), {
    operation: PROTOCOL_OP_COMMIT_CONFIRMED_PC_COLLECTION,
  });
  if (outcome.ok) {
    const marked = await session.ledger.markCommitted(intent.intent_id);
    if (!marked.ok) {
      session.markAmbiguous();
      return result(COLLECTION_OUTCOME_UNKNOWN);
    }
    return result(PC_COLLECTION_COMMITTED);
  }
  if (outcome.error.code === COLLECTION_OUTCOME_UNKNOWN) {
    session.markAmbiguous();
    return result(COLLECTION_OUTCOME_UNKNOWN);
  }
  // a refusal: an attempt that left no footprint had no effect and is forgotten; one that did stays for reconciliation
  const footprint = campaign.store.getFact(
    pcCollectionCommitmentKey(intent.pc_id, intent.choice.act_id),
  );
  if (campaign.store.head().revision === before && !footprint) {
    const forgotten = await session.ledger.discard(intent.intent_id);
    if (!forgotten.ok) session.markAmbiguous();
  }
  return result("UNAVAILABLE");
}

/** A FRESH trusted context from the session's campaign and exactly what the operator confirmed (never from host input). */
const collectionContext = (ctx: CommandContext, intent: CollectionIntent) =>
  bindTrustedConfirmedPcCollectionContext({
    campaign: ctx.session.campaign,
    choice: intent.choice,
    mechanism_id: intent.mechanism_id,
    basis_id: intent.basis_id,
    publication: intent.publication,
  });

/**
 * The player's choice to ATTEMPT one direct collection: this is the trusted-side bridge from the operator's own console confirmation
 * to `bindTrustedConfirmedPcCollectionContext`. `input` is intent only (the source, the Reserve, the exact amount, and which of the PC's
 * established mechanism and Production's basis the attempt rests on): it never carries a role, permission, act identity, boundary,
 * duration, verdict or result. The service reads current canon to refuse an attempt whose named antecedents do not exist (an invented
 * action never reaches the console), states the exact attempt, obtains the operator's own fresh confirmation of exactly it, mints the
 * immutable act identity before the first canonical write, retains the confirmed intent durably, and only then binds a fresh trusted
 * context and commits the PC-side commitment-of-record and the PC-owned request. It reads no reach, starts no work and advances no time:
 * those are `collectContinue` (the `role.gm` reading, then Production's own admission) and the separate, second time-passage choice.
 * A retained attempt that has not finished is never replaced: the same input reconciles it by its original identity.
 */
export async function collect(ctx: CommandContext, input: unknown): Promise<CommandResult> {
  const refused = guard(ctx) ?? unreconciledPcTarget(ctx);
  if (refused) return refused;
  const parsed = CollectInputSchema.safeParse(input);
  if (!parsed.success) return result("INVALID_INPUT");
  const { session, terminal } = ctx;
  const campaign = session.campaign;
  const pcId = activePc(campaign);
  if (!pcId) return result("UNAVAILABLE");
  const { mechanism_id: mechanismId, basis_id: basisId, ...rest } = parsed.data;
  const draft = { ...rest, pc_id: pcId, authored_under: { ...PLAYER_CHOICE_AUTHORITY } };

  const open = session.ledger.collections().find((c) => c.status === "CONFIRMED");
  if (open) {
    if (
      open.pc_id === pcId &&
      open.mechanism_id === mechanismId &&
      open.basis_id === basisId &&
      sameChoice(open.choice, { ...draft, act_id: open.choice.act_id })
    )
      return presentCollection(ctx, open);
    return result("CHANGED_CHOICE");
  }

  // current canonical antecedents; none is ever created here. An action naming a source, Reserve or mechanism that canon does not
  // hold is not offered to the player at all.
  const sourceFact = campaign.store.getFact(
    worldSourceConditionKey(draft.source.world_id, draft.source.source_key),
  );
  const reserveFact = campaign.store.getFact(productionReserveKey(draft.reserve_id));
  const adapter = new PcCollectionAdapter(campaign.store);
  const mechanism = adapter.mechanism(pcId, mechanismId);
  // v0.3 F-2: the exact positive is offered only for a cycle the I-002 owner has attested BEFORE the act (never retrofitted after it)
  const attested = adapter.attestation(pcId, mechanismId);
  const source = sourceFact?.value as
    { material_class?: string; locality?: { locus?: { entity_id?: string } } } | undefined;
  if (
    !sourceFact ||
    !reserveFact ||
    !mechanism ||
    !attested ||
    !campaign.pcPhysicalLocusCustody(pcId)
  )
    return result("UNAVAILABLE");

  const ordinal = session.ledger.collections().length + 1;
  const subject = subjectOf({
    verb: "collect",
    campaign_id: session.campaignId,
    pc_id: pcId,
    choice: draft,
    mechanism_id: mechanismId,
    basis_id: basisId,
    ordinal,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "collect", subject, [
    `CONFIRMATION — THE CHARACTER'S COLLECTION ATTEMPT (attempt #${ordinal})`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    ``,
    `THE CHARACTER'S CHOICE (the one thing you are confirming):`,
    `  character: ${pcId}`,
    `  attempt to collect ${draft.quantity.amount} ${draft.quantity.unit} of ${source?.material_class ?? "the material"}`,
    `  from the source ${draft.source.world_id} / ${draft.source.source_key}, into the Reserve ${draft.reserve_id}.`,
    `  (operator/debug: the source lies at ${source?.locality?.locus?.entity_id ?? "an established locus"})`,
    ``,
    `This is willingness to ATTEMPT only. It does not say the material can be reached, that the character is able, how long it takes,`,
    `or that anything is collected: the world's owners decide each of those. Confirming records the attempt; the physical-reach reading`,
    `and Production's admission follow, and nothing moves until you separately choose to let time pass.`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "collect", subject)) return result("UNAVAILABLE");

  const uid = (ctx.newId ?? randomUUID)();
  const retained = await session.ledger.record({
    kind: "COLLECTION",
    intent_id: `operator-intent:${uid}`,
    pc_id: pcId,
    choice: { ...draft, act_id: `operator-act-${uid}` },
    mechanism_id: mechanismId,
    basis_id: basisId,
    publication: {
      cause: `operator-collection-cause:${session.campaignId}:${uid}`,
      basis: OPERATOR_PUBLICATION_BASIS,
      secrecy: OPERATOR_PUBLICATION_SECRECY,
    },
  });
  if (!retained.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentCollection(ctx, retained.value as CollectionIntent);
}

/**
 * Takes the player's ALREADY confirmed attempt through the rest of the owners' own path: the `role.gm` reading of the physical reach
 * (from `ctx.reachHost`, if any is configured and none is judged yet) and Production's start. It accepts no operator input and asks no
 * new question, because it can only act on a retained attempt the operator confirmed; it invents no choice, reading, duration or
 * boundary, and reports a transaction status only. Re-presenting it reconciles by identity.
 */
export async function collectContinue(ctx: CommandContext): Promise<CommandResult> {
  const refused = guard(ctx);
  if (refused) return refused;
  const { session } = ctx;
  const campaign = session.campaign;
  const pcId = activePc(campaign);
  const intent = [...session.ledger.collections()].reverse()[0];
  if (!pcId || !intent) return result("NOTHING_TO_RECONCILE");
  if (intent.pc_id !== pcId) return result("STALE_INTENT");
  // the commitment-of-record and request must be committed first (a CONFIRMED attempt is presented again, by its identity)
  if (intent.status !== "COMMITTED") {
    const presented = await presentCollection(ctx, intent);
    if (presented.status !== PC_COLLECTION_COMMITTED) return presented;
  }
  const context = collectionContext(ctx, intent);
  const adapter = new PcCollectionAdapter(campaign.store);
  if (!adapter.reach(pcId, intent.choice.act_id)) {
    const task = getPcCollectionReachTask(context, {
      operation: PROTOCOL_OP_GET_PC_COLLECTION_REACH_TASK,
    });
    if (!task.ok || !ctx.reachHost) return result("UNAVAILABLE");
    let answer: unknown;
    try {
      answer = await ctx.reachHost(task.value.task);
    } catch {
      return result("UNAVAILABLE");
    }
    if (typeof answer !== "object" || answer === null || Array.isArray(answer))
      return result("UNAVAILABLE");
    const submitted = await submitPcCollectionReach(context, {
      operation: PROTOCOL_OP_SUBMIT_PC_COLLECTION_REACH,
      answer: answer as Record<string, unknown>,
    });
    if (!submitted.ok) {
      if (submitted.error.code === COLLECTION_OUTCOME_UNKNOWN) {
        session.markAmbiguous();
        return result(COLLECTION_OUTCOME_UNKNOWN);
      }
      return result("UNAVAILABLE");
    }
  }
  const started = await startConfirmedPcCollection(context, {
    operation: PROTOCOL_OP_START_CONFIRMED_PC_COLLECTION,
  });
  if (started.ok) return result(PC_COLLECTION_COMMITTED);
  if (started.error.code === COLLECTION_OUTCOME_UNKNOWN) {
    session.markAmbiguous();
    return result(COLLECTION_OUTCOME_UNKNOWN);
  }
  return result("UNAVAILABLE");
}

// -- CPAA-C1 v0.3 F-2: the I-002 semantic attestation of the PC's serial cycle (a referee act, not a player choice) ----------------

const AttestInputSchema = z.strictObject({ mechanism_id: EntityId });

/**
 * Obtains the `role.gm` reading that attests the PC's serial handling cycle from `ctx.attestHost` and has the engine validate it and the
 * I-002 owner's attestation written (`role.archivist`). It is NOT a player choice and asks the operator nothing: it creates no commitment,
 * starts no work and passes no time. Without a reading, or when the reading does not establish exactly one same-form unit in one serial
 * cycle with verbatim grounds, nothing is written and no exact act is offered. Re-presenting it reconciles by identity.
 */
export async function attestCycle(ctx: CommandContext, input: unknown): Promise<CommandResult> {
  const refused = guard(ctx);
  if (refused) return refused;
  const parsed = AttestInputSchema.safeParse(input);
  if (!parsed.success) return result("INVALID_INPUT");
  const { session } = ctx;
  const campaign = session.campaign;
  const pcId = activePc(campaign);
  if (!pcId) return result("UNAVAILABLE");
  const adapter = new PcCollectionAdapter(campaign.store);
  if (adapter.attestation(pcId, parsed.data.mechanism_id)) return result(PC_COLLECTION_COMMITTED);
  const task = adapter.cycleTask(pcId, parsed.data.mechanism_id);
  if (!task || !ctx.attestHost) return result("UNAVAILABLE");
  let answer: unknown;
  try {
    answer = await ctx.attestHost(task);
  } catch {
    return result("UNAVAILABLE");
  }
  if (typeof answer !== "object" || answer === null || Array.isArray(answer))
    return result("UNAVAILABLE");
  const written = await adapter.attestCycle({
    pc_id: pcId,
    mechanism_id: parsed.data.mechanism_id,
    answer,
  });
  if (written.ok) return result(PC_COLLECTION_COMMITTED);
  if (written.error.code === "UNKNOWN_OUTCOME") {
    session.markAmbiguous();
    return result(COLLECTION_OUTCOME_UNKNOWN);
  }
  return result("UNAVAILABLE");
}

// -- D-1 (PROVISIONAL, not adopted): the player's separately confirmed cessation of the same in-flight collection -----------------

/** A FRESH trusted context from the session's campaign and exactly what the operator confirmed (never from host input). */
const cessationContext = (ctx: CommandContext, intent: CollectionCessationIntent) =>
  bindTrustedConfirmedPcCessationContext({
    campaign: ctx.session.campaign,
    choice: intent.choice,
    publication: intent.publication,
  });

/** Presents the retained, confirmed cessation to the unchanged gateway chain (idempotent by identity). */
async function presentCessation(
  ctx: CommandContext,
  intent: CollectionCessationIntent,
): Promise<CommandResult> {
  const { session } = ctx;
  const campaign = session.campaign;
  const before = campaign.store.head().revision;
  const outcome = await ceaseConfirmedPcCollection(cessationContext(ctx, intent), {
    operation: PROTOCOL_OP_CEASE_CONFIRMED_PC_COLLECTION,
  });
  if (outcome.ok) {
    const marked = await session.ledger.markCommitted(intent.intent_id);
    if (!marked.ok) {
      session.markAmbiguous();
      return result(COLLECTION_OUTCOME_UNKNOWN);
    }
    return result(PC_COLLECTION_COMMITTED);
  }
  if (outcome.error.code === COLLECTION_OUTCOME_UNKNOWN) {
    session.markAmbiguous();
    return result(COLLECTION_OUTCOME_UNKNOWN);
  }
  // a refusal: a request that left no footprint had no effect and is forgotten; one that did stays for reconciliation
  const footprint = campaign.store.getFact(
    pcCollectionCessationKey(intent.pc_id, intent.choice.act_id),
  );
  if (campaign.store.head().revision === before && !footprint) {
    const forgotten = await session.ledger.discard(intent.intent_id);
    if (!forgotten.ok) session.markAmbiguous();
  }
  return result("UNAVAILABLE");
}

/**
 * The separately confirmed FINISH of the PC's in-flight collection: let time run to the earned completion of the admitted work and no
 * further. The player states NO horizon — the target is derived from Production's work record for the act that is positively in
 * flight (never from a caller, a default or a hidden boundary) — and it needs its own confirmation, never standing for another. It
 * runs through the same unchanged gateway as every active-PC advance; the world resolves whatever falls due by that time, each owner
 * its own. The result is a transaction status only: not a report that anything was collected, or perceived, or known. If anything
 * independent cannot be crossed, the advance is refused as the gateway refuses it, and the work stays held (the only other way out
 * is the separately confirmed cessation).
 */
export async function collectFinish(ctx: CommandContext): Promise<CommandResult> {
  const guarded = pcTargetGuard(ctx);
  if (typeof guarded !== "string") return guarded;
  const pcId = guarded;
  const { session, terminal } = ctx;
  const campaign = session.campaign;
  const adapter = new PcCollectionAdapter(campaign.store);
  const hold = adapter.hold(pcId);
  if (hold.state !== "IN_FLIGHT") return result("UNAVAILABLE");
  const target = adapter.extraction(pcId, hold.act_id)?.value.timing.boundary.at;
  const state = temporalState(campaign);
  const where = stationedAt(campaign, pcId);
  if (!target || !state || state.continuation !== null || !where) return result("UNAVAILABLE");

  const ordinal = session.ledger.pcTargetChoices().length + 1;
  const subject = subjectOf({
    verb: "collect-finish",
    campaign_id: session.campaignId,
    pc_id: pcId,
    act_id: hold.act_id,
    target,
    ordinal,
  });
  const confirmation = await requestOperatorConfirmation(terminal, "collect-finish", subject, [
    `CONFIRMATION — FINISH THE COLLECTION, ACTIVE CHARACTER (choice #${ordinal})`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    `  character: ${pcId}`,
    `  act:       ${hold.act_id}`,
    `  (operator/debug: canon places the character, stationary, at ${where})`,
    ``,
    `YOUR CHOICE (the one thing you are confirming):`,
    `  let your collection act run to its earned completion — canonical time to exactly ${target.value} ${target.unit}, and no further.`,
    ``,
    `You state no time here: that moment is derived from the work the owners admitted for this very act. The world resolves whatever`,
    `falls due by then, each by its own owner. The result reports a transaction status only; it does not say that anything was`,
    `collected, that anything occurred, or what the character or anyone perceives or knows.`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "collect-finish", subject)) return result("UNAVAILABLE");

  const uid = (ctx.newId ?? randomUUID)();
  const retained = await session.ledger.record({
    kind: "PC_TARGET_ADVANCE",
    intent_id: `operator-intent:${uid}`,
    pc_id: pcId,
    target,
    transaction: pcTargetTransaction("advance", uid),
  });
  if (!retained.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentPcTargetChoice(ctx, retained.value as PcTargetAdvanceIntent);
}

/**
 * The player's choice to CEASE the in-flight collection of the active PC (BLUE clause D-1, PROVISIONAL and NOT adopted): the
 * trusted-side bridge from the operator's own, SEPARATE console confirmation to `bindTrustedConfirmedPcCessationContext`. It accepts no
 * operator input at all, because the one thing it can mean is "stop the collection the player already started": the PC and the act come
 * from the retained, confirmed collection attempt and canon. An action that canon does not hold in flight (no started collection, a
 * closed one, one already stopping) is not offered to the player and the console is never reached. It states the exact choice,
 * obtains the operator's own fresh confirmation of exactly it (a confirmation of the start is not one), retains the confirmed intent
 * durably, and only then binds a fresh trusted context and runs the cessation chain. It authors no result, credit or boundary and
 * advances no time. A retained cessation that has not finished is never asked about again: it reconciles by its original identity.
 */
export async function cease(ctx: CommandContext): Promise<CommandResult> {
  const refused = guard(ctx) ?? unreconciledPcTarget(ctx);
  if (refused) return refused;
  const { session, terminal } = ctx;
  const campaign = session.campaign;
  const pcId = activePc(campaign);
  const collection = [...session.ledger.collections()].reverse()[0];
  if (!pcId || !collection) return result("NOTHING_TO_RECONCILE");
  if (collection.pc_id !== pcId) return result("STALE_INTENT");
  const actId = collection.choice.act_id;

  const retained = session.ledger.cessations().find((c) => c.choice.act_id === actId);
  if (retained)
    return retained.status === "COMMITTED"
      ? result(PC_COLLECTION_COMMITTED)
      : presentCessation(ctx, retained);

  // current canon only: the cessation is offered only for this PC's collection that is positively in flight
  const adapter = new PcCollectionAdapter(campaign.store);
  const hold = adapter.hold(pcId);
  if (
    (hold.state !== "IN_FLIGHT" && hold.state !== "INVALIDATED") ||
    hold.act_id !== actId ||
    adapter.closed(pcId, actId)
  )
    return result("UNAVAILABLE");

  const ordinal = session.ledger.cessations().length + 1;
  const subject = subjectOf({
    verb: "cease",
    campaign_id: session.campaignId,
    pc_id: pcId,
    act_id: actId,
    ordinal,
  });
  const quantity = adapter.commitment(pcId, actId)?.value.intent.quantity;
  const confirmation = await requestOperatorConfirmation(terminal, "cease", subject, [
    `CONFIRMATION — THE CHARACTER STOPS THE COLLECTION (stop #${ordinal})`,
    OOC_BANNER,
    `  campaign:  ${session.campaignId}`,
    `  operator:  ${session.operator.username} (uid ${session.operator.uid})`,
    ``,
    `THE CHARACTER'S CHOICE (the one thing you are confirming):`,
    `  character: ${pcId}`,
    `  stop the collection of ${quantity?.amount ?? "the"} ${quantity?.unit ?? "units"} that is under way (act ${actId}).`,
    ``,
    `This is a NEW choice to stop, separate from the choice to begin. It does not say the work never happened and it awards nothing:`,
    `under the present rules nothing is gathered before the work's own completion, so the source and the Reserve stay as they are. The`,
    `world's owners decide the outcome; the character is free again only once they have all recorded it. It is refused, and nothing is`,
    `written, if an earlier event is still unresolved. (PROVISIONAL: this stop is a candidate rule that has not been adopted.)`,
    OOC_DEBUG_NOTE,
  ]);
  if (!confirmation) return result("DECLINED");
  if (!consumeConfirmation(confirmation, "cease", subject)) return result("UNAVAILABLE");

  const uid = (ctx.newId ?? randomUUID)();
  const recorded = await session.ledger.record({
    kind: "COLLECTION_CESSATION",
    intent_id: `operator-intent:${uid}`,
    pc_id: pcId,
    choice: { pc_id: pcId, act_id: actId, authored_under: { ...PLAYER_CHOICE_AUTHORITY } },
    publication: {
      cause: `operator-cessation-cause:${session.campaignId}:${uid}`,
      basis: OPERATOR_PUBLICATION_BASIS,
      secrecy: OPERATOR_PUBLICATION_SECRECY,
    },
  });
  if (!recorded.ok) {
    session.markAmbiguous();
    return result("UNAVAILABLE");
  }
  return presentCessation(ctx, recorded.value as CollectionCessationIntent);
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
    } else if (intent.kind === "PC_TARGET_ADVANCE" || intent.kind === "PC_TARGET_RESUME") {
      // an active-PC target choice is only ever presented for the very character it was confirmed for
      if (!pcId || intent.pc_id !== pcId) {
        results.push(result("STALE_INTENT"));
        break;
      }
      outcome = await presentPcTargetChoice(ctx, intent);
    } else if (intent.kind === "COLLECTION") {
      if (!pcId || intent.pc_id !== pcId) {
        results.push(result("STALE_INTENT"));
        break;
      }
      outcome = await presentCollection(ctx, intent);
    } else if (intent.kind === "COLLECTION_CESSATION") {
      if (!pcId || intent.pc_id !== pcId) {
        results.push(result("STALE_INTENT"));
        break;
      }
      outcome = await presentCessation(ctx, intent);
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
      outcome.status !== NULL_PC_OOC_HELD_ADVANCE_COMMITTED &&
      outcome.status !== PC_TARGET_ADVANCE_COMMITTED &&
      outcome.status !== PC_COLLECTION_COMMITTED
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
  /** the ACTIVE-PC target-only choices, in the order confirmed (retained status only; never a world report) */
  readonly pc_target_choices: readonly {
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
    pc_target_choices: session.ledger.pcTargetChoices().map((c) => ({
      kind: c.kind === "PC_TARGET_ADVANCE" ? "ADVANCE" : "RESUME",
      status: c.status,
    })),
  };
}
