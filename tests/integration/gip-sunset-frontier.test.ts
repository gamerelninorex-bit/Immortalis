// GIP Governance Instrument Sunset — F51-R1: the pending-enrollment frontier holds for EVERY Temporal request shape. A condition-only
// `STOP_AFTER_BOUNDARY` request (no target) is refused BEFORE any transaction authority, owner stage or clock write while a committed
// sunset is unregistered, so another owner's later due boundary cannot publish effects past it and then fail at the final kernel
// admission. Completing the original enrollment lets the same request run: the sunset expires first, the other owner's boundary
// resolves after it, idempotently. Register lineage: IA-04, IA-06 (partial); RC-05/10/16; IM-02, IM-06, IM-11.
import { describe, expect, it } from "vitest";
import {
  GIP_SUNSET_ENROLLMENT_KEY,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  gipInstrumentKey,
  temporalObjectKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  type GovernanceInstrument,
} from "@immortalis/contracts";
import {
  GipAdapter,
  StageProviderRegistry,
  TemporalCoordinator,
  gipSunsetExpiryProvider,
  type CampaignStore,
} from "@immortalis/engine";
import {
  BOUNDARY_ID,
  OBJECT_ENGAGED,
  SYNTH_CONSUMER_RESULT_KEY,
  SYNTH_PRODUCER_RESULT_KEY,
  at,
  consumerProvider,
  engagedObject,
  gipPublication,
  independentProvider,
  producerProvider,
  stopAtBoundaryRequest,
} from "@immortalis/testkit";
import { establishInstitution, establishOffice, establishScopeBinding } from "../support/gip.ts";
import { registrationLost, sunsetInstrument } from "../support/gip-sunset.ts";
import { codeOf, must, seededTemporalCampaign } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const SUNSET = at(200); // GIP's committed sunset
const OTHER_OWNER_BOUNDARY = at(250); // a separate, already registered owner's boundary, LATER than the sunset
const INSTRUMENT = sunsetInstrument().instrument_id;

const providers = () =>
  new StageProviderRegistry([
    producerProvider,
    consumerProvider,
    independentProvider,
    gipSunsetExpiryProvider,
  ]);
const conditionOnly = (id: string, objectId = OBJECT_ENGAGED, boundaryId = BOUNDARY_ID) =>
  stopAtBoundaryRequest(id, {
    requested: {
      target: null,
      condition: { kind: "STOP_AFTER_BOUNDARY", object_id: objectId, boundary_id: boundaryId },
    },
  });

/**
 * A campaign with a separate synthetic owner's engaged object registered at `otherBoundary`, GIP's institution, office and Scope
 * Binding, and a REAL pending enrollment: the Instrument and its receipt are durable, the kernel's registration was lost.
 */
async function pending(otherBoundary = OTHER_OWNER_BOUNDARY) {
  const base = await seededTemporalCampaign(tempDir(), {
    objects: [engagedObject({ next_boundary: { boundary_id: BOUNDARY_ID, at: otherBoundary } })],
  });
  const store = base.campaign.store;
  const gip = new GipAdapter(store);
  await establishInstitution({ gip }, 1);
  await establishOffice({ gip }, 2);
  await establishScopeBinding({ gip }, 3);
  const lost = await new GipAdapter(registrationLost(store)).establishSunsetInstrument({
    ...gipPublication(4),
    instrument: sunsetInstrument(INSTRUMENT, SUNSET),
  });
  expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
  expect(gip.sunsetEnrollment()).toMatchObject({ registered: false });
  return {
    campaign: base.campaign,
    store,
    gip,
    coordinator: new TemporalCoordinator(store, providers()),
  };
}

const clock = (store: CampaignStore) =>
  TemporalStateSchema.parse(store.getFact(TEMPORAL_STATE_KEY)!.value).canonical_time;
const lifecycle = (store: CampaignStore) =>
  (store.getFact(gipInstrumentKey(INSTRUMENT))!.value as GovernanceInstrument).lifecycle_status;

