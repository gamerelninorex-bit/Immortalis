/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary fact and group values */
// SYNTHETIC TEST SUPPORT for the S-4 initial Standing Instruction ledger. The owners, the registry, admission and the journal are
// the real ones; only the fixture world / locus / PC contract come from the shared testkit. Nothing here supplies a verdict that a
// test then claims to prove: the ledger is initialized by the engine's own operation from committed facts, and a forged group is
// built to be REFUSED, never to be accepted.
import {
  CANON_WRITE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PC_LEDGER_BINDING_RULE,
  PC_LEDGER_RULE,
  deriveLegacyPcLedger,
  deriveNewPcLedger,
  factKind,
  headOfVersion,
  ledgerPublication,
  sealLedgerVersion,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
} from "@immortalis/testkit";
import { must } from "./temporal.ts";

export const PC = FIXTURE_PC_ID;
export const W = FIXTURE_WORLD_ID;
export const L = FIXTURE_LOCUS_ID;
export const HEAD_KEY = pcStandingLedgerHeadKey(PC);
export const VERSION_KEY = pcStandingLedgerVersionKey(PC, 1);

/** The identities every fixture ledger initialization and binding names. */
export const target = (
  over: Partial<{ pc_id: string; world_id: string; locus_id: string }> = {},
) => ({
  pc_id: PC,
  world_id: W,
  locus_id: L,
  ...over,
});

/** The ordinary first-ACTIVATION binding input (publication number `n`) the fixture world uses. */
export const bindInput = (n = 4, over: Record<string, unknown> = {}) => ({
  ...publication(n),
  pc_id: PC,
  world_id: W,
  locus_id: L,
  insertion: fixtureInsertionFact(),
  ...over,
});

/** A world, a locus and a released fresh PC. Nothing is initialized, nothing is bound. */
export async function releasedCampaign(
  dir: string,
  o: { buildId?: string; fs?: any } = {},
): Promise<CanonicalCampaign> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "s4-ledger",
      ...(o.fs ? { fs: o.fs } : {}),
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  return campaign;
}

/** The lawful new-PC sequence: initialize the ledger (engine-derived), then bind. */
export async function activateWithLedger(campaign: CanonicalCampaign): Promise<void> {
  await must(campaign.initializePcStandingInstructionLedger(target()));
  await must(campaign.bindPlayerCharacter(bindInput()));
}

export async function reopen(
  dir: string,
  buildId = "s4-ledger-reopen",
): Promise<CanonicalCampaign> {
  return must(CanonicalCampaign.open(dir, { buildId }));
}

/** The committed facts, by key, as a plain object (for byte-for-byte before/after comparisons). */
export const snapshot = (store: CampaignStore): Record<string, OwnerFact> =>
  Object.fromEntries(store.listFacts().map((f) => [f.key, f]));

export const code = async (
  p: Promise<{ ok: boolean; error?: { code: string } }>,
): Promise<string> => {
  const r = await p;
  return r.ok ? "OK" : r.error!.code;
};

/**
 * A raw (store-level) ledger group built mechanically from the committed facts exactly as `initializePcStandingInstructionLedger`
 * would build it, then optionally edited, so a test can present a forged ledger to a store that has admission but is reached
 * without the owner path. The caller edits the group; every edit is expected to be REFUSED with the same canonical rejection.
 */
export async function rawLedgerGroup(
  campaign: CanonicalCampaign,
  edit: (g: any) => void = () => undefined,
): Promise<CommitGroup> {
  // built from the same public derivation the owner path uses, then presented raw
  const facts = new Map(campaign.store.listFacts().map((f) => [f.key, f]));
  const plan = deriveNewPcLedger(facts, target());
  if (!plan.ok) throw new Error(`cannot derive a ledger plan: ${plan.error.message}`);
  return rawGroupFromPlan(campaign, plan.value, edit);
}

/** The raw START_OF_LEDGER (L-2) group of an existing bound PC, built from the committed facts, then optionally edited. */
export function rawLegacyLedgerGroup(
  campaign: CanonicalCampaign,
  pcId: string,
  edit: (g: any) => void = () => undefined,
): CommitGroup {
  const facts = new Map(campaign.store.listFacts().map((f) => [f.key, f]));
  const plan = deriveLegacyPcLedger(facts, { pc_id: pcId });
  if (!plan.ok) throw new Error(`cannot derive a legacy ledger plan: ${plan.error.message}`);
  return rawGroupFromPlan(campaign, plan.value, edit, pcId);
}

