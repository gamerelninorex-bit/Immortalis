import {
  CANON_WRITE_AUTHORITY,
  type CommitGroup,
  type CultureEvidenceReading,
  type CultureInput,
  type CultureUpdateContext,
  type DependencyDeclaration,
  type ResolutionRequest,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  cultureConventionCloseProvider,
  cultureConventionDeclaration,
  cultureSharedMeaningNowRead,
  cultureUpdateId,
  type StageOwnerExtension,
  type StageProvider,
  type WriteAdmission,
} from "@immortalis/engine";
import { SYNTH_RULE, T0, T1, TB } from "./temporal-fixtures.ts";

/**
 * SYNTHETIC TEST DATA for the Culture & Society Established Shared Meaning / Norm Result-Close Backbone Foundation. Every
 * owner, key, identifier, coordinate and value below is a fixture, not IMMORTALIS canon: it carries no game semantics and no
 * calibration — in particular no prevalence, percentage, count, score, adoption, belief or threshold exists here. The Culture
 * owner is NOT synthetic and lives in @immortalis/engine; what is synthetic are the OTHER parties of the proof:
 *
 *  - a test-owned SOCIAL EVIDENCE SOURCE: the explicitly synthetic stand-in for a lawful, causally engaged owner of social
 *    evidence. THIS SLICE REGISTERS NO LIVE PRODUCER of such evidence and does not claim one exists: the fixture merely commits,
 *    through the existing extension seam, facts shaped as the Culture-defined evidence reading, and also facts that are NOT
 *    (contact, policy, packet-refusal and receipt look-alikes) so refusals can be proven;
 *  - a test CULTURE RESULT CONSUMER, a dependent consequence that materially requires the shared meaning/norm and reads it
 *    AS-OF-NOW after the Communicative Convention Close. It is no Economy/GIP/Actor/ASR implementation: it records exactly
 *    the fact it read and decides nothing.
 *
 * Both are registered through an extension that cannot write a canonical, kernel, Population, Production, Economy,
 * World-State, Logistics, Named-Actor, Epistemic, KTI, Culture, GIP or Diplomacy key space. Production code must never import
 * this package.
 */
export const SYNTH_SOCIAL_EVIDENCE_OWNER = "SYNTHETIC-SOCIAL-EVIDENCE-SOURCE";
const EVIDENCE_FACET = "synthetic-social-evidence";
const EVIDENCE_PREFIX = "synthetic-social-evidence/";
export const SYNTH_CULTURE_CONSUMER_OWNER = "SYNTHETIC-CULTURE-RESULT-CONSUMER";
const CONSUMER_FACET = "synthetic-culture-result-consumer";
const CONSUMER_PREFIX = "synthetic-culture-result-consumer/";
export const SYNTH_OP_CONSUME_CULTURE_RESULT = "synthetic-culture-consume-result";

const prefixAdmission =
  (owner: string, prefix: string, createOnly: boolean): WriteAdmission["check"] =>
  (group) => {
    if (group.owner !== owner) return null;
    for (const w of group.writes) {
      if (!w.key.startsWith(prefix)) {
        return {
          code: "KEY_NOT_ADMITTED",
          message: "not this synthetic owner's key",
          details: { key: w.key },
        };
      }
      if (createOnly && w.expected_version !== 0) {
        return {
          code: "AMENDMENT_NOT_SUPPORTED",
          message: "the synthetic evidence source is create-only",
          details: { key: w.key },
        };
      }
    }
    return null;
  };

const evidenceCheck = prefixAdmission(SYNTH_SOCIAL_EVIDENCE_OWNER, EVIDENCE_PREFIX, true);
const consumerCheck = prefixAdmission(SYNTH_CULTURE_CONSUMER_OWNER, CONSUMER_PREFIX, false);

