import {
  CanonicalTimeSchema,
  EntityId,
  NULL_PC_OOC_HELD_ADVANCE_COMMITTED,
  NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN,
  NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN_MESSAGE,
  NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE,
  NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE_MESSAGE,
  ResolutionRequestSchema,
  ResumeNullPcOocHeldAdvanceRequestSchema,
  fail,
  ok,
  type CanonicalTime,
  type NullPcOocHeldAdvanceReceipt,
  type ResolutionRequest,
  type ResolutionTransaction,
  type Result,
} from "@immortalis/contracts";
import {
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
 * IM-15 Host Protocol Gateway — the ONE allowlisted, mutating, SEPARATELY player-authorized NULL-PC out-of-character (OOC)
 * held-continuation temporal advance (Runtime Contract IM-15 / IM-16, RC-05 / RC-15 / RC-16; F-014B Turnless Temporal §§2-4, 6,
 * 9, 13, 17-20 and its W3-CP3 Temporal Interface Overlay — No-Active-PC Advance; I-001 §§2-4, 14, 17, 20; Canonical Role Registry
 * v1 `role.player` + `permission.player_choice.commit`; F-014D / NPK).
 *
 * The initial NULL-PC OOC gateway (`advanceNullPcOocToTarget`) commits only the initial `continues: null` branch and refuses a
 * held continuation. When the kernel's own committed transaction stopped `DEPENDENCY_UNRESOLVED` and holds an unresolved
 * remainder, this module is the SEPARATE host-facing path that lets the player choose, anew, to continue exactly that held work.
 * It is neither a general wait system, a general continuation framework, a natural-language interpreter nor a source of special
 * OOC omniscience, and it relaxes nothing in the initial gateway.
 *
 * Authority is never host input, and neither is time or continuation identity. It comes from a TRUSTED CONTEXT that server-side
 * code establishes only AFTER the player has made a genuine, NEW OOC choice to resume a campaign that currently has no active PC,
 * by that code's own means (authentication, sessions and the choice interaction itself are out of scope and are neither modelled
 * nor claimed). The context binds, in a module-private registry behind an opaque frozen handle: the one campaign; the held
 * lineage the player chose to continue — the held transaction's identity and the originally authorized canonical target; and the
 * durable identity and authored provenance of the NEW choice — a transaction id that is not the held one, cause, trigger, the
 * active role/permission context (stated by the trusted side, never defaulted here) and the publication labels. A value a host
 * fabricated, parsed or copied is not a context and is refused. There is no `confirmed` flag, role claim or LLM wording that can
 * stand for the choice, and the earlier choice never stands for this one.
 *
 * The host-visible request is strict and carries only the operation name. Nothing the host sends can select the campaign, PC,
 * target, held transaction, continuation, transaction identity, authority, provider, publication or outcome.
 *
 * The operation freshly re-reads the committed campaign and requires that it still has NO operative `role.player_character`
 * binding before it reads or writes anything else: while a PC is active it is inert. It then reads the Temporal state and the
 * sealed lineage and proceeds only for exactly the work the player chose: the state still holds a continuation whose
 * `from_transaction` is the bound held transaction (a stale, foreign or consumed hold is refused), and that sealed transaction —
 * with every transaction it continued, back to its initial one — stopped `DEPENDENCY_UNRESOLVED` having requested exactly the
 * bound target and no condition. A different request type (a stop condition, such as a PC stop-at-boundary), a different target
 * or a missing transaction is refused. The one existing `ResolutionRequestSchema` request is then built: `continues` is the held
 * `from_transaction`, `requested` is the held transaction's recorded request verbatim (never a new target, condition, amount or
 * duration), and the trusted side's identity and provenance are repeated unchanged. It is driven through the EXISTING
 * `TemporalCoordinator.advance` over the real owner stage providers the engine already ships, so the kernel alone consumes the
 * persisted remainder, selects what is due, resolves each declared dependency closure in its own order, records the one
 * transaction and, if a dependency still cannot be resolved, a new truthful held remainder. It invents no time, calendar, unit,
 * duration, horizon or world process, adds no scheduler, event source, retry or recurrence, and writes no owner fact itself; the
 * requested time is never reported as reached by this module, because only the kernel's recorded transaction says what was.
 *
 * Retry is by identity (RC-16): the transaction identity is the trusted side's, stable across retries and reopen. A transaction
 * that already committed under that identity is replayed by the kernel against the same literal request and writes nothing; it
 * replays ONLY itself, and only when it is a continuation of this context's held lineage, so presenting the first choice's
 * identity (an initial record) or any other never progresses and never silently continues. Committed stages are adopted, never
 * recomputed; the same identity presented with a different intent or provenance is the kernel's conflict and is refused. A second
 * progress attempt needs another genuine choice and a distinct identity. The only things returned are one of three minimum
 * statuses; every refusal is the same refusal, so no time, stop reason, key, revision, event, recipient or hidden-state existence
 * can be distinguished. A committed status means the temporal transaction committed, nothing more. It grants no PC Glance,
 * Narrative-Kernel report, observer privilege, event discovery, placement or later PC memory. Transport- and provider-neutral:
 * a plain function over values.
 */

/** The opaque handle for one trusted, separately player-authorized NULL-PC OOC held-continuation context. It carries and reveals nothing. */
export interface TrustedNullPcOocHeldContinuationContext {
  readonly __trusted_null_pc_ooc_held_continuation_context: never;
}

/** What the advance needs of the campaign: the operative binding (to prove the NULL state) and the store. */
type NullPcCampaign = Pick<CanonicalCampaign, "binding" | "store">;

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

