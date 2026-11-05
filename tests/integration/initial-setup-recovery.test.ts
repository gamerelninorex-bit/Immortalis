/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// Initial Locality Bootstrap v0.9 — RECOVERY and the Temporal guard. A reserved invocation of unknown outcome is recover-or-park forever,
// never negative-void and never a reroll; restarts and competing resumers re-derive the same identities; cancellation is a terminal
// disposition that consumes the fingerprint; and a bootstrap-bearing prefix initializes time only from the captured chronology.
// MECHANISM ONLY (T1): scripted driver, fixture proofs. NOT a genuine host, NOT a named client; T2/T3 UNRUN (OB-030).
import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  OWNER_TEMPORAL_KERNEL,
  FACET_TEMPORAL_COORDINATION,
  TEMPORAL_STATE_KEY,
  initialLocalityCompletionKey,
  initialSetupInputKey,
} from "@immortalis/contracts";
import {
  StageProviderRegistry,
  TemporalCoordinator,
  fixtureCanonicalAdmission,
  initializeCapturedChronology,
  scanInitialSetup,
} from "@immortalis/engine";
import {
  InitialSetupService,
  PrivateRunner,
  authorizeOperatorDisposition,
} from "@immortalis/operator";
import {
  FIXTURE_SETUP_MESSAGE,
  ScriptedIsolatedDriver,
  delegatingScene,
  delegatingScope,
  publication,
} from "@immortalis/testkit";
import {
  BOOTSTRAP_CAMPAIGN,
  FIXTURE_POLICY,
  factsOf,
  harness,
  intakeRequest,
  reopenFixtureCampaign,
  type Harness,
} from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";

const answers = { scope: delegatingScope(), scene: delegatingScene() };
/** A fresh service + runner over the SAME campaign store, key and outbox: a process restart. */
const restart = (h: Harness, driver: ScriptedIsolatedDriver): InitialSetupService =>
  new InitialSetupService({
    campaignId: BOOTSTRAP_CAMPAIGN,
    store: h.store,
    runner: new PrivateRunner({
      keyId: h.keys.keyId,
      privateKeyPkcs8Base64: h.keys.privateKeyPkcs8Base64,
      publicKeySpkiBase64: h.keys.publicKeySpkiBase64,
      driver,
      outboxDir: h.outboxDir,
      macKey: h.macKey,
    }),
    verifier: h.verifier as any,
    policy: FIXTURE_POLICY,
  });

describe("reserved-before-send: recover or park, never regenerate", () => {
  it("a crash after the SCOPE send window opens stays unresolved across restarts; PARKED_UNKNOWN releases the freeze but consumes the fingerprint and the reservation", async () => {
    const driver = new ScriptedIsolatedDriver(answers, { throwAfterSend: true });
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    const setupId = intake.setup_id!;
    expect((await h.service.advance(setupId)).status).toBe("SCOPE_RESERVED_UNRESOLVED");
    expect((await h.service.advance(setupId)).status).toBe("SCOPE_RESERVED_UNRESOLVED");
    // restart: a new process finds the durable `started` marker and the canonical reservation; it never calls the driver again
    const after = restart(h, driver);
    expect((await after.advance(setupId)).status).toBe("SCOPE_RESERVED_UNRESOLVED");
    expect(driver.calls).toHaveLength(1);

    // an unauthorized caller cannot park; an authorized operator disposition does, and never erases the reservation
    expect((await after.parkUnknown(setupId, {} as any)).status).toBe("HOLD");
    const parked = await after.parkUnknown(setupId, authorizeOperatorDisposition());
    expect(parked).toMatchObject({ status: "TERMINAL", reason: "PARKED_UNKNOWN" });
    const session = scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!;
    expect(session.scopeReservation).toBeDefined();
    expect(session.scopeResponse).toBeUndefined();

    // the same input never invokes classification again; a changed authentic message may start a NEW SCOPE session (no SCENE reservation)
    expect((await after.intake(await intakeRequest(h, { request: "2" }))).status).toBe("REPEATED");
    const healthy = restart(h, new ScriptedIsolatedDriver(answers));
    const replacement = await healthy.intake(
      await intakeRequest(h, { message: `${FIXTURE_SETUP_MESSAGE} Keep it quiet.`, request: "3" }),
    );
    expect(replacement.status).toBe("ADMITTED");
    expect((await healthy.advance(replacement.setup_id!)).status).toBe("COMPLETED");
  });

  it("a crash after the SCENE send window opens: the SCENE slot is consumed for the locality, and time cannot be initialized by a plain fallback", async () => {
    const driver = new ScriptedIsolatedDriver(answers, { throwAfterSend: ["SCENE"] });
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    const setupId = intake.setup_id!;
    expect((await h.service.advance(setupId)).status).toBe("SCENE_RESERVED_UNRESOLVED");
    expect((await restart(h, driver).advance(setupId)).status).toBe("SCENE_RESERVED_UNRESOLVED");
    expect(driver.calls.map((c) => c.phase)).toEqual(["SCOPE", "SCENE"]);
    const parked = await h.service.parkUnknown(setupId, authorizeOperatorDisposition());
    expect(parked).toMatchObject({ status: "TERMINAL", reason: "PARKED_UNKNOWN" });
    // no fresh selection, ever, for this locality
    const retry = await h.service.intake(
      await intakeRequest(h, { message: `${FIXTURE_SETUP_MESSAGE} Add a stream.`, request: "2" }),
    );
    expect(retry).toMatchObject({ status: "REFUSED", reason: "SCENE_RESERVED" });
    // a plain KERNEL_RULE initial-time write is refused even after park: availability consequence disclosed, never a bypass
    const plain = await new TemporalCoordinator(
      h.store,
      new StageProviderRegistry(),
    ).establishCanonicalTime({
      ...publication(30),
      time: { unit: "seconds", value: 0 },
    });
    expect(!plain.ok && (plain.error.details as any)?.reason).toBe("NO_COMPLETION");
    expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();
  });

  it("two consecutive pre-reservation restarts and competing resumers preserve the active Input and yield one reservation and one dispatch per phase", async () => {
    const driver = new ScriptedIsolatedDriver(answers);
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    const setupId = intake.setup_id!;
    // two restarts before any reservation: the Input is retained untouched, nothing was reserved or dispatched
    restart(h, driver);
    restart(h, driver);
    expect(
      scanInitialSetup(factsOf(h.store)).sessions.get(setupId)!.scopeReservation,
    ).toBeUndefined();
    expect(driver.calls).toEqual([]);
    // competing resumers (separate processes sharing the store and the runner outbox)
    const resumers = [restart(h, driver), restart(h, driver), restart(h, driver)];
    await Promise.all(resumers.map((s) => s.advance(setupId)));
    // whichever raced, a later resume reconciles the same retained identities without a second model call
    for (const s of resumers) await s.advance(setupId);
    expect((await resumers[0]!.advance(setupId)).status).toBe("COMPLETED");
    expect(driver.calls.map((c) => c.phase)).toEqual(["SCOPE", "SCENE"]);
  });
});

