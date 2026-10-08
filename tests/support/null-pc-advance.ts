/* eslint-disable @typescript-eslint/no-explicit-any -- tests swap the campaign's store to simulate lost replies and crashes */
import {
  PLAYER_CHOICE_AUTHORITY,
  PLAYER_CHARACTER_BINDING_KEY,
  logisticsDeliveryKey,
  type CanonicalTime,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  LogisticsAdapter,
  ProductionAdapter,
  TemporalCoordinator,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_WORLD_ID,
  LOGISTICS_FIXTURE_EXTENSION,
  SYNTH_EXTENSION,
  T0,
  engagedObject,
  syntheticProviders,
  syntheticSourceGroup,
  OTHER_LOCUS_ID,
  PROD_T0,
  PROD_T1,
  REQ_1,
  REQ_2,
  REQ_OTHER,
  RESERVE_OTHER,
  fixtureDestinationLocus,
  fixtureLocus,
  fixtureWorld,
  prodPublication,
  publication,
  requestGroup,
  reserveInput,
  temporalPublication,
} from "@immortalis/testkit";
import {
  advanceNullPcOocToTarget,
  bindTrustedNullPcOocTargetAdvanceContext,
} from "@immortalis/protocol";
import { entityIdOf, logCoordinator, type LogSeeded } from "./logistics.ts";
import { must } from "./temporal.ts";

export { PROD_T0, PROD_T1, PLAYER_CHARACTER_BINDING_KEY };

/** The exact host request: the operation name and nothing else. */
export const NULL_PC_REQUEST = (over: Record<string, unknown> = {}) => ({
  operation: "advance_null_pc_ooc_to_target",
  ...over,
});

export const NULL_PC_REFUSAL = JSON.stringify({
  ok: false,
  error: { code: "NULL_PC_ADVANCE_UNAVAILABLE", message: "no advance is available" },
});
export const NULL_PC_COMMITTED = { ok: true, value: { status: "NULL_PC_ADVANCE_COMMITTED" } };
export const NULL_PC_UNKNOWN = {
  ok: false,
  error: {
    code: "NULL_PC_ADVANCE_OUTCOME_UNKNOWN",
    message: "the outcome is not known: present the same request again",
  },
};

export const NULL_PC_TX = "tx-null-pc-ooc-advance";

/** The trusted side's authored transaction identity and provenance for the player's OOC choice. */
export const nullPcTransaction = (
  id: string = NULL_PC_TX,
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  transaction_id: id,
  cause: `cause-${id}`,
  trigger: { kind: "player-ooc-advance-choice", ref: `choice-${id}` },
  context: { ...PLAYER_CHOICE_AUTHORITY },
  publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
  ...over,
});

/** The trusted side's binding for one campaign, after the player's OOC choice to advance to `target`. */
export const trustedNullPcAdvance = (
  s: Pick<LogSeeded, "campaign">,
  over: { target?: unknown; transaction?: unknown; campaign?: unknown } = {},
) =>
  bindTrustedNullPcOocTargetAdvanceContext({
    campaign: ("campaign" in over ? over.campaign : s.campaign) as never,
    target: ("target" in over ? over.target : PROD_T1) as CanonicalTime,
    transaction: ("transaction" in over ? over.transaction : nullPcTransaction()) as never,
  });

/** The host's call. The request is passed through verbatim (an explicit `undefined` is a hostile request, not a default). */
export const advanceNull = (
  context: ReturnType<typeof trustedNullPcAdvance>,
  ...request: [] | [unknown]
) => advanceNullPcOocToTarget(context, request.length === 0 ? NULL_PC_REQUEST() : request[0]);

/**
 * The prerequisite canonical campaign of the Logistics proof WITHOUT a player character: world, origin and two further loci,
 * the production proof's requester requests, two Reserves and the canonical temporal basis T0. `role.player_character` is NULL
 * (no PC is released or bound), and no entity exists yet.
 */
