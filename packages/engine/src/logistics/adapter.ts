import {
  CANON_WRITE_AUTHORITY,
  CommitMovementInputSchema,
  DispatchMovementInputSchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  PublicationSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  fail,
  logisticsCommitmentKey,
  logisticsTransferKey,
  worldEntityTransitionKey,
  type CommitGroup,
  type LogisticsCommitment,
  type LogisticsTransfer,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import { parsePhysicalSubject } from "../world/physical-subject.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { deriveCommitment, deriveTransfer } from "./derive.ts";
import { logisticsFactsOf, resolveEntityLocus, type ResolvedEntityLocus } from "./locus.ts";

export type LogisticsErrorCode = StoreCommitErrorCode | "INPUT_INVALID";

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, { issues: issues(e) });

/**
 * IM-05 Logistics — the authored path of the Logistics owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a
 * governing rule: those come from the specification-backed registry, and every publication is made by the
 * archivist path through the existing IM-11/IM-12/IM-17 store (one journal, one canon). There are exactly two
 * authored publications: committing one movement-service commitment and dispatching its transfer. The
 * delivery-complete result and the retirement are NOT methods here: they are the `logisticsDeliveryProvider` and
 * `logisticsRetirementProvider` operations the IM-02 coordinator resolves at the commitment's declared boundary,
 * and the destination commit between them is World-State's own ECT-01 stage. There is no delivery writer, no
 * retirement writer, no locus setter, no cancellation, no rerouting and no way to write an entity, so no caller can
 * write Logistics-owned state out of order, nor the entity or its destination; the store's admission refuses them
 * for a raw commit as well.
 *
 * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the
 * group is rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a
 * changed input is refused as a conflict rather than silently reusing it.
 */
