// F-014B replay prerequisite: the bounded original-policy resolver, tested against GENUINE journals written by pristine main d0bcb615.
//
// The journals under tests/fixtures/f014b-original-policy were written by a build that has none of this code, so the policy they carry is
// the policy an older build really wrote, not one the candidate wrote about itself. Every package is opened WITHOUT a checkpoint, so every
// open below is a strict replay: the historical verifier runs over every group and nothing is taken on trust.
//
// "Successor" below is a SYNTHETIC successor generation standing in as the build's CURRENT generation (testkit-only injection): a different
// workshop history identity and a different catalogue digest. The real #146 / #148 factors are rehearsed on an isolated combination branch
// (see the PR description); this file proves the mechanism they plug into.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CanonicalCampaign,
  GmWaitCustody,
  StageProviderRegistry,
  TemporalCoordinator,
  factKind,
  sha256Canonical,
} from "@immortalis/engine";
import { GM_WAIT_IF6B_QUIET_SEAL_SEGMENT } from "@immortalis/contracts";
import { generateFixtureRunnerKeys } from "@immortalis/testkit";
import {
  WORKSHOP_SECOND,
  WorkshopDutySchema,
  WorkshopNoticeEnrolmentSchema,
} from "../../packages/contracts/src/workshop-opening.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import { advanceWorkshopWaitStage } from "../../packages/engine/src/owners/workshop/lane-x.ts";
import { WorkshopNoticeAdapter } from "../../packages/engine/src/owners/workshop/notice-publication.ts";
import { workshopNoticeTemporalObject } from "../../packages/engine/src/owners/workshop/notice-temporal.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  WORKSHOP_B3E_CATALOGUE_SHA256,
  WORKSHOP_B3E_FORWARD_SEGMENT,
  WORKSHOP_G0_CATALOGUE_SHA256,
  WORKSHOP_GENERATION_G0,
  WORKSHOP_GENERATION_149,
  workshopCandidates,
  workshopCurrentGeneration,
  workshopEconomyForwardGeneration,
  type WorkshopGeneration,
} from "../../packages/engine/src/owners/workshop/generation.ts";
import { workshopFixtureIdentity } from "../../packages/engine/src/owners/workshop/source.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { resumeWorkshopWait } from "../../packages/engine/src/owners/workshop/wait-decision.ts";
import {
  B3_ECONOMY_FORWARD_HISTORY_SEGMENT,
  IF6B_POLICY,
} from "../../packages/engine/src/temporal/if6b-stage.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop, openingPublication, workshopRawProfile } from "../support/b3-opening.ts";
import { must } from "../support/temporal.ts";
import { deterministicFixtureKeys } from "../support/deterministic-keys.ts";
import {
  FIX,
  JOURNALS,
  LANE_X,
  SUCCESSOR,
  fixtureCopy,
  headKey,
  metaOf,
  openGenuineLaneX,
  withoutCheckpoints,
} from "../support/f014b-original-policy.ts";
import {
  FIXTURE_ADMISSION,
  FIXTURE_PC_ID,
  copyPackage,
  custodyPolicy,
  proofOf,
  reopen,
} from "./b2-support.ts";

describe("fixtures are the genuine, unaltered bytes", () => {
  it("every vendored file recomputes against SHA256SUMS", () => {
    const sums = readFileSync(join(FIX, "SHA256SUMS"), "utf8").trim().split("\n");
    expect(sums.length).toBeGreaterThan(30);
    for (const line of sums) {
      const [digest, path] = [line.slice(0, 64), line.slice(66)];
      expect(
        createHash("sha256")
          .update(readFileSync(join(FIX, path)))
          .digest("hex"),
        path,
      ).toBe(digest);
    }
  });
  it("carries no private key material", () => {
    for (const name of Object.values(JOURNALS)) {
      const text = readFileSync(join(FIX, "journals", name, "meta.json"), "utf8");
      expect(text).not.toMatch(/PRIVATE KEY|privateKeyPkcs8/);
    }
  });
});

