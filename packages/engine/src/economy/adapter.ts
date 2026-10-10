import {
  CANON_WRITE_AUTHORITY,
  CohortFactSchema,
  EconomyDemandEnvelopeSchema,
  EconomyEncumbranceSchema,
  EconomyHoldingSchema,
  EstablishHoldingInputSchema,
  HoldInstructionInputSchema,
  HoldingActPublicationSchema,
  ReleaseInstructionInputSchema,
  EconomyRealizationSchema,
  IssueDemandInputSchema,
  PopulationBasisSchema,
  ProductionRequestSchema,
  PublicationSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  economyDemandKey,
  economyEncumbranceKey,
  economyHoldingKey,
  economyRealizationKey,
  economyRequestId,
  economyRequestKey,
  fail,
  populationCohortKey,
  populationLedgerKey,
  type CanonicalTime,
  type CommitGroup,
  type EconomyDemandEnvelope,
  type EconomyEncumbrance,
  type EconomyHolding,
  type EconomyRealization,
  type HoldingActPublication,
  type OwnerFact,
  type ProductionRequest,
  type Publication,
  type Result,
  type SchemaIssues,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import { factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { deriveEconomyRequest } from "./derive.ts";
import { deriveHold, deriveOpeningHolding, deriveRelease } from "./holding.ts";

/**
 * `INSUFFICIENT_AVAILABLE`: Economy's own as-of-now refusal of a hold — the requested amount is not wholly available (or
 * is of another unit). `ENCUMBRANCE_NOT_ACTIVE`: the named encumbrance is already cancelled. Neither mutates anything.
 */
export type EconomyErrorCode =
  StoreCommitErrorCode | "INPUT_INVALID" | "INSUFFICIENT_AVAILABLE" | "ENCUMBRANCE_NOT_ACTIVE";

/**
 * Economy's answer to "what is available and what is encumbered right now?" (WS-004 §2.1, §20): derived from the
 * committed holding and nothing else. `AVAILABLE` / `ENCUMBERED` name the status of the whole remaining position; a
 * position that is partly each is `PARTLY_ENCUMBERED`.
 */
export interface HoldingAvailability {
  readonly holding_id: string;
  readonly version: number;
  readonly unit: string;
  readonly established: number;
  readonly available: number;
  readonly encumbered: number;
  readonly status: "AVAILABLE" | "PARTLY_ENCUMBERED" | "ENCUMBERED";
}

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

  // -- Economic Holding / Account position (OOC scenario / mechanism proof) -----------------------------------

  /**
   * Commits the separately authored OOC scenario-opening premise: who holds how much of which object, and the premise it
   * came from. The opening partition (everything available, nothing encumbered) is DERIVED here; the caller states only
   * the premise. Created once; a holding is never re-established or overwritten.
   */
  async establishHolding(
    input: Publication & { readonly holding: unknown },
  ): Promise<Result<CommitOutcome, EconomyErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = EstablishHoldingInputSchema.safeParse(input.holding);
    if (!i.success) return invalid("holding", i.error);
    const key = economyHoldingKey(i.data.holding_id);
    if (this.#store.getFact(key) && !this.#store.committedGroup(p.data.intent_id)) {
      return fail("VERSION_CONFLICT", "a holding is established once: it already exists", {
        holding_id: i.data.holding_id,
      });
    }
    const holding = EconomyHoldingSchema.safeParse(deriveOpeningHolding(i.data));
    if (!holding.success) return invalid("holding", holding.error);
    const kind = factKind("economy_holding");
    return this.#store.commit({
      campaign_id: this.#store.head().campaign_id,
      group_id: p.data.group_id,
      intent_id: p.data.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.data.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: holding.data as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.data.basis,
          secrecy: p.data.secrecy,
          expected_version: 0,
        },
      ],
    } satisfies CommitGroup);
  }

  /**
   * Places one OOC-instructed hold. The instruction names a distinct hold identity, a quantity and the holding version it
   * saw; it supplies no balance and no verdict. Economy reads the holding AS-OF-NOW, refuses (changing nothing) when the
   * version is stale or the amount is not wholly available, and otherwise commits — in one group, under the existing
   * expected-version protection — the same conserved position re-partitioned together with its one active encumbrance.
   *
   * Re-presenting an intent that already committed (a lost reply, a restart) is reconciled by identity (RC-16): the
   * committed group is re-presented, so identical input reaches the original receipt and a changed input is refused as a
   * conflict, never applied a second time.
   */
  async holdEncumbrance(
    input: HoldingActPublication & { readonly hold: unknown },
  ): Promise<Result<CommitOutcome, EconomyErrorCode>> {
    const p = HoldingActPublicationSchema.safeParse(pickAct(input));
    if (!p.success) return invalid("publication", p.error);
    const i = HoldInstructionInputSchema.safeParse(input.hold);
    if (!i.success) return invalid("hold", i.error);
    const holdingKey = economyHoldingKey(i.data.holding_id);
    const encKey = economyEncumbranceKey(i.data.holding_id, i.data.hold_id);

    const prior = this.#store.committedGroup(p.data.intent_id);
    if (prior) {
      // reconcile by identity: the same hold, the same pinned version, the same instruction — or a conflict
      const enc = prior.writes.find((w) => w.key === encKey);
      const was = enc ? EconomyEncumbranceSchema.safeParse(enc.value) : undefined;
      if (
        !was?.success ||
        was.data.admitted_at_holding_version !== i.data.holding_version ||
        was.data.authorization.instruction_id !== i.data.instruction_id ||
        !canonicalEqual(was.data.quantity, i.data.quantity)
      )
        return fail("INTENT_CONFLICT", "intent_id was already committed with different content", {
          intent_id: p.data.intent_id,
        });
      return this.#store.commit({
        ...prior,
        group_id: p.data.group_id,
        cause: p.data.cause,
      });
    }

    const holdingFact = this.#store.getFact(holdingKey);
    const holding = holdingFact ? EconomyHoldingSchema.safeParse(holdingFact.value) : undefined;
    if (!holdingFact || !holding?.success)
      return fail("PREREQUISITE_MISSING", "no holding is established at that identity", {
        key: holdingKey,
      });
    if (this.#store.getFact(encKey))
      return fail("VERSION_CONFLICT", "a hold identity is used once: it already exists", {
        key: encKey,
      });
    if (holdingFact.version !== i.data.holding_version)
      return fail("VERSION_CONFLICT", "the holding is no longer at the version the hold saw", {
        key: holdingKey,
        pinned: i.data.holding_version,
        current: holdingFact.version,
      });
    const derived = deriveHold({
      holding: { value: holding.data, version: holdingFact.version },
      pinnedVersion: i.data.holding_version,
      holdId: i.data.hold_id,
      instructionId: i.data.instruction_id,
      quantity: i.data.quantity,
    });
    if (!derived.ok)
      return fail("INSUFFICIENT_AVAILABLE", derived.error.message, { key: holdingKey });
    return this.#store.commit(
      this.#actGroup(p.data, holdingFact, [
        { key: holdingKey, value: derived.value.holding, expected_version: holdingFact.version },
        { key: encKey, value: derived.value.encumbrance, expected_version: 0 },
      ]),
    );
  }

  /**
   * Cancels one OOC-instructed hold: the named encumbrance must exist for THIS holding, be still active and be at the
   * version the instruction saw. Exactly its recorded quantity returns from encumbered to available, once; the
   * encumbrance becomes cancelled and can never be released or reused. Re-presenting a committed intent reconciles by
   * identity exactly as {@link holdEncumbrance} does.
   */
  async releaseEncumbrance(
    input: HoldingActPublication & { readonly release: unknown },
  ): Promise<Result<CommitOutcome, EconomyErrorCode>> {
    const p = HoldingActPublicationSchema.safeParse(pickAct(input));
    if (!p.success) return invalid("publication", p.error);
    const i = ReleaseInstructionInputSchema.safeParse(input.release);
    if (!i.success) return invalid("release", i.error);
    const holdingKey = economyHoldingKey(i.data.holding_id);
    const encKey = economyEncumbranceKey(i.data.holding_id, i.data.hold_id);

    const prior = this.#store.committedGroup(p.data.intent_id);
    if (prior) {
      const enc = prior.writes.find((w) => w.key === encKey);
      const was = enc ? EconomyEncumbranceSchema.safeParse(enc.value) : undefined;
      if (
        !was?.success ||
        was.data.cancellation?.instruction_id !== i.data.instruction_id ||
        enc?.expected_version !== i.data.encumbrance_version
      )
        return fail("INTENT_CONFLICT", "intent_id was already committed with different content", {
          intent_id: p.data.intent_id,
        });
      return this.#store.commit({
        ...prior,
        group_id: p.data.group_id,
        cause: p.data.cause,
      });
    }

    const holdingFact = this.#store.getFact(holdingKey);
    const holding = holdingFact ? EconomyHoldingSchema.safeParse(holdingFact.value) : undefined;
    const encFact = this.#store.getFact(encKey);
    const enc = encFact ? EconomyEncumbranceSchema.safeParse(encFact.value) : undefined;
    if (!holdingFact || !holding?.success || !encFact || !enc?.success)
      return fail("PREREQUISITE_MISSING", "no such encumbrance of that holding is committed", {
        key: encKey,
      });
    if (encFact.version !== i.data.encumbrance_version)
      return fail(
        "VERSION_CONFLICT",
        "the encumbrance is no longer at the version the release saw",
        {
          key: encKey,
          pinned: i.data.encumbrance_version,
          current: encFact.version,
        },
      );
    if (enc.data.lifecycle_status !== "active")
      return fail(
        "ENCUMBRANCE_NOT_ACTIVE",
        "only a still-active encumbrance can be released, once",
        {
          key: encKey,
        },
      );
    const derived = deriveRelease({
      holding: { value: holding.data },
      encumbrance: { value: enc.data },
      instructionId: i.data.instruction_id,
    });
    if (!derived.ok) return fail("INPUT_INVALID", derived.error.message, { key: encKey });
    return this.#store.commit(
      this.#actGroup(p.data, holdingFact, [
        { key: holdingKey, value: derived.value.holding, expected_version: holdingFact.version },
        { key: encKey, value: derived.value.encumbrance, expected_version: encFact.version },
      ]),
    );
  }

  /** One hold/release group: both facts inherit the holding's own labels; it reads and depends on nothing else. */
  #actGroup(
    p: HoldingActPublication,
    holdingFact: OwnerFact,
    writes: readonly {
      readonly key: string;
      readonly value: EconomyHolding | EconomyEncumbrance;
      readonly expected_version: number;
    }[],
  ): CommitGroup {
    const kind = factKind("economy_holding");
    return {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: writes.map((w) => ({
        key: w.key,
        owner: kind.owner,
        facet: kind.facet,
        value: w.value as CommitGroup["writes"][number]["value"],
        unit: null,
        basis: holdingFact.basis,
        secrecy: holdingFact.secrecy,
        expected_version: w.expected_version,
      })),
    };
  }

  /** The committed holding, by identity. */
  holding(holdingId: string): Typed<EconomyHolding> | undefined {
    return this.#typed(economyHoldingKey(holdingId), EconomyHoldingSchema);
  }
  /** One hold of one holding, by identity (never a scan). */
  encumbrance(holdingId: string, holdId: string): Typed<EconomyEncumbrance> | undefined {
    return this.#typed(economyEncumbranceKey(holdingId, holdId), EconomyEncumbranceSchema);
  }
  /** What is available and what is encumbered now, derived from the committed holding alone. */
  availability(holdingId: string): HoldingAvailability | undefined {
    const h = this.holding(holdingId);
    if (!h) return undefined;
    const p = h.value.quantity_or_bounded_position;
    return {
      holding_id: holdingId,
      version: h.fact.version,
      unit: p.unit,
      established: p.established,
      available: p.available,
      encumbered: p.encumbered,
      status:
        p.encumbered === 0 ? "AVAILABLE" : p.available === 0 ? "ENCUMBERED" : "PARTLY_ENCUMBERED",
    };
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

const pickAct = (i: HoldingActPublication): HoldingActPublication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
});

const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});