export class LogisticsAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Commits one movement-service commitment for one request against one already-accepted entity. Pins the
   * request (a foreign fact, referenced), the entity (identity, quantity and condition stay with World-State), the
   * destination locus and the canonical temporal basis. One movement slot exists per entity: a second request for
   * the same entity, or one for an entity that already changed locus, is refused.
   */
  async commitMovement(
    input: Publication & { readonly commit: unknown },
  ): Promise<Result<CommitOutcome, LogisticsErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = CommitMovementInputSchema.safeParse(input.commit);
    if (!i.success) return invalid("commit", i.error);
    const requestFact = this.#store.getFact(i.data.request_key);
    const request = requestFact
      ? MovementServiceRequestSchema.safeParse(requestFact.value)
      : undefined;
    if (!requestFact || !request?.success) {
      return fail(
        "PREREQUISITE_MISSING",
        "no Movement Service Request is committed at the given key",
        {
          key: i.data.request_key,
        },
      );
    }
    const r = request.data;
    const world = r.destination.world.entity_id;
    const slot = logisticsCommitmentKey(world, r.subject.entity_id);
    const entityFact = this.#store.getFact(r.subject.fact_key);
    const entity = entityFact ? parsePhysicalSubject(entityFact.value) : undefined;
    if (!entityFact || !entity) {
      return fail("PREREQUISITE_MISSING", "the entity to move is not an accepted entity", {
        key: r.subject.fact_key,
      });
    }
    const prior = this.#store.committedGroup(p.data.intent_id);
    const priorW = prior?.writes.find((w) => w.key === slot);
    let now;
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    let requestVersion = requestFact.version;
    let entityVersion = entityFact.version;
    let transitioned: boolean;
    if (prior && priorW) {
      // reconcile by identity: rebuild on the committed basis
      const was = LogisticsCommitmentSchema.safeParse(priorW.value);
      if (!was.success) return invalid("committed commitment", was.error);
      now = was.data.committed_at;
      requestVersion = was.data.request.version;
      entityVersion = was.data.moved.version;
      reads = prior.reads;
      depends_on = prior.depends_on;
      transitioned = false;
    } else {
      if (this.#store.getFact(slot)) {
        return fail("VERSION_CONFLICT", "one movement slot exists per entity: it already exists", {
          key: slot,
        });
      }
      const clockFact = this.#store.getFact(TEMPORAL_STATE_KEY);
      const clock = clockFact ? TemporalStateSchema.safeParse(clockFact.value) : undefined;
      if (!clockFact || !clock?.success) {
        return fail("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
          key: TEMPORAL_STATE_KEY,
        });
      }
      now = clock.data.canonical_time;
      const pinned = [
        i.data.request_key,
        r.subject.fact_key,
        r.destination.world.fact_key,
        r.destination.locus.fact_key,
        TEMPORAL_STATE_KEY,
      ];
      reads = pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 }));
      depends_on = [
        ...new Set(pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ];
      transitioned =
        this.#store.getFact(worldEntityTransitionKey(world, r.subject.entity_id)) !== undefined;
    }
    const derived = deriveCommitment({
      request: {
        key: requestFact.key,
        owner: requestFact.owner,
        version: requestVersion,
        value: r,
      },
      entity: { key: entityFact.key, version: entityVersion, value: entity },
      transitioned,
      now,
      delivery_at: i.data.delivery_at,
    });
    if (!derived.ok) {
      return fail("INPUT_INVALID", derived.error.message, { key: i.data.request_key });
    }
    return this.#publish(
      p.data,
      "logistics_commitment",
      [{ key: slot, value: derived.value, expected_version: 0 }],
      reads,
      depends_on,
    );
  }

  /**
   * Dispatches the transfer a commitment determines, at the canonical temporal basis. From it, and until the
   * destination owner's commit, Logistics is the entity's sole authoritative movement locus. Dispatch is not
   * delivery: it writes nothing about the destination.
   */
  async dispatch(
    input: Publication & { readonly dispatch: unknown },
  ): Promise<Result<CommitOutcome, LogisticsErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = DispatchMovementInputSchema.safeParse(input.dispatch);
    if (!i.success) return invalid("dispatch", i.error);
    const requestFact = this.#store.getFact(i.data.request_key);
    const request = requestFact
      ? MovementServiceRequestSchema.safeParse(requestFact.value)
      : undefined;
    if (!requestFact || !request?.success) {
      return fail(
        "PREREQUISITE_MISSING",
        "no Movement Service Request is committed at the given key",
        {
          key: i.data.request_key,
        },
      );
    }
    const world = request.data.destination.world.entity_id;
    const entityId = request.data.subject.entity_id;
    const commitmentKey = logisticsCommitmentKey(world, entityId);
    const transferKey = logisticsTransferKey(world, entityId);
    const commitmentFact = this.#store.getFact(commitmentKey);
    const commitment = commitmentFact
      ? LogisticsCommitmentSchema.safeParse(commitmentFact.value)
      : undefined;
    if (!commitmentFact || !commitment?.success) {
      return fail(
        "PREREQUISITE_MISSING",
        "no movement-service commitment exists for this request",
        {
          key: commitmentKey,
        },
      );
    }
    const prior = this.#store.committedGroup(p.data.intent_id);
    const priorW = prior?.writes.find((w) => w.key === transferKey);
    let now;
    let reads: CommitGroup["reads"];
    let depends_on: readonly string[];
    let c: LogisticsCommitment = commitment.data;
    let commitmentVersion = commitmentFact.version;
    let transitioned: boolean;
    if (prior && priorW) {
      const was = LogisticsTransferSchema.safeParse(priorW.value);
      if (!was.success) return invalid("committed transfer", was.error);
      now = was.data.dispatched_at;
      commitmentVersion = was.data.commitment.version;
      // the commitment as it was when dispatched (it may since have been released)
      c = { ...c, state: { status: "COMMITTED" } };
      reads = prior.reads;
      depends_on = prior.depends_on;
      transitioned = false;
    } else {
      if (this.#store.getFact(transferKey)) {
        return fail("VERSION_CONFLICT", "a commitment dispatches one transfer: it already exists", {
          key: transferKey,
        });
      }
      const clockFact = this.#store.getFact(TEMPORAL_STATE_KEY);
      const clock = clockFact ? TemporalStateSchema.safeParse(clockFact.value) : undefined;
      if (!clockFact || !clock?.success) {
        return fail("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
          key: TEMPORAL_STATE_KEY,
        });
      }
      now = clock.data.canonical_time;
      const pinned = [commitmentKey, TEMPORAL_STATE_KEY];
      reads = pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 }));
      depends_on = [
        ...new Set(pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ];
      transitioned = this.#store.getFact(worldEntityTransitionKey(world, entityId)) !== undefined;
    }
    const derived = deriveTransfer({
      commitment: {
        key: commitmentKey,
        owner: commitmentFact.owner,
        version: commitmentVersion,
        value: c,
      },
      transitioned,
      now,
    });
    if (!derived.ok) return fail("INPUT_INVALID", derived.error.message, { key: transferKey });
    return this.#publish(
      p.data,
      "logistics_transfer",
      [{ key: transferKey, value: derived.value, expected_version: 0 }],
      reads,
      depends_on,
    );
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  commitment(
    worldId: string,
    entityId: string,
  ): { fact: OwnerFact; value: LogisticsCommitment } | undefined {
    return logisticsFactsOf(this.#store, worldId, entityId).commitment;
  }
  transfer(
    worldId: string,
    entityId: string,
  ): { fact: OwnerFact; value: LogisticsTransfer } | undefined {
    return logisticsFactsOf(this.#store, worldId, entityId).transfer;
  }
  delivery(worldId: string, entityId: string) {
    return logisticsFactsOf(this.#store, worldId, entityId).delivery;
  }
  /** Where is this entity currently? One authority at every stage. */
  currentLocus(worldId: string, entityId: string): ResolvedEntityLocus | undefined {
    return resolveEntityLocus(this.#store, worldId, entityId);
  }

  async #publish(
    p: Publication,
    kindId: "logistics_commitment" | "logistics_transfer",
    writes: readonly { key: string; value: unknown; expected_version: number }[],
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, LogisticsErrorCode>> {
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
