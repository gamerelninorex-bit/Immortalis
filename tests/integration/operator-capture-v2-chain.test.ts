/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and build malformed captures */
// F-014B A1-1 — the operator-produced STRICT version 2 capture carried through the existing route: intake, Completion, the captured writer
// and a strict reopen. T1 MECHANISM ONLY: the operator console, the author proof (`Input.author`) and the isolated GM answers are labelled
// fixture doubles from the testkit; the captured writer, owner admission, Temporal and the historical verifier are the real code.
// This is NOT original-message authenticity, NOT a production route (no host, tool, author verifier or driver exists; A1-2 is untouched),
// NOT a named client and NOT first-playable waiting. Nothing asserts that a real campaign qualifies.
//
//   A1-T03  the operator's version 2 capture through InitialSetupService.intake: the Input, its governing rule and the Grant's chronology hash
//   A1-T04  the chain through operator code to a strict reopen, using an independent fixture author proof
//   A1-T05  the coordinate and the publication identity are authored: no wall clock, and a changed word changes the identity
//   A1-T06  the version 1 chain through the same operator code is unchanged and never yields an origin
//   A1-T09  the MS route is not claimed: a version 2 MS Input needs the enrolled actor binding
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  CAPTURED_CHRONOLOGY_BASIS,
  InitialSetupGrantSchema,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  initialLocalityCompletionKey,
  initialSetupInputKey,
  type ChronologyEvidence,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE,
  INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
  InitialSetupPublisher,
  StageProviderRegistry,
  TemporalCoordinator,
  fixtureCanonicalAdmission,
  fixtureMsCanonicalAdmission,
  initializeCapturedChronology,
  scanInitialSetup,
} from "@immortalis/engine";
import {
  InitialSetupService,
  MsActorRunner,
  UnavailableEvidenceVerifier,
  captureStartingChronology,
  verifyCaptureForIntake,
} from "@immortalis/operator";
import {
  FIXTURE_MESSAGE_METHOD,
  FIXTURE_SETUP_MESSAGE,
  ScriptedIsolatedDriver,
  delegatingScene,
  delegatingScope,
  fixtureProofHash,
  generateFixtureRunnerKeys,
  publication,
} from "@immortalis/testkit";
import {
  AUTHORED,
  SI_LITERAL,
  canon,
  expectedCapture,
  expectedV1Document,
  operatorSource,
  reseal,
  scriptedConsole,
  sha256,
  type Authored,
  type Source,
} from "../support/operator-capture.ts";
import { governing } from "../support/clock-origin.ts";
import {
  CHRONOLOGY_DOC,
  FIXTURE_POLICY,
  factsOf,
  harness,
  intakeRequest,
  openFixtureCampaign,
  reasonOf,
  reopenFixtureCampaign,
  scratch,
  type Harness,
} from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";

const OP = "OPERATOR_CONFIRMED_RECORD_ONLY" as const;
const ORIGINAL = "ORIGINAL_MESSAGE_VERIFIED" as const;

interface V2Options {
  readonly grade?: typeof OP | typeof ORIGINAL | "TOOL_CALL_ONLY";
  readonly authored?: Authored;
  readonly request?: string;
  readonly message?: string;
  /** the campaign the capture is made for (default: the harness's) */
  readonly campaignId?: string;
}

/**
 * The operator's version 2 capture of the author's words, then the intake request that carries it, with the independent fixture author
 * proof for the setup message. Everything about the capture comes from `captureStartingChronology`; the author proof is the testkit's.
 */
