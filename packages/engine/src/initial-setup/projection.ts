import {
  CANON_WRITE_AUTHORITY,
  PopulationWorkforceScopeSchema,
  TEMPORAL_STATE_KEY,
  WorldSceneClosureSchema,
  compareTime,
  fail,
  ok,
  popWorkforceScopeKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  worldSceneClosureKey,
  type CommitGroup,
  type OwnerFact,
  type Pin,
  type Result,
  type Selection,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual, sha256Canonical } from "../hash.ts";
import { factKind } from "../owners/registry.ts";
import { reject, requirePrerequisite, isRejection, type Rejection } from "../owners/rejection.ts";
import { deriveWorkforceAccounting, liveSceneCoverage } from "../pc-collection/determinations.ts";
import type { CampaignStore, CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { scanInitialSetup } from "./admission.ts";
import {
  INITIAL_COMPLETION_SCENE_CLOSURE_RULE,
  INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE,
} from "./rules.ts";
import { completionOf, qualifies, type OccupiedInterval } from "./sunset-guard.ts";

/**
 * OPTION_A_V9 — the owner-derived projection of a signed, isolated, owner-admitted `initial_locality_completion` into the existing
 * `world_scene_closure` and `population_workforce_scope` (companion "CPAA Projection and Canonical Sunset"). It narrows only the SOURCE
 * of the CPAA-C1 F-1 premises for INITIAL_COMPLETION_V9; F-2 through F-5 and every owner check are unchanged. The Completion is never a
 * solitary/rights/reach/success verdict: World-State coverage, Population representations, engagement, physical reach, conservation and
 * due-event checks stay independently derived by their owners.
 *
 * Only CLOSED + NONE_IN_DOMAIN + every source NONE_ESTABLISHED projects; an adverse or unresolved branch (CLAIM_REQUIRED,
 * ACTOR_PRODUCER_REQUIRED, UNRESOLVED, OPEN) is retained as a constraint and projects no solitary closure.
 */
export const BOOTSTRAP_PROJECTION_BASIS = "initial-completion-v9";
export const BOOTSTRAP_PROJECTION_SECRECY = "engine-internal";

/** The one branch Option A may project: a closed domain with no non-PC actor and no established source claim. */
export const isProjectableSelection = (s: Selection): boolean =>
  s.closure.kind === "CLOSED" &&
  s.actors.kind === "NONE_IN_DOMAIN" &&
  s.source_claims.length > 0 &&
  s.source_claims.every((c) => c.kind === "NONE_ESTABLISHED");

const currentTime = (facts: ReadonlyMap<string, OwnerFact>) => {
  const t = facts.get(TEMPORAL_STATE_KEY);
  return t ? (t.value as { canonical_time: Selection["coverage"]["start"] }).canonical_time : null;
};

/** The locality's one Completion in a prefix, as a parsed value with its fact. */
function completionIn(facts: ReadonlyMap<string, OwnerFact>) {
  const fact = scanInitialSetup(facts).completion;
  const value = completionOf(fact);
  return fact && value ? { fact, value } : null;
}

const refuseWith = (message: string, reason: string): Rejection =>
  reject("CLAIM_INCOMPATIBLE", message, { reason });

/**
 * Admission of a closure or workforce scope written under an INITIAL_COMPLETION_V9 rule. Pure over (group, pre-state). The owner's own
 * derivation (`sceneClosureGroupCheck` / `workforceScopeGroupCheck`) still runs AFTER this; nothing here relaxes it.
 */
export function initialCompletionProjectionCheck(
  group: CommitGroup,
  state: CampaignState,
  which: "CLOSURE" | "WORKFORCE",
): Rejection | null {
  const want =
    which === "CLOSURE"
      ? INITIAL_COMPLETION_SCENE_CLOSURE_RULE
      : INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE;
  if (!canonicalEqual(group.rule, want))
    return reject(
      "VALUE_INVALID",
      "the projection carries its own INITIAL_COMPLETION_V9 governing citation",
    );
  const w = group.writes[0]!;
  const completion = completionIn(state.facts);
  if (!completion)
    return reject(
      "PREREQUISITE_MISSING",
      "a receipt, an empty ledger or a caller flag is never eligible: an owner-admitted Completion is required",
      { reason: "NO_COMPLETION" },
    );
  const required = requirePrerequisite(
    group,
    state,
    completion.fact.key,
    "the Initial Locality Completion",
  );
  if (isRejection(required)) return required;
  const selection = completion.value.selection;
  const now = currentTime(state.facts);
  if (!now)
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      reason: "NO_TIME",
    });
  const q = qualifies(completion.value, state.facts, null);
  if (!q.qualified)
    return refuseWith(
      `the Initial Scene Exception does not qualify at this prefix: ${q.message}`,
      q.code,
    );
  // the effective instant lies inside the authored coverage [start, end)
  const inside = compareTime(now, selection.coverage.start);
  const before = compareTime(now, selection.coverage.end);
  if (inside === null || before === null || inside < 0 || before >= 0)
    return refuseWith(
      "the canonical time is outside the Completion's authored coverage",
      "COVERAGE_ENDED",
    );

  if (which === "CLOSURE") {
    if (!isProjectableSelection(selection))
      return refuseWith(
        "an adverse or unresolved selected branch is retained as a constraint and projects no solitary closure",
        "ADVERSE_BRANCH",
      );
    const parsed = WorldSceneClosureSchema.safeParse(w.value);
    if (!parsed.success) return reject("VALUE_INVALID", "the closure violates its contract");
    const c = parsed.data;
    const claim = selection.source_claims[0]!;
    if (
      !canonicalEqual(c.domain, selection.domain) ||
      c.closure.statement !== selection.closure.ground ||
      c.source_rights.length !== 1 ||
      c.source_rights[0]!.source_fact_key !== claim.source.fact_key ||
      c.source_rights[0]!.ground !== claim.ground
    )
      return reject(
        "VALUE_INVALID",
        "the closure projects exactly the Completion's domain, closure ground and unencumbered source",
      );
    return null;
  }
  const parsed = PopulationWorkforceScopeSchema.safeParse(w.value);
  if (!parsed.success) return reject("VALUE_INVALID", "the scope violates its contract");
  if (parsed.data.scope.statement !== selection.workforce.scope_statement)
    return reject(
      "VALUE_INVALID",
      "the scope statement is exactly the Completion's workforce statement",
    );
  return null;
}

