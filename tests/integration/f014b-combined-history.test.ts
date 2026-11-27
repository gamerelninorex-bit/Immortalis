// F-014B combined history: the G1 quiet-seal build (#148) on top of the accepted resolver (#149) and the accepted B3-E Economy forward grant (#146).
//
// What is exercised, with REAL journals: the two journals written by the ACCEPTED #146 build (main 7b446df8, catalogue 737ad89c; one per Economy class), and the
// pristine-main G0 journals. Every replay opens a package with NO checkpoint, so the historical verifier runs over every group. The current generation is this
// build's G1 one (a new identity AND a new catalogue), so for each journal BOTH policy factors differ from what it recorded.
//
// MECHANISM ONLY (scripted testkit owners). Claims nothing about a genuine host, a named client or retained storage.
import { describe, expect, it } from "vitest";
import {
  GmWaitCustody,
  StageProviderRegistry,
  TemporalCoordinator,
  factKind,
  sha256Canonical,
} from "@immortalis/engine";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import {
  resumeWorkshopWait,
  workshopDecisionOpportunity,
} from "../../packages/engine/src/owners/workshop/wait-decision.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { GM_WAIT_CATALOGUE_RETAINED_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  WORKSHOP_B3E_CATALOGUE_SHA256,
  WORKSHOP_GENERATION_149,
  WORKSHOP_GENERATION_B3E_DRAFT,
  WORKSHOP_GENERATION_B3E_FORWARD,
  WORKSHOP_GENERATION_G0,
  workshopCandidates,
  workshopCurrentGeneration,
  workshopEconomyForwardGeneration,
} from "../../packages/engine/src/owners/workshop/generation.ts";
import {
  B3_ECONOMY_FORWARD_HISTORY_SEGMENT,
  IF6B_POLICY,
} from "../../packages/engine/src/temporal/if6b-stage.ts";
import { JOURNALS, headKey, openGenuineLaneX } from "../support/f014b-original-policy.ts";
import { proofOf } from "./b2-support.ts";

const kernelRule = factKind("temporal_state").rule;
const clockOf = (
  store: ConstructorParameters<typeof GmWaitCustody>[0],
  meta: { catalogueSha256: string; historyVerificationId: string },
) =>
  new GmWaitCustody(store, {
    catalogueSha256: meta.catalogueSha256,
    historyVerificationId: meta.historyVerificationId,
    kernelRule,
  });
const refusedByGuard = (r: { ok: boolean; error?: unknown }) =>
  !r.ok &&
  (r.error as { details?: { reason?: string } } | undefined)?.details?.reason ===
    "WORKSHOP_ORIGINAL_POLICY_REPLAY_ONLY";

const ACCEPTED_146 = [
  [JOURNALS.b3eDraft, undefined, "draft class"],
  [JOURNALS.b3eForward, true, "forward class"],
] as const;

describe("authentic accepted #146 journals replay strictly under the G1 build, each under its own constructor", () => {
  for (const [name, forward, label] of ACCEPTED_146) {
    it(`${label}: ${name} opens, replays to its recorded head, the seal retry is inert`, async () => {
      const { meta, h2, opened } = await openGenuineLaneX(name, undefined, forward);
      // the premise: this build's identity AND catalogue are not the ones the accepted #146 build recorded
      expect(h2.admission.historyVerificationId).not.toBe(meta.historyVerificationId);
      expect(GM_WAIT_CATALOGUE_CURRENT_SHA256).not.toBe(meta.catalogueSha256);
      expect(meta.catalogueSha256).toBe(WORKSHOP_B3E_CATALOGUE_SHA256);
      expect(opened.ok, JSON.stringify(opened.ok ? null : opened.error)).toBe(true);
      if (!opened.ok) return;
      const store = opened.value.store;
      expect(headKey(store.head())).toEqual(headKey(meta.head));
      const clock = clockOf(store, meta);
      expect(clock.status(meta.pc).state).toBe("SEALED_UNRECONCILED");
      const before = headKey(store.head());
      const retry = await clock.sealOwn(meta.x);
      expect(retry.ok && retry.value.replayed).toBe(true);
      expect(headKey(store.head())).toEqual(before);
      await opened.value.close();
      await h2.campaign.close();
    });
  }
});

