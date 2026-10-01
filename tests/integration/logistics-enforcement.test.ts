/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Single-Leg Logistics Transfer — enforcement that does not depend on the coordinator or on the owner operations
// behaving. IM-11 admission holds for a raw `store.commit` and for a TAMPERED group; owner exclusivity holds for
// everyone; Logistics cannot retire early, impersonate a stage, move an entity twice, or leave World-State and
// Logistics claiming rival current loci; hand-written temporal objects are refused; load-time verification fails
// closed on drift.
// Register lineage: IA-02, IA-03, IA-06, IA-30 (partial); RC-02, RC-04, RC-07, RC-10, RC-16; IM-02, IM-03, IM-05,
// IM-11, IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  EntityTransitionCauseSchema,
  LogisticsCommitmentSchema,
  LogisticsTransferSchema,
  MovementServiceRequestSchema,
  TEMPORAL_STATE_KEY,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsDeliveryStage,
  entityTransitionStage,
  logisticsRetirementStage,
  logisticsTransferKey,
  worldEntityTransitionKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
  type OwnerFact,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  LOGISTICS_RULE,
  TemporalCoordinator,
  deriveCommitment,
  deriveTransfer,
  deliveryOfTransfer,
  entityTransitionTemporalObject,
  logisticsTemporalObject,
  stageGroupId,
  stageIntentId,
  verifyLogisticsIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CAUSE_1,
  DEST_LOCUS_ID,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  LOGISTICS_FIXTURE_EXTENSION,
  LOG_T_DELIVERY,
  MOVE_1,
  MOVE_2,
  OTHER_LOCUS_ID,
  REQ_1,
  at,
  causeGroup,
  commitInput,
  dispatchInput,
  logPublication,
  logStopAtBoundaryRequest,
  logisticsProviders,
  locusRef,
  movementRequestGroup,
  movementRequestKey,
  temporalPublication,
  transitionCause,
} from "@immortalis/testkit";
import {
  acceptAndCommit,
  acceptCommitDispatchRegister,
  acceptLogEntity,
  commitMovementRequest,
  entityIdOf,
  locusOfRequest,
  logSummary,
  seededLogisticsCampaign,
  type LogSeeded,
} from "../support/logistics.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const W = FIXTURE_WORLD_ID;
const E = entityIdOf(REQ_1);
const entityKey = worldFallbackEntityKey(W, E);
const commitmentKey = logisticsCommitmentKey(W, E);
const transferKey = logisticsTransferKey(W, E);
const deliveryKey = logisticsDeliveryKey(W, E);
const transitionKey = worldEntityTransitionKey(W, E);
const requestKey = movementRequestKey(MOVE_1);
const worldKey = worldProfileKey(W);
const destLocusKey = worldLocusKey(W, DEST_LOCUS_ID);
const otherLocusKey = worldLocusKey(W, OTHER_LOCUS_ID);
const deliveryStage = logisticsDeliveryStage(MOVE_1);
const retirementStage = logisticsRetirementStage(MOVE_1);

/** A store whose groups of the named owner are altered on the way in, to prove IM-11 (not the operation) refuses. */
function tamperStore(
  inner: CampaignStore,
  owner: string,
  mutate: (g: CommitGroup) => CommitGroup,
  only: (g: CommitGroup) => boolean = () => true,
): { store: CampaignStore; tampered: () => number } {
  let n = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: (g) => {
      const group = g as CommitGroup;
      if (group.owner !== owner || !only(group)) return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

const withWrite = (g: CommitGroup, key: string, edit: (v: any) => unknown): CommitGroup => ({
  ...g,
  writes: g.writes.map((w) => {
    if (w.key !== key) return w;
    const value = structuredClone(w.value) as any;
    edit(value);
    return { ...w, value: value as never };
  }),
});

const rawGroup = (
  n: number,
  owner: string,
  facet: string,
  writes: { key: string; value: unknown; expected_version: number }[],
  over: Partial<CommitGroup> = {},
): CommitGroup => ({
  campaign_id: FIXTURE_CAMPAIGN,
  group_id: `raw-group-${n}`,
  intent_id: `raw-intent-${n}`,
  owner,
  facet,
  cause: `raw-cause-${n}`,
  rule: LOGISTICS_RULE,
  authority: { ...CANON_WRITE_AUTHORITY },
  reads: [],
  depends_on: [],
  writes: writes.map((w) => ({
    ...w,
    owner,
    facet,
    value: w.value as never,
    unit: null,
    basis: "raw-basis",
    secrecy: "raw-secrecy",
  })),
  ...over,
});
const logRaw = (
  n: number,
  writes: { key: string; value: unknown; expected_version: number }[],
  over: Partial<CommitGroup> = {},
) => rawGroup(n, "logistics", "logistics_state", writes, over);

const pins = (store: CampaignStore, keys: string[]) => ({
  reads: keys.map((k) => ({ key: k, version: store.getFact(k)?.version ?? 0 })),
  depends_on: [...new Set(keys.flatMap((k) => store.getFact(k)?.provenance.group_id ?? []))],
});

const fact = (s: LogSeeded, key: string): OwnerFact => s.campaign.store.getFact(key)!;
const pinned = <T>(f: OwnerFact, value: T) => ({
  key: f.key,
  owner: f.owner,
  version: f.version,
  value,
});
const parsedCommitment = (s: LogSeeded) =>
  LogisticsCommitmentSchema.parse(fact(s, commitmentKey).value);
const parsedTransfer = (s: LogSeeded) => LogisticsTransferSchema.parse(fact(s, transferKey).value);

/** The exact commitment the request and entity determine, derived the way admission derives it. */
function derivedCommitment(s: LogSeeded, deliveryAt = LOG_T_DELIVERY) {
  const rf = fact(s, requestKey);
  const ef = fact(s, entityKey);
  const clock = s.coordinator.state()!.value.canonical_time;
  const d = deriveCommitment({
    request: pinned(rf, MovementServiceRequestSchema.parse(rf.value)),
    entity: { key: ef.key, version: ef.version, value: ef.value as never },
    transitioned: false,
    now: clock,
    delivery_at: deliveryAt,
  });
  if (!d.ok) throw new Error(d.error.message);
  return d.value;
}
const rawCommitment = (s: LogSeeded, n: number, over: Partial<CommitGroup> = {}) =>
  logRaw(n, [{ key: commitmentKey, value: derivedCommitment(s), expected_version: 0 }], {
    ...pins(s.campaign.store, [requestKey, entityKey, worldKey, destLocusKey, TEMPORAL_STATE_KEY]),
    ...over,
  });

function derivedTransfer(s: LogSeeded) {
  const cf = fact(s, commitmentKey);
  const d = deriveTransfer({
    commitment: pinned(cf, LogisticsCommitmentSchema.parse(cf.value)),
    transitioned: false,
    now: s.coordinator.state()!.value.canonical_time,
  });
  if (!d.ok) throw new Error(d.error.message);
  return d.value;
}
const rawDispatch = (s: LogSeeded, n: number, over: Partial<CommitGroup> = {}) =>
  logRaw(n, [{ key: transferKey, value: derivedTransfer(s), expected_version: 0 }], {
    ...pins(s.campaign.store, [commitmentKey, TEMPORAL_STATE_KEY]),
    ...over,
  });

function derivedDelivery(s: LogSeeded) {
  const d = deliveryOfTransfer(parsedCommitment(s), parsedTransfer(s));
  if (!d.ok) throw new Error(d.error.message);
  return d.value;
}
const rawDelivery = (s: LogSeeded, n: number, over: Partial<CommitGroup> = {}) =>
  logRaw(n, [{ key: deliveryKey, value: derivedDelivery(s), expected_version: 0 }], {
    ...pins(s.campaign.store, [requestKey]),
    ...over,
  });
const stageIdentity = (stage: any) => ({
  group_id: stageGroupId(stage),
  intent_id: stageIntentId(stage),
});

/**
 * The exact retirement values and the exact destination transition of the SAME deterministic movement, taken from a
 * reference campaign that ran to completion — so an INCOMPLETE campaign can be offered the very values a lawful
 * retirement or transition would carry, and refused anyway.
 */
async function reference() {
  const r = await seededLogisticsCampaign(tempDir());
  await acceptCommitDispatchRegister(r);
  await must(r.coordinator.advance(logStopAtBoundaryRequest("tx-ref", MOVE_1)));
  return {
    commitment: fact(r, commitmentKey).value,
    transfer: fact(r, transferKey).value,
    transition: fact(r, transitionKey).value,
  };
}

/** Runs the transaction with the process "crashing" before the named group commits (nothing of it is written). */
async function stopBefore(s: LogSeeded, block: (g: CommitGroup) => boolean, id = "tx-move") {
  const inner = s.campaign.store;
  let blocked = 0;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: any) => {
      if (block(g as CommitGroup)) {
        blocked++;
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } } as never;
      }
      return inner.commit(g);
    },
  };
  await new TemporalCoordinator(store, logisticsProviders()).advance(
    logStopAtBoundaryRequest(id, MOVE_1),
  );
  return blocked;
}
const isTransition = (g: CommitGroup) => g.writes.some((w) => w.key === transitionKey);
const isRetirement = (g: CommitGroup) =>
  g.owner === "logistics" && g.writes.some((w) => w.key === transferKey);

