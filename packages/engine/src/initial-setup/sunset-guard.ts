import {
  ActorPhysicalPresenceSchema,
  ActorSetupPlacementSchema,
  ExistingActorCouplingSchema,
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  WorldSourceConditionSchema,
  compareTime,
  worldLocusKey,
  worldProfileKey,
  type CanonicalTime,
  type InitialLocalityCompletion,
  type OwnerFact,
} from "@immortalis/contracts";
import { resolveKey } from "../owners/registry.ts";
import { BOOTSTRAP_SUNSET_POLICY_V9, type SunsetPolicyRow } from "./sunset-policy.ts";

/**
 * The as-of qualification of the OPTION_A_V9 Initial Scene Exception (Initial Locality Bootstrap v0.9 companion, "CPAA Projection and
 * Canonical Sunset"). `qualifies(completion, prefix, occupied)` is a PURE function of one committed historical PREFIX — exactly the
 * facts committed immediately before the publication being admitted — and that publication's effective occupied interval. At sequential
 * replay the same prefix is reconstructed; a historical action is NEVER evaluated against the final journal head, current
 * configuration or a later snapshot, so a later contradiction can withhold a later action without rewriting earlier truth.
 *
 * Presence from the validated Input: the closed genesis whitelist excludes every END_NON_PC and UNREVIEWED_BLOCK kind (and every
 * unlisted kind), so any such kind present in a qualified prefix was introduced AFTER Input entry. No per-fact commit revision, receipt
 * ordering lookup or new state-file field is consulted. A fact introduced between Input and Completion is part of the same actual
 * prefix and withholds the very first optional projection; the freeze is not relied on to hide that window.
 *
 * Fail closed: an unreviewed kind, a runtime-unknown key, a malformed or unverifiable END reference, a changed selected key or a
 * changed stable source field all WITHHOLD. Withholding never rejects another owner's lawful write and never erases canon.
 */
export type QualificationCode =
  | "QUALIFIED"
  | "NO_COMPLETION"
  | "UNREVIEWED_KIND_PRESENT"
  | "UNKNOWN_KIND_PRESENT"
  | "NON_PC_PLACEMENT"
  | "NON_PC_PRESENCE"
  | "NON_PC_COUPLING"
  | "MALFORMED_REFERENCE"
  | "SELECTED_KEY_CHANGED"
  | "SELECTED_SOURCE_CHANGED"
  | "INTERVAL_UNIT_MISMATCH"
  | "INTERVAL_OUTSIDE_COVERAGE";

export interface Qualification {
  readonly qualified: boolean;
  readonly code: QualificationCode;
  readonly message: string;
  readonly key?: string;
}

export interface OccupiedInterval {
  readonly begin: CanonicalTime;
  readonly finish: CanonicalTime;
}

const POLICY_BY_KIND: ReadonlyMap<string, SunsetPolicyRow> = new Map(
  BOOTSTRAP_SUNSET_POLICY_V9.map((r) => [r.kind, r]),
);

/** The reviewed policy row of a kind, or undefined for a kind with no row (which withholds). */
export const sunsetPolicyOf = (kindId: string): SunsetPolicyRow | undefined =>
  POLICY_BY_KIND.get(kindId);

interface Ref {
  readonly entity_id: string;
  readonly fact_key: string;
}
const withhold = (code: QualificationCode, message: string, key?: string): Qualification => ({
  qualified: false,
  code,
  message,
  ...(key === undefined ? {} : { key }),
});

/**
 * `sameSelectedRefs(w, l, C)`: the exact key/identity conjunction of the END_NON_PC predicates — never display-name matching or
 * adapter-normalized text. Keys use the existing contract helpers.
 */
export const sameSelectedRefs = (
  w: Ref,
  l: Ref,
  c: Pick<InitialLocalityCompletion, "world_id" | "locus_id">,
): boolean =>
  w.entity_id === c.world_id &&
  w.fact_key === worldProfileKey(c.world_id) &&
  l.entity_id === c.locus_id &&
  l.fact_key === worldLocusKey(c.world_id, c.locus_id);

/**
 * A reference must be internally consistent (its fact_key is the helper-derived key of its own identity) and verifiable (the world
 * and locus it names are committed in the prefix). Malformed or unverifiable references FAIL qualification: they are not an
 * "unrelated" no-effect result. A fully valid reference to another world or locus has no direct END effect.
 */
function malformedReferences(w: Ref, l: Ref, facts: ReadonlyMap<string, OwnerFact>): string | null {
  if (w.fact_key !== worldProfileKey(w.entity_id))
    return "the world reference's fact_key disagrees with its own identity";
  if (l.fact_key !== worldLocusKey(w.entity_id, l.entity_id))
    return "the locus reference's fact_key disagrees with its own identity";
  if (!facts.has(w.fact_key) || !facts.has(l.fact_key))
    return "the referenced world or locus source cannot be verified in the prefix";
  return null;
}

