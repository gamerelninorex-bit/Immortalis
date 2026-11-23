/* eslint-disable @typescript-eslint/no-explicit-any -- raw groups and store wrappers */
// F-014B B2-T07 and B2-T10 — the PRODUCTION build refuses every GM-wait custody write (default deny), and the pre-OPEN path reads nothing about the
// hidden future. SCRIPTED TESTKIT MECHANISM ONLY: the positive in the sibling tests runs under the TESTKIT-ONLY fixture admission; here the very same
// lawful, correctly-shaped groups meet the PRODUCTION `canonicalAdmission`, which qualifies no original-owner preparation because none exists
// (D3(b) is not adopted), and refuses them without writing.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  temporalGmWaitByPcKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  CanonicalCampaign,
  GmWaitCustody,
  buildMarkerGroup,
  buildOpenGroup,
  buildSealGroup,
  canonicalAdmission,
  factKind,
  fixtureCanonicalAdmission,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  FIXTURE_LOCUS_ID,
  SYNTH_EXTENSION,
  T0,
  TB,
  engagedObject,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  publication,
  syntheticSourceGroup,
  temporalPublication,
} from "@immortalis/testkit";
import { StageProviderRegistry, TemporalCoordinator } from "@immortalis/engine";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  FIXTURE_ADMISSION,
  at,
  custodyPolicy,
  lifecycle,
  markerInput,
  must,
  prepOf,
  proofOf,
  seededRig,
  tempDir,
  type Rig,
} from "./b2-support.ts";

/** The same prerequisite campaign, under the PRODUCTION admission (no testkit override at all). */
async function productionRig(dir: string): Promise<Rig> {
  const campaign = await must(
    CanonicalCampaign.create(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      buildId: "b2-prod",
      extension: SYNTH_EXTENSION,
    }),
  );
  await must(campaign.establishWorld({ ...publication(1), world: fixtureWorld() }));
  await must(campaign.establishLocus({ ...publication(2), locus: fixtureLocus() }));
  await must(campaign.releasePlayerCharacter({ ...publication(3), contract: fixtureContract() }));
  await must(
    campaign.initializePcStandingInstructionLedger({
      pc_id: FIXTURE_PC_ID,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
    }),
  );
  await must(
    campaign.bindPlayerCharacter({
      ...publication(4),
      pc_id: FIXTURE_PC_ID,
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
      insertion: fixtureInsertionFact(),
    }),
  );
  await must(campaign.store.commit(syntheticSourceGroup(FIXTURE_CAMPAIGN, 1, "source-v1", 0)));
  await must(
    new TemporalCoordinator(campaign.store, new StageProviderRegistry()).establishCanonicalTime({
      ...temporalPublication(1),
      time: T0,
    }),
  );
  return {
    dir,
    campaign,
    store: campaign.store,
    custody: new GmWaitCustody(campaign.store, custodyPolicy(canonicalAdmission)),
    proof: proofOf(),
    prep: prepOf(campaign.store),
  };
}

const unchanged = (store: CampaignStore) => ({
  head: store.head(),
  facts: JSON.stringify(store.listFacts()),
});

