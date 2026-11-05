/* eslint-disable @typescript-eslint/no-explicit-any -- tests drive the handler with scripted collaborators */
// Initial Locality Bootstrap v0.9 ("Delayed Action Contract"): the continue_pending_goal / continue_queued_setup_edit handlers over the REAL
// protected stores and the REAL recovery planner, with scripted collaborators for the owners, the run slot and the OAuth ledger. They prove the
// authority checks, the crash cuts and the "never matched by quantity" rules. MECHANISM ONLY: no genuine proof, host or client is involved.
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PendingActionGrantStore,
  type ActionBinding,
} from "../../apps/phone/src/pending-action.ts";
import { QueuedSetupEditStore } from "../../apps/phone/src/queued-setup.ts";
import { FixtureOriginalMessageVerifier } from "@immortalis/testkit";
import {
  SITE_RESERVE_DISCLOSURE,
  acceptPendingRequest,
  continuePendingGoal,
  continueQueuedSetupEdit,
  type DelayedDeps,
} from "../../apps/phone/src/delayed-continuation.ts";
import type { DispatchLink } from "../../apps/phone/src/collection-recovery.ts";
import type { ToolContext } from "../../apps/phone/src/mcp-http.ts";
import type { GrantStatus } from "../../apps/phone/src/oauth-ledger.ts";
import { sha256Of } from "../../apps/phone/src/scenario-hash.ts";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "campaign-delayed";
const SCENARIO = {
  player_character: "pc-1",
  world: "world-1",
  source: "logs",
  reserve: "r1",
  quantity_unit: "lump",
  mechanism: "m1",
  basis: "b1",
};
const pin = (k: string, v = 1) => ({ fact_key: k, version: v });
const BINDING: ActionBinding = {
  scenario_hash: sha256Of(SCENARIO),
  pc_id: "pc-1",
  world_id: "world-1",
  locus_id: "locus-1",
  source: pin("world/world-1/source/logs"),
  reserve: pin("production/reserve/r1"),
  mechanism: pin("pc/pc-1/mechanism/m1"),
  basis: pin("production/extraction-basis/b1"),
  quantity_unit: "lump",
  amount: 3,
  until: "complete",
  as_of_head: "9",
};

interface World {
  oauth: GrantStatus;
  link: DispatchLink;
  binding: ActionBinding | null;
  frame: any;
  active: string | null;
  unresolved: boolean;
  frozen: boolean | null;
  begun: any[];
  launched: string[];
  goalLive: boolean;
  goalRecord: any;
  begin: "OK" | "REFUSE";
  target: { ok: true } | { ok: false; reason: string };
  ran: any[];
  clock: { t: number };
}

function rig(over: Partial<World> = {}) {
  const w: World = {
    oauth: "ISSUED",
    link: {
      kind: "READ",
      withDispatchRef: 0,
      intentId: null,
      actId: null,
      canonicalActId: null,
      openWithoutDispatchRef: false,
    },
    binding: BINDING,
    frame: null,
    active: null,
    unresolved: false,
    frozen: false,
    begun: [],
    launched: [],
    goalLive: false,
    goalRecord: null,
    begin: "OK",
    target: { ok: true },
    ran: [],
    clock: { t: 1_000 },
    ...over,
  };
  const macKey = randomBytes(32);
  const grants = new PendingActionGrantStore({
    campaignId: CAMPAIGN,
    dir: tempDir("delayed-grants-"),
    macKey,
    now: () => w.clock.t,
    policy: { syntheticEvidence: "REQUIRE" },
  });
  const queue = new QueuedSetupEditStore({
    campaignId: CAMPAIGN,
    dir: tempDir("delayed-queue-"),
    macKey,
    now: () => w.clock.t,
    validPayload: { REVISE_PC: (p) => Array.isArray(p["edits"]), REVISE_SETUP: () => true },
  });
  const deps: DelayedDeps = {
    config: { campaignId: CAMPAIGN, operatorLedgerVersion: 2 } as any,
    now: () => w.clock.t,
    grants,
    queue,
    oauthStatus: () => w.oauth,
    scenario: () => SCENARIO,
    readBinding: (async () => w.binding) as any,
    readLink: (async () => w.link) as any,
    pendingFrame: () => w.frame,
    runActive: (id) => w.active === id,
    goal: {
      current: () => (w.goalRecord ? { goal: w.goalRecord, live: w.goalLive } : null),
      settled: async () => undefined,
      begin: async (request: any, _a: any, requestId: string, delayed: any) => {
        w.begun.push({ request, requestId, delayed });
        if (w.begin === "REFUSE")
          return { ok: false as const, reason: "a command is already running" };
        return {
          ok: true as const,
          goal: { id: "g", ...request, outcome: "IN_PROGRESS", step: "ADOPTING" } as any,
          resumed: false,
        };
      },
    } as any,
    runs: {
      unresolved: () => w.unresolved,
      launch: async (command: string) => {
        w.launched.push(command);
        return { ok: true as const, run: {} as any };
      },
    } as any,
    freezeReleased: async () => (w.frozen === null ? null : !w.frozen),
    queuedTarget: async () => w.target,
    runQueued: async (rec) => {
      w.ran.push(rec.queue_id);
      return { content: [{ type: "text", text: JSON.stringify({ status: "APPLIED" }) }] };
    },
  };
  return { w, deps, grants, queue };
}