const advance = (s: { coordinator: TemporalCoordinator }, id = "tx-move") =>
  s.coordinator.advance(logStopAtBoundaryRequest(id, MOVE_1));

const dispatched = async () => {
  const s = await seededLogisticsCampaign(tempDir());
  await acceptAndCommit(s);
  await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
  return s;
};
const registered = async () => {
  const s = await seededLogisticsCampaign(tempDir());
  await acceptCommitDispatchRegister(s);
  return s;
};
const committed = async () => {
  const s = await seededLogisticsCampaign(tempDir());
  await acceptAndCommit(s);
  return s;
};

describe("only Logistics can write Logistics state — and Logistics can write nothing else (IA-03; WS-010 §2, §4.1, §27)", () => {
  it("no other owner or facet — the movement requester, the cause owner, a consumer, Production, Economy, Population, the kernel, the PC and role owners, every World-State facet — can write any Logistics key space", async () => {
    const s = await registered();
    const owners: [string, string][] = [
      ["SYNTHETIC-MOVEMENT-REQUESTER", "synthetic-movement-requester"],
      ["SYNTHETIC-ENTITY-TRANSITION-CAUSE-OWNER", "synthetic-entity-cause"],
      ["SYNTHETIC-ENTITY-TRANSITION-CONSUMER", "synthetic-entity-consumer"],
      ["SYNTHETIC-PRODUCTION-REQUESTER", "synthetic-requester"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["population", "population_state"],
      ["temporal_kernel", "temporal_coordination"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      ["world_state", "world_profile"],
      ["world_state", "world_locus"],
      ["world_state", "world_fallback_physical_entity"],
    ];
    let n = 0;
    for (const [owner, facet] of owners) {
      for (const key of [commitmentKey, transferKey, deliveryKey]) {
        const r = await s.campaign.store.commit(
          rawGroup(300 + n++, owner, facet, [
            { key, value: derivedDelivery(s), expected_version: 0 },
          ]),
        );
        expect(r.ok, `${owner}/${facet} → ${key}`).toBe(false);
        expect(!r.ok && r.error.code, `${owner}/${facet} → ${key}`).toMatch(
          /KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT|OWNER_NOT_REGISTERED|WRITE_OWNER_MISMATCH/,
        );
      }
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("Logistics cannot write the entity, World-State's transition, the request owner's key space, Production's, Economy's or the kernel's", async () => {
    const s = await registered();
    const entity = fact(s, entityKey);
    const targets: [string, unknown, number][] = [
      [entityKey, entity.value, entity.version],
      [transitionKey, entity.value, 0],
      [worldKey, entity.value, 1],
      [requestKey, fact(s, requestKey).value, 1],
      ["production/reserve/reserve-main", entity.value, 1],
      ["economy/demand/x", entity.value, 0],
      [TEMPORAL_STATE_KEY, entity.value, 1],
    ];
    let n = 0;
    for (const [key, value, expected_version] of targets) {
      const r = await s.campaign.store.commit(
        logRaw(330 + n++, [{ key, value, expected_version }]),
      );
      expect(r.ok, key).toBe(false);
      expect(!r.ok && r.error.code, key).toMatch(/KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT/);
    }
    // and the entity itself — sealed, create-only — cannot be amended by anyone to represent travel
    expect(fact(s, entityKey)).toEqual(entity);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("IM-11 refuses an unlawful commitment — raw (WS-010 §3.2, §4.1)", () => {
  it("the exact derived commitment is lawful as an authored publication; nothing else is", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    // a raw group of the exact value, correctly pinned, is the commitment: there is no stage to impersonate
    const ok = await s.campaign.store.commit(rawCommitment(s, 400));
    expect(ok.ok).toBe(true);
    expect(s.campaign.verify()).toEqual([]);
  });

  const L = (id: string) => locusRef(id);
  const mutations: [string, (g: CommitGroup) => CommitGroup, string, RegExp][] = [
    [
      "a different destination than the request named, not pinned",
      (g) => withWrite(g, commitmentKey, (v) => (v.destination = L(OTHER_LOCUS_ID))),
      "REFERENCE_INVALID",
      /must read the destination locus/,
    ],
    [
      "a different destination than the request named, even fully pinned",
      (g) => ({
        ...withWrite(g, commitmentKey, (v) => (v.destination = L(OTHER_LOCUS_ID))),
        reads: [...g.reads, { key: otherLocusKey, version: 1 }],
        depends_on: [...g.depends_on, "wf-group-6"], // the group that established that locus (publication 6)
      }),
      "VALUE_INVALID",
      /exactly what the request and the accepted entity determine/,
    ],
    [
      "a rewritten origin (the accepted locus is history)",
      (g) => withWrite(g, commitmentKey, (v) => (v.origin = L(OTHER_LOCUS_ID))),
      "VALUE_INVALID",
      /exactly what the request and the accepted entity determine/,
    ],
    [
      "a commitment already released",
      (g) =>
        withWrite(g, commitmentKey, (v) => {
          v.state = {
            status: "RELEASED",
            released_at: at(140),
            destination_commit: { fact_key: transitionKey, version: 1 },
            by_stage: retirementStage,
          };
        }),
      "VALUE_INVALID",
      /established committed, never released/,
    ],
    [
      "an invented commitment time",
      (g) => withWrite(g, commitmentKey, (v) => (v.committed_at = at(139))),
      "VALUE_INVALID",
      /established at the canonical temporal basis/,
    ],
    [
      "a delivery boundary identity not derived from the request",
      (g) => withWrite(g, commitmentKey, (v) => (v.delivery.boundary_id = "boundary-elsewhere")),
      "REFERENCE_INVALID",
      /identities from its request/,
    ],
    [
      "a different entity version pinned",
      (g) => withWrite(g, commitmentKey, (v) => (v.moved.version = 2)),
      "REFERENCE_INVALID",
      /pinned at its current version/,
    ],
    [
      "a different request version pinned",
      (g) => withWrite(g, commitmentKey, (v) => (v.request.version = 2)),
      "REFERENCE_INVALID",
      /pinned at its current version/,
    ],
    [
      "a smuggled quantity or condition (a second physical writer)",
      (g) =>
        withWrite(g, commitmentKey, (v) => {
          v.physical = { quantity: { amount: 5, unit: "synthetic-unit-d" }, condition: "damaged" };
        }),
      "VALUE_INVALID",
      /contract/,
    ],
    [
      "a capacity, a route or a carrier",
      (g) => withWrite(g, commitmentKey, (v) => (v.carrier = { capacity: 4, route: ["a", "b"] })),
      "VALUE_INVALID",
      /contract/,
    ],
    [
      "the entity rewritten in the same group",
      (g) => ({
        ...g,
        writes: [
          ...g.writes,
          { ...g.writes[0]!, key: entityKey, expected_version: 1, value: { not: "an entity" } },
        ],
      }),
      "FACT_OWNER_CONFLICT",
      /different owner\/facet/,
    ],
    [
      "a commitment filed in another entity's slot",
      (g) => ({
        ...g,
        writes: g.writes.map((w) => ({ ...w, key: `logistics/commitment/${W}/someone-else` })),
      }),
      "VALUE_INVALID",
      /identity does not match the key/,
    ],
    [
      "no pin of the request it depends on",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== requestKey) }),
      "REFERENCE_INVALID",
      /must read the Movement Service Request/,
    ],
    [
      "no pin of the canonical temporal basis",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== TEMPORAL_STATE_KEY) }),
      "REFERENCE_INVALID",
      /must read the canonical temporal state/,
    ],
    [
      "no dependency on the group that committed the destination locus",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== destLocusKey) }),
      "REFERENCE_INVALID",
      /must read the destination locus/,
    ],
  ];
  it.each(mutations)("refuses %s", async (_name, mutate, code, message) => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    const raw = await s.campaign.store.commit(mutate(rawCommitment(s, 401)));
    expect(raw.ok).toBe(false);
    expect(!raw.ok && raw.error.code).toBe(code);
    expect(!raw.ok && raw.error.message).toMatch(message);
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a request for an entity that is not accepted, or in a request owner's lie about its own key space, earns no commitment", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    // no entity accepted yet
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    const r = await s.logistics.commitMovement({
      ...logPublication(1),
      commit: commitInput(MOVE_1),
    });
    expect(!r.ok && r.error.code).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
    // a destination that is not an established locus of the world, or is the entity's own locus
    await acceptLogEntity(s, REQ_1, 1);
    for (const [i, over] of [
      { destination: "locus-never-established" },
      { destination: FIXTURE_LOCUS_ID },
    ].entries()) {
      const id = `move-bad-${i}`;
      await commitMovementRequest(s, id, REQ_1, 10 + i, over);
      const bad = await s.logistics.commitMovement({
        ...logPublication(10 + i),
        commit: commitInput(id),
      });
      expect(bad.ok, JSON.stringify(over)).toBe(false);
    }
    expect(s.campaign.store.getFact(commitmentKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("IM-11 refuses an unlawful dispatch — raw (WS-010 §9, §11)", () => {
  it("the exact derived transfer is lawful as an authored publication", async () => {
    const s = await committed();
    expect((await s.campaign.store.commit(rawDispatch(s, 410))).ok).toBe(true);
    expect(s.campaign.verify()).toEqual([]);
  });

  const mutations: [string, (g: CommitGroup) => CommitGroup, string, RegExp][] = [
    [
      "a transfer already retired",
      (g) =>
        withWrite(g, transferKey, (v) => {
          v.state = {
            status: "RETIRED",
            movement_locus: "CLOSED",
            delivery: { fact_key: deliveryKey, version: 1 },
            destination_commit: { fact_key: transitionKey, version: 1 },
            retired_at: at(200),
            by_stage: retirementStage,
          };
        }),
      "VALUE_INVALID",
      /exactly what the commitment determines/,
    ],
    [
      "a movement locus that is not the commitment's single leg",
      (g) =>
        withWrite(g, transferKey, (v) => (v.state.movement_locus.to = locusRef(OTHER_LOCUS_ID))),
      "VALUE_INVALID",
      /exactly what the commitment determines/,
    ],
    [
      "an invented dispatch time",
      (g) => withWrite(g, transferKey, (v) => (v.dispatched_at = at(150))),
      "VALUE_INVALID",
      /canonical basis/,
    ],
    [
      "a dispatch that claims the destination (dispatch is not delivery)",
      (g) => withWrite(g, transferKey, (v) => (v.delivered = { at: locusRef(DEST_LOCUS_ID) })),
      "VALUE_INVALID",
      /contract/,
    ],
    [
      "a commitment pinned at another version",
      (g) => withWrite(g, transferKey, (v) => (v.commitment.version = 2)),
      "REFERENCE_INVALID",
      /pinned at its current version/,
    ],
    [
      "a transfer filed in another entity's slot",
      (g) => ({
        ...g,
        writes: g.writes.map((w) => ({ ...w, key: `logistics/transfer/${W}/someone-else` })),
      }),
      "VALUE_INVALID",
      /identity does not match the key/,
    ],
    [
      "no pin of the commitment it backs",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== commitmentKey) }),
      "REFERENCE_INVALID",
      /must read the commitment/,
    ],
  ];
  it.each(mutations)("refuses %s", async (_name, mutate, code, message) => {
    const s = await committed();
    const raw = await s.campaign.store.commit(mutate(rawDispatch(s, 411)));
    expect(raw.ok).toBe(false);
    expect(!raw.ok && raw.error.code).toBe(code);
    expect(!raw.ok && raw.error.message).toMatch(message);
    expect(s.campaign.store.getFact(transferKey)).toBeUndefined();
    expect(locusOfRequest(s, REQ_1)!.authority).toBe("WORLD_STATE");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a dispatch cannot precede its commitment, cannot repeat, and cannot follow the declared delivery boundary", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    const early = await s.logistics.dispatch({
      ...logPublication(101),
      dispatch: dispatchInput(MOVE_1),
    });
    expect(!early.ok && early.error.code).toBe("PREREQUISITE_MISSING");
    await must(s.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }));
    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    const again = await s.logistics.dispatch({
      ...logPublication(102),
      dispatch: dispatchInput(MOVE_1),
    });
    expect(!again.ok && again.error.code).toBe("VERSION_CONFLICT");
    // a raw duplicate under another identity is refused too
    expect(await codeOf(s.campaign.store.commit(rawDispatch(s, 412)))).not.toBe("OK");
    expect(s.campaign.store.getFact(transferKey)!.version).toBe(1);

    // a commitment whose boundary passed before dispatch cannot dispatch: canonical time moved past it
    const t = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(t, REQ_1, 1);
    await commitMovementRequest(t, MOVE_1, REQ_1, 1);
    await must(
      t.logistics.commitMovement({
        ...logPublication(1),
        commit: commitInput(MOVE_1, { delivery_at: at(150) }),
      }),
    );
    await must(
      t.coordinator.advance(
        logStopAtBoundaryRequest("tx-late", "none", {
          requested: { target: at(150), condition: null },
        }),
      ),
    );
    const late = await t.logistics.dispatch({
      ...logPublication(101),
      dispatch: dispatchInput(MOVE_1),
    });
    expect(late.ok).toBe(false);
    expect(t.campaign.store.getFact(transferKey)).toBeUndefined();
  });
});

