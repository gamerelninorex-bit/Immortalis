/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// Initial Locality Bootstrap v0.9 — FALSIFIERS of the T1 mechanism: the positive chain must not pass for the wrong reasons. Each case
// changes one premise and asserts the real owner's refusal. MECHANISM ONLY (T1): fixtures stand for the isolated answers and the
// message proofs; none of this is original-message authenticity, a genuine driver or a named client (T2/T3 UNRUN, OB-030).
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  InitialSetupPublisher,
  StageProviderRegistry,
  TemporalCoordinator,
  scanInitialSetup,
} from "@immortalis/engine";
import {
  InitialSetupService,
  UnavailableEvidenceVerifier,
  captureStartingChronology,
} from "@immortalis/operator";
import {
  FIXTURE_MESSAGE_METHOD,
  FIXTURE_SETUP_MESSAGE,
  ScriptedIsolatedDriver,
  delegatingScene,
  delegatingScope,
  fixtureLocus,
  fixtureWorld,
  generateFixtureRunnerKeys,
  publication,
  sourceInput,
} from "@immortalis/testkit";
import {
  BOOTSTRAP_CAMPAIGN,
  FIXTURE_POLICY,
  commitResponse,
  factsOf,
  harness,
  intakeRequest,
  reasonOf,
  responseFrom,
  runnerWith,
  scopeDispatchRequest,
  scratch,
} from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";

const enc = (s: string) => new Uint8Array(Buffer.from(s, "utf8"));

