/* eslint-disable @typescript-eslint/no-explicit-any -- tests rewrite arbitrary fact values to attack admission */
// CPAA-C1 v0.2 PROVISIONAL — enforcement. Each test tries to make the collection chain say something its owners did not establish: a
// pre-authored success, an invented eligibility or access verdict, a caller-declared duration or boundary, a host-supplied authority,
// a movement/collection overlap, or a source the real remaining material does not support. Admission (IM-11) must refuse each from
// committed state, record nothing, and leave the real facts as they were.
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_PC_COLLECTION_WORK_RULE as _unused,
  PcCollectionAdapter,
  type CampaignStore,
} from "@immortalis/engine";
import {
  PC_COLLECTION_INTERACTION_FLOOR,
  PLAYER_CHOICE_AUTHORITY,
  productionExtractionKey,
  productionPcCollectionWorkKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
  bindTrustedConfirmedPcCollectionContext,
  commitConfirmedPcCollection,
  getPcCollectionReachTask,
  startConfirmedPcCollection,
  submitPcCollectionReach,
} from "@immortalis/protocol";
import { SRC_ACCESS } from "@immortalis/testkit";
import {
  ACTUATOR_WORDS,
  TRAVERSAL_CANNOT,
  cycleWords,
  establishMechanism,
  type CollectionSeedOptions,
  ACT_A,
  ACT_B,
  COLLECTION_COMMITTED,
  COLLECTION_REFUSAL,
  COMMIT_REQ,
  MECH,
  PC,
  START_REQ,
  TAU,
  TASK_REQ,
  T0,
  W,
  at,
  choice,
  clock,
  collectionCampaign,
  colPublication,
  confirmAndStart,
  hostAnswer,
  reachReq,
  reserveAmount,
  sourceRemaining,
  trustedCollection,
  type CollectionSeeded,
  determineRepresentation,
} from "../support/pc-collection.ts";
import { GipAdapter } from "@immortalis/engine";
import {
  INSTITUTION_COURT,
  INSTRUMENT_A,
  OFFICE_MAGISTRATE,
  SCOPE_BINDING_A,
  gipPublication,
} from "@immortalis/testkit";
import { establishInstitution, establishOffice, establishScopeBinding } from "../support/gip.ts";
import { sunsetInstrument } from "../support/gip-sunset.ts";
import { commitMove, requestMove } from "../support/pc-movement.ts";
import { must } from "../support/temporal.ts";
import {
  PC_TARGET_COMMITTED,
  PC_TARGET_REFUSAL,
  pcTargetTransaction,
} from "../support/pc-target-advance.ts";

void _unused;
const SEALED = {
  aspect: "synthetic-access-aspect",
  statement:
    "SYNTHETIC FIXTURE: the material lies behind a sealed barrier that must be passed to be reached.",
};

const advanceTo = (s: CollectionSeeded, value: number, tx: string) =>
  advanceActivePcToTarget(
    bindTrustedActivePcTargetAdvanceContext({
      campaign: s.campaign as never,
      pc_id: PC,
      target: at(value),
      transaction: pcTargetTransaction(tx) as never,
    }),
    { operation: "advance_active_pc_to_target" },
  );

const quiet = (s: CollectionSeeded) => s.campaign.store.head().state_sha256;
const nothingExtracted = (s: CollectionSeeded, act: string) => {
  expect(s.collect.extraction(PC, act)).toBeUndefined();
  expect(s.collect.work(PC, act)).toBeUndefined();
  expect(sourceRemaining(s)).toBe(5);
  expect(reserveAmount(s)).toBe(0);
};

/** commit → judgment, and Population's registration, but NOT Production's start (so a test can attempt the start its own way). */
async function prepared(
  s: CollectionSeeded,
  act: string,
  quantity: number,
  reading: Parameters<typeof hostAnswer>[1] extends infer P
    ? [P, Parameters<typeof hostAnswer>[2]]
    : never = ["OPEN", "NOT_AT_ISSUE"],
) {
  const ctx = trustedCollection(s, act, quantity);
  expect(await commitConfirmedPcCollection(ctx, COMMIT_REQ)).toEqual(COLLECTION_COMMITTED);
  const task = getPcCollectionReachTask(ctx, TASK_REQ);
  if (!task.ok) throw new Error("no task");
  expect(
    await submitPcCollectionReach(ctx, reachReq(hostAnswer(task.value.task, ...reading))),
  ).toEqual(COLLECTION_COMMITTED);
  await determineRepresentation(s);
  const occ = await s.collect.registerOccupancy({
    ...colPublication(300),
    pc_id: PC,
    act_id: act,
    mechanism_id: MECH,
  });
  return { ctx, task: task.value.task, occ };
}

