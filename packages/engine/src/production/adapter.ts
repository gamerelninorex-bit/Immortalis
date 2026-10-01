import {
  CANON_WRITE_AUTHORITY,
  DurableCompletionEnvelopeSchema,
  EstablishReserveInputSchema,
  FallbackPhysicalEntitySchema,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  PublicationSchema,
  StartOperationInputSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  fail,
  productionBoundaryId,
  productionClaimId,
  productionClaimKey,
  productionCompletionKey,
  productionOperationKey,
  productionOutputReference,
  productionReserveKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CanonicalTime,
  type CommitGroup,
  type DurableCompletionEnvelope,
  type FallbackPhysicalEntity,
  type OwnerFact,
  type ProductionClaim,
  type ProductionOperation,
  type ProductionReserve,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";

export type ProductionErrorCode = StoreCommitErrorCode | "INPUT_INVALID";

interface Typed<T> {
  readonly fact: OwnerFact;
  readonly value: T;
}

/**
 * Availability of a completed durable for ordinary downstream use (CG-2). A durable is available ONLY after
 * the destination custodian has accepted the same conserved reference; Production having completed it is not
 * availability.
 */
export type DurableAvailability =
  | { readonly state: "NOT_COMPLETED" }
  | { readonly state: "COMPLETED_PENDING_ACCEPTANCE"; readonly conserved_reference: string }
  | { readonly state: "ACCEPTED_AVAILABLE"; readonly entity: Typed<FallbackPhysicalEntity> };

/** What a start is built against: the pinned request, the temporal basis, the Reserve before, and its pins. */
interface StartBasis {
  readonly requestPin: { owner: string; fact_key: string; version: number };
  readonly now: CanonicalTime;
  readonly reserve: ProductionReserve;
  readonly reserveVersion: number;
  readonly reads: CommitGroup["reads"];
  readonly depends_on: readonly string[];
}

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, { issues: issues(e) });

/**
 * IM-05 Production — the acceptance path of the Production owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a
 * governing rule: those come from the specification-backed registry, and every publication is made by the
 * archivist path through the existing IM-11/IM-12/IM-17 store (one journal, one canon). There are exactly two
 * authored publications: establishing one exact local Reserve and starting one operation (which publishes the
 * operation, its RC-06 claim and the Reserve's open-claim entry together). Completion is NOT a method here: it
 * is the `productionCompletionProvider` operation the IM-02 coordinator resolves at the operation's declared
 * boundary, and the World-State acceptance is the custodian's own operation. There is no quantity setter, no
 * claim release, no output writer and no way to publish a durable, so no caller can write Production-owned
 * Reserve, claim, transformation or output state, nor the accepted entity; the store's admission refuses them
 * for a raw commit as well.
 */