async function v2Intake(h: Harness, over: V2Options = {}) {
  const request = over.request ?? "1";
  const message = over.message ?? FIXTURE_SETUP_MESSAGE;
  const author = h.verifier.authoredEvidence({
    message,
    request_ref: `fixture:request:${request}`,
  });
  const grade = over.grade ?? OP;
  const hash = sha256(message);
  const source: Source =
    grade === ORIGINAL
      ? {
          client: author.client,
          oauth_grant: author.oauth_grant,
          request_ref: author.request_ref,
          original_message_hash: hash,
          method_id: FIXTURE_MESSAGE_METHOD,
          attestation_hash: fixtureProofHash(hash),
        }
      : { ...operatorSource(FIXTURE_MESSAGE_METHOD, 7), request_ref: author.request_ref };
  const captured = await must(
    captureStartingChronology(
      {
        campaignId: over.campaignId ?? h.campaignId,
        store: h.captureStore,
        verifier: h.verifier as any,
        policy: FIXTURE_POLICY,
        ...(grade === OP ? { terminal: scriptedConsole("confirm") } : {}),
      },
      {
        capture_ref: `fixture:capture:v2:${request}`,
        authored: over.authored ?? AUTHORED,
        declares_one_si_second_per_unit: true,
        grade,
        source,
      },
    ),
  );
  return {
    capture: captured,
    source,
    request: {
      client: author.client,
      oauth_grant: author.oauth_grant,
      authenticated_setup_request_id: `fixture:setup-request:${request}`,
      message,
      author,
      chronology: captured as ChronologyEvidence,
    },
  };
}

const noSetup = (h: Harness) => expect(scanInitialSetup(factsOf(h.store)).count).toBe(0);

