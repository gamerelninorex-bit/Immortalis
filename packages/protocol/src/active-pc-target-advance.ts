import {
  AdvanceActivePcToTargetRequestSchema,
  CanonicalTimeSchema,
  EntityId,
  PC_TARGET_ADVANCE_COMMITTED,
  PC_TARGET_ADVANCE_OUTCOME_UNKNOWN,
  PC_TARGET_ADVANCE_OUTCOME_UNKNOWN_MESSAGE,
  PC_TARGET_ADVANCE_UNAVAILABLE,
  PC_TARGET_ADVANCE_UNAVAILABLE_MESSAGE,
  ResolutionRequestSchema,
  fail,
  logisticsBoundaryId,
  logisticsObjectId,
  logisticsProcessId,
  ok,
  pcMovementRequestId,
  type CanonicalTime,
  type PcTargetAdvanceReceipt,
  type ResolutionRequest,
  type ResolutionTransaction,
  type Result,
} from "@immortalis/contracts";
import {
  LogisticsAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  canonicalEqual,
  economyRealizationProvider,
  epistemicPacketProvider,
  gipSunsetExpiryProvider,
  ktiTransferResultCloseProvider,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  namedActorCapabilityCloseProvider,
  pcCapabilityCloseProvider,
  populationBarrierEvaluator,
  populationStageProvider,
  productionCompletionProvider,
  productionReserveInflowProvider,
  productionSourceDeltaProvider,
  worldSourceDeliveryProvider,
  worldEntityTransitionProvider,
  worldFallbackAcceptanceProvider,
  type CanonicalCampaign,
} from "@immortalis/engine";

