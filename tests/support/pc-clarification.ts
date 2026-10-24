/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and forge raw groups */
// TEST SUPPORT for the R-5 prospective collection clarification (NEWLY AUTHORIZED; BLUE repair handoff v1). The starting shape is the one
// the live campaign was in: an already released and bound ordinary character whose accepted claims say the hands can gather material but
// state NO duration for one handling cycle. The referee's classification is retained through the engine's own adapter, answered by the
// scripted policy (PLUMBING ONLY: it proves what the engine enforces and nothing about whether an AI understood any sentence).
import {
  CANON_WRITE_AUTHORITY,
  PC_CLARIFICATION_BRANCH,
  PC_CLARIFICATION_QUESTION,
  PLAYER_CHARACTER_BINDING_KEY,
  REFEREE_AUTHORITY,
  TEMPORAL_STATE_KEY,
  pcExistenceContractKey,
  pcIntrinsicClarificationKey,
  type CommitGroup,
  type I002ClarificationContext,
} from "@immortalis/contracts";
import {
  PC_INTRINSIC_CLARIFICATION_RULE,
  PcCollectionAdapter,
  RefereeAdjudicationAdapter,
  clarificationCandidateItems,
  pcClarificationIdOf,
  type CampaignStore,
} from "@immortalis/engine";
import { scriptedPolicy, type ClarifyRule, type ClassifyRule } from "./original-pc.ts";
import { ACTUATOR_WORDS, MECH, PC, T0, TRAVERSAL_CANNOT, colPublication } from "./pc-collection.ts";

export const BODY = "One ordinary human body";
/** the accepted embodiment claim of the starting shape: hands that gather and carry, and NO duration */
export const NO_CYCLE_CLAIM = `${BODY}; ${ACTUATOR_WORDS}; ${TRAVERSAL_CANNOT}`;
export const CLAR_TAU = 9;
/** the player's own words: the number is the player's, never a default */
export const clarWords = (n = CLAR_TAU, unit = T0.unit): string =>
  `It takes me ${n} ${unit} to lift and carry one handful`;

export const mechanismInput = (clarificationId: string, over: Record<string, unknown> = {}) => ({
  pc_id: PC,
  mechanism_id: MECH,
  claims: [{ section: "embodiment_topology", index: 0 }],
  clarified: [{ clarification_id: clarificationId, index: 0 }],
  actuator: { statement: ACTUATOR_WORDS },
  traversal: { statement: TRAVERSAL_CANNOT },
  cycle_duration: { unit: T0.unit, value: CLAR_TAU },
  cycle_quote: clarWords(),
  ...over,
});

/** What a faithful host reads from the delivered cycle task for a mechanism that follows the clarification (quoted, plumbing only). */
export const clarifiedCycleAnswer = (task: any, over: Record<string, unknown> = {}) => ({
  task_digest: task.digest,
  reading: "ONE_SAME_FORM_UNIT_ONE_SERIAL_CYCLE",
  actuator_ground: task.actuator,
  cycle_ground: clarWords(),
  grounds: [task.actuator],
  ...over,
});

/**
 * Retains an I-002 classification of exactly `statements` through the engine's adapter, answered by the scripted policy; the result
 * carries the decision record's key. `classify` marks words the scripted host treats as NOT the player's own.
 */
export async function retain(
  campaign: { readonly store: CampaignStore },
  statements: readonly string[],
  classify: readonly ClassifyRule[] = [],
  attempt = 0,
  pcId = PC,
  opt: { clarify?: ClarifyRule; unscoped?: boolean; scope?: I002ClarificationContext } = {},
) {
  const adapter = new RefereeAdjudicationAdapter(campaign.store);
  const items = clarificationCandidateItems(statements);
  // BLUE H-1: the host is delivered the owner-derived scope (baseline, branch, prior closures); `unscoped` is the legacy form
  const clarification = opt.unscoped
    ? undefined
    : (opt.scope ?? new PcCollectionAdapter(campaign.store).clarificationScope(pcId));
  const { context, task_id } = adapter.i002Task({ pc_id: pcId, attempt, items, clarification });
  const answer = scriptedPolicy({ classify, ...(opt.clarify ? { clarify: opt.clarify } : {}) })({
    operation: "I002_CLASSIFY",
    task_id,
    context,
  });
  return adapter.recordI002({
    operation: { ...REFEREE_AUTHORITY },
    host: { host_id: "engine-direct-test", claimed_model: null },
    pc_id: pcId,
    attempt,
    items,
    clarification,
    answer,
  });
}

/** The lawful clarification group, built exactly as the adapter builds it, for a test to alter before committing it raw. */
export function clarificationGroup(
  campaign: { readonly store: CampaignStore },
  statements: readonly string[],
  refereeKey: string,
  n = 7000,
  over: { value?: (v: any) => void; group?: Partial<CommitGroup> } = {},
): CommitGroup {
  const store = campaign.store;
  const p = colPublication(n);
  const contract = store.getFact(pcExistenceContractKey(PC))!;
  const binding = store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
  const referee = store.getFact(refereeKey)!;
  const state = store.getFact(TEMPORAL_STATE_KEY)!;
  const id = pcClarificationIdOf(PC);
  const value: any = {
    clarification_id: id,
    pc_id: PC,
    invocation: {
      branch: PC_CLARIFICATION_BRANCH,
      question: PC_CLARIFICATION_QUESTION,
    },
    contract: { fact_key: contract.key, version: contract.version },
    binding: { fact_key: binding.key, version: binding.version },
    referee: { fact_key: referee.key, version: referee.version },
    claims: statements.map((statement) => ({ statement, provenance: "PLAYER-AUTHORED" })),
    interpreted_by: { role: "role.gm", permission: "permission.rule.adjudicate" },
    accepted_by: { role: "role.archivist", permission: "permission.canon.write" },
    effective_from: (state.value as any).canonical_time,
    committer: { owner: "pc_existence", facet: "pc_intrinsic_clarification" },
  };
  over.value?.(value);
  const reads = [contract, binding, state, referee];
  return {
    campaign_id: store.head().campaign_id,
    group_id: p.group_id,
    intent_id: p.intent_id,
    owner: "pc_existence",
    facet: "pc_intrinsic_clarification",
    cause: p.cause,
    rule: PC_INTRINSIC_CLARIFICATION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: reads.map((f) => ({ key: f.key, version: f.version })),
    depends_on: [...new Set(reads.map((f) => f.provenance.group_id))],
    writes: [
      {
        key: pcIntrinsicClarificationKey(PC, id),
        owner: "pc_existence",
        facet: "pc_intrinsic_clarification",
        value,
        unit: null,
        basis: p.basis,
        secrecy: p.secrecy,
        expected_version: 0,
      },
    ],
    ...over.group,
  } as CommitGroup;
}
