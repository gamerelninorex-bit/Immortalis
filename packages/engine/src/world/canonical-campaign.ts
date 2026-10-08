import {
  CANON_WRITE_AUTHORITY,
  EXISTING_ACTOR_HANDOVER,
  ExistenceContractSchema,
  InsertionFactSchema,
  OWNER_WORLD_STATE,
  BindingTargetSchema,
  ExistingActorCouplingSchema,
  ExistingActorCouplingTargetSchema,
  PcPhysicalLocusCustodySchema,
  PcPhysicalLocusCustodyTargetSchema,
  MovementServiceRequestSchema,
  PcMovementCommitInputSchema,
  PcMovementCommitmentSchema,
  PcMovementRequestTargetSchema,
  HandoverTargetSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  PublicationSchema,
  WorldLocusSchema,
  WorldProfileSchema,
  fail,
  ok,
  pcExistenceContractKey,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldPcLocusCustodyKey,
  worldProfileKey,
  type CommitGroup,
  type ExistenceContract,
  type ExistingActorCoupling,
  type MovementServiceRequest,
  type PcMovementCommitment,
  type PcPhysicalLocusCustody,
  type OwnerFact,
  type PlayerCharacterBinding,
  type Publication,
  type Result,
  type SchemaIssues,
  type ValueSchema,
  type WorldLocus,
  type WorldProfile,
} from "@immortalis/contracts";
import type { FactKindId } from "../owners/registry.ts";
import { canonicalAdmission } from "../owners/admission.ts";
import {
  storeBindings,
  type ExtensionErrorCode,
  type StageOwnerExtension,
} from "../owners/extension.ts";
import { CANONICAL_OWNER_REGISTRY, factKind } from "../owners/registry.ts";
import { verifyNamedActorIntegrity } from "../actor/integrity.ts";
import { verifyPcCapabilityIntegrity } from "../pc-capability/integrity.ts";
import { verifyCausalDrawIntegrity } from "../causal-draw/integrity.ts";
import { verifyEconomyIntegrity } from "../economy/integrity.ts";
import { verifyEpistemicIntegrity } from "../epistemic/integrity.ts";
import { verifyDiplomacyIntegrity } from "../diplomacy/integrity.ts";
import { verifyGipIntegrity } from "../gip/integrity.ts";
import { verifyKtiIntegrity } from "../kti/integrity.ts";
import { verifyLogisticsIntegrity } from "../logistics/integrity.ts";
import { verifyPopulationIntegrity } from "../population/integrity.ts";
import { verifyProductionIntegrity } from "../production/integrity.ts";
import { verifyTemporalIntegrity } from "../temporal/integrity.ts";
import {
  createFileCampaign,
  openFileCampaign,
  type CreateErrorCode,
  type FileCampaignOptions,
  type FileCampaignStore,
  type OpenErrorCode,
} from "../persistence/file-package.ts";
import type { CommitOutcome, StoreCommitErrorCode } from "../persistence/store.ts";
import { expectedHandoverMigration } from "../owners/admission.ts";
import { deriveExistingActorCoupling } from "./actor-coupling.ts";
import { verifyExistingActorCouplingIntegrity } from "./actor-coupling-integrity.ts";
import { resolveEntityLocus, type ResolvedEntityLocus } from "../logistics/locus.ts";
import { derivePcMovementCommitment, derivePcMovementRequest } from "../pc-movement/derive.ts";
import { verifyPcMovementIntegrity } from "../pc-movement/integrity.ts";
import { derivePcPhysicalLocusCustody } from "./pc-locus-custody.ts";
import { verifyPcPhysicalLocusCustodyIntegrity } from "./pc-locus-custody-integrity.ts";
import { verifyEntityTransitionIntegrity } from "./entity-transition-integrity.ts";
import { verifyCanonicalIntegrity, type IntegrityViolation } from "./integrity.ts";

