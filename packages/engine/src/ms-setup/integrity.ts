import {
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  InitialActorSetupIssueSchema,
  InitialActorSetupResponseSchema,
  NamedActorExistenceBasisSchema,
  WorldSetupClosureSchema,
  ActorSetupPlacementSchema,
  ActorPhysicalPresenceSchema,
  msActorIssueKey,
  msActorResponseKey,
  namedActorExistenceBasisKey,
  actorSetupPlacementKey,
  worldSetupClosureKey,
  actorPhysicalPresenceKey,
  TEMPORAL_STATE_KEY,
  canonicalJson,
  worldProfileKey,
  worldLocusKey,
  timeEquals,
  type OwnerFact,
  type Pin,
} from "@immortalis/contracts";
import type { CampaignStore } from "../persistence/store.ts";
import type { IntegrityViolation } from "../world/integrity.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { actorBoundaryViolation } from "../actor/derive.ts";
import { presenceRivalViolation } from "../world/actor-presence.ts";
import { isMsCompletionRule, isMsInputRule, MS_PRE_CLOCK_KINDS } from "./prefix.ts";
import {
  msActorId,
  msCompletionDigest,
  descriptor,
  qualifiedMsResponse,
  deriveMsExistence,
  pinOf,
  MS_ACTOR_INSTRUCTION_HASH,
  strictEd25519Key,
} from "./protocol.ts";
import { reachablePins } from "./admission.ts";
import { MS_R1_PLACEMENT_V1_RULE, MS_R1_CLOSURE_V1_RULE, MS_R1_PRESENCE_V1_RULE } from "./rules.ts";

