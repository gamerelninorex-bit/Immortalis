import {
  CANON_WRITE_AUTHORITY,
  ExistenceContractSchema,
  InsertionFactSchema,
  BindingTargetSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  PublicationSchema,
  WorldLocusSchema,
  WorldProfileSchema,
  fail,
  ok,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type ExistenceContract,
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
import { verifyEconomyIntegrity } from "../economy/integrity.ts";
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

  /** I-002: one released Existence Contract, under PC-existence ownership. Depends on nothing. */
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
      [],
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

/** Canonical (world/PC/binding) integrity, the IM-02 kernel's temporal integrity, then IM-04 Population, IM-05 Production and IM-06 Economy integrity. */
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
  ];
}

function inputInvalid(what: string, error: SchemaIssues) {
  return fail("INPUT_INVALID", `${what} failed validation`, {
    issues: error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`),
  });
}
