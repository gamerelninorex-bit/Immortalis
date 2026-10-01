import {
  CANON_WRITE_AUTHORITY,
  ENTITY_TRANSITION_CLOSE_BASIS,
  EntityTransitionCloseSchema,
  entityTransitionObjectId,
  entityTransitionBoundaryId,
  productionOutputReference,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CanonicalTime,
  type CommitGroup,
  type DependencyDeclaration,
  type EntityTransitionCause,
  type ResolutionRequest,
  type StageKey,
  type TemporalObject,
  type WorldLocus,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  productionCompletionProvider,
  worldEntityTransitionProvider,
  worldFallbackAcceptanceProvider,
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "./canonical-fixtures.ts";
import {
  PRODUCTION_FIXTURE_EXTENSION,
  PROD_T1,
  prodAdvanceRequest,
} from "./production-fixtures.ts";
import { SYNTH_RULE, at } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the World-State Entity Continuity / Transition Close Backbone Foundation. Every owner,
 * key, operation, identifier and coordinate below is a fixture, not IMMORTALIS canon: it carries no game semantics
 * and no calibration, and no coordinate is a default of any behavior. The World-State fallback custodian is NOT
 * synthetic and lives in @immortalis/engine; what is synthetic is the OTHER parties of the proof — a test CAUSE
 * owner that commits one causing result in its own key space (it establishes cause and causal outcome only), and a
 * test downstream consumer that reads the committed Entity Transition Close — both registered through an extension
 * that cannot write a canonical, kernel, Population, Production, Economy or World-State key space. The cause is
 * clearly synthetic and is no canonical gameplay subsystem. Production code must never import this package
 * (Bootstrap Plan §2.2).
 */
export const SYNTH_ENTITY_CAUSE_OWNER = "SYNTHETIC-ENTITY-TRANSITION-CAUSE-OWNER";
export const SYNTH_ENTITY_CONSUMER_OWNER = "SYNTHETIC-ENTITY-TRANSITION-CONSUMER";
const CAUSE_FACET = "synthetic-entity-cause";
const CONSUMER_FACET = "synthetic-entity-consumer";
const CAUSE_PREFIX = "synthetic-entity-cause/";
const CONSUMER_PREFIX = "synthetic-entity-consumer/";

const prefixAdmission = (prefix: string): WriteAdmission => ({
  check(group) {
    for (const w of group.writes) {
      if (!w.key.startsWith(prefix)) {
        return {
          code: "KEY_NOT_ADMITTED",
          message: "not this synthetic owner's key",
          details: { key: w.key },
        };
      }
    }
    return null;
  },
});
const CAUSE_ADMISSION = prefixAdmission(CAUSE_PREFIX);
const CONSUMER_ADMISSION = prefixAdmission(CONSUMER_PREFIX);

/** The production proof's requester (to obtain an accepted entity), the cause owner and the consumer. */
export const ENTITY_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([
    ...PRODUCTION_FIXTURE_EXTENSION.owners,
    [SYNTH_ENTITY_CAUSE_OWNER, new Set([CAUSE_FACET])],
    [SYNTH_ENTITY_CONSUMER_OWNER, new Set([CONSUMER_FACET])],
  ]),
  admission: {
    check(group, state) {
      if (group.owner === SYNTH_ENTITY_CAUSE_OWNER) return CAUSE_ADMISSION.check(group, state);
      if (group.owner === SYNTH_ENTITY_CONSUMER_OWNER)
        return CONSUMER_ADMISSION.check(group, state);
      return PRODUCTION_FIXTURE_EXTENSION.admission?.check(group, state) ?? null;
    },
  },
};

// -- coordinates (test coordinates only) -------------------------------------------------------------------
/** the instant a fixture causing result takes effect (after the production proof's completion boundary) */
export const ENT_T_EFFECT = at(200);
/** a later instant, for a consumer whose own boundary lies after the transition's */
export const ENT_T_LATER = at(240);

// -- the world's second and third loci (destinations) -------------------------------------------------------
export const DEST_LOCUS_ID = "locus-fixture-dest";
export const OTHER_LOCUS_ID = "locus-fixture-other";
export const CAUSE_1 = "cause-1";
export const CAUSE_2 = "cause-2";
export const CAUSE_OTHER = "cause-other";