function rawGroupFromPlan(
  campaign: CanonicalCampaign,
  p: {
    head: any;
    version: any;
    publication: any;
    pinned: readonly string[];
    absent: readonly string[];
  },
  edit: (g: any) => void,
  pcId: string = PC,
): CommitGroup {
  const pin = (k: string) => campaign.store.getFact(k);
  const headKey = pcStandingLedgerHeadKey(pcId);
  const versionKey = pcStandingLedgerVersionKey(pcId, 1);
  const group: any = {
    campaign_id: campaign.store.head().campaign_id,
    group_id: p.publication.group_id,
    intent_id: p.publication.intent_id,
    owner: "pc_existence",
    facet: "standing_instruction_ledger",
    cause: p.publication.cause,
    rule: PC_LEDGER_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [
      ...p.pinned.map((k) => ({ key: k, version: pin(k)?.version ?? 0 })),
      ...p.absent.map((k) => ({ key: k, version: 0 })),
    ],
    depends_on: [
      ...new Set(p.pinned.flatMap((k) => (pin(k) ? [pin(k)!.provenance.group_id] : []))),
    ],
    writes: [
      {
        key: headKey,
        owner: "pc_existence",
        facet: "standing_instruction_ledger",
        value: structuredClone(p.head),
        unit: null,
        basis: "s4-pc-standing-instruction-ledger-initial",
        secrecy: "pc-bookkeeping-internal",
        expected_version: 0,
      },
      {
        key: versionKey,
        owner: "pc_existence",
        facet: "standing_instruction_ledger",
        value: structuredClone(p.version),
        unit: null,
        basis: "s4-pc-standing-instruction-ledger-initial",
        secrecy: "pc-bookkeeping-internal",
        expected_version: 0,
      },
    ],
  };
  edit(group);
  return group as CommitGroup;
}

/**
 * A raw (store-level) first-ACTIVATION binding group built mechanically from the committed facts exactly as `bindPlayerCharacter`
 * would build it, under the citation and with the reads the caller selects, so a test can present a headless, mis-cited or
 * mis-pinned binding to a store that has admission but is reached without the owner path.
 */
export function rawBinding(
  campaign: CanonicalCampaign,
  n: number,
  o: {
    citation?: "S4" | "ORIGINAL";
    withLedgerReads?: boolean;
    edit?: (value: any, group: any) => void;
  } = {},
): CommitGroup {
  const store = campaign.store;
  const version = (k: string) => store.getFact(k)?.version ?? 0;
  const keys = [
    pcExistenceContractKey(PC),
    worldProfileKey(W),
    worldLocusKey(W, L),
    ...(o.withLedgerReads === false ? [] : [HEAD_KEY, VERSION_KEY]),
  ];
  const value: any = {
    binding_slot: "role.player_character",
    active_pc: { fact_key: pcExistenceContractKey(PC), entity_id: PC },
    coupling: {
      world: { fact_key: worldProfileKey(W), entity_id: W },
      locus: { fact_key: worldLocusKey(W, L), entity_id: L },
    },
    transition: {
      type: "ACTIVATION",
      basis: {
        ...fixtureInsertionFact(),
        pinned_versions: {
          pc: version(pcExistenceContractKey(PC)),
          world: version(worldProfileKey(W)),
          locus: version(worldLocusKey(W, L)),
        },
      },
    },
    prior_binding: null,
    replacement_binding: null,
    intrinsic_authority_migration: [],
    writer: { role: "role.archivist", permission: "permission.canon.write" },
  };
  const group: any = {
    campaign_id: store.head().campaign_id,
    group_id: `raw-bind-group-${n}`,
    intent_id: `raw-bind-intent-${n}`,
    owner: "role_registry",
    facet: "player_character_binding",
    cause: `raw-bind-cause-${n}`,
    rule:
      o.citation === "ORIGINAL"
        ? factKind("player_character_binding").rule
        : PC_LEDGER_BINDING_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: keys.map((k) => ({ key: k, version: version(k) })),
    depends_on: [
      ...new Set(
        keys.flatMap((k) => (store.getFact(k) ? [store.getFact(k)!.provenance.group_id] : [])),
      ),
    ],
    writes: [
      {
        key: PLAYER_CHARACTER_BINDING_KEY,
        owner: "role_registry",
        facet: "player_character_binding",
        value,
        unit: null,
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        expected_version: 0,
      },
    ],
  };
  o.edit?.(value, group);
  return group as CommitGroup;
}

/**
 * After a test edits a raw ledger group's VERSION body, recompute everything that is DERIVED from it (the digest, the head that
 * points at it and the group's canonical identity), so the forged group differs from a genuine one in exactly the way the test
 * edited and not merely by a stale digest. Whatever the test edited stays in force.
 */
export function reseal(group: any): any {
  const version = group.writes.find((w: any) =>
    w.key.includes("/standing-instruction-ledger/version/"),
  )!;
  const head = group.writes.find((w: any) => w.key.endsWith("/standing-instruction-ledger/head"))!;
  const body = { ...version.value };
  delete body.content_sha256;
  version.value = sealLedgerVersion(body);
  head.value = headOfVersion(version.value);
  const p = ledgerPublication(body);
  group.group_id = p.group_id;
  group.intent_id = p.intent_id;
  group.cause = p.cause;
  return group;
}
