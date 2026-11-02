/* eslint-disable @typescript-eslint/no-explicit-any -- tests corrupt raw protected records */
// Initial Locality Bootstrap v0.9 ("Delayed Action Contract"): the campaign-private PendingActionGrantStore and the recovery table as a pure
// function of durable facts. MECHANISM ONLY - the original-message evidence here is a labelled T1 fixture; nothing is a genuine proof.
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PendingActionGrantStore,
  PendingActionRecordSchema,
  UnavailableOriginalMessageVerifier,
  planDelayedRecovery,
  dispatchRefOf,
  type DelayedRecoveryFacts,
  type PendingIntake,
  type PendingPolicy,
  type ActionBinding,
} from "@immortalis/operator";
import { tempDir } from "../support/tmp.ts";

const CAMPAIGN = "campaign-pending";
const sha = (c: string) => c.repeat(64).slice(0, 64);
const pin = (k: string, v = 1) => ({ fact_key: k, version: v });

function rig(
  over: { policy?: PendingPolicy; now?: { t: number }; dir?: string; key?: Buffer } = {},
) {
  const clock = over.now ?? { t: 1_000 };
  const dir = over.dir ?? tempDir("pending-action-");
  const macKey = over.key ?? randomBytes(32);
  const store = new PendingActionGrantStore({
    campaignId: CAMPAIGN,
    dir,
    macKey,
    now: () => clock.t,
    policy: over.policy ?? { syntheticEvidence: "REQUIRE" },
  });
  return { store, clock, dir, macKey };
}

const intake = (over: Partial<PendingIntake> = {}): PendingIntake => ({
  request_id: "request-1",
  client: "client-1",
  oauth_grant: "grant-1",
  original_message: {
    source_ref: "fixture:message-1",
    utterance: "I'd like to gather three logs from the pile.",
    proof_hash: sha("a"),
    grade: "ORIGINAL_MESSAGE_VERIFIED",
  },
  interpretation: {
    kind: "SUPPORTED_SITE_COLLECTION",
    evidence_quotes: ["gather three logs"],
    method: "GM_INTENT_V1",
  },
  scope: {
    pc_id: "pc-1",
    world_id: "world-1",
    locus_id: "locus-1",
    source: pin("world/world-1/source/logs"),
    amount: 3,
    until: "complete",
    risk_class: "ROUTINE_UNOPPOSED_SITE_COLLECTION",
  },
  baseline: [pin("world/world-1/source/logs")],
  access_expires_at_ms: 5_000,
  ...over,
});
const binding = (over: Partial<ActionBinding> = {}): ActionBinding => ({
  scenario_hash: sha("b"),
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
  as_of_head: "head-7",
  ...over,
});
const must = async <T>(r: Promise<{ ok: boolean; value?: T; error?: unknown }>): Promise<T> => {
  const v = await r;
  if (!v.ok) throw new Error(JSON.stringify(v.error));
  return v.value as T;
};
const code = async (r: Promise<{ ok: boolean; error?: any }>) => {
  const v = await r;
  return v.ok ? "OK" : v.error.code;
};
/** a request that has been disclosed and bound, ready for handover */
async function ready(r = rig()) {
  await must(r.store.intake(intake()));
  await must(r.store.deliverDisclosure("request-1"));
  await must(r.store.bind("request-1", binding()));
  return r;
}