/** An adapter whose store lets a test rewrite the one group Production commits at start (an attacker with write access to the group). */
function tamperingAdapter(s: CollectionSeeded, mutate: (g: CommitGroup) => CommitGroup | null) {
  const inner: CampaignStore = s.campaign.store;
  const store: CampaignStore = {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    commit: (g) => {
      const touched = (g as CommitGroup).writes.some((w) =>
        w.key.startsWith("production/extraction/"),
      );
      const next = touched ? mutate(g as CommitGroup) : (g as CommitGroup);
      return inner.commit(next ?? g);
    },
    lookupReceipt: (id) => inner.lookupReceipt(id),
    committedGroup: (id) => inner.committedGroup(id),
    close: () => inner.close(),
  };
  return new PcCollectionAdapter(store);
}

describe("physical reach (C5): the verdict is derived from the owners' stated facts and the host's quote-anchored reading", () => {
  const cells: [
    string,
    "OPEN" | "CLOSED",
    "ABLE_TO_PASS" | "UNABLE_TO_PASS" | "NOT_AT_ISSUE",
    boolean,
  ][] = [
    ["path open, mechanism at issue-free", "OPEN", "NOT_AT_ISSUE", true],
    ["path closed, mechanism able to pass", "CLOSED", "ABLE_TO_PASS", true],
    ["path closed, mechanism unable to pass", "CLOSED", "UNABLE_TO_PASS", false],
  ];
  it.each(cells)("2x2: %s", async (_name, path, mech, reachable) => {
    const closed = path === "CLOSED";
    const s = await collectionCampaign({
      access: [closed ? SEALED : SRC_ACCESS],
      ...(mech === "ABLE_TO_PASS" ? { ableToPass: true } : {}),
    });
    const r = await confirmAndStart(s, ACT_A, 3, [path, mech]);
    expect(r.committed).toEqual(COLLECTION_COMMITTED);
    expect(r.judged).toEqual(COLLECTION_COMMITTED);
    expect(s.collect.reach(PC, ACT_A)!.value.verdict).toBe(
      reachable ? "REACHABLE" : "NOT_REACHABLE",
    );
    if (reachable) {
      expect(r.started).toEqual(COLLECTION_COMMITTED);
      expect(s.collect.extraction(PC, ACT_A)).toBeDefined();
    } else {
      expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
      nothingExtracted(s, ACT_A);
      // the PC's time was never occupied by work that was not admitted
      expect(s.collect.occupancyState(PC).state).toBe("NONE");
    }
  });

  it("an open path reads REACHABLE even for a mechanism that cannot pass (the mechanism is not at issue)", async () => {
    const s = await collectionCampaign();
    const r = await confirmAndStart(s, ACT_A, 3, ["OPEN", "UNABLE_TO_PASS"]);
    expect(r.started).toEqual(COLLECTION_COMMITTED);
  });

  it("a Production start on a NOT_REACHABLE judgment is refused by admission itself, not only by the gateway", async () => {
    const s = await collectionCampaign({ access: [SEALED] });
    await prepared(s, ACT_A, 3, ["CLOSED", "UNABLE_TO_PASS"]);
    const before = quiet(s);
    const started = await s.collect.startWork({
      ...colPublication(301),
      pc_id: PC,
      act_id: ACT_A,
      mechanism_id: MECH,
      basis_id: "basis-main",
    });
    expect(started.ok).toBe(false);
    expect(quiet(s)).toBe(before);
    nothingExtracted(s, ACT_A);
  });

  it("an answer that states a verdict, a role, a permission or an ungrounded quotation is set aside and writes nothing", async () => {
    const s = await collectionCampaign({ access: [SEALED] });
    const ctx = trustedCollection(s, ACT_A, 3);
    await commitConfirmedPcCollection(ctx, COMMIT_REQ);
    const task = getPcCollectionReachTask(ctx, TASK_REQ);
    if (!task.ok) throw new Error("no task");
    const t = task.value.task;
    const good = hostAnswer(t, "CLOSED", "ABLE_TO_PASS");
    const before = quiet(s);
    const bad: Record<string, unknown>[] = [
      { ...good, verdict: "REACHABLE" },
      { ...good, role: "role.gm", permission: "permission.rule.adjudicate" },
      { ...good, task_digest: "0".repeat(64) },
      {
        ...good,
        path: { reading: "OPEN", grounds: ["the path is wide open and clear of everything"] },
      },
      { ...good, path: { reading: "CLOSED", grounds: [] } },
      {
        ...good,
        mechanism: { reading: "ABLE_TO_PASS", grounds: ["its hands can pass anything at all"] },
      },
      {
        ...good,
        mechanism: { reading: "NOT_AT_ISSUE", grounds: [] },
        path: { ...(good.path as object) },
      },
    ];
    for (const answer of bad) {
      expect(JSON.stringify(await submitPcCollectionReach(ctx, reachReq(answer)))).toBe(
        COLLECTION_REFUSAL,
      );
      expect(quiet(s)).toBe(before);
    }
    expect(s.collect.reach(PC, ACT_A)).toBeUndefined();
    // the same authority is the engine's: the retained judgment is role.gm applied by the trusted operation
    expect(
      await submitPcCollectionReach(ctx, reachReq(hostAnswer(t, "CLOSED", "ABLE_TO_PASS"))),
    ).toEqual(COLLECTION_COMMITTED);
    expect(s.collect.reach(PC, ACT_A)!.value.authority).toEqual({
      role: "role.gm",
      permission: "permission.rule.adjudicate",
    });
  });
});

