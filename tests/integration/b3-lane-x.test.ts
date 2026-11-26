import { WorkshopGipAdapter } from "../../packages/engine/src/owners/workshop/gip-direction.ts";
import { WorkshopHealthAdapter } from "../../packages/engine/src/owners/workshop/health-sensory.ts";
import { describe, expect, it, vi } from "vitest";
import {
  AccessEventSchema,
  GmWaitStoredTransactionSchema,
  JsonValueSchema,
  economyRequestId,
  economyRequestKey,
  PLAYER_CHOICE_AUTHORITY,
  temporalObjectKey,
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
import {
  EconomyAdapter,
  GmWaitCustody,
  factKind,
  productionTemporalObject,
  sha256Canonical,
  StageProviderRegistry,
  TemporalCoordinator,
  verifyEpistemicIntegrity,
} from "@immortalis/engine";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import { advanceWorkshopWaitStage } from "../../packages/engine/src/owners/workshop/lane-x.ts";
import { publishWorkshopReceipt } from "../../packages/engine/src/owners/workshop/epistemic-notice.ts";
import {
  deriveNoticeOccurrence,
  WorkshopNoticeAdapter,
} from "../../packages/engine/src/owners/workshop/notice-publication.ts";
import { workshopNoticeTemporalObject } from "../../packages/engine/src/owners/workshop/notice-temporal.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import {
  resumeWorkshopWait,
  workshopDecisionOpportunity,
} from "../../packages/engine/src/owners/workshop/wait-decision.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import * as if6b from "../../packages/engine/src/temporal/if6b-stage.ts";
import { economyProviders } from "@immortalis/testkit";
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
    "interrupted",
    "interrupted-unknown",
    "interrupted-contrary",
    "same-instant-unresolved",
    "future-a",
    "future-b",
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
      const earned = { unit: WORKSHOP_SECOND, value: 600 };
      const future = mode === "future-a" || mode === "future-b";
      const interrupted =
        mode.startsWith("interrupted") || future || mode === "same-instant-unresolved";
      const target = { ...earned, value: interrupted || mode === "c54-unresolved" ? 900 : 600 };
      const unknown = mode === "unknown-hearing" || mode === "interrupted-unknown";
      const contrary = mode === "contrary" || mode === "interrupted-contrary";
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
        const collision = mode === "same-instant-unresolved";
        let laterKey: string | undefined;
        if (future || collision) {
          const demand = { ...h.source.demand, demand_envelope_id: "independent-bracket-job" };
          await must(
            new EconomyAdapter(store).issueDemand({
              ...openingPublication("later-demand"),
              demand,
            }),
          );
          const reserve = { ...h.source.reserve, reserve_id: "independent-bracket-reserve" };
          await must(
            h.production.establishReserve({
              ...openingPublication("later-reserve"),
              reserve,
            }),
          );
          const requestId = economyRequestId(demand.demand_envelope_id);
          const laterAt = collision ? 600 : mode === "future-a" ? 700 : 800;
          await must(
            h.production.startOperation({
              ...openingPublication("later-operation"),
              start: {
                ...h.startInput.start,
                reserve_id: reserve.reserve_id,
                request_key: economyRequestKey(requestId),
                completion_at: { ...earned, value: laterAt },
              },
            }),
          );
          const later = productionTemporalObject(h.production.operation(requestId)!.value, {
            worldId: h.source.world.world_id,
            locusId: h.source.locus.locus_id,
          });
          laterKey = temporalObjectKey(later.object_id);
          await must(
            h.register.registerObject({ ...openingPublication("later-object"), object: later }),
          );
        }
        const laterBefore = laterKey && store.getFact(laterKey);
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
        if (contrary) {
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
        if (mode === "interrupted") {
          const originalDue = if6b.if6bDueForOpenWait;
          const incomparable = vi
            .spyOn(if6b, "if6bDueForOpenWait")
            .mockImplementationOnce((...args) =>
              originalDue(...args)!.map((due, i) =>
                i === 0
                  ? {
                      ...due,
                      entry: { ...due.entry, at: { ...due.entry.at, unit: "other-clock" } },
                    }
                  : due,
              ),
            );
          const before = store.head();
          try {
            expect(await advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource)).toEqual({
              status: "UNRESOLVED",
            });
            expect(store.head()).toEqual(before);
          } finally {
            incomparable.mockRestore();
          }
        }
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
        const credited: string[] = [];
        expect(await clock.sealOwn(x)).toMatchObject({ ok: false });
        for (let n = 0; n < 5; n++) {
          const before = store.head().revision;
          if (n === 3 && mode === "interrupted") {
            const early = deriveNoticeOccurrence(
              workshopView(store),
              enrolment.key,
              signed.fixture.noticeSource,
            );
            expect(early).toBeDefined();
            expect(await store.commit(early!)).toMatchObject({
              ok: false,
              error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } },
            });
            expect(store.head().revision).toBe(before);
          }
          const futureReads = future ? vi.spyOn(store.canonicalState!().facts, "get") : undefined;
          const first = advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource);
          const second =
            n === 1 ? advanceWorkshopWaitStage(store, x, signed.fixture.noticeSource) : undefined;
          const next = await first;
          if (futureReads) {
            expect(futureReads).not.toHaveBeenCalledWith(laterKey);
            futureReads.mockRestore();
          }
          if (second) {
            const retry = await second;
            expect(retry).toMatchObject({
              status: "STAGE",
              result: { ok: true, value: { replayed: true } },
            });
            expect(store.head().revision).toBe(before + 1);
          }
          if (collision && next.status === "STAGE" && !next.result.ok) {
            expect(next.result).toMatchObject({
              ok: false,
              error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } },
            });
            expect(await clock.sealOwn(x)).toMatchObject({ ok: false });
            expect(clock.status(h.source.pc.id).state).toBe("ACTIVE");
            expect(store.getFact(laterKey!)).toEqual(laterBefore);
            return;
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
          if (n === 0 && (mode === "positive" || mode === "interrupted")) {
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
        const futureReads = future ? vi.spyOn(store.canonicalState!().facts, "get") : undefined;
        const receipt = await must(clock.sealOwn(x));
        if (futureReads) {
          expect(futureReads).not.toHaveBeenCalledWith(laterKey);
          futureReads.mockRestore();
        }
        if (mode === "interrupted") {
          const head = store.head();
          await active.close();
          active = await must(h.reopen());
          store = active.store;
          clock = new GmWaitCustody(store, policy);
          expect(store.head()).toEqual(head);
          expect(await clock.sealOwn(x)).toMatchObject({
            ok: true,
            value: { receipt: receipt.receipt, replayed: true },
          });
        }
        const seal = GmWaitStoredTransactionSchema.parse(
          store.getFact(temporalTransactionKey(txOf(x)))!.value,
        );
        expect(seal.stages.map((r) => r.group_id)).toEqual(credited);
        expect(seal.boundaries_crossed).toHaveLength(3);
        if (interrupted && !contrary) {
          expect(seal.outcome).toMatchObject({
            stop_reason: "INTERRUPTED",
            actual_stop: earned,
            remainder: { from: earned, to: target },
            unresolved_dependents: [],
          });
          expect(seal.boundaries_crossed.map((b) => b.at.value)).toEqual([300, 600, 600]);
          if (laterKey) expect(store.getFact(laterKey)).toEqual(laterBefore);
          expect(workshopDecisionOpportunity(workshopView(store), x)).toBeUndefined();
        } else {
          expect(seal.outcome).toMatchObject({
            stop_reason: "TARGET_REACHED",
            actual_stop: target,
          });
        }
        const occurrence = store
          .listFacts()
          .find((f) => WorkshopNoticeOccurrenceSchema.safeParse(f.value).success)!;
        if (contrary) {
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
        await must(health.closeAuditoryFunction(occurrence.key, unknown ? undefined : anchor)!);
        const close = store.listFacts().flatMap((f) => {
          const value = WorkshopSensoryCloseSchema.safeParse(f.value);
          return value.success ? [value.data] : [];
        });
        expect(close).toHaveLength(1);
        if (unknown) {
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
          expect(workshopDecisionOpportunity(workshopView(store), x)).toBeUndefined();
          if (interrupted) {
            const coordinator = new TemporalCoordinator(store, new StageProviderRegistry());
            expect(coordinator.state()?.value.continuation).toMatchObject({ toward: target });
          }
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
        const eventKey = accessEventKey("workshop-notice:" + event.notice_id);
        expect(store.getFact(eventKey)).toBeDefined();
        expect(workshopDecisionOpportunity(workshopView(store), x)).toBeUndefined();
        await must(clock.reconcile(proof));
        expect(
          GmWaitByPcIndexSchema.parse(store.getFact(temporalGmWaitByPcKey(event.pc_id))!.value)
            .state,
        ).toBe("SEALED_RECONCILED");
        expect(active.verify()).toEqual([]);
        if (mode === "interrupted") {
          const options = { workshopCampaign: store.head().campaign_id };
          const orderViolation = expect.objectContaining({
            message: "the event was not committed before the packet formed from it",
          });
          expect(verifyEpistemicIntegrity(store, options)).toEqual([]);
          expect(verifyEpistemicIntegrity(store)).toContainEqual(orderViolation);
          expect(verifyEpistemicIntegrity(store, { workshopCampaign: "foreign" })).toContainEqual(
            orderViolation,
          );

          const unregistered = "world/unregistered-workshop-occurrence";
          const forged = store.listFacts().map((fact) => {
            if (fact.key === occurrence.key) return { ...fact, key: unregistered };
            if (fact.key !== eventKey) return fact;
            const receipt = AccessEventSchema.parse(fact.value);
            return {
              ...fact,
              value: JsonValueSchema.parse({
                ...receipt,
                source: { ...receipt.source, fact_key: unregistered },
              }),
            };
          });
          const listing = vi.spyOn(store, "listFacts").mockReturnValue(forged);
          try {
            expect(verifyEpistemicIntegrity(store, options)).toContainEqual(orderViolation);
          } finally {
            listing.mockRestore();
          }
        }
        if (interrupted) {
          const providers = mode === "future-a" ? economyProviders() : new StageProviderRegistry();
          const coordinator = new TemporalCoordinator(store, providers);
          const source = signed.fixture.choiceSource;
          const advance = (choice: string) =>
            resumeWorkshopWait(store, coordinator, x, choice, source);
          const opportunity = workshopDecisionOpportunity(workshopView(store), x)!;
          expect(opportunity.packet.payload.content).toContain("accepted into custody");
          expect(coordinator.state()?.value.continuation).toEqual({
            from_transaction: txOf(x),
            toward: target,
            unresolved_dependents: [],
          });
          const blank = "0".repeat(64);
          const before = store.head();
          if (mode === "interrupted") {
            for (const [kind, change] of Object.entries({
              "stale-clock": {
                clock: { ...opportunity.basis.clock, version: opportunity.basis.clock.version - 1 },
              },
              "foreign-campaign": { campaign: "another-workshop" },
              "foreign-pc": { pc: "another-character" },
            })) {
              const ref = signed.choose({ ...opportunity.basis, ...change }, kind);
              expect(
                await coordinator.continueRemainder({
                  transaction_id: "workshop-resume:" + x,
                  cause: "player:workshop-resume:" + ref,
                  trigger: { kind: if6b.IF6B_RESUME_TRIGGER, ref },
                  context: PLAYER_CHOICE_AUTHORITY,
                  publication: { basis: "workshop-player-choice", secrecy: "sealed" },
                }),
                kind,
              ).toMatchObject({
                ok: false,
                error: { details: { reason: "GM_WAIT_INTERRUPTED_RESUME_UNAUTHORIZED" } },
              });
              expect(store.head()).toEqual(before);
            }
          }
          expect(await advance(blank)).toBeUndefined();
          expect(
            await resumeWorkshopWait(store, coordinator, x, blank, {
              verificationId: "untrusted-client-verifier",
              read: () => ({
                purpose: "CONTINUE_INTERRUPTED_WORKSHOP_WAIT",
                opportunity: opportunity.basis,
                choice: "CONTINUE",
                confirmation: blank,
              }),
            }),
          ).toMatchObject({ ok: false });
          expect(
            await advance(
              signed.choose(
                {
                  ...opportunity.basis,
                  clock: {
                    ...opportunity.basis.clock,
                    version: opportunity.basis.clock.version - 1,
                  },
                },
                "earlier-decision",
              ),
            ),
          ).toBeUndefined();
          expect(
            await coordinator.continueRemainder({
              transaction_id: "alternate-resume",
              cause: "caller-claim",
              trigger: { kind: "other", ref: blank },
              context: PLAYER_CHOICE_AUTHORITY,
              publication: { basis: "fixture", secrecy: "sealed" },
            }),
          ).toMatchObject({ ok: false });
          expect(store.head()).toEqual(before);
          const original = signed.choose(opportunity.basis, "separate-confirmation");
          const duplicate = signed.choose(opportunity.basis, "another-confirmation");
          const first = advance(original);
          const same = mode === "interrupted" ? advance(original) : undefined;
          const result = await first;
          expect(result).toMatchObject({ ok: true });
          if (same) expect(await same).toMatchObject({ ok: true });
          const confirmed = coordinator.transaction("workshop-resume:" + x)!.value;
          expect(confirmed.stages).toHaveLength(mode === "future-a" ? 3 : 0);
          expect(confirmed.stages.every(({ group_id }) => !credited.includes(group_id))).toBe(true);
          expect(confirmed.continues).toBe(txOf(x));
          expect(confirmed.outcome).toMatchObject(
            mode === "future-b"
              ? {
                  stop_reason: "DEPENDENCY_UNRESOLVED",
                  actual_stop: { value: 800 },
                }
              : { stop_reason: "TARGET_REACHED", actual_stop: target, remainder: null },
          );
          const after = store.head();
          expect(await advance(duplicate)).toBeUndefined();
          expect(await advance(original)).toMatchObject({ ok: true, value: { replayed: true } });
          expect(store.head()).toEqual(after);
          expect(workshopDecisionOpportunity(workshopView(store), x)).toBeUndefined();
          expect(active.verify()).toEqual([]);
        }
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
