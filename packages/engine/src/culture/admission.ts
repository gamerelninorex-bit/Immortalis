import {
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  cjaDecisionKey,
  cultureConventionStage,
  cultureContextCause,
  cultureContextGroupId,
  cultureContextIntentId,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  type CommitGroup,
  type CultureUpdateContext,
  type OwnerFact,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  canonicalBindingViolation,
  contextPinnedKeys,
  cultureAccessClassViolation,
  cultureContextViolation,
  deriveSharedMeaning,
  type CultureFact,
} from "./derive.ts";
import { canonicalTimeOf, populationScopeViolation } from "./population-scope.ts";

/**
 * IM-11 admission for the IM-09 Culture owner (IM-03 owner resolution; WS-005 Draft v2 §§1-4, 8; Concept v2 §§1-2, 4, 8;
 * Scaling Profile v2 §§2-4; merged F-027-CJA1). Pure: a function of (group, state) only, so it holds for a raw `store.commit`
 * as much as for the owner path. Key-space exclusivity (nobody but `culture`/`culture_social` can write a `culture/…` key) is
 * enforced by the owner registry before this runs; this enforces that even the Culture owner can change its state in exactly
 * two lawful ways, each create-only:
 *
 *  1. SOCIAL UPDATE CONTEXT (CS-UPD): the sealed, causally engaged, OUTCOME-NEUTRAL input assembly of one update. The referent
 *     and scope are bound to existing canonical authority; every input is a committed foreign fact, pinned at its current
 *     version and committing group with the one registered read basis; the Cohort scope holds at the NAMED Population close
 *     AT SEAL (re-derived from committed Population state — a forged, stand-in, stale or due-but-unreconciled binding fails).
 *     NOTHING about what the sources establish is judged here: negative, contradictory and not-probative sources are lawful
 *     context, and no conclusion-shaped flag exists to check.
 *  2. SHARED MEANING / NORM, only as its IM-02 stage (the Communicative Convention Close): exactly what the sealed context and
 *     the ONE committed ESTABLISH_SUPPORTED adjudication decision determine — those are its ONLY two reads, both NOW. No
 *     foreign source, trigger or Cohort is read at the close, so later source or Population churn cannot strand it. Without a
 *     context and a positive decision there is nothing to derive it from, so no consequence, caller or raw commit can conjure
 *     a fact.
 */
export function cultureGroupCheck(group: CommitGroup, state: CampaignState): Rejection | null {
  const kindOf = (key: string) => resolveKey(key)?.kind.id;
  if (group.writes.length === 1 && group.writes[0]!.expected_version === 0) {
    const w = group.writes[0]!;
    if (kindOf(w.key) === "culture_update_context") return checkContext(group, state, w);
    if (kindOf(w.key) === "culture_shared_meaning") return checkMeaning(group, state, w);
  }
  return reject(
    "VALUE_INVALID",
    "Culture state changes only by one sealed Social Update Context or one Communicative Convention Close, each created once",
  );
}

type Write = CommitGroup["writes"][number];

const bad = (message: string, details?: Record<string, unknown>) =>
  reject("VALUE_INVALID", message, details);
const ref = (message: string, details?: Record<string, unknown>) =>
  reject("REFERENCE_INVALID", message, details);

export { contextPinnedKeys };

function checkContext(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = CultureUpdateContextSchema.safeParse(w.value);
  if (!parsed.success) return bad("the update context violates its contract", { key: w.key });
  const c: CultureUpdateContext = parsed.data;
  if (w.key !== cultureUpdateContextKey(c.update_id)) {
    return ref("the context is at the key derived from its update identity", { key: w.key });
  }
  const secrecy = cultureAccessClassViolation(w.secrecy);
  if (secrecy) return bad(secrecy, { key: w.key });
  if (
    group.group_id !== cultureContextGroupId(c.update_id) ||
    group.intent_id !== cultureContextIntentId(c.update_id) ||
    group.cause !== cultureContextCause(c.update_id)
  ) {
    return ref(
      "the group and intent identities are the deterministic RC-16 identities of the update",
      {
        key: w.key,
      },
    );
  }
  const own = cultureContextViolation(c);
  if (own) return ref(own, { key: w.key });
  for (const [what, k] of [
    ["referent", c.distinction.referent_key],
    ["scope", c.distinction.scope_key],
  ] as const) {
    const binding = canonicalBindingViolation(state.facts, k);
    if (binding) return ref(`the ${what}: ${binding}`, { key: k });
  }
  // every engaged input is the committed fact at the version and group the context cites: the trigger and the observations
  // were independently committed BEFORE the context, and a context cannot cite a fact that does not exist
  for (const i of c.inputs) {
    const f = state.facts.get(i.fact_key);
    if (!f) {
      return reject(
        "PREREQUISITE_MISSING",
        "an engaged input is not committed; a context may not precede the evidence it seals",
        { key: i.fact_key },
      );
    }
    if (
      f.owner !== i.owner ||
      f.version !== i.version ||
      f.provenance.group_id !== i.committed_by_group_id
    ) {
      return ref(
        "an input is the committed fact of its owner at the version and committing group the context cites",
        { key: i.fact_key },
      );
    }
  }
  // the Cohort scope holds at the named Population close AT SEAL, re-derived from committed Population state
  const now = canonicalTimeOf((k) => state.facts.get(k));
  if (!now) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: w.key,
    });
  }
  const scope = populationScopeViolation((k) => state.facts.get(k), c.constituency, now);
  if (scope) return ref(scope, { key: c.constituency.cohort_fact_key });
  // the pinned facts, each at its current version and depended on (RC-07), in declared order
  const pinned = contextPinnedKeys(c);
  if (group.reads.length !== pinned.length || pinned.some((k, i) => group.reads[i]!.key !== k)) {
    return ref(
      "a context reads exactly its referent, its scope, its engaged inputs and its Cohort, in declared order",
      { key: w.key },
    );
  }
  for (const k of pinned) {
    const p = requirePrerequisite(group, state, k, "a sealed prerequisite");
    if (isRejection(p)) return p;
  }
  return null;
}