describe("authority: willingness is the player's, and nothing else is the host's to state", () => {
  it("refuses a context the player's confirmation did not establish, before any read or write", async () => {
    const s = await collectionCampaign();
    const before = quiet(s);
    for (const ctx of [
      {} as never,
      Object.freeze({}) as never,
      bindTrustedConfirmedPcCollectionContext({
        campaign: s.campaign as never,
        choice: choice(ACT_A, 3, {
          authored_under: { role: "role.gm", permission: "permission.rule.adjudicate" },
        }) as never,
        mechanism_id: MECH,
        basis_id: "basis-main",
        publication: { cause: "c", basis: "fixture-basis", secrecy: "fixture-visibility" },
      }),
      trustedCollection(s, ACT_A, 3, { choice: { ...choice(ACT_A, 3), extra: "x" } }),
      trustedCollection(s, ACT_A, 3, {
        choice: { ...choice(ACT_A, 3), authored_under: undefined },
      }),
    ]) {
      expect(JSON.stringify(await commitConfirmedPcCollection(ctx, COMMIT_REQ))).toBe(
        COLLECTION_REFUSAL,
      );
    }
    expect(quiet(s)).toBe(before);
  });

  it("a host request has no field for a boundary, a duration, a verdict, a source, an amount or an authority", async () => {
    const s = await collectionCampaign();
    const ctx = trustedCollection(s, ACT_A, 3);
    const before = quiet(s);
    for (const extra of [
      { boundary_at: at(500) },
      { duration: at(1) },
      { verdict: "REACHABLE" },
      { quantity: { amount: 5, unit: "u" } },
      { role: "role.player" },
      { permission: "permission.canon.write" },
      { pc_id: "someone-else" },
      { act_id: "act-z" },
      { source_key: "elsewhere" },
    ]) {
      expect(
        JSON.stringify(await commitConfirmedPcCollection(ctx, { ...COMMIT_REQ, ...extra })),
      ).toBe(COLLECTION_REFUSAL);
      expect(
        JSON.stringify(await startConfirmedPcCollection(ctx, { ...START_REQ, ...extra })),
      ).toBe(COLLECTION_REFUSAL);
    }
    expect(JSON.stringify(await startConfirmedPcCollection(ctx, undefined))).toBe(
      COLLECTION_REFUSAL,
    );
    expect(quiet(s)).toBe(before);
  });

  it("refuses a collection by a PC that is not the operative active PC, or from a source it is not at, or an unknown Reserve", async () => {
    for (const over of [
      { pc_id: "actor-sword" },
      { source: { world_id: W, source_key: "no-such-source" } },
      { reserve_id: "no-such-reserve" },
      { quantity: { amount: 0, unit: "synthetic-raw-unit-r" } },
      { quantity: { amount: 3, unit: "other-unit" } },
    ]) {
      const s = await collectionCampaign();
      const ctx = trustedCollection(s, ACT_A, 3, { choice: choice(ACT_A, 3, over) });
      const before = quiet(s);
      expect(JSON.stringify(await commitConfirmedPcCollection(ctx, COMMIT_REQ))).toBe(
        COLLECTION_REFUSAL,
      );
      expect(quiet(s)).toBe(before);
    }
  });

  it("the commitment states willingness only: it is not an extraction, a duration, a possession or a completion", async () => {
    const s = await collectionCampaign();
    await commitConfirmedPcCollection(trustedCollection(s, ACT_A, 3), COMMIT_REQ);
    const c = s.collect.commitment(PC, ACT_A)!.value;
    expect(Object.keys(c.intent).sort()).toEqual([
      "destination",
      "kind",
      "material_class",
      "quantity",
      "source",
    ]);
    expect(c.authored_under).toEqual({ ...PLAYER_CHOICE_AUTHORITY });
    nothingExtracted(s, ACT_A);
    expect(s.collect.request(PC, ACT_A)).toBeDefined();
  });

  it("re-presenting a confirmed request reconciles by identity: one commitment, one request, no new write", async () => {
    const s = await collectionCampaign();
    const ctx = trustedCollection(s, ACT_A, 3);
    expect(await commitConfirmedPcCollection(ctx, COMMIT_REQ)).toEqual(COLLECTION_COMMITTED);
    const after = quiet(s);
    expect(await commitConfirmedPcCollection(ctx, COMMIT_REQ)).toEqual(COLLECTION_COMMITTED);
    expect(quiet(s)).toBe(after);
  });
});

