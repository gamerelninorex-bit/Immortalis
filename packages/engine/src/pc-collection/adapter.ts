import {
  CANON_WRITE_AUTHORITY,
  EstablishPcCollectionMechanismInputSchema,
  PC_OCCUPANCY_OPEN,
  PC_OCCUPANCY_RELEASED_DENIED,
  PLAYER_CHARACTER_BINDING_KEY,
  PcCollectionCommitInputSchema,
  PcCollectionCommitmentSchema,
  PcCollectionMechanismSchema,
  PcCollectionReachDecisionSchema,
  PopulationPcOccupancySchema,
  ProductionExtractionSchema,
  ProductionPcCollectionWorkSchema,
  ProductionRequestSchema,
  PublicationSchema,
  REFEREE_DECISION_BASIS,
  REFEREE_SECRECY,
  SourceAccountSchema,
  TEMPORAL_STATE_KEY,
  WorldSourceConditionSchema,
  fail,
  pcCollectionCommitmentKey,
  pcCollectionMechanismKey,
  pcCollectionReachKey,
  pcCollectionRequestId,
  pcCollectionRequestKey,
  pcExistenceContractKey,
  popPcOccupancyKey,
  productionExtractionBasisKey,
  productionExtractionBoundaryId,
  productionExtractionKey,
  productionPcCollectionWorkKey,
  productionReserveKey,
  productionSourceAccountKey,
  worldPcLocusCustodyKey,
  type CommitGroup,
  type EstablishPcCollectionMechanismInput,
  type OwnerFact,
  type PcCollectionCommitInput,
  type PcCollectionCommitment,
  type PcCollectionMechanism,
  type PcCollectionReachDecision,
  type PcCollectionReachTask,
  type PopulationPcOccupancy,
  type ProductionExtraction,
  type ProductionPcCollectionWork,
  type ProductionRequest,
  type Publication,
  type Result,
  type SchemaIssues,
  type TemporalObject,
  type WorldSourceCondition,
} from "@immortalis/contracts";
import { PRODUCTION_PC_COLLECTION_WORK_RULE, factKind } from "../owners/registry.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { SourceDrawdownAdapter } from "../source-drawdown/adapter.ts";
import { parseAccount } from "../source-drawdown/derive.ts";
import { pcReachCause, pcReachGroupId, pcReachIntentId } from "./admission.ts";
import {
  buildPcCollectionReachTask,
  accessFactsDigest,
  derivePcCollectionCommitment,
  derivePcCollectionRequest,
  deriveOccupancyInterval,
  interpretPcCollectionReachAnswer,
  pcCollectionPreconditions,
} from "./derive.ts";
import {
  extractionCredited,
  pcOccupancyRecord,
  pcOccupancyState,
  type PcOccupancyState,
} from "./state.ts";

export type PcCollectionErrorCode = StoreCommitErrorCode | "INPUT_INVALID" | "ANSWER_INVALID";

interface Typed<T> {
  readonly fact: OwnerFact;
  readonly value: T;
}

const issues = (e: SchemaIssues) =>
  e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, { issues: issues(e) });

const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});

const byId = (a: { extraction_id: string }, b: { extraction_id: string }): number =>
  a.extraction_id < b.extraction_id ? -1 : a.extraction_id > b.extraction_id ? 1 : 0;

type KindId =
  | "pc_collection_commitment"
  | "pc_collection_request"
  | "pc_collection_mechanism"
  | "pc_collection_reach_decision"
  | "population_pc_occupancy";

/**
 * CPAA-C1 v0.2 PROVISIONAL — the owner publications of the confirmed collection path, each built over the engine's own store and
 * judged by IM-11 admission. A caller supplies authored content and identities only. It never supplies an owner, facet, authority,
 * governing rule, verdict, feasibility, cycle count, duration, boundary, source remainder or Reserve increase: those come from the
 * registry and from the owners' committed premises. There is no method that takes a boundary, a result or a verdict.
 *
 * Every step is reconciled by identity (RC-16): re-presenting an intent that already committed returns the original receipt.
 */
