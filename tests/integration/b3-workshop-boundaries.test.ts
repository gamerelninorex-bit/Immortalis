import { describe, expect, it } from "vitest";
import { ALL_FACT_KINDS, sha256Canonical } from "@immortalis/engine";
import {
  deriveNoticeEnrolment,
  WorkshopNoticeAdapter,
  workshopNoticeBoundary,
  workshopNoticePresentBasis,
  workshopProductionStages,
  WORKSHOP_FACT_KINDS,
} from "../../packages/engine/src/owners/workshop/index.ts";
import { temporalTransactionKey, type CommitGroup, type OwnerFact } from "@immortalis/contracts";
import {
  WORKSHOP_NOTICE_CLASS,
  WORKSHOP_SECOND,
  WorkshopConditionSchema,
  WorkshopDutySchema,
  WorkshopNoticeBindingSchema,
  WorkshopNoticeOccurrenceSchema,
  WorkshopSensoryCloseSchema,
} from "../../packages/contracts/src/workshop-opening.ts";
import { prodAdvanceRequest } from "@immortalis/testkit";
import { openingPublication, openWorkshop } from "../support/b3-opening.ts";
import { requireLaneXEvidence } from "../support/b3-evidence.ts";
import { must } from "../support/temporal.ts";
import { authorityGroupOf, lifecycle, seededRig, tempDir, txOf } from "./b2-support.ts";

const time = (value: number) => ({ unit: WORKSHOP_SECOND, value });
const ref = (fact: OwnerFact) => ({
  key: fact.key,
  owner: fact.owner,
  facet: fact.facet,
  version: fact.version,
  group_id: fact.provenance.group_id,
});