/** The owner/facet resolution surface every canonical campaign store is built with. */
export const CANONICAL_STORE_BINDINGS = {
  owners: CANONICAL_OWNER_REGISTRY,
  admission: canonicalAdmission,
} as const satisfies Pick<FileCampaignOptions, "owners" | "admission">;

export type EstablishWorldInput = Publication & { readonly world: unknown };
export type EstablishLocusInput = Publication & { readonly locus: unknown };
export type ReleasePcInput = Publication & { readonly contract: unknown };
export interface BindPcInput extends Publication {
  readonly pc_id: string;
  readonly world_id: string;
  readonly locus_id: string;
  /**
   * The already-established IR insertion fact that makes this coupling lawful (see
   * InsertionFactSchema). Required and never inferred: the existence of a PC, a world and a locus
   * is not a basis. Anything but the supported native/already-there, explicit player-authored case
   * is rejected, because no other bridge or precedence class is implemented.
   */
  readonly insertion: unknown;
}

/**
 * What an existing-actor coupling names (see ExistingActorCouplingTargetSchema): the actor, the established world and locus,
 * and the pins of the actor's own already-committed Named-Actor state. There is no insertion fact, bridge, player-authored
 * statement or PC reference: the coupling is authoritative pre-existing world state, never newly authored insertion.
 */
export interface CoupleExistingActorInput extends Publication {
  readonly actor_id: string;
  readonly world_id: string;
  readonly locus_id: string;
  readonly actor_state: unknown;
}

/**
 * What an Existing-Actor → PC handover names: the actor (the PC identity), and the world and locus it claims to be coupled
 * to — which must equal the actor's committed coupling exactly. There is no insertion fact, bridge, placement or
 * player-authored statement: the committed coupling is the authoritative basis, and a rival placement is not accepted.
 */
export interface HandoverExistingActorInput extends Publication {
  readonly pc_id: string;
  readonly world_id: string;
  readonly locus_id: string;
}

/**
 * What a post-handover physical-locus custody establishment names: the canonical PC identity only. There is no world, locus,
 * placement, destination or movement field: the stationary locus is read from the handover's consumed coupling.
 */
export interface EstablishPcLocusCustodyInput extends Publication {
  readonly pc_id: string;
}

/**
 * What a player's voluntary-movement commitment names (I-001's minimum structured movement intent, already lowered): the PC, ONE
 * already-established destination locus and the authored authority (role.player + permission.player_choice.commit, supplied and
 * never defaulted). There is no route, duration, cost, arrival, leg or success field: the player authors willingness only.
 */
export interface CommitPcVoluntaryMovementInput extends Publication {
  readonly pc_id: string;
  readonly destination: unknown;
  readonly authored_under: unknown;
}

/** What a PC-owned Movement Service Request establishment names: the canonical PC identity only. */
export interface EstablishPcMovementRequestInput extends Publication {
  readonly pc_id: string;
}

export type CanonicalCommitCode = StoreCommitErrorCode | "INPUT_INVALID";
export type CanonicalOpenCode = OpenErrorCode | "CANON_INTEGRITY" | ExtensionErrorCode;
export type CanonicalCreateCode = CreateErrorCode | ExtensionErrorCode;

export interface Typed<T> {
  readonly fact: OwnerFact;
  readonly value: T;
}

/**
 * The acceptance path of the Canonical World Identity & Owner Foundation.
 *
 * A caller supplies authored content and identities. It never supplies an owner, a facet, an
 * authority or a governing rule: those come from the specification-backed registry (IM-03), and
 * each operation is published only by the authorized archivist path (role.archivist +
 * permission.canon.write). The store underneath additionally enforces key-space exclusivity, typed
 * values, sealing and dependency direction, so the same rules hold for a raw `store.commit`.
 *
 * The four operations are separate publications in dependency order. `bindPlayerCharacter` writes
 * only the binding: it reads and depends on the PC, world and locus already being committed, can
 * neither create them nor commit without them, and commits only with an explicitly supplied,
 * already-established IR coupling basis (never one inferred from the facts' coexistence).
 */
