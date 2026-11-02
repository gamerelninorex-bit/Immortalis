import {
  ActorPhysicalPresenceSchema,
  ActorSetupPlacementSchema,
  ExistingActorCouplingSchema,
  InitialLocalityCompletionSchema,
  InitialSetupInputSchema,
  WorldSourceConditionSchema,
  WorldSourceDeliverySchema,
  compareTime,
  worldLocusKey,
  worldProfileKey,
  type CanonicalTime,
  type InitialLocalityCompletion,
  type InitialSetupInput,
  type OwnerFact,
  type WorldSourceCondition,
  type WorldSourceDelivery,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
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

/**
 * The DIRECT comparison of the selected source's stable fields (source_key, locality, dimension, material_class, depth, establishment,
 * access_facts) with the canonical Input baseline (companion: "for selected-source stable fields use the canonical Input baseline";
 * "no receipt/journal ordering query, widened WriteAdmission interface or new OwnerFact/state-file field").
 *
 * The Input commits the baseline as `projection_hash = SHA256(canonicalJson([{fact_key, version, value}…]))` over its pinned genesis
 * facts. Every genesis kind is SEALED (version 1, never rewritten) except the Source Condition, whose only lawful later versions are
 * World-State deliveries — each recorded once as a `world_source_delivery` fact that states the version it advanced from and to and
 * the quantity it moved. So the source value AT THE PINNED VERSION is reconstructed from canonical committed facts alone: take the
 * current value and un-apply the recorded, contiguous delivery chain (drop the delivery entries, restore their quantity to
 * `recoverable`, clear an exhaustion that a removed delivery caused). That value, with the other pinned facts at their pinned versions,
 * must reproduce the Input's `projection_hash` exactly. Because the reconstruction un-applies ONLY recoverable/delivered/exhaustion,
 * lawful drawdown variation passes, while a changed stable value — at the pinned version or an otherwise greater one — cannot
 * reproduce the committed baseline and withholds. A later version with no (or a non-contiguous, or inconsistent) recorded delivery
 * chain is unverifiable and withholds. Returns null when the baseline is reproduced, else the reason it is not.
 */
function sourceBaselineViolation(
  input: InitialSetupInput,
  facts: ReadonlyMap<string, OwnerFact>,
): string | null {
  const pin = input.source;
  const current = facts.get(pin.fact_key);
  if (!current) return "the Input's selected source is not committed in the prefix";
  if (current.version < pin.version)
    return "the selected source is older than the version the Input pinned";
  const parsed = WorldSourceConditionSchema.safeParse(current.value);
  if (!parsed.success) return "the selected source violates its own contract";
  const baseline = reconstructPinnedSource(current, parsed.data, pin.version, facts);
  if (typeof baseline === "string") return baseline;
  const projected: { fact_key: string; version: number; value: unknown }[] = [];
  for (const p of input.genesis) {
    if (p.fact_key === pin.fact_key) {
      projected.push({ fact_key: p.fact_key, version: p.version, value: baseline });
      continue;
    }
    const f = facts.get(p.fact_key);
    if (!f || f.version !== p.version)
      return `the pinned genesis fact ${p.fact_key} is absent or is not at its pinned version`;
    projected.push({ fact_key: p.fact_key, version: p.version, value: f.value });
  }
  projected.sort((a, b) => (a.fact_key < b.fact_key ? -1 : a.fact_key > b.fact_key ? 1 : 0));
  return sha256Canonical(projected) === input.projection_hash
    ? null
    : "a stable field of the selected source differs from the canonical Input baseline";
}

/** The value the source had at `pinnedVersion`, from the current value and the recorded delivery chain; a string is the reason it cannot be. */
function reconstructPinnedSource(
  current: OwnerFact,
  value: WorldSourceCondition,
  pinnedVersion: number,
  facts: ReadonlyMap<string, OwnerFact>,
): WorldSourceCondition | string {
  if (current.version === pinnedVersion) return value;
  const steps = new Map<number, WorldSourceDelivery>();
  const prefix = `world/${value.locality.world.entity_id}/source-delivery/`;
  for (const f of facts.values()) {
    if (!f.key.startsWith(prefix)) continue;
    const d = WorldSourceDeliverySchema.safeParse(f.value);
    if (!d.success || d.data.source.fact_key !== current.key) continue;
    if (
      d.data.source.version_before < pinnedVersion ||
      d.data.source.version_after > current.version ||
      steps.has(d.data.source.version_before)
    )
      continue;
    steps.set(d.data.source.version_before, d.data);
  }
  let recoverable = value.recoverable.amount;
  const removed = new Set<string>();
  const unit = value.establishment.quantity.unit;
  for (let v = pinnedVersion; v < current.version; v++) {
    const d = steps.get(v);
    if (!d || d.source.version_after !== v + 1 || d.delivered.unit !== unit)
      return "the selected source advanced without a contiguous recorded delivery chain from the pinned version";
    const entry = value.delivered.find((x) => x.delivery_id === d.delivery_id);
    if (!entry || entry.quantity.amount !== d.delivered.amount || entry.quantity.unit !== unit)
      return "a recorded delivery is not the entry the selected source carries";
    removed.add(d.delivery_id);
    recoverable += d.delivered.amount;
  }
  const exhaustion =
    value.exhaustion && removed.has(value.exhaustion.delivery_id) ? null : value.exhaustion;
  const rebuilt = WorldSourceConditionSchema.safeParse({
    ...value,
    recoverable: { ...value.recoverable, amount: recoverable },
    delivered: value.delivered.filter((x) => !removed.has(x.delivery_id)),
    exhaustion,
  });
  return rebuilt.success
    ? rebuilt.data
    : "the selected source's pinned value cannot be reconstructed consistently";
}

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
        if (fact.key === input.data.source.fact_key) {
          const changed = sourceBaselineViolation(input.data, facts);
          if (changed !== null) return withhold("SELECTED_SOURCE_CHANGED", changed, fact.key);
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
