import {
  COLLECTION_OUTCOME_UNKNOWN,
  COLLECTION_OUTCOME_UNKNOWN_MESSAGE,
  COLLECTION_UNAVAILABLE,
  COLLECTION_UNAVAILABLE_MESSAGE,
  CommitConfirmedPcCollectionRequestSchema,
  GetPcCollectionReachTaskRequestSchema,
  PC_COLLECTION_COMMITTED,
  PcCollectionCommitInputSchema,
  PublicationSchema,
  StartConfirmedPcCollectionRequestSchema,
  SubmitPcCollectionReachRequestSchema,
  TemporalObjectSchema,
  EntityId,
  fail,
  ok,
  pcCollectionRequestId,
  productionExtractionObjectId,
  temporalObjectKey,
  type PcCollectionCommitInput,
  type PcCollectionReachTaskReceipt,
  type PcCollectionReceipt,
  type Publication,
  type Result,
} from "@immortalis/contracts";
import {
  PcCollectionAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  type CanonicalCampaign,
} from "@immortalis/engine";

/**
 * CPAA-C1 v0.2 PROVISIONAL (not ratified; see `@immortalis/contracts` `pc-collection.ts`) — IM-15 Host Protocol Gateway: the CONFIRMED
 * active-PC direct-collection operations (Runtime Contract IM-15 / IM-16, RC-15 / RC-16; Canonical Role Registry v1 `role.player` +
 * `permission.player_choice.commit`).
 *
 * Authority is never host input. It comes from a TRUSTED CONTEXT that server-side code establishes only AFTER the player's confirmation
 * of one exact attempt has been obtained by that code's own means (authentication, sessions and the confirmation interaction itself
 * are out of scope and are neither modelled nor claimed). The context binds, behind an opaque frozen handle in a module-private
 * registry: the one campaign, the exact `PcCollectionCommitInput` the player confirmed (PC, the immutable per-act identity the trusted
 * side retained before the first write, source, Reserve, amount and the authored `role.player` + `permission.player_choice.commit`,
 * stated by the trusted side and never defaulted here), the PC's established mechanism and Production's Capability / Access basis it
 * selects, and the publication material. A value a host fabricated is not a context and is refused.
 *
 * The four host operations compose the EXISTING owner paths and nothing else: (1) the PC-side commitment-of-record and the PC-owned
 * request; (2) the read of the bounded premises a `role.gm` interpretation needs; (3) the submission of that UNTRUSTED reading, which
 * the engine validates and from which it DERIVES the verdict; (4) Population's occupancy registration, Production's start (cycles,
 * causal duration and earned completion are DERIVED; no boundary is accepted) and the Temporal enrollment of the extraction's one
 * object. None resolves a stage, advances time or creates a presentation event: the earned completion is reached only by a
 * separately confirmed advance over the existing Temporal → Production → World-State → Production chain.
 *
 * Group and intent identities derive from the PC identity and the act identity (no host-supplied idempotency), so a lost reply is
 * reconciled by presenting the same request again (RC-16). The only things returned are the three minimum statuses (and, for the one
 * read, the bounded task); every refusal is the same refusal, so no cause, owner, state or hidden-state existence can be told apart.
 */

/** The opaque handle for one trusted, player-confirmed collection context. It carries and reveals nothing. */
export interface TrustedConfirmedPcCollectionContext {
  readonly __trusted_confirmed_pc_collection_context: never;
}

type CollectionCampaign = Pick<CanonicalCampaign, "store">;

interface CollectionBinding {
  readonly campaign: CollectionCampaign;
  readonly choice: PcCollectionCommitInput;
  readonly mechanism_id: string;
  readonly basis_id: string;
  readonly cause: string;
  readonly basis: string;
  readonly secrecy: string;
}

const bindings = new WeakMap<object, CollectionBinding>();

/**
 * TRUSTED-SIDE ONLY — never reachable from a host request. Call it only after the player has confirmed this exact attempt: the choice
 * is the confirmation's content and the call is the trusted side's attestation of it. Nothing here verifies a human, a session or an
 * identity. The campaign's own admission still re-judges every fact on every invocation; trusted context is not canonical authority.
 * An incomplete or schema-invalid binding (a choice not stated under exactly `role.player` + `permission.player_choice.commit`, a
 * malformed identity or publication material) yields an inert handle that every operation refuses without a read.
 */