/** The committed fact as the Culture derivations read it. */
export const cultureFactOf = <T>(f: OwnerFact, value: T): CultureFact<T> => ({
  key: f.key,
  owner: f.owner,
  version: f.version,
  group_id: f.provenance.group_id,
  value,
});

function checkMeaning(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = CultureSharedMeaningSchema.safeParse(w.value);
  if (!parsed.success) return bad("the shared meaning violates its contract", { key: w.key });
  const meaning = parsed.data;
  if (w.key !== cultureSharedMeaningKey(meaning.slot_id)) {
    return ref("the shared meaning is at the key derived from its state slot", { key: w.key });
  }
  const secrecy = cultureAccessClassViolation(w.secrecy);
  if (secrecy) return bad(secrecy, { key: w.key });
  const contextKey = cultureUpdateContextKey(meaning.establishment.update_id);
  const contextFact = state.facts.get(contextKey);
  if (!contextFact) {
    return reject(
      "PREREQUISITE_MISSING",
      "a shared meaning is committed only from a sealed context: a social fact cannot be conjured",
      { key: contextKey },
    );
  }
  const context = CultureUpdateContextSchema.safeParse(contextFact.value);
  if (!context.success) return bad("the context violates its contract", { key: contextKey });
  const c = context.data;
  const decisionKey = cjaDecisionKey(c.update_id);
  const decisionFact = state.facts.get(decisionKey);
  if (!decisionFact) {
    return reject(
      "PREREQUISITE_MISSING",
      "a shared meaning is committed only from a committed adjudication decision: no decision, no Culture fact",
      { key: decisionKey },
    );
  }
  // exactly the TWO declared reads, in declared order, each at its current version and depended on (RC-07): nothing foreign
  // is read at the close
  const expected = [contextKey, decisionKey];
  if (
    group.reads.length !== 2 ||
    expected.some((k, i) => group.reads[i]!.key !== k) ||
    expected.some((k, i) => {
      const f = state.facts.get(k)!;
      return group.reads[i]!.version !== f.version || group.depends_on[i] !== f.provenance.group_id;
    })
  ) {
    return ref(
      "a Communicative Convention Close reads exactly its sealed context and its committed adjudication decision (AS-OF-NOW), each at its current version",
      { key: w.key },
    );
  }
  for (const [what, k] of [
    ["referent", c.distinction.referent_key],
    ["scope", c.distinction.scope_key],
  ] as const) {
    const binding = canonicalBindingViolation(state.facts, k);
    if (binding) return ref(`the ${what}: ${binding}`, { key: k });
  }
  const derived = deriveSharedMeaning({
    context: cultureFactOf(contextFact, c),
    decision: cultureFactOf(decisionFact, decisionFact.value as unknown),
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key, code: derived.error.code });
  if (!canonicalEqual(derived.value, meaning)) {
    return bad(
      "a shared meaning is exactly what its sealed context and its committed ESTABLISH_SUPPORTED decision determine: a Culture-owned, established fact that references them, with no other state",
      { key: w.key },
    );
  }
  // the slot is created once: occupied-slot evolution is deferred, so a later update never overwrites it (create-only write)
  const now = canonicalTimeOf((k) => state.facts.get(k));
  if (!now) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: w.key,
    });
  }
  const identity = stageAuthorityViolation(
    group,
    cultureConventionStage(c.update_id, c.slot_id),
    state.facts,
    now,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: w.key });
  return null;
}
