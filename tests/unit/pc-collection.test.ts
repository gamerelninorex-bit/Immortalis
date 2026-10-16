/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary values */
// Unit evidence for the pure rules of the CPAA-C1 v0.2 PROVISIONAL collection slice: the exact-cycle duration derivation (including
// the withheld cases), the quote-anchored reach interpretation with its DERIVED verdict, and the stage-time premise check that
// invalidates a started act instead of completing it silently. Not ratified; see packages/contracts/src/pc-collection.ts.
import { describe, expect, it } from "vitest";
import {
  PcCollectionMechanismSchema,
  pcCollectionMechanismKey,
  pcCollectionReachKey,
  popPcOccupancyKey,
  worldPcLocusCustodyKey,
  ProductionPcCollectionWorkSchema,
  type CanonicalTime,
  type OwnerFact,
  productionPcCollectionWorkKey,
} from "@immortalis/contracts";
import {
  buildPcCollectionReachTask,
  deriveCollectionTiming,
  interpretPcCollectionReachAnswer,
  pcCollectionPremiseViolation,
  pcOccupancyState,
} from "@immortalis/engine";
import {
  ACT_A,
  ACT_B,
  MECH,
  PC,
  TAU,
  T0,
  collectionCampaign,
  confirmAndStart,
  extractionId,
  hostAnswer,
} from "../support/pc-collection.ts";
import { commitMove } from "../support/pc-movement.ts";

const U = T0.unit;
const t = (value: number, unit = U): CanonicalTime => ({ unit, value });
const mech = (over: Record<string, unknown> = {}) =>
  PcCollectionMechanismSchema.parse({
    mechanism_id: "m",
    pc_id: "pc",
    authored_from: {
      contract: { fact_key: "pc/pc/contract", version: 1 },
      claims: [{ section: "embodiment_topology", index: 0 }],
    },
    actuator: { statement: "SYNTHETIC FIXTURE: hands" },
    traversal: { statement: "SYNTHETIC FIXTURE: hands cannot pass a sealed barrier" },
    cycle: { kind: "SERIAL_PER_UNIT", units_per_cycle: 1, duration: t(4) },
    interaction_floor: {
      status: "NOT_APPLICABLE",
      ground: "SYNTHETIC FIXTURE: a handful is not consequential",
    },
    committer: { owner: "pc_existence", facet: "pc_collection_mechanism" },
    ...over,
  });
const q = (amount: number) => ({ amount, unit: "x" });

describe("deriveCollectionTiming: cycles × τ, the later of that and an applicable minimum, or WITHHELD", () => {
  it("derives the exact serial completion from the amount and the cycle; nothing is requested", () => {
    for (const [amount, expected] of [
      [1, 104],
      [2, 108],
      [3, 112],
      [5, 120],
    ] as const) {
      const r = deriveCollectionTiming(t(100), q(amount), mech());
      expect(r.ok && r.value.completes_at).toEqual(t(expected));
      expect(r.ok && r.value.cycles).toBe(amount);
      expect(r.ok && r.value.causal_duration).toEqual(t(amount * 4));
    }
  });

  it("an applicable minimum extends, never shortens, the completion", () => {
    const floor = (v: number) => mech({ interaction_floor: { status: "APPLIES", minimum: t(v) } });
    const long = deriveCollectionTiming(t(100), q(3), floor(50));
    expect(long.ok && long.value.completes_at).toEqual(t(150));
    expect(long.ok && long.value.floor_minimum).toEqual(t(50));
    const short = deriveCollectionTiming(t(100), q(3), floor(5));
    expect(short.ok && short.value.completes_at).toEqual(t(112));
  });

  it("an unresolved minimum, a foreign unit and a non-representable total WITHHOLD the exact completion", () => {
    const withheld = (m: any, now = t(100)) => {
      const r = deriveCollectionTiming(now, q(3), m);
      return !r.ok && r.error.code === "COLLECTION_WITHHELD";
    };
    expect(withheld(mech({ interaction_floor: { status: "UNRESOLVED" } }))).toBe(true);
    expect(
      withheld(
        mech({ cycle: { kind: "SERIAL_PER_UNIT", units_per_cycle: 1, duration: t(4, "other") } }),
      ),
    ).toBe(true);
    expect(
      withheld(mech({ interaction_floor: { status: "APPLIES", minimum: t(5, "other") } })),
    ).toBe(true);
    expect(
      withheld(
        mech({
          cycle: {
            kind: "SERIAL_PER_UNIT",
            units_per_cycle: 1,
            duration: t(Number.MAX_SAFE_INTEGER),
          },
        }),
      ),
    ).toBe(true);
  });

  it("the mechanism schema has no field for a rate, a capacity, a skill, a speed or a boundary", () => {
    for (const extra of [
      { rate: 2 },
      { capacity: 9 },
      { skill: "expert" },
      { speed: 3 },
      { boundary_at: t(1) },
    ])
      expect(PcCollectionMechanismSchema.safeParse({ ...mech(), ...extra }).success).toBe(false);
    expect(
      PcCollectionMechanismSchema.safeParse({
        ...mech(),
        cycle: { kind: "SERIAL_PER_UNIT", units_per_cycle: 2, duration: t(4) },
      }).success,
    ).toBe(false);
    expect(
      PcCollectionMechanismSchema.safeParse({
        ...mech(),
        cycle: { kind: "SERIAL_PER_UNIT", units_per_cycle: 1, duration: t(0) },
      }).success,
    ).toBe(false);
  });
});

