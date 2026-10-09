import {
  CANON_WRITE_AUTHORITY,
  EstablishExtractionBasisInputSchema,
  ExtractionBasisSchema,
  ProductionExtractionSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  PublicationSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  StartExtractionInputSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  fail,
  productionExtractionBasisKey,
  productionExtractionBoundaryId,
  productionExtractionKey,
  productionReserveKey,
  productionSourceAccountKey,
  productionSourceDeltaKey,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  type CanonicalTime,
  type CommitGroup,
  type ExtractionBasis,
  type OwnerFact,
  type ProductionExtraction,
  type Publication,
  type Result,
  type SchemaIssues,
  type SourceAccount,
  type SourceDelta,
  type TemporalObject,
  type WorldSourceCondition,
  type WorldSourceDelivery,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { extractionTemporalObject } from "./declaration.ts";
import { extractionPhase, parseAccount, type ExtractionPhase } from "./derive.ts";

export type SourceDrawdownErrorCode = StoreCommitErrorCode | "INPUT_INVALID";

interface Typed<T> {
  readonly fact: OwnerFact;
  readonly value: T;
}

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, { issues: issues(e) });

const byId = (a: { extraction_id: string }, b: { extraction_id: string }): number =>
  a.extraction_id < b.extraction_id ? -1 : a.extraction_id > b.extraction_id ? 1 : 0;

interface Pin {
  readonly key: string;
  readonly version: number;
}

/** What a start is built against: the pins of everything it rests on, the temporal basis and the account before. */
interface StartBasis {
  readonly request: Pin & { readonly owner: string };
  readonly basis: Pin;
  readonly source: Pin;
  readonly now: CanonicalTime;
  readonly account: SourceAccount | undefined;
  readonly accountVersion: number;
  readonly reads: CommitGroup["reads"];
  readonly depends_on: readonly string[];
}

/**
 * IM-05 Production — the acceptance path of an exact finite raw-source drawdown (WS-003 §§4, 4A, 4B).
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority, a governing rule,
 * a quantity, a source remainder or a Reserve increase: the quantity is the pinned request's, the rest comes from the
 * specification-backed registry and from the owners' own computations. There are exactly two authored publications:
 * establishing Production's own Capability / Access basis for one source key, and starting one extraction (the sealed
 * extraction and the key's account holding the commitment). The Source Delta, World-State's delivery and the Reserve
 * inflow are NOT methods here: they are the three IM-02 operations the coordinator resolves at the extraction's declared
 * boundary, in dependency order (`productionSourceDeltaProvider`, `worldSourceDeliveryProvider`,
 * `productionReserveInflowProvider`). There is no quantity setter, no source writer, no Reserve credit, no delivery and no
 * way to publish a remainder, so no caller can write Production-owned or World-State-owned drawdown state; the store's
 * admission refuses them for a raw commit as well.
 */
