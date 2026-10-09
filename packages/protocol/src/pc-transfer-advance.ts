import {
  AdvanceConfirmedPcTransferRequestSchema,
  EntityId,
  OWNER_LOGISTICS,
  PC_TRANSFER_ADVANCE_COMMITTED,
  PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN,
  PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN_MESSAGE,
  PC_TRANSFER_ADVANCE_UNAVAILABLE,
  PC_TRANSFER_ADVANCE_UNAVAILABLE_MESSAGE,
  ResolutionRequestSchema,
  fail,
  logisticsBoundaryId,
  logisticsObjectId,
  logisticsProcessId,
  ok,
  pcMovementRequestId,
  pcMovementRequestKey,
  type PcTransferAdvanceReceipt,
  type ResolutionRequest,
  type ResolutionTransaction,
  type Result,
} from "@immortalis/contracts";
import {
  LogisticsAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  canonicalEqual,
  gipSunsetExpiryProvider,
  logisticsDeliveryProvider,
  logisticsRetirementProvider,
  logisticsTemporalObject,
  worldEntityTransitionProvider,
  type CanonicalCampaign,
} from "@immortalis/engine";

/**
 * IM-15 Host Protocol Gateway — the ONE allowlisted, mutating, SEPARATELY player-authorized stop-at-delivery temporal advance of
 * the active PC's one in-transfer movement (Runtime Contract IM-15 / IM-16, RC-05 / RC-15 / RC-16; F-014B Turnless Temporal;
 * WS-010 Logistics; Canonical Role Registry v1 `role.player` + `permission.player_choice.commit`; the frozen Active-PC
 * Post-Handover Physical Locus Ownership & Relocation Contract §§4-15 — a contract that is not a spec-lock pin).
 *
 * Authority is never host input, and neither is time. It comes from a TRUSTED CONTEXT that server-side code establishes only AFTER
 * the player has made a progression choice that is DISTINCT from the earlier choice to start the movement, by that code's own
 * means (authentication, sessions and the confirmation interaction itself are out of scope and are neither modelled nor claimed).
 * The context binds, in a module-private registry behind an opaque frozen handle: the one campaign, the one operative PC, and the
 * durable transaction identity with its authored provenance — the transaction id, cause, trigger, the active role/permission
 * context (stated by the trusted side, never defaulted here) and the publication labels. A value a host fabricated, parsed or
 * copied is not a context and is refused. There is no `confirmed` flag, role claim or LLM wording that can stand for the choice. The
 * relocation's own identities are not a progression instruction: a transaction identity that is the movement's identity is refused.
 *
 * The host-visible request is strict and carries only the operation name. Nothing the host sends can select the campaign, PC,
 * route, destination, clock, target, boundary, condition, role, permission, confirmation, transaction identity, source or
 * provenance.
 *
 * The operation freshly re-reads the committed owner state — the operative PC binding, the PC's physical-locus custody, the
 * Logistics commitment and transfer, and the Temporal kernel's registered object, its earned boundary and the active boundary
 * index — and only then builds the one existing `ResolutionRequestSchema` request: no target (condition only) and the existing
 * `STOP_AFTER_BOUNDARY` condition for the PC's committed Logistics object and its one registered boundary, taken from that object.
 * With no held continuation the request is initial (`continues` null). When a truthful committed `DEPENDENCY_UNRESOLVED`
 * transaction of exactly this PC delivery holds the journey, the NEW player-authorized transaction this context carries consumes
 * it: `continues` is the held `from_transaction` and `requested` is the prior request verbatim (never a target, never a new
 * condition); any other held continuation (target-based, another object, no unresolved dependents) is refused. Provenance
 * (`cause`, `trigger`) is the trusted side's to state: it is never compared with the held transaction's, so a distinct choice may
 * lawfully share a trigger reference with the previous one; only the distinct, immutable `transaction_id` identifies the choice. The host cannot tell the two cases apart.
 *
 * It drives it through the EXISTING `TemporalCoordinator.advance` over the real Logistics, World-State and GIP sunset-expiry stage
 * providers, so the kernel alone selects what is due (every earlier or independent due world process included), resolves the
 * dependency closure in its own order — Logistics delivery, World-State destination custody, Logistics retirement — and records
 * the one transaction. It invents no time, route, duration, target, willingness or arrival, skips nothing, suppresses nothing and
 * repairs nothing; a held continuation is neither cancelled nor overwritten, and only ever consumed whole by the kernel's own
 * continuation admission (IM-11 stays the final authority). A dependency that still cannot be resolved commits another truthful
 * `DEPENDENCY_UNRESOLVED` transaction with one new held remainder; nothing here loops, retries or creates a player choice.
 *
 * Retry is by identity (RC-16): the transaction identity is the trusted side's, stable across retries and reopen. A transaction
 * that already committed is replayed by the kernel against the same literal request (its `continues` read back from the
 * committed record and verified to be the PC delivery continuation) and writes nothing; committed stages are
 * adopted, never recomputed. The only things returned are one of three minimum statuses; every refusal is the same refusal, so no
 * cause, owner, state, stop reason or hidden-state existence can be distinguished. A committed status means the temporal
 * transaction committed, nothing more. Transport- and provider-neutral: a plain function over values.
 */