/** The stable fields of a Source Condition: lawful recoverable/delivered/exhaustion changes are NOT among them. */
const sourceIsStable = (
  current: OwnerFact,
  pinnedVersion: number,
  selected: { world_id: string; locus_id: string },
): boolean => {
  const parsed = WorldSourceConditionSchema.safeParse(current.value);
  if (!parsed.success) return false;
  const v = parsed.data;
  if (
    v.locality.world.entity_id !== selected.world_id ||
    v.locality.locus.entity_id !== selected.locus_id
  )
    return false;
  // an unchanged version is trivially stable; a later version is lawful only as an owner-checked delivery (World-State's source
  // owner refuses any change to the stable fields, and replay re-verifies it), which leaves these fields as established
  return current.version >= pinnedVersion;
};

/**
 * The guard visits every fact of the actual prefix at each dependent admission, so resolving a key against all registered key spaces
 * would dominate its cost. A committed fact is immutable, so its kind is cached on the fact object itself (a WeakMap: no growth beyond the
 * facts alive, nothing shared between campaigns). A key outside every key space caches as `null` and still withholds as UNKNOWN.
 */
const KIND_OF = new WeakMap<object, string | null>();
function kindIdOf(fact: OwnerFact): string | undefined {
  const hit = KIND_OF.get(fact);
  if (hit !== undefined) return hit ?? undefined;
  const id = resolveKey(fact.key)?.kind.id ?? null;
  KIND_OF.set(fact, id);
  return id ?? undefined;
}

export function qualifies(
  completion: InitialLocalityCompletion,
  facts: ReadonlyMap<string, OwnerFact>,
  occupied: OccupiedInterval | null,
): Qualification {
  const inputFact = facts.get(completion.input.fact_key);
  const input = inputFact ? InitialSetupInputSchema.safeParse(inputFact.value) : undefined;
  if (!inputFact || !input?.success || inputFact.version !== completion.input.version)
    return withhold(
      "NO_COMPLETION",
      "the Completion's own Input is not committed at its pinned version",
    );
  const genesisVersion = new Map(input.data.genesis.map((p) => [p.fact_key, p.version]));
  const selectedWorldKey = worldProfileKey(completion.world_id);
  const selectedLocusKey = worldLocusKey(completion.world_id, completion.locus_id);
  const selectedSource = completion.selection.source_claims[0]?.source;

  for (const fact of facts.values()) {
    const kind = kindIdOf(fact);
    if (kind === undefined)
      return withhold(
        "UNKNOWN_KIND_PRESENT",
        "a runtime-unknown kind is present: it withholds as UNREVIEWED_BLOCK",
        fact.key,
      );
    const row = POLICY_BY_KIND.get(kind);
    if (row === undefined)
      return withhold(
        "UNREVIEWED_KIND_PRESENT",
        "a registered kind has no reviewed policy row: it withholds",
        fact.key,
      );
    switch (row.policy) {
      case "UNREVIEWED_BLOCK":
        return withhold(
          "UNREVIEWED_KIND_PRESENT",
          `a ${kind} fact is present: its effect has no reviewed policy, so the bounded exception is withheld`,
          fact.key,
        );
      case "END_NON_PC_PRESENCE":
      case "END_NON_PC_PLACEMENT":
      case "END_NON_PC_COUPLING": {
        const refs = ((): { w: Ref; l: Ref } | null => {
          if (row.policy === "END_NON_PC_PRESENCE") {
            const p = ActorPhysicalPresenceSchema.safeParse(fact.value);
            return p.success ? { w: p.data.world, l: p.data.locus } : null;
          }
          if (row.policy === "END_NON_PC_PLACEMENT") {
            const p = ActorSetupPlacementSchema.safeParse(fact.value);
            return p.success ? { w: p.data.world, l: p.data.locus } : null;
          }
          const p = ExistingActorCouplingSchema.safeParse(fact.value);
          return p.success ? { w: p.data.coupling.world, l: p.data.coupling.locus } : null;
        })();
        if (!refs)
          return withhold(
            "MALFORMED_REFERENCE",
            `a ${kind} fact violates its own contract`,
            fact.key,
          );
        const bad = malformedReferences(refs.w, refs.l, facts);
        if (bad) return withhold("MALFORMED_REFERENCE", bad, fact.key);
        if (sameSelectedRefs(refs.w, refs.l, completion))
          return withhold(
            row.policy === "END_NON_PC_PRESENCE"
              ? "NON_PC_PRESENCE"
              : row.policy === "END_NON_PC_PLACEMENT"
                ? "NON_PC_PLACEMENT"
                : "NON_PC_COUPLING",
            `a non-PC ${kind} at the selected world and locus ends the exception`,
            fact.key,
          );
        break;
      }
      case "SELECTED_KEY_UNCHANGED":
        if (fact.key === selectedWorldKey || fact.key === selectedLocusKey) {
          if (fact.version !== genesisVersion.get(fact.key))
            return withhold(
              "SELECTED_KEY_CHANGED",
              "the selected world or locus key changed after the Input: the Completion basis is invalid",
              fact.key,
            );
        }
        break;
      case "SELECTED_SOURCE_FIELDS":
        if (selectedSource && fact.key === selectedSource.fact_key) {
          if (
            !sourceIsStable(fact, selectedSource.version, {
              world_id: completion.world_id,
              locus_id: completion.locus_id,
            })
          )
            return withhold(
              "SELECTED_SOURCE_CHANGED",
              "a stable field of the selected source changed after the Input",
              fact.key,
            );
        }
        break;
      default:
        // OWNER_CHECKS_ONLY, RECHECK_POPULATION, RECHECK_PC_STANDING, RECHECK_SCENE: no direct presence/rights sunset here. The
        // owners' own admission re-derives currentness, standing and conservation; OWNER_CHECKS_ONLY is never an eligibility grant.
        break;
    }
  }

  if (occupied) {
    const { start, end } = completion.selection.coverage;
    if (
      occupied.begin.unit !== start.unit ||
      occupied.finish.unit !== start.unit ||
      end.unit !== start.unit
    )
      return withhold(
        "INTERVAL_UNIT_MISMATCH",
        "the occupied interval is in another unit than the authored coverage",
      );
    const beginVsStart = compareTime(occupied.begin, start);
    const beginVsFinish = compareTime(occupied.begin, occupied.finish);
    const finishVsEnd = compareTime(occupied.finish, end);
    // [begin, finish) must satisfy start <= begin < finish <= end: no new work starts at end; work finishing exactly at end fits
    if (beginVsStart === null || beginVsFinish === null || finishVsEnd === null)
      return withhold(
        "INTERVAL_UNIT_MISMATCH",
        "the occupied interval is not comparable with the coverage",
      );
    if (beginVsStart < 0 || beginVsFinish >= 0 || finishVsEnd > 0)
      return withhold(
        "INTERVAL_OUTSIDE_COVERAGE",
        "the full occupied interval does not fit the authored coverage: it is never extended, shortened or substituted",
      );
  }
  return { qualified: true, code: "QUALIFIED", message: "the exception qualifies at this prefix" };
}