export class SourceDrawdownAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Establishes Production's Capability / Access basis for one source key. It pins the World-State Source Condition whose
   * physical access fact it relies on (a missing source is `PREREQUISITE_MISSING`; it is never created here).
   */
  establishBasis(
    input: Publication & { readonly extraction_basis: unknown },
  ): Promise<Result<CommitOutcome, SourceDrawdownErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const b = EstablishExtractionBasisInputSchema.safeParse(input.extraction_basis);
    if (!b.success) return Promise.resolve(invalid("basis", b.error));
    const sourceKey = worldSourceConditionKey(b.data.world_id, b.data.source_key);
    const srcFact = this.#store.getFact(sourceKey);
    const src = srcFact ? WorldSourceConditionSchema.safeParse(srcFact.value) : undefined;
    if (!srcFact || !src?.success)
      return Promise.resolve(
        fail("PREREQUISITE_MISSING", "the World-State Source Condition is not established", {
          key: sourceKey,
        }),
      );
    const value = ExtractionBasisSchema.safeParse({
      basis_id: b.data.basis_id,
      source: { fact_key: sourceKey, source_key: b.data.source_key },
      material_class: b.data.material_class,
      unit: b.data.unit,
      locality: src.data.locality,
      capability: {
        kind: "DIRECT_RAW_PHYSICAL_COLLECTION",
        support: {
          tier: "TIER_A_EMBEDDED_BASELINE",
          labor: "NON_MATERIAL_EMBEDDED",
          specialist_competence: "NON_MATERIAL",
        },
      },
      access: { mode: "DIRECT_PHYSICAL", relies_on: b.data.relies_on, encumbrance: "NONE" },
    });
    if (!value.success) return Promise.resolve(invalid("basis", value.error));
    return this.#publish(
      p.data,
      "production_extraction_basis",
      [
        {
          key: productionExtractionBasisKey(b.data.basis_id),
          value: value.data,
          expected_version: 0,
        },
      ],
      [{ key: sourceKey, version: srcFact.version }],
      [srcFact.provenance.group_id],
    );
  }

  /**
   * Starts one extraction on one request against one Source Condition and one destination Reserve: publishes the sealed
   * extraction and the key's account holding the commitment, atomically. Pins the request (a foreign fact, referenced),
   * the basis, the Source Condition, the Reserve and the canonical temporal basis it starts at. The extraction asks for
   * exactly the request's amount and unit; if the Source Condition's unclaimed exact quantity does not support it, or the
   * key has undelivered drawdown, the group is refused (`CLAIM_INCOMPATIBLE`) and nothing is recorded.
   *
   * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the group
   * is rebuilt on the basis it was committed against, so identical input reaches the original receipt, and a changed input
   * is refused as a conflict rather than silently reusing it.
   */
  async startExtraction(
    input: Publication & { readonly start: unknown },
  ): Promise<Result<CommitOutcome, SourceDrawdownErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const s = StartExtractionInputSchema.safeParse(input.start);
    if (!s.success) return invalid("start", s.error);
    const requestFact = this.#store.getFact(s.data.request_key);
    const request = requestFact ? ProductionRequestSchema.safeParse(requestFact.value) : undefined;
    if (!requestFact || !request?.success) {
      return fail("PREREQUISITE_MISSING", "no Production Request is committed at the given key", {
        key: s.data.request_key,
      });
    }
    const id = request.data.request_id;
    const sourceKey = worldSourceConditionKey(s.data.world_id, s.data.source_key);
    const extractionKey = productionExtractionKey(id);
    const accountKey = productionSourceAccountKey(s.data.world_id, s.data.source_key);
    const prior = this.#store.committedGroup(p.data.intent_id);
    const priorEx = prior?.writes.find((w) => w.key === extractionKey);
    const priorAccount = prior?.writes.find((w) => w.key === accountKey);

    let basis: StartBasis;
    if (prior && priorEx && priorAccount) {
      // reconcile by identity: rebuild on the committed basis
      const ex = ProductionExtractionSchema.safeParse(priorEx.value);
      const was = SourceAccountSchema.safeParse(priorAccount.value);
      if (!ex.success || !was.success)
        return invalid("committed extraction", (ex.success ? was : ex).error!);
      const open = was.data.open.filter((o) => o.extraction_id !== id);
      basis = {
        request: {
          key: ex.data.request.fact_key,
          version: ex.data.request.version,
          owner: ex.data.request.owner,
        },
        basis: { key: ex.data.basis.fact_key, version: ex.data.basis.version },
        source: { key: ex.data.source.fact_key, version: ex.data.source.version },
        now: ex.data.timing.started_at,
        account: priorAccount.expected_version === 0 ? undefined : { ...was.data, open },
        accountVersion: priorAccount.expected_version,
        reads: prior.reads,
        depends_on: prior.depends_on,
      };
    } else {
      if (this.#store.getFact(extractionKey)) {
        return fail("VERSION_CONFLICT", "a request fixes one extraction: it already exists", {
          extraction_id: id,
        });
      }
      const basisFact = this.#store.getFact(productionExtractionBasisKey(s.data.basis_id));
      const srcFact = this.#store.getFact(sourceKey);
      const reserveFact = this.#store.getFact(productionReserveKey(s.data.reserve_id));
      const clockFact = this.#store.getFact(TEMPORAL_STATE_KEY);
      const clock = clockFact ? TemporalStateSchema.safeParse(clockFact.value) : undefined;
      if (!basisFact)
        return fail("PREREQUISITE_MISSING", "the Capability / Access basis is not established", {
          key: productionExtractionBasisKey(s.data.basis_id),
        });
      if (!srcFact)
        return fail("PREREQUISITE_MISSING", "the World-State Source Condition is not established", {
          key: sourceKey,
        });
      if (!reserveFact)
        return fail("PREREQUISITE_MISSING", "the destination Reserve is not established", {
          key: productionReserveKey(s.data.reserve_id),
        });
      if (!clockFact || !clock?.success) {
        return fail("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
          key: TEMPORAL_STATE_KEY,
        });
      }
      const accountFact = this.#store.getFact(accountKey);
      const account = accountFact ? parseAccount(accountFact) : undefined;
      if (accountFact && !account)
        return fail("VALUE_INVALID", "the key's account is malformed", { key: accountKey });
      const pinnedKeys = [
        s.data.request_key,
        productionExtractionBasisKey(s.data.basis_id),
        sourceKey,
        productionReserveKey(s.data.reserve_id),
        TEMPORAL_STATE_KEY,
      ];
      basis = {
        request: { key: requestFact.key, version: requestFact.version, owner: requestFact.owner },
        basis: { key: basisFact.key, version: basisFact.version },
        source: { key: srcFact.key, version: srcFact.version },
        now: clock.data.canonical_time,
        account,
        accountVersion: accountFact?.version ?? 0,
        reads: pinnedKeys.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
        depends_on: [
          ...new Set(pinnedKeys.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
        ],
      };
    }

    // the exact quantity, the material and the locality are those of the pinned request and the committed Source Condition
    const srcFact = this.#store.getFact(sourceKey);
    const src = srcFact ? WorldSourceConditionSchema.safeParse(srcFact.value) : undefined;
    if (!srcFact || !src?.success)
      return fail("PREREQUISITE_MISSING", "the World-State Source Condition is not established", {
        key: sourceKey,
      });
    const quantity = request.data.requested_output.quantity;
    const entry = { extraction_id: id, quantity };
    const extraction = ProductionExtractionSchema.safeParse({
      extraction_id: id,
      request: {
        owner: basis.request.owner,
        fact_key: basis.request.key,
        request_id: id,
        version: basis.request.version,
      },
      basis: {
        fact_key: basis.basis.key,
        basis_id: s.data.basis_id,
        version: basis.basis.version,
      },
      source: {
        fact_key: basis.source.key,
        source_key: s.data.source_key,
        version: basis.source.version,
      },
      reserve: {
        fact_key: productionReserveKey(s.data.reserve_id),
        reserve_id: s.data.reserve_id,
      },
      account: { fact_key: accountKey },
      material_class: src.data.material_class,
      quantity,
      support_basis: {
        tier: "TIER_A_EMBEDDED_BASELINE",
        labor: "NON_MATERIAL_EMBEDDED",
        specialist_competence: "NON_MATERIAL",
      },
      timing: {
        started_at: basis.now,
        boundary: { boundary_id: productionExtractionBoundaryId(id), at: s.data.boundary_at },
      },
    });
    if (!extraction.success) return invalid("extraction", extraction.error);
    const nextAccount = SourceAccountSchema.safeParse(
      basis.account
        ? { ...basis.account, open: [...basis.account.open, entry].sort(byId) }
        : {
            source: { fact_key: sourceKey, source_key: s.data.source_key },
            locality: src.data.locality,
            material_class: src.data.material_class,
            unit: src.data.recoverable.unit,
            watermark: basis.now,
            open: [entry],
          },
    );
    if (!nextAccount.success) return invalid("account", nextAccount.error);
    return this.#publish(
      p.data,
      "production_extraction",
      [
        { key: extractionKey, value: extraction.data, expected_version: 0 },
        { key: accountKey, value: nextAccount.data, expected_version: basis.accountVersion },
      ],
      basis.reads,
      basis.depends_on,
    );
  }

  /** The temporal object an extraction's registration must be, derived from the committed extraction alone. */
  temporalObject(extractionId: string): TemporalObject | undefined {
    const ex = this.extraction(extractionId);
    const src = ex && this.#typed(ex.value.source.fact_key, WorldSourceConditionSchema);
    return ex && src
      ? extractionTemporalObject(ex.value, src.value.locality.world.entity_id)
      : undefined;
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  basis(basisId: string): Typed<ExtractionBasis> | undefined {
    return this.#typed(productionExtractionBasisKey(basisId), ExtractionBasisSchema);
  }
  extraction(extractionId: string): Typed<ProductionExtraction> | undefined {
    return this.#typed(productionExtractionKey(extractionId), ProductionExtractionSchema);
  }
  sourceDelta(extractionId: string): Typed<SourceDelta> | undefined {
    return this.#typed(productionSourceDeltaKey(extractionId), SourceDeltaSchema);
  }
  account(worldId: string, sourceKey: string): Typed<SourceAccount> | undefined {
    return this.#typed(productionSourceAccountKey(worldId, sourceKey), SourceAccountSchema);
  }
  /** The World-State Source Condition, net of every delivery World-State has committed. */
  sourceCondition(worldId: string, sourceKey: string): Typed<WorldSourceCondition> | undefined {
    return this.#typed(worldSourceConditionKey(worldId, sourceKey), WorldSourceConditionSchema);
  }
  delivery(worldId: string, extractionId: string): Typed<WorldSourceDelivery> | undefined {
    return this.#typed(worldSourceDeliveryKey(worldId, extractionId), WorldSourceDeliverySchema);
  }
  reserve(reserveId: string): Typed<ReturnType<typeof ProductionReserveSchema.parse>> | undefined {
    return this.#typed(productionReserveKey(reserveId), ProductionReserveSchema);
  }

  /**
   * Where the extraction's quantity is, derived from the facts that follow its commitment — never stored twice. The Reserve
   * is spendable only at `CREDITED`; at every earlier phase no output exists on the Production side.
   */
  phase(extractionId: string): ExtractionPhase {
    return extractionPhase((k) => this.#store.getFact(k), extractionId);
  }

  #typed<T>(key: string, schema: { parse(v: unknown): T }): Typed<T> | undefined {
    const fact = this.#store.getFact(key);
    return fact ? { fact, value: schema.parse(fact.value) } : undefined;
  }

  async #publish(
    p: Publication,
    kindId: "production_extraction_basis" | "production_extraction",
    writes: readonly { key: string; value: unknown; expected_version: number }[],
    reads: CommitGroup["reads"],
    depends_on: readonly string[],
  ): Promise<Result<CommitOutcome, SourceDrawdownErrorCode>> {
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
