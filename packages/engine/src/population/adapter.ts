import {
  CANON_WRITE_AUTHORITY,
  CohortFactSchema,
  CohortRefSchema,
  EstablishLedgerInputSchema,
  OWNER_POPULATION,
  PopulationBasisSchema,
  PublicationSchema,
  ReconciliationCloseSchema,
  canonicalJson,
  fail,
  ok,
  populationCloseKey,
  populationCohortKey,
  populationLedgerKey,
  timeEquals,
  worldLocusKey,
  worldProfileKey,
  type CohortFact,
  type CommitGroup,
  type OwnerFact,
  type PopulationBasis,
  type Publication,
  type ReconciliationClose,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";

export type PopulationErrorCode = StoreCommitErrorCode | "INPUT_INVALID" | "VIEW_UNAVAILABLE";

interface Typed<T> {
  readonly fact: OwnerFact;
  readonly value: T;
}

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, { issues: issues(e) });

/**
 * IM-04 Population / Cohort Adapter — the acceptance path of the Population owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a
 * governing rule: those come from the specification-backed registry, and every publication is made by the
 * archivist path and committed through the existing IM-11/IM-12/IM-17 store (one journal, one canon).
 * Population state advances only by an ordinary reconciliation, which is NOT a method here: it is the
 * `populationStageProvider` operation the IM-02 coordinator resolves when the reconciliation is engaged.
 * There is no ledger "update", no count setter and no Cohort-result writer, so no caller can write
 * Population-owned count or membership; the store's admission refuses it for a raw commit as well.
 */
export class PopulationAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Establishes one disjoint resident population attached to an already-committed canonical world locus.
   * The units are authored (synthetic in the testkit); Population does not generate them.
   */
  establishLedger(
    input: Publication & { readonly ledger: unknown },
  ): Promise<Result<CommitOutcome, PopulationErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const l = EstablishLedgerInputSchema.safeParse(input.ledger);
    if (!l.success) return Promise.resolve(invalid("ledger", l.error));
    const worldKey = worldProfileKey(l.data.world_id);
    const locusKey = worldLocusKey(l.data.world_id, l.data.locus_id);
    const basis = PopulationBasisSchema.safeParse({
      ledger_id: l.data.ledger_id,
      unit_class: l.data.unit_class,
      count_custodian: OWNER_POPULATION,
      locality: {
        world: { fact_key: worldKey, entity_id: l.data.world_id },
        locus: { fact_key: locusKey, entity_id: l.data.locus_id },
      },
      overlap: "DISJOINT_RESIDENT_POPULATION",
      units: [...l.data.units].sort((a, b) => (a.unit_id < b.unit_id ? -1 : 1)),
      count: { semantics: "EXACT", count: l.data.units.length },
      consumed_envelopes: [],
      basis_stamp: { basis: { kind: "ESTABLISHMENT", point: l.data.point }, constituents: [] },
    });
    if (!basis.success) return Promise.resolve(invalid("ledger", basis.error));
    return this.#publish(p.data, populationLedgerKey(l.data.ledger_id), basis.data, [
      worldKey,
      locusKey,
    ]);
  }

  /** Instantiates one Cohort reference (RC-12) of an established ledger. Its result is composed later. */
  instantiateCohort(
    input: Publication & { readonly ref: unknown },
  ): Promise<Result<CommitOutcome, PopulationErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const ref = CohortRefSchema.safeParse(input.ref);
    if (!ref.success) return Promise.resolve(invalid("Cohort reference", ref.error));
    const value: CohortFact = { ref: ref.data, result: null };
    return this.#publish(
      p.data,
      populationCohortKey(ref.data.scope.ledger_id, ref.data.cohort_id),
      value,
      [populationLedgerKey(ref.data.scope.ledger_id)],
    );
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  ledger(ledgerId: string): Typed<PopulationBasis> | undefined {
    const fact = this.#store.getFact(populationLedgerKey(ledgerId));
    return fact ? { fact, value: PopulationBasisSchema.parse(fact.value) } : undefined;
  }
  close(ledgerId: string): Typed<ReconciliationClose> | undefined {
    const fact = this.#store.getFact(populationCloseKey(ledgerId));
    return fact ? { fact, value: ReconciliationCloseSchema.parse(fact.value) } : undefined;
  }
  cohort(ledgerId: string, cohortId: string): Typed<CohortFact> | undefined {
    const fact = this.#store.getFact(populationCohortKey(ledgerId, cohortId));
    return fact ? { fact, value: CohortFactSchema.parse(fact.value) } : undefined;
  }

  /**
   * A consumer's read of a Population-produced Cohort view (WS-015 §VII, §XVI). Lawful only for the result
   * stamped with the LATEST ordinary close and the ledger version that close produced — the stamp and its
   * constituents are the validation. It is never revalidated, rederived or "refreshed" against a later
   * current criterion: a mismatch is unavailable, not a mixed-time answer.
   */
  cohortView(ledgerId: string, cohortId: string): Result<CohortFact, PopulationErrorCode> {
    const c = this.cohort(ledgerId, cohortId);
    const close = this.close(ledgerId);
    const ledger = this.ledger(ledgerId);
    const basis = c?.value.result?.basis_stamp.basis;
    if (!c || !close || !ledger || !c.value.result || basis?.kind !== "RECONCILIATION_CLOSE") {
      return fail("VIEW_UNAVAILABLE", "no composed, close-stamped view exists");
    }
    const ledgerStamp = c.value.result.basis_stamp.constituents.find(
      (k) => k.key === populationLedgerKey(ledgerId),
    );
    if (
      canonicalJson(basis.close_basis) !== canonicalJson(close.value.close_basis) ||
      !timeEquals(basis.resolution_point, close.value.resolution_point) ||
      ledgerStamp?.version !== ledger.fact.version
    ) {
      return fail("VIEW_UNAVAILABLE", "the view is not stamped with the latest ordinary close");
    }
    return ok(c.value);
  }

  async #publish(
    p: Publication,
    key: string,
    value: unknown,
    prerequisiteKeys: readonly string[],
  ): Promise<Result<CommitOutcome, PopulationErrorCode>> {
    // the kind is the one whose key space contains the key — never inferred from the key's spelling
    const kind = resolveKey(key)!.kind;
    const reads = prerequisiteKeys.map((k) => ({
      key: k,
      version: this.#store.getFact(k)?.version ?? 0,
    }));
    const depends_on = prerequisiteKeys.flatMap((k) => {
      const f = this.#store.getFact(k);
      return f ? [f.provenance.group_id] : [];
    });
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
      depends_on: [...new Set(depends_on)],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.basis,
          secrecy: p.secrecy,
          expected_version: 0,
        },
      ],
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
