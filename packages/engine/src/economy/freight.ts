import {
  ECONOMY_OPERATION_RECORD_FREIGHT_RECEIPT,
  EconomyAcceptedOutputHoldingSchema,
  EconomyDestinationAdequacySchema,
  EconomyFreightAllocationSchema,
  EconomyFreightCloseSchema,
  EconomyFreightReceiptSchema,
  EconomyFreightRequestSchema,
  EconomyFreightSlotSchema,
  EconomyFreightUseConsumptionSchema,
  EconomyFreightWithdrawalSchema,
  EconomyOriginAllocationSchema,
  FACET_ECONOMY_STATE,
  FreightRequestTargetSchema,
  FreightResolutionInputSchema,
  LogisticsCommitmentSchema,
  OWNER_ECONOMY,
  OWNER_LOGISTICS,
  OWNER_WORLD_STATE,
  PublicationSchema,
  READ_MODE_NOW,
  economyAcceptedOutputHoldingKey,
  economyDestinationAdequacyKey,
  economyFreightAllocationKey,
  economyFreightCargoSlotKey,
  economyFreightCloseKey,
  economyFreightDirectiveUseSlotKey,
  economyFreightReceiptKey,
  economyFreightReceiptStage,
  economyFreightRequestKey,
  economyFreightRequirementSlotKey,
  economyFreightUseConsumptionKey,
  economyFreightWithdrawalKey,
  economyOriginAllocationKey,
  fail,
  gipReadinessSealKey,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsTransferKey,
  productionOutputReference,
  worldEntityTransitionKey,
  type CommitGroup,
  type DependencyDeclaration,
  type EconomyAcceptedOutputHolding,
  type EconomyDestinationAdequacy,
  type EconomyFreightAllocation,
  type EconomyFreightClose,
  type EconomyFreightReceipt,
  type EconomyFreightRequest,
  type EconomyFreightSlot,
  type EconomyFreightUseConsumption,
  type EconomyFreightWithdrawal,
  type EconomyOriginAllocation,
  type LogisticsCommitment,
  type OwnerFact,
  type Publication,
  type Result,
  type SchemaIssues,
  type SourceFactRef,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  checkPlan,
  committedAct,
  publishPlan,
  stateSource,
  storeSource,
  type FreightErrorCode,
  type FreightRefusalCode,
  type FreightSource,
  type Planned,
} from "../owners/freight-common.ts";
import { FREIGHT_ECONOMY_RULE, resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import type { CampaignStore, CommitOutcome } from "../persistence/store.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";
import {
  adequacyStatusOf,
  deriveClose,
  deriveDestinationAdequacy,
  deriveFreightFixation,
  deriveFreightReceipt,
  deriveFreightStatus,
  deriveOriginSelfProvision,
  deriveUseConsumption,
  deriveWithdrawal,
  profileScope,
  type AdequacyStatus,
  type FreightActKind,
  type FreightStatus,
} from "./freight-derive.ts";

/**
 * IM-06 Economy — admission, the receipt stage and the authored operations of the ROADBED first freight profile.
 *
 * Economy's first-profile state changes ONLY by one of seven owner acts, each RE-DERIVED from committed state at admission
 * (so the rule holds for a raw `store.commit` and a tampered group as much as for an adapter call):
 *
 *   C-05  origin self-provision      → origin allocation + lot slot + the one Production Request
 *   C-06  freight fixation E0 / E2   → sealed request + allocation + the three exclusive slots + the encumbered holding
 *   C-07  withdrawal-pending (W2/W3) → the create-once protective admission + the allocation's state
 *   C     terminal close             → close + terminal allocation + three slots released once + the holding available
 *   E1    one-use consumption        → consumption + allocation + the three slots consumed
 *   ER    receipt (an IM-02 stage)   → receipt + allocation + the holding available at the destination by that receipt
 *   AD    destination adequacy       → the adequacy conclusion
 *
 * No act takes a caller's verdict. There is no "fix allocation", "set status", "mark delivered" or "release slot" operation.
 */

const FREIGHT_ECONOMY_KINDS = new Set([
  "economy_origin_allocation",
  "economy_origin_lot_slot",
  "economy_accepted_output_holding",
  "economy_freight_request",
  "economy_freight_allocation",
  "economy_freight_directive_use_slot",
  "economy_freight_cargo_slot",
  "economy_freight_requirement_slot",
  "economy_freight_withdrawal",
  "economy_freight_close",
  "economy_freight_use_consumption",
  "economy_freight_receipt",
  "economy_destination_adequacy",
]);
const kindOf = (key: string): string | undefined => resolveKey(key)?.kind.id;
export const writesEconomyFreightKind = (group: CommitGroup): boolean =>
  group.writes.some((w) => FREIGHT_ECONOMY_KINDS.has(kindOf(w.key) ?? ""));

/** The seal identity a committed seal key names. */
const sealIdOfKey = (key: string): string | undefined => {
  const resolved = resolveKey(key);
  return resolved?.kind.id === "gip_legal_readiness_seal" ? resolved.ids[0] : undefined;
};

// ---------------------------------------------------------------------------------------------
// ER — declaration and stage provider
// ---------------------------------------------------------------------------------------------

const now = (source: SourceFactRef) => ({
  mode: READ_MODE_NOW as typeof READ_MODE_NOW,
  source,
  invalidators: [{ fact_key: source.fact_key }],
});

/**
 * The fourth declared stage of a first-profile freight transfer's ONE temporal object (R3-T2 §4: `LD → WT → LR → ER`): it
 * reads, AS-OF-NOW, the sealed request, the one-use consumption, Logistics' retired transfer and released commitment and its
 * delivery cause, and World-State's committed ECT-01 — so it is a dependent of the retirement and of the destination commit
 * and can precede neither. Null for a commitment that is not a first-profile freight commitment.
 */
export function economyFreightReceiptDeclaration(
  c: LogisticsCommitment,
): DependencyDeclaration | null {
  if (c.freight === undefined) return null;
  const world = c.origin.world.entity_id;
  const entityId = c.moved.entity_id;
  const requestRef = c.request.request_id;
  return {
    stage: economyFreightReceiptStage(requestRef),
    reads: [
      now({ owner: OWNER_ECONOMY, fact_key: c.request.fact_key }),
      now({
        owner: OWNER_ECONOMY,
        fact_key: economyFreightUseConsumptionKey(c.freight.directive_use_id),
      }),
      now({ owner: OWNER_LOGISTICS, fact_key: logisticsCommitmentKey(world, entityId) }),
      now({ owner: OWNER_LOGISTICS, fact_key: logisticsTransferKey(world, entityId) }),
      now({ owner: OWNER_LOGISTICS, fact_key: logisticsDeliveryKey(world, entityId) }),
      now({ owner: OWNER_WORLD_STATE, fact_key: worldEntityTransitionKey(world, entityId) }),
    ],
    produces: [
      economyFreightReceiptKey(requestRef),
      economyFreightAllocationKey(requestRef),
      economyAcceptedOutputHoldingKey(world, entityId),
    ],
    declares_close: null,
  };
}

const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

/** ER, exposed to the IM-02 coordinator through the owner-adapter seam. Pure and deterministic; fails closed. */
export const economyFreightReceiptProvider: StageProvider = {
  owner: OWNER_ECONOMY,
  facet: FACET_ECONOMY_STATE,
  operation: ECONOMY_OPERATION_RECORD_FREIGHT_RECEIPT,
  rule: FREIGHT_ECONOMY_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const readOf = (owner: string, kind: string): OwnerFact => {
      const found = input.reads.filter(
        (r) => r.fact.owner === owner && kindOf(r.fact.key) === kind,
      );
      if (input.reads.length !== 6 || found.length !== 1)
        throw unresolved("SOURCE_ABSENT", `a freight receipt reads exactly one ${kind}`);
      return found[0]!.fact;
    };
    const request = readOf(OWNER_ECONOMY, "economy_freight_request");
    const consumption = readOf(OWNER_ECONOMY, "economy_freight_use_consumption");
    const commitment = readOf(OWNER_LOGISTICS, "logistics_commitment");
    const transfer = readOf(OWNER_LOGISTICS, "logistics_transfer");
    const delivery = readOf(OWNER_LOGISTICS, "logistics_delivery");
    const transition = readOf(OWNER_WORLD_STATE, "world_entity_transition");
    const parsed = EconomyFreightRequestSchema.safeParse(request.value);
    if (!parsed.success) throw unresolved("SOURCE_INVALID", "the request violates its contract");
    const requestRef = parsed.data.request_ref;
    const receiptKey = economyFreightReceiptKey(requestRef);
    const allocationKey = economyFreightAllocationKey(requestRef);
    const holdingKey = parsed.data.holding.fact_key;
    if (
      input.produces.length !== 3 ||
      ![receiptKey, allocationKey, holdingKey].every((k) => input.produces.includes(k))
    )
      throw unresolved("SOURCE_INVALID", "the receipt does not write its own three facts");
    const allocation = input.prior.get(allocationKey);
    const holding = input.prior.get(holdingKey);
    if (input.prior.has(receiptKey) || !allocation || !holding)
      throw unresolved(
        "SOURCE_INVALID",
        "a receipt is recorded once, for a fixed and consumed request",
      );
    const derived = deriveFreightReceipt({
      request,
      allocation,
      holding,
      consumption,
      commitment,
      transfer,
      delivery,
      transition,
      at: input.span.to,
    });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    const write = (key: string, value: unknown): StageWrite => ({
      key,
      value: value as never,
      unit: null,
      basis: request.basis,
      secrecy: request.secrecy,
    });
    return [
      write(receiptKey, derived.value.receipt),
      write(allocationKey, derived.value.allocation),
      write(holdingKey, derived.value.holding),
    ];
  },
};

