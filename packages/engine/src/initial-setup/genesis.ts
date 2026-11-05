import {
  INITIAL_SETUP_FACT_KIND_IDS,
  REFEREE_OP_I002,
  REFEREE_OP_INITIAL_DELEGATION,
  WorldProfileSchema,
  fail,
  ok,
  type OwnerFact,
  type Pin,
  type Result,
} from "@immortalis/contracts";
import { sha256Canonical } from "../hash.ts";
import { resolveKey, type FactKindId } from "../owners/registry.ts";

/**
 * The closed original-genesis whitelist of the Initial Locality Bootstrap v0.9 (companion "Admission and Freeze"): the ONLY kinds
 * (and, for a Referee decision, the only operation) that may precede a bootstrap Input and enter its projection. Every registered
 * kind outside it, and every unknown key, refuses entry: an unproven prefix is never assumed to be a valid genesis.
 */
export const GENESIS_KIND_IDS = [
  "world_profile",
  "world_locus",
  "world_source_condition",
  "pc_existence_contract",
  "pc_capability_basis",
  "referee_decision",
] as const satisfies readonly FactKindId[];

const GENESIS_SET: ReadonlySet<string> = new Set(GENESIS_KIND_IDS);
const INFRASTRUCTURE_SET: ReadonlySet<string> = new Set(INITIAL_SETUP_FACT_KIND_IDS);

export type FactClass = "GENESIS" | "INFRASTRUCTURE" | "OTHER";

const operationOf = (value: unknown): unknown =>
  value && typeof value === "object" ? (value as { operation?: unknown }).operation : undefined;

/**
 * Classifies a committed fact for the genesis projection. A Referee decision is GENESIS only when its operation is I002_CLASSIFY;
 * a WG_INITIAL_DELEGATION_CLASSIFY decision is bootstrap INFRASTRUCTURE (excluded from every projection, including refused,
 * mixed and parked sessions); any other Referee operation is OTHER (not genesis).
 */
export function classifyFact(fact: Pick<OwnerFact, "key" | "value">): FactClass {
  const kind = resolveKey(fact.key)?.kind.id;
  if (kind === undefined) return "OTHER";
  if (INFRASTRUCTURE_SET.has(kind)) return "INFRASTRUCTURE";
  if (kind === "referee_decision") {
    const op = operationOf(fact.value);
    if (op === REFEREE_OP_I002) return "GENESIS";
    if (op === REFEREE_OP_INITIAL_DELEGATION) return "INFRASTRUCTURE";
    return "OTHER";
  }
  return GENESIS_SET.has(kind) ? "GENESIS" : "OTHER";
}

export interface ProjectedFact {
  readonly fact_key: string;
  readonly version: number;
  readonly value: unknown;
}

export interface GenesisProjection {
  readonly world_id: string;
  readonly locus_id: string;
  readonly source: Pin;
  readonly pc: Pin | null;
  /** lexically sorted by fact_key */
  readonly pins: readonly Pin[];
  /** the COMPLETE values, sorted by fact_key: transient producer input, never a rival canonical copy */
  readonly facts: readonly ProjectedFact[];
  readonly projection_hash: string;
}

export type GenesisFailureCode =
  "GENESIS_KIND_NOT_WHITELISTED" | "GENESIS_NOT_ORIGINAL" | "GENESIS_SHAPE";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The total genesis projection of a campaign prefix. It scans the WHOLE prefix on purpose: this is exceptional genesis work (the
 * companion calls it "not a routine all-world gameplay hot path"), run at Input, grant, response/completion validation and
 * historical replay — never per ordinary action. There is no relevance filter and no omitted claimant.
 *
 * Refuses unless the prefix holds exactly one ORIGINAL world profile, one locus of it, one finite source of that locus, and at most
 * one PC existence contract, with every other fact either whitelisted genesis or bootstrap infrastructure.
 */
export function genesisProjection(
  facts: ReadonlyMap<string, OwnerFact>,
): Result<GenesisProjection, GenesisFailureCode> {
  const projected: ProjectedFact[] = [];
  const byKind = new Map<string, OwnerFact[]>();
  for (const fact of facts.values()) {
    const cls = classifyFact(fact);
    if (cls === "INFRASTRUCTURE") continue;
    if (cls === "OTHER") {
      return fail(
        "GENESIS_KIND_NOT_WHITELISTED",
        "the prefix holds a fact outside the closed original-genesis whitelist, so entry is not proven",
        { key: fact.key },
      );
    }
    const kind = resolveKey(fact.key)!.kind.id;
    projected.push({ fact_key: fact.key, version: fact.version, value: fact.value });
    (byKind.get(kind) ?? byKind.set(kind, []).get(kind)!).push(fact);
  }
  const one = (kind: FactKindId): OwnerFact | null =>
    byKind.get(kind)?.length === 1 ? byKind.get(kind)![0]! : null;
  const world = one("world_profile");
  const locus = one("world_locus");
  const source = one("world_source_condition");
  if (!world || !locus || !source)
    return fail(
      "GENESIS_SHAPE",
      "exactly one world profile, one locus and one finite source are required",
    );
  const profile = WorldProfileSchema.safeParse(world.value);
  if (!profile.success || profile.data.reference_causal_basis.mode !== "ORIGINAL")
    return fail("GENESIS_NOT_ORIGINAL", "the world is not an ORIGINAL world");
  const pcs = byKind.get("pc_existence_contract") ?? [];
  if (pcs.length > 1)
    return fail("GENESIS_SHAPE", "this cut admits at most one PC existence contract");
  const locusValue = locus.value as { world: { entity_id: string }; locus_id: string };
  const sourceValue = source.value as {
    locality: { world: { entity_id: string }; locus: { entity_id: string } };
  };
  if (
    locusValue.world.entity_id !== profile.data.world_id ||
    sourceValue.locality.world.entity_id !== profile.data.world_id ||
    sourceValue.locality.locus.entity_id !== locusValue.locus_id
  )
    return fail("GENESIS_SHAPE", "the locus and source do not belong to the one world and locus");
  projected.sort((a, b) => cmp(a.fact_key, b.fact_key));
  const pins = projected.map((p) => ({ fact_key: p.fact_key, version: p.version }));
  return ok({
    world_id: profile.data.world_id,
    locus_id: locusValue.locus_id,
    source: { fact_key: source.key, version: source.version },
    pc: pcs[0] ? { fact_key: pcs[0].key, version: pcs[0].version } : null,
    pins,
    facts: projected,
    projection_hash: sha256Canonical(projected),
  });
}