export const fixtureDestinationLocus = (locusId = DEST_LOCUS_ID): WorldLocus => ({
  locus_id: locusId,
  world: { fact_key: worldProfileKey(FIXTURE_WORLD_ID), entity_id: FIXTURE_WORLD_ID },
  designation: "SYNTHETIC FIXTURE: a second bounded test locality.",
  constraints: [],
});

/** The accepted entity the production proof makes for a request: the same conserved reference, by identity. */
export const acceptedEntityKey = (requestId: string): string =>
  worldFallbackEntityKey(FIXTURE_WORLD_ID, productionOutputReference(requestId));
export const acceptedEntityId = (requestId: string): string => productionOutputReference(requestId);
export const transitionKeyOf = (requestId: string): string =>
  worldEntityTransitionKey(FIXTURE_WORLD_ID, acceptedEntityId(requestId));

export const causeKey = (causeId: string): string => `${CAUSE_PREFIX}${causeId}`;

export const locusRef = (locusId: string, worldId = FIXTURE_WORLD_ID) => ({
  world: { fact_key: worldProfileKey(worldId), entity_id: worldId },
  locus: { fact_key: worldLocusKey(worldId, locusId), entity_id: locusId },
});

/** A causing result: one material same-entity locus change is required of the accepted entity of `requestId`. */
export const transitionCause = (
  causeId: string,
  requestId: string,
  over: {
    destination?: string;
    established_at?: CanonicalTime;
    occurs_at?: CanonicalTime;
  } = {},
): EntityTransitionCause => ({
  cause_id: causeId,
  source: { owner: SYNTH_ENTITY_CAUSE_OWNER, cause_ref: `synthetic-cause-event-${causeId}` },
  subject: { fact_key: acceptedEntityKey(requestId), entity_id: acceptedEntityId(requestId) },
  outcome: {
    kind: "SAME_ENTITY_LOCUS_CHANGE_REQUIRED",
    destination: locusRef(over.destination ?? DEST_LOCUS_ID),
  },
  timing: {
    established_at: over.established_at ?? at(140),
    occurs_at: over.occurs_at ?? ENT_T_EFFECT,
  },
});

