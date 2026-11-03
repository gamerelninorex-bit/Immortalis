/* eslint-disable @typescript-eslint/no-explicit-any -- scripted MCP and raw owner readback */
// MECHANISM ONLY (T1). The delayed-action path end to end on the REAL chat adapter, real canonical owners, real operator commands and a real
// version-2 ledger: the player's EARLIER original request (a labelled FIXTURE proof - no genuine original-message method exists) is carried out
// by a NEW live continue_pending_goal request, and the owners' conserved consequence is read back independently. Scripted referee hosts are
// plumbing, not a GM's reading; nothing here is T2 (genuine host/original-message) or T3 (named client) evidence.
//
// The downstream owner chain is the existing ORIGINAL-F-1 basis on a lawful non-bootstrap fixture (the brief: "do not assert that such a source
// exists on a bootstrap-bearing journal"); the bootstrap-bearing closure -> look -> collection witness is in initial-setup-witness.test.ts.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, expect, it } from "vitest";
import { ledgerFileName } from "@immortalis/operator";
import { FixtureOriginalMessageVerifier } from "@immortalis/testkit";
import { acceptPendingRequest } from "../../apps/phone/src/delayed-continuation.ts";
import { readScenario } from "../../apps/phone/src/scenario.ts";
import { Chat } from "../support/chat-client.ts";
import {
  MOMENT,
  TAU,
  cloneSlot,
  openOrdinary,
  resumed,
  template,
  type RouteRun,
  type Slot,
} from "../support/chat-route.ts";

let ready: Slot;
beforeAll(async () => {
  ready = await template("READY", { cycle: true });
}, 300_000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const verifier = new FixtureOriginalMessageVerifier(
  "I'd like to gather two stones from the pile when we are ready.",
);

/** the owners' own records, read afresh and independently of the adapter and of the code under test */
const read = async (s: Slot) => {
  const c = await openOrdinary(s.campaignDir);
  try {
    const facts = c.store.listFacts();
    return {
      source: (c.store.getFact("world/world-courtyard/source/src-loose-stones")!.value as any)
        .recoverable.amount,
      reserve: (facts.find((f) => f.key.startsWith("production/reserve/"))!.value as any).quantity
        .amount,
      time: (c.store.getFact("temporal/state")!.value as any).canonical_time.value,
      commitments: facts.filter(
        (f) => f.key.includes("/collection/") && f.key.endsWith("/commitment"),
      ),
    };
  } finally {
    await c.close();
  }
};
const v2Ledger = (s: Slot) => {
  const file = join(s.operatorDir, ledgerFileName(s.config.campaignId));
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

/** the token's own verified expiry (the same exp the server captured), for the trusted intake of the fixture */
const expiryOf = (chat: Chat): number =>
  JSON.parse(Buffer.from(chat.access.split(".")[0]!, "base64url").toString()).exp;

/** a slot cloned under a version-2 workflow with the fixture-accepting store, linked to one player client */
async function slot(): Promise<{ s: Slot; r: RouteRun }> {
  const s = await cloneSlot(ready, { ledgerVersion: 2 });
  // the source and locus as the owners hold them, read before the service takes the campaign
  const c = await openOrdinary(s.campaignDir);
  try {
    const sc = readScenario(s.config.scenarioFile)!;
    const key = `world/${sc.world}/source/${sc.source}`;
    const f = c.store.getFact(key)!;
    (s as any).facts = {
      scenario: sc,
      source: { fact_key: key, version: f.version },
      locus: (f.value as any).locality.locus.entity_id as string,
    };
  } finally {
    await c.close();
  }
  const r = await resumed(s, { deps: { delayed: { policy: { syntheticEvidence: "REQUIRE" } } } });
  await r.chat.init({});
  return { s, r };
}

/** the trusted intake of the earlier request, for the client/grant that is linked right now */
async function intake(
  r: RouteRun,
  over: { id?: string; amount?: number; until?: "start" | "complete"; verifierOverride?: any } = {},
) {
  const f = (r.s as any).facts;
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
        pc_id: f.scenario.player_character,
        world_id: f.scenario.world,
        locus_id: f.locus,
        source: f.source,
        amount: over.amount ?? 2,
        until: over.until ?? "complete",
        risk_class: "ROUTINE_UNOPPOSED_SITE_COLLECTION",
      },
      baseline: [f.source],
      access_expires_at_ms: expiryOf(r.chat),
    },
  );
  if (!got.ok) throw new Error(JSON.stringify(got.error));
  return got.value;
}

/** follows the goal through play_status (what a host does) until the predicate holds */
async function until(chat: Chat, ok: (status: any) => boolean, rounds = 240) {
  let last: any;
  for (let i = 0; i < rounds; i++) {
    last = (await chat.call("play_status")).data;
    if (last && ok(last)) return last;
    await sleep(250);
  }
  throw new Error(`the goal did not reach the expected state: ${JSON.stringify(last)}`);
}
const finished = (s: any) =>
  s.goal !== null && ["DONE", "RETURNED", "INTERRUPTED"].includes(s.goal.outcome);

