/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// CPAA-C1 (v0.3 design ratified; implementation acceptance pending) — save → close → load → continue is exact at every durable cut of one collection, converges on the
// uninterrupted run (one source drawdown, one Reserve credit, no duplicate), and a loaded campaign whose collection facts (or what
// they consumed) were edited, or were built outside admission, fails closed. The slice adds no persistence path: every fact is an
// ordinary OwnerFact, so the existing journal, receipts, replay and package integrity are the ones in force.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  type CommitGroup,
  pcCollectionCommitmentKey,
  pcCollectionMechanismKey,
  pcCollectionReachKey,
  pcCollectionRequestKey,
  popPcOccupancyKey,
  productionExtractionKey,
  productionPcCollectionWorkKey,
  worldPcLocusCustodyKey,
} from "@immortalis/contracts";
import { CanonicalCampaign } from "@immortalis/engine";
import {
  advanceActivePcToTarget,
  bindTrustedActivePcTargetAdvanceContext,
  commitConfirmedPcCollection,
  getPcCollectionReachTask,
  submitPcCollectionReach,
} from "@immortalis/protocol";
import { ACTOR_FIXTURE_EXTENSION } from "@immortalis/testkit";
import { rogueReplay } from "../support/existing-actor.ts";
import {
  ACT_A,
  ACT_B,
  COMMIT_REQ,
  MECH,
  PC,
  TAU,
  TASK_REQ,
  T0,
  at,
  collectionCampaign,
  confirmAndStart,
  extractionId,
  hostAnswer,
  reachReq,
  reopenCollection,
  reserveAmount,
  sourceRemaining,
  trustedCollection,
  type CollectionSeeded,
  gatewayRepresentation,
} from "../support/pc-collection.ts";
import { pcTargetTransaction } from "../support/pc-target-advance.ts";
import { tempDir } from "../support/tmp.ts";

const END = T0.value + 3 * TAU;
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

/** the continuation of an interrupted run: every step is idempotent by identity, so each is safe to present again */
async function finish(s: CollectionSeeded): Promise<void> {
  await confirmAndStart(s, ACT_A, 3);
  await advanceTo(s, END - 1, "tx-cut-short");
  await advanceTo(s, END, "tx-cut-end");
}

const summary = (s: CollectionSeeded) => ({
  source: sourceRemaining(s),
  reserve: reserveAmount(s),
  closed: s.collect.closed(PC, ACT_A),
  occupancy: s.collect.occupancyState(PC),
});

const cuts: { name: string; build: (s: CollectionSeeded) => Promise<void> }[] = [
  { name: "nothing committed", build: async () => undefined },
  {
    name: "the commitment-of-record and the PC-owned request committed",
    build: async (s) => {
      await commitConfirmedPcCollection(trustedCollection(s, ACT_A, 3), COMMIT_REQ);
    },
  },
  {
    name: "the physical-reach judgment retained",
    build: async (s) => {
      const ctx = trustedCollection(s, ACT_A, 3);
      await commitConfirmedPcCollection(ctx, COMMIT_REQ);
      const t = getPcCollectionReachTask(ctx, TASK_REQ);
      if (!t.ok) throw new Error("no task");
      await submitPcCollectionReach(
        ctx,
        reachReq(hostAnswer(t.value.task, "OPEN", "NOT_AT_ISSUE")),
      );
    },
  },
  {
    name: "Population's occupancy registered, Production not started",
    build: async (s) => {
      const ctx = trustedCollection(s, ACT_A, 3);
      await commitConfirmedPcCollection(ctx, COMMIT_REQ);
      const t = getPcCollectionReachTask(ctx, TASK_REQ);
      if (!t.ok) throw new Error("no task");
      await submitPcCollectionReach(
        ctx,
        reachReq(hostAnswer(t.value.task, "OPEN", "NOT_AT_ISSUE")),
      );
      // the gateway's own identities (RC-16): the continuation presents the same registration and converges by identity
      await gatewayRepresentation(s, ACT_A);
      await s.collect.registerOccupancy({
        group_id: `pc-collect-group:occupancy:${PC}:${ACT_A}`,
        intent_id: `pc-collect-intent:occupancy:${PC}:${ACT_A}`,
        cause: `cause-${ACT_A}`,
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        pc_id: PC,
        act_id: ACT_A,
        mechanism_id: MECH,
      });
    },
  },
  {
    name: "started and enrolled, no time passed",
    build: async (s) => void (await confirmAndStart(s, ACT_A, 3)),
  },
  {
    name: "the PC's time passed to just short of the earned boundary",
    build: async (s) => {
      await confirmAndStart(s, ACT_A, 3);
      await advanceTo(s, END - 1, "tx-cut-short");
    },
  },
  {
    name: "the earned boundary resolved (source dropped, Reserve credited)",
    build: async (s) => {
      await confirmAndStart(s, ACT_A, 3);
      await advanceTo(s, END - 1, "tx-cut-short");
      await advanceTo(s, END, "tx-cut-end");
    },
  },
];

