/* eslint-disable @typescript-eslint/no-explicit-any -- tests read and tamper with raw facts */
// F-014B B1 S3 - the present-basis classifier over REAL committed campaigns (the existing test rigs drive the shipped owner operations over
// file-backed canonical campaigns): the finite read trace of the eight categories, the PC-chain matrix (stationary, transfer, movement, open
// collection, sealed lapse, released lapse, credited close, malformed records), the GIP and freight source classes, the fixed origin read, the
// category-5 partial witness and the closed verdict. MECHANISM ONLY, NON-WRITING: the authenticated GM binding does not exist, so every call
// uses the labelled test precondition, and no result here is a wait, an eligibility or a production permission.
//
// Non-tautology: expectations are written from the work order and from the rigs' own steps; every variant is a perturbation of a committed
// world (a record removed or replaced through an overlay) the classifier never receives as an expectation; the only positive is the synthetic
// test policy, and the production catalogue is shown to refuse the very same worlds.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  gipInstrumentKey,
  pcStandingLedgerHeadKey,
  pcStandingLedgerVersionKey,
  popPcOccupancyKey,
  pcMovementCommitmentKey,
  pcMovementRequestKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  worldPcLocusCustodyKey,
  type OwnerFact,
} from "@immortalis/contracts";
import { initializeCapturedChronology } from "@immortalis/engine";
import {
  catalogueCanonicalBytes,
  catalogueDigest,
  type GmWaitCatalogueManifest,
} from "../../packages/engine/src/gm-wait-catalogue.ts";
import { GM_WAIT_CATALOGUE_CURRENT_SHA256 } from "../../packages/engine/src/gm-wait-catalogue-current.ts";
import {
  S3_MAX_READS,
  classifyPresentBasis,
  makeSyntheticTestPolicy,
  testPreconditionAtPureOracleBoundary,
  witnessesStillCurrent,
  type FactSource,
  type PolicyInput,
  type PresentBasisRequest,
  type S3Result,
} from "../../packages/engine/src/gm-wait-present-reader.ts";
import { MANIFEST_DIR, REPO_ROOT } from "../../tools/gen-gm-wait-catalogue.ts";
import {
  FIXTURE_CAMPAIGN,
  PC,
  commitMove,
  commitRequestDispatchRegister,
  custodiedCampaign,
  requestMove,
  advanceToDelivery,
} from "../support/pc-movement.ts";
import { ACT_A, T0, TAU, collectionCampaign, confirmAndStart } from "../support/pc-collection.ts";
import { addLedger, advanceTo, holdAtBoundary, resident, settle } from "../support/pc-lapse.ts";
import { FIXTURE_LOCUS_ID, quarryWorksFixture } from "@immortalis/testkit";
import {
  seededPendingSunset,
  seededSunsetCampaign,
  sunsetInstrument,
  establishSunset,
  at as gipAt,
} from "../support/gip-sunset.ts";
import { FIXTURE_POLICY, harness, intakeRequest } from "../support/initial-setup.ts";
import { admitInput } from "../support/clock-origin.ts";
import { must } from "../support/temporal.ts";
import {
  admitService,
  admitServiceBasis,
  consumeUse,
  createFreightCampaign,
  dispatchFirst,
  enrollTransfer,
  foundationThroughFixation,
} from "../support/freight.ts";
import { tempDir } from "../support/tmp.ts";
import { originFact, tripwire } from "../support/b1-s3-facts.ts";

// ---- the policies ---------------------------------------------------------------------------------------------------------------
const dir = join(REPO_ROOT, MANIFEST_DIR);
const retained = new Map(
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.slice(0, -5), readFileSync(join(dir, f), "utf8")] as const),
);
const manifest = JSON.parse(
  retained.get(GM_WAIT_CATALOGUE_CURRENT_SHA256) as string,
) as GmWaitCatalogueManifest;
const authority = { current: GM_WAIT_CATALOGUE_CURRENT_SHA256, retained };
const production: PolicyInput = { kind: "PRODUCTION_CATALOGUE", manifest, authority };
const synthetic = makeSyntheticTestPolicy(
  "closed-test-policy-committed",
  { accept_complete_gip: true, accept_complete_freight: true, no_pc_known_time_commitments: true },
  authority,
);