/**
 * IM-15 Host Protocol Gateway — the ONE allowlisted, mutating, SEPARATELY player-authorized ACTIVE-PC target-only temporal advance
 * for a campaign whose one active Player Character is stationary (Runtime Contract IM-15 / IM-16, RC-05 / RC-15 / RC-16; F-014B
 * Turnless Temporal §§2-4, 6, 9-11, 13, 15, 17-20; I-001 §§2-4, 8, 14, 17, 20; Canonical Role Registry v1 `role.player` +
 * `permission.player_choice.commit`; WS-007 GIP §§2, 4.1, 4.3, 21.2, 22, 24.2; F-017; F-014D / NPK).
 *
 * This is the technical operator/protocol ingress for temporal progression of a campaign WITH an active PC toward one explicit
 * canonical target. It is neither a natural-language wait, an in-world waiting action, an action-cost or duration determination,
 * a general continuation framework nor a source of PC omniscience. The NULL-PC OOC gateways (`advanceNullPcOocToTarget`,
 * `resumeNullPcOocHeldAdvance`) rest on the W3-CP3 No-Active-PC overlay, which does NOT authorize bypassing an active PC's
 * actionable-knowledge interruption; this module borrows nothing from it and is inert for a campaign without the bound active PC.
 *
 * Authority is never host input, and neither is time. It comes from a TRUSTED CONTEXT that server-side code establishes only AFTER
 * the player has made a genuine, separate progression choice — an explicit target in the campaign's canonical unit, confirmed
 * apart from every earlier choice — by that code's own means (authentication, sessions and the choice interaction itself are out
 * of scope and are neither modelled nor claimed). The context binds, in a module-private registry behind an opaque frozen handle:
 * the one campaign; the one active PC; the one explicit, player-chosen target (an existing `CanonicalTimeSchema` value, never
 * parsed from a date or computed from a duration); for the held-remainder binder only, the held lineage the player chose to
 * continue; and the durable transaction identity with its authored provenance — the transaction id, cause, trigger, the active
 * role/permission context (stated by the trusted side, never defaulted here) and the publication labels. A value a host
 * fabricated, parsed or copied is not a context and is refused. There is no `confirmed` flag, role claim or LLM wording that can
 * stand for the choice, and no earlier confirmation stands for a later one.
 *
 * The host-visible request is strict and carries only the operation name. Nothing the host sends can select the campaign, PC,
 * target, held transaction, continuation, transaction identity, authority, provider or provenance.
 *
 * Before it reads or writes anything else, a fresh (non-replay) invocation re-proves from committed owner state that the PC is the
 * operative `role.player_character` binding and is STATIONARY with nothing of its own in flight: its physical-locus custody names a
 * World-State locus; and either it has no movement at all (no movement commitment-of-record, no PC-owned request, no Logistics
 * commitment or transfer, no registered transfer object) or its one single-leg movement is fully settled (the Logistics transfer
 * retired, the destination committed by World-State, the transfer object holding no pending boundary). A PC in transfer, a
 * willingness or request or Logistics commitment not yet resolved, a destination commit awaiting retirement, or any state this
 * check cannot positively recognise is the one refusal. Stationary custody alone is not read as making every in-world activity
 * freely interruptible: the only Temporal objects the kernel can engage declare `creates_epistemic_interruption: false`, no PC
 * actionable-knowledge interruption evaluator exists in this engine, and where this module cannot establish that no indispensable
 * PC-actionable interruption or engagement is being bypassed it refuses instead of weakening F-014B §10. It then builds the one
 * existing `ResolutionRequestSchema` request — `requested: { target, condition: null }` — and drives it through the EXISTING
 * `TemporalCoordinator.advance` over the real owner stage providers the engine already ships (including GIP's own sunset expiry),
 * so the kernel alone selects what is due, resolves each declared dependency closure in its own order and records the one
 * transaction. It invents no time, calendar, unit, duration, horizon, world process or verdict; a caller-supplied `expired`, due
 * flag or artificial source does not exist as an input. A provider that is not registered, an unresolved dependency or a required
 * source that is absent stops the transaction truthfully under the kernel (`DEPENDENCY_UNRESOLVED` with a held continuation), and a
 * committed-but-unregistered GIP sunset refuses the whole request (`ENROLLMENT_PENDING`) before anything is opened. When the target
 * is valid and no registered material boundary is due by it, the unchanged request goes to the kernel, which performs F-014B §6's
 * exact lazy carry with no owner effect; the presence or absence of due work is never a host-visible difference.
 *
 * Two binders, one operation. The INITIAL binder carries `continues: null` and refuses while the Temporal state holds a
 * continuation (the kernel's own `CONTINUATION_HELD` guard stays the final authority). The HELD binder carries the lineage the
 * player chose to continue and the NEW choice's identity; it proceeds only when the state still holds exactly that remainder and
 * the sealed lineage — the held transaction and every transaction it continued, back to its initial one — stopped
 * `DEPENDENCY_UNRESOLVED` having requested exactly the bound target and no condition, with the player-choice context. A different
 * request type (a stop condition, such as the PC stop-at-delivery advance), a different target, or a missing transaction is refused.
 * `continues` is then the held `from_transaction` and `requested` is the held transaction's recorded request verbatim. Nothing is
 * cancelled, abandoned, superseded, resumed automatically or advanced silently.
 *
 * Retry is by identity (RC-16): the transaction identity is the trusted side's, stable across retries and reopen. A transaction
 * that already committed is replayed by the kernel against the same literal request and writes nothing (the PC must still be the
 * bound active PC; its present locus is not re-judged, because a replay changes nothing); committed stages are adopted, never
 * recomputed; the same identity presented with a different intent or provenance is the kernel's conflict and is refused, and an
 * identity replays only as the branch its binder carries. The only things returned are one of three minimum statuses; every
 * refusal is the same refusal, so no time, stop reason, key, revision, event, recipient or hidden-state existence can be
 * distinguished. A committed status means the temporal transaction committed, nothing more: it grants no PC Glance,
 * Narrative-Kernel report, observer privilege, event discovery, placement, knowledge of any owner result or later PC memory.
 * Transport- and provider-neutral: a plain function over values.
 */

/** The opaque handle for one trusted, separately player-authorized active-PC target advance context. It carries and reveals nothing. */
export interface TrustedActivePcTargetAdvanceContext {
  readonly __trusted_active_pc_target_advance_context: never;
}

/** What the advance needs of the campaign: the operative binding, the PC's custody, locus and movement records, and the store. */
type ActivePcCampaign = Pick<
  CanonicalCampaign,
  | "binding"
  | "pcCurrentLocus"
  | "pcMovementCommitment"
  | "pcMovementRequest"
  | "pcPhysicalLocusCustody"
  | "store"
>;

/** The trusted side's authored transaction identity and provenance: exactly the existing request fields it alone may state. */
const AdvanceTransactionSchema = ResolutionRequestSchema.pick({
  transaction_id: true,
  cause: true,
  trigger: true,
  context: true,
  publication: true,
});

