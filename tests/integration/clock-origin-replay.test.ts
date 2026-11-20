/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// F-014B A0 (CAL-TIME T-1) — the HISTORICAL half. Replay runs `verifyHistorical`, not `check`, so every rule the live tests exercise is
// asked again here of the historical verifier, two ways:
//   1. directly, against the exact incremental pre-state the core bound for the group (the shared pair-shape check and the
//      state-dependent precondition run in the separate Temporal hook);
//   2. through a HASH-VALID INTERPOSED JOURNAL: a store with no owner admission lets the forged group reach the journal with a valid
//      hash chain, and only a strict replay under the shipped fixture admission can refuse it.
// T1 MECHANISM ONLY. A0-T04 (replay half), A0-T06 (replay half), A0-T07 (replay half), A0-T09 (replay half), A0-T10 (replay half).
import { cpSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE,
  INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
  INITIAL_SETUP_RULES,
  factKind,
  initializeCapturedChronology,
} from "@immortalis/engine";
import { TEMPORAL_ORIGIN_KEY, TEMPORAL_STATE_KEY } from "@immortalis/contracts";
import {
  FIXTURE_POLICY,
  harness,
  intakeRequest,
  openFixtureCampaign,
} from "../support/initial-setup.ts";
import {
  admitInput,
  buildInput,
  commitPermissively,
  governing,
  inputGroupWithRule,
  pairGroup,
  strictReopen,
  syntheticOrigin,
  syntheticPairGroup,
  tracedAdmission,
  type PairOptions,
  type TracedStep,
} from "../support/clock-origin.ts";
import { must } from "../support/temporal.ts";

const scratchCopy = (from: string): string => {
  const to = mkdtempSync(join(tmpdir(), "immortalis-a0-journal-"));
  cpSync(from, to, { recursive: true });
  return to;
};
const reason = (v: { details?: unknown } | null): string | undefined =>
  (v?.details as { reason?: string } | undefined)?.reason;
/** a strict replay of the journal must refuse AT the forged group's own revision, by historical verification */
const expectReplayRefused = async (dir: string, name: string, revision: number) => {
  const reopened = await strictReopen(dir);
  expect(reopened.ok, name).toBe(false);
  if (reopened.ok) return;
  expect(reopened.error.code, name).toBe("REPLAY_MISMATCH");
  expect(reopened.error.message, name).toMatch(/entry fails historical verification/);
  expect((reopened.error.details as { revision?: number }).revision, name).toBe(revision);
};

