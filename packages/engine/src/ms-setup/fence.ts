import {
  InitialSetupInputSchema,
  InitialLocalityCompletionSchema,
  WorldSetupClosureSchema,
  TEMPORAL_STATE_KEY,
  actorPhysicalPresenceKey,
  actorSetupPlacementKey,
  msActorIssueKey,
  msActorResponseKey,
  namedActorExistenceBasisKey,
  worldSetupClosureKey,
  type CommitGroup,
  type Pin,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { resolveKey } from "../owners/registry.ts";
import { msActorId, msCompletionDigest, descriptor } from "./protocol.ts";
import { isMsInputRule, isMsCompletionRule } from "./prefix.ts";
import { msReject } from "./admission.ts";
import { MS_SOURCE } from "./rules.ts";
import { canonicalEqual } from "../hash.ts";

/** C5: opaque, process-local, state-object-bound proof. No caller or canonical flag can supply one. */
export interface MsFenceView {
  readonly campaign: string;
  readonly revision: number;
  readonly hasMs: boolean;
  readonly world_id: string | null;
  readonly locus_id: string | null;
  readonly route: "MS" | null;
  readonly input: Pin | null;
  readonly completion: Pin | null;
  readonly closure: Pin | null;
  readonly inventory: readonly Pin[];
  readonly released: boolean;
}
const views = new WeakMap<CampaignState, MsFenceView>();
export const msFenceMetrics = {
  rebuilds: 0,
  scans: 0,
  reads: 0,
  scannedFacts: 0,
  keyInspections: 0,
  viewReads: 0,
  historyChecks: 0,
};
const pin = (key: string, version: number): Pin => ({ fact_key: key, version });
export function inspectMsFenceView(state: CampaignState): MsFenceView | null {
  return views.get(state) ?? null;
}
/** Only the core's verified-open/transition hooks bind this result to an actual state object. */
export function initializeMsFence(state: CampaignState, checked: (id: string) => boolean): void {
  msFenceMetrics.rebuilds++;
  const all = [...state.facts.values()];
  msFenceMetrics.scans++;
  msFenceMetrics.scannedFacts += all.length;
  if (state.revision === 0 && all.length !== 0) return;
  // The core supplies a policy-bound verified snapshot (or empty genesis). Absence is derived
  // from that snapshot; unrelated facts need no additional per-fact index/journal lookup.
  // For MS, corroborate only the milestones this view actually summarizes. Full chain and
  // original pre-state verification remain the independent snapshot/replay obligations.
  const verified = new Set<string>();
  let evidenceMissing = false;
  const hasEvidence = (fact: (typeof all)[number]): boolean => {
    const id = fact.provenance.group_id;
    if (verified.has(id)) return true;
    msFenceMetrics.historyChecks++;
    if (!checked(id)) {
      evidenceMissing = true;
      return false;
    }
    verified.add(id);
    return true;
  };
  const completion = all.find((f) => isMsCompletionRule(f.provenance.rule));
  const completionValue = completion
    ? InitialLocalityCompletionSchema.safeParse(completion.value)
    : null;
  if (completion && !completionValue?.success) return;
  if (completionValue?.success) msFenceMetrics.reads++;
  const input = completionValue?.success
    ? state.facts.get(completionValue.data.input.fact_key)
    : all.find((f) => isMsInputRule(f.provenance.rule));
  if (
    completionValue?.success &&
    (!input ||
      !isMsInputRule(input.provenance.rule) ||
      input.version !== completionValue.data.input.version)
  )
    return;
  const inputValue = input ? InitialSetupInputSchema.safeParse(input.value) : null;
  if (input && !inputValue?.success) return;
  if ((input && !hasEvidence(input)) || (completion && !hasEvidence(completion))) return;
  let closure: Pin | null = null,
    inventory: readonly Pin[] = [],
    released = false;
  if (completion) {
    const c = InitialLocalityCompletionSchema.safeParse(completion.value);
    if (!c.success || !input) return;
    msFenceMetrics.reads++;
    const cf = state.facts.get(worldSetupClosureKey(c.data.world_id));
    const cv = WorldSetupClosureSchema.safeParse(cf?.value);
    if (cf && (!cv.success || !hasEvidence(cf))) return;
    if (cf && cv.success) {
      closure = pin(cf.key, cf.version);
      inventory = cv.data.placements;
      released =
        inventory.length === 1 &&
        inventory.every((p) => {
          msFenceMetrics.reads++;
          const b = state.facts.get(p.fact_key);
          const id = (b?.value as { actor_id?: string } | undefined)?.actor_id;
          if (!id || !hasEvidence(b!)) return false;
          msFenceMetrics.reads++;
          const presence = state.facts.get(actorPhysicalPresenceKey(id));
          return !!presence && hasEvidence(presence);
        });
      // Missing history cannot turn an apparently completed snapshot into an active view.
      if (evidenceMissing) return;
    }
  }
  views.set(
    state,
    Object.freeze({
      campaign: state.campaign_id,
      revision: state.revision,
      hasMs: !!input,
      world_id: inputValue?.success ? inputValue.data.world_id : null,
      locus_id: inputValue?.success ? inputValue.data.locus_id : null,
      route: input ? "MS" : null,
      input: input ? pin(input.key, input.version) : null,
      completion: completion ? pin(completion.key, completion.version) : null,
      closure,
      inventory: Object.freeze([...inventory]),
      released,
    }),
  );
}

/** Stateless oracle; exceptional active-window work uses the real full prefix. */
export function msFenceFullCheck(group: CommitGroup, state: CampaignState) {
  msFenceMetrics.scans++;
  const all = [...state.facts.values()];
  msFenceMetrics.scannedFacts += all.length;
  const completion = all.find((f) => isMsCompletionRule(f.provenance.rule));
  if (!completion) return null;
  const c = InitialLocalityCompletionSchema.safeParse(completion.value);
  if (!c.success) return msReject("MS_FENCE_UNKNOWN");
  const digest = msCompletionDigest(descriptor(completion)),
    actor = msActorId(digest);
  const keys = [
    msActorIssueKey(c.data.world_id, c.data.locus_id, digest),
    msActorResponseKey(c.data.world_id, c.data.locus_id, digest),
    namedActorExistenceBasisKey(actor),
    actorSetupPlacementKey(actor),
    worldSetupClosureKey(c.data.world_id),
    TEMPORAL_STATE_KEY,
    actorPhysicalPresenceKey(actor),
  ];
  const next = keys.find((k) => {
    msFenceMetrics.reads++;
    return !state.facts.has(k);
  });
  if (!next) return null;
  return group.writes.length === 1 && group.writes[0]!.key === next
    ? null
    : msReject("MS_PHASE_FENCE");
}
export function msFenceCheck(group: CommitGroup, state: CampaignState) {
  msFenceMetrics.viewReads++;
  const view = views.get(state);
  if (!view || view.campaign !== state.campaign_id || view.revision !== state.revision)
    return msReject("MS_FENCE_UNKNOWN");
  // Inspect every candidate's fixed write keys/rules. Never enumerate ordinary no-MS or released state.
  msFenceMetrics.keyInspections += group.writes.length;
  if (group.rule.artifact === MS_SOURCE.artifact) {
    for (const w of group.writes) {
      const kind = resolveKey(w.key)?.kind;
      if (
        !kind ||
        !(
          canonicalEqual(kind.rule, group.rule) ||
          kind.alternateRules?.some((a) => canonicalEqual(a.rule, group.rule) && a.admits(w.value))
        )
      )
        return msReject("MS_RULE_KIND");
    }
    if (!view.hasMs && !isMsInputRule(group.rule)) return msReject("MS_SOURCE_CHAIN");
  }
  if (!view.hasMs || view.released || !view.completion) return null;
  return msFenceFullCheck(group, state);
}
/** A successful durable adoption only. Prepare, refusal and receipt lookup never invoke this. */
export function advanceMsFence(
  before: CampaignState,
  after: CampaignState,
  group: CommitGroup,
): void {
  const prior = views.get(before);
  if (!prior || after.revision !== before.revision + 1 || after.campaign_id !== before.campaign_id)
    return;
  let view: MsFenceView = { ...prior, revision: after.revision };
  for (const w of group.writes) {
    const kind = resolveKey(w.key)?.kind.id;
    if (kind === "initial_setup_input" && isMsInputRule(group.rule)) {
      const i = InitialSetupInputSchema.safeParse(w.value);
      if (!i.success) return;
      view = {
        ...view,
        hasMs: true,
        input: pin(w.key, 1),
        world_id: i.data.world_id,
        locus_id: i.data.locus_id,
        route: "MS",
      };
    }
    if (kind === "initial_locality_completion" && isMsCompletionRule(group.rule))
      view = { ...view, completion: pin(w.key, 1) };
    if (kind === "world_setup_closure" && view.completion) {
      const c = WorldSetupClosureSchema.safeParse(w.value);
      if (!c.success) return;
      view = { ...view, closure: pin(w.key, 1), inventory: Object.freeze([...c.data.placements]) };
    }
    if (kind === "actor_physical_presence" && view.closure) view = { ...view, released: true };
  }
  views.set(after, Object.freeze(view));
}
