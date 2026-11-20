/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// F-014B A0 (CAL-TIME T-1) — LIVE admission of the paired genesis, the arm / route / rule correspondence and the origin value, through
// REAL code, non-MS route. T1 MECHANISM ONLY. Every refusal below is judged by the real owner admission (`store.commit`); a refusal
// leaves the journal unchanged, which each test asserts. The upstream setup records are created through the original fixture
// publication path; no fixture asserts an origin, a state or a verdict.
//
// A0-T04 (live half; the replay half is clock-origin-replay.test.ts), A0-T06, A0-T07 (live half), A0-T08, A0-T09, A0-T10, A0-T11.
import { describe, expect, it } from "vitest";
import {
  INITIAL_LOCALITY_COMPLETION_MS_V3_RULE,
  INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE,
  INITIAL_SETUP_INPUT_MS_V3_RULE,
  INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
  INITIAL_SETUP_RULES,
  StageProviderRegistry,
  TemporalCoordinator,
  buildProducerInput,
  deliveredProducerBytesViolation,
  factKind,
  initializeCapturedChronology,
  resolveInstructionMap,
} from "@immortalis/engine";
import { TEMPORAL_ORIGIN_KEY, TEMPORAL_STATE_KEY, canonicalJson } from "@immortalis/contracts";
import { publication } from "@immortalis/testkit";
import {
  FIXTURE_POLICY,
  harness,
  intakeRequest,
  openFixtureCampaign,
} from "../support/initial-setup.ts";
import {
  admitInput,
  buildInput,
  governing,
  inputGroupWithRule,
  pairGroup,
  refusal,
  syntheticPairGroup,
  tracedAdmission,
  v1Capture,
} from "../support/clock-origin.ts";
import { must } from "../support/temporal.ts";

/** a v2 session driven to its Completion through the original fixture chain; no Temporal fact exists yet */
async function v2Session() {
  const h = await harness();
  const admitted = await admitInput(h);
  expect(admitted.ok, JSON.stringify(admitted.published)).toBe(true);
  expect((await h.service.advance(admitted.setup_id)).status).toBe("COMPLETED");
  return h;
}
/** a v1 session through its Completion, by the shipped operator intake */
async function v1Session() {
  const h = await harness();
  const intake = await h.service.intake(await intakeRequest(h));
  expect(intake.status).toBe("ADMITTED");
  expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
  return h;
}
const noTime = (h: Awaited<ReturnType<typeof harness>>) => {
  expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();
  expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
};

