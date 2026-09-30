import {
  BoundaryIndexSchema,
  CANON_WRITE_AUTHORITY,
  ResolutionRequestSchema,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  PublicationSchema,
  compareTime,
  fail,
  ok,
  temporalObjectKey,
  temporalTransactionKey,
  timeAtOrBefore,
  timeEquals,
  timeBefore,
  type BoundaryIndex,
  type CanonicalTime,
  type CommitGroup,
  type CommitReceipt,
  type DependencyDeclaration,
  type Failure,
  type OwnerFact,
  type Publication,
  type ResolutionRequest,
  type ResolutionTransaction,
  type Result,
  type SchemaIssues,
  type SourceRef,
  type StageKey,
  type StageRecord,
  type TemporalObject,
  type TemporalRead,
  type TemporalState,
  type UnresolvedDependent,
  type UnresolvedReason,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { analyzeStageGraph, type GraphEdge, type GraphNode } from "./graph.ts";
import {
  stageGroupId,
  stageId,
  stageIntentId,
  transactionCause,
  transactionGroupId,
  transactionIntentId,
} from "./identity.ts";
import { exactElapsed } from "./partition.ts";
import type {
  ResolvedRead,
  StageProvider,
  StageProviderRegistry,
  StageWrite,
} from "./providers.ts";

export type TemporalErrorCode =
  | StoreCommitErrorCode
  | "INPUT_INVALID"
  | "TEMPORAL_STATE_ABSENT"
  | "TRANSACTION_CONFLICT"
  | "CONTINUATION_MISMATCH"
  | "CONTINUATION_HELD"
  | "NO_REMAINDER"
  | "TARGET_BEFORE_BASIS"
  | "UNIT_MISMATCH"
  | "CONDITION_NOT_REACHABLE"
  | "OBJECT_INVALID"
  | "EXECUTION_INVALID"
  | "PROVIDER_FAILED"
  | "STAGE_OUTPUT_MISMATCH";

/** Execution-only options. None of them is part of the transaction or of any identity. */
export interface AdvanceOptions {
  /** execution slice points inside the advance; never persisted, never identity, never a boundary */
  readonly slices?: readonly CanonicalTime[];
  /**
   * Inspection seam: called after a stage is staged and before its group is published, so a caller
   * can observe (or, in a test, change) what the stage read. Staged work is transient and is never
   * current truth.
   */
  readonly afterStaged?: (stage: StageKey) => Promise<void>;
}

export interface TransactionOutcome {
  readonly transaction: ResolutionTransaction;
  /** the transaction had already committed: nothing was re-resolved and nothing was written */
  readonly replayed: boolean;
  /** the receipt of the kernel group that recorded the transaction (RC-16) */
  readonly receipt: CommitReceipt;
  /** transient evidence: stages recomputed in place, under the same StageKey, before commit */
  readonly recomputed_in_place: readonly StageKey[];
  /** transient evidence: stages already committed (by an earlier attempt) and adopted, never redone */
  readonly adopted: readonly StageKey[];
  /** transient evidence: IM-11 rejections of staged groups (nothing was published for them) */
  readonly rejections: readonly { stage: StageKey; code: string }[];
}

interface Typed<T> {
  readonly fact: OwnerFact;
  readonly value: T;
}

/** A stage of the transaction's transient graph. */
interface Node extends GraphNode {
  readonly declaration: DependencyDeclaration;
  readonly objectKey: string;
  readonly object: TemporalObject;
  readonly provider: StageProvider | undefined;
  /**
   * For each CLOSE read (by source fact key): the group id of the producer commit that constitutes
   * the named close. Derived from the producer's StageKey alone.
   */
  readonly closeGroups: Map<string, string>;
}

type StageAttempt =
  | { readonly kind: "staged"; readonly staged: Staged }
  | { readonly kind: "unresolved"; readonly reason: UnresolvedReason }
  | { readonly kind: "mismatch"; readonly error: Failure<TemporalErrorCode> };

interface Staged {
  readonly group: CommitGroup;
  readonly reads: readonly TemporalRead[];
  /** the versions every read and invalidator had when the stage was computed */
  readonly inputs: ReadonlyMap<string, number>;
}

const failure = (code: TemporalErrorCode, message: string, details?: Record<string, unknown>) =>
  fail(code, message, details);

const issues = (error: SchemaIssues) =>
  error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);

const isStoreFatal = (code: string): boolean =>
  code === "UNKNOWN_OUTCOME" || code === "STORE_POISONED" || code === "STORE_CLOSED";

