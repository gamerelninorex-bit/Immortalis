import {
  ExtractionBasisSchema,
  OWNER_PRODUCTION,
  ProductionExtractionSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  compareTime,
  productionExtractionBasisKey,
  productionExtractionBoundaryId,
  productionExtractionKey,
  productionExtractionObjectId,
  productionOperationKey,
  productionReserveInflowStage,
  productionReserveKey,
  productionSourceAccountKey,
  productionSourceDeltaKey,
  temporalObjectKey,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  type CommitGroup,
  type OwnerFact,
  type ProductionExtraction,
  type SourceAccount,
  type WorldSourceCondition,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  pcCollectionStageViolation,
  pcCollectionTerminationGroupCheck,
  pcCollectionStartViolation,
} from "../pc-collection/admission.ts";
import { isPcCollectionRequestKey } from "../pc-collection/derive.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  deriveReserveInflow,
  deriveSourceDelta,
  parseAccount,
  claimRoom,
  claimStanding,
  pendingDrawdown,
  pinned,
  undeliveredCommitments,
} from "./derive.ts";

/**
 * IM-11 admission for the Production side of an exact finite raw-source drawdown (WS-003 §§4, 4A, 4B, 14, 15; RC-06;
 * F-017 §5.5/§5.7). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the three
 * owner operations. Key-space exclusivity (nobody but `production`/`production_state` writes these keys) is enforced by the
 * owner registry before this runs; this enforces that even Production itself changes this state in only one of four lawful
 * ways, each of which is RE-DERIVED here rather than trusted:
 *
 *  1. ESTABLISHMENT of one Capability / Access basis for one source key, checked against the World-State Source Condition
 *     whose physical access fact it names (Capability is not inventory; Access is not Capability; the source's existence
 *     establishes neither).
 *  2. START of one extraction on one pinned request: the sealed extraction and the key's account (opened by the first
 *     admission, its watermark at that commit instant) holding the commitment. It is admitted only if the pinned request,
 *     basis, Source Condition (exact, not exhausted), destination Reserve and canonical time all hold, the key has no
 *     undelivered drawdown (delivery precedes any read of the Source Condition), and the source's still-unclaimed exact
 *     quantity supports it — otherwise the whole group is refused and NOTHING is recorded or credited.
 *  3. EMISSION of the Production-caused Source Delta at the declared boundary, as the IM-02 stage it is, re-derived from
 *     the sealed extraction alone. It is the key's Pending Drawdown until World-State delivers it.
 *  4. The Reserve INFLOW, as the IM-02 stage it is, only after World-State's delivery of that very delta: re-derived from
 *     the delivery, so the Reserve is credited exactly what was delivered, once, and the commitment closes.
 */
type Write = CommitGroup["writes"][number];

const EXTRACTION_KINDS = [
  "production_pc_collection_work",
  "production_pc_collection_termination",
  "production_extraction_basis",
  "production_extraction",
  "production_source_delta",
  "production_source_account",
] as const;

/** Is this write one of the exact-drawdown Production kinds? Used by the Production group dispatcher. */
export const isDrawdownProductionKey = (key: string): boolean => {
  const id = resolveKey(key)?.kind.id;
  return id !== undefined && (EXTRACTION_KINDS as readonly string[]).includes(id);
};

