/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// Initial Locality Bootstrap v0.9 — the integrated, BOOTSTRAP-BEARING witness (T1 MECHANISM ONLY).
//
// IMPLEMENTED COVERAGE (what the code below actually runs, in this order):
//   Stage A  one campaign whose genesis comes from the real bootstrap (intake -> SCOPE -> Grant -> SCENE -> Completion) is driven by the
//            SHIPPED author-character and establish-character-locus commands, then the captured Temporal origin and the OPTION_A_V9
//            closure/workforce projections; the owners are read back, the history strictly replays (audit) and the production admission
//            refuses the journal.
//   Stage B  the same chain through the CHAT ADAPTER: the shipped setting path (a courtyard with scene prose), the real bootstrap on that
//            prefix, the shipped character/location/preparation (mechanism, exact-cycle attestation, Reserve, extraction basis) and finish
//            tools, with the captured chronology replacing the starting-moment stage and the owner-derived projection replacing the
//            declaration stage. The adapter's own readiness reads the owners and reports the route prepared only after the finish stage.
//   Stage C  an ordinary look with an owner-earned access event; a separately authored earlier request carried out by a NEW live
//            continue_pending_goal; the owners' conserved source debit, Reserve credit and time; the v2 operator ledger's dispatch_ref
//            joined to the canonical act; a second look; ANOTHER choice (an ordinary gather) against the real remainder; and a strict
//            audit replay followed by a service reopen.
//   Stage D  falsifiers on that same chain: another authorization, a tool-call-only proof, extra arguments and a revoked grant (D1);
//            expired authority (D2); a stale projected closure once Population holds someone at the locus (D3, isolated by contrast with
//            C); a queued REVISE_PC edit retained through the trusted store and revalidated against the sealed target (D5); a real
//            player edit authored through the ADAPTER while the bootstrap Input is admitted and the freeze is ACTIVE (D6): it is QUEUED
//            with the authentic client/grant/request identity and the original access expiry, writes nothing, waits while the freeze
//            holds, is refused to another authorization, and after the Completion a live continue_queued_setup_edit gives the exact
//            verdict (REJECTED against the sealed setting, idempotent, owners untouched); and an abrupt stop right after a live dispatch
//            (D4): resumption reaches DONE under the SAME dispatch_ref with one canonical act, exact conservation and one v2 collection,
//            and a second restart answers DONE and moves nothing.
//
// NOT COVERED HERE (do not read it into this file): a genuine isolation-capable model, genuine original-message evidence (T2), a named
// client (T3), retained live storage, and an interruption at every step of the chain (one representative point is exercised; D6 releases
// the freeze through the bootstrap service, not through the adapter). Every isolated answer, message proof and referee host is a
// LABELLED FIXTURE or scripted plumbing.
//
// Why a spy: a production campaign can never contain `fixture:` evidence, so the shipped commands' own `CanonicalCampaign.open`
// (production admission) refuses this journal by design. The TEST routes exactly that one call through the testkit fixture admission. No
// production code gained a seam and no production route accepts fixture evidence (the last assertion of stage A re-proves it).
import { chmodSync, cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CanonicalCampaign,
  InitialCompletionProjection,
  fixtureCanonicalAdmission,
  initializeCapturedChronology,
  scanInitialSetup,
} from "@immortalis/engine";
import {
  authorCharacter,
  bindHost,
  establishCharacterLocus,
  pendingTasks,
  readTask,
  secretPath,
  submitDecision,
} from "@immortalis/operator";
import { readFileSync } from "node:fs";
import { worldSceneClosureKey } from "@immortalis/contracts";
import { FIXTURE_LOCUS_ID, FIXTURE_WORLD_ID } from "@immortalis/testkit";
import {
  BOOTSTRAP_CAMPAIGN,
  FIXTURE_POLICY,
  factsOf,
  harness,
  intakeRequest,
  reopenFixtureCampaign,
} from "../support/initial-setup.ts";
import {
  HOST_ID,
  PC_ID,
  STANDARD,
  plainPolicy,
  respondingConsole,
} from "../support/original-pc.ts";
import { locusConsole } from "../support/original-pc-locus.ts";
import { must } from "../support/temporal.ts";

const realOpen = CanonicalCampaign.open.bind(CanonicalCampaign);
const installFixtureOpenSpy = () =>
  vi
    .spyOn(CanonicalCampaign, "open")
    .mockImplementation((dir, options = {}) =>
      realOpen(dir, { ...options, testkitFixtureAdmission: fixtureCanonicalAdmission }),
    );
beforeEach(() => {
  installFixtureOpenSpy();
});
afterEach(() => vi.restoreAllMocks());

/** the scripted referee host of the shipped tests, over THIS campaign's identity (plumbing only: it proves nothing about an AI's reading) */
function startHost(operatorDir: string) {
  const p = {
    stateDir: operatorDir,
    campaignId: BOOTSTRAP_CAMPAIGN,
    operatorUid: process.getuid!(),
  };
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      try {
        for (const t of await pendingTasks(p)) {
          const task = await readTask(p, t.task_id);
          if (!task.ok) continue;
          const answer = plainPolicy(task.value.document);
          if (answer === null) continue;
          const secret = readFileSync(secretPath(p, HOST_ID), "utf8").trim();
          await submitDecision(p, {
            host_id: HOST_ID,
            secret,
            task_id: t.task_id,
            claimed_model: "scripted-test-policy (NOT an AI)",
            answer,
          });
        }
      } catch {
        // the directory may not exist yet
      }
      await new Promise((r) => setTimeout(r, 5));
    }
  })();
  return {
    stop: async () => {
      stopped = true;
      await loop;
    },
  };
}

