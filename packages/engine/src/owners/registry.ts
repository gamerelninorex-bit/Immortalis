import {
  BoundaryIndexSchema,
  ExistenceContractSchema,
  FACET_EXISTENCE_CONTRACT,
  FACET_PLAYER_CHARACTER_BINDING,
  FACET_TEMPORAL_COORDINATION,
  FACET_WORLD_LOCUS,
  FACET_WORLD_PROFILE,
  OWNER_PC_EXISTENCE,
  OWNER_ROLE_REGISTRY,
  OWNER_TEMPORAL_KERNEL,
  OWNER_WORLD_STATE,
  PLAYER_CHARACTER_BINDING_KEY,
  PlayerCharacterBindingSchema,
  ResolutionTransactionSchema,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalObjectSchema,
  TemporalStateSchema,
  WorldLocusSchema,
  WorldProfileSchema,
  type SourceRef,
  type ValueSchema,
} from "@immortalis/contracts";
import type { OwnerRegistry } from "../commit/campaign-core.ts";

/**
 * IM-03 Owner Resolver Layer — the specification-backed owner/facet assignments for the Canonical
 * World Identity & Owner Foundation.
 *
 * Every entry below is an assignment made by a pinned source, not by this file:
 *
 *   world profile / locus  → World Generation / World-State  (WG "World Generation May Own";
 *                            Output Packet; Interface Handoffs → Insertion).            IM-03
 *   PC existence contract  → I-002 (§2 "canonical current intrinsic Existence Contract"; §2.1
 *                            "Canonical writer: role.archivist").                        IM-07
 *   PC binding             → Role Registry / F-014C (IR §17: "active role.player_character
 *                            binding → Role Registry / F-014C"; Handover: "Insertion commits the
 *                            corresponding Role Registry / F-014C binding change"). IR decides
 *                            the transition; the Registry holds the durable record.      IM-07/IM-11
 *
 * Owner and facet identifiers, key spaces and the world-vs-locus facet split are technical
 * encodings (the sources prescribe no serialization vocabulary). There is NO fallback owner: a key
 * outside every key space below is rejected.
 *
 * `spec-lock.json` is the authority for the pins; tests/conformance/world-foundation-conformance
 * cross-checks each citation against it, so a pin cannot drift silently.
 */

const SPEC_LOCK_BASIS = "F-027 v1.0 spec-lock (spec/f027/spec-lock.json) frozen-source pin";
const RATIFICATION =
  "Sovereign-ratified within W3-CP3 / OB-044, 2026-09-25 (https://app.notion.com/p/3e620af901e0818a8c85cee779263a2c)";
const ROLE_REGISTRY_LINEAGE =
  "Canonical Role Registry v1 / F-014C, pin 2026-09-25T08:21:22.816Z (https://app.notion.com/p/3e620af901e081f68ff1d0cc574e041a)";
const RUNTIME_TRANSLATION_LINEAGE =
  "F-027 Runtime Contract & Translation Tranche v0.2 §5.2 rule 6 and §4 lowering set, pin 2026-09-29T00:33:04.009Z (https://app.notion.com/p/3ea20af901e081b8b958f7f3f39cb96a)";

export const WG_SOURCE = {
  artifact: "https://app.notion.com/p/3e120af901e081ec9de8fea870221a0d",
  native_pin: "2026-09-25T13:44:22.668Z",
} as const;
export const I002_SOURCE = {
  artifact: "https://app.notion.com/p/5a520af901e0829eadb201bccd6c4718",
  native_pin: "2026-09-25T00:15:54.536Z",
} as const;
export const IR_SOURCE = {
  artifact: "https://app.notion.com/p/3e320af901e081a3a669c1c0b842c9df",
  native_pin: "2026-09-25T00:17:26.287Z",
} as const;

export const F014B_SOURCE = {
  artifact: "https://app.notion.com/p/3e020af901e081fb88e9f691748db990",
  native_pin: "2026-09-25T23:42:29.547Z",
} as const;