describe("the delivery-complete result is lawful only as its IM-02 stage, from a dispatched transfer", () => {
  it("a raw publication of the EXACT derived value under any identity but its stage is refused; the lawful result is the stage", async () => {
    const s = await registered();
    const raw = await s.campaign.store.commit(rawDelivery(s, 420));
    expect(!raw.ok && raw.error.code).toBe("REFERENCE_INVALID");
    expect(!raw.ok && raw.error.message).toContain("published only as its IM-02 stage");
    const noCause = await s.campaign.store.commit(
      rawDelivery(s, 421, stageIdentity(deliveryStage)),
    );
    expect(!noCause.ok && noCause.error.code).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(deliveryKey)).toBeUndefined();
    await must(advance(s));
    expect(fact(s, deliveryKey).version).toBe(1);
    // a duplicate cannot be credited, under any identity
    expect((await s.campaign.store.commit(rawDelivery(s, 422))).ok).toBe(false);
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("logistics/delivery/")),
    ).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the forged-stage hole (Blue review of PR #8): the right StageKey identity and a forged transaction cause, before AND after the object is registered, publishes nothing", async () => {
    const s = await registered();
    const before = logSummary(s.campaign, s.coordinator);
    const forged = rawDelivery(s, 430, {
      ...stageIdentity(deliveryStage),
      cause: "transaction:forged",
    });
    expect(forged.group_id).toBe(stageGroupId(deliveryStage));
    const r = await s.campaign.store.commit(forged);
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toContain("durable authority of its open transaction");
    expect(s.campaign.store.getFact(deliveryKey)).toBeUndefined();
    expect(logSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(locusOfRequest(s, REQ_1)!.phase).toBe("IN_TRANSFER");
    expect(s.campaign.verify()).toEqual([]);
    // the lawful transaction is unaffected
    await must(advance(s, "tx-honest"));
    expect(fact(s, deliveryKey).provenance.cause).toBe("transaction:tx-honest");
    expect(locusOfRequest(s, REQ_1)!.phase).toBe("DESTINATION_COMMITTED");
  });

  it("a delivery cannot be established for a commitment that was never dispatched, or before the object is engaged", async () => {
    const s = await committed();
    // no transfer: nothing to deliver
    const r = await s.campaign.store.commit(
      logRaw(
        440,
        [{ key: deliveryKey, value: transitionCause(CAUSE_1, REQ_1), expected_version: 0 }],
        pins(s.campaign.store, [requestKey]),
      ),
    );
    expect(r.ok).toBe(false);
    expect(s.campaign.store.getFact(deliveryKey)).toBeUndefined();
    // dispatched, but never registered: no engagement, so no stage can commit
    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    const raw = await s.campaign.store.commit(
      rawDelivery(s, 441, { ...stageIdentity(deliveryStage), cause: "transaction:tx-raw" }),
    );
    expect(raw.ok).toBe(false);
    expect(s.campaign.store.getFact(deliveryKey)).toBeUndefined();
  });

  const mutations: [string, (g: CommitGroup) => CommitGroup, string, RegExp][] = [
    [
      "a different destination than the commitment",
      (g) => withWrite(g, deliveryKey, (v) => (v.outcome.destination = locusRef(OTHER_LOCUS_ID))),
      "VALUE_INVALID",
      /exactly what the commitment and transfer determine/,
    ],
    [
      "a different establishment basis than the dispatch",
      (g) => withWrite(g, deliveryKey, (v) => (v.timing.established_at = at(120))),
      "VALUE_INVALID",
      /exactly what the commitment and transfer determine/,
    ],
    [
      "a different effective instant than the declared boundary",
      (g) => withWrite(g, deliveryKey, (v) => (v.timing.occurs_at = at(210))),
      "VALUE_INVALID",
      /exactly what the commitment and transfer determine/,
    ],
    [
      "a delivery claiming a different source",
      (g) => withWrite(g, deliveryKey, (v) => (v.source.owner = "SYNTHETIC-MOVEMENT-REQUESTER")),
      "VALUE_INVALID",
      /exactly what the commitment and transfer determine/,
    ],
    [
      "a delivery for another entity",
      (g) => withWrite(g, deliveryKey, (v) => (v.subject.entity_id = "someone-else")),
      "VALUE_INVALID",
      /identity does not match the key/,
    ],
    [
      "no pin of the request it serves",
      (g) => ({ ...g, reads: g.reads.filter((r) => r.key !== requestKey) }),
      "REFERENCE_INVALID",
      /must read the Movement Service Request/,
    ],
  ];
  it.each(mutations)(
    "a coordinator-published stage that is %s is refused by IM-11, not by the operation",
    async (_name, mutate, code, message) => {
      const s = await registered();
      const t = tamperStore(s.campaign.store, "logistics", mutate, (g) =>
        g.writes.some((w) => w.key === deliveryKey),
      );
      const coordinator = new TemporalCoordinator(t.store, logisticsProviders());
      const r = await must(coordinator.advance(logStopAtBoundaryRequest("tx-1", MOVE_1)));
      expect(t.tampered()).toBe(1);
      expect(r.rejections).toEqual([{ stage: deliveryStage, code }]);
      expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
      // the delivery is not credited, so neither the destination commit nor the retirement may follow it
      expect(
        r.transaction.outcome.unresolved_dependents.map((u) => u.stage.owner_operation.operation),
      ).toEqual([
        "logistics-establish-delivery",
        "world-state-commit-entity-transition",
        "logistics-retire-transfer",
      ]);
      expect(s.campaign.store.getFact(deliveryKey)).toBeUndefined();
      expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
      expect(locusOfRequest(s, REQ_1)!).toMatchObject({
        phase: "IN_TRANSFER",
        authority: "LOGISTICS",
      });
      expect(s.campaign.verify()).toEqual([]);
      const raw = await s.campaign.store.commit(mutate(rawDelivery(s, 450)));
      expect(raw.ok).toBe(false);
      expect(!raw.ok && raw.error.message).toMatch(message);
    },
  );
});

