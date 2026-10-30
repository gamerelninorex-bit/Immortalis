/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and forge raw groups */
// TEST SUPPORT for the H1 DELEGATED selection of the collection cycle (I-002 section 9 Delegation Commit Record; BLUE same-PR repair
// authorization). The starting shape is the one R-5 uses: an already released and bound ordinary character whose accepted claims say the
// hands gather material and state NO duration. The host's selection is the scripted answer below (PLUMBING ONLY: it proves what the
// engine enforces and nothing about whether an AI chose or understood anything).
import {
  BUILD_SPEC_IDENTITY,
  CANON_WRITE_AUTHORITY,
  PC_CLARIFICATION_BRANCH,
  PC_DELEGATION_METHOD_CLASS,
  PC_DELEGATION_METHOD_VERSION,
  PC_DELEGATION_QUESTION,
  PC_DELEGATION_SPACE_KIND,
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_STATE_KEY,
  pcDelegatedClarificationKey,
  pcExistenceContractKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  PC_DELEGATED_CLARIFICATION_RULE,
  pcDelegationBaselineDigest,
  pcDelegationIdOf,
  pcDelegationSeal,
  type CampaignStore,
  type PcCollectionAdapter,
} from "@immortalis/engine";
import { ACTUATOR_WORDS, PC, T0, colPublication } from "./pc-collection.ts";

export const DELEGATION_ID = pcDelegationIdOf(PC);
export const DELEGATION_KEY = pcDelegatedClarificationKey(PC, DELEGATION_ID);
/** the value the scripted host selects, inside the committed bounds */
export const SELECTED = 7;
export const SHORTEST = 4;
export const LONGEST = 12;
export const selectedStatement = (n = SELECTED, unit = T0.unit): string =>
  `Handling one handful of loose material takes this body ${n} ${unit}`;

/** the scope the player commits: NUMERIC limits only (the whole of the constraint class an owner can verify) in the campaign's unit */
export const delegationScope = (over: Record<string, unknown> = {}) => ({
  branch: PC_CLARIFICATION_BRANCH,
  candidate_space: {
    kind: PC_DELEGATION_SPACE_KIND,
    unit: T0.unit,
    shortest: SHORTEST,
    longest: LONGEST,
  },
  ...over,
});

/** a delegation with no player limit at all: the shortest positive duration and no upper limit (a seed that leaves the detail to the GM) */
export const unboundedScope = () =>
  delegationScope({
    candidate_space: {
      kind: PC_DELEGATION_SPACE_KIND,
      unit: T0.unit,
      shortest: 1,
      longest: null,
    },
  });

/** a faithful scripted host selection for the delivered task; `over` alters the answer to form a falsifier */
export const selectionAnswer = (task: any, over: Record<string, unknown> = {}) => ({
  task_digest: task.digest,
  branch: "UNRESOLVED_BEFORE",
  scope: "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE",
  baseline_ground: ACTUATOR_WORDS,
  selection: {
    value: SELECTED,
    statement: selectedStatement(),
    statement_ground: selectedStatement(),
  },
  ...over,
});

export const delegateInput = (
  collect: PcCollectionAdapter,
  n: number,
  over: { scope?: unknown; answer?: (task: any) => unknown; pc?: string } = {},
) => {
  const scope = over.scope ?? delegationScope();
  const task = collect.delegationTask(over.pc ?? PC, scope) as any;
  return {
    ...colPublication(n),
    pc_id: over.pc ?? PC,
    scope,
    answer: over.answer ? over.answer(task) : selectionAnswer(task),
  };
};

export const mechanismFromDelegation = (over: Record<string, unknown> = {}) => ({
  pc_id: PC,
  mechanism_id: "mech-hands-1",
  claims: [{ section: "embodiment_topology", index: 0 }],
  clarified: [{ clarification_id: DELEGATION_ID, index: 0 }],
  actuator: { statement: ACTUATOR_WORDS },
  traversal: { statement: "these hands cannot pass a sealed barrier" },
  cycle_duration: { unit: T0.unit, value: SELECTED },
  cycle_quote: selectedStatement(),
  ...over,
});

