import {
  CultureSharedMeaningSchema,
  CultureUpdateContextSchema,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  cultureConventionStage,
  cultureSharedMeaningKey,
  cultureUpdateContextKey,
  type CommitGroup,
  type CultureUpdateContext,
} from "@immortalis/contracts";
import type { CampaignState } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey } from "../owners/registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "../owners/rejection.ts";
import { stageAuthorityViolation } from "../production/admission.ts";
import {
  canonicalBindingViolation,
  cultureAccessClassViolation,
  cultureUpdateId,
  deriveSharedMeaning,
} from "./derive.ts";

/**
 * IM-11 admission for the IM-09 Culture owner (IM-03 owner resolution; WS-005 Draft v2 §§1-4, 8; Concept v2 §§1-2, 4, 8;
 * Scaling Profile v2 §§2-4). Pure: a function of (group, state) only, so it holds for a raw `store.commit` as much as for the
 * owner path. Key-space exclusivity (nobody but `culture`/`culture_social` can write a `culture/…` key, and the Culture owner
 * can write no canonical, kernel, Population, Production, Economy, World-State, Logistics, Named-Actor, Epistemic, KTI, GIP or
 * Diplomacy key) is enforced by the owner registry before this runs; this enforces that even the Culture owner can change its
 * state in exactly two lawful ways, each create-only:
 *
 *  1. SOCIAL UPDATE CONTEXT (CS-UPD): the sealed, causally engaged input assembly of one update. The referent and scope are
 *     bound to existing canonical authority; every input is a committed non-Culture owner fact, pinned at its current
 *     version with exactly one lawful read basis; and the evidence must already establish — as exactly the Culture-defined
 *     reading, for this very referent, scope and context, agreeing on one manifestation — a continuing shared recognition.
 *     Contact, policy, packet or receipt facts, a lone contradicting reading or an absent input seal nothing. The context
 *     carries no manifestation: nothing is asserted by whoever seals it.
 *  2. SHARED MEANING / NORM, only as its IM-02 stage (the Communicative Convention Close): exactly what the sealed context
 *     and the pinned evidence determine — read NOW, in declared order — committed under the stage identity and the durable
 *     authority of an open transaction. Without a sealed context there is nothing to derive it from, so no consequence,
 *     caller or raw commit can conjure a fact.
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

function canonicalTime(state: CampaignState) {
  const clock = state.facts.get(TEMPORAL_STATE_KEY);
  const time = clock ? TemporalStateSchema.safeParse(clock.value) : undefined;
  return time?.success ? time.data.canonical_time : null;
}

/** The ordered, de-duplicated keys a context's group pins: referent, scope, then each engaged input. */
export const contextPinnedKeys = (c: CultureUpdateContext): readonly string[] => [
  ...new Set([c.referent.fact_key, c.scope.fact_key, ...c.inputs.map((i) => i.fact_key)]),
];

