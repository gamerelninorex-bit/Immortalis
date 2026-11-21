/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// F-014B A1-1 — characterization of the EXISTING chronology-capture law (CORE_V9 as built before the version 2 arm), recast from the Builder's
// reference draft as new reviewed tests. T1 MECHANISM ONLY: fixtures stand for message proofs and isolated answers; nothing here is original-message
// authenticity, a genuine driver, a named client or a production result. These tests call public exports only and must pass unchanged on the
// version 1 path before and after the version 2 arm exists.
//
//   A1-C01  the chronology half can be operator-confirmed; Input.author cannot (existing law)
//   A1-C02  the origin coordinate is authored, copied through the chain, and independent of the wall clock
//   A1-C03  no shipped host reaches the captured route (closed census of the production files that name its entry points)
//   A1-C04  the natural-chat chronology tool path is version 1 only and cannot state a scale
//   A1-C05  a confirmation token is bound to its verb and its exact subject
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ChronologyDocumentSchema, TEMPORAL_STATE_KEY } from "@immortalis/contracts";
import {
  InitialSetupPublisher,
  PRODUCTION_INITIAL_SETUP_POLICY,
  chronologyEvidenceViolation,
  initializeCapturedChronology,
  scanInitialSetup,
} from "@immortalis/engine";
import {
  ChronologyCaptureStore,
  UnavailableEvidenceVerifier,
  captureStartingChronology,
  consumeConfirmation,
  requestOperatorConfirmation,
  subjectOf,
} from "@immortalis/operator";
import { FIXTURE_MESSAGE_METHOD } from "@immortalis/testkit";
import {
  CHRONOLOGY_DOC,
  FIXTURE_POLICY,
  factsOf,
  harness,
  intakeRequest,
  openFixtureCampaign,
  reasonOf,
  scratch,
} from "../support/initial-setup.ts";
import { operatorSource, scriptedConsole } from "../support/operator-capture.ts";
import { must } from "../support/temporal.ts";
import { chronologyDocument, parseChronology } from "../../apps/phone/src/route-stages.ts";

const OP = "OPERATOR_CONFIRMED_RECORD_ONLY" as const;