describe("A0-T04 (live): the Input's arm, route and governing rule correspond", () => {
  it("a v2 Input under either v1 rule, and a v1 Input under either v2 rule, is refused; the correct citation admits", async () => {
    const h = await harness();
    const head = h.store.head().state_sha256;
    const v2 = buildInput(h);
    const v1 = buildInput(h, { arm: 1 });
    const cases = [
      [
        "v2 Input under the CORE_V9 v1 rule",
        v2,
        INITIAL_SETUP_RULES.initial_setup_input,
        undefined,
      ],
      ["v2 Input under the MS v3 v1 rule", v2, INITIAL_SETUP_INPUT_MS_V3_RULE, "MS"],
      [
        "v1 Input under the non-MS v2 rule",
        v1,
        INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
        undefined,
      ],
      ["v1 Input under the MS v2 rule", v1, INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE, "MS"],
    ] as const;
    for (const [name, input, rule, route] of cases) {
      const refused = await h.store.commit(inputGroupWithRule(h, input, rule, route));
      // a v2 Input under a v1 rule passes the registry's schema-parse alternates and is refused by the arm / rule correspondence in
      // owner admission; a v1 Input under a v2 rule fails the v2 rules' value class at the registry first
      const viaCorrespondence = input === v2;
      expect(refusal(refused), name).toMatchObject(
        viaCorrespondence
          ? { ok: false, code: "VALUE_INVALID", reason: "RULE" }
          : { ok: false, code: "REFERENCE_INVALID" },
      );
    }
    // a v2 Input under the MS v2 rule on the non-MS route: the MS actor profile is required before any reservation
    const ms = await h.store.commit(
      inputGroupWithRule(h, v2, INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE, "MS"),
    );
    expect(refusal(ms)).toMatchObject({ ok: false, reason: "MS_ACTOR_PROFILE" });
    expect(h.store.head().state_sha256).toBe(head);
    // the correct citation admits, and the committed fact carries exactly it
    const admitted = await admitInput(h);
    expect(admitted.ok).toBe(true);
    const fact = governingInputFact(h);
    expect(fact.provenance.rule).toEqual(INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE);
  });

  it("each v2 Input pairs only with its route's existing Completion rule, live and on replay", async () => {
    const { admission, trace } = tracedAdmission();
    const h = await harness({ open: await openFixtureCampaign(undefined, {}, admission) });
    const admitted = await admitInput(h);
    expect(admitted.ok).toBe(true);
    expect((await h.service.advance(admitted.setup_id)).status).toBe("COMPLETED");
    const g = governing(h);
    const step = trace.find((t) => t.group.writes[0]!.key === g.completionKey)!;
    const lawful = step.group;
    expect(lawful.rule).toEqual(INITIAL_SETUP_RULES.initial_locality_completion);
    const crossed = { ...lawful, rule: INITIAL_LOCALITY_COMPLETION_MS_V3_RULE };
    // the store answers a re-presented intent with INTENT_CONFLICT before admission, so the real admission is asked directly,
    // against the exact pre-state the Completion met
    for (const verdict of [
      admission.check(crossed, step.before),
      admission.verifyHistorical!(crossed, step.before),
    ])
      // the MS fence refuses an MS-source citation in a campaign with no MS Input first; where it passes, the pairing check is next
      expect(["MS_SOURCE_CHAIN", "MS_ROUTE_PAIR"]).toContain(
        (verdict?.details as { reason?: string } | undefined)?.reason,
      );
    // control: the right rule passes both
    expect(admission.check(lawful, step.before)).toBeNull();
    expect(admission.verifyHistorical!(lawful, step.before)).toBeNull();
  });
});

const governingInputFact = (h: Awaited<ReturnType<typeof harness>>) => {
  const inputs = h.store
    .listFacts()
    .filter((f) => f.key.endsWith("/input") && f.key.includes("/initial-setup/"));
  expect(inputs).toHaveLength(1);
  return inputs[0]!;
};

describe("A0-T06: the pair's shape", () => {
  it("is accepted in EITHER write order, and replays strictly", async () => {
    const h = await v2Session();
    const committed = await h.store.commit(pairGroup(h, { order: "origin-first", tag: "order" }));
    expect(committed.ok, JSON.stringify(committed)).toBe(true);
    expect(h.store.getFact(TEMPORAL_STATE_KEY)!.version).toBe(1);
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)!.version).toBe(1);
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)!.provenance.group_id).toBe(
      h.store.getFact(TEMPORAL_STATE_KEY)!.provenance.group_id,
    );
    expect(h.campaign.verify()).toEqual([]);
  });

  it("is refused with a third write, a transaction write, a non-zero expected version, the wrong rule or a mismatched basis/secrecy", async () => {
    const h = await v2Session();
    const head = h.store.head().state_sha256;
    const meta = {
      owner: "temporal_kernel",
      facet: "temporal_coordination",
      unit: null,
      basis: "original-message-captured-starting-chronology",
      secrecy: "engine-internal" as const,
      expected_version: 0,
    };
    const rows: [string, Parameters<typeof pairGroup>[1], Partial<ReturnType<typeof refusal>>][] = [
      [
        "a third write (a boundary index)",
        { extraWrites: [{ key: "temporal/boundary-index", value: { entries: [] }, ...meta }] },
        { code: "REFERENCE_INVALID" },
      ],
      [
        "a transaction write",
        { extraWrites: [{ key: "temporal/transaction/tx-forged", value: {}, ...meta }] },
        { code: "VALUE_INVALID" },
      ],
      ["a non-zero expected version on the state", { stateWrite: { expected_version: 1 } }, {}],
      ["a non-zero expected version on the origin", { originWrite: { expected_version: 1 } }, {}],
      [
        "the kernel rule on the pair",
        { rule: factKind("temporal_state").rule },
        { code: "REFERENCE_INVALID" },
      ],
      [
        "a different basis on the origin",
        { originWrite: { basis: "operator-record-only-confirmed-starting-chronology" } },
        { reason: "ORIGIN_PAIR_SHAPE" },
      ],
      [
        "a different secrecy on the origin",
        { originWrite: { secrecy: "local-operator-session" } },
        { reason: "ORIGIN_PAIR_SHAPE" },
      ],
      [
        "the same wrong basis on both writes",
        {
          stateWrite: { basis: "operator-record-only-confirmed-starting-chronology" },
          originWrite: { basis: "operator-record-only-confirmed-starting-chronology" },
        },
        { reason: "BASIS_LABEL" },
      ],
      ["an origin-only group", { omit: "state" }, { reason: "ORIGIN_PAIR_SHAPE" }],
      [
        "a state carrying a transaction",
        { state: (s: any) => ({ ...s, last_transaction: "tx-forged" }) },
        {},
      ],
      [
        "another owner on the group",
        { group: { owner: "world_state", facet: "world_initial_setup" } },
        {},
      ],
    ];
    for (const [name, over, want] of rows) {
      const refused = await h.store.commit(pairGroup(h, { ...over, tag: name }));
      const got = refusal(refused);
      expect(got.ok, name).toBe(false);
      if (want.reason) expect(got.reason, name).toBe(want.reason);
      if (want.code) expect(got.code, name).toBe(want.code);
    }
    expect(h.store.head().state_sha256).toBe(head);
    noTime(h);
  });
});

