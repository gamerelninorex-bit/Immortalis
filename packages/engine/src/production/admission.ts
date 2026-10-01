import {
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  ProductionClaimSchema,
  ProductionOperationSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  WORLD_OPERATION_ACCEPT_FALLBACK,
  WorldLocusSchema,
  compareTime,
  productionBoundaryId,
  productionClaimId,
  productionClaimKey,
  productionCompletionKey,
  productionObjectId,
  productionOutputReference,
  productionReserveKey,
  temporalObjectKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type TemporalObject,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { productionTemporalObject } from "./declaration.ts";
import { deriveCompletion } from "./derive.ts";

/**
 * IM-11 admission for the IM-05 Production owner (IM-03 owner resolution; WS-003 §§2, 3, 4, 9, 14, 15; RC-06;
 * F-017 CG-2). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the
 * completion operation. Key-space exclusivity (nobody but `production`/`production_state` can write a
 * Production key) is enforced by the owner registry before this runs; this enforces that even Production
 * itself can change its state only in one of three lawful ways:
 *
 *  1. ESTABLISHMENT of one exact local Reserve, attached to an already-committed world locus.
 *  2. START of one operation: the operation, its RC-06 claim and the Reserve that holds the claim open are
 *     published together. The claim is admitted only if the Reserve's still-unclaimed quantity supports it —
 *     checked from the Reserve's own open-claim list by identity, never by scanning — otherwise the whole
 *     group is refused and NOTHING is credited or recorded (no immortal pending object for a failed claim).
 *     Commit order confers no priority: there is no preemption, ranking or displacement, and a claim against
 *     already-committed material simply receives no credit.
 *  3. COMPLETION of that operation at its declared boundary: the group is RE-DERIVED from the committed
 *     operation, claim and Reserve, so the claimed input is consumed exactly once and exactly the declared
 *     output is sealed in a Durable Completion Envelope — nothing is created ex nihilo and nothing is written
 *     as a second current physical condition.
 */
export function productionGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  const ws = group.writes;
  const of = (id: string) => ws.filter((w) => kindOf(w.key) === id);
  const reserveW = of("production_reserve");
  const claimW = of("production_claim");
  const opW = of("production_operation");
  const completionW = of("production_completion");

  if (reserveW.length === 1 && ws.length === 1 && reserveW[0]!.expected_version === 0) {
    return checkEstablishment(group, state, reserveW[0]!.value);
  }
  if (
    reserveW.length === 1 &&
    claimW.length === 1 &&
    opW.length === 1 &&
    completionW.length === 0 &&
    ws.length === 3 &&
    claimW[0]!.expected_version === 0 &&
    opW[0]!.expected_version === 0 &&
    reserveW[0]!.expected_version > 0
  ) {
    return checkStart(group, state, reserveW[0]!, claimW[0]!, opW[0]!);
  }
  if (
    reserveW.length === 1 &&
    claimW.length === 1 &&
    opW.length === 1 &&
    completionW.length === 1 &&
    ws.length === 4 &&
    completionW[0]!.expected_version === 0 &&
    reserveW[0]!.expected_version > 0 &&
    claimW[0]!.expected_version > 0 &&
    opW[0]!.expected_version > 0
  ) {
    return checkCompletion(state, reserveW[0]!, claimW[0]!, opW[0]!, completionW[0]!);
  }
  return reject(
    "VALUE_INVALID",
    "Production state changes only by Reserve establishment, operation start or operation completion",
  );
}

