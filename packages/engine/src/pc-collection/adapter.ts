import {
  CANON_WRITE_AUTHORITY,
  FACET_PC_INTRINSIC_CLARIFICATION,
  PC_CLARIFICATION_BRANCH,
  PC_CLARIFICATION_QUESTION,
  PcIntrinsicClarificationSchema,
  pcIntrinsicClarificationKey,
  type ClarifiedClaimRef,
  type PcIntrinsicClarification,
  PopulationWorkforceScopeSchema,
  WorldSceneClosureSchema,
  popWorkforceScopeKey,
  worldSceneClosureKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type PopulationWorkforceScope,
  type WorldSceneClosure,
  EstablishPcCollectionMechanismInputSchema,
  PC_OCCUPANCY_OPEN,
  PC_OCCUPANCY_RELEASED_DENIED,
  PC_OCCUPANCY_RELEASED_LAPSED,
  PC_OCCUPANCY_RELEASED_TERMINATED,
  PC_CYCLE_MEANING,
  PcCollectionCycleAttestationSchema,
  PopulationPcRepresentationSchema,
  pcCollectionAttestationId,
  pcCollectionAttestationKey,
  popPcRepresentationKey,
  type PcCollectionCycleAttestation,
  type PcCollectionCycleTask,
  type PopulationPcRepresentation,
  PcCollectionCessationInputSchema,
  PcCollectionCessationSchema,
  ProductionPcCollectionLapseSchema,
  ProductionPcCollectionTerminationSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  temporalTransactionAuthorityKey,
  pcCollectionCessationKey,
  productionExtractionObjectId,
  productionPcCollectionLapseKey,
  productionPcCollectionTerminationKey,
  temporalObjectKey,
  type ProductionPcCollectionLapse,
  type PcCollectionCessation,
  type ProductionPcCollectionTermination,
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
import {
  POPULATION_PC_OCCUPANCY_LAPSE_RULE,
  POPULATION_PC_OCCUPANCY_TERMINATION_RULE,
  PRODUCTION_PC_COLLECTION_LAPSE_RULE,
  PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
  PRODUCTION_PC_COLLECTION_WORK_RULE,
  factKind,
} from "../owners/registry.ts";
import { collectionFacts, deriveCessation, deriveTermination } from "./cessation.ts";
import { pcClarificationIdOf } from "./clarification.ts";
import { acceptableHeldLineage, deriveLapse, lapseCauseViolation } from "./lapse.ts";
import {
  sceneClosureStatus,
  workforceScopeStatus,
  deriveWorkforceAccounting,
  liveSceneCoverage,
  buildCycleTask,
  buildSceneEvidence,
  derivePcRepresentation,
  interpretCycleAnswer,
  pcCycleHookId,
} from "./determinations.ts";
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
  pcCollectionHold,
  pcCollectionPreconditions,
  type PcCollectionHold,
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
  | "pc_intrinsic_clarification"
  | "pc_collection_cycle_attestation"
  | "population_pc_representation"
  | "pc_collection_cessation"
  | "pc_collection_commitment"
  | "pc_collection_request"
  | "pc_collection_mechanism"
  | "pc_collection_reach_decision"
  | "population_pc_occupancy"
  | "world_scene_closure"
  | "population_workforce_scope";

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
    input: Publication & { readonly commitment: unknown; readonly mechanism_id: string },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const c = PcCollectionCommitInputSchema.safeParse(input.commitment);
    if (!c.success) return Promise.resolve(invalid("commitment", c.error));
    const derived = derivePcCollectionCommitment(
      c.data as PcCollectionCommitInput,
      this.#store,
      input.mechanism_id,
    );
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
        v.basis.cycle.mechanism.fact_key,
        v.basis.cycle.attestation.fact_key,
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
    // R-5: the claims of the PC's own committed clarifications the mechanism also follows, pinned at their exact versions
    const clarifiedPins: ClarifiedClaimRef[] = [];
    for (const c of d.clarified ?? []) {
      const found = this.#store.getFact(pcIntrinsicClarificationKey(d.pc_id, c.clarification_id));
      if (!found)
        return Promise.resolve(
          fail("PREREQUISITE_MISSING", "a cited clarification of the PC is not committed"),
        );
      clarifiedPins.push({
        clarification: { fact_key: found.key, version: found.version },
        index: c.index,
      });
    }
    const value = PcCollectionMechanismSchema.safeParse({
      mechanism_id: d.mechanism_id,
      pc_id: d.pc_id,
      authored_from: {
        contract: { fact_key: contract.key, version: contract.version },
        claims: d.claims,
        ...(clarifiedPins.length > 0 ? { clarified: clarifiedPins } : {}),
      },
      actuator: d.actuator,
      traversal: d.traversal,
      cycle: {
        kind: "SERIAL_PER_UNIT",
        units_per_cycle: 1,
        duration: d.cycle_duration,
        authored_quote: d.cycle_quote,
      },
      committer: { owner: "pc_existence", facet: "pc_collection_mechanism" },
    });
    if (!value.success) return Promise.resolve(invalid("mechanism", value.error));
    return this.#publish(
      p.data,
      "pc_collection_mechanism",
      pcCollectionMechanismKey(d.pc_id, d.mechanism_id),
      value.data,
      0,
      [pcExistenceContractKey(d.pc_id), ...clarifiedPins.map((c) => c.clarification.fact_key)],
    );
  }

  /**
   * R-5 (NEWLY AUTHORIZED): the prospective intrinsic clarification of the one unresolved operative detail collection needs. The
   * caller supplies the player's own words and names the retained I-002 classification of exactly those words; everything else
   * (the identity, the pins of the contract, the binding and the classification, the canonical time it is effective from, the
   * invocation branch and question, the interpreting and accepting roles) is DERIVED here from committed state or fixed, never
   * supplied. Create-only and re-derived by admission; presenting it again reconciles by identity.
   */
  clarify(
    input: Publication & {
      readonly pc_id: string;
      readonly statements: readonly string[];
      readonly referee_key: string;
    },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const contract = this.#store.getFact(pcExistenceContractKey(input.pc_id));
    const binding = this.#store.getFact(PLAYER_CHARACTER_BINDING_KEY);
    const referee = this.#store.getFact(input.referee_key);
    const state = this.#view().get(TEMPORAL_STATE_KEY);
    if (!contract || !binding || !referee || !state)
      return Promise.resolve(
        fail(
          "PREREQUISITE_MISSING",
          "the released contract, the operative binding, the retained classification and a canonical time are committed",
        ),
      );
    const clock = (state.value as { canonical_time: PcIntrinsicClarification["effective_from"] })
      .canonical_time;
    const id = pcClarificationIdOf(input.pc_id, input.statements);
    const value = PcIntrinsicClarificationSchema.safeParse({
      clarification_id: id,
      pc_id: input.pc_id,
      invocation: { branch: PC_CLARIFICATION_BRANCH, question: PC_CLARIFICATION_QUESTION },
      contract: { fact_key: contract.key, version: contract.version },
      binding: { fact_key: binding.key, version: binding.version },
      referee: { fact_key: referee.key, version: referee.version },
      claims: input.statements.map((statement) => ({ statement, provenance: "PLAYER-AUTHORED" })),
      interpreted_by: { role: "role.gm", permission: "permission.rule.adjudicate" },
      accepted_by: { role: "role.archivist", permission: "permission.canon.write" },
      effective_from: clock,
      committer: { owner: "pc_existence", facet: FACET_PC_INTRINSIC_CLARIFICATION },
    });
    if (!value.success) return Promise.resolve(invalid("clarification", value.error));
    return this.#publish(
      p.data,
      "pc_intrinsic_clarification",
      pcIntrinsicClarificationKey(input.pc_id, id),
      value.data,
      0,
      [contract.key, binding.key, TEMPORAL_STATE_KEY, referee.key],
    );
  }

  /** The PC's committed clarification of this identity, if any. */
  clarification(
    pcId: string,
    clarificationId: string,
  ): Typed<PcIntrinsicClarification> | undefined {
    return this.#typed(
      pcIntrinsicClarificationKey(pcId, clarificationId),
      PcIntrinsicClarificationSchema,
    );
  }

  /**
   * v0.3 F-2: the bounded task the I-002 compiler/adjudicator (`role.gm`) interprets to attest the PC's serial handling cycle: the cited
   * claims' committed wording, the mechanism's actuator and its stated cycle. Undefined while the mechanism is not committed.
   */
  cycleTask(pcId: string, mechanismId: string): PcCollectionCycleTask | undefined {
    const mech = this.mechanism(pcId, mechanismId);
    if (!mech) return undefined;
    const task = buildCycleTask(this.#view(), mech);
    return task.ok ? task.value : undefined;
  }

  /**
   * v0.3 F-2: validates the host's UNTRUSTED reading against the task and, only for the reading that the cited content denotes ONE
   * same-form unit handled by the named actuator in ONE serial cycle with every ground a verbatim quotation, writes the I-002 owner's
   * versioned attestation under `role.archivist` + `permission.canon.write` (applied here, never read from the answer), effective from
   * the canonical time and never retroactively. Anything else writes nothing: an unattested claim cannot ground an exact cycle. The
   * identities derive from the PC and the mechanism, so presenting it again reconciles by identity.
   */
  async attestCycle(input: {
    readonly pc_id: string;
    readonly mechanism_id: string;
    readonly answer: unknown;
  }): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const id = pcCollectionAttestationId(input.pc_id, input.mechanism_id);
    const identity = {
      group_id: `pc-attest-group:${input.pc_id}:${input.mechanism_id}`,
      intent_id: `pc-attest-intent:${input.pc_id}:${input.mechanism_id}`,
      cause: `pc-attest-cause:${input.pc_id}:${input.mechanism_id}`,
      basis: REFEREE_DECISION_BASIS,
      secrecy: REFEREE_SECRECY,
    };
    const replay = this.#store.committedGroup(identity.intent_id);
    if (replay) return this.#store.commit(replay);
    const mech = this.mechanism(input.pc_id, input.mechanism_id);
    const task = this.cycleTask(input.pc_id, input.mechanism_id);
    if (!mech || !task)
      return fail("PREREQUISITE_MISSING", "the premises of the attestation are not committed");
    const interpreted = interpretCycleAnswer(task, input.answer);
    if (!interpreted.ok) return fail("ANSWER_INVALID", interpreted.error.message);
    const now = this.#view().get(TEMPORAL_STATE_KEY);
    const clock = now
      ? (now.value as { canonical_time: PcCollectionCycleAttestation["effective_from"] })
          .canonical_time
      : undefined;
    if (!clock) return fail("PREREQUISITE_MISSING", "no canonical temporal basis is established");
    const m = mech.value;
    const value = PcCollectionCycleAttestationSchema.safeParse({
      attestation_id: id,
      pc_id: input.pc_id,
      mechanism: { fact_key: mech.fact.key, version: mech.fact.version },
      contract: m.authored_from.contract,
      claims: m.authored_from.claims,
      ...(m.authored_from.clarified && m.authored_from.clarified.length > 0
        ? { clarified: m.authored_from.clarified }
        : {}),
      attestor: { role: "role.gm", permission: "permission.rule.adjudicate" },
      meaning: PC_CYCLE_MEANING,
      actuator_ground: interpreted.value.actuator_ground,
      cycle_ground: interpreted.value.cycle_ground,
      grounds: interpreted.value.grounds,
      temporal_hook: {
        hook_id: pcCycleHookId(input.pc_id, input.mechanism_id),
        version: 1,
        operation: "serial-handling-cycle",
        per_cycle: m.cycle.duration,
      },
      effective_from: clock,
      task_digest: task.digest,
      committer: { owner: "pc_existence", facet: "pc_collection_mechanism" },
    });
    if (!value.success) return invalid("attestation", value.error);
    return this.#publish(
      identity,
      "pc_collection_cycle_attestation",
      pcCollectionAttestationKey(input.pc_id, input.mechanism_id),
      value.data,
      0,
      [
        mech.fact.key,
        pcExistenceContractKey(input.pc_id),
        TEMPORAL_STATE_KEY,
        ...(m.authored_from.clarified ?? []).map((c) => c.clarification.fact_key),
      ],
    );
  }

  /**
   * v0.3 F-3: Population's own determination of the PC's relation to its effective aggregate workforce, DERIVED from its ledgers and
   * the PC's identity (a caller supplies nothing). Whatever it derives is recorded as it is (OUTSIDE_AGGREGATE, INCLUDED or UNKNOWN);
   * only OUTSIDE lets the registration proceed.
   */
  determineRepresentation(
    input: Publication & { readonly pc_id: string; readonly source_fact_key: string },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const src = this.#store.getFact(input.source_fact_key);
    const source = src ? this.#sourceValue(src) : undefined;
    if (!source)
      return Promise.resolve(fail("PREREQUISITE_MISSING", "the source is not committed"));
    const derived = derivePcRepresentation(input.pc_id, source.locality, this.#view());
    if (!derived.ok) return Promise.resolve(fail("PREREQUISITE_MISSING", derived.error.message));
    const prior = this.#store.getFact(popPcRepresentationKey(input.pc_id));
    return this.#publish(
      p.data,
      "population_pc_representation",
      popPcRepresentationKey(input.pc_id),
      derived.value,
      prior?.version ?? 0,
      [
        TEMPORAL_STATE_KEY,
        ...derived.value.ledgers.map((l) => l.fact_key),
        ...(derived.value.scope ? [derived.value.scope.fact_key] : []),
        ...(prior ? [prior.key] : []),
      ],
    );
  }

  /**
   * NEWLY AUTHORIZED (bounded semantic delegation): the author's declaration that one ORIGINAL physical setting is a closed domain.
   * The domain, topology, closure statement and per-source rights are the author's canon; the coverage (who the owners hold at this
   * locus) is DERIVED here from their live facts and re-derived by admission, never supplied. The declaration is create-only.
   */
  establishSceneClosure(
    input: Publication & {
      readonly world_id: string;
      readonly locus_id: string;
      readonly domain: unknown;
      readonly closure: unknown;
      readonly source_rights: readonly { source_fact_key: string; ground: string }[];
    },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const view = this.#view();
    const now = view.get(TEMPORAL_STATE_KEY);
    const world = this.#store.getFact(worldProfileKey(input.world_id));
    const locus = this.#store.getFact(worldLocusKey(input.world_id, input.locus_id));
    if (!now || !world || !locus)
      return Promise.resolve(
        fail(
          "PREREQUISITE_MISSING",
          "the world, the locus and the canonical time are committed first",
        ),
      );
    const locality = {
      world: { fact_key: world.key, entity_id: input.world_id },
      locus: { fact_key: locus.key, entity_id: input.locus_id },
    };
    const covered = liveSceneCoverage(view, locality);
    const priorClosure = this.#store.getFact(worldSceneClosureKey(input.world_id, input.locus_id));
    const value = WorldSceneClosureSchema.safeParse({
      locality: { world_id: input.world_id, locus_id: input.locus_id },
      world: { fact_key: world.key, version: world.version },
      locus: { fact_key: locus.key, version: locus.version },
      domain: input.domain,
      closure: input.closure,
      source_rights: [...input.source_rights]
        .map((r) => ({
          source_fact_key: r.source_fact_key,
          status: "UNENCUMBERED",
          ground: r.ground,
        }))
        .sort((a, b) => (a.source_fact_key < b.source_fact_key ? -1 : 1)),
      covered,
      effective_at: (now.value as { canonical_time: unknown }).canonical_time,
      committer: { owner: "world_state", facet: "world_scene_closure" },
    });
    if (!value.success) return Promise.resolve(invalid("scene closure", value.error));
    return this.#publish(
      p.data,
      "world_scene_closure",
      worldSceneClosureKey(input.world_id, input.locus_id),
      value.data,
      priorClosure?.version ?? 0,
      [
        ...(priorClosure ? [priorClosure.key] : []),
        TEMPORAL_STATE_KEY,
        world.key,
        locus.key,
        ...covered.population_ledgers.map((l) => l.fact_key),
        ...covered.actors.map((a) => worldActorCouplingKey(a)),
        ...covered.pcs.map((pc) => worldPcLocusCustodyKey(pc)),
        ...value.data.source_rights.map((r) => r.source_fact_key),
      ],
    );
  }

  /**
   * NEWLY AUTHORIZED (bounded semantic delegation): Population's declaration that the representations it lists are all those bearing
   * on one locality's effective aggregate workforce. The statement is the declaration's; the representations and their identity/count
   * provenance are DERIVED here from Population's ledgers and re-derived by admission. Re-declared as a new version; no labor arithmetic.
   */
  establishWorkforceScope(
    input: Publication & {
      readonly world_id: string;
      readonly locus_id: string;
      readonly scope: unknown;
    },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const view = this.#view();
    const now = view.get(TEMPORAL_STATE_KEY);
    if (!now)
      return Promise.resolve(fail("PREREQUISITE_MISSING", "the canonical time is committed first"));
    const locality = {
      world: { fact_key: worldProfileKey(input.world_id), entity_id: input.world_id },
      locus: { fact_key: worldLocusKey(input.world_id, input.locus_id), entity_id: input.locus_id },
    };
    const accounting = deriveWorkforceAccounting(view, locality);
    const priorScope = this.#store.getFact(popWorkforceScopeKey(input.world_id, input.locus_id));
    const value = PopulationWorkforceScopeSchema.safeParse({
      locality: { world_id: input.world_id, locus_id: input.locus_id },
      scope: input.scope,
      ...accounting,
      determined_at: (now.value as { canonical_time: unknown }).canonical_time,
      committer: { owner: "population", facet: "population_workforce_scope" },
    });
    if (!value.success) return Promise.resolve(invalid("workforce scope", value.error));
    return this.#publish(
      p.data,
      "population_workforce_scope",
      popWorkforceScopeKey(input.world_id, input.locus_id),
      value.data,
      priorScope?.version ?? 0,
      [
        ...(priorScope ? [priorScope.key] : []),
        TEMPORAL_STATE_KEY,
        ...accounting.representations.map((r) => r.fact_key),
      ],
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
    // v0.3 F-1: no owner scene evidence, no task: the solitary class is withheld before any host is asked
    const scene = buildSceneEvidence(this.#view(), pcId, source.locality, srcFact.key);
    if ("reason" in scene) return undefined;
    return buildPcCollectionReachTask(
      pcId,
      actId,
      { key: srcFact.key, value: source },
      { key: mech.fact.key, version: mech.fact.version, value: mech.value },
      scene,
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
      scene_evidence: task.scene,
      answer: interpreted.value.answer,
      verdict: interpreted.value.verdict,
      scene_verdict: interpreted.value.scene_verdict,
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
    const representation = this.#store.getFact(popPcRepresentationKey(input.pc_id));
    if (!representation)
      return fail(
        "PREREQUISITE_MISSING",
        "Population has not determined the PC's relation to its aggregate workforce: the class is withheld",
      );
    const value = PopulationPcOccupancySchema.safeParse({
      pc_id: input.pc_id,
      act_id: input.act_id,
      status: PC_OCCUPANCY_OPEN,
      interval: { from: interval.value.from, to: interval.value.to },
      commitment: { fact_key: pre.commitment.fact.key, version: pre.commitment.fact.version },
      mechanism: { fact_key: pre.mechanism.fact.key, version: pre.mechanism.fact.version },
      representation: { fact_key: representation.key, version: representation.version },
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
        representation.key,
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
        interaction_floor: t.floor,
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

  /**
   * D-1 (PROVISIONAL), step 1: the PC-side record of the player's separately confirmed request to cease the SAME in-flight collection.
   * Everything but the identities and the authored authority is DERIVED from committed state and the canonical time (the request
   * time, the pins); a request that is not lawful now (not in flight, closed, an unresolved earlier boundary, no current authority)
   * is refused and writes nothing.
   */
  cease(
    input: Publication & { readonly cessation: unknown },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const c = PcCollectionCessationInputSchema.safeParse(input.cessation);
    if (!c.success) return Promise.resolve(invalid("cessation", c.error));
    const derived = deriveCessation(c.data, this.#view());
    if (!derived.ok) return Promise.resolve(fail("PREREQUISITE_MISSING", derived.error.message));
    const v = derived.value;
    return this.#publish(
      p.data,
      "pc_collection_cessation",
      pcCollectionCessationKey(v.pc_id, v.act_id),
      v,
      0,
      [
        v.intent.target.commitment.fact_key,
        v.intent.target.work.fact_key,
        PLAYER_CHARACTER_BINDING_KEY,
        worldPcLocusCustodyKey(v.pc_id),
        popPcOccupancyKey(v.pc_id),
        TEMPORAL_STATE_KEY,
        TEMPORAL_BOUNDARY_INDEX_KEY,
      ],
    );
  }

  /**
   * D-1 (PROVISIONAL), step 2: Production's terminal disposition of the withdrawn work, DERIVED from the committed cessation, the
   * work record and the canonical time. In ONE atomic group it records the disposition and releases the key's claim on the source
   * (Production's own account); the source and the Reserve are not written. The elapsed progress is retained as evidence and awards
   * nothing. There is no parameter for a result, a credit or a boundary.
   */
  async terminate(
    input: Publication & { readonly pc_id: string; readonly act_id: string },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const facts = this.#view();
    const derived = deriveTermination(input.pc_id, input.act_id, facts);
    if (!derived.ok) return fail("PREREQUISITE_MISSING", derived.error.message);
    const t = derived.value;
    const c = collectionFacts(facts, t.pc_id, t.act_id)!;
    const accountFact = this.#store.getFact(c.extraction.value.account.fact_key);
    const account = accountFact ? parseAccount(accountFact) : undefined;
    if (!accountFact || !account)
      return fail("VALUE_INVALID", "the key's account is malformed", {
        key: c.extraction.value.account.fact_key,
      });
    const value = ProductionPcCollectionTerminationSchema.safeParse(t);
    if (!value.success) return invalid("termination", value.error);
    const nextAccount = SourceAccountSchema.safeParse({
      ...account,
      open: account.open.filter((o) => o.extraction_id !== t.termination_id),
    });
    if (!nextAccount.success) return invalid("account", nextAccount.error);
    const kind = factKind("production_pc_collection_termination");
    const readKeys = [
      t.pins.cessation.fact_key,
      c.work.fact.key,
      c.extraction.fact.key,
      popPcOccupancyKey(t.pc_id),
      TEMPORAL_STATE_KEY,
      TEMPORAL_BOUNDARY_INDEX_KEY,
      temporalObjectKey(productionExtractionObjectId(t.termination_id)),
      accountFact.key,
    ];
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.data.group_id,
      intent_id: p.data.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.data.cause,
      rule: PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: readKeys.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
      depends_on: [
        ...new Set(readKeys.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ],
      writes: [
        {
          key: productionPcCollectionTerminationKey(t.termination_id),
          value: value.data,
          expected_version: 0,
        },
        { key: accountFact.key, value: nextAccount.data, expected_version: accountFact.version },
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

  /**
   * R-4 (NEWLY AUTHORIZED), step 1: Production's NON-VOLUNTARY, NON-PRODUCTIVE lapse of the act at its own held earned boundary, DERIVED from
   * committed facts alone (no parameter for a reason, a result, a credit, a time or a boundary). In ONE atomic group it records the lapse and
   * releases the key's single claim on the source (Production's own account); the source and the Reserve are not written. It resumes, advances
   * and consumes nothing. RED C-1: it is refused unless every premise-input fact predates the held crossing transaction's opening.
   */
  async lapse(
    input: Publication & { readonly pc_id: string; readonly act_id: string },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const replay = this.#store.committedGroup(p.data.intent_id);
    if (replay) return this.#store.commit(replay);
    const facts = this.#view();
    const lineage = acceptableHeldLineage(facts);
    if (!lineage.ok) return fail("PREREQUISITE_MISSING", lineage.error.message);
    const opened = this.#store.getFact(
      temporalTransactionAuthorityKey(lineage.value.held.value.transaction_id),
    );
    const openedAt = opened
      ? this.#store.lookupReceipt(opened.provenance.intent_id)?.revision
      : undefined;
    if (openedAt === undefined)
      return fail("PREREQUISITE_MISSING", "the held transaction's opening is not committed");
    const work = collectionFacts(facts, input.pc_id, input.act_id);
    if (!work)
      return fail("PREREQUISITE_MISSING", "no started collection of this PC and act is committed");
    const basis = lapseCauseViolation({
      work: work.work.value,
      facts,
      openedAt,
      until: null,
      revisionOf: (k) => {
        const f = this.#store.getFact(k);
        return f ? this.#store.lookupReceipt(f.provenance.intent_id)?.revision : undefined;
      },
    });
    if (basis) return fail("PREREQUISITE_MISSING", basis);
    const derived = deriveLapse(input.pc_id, input.act_id, facts);
    if (!derived.ok) return fail("PREREQUISITE_MISSING", derived.error.message);
    const l = derived.value;
    const c = collectionFacts(facts, l.pc_id, l.act_id)!;
    const accountFact = this.#store.getFact(c.extraction.value.account.fact_key);
    const account = accountFact ? parseAccount(accountFact) : undefined;
    if (!accountFact || !account)
      return fail("VALUE_INVALID", "the key's account is malformed", {
        key: c.extraction.value.account.fact_key,
      });
    const value = ProductionPcCollectionLapseSchema.safeParse(l);
    if (!value.success) return invalid("lapse", value.error);
    const nextAccount = SourceAccountSchema.safeParse({
      ...account,
      open: account.open.filter((o) => o.extraction_id !== l.lapse_id),
    });
    if (!nextAccount.success) return invalid("account", nextAccount.error);
    const kind = factKind("production_pc_collection_lapse");
    const readKeys = [
      c.commitment.fact.key,
      c.work.fact.key,
      c.extraction.fact.key,
      l.pins.held_transaction.fact_key,
      popPcOccupancyKey(l.pc_id),
      TEMPORAL_STATE_KEY,
      TEMPORAL_BOUNDARY_INDEX_KEY,
      temporalObjectKey(productionExtractionObjectId(l.lapse_id)),
      accountFact.key,
    ];
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: p.data.group_id,
      intent_id: p.data.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.data.cause,
      rule: PRODUCTION_PC_COLLECTION_LAPSE_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: readKeys.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
      depends_on: [
        ...new Set(readKeys.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ],
      writes: [
        {
          key: productionPcCollectionLapseKey(l.lapse_id),
          value: value.data,
          expected_version: 0,
        },
        { key: accountFact.key, value: nextAccount.data, expected_version: accountFact.version },
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

  /**
   * R-4 (NEWLY AUTHORIZED), step 3: Population releases the SAME PC's individual occupied interval exactly once, with the status
   * RELEASED_LAPSED, only after Production sealed the lapse and Temporal retired the pending boundary (admission requires both).
   */
  releaseOccupancyLapsed(
    input: Publication & { readonly pc_id: string; readonly act_id: string },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const prior = this.occupancy(input.pc_id);
    if (!prior || prior.value.act_id !== input.act_id)
      return Promise.resolve(fail("PREREQUISITE_MISSING", "no registration of this act is held"));
    const extractionId = pcCollectionRequestId(input.pc_id, input.act_id);
    return this.#publish(
      p.data,
      "population_pc_occupancy",
      popPcOccupancyKey(input.pc_id),
      { ...prior.value, status: PC_OCCUPANCY_RELEASED_LAPSED },
      prior.fact.version,
      [
        productionPcCollectionLapseKey(extractionId),
        temporalObjectKey(productionExtractionObjectId(extractionId)),
        popPcOccupancyKey(input.pc_id),
      ],
      POPULATION_PC_OCCUPANCY_LAPSE_RULE,
    );
  }

  /** R-4: Production's lapse of the act, or undefined. */
  lapseRecord(pcId: string, actId: string): Typed<ProductionPcCollectionLapse> | undefined {
    return this.#typed(
      productionPcCollectionLapseKey(pcCollectionRequestId(pcId, actId)),
      ProductionPcCollectionLapseSchema,
    );
  }

  /**
   * D-1 (PROVISIONAL), step 4: Population releases the SAME PC's individual occupied interval, exactly once, only after Production
   * committed the termination of this act and Temporal retired its pending boundary (admission requires both).
   */
  releaseOccupancyTerminated(
    input: Publication & { readonly pc_id: string; readonly act_id: string },
  ): Promise<Result<CommitOutcome, PcCollectionErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return Promise.resolve(invalid("publication", p.error));
    const prior = this.occupancy(input.pc_id);
    if (!prior || prior.value.act_id !== input.act_id)
      return Promise.resolve(fail("PREREQUISITE_MISSING", "no registration of this act is held"));
    const extractionId = pcCollectionRequestId(input.pc_id, input.act_id);
    return this.#publish(
      p.data,
      "population_pc_occupancy",
      popPcOccupancyKey(input.pc_id),
      { ...prior.value, status: PC_OCCUPANCY_RELEASED_TERMINATED },
      prior.fact.version,
      [
        productionPcCollectionTerminationKey(extractionId),
        temporalObjectKey(productionExtractionObjectId(extractionId)),
        popPcOccupancyKey(input.pc_id),
      ],
      POPULATION_PC_OCCUPANCY_TERMINATION_RULE,
    );
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
  attestation(pcId: string, mechanismId: string): Typed<PcCollectionCycleAttestation> | undefined {
    return this.#typed(
      pcCollectionAttestationKey(pcId, mechanismId),
      PcCollectionCycleAttestationSchema,
    );
  }
  /** Is the committed closure still CURRENT (what the owners hold still equals what it covered)? False when none is committed. */
  sceneClosureIsCurrent(worldId: string, locusId: string): boolean {
    const c = this.sceneClosure(worldId, locusId);
    return c !== undefined && sceneClosureStatus(c.value, this.#view()) === null;
  }
  /** Is the committed workforce scope still CURRENT? False when none is committed. */
  workforceScopeIsCurrent(worldId: string, locusId: string): boolean {
    const s = this.workforceScope(worldId, locusId);
    return s !== undefined && workforceScopeStatus(s.value, this.#view()) === null;
  }
  sceneClosure(worldId: string, locusId: string): Typed<WorldSceneClosure> | undefined {
    return this.#typed(worldSceneClosureKey(worldId, locusId), WorldSceneClosureSchema);
  }
  workforceScope(worldId: string, locusId: string): Typed<PopulationWorkforceScope> | undefined {
    return this.#typed(popWorkforceScopeKey(worldId, locusId), PopulationWorkforceScopeSchema);
  }
  representation(pcId: string): Typed<PopulationPcRepresentation> | undefined {
    return this.#typed(popPcRepresentationKey(pcId), PopulationPcRepresentationSchema);
  }
  cessation(pcId: string, actId: string): Typed<PcCollectionCessation> | undefined {
    return this.#typed(pcCollectionCessationKey(pcId, actId), PcCollectionCessationSchema);
  }
  termination(pcId: string, actId: string): Typed<ProductionPcCollectionTermination> | undefined {
    return this.#typed(
      productionPcCollectionTerminationKey(pcCollectionRequestId(pcId, actId)),
      ProductionPcCollectionTerminationSchema,
    );
  }
  occupancy(pcId: string): Typed<PopulationPcOccupancy> | undefined {
    const rec = pcOccupancyRecord(
      { get: (k) => this.#store.getFact(k), has: (k) => this.#store.getFact(k) !== undefined },
      pcId,
    );
    return rec ? { fact: rec.fact, value: rec.value } : undefined;
  }
  /** What holds the PC's time, derived from committed facts alone (a read; it releases or decides nothing). */
  hold(pcId: string): PcCollectionHold {
    return pcCollectionHold(this.#view(), pcId);
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

  #view() {
    return {
      get: (k: string) => this.#store.getFact(k),
      has: (k: string) => this.#store.getFact(k) !== undefined,
      // only the Population ledgers are ever found by enumerating (a diagnostic-grade scan, by key shape)
      values: () => this.#store.listFacts(),
    };
  }

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
    rule?: CommitGroup["rule"],
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
      rule: rule ?? kind.rule,
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