export class PcCollectionAdapter {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  /** C2/C3: the player's confirmed commitment-of-record (willingness to attempt only). */
  commit(
    input: Publication & { readonly commitment: unknown },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const c = PcCollectionCommitInputSchema.safeParse(input.commitment);
    if (!c.success) return Promise.resolve(invalid("commitment", c.error));
    const derived = derivePcCollectionCommitment(c.data as PcCollectionCommitInput, this.#store);
    if (!derived.ok) return Promise.resolve(fail("PREREQUISITE_MISSING", derived.error.message));
    const v = derived.value;
    return this.#publish(
      p.data,
      "pc_collection_commitment",
      pcCollectionCommitmentKey(v.pc_id, v.act_id),
      v,
      0,
      [
        pcExistenceContractKey(v.pc_id),
        PLAYER_CHARACTER_BINDING_KEY,
        worldPcLocusCustodyKey(v.pc_id),
        v.intent.source.fact_key,
        v.intent.destination.fact_key,
      ],
    );
  }

  /** C3: the PC-owned Production Request, derived mechanically from the committed commitment. */
  establishRequest(
    input: Publication & { readonly pc_id: string; readonly act_id: string },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const commitment = this.commitment(input.pc_id, input.act_id);
    if (!commitment)
      return Promise.resolve(
        fail(
          "PREREQUISITE_MISSING",
          "no collection commitment-of-record is committed: a request never exists without willingness",
        ),
      );
    const src = this.#store.getFact(commitment.value.intent.source.fact_key);
    const source = src ? this.#sourceValue(src) : undefined;
    if (!source)
      return Promise.resolve(fail("PREREQUISITE_MISSING", "the source is not committed"));
    const request = derivePcCollectionRequest(commitment.value, source);
    return this.#publish(
      p.data,
      "pc_collection_request",
      pcCollectionRequestKey(input.pc_id, input.act_id),
      request,
      0,
      [
        pcCollectionCommitmentKey(input.pc_id, input.act_id),
        commitment.value.intent.source.fact_key,
      ],
    );
  }

  /** C6 / P-1: establishes the PC's typed exact-cycle mechanism, following accepted claims of its own released contract. */
  establishMechanism(
    input: Publication & { readonly mechanism: unknown },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const m = EstablishPcCollectionMechanismInputSchema.safeParse(input.mechanism);
    if (!m.success) return Promise.resolve(invalid("mechanism", m.error));
    const d = m.data as EstablishPcCollectionMechanismInput;
    const contract = this.#store.getFact(pcExistenceContractKey(d.pc_id));
    if (!contract)
      return Promise.resolve(
        fail("PREREQUISITE_MISSING", "the PC's released contract is not committed"),
      );
    const value = PcCollectionMechanismSchema.safeParse({
      mechanism_id: d.mechanism_id,
      pc_id: d.pc_id,
      authored_from: {
        contract: { fact_key: contract.key, version: contract.version },
        claims: d.claims,
      },
      actuator: d.actuator,
      traversal: d.traversal,
      cycle: { kind: "SERIAL_PER_UNIT", units_per_cycle: 1, duration: d.cycle_duration },
      interaction_floor: d.interaction_floor,
      committer: { owner: "pc_existence", facet: "pc_collection_mechanism" },
    });
    if (!value.success) return Promise.resolve(invalid("mechanism", value.error));
    return this.#publish(
      p.data,
      "pc_collection_mechanism",
      pcCollectionMechanismKey(d.pc_id, d.mechanism_id),
      value.data,
      0,
      [pcExistenceContractKey(d.pc_id)],
    );
  }

  /** C5: the bounded task a host interprets for one attempt, or undefined while its premises are not committed. */
  reachTask(pcId: string, actId: string, mechanismId: string): PcCollectionReachTask | undefined {
    const commitment = this.commitment(pcId, actId);
    const mech = this.mechanism(pcId, mechanismId);
    const srcFact = commitment
      ? this.#store.getFact(commitment.value.intent.source.fact_key)
      : undefined;
    const source = srcFact ? this.#sourceValue(srcFact) : undefined;
    if (!commitment || !mech || !srcFact || !source) return undefined;
    return buildPcCollectionReachTask(
      pcId,
      actId,
      { key: srcFact.key, value: source },
      { key: mech.fact.key, version: mech.fact.version, value: mech.value },
    );
  }

  /**
   * C5: validates a host's UNTRUSTED answer against the task and retains the judgment under `role.gm` + `permission.rule.adjudicate`
   * applied by this trusted operation (never read from the answer). The verdict is DERIVED. An answer that does not validate is set
   * aside: nothing is written.
   */
  async adjudicateReach(input: {
    readonly pc_id: string;
    readonly act_id: string;
    readonly mechanism_id: string;
    readonly answer: unknown;
  }): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const task = this.reachTask(input.pc_id, input.act_id, input.mechanism_id);
    if (!task)
      return fail("PREREQUISITE_MISSING", "the premises of the judgment are not committed");
    const interpreted = interpretPcCollectionReachAnswer(task, input.answer);
    if (!interpreted.ok) return fail("ANSWER_INVALID", interpreted.error.message);
    const commitment = this.commitment(input.pc_id, input.act_id)!;
    const mech = this.mechanism(input.pc_id, input.mechanism_id)!;
    const srcFact = this.#store.getFact(commitment.value.intent.source.fact_key)!;
    const source = this.#sourceValue(srcFact)!;
    const decision = PcCollectionReachDecisionSchema.safeParse({
      pc_id: input.pc_id,
      act_id: input.act_id,
      task: {
        digest: task.digest,
        source: { fact_key: srcFact.key, version: srcFact.version },
        access_facts_digest: accessFactsDigest(source),
        mechanism: { fact_key: mech.fact.key, version: mech.fact.version },
        commitment: { fact_key: commitment.fact.key, version: commitment.fact.version },
      },
      answer: interpreted.value.answer,
      verdict: interpreted.value.verdict,
      authority: { role: "role.gm", permission: "permission.rule.adjudicate" },
    });
    if (!decision.success) return invalid("judgment", decision.error);
    return this.#publish(
      {
        group_id: pcReachGroupId(input.pc_id, input.act_id),
        intent_id: pcReachIntentId(input.pc_id, input.act_id),
        cause: pcReachCause(input.pc_id, input.act_id),
        basis: REFEREE_DECISION_BASIS,
        secrecy: REFEREE_SECRECY,
      },
      "pc_collection_reach_decision",
      pcCollectionReachKey(input.pc_id, input.act_id),
      decision.data,
      0,
      [commitment.fact.key, mech.fact.key, srcFact.key],
    );
  }

  /** P-2: registers the PC's individual occupied interval, DERIVED from the commitment, the mechanism and the canonical time. */
  async registerOccupancy(
    input: Publication & {
      readonly pc_id: string;
      readonly act_id: string;
      readonly mechanism_id: string;
    },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const facts = {
      get: (k: string) => this.#store.getFact(k),
      has: (k: string) => this.#store.getFact(k) !== undefined,
    };
    const pre = pcCollectionPreconditions(input.pc_id, input.act_id, input.mechanism_id, facts);
    if ("reason" in pre) return fail("PREREQUISITE_MISSING", pre.reason);
    const interval = deriveOccupancyInterval(pre.commitment.value, pre.mechanism.value, pre.now);
    if (!interval.ok) return fail("PREREQUISITE_MISSING", interval.error.message);
    const prior = this.#store.getFact(popPcOccupancyKey(input.pc_id));
    const value = PopulationPcOccupancySchema.safeParse({
      pc_id: input.pc_id,
      act_id: input.act_id,
      status: PC_OCCUPANCY_OPEN,
      interval: { from: interval.value.from, to: interval.value.to },
      commitment: { fact_key: pre.commitment.fact.key, version: pre.commitment.fact.version },
      mechanism: { fact_key: pre.mechanism.fact.key, version: pre.mechanism.fact.version },
      committer: { owner: "population", facet: "population_pc_occupancy" },
    });
    if (!value.success) return invalid("occupancy", value.error);
    return this.#publish(
      p.data,
      "population_pc_occupancy",
      popPcOccupancyKey(input.pc_id),
      value.data,
      prior?.version ?? 0,
      [
        pre.commitment.fact.key,
        pre.mechanism.fact.key,
        PLAYER_CHARACTER_BINDING_KEY,
        worldPcLocusCustodyKey(input.pc_id),
        TEMPORAL_STATE_KEY,
        ...(prior ? [prior.key] : []),
      ],
    );
  }

  /** P-2: releases an OPEN registration by lawful denial (no extraction was admitted for the act). */
  releaseOccupancyDenied(
    input: Publication & { readonly pc_id: string; readonly act_id: string },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const prior = this.occupancy(input.pc_id);
    if (!prior || prior.value.act_id !== input.act_id)
      return Promise.resolve(fail("PREREQUISITE_MISSING", "no registration of this act is held"));
    return this.#publish(
      p.data,
      "population_pc_occupancy",
      popPcOccupancyKey(input.pc_id),
      { ...prior.value, status: PC_OCCUPANCY_RELEASED_DENIED },
      prior.fact.version,
      [],
    );
  }

  /**
   * C4/C6: Production starts the PC-owned extraction. The cycles, the causal duration and the earned completion are DERIVED here
   * from the committed premises; there is no boundary parameter. The extraction, the key's account holding the commitment and
   * Production's work record publish atomically; admission re-derives all of it and refuses (recording nothing) unless the
   * commitment, the mechanism, the judged reach (REACHABLE), the OPEN occupancy and the source all hold.
   */
  async startWork(
    input: Publication & {
      readonly pc_id: string;
      readonly act_id: string;
      readonly mechanism_id: string;
      readonly basis_id: string;
    },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const { pc_id: pcId, act_id: actId } = input;
    const id = pcCollectionRequestId(pcId, actId);
    const facts = {
      get: (k: string) => this.#store.getFact(k),
      has: (k: string) => this.#store.getFact(k) !== undefined,
    };
    const pre = pcCollectionPreconditions(pcId, actId, input.mechanism_id, facts);
    if ("reason" in pre) return fail("PREREQUISITE_MISSING", pre.reason);
    const reach = this.reach(pcId, actId);
    if (!reach)
      return fail("PREREQUISITE_MISSING", "no physical-reach judgment is committed for this act");
    const occ = this.occupancy(pcId);
    if (!occ || occ.value.act_id !== actId)
      return fail("PREREQUISITE_MISSING", "the PC's occupancy is not registered for this act");
    const request = this.request(pcId, actId);
    if (!request) return fail("PREREQUISITE_MISSING", "the PC-owned request is not committed");
    const interval = deriveOccupancyInterval(pre.commitment.value, pre.mechanism.value, pre.now);
    if (!interval.ok) return fail("PREREQUISITE_MISSING", interval.error.message);
    const t = interval.value.timing;
    const c = pre.commitment.value;
    const accountKey = productionSourceAccountKey(
      c.intent.source.world_id,
      c.intent.source.source_key,
    );
    const basisFact = this.#store.getFact(productionExtractionBasisKey(input.basis_id));
    const reserveFact = this.#store.getFact(productionReserveKey(c.intent.destination.reserve_id));
    if (!basisFact)
      return fail("PREREQUISITE_MISSING", "the Capability / Access basis is not established");
    if (!reserveFact)
      return fail("PREREQUISITE_MISSING", "the destination Reserve is not established");
    if (this.#store.getFact(productionExtractionKey(id)))
      return fail("VERSION_CONFLICT", "a request fixes one extraction: it already exists", {
        extraction_id: id,
      });
    const accountFact = this.#store.getFact(accountKey);
    const account = accountFact ? parseAccount(accountFact) : undefined;
    if (accountFact && !account)
      return fail("VALUE_INVALID", "the key's account is malformed", { key: accountKey });
    const entry = { extraction_id: id, quantity: c.intent.quantity };
    const extraction = ProductionExtractionSchema.safeParse({
      extraction_id: id,
      request: {
        owner: request.fact.owner,
        fact_key: request.fact.key,
        request_id: id,
        version: request.fact.version,
      },
      basis: { fact_key: basisFact.key, basis_id: input.basis_id, version: basisFact.version },
      source: {
        fact_key: pre.source.fact.key,
        source_key: c.intent.source.source_key,
        version: pre.source.fact.version,
      },
      reserve: { fact_key: reserveFact.key, reserve_id: c.intent.destination.reserve_id },
      account: { fact_key: accountKey },
      material_class: pre.source.value.material_class,
      quantity: c.intent.quantity,
      support_basis: {
        tier: "TIER_A_EMBEDDED_BASELINE",
        labor: "NON_MATERIAL_EMBEDDED",
        specialist_competence: "NON_MATERIAL",
      },
      timing: {
        started_at: pre.now,
        boundary: { boundary_id: productionExtractionBoundaryId(id), at: t.completes_at },
      },
    });
    if (!extraction.success) return invalid("extraction", extraction.error);
    const nextAccount = SourceAccountSchema.safeParse(
      account
        ? { ...account, open: [...account.open, entry].sort(byId) }
        : {
            source: { fact_key: pre.source.fact.key, source_key: c.intent.source.source_key },
            locality: pre.source.value.locality,
            material_class: pre.source.value.material_class,
            unit: pre.source.value.recoverable.unit,
            watermark: pre.now,
            open: [entry],
          },
    );
    if (!nextAccount.success) return invalid("account", nextAccount.error);
    const work = ProductionPcCollectionWorkSchema.safeParse({
      work_id: id,
      pc_id: pcId,
      act_id: actId,
      pins: {
        commitment: { fact_key: pre.commitment.fact.key, version: pre.commitment.fact.version },
        request: { fact_key: request.fact.key, version: request.fact.version },
        mechanism: { fact_key: pre.mechanism.fact.key, version: pre.mechanism.fact.version },
        reach: { fact_key: reach.fact.key, version: reach.fact.version },
        occupancy: { fact_key: occ.fact.key, version: occ.fact.version },
        binding: pre.standing.binding.version,
        custody: pre.standing.custody.version,
      },
      derivation: {
        cycles: t.cycles,
        per_cycle: t.per_cycle,
        causal_duration: t.causal_duration,
        floor_minimum: t.floor_minimum,
        started_at: pre.now,
        completes_at: t.completes_at,
      },
    });
    if (!work.success) return invalid("work", work.error);
    const kind = factKind("production_extraction");
    const pinnedKeys = [
      request.fact.key,
      basisFact.key,
      pre.source.fact.key,
      reserveFact.key,
      TEMPORAL_STATE_KEY,
      pre.commitment.fact.key,
      pre.mechanism.fact.key,
      reach.fact.key,
      occ.fact.key,
      PLAYER_CHARACTER_BINDING_KEY,
      worldPcLocusCustodyKey(pcId),
    ];
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.data.group_id,
      intent_id: p.data.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.data.cause,
      rule: PRODUCTION_PC_COLLECTION_WORK_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: pinnedKeys.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
      depends_on: [
        ...new Set(pinnedKeys.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ],
      writes: [
        {
          key: productionExtractionKey(id),
          value: extraction.data,
          expected_version: 0,
        },
        { key: accountKey, value: nextAccount.data, expected_version: accountFact?.version ?? 0 },
        { key: productionPcCollectionWorkKey(id), value: work.data, expected_version: 0 },
      ].map((w) => ({
        key: w.key,
        owner: kind.owner,
        facet: kind.facet,
        value: w.value as CommitGroup["writes"][number]["value"],
        unit: null,
        basis: p.data.basis,
        secrecy: p.data.secrecy,
        expected_version: w.expected_version,
      })),
    };
    return this.#store.commit(group);
  }

  /** The temporal object of the started extraction (derived from the committed extraction alone; its boundary is the derived completion). */
  temporalObject(pcId: string, actId: string): TemporalObject | undefined {
    return new SourceDrawdownAdapter(this.#store).temporalObject(
      pcCollectionRequestId(pcId, actId),
    );
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  commitment(pcId: string, actId: string): Typed<PcCollectionCommitment> | undefined {
    return this.#typed(pcCollectionCommitmentKey(pcId, actId), PcCollectionCommitmentSchema);
  }
  request(pcId: string, actId: string): Typed<ProductionRequest> | undefined {
    return this.#typed(pcCollectionRequestKey(pcId, actId), ProductionRequestSchema);
  }
  mechanism(pcId: string, mechanismId: string): Typed<PcCollectionMechanism> | undefined {
    return this.#typed(pcCollectionMechanismKey(pcId, mechanismId), PcCollectionMechanismSchema);
  }
  reach(pcId: string, actId: string): Typed<PcCollectionReachDecision> | undefined {
    return this.#typed(pcCollectionReachKey(pcId, actId), PcCollectionReachDecisionSchema);
  }
  occupancy(pcId: string): Typed<PopulationPcOccupancy> | undefined {
    const rec = pcOccupancyRecord(
      { get: (k) => this.#store.getFact(k), has: (k) => this.#store.getFact(k) !== undefined },
      pcId,
    );
    return rec ? { fact: rec.fact, value: rec.value } : undefined;
  }
  occupancyState(pcId: string): PcOccupancyState {
    return pcOccupancyState(
      { get: (k) => this.#store.getFact(k), has: (k) => this.#store.getFact(k) !== undefined },
      pcId,
    );
  }
  work(pcId: string, actId: string): Typed<ProductionPcCollectionWork> | undefined {
    return this.#typed(
      productionPcCollectionWorkKey(pcCollectionRequestId(pcId, actId)),
      ProductionPcCollectionWorkSchema,
    );
  }
  extraction(pcId: string, actId: string): Typed<ProductionExtraction> | undefined {
    return this.#typed(
      productionExtractionKey(pcCollectionRequestId(pcId, actId)),
      ProductionExtractionSchema,
    );
  }
  /** Is the act's work closed (its Reserve inflow credited)? */
  closed(pcId: string, actId: string): boolean {
    return extractionCredited(
      { get: (k) => this.#store.getFact(k), has: (k) => this.#store.getFact(k) !== undefined },
      pcCollectionRequestId(pcId, actId),
    );
  }

  // -- internals -------------------------------------------------------------------------------

  #typed<T>(key: string, schema: { parse(v: unknown): T }): Typed<T> | undefined {
    const fact = this.#store.getFact(key);
    return fact ? { fact, value: schema.parse(fact.value) } : undefined;
  }

  #sourceValue(fact: OwnerFact): WorldSourceCondition | undefined {
    const v = WorldSourceConditionSchema.safeParse(fact.value);
    return v.success ? v.data : undefined;
  }

  async #publish(
    p: Publication,
    kindId: KindId,
    key: string,
    value: unknown,
    expectedVersion: number,
    readKeys: readonly string[],
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const replay = this.#store.committedGroup(p.intent_id);
    if (replay) return this.#store.commit(replay);
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
      reads: readKeys.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
      depends_on: [
        ...new Set(readKeys.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.basis,
          secrecy: p.secrecy,
          expected_version: expectedVersion,
        },
      ],
    };
    return this.#store.commit(group);
  }
}
