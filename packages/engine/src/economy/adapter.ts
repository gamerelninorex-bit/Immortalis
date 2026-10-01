import {
  CANON_WRITE_AUTHORITY,
  CohortFactSchema,
  EconomyDemandEnvelopeSchema,
  EconomyRealizationSchema,
  IssueDemandInputSchema,
  PopulationBasisSchema,
  ProductionRequestSchema,
  PublicationSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  economyDemandKey,
  economyRealizationKey,
  economyRequestId,
  economyRequestKey,
  fail,
  populationCohortKey,
  populationLedgerKey,
  type CanonicalTime,
  type CommitGroup,
  type EconomyDemandEnvelope,
  type EconomyRealization,
  type OwnerFact,
  type ProductionRequest,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { deriveEconomyRequest } from "./derive.ts";

export type EconomyErrorCode = StoreCommitErrorCode | "INPUT_INVALID";

interface Typed<T> {
  readonly fact: OwnerFact;
  readonly value: T;
}

/**
 * The Economy-owned answer to "has this demand been realized?" (WS-004 §8 step 6). It is derived from the
 * presence of the realized-access fact and from nothing else: Production having completed the output, or even
 * the custodian having accepted it, is not satisfaction until Economy's own stage has recorded it.
 */
export type DemandAccess =
  | { readonly state: "NO_DEMAND" }
  | { readonly state: "DEMAND_OPEN" }
  | { readonly state: "REALIZED_ACCESS"; readonly realization: Typed<EconomyRealization> };

/** What an issuance is built against: the pinned carrier, locality and canonical basis, and its pins. */
interface IssueBasis {
  readonly ledgerVersion: number;
  readonly cohortVersion: number | null;
  readonly world: { fact_key: string; entity_id: string };
  readonly locus: { fact_key: string; entity_id: string };
  readonly now: CanonicalTime;
  readonly clockVersion: number;
  readonly reads: CommitGroup["reads"];
  readonly depends_on: readonly string[];
}

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, { issues: issues(e) });

/**
 * IM-06 Economy — the acceptance path of the Economy owner.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an authority or a
 * governing rule: those come from the specification-backed registry, and every publication is made by the
 * archivist path through the existing IM-11/IM-12/IM-17 store (one journal, one canon). There is exactly ONE
 * authored publication: issuing one demand whose carrier is an already-committed Population Unit or Cohort,
 * which fixes the Demand Envelope, its allocation relation and the one Production Request atomically. Realized
 * access is NOT a method here: it is the `economyRealizationProvider` operation the IM-02 coordinator resolves
 * after the World-State custodian's acceptance. There is no setter, no amendment, no way to mark a demand
 * satisfied, to publish supply, or to write a Population, Production or World-State fact, so no caller can
 * rewrite a demand, its request or its outcome; the store's admission refuses them for a raw commit as well.
 */