export class CanonicalCampaign {
  /** Exposed for diagnostics and tests. Admission governs every commit made through it. */
  readonly store: FileCampaignStore;

  readonly #extension: StageOwnerExtension | undefined;

  private constructor(store: FileCampaignStore, extension: StageOwnerExtension | undefined) {
    this.store = store;
    this.#extension = extension;
  }

  /**
   * `extension` registers additional (owner-adapter) owner/facets beside the canonical and IM-02
   * kernel ones. Omit it for a plain canonical campaign. The same extension must be supplied on open.
   */
  static async create(
    dir: string,
    params: Pick<FileCampaignOptions, "buildId" | "fs" | "specIdentity"> & {
      campaignId: string;
      extension?: StageOwnerExtension;
    },
  ): Promise<Result<CanonicalCampaign, CanonicalCreateCode>> {
    const { extension, ...rest } = params;
    const bindings = storeBindings(extension);
    if (!bindings.ok) return bindings;
    const created = await createFileCampaign(dir, { ...rest, ...bindings.value });
    return created.ok ? ok(new CanonicalCampaign(created.value, extension)) : created;
  }

  /**
   * Opens and fully re-verifies: package integrity and journal replay (IM-17), then canonical
   * integrity (owner/facet, typed values, governing-rule provenance, dependency direction).
   */
  static async open(
    dir: string,
    options: Pick<FileCampaignOptions, "buildId" | "fs" | "reclaimStaleLock"> & {
      extension?: StageOwnerExtension;
    } = {},
  ): Promise<Result<CanonicalCampaign, CanonicalOpenCode>> {
    const { extension, ...rest } = options;
    const bindings = storeBindings(extension);
    if (!bindings.ok) return bindings;
    const opened = await openFileCampaign(dir, { ...rest, ...bindings.value });
    if (!opened.ok) return opened;
    const violations = verifyAll(opened.value, extension);
    if (violations.length > 0) {
      await opened.value.close();
      return fail("CANON_INTEGRITY", "the campaign does not match this build's canonical owners", {
        violations: violations.slice(0, 10),
      });
    }
    return ok(new CanonicalCampaign(opened.value, extension));
  }

