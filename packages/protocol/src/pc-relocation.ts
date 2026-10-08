import {
  CanonicalTimeSchema,
  CommitConfirmedPcRelocationRequestSchema,
  PC_RELOCATION_COMMITTED,
  PcMovementCommitInputSchema,
  PublicationSchema,
  RELOCATION_OUTCOME_UNKNOWN,
  RELOCATION_OUTCOME_UNKNOWN_MESSAGE,
  RELOCATION_UNAVAILABLE,
  RELOCATION_UNAVAILABLE_MESSAGE,
  TemporalObjectSchema,
  fail,
  ok,
  logisticsObjectId,
  logisticsProcessId,
  pcMovementRequestId,
  pcMovementRequestKey,
  temporalObjectKey,
  type CanonicalTime,
  type PcMovementCommitInput,
  type PcRelocationReceipt,
  type Publication,
  type Result,
} from "@immortalis/contracts";
import {
  LogisticsAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  logisticsTemporalObject,
  type CanonicalCampaign,
} from "@immortalis/engine";

/**
 * IM-15 Host Protocol Gateway — the ONE allowlisted, mutating, CONFIRMED active-PC single-leg relocation (Runtime Contract IM-15 /
 * IM-16, RC-15 / RC-16; Canonical Role Registry v1 `role.player` + `permission.player_choice.commit`; the frozen Active-PC
 * Post-Handover Physical Locus Ownership & Relocation Contract §§4, 8-14, 16 — a contract that is not a spec-lock pin).
 *
 * Authority is never host input. It comes from a TRUSTED CONTEXT that server-side code establishes only AFTER the player's
 * confirmation of one exact destination choice has been obtained by that code's own means (authentication, sessions and the
 * confirmation interaction itself are out of scope and are neither modelled nor claimed). The context binds, in a module-private
 * registry behind an opaque frozen handle: the one campaign, the exact `PcMovementCommitInput` the player confirmed (PC,
 * destination and the authored `role.player` + `permission.player_choice.commit`, stated by the trusted side and never defaulted
 * here), the explicitly declared Logistics delivery boundary, and the publication material the trusted side authors. A value a
 * host fabricated, parsed or copied is not a context and is refused. There is no `confirmed` flag, role claim or LLM wording that
 * can stand for the confirmation: a context that does not hold a complete, schema-valid binding does not exist.
 *
 * The host-visible request is strict and carries only the operation name. Nothing the host sends can select the campaign, PC,
 * destination, confirmation, physical owner, delivery time, identity, source, rule or provenance.
 *
 * The operation composes the EXISTING owner paths in their ratified order and nothing else, each under its own owner and
 * unchanged in meaning: the PC-side commitment-of-record (`commitPcVoluntaryMovement`), the PC-owned Movement Service Request
 * (`establishPcMovementRequest`), Logistics' single-leg commitment at the declared boundary (`commitMovement`) and Logistics'
 * dispatch, which is the atomic yield of World-State's stationary custody to Logistics as the sole in-transfer locus (`dispatch`).
 * It then enrolls that SAME transfer with the Temporal kernel, once: the object the existing `logisticsTemporalObject` derives from
 * the committed commitment and the dispatched transfer, registered through the existing `TemporalCoordinator.registerObject` under
 * its one already-declared delivery boundary (a fifth owner publication, kernel-owned, authored by nothing the host sends). It
 * invents no willingness, route, duration, success, rollback or arrival. Registration resolves no stage, advances no time and
 * creates no presentation event: arrival remains solely the existing Temporal → Logistics delivery → World-State destination →
 * retirement chain, which a separately authorised advance drives by its normal means.
 *
 * Group and intent identities are derived from the canonical PC identity alone (no host- or clock-supplied idempotency), so an
 * ambiguous or lost reply is reconciled by presenting the same request again (RC-16): every committed step replays and the rest
 * commit, never a second journey and never a second temporal object. Once the transfer is committed, nothing short of registration
 * is a safe "absent": a registration that does not complete is reported as the unknown outcome, never as an unavailable movement. A partial sequence is recoverable only through the existing validated current state; nothing is
 * rolled back. The only things returned are one of three minimum statuses; every refusal is the same refusal, so no cause, owner,
 * state, provenance or hidden-state existence can be distinguished. Transport- and provider-neutral: a plain function over values.
 */

