import {
  CANON_WRITE_AUTHORITY,
  productionBoundaryId,
  productionObjectId,
  type CanonicalTime,
  type CommitGroup,
  type ProductionRequest,
  type ResolutionRequest,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  productionCompletionProvider,
  worldFallbackAcceptanceProvider,
  type StageOwnerExtension,
  type WriteAdmission,
} from "@immortalis/engine";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "./canonical-fixtures.ts";
import { SYNTH_RULE, TIME_UNIT, at } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Production & Resource Conservation Backbone Foundation. Every owner, material,
 * class, quantity, unit, coordinate and identifier below is a fixture, not IMMORTALIS canon: it carries no game
 * semantics, no yield, ratio, rate, throughput, capacity, duration default or labor coefficient (CAL-01, CAL-02
 * and CAL-03 stay unresolved), and no number here is a default of any Production behavior. The Production owner
 * and the World-State fallback custodian are NOT synthetic and live in @immortalis/engine; what is synthetic is
 * the OTHER party of the proof — a test requester that commits Production Requests in its own key space,
 * registered through an extension that cannot write a canonical, kernel, Population or Production key space.
 * Production code must never import this package (Bootstrap Plan §2.2).
 */
export const SYNTH_REQUESTER_OWNER = "SYNTHETIC-PRODUCTION-REQUESTER";
const REQUESTER_FACET = "synthetic-requester";
const REQUESTER_PREFIX = "synthetic-request/";

const REQUESTER_ADMISSION: WriteAdmission = {
  check(group) {
    for (const w of group.writes) {
      if (!w.key.startsWith(REQUESTER_PREFIX)) {
        return {
          code: "KEY_NOT_ADMITTED",
          message: "not this synthetic owner's key",
          details: { key: w.key },
        };
      }
    }
    return null;
  },
};

export const PRODUCTION_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([[SYNTH_REQUESTER_OWNER, new Set([REQUESTER_FACET])]]),
  admission: REQUESTER_ADMISSION,
};

// -- coordinates (test coordinates only) -------------------------------------------------------------------
export const PROD_T0 = at(100);
/** the explicit completion boundary of the primary operation (fixture evidence, never a default) */
export const PROD_TC = at(140);
/** a later, unrelated operation's boundary */
export const PROD_TC_OTHER = at(260);
export const PROD_T1 = at(300);
export { TIME_UNIT };

// -- exact fixture quantities (test evidence only) ----------------------------------------------------------
export const MATERIAL_CLASS = "synthetic-material-m";
export const MATERIAL_UNIT = "synthetic-unit-m";
export const OUTPUT_CLASS = "synthetic-durable-d";
export const OUTPUT_UNIT = "synthetic-unit-d";
export const RESERVE_MAIN = "reserve-main";
export const RESERVE_OTHER = "reserve-other";
export const REQ_1 = "req-1";
export const REQ_2 = "req-2";
export const REQ_OTHER = "req-other";

export const requestKey = (requestId: string): string => `${REQUESTER_PREFIX}${requestId}`;

export const productionRequest = (
  requestId: string,
  over: Partial<ProductionRequest> = {},
): ProductionRequest => ({
  request_id: requestId,
  source: { owner: SYNTH_REQUESTER_OWNER, cause_ref: `synthetic-cause-${requestId}` },
  requested_output: { output_class: OUTPUT_CLASS, quantity: { amount: 1, unit: OUTPUT_UNIT } },
  scope: {
    world: { fact_key: `world/${FIXTURE_WORLD_ID}/profile`, entity_id: FIXTURE_WORLD_ID },
    locus: {
      fact_key: `world/${FIXTURE_WORLD_ID}/locus/${FIXTURE_LOCUS_ID}`,
      entity_id: FIXTURE_LOCUS_ID,
    },
  },
  priority_authority_ref: null,
  ...over,
});

/** A synthetic-requester publication: create (version 0) or advance. */
export function requestGroup(
  campaignId: string,
  n: number,
  requestId: string,
  value: unknown = productionRequest(requestId),
  expectedVersion = 0,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `prod-fixture-group-${n}`,
    intent_id: `prod-fixture-intent-${n}`,
    owner: SYNTH_REQUESTER_OWNER,
    facet: REQUESTER_FACET,
    cause: `prod-fixture-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key: requestKey(requestId),
        owner: SYNTH_REQUESTER_OWNER,
        facet: REQUESTER_FACET,
        value: value as never,
        unit: null,
        basis: "prod-fixture-basis",
        secrecy: "prod-fixture-secrecy",
        expected_version: expectedVersion,
      },
    ],
  };
}

export const reserveInput = (
  reserve_id = RESERVE_MAIN,
  amount = 10,
  over: Record<string, unknown> = {},
) => ({
  reserve_id,
  material_class: MATERIAL_CLASS,
  quantity: { amount, unit: MATERIAL_UNIT },
  condition: "synthetic-condition-c",
  world_id: FIXTURE_WORLD_ID,
  locus_id: FIXTURE_LOCUS_ID,
  ...over,
});

export const startInput = (
  requestId: string,
  over: { reserve_id?: string; input?: number; completion_at?: CanonicalTime } = {},
) => ({
  request_key: requestKey(requestId),
  reserve_id: over.reserve_id ?? RESERVE_MAIN,
  transformation: {
    input_quantity: { amount: over.input ?? 6, unit: MATERIAL_UNIT },
    output_quantity: { amount: 1, unit: OUTPUT_UNIT },
    output_class: OUTPUT_CLASS,
    output_condition: "synthetic-condition-d",
  },
  completion_at: over.completion_at ?? PROD_TC,
});

export const productionProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([productionCompletionProvider, worldFallbackAcceptanceProvider]);

export const prodPublication = (n: number) => ({
  group_id: `prod-group-${n}`,
  intent_id: `prod-intent-${n}`,
  cause: `prod-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

const CONTEXT = { role: "role.player", permission: "permission.player_choice.commit" } as const;

/** A target-only request: resolve every earned boundary due by `target`, then stop exactly there. */
export const prodAdvanceRequest = (
  id: string,
  target: CanonicalTime,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
  continues: null,
  requested: { target, condition: null },
  context: CONTEXT,
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

/** Toward PROD_T1, stopping once the operation's declared completion boundary has resolved. */
export const prodStopAtBoundaryRequest = (
  id: string,
  operationId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest =>
  prodAdvanceRequest(id, PROD_T1, {
    requested: {
      target: PROD_T1,
      condition: {
        kind: "STOP_AFTER_BOUNDARY",
        object_id: productionObjectId(operationId),
        boundary_id: productionBoundaryId(operationId),
      },
    },
    ...over,
  });