/** The opaque handle for one trusted, separately player-authorized advance context. It carries and reveals nothing. */
export interface TrustedConfirmedPcTransferAdvanceContext {
  readonly __trusted_confirmed_pc_transfer_advance_context: never;
}

/** What the advance needs of the campaign: the operative binding, the PC's custody and locus resolver, and the store. */
type AdvanceCampaign = Pick<
  CanonicalCampaign,
  "binding" | "pcCurrentLocus" | "pcPhysicalLocusCustody" | "store"
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

interface AdvanceBinding {
  readonly campaign: AdvanceCampaign;
  readonly pc_id: string;
  readonly transaction: TrustedTransaction;
}

const bindings = new WeakMap<object, AdvanceBinding>();

/** The identities the earlier relocation derives for this PC: they name the movement, not a new progression instruction. */
const isRelocationIdentity = (id: string, pcId: string): boolean => {
  const requestId = pcMovementRequestId(pcId);
  return (
    id === requestId ||
    id === logisticsObjectId(requestId) ||
    id === logisticsProcessId(requestId) ||
    id === logisticsBoundaryId(requestId) ||
    (id.startsWith("pc-relocation-") && id.endsWith(`:${pcId}`))
  );
};

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Call it only after the player has made a progression choice that is
 * distinct from the choice that started the movement: the call is the trusted side's attestation of it, and `transaction` is that
 * choice's durable identity and authored provenance, retained by the caller across retries and reopen. Nothing here verifies a
 * human, a session or an identity. The Temporal kernel and the owners still re-judge every fact on every invocation; trusted
 * context is not canonical authority.
 *
 * An incomplete or schema-invalid binding (a transaction not stated under exactly `role.player` + `permission.player_choice.commit`,
 * malformed identity or publication material, or an identity that is the movement's own) yields an inert handle that the operation
 * refuses without a read.
 */
export function bindTrustedConfirmedPcTransferAdvanceContext(trusted: {
  readonly campaign: AdvanceCampaign;
  readonly pc_id: string;
  readonly transaction: TrustedTransaction;
}): TrustedConfirmedPcTransferAdvanceContext {
  const handle = Object.freeze({}) as TrustedConfirmedPcTransferAdvanceContext;
  const pc = EntityId.safeParse(trusted.pc_id);
  const stated = AdvanceTransactionSchema.safeParse(trusted.transaction);
  if (!pc.success || !stated.success) return handle;
  const a = stated.data;
  if ([a.transaction_id, a.cause, a.trigger.ref].some((id) => isRelocationIdentity(id, pc.data)))
    return handle;
  const { campaign } = trusted;
  bindings.set(handle, {
    campaign: Object.freeze({
      binding: () => campaign.binding(),
      pcCurrentLocus: (pcId: string) => campaign.pcCurrentLocus(pcId),
      pcPhysicalLocusCustody: (pcId: string) => campaign.pcPhysicalLocusCustody(pcId),
      get store() {
        return campaign.store;
      },
    }),
    pc_id: pc.data,
    transaction: a,
  });
  return handle;
}

export type AdvanceConfirmedPcTransferResult = Result<
  PcTransferAdvanceReceipt,
  typeof PC_TRANSFER_ADVANCE_UNAVAILABLE | typeof PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN
>;

const refusal = (): AdvanceConfirmedPcTransferResult =>
  fail(PC_TRANSFER_ADVANCE_UNAVAILABLE, PC_TRANSFER_ADVANCE_UNAVAILABLE_MESSAGE);
const unknownOutcome = (): AdvanceConfirmedPcTransferResult =>
  fail(PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN, PC_TRANSFER_ADVANCE_OUTCOME_UNKNOWN_MESSAGE);

/** Codes after which a commit may have happened without a reply: never "safely absent". */
const AMBIGUOUS = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);