/** The opaque handle for one trusted, player-confirmed relocation context. It carries and reveals nothing. */
export interface TrustedConfirmedPcRelocationContext {
  readonly __trusted_confirmed_pc_relocation_context: never;
}

/** What the relocation needs of the campaign: the two PC-side owner publications and the store Logistics is built over. */
type RelocationCampaign = Pick<
  CanonicalCampaign,
  "commitPcVoluntaryMovement" | "establishPcMovementRequest" | "store"
>;

interface RelocationBinding {
  readonly campaign: RelocationCampaign;
  readonly choice: PcMovementCommitInput;
  readonly delivery_at: CanonicalTime;
  readonly cause: string;
  readonly basis: string;
  readonly secrecy: string;
}

const bindings = new WeakMap<object, RelocationBinding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Call it only after the player has confirmed this exact destination
 * choice: the choice is the confirmation's content and the call is the trusted side's attestation of it. Nothing here verifies a
 * human, a session or an identity. The campaign's own admission still re-judges every fact (the active PC at its pinned binding,
 * its stationary custody, the established destination) on every invocation; trusted context is not canonical authority.
 *
 * An incomplete or schema-invalid binding (a choice not stated under exactly `role.player` + `permission.player_choice.commit`,
 * a malformed delivery boundary or publication material) yields an inert handle that the operation refuses without a read.
 */
export function bindTrustedConfirmedPcRelocationContext(trusted: {
  readonly campaign: RelocationCampaign;
  readonly choice: PcMovementCommitInput;
  readonly delivery_at: CanonicalTime;
  readonly publication: {
    readonly cause: string;
    readonly basis: string;
    readonly secrecy: string;
  };
}): TrustedConfirmedPcRelocationContext {
  const handle = Object.freeze({}) as TrustedConfirmedPcRelocationContext;
  const choice = PcMovementCommitInputSchema.safeParse(trusted.choice);
  const delivery = CanonicalTimeSchema.safeParse(trusted.delivery_at);
  const material = PublicationSchema.pick({ cause: true, basis: true, secrecy: true }).safeParse(
    trusted.publication,
  );
  if (!choice.success || !delivery.success || !material.success) return handle;
  const { campaign } = trusted;
  bindings.set(handle, {
    campaign: Object.freeze({
      commitPcVoluntaryMovement: (input) => campaign.commitPcVoluntaryMovement(input),
      establishPcMovementRequest: (input) => campaign.establishPcMovementRequest(input),
      get store() {
        return campaign.store;
      },
    }),
    choice: choice.data,
    delivery_at: delivery.data,
    ...material.data,
  });
  return handle;
}

export type CommitConfirmedPcRelocationResult = Result<
  PcRelocationReceipt,
  typeof RELOCATION_UNAVAILABLE | typeof RELOCATION_OUTCOME_UNKNOWN
>;

/**
 * Registers the dispatched transfer's one temporal object, exactly as the existing helper derives it from the committed
 * commitment and transfer, or reconciles by identity with the registration that already committed. Nothing is authored here:
 * a missing, mismatched or already-held-by-another object is not repaired and is simply not enrolled.
 */