/**
 * IM-02 — Temporal / Dependency Coordinator.
 *
 * For one causally engaged ResolutionTransaction it begins from the canonical temporal basis, finds
 * the earliest earned boundary by querying the ACTIVE boundary index (never by scanning or polling
 * world state), imports the engaged objects' declared dependencies with their exact NOW/CLOSE reads,
 * materializes a transient stage-indexed graph, resolves only what its predecessors allow, publishes
 * each stage as the owner's own commit group through the existing IM-11/IM-17 store, and then commits
 * the transaction record, the new canonical time and the stop/remainder continuation in ONE kernel
 * group. It is coordination: it owns the shared temporal state and nothing else, and it never writes a
 * substantive world fact.
 *
 * Reuse, not replacement: every write — stage or kernel — goes through `store.commit`, so validation,
 * owner/facet enforcement, expected-version checks, RC-16 receipts, idempotent replay, unknown-outcome
 * reconciliation, the hash-chained journal and package persistence are the existing ones. There is no
 * second journal, save, sidecar or recovery identity.
 *
 * Retry and recovery are by identity. Stage and transaction identities are derived only from the
 * StageKey / caller-supplied transaction identity, so after a lost reply or a crash the same call
 * reaches the existing receipt; a stage that an earlier attempt already committed is adopted from the
 * journal, never recomputed under a newer source version and never recreated as a sibling.
 */
export class TemporalCoordinator {
  readonly #store: CampaignStore;
  readonly #providers: StageProviderRegistry;

  constructor(store: CampaignStore, providers: StageProviderRegistry) {
    this.#store = store;
    this.#providers = providers;
  }

  // -- typed reads (by identity; none scans) --------------------------------------------------

  state(): Typed<TemporalState> | undefined {
    const fact = this.#store.getFact(TEMPORAL_STATE_KEY);
    return fact ? { fact, value: TemporalStateSchema.parse(fact.value) } : undefined;
  }
  boundaryIndex(): BoundaryIndex {
    const fact = this.#store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY);
    return fact ? BoundaryIndexSchema.parse(fact.value) : { entries: [] };
  }
  object(objectId: string): Typed<TemporalObject> | undefined {
    const fact = this.#store.getFact(temporalObjectKey(objectId));
    return fact ? { fact, value: TemporalObjectSchema.parse(fact.value) } : undefined;
  }
  transaction(transactionId: string): Typed<ResolutionTransaction> | undefined {
    const fact = this.#store.getFact(temporalTransactionKey(transactionId));
    return fact ? { fact, value: ResolutionTransactionSchema.parse(fact.value) } : undefined;
  }

  // -- establishment and registration (explicit authored publications) --------------------------