describe("duration (C6): derived from the PC's own mechanism and the amount, never declared", () => {
  it("the earned completion is cycles × τ and moves with τ and with the amount", async () => {
    const a = await collectionCampaign({ tau: { unit: T0.unit, value: 11 } });
    await confirmAndStart(a, ACT_A, 3);
    expect(a.collect.extraction(PC, ACT_A)!.value.timing.boundary.at.value).toBe(T0.value + 33);
    const b = await collectionCampaign();
    await confirmAndStart(b, ACT_A, 2);
    expect(b.collect.extraction(PC, ACT_A)!.value.timing.boundary.at.value).toBe(
      T0.value + 2 * TAU,
    );
    expect(b.collect.work(PC, ACT_A)!.value.derivation).toMatchObject({ cycles: 2 });
    expect(b.collect.occupancy(PC)!.value.interval.to.value).toBe(T0.value + 2 * TAU);
  });

  it("the F-014B §11 determination is DERIVED, never authored: no mechanism or input field can state a floor, and the work records the derived determination", async () => {
    const s = await collectionCampaign({ noMechanism: true });
    const input = {
      pc_id: PC,
      mechanism_id: MECH,
      claims: [{ section: "embodiment_topology", index: 0 }],
      actuator: { statement: ACTUATOR_WORDS },
      traversal: { statement: TRAVERSAL_CANNOT },
      cycle_duration: { unit: T0.unit, value: TAU },
      cycle_quote: cycleWords({ unit: T0.unit, value: TAU }),
    };
    for (const extra of [
      { interaction_floor: { status: "NOT_APPLICABLE", ground: "a ground of my own" } },
      { interaction_floor: { status: "APPLIES", minimum: { unit: T0.unit, value: 50 } } },
      { interaction_floor: { status: "UNRESOLVED" } },
      { floor_minimum: { unit: T0.unit, value: 50 } },
    ]) {
      const r = await s.collect.establishMechanism({
        ...colPublication(961),
        mechanism: { ...input, ...extra },
      });
      expect(r.ok, JSON.stringify(extra)).toBe(false);
    }
    expect(s.collect.mechanism(PC, MECH)).toBeUndefined();
    const ok = await collectionCampaign();
    await confirmAndStart(ok, ACT_A, 3);
    expect(ok.collect.work(PC, ACT_A)!.value.derivation).toMatchObject({
      causal_duration: { value: 3 * TAU },
      interaction_floor: PC_COLLECTION_INTERACTION_FLOOR,
    });
    expect(ok.collect.extraction(PC, ACT_A)!.value.timing.boundary.at.value).toBe(
      T0.value + 3 * TAU,
    );
  });

  it("a cycle the PC's authored content does not state cannot be established: no exact completion follows without an owner-grounded τ", async () => {
    const tau = { unit: T0.unit, value: TAU };
    const attempts: [string, CollectionSeedOptions][] = [
      [
        "the authored claim states no cycle at all",
        { claimStatement: `SYNTHETIC FIXTURE: one body; ${ACTUATOR_WORDS}; ${TRAVERSAL_CANNOT}.` },
      ],
      [
        "the asserted τ is not the number the claim states",
        { assertedTau: { unit: T0.unit, value: 3 } },
      ],
      [
        "the cycle words are not words of any cited claim",
        { quote: { cycle: "one handful every 7 fixture-time-unit, exactly" } },
      ],
      [
        "the quoted cycle states another numeral",
        {
          quote: { cycle: `one handful every 17 ${T0.unit}` },
          claimStatement: `SYNTHETIC FIXTURE: one body; ${ACTUATOR_WORDS}; one handful every 17 ${T0.unit}; ${TRAVERSAL_CANNOT}.`,
        },
      ],
      [
        "the quoted cycle omits the canonical unit",
        {
          quote: { cycle: "one handful every 7" },
          claimStatement: `SYNTHETIC FIXTURE: one body; ${ACTUATOR_WORDS}; one handful every 7 breaths; ${TRAVERSAL_CANNOT}.`,
        },
      ],
      [
        "the actuator words are not authored",
        { quote: { actuator: "two tireless mechanical hands" } },
      ],
      [
        "the traversal words are invented",
        { quote: { traversal: "these hands can pass any barrier whatever" } },
      ],
      ["the quotation is too short to anchor anything", { quote: { cycle: "7" } }],
    ];
    for (const [name, o] of attempts) {
      const s = await collectionCampaign({ ...o, noMechanism: true });
      const r = await establishMechanism(s, o);
      expect(r.ok, name).toBe(false);
      expect(s.collect.mechanism(PC, MECH), name).toBeUndefined();
      // and so nothing can start: the act is held, nothing occupied, nothing extracted
      const started = await confirmAndStart(s, ACT_A, 3);
      expect(JSON.stringify(started.started), name).toBe(COLLECTION_REFUSAL);
      nothingExtracted(s, ACT_A);
      expect(s.collect.occupancy(PC), name).toBeUndefined();
    }
    // the control: the same wording, authored and quoted, is accepted, and τ is exactly what the words state
    const good = await collectionCampaign({ tau });
    expect(good.collect.mechanism(PC, MECH)!.value.cycle).toMatchObject({
      duration: tau,
      authored_quote: cycleWords(tau),
    });
  });

  it("the mechanism cannot follow a contract it was not authored in: a changed contract version or a claim it does not cite grounds nothing", async () => {
    const s = await collectionCampaign({ noMechanism: true });
    const r = await s.collect.establishMechanism({
      ...colPublication(962),
      mechanism: {
        pc_id: PC,
        mechanism_id: MECH,
        claims: [{ section: "identity_agency", index: 0 }],
        actuator: { statement: ACTUATOR_WORDS },
        traversal: { statement: TRAVERSAL_CANNOT },
        cycle_duration: { unit: T0.unit, value: TAU },
        cycle_quote: cycleWords({ unit: T0.unit, value: TAU }),
      },
    });
    expect(r.ok).toBe(false); // those words are in embodiment_topology, not in the cited identity_agency claim
  });

  it("no mechanism, a mechanism in a foreign time unit, or a mechanism citing an unaccepted claim yields no completion", async () => {
    const none = await collectionCampaign({ noMechanism: true });
    const r = await confirmAndStart(none, ACT_A, 3);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    nothingExtracted(none, ACT_A);

    // authored and quoted faithfully, but in a unit that is not the campaign's canonical unit: the exact completion is withheld
    const foreign = await collectionCampaign({ tau: { unit: "another-unit", value: 5 } });
    const f = await confirmAndStart(foreign, ACT_A, 3);
    expect(JSON.stringify(f.started)).toBe(COLLECTION_REFUSAL);
    nothingExtracted(foreign, ACT_A);

    const s = await collectionCampaign({ noMechanism: true });
    const bogus = await s.collect.establishMechanism({
      ...colPublication(960),
      mechanism: {
        pc_id: PC,
        mechanism_id: MECH,
        claims: [{ section: "embodiment_topology", index: 99 }],
        actuator: { statement: ACTUATOR_WORDS },
        traversal: { statement: TRAVERSAL_CANNOT },
        cycle_duration: { unit: T0.unit, value: TAU },
        cycle_quote: cycleWords({ unit: T0.unit, value: TAU }),
      },
    });
    expect(bogus.ok).toBe(false);
    expect(s.collect.mechanism(PC, MECH)).toBeUndefined();
  });

  it("a caller-rewritten start group (boundary, quantity, work derivation, rule or a dropped work record) is refused and records nothing", async () => {
    // control: an untouched start group is admitted, so each refusal below is caused by its mutation and nothing else
    const control = await collectionCampaign();
    await prepared(control, ACT_A, 3);
    const ok = await tamperingAdapter(control, (g) => g).startWork({
      ...colPublication(310),
      pc_id: PC,
      act_id: ACT_A,
      mechanism_id: MECH,
      basis_id: "basis-main",
    });
    expect(ok.ok).toBe(true);
    const mutations: [string, (g: CommitGroup) => CommitGroup][] = [
      [
        "a declared extraction boundary",
        (g) => ({
          ...g,
          writes: g.writes.map((w) =>
            w.key.startsWith("production/extraction/")
              ? {
                  ...w,
                  value: {
                    ...(w.value as any),
                    timing: {
                      ...(w.value as any).timing,
                      boundary: { ...(w.value as any).timing.boundary, at: at(T0.value + 1) },
                    },
                  },
                }
              : w,
          ),
        }),
      ],
      [
        "a consistently shortened boundary in extraction and work record",
        (g) => ({
          ...g,
          writes: g.writes.map((w) => {
            if (w.key.startsWith("production/extraction/"))
              return {
                ...w,
                value: {
                  ...(w.value as any),
                  timing: {
                    ...(w.value as any).timing,
                    boundary: { ...(w.value as any).timing.boundary, at: at(T0.value + 1) },
                  },
                },
              };
            if (w.key.startsWith("production/pc-collection-work/"))
              return {
                ...w,
                value: {
                  ...(w.value as any),
                  derivation: { ...(w.value as any).derivation, completes_at: at(T0.value + 1) },
                },
              };
            return w;
          }),
        }),
      ],
      [
        "an inflated quantity",
        (g) => ({
          ...g,
          writes: g.writes.map((w) =>
            w.key.startsWith("production/extraction/")
              ? {
                  ...w,
                  value: {
                    ...(w.value as any),
                    quantity: { ...(w.value as any).quantity, amount: 5 },
                  },
                }
              : w,
          ),
        }),
      ],
      [
        "a dropped work record",
        (g) => ({
          ...g,
          writes: g.writes.filter((w) => !w.key.startsWith("production/pc-collection-work/")),
        }),
      ],
      [
        "the drawdown rule instead of the provisional PC-collection rule",
        (g) => ({
          ...g,
          rule: { ...g.rule, clause: "a rule the PC-owned start is not governed by" },
        }),
      ],
    ];
    for (const [name, mutate] of mutations) {
      const s = await collectionCampaign();
      await prepared(s, ACT_A, 3);
      const before = quiet(s);
      const adapter = tamperingAdapter(s, mutate);
      const r = await adapter.startWork({
        ...colPublication(310),
        pc_id: PC,
        act_id: ACT_A,
        mechanism_id: MECH,
        basis_id: "basis-main",
      });
      expect(r.ok, name).toBe(false);
      expect(quiet(s), name).toBe(before);
      expect(
        s.campaign.store.getFact(productionExtractionKey(`pc-collect:${PC}:${ACT_A}`)),
        name,
      ).toBeUndefined();
      expect(
        s.campaign.store.getFact(productionPcCollectionWorkKey(`pc-collect:${PC}:${ACT_A}`)),
        name,
      ).toBeUndefined();
    }
  });
});

