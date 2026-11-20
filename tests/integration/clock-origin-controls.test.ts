// F-014B A0 (CAL-TIME T-1) — legacy controls (A0-T16) and the operator half of A0-T03. T1 MECHANISM ONLY.
//
// Old v1, direct-operator and never-bootstrap routes stay state-only, opaque, one-write: never SI-eligible, never retrofitted, never given
// a late attestation. These controls run the unchanged routes through real code after the A0 change and assert their shape; the existing
// suites that pin the rest (MS v1 chain, the timed-governance dry run, the PR #107 S-4 ledger, the temporal-enforcement "established
// alone" cases) run unchanged in the same project and are named in the A0 report.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEMPORAL_ORIGIN_KEY, TEMPORAL_STATE_KEY } from "@immortalis/contracts";
import {
  CanonicalCampaign,
  StageProviderRegistry,
  TemporalCoordinator,
  INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE,
  LEGACY_RUNTIME_CONTRACT_SURFACE,
  factKind,
  initializeCapturedChronology,
  legacyContractAdmission,
} from "@immortalis/engine";
import { initializeTime } from "@immortalis/operator";
import { fixtureWorld, publication } from "@immortalis/testkit";
import {
  FIXTURE_POLICY,
  harness,
  intakeRequest,
  openFixtureCampaign,
} from "../support/initial-setup.ts";
import {
  FIXTURE_CAMPAIGN,
  copyCampaign,
  ctxOf,
  openSession,
  scriptedTerminal,
} from "../support/operator.ts";
import {
  V2_DOCUMENT,
  buildInput,
  inputGroupWithRule,
  strictReopen,
  syntheticPairGroup,
  tracedAdmission,
} from "../support/clock-origin.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

describe("A0-T16: v1 captured non-MS genesis is unchanged", () => {
  it("one write under the kernel rule, no origin, the same reads and dependencies; it replays strictly", async () => {
    const h = await harness();
    const intake = await h.service.intake(await intakeRequest(h));
    expect(intake.status).toBe("ADMITTED");
    expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
    await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
    expect(h.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
    expect(state.version).toBe(1);
    expect(state.provenance.rule).toEqual(factKind("temporal_state").rule);
    const group = h.store.committedGroup(state.provenance.intent_id)!;
    expect(group.writes.map((w) => w.key)).toEqual([TEMPORAL_STATE_KEY]);
    expect(group.reads).toHaveLength(2);
    expect(group.depends_on).toHaveLength(2);
    expect(h.campaign.verify()).toEqual([]);
    await h.campaign.close();
    const replayed = await must(strictReopen(h.dir));
    expect(replayed.verify()).toEqual([]);
    expect(replayed.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
    await replayed.close();
  });
});

describe("A0-T16 / A0-T03: the direct operator initialize-time route", () => {
  const chronology = (over: Record<string, unknown> = {}) => ({
    format: "immortalis-starting-chronology",
    format_version: 1,
    time: { unit: "season", value: 7 },
    statement: "SYNTHETIC FIXTURE: the morning the survey began, season 7",
    ...over,
  });
  const fileOf = (c: unknown): string => {
    const path = join(mkdtempSync(join(tmpdir(), "immortalis-chronology-")), "chronology.json");
    writeFileSync(path, JSON.stringify(c));
    chmodSync(path, 0o600);
    return path;
  };
  async function bare() {
    const dir = tempDir("immortalis-a0-direct-");
    const c = await must(
      CanonicalCampaign.create(dir, { campaignId: FIXTURE_CAMPAIGN, buildId: "a0-direct-seed" }),
    );
    await must(c.establishWorld({ ...publication(1), world: fixtureWorld() }));
    await c.close();
    return dir;
  }

  it("refuses a v2 document and writes nothing; its v1 chronology still yields a one-write, opaque, state-only origin", async () => {
    const s = await openSession(copyCampaign(await bare()));
    const head = s.campaign.store.head().state_sha256;
    const t = scriptedTerminal("confirm");
    for (const doc of [V2_DOCUMENT, chronology({ scale: "ONE_SI_SECOND_PER_CANONICAL_UNIT" })]) {
      const refused = await initializeTime(ctxOf(s, t), fileOf(doc));
      expect(refused.status).toBe("INVALID_INPUT");
    }
    expect(t.asked()).toBe(0);
    expect(s.campaign.store.head().state_sha256).toBe(head);
    const established = await initializeTime(
      ctxOf(s, scriptedTerminal("confirm")),
      fileOf(chronology()),
    );
    expect(established.status).toBe("TIME_ESTABLISHED");
    const state = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    expect(s.campaign.store.getFact(TEMPORAL_ORIGIN_KEY)).toBeUndefined();
    expect(state.provenance.rule).toEqual(factKind("temporal_state").rule);
    expect(s.campaign.store.committedGroup(state.provenance.intent_id)!.writes).toHaveLength(1);
    // no late attestation: a pair cannot be added to a direct origin afterwards
    const coordinator = new TemporalCoordinator(s.campaign.store, new StageProviderRegistry());
    expect(coordinator.state()!.value.canonical_time).toEqual({ unit: "season", value: 7 });
    await s.close();
  }, 120_000);
});

describe("A0-T16 / A0-T15: the captured route, and so the pair, is unreachable inside a pre-v0.9 legacy package", () => {
  it("under the legacy wrapper an origin has no bootstrap record to attest and the six record kinds are refused outright", async () => {
    const { admission, trace } = tracedAdmission();
    const h = await harness({ open: await openFixtureCampaign(undefined, {}, admission) });
    const state = trace.at(-1)!.after;
    const legacy = legacyContractAdmission(admission);
    const pair = syntheticPairGroup(h, { tag: "legacy" });
    // the derived legacy identity carries the new segments, so a legacy package replays strictly on its first open
    expect(legacy.historyVerificationId).toContain("+CAL-TIME-T1-CLOCK-ORIGIN@");
    for (const verdict of [legacy.check(pair, state), legacy.verifyHistorical!(pair, state)])
      expect(verdict).toMatchObject({ details: { reason: "NO_BOOTSTRAP_WITNESS" } });
    // and the Completion that the captured route requires is itself refused: the route cannot start
    const admitted = buildInput(h);
    const inputGroup = inputGroupWithRule(h, admitted, INITIAL_SETUP_INPUT_V9_CHRONOLOGY_V2_RULE);
    expect(legacy.check(inputGroup, state)).toMatchObject({
      details: { reason: LEGACY_RUNTIME_CONTRACT_SURFACE },
    });
    await h.campaign.close();
  });
});