async function enrollTransfer(
  store: RelocationCampaign["store"],
  logistics: LogisticsAdapter,
  choice: PcMovementCommitInput,
  requestKey: string,
  publication: Publication,
): Promise<boolean> {
  const requestId = pcMovementRequestId(choice.pc_id);
  const objectKey = temporalObjectKey(logisticsObjectId(requestId));
  // a registration that already committed (a retry, a lost reply, a reopened campaign, or a boundary since resolved) is
  // replayed by its immutable identity, never re-derived against a newer state and never registered twice
  const prior = store.committedGroup(publication.intent_id);
  if (prior) {
    const written = prior.writes.find((w) => w.key === objectKey);
    const object = written ? TemporalObjectSchema.safeParse(written.value) : undefined;
    if (
      prior.group_id !== publication.group_id ||
      !object?.success ||
      object.data.owning_ref.process_id !== logisticsProcessId(requestId)
    )
      return false;
    return (await store.commit(prior)).ok;
  }
  const worldId = choice.destination.world_id;
  const commitment = logistics.commitment(worldId, choice.pc_id)?.value;
  const transfer = logistics.transfer(worldId, choice.pc_id)?.value;
  if (!commitment || !transfer) return false;
  const { request_id, fact_key } = commitment.request;
  if (request_id !== requestId || fact_key !== requestKey) return false;
  const object = logisticsTemporalObject(commitment, transfer);
  const registered = await new TemporalCoordinator(
    store,
    new StageProviderRegistry(),
  ).registerObject({
    ...publication,
    object,
  });
  return registered.ok;
}

const refusal = (): CommitConfirmedPcRelocationResult =>
  fail(RELOCATION_UNAVAILABLE, RELOCATION_UNAVAILABLE_MESSAGE);
const unknownOutcome = (): CommitConfirmedPcRelocationResult =>
  fail(RELOCATION_OUTCOME_UNKNOWN, RELOCATION_OUTCOME_UNKNOWN_MESSAGE);

/**
 * The one host operation. `context` is the trusted, player-confirmed binding; `request` is the untrusted host input.
 */
export async function commitConfirmedPcRelocation(
  context: TrustedConfirmedPcRelocationContext,
  request: unknown,
): Promise<CommitConfirmedPcRelocationResult> {
  let attempted = false;
  try {
    const bound = bindings.get(context);
    const parsed = CommitConfirmedPcRelocationRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const { campaign, choice, delivery_at } = bound;
    const pcId = choice.pc_id;
    const requestKey = pcMovementRequestKey(pcId);
    const logistics = new LogisticsAdapter(campaign.store);
    // identities derive from the canonical PC identity alone: the same trusted context always presents the same four intents
    const publication = (step: string) => ({
      group_id: `pc-relocation-group:${step}:${pcId}`,
      intent_id: `pc-relocation-intent:${step}:${pcId}`,
      cause: bound.cause,
      basis: bound.basis,
      secrecy: bound.secrecy,
    });
    const steps: readonly (() => Promise<{
      readonly ok: boolean;
      readonly error?: { readonly code: string };
    }>)[] = [
      () => campaign.commitPcVoluntaryMovement({ ...publication("commitment"), ...choice }),
      () => campaign.establishPcMovementRequest({ ...publication("request"), pc_id: pcId }),
      () =>
        logistics.commitMovement({
          ...publication("movement"),
          commit: { request_key: requestKey, delivery_at },
        }),
      () =>
        logistics.dispatch({ ...publication("dispatch"), dispatch: { request_key: requestKey } }),
    ];
    for (const step of steps) {
      attempted = true;
      const outcome = await step();
      if (!outcome.ok) {
        return outcome.error?.code === "UNKNOWN_OUTCOME" ? unknownOutcome() : refusal();
      }
    }
    // the transfer is committed: from here a failure cannot say the movement is absent, only that its enrollment is unreconciled
    const enrolled = await enrollTransfer(
      campaign.store,
      logistics,
      choice,
      requestKey,
      publication("temporal"),
    );
    return enrolled ? ok({ status: PC_RELOCATION_COMMITTED }) : unknownOutcome();
  } catch {
    // an exception before any commit was issued changed nothing; after one, only reconciliation by identity can say
    return attempted ? unknownOutcome() : refusal();
  }
}