  /**
   * Establishes the campaign's initial canonical temporal basis. The coordinate is authored input:
   * how a real campaign originates its time is not decided here. After this the basis moves only
   * through a committed ResolutionTransaction.
   */
  async establishCanonicalTime(
    input: Publication & { readonly time: unknown },
  ): Promise<Result<CommitOutcome, TemporalErrorCode>> {
    const p = PublicationSchema.safeParse({
      group_id: input.group_id,
      intent_id: input.intent_id,
      cause: input.cause,
      basis: input.basis,
      secrecy: input.secrecy,
    });
    if (!p.success)
      return failure("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const value = TemporalStateSchema.safeParse({
      canonical_time: input.time,
      last_transaction: null,
      continuation: null,
    });
    if (!value.success)
      return failure("INPUT_INVALID", "time failed validation", { issues: issues(value.error) });
    return this.#store.commit(
      this.#kernelGroup(p.data, [
        { key: TEMPORAL_STATE_KEY, value: value.data, expected_version: 0 },
      ]),
    );
  }

  /**
   * Registers one engaged-or-dormant temporal object. A boundary is indexed only when the object
   * carries one earned next boundary (F-014B §13); a dormant object has none and never enters the
   * index. Registration resolves nothing and advances nothing.
   */
  async registerObject(
    input: Publication & { readonly object: unknown },
  ): Promise<Result<CommitOutcome, TemporalErrorCode>> {
    const p = PublicationSchema.safeParse({
      group_id: input.group_id,
      intent_id: input.intent_id,
      cause: input.cause,
      basis: input.basis,
      secrecy: input.secrecy,
    });
    if (!p.success)
      return failure("INPUT_INVALID", "publication failed validation", { issues: issues(p.error) });
    const object = TemporalObjectSchema.safeParse(input.object);
    if (!object.success)
      return failure("INPUT_INVALID", "object failed validation", { issues: issues(object.error) });
    const state = this.state();
    if (!state)
      return failure("TEMPORAL_STATE_ABSENT", "no canonical temporal basis is established");
    const o = object.data;
    const writes: KernelWrite[] = [
      { key: temporalObjectKey(o.object_id), value: o, expected_version: 0 },
    ];
    if (o.next_boundary) {
      const indexFact = this.#store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY);
      const entries = [
        ...this.boundaryIndex().entries,
        {
          object_id: o.object_id,
          boundary_id: o.next_boundary.boundary_id,
          at: o.next_boundary.at,
        },
      ].sort(entryOrder);
      writes.push({
        key: TEMPORAL_BOUNDARY_INDEX_KEY,
        value: { entries },
        expected_version: indexFact?.version ?? 0,
      });
    }
    return this.#store.commit(
      this.#kernelGroup(p.data, writes, {
        reads: [{ key: TEMPORAL_STATE_KEY, version: state.fact.version }],
        depends_on: [state.fact.provenance.group_id],
      }),
    );
  }

  // -- the resolution transaction --------------------------------------------------------------

  /**
   * Continues the persisted stop: opens a new transaction from the committed stop basis toward the
   * remainder the state holds. The target is taken from the persisted continuation, not supplied, so
   * a continuation can neither replay the completed stage nor change what remained.
   */
  async continueRemainder(
    input: Omit<ResolutionRequest, "continues" | "requested">,
    options: AdvanceOptions = {},
  ): Promise<Result<TransactionOutcome, TemporalErrorCode>> {
    const held = this.state()?.value.continuation;
    if (!held || held.toward === null) {
      return failure("NO_REMAINDER", "the temporal state holds no remainder toward a target");
    }
    return this.advance(
      {
        ...input,
        continues: held.from_transaction,
        requested: { target: held.toward, condition: null },
      },
      options,
    );
  }

  async advance(
    rawRequest: unknown,
    options: AdvanceOptions = {},
  ): Promise<Result<TransactionOutcome, TemporalErrorCode>> {
    const parsed = ResolutionRequestSchema.safeParse(rawRequest);
    if (!parsed.success) {
      return failure("INPUT_INVALID", "resolution request failed validation", {
        issues: issues(parsed.error),
      });
    }
    const req = parsed.data;

    // Identity first: a transaction that already committed is returned, never re-resolved.
    const existing = this.transaction(req.transaction_id);
    if (existing) return this.#replay(req, existing);

    const stateTyped = this.state();
    if (!stateTyped)
      return failure("TEMPORAL_STATE_ABSENT", "no canonical temporal basis is established");
    const state = stateTyped.value;
    const t0 = state.canonical_time;
    const target = req.requested.target;

    if (target) {
      const c = compareTime(t0, target);
      if (c === null)
        return failure(
          "UNIT_MISMATCH",
          "the target is in a different unit than the canonical time",
        );
      if (c === 1)
        return failure(
          "TARGET_BEFORE_BASIS",
          "a target may not precede the canonical time: nothing is rewound",
        );
    }
    // A held continuation is consumed or it stays. This slice authorizes continuation and has no
    // cancellation/supersession mechanism, so unrelated progress cannot silently abandon it.
    const held = state.continuation;
    if (held && req.continues === null) {
      return failure(
        "CONTINUATION_HELD",
        "the temporal state holds an unresolved continuation; it must be consumed by the next transaction, not abandoned",
        { held: held.from_transaction },
      );
    }
    if (req.continues !== null) {
      if (
        !held ||
        held.from_transaction !== req.continues ||
        (held.toward !== null && (target === null || !timeEquals(held.toward, target)))
      ) {
        return failure(
          "CONTINUATION_MISMATCH",
          "a continuing transaction must consume exactly the persisted continuation",
        );
      }
    }
    const slices = options.slices ?? [];
    for (const s of slices) {
      if (compareTime(t0, s) === null)
        return failure("EXECUTION_INVALID", "an execution slice is in a different unit");
    }

    // Earliest causally relevant boundary: the ACTIVE index only (F-014B §6 step 2, §13). No whole-world
    // scan, no polling, and no object is read unless the index says its earned boundary is due.
    const index = this.boundaryIndex();
    for (const e of index.entries) {
      if (compareTime(t0, e.at) === null)
        return failure("UNIT_MISMATCH", "the boundary index is in a different unit");
    }
    const due = index.entries.filter((e) => (target ? timeAtOrBefore(e.at, target) : true));
    const cond = req.requested.condition;
    if (
      cond &&
      !due.some((e) => e.object_id === cond.object_id && e.boundary_id === cond.boundary_id)
    ) {
      return failure(
        "CONDITION_NOT_REACHABLE",
        "the stop condition names no due earned boundary; nothing was resolved",
      );
    }

    const instants = groupByInstant(due);
    const ctx: Run = {
      req,
      stateTyped,
      t0,
      slices,
      options,
      stages: [],
      ruleVersions: [kernelRule()],
      unresolved: [],
      resolved: [],
      engagedAll: [],
      recomputed: [],
      adopted: [],
      rejections: [],
    };

    let stop: CanonicalTime | undefined;
    let stopReason: ResolutionTransaction["outcome"]["stop_reason"] | undefined;
    for (const instant of instants) {
      const tb = instant[0]!.at;
      const r = await this.#resolveInstant(ctx, instant);
      if (!r.ok) return r;
      const reached = timeBefore(t0, tb) ? tb : t0;
      if (ctx.unresolved.length > 0) {
        stop = reached;
        stopReason = "DEPENDENCY_UNRESOLVED";
        break;
      }
      if (
        cond &&
        instant.some((e) => e.object_id === cond.object_id && e.boundary_id === cond.boundary_id)
      ) {
        stop = reached;
        stopReason = "CONDITION_SATISFIED";
        break;
      }
    }
    if (!stop || !stopReason) {
      // Nothing earned remains before the target: carry engaged stable state to it. The carry is exact
      // and lazy — objects with no boundary are not touched, because time advanced.
      if (!target)
        return failure("CONDITION_NOT_REACHABLE", "no target and the condition was not reached");
      stop = target;
      stopReason = "TARGET_REACHED";
    }
    return this.#commitTransaction(ctx, stop, stopReason);
  }

  // -- per-instant resolution ------------------------------------------------------------------

  async #resolveInstant(
    ctx: Run,
    instant: BoundaryIndex["entries"],
  ): Promise<Result<void, TemporalErrorCode>> {
    // 1. import the engaged objects: only the ones whose earned boundary is due.
    const nodes: Node[] = [];
    const objects = new Map<string, Typed<TemporalObject>>();
    const seenStage = new Set<string>();
    for (const e of instant) {
      const typed = this.object(e.object_id);
      if (
        !typed ||
        !typed.value.next_boundary ||
        typed.value.next_boundary.boundary_id !== e.boundary_id ||
        !timeEquals(typed.value.next_boundary.at, e.at)
      ) {
        return failure(
          "OBJECT_INVALID",
          "the boundary index names an object whose earned boundary it does not hold",
          { object_id: e.object_id },
        );
      }
      objects.set(e.object_id, typed);
      for (const d of typed.value.dependencies) {
        const id = stageId(d.stage);
        if (seenStage.has(id))
          return failure("OBJECT_INVALID", "a stage is declared by two engaged objects", {
            stage: d.stage,
          });
        seenStage.add(id);
        nodes.push({
          id,
          stage: d.stage,
          declaration: d,
          objectKey: temporalObjectKey(e.object_id),
          object: typed.value,
          provider: this.#providers.find(
            d.stage.owner_operation.owner,
            d.stage.owner_operation.operation,
          ),
          closeGroups: new Map(),
        });
      }
    }

    // 2. index the transient graph by stage identity; classify every read as NOW or named CLOSE.
    const producedBy = new Map<string, Node>();
    for (const n of nodes) for (const k of n.declaration.produces) producedBy.set(k, n);
    const edges: GraphEdge[] = [];
    const pre = new Map<string, UnresolvedReason>();
    const block = (n: Node, reason: UnresolvedReason) => {
      if (!pre.has(n.id)) pre.set(n.id, reason);
    };
    for (const n of nodes) {
      if (!n.provider) block(n, "PROVIDER_ABSENT");
      for (const r of n.declaration.reads) {
        const producer = producedBy.get(r.source.fact_key);
        if (producer) {
          if (producer.declaration.stage.owner_operation.owner !== r.source.owner)
            block(n, "SOURCE_OWNER_MISMATCH");
          if (r.mode === "AS-OF-DECLARED-CLOSE") {
            // The Close Basis must be the one the PRODUCER declares: a horizon or slice token cannot stand in.
            const declared = producer.declaration.declares_close;
            if (
              !declared ||
              declared.name !== r.close_basis.name ||
              !canonicalEqual(r.close_basis.producer, producer.stage.owner_operation)
            ) {
              block(n, "CLOSE_BASIS_UNDECLARED");
            }
            n.closeGroups.set(r.source.fact_key, stageGroupId(producer.stage));
          }
          edges.push({
            from: producer.id,
            to: n.id,
            mode: r.mode === "AS-OF-NOW" ? "NOW" : "CLOSE",
          });
        } else if (r.mode === "AS-OF-DECLARED-CLOSE") {
          block(n, "PREDECESSOR_ABSENT");
        } else {
          const fact = this.#store.getFact(r.source.fact_key);
          if (!fact) block(n, "SOURCE_ABSENT");
          else if (fact.owner !== r.source.owner) block(n, "SOURCE_OWNER_MISMATCH");
        }
      }
    }
    const analysis = analyzeStageGraph(nodes, edges, pre);

    // 3. resolve in dependency order; incomparable work is independent, and a blocked component does
    // not stop independent components.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const done = new Set<string>();
    const dead = new Map<string, UnresolvedReason>(analysis.blocked);
    for (const id of analysis.order) {
      const n = byId.get(id)!;
      if (edges.some((e) => e.to === id && dead.has(e.from))) {
        dead.set(id, "PREDECESSOR_BLOCKED");
        continue;
      }
      const r = await this.#resolveStage(ctx, n, instant[0]!.at);
      if (!r.ok) return r;
      if (r.value === "RESOLVED") done.add(id);
      else dead.set(id, r.value);
    }
    for (const n of nodes) {
      const reason = dead.get(n.id);
      if (reason) ctx.unresolved.push({ stage: n.stage, reason });
    }

    // 4. every object whose due boundary was selected is causally engaged (RC-05). It is RETIRED only
    // when every stage it declared is committed; otherwise it stays due, untouched, and is recorded as
    // STILL_ACTIVE.
    for (const e of instant) {
      const typed = objects.get(e.object_id)!;
      const retired = nodes
        .filter((n) => n.objectKey === temporalObjectKey(e.object_id))
        .every((n) => done.has(n.id));
      ctx.engagedAll.push({ typed, entry: e, retired });
      if (retired) ctx.resolved.push({ typed, entry: e });
    }
    return ok(undefined);
  }

  /** Resolves one stage; returns RESOLVED, or the reason it is unresolved. Store-fatal errors propagate. */
  async #resolveStage(
    ctx: Run,
    node: Node,
    tb: CanonicalTime,
  ): Promise<Result<"RESOLVED" | UnresolvedReason, TemporalErrorCode>> {
    const intentId = stageIntentId(node.stage);

    // A committed stage is never recreated, recomputed or re-published: adopt it from the journal.
    const receipt = this.#store.lookupReceipt(intentId);
    if (receipt) {
      const record = this.#adopt(node, receipt);
      if (!record.ok) return record;
      ctx.stages.push(record.value);
      ctx.adopted.push(node.stage);
      pushRule(ctx, this.#store.committedGroup(intentId)!.rule);
      return ok("RESOLVED");
    }

    // Stage (transient), let an observer see it, and recompute IN PLACE under the same StageKey if an
    // unresolved source changed before commit. A recompute is never a sibling stage: identity does
    // not involve the source version.
    let staged: Staged;
    for (;;) {
      const s = this.#stage(ctx, node, tb);
      if (s.kind === "mismatch") return { ok: false, error: s.error };
      if (s.kind === "unresolved") return ok(s.reason);
      staged = s.staged;
      await ctx.options.afterStaged?.(node.stage);
      if (!this.#stale(staged)) break;
      ctx.recomputed.push(node.stage);
    }

    const committed = await this.#store.commit(staged.group);
    if (!committed.ok) {
      if (isStoreFatal(committed.error.code)) return committed;
      // IM-11 rejected the group: nothing was published or credited; dependents wait, independents proceed.
      ctx.rejections.push({ stage: node.stage, code: committed.error.code });
      return ok("VALIDATION_REJECTED");
    }
    ctx.stages.push(this.#record(node.stage, staged.group, staged.reads, committed.value.receipt));
    pushRule(ctx, staged.group.rule);
    return ok("RESOLVED");
  }

  /** Builds the staged group for a stage against the CURRENT committed state. Pure apart from reads. */
  #stage(ctx: Run, node: Node, tb: CanonicalTime): StageAttempt {
    const unresolved = (reason: UnresolvedReason): StageAttempt => ({ kind: "unresolved", reason });
    const provider = node.provider!;
    const reads: ResolvedRead[] = [];
    const inputs = new Map<string, number>();
    for (const r of node.declaration.reads) {
      const fact = this.#store.getFact(r.source.fact_key);
      if (!fact) return unresolved("SOURCE_ABSENT");
      if (fact.owner !== r.source.owner) return unresolved("SOURCE_OWNER_MISMATCH");
      if (r.mode === "AS-OF-DECLARED-CLOSE") {
        // AS-OF-DECLARED-CLOSE reads the named producer close itself, not whatever came after it.
        if (fact.provenance.group_id !== node.closeGroups.get(r.source.fact_key)) {
          return unresolved("CLOSE_SOURCE_ADVANCED");
        }
      }
      reads.push({
        read: {
          ...r,
          source_basis: { version: fact.version, committed_by: fact.provenance.group_id },
        } as TemporalRead,
        fact,
      });
      inputs.set(r.source.fact_key, fact.version);
      for (const inv of r.invalidators)
        inputs.set(inv.fact_key, this.#store.getFact(inv.fact_key)?.version ?? 0);
    }
    const from = node.object.last_resolved_basis;
    const elapsed = exactElapsed(from, tb, ctx.slices);
    let writes: readonly StageWrite[];
    try {
      writes = provider.compute({
        stage: node.stage,
        produces: node.declaration.produces,
        span: { from, to: tb, elapsed },
        reads,
      });
    } catch (e) {
      // An owner adapter that throws has published nothing; the stage is not credited and the
      // transaction fails closed rather than committing a partial consequence.
      return {
        kind: "mismatch",
        error: failure("PROVIDER_FAILED", "the owner operation failed", { cause: String(e) }).error,
      };
    }
    const produced = [...node.declaration.produces].sort();
    if (!canonicalEqual(writes.map((w) => w.key).sort(), produced)) {
      return {
        kind: "mismatch",
        error: failure(
          "STAGE_OUTPUT_MISMATCH",
          "an owner operation must write exactly the facts its declaration produces",
          {
            stage: node.stage,
          },
        ).error,
      };
    }
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: stageGroupId(node.stage),
      intent_id: stageIntentId(node.stage),
      owner: provider.owner,
      facet: provider.facet,
      cause: transactionCause(ctx.req.transaction_id),
      rule: provider.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      // One entry per declared read, in declared order: `reads[i]` pins the version read and
      // `depends_on[i]` the group that committed it, so the evidence can be rebuilt from the journal.
      reads: reads.map((r) => ({ key: r.fact.key, version: r.fact.version })),
      depends_on: reads.map((r) => r.fact.provenance.group_id),
      writes: writes.map((w) => ({
        key: w.key,
        owner: provider.owner,
        facet: provider.facet,
        value: w.value,
        unit: w.unit,
        basis: w.basis,
        secrecy: w.secrecy,
        expected_version: this.#store.getFact(w.key)?.version ?? 0,
      })),
    };
    return { kind: "staged", staged: { group, reads: reads.map((r) => r.read), inputs } };
  }

  /** True when any source a staged stage read, or declared as an invalidator, is no longer at that version. */
  #stale(staged: Staged): boolean {
    for (const [key, version] of staged.inputs) {
      if ((this.#store.getFact(key)?.version ?? 0) !== version) return true;
    }
    return false;
  }

  #record(
    stage: StageKey,
    group: CommitGroup,
    reads: readonly TemporalRead[],
    receipt: CommitReceipt,
  ): StageRecord {
    return {
      stage,
      reads: [...reads],
      group_id: group.group_id,
      intent_id: group.intent_id,
      revision: receipt.revision,
      group_sha256: receipt.group_sha256,
      writes: group.writes.map((w) => ({ key: w.key, version: w.expected_version + 1 })),
      validation: { invariants: receipt.invariants.map((i) => i.name) },
    };
  }

  /** Rebuilds a committed stage's evidence from the journal (IM-12 cold-history lookup). */
  #adopt(node: Node, receipt: CommitReceipt): Result<StageRecord, TemporalErrorCode> {
    const group = this.#store.committedGroup(receipt.intent_id);
    const decl = node.declaration.reads;
    if (
      !group ||
      group.group_id !== stageGroupId(node.stage) ||
      group.reads.length !== decl.length ||
      group.depends_on.length !== decl.length ||
      group.reads.some((r, i) => r.key !== decl[i]!.source.fact_key)
    ) {
      return failure("OBJECT_INVALID", "a committed stage does not match its declaration", {
        stage: node.stage,
      });
    }
    const reads = decl.map(
      (d, i) =>
        ({
          ...d,
          source_basis: { version: group.reads[i]!.version, committed_by: group.depends_on[i]! },
        }) as TemporalRead,
    );
    return ok(this.#record(node.stage, group, reads, receipt));
  }

  // -- commit of the transaction ----------------------------------------------------------------

  async #commitTransaction(
    ctx: Run,
    stop: CanonicalTime,
    stopReason: ResolutionTransaction["outcome"]["stop_reason"],
  ): Promise<Result<TransactionOutcome, TemporalErrorCode>> {
    const { req, stateTyped, t0 } = ctx;
    const target = req.requested.target;
    const remainder = target && timeBefore(stop, target) ? { from: stop, to: target } : null;
    const unresolved = dedupe(ctx.unresolved);
    const resolved = [...ctx.resolved].sort((a, b) =>
      a.entry.object_id < b.entry.object_id ? -1 : 1,
    );

    const transaction: ResolutionTransaction = {
      transaction_id: req.transaction_id,
      cause: req.cause,
      trigger: req.trigger,
      continues: req.continues,
      opening: { basis_time: t0, state_version: stateTyped.fact.version },
      requested: req.requested,
      context: req.context,
      engaged: [...ctx.engagedAll]
        .sort((a, b) => (a.entry.object_id < b.entry.object_id ? -1 : 1))
        .map((r) =>
          r.retired
            ? {
                boundary: "RETIRED" as const,
                object_id: r.entry.object_id,
                fact_key: temporalObjectKey(r.entry.object_id),
                version_before: r.typed.fact.version,
                version_after: r.typed.fact.version + 1,
              }
            : {
                boundary: "STILL_ACTIVE" as const,
                object_id: r.entry.object_id,
                fact_key: temporalObjectKey(r.entry.object_id),
                version_before: r.typed.fact.version,
              },
        ),
      boundaries_crossed: resolved.map((r) => ({
        object_id: r.entry.object_id,
        boundary_id: r.entry.boundary_id,
        at: r.entry.at,
      })),
      stages: ctx.stages,
      rule_versions: ctx.ruleVersions,
      outcome: {
        actual_stop: stop,
        stop_reason: stopReason,
        remainder,
        unresolved_dependents: unresolved,
      },
    };
    const checked = ResolutionTransactionSchema.safeParse(transaction);
    if (!checked.success) {
      return failure(
        "INPUT_INVALID",
        "the resolved transaction is not a valid ResolutionTransaction",
        { issues: issues(checked.error) },
      );
    }

    const nextState: TemporalState = {
      canonical_time: stop,
      last_transaction: req.transaction_id,
      continuation:
        remainder || unresolved.length > 0
          ? {
              from_transaction: req.transaction_id,
              toward: remainder ? remainder.to : null,
              unresolved_dependents: unresolved,
            }
          : null,
    };
    const writes: KernelWrite[] = [
      { key: temporalTransactionKey(req.transaction_id), value: checked.data, expected_version: 0 },
      { key: TEMPORAL_STATE_KEY, value: nextState, expected_version: stateTyped.fact.version },
    ];
    for (const r of resolved) {
      writes.push({
        key: temporalObjectKey(r.entry.object_id),
        value: {
          ...r.typed.value,
          last_resolved_basis: r.entry.at,
          next_boundary: null,
        },
        expected_version: r.typed.fact.version,
      });
    }
    if (resolved.length > 0) {
      const engagedIds = new Set(resolved.map((r) => r.entry.object_id));
      const indexFact = this.#store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)!;
      writes.push({
        key: TEMPORAL_BOUNDARY_INDEX_KEY,
        value: {
          entries: this.boundaryIndex().entries.filter((e) => !engagedIds.has(e.object_id)),
        },
        expected_version: indexFact.version,
      });
    }
    const group = this.#kernelGroup(
      {
        group_id: transactionGroupId(req.transaction_id),
        intent_id: transactionIntentId(req.transaction_id),
        cause: transactionCause(req.transaction_id),
        basis: req.publication.basis,
        secrecy: req.publication.secrecy,
      },
      writes,
      {
        reads: [{ key: TEMPORAL_STATE_KEY, version: stateTyped.fact.version }],
        depends_on: [stateTyped.fact.provenance.group_id, ...ctx.stages.map((s) => s.group_id)],
      },
    );
    const committed = await this.#store.commit(group);
    if (!committed.ok) return committed;
    return ok({
      transaction: checked.data,
      replayed: committed.value.replayed,
      receipt: committed.value.receipt,
      recomputed_in_place: ctx.recomputed,
      adopted: ctx.adopted,
      rejections: ctx.rejections,
    });
  }

  #replay(
    req: ResolutionRequest,
    existing: Typed<ResolutionTransaction>,
  ): Result<TransactionOutcome, TemporalErrorCode> {
    const t = existing.value;
    const same =
      t.cause === req.cause &&
      canonicalEqual(t.trigger, req.trigger) &&
      t.continues === req.continues &&
      canonicalEqual(t.requested, req.requested) &&
      canonicalEqual(t.context, req.context) &&
      this.#publicationMatches(req, existing);
    if (!same) {
      return failure(
        "TRANSACTION_CONFLICT",
        "this transaction identity already committed with different content",
        {
          transaction_id: req.transaction_id,
        },
      );
    }
    const receipt = this.#store.lookupReceipt(transactionIntentId(req.transaction_id));
    if (!receipt)
      return failure("OBJECT_INVALID", "a committed transaction has no receipt", {
        transaction_id: req.transaction_id,
      });
    return ok({
      transaction: t,
      replayed: true,
      receipt,
      recomputed_in_place: [],
      adopted: [],
      rejections: [],
    });
  }

  /**
   * The immutable publication metadata (RC-02 `basis`, `secrecy`) of a committed transaction is part
   * of its identity: it is compared with the authoritative committed fact and with the journaled
   * group, never with the caller's claim alone.
   */
  #publicationMatches(req: ResolutionRequest, existing: Typed<ResolutionTransaction>): boolean {
    const { basis, secrecy } = req.publication;
    if (existing.fact.basis !== basis || existing.fact.secrecy !== secrecy) return false;
    const group = this.#store.committedGroup(transactionIntentId(req.transaction_id));
    return group !== null && group.writes.every((w) => w.basis === basis && w.secrecy === secrecy);
  }

  // -- kernel group assembly --------------------------------------------------------------------

  #kernelGroup(
    p: Publication,
    writes: readonly KernelWrite[],
    extra: { reads?: CommitGroup["reads"]; depends_on?: readonly string[] } = {},
  ): CommitGroup {
    const kind = factKind("temporal_state");
    return {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [...(extra.reads ?? [])],
      depends_on: [...new Set(extra.depends_on ?? [])],
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
  }
}