describe("A1-T03 [mechanism only] the operator's version 2 capture through the existing intake", () => {
  it("A1-T03 [mechanism only] the capture is admitted as the Input's chronology under exactly the non-MS version 2 rule; the Grant carries the version 2 document hash", async () => {
    const h = await harness();
    const { capture, request } = await v2Intake(h);
    const intake = await h.service.intake(request);
    expect(intake.status).toBe("ADMITTED");
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!;
    // the committed Input carries the operator's capture unchanged, and was admitted under the version 2 rule of its route
    expect((session.input.value as any).chronology).toEqual(capture);
    expect(session.input.provenance.rule).toEqual(INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE);
    expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
    const grant = InitialSetupGrantSchema.parse(
      scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.grant!.value,
    );
    const v2DocumentHash = sha256(
      canon({
        format: "immortalis-starting-chronology",
        format_version: 2,
        time: { unit: AUTHORED.unit, value: AUTHORED.value },
        statement: AUTHORED.statement,
        scale: SI_LITERAL,
      }),
    );
    expect(capture.document_hash).toBe(v2DocumentHash);
    expect(grant.chronology_hash).toBe(v2DocumentHash);
  });

  it("A1-T03 [mechanism only] one change from the accepted control refuses the capture at intake and writes no setup record", async () => {
    // each case changes ONE thing in the control's capture (all resealed, so the hashes are self-consistent where the change would otherwise
    // be caught only by a hash), then presents it to the unchanged service
    const control = async () => {
      const h = await harness();
      return { h, ...(await v2Intake(h)) };
    };
    const good = (await control()).capture as any;
    const noScale = Object.fromEntries(
      Object.entries(good.document).filter(([k]) => k !== "scale"),
    );
    const flip = (hex: string) => `${hex[0] === "0" ? "1" : "0"}${hex.slice(1)}`;
    const cases: [string, (c: any) => unknown, string][] = [
      [
        "a flipped capture_hash",
        (c) => ({ ...c, capture_hash: flip(c.capture_hash) }),
        "DOCUMENT_INVALID",
      ],
      [
        "a flipped document_hash",
        (c) => ({ ...c, document_hash: flip(c.document_hash) }),
        "DOCUMENT_INVALID",
      ],
      [
        "the grade lowered to TOOL_CALL_ONLY (resealed)",
        (c) => reseal({ ...c, grade: "TOOL_CALL_ONLY" }),
        "DOCUMENT_INVALID",
      ],
      [
        "a version 2 document inside a version 1 capture (resealed)",
        (c) => reseal({ ...c, format_version: 1 }),
        "DOCUMENT_INVALID",
      ],
      [
        "a version 1 document inside a version 2 capture (resealed)",
        (c) => reseal({ ...c, document: expectedV1Document(AUTHORED) }),
        "DOCUMENT_INVALID",
      ],
      [
        "another scale literal (resealed)",
        (c) => reseal({ ...c, document: { ...c.document, scale: "ONE_DAY_PER_CANONICAL_UNIT" } }),
        "DOCUMENT_INVALID",
      ],
      [
        "the scale removed (resealed)",
        (c) => reseal({ ...c, document: noScale }),
        "DOCUMENT_INVALID",
      ],
      ["an extra member", (c) => ({ ...c, extra: 1 }), "DOCUMENT_INVALID"],
    ];
    for (const [name, change, reason] of cases) {
      const { h, request } = await control();
      const refused = await h.service.intake({
        ...request,
        chronology: change(request.chronology) as ChronologyEvidence,
      });
      expect(refused.status, name).toBe("REFUSED");
      expect(refused.reason, name).toBe(reason);
      noSetup(h);
    }
  });

  it("A1-T03 [mechanism only] a capture made for another campaign is refused", async () => {
    const h = await harness();
    // the capture is the operator's own, made for a different campaign (one change: the campaign it is bound to)
    const { request } = await v2Intake(h, { campaignId: "campaign-other" });
    const refused = await h.service.intake(request);
    expect(refused.status).toBe("REFUSED");
    expect(refused.reason).toBe("DOCUMENT_INVALID");
    expect(refused.message).toContain("another campaign");
    noSetup(h);
  });

  it("A1-T03 [mechanism only] a TOOL_CALL_ONLY version 2 capture is stored but refused at intake: a model-formed call never rises above diagnostics", async () => {
    const h = await harness();
    const { capture, request } = await v2Intake(h, { grade: "TOOL_CALL_ONLY" });
    expect(capture.grade).toBe("TOOL_CALL_ONLY");
    const refused = await h.service.intake(request);
    expect(refused.status).toBe("REFUSED");
    expect(refused.message).toContain("TOOL_CALL_ONLY");
    noSetup(h);
    // the writer refuses it too, wherever it is reached from: no Input exists, so there is nothing to initialize from
    const written = await initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY });
    expect(written.ok).toBe(false);
    expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
  });

  it("A1-T03 [mechanism only] the author check is unchanged: an operator-confirmed Input.author is refused by the service and by the engine, with the same version 2 capture", async () => {
    const okH = await harness();
    const { request } = await v2Intake(okH);
    const accepted = await okH.service.intake(request);
    expect(accepted.status).toBe("ADMITTED"); // control: a verified author, the same capture
    const committed = scanInitialSetup(factsOf(okH.store)).sessions.get(accepted.setup_id!)!.input
      .value as any;

    const badH = await harness();
    const bad = await v2Intake(badH);
    const refused = await badH.service.intake({
      ...bad.request,
      author: { ...bad.request.author, grade: OP },
    });
    expect(refused.status).toBe("UNRESOLVED_AUTHORITY");
    noSetup(badH);

    // independent of the service: the committed Input value with only author.grade changed
    const fresh = await openFixtureCampaign();
    const publisher = new InitialSetupPublisher(fresh.campaign.store);
    const engine = await publisher.input({
      ...committed,
      author: { ...committed.author, grade: OP },
    });
    expect(engine.ok).toBe(false);
    expect(reasonOf(engine as any)).toBe("AUTHOR_GRADE");
    expect((await publisher.input(committed)).ok).toBe(true);
  });

  it("A1-T03 [mechanism only] the author proof is still checked exactly as before: another message is a hash mismatch and an unverified proof is an unresolved authority", async () => {
    const h = await harness();
    const { request } = await v2Intake(h);
    // one change: the message is not the one the proof maps to
    const other = await h.service.intake({
      ...request,
      message: `${request.message} Also something else.`,
    });
    expect(other.status).toBe("REFUSED");
    expect(other.reason).toBe("AUTHOR_MESSAGE_HASH");
    noSetup(h);
    // one change: the verifier refuses the (otherwise identical) author proof
    const unverified = new InitialSetupService({
      campaignId: h.campaignId,
      store: h.store,
      runner: h.runner,
      verifier: UnavailableEvidenceVerifier,
      policy: FIXTURE_POLICY,
    });
    const refused = await unverified.intake(request);
    expect(refused.status).toBe("UNRESOLVED_AUTHORITY");
    noSetup(h);
    // control: the same request through the service whose verifier accepts the fixture proof
    expect((await h.service.intake(request)).status).toBe("ADMITTED");
  });

  it("A1-T03 [mechanism only] under the unavailable production verifier a promoted grade is an unresolved authority and an operator-confirmed capture still needs a verified author", async () => {
    const h = await harness();
    const { capture } = await v2Intake(h);
    const promoted = reseal({
      ...capture,
      grade: ORIGINAL,
      source: { ...capture.source, original_message_hash: sha256(FIXTURE_SETUP_MESSAGE) },
    });
    const verdict = await verifyCaptureForIntake(
      { campaignId: h.campaignId, verifier: UnavailableEvidenceVerifier, policy: FIXTURE_POLICY },
      promoted,
    );
    expect(verdict.ok).toBe(false);
    expect(!verdict.ok && verdict.error.code).toBe("UNRESOLVED_AUTHORITY");
  });
});