/** Tier 2 only: immutable relations + corroborated historical evidence. No historical projection/hash from advanced current values. */
export function verifyMsIntegrity(store: CampaignStore): readonly IntegrityViolation[] {
  const all = store.listFacts(),
    facts = new Map(all.map((f) => [f.key, f])),
    out: IntegrityViolation[] = [];
  const checked = store.ruleCheckedGroupIds?.();
  const bad = (key: string, message: string) =>
    out.push({ key, code: "REFERENCE_INVALID", message });
  const revision = (f: OwnerFact) => store.lookupReceipt(f.provenance.intent_id)?.revision ?? -1;
  const relevant = all.filter(
    (f) =>
      isMsInputRule(f.provenance.rule) ||
      isMsCompletionRule(f.provenance.rule) ||
      [
        "initial_actor_setup_issue",
        "initial_actor_setup_response",
        "named_actor_existence_basis",
      ].includes(resolveKey(f.key)?.kind.id ?? "") ||
      [MS_R1_PLACEMENT_V1_RULE, MS_R1_CLOSURE_V1_RULE, MS_R1_PRESENCE_V1_RULE].some((r) =>
        canonicalEqual(r, f.provenance.rule),
      ),
  );
  if (!relevant.length) return out;
  function provePins(f: OwnerFact, pins: readonly Pin[], exact: boolean) {
    const group = store.committedGroup(f.provenance.intent_id);
    if (!group) {
      bad(f.key, "missing committed source group");
      return;
    }
    const unique = new Map(pins.map((p) => [p.fact_key, p.version]));
    if (pins.some((p) => unique.get(p.fact_key) !== p.version))
      bad(f.key, "conflicting historical source pins");
    if (
      exact &&
      (group.reads.length !== unique.size ||
        group.reads.some((r) => unique.get(r.key) !== r.version))
    )
      bad(f.key, "historical reads differ from the exact required pins");
    const used = new Set<string>();
    for (const [key, version] of unique) {
      if (!group.reads.some((r) => r.key === key && r.version === version)) {
        bad(f.key, "missing exact historical read: " + key);
        continue;
      }
      const sources = group.depends_on.flatMap((id) => {
        const source = store.committedGroupById?.(id);
        return source?.writes.some((w) => w.key === key && w.expected_version + 1 === version)
          ? [source]
          : [];
      });
      if (sources.length !== 1) {
        bad(f.key, "unproved historical source/dependency: " + key);
        continue;
      }
      const source = sources[0]!,
        receipt = store.lookupReceipt(source.intent_id);
      if (!receipt || receipt.revision >= revision(f) || !checked?.has(source.group_id))
        bad(f.key, "unverified source order: " + key);
      used.add(source.group_id);
    }
    if (
      exact &&
      (used.size !== group.depends_on.length || group.depends_on.some((id) => !used.has(id)))
    )
      bad(f.key, "extra/missing historical committing dependency");
  }
  for (const f of relevant) {
    const committed = store.committedGroup(f.provenance.intent_id);
    if (
      !committed ||
      committed.writes.length !== 1 ||
      committed.writes[0]!.key !== f.key ||
      !canonicalEqual(committed.writes[0]!.value, f.value) ||
      !canonicalEqual(committed.rule, f.provenance.rule)
    )
      bad(f.key, "snapshot fact differs from its exact committed source group");
    if (!checked?.has(f.provenance.group_id))
      bad(f.key, "MS chain lacks ruleCheckedGroupIds evidence");
    const kind = resolveKey(f.key)?.kind;
    if (
      !kind ||
      f.owner !== kind.owner ||
      f.facet !== kind.facet ||
      !kind.valueSchema.safeParse(f.value).success
    )
      bad(f.key, "MS source kind/owner/facet/schema differs");
    if (isMsInputRule(f.provenance.rule)) {
      const input = InitialSetupInputSchema.safeParse(f.value);
      if (input.success) provePins(f, input.data.genesis, true);
    }
  }
  const completions = relevant.filter((f) => isMsCompletionRule(f.provenance.rule));
  if (
    completions.length > 1 ||
    (completions.length !== 1 && relevant.some((f) => !isMsInputRule(f.provenance.rule)))
  )
    bad(
      relevant[0]!.key,
      "MS derived evidence requires exactly one source-qualified governing Completion",
    );
  for (const cf of completions) {
    const cp = InitialLocalityCompletionSchema.safeParse(cf.value);
    if (!cp.success) continue;
    const c = cp.data,
      i = facts.get(c.input.fact_key),
      g = facts.get(c.grant.fact_key),
      ip = InitialSetupInputSchema.safeParse(i?.value);
    if (
      !i ||
      !g ||
      !ip.success ||
      !isMsInputRule(i.provenance.rule) ||
      i.version !== c.input.version ||
      g.version !== c.grant.version
    ) {
      bad(cf.key, "MS Input/Completion pair and source pins are not qualified");
      continue;
    }
    provePins(i, ip.data.genesis, true);
    provePins(cf, [c.input, c.grant, c.scene_response], true);
    const digest = msCompletionDigest(descriptor(cf)),
      actor = msActorId(digest);
    const q = facts.get(msActorIssueKey(c.world_id, c.locus_id, digest));
    const r = facts.get(msActorResponseKey(c.world_id, c.locus_id, digest));
    const b = facts.get(namedActorExistenceBasisKey(actor));
    const p = facts.get(actorSetupPlacementKey(actor));
    const closure = facts.get(worldSetupClosureKey(c.world_id));
    const presence = facts.get(actorPhysicalPresenceKey(actor));
    if (q) {
      const qp = InitialActorSetupIssueSchema.safeParse(q.value);
      if (!qp.success) continue;
      const v = qp.data;
      if (
        v.completion_digest !== digest ||
        !canonicalEqual(v.completion, pinOf(cf)) ||
        !canonicalEqual(v.input, c.input) ||
        !canonicalEqual(v.grant, c.grant) ||
        v.runner.instruction_hash !== MS_ACTOR_INSTRUCTION_HASH ||
        !strictEd25519Key(v.runner.public_key) ||
        !canonicalEqual(
          {
            key_id: v.runner.key_id,
            public_key: v.runner.public_key,
            driver_id: v.runner.driver_id,
            driver_config_hash: v.runner.driver_config_hash,
          },
          {
            key_id: ip.data.runner.key_id,
            public_key: ip.data.runner.public_key,
            driver_id: ip.data.runner.driver_id,
            driver_config_hash: ip.data.runner.driver_config_hash,
          },
        )
      )
        bad(q.key, "sealed issue source/profile relationships differ");
      provePins(q, [...reachablePins(q.value), ...ip.data.genesis], true);
    }
    if (r) provePins(r, reachablePins(r.value), true);
    if (b) {
      const rp = InitialActorSetupResponseSchema.safeParse(r?.value),
        bp = NamedActorExistenceBasisSchema.safeParse(b.value);
      if (
        !q ||
        !r ||
        !rp.success ||
        !bp.success ||
        !qualifiedMsResponse(rp.data, q, store.head().campaign_id) ||
        !canonicalEqual(bp.data, deriveMsExistence(i, g, cf, q, r))
      )
        bad(b.key, "sealed existence proof differs");
      provePins(b, reachablePins(b.value), true);
      if (actorBoundaryViolation(facts, actor) || presenceRivalViolation(actor, all))
        bad(b.key, "rival actor/PC/Population identity");
    }
    if (p) {
      const pp = ActorSetupPlacementSchema.safeParse(p.value);
      const world = { fact_key: worldProfileKey(c.world_id), entity_id: c.world_id },
        locus = { fact_key: worldLocusKey(c.world_id, c.locus_id), entity_id: c.locus_id };
      if (
        !b ||
        !pp.success ||
        !canonicalEqual(pp.data, {
          actor_id: actor,
          world,
          locus,
          actor_state: [{ owner: "named_actor", fact_key: b.key, version: 1 }],
          pinned_versions: { world: 1, locus: 1 },
          statement: canonicalJson({
            format: "ms-initial-placement",
            format_version: 1,
            actor_id: actor,
            world_id: c.world_id,
            locus_id: c.locus_id,
          }),
        })
      )
        bad(p.key, "MS B1 lacks its single sealed existence source");
      if (pp.success)
        provePins(
          p,
          [
            { fact_key: pp.data.world.fact_key, version: 1 },
            { fact_key: pp.data.locus.fact_key, version: 1 },
            ...(b ? [pinOf(b)] : []),
          ],
          true,
        );
    }
    if (closure) {
      const cv = WorldSetupClosureSchema.safeParse(closure.value);
      if (!p || !cv.success || !canonicalEqual(cv.data.placements, [pinOf(p)]))
        bad(closure.key, "MS closure inventory differs");
      if (cv.success)
        provePins(
          closure,
          [{ fact_key: cv.data.world.fact_key, version: 1 }, ...cv.data.placements],
          true,
        );
    }
    if (presence) {
      const pv = ActorPhysicalPresenceSchema.safeParse(presence.value);
      if (
        !pv.success ||
        !p ||
        !closure ||
        presence.version !== 1 ||
        !timeEquals(pv.data.effective_instant, ip.data.chronology.document.time)
      )
        bad(presence.key, "MS initial presence/time differs");
      if (pv.success && p) {
        const pp = ActorSetupPlacementSchema.safeParse(p.value);
        if (
          !pp.success ||
          pv.data.actor_id !== actor ||
          !canonicalEqual(pv.data.world, pp.data.world) ||
          !canonicalEqual(pv.data.locus, pp.data.locus) ||
          !canonicalEqual(pv.data.pinned_versions, { world: 1, locus: 1, placement: 1, closure: 1 })
        )
          bad(presence.key, "MS B2 sealed location/pin relationships differ");
      }
      if (pv.success && p && closure)
        provePins(
          presence,
          [
            { fact_key: pv.data.world.fact_key, version: 1 },
            { fact_key: pv.data.locus.fact_key, version: 1 },
            pinOf(p),
            pinOf(closure),
            { fact_key: TEMPORAL_STATE_KEY, version: 1 },
          ],
          true,
        );
    }
    // SEALED before-revision set is exact. ADVANCING membership/absence remains tier-1 history evidence.
    const last = presence ?? closure ?? p ?? b ?? r ?? q ?? cf;
    for (const f of all) {
      const kind = resolveKey(f.key)?.kind;
      if (
        revision(f) < revision(last) &&
        kind?.lifecycle === "SEALED" &&
        !MS_PRE_CLOCK_KINDS.has(kind.id)
      )
        bad(last.key, "unexpected create-only fact in the historical MS setup prefix: " + f.key);
    }
    const clock = facts.get(TEMPORAL_STATE_KEY);
    if (closure && clock) {
      // The original time group is addressed through the B2 dependency when current time advanced.
      const group = presence ? store.committedGroup(presence.provenance.intent_id) : null;
      const timeGroups =
        group?.depends_on.flatMap((id) => {
          const x = store.committedGroupById?.(id);
          return x?.writes.some((w) => w.key === TEMPORAL_STATE_KEY && w.expected_version === 0)
            ? [x]
            : [];
        }) ?? [];
      const tg =
        timeGroups[0] ??
        (clock.version === 1 ? store.committedGroup(clock.provenance.intent_id) : null);
      if (!tg || !checked?.has(tg.group_id))
        bad(clock.key, "MS initial time group lacks historical evidence");
      else {
        const receipt = store.lookupReceipt(tg.intent_id),
          write = tg.writes.find((w) => w.key === TEMPORAL_STATE_KEY)!;
        if (receipt)
          provePins(
            {
              ...clock,
              value: write.value,
              version: 1,
              provenance: { ...clock.provenance, group_id: tg.group_id, intent_id: tg.intent_id },
            },
            [pinOf(cf), pinOf(i), pinOf(closure), ...(p ? [pinOf(p)] : [])],
            true,
          );
      }
    }
  }
  return out;
}