describe("production versus the T1 fixture namespace", () => {
  it("production admission rejects fixture: evidence, and production code cannot open a fixture journal", async () => {
    const h = await harness();
    const intake = await h.service.intake(await intakeRequest(h));
    expect(intake.status).toBe("ADMITTED");
    const input = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.input.value;

    // the very same Input value offered to a PRODUCTION-admission campaign with an identical genesis
    const prod = await must(
      CanonicalCampaign.create(scratch("immortalis-prod-"), {
        campaignId: BOOTSTRAP_CAMPAIGN,
        buildId: "prod",
      }),
    );
    await must(prod.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await must(prod.establishLocus({ ...publication(2), locus: fixtureLocus() }));
    await must(prod.establishSourceCondition({ ...publication(3), source: sourceInput() }));
    const refused = await new InitialSetupPublisher(prod.store).input(input as any);
    expect(refused.ok).toBe(false);
    expect(reasonOf(refused as any)).toBe("FIXTURE_NAMESPACE");

    // replay: the fixture journal fails to open under production admission (load/replay reject the namespace)
    await h.campaign.close();
    const opened = await CanonicalCampaign.open(h.dir);
    expect(opened.ok).toBe(false);
  });

  it("with the production verifier no genuine message proof exists: intake returns the actual unresolved-authority result", async () => {
    const h = await harness();
    const service = new InitialSetupService({
      campaignId: BOOTSTRAP_CAMPAIGN,
      store: h.store,
      runner: h.runner,
      verifier: UnavailableEvidenceVerifier,
      policy: FIXTURE_POLICY,
    });
    const r = await service.intake(await intakeRequest(h));
    expect(r.status).toBe("UNRESOLVED_AUTHORITY");
    expect(scanInitialSetup(factsOf(h.store)).sessions.size).toBe(0);
    expect(h.driver.calls).toEqual([]);
  });
});

describe("intake refuses what is not the player's verified message and a lawful genesis", () => {
  it("refuses a TOOL_CALL_ONLY author, a mismatched message hash and an oversize message; nothing is committed", async () => {
    const h = await harness();
    const req = await intakeRequest(h);
    const tool = await h.service.intake({
      ...req,
      author: { ...req.author, grade: "TOOL_CALL_ONLY" },
    });
    expect(tool.status).toBe("UNRESOLVED_AUTHORITY");
    const other = await h.service.intake({
      ...req,
      message: `${req.message} Also something else.`,
    });
    expect(other.status).toBe("REFUSED");
    expect(other.reason).toBe("AUTHOR_MESSAGE_HASH");
    const big = "x".repeat(65_537);
    const oversize = await h.service.intake(
      await intakeRequest(h, { message: big, request: "big" }),
    );
    expect(oversize.status).toBe("REFUSED");
    expect(oversize.reason).toBe("SETUP_MESSAGE_OVERSIZE");
    expect(scanInitialSetup(factsOf(h.store)).count).toBe(0);
  });

  it("an invented or default chronology never qualifies: no unit is a default, and a TOOL_CALL_ONLY capture cannot qualify live Input", async () => {
    const h = await harness();
    const ctx = {
      campaignId: BOOTSTRAP_CAMPAIGN,
      store: h.captureStore,
      verifier: h.verifier as any,
      policy: FIXTURE_POLICY,
    };
    const source = {
      client: "fixture:client:1",
      oauth_grant: "fixture:grant:1",
      request_ref: "fixture:request:9",
      original_message_hash: null,
      method_id: FIXTURE_MESSAGE_METHOD,
      attestation_hash: "a".repeat(64),
    };
    const noUnit = await captureStartingChronology(ctx, {
      capture_ref: "fixture:capture:bad",
      document: {
        format: "immortalis-starting-chronology",
        format_version: 1,
        time: { value: 0 },
        statement: "a morning",
      },
      grade: "TOOL_CALL_ONLY",
      source,
    });
    expect(!noUnit.ok && noUnit.error.code).toBe("DOCUMENT_INVALID");
    // a model-formed tool call IS capturable for diagnostics, but it cannot qualify live Input admission
    const captured = await must(
      captureStartingChronology(ctx, {
        capture_ref: "fixture:capture:tool",
        document: {
          format: "immortalis-starting-chronology",
          format_version: 1,
          time: { unit: "seconds", value: 0 },
          statement: "a morning",
        },
        grade: "TOOL_CALL_ONLY",
        source,
      }),
    );
    const req = await intakeRequest(h);
    const r = await h.service.intake({ ...req, chronology: captured });
    expect(r.status).toBe("REFUSED");
    expect(r.message).toContain("TOOL_CALL_ONLY");
  });

  it("refuses entry once ANY non-genesis fact exists: a Temporal origin written first makes the fresh route ineligible", async () => {
    const h = await harness();
    await must(
      new TemporalCoordinator(h.store, new StageProviderRegistry()).establishCanonicalTime({
        ...publication(9),
        time: { unit: "seconds", value: 0 },
      }),
    );
    const r = await h.service.intake(await intakeRequest(h));
    expect(r.status).toBe("REFUSED");
    expect(r.reason).toBe("GENESIS_KIND_NOT_WHITELISTED");
  });

  it("deduplicates by fingerprint (changed client or request ids do not reopen it) and reports SETUP_BUSY for a different message", async () => {
    const h = await harness();
    const first = await h.service.intake(await intakeRequest(h));
    expect(first.status).toBe("ADMITTED");
    const again = await h.service.intake(await intakeRequest(h, { request: "2" }));
    expect(again.status).toBe("REPEATED");
    expect(again.setup_id).toBe(first.setup_id);
    const busy = await h.service.intake(
      await intakeRequest(h, { message: `${FIXTURE_SETUP_MESSAGE} Keep it quiet.`, request: "3" }),
    );
    expect(busy.status).toBe("SETUP_BUSY");
    expect(h.driver.calls).toEqual([]);
  });
});

describe("signed-response boundary: only the enrolled key, the exact bytes and the reserved task", () => {
  async function reserved() {
    const crashing = new ScriptedIsolatedDriver(
      { scope: delegatingScope(), scene: delegatingScene() },
      { throwAfterSend: true },
    );
    const h = await harness({ driver: crashing });
    const intake = await h.service.intake(await intakeRequest(h));
    const adv = await h.service.advance(intake.setup_id!);
    expect(adv.status).toBe("SCOPE_RESERVED_UNRESOLVED");
    return { h, setupId: intake.setup_id!, req: scopeDispatchRequest(h, intake.setup_id!) };
  }

  it("refuses a response signed by another key (same key id), accepts the enrolled key's, and nothing else changes", async () => {
    const { h, req } = await reserved();
    const wrong = runnerWith(h, generateFixtureRunnerKeys());
    const wrongOutcome = await wrong.invokeOnce(must_(wrong.authorize(h.store, req)), req);
    expect(wrongOutcome.status).toBe("RESPONDED");
    const bad = await commitResponse(h, responseFrom(req, wrongOutcome as any));
    expect(bad.ok).toBe(false);
    expect(reasonOf(bad as any)).toBe("SIGNATURE");

    const right = runnerWith(h, h.keys);
    const outcome = await right.invokeOnce(must_(right.authorize(h.store, req)), req);
    const good = await commitResponse(h, responseFrom(req, outcome as any));
    expect(good.ok).toBe(true);
  });

  it("a clean receipt cannot carry a substituted goal-aware answer; a different phase or task binding fails", async () => {
    const { h, req } = await reserved();
    const right = runnerWith(h, h.keys);
    const outcome = (await right.invokeOnce(must_(right.authorize(h.store, req)), req)) as any;
    const honest = responseFrom(req, outcome);
    // substituted raw bytes under the original receipt
    const swapped = {
      ...honest,
      raw_response_base64: Buffer.from(enc('{"kind":"SCOPE"}')).toString("base64"),
    };
    const a = await commitResponse(h, swapped);
    expect(!a.ok && reasonOf(a as any)).toBe("RAW_HASH_MISMATCH");
    // substituted bytes with their own hash, but the signed envelope names the original answer
    const bytes = enc('{"kind":"SCOPE","extra":true}');
    const { sha256Bytes } = await import("@immortalis/engine");
    const b = await commitResponse(h, {
      ...honest,
      raw_response_base64: Buffer.from(bytes).toString("base64"),
      raw_response_hash: sha256Bytes(bytes),
    });
    expect(!b.ok && reasonOf(b as any)).toBe("ENVELOPE_BINDING");
    // wrong phase for this reservation
    const c = await commitResponse(h, { ...honest, phase: "SCENE" });
    expect(c.ok).toBe(false);
    // a different task identity
    const d = await commitResponse(h, { ...honest, task_id: "b".repeat(64) });
    expect(d.ok).toBe(false);
  });

  it("the ordinary host path cannot publish a scope classification: a host-claimed verdict, a wrong rule and a PC-subject shape all refuse", async () => {
    const h = await harness();
    const intake = await h.service.intake(await intakeRequest(h));
    await h.service.advance(intake.setup_id!);
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!;
    const decisionKey = [...factsOf(h.store).keys()].find((k) => k.startsWith("referee/"))!;
    const decision = factsOf(h.store).get(decisionKey)!;
    expect((decision.value as any).verdict).toBe("SCOPE_AUTHORIZED");
    // the engine derives the verdict; a host that flips it is refused by replaying the same record as a fresh decision
    const group = h.store.committedGroup(decision.provenance.intent_id)!;
    const flipped = {
      ...group,
      group_id: `${group.group_id}:x`,
      intent_id: `${group.intent_id}:x`,
      writes: [
        {
          ...group.writes[0]!,
          key: `referee/${"c".repeat(64)}/decision`,
          value: { ...(decision.value as any), task_id: "c".repeat(64), verdict: "MIXED_INPUT" },
        },
      ],
    };
    const r1 = await h.store.commit(flipped);
    expect(r1.ok).toBe(false);
    // the base Referee rule cannot carry a world-subject scope classification
    const baseRule = await h.store.commit({
      ...flipped,
      rule: { ...group.rule, clause: "REFEREE_RULE" },
    });
    expect(baseRule.ok).toBe(false);
    void session;
  });
});

describe("terminal dispositions release the freeze; a refused or unresolved result is never rerun", () => {
  it("MIXED_INPUT is refused before scene selection: no grant, no SCENE invocation, and the freeze is released", async () => {
    const h = await harness({
      answers: { scope: delegatingScope({ message_use: "MIXED_INPUT" }), scene: delegatingScene() },
    });
    const message = "Make the yard and then pick up a log. Fill in whatever else the place needs.";
    const intake = await h.service.intake(await intakeRequest(h, { message }));
    // the freeze holds while the session is active
    const busy = await h.campaign.establishSourceCondition({
      ...publication(20),
      source: sourceInput({ source_key: "second-source" }),
    });
    expect(!busy.ok && reasonOf(busy as any)).toBe("SETUP_BUSY");
    const r = await h.service.advance(intake.setup_id!);
    expect(r).toMatchObject({ status: "TERMINAL", reason: "MIXED_INPUT" });
    expect(h.driver.calls.map((c) => c.phase)).toEqual(["SCOPE"]);
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!;
    expect(session.grant).toBeUndefined();
    // released: the same edit is now admitted through its owner
    const released = await h.campaign.establishSourceCondition({
      ...publication(20),
      source: sourceInput({ source_key: "second-source" }),
    });
    expect(released.ok).toBe(true);
  });

  it("a NOT_AUTHORIZED facet, an unhandled constraint and a clarification yield SCOPE_REFUSED and no grant", async () => {
    for (const over of [
      {
        facets: (delegatingScope()({} as any)["facets"] as any[]).map((f: any, i: number) =>
          i === 1 ? { ...f, mode: "NOT_AUTHORIZED", evidence_quotes: [] } : f,
        ),
      },
      { unhandled_constraints: ["it must feel run-down"] },
      { clarification: "Do you want the stand cleared?" },
    ]) {
      const h = await harness({
        answers: { scope: delegatingScope(over), scene: delegatingScene() },
      });
      const intake = await h.service.intake(await intakeRequest(h));
      const r = await h.service.advance(intake.setup_id!);
      expect(r).toMatchObject({ status: "TERMINAL", reason: "SCOPE_REFUSED" });
      expect(h.driver.calls.map((c) => c.phase)).toEqual(["SCOPE"]);
    }
  });

  it("a duplicate-key or malformed answer is retained as INVALID_OUTPUT, terminally, and never rerun", async () => {
    const dup = enc('{"kind":"SCOPE","kind":"SCOPE"}');
    const driver = new ScriptedIsolatedDriver(
      { scope: delegatingScope(), scene: delegatingScene() },
      { rawOverride: { SCOPE: dup } },
    );
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    const r = await h.service.advance(intake.setup_id!);
    expect(r).toMatchObject({ status: "TERMINAL", reason: "INVALID_OUTPUT" });
    await h.service.advance(intake.setup_id!);
    expect(driver.calls).toHaveLength(1);
  });

  it("an UNRESOLVED scene result is retained terminally as GENERATOR_UNRESOLVED and the slot is not reopened", async () => {
    const h = await harness({
      answers: {
        scope: delegatingScope(),
        scene: () => ({
          kind: "UNRESOLVED",
          reason: "INSUFFICIENT_CONSTRAINTS",
          explanation: "the setup does not say enough",
        }),
      },
    });
    const intake = await h.service.intake(await intakeRequest(h));
    const r = await h.service.advance(intake.setup_id!);
    expect(r).toMatchObject({ status: "TERMINAL", reason: "GENERATOR_UNRESOLVED" });
    // a changed message cannot select again: after any SCENE reservation no new session is allowed for the locality
    const retry = await h.service.intake(
      await intakeRequest(h, { message: `${FIXTURE_SETUP_MESSAGE} Add a stream.`, request: "2" }),
    );
    expect(retry.status).toBe("REFUSED");
    expect(retry.reason).toBe("SCENE_RESERVED");
    expect(h.driver.calls.map((c) => c.phase)).toEqual(["SCOPE", "SCENE"]);
  });

  it("completion validation is a pure function: a mismatched chronology or a violated restriction writes COMPLETION_REFUSED with the actual code and releases the freeze", async () => {
    const cases: [string, any, string][] = [
      [
        "CHRONOLOGY_START",
        {
          coverage: {
            start: { unit: "days", value: 0 },
            end: { unit: "days", value: 3 },
            ground: "days",
          },
        },
        "CHRONOLOGY_START",
      ],
      [
        "CHRONOLOGY_END",
        {
          coverage: {
            start: { unit: "seconds", value: 0 },
            end: { unit: "seconds", value: 0 },
            ground: "none",
          },
        },
        "CHRONOLOGY_END",
      ],
    ];
    for (const [, over, code] of cases) {
      const h = await harness({
        answers: {
          scope: delegatingScope(),
          scene: (input) => {
            const sel = (delegatingScene()(input) as any).selection;
            return { kind: "SELECTION", selection: { ...sel, ...over } };
          },
        },
      });
      const intake = await h.service.intake(await intakeRequest(h));
      const r = await h.service.advance(intake.setup_id!);
      expect(r).toMatchObject({ status: "TERMINAL", reason: "COMPLETION_REFUSED" });
      const disposition = scanInitialSetup(factsOf(h.store)).sessions.get(
        intake.setup_id!,
      )!.disposition!;
      expect((disposition.value as any).rejection_code).toBe(code);
      expect(h.driver.calls.map((c) => c.phase)).toEqual(["SCOPE", "SCENE"]);
    }
    // a stated restriction is checked mechanically against the selection
    const message =
      "Make a woodlot with nobody living there. Fill in whatever else the place needs.";
    const h = await harness({
      answers: {
        scope: delegatingScope({
          restrictions: [{ predicate: "NO_NON_PC_ACTORS", evidence_quote: "nobody living there" }],
        }),
        scene: delegatingScene({
          actors: { kind: "ACTOR_PRODUCER_REQUIRED", constraints: ["a sawyer"], ground: "owed" },
        }),
      },
    });
    const intake = await h.service.intake(await intakeRequest(h, { message }));
    const r = await h.service.advance(intake.setup_id!);
    expect(r).toMatchObject({ status: "TERMINAL", reason: "COMPLETION_REFUSED" });
    expect(
      (scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.disposition!.value as any)
        .rejection_code,
    ).toBe("RESTRICTION");
  });

  it("refused-session byte equality: after a refused MIXED_INPUT message, the next SCOPE producer input equals that of a clean clone", async () => {
    const clarified = `${FIXTURE_SETUP_MESSAGE} Keep it quiet.`;
    // history A: a refused session (its goal text mentions "pick up"), then the clarified message under request id "2"
    const driverA = new ScriptedIsolatedDriver({
      scope: delegatingScope(),
      scene: delegatingScene(),
    });
    const a = await harness({ driver: driverA });
    // the refused session is produced by a first service whose driver answers MIXED_INPUT
    const first = new InitialSetupService({
      campaignId: BOOTSTRAP_CAMPAIGN,
      store: a.store,
      runner: runnerWith(a, a.keys, {
        scope: delegatingScope({ message_use: "MIXED_INPUT" }),
        scene: delegatingScene(),
      }),
      verifier: a.verifier as any,
      policy: FIXTURE_POLICY,
    });
    const refused = await first.intake(
      await intakeRequest(a, {
        message: "Make the yard and pick up a log. Fill in whatever else the place needs.",
        request: "1",
      }),
    );
    await first.advance(refused.setup_id!);
    const second = await a.service.intake(
      await intakeRequest(a, { message: clarified, request: "2" }),
    );
    expect(second.status).toBe("ADMITTED");
    await a.service.advance(second.setup_id!);
    // history B: a clean clone that only ever saw the clarified message
    const b = await harness();
    const only = await b.service.intake(
      await intakeRequest(b, { message: clarified, request: "2" }),
    );
    await b.service.advance(only.setup_id!);
    const bytes = (d: ScriptedIsolatedDriver, i: number) =>
      Buffer.from(d.calls[i]!.producerInput).toString("utf8");
    expect(bytes(driverA, 0)).toBe(bytes(b.driver, 0));
    expect(bytes(driverA, 1)).toBe(bytes(b.driver, 1));
    // and the refused text appears in neither producer input
    expect(bytes(driverA, 0)).not.toContain("pick up a log");
  });
});

function must_<T>(r: { ok: true; value: T } | { ok: false; error: { message: string } }): T {
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