/** The identity of the captured writer's publication, recomputed here from the code's documented formula. */
const groupIdOf = (h: Harness, g: ReturnType<typeof governing>, captureHash: string) =>
  `captured-chronology:${sha256(
    canon({
      campaign_id: h.campaignId,
      completion: { fact_key: g.completionKey, version: g.completion.version },
      input: { fact_key: g.inputKey, version: g.inputFact.version },
      capture_hash: captureHash,
    }),
  )}:group`;

describe("A1-T04 [mechanism only] the chain through operator code to a strict reopen", () => {
  for (const grade of [OP, ORIGINAL] as const) {
    it(`A1-T04 [mechanism only] ${grade}: capture, intake, Completion and the paired genesis, one group, the origin binds the capture and the governing records, strict replay`, async () => {
      const h = await harness();
      const { capture, request } = await v2Intake(h, { grade });
      expect((await h.service.intake(request)).status).toBe("ADMITTED");
      expect(
        (await h.service.advance(scanInitialSetup(factsOf(h.store)).sessions.keys().next().value!))
          .status,
      ).toBe("COMPLETED");
      expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined(); // the capture, the Input and the Completion write no time
      expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();

      const written = await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
      expect(written.replayed).toBe(false);
      const g = governing(h);
      const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
      const origin = h.store.getFact(TEMPORAL_ORIGIN_KEY)!;
      expect([state.version, origin.version]).toEqual([1, 1]);
      expect(state.provenance.group_id).toBe(origin.provenance.group_id);
      expect(state.provenance.group_id).toBe(groupIdOf(h, g, capture.capture_hash));
      expect(state.basis).toBe(CAPTURED_CHRONOLOGY_BASIS[grade]);
      expect(origin.basis).toBe(state.basis);
      expect(state.value).toEqual({
        canonical_time: { unit: AUTHORED.unit, value: AUTHORED.value },
        last_transaction: null,
        continuation: null,
      });
      // the witness, written out from the contract text: every member is what the operator's capture and the committed records say
      expect(origin.value).toEqual({
        format: "immortalis-temporal-origin",
        format_version: 1,
        campaign_id: h.campaignId,
        origin: { unit: AUTHORED.unit, value: AUTHORED.value },
        scale: SI_LITERAL,
        chronology: {
          capture_format_version: 2,
          capture_ref: capture.capture_ref,
          capture_hash: capture.capture_hash,
          document_hash: capture.document_hash,
          grade,
        },
        governing: {
          completion: {
            fact_key: initialLocalityCompletionKey(g.input.world_id, g.input.locus_id),
            version: g.completion.version,
          },
          input: {
            fact_key: initialSetupInputKey(g.input.world_id, g.input.locus_id, g.input.setup_id),
            version: g.inputFact.version,
          },
        },
      });
      expect(g.input.chronology).toEqual(capture);
      const group = h.store.committedGroup(state.provenance.intent_id)!;
      expect(group.writes.map((w) => w.key).sort()).toEqual([
        TEMPORAL_ORIGIN_KEY,
        TEMPORAL_STATE_KEY,
      ]);

      // strict reopen: a fresh open under a changed history identity cannot trust the checkpoint, so every group is re-judged from empty
      const head = h.store.head();
      expect(h.campaign.verify()).toEqual([]);
      await h.campaign.close();
      const forced = {
        ...fixtureCanonicalAdmission,
        historyVerificationId:
          fixtureCanonicalAdmission.historyVerificationId + "+test-force-replay",
      };
      const replayed = await must(
        CanonicalCampaign.open(h.dir, { testkitFixtureAdmission: forced }),
      );
      expect(replayed.store.head().state_sha256).toBe(head.state_sha256);
      expect(replayed.verify()).toEqual([]);
      expect(replayed.store.getFact(TEMPORAL_ORIGIN_KEY)!.value).toEqual(origin.value);
      await replayed.close();
      const reopened = await must(reopenFixtureCampaign(h.dir));
      expect(reopened.store.head().state_sha256).toBe(head.state_sha256);
      expect(reopened.verify()).toEqual([]);
      await reopened.close();
    });
  }

  it("A1-T04 [mechanism only] a plain state-only write is refused once a version 2 Input is in the journal: the origin cannot be left out", async () => {
    const h = await harness();
    const { request } = await v2Intake(h);
    const intake = await h.service.intake(request);
    expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
    const plain = await new TemporalCoordinator(
      h.store,
      new StageProviderRegistry(),
    ).establishCanonicalTime({
      ...publication(9),
      time: { unit: AUTHORED.unit, value: AUTHORED.value },
    });
    expect(plain.ok).toBe(false);
    expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();
    // control: the real writer then succeeds on the very same journal
    expect((await initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY })).ok).toBe(true);
  });
});