describe("A0-T07 (live): version-to-genesis correspondence against the Completion's own Input", () => {
  it("a v2 Input with a state-only genesis refuses, whichever rule the lone state cites, and through the v1 writer API", async () => {
    const h = await v2Session();
    const head = h.store.head().state_sha256;
    const kernel = await h.store.commit(
      pairGroup(h, { omit: "origin", rule: factKind("temporal_state").rule, tag: "lone-kernel" }),
    );
    expect(refusal(kernel)).toMatchObject({ ok: false, reason: "V2_REQUIRES_PAIRED_GENESIS" });
    const paired = await h.store.commit(pairGroup(h, { omit: "origin", tag: "lone-paired-rule" }));
    expect(refusal(paired)).toMatchObject({ ok: false, reason: "ORIGIN_PAIR_SHAPE" });
    // the unchanged v1 coordinator method, with the right reads and dependencies, cannot initialize time on a v2 Input
    const g = governing(h);
    const viaV1 = await new TemporalCoordinator(
      h.store,
      new StageProviderRegistry(),
    ).establishCanonicalTime({
      ...publication(7),
      basis: "original-message-captured-starting-chronology",
      secrecy: "engine-internal",
      time: g.input.chronology.document.time,
      reads: [
        { key: g.completionKey, version: g.completion.version },
        { key: g.inputKey, version: g.inputFact.version },
      ],
      depends_on: [g.completion.provenance.group_id, g.inputFact.provenance.group_id],
    });
    expect(refusal(viaV1)).toMatchObject({ ok: false, reason: "V2_REQUIRES_PAIRED_GENESIS" });
    expect(h.store.head().state_sha256).toBe(head);
    noTime(h);
  });

  it("a v1 Input with a pair refuses, and the shipped v1 writer still produces its state-only genesis", async () => {
    const h = await v1Session();
    const head = h.store.head().state_sha256;
    const g = governing(h);
    expect(g.input.chronology.format_version).toBe(1);
    const origin = syntheticPairGroup(h).writes.find((w) => w.key === TEMPORAL_ORIGIN_KEY)!.value;
    const refused = await h.store.commit(pairGroup(h, { originValue: origin, tag: "v1-pair" }));
    expect(refusal(refused)).toMatchObject({ ok: false, reason: "V1_REFUSES_WITNESS" });
    expect(h.store.head().state_sha256).toBe(head);
    noTime(h);
    await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    expect(h.store.getFact(TEMPORAL_STATE_KEY)!.version).toBe(1);
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
    expect(h.store.getFact(TEMPORAL_STATE_KEY)!.provenance.rule).toEqual(
      factKind("temporal_state").rule,
    );
  });
});