type TrustedTransaction = Pick<
  ResolutionRequest,
  "transaction_id" | "cause" | "trigger" | "context" | "publication"
>;

interface ActivePcTargetBinding {
  readonly campaign: ActivePcCampaign;
  readonly pc_id: string;
  readonly target: CanonicalTime;
  /** the held transaction this choice continues; `null` for the initial branch */
  readonly held_transaction: string | null;
  readonly transaction: TrustedTransaction;
}

const bindings = new WeakMap<object, ActivePcTargetBinding>();

/** The identities the PC's relocation derives: they name the movement, not a progression instruction. */
const isMovementIdentity = (id: string, pcId: string): boolean => {
  const requestId = pcMovementRequestId(pcId);
  return (
    id === requestId ||
    id === logisticsObjectId(requestId) ||
    id === logisticsProcessId(requestId) ||
    id === logisticsBoundaryId(requestId) ||
    (id.startsWith("pc-relocation-") && id.endsWith(`:${pcId}`))
  );
};

function bind(
  trusted: {
    readonly campaign: ActivePcCampaign;
    readonly pc_id: string;
    readonly transaction: TrustedTransaction;
  },
  target: unknown,
  heldTransaction: unknown | null,
): TrustedActivePcTargetAdvanceContext {
  const handle = Object.freeze({}) as TrustedActivePcTargetAdvanceContext;
  const pc = EntityId.safeParse(trusted.pc_id);
  const time = CanonicalTimeSchema.safeParse(target);
  const stated = AdvanceTransactionSchema.safeParse(trusted.transaction);
  const heldId = heldTransaction === null ? null : EntityId.safeParse(heldTransaction);
  if (!pc.success || !time.success || !stated.success || (heldId !== null && !heldId.success))
    return handle;
  const a = stated.data;
  if ([a.transaction_id, a.cause, a.trigger.ref].some((id) => isMovementIdentity(id, pc.data)))
    return handle;
  // the new choice is never the held one: the earlier confirmation does not stand for this one
  if (heldId !== null && heldId.success && a.transaction_id === heldId.data) return handle;
  const { campaign } = trusted;
  bindings.set(handle, {
    campaign: Object.freeze({
      binding: () => campaign.binding(),
      pcCurrentLocus: (pcId: string) => campaign.pcCurrentLocus(pcId),
      pcMovementCommitment: (pcId: string) => campaign.pcMovementCommitment(pcId),
      pcMovementRequest: (pcId: string) => campaign.pcMovementRequest(pcId),
      pcPhysicalLocusCustody: (pcId: string) => campaign.pcPhysicalLocusCustody(pcId),
      get store() {
        return campaign.store;
      },
    }),
    pc_id: pc.data,
    target: time.data,
    held_transaction: heldId !== null && heldId.success ? heldId.data : null,
    transaction: a,
  });
  return handle;
}

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Call it only after the player has made a genuine, separate choice to
 * advance a campaign with this active, stationary PC to the exact canonical `target`: the call is the trusted side's attestation
 * of it, and `transaction` is that choice's durable identity and authored provenance, both retained by the caller across retries
 * and reopen. Nothing here verifies a human, a session or an identity. The Temporal kernel and the owners still re-judge every
 * fact on every invocation; trusted context is not canonical authority.
 *
 * An incomplete or schema-invalid binding (a target that is not a `CanonicalTimeSchema` value, a transaction not stated under
 * exactly `role.player` + `permission.player_choice.commit`, malformed identity or publication material, or an identity that is the
 * PC movement's own) yields an inert handle that the operation refuses without a read.
 */
export function bindTrustedActivePcTargetAdvanceContext(trusted: {
  readonly campaign: ActivePcCampaign;
  readonly pc_id: string;
  readonly target: CanonicalTime;
  readonly transaction: TrustedTransaction;
}): TrustedActivePcTargetAdvanceContext {
  return bind(trusted, trusted.target, null);
}

/**
 * TRUSTED-SIDE ONLY. Call it only after the player has made a NEW, genuine choice to continue the held work of an earlier active-PC
 * target advance: `held.from_transaction` is the held transaction the player chose to continue and `held.target` the canonical
 * target that player originally authorized for it; `transaction` is the NEW choice's durable identity and authored provenance. The
 * held lineage is exactly those two values; any other field, a malformed value, or a new identity that is the held transaction
 * itself yields an inert handle (as for the initial binder).
 */
export function bindTrustedActivePcHeldTargetAdvanceContext(trusted: {
  readonly campaign: ActivePcCampaign;
  readonly pc_id: string;
  readonly held: { readonly from_transaction: string; readonly target: CanonicalTime };
  readonly transaction: TrustedTransaction;
}): TrustedActivePcTargetAdvanceContext {
  const lineage: object | null | undefined = trusted.held;
  const exact =
    typeof lineage === "object" &&
    lineage !== null &&
    Object.keys(lineage).sort().join() === "from_transaction,target";
  return bind(
    trusted,
    exact ? trusted.held.target : undefined,
    exact ? trusted.held.from_transaction : undefined,
  );
}

export type AdvanceActivePcToTargetResult = Result<
  PcTargetAdvanceReceipt,
  typeof PC_TARGET_ADVANCE_UNAVAILABLE | typeof PC_TARGET_ADVANCE_OUTCOME_UNKNOWN
>;

const refusal = (): AdvanceActivePcToTargetResult =>
  fail(PC_TARGET_ADVANCE_UNAVAILABLE, PC_TARGET_ADVANCE_UNAVAILABLE_MESSAGE);
const unknownOutcome = (): AdvanceActivePcToTargetResult =>
  fail(PC_TARGET_ADVANCE_OUTCOME_UNKNOWN, PC_TARGET_ADVANCE_OUTCOME_UNKNOWN_MESSAGE);

/** Codes after which a commit may have happened without a reply: never "safely absent". */
const AMBIGUOUS = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);