describe("the generation registry is finite and exact", () => {
  const inputsOf = async (name: string) => {
    const { meta, h2, signed, opened } = await openGenuineLaneX(name);
    if (opened.ok) await opened.value.close();
    await h2.campaign.close();
    const id = h2.admission.historyVerificationId!;
    return {
      meta,
      inputs: {
        base: id.slice(0, id.indexOf("+B3-WORKSHOP-OWNER-V1:")),
        profileSha256: workshopFixtureIdentity(workshopRawProfile("glassbell")).sha256,
        noticeVerificationId: signed.fixture.noticeSource.verificationId,
        laneX: {
          economyDraft: true,
          choiceSha256: sha256Canonical(signed.fixture.choiceSource!.verificationId),
        },
      },
    };
  };

  it("G0's frozen recipe reproduces the identity the pristine-main journals recorded, for every Lane X journal", async () => {
    for (const name of LANE_X) {
      const { meta, inputs } = await inputsOf(name);
      expect(WORKSHOP_GENERATION_G0.identity(inputs), name).toBe(meta.historyVerificationId);
      // frozen: a different shared base (a later segment, a changed composition) does not move G0, and does move the current generation
      const moved = { ...inputs, base: inputs.base + "+A-LATER-SHARED-SEGMENT" };
      expect(WORKSHOP_GENERATION_G0.identity(moved), name).toBe(meta.historyVerificationId);
      expect(workshopCurrentGeneration(IF6B_POLICY).identity(moved)).not.toBe(
        meta.historyVerificationId,
      );
      expect(WORKSHOP_GENERATION_G0.catalogueSha256).toBe(meta.catalogueSha256);
    }
    expect(WORKSHOP_G0_CATALOGUE_SHA256).toBe(
      "81f6ccda0499b45c113c91f2c547892299d587da54e8777425f5fd8e61b6212d",
    );
  });

  it("retains every accepted generation, frozen, and keeps each Economy class on its own candidates", async () => {
    const { inputs } = await inputsOf(JOURNALS.staged);
    const draft = workshopCandidates(inputs, workshopCurrentGeneration(IF6B_POLICY));
    // the current generation (G1) first, then every accepted draft-class pair; no forward-class entry is a draft candidate
    expect(draft.map((c) => c.id)).toEqual(["CURRENT", "B3E_DRAFT_146", "G0_RESOLVER_149", "G0"]);
    expect(draft[0]!.binding.catalogueSha256).toBe(GM_WAIT_CATALOGUE_CURRENT_SHA256);
    expect(draft[1]!.binding.catalogueSha256).toBe(WORKSHOP_B3E_CATALOGUE_SHA256);
    expect(draft[2]!.binding.catalogueSha256).toBe(WORKSHOP_GENERATION_149.catalogueSha256);
    expect(draft[3]!.binding.catalogueSha256).toBe(WORKSHOP_G0_CATALOGUE_SHA256);
    expect(draft.some((c) => c.economyClass)).toBe(false);
    // the three accepted draft pairs share G0's identity recipe; the current one is the same identity plus the G1 segment immediately before the terminal one
    const g0Id = draft[3]!.binding.historyId;
    expect(draft[1]!.binding.historyId).toBe(g0Id);
    expect(draft[2]!.binding.historyId).toBe(g0Id);
    expect(draft[0]!.binding.historyId).toBe(
      g0Id.replace("+" + IF6B_POLICY, GM_WAIT_IF6B_QUIET_SEAL_SEGMENT + "+" + IF6B_POLICY),
    );
    expect(new Set(draft.map((c) => c.binding.catalogueSha256)).size).toBe(4);

    const forward = workshopCandidates(
      inputs,
      workshopEconomyForwardGeneration(IF6B_POLICY, B3_ECONOMY_FORWARD_HISTORY_SEGMENT),
    );
    // the forward constructor lists only forward-class candidates: the draft entries are not candidates of a forward build (no class laundering)
    expect(forward.map((c) => c.id)).toEqual(["CURRENT", "B3E_FORWARD_146"]);
    expect(forward.every((c) => c.economyClass === "ECONOMY_REALIZED_ACCESS_FORWARD")).toBe(true);
    expect(forward[1]!.binding.catalogueSha256).toBe(WORKSHOP_B3E_CATALOGUE_SHA256);
    expect(forward[1]!.binding.historyId).toContain(WORKSHOP_B3E_FORWARD_SEGMENT);
    expect(forward[1]!.binding.historyId).not.toContain("FIXTURE-ECONOMY-REALIZATION-DRAFT");
    expect(
      forward[1]!.binding.historyId.endsWith(WORKSHOP_B3E_FORWARD_SEGMENT + "+" + IF6B_POLICY),
    ).toBe(true);
    expect(
      forward[0]!.binding.historyId.endsWith(
        B3_ECONOMY_FORWARD_HISTORY_SEGMENT + GM_WAIT_IF6B_QUIET_SEAL_SEGMENT + "+" + IF6B_POLICY,
      ),
    ).toBe(true);
    // the frozen forward segment is exactly the live one today, and is a literal
    expect(WORKSHOP_B3E_FORWARD_SEGMENT).toBe(B3_ECONOMY_FORWARD_HISTORY_SEGMENT);
    // neither obsolete nor unmerged catalogue digests are registered as history
    const ids = [...draft, ...forward].map((c) => c.binding.catalogueSha256);
    expect(ids.some((d) => d.startsWith("2673ba") || d.startsWith("4e0665b0"))).toBe(false);

    const withSuccessor = workshopCandidates(inputs, SUCCESSOR);
    expect(withSuccessor.map((c) => c.id)).toEqual([
      "SYNTHETIC-SUCCESSOR",
      "B3E_DRAFT_146",
      "G0_RESOLVER_149",
      "G0",
    ]);
  });
});