describe("cancellation is a terminal disposition, not a restart", () => {
  it("cancels only before a reservation, permanently consumes the fingerprint, and a restart or new ids cannot revive it", async () => {
    const driver = new ScriptedIsolatedDriver(answers);
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    const setupId = intake.setup_id!;
    expect((await h.service.cancelBeforeReservation(setupId, {} as any)).status).toBe("HOLD");
    const cancelled = await h.service.cancelBeforeReservation(
      setupId,
      authorizeOperatorDisposition(),
    );
    expect(cancelled).toMatchObject({ status: "TERMINAL", reason: "CANCELLED_BEFORE_RESERVATION" });
    // a restart resumes nothing
    expect((await restart(h, driver).advance(setupId)).status).toBe("TERMINAL");
    expect(driver.calls).toEqual([]);
    // identical input returns the terminal barrier, whatever the client or request ids
    const again = await restart(h, driver).intake(await intakeRequest(h, { request: "9" }));
    expect(again).toMatchObject({ status: "REPEATED", setup_id: setupId });
    // a changed authentic message may start a new session; the plain-time fallback stays shut
    const next = await h.service.intake(
      await intakeRequest(h, { message: `${FIXTURE_SETUP_MESSAGE} Add a stream.`, request: "4" }),
    );
    expect(next.status).toBe("ADMITTED");
    const plain = await new TemporalCoordinator(
      h.store,
      new StageProviderRegistry(),
    ).establishCanonicalTime({
      ...publication(31),
      time: { unit: "seconds", value: 0 },
    });
    expect(plain.ok).toBe(false);
  });

  it("an existing reservation can only be parked, never cancelled", async () => {
    const driver = new ScriptedIsolatedDriver(answers, { throwAfterSend: true });
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    await h.service.advance(intake.setup_id!);
    const r = await h.service.cancelBeforeReservation(
      intake.setup_id!,
      authorizeOperatorDisposition(),
    );
    expect(r.status).toBe("SCOPE_RESERVED_UNRESOLVED");
    expect(
      scanInitialSetup(factsOf(h.store)).sessions.get(intake.setup_id!)!.disposition,
    ).toBeUndefined();
  });
});