describe("B3 native boundary qualification (Lane O)", () => {
  it("T-M6 and T111, recovery is credited at 300 seconds, then original completion and acceptance at 600", async () => {
    const h = await openWorkshop("glassbell");
    try {
      const conditionKey = h.healthObject!.dependencies[0]!.produces[0]!;
      const condition = () => WorkshopConditionSchema.parse(h.store.getFact(conditionKey)!.value);
      const early = await must(
        h.coordinator.advance(prodAdvanceRequest("workshop-before-recovery", time(299))),
      );
      expect(early.transaction.stages).toEqual([]);
      expect(condition().state.status).toBe("ACTIVE");
      const recovered = await must(
        h.coordinator.advance(prodAdvanceRequest("workshop-recovery", time(300))),
      );
      expect(recovered.transaction.stages).toHaveLength(1);
      expect(condition().state).toEqual({ status: "RETIRED", recovery_at: time(300) });
      expect(h.store.getFact(conditionKey)!.version).toBe(2);
      const due = await must(
        h.coordinator.advance(prodAdvanceRequest("workshop-job-due", time(600))),
      );
      expect(due.transaction.stages).toHaveLength(3);
      expect(
        h.store.listFacts().filter((f) => WorkshopSensoryCloseSchema.safeParse(f.value).success),
      ).toHaveLength(0);
      expect(h.campaign.verify()).toEqual([]);
      const digest = h.store.head().state_sha256;
      await h.campaign.close();
      const reopened = await must(h.reopen());
      try {
        expect(reopened.store.head().state_sha256).toBe(digest);
      } finally {
        await reopened.close();
      }
    } finally {
      await h.campaign.close();
    }
  }, 20000);

  it("T-M1, a qualification object without a native validator refuses, including at cold reopen", async () => {
    const pub = openingPublication("tampered-health-replay");
    const h = await openWorkshop("glassbell", {
      admissionOverride(original) {
        return {
          ...original,
          historyVerificationId: "fixture:deliberately-unverified-b3-registration",
          check: (g, s, history) =>
            g.intent_id === pub.intent_id ? null : original.check(g, s, history),
        };
      },
    });
    try {
      const o = h.healthObject!;
      const unknown = await h.register.registerObject({
        ...openingPublication("unknown-object-owner"),
        object: {
          ...o,
          object_id: "unknown-object",
          owning_ref: { owner: "fixture:no-owner-validator", process_id: "unknown" },
          dependencies: [],
        },
      });
      expect(unknown).toMatchObject({
        ok: false,
        error: { details: { reason: "WORKSHOP_OBJECT_OWNER_UNVALIDATED" } },
      });
      for (const owner of ["gip", "production"]) {
        const spoofed = await h.register.registerObject({
          ...openingPublication(`mismatched-native-owner-${owner}`),
          object: {
            ...o,
            object_id: `mismatched-native-owner-${owner}`,
            owning_ref: { owner, process_id: "unowned-workshop-process" },
            dependencies: [],
          },
        });
        expect(spoofed).toMatchObject({
          ok: false,
          error: { details: { reason: "WORKSHOP_OBJECT_OWNER_UNVALIDATED" } },
        });
      }
      await must(
        h.register.registerObject({
          ...pub,
          object: {
            ...o,
            object_id: "obj-health-glassbell-forged",
            next_boundary: { ...o.next_boundary!, at: time(301) },
          },
        }),
      );
      const forgedRevision = h.store.head().revision;
      await h.campaign.close();
      const checked = await h.reopen();
      expect(checked).toMatchObject({
        ok: false,
        error: {
          code: "REPLAY_MISMATCH",
          details: { revision: forgedRevision },
        },
      });
    } finally {
      await h.campaign.close();
    }
  }, 20000);

  it("T-M2, all three registered Production stages have explicit dispositions", async () => {
    const h = await openWorkshop("quiet");
    try {
      const stages = workshopProductionStages(h.productionObject)!;
      expect(stages.map((s) => s.stage)).toEqual([
        "production:production-complete-operation",
        "world_state:world-state-accept-fallback-durable",
        "economy:economy-record-realized-access",
      ]);
      expect(stages[2]?.laneX).toBe("DEFERRED(OWNER_ENROLMENT)");
      const dependencies = h.productionObject.dependencies.map((d, i) =>
        i === 2
          ? {
              ...d,
              stage: {
                ...d.stage,
                owner_operation: { ...d.stage.owner_operation, operation: "unknown-stage" },
              },
            }
          : d,
      );
      expect(workshopProductionStages({ ...h.productionObject, dependencies })).toBeUndefined();
    } finally {
      await h.campaign.close();
    }
  }, 20000);

  it("T-M4 and T-M10, rejects charter shape, referenced office and basis mutations and a foreign duty writer", async () => {
    const h = await openWorkshop("quiet");
    try {
      const original = h.trace.find(({ group }) =>
        group.writes.some((w) => w.key === h.charter.key),
      )!;
      const refs = { ...h.charterInput, office: "gip/institution/absent/office/absent" };
      const published = h.store.committedGroup(h.charter.provenance.intent_id)!;
      for (const extra of [
        {
          office: {
            owner: "gip",
            facet: "gip_institution_identity",
            key: refs.office,
            version: 1,
            group_id: "absent",
          },
        },
        { authored_timestamp: time(0) },
        { opening_basis: ref(h.store.getFact(h.charterInput.institution)!) },
        { pending_proof: true },
      ]) {
        const g = structuredClone(published);
        g.writes[0]!.value = { ...(g.writes[0]!.value as Record<string, never>), ...extra };
        expect(h.admission.check(g, original.before)).not.toBeNull();
      }
      const duty = h.store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
      const origin = h.trace.find(({ group }) => group.writes[0]?.key === duty.key)!;
      const g = origin.group;
      const invalid: CommitGroup = {
        ...g,
        owner: "world_state",
        facet: "world_locus",
        writes: g.writes.map((w) => ({ ...w, owner: "world_state", facet: "world_locus" })),
      };
      expect(h.admission.check(invalid, origin.before)?.code).toBe("KEY_NOT_ADMITTED");
      for (const group of h.trace.map(({ group }) => group)) {
        for (const w of group.writes)
          expect(
            [...ALL_FACT_KINDS, ...WORKSHOP_FACT_KINDS].filter((kind) =>
              kind.keyPattern.test(w.key),
            ),
          ).toHaveLength(1);
      }
    } finally {
      await h.campaign.close();
    }
  }, 20000);

  it("D3(b) reads present custody and the earned original completion, and fails closed without C54", async () => {
    const h = await openWorkshop("quiet");
    try {
      const view = () => ({
        campaign_id: h.campaignId,
        revision: h.store.head().revision,
        get: (key: string) => h.store.getFact(key),
      });
      const duty = h.store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
      const present = workshopNoticePresentBasis(view(), duty.key)!;
      expect(present).toBeDefined();
      const binding = WorkshopNoticeBindingSchema.parse({
        schema_version: 1,
        class: WORKSHOP_NOTICE_CLASS,
        campaign_id: h.campaignId,
        x: "1".repeat(64),
        notice_id: present.noticeId,
        world_id: present.pc.worldId,
        locus_id: present.pc.locusId,
        attendant_id: present.d.attendant_id,
        pc_id: present.pc.pc,
        pc_binding: ref(present.pc.binding),
        world: ref(present.pc.world),
        locus: ref(present.pc.locus),
        cue_operation: ref(present.operation),
        acceptance_key: present.acceptanceKey,
        duty: ref(duty),
        report: "COMPLETION_CONFIRMED",
        root_request_sha256: "2".repeat(64),
        proposal_sha256: "3".repeat(64),
        t0_witness_sha256: "4".repeat(64),
        policy: present.d.policy,
      });
      const id = h.admission.historyVerificationId!;
      expect(workshopNoticeBoundary(view(), binding)).toEqual({ status: "UNRESOLVED" });
      expect(new WorkshopNoticeAdapter(h.store, id).enrol(binding.x, duty.key)).toBeUndefined();
      expect(deriveNoticeEnrolment(view(), binding.x, duty.key, id, undefined)).toBeUndefined();

      await must(h.coordinator.advance(prodAdvanceRequest("b3-standalone-cue", time(600))));
      expect(workshopNoticeBoundary(view(), binding)).toMatchObject({
        status: "DUE",
        failed: null,
        at: time(600),
      });
      const missingAcceptance = {
        ...view(),
        get: (key: string) => (key === binding.acceptance_key ? undefined : h.store.getFact(key)),
      };
      expect(workshopNoticeBoundary(missingAcceptance, binding)).toEqual({ status: "UNRESOLVED" });
      const dutyValue = WorkshopDutySchema.parse(duty.value);
      const instruction = h.store.getFact(dutyValue.issued_instruction.key)!;
      const expired = {
        ...view(),
        get: (key: string) =>
          key === instruction.key
            ? {
                ...instruction,
                value: {
                  ...(instruction.value as Record<string, never>),
                  lifecycle_status: "terminated",
                  revoking_act_sha256: sha256Canonical("adversarial read"),
                },
              }
            : h.store.getFact(key),
      };
      expect(workshopNoticeBoundary(expired, binding)).toMatchObject({
        status: "DUE",
        failed: "C1",
      });
      expect(
        h.store.listFacts().some((f) => WorkshopNoticeOccurrenceSchema.safeParse(f.value).success),
      ).toBe(false);
    } finally {
      await h.campaign.close();
    }
  }, 20000);
});