export const FACT_KIND_IDS = [
  "world_profile",
  "world_locus",
  "pc_existence_contract",
  "player_character_binding",
] as const;
export const TEMPORAL_FACT_KIND_IDS = [
  "temporal_state",
  "temporal_boundary_index",
  "temporal_object",
  "resolution_transaction",
] as const;
export type FactKindId = (typeof FACT_KIND_IDS)[number] | (typeof TEMPORAL_FACT_KIND_IDS)[number];

/**
 * SEALED: create-only canon; overwriting needs an owner-defined amendment mechanism that does not
 * exist. ADVANCING: the owner's own contract lets the fact move forward under its expected-version
 * chain (the kernel's shared orchestration state); the kind's admission rules say how.
 */
export type FactLifecycle = "SEALED" | "ADVANCING";

export interface FactKind {
  readonly id: FactKindId;
  readonly owner: string;
  readonly facet: string;
  /** IM boundary that lowers the governing source (spec-lock `primary_im`) */
  readonly im: string;
  /** RC contracts the fact instantiates */
  readonly rc: readonly string[];
  readonly lifecycle: FactLifecycle;
  /** Matches the whole key; capture group 1 (and 2) are entity identities embedded in the key. */
  readonly keyPattern: RegExp;
  readonly valueSchema: ValueSchema;
  /** governing rule recorded in every group that writes this kind (RC-01, RC-07) */
  readonly rule: SourceRef;
}

const rule = (
  source: { artifact: string; native_pin: string },
  clause: string,
  extraLineage: readonly string[],
): SourceRef => ({
  artifact: source.artifact,
  native_pin: source.native_pin,
  clause,
  authority_lineage: [SPEC_LOCK_BASIS, RATIFICATION, ...extraLineage],
  effective_basis: "pinned-by-spec-lock",
  supersedes: null,
});

const ID = "([A-Za-z0-9][A-Za-z0-9._:-]*)";
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export const FACT_KINDS: readonly FactKind[] = [
  {
    id: "world_profile",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_PROFILE,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/profile$`),
    valueSchema: WorldProfileSchema,
    rule: rule(
      WG_SOURCE,
      "Output Packet — World Profile (items 1-4); Ownership Guards — World Generation May Own",
      [RUNTIME_TRANSLATION_LINEAGE],
    ),
  },
  {
    id: "world_locus",
    owner: OWNER_WORLD_STATE,
    facet: FACET_WORLD_LOCUS,
    im: "IM-03",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^world/${ID}/locus/${ID}$`),
    valueSchema: WorldLocusSchema,
    rule: rule(
      WG_SOURCE,
      "Output Packet item 4 — Insertion-Supporting World Constraints; Interface Handoffs — To Insertion/Reconciliation (material world-side locus/domain constraints)",
      [RUNTIME_TRANSLATION_LINEAGE],
    ),
  },
  {
    id: "pc_existence_contract",
    owner: OWNER_PC_EXISTENCE,
    facet: FACET_EXISTENCE_CONTRACT,
    im: "IM-07",
    rc: ["RC-02"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^pc/${ID}/existence-contract$`),
    valueSchema: ExistenceContractSchema,
    rule: rule(
      I002_SOURCE,
      "§2 Ownership Contract and §2.1 Role/Authority Declaration; §4 Minimum Existence Contract; §21 Generation Hand-Off Test; §26 Sparse Persistence",
      [RUNTIME_TRANSLATION_LINEAGE],
    ),
  },
  {
    id: "player_character_binding",
    owner: OWNER_ROLE_REGISTRY,
    facet: FACET_PLAYER_CHARACTER_BINDING,
    im: "IM-07",
    rc: ["RC-02", "RC-13"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^${escape(PLAYER_CHARACTER_BINDING_KEY)}$`),
    valueSchema: PlayerCharacterBindingSchema,
    rule: rule(
      IR_SOURCE,
      "§2 Ownership Contract; §3 input 3 and §5 Precedence for Insertion Facts (explicit player-authored fact); §6 Step 3 — native/already-there (no bridge invented) and Step 6 — Commit the binding; §17 Persistence / Write-Back; PC-Control Handover Contract — Single Commit Point",
      [ROLE_REGISTRY_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
    ),
  },
];