// ---- an overlay: the committed world with some records replaced or removed (a perturbation of what is committed) ------------------
class Overlay implements FactSource {
  readonly asked: string[] = [];
  readonly inner: FactSource;
  readonly over = new Map<string, OwnerFact | null>();
  constructor(inner: FactSource) {
    this.inner = inner;
  }
  set(key: string, f: OwnerFact | null): this {
    this.over.set(key, f);
    return this;
  }
  getFact(key: string): OwnerFact | undefined {
    this.asked.push(key);
    if (this.over.has(key)) return this.over.get(key) ?? undefined;
    return this.inner.getFact(key);
  }
}
const junk = (key: string, of: OwnerFact): OwnerFact => ({
  ...of,
  key,
  value: { junk: true } as never,
});

interface World {
  readonly store: FactSource;
  readonly clock: () => { unit: string; value: number };
  readonly campaign: string;
}
const requestFor = (w: World, over: Partial<PresentBasisRequest> = {}): PresentBasisRequest => ({
  phase: "INITIAL",
  transaction_id: "tx-s3-fresh",
  from_transaction: null,
  observed_basis: w.clock(),
  catalogue_sha256: GM_WAIT_CATALOGUE_CURRENT_SHA256,
  ...over,
});
const classify = (
  w: World,
  src: FactSource = w.store,
  policy: PolicyInput = production,
  over: Partial<PresentBasisRequest> = {},
): S3Result =>
  classifyPresentBasis(
    testPreconditionAtPureOracleBoundary({ campaign_id: w.campaign, pc_id: PC }),
    requestFor(w, over),
    src,
    policy,
  );

const clockOf =
  (s: {
    coordinator: {
      state(): { value: { canonical_time: { unit: string; value: number } } } | undefined;
    };
  }) =>
  () =>
    (s.coordinator.state() as any).value.canonical_time;
const handoverWorld = (s: any): World => ({
  store: s.campaign.store,
  clock: clockOf(s),
  campaign: FIXTURE_CAMPAIGN,
});

