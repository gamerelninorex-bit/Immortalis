// F-014B B1 S3 - the pure, AS-OF-NOW present-basis classifier and its spyable read oracle: the closed key-template table, the four source classes,
// version-0 absence witnesses, the eight categories' fixed keys, hidden-future twins, forbidden reads and the closed verdict. MECHANISM ONLY,
// NON-WRITING, UNWIRED: the authenticated GM binding does not exist, so every result carries the labelled test precondition, and no verdict here
// is a wait, an eligibility or a production permission.
//
// The PC-chain matrix (stationary, transfer, movement, collection, lapse, malformed) and the real committed-campaign traces are in
// tests/integration/gm-wait-present-s3-committed.test.ts; this file uses hand-built sources and needs no campaign.
//
// Non-tautology: expected classes and key lists are written here from the work order and the Codex census, never taken from the helper; every
// negative is a source the test builds; the legacy contrast calls the legacy predicates that collapse malformed input and shows the difference.
import { describe, expect, it } from "vitest";
import {
  GIP_SUNSET_ENROLLMENT_KEY,
  LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY,
  PLAYER_CHARACTER_BINDING_KEY,
  TEMPORAL_BOUNDARY_INDEX_KEY,
  TEMPORAL_ORIGIN_KEY,
  TEMPORAL_STATE_KEY,
  gipInstrumentKey,
  gipSunsetObjectId,
  logisticsObjectId,
  popPcOccupancyKey,
  temporalObjectKey,
  temporalTransactionAuthorityKey,
  temporalTransactionKey,
  worldPcLocusCustodyKey,
  economyFreightUseConsumptionKey,
  pcStandingLedgerHeadKey,
} from "@immortalis/contracts";
import {
  gipEnrollmentPendingViolation,
  pendingSunsetEnrollment,
} from "../../packages/engine/src/gip/declaration.ts";
import {
  freightDispatchPendingViolation,
  pendingDispatchEnrollment,
} from "../../packages/engine/src/freight/dispatch-fence.ts";
import { pcOccupancyState } from "../../packages/engine/src/pc-collection/state.ts";
import { parseGmWaitRequest } from "../../packages/contracts/src/temporal-gm-wait.ts";
import { catalogueDigest } from "../../packages/engine/src/gm-wait-catalogue.ts";
import {
  CAT5_REQUIREMENTS,
  PresentReadOracle,
  S3_KEY_TEMPLATES,
  S3_MAX_READS,
  classifyPresentBasis,
  makeSyntheticTestPolicy,
  testPreconditionAtPureOracleBoundary,
  witnessesStillCurrent,
  type PolicyInput,
  type PresentBasisRequest,
  type S3Result,
} from "../../packages/engine/src/gm-wait-present-reader.ts";
import { miniManifest } from "../support/b1-s2s3-fixtures.ts";
import {
  CAMPAIGN,
  MapSource,
  PC,
  TX,
  at,
  fact,
  freightReceiptFact,
  gipReceiptFact,
  ledgerHeadFact,
  ledgerVersionFact,
  originFact,
  sha,
  stateFact,
  tripwire,
} from "../support/b1-s3-facts.ts";

const pre = testPreconditionAtPureOracleBoundary({ campaign_id: CAMPAIGN, pc_id: PC });
const manifest = miniManifest();
const digest = catalogueDigest(manifest);
const production = (): PolicyInput => ({
  kind: "PRODUCTION_CATALOGUE",
  manifest,
  authority: { current: digest, retained: new Map([[digest, JSON.stringify("x")]]) },
});
// the retained bytes above are not the manifest's, so the digest check is MANIFEST_BYTES_MISMATCH: the next authority carries the real bytes
import { catalogueCanonicalBytes } from "../../packages/engine/src/gm-wait-catalogue.ts";
const productionOk = (): PolicyInput => ({
  kind: "PRODUCTION_CATALOGUE",
  manifest,
  authority: { current: digest, retained: new Map([[digest, catalogueCanonicalBytes(manifest)]]) },
});
const initial = (over: Partial<PresentBasisRequest> = {}): PresentBasisRequest => ({
  phase: "INITIAL",
  transaction_id: TX,
  from_transaction: null,
  observed_basis: at(100),
  catalogue_sha256: digest,
  ...over,
});
const synthetic = makeSyntheticTestPolicy("closed-test-policy-1", {
  accept_complete_gip: true,
  accept_complete_freight: true,
  no_pc_known_time_commitments: true,
});
const run = (src: MapSource, req = initial(), policy: PolicyInput = productionOk()): S3Result =>
  classifyPresentBasis(pre, req, src, policy);
