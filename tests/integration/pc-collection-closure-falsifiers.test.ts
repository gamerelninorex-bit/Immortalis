/* eslint-disable @typescript-eslint/no-explicit-any -- tests read raw facts */
// BLUE review conditions R-1 and R-2 (newly authorized rules; independent BLUE review pending). The author's closed-domain declaration is
// credible ONLY for a strictly ORIGINAL domain and ONLY against what the owners record: each contrary canonical fact below is a lawful
// owner fact that falsifies a declaration which was true when it was made, and the workforce scope covers exactly Population's ledger
// carriers (resident, present OR burdened at the locality), with INCLUDED / UNKNOWN still withholding. No universal completeness is claimed.
import { describe, expect, it } from "vitest";
import { PopulationAdapter } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  fixtureLocus,
  fixtureWorld,
  popPublication,
  publication,
} from "@immortalis/testkit";
import { coupleActor, establishActorBasis } from "../support/existing-actor.ts";
import { cease } from "../support/pc-cessation.ts";
import { must } from "../support/temporal.ts";
import {
  ACT_A,
  COLLECTION_COMMITTED,
  COLLECTION_REFUSAL,
  PC,
  T0,
  collectionCampaign,
  colPublication,
  confirmAndStart,
  determineRepresentation,
  extractionOf,
  sourceRemaining,
} from "../support/pc-collection.ts";

const ledger = (
  s: Awaited<ReturnType<typeof collectionCampaign>>,
  id: string,
  units: {
    unit_id: string;
    residence: string;
    presence: string;
    burden_allocation: string | null;
  }[],
  n: number,
) =>
  must(
    new PopulationAdapter(s.campaign.store).establishLedger({
      ...popPublication(n),
      ledger: {
        ledger_id: id,
        unit_class: "synthetic-unit-class",
        world_id: FIXTURE_WORLD_ID,
        locus_id: FIXTURE_LOCUS_ID,
        units,
        point: T0,
      },
    }),
  );

describe("R-1: the closed-domain declaration is falsified by a contrary canonical actor, and is lawful only for an ORIGINAL world", () => {
  it("an actor World-State couples to the locus after the declaration makes the closure STALE: the act is withheld before it starts and invalidated if it already runs", async () => {
    // before the start
    const a = await collectionCampaign();
    expect(
      a.collect.sceneClosure(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)!.value.covered.actors,
    ).toEqual([]);
    await establishActorBasis(a, 990, ACTOR_OTHER);
    expect((await coupleActor(a, 990, ACTOR_OTHER)).ok).toBe(true);
    expect(a.collect.sceneClosureIsCurrent(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)).toBe(false);
    const refused = await confirmAndStart(a, ACT_A, 3);
    expect(refused.task.ok).toBe(false);
    expect(JSON.stringify(refused.started)).toBe(COLLECTION_REFUSAL);
    expect(extractionOf(a, ACT_A)).toBeUndefined();
    expect(sourceRemaining(a)).toBe(5);

    // after the start: the same contrary fact invalidates the running act (never silently completed or credited)
    const b = await collectionCampaign();
    await confirmAndStart(b, ACT_A, 3);
    expect(b.collect.hold(PC)).toMatchObject({ state: "IN_FLIGHT" });
    await establishActorBasis(b, 991, ACTOR_OTHER);
    expect((await coupleActor(b, 991, ACTOR_OTHER)).ok).toBe(true);
    const hold = b.collect.hold(PC);
    expect(hold.state).toBe("INVALIDATED");
    expect((hold as any).reason).toMatch(/scene evidence changed/);
    expect(sourceRemaining(b)).toBe(5);
    // R-4: nothing cancelled it by itself and no independent cause was suppressed; the PC's own separate stop is the only release
    expect(b.collect.termination(PC, ACT_A)).toBeUndefined();
    expect(await cease(b)).toEqual(COLLECTION_COMMITTED);
    expect(b.collect.occupancyState(PC)).toEqual({
      state: "RELEASED",
      act_id: ACT_A,
      why: "TERMINATED",
    });
    expect(sourceRemaining(b)).toBe(5);
  }, 180_000);

  it("a reference-setting world cannot be declared closed: the author rule covers a strictly ORIGINAL world only", async () => {
    const s = await collectionCampaign({ sceneClosure: false });
    await must(
      s.campaign.establishWorld({
        ...publication(985),
        world: fixtureWorld({
          world_id: "world-ref",
          reference_causal_basis: {
            mode: "EXACT_NAMED_SETTING",
            setting: "SYNTHETIC FIXTURE: a named reference setting",
            era_version_continuity: null,
          },
        }),
      }),
    );
    await must(
      s.campaign.establishLocus({
        ...publication(986),
        locus: fixtureLocus({
          locus_id: "locus-ref",
          world: { fact_key: "world/world-ref/profile", entity_id: "world-ref" },
        }),
      }),
    );
    const before = s.campaign.store.head().state_sha256;
    const refused = await s.collect.establishSceneClosure({
      ...colPublication(987),
      world_id: "world-ref",
      locus_id: "locus-ref",
      domain: {
        designation: "SYNTHETIC FIXTURE: a reference place",
        topology: "SYNTHETIC FIXTURE: open",
      },
      closure: { statement: "SYNTHETIC FIXTURE: nothing else acts here" },
      source_rights: [],
    });
    expect(refused.ok).toBe(false);
    expect(s.campaign.store.head().state_sha256).toBe(before);
    expect(s.collect.sceneClosure("world-ref", "locus-ref")).toBeUndefined();
  }, 180_000);
});