/**
 * The dependent-admission guard (companion "as-of function"): at the enrollment of collection work, when the locality's governing
 * closure was projected under the Initial Scene Exception, the exception must qualify at THIS admission's own prefix for the work's
 * FULL occupied interval [begin, finish). Closures established by the author-only rule are untouched. Returns null when not engaged.
 */
export function initialCompletionWorkViolation(
  state: CampaignState,
  locality: { world_id: string; locus_id: string },
  interval: OccupiedInterval,
): Rejection | null {
  const closure = state.facts.get(worldSceneClosureKey(locality.world_id, locality.locus_id));
  if (!closure || !canonicalEqual(closure.provenance.rule, INITIAL_COMPLETION_SCENE_CLOSURE_RULE))
    return null;
  const completion = completionIn(state.facts);
  if (!completion)
    return refuseWith(
      "the Initial Scene Exception has no admitted Completion at this prefix",
      "NO_COMPLETION",
    );
  const q = qualifies(completion.value, state.facts, interval);
  return q.qualified
    ? null
    : refuseWith(
        `the Initial Scene Exception does not qualify for this work: ${q.message}`,
        q.code,
      );
}

/**
 * Refusal of an author-only closure that would erase an admitted adverse constraint: CLAIM_REQUIRED, ACTOR_PRODUCER_REQUIRED, OPEN or
 * UNRESOLVED stay initial constraints and cannot be re-encoded as a successful legacy UNENCUMBERED output.
 */
export function adverseCompletionErasureViolation(state: CampaignState): Rejection | null {
  const completion = completionIn(state.facts);
  if (!completion || isProjectableSelection(completion.value.selection)) return null;
  return refuseWith(
    "an admitted adverse actor/claim constraint cannot be re-encoded as a successful UNENCUMBERED closure",
    "ADVERSE_CONSTRAINT_STANDS",
  );
}

type ProjectionError = StoreCommitErrorCode | "PROJECTION_UNAVAILABLE" | "ADVERSE_BRANCH";

/**
 * World-State's and Population's trusted publication of the two OPTION_A_V9 facts. The coverage and the representations are DERIVED
 * here from the owners' live facts (and re-derived by admission), never supplied; the Completion supplies only the authored selection.
 */
export class InitialCompletionProjection {
  readonly #store: CampaignStore;

  constructor(store: CampaignStore) {
    this.#store = store;
  }

  #facts(): ReadonlyMap<string, OwnerFact> {
    return new Map(this.#store.listFacts().map((f) => [f.key, f]));
  }