interface KernelWrite {
  readonly key: string;
  readonly value: unknown;
  readonly expected_version: number;
}

/** Per-transaction working set. Transient: none of it outlives the call except what the kernel group commits. */
interface Run {
  readonly req: ResolutionRequest;
  readonly stateTyped: Typed<TemporalState>;
  readonly t0: CanonicalTime;
  readonly slices: readonly CanonicalTime[];
  readonly options: AdvanceOptions;
  readonly stages: StageRecord[];
  readonly ruleVersions: SourceRef[];
  readonly unresolved: UnresolvedDependent[];
  /** objects whose boundary was retired (the only ones ever mutated) */
  readonly resolved: { typed: Typed<TemporalObject>; entry: BoundaryIndex["entries"][number] }[];
  /** every causally engaged object, retired or still active */
  readonly engagedAll: {
    typed: Typed<TemporalObject>;
    entry: BoundaryIndex["entries"][number];
    retired: boolean;
  }[];
  readonly recomputed: StageKey[];
  readonly adopted: StageKey[];
  readonly rejections: { stage: StageKey; code: string }[];
}

const kernelRule = (): SourceRef => factKind("temporal_state").rule;

function pushRule(ctx: Run, rule: SourceRef): void {
  if (!ctx.ruleVersions.some((r) => canonicalEqual(r, rule))) ctx.ruleVersions.push(rule);
}

const entryOrder = (
  a: { at: CanonicalTime; object_id: string },
  b: { at: CanonicalTime; object_id: string },
): number =>
  a.at.value !== b.at.value
    ? a.at.value - b.at.value
    : a.object_id < b.object_id
      ? -1
      : a.object_id > b.object_id
        ? 1
        : 0;

function groupByInstant(entries: BoundaryIndex["entries"]): BoundaryIndex["entries"][] {
  const out: BoundaryIndex["entries"][] = [];
  for (const e of entries) {
    const last = out[out.length - 1];
    if (last && timeEquals(last[0]!.at, e.at)) last.push(e);
    else out.push([e]);
  }
  return out;
}

const dedupe = (list: readonly UnresolvedDependent[]): UnresolvedDependent[] => {
  const seen = new Set<string>();
  return list.filter((u) => {
    const k = stageId(u.stage);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};