describe("replay of the v2 chain at its Completion: the Temporal hook judges forged genesis groups directly", () => {
  let fixtureAdmission: ReturnType<typeof tracedAdmission>["admission"];
  let verify: (
    g: ReturnType<typeof pairGroup>,
  ) => ReturnType<NonNullable<typeof fixtureAdmission.verifyHistorical>>;
  let h: Awaited<ReturnType<typeof harness>>;
  let atCompletion: TracedStep;
  beforeAll(async () => {
    const traced = tracedAdmission();
    fixtureAdmission = traced.admission;
    h = await harness({ open: await openFixtureCampaign(undefined, {}, traced.admission) });
    const admitted = await admitInput(h);
    expect(admitted.ok).toBe(true);
    expect((await h.service.advance(admitted.setup_id)).status).toBe("COMPLETED");
    const g = governing(h);
    atCompletion = traced.trace.find((t) => t.group.writes[0]!.key === g.completionKey)!;
    verify = (group) => fixtureAdmission.verifyHistorical!(group, atCompletion.after);
  });

  it("control: the lawful pair, and the lawful pair in the other write order, are accepted", () => {
    expect(verify(pairGroup(h, { tag: "lawful" }))).toBeNull();
    expect(verify(pairGroup(h, { tag: "lawful-reversed", order: "origin-first" }))).toBeNull();
  });

  it("A0-T06: a third write, a transaction write, a non-zero version, the wrong rule, a mismatched basis or secrecy, a foreign owner", () => {
    const meta = {
      owner: "temporal_kernel",
      facet: "temporal_coordination",
      unit: null,
      basis: "original-message-captured-starting-chronology",
      secrecy: "engine-internal" as const,
      expected_version: 0,
    };
    const rows: [string, PairOptions, string][] = [
      [
        "a third write",
        { extraWrites: [{ key: "temporal/boundary-index", value: { entries: [] }, ...meta }] },
        "ORIGIN_PAIR_SHAPE",
      ],
      [
        "a transaction write",
        { extraWrites: [{ key: "temporal/transaction/tx-forged", value: {}, ...meta }] },
        "ORIGIN_PAIR_SHAPE",
      ],
      [
        "a non-zero version on the state",
        { stateWrite: { expected_version: 1 } },
        "ORIGIN_PAIR_SHAPE",
      ],
      [
        "a non-zero version on the origin",
        { originWrite: { expected_version: 1 } },
        "ORIGIN_PAIR_SHAPE",
      ],
      ["the kernel rule", { rule: factKind("temporal_state").rule }, "ORIGIN_PAIR_SHAPE"],
      [
        "another basis on the origin",
        { originWrite: { basis: "operator-record-only-confirmed-starting-chronology" } },
        "ORIGIN_PAIR_SHAPE",
      ],
      [
        "another secrecy on the origin",
        { originWrite: { secrecy: "local-operator-session" } },
        "ORIGIN_PAIR_SHAPE",
      ],
      ["an origin-only group", { omit: "state" }, "ORIGIN_PAIR_SHAPE"],
      [
        "a state with a transaction",
        { state: (s: any) => ({ ...s, last_transaction: "tx" }) },
        "ORIGIN_PAIR_SHAPE",
      ],
      [
        "another owner on the origin write",
        { originWrite: { owner: "world_state" } },
        "ORIGIN_PAIR_SHAPE",
      ],
      [
        "the same wrong basis on both writes",
        {
          stateWrite: { basis: "operator-record-only-confirmed-starting-chronology" },
          originWrite: { basis: "operator-record-only-confirmed-starting-chronology" },
        },
        "BASIS_LABEL",
      ],
    ];
    for (const [name, over, want] of rows)
      expect(reason(verify(pairGroup(h, { ...over, tag: name }))), name).toBe(want);
  });

  it("A0-T07: a lone state under either rule refuses against the v2 Completion's own Input", () => {
    expect(
      reason(verify(pairGroup(h, { omit: "origin", rule: factKind("temporal_state").rule }))),
    ).toBe("V2_REQUIRES_PAIRED_GENESIS");
    expect(reason(verify(pairGroup(h, { omit: "origin" })))).toBe("ORIGIN_PAIR_SHAPE");
  });

  it("A0-T09: every forged origin field is compared with the committed records by the historical verifier too", () => {
    const flip = (x: string) => (x[0] === "0" ? "1" : "0") + x.slice(1);
    const g = governing(h);
    const rows: [string, PairOptions, string][] = [
      ["campaign", { origin: (o) => ({ ...o, campaign_id: "campaign-other" }) }, "ORIGIN_CAMPAIGN"],
      [
        "time value",
        { origin: (o) => ({ ...o, origin: { ...o.origin, value: 3 } }) },
        "ORIGIN_TIME",
      ],
      ["unit", { origin: (o) => ({ ...o, origin: { ...o.origin, unit: "days" } }) }, "ORIGIN_TIME"],
      [
        "capture_ref",
        {
          origin: (o) => ({
            ...o,
            chronology: { ...o.chronology, capture_ref: "fixture:capture:x" },
          }),
        },
        "ORIGIN_CAPTURE",
      ],
      [
        "capture_hash",
        {
          origin: (o) => ({
            ...o,
            chronology: { ...o.chronology, capture_hash: flip(o.chronology.capture_hash) },
          }),
        },
        "ORIGIN_CAPTURE",
      ],
      [
        "document_hash",
        {
          origin: (o) => ({
            ...o,
            chronology: { ...o.chronology, document_hash: flip(o.chronology.document_hash) },
          }),
        },
        "ORIGIN_CAPTURE",
      ],
      [
        "grade",
        {
          origin: (o) => ({
            ...o,
            chronology: { ...o.chronology, grade: "OPERATOR_CONFIRMED_RECORD_ONLY" },
          }),
        },
        "ORIGIN_CAPTURE",
      ],
      [
        "Completion version",
        {
          origin: (o) => ({
            ...o,
            governing: { ...o.governing, completion: { ...o.governing.completion, version: 2 } },
          }),
        },
        "ORIGIN_GOVERNING",
      ],
      [
        "Input key",
        {
          origin: (o) => ({
            ...o,
            governing: { ...o.governing, input: { fact_key: g.completionKey, version: 1 } },
          }),
        },
        "ORIGIN_GOVERNING",
      ],
      [
        "a state that is not the Input's coordinate",
        { state: (s: any) => ({ ...s, canonical_time: { ...s.canonical_time, value: 5 } }) },
        "TIME_MISMATCH",
      ],
      ["no reads", { reads: [] }, undefined as never],
    ];
    for (const [name, over, want] of rows) {
      const verdict = verify(pairGroup(h, { ...over, tag: name }));
      expect(verdict, name).not.toBeNull();
      if (want) expect(reason(verdict), name).toBe(want);
    }
  });

  it("the verifier is wired: the historical hook does not run on a group that writes neither kind", () => {
    expect(
      fixtureAdmission.verifyHistorical!(
        { ...pairGroup(h, { tag: "unrelated" }), writes: [] },
        atCompletion.after,
      ),
    ).toBeNull();
  });
});