export function sourceDrawdownGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  const ws = group.writes;
  const of = (id: string) => ws.filter((w) => kindOf(w.key) === id);
  const basisW = of("production_extraction_basis");
  const extW = of("production_extraction");
  const deltaW = of("production_source_delta");
  const accountW = of("production_source_account");
  const reserveW = of("production_reserve");
  const workW = of("production_pc_collection_work");
  const terminationW = of("production_pc_collection_termination");

  if (basisW.length === 1 && ws.length === 1 && basisW[0]!.expected_version === 0)
    return checkBasis(group, state, basisW[0]!);
  if (
    extW.length === 1 &&
    accountW.length === 1 &&
    workW.length <= 1 &&
    ws.length === 2 + workW.length &&
    extW[0]!.expected_version === 0 &&
    (workW.length === 0 || workW[0]!.expected_version === 0)
  )
    return checkStart(group, state, extW[0]!, accountW[0]!, workW[0]);
  // D-1 (PROVISIONAL): Production's terminal disposition of withdrawn in-flight PC collection work, with the key's claim released
  if (terminationW.length === 1 && accountW.length === 1 && ws.length === 2)
    return pcCollectionTerminationGroupCheck(group, state, terminationW[0]!, accountW[0]!);
  if (deltaW.length === 1 && ws.length === 1 && deltaW[0]!.expected_version === 0)
    return checkDelta(group, state, deltaW[0]!);
  if (
    reserveW.length === 1 &&
    accountW.length === 1 &&
    ws.length === 2 &&
    reserveW[0]!.expected_version > 0 &&
    accountW[0]!.expected_version > 0
  )
    return checkInflow(group, state, reserveW[0]!, accountW[0]!);
  return reject(
    "VALUE_INVALID",
    "an exact drawdown changes Production state only by basis establishment, extraction start, Source Delta emission or Reserve inflow",
  );
}

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

/** Reads a World-State Source Condition fact by key; null when the key is not a committed, well-formed one of that owner. */
function sourceOf(
  state: Pick<CampaignState, "facts">,
  key: string,
): { fact: OwnerFact; value: WorldSourceCondition } | null {
  const fact = state.facts.get(key);
  const parsed = fact ? WorldSourceConditionSchema.safeParse(fact.value) : undefined;
  if (!fact || !parsed?.success) return null;
  if (resolveKey(key)?.kind.id !== "world_source_condition") return null;
  if (key !== worldSourceConditionKey(parsed.data.locality.world.entity_id, parsed.data.source_key))
    return null;
  return { fact, value: parsed.data };
}

function checkBasis(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const b = ExtractionBasisSchema.parse(w.value);
  if (w.key !== productionExtractionBasisKey(b.basis_id))
    return ref("a basis lives at the key derived from its identity", { key: w.key });
  const srcPin = requirePrerequisite(
    group,
    state,
    b.source.fact_key,
    "the World-State Source Condition",
  );
  if (isRejection(srcPin)) return srcPin;
  const src = sourceOf(state, b.source.fact_key);
  if (
    !src ||
    b.source.fact_key !== worldSourceConditionKey(b.locality.world.entity_id, b.source.source_key)
  ) {
    return ref(
      "the basis names a World-State Source Condition: a source estimate or any other fact is no source truth",
      { key: b.source.fact_key },
    );
  }
  const s = src.value;
  if (
    s.source_key !== b.source.source_key ||
    s.material_class !== b.material_class ||
    s.recoverable.unit !== b.unit ||
    !canonicalEqual(s.locality, b.locality)
  )
    return ref("the basis covers this source key, material, unit and locality");
  if (!s.access_facts.some((a) => canonicalEqual(a, b.access.relies_on)))
    return ref(
      "the basis relies on a physical access fact the World-State Source Condition does not state: Access is not assumed from the source's existence",
    );
  return null;
}

/** Shared by the start and the emission: the extraction's request is its source's own fact, scoped and exact. */
function requestViolation(
  group: CommitGroup,
  state: CampaignState,
  e: ProductionExtraction,
  s: WorldSourceCondition,
): Rejection | null {
  const request = requirePrerequisite(group, state, e.request.fact_key, "the Production Request");
  if (isRejection(request)) return request;
  // A request is a foreign fact in its SOURCE's own key space: an unregistered extension owner's. Never a canonical,
  // kernel, Population, Production, World-State or any other registered owner's fact.
  if (
    resolveKey(e.request.fact_key) !== null ||
    request.fact.owner === OWNER_PRODUCTION ||
    request.fact.owner !== e.request.owner ||
    request.fact.version !== e.request.version ||
    e.request.request_id !== e.extraction_id
  )
    return ref(
      "the request is its source's own fact, pinned at its current version, and fixes this extraction",
      { key: e.request.fact_key },
    );
  const req = ProductionRequestSchema.safeParse(request.fact.value);
  if (
    !req.success ||
    req.data.request_id !== e.extraction_id ||
    req.data.source.owner !== request.fact.owner
  )
    return ref("the pinned fact is not this request, written by its own source", {
      key: e.request.fact_key,
    });
  if (
    !canonicalEqual(req.data.scope.world, s.locality.world) ||
    !canonicalEqual(req.data.scope.locus, s.locality.locus)
  )
    return ref("the request is scoped to the Source Condition's own locality");
  if (
    req.data.requested_output.output_class !== s.material_class ||
    !canonicalEqual(req.data.requested_output.quantity, e.quantity)
  )
    return bad(
      "the extraction asks for exactly the request's amount and unit of the same, untransformed raw material",
    );
  return null;
}