describe("[S3] [mechanism only] a committed, handed-over PC: the finite read trace and the PC-chain matrix", () => {
  it("[S3] [mechanism only] a stationary PC classifies STATIONARY_SETTLED; the trace is the fixed, bounded read set; the production catalogue refuses and never grants", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      const t = tripwire(w.store, (k) => k === "temporal/boundary-index");
      const r = classifyPresentBasis(
        testPreconditionAtPureOracleBoundary({ campaign_id: w.campaign, pc_id: PC }),
        requestFor(w),
        t.source,
        production,
      );
      expect(r.basis.pc).toEqual({ cls: "COMPLETE", state: "STATIONARY_SETTLED" });
      expect(r.basis.identity).toEqual({ cls: "VALID_ABSENT", state: "NONE" });
      expect(r.basis.clock).toMatchObject({
        cls: "COMPLETE",
        state: "VALID",
        held: false,
        basis_matches: true,
      });
      expect(r.basis.catalogue).toMatchObject({
        mode: "PRODUCTION",
        digest: "OK_CURRENT",
        disposition: "UNDECLARED",
        epistemic: "ACTIONABLE_OR_UNSAFE",
      });
      // the finite trace: categories 1, 2, 3, 5, 6, 7 and 8 each read, category 4 reads nothing, every key addressed
      const cats = new Set(r.witnesses.map((x) => x.category));
      expect(cats).toEqual(new Set([1, 2, 3, 5, 6, 7, 8]));
      expect(r.witnesses.length).toBeLessThanOrEqual(S3_MAX_READS);
      expect(t.calls).toEqual(r.witnesses.map((x) => x.key));
      expect(new Set(t.calls).size).toBe(t.calls.length);
      // each category-3 record is either a positive witness or a version-0 absence witness
      for (const x of r.witnesses.filter((y) => y.category === 3))
        expect(x.version === 0 || x.version >= 1, x.key).toBe(true);
      expect(
        r.witnesses.find((x) => x.key === PLAYER_CHARACTER_BINDING_KEY)?.version,
      ).toBeGreaterThanOrEqual(1);
      expect(
        r.witnesses.find((x) => x.key === worldPcLocusCustodyKey(PC))?.version,
      ).toBeGreaterThanOrEqual(1);
      // the verdict is not a permission: no origin witness exists in this world, and the catalogue grants nothing
      expect(["REFUSE", "UNKNOWN"]).toContain(r.verdict.kind);
      expect(r.verdict.kind).not.toBe("SYNTHETIC_TEST_POLICY_POSITIVE");
      expect(r.basis.authentication).toBe("NOT_PROVEN_TEST_PRECONDITION");
    } finally {
      await s.campaign.close();
    }
  });

  it("[S3] [mechanism only] the synthetic test policy is the only positive: the same stationary world with a qualified origin witness added is a positive control, and the production catalogue still refuses it", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      const unit = w.clock().unit;
      const withOrigin = new Overlay(w.store).set(
        TEMPORAL_ORIGIN_KEY,
        originFact({ campaign: w.campaign, unit }),
      );
      const pos = classify(w, withOrigin, synthetic);
      expect(pos.verdict).toEqual({
        kind: "SYNTHETIC_TEST_POLICY_POSITIVE",
        closed_policy_id: "closed-test-policy-committed",
      });
      expect(pos.basis.origin).toEqual({ cls: "COMPLETE", evidence: { violation: null } });
      const prod = classify(w, withOrigin, production);
      expect(prod.verdict.kind).not.toBe("SYNTHETIC_TEST_POLICY_POSITIVE");
      expect(["REFUSE", "UNKNOWN"]).toContain(prod.verdict.kind);
      // without a qualified origin the synthetic policy refuses too: the origin is a real gate, not decoration
      expect(classify(w, w.store, synthetic).verdict).toEqual({
        kind: "REFUSE",
        reason: "ORIGIN_NOT_QUALIFIED",
      });
      // without the fixture premise the synthetic policy is UNKNOWN, not positive
      const noPremise = makeSyntheticTestPolicy("closed-test-policy-nopremise", {
        accept_complete_gip: true,
        accept_complete_freight: true,
        no_pc_known_time_commitments: false,
      });
      expect(classify(w, withOrigin, noPremise).verdict).toEqual({
        kind: "UNKNOWN",
        reason: "PC_KNOWN_COMMITMENTS_UNESTABLISHED",
      });
    } finally {
      await s.campaign.close();
    }
  });

  it("[S3] [mechanism only] a request whose observed basis is stale, or whose digest is not the current retained manifest, is denied before any permission could arise", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      const unit = w.clock().unit;
      const withOrigin = new Overlay(w.store).set(
        TEMPORAL_ORIGIN_KEY,
        originFact({ campaign: w.campaign, unit }),
      );
      expect(
        classify(w, withOrigin, synthetic, { observed_basis: { unit, value: w.clock().value - 1 } })
          .verdict,
      ).toEqual({ kind: "REFUSE", reason: "BASIS_STALE" });
      expect(
        classify(w, withOrigin, production, { catalogue_sha256: "0".repeat(64) }).verdict,
      ).toEqual({ kind: "REFUSE", reason: "CATALOGUE_DIGEST_NOT_ACCEPTED" });
    } finally {
      await s.campaign.close();
    }
  });

  it("[S3] [mechanism only] an unsettled voluntary movement is told from a stationary PC at each step: commitment only, request, dispatched and registered transfer", async () => {
    const s = await custodiedCampaign();
    try {
      const w = handoverWorld(s);
      expect(classify(w).basis.pc.state).toBe("STATIONARY_SETTLED");
      await must(commitMove(s, 1));
      const a = classify(w);
      expect(a.basis.pc.state).toBe("MOVEMENT_RECORDS_PRESENT");
      expect(a.verdict).toEqual({ kind: "REFUSE", reason: "PC_MOVEMENT_ENGAGED" });
      expect(
        a.witnesses.find((x) => x.key === pcMovementCommitmentKey(PC))?.version,
      ).toBeGreaterThanOrEqual(1);
      await must(requestMove(s, 2));
      expect(classify(w).basis.pc.state).toBe("MOVEMENT_RECORDS_PRESENT");
      expect(
        classify(w).witnesses.find((x) => x.key === pcMovementRequestKey(PC))?.version,
      ).toBeGreaterThanOrEqual(1);
    } finally {
      await s.campaign.close();
    }
  });

  it("[S3] [mechanism only] a PC in transfer is IN_TRANSFER; after the earned delivery its destination is committed and it is not a settled stationary PC", async () => {
    const s = await custodiedCampaign();
    try {
      const w = handoverWorld(s);
      await commitRequestDispatchRegister(s);
      const inTransfer = classify(w);
      expect(inTransfer.basis.pc.state).toBe("IN_TRANSFER");
      expect(inTransfer.verdict).toEqual({ kind: "REFUSE", reason: "PC_NOT_STATIONARY" });
      await must(advanceToDelivery(s));
      const after = classify(w, w.store, production, { observed_basis: w.clock() });
      expect(["DESTINATION_COMMITTED", "RETIREMENT_PENDING", "MOVEMENT_RECORDS_PRESENT"]).toContain(
        after.basis.pc.state,
      );
      expect(after.basis.pc.state).not.toBe("STATIONARY_SETTLED");
    } finally {
      await s.campaign.close();
    }
  });
});