describe("F51-R1: a condition-only request is refused before any write while a GIP enrollment is pending", () => {
  it("another owner's STOP_AFTER_BOUNDARY later than the unregistered sunset writes NO authority, owner stage or clock, and returns the typed refusal", async () => {
    const s = await pending();
    const head = s.store.head();
    const before = s.store.listFacts().length;
    expect(await codeOf(s.coordinator.advance(conditionOnly("tx-cond")))).toBe(
      "ENROLLMENT_PENDING",
    );

    // zero newly committed writes of any kind: not the journal head, not a fact
    expect(s.store.head()).toEqual(head);
    expect(s.store.listFacts()).toHaveLength(before);
    expect(s.store.getFact(temporalTransactionAuthorityKey("tx-cond"))).toBeUndefined();
    expect(s.store.getFact(temporalTransactionKey("tx-cond"))).toBeUndefined();
    expect(s.store.getFact(SYNTH_PRODUCER_RESULT_KEY)).toBeUndefined();
    expect(s.store.getFact(SYNTH_CONSUMER_RESULT_KEY)).toBeUndefined();
    expect(clock(s.store)).toEqual(at(100));
    expect(lifecycle(s.store)).toBe("active");
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the refusal is the same whether the other owner's boundary lies before or after the sunset: a request with no target cannot be bounded before any stage runs", async () => {
    const s = await pending(at(140));
    const head = s.store.head();
    expect(await codeOf(s.coordinator.advance(conditionOnly("tx-early")))).toBe(
      "ENROLLMENT_PENDING",
    );
    expect(s.store.head()).toEqual(head);
    expect(s.store.getFact(SYNTH_PRODUCER_RESULT_KEY)).toBeUndefined();
  });

  it("a condition together with a target short of the sunset stays lawful, and the target-based refusal at or past the sunset is unchanged", async () => {
    const s = await pending(at(140));
    // target 150 < sunset 200: the lawful before-sunset case, with the other owner's boundary at 140 resolving under it
    const ok = await must(
      s.coordinator.advance(
        stopAtBoundaryRequest("tx-bounded", {
          requested: {
            target: at(150),
            condition: {
              kind: "STOP_AFTER_BOUNDARY",
              object_id: OBJECT_ENGAGED,
              boundary_id: BOUNDARY_ID,
            },
          },
        }),
      ),
    );
    expect(ok.transaction.outcome.stop_reason).toBe("CONDITION_SATISFIED");
    expect(clock(s.store)).toEqual(at(140));
    expect(s.store.getFact(SYNTH_PRODUCER_RESULT_KEY)).toBeDefined();
    const head = s.store.head();
    expect(
      await codeOf(
        s.coordinator.advance(
          stopAtBoundaryRequest("tx-past", {
            requested: {
              target: at(300),
              condition: {
                kind: "STOP_AFTER_BOUNDARY",
                object_id: OBJECT_ENGAGED,
                boundary_id: BOUNDARY_ID,
              },
            },
          }),
        ),
      ),
    ).toBe("ENROLLMENT_PENDING");
    expect(s.store.head()).toEqual(head);
  });

  it("completing the original enrollment lets the SAME request run: the sunset expires first, the other owner's boundary resolves after it, and the retry is a pure replay", async () => {
    const s = await pending();
    expect(await codeOf(s.coordinator.advance(conditionOnly("tx-cond")))).toBe(
      "ENROLLMENT_PENDING",
    );

    // recovery: the same authorized intent completes the registration exactly once
    const done = await must(
      s.gip.establishSunsetInstrument({
        ...gipPublication(4),
        instrument: sunsetInstrument(INSTRUMENT, SUNSET),
      }),
    );
    expect([done.instrument.replayed, done.registration.replayed]).toEqual([true, false]);
    expect(s.store.getFact(temporalObjectKey("obj-gip-sunset-" + INSTRUMENT))).toBeDefined();

    const r = await must(s.coordinator.advance(conditionOnly("tx-cond")));
    expect(r.transaction.outcome.stop_reason).toBe("CONDITION_SATISFIED");
    expect(r.transaction.outcome.actual_stop).toEqual(OTHER_OWNER_BOUNDARY);
    // GIP's sunset (200) resolved on the way to the other owner's boundary (250), each by its own owner's stage
    expect(r.transaction.boundaries_crossed.map((b) => b.at.value).sort()).toEqual([200, 250]);
    expect(lifecycle(s.store)).toBe("expired");
    expect(s.store.getFact(gipInstrumentKey(INSTRUMENT))!.version).toBe(2);
    expect(s.store.getFact(SYNTH_PRODUCER_RESULT_KEY)).toBeDefined();
    expect(s.store.getFact(SYNTH_CONSUMER_RESULT_KEY)).toBeDefined();
    expect(clock(s.store)).toEqual(OTHER_OWNER_BOUNDARY);
    expect(s.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)!.version).toBe(1);

    // idempotence: re-presenting the committed transaction writes nothing
    const settled = s.store.head();
    const replay = await must(s.coordinator.advance(conditionOnly("tx-cond")));
    expect(replay.replayed).toBe(true);
    expect(s.store.head()).toEqual(settled);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the fixture supplies no desired result: before recovery the Instrument is active and no expiry exists anywhere, and the expiry appears only after the registered boundary is crossed", async () => {
    const s = await pending();
    expect(lifecycle(s.store)).toBe("active");
    expect(s.store.getFact(gipInstrumentKey(INSTRUMENT))!.version).toBe(1);
    await must(s.gip.completeSunsetEnrollment(gipPublication(40)));
    expect(lifecycle(s.store)).toBe("active");
    await must(s.coordinator.advance(conditionOnly("tx-cond")));
    expect(lifecycle(s.store)).toBe("expired");
  });
});
