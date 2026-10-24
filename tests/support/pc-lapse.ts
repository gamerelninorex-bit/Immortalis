// SYNTHETIC TEST SUPPORT for the R-4 lapse settlement (NEWLY AUTHORIZED; BLUE Lapse Settlement v1.2; independent review pending). Nothing
// here is a real player, a real GM or a reading: it drives the existing gateways and the settlement's own presenter.
import {
  PLAYER_CHARACTER_BINDING_KEY,
  PLAYER_CHOICE_AUTHORITY,
  popPcOccupancyKey,
  productionPcCollectionLapseKey,
  temporalObjectKey,
  productionExtractionObjectId,
  type CanonicalTime,
} from "@immortalis/contracts";
import { PopulationAdapter, TemporalCoordinator, StageProviderRegistry } from "@immortalis/engine";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcHeldTargetAdvanceContext,
  bindTrustedActivePcTargetAdvanceContext,
  settlePcCollectionLapse,
} from "@immortalis/protocol";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID, popPublication } from "@immortalis/testkit";
import { pcTargetTransaction } from "./pc-target-advance.ts";
import { must } from "./temporal.ts";
import { ACT_A, PC, T0, extractionId, type CollectionSeeded, at } from "./pc-collection.ts";

export { PLAYER_CHOICE_AUTHORITY, PLAYER_CHARACTER_BINDING_KEY };

/** The player's separately confirmed advance of the active PC toward a target (the existing gateway). */
export const advanceTo = (s: Pick<CollectionSeeded, "campaign">, value: number, tx: string) =>
  advanceActivePcToTarget(
    bindTrustedActivePcTargetAdvanceContext({
      campaign: s.campaign as never,
      pc_id: PC,
      target: at(value),
      transaction: pcTargetTransaction(tx) as never,
    }),
    { operation: "advance_active_pc_to_target" },
  );

/** The player's NEW, separate choice to continue the held work (the existing held-resume gateway). */
export const resumeHeld = (
  s: Pick<CollectionSeeded, "campaign">,
  heldTransaction: string,
  target: CanonicalTime,
  tx: string,
) =>
  advanceActivePcToTarget(
    bindTrustedActivePcHeldTargetAdvanceContext({
      campaign: s.campaign as never,
      pc_id: PC,
      held: { from_transaction: heldTransaction, target },
      transaction: pcTargetTransaction(tx) as never,
    }),
    { operation: "advance_active_pc_to_target" },
  );

export const resident = (id: string, presence = "place-village") => ({
  unit_id: id,
  residence: "place-village",
  presence,
  burden_allocation: null,
});

/** A Population ledger attached to the locus: it makes the closure and the scope STALE (an arriving resident the declaration did not cover). */
export const addLedger = (
  s: Pick<CollectionSeeded, "campaign">,
  id: string,
  units: ReturnType<typeof resident>[],
  n: number,
) =>
  must(
    new PopulationAdapter(s.campaign.store).establishLedger({
      ...popPublication(n),
      ledger: {
        ledger_id: id,
        unit_class: "synthetic-unit-class",
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
        units: [...units].sort((a, b) => (a.unit_id < b.unit_id ? -1 : 1)),
        point: T0,
      },
    }),
  );

export const settle = (s: Pick<CollectionSeeded, "campaign">) =>
  settlePcCollectionLapse(s.campaign as never);

export const lapseKey = (actId = ACT_A) => productionPcCollectionLapseKey(extractionId(actId));
export const occupancyKey = popPcOccupancyKey(PC);
export const objectKey = (actId = ACT_A) =>
  temporalObjectKey(productionExtractionObjectId(extractionId(actId)));

export const stateOf = (s: Pick<CollectionSeeded, "campaign">) =>
  new TemporalCoordinator(s.campaign.store, new StageProviderRegistry()).state()!.value;

/** An active-PC advance that crosses the act's earned boundary B with the first stage refused: the kernel stops there and HOLDS the remainder. */
export async function holdAtBoundary(
  s: CollectionSeeded,
  target = T0.value + 4 * 7,
  tx = "tx-cross",
) {
  const r = await advanceTo(s, target, tx);
  return { r, state: stateOf(s), target: at(target) };
}

/** The set of fact keys in the store (to prove which facts a step ADDED). */
export const keySet = (s: Pick<CollectionSeeded, "campaign">): Set<string> =>
  new Set(s.campaign.store.listFacts().map((f) => f.key));

export const lapsePub = (n: string) => ({
  group_id: `lapse-group-${n}`,
  intent_id: `lapse-intent-${n}`,
  cause: `lapse-cause-${n}`,
  basis: "fixture-basis",
  secrecy: "fixture-visibility",
});