describe("[S3] [mechanism only] collection engagement: open, sealed lapse, released lapse, credited close", () => {
  it("[S3] [mechanism only] an open collection engages the PC; a premise lost mid-work held at its boundary still engages it; the released lapse frees it but a held remainder refuses a fresh INITIAL", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      expect(classify(w).basis.pc.state).toBe("STATIONARY_SETTLED");
      await confirmAndStart(s, ACT_A, 3);
      const open = classify(w);
      expect(open.basis.pc.state).toBe("COLLECTION_ENGAGED");
      expect(open.verdict).toEqual({ kind: "REFUSE", reason: "PC_COLLECTION_ENGAGED" });
      expect(
        open.witnesses.find((x) => x.key === popPcOccupancyKey(PC))?.version,
      ).toBeGreaterThanOrEqual(1);
      await advanceTo(s, T0.value + 4, "tx-pre");
      await addLedger(s, "ledger-arrivals", [resident("unit-arrival", FIXTURE_LOCUS_ID)], 953);
      await holdAtBoundary(s, T0.value + 4 * TAU, "tx-cross");
      // the lapse is detectable but not yet sealed and released: still engaged; and the kernel holds a remainder
      const held = classify(w);
      expect(held.basis.pc.state).toBe("COLLECTION_ENGAGED");
      expect(held.basis.clock.held).toBe(true);
      await settle(s);
      const released = classify(w);
      expect(released.basis.pc.state).toBe("STATIONARY_SETTLED");
      expect(released.verdict).toEqual({ kind: "REFUSE", reason: "HELD_REMAINDER_EXISTS" });
    } finally {
      await s.campaign.close();
    }
  });

  it("[S3] [mechanism only] a collection that completed (the Reserve inflow credited) no longer engages the PC", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      await confirmAndStart(s, ACT_A, 3);
      expect(classify(w).basis.pc.state).toBe("COLLECTION_ENGAGED");
      const done = await advanceTo(s, T0.value + 3 * TAU, "tx-complete");
      expect(done).toMatchObject({ ok: true });
      expect(classify(w).basis.pc.state).toBe("STATIONARY_SETTLED");
    } finally {
      await s.campaign.close();
    }
  });
});

describe("[S3] [mechanism only] malformed records are INVALID where the legacy readers see absence or a throw", () => {
  it("[S3] [mechanism only] a malformed occupancy, custody, binding, movement record or clock is a refusal of its own kind and never reads as an absent record", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      const get = (k: string) => w.store.getFact(k) as OwnerFact;
      const cases: [string, string, string][] = [
        ["occupancy", popPcOccupancyKey(PC), "PC_SOURCE_INVALID"],
        ["custody", worldPcLocusCustodyKey(PC), "PC_SOURCE_INVALID"],
        ["binding", PLAYER_CHARACTER_BINDING_KEY, "PC_SOURCE_INVALID"],
        ["movement request", pcMovementRequestKey(PC), "PC_SOURCE_INVALID"],
        ["movement commitment", pcMovementCommitmentKey(PC), "PC_SOURCE_INVALID"],
      ];
      for (const [name, key, reason] of cases) {
        const present = w.store.getFact(key);
        const base = present ?? ({ ...get(PLAYER_CHARACTER_BINDING_KEY), key } as OwnerFact);
        const over = new Overlay(w.store).set(key, junk(key, base));
        const r = classify(w, over);
        expect(r.basis.pc.cls, name).toBe("INVALID");
        expect(r.verdict, name).toEqual({ kind: "REFUSE", reason });
      }
      const badClock = new Overlay(w.store).set(
        TEMPORAL_STATE_KEY,
        junk(TEMPORAL_STATE_KEY, get(TEMPORAL_STATE_KEY)),
      );
      expect(classify(w, badClock).verdict).toEqual({
        kind: "REFUSE",
        reason: "TIME_STATE_INVALID",
      });
    } finally {
      await s.campaign.close();
    }
  });
});

