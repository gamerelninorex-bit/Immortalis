import {
  FACET_PC_COLLECTION_MECHANISM,
  PC_OCCUPANCY_OPEN,
  PC_OCCUPANCY_RELEASED_DENIED,
  PC_OCCUPANCY_RELEASED_TERMINATED,
  PcCollectionCessationSchema,
  PcCollectionCycleAttestationSchema,
  PopulationPcRepresentationSchema,
  popPcRepresentationKey,
  ProductionPcCollectionTerminationSchema,
  BoundaryIndexSchema,
  SourceAccountSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TemporalObjectSchema,
  EXTRACTION_OBJECT_PREFIX,
  productionPcCollectionTerminationKey,
  temporalObjectKey,
  ProductionExtractionSchema as ExtractionSchema,
  productionExtractionObjectId,
  PLAYER_CHARACTER_BINDING_KEY,
  PcCollectionCommitmentSchema,
  PcCollectionMechanismSchema,
  PcCollectionReachDecisionSchema,
  PopulationPcOccupancySchema,
  ProductionPcCollectionWorkSchema,
  ProductionRequestSchema,
  TEMPORAL_STATE_KEY,
  compareTime,
  pcCollectionCommitmentKey,
  pcCollectionMechanismKey,
  pcCollectionReachKey,
  pcCollectionRequestId,
  pcCollectionRequestKey,
  pcExistenceContractKey,
  popPcOccupancyKey,
  productionExtractionKey,
  productionPcCollectionWorkKey,
  worldPcLocusCustodyKey,
  OWNER_PC_EXISTENCE,
  REFEREE_AUTHORITY,
  REFEREE_DECISION_BASIS,
  REFEREE_SECRECY,
  type CommitGroup,
  type LocusRef,
  type ProductionExtraction,
  type WorldSourceCondition,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  PC_COLLECTION_ATTESTATION_RULE,
  PC_COLLECTION_CESSATION_RULE,
  POPULATION_PC_OCCUPANCY_TERMINATION_RULE,
  PRODUCTION_PC_COLLECTION_TERMINATION_RULE,
  PRODUCTION_PC_COLLECTION_WORK_RULE,
  TEMPORAL_PC_COLLECTION_RETIREMENT_RULE,
  resolveKey,
} from "../owners/registry.ts";
import { parseAccount } from "../source-drawdown/derive.ts";
import {
  collectionFacts,
  engagedExtractionObject,
  pcCollectionCessationViolation,
  pcCollectionTerminationViolation,
} from "./cessation.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { pcCycleAttestationViolation, pcRepresentationViolation } from "./determinations.ts";
import {
  pcStandingViolation,
  pcRepresentationHolds,
  deriveOccupancyInterval,
  pcCollectionCommitmentViolation,
  pcCollectionMechanismViolation,
  pcCollectionPremiseViolation,
  pcCollectionPreconditions,
  pcCollectionReachViolation,
  pcCollectionRequestViolation,
  pcCollectionWorkViolation,
  pcOccupancyState,
} from "./derive.ts";
import { pcOccupancyRecord } from "./state.ts";

/**
 * CPAA-C1 v0.2 PROVISIONAL — IM-11 admission of the collection facts. Pure: a function of (group, state) only, so it holds for a raw
 * `store.commit` exactly as for the owner publications. Each fact is RE-DERIVED here from the committed owner facts it rests on
 * (never trusted), reads and depends on every foreign fact it references (never copies), and no fact asserts a verdict, a result, a
 * feasibility or a time it was handed.
 */
type Write = CommitGroup["writes"][number];

const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

const need = (
  group: CommitGroup,
  state: CampaignState,
  prerequisites: readonly (readonly [string, string])[],
): Rejection | null => {
  for (const [key, what] of prerequisites) {
    const p = requirePrerequisite(group, state, key, what);
    if (isRejection(p)) return p;
  }
  return null;
};