export function bindTrustedConfirmedPcCollectionContext(trusted: {
  readonly campaign: CollectionCampaign;
  readonly choice: PcCollectionCommitInput;
  readonly mechanism_id: string;
  readonly basis_id: string;
  readonly publication: {
    readonly cause: string;
    readonly basis: string;
    readonly secrecy: string;
  };
}): TrustedConfirmedPcCollectionContext {
  const handle = Object.freeze({}) as TrustedConfirmedPcCollectionContext;
  const choice = PcCollectionCommitInputSchema.safeParse(trusted.choice);
  const mechanism = EntityId.safeParse(trusted.mechanism_id);
  const basisId = EntityId.safeParse(trusted.basis_id);
  const material = PublicationSchema.pick({ cause: true, basis: true, secrecy: true }).safeParse(
    trusted.publication,
  );
  if (!choice.success || !mechanism.success || !basisId.success || !material.success) return handle;
  const { campaign } = trusted;
  bindings.set(handle, {
    campaign: Object.freeze({
      get store() {
        return campaign.store;
      },
    }),
    choice: choice.data,
    mechanism_id: mechanism.data,
    basis_id: basisId.data,
    ...material.data,
  });
  return handle;
}

export type PcCollectionResult = Result<
  PcCollectionReceipt,
  typeof COLLECTION_UNAVAILABLE | typeof COLLECTION_OUTCOME_UNKNOWN
>;
export type PcCollectionReachTaskResult = Result<
  PcCollectionReachTaskReceipt,
  typeof COLLECTION_UNAVAILABLE
>;

const refusal = (): PcCollectionResult =>
  fail(COLLECTION_UNAVAILABLE, COLLECTION_UNAVAILABLE_MESSAGE);
const unknownOutcome = (): PcCollectionResult =>
  fail(COLLECTION_OUTCOME_UNKNOWN, COLLECTION_OUTCOME_UNKNOWN_MESSAGE);

type Outcome = { readonly ok: boolean; readonly error?: { readonly code: string } };

const publicationFor = (b: CollectionBinding, step: string): Publication => ({
  group_id: `pc-collect-group:${step}:${b.choice.pc_id}:${b.choice.act_id}`,
  intent_id: `pc-collect-intent:${step}:${b.choice.pc_id}:${b.choice.act_id}`,
  cause: b.cause,
  basis: b.basis,
  secrecy: b.secrecy,
});

/**
 * Registers the extraction's one temporal object, exactly as the engine derives it from the committed extraction, or reconciles by
 * identity with the registration that already committed. Nothing is authored here: a missing or mismatched object is not repaired.
 */
async function enroll(b: CollectionBinding, adapter: PcCollectionAdapter): Promise<boolean> {
  const store = b.campaign.store;
  const publication = publicationFor(b, "temporal");
  const objectKey = temporalObjectKey(
    productionExtractionObjectId(pcCollectionRequestId(b.choice.pc_id, b.choice.act_id)),
  );
  const prior = store.committedGroup(publication.intent_id);
  if (prior) {
    const written = prior.writes.find((w) => w.key === objectKey);
    if (
      prior.group_id !== publication.group_id ||
      !written ||
      !TemporalObjectSchema.safeParse(written.value).success
    )
      return false;
    return (await store.commit(prior)).ok;
  }
  const object = adapter.temporalObject(b.choice.pc_id, b.choice.act_id);
  if (!object) return false;
  const registered = await new TemporalCoordinator(
    store,
    new StageProviderRegistry(),
  ).registerObject({
    ...publication,
    object,
  });
  return registered.ok;
}

/** (1) The player's confirmed commitment-of-record and the PC-owned request derived from it. Nothing starts and nothing moves. */
export async function commitConfirmedPcCollection(
  context: TrustedConfirmedPcCollectionContext,
  request: unknown,
): Promise<PcCollectionResult> {
  let attempted = false;
  try {
    const b = bindings.get(context);
    if (b === undefined || !CommitConfirmedPcCollectionRequestSchema.safeParse(request).success)
      return refusal();
    const adapter = new PcCollectionAdapter(b.campaign.store);
    const steps: readonly (() => Promise<Outcome>)[] = [
      () => adapter.commit({ ...publicationFor(b, "commitment"), commitment: b.choice }),
      () =>
        adapter.establishRequest({
          ...publicationFor(b, "request"),
          pc_id: b.choice.pc_id,
          act_id: b.choice.act_id,
        }),
    ];
    for (const step of steps) {
      attempted = true;
      const outcome = await step();
      if (!outcome.ok)
        return outcome.error?.code === "UNKNOWN_OUTCOME" ? unknownOutcome() : refusal();
    }
    return ok({ status: PC_COLLECTION_COMMITTED });
  } catch {
    return attempted ? unknownOutcome() : refusal();
  }
}