function checkEstablishment(
  group: CommitGroup,
  state: CampaignState,
  value: unknown,
): Rejection | null {
  const r = ProductionReserveSchema.parse(value);
  const bad = (message: string) => reject("VALUE_INVALID", message);
  if (r.established.amount !== r.quantity.amount || r.consumed.length > 0 || r.claims.length > 0) {
    return bad(
      "a newly established Reserve holds its whole established quantity, unclaimed and unspent",
    );
  }
  const { world, locus } = r.locality;
  const locusKey = worldLocusKey(world.entity_id, locus.entity_id);
  if (world.fact_key !== worldProfileKey(world.entity_id) || locus.fact_key !== locusKey) {
    return reject("REFERENCE_INVALID", "locality references do not match their key identities");
  }
  const w = requirePrerequisite(group, state, world.fact_key, "the world profile");
  if (isRejection(w)) return w;
  const lo = requirePrerequisite(group, state, locusKey, "the world locus");
  if (isRejection(lo)) return lo;
  const committed = WorldLocusSchema.safeParse(lo.fact.value);
  if (!committed.success || committed.data.world.entity_id !== world.entity_id) {
    return reject("REFERENCE_INVALID", "the locus does not belong to the world", { key: locusKey });
  }
  return null;
}

type Write = CommitGroup["writes"][number];

function checkStart(
  group: CommitGroup,
  state: CampaignState,
  reserveW: Write,
  claimW: Write,
  opW: Write,
): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  const ref = (message: string, details?: Record<string, unknown>) =>
    reject("REFERENCE_INVALID", message, details);
  const op = ProductionOperationSchema.parse(opW.value);
  const claim = ProductionClaimSchema.parse(claimW.value);
  const next = ProductionReserveSchema.parse(reserveW.value);
  const opId = op.operation_id;

  // identities: derived from the operation identity alone
  if (
    claim.claim_id !== productionClaimId(opId) ||
    claim.operation_id !== opId ||
    op.claim.claim_id !== claim.claim_id ||
    op.claim.fact_key !== productionClaimKey(claim.claim_id) ||
    claimW.key !== op.claim.fact_key ||
    op.reserve.reserve_id !== next.reserve_id ||
    op.reserve.fact_key !== productionReserveKey(next.reserve_id) ||
    reserveW.key !== op.reserve.fact_key ||
    op.transformation.output.reference !== productionOutputReference(opId) ||
    op.timing.completion.boundary_id !== productionBoundaryId(opId)
  ) {
    return ref(
      "the operation, claim, Reserve and output identities are those derived from the operation",
    );
  }
  if (op.status.state !== "IN_PROGRESS" || claim.lifecycle.status !== "ACTIVE") {
    return bad("an operation starts in progress with an active claim");
  }

  // the pinned request: a foreign fact in its source's own key space, referenced and never copied
  const request = requirePrerequisite(group, state, op.request.fact_key, "the Production Request");
  if (isRejection(request)) return request;
  if (
    resolveKey(op.request.fact_key) ||
    request.fact.owner === OWNER_PRODUCTION ||
    request.fact.owner !== op.request.owner ||
    request.fact.version !== op.request.version ||
    op.request.request_id !== opId
  ) {
    return ref(
      "the request is its source's own fact, pinned at its current version, and fixes this operation",
      {
        key: op.request.fact_key,
      },
    );
  }
  const req = ProductionRequestSchema.safeParse(request.fact.value);
  if (
    !req.success ||
    req.data.request_id !== opId ||
    req.data.source.owner !== request.fact.owner
  ) {
    return ref("the pinned fact is not this request, written by its own source", {
      key: op.request.fact_key,
    });
  }
  const out = op.transformation.output;
  if (
    !canonicalEqual(req.data.requested_output, {
      output_class: out.output_class,
      quantity: out.quantity,
    })
  ) {
    return bad("the operation produces exactly the output the request asked for");
  }
  if (
    !canonicalEqual(claim.lineage.request, {
      owner: op.request.owner,
      fact_key: op.request.fact_key,
      version: op.request.version,
    })
  ) {
    return ref("the claim's lineage is the pinned request");
  }

  // the canonical temporal basis the operation starts at, pinned
  const clock = requirePrerequisite(
    group,
    state,
    TEMPORAL_STATE_KEY,
    "the canonical temporal state",
  );
  if (isRejection(clock)) return clock;
  const now = TemporalStateSchema.parse(clock.fact.value).canonical_time;
  if (
    compareTime(now, op.timing.started_at) !== 0 ||
    compareTime(now, op.timing.completion.at) !== -1 ||
    !canonicalEqual(claim.interval, { from: op.timing.started_at, until: op.timing.completion.at })
  ) {
    return bad(
      "an operation starts at the canonical time and declares a completion boundary after it; its claim spans exactly that interval",
    );
  }

  // the Reserve: advanced only by holding this one claim open
  const wasFact = state.facts.get(reserveW.key);
  if (!wasFact) {
    return reject("PREREQUISITE_MISSING", "the Reserve is not established", { key: reserveW.key });
  }
  const was = ProductionReserveSchema.parse(wasFact.value);
  if (!canonicalEqual(next, { ...was, claims: [...was.claims, claim.claim_id].sort() })) {
    return bad("starting an operation changes the Reserve only by holding its claim open");
  }
  if (was.claims.includes(claim.claim_id)) return bad("the claim is already open");
  if (
    !canonicalEqual(req.data.scope.locus, was.locality.locus) ||
    !canonicalEqual(req.data.scope.world, was.locality.world)
  ) {
    return ref("the request is for the Reserve's own locality");
  }

  // RC-06: the claim is for exactly the declared input of this Reserve's material, and it is supported
  const input = op.transformation.input;
  if (
    claim.conserved.fact_key !== reserveW.key ||
    claim.conserved.reserve_id !== was.reserve_id ||
    input.material_class !== was.material_class ||
    input.quantity.unit !== was.quantity.unit ||
    !canonicalEqual(claim.quantity, input.quantity)
  ) {
    return bad("the claim is for exactly the declared input quantity of this Reserve's material");
  }
  let open = 0;
  for (const id of was.claims) {
    const f = state.facts.get(productionClaimKey(id));
    const c = f ? ProductionClaimSchema.safeParse(f.value) : undefined;
    if (
      !c?.success ||
      c.data.lifecycle.status !== "ACTIVE" ||
      c.data.conserved.fact_key !== reserveW.key
    ) {
      return ref("an open claim of the Reserve is not an active claim on it", { claim_id: id });
    }
    open += c.data.quantity.amount;
  }
  if (open + claim.quantity.amount > was.quantity.amount) {
    return reject(
      "CLAIM_INCOMPATIBLE",
      "the Reserve's unclaimed quantity does not support this claim: an incompatible claim against already-committed material receives no credit",
      {
        key: reserveW.key,
        held: was.quantity.amount,
        committed: open,
        claimed: claim.quantity.amount,
      },
    );
  }
  return null;
}

