/* eslint-disable @typescript-eslint/no-explicit-any -- the rig pokes at raw groups, fact maps and stored values */
// F-014B G1 — the ORDINARY quiet seal of an IF-6b wait (R-5(2) TARGET_REACHED: nothing due, no credited stage), mechanism only.
//
// Every positive here is a SCRIPTED TESTKIT mechanism exercise (T1): the genuine B3 Lane X IF-6b identity with its signed DISPOSABLE owner, never a
// live GM wait, an AI GM, a named client or a retained-storage result. The quiet wait is the real Lane X route with ONE change, the wait target:
// it lies before every indexed boundary, so what is due is derived from the actual index, never declared by the test.
//
// What is and is not claimed (see the PR): the seal and the Temporal reconciliation are proven. The World-State owner terminal that must follow
// (R-5(2) SETTLED_NOT_OCCURRED) is REFUSED by the W2 stage-claim rule; that is pinned below as a labelled characterisation, not hidden.
import { describe, expect, it } from "vitest";
import {
  GmWaitMarkerSchema,
  GmWaitStagedTransactionSchema,
  GmWaitStoredTransactionSchema,
  GmWaitTransactionAuthoritySchema,
  GM_WAIT_IF6B_QUIET_SEAL_SEGMENT,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  temporalGmWaitMarkerKey,
  temporalObjectKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  WORKSHOP_SECOND,
  WorkshopDutySchema,
  WorkshopNoticeEnrolmentSchema,
} from "../../packages/contracts/src/workshop-opening.ts";
import {
  GmWaitCustody,
  factKind,
  fixtureCanonicalAdmission,
  sha256Canonical,
  type CampaignState,
} from "@immortalis/engine";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import * as gmWait from "../../packages/engine/src/gm-wait-custody.ts";
import {
  gmWaitMarkerIntentId,
  gmWaitOpenIntentId,
  gmWaitX,
} from "../../packages/engine/src/gm-wait-identity.ts";
import { workshopLaneXAdmission } from "../../packages/engine/src/owners/workshop/lane-x.ts";
import {
  WorkshopNoticeAdapter,
  deriveNoticeSettlement,
} from "../../packages/engine/src/owners/workshop/notice-publication.ts";
import { workshopNoticeTemporalObject } from "../../packages/engine/src/owners/workshop/notice-temporal.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { temporalGroupCheck } from "../../packages/engine/src/temporal/admission.ts";
import { if6bSettlement } from "../../packages/engine/src/temporal/if6b-settlement.ts";
import { IF6B_POLICY } from "../../packages/engine/src/temporal/if6b-stage.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop, openingPublication } from "../support/b3-opening.ts";
import { must } from "../support/temporal.ts";
import { proofOf, seededRig, lifecycle, tempDir, txOf } from "./b2-support.ts";

const QUIET = 200; // before the earliest indexed boundary (300) of the Lane X route
const kernelRule = factKind("temporal_state").rule;

/** The genuine Lane X IF-6b rig, taken exactly to OPEN, for a wait whose target is `value` workshop-seconds. */
async function laneRig(value: number) {
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const h = await openWorkshop("glassbell", {
    laneX(keys) {
      signed = signedWorkshopLaneX(keys, true);
      return signed.fixture;
    },
  });
  const proof = proofOf();
  const x = (gmWaitX("session-original-1", "1") as { x: string }).x;
  const target = { unit: WORKSHOP_SECOND, value };
  const policy = {
    catalogueSha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
    historyVerificationId: h.admission.historyVerificationId!,
    kernelRule,
  };
  const store = h.campaign.store;
  const clock = new GmWaitCustody(store, policy);
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
  const operation = store.getFact(h.charterInput.production_operation)!;
  const object = workshopNoticeTemporalObject(enrolment, operation)!;
  await must(h.register.registerObject({ ...openingPublication("notice-object"), object }));
  await must(
    clock.publishMarker({
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
    }),
  );
  await must(clock.open(proof));
  return { h, signed, proof, x, target, policy, store, clock, enrolment, object, publisher };
}
type LaneRig = Awaited<ReturnType<typeof laneRig>>;