describe("class authority: a lineage is judged only by the constructor of its own Economy class", () => {
  const cases = [
    [JOURNALS.b3eForward, undefined, "an accepted FORWARD journal under the DRAFT constructor"],
    [JOURNALS.b3eDraft, true, "an accepted DRAFT journal under the FORWARD constructor"],
    [JOURNALS.staged, true, "a pristine-main G0 journal under the FORWARD constructor"],
    [JOURNALS.occurred, true, "a pristine-main G0 aftermath journal under the FORWARD constructor"],
  ] as const;
  for (const [name, forward, label] of cases) {
    it(`refuses ${label}`, async () => {
      const { h2, opened } = await openGenuineLaneX(name, undefined, forward);
      expect(opened.ok).toBe(false);
      if (!opened.ok) expect(opened.error.code).toBe("REPLAY_MISMATCH");
      else await opened.value.close();
      await h2.campaign.close();
    });
  }

  it("the candidate sets hold only their own class: the forward constructor lists no draft entry, the draft constructor no forward entry", async () => {
    const { h2, opened } = await openGenuineLaneX(JOURNALS.staged);
    if (opened.ok) await opened.value.close();
    await h2.campaign.close();
    const inputs = {
      base: "x",
      profileSha256: "p".repeat(64),
      laneX: { economyDraft: true },
    };
    const draft = workshopCandidates(inputs, workshopCurrentGeneration(IF6B_POLICY));
    const forward = workshopCandidates(
      inputs,
      workshopEconomyForwardGeneration(IF6B_POLICY, B3_ECONOMY_FORWARD_HISTORY_SEGMENT),
    );
    expect(draft.map((c) => c.id)).toEqual(["CURRENT", "B3E_DRAFT_146", "G0_RESOLVER_149", "G0"]);
    expect(forward.map((c) => c.id)).toEqual(["CURRENT", "B3E_FORWARD_146"]);
    expect(draft.some((c) => c.economyClass !== undefined)).toBe(false);
    expect(forward.every((c) => c.economyClass === "ECONOMY_REALIZED_ACCESS_FORWARD")).toBe(true);
  });
});

describe("novel mutations of an accepted #146 lineage are refused, exact retries stay inert", () => {
  for (const [name, forward, label] of ACCEPTED_146) {
    it(`${label}: a novel reconcile of the recorded SEALED_UNRECONCILED wait is refused by the replay-only guard and moves nothing`, async () => {
      const { meta, h2, opened } = await openGenuineLaneX(name, undefined, forward);
      expect(opened.ok).toBe(true);
      if (!opened.ok) return;
      const store = opened.value.store;
      const before = headKey(store.head());
      const r = await clockOf(store, meta).reconcile(proofOf());
      expect(refusedByGuard(r), JSON.stringify(r.ok ? "committed" : r.error)).toBe(true);
      expect(headKey(store.head())).toEqual(before);
      await opened.value.close();
      await h2.campaign.close();
    });
  }
});

describe("a novel CHOICE on an accepted #146 lineage awaiting one is refused by the replay-only guard", () => {
  const awaiting = [
    [JOURNALS.b3eDraftAwaiting, undefined, "draft class"],
    [JOURNALS.b3eForwardAwaiting, true, "forward class"],
  ] as const;
  for (const [name, forward, label] of awaiting) {
    it(`${label}: the recorded decision opportunity is real, and a newly authorized choice moves nothing`, async () => {
      const { meta, h2, signed, opened } = await openGenuineLaneX(name, undefined, forward);
      expect(opened.ok, JSON.stringify(opened.ok ? null : opened.error)).toBe(true);
      if (!opened.ok) return;
      const store = opened.value.store;
      expect(clockOf(store, meta).status(meta.pc).state).toBe("SEALED_RECONCILED");
      const opportunity = workshopDecisionOpportunity(workshopView(store), meta.x);
      expect(opportunity, "the genuine journal awaits a choice").toBeDefined();
      const before = headKey(store.head());
      const choiceRef = signed.choose(opportunity!.basis, "separate-confirmation");
      const result = await resumeWorkshopWait(
        store,
        new TemporalCoordinator(store, new StageProviderRegistry()),
        meta.x,
        choiceRef,
        signed.fixture.choiceSource,
      );
      expect(result?.ok).toBe(false);
      expect(
        refusedByGuard(result as { ok: boolean; error?: unknown }),
        JSON.stringify(result),
      ).toBe(true);
      expect(headKey(store.head())).toEqual(before);
      expect(workshopDecisionOpportunity(workshopView(store), meta.x)).toBeDefined(); // still awaiting; nothing was resumed
      await opened.value.close();
      await h2.campaign.close();
    });
  }
});