describe("[S3] [mechanism only] category 5 (PROVISIONAL): the ledger is at most a partial candidate witness", () => {
  it("[S3] [mechanism only] no ledger is UNKNOWN; a ledger without a catalogue-named access class is UNKNOWN; the proven ledger is PARTIAL_WITNESS only; none of them is ever a positive under the production catalogue", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      // this handed-over PC's binding was committed under the S-4 citation, so its ledger head and sequence-1 version already exist; an absent
      // ledger is shown by removing the head through an overlay, and is UNKNOWN (never VALID_ABSENT: an absent carrier says nothing about intentions)
      const headKey = pcStandingLedgerHeadKey(PC);
      const versionKey = pcStandingLedgerVersionKey(PC, 1);
      expect(w.store.getFact(headKey)).toBeDefined();
      expect(w.store.getFact(versionKey)).toBeDefined();
      const none = classify(w, new Overlay(w.store).set(headKey, null).set(versionKey, null));
      expect(none.basis.commitments.cls).toBe("UNKNOWN");
      expect(none.basis.commitments.proof).toEqual({
        EXACT_OPERATIVE_PC_IDENTITY: "UNPROVEN",
        CURRENT_SOURCE_PERMISSION_VISIBILITY: "UNPROVEN",
        GOVERNING_POLICY: "UNPROVEN",
      });
      // a half-present ledger (a head without its version, or a version without its head) is corrupt, not absent
      expect(classify(w, new Overlay(w.store).set(headKey, null)).basis.commitments.cls).toBe(
        "INVALID",
      );
      expect(classify(w, new Overlay(w.store).set(versionKey, null)).basis.commitments.cls).toBe(
        "INVALID",
      );
      const present = classify(w);
      // identity and governing policy are proven by what is read; the registered catalogue names no access class for this carrier
      expect(present.basis.commitments.proof).toEqual({
        EXACT_OPERATIVE_PC_IDENTITY: "PROVEN",
        CURRENT_SOURCE_PERMISSION_VISIBILITY: "UNPROVEN",
        GOVERNING_POLICY: "PROVEN",
      });
      expect(present.basis.commitments.cls).toBe("UNKNOWN");
      expect(present.trace.proofs.map((p) => `${p.requirement}:${p.status}`)).toEqual([
        "EXACT_OPERATIVE_PC_IDENTITY:PROVEN",
        "CURRENT_SOURCE_PERMISSION_VISIBILITY:UNPROVEN",
        "GOVERNING_POLICY:PROVEN",
      ]);
      // a catalogue that DOES name the carrier's access class proves the visibility: then, and only then, a partial witness
      const headFact = w.store.getFact(`pc/${PC}/standing-instruction-ledger/head`) as OwnerFact;
      const named: GmWaitCatalogueManifest = structuredClone(manifest);
      named.policy.audience_projection.access_classes = [
        ...named.policy.audience_projection.access_classes,
        headFact.secrecy,
      ].sort();
      const namedPolicy: PolicyInput = {
        kind: "PRODUCTION_CATALOGUE",
        manifest: named,
        authority: {
          current: catalogueDigest(named),
          retained: new Map([[catalogueDigest(named), catalogueCanonicalBytes(named)]]),
        },
      };
      const partial = classify(w, w.store, namedPolicy, {
        catalogue_sha256: catalogueDigest(named),
      });
      expect(partial.basis.commitments.cls).toBe("PARTIAL_WITNESS");
      expect(Object.values(partial.basis.commitments.proof)).toEqual([
        "PROVEN",
        "PROVEN",
        "PROVEN",
      ]);
      // never complete, and never a positive
      expect(partial.verdict.kind).not.toBe("SYNTHETIC_TEST_POLICY_POSITIVE");
      expect(partial.verdict).toEqual({ kind: "REFUSE", reason: "ORIGIN_NOT_QUALIFIED" });
      const withOrigin = new Overlay(w.store).set(
        TEMPORAL_ORIGIN_KEY,
        originFact({ campaign: w.campaign, unit: w.clock().unit }),
      );
      const partialOrigin = classify(w, withOrigin, namedPolicy, {
        catalogue_sha256: catalogueDigest(named),
      });
      expect(partialOrigin.basis.commitments.cls).toBe("PARTIAL_WITNESS");
      expect(partialOrigin.verdict).toEqual({ kind: "REFUSE", reason: "CATALOGUE_UNDECLARED" });
      // the synthetic policy still needs its explicit fixture premise: a partial witness never answers the commitments question
      const noPremise = makeSyntheticTestPolicy("closed-test-policy-nopremise-2", {
        accept_complete_gip: true,
        accept_complete_freight: true,
        no_pc_known_time_commitments: false,
      });
      expect(classify(w, withOrigin, noPremise).verdict).toEqual({
        kind: "UNKNOWN",
        reason: "PC_KNOWN_COMMITMENTS_UNESTABLISHED",
      });
    } finally {
      await s.campaign.close();
    }
  });
});

const clockFrom = (store: FactSource) => () =>
  (store.getFact(TEMPORAL_STATE_KEY) as any).value.canonical_time;
const worldOf = (store: FactSource, campaign: string): World => ({
  store,
  clock: clockFrom(store),
  campaign,
});
const sig = (r: S3Result): string[] => r.witnesses.map((x) => `${x.key}@${x.version}`);