describe("B3 on the preserved B2 W2 fence (canaries only)", () => {
  it("C-F1 and C-F2, a genuine-shaped Health owner write cannot claim X, while X seals with zero stages", async () => {
    const h = await openWorkshop("glassbell");
    const rig = await seededRig(tempDir());
    try {
      await must(h.coordinator.advance(prodAdvanceRequest("b3-recovery-canary", time(300))));
      const condition = h.store.getFact(h.healthObject!.dependencies[0]!.produces[0]!)!;
      const genuine = h.store.committedGroup(condition.provenance.intent_id)!;
      const opened = await lifecycle(rig, "open");
      const before = rig.store.head();
      const x = opened.x;
      const attempt = {
        ...genuine,
        campaign_id: rig.store.head().campaign_id,
        cause: `transaction:${txOf(x)}`,
        depends_on: [authorityGroupOf(rig.store, x)],
        reads: [],
      };
      expect(await rig.store.commit(attempt)).toMatchObject({
        ok: false,
        error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } },
      });
      expect(
        await rig.store.commit({ ...attempt, cause: "foreign-workshop-write", depends_on: [] }),
      ).toMatchObject({ ok: false, error: { details: { reason: "GM_WAIT_ACTIVE_FOREIGN" } } });
      expect(rig.store.head()).toEqual(before);
      await must(rig.custody.sealOwn(x));
      const seal = rig.store.getFact(temporalTransactionKey(txOf(x)))!;
      expect(seal.value).toMatchObject({ stages: [], x });
      expect(requireLaneXEvidence(rig.store, x, h.healthObject!.dependencies[0]!.stage)).toBe(
        false,
      );
    } finally {
      await h.campaign.close();
      await rig.campaign.close();
    }
  }, 20000);
});