/**
 * The owner stage providers the engine already ships, registered as they are (the real owners, no fixture), identically to the
 * NULL-PC gateways so the same world is judged by the same owners whoever asked for the time. A stage whose provider is not in
 * this set stops the transaction under the kernel; nothing here adds, replaces or wraps one.
 */
const ownerProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionCompletionProvider,
    productionSourceDeltaProvider,
    worldSourceDeliveryProvider,
    productionReserveInflowProvider,
    worldFallbackAcceptanceProvider,
    economyRealizationProvider,
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
    populationStageProvider,
    epistemicPacketProvider,
    ktiTransferResultCloseProvider,
    namedActorCapabilityCloseProvider,
    pcCapabilityCloseProvider,
    gipSunsetExpiryProvider,
  ]);

/** The bound PC is the campaign's operative `role.player_character`, read fresh. */
const isActivePc = (campaign: ActivePcCampaign, pcId: string): boolean =>
  campaign.binding()?.value.active_pc.entity_id === pcId;

/**
 * Whether the PC is the operative one AND stationary with nothing of its own in flight, positively established from committed owner
 * state by identity (no scan). `false` for every other state, including every one this check does not recognise.
 */
function isStationaryActivePc(
  campaign: ActivePcCampaign,
  coordinator: TemporalCoordinator,
  pcId: string,
): boolean {
  if (!isActivePc(campaign, pcId)) return false;
  // the PC's one stationary physical-locus custody names its world; the present locus must be a stationary one (World-State's)
  const custody = campaign.pcPhysicalLocusCustody(pcId);
  const locus = campaign.pcCurrentLocus(pcId);
  if (!custody || !locus || locus.stationary === null) return false;
  const worldId = custody.value.stationary_locus.world.entity_id;
  const logistics = new LogisticsAdapter(campaign.store);
  const commitment = logistics.commitment(worldId, pcId);
  const transfer = logistics.transfer(worldId, pcId);
  const willingness = campaign.pcMovementCommitment(pcId);
  const request = campaign.pcMovementRequest(pcId);
  // the PC's own transfer object may hold no pending earned boundary, and the active index may name none of it
  const objectId = logisticsObjectId(pcMovementRequestId(pcId));
  const object = coordinator.object(objectId)?.value;
  if (object?.next_boundary) return false;
  if (coordinator.boundaryIndex().entries.some((e) => e.object_id === objectId)) return false;
  switch (locus.phase) {
    case "STATIONARY_AT_ORIGIN":
      // no movement of any kind has been started: no willingness, request, Logistics commitment, transfer or registered object
      return !willingness && !request && !commitment && !transfer && !object;
    case "DESTINATION_COMMITTED":
      // the one single-leg movement is fully settled: destination committed by World-State and the transfer retired
      return (
        willingness !== undefined &&
        request !== undefined &&
        commitment !== undefined &&
        commitment.value.moved.entity_id === pcId &&
        transfer?.value.state.status === "RETIRED"
      );
    default:
      // in transfer, or a destination commit still awaiting retirement: the PC's own movement is engaged
      return false;
  }
}

