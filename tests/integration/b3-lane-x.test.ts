import { describe, expect, it } from "vitest";
import {
  GmWaitStoredTransactionSchema,
  PLAYER_CHARACTER_BINDING_KEY,
  accessEventKey,
  GmWaitByPcIndexSchema,
  temporalGmWaitByPcKey,
  temporalTransactionKey,
} from "@immortalis/contracts";
import {
  WorkshopDutySchema,
  WorkshopNoticeEnrolmentSchema,
  WorkshopNoticeOccurrenceSchema,
  WORKSHOP_SECOND,
  WorkshopSensoryCloseSchema,
} from "../../packages/contracts/src/workshop-opening.ts";
import { GmWaitCustody, factKind, sha256Canonical } from "@immortalis/engine";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { advanceWorkshopWaitStage } from "../../packages/engine/src/owners/workshop/lane-x.ts";
import { publishWorkshopReceipt } from "../../packages/engine/src/owners/workshop/epistemic-notice.ts";
import { WorkshopNoticeAdapter } from "../../packages/engine/src/owners/workshop/notice-publication.ts";
import { workshopNoticeTemporalObject } from "../../packages/engine/src/owners/workshop/notice-temporal.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop, openingPublication } from "../support/b3-opening.ts";
import { must } from "../support/temporal.ts";
import { foreignGroup, proofOf, txOf } from "./b2-support.ts";

describe("B3 Lane X with signed disposable owner sources", () => {
  it("commits native stages while OPEN, checks the sealed event, and reconciles after original recipient access", async () => {
    let signed!: ReturnType<typeof signedWorkshopLaneX>;
    const h = await openWorkshop("glassbell", {
      laneX(keys) {
        signed = signedWorkshopLaneX(keys);
        return signed.fixture;
      },
    });
    const proof = proofOf();
    const x = (gmWaitX("session-original-1", "1") as { x: string }).x;
    const target = { unit: WORKSHOP_SECOND, value: 600 };
    const policy = {
      catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
      historyVerificationId: h.admission.historyVerificationId!,
      kernelRule: factKind("temporal_state").rule,
    };
    const clock = new GmWaitCustody(h.store, policy);
    try {
      const duty = h.store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
      const root = signed.authorize(workshopView(h.store), x, duty.key);
      const publisher = new WorkshopNoticeAdapter(
        h.store,
        policy.historyVerificationId,
        signed.fixture.noticeSource,
      );
      const enrolled = await must(publisher.enrol(x, duty.key)!);
      const enrolment = h.store
        .listFacts()
        .find(
          (f) =>
            f.provenance.group_id === enrolled.receipt.group_id &&
            WorkshopNoticeEnrolmentSchema.safeParse(f.value).success,
        )!;
      const operation = h.store.getFact(h.charterInput.production_operation)!;
      const object = workshopNoticeTemporalObject(enrolment, operation)!;
      await must(h.register.registerObject({ ...openingPublication("notice-object"), object }));
      const markerInput = {
        proof,
        initialRequestSha256: root,
        request: {
          cause: "fixture:addressed-notice",
          triggerRef: "fixture:request",
          target,
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
      };
      await must(clock.publishMarker(markerInput));
      await must(clock.open(proof));
      const attempt = {
        ...foreignGroup(333),
        campaign_id: h.campaignId,
        cause: "transaction:" + txOf(x),
      };
      expect(await h.store.commit(attempt)).toMatchObject({
        ok: false,
        error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } },
      });
      const credited = [];
      expect(await clock.sealOwn(x)).toMatchObject({ ok: false });
      for (let n = 0; n < 5; n++) {
        const before = h.store.head().revision;
        const first = advanceWorkshopWaitStage(h.store, x, signed.fixture.noticeSource);
        const second =
          n === 1 ? advanceWorkshopWaitStage(h.store, x, signed.fixture.noticeSource) : undefined;
        const next = await first;
        if (second) {
          const retry = await second;
          expect(retry).toMatchObject({
            status: "STAGE",
            result: { ok: true, value: { replayed: true } },
          });
          expect(h.store.head().revision).toBe(before + 1);
        }
        expect(next.status).toBe("STAGE");
        if (next.status !== "STAGE") throw new Error(JSON.stringify(next));
        expect(next.result.ok, JSON.stringify(next)).toBe(true);
        credited.push((await must(next.result)).receipt.group_id);
        expect(h.store.getFact(temporalTransactionKey(txOf(x)))).toBeUndefined();
      }
      expect(await advanceWorkshopWaitStage(h.store, x, signed.fixture.noticeSource)).toEqual({
        status: "READY_TO_SEAL",
      });
      await must(clock.sealOwn(x));
      const seal = GmWaitStoredTransactionSchema.parse(
        h.store.getFact(temporalTransactionKey(txOf(x)))!.value,
      );
      expect(seal.stages.map((r) => r.group_id)).toEqual(credited);
      expect(seal.boundaries_crossed).toHaveLength(3);
      const occurrence = h.store
        .listFacts()
        .find((f) => WorkshopNoticeOccurrenceSchema.safeParse(f.value).success)!;
      const event = WorkshopNoticeOccurrenceSchema.parse(occurrence.value);
      const anchor = h.store.committedGroup(h.anchor.receipt.intent_id)!.writes[0]!.key;
      expect(await clock.reconcile(proof)).toMatchObject({ ok: false });
      await must(h.health.closeAuditoryFunction(occurrence.key, anchor)!);
      const close = h.store.listFacts().flatMap((f) => {
        const value = WorkshopSensoryCloseSchema.safeParse(f.value);
        return value.success ? [value.data] : [];
      });
      expect(close).toHaveLength(1);
      expect(close[0]?.result).toBe("AVAILABLE");
      expect(
        publishWorkshopReceipt(
          h.store,
          occurrence.key,
          signed.fixture.noticeSource.recipientSource,
        ),
      ).toBeUndefined();
      signed.authorizeRecipient(occurrence, event, h.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!);
      await must(
        publishWorkshopReceipt(
          h.store,
          occurrence.key,
          signed.fixture.noticeSource.recipientSource,
        )!,
      );
      expect(h.store.getFact(accessEventKey("workshop-notice:" + event.notice_id))).toBeDefined();
      await must(clock.reconcile(proof));
      expect(
        GmWaitByPcIndexSchema.parse(h.store.getFact(temporalGmWaitByPcKey(event.pc_id))!.value)
          .state,
      ).toBe("SEALED_RECONCILED");
      expect(h.campaign.verify()).toEqual([]);
      const head = h.store.head();
      await h.campaign.close();
      const reloaded = await must(h.reopen());
      try {
        expect(reloaded.store.head()).toEqual(head);
      } finally {
        await reloaded.close();
      }
    } finally {
      await h.campaign.close();
    }
  }, 30000);
});