const settlementArgs = (r: LaneRig, state: CampaignState) => ({
  authority: GmWaitTransactionAuthoritySchema.parse(
    state.facts.get(temporalTransactionAuthorityKey(txOf(r.x)))!.value,
  ),
  marker: GmWaitMarkerSchema.parse(state.facts.get(temporalGmWaitMarkerKey(r.x))!.value),
});
const copyOf = (state: CampaignState, edit: (facts: Map<string, any>) => void): CampaignState => {
  const facts = new Map(state.facts);
  edit(facts);
  return { ...state, facts };
};
const withIdentity = (r: LaneRig, state: CampaignState, identity: string) =>
  copyOf(state, (facts) => {
    const key = temporalGmWaitMarkerKey(r.x);
    const fact = facts.get(key);
    facts.set(key, {
      ...fact,
      value: { ...fact.value, policy: { ...fact.value.policy, history_verification_id: identity } },
    });
  });
const ctxOf = (r: LaneRig) => ({
  policy: {
    historyVerificationId: r.policy.historyVerificationId,
    preparation: "FIXTURE" as const,
    isCanonicalOwner: () => true,
  },
  live: true,
});
const versions = (r: LaneRig) =>
  new Map(r.store.listFacts().map((f) => [f.key, f.version] as const));

describe("G1 the quiet IF-6b seal: T94", () => {
  it("seals a nothing-due wait: stored target, clock equals target, only the clock and the seal change, cold reopen, idempotent", async () => {
    const r = await laneRig(QUIET);
    try {
      const { store, clock, x, target, h } = r;
      const stored = GmWaitTransactionAuthoritySchema.parse(
        store.getFact(temporalTransactionAuthorityKey(txOf(x)))!.value,
      );
      expect(stored.requested.target).toEqual(target); // the stored target, not the probe's constant
      const state = store.canonicalState!();
      const index = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)!;
      const earliest = (index.value as any).entries[0].at.value;
      expect(earliest).toBeGreaterThan(QUIET); // nothing at or before the target, derived from the index
      const before = versions(r);
      const sealed = await must(clock.sealOwn(x));
      expect(sealed.slot).toBe("SEALED_UNRECONCILED");
      // exactly two facts differ: the one clock, advanced one version, and the new seal
      const after = versions(r);
      const changed = [...after].filter(([k, v]) => before.get(k) !== v).map(([k]) => k);
      expect(changed.sort()).toEqual([TEMPORAL_STATE_KEY, temporalTransactionKey(txOf(x))].sort());
      expect(after.get(TEMPORAL_STATE_KEY)).toBe(before.get(TEMPORAL_STATE_KEY)! + 1);
      expect(after.get(TEMPORAL_BOUNDARY_INDEX_KEY)).toBe(before.get(TEMPORAL_BOUNDARY_INDEX_KEY));
      expect(store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)!.value).toEqual(index.value);
      const seal = GmWaitStagedTransactionSchema.parse(
        store.getFact(temporalTransactionKey(txOf(x)))!.value,
      );
      expect(seal.stages).toEqual([]);
      expect(seal.engaged).toEqual([]);
      expect(seal.boundaries_crossed).toEqual([]);
      expect(seal.outcome).toEqual({
        actual_stop: target,
        stop_reason: "TARGET_REACHED",
        remainder: null,
        unresolved_dependents: [],
      });
      expect(TemporalStateSchema.parse(store.getFact(TEMPORAL_STATE_KEY)!.value)).toMatchObject({
        canonical_time: target,
        continuation: null,
      });
      // same identity again: the original receipt, nothing written
      const head = store.head();
      const again = await must(clock.sealOwn(x));
      expect(again.replayed).toBe(true);
      expect(again.receipt).toEqual(sealed.receipt);
      expect(store.head()).toEqual(head);
      // cold reopen from the retained journal: the exact head, the same slot, the same replay
      await h.campaign.close();
      const reopened = await must(h.reopen());
      expect(reopened.store.head()).toEqual(head);
      const cold = new GmWaitCustody(reopened.store, r.policy);
      expect(cold.status(h.source.pc.id).state).toBe("SEALED_UNRECONCILED");
      const replay = await must(cold.sealOwn(x));
      expect(replay.replayed).toBe(true);
      expect(replay.receipt).toEqual(sealed.receipt);
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });

  it("is the same two-write seal as the original zero-stage seal: no extra write, no extra read key", async () => {
    const r = await laneRig(QUIET);
    const legacy = await seededRig(tempDir());
    try {
      await must(r.clock.sealOwn(r.x));
      const quiet = r.store.committedGroup(
        r.store.getFact(temporalTransactionKey(txOf(r.x)))!.provenance.intent_id,
      )!;
      const { x } = await lifecycle(legacy, "seal");
      const old = legacy.store.committedGroup(
        legacy.store.getFact(temporalTransactionKey(txOf(x)))!.provenance.intent_id,
      )!;
      expect(quiet.writes.map((w) => w.key).sort()).toEqual(old.writes.map((w) => w.key).sort());
      expect(quiet.writes).toHaveLength(2);
      expect(quiet.reads.length).toBe(old.reads.length);
      expect(quiet.depends_on.length).toBe(old.depends_on.length);
    } finally {
      await r.h.campaign.close().catch(() => undefined);
      await legacy.campaign.close().catch(() => undefined);
    }
  });
});