export class ProductionAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /** Establishes one exact local Reserve attached to an already-committed world locus. */
  establishReserve(
    input: Publication & { readonly reserve: unknown },
  ): Promise<Result<CommitOutcome, ProductionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const i = EstablishReserveInputSchema.safeParse(input.reserve);
    if (!i.success) return Promise.resolve(invalid("reserve", i.error));
    const worldKey = worldProfileKey(i.data.world_id);
    const locusKey = worldLocusKey(i.data.world_id, i.data.locus_id);
    const value = ProductionReserveSchema.safeParse({
      reserve_id: i.data.reserve_id,
      material_class: i.data.material_class,
      established: i.data.quantity,
      quantity: i.data.quantity,
      consumed: [],
      condition: i.data.condition,
      locality: {
        world: { fact_key: worldKey, entity_id: i.data.world_id },
        locus: { fact_key: locusKey, entity_id: i.data.locus_id },
      },
      holding: "HELD_LOCAL_BY_PRODUCTION",
      claims: [],
    });
    if (!value.success) return Promise.resolve(invalid("reserve", value.error));
    return this.#publish(
      p.data,
      "production_reserve",
      [
        {
          key: productionReserveKey(i.data.reserve_id),
          value: value.data,
          expected_version: 0,
        },
      ],
      [worldKey, locusKey].map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
      [
        ...new Set(
          [worldKey, locusKey].flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? []),
        ),
      ],
    );
  }

  /**
   * Starts one operation on one request against one Reserve: publishes the operation, its RC-06 claim and the
   * Reserve holding that claim open, atomically. Pins the request (a foreign fact, referenced) and the
   * canonical temporal basis it starts at. If the Reserve's unclaimed quantity does not support the claim the
   * group is refused (`CLAIM_INCOMPATIBLE`) and nothing is recorded.
   *
   * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity
   * (RC-16): the group is rebuilt on the basis it was committed against — the pinned request, the temporal
   * basis and the Reserve as they were — so identical input reaches the original receipt, and a changed input
   * is refused as a conflict rather than silently reusing it.
   */
  async startOperation(
    input: Publication & { readonly start: unknown },
  ): Promise<Result<CommitOutcome, ProductionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const s = StartOperationInputSchema.safeParse(input.start);
    if (!s.success) return invalid("start", s.error);
    const requestFact = this.#store.getFact(s.data.request_key);
    const request = requestFact ? ProductionRequestSchema.safeParse(requestFact.value) : undefined;
    if (!requestFact || !request?.success) {
      return fail("PREREQUISITE_MISSING", "no Production Request is committed at the given key", {
        key: s.data.request_key,
      });
    }
    const opId = request.data.request_id;
    const reserveKey = productionReserveKey(s.data.reserve_id);
    const prior = this.#store.committedGroup(p.data.intent_id);
    const priorOp = prior?.writes.find((w) => w.key === productionOperationKey(opId));
    const priorReserve = prior?.writes.find((w) => w.key === reserveKey);
    let basis: StartBasis;
    if (prior && priorOp && priorReserve) {
      // reconcile by identity: rebuild on the committed basis
      const op = ProductionOperationSchema.safeParse(priorOp.value);
      const was = ProductionReserveSchema.safeParse(priorReserve.value);
      if (!op.success || !was.success)
        return invalid("committed operation", (op.success ? was : op).error!);
      basis = {
        requestPin: {
          owner: op.data.request.owner,
          fact_key: op.data.request.fact_key,
          version: op.data.request.version,
        },
        now: op.data.timing.started_at,
        reserve: {
          ...was.data,
          claims: was.data.claims.filter((c) => c !== productionClaimId(opId)),
        },
        reserveVersion: priorReserve.expected_version,
        reads: prior.reads,
        depends_on: prior.depends_on,
      };
    } else {
      if (this.#store.getFact(productionOperationKey(opId))) {
        return fail("VERSION_CONFLICT", "a request fixes one operation: it already exists", {
          operation_id: opId,
        });
      }
      const reserveFact = this.#store.getFact(reserveKey);
      const reserve = reserveFact
        ? ProductionReserveSchema.safeParse(reserveFact.value)
        : undefined;
      if (!reserveFact || !reserve?.success) {
        return fail("PREREQUISITE_MISSING", "the Reserve is not established", { key: reserveKey });
      }
      const clockFact = this.#store.getFact(TEMPORAL_STATE_KEY);
      const clock = clockFact ? TemporalStateSchema.safeParse(clockFact.value) : undefined;
      if (!clockFact || !clock?.success) {
        return fail("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
          key: TEMPORAL_STATE_KEY,
        });
      }
      const pinned = [s.data.request_key, TEMPORAL_STATE_KEY];
      basis = {
        requestPin: {
          owner: requestFact.owner,
          fact_key: requestFact.key,
          version: requestFact.version,
        },
        now: clock.data.canonical_time,
        reserve: reserve.data,
        reserveVersion: reserveFact.version,
        reads: pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
        depends_on: [
          ...new Set(pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
        ],
      };
    }
    const { requestPin, now, reserve } = basis;
    const claimId = productionClaimId(opId);
    const op = ProductionOperationSchema.safeParse({
      operation_id: opId,
      request: { ...requestPin, request_id: opId },
      reserve: { fact_key: reserveKey, reserve_id: reserve.reserve_id },
      claim: { fact_key: productionClaimKey(claimId), claim_id: claimId },
      transformation: {
        input: {
          material_class: reserve.material_class,
          quantity: s.data.transformation.input_quantity,
        },
        output: {
          reference: productionOutputReference(opId),
          output_class: s.data.transformation.output_class,
          quantity: s.data.transformation.output_quantity,
          condition: s.data.transformation.output_condition,
        },
      },
      support_basis: {
        tier: "TIER_A_EMBEDDED_BASELINE",
        labor: "NON_MATERIAL_EMBEDDED",
        specialist_competence: "NON_MATERIAL",
      },
      timing: {
        started_at: now,
        completion: { boundary_id: productionBoundaryId(opId), at: s.data.completion_at },
      },
      status: { state: "IN_PROGRESS" },
    });
    if (!op.success) return invalid("operation", op.error);
    const claim = ProductionClaimSchema.safeParse({
      claim_id: claimId,
      operation_id: opId,
      conserved: {
        kind: "PRODUCTION_RESERVE_QUANTITY",
        fact_key: reserveKey,
        reserve_id: reserve.reserve_id,
      },
      quantity: s.data.transformation.input_quantity,
      overlap_basis: "SAME_RESERVE_QUANTITY_UNTIL_CONSUMED",
      interval: { from: now, until: s.data.completion_at },
      priority_basis: null,
      lifecycle: { status: "ACTIVE" },
      lineage: { request: requestPin },
    });
    if (!claim.success) return invalid("claim", claim.error);
    const next = ProductionReserveSchema.safeParse({
      ...reserve,
      claims: [...reserve.claims, claimId].sort(),
    });
    if (!next.success) return invalid("reserve", next.error);
    return this.#publish(
      p.data,
      "production_operation",
      [
        { key: productionOperationKey(opId), value: op.data, expected_version: 0 },
        { key: productionClaimKey(claimId), value: claim.data, expected_version: 0 },
        { key: reserveKey, value: next.data, expected_version: basis.reserveVersion },
      ],
      basis.reads,
      basis.depends_on,
    );
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  reserve(reserveId: string): Typed<ProductionReserve> | undefined {
    return this.#typed(productionReserveKey(reserveId), ProductionReserveSchema);
  }
  claim(claimId: string): Typed<ProductionClaim> | undefined {
    return this.#typed(productionClaimKey(claimId), ProductionClaimSchema);
  }
  operation(operationId: string): Typed<ProductionOperation> | undefined {
    return this.#typed(productionOperationKey(operationId), ProductionOperationSchema);
  }
  completion(operationId: string): Typed<DurableCompletionEnvelope> | undefined {
    return this.#typed(productionCompletionKey(operationId), DurableCompletionEnvelopeSchema);
  }
  /** The accepted fallback entity, in World-State's own key space. */
  acceptedEntity(worldId: string, reference: string): Typed<FallbackPhysicalEntity> | undefined {
    return this.#typed(worldFallbackEntityKey(worldId, reference), FallbackPhysicalEntitySchema);
  }

  /** CG-2: a completed durable is available only once the custodian accepted that same conserved reference. */
  availability(operationId: string): DurableAvailability {
    const completion = this.completion(operationId);
    if (!completion) return { state: "NOT_COMPLETED" };
    const entityFact = this.#store.getFact(completion.value.destination_custodian.entity_fact_key);
    const entity = entityFact
      ? FallbackPhysicalEntitySchema.safeParse(entityFact.value)
      : undefined;
    if (
      entityFact &&
      entity?.success &&
      entity.data.entity_id === completion.value.conserved_reference &&
      entity.data.accepted_from.version === completion.fact.version
    ) {
      return { state: "ACCEPTED_AVAILABLE", entity: { fact: entityFact, value: entity.data } };
    }
    return {
      state: "COMPLETED_PENDING_ACCEPTANCE",
      conserved_reference: completion.value.conserved_reference,
    };
  }

  #typed<T>(key: string, schema: { parse(v: unknown): T }): Typed<T> | undefined {
    const fact = this.#store.getFact(key);
    return fact ? { fact, value: schema.parse(fact.value) } : undefined;
  }

  async #publish(
    p: Publication,
    kindId: "production_reserve" | "production_operation",
    writes: readonly { key: string; value: unknown; expected_version: number }[],
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, ProductionErrorCode>> {
    const kind = factKind(kindId);
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...depends_on],
      writes: writes.map((w) => ({
        key: w.key,
        owner: kind.owner,
        facet: kind.facet,
        value: w.value as CommitGroup["writes"][number]["value"],
        unit: null,
        basis: p.basis,
        secrecy: p.secrecy,
        expected_version: w.expected_version,
      })),
    };
    return this.#store.commit(group);
  }
}

const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});