/** A campaign completed through the real bootstrap, closed, with an owner-only operator directory and a bound scripted host. */
async function bootstrapped() {
  const h = await harness();
  const intake = await h.service.intake(await intakeRequest(h));
  const advanced = await h.service.advance(intake.setup_id!);
  expect(advanced.status).toBe("COMPLETED");
  await h.campaign.close();
  const root = mkdtempSync(join(tmpdir(), "immortalis-witness-"));
  chmodSync(root, 0o700);
  const operatorDir = join(root, "operator-state");
  // the retained-intent directory is owner-only; the shipped establish command makes it so before any host is bound
  mkdirSync(operatorDir, { recursive: true, mode: 0o700 });
  chmodSync(operatorDir, 0o700);
  // the shipped commands verify the local operator owns the campaign directory under an owner-only parent: move the package there
  const campaignDir = join(root, "campaign");
  cpSync(h.dir, campaignDir, { recursive: true });
  chmodSync(campaignDir, 0o700);
  return { h, campaignDir, operatorDir };
}

describe("bootstrap-bearing witness, stage A: Completion → native/physical PC placement → captured time → OPTION_A_V9 projection", () => {
  it("the shipped author-character and establish-character-locus run over a journal that the bootstrap produced", async () => {
    const { campaignDir, operatorDir } = await bootstrapped();
    const bound = await bindHost({
      stateDir: operatorDir,
      campaignId: BOOTSTRAP_CAMPAIGN,
      operatorUid: process.getuid!(),
      hostId: HOST_ID,
      operations: [
        "I002_CLASSIFY",
        "IR_NATIVE_COMPATIBILITY",
        "IR_PHYSICAL_PLACEMENT",
        "F014D_DIRECT_PERCEPTION",
      ],
    });
    if (!bound.ok) throw new Error(`host not bound: ${bound.error.code}`);
    const host = startHost(operatorDir);
    try {
      const terminal = respondingConsole(STANDARD);
      const authored = await authorCharacter({
        campaignDir,
        campaignId: BOOTSTRAP_CAMPAIGN,
        worldId: FIXTURE_WORLD_ID,
        locusId: FIXTURE_LOCUS_ID,
        pcId: PC_ID,
        operatorDir,
        terminal,
        refereePolls: 400,
        refereePollMs: 10,
      });
      expect(authored.status, JSON.stringify(authored.details) + terminal.said.join("\n")).toBe(
        "CHARACTER_BOUND",
      );
      const placing = locusConsole();
      const placed = await establishCharacterLocus({
        campaignDir,
        campaignId: BOOTSTRAP_CAMPAIGN,
        pcId: PC_ID,
        operatorDir,
        terminal: placing,
        refereePolls: 400,
        refereePollMs: 10,
      });
      expect(placed.status, JSON.stringify(placed.details) + placing.said.join("\n")).toBe(
        "LOCUS_ESTABLISHED",
      );
    } finally {
      await host.stop();
    }

    // the captured Temporal origin (the only way time starts in a bootstrap-bearing prefix) and the owner-derived projection
    const campaign = await must(reopenFixtureCampaign(campaignDir));
    await must(initializeCapturedChronology(campaign.store, { policy: FIXTURE_POLICY }));
    const projection = new InitialCompletionProjection(campaign.store);
    await must(projection.projectSceneClosure());
    await must(projection.projectWorkforceScope());
    expect(campaign.verify()).toEqual([]);
    expect(scanInitialSetup(factsOf(campaign.store)).completion).toBeDefined();

    // what the owners actually hold: the PC's qualified physical custody at the locality the bootstrap built, the captured time, and the
    // owner-derived closure/workforce records - none supplied by this test
    const facts = factsOf(campaign.store);
    const custody = facts.get(`world-state/pc/${PC_ID}/locus-custody`);
    expect(custody).toBeDefined();
    expect(JSON.stringify(custody!.value)).toContain(FIXTURE_LOCUS_ID);
    const time = facts.get("temporal/state")!;
    const doc = (scanInitialSetup(facts).completion!.value as any).selection.coverage.start;
    expect((time.value as any).canonical_time).toEqual(doc);
    expect(facts.has(worldSceneClosureKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))).toBe(true);
    const head = campaign.store.head();
    await campaign.close();

    // close, reopen and strictly replay the whole history (each group judged against its own incremental pre-state)
    const strict = await must(CanonicalCampaign.open(campaignDir, { audit: true }));
    expect(strict.store.head().state_sha256).toBe(head.state_sha256);
    expect(strict.verify()).toEqual([]);
    await strict.close();

    // and NO production route accepts this journal: the same package under the production admission is refused (reserved fixture: evidence)
    vi.restoreAllMocks();
    const production = await realOpen(campaignDir);
    expect(production.ok).toBe(false);
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Stage B: the integrated chain through the ADAPTER (building).
// ---------------------------------------------------------------------------------------------------------------------------------
import { delegatingScene, delegatingScope, FIXTURE_DELEGATION_QUOTE } from "@immortalis/testkit";
import {
  ACTUATOR,
  CYCLE,
  MOMENT,
  TAU,
  TRAVERSAL,
  UNIT,
  offer,
  place,
  preparation,
  resumed,
  routePolicy,
  stage,
  started,
  type Slot,
} from "../support/chat-route.ts";
import { LOCUS, WORLD, courtyard } from "../support/chat-setting.ts";
import { draft } from "../support/chat-character.ts";
import { PC_WORDS, redScene } from "../support/observation.ts";
import { bindScene, perceptionPolicy, scenePolicy, startScene } from "../support/scene.ts";
import { PopulationAdapter } from "@immortalis/engine";
import { popPublication } from "@immortalis/testkit";
import { Chat as ChatClient, PLAYER } from "../support/chat-client.ts";
import { acceptPendingRequest } from "../../apps/phone/src/delayed-continuation.ts";
import { readScenario } from "../../apps/phone/src/scenario.ts";
import { FixtureOriginalMessageVerifier } from "@immortalis/testkit";
import { ledgerFileName } from "@immortalis/operator";
import { join as pathJoin } from "node:path";
import type { Chat } from "../support/chat-client.ts";
import { cloneSlot } from "../support/chat-route.ts";
import { readFileSync as readFile, readdirSync, writeFileSync } from "node:fs";

const CHRONOLOGY = {
  format: "immortalis-starting-chronology",
  format_version: 1,
  time: { unit: UNIT, value: MOMENT.value },
  statement: MOMENT.statement,
} as const;

/** a quiescent campaign opened (through the test-only fixture-admission spy) for one engine-level step, then closed */
async function withCampaign<T>(dir: string, fn: (c: CanonicalCampaign) => Promise<T>): Promise<T> {
  const c = await must(CanonicalCampaign.open(dir));
  try {
    return await fn(c);
  } finally {
    await c.close();
  }
}

let ready: Slot;
const base = routePolicy();
const policy = perceptionPolicy(base);

/**
 * A QUIESCENT slot at READY whose genesis, moment and closure are the BOOTSTRAP's: the shipped setting path (courtyard with scene prose),
 * the real bootstrap on that prefix, the shipped character/location/preparation/finish tools, the captured Temporal origin in place of
 * the starting-moment stage and the owner-derived OPTION_A_V9 projection in place of the declaration stage. The scene host is bound.
 */
async function bootstrapReady(): Promise<Slot> {
  const r = await started({ mutateSetting: redScene(), policy, upTo: "SETTING" });
  await r.stop();
  const s = r.s;
  await bindScene(s.operatorDir);
  const campaign = await must(reopenFixtureCampaign(s.campaignDir));
  const h = await harness({
    campaignId: s.config.campaignId,
    open: { campaign, dir: s.campaignDir },
    answers: {
      scope: delegatingScope(),
      scene: delegatingScene({
        designation: "The stone alcove",
        topology: "a four-pace stone room",
      }),
    },
  });
  const message = `Make a stone alcove where collection is possible. ${FIXTURE_DELEGATION_QUOTE}`;
  const intake = await h.service.intake(await intakeRequest(h, { message, doc: CHRONOLOGY }));
  expect(intake.status).toBe("ADMITTED");
  expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
  await h.campaign.close();

  const route = await resumed(s, { policy });
  try {
    const kept = await offer(
      route.chat,
      draft({ embodiment: `${PC_WORDS.embodiment}; ${ACTUATOR}; ${CYCLE}; ${TRAVERSAL}` }),
    );
    expect(kept.finished.data?.result?.status).toBe("CHARACTER_RELEASED_UNBOUND");
    const placed = await place(route.chat, PC_WORDS.presence);
    expect(placed.finished.data?.result?.status).toBe("CHARACTER_BOUND");
    const located = await stage(route.chat, "establish_character_location");
    expect(located.finished.isError, JSON.stringify(located.finished.data)).toBe(false);
  } finally {
    await route.stop();
  }
  // the captured Temporal origin is the ONLY way time starts here: the starting-moment stage is replaced by the bootstrap's capture
  await withCampaign(s.campaignDir, async (c) => {
    await must(initializeCapturedChronology(c.store, { policy: FIXTURE_POLICY }));
  });
  const prep = await resumed(s, { policy });
  try {
    const prepared = await stage(prep.chat, "propose_collection_preparation", preparation(CYCLE));
    expect(prepared.finished.isError, JSON.stringify(prepared.finished.data)).toBe(false);
    expect(prepared.finished.data?.exit_code).toBe(0);
  } finally {
    await prep.stop();
  }
  // the declaration stage is replaced by the owner-derived OPTION_A_V9 projection of the Completion (derived coverage, never supplied)
  await withCampaign(s.campaignDir, async (c) => {
    const projection = new InitialCompletionProjection(c.store);
    await must(projection.projectSceneClosure());
    await must(projection.projectWorkforceScope());
  });
  const fin = await resumed(s, { policy });
  try {
    const before = (await fin.chat.call("collection_setup_status")).data.route;
    expect(before.readiness.prepared_to_request_collection, JSON.stringify(before)).toBe(false);
    const done = await stage(fin.chat, "finish_collection_setup", {});
    expect(done.finished.isError, JSON.stringify(done.finished.data)).toBe(false);
    const after = (await fin.chat.call("collection_setup_status")).data.route;
    expect(after.readiness.prepared_to_request_collection, JSON.stringify(after)).toBe(true);
  } finally {
    await fin.stop();
  }
  return s;
}

beforeAll(async () => {
  installFixtureOpenSpy();
  ready = await bootstrapReady();
}, 300_000);

describe("bootstrap-bearing witness, stage B: through the chat adapter", () => {
  it("B1: the READY slot rests on a journal the bootstrap produced, and no production admission opens it", async () => {
    const facts = await withCampaign(ready.campaignDir, async (c) => factsOf(c.store));
    const index = scanInitialSetup(facts);
    expect(index.completion).toBeDefined();
    expect(facts.has(worldSceneClosureKey(WORLD, LOCUS))).toBe(true);
    const time = (facts.get("temporal/state")!.value as any).canonical_time;
    expect(time).toEqual({ unit: UNIT, value: MOMENT.value });
    vi.restoreAllMocks();
    expect((await realOpen(ready.campaignDir)).ok).toBe(false);
  });
});

// -- helpers of the play chain (the owners' own records, read afresh and independently of the adapter and of the code under test) ----------
const GATHERED_LOOK = "at the pale material I have just gathered";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const verifier = new FixtureOriginalMessageVerifier(
  "I'd like to gather two stones from the pile when we are ready.",
);
const readOwners = (s: Slot) =>
  withCampaign(s.campaignDir, async (c) => {
    const facts = c.store.listFacts();
    const sourceKey = `world/${WORLD}/source/src-loose-stones`;
    return {
      source: (c.store.getFact(sourceKey)!.value as any).recoverable.amount as number,
      reserve: (facts.find((f) => f.key.startsWith("production/reserve/"))!.value as any).quantity
        .amount as number,
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value as number,
      commitments: facts.filter(
        (f) => f.key.includes("/collection/") && f.key.endsWith("/commitment"),
      ),
      viewing: facts.filter((f) => /^world-state\/pc\/[^/]+\/current-viewing\//.test(f.key)),
      events: facts.filter((f) => /^access\/[^/]+\/event$/.test(f.key)),
      verify: c.verify(),
      keys: facts.map((f) => f.key),
    };
  });
const v2Ledger = (s: Slot): any => {
  try {
    return JSON.parse(
      readFile(pathJoin(s.operatorDir, ledgerFileName(s.config.campaignId)), "utf8"),
    );
  } catch {
    return null;
  }
};
const expiryOf = (chat: Chat): number =>
  JSON.parse(Buffer.from(chat.access.split(".")[0]!, "base64url").toString()).exp;
async function untilStatus(chat: Chat, ok: (status: any) => boolean, rounds = 240) {
  let last: any;
  for (let i = 0; i < rounds; i++) {
    last = (await chat.call("play_status")).data;
    if (last && ok(last)) return last;
    await sleep(250);
  }
  throw new Error(`the goal did not reach the expected state: ${JSON.stringify(last)}`);
}
const finished = (st: any) =>
  st.goal !== null && ["DONE", "RETURNED", "INTERRUPTED"].includes(st.goal.outcome);

/** a v2-workflow clone of the READY slot, with the scripted hosts and the scene host running, linked to one player client */
async function playSlot() {
  const s = await cloneSlot(ready, { ledgerVersion: 2 });
  const sc = readScenario(s.config.scenarioFile)!;
  const key = `world/${sc.world}/source/${sc.source}`;
  const f = await withCampaign(s.campaignDir, async (c) => c.store.getFact(key)!);
  const facts = {
    scenario: sc,
    source: { fact_key: key, version: f.version },
    locus: (f.value as any).locality.locus.entity_id as string,
  };
  const r = await resumed(s, {
    policy,
    deps: { delayed: { policy: { syntheticEvidence: "REQUIRE" } } },
  });
  const gm = startScene(s.operatorDir, scenePolicy());
  await r.chat.init({});
  return { s, r, gm, facts };
}

/** the trusted intake of the player's EARLIER original request, for the client/grant that is linked right now */
async function intakeEarlier(
  r: Awaited<ReturnType<typeof resumed>>,
  facts: Awaited<ReturnType<typeof playSlot>>["facts"],
  over: { id?: string; amount?: number; verifierOverride?: any; expiresAtMs?: number } = {},
) {
  const entry = r.app
    .oauthLedger!.list()!
    .find((e) => e.client === r.chat.clientId && e.state === "ISSUED")!;
  const got = await acceptPendingRequest(
    r.app.delayed!,
    over.verifierOverride ?? (verifier as any),
    {
      request_id: over.id ?? "request-1",
      client: entry.client,
      oauth_grant: entry.grant,
      interpretation: {
        kind: "SUPPORTED_SITE_COLLECTION",
        evidence_quotes: ["gather two stones"],
        method: "GM_INTENT_V1",
      },
      scope: {
        pc_id: facts.scenario.player_character,
        world_id: facts.scenario.world,
        locus_id: facts.locus,
        source: facts.source,
        amount: over.amount ?? 2,
        until: "complete",
        risk_class: "ROUTINE_UNOPPOSED_SITE_COLLECTION",
      },
      baseline: [facts.source],
      access_expires_at_ms: over.expiresAtMs ?? expiryOf(r.chat),
    },
  );
  if (!got.ok) throw new Error(JSON.stringify(got.error));
  return got.value;
}

describe("bootstrap-bearing witness, stage C: look, separately authorized collection, conservation, replay, another choice", () => {
  it("C1: an ordinary look earns an Epistemic event; a NEW live continue_pending_goal carries out the earlier request; owners conserve; strict replay; another choice meets the remainder", async () => {
    const { s, r, gm, facts } = await playSlot();
    try {
      const start = await readOwners(s);
      expect(start.commitments).toHaveLength(0);
      expect(start.viewing).toHaveLength(0);
      expect(start.events).toHaveLength(0);

      // the ordinary look: the GM rules it, the custodian publishes it, the referee perceives it; an access event is EARNED, nothing is supplied
      const look = await stage(r.chat, "observe_surroundings", {});
      expect(look.finished.isError, JSON.stringify(look.finished.data)).toBe(false);
      expect(look.finished.data?.exit_code, JSON.stringify(look.finished.data)).toBe(0);
      const looked = await readOwners(s);
      expect(looked.viewing).toHaveLength(1);
      expect(looked.events).toHaveLength(1);
      expect(looked.time).toBe(start.time); // a look passes no time
      expect(looked.verify).toEqual([]);
      const glance = await r.chat.call("read_current_observation_glance");
      expect(glance.isError, glance.text).toBe(false);

      // the continue tools exist only for this version-2 workflow; with no pending request nothing starts
      const tools = (await r.chat.rpc("tools/list")).json.result.tools.map((t: any) => t.name);
      expect(tools).toContain("continue_pending_goal");
      expect(tools).toContain("continue_queued_setup_edit");
      const none = await r.chat.call("continue_pending_goal", { request_id: "request-none" });
      expect(none.isError).toBe(true);
      expect(await readOwners(s)).toMatchObject({ source: looked.source, reserve: looked.reserve });

      // the player's EARLIER original request is accepted by the trusted intake; reads and stored identity alone never dispatch
      const accepted = await intakeEarlier(r, facts);
      expect(accepted.disclosure).toContain("does not put the log in your hands");
      await r.chat.call("play_status");
      await r.chat.call("collection_setup_status");
      expect((await readOwners(s)).commitments).toHaveLength(0);

      // the NEW live request: separately authored, not the setup message
      const started = await r.chat.call("continue_pending_goal", { request_id: "request-1" });
      expect(started.isError, JSON.stringify(started)).toBe(false);
      expect(started.data).toMatchObject({ status: "DISPATCHED" });
      const done = await untilStatus(r.chat, finished);
      expect(done.goal).toMatchObject({ amount: 2, until: "complete", outcome: "DONE" });

      // the owners' conserved consequence, independently read: source debit, Reserve credit, time at the exact-cycle boundary
      const after = await readOwners(s);
      expect([after.source, after.reserve, after.time]).toEqual([
        looked.source - 2,
        looked.reserve + 2,
        MOMENT.value + 2 * TAU,
      ]);
      expect(after.commitments).toHaveLength(1);
      expect(after.verify).toEqual([]);

      // the operator ledger is version 2 and holds exactly ONE collection under the grant's dispatch_ref, joined to the canonical act
      const ledger = v2Ledger(s);
      expect(ledger.format_version).toBe(2);
      const collections = ledger.intents.filter((i: any) => i.kind === "COLLECTION");
      expect(collections).toHaveLength(1);
      const rec = ((await r.app.delayed!.grants.get("request-1")) as any).value;
      expect(rec.grant.dispatch_ref).toMatch(/^dispatch-/);
      expect(collections[0].dispatch_ref).toBe(rec.grant.dispatch_ref);
      expect(collections[0].status).toBe("COMMITTED");
      expect(after.commitments[0]!.key).toContain(collections[0].choice.act_id);

      // the next live continuation reads the link back and consumes the grant with the REAL act id, and starts nothing
      const settled = await r.chat.call("continue_pending_goal", { request_id: "request-1" });
      expect(settled.data).toMatchObject({ status: "DONE", act_id: collections[0].choice.act_id });
      expect(((await r.app.delayed!.grants.get("request-1")) as any).value.grant.state).toBe(
        "CONSUMED",
      );
      expect(await readOwners(s)).toMatchObject({ source: after.source, reserve: after.reserve });
      // the old authority cannot be used again
      expect(
        (await r.chat.call("continue_pending_goal", { request_id: "request-1" })).data.status,
      ).toBe("DONE");
      expect((await readOwners(s)).commitments).toHaveLength(1);

      // the look AFTER the collection is a new circumstance with its own earned event
      const again = await stage(r.chat, "observe_surroundings", { attention: GATHERED_LOOK });
      expect(again.finished.isError, JSON.stringify(again.finished.data)).toBe(false);
      const relooked = await readOwners(s);
      expect(relooked.viewing).toHaveLength(2);
      expect(relooked.events).toHaveLength(2);
      expect(relooked.time).toBe(after.time);

      // ANOTHER meaningful choice meets the REAL remainder (an ordinary direct gather, with no dispatch_ref)
      const next = await r.chat.call("gather", { amount: 1, until: "complete" });
      expect(next.isError).toBe(false);
      await untilStatus(r.chat, (st) => finished(st) && st.goal.amount === 1);
      const later = await readOwners(s);
      expect([later.source, later.reserve]).toEqual([after.source - 1, after.reserve + 1]);
      expect(later.time).toBe(after.time + TAU);
      const ledger2 = v2Ledger(s).intents.filter((i: any) => i.kind === "COLLECTION");
      expect(ledger2.map((i: any) => i.dispatch_ref === null)).toEqual([false, true]);
    } finally {
      await gm.stop();
      await r.stop();
    }

    // close/reopen: strict replay of EVERY prefix (each group judged against its own incremental pre-state) and the retained records agree
    const strict = await must(CanonicalCampaign.open(s.campaignDir, { audit: true }));
    expect(strict.verify()).toEqual([]);
    expect(scanInitialSetup(factsOf(strict.store)).completion).toBeDefined();
    await strict.close();
    const reopened = await resumed(s, {
      policy,
      deps: { delayed: { policy: { syntheticEvidence: "REQUIRE" } } },
    });
    try {
      await reopened.chat.init({});
      const finalState = await readOwners(s);
      expect(finalState.commitments).toHaveLength(2);
      expect(((await reopened.app.delayed!.grants.get("request-1")) as any).value.grant.state).toBe(
        "CONSUMED",
      );
      expect(readdirSync(pathJoin(s.operatorDir, "delayed-action", "pending")).length).toBe(1);
    } finally {
      await reopened.stop();
    }
  }, 300_000);
});

describe("bootstrap-bearing witness, stage D: falsifiers on the same chain", () => {
  it("D1 authority and provenance: another authorization, a tool-call-only proof, extra arguments and a revoked grant start nothing", async () => {
    const { s, r, gm, facts } = await playSlot();
    try {
      const before = await readOwners(s);
      await intakeEarlier(r, facts);
      for (const args of [
        {},
        { request_id: "request-1", amount: 99 },
        { request_id: "" },
      ] as any[]) {
        const out = await r.chat.call("continue_pending_goal", args);
        expect([JSON.stringify(args), out.isError]).toEqual([JSON.stringify(args), true]);
      }
      // a second, separately consented authorization (same lane secret, another grant) is a DIFFERENT authorization
      const other = new ChatClient(s.base);
      expect((await other.link("player", { player: PLAYER })).ok).toBe(true);
      await other.init({});
      const refused = await other.call("continue_pending_goal", { request_id: "request-1" });
      expect(refused.isError).toBe(true);
      expect(JSON.stringify(refused)).toContain("no such pending request for this authorization");
      // a tool-call-only proof is retained but can never support a live intent claim
      await intakeEarlier(r, facts, {
        id: "request-2",
        verifierOverride: new FixtureOriginalMessageVerifier("take the stones", "TOOL_CALL_ONLY"),
      });
      const toolOnly = await r.chat.call("continue_pending_goal", { request_id: "request-2" });
      expect(toolOnly.data).toMatchObject({ status: "PAUSED", reason: "AUTHORITY_UNRESOLVED" });
      // revoking this client's grant ends the tool, and writes nothing to canon
      const mine = r.app
        .oauthLedger!.list()!
        .find((e) => e.client === r.chat.clientId && e.state === "ISSUED")!;
      expect(r.app.oauthLedger!.revoke(mine.client, mine.grant, "OPERATOR")).toBe("REVOKED");
      expect((await r.chat.rpc("tools/list")).status).toBe(401);
      expect(await readOwners(s)).toMatchObject({
        source: before.source,
        reserve: before.reserve,
        time: before.time,
      });
      expect(v2Ledger(s)?.intents ?? []).toEqual([]);
    } finally {
      await gm.stop();
      await r.stop();
    }
  }, 300_000);

  it("D2 expiry: authority that has expired by the time of the live request starts nothing and moves no owner", async () => {
    const { s, r, gm, facts } = await playSlot();
    try {
      const before = await readOwners(s);
      await intakeEarlier(r, facts, { expiresAtMs: Date.now() + 1_500 });
      await sleep(2_200);
      const late = await r.chat.call("continue_pending_goal", { request_id: "request-1" });
      expect(JSON.stringify(late)).toMatch(/expired|EXPIRED|no longer|ended/i);
      const after = await readOwners(s);
      expect([after.source, after.reserve, after.time, after.commitments.length]).toEqual([
        before.source,
        before.reserve,
        before.time,
        0,
      ]);
      expect(v2Ledger(s)?.intents ?? []).toEqual([]);
    } finally {
      await gm.stop();
      await r.stop();
    }
  }, 300_000);

  it("D3 OPTION_A_V9 currency: once Population holds someone at the locus the projected closure is STALE, the route is no longer prepared, and the same gather that completes in C1 moves no conserved quantity", async () => {
    const s = await cloneSlot(ready);
    await withCampaign(s.campaignDir, async (c) => {
      await must(
        new PopulationAdapter(c.store).establishLedger({
          ...popPublication(1),
          ledger: {
            ledger_id: "ledger-courtyard",
            unit_class: "synthetic-unit-class",
            world_id: WORLD,
            locus_id: LOCUS,
            units: [
              {
                unit_id: "unit-mason",
                residence: "place-village",
                presence: "place-village",
                burden_allocation: null,
              },
            ],
            point: { unit: UNIT, value: MOMENT.value },
          },
        } as any),
      );
    });
    const before = await readOwners(s);
    const r = await resumed(s, { policy });
    const gm = startScene(s.operatorDir, scenePolicy());
    try {
      await r.chat.init({});
      // the adapter reads the owners and says so: the closure the bootstrap projected is stale and the route is not prepared
      const status = (await r.chat.call("collection_setup_status")).data.route;
      expect(status.readiness.prepared_to_request_collection).toBe(false);
      expect(status.stages.find((x: any) => x.stage === "closed_setting")).toMatchObject({
        state: "STALE",
      });
      // the contrast with C1 (the identical gather completes there) isolates the cause: the work is not admitted and nothing is conserved
      const ask = await r.chat.call("gather", { amount: 1, until: "complete" });
      await sleep(1_500);
      const play = (await r.chat.call("play_status")).data;
      const after = await readOwners(s);
      expect([after.source, after.reserve, after.time]).toEqual([
        before.source,
        before.reserve,
        before.time,
      ]);
      expect(play.goal.outcome).not.toBe("DONE");
      expect(JSON.stringify([ask.data, play])).toContain("ADMISSION_UNSETTLED");
      expect(after.verify).toEqual([]);
    } finally {
      await gm.stop();
      await r.stop();
    }
  }, 300_000);

  it("D5 queued-edit revalidation: an edit retained during the freeze is re-checked against the sealed target after the Completion and is REJECTED, changing nothing", async () => {
    const { s, r, gm, facts } = await playSlot();
    try {
      const before = await readOwners(s);
      const heldBefore = await withCampaign(s.campaignDir, async (c) =>
        c.store
          .listFacts()
          .filter((f) => f.key.includes(facts.scenario.player_character))
          .map((f) => `${f.key}@${f.version}`)
          .sort(),
      );
      const entry = r.app
        .oauthLedger!.list()!
        .find((e) => e.client === r.chat.clientId && e.state === "ISSUED")!;
      // the trusted store retains what a player authored DURING the freeze (the adapter does exactly this when the freeze is active)
      const queued = await r.app.delayed!.queue.enqueue({
        client: entry.client,
        oauth_grant: entry.grant,
        original_request_ref: "request-queued-1",
        command: "REVISE_PC",
        payload: {
          edits: [
            { op: "set", field: "embodiment", text: "One ordinary human body with six arms" },
          ],
        },
        retained_workflow_ref: facts.scenario.player_character,
        retained_revision: 0,
        access_expires_at_ms: expiryOf(r.chat),
      });
      expect(queued.ok, JSON.stringify(queued)).toBe(true);
      const id = (queued as any).value.queue_id as string;
      // the freeze is long released (the Completion stands): a NEW live request revalidates the retained target, never the stored words
      const out = await r.chat.call("continue_queued_setup_edit", { queue_id: id });
      expect(JSON.stringify(out)).toMatch(/REJECTED|rejected/);
      const again = await r.chat.call("continue_queued_setup_edit", { queue_id: id });
      expect(JSON.stringify(again)).toMatch(/REJECTED|rejected/); // terminal and idempotent
      const after = await readOwners(s);
      expect([after.source, after.reserve, after.time, after.commitments.length]).toEqual([
        before.source,
        before.reserve,
        before.time,
        0,
      ]);
      const heldAfter = await withCampaign(s.campaignDir, async (c) =>
        c.store
          .listFacts()
          .filter((f) => f.key.includes(facts.scenario.player_character))
          .map((f) => `${f.key}@${f.version}`)
          .sort(),
      );
      expect(heldAfter).toEqual(heldBefore); // the character the owners hold is untouched
    } finally {
      await gm.stop();
      await r.stop();
    }
  }, 300_000);

  it("D6 queued edit DURING an active freeze (Q-1): a real player edit through the adapter is retained with its authentic request identity and writes nothing; after the Completion a live continue_queued_setup_edit gives the exact verdict", async () => {
    // a slot whose Input is ADMITTED but not advanced: the freeze is active. The operator's own scenario file (seven identities, no player
    // text) is provisioned in advance, as a deployment configures it; the player character it names does not exist yet.
    const first = await started({ mutateSetting: redScene(), policy, upTo: "SETTING" });
    await first.stop();
    const s = await cloneSlot(first.s, { ledgerVersion: 2 });
    const provisioned = readFile(ready.config.scenarioFile, "utf8");
    writeFileSync(s.config.scenarioFile, provisioned, { mode: 0o600 });
    const campaign = await must(reopenFixtureCampaign(s.campaignDir));
    const answers = {
      scope: delegatingScope(),
      scene: delegatingScene({
        designation: "The stone alcove",
        topology: "a four-pace stone room",
      }),
    };
    const h = await harness({
      campaignId: s.config.campaignId,
      open: { campaign, dir: s.campaignDir },
      answers,
    });
    const message = `Make a stone alcove where collection is possible. ${FIXTURE_DELEGATION_QUOTE}`;
    const intake = await h.service.intake(await intakeRequest(h, { message, doc: CHRONOLOGY }));
    expect(intake.status).toBe("ADMITTED");
    await h.campaign.close(); // nothing advanced: the Input stands alone and the freeze is active

    const snapshot = () =>
      withCampaign(s.campaignDir, async (c) =>
        c.store
          .listFacts()
          .map((f) => `${f.key}@${f.version}`)
          .sort(),
      );
    const heldBefore = await snapshot();
    const r = await resumed(s, {
      policy,
      deps: { delayed: { policy: { syntheticEvidence: "REQUIRE" } } },
    });
    try {
      await r.chat.init({});
      // the player's own revised setting, authored while the setup is running (a different premise: a real edit, not a repeat)
      const revised = courtyard();
      redScene()(revised);
      revised.world.premise =
        "A small invented walled courtyard, revised while the setup was still running.";
      const waiting = await r.chat.call("propose_original_setting", revised);
      expect(waiting.isError, JSON.stringify(waiting)).toBe(false);
      expect(waiting.data).toMatchObject({ status: "QUEUED" });
      const id = waiting.data.queue_id as string;
      // nothing was written and nothing was started: the owners hold exactly what they held, and no setting run exists
      expect(await snapshot()).toEqual(heldBefore);
      const record = ((await r.app.delayed!.queue.get(id)) as any).value;
      const mine = r.app
        .oauthLedger!.list()!
        .find((e) => e.client === r.chat.clientId && e.state === "ISSUED")!;
      expect(record).toMatchObject({
        phase: "QUEUED",
        command: "REVISE_SETUP",
        client: mine.client,
        oauth_grant: mine.grant,
        retained_workflow_ref: s.config.campaignId,
      });
      expect(typeof record.original_request_ref).toBe("string");
      expect(record.original_request_ref.length).toBeGreaterThan(0);
      expect(record.payload.world.premise).toBe(revised.world.premise);
      expect(record.expires_at_ms).toBe(expiryOf(r.chat)); // the ORIGINAL access expiry; nothing is refreshed

      // while the freeze holds, a live continuation waits and applies nothing
      const stillFrozen = await r.chat.call("continue_queued_setup_edit", { queue_id: id });
      expect(stillFrozen.data).toMatchObject({ status: "QUEUED" });
      expect(await snapshot()).toEqual(heldBefore);

      // another authorization cannot use this queued edit
      const other = new ChatClient(s.base);
      expect((await other.link("player", { player: PLAYER })).ok).toBe(true);
      await other.init({});
      const foreign = await other.call("continue_queued_setup_edit", { queue_id: id });
      expect(foreign.isError).toBe(true);
      expect(JSON.stringify(foreign)).toContain("no such queued edit for this authorization");

      // the freeze is released by the bootstrap's own Completion (the SAME runner key and outbox: a restart, not a new runner)
      const campaign2 = await must(reopenFixtureCampaign(s.campaignDir));
      const resumedBootstrap = await harness({
        campaignId: s.config.campaignId,
        open: { campaign: campaign2, dir: s.campaignDir },
        answers,
        keys: h.keys,
        macKey: h.macKey,
        outboxDir: h.outboxDir,
      });
      expect((await resumedBootstrap.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
      await resumedBootstrap.campaign.close();
      const settingBefore = await withCampaign(s.campaignDir, async (c) =>
        c.store
          .listFacts()
          .filter((f) => /^world\/[^/]+\/(profile|locus|source)/.test(f.key))
          .map((f) => `${f.key}@${f.version}`)
          .sort(),
      );

      // the NEW live request revalidates the retained target against the sealed setting: lawfully REJECTED, never substituted or applied
      const verdict = await r.chat.call("continue_queued_setup_edit", { queue_id: id });
      expect(verdict.data).toMatchObject({ status: "REJECTED", queue_id: id });
      expect(String(verdict.data.reason)).toContain("no longer an unsealed draft");
      const again = await r.chat.call("continue_queued_setup_edit", { queue_id: id });
      expect(again.data).toMatchObject({ status: "REJECTED" }); // terminal and idempotent
      expect(((await r.app.delayed!.queue.get(id)) as any).value.phase).toBe("REJECTED");
      // the setting the owners hold is exactly the one the bootstrap sealed: the edit never reached an owner
      const settingAfter = await withCampaign(s.campaignDir, async (c) => ({
        facts: c.store
          .listFacts()
          .filter((f) => /^world\/[^/]+\/(profile|locus|source)/.test(f.key))
          .map((f) => `${f.key}@${f.version}`)
          .sort(),
        premise: (c.store.getFact(`world/${WORLD}/profile`)!.value as any).premise,
        verify: c.verify(),
      }));
      expect(settingAfter.facts).toEqual(settingBefore);
      expect(settingAfter.premise).not.toBe(revised.world.premise);
      expect(settingAfter.verify).toEqual([]);
    } finally {
      await r.stop();
    }
  }, 300_000);

  it("D4 interruption (R-1): the front end stops right after a live dispatch; resumption reaches the ONE rightful committed outcome under the SAME dispatch_ref, and repeat resumption never dispatches twice", async () => {
    const { s, r, gm, facts } = await playSlot();
    const before = await readOwners(s);
    await intakeEarlier(r, facts);
    const started = await r.chat.call("continue_pending_goal", { request_id: "request-1" });
    expect(started.isError).toBe(false);
    expect(started.data).toMatchObject({ status: "DISPATCHED" });
    const dispatchRef = ((await r.app.delayed!.grants.get("request-1")) as any).value.grant
      .dispatch_ref as string;
    expect(dispatchRef).toMatch(/^dispatch-/);
    await gm.stop();
    await r.stop(); // abrupt end of the front end mid-goal

    const resumeOnce = async () => {
      const again = await resumed(s, {
        policy,
        deps: { delayed: { policy: { syntheticEvidence: "REQUIRE" } } },
      });
      const scene = startScene(s.operatorDir, scenePolicy());
      try {
        await again.chat.init({});
        const seen: string[] = [];
        let last: any;
        for (let i = 0; i < 80; i++) {
          last = (await again.chat.call("continue_pending_goal", { request_id: "request-1" })).data;
          seen.push(String(last?.status));
          if (last?.status === "DONE" || last?.status === "PAUSED") break;
          await sleep(500);
        }
        return {
          last,
          seen,
          grant: ((await again.app.delayed!.grants.get("request-1")) as any).value,
        };
      } finally {
        await scene.stop();
        await again.stop();
      }
    };

    const first = await resumeOnce();
    // the resumed status is asserted: the request was NOT lost - it reached its one committed canonical act (a parked/unknown disposition
    // would be an acceptable alternative only if durable and truthful, but this representative interruption point recovers fully)
    expect(first.last, first.seen.join(">")).toMatchObject({ status: "DONE" });
    expect(first.last.act_id).toMatch(/^operator-act-/);
    expect(first.grant.grant.dispatch_ref).toBe(dispatchRef); // the same authority, never a second dispatch
    expect(first.grant.grant).toMatchObject({ state: "CONSUMED", act_id: first.last.act_id });

    const after = await readOwners(s);
    expect([after.source, after.reserve, after.time]).toEqual([
      before.source - 2,
      before.reserve + 2,
      MOMENT.value + 2 * TAU,
    ]);
    expect(after.commitments).toHaveLength(1);
    expect(after.commitments[0]!.key).toContain(first.last.act_id);
    expect(after.verify).toEqual([]);
    const collections = v2Ledger(s).intents.filter((i: any) => i.kind === "COLLECTION");
    expect(collections).toHaveLength(1);
    expect(collections[0]).toMatchObject({
      dispatch_ref: dispatchRef,
      status: "COMMITTED",
    });
    expect(collections[0].choice.act_id).toBe(first.last.act_id);

    // repeat resumption (another restart, another ask): the same DONE answer, and the owners and the ledger do not move
    const second = await resumeOnce();
    expect(second.last).toMatchObject({ status: "DONE", act_id: first.last.act_id });
    expect(second.seen).toEqual(["DONE"]);
    const settled = await readOwners(s);
    expect([settled.source, settled.reserve, settled.time, settled.commitments.length]).toEqual([
      after.source,
      after.reserve,
      after.time,
      1,
    ]);
    expect(v2Ledger(s).intents.filter((i: any) => i.kind === "COLLECTION")).toHaveLength(1);
  }, 400_000);
});