/** Groups of the PC owner's collection facets: the commitment-of-record, the PC-owned request and the P-1 mechanism. */
export function pcCollectionGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length !== 1)
    return reject("VALUE_INVALID", "one publication establishes exactly one PC collection fact");
  const w = group.writes[0]!;
  const kind = resolveKey(w.key)?.kind.id;
  if (kind === "pc_collection_commitment") {
    const c = PcCollectionCommitmentSchema.parse(w.value);
    const missing = need(group, state, [
      [pcExistenceContractKey(c.pc_id), "the PC's released contract"],
      [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
      [worldPcLocusCustodyKey(c.pc_id), "the PC's physical-locus custody record"],
      [c.intent.source.fact_key, "the World-State Source Condition"],
      [c.intent.destination.fact_key, "the destination Production Reserve"],
      [c.basis.cycle.mechanism.fact_key, "the PC's mechanism"],
      [c.basis.cycle.attestation.fact_key, "the semantic attestation of the PC's serial cycle"],
    ]);
    if (missing) return missing;
    const v = pcCollectionCommitmentViolation(w.key, c, state.facts);
    return v ? ref(v, { key: w.key }) : null;
  }
  if (kind === "pc_collection_request") {
    const r = ProductionRequestSchema.parse(w.value);
    const m = /^pc\/([^/]+)\/collection\/([^/]+)\/request$/.exec(w.key);
    if (!m) return ref("a PC collection request is in the PC-side collection key space");
    const commitmentKey = pcCollectionCommitmentKey(m[1]!, m[2]!);
    const commitment = state.facts.get(commitmentKey);
    const parsed = commitment ? PcCollectionCommitmentSchema.safeParse(commitment.value) : null;
    const missing = need(group, state, [
      [commitmentKey, "the player's collection commitment-of-record"],
      ...(parsed?.success
        ? ([[parsed.data.intent.source.fact_key, "the World-State Source Condition"]] as const)
        : []),
    ]);
    if (missing) return missing;
    const v = pcCollectionRequestViolation(w.key, r, state.facts);
    return v ? ref(v, { key: w.key }) : null;
  }
  if (kind === "pc_collection_mechanism" && group.facet === FACET_PC_COLLECTION_MECHANISM) {
    const mech = PcCollectionMechanismSchema.parse(w.value);
    const missing = need(group, state, [
      [pcExistenceContractKey(mech.pc_id), "the PC's released contract"],
    ]);
    if (missing) return missing;
    const v = pcCollectionMechanismViolation(w.key, mech, state.facts);
    return v ? ref(v, { key: w.key }) : null;
  }
  if (kind === "pc_collection_cycle_attestation" && group.facet === FACET_PC_COLLECTION_MECHANISM) {
    const a = PcCollectionCycleAttestationSchema.parse(w.value);
    // v0.3 F-2: the I-002 owner's versioned attestation, created once and re-derived
    if (!canonicalEqual(group.rule, PC_COLLECTION_ATTESTATION_RULE))
      return ref("an attestation is governed by the ratified v0.3 P-1 attestation rule", {
        key: w.key,
      });
    const missing = need(group, state, [
      [a.mechanism.fact_key, "the PC's mechanism"],
      [pcExistenceContractKey(a.pc_id), "the PC's released contract"],
      [TEMPORAL_STATE_KEY, "the canonical temporal state"],
    ]);
    if (missing) return missing;
    const v = pcCycleAttestationViolation(w.key, a, state.facts);
    return v ? ref(v, { key: w.key }) : null;
  }
  if (kind === "pc_collection_cessation") {
    const c = PcCollectionCessationSchema.parse(w.value);
    // D-1 (PROVISIONAL)
    if (!canonicalEqual(group.rule, PC_COLLECTION_CESSATION_RULE))
      return ref("a cessation is governed by the provisional D-1 cessation rule", { key: w.key });
    const missing = need(group, state, [
      [
        pcCollectionCommitmentKey(c.pc_id, c.act_id),
        "the player's collection commitment-of-record",
      ],
      [
        productionPcCollectionWorkKey(pcCollectionRequestId(c.pc_id, c.act_id)),
        "Production's work record",
      ],
      [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
      [worldPcLocusCustodyKey(c.pc_id), "the PC's physical-locus custody record"],
      [popPcOccupancyKey(c.pc_id), "the PC's occupancy registration"],
      [TEMPORAL_STATE_KEY, "the canonical temporal state"],
      [TEMPORAL_BOUNDARY_INDEX_KEY, "the boundary index"],
    ]);
    if (missing) return missing;
    const v = pcCollectionCessationViolation(w.key, c, state.facts);
    return v ? ref(v, { key: w.key }) : null;
  }
  return reject(
    "VALUE_INVALID",
    "the PC collection facets hold only the commitment, the request, the mechanism, its attestation and the cessation",
  );
}

/**
 * D-1 (PROVISIONAL) — Production's terminal disposition of a withdrawn in-flight collection, with its one effect on Production's own
 * state: the key's account releases its claim on the source (nothing else of the account changes). The termination is exactly what the
 * committed cessation, work record and canonical time derive; the account is exactly the prior account without that one commitment;
 * the source, the Reserve and every Source Delta are untouched (no write of them is representable in this group).
 */
export function pcCollectionTerminationGroupCheck(
  group: CommitGroup,
  state: CampaignState,
  termW: Write,
  accountW: Write,
): Rejection | null {
  if (!canonicalEqual(group.rule, PRODUCTION_PC_COLLECTION_TERMINATION_RULE))
    return ref("a termination is governed by the provisional D-1 termination rule");
  if (termW.expected_version !== 0 || accountW.expected_version === 0)
    return reject("VALUE_INVALID", "a termination is created once and releases an opened account");
  const t = ProductionPcCollectionTerminationSchema.parse(termW.value);
  const f = collectionFacts(state.facts, t.pc_id, t.act_id);
  if (!f)
    return reject("PREREQUISITE_MISSING", "no started collection of this PC and act is committed");
  const id = f.work.value.work_id;
  const missing = need(group, state, [
    [t.pins.cessation.fact_key, "the PC's cessation request"],
    [f.work.fact.key, "Production's work record"],
    [f.extraction.fact.key, "the extraction"],
    [popPcOccupancyKey(t.pc_id), "the PC's occupancy registration"],
    [TEMPORAL_STATE_KEY, "the canonical temporal state"],
    [TEMPORAL_BOUNDARY_INDEX_KEY, "the boundary index"],
    [temporalObjectKey(productionExtractionObjectId(id)), "the extraction's temporal object"],
    [f.extraction.value.account.fact_key, "the key's account"],
  ]);
  if (missing) return missing;
  const v = pcCollectionTerminationViolation(termW.key, t, state.facts);
  if (v) return ref(v, { key: termW.key });
  const account = parseAccount(state.facts.get(accountW.key));
  if (accountW.key !== f.extraction.value.account.fact_key || !account)
    return ref("the termination releases the claim on the extraction's own account");
  if (state.facts.get(accountW.key)!.version !== accountW.expected_version)
    return reject("VERSION_CONFLICT", "the account moved since it was read", { key: accountW.key });
  const parsed = SourceAccountSchema.safeParse(accountW.value);
  const expected = { ...account, open: account.open.filter((o) => o.extraction_id !== id) };
  if (!parsed.success || !canonicalEqual(parsed.data, expected))
    return reject(
      "VALUE_INVALID",
      "a termination changes the account only by releasing this extraction's claim",
    );
  return null;
}

/**
 * D-1 (PROVISIONAL) — Temporal's retirement of a terminated extraction's pending earned boundary: ONE group writing exactly that
 * extraction's object (its earned boundary retired — superseded, never resolved; the resolved basis is untouched) and the boundary index
 * without that entry. It moves no canonical time, resolves no stage and touches no other object or index entry; it is lawful only after
 * Production committed the termination.
 */
export function pcCollectionRetirementGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  const kind = (k: string) => resolveKey(k)?.kind.id;
  const objW = group.writes.filter((w) => kind(w.key) === "temporal_object");
  const idxW = group.writes.filter((w) => kind(w.key) === "temporal_boundary_index");
  if (group.writes.length !== 2 || objW.length !== 1 || idxW.length !== 1)
    return reject(
      "VALUE_INVALID",
      "a retirement writes exactly one extraction object and the index",
    );
  const ow = objW[0]!;
  const iw = idxW[0]!;
  if (!canonicalEqual(group.rule, TEMPORAL_PC_COLLECTION_RETIREMENT_RULE))
    return ref("a retirement is governed by the provisional D-1 retirement rule");
  const obj = TemporalObjectSchema.parse(ow.value);
  if (!obj.object_id.startsWith(EXTRACTION_OBJECT_PREFIX))
    return ref("only an extraction's object is retired by a termination");
  const extractionId = obj.object_id.slice(EXTRACTION_OBJECT_PREFIX.length);
  if (!extractionId.startsWith("pc-collect:") || ow.key !== temporalObjectKey(obj.object_id))
    return ref("only a PC-owned collection's extraction object is retired by a termination");
  const missing = need(group, state, [
    [productionPcCollectionTerminationKey(extractionId), "Production's termination of this act"],
  ]);
  if (missing) return missing;
  const exFact = state.facts.get(productionExtractionKey(extractionId));
  const ex = exFact ? ExtractionSchema.safeParse(exFact.value) : undefined;
  if (!ex?.success || ex.data.request.owner !== OWNER_PC_EXISTENCE)
    return ref("a retired object is a PC-owned collection's extraction object");
  const prior = engagedExtractionObject(state.facts, extractionId);
  const priorFact = state.facts.get(ow.key);
  if (
    !prior ||
    !priorFact ||
    ow.expected_version !== priorFact.version ||
    !prior.value.next_boundary
  )
    return reject(
      "PREREQUISITE_MISSING",
      "only an object with a pending earned boundary is retired",
    );
  if (!canonicalEqual(obj, { ...prior.value, next_boundary: null }))
    return reject(
      "VALUE_INVALID",
      "a retirement removes only the pending earned boundary of the object",
    );
  const indexFact = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY);
  const index = indexFact ? BoundaryIndexSchema.safeParse(indexFact.value) : undefined;
  if (!indexFact || !index?.success || iw.expected_version !== indexFact.version)
    return reject("PREREQUISITE_MISSING", "the boundary index is read at its current version");
  const post = BoundaryIndexSchema.safeParse(iw.value);
  if (
    !post.success ||
    !canonicalEqual(
      post.data.entries,
      index.data.entries.filter((e) => e.object_id !== obj.object_id),
    )
  )
    return reject("VALUE_INVALID", "the index loses only the retired object's boundary");
  return null;
}

