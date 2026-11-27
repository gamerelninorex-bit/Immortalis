// F-014B replay prerequisite: NEGATIVE journals for the bounded original-policy resolver.
//
// Each forged journal is HASH-CONSISTENT: it is written through a campaign whose live admission is permissive (`check` accepts everything), so the
// hash chain, receipts and state digests are all valid and only the historical verifier can refuse it. It is then reopened, with no checkpoint, under
// the honest admission. A negative therefore proves the resolver's own rule, not a broken hash. Each negative has a positive control that differs
// only in the thing being forged.
import { describe, expect, it } from "vitest";
import { CanonicalCampaign, sha256Canonical } from "@immortalis/engine";
import { generateFixtureRunnerKeys } from "@immortalis/testkit";
import {
  WorkshopDutySchema,
  workshopCharterKey,
} from "../../packages/contracts/src/workshop-opening.ts";
import { gmWaitX } from "../../packages/engine/src/gm-wait-identity.ts";
import {
  WORKSHOP_G0_CATALOGUE_SHA256,
  type WorkshopHistoryRef,
} from "../../packages/engine/src/owners/workshop/generation.ts";
import { WorkshopNoticeAdapter } from "../../packages/engine/src/owners/workshop/notice-publication.ts";
import { workshopView } from "../../packages/engine/src/owners/workshop/publication.ts";
import { signedWorkshopLaneX } from "../support/b3-lane-x.ts";
import { openWorkshop } from "../support/b3-opening.ts";
import { deterministicFixtureKeys } from "../support/deterministic-keys.ts";
import {
  JOURNALS,
  SUCCESSOR,
  headKey,
  openGenuineLaneX,
  withoutCheckpoints,
} from "../support/f014b-original-policy.ts";
import { copyPackage, journalOf, manifestOf } from "./b2-support.ts";

type Pair = (admissionId: string) => WorkshopHistoryRef;
const permissive = <T extends { check: unknown }>(admission: T): T => ({
  ...admission,
  check: () => null,
});

/** A campaign whose owner adapters publish under `pair` and whose live admission accepts anything: the forger. */
async function forger(pair: Pair | undefined) {
  const keys = deterministicFixtureKeys(generateFixtureRunnerKeys().keyId);
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const h = await openWorkshop("glassbell", {
    fixedKeys: keys,
    admissionOverride: permissive,
    ...(pair ? { historyRef: pair } : {}),
    laneX(k) {
      signed = signedWorkshopLaneX(k, true);
      return signed.fixture;
    },
  });
  return { h, signed, keys };
}

/** reopen a forged package, with no checkpoint, under the honest build; resolves to the open result and the first workshop revision */
async function reopenHonest(
  f: Awaited<ReturnType<typeof forger>>,
  ...more: (() => Promise<void>)[]
) {
  for (const m of more) await m();
  const dir = withoutCheckpoints(copyPackage(f.h.dir as string));
  const forgedHead = f.h.campaign.store.head();
  await f.h.campaign.close();
  let signed!: ReturnType<typeof signedWorkshopLaneX>;
  const honest = await openWorkshop("glassbell", {
    fixedKeys: f.keys,
    laneX(k) {
      signed = signedWorkshopLaneX(k, true);
      return signed.fixture;
    },
  });
  signed.importAuthorizations(f.signed.exportAuthorizations());
  const opened = await CanonicalCampaign.open(dir, { testkitFixtureAdmission: honest.admission });
  return { opened, honest, dir, forgedHead };
}
const firstRevisionWriting = (dir: string, keyOf: (campaign: string) => string) => {
  const campaign = manifestOf(dir).campaign_id as string;
  return journalOf(dir).find((e) => e.group.writes.some((w) => w.key === keyOf(campaign)))!
    .revision;
};
const refusedAt = (
  opened: Awaited<ReturnType<typeof reopenHonest>>["opened"],
  revision: number,
) => {
  expect(opened.ok).toBe(false);
  if (opened.ok) return;
  expect(opened.error.code).toBe("REPLAY_MISMATCH");
  expect(opened.error.message).toContain("historical verification");
  expect((opened.error.details as { revision: number }).revision).toBe(revision);
};
const close = async (r: Awaited<ReturnType<typeof reopenHonest>>) => {
  if (r.opened.ok) await r.opened.value.close();
  await r.honest.campaign.close();
};

describe("forged charter policy: the recorded pair is recomputed against the finite registry, never interpreted", () => {
  it("control: the honest pair written through the same forger replays", async () => {
    const r = await reopenHonest(await forger(undefined));
    expect(r.opened.ok, JSON.stringify(r.opened.ok ? null : r.opened.error)).toBe(true);
    if (r.opened.ok) expect(headKey(r.opened.value.store.head())).toEqual(headKey(r.forgedHead));
    await close(r);
  });

  const cases: readonly [string, Pair][] = [
    [
      "an unknown catalogue digest with the current identity",
      (id) => ({ historyId: id, catalogueSha256: "cd".repeat(32) }),
    ],
    [
      "a VALID identity with another generation's VALID catalogue (each half known, the pair not)",
      (id) => ({ historyId: id, catalogueSha256: SUCCESSOR.catalogueSha256 }),
    ],
    [
      "a forged identity with the genuine G0 catalogue",
      (id) => ({
        historyId: id + "+FORGED-SEGMENT",
        catalogueSha256: WORKSHOP_G0_CATALOGUE_SHA256,
      }),
    ],
    [
      "a different identity and a different catalogue, both well-formed",
      (id) => ({ historyId: sha256Canonical(id), catalogueSha256: sha256Canonical("other") }),
    ],
  ];
  for (const [label, pair] of cases) {
    it(`refuses ${label} at the charter, hash-consistent`, async () => {
      const f = await forger(pair);
      const r = await reopenHonest(f);
      refusedAt(r.opened, firstRevisionWriting(r.dir, workshopCharterKey));
      await close(r);
    });
  }
});