/** (2) The bounded premises of this attempt, for the `role.gm` interpretation. A read: it changes nothing. */
export function getPcCollectionReachTask(
  context: TrustedConfirmedPcCollectionContext,
  request: unknown,
): PcCollectionReachTaskResult {
  try {
    const b = bindings.get(context);
    if (b === undefined || !GetPcCollectionReachTaskRequestSchema.safeParse(request).success)
      return fail(COLLECTION_UNAVAILABLE, COLLECTION_UNAVAILABLE_MESSAGE);
    const task = new PcCollectionAdapter(b.campaign.store).reachTask(
      b.choice.pc_id,
      b.choice.act_id,
      b.mechanism_id,
    );
    return task ? ok({ task }) : fail(COLLECTION_UNAVAILABLE, COLLECTION_UNAVAILABLE_MESSAGE);
  } catch {
    return fail(COLLECTION_UNAVAILABLE, COLLECTION_UNAVAILABLE_MESSAGE);
  }
}

/**
 * (3) The host's UNTRUSTED reading of the physical reach. The engine validates it against the task (closed vocabularies, verbatim
 * quotations) and DERIVES the verdict; the judgment is retained under `role.gm` + `permission.rule.adjudicate` applied by this trusted
 * operation, never read from the answer. An answer that does not validate writes nothing and is the one refusal.
 */
export async function submitPcCollectionReach(
  context: TrustedConfirmedPcCollectionContext,
  request: unknown,
): Promise<PcCollectionResult> {
  let attempted = false;
  try {
    const b = bindings.get(context);
    const parsed = SubmitPcCollectionReachRequestSchema.safeParse(request);
    if (b === undefined || !parsed.success) return refusal();
    attempted = true;
    const outcome = await new PcCollectionAdapter(b.campaign.store).adjudicateReach({
      pc_id: b.choice.pc_id,
      act_id: b.choice.act_id,
      mechanism_id: b.mechanism_id,
      answer: parsed.data.answer,
    });
    if (outcome.ok) return ok({ status: PC_COLLECTION_COMMITTED });
    return outcome.error.code === "UNKNOWN_OUTCOME" ? unknownOutcome() : refusal();
  } catch {
    return attempted ? unknownOutcome() : refusal();
  }
}

/**
 * (4) Population's occupancy registration, Production's start and the Temporal enrollment. Production DERIVES the cycles, the causal
 * duration and the earned completion; there is no boundary input. If the judged reach is not REACHABLE nothing is registered. If
 * Production refuses the start (for example, the real remaining source does not support the amount) the registration is released by
 * lawful denial and the one refusal is returned: the PC's time is never left occupied by work that was never admitted.
 */
export async function startConfirmedPcCollection(
  context: TrustedConfirmedPcCollectionContext,
  request: unknown,
): Promise<PcCollectionResult> {
  let attempted = false;
  try {
    const b = bindings.get(context);
    if (b === undefined || !StartConfirmedPcCollectionRequestSchema.safeParse(request).success)
      return refusal();
    const { pc_id: pcId, act_id: actId } = b.choice;
    const adapter = new PcCollectionAdapter(b.campaign.store);
    const reach = adapter.reach(pcId, actId);
    if (!reach || reach.value.verdict !== "REACHABLE") return refusal();
    const registered = !!adapter.occupancy(pcId) && adapter.occupancy(pcId)!.value.act_id === actId;
    if (!registered) {
      attempted = true;
      const occ = await adapter.registerOccupancy({
        ...publicationFor(b, "occupancy"),
        pc_id: pcId,
        act_id: actId,
        mechanism_id: b.mechanism_id,
      });
      if (!occ.ok) return occ.error.code === "UNKNOWN_OUTCOME" ? unknownOutcome() : refusal();
    }
    attempted = true;
    const started = await adapter.startWork({
      ...publicationFor(b, "work"),
      pc_id: pcId,
      act_id: actId,
      mechanism_id: b.mechanism_id,
      basis_id: b.basis_id,
    });
    if (!started.ok) {
      if (started.error.code === "UNKNOWN_OUTCOME") return unknownOutcome();
      // Production refused: release the registration, but only an OPEN one of this act for which no extraction was ever admitted
      if (!adapter.extraction(pcId, actId) && adapter.occupancyState(pcId).state === "OPEN") {
        const released = await adapter.releaseOccupancyDenied({
          ...publicationFor(b, "release"),
          pc_id: pcId,
          act_id: actId,
        });
        if (!released.ok) return unknownOutcome();
      }
      return refusal();
    }
    // the extraction is committed: from here a failure cannot say the collection is absent, only that its enrollment is unreconciled
    return (await enroll(b, adapter)) ? ok({ status: PC_COLLECTION_COMMITTED }) : unknownOutcome();
  } catch {
    return attempted ? unknownOutcome() : refusal();
  }
}