describe("A1-T05 [mechanism only] the coordinate and the publication identity are authored: no wall clock enters them", () => {
  async function chainAt(iso: string, authored: Authored) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
    try {
      const h = await harness();
      const { capture, request } = await v2Intake(h, { authored });
      const intake = await h.service.intake(request);
      expect(intake.status).toBe("ADMITTED");
      expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
      await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
      const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
      return {
        time: (state.value as any).canonical_time,
        group: state.provenance.group_id,
        origin: h.store.getFact(TEMPORAL_ORIGIN_KEY)!.value,
        captureHash: capture.capture_hash,
      };
    } finally {
      vi.useRealTimers();
    }
  }

  it("A1-T05 [mechanism only] two system clocks decades apart give the same coordinate, origin and publication identity; a different authored value differs", async () => {
    const early = await chainAt("2001-02-03T04:05:06.000Z", AUTHORED);
    const late = await chainAt("2049-11-30T23:59:59.000Z", AUTHORED);
    expect(early.time).toEqual({ unit: AUTHORED.unit, value: AUTHORED.value });
    expect(late).toEqual(early);
    // control: the ONE changed input is the authored coordinate
    const other = await chainAt("2001-02-03T04:05:06.000Z", { ...AUTHORED, value: 5 });
    expect(other.time).toEqual({ unit: AUTHORED.unit, value: 5 });
    expect(other.group).not.toBe(early.group);
    expect(other.captureHash).not.toBe(early.captureHash);
  });
});

