import {
  CANON_WRITE_AUTHORITY,
  InitialLocalityCompletionSchema,
  InitialActorSetupIssueSchema,
  InitialActorSetupResponseSchema,
  NamedActorExistenceBasisSchema,
  initialLocalityCompletionKey,
  msActorIssueKey,
  msActorResponseKey,
  namedActorExistenceBasisKey,
  type CommitGroup,
  type Pin,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { reject, type Rejection } from "../owners/rejection.ts";
import {
  planMsActor,
  deriveMsExistence,
  msResponseViolation,
  qualifiedMsResponse,
} from "./protocol.ts";
import { msCompletionInput, msPrefixViolation, isMsCompletionRule } from "./prefix.ts";

export const msIdentities = (key: string) => ({
  group_id: "ms-initial-actor:group:v1:" + key,
  intent_id: "ms-initial-actor:intent:v1:" + key,
  cause: "ms-initial-actor:cause:v1:" + key,
});
export const msReject = (reason: string): Rejection =>
  reject("REFERENCE_INVALID", reason, { reason });
export function msPinViolation(
  group: CommitGroup,
  state: CampaignState,
  pins: readonly Pin[],
): Rejection | null {
  const unique = new Map<string, number>();
  for (const p of pins) {
    if (unique.has(p.fact_key) && unique.get(p.fact_key) !== p.version)
      return msReject("MS_CONFLICTING_PIN");
    unique.set(p.fact_key, p.version);
    if (state.facts.get(p.fact_key)?.version !== p.version) return msReject("MS_SOURCE_PIN");
  }
  const reads = [...unique]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, version]) => ({ key, version }));
  const deps = [
    ...new Set([...unique.keys()].map((k) => state.facts.get(k)!.provenance.group_id)),
  ].sort();
  return canonicalEqual(group.reads, reads) && canonicalEqual([...group.depends_on].sort(), deps)
    ? null
    : msReject("MS_EXACT_READS");
}
export function reachablePins(value: unknown): Pin[] {
  const out: Pin[] = [];
  const visit = (v: unknown): void => {
    if (!v || typeof v !== "object") return;
    const p = v as Record<string, unknown>;
    if (typeof p["fact_key"] === "string" && typeof p["version"] === "number")
      out.push({ fact_key: p["fact_key"], version: p["version"] });
    if (Array.isArray(v)) v.forEach(visit);
    else Object.values(p).forEach(visit);
  };
  visit(value);
  return out;
}
export function msChain(state: CampaignState) {
  const found = [...state.facts.values()].filter(
    (f) => resolveKey(f.key)?.kind.id === "initial_locality_completion",
  );
  if (found.length !== 1) return null;
  const cf = found[0]!,
    c = InitialLocalityCompletionSchema.safeParse(cf.value);
  if (
    !c.success ||
    !isMsCompletionRule(cf.provenance.rule) ||
    cf.key !== initialLocalityCompletionKey(c.data.world_id, c.data.locus_id) ||
    cf.version !== 1
  )
    return null;
  const input = msCompletionInput(state.facts, c.data);
  if (!input) return null;
  const i = state.facts.get(c.data.input.fact_key)!,
    g = state.facts.get(c.data.grant.fact_key);
  if (!g || g.version !== c.data.grant.version) return null;
  return { cf, c: c.data, input, i, g };
}

/** New owners' deterministic admission, independently called by strict historical replay. */
export function msActorGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const w = group.writes[0],
    k = w && resolveKey(w.key)?.kind;
  if (
    !k ||
    ![
      "initial_actor_setup_issue",
      "initial_actor_setup_response",
      "named_actor_existence_basis",
    ].includes(k.id)
  )
    return null;
  if (
    group.writes.length !== 1 ||
    w!.expected_version !== 0 ||
    !canonicalEqual(group.rule, k.rule) ||
    group.owner !== k.owner ||
    group.facet !== k.facet ||
    !canonicalEqual(group.authority, CANON_WRITE_AUTHORITY) ||
    !canonicalEqual(
      { group_id: group.group_id, intent_id: group.intent_id, cause: group.cause },
      msIdentities(w!.key),
    ) ||
    w!.basis !== "ms-initial-actor-v1" ||
    w!.secrecy !== "engine-internal" ||
    w!.unit !== null
  )
    return msReject("MS_METADATA");
  const chain = msChain(state);
  if (!chain) return msReject("MS_SOURCE_CHAIN");
  const { cf, c, input, i, g } = chain;
  const prefix = msPrefixViolation(state.facts, input);
  if (prefix) return msReject(prefix);
  const plan = planMsActor(state, cf.key, c);
  if (!plan.ok) return msReject(plan.error.code);
  const qkey = msActorIssueKey(c.world_id, c.locus_id, plan.value.issue.completion_digest);
  const rkey = msActorResponseKey(c.world_id, c.locus_id, plan.value.issue.completion_digest);
  const qf = state.facts.get(qkey),
    rf = state.facts.get(rkey);
  if (k.id === "initial_actor_setup_issue") {
    const parsed = InitialActorSetupIssueSchema.safeParse(w!.value);
    if (!parsed.success || w!.key !== qkey || !canonicalEqual(parsed.data, plan.value.issue))
      return msReject("MS_ISSUE_REBUILD");
    return msPinViolation(group, state, [...reachablePins(parsed.data), ...input.genesis]);
  }
  if (!qf || !canonicalEqual(qf.value, plan.value.issue)) return msReject("MS_ISSUE_SOURCE");
  if (k.id === "initial_actor_setup_response") {
    const p = InitialActorSetupResponseSchema.safeParse(w!.value);
    if (!p.success || w!.key !== rkey) return msReject("MS_RESPONSE_SCHEMA");
    const bad = msResponseViolation(p.data, qf, state.campaign_id);
    return bad ? msReject(bad) : msPinViolation(group, state, reachablePins(p.data));
  }
  if (!rf) return msReject("MS_RESPONSE_MISSING");
  const response = InitialActorSetupResponseSchema.safeParse(rf.value);
  if (!response.success || !qualifiedMsResponse(response.data, qf, state.campaign_id))
    return msReject("MS_RESPONSE_NON_QUALIFYING");
  const expected = deriveMsExistence(i, g, cf, qf, rf);
  const parsed = NamedActorExistenceBasisSchema.safeParse(w!.value);
  if (
    !parsed.success ||
    w!.key !== namedActorExistenceBasisKey(expected.actor_id) ||
    !canonicalEqual(parsed.data, expected)
  )
    return msReject("MS_EXISTENCE_REBUILD");
  const boundary = actorBoundaryViolation(state.facts, expected.actor_id);
  if (boundary) return msReject(boundary);
  // An occupied actor/profile spelling cannot be appropriated by a new source digest.
  for (const f of state.facts.values()) {
    const v = f.value as { actor_id?: unknown };
    if (v.actor_id === expected.actor_id) return msReject("MS_ACTOR_COLLISION");
  }
  return msPinViolation(group, state, reachablePins(parsed.data));
}
