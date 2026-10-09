import {
  ProductionExtractionSchema,
  ProductionReserveSchema,
  SourceAccountSchema,
  SourceDeltaSchema,
  WorldSourceConditionSchema,
  compareTime,
  fail,
  ok,
  productionExtractionKey,
  productionReserveInflowStage,
  productionSourceDeltaKey,
  productionSourceDeltaStage,
  worldSourceDeliveryKey,
  worldSourceDeliveryStage,
  type CanonicalTime,
  type OwnerFact,
  type ProductionExtraction,
  type ProductionReserve,
  type Result,
  type SourceAccount,
  type SourceDelta,
  type WorldSourceCondition,
  type WorldSourceDelivery,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";

/**
 * Pure derivations of one exact finite raw-source drawdown (WS-003 §4A, §4B, §14 steps 6/10/12). They are the single
 * statement of the arithmetic and of the ownership of each step: the IM-02 owner operations compute the writes with them
 * and IM-11 admission re-derives the same writes with them, so a committed Source Delta, delivery and Reserve inflow is
 * exactly what the pinned extraction, the actual delta and the delivered Source Condition determine, and nothing else.
 *
 * They invent nothing: no yield, ratio, rate, renewal, partial fill or duration. The only quantity that moves is the exact
 * requested one, from the source's recoverable amount, to the Reserve, once; each unit is in exactly one place at every
 * committed cut (still source-owned, an undelivered Source Delta, delivered and awaiting its Reserve credit, or held).
 */
export interface PinnedFact<T> {
  readonly key: string;
  readonly version: number;
  readonly value: T;
}

export const pinned = <T>(
  fact: OwnerFact,
  schema: { safeParse(v: unknown): { success: boolean; data?: T } },
): PinnedFact<T> | undefined => {
  const r = schema.safeParse(fact.value);
  return r.success ? { key: fact.key, version: fact.version, value: r.data as T } : undefined;
};

/** The Production-caused Source Delta of one extraction, at its declared boundary (WS-003 §4A "Emit ... Source Delta"). */
export function deriveSourceDelta(extraction: PinnedFact<ProductionExtraction>): SourceDelta {
  const e = extraction.value;
  return {
    delta_id: e.extraction_id,
    cause: {
      kind: "PRODUCTION_EXTRACTION_DRAWDOWN",
      extraction: { fact_key: extraction.key, version: extraction.version },
      request: {
        owner: e.request.owner,
        fact_key: e.request.fact_key,
        version: e.request.version,
      },
    },
    magnitude: e.quantity,
    source: { fact_key: e.source.fact_key, source_key: e.source.source_key },
    material_class: e.material_class,
    accounting: "DISCRETE_EPISODIC_RESIDUE",
    emitted_at: e.timing.boundary.at,
    close_stage: productionSourceDeltaStage(e.extraction_id),
  };
}

export interface DeliveryPrior {
  readonly source: PinnedFact<WorldSourceCondition>;
  readonly delta: PinnedFact<SourceDelta>;
}
export interface DeliveryResult {
  readonly source: WorldSourceCondition;
  readonly delivery: WorldSourceDelivery;
}

/**
 * World-State consumes the ACTUAL Production-caused Source Delta and establishes the net Source Condition and any actual
 * PHYSICAL exhaustion (WS-003 §4A "Source owner resolves dynamics", §4B(4)). The delta must be this very source's (the
 * precise resolution key, material and unit), must not have been delivered, and must be supportable by what is
 * recoverable: World-State, not Production, decides what physically remains, and an insufficient condition is refused —
 * never a partial fill. A repeated delivery cannot decrement twice: the delta is recorded once, by identity.
 */
export function deriveSourceDelivery(p: DeliveryPrior): Result<DeliveryResult, "NOT_DELIVERABLE"> {
  const refuse = (message: string) => fail("NOT_DELIVERABLE", message);
  const s = p.source.value;
  const d = p.delta.value;
  if (
    d.source.fact_key !== p.source.key ||
    d.source.source_key !== s.source_key ||
    d.material_class !== s.material_class
  )
    return refuse(
      "the Source Delta is not for this Source Condition's resolution key and material",
    );
  if (d.magnitude.unit !== s.recoverable.unit)
    return refuse("the Source Delta and the Source Condition are not in the same unit");
  if (s.delivered.some((x) => x.delivery_id === d.delta_id))
    return refuse("this Source Delta was already delivered: a delivery is recorded once");
  if (s.exhaustion !== null) return refuse("the Source Condition is physically exhausted");
  if (s.recoverable.amount < d.magnitude.amount)
    return refuse("the recoverable amount does not support the delivered drawdown");

  const after = { amount: s.recoverable.amount - d.magnitude.amount, unit: s.recoverable.unit };
  const exhausted = after.amount === 0;
  const source: WorldSourceCondition = {
    ...s,
    recoverable: after,
    delivered: [...s.delivered, { delivery_id: d.delta_id, quantity: d.magnitude }].sort((a, b) =>
      a.delivery_id < b.delivery_id ? -1 : a.delivery_id > b.delivery_id ? 1 : 0,
    ),
    exhaustion: exhausted ? { kind: "PHYSICAL", delivery_id: d.delta_id } : null,
  };
  const delivery: WorldSourceDelivery = {
    delivery_id: d.delta_id,
    source: {
      fact_key: p.source.key,
      source_key: s.source_key,
      version_before: p.source.version,
      version_after: p.source.version + 1,
    },
    delta: { fact_key: p.delta.key, version: p.delta.version },
    delivered: d.magnitude,
    before: s.recoverable,
    after,
    exhausted,
    delivered_at: d.emitted_at,
    contribution: { extraction_id: d.delta_id, accounting: "DISCRETE_EPISODIC_RESIDUE" },
    close_stage: worldSourceDeliveryStage(d.delta_id),
  };
  return ok({ source, delivery });
}

export interface InflowPrior {
  readonly extraction: PinnedFact<ProductionExtraction>;
  readonly delta: PinnedFact<SourceDelta>;
  readonly delivery: PinnedFact<WorldSourceDelivery>;
  readonly reserve: ProductionReserve;
  readonly account: SourceAccount;
}
export interface InflowResult {
  readonly reserve: ProductionReserve;
  readonly account: SourceAccount;
}

/**
 * Production credits exactly the delivered, same-form, same-unit quantity to its authoritative Reserve, once, and only
 * AFTER World-State accepted the material cause (WS-003 §4A "Conserve produced material"; brief step 5). It closes the
 * extraction's commitment on the key's account and advances the key's delivery watermark. Nothing is created: the quantity
 * credited is the quantity World-State delivered, which is the quantity the delta stated, which is the quantity the
 * request asked for and the claim protected.
 */
export function deriveReserveInflow(p: InflowPrior): Result<InflowResult, "NOT_CREDITABLE"> {
  const refuse = (message: string) => fail("NOT_CREDITABLE", message);
  const e = p.extraction.value;
  const id = e.extraction_id;
  const q = e.quantity;
  if (p.delta.value.delta_id !== id || p.delivery.value.delivery_id !== id)
    return refuse("the delta and the delivery are this extraction's own");
  if (
    p.delivery.value.delta.fact_key !== p.delta.key ||
    p.delivery.value.delta.version !== p.delta.version ||
    p.delta.key !== productionSourceDeltaKey(id)
  )
    return refuse("the delivery consumed this extraction's delta at the pinned version");
  if (!canonicalEqual(p.delivery.value.delivered, q) || !canonicalEqual(p.delta.value.magnitude, q))
    return refuse("the delivered quantity is exactly the extracted quantity");
  if (p.delivery.value.source.fact_key !== e.source.fact_key)
    return refuse("the delivery is for this extraction's Source Condition");
  const r = p.reserve;
  if (
    r.reserve_id !== e.reserve.reserve_id ||
    r.material_class !== e.material_class ||
    r.quantity.unit !== q.unit
  )
    return refuse("the Reserve holds the same material in the same unit");
  if (!canonicalEqual(r.locality, p.account.locality))
    return refuse("the Reserve is at the Source Condition's own locality");
  if ((r.inflows ?? []).some((i) => i.inflow_id === id))
    return refuse("this inflow was already credited: an inflow is recorded once");
  const entry = p.account.open.find((o) => o.extraction_id === id);
  if (!entry || !canonicalEqual(entry.quantity, q))
    return refuse("the account holds this extraction's commitment");
  if (compareTime(p.account.watermark, p.delivery.value.delivered_at) === 1)
    return refuse("the delivery watermark never moves backward");

  const reserve: ProductionReserve = {
    ...r,
    quantity: { amount: r.quantity.amount + q.amount, unit: q.unit },
    inflows: [...(r.inflows ?? []), { inflow_id: id, quantity: q }].sort((a, b) =>
      a.inflow_id < b.inflow_id ? -1 : a.inflow_id > b.inflow_id ? 1 : 0,
    ),
  };
  const account: SourceAccount = {
    ...p.account,
    watermark: p.delivery.value.delivered_at,
    open: p.account.open.filter((o) => o.extraction_id !== id),
  };
  return ok({ reserve, account });
}

// -- state-derived phase and availability (identity reads only; never a scan) -----------------------------

export type Get = (key: string) => OwnerFact | undefined;

export type ExtractionPhase =
  | "ABSENT"
  /** committed and protecting its source quantity; nothing has physically changed */
  | "COMMITTED"
  /**
   * committed, but incompatible with other claims of the SAME canonical instant for the same scarce material: none of
   * them is credited and none proceeds, whatever order they arrived or are processed in (F-017 v0.3 §4 Same-time contention)
   */
  | "CONTESTED"
  /** the Production-caused Source Delta exists and is undelivered: the key's Pending Drawdown */
  | "PENDING_DELIVERY"
  /** World-State delivered it (the source is net of it); the Reserve is not yet credited */
  | "DELIVERED_AWAITING_CREDIT"
  /** the Reserve holds it, once */
  | "CREDITED";

/** Where one extraction's quantity is, derived from the facts that follow its commitment. */
export function extractionPhase(get: Get, extractionId: string): ExtractionPhase {
  const exFact = get(productionExtractionKey(extractionId));
  const ex = exFact ? ProductionExtractionSchema.safeParse(exFact.value) : undefined;
  if (!exFact || !ex?.success) return "ABSENT";
  const reserveFact = get(ex.data.reserve.fact_key);
  const reserve = reserveFact ? ProductionReserveSchema.safeParse(reserveFact.value) : undefined;
  if (reserve?.success && (reserve.data.inflows ?? []).some((i) => i.inflow_id === extractionId))
    return "CREDITED";
  const srcFact = get(ex.data.source.fact_key);
  const src = srcFact ? WorldSourceConditionSchema.safeParse(srcFact.value) : undefined;
  if (src?.success && src.data.delivered.some((d) => d.delivery_id === extractionId))
    return "DELIVERED_AWAITING_CREDIT";
  const delta = get(productionSourceDeltaKey(extractionId));
  if (delta && SourceDeltaSchema.safeParse(delta.value).success) return "PENDING_DELIVERY";
  const account = parseAccount(get(ex.data.account.fact_key));
  if (src?.success && account) {
    const mine = undeliveredCommitments(get, src.data, account).find((c) => c.id === extractionId);
    if (
      mine &&
      claimStanding(src.data, undeliveredCommitments(get, src.data, account), mine) === "CONTESTED"
    )
      return "CONTESTED";
  }
  return "COMMITTED";
}

/** One open, not-yet-netted commitment on a key, with the canonical instant it was made at. */
export interface Commitment {
  readonly id: string;
  readonly amount: number;
  /** the canonical instant of the commitment (its extraction's `started_at`); null when it cannot be read */
  readonly at: CanonicalTime | null;
}

/**
 * The open commitments of a key that World-State has not already netted out of the recoverable amount, each with the
 * canonical instant it was made at (read by identity from its sealed extraction).
 */
export function undeliveredCommitments(
  get: Get,
  source: WorldSourceCondition,
  account: SourceAccount,
): Commitment[] {
  const delivered = new Set(source.delivered.map((d) => d.delivery_id));
  return account.open
    .filter((o) => !delivered.has(o.extraction_id))
    .map((o) => {
      const f = get(productionExtractionKey(o.extraction_id));
      const ex = f ? ProductionExtractionSchema.safeParse(f.value) : undefined;
      return {
        id: o.extraction_id,
        amount: o.quantity.amount,
        at: ex?.success ? ex.data.timing.started_at : null,
      };
    });
}

/**
 * The material a claim made at `at` can rest on: the net recoverable amount less every commitment made at a STRICTLY
 * EARLIER canonical instant (genuine causal precedence: those claims were already committed when this instant arrived).
 * Null when some commitment's instant is not comparable with `at`.
 */
export function claimRoom(
  source: WorldSourceCondition,
  commitments: readonly Commitment[],
  at: CanonicalTime,
): number | null {
  let earlier = 0;
  for (const d of commitments) {
    if (d.at === null) return null;
    const c = compareTime(d.at, at);
    if (c === null) return null;
    if (c === -1) earlier += d.amount;
  }
  return source.recoverable.amount - earlier;
}

export type ClaimStanding = "SUPPORTED" | "CONTESTED";

/**
 * F-017 v0.3 §4 "Same-time contention": for a conserved quantity with no owner allocation, priority or neutral rule, claim
 * arrival or processing order decides nothing. Standing is therefore a function of the SET of claims alone. A claim is
 * SUPPORTED when the claims of its own canonical instant, taken together, fit in what strictly earlier commitments leave
 * (jointly supportable claims are all credited); otherwise EVERY claim of that instant is CONTESTED — none is credited,
 * none proceeds, and the conflict is preserved unresolved for the lawful owner/chooser. No priority, allocator or tie-break
 * exists, so reversing the arrival or processing order cannot change any claim's standing.
 */
export function claimStanding(
  source: WorldSourceCondition,
  commitments: readonly Commitment[],
  claim: Commitment,
): ClaimStanding {
  if (claim.at === null) return "CONTESTED";
  const room = claimRoom(source, commitments, claim.at);
  if (room === null) return "CONTESTED";
  let same = 0;
  for (const d of commitments)
    if (d.at !== null && compareTime(d.at, claim.at) === 0) same += d.amount;
  return same <= room ? "SUPPORTED" : "CONTESTED";
}

/**
 * The extractions of an account whose Source Delta is undelivered: the key's Pending Drawdown (WS-003 §4B(3)). Read from
 * the account's own open list by identity, so cost is bounded by the open commitments of that one key.
 */
export function pendingDrawdown(get: Get, account: SourceAccount): readonly string[] {
  return account.open
    .map((o) => o.extraction_id)
    .filter((id) => extractionPhase(get, id) === "PENDING_DELIVERY");
}

export const parseAccount = (f: OwnerFact | undefined): SourceAccount | undefined => {
  if (!f) return undefined;
  const r = SourceAccountSchema.safeParse(f.value);
  return r.success ? r.data : undefined;
};

/** The three stage identities of one drawdown, in dependency order. */
export const drawdownStages = (extractionId: string) =>
  [
    productionSourceDeltaStage(extractionId),
    worldSourceDeliveryStage(extractionId),
    productionReserveInflowStage(extractionId),
  ] as const;

export const deliveryKeyOf = (worldId: string, extractionId: string): string =>
  worldSourceDeliveryKey(worldId, extractionId);

/** `true` when the instant is the declared boundary of the extraction. */
export const atBoundary = (e: ProductionExtraction, t: CanonicalTime): boolean =>
  compareTime(t, e.timing.boundary.at) === 0;
