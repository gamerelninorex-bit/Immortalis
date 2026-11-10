import {
  CANON_WRITE_AUTHORITY,
  FACET_WORLD_INITIAL_SETUP,
  GM_INITIAL_SCOPE_HOST_ID,
  INITIAL_SETUP_FACT_KIND_IDS,
  OWNER_REFEREE_KERNEL,
  OWNER_WORLD_STATE,
  REFEREE_AUTHORITY,
  REFEREE_DECISION_BASIS,
  REFEREE_OP_INITIAL_DELEGATION,
  REFEREE_SECRECY,
  FACET_REFEREE_PROVENANCE,
  initialLocalityCompletionKey,
  initialSetupDispositionKey,
  initialSetupGrantKey,
  initialSetupInputKey,
  initialSetupInvocationKey,
  initialSetupResponseKey,
  refereeDecisionCause,
  refereeDecisionGroupId,
  refereeDecisionIntentId,
  refereeDecisionKey,
  type CommitGroup,
  type InitialLocalityCompletion,
  type InitialSetupDisposition,
  type InitialSetupFactKindId,
  type InitialSetupGrant,
  type InitialSetupInput,
  type InitialSetupInvocation,
  type InitialSetupResponse,
  type OwnerFact,
  type Pin,
  type ScopeDecisionRecord,
  type SourceRef,
} from "@immortalis/contracts";
import { INITIAL_SETUP_BASIS, INITIAL_SETUP_SECRECY, initialSetupIdentities } from "./admission.ts";
import { INITIAL_SETUP_RULES, INITIAL_SETUP_SCOPE_RULE } from "./rules.ts";
import {
  INITIAL_SETUP_INPUT_MS_V3_RULE,
  INITIAL_LOCALITY_COMPLETION_MS_V3_RULE,
} from "../ms-setup/rules.ts";
import { isMsInputRule } from "../ms-setup/prefix.ts";

/**
 * TRUSTED publication builders for the v0.9 bootstrap records: pure functions from a record value and the committed facts to the
 * exact CommitGroup the deterministic admission accepts (fixed metadata, derived identities, the read/dependency pins). They invent no
 * value; the caller supplies the record, and admission re-derives every claim in it. The group is published by role.archivist.
 */
type Facts = Pick<ReadonlyMap<string, OwnerFact>, "get">;

function pinGroup(facts: Facts, pins: readonly Pin[]): Pick<CommitGroup, "reads" | "depends_on"> {
  const byKey = new Map(pins.map((p) => [p.fact_key, p]));
  const reads: CommitGroup["reads"] = [];
  const depends = new Set<string>();
  for (const p of byKey.values()) {
    const f = facts.get(p.fact_key);
    // an absent fact yields an incomplete group; admission refuses it with PREREQUISITE_MISSING (never papered over here)
    reads.push({ key: p.fact_key, version: f?.version ?? p.version });
    if (f) depends.add(f.provenance.group_id);
  }
  reads.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { reads, depends_on: [...depends].sort() };
}

function setupGroup(
  campaignId: string,
  kind: InitialSetupFactKindId,
  key: string,
  value: unknown,
  facts: Facts,
  pins: readonly Pin[],
  governingRule?: SourceRef,
): CommitGroup {
  const ids = initialSetupIdentities(key);
  return {
    campaign_id: campaignId,
    ...ids,
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_INITIAL_SETUP,
    rule: governingRule ?? (INITIAL_SETUP_RULES[kind] as SourceRef),
    authority: { ...CANON_WRITE_AUTHORITY },
    ...pinGroup(facts, pins),
    writes: [
      {
        key,
        owner: OWNER_WORLD_STATE,
        facet: FACET_WORLD_INITIAL_SETUP,
        value: value as CommitGroup["writes"][number]["value"],
        unit: null,
        basis: INITIAL_SETUP_BASIS,
        secrecy: INITIAL_SETUP_SECRECY,
        expected_version: 0,
      },
    ],
  };
}

const pinFor = (facts: Facts, key: string): Pin => ({
  fact_key: key,
  version: facts.get(key)?.version ?? 1,
});

export const buildInputGroup = (
  campaignId: string,
  facts: Facts,
  input: InitialSetupInput,
  route?: "MS",
) =>
  setupGroup(
    campaignId,
    "initial_setup_input",
    initialSetupInputKey(input.world_id, input.locus_id, input.setup_id),
    input,
    facts,
    input.genesis,
    route === "MS" ? INITIAL_SETUP_INPUT_MS_V3_RULE : undefined,
  );

