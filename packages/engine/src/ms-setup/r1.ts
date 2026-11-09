import {
  ActorSetupPlacementSchema,
  ActorPhysicalPresenceSchema,
  WorldSetupClosureSchema,
  InitialActorSetupIssueSchema,
  InitialActorSetupResponseSchema,
  NamedActorExistenceBasisSchema,
  TEMPORAL_STATE_KEY,
  actorSetupPlacementKey,
  actorPhysicalPresenceKey,
  namedActorExistenceBasisKey,
  msActorIssueKey,
  msActorResponseKey,
  worldSetupClosureKey,
  worldProfileKey,
  worldLocusKey,
  canonicalJson,
  timeEquals,
  type CommitGroup,
  type ActorSetupPlacement,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import { canonicalEqual } from "../hash.ts";
import { msChain, msReject, msPinViolation } from "./admission.ts";
import {
  planMsActor,
  qualifiedMsResponse,
  deriveMsExistence,
  msActorId,
  pinOf,
} from "./protocol.ts";
import { msPrefixViolation } from "./prefix.ts";
import { MS_R1_PLACEMENT_V1_RULE, MS_R1_CLOSURE_V1_RULE, MS_R1_PRESENCE_V1_RULE } from "./rules.ts";
import { resolveKey } from "../owners/registry.ts";
import { actorPhysicalPresenceViolation, presenceRivalViolation } from "../world/actor-presence.ts";

export function msQualifiedSource(state: CampaignState, phase: "PRE_CLOCK" | "B2" = "PRE_CLOCK") {
  const chain = msChain(state);
  if (!chain || msPrefixViolation(state.facts, chain.input, phase)) return null;
  const plan = planMsActor(state, chain.cf.key, chain.c);
  if (!plan.ok) return null;
  const q = state.facts.get(
    msActorIssueKey(chain.c.world_id, chain.c.locus_id, plan.value.issue.completion_digest),
  );
  const r = state.facts.get(
    msActorResponseKey(chain.c.world_id, chain.c.locus_id, plan.value.issue.completion_digest),
  );
  const qp = InitialActorSetupIssueSchema.safeParse(q?.value),
    rp = InitialActorSetupResponseSchema.safeParse(r?.value);
  if (
    !q ||
    !r ||
    !qp.success ||
    !rp.success ||
    !canonicalEqual(q.value, plan.value.issue) ||
    !qualifiedMsResponse(rp.data, q, state.campaign_id)
  )
    return null;
  const actor = msActorId(plan.value.issue.completion_digest);
  const basis = state.facts.get(namedActorExistenceBasisKey(actor));
  const bp = NamedActorExistenceBasisSchema.safeParse(basis?.value);
  if (
    !basis ||
    !bp.success ||
    !canonicalEqual(bp.data, deriveMsExistence(chain.i, chain.g, chain.cf, q, r)) ||
    actorBoundaryViolation(state.facts, actor) ||
    presenceRivalViolation(actor, state.facts.values())
  )
    return null;
  return { ...chain, plan: plan.value, q, r, actor, basis };
}
export function msPlacementValue(
  s: NonNullable<ReturnType<typeof msQualifiedSource>>,
): ActorSetupPlacement {
  const world = worldProfileKey(s.c.world_id),
    locus = worldLocusKey(s.c.world_id, s.c.locus_id);
  return {
    actor_id: s.actor,
    world: { fact_key: world, entity_id: s.c.world_id },
    locus: { fact_key: locus, entity_id: s.c.locus_id },
    actor_state: [{ owner: "named_actor", fact_key: s.basis.key, version: 1 }],
    pinned_versions: { world: 1, locus: 1 },
    statement: canonicalJson({
      format: "ms-initial-placement",
      format_version: 1,
      actor_id: s.actor,
      world_id: s.c.world_id,
      locus_id: s.c.locus_id,
    }),
  };
}
/** Actual kind + full source citation + complete source-qualified route. */
export function msR1GroupCheck(group: CommitGroup, state: CampaignState) {
  const w = group.writes[0],
    kind = w && resolveKey(w.key)?.kind.id;
  const rule =
    kind === "actor_setup_placement"
      ? MS_R1_PLACEMENT_V1_RULE
      : kind === "world_setup_closure"
        ? MS_R1_CLOSURE_V1_RULE
        : kind === "actor_physical_presence"
          ? MS_R1_PRESENCE_V1_RULE
          : null;
  if (!rule) return null;
  if (!canonicalEqual(group.rule, rule)) return msReject("MS_R1_RULE");
  if (group.writes.length !== 1 || w!.expected_version !== 0) return msReject("MS_R1_CREATE");
  const s = msQualifiedSource(state, kind === "actor_physical_presence" ? "B2" : "PRE_CLOCK");
  if (!s) return msReject("MS_R1_SOURCE");
  const bkey = actorSetupPlacementKey(s.actor),
    ckey = worldSetupClosureKey(s.c.world_id);
  if (kind === "actor_setup_placement") {
    const p = ActorSetupPlacementSchema.safeParse(w!.value);
    if (
      !p.success ||
      w!.key !== bkey ||
      !canonicalEqual(p.data, msPlacementValue(s)) ||
      state.facts.has(ckey)
    )
      return msReject("MS_B1_VALUE");
    return msPinViolation(group, state, [
      pinOf(s.basis),
      { fact_key: p.data.world.fact_key, version: 1 },
      { fact_key: p.data.locus.fact_key, version: 1 },
    ]);
  }
  const b = state.facts.get(bkey),
    bp = ActorSetupPlacementSchema.safeParse(b?.value);
  if (
    !b ||
    !bp.success ||
    !canonicalEqual(bp.data, msPlacementValue(s)) ||
    !canonicalEqual(b.provenance.rule, MS_R1_PLACEMENT_V1_RULE)
  )
    return msReject("MS_B1_SOURCE");
  const inventory = [pinOf(b)];
  const actual = [...state.facts.values()].filter(
    (f) => resolveKey(f.key)?.kind.id === "actor_setup_placement",
  );
  if (actual.length !== 1) return msReject("MS_CLOSURE_INVENTORY");
  if (kind === "world_setup_closure") {
    const c = WorldSetupClosureSchema.safeParse(w!.value);
    if (
      !c.success ||
      w!.key !== ckey ||
      !canonicalEqual(c.data, { world: bp.data.world, placements: inventory })
    )
      return msReject("MS_CLOSURE_VALUE");
    // Read-only B2 feasibility: custody and the exact source instant must already be constructible.
    if (presenceRivalViolation(s.actor, state.facts.values())) return msReject("MS_B2_PREVIEW");
    return msPinViolation(group, state, [
      { fact_key: bp.data.world.fact_key, version: 1 },
      ...inventory,
    ]);
  }
  const cf = state.facts.get(ckey),
    cv = WorldSetupClosureSchema.safeParse(cf?.value);
  if (
    !cf ||
    !cv.success ||
    !canonicalEqual(cf.provenance.rule, MS_R1_CLOSURE_V1_RULE) ||
    !canonicalEqual(cv.data, { world: bp.data.world, placements: inventory })
  )
    return msReject("MS_CLOSURE_SOURCE");
  const p = ActorPhysicalPresenceSchema.safeParse(w!.value);
  if (
    !p.success ||
    w!.key !== actorPhysicalPresenceKey(s.actor) ||
    p.data.actor_id !== s.actor ||
    !timeEquals(p.data.effective_instant, s.input.chronology.document.time)
  )
    return msReject("MS_B2_T0");
  for (const f of state.facts.values())
    if (resolveKey(f.key)?.kind.id === "actor_physical_presence" && f.key !== w!.key)
      return msReject("MS_B2_INVENTORY");
  const bad = actorPhysicalPresenceViolation(w!.key, p.data, state.facts);
  if (bad) return msReject(bad);
  return msPinViolation(group, state, [
    { fact_key: p.data.world.fact_key, version: 1 },
    { fact_key: p.data.locus.fact_key, version: 1 },
    pinOf(b),
    pinOf(cf),
    { fact_key: TEMPORAL_STATE_KEY, version: 1 },
  ]);
}
export function msTimePins(state: CampaignState) {
  const s = msQualifiedSource(state);
  if (!s) return null;
  const b = state.facts.get(actorSetupPlacementKey(s.actor)),
    c = state.facts.get(worldSetupClosureKey(s.c.world_id));
  if (
    !b ||
    !c ||
    !canonicalEqual(b.provenance.rule, MS_R1_PLACEMENT_V1_RULE) ||
    !canonicalEqual(c.provenance.rule, MS_R1_CLOSURE_V1_RULE)
  )
    return null;
  const bp = ActorSetupPlacementSchema.safeParse(b.value),
    cp = WorldSetupClosureSchema.safeParse(c.value);
  if (
    !bp.success ||
    !cp.success ||
    !canonicalEqual(bp.data, msPlacementValue(s)) ||
    !canonicalEqual(cp.data, { world: bp.data.world, placements: [pinOf(b)] })
  )
    return null;
  return [pinOf(s.cf), pinOf(s.i), pinOf(c), pinOf(b)].sort((a, b) =>
    a.fact_key < b.fact_key ? -1 : 1,
  );
}