/** What a faithful host reads from the delivered cycle task for a mechanism that follows the delegation (quoted, plumbing only). */
export const delegatedCycleAnswer = (task: any, over: Record<string, unknown> = {}) => ({
  task_digest: task.digest,
  reading: "ONE_SAME_FORM_UNIT_ONE_SERIAL_CYCLE",
  actuator_ground: task.actuator,
  cycle_ground: selectedStatement(),
  grounds: [task.actuator],
  ...over,
});

/**
 * The lawful Delegation Commit Record group, built exactly as the adapter builds it, for a test to alter before committing it raw.
 * `over.value` may break the record; `reseal` recomputes the content seal after an alteration, so a test can isolate one defect.
 */
export function delegationGroup(
  campaign: { readonly store: CampaignStore },
  collect: PcCollectionAdapter,
  n = 7500,
  over: {
    value?: (v: any) => void;
    group?: Partial<CommitGroup>;
    reseal?: boolean;
    scope?: unknown;
  } = {},
): CommitGroup {
  const store = campaign.store;
  const p = colPublication(n);
  const contract = store.getFact(pcExistenceContractKey(PC))!;
  const binding = store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
  const state = store.getFact(TEMPORAL_STATE_KEY)!;
  const scope = (over.scope ?? delegationScope()) as any;
  const task = collect.delegationTask(PC, scope) as any;
  const generation_basis = {
    baseline_digest: pcDelegationBaselineDigest(task.baseline),
    task_digest: task.digest,
  };
  const sealed: any = {
    claims: [{ statement: selectedStatement(), provenance: "PLAYER-DELEGATED" }],
    duration: { unit: T0.unit, value: SELECTED },
    reading: {
      branch: "UNRESOLVED_BEFORE",
      scope: "ONLY_THE_DURATION_OF_THE_EXISTING_ACTUATOR_CYCLE",
      baseline_ground: ACTUATOR_WORDS,
      statement_ground: selectedStatement(),
    },
  };
  const value: any = {
    delegation_id: DELEGATION_ID,
    pc_id: PC,
    invocation: { branch: PC_CLARIFICATION_BRANCH, question: PC_DELEGATION_QUESTION },
    contract: { fact_key: contract.key, version: contract.version },
    binding: { fact_key: binding.key, version: binding.version },
    scope,
    generation_basis,
    method: { class: PC_DELEGATION_METHOD_CLASS, version: PC_DELEGATION_METHOD_VERSION },
    executing_role: { role: "role.gm", permission: "permission.rule.adjudicate" },
    draw: null,
    sealed: { ...sealed, seal: "" },
    validation: { result: "WITHIN_COMMITTED_SCOPE", derived_by: "pc_existence" },
    accepted_by: { role: "role.archivist", permission: "permission.canon.write" },
    effective_from: (state.value as any).canonical_time,
    governing_package: {},
    committer: { owner: "pc_existence", facet: "pc_intrinsic_clarification" },
  };
  value.governing_package = {
    line: BUILD_SPEC_IDENTITY.line,
    package_version: BUILD_SPEC_IDENTITY.package_version,
    package_native_pin: BUILD_SPEC_IDENTITY.package_native_pin,
  };
  value.sealed.seal = pcDelegationSeal({ pc_id: PC, scope, generation_basis, sealed });
  over.value?.(value);
  if (over.reseal)
    value.sealed.seal = pcDelegationSeal({
      pc_id: value.pc_id,
      scope: value.scope,
      generation_basis: value.generation_basis,
      sealed: value.sealed,
    });
  const reads = [contract, binding, state];
  return {
    campaign_id: store.head().campaign_id,
    group_id: p.group_id,
    intent_id: p.intent_id,
    owner: "pc_existence",
    facet: "pc_intrinsic_clarification",
    cause: p.cause,
    rule: PC_DELEGATED_CLARIFICATION_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: reads.map((f) => ({ key: f.key, version: f.version })),
    depends_on: [...new Set(reads.map((f) => f.provenance.group_id))],
    writes: [
      {
        key: pcDelegatedClarificationKey(PC, DELEGATION_ID),
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