function checkStart(
  group: CommitGroup,
  state: CampaignState,
  extW: Write,
  accountW: Write,
  workW?: Write,
): Rejection | null {
  const e = ProductionExtractionSchema.parse(extW.value);
  const id = e.extraction_id;
  const next = SourceAccountSchema.parse(accountW.value);

  // the source: World-State's exact, finite, not-exhausted Source Condition, pinned at its current version
  const srcPin = requirePrerequisite(
    group,
    state,
    e.source.fact_key,
    "the World-State Source Condition",
  );
  if (isRejection(srcPin)) return srcPin;
  const src = sourceOf(state, e.source.fact_key);
  if (!src || srcPin.fact.version !== e.source.version)
    return ref(
      "the extraction pins a World-State Source Condition at its current version: an estimate or a stale pin is no source truth",
      { key: e.source.fact_key },
    );
  const s = src.value;
  if (e.source.source_key !== s.source_key)
    return ref("the extraction names the Source Condition's own resolution key");
  const world = s.locality.world.entity_id;

  // identities: derived from the extraction identity alone
  if (
    extW.key !== productionExtractionKey(id) ||
    e.account.fact_key !== productionSourceAccountKey(world, s.source_key) ||
    accountW.key !== e.account.fact_key ||
    e.reserve.fact_key !== productionReserveKey(e.reserve.reserve_id) ||
    e.basis.fact_key !== productionExtractionBasisKey(e.basis.basis_id) ||
    e.timing.boundary.boundary_id !== productionExtractionBoundaryId(id)
  )
    return ref(
      "the extraction, account, Reserve and boundary identities are those derived from the extraction",
    );
  if (e.request.request_id !== id) return ref("the extraction identity is the request identity");
  if (state.facts.has(productionOperationKey(id)))
    return reject(
      "VERSION_CONFLICT",
      "a request fixes one use: it already fixes a Production operation",
      {
        extraction_id: id,
      },
    );
  if (s.exhaustion !== null)
    return reject("CLAIM_INCOMPATIBLE", "the Source Condition is physically exhausted", {
      key: srcPin.fact.key,
    });
  if (e.material_class !== s.material_class || e.quantity.unit !== s.recoverable.unit)
    return bad("the extraction is for the Source Condition's own material and unit");

  // the request: its source's own fact, pinned, scoped and exact. A request in the PC-owned collection key space (CPAA-C1 v0.2
  // PROVISIONAL) is judged by its own branch: the PC's commitment, the mechanism-derived work, the judged reach and the occupancy;
  // any other request keeps the existing extension-owned rule, and a work record is never accepted without a PC-owned request.
  const pcRequest = isPcCollectionRequestKey(e.request.fact_key);
  if (!pcRequest && workW)
    return bad("a PC collection work record accompanies only a PC-owned request");
  const req = pcRequest
    ? pcCollectionStartViolation(group, state, e, s, workW)
    : requestViolation(group, state, e, s);
  if (req) return req;

  // Production's own Capability / Access basis, pinned, covering exactly this source
  const basisPin = requirePrerequisite(
    group,
    state,
    e.basis.fact_key,
    "the Capability / Access basis",
  );
  if (isRejection(basisPin)) return basisPin;
  const basis = ExtractionBasisSchema.safeParse(basisPin.fact.value);
  if (
    !basis.success ||
    basisPin.fact.version !== e.basis.version ||
    basis.data.basis_id !== e.basis.basis_id
  )
    return ref("the extraction pins its Capability / Access basis at its current version");
  if (
    basis.data.source.fact_key !== srcPin.fact.key ||
    basis.data.source.source_key !== s.source_key ||
    basis.data.material_class !== s.material_class ||
    basis.data.unit !== s.recoverable.unit ||
    !canonicalEqual(basis.data.locality, s.locality) ||
    !s.access_facts.some((a) => canonicalEqual(a, basis.data.access.relies_on))
  )
    return ref(
      "the basis covers this source key, material, unit and locality, and its physical access fact holds",
    );
  if (!canonicalEqual(e.support_basis, basis.data.capability.support))
    return bad("the extraction runs on the basis's embedded Tier A support");

  // the destination Reserve: Production's own, same material, same unit, at the Source Condition's locality
  const reservePin = requirePrerequisite(
    group,
    state,
    e.reserve.fact_key,
    "the destination Reserve",
  );
  if (isRejection(reservePin)) return reservePin;
  const reserve = ProductionReserveSchema.safeParse(reservePin.fact.value);
  if (
    !reserve.success ||
    reserve.data.reserve_id !== e.reserve.reserve_id ||
    reserve.data.material_class !== e.material_class ||
    reserve.data.quantity.unit !== e.quantity.unit ||
    !canonicalEqual(reserve.data.locality, s.locality)
  )
    return ref(
      "the destination Reserve holds the same material in the same unit at the source's own locality",
    );

  // the canonical temporal basis it starts at, pinned
  const clock = requirePrerequisite(
    group,
    state,
    TEMPORAL_STATE_KEY,
    "the canonical temporal state",
  );
  if (isRejection(clock)) return clock;
  const nowT = TemporalStateSchema.parse(clock.fact.value).canonical_time;
  if (
    compareTime(nowT, e.timing.started_at) !== 0 ||
    compareTime(nowT, e.timing.boundary.at) !== -1
  )
    return bad("an extraction starts at the canonical time and declares a boundary after it");

  // the key's account: opened by the first admission (watermark at this commit instant), advanced by holding one more commitment
  const wasFact = state.facts.get(accountW.key);
  const entry = { extraction_id: id, quantity: e.quantity };
  let was: SourceAccount | undefined;
  if (!wasFact) {
    if (accountW.expected_version !== 0)
      return reject("PREREQUISITE_MISSING", "the account is not opened", { key: accountW.key });
    if (
      !canonicalEqual(next, {
        source: { fact_key: srcPin.fact.key, source_key: s.source_key },
        locality: s.locality,
        material_class: s.material_class,
        unit: s.recoverable.unit,
        watermark: e.timing.started_at,
        open: [entry],
      })
    )
      return bad(
        "a key's account opens with the first admission, its watermark at that commit instant",
      );
  } else {
    was = parseAccount(wasFact);
    if (!was) return bad("the key's account is malformed", { key: accountW.key });
    if (
      !canonicalEqual(next, {
        ...was,
        open: [...was.open, entry].sort((a, b) =>
          a.extraction_id < b.extraction_id ? -1 : a.extraction_id > b.extraction_id ? 1 : 0,
        ),
      })
    )
      return bad("starting an extraction changes the account only by holding its commitment");
    if (was.open.some((o) => o.extraction_id === id)) return bad("the commitment is already held");
    if (
      was.source.fact_key !== srcPin.fact.key ||
      was.material_class !== s.material_class ||
      was.unit !== s.recoverable.unit ||
      !canonicalEqual(was.locality, s.locality)
    )
      return ref("the account is this Source Condition's own");
    // delivery precedes any read of a key's Source Condition (WS-003 §4B(4)): an undelivered drawdown holds the read
    const pending = pendingDrawdown((k) => state.facts.get(k), was);
    if (pending.length > 0)
      return reject(
        "CLAIM_INCOMPATIBLE",
        "the key has undelivered drawdown: the Source Condition is not read, and nothing is committed, until it is delivered",
        { reason: "SOURCE_DELIVERY_PENDING", pending },
      );
  }
  // RC-06 analogue under F-017 v0.3 §4 "Same-time contention". A claim made against material that STRICTLY EARLIER canonical
  // instants already committed receives no credit (genuine causal precedence). Claims of the SAME instant have no precedence
  // over one another: arrival and processing order decide nothing, so such a claim is recorded and its standing is derived
  // from the whole set (jointly supportable: all credited; incompatible: all contested, none credited — see claimStanding).
  const earlier = was ? undeliveredCommitments((k) => state.facts.get(k), s, was) : [];
  const room = claimRoom(s, earlier, e.timing.started_at);
  if (room === null || room < e.quantity.amount)
    return reject(
      "CLAIM_INCOMPATIBLE",
      "the Source Condition's material not already committed by earlier instants does not support this extraction: an incompatible request against already-committed material receives no credit and no partial fill",
      {
        reason: "INSUFFICIENT_RECOVERABLE",
        key: srcPin.fact.key,
        recoverable: s.recoverable.amount,
        unclaimed: room ?? 0,
        requested: e.quantity.amount,
      },
    );
  return null;
}