describe("PendingActionGrantStore: intake keeps the player's original later request, and only that", () => {
  it("retains one atomic record (intent + grant) with the ORIGINAL access expiry, hashes and no bearer token", async () => {
    const { store, dir } = rig();
    const rec = await must<any>(store.intake(intake()));
    expect(rec.intent).toMatchObject({
      format: "immortalis-pending-setup",
      phase: "PENDING_SETUP",
      pause: null,
      disclosure_delivered: false,
      binding: null,
      dispatch_ref: null,
      expires_at_ms: 5_000,
      revision: 0,
    });
    expect(rec.grant).toMatchObject({
      state: "ISSUED",
      binding_hash: null,
      authorization_version: 0,
      expires_at_ms: 5_000,
    });
    expect(rec.grant.intent_hash).toMatch(/^[0-9a-f]{64}$/);
    const files = readdirSync(dir);
    expect(files).toHaveLength(1);
    const raw = readFileSync(join(dir, files[0]!), "utf8");
    expect(raw).not.toMatch(/bearer|access_token|refresh_token|secret/i);
    expect((await must<any>(store.get("request-1"))).intent.original_message.utterance).toContain(
      "gather three logs",
    );
  });

  it("recognises an identical repeat (the retained deadline is NOT moved by a later token) and refuses a different request under one identity", async () => {
    const { store } = rig();
    const first = await must<any>(store.intake(intake()));
    const again = await must<any>(store.intake(intake({ access_expires_at_ms: 9_999_999 })));
    expect(again.intent.expires_at_ms).toBe(5_000);
    expect(again.grant.grant_id).toBe(first.grant.grant_id);
    expect(await code(store.intake(intake({ scope: { ...intake().scope, amount: 4 } })))).toBe(
      "PENDING_EXISTS",
    );
  });

  it("refuses an expired or invalid authority and an invalid request", async () => {
    const r = rig();
    expect(await code(r.store.intake(intake({ access_expires_at_ms: 1_000 })))).toBe(
      "PENDING_EXPIRED",
    );
    expect(await code(r.store.intake(intake({ access_expires_at_ms: 999 })))).toBe(
      "PENDING_EXPIRED",
    );
    expect(await code(r.store.intake(intake({ request_id: "" })))).toBe("PENDING_INVALID");
    expect(await code(r.store.intake(intake({ scope: { ...intake().scope, amount: 0 } })))).toBe(
      "PENDING_INVALID",
    );
  });

  it("production REJECTs the reserved fixture namespace; the fixture store accepts only labelled fixture evidence", async () => {
    const production = rig({ policy: { syntheticEvidence: "REJECT" } });
    expect(await code(production.store.intake(intake()))).toBe("PENDING_AUTHORITY");
    const real = intake({
      original_message: { ...intake().original_message, source_ref: "message-1" },
    });
    expect(await code(production.store.intake(real))).toBe("OK");
    const fixture = rig({ policy: { syntheticEvidence: "REQUIRE" } });
    expect(await code(fixture.store.intake(real))).toBe("PENDING_AUTHORITY");
  });

  it("a TOOL_CALL_ONLY request, an ambiguous reading and a pickup reading are retained PAUSED and can never be dispatched", async () => {
    const cases: [string, Partial<PendingIntake>, string][] = [
      [
        "tool-call-only",
        { original_message: { ...intake().original_message, grade: "TOOL_CALL_ONLY" } },
        "AUTHORITY_UNRESOLVED",
      ],
      [
        "ambiguous",
        { interpretation: { ...intake().interpretation, kind: "AMBIGUOUS" } },
        "AMBIGUOUS_INTENT",
      ],
      [
        "pickup",
        { interpretation: { ...intake().interpretation, kind: "PHYSICAL_PICKUP_UNSUPPORTED" } },
        "UNSUPPORTED_ACTION",
      ],
    ];
    for (const [name, over, pause] of cases) {
      const r = rig();
      const rec = await must<any>(r.store.intake(intake(over)));
      expect([name, rec.intent.phase, rec.intent.pause]).toEqual([name, "PAUSED", pause]);
      await must(r.store.deliverDisclosure("request-1"));
      await must(r.store.bind("request-1", binding()));
      expect([name, await code(r.store.beginDispatch("request-1"))]).not.toEqual([name, "OK"]);
    }
  });

  it("production's original-message verifier returns the actual unresolved-authority result", async () => {
    const r = await UnavailableOriginalMessageVerifier.verify({
      client: "c",
      oauth_grant: "g",
      request_ref: "r",
    });
    expect(r.ok).toBe(false);
    expect((r as any).error.code).toBe("ORIGINAL_MESSAGE_UNRESOLVED");
  });
});

