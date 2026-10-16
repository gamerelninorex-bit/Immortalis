/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary fact values */
import {
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldPcLocusCustodyKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { derivePcPhysicalLocusCustody, factKind } from "@immortalis/engine";
import { ACTOR_SMITH, FIXTURE_CAMPAIGN, group, write } from "@immortalis/testkit";
import {
  handoverActor,
  readyForHandover,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "./existing-actor.ts";
import { must } from "./temporal.ts";
import { tempDir } from "./tmp.ts";

/**
 * SYNTHETIC TEST SUPPORT for the Active-PC Post-Handover Physical Locus Custody slice. The owners are the real ones: the
 * existing-actor harness supplies the already-completed handover this slice consumes; nothing here is a fixture owner.
 */
export const PC = ACTOR_SMITH;
export const custodyKey = (pcId = PC): string => worldPcLocusCustodyKey(pcId);

export const custodyPublication = (n: number) => ({
  group_id: `custody-group-${n}`,
  intent_id: `custody-intent-${n}`,
  cause: `custody-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});

/** What a caller presents to establish the custody: the canonical PC identity only (plus publication identity). */
export const custodyInput = (n: number, pcId = PC) => ({ ...custodyPublication(n), pc_id: pcId });

export const establishCustody = (s: Pick<ExistingActorSeeded, "campaign">, n: number, pcId = PC) =>
  s.campaign.establishPcPhysicalLocusCustody(custodyInput(n, pcId));

/** The lawful, completed Existing-Actor → PC handover: the state this slice may consume. No custody exists yet. */
export async function handedOverCampaign(
  dir = tempDir(),
  o: Parameters<typeof seededExistingActorCampaign>[1] = {},
  contract?: Parameters<typeof readyForHandover>[3],
): Promise<ExistingActorSeeded> {
  const s = await seededExistingActorCampaign(dir, o);
  await readyForHandover(s, undefined, undefined, contract);
  await must(handoverActor(s, 1));
  return s;
}

/** Every committed fact, by key, cloned: lets a test prove that nothing but the one custody record changed. */
export const snapshotFacts = (s: Pick<ExistingActorSeeded, "campaign">) =>
  new Map(s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f)]));

/**
 * A raw (store-level) custody group, built mechanically from the committed facts exactly as `establishPcPhysicalLocusCustody`
 * would build it, then optionally edited, so a test can present a forged or tampered record to a store that has admission but
 * is reached without the owner path.
 */
export function rawCustody(
  s: Pick<ExistingActorSeeded, "campaign">,
  n: number,
  pcId = PC,
  edit: (value: any) => void = () => undefined,
  groupOver: Partial<CommitGroup> = {},
): CommitGroup {
  const store = s.campaign.store;
  const derived = derivePcPhysicalLocusCustody(pcId, store);
  if (!derived.ok) throw new Error(derived.error.message);
  const value: any = structuredClone(derived.value);
  edit(value);
  const keys = [
    pcExistenceContractKey(pcId),
    PLAYER_CHARACTER_BINDING_KEY,
    worldActorCouplingKey(pcId),
    value.stationary_locus.world.fact_key,
    value.stationary_locus.locus.fact_key,
  ];
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(custodyKey(pcId), value as never, {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
      }),
    ],
    {
      owner: "world_state",
      facet: "world_fallback_physical_entity",
      rule: factKind("world_pc_locus_custody").rule,
      reads: keys.map((k) => ({ key: k, version: store.getFact(k)?.version ?? 0 })),
      depends_on: [
        ...new Set(
          keys.flatMap((k) => (store.getFact(k) ? [store.getFact(k)!.provenance.group_id] : [])),
        ),
      ],
      ...groupOver,
    },
  );
}