describe("the Temporal guard: a bootstrap-bearing prefix initializes time only from the captured chronology", () => {
  async function completed() {
    const h = await harness();
    const intake = await h.service.intake(await intakeRequest(h));
    expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
    const facts = factsOf(h.store);
    const completion = facts.get(
      initialLocalityCompletionKey("world-fixture-1", "locus-fixture-1"),
    )!;
    const input = facts.get(
      initialSetupInputKey("world-fixture-1", "locus-fixture-1", intake.setup_id!),
    )!;
    return { h, completion, input };
  }
  const plainState = (time: unknown, over: Record<string, unknown> = {}) => ({
    ...publication(40),
    time,
    ...over,
  });

  it("refuses wrong time, missing Completion/Input dependencies and a mislabelled basis; the matching captured writer passes", async () => {
    const { h, completion, input } = await completed();
    const coordinator = new TemporalCoordinator(h.store, new StageProviderRegistry());
    const deps = {
      reads: [
        { key: completion.key, version: completion.version },
        { key: input.key, version: input.version },
      ],
      depends_on: [completion.provenance.group_id, input.provenance.group_id],
    };
    // wrong time (the captured chronology is 0 seconds)
    const wrong = await coordinator.establishCanonicalTime(
      plainState({ unit: "seconds", value: 5 }, deps),
    );
    expect(!wrong.ok && (wrong.error.details as any)?.reason).toBe("TIME_MISMATCH");
    // wrong unit
    const unit = await coordinator.establishCanonicalTime(
      plainState({ unit: "days", value: 0 }, deps),
    );
    expect(!unit.ok && (unit.error.details as any)?.reason).toBe("TIME_MISMATCH");
    // right time, but a plain KERNEL_RULE write with no Completion/Input reads or dependencies is not exempt
    const bare = await coordinator.establishCanonicalTime(
      plainState({ unit: "seconds", value: 0 }),
    );
    expect(bare.ok).toBe(false);
    // right time and dependencies, but the basis is not the grade-specific label of the capture
    const label = await coordinator.establishCanonicalTime(
      plainState(
        { unit: "seconds", value: 0 },
        { ...deps, basis: "operator-record-only-confirmed-starting-chronology" },
      ),
    );
    expect(!label.ok && (label.error.details as any)?.reason).toBe("BASIS_LABEL");
    expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();
    // the trusted writer derives everything from the Completion's own Input and asks no question
    const ok = await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    expect(ok.replayed).toBe(false);
    // production policy refuses fixture methods
    const refused = await initializeCapturedChronology(h.store);
    expect(refused.ok || refused.error.code).not.toBe(true);
  });

  it("the same pure precondition runs in historical verification against each incremental pre-state (a plain KERNEL_RULE mismatch rejects)", async () => {
    const { h, completion } = await completed();
    const state = {
      campaign_id: BOOTSTRAP_CAMPAIGN,
      revision: h.store.head().revision,
      facts: factsOf(h.store),
    };
    const group = (value: unknown, over: Record<string, unknown> = {}) => ({
      campaign_id: BOOTSTRAP_CAMPAIGN,
      group_id: "g:time",
      intent_id: "i:time",
      owner: OWNER_TEMPORAL_KERNEL,
      facet: FACET_TEMPORAL_COORDINATION,
      cause: "c:time",
      rule: h.store.getFact("world/world-fixture-1/profile")!.provenance.rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: TEMPORAL_STATE_KEY,
          owner: OWNER_TEMPORAL_KERNEL,
          facet: FACET_TEMPORAL_COORDINATION,
          value: { canonical_time: value, last_transaction: null, continuation: null },
          unit: null,
          basis: "x",
          secrecy: "y",
          expected_version: 0,
        },
      ],
      ...over,
    });
    const verify = (g: any) => fixtureCanonicalAdmission.verifyHistorical!(g, state as any);
    const mismatch = verify(group({ unit: "seconds", value: 9 }));
    expect(mismatch?.code).toBeDefined();
    // a prefix with no Completion rejects even the right time (checked on a state without the Completion)
    const noCompletion = new Map(state.facts);
    noCompletion.delete(completion.key);
    const early = fixtureCanonicalAdmission.verifyHistorical!(
      group({ unit: "seconds", value: 0 }) as any,
      {
        ...state,
        facts: noCompletion,
      } as any,
    );
    expect((early?.details as any)?.reason).toBe("NO_COMPLETION");
  });

  it("a never-bootstrap prefix keeps its existing initialization", async () => {
    const h = await harness();
    const ok = await new TemporalCoordinator(
      h.store,
      new StageProviderRegistry(),
    ).establishCanonicalTime({
      ...publication(41),
      time: { unit: "seconds", value: 7 },
    });
    expect(ok.ok).toBe(true);
  });
});

describe("replay needs no operator response file, private key or live provider", () => {
  it("deleting the operator outbox and reopening under the same admission reproduces the identical canonical state", async () => {
    const driver = new ScriptedIsolatedDriver(answers);
    const h = await harness({ driver });
    const intake = await h.service.intake(await intakeRequest(h));
    expect((await h.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
    await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    const head = h.store.head();
    await h.campaign.close();
    rmSync(h.outboxDir, { recursive: true, force: true });
    const reopened = await must(reopenFixtureCampaign(h.dir));
    expect(reopened.store.head().state_sha256).toBe(head.state_sha256);
    expect(reopened.verify()).toEqual([]);
    // the signature lineage verifies against the canonical admission-time key; no enrolled runner exists in this process
    await reopened.close();
  });
});