  /** Re-runs the canonical and temporal integrity verification against current state. */
  verify(): readonly IntegrityViolation[] {
    return verifyAll(this.store, this.#extension);
  }

  close(): Promise<void> {
    return this.store.close();
  }

  // -- publications --------------------------------------------------------------------------

  /** WG: the World Profile, under World-State ownership. */
  establishWorld(input: EstablishWorldInput): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const world = WorldProfileSchema.safeParse(input.world);
    if (!world.success) return Promise.resolve(inputInvalid("world", world.error));
    return this.#publish(
      input,
      "world_profile",
      worldProfileKey(world.data.world_id),
      world.data,
      [],
    );
  }

  /** WG: the bounded locus of a committed world. Reads and depends on that world. */
  establishLocus(input: EstablishLocusInput): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const locus = WorldLocusSchema.safeParse(input.locus);
    if (!locus.success) return Promise.resolve(inputInvalid("locus", locus.error));
    const key = worldLocusKey(locus.data.world.entity_id, locus.data.locus_id);
    return this.#publish(input, "world_locus", key, locus.data, [locus.data.world.fact_key]);
  }

  /**
   * I-002: one released Existence Contract, under PC-existence ownership. A freshly generated PC depends on nothing; a
   * contract that explicitly compiles an already-existing actor (`existing_actor_compilation`) reads and depends on the
   * pinned actor state, which is never copied, and leaves that actor's prior owner writable (it is no binding).
   */
  releasePlayerCharacter(
    input: ReleasePcInput,
  ): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const contract = ExistenceContractSchema.safeParse(input.contract);
    if (!contract.success) return Promise.resolve(inputInvalid("contract", contract.error));
    return this.#publish(
      input,
      "pc_existence_contract",
      pcExistenceContractKey(contract.data.pc_id),
      contract.data,
      // a fresh PC depends on nothing; an existing-actor compilation pins (reads and depends on) the actor's own state
      contract.data.existing_actor_compilation?.source_state.map((s) => s.fact_key) ?? [],
    );
  }

  /**
   * IR + RC-13 + F-014C: activates the single `role.player_character` binding between a released PC
   * and an established world/locus, on the strength of the caller's already-established insertion
   * fact (`input.insertion`). The prerequisites are only *read*; when any is missing the commit is
   * rejected (PREREQUISITE_MISSING), it is never created here.
   *
   * This method does not decide that the coupling is lawful and does not infer it from the
   * coexistence of the three facts: the classification, precedence class, authority and statement
   * are the caller's authored input, rejected unless they are the one supported case. The only thing
   * added here is mechanical: the versions of the committed facts the basis is pinned to.
   */
  bindPlayerCharacter(input: BindPcInput): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const ids = BindingTargetSchema.safeParse({
      pc_id: input.pc_id,
      world_id: input.world_id,
      locus_id: input.locus_id,
    });
    if (!ids.success) return Promise.resolve(inputInvalid("binding", ids.error));
    const insertion = InsertionFactSchema.safeParse(input.insertion);
    if (!insertion.success) return Promise.resolve(inputInvalid("insertion fact", insertion.error));
    const pcKey = pcExistenceContractKey(input.pc_id);
    const worldKey = worldProfileKey(input.world_id);
    const locusKey = worldLocusKey(input.world_id, input.locus_id);
    const versionOf = (key: string): number => this.store.getFact(key)?.version ?? 0;
    const binding: PlayerCharacterBinding = {
      binding_slot: "role.player_character",
      active_pc: { fact_key: pcKey, entity_id: input.pc_id },
      coupling: {
        world: { fact_key: worldKey, entity_id: input.world_id },
        locus: { fact_key: locusKey, entity_id: input.locus_id },
      },
      transition: {
        type: "ACTIVATION",
        basis: {
          ...insertion.data,
          pinned_versions: {
            pc: versionOf(pcKey),
            world: versionOf(worldKey),
            locus: versionOf(locusKey),
          },
        },
      },
      prior_binding: null,
      replacement_binding: null,
      intrinsic_authority_migration: [],
      writer: { role: "role.archivist", permission: "permission.canon.write" },
    };
    const parsed = PlayerCharacterBindingSchema.safeParse(binding);
    if (!parsed.success) return Promise.resolve(inputInvalid("binding", parsed.error));
    return this.#publish(
      input,
      "player_character_binding",
      PLAYER_CHARACTER_BINDING_KEY,
      parsed.data,
      [pcKey, worldKey, locusKey],
    );
  }

  /**
   * The Existing-Actor → PC Role Registry handover (PC-Control Handover Contract v1 "Single Commit Point" and "Existing
   * Actor → PC"; IR §5 item 3 / §6 Step 6; RC-13): the single binding commit that is the control/writability cutover of an
   * already-existing, lawfully non-PC actor. It is a distinct path from `bindPlayerCharacter` (the first ACTIVATION of a
   * freshly generated PC) and does not widen it.
   *
   * It consumes, and never creates or infers, the already-committed state it rests on: the released I-002 Existence
   * Contract that compiles THIS actor, and the actor's World-State coupling as the authoritative world/locus basis. The
   * caller names identities only; everything else is mechanical (committed versions and the exact references migrated by
   * reference). Admission rejects the commit unless it is the exact lawful handover. Nothing is copied into the Role
   * Registry, no ledger or owner is invented, and no capability is moved, closed or resolved: the actor's prior facts stay
   * as committed provenance/history, and after this commit the Named-Actor owner writes nothing further for the identity.
   */
  handoverExistingActor(
    input: HandoverExistingActorInput,
  ): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const { group_id, intent_id, cause, basis, secrecy, ...named } = input;
    const ids = HandoverTargetSchema.safeParse(named);
    if (!ids.success) return Promise.resolve(inputInvalid("handover", ids.error));
    const pcKey = pcExistenceContractKey(ids.data.pc_id);
    const worldKey = worldProfileKey(ids.data.world_id);
    const locusKey = worldLocusKey(ids.data.world_id, ids.data.locus_id);
    const couplingKey = worldActorCouplingKey(ids.data.pc_id);
    const versionOf = (key: string): number => this.store.getFact(key)?.version ?? 0;
    const contractFact = this.store.getFact(pcKey);
    const contract = contractFact
      ? ExistenceContractSchema.safeParse(contractFact.value)
      : undefined;
    const couplingFact = this.store.getFact(couplingKey);
    // a missing referent is pinned at 0 and admission rejects it (PREREQUISITE_MISSING); it is never created here
    const migration =
      couplingFact && contract?.success
        ? expectedHandoverMigration(couplingFact, contract.data)
        : [{ owner: OWNER_WORLD_STATE, fact_key: couplingKey, version: versionOf(couplingKey) }];
    const binding: PlayerCharacterBinding = {
      binding_slot: "role.player_character",
      active_pc: { fact_key: pcKey, entity_id: ids.data.pc_id },
      coupling: {
        world: { fact_key: worldKey, entity_id: ids.data.world_id },
        locus: { fact_key: locusKey, entity_id: ids.data.locus_id },
      },
      transition: {
        type: EXISTING_ACTOR_HANDOVER,
        basis: {
          pinned_versions: {
            pc: versionOf(pcKey),
            world: versionOf(worldKey),
            locus: versionOf(locusKey),
            coupling: versionOf(couplingKey),
          },
        },
      },
      prior_binding: null,
      replacement_binding: null,
      intrinsic_authority_migration: migration.map((m) => ({ ...m })),
      writer: { role: "role.archivist", permission: "permission.canon.write" },
    };
    const parsed = PlayerCharacterBindingSchema.safeParse(binding);
    if (!parsed.success) return Promise.resolve(inputInvalid("binding", parsed.error));
    return this.#publish(
      { group_id, intent_id, cause, basis, secrecy },
      "player_character_binding",
      PLAYER_CHARACTER_BINDING_KEY,
      parsed.data,
      [pcKey, worldKey, locusKey, couplingKey, ...migration.map((m) => m.fact_key)].filter(
        (k, i, all) => all.indexOf(k) === i,
      ),
    );
  }

  /**
   * World-State fallback custody: the ONE authoritative current coupling of an already-existing, lawfully non-PC actor to an
   * established locus of an established world. It reads and depends on the actor's own Named-Actor state, the world and the
   * locus (never copied) and is rejected unless the actor already exists as a non-PC actor; it never creates a prerequisite.
   *
   * It is a PREREQUISITE only. It binds no `role.player_character`, writes no Existence Contract, closes no owner, moves no
   * capability and is not the first-ACTIVATION insertion path; the Existing-Actor → PC handover that may later consume it is
   * not implemented. The version pins of the world and locus are mechanical; nothing else is inferred or defaulted.
   */
  coupleExistingActor(
    input: CoupleExistingActorInput,
  ): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const target = ExistingActorCouplingTargetSchema.safeParse({
      actor_id: input.actor_id,
      world_id: input.world_id,
      locus_id: input.locus_id,
      actor_state: input.actor_state,
    });
    if (!target.success) return Promise.resolve(inputInvalid("coupling target", target.error));
    const coupling = ExistingActorCouplingSchema.safeParse(
      deriveExistingActorCoupling(target.data, (key) => this.store.getFact(key)?.version ?? 0),
    );
    if (!coupling.success) return Promise.resolve(inputInvalid("coupling", coupling.error));
    return this.#publish(
      input,
      "world_actor_coupling",
      worldActorCouplingKey(target.data.actor_id),
      coupling.data,
      [
        ...coupling.data.actor_state.map((s) => s.fact_key),
        coupling.data.coupling.world.fact_key,
        coupling.data.coupling.locus.fact_key,
      ],
    );
  }

  /**
   * World-State fallback custody: the ONE authoritative stationary current physical locus of the ACTIVE Player Character,
   * established immediately after the completed Existing-Actor → PC handover (frozen Post-Handover Physical Locus Ownership
   * contract §§4–7, 9, 13). The locus is taken only from the handover's consumed `world_actor_coupling` (never from the
   * binding's referent, never from the caller); the binding and the coupling are read and depended on, never rewritten. It is
   * rejected unless the active binding is the lawful completed handover of this PC, and it moves, requests and dispatches
   * nothing: there is no later mutation, relocation or Logistics admission here.
   */
  establishPcPhysicalLocusCustody(
    input: EstablishPcLocusCustodyInput,
  ): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const { group_id, intent_id, cause, basis, secrecy, ...named } = input;
    const target = PcPhysicalLocusCustodyTargetSchema.safeParse(named);
    if (!target.success) return Promise.resolve(inputInvalid("custody target", target.error));
    const derived = derivePcPhysicalLocusCustody(target.data.pc_id, this.store);
    if (!derived.ok) {
      return Promise.resolve(fail("PREREQUISITE_MISSING", derived.error.message));
    }
    const custody = PcPhysicalLocusCustodySchema.safeParse(derived.value);
    if (!custody.success) return Promise.resolve(inputInvalid("custody", custody.error));
    return this.#publish(
      { group_id, intent_id, cause, basis, secrecy },
      "world_pc_locus_custody",
      worldPcLocusCustodyKey(target.data.pc_id),
      custody.data,
      [
        pcExistenceContractKey(target.data.pc_id),
        PLAYER_CHARACTER_BINDING_KEY,
        worldActorCouplingKey(target.data.pc_id),
        custody.data.stationary_locus.world.fact_key,
        custody.data.stationary_locus.locus.fact_key,
      ],
    );
  }

  /**
   * I-002 (the current lawful PC-state owner): the player's voluntary-movement COMMITMENT-OF-RECORD for the active PC (frozen
   * Post-Handover contract §4, §8, §14). It states willingness only: one relocation of the continuing PC to one already-established
   * lawful locus of its own world, authored under role.player + permission.player_choice.commit. It is not a world result, not a
   * Logistics commitment and not arrival, and it invents no route, duration, cost or success. Everything else is read from committed
   * state (the pins are mechanical); admission fails it closed unless the very PC is the active handed-over PC, its stationary
   * custody is the one authority and the destination is an established distinct locus. One slot per PC: a second journey conflicts.
   */
  commitPcVoluntaryMovement(
    input: CommitPcVoluntaryMovementInput,
  ): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const { group_id, intent_id, cause, basis, secrecy, ...named } = input;
    const target = PcMovementCommitInputSchema.safeParse(named);
    if (!target.success) return Promise.resolve(inputInvalid("movement commitment", target.error));
    const derived = derivePcMovementCommitment(target.data, this.store);
    if (!derived.ok) {
      return Promise.resolve(fail("PREREQUISITE_MISSING", derived.error.message));
    }
    const commitment = PcMovementCommitmentSchema.safeParse(derived.value);
    if (!commitment.success) return Promise.resolve(inputInvalid("commitment", commitment.error));
    const d = commitment.data.intent.destination;
    return this.#publish(
      { group_id, intent_id, cause, basis, secrecy },
      "pc_movement_commitment",
      pcMovementCommitmentKey(target.data.pc_id),
      commitment.data,
      [
        pcExistenceContractKey(target.data.pc_id),
        PLAYER_CHARACTER_BINDING_KEY,
        worldPcLocusCustodyKey(target.data.pc_id),
        d.world.fact_key,
        d.locus.fact_key,
      ],
    );
  }

  /**
   * The PC-OWNED Movement Service Request (WS-010 §3.1; frozen Post-Handover contract §10): exactly the existing envelope, derived
   * mechanically from the PC's committed commitment-of-record and held in the PC-state owner's own key space. It is rejected unless
   * the commitment-of-record is committed and still holds; Logistics and World-State create no willingness. Naming the PC as the moved
   * subject is a REFERENCE to its physical custody record: no fallback entity is created and no ownership of the locus moves.
   */
  establishPcMovementRequest(
    input: EstablishPcMovementRequestInput,
  ): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const { group_id, intent_id, cause, basis, secrecy, ...named } = input;
    const target = PcMovementRequestTargetSchema.safeParse(named);
    if (!target.success) return Promise.resolve(inputInvalid("movement request", target.error));
    const commitmentFact = this.store.getFact(pcMovementCommitmentKey(target.data.pc_id));
    const commitment = commitmentFact
      ? PcMovementCommitmentSchema.safeParse(commitmentFact.value)
      : undefined;
    if (!commitmentFact || !commitment?.success) {
      return Promise.resolve(
        fail(
          "PREREQUISITE_MISSING",
          "no player movement commitment-of-record is committed for this PC: a request is never created without willingness",
        ),
      );
    }
    const request = MovementServiceRequestSchema.safeParse(
      derivePcMovementRequest(commitment.data),
    );
    if (!request.success) return Promise.resolve(inputInvalid("request", request.error));
    return this.#publish(
      { group_id, intent_id, cause, basis, secrecy },
      "pc_movement_request",
      pcMovementRequestKey(target.data.pc_id),
      request.data,
      [
        pcMovementCommitmentKey(target.data.pc_id),
        request.data.subject.fact_key,
        request.data.destination.locus.fact_key,
      ],
    );
  }

  // -- reads (typed, by identity) ---------------------------------------------------------------

  world(worldId: string): Typed<WorldProfile> | undefined {
    return this.#typed(worldProfileKey(worldId), WorldProfileSchema);
  }
  locus(worldId: string, locusId: string): Typed<WorldLocus> | undefined {
    return this.#typed(worldLocusKey(worldId, locusId), WorldLocusSchema);
  }
  playerCharacter(pcId: string): Typed<ExistenceContract> | undefined {
    return this.#typed(pcExistenceContractKey(pcId), ExistenceContractSchema);
  }
  /** The actor's one authoritative current coupling to a world locus, or undefined when none is established. */
  existingActorCoupling(actorId: string): Typed<ExistingActorCoupling> | undefined {
    return this.#typed(worldActorCouplingKey(actorId), ExistingActorCouplingSchema);
  }
  /**
   * The active PC's one stationary physical-locus custody record, or undefined when none is established. This (while stationary)
   * is the only current-locus answer by PC identity: it never falls back to the Role Registry binding's referent or to the
   * consumed coupling, which are provenance and not current physical truth.
   */
  pcPhysicalLocusCustody(pcId: string): Typed<PcPhysicalLocusCustody> | undefined {
    return this.#typed(worldPcLocusCustodyKey(pcId), PcPhysicalLocusCustodySchema);
  }
  /** The PC's voluntary-movement commitment-of-record (willingness only, never a world result), or undefined when none. */
  pcMovementCommitment(pcId: string): Typed<PcMovementCommitment> | undefined {
    return this.#typed(pcMovementCommitmentKey(pcId), PcMovementCommitmentSchema);
  }
  /** The PC-owned Movement Service Request, or undefined when none is established. */
  pcMovementRequest(pcId: string): Typed<MovementServiceRequest> | undefined {
    return this.#typed(pcMovementRequestKey(pcId), MovementServiceRequestSchema);
  }
  /**
   * Where is the active PC now? ONE authority at every durable cut, by PC identity (frozen Post-Handover contract §9): the
   * stationary World-State custody record, or Logistics while an active transfer owns the in-transfer locus, or the destination
   * World-State committed (ECT-01). It never reads the Role Registry binding's referent or the consumed actor coupling. Undefined
   * when the PC has no physical-locus custody record.
   */
  pcCurrentLocus(pcId: string): ResolvedEntityLocus | undefined {
    const custody = this.pcPhysicalLocusCustody(pcId);
    return custody
      ? resolveEntityLocus(this.store, custody.value.stationary_locus.world.entity_id, pcId)
      : undefined;
  }
  /** The operative binding, or undefined for the NULL state (no active PC). */
  binding(): Typed<PlayerCharacterBinding> | undefined {
    return this.#typed(PLAYER_CHARACTER_BINDING_KEY, PlayerCharacterBindingSchema);
  }

  #typed<T>(key: string, schema: ValueSchema<T>): Typed<T> | undefined {
    const fact = this.store.getFact(key);
    return fact ? { fact, value: schema.parse(fact.value) } : undefined;
  }

  async #publish(
    input: Publication,
    kindId: FactKindId,
    key: string,
    value: unknown,
    prerequisiteKeys: readonly string[],
  ): Promise<Result<CommitOutcome, CanonicalCommitCode>> {
    const publication = PublicationSchema.safeParse({
      group_id: input.group_id,
      intent_id: input.intent_id,
      cause: input.cause,
      basis: input.basis,
      secrecy: input.secrecy,
    });
    if (!publication.success) return inputInvalid("publication", publication.error);
    const p = publication.data;
    const kind = factKind(kindId);
    // Foreign facts are pinned, not copied: read at the current version, depend on the committing
    // group. A missing prerequisite is pinned at version 0 with no dependency, and admission then
    // rejects the group as PREREQUISITE_MISSING (this service never creates it).
    const reads = prerequisiteKeys.map((k) => ({
      key: k,
      version: this.store.getFact(k)?.version ?? 0,
    }));
    const depends_on = prerequisiteKeys.flatMap((k) => {
      const f = this.store.getFact(k);
      return f ? [f.provenance.group_id] : [];
    });
    const group: CommitGroup = {
      campaign_id: this.store.head().campaign_id,
      group_id: p.group_id,
      intent_id: p.intent_id,
      owner: kind.owner,
      facet: kind.facet,
      cause: p.cause,
      rule: kind.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads,
      depends_on: [...new Set(depends_on)],
      writes: [
        {
          key,
          owner: kind.owner,
          facet: kind.facet,
          value: value as CommitGroup["writes"][number]["value"],
          unit: null,
          basis: p.basis,
          secrecy: p.secrecy,
          expected_version: 0,
        },
      ],
    };
    return this.store.commit(group);
  }
}