const F017_LINEAGE =
  "F-017 Whole-Engine Dependency Graph Candidate v0.3 §§2-4, 9 — ratified candidate pin 2026-09-25T15:03:49.887Z with PCB-01 §5.1 conformance at pin 2026-09-25T23:42:27.802Z (https://app.notion.com/p/3e620af901e081109144ef14f52012a8): DERIVE, persist no graph";

/**
 * The F-014B kernel rule shared by every kernel-owned fact. One group carries one rule, and the kernel
 * commits a transaction with its state, boundary-index and engaged-object updates atomically, so all
 * kernel kinds share one owner/facet and one citation.
 */
const KERNEL_RULE = rule(
  F014B_SOURCE,
  "§2 Kernel-Owned State; §3 Temporal Object Contract; §4 Cross-System Temporal Read (R-T1); §6 Advance Algorithm; §9 Temporal Invalidation; §13 Boundary Index Lifecycle; §17 Player-Facing Transaction / Replay; RC-03/RC-04/RC-05/RC-10",
  [F017_LINEAGE, RUNTIME_TRANSLATION_LINEAGE],
);

/**
 * IM-02 Temporal / Dependency Coordinator: "Temporal/provenance coordination records only where
 * specified". F-014B §2 specifies exactly: canonical time, the active requested target/condition,
 * the actual stop and unresolved remainder, the active material-boundary index, and player-facing
 * transaction identity/provenance. The kernel owns orchestration, never a substantive world fact.
 */
export const TEMPORAL_FACT_KINDS: readonly FactKind[] = [
  {
    id: "temporal_state",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-05"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^${escape(TEMPORAL_STATE_KEY)}$`),
    valueSchema: TemporalStateSchema,
    rule: KERNEL_RULE,
  },
  {
    id: "temporal_boundary_index",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-10"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^${escape(TEMPORAL_BOUNDARY_INDEX_KEY)}$`),
    valueSchema: BoundaryIndexSchema,
    rule: KERNEL_RULE,
  },
  {
    id: "temporal_object",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-03", "RC-04", "RC-10"],
    lifecycle: "ADVANCING",
    keyPattern: new RegExp(`^temporal/object/${ID}$`),
    valueSchema: TemporalObjectSchema,
    rule: KERNEL_RULE,
  },
  {
    id: "resolution_transaction",
    owner: OWNER_TEMPORAL_KERNEL,
    facet: FACET_TEMPORAL_COORDINATION,
    im: "IM-02",
    rc: ["RC-02", "RC-05"],
    lifecycle: "SEALED",
    keyPattern: new RegExp(`^temporal/transaction/${ID}$`),
    valueSchema: ResolutionTransactionSchema,
    rule: KERNEL_RULE,
  },
];

/** Every registered kind: the canonical world/PC kinds and the IM-02 kernel kinds. */
export const ALL_FACT_KINDS: readonly FactKind[] = [...FACT_KINDS, ...TEMPORAL_FACT_KINDS];

export const factKind = (id: FactKindId): FactKind => {
  const k = ALL_FACT_KINDS.find((f) => f.id === id);
  if (!k) throw new Error(`unregistered fact kind ${id}`);
  return k;
};

/** The single fact kind whose key space contains `key`, with the entity identities embedded in it. */
export function resolveKey(
  key: string,
): { readonly kind: FactKind; readonly ids: readonly string[] } | null {
  for (const kind of ALL_FACT_KINDS) {
    const m = kind.keyPattern.exec(key);
    if (m) return { kind, ids: m.slice(1) as string[] };
  }
  return null;
}

/** Owner/facet pairs registered by this build for canonical writes. */
export const CANONICAL_OWNER_REGISTRY: OwnerRegistry = new Map(
  [...new Set(ALL_FACT_KINDS.map((k) => k.owner))].map((owner) => [
    owner,
    new Set(ALL_FACT_KINDS.filter((k) => k.owner === owner).map((k) => k.facet)),
  ]),
);