describe("[S3] [mechanism only] GIP: pending, complete, invalid, and a hidden-future twin over real campaigns", () => {
  it("[S3] [mechanism only] a receipt whose Temporal object is not yet registered is PENDING; once registered it is COMPLETE; a corrupt Instrument is INVALID", async () => {
    const pending = await seededPendingSunset(tempDir("gm-wait-gip-p-"));
    const done = await seededSunsetCampaign(tempDir("gm-wait-gip-d-"));
    try {
      await establishSunset(done);
      const wp = worldOf(pending.campaign.store, pending.campaign.store.head().campaign_id);
      const wd = worldOf(done.campaign.store, done.campaign.store.head().campaign_id);
      const rp = classify(wp);
      expect(rp.basis.gip.cls).toBe("PENDING");
      expect(rp.witnesses.filter((x) => x.category === 6).length).toBe(3);
      expect(
        rp.witnesses
          .filter((x) => x.category === 6)
          .map((x) => x.version)
          .sort(),
      ).toEqual([0, 1, 1]);
      expect(classify(wd).basis.gip.cls).toBe("COMPLETE");
      const id = sunsetInstrument().instrument_id;
      const key = gipInstrumentKey(id);
      const bad = new Overlay(wp.store).set(key, junk(key, wp.store.getFact(key) as OwnerFact));
      expect(classify(wp, bad).basis.gip.cls).toBe("INVALID");
      const gone = new Overlay(wp.store).set(key, null);
      expect(classify(wp, gone).basis.gip.cls).toBe("INVALID");
      // a pending enrollment is one normalized present-class result, a refusal of its own kind and not a permission
      expect(["PENDING", "REFUSE"]).toContain(classify(wp).verdict.kind);
    } finally {
      await pending.campaign.close();
      await done.campaign.close();
    }
  });

  it("[S3] [mechanism only] twin campaigns that differ only in the hidden sunset instant read the same keys, give the same classes and the same verdict", async () => {
    const a = await seededPendingSunset(
      tempDir("gm-wait-gip-a-"),
      sunsetInstrument(undefined, gipAt(200)),
    );
    const b = await seededPendingSunset(
      tempDir("gm-wait-gip-b-"),
      sunsetInstrument(undefined, gipAt(900_000)),
    );
    try {
      const wa = worldOf(a.campaign.store, a.campaign.store.head().campaign_id);
      const wb = worldOf(b.campaign.store, b.campaign.store.head().campaign_id);
      const ra = classify(wa);
      const rb = classify(wb);
      expect(sig(rb)).toEqual(sig(ra));
      expect({ ...rb.basis, catalogue: null }).toEqual({ ...ra.basis, catalogue: null });
      expect(rb.verdict).toEqual(ra.verdict);
      expect(JSON.stringify(ra.basis)).not.toMatch(/900000/);
      // varying the requested horizon, which the request type does not carry, changes nothing either (the observed basis is the only input)
      for (const w of [wa, wb]) expect(sig(classify(w))).toEqual(sig(ra));
    } finally {
      await a.campaign.close();
      await b.campaign.close();
    }
  });
});

describe("[S3] [mechanism only] freight: the first-profile dispatch enrollment, its original E1 and TE, over a real campaign", () => {
  it("[S3] [mechanism only] a dispatch whose E1 and TE are absent is PENDING; with E1 only it is still PENDING; with both it is COMPLETE; the pending class is one normalized class", async () => {
    const f = await createFreightCampaign(tempDir("gm-wait-fr-"), quarryWorksFixture());
    try {
      const w: World = {
        store: f.campaign.store,
        clock: () => (f.coordinator.state() as any).value.canonical_time,
        campaign: f.fx.campaignId,
      };
      const requestRef = await foundationThroughFixation(f);
      expect(classify(w).basis.freight.cls).toBe("VALID_ABSENT");
      await admitServiceBasis(f);
      await admitService(f, requestRef);
      await dispatchFirst(f, requestRef);
      const none = classify(w);
      expect(none.basis.freight.cls).toBe("PENDING");
      expect(none.basis.freight.evidence).toMatchObject({ missing: ["E1", "TE"] });
      await consumeUse(f, requestRef);
      const e1 = classify(w);
      expect(e1.basis.freight.cls).toBe("PENDING");
      expect(e1.basis.freight.evidence).toMatchObject({ missing: ["TE"] });
      await enrollTransfer(f);
      const all = classify(w);
      expect(all.basis.freight.cls).toBe("COMPLETE");
      expect(all.witnesses.filter((x) => x.category === 7).every((x) => x.version >= 1)).toBe(true);
      // the same verdict kind for both pending stages
      expect(none.verdict).toEqual(e1.verdict);
      // a corrupt original E1 is INVALID, not pending
      const e1key = all.witnesses.find((x) => x.template === "freight.e1")?.key as string;
      const bad = new Overlay(w.store).set(e1key, junk(e1key, w.store.getFact(e1key) as OwnerFact));
      expect(classify(w, bad).basis.freight.cls).toBe("INVALID");
    } finally {
      await f.campaign.close();
    }
  });
});