export const CULTURE_FIXTURE_EXTENSION: StageOwnerExtension = {
  owners: new Map([
    [SYNTH_SOCIAL_EVIDENCE_OWNER, new Set([EVIDENCE_FACET])],
    [SYNTH_CULTURE_CONSUMER_OWNER, new Set([CONSUMER_FACET])],
  ]),
  admission: {
    check(group, state) {
      return evidenceCheck(group, state) ?? consumerCheck(group, state);
    },
  },
};

// -- identities and coordinates (test coordinates only) -------------------------------------------------------

export const CULTURE_CONTEXT_MARKET = "culture-context-market-day";
export const CULTURE_CONTEXT_OTHER = "culture-context-harvest";
export const MANIFESTATION_A = "manifestation-a";
export const MANIFESTATION_B = "manifestation-b";

export const socialEvidenceKey = (id: string): string => `${EVIDENCE_PREFIX}${id}`;
export const cultureConsumerResultKey = (id: string): string => `${CONSUMER_PREFIX}result/${id}`;

export const culturePublication = (n: number) => ({
  group_id: `culture-group-${n}`,
  intent_id: `culture-intent-${n}`,
  cause: `culture-cause-${n}`,
  basis: "culture-fixture-basis",
});

/**
 * A committed fact of the synthetic social-evidence source. `value` is whatever the fixture says: a well-formed evidence
 * reading, or a look-alike that is not one. Create-only (the source's own admission).
 */
export function socialEvidenceGroup(
  campaignId: string,
  n: number,
  id: string,
  value: unknown,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: `social-evidence-group-${n}`,
    intent_id: `social-evidence-intent-${n}`,
    owner: SYNTH_SOCIAL_EVIDENCE_OWNER,
    facet: EVIDENCE_FACET,
    cause: `social-evidence-cause-${n}`,
    rule: SYNTH_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key: socialEvidenceKey(id),
        owner: SYNTH_SOCIAL_EVIDENCE_OWNER,
        facet: EVIDENCE_FACET,
        value: value as never,
        unit: null,
        basis: "culture-evidence-fixture-basis",
        secrecy: "culture-evidence-fixture-secrecy",
        expected_version: 0,
      },
    ],
  };
}

/** A well-formed evidence reading: a CONTINUING shared recognition of `manifestation` for this referent, scope and context. */
export const evidenceReading = (
  referentKey: string,
  scopeKey: string,
  context = CULTURE_CONTEXT_MARKET,
  manifestation = MANIFESTATION_A,
  over: Partial<CultureEvidenceReading> = {},
): CultureEvidenceReading => ({
  referent: referentKey,
  scope: scopeKey,
  context,
  manifestation,
  recognition: "CONTINUING_SHARED_RECOGNITION",
  ...over,
});

/** One engaged input: the fact of the synthetic source, pinned at the version it was committed, read AS-OF-NOW. */
export const evidenceInput = (id: string, over: Partial<CultureInput> = {}): CultureInput => ({
  owner: SYNTH_SOCIAL_EVIDENCE_OWNER,
  fact_key: socialEvidenceKey(id),
  version: 1,
  read: { basis: "AS-OF-NOW" },
  ...over,
});

/**
 * A well-formed sealed Social Update Context for one referent, scope and context. The identity is derived exactly as the
 * owner derives it; the pins are the versions the facts were committed at.
 */
export function cultureContext(
  referentKey: string,
  scopeKey: string,
  inputs: readonly CultureInput[],
  over: Partial<CultureUpdateContext> & { readonly contextName?: string } = {},
): CultureUpdateContext {
  const { contextName, ...rest } = over;
  const context = contextName ?? rest.context ?? CULTURE_CONTEXT_MARKET;
  return {
    update_id: cultureUpdateId(referentKey, scopeKey, context),
    admission: {
      independent_causal_inertia: true,
      not_faithfully_reconstructable: true,
      may_alter_later_answer: true,
    },
    referent: { fact_key: referentKey, version: 1 },
    scope: { fact_key: scopeKey, version: 1 },
    context,
    inputs: inputs.map((i) => structuredClone(i)),
    ...rest,
  };
}