describe("PendingActionGrantStore: the single live path ISSUED -> DISPATCHING -> CONSUMED", () => {
  it("dispatch needs the disclosure and a complete binding; it allocates ONE dispatch_ref, reused on every resume", async () => {
    const r = rig();
    await must(r.store.intake(intake()));
    expect(await code(r.store.beginDispatch("request-1"))).toBe("PENDING_STATE"); // no disclosure
    await must(r.store.deliverDisclosure("request-1"));
    expect(await code(r.store.beginDispatch("request-1"))).toBe("PENDING_STATE"); // unbound
    await must(r.store.bind("request-1", binding()));
    const started = await must<any>(r.store.beginDispatch("request-1"));
    expect(started.grant).toMatchObject({ state: "DISPATCHING", authorization_version: 1 });
    expect(started.intent.phase).toBe("HANDOVER");
    expect(started.grant.dispatch_ref).toBe(dispatchRefOf(started.grant.grant_id));
    const resumed = await must<any>(r.store.beginDispatch("request-1"));
    expect(resumed.grant.dispatch_ref).toBe(started.grant.dispatch_ref);
    expect(resumed.intent.revision).toBe(started.intent.revision); // an idempotent resume writes nothing
  });

  it("a different binding NEVER rebinds silently: the request pauses FOREIGN_BASIS_CHANGED and keeps the original", async () => {
    const r = await ready();
    const changed = await must<any>(
      r.store.bind("request-1", binding({ scenario_hash: sha("c") })),
    );
    expect(changed.intent).toMatchObject({ phase: "PAUSED", pause: "FOREIGN_BASIS_CHANGED" });
    expect(changed.intent.binding.scenario_hash).toBe(sha("b"));
    // the same binding again is recognised
    expect((await must<any>(r.store.bind("request-1", binding()))).intent.revision).toBe(
      changed.intent.revision,
    );
    // a binding wider than the retained scope is not a lawful change at all
    const wide = rig();
    await must(wide.store.intake(intake()));
    expect(await code(wide.store.bind("request-1", binding({ amount: 99 })))).toBe(
      "PENDING_INVALID",
    );
    expect(await code(wide.store.bind("request-1", binding({ pc_id: "pc-other" })))).toBe(
      "PENDING_INVALID",
    );
  });

  it("an OUTCOME_UNKNOWN / ambiguous / expired pause cannot be dispatched; a liftable pause can", async () => {
    for (const reason of [
      "OUTCOME_UNKNOWN",
      "AUTHORIZATION_EXPIRED",
      "NONROUTINE_CONSEQUENCE",
    ] as const) {
      const r = await ready();
      await must(r.store.pause("request-1", reason));
      expect([reason, await code(r.store.beginDispatch("request-1"))]).toEqual([
        reason,
        "PENDING_STATE",
      ]);
    }
    for (const reason of [
      "ANOTHER_ACT_OPEN",
      "PC_OR_TARGET_CHANGED",
      "AUTHORITY_UNRESOLVED",
    ] as const) {
      const r = await ready();
      await must(r.store.pause("request-1", reason));
      expect([reason, await code(r.store.beginDispatch("request-1"))]).toEqual([reason, "OK"]);
    }
  });

  it("the launch is recorded once; the retained intent and the REAL act are linked, never overwritten; consuming is idempotent", async () => {
    const r = await ready();
    await must(r.store.beginDispatch("request-1"));
    await must(r.store.recordLaunch("request-1", "run-1"));
    await must(r.store.recordLaunch("request-1", "run-1"));
    expect(await code(r.store.recordLaunch("request-1", "run-2"))).toBe("PENDING_STATE");
    expect(await code(r.store.consume("request-1", "act-1"))).toBe("PENDING_STATE"); // not linked yet
    await must(r.store.linkIntent("request-1", { operator_intent_ref: "operator-intent:u1" }));
    expect(
      await code(r.store.linkIntent("request-1", { operator_intent_ref: "operator-intent:other" })),
    ).toBe("PENDING_STATE");
    await must(
      r.store.linkIntent("request-1", {
        operator_intent_ref: "operator-intent:u1",
        act_id: "act-1",
      }),
    );
    const done = await must<any>(r.store.consume("request-1", "act-1"));
    expect(done.grant.state).toBe("CONSUMED");
    expect(done.intent).toMatchObject({ phase: "TERMINAL", act_id: "act-1" });
    expect((await must<any>(r.store.consume("request-1", "act-1"))).intent.revision).toBe(
      done.intent.revision,
    );
    expect(await code(r.store.consume("request-1", "act-2"))).toBe("PENDING_STATE");
    expect(await code(r.store.beginDispatch("request-1"))).toBe("PENDING_STATE"); // a consumed grant never dispatches again
  });

  it("the deadline is the ORIGINAL request's: past it nothing dispatches, whatever a later token says", async () => {
    const r = await ready();
    r.clock.t = 5_000;
    expect(await code(r.store.beginDispatch("request-1"))).toBe("PENDING_EXPIRED");
    const dead = await must<any>(r.store.endAuthority("request-1", "EXPIRED"));
    expect(dead.grant.state).toBe("EXPIRED");
    expect(dead.intent).toMatchObject({ phase: "PAUSED", pause: "AUTHORIZATION_EXPIRED" });
    expect(await code(r.store.beginDispatch("request-1"))).toBe("PENDING_STATE");
  });

  it("cancellation or replacement BEFORE commitment keeps a tombstone; work already dispatching is stopped only by the existing cessation", async () => {
    const r = await ready();
    const cancelled = await must<any>(r.store.retire("request-1", "CANCELLED"));
    expect(cancelled.grant.state).toBe("REVOKED");
    expect(cancelled.intent.phase).toBe("CANCELLED");
    expect(await code(r.store.beginDispatch("request-1"))).toBe("PENDING_STATE");
    const replaced = await ready();
    expect((await must<any>(replaced.store.retire("request-1", "REPLACED"))).grant.state).toBe(
      "REPLACED",
    );

    const enrolled = await ready();
    await must(enrolled.store.beginDispatch("request-1"));
    expect(await code(enrolled.store.retire("request-1", "CANCELLED"))).toBe("PENDING_STATE");
    // a revoked authority with an act committed does not rewrite the historical act
    await must(
      enrolled.store.linkIntent("request-1", { operator_intent_ref: "i", act_id: "act-1" }),
    );
    expect(await code(enrolled.store.endAuthority("request-1", "REVOKED"))).toBe("PENDING_STATE");
  });

  it("revocation of a live, undispatched grant is a retained tombstone", async () => {
    const r = await ready();
    const dead = await must<any>(r.store.endAuthority("request-1", "REVOKED"));
    expect(dead.grant.state).toBe("REVOKED");
    expect(dead.intent.phase).toBe("CANCELLED");
    expect((await must<any>(r.store.endAuthority("request-1", "REVOKED"))).intent.revision).toBe(
      dead.intent.revision,
    );
  });

  it("racing writers serialize at the dispatch lock: one dispatch_ref, one winner for a retire-versus-dispatch race", async () => {
    const r = await ready();
    const both = await Promise.all([
      r.store.beginDispatch("request-1"),
      r.store.beginDispatch("request-1"),
      r.store.beginDispatch("request-1"),
    ]);
    expect(both.every((b) => b.ok)).toBe(true);
    expect(new Set(both.map((b) => (b as any).value.grant.dispatch_ref)).size).toBe(1);

    const racing = await ready();
    const [d, c] = await Promise.all([
      racing.store.beginDispatch("request-1"),
      racing.store.retire("request-1", "CANCELLED"),
    ]);
    const final = (await must<any>(racing.store.get("request-1"))).grant.state;
    // exactly one of the two decisions stands, and the store agrees with it
    expect(d.ok ? "DISPATCHING" : "REVOKED").toBe(final);
    expect(c.ok ? "REVOKED" : "DISPATCHING").toBe(final);
  });
});