  async #publish(
    kindId: "world_scene_closure" | "population_workforce_scope",
    key: string,
    value: unknown,
    expectedVersion: number,
    readKeys: readonly string[],
    rule: CommitGroup["rule"],
    digest: string,
  ): Promise<Result<CommitOutcome, ProjectionError>> {
    const kind = factKind(kindId);
    const id = `initial-completion:${kindId}:${digest}`;
    // a retry after a crash (or a repeat) reconciles by identity: the committed group is replayed, never rebuilt against a newer prior
    const replay = this.#store.committedGroup(`${id}:intent`);
    if (replay) return this.#store.commit(replay);
    const group: CommitGroup = {
      campaign_id: this.#store.head().campaign_id,
      group_id: `${id}:group`,
      intent_id: `${id}:intent`,
      owner: kind.owner,
      facet: kind.facet,
      cause: `${id}:cause`,
      rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: readKeys.map((k) => ({ key: k, version: this.#store.getFact(k)?.version ?? 0 })),
      depends_on: [
        ...new Set(readKeys.flatMap((k) => this.#store.getFact(k)?.provenance.group_id ?? [])),
      ],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: BOOTSTRAP_PROJECTION_BASIS,
          secrecy: BOOTSTRAP_PROJECTION_SECRECY,
          expected_version: expectedVersion,
        },
      ],
    };
    return this.#store.commit(group);
  }

  /** Projects the Completion's closed, actor-free, claim-free domain into World-State's scene closure. */
  async projectSceneClosure(): Promise<Result<CommitOutcome, ProjectionError>> {
    const facts = this.#facts();
    const completion = completionIn(facts);
    const now = currentTime(facts);
    if (!completion || !now)
      return fail(
        "PROJECTION_UNAVAILABLE",
        "an admitted Completion and the canonical time are committed first",
      );
    const selection = completion.value.selection;
    if (!isProjectableSelection(selection))
      return fail(
        "ADVERSE_BRANCH",
        "the selected branch is retained as a constraint and projects no solitary closure",
      );
    const { world_id, locus_id } = completion.value;
    const locality = {
      world: { fact_key: worldProfileKey(world_id), entity_id: world_id },
      locus: { fact_key: worldLocusKey(world_id, locus_id), entity_id: locus_id },
    };
    const world = facts.get(locality.world.fact_key);
    const locus = facts.get(locality.locus.fact_key);
    if (!world || !locus)
      return fail("PROJECTION_UNAVAILABLE", "the committed world and locus are required");
    const view = {
      get: (k: string) => facts.get(k),
      has: (k: string) => facts.has(k),
      values: () => facts.values(),
    };
    const covered = liveSceneCoverage(view, locality);
    const claim = selection.source_claims[0]!;
    const prior = facts.get(worldSceneClosureKey(world_id, locus_id));
    const value = WorldSceneClosureSchema.parse({
      locality: { world_id, locus_id },
      world: { fact_key: world.key, version: world.version },
      locus: { fact_key: locus.key, version: locus.version },
      domain: selection.domain,
      closure: { statement: selection.closure.ground },
      source_rights: [
        { source_fact_key: claim.source.fact_key, status: "UNENCUMBERED", ground: claim.ground },
      ],
      covered,
      effective_at: now,
      committer: { owner: "world_state", facet: "world_scene_closure" },
    });
    const digest = sha256Canonical({
      completion: pinOf(completion.fact),
      effective_at: now,
      covered,
    });
    return this.#publish(
      "world_scene_closure",
      worldSceneClosureKey(world_id, locus_id),
      value,
      prior?.version ?? 0,
      [
        ...(prior ? [prior.key] : []),
        completion.fact.key,
        TEMPORAL_STATE_KEY,
        world.key,
        locus.key,
        ...covered.population_ledgers.map((l) => l.fact_key),
        ...covered.actors.map((a) => worldActorCouplingKey(a)),
        ...covered.pcs.map((pc) => worldPcLocusCustodyKey(pc)),
        claim.source.fact_key,
      ],
      INITIAL_COMPLETION_SCENE_CLOSURE_RULE,
      digest,
    );
  }

  /** Projects the Completion's workforce statement into Population's scope; Population derives the representations itself. */
  async projectWorkforceScope(): Promise<Result<CommitOutcome, ProjectionError>> {
    const facts = this.#facts();
    const completion = completionIn(facts);
    const now = currentTime(facts);
    if (!completion || !now)
      return fail(
        "PROJECTION_UNAVAILABLE",
        "an admitted Completion and the canonical time are committed first",
      );
    const { world_id, locus_id } = completion.value;
    const locality = {
      world: { fact_key: worldProfileKey(world_id), entity_id: world_id },
      locus: { fact_key: worldLocusKey(world_id, locus_id), entity_id: locus_id },
    };
    const view = {
      get: (k: string) => facts.get(k),
      has: (k: string) => facts.has(k),
      values: () => facts.values(),
    };
    const accounting = deriveWorkforceAccounting(view, locality);
    const prior = facts.get(popWorkforceScopeKey(world_id, locus_id));
    const value = PopulationWorkforceScopeSchema.parse({
      locality: { world_id, locus_id },
      scope: { statement: completion.value.selection.workforce.scope_statement },
      ...accounting,
      determined_at: now,
      committer: { owner: "population", facet: "population_workforce_scope" },
    });
    const digest = sha256Canonical({
      completion: pinOf(completion.fact),
      determined_at: now,
      accounting,
    });
    return this.#publish(
      "population_workforce_scope",
      popWorkforceScopeKey(world_id, locus_id),
      value,
      prior?.version ?? 0,
      [
        ...(prior ? [prior.key] : []),
        completion.fact.key,
        TEMPORAL_STATE_KEY,
        ...accounting.representations.map((r) => r.fact_key),
      ],
      INITIAL_COMPLETION_WORKFORCE_SCOPE_RULE,
      digest,
    );
  }
}

const pinOf = (f: OwnerFact): Pin => ({ fact_key: f.key, version: f.version });
