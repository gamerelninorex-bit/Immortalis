import type {
  CanonicalTime,
  DependencyDeclaration,
  JsonValue,
  OwnerFact,
  PendingConsequenceBarrier,
  Pcb01Evidence,
  ResolutionRequest,
  Result,
  SourceRef,
  StageKey,
  TemporalRead,
  UnresolvedReason,
} from "@immortalis/contracts";

/**
 * The IM-03 owner-adapter seam of the temporal coordinator. IM-02 coordinates; it is never a
 * substantive owner. Whatever a stage computes is computed by the owner operation that the governing
 * source assigns it, and is published only as that owner's facts through the existing commit core.
 * The coordinator never invents, copies or reinterprets an owner's value.
 */
export interface ResolvedRead {
  /** the realized RC-03 read, with the exact source version/provenance it was taken at */
  readonly read: TemporalRead;
  /** the committed fact observed (its value is the read's value; foreign facts are referenced, not copied) */
  readonly fact: OwnerFact;
}

export interface StageInput {
  readonly stage: StageKey;
  /** the owner-fact keys this stage's declaration says the operation writes (and must write, exactly) */
  readonly produces: readonly string[];
  readonly span: {
    /** the governed object's last resolved basis, or the event trigger's current basis */
    readonly from: CanonicalTime;
    /** the earned material boundary, or the unchanged current event-trigger basis */
    readonly to: CanonicalTime;
    /** exact-partition elapsed coordinate over the span */
    readonly elapsed: number;
  };
  readonly reads: readonly ResolvedRead[];
  /**
   * The committed current facts of the keys this stage produces (its owner's own prior state), by key.
   * A stage's own prior state is not a temporal read of another stage; this is how an owner operation
   * advances its own facts without declaring a self-edge in the graph.
   */
  readonly prior: ReadonlyMap<string, OwnerFact>;
}

/**
 * An owner operation that cannot lawfully produce a result at this basis throws this: the stage is not
 * credited, its dependents wait, independent stages proceed (F-017 §4). It is the owner's way to fail
 * closed, e.g. on mixed-time inputs, without publishing anything.
 */
export class StageUnresolvedError extends Error {
  readonly reason: UnresolvedReason;
  constructor(reason: UnresolvedReason, message: string) {
    super(message);
    this.name = "StageUnresolvedError";
    this.reason = reason;
  }
}

/** One proposed owner write. `expected_version` is the coordinator's, from committed state. */
export interface StageWrite {
  readonly key: string;
  readonly value: JsonValue;
  readonly unit: string | null;
  readonly basis: string;
  readonly secrecy: string;
}

export interface StageProvider {
  /** the substantive owner/facet and the operation it exposes */
  readonly owner: string;
  readonly facet: string;
  readonly operation: string;
  /** governing rule/method the owner's groups are written under (RC-01, RC-07) */
  readonly rule: SourceRef;
  /**
   * F-017 §§3–4: an owner may qualify one current-state event trigger without
   * inventing an indexed time boundary. This bounded seam supports one NOW-only
   * stage, with no elapsed process, close, reconciliation or downstream action.
   * The owner derives its declaration from committed facts; callers supply none.
   */
  readonly eventTrigger?: {
    readonly kind: string;
    derive(
      request: ResolutionRequest,
      at: CanonicalTime,
      getFact: (key: string) => OwnerFact | undefined,
    ): Result<{ readonly sourceKey: string; readonly declaration: DependencyDeclaration }, string>;
  };
  /** Pure and deterministic: identical input, identical writes. */
  compute(input: StageInput): readonly StageWrite[];
}

export class StageProviderRegistry {
  readonly #byOperation = new Map<string, StageProvider>();
  readonly #byTrigger = new Map<string, StageProvider>();

  constructor(providers: readonly StageProvider[] = []) {
    for (const p of providers) this.register(p);
  }

  register(provider: StageProvider): void {
    const k = JSON.stringify([provider.owner, provider.operation]);
    if (this.#byOperation.has(k)) throw new Error(`duplicate stage provider ${k}`);
    if (provider.eventTrigger && this.#byTrigger.has(provider.eventTrigger.kind))
      throw new Error(`duplicate stage trigger ${provider.eventTrigger.kind}`);
    this.#byOperation.set(k, provider);
    if (provider.eventTrigger) this.#byTrigger.set(provider.eventTrigger.kind, provider);
  }

  find(owner: string, operation: string): StageProvider | undefined {
    return this.#byOperation.get(JSON.stringify([owner, operation]));
  }

  forTrigger(kind: string): StageProvider | undefined {
    return this.#byTrigger.get(kind);
  }
}

/**
 * PCB-01 evaluation seam (IM-02 ↔ IM-04). The coordinator decides WHEN a barrier is consulted — only
 * for an engaged consumer — and what follows; the Population adapter decides what its own pending
 * consequences are. Pure reads by identity: it never scans and never writes.
 */
export type BarrierEvaluation =
  | { readonly due: true; readonly envelope_ids: readonly string[] }
  | { readonly due: false; readonly reason: string };

export interface ConsequenceBarrierEvaluator {
  evaluate(
    barrier: PendingConsequenceBarrier,
    instant: CanonicalTime,
    getFact: (key: string) => OwnerFact | undefined,
  ): BarrierEvaluation;
  /**
   * The retained evidence of a due reconciliation, derived from what its committed stage group wrote
   * (`valueOf`), or null when no frozen condition is supported. The same derivation verifies a recorded
   * claim at admission and on load.
   */
  evidence(
    barrier: PendingConsequenceBarrier,
    instant: CanonicalTime,
    valueOf: (key: string) => unknown,
  ): Pcb01Evidence | null;
  /**
   * When no reconciliation is due, the consumer reads the latest committed close. True only if `fact`
   * is a stamped Population close artifact of the barrier's own close basis and ledger.
   */
  closeSourceLawful(
    barrier: PendingConsequenceBarrier,
    fact: OwnerFact,
    getFact: (key: string) => OwnerFact | undefined,
  ): boolean;
}
