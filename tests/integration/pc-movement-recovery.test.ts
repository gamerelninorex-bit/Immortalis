import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// Active-PC Voluntary Movement — save → close → load → continue preserves exactly one physical-locus authority at every durable
// cut of the journey, with convergence on the uninterrupted run and no duplicate movement; a lost reply converges by identity; a
// loaded campaign whose PC-side movement facts (or what they consumed) have been tampered with, or were built outside admission,
// fails closed with a precise integrity code. The slice adds no persistence path: every fact is an ordinary OwnerFact, so the
// existing journal, receipts, replay and package integrity are the ones in force.
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-13, RC-16; IM-03, IM-05, IM-07, IM-11, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  logisticsCommitmentKey,
  logisticsDeliveryKey,
  logisticsTransferKey,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  worldEntityTransitionKey,
  worldPcLocusCustodyKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { CanonicalCampaign, LogisticsAdapter, TemporalCoordinator } from "@immortalis/engine";
import { ACTOR_FIXTURE_EXTENSION, logStopAtBoundaryRequest } from "@immortalis/testkit";
import {
  DEST_LOCUS_ID,
  LOG_T_DELIVERY,
  PC,
  REQUEST_ID,
  W,
  advanceToDelivery,
  authorityCensus,
  blockingStore,
  commitMove,
  custodiedCampaign,
  finishJourney,
  isRetirementGroup,
  isTransitionGroup,
  logisticsCommit,
  logisticsDispatch,
  movementProviders,
  movementSummary,
  registerPcTransfer,
  reopenMovement,
  requestMove,
  type PcMoveSeeded,
} from "../support/pc-movement.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const ORIGIN = "locus-fixture-1";

async function referenceRun() {
  const s = await custodiedCampaign();
  await finishJourney(s);
  const summary = movementSummary(s);
  await s.campaign.close();
  return summary;
}

const cuts: {
  name: string;
  phase: string;
  authority: "WORLD_STATE" | "LOGISTICS";
  stationary: string | null;
  build: (s: PcMoveSeeded) => Promise<void>;
}[] = [
  {
    name: "custody established, nothing committed",
    phase: "STATIONARY_AT_ORIGIN",
    authority: "WORLD_STATE",
    stationary: ORIGIN,
    build: async () => undefined,
  },
  {
    name: "the player's commitment-of-record committed",
    phase: "STATIONARY_AT_ORIGIN",
    authority: "WORLD_STATE",
    stationary: ORIGIN,
    build: async (s) => void (await must(commitMove(s, 1))),
  },
  {
    name: "the PC-owned request committed",
    phase: "STATIONARY_AT_ORIGIN",
    authority: "WORLD_STATE",
    stationary: ORIGIN,
    build: async (s) => {
      await must(commitMove(s, 1));
      await must(requestMove(s, 2));
    },
  },
  {
    name: "the Logistics commitment committed, not dispatched",
    phase: "STATIONARY_AT_ORIGIN",
    authority: "WORLD_STATE",
    stationary: ORIGIN,
    build: async (s) => {
      await must(commitMove(s, 1));
      await must(requestMove(s, 2));
      await must(logisticsCommit(s, 3));
    },
  },
  {
    name: "dispatched, the transfer's object not yet registered",
    phase: "IN_TRANSFER",
    authority: "LOGISTICS",
    stationary: null,
    build: async (s) => {
      await must(commitMove(s, 1));
      await must(requestMove(s, 2));
      await must(logisticsCommit(s, 3));
      await must(logisticsDispatch(s, 4));
    },
  },
  {
    name: "in transfer with its object registered and its boundary engaged",
    phase: "IN_TRANSFER",
    authority: "LOGISTICS",
    stationary: null,
    build: async (s) => {
      await must(commitMove(s, 1));
      await must(requestMove(s, 2));
      await must(logisticsCommit(s, 3));
      await must(logisticsDispatch(s, 4));
      await registerPcTransfer(s, 5);
    },
  },
  {
    name: "a crash after Logistics' delivery result, before World-State's destination commit",
    phase: "IN_TRANSFER",
    authority: "LOGISTICS",
    stationary: null,
    build: async (s) => {
      await must(commitMove(s, 1));
      await must(requestMove(s, 2));
      await must(logisticsCommit(s, 3));
      await must(logisticsDispatch(s, 4));
      await registerPcTransfer(s, 5);
      const blocked = blockingStore(s.campaign.store, isTransitionGroup);
      const r = await new TemporalCoordinator(blocked.store, movementProviders()).advance(
        logStopAtBoundaryRequest("tx-pc-move", REQUEST_ID),
      );
      expect(r.ok).toBe(false);
      expect(blocked.blocked()).toBe(1);
      expect(s.logistics.delivery(W, PC)).toBeDefined();
    },
  },
  {
    name: "a crash after World-State's destination commit, before Logistics' retirement",
    phase: "DESTINATION_COMMITTED_RETIREMENT_PENDING",
    authority: "WORLD_STATE",
    stationary: DEST_LOCUS_ID,
    build: async (s) => {
      await must(commitMove(s, 1));
      await must(requestMove(s, 2));
      await must(logisticsCommit(s, 3));
      await must(logisticsDispatch(s, 4));
      await registerPcTransfer(s, 5);
      const blocked = blockingStore(s.campaign.store, isRetirementGroup);
      const r = await new TemporalCoordinator(blocked.store, movementProviders()).advance(
        logStopAtBoundaryRequest("tx-pc-move", REQUEST_ID),
      );
      expect(r.ok).toBe(false);
      expect(blocked.blocked()).toBe(1);
    },
  },
  {
    name: "the journey complete: destination committed and Logistics retired",
    phase: "DESTINATION_COMMITTED",
    authority: "WORLD_STATE",
    stationary: DEST_LOCUS_ID,
    build: async (s) => {
      await finishJourney(s);
    },
  },
];