/** Parses a committed Completion fact for the guard (returns null when it is not a valid Completion). */
export const completionOf = (fact: OwnerFact | undefined): InitialLocalityCompletion | null => {
  if (!fact) return null;
  const p = InitialLocalityCompletionSchema.safeParse(fact.value);
  return p.success ? p.data : null;
};

/**
 * The executable completeness guard of the policy (companion: "Completeness is an executable test obligation, not a default-expansion
 * procedure"). It compares the EXACT ID sets of the registry and the policy, rejecting duplicate registry IDs BEFORE forming a set,
 * duplicate policy rows, every missing or extra/nonexistent key, and every row whose policy differs from the independently reviewed
 * table. It never synthesizes a missing row (a missing row is a validation failure, never an implicit UNREVIEWED_BLOCK), and an
 * unauthorized permissive change to a blocking row fails the reviewed-policy comparison. Pure; returns the list of violations.
 */
export function policyCoverageViolations(
  rows: readonly SunsetPolicyRow[],
  registryIds: readonly string[],
  reviewed: Readonly<Record<string, string>>,
): string[] {
  const out: string[] = [];
  const dup = (items: readonly string[]): string[] =>
    items.filter((x, i) => items.indexOf(x) !== i);
  for (const d of new Set(dup(registryIds))) out.push(`duplicate registry id ${d}`);
  const kinds = rows.map((r) => r.kind);
  for (const d of new Set(dup(kinds))) out.push(`duplicate policy row ${d}`);
  const reg = new Set(registryIds);
  const pol = new Set(kinds);
  for (const id of [...reg].sort())
    if (!pol.has(id)) out.push(`registered kind ${id} has no policy row`);
  for (const k of [...pol].sort())
    if (!reg.has(k)) out.push(`policy row ${k} names no registered kind`);
  for (const r of rows) {
    const want = reviewed[r.kind];
    if (want === undefined) out.push(`policy row ${r.kind} is not in the reviewed table`);
    else if (want !== r.policy)
      out.push(`policy row ${r.kind} is ${r.policy}, the reviewed policy is ${want}`);
  }
  for (const k of Object.keys(reviewed))
    if (!pol.has(k)) out.push(`reviewed row ${k} is missing from the policy`);
  return out;
}