// -- the consumer: a dependent consequence that materially requires the shared meaning/norm -------------------

export const cultureConsumerStage = (consumerId: string) =>
  ({
    causal_process_id: `culture-result-consumer/${consumerId}`,
    owner_operation: {
      owner: SYNTH_CULTURE_CONSUMER_OWNER,
      operation: SYNTH_OP_CONSUME_CULTURE_RESULT,
    },
    prospective_result_id: cultureConsumerResultKey(consumerId),
  }) as const;

/** The consumer reads the fact AS-OF-NOW after the Communicative Convention Close: the form ECUL-01 / GCUL-01 / CUL-AF take. */
export const cultureConsumerDeclaration = (
  consumerId: string,
  updateId: string,
): DependencyDeclaration => ({
  stage: cultureConsumerStage(consumerId),
  reads: [cultureSharedMeaningNowRead(updateId)],
  produces: [cultureConsumerResultKey(consumerId)],
  declares_close: null,
});

const out = (key: string, value: unknown) => ({
  key,
  value: value as never,
  unit: null,
  basis: "culture-fixture-basis",
  secrecy: "culture-fixture-secrecy",
});

/** Records exactly the fact the consumer read, and the group that committed it. It decides and infers nothing. */
export const cultureConsumerProvider: StageProvider = {
  owner: SYNTH_CULTURE_CONSUMER_OWNER,
  facet: CONSUMER_FACET,
  operation: SYNTH_OP_CONSUME_CULTURE_RESULT,
  rule: SYNTH_RULE,
  compute({ reads, produces }) {
    const fact = reads[0]!.fact;
    return produces.map((key) =>
      out(key, { observed_meaning: fact.value, observed_close_group: fact.provenance.group_id }),
    );
  },
};

export const cultureProviders = (): StageProviderRegistry =>
  new StageProviderRegistry([cultureConventionCloseProvider, cultureConsumerProvider]);

const common = {
  partition: { class: "EXACT-PARTITION" as const },
  continuation: { resume_from: "LAST_RESOLVED_BASIS" as const, reconciliation_due: [] as [] },
  information_latency: { creates_epistemic_interruption: false as const },
};

export const cultureConsumerObjectId = (consumerId: string): string =>
  `culture-consumer-obj-${consumerId}`;
export const cultureConsumerBoundaryId = (consumerId: string): string =>
  `culture-consumer-boundary-${consumerId}`;

/**
 * The engaged object of one dependent consequence that materially requires the shared meaning/norm: ONE earned boundary (a
 * test coordinate), the Culture owner's Communicative Convention Close declared ahead of it, and the consumer stage that
 * reads the fact AS-OF-NOW after the close. The sealed context and the evidence are already committed.
 */
export function cultureConsumerObject(
  consumerId: string,
  context: CultureUpdateContext,
  over: Partial<TemporalObject> = {},
): TemporalObject {
  return {
    object_id: cultureConsumerObjectId(consumerId),
    owning_ref: {
      owner: SYNTH_CULTURE_CONSUMER_OWNER,
      process_id: `culture-result-consumer/${consumerId}`,
    },
    last_resolved_basis: T0,
    next_boundary: { boundary_id: cultureConsumerBoundaryId(consumerId), at: TB },
    dependencies: [
      cultureConventionDeclaration(context)!,
      cultureConsumerDeclaration(consumerId, context.update_id),
    ],
    invalidators: [],
    ...common,
    ...over,
  };
}

/** Toward T1, stopping once the consumer's earned boundary has resolved. */
export const cultureAdvanceRequest = (
  id: string,
  consumerId: string,
  over: Partial<ResolutionRequest> = {},
): ResolutionRequest => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
  continues: null,
  requested: {
    target: T1,
    condition: {
      kind: "STOP_AFTER_BOUNDARY",
      object_id: cultureConsumerObjectId(consumerId),
      boundary_id: cultureConsumerBoundaryId(consumerId),
    },
  },
  context: { role: "role.player", permission: "permission.player_choice.commit" },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});