function checkContext(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = CultureUpdateContextSchema.safeParse(w.value);
  if (!parsed.success) return bad("the update context violates its contract", { key: w.key });
  const c = parsed.data;
  if (w.key !== cultureUpdateContextKey(c.update_id)) {
    return ref("the context is at the key derived from its update identity", { key: w.key });
  }
  const secrecy = cultureAccessClassViolation(w.secrecy);
  if (secrecy) return bad(secrecy, { key: w.key });
  if (c.update_id !== cultureUpdateId(c.referent.fact_key, c.scope.fact_key, c.context)) {
    return ref("the update identity is derived from exactly its referent, scope and context", {
      key: w.key,
    });
  }
  for (const [what, r] of [
    ["referent", c.referent],
    ["scope", c.scope],
  ] as const) {
    const binding = canonicalBindingViolation(state.facts, r, "SEAL");
    if (binding) return ref(`the ${what}: ${binding}`, { key: r.fact_key });
  }
  // the pinned facts, each at its current version and depended on (RC-07), in declared order
  const pinned = contextPinnedKeys(c);
  if (group.reads.length !== pinned.length || pinned.some((k, i) => group.reads[i]!.key !== k)) {
    return ref(
      "a context reads exactly its referent, its scope and its engaged inputs, in declared order",
      { key: w.key },
    );
  }
  for (const k of pinned) {
    const p = requirePrerequisite(group, state, k, "a sealed prerequisite");
    if (isRejection(p)) return p;
  }
  // the evidence must already establish the fact: derive from the committed inputs, writing nothing otherwise
  const evidence = [];
  for (const inp of c.inputs) {
    const f = state.facts.get(inp.fact_key);
    if (!f) {
      return reject(
        "PREREQUISITE_MISSING",
        "an engaged input is not committed; a context may not precede the evidence it seals",
        { key: inp.fact_key },
      );
    }
    evidence.push({ key: f.key, owner: f.owner, version: f.version, value: f.value as unknown });
  }
  const derived = deriveSharedMeaning({
    context: { key: w.key, owner: w.owner, version: 1, value: c },
    evidence,
  });
  if (!derived.ok) return ref(derived.error.message, { key: w.key, code: derived.error.code });
  return null;
}

function checkMeaning(group: CommitGroup, state: CampaignState, w: Write): Rejection | null {
  const parsed = CultureSharedMeaningSchema.safeParse(w.value);
  if (!parsed.success) return bad("the shared meaning violates its contract", { key: w.key });
  const meaning = parsed.data;
  if (w.key !== cultureSharedMeaningKey(meaning.update_id)) {
    return ref("the shared meaning is at the key derived from its update identity", {
      key: w.key,
    });
  }
  const secrecy = cultureAccessClassViolation(w.secrecy);
  if (secrecy) return bad(secrecy, { key: w.key });
  const contextKey = cultureUpdateContextKey(meaning.update_id);
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
  for (const [what, r] of [
    ["referent", c.referent],
    ["scope", c.scope],
  ] as const) {
    const binding = canonicalBindingViolation(state.facts, r, "HISTORY");
    if (binding) return ref(`the ${what}: ${binding}`, { key: r.fact_key });
  }
  // exactly the declared reads, in declared order, each at its current version and depended on (RC-07)
  const expected = [contextKey, ...c.inputs.map((i) => i.fact_key)];
  if (
    group.reads.length !== expected.length ||
    expected.some((k, i) => group.reads[i]!.key !== k) ||
    expected.some((k, i) => {
      const f = state.facts.get(k);
      return (
        !f || group.reads[i]!.version !== f.version || group.depends_on[i] !== f.provenance.group_id
      );
    })
  ) {
    return ref(
      "a Communicative Convention Close reads exactly its sealed context and its engaged inputs (AS-OF-NOW, after their owners' commits), each at its current version",
      { key: w.key },
    );
  }
  const derived = deriveSharedMeaning({
    context: {
      key: contextFact.key,
      owner: contextFact.owner,
      version: contextFact.version,
      value: c,
    },
    evidence: c.inputs.map((i) => {
      const f = state.facts.get(i.fact_key)!;
      return { key: f.key, owner: f.owner, version: f.version, value: f.value as unknown };
    }),
  });
  if (!derived.ok) return bad(derived.error.message, { key: w.key });
  if (!canonicalEqual(derived.value, meaning)) {
    return bad(
      "a shared meaning is exactly what its sealed context and pinned evidence determine: a Culture-owned, established fact that references them, with no other state",
      { key: w.key },
    );
  }
  const now = canonicalTime(state);
  if (!now) {
    return reject("PREREQUISITE_MISSING", "no canonical temporal basis is established", {
      key: TEMPORAL_STATE_KEY,
    });
  }
  const identity = stageAuthorityViolation(
    group,
    cultureConventionStage(meaning.update_id),
    state.facts,
    now,
    "ADMISSION",
  );
  if (identity) return ref(identity, { key: w.key });
  return null;
}