describe("A1-T06 [mechanism only] the version 1 chain through the same operator code is unchanged and never yields an origin", () => {
  it("A1-T06 [mechanism only] a version 1 capture keeps its four-member document and one write; its group identity equals the test's recomputation", async () => {
    const h = await harness();
    const req = await intakeRequest(h); // the original v1 helper: a version 1 capture through captureStartingChronology
    expect(req.chronology.format_version).toBe(1);
    expect(Object.keys(req.chronology.document).sort()).toEqual([
      "format",
      "format_version",
      "statement",
      "time",
    ]);
    const intake = await h.service.intake(req);
    expect(intake.status).toBe("ADMITTED");
    expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!;
    expect(session.input.provenance.rule).not.toEqual(INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE);
    await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    const g = governing(h);
    const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
    expect(state.provenance.group_id).toBe(groupIdOf(h, g, req.chronology.capture_hash));
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined(); // a version 1 origin is state-only and opaque
    expect(h.store.committedGroup(state.provenance.intent_id)!.writes.map((w) => w.key)).toEqual([
      TEMPORAL_STATE_KEY,
    ]);
    expect(h.campaign.verify()).toEqual([]);
    // the version 1 capture equals the test's own recomputation of it (four-member document, version 1 envelope)
    expect(req.chronology).toEqual(
      expectedCapture({
        arm: 1,
        campaignId: h.campaignId,
        captureRef: req.chronology.capture_ref,
        authored: { statement: CHRONOLOGY_DOC.statement, value: 0, unit: "seconds" },
        grade: ORIGINAL,
        source: req.chronology.source,
      }),
    );
    // and the same words as a version 2 capture are a different capture, hence a different identity
    const twin = await harness();
    const v2 = await v2Intake(twin, {
      authored: { statement: CHRONOLOGY_DOC.statement, value: 0, unit: "seconds" },
    });
    expect(v2.capture.capture_hash).not.toBe(req.chronology.capture_hash);
    expect(v2.capture.document_hash).not.toBe(req.chronology.document_hash);
  });
});

describe("A1-T09 [mechanism only] the MS route is not claimed", () => {
  it("A1-T09 [mechanism only] a version 2 MS Input is refused without the enrolled actor binding and admitted under it; the operator carries no MS logic", async () => {
    // refused: the fixture admission has no enrolled ACTOR-capable binding
    const bare = await harness({ route: "MS" });
    const refused = await bare.service.intake((await v2Intake(bare)).request);
    expect(refused.status).toBe("REFUSED");
    expect(refused.reason).toBe("MS_ACTOR_PROFILE");
    noSetup(bare);

    // one change: trusted startup enrolled the actor tuple that the Input's runner pin carries (same keys, same driver identity)
    const keys = generateFixtureRunnerKeys();
    const macKey = randomBytes(32);
    const outboxDir = scratch("immortalis-a1-ms-outbox-");
    const scripted = new ScriptedIsolatedDriver({
      scope: delegatingScope(),
      scene: delegatingScene(),
    });
    const actorRunner = new MsActorRunner({
      ...keys,
      driver: {
        driver_id: scripted.driver_id,
        config_hash: scripted.config_hash,
        run: async () => {
          throw new Error("the MS actor is not run by this test");
        },
      },
      outboxDir,
      macKey,
    });
    const open = await openFixtureCampaign(
      undefined,
      {},
      fixtureMsCanonicalAdmission(actorRunner.binding),
    );
    const ms = await harness({ open, keys, macKey, outboxDir, driver: scripted, route: "MS" });
    const admitted = await ms.service.intake((await v2Intake(ms)).request);
    expect(admitted.status).toBe("ADMITTED");
    const input = scanInitialSetup(factsOf(ms.store)).sessions.get(admitted.setup_id!)!.input;
    expect(input.provenance.rule).toEqual(INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE);
    // and no Temporal fact was written: this slice owns no Temporal writer
    expect(ms.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();
    expect(ms.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
  });
});