describe("B2-T07 the production build declines every positive GM-wait custody write, without writing", () => {
  it("[control] the build's fixture admission and its production admission differ only in the qualification of the preparation, and carry different history identities", () => {
    expect(canonicalAdmission.historyVerificationId).not.toBe(
      fixtureCanonicalAdmission.historyVerificationId,
    );
    expect(canonicalAdmission.historyVerificationId).toContain("GM-WAIT-W2-CUSTODY-V1");
    expect(fixtureCanonicalAdmission.historyVerificationId).toContain("GM-WAIT-W2-CUSTODY-V1");
  });

  it("a lawful, fully-shaped marker with a verified origin proof is REFUSED by the production admission, whichever preparation class it claims, and nothing is written", async () => {
    const rig = await productionRig(tempDir());
    const before = unchanged(rig.store);
    for (const kind of ["OWNER_PENDING_ENROLMENT", "AUTHORIZED_QUIET"] as const) {
      const r = await rig.custody.publishMarker(
        markerInput(rig, { preparation: { ...rig.prep, kind } }),
      );
      expect(r.ok, kind).toBe(false);
      expect((r as any).error.details.reason, kind).toBe("GM_WAIT_PREPARATION_UNQUALIFIED");
      expect(unchanged(rig.store), kind).toEqual(before);
    }
    // the very same inputs, the only change being the TESTKIT-ONLY admission, are accepted: the refusal is attributable to the production policy alone
    const fixture = await seededRig(tempDir());
    await must(fixture.custody.publishMarker(markerInput(fixture)));
    await rig.campaign.close();
  });

  it("no later transition can be published either: an OPEN, a seal, a NO_OPEN and a reconciliation built on a fixture campaign are all refused on a production one", async () => {
    const fixture = await seededRig(tempDir());
    const { x } = await lifecycle(fixture, "open");
    const get = (k: string) => fixture.store.getFact(k);
    const seal = buildSealGroup({ get }, x, factKind("temporal_state").rule);
    const open = fixture.store.committedGroup(`gm-wait-open-intent:${x}`)!;
    const marker = fixture.store.committedGroup(`gm-wait-marker-intent:${x}`)!;
    const prod = await productionRig(tempDir());
    const before = unchanged(prod.store);
    const groups: [string, CommitGroup][] = [
      ["the marker", marker],
      ["the OPEN", open],
      ...(seal.ok ? ([["the seal", seal.value]] as [string, CommitGroup][]) : []),
    ];
    for (const [what, g] of groups) {
      const r = await prod.store.commit(g);
      expect(r.ok, what).toBe(false);
      expect(unchanged(prod.store), what).toEqual(before);
    }
    expect(prod.store.getFact(temporalGmWaitByPcKey(FIXTURE_PC_ID))).toBeUndefined();
    expect(prod.store.getFact(temporalTransactionAuthorityKey(`gm-wait:${x}`))).toBeUndefined();
    expect(prod.store.getFact(temporalTransactionKey(`gm-wait:${x}`))).toBeUndefined();
    await prod.campaign.close();
  });

  it("the build installs nothing else: the registry gained exactly the two Temporal kinds, none for a World-State reservation or notice, a Named-Actor duty or Health", async () => {
    const ids = ALL_FACT_KINDS.map((k) => k.id as string);
    const added = ["temporal_gm_wait_marker", "temporal_gm_wait_pc_index"];
    for (const id of added) expect(ids).toContain(id);
    // the retained B1 v2 census names every kind that existed before B2: the registry is exactly that set plus the two
    const manifest = JSON.parse(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("node:fs").readFileSync(
        new URL(
          "../../packages/engine/gm-wait-catalogue/manifests/e9049723f8b217d0557bcd4dcbfd126a58cb9777b82663e5c6f17a6842510500.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const before: string[] = manifest.kinds.map((k: { id: string }) => k.id);
    expect(ids.filter((id) => !before.includes(id)).sort()).toEqual(added);
    expect(before.filter((id) => !ids.includes(id))).toEqual([]);
    // and none of the two is a World-State reservation or notice, a Named-Actor duty or a Health kind (D3(b), R-DUTY and R-H are not adopted)
    expect(
      added.filter((id) => /(reservation|enrol|notice|duty|health|occurred|settled)/i.test(id)),
    ).toEqual([]);
    for (const k of ALL_FACT_KINDS.filter((k) => added.includes(k.id as string))) {
      expect(k.owner).toBe("temporal_kernel");
      expect(k.facet).toBe("temporal_coordination");
    }
  });

  it("the custody writer's only canonical writes are kernel Temporal groups: the groups it builds name no other owner and no World-State key", async () => {
    const rig = await seededRig(tempDir());
    const { x } = await lifecycle(rig, "reconcile");
    for (const prefix of ["marker", "open", "no-open", "reconcile"]) {
      const g = rig.store.committedGroup(`gm-wait-${prefix}-intent:${x}`);
      if (!g) continue;
      expect(g.owner).toBe("temporal_kernel");
      for (const w of g.writes) {
        expect(w.owner).toBe("temporal_kernel");
        expect(w.key.startsWith("temporal/")).toBe(true);
      }
    }
    expect(
      rig.store.listFacts().some((f) => f.owner === "world_state" && f.key.includes("gm-wait")),
    ).toBe(false);
  });
});

describe("B2-T10 hidden-future twins: a due event inside or outside the requested horizon is indistinguishable before OPEN", () => {
  /** twin rigs differ ONLY in the hidden object's boundary: inside (140 < target 160) or outside (200 > target 160) the requested horizon */
  async function twin(boundaryAt: number) {
    const rig = await seededRig(tempDir());
    const coordinator = new TemporalCoordinator(rig.store, new StageProviderRegistry());
    await must(
      coordinator.registerObject({
        ...temporalPublication(2),
        object: engagedObject({
          next_boundary: { boundary_id: "boundary-engaged-1", at: at(boundaryAt) },
        }),
      }),
    );
    return rig;
  }
  const inside = () => twin(TB.value);
  const outside = () => twin(200);

  it("the marker group, the index and the status are byte-identical across the twins, and the writer reads no object and no boundary index", async () => {
    const a = await inside();
    const b = await outside();
    const reads: string[] = [];
    const spyOn = (r: Rig): Rig => ({
      ...r,
      custody: new GmWaitCustody(
        new Proxy(r.store, {
          get(t, p, rcv) {
            if (p === "getFact") return (k: string) => (reads.push(k), t.getFact(k));
            if (p === "listFacts") return () => (reads.push("<listFacts>"), t.listFacts());
            const v = Reflect.get(t, p, rcv);
            return typeof v === "function" ? v.bind(t) : v;
          },
        }),
        custodyPolicy(),
      ),
    });
    const [sa, sb] = [spyOn(a), spyOn(b)];
    const [ma, mb] = [
      await must(sa.custody.publishMarker(markerInput(a))),
      await must(sb.custody.publishMarker(markerInput(b))),
    ];
    expect(ma.x).toBe(mb.x);
    expect(JSON.stringify(a.store.committedGroup(ma.receipt.intent_id))).toBe(
      JSON.stringify(b.store.committedGroup(mb.receipt.intent_id)),
    );
    expect(sa.custody.status(FIXTURE_PC_ID)).toEqual(sb.custody.status(FIXTURE_PC_ID));
    await must(sa.custody.open(a.proof));
    await must(sb.custody.open(b.proof));
    expect(JSON.stringify(a.store.committedGroup(`gm-wait-open-intent:${ma.x}`))).toBe(
      JSON.stringify(b.store.committedGroup(`gm-wait-open-intent:${mb.x}`)),
    );
    expect(sa.custody.status(FIXTURE_PC_ID)).toEqual({ state: "ACTIVE" });
    expect(sb.custody.status(FIXTURE_PC_ID)).toEqual({ state: "ACTIVE" });
    // no read of any temporal object, of the boundary index, or a listing, before OPEN: nothing future-sensitive is consulted
    expect(
      reads.filter(
        (k) =>
          k.startsWith("temporal/object/") ||
          k === "temporal/boundary-index" ||
          k === "<listFacts>",
      ),
    ).toEqual([]);
  });

  it("the general status reveals only the slot state: no cause, time, target, hidden fact, absence or administrative inner field", async () => {
    const a = await inside();
    await lifecycle(a, "open");
    const status = a.custody.status(FIXTURE_PC_ID);
    expect(Object.keys(status)).toEqual(["state"]);
    const text = JSON.stringify(status);
    for (const forbidden of [
      "cause",
      "target",
      "time",
      "boundary",
      "hidden",
      "absent",
      "witness",
      'x":',
      "TB",
      "160",
      "140",
    ])
      expect(text, forbidden).not.toContain(forbidden);
  });

  it("the production admission's refusal is identical across the twins (still default deny), whatever the hidden schedule", async () => {
    const results: unknown[] = [];
    for (const boundary of [TB.value, 200]) {
      const rig = await productionRig(tempDir());
      await must(
        new TemporalCoordinator(rig.store, new StageProviderRegistry()).registerObject({
          ...temporalPublication(2),
          object: engagedObject({
            next_boundary: { boundary_id: "boundary-engaged-1", at: at(boundary) },
          }),
        }),
      );
      const r = await rig.custody.publishMarker(markerInput(rig));
      results.push(JSON.parse(JSON.stringify(r)));
      await rig.campaign.close();
    }
    expect(results[0]).toEqual(results[1]);
    expect((results[0] as any).ok).toBe(false);
  });
});

void [
  CANON_WRITE_AUTHORITY,
  FIXTURE_ADMISSION,
  GM_WAIT_CATALOGUE_CURRENT_SHA256,
  buildMarkerGroup,
  buildOpenGroup,
];
