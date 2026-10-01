import {
  ExistenceContractSchema,
  FACET_WORLD_FALLBACK_ENTITY,
  OWNER_ECONOMY,
  OWNER_LOGISTICS,
  OWNER_NAMED_ACTOR,
  OWNER_POPULATION,
  OWNER_PRODUCTION,
  OWNER_WORLD_STATE,
  OWNER_TEMPORAL_KERNEL,
  PlayerCharacterBindingSchema,
  WorldLocusSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
  type PlayerCharacterBinding,
} from "@immortalis/contracts";
import type { CampaignState, WriteAdmission } from "../commit/campaign-core.ts";
import { canonicalEqual } from "../hash.ts";
import { namedActorGroupCheck } from "../actor/admission.ts";
import { economyGroupCheck } from "../economy/admission.ts";
import { logisticsGroupCheck } from "../logistics/admission.ts";
import { populationGroupCheck } from "../population/admission.ts";
import { productionGroupCheck } from "../production/admission.ts";
import { temporalGroupCheck } from "../temporal/admission.ts";
import { worldEntityGroupCheck } from "../world/fallback-custody.ts";
import { resolveKey, type FactKind } from "./registry.ts";
import { isRejection, reject, requirePrerequisite, type Rejection } from "./rejection.ts";

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

/**
 * Verifies, from committed facts alone, that a binding's retained coupling basis is sufficient to
 * authorize the represented first activation (IR §6 Step 3 / §5, RC-13). Used by admission when the
 * binding is written and again by verifyCanonicalIntegrity on every load, so the two cannot drift.
 * The schema has already limited the basis to the one supported case (native/already-there,
 * explicit player-authored, role.player commitment); this checks it against the facts it cites:
 *
 *  - the PC contract it was established against is a released Existence Contract (the Character
 *    Mirror was accepted before binding), and
 *  - every pinned version is the version of the committed PC contract, world profile and locus — the
 *    basis was established against these facts, not merely alongside them.
 *
 * Returns a message, or null when sufficient.
 */
export function couplingBasisViolation(
  binding: PlayerCharacterBinding,
  facts: { readonly pc: OwnerFact; readonly world: OwnerFact; readonly locus: OwnerFact },
): string | null {
  if (!ExistenceContractSchema.safeParse(facts.pc.value).success) {
    return "the PC existence contract is not a released Existence Contract";
  }
  const pins = binding.transition.basis.pinned_versions;
  if (
    pins.pc !== facts.pc.version ||
    pins.world !== facts.world.version ||
    pins.locus !== facts.locus.version
  ) {
    return "the coupling basis was not established against the committed PC, world and locus versions";
  }
  return null;
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
  const insufficient = couplingBasisViolation(b, {
    pc: pc.fact,
    world: world.fact,
    locus: locus.fact,
  });
  if (insufficient)
    return reject("REFERENCE_INVALID", insufficient, { key: PLAYER_CHARACTER_BINDING_KEY });
  return null;
}

