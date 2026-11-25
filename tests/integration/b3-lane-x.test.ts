import { WorkshopGipAdapter } from "../../packages/engine/src/owners/workshop/gip-direction.ts";
import { WorkshopHealthAdapter } from "../../packages/engine/src/owners/workshop/health-sensory.ts";
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
  it.each([
    "positive",
    "contrary",
    "c54-unresolved",
    "economy-withheld",
    "unknown-hearing",
  ] as const)(
    "resolves the native Lane X %s case",
    async (mode) => {
      let signed!: ReturnType<typeof signedWorkshopLaneX>;
      const h = await openWorkshop("glassbell", {
        laneX(keys) {
          signed = signedWorkshopLaneX(keys, mode !== "economy-withheld");
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
      let active = h.campaign;
      let store = active.store;
      let clock = new GmWaitCustody(store, policy);
      try {
        const duty = store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
        const root = signed.authorize(workshopView(store), x, duty.key);
        const publisher = new WorkshopNoticeAdapter(
          store,
          policy.historyVerificationId,
          signed.fixture.noticeSource,
        );
        const enrolled = await must(publisher.enrol(x, duty.key)!);
        const enrolment = store
          .listFacts()
          .find(
            (f) =>
              f.provenance.group_id === enrolled.receipt.group_id &&
              WorkshopNoticeEnrolmentSchema.safeParse(f.value).success,
          )!;
        const binding = WorkshopNoticeEnrolmentSchema.parse(enrolment.value).binding;
        const present = workshopView(store);
        const route = signed.fixture.noticeSource.atBoundary(present, binding)!;
        expect(route).toHaveLength(5);
        for (const mover of route) {
          expect(
            signed.fixture.noticeSource.atBoundary(
              {
                ...present,
                get: (key) =>
                  key === mover.key ? { ...mover, version: mover.version + 1 } : present.get(key),
              },
              binding,
            ),
          ).toBeUndefined();
        }
        const operation = store.getFact(h.charterInput.production_operation)!;
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
        if (mode === "contrary") {
          const instruction = store.getFact(
            WorkshopDutySchema.parse(duty.value).issued_instruction.key,
          )!;
          const request = signed.authorizeRevocation(workshopView(store), instruction);
          const gip = new WorkshopGipAdapter(store, h.profile, policy.historyVerificationId);
          await must(
            gip.revokeInstruction(
              instruction.key,
              request,
              signed.fixture.noticeSource.revocationSource,
            )!,
          );
        }
        await must(clock.publishMarker(markerInput));
        await must(clock.open(proof));
        const attempt = {
          ...foreignGroup(333),
          campaign_id: h.campaignId,
          cause: "transaction:" + txOf(x),
        };
        expect(await store.commit(attempt)).toMatchObject({
          ok: false,
          error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } },
        });
        if (mode === "c54-unresolved") signed.withholdC54();
        const credited = [];
        expect(await clock.sealOwn(x)).toMatchObject({ ok: false });
        for (let n = 0; n < 5; n++) {
          const before = store.head().revision;
          const first = advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource);
          const second =
            n === 1 ? advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource) : undefined;
          const next = await first;
          if (second) {
            const retry = await second;
            expect(retry).toMatchObject({
              status: "STAGE",
              result: { ok: true, value: { replayed: true } },
            });
            expect(store.head().revision).toBe(before + 1);
          }
          if (mode === "c54-unresolved" && n === 4) {
            expect(next).toEqual({ status: "UNRESOLVED" });
            expect(await clock.sealOwn(x)).toMatchObject({ ok: false });
            expect(clock.status(h.source.pc.id).state).toBe("ACTIVE");
            return;
          }
          if (mode === "economy-withheld" && n === 3) {
            expect(next).toMatchObject({
              status: "STAGE",
              result: {
                ok: false,
                error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } },
              },
            });
            expect(await clock.sealOwn(x)).toMatchObject({ ok: false });
            expect(clock.status(h.source.pc.id).state).toBe("ACTIVE");
            return;
          }
          expect(next.status).toBe("STAGE");
          if (next.status !== "STAGE") throw new Error(JSON.stringify(next));
          expect(next.result.ok, JSON.stringify(next)).toBe(true);
          if (!next.result.ok) throw new Error(JSON.stringify(next.result.error));
          credited.push(next.result.value.receipt.group_id);
          if (n === 1 && mode === "positive") {
            const published = store.committedGroup(next.result.value.receipt.intent_id)!;
            const head = store.head();
            expect(
              await store.commit({
                ...published,
                group_id: "duplicate:second-writer",
                intent_id: "duplicate:second-writer",
              }),
            ).toMatchObject({
              ok: false,
              error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } },
            });
            expect(store.head()).toEqual(head);
          }
          if (n === 0 && mode === "positive") {
            const head = store.head();
            await active.close();
            active = await must(h.reopen());
            store = active.store;
            clock = new GmWaitCustody(store, policy);
            expect(store.head()).toEqual(head);
            expect(clock.status(h.source.pc.id).state).toBe("ACTIVE");
          }
          expect(store.getFact(temporalTransactionKey(txOf(x)))).toBeUndefined();
        }
        expect(await advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource)).toEqual({
          status: "READY_TO_SEAL",
        });
        await must(clock.sealOwn(x));
        const seal = GmWaitStoredTransactionSchema.parse(
          store.getFact(temporalTransactionKey(txOf(x)))!.value,
        );
        expect(seal.stages.map((r) => r.group_id)).toEqual(credited);
        expect(seal.boundaries_crossed).toHaveLength(3);
        const occurrence = store
          .listFacts()
          .find((f) => WorkshopNoticeOccurrenceSchema.safeParse(f.value).success)!;
        if (mode === "contrary") {
          expect(occurrence).toBeUndefined();
          expect(
            WorkshopNoticeEnrolmentSchema.parse(store.getFact(enrolment.key)!.value).state,
          ).toMatchObject({ status: "INELIGIBLE_AT_BOUNDARY", failed: "C1" });
          await must(clock.reconcile(proof));
          expect(active.verify()).toEqual([]);
          return;
        }
        const event = WorkshopNoticeOccurrenceSchema.parse(occurrence.value);
        const anchor = store.committedGroup(h.anchor.receipt.intent_id)!.writes[0]!.key;
        expect(await clock.reconcile(proof)).toMatchObject({ ok: false });
        const health = new WorkshopHealthAdapter(store, h.profile, policy.historyVerificationId);
        await must(
          health.closeAuditoryFunction(
            occurrence.key,
            mode === "unknown-hearing" ? undefined : anchor,
          )!,
        );
        const close = store.listFacts().flatMap((f) => {
          const value = WorkshopSensoryCloseSchema.safeParse(f.value);
          return value.success ? [value.data] : [];
        });
        expect(close).toHaveLength(1);
        if (mode === "unknown-hearing") {
          expect(close[0]?.result).toBe("UNKNOWN");
          signed.authorizeRecipient(
            occurrence,
            event,
            store.getFact(PLAYER_CHARACTER_BINDING_KEY)!,
          );
          expect(
            publishWorkshopReceipt(
              store,
              occurrence.key,
              signed.fixture.noticeSource.recipientSource,
            ),
          ).toBeUndefined();
          await must(clock.reconcile(proof));
          return;
        }
        expect(close[0]?.result).toBe("AVAILABLE");
        expect(
          publishWorkshopReceipt(
            store,
            occurrence.key,
            signed.fixture.noticeSource.recipientSource,
          ),
        ).toBeUndefined();
        signed.authorizeRecipient(occurrence, event, store.getFact(PLAYER_CHARACTER_BINDING_KEY)!);
        await must(
          publishWorkshopReceipt(
            store,
            occurrence.key,
            signed.fixture.noticeSource.recipientSource,
          )!,
        );
        expect(store.getFact(accessEventKey("workshop-notice:" + event.notice_id))).toBeDefined();
        await must(clock.reconcile(proof));
        expect(
          GmWaitByPcIndexSchema.parse(store.getFact(temporalGmWaitByPcKey(event.pc_id))!.value)
            .state,
        ).toBe("SEALED_RECONCILED");
        expect(active.verify()).toEqual([]);
        const head = store.head();
        await active.close();
        const reloaded = await must(h.reopen());
        try {
          expect(reloaded.store.head()).toEqual(head);
        } finally {
          await reloaded.close();
        }
      } finally {
        await active.close();
      }
    },
    30000,
  );
});