/** The deterministic group/intent/cause identities of a reach decision, derived from the PC and act alone. */
export const pcReachGroupId = (pcId: string, actId: string): string =>
  `pc-collect-reach-group:${pcId}:${actId}`;
export const pcReachIntentId = (pcId: string, actId: string): string =>
  `pc-collect-reach-intent:${pcId}:${actId}`;
export const pcReachCause = (pcId: string, actId: string): string =>
  `pc-collect-reach-cause:${pcId}:${actId}`;

/** The referee-provenance group of one physical-reach judgment (`role.gm` + `permission.rule.adjudicate`), created once and re-derived. */
export function pcReachGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length !== 1 || group.writes[0]!.expected_version !== 0)
    return reject("VALUE_INVALID", "a reach judgment is one record, created once");
  const w = group.writes[0]!;
  const d = PcCollectionReachDecisionSchema.parse(w.value);
  if (w.basis !== REFEREE_DECISION_BASIS || w.secrecy !== REFEREE_SECRECY || w.unit !== null)
    return reject("VALUE_INVALID", "the judgment carries its fixed OwnerFact metadata", {
      key: w.key,
    });
  if (!canonicalEqual(d.authority, REFEREE_AUTHORITY))
    return reject("VALUE_INVALID", "the judgment carries role.gm + permission.rule.adjudicate", {
      key: w.key,
    });
  if (
    group.group_id !== pcReachGroupId(d.pc_id, d.act_id) ||
    group.intent_id !== pcReachIntentId(d.pc_id, d.act_id) ||
    group.cause !== pcReachCause(d.pc_id, d.act_id)
  )
    return ref("the judgment is under the identities its PC and act derive", { key: w.key });
  const missing = need(group, state, [
    [pcCollectionCommitmentKey(d.pc_id, d.act_id), "the player's collection commitment-of-record"],
    [d.task.mechanism.fact_key, "the PC's mechanism"],
    [d.task.source.fact_key, "the World-State Source Condition"],
  ]);
  if (missing) return missing;
  const v = pcCollectionReachViolation(w.key, d, state.facts, true);
  return v ? ref(v, { key: w.key }) : null;
}