describe("A1-C01 [mechanism only] the chronology can be operator-confirmed; Input.author cannot (existing law)", () => {
  it("A1-C01 [mechanism only] an operator-confirmed capture is shown whole once, stored, and judged a qualifying chronology by the engine", async () => {
    const h = await harness();
    const term = scriptedConsole("confirm");
    const ctx = {
      campaignId: h.campaignId,
      store: h.captureStore,
      verifier: h.verifier as any,
      policy: FIXTURE_POLICY,
      terminal: term,
    };
    const cap = await must(
      captureStartingChronology(ctx, {
        capture_ref: "fixture:capture:op",
        document: CHRONOLOGY_DOC,
        grade: OP,
        source: operatorSource(FIXTURE_MESSAGE_METHOD),
      }),
    );
    expect(cap.grade).toBe(OP);
    // the WHOLE document (its statement) was shown to the operator console before the confirmation was consumed
    expect(term.said.some((l) => l.includes(JSON.stringify(CHRONOLOGY_DOC.statement)))).toBe(true);
    const stored = await h.captureStore.read("fixture:capture:op");
    expect(stored.ok && stored.value?.capture_hash).toBe(cap.capture_hash);
    // the engine judges the chronology grade qualifying; TOOL_CALL_ONLY is the one-change control that is not
    expect(chronologyEvidenceViolation(cap, h.campaignId)).toBeNull();
    expect(
      chronologyEvidenceViolation({ ...cap, grade: "TOOL_CALL_ONLY" }, h.campaignId)?.reason,
    ).toBe("CHRONOLOGY_GRADE");
  });

  it("A1-C01 [mechanism only] one change from the accepted control each: a declining console records nothing; no console is an unresolved authority", async () => {
    const h = await harness();
    const base = {
      campaignId: h.campaignId,
      store: h.captureStore,
      verifier: h.verifier as any,
      policy: FIXTURE_POLICY,
    };
    const request = {
      capture_ref: "fixture:capture:op2",
      document: CHRONOLOGY_DOC,
      grade: OP,
      source: operatorSource(FIXTURE_MESSAGE_METHOD),
    };
    const declined = await captureStartingChronology(
      { ...base, terminal: scriptedConsole("decline") },
      request,
    );
    expect(!declined.ok && declined.error.code).toBe("DECLINED");
    const none = await captureStartingChronology(base, request);
    expect(!none.ok && none.error.code).toBe("UNRESOLVED_AUTHORITY");
    const all = await h.captureStore.all();
    expect(all.ok && all.value).toEqual([]);
    // control: the same request with a confirming console is stored
    await must(
      captureStartingChronology({ ...base, terminal: scriptedConsole("confirm") }, request),
    );
    const after = await h.captureStore.all();
    expect(after.ok && after.value.length).toBe(1);
  });

  it("A1-C01 [mechanism only] the production policy already mints the operator-confirmed capture and still cannot mint an original-message one", async () => {
    const store = new ChronologyCaptureStore({
      dir: scratch("immortalis-a1c01-"),
      macKey: randomBytes(32),
    });
    const ctx = {
      campaignId: "campaign-x",
      store,
      verifier: UnavailableEvidenceVerifier,
      policy: PRODUCTION_INITIAL_SETUP_POLICY,
      terminal: scriptedConsole("confirm"),
    };
    const op = await captureStartingChronology(ctx, {
      capture_ref: "cap-op-1",
      document: CHRONOLOGY_DOC,
      grade: OP,
      source: operatorSource("operator-console-1"),
    });
    expect(op.ok).toBe(true); // control: the chronology half works under the production policy
    const fixtureMethod = await captureStartingChronology(ctx, {
      capture_ref: "cap-op-2",
      document: { ...CHRONOLOGY_DOC, statement: "another morning" },
      grade: OP,
      source: operatorSource(FIXTURE_MESSAGE_METHOD), // one change: the reserved synthetic namespace
    });
    expect(!fixtureMethod.ok && fixtureMethod.error.code).toBe("RESERVED_NAMESPACE");
    const original = await captureStartingChronology(ctx, {
      capture_ref: "cap-om-1",
      document: { ...CHRONOLOGY_DOC, statement: "a third morning" },
      grade: "ORIGINAL_MESSAGE_VERIFIED", // one change: the grade that needs the (unbuilt) original-message intake
      source: { ...operatorSource("operator-console-1"), original_message_hash: "b".repeat(64) },
    });
    expect(!original.ok && original.error.code).toBe("UNRESOLVED_AUTHORITY");
  });

  it("A1-C01 [mechanism only] the same operator-confirmed chronology is accepted with a verified author and refused with an operator-confirmed author, at the service and at the engine", async () => {
    const okH = await harness();
    const cap = await must(
      captureStartingChronology(
        {
          campaignId: okH.campaignId,
          store: okH.captureStore,
          verifier: okH.verifier as any,
          policy: FIXTURE_POLICY,
          terminal: scriptedConsole("confirm"),
        },
        {
          capture_ref: "fixture:capture:op3",
          document: CHRONOLOGY_DOC,
          grade: OP,
          source: operatorSource(FIXTURE_MESSAGE_METHOD),
        },
      ),
    );
    const req = await intakeRequest(okH);
    const accepted = await okH.service.intake({ ...req, chronology: cap });
    expect(accepted.status).toBe("ADMITTED"); // control: the chronology grade alone does not block the Input

    // negative at the operator service: only the author grade changed
    const badH = await harness();
    const badReq = await intakeRequest(badH);
    const refused = await badH.service.intake({
      ...badReq,
      chronology: cap,
      author: { ...badReq.author, grade: OP },
    });
    expect(refused.status).toBe("UNRESOLVED_AUTHORITY");
    expect(scanInitialSetup(factsOf(badH.store)).count).toBe(0);

    // negative at the ENGINE admission, independent of the service: the committed Input value with only author.grade changed
    const value = scanInitialSetup(factsOf(okH.store)).sessions.get(accepted.setup_id!)!.input
      .value as any;
    const fresh = await openFixtureCampaign();
    const publisher = new InitialSetupPublisher(fresh.campaign.store);
    const engineRefusal = await publisher.input({
      ...value,
      author: { ...value.author, grade: OP },
    });
    expect(engineRefusal.ok).toBe(false);
    expect(reasonOf(engineRefusal as any)).toBe("AUTHOR_GRADE");
    const engineControl = await publisher.input(value); // the unmodified committed value is admitted by an identical genesis
    expect(engineControl.ok).toBe(true);
  });
});

describe("A1-C02 [mechanism only] the origin coordinate is authored and independent of the wall clock", () => {
  async function originAt(iso: string, doc: typeof CHRONOLOGY_DOC | Record<string, unknown>) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    try {
      const h = await harness();
      const intake = await h.service.intake(await intakeRequest(h, { doc }));
      expect(intake.status).toBe("ADMITTED");
      expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
      await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
      const f = h.store.getFact(TEMPORAL_STATE_KEY)!;
      return { time: (f.value as any).canonical_time, group: f.provenance.group_id };
    } finally {
      vi.useRealTimers();
    }
  }

  it("A1-C02 [mechanism only] two system clocks decades apart give the same coordinate and publication identity; a different authored value differs", async () => {
    const early = await originAt("2001-02-03T04:05:06.000Z", CHRONOLOGY_DOC);
    const late = await originAt("2049-11-30T23:59:59.000Z", CHRONOLOGY_DOC);
    expect(early.time).toEqual(CHRONOLOGY_DOC.time);
    expect(late).toEqual(early);
    // control: the ONE changed input is the authored coordinate
    const other = await originAt("2001-02-03T04:05:06.000Z", {
      ...CHRONOLOGY_DOC,
      time: { unit: "seconds", value: 5 },
    });
    expect(other.time).toEqual({ unit: "seconds", value: 5 });
    expect(other.group).not.toBe(early.group);
  });
});