describe("[S3] [mechanism only] the fixed origin read, over real captured-chronology campaigns", () => {
  it("[S3] [mechanism only] a v2 captured origin reads COMPLETE exactly once on a fresh INITIAL and never on a CONTINUATION; a v1 origin has no witness and is not qualified", async () => {
    const h2 = await harness();
    const h1 = await harness();
    try {
      const admitted = await admitInput(h2);
      expect(admitted.ok).toBe(true);
      expect((await h2.service.advance(admitted.setup_id)).status).toBe("COMPLETED");
      await must(initializeCapturedChronology(h2.store, { policy: FIXTURE_POLICY }));
      const intake = await h1.service.intake(await intakeRequest(h1));
      expect(intake.status).toBe("ADMITTED");
      expect((await h1.service.advance(intake.setup_id!)).status).toBe("COMPLETED");
      await must(initializeCapturedChronology(h1.store, { policy: FIXTURE_POLICY }));

      const w2 = worldOf(h2.store, h2.campaignId);
      const w1 = worldOf(h1.store, h1.campaignId);
      const r2 = classify(w2);
      expect(r2.basis.origin).toEqual({ cls: "COMPLETE", evidence: { violation: null } });
      expect(r2.witnesses.filter((x) => x.key === TEMPORAL_ORIGIN_KEY)).toHaveLength(1);
      expect(
        r2.witnesses.find((x) => x.key === TEMPORAL_ORIGIN_KEY)?.version,
      ).toBeGreaterThanOrEqual(1);
      const r1 = classify(w1);
      expect(r1.basis.origin).toEqual({ cls: "VALID_ABSENT", evidence: null });
      expect(r1.witnesses.find((x) => x.key === TEMPORAL_ORIGIN_KEY)?.version).toBe(0);
      // a wrong campaign identity at the boundary is the predicate's own refusal
      const wrong = classifyPresentBasis(
        testPreconditionAtPureOracleBoundary({ campaign_id: "another-campaign", pc_id: PC }),
        requestFor(w2),
        w2.store,
        production,
      );
      expect(wrong.basis.origin).toEqual({
        cls: "INVALID",
        evidence: { violation: "ORIGIN_CAMPAIGN" },
      });
      // a CONTINUATION never asks for the witness (nor does the call reach it when the held transaction is absent)
      const cont = classify(w2, w2.store, production, {
        phase: "CONTINUATION",
        from_transaction: "tx-held",
        observed_basis: null,
      });
      expect(cont.witnesses.some((x) => x.key === TEMPORAL_ORIGIN_KEY)).toBe(false);
      expect(cont.basis.origin).toBe("NOT_READ_BY_RULE");
      // and no Input, Completion or chronology record is read by either call
      for (const r of [r1, r2, cont])
        expect(
          r.witnesses.some((x) => /initial-setup|completion|chronology|input/i.test(x.key)),
        ).toBe(false);
      // a stale or inserted zero key is caught by the witnesses
      const moved = witnessesStillCurrent(
        new Overlay(w1.store).set(TEMPORAL_ORIGIN_KEY, originFact({ campaign: h1.campaignId })),
        r1.witnesses,
      );
      expect(moved.map((x) => x.key)).toEqual([TEMPORAL_ORIGIN_KEY]);
    } finally {
      await h2.campaign.close();
      await h1.campaign.close();
    }
  });
});