/** a live request context; a key named in `omit` is genuinely ABSENT (not undefined), as a request without it would be */
const ctx = (
  over: { [K in keyof ToolContext]?: ToolContext[K] } = {},
  omit: readonly (keyof ToolContext)[] = [],
): ToolContext => {
  const c: Record<string, unknown> = {
    request: { session: "s1", id: "1", tool: "continue_pending_goal", input: "{}" },
    canReview: false,
    supportsElicitation: false,
    scopes: ["player"],
    client: "client-1",
    grant: "grant-1",
    accessExpiresAtMs: 9_000,
    canElicit: false,
    elicit: async () => null,
    ...over,
  };
  for (const k of omit) delete c[k];
  return c as unknown as ToolContext;
};
const body = (r: any) => (r.isError ? r.content[0].text : JSON.parse(r.content[0].text));

const request = (over: Partial<Parameters<typeof acceptPendingRequest>[2]> = {}) => ({
  request_id: "request-1",
  client: "client-1",
  oauth_grant: "grant-1",
  interpretation: {
    kind: "SUPPORTED_SITE_COLLECTION" as const,
    evidence_quotes: ["three logs"],
    method: "GM_INTENT_V1" as const,
  },
  scope: {
    pc_id: "pc-1",
    world_id: "world-1",
    locus_id: "locus-1",
    source: pin("world/world-1/source/logs"),
    amount: 3,
    until: "complete" as const,
    risk_class: "ROUTINE_UNOPPOSED_SITE_COLLECTION" as const,
  },
  baseline: [pin("world/world-1/source/logs")],
  access_expires_at_ms: 5_000,
  ...over,
});
const verifier = new FixtureOriginalMessageVerifier("I'd like three logs from the pile.");
async function accepted(r: ReturnType<typeof rig>, over: any = {}) {
  const got = await acceptPendingRequest(r.deps, verifier as any, request(over));
  if (!got.ok) throw new Error(JSON.stringify(got.error));
  return got.value;
}
const stateOf = async (r: ReturnType<typeof rig>, id = "request-1") =>
  ((await r.grants.get(id)) as any).value as any;

describe("acceptPendingRequest: trusted intake of the later original request", () => {
  it("retains the request with the original expiry and delivers the exact site-Reserve disclosure; production's verifier retains nothing", async () => {
    const r = rig();
    const got = await accepted(r);
    expect(got.disclosure).toBe(SITE_RESERVE_DISCLOSURE);
    expect(got.disclosure).toBe(
      "Collection credits the site's Reserve; it does not put the log in your hands or let you carry it.",
    );
    expect(got.record.intent).toMatchObject({ disclosure_delivered: true, expires_at_ms: 5_000 });
    const { UnavailableOriginalMessageVerifier } =
      await import("../../apps/phone/src/pending-action.ts");
    const none = rig();
    const refused = await acceptPendingRequest(
      none.deps,
      UnavailableOriginalMessageVerifier,
      request(),
    );
    expect(refused.ok).toBe(false);
    expect((refused as any).error.code).toBe("ORIGINAL_MESSAGE_UNRESOLVED");
    expect(((await none.grants.list()) as any).value).toEqual([]);
    // a request whose own authority expiry is unknown retains nothing
    const unknown = await acceptPendingRequest(r.deps, verifier as any, {
      ...request({ request_id: "request-2" }),
      access_expires_at_ms: undefined,
    });
    expect(unknown.ok).toBe(false);
  });
});