/**
 * The stop the PC's committed state earns, read fresh from canonical state and never from a host claim, or `undefined` when
 * the state does not hold exactly the one correct in-transfer movement with its one registered, still-pending delivery boundary.
 * Every stage of the chain (delivery, destination custody, retirement) leaves that boundary pending until the transaction
 * commits, so a re-presented request after a partial commit still finds it; a boundary already resolved is not found.
 */
function earnedStop(
  campaign: AdvanceCampaign,
  coordinator: TemporalCoordinator,
  pcId: string,
): { readonly object_id: string; readonly boundary_id: string } | undefined {
  // the operative PC, at the committed binding, is this PC
  if (campaign.binding()?.value.active_pc.entity_id !== pcId) return undefined;
  // the PC's one physical-locus custody names its world; a PC with no movement yet is still stationary at its origin
  const custody = campaign.pcPhysicalLocusCustody(pcId);
  const locus = campaign.pcCurrentLocus(pcId);
  if (!custody || !locus || locus.phase === "STATIONARY_AT_ORIGIN") return undefined;
  const worldId = custody.value.stationary_locus.world.entity_id;
  const logistics = new LogisticsAdapter(campaign.store);
  const commitment = logistics.commitment(worldId, pcId)?.value;
  const transfer = logistics.transfer(worldId, pcId)?.value;
  if (!commitment || !transfer) return undefined;
  // the commitment is the PC's own single leg, through the PC-owned Movement Service Request
  const requestId = pcMovementRequestId(pcId);
  if (
    commitment.moved.entity_id !== pcId ||
    commitment.request.request_id !== requestId ||
    commitment.request.fact_key !== pcMovementRequestKey(pcId)
  )
    return undefined;
  // the kernel's registered object for that transfer, with its one earned boundary, pending in the active index
  const object = coordinator.object(logisticsObjectId(requestId))?.value;
  const boundary = object?.next_boundary;
  if (
    !object ||
    !boundary ||
    object.owning_ref.owner !== OWNER_LOGISTICS ||
    object.owning_ref.process_id !== logisticsProcessId(requestId) ||
    boundary.boundary_id !== logisticsBoundaryId(requestId) ||
    commitment.delivery.boundary_id !== boundary.boundary_id ||
    !canonicalEqual(commitment.delivery.at, boundary.at)
  )
    return undefined;
  if (
    !coordinator
      .boundaryIndex()
      .entries.some(
        (e) =>
          e.object_id === object.object_id &&
          e.boundary_id === boundary.boundary_id &&
          canonicalEqual(e.at, boundary.at),
      )
  )
    return undefined;
  // while the transfer is still in transfer the object is exactly the one the existing helper derives from it
  if (
    transfer.state.status === "IN_TRANSFER" &&
    !canonicalEqual(object, logisticsTemporalObject(commitment, transfer))
  )
    return undefined;
  return { object_id: object.object_id, boundary_id: boundary.boundary_id };
}