describe("every accepted generation is frozen history, and nothing unaccepted is registered", () => {
  it("the frozen entries recompute their own accepted identities and catalogues", () => {
    const inputs = {
      base: "A-LATER-BASE-THAT-MUST-NOT-MATTER",
      profileSha256: "a".repeat(64),
      noticeVerificationId: "fixture:C54:n",
      laneX: { economyDraft: true, choiceSha256: "c".repeat(64) },
    };
    const g0 = WORKSHOP_GENERATION_G0.identity(inputs);
    expect(WORKSHOP_GENERATION_149.identity(inputs)).toBe(g0);
    expect(WORKSHOP_GENERATION_B3E_DRAFT.identity(inputs)).toBe(g0);
    const forward = WORKSHOP_GENERATION_B3E_FORWARD.identity(inputs);
    expect(forward).not.toBe(g0);
    expect(forward).not.toContain("FIXTURE-ECONOMY-REALIZATION-DRAFT");
    expect(forward.endsWith(B3_ECONOMY_FORWARD_HISTORY_SEGMENT + "+" + IF6B_POLICY)).toBe(true);
    // the four accepted pairs are four distinct (identity, catalogue) pairs
    const pairs = [
      WORKSHOP_GENERATION_G0,
      WORKSHOP_GENERATION_149,
      WORKSHOP_GENERATION_B3E_DRAFT,
      WORKSHOP_GENERATION_B3E_FORWARD,
    ].map((g) => g.identity(inputs) + "|" + g.catalogueSha256);
    expect(new Set(pairs).size).toBe(4);
  });

  it("the retained catalogue set holds every accepted digest and neither the obsolete #146 draft nor the unmerged #148 manifest", () => {
    for (const accepted of [
      "81f6ccda0499b45c113c91f2c547892299d587da54e8777425f5fd8e61b6212d",
      "f7a4b7ee4094fdf8efa3d17a2f9ee4d3bea36114ce227c6e839489dd10ab9948",
      WORKSHOP_B3E_CATALOGUE_SHA256,
      GM_WAIT_CATALOGUE_CURRENT_SHA256,
    ])
      expect(GM_WAIT_CATALOGUE_RETAINED_SHA256).toContain(accepted);
    for (const refused of [
      "2673baaca7f32711815f4fafb81dbc5c1bcc16394dc7412763d7f4e89f2eb4d4",
      "4e0665b0d9c4c316976a7b9ac5986d22ec890ffc4b7f8e387a2df1b251ce967d",
    ])
      expect(GM_WAIT_CATALOGUE_RETAINED_SHA256).not.toContain(refused);
  });

  it("the checkpoint verifier identity is bound to the registry and the catalogue: removing an accepted generation moves it", async () => {
    const { h2, opened } = await openGenuineLaneX(JOURNALS.staged);
    if (opened.ok) await opened.value.close();
    const id = h2.admission.checkpointVerifierId!;
    const inputs = {
      base: "b",
      profileSha256: "p".repeat(64),
      laneX: { economyDraft: true },
    };
    const full = workshopCandidates(inputs, workshopCurrentGeneration(IF6B_POLICY));
    const withoutB3e = workshopCandidates(inputs, workshopCurrentGeneration(IF6B_POLICY), [
      WORKSHOP_GENERATION_149,
      WORKSHOP_GENERATION_G0,
    ]);
    expect(sha256Canonical(full)).not.toBe(sha256Canonical(withoutB3e));
    expect(id).toMatch(/\+WORKSHOP-ORIGINAL-POLICY-RESOLVER-V3:[0-9a-f]{64}$/);
    await h2.campaign.close();
  });
});