describe("continue_pending_goal: only a NEW live authenticated request of the same authorization hands over", () => {
  it("dispatches the original request exactly as authored: one dispatch_ref, the complete binding persisted, the trusted DelayedLaunch to the goal", async () => {
    const r = rig();
    await accepted(r);
    const out = body(await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx()));
    expect(out).toMatchObject({
      status: "DISPATCHED",
      request_id: "request-1",
      disclosure: SITE_RESERVE_DISCLOSURE,
    });
    const rec = await stateOf(r);
    expect(rec.grant).toMatchObject({ state: "DISPATCHING", authorization_version: 1 });
    expect(rec.intent).toMatchObject({ phase: "HANDOVER", binding: BINDING });
    expect(r.w.begun).toHaveLength(1);
    expect(r.w.begun[0]).toMatchObject({
      request: { amount: 3, until: "complete" },
      delayed: {
        dispatchRef: rec.grant.dispatch_ref,
        grantId: rec.grant.grant_id,
        bindingDigest: sha256Of(BINDING),
      },
    });
    // the live request identity rides as the goal's request id; nothing the caller sent overrides amount, source or target
    expect(r.w.begun[0].requestId).toBe("1");
  });

  it("accepts exactly one request_id: any other argument, a missing, empty or malformed id is refused with nothing dispatched", async () => {
    const r = rig();
    await accepted(r);
    for (const args of [
      {},
      { request_id: "" },
      { request_id: 5 },
      { request_id: "request-1", amount: 99 },
      { request_id: "request-1", source: "other" },
      { request_id: "bad id with spaces" },
    ] as any[]) {
      const out = await continuePendingGoal(r.deps, args, ctx());
      expect([JSON.stringify(args), out.isError]).toEqual([JSON.stringify(args), true]);
    }
    expect(r.w.begun).toEqual([]);
    expect((await stateOf(r)).grant.state).toBe("ISSUED");
  });

  it("requires a live player-scoped authenticated request: no player scope, no client or grant, no request identity, no access expiry", async () => {
    const r = rig();
    await accepted(r);
    for (const c of [
      ctx({ scopes: ["referee"] }),
      ctx({ client: "" }),
      ctx({ grant: "" }),
      ctx({}, ["request"]),
      ctx({}, ["accessExpiresAtMs"]),
    ]) {
      const out = await continuePendingGoal(r.deps, { request_id: "request-1" }, c);
      expect(out.isError).toBe(true);
    }
    expect(r.w.begun).toEqual([]);
  });

  it("a different client OR a different OAuth grant gets an opaque refusal and changes nothing", async () => {
    const r = rig();
    await accepted(r);
    for (const c of [ctx({ client: "client-2" }), ctx({ grant: "grant-2" })]) {
      const out = await continuePendingGoal(r.deps, { request_id: "request-1" }, c);
      expect(out.isError).toBe(true);
      expect(out.content[0]?.text).toContain("no such pending request for this authorization");
    }
    const unknown = await continuePendingGoal(r.deps, { request_id: "request-404" }, ctx());
    expect(unknown.content[0]?.text).toBe(
      "there is no such pending request for this authorization; nothing was dispatched",
    );
    expect(r.w.begun).toEqual([]);
    expect((await stateOf(r)).grant.state).toBe("ISSUED");
  });

  it("a revoked, unknown or unverifiable grant never launches, even when the request still authenticates in this section", async () => {
    for (const oauth of ["REVOKED", "UNKNOWN", "UNAVAILABLE"] as GrantStatus[]) {
      const r = rig({ oauth });
      await accepted(r);
      const out = await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx());
      expect(r.w.begun).toEqual([]);
      const rec = await stateOf(r);
      expect([oauth, rec.grant.state === "DISPATCHING"]).toEqual([oauth, false]);
      if (oauth === "REVOKED" || oauth === "UNKNOWN") {
        expect(rec.grant.state).toBe("REVOKED"); // a retained tombstone
        expect(body(out)).toMatchObject({ status: "NOT_DISPATCHED", reason: "REVOKED" });
      }
    }
  });

  it("the REVOCATION RACE: the ledger flips to revoked between the planning read and the issuance; nothing dispatches", async () => {
    const r = rig();
    await accepted(r);
    let reads = 0;
    const racing: DelayedDeps = {
      ...r.deps,
      oauthStatus: () => (++reads <= 1 ? "ISSUED" : "REVOKED"),
    };
    const out = await continuePendingGoal(racing, { request_id: "request-1" }, ctx());
    expect(out.isError).toBe(true);
    expect(r.w.begun).toEqual([]);
    expect((await stateOf(r)).grant.state).not.toBe("DISPATCHING");
  });

  it("past the ORIGINAL deadline nothing dispatches, whatever the current token says, and the grant becomes an EXPIRED tombstone", async () => {
    const r = rig();
    await accepted(r);
    r.w.clock.t = 5_000;
    const out = body(
      await continuePendingGoal(
        r.deps,
        { request_id: "request-1" },
        ctx({ accessExpiresAtMs: 99_000 }),
      ),
    );
    expect(out).toMatchObject({ status: "NOT_DISPATCHED", reason: "EXPIRED" });
    expect(r.w.begun).toEqual([]);
    expect((await stateOf(r)).grant.state).toBe("EXPIRED");
  });

  it("a TOOL_CALL_ONLY, ambiguous or pickup request is retained but never dispatched", async () => {
    const cases: [string, any][] = [
      ["tool-call-only", null],
      ["ambiguous", { kind: "AMBIGUOUS", evidence_quotes: [], method: "GM_INTENT_V1" }],
      [
        "pickup",
        { kind: "PHYSICAL_PICKUP_UNSUPPORTED", evidence_quotes: [], method: "GM_INTENT_V1" },
      ],
    ];
    for (const [name, interpretation] of cases) {
      const r = rig();
      const v =
        name === "tool-call-only"
          ? new FixtureOriginalMessageVerifier("take the logs", "TOOL_CALL_ONLY")
          : verifier;
      await acceptPendingRequest(
        r.deps,
        v as any,
        request(interpretation ? { interpretation } : {}),
      );
      const out = body(await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx()));
      expect([name, r.w.begun.length]).toEqual([name, 0]);
      expect(out.status).toBe("PAUSED");
    }
  });

  it("a scenario or world that no longer agrees pauses FOREIGN_BASIS_CHANGED: never rebound, never dispatched", async () => {
    const r = rig({ binding: null });
    await accepted(r);
    expect(
      body(await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx())),
    ).toMatchObject({
      status: "PAUSED",
      reason: "FOREIGN_BASIS_CHANGED",
    });
    const second = rig();
    await accepted(second);
    await continuePendingGoal(second.deps, { request_id: "request-1" }, ctx());
    // the world's facts moved after the binding was filled (a different reserve pin)
    second.w.binding = { ...BINDING, reserve: pin("production/reserve/r1", 2) };
    const again = body(await continuePendingGoal(second.deps, { request_id: "request-1" }, ctx()));
    expect(again).toMatchObject({ status: "PAUSED", reason: "FOREIGN_BASIS_CHANGED" });
    expect((await stateOf(second)).intent.binding.reserve.version).toBe(1); // the original binding stands
  });

  it("the moving head alone is NOT a changed binding; a changed scenario hash is", async () => {
    const r = rig();
    await accepted(r);
    await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx());
    r.w.binding = { ...BINDING, as_of_head: "10" };
    r.w.goalRecord = null;
    const ok = body(await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx()));
    expect(ok.status).not.toBe("PAUSED");
    const changed = rig();
    await accepted(changed);
    await continuePendingGoal(changed.deps, { request_id: "request-1" }, ctx());
    changed.w.binding = { ...BINDING, scenario_hash: sha256Of({ ...SCENARIO, reserve: "r2" }) };
    expect(
      body(await continuePendingGoal(changed.deps, { request_id: "request-1" }, ctx())).reason,
    ).toBe("FOREIGN_BASIS_CHANGED");
  });

  it("a chain already carrying this dispatch in this process is not started twice", async () => {
    const r = rig();
    await accepted(r);
    await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx());
    const dispatchRef = (await stateOf(r)).grant.dispatch_ref;
    r.w.goalRecord = { dispatch_ref: dispatchRef, outcome: "IN_PROGRESS" };
    r.w.goalLive = true;
    const out = body(
      await continuePendingGoal(
        r.deps,
        { request_id: "request-1" },
        ctx({ request: { session: "s1", id: "2", tool: "x", input: "{}" } }),
      ),
    );
    expect(out.status).toBe("CONTINUING");
    expect(r.w.begun).toHaveLength(1);
  });

  it("if the goal cannot start, the grant stays DISPATCHING under the SAME dispatch_ref; the next live continuation resumes it, with no fallback", async () => {
    const r = rig({ begin: "REFUSE" });
    await accepted(r);
    const first = await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx());
    expect(first.isError).toBe(true);
    const ref = (await stateOf(r)).grant.dispatch_ref;
    expect(ref).toMatch(/^dispatch-/);
    r.w.begin = "OK";
    const second = body(
      await continuePendingGoal(
        r.deps,
        { request_id: "request-1" },
        ctx({ request: { session: "s1", id: "2", tool: "x", input: "{}" } }),
      ),
    );
    expect(second).toMatchObject({ status: "RESUMED", dispatch_ref: ref });
    expect(r.w.begun.map((b) => b.delayed.dispatchRef)).toEqual([ref, ref]);
    expect(r.w.launched).toEqual([]); // no console fallback, no synthetic answer
  });
});