// ---------------------------------------------------------------------------------------------
// IM-11 admission
// ---------------------------------------------------------------------------------------------

type Write = CommitGroup["writes"][number];

/** The engaged, unretired delivery boundary of a first-profile transfer, supplied by Logistics' own admission rule. */
export type EngagedBoundaryRule = (
  state: CampaignState,
  requestId: string,
  boundaryAt: { unit: string; value: number },
) => string | null;

function checkReceipt(
  group: CommitGroup,
  state: CampaignState,
  receiptW: Write,
  engaged: EngagedBoundaryRule,
): Rejection | null {
  const bad = (message: string) => reject("VALUE_INVALID", message, { key: receiptW.key });
  if (group.writes.length !== 3 || receiptW.expected_version !== 0)
    return bad("a freight receipt is one create with its allocation and holding");
  const receipt = EconomyFreightReceiptSchema.parse(receiptW.value);
  const requestRef = receipt.request.request_ref;
  const requestKey = economyFreightRequestKey(requestRef);
  const allocationKey = economyFreightAllocationKey(requestRef);
  const allocation = state.facts.get(allocationKey);
  const parsedAllocation = allocation
    ? EconomyFreightAllocationSchema.safeParse(allocation.value)
    : undefined;
  if (
    !allocation ||
    !parsedAllocation?.success ||
    parsedAllocation.data.state.status !== "dispatch-consumed"
  )
    return reject(
      "PREREQUISITE_MISSING",
      "a receipt follows the one-use consumption of its request",
      {
        key: allocationKey,
      },
    );
  const consumptionKey = parsedAllocation.data.state.consumption.fact_key;
  const worldId = receipt.origin.world.entity_id;
  const entityId = receipt.entity.entity_id;
  // every upstream fact is read at its CURRENT version and depended upon (a stage pins what it read)
  const upstream: Record<string, OwnerFact> = {};
  for (const [name, key, what] of [
    ["request", requestKey, "the sealed request"],
    ["consumption", consumptionKey, "the one-use consumption"],
    ["commitment", logisticsCommitmentKey(worldId, entityId), "the released commitment"],
    ["transfer", logisticsTransferKey(worldId, entityId), "the retired transfer"],
    ["delivery", logisticsDeliveryKey(worldId, entityId), "the delivery cause"],
    [
      "transition",
      worldEntityTransitionKey(worldId, entityId),
      "the destination owner's committed transition",
    ],
  ] as const) {
    const required = requirePrerequisite(group, state, key, what);
    if (isRejection(required)) return required;
    upstream[name] = required.fact;
  }
  const commitment = LogisticsCommitmentSchema.safeParse(upstream["commitment"]!.value);
  const request = EconomyFreightRequestSchema.safeParse(upstream["request"]!.value);
  if (!commitment.success || !request.success)
    return reject("REFERENCE_INVALID", "a receipt reads its request and its commitment");
  const holding = state.facts.get(request.data.holding.fact_key);
  if (!holding)
    return reject("PREREQUISITE_MISSING", "the accepted-output holding is not committed");
  const derived = deriveFreightReceipt({
    request: upstream["request"]!,
    allocation,
    holding,
    consumption: upstream["consumption"]!,
    commitment: upstream["commitment"]!,
    transfer: upstream["transfer"]!,
    delivery: upstream["delivery"]!,
    transition: upstream["transition"]!,
    at: commitment.data.delivery.at,
  });
  if (!derived.ok) return bad(derived.error.message);
  const expected: readonly [string, unknown, number][] = [
    [receiptW.key, derived.value.receipt, 0],
    [allocationKey, derived.value.allocation, allocation.version],
    [holding.key, derived.value.holding, holding.version],
  ];
  for (const [key, value, version] of expected) {
    const w = group.writes.find((x) => x.key === key);
    if (!w || w.expected_version !== version || !canonicalEqual(w.value, value))
      return bad(
        "a receipt is exactly what the committed chain determines: the destination commit and the retirement of this very request",
      );
  }
  const identity = stageAuthorityViolation(
    group,
    economyFreightReceiptStage(requestRef),
    state.facts,
    commitment.data.delivery.at,
    "ADMISSION",
  );
  if (identity) return reject("REFERENCE_INVALID", identity, { key: receiptW.key });
  const boundary = engaged(state, requestRef, commitment.data.delivery.at);
  if (boundary) return reject("REFERENCE_INVALID", boundary, { key: receiptW.key });
  return null;
}

