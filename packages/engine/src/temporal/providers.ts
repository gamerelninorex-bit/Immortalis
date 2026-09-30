import type {
  CanonicalTime,
  JsonValue,
  OwnerFact,
  SourceRef,
  StageKey,
  TemporalRead,
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
    /** the governed object's last resolved basis */
    readonly from: CanonicalTime;
    /** the earned material boundary being resolved */
    readonly to: CanonicalTime;
    /** exact-partition elapsed coordinate over the span */
    readonly elapsed: number;
  };
  readonly reads: readonly ResolvedRead[];
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
  /** Pure and deterministic: identical input, identical writes. */
  compute(input: StageInput): readonly StageWrite[];
}

export class StageProviderRegistry {
  readonly #byOperation = new Map<string, StageProvider>();

  constructor(providers: readonly StageProvider[] = []) {
    for (const p of providers) this.register(p);
  }

  register(provider: StageProvider): void {
    const k = JSON.stringify([provider.owner, provider.operation]);
    if (this.#byOperation.has(k)) throw new Error(`duplicate stage provider ${k}`);
    this.#byOperation.set(k, provider);
  }

  find(owner: string, operation: string): StageProvider | undefined {
    return this.#byOperation.get(JSON.stringify([owner, operation]));
  }
}