/** A synthetic-cause-owner publication: create (version 0) or advance. */
export function causeGroup(
  campaignId: string,
  n: number,
  causeId: string,
  value: unknown,
  expectedVersion = 0,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `ent-fixture-group-${n}`,
    intent_id: `ent-fixture-intent-${n}`,
    owner: SYNTH_ENTITY_CAUSE_OWNER,
    facet: CAUSE_FACET,
    cause: `ent-fixture-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key: causeKey(causeId),
        owner: SYNTH_ENTITY_CAUSE_OWNER,
        facet: CAUSE_FACET,
        value: value as never,
        unit: null,
        basis: "ent-fixture-basis",
        secrecy: "ent-fixture-secrecy",
        expected_version: expectedVersion,
      },
    ],
  };
}

// -- the synthetic downstream consumer ---------------------------------------------------------------------
export const CONSUMER_OP_NOW = "synthetic-entity-transition-consume-now";
export const CONSUMER_OP_CLOSE = "synthetic-entity-transition-consume-close";

export const entityConsumerResultKey = (causeId: string, mode: "NOW" | "CLOSE" = "NOW"): string =>
  `${CONSUMER_PREFIX}${mode.toLowerCase()}/${causeId}`;
export const entityConsumerObjectId = (causeId: string, mode: "NOW" | "CLOSE" = "NOW"): string =>
  `obj-entity-consumer-${mode.toLowerCase()}-${causeId}`;

export const entityConsumerStage = (causeId: string, mode: "NOW" | "CLOSE" = "NOW"): StageKey => ({
  causal_process_id: `entity-consumer-${mode.toLowerCase()}:${causeId}`,
  owner_operation: {
    owner: SYNTH_ENTITY_CONSUMER_OWNER,
    operation: mode === "NOW" ? CONSUMER_OP_NOW : CONSUMER_OP_CLOSE,
  },
  prospective_result_id: `consumer-result:${causeId}`,
});

/** The consumer reads the committed Entity Transition Close AS-OF-NOW (or, as a second case, its named close). */
export const entityConsumerDeclaration = (
  causeId: string,
  requestId: string,
  mode: "NOW" | "CLOSE" = "NOW",
): DependencyDeclaration => {
  const source = { owner: "world_state", fact_key: transitionKeyOf(requestId) };
  return {
    stage: entityConsumerStage(causeId, mode),
    reads: [
      mode === "NOW"
        ? { mode: "AS-OF-NOW", source, invalidators: [{ fact_key: source.fact_key }] }
        : {
            mode: "AS-OF-DECLARED-CLOSE",
            source,
            close_basis: {
              ...ENTITY_TRANSITION_CLOSE_BASIS,
              producer: { ...ENTITY_TRANSITION_CLOSE_BASIS.producer },
            },
            invalidators: [{ fact_key: source.fact_key }],
          },
    ],
    produces: [entityConsumerResultKey(causeId, mode)],
    declares_close: null,
  };
};

const entityConsumerProviderOf = (mode: "NOW" | "CLOSE"): StageProvider => ({
  owner: SYNTH_ENTITY_CONSUMER_OWNER,
  facet: CONSUMER_FACET,
  operation: mode === "NOW" ? CONSUMER_OP_NOW : CONSUMER_OP_CLOSE,
  rule: SYNTH_RULE,
  compute({ reads, produces }) {
    const fact = reads[0]!.fact;
    const t = EntityTransitionCloseSchema.parse(fact.value);
    return produces.map((key) => ({
      key,
      value: {
        observed: {
          fact_key: fact.key,
          version: fact.version,
          entity_id: t.entity.entity_id,
          current_locus: t.locus.to.locus.entity_id,
          origin_locus: t.locus.from.locus.entity_id,
        },
      } as never,
      unit: null,
      basis: "ent-fixture-basis",
      secrecy: "ent-fixture-secrecy",
    }));
  },
});
export const entityConsumerNowProvider = entityConsumerProviderOf("NOW");
export const entityConsumerCloseProvider = entityConsumerProviderOf("CLOSE");

/** The consumer's own object: one earned boundary (by default the transition's own instant) and one stage. */
export const entityConsumerObject = (
  causeId: string,
  requestId: string,
  over: {
    mode?: "NOW" | "CLOSE";
    last_resolved_basis?: CanonicalTime;
    boundary_at?: CanonicalTime;
  } = {},
): TemporalObject => {
  const mode = over.mode ?? "NOW";
  const declaration = entityConsumerDeclaration(causeId, requestId, mode);
  return {
    object_id: entityConsumerObjectId(causeId, mode),
    owning_ref: {
      owner: SYNTH_ENTITY_CONSUMER_OWNER,
      process_id: declaration.stage.causal_process_id,
    },
    last_resolved_basis: over.last_resolved_basis ?? at(140),
    partition: { class: "EXACT-PARTITION" },
    next_boundary: {
      boundary_id: `boundary-entity-consumer-${mode.toLowerCase()}-${causeId}`,
      at: over.boundary_at ?? ENT_T_EFFECT,
    },
    dependencies: [declaration],
    continuation: { resume_from: "LAST_RESOLVED_BASIS", reconciliation_due: [] },
    invalidators: [{ fact_key: transitionKeyOf(requestId) }],
    information_latency: { creates_epistemic_interruption: false },
  };
};

// -- providers, publications and requests -----------------------------------------------------------------
export const entityProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([
    productionCompletionProvider,
    worldFallbackAcceptanceProvider,
    worldEntityTransitionProvider,
    entityConsumerNowProvider,
    entityConsumerCloseProvider,
  ]);

export const entPublication = (n: number) => ({
  group_id: `ent-group-${n}`,
  intent_id: `ent-intent-${n}`,
  cause: `ent-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

export { PROD_T1, prodAdvanceRequest };
export type { ResolutionRequest };

/** Toward PROD_T1, stopping once the cause's transition boundary has resolved. */
export const entStopAtBoundaryRequest = (
  id: string,
  causeId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest =>
  prodAdvanceRequest(id, PROD_T1, {
    requested: {
      target: PROD_T1,
      condition: {
        kind: "STOP_AFTER_BOUNDARY",
        object_id: entityTransitionObjectId(causeId),
        boundary_id: entityTransitionBoundaryId(causeId),
      },
    },
    ...over,
  });

export { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID };
