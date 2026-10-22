import {
  CanonicalTimeSchema,
  CommitConfirmedPcCorridorRelocationRequestSchema,
  CommitCorridorMovementInputSchema,
  PC_RELOCATION_COMMITTED,
  PcMovementCommitInputSchema,
  PcPhysicalLocusCustodySchema,
  PublicationSchema,
  RELOCATION_OUTCOME_UNKNOWN,
  RELOCATION_OUTCOME_UNKNOWN_MESSAGE,
  RELOCATION_UNAVAILABLE,
  RELOCATION_UNAVAILABLE_MESSAGE,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  WorldCorridorSchema,
  compareTime,
  fail,
  logisticsCommitmentKey,
  logisticsObjectId,
  logisticsProcessId,
  logisticsTransferKey,
  ok,
  pcMovementCommitmentKey,
  pcMovementRequestId,
  pcMovementRequestKey,
  temporalObjectKey,
  worldCorridorKey,
  worldEntityTransitionKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  type CanonicalTime,
  type PcMovementCommitInput,
  type Publication,
} from "@immortalis/contracts";
import {
  LogisticsAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  corridorReadViolation,
  logisticsTemporalObject,
  type CanonicalCampaign,
} from "@immortalis/engine";
import type { CommitConfirmedPcRelocationResult } from "./pc-relocation.ts";

/**
 * IM-15 Host Protocol Gateway — the ONE separately opt-in, allowlisted, mutating, CONFIRMED active-PC single-leg relocation that is
 * additionally QUALIFIED by one World-State corridor (Runtime Contract IM-15 / IM-16, RC-15 / RC-16; Canonical Role Registry v1
 * `role.player` + `permission.player_choice.commit`; the frozen Active-PC Post-Handover Physical Locus Ownership & Relocation Contract
 * §§4, 8-16 — a contract that is not a spec-lock pin; WG "Geography / Traversal" and "Edge / Corridor State"; WS-010 Logistics).
 *
 * It is the strictly opt-in sibling of `commitConfirmedPcRelocation` (`pc-relocation.ts`), which is neither retrofitted nor restricted:
 * a context bound for one gateway is inert for the other, the operations are named differently, and the sibling's route-less
 * journey, identities and serialized outputs are unchanged. Everything the sibling says about authority holds here unchanged: the
 * trusted side alone states the campaign, the exact `PcMovementCommitInput` the player confirmed, the declared Logistics delivery
 * boundary and the publication material, and the host request is strictly operation-only. In addition the trusted side binds the
 * EXACT corridor key the variant requires. That key is never trusted as input: it is checked against the key the committed
 * facts derive (the PC's stationary custody origin and the confirmed destination, in that order, in that world).
 *
 * Before ANY PC-side commitment or request is written, a read-only preflight over committed state refuses, as the one refusal and
 * with no write: a missing corridor, a reversed, wrong-endpoint or wrong-world one, one that is not World-State's own fact, a
 * source-qualified binding that does not name this very corridor, a competing Logistics or World-State locus for the PC, and a
 * declared delivery boundary that does not lie after the canonical basis. The PC's one-time slot is therefore never consumed by a
 * known-invalid route. The preflight decides nothing the owners decide: Logistics' own source-qualified admission re-reads the corridor
 * and exact-pins the version it read, and the PC-side admissions still re-judge the active PC, its binding, custody and destination.
 *
 * The operation then composes the EXISTING owner paths in their ratified order and nothing else: the PC-side commitment-of-record, the
 * PC-owned Movement Service Request, Logistics' source-qualified commitment (`commitCorridorMovement`) at the declared boundary,
 * Logistics' dispatch, and the one Temporal registration of that same transfer. The corridor supplies no transit time, speed, right of
 * access, feasibility, cost, cap, arrival or guarantee, and no other engaged input is waived: the delivery boundary stays the caller's
 * externally justified declaration. It invents no willingness, duration, success, rollback, arrival or second journey.
 *
 * Group and intent identities derive from the canonical PC identity alone, under this gateway's own namespace, so an ambiguous or lost
 * reply is reconciled by presenting the same request again (RC-16): every committed step replays and the rest commit. A different
 * route, choice or boundary under the same identities meets the committed record and is refused, never reusing success, and a route-less
 * commitment of the sibling is never retroactively upgraded to a source-qualified one. Once the transfer is committed, nothing short of
 * registration is a safe "absent": a step whose result is not known is reported only as the indeterminate outcome, never as a refusal.
 * Transport- and provider-neutral: a plain function over values.
 */