describe("PendingActionGrantStore: corruption fails CLOSED and is never repaired", () => {
  it("a tampered, truncated or foreign record cannot be read, listed or used", async () => {
    const r = await ready();
    const file = join(r.dir, readdirSync(r.dir)[0]!);
    const original = readFileSync(file, "utf8");
    const env = JSON.parse(original);
    for (const [name, mutate] of Object.entries({
      "a field is edited": () => {
        env.record.intent.disclosure_delivered = false;
        env.record.intent.expires_at_ms = 99_999_999_999;
        return JSON.stringify(env);
      },
      truncated: () => original.slice(0, 40),
      "another store's format": () => JSON.stringify({ ...JSON.parse(original), format: "other" }),
    })) {
      writeFileSync(file, mutate());
      expect([name, await code(r.store.get("request-1"))]).toEqual([name, "PENDING_STORE"]);
      expect([name, await code(r.store.list())]).toEqual([name, "PENDING_STORE"]);
      expect([name, await code(r.store.beginDispatch("request-1"))]).toEqual([
        name,
        "PENDING_STORE",
      ]);
      expect([name, await code(r.store.endAuthority("request-1", "REVOKED"))]).toEqual([
        name,
        "PENDING_STORE",
      ]);
    }
    writeFileSync(file, original);
    expect(await code(r.store.get("request-1"))).toBe("OK");
  });

  it("the record schema itself refuses a grant that is not the intent's, drifting links, a widened binding and hash mismatches", async () => {
    const r = rig();
    const rec = await must<any>(r.store.intake(intake()));
    const parse = (v: unknown) => PendingActionRecordSchema.safeParse(v).success;
    expect(parse(rec)).toBe(true);
    const swapped = (grant: Record<string, unknown>) => ({
      ...rec,
      grant: { ...rec.grant, ...grant },
    });
    expect(parse(swapped({ client: "someone-else" }))).toBe(false);
    expect(parse(swapped({ request_id: "request-2" }))).toBe(false);
    expect(parse(swapped({ intent_hash: sha("0") }))).toBe(false);
    expect(parse(swapped({ scope_hash: sha("0") }))).toBe(false);
    expect(parse(swapped({ expires_at_ms: 9_999 }))).toBe(false);
    expect(parse(swapped({ revision: 3 }))).toBe(false);
    expect(parse(swapped({ dispatch_ref: "dispatch-x", state: "DISPATCHING" }))).toBe(false); // the intent does not carry it
    expect(parse(swapped({ state: "DISPATCHING" }))).toBe(false); // dispatching without a dispatch_ref
    expect(parse(swapped({ state: "CONSUMED" }))).toBe(false); // consumed without the intent and act
    expect(parse(swapped({ binding_hash: sha("1") }))).toBe(false); // a hash for no binding
    const bound = { ...rec, intent: { ...rec.intent, binding: binding({ amount: 99 }) } };
    expect(parse(bound)).toBe(false);
    expect(parse({ ...rec, intent: { ...rec.intent, phase: "PAUSED" } })).toBe(false); // a pause is exactly a PAUSED phase
    expect(parse({ ...rec, extra: true })).toBe(false);
  });

  it("a foreign campaign's record is refused", async () => {
    const a = rig();
    await must(a.store.intake(intake()));
    const b = new PendingActionGrantStore({
      campaignId: "another-campaign",
      dir: a.dir,
      macKey: a.macKey,
      now: () => 1_000,
      policy: { syntheticEvidence: "REQUIRE" },
    });
    expect(await code(b.get("request-1"))).toBe("PENDING_STORE");
  });
});