describe("genuine pristine-main journals replay strictly under this build", () => {
  for (const name of LANE_X) {
    it(`${name}: opens, replays to the recorded head, retries are inert`, async () => {
      const { meta, h2, opened, signed } = await openGenuineLaneX(name);
      expect(opened.ok, JSON.stringify(opened.ok ? null : opened.error)).toBe(true);
      if (!opened.ok) return;
      const store = opened.value.store;
      expect(headKey(store.head())).toEqual(headKey(meta.head));
      const clock = new GmWaitCustody(store, {
        catalogueSha256: meta.catalogueSha256,
        historyVerificationId: meta.historyVerificationId,
        kernelRule: factKind("temporal_state").rule,
      });
      expect(clock.status(meta.pc).state).toBe(meta.slotAtClose);
      const before = headKey(store.head());
      const retry = await clock.sealOwn(meta.x);
      if (name === JOURNALS.active) expect(retry.ok).toBe(false);
      else expect(retry.ok && retry.value.replayed).toBe(true);
      if (meta.choiceRef) {
        const r = await resumeWorkshopWait(
          store,
          new TemporalCoordinator(store, new StageProviderRegistry()),
          meta.x,
          meta.choiceRef,
          signed.fixture.choiceSource,
        );
        expect(r?.ok).toBe(true);
      }
      expect(headKey(store.head())).toEqual(before);
      await opened.value.close();
      await h2.campaign.close();
    });
  }

  for (const name of [JOURNALS.b2, JOURNALS.b2Prior]) {
    it(`${name}: the B2 custody journal opens and replays to the recorded head`, async () => {
      const meta = metaOf(name);
      const opened = await reopen(fixtureCopy(name), FIXTURE_ADMISSION);
      expect(opened.ok, JSON.stringify(opened.ok ? null : opened.error)).toBe(true);
      if (!opened.ok) return;
      expect(headKey(opened.value.store.head())).toEqual(headKey(meta.head));
      expect(
        new GmWaitCustody(opened.value.store, custodyPolicy(FIXTURE_ADMISSION)).status(
          FIXTURE_PC_ID,
        ).state,
      ).toBe(meta.slotAtClose);
      await opened.value.close();
    });
  }
});

describe("the same journals replay strictly under a build whose CURRENT generation is a successor", () => {
  for (const name of LANE_X) {
    it(`${name}: both policy factors differ from the journal's, and the lineage still replays under its original policy`, async () => {
      const { meta, h2, opened } = await openGenuineLaneX(name, SUCCESSOR);
      // the premise: this build's identity AND catalogue are not the ones the journal recorded
      expect(h2.admission.historyVerificationId).not.toBe(meta.historyVerificationId);
      expect(h2.admission.historyVerificationId).toContain("SYNTHETIC-SUCCESSOR-SEGMENT");
      expect(SUCCESSOR.catalogueSha256).not.toBe(meta.catalogueSha256);
      expect(opened.ok, JSON.stringify(opened.ok ? null : opened.error)).toBe(true);
      if (!opened.ok) return;
      const store = opened.value.store;
      expect(headKey(store.head())).toEqual(headKey(meta.head));
      // the recorded lineage is still judged, and only readable, under G0; its slot is what was recorded
      const clock = new GmWaitCustody(store, {
        catalogueSha256: meta.catalogueSha256,
        historyVerificationId: meta.historyVerificationId,
        kernelRule: factKind("temporal_state").rule,
      });
      expect(clock.status(meta.pc).state).toBe(meta.slotAtClose);
      await opened.value.close();
      await h2.campaign.close();
    });
  }

  it("premise: under the successor build the CURRENT pair is not the pair the genuine lineage recorded", async () => {
    const { meta, h2, opened } = await openGenuineLaneX(JOURNALS.staged, SUCCESSOR);
    if (opened.ok) await opened.value.close();
    const duty = h2.campaign.store
      .listFacts()
      .find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
    // under the successor's own opening the duty carries the successor's pair; the genuine journal's carries G0's: they differ
    expect(JSON.stringify((duty.value as { policy: unknown }).policy)).not.toContain(
      meta.historyVerificationId,
    );
    await h2.campaign.close();
  });
});

