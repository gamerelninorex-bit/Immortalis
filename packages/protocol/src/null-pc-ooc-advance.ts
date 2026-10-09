import {
  AdvanceNullPcOocToTargetRequestSchema,
  CanonicalTimeSchema,
  NULL_PC_OOC_ADVANCE_COMMITTED,
  NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN,
  NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN_MESSAGE,
  NULL_PC_OOC_ADVANCE_UNAVAILABLE,
  NULL_PC_OOC_ADVANCE_UNAVAILABLE_MESSAGE,
  ResolutionRequestSchema,
  fail,
  ok,
  type CanonicalTime,
  type NullPcOocAdvanceReceipt,
  type ResolutionRequest,
  type Result,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  TemporalCoordinator,
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
 * IM-15 Host Protocol Gateway — the ONE allowlisted, mutating, player-authorized NULL-PC out-of-character (OOC) target-only
 * temporal advance (Runtime Contract IM-15 / IM-16, RC-05 / RC-15 / RC-16; F-014B Turnless Temporal §§2-4, 6, 9, 13, 17-20 and its
 * W3-CP3 Temporal Interface Overlay — No-Active-PC Advance; I-001 §§2-4, 14, 17, 20; Canonical Role Registry v1 `role.player` +
 * `permission.player_choice.commit`; F-014D / NPK).
 *
 * F-014B expressly permits `role.player` to request OOC Temporal advances while `role.player_character = NULL` through an
 * authorized interface. This module is that interface's host-facing adapter and nothing more: it is neither a general wait system,
 * a natural-language interpreter, nor a source of special OOC omniscience.
 *
 * Authority is never host input, and neither is time. It comes from a TRUSTED CONTEXT that server-side code establishes only AFTER
 * the player has made a genuine, separate OOC choice to advance a campaign that currently has no active PC, by that code's own
 * means (authentication, sessions and the choice interaction itself are out of scope and are neither modelled nor claimed). The
 * context binds, in a module-private registry behind an opaque frozen handle: the one campaign; the one explicit, player-chosen
 * target (an existing `CanonicalTimeSchema` value, never parsed from a date or computed from a duration); and the durable
 * transaction identity with its authored provenance — the transaction id, cause, trigger, the active role/permission context
 * (stated by the trusted side, never defaulted here) and the publication labels. A value a host fabricated, parsed or copied is
 * not a context and is refused. There is no `confirmed` flag, role claim or LLM wording that can stand for the choice.
 *
 * The host-visible request is strict and carries only the operation name. Nothing the host sends can select the campaign, PC,
 * target, duration, unit, condition, authority, session, transaction identity, trigger or provenance.
 *
 * The operation freshly re-reads the committed campaign and requires that it still has NO operative `role.player_character`
 * binding before it reads or writes anything else: while a PC is active it is inert. It then builds the one existing
 * `ResolutionRequestSchema` request — `continues` null and `requested: { target, condition: null }` — and drives it through the
 * EXISTING `TemporalCoordinator.advance` over the real owner stage providers the engine already ships, so the kernel alone selects
 * what is due (every registered due world process is resolved by its own owner, none is skipped), resolves each declared
 * dependency closure in its own order and records the one transaction. It invents no time, calendar, unit, duration, horizon or
 * world process, adds no scheduler, event source or recurrence, and writes no owner fact itself. A provider that is not registered,
 * an unresolved dependency or a required source that is absent stops the transaction truthfully under the kernel
 * (`DEPENDENCY_UNRESOLVED` with a held continuation); the requested time is never reported as reached by this module, because
 * only the kernel's recorded transaction says what was reached.
 *
 * It adds no admission rule about what is due. When the chosen target is valid and no registered material boundary is due by it
 * (an empty active index, or a target strictly before the earliest earned boundary), the unchanged request goes to the kernel,
 * which performs F-014B §6's exact lazy carry of stable state to the target with no owner effect and no invented process; the
 * presence or absence of due work is therefore never a host-visible difference. A held continuation is neither consumed,
 * cancelled nor overwritten — this slice implements the initial branch only (`continues` null); while the Temporal state holds
 * one, a new target is refused, and the kernel's own `CONTINUATION_HELD` guard stays the final authority.
 *
 * Retry is by identity (RC-16): the transaction identity is the trusted side's, stable across retries and reopen. A transaction
 * that already committed is replayed by the kernel against the same literal request and writes nothing; committed stages are
 * adopted, never recomputed; the same identity presented with a different intent or provenance is the kernel's conflict and is
 * refused. The only things returned are one of three minimum statuses; every refusal is the same refusal, so no time, stop reason,
 * key, revision, event, recipient or hidden-state existence can be distinguished. A committed status means the temporal
 * transaction committed, nothing more. It grants no PC Glance, Narrative-Kernel report, observer privilege, event discovery,
 * placement or later PC memory. Transport- and provider-neutral: a plain function over values.
 */

/** The opaque handle for one trusted, player-authorized NULL-PC OOC target advance context. It carries and reveals nothing. */
export interface TrustedNullPcOocTargetAdvanceContext {
  readonly __trusted_null_pc_ooc_target_advance_context: never;
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

interface NullPcAdvanceBinding {
  readonly campaign: NullPcCampaign;
  readonly target: CanonicalTime;
  readonly transaction: TrustedTransaction;
}

const bindings = new WeakMap<object, NullPcAdvanceBinding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Call it only after the player has made a genuine, separate OOC choice
 * to advance a campaign that currently has no active PC: the call is the trusted side's attestation of it, `target` is the
 * explicitly chosen canonical time and `transaction` is the choice's durable identity and authored provenance, both retained by
 * the caller across retries and reopen. Nothing here verifies a human, a session or an identity. The Temporal kernel and the
 * owners still re-judge every fact on every invocation; trusted context is not canonical authority.
 *
 * An incomplete or schema-invalid binding (a target that is not a `CanonicalTimeSchema` value, or a transaction not stated under
 * exactly `role.player` + `permission.player_choice.commit`, or with malformed identity or publication material) yields an inert
 * handle that the operation refuses without a read.
 */
export function bindTrustedNullPcOocTargetAdvanceContext(trusted: {
  readonly campaign: NullPcCampaign;
  readonly target: CanonicalTime;
  readonly transaction: TrustedTransaction;
}): TrustedNullPcOocTargetAdvanceContext {
  const handle = Object.freeze({}) as TrustedNullPcOocTargetAdvanceContext;
  const target = CanonicalTimeSchema.safeParse(trusted.target);
  const stated = AdvanceTransactionSchema.safeParse(trusted.transaction);
  if (!target.success || !stated.success) return handle;
  const { campaign } = trusted;
  bindings.set(handle, {
    campaign: Object.freeze({
      binding: () => campaign.binding(),
      get store() {
        return campaign.store;
      },
    }),
    target: target.data,
    transaction: stated.data,
  });
  return handle;
}

export type AdvanceNullPcOocToTargetResult = Result<
  NullPcOocAdvanceReceipt,
  typeof NULL_PC_OOC_ADVANCE_UNAVAILABLE | typeof NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN
>;

const refusal = (): AdvanceNullPcOocToTargetResult =>
  fail(NULL_PC_OOC_ADVANCE_UNAVAILABLE, NULL_PC_OOC_ADVANCE_UNAVAILABLE_MESSAGE);
const unknownOutcome = (): AdvanceNullPcOocToTargetResult =>
  fail(NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN, NULL_PC_OOC_ADVANCE_OUTCOME_UNKNOWN_MESSAGE);

/** Codes after which a commit may have happened without a reply: never "safely absent". */
const AMBIGUOUS = new Set(["UNKNOWN_OUTCOME", "STORE_POISONED", "STORE_CLOSED"]);

/**
 * The owner stage providers the engine already ships, registered as they are (the real owners, no fixture). A stage whose
 * provider is not in this set stops the transaction under the kernel; nothing here adds, replaces or wraps one.
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
 * The one host operation. `context` is the trusted, player-authorized binding; `request` is the untrusted host input.
 */
export async function advanceNullPcOocToTarget(
  context: TrustedNullPcOocTargetAdvanceContext,
  request: unknown,
): Promise<AdvanceNullPcOocToTargetResult> {
  let before: number | undefined;
  let store: NullPcCampaign["store"] | undefined;
  try {
    const bound = bindings.get(context);
    const parsed = AdvanceNullPcOocToTargetRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const { campaign, target, transaction } = bound;
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
      // a transaction that already committed under this identity is replayed by the kernel against the SAME literal request this
      // gateway submits; only the initial branch is ours, so a record that consumed a continuation is not (the kernel's own
      // identity compare refuses any differing target, cause, trigger, context or publication as a conflict)
      if (existing.continues !== null) return refusal();
    } else {
      const state = coordinator.state()?.value;
      // a held continuation is consumed or it stays; this slice never resumes or abandons one
      if (!state || state.continuation !== null) return refusal();
    }
    const advanced = await coordinator.advance({
      ...transaction,
      continues: null,
      requested: { target, condition: null },
    } satisfies ResolutionRequest);
    if (advanced.ok) return ok({ status: NULL_PC_OOC_ADVANCE_COMMITTED });
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