describe("[S3] [mechanism only] identity first: a sealed result, an open authority, a foreign PC, and movement records told apart one at a time", () => {
  it("[S3] [mechanism only] a sealed transaction is EXISTING_RESULT and nothing else is read; with the transaction record removed and its authority kept the call is PENDING custody", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      await confirmAndStart(s, ACT_A, 3);
      const done = await advanceTo(s, T0.value + 3 * TAU, "tx-complete");
      expect(done).toMatchObject({ ok: true });
      const txKey = temporalTransactionKey("tx-complete");
      const authKey = temporalTransactionAuthorityKey("tx-complete");
      expect(w.store.getFact(txKey)).toBeDefined();
      expect(w.store.getFact(authKey)).toBeDefined();
      const sealed = classify(w, w.store, production, { transaction_id: "tx-complete" });
      expect(sealed.verdict).toEqual({ kind: "EXISTING_RESULT" });
      expect(sealed.basis.identity).toEqual({ cls: "COMPLETE", state: "EXISTING_SEALED" });
      // an exact existing result decides the call by itself: no clock, PC, GIP, freight or origin record is read
      expect(sealed.witnesses.every((x) => x.category === 1)).toBe(true);
      expect(sealed.witnesses.some((x) => x.key === TEMPORAL_ORIGIN_KEY)).toBe(false);
      const open = new Overlay(w.store).set(txKey, null);
      const pending = classify(w, open, production, { transaction_id: "tx-complete" });
      expect(pending.basis.identity).toEqual({ cls: "PENDING", state: "OPEN_UNSEALED" });
      expect(pending.verdict).toEqual({ kind: "PENDING", reason: "CUSTODY_OPEN_UNSEALED" });
      expect(pending.witnesses.every((x) => x.category === 1)).toBe(true);
      // a corrupt transaction record is a refusal of its own kind and never an absent record
      const corrupt = new Overlay(w.store).set(
        txKey,
        junk(txKey, w.store.getFact(txKey) as OwnerFact),
      );
      expect(classify(w, corrupt, production, { transaction_id: "tx-complete" }).verdict).toEqual({
        kind: "REFUSE",
        reason: "IDENTITY_SOURCE_INVALID",
      });
    } finally {
      await s.campaign.close();
    }
  });

  it("[S3] [mechanism only] a binding that couples another PC is PC_MISMATCH, not a stationary PC and not an absent one", async () => {
    const s = await collectionCampaign();
    try {
      const w = handoverWorld(s);
      const binding = w.store.getFact(PLAYER_CHARACTER_BINDING_KEY) as any;
      const foreign = {
        ...binding,
        value: {
          ...binding.value,
          active_pc: { ...binding.value.active_pc, entity_id: "pc-someone-else" },
        },
      } as OwnerFact;
      const r = classify(w, new Overlay(w.store).set(PLAYER_CHARACTER_BINDING_KEY, foreign));
      expect(r.basis.pc).toEqual({ cls: "COMPLETE", state: "PC_MISMATCH" });
      expect(r.verdict).toEqual({ kind: "REFUSE", reason: "PC_MISMATCH" });
      // and no binding at all is a distinct, valid absence
      const none = classify(w, new Overlay(w.store).set(PLAYER_CHARACTER_BINDING_KEY, null));
      expect(none.basis.pc).toEqual({ cls: "VALID_ABSENT", state: "NO_OPERATIVE_PC" });
    } finally {
      await s.campaign.close();
    }
  });

  it("[S3] [mechanism only] each movement record alone engages the PC (a registered object, a request, a commitment or a transfer): the records are read independently, and with none the PC is stationary", async () => {
    const s = await custodiedCampaign();
    try {
      const w = handoverWorld(s);
      await commitRequestDispatchRegister(s);
      const full = classify(w);
      expect(full.basis.pc.state).toBe("IN_TRANSFER");
      const keyOf = (template: string): string => {
        const hit = full.witnesses.find((x) => x.template === template);
        expect(hit, template).toBeDefined();
        return (hit as { key: string }).key;
      };
      const chain = [
        "pc.transfer",
        "pc.commitment",
        "pc.move_commitment",
        "pc.move_request",
        "pc.move_object",
      ] as const;
      const present = chain.filter((t) => w.store.getFact(keyOf(t)) !== undefined);
      // the committed world holds the registered object, the request and the transfer at least
      expect(present).toEqual(
        expect.arrayContaining(["pc.move_object", "pc.move_request", "pc.transfer"]),
      );
      for (const keep of present.filter((t) => t !== "pc.transfer")) {
        const o = new Overlay(w.store);
        for (const t of chain) if (t !== keep) o.set(keyOf(t), null);
        const r = classify(w, o);
        expect(r.basis.pc.state, `only ${keep}`).toBe("MOVEMENT_RECORDS_PRESENT");
        expect(r.verdict, `only ${keep}`).toEqual({
          kind: "REFUSE",
          reason: "PC_MOVEMENT_ENGAGED",
        });
      }
      const none = new Overlay(w.store);
      for (const t of chain) none.set(keyOf(t), null);
      expect(classify(w, none).basis.pc.state).toBe("STATIONARY_SETTLED");
    } finally {
      await s.campaign.close();
    }
  });
});