describe("continue_pending_goal: the crash cuts of the recovery table, through the handler", () => {
  async function dispatching(over: Partial<World> = {}) {
    const r = rig(over);
    await accepted(r);
    await continuePendingGoal(r.deps, { request_id: "request-1" }, ctx());
    r.w.begun.length = 0;
    r.w.goalRecord = null;
    return r;
  }
  const again = (r: ReturnType<typeof rig>, id = "9") =>
    continuePendingGoal(
      r.deps,
      { request_id: "request-1" },
      ctx({ request: { session: "s1", id, tool: "x", input: "{}" } }),
    );

  it("DISPATCHING, launch not recorded: a new live continuation resumes the SAME dispatch_ref (the launch frame was never persisted)", async () => {
    const r = await dispatching();
    const ref = (await stateOf(r)).grant.dispatch_ref;
    expect(body(await again(r))).toMatchObject({ status: "RESUMED", dispatch_ref: ref });
  });

  it("launch recorded with an active or unknown process: it reconciles that exact run and starts no other", async () => {
    const r = await dispatching();
    const rec = await stateOf(r);
    r.w.frame = { run_id: "run-1", dispatch: { dispatch_ref: rec.grant.dispatch_ref } };
    r.w.active = "run-1";
    await r.grants.recordLaunch("request-1", "run-1");
    expect(body(await again(r))).toMatchObject({ status: "RECONCILING" });
    expect(r.w.launched).toEqual(["reconcile"]);
    expect(r.w.begun).toEqual([]);
  });

  it("crash after the ledger record but before the optional link: the intent is found by its dispatch_ref alone and linked, then reconciled", async () => {
    const r = await dispatching();
    const rec = await stateOf(r);
    r.w.link = {
      kind: "READ",
      withDispatchRef: 1,
      intentId: "operator-intent:u1",
      actId: "operator-act-u1",
      canonicalActId: null,
      openWithoutDispatchRef: false,
    };
    expect(body(await again(r))).toMatchObject({ status: "LINKED" });
    expect((await stateOf(r)).intent.operator_intent_ref).toBe("operator-intent:u1");
    expect(body(await again(r, "10"))).toMatchObject({ status: "RECONCILING" });
    expect(rec.grant.dispatch_ref).toBeTruthy();
    expect(r.w.begun).toEqual([]); // nothing new was started
  });

  it("a canonical act exists for the linked intent: its REAL act_id is bound and the grant consumed; no other collection is allocated", async () => {
    const r = await dispatching();
    r.w.link = {
      kind: "READ",
      withDispatchRef: 1,
      intentId: "operator-intent:u1",
      actId: "operator-act-u1",
      canonicalActId: "operator-act-u1",
      openWithoutDispatchRef: false,
    };
    const rec = await stateOf(r);
    r.w.goalRecord = { dispatch_ref: rec.grant.dispatch_ref, outcome: "DONE" };
    const out = body(await again(r));
    expect(out).toMatchObject({ status: "DONE", act_id: "operator-act-u1" });
    const done = await stateOf(r);
    expect(done.grant).toMatchObject({
      state: "CONSUMED",
      act_id: "operator-act-u1",
      operator_intent_ref: "operator-intent:u1",
    });
    expect(done.intent.phase).toBe("TERMINAL");
    expect(r.w.begun).toEqual([]);
    // an INTERRUPTED goal of that exact dispatch resumes by its join (never a fresh collect)
    const r2 = await dispatching();
    r2.w.link = {
      kind: "READ",
      withDispatchRef: 1,
      intentId: "operator-intent:u1",
      actId: "operator-act-u1",
      canonicalActId: "operator-act-u1",
      openWithoutDispatchRef: false,
    };
    r2.w.goalRecord = {
      dispatch_ref: (await stateOf(r2)).grant.dispatch_ref,
      outcome: "IN_PROGRESS",
    };
    expect(body(await again(r2))).toMatchObject({
      status: "CONTINUING",
      act_id: "operator-act-u1",
    });
    expect(r2.w.begun).toHaveLength(1);
  });

  it("a committed act whose authority was later revoked stays true: it is bound and consumed, and NOTHING more is continued under the old grant", async () => {
    const r = await dispatching();
    r.w.link = {
      kind: "READ",
      withDispatchRef: 1,
      intentId: "operator-intent:u1",
      actId: "operator-act-u1",
      canonicalActId: "operator-act-u1",
      openWithoutDispatchRef: false,
    };
    r.w.oauth = "REVOKED";
    r.w.goalRecord = {
      dispatch_ref: (await stateOf(r)).grant.dispatch_ref,
      outcome: "IN_PROGRESS",
    };
    const out = body(await again(r));
    expect(out.status).toBe("ACT_STANDS");
    expect((await stateOf(r)).grant).toMatchObject({
      state: "CONSUMED",
      act_id: "operator-act-u1",
    });
    expect(r.w.begun).toEqual([]);
  });

  it("no retained intent and the original run PROVEN no-effect: the same dispatch_ref resumes; unproved no-effect is OUTCOME_UNKNOWN, never a reroll", async () => {
    const r = await dispatching();
    await r.grants.recordLaunch("request-1", "run-1");
    r.w.frame = null; // the frame was settled and cleared: the process exited
    r.w.unresolved = false;
    const ref = (await stateOf(r)).grant.dispatch_ref;
    expect(body(await again(r))).toMatchObject({ status: "RESUMED", dispatch_ref: ref });
    // the recovery slot is still unresolved: no-effect cannot be proved
    const u = await dispatching();
    await u.grants.recordLaunch("request-1", "run-1");
    u.w.unresolved = true;
    expect(body(await again(u))).toMatchObject({ status: "PAUSED", reason: "OUTCOME_UNKNOWN" });
    expect(u.w.begun).toEqual([]);
    // an unreadable ledger proves nothing
    const l = await dispatching();
    await l.grants.recordLaunch("request-1", "run-1");
    l.w.link = { kind: "UNAVAILABLE" };
    expect(body(await again(l))).toMatchObject({ status: "PAUSED", reason: "OUTCOME_UNKNOWN" });
  });

  it("a legacy orphan - an open collection WITHOUT this dispatch_ref - is never adopted by shape or quantity: OUTCOME_UNKNOWN", async () => {
    const r = await dispatching();
    await r.grants.recordLaunch("request-1", "run-1");
    r.w.link = {
      kind: "READ",
      withDispatchRef: 0,
      intentId: null,
      actId: null,
      canonicalActId: null,
      openWithoutDispatchRef: true,
    };
    expect(body(await again(r))).toMatchObject({ status: "PAUSED", reason: "OUTCOME_UNKNOWN" });
    expect(r.w.begun).toEqual([]);
    // before any launch an unrelated open attempt means the collect itself is impossible: ANOTHER_ACT_OPEN
    const before = await dispatching();
    before.w.link = {
      kind: "READ",
      withDispatchRef: 0,
      intentId: null,
      actId: null,
      canonicalActId: null,
      openWithoutDispatchRef: true,
    };
    expect(body(await again(before))).toMatchObject({
      status: "PAUSED",
      reason: "ANOTHER_ACT_OPEN",
    });
  });
});

