import type { CanonicalTime, ProductionRequest, ResolutionRequest } from "@immortalis/contracts";
import {
  productionExtractionBoundaryId,
  productionExtractionObjectId,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  productionReserveInflowProvider,
  productionSourceDeltaProvider,
  worldSourceDeliveryProvider,
} from "@immortalis/engine";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "./canonical-fixtures.ts";
import {
  PROD_T0,
  PROD_T1,
  SYNTH_REQUESTER_OWNER,
  prodAdvanceRequest,
  productionRequest,
} from "./production-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Exact Finite Raw-Source Drawdown & Conserved Reserve Inflow slice. Every material, unit,
 * quantity, key, coordinate and identifier below is a fixture, not IMMORTALIS canon: it carries no game semantics, no yield,
 * ratio, rate, renewal, throughput, capacity, duration default or labor coefficient (CAL-01, CAL-02 and CAL-03 stay
 * unresolved). The fixture's "five units" and "three units" are test evidence of ONE same-unit, non-transformative case,
 * never adopted general yield coefficients. The Production owner, the World-State Source Condition owner and the Temporal
 * kernel are NOT synthetic and live in @immortalis/engine; the synthetic party is only the requester that commits the
 * Production Requests in its own key space (the Production fixture's). Production code must never import this package.
 */
export const SRC_SOURCE_KEY = "source-main";
export const SRC_SOURCE_OTHER = "source-other";
export const SRC_MATERIAL = "synthetic-raw-material-r";
export const SRC_UNIT = "synthetic-raw-unit-r";
export const SRC_DIMENSION = "synthetic-dimension-surface";
export const SRC_BASIS_ID = "basis-main";
export const SRC_BASIS_OTHER = "basis-other";
export const SRC_RESERVE = "reserve-raw";
export const SRC_RESERVE_OTHER = "reserve-raw-other";
/** the fixture Source Condition's exact established recoverable amount */
export const SRC_ESTABLISHED = 5;
/** the fixture request quantity (an independent, separately authorized three-unit direct removal) */
export const SRC_REQUESTED = 3;
export const SRC_REQ_1 = "draw-req-1";
export const SRC_REQ_2 = "draw-req-2";
export const SRC_REQ_3 = "draw-req-3";
export const SRC_ACCESS = {
  aspect: "synthetic-access-aspect",
  statement:
    "SYNTHETIC FIXTURE: the material lies loose on the surface and can be gathered by hand.",
} as const;

/** the explicit extraction boundary of the primary drawdown (fixture evidence, never a default) */
export const SRC_BOUNDARY = PROD_T0.value + 40;
export const srcAt = (value: number): CanonicalTime => ({ unit: PROD_T0.unit, value });
export const SRC_TB = srcAt(SRC_BOUNDARY);
export const SRC_TB_LATER = srcAt(SRC_BOUNDARY + 60);
export { PROD_T0 as SRC_T0, PROD_T1 as SRC_T1 };

export const sourceInput = (over: Record<string, unknown> = {}) => ({
  source_key: SRC_SOURCE_KEY,
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
  dimension: SRC_DIMENSION,
  material_class: SRC_MATERIAL,
  quantity: { amount: SRC_ESTABLISHED, unit: SRC_UNIT },
  access_facts: [SRC_ACCESS],
  statement:
    "SYNTHETIC FIXTURE: an initial setting fact; exactly this much can ever be recovered here.",
  ...over,
});

export const basisInput = (over: Record<string, unknown> = {}) => ({
  basis_id: SRC_BASIS_ID,
  world_id: FIXTURE_WORLD_ID,
  source_key: SRC_SOURCE_KEY,
  material_class: SRC_MATERIAL,
  unit: SRC_UNIT,
  relies_on: SRC_ACCESS,
  ...over,
});

export const reserveRawInput = (reserve_id = SRC_RESERVE, amount = 0) => ({
  reserve_id,
  material_class: SRC_MATERIAL,
  quantity: { amount, unit: SRC_UNIT },
  condition: "synthetic-condition-raw",
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
});

/** A Production Request for an exact amount of the same untransformed raw material, in its own source's key space. */
export const drawdownRequest = (
  requestId: string,
  amount = SRC_REQUESTED,
  over: Partial<ProductionRequest> = {},
): ProductionRequest =>
  productionRequest(requestId, {
    requested_output: { output_class: SRC_MATERIAL, quantity: { amount, unit: SRC_UNIT } },
    ...over,
  });

export const startExtractionInput = (
  requestKey: string,
  over: {
    basis_id?: string;
    source_key?: string;
    reserve_id?: string;
    boundary_at?: CanonicalTime;
    world_id?: string;
  } = {},
) => ({
  request_key: requestKey,
  basis_id: over.basis_id ?? SRC_BASIS_ID,
  world_id: over.world_id ?? FIXTURE_WORLD_ID,
  source_key: over.source_key ?? SRC_SOURCE_KEY,
  reserve_id: over.reserve_id ?? SRC_RESERVE,
  boundary_at: over.boundary_at ?? SRC_TB,
});

/** The real owner stage providers of one drawdown (no fixture owner). */
export const drawdownProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionSourceDeltaProvider,
    worldSourceDeliveryProvider,
    productionReserveInflowProvider,
  ]);

export const drawdownPublication = (n: number) => ({
  group_id: `draw-group-${n}`,
  intent_id: `draw-intent-${n}`,
  cause: `draw-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** A target-only request toward SRC_T1, resolving every earned boundary due by `target`. */
export const drawdownAdvanceRequest = (
  id: string,
  target: CanonicalTime = PROD_T1,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => prodAdvanceRequest(id, target, over);

/** Stop immediately after the extraction's boundary has resolved. */
export const drawdownStopAtBoundaryRequest = (
  id: string,
  extractionId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest =>
  prodAdvanceRequest(id, PROD_T1, {
    requested: {
      target: PROD_T1,
      condition: {
        kind: "STOP_AFTER_BOUNDARY",
        object_id: productionExtractionObjectId(extractionId),
        boundary_id: productionExtractionBoundaryId(extractionId),
      },
    },
    ...over,
  });

export { SYNTH_REQUESTER_OWNER };