describe("R-2: the workforce scope covers exactly Population's ledger carriers, by residence, presence AND burden", () => {
  it("a unit resident and present elsewhere but BURDENED at this locality is a carrier the scope accounts, and a unit that counts the PC makes it INCLUDED", async () => {
    const s = await collectionCampaign({ workforceScope: false });
    const burdened = {
      unit_id: "unit-burdened",
      residence: "place-far",
      presence: "place-far",
      burden_allocation: FIXTURE_LOCUS_ID,
    };
    await ledger(s, "ledger-burden", [burdened], 940);
    const declared = await s.collect.establishWorkforceScope({
      ...colPublication(941),
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
      scope: { statement: "SYNTHETIC FIXTURE: the ledgers listed are all" },
    });
    expect(declared.ok).toBe(true);
    const scope = s.collect.workforceScope(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)!.value;
    expect(scope.accounted.map((a) => a.ledger_id)).toEqual(["ledger-burden", "ledger-col"]);
    expect(scope.accounted.find((a) => a.ledger_id === "ledger-burden")!.unit_ids).toEqual([
      "unit-burdened",
    ]);
    expect((await determineRepresentation(s, 942)).ok).toBe(true);
    expect(s.collect.representation(PC)!.value.status).toBe("OUTSIDE_AGGREGATE");

    // a unit that counts the PC and is burdened here: INCLUDED (the PC is a worker Population already accounts), and the act withholds
    const t = await collectionCampaign({ workforceScope: false });
    await ledger(
      t,
      "ledger-pc",
      [
        {
          unit_id: PC,
          residence: "place-far",
          presence: "place-far",
          burden_allocation: FIXTURE_LOCUS_ID,
        },
      ],
      943,
    );
    await t.collect.establishWorkforceScope({
      ...colPublication(944),
      world_id: FIXTURE_WORLD_ID,
      locus_id: FIXTURE_LOCUS_ID,
      scope: { statement: "SYNTHETIC FIXTURE: the ledgers listed are all" },
    });
    expect((await determineRepresentation(t, 945)).ok).toBe(true);
    expect(t.collect.representation(PC)!.value.status).toBe("INCLUDED");
    const r = await confirmAndStart(t, ACT_A, 3);
    expect(JSON.stringify(r.started)).toBe(COLLECTION_REFUSAL);
    expect(sourceRemaining(t)).toBe(5);

    // a further ledger carrier after the declaration makes the scope STALE: an omitted identity is UNKNOWN again, never OUTSIDE
    const u = await collectionCampaign();
    expect(u.collect.workforceScopeIsCurrent(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)).toBe(true);
    await ledger(
      u,
      "ledger-late",
      [
        {
          unit_id: "unit-late",
          residence: "place-far",
          presence: "place-far",
          burden_allocation: FIXTURE_LOCUS_ID,
        },
      ],
      946,
    );
    expect(u.collect.workforceScopeIsCurrent(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID)).toBe(false);
    expect((await determineRepresentation(u, 947)).ok).toBe(true);
    expect(u.collect.representation(PC)!.value.status).toBe("UNKNOWN");
  }, 240_000);
});