/** The opaque handle for one trusted, player-confirmed, corridor-qualified relocation context. It carries and reveals nothing. */
export interface TrustedConfirmedPcCorridorRelocationContext {
  readonly __trusted_confirmed_pc_corridor_relocation_context: never;
}

/** What the relocation needs of the campaign: the two PC-side owner publications and the store Logistics is built over. */
type CorridorRelocationCampaign = Pick<
  CanonicalCampaign,
  "commitPcVoluntaryMovement" | "establishPcMovementRequest" | "store"
>;

interface CorridorRelocationBinding {
  readonly campaign: CorridorRelocationCampaign;
  readonly choice: PcMovementCommitInput;
  readonly corridor_key: string;
  readonly delivery_at: CanonicalTime;
  readonly cause: string;
  readonly basis: string;
  readonly secrecy: string;
}

const bindings = new WeakMap<object, CorridorRelocationBinding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Call it only after the player has confirmed this exact destination
 * choice: the choice is the confirmation's content and the call is the trusted side's attestation of it, as for the sibling gateway.
 * `corridor_key` names the one World-State corridor (the scenario author's own committed topology fact) this relocation is qualified
 * by; it is checked, not trusted, on every invocation. Nothing here verifies a human, a session or an identity, and trusted context is
 * not canonical authority: the campaign's own admissions re-judge every fact on every invocation.
 *
 * An incomplete or schema-invalid binding (a choice not stated under exactly `role.player` + `permission.player_choice.commit`, no
 * corridor key, a malformed delivery boundary or publication material) yields an inert handle that the operation refuses without a read.
 */
export function bindTrustedConfirmedPcCorridorRelocationContext(trusted: {
  readonly campaign: CorridorRelocationCampaign;
  readonly choice: PcMovementCommitInput;
  readonly corridor_key: string;
  readonly delivery_at: CanonicalTime;
  readonly publication: {
    readonly cause: string;
    readonly basis: string;
    readonly secrecy: string;
  };
}): TrustedConfirmedPcCorridorRelocationContext {
  const handle = Object.freeze({}) as TrustedConfirmedPcCorridorRelocationContext;
  const choice = PcMovementCommitInputSchema.safeParse(trusted.choice);
  const corridorKey = CommitCorridorMovementInputSchema.shape.corridor_key.safeParse(
    trusted.corridor_key,
  );
  const delivery = CanonicalTimeSchema.safeParse(trusted.delivery_at);
  const material = PublicationSchema.pick({ cause: true, basis: true, secrecy: true }).safeParse(
    trusted.publication,
  );
  if (!choice.success || !corridorKey.success || !delivery.success || !material.success)
    return handle;
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
    corridor_key: corridorKey.data,
    delivery_at: delivery.data,
    ...material.data,
  });
  return handle;
}

/**
 * The read-only source preflight: nothing is written, and no owner decision is made. True only when, over committed state, the PC is
 * stationary at its custody origin, the bound corridor is exactly the World-State connection of that origin to the confirmed
 * destination, and (for a journey not yet begun) no other locus claim exists and the declared boundary lies after the canonical basis.
 * A journey this gateway already began is judged by identity alone: its corridor is create-only, so the check is the same on every
 * replay, and its declared boundary is no longer compared with a clock that has since advanced.
 */