/**
 * Whether `prior` is the committed Temporal transaction a PC delivery continuation may consume: it requested exactly this PC's
 * condition-only `STOP_AFTER_BOUNDARY` (no target) and stopped with unresolved dependents, so the kernel's own rule
 * (`continuationRequestViolation`) requires the continuation to carry that request forward unchanged.
 */
function isHeldPcContinuation(
  prior: ResolutionTransaction | undefined,
  requested: ResolutionRequest["requested"],
): boolean {
  return (
    prior !== undefined &&
    canonicalEqual(prior.requested, requested) &&
    prior.outcome.unresolved_dependents.length > 0
  );
}

/**
 * The owner stage providers this advance registers, as the engine ships them (the real owners, no fixture): the PC delivery chain's
 * World-State destination custody and Logistics delivery and retirement, and GIP's own sunset expiry, so a previously registered
 * Governance Instrument whose exact `sunset_condition` is earned at or before the PC delivery boundary is closed by GIP alone at its
 * own boundary, in the kernel's order. Registering the provider adds no authority, request field or source: the kernel still
 * selects what is due, and a committed-but-unregistered sunset still refuses the whole request (`ENROLLMENT_PENDING`).
 */
const ownerProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    worldEntityTransitionProvider,
    logisticsDeliveryProvider,
    logisticsRetirementProvider,
    gipSunsetExpiryProvider,
  ]);

/**
 * The one host operation. `context` is the trusted, separately player-authorized binding; `request` is the untrusted host input.
 */
export async function advanceConfirmedPcTransferToDelivery(
  context: TrustedConfirmedPcTransferAdvanceContext,
  request: unknown,
): Promise<AdvanceConfirmedPcTransferResult> {
  let before: number | undefined;
  let store: AdvanceCampaign["store"] | undefined;
  try {
    const bound = bindings.get(context);
    const parsed = AdvanceConfirmedPcTransferRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const { campaign, pc_id: pcId, transaction } = bound;
    store = campaign.store;
    before = store.head().revision;
    const coordinator = new TemporalCoordinator(store, ownerProviders());
    const requestId = pcMovementRequestId(pcId);
    const own = {
      object_id: logisticsObjectId(requestId),
      boundary_id: logisticsBoundaryId(requestId),
    };
    const condition = { kind: "STOP_AFTER_BOUNDARY", ...own } as const;
    const requested = { target: null, condition } as const;
    let continues: string | null;
    const existing = coordinator.transaction(transaction.transaction_id)?.value;
    if (existing) {
      // a transaction that already committed under this identity is replayed by the kernel against the SAME literal request it
      // submitted: the requested stop is derived from the PC's identity alone (the boundary has since been resolved, so there is
      // nothing left to re-read) and `continues` is read back from the committed record, verified to be exactly the PC delivery
      // continuation (or the initial branch) before the kernel compares the rest. A differing intent is the kernel's conflict.
      continues = existing.continues;
      if (
        continues !== null &&
        !isHeldPcContinuation(coordinator.transaction(continues)?.value, requested)
      )
        return refusal();
    } else {
      const stop = earnedStop(campaign, coordinator, pcId);
      if (!stop) return refusal();
      const held = coordinator.state()?.value.continuation ?? null;
      if (held === null) {
        continues = null;
      } else {
        // a held continuation is consumed whole by a NEW player-authorized transaction or it stays; only the restricted one this
        // gateway itself requested is eligible, and its request is carried forward verbatim (never a target, never a new condition)
        const prior = coordinator.transaction(held.from_transaction)?.value;
        if (held.toward !== null || !prior || !isHeldPcContinuation(prior, requested))
          return refusal();
        continues = held.from_transaction;
      }
    }
    const advanced = await coordinator.advance({
      ...transaction,
      continues,
      requested,
    } satisfies ResolutionRequest);
    if (advanced.ok) return ok({ status: PC_TRANSFER_ADVANCE_COMMITTED });
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