describe("hash-valid interposed journals are refused by strict replay", () => {
  let afterCompletion: string;
  let v1Base: string;
  let neverBase: string;
  let inputsBase: string;
  let h2: Awaited<ReturnType<typeof harness>>;
  let groups: { v2UnderV1Rule: any; v1UnderV2Rule: any; lawfulInput: any };
  let inputsRevision = 0;
  let completionRevision = 0;
  let v1Revision = 0;
  let neverRevision = 0;

  beforeAll(async () => {
    // a closed v2 campaign at its Completion
    const a = await harness();
    const admitted = await admitInput(a);
    expect((await a.service.advance(admitted.setup_id)).status).toBe("COMPLETED");
    completionRevision = a.store.head().revision;
    await a.campaign.close();
    afterCompletion = a.dir;
    // a closed v1 campaign at its Completion
    const b = await harness();
    const intake = await b.service.intake(await intakeRequest(b));
    expect((await b.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
    v1Revision = b.store.head().revision;
    await b.campaign.close();
    v1Base = b.dir;
    // a closed never-bootstrap campaign
    const c = await harness();
    neverRevision = c.store.head().revision;
    await c.campaign.close();
    neverBase = c.dir;
    // a closed campaign before any Input, with the forged Input groups built from its real state
    h2 = await harness();
    groups = {
      v2UnderV1Rule: inputGroupWithRule(
        h2,
        buildInput(h2, { arm: 2 }),
        INITIAL_SETUP_RULES.initial_setup_input,
      ),
      v1UnderV2Rule: inputGroupWithRule(
        h2,
        buildInput(h2, { arm: 1 }),
        INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
      ),
      lawfulInput: inputGroupWithRule(
        h2,
        buildInput(h2, { arm: 2 }),
        INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
      ),
    };
    inputsRevision = h2.store.head().revision;
    await h2.campaign.close();
    inputsBase = h2.dir;
  });

  it("control: a lawful v2 Input, and a lawful pair after a lawful chain, replay strictly", async () => {
    const dir = scratchCopy(inputsBase);
    expect((await commitPermissively(dir, [groups.lawfulInput]))[0]!.ok).toBe(true);
    const reopened = await must(strictReopen(dir));
    await reopened.close();
    const dir2 = scratchCopy(afterCompletion);
    // the harness for the lawful pair needs the facts of this very copy: build it from the closed campaign's own journal
    const ready = await must(strictReopen(dir2));
    const probe = { campaignId: ready.store.head().campaign_id, store: ready.store } as any;
    const lawful = pairGroup(probe, { tag: "lawful-journal" });
    await ready.close();
    expect((await commitPermissively(dir2, [lawful]))[0]!.ok).toBe(true);
    const replayed = await must(strictReopen(dir2));
    expect(replayed.verify()).toEqual([]);
    expect(replayed.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeDefined();
    await replayed.close();
  });

  it("A0-T04: a v2 Input under a v1 rule, and a v1 Input under a v2 rule, are refused on replay", async () => {
    for (const [name, group] of [
      ["v2 Input under the CORE_V9 v1 rule", groups.v2UnderV1Rule],
      ["v1 Input under the v2 rule", groups.v1UnderV2Rule],
    ] as const) {
      const dir = scratchCopy(inputsBase);
      expect((await commitPermissively(dir, [group]))[0]!.ok, name).toBe(true);
      await expectReplayRefused(dir, name, inputsRevision + 1);
    }
    expect(INITIAL_SETUP_INPUT_MS_V3_CHRONOLOGY_V2_RULE).toBeDefined();
  });

  it("A0-T07: a v1 Input with a pair, and a v2 Input with a lone state, are refused on replay", async () => {
    const reopenedV1 = await must(strictReopen(scratchCopy(v1Base)));
    const v1Probe = {
      campaignId: reopenedV1.store.head().campaign_id,
      store: reopenedV1.store,
    } as any;
    const v1Pair = pairGroup(v1Probe, {
      originValue: syntheticOrigin(v1Probe.campaignId),
      tag: "v1-pair",
    });
    await reopenedV1.close();
    const v1Dir = scratchCopy(v1Base);
    expect((await commitPermissively(v1Dir, [v1Pair]))[0]!.ok).toBe(true);
    await expectReplayRefused(v1Dir, "v1 Input with a pair", v1Revision + 1);

    const v2Dir = scratchCopy(afterCompletion);
    const ready = await must(strictReopen(v2Dir));
    const probe = { campaignId: ready.store.head().campaign_id, store: ready.store } as any;
    const lone = pairGroup(probe, {
      omit: "origin",
      rule: factKind("temporal_state").rule,
      tag: "lone",
    });
    await ready.close();
    expect((await commitPermissively(v2Dir, [lone]))[0]!.ok).toBe(true);
    await expectReplayRefused(v2Dir, "v2 Input with a lone state", completionRevision + 1);
  });

  it("A0-T09 and A0-T06: a forged origin value, and a three-write group, are refused on replay", async () => {
    const forgeries: [string, (probe: any) => ReturnType<typeof pairGroup>][] = [
      [
        "another campaign",
        (p) => pairGroup(p, { origin: (o) => ({ ...o, campaign_id: "campaign-other" }) }),
      ],
      [
        "another capture hash",
        (p) =>
          pairGroup(p, {
            origin: (o) => ({
              ...o,
              chronology: { ...o.chronology, capture_hash: "d".repeat(64) },
            }),
          }),
      ],
      [
        "a third write",
        (p) =>
          pairGroup(p, {
            extraWrites: [
              {
                key: "temporal/boundary-index",
                value: { entries: [] },
                owner: "temporal_kernel",
                facet: "temporal_coordination",
                unit: null,
                basis: "original-message-captured-starting-chronology",
                secrecy: "engine-internal",
                expected_version: 0,
              },
            ],
          }),
      ],
    ];
    for (const [name, build] of forgeries) {
      const dir = scratchCopy(afterCompletion);
      const ready = await must(strictReopen(dir));
      const probe = { campaignId: ready.store.head().campaign_id, store: ready.store } as any;
      const forged = build(probe);
      await ready.close();
      expect((await commitPermissively(dir, [forged]))[0]!.ok, name).toBe(true);
      await expectReplayRefused(dir, name, completionRevision + 1);
    }
  });

  it("A0-T10: an origin on a never-bootstrap prefix, and an origin late after the state, are refused on replay", async () => {
    const dir = scratchCopy(neverBase);
    const ready = await must(strictReopen(dir));
    const probe = { campaignId: ready.store.head().campaign_id, store: ready.store } as any;
    const pair = syntheticPairGroup(probe, { tag: "never" });
    await ready.close();
    expect((await commitPermissively(dir, [pair]))[0]!.ok).toBe(true);
    await expectReplayRefused(dir, "never-bootstrap pair", neverRevision + 1);

    // state first (the shipped one-write genesis), then an origin alone
    const dir2 = scratchCopy(neverBase);
    const r2 = await must(strictReopen(dir2));
    const probe2 = { campaignId: r2.store.head().campaign_id, store: r2.store } as any;
    const stateOnly = syntheticPairGroup(probe2, {
      omit: "origin",
      rule: factKind("temporal_state").rule,
      tag: "state-first",
    });
    const lateOrigin = syntheticPairGroup(probe2, { omit: "state", tag: "late-origin" });
    await r2.close();
    const committed = await commitPermissively(dir2, [stateOnly, lateOrigin]);
    expect(committed[0]!.ok).toBe(true);
    expect(committed[1]!.ok).toBe(true);
    await expectReplayRefused(dir2, "late origin", neverRevision + 2);
  });

  it("the unchanged v1 writer's journal still replays strictly (no origin, one write)", async () => {
    const dir = scratchCopy(v1Base);
    const ready = await must(strictReopen(dir));
    await must(initializeCapturedChronology(ready.store, { policy: FIXTURE_POLICY }));
    expect(ready.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
    expect(ready.store.getFact(TEMPORAL_STATE_KEY)!.version).toBe(1);
    await ready.close();
    const replayed = await must(strictReopen(dir));
    expect(replayed.verify()).toEqual([]);
    await replayed.close();
  });
});