function checkCompletion(
  state: CampaignState,
  reserveW: Write,
  claimW: Write,
  opW: Write,
  completionW: Write,
): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  const priorOp = state.facts.get(opW.key);
  const priorReserve = state.facts.get(reserveW.key);
  const priorClaim = state.facts.get(claimW.key);
  if (!priorOp || !priorReserve || !priorClaim) {
    return reject("PREREQUISITE_MISSING", "a completion advances a started operation");
  }
  const op = ProductionOperationSchema.parse(priorOp.value);
  const derived = deriveCompletion({
    operation: op,
    reserve: ProductionReserveSchema.parse(priorReserve.value),
    reserveVersion: priorReserve.version,
    claim: ProductionClaimSchema.parse(priorClaim.value),
  });
  if (!derived.ok) return bad(derived.error.message);
  if (
    reserveW.key !== op.reserve.fact_key ||
    claimW.key !== op.claim.fact_key ||
    completionW.key !== productionCompletionKey(op.operation_id)
  ) {
    return bad("a completion writes exactly its own operation, claim, Reserve and envelope");
  }
  const d = derived.value;
  if (
    !canonicalEqual(opW.value, d.operation) ||
    !canonicalEqual(claimW.value, d.claim) ||
    !canonicalEqual(reserveW.value, d.reserve) ||
    !canonicalEqual(completionW.value, d.envelope)
  ) {
    return bad(
      "a completion is exactly the declared transformation: the claimed input consumed once, the declared output sealed once",
    );
  }
  // it completes only at its engaged, unretired, declared boundary (the object is the engagement)
  const obj = state.facts.get(temporalObjectKey(productionObjectId(op.operation_id)));
  const clock = state.facts.get(TEMPORAL_STATE_KEY);
  const o = obj ? TemporalObjectSchema.safeParse(obj.value) : undefined;
  const t = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  if (
    !o?.success ||
    !t?.success ||
    !o.data.next_boundary ||
    o.data.next_boundary.boundary_id !== op.timing.completion.boundary_id ||
    compareTime(o.data.next_boundary.at, op.timing.completion.at) !== 0 ||
    ![-1, 0].includes(compareTime(t.data.canonical_time, op.timing.completion.at) ?? 1)
  ) {
    return reject(
      "REFERENCE_INVALID",
      "a completion is committed only for an engaged operation whose declared boundary has not been retired",
    );
  }
  return null;
}