/**
 * Economy's first-profile admission. `engaged` is Logistics' own rule for "this transfer's declared delivery boundary is
 * engaged and unretired", passed in so Economy never re-states another owner's rule.
 */
export function economyFreightGroupCheck(
  group: CommitGroup,
  state: CampaignState,
  engaged: EngagedBoundaryRule,
): Rejection | null {
  const src = stateSource(state);
  const of = (id: string) => group.writes.filter((w) => kindOf(w.key) === id);
  const one = (id: string): Write | undefined => {
    const found = of(id);
    return found.length === 1 ? found[0] : undefined;
  };
  const refused = (what: string) =>
    reject("PREREQUISITE_MISSING", `${what} is not committed at the identity the act names`);

  const origin = one("economy_origin_allocation");
  if (origin) {
    const a = EconomyOriginAllocationSchema.parse(origin.value);
    const sealId = sealIdOfKey(a.seal.fact_key);
    if (!sealId) return refused("the Legal Readiness Seal");
    return checkPlan(
      group,
      state,
      deriveOriginSelfProvision(src, sealId, a.trigger.owner_event.fact_key),
    );
  }
  const request = one("economy_freight_request");
  if (request) {
    const r = EconomyFreightRequestSchema.parse(request.value);
    const sealId = sealIdOfKey(r.legal.seal.fact_key);
    if (!sealId) return refused("the Legal Readiness Seal");
    return checkPlan(
      group,
      state,
      deriveFreightFixation(src, sealId, r.trigger.owner_event.fact_key),
    );
  }
  const withdrawal = one("economy_freight_withdrawal");
  if (withdrawal) {
    const w = EconomyFreightWithdrawalSchema.parse(withdrawal.value);
    return checkPlan(group, state, deriveWithdrawal(src, w.request.request_ref));
  }
  const close = one("economy_freight_close");
  if (close) {
    const c = EconomyFreightCloseSchema.parse(close.value);
    return checkPlan(group, state, deriveClose(src, c.request.request_ref));
  }
  const consumption = one("economy_freight_use_consumption");
  if (consumption) {
    const u = EconomyFreightUseConsumptionSchema.parse(consumption.value);
    return checkPlan(group, state, deriveUseConsumption(src, u.request.request_ref));
  }
  const receipt = one("economy_freight_receipt");
  if (receipt) return checkReceipt(group, state, receipt, engaged);
  const adequacy = one("economy_destination_adequacy");
  if (adequacy) {
    const a = EconomyDestinationAdequacySchema.parse(adequacy.value);
    return checkPlan(group, state, deriveDestinationAdequacy(src, a.request.request_ref));
  }
  return reject(
    "VALUE_INVALID",
    "Economy's first-profile freight state changes only by origin self-provision, fixation, withdrawal-pending admission, terminal close, one-use consumption, the receipt stage or the adequacy conclusion: a slot, a holding or an allocation is never written on its own",
  );
}