describe("A1-C03 [mechanism only] no shipped host reaches the captured route (closed census of production files)", () => {
  const ENTRY =
    /\b(InitialSetupService|MsInitialActorService|ChronologyCaptureStore|PrivateRunner|MsActorRunner|captureStartingChronology|initializeCapturedChronology|verifyCaptureForIntake)\b/;
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.name === "node_modules"
        ? []
        : e.isDirectory()
          ? walk(join(dir, e.name))
          : e.name.endsWith(".ts")
            ? [join(dir, e.name)]
            : [],
    );

  it("A1-C03 [mechanism only] only the defining and orchestrating modules name the entry points: no apps/ file, no CLI, no bin", () => {
    const named = ["apps", "packages", "tools"]
      .flatMap(walk)
      .filter((f) => !f.startsWith("packages/testkit/") && ENTRY.test(readFileSync(f, "utf8")))
      .sort();
    // the seventh is the F-014B A0 OB-030 measurement harness, a declared non-package file that only calls the writer to seed fixture journals
    expect(named).toEqual([
      "packages/engine/src/temporal/captured-chronology.ts",
      "packages/operator/src/chronology-capture.ts",
      "packages/operator/src/initial-runner.ts",
      "packages/operator/src/initial-setup.ts",
      "packages/operator/src/ms-actor-runner.ts",
      "packages/operator/src/ms-initial-actor.ts",
      "tools/a0-ob030-benchmark.ts",
    ]);
    // the scanner is not vacuous: it flags a synthetic host wiring (mutation) and finds the real definer (control)
    expect(ENTRY.test("const s = new InitialSetupService(deps);")).toBe(true);
    expect(ENTRY.test(readFileSync("packages/operator/src/initial-setup.ts", "utf8"))).toBe(true);
    expect(ENTRY.test(readFileSync("apps/phone/src/server.ts", "utf8"))).toBe(false);
  });

  it("A1-C03 [mechanism only] exactly one production implementation of each original-message verifier exists, and each refuses", async () => {
    const impl = ["apps", "packages", "tools"]
      .flatMap(walk)
      .filter((f) => !f.startsWith("packages/testkit/"))
      .filter((f) =>
        /verifyOriginalMessage\s*:\s*async|\bverify:\s*async/.test(readFileSync(f, "utf8")),
      )
      .sort();
    expect(impl).toEqual([
      "apps/phone/src/pending-action.ts",
      "packages/operator/src/chronology-capture.ts",
    ]);
    expect(
      await UnavailableEvidenceVerifier.verifyOriginalMessage({
        method_id: "any",
        client: "c",
        oauth_grant: "g",
        request_ref: "r",
        original_message_hash: "b".repeat(64),
        attestation_hash: "c".repeat(64),
        message_hash: "b".repeat(64),
      }),
    ).toBe(false);
  });
});

describe("A1-C04 [mechanism only] the natural-chat chronology tool path is version 1 only and cannot state a scale", () => {
  it("A1-C04 [mechanism only] parseChronology refuses a scale member; chronologyDocument emits the strict version 1 document with no scale", () => {
    const args = { statement: "the first light of the first morning", value: 0, unit: "seconds" };
    expect(parseChronology(args).ok).toBe(true); // control
    const withScale = parseChronology({ ...args, scale: "ONE_SI_SECOND_PER_CANONICAL_UNIT" });
    expect(withScale.ok).toBe(false); // one change: a scale member is "not offered"
    const doc = JSON.parse(
      chronologyDocument({ statement: args.statement, value: 0, unit: "seconds" }),
    );
    expect(doc.format_version).toBe(1);
    expect(Object.keys(doc).sort()).toEqual(["format", "format_version", "statement", "time"]);
    expect(ChronologyDocumentSchema.safeParse(doc).success).toBe(true);
    expect(
      ChronologyDocumentSchema.safeParse({ ...doc, scale: "ONE_SI_SECOND_PER_CANONICAL_UNIT" })
        .success,
    ).toBe(false);
  });
});

describe("A1-C05 [mechanism only] a confirmation token is bound to its verb and its exact subject", () => {
  it("A1-C05 [mechanism only] a token for the version 1 document is consumed only for that verb and that subject, and only once", async () => {
    const v1 = { campaign_id: "campaign-x", document: CHRONOLOGY_DOC };
    const v2 = {
      campaign_id: "campaign-x",
      document: {
        ...CHRONOLOGY_DOC,
        format_version: 2,
        scale: "ONE_SI_SECOND_PER_CANONICAL_UNIT",
      },
    };
    const token = (await requestOperatorConfirmation(
      scriptedConsole("confirm"),
      "capture-chronology",
      subjectOf(v1),
      ["shown"],
    ))!;
    expect(token).not.toBeNull();
    expect(consumeConfirmation(token, "capture-chronology", subjectOf(v2))).toBe(false); // one change: the subject (document version and scale)
    expect(consumeConfirmation(token, "initialize-time", subjectOf(v1))).toBe(false); // one change: the verb
    expect(consumeConfirmation(token, "capture-chronology", subjectOf(v1))).toBe(true); // control
    expect(consumeConfirmation(token, "capture-chronology", subjectOf(v1))).toBe(false); // single use
  });
});