/**
 * RC-10: a Production operation's temporal object is exactly the one derived from its committed operation
 * (one earned boundary: its declared completion boundary; its two CG-2 stages; EXACT-PARTITION; no recurrence).
 * Applies to every object that names Production as its owner or declares a Production completion /
 * custodian-acceptance stage, so a hand-written object cannot smuggle a different boundary, read, stage or
 * owner. `registered` is the registration-time form (the operation must still be in progress); the load-time
 * form allows the resolved basis and retired boundary an object legitimately has after its transaction.
 */
export function productionObjectViolation(
  o: TemporalObject,
  state: Pick<CampaignState, "facts">,
  registered: boolean,
): string | null {
  const stageOwners = o.dependencies.map((d) => d.stage.owner_operation);
  const concerned =
    o.owning_ref.owner === OWNER_PRODUCTION ||
    stageOwners.some(
      (s) =>
        s.owner === OWNER_PRODUCTION ||
        (s.owner === OWNER_WORLD_STATE && s.operation === WORLD_OPERATION_ACCEPT_FALLBACK),
    );
  if (!concerned) return null;
  const prefix = "obj-production-";
  if (!o.object_id.startsWith(prefix)) {
    return "a Production temporal object has the identity derived from its operation";
  }
  const opId = o.object_id.slice(prefix.length);
  const opFact = state.facts.get(`production/operation/${opId}`);
  const op = opFact ? ProductionOperationSchema.safeParse(opFact.value) : undefined;
  if (!op?.success) return "a Production temporal object names an operation that is not committed";
  const reserveFact = state.facts.get(op.data.reserve.fact_key);
  const reserve = reserveFact ? ProductionReserveSchema.safeParse(reserveFact.value) : undefined;
  if (!reserve?.success) return "a Production temporal object's operation has no Reserve";
  if (registered && op.data.status.state !== "IN_PROGRESS") {
    return "only an operation still in progress earns a completion boundary";
  }
  const expected = productionTemporalObject(op.data, {
    worldId: reserve.data.locality.world.entity_id,
    locusId: reserve.data.locality.locus.entity_id,
  });
  const loose = (x: TemporalObject) => ({ ...x, last_resolved_basis: null, next_boundary: null });
  if (!canonicalEqual(loose(o), loose(expected))) {
    return "a Production temporal object is exactly the object derived from its operation";
  }
  if (registered) {
    if (
      !canonicalEqual(o.next_boundary, expected.next_boundary) ||
      !canonicalEqual(o.last_resolved_basis, expected.last_resolved_basis)
    )
      return "a Production temporal object earns exactly the operation's declared completion boundary";
  } else if (o.next_boundary !== null && !canonicalEqual(o.next_boundary, expected.next_boundary)) {
    return "a Production temporal object's boundary is the operation's declared completion boundary";
  }
  return null;
}