/** Canonical (world/PC/binding) integrity, the IM-02 kernel's temporal integrity, then IM-04 Population, IM-05 Production, IM-06 Economy, World-State entity-transition, IM-05 Logistics, IM-07 Named-Actor capability, IM-07 PC capability profile, IM-10 Epistemic Access, IM-09 KTI, IM-06 GIP Institution Identity, IM-06 Diplomacy External Recognition and IM-12 Causal Draw provenance integrity. */
function verifyAll(
  store: FileCampaignStore,
  extension: StageOwnerExtension | undefined,
): readonly IntegrityViolation[] {
  return [
    ...verifyCanonicalIntegrity(store, {
      isExtensionFact: (f) => extension?.owners.get(f.owner)?.has(f.facet) === true,
    }),
    ...verifyTemporalIntegrity(store),
    ...verifyPopulationIntegrity(store),
    ...verifyProductionIntegrity(store),
    ...verifyEconomyIntegrity(store),
    ...verifyEntityTransitionIntegrity(store),
    ...verifyExistingActorCouplingIntegrity(store),
    ...verifyPcPhysicalLocusCustodyIntegrity(store),
    ...verifyPcMovementIntegrity(store),
    ...verifyLogisticsIntegrity(store),
    ...verifyNamedActorIntegrity(store),
    ...verifyPcCapabilityIntegrity(store),
    ...verifyEpistemicIntegrity(store),
    ...verifyKtiIntegrity(store),
    ...verifyGipIntegrity(store),
    ...verifyDiplomacyIntegrity(store),
    ...verifyCausalDrawIntegrity(store),
  ];
}

function inputInvalid(what: string, error: SchemaIssues) {
  return fail("INPUT_INVALID", `${what} failed validation`, {
    issues: error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
  });
}