export async function seededNullPcCampaign(
  dir: string,
  o: { buildId?: string } = {},
): Promise<LogSeeded> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: o.buildId ?? "null-pc-seed",
      extension: LOGISTICS_FIXTURE_EXTENSION,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(campaign.establishLocus({ ...publication(5), locus: fixtureDestinationLocus() }));
  await must(
    campaign.establishLocus({ ...publication(6), locus: fixtureDestinationLocus(OTHER_LOCUS_ID) }),
  );
  const store = campaign.store;
  let n = 1;
  for (const id of [REQ_1, REQ_2, REQ_OTHER])
    await must(store.commit(requestGroup(FIXTURE_CAMPAIGN, n++, id)));
  const s: LogSeeded = {
    campaign,
    coordinator: logCoordinator(store),
    production: new ProductionAdapter(store),
    logistics: new LogisticsAdapter(store),
  };
  await must(s.production.establishReserve({ ...prodPublication(1), reserve: reserveInput() }));
  await must(
    s.production.establishReserve({
      ...prodPublication(2),
      reserve: reserveInput(RESERVE_OTHER, 7),
    }),
  );
  await must(s.coordinator.establishCanonicalTime({ ...temporalPublication(1), time: PROD_T0 }));
  return s;
}

/**
 * A NULL-PC campaign whose only registered Temporal work belongs to a synthetic fixture owner with NO shipped provider: the
 * kernel has nothing real to run for it, and the gateway must neither supply nor fake one.
 */
export async function seededNullPcSyntheticCampaign(
  dir: string,
): Promise<{ campaign: CanonicalCampaign; coordinator: TemporalCoordinator }> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: "null-pc-synth",
      extension: SYNTH_EXTENSION,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(campaign.store.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 1, "source-v1", 0)));
  const coordinator = new TemporalCoordinator(campaign.store, syntheticProviders());
  await must(coordinator.establishCanonicalTime({ ...temporalPublication(1), time: T0 }));
  await must(coordinator.registerObject({ ...temporalPublication(2), object: engagedObject() }));
  return { campaign, coordinator };
}

/** Swap the campaign's store for one that refuses (IM-11) the Logistics delivery stage of `requestId`'s entity. */
export function refuseNullPcDeliveryStage(
  s: Pick<LogSeeded, "campaign">,
  requestId: string,
): () => void {
  const real = s.campaign.store;
  const deliveryKey = logisticsDeliveryKey(FIXTURE_WORLD_ID, entityIdOf(requestId));
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return (g: CommitGroup) =>
          target.commit(
            g.writes.some((w) => w.key === deliveryKey)
              ? {
                  ...g,
                  writes: g.writes.map((w) =>
                    w.key === deliveryKey
                      ? {
                          ...w,
                          value: (({ ...v }: any) => ({
                            ...v,
                            timing: { ...v.timing, occurs_at: { unit: "t", value: 999999 } },
                          }))(w.value as any),
                        }
                      : w,
                  ),
                }
              : g,
          );
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}

/** Swap the campaign's store for one that commits the group matching `pred` and then LOSES the reply (an unknown outcome). */
export function loseReplyWhenNull(
  s: Pick<LogSeeded, "campaign">,
  pred: (g: CommitGroup) => boolean,
): () => void {
  const real = s.campaign.store;
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) => {
          const r = await target.commit(g);
          return pred(g)
            ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
            : r;
        };
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}

/** Swap the campaign's store for one that commits NOTHING (an unknown outcome) for the first group matching `pred`. */
export function crashWhenNull(
  s: Pick<LogSeeded, "campaign">,
  pred: (g: CommitGroup) => boolean,
): () => void {
  const real = s.campaign.store;
  (s.campaign as any).store = new Proxy(real, {
    get(target, prop) {
      if (prop === "commit")
        return async (g: CommitGroup) =>
          pred(g)
            ? ({
                ok: false,
                error: { code: "UNKNOWN_OUTCOME", message: "simulated crash before this group" },
              } as never)
            : target.commit(g);
      const v = Reflect.get(target, prop, target);
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
  return () => ((s.campaign as any).store = real);
}