async function reference() {
  const s = await collectionCampaign();
  await finish(s);
  const out = { ...summary(s), head: s.campaign.store.head().state_sha256 };
  await s.campaign.close();
  return out;
}

describe("every durable cut reloads exactly and converges on the uninterrupted run", () => {
  it.each(cuts)("$name", async ({ build }) => {
    const ref = await reference();
    const dir = tempDir("immortalis-col-cut-");
    const s = await collectionCampaign({ dir });
    await build(s);
    const cutHead = s.campaign.store.head();
    await s.campaign.close();

    const r = await reopenCollection(dir);
    expect(r.campaign.store.head().state_sha256).toBe(cutHead.state_sha256);
    expect(r.campaign.store.head().journal_head_sha256).toBe(cutHead.journal_head_sha256);
    await finish(r);
    expect(summary(r)).toEqual({
      source: ref.source,
      reserve: ref.reserve,
      closed: ref.closed,
      occupancy: ref.occupancy,
    });
    expect(sourceRemaining(r)).toBe(2);
    expect(reserveAmount(r)).toBe(3);
    // not a second drawdown nor a second credit, and the interrupted run's final state IS the uninterrupted run's
    expect(r.campaign.store.head().state_sha256).toBe(ref.head);
    await r.campaign.close();

    const again = await reopenCollection(dir);
    expect(again.campaign.store.head().state_sha256).toBe(ref.head);
    await again.campaign.close();
  });

  it("a refused second attempt reloads exactly: the denial is a durable fact and the real source stays 2", async () => {
    const dir = tempDir("immortalis-col-denied-");
    const s = await collectionCampaign({ dir });
    await finish(s);
    await confirmAndStart(s, ACT_B, 3);
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenCollection(dir);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(sourceRemaining(r)).toBe(2);
    expect(reserveAmount(r)).toBe(3);
    expect(r.collect.occupancyState(PC)).toMatchObject({
      state: "RELEASED",
      why: "DENIED",
      act_id: ACT_B,
    });
    expect(r.collect.extraction(PC, ACT_B)).toBeUndefined();
    await r.campaign.close();
  }, 120_000);
});