// -- the recovery table, row by row --------------------------------------------------------------------------------------------------
interface FactsOverride {
  readonly now?: number;
  readonly grant?: Partial<DelayedRecoveryFacts["grant"]>;
  readonly authority?: Partial<DelayedRecoveryFacts["authority"]>;
  readonly ledger?: Partial<DelayedRecoveryFacts["ledger"]>;
  readonly run?: Partial<DelayedRecoveryFacts["run"]>;
  readonly canonicalActId?: string | null;
}
const facts = (over: FactsOverride = {}): DelayedRecoveryFacts => ({
  now: over.now ?? 1_000,
  grant: {
    state: "DISPATCHING",
    dispatch_ref: "dispatch-1",
    run_ref: null,
    operator_intent_ref: null,
    act_id: null,
    expires_at_ms: 5_000,
    ...over.grant,
  },
  authority: { oauth: "ISSUED", liveContinuation: true, ...over.authority },
  ledger: {
    intact: true,
    withDispatchRef: 0,
    intentIdWithDispatchRef: null,
    openWithoutDispatchRef: false,
    ...over.ledger,
  },
  run: { recorded: false, process: "NONE", slotSettled: true, ...over.run },
  canonicalActId: over.canonicalActId ?? null,
});

describe("planDelayedRecovery: the companion's recovery table", () => {
  it("DISPATCHING, launch not recorded: a new qualifying live continuation before expiry resumes the SAME dispatch_ref; without one nothing launches", () => {
    expect(planDelayedRecovery(facts())).toEqual({
      action: "RESUME_SAME_DISPATCH",
      dispatch_ref: "dispatch-1",
      why: "LAUNCH_NOT_RECORDED",
    });
    expect(
      planDelayedRecovery(facts({ authority: { oauth: "ISSUED", liveContinuation: false } })),
    ).toEqual({
      action: "NO_LAUNCH",
      reason: "NO_LIVE_CONTINUATION",
    });
  });

  it("launch recorded with an active or unknown process: settle/reconcile that exact run, never start another or match by quantity", () => {
    for (const process of ["ACTIVE", "UNKNOWN"] as const)
      expect(
        planDelayedRecovery(
          facts({
            grant: { run_ref: "run-1" },
            run: { recorded: true, process, slotSettled: false },
          }),
        ),
      ).toEqual({ action: "RECONCILE_RUN", run_ref: "run-1" });
    expect(
      planDelayedRecovery(
        facts({ run: { recorded: true, process: "ACTIVE", slotSettled: false } }),
      ),
    ).toEqual({ action: "PAUSE", reason: "OUTCOME_UNKNOWN" }); // a run nobody recorded is not guessed at
  });

  it("a COLLECTION intent holds the dispatch_ref but the link/index is absent: rebuild ONLY from the exact dispatch_ref, then reconcile that intent", () => {
    const base = {
      grant: { run_ref: "run-1" },
      run: { recorded: true, process: "EXITED" as const, slotSettled: true },
      ledger: {
        intact: true,
        withDispatchRef: 1,
        intentIdWithDispatchRef: "operator-intent:u1",
        openWithoutDispatchRef: false,
      },
    };
    expect(planDelayedRecovery(facts(base))).toEqual({
      action: "REBUILD_LINK",
      operator_intent_ref: "operator-intent:u1",
    });
    expect(
      planDelayedRecovery(
        facts({ ...base, grant: { run_ref: "run-1", operator_intent_ref: "operator-intent:u1" } }),
      ),
    ).toEqual({ action: "RECONCILE_INTENT", operator_intent_ref: "operator-intent:u1" });
  });

  it("no retained intent and the original run PROVEN no-effect: the same dispatch_ref resumes; no-effect that cannot be proved is OUTCOME_UNKNOWN", () => {
    const exited = { recorded: true, process: "EXITED" as const, slotSettled: true };
    expect(planDelayedRecovery(facts({ grant: { run_ref: "run-1" }, run: exited }))).toEqual({
      action: "RESUME_SAME_DISPATCH",
      dispatch_ref: "dispatch-1",
      why: "PROVEN_NO_EFFECT",
    });
    // each missing fact of the no-effect predicate defeats it
    const unproved: FactsOverride[] = [
      { run: { recorded: true, process: "ACTIVE", slotSettled: true } }, // still active
      { run: { recorded: true, process: "EXITED", slotSettled: false } }, // recovery slot unresolved
      { run: { recorded: true, process: "NONE", slotSettled: true } }, // lost response / no process proof
      {
        ledger: {
          intact: false,
          withDispatchRef: 0,
          intentIdWithDispatchRef: null,
          openWithoutDispatchRef: false,
        },
      },
    ];
    for (const over of unproved) {
      const plan = planDelayedRecovery(
        facts({ grant: { run_ref: "run-1" }, run: exited, ...over }),
      );
      expect(plan.action === "RESUME_SAME_DISPATCH").toBe(false);
    }
    expect(
      planDelayedRecovery(
        facts({
          grant: { run_ref: "run-1" },
          run: { recorded: true, process: "NONE", slotSettled: true },
        }),
      ),
    ).toEqual({ action: "PAUSE", reason: "OUTCOME_UNKNOWN" });
  });

  it("an intent without this dispatch_ref (a legacy orphan) is never adopted by shape: OUTCOME_UNKNOWN", () => {
    const exited = { recorded: true, process: "EXITED" as const, slotSettled: true };
    expect(
      planDelayedRecovery(
        facts({
          grant: { run_ref: "run-1" },
          run: exited,
          ledger: {
            intact: true,
            withDispatchRef: 0,
            intentIdWithDispatchRef: null,
            openWithoutDispatchRef: true,
          },
        }),
      ),
    ).toEqual({ action: "PAUSE", reason: "OUTCOME_UNKNOWN" });
    // before any launch, an open unrelated attempt makes the collect impossible: ANOTHER_ACT_OPEN
    expect(
      planDelayedRecovery(
        facts({
          ledger: {
            intact: true,
            withDispatchRef: 0,
            intentIdWithDispatchRef: null,
            openWithoutDispatchRef: true,
          },
        }),
      ),
    ).toEqual({ action: "PAUSE", reason: "ANOTHER_ACT_OPEN" });
  });

  it("a canonical act exists for the linked intent: bind its REAL act_id and never allocate another; old authority only stops new continuation", () => {
    expect(planDelayedRecovery(facts({ canonicalActId: "act-1" }))).toEqual({
      action: "BIND_ACT",
      act_id: "act-1",
      continue_authorized: true,
    });
    for (const authority of [
      { oauth: "REVOKED" as const, liveContinuation: true },
      { oauth: "ISSUED" as const, liveContinuation: false },
      { oauth: "UNAVAILABLE" as const, liveContinuation: true },
    ])
      expect(planDelayedRecovery(facts({ canonicalActId: "act-1", authority }))).toEqual({
        action: "BIND_ACT",
        act_id: "act-1",
        continue_authorized: false,
      });
    const expired = facts({ canonicalActId: "act-1" });
    expect(planDelayedRecovery({ ...expired, now: 6_000 })).toMatchObject({
      continue_authorized: false,
    });
  });

  it("a revoked or expired grant with no act committed does not launch and keeps its tombstone", () => {
    for (const state of ["REVOKED", "EXPIRED", "REPLACED"] as const)
      expect(planDelayedRecovery(facts({ grant: { state } })).action).toBe("NO_LAUNCH");
    expect(
      planDelayedRecovery(facts({ authority: { oauth: "REVOKED", liveContinuation: true } })),
    ).toEqual({
      action: "NO_LAUNCH",
      reason: "REVOKED",
    });
    expect(planDelayedRecovery({ ...facts(), now: 5_000 })).toEqual({
      action: "NO_LAUNCH",
      reason: "EXPIRED",
    });
    expect(
      planDelayedRecovery(facts({ authority: { oauth: "UNAVAILABLE", liveContinuation: true } })),
    ).toEqual({
      action: "NO_LAUNCH",
      reason: "AUTHORITY_UNAVAILABLE",
    });
    expect(
      planDelayedRecovery(facts({ authority: { oauth: "UNKNOWN", liveContinuation: true } })),
    ).toEqual({
      action: "NO_LAUNCH",
      reason: "REVOKED",
    });
  });

  it("an unreadable ledger proves nothing about a dispatch that may have had an effect", () => {
    const ledger = {
      intact: false,
      withDispatchRef: 0,
      intentIdWithDispatchRef: null,
      openWithoutDispatchRef: false,
    };
    expect(
      planDelayedRecovery(
        facts({
          grant: { run_ref: "run-1" },
          run: { recorded: true, process: "EXITED", slotSettled: true },
          ledger,
        }),
      ),
    ).toEqual({ action: "PAUSE", reason: "OUTCOME_UNKNOWN" });
    // two retained intents under one dispatch_ref cannot exist; if they do, nothing is guessed
    expect(
      planDelayedRecovery(
        facts({
          ledger: {
            intact: true,
            withDispatchRef: 2,
            intentIdWithDispatchRef: "x",
            openWithoutDispatchRef: false,
          },
        }),
      ),
    ).toEqual({ action: "PAUSE", reason: "OUTCOME_UNKNOWN" });
  });

  it("a freshly issued grant begins its dispatch only with current authority and a live continuation", () => {
    expect(planDelayedRecovery(facts({ grant: { state: "ISSUED", dispatch_ref: null } }))).toEqual({
      action: "BEGIN_DISPATCH",
    });
    expect(
      planDelayedRecovery(
        facts({
          grant: { state: "ISSUED", dispatch_ref: null },
          authority: { oauth: "ISSUED", liveContinuation: false },
        }),
      ).action,
    ).toBe("NO_LAUNCH");
  });
});