describe("A0-T09: the origin value cannot be forged", () => {
  it("each field of the origin, and the state it pairs with, is compared with the committed records", async () => {
    const h = await v2Session();
    const head = h.store.head().state_sha256;
    const flip = (hash: string) => (hash[0] === "0" ? "1" : "0") + hash.slice(1);
    const g = governing(h);
    const edit = (f: (o: any) => unknown) => ({ origin: f });
    const rows: [string, Parameters<typeof pairGroup>[1], Partial<ReturnType<typeof refusal>>][] = [
      [
        "another campaign",
        edit((o) => ({ ...o, campaign_id: "campaign-other" })),
        { reason: "ORIGIN_CAMPAIGN" },
      ],
      [
        "another value",
        edit((o) => ({ ...o, origin: { ...o.origin, value: 1 } })),
        { reason: "ORIGIN_TIME" },
      ],
      [
        "another unit",
        edit((o) => ({ ...o, origin: { ...o.origin, unit: "days" } })),
        { reason: "ORIGIN_TIME" },
      ],
      [
        "another capture_ref",
        edit((o) => ({
          ...o,
          chronology: { ...o.chronology, capture_ref: "fixture:capture:other" },
        })),
        { reason: "ORIGIN_CAPTURE" },
      ],
      [
        "another capture_hash",
        edit((o) => ({
          ...o,
          chronology: { ...o.chronology, capture_hash: flip(o.chronology.capture_hash) },
        })),
        { reason: "ORIGIN_CAPTURE" },
      ],
      [
        "another document_hash",
        edit((o) => ({
          ...o,
          chronology: { ...o.chronology, document_hash: flip(o.chronology.document_hash) },
        })),
        { reason: "ORIGIN_CAPTURE" },
      ],
      [
        "another grade (the Input's capture is ORIGINAL_MESSAGE_VERIFIED)",
        edit((o) => ({
          ...o,
          chronology: { ...o.chronology, grade: "OPERATOR_CONFIRMED_RECORD_ONLY" },
        })),
        { reason: "ORIGIN_CAPTURE" },
      ],
      [
        "TOOL_CALL_ONLY (not representable)",
        edit((o) => ({ ...o, chronology: { ...o.chronology, grade: "TOOL_CALL_ONLY" } })),
        { code: "VALUE_INVALID" },
      ],
      [
        "a capture_format_version of 1",
        edit((o) => ({ ...o, chronology: { ...o.chronology, capture_format_version: 1 } })),
        { code: "VALUE_INVALID" },
      ],
      [
        "another scale",
        edit((o) => ({ ...o, scale: "ONE_SI_MINUTE_PER_CANONICAL_UNIT" })),
        { code: "VALUE_INVALID" },
      ],
      ["an extra field", edit((o) => ({ ...o, extra: true })), { code: "VALUE_INVALID" }],
      [
        "another Completion key",
        edit((o) => ({
          ...o,
          governing: { ...o.governing, completion: { fact_key: g.inputKey, version: 1 } },
        })),
        { reason: "ORIGIN_GOVERNING" },
      ],
      [
        "another Completion version",
        edit((o) => ({
          ...o,
          governing: { ...o.governing, completion: { ...o.governing.completion, version: 2 } },
        })),
        { reason: "ORIGIN_GOVERNING" },
      ],
      [
        "another Input version",
        edit((o) => ({
          ...o,
          governing: { ...o.governing, input: { ...o.governing.input, version: 2 } },
        })),
        { reason: "ORIGIN_GOVERNING" },
      ],
      [
        "the Completion and the Input crosswired",
        edit((o) => ({
          ...o,
          governing: { completion: o.governing.input, input: o.governing.completion },
        })),
        { reason: "ORIGIN_GOVERNING" },
      ],
      [
        "a state coordinate that is not the Input's",
        { state: (s: any) => ({ ...s, canonical_time: { ...s.canonical_time, value: 5 } }) },
        { reason: "TIME_MISMATCH" },
      ],
      [
        "an origin and state that agree with each other but not with the Input",
        {
          state: (s: any) => ({ ...s, canonical_time: { ...s.canonical_time, value: 5 } }),
          origin: (o: any) => ({ ...o, origin: { ...o.origin, value: 5 } }),
        },
        { reason: "TIME_MISMATCH" },
      ],
      ["no read of the Completion and the Input", { reads: [] }, { code: "REFERENCE_INVALID" }],
      [
        "no dependency on the Completion's and the Input's groups",
        { depends_on: [] },
        { code: "REFERENCE_INVALID" },
      ],
    ];
    for (const [name, over, want] of rows) {
      const refused = await h.store.commit(pairGroup(h, { ...over, tag: name }));
      const got = refusal(refused);
      expect(got.ok, name).toBe(false);
      if (want.reason) expect(got.reason, name).toBe(want.reason);
      if (want.code) expect(got.code, name).toBe(want.code);
    }
    expect(h.store.head().state_sha256).toBe(head);
    noTime(h);
    // control: the unforged pair is admitted
    expect((await h.store.commit(pairGroup(h, { tag: "control" }))).ok).toBe(true);
  });

  it("TOOL_CALL_ONLY and illicit fixture evidence cannot reach the writer or production admission", async () => {
    // a TOOL_CALL_ONLY capture is refused at Input admission (the shared capture check), so no Completion can derive from it
    const h = await harness();
    const refused = await admitInput(h, { captureOver: { grade: "TOOL_CALL_ONLY" } });
    expect(refusal(refused.published)).toMatchObject({ ok: false, reason: "CHRONOLOGY_GRADE" });
    // fixture evidence under the PRODUCTION policy: the writer refuses it, and no Temporal fact appears
    const v2 = await v2Session();
    const production = await initializeCapturedChronology(v2.store);
    expect(production.ok).toBe(false);
    noTime(v2);
  });
});