describe("G1 something due, or no proof of nothing due, never seals as quiet", () => {
  it.each([
    ["a boundary exactly at the target", 300],
    ["a boundary before the target", 450],
  ])("refuses %s with zero credited stages and moves nothing", async (_n, value) => {
    const r = await laneRig(value);
    try {
      const head = r.store.head();
      expect(await r.clock.sealOwn(r.x)).toMatchObject({
        ok: false,
        error: { code: "GM_WAIT_NOT_IN_STATE" },
      });
      expect(r.store.head()).toEqual(head);
      expect(r.clock.status(r.h.source.pc.id).state).toBe("ACTIVE");
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });

  it("admission refuses a valid quiet seal the moment ONE index entry is at or before the target (a single changed variable)", async () => {
    const r = await laneRig(QUIET);
    try {
      const state = r.store.canonicalState!();
      const built = gmWait.buildSealGroup(state.facts, r.x, kernelRule, state);
      if (!built.ok) throw new Error(JSON.stringify(built.error));
      expect(temporalGroupCheck(built.value, state, ctxOf(r))).toBeNull(); // the control: admitted on the true state
      const idx = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)!;
      const entries = (idx.value as any).entries as any[];
      for (const [name, value] of [
        ["exactly at the target", QUIET],
        ["before the target", QUIET - 50],
      ] as const) {
        const due = copyOf(state, (f) =>
          f.set(TEMPORAL_BOUNDARY_INDEX_KEY, {
            ...idx,
            value: {
              entries: [{ ...entries[0], at: { ...entries[0].at, value } }, ...entries.slice(1)],
            },
          }),
        );
        expect(temporalGroupCheck(built.value, due, ctxOf(r)), name).toMatchObject({
          details: { reason: "GM_WAIT_SEAL" },
        });
      }
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });

  it("does not read a missing, malformed, duplicated or incomparable index as nothing due", async () => {
    const r = await laneRig(QUIET);
    try {
      const state = r.store.canonicalState!();
      const { authority, marker } = settlementArgs(r, state);
      const ok = if6bSettlement(state, authority, marker, [], kernelRule);
      expect(ok).toBeDefined();
      expect(ok!.writes).toEqual([]);
      const idx = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)!;
      const entries = (idx.value as any).entries as any[];
      const variants: [string, CampaignState][] = [
        ["absent", copyOf(state, (f) => f.delete(TEMPORAL_BOUNDARY_INDEX_KEY))],
        [
          "malformed",
          copyOf(state, (f) =>
            f.set(TEMPORAL_BOUNDARY_INDEX_KEY, { ...idx, value: { entries: "x" } }),
          ),
        ],
        [
          "duplicated",
          copyOf(state, (f) =>
            f.set(TEMPORAL_BOUNDARY_INDEX_KEY, {
              ...idx,
              value: { entries: [entries[0], ...entries] },
            }),
          ),
        ],
        [
          "mixed units",
          copyOf(state, (f) =>
            f.set(TEMPORAL_BOUNDARY_INDEX_KEY, {
              ...idx,
              value: {
                entries: [
                  ...entries,
                  { ...entries[0], object_id: "zz", at: { unit: "other", value: 9999 } },
                ],
              },
            }),
          ),
        ],
        [
          // refused by the expected-object lookup (the object's own boundary no longer agrees), which runs before the quiet comparison
          "valid but in a unit the expected object does not share",
          copyOf(state, (f) =>
            f.set(TEMPORAL_BOUNDARY_INDEX_KEY, {
              ...idx,
              value: {
                entries: entries.map((e) => ({ ...e, at: { ...e.at, unit: "other-clock" } })),
              },
            }),
          ),
        ],
      ];
      for (const [name, bad] of variants)
        expect(if6bSettlement(bad, authority, marker, [], kernelRule), name).toBeUndefined();
      // a target in a unit the index does not share reaches the quiet comparison itself (incomparable is not "after"); the kernel schema's
      // opening-basis rule refuses the same candidate a second time, so this guard is deliberately redundant
      const foreign = {
        ...authority,
        requested: { ...authority.requested, target: { unit: "other-clock", value: QUIET } },
      };
      expect(if6bSettlement(state, foreign, marker, [], kernelRule)).toBeUndefined();
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });

  it("does not read an absent occurrence object as proof of quiet (T94b is refused; no source-authorized no-occurrence setup exists)", async () => {
    const r = await laneRig(QUIET);
    try {
      const state = r.store.canonicalState!();
      const { authority, marker } = settlementArgs(r, state);
      const key = temporalObjectKey("obj-workshop-notice-" + r.x);
      const idx = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)!;
      const gone = copyOf(state, (f) => {
        f.delete(key);
        f.set(TEMPORAL_BOUNDARY_INDEX_KEY, {
          ...idx,
          value: {
            entries: (idx.value as any).entries.filter(
              (e: any) => e.object_id !== "obj-workshop-notice-" + r.x,
            ),
          },
        });
      });
      expect(if6bSettlement(gone, authority, marker, [], kernelRule)).toBeUndefined();
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });
});

describe("G1 history identity: the old identity refuses, byte for byte", () => {
  it("carries the segment immediately before the terminal IF-6b segment; no other identity gains it", async () => {
    const r = await laneRig(QUIET);
    try {
      expect(
        r.policy.historyVerificationId.endsWith(
          GM_WAIT_IF6B_QUIET_SEAL_SEGMENT + "+" + IF6B_POLICY,
        ),
      ).toBe(true);
      expect(GM_WAIT_IF6B_QUIET_SEAL_SEGMENT).toBe("+G1-QUIET-SEAL-V1@2026-11-26T23:55:57.797Z");
      expect(fixtureCanonicalAdmission.historyVerificationId).not.toContain("G1-QUIET-SEAL");
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });

  it("refuses the same quiet seal under an identity without the segment, or with it misplaced, in builder and admission", async () => {
    const r = await laneRig(QUIET);
    try {
      const state = r.store.canonicalState!();
      const built = gmWait.buildSealGroup(state.facts, r.x, kernelRule, state);
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      expect(temporalGroupCheck(built.value, state, ctxOf(r))).toBeNull(); // the genuine identity admits it
      const identity = r.policy.historyVerificationId;
      const old = identity.replace(GM_WAIT_IF6B_QUIET_SEAL_SEGMENT, "");
      const misplaced = GM_WAIT_IF6B_QUIET_SEAL_SEGMENT + old;
      for (const [name, id] of [
        ["old identity", old],
        ["segment misplaced", misplaced],
      ] as const) {
        const bad = withIdentity(r, state, id);
        const viaBuilder = gmWait.buildSealGroup(bad.facts, r.x, kernelRule, bad);
        expect(viaBuilder.ok, name).toBe(false);
        expect(temporalGroupCheck(built.value, bad, ctxOf(r)), name).toMatchObject({
          details: { reason: "GM_WAIT_SEAL" },
        });
      }
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });
});

describe("G1 a quiet seal cannot be forged, widened or turned into another outcome", () => {
  it("rejects a seal that moves a different time, writes an object or the index, or drops a dependency", async () => {
    const r = await laneRig(QUIET);
    try {
      const state = r.store.canonicalState!();
      const built = gmWait.buildSealGroup(state.facts, r.x, kernelRule, state);
      if (!built.ok) throw new Error(JSON.stringify(built.error));
      const group = built.value;
      expect(temporalGroupCheck(group, state, ctxOf(r))).toBeNull();
      const txKey = temporalTransactionKey(txOf(r.x));
      const clockWrite = group.writes.find((w) => w.key === TEMPORAL_STATE_KEY)!;
      const idx = state.facts.get(TEMPORAL_BOUNDARY_INDEX_KEY)!;
      const objectKey = temporalObjectKey("obj-workshop-notice-" + r.x);
      const object = state.facts.get(objectKey)!;
      const mutate = (name: string, g: CommitGroup) =>
        expect(temporalGroupCheck(g, state, ctxOf(r)), name).not.toBeNull();
      mutate("later stop", {
        ...group,
        writes: group.writes.map((w) =>
          w.key === txKey
            ? {
                ...w,
                value: {
                  ...(w.value as any),
                  outcome: {
                    ...(w.value as any).outcome,
                    actual_stop: { unit: WORKSHOP_SECOND, value: QUIET + 1 },
                  },
                },
              }
            : w,
        ),
      });
      mutate("extra index write", {
        ...group,
        writes: [
          ...group.writes,
          {
            ...clockWrite,
            key: TEMPORAL_BOUNDARY_INDEX_KEY,
            expected_version: idx.version,
            value: idx.value,
          },
        ],
      });
      mutate("extra object write", {
        ...group,
        writes: [
          ...group.writes,
          { ...clockWrite, key: objectKey, expected_version: object.version, value: object.value },
        ],
      });
      mutate("dropped dependency", { ...group, depends_on: group.depends_on.slice(1) });
      mutate("wrong group identity", { ...group, group_id: "forged", intent_id: "forged" });
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });

  it("keeps the staged schema strict: zero stages is only the quiet target seal", async () => {
    const r = await laneRig(QUIET);
    try {
      await must(r.clock.sealOwn(r.x));
      const value = r.store.getFact(temporalTransactionKey(txOf(r.x)))!.value as any;
      expect(GmWaitStagedTransactionSchema.safeParse(value).success).toBe(true);
      expect(GmWaitStoredTransactionSchema.safeParse(value).success).toBe(true);
      const interrupted = {
        ...value,
        outcome: {
          actual_stop: { unit: WORKSHOP_SECOND, value: QUIET - 50 },
          stop_reason: "INTERRUPTED",
          remainder: {
            from: { unit: WORKSHOP_SECOND, value: QUIET - 50 },
            to: value.requested.target,
          },
          unresolved_dependents: [],
          interruption: { object_id: "o", boundary_id: "b", occurrence_group_id: "g" },
        },
      };
      expect(GmWaitStagedTransactionSchema.safeParse(interrupted).success).toBe(false);
      for (const edit of [
        {
          engaged: [
            {
              boundary: "RETIRED",
              object_id: "o",
              fact_key: "k",
              version_before: 1,
              version_after: 2,
            },
          ],
        },
        { boundaries_crossed: [{ object_id: "o", boundary_id: "b", at: value.requested.target }] },
      ])
        expect(GmWaitStagedTransactionSchema.safeParse({ ...value, ...edit }).success).toBe(false);
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });
});

describe("G1 T95 hidden-schedule twins", () => {
  it("admits the marker and the OPEN identically whether or not the target crosses a hidden boundary", async () => {
    const quiet = await laneRig(QUIET);
    const crossing = await laneRig(900);
    try {
      const shape = (r: LaneRig, intent: string) => {
        const g = r.store.committedGroup(intent)!;
        return {
          reads: g.reads.map((x) => x.key).sort(),
          writes: g.writes.map((w) => w.key).sort(),
          depends: g.depends_on.length,
          owner: g.owner,
          facet: g.facet,
        };
      };
      expect(shape(quiet, gmWaitMarkerIntentId(quiet.x))).toEqual(
        shape(crossing, gmWaitMarkerIntentId(crossing.x)),
      );
      expect(shape(quiet, gmWaitOpenIntentId(quiet.x))).toEqual(
        shape(crossing, gmWaitOpenIntentId(crossing.x)),
      );
      expect(quiet.clock.status(quiet.h.source.pc.id).state).toBe("ACTIVE");
      expect(crossing.clock.status(crossing.h.source.pc.id).state).toBe("ACTIVE");
    } finally {
      await quiet.h.campaign.close().catch(() => undefined);
      await crossing.h.campaign.close().catch(() => undefined);
    }
  });
});

describe("G1 the quiet aftermath", () => {
  it("reconciles a quiet seal, only that seal, and survives a cold reopen", async () => {
    const r = await laneRig(QUIET);
    try {
      const { store, clock, x, h, proof } = r;
      const marker = GmWaitMarkerSchema.parse(store.getFact(temporalGmWaitMarkerKey(x))!.value);
      const lane = workshopLaneXAdmission(
        h.profile,
        r.signed.fixture,
        r.policy.historyVerificationId,
      );
      const unsealed = store.canonicalState!();
      expect(lane.permitsReconcile!(marker, unsealed)).toBe(false); // ACTIVE: no seal yet
      // ordinary staged seals still wait for their owner aftermath: nothing is reconcilable before the seal
      expect(await clock.reconcile(proof)).toMatchObject({ ok: false });
      await must(clock.sealOwn(x));
      const sealed = store.canonicalState!();
      expect(lane.permitsReconcile!(marker, sealed)).toBe(true);
      // custody always hands over the marker of the state; under the old identity the very same quiet seal is not reconcilable
      const old = r.policy.historyVerificationId.replace(GM_WAIT_IF6B_QUIET_SEAL_SEGMENT, "");
      const oldMarker = { ...marker, policy: { ...marker.policy, history_verification_id: old } };
      expect(lane.permitsReconcile!(oldMarker, withIdentity(r, sealed, old))).toBe(false);
      const done = await must(clock.reconcile(proof));
      expect(done.slot).toBe("SEALED_RECONCILED");
      const head = store.head();
      expect((await must(clock.reconcile(proof))).replayed).toBe(true);
      expect(store.head()).toEqual(head);
      await h.campaign.close();
      const reopened = await must(h.reopen());
      expect(reopened.store.head()).toEqual(head);
      expect(new GmWaitCustody(reopened.store, r.policy).status(h.source.pc.id).state).toBe(
        "SEALED_RECONCILED",
      );
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });

  // KNOWN BLOCKER (BLUE brief "Quiet aftermath", RED C-2 / C-5): characterisation, not a requirement. The existing World-State owner terminal
  // (R-5(2) SETTLED_NOT_OCCURRED) derives, but the W2 stage-claim rule refuses it: its dependency names the Temporal reconcile group and
  // `verifyAftermath` recognises only the Health close and the Epistemic access event. This holds for any X, so it is not caused by G1. It flips
  // when BLUE clears an owner-terminal change; until then the enrolment stays PENDING and no further INITIAL can be enrolled for the PC.
  it("characterisation: the World-State owner terminal for the quiet X is refused (open owner-terminal blocker)", async () => {
    const r = await laneRig(QUIET);
    try {
      const { store, clock, x, proof, enrolment, object } = r;
      await must(clock.sealOwn(x));
      await must(clock.reconcile(proof));
      const settle = deriveNoticeSettlement(workshopView(store), enrolment.key, false);
      expect(settle).toBeDefined(); // the owner can derive it...
      const head = store.head();
      expect(await store.commit(settle!)).toMatchObject({
        ok: false,
        error: { details: { reason: "GM_WAIT_STAGE_CLAIM_UNSOURCED" } }, // ...and W2 refuses it
      });
      expect(store.head()).toEqual(head);
      const status = (
        WorkshopNoticeEnrolmentSchema.parse(store.getFact(enrolment.key)!.value).state as any
      ).status;
      expect(status).toBe("PENDING");
      // the still-future notice object tied to the closed X is neither retired nor altered
      expect(
        (store.getFact(temporalObjectKey(object.object_id))!.value as any).next_boundary,
      ).not.toBeNull();
      expect(
        ((store.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)!.value as any).entries as any[]).some(
          (e) => e.object_id === object.object_id,
        ),
      ).toBe(true);
      // and no second enrolment can be derived while the first is not settled
      const duty = store.listFacts().find((f) => WorkshopDutySchema.safeParse(f.value).success)!;
      const x2 = (gmWaitX("session-original-1", "2") as { x: string }).x;
      expect(r.publisher.enrol(x2, duty.key)).toBeUndefined();
    } finally {
      await r.h.campaign.close().catch(() => undefined);
    }
  });
});
