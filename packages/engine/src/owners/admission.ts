import {
  PlayerCharacterBindingSchema,
  WorldLocusSchema,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type Failure,
  type OwnerFact,
} from "@immortalis/contracts";
import type { CampaignState, CommitErrorCode, WriteAdmission } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { resolveKey, type FactKind } from "./registry.ts";

type Rejection = Failure<CommitErrorCode>;
const reject = (
  code: CommitErrorCode,
  message: string,
  details?: Record<string, unknown>,
): Rejection => (details === undefined ? { code, message } : { code, message, details });

/**
 * What a group must pin about a foreign fact it references (RC-07 expected source/input versions,
 * group dependencies): a `reads` entry at the fact's current version and a `depends_on` entry for
 * the group that committed it. Returns a rejection or null.
 */
function requirePrerequisite(
  group: CommitGroup,
  state: CampaignState,
  key: string,
  what: string,
): { fact: OwnerFact } | Rejection {
  const fact = state.facts.get(key);
  if (!fact) {
    return reject(
      "PREREQUISITE_MISSING",
      `${what} is not committed; a dependent write may not precede or create its prerequisite`,
      { key },
    );
  }
  if (!group.reads.some((r) => r.key === key && r.version === fact.version)) {
    return reject("REFERENCE_INVALID", `the group must read ${what} at its current version`, {
      key,
      version: fact.version,
    });
  }
  if (!group.depends_on.includes(fact.provenance.group_id)) {
    return reject(
      "REFERENCE_INVALID",
      `the group must depend on the group that committed ${what}`,
      {
        key,
        group_id: fact.provenance.group_id,
      },
    );
  }
  return { fact };
}

const isRejection = (r: { fact: OwnerFact } | Rejection): r is Rejection => "code" in r;

function checkLocus(group: CommitGroup, state: CampaignState, key: string, value: unknown) {
  const locus = WorldLocusSchema.parse(value);
  const worldKey = worldProfileKey(locus.world.entity_id);
  if (
    locus.world.fact_key !== worldKey ||
    key !== worldLocusKey(locus.world.entity_id, locus.locus_id)
  ) {
    return reject("REFERENCE_INVALID", "locus world reference does not match its key identity", {
      key,
    });
  }
  const world = requirePrerequisite(group, state, worldKey, "the world profile");
  return isRejection(world) ? world : null;
}

function checkBinding(group: CommitGroup, state: CampaignState, value: unknown) {
  const b = PlayerCharacterBindingSchema.parse(value);
  const pcKey = pcExistenceContractKey(b.active_pc.entity_id);
  const worldKey = worldProfileKey(b.coupling.world.entity_id);
  const locusKey = worldLocusKey(b.coupling.world.entity_id, b.coupling.locus.entity_id);
  if (
    b.active_pc.fact_key !== pcKey ||
    b.coupling.world.fact_key !== worldKey ||
    b.coupling.locus.fact_key !== locusKey
  ) {
    return reject("REFERENCE_INVALID", "binding references do not match their key identities");
  }
  // Prerequisites are checked in dependency order: PC and world before the locus that hangs off it.
  const pc = requirePrerequisite(group, state, pcKey, "the released PC existence contract");
  if (isRejection(pc)) return pc;
  const world = requirePrerequisite(group, state, worldKey, "the world profile");
  if (isRejection(world)) return world;
  const locus = requirePrerequisite(group, state, locusKey, "the world locus");
  if (isRejection(locus)) return locus;
  // The locus must be a locus of the bound world (its own committed reference, not the caller's word).
  const committed = WorldLocusSchema.safeParse(locus.fact.value);
  if (!committed.success || !canonicalEqual(committed.data.world, b.coupling.world)) {
    return reject("REFERENCE_INVALID", "the locus does not belong to the world being coupled", {
      key: locusKey,
    });
  }
  return null;
}

/**
 * IM-03 admission for the Canonical World Identity & Owner Foundation. For every write it enforces:
 *
 *  1. Key space: the key belongs to exactly one registered fact kind and that kind's owner/facet is
 *     the group's. There is no fallback owner (IA-03, RC-02).
 *  2. Typed value: the value satisfies the kind's strict schema, and the identity embedded in the
 *     key is the identity inside the value (stable canonical identity).
 *  3. Sealed canon: these kinds are create-only. Overwriting a sealed world baseline, a released
 *     Existence Contract or the binding needs an owner-defined amendment/transition mechanism
 *     (WG seal; I-002 Intrinsic Amendment Event; IR transitions) that is not implemented.
 *  4. Dependency direction: a locus needs its world; the binding needs the PC contract, the world
 *     and the locus — all already committed, read at their current versions, and depended upon. The
 *     binding group writes only the binding, so it cannot create its own prerequisites (IR: "Binding
 *     cannot feed backward to create its own prerequisite").
 *
 * Pure: a function of (group, state) only.
 */
export const canonicalAdmission: WriteAdmission = {
  check(group, state) {
    for (const w of group.writes) {
      const resolved = resolveKey(w.key);
      if (!resolved) {
        return reject(
          "KEY_NOT_ADMITTED",
          "key is outside every registered key space; there is no fallback owner",
          {
            key: w.key,
          },
        );
      }
      const { kind, ids } = resolved;
      if (kind.owner !== w.owner || kind.facet !== w.facet) {
        return reject("KEY_NOT_ADMITTED", "key belongs to a different owner/facet", {
          key: w.key,
          owner: kind.owner,
          facet: kind.facet,
        });
      }
      if (w.expected_version !== 0) {
        return reject(
          "AMENDMENT_NOT_SUPPORTED",
          "sealed canon cannot be overwritten; no amendment mechanism is implemented",
          { key: w.key },
        );
      }
      const parsed = kind.valueSchema.safeParse(w.value);
      if (!parsed.success) {
        return reject("VALUE_INVALID", `value violates the ${kind.id} contract`, {
          key: w.key,
          issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
        });
      }
      const mismatch = identityMismatch(kind, ids, parsed.data);
      if (mismatch) return reject("VALUE_INVALID", mismatch, { key: w.key });
      const dependent = dependencyCheck(kind, group, state, w.key, parsed.data);
      if (dependent) return dependent;
    }
    return null;
  },
};

export function identityMismatch(
  kind: FactKind,
  ids: readonly string[],
  value: unknown,
): string | null {
  const v = value as Record<string, unknown>;
  switch (kind.id) {
    case "world_profile":
      return v["world_id"] === ids[0] ? null : "world_id does not match the key";
    case "world_locus":
      return v["locus_id"] === ids[1] && (v["world"] as { entity_id: string }).entity_id === ids[0]
        ? null
        : "locus identity does not match the key";
    case "pc_existence_contract":
      return v["pc_id"] === ids[0] ? null : "pc_id does not match the key";
    case "player_character_binding":
      return null;
  }
}

function dependencyCheck(
  kind: FactKind,
  group: CommitGroup,
  state: CampaignState,
  key: string,
  value: unknown,
): Rejection | null {
  switch (kind.id) {
    case "world_locus":
      return checkLocus(group, state, key, value);
    case "player_character_binding":
      return checkBinding(group, state, value);
    default:
      return null;
  }
}