// ---------------------------------------------------------------------------------------------
// Authored operations (archivist path)
// ---------------------------------------------------------------------------------------------

const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, {
    issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
  });
const refusedPlan = (r: {
  error: { code: string; message: string; details?: Record<string, unknown> };
}) => fail(r.error.code as FreightErrorCode, r.error.message, r.error.details);
const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});

type Typed<T> = { readonly fact: OwnerFact; readonly value: T };

/**
 * IM-06 Economy — the authored path of the first freight profile. A caller names a SCOPE (the profile's seal and the owner
 * event that opened the resolution, or one fixed request) and nothing else: no lot, quantity, cargo, winner, cause, status or
 * result. Every value is derived from committed owner facts, and each publication is made by the archivist path through the
 * one store, so the store's admission re-derives it. Re-presenting an intent that already committed returns the original
 * receipt (RC-16) without re-admitting anything against later state; a changed scope under that intent is a conflict.
 */
export class EconomyFreightAdapter {
  readonly #store: CampaignStore;
  constructor(store: CampaignStore) {
    this.#store = store;
  }

  async #publish(
    p: Publication,
    sameAct: (prior: CommitGroup) => boolean,
    derive: (src: FreightSource) => Planned,
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const prior = committedAct(this.#store, p, sameAct);
    if (!prior.ok) return prior;
    if (prior.value) return this.#store.commit(prior.value);
    const plan = derive(storeSource(this.#store));
    if (!plan.ok) return refusedPlan(plan);
    return publishPlan(
      this.#store,
      p,
      OWNER_ECONOMY,
      FACET_ECONOMY_STATE,
      FREIGHT_ECONOMY_RULE,
      plan.value,
    );
  }

  async #resolution(
    input: Publication & { readonly resolution: unknown },
    kind: string,
    scopeOf: (value: unknown) => { seal: string; event: string } | undefined,
    derive: (src: FreightSource, sealId: string, ownerEvent: string) => Planned,
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = FreightResolutionInputSchema.safeParse(input.resolution);
    if (!i.success) return invalid("resolution", i.error);
    const sealKey = gipReadinessSealKey(i.data.seal_id);
    return this.#publish(
      p.data,
      (g) =>
        g.writes.some((w) => {
          if (kindOf(w.key) !== kind) return false;
          const scope = scopeOf(w.value);
          return scope?.seal === sealKey && scope.event === i.data.owner_event;
        }),
      (src) => derive(src, i.data.seal_id, i.data.owner_event),
    );
  }