/**
 * The request the held transaction left unfinished, read from the sealed record, or `undefined` when the held lineage is not
 * exactly the one the player authorized: the held transaction and every transaction it continued, back to its initial one,
 * are committed under their own identity, requested exactly the bound target and no condition (target-only, so the PC
 * stop-at-delivery or any other predicate is not this lineage), and stopped `DEPENDENCY_UNRESOLVED` with unfinished dependents.
 * Each carries the player-choice context by the kernel's own schema. The walk follows only the committed `continues` chain of
 * this one held piece of work and ends at its initial record; it reads nothing else.
 */
function heldRequest(
  coordinator: TemporalCoordinator,
  heldId: string,
  target: CanonicalTime,
): ResolutionRequest["requested"] | undefined {
  const seen = new Set<string>();
  let requested: ResolutionRequest["requested"] | undefined;
  let id: string | null = heldId;
  while (id !== null) {
    if (seen.has(id)) return undefined;
    seen.add(id);
    const tx: ResolutionTransaction | undefined = coordinator.transaction(id)?.value;
    if (
      !tx ||
      tx.transaction_id !== id ||
      tx.requested.condition !== null ||
      tx.requested.target === null ||
      !canonicalEqual(tx.requested.target, target) ||
      tx.outcome.stop_reason !== "DEPENDENCY_UNRESOLVED" ||
      tx.outcome.unresolved_dependents.length === 0
    )
      return undefined;
    requested ??= tx.requested;
    id = tx.continues;
  }
  return requested;
}

/**
 * The one host operation. `context` is the trusted, separately player-authorized binding; `request` is the untrusted host input.
 */
export async function advanceActivePcToTarget(
  context: TrustedActivePcTargetAdvanceContext,
  request: unknown,
): Promise<AdvanceActivePcToTargetResult> {
  let before: number | undefined;
  let store: ActivePcCampaign["store"] | undefined;
  try {
    const bound = bindings.get(context);
    const parsed = AdvanceActivePcToTargetRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const { campaign, pc_id: pcId, target, held_transaction: heldId, transaction } = bound;
    store = campaign.store;
    before = store.head().revision;
    // the operation exists only for the bound, operative active PC: anything else is inert before any other fact is read
    if (!isActivePc(campaign, pcId)) return refusal();
    const coordinator = new TemporalCoordinator(
      store,
      ownerProviders(),
      populationBarrierEvaluator,
    );
    const existing = coordinator.transaction(transaction.transaction_id)?.value;
    if (existing) {
      // a transaction that already committed under this identity replays only itself, and only as the branch this context carries
      // (the kernel's own identity compare refuses any differing target, cause, trigger, context or publication as a conflict);
      // a replay writes nothing, so only the operative PC is re-proved, not its present locus
      if (existing.continues !== heldId) return refusal();
    } else {
      // a fresh advance exists only for the stationary PC: anything else is inert, before time is touched
      if (!isStationaryActivePc(campaign, coordinator, pcId)) return refusal();
      const held = coordinator.state()?.value.continuation ?? null;
      // an initial choice never meets a held remainder; a resume meets exactly the remainder the player chose, no other
      if (heldId === null ? held !== null : held?.from_transaction !== heldId) return refusal();
    }
    let requested: ResolutionRequest["requested"] = { target, condition: null };
    if (heldId !== null) {
      const carried = heldRequest(coordinator, heldId, target);
      if (carried === undefined) return refusal();
      requested = carried;
    }
    const advanced = await coordinator.advance({
      ...transaction,
      continues: heldId,
      requested,
    } satisfies ResolutionRequest);
    if (advanced.ok) return ok({ status: PC_TARGET_ADVANCE_COMMITTED });
    // anything short of success is "unavailable" only if nothing at all was committed; otherwise only reconciliation can say
    return AMBIGUOUS.has(advanced.error.code) || store.head().revision !== before
      ? unknownOutcome()
      : refusal();
  } catch {
    try {
      return before !== undefined && store !== undefined && store.head().revision !== before
        ? unknownOutcome()
        : refusal();
    } catch {
      return before !== undefined ? unknownOutcome() : refusal();
    }
  }
}