describe("a loaded campaign whose collection facts were edited or built outside admission fails closed", () => {
  async function saved(
    upTo: "request" | "reach" | "started" | "complete" = "complete",
  ): Promise<string> {
    const dir = tempDir("immortalis-col-tamper-");
    const s = await collectionCampaign({ dir });
    if (upTo === "request")
      await commitConfirmedPcCollection(trustedCollection(s, ACT_A, 3), COMMIT_REQ);
    else if (upTo === "reach") {
      const ctx = trustedCollection(s, ACT_A, 3);
      await commitConfirmedPcCollection(ctx, COMMIT_REQ);
      const t = getPcCollectionReachTask(ctx, TASK_REQ);
      if (!t.ok) throw new Error("no task");
      await submitPcCollectionReach(
        ctx,
        reachReq(hostAnswer(t.value.task, "OPEN", "NOT_AT_ISSUE")),
      );
    } else if (upTo === "started") await confirmAndStart(s, ACT_A, 3);
    else await finish(s);
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };
  const tamper = async (edit: (j: any) => void, upTo: Parameters<typeof saved>[0] = "complete") => {
    const dir = await saved(upTo);
    const p = join(dir, stateFile(dir));
    const j = JSON.parse(readFileSync(p, "utf8"));
    edit(j);
    writeFileSync(p, JSON.stringify(j));
    return openOutcome(dir);
  };
  const fact = (j: any, key: string) => j.facts.find((f: any) => f.key === key);

  it("a valid saved campaign opens at each stage", async () => {
    for (const stage of ["request", "reach", "started", "complete"] as const)
      expect(await openOutcome(await saved(stage)), stage).toBe("OK");
  }, 120_000);

  it("an edit of the saved commitment-of-record is not silently normalized", async () => {
    const edits: Record<string, (f: any) => void> = {
      "PC identity moved": (f) => (f.value.pc_id = "actor-other"),
      "act identity moved": (f) => (f.value.act_id = "act-other"),
      "commitment id moved": (f) => (f.value.commitment_id = "pc-collect-commitment:other"),
      "authority downgraded": (f) => (f.value.authored_under.role = "role.archivist"),
      "permission changed": (f) => (f.value.authored_under.permission = "permission.canon.write"),
      "intent kind changed": (f) => (f.value.intent.kind = "FORCED_RELOCATION"),
      "amount inflated": (f) => (f.value.intent.quantity.amount = 5),
      "amount shrunk": (f) => (f.value.intent.quantity.amount = 1),
      "source moved": (f) => (f.value.intent.source.source_key = "source-x"),
      "reserve moved": (f) => (f.value.intent.destination.reserve_id = "reserve-x"),
      "material changed": (f) => (f.value.intent.material_class = "other-material"),
      "pin moved": (f) => (f.value.basis.pinned_versions.custody = 9),
      "a result smuggled in": (f) => (f.value.intent.result = "SUCCESS"),
      "a duration smuggled in": (f) => (f.value.intent.duration = 5),
      "committer changed": (f) => (f.value.committer.owner = "world_state"),
      "owner changed": (f) => (f.owner = "world_state"),
      "version bumped": (f) => (f.version = 2),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(
        await tamper((j) => edit(fact(j, pcCollectionCommitmentKey(PC, ACT_A))), "request"),
        name,
      ).not.toBe("OK");
  }, 120_000);

  it("an edit of the saved PC-owned request is not accepted", async () => {
    const edits: Record<string, (f: any) => void> = {
      "amount moved": (f) => (f.value.requested_output.quantity.amount = 5),
      "request id changed": (f) => (f.value.request_id = "pc-collect:other"),
      "scope moved": (f) => (f.value.scope.locus.entity_id = "locus-x"),
      "source owner changed": (f) => (f.value.source.owner = "world_state"),
      "owner changed": (f) => (f.owner = "world_state"),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(
        await tamper((j) => edit(fact(j, pcCollectionRequestKey(PC, ACT_A))), "request"),
        name,
      ).not.toBe("OK");
  }, 120_000);

  it("an edit of the saved mechanism that the started work derived from is not accepted (τ, floor, claims, contract pin)", async () => {
    const edits: Record<string, (f: any) => void> = {
      "τ shortened": (f) => (f.value.cycle.duration.value = 1),
      "τ lengthened": (f) => (f.value.cycle.duration.value = 99),
      "a floor smuggled in": (f) =>
        (f.value.interaction_floor = { status: "APPLIES", minimum: { unit: T0.unit, value: 500 } }),
      "authored cycle words replaced": (f) =>
        (f.value.cycle.authored_quote = "one handful every 1 fixture-time-unit"),
      "actuator words invented": (f) =>
        (f.value.actuator.statement = "two tireless mechanical hands"),
      "traversal words invented": (f) =>
        (f.value.traversal.statement = "these hands can pass any barrier whatever"),
      "claim moved to an unaccepted one": (f) =>
        (f.value.authored_from.claims = [{ section: "embodiment_topology", index: 99 }]),
      "contract pin moved": (f) => (f.value.authored_from.contract.version = 9),
      "PC moved": (f) => (f.value.pc_id = "actor-other"),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(
        await tamper((j) => edit(fact(j, pcCollectionMechanismKey(PC, MECH))), "started"),
        name,
      ).not.toBe("OK");
  }, 120_000);

  it("an edit of the saved reach judgment — verdict, answer, digest, authority, pins — is not accepted", async () => {
    const edits: Record<string, (f: any) => void> = {
      "verdict flipped": (f) => (f.value.verdict = "NOT_REACHABLE"),
      "path reading flipped": (f) => (f.value.answer.path.reading = "CLOSED"),
      "digest moved": (f) => (f.value.task.digest = "0".repeat(64)),
      "answer digest moved": (f) => (f.value.answer.task_digest = "0".repeat(64)),
      "authority changed": (f) => (f.value.authority.role = "role.player"),
      "mechanism pin moved": (f) => (f.value.task.mechanism.version = 9),
      "access digest moved": (f) => (f.value.task.access_facts_digest = "0".repeat(64)),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(
        await tamper((j) => edit(fact(j, pcCollectionReachKey(PC, ACT_A))), "reach"),
        name,
      ).not.toBe("OK");
  }, 120_000);

  it("an edit of the saved occupancy, work record or extraction — interval, boundary, cycles, pins — is not accepted", async () => {
    const occ: Record<string, (f: any) => void> = {
      "interval shortened": (f) => (f.value.interval.to.value = f.value.interval.from.value + 1),
      "interval lengthened": (f) => (f.value.interval.to.value += 100),
      "act moved": (f) => (f.value.act_id = "act-other"),
      "commitment pin moved": (f) => (f.value.commitment.version = 9),
    };
    for (const [name, edit] of Object.entries(occ))
      expect(
        await tamper((j) => edit(fact(j, popPcOccupancyKey(PC))), "started"),
        `occupancy ${name}`,
      ).not.toBe("OK");
    const work: Record<string, (f: any) => void> = {
      "completion moved": (f) => (f.value.derivation.completes_at.value -= 1),
      "cycles moved": (f) => (f.value.derivation.cycles = 2),
      "causal duration moved": (f) => (f.value.derivation.causal_duration.value = 1),
      "started_at moved": (f) => (f.value.derivation.started_at.value += 1),
      "reach pin moved": (f) => (f.value.pins.reach.version = 9),
      "binding pin moved": (f) => (f.value.pins.binding = 9),
      "custody pin moved": (f) => (f.value.pins.custody = 9),
    };
    for (const [name, edit] of Object.entries(work))
      expect(
        await tamper(
          (j) => edit(fact(j, productionPcCollectionWorkKey(extractionId(ACT_A)))),
          "started",
        ),
        `work ${name}`,
      ).not.toBe("OK");
    const extraction: Record<string, (f: any) => void> = {
      "boundary moved": (f) => (f.value.timing.boundary.at.value -= 1),
      "started_at moved": (f) => (f.value.timing.started_at.value -= 1),
      "quantity moved": (f) => (f.value.quantity.amount = 2),
    };
    for (const [name, edit] of Object.entries(extraction))
      expect(
        await tamper((j) => edit(fact(j, productionExtractionKey(extractionId(ACT_A)))), "started"),
        `extraction ${name}`,
      ).not.toBe("OK");
  }, 120_000);

  it("removing what a started collection stands on — work record, reach, commitment, occupancy, custody, binding — fails", async () => {
    const drops: Record<string, string> = {
      "work record": productionPcCollectionWorkKey(extractionId(ACT_A)),
      reach: pcCollectionReachKey(PC, ACT_A),
      commitment: pcCollectionCommitmentKey(PC, ACT_A),
      request: pcCollectionRequestKey(PC, ACT_A),
      mechanism: pcCollectionMechanismKey(PC, MECH),
      occupancy: popPcOccupancyKey(PC),
      custody: worldPcLocusCustodyKey(PC),
      binding: PLAYER_CHARACTER_BINDING_KEY,
    };
    for (const [name, key] of Object.entries(drops))
      expect(
        await tamper((j) => (j.facts = j.facts.filter((f: any) => f.key !== key)), "started"),
        name,
      ).not.toBe("OK");
  }, 120_000);

  it("an extraction fabricated in the PC-owned request key space, with no work record of Production's, fails", async () => {
    expect(
      await tamper((j) => {
        const copy = structuredClone(fact(j, productionExtractionKey(extractionId(ACT_A))));
        j.facts = j.facts.filter(
          (f: any) => f.key !== productionPcCollectionWorkKey(extractionId(ACT_A)),
        );
        j.facts.push(copy);
      }, "started"),
    ).not.toBe("OK");
  }, 120_000);
});

describe("a history built OUTSIDE admission (a consistent, replayable journal that is not canonical) is refused by the load verifier", () => {
  const codes = async (dir: string): Promise<string> => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };
  async function started(): Promise<string> {
    const dir = tempDir("immortalis-col-rogue-");
    const s = await collectionCampaign({ dir });
    await confirmAndStart(s, ACT_A, 3);
    await s.campaign.close();
    return dir;
  }
  /** rewrites the value of the one write at `key`, wherever the lawful run committed it */
  const edit =
    (key: string, f: (v: any) => void) =>
    (g: CommitGroup): CommitGroup => ({
      ...g,
      writes: g.writes.map((w) => {
        if (w.key !== key) return w;
        const v = structuredClone(w.value) as any;
        f(v);
        return { ...w, value: v };
      }),
    });
  const workKey = productionPcCollectionWorkKey(extractionId(ACT_A));
  const exKey = productionExtractionKey(extractionId(ACT_A));

  it("replaying the lawful journal unchanged opens (the control)", async () => {
    expect(await codes(await rogueReplay(await started()))).toBe("OK");
  }, 120_000);

  it("each way of making a PC-owned collection say what its premises did not is PC_COLLECTION_STATE", async () => {
    const src = await started();
    const cases: Record<string, (g: CommitGroup) => CommitGroup> = {
      "work cycles rewritten": edit(workKey, (v) => (v.derivation.cycles = 2)),
      "work completion rewritten": edit(workKey, (v) => (v.derivation.completes_at.value -= 1)),
      "work causal duration rewritten": edit(
        workKey,
        (v) => (v.derivation.causal_duration.value = 1),
      ),
      "extraction boundary rewritten": edit(exKey, (v) => (v.timing.boundary.at.value -= 1)),
      "occupancy interval rewritten": edit(
        popPcOccupancyKey(PC),
        (v) => (v.interval.to.value += 5),
      ),
      "commitment amount rewritten": edit(
        pcCollectionCommitmentKey(PC, ACT_A),
        (v) => (v.intent.quantity.amount = 2),
      ),
      "mechanism cycle rewritten": edit(
        pcCollectionMechanismKey(PC, MECH),
        (v) => (v.cycle.duration.value = 1),
      ),
      "reach verdict flipped": edit(
        pcCollectionReachKey(PC, ACT_A),
        (v) => (v.verdict = "NOT_REACHABLE"),
      ),
      "reach answer rewritten": edit(
        pcCollectionReachKey(PC, ACT_A),
        (v) => (v.answer.path.reading = "CLOSED"),
      ),
      "the work record dropped from the start group": (g) => ({
        ...g,
        writes: g.writes.filter((w) => w.key !== workKey),
      }),
      "the start group governed by the plain drawdown rule": (g) =>
        g.writes.some((w) => w.key === exKey)
          ? { ...g, rule: { ...g.rule, clause: "the plain drawdown rule" } }
          : g,
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const out = await codes(await rogueReplay(src, mutate));
      expect(out, name).not.toBe("OK");
      expect(out, name).toMatch(/PC_COLLECTION_STATE|RULE_DRIFT/);
    }
  }, 120_000);
});
