/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts and scripted-host documents */
// Initial Locality Bootstrap v0.9 — the T1 MECHANISM chain through real code: record-only chronology capture → canonical Input
// (freeze) → SCOPE reservation → signed isolated Response → Referee classification (world-subject alternate branch) → Grant →
// SCENE reservation → signed Response → Completion → captured-chronology initialization, then close/reopen with STRICT historical
// replay. T1: the initial-message proofs and the isolated GM answers are explicitly labelled testkit fixtures; owner validation,
// publication, time and replay are real code. NOT original-message authenticity, NOT a genuine isolation-capable driver, NOT a
// named client: T2/T3 stay UNRUN (OB-030).
import { describe, expect, it } from "vitest";
import {
  INITIAL_SETUP_FACT_KIND_IDS,
  TEMPORAL_STATE_KEY,
  initialLocalityCompletionKey,
} from "@immortalis/contracts";
import { initializeCapturedChronology, scanInitialSetup } from "@immortalis/engine";
import {
  FIXTURE_POLICY,
  harness,
  intakeRequest,
  reopenFixtureCampaign,
} from "../support/initial-setup.ts";
import { must } from "../support/temporal.ts";

describe("T1 mechanism: source → SCOPE → Grant → SCENE → Completion → captured time", () => {
  it("a fresh original locality with no binding and no time completes through real owners, and replays strictly", async () => {
    const h = await harness();
    // entry: no native/physical binding, no canonical time
    expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();

    const intake = await h.service.intake(await intakeRequest(h));
    expect(intake.status).toBe("ADMITTED");
    const setupId = intake.setup_id!;

    const result = await h.service.advance(setupId);
    expect(result.status).toBe("COMPLETED");

    // exactly one SCOPE and one SCENE invocation, each after its canonical reservation
    expect(h.driver.calls.map((c) => c.phase)).toEqual(["SCOPE", "SCENE"]);

    const index = scanInitialSetup(new Map(h.store.listFacts().map((f) => [f.key, f])));
    const session = index.sessions.get(setupId)!;
    expect(session.scopeReservation && session.scopeResponse && session.grant).toBeTruthy();
    expect(index.sceneReservation && session.sceneResponse && index.completion).toBeTruthy();
    expect(session.disposition).toBeUndefined();

    // the emitted record kinds, in commit order (an omitted step cannot be silently stubbed)
    const order = h.store
      .listFacts()
      .filter((f) => f.key.includes("/initial-setup/") || f.key.startsWith("referee/"))
      .sort((a, b) => a.provenance.group_id.localeCompare(b.provenance.group_id));
    const kinds = new Set(
      order
        .map((f) => f.key.split("/").slice(-1)[0]!)
        .map((s) => (s === "SCOPE" || s === "SCENE" ? "response" : s)),
    );
    for (const expected of [
      "input",
      "scope-reservation",
      "scene-reservation",
      "response",
      "grant",
      "completion",
      "decision",
    ])
      expect(kinds.has(expected)).toBe(true);
    expect(INITIAL_SETUP_FACT_KIND_IDS).toHaveLength(6);

    // the world-subject classification went through the Referee kind's alternate branch
    const decision = order.find((f) => f.key.startsWith("referee/"))!;
    expect((decision.value as any).operation).toBe("WG_INITIAL_DELEGATION_CLASSIFY");
    expect((decision.value as any).verdict).toBe("SCOPE_AUTHORIZED");
    expect((decision.value as any).subject).toBeDefined();
    expect((decision.value as any).pc_id).toBeUndefined();

    // time is still absent: the capture and the Completion wrote none
    expect(h.store.getFact(TEMPORAL_STATE_KEY)).toBeUndefined();
    const time = await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    expect(time.replayed).toBe(false);
    const state = h.store.getFact(TEMPORAL_STATE_KEY)!;
    expect((state.value as any).canonical_time).toEqual({ unit: "seconds", value: 0 });
    expect(state.provenance.group_id).toMatch(/^captured-chronology:/);
    // idempotent by identity
    const again = await must(initializeCapturedChronology(h.store, { policy: FIXTURE_POLICY }));
    expect(again.replayed).toBe(true);

    expect(h.campaign.verify()).toEqual([]);
    const completionKey = initialLocalityCompletionKey("world-fixture-1", "locus-fixture-1");
    expect(h.store.getFact(completionKey)).toBeDefined();

    // close, reopen under the same admission: strict replay judges every group against its own incremental pre-state
    const head = h.store.head();
    await h.campaign.close();
    const reopened = await must(reopenFixtureCampaign(h.dir));
    expect(reopened.store.head().state_sha256).toBe(head.state_sha256);
    expect(reopened.verify()).toEqual([]);
    await reopened.close();
  });
});
