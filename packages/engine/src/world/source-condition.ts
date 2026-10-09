import {
  FACET_WORLD_SOURCE_CONDITION,
  OWNER_WORLD_STATE,
  ProductionExtractionSchema,
  SourceDeltaSchema,
  WORLD_OPERATION_DELIVER_SOURCE_DRAWDOWN,
  WorldLocusSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  compareTime,
  productionExtractionKey,
  productionSourceDeltaKey,
  worldLocusKey,
  worldProfileKey,
  worldSourceConditionKey,
  worldSourceDeliveryKey,
  worldSourceDeliveryStage,
  type CommitGroup,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { WORLD_SOURCE_CONDITION_RULE, resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import { extractionBoundaryViolation } from "../source-drawdown/admission.ts";
import { deriveSourceDelivery, pinned } from "../source-drawdown/derive.ts";
import {
  StageUnresolvedError,
  type StageInput,
  type StageProvider,
  type StageWrite,
} from "../temporal/providers.ts";

/**
 * The World-State Source Condition owner (IM-03; WS-003 §4A "Identify owner", "Source owner resolves dynamics"; WG
 * "World Generation May Own" world-side state and "integration of committed outputs from functional owners"). World-State
 * alone commits the Source Condition: its establishment as an initial setting fact, and — on consuming the ACTUAL
 * Production-caused Source Delta — the net Source Condition and any actual PHYSICAL exhaustion. Production never authors
 * the remaining physical endowment, and neither a request, a caller nor a fixture can supply a remainder or a delivery:
 * the delivery exists only as the IM-02 stage below, re-derived from the delta by IM-11 admission.
 *
 * Two fact kinds share one facet (`world_source_condition`): the ADVANCING Source Condition and the SEALED delivery
 * record. There is no rate, renewal, regeneration, flow, split, merge or re-key (those are other slices): a key's identity
 * is its resolution key, a delta for any other key fails closed, and an exhausted key delivers nothing more.
 */

/**
 * IM-11 admission of a Source Condition establishment or a delivery. Pure: a function of (group, state) only.
 */
export function worldSourceGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const bad = (message: string, details?: Record<string, unknown>) =>
    reject("VALUE_INVALID", message, details);
  const ref = (message: string, details?: Record<string, unknown>) =>
    reject("REFERENCE_INVALID", message, details);
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  const ws = group.writes;
  const sourceW = ws.filter((w) => kindOf(w.key) === "world_source_condition");
  const deliveryW = ws.filter((w) => kindOf(w.key) === "world_source_delivery");

  // 1. establishment: an initial setting fact at an established world locus, created once, with nothing yet delivered
  if (sourceW.length === 1 && ws.length === 1 && sourceW[0]!.expected_version === 0) {
    const s = WorldSourceConditionSchema.parse(sourceW[0]!.value);
    const { world, locus } = s.locality;
    if (
      world.fact_key !== worldProfileKey(world.entity_id) ||
      locus.fact_key !== worldLocusKey(world.entity_id, locus.entity_id)
    )
      return ref("locality references do not match their key identities");
    if (sourceW[0]!.key !== worldSourceConditionKey(world.entity_id, s.source_key))
      return ref("a Source Condition lives at the key derived from its resolution key");
    const w = requirePrerequisite(group, state, world.fact_key, "the world profile");
    if (isRejection(w)) return w;
    const lo = requirePrerequisite(group, state, locus.fact_key, "the world locus");
    if (isRejection(lo)) return lo;
    const committed = WorldLocusSchema.safeParse(lo.fact.value);
    if (!committed.success || committed.data.world.entity_id !== world.entity_id)
      return ref("the locus does not belong to the world", { key: locus.fact_key });
    if (
      s.delivered.length > 0 ||
      s.exhaustion !== null ||
      !canonicalEqual(s.recoverable, s.establishment.quantity)
    )
      return bad(
        "a newly established Source Condition holds its whole exact established quantity, with nothing delivered",
      );
    return null;
  }

  // 2. delivery: re-derived from the ACTUAL Production-caused Source Delta, as the IM-02 stage it is
  if (
    sourceW.length === 1 &&
    deliveryW.length === 1 &&
    ws.length === 2 &&
    sourceW[0]!.expected_version > 0 &&
    deliveryW[0]!.expected_version === 0
  ) {
    const priorFact = state.facts.get(sourceW[0]!.key);
    const prior = priorFact ? pinned(priorFact, WorldSourceConditionSchema) : undefined;
    if (!prior)
      return reject("PREREQUISITE_MISSING", "a delivery advances an established Source Condition");
    const receipt = WorldSourceDeliverySchema.parse(deliveryW[0]!.value);
    const id = receipt.delivery_id;
    const world = prior.value.locality.world.entity_id;
    if (deliveryW[0]!.key !== worldSourceDeliveryKey(world, id))
      return ref("a delivery lives at the key derived from its extraction", {
        key: deliveryW[0]!.key,
      });
    const deltaPin = requirePrerequisite(
      group,
      state,
      productionSourceDeltaKey(id),
      "the Source Delta",
    );
    if (isRejection(deltaPin)) return deltaPin;
    const delta = pinned(deltaPin.fact, SourceDeltaSchema);
    if (!delta) return ref("the cited fact is not a Production-caused Source Delta");
    const exFact = state.facts.get(productionExtractionKey(id));
    const ex = exFact ? ProductionExtractionSchema.safeParse(exFact.value) : undefined;
    if (!exFact || !ex?.success)
      return reject("PREREQUISITE_MISSING", "the delta's extraction is not committed");
    const derived = deriveSourceDelivery({ source: prior, delta });
    if (!derived.ok) return bad(derived.error.message);
    if (
      !canonicalEqual(sourceW[0]!.value, derived.value.source) ||
      !canonicalEqual(deliveryW[0]!.value, derived.value.delivery)
    )
      return bad(
        "a delivery is exactly the actual Source Delta consumed: the net Source Condition and any PHYSICAL exhaustion, once",
      );
    const identity = stageAuthorityViolation(
      group,
      worldSourceDeliveryStage(id),
      state.facts,
      ex.data.timing.boundary.at,
      "ADMISSION",
    );
    if (identity) return ref(identity, { key: deliveryW[0]!.key });
    return extractionBoundaryViolation(state, ex.data);
  }
  return reject(
    "VALUE_INVALID",
    "a Source Condition changes only by establishment or by the delivery of an actual Source Delta",
  );
}

const unresolved = (reason: ConstructorParameters<typeof StageUnresolvedError>[0], msg: string) =>
  new StageUnresolvedError(reason, msg);

/**
 * The World-State delivery operation, exposed to the IM-02 coordinator through the owner-adapter seam. Pure and
 * deterministic: identical input, identical writes. At the extraction's one declared boundary, and only after Production
 * emitted the delta, it consumes that actual delta, commits the net Source Condition and the delivery record, or throws
 * StageUnresolvedError (no credit, nothing published). It invents nothing: no yield, loss, regeneration or partial fill.
 */
export const worldSourceDeliveryProvider: StageProvider = {
  owner: OWNER_WORLD_STATE,
  facet: FACET_WORLD_SOURCE_CONDITION,
  operation: WORLD_OPERATION_DELIVER_SOURCE_DRAWDOWN,
  rule: WORLD_SOURCE_CONDITION_RULE,
  compute(input: StageInput): readonly StageWrite[] {
    const deltas = input.reads.filter(
      (r) => resolveKey(r.fact.key)?.kind.id === "production_source_delta",
    );
    if (deltas.length !== 1 || input.reads.length !== 1)
      throw unresolved("SOURCE_ABSENT", "a delivery reads exactly one Source Delta");
    const sourceKeys = input.produces.filter(
      (k) => resolveKey(k)?.kind.id === "world_source_condition",
    );
    const deliveryKeys = input.produces.filter(
      (k) => resolveKey(k)?.kind.id === "world_source_delivery",
    );
    if (sourceKeys.length !== 1 || deliveryKeys.length !== 1 || input.produces.length !== 2)
      throw unresolved(
        "SOURCE_INVALID",
        "a delivery advances one Source Condition and creates one record",
      );
    const sourceKey = sourceKeys[0]!;
    const deliveryKey = deliveryKeys[0]!;
    const priorFact = input.prior.get(sourceKey);
    if (!priorFact || input.prior.has(deliveryKey))
      throw unresolved(
        "SOURCE_ABSENT",
        "a delivery advances an established Source Condition, once",
      );
    const deltaFact = deltas[0]!.fact;
    const delta = pinned(deltaFact, SourceDeltaSchema);
    const prior = pinned(priorFact, WorldSourceConditionSchema);
    if (!delta || !prior)
      throw unresolved("SOURCE_INVALID", "the Source Delta or the Source Condition is malformed");
    // resolved only AT the extraction's own declared boundary, never at a requested horizon
    if (compareTime(input.span.to, delta.value.emitted_at) !== 0)
      throw unresolved("BASIS_MISMATCH", "a delivery resolves at the declared boundary only");
    const derived = deriveSourceDelivery({ source: prior, delta });
    if (!derived.ok) throw unresolved("SOURCE_INVALID", derived.error.message);
    return [
      {
        key: sourceKey,
        value: derived.value.source as never,
        unit: null,
        basis: priorFact.basis,
        secrecy: priorFact.secrecy,
      },
      {
        key: deliveryKey,
        value: derived.value.delivery as never,
        unit: null,
        basis: priorFact.basis,
        secrecy: priorFact.secrecy,
      },
    ];
  },
};