const keysRead = (r: S3Result): string[] => r.trace.reads.map((w) => w.key);

describe("[S3] [mechanism only] the closed key-template table and the oracle", () => {
  it("[S3] [mechanism only] the table names exactly the templates BLUE's eight categories need, once each, and category 5 is one provisional row", () => {
    expect(S3_KEY_TEMPLATES.map((t) => `${t.category}:${t.id}`)).toEqual([
      "1:identity.tx",
      "1:identity.tx_authority",
      "1:identity.from_tx",
      "2:clock.state",
      "3:pc.binding",
      "3:pc.custody",
      "3:pc.rival_entity",
      "3:pc.transition",
      "3:pc.transfer",
      "3:pc.commitment",
      "3:pc.move_commitment",
      "3:pc.move_request",
      "3:pc.move_object",
      "3:pc.occupancy",
      "3:pc.extraction",
      "3:pc.reserve",
      "5:commitments.ledger",
      "6:gip.receipt",
      "6:gip.instrument",
      "6:gip.object",
      "7:freight.receipt",
      "7:freight.e1",
      "7:freight.te",
      "8:origin.witness",
    ]);
    expect(new Set(S3_KEY_TEMPLATES.map((t) => t.id)).size).toBe(S3_KEY_TEMPLATES.length);
    expect(new Set(S3_KEY_TEMPLATES.map((t) => t.category))).toEqual(
      new Set([1, 2, 3, 5, 6, 7, 8]),
    );
    expect(S3_KEY_TEMPLATES.filter((t) => t.category === 5)).toHaveLength(1);
    expect(S3_KEY_TEMPLATES.filter((t) => t.provisional).map((t) => t.id)).toEqual([
      "commitments.ledger",
    ]);
    expect(S3_MAX_READS).toBe(25);
  });

  const ctx = { campaign_id: CAMPAIGN, pc_id: PC, transaction_id: TX, from_transaction: null };

  it("[S3] [mechanism only] a key that depends on an earlier read cannot be asked for without it, an unknown template is refused, and the refusals are traced", () => {
    const o = new PresentReadOracle(new MapSource(), ctx);
    expect(o.read("gip.instrument")).toBeNull();
    expect(o.read("freight.e1")).toBeNull();
    expect(o.read("pc.rival_entity")).toBeNull();
    expect(o.read("pc.extraction")).toBeNull();
    expect(o.read("no.such.template")).toBeNull();
    expect(o.read("identity.from_tx")).toBeNull();
    expect(o.trace().refused_reads).toEqual([
      "gip.instrument",
      "freight.e1",
      "pc.rival_entity",
      "pc.extraction",
      "no.such.template",
      "identity.from_tx",
    ]);
    expect(o.trace().reads).toEqual([]);
  });

  it("[S3] [mechanism only] a receipt names its own object and instrument: the derived keys are those the receipt's value gives, nothing else", () => {
    const src = new MapSource([gipReceiptFact("inst-77"), freightReceiptFact()]);
    const o = new PresentReadOracle(src, ctx);
    expect(o.read("gip.receipt")?.[0]?.tag).toBe("PRESENT");
    o.read("gip.instrument");
    o.read("gip.object");
    o.read("freight.receipt");
    o.read("freight.e1");
    o.read("freight.te");
    expect(o.trace().reads.map((r) => r.key)).toEqual([
      GIP_SUNSET_ENROLLMENT_KEY,
      gipInstrumentKey("inst-77"),
      temporalObjectKey(gipSunsetObjectId("inst-77")),
      LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY,
      economyFreightUseConsumptionKey("use-1"),
      temporalObjectKey(logisticsObjectId("req-1")),
    ]);
  });

  it("[S3] [mechanism only] the read cap is enforced: a read that would exceed it is refused, not performed", () => {
    const o = new PresentReadOracle(new MapSource(), ctx, { maxReads: 2 });
    expect(o.read("clock.state")).not.toBeNull();
    expect(o.read("commitments.ledger")).toBeNull();
    expect(o.trace().reads).toHaveLength(1);
    expect(o.trace().refused_reads).toEqual(["commitments.ledger"]);
  });

  it("[S3] [mechanism only] an absent key is a version-0 witness, a present key records owner, version and a value hash, and a wrong envelope is MALFORMED not absent", () => {
    const src = new MapSource([
      stateFact(100),
      fact(TEMPORAL_ORIGIN_KEY, { a: 1 }, { version: 4 }),
    ]);
    src.put({
      ...(src.facts.get(TEMPORAL_ORIGIN_KEY) as ReturnType<typeof fact>),
      key: "temporal/something-else",
    });
    const o = new PresentReadOracle(src, ctx);
    const clock = o.read("clock.state");
    expect(clock?.[0]?.tag).toBe("PRESENT");
    const ledger = o.read("commitments.ledger");
    expect(ledger?.map((r) => r.tag)).toEqual(["ABSENT", "ABSENT"]);
    const w = o.trace().reads;
    expect(w[0]).toMatchObject({
      category: 2,
      template: "clock.state",
      key: TEMPORAL_STATE_KEY,
      owner: "temporal_kernel",
      version: 1,
    });
    expect(w[0]?.fact_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(w[1]).toMatchObject({ category: 5, version: 0, owner: null, fact_sha256: null });
    // a fact stored under the wrong key
    const wrong = new MapSource();
    wrong.facts.set(TEMPORAL_STATE_KEY, fact("temporal/not-the-state", {}));
    const o2 = new PresentReadOracle(wrong, ctx);
    expect(o2.read("clock.state")?.[0]?.tag).toBe("MALFORMED");
    expect(o2.trace().reads[0]?.version).toBe(-1);
  });

  it("[S3] [mechanism only] a source that throws is unreadable, never an absence, and a stale or inserted zero key is reported by the witnesses", () => {
    const throwing = {
      getFact: () => {
        throw new Error("disk");
      },
    };
    const o = new PresentReadOracle(throwing, ctx);
    expect(o.read("clock.state")?.[0]?.tag).toBe("MALFORMED");
    // witnesses: read, insert the zero key afterwards, and the witness moves
    const src = new MapSource();
    const r = run(src);
    expect(witnessesStillCurrent(src, r.witnesses)).toEqual([]);
    src.put(gipReceiptFact());
    const moved = witnessesStillCurrent(src, r.witnesses);
    expect(moved.map((w) => w.key)).toEqual([GIP_SUNSET_ENROLLMENT_KEY]);
    expect(moved[0]?.version).toBe(0);
    expect(witnessesStillCurrent(throwing, r.witnesses).length).toBe(
      r.witnesses.filter((w) => w.version !== -1).length,
    );
  });
});

describe("[S3] [mechanism only] source classes: valid absence is distinct from malformed", () => {
  it("[S3] [mechanism only] an empty world is VALID_ABSENT in every addressed category it can be, with a version-0 witness for every key, and the verdict is not a permission", () => {
    const r = run(new MapSource());
    expect(r.basis.authentication).toBe("NOT_PROVEN_TEST_PRECONDITION");
    expect(r.basis).toMatchObject({
      identity: { cls: "VALID_ABSENT", state: "NONE" },
      clock: { cls: "VALID_ABSENT", state: "ABSENT" },
      gip: { cls: "VALID_ABSENT" },
      freight: { cls: "VALID_ABSENT" },
      commitments: { cls: "UNKNOWN" },
      origin: "NOT_READ_CLOCK_UNAVAILABLE",
    });
    expect(r.witnesses.every((w) => w.version === 0)).toBe(true);
    expect(r.verdict.kind).toBe("REFUSE");
  });

  it("[S3] [mechanism only] a malformed GIP receipt is INVALID where the legacy predicate reads it as absent", () => {
    const malformed = new MapSource([fact(GIP_SUNSET_ENROLLMENT_KEY, { garbage: true })]);
    expect(run(malformed).basis.gip.cls).toBe("INVALID");
    // the executed legacy contrast: absent and malformed collapse to the same undefined, and a malformed receipt lets any stop through
    const facts = (s: MapSource) => ({
      get: (k: string) => s.facts.get(k),
      has: (k: string) => s.facts.has(k),
    });
    expect(pendingSunsetEnrollment(facts(new MapSource()))).toBeUndefined();
    expect(pendingSunsetEnrollment(facts(malformed))).toBeUndefined();
    expect(gipEnrollmentPendingViolation(facts(malformed), at(900))).toBeNull();
  });

  it("[S3] [mechanism only] a malformed freight receipt is INVALID where the legacy predicate reads it as absent", () => {
    const malformed = new MapSource([fact(LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY, 42)]);
    expect(run(malformed).basis.freight.cls).toBe("INVALID");
    const facts = (s: MapSource) => ({ get: (k: string) => s.facts.get(k) });
    expect(pendingDispatchEnrollment(facts(new MapSource()))).toBeUndefined();
    expect(pendingDispatchEnrollment(facts(malformed))).toBeUndefined();
    // and a malformed receipt lets any stop through
    expect(freightDispatchPendingViolation(facts(malformed), at(900))).toBeNull();
  });

  it("[S3] [mechanism only] a malformed PC occupancy is INVALID in the source view where the legacy state reads it as NONE", () => {
    const malformed = new MapSource([fact(popPcOccupancyKey(PC), { junk: 1 })]);
    // the PC chain stops at the absent binding here, so judge the legacy contrast directly and the INVALID mapping through the oracle
    const facts = {
      get: (k: string) => malformed.facts.get(k),
      has: (k: string) => malformed.facts.has(k),
    };
    expect(pcOccupancyState(facts, PC)).toEqual({ state: "NONE" });
    const o = new PresentReadOracle(malformed, {
      campaign_id: CAMPAIGN,
      pc_id: PC,
      transaction_id: TX,
      from_transaction: null,
    });
    expect(o.read("pc.occupancy")?.[0]?.tag).toBe("PRESENT");
  });

  it("[S3] [mechanism only] a receipt whose Instrument is absent, and one whose registered object is absent, are classified apart", () => {
    const r1 = run(new MapSource([stateFact(100), gipReceiptFact()]));
    expect(r1.basis.gip).toEqual({ cls: "INVALID", evidence: { instrument_id: "inst-1" } });
  });

  it("[S3] [mechanism only] a freight receipt with neither original commit present is PENDING with both reported, and the class does not name which is missing", () => {
    const r = run(new MapSource([stateFact(100), freightReceiptFact()]));
    expect(r.basis.freight.cls).toBe("PENDING");
    expect(r.basis.freight.evidence).toMatchObject({ missing: ["E1", "TE"] });
    expect(keysRead(r)).toContain(economyFreightUseConsumptionKey("use-1"));
    expect(keysRead(r)).toContain(temporalObjectKey(logisticsObjectId("req-1")));
  });

  it("[S3] [mechanism only] category 5 (PROVISIONAL): an absent ledger is UNKNOWN, never VALID_ABSENT; a malformed or half-present ledger is INVALID", () => {
    const absent = run(new MapSource());
    expect(absent.basis.commitments.cls).toBe("UNKNOWN");
    expect(absent.basis.commitments.requires).toEqual(CAT5_REQUIREMENTS);
    expect(Object.values(absent.basis.commitments.proof)).toEqual([
      "UNPROVEN",
      "UNPROVEN",
      "UNPROVEN",
    ]);
    expect(absent.witnesses.filter((w) => w.category === 5).map((w) => w.version)).toEqual([0, 0]);
    const malformedHead = new MapSource([fact(pcStandingLedgerHeadKey(PC), { not: "a head" })]);
    expect(run(malformedHead).basis.commitments.cls).toBe("INVALID");
    const headOnly = new MapSource([ledgerHeadFact(PC, 1)]);
    expect(run(headOnly).basis.commitments.cls).toBe("INVALID");
  });

  it("[S3] [mechanism only] category 5: a consistent ledger whose operative PC identity is unproven is UNKNOWN, not a witness, and the proof requirements are carried in the trace", () => {
    const src = new MapSource([ledgerHeadFact(PC, 1), ledgerVersionFact(PC)]);
    const r = run(src);
    expect(r.basis.commitments.cls).toBe("UNKNOWN");
    expect(r.basis.commitments.proof.EXACT_OPERATIVE_PC_IDENTITY).toBe("UNPROVEN");
    expect(r.trace.proofs.map((p) => `${p.requirement}:${p.status}`)).toEqual([
      "EXACT_OPERATIVE_PC_IDENTITY:UNPROVEN",
      "CURRENT_SOURCE_PERMISSION_VISIBILITY:UNPROVEN",
      "GOVERNING_POLICY:UNPROVEN",
    ]);
    // a ledger of ANOTHER pc, or a version whose digest does not re-derive, is a corrupt carrier
    const wrongPc = new MapSource([ledgerHeadFact(PC, 1, "someone-else"), ledgerVersionFact(PC)]);
    expect(run(wrongPc).basis.commitments.cls).toBe("INVALID");
    const badDigest = new MapSource([
      ledgerHeadFact(PC, 1),
      ledgerVersionFact(PC, { tamper: true }),
    ]);
    expect(run(badDigest).basis.commitments.cls).toBe("INVALID");
  });

  it("[S3] [mechanism only] the sealed-result key and the open-authority key are read first; a malformed record ends the call before any other read", () => {
    const bad = new MapSource([fact(temporalTransactionKey(TX), { nonsense: true })]);
    const r = run(bad);
    expect(r.verdict).toEqual({ kind: "REFUSE", reason: "IDENTITY_SOURCE_INVALID" });
    expect(keysRead(r)).toEqual([temporalTransactionKey(TX)]);
    const badAuth = new MapSource([fact(temporalTransactionAuthorityKey(TX), { nonsense: true })]);
    const r2 = run(badAuth);
    expect(r2.verdict).toEqual({ kind: "REFUSE", reason: "IDENTITY_SOURCE_INVALID" });
    expect(keysRead(r2)).toEqual([temporalTransactionKey(TX), temporalTransactionAuthorityKey(TX)]);
  });
});

describe("[S3] [mechanism only] category 2 and category 8: the present basis and the fixed origin read", () => {
  it("[S3] [mechanism only] the observed basis must equal the present canonical time exactly; a stale, missing or malformed basis refuses", () => {
    const src = new MapSource([stateFact(100)]);
    expect(run(src, initial({ observed_basis: at(100) })).basis.clock).toMatchObject({
      state: "VALID",
      basis_matches: true,
    });
    expect(run(src, initial({ observed_basis: at(99) })).verdict).toEqual({
      kind: "REFUSE",
      reason: "BASIS_STALE",
    });
    expect(run(src, initial({ observed_basis: at(100, "other-unit") })).verdict).toEqual({
      kind: "REFUSE",
      reason: "BASIS_STALE",
    });
    expect(run(src, initial({ observed_basis: null })).verdict).toEqual({
      kind: "REFUSE",
      reason: "BASIS_MISSING",
    });
    expect(
      run(new MapSource([fact(TEMPORAL_STATE_KEY, { canonical_time: "nope" })])).verdict,
    ).toEqual({ kind: "REFUSE", reason: "TIME_STATE_INVALID" });
    expect(run(new MapSource()).verdict).toEqual({
      kind: "REFUSE",
      reason: "TIME_NOT_INITIALIZED",
    });
  });

  it("[S3] [mechanism only] the origin witness is read exactly once for a fresh INITIAL, and its absence means an opaque origin, not permission", () => {
    const withState = new MapSource([stateFact(100)]);
    const absent = run(withState);
    expect(keysRead(absent).filter((k) => k === TEMPORAL_ORIGIN_KEY)).toHaveLength(1);
    expect(absent.basis.origin).toEqual({ cls: "VALID_ABSENT", evidence: null });
    const good = run(withState.clone().put(originFact()));
    expect(good.basis.origin).toEqual({ cls: "COMPLETE", evidence: { violation: null } });
    expect(run(withState.clone().put(originFact({ campaign: "another" }))).basis.origin).toEqual({
      cls: "INVALID",
      evidence: { violation: "ORIGIN_CAMPAIGN" },
    });
    expect(run(withState.clone().put(originFact({ unit: "other" }))).basis.origin).toEqual({
      cls: "INVALID",
      evidence: { violation: "ORIGIN_UNIT" },
    });
    expect(run(withState.clone().put(fact(TEMPORAL_ORIGIN_KEY, { x: 1 }))).basis.origin).toEqual({
      cls: "INVALID",
      evidence: { violation: "ORIGIN_MALFORMED" },
    });
  });

  it("[S3] [mechanism only] a CONTINUATION never reads the origin witness, and a same-ID sealed replay ends the call before it", () => {
    const cont = run(new MapSource([stateFact(100)]), {
      phase: "CONTINUATION",
      transaction_id: TX,
      from_transaction: "tx-held",
      observed_basis: null,
      catalogue_sha256: digest,
    });
    expect(keysRead(cont)).not.toContain(TEMPORAL_ORIGIN_KEY);
    // the held transaction is absent here, so the call ends in the identity category
    expect(cont.verdict).toEqual({ kind: "REFUSE", reason: "CONTINUATION_SOURCE_ABSENT" });
    expect(cont.basis.origin).toBe("NOT_READ_BY_RULE");
  });
});

describe("[S3] [mechanism only] hidden-future twins: the same present facts, a different hidden future, a different request duration", () => {
  const A = new MapSource([
    stateFact(100),
    gipReceiptFact("inst-1", 500, 10),
    freightReceiptFact(700),
  ]);
  const B = new MapSource([
    stateFact(100),
    gipReceiptFact("inst-1", 100_000, 10),
    freightReceiptFact(9_999_999),
  ]);

  const requestWith = (duration: number, unit: "second" | "minute" | "hour") => {
    const parsed = parseGmWaitRequest({
      transaction_id: TX,
      cause: "cause-1",
      trigger: { kind: "GM_INTERPRETED_PC_WAIT", ref: "ref-1" },
      continues: null,
      requested: {
        target: at(100 + duration * (unit === "second" ? 1 : unit === "minute" ? 60 : 3600)),
        condition: null,
      },
      context: { role: "role.gm", permission: "permission.rule.adjudicate" },
      publication: { basis: "b", secrecy: "s" },
      gm_wait: {
        phase: "INITIAL",
        duration_value: duration,
        duration_unit: unit,
        observed_basis: at(100),
        interpretation_mode: "EXPLICIT_DURATION",
        conversion_rule_version: "SI_SUBDAY_V1",
        catalogue_sha256: digest,
      },
    });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed));
    return parsed.value;
  };
  /** the only adapter from a parsed GM request to the T0 request: it carries no duration, unit, mode or target */
  const t0Request = (r: ReturnType<typeof requestWith>): PresentBasisRequest => {
    if (r.gm_wait.phase !== "INITIAL") throw new Error("initial only");
    return {
      phase: "INITIAL",
      transaction_id: r.transaction_id,
      from_transaction: null,
      observed_basis: r.gm_wait.observed_basis,
      catalogue_sha256: r.gm_wait.catalogue_sha256,
    };
  };

  it("[S3] [mechanism only] twins with different hidden sunset and delivery instants, over several requested durations, read the same keys and give the same classes and verdict", () => {
    const durations: [number, "second" | "minute" | "hour"][] = [
      [1, "second"],
      [3, "second"],
      [10, "minute"],
      [2, "hour"],
      [100_000, "hour"],
    ];
    const baseline = run(A, t0Request(requestWith(1, "second")));
    for (const [d, u] of durations) {
      for (const src of [A, B]) {
        const r = run(src, t0Request(requestWith(d, u)));
        expect(keysRead(r), `${d} ${u}`).toEqual(keysRead(baseline));
        expect(r.basis, `${d} ${u}`).toEqual(baseline.basis);
        expect(r.verdict, `${d} ${u}`).toEqual(baseline.verdict);
        expect(r.witnesses.map((w) => `${w.key}@${w.version}`)).toEqual(
          baseline.witnesses.map((w) => `${w.key}@${w.version}`),
        );
      }
    }
    // the receipts' own future instants (sunset_at, delivery.at) appear nowhere in the evidence
    expect(JSON.stringify(baseline.basis)).not.toMatch(/500|700|100000|9999999/);
  });

  it("[S3] [mechanism only] the classifier never reads a duration, unit, target or mode even if the request object carries them: a property with a throwing getter is never touched", () => {
    const poisoned = {
      ...t0Request(requestWith(5, "minute")),
      get duration_value(): number {
        throw new Error("read the duration");
      },
      get duration_unit(): string {
        throw new Error("read the unit");
      },
      get requested(): unknown {
        throw new Error("read the target");
      },
      get interpretation_mode(): string {
        throw new Error("read the mode");
      },
    } as unknown as PresentBasisRequest;
    expect(() => run(A, poisoned)).not.toThrow();
    expect(run(A, poisoned).basis).toEqual(run(A, t0Request(requestWith(5, "minute"))).basis);
  });

  it("[S3] [mechanism only] the present pending receipt gives one normalized class however the producer's state is described (no input channel carries it)", () => {
    const pendingNow = new MapSource([stateFact(100), freightReceiptFact(700)]);
    const sameLater = new MapSource([stateFact(100), freightReceiptFact(5_000)]);
    const classes = [pendingNow, sameLater].map((s) => run(s).basis.freight.cls);
    expect(classes).toEqual(["PENDING", "PENDING"]);
    // classifyPresentBasis has exactly five parameters: a producer liveness flag has nowhere to enter
    expect(classifyPresentBasis.length).toBe(4);
  });
});