describe("the lineage is bound at its charter and cannot switch generation afterwards", () => {
  it("refuses a later workshop owner fact published under another pair, hash-consistent", async () => {
    const f = await forger(undefined); // an honest charter and opening
    const store = f.h.campaign.store;
    const duty = store.listFacts().find((x) => WorkshopDutySchema.safeParse(x.value).success)!;
    const x = (gmWaitX("session-original-1", "1") as { x: string }).x;
    f.signed.authorize(workshopView(store), x, duty.key);
    // the switch: a notice enrolment recorded under a pair the charter did not bind
    const switched = new WorkshopNoticeAdapter(
      store,
      {
        historyId: f.h.admission.historyVerificationId!,
        catalogueSha256: SUCCESSOR.catalogueSha256,
      },
      f.signed.fixture.noticeSource,
    );
    const wrote = await switched.enrol(x, duty.key)!;
    expect(wrote.ok, JSON.stringify(wrote.ok ? null : wrote.error)).toBe(true);
    const r = await reopenHonest(f);
    const enrolmentRevision = journalOf(r.dir).at(-1)!.revision;
    refusedAt(r.opened, enrolmentRevision);
    await close(r);
  });

  it("control: the same enrolment under the charter's own pair replays", async () => {
    const f = await forger(undefined);
    const store = f.h.campaign.store;
    const duty = store.listFacts().find((y) => WorkshopDutySchema.safeParse(y.value).success)!;
    const x = (gmWaitX("session-original-1", "1") as { x: string }).x;
    f.signed.authorize(workshopView(store), x, duty.key);
    const same = new WorkshopNoticeAdapter(
      store,
      f.h.admission.historyVerificationId!,
      f.signed.fixture.noticeSource,
    );
    expect((await same.enrol(x, duty.key)!).ok).toBe(true);
    const r = await reopenHonest(f);
    expect(r.opened.ok, JSON.stringify(r.opened.ok ? null : r.opened.error)).toBe(true);
    await close(r);
  });
});

describe("a recorded original-policy lineage is replay-only: historical selection grants nothing live", () => {
  /**
   * A live rewrite of the lineage's own charter (structurally valid at its current version) carrying `policyOf(...)`. The guard runs before any
   * derivation, so what is proven is that NO live workshop write is admitted into an original-policy lineage, whichever pair it carries.
   */
  async function liveWrite(policyOf: (originalPolicy: unknown, currentId: string) => unknown) {
    const { h2, opened } = await openGenuineLaneX(JOURNALS.occurred, SUCCESSOR);
    expect(opened.ok, JSON.stringify(opened.ok ? null : opened.error)).toBe(true);
    if (!opened.ok) throw new Error("the genuine journal must open");
    const store = opened.value.store;
    const charter = store.getFact(workshopCharterKey(store.head().campaign_id))!;
    const original = store.committedGroup(charter.provenance.intent_id)!;
    const group = {
      ...original,
      group_id: "probe-group:live-into-original-lineage",
      intent_id: "probe-intent:live-into-original-lineage",
      reads: [],
      depends_on: [],
      writes: original.writes.map((w) => ({
        ...w,
        expected_version: charter.version,
        value: {
          ...(w.value as object),
          policy: policyOf(
            (w.value as { policy: unknown }).policy,
            h2.admission.historyVerificationId!,
          ),
        },
      })),
    };
    const before = headKey(store.head());
    const result = await store.commit(group);
    const after = headKey(store.head());
    await opened.value.close();
    await h2.campaign.close();
    return { result, before, after };
  }
  const reasonOf = (r: Awaited<ReturnType<typeof liveWrite>>["result"]) =>
    !r.ok ? (r.error as { details?: { reason?: string } }).details?.reason : undefined;

  it("refuses a new live write carrying the lineage's ORIGINAL pair (an old digest, live)", async () => {
    const r = await liveWrite((original) => original);
    expect(reasonOf(r.result)).toBe("WORKSHOP_ORIGINAL_POLICY_REPLAY_ONLY");
    expect(r.after).toEqual(r.before);
  });

  it("refuses a new live write carrying the CURRENT pair (a mixed lineage)", async () => {
    const r = await liveWrite((original, currentId) => ({
      ...(original as object),
      history_verification_id: currentId,
      catalogue_sha256: SUCCESSOR.catalogueSha256,
    }));
    expect(reasonOf(r.result)).toBe("WORKSHOP_ORIGINAL_POLICY_REPLAY_ONLY");
    expect(r.after).toEqual(r.before);
  });
});