describe("A0-T10: a never-bootstrap prefix, raw citations and late or second witnesses", () => {
  it("an origin on a never-bootstrap prefix refuses; the state-only genesis there is unchanged", async () => {
    const h = await harness();
    const head = h.store.head().state_sha256;
    const pair = await h.store.commit(syntheticPairGroup(h, { tag: "never" }));
    expect(refusal(pair)).toMatchObject({ ok: false, reason: "NO_BOOTSTRAP_WITNESS" });
    const originOnly = await h.store.commit(
      syntheticPairGroup(h, { omit: "state", tag: "never-o" }),
    );
    expect(refusal(originOnly)).toMatchObject({ ok: false, reason: "ORIGIN_PAIR_SHAPE" });
    const raw = await h.store.commit(
      syntheticPairGroup(h, { rule: factKind("temporal_state").rule, tag: "never-raw" }),
    );
    expect(refusal(raw)).toMatchObject({ ok: false, code: "REFERENCE_INVALID" });
    expect(h.store.head().state_sha256).toBe(head);
    noTime(h);
    // the shipped one-write genesis is untouched
    await must(
      new TemporalCoordinator(h.store, new StageProviderRegistry()).establishCanonicalTime({
        ...publication(41),
        time: { unit: "seconds", value: 7 },
      }),
    );
    expect(h.store.getFact(TEMPORAL_STATE_KEY)!.provenance.rule).toEqual(
      factKind("temporal_state").rule,
    );
    // late origin after the state: refused, alone or as a pair
    const late = await h.store.commit(syntheticPairGroup(h, { omit: "state", tag: "late" }));
    expect(refusal(late)).toMatchObject({ ok: false });
    const latePair = await h.store.commit(syntheticPairGroup(h, { tag: "late-pair" }));
    expect(refusal(latePair).ok).toBe(false);
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
  });

  it("the raw kernel citation on a v2 pair refuses; a second or amended origin refuses once the pair exists", async () => {
    const h = await v2Session();
    const raw = await h.store.commit(
      pairGroup(h, { rule: factKind("temporal_state").rule, tag: "raw" }),
    );
    expect(refusal(raw)).toMatchObject({ ok: false, code: "REFERENCE_INVALID" });
    noTime(h);
    await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    const origin = h.store.getFact(TEMPORAL_ORIGIN_KEY)!;
    const head = h.store.head().state_sha256;
    // an amendment of the SEALED origin
    const amend = await h.store.commit(
      pairGroup(h, { omit: "state", originWrite: { expected_version: 1 }, tag: "amend" }),
    );
    expect(refusal(amend)).toMatchObject({ ok: false, code: "AMENDMENT_NOT_SUPPORTED" });
    // a second creation
    const second = await h.store.commit(pairGroup(h, { tag: "second" }));
    expect(second.ok).toBe(false);
    // an origin under a rule other than its own
    const wrongRule = await h.store.commit(
      pairGroup(h, {
        omit: "state",
        rule: factKind("temporal_state").rule,
        tag: "wrong-rule",
        originWrite: { expected_version: 1 },
      }),
    );
    expect(wrongRule.ok).toBe(false);
    expect(h.store.head().state_sha256).toBe(head);
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toEqual(origin);
  });
});