/** What must hold of the ownership result at any cut: exactly one authority, agreed on by the raw facts and the resolver. */
function expectOneAuthority(s: PcMoveSeeded, cut: (typeof cuts)[number]) {
  expect(s.campaign.verify()).toEqual([]);
  const census = authorityCensus(s);
  expect(census.total).toBe(1);
  const where = s.campaign.pcCurrentLocus(PC)!;
  expect(where.phase).toBe(cut.phase);
  expect(where.authority).toBe(cut.authority);
  expect(where.stationary?.locus.entity_id ?? null).toBe(cut.stationary);
  expect(where.authority === "LOGISTICS").toBe(census.logistics === 1);
  // at most one of each fact, never a duplicate movement
  const keyed = (re: RegExp) => s.campaign.store.listFacts().filter((f) => re.test(f.key));
  expect(keyed(/\/locus-custody$/)).toHaveLength(1);
  expect(keyed(/^logistics\/commitment\//).length).toBeLessThanOrEqual(1);
  expect(keyed(/^logistics\/transfer\//).length).toBeLessThanOrEqual(1);
  expect(keyed(/^logistics\/delivery\//).length).toBeLessThanOrEqual(1);
  expect(keyed(/\/entity\/[^/]+\/transition$/).length).toBeLessThanOrEqual(1);
}

describe("save → close → load → continue preserves exactly one authority at every durable cut", () => {
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, and finishing converges on the uninterrupted run`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await custodiedCampaign(dir);
      await cut.build(s);
      expectOneAuthority(s, cut);
      const before = movementSummary(s);
      await s.campaign.close();

      const r = await reopenMovement(dir);
      expect(movementSummary(r)).toEqual(before);
      expectOneAuthority(r, cut);

      // continuing: every step is re-presented under its fixed identity; done steps replay, none is duplicated
      await finishJourney(r);
      const done = cuts[cuts.length - 1]!;
      expectOneAuthority(r, done);
      expect(movementSummary(r).head.state_sha256).toBe(ref.head.state_sha256);
      expect(movementSummary(r).head.journal_entries).toBe(ref.head.journal_entries);
      expect(movementSummary(r).facts.map((f) => [f.key, f.version, f.value])).toEqual(
        ref.facts.map((f) => [f.key, f.version, f.value]),
      );
      await r.campaign.close();
    });
  }

  it("the destination is persistent truth: after the journey, across two reloads, the PC is at the destination and nowhere else", async () => {
    const dir = tempDir();
    const s = await custodiedCampaign(dir);
    await finishJourney(s);
    await s.campaign.close();
    for (const build of ["pc-move-reopen-a", "pc-move-reopen-b"]) {
      const r = await reopenMovement(dir, build);
      const where = r.campaign.pcCurrentLocus(PC)!;
      expect(where).toMatchObject({ phase: "DESTINATION_COMMITTED", authority: "WORLD_STATE" });
      expect(where.stationary!.locus.entity_id).toBe(DEST_LOCUS_ID);
      expect(r.campaign.verify()).toEqual([]);
      // the sealed origin custody and the binding's referent still say "origin": provenance, never current truth
      expect(r.campaign.pcPhysicalLocusCustody(PC)!.value.stationary_locus.locus.entity_id).toBe(
        ORIGIN,
      );
      expect(r.campaign.binding()!.value.coupling.locus.entity_id).toBe(ORIGIN);
      await r.campaign.close();
    }
  });

  it("after a reload a second journey is a version conflict at every layer, and re-presenting the old intents is a replay", async () => {
    const dir = tempDir();
    const s = await custodiedCampaign(dir);
    await finishJourney(s);
    await s.campaign.close();
    const r = await reopenMovement(dir);
    const head = r.campaign.store.head();
    for (const attempt of [
      () => commitMove(r, 21),
      () => requestMove(r, 22),
      () => logisticsCommit(r, 23),
      () => logisticsDispatch(r, 24),
    ]) {
      const outcome = await attempt();
      expect(!outcome.ok && outcome.error.code).toBe("VERSION_CONFLICT");
    }
    expect(r.campaign.store.head()).toEqual(head);
    expect((await must(commitMove(r, 1))).replayed).toBe(true);
    expect((await must(requestMove(r, 2))).replayed).toBe(true);
    expect((await must(advanceToDelivery(r))).replayed).toBe(true);
    expect(r.campaign.store.head()).toEqual(head);
    await r.campaign.close();
  });
});

describe("a lost reply or a retry converges by identity (RC-16)", () => {
  const lose = (s: PcMoveSeeded, key: string) => {
    const real = s.campaign.store;
    (s.campaign as any).store = new Proxy(real, {
      get(target, prop) {
        if (prop === "commit")
          return async (g: CommitGroup) => {
            const r = await target.commit(g);
            return g.writes.some((w) => w.key === key)
              ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
              : r;
          };
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    });
    return () => ((s.campaign as any).store = real);
  };

  it("the commitment-of-record and the request committed with the reply lost are reconciled by identity: replayed, never a second record", async () => {
    const ref = await referenceRun();
    const s = await custodiedCampaign();
    const restoreCommit = lose(s, pcMovementCommitmentKey(PC));
    const lostCommit = await commitMove(s, 1);
    expect(!lostCommit.ok && lostCommit.error.code).toBe("UNKNOWN_OUTCOME");
    restoreCommit();
    expect((await must(commitMove(s, 1))).replayed).toBe(true);
    const restoreRequest = lose(s, pcMovementRequestKey(PC));
    const lostRequest = await requestMove(s, 2);
    expect(!lostRequest.ok && lostRequest.error.code).toBe("UNKNOWN_OUTCOME");
    restoreRequest();
    expect((await must(requestMove(s, 2))).replayed).toBe(true);
    await finishJourney(s);
    expect(movementSummary(s).head.state_sha256).toBe(ref.head.state_sha256);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });

  it("the Logistics commitment and dispatch committed with the reply lost converge the same way, with exactly one movement", async () => {
    const ref = await referenceRun();
    const s = await custodiedCampaign();
    await must(commitMove(s, 1));
    await must(requestMove(s, 2));
    // a Logistics adapter whose store loses the reply to the commitment and to the dispatch
    const lossy = (keys: string[]) =>
      new LogisticsAdapter(
        new Proxy(s.campaign.store, {
          get(target, prop) {
            if (prop === "commit")
              return async (g: CommitGroup) => {
                const r = await target.commit(g);
                return g.writes.some((w) => keys.includes(w.key))
                  ? ({
                      ok: false,
                      error: { code: "UNKNOWN_OUTCOME", message: "lost reply" },
                    } as never)
                  : r;
              };
            const v = Reflect.get(target, prop, target);
            return typeof v === "function" ? v.bind(target) : v;
          },
        }),
      );
    const logistics = lossy([logisticsCommitmentKey(W, PC), logisticsTransferKey(W, PC)]);
    const publication = (n: number) => ({
      group_id: `log-group-${n}`,
      intent_id: `log-intent-${n}`,
      cause: `log-cause-${n}`,
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
    });
    const lostCommit = await logistics.commitMovement({
      ...publication(3),
      commit: { request_key: pcMovementRequestKey(PC), delivery_at: LOG_T_DELIVERY },
    });
    expect(!lostCommit.ok && lostCommit.error.code).toBe("UNKNOWN_OUTCOME");
    expect((await must(logisticsCommit(s, 3))).replayed).toBe(true);
    const lostDispatch = await logistics.dispatch({
      ...publication(4),
      dispatch: { request_key: pcMovementRequestKey(PC) },
    });
    expect(!lostDispatch.ok && lostDispatch.error.code).toBe("UNKNOWN_OUTCOME");
    expect((await must(logisticsDispatch(s, 4))).replayed).toBe(true);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("logistics/"))).toHaveLength(
      2,
    );
    await finishJourney(s);
    expect(movementSummary(s).head.state_sha256).toBe(ref.head.state_sha256);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });

  it("an attempt refused at admission leaves no trace, and the lawful publication under the same identity then commits", async () => {
    const s = await custodiedCampaign();
    const head = s.campaign.store.head();
    expect((await commitMove(s, 1, { locus_id: "locus-nowhere" })).ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    await must(commitMove(s, 1));
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("load fails closed on a corrupted saved movement fact", () => {
  async function saved(upTo: "request" | "complete" = "complete"): Promise<string> {
    const dir = tempDir();
    const s = await custodiedCampaign(dir);
    if (upTo === "complete") await finishJourney(s);
    else {
      await must(commitMove(s, 1));
      await must(requestMove(s, 2));
    }
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
  const tamper = async (edit: (j: any) => void, upTo: "request" | "complete" = "complete") => {
    const dir = await saved(upTo);
    const p = join(dir, stateFile(dir));
    const j = legacyStateFixture(p);
    edit(j);
    writeFileSync(p, JSON.stringify(j));
    return openOutcome(dir);
  };
  const fact = (j: any, key: string) => j.facts.find((f: any) => f.key === key);

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
    expect(await openOutcome(await saved("request"))).toBe("OK");
  });

  it("an edit of the saved commitment-of-record — identity, authority, intent, destination, pins, committer, extras, owner, version, rule — is not silently normalized", async () => {
    const edits: Record<string, (f: any) => void> = {
      "PC identity moved": (f) => (f.value.pc_id = "actor-other"),
      "commitment id moved": (f) => (f.value.commitment_id = "pc-move-commitment:other"),
      "authority downgraded": (f) => (f.value.authored_under.role = "role.archivist"),
      "permission downgraded": (f) =>
        (f.value.authored_under.permission = "permission.canon.write"),
      "intent kind changed": (f) => (f.value.intent.kind = "FORCED_RELOCATION"),
      "destination locus moved": (f) => (f.value.intent.destination.locus.entity_id = "locus-x"),
      "destination key moved": (f) =>
        (f.value.intent.destination.locus.fact_key = `world/${W}/locus/locus-x`),
      "destination moved to the origin": (f) => {
        f.value.intent.destination.locus.entity_id = ORIGIN;
        f.value.intent.destination.locus.fact_key = `world/${W}/locus/${ORIGIN}`;
      },
      "contract pin moved": (f) => (f.value.basis.pinned_versions.pc = 2),
      "binding pin moved": (f) => (f.value.basis.pinned_versions.binding = 2),
      "custody pin moved": (f) => (f.value.basis.pinned_versions.custody = 2),
      "world pin moved": (f) => (f.value.basis.pinned_versions.world = 0),
      "locus pin moved": (f) => (f.value.basis.pinned_versions.locus = 2),
      "committer changed": (f) => (f.value.committer.owner = "logistics"),
      "a route smuggled in": (f) => (f.value.intent.route = ["l1", "l2"]),
      "an arrival smuggled in": (f) => (f.value.arrival = { at: 1 }),
      "owner changed": (f) => (f.owner = "logistics"),
      "facet changed": (f) => (f.facet = "existence_contract"),
      "version changed": (f) => (f.version = 2),
      "rule changed": (f) => (f.provenance.rule.clause = "something else"),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(
        await tamper((j) => edit(fact(j, pcMovementCommitmentKey(PC))), "request"),
        name,
      ).not.toBe("OK");
  });

  it("an edit of the saved PC-owned request — destination, subject, source, id, priority, extras — is not accepted", async () => {
    const edits: Record<string, (f: any) => void> = {
      "destination moved": (f) => {
        f.value.destination.locus.entity_id = "locus-x";
        f.value.destination.locus.fact_key = `world/${W}/locus/locus-x`;
      },
      "subject moved": (f) => (f.value.subject.entity_id = "actor-other"),
      "source owner changed": (f) => (f.value.source.owner = "logistics"),
      "cause moved": (f) => (f.value.source.cause_ref = "synthetic"),
      "request id changed": (f) => (f.value.request_id = "pc-move:other"),
      "priority smuggled in": (f) => (f.value.priority_authority_ref = "p"),
      "a route smuggled in": (f) => (f.value.route = []),
      "owner changed": (f) => (f.owner = "world_state"),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(
        await tamper((j) => edit(fact(j, pcMovementRequestKey(PC))), "request"),
        name,
      ).not.toBe("OK");
  });

  it("removing the commitment while keeping the request fails, as does a request fabricated for a PC that never committed", async () => {
    expect(
      await tamper(
        (j) => (j.facts = j.facts.filter((f: any) => f.key !== pcMovementCommitmentKey(PC))),
        "request",
      ),
    ).not.toBe("OK");
    expect(
      await tamper((j) => {
        const copy = structuredClone(fact(j, pcMovementRequestKey(PC)));
        copy.key = pcMovementRequestKey("actor-other");
        copy.value.subject.entity_id = "actor-other";
        j.facts.push(copy);
      }, "request"),
    ).not.toBe("OK");
  });

  it("an edit of what the movement consumed or produced — the custody, the binding, the transition, the transfer, the delivery — is not accepted", async () => {
    const edits: Record<string, (j: any) => void> = {
      "custody locus moved": (j) =>
        (fact(j, worldPcLocusCustodyKey(PC)).value.stationary_locus.locus.entity_id = "locus-x"),
      "custody removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== worldPcLocusCustodyKey(PC))),
      "binding removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== PLAYER_CHARACTER_BINDING_KEY)),
      "transition destination moved": (j) =>
        (fact(j, worldEntityTransitionKey(W, PC)).value.locus.to.locus.entity_id = "locus-x"),
      "transition entity key moved": (j) =>
        (fact(j, worldEntityTransitionKey(W, PC)).value.entity.fact_key =
          `world/${W}/entity/${PC}`),
      "transition removed while the transfer is retired": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== worldEntityTransitionKey(W, PC))),
      "transfer subject moved to a fallback key": (j) =>
        (fact(j, logisticsTransferKey(W, PC)).value.moved.fact_key = `world/${W}/entity/${PC}`),
      "commitment subject moved to a fallback key": (j) =>
        (fact(j, logisticsCommitmentKey(W, PC)).value.moved.fact_key = `world/${W}/entity/${PC}`),
      "delivery destination moved": (j) =>
        (fact(j, logisticsDeliveryKey(W, PC)).value.outcome.destination.locus.entity_id =
          "locus-x"),
    };
    for (const [name, edit] of Object.entries(edits))
      expect(await tamper(edit), name).not.toBe("OK");
  });

  it("a journal edit of the commitment's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("VOLUNTARY_RELOCATION");
    const edited = text.replace('"custody":1,', '"custody":2,');
    expect(edited).not.toBe(text);
    writeFileSync(journal, edited);
    expect(await openOutcome(dir)).not.toBe("OK");
  });
});