/** The extraction's object is engaged and its declared boundary unretired: the stage is earned (RC-10). */
export function extractionBoundaryViolation(
  state: Pick<CampaignState, "facts">,
  e: ProductionExtraction,
): Rejection | null {
  const obj = state.facts.get(temporalObjectKey(productionExtractionObjectId(e.extraction_id)));
  const clock = state.facts.get(TEMPORAL_STATE_KEY);
  const o = obj ? TemporalObjectSchema.safeParse(obj.value) : undefined;
  const t = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  if (
    !o?.success ||
    !t?.success ||
    !o.data.next_boundary ||
    o.data.next_boundary.boundary_id !== e.timing.boundary.boundary_id ||
    compareTime(o.data.next_boundary.at, e.timing.boundary.at) !== 0 ||
    ![-1, 0].includes(compareTime(t.data.canonical_time, e.timing.boundary.at) ?? 1)
  )
    return ref(
      "a drawdown stage is committed only for an engaged extraction whose declared boundary has not been retired",
    );
  return null;
}

function checkDelta(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const delta = SourceDeltaSchema.parse(w.value);
  const id = delta.delta_id;
  if (w.key !== productionSourceDeltaKey(id))
    return ref("a Source Delta lives at the key derived from its extraction", { key: w.key });
  const exPin = requirePrerequisite(group, state, productionExtractionKey(id), "the Extraction");
  if (isRejection(exPin)) return exPin;
  const e = ProductionExtractionSchema.safeParse(exPin.fact.value);
  if (!e.success) return ref("the cited fact is not an Extraction");
  const derived = deriveSourceDelta({
    key: exPin.fact.key,
    version: exPin.fact.version,
    value: e.data,
  });
  if (!canonicalEqual(delta, derived))
    return bad(
      "a Source Delta is exactly the extraction's drawdown: its cause, exact magnitude, precise source-resolution key and provenance, once",
    );
  const identity = stageAuthorityViolation(
    group,
    delta.close_stage,
    state.facts,
    e.data.timing.boundary.at,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: w.key });
  const engaged = extractionBoundaryViolation(state, e.data);
  if (engaged) return engaged;

  // a PC-owned collection re-validates its owner premises at the boundary (CPAA-C1 C6 invalidation bound): never silently completed
  const pcStage = pcCollectionStageViolation(state, e.data);
  if (pcStage) return pcStage;

  // Production re-validates the source-owner key and the supportable exact quantity at the boundary (WS-003 §4A)
  const src = sourceOf(state, e.data.source.fact_key);
  const account = parseAccount(state.facts.get(e.data.account.fact_key));
  if (!src || !account || src.value.source_key !== e.data.source.source_key)
    return ref(
      "the Source Delta's source-resolution key is a committed World-State Source Condition with its account",
    );
  if (src.value.exhaustion !== null || src.value.recoverable.amount < e.data.quantity.amount)
    return reject("CLAIM_INCOMPATIBLE", "the Source Condition no longer supports the extraction", {
      reason: "INSUFFICIENT_RECOVERABLE",
    });
  const entry = account.open.find((o) => o.extraction_id === id);
  if (!entry || !canonicalEqual(entry.quantity, e.data.quantity))
    return ref("the key's account holds this extraction's commitment");
  // incompatible same-instant claims are all contested: none proceeds, whatever order they are processed in (F-017 v0.3 §4)
  const commitments = undeliveredCommitments((k) => state.facts.get(k), src.value, account);
  const mine = commitments.find((c) => c.id === id);
  if (!mine || claimStanding(src.value, commitments, mine) !== "SUPPORTED")
    return reject(
      "CLAIM_INCOMPATIBLE",
      "this extraction is incompatible with other claims of the same canonical instant on the same scarce material: with no owner allocation, priority or neutral rule none is credited, and the conflict stays unresolved",
      { reason: "CONTESTED_SAME_INSTANT_CLAIM" },
    );
  // one authoritative pending representation per key: a new drawdown is emitted only onto a key with none undelivered
  const pending = pendingDrawdown((k) => state.facts.get(k), account).filter((x) => x !== id);
  if (pending.length > 0)
    return reject(
      "CLAIM_INCOMPATIBLE",
      "the key has undelivered drawdown: it is delivered before any change to what the key's drawdown consists of",
      { reason: "SOURCE_DELIVERY_PENDING", pending },
    );
  return null;
}