describe("[S3] [mechanism only] forbidden reads: no future index, schedule, due count or whole-world scan is reachable", () => {
  const FORBID = (k: string) =>
    k === TEMPORAL_BOUNDARY_INDEX_KEY || k === "temporal/boundary-index";
  it("[S3] [mechanism only] over a family of sources the tripwire is never tripped and every key read is a template key", () => {
    const sources = [
      new MapSource(),
      new MapSource([stateFact(100)]),
      new MapSource([stateFact(100), gipReceiptFact(), freightReceiptFact(), originFact()]),
      new MapSource([
        fact(GIP_SUNSET_ENROLLMENT_KEY, { x: 1 }),
        fact(LOGISTICS_FREIGHT_DISPATCH_ENROLLMENT_KEY, 7),
        fact(TEMPORAL_STATE_KEY, "no"),
      ]),
    ];
    for (const s of sources) {
      for (const req of [
        initial(),
        initial({ phase: "CONTINUATION", from_transaction: "tx-held", observed_basis: null }),
      ]) {
        const t = tripwire(s, FORBID);
        const r = classifyPresentBasis(pre, req, t.source, productionOk());
        expect(r.trace.reads.length).toBeLessThanOrEqual(S3_MAX_READS);
        expect(t.calls).toEqual(keysRead(r));
        expect(t.calls.some(FORBID)).toBe(false);
        const objectPrefixes = [
          temporalObjectKey(gipSunsetObjectId("")),
          temporalObjectKey(logisticsObjectId("")),
        ];
        expect(
          t.calls.some(
            (k) => k.startsWith("temporal/object/") && !objectPrefixes.some((p) => k.startsWith(p)),
          ),
        ).toBe(false);
      }
    }
  });

  it("[S3] [mechanism only] the tripwire is not vacuous: it throws on a list-style access and on the forbidden key", () => {
    const t = tripwire(new MapSource(), FORBID);
    expect(() => (t.source as unknown as { listFacts(): unknown }).listFacts()).toThrow(/TRIPWIRE/);
    expect(() => t.source.getFact(TEMPORAL_BOUNDARY_INDEX_KEY)).toThrow(/TRIPWIRE/);
  });

  it("[S3] [mechanism only] the legacy stationary and collection predicates are not used: the module never names the index or the legacy predicates in code", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("packages/engine/src/gm-wait-present-reader.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(
      /boundaryIndex|isStationaryActivePc|pcCollectionCrossingClear|gipEnrollmentPendingViolation|freightDispatchPendingViolation|listFacts|canonicalState/,
    );
    expect(src).not.toMatch(/TEMPORAL_BOUNDARY_INDEX_KEY|temporal\/boundary-index/);
  });

  it("[S3] [mechanism only] a read of any other fact kind cannot be requested: each template reads only keys of its own category", () => {
    const src = new MapSource([stateFact(100)]);
    const r = run(src);
    const byCategory = new Map<number, Set<string>>();
    for (const w of r.trace.reads)
      (byCategory.get(w.category) ?? byCategory.set(w.category, new Set()).get(w.category))?.add(
        w.key,
      );
    expect([...(byCategory.get(2) ?? [])]).toEqual([TEMPORAL_STATE_KEY]);
    expect([...(byCategory.get(1) ?? [])]).toEqual([
      temporalTransactionKey(TX),
      temporalTransactionAuthorityKey(TX),
    ]);
    expect(
      r.trace.reads.some((w) => w.key === PLAYER_CHARACTER_BINDING_KEY && w.category === 3),
    ).toBe(true);
    expect(
      r.trace.reads.some((w) => w.key === worldPcLocusCustodyKey(PC) && w.category === 3),
    ).toBe(true);
  });
});