it("the player's EARLIER original request is carried out by a NEW live continue_pending_goal: ledger-bound, conserved, replay-safe, and the old authority ends with its act", async () => {
  const { s, r } = await slot();
  try {
    const before = await read(s);
    expect(before.commitments).toHaveLength(0);
    // the tool exists only for this version-2 workflow, and with no pending request nothing starts
    const tools = (await r.chat.rpc("tools/list")).json.result.tools.map((t: any) => t.name);
    expect(tools).toContain("continue_pending_goal");
    expect(tools).toContain("continue_queued_setup_edit");
    const nothing = await r.chat.call("continue_pending_goal", { request_id: "request-none" });
    expect(nothing.isError).toBe(true);
    expect(await read(s)).toMatchObject({ source: before.source, reserve: before.reserve });

    const accepted = await intake(r);
    expect(accepted.disclosure).toContain("does not put the log in your hands");
    // READY/status reads and stored identity alone never dispatch
    await r.chat.call("play_status");
    await r.chat.call("collection_setup_status");
    expect((await read(s)).commitments).toHaveLength(0);

    // the NEW live request
    const started = await r.chat.call("continue_pending_goal", { request_id: "request-1" });
    expect(started.isError).toBe(false);
    expect(started.data).toMatchObject({
      status: "DISPATCHED",
      disclosure: expect.stringContaining("Reserve"),
    });
    const done = await until(r.chat, finished);
    expect(done.goal).toMatchObject({ amount: 2, until: "complete", outcome: "DONE" });

    // owners' conserved consequence, independently read
    const after = await read(s);
    expect([after.source, after.reserve, after.time]).toEqual([
      before.source - 2,
      before.reserve + 2,
      MOMENT.value + 2 * TAU,
    ]);
    expect(after.commitments).toHaveLength(1);

    // the operator ledger is version 2 and holds exactly ONE collection under the grant's dispatch_ref, linked to the canonical act
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
    const consumed = ((await r.app.delayed!.grants.get("request-1")) as any).value;
    expect(consumed.grant).toMatchObject({
      state: "CONSUMED",
      act_id: collections[0].choice.act_id,
      operator_intent_ref: collections[0].intent_id,
    });
    expect(consumed.intent.phase).toBe("TERMINAL");
    expect(await read(s)).toEqual(after);

    // the old authority cannot be used again: no second collection, whatever is asked
    const again = await r.chat.call("continue_pending_goal", { request_id: "request-1" });
    expect(again.data.status).toBe("DONE");
    expect((await read(s)).commitments).toHaveLength(1);

    // another meaningful choice meets the REAL remainder (an ordinary direct gather, with no dispatch_ref)
    const next = await r.chat.call("gather", { amount: 1, until: "complete" });
    expect(next.isError).toBe(false);
    await until(r.chat, (st) => finished(st) && st.goal.amount === 1);
    const later = await read(s);
    expect([later.source, later.reserve]).toEqual([after.source - 1, after.reserve + 1]);
    const ledger2 = v2Ledger(s).intents.filter((i: any) => i.kind === "COLLECTION");
    expect(ledger2.map((i: any) => i.dispatch_ref === null)).toEqual([false, true]);
  } finally {
    await r.stop();
  }

  // close/reopen: strict replay of the journal and the retained records agree
  const reopened = await resumed(s, {
    deps: { delayed: { policy: { syntheticEvidence: "REQUIRE" } } },
  });
  try {
    await reopened.chat.init({});
    const after = await read(s);
    expect(after.commitments).toHaveLength(2);
    const done = ((await reopened.app.delayed!.grants.get("request-1")) as any).value;
    expect(done.grant.state).toBe("CONSUMED");
    expect(readdirSync(join(s.operatorDir, "delayed-action", "pending")).length).toBe(1);
  } finally {
    await reopened.stop();
  }
}, 300_000);

it("falsifiers on the real adapter: another authorization, a tool-call-only proof, an undisclosed request and extra arguments start nothing", async () => {
  const { s, r } = await slot();
  try {
    const before = await read(s);
    await intake(r);
    // extra arguments / a missing id: the schema and the handler both refuse
    for (const args of [{}, { request_id: "request-1", amount: 99 }, { request_id: "" }] as any[]) {
      const out = await r.chat.call("continue_pending_goal", args);
      expect([JSON.stringify(args), out.isError]).toEqual([JSON.stringify(args), true]);
    }
    // a second, separately consented authorization (same lane secret, another grant) is a DIFFERENT authorization
    const other = new Chat(s.base);
    expect(
      (await other.link("player", { player: (await import("../support/chat-client.ts")).PLAYER }))
        .ok,
    ).toBe(true);
    await other.init({});
    const refused = await other.call("continue_pending_goal", { request_id: "request-1" });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused)).toContain("no such pending request for this authorization");
    // a tool-call-only proof is retained but can never support a live intent claim
    await intake(r, {
      id: "request-2",
      verifierOverride: new FixtureOriginalMessageVerifier("take the stones", "TOOL_CALL_ONLY"),
    });
    const toolOnly = await r.chat.call("continue_pending_goal", { request_id: "request-2" });
    expect(toolOnly.data).toMatchObject({ status: "PAUSED", reason: "AUTHORITY_UNRESOLVED" });
    // revoking the grant ends the tool altogether (the request no longer authenticates), and writes nothing to canon
    // this client's own live grant (the ledger also holds the template's earlier grants and the second consent above)
    const mine = r.app
      .oauthLedger!.list()!
      .find((e) => e.client === r.chat.clientId && e.state === "ISSUED")!;
    expect(r.app.oauthLedger!.revoke(mine.client, mine.grant, "OPERATOR")).toBe("REVOKED");
    expect((await r.chat.rpc("tools/list")).status).toBe(401);
    expect(await read(s)).toMatchObject({
      source: before.source,
      reserve: before.reserve,
      time: before.time,
    });
    expect(v2Ledger(s)?.intents ?? []).toEqual([]);
  } finally {
    await r.stop();
  }
}, 300_000);