const mechanismIdOf = (key: string): string | undefined =>
  (/^pc\/[^/]+\/collection-mechanism\/([^/]+)$/.exec(key) ?? [])[1];

/** Population's registration (PROVISIONAL P-2) of one active PC's individual occupied interval, and its denial release. */
export function pcOccupancyGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  if (group.writes.length !== 1)
    return reject("VALUE_INVALID", "one registration or release concerns exactly one PC occupancy");
  const w = group.writes[0]!;
  if (resolveKey(w.key)?.kind.id === "population_pc_representation") {
    // v0.3 F-3: Population's own determination, derived from its ledgers; never a caller's statement
    const r = PopulationPcRepresentationSchema.parse(w.value);
    const standing = pcStandingViolation(r.pc_id, state.facts);
    const locality = "reason" in standing ? undefined : (standing.sourceLocus as LocusRef);
    const missing = need(group, state, [[TEMPORAL_STATE_KEY, "the canonical temporal state"]]);
    if (missing) return missing;
    const v = pcRepresentationViolation(w.key, r, state.facts, locality);
    return v ? ref(v, { key: w.key }) : null;
  }
  if (resolveKey(w.key)?.kind.id !== "population_pc_occupancy")
    return reject("VALUE_INVALID", "the PC occupancy facet holds only the occupancy registration");
  const occ = PopulationPcOccupancySchema.parse(w.value);
  if (w.key !== popPcOccupancyKey(occ.pc_id)) return ref("an occupancy is at its PC's one slot");
  const priorFact = state.facts.get(w.key);
  const prior = pcOccupancyRecord(state.facts, occ.pc_id);
  const requestId = pcCollectionRequestId(occ.pc_id, occ.act_id);

  if (occ.status === PC_OCCUPANCY_RELEASED_DENIED) {
    // a lawful denial: the OPEN registration of this act, released because no extraction was ever admitted for it
    if (
      !prior ||
      priorFact === undefined ||
      prior.value.status !== PC_OCCUPANCY_OPEN ||
      prior.value.act_id !== occ.act_id
    )
      return reject("PREREQUISITE_MISSING", "only an OPEN registration of this act is released");
    if (state.facts.has(productionExtractionKey(requestId)))
      return reject(
        "CLAIM_INCOMPATIBLE",
        "an occupancy of admitted work is released by its close, never denied",
      );
    if (!canonicalEqual(occ, { ...prior.value, status: PC_OCCUPANCY_RELEASED_DENIED }))
      return reject("VALUE_INVALID", "a denial changes only the status of the registration");
    return null;
  }

  if (occ.status === PC_OCCUPANCY_RELEASED_TERMINATED) {
    // D-1 (PROVISIONAL): the SAME PC's interval is released exactly once, only after Production committed the termination of this
    // act and Temporal retired its pending boundary; never before, never twice, never by a caller's say-so
    if (!canonicalEqual(group.rule, POPULATION_PC_OCCUPANCY_TERMINATION_RULE))
      return ref("a release after termination is governed by the provisional D-1 Population rule");
    if (
      !prior ||
      priorFact === undefined ||
      prior.value.status !== PC_OCCUPANCY_OPEN ||
      prior.value.act_id !== occ.act_id
    )
      return reject("PREREQUISITE_MISSING", "only an OPEN registration of this act is released");
    const missing = need(group, state, [
      [productionPcCollectionTerminationKey(requestId), "Production's termination of this act"],
      [w.key, "the PC's occupancy registration"],
    ]);
    if (missing) return missing;
    const object = engagedExtractionObject(state.facts, requestId);
    if (!object || object.value.next_boundary !== null)
      return reject(
        "CLAIM_INCOMPATIBLE",
        "an occupancy is released only after the terminated work's pending boundary is retired",
        { reason: "PENDING_BOUNDARY_NOT_RETIRED" },
      );
    if (!canonicalEqual(occ, { ...prior.value, status: PC_OCCUPANCY_RELEASED_TERMINATED }))
      return reject("VALUE_INVALID", "a release changes only the status of the registration");
    return null;
  }

  // a registration: the PC is occupied by ONE interval at a time (an occupancy is conserved, never awarded to the earliest caller)
  if (priorFact !== undefined) {
    const st = pcOccupancyState(state.facts, occ.pc_id);
    if (st.state === "OPEN")
      return reject(
        "CLAIM_INCOMPATIBLE",
        "the PC is already occupied: one personal work interval at a time",
        {
          reason: "PC_OCCUPIED",
        },
      );
    if (prior?.value.act_id === occ.act_id)
      return reject(
        "VERSION_CONFLICT",
        "an act is registered once: a changed or second deliberate action has a new identity",
      );
  }
  if (state.facts.has(productionExtractionKey(requestId)))
    return reject("VERSION_CONFLICT", "an extraction already exists for this act");
  const mechanismId = mechanismIdOf(occ.mechanism.fact_key);
  if (!mechanismId) return ref("the registration names the PC's own mechanism");
  const pre = pcCollectionPreconditions(occ.pc_id, occ.act_id, mechanismId, state.facts);
  if ("reason" in pre)
    return reject("CLAIM_INCOMPATIBLE", pre.reason, { reason: "PC_NOT_AVAILABLE_FOR_COLLECTION" });
  const missing = need(group, state, [
    [
      pcCollectionCommitmentKey(occ.pc_id, occ.act_id),
      "the player's collection commitment-of-record",
    ],
    [pcCollectionMechanismKey(occ.pc_id, mechanismId), "the PC's mechanism"],
    [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
    [worldPcLocusCustodyKey(occ.pc_id), "the PC's physical-locus custody record"],
    [TEMPORAL_STATE_KEY, "the canonical temporal state"],
    ...(priorFact !== undefined ? ([[w.key, "the PC's prior occupancy"]] as const) : []),
  ]);
  if (missing) return missing;
  if (
    occ.commitment.fact_key !== pcCollectionCommitmentKey(occ.pc_id, occ.act_id) ||
    occ.commitment.version !== pre.commitment.fact.version ||
    occ.mechanism.version !== pre.mechanism.fact.version
  )
    return ref("the registration pins the exact committed commitment and mechanism");
  // v0.3 F-3: individual occupancy proceeds only on Population's determination that the PC is OUTSIDE its aggregate workforce
  const repMissing = need(group, state, [
    [popPcRepresentationKey(occ.pc_id), "Population's representation determination"],
  ]);
  if (repMissing) return repMissing;
  const repViolation = pcRepresentationHolds(state.facts, occ.pc_id, occ.representation, true);
  if (repViolation)
    return reject("CLAIM_INCOMPATIBLE", repViolation, { reason: "PC_REPRESENTATION_WITHHELD" });
  const interval = deriveOccupancyInterval(pre.commitment.value, pre.mechanism.value, pre.now);
  if (!interval.ok)
    return reject("CLAIM_INCOMPATIBLE", interval.error.message, { reason: "COLLECTION_WITHHELD" });
  if (!canonicalEqual(occ.interval, { from: interval.value.from, to: interval.value.to }))
    return reject(
      "VALUE_INVALID",
      "an occupied interval is exactly the interval the commitment and the mechanism derive",
    );
  return null;
}