export class EconomyAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /**
   * Issues one demand against one committed carrier and fixes its one Production Request. The pre-commit
   * availability (no supply exists for the request) is read AS-OF-NOW at the canonical temporal basis and sealed
   * with the demand. Starting the Production operation on the request is Production's own publication.
   *
   * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16):
   * the group is rebuilt on the basis it was committed against — the carrier pins and the temporal basis as
   * they were — so identical input reaches the original receipt, and a changed input is refused as a conflict
   * rather than silently reusing it.
   */
  async issueDemand(
    input: Publication & { readonly demand: unknown },
  ): Promise<Result<CommitOutcome, EconomyErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = IssueDemandInputSchema.safeParse(input.demand);
    if (!i.success) return invalid("demand", i.error);
    const id = i.data.demand_envelope_id;
    const demandKey = economyDemandKey(id);
    const carrier = i.data.carrier;
    const ledgerKey = populationLedgerKey(carrier.ledger_id);
    const cohortKey =
      carrier.kind === "POPULATION_COHORT"
        ? populationCohortKey(carrier.ledger_id, carrier.cohort_id)
        : null;

    const prior = this.#store.committedGroup(p.data.intent_id);
    const priorDemandW = prior?.writes.find((w) => w.key === demandKey);
    let basis: IssueBasis;
    if (prior && priorDemandW) {
      // reconcile by identity: rebuild on the committed basis
      const was = EconomyDemandEnvelopeSchema.safeParse(priorDemandW.value);
      if (!was.success) return invalid("committed demand", was.error);
      basis = {
        ledgerVersion: was.data.carrier_basis_ref.ledger.version,
        cohortVersion: was.data.carrier_basis_ref.cohort?.version ?? null,
        world: was.data.material_scope.world,
        locus: was.data.material_scope.locus,
        now: was.data.pre_commit_availability.at,
        clockVersion: was.data.pre_commit_availability.temporal_state.version,
        reads: prior.reads,
        depends_on: prior.depends_on,
      };
    } else {
      if (this.#store.getFact(demandKey)) {
        return fail("VERSION_CONFLICT", "a demand fixes one request: it already exists", {
          demand_envelope_id: id,
        });
      }
      const ledgerFact = this.#store.getFact(ledgerKey);
      const ledger = ledgerFact ? PopulationBasisSchema.safeParse(ledgerFact.value) : undefined;
      if (!ledgerFact || !ledger?.success) {
        return fail("PREREQUISITE_MISSING", "the carrier's Population ledger is not committed", {
          key: ledgerKey,
        });
      }
      let cohortVersion: number | null = null;
      if (cohortKey) {
        const cohortFact = this.#store.getFact(cohortKey);
        if (!cohortFact || !CohortFactSchema.safeParse(cohortFact.value).success) {
          return fail("PREREQUISITE_MISSING", "the carrier's Population Cohort is not committed", {
            key: cohortKey,
          });
        }
        cohortVersion = cohortFact.version;
      }
      const clockFact = this.#store.getFact(TEMPORAL_STATE_KEY);
      const clock = clockFact ? TemporalStateSchema.safeParse(clockFact.value) : undefined;
      if (!clockFact || !clock?.success) {
        return fail("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
          key: TEMPORAL_STATE_KEY,
        });
      }
      const { world, locus } = ledger.data.locality;
      const pinned = [
        world.fact_key,
        locus.fact_key,
        ledgerKey,
        ...(cohortKey ? [cohortKey] : []),
        TEMPORAL_STATE_KEY,
      ];
      basis = {
        ledgerVersion: ledgerFact.version,
        cohortVersion,
        world,
        locus,
        now: clock.data.canonical_time,
        clockVersion: clockFact.version,
        reads: pinned.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
        depends_on: [
          ...new Set(pinned.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
        ],
      };
    }

    const requestId = economyRequestId(id);
    const requestKey = economyRequestKey(requestId);
    const demand = EconomyDemandEnvelopeSchema.safeParse({
      demand_envelope_id: id,
      carrier_ref: carrier,
      carrier_basis_ref: {
        ledger: { fact_key: ledgerKey, version: basis.ledgerVersion },
        cohort:
          cohortKey && basis.cohortVersion !== null
            ? { fact_key: cohortKey, version: basis.cohortVersion }
            : null,
      },
      material_scope: { world: basis.world, locus: basis.locus },
      demand_entry: i.data.demand_entry,
      allocation: {
        relation: "ONE_DEMAND_ONE_PRODUCTION_REQUEST",
        request: { fact_key: requestKey, request_id: requestId },
        nature: "ECONOMIC_ALLOCATION_CLAIM_NOT_STOCK_TITLE_OR_RESERVATION",
      },
      pre_commit_availability: {
        read: "AS-OF-NOW",
        at: basis.now,
        temporal_state: { fact_key: TEMPORAL_STATE_KEY, version: basis.clockVersion },
        supply_for_request: "ABSENT",
      },
    });
    if (!demand.success) return invalid("demand", demand.error);
    const request = ProductionRequestSchema.safeParse(deriveEconomyRequest(demand.data));
    if (!request.success) return invalid("request", request.error);

    const kind = factKind("economy_demand");
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.data.group_id,
      intent_id: p.data.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.data.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: basis.reads,
      depends_on: [...basis.depends_on],
      writes: [
        { key: demandKey, value: demand.data },
        { key: requestKey, value: request.data },
      ].map((w) => ({
        key: w.key,
        owner: kind.owner,
        facet: kind.facet,
        value: w.value as CommitGroup["writes"][number]["value"],
        unit: null,
        basis: p.data.basis,
        secrecy: p.data.secrecy,
        expected_version: 0,
      })),
    };
    return this.#store.commit(group);
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  demand(demandId: string): Typed<EconomyDemandEnvelope> | undefined {
    return this.#typed(economyDemandKey(demandId), EconomyDemandEnvelopeSchema);
  }
  /** The Production Request this demand allocated to, in Economy's own key space. */
  request(demandId: string): Typed<ProductionRequest> | undefined {
    return this.#typed(economyRequestKey(economyRequestId(demandId)), ProductionRequestSchema);
  }
  realization(demandId: string): Typed<EconomyRealization> | undefined {
    return this.#typed(economyRealizationKey(demandId), EconomyRealizationSchema);
  }

  /** Realized access exists only once Economy's own stage recorded it (see {@link DemandAccess}). */
  access(demandId: string): DemandAccess {
    const realization = this.realization(demandId);
    if (realization) return { state: "REALIZED_ACCESS", realization };
    return this.demand(demandId) ? { state: "DEMAND_OPEN" } : { state: "NO_DEMAND" };
  }

  #typed<T>(key: string, schema: { parse(v: unknown): T }): Typed<T> | undefined {
    const fact = this.#store.getFact(key);
    return fact ? { fact, value: schema.parse(fact.value) } : undefined;
  }
}

const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});