export const buildInvocationGroup = (
  campaignId: string,
  facts: Facts,
  inv: InitialSetupInvocation,
) =>
  setupGroup(
    campaignId,
    "initial_setup_invocation",
    initialSetupInvocationKey(inv.world_id, inv.locus_id, inv.phase, inv.setup_id),
    inv,
    facts,
    inv.grant ? [inv.input, inv.grant] : [inv.input],
  );

export const buildResponseGroup = (campaignId: string, facts: Facts, resp: InitialSetupResponse) =>
  setupGroup(
    campaignId,
    "initial_setup_response",
    initialSetupResponseKey(resp.world_id, resp.locus_id, resp.setup_id, resp.phase),
    resp,
    facts,
    [
      resp.reservation,
      pinFor(facts, initialSetupInputKey(resp.world_id, resp.locus_id, resp.setup_id)),
    ],
  );

export const buildGrantGroup = (campaignId: string, facts: Facts, grant: InitialSetupGrant) =>
  setupGroup(
    campaignId,
    "initial_setup_grant",
    initialSetupGrantKey(grant.world_id, grant.locus_id, grant.setup_id),
    grant,
    facts,
    [grant.input, grant.classification, grant.scope_response],
  );

export const buildCompletionGroup = (
  campaignId: string,
  facts: Facts,
  c: InitialLocalityCompletion,
) =>
  setupGroup(
    campaignId,
    "initial_locality_completion",
    initialLocalityCompletionKey(c.world_id, c.locus_id),
    c,
    facts,
    [c.input, c.grant, c.scene_response],
    facts.get(c.input.fact_key) && isMsInputRule(facts.get(c.input.fact_key)!.provenance.rule)
      ? INITIAL_LOCALITY_COMPLETION_MS_V3_RULE
      : undefined,
  );

export const buildDispositionGroup = (
  campaignId: string,
  facts: Facts,
  d: InitialSetupDisposition,
) =>
  setupGroup(
    campaignId,
    "initial_setup_disposition",
    initialSetupDispositionKey(d.world_id, d.locus_id, d.setup_id),
    d,
    facts,
    d.response ? [d.input, d.response] : [d.input],
  );

/** The world-subject Referee classification group, published by the trusted service from the signed canonical Response. */
export function buildScopeDecisionGroup(
  campaignId: string,
  facts: Facts,
  record: ScopeDecisionRecord,
): CommitGroup {
  return {
    campaign_id: campaignId,
    group_id: refereeDecisionGroupId(record.task_id),
    intent_id: refereeDecisionIntentId(record.task_id),
    owner: OWNER_REFEREE_KERNEL,
    facet: FACET_REFEREE_PROVENANCE,
    cause: refereeDecisionCause(record.task_id),
    rule: INITIAL_SETUP_SCOPE_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    ...pinGroup(facts, [record.input.setup_input, record.input.reservation, record.input.response]),
    writes: [
      {
        key: refereeDecisionKey(record.task_id),
        owner: OWNER_REFEREE_KERNEL,
        facet: FACET_REFEREE_PROVENANCE,
        value: record as unknown as CommitGroup["writes"][number]["value"],
        unit: null,
        basis: REFEREE_DECISION_BASIS,
        secrecy: REFEREE_SECRECY,
        expected_version: 0,
      },
    ],
  };
}

/** Builds the record the trusted Referee service writes; the engine derives the verdict, the host never supplies it. */
export function scopeDecisionRecord(args: {
  readonly campaign_id: string;
  readonly task_id: string;
  readonly world_id: string;
  readonly locus_id: string;
  readonly input_hash: string;
  readonly setup_input: Pin;
  readonly reservation: Pin;
  readonly response: Pin;
  readonly decision: ScopeDecisionRecord["decision"];
  readonly verdict: ScopeDecisionRecord["verdict"];
  readonly claimed_model: string | null;
}): ScopeDecisionRecord {
  return {
    record_version: 1,
    operation: REFEREE_OP_INITIAL_DELEGATION,
    task_id: args.task_id,
    campaign_id: args.campaign_id,
    attempt: 0,
    authority: { ...REFEREE_AUTHORITY },
    host: { host_id: GM_INITIAL_SCOPE_HOST_ID, claimed_model: args.claimed_model },
    subject: { world_id: args.world_id, locus_id: args.locus_id },
    input: {
      digest: args.input_hash,
      setup_input: args.setup_input,
      reservation: args.reservation,
      response: args.response,
    },
    decision: args.decision,
    verdict: args.verdict,
  };
}

export const SETUP_RECORD_KIND_IDS = INITIAL_SETUP_FACT_KIND_IDS;