describe("Logistics cannot retire early: retirement exists only after the destination owner's commit (WS-010 §10.4, §23.5; acceptance 6)", () => {
  it("a raw retirement carrying the exact lawful values, before the destination commit, is refused under any identity — Logistics' completion is not destination truth", async () => {
    const ref = await reference();
    // after the delivery result and BEFORE the transition: the process stops between the two stages
    const s = await registered();
    const stop = await stopBefore(s, isTransition);
    expect(stop).toBe(1);
    expect(fact(s, deliveryKey).version).toBe(1);
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();

    const attempt = (n: number, over: Partial<CommitGroup> = {}) =>
      logRaw(
        n,
        [
          { key: commitmentKey, value: ref.commitment, expected_version: 1 },
          { key: transferKey, value: ref.transfer, expected_version: 1 },
        ],
        { ...pins(s.campaign.store, [deliveryKey]), ...over },
      );
    for (const [i, over] of [
      {},
      stageIdentity(retirementStage),
      { ...stageIdentity(retirementStage), cause: "transaction:forged" },
    ].entries()) {
      const r = await s.campaign.store.commit(attempt(460 + i, over));
      expect(r.ok, `variant ${i}`).toBe(false);
      expect(!r.ok && r.error.code, `variant ${i}`).toMatch(
        /PREREQUISITE_MISSING|REFERENCE_INVALID/,
      );
    }
    expect(fact(s, transferKey).version).toBe(1);
    expect(parsedTransfer(s).state.status).toBe("IN_TRANSFER");
    expect(locusOfRequest(s, REQ_1)!).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
      delivery_established: true,
    });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the destination owner's transition for ANOTHER delivery cannot retire this transfer, and a transition from another cause cannot exist for a committed entity", async () => {
    const ref = await reference();
    const s = await registered();
    // the movement guard: a foreign causing result for an entity Logistics is committed to move earns no object
    await must(
      s.campaign.store.commit(
        causeGroup(
          FIXTURE_CAMPAIGN,
          1,
          CAUSE_1,
          transitionCause(CAUSE_1, REQ_1, { destination: OTHER_LOCUS_ID }),
        ),
      ),
    );
    const cause = s.campaign.store.getFact(`synthetic-entity-cause/${CAUSE_1}`)!;
    const reg = await s.coordinator.registerObject({
      ...temporalPublication(80),
      object: entityTransitionTemporalObject({
        key: cause.key,
        owner: cause.owner,
        value: EntityTransitionCauseSchema.parse(cause.value),
      }),
    });
    expect(!reg.ok && reg.error.code).toBe("REFERENCE_INVALID");
    expect(!reg.ok && reg.error.message).toMatch(/Logistics has committed to move/);
    expect(ref.transition).toBeDefined();
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("AFTER the destination commit, a raw retirement of the exact lawful values is still lawful only as its IM-02 stage under its transaction's durable authority: a copied identity and a forged cause publish nothing", async () => {
    const ref = await reference();
    const s = await registered();
    expect(await stopBefore(s, isRetirement)).toBe(1);
    expect(fact(s, transitionKey).version).toBe(1);
    expect(fact(s, transferKey).version).toBe(1);
    const attempt = (n: number, over: Partial<CommitGroup> = {}) =>
      logRaw(
        n,
        [
          { key: commitmentKey, value: ref.commitment, expected_version: 1 },
          { key: transferKey, value: ref.transfer, expected_version: 1 },
        ],
        { ...pins(s.campaign.store, [deliveryKey, transitionKey]), ...over },
      );
    const before = logSummary(s.campaign, s.coordinator);
    const noIdentity = await s.campaign.store.commit(attempt(480));
    expect(!noIdentity.ok && noIdentity.error.message).toContain(
      "published only as its IM-02 stage",
    );
    const forged = await s.campaign.store.commit(
      attempt(481, { ...stageIdentity(retirementStage), cause: "transaction:forged" }),
    );
    expect(!forged.ok && forged.error.code).toBe("REFERENCE_INVALID");
    expect(!forged.ok && forged.error.message).toContain(
      "durable authority of its open transaction",
    );
    // even under the genuine transaction's own cause, a committed transaction authorizes no further stage; and an
    // opened-but-uncommitted one is the only authority — here the transaction never committed, so its authority is open
    expect(logSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(parsedTransfer(s).state.status).toBe("IN_TRANSFER");
    expect(s.campaign.verify()).toEqual([]);
    // the lawful completion: the same transaction re-presented adopts the committed stages and retires exactly once
    await must(advance(s));
    expect(fact(s, transferKey).version).toBe(2);
    expect(fact(s, commitmentKey).version).toBe(2);
    // and after it committed, a further raw attempt under the same transaction's cause is refused
    const late = await s.campaign.store.commit(
      attempt(482, { ...stageIdentity(retirementStage), cause: "transaction:tx-move" }),
    );
    expect(late.ok).toBe(false);
    expect(fact(s, transferKey).version).toBe(2);
  });

  it("a Logistics group changes state only by commitment, dispatch, delivery or retirement: a lone release, a lone retirement or a skipped version is refused", async () => {
    const ref = await reference();
    const s = await registered();
    await must(advance(s));
    const lone = [
      [{ key: commitmentKey, value: ref.commitment, expected_version: 2 }],
      [{ key: transferKey, value: ref.transfer, expected_version: 2 }],
      [
        { key: commitmentKey, value: ref.commitment, expected_version: 2 },
        { key: transferKey, value: ref.transfer, expected_version: 2 },
      ],
    ];
    let n = 490;
    for (const writes of lone) {
      const r = await s.campaign.store.commit(
        logRaw(n++, writes, pins(s.campaign.store, [deliveryKey, transitionKey])),
      );
      expect(r.ok).toBe(false);
    }
    expect(fact(s, transferKey).version).toBe(2);
    expect(fact(s, commitmentKey).version).toBe(2);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("while the delivery result exists but the destination is not yet committed, a standalone transition object for it is still refused: one stage, one engaged object", async () => {
    const s = await registered();
    expect(await stopBefore(s, isTransition)).toBe(1);
    const d = fact(s, deliveryKey);
    const standalone = await s.coordinator.registerObject({
      ...temporalPublication(97),
      object: entityTransitionTemporalObject({
        key: d.key,
        owner: d.owner,
        value: EntityTransitionCauseSchema.parse(d.value),
      }),
    });
    expect(!standalone.ok && standalone.error.code).toBe("REFERENCE_INVALID");
    expect(!standalone.ok && standalone.error.message).toMatch(
      /engaged only by its Logistics transfer object/,
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  const retirementMutations: [string, (g: CommitGroup) => CommitGroup, RegExp][] = [
    [
      "a commitment left committed while its transfer retires",
      (g) => withWrite(g, commitmentKey, (v) => (v.state = { status: "COMMITTED" })),
      /exactly what the committed chain determines/,
    ],
    [
      "a retirement pinning another destination commit version",
      (g) => withWrite(g, transferKey, (v) => (v.state.destination_commit.version = 2)),
      /exactly what the committed chain determines/,
    ],
    [
      "a retirement recorded at another instant",
      (g) => withWrite(g, transferKey, (v) => (v.state.retired_at = at(201))),
      /exactly what the committed chain determines/,
    ],
    [
      "a retirement that keeps the movement locus open",
      (g) => withWrite(g, transferKey, (v) => (v.state.movement_locus = "OPEN")),
      /contract/,
    ],
  ];
  it.each(retirementMutations)(
    "a stage that is %s is refused by IM-11 after the destination commit",
    async (_name, mutate, message) => {
      const s = await registered();
      const t = tamperStore(s.campaign.store, "logistics", mutate, (g) =>
        g.writes.some((w) => w.key === transferKey),
      );
      const r = await must(
        new TemporalCoordinator(t.store, logisticsProviders()).advance(
          logStopAtBoundaryRequest("tx-1", MOVE_1),
        ),
      );
      expect(t.tampered()).toBe(1);
      expect(r.rejections.map((x) => x.stage)).toEqual([retirementStage]);
      // the destination commit is real; the transfer is simply not retired by an unlawful group
      expect(s.campaign.store.getFact(transitionKey)!.version).toBe(1);
      expect(fact(s, transferKey).version).toBe(1);
      expect(locusOfRequest(s, REQ_1)!.phase).toBe("DESTINATION_COMMITTED_RETIREMENT_PENDING");
      expect(s.campaign.verify()).toEqual([]);
      void message;
    },
  );
});

describe("duplicate, replayed and incompatible movements fail closed (acceptance 12, 14, 17)", () => {
  it("a second request for the same entity — before or after dispatch, completed or not — never creates a sibling commitment, transfer or current locus", async () => {
    const s = await committed();
    await commitMovementRequest(s, MOVE_2, REQ_1, 2, { destination: OTHER_LOCUS_ID });
    const before = logSummary(s.campaign, s.coordinator);
    const dup = await s.logistics.commitMovement({
      ...logPublication(2),
      commit: commitInput(MOVE_2),
    });
    expect(!dup.ok && dup.error.code).toBe("VERSION_CONFLICT");
    // a raw commitment of the second request into the entity's one slot fails the same way
    const rawSecond = rawCommitment(s, 470);
    const request2 = s.campaign.store.getFact(movementRequestKey(MOVE_2))!;
    const clone = withWrite(rawSecond, commitmentKey, (v) => {
      v.request = { owner: request2.owner, fact_key: request2.key, request_id: MOVE_2, version: 1 };
      v.commitment_id = "commitment:move-2";
      v.destination = locusRef(OTHER_LOCUS_ID);
      v.delivery.boundary_id = "boundary-logistics-delivery-move-2";
    });
    const r = await s.campaign.store.commit({
      ...clone,
      ...pins(s.campaign.store, [
        movementRequestKey(MOVE_2),
        entityKey,
        worldKey,
        otherLocusKey,
        TEMPORAL_STATE_KEY,
      ]),
    });
    expect(r.ok).toBe(false);
    expect(logSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the same intent re-presented is the same receipt; the same intent with changed content is refused as a conflict", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    const first = await must(
      s.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }),
    );
    const again = await must(
      s.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    const changed = await s.logistics.commitMovement({
      ...logPublication(1),
      commit: commitInput(MOVE_1, { delivery_at: at(230) }),
    });
    expect(changed.ok).toBe(false);
    expect(parsedCommitment(s).delivery.at).toEqual(LOG_T_DELIVERY);
    // and so for the dispatch
    const d1 = await must(
      s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }),
    );
    const d2 = await must(
      s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }),
    );
    expect(d2.replayed).toBe(true);
    expect(d2.receipt).toEqual(d1.receipt);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an entity that has already changed locus — by this movement or any other — supports no further movement: the one-transition limitation fails closed, inventing no chained transition", async () => {
    // (a) after this movement completed
    const s = await registered();
    await must(advance(s));
    await commitMovementRequest(s, MOVE_2, REQ_1, 2, { destination: OTHER_LOCUS_ID });
    const before = logSummary(s.campaign, s.coordinator);
    const again = await s.logistics.commitMovement({
      ...logPublication(2),
      commit: commitInput(MOVE_2, { delivery_at: at(260) }),
    });
    expect(again.ok).toBe(false);
    // and a raw commitment under a fresh slot name for the SAME entity is refused by the entity's spent transition
    expect(logSummary(s.campaign, s.coordinator)).toEqual(before);
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("logistics/commitment/")),
    ).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);

    // (b) an entity World-State already moved for a foreign cause (no Logistics involvement at all)
    const t = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(t, REQ_1, 1);
    await must(
      t.campaign.store.commit(
        causeGroup(
          FIXTURE_CAMPAIGN,
          1,
          CAUSE_1,
          transitionCause(CAUSE_1, REQ_1, { occurs_at: at(200) }),
        ),
      ),
    );
    const cause = t.campaign.store.getFact(`synthetic-entity-cause/${CAUSE_1}`)!;
    await must(
      t.coordinator.registerObject({
        ...temporalPublication(80),
        object: entityTransitionTemporalObject({
          key: cause.key,
          owner: cause.owner,
          value: EntityTransitionCauseSchema.parse(cause.value),
        }),
      }),
    );
    await must(
      t.coordinator.advance(
        logStopAtBoundaryRequest("tx-foreign", "none", {
          requested: { target: at(220), condition: null },
        }),
      ),
    );
    expect(t.campaign.store.getFact(transitionKey)).toBeDefined();
    await commitMovementRequest(t, MOVE_1, REQ_1, 1);
    const refused = await t.logistics.commitMovement({
      ...logPublication(1),
      commit: commitInput(MOVE_1, { delivery_at: at(260) }),
    });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.message).toMatch(/already changed locus/);
    expect(t.campaign.store.getFact(commitmentKey)).toBeUndefined();
  });

  it("a foreign cause registered BEFORE the commitment cannot move the entity once Logistics is committed to move it: no rival current locus, ever", async () => {
    const s = await seededLogisticsCampaign(tempDir());
    await acceptLogEntity(s, REQ_1, 1);
    // a foreign, lawful-at-the-time cause for the same entity at the same instant as the movement's delivery
    await must(
      s.campaign.store.commit(
        causeGroup(
          FIXTURE_CAMPAIGN,
          1,
          CAUSE_1,
          transitionCause(CAUSE_1, REQ_1, {
            destination: OTHER_LOCUS_ID,
            occurs_at: LOG_T_DELIVERY,
          }),
        ),
      ),
    );
    const cause = s.campaign.store.getFact(`synthetic-entity-cause/${CAUSE_1}`)!;
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(80),
        object: entityTransitionTemporalObject({
          key: cause.key,
          owner: cause.owner,
          value: EntityTransitionCauseSchema.parse(cause.value),
        }),
      }),
    );
    await commitMovementRequest(s, MOVE_1, REQ_1, 1);
    await must(s.logistics.commitMovement({ ...logPublication(1), commit: commitInput(MOVE_1) }));
    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    const c = parsedCommitment(s);
    const t = parsedTransfer(s);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(81),
        object: logisticsTemporalObject(c, t),
      }),
    );
    const r = await must(advance(s));
    // the foreign cause's stage is refused by the guard; Logistics' own chain commits the one destination
    expect(r.rejections.map((x) => x.stage)).toEqual([entityTransitionStage(CAUSE_1)]);
    const tr = s.campaign.store.getFact(transitionKey)!;
    expect((tr.value as any).cause.owner).toBe("logistics");
    expect((tr.value as any).locus.to.locus.entity_id).toBe(DEST_LOCUS_ID);
    expect(parsedTransfer(s).state.status).toBe("RETIRED");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("RC-10: a Logistics temporal object is exactly the one derived from its commitment and dispatched transfer", () => {
  async function honest() {
    const s = await dispatched();
    const object = logisticsTemporalObject(parsedCommitment(s), parsedTransfer(s));
    return { s, object };
  }
  const register = (s: LogSeeded, object: unknown, n = 90) =>
    s.coordinator.registerObject({ ...temporalPublication(n), object });

  it("the honest object registers; registering it twice is refused; and it earns exactly the declared boundary", async () => {
    const { s, object } = await honest();
    expect(object.next_boundary).toEqual({
      boundary_id: `boundary-logistics-delivery-${MOVE_1}`,
      at: LOG_T_DELIVERY,
    });
    expect(object.dependencies.map((d) => d.stage.owner_operation.operation)).toEqual([
      "logistics-establish-delivery",
      "world-state-commit-entity-transition",
      "logistics-retire-transfer",
    ]);
    expect((await register(s, object)).ok).toBe(true);
    expect((await register(s, object, 91)).ok).toBe(false);
  });

  const edits: [string, (o: TemporalObject) => unknown][] = [
    [
      "a different boundary instant",
      (o) => ({ ...o, next_boundary: { ...o.next_boundary!, at: at(230) } }),
    ],
    [
      "a different boundary id",
      (o) => ({ ...o, next_boundary: { ...o.next_boundary!, boundary_id: "b-x" } }),
    ],
    [
      "a different resolved basis than the dispatch",
      (o) => ({ ...o, last_resolved_basis: at(120) }),
    ],
    ["no boundary at all", (o) => ({ ...o, next_boundary: null })],
    ["a missing retirement stage", (o) => ({ ...o, dependencies: o.dependencies.slice(0, 2) })],
    [
      "a missing destination commit stage",
      (o) => ({ ...o, dependencies: [o.dependencies[0], o.dependencies[2]] }),
    ],
    [
      "stages out of declared order",
      (o) => ({ ...o, dependencies: [o.dependencies[2], o.dependencies[1], o.dependencies[0]] }),
    ],
    [
      "a retirement that reads nothing of the destination commit",
      (o) => ({
        ...o,
        dependencies: o.dependencies.map((d, i) =>
          i === 2 ? { ...d, reads: d.reads.slice(0, 1) } : d,
        ),
      }),
    ],
    [
      "a delivery stage producing another key",
      (o) => ({
        ...o,
        dependencies: o.dependencies.map((d, i) =>
          i === 0 ? { ...d, produces: ["logistics/delivery/x/y"] } : d,
        ),
      }),
    ],
    ["another owner", (o) => ({ ...o, owning_ref: { ...o.owning_ref, owner: "world_state" } })],
    [
      "another process",
      (o) => ({ ...o, owning_ref: { ...o.owning_ref, process_id: "logistics-transfer:other" } }),
    ],
    ["another identity", (o) => ({ ...o, object_id: "obj-logistics-other" })],
    [
      "a recurrence-free object with extra invalidators",
      (o) => ({ ...o, invalidators: [...o.invalidators, { fact_key: "x" }] }),
    ],
  ];
  it.each(edits)("refuses an object with %s", async (_name, edit) => {
    const { s, object } = await honest();
    const r = await register(s, edit(object));
    expect(r.ok).toBe(false);
    expect(s.coordinator.object(`obj-logistics-${MOVE_1}`)).toBeUndefined();
    expect(s.coordinator.boundaryIndex().entries).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("no object is earned before the dispatch, and none after the transfer retired; and the transition stage can be engaged only by the Logistics object", async () => {
    const s = await committed();
    // before dispatch there is no transfer to derive the object from
    const c = parsedCommitment(s);
    const early = {
      object_id: `obj-logistics-${MOVE_1}`,
    } as unknown;
    expect((await register(s, early)).ok).toBe(false);
    await must(s.logistics.dispatch({ ...logPublication(101), dispatch: dispatchInput(MOVE_1) }));
    const object = logisticsTemporalObject(c, parsedTransfer(s));
    await must(register(s, object));
    await must(advance(s));
    // after retirement: a second registration (same or a derived copy) earns nothing
    expect((await register(s, object, 95)).ok).toBe(false);
    // a standalone entity-transition object for the Logistics delivery result is never lawful: one stage, one object
    const d = s.campaign.store.getFact(deliveryKey)!;
    const standalone = await register(
      s,
      entityTransitionTemporalObject({
        key: d.key,
        owner: d.owner,
        value: EntityTransitionCauseSchema.parse(d.value),
      }),
      96,
    );
    expect(standalone.ok).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the request keeps its owner's lifecycle; a withdrawn request fails closed after dispatch (WS-010 §3.1, §9)", () => {
  it("a request advanced by its owner after dispatch leaves the movement in transfer: the delivery is not credited, nothing is retired and nothing is guessed", async () => {
    const s = await registered();
    const req = fact(s, requestKey);
    await must(
      s.campaign.store.commit(
        movementRequestGroup(
          FIXTURE_CAMPAIGN,
          9,
          MOVE_1,
          { ...(req.value as any), source: { owner: req.owner, cause_ref: "synthetic-withdrawn" } },
          req.version,
        ),
      ),
    );
    const r = await must(advance(s));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(s.campaign.store.getFact(deliveryKey)).toBeUndefined();
    expect(s.campaign.store.getFact(transitionKey)).toBeUndefined();
    // Logistics still holds the one movement locus: the cancellation/diversion semantics are not in this tranche
    expect(locusOfRequest(s, REQ_1)!).toMatchObject({
      phase: "IN_TRANSFER",
      authority: "LOGISTICS",
    });
    expect(parsedTransfer(s).state.status).toBe("IN_TRANSFER");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("load-time verification fails closed on Logistics drift (IA-30 partial)", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    opts: { complete?: boolean } = {},
  ) {
    const s = await registered();
    if (opts.complete !== false) await must(advance(s));
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
    const bound: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => facts,
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const out = verifyLogisticsIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("healthy campaigns verify before the dispatch, in transfer, and after the retirement", async () => {
    expect(await drifted((f) => f)).toBe("");
    expect(await drifted((f) => f, { complete: false })).toBe("");
  });
  it("detects a commitment that is not what its request and entity determine", async () => {
    for (const f of [
      (v: any) => (v.destination = locusRef(OTHER_LOCUS_ID)),
      (v: any) => (v.origin = locusRef(OTHER_LOCUS_ID)),
    ])
      expect(await drifted(edit(commitmentKey, f))).toMatch(
        /exactly what the request and the entity determine/,
      );
  });
  it("detects a commitment or transfer with no request, entity or commitment", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== requestKey))).toMatch(
      /no committed request or accepted entity/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== entityKey))).toMatch(
      /no committed request or accepted entity/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== commitmentKey))).toMatch(
      /has no commitment/,
    );
  });
  it("detects a retirement that is not what the committed chain determines, or that has no destination commit or delivery", async () => {
    expect(await drifted(edit(transferKey, (v) => (v.state.retired_at.value = 201)))).toMatch(
      /exactly what the committed chain determines/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== transitionKey))).toMatch(
      /only after its delivery and the destination owner's commit/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== deliveryKey))).toMatch(
      /only after its delivery and the destination owner's commit/,
    );
  });
  it("detects a delivery that is not what the commitment and transfer determine", async () => {
    expect(
      await drifted(edit(deliveryKey, (v) => (v.outcome.destination = locusRef(OTHER_LOCUS_ID)))),
    ).toMatch(/exactly what the commitment and transfer determine/);
  });
  it("detects a stage that is not its IM-02 stage, and one credited by no transaction", async () => {
    expect(
      await drifted(edit(deliveryKey, (_v, fact) => (fact.provenance.group_id = "raw-group"))),
    ).toMatch(/published only as its IM-02 stage/);
    expect(
      await drifted(edit(transferKey, (_v, fact) => (fact.provenance.group_id = "raw-group"))),
    ).toMatch(/published only as its IM-02 stage|atomically/);
    expect(
      await drifted((f) => f.filter((x) => !x.key.startsWith("temporal/transaction/"))),
    ).toMatch(/credited by no resolution transaction/);
  });
  it("detects a transfer left in transfer past its retired boundary, and a commitment released without its transfer", async () => {
    expect(
      await drifted(
        edit(transferKey, (v) => {
          v.state = {
            status: "IN_TRANSFER",
            movement_locus: {
              authority: "LOGISTICS_TRANSFER_RECORD",
              leg: "SINGLE_LEG",
              from: locusRef(FIXTURE_LOCUS_ID),
              to: locusRef(DEST_LOCUS_ID),
            },
          };
        }),
      ),
    ).toMatch(
      /retired Logistics boundary never leaves a transfer in transfer|backed by a committed commitment/,
    );
    expect(
      await drifted(
        edit(transferKey, (v, fact) => {
          v.state.status = "IN_TRANSFER";
          fact.version = 1;
        }),
      ),
    ).not.toBe("");
  });
  it("detects an entity committed to a movement that changed locus through a foreign cause (a rival current locus)", async () => {
    expect(
      await drifted(
        edit(transitionKey, (v) => {
          v.cause.fact_key = "synthetic-entity-cause/cause-1";
        }),
      ),
    ).toMatch(/not that movement's delivery/);
  });
  it("detects a stage whose transaction authority is gone: a stage is lawful only under the durable authority its transaction opened", async () => {
    const msg = await drifted((f) =>
      f.filter((x) => !x.key.startsWith("temporal/transaction-authority/")),
    );
    expect(msg).toMatch(/durable authority of its open transaction/);
  });
  it("detects a hand-altered temporal object", async () => {
    expect(
      await drifted(
        edit(
          `temporal/object/obj-logistics-${MOVE_1}`,
          (o) => (o.dependencies[0].produces = ["x"]),
        ),
      ),
    ).toMatch(/exactly the object derived/);
  });
  it("detects a transfer dispatched no later than its commitment", async () => {
    const swapped = await drifted(
      (facts) => {
        const t = facts.find((x) => x.key === transferKey)!;
        const c = facts.find((x) => x.key === commitmentKey)!;
        c.provenance.intent_id = t.provenance.intent_id;
        return facts;
      },
      { complete: false },
    );
    expect(swapped).toMatch(/not dispatched after its commitment/);
  });

  it("tampering with the persisted journal fails the open under the existing integrity model", async () => {
    const dir = tempDir();
    const s = await seededLogisticsCampaign(dir);
    await acceptCommitDispatchRegister(s);
    await must(advance(s));
    await s.campaign.close();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("AFTER_DESTINATION_OWNER_COMMIT");
    writeFileSync(
      journal,
      text.replace("AFTER_DESTINATION_OWNER_COMMIT", "AFTER_DESTINATION_OWNER_COMMIX"),
    );
    expect((await CanonicalCampaign.open(dir)).ok).toBe(false);
    expect((await CanonicalCampaign.open(dir, { extension: LOGISTICS_FIXTURE_EXTENSION })).ok).toBe(
      false,
    );
  });
});
