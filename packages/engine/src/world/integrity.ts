import {
  CANON_WRITE_AUTHORITY,
  EXISTING_ACTOR_HANDOVER,
  ExistenceContractSchema,
  ExistingActorCouplingSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  WorldCorridorSchema,
  WorldLocusSchema,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { canonicalEqual } from "../hash.ts";
import {
  couplingBasisViolation,
  existingActorCompilationViolation,
  existingActorHandoverViolation,
  identityMismatch,
} from "../owners/admission.ts";
import { resolveKey, type FactKind } from "../owners/registry.ts";
import { couplingActorStillNonPcViolation } from "./actor-coupling.ts";
import { worldCorridorViolation } from "./corridor.ts";
import type { CampaignStore } from "../persistence/store.ts";

export interface IntegrityViolation {
  readonly key: string;
  readonly code:
    | "UNREGISTERED_KEY"
    | "WRONG_OWNER_FACET"
    | "VALUE_INVALID"
    | "RULE_DRIFT"
    | "AUTHORITY_DRIFT"
    | "UNSUPPORTED_AMENDMENT"
    | "PREREQUISITE_MISSING"
    | "REFERENCE_INVALID"
    | "DEPENDENCY_ORDER"
    /** IM-02 kernel state: see verifyTemporalIntegrity */
    | "TEMPORAL_STATE"
    | "TEMPORAL_INDEX"
    | "TEMPORAL_TRANSACTION"
    | "TEMPORAL_EVIDENCE"
    /** IM-04 Population state: see verifyPopulationIntegrity */
    | "POPULATION_STATE"
    /** IM-05 Production state and the World-State fallback entity: see verifyProductionIntegrity */
    | "PRODUCTION_STATE"
    /** IM-05/IM-03 exact finite raw-source drawdown (Source Condition, Source Delta, delivery, Reserve inflow): see verifySourceDrawdownIntegrity */
    | "SOURCE_DRAWDOWN_STATE"
    /** IM-06 Economy state: see verifyEconomyIntegrity */
    | "ECONOMY_STATE"
    /** World-State entity transitions (ECT-01): see verifyEntityTransitionIntegrity */
    | "ENTITY_TRANSITION_STATE"
    /** World-State existing-actor coupling anchors: see verifyExistingActorCouplingIntegrity */
    | "ACTOR_COUPLING_STATE"
    /** R1 Stage-One v1.1 actor setup placements and world setup closures: see verifyActorPresenceIntegrity */
    | "ACTOR_SETUP_STATE"
    /** R1 Stage-One v1.1 first actor physical presence: see verifyActorPresenceIntegrity */
    | "ACTOR_PRESENCE_STATE"
    /** World-State active-PC post-handover physical-locus custody: see verifyPcPhysicalLocusCustodyIntegrity */
    | "PC_LOCUS_CUSTODY_STATE"
    /** IM-07 active-PC voluntary-movement commitment-of-record and PC-owned request: see verifyPcMovementIntegrity */
    | "PC_MOVEMENT_STATE"
    /** IM-07 Named-Actor capability state: see verifyNamedActorIntegrity */
    | "NAMED_ACTOR_STATE"
    /** IM-07 PC capability profile state (a facet of the one PC owner): see verifyPcCapabilityIntegrity */
    | "PC_CAPABILITY_STATE"
    /** IM-10 Epistemic Access state: see verifyEpistemicIntegrity */
    | "EPISTEMIC_ACCESS_STATE"
    /** IM-06 GIP state (Institution Identity): see verifyGipIntegrity */
    | "GIP_STATE"
    /** IM-06 Diplomacy state (External Recognition): see verifyDiplomacyIntegrity */
    | "DIPLOMACY_STATE"
    /** IM-09 KTI state (managed Transfer Package): see verifyKtiIntegrity */
    | "KTI_STATE"
    /** IM-09 Culture state (established shared meaning / norm): see verifyCultureIntegrity */
    | "CULTURE_STATE"
    /** IM-05 Logistics state (single-leg transfer): see verifyLogisticsIntegrity */
    | "LOGISTICS_STATE"
    /** IM-12 Causal Draw provenance (F-027-CD1 precommit / result): see verifyCausalDrawIntegrity */
    | "CAUSAL_DRAW_STATE"
    /** IM-12 Culture adjudication provenance (F-027-CJA1 decision record): see verifyCultureAdjudicationIntegrity */
    | "CULTURE_ADJUDICATION_STATE"
    | "REFEREE_STATE";
  readonly message: string;
}

/**
 * The governing rule a persisted fact may lawfully carry: the kind's current citation, or — only where the kind registers a
 * superseded one — exactly that whole historical citation on a fact whose value is of the class it governed. This is the whole
 * compatibility: no other rule, no partial or altered citation and no other value class is accepted, so an actual rule drift,
 * tamper, or a fact stamped with an obsolete citation it never lawfully carried still fails closed.
 */
function governingRuleLawful(kind: FactKind, fact: OwnerFact): boolean {
  if (canonicalEqual(fact.provenance.rule, kind.rule)) return true;
  if (
    kind.alternateRules?.some(
      (alt) => canonicalEqual(fact.provenance.rule, alt.rule) && alt.admits(fact.value),
    )
  ) {
    return true;
  }
  const legacy = kind.legacyRule;
  return (
    (legacy !== undefined &&
      canonicalEqual(fact.provenance.rule, legacy.rule) &&
      legacy.admits(fact.value)) ||
    (kind.laterLegacyRules?.some(
      (later) => canonicalEqual(fact.provenance.rule, later.rule) && later.admits(fact.value),
    ) ??
      false)
  );
}

/** The committed facts as they stood BEFORE `revision`: a write is judged at the time it was made (shared by load verifiers). */
export function factsBefore(
  revision: number,
  all: ReadonlyMap<string, OwnerFact>,
  revisionOf: (f: OwnerFact) => number,
): Pick<ReadonlyMap<string, OwnerFact>, "get" | "has"> {
  return {
    get: (k) => {
      const f = all.get(k);
      return f && revisionOf(f) < revision ? f : undefined;
    },
    has: (k) => {
      const f = all.get(k);
      return f !== undefined && revisionOf(f) < revision;
    },
  };
}

/**
 * Re-verifies, from committed state alone, that a loaded canonical campaign still has the owner/facet
 * assignments, typed values, governing-rule provenance and dependency direction that admission
 * enforced when each fact was written. Replay proves the *history* is intact; this proves the
 * *meaning* still matches the running build's specification-backed owners (no owner/facet drift).
 *
 * A campaign containing any fact outside the registered key spaces is not a canonical campaign of
 * this build: it fails closed rather than being partially trusted. Diagnostic full listing (CAL-06):
 * cost is proportional to the number of canonical facts, once per open.
 */
export function verifyCanonicalIntegrity(
  store: CampaignStore,
  options: { readonly isExtensionFact?: (fact: OwnerFact) => boolean } = {},
): readonly IntegrityViolation[] {
  const facts = new Map<string, OwnerFact>(store.listFacts().map((f) => [f.key, f]));
  const out: IntegrityViolation[] = [];
  const bad = (key: string, code: IntegrityViolation["code"], message: string) =>
    out.push({ key, code, message });
  const revisionOf = (f: OwnerFact): number =>
    store.lookupReceipt(f.provenance.intent_id)?.revision ?? -1;

  const needs = (of: OwnerFact, key: string): OwnerFact | undefined => {
    const target = facts.get(key);
    if (!target) {
      bad(of.key, "PREREQUISITE_MISSING", `prerequisite ${key} is not committed`);
      return undefined;
    }
    if (revisionOf(target) >= revisionOf(of)) {
      bad(of.key, "DEPENDENCY_ORDER", `prerequisite ${key} was not committed before this fact`);
    }
    return target;
  };

  for (const fact of facts.values()) {
    // An extension owner's facts are outside the canonical key spaces by construction and are
    // verified by that owner's own admission; the canonical check does not claim them.
    if (options.isExtensionFact?.(fact)) continue;
    const resolved = resolveKey(fact.key);
    if (!resolved) {
      bad(fact.key, "UNREGISTERED_KEY", "key is outside every registered key space");
      continue;
    }
    const { kind, ids } = resolved;
    if (fact.owner !== kind.owner || fact.facet !== kind.facet) {
      bad(fact.key, "WRONG_OWNER_FACET", `owner/facet is not ${kind.owner}/${kind.facet}`);
      continue;
    }
    if (kind.lifecycle === "SEALED" && fact.version !== 1) {
      bad(fact.key, "UNSUPPORTED_AMENDMENT", "sealed canon was overwritten");
    }
    if (!governingRuleLawful(kind, fact)) {
      bad(fact.key, "RULE_DRIFT", "governing rule differs from the registered source citation");
    }
    const receipt = store.lookupReceipt(fact.provenance.intent_id);
    if (!receipt || !canonicalEqual(receipt.basis.authority, CANON_WRITE_AUTHORITY)) {
      bad(fact.key, "AUTHORITY_DRIFT", "not committed by role.archivist + permission.canon.write");
    }
    const parsed = kind.valueSchema.safeParse(fact.value);
    if (!parsed.success) {
      bad(fact.key, "VALUE_INVALID", "value violates its typed contract");
      continue;
    }
    const mismatch = identityMismatch(kind, ids, parsed.data);
    if (mismatch) {
      bad(fact.key, "VALUE_INVALID", mismatch);
      continue;
    }

    if (kind.id === "world_locus") {
      const locus = WorldLocusSchema.parse(parsed.data);
      if (
        locus.world.fact_key !== worldProfileKey(locus.world.entity_id) ||
        fact.key !== worldLocusKey(locus.world.entity_id, locus.locus_id)
      ) {
        bad(fact.key, "REFERENCE_INVALID", "locus world reference does not match its key");
      }
      needs(fact, worldProfileKey(locus.world.entity_id));
    } else if (kind.id === "world_corridor") {
      // a corridor is re-verified from committed state: the world and both endpoint loci were committed before it, the corridor read
      // those exact versions and depended on the groups that committed them (referenced, never copied), and the one topology rule
      // admission applies holds against the facts as they stood when it was written
      const corridor = WorldCorridorSchema.parse(parsed.data);
      const group = store.committedGroup(fact.provenance.intent_id);
      for (const pin of [corridor.world, corridor.from, corridor.to]) {
        const target = needs(fact, pin.fact_key);
        if (
          target &&
          (!group ||
            !group.reads.some((r) => r.key === target.key && r.version === target.version) ||
            !group.depends_on.includes(target.provenance.group_id))
        ) {
          bad(
            fact.key,
            "REFERENCE_INVALID",
            `a corridor read the exact world and endpoint loci and depended on the groups that committed them: ${pin.fact_key}`,
          );
        }
      }
      const violation = worldCorridorViolation(
        fact.key,
        corridor,
        factsBefore(revisionOf(fact), facts, revisionOf),
      );
      if (violation) bad(fact.key, "REFERENCE_INVALID", violation);
    } else if (kind.id === "pc_existence_contract") {
      const contract = ExistenceContractSchema.parse(parsed.data);
      if (contract.existing_actor_compilation !== undefined) {
        // an existing-actor compilation is re-verified from committed state: the pinned actor state was committed before it,
        // and the compilation read that exact state and depended on the group that committed it (never copied)
        const group = store.committedGroup(fact.provenance.intent_id);
        for (const pin of contract.existing_actor_compilation.source_state) {
          const source = needs(fact, pin.fact_key);
          if (
            source &&
            (!group ||
              !group.reads.some((r) => r.key === source.key && r.version === pin.version) ||
              !group.depends_on.includes(source.provenance.group_id))
          ) {
            bad(
              fact.key,
              "REFERENCE_INVALID",
              "an existing-actor compilation read the exact pinned actor state and depended on the group that committed it",
            );
          }
        }
        const violation = existingActorCompilationViolation(contract, facts);
        if (violation) bad(fact.key, "REFERENCE_INVALID", violation);
      }
    } else if (kind.id === "world_actor_coupling") {
      // Whatever the later commit order, the coupled identity is still no Player Character other than by the explicit
      // existing-actor compilation: a fresh Existence Contract or a binding naming it would be a rival owner and a second
      // authoritative current locus. The ONE lawful exception is the exact Existing-Actor → PC handover that consumed THIS
      // coupling at the version committed here (Single Commit Point), judged against the facts as they stood before the
      // binding. Fresh activation, a mismatched actor/world/locus, a stale version, a fabricated handover and a rival
      // coupling still fail the open.
      const coupling = ExistingActorCouplingSchema.parse(parsed.data);
      const bindingFact = facts.get(PLAYER_CHARACTER_BINDING_KEY);
      const bound = bindingFact
        ? PlayerCharacterBindingSchema.safeParse(bindingFact.value)
        : undefined;
      const apart = {
        get: (k: string) => (k === PLAYER_CHARACTER_BINDING_KEY ? undefined : facts.get(k)),
        has: (k: string) => k !== PLAYER_CHARACTER_BINDING_KEY && facts.has(k),
      };
      const now = couplingActorStillNonPcViolation(coupling.actor_id, apart);
      if (now) bad(fact.key, "ACTOR_COUPLING_STATE", now);
      if (bindingFact && bound?.success && bound.data.active_pc.entity_id === coupling.actor_id) {
        const consumed =
          bound.data.transition.type === EXISTING_ACTOR_HANDOVER &&
          bound.data.transition.basis.pinned_versions.coupling === fact.version &&
          existingActorHandoverViolation(
            bound.data,
            factsBefore(revisionOf(bindingFact), facts, revisionOf),
          ) === null;
        if (!consumed) {
          bad(
            fact.key,
            "ACTOR_COUPLING_STATE",
            "the coupled actor is the bound PC otherwise than by the exact lawful Existing-Actor → PC handover consuming this coupling",
          );
        }
      }
    } else if (kind.id === "player_character_binding") {
      const b = PlayerCharacterBindingSchema.parse(parsed.data);
      const worldKey = worldProfileKey(b.coupling.world.entity_id);
      const locusKey = worldLocusKey(b.coupling.world.entity_id, b.coupling.locus.entity_id);
      if (
        b.active_pc.fact_key !== pcExistenceContractKey(b.active_pc.entity_id) ||
        b.coupling.world.fact_key !== worldKey ||
        b.coupling.locus.fact_key !== locusKey
      ) {
        bad(fact.key, "REFERENCE_INVALID", "binding references do not match their key identities");
      }
      const pcFact = needs(fact, b.active_pc.fact_key);
      const worldFact = needs(fact, worldKey);
      const locusFact = needs(fact, locusKey);
      if (locusFact) {
        const committed = WorldLocusSchema.safeParse(locusFact.value);
        if (!committed.success || !canonicalEqual(committed.data.world, b.coupling.world)) {
          bad(fact.key, "REFERENCE_INVALID", "the locus does not belong to the coupled world");
        }
      }
      // The retained IR coupling basis is re-verified against the committed facts it cites: a binding
      // is not accepted merely because its prerequisites happen to exist and precede it.
      if (b.transition.type === EXISTING_ACTOR_HANDOVER) {
        // An Existing-Actor → PC handover is re-verified against the facts as they stood BEFORE the binding commit: the
        // coupling and every migrated reference were committed before it, the binding read the exact pinned versions and
        // depended on the groups that committed them (referenced, never copied), and the one handover rule admission
        // applies holds.
        const group = store.committedGroup(fact.provenance.intent_id);
        const couplingKey = worldActorCouplingKey(b.active_pc.entity_id);
        const referenced = [
          { key: couplingKey, version: b.transition.basis.pinned_versions.coupling },
          ...b.intrinsic_authority_migration.map((m) => ({ key: m.fact_key, version: m.version })),
        ];
        for (const pin of referenced) {
          const target = needs(fact, pin.key);
          if (
            target &&
            (!group ||
              !group.reads.some((r) => r.key === pin.key && r.version === pin.version) ||
              !group.depends_on.includes(target.provenance.group_id))
          ) {
            bad(
              fact.key,
              "REFERENCE_INVALID",
              `an existing-actor handover read the exact pinned fact and depended on the group that committed it: ${pin.key}`,
            );
          }
        }
        const violation = existingActorHandoverViolation(
          b,
          factsBefore(revisionOf(fact), facts, revisionOf),
        );
        if (violation) bad(fact.key, "REFERENCE_INVALID", violation);
      } else if (pcFact && worldFact && locusFact) {
        const insufficient = couplingBasisViolation(b, {
          pc: pcFact,
          world: worldFact,
          locus: locusFact,
        });
        if (insufficient) bad(fact.key, "REFERENCE_INVALID", insufficient);
      }
    }
  }
  return out;
}