/**
 * IM-03 admission for the Canonical World Identity & Owner Foundation. For every write it enforces:
 *
 *  1. Key space: the key belongs to exactly one registered fact kind and that kind's owner/facet is
 *     the group's. There is no fallback owner (IA-03, RC-02).
 *  2. Typed value: the value satisfies the kind's strict schema, and the identity embedded in the
 *     key is the identity inside the value (stable canonical identity).
 *  3. Sealed canon: the sealed kinds are create-only. Overwriting a sealed world baseline, a released
 *     Existence Contract or the binding needs an owner-defined amendment/transition mechanism
 *     (WG seal; I-002 Intrinsic Amendment Event; IR transitions) that is not implemented.
 *  4. Dependency direction: a locus needs its world; the binding needs the PC contract, the world
 *     and the locus — all already committed, read at their current versions, and depended upon. The
 *     binding group writes only the binding, so it cannot create its own prerequisites (IR: "Binding
 *     cannot feed backward to create its own prerequisite").
 *  5. Coupling basis: the binding must carry the already-established IR coupling (native/already-
 *     there, explicit player-authored) pinned to those exact facts; coexistence of the PC, world and
 *     locus is not itself a lawful basis (see couplingBasisViolation). A binding without it is
 *     rejected by the typed value (VALUE_INVALID), so a raw store.commit cannot bypass the rule.
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
      if (kind.lifecycle === "SEALED" && w.expected_version !== 0) {
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
    // IM-02 kernel groups: cross-fact rules over the whole group (a transaction with its state,
    // boundary-index and engaged-object updates).
    if (group.owner === OWNER_TEMPORAL_KERNEL) return temporalGroupCheck(group, state);
    // IM-04 Population groups: conservation and Cohort derivation are re-derived over the whole group.
    if (group.owner === OWNER_POPULATION) return populationGroupCheck(group, state);
    // IM-05 Production groups: conservation, claims and completion are re-derived over the whole group.
    if (group.owner === OWNER_PRODUCTION) return productionGroupCheck(group, state);
    // IM-06 Economy groups: the request is re-derived from its demand and realized access from the accepted chain.
    if (group.owner === OWNER_ECONOMY) return economyGroupCheck(group, state);
    // IM-05 Logistics groups: a commitment, a dispatch, a delivery result and a retirement are each re-derived.
    if (group.owner === OWNER_LOGISTICS) return logisticsGroupCheck(group, state);
    // IM-07 Named-Actor capability groups: an establishment basis and a capability close are each re-derived.
    if (group.owner === OWNER_NAMED_ACTOR) return namedActorGroupCheck(group, state);
    // IM-03 World-State fallback physical-entity custody: an acceptance is re-derived from the completion, and an
    // entity transition from its causing result and the accepted entity.
    if (group.owner === OWNER_WORLD_STATE && group.facet === FACET_WORLD_FALLBACK_ENTITY)
      return worldEntityGroupCheck(group, state);
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
    case "temporal_state":
    case "temporal_boundary_index":
      return null;
    case "temporal_object":
      return v["object_id"] === ids[0] ? null : "object_id does not match the key";
    case "resolution_transaction":
    case "temporal_transaction_authority":
      return v["transaction_id"] === ids[0] ? null : "transaction_id does not match the key";
    case "population_ledger":
    case "population_close":
      return v["ledger_id"] === ids[0] ? null : "ledger_id does not match the key";
    case "production_reserve":
      return v["reserve_id"] === ids[0] ? null : "reserve_id does not match the key";
    case "production_claim":
      return v["claim_id"] === ids[0] ? null : "claim_id does not match the key";
    case "production_operation":
    case "production_completion":
      return v["operation_id"] === ids[0] ? null : "operation_id does not match the key";
    case "economy_demand":
      return v["demand_envelope_id"] === ids[0]
        ? null
        : "demand_envelope_id does not match the key";
    case "economy_request":
      return v["request_id"] === ids[0] ? null : "request_id does not match the key";
    case "economy_realization":
      return v["demand_envelope_id"] === ids[0]
        ? null
        : "demand_envelope_id does not match the key";
    case "world_fallback_entity": {
      const locality = v["locality"] as { world: { entity_id: string } };
      return v["entity_id"] === ids[1] && locality.world.entity_id === ids[0]
        ? null
        : "entity identity does not match the key";
    }
    case "world_entity_transition": {
      const locus = v["locus"] as { from: { world: { entity_id: string } } };
      const entity = v["entity"] as { entity_id: string };
      return entity.entity_id === ids[1] && locus.from.world.entity_id === ids[0]
        ? null
        : "transition identity does not match the key";
    }
    case "logistics_commitment": {
      const moved = v["moved"] as { entity_id: string };
      const origin = v["origin"] as { world: { entity_id: string } };
      return moved.entity_id === ids[1] && origin.world.entity_id === ids[0]
        ? null
        : "commitment identity does not match the key";
    }
    case "logistics_transfer": {
      const moved = v["moved"] as { fact_key: string; entity_id: string };
      return moved.entity_id === ids[1] && moved.fact_key === `world/${ids[0]}/entity/${ids[1]}`
        ? null
        : "transfer identity does not match the key";
    }
    case "logistics_delivery": {
      const subject = v["subject"] as { entity_id: string };
      const to = (v["outcome"] as { destination: { world: { entity_id: string } } }).destination;
      return subject.entity_id === ids[1] && to.world.entity_id === ids[0]
        ? null
        : "delivery identity does not match the key";
    }
    case "named_actor_capability_basis":
    case "named_actor_capability":
      return v["actor_id"] === ids[0] && v["capability_id"] === ids[1]
        ? null
        : "actor and capability identity does not match the key";
    case "population_cohort": {
      const ref = v["ref"] as { cohort_id: string; scope: { ledger_id: string } };
      return ref.cohort_id === ids[1] && ref.scope.ledger_id === ids[0]
        ? null
        : "cohort identity does not match the key";
    }
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