describe("a lineage chartered under the successor is judged under the successor", () => {
  /** the evidence generator's staged Lane X flow (target 900, five stages and the GM seal), published under the SUCCESSOR's own pair */
  async function freshSuccessorJournal(generation = SUCCESSOR) {
    const keys = deterministicFixtureKeys(generateFixtureRunnerKeys().keyId);
    let signed!: ReturnType<typeof signedWorkshopLaneX>;
    const pair = (id: string) => ({ historyId: id, catalogueSha256: generation.catalogueSha256 });
    const h = await openWorkshop("glassbell", {
      fixedKeys: keys,
      currentGeneration: generation,
      historyRef: pair,
      laneX(k) {
        signed = signedWorkshopLaneX(k, true);
        return signed.fixture;
      },
    });
    const store = h.campaign.store;
    const id = h.admission.historyVerificationId!;
    const clock = new GmWaitCustody(store, {
      catalogueSha256: generation.catalogueSha256,
      historyVerificationId: id,
      kernelRule: factKind("temporal_state").rule,
    });
    const duty = store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
    const publisher = new WorkshopNoticeAdapter(store, pair(id), signed.fixture.noticeSource);
    const x = (gmWaitX("session-original-1", "1") as { x: string }).x;
    const proof = proofOf();
    const root = signed.authorize(workshopView(store), x, duty.key);
    const enrolled = await must(publisher.enrol(x, duty.key)!);
    const enrolment = store
      .listFacts()
      .find(
        (f) =>
          f.provenance.group_id === enrolled.receipt.group_id &&
          WorkshopNoticeEnrolmentSchema.safeParse(f.value).success,
      )!;
    await must(
      h.register.registerObject({
        ...openingPublication("notice-object"),
        object: workshopNoticeTemporalObject(
          enrolment,
          store.getFact(h.charterInput.production_operation)!,
        )!,
      }),
    );
    await must(
      clock.publishMarker({
        proof,
        initialRequestSha256: root,
        request: {
          cause: "fixture:addressed-notice",
          triggerRef: "fixture:request",
          target: { unit: WORKSHOP_SECOND, value: 900 },
          publication: { basis: "fixture-basis", secrecy: "fixture-sealed" },
        },
        preparation: {
          kind: "OWNER_PENDING_ENROLMENT" as const,
          owner: enrolment.owner,
          fact: {
            key: enrolment.key,
            version: enrolment.version,
            group_id: enrolment.provenance.group_id,
          },
          digest: sha256Canonical(enrolment.value),
        },
      }),
    );
    await must(clock.open(proof));
    for (let n = 0; n < 14; n++) {
      const stage = await advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource);
      if (stage.status !== "STAGE" || !stage.result.ok) break;
    }
    await must(clock.sealOwn(x));
    const head = store.head();
    const dir = h.dir as string;
    const slot = clock.status(h.source.pc.id).state;
    await h.campaign.close();
    return { keys, signed, head, dir, x, slot, pc: h.source.pc.id };
  }

  const reopenWith = async (
    f: Awaited<ReturnType<typeof freshSuccessorJournal>>,
    generation: WorkshopGeneration | undefined,
  ) => {
    let signed!: ReturnType<typeof signedWorkshopLaneX>;
    const h2 = await openWorkshop("glassbell", {
      fixedKeys: f.keys,
      ...(generation
        ? {
            currentGeneration: generation,
            historyRef: (id: string) => ({
              historyId: id,
              catalogueSha256: generation.catalogueSha256,
            }),
          }
        : {}),
      laneX(k) {
        signed = signedWorkshopLaneX(k, true);
        return signed.fixture;
      },
    });
    signed.importAuthorizations(f.signed.exportAuthorizations());
    const opened = await CanonicalCampaign.open(withoutCheckpoints(copyPackage(f.dir)), {
      testkitFixtureAdmission: h2.admission,
    });
    return { h2, opened };
  };

  it("replays strictly under the successor that chartered it", async () => {
    const f = await freshSuccessorJournal();
    expect(f.slot).toBe("SEALED_UNRECONCILED");
    const { h2, opened } = await reopenWith(f, SUCCESSOR);
    expect(opened.ok, JSON.stringify(opened.ok ? null : opened.error)).toBe(true);
    if (opened.ok) {
      expect(headKey(opened.value.store.head())).toEqual(headKey(f.head));
      await opened.value.close();
    }
    await h2.campaign.close();
  });

  it("is refused by a build that does not know that generation: a recorded pair no registry entry recomputes to is not interpreted", async () => {
    const f = await freshSuccessorJournal();
    const { h2, opened } = await reopenWith(f, undefined);
    expect(opened.ok).toBe(false);
    if (opened.ok) await opened.value.close();
    await h2.campaign.close();
  });

  it("replays the exact accepted #149 catalogue and recipe through the current resolver", async () => {
    const f = await freshSuccessorJournal(WORKSHOP_GENERATION_149);
    const { h2, opened } = await reopenWith(f, undefined);
    const campaign = await must(Promise.resolve(opened));
    try {
      expect(headKey(campaign.store.head())).toEqual(headKey(f.head));
    } finally {
      await campaign.close();
      await h2.campaign.close();
    }
  });
});