describe("interpretPcCollectionReachAnswer: a quote-anchored reading, a DERIVED verdict", () => {
  const source = {
    key: "world/w/source/s",
    value: {
      access_facts: [
        { aspect: "a", statement: "SYNTHETIC FIXTURE: the material lies behind a sealed barrier." },
      ],
    } as any,
  };
  const task = buildPcCollectionReachTask("pc", "act", source, {
    key: "pc/pc/collection-mechanism/m",
    version: 1,
    value: mech(),
  });
  const ok = (path: "OPEN" | "CLOSED", m: "ABLE_TO_PASS" | "UNABLE_TO_PASS" | "NOT_AT_ISSUE") =>
    interpretPcCollectionReachAnswer(task, hostAnswer(task, path, m));

  it("2x2 over the path reading and the mechanism reading", () => {
    expect(ok("OPEN", "NOT_AT_ISSUE")).toMatchObject({ ok: true, value: { verdict: "REACHABLE" } });
    expect(ok("OPEN", "UNABLE_TO_PASS")).toMatchObject({
      ok: true,
      value: { verdict: "REACHABLE" },
    });
    expect(ok("OPEN", "ABLE_TO_PASS")).toMatchObject({ ok: true, value: { verdict: "REACHABLE" } });
    expect(ok("CLOSED", "ABLE_TO_PASS")).toMatchObject({
      ok: true,
      value: { verdict: "REACHABLE" },
    });
    expect(ok("CLOSED", "UNABLE_TO_PASS")).toMatchObject({
      ok: true,
      value: { verdict: "NOT_REACHABLE" },
    });
  });

  it("a closed path needs a decided, mechanism-anchored reading; every ground is a verbatim quotation", () => {
    expect(ok("CLOSED", "NOT_AT_ISSUE").ok).toBe(false);
    const good: any = hostAnswer(task, "CLOSED", "UNABLE_TO_PASS");
    for (const bad of [
      {
        ...good,
        path: { ...good.path, grounds: ["a wholly invented sentence about the barrier"] },
      },
      { ...good, path: { ...good.path, grounds: [] } },
      { ...good, path: { ...good.path, grounds: ["lies"] } }, // too short to anchor
      { ...good, mechanism: { ...good.mechanism, grounds: [] } },
      { ...good, mechanism: { ...good.mechanism, grounds: ["its hands can pass anything"] } },
      { ...good, task_digest: "f".repeat(64) },
      { ...good, verdict: "REACHABLE" },
      { ...good, role: "role.gm" },
    ])
      expect(interpretPcCollectionReachAnswer(task, bad).ok).toBe(false);
  });

  it("the task is mechanical and digest-bound: a changed access fact or mechanism wording is another task", () => {
    const other = buildPcCollectionReachTask(
      "pc",
      "act",
      {
        key: source.key,
        value: {
          access_facts: [{ aspect: "a", statement: "SYNTHETIC FIXTURE: open ground." }],
        } as any,
      },
      { key: "pc/pc/collection-mechanism/m", version: 1, value: mech() },
    );
    expect(other.digest).not.toBe(task.digest);
    expect(
      interpretPcCollectionReachAnswer(other, hostAnswer(task, "OPEN", "NOT_AT_ISSUE")).ok,
    ).toBe(false);
  });
});

