import {
  OWNER_GIP,
  type CommitGroup,
  type GipOwnerHead,
  type OwnerFact,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { freightWorkCounters } from "../owners/freight-common.ts";

/**
 * The campaign-wide GIP owner head (ROADBED R2-D18 v1.2.1 §3.2: "any authoritative GIP change anywhere in the campaign ...
 * differs from the sealed protected head"). It is a PURE FUNCTION of committed state: the number of GIP-owned facts and the sum
 * of their versions. Facts are never deleted and a version only rises, so every authoritative GIP write — a new fact of any GIP
 * kind, legacy or first-profile, or an advance of an existing one — strictly increases `versions`. Equality with the head the
 * Legal Readiness Seal fixed therefore proves that NO GIP write has been committed since the seal, and nothing is stored: no
 * eligibility flag, no use counter and no cross-owner invalidation fact exists.
 *
 * Cost: the value is memoized per state object and advanced incrementally on each durable commit (`advanceGipOwnerHead`, called
 * from the admission's `committedView` hook), so an act-time check is one map read. A state object with no memo (a first use
 * after open, or a detached state) is scanned once; that scan is counted and is never part of routine advance work.
 */
const heads = new WeakMap<CampaignState, GipOwnerHead>();

export function gipOwnerHeadOfFacts(facts: Iterable<OwnerFact>): GipOwnerHead {
  let count = 0;
  let versions = 0;
  let visited = 0;
  for (const f of facts) {
    visited++;
    if (f.owner !== OWNER_GIP) continue;
    count++;
    versions += f.version;
  }
  freightWorkCounters.gipHeadScans++;
  freightWorkCounters.gipHeadScannedFacts += visited;
  return { facts: count, versions };
}

export function gipOwnerHeadOfState(state: CampaignState): GipOwnerHead {
  let head = heads.get(state);
  if (!head) {
    head = Object.freeze(gipOwnerHeadOfFacts(state.facts.values()));
    heads.set(state, head);
  }
  return head;
}

/** Durable adoption only: carries the memo from the pre-state to the post-state of one committed group. */
export function advanceGipOwnerHead(
  before: CampaignState,
  after: CampaignState,
  group: CommitGroup,
): void {
  const prior = heads.get(before);
  if (!prior || after.revision !== before.revision + 1) return;
  if (group.owner !== OWNER_GIP) {
    heads.set(after, prior);
    return;
  }
  let created = 0;
  for (const w of group.writes) if (!before.facts.has(w.key)) created++;
  freightWorkCounters.gipHeadAdvances++;
  heads.set(
    after,
    Object.freeze({ facts: prior.facts + created, versions: prior.versions + group.writes.length }),
  );
}

/** The head one committed GIP create produces from the head before it (the seal's own commit). */
export const gipOwnerHeadAfterCreate = (before: GipOwnerHead, creates: number): GipOwnerHead => ({
  facts: before.facts + creates,
  versions: before.versions + creates,
});