function checkInflow(
  group: CommitGroup,
  state: CampaignState,
  reserveW: Write,
  accountW: Write,
): Rejection | null {
  const priorReserveFact = state.facts.get(reserveW.key);
  const priorAccountFact = state.facts.get(accountW.key);
  if (!priorReserveFact || !priorAccountFact)
    return reject(
      "PREREQUISITE_MISSING",
      "an inflow advances an established Reserve and an opened account",
    );
  const priorReserve = ProductionReserveSchema.safeParse(priorReserveFact.value);
  const nextReserve = ProductionReserveSchema.safeParse(reserveW.value);
  const priorAccount = parseAccount(priorAccountFact);
  if (!priorReserve.success || !nextReserve.success || !priorAccount)
    return bad("the Reserve or the account is malformed");
  const had = new Set((priorReserve.data.inflows ?? []).map((i) => i.inflow_id));
  const added = (nextReserve.data.inflows ?? []).filter((i) => !had.has(i.inflow_id));
  if (added.length !== 1)
    return bad("one inflow credits exactly one extraction's delivered drawdown, once");
  const id = added[0]!.inflow_id;

  const delivery = requirePrerequisite(
    group,
    state,
    worldSourceDeliveryKey(priorAccount.locality.world.entity_id, id),
    "World-State's delivery",
  );
  if (isRejection(delivery)) return delivery;
  const deltaPin = requirePrerequisite(
    group,
    state,
    productionSourceDeltaKey(id),
    "the Source Delta",
  );
  if (isRejection(deltaPin)) return deltaPin;
  const exPin = requirePrerequisite(group, state, productionExtractionKey(id), "the Extraction");
  if (isRejection(exPin)) return exPin;
  const e = pinned(exPin.fact, ProductionExtractionSchema);
  const d = pinned(deltaPin.fact, SourceDeltaSchema);
  const v = pinned(delivery.fact, WorldSourceDeliverySchema);
  if (!e || !d || !v) return ref("a cited fact is not an Extraction, a Source Delta or a delivery");
  if (reserveW.key !== e.value.reserve.fact_key || accountW.key !== e.value.account.fact_key)
    return ref("an inflow writes exactly its extraction's Reserve and account");
  const derived = deriveReserveInflow({
    extraction: e,
    delta: d,
    delivery: v,
    reserve: priorReserve.data,
    account: priorAccount,
  });
  if (!derived.ok) return bad(derived.error.message);
  if (
    !canonicalEqual(reserveW.value, derived.value.reserve) ||
    !canonicalEqual(accountW.value, derived.value.account)
  )
    return bad(
      "an inflow credits exactly what World-State delivered: the delivered quantity, once, closing the commitment",
    );
  const identity = stageAuthorityViolation(
    group,
    productionReserveInflowStage(id),
    state.facts,
    e.value.timing.boundary.at,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: reserveW.key });
  return extractionBoundaryViolation(state, e.value);
}
