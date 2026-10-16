import type { LocusRef } from "@immortalis/contracts";
import type { FactView } from "../world/pc-locus-custody.ts";

/**
 * The independent owners' premises the v0.3 solitary class (F-1) and the individual-occupancy registration (F-3) require and that no
 * implemented owner produces yet: a COMPLETE statement that no actor or material engagement outside the delivered scene evidence
 * bears on the PC at its locus, and a SEPARATE proof that the PC lies outside the effective aggregate workforce. A Population ledger
 * proves the counted members of its own disjoint resident population and nothing about either; an omitted identity, an empty
 * presence list and an affirmative host reading are not evidence of completeness.
 *
 * A build supplies one only through its `StageOwnerExtension` (production supplies none, so every such act is WITHHELD / UNKNOWN).
 * Pure functions of the committed facts: replay and reopen re-derive the same answer from the same extension.
 */
export interface PcIndependentEvidence {
  readonly sceneComplete: (pcId: string, locality: LocusRef, facts: FactView) => boolean;
  readonly outsideAggregate: (pcId: string, locality: LocusRef, facts: FactView) => boolean;
}

const BOUND = new WeakMap<object, PcIndependentEvidence>();

/** Binds a store's independent-evidence premises (the campaign does this once, from its extension). */
export function bindIndependentEvidence(
  store: object,
  evidence: PcIndependentEvidence | undefined,
) {
  if (evidence) BOUND.set(store, evidence);
}
export const independentEvidenceOf = (store: object): PcIndependentEvidence | undefined =>
  BOUND.get(store);

/** A read-only view of `facts` that also carries the build's independent evidence (the committed facts are untouched). */
export function withIndependentEvidence<T extends object>(
  facts: T,
  evidence: PcIndependentEvidence | undefined,
): T {
  if (!evidence) return facts;
  return new Proxy(facts, {
    get(target, prop) {
      if (prop === "independent") return evidence;
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