interface NullPcHeldContinuationBinding {
  readonly campaign: NullPcCampaign;
  readonly held_transaction: string;
  readonly target: CanonicalTime;
  readonly transaction: TrustedTransaction;
}

const bindings = new WeakMap<object, NullPcHeldContinuationBinding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Call it only after the player has made a NEW, genuine OOC choice to
 * resume the held work of a campaign that currently has no active PC: the call is the trusted side's attestation of it.
 * `held.from_transaction` is the held transaction the player chose to continue and `held.target` the canonical target that
 * player originally authorized for it; `transaction` is the NEW choice's durable identity and authored provenance, both retained
 * by the caller across retries and reopen. Nothing here verifies a human, a session or an identity. The Temporal kernel and the
 * owners still re-judge every fact on every invocation; trusted context is not canonical authority.
 *
 * An incomplete or schema-invalid binding (a held identity or target that is not an existing schema value, a transaction not
 * stated under exactly `role.player` + `permission.player_choice.commit`, malformed identity or publication material, or a new
 * identity that is the held transaction itself) yields an inert handle that the operation refuses without a read.
 */
export function bindTrustedNullPcOocHeldContinuationContext(trusted: {
  readonly campaign: NullPcCampaign;
  readonly held: { readonly from_transaction: string; readonly target: CanonicalTime };
  readonly transaction: TrustedTransaction;
}): TrustedNullPcOocHeldContinuationContext {
  const handle = Object.freeze({}) as TrustedNullPcOocHeldContinuationContext;
  const lineage: object | null | undefined = trusted.held;
  // the held lineage is exactly two values; any other field is a malformed binding, as it is for the transaction's strict schema
  const exact =
    typeof lineage === "object" &&
    lineage !== null &&
    Object.keys(lineage).sort().join() === "from_transaction,target";
  const heldId = EntityId.safeParse(exact ? trusted.held.from_transaction : undefined);
  const target = CanonicalTimeSchema.safeParse(exact ? trusted.held.target : undefined);
  const stated = AdvanceTransactionSchema.safeParse(trusted.transaction);
  if (!heldId.success || !target.success || !stated.success) return handle;
  if (stated.data.transaction_id === heldId.data) return handle;
  const { campaign } = trusted;
  bindings.set(handle, {
    campaign: Object.freeze({
      binding: () => campaign.binding(),
      get store() {
        return campaign.store;
      },
    }),
    held_transaction: heldId.data,
    target: target.data,
    transaction: stated.data,
  });
  return handle;
}

export type ResumeNullPcOocHeldAdvanceResult = Result<
  NullPcOocHeldAdvanceReceipt,
  typeof NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE | typeof NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN
>;

const refusal = (): ResumeNullPcOocHeldAdvanceResult =>
  fail(NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE, NULL_PC_OOC_HELD_ADVANCE_UNAVAILABLE_MESSAGE);
const unknownOutcome = (): ResumeNullPcOocHeldAdvanceResult =>
  fail(NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN, NULL_PC_OOC_HELD_ADVANCE_OUTCOME_UNKNOWN_MESSAGE);

/** Codes after which a commit may have happened without a reply: never "safely absent". */
const AMBIGUOUS = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);

/**
 * The owner stage providers the engine already ships, registered as they are (the real owners, no fixture), identically to the
 * initial NULL-PC gateway so a resumed transaction is judged by the same owners as the one it continues. A stage whose provider
 * is not in this set stops the transaction under the kernel; nothing here adds, replaces or wraps one.
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

/**
 * The request the held transaction left unfinished, read from the sealed record, or `undefined` when the held lineage is not
 * exactly the one the player authorized: the held transaction and every transaction it continued, back to its initial one,
 * are committed under their own identity, requested exactly the bound target and no condition (target-only, so a PC
 * stop-at-boundary or any other predicate is not this lineage), and stopped `DEPENDENCY_UNRESOLVED` with unfinished dependents.
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
export async function resumeNullPcOocHeldAdvance(
  context: TrustedNullPcOocHeldContinuationContext,
  request: unknown,
): Promise<ResumeNullPcOocHeldAdvanceResult> {
  let before: number | undefined;
  let store: NullPcCampaign["store"] | undefined;
  try {
    const bound = bindings.get(context);
    const parsed = ResumeNullPcOocHeldAdvanceRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const { campaign, held_transaction: heldId, target, transaction } = bound;
    store = campaign.store;
    before = store.head().revision;
    // the operation exists only for the NULL state: a PC that is (or has become) active makes it inert, before anything else is read
    if (campaign.binding() !== undefined) return refusal();
    const coordinator = new TemporalCoordinator(
      store,
      ownerProviders(),
      populationBarrierEvaluator,
    );
    const existing = coordinator.transaction(transaction.transaction_id)?.value;
    if (existing) {
      // a transaction that already committed under this identity replays only itself, and only as the continuation of THIS held
      // lineage; an initial record or a continuation of any other work is not ours (the kernel's own identity compare refuses
      // any differing target, cause, trigger, context or publication as a conflict)
      if (existing.continues !== heldId) return refusal();
    } else {
      // the state must still hold exactly the remainder the player chose: a stale, consumed or foreign hold stays untouched
      const held = coordinator.state()?.value.continuation;
      if (!held || held.from_transaction !== heldId) return refusal();
    }
    const requested = heldRequest(coordinator, heldId, target);
    if (requested === undefined) return refusal();
    const advanced = await coordinator.advance({
      ...transaction,
      continues: heldId,
      requested,
    } satisfies ResolutionRequest);
    if (advanced.ok) return ok({ status: NULL_PC_OOC_HELD_ADVANCE_COMMITTED });
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