describe("pcCollectionPremiseViolation: a premise changed between start and boundary invalidates the act, it never completes silently", () => {
  async function startedView() {
    const s = await collectionCampaign();
    await confirmAndStart(s, ACT_A, 3);
    const facts = new Map<string, OwnerFact>(s.campaign.store.listFacts().map((f) => [f.key, f]));
    const work = ProductionPcCollectionWorkSchema.parse(
      facts.get(productionPcCollectionWorkKey(extractionId(ACT_A)))!.value,
    );
    return { s, facts, work };
  }
  const clone = (facts: Map<string, OwnerFact>) => new Map(facts);
  const edit = (facts: Map<string, OwnerFact>, key: string, f: (fact: any) => void) => {
    const next = structuredClone(facts.get(key)!) as any;
    f(next);
    facts.set(key, next);
  };

  it("holds for the unchanged started act (the control)", async () => {
    const { facts, work } = await startedView();
    expect(pcCollectionPremiseViolation(work, facts)).toBeNull();
    expect(pcOccupancyState(facts, PC)).toMatchObject({ state: "OPEN", act_id: ACT_A });
  });

  it("each changed premise yields a violation", async () => {
    const { facts, work } = await startedView();
    const cases: Record<string, (m: Map<string, OwnerFact>) => void> = {
      "custody superseded": (m) => edit(m, worldPcLocusCustodyKey(PC), (f) => (f.version += 1)),
      "custody removed": (m) => void m.delete(worldPcLocusCustodyKey(PC)),
      "custody moved to another locus": (m) =>
        edit(
          m,
          worldPcLocusCustodyKey(PC),
          (f) => (f.value.stationary_locus.locus.entity_id = "locus-elsewhere"),
        ),
      "mechanism superseded": (m) =>
        edit(m, pcCollectionMechanismKey(PC, MECH), (f) => (f.version += 1)),
      "reach judgment superseded": (m) =>
        edit(m, pcCollectionReachKey(PC, ACT_A), (f) => (f.version += 1)),
      "source path facts changed": (m) => {
        const srcKey = [...m.keys()].find((k) => /^world\/[^/]+\/source\//.test(k))!;
        edit(
          m,
          srcKey,
          (f) =>
            (f.value.access_facts = [
              {
                aspect: "synthetic-access-aspect",
                statement: "SYNTHETIC FIXTURE: a wall now stands here.",
              },
            ]),
        );
      },
      "occupancy released": (m) =>
        edit(m, popPcOccupancyKey(PC), (f) => (f.value.status = "RELEASED_DENIED")),
      "occupancy now another act's": (m) =>
        edit(m, popPcOccupancyKey(PC), (f) => (f.value.act_id = ACT_B)),
      "movement record acquired": (m) =>
        m.set(`pc/${PC}/movement/commitment`, m.get(popPcOccupancyKey(PC))!),
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const m = clone(facts);
      mutate(m);
      expect(pcCollectionPremiseViolation(work, m), name).not.toBeNull();
    }
  });

  it("a movement commitment cannot be made while the work is open (the same premise from the other side)", async () => {
    const { s } = await startedView();
    expect((await commitMove(s, 1)).ok).toBe(false);
    void TAU;
  });
});