describe("occupancy and movement (C5): a PC does one thing at a time, in either order", () => {
  it("a PC occupied by a collection may not commit to a movement", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    const before = quiet(s);
    const moved = await commitMove(s, 1);
    expect(moved.ok).toBe(false);
    expect(quiet(s)).toBe(before);
  });

  it("a PC with a movement commitment may not register or start a collection", async () => {
    const s = await collectionCampaign();
    expect((await commitMove(s, 1)).ok).toBe(true);
    expect((await requestMove(s, 2)).ok).toBe(true);
    const r = await confirmAndStart(s, ACT_A, 3);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    nothingExtracted(s, ACT_A);
    expect(s.collect.occupancyState(PC).state).toBe("NONE");
  });

  it("one occupancy at a time: a second attempt cannot start while the first is open", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 2);
    const r = await confirmAndStart(s, ACT_B, 2);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    expect(s.collect.extraction(PC, ACT_B)).toBeUndefined();
    expect(s.collect.occupancyState(PC)).toMatchObject({ state: "OPEN", act_id: ACT_A });
  });
});

describe("the PC's own time passage over its collection (C8)", () => {
  it("refuses time passage over an in-flight collection that is not engaged with the Temporal kernel (not recognised)", async () => {
    const s = await collectionCampaign();
    await prepared(s, ACT_A, 3);
    await s.collect.startWork({
      ...colPublication(320),
      pc_id: PC,
      act_id: ACT_A,
      mechanism_id: MECH,
      basis_id: "basis-main",
    });
    // started but never enrolled: the advance does not recognise it, and so does not pass the PC's time
    const before = quiet(s);
    expect(JSON.stringify(await advanceTo(s, T0.value + 3 * TAU + 5, "tx-unrecognised"))).toBe(
      PC_TARGET_REFUSAL,
    );
    expect(quiet(s)).toBe(before);
    expect(clock(s).value).toBe(T0.value);
  });

  it("a target short of the earned boundary changes nothing about the collection, and the work resolves once at the boundary", async () => {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    const end = T0.value + 3 * TAU;
    expect(await advanceTo(s, end - 1, "tx-short")).toEqual(PC_TARGET_COMMITTED);
    expect(sourceRemaining(s)).toBe(5);
    expect(reserveAmount(s)).toBe(0);
    expect(await advanceTo(s, end, "tx-exact")).toEqual(PC_TARGET_COMMITTED);
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
    // time passing again later never repeats the credit
    expect(await advanceTo(s, end + 100, "tx-later")).toEqual(PC_TARGET_COMMITTED);
    expect(sourceRemaining(s)).toBe(2);
    expect(reserveAmount(s)).toBe(3);
  });

  it("an earlier-due foreign Temporal object (a GIP sunset) in the crossing makes the PC's advance unavailable, and it is not decided silently", async () => {
    const s = await collectionCampaign();
    const gip = new GipAdapter(s.campaign.store);
    await establishInstitution({ gip }, 1, INSTITUTION_COURT);
    await establishOffice({ gip }, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishScopeBinding({ gip }, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    await must(
      gip.establishSunsetInstrument({
        ...gipPublication(4),
        instrument: sunsetInstrument(INSTRUMENT_A, at(T0.value + 5)),
      }),
    );
    await confirmAndStart(s, ACT_A, 3);
    const end = T0.value + 3 * TAU;
    const before = quiet(s);
    // the foreign sunset (T0+5) lies inside the crossing to the collection's boundary: the PC's own advance refuses (C8, conservative)
    expect(JSON.stringify(await advanceTo(s, end, "tx-foreign"))).toBe(PC_TARGET_REFUSAL);
    expect(quiet(s)).toBe(before);
    expect(sourceRemaining(s)).toBe(5);
    // a target short of the foreign object's instant crosses nothing of anyone's and is clear
    expect(await advanceTo(s, T0.value + 4, "tx-before-foreign")).toEqual(PC_TARGET_COMMITTED);
  });
});
