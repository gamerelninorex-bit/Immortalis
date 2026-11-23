import { describe, expect, it } from "vitest";
import {
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  economyRequestKey,
  temporalObjectKey,
} from "@immortalis/contracts";
import {
  WorkshopFactRefSchema,
  type WorkshopFactRef,
  WORKSHOP_SECOND,
  WorkshopCharterSchema,
  WorkshopConditionSchema,
  WorkshopCoverageAnchorSchema,
  WorkshopDutySchema,
  WorkshopInstructionSchema,
} from "../../packages/contracts/src/workshop-opening.ts";
import {
  CanonicalCampaign,
  canonicalAdmission,
  fixtureMsCanonicalAdmission,
} from "@immortalis/engine";
import {
  WORKSHOP_PRODUCTION_PROFILES,
  workshopFixtureIdentity,
} from "../../packages/engine/src/owners/workshop/index.ts";
import { openingPublication, openWorkshop, workshopRawProfile } from "../support/b3-opening.ts";
import { must } from "../support/temporal.ts";

function factRefs(value: unknown): WorkshopFactRef[] {
  const parsed = WorkshopFactRefSchema.safeParse(value);
  if (parsed.success) return [parsed.data];
  if (value === null || typeof value !== "object") return [];
  return Object.values(value).flatMap(factRefs);
}

describe("B3 original workshop Profiles (Lane O, signed fixture mechanism)", () => {
  for (const profile of ["quiet", "glassbell"] as const) {
    it(`opens ${profile} through the canonical owners and replays the same state digest`, async () => {
      const h = await openWorkshop(profile, {
        beforeProduction(gip, input) {
          expect(gip.adoptCharter(input)).toBeUndefined();
        },
        async beforeLedger(bind) {
          expect(await bind()).toMatchObject({ ok: false });
        },
      });
      const store = h.store;
      try {
        const charter = WorkshopCharterSchema.parse(h.charter.value);
        expect(charter.opening_basis).toEqual(charter.production_operation);
        expect(charter.opening_basis.version).toBe(1);
        expect(charter.adopted_at.at).toEqual({ unit: WORKSHOP_SECOND, value: 0 });
        const operation = h.charterInput.production_operation;
        const production = store.getFact(operation)!;
        const start = store.committedGroup(production.provenance.intent_id)!;
        expect(start.writes).toHaveLength(3);
        expect(start.reads).toContainEqual({ key: economyRequestKey(h.requestId), version: 1 });
        const clock = store.getFact(TEMPORAL_STATE_KEY)!;
        expect(clock.provenance.group_id).toBe(
          store.getFact(TEMPORAL_ORIGIN_KEY)!.provenance.group_id,
        );
        expect(clock.version).toBe(1);
        const productionObject = store.getFact(temporalObjectKey(h.productionObject.object_id))!;
        expect(
          store.committedGroup(productionObject.provenance.intent_id)!.writes.map((w) => w.key),
        ).toContain(TEMPORAL_BOUNDARY_INDEX_KEY);
        const instruction = store
          .listFacts()
          .find((f) => WorkshopInstructionSchema.safeParse(f.value).success)!;
        const duty = store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
        const dutyValue = WorkshopDutySchema.parse(duty.value);
        expect(dutyValue.acceptance_basis).toBe("SEEDED_STANDING_POST_DUTY");
        expect(dutyValue.issued_instruction.key).toBe(instruction.key);
        const anchor = store.getFact(
          store.committedGroup(h.anchor.receipt.intent_id)!.writes[0]!.key,
        )!;
        const coverage = WorkshopCoverageAnchorSchema.parse(anchor.value);
        expect(coverage.source_inventory).toHaveLength(profile === "glassbell" ? 1 : 0);
        expect(h.health.closeAuditoryFunction("nonexistent-event", anchor.key)).toBeUndefined();

        for (const { before, after, group } of h.trace) {
          for (const key of group.depends_on) {
            const dependency = store.committedGroupById!(key)!;
            expect(store.lookupReceipt(dependency.intent_id)!.revision).toBeLessThan(
              after.revision,
            );
          }
          for (const ref of group.writes.flatMap((write) => factRefs(write.value))) {
            const source = store.committedGroupById!(ref.group_id)!;
            expect(source.writes).toContainEqual(
              expect.objectContaining({
                key: ref.key,
                owner: ref.owner,
                facet: ref.facet,
                expected_version: ref.version - 1,
              }),
            );
            expect(store.lookupReceipt(source.intent_id)!.revision).toBeLessThan(after.revision);
          }
          expect(after.revision).toBe(before.revision + 1);
        }
        const original = h.trace.find(({ group }) => group.writes[0]?.key === h.charter.key)!;
        expect(canonicalAdmission.check(original.group, original.before)).toMatchObject({
          code: "KEY_NOT_ADMITTED",
          details: { reason: "WORKSHOP_PROFILE_NOT_ADMITTED" },
        });
        const head = store.head();
        const retry = await must(h.production.startOperation(h.startInput));
        expect(retry.receipt.revision).toBeLessThan(head.revision);
        expect(store.head()).toEqual(head);
        expect(h.campaign.verify()).toEqual([]);
        await h.campaign.close();

        const refused = await CanonicalCampaign.open(h.dir);
        expect(refused.ok).toBe(false);
        const changed = Buffer.from(workshopRawProfile(profile));
        changed[changed.length - 1] = 0x20;
        const wrong = await CanonicalCampaign.open(h.dir, {
          testkitFixtureAdmission: fixtureMsCanonicalAdmission(h.actorRunner.binding, changed),
        });
        expect(wrong.ok).toBe(false);
        const reopened = await must(h.reopen());
        try {
          expect(reopened.store.head()).toEqual(head);
          expect(reopened.verify()).toEqual([]);
        } finally {
          await reopened.close();
        }
      } finally {
        await h.campaign.close();
      }
    }, 20000);
  }

  it("derives a +300 second recovery and refuses a one-tick mismatch", async () => {
    const h = await openWorkshop("glassbell");
    try {
      const o = h.healthObject!;
      expect(o.next_boundary!.at).toEqual({ unit: WORKSHOP_SECOND, value: 300 });
      const key = o.dependencies[0]!.produces[0]!;
      expect(WorkshopConditionSchema.parse(h.store.getFact(key)!.value).state.status).toBe(
        "ACTIVE",
      );
      const result = await h.register.registerObject({
        ...openingPublication("tampered-health-object"),
        object: {
          ...o,
          object_id: "obj-health-glassbell-tampered",
          next_boundary: { ...o.next_boundary, at: { unit: WORKSHOP_SECOND, value: 301 } },
        },
      });
      expect(result).toMatchObject({
        ok: false,
        error: { code: "REFERENCE_INVALID", details: { reason: "HEALTH_OBJECT_SOURCE" } },
      });
    } finally {
      await h.campaign.close();
    }
  }, 20000);

  it("changes fixture identity with one byte and keeps production allowlist empty", () => {
    const raw = workshopRawProfile("quiet");
    const changed = Buffer.from(raw);
    changed[changed.length - 1] = 0x20;
    expect(workshopFixtureIdentity(changed).campaignId).not.toBe(
      workshopFixtureIdentity(raw).campaignId,
    );
    expect(WORKSHOP_PRODUCTION_PROFILES).toEqual([]);
  });
});
