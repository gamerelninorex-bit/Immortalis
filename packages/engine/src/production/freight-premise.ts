import {
  AdmitInputLotInputSchema,
  AdmitMaterialSpecificationInputSchema,
  EconomyOriginAllocationSchema,
  FACET_PRODUCTION_STATE,
  InputLotPremiseSchema,
  MATERIAL_SPECIFICATION_NATURE,
  MaterialSpecificationPremiseSchema,
  OWNER_ECONOMY,
  OWNER_PRODUCTION,
  ProductionInputLotSchema,
  ProductionMaterialSpecificationSchema,
  ProductionRequestSchema,
  ProductionReserveSchema,
  PublicationSchema,
  TEMPORAL_STATE_KEY,
  WorldSiteConditionSchema,
  compareTime,
  fail,
  productionInputLotKey,
  productionMaterialSpecificationKey,
  productionReserveKey,
  worldLocusKey,
  worldProfileKey,
  worldSiteConditionKey,
  type CommitGroup,
  type OwnerFact,
  type ProductionInputLot,
  type ProductionMaterialSpecification,
  type ProductionOperation,
  type ProductionReserve,
  type Publication,
  type Result,
  type SchemaIssues,
  type StartOperationInput,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import {
  canonicalNow,
  checkPlan,
  committedAct,
  planned,
  publishPlan,
  refuse,
  sealedSlice,
  stateSource,
  storeSource,
  type FreightErrorCode,
  type FreightSource,
  type Planned,
} from "../owners/freight-common.ts";
import { FREIGHT_PRODUCTION_RULE, resolveKey } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";
import type { CampaignStore, CommitOutcome } from "../persistence/store.ts";

/**
 * IM-05 Production — the two Production-owned premises of the ROADBED first freight profile (R2-D18 v1.2.1 §1, §1.1, §2.1 C-05).
 *
 *  - The PROSPECTIVE repair-material specification: a source-qualified hard material prerequisite for a possible restoration,
 *    with class, positive exact total amount and unit, admitted from its OWN sealed slice of the same original envelope the
 *    World-State condition came from. It is a premise — never an undertaking to repair, an operation, a Reserve, an inventory
 *    or a maintenance simulation — and its total is an authored opening fact, never computed from a damage count.
 *  - The dedicated input lot: the lot's Production Reserve, established together with the lot record that binds it to its
 *    sealed slice and to the ONE exact declared operation it qualifies for. No yield, rate or duration is invented: the
 *    transformation and its completion boundary are the slice's own.
 *
 * The specification passes Production §3's Tier B persistence test only because the exact prerequisite is repeatedly
 * future-causal (origin-operation admission, Economy fixation, the destination-adequacy read) and a compact owner reference
 * prevents uncertain later reconstruction; it is not a general maintenance ledger.
 */

/** The reserve identity of a dedicated lot: derived from the lot identity alone. */
export const reserveIdOfLot = (lotId: string): string => `lot:${lotId}`;

/**
 * The material specification its sealed slice determines. Refused unless World-State has ALREADY admitted the objective
 * condition it names, from a DIFFERENT authenticated slice of the SAME original envelope, still at its original version; the
 * specification names that condition's own site; and the slice carries the exact class, positive total and unit.
 */
export function deriveMaterialSpecification(
  src: FreightSource,
  worldId: string,
  sliceId: string,
): Planned {
  const sealed = sealedSlice(src, worldId, sliceId, "material_specification");
  if (!sealed.ok) return sealed;
  const { attestation, slice, provenance } = sealed.value;
  const premise = MaterialSpecificationPremiseSchema.safeParse(slice.premise);
  if (!premise.success)
    return refuse(
      "SOURCE_REFUSED",
      "the slice is not an exact material prerequisite: class, positive total amount and unit are authored, never conditional or computed",
      { slice_id: sliceId },
    );
  const p = premise.data;
  const conditionKey = worldSiteConditionKey(worldId, p.condition_id);
  const conditionFact = src.getFact(conditionKey);
  const condition = conditionFact
    ? WorldSiteConditionSchema.safeParse(conditionFact.value)
    : undefined;
  if (!conditionFact || !condition?.success)
    return refuse(
      "PREREQUISITE_MISSING",
      "World-State admits the objective condition before Production admits its material prerequisite",
      { key: conditionKey },
    );
  const c = condition.data;
  if (
    conditionFact.version !== 1 ||
    c.site.entity_id !== p.site_locus_id ||
    c.original.attestation.fact_key !== provenance.attestation.fact_key ||
    c.original.envelope_digest !== provenance.envelope_digest ||
    c.original.slice_id === provenance.slice_id
  )
    return refuse(
      "SOURCE_REFUSED",
      "the prerequisite names the original condition of the same site, from a distinct slice of the same sealed envelope",
      { key: conditionKey },
    );
  const key = productionMaterialSpecificationKey(p.specification_id);
  if (src.getFact(key))
    return refuse(
      "NOT_ADMISSIBLE",
      "the material prerequisite is admitted from its sealed slice once",
      {
        key,
      },
    );
  const value = ProductionMaterialSpecificationSchema.parse({
    specification_id: p.specification_id,
    world: attestation.value.world,
    site: c.site,
    condition: { fact_key: conditionKey, condition_id: p.condition_id, version: 1 },
    material_class: p.material_class,
    quantity: p.quantity,
    function: p.function,
    nature: MATERIAL_SPECIFICATION_NATURE,
    original: provenance,
  } satisfies ProductionMaterialSpecification);
  return planned([{ key, value, expected_version: 0 }], [attestation.fact.key, conditionKey]);
}

/**
 * The dedicated input lot its sealed slice determines: the lot's Reserve (its whole authored quantity, unclaimed and unspent,
 * at the attested origin) and the lot record, established together. Refused unless the lot lies at the attested origin, the
 * dedicated operation consumes this lot's own material in its own unit and no more than it holds, and canonical time is
 * established.
 */
export function deriveInputLot(src: FreightSource, worldId: string, sliceId: string): Planned {
  const sealed = sealedSlice(src, worldId, sliceId, "input_lot");
  if (!sealed.ok) return sealed;
  const { attestation, slice, provenance } = sealed.value;
  const premise = InputLotPremiseSchema.safeParse(slice.premise);
  if (!premise.success)
    return refuse("SOURCE_REFUSED", "the slice is not a typed dedicated input lot", {
      slice_id: sliceId,
    });
  const p = premise.data;
  const pins = attestation.value.pins;
  if (p.origin_locus_id !== pins.origin.entity_id)
    return refuse("SOURCE_REFUSED", "the dedicated lot lies at the attested origin", {
      slice_id: sliceId,
    });
  const op = p.dedicated_operation;
  if (
    op.input.material_class !== p.material_class ||
    op.input.quantity.unit !== p.quantity.unit ||
    op.input.quantity.amount > p.quantity.amount
  )
    return refuse(
      "SOURCE_REFUSED",
      "the dedicated operation consumes this lot's own material, in its unit, and no more than the lot holds",
      { slice_id: sliceId },
    );
  if (!canonicalNow(src))
    return refuse(
      "PREREQUISITE_MISSING",
      "canonical time is established before a premise is admitted",
      {
        key: TEMPORAL_STATE_KEY,
      },
    );
  const reserveId = reserveIdOfLot(p.lot_id);
  const reserveKey = productionReserveKey(reserveId);
  const lotKey = productionInputLotKey(p.lot_id);
  if (src.getFact(lotKey) || src.getFact(reserveKey))
    return refuse("NOT_ADMISSIBLE", "the dedicated lot is admitted from its sealed slice once", {
      key: lotKey,
    });
  const worldKey = worldProfileKey(worldId);
  const originKey = worldLocusKey(worldId, p.origin_locus_id);
  const reserve = ProductionReserveSchema.parse({
    reserve_id: reserveId,
    material_class: p.material_class,
    established: p.quantity,
    quantity: p.quantity,
    consumed: [],
    condition: p.condition,
    locality: {
      world: { fact_key: worldKey, entity_id: worldId },
      locus: { fact_key: originKey, entity_id: p.origin_locus_id },
    },
    holding: "HELD_LOCAL_BY_PRODUCTION",
    claims: [],
  } satisfies ProductionReserve);
  const lot = ProductionInputLotSchema.parse({
    lot_id: p.lot_id,
    world: attestation.value.world,
    origin: { fact_key: originKey, entity_id: p.origin_locus_id },
    institution_id: p.institution_id,
    reserve: { fact_key: reserveKey, reserve_id: reserveId, version: 1 },
    material_class: p.material_class,
    quantity: p.quantity,
    condition: p.condition,
    dedicated_operation: op,
    original: provenance,
  } satisfies ProductionInputLot);
  return planned(
    [
      { key: reserveKey, value: reserve, expected_version: 0 },
      { key: lotKey, value: lot, expected_version: 0 },
    ],
    [attestation.fact.key, worldKey, originKey, TEMPORAL_STATE_KEY],
  );
}

export function readMaterialSpecification(
  src: Pick<FreightSource, "getFact">,
  specificationId: string,
): { fact: OwnerFact; value: ProductionMaterialSpecification } | undefined {
  const fact = src.getFact(productionMaterialSpecificationKey(specificationId));
  const parsed = fact ? ProductionMaterialSpecificationSchema.safeParse(fact.value) : undefined;
  return fact && parsed?.success ? { fact, value: parsed.data } : undefined;
}
export function readInputLot(
  src: Pick<FreightSource, "getFact">,
  lotId: string,
): { fact: OwnerFact; value: ProductionInputLot } | undefined {
  const fact = src.getFact(productionInputLotKey(lotId));
  const parsed = fact ? ProductionInputLotSchema.safeParse(fact.value) : undefined;
  return fact && parsed?.success ? { fact, value: parsed.data } : undefined;
}

/**
 * The dedicated lot a C-05 Production Request was fixed for, by identity: the request names its Economy origin allocation
 * (`source.cause_ref`), which pins the lot. Undefined when the request is not a first-profile origin request.
 */
export function dedicatedLotOfRequest(
  src: Pick<FreightSource, "getFact">,
  requestKey: string,
): { fact: OwnerFact; value: ProductionInputLot } | undefined {
  const requestFact = src.getFact(requestKey);
  const request = requestFact ? ProductionRequestSchema.safeParse(requestFact.value) : undefined;
  if (!requestFact || !request?.success || request.data.source.owner !== OWNER_ECONOMY)
    return undefined;
  const allocationFact = src.getFact(request.data.source.cause_ref);
  if (!allocationFact || resolveKey(allocationFact.key)?.kind.id !== "economy_origin_allocation")
    return undefined;
  const allocation = EconomyOriginAllocationSchema.safeParse(allocationFact.value);
  if (!allocation.success || allocation.data.production_request.fact_key !== requestKey)
    return undefined;
  return readInputLot(src, allocation.data.input_lot.lot_id);
}

/** Whether a Production Request identity is a first-profile C-05 origin request (a technical encoding of that class). */
export const isOriginRequestId = (requestId: string): boolean => requestId.startsWith("origin:");

/**
 * Production's own independent validation of a first-profile origin operation at START (R2-D18 §4 step 2: "Production
 * separately validates ... hard prerequisite, Reserve/open-claim exclusivity and operation feasibility"): the operation is
 * EXACTLY the dedicated lot's sealed operation — its Reserve, input, output, condition and declared completion boundary — so
 * a caller can neither substitute another lot nor declare a yield the sealed source does not state. Returns a message, or
 * null when the operation is not an origin operation or is exactly the sealed one.
 */
export function originOperationViolation(
  op: ProductionOperation,
  facts: { get(key: string): OwnerFact | undefined },
): string | null {
  if (op.request.owner !== OWNER_ECONOMY || !isOriginRequestId(op.request.request_id)) return null;
  const lot = dedicatedLotOfRequest({ getFact: (k) => facts.get(k) }, op.request.fact_key);
  if (!lot)
    return "an origin operation is started only for a request Economy fixed under its C-05 allocation for one dedicated lot";
  const d = lot.value.dedicated_operation;
  const t = op.transformation;
  if (
    op.reserve.fact_key !== lot.value.reserve.fact_key ||
    !canonicalEqual(t.input, d.input) ||
    t.output.output_class !== d.output.output_class ||
    !canonicalEqual(t.output.quantity, d.output.quantity) ||
    t.output.condition !== d.output.condition ||
    compareTime(op.timing.completion.at, d.completion_at) !== 0
  )
    return "an origin operation is exactly the dedicated lot's sealed operation: its own Reserve, input, output and declared completion boundary";
  return null;
}

/** The exact start input the dedicated lot's sealed operation determines for its fixed request. */
export function dedicatedStartInput(
  src: Pick<FreightSource, "getFact">,
  requestKey: string,
): StartOperationInput | undefined {
  const lot = dedicatedLotOfRequest(src, requestKey);
  if (!lot) return undefined;
  const d = lot.value.dedicated_operation;
  return {
    request_key: requestKey,
    reserve_id: lot.value.reserve.reserve_id,
    transformation: {
      input_quantity: d.input.quantity,
      output_quantity: d.output.quantity,
      output_class: d.output.output_class,
      output_condition: d.output.condition,
    },
    completion_at: d.completion_at,
  };
}

// ---------------------------------------------------------------------------------------------
// IM-11 admission
// ---------------------------------------------------------------------------------------------

const FREIGHT_PRODUCTION_KINDS = new Set([
  "production_material_specification",
  "production_input_lot",
]);
export const writesProductionFreightKind = (group: CommitGroup): boolean =>
  group.writes.some((w) => FREIGHT_PRODUCTION_KINDS.has(resolveKey(w.key)?.kind.id ?? ""));

export function productionFreightGroupCheck(
  group: CommitGroup,
  state: CampaignState,
): Rejection | null {
  const src = stateSource(state);
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  const spec = group.writes.filter((w) => kindOf(w.key) === "production_material_specification");
  const lot = group.writes.filter((w) => kindOf(w.key) === "production_input_lot");
  if (spec.length === 1 && group.writes.length === 1) {
    const s = ProductionMaterialSpecificationSchema.parse(spec[0]!.value);
    return checkPlan(
      group,
      state,
      deriveMaterialSpecification(src, s.world.entity_id, s.original.slice_id),
    );
  }
  if (lot.length === 1 && group.writes.length === 2) {
    const l = ProductionInputLotSchema.parse(lot[0]!.value);
    return checkPlan(group, state, deriveInputLot(src, l.world.entity_id, l.original.slice_id));
  }
  return reject(
    "VALUE_INVALID",
    "a first-profile Production premise is one material specification, or one dedicated lot with its Reserve",
  );
}

// ---------------------------------------------------------------------------------------------
// Authored operations (archivist path)
// ---------------------------------------------------------------------------------------------

const invalid = (what: string, e: SchemaIssues) =>
  fail("INPUT_INVALID", `${what} failed validation`, {
    issues: e.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
  });
const refused = (r: {
  error: { code: string; message: string; details?: Record<string, unknown> };
}) => fail(r.error.code as FreightErrorCode, r.error.message, r.error.details);
const pick = (i: Publication): Publication => ({
  group_id: i.group_id,
  intent_id: i.intent_id,
  cause: i.cause,
  basis: i.basis,
  secrecy: i.secrecy,
});

export class ProductionFreightAdapter {
  readonly #store: CampaignStore;
  constructor(store: CampaignStore) {
    this.#store = store;
  }

  async #admit(
    input: Publication & { readonly premise: unknown },
    schema: typeof AdmitInputLotInputSchema,
    kind: string,
    derive: (src: FreightSource, worldId: string, sliceId: string) => Planned,
  ): Promise<Result<CommitOutcome, FreightErrorCode>> {
    const p = PublicationSchema.safeParse(pick(input));
    if (!p.success) return invalid("publication", p.error);
    const i = schema.safeParse(input.premise);
    if (!i.success) return invalid("premise", i.error);
    const prior = committedAct(this.#store, p.data, (g) =>
      g.writes.some((w) => {
        const v = w.value as {
          world?: { entity_id?: string };
          original?: { slice_id?: string };
        };
        return (
          resolveKey(w.key)?.kind.id === kind &&
          v.world?.entity_id === i.data.world_id &&
          v.original?.slice_id === i.data.slice_id
        );
      }),
    );
    if (!prior.ok) return prior;
    if (prior.value) return this.#store.commit(prior.value);
    const plan = derive(storeSource(this.#store), i.data.world_id, i.data.slice_id);
    if (!plan.ok) return refused(plan);
    return publishPlan(
      this.#store,
      p.data,
      OWNER_PRODUCTION,
      FACET_PRODUCTION_STATE,
      FREIGHT_PRODUCTION_RULE,
      plan.value,
    );
  }

  /** Admits the prospective repair-material specification from its own sealed slice. */
  admitMaterialSpecification(input: Publication & { readonly premise: unknown }) {
    return this.#admit(
      input,
      AdmitMaterialSpecificationInputSchema,
      "production_material_specification",
      deriveMaterialSpecification,
    );
  }

  /** Admits the dedicated input lot (its Reserve and its lot record) from its own sealed slice. */
  admitInputLot(input: Publication & { readonly premise: unknown }) {
    return this.#admit(input, AdmitInputLotInputSchema, "production_input_lot", deriveInputLot);
  }

  // -- typed reads, by identity (none scans) ---------------------------------------------------

  materialSpecification(specificationId: string) {
    return readMaterialSpecification(this.#store, specificationId);
  }
  inputLot(lotId: string) {
    return readInputLot(this.#store, lotId);
  }
  /** The exact start input the sealed dedicated operation determines for a fixed C-05 request (a derived read). */
  dedicatedStartInput(requestKey: string): StartOperationInput | undefined {
    return dedicatedStartInput(this.#store, requestKey);
  }
}