describe("A0-T11: lost-acknowledgement retry converges; a changed v2 capture cannot reuse the intent", () => {
  it("re-presenting the very group reaches the original receipt, and a changed capture under the same identities is refused", async () => {
    const h = await v2Session();
    const first = await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    expect(first.replayed).toBe(false);
    const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
    const group = h.store.committedGroup(state.provenance.intent_id)!;
    const head = h.store.head().state_sha256;
    // the acknowledgement was lost: the writer retries, and so does a raw re-presentation of the committed group
    const retry = await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    expect(retry.replayed).toBe(true);
    const represented = await must(h.store.commit(group));
    expect(represented.replayed).toBe(true);
    expect(h.store.head().state_sha256).toBe(head);
    expect(h.store.listFacts().filter((f) => f.key === TEMPORAL_ORIGIN_KEY)).toHaveLength(1);
    // a different capture under the same Completion cannot reuse the committed intent
    const changed = await h.store.commit(
      pairGroup(h, {
        origin: (o) => ({ ...o, chronology: { ...o.chronology, capture_hash: "c".repeat(64) } }),
        group: { group_id: group.group_id, intent_id: group.intent_id, cause: group.cause },
      }),
    );
    expect(changed.ok).toBe(false);
    expect(h.store.head().state_sha256).toBe(head);
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)!.value).toEqual(
      group.writes.find((w) => w.key === TEMPORAL_ORIGIN_KEY)!.value,
    );
  });
});

describe("A0-T08: producer bytes P/H/T/D", () => {
  it("v1 session bytes follow the unchanged formula; v2 differs only through the document; the delivered-bytes check passes", async () => {
    const h = await harness();
    const v1 = buildInput(h, { arm: 1 });
    const v2 = buildInput(h, { arm: 2 });
    const pin = { fact_key: "k/input", version: 1 };
    const args = (input: typeof v1) => ({
      campaign_id: h.campaignId,
      phase: "SCOPE" as const,
      input_pin: pin,
      input,
      genesis: [],
    });
    const a = buildProducerInput(args(v1));
    const b = buildProducerInput(args(v2));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    const parse = (bytes: Uint8Array) => JSON.parse(Buffer.from(bytes).toString("utf8"));
    const pa = parse(a.value.bytes);
    const pb = parse(b.value.bytes);
    // the v1 producer object embeds the v1 document verbatim, exactly as the base formula does
    expect(pa.chronology).toEqual(v1.chronology.document);
    expect(canonicalJson(pa.chronology)).toBe(canonicalJson(v1.chronology.document));
    // the v2 object embeds the v2 document verbatim; nothing else differs but the identities derived from it
    expect(pb.chronology).toEqual(v2.chronology.document);
    const strip = (p: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(p).filter(([k]) => k !== "chronology" && k !== "task_id"));
    expect(strip(pa)).toEqual(strip(pb));
    expect(a.value.input_hash).not.toBe(b.value.input_hash);
    expect(a.value.task_id).not.toBe(b.value.task_id);
    // the delivered-bytes check passes for D of each arm
    for (const built of [a.value, b.value]) {
      expect(
        deliveredProducerBytesViolation(built.bytes, {
          campaign_id: h.campaignId,
          setup_id: v1.setup_id,
          phase: "SCOPE",
          input: pin,
          task_id: built.task_id,
          input_hash: built.input_hash,
        }),
      ).toBeNull();
    }
    // the instruction map is unchanged: the same registered map serves both arms (the statement field is kept by v2)
    expect(resolveInstructionMap(v1.runner.instruction_hash)).toBeDefined();
    expect(v2.runner.instruction_hash).toBe(v1.runner.instruction_hash);
    expect(pb.chronology.statement).toBe(pa.chronology.statement);
    // and v1 captures built by the shipped operator path still have the v1 shape
    expect(v1Capture({ campaignId: h.campaignId }).format_version).toBe(1);
  });
});