function sourcePreflight(
  store: CorridorRelocationCampaign["store"],
  choice: PcMovementCommitInput,
  corridorKey: string,
  deliveryAt: CanonicalTime,
): boolean {
  const pcId = choice.pc_id;
  const custodyFact = store.getFact(worldPcLocusCustodyKey(pcId));
  const custody = custodyFact
    ? PcPhysicalLocusCustodySchema.safeParse(custodyFact.value)
    : undefined;
  if (!custody?.success) return false;
  const origin = custody.data.stationary_locus;
  const worldId = choice.destination.world_id;
  const destinationId = choice.destination.locus_id;
  if (origin.world.entity_id !== worldId || origin.locus.entity_id === destinationId) return false;
  const destination = {
    world: { fact_key: worldProfileKey(worldId), entity_id: worldId },
    locus: { fact_key: worldLocusKey(worldId, destinationId), entity_id: destinationId },
  };
  // the corridor is derived from established source facts and the confirmed destination, never taken from the binding on trust
  if (corridorKey !== worldCorridorKey(worldId, origin.locus.entity_id, destinationId))
    return false;
  const corridorFact = store.getFact(corridorKey);
  const corridor = corridorFact ? WorldCorridorSchema.safeParse(corridorFact.value) : undefined;
  if (!corridorFact || !corridor?.success) return false;
  if (
    corridorReadViolation(
      {
        key: corridorFact.key,
        owner: corridorFact.owner,
        version: corridorFact.version,
        value: corridor.data,
      },
      origin,
      destination,
    ) !== null
  )
    return false;
  if (store.getFact(pcMovementCommitmentKey(pcId))) return true;
  // a journey not yet begun: no rival locus claim may exist, and the declared boundary must lie after the canonical basis
  if (
    store.getFact(logisticsCommitmentKey(worldId, pcId)) ||
    store.getFact(logisticsTransferKey(worldId, pcId)) ||
    store.getFact(worldEntityTransitionKey(worldId, pcId))
  )
    return false;
  const clockFact = store.getFact(TEMPORAL_STATE_KEY);
  const clock = clockFact ? TemporalStateSchema.safeParse(clockFact.value) : undefined;
  return clock?.success === true && compareTime(deliveryAt, clock.data.canonical_time) === 1;
}

/**
 * Registers the dispatched transfer's one temporal object, exactly as the existing helper derives it from the committed
 * commitment and transfer, or reconciles by identity with the registration that already committed. Nothing is authored here:
 * a missing, mismatched or already-held-by-another object is not repaired and is simply not enrolled. (The sibling gateway's own
 * helper is module-private and its file is deliberately left untouched.)
 */
async function enrollTransfer(
  store: CorridorRelocationCampaign["store"],
  logistics: LogisticsAdapter,
  choice: PcMovementCommitInput,
  requestKey: string,
  publication: Publication,
): Promise<boolean> {
  const requestId = pcMovementRequestId(choice.pc_id);
  const objectKey = temporalObjectKey(logisticsObjectId(requestId));
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
  const registered = await new TemporalCoordinator(
    store,
    new StageProviderRegistry(),
  ).registerObject({
    ...publication,
    object: logisticsTemporalObject(commitment, transfer),
  });
  return registered.ok;
}

const refusal = (): CommitConfirmedPcRelocationResult =>
  fail(RELOCATION_UNAVAILABLE, RELOCATION_UNAVAILABLE_MESSAGE);
const unknownOutcome = (): CommitConfirmedPcRelocationResult =>
  fail(RELOCATION_OUTCOME_UNKNOWN, RELOCATION_OUTCOME_UNKNOWN_MESSAGE);

/**
 * The one host operation. `context` is the trusted, player-confirmed, corridor-qualified binding; `request` is the untrusted host input.
 */
export async function commitConfirmedPcCorridorRelocation(
  context: TrustedConfirmedPcCorridorRelocationContext,
  request: unknown,
): Promise<CommitConfirmedPcRelocationResult> {
  let attempted = false;
  try {
    const bound = bindings.get(context);
    const parsed = CommitConfirmedPcCorridorRelocationRequestSchema.safeParse(request);
    if (bound === undefined || !parsed.success) return refusal();
    const { campaign, choice, corridor_key, delivery_at } = bound;
    // read-only and BEFORE any PC commitment or request: a known-invalid source never consumes the PC's one-time slot
    if (!sourcePreflight(campaign.store, choice, corridor_key, delivery_at)) return refusal();
    const pcId = choice.pc_id;
    const requestKey = pcMovementRequestKey(pcId);
    const logistics = new LogisticsAdapter(campaign.store);
    // identities derive from the canonical PC identity alone, under this gateway's own namespace, apart from the sibling's
    const publication = (step: string) => ({
      group_id: `pc-corridor-relocation-group:${step}:${pcId}`,
      intent_id: `pc-corridor-relocation-intent:${step}:${pcId}`,
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
        logistics.commitCorridorMovement({
          ...publication("movement"),
          commit: { request_key: requestKey, corridor_key, delivery_at },
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