describe("[S3] [mechanism only] the closed verdict: permission is never the default, and the only positive is the synthetic test policy", () => {
  it("[S3] [mechanism only] a synthetic policy id may not be a digest or a retained production digest", () => {
    const premises = {
      accept_complete_gip: true,
      accept_complete_freight: true,
      no_pc_known_time_commitments: true,
    };
    expect(() => makeSyntheticTestPolicy("", premises)).toThrow();
    expect(() => makeSyntheticTestPolicy(sha("looks like a digest"), premises)).toThrow();
    expect(() =>
      makeSyntheticTestPolicy("label-ok", premises, { current: "label-ok", retained: new Map() }),
    ).toThrow();
    expect(() =>
      makeSyntheticTestPolicy("label-ok", premises, {
        current: digest,
        retained: new Map([["label-ok", ""]]),
      }),
    ).toThrow();
    expect(makeSyntheticTestPolicy("label-ok", premises).kind).toBe("SYNTHETIC_TEST_ONLY");
  });

  it("[S3] [mechanism only] under the production catalogue no source whatever yields a positive, over a few hundred seeded random worlds, and the verdict kinds are the closed set", () => {
    let seed = 0x9e3779b9;
    const rnd = () => {
      seed ^= seed << 13;
      seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      seed >>>= 0;
      return seed / 0x100000000;
    };
    const pickers: ((s: MapSource) => void)[] = [
      (s) => s.put(stateFact(100)),
      (s) => s.put(gipReceiptFact()),
      (s) => s.put(freightReceiptFact()),
      (s) => s.put(originFact()),
      (s) => s.put(fact(popPcOccupancyKey(PC), { junk: 1 })),
      (s) => s.put(fact(PLAYER_CHARACTER_BINDING_KEY, { junk: 1 })),
      (s) => s.put(fact(worldPcLocusCustodyKey(PC), { junk: 1 })),
      (s) => s.put(fact(TEMPORAL_ORIGIN_KEY, "junk")),
    ];
    const closed = new Set(["REFUSE", "PENDING", "UNKNOWN", "EXISTING_RESULT"]);
    for (let i = 0; i < 400; i++) {
      const s = new MapSource();
      for (const p of pickers) if (rnd() < 0.5) p(s);
      const r = run(s);
      expect(closed.has(r.verdict.kind), JSON.stringify(r.verdict)).toBe(true);
      expect(r.verdict.kind).not.toBe("SYNTHETIC_TEST_POLICY_POSITIVE");
      expect(r.basis.authentication).toBe("NOT_PROVEN_TEST_PRECONDITION");
      expect(r.basis.catalogue).toMatchObject({
        mode: "PRODUCTION",
        disposition: "UNDECLARED",
        epistemic: "ACTIONABLE_OR_UNSAFE",
      });
    }
  });

  it("[S3] [mechanism only] an unknown, stale, malformed or forged digest is denied before any permission could arise, whatever the present facts are", () => {
    const src = new MapSource([stateFact(100)]);
    const cases: [string | null, string][] = [
      [null, "DIGEST_MALFORMED"],
      ["ABC", "DIGEST_MALFORMED"],
      [sha("unknown"), "DIGEST_UNKNOWN"],
    ];
    for (const [supplied, expected] of cases) {
      const r = run(src, initial({ catalogue_sha256: supplied }));
      expect(r.basis.catalogue.digest).toBe(expected);
    }
    expect(run(src, initial(), production()).basis.catalogue.digest).toBe(
      "MANIFEST_BYTES_MISMATCH",
    );
    expect(run(src, initial(), productionOk()).basis.catalogue.digest).toBe("OK_CURRENT");
  });

  it("[S3] [mechanism only] the production policy cites the catalogue as UNDECLARED and ACTIONABLE_OR_UNSAFE in every result, even an early one", () => {
    const r = run(new MapSource());
    expect(r.basis.catalogue).toMatchObject({
      disposition: "UNDECLARED",
      epistemic: "ACTIONABLE_OR_UNSAFE",
    });
    expect(
      run(new MapSource([fact(temporalTransactionKey(TX), { bad: 1 })])).basis.catalogue.epistemic,
    ).toBe("ACTIONABLE_OR_UNSAFE");
  });

  it("[S3] [mechanism only] the synthetic policy changes only the verdict: the policy-independent basis of one source is identical under either policy", () => {
    const src = new MapSource([stateFact(100), gipReceiptFact(), originFact()]);
    const a = run(src, initial(), productionOk());
    const b = run(src, initial(), synthetic);
    expect({ ...a.basis, catalogue: null }).toEqual({ ...b.basis, catalogue: null });
    expect(keysRead(a)).toEqual(keysRead(b));
  });
});