  async #request(
    input: Publication & { readonly request: unknown },
    kind: string,
    derive: (src: FreightSource, requestRef: string) => Planned,
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = FreightRequestTargetSchema.safeParse(input.request);
    if (!i.success) return invalid("request", i.error);
    return this.#publish(
      p.data,
      (g) =>
        g.writes.some(
          (w) =>
            kindOf(w.key) === kind &&
            (w.value as { request?: { request_ref?: string } }).request?.request_ref ===
              i.data.request_ref,
        ),
      (src) => derive(src, i.data.request_ref),
    );
  }

  /**
   * C-05: opens the scoped origin resolution the named owner event opened, and — only when the determinate rule selects —
   * fixes the one input-side allocation and the one Production Request atomically. Otherwise nothing is written.
   */
  resolveOriginSelfProvision(input: Publication & { readonly resolution: unknown }) {
    return this.#resolution(
      input,
      "economy_origin_allocation",
      (value) => {
        const a = EconomyOriginAllocationSchema.safeParse(value);
        return a.success
          ? { seal: a.data.seal.fact_key, event: a.data.trigger.owner_event.fact_key }
          : undefined;
      },
      deriveOriginSelfProvision,
    );
  }

  /**
   * C-06: opens the scoped fixation resolution the named owner event opened, and — only when the determinate rule selects —
   * claims the three exclusive slots and seals the one Movement Service Request atomically (E0; or E2 after a proven unused
   * close). Otherwise nothing is written.
   */
  resolveFreightFixation(input: Publication & { readonly resolution: unknown }) {
    return this.#resolution(
      input,
      "economy_freight_request",
      (value) => {
        const r = EconomyFreightRequestSchema.safeParse(value);
        return r.success
          ? { seal: r.data.legal.seal.fact_key, event: r.data.trigger.owner_event.fact_key }
          : undefined;
      },
      deriveFreightFixation,
    );
  }

  /**
   * C-07: admits withdrawal-pending for a pending request upon the first owner-admitted W2 / W3 occurrence Economy
   * re-derives at this cut. It protects only. With no such occurrence nothing is admitted; no cause is taken from the caller.
   */
  admitWithdrawal(input: Publication & { readonly request: unknown }) {
    return this.#request(input, "economy_freight_withdrawal", deriveWithdrawal);
  }

  /** C: terminally closes a withdrawal-pending request and releases its three slots exactly once. */
  closeWithdrawnRequest(input: Publication & { readonly request: unknown }) {
    return this.#request(input, "economy_freight_close", deriveClose);
  }

  /** E1: consumes the request's one directive use against its committed first dispatch. */
  consumeFirstDispatch(input: Publication & { readonly request: unknown }) {
    return this.#request(input, "economy_freight_use_consumption", deriveUseConsumption);
  }

  /** AD: records the independent current destination-adequacy conclusion of a received request. */
  recordDestinationAdequacy(input: Publication & { readonly request: unknown }) {
    return this.#request(input, "economy_destination_adequacy", deriveDestinationAdequacy);
  }

  // -- typed reads and derived queries, by identity (none scans, none writes) ---------------------

  #read<T>(
    key: string,
    schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } },
  ): Typed<T> | undefined {
    const fact = this.#store.getFact(key);
    if (!fact) return undefined;
    const parsed = schema.safeParse(fact.value);
    return parsed.success ? { fact, value: parsed.data } : undefined;
  }

  originAllocation(specificationId: string): Typed<EconomyOriginAllocation> | undefined {
    return this.#read(economyOriginAllocationKey(specificationId), EconomyOriginAllocationSchema);
  }
  freightRequest(requestRef: string): Typed<EconomyFreightRequest> | undefined {
    return this.#read(economyFreightRequestKey(requestRef), EconomyFreightRequestSchema);
  }
  allocation(requestRef: string): Typed<EconomyFreightAllocation> | undefined {
    return this.#read(economyFreightAllocationKey(requestRef), EconomyFreightAllocationSchema);
  }
  holding(worldId: string, entityId: string): Typed<EconomyAcceptedOutputHolding> | undefined {
    return this.#read(
      economyAcceptedOutputHoldingKey(worldId, entityId),
      EconomyAcceptedOutputHoldingSchema,
    );
  }
  /** The three exclusive slots of a fixed request, by their own keys. */
  slots(requestRef: string):
    | {
        readonly directive_use: Typed<EconomyFreightSlot> | undefined;
        readonly cargo: Typed<EconomyFreightSlot> | undefined;
        readonly requirement: Typed<EconomyFreightSlot> | undefined;
      }
    | undefined {
    const request = this.freightRequest(requestRef);
    if (!request) return undefined;
    const r = request.value;
    return {
      directive_use: this.#read(
        economyFreightDirectiveUseSlotKey(r.directive_use_id),
        EconomyFreightSlotSchema,
      ),
      cargo: this.#read(
        economyFreightCargoSlotKey(
          r.origin_ref.world.entity_id,
          r.moved_object_or_quantity_ref.entity_id,
        ),
        EconomyFreightSlotSchema,
      ),
      requirement: this.#read(
        economyFreightRequirementSlotKey(
          r.requirement.specification.fact_key.split("/").pop() ?? "",
        ),
        EconomyFreightSlotSchema,
      ),
    };
  }
  withdrawal(requestRef: string): Typed<EconomyFreightWithdrawal> | undefined {
    return this.#read(economyFreightWithdrawalKey(requestRef), EconomyFreightWithdrawalSchema);
  }
  close(requestRef: string): Typed<EconomyFreightClose> | undefined {
    return this.#read(economyFreightCloseKey(requestRef), EconomyFreightCloseSchema);
  }
  useConsumption(directiveUseId: string): Typed<EconomyFreightUseConsumption> | undefined {
    return this.#read(
      economyFreightUseConsumptionKey(directiveUseId),
      EconomyFreightUseConsumptionSchema,
    );
  }
  receipt(requestRef: string): Typed<EconomyFreightReceipt> | undefined {
    return this.#read(economyFreightReceiptKey(requestRef), EconomyFreightReceiptSchema);
  }
  destinationAdequacy(requestRef: string): Typed<EconomyDestinationAdequacy> | undefined {
    return this.#read(economyDestinationAdequacyKey(requestRef), EconomyDestinationAdequacySchema);
  }

  /**
   * The request currently (or last) fixed for a profile, found by identity through the profile's own cargo slot — never by
   * scanning requests. Undefined when no request was ever fixed.
   */
  currentRequestRef(sealId: string): string | undefined {
    const src = storeSource(this.#store);
    const scope = profileScope(src, sealId);
    if (!scope.ok) return undefined;
    const origin = this.originAllocation(scope.value.specificationId);
    if (!origin) return undefined;
    const entityId = productionOutputReference(origin.value.production_request.request_id);
    const slot = this.#read(
      economyFreightCargoSlotKey(scope.value.worldId, entityId),
      EconomyFreightSlotSchema,
    );
    return slot?.value.state.request_ref;
  }

  /**
   * EL-02S: Economy's owner-derived current status of a fixed request for one prospective Logistics act, freshly derived at
   * this cut. Read-only: it stores nothing, and a non-positive answer is an act-level non-commit, never F1.
   */
  currentStatus(
    requestRef: string,
    act: FreightActKind,
  ): Result<FreightStatus, FreightRefusalCode> {
    return deriveFreightStatus(storeSource(this.#store), requestRef, act);
  }

  /** Economy's derived current destination-adequacy answer for a request (a read). */
  adequacyStatus(requestRef: string): AdequacyStatus {
    return adequacyStatusOf(storeSource(this.#store), requestRef);
  }
}