describe("continue_queued_setup_edit: a queued edit applies only after the freeze, to its own target, within its ORIGINAL deadline", () => {
  const q = (r: ReturnType<typeof rig>, over: any = {}) =>
    r.queue.enqueue({
      client: "client-1",
      oauth_grant: "grant-1",
      original_request_ref: "request-9",
      command: "REVISE_PC",
      payload: { edits: [{ op: "ADD" }] },
      retained_workflow_ref: "pc-1",
      retained_revision: 2,
      access_expires_at_ms: 5_000,
      ...over,
    }) as Promise<any>;
  const call = (
    r: ReturnType<typeof rig>,
    id: string,
    c: ToolContext = ctx({
      request: { session: "s1", id: "3", tool: "continue_queued_setup_edit", input: "{}" },
    }),
  ) => continueQueuedSetupEdit(r.deps, { queue_id: id }, c);

  it("applies exactly the retained edit through the existing path once the freeze has released, marking it APPLIED", async () => {
    const r = rig();
    const rec = (await q(r)).value;
    const out = body(await call(r, rec.queue_id));
    expect(out.status).toBe("APPLIED");
    expect(r.w.ran).toEqual([rec.queue_id]);
    expect(((await r.queue.get(rec.queue_id)) as any).value.phase).toBe("QUEUED"); // marked by the run path that owns the outcome
  });

  it("while the freeze holds the edit waits; a freeze that cannot be established applies nothing", async () => {
    const waiting = rig({ frozen: true });
    const rec = (await q(waiting)).value;
    expect(body(await call(waiting, rec.queue_id))).toMatchObject({ status: "QUEUED" });
    const unknown = rig({ frozen: null });
    const rec2 = (await q(unknown)).value;
    expect((await call(unknown, rec2.queue_id)).isError).toBe(true);
    expect(waiting.w.ran).toEqual([]);
    expect(unknown.w.ran).toEqual([]);
  });

  it("an edit past its ORIGINAL deadline, or whose authorization was revoked, becomes a REJECTED tombstone and is never applied", async () => {
    const late = rig();
    const rec = (await q(late)).value;
    late.w.clock.t = 5_000;
    const out = body(
      await call(
        late,
        rec.queue_id,
        ctx({
          accessExpiresAtMs: 99_000,
          request: { session: "s1", id: "4", tool: "x", input: "{}" },
        }),
      ),
    );
    expect(out).toMatchObject({ status: "REJECTED", reason: "EXPIRED" });
    expect(late.w.ran).toEqual([]);
    const revoked = rig({ oauth: "REVOKED" });
    const r2 = (await q(revoked)).value;
    expect(body(await call(revoked, r2.queue_id))).toMatchObject({
      status: "REJECTED",
      reason: "REVOKED",
    });
    expect(((await revoked.queue.get(r2.queue_id)) as any).value).toMatchObject({
      phase: "REJECTED",
      reason: "REVOKED",
    });
    const broken = rig({ oauth: "UNAVAILABLE" });
    const r3 = (await q(broken)).value;
    expect((await call(broken, r3.queue_id)).isError).toBe(true);
    expect(broken.w.ran).toEqual([]);
  });

  it("a sealed, missing or changed target is a retained REJECTED result with the owner's reason; no target is substituted", async () => {
    const r = rig({
      target: {
        ok: false,
        reason: "the character is no longer the unkept draft this edit was written for",
      },
    });
    const rec = (await q(r)).value;
    const out = body(await call(r, rec.queue_id));
    expect(out).toMatchObject({
      status: "REJECTED",
      reason: "the character is no longer the unkept draft this edit was written for",
    });
    expect(r.w.ran).toEqual([]);
    expect((await call(r, rec.queue_id)).content[0]?.text).toContain("REJECTED");
  });

  it("another client or grant, a missing live request, extra arguments and a finished entry apply nothing", async () => {
    const r = rig();
    const rec = (await q(r)).value;
    for (const c of [ctx({ client: "client-2" }), ctx({ grant: "grant-2" })])
      expect((await call(r, rec.queue_id, c)).isError).toBe(true);
    expect((await call(r, rec.queue_id, ctx({}, ["request"]))).isError).toBe(true);
    expect(
      (await continueQueuedSetupEdit(r.deps, { queue_id: rec.queue_id, payload: {} } as any, ctx()))
        .isError,
    ).toBe(true);
    expect((await continueQueuedSetupEdit(r.deps, {}, ctx())).isError).toBe(true);
    expect(r.w.ran).toEqual([]);
    await r.queue.markApplied(rec.queue_id);
    expect(body(await call(r, rec.queue_id)).status).toBe("APPLIED");
    expect(r.w.ran).toEqual([]);
  });
});