/**
 * The PC-branch of a Production extraction START: everything the generic start checks leave to the request's source. The request is
 * the PC-owned request exactly as the player's commitment determines it; the Production work record is exactly what the committed
 * owner premises derive (cycles, causal duration, earned completion); the physical reach is judged REACHABLE; the PC's occupancy is
 * the OPEN registration of this act; and the extraction declares exactly the derived completion. No boundary is accepted from a
 * caller.
 */
export function pcCollectionStartViolation(
  group: CommitGroup,
  state: CampaignState,
  e: ProductionExtraction,
  s: WorldSourceCondition,
  workW: Write | undefined,
): Rejection | null {
  if (!workW)
    return ref("a PC-owned request is started only with Production's derived work record");
  if (!canonicalEqual(group.rule, PRODUCTION_PC_COLLECTION_WORK_RULE))
    return ref("a PC-owned start is governed by the provisional PC-collection work rule");
  const w = ProductionPcCollectionWorkSchema.parse(workW.value);
  if (workW.key !== productionPcCollectionWorkKey(e.extraction_id) || w.work_id !== e.extraction_id)
    return ref("the work record is at the key derived from its extraction");
  const reqPin = requirePrerequisite(group, state, e.request.fact_key, "the PC-owned request");
  if (isRejection(reqPin)) return reqPin;
  const req = ProductionRequestSchema.safeParse(reqPin.fact.value);
  if (
    !req.success ||
    e.request.owner !== OWNER_PC_EXISTENCE ||
    reqPin.fact.owner !== OWNER_PC_EXISTENCE ||
    reqPin.fact.version !== e.request.version ||
    e.request.fact_key !== pcCollectionRequestKey(w.pc_id, w.act_id) ||
    e.request.request_id !== e.extraction_id ||
    req.data.request_id !== e.extraction_id
  )
    return ref(
      "the extraction pins the PC-owned request at its current version and fixes this extraction",
    );
  if (
    !canonicalEqual(req.data.scope, s.locality) ||
    req.data.requested_output.output_class !== s.material_class ||
    !canonicalEqual(req.data.requested_output.quantity, e.quantity)
  )
    return reject(
      "VALUE_INVALID",
      "the extraction asks for exactly the request's amount of the source's own material at its locality",
    );
  const missing = need(group, state, [
    [w.pins.commitment.fact_key, "the player's collection commitment-of-record"],
    [w.pins.mechanism.fact_key, "the PC's mechanism"],
    [w.pins.reach.fact_key, "the physical-reach judgment"],
    [w.pins.occupancy.fact_key, "the PC's occupancy registration"],
    [PLAYER_CHARACTER_BINDING_KEY, "the operative PC binding"],
    [worldPcLocusCustodyKey(w.pc_id), "the PC's physical-locus custody record"],
  ]);
  if (missing) return missing;
  const violation = pcCollectionWorkViolation(workW.key, w, state.facts, true);
  if (violation) return ref(violation, { key: workW.key });
  const commitment = PcCollectionCommitmentSchema.safeParse(
    state.facts.get(w.pins.commitment.fact_key)?.value,
  );
  if (
    !commitment.success ||
    commitment.data.intent.source.fact_key !== e.source.fact_key ||
    commitment.data.intent.destination.fact_key !== e.reserve.fact_key ||
    !canonicalEqual(commitment.data.intent.quantity, e.quantity)
  )
    return ref("the extraction is exactly the player's committed source, destination and amount");
  if (
    compareTime(e.timing.started_at, w.derivation.started_at) !== 0 ||
    compareTime(e.timing.boundary.at, w.derivation.completes_at) !== 0
  )
    return reject(
      "VALUE_INVALID",
      "the extraction declares exactly the derived start and earned completion: never a caller-declared boundary",
    );
  return null;
}

/** The stage-time premise check of a PC-branch extraction (C6 invalidation bound); null for any other extraction. */
export function pcCollectionStageViolation(
  state: Pick<CampaignState, "facts">,
  e: ProductionExtraction,
): Rejection | null {
  if (e.request.owner !== OWNER_PC_EXISTENCE) return null;
  // D-1 (PROVISIONAL): terminated work is never completed, credited or delivered
  if (state.facts.has(productionPcCollectionTerminationKey(e.extraction_id)))
    return reject("CLAIM_INCOMPATIBLE", "this collection was terminated: it is not completed", {
      reason: "PC_COLLECTION_TERMINATED",
    });
  const workFact = state.facts.get(productionPcCollectionWorkKey(e.extraction_id));
  const w = workFact ? ProductionPcCollectionWorkSchema.safeParse(workFact.value) : undefined;
  if (!w?.success) return ref("a PC-owned extraction has Production's derived work record");
  const v = pcCollectionPremiseViolation(w.data, state.facts);
  return v ? reject("CLAIM_INCOMPATIBLE", v, { reason: "PC_COLLECTION_INVALIDATED" }) : null;
}

export { pcCollectionReachKey };
