/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and state values */
// GIP Governance Instrument Sunset (sunset slice) — every falsifying refusal fails closed: wrong key / authority, a missing,
// incomparable, unsupported or past term, an absent or uncommitted source, an inactive or ambiguous lifecycle, an altered or stale
// term, an unavailable provider, an unearned or early boundary, a duplicate or forged stage, a direct raw status mutation and a
// conflicting replay. Each refusal leaves the Instrument `active`, its boundary intact and nothing written. Register lineage:
// IA-02/03/04/06 (partial); RC-02/05/07/10/16; IM-02, IM-06, IM-11, IM-12, IM-17.
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  FACET_TEMPORAL_COORDINATION,
  GIP_SUNSET_ENROLLMENT_KEY,
  OWNER_GIP,
  OWNER_TEMPORAL_KERNEL,
  TEMPORAL_STATE_KEY,
  TemporalStateSchema,
  gipInstrumentKey,
  gipSunsetBoundaryId,
  gipSunsetObjectId,
  gipSunsetProcessId,
  gipSunsetStage,
  temporalObjectKey,
  temporalTransactionAuthorityKey,
  type CommitGroup,
  type GovernanceInstrument,
  type TemporalObject,
} from "@immortalis/contracts";
import {
  GIP_INSTRUMENT_RULE,
  GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
  StageUnresolvedError,
  deriveSunsetExpiry,
  factKind,
  gipSunsetExpiryProvider,
  gipSunsetTemporalObject,
  sunsetReachViolation,
  stageGroupId,
  stageIntentId,
  transactionAuthorityGroupId,
  transactionAuthorityIntentId,
  transactionCause,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  INSTRUMENT_A,
  INSTRUMENT_B,
  SCOPE_BINDING_A,
  TIME_UNIT,
  gipPublication,
  governanceInstrument,
} from "@immortalis/testkit";
import {
  omit,
  OTHER_SUNSET_AT,
  SUNSET_AT,
  SUNSET_LATER,
  SUNSET_MID,
  SUNSET_START,
  advanceTo,
  at,
  establishSunset,
  instrumentOf,
  seededPendingSunset,
  seededSunsetCampaign,
  sunsetCoordinator,
  sunsetInstrument,
  type SunsetSeeded,
} from "../support/gip-sunset.ts";
import { seededGipCampaign } from "../support/gip.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const lifecycle = (s: Pick<SunsetSeeded, "campaign">, id = INSTRUMENT_A) =>
  (instrumentOf(s, id)!.value as GovernanceInstrument).lifecycle_status;
const index = (s: Pick<SunsetSeeded, "campaign">) =>
  (s.campaign.store.getFact("temporal/boundary-index")?.value as any)?.entries ?? [];
const sunsetKey = temporalObjectKey(gipSunsetObjectId(INSTRUMENT_A));

/** An Instrument, enrolled and registered, still active: the premise of every refusal below. */
async function registered(): Promise<SunsetSeeded> {
  const s = await seededSunsetCampaign(tempDir());
  await establishSunset(s);
  return s;
}

/** The refusal changed nothing: same head, active Instrument at version 1, boundary still in the index. */
function untouched(s: SunsetSeeded, head: unknown) {
  expect(s.campaign.store.head()).toEqual(head);
  expect(lifecycle(s)).toBe("active");
  expect(instrumentOf(s)!.version).toBe(1);
  expect(index(s)).toHaveLength(1);
}

describe("an unsupported, incomparable or past sunset term is refused at establishment: nothing is committed or enrolled", () => {
  const establish = (s: SunsetSeeded, instrument: unknown, n = 4) =>
    s.gip.establishSunsetInstrument({ ...gipPublication(n), instrument });

  it("a sunset at or before canonical time, in the same unit, is not an earned LATER boundary", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const head = s.campaign.store.head();
    for (const sunset of [SUNSET_START, at(SUNSET_START.value - 1), at(0)])
      expect(
        await codeOf(establish(s, sunsetInstrument(INSTRUMENT_A, sunset))),
        String(sunset.value),
      ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)).toBeUndefined();
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toBeUndefined();
    expect(index(s)).toEqual([]);
  });

  it("a sunset in another unit than canonical time is incomparable and fails closed", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const head = s.campaign.store.head();
    expect(
      await codeOf(
        establish(s, sunsetInstrument(INSTRUMENT_A, { unit: "another-unit", value: 10 ** 6 })),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it.each([
    ["a natural-language date", "the first day of spring"],
    ["a contingent condition", { when: "the treaty is repealed" }],
    ["a duration", { unit: TIME_UNIT, duration: 5 }],
    ["a wrapped instant", { at: at(200) }],
    ["a fractional instant", { unit: TIME_UNIT, value: 200.5 }],
    ["null", null],
  ])("%s is unsupported and is not interpreted", async (_n, term) => {
    const s = await seededSunsetCampaign(tempDir());
    const head = s.campaign.store.head();
    expect(await codeOf(establish(s, { ...sunsetInstrument(), sunset_condition: term })), _n).toBe(
      "INPUT_INVALID",
    );
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("an Instrument without a sunset is not a sunset-bearing establishment, and a sunset-bearing one is not a plain establishment", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const head = s.campaign.store.head();
    const plain = omit(sunsetInstrument(), "sunset_condition");
    expect(await codeOf(establish(s, plain))).toBe("INPUT_INVALID");
    expect(
      await codeOf(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(5),
          instrument: sunsetInstrument(),
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it.each([
    "proposed",
    "pending",
    "suspended",
    "superseded",
    "repealed",
    "terminated",
    "expired",
  ] as const)(
    "a sunset on a %s Instrument is unsupported: only an active Instrument earns the one active → expired transition",
    async (lifecycle_status) => {
      const s = await seededSunsetCampaign(tempDir());
      const head = s.campaign.store.head();
      expect(
        await codeOf(establish(s, sunsetInstrument(INSTRUMENT_A, SUNSET_AT, { lifecycle_status }))),
        lifecycle_status,
      ).toBe("VALUE_INVALID");
      expect(s.campaign.store.head()).toEqual(head);
      expect(index(s)).toEqual([]);
    },
  );

  it("without an established canonical temporal basis there is nothing to compare the sunset with", async () => {
    const s = await seededGipCampaign(tempDir(), { canonical: false });
    expect(await codeOf(establish(s as never, sunsetInstrument()))).toBe("PREREQUISITE_MISSING");
  });

  it("an unestablished source office or Scope Binding refuses the Instrument as for any Instrument", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const head = s.campaign.store.head();
    expect(
      await codeOf(
        establish(
          s,
          governanceInstrument(INSTRUMENT_A, INSTITUTION_COURT, "office-unknown", SCOPE_BINDING_A, {
            sunset_condition: SUNSET_AT,
          }),
        ),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("raw groups cannot bypass the adapter: a lone sunset-bearing Instrument, a lone receipt and a tampered receipt are each refused by IM-11", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const store = s.campaign.store;
    const head = store.head();
    const office = store.getFact("gip/institution/institution-court-1/office/office-magistrate-1")!;
    const binding = store.getFact(
      "gip/institution/institution-court-1/office/office-magistrate-1/scope-binding/scope-binding-a-1",
    )!;
    const instrument = sunsetInstrument();
    const receipt = { instrument_id: INSTRUMENT_A, sunset_at: SUNSET_AT, basis_time: SUNSET_START };
    const write = (key: string, value: unknown, over: Record<string, unknown> = {}) => ({
      key,
      owner: OWNER_GIP,
      facet: "gip_institution_identity",
      value: value as never,
      unit: null,
      basis: "b",
      secrecy: "s",
      expected_version: 0,
      ...over,
    });
    const gipGroup = (n: number, writes: any[], over: Partial<CommitGroup> = {}): CommitGroup => ({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: `raw-g-${n}`,
      intent_id: `raw-i-${n}`,
      owner: OWNER_GIP,
      facet: "gip_institution_identity",
      cause: `raw-c-${n}`,
      rule: GIP_INSTRUMENT_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [
        { key: office.key, version: office.version },
        { key: binding.key, version: binding.version },
      ],
      depends_on: [office.provenance.group_id, binding.provenance.group_id],
      writes,
      ...over,
    });
    const instrumentW = write(gipInstrumentKey(INSTRUMENT_A), instrument);
    const slotW = (value: unknown, over: Record<string, unknown> = {}) =>
      write(GIP_SUNSET_ENROLLMENT_KEY, value, over);
    const code = async (g: CommitGroup) =>
      (await store.commit(g)).ok ? "OK" : ((await store.commit(g)) as any).error.code;

    // a lone sunset-bearing Instrument has no registration path
    expect(await code(gipGroup(1, [instrumentW]))).toBe("REFERENCE_INVALID");
    // a lone receipt is not lawful
    expect(await code(gipGroup(2, [slotW(receipt)]))).toBe("VALUE_INVALID");
    // a receipt that repeats a different Instrument, sunset or canonical time than the Instrument and the temporal state
    for (const [n, tampered] of [
      [3, { ...receipt, instrument_id: INSTRUMENT_B }],
      [4, { ...receipt, sunset_at: OTHER_SUNSET_AT }],
      [5, { ...receipt, basis_time: SUNSET_MID }],
      [6, { ...receipt, basis_time: at(99) }],
    ] as const)
      expect(await code(gipGroup(n, [instrumentW, slotW(tampered)])), String(n)).toBe(
        "REFERENCE_INVALID",
      );
    // a receipt at another key, or carrying other labels than the Instrument
    expect(
      await code(gipGroup(7, [instrumentW, slotW(receipt, { key: "gip/sunset-enrollment-2" })])),
    ).not.toBe("OK");
    expect(await code(gipGroup(8, [instrumentW, slotW(receipt, { basis: "other" })]))).toBe(
      "VALUE_INVALID",
    );
    // the receipt never precedes the Instrument it enrolls, and the pair is not written under another citation
    expect(await code(gipGroup(9, [slotW(receipt), instrumentW]))).not.toBe("OK");
    expect(
      await code(
        gipGroup(10, [instrumentW, slotW(receipt)], {
          rule: GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE,
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(store.head()).toEqual(head);
    expect(store.getFact(GIP_SUNSET_ENROLLMENT_KEY)).toBeUndefined();
    expect(store.getFact(gipInstrumentKey(INSTRUMENT_A))).toBeUndefined();
  });

  it("a second Instrument cannot take an occupied identity: the same instrument_id, a different intent, equal or different term", async () => {
    const s = await registered();
    const head = s.campaign.store.head();
    for (const [n, sunset] of [
      [5, SUNSET_AT],
      [6, OTHER_SUNSET_AT],
    ] as const)
      expect(
        await codeOf(
          s.gip.establishSunsetInstrument({
            ...gipPublication(n),
            instrument: sunsetInstrument(INSTRUMENT_A, sunset),
          }),
        ),
        String(n),
      ).toBe("VERSION_CONFLICT");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(GIP_SUNSET_ENROLLMENT_KEY)!.version).toBe(1);
  });

  it("the same intent with a changed Instrument is a conflict, never a silent reuse of the committed one", async () => {
    const s = await registered();
    const head = s.campaign.store.head();
    const code = await codeOf(
      s.gip.establishSunsetInstrument({
        ...gipPublication(4),
        instrument: sunsetInstrument(INSTRUMENT_A, OTHER_SUNSET_AT),
      }),
    );
    expect(code).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
    expect((instrumentOf(s)!.value as GovernanceInstrument).sunset_condition).toEqual(SUNSET_AT);
  });
});

describe("registration admits exactly the derived object: no altered, stale, duplicate or hand-written boundary", () => {
  const derived = (s: SunsetSeeded): TemporalObject => {
    const i = instrumentOf(s)!.value as GovernanceInstrument;
    return gipSunsetTemporalObject(i, SUNSET_START)!;
  };
  const register = (s: SunsetSeeded, object: unknown, n: number) =>
    sunsetCoordinator(s.campaign.store).registerObject({
      group_id: `reg-g-${n}`,
      intent_id: `reg-i-${n}`,
      cause: `reg-c-${n}`,
      basis: "b",
      secrecy: "s",
      object: object as never,
    });

  it("an unregistered sunset admits only the exact derived object; every altered boundary, basis, stage, read, owner or process is refused", async () => {
    const s = await seededPendingSunset(tempDir());
    const head = s.campaign.store.head();
    const object = derived(s);
    const dep = object.dependencies[0]!;
    const variants: [string, unknown][] = [
      [
        "a boundary one coordinate later",
        { ...object, next_boundary: { ...object.next_boundary!, at: at(SUNSET_AT.value + 1) } },
      ],
      [
        "a boundary one coordinate earlier",
        { ...object, next_boundary: { ...object.next_boundary!, at: at(SUNSET_AT.value - 1) } },
      ],
      [
        "another boundary identity",
        { ...object, next_boundary: { ...object.next_boundary!, boundary_id: "boundary-x" } },
      ],
      ["no boundary", { ...object, next_boundary: null }],
      ["another resolved basis", { ...object, last_resolved_basis: SUNSET_MID }],
      ["another object identity", { ...object, object_id: gipSunsetObjectId(INSTRUMENT_B) }],
      [
        "another process",
        { ...object, owning_ref: { owner: OWNER_GIP, process_id: "other-process" } },
      ],
      [
        "another owner",
        {
          ...object,
          owning_ref: { owner: "temporal_kernel", process_id: gipSunsetProcessId(INSTRUMENT_A) },
        },
      ],
      [
        "another stage operation",
        {
          ...object,
          dependencies: [
            {
              ...dep,
              stage: {
                ...dep.stage,
                owner_operation: { owner: OWNER_GIP, operation: "gip-other" },
              },
            },
          ],
        },
      ],
      [
        "another stage result",
        {
          ...object,
          dependencies: [{ ...dep, stage: { ...dep.stage, prospective_result_id: "x" } }],
        },
      ],
      [
        "a stage that declares a close",
        { ...object, dependencies: [{ ...dep, declares_close: { name: "gip-close" } }] },
      ],
      [
        "a stage that produces another key",
        { ...object, dependencies: [{ ...dep, produces: [gipInstrumentKey(INSTRUMENT_B)] }] },
      ],
      ["a stage with no source reads", { ...object, dependencies: [{ ...dep, reads: [] }] }],
      [
        "a stage reading only the office",
        { ...object, dependencies: [{ ...dep, reads: [dep.reads[0]] }] },
      ],
      ["a second stage", { ...object, dependencies: [dep, dep] }],
      ["no stage", { ...object, dependencies: [] }],
      ["a non-exact partition", { ...object, partition: { class: "APPROXIMATE-PARTITION" } }],
      [
        "an epistemic interruption",
        { ...object, information_latency: { creates_epistemic_interruption: true } },
      ],
      [
        "a recurrence continuation",
        { ...object, continuation: { resume_from: "NEXT", reconciliation_due: [] } },
      ],
      [
        "extra invalidators",
        { ...object, invalidators: [...object.invalidators, { fact_key: "gip/x" }] },
      ],
    ];
    for (const [name, v] of variants) {
      const r = await register(
        s,
        v,
        variants.findIndex((x) => x[0] === name),
      );
      expect(r.ok, name).toBe(false);
    }
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(sunsetKey)).toBeUndefined();
    expect(s.gip.sunsetEnrollment()?.registered).toBe(false);
    // …and the exact derived object is the one lawful registration
    expect((await register(s, object, 99)).ok).toBe(true);
    expect(s.gip.sunsetEnrollment()?.registered).toBe(true);
  });

  it("an object for an Instrument that is not committed, or that carries no sunset, earns nothing; and the kernel registers no GIP object of another shape", async () => {
    const s = await seededSunsetCampaign(tempDir());
    const head = s.campaign.store.head();
    const phantom = gipSunsetTemporalObject(sunsetInstrument(INSTRUMENT_B), SUNSET_START)!;
    expect((await register(s, phantom, 1)).ok).toBe(false);
    // not even with the receipt of ANOTHER Instrument standing
    expect(
      (await register(s, { ...phantom, object_id: gipSunsetObjectId("anything") }, 2)).ok,
    ).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("a registered sunset is registered once: a second registration of the same object is refused, and the adapter replays the committed one", async () => {
    const s = await registered();
    const head = s.campaign.store.head();
    const object = gipSunsetTemporalObject(
      instrumentOf(s)!.value as GovernanceInstrument,
      SUNSET_START,
    )!;
    expect((await register(s, object, 1)).ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
    const again = await must(s.gip.completeSunsetEnrollment(gipPublication(4)));
    expect(again.replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(head);
    expect(index(s)).toHaveLength(1);
  });

  it("an Instrument registered after it is no longer active earns no boundary: only an active Instrument is registered", async () => {
    const s = await registered();
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));
    expect(lifecycle(s)).toBe("expired");
    const object = gipSunsetTemporalObject(
      instrumentOf(s)!.value as GovernanceInstrument,
      SUNSET_START,
    )!;
    expect((await register(s, { ...object, object_id: object.object_id }, 1)).ok).toBe(false);
    expect(index(s)).toEqual([]);
  });
});

describe("owner separation: only GIP writes the Instrument slot; the kernel owns the object and cannot write GIP's result", () => {
  const rawGroup = (
    owner: string,
    facet: string,
    key: string,
    value: unknown,
    n: number,
    expected_version = 1,
  ): CommitGroup => ({
    campaign_id: FIXTURE_CAMPAIGN,
    group_id: `own-g-${n}`,
    intent_id: `own-i-${n}`,
    owner,
    facet,
    cause: `own-c-${n}`,
    rule: GIP_INSTRUMENT_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      {
        key,
        owner,
        facet,
        value: value as never,
        unit: null,
        basis: "b",
        secrecy: "s",
        expected_version,
      },
    ],
  });

  it("the Temporal kernel cannot write the Instrument slot (not the expired result, not the receipt), and GIP cannot write a kernel key", async () => {
    const s = await registered();
    const head = s.campaign.store.head();
    const expired = deriveSunsetExpiry(instrumentOf(s)!.value as GovernanceInstrument);
    expect(expired.ok).toBe(true);
    const kernel = (key: string, value: unknown, n: number) =>
      rawGroup(
        OWNER_TEMPORAL_KERNEL,
        FACET_TEMPORAL_COORDINATION,
        key,
        value,
        n,
        s.campaign.store.getFact(key)?.version ?? 0,
      );
    expect(
      await codeOf(
        s.campaign.store.commit(kernel(gipInstrumentKey(INSTRUMENT_A), (expired as any).value, 1)),
      ),
    ).toBe("FACT_OWNER_CONFLICT");
    expect(await codeOf(s.campaign.store.commit(kernel(GIP_SUNSET_ENROLLMENT_KEY, {}, 2)))).toBe(
      "FACT_OWNER_CONFLICT",
    );
    const gip = (key: string, value: unknown, n: number) =>
      rawGroup(
        OWNER_GIP,
        "gip_institution_identity",
        key,
        value,
        n,
        s.campaign.store.getFact(key)?.version ?? 0,
      );
    for (const key of [
      sunsetKey,
      "temporal/state",
      "temporal/boundary-index",
      temporalTransactionAuthorityKey("x"),
    ])
      expect(await codeOf(s.campaign.store.commit(gip(key, {}, 3))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
    expect(s.campaign.store.head()).toEqual(head);
    untouched(s, head);
  });

  it("the owner and facet of every committed fact are the sole GIP owner's for the Instrument and the receipt, the kernel's for the object", async () => {
    const s = await registered();
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_AT)));
    const instrument = instrumentOf(s)!;
    expect([instrument.owner, instrument.facet]).toEqual(["gip", "gip_institution_identity"]);
    const stageGroup = s.campaign.store.committedGroup(instrument.provenance.intent_id)!;
    expect([stageGroup.owner, stageGroup.facet]).toEqual(["gip", "gip_institution_identity"]);
    expect(stageGroup.writes.map((w) => w.key)).toEqual([gipInstrumentKey(INSTRUMENT_A)]);
    // the kernel's group records the transaction, the object and the index - not one GIP key
    const kernelGroup = s.campaign.store.committedGroup("transaction-intent:tx-1") ?? null;
    const txFact = s.campaign.store.getFact("temporal/transaction/tx-1")!;
    const tx = s.campaign.store.committedGroup(txFact.provenance.intent_id)!;
    expect(kernelGroup === null || kernelGroup.owner === "temporal_kernel").toBe(true);
    expect(tx.owner).toBe("temporal_kernel");
    expect(tx.writes.every((w) => !w.key.startsWith("gip/"))).toBe(true);
    expect(s.campaign.store.getFact(sunsetKey)!.owner).toBe("temporal_kernel");
  });

  it("the provider writes exactly the Instrument slot it was staged for, inheriting the Instrument's basis and secrecy", async () => {
    const s = await registered();
    const fact = instrumentOf(s)!;
    const office = s.campaign.store.getFact(
      "gip/institution/institution-court-1/office/office-magistrate-1",
    )!;
    const binding = s.campaign.store.getFact(
      "gip/institution/institution-court-1/office/office-magistrate-1/scope-binding/scope-binding-a-1",
    )!;
    const writes = gipSunsetExpiryProvider.compute(
      stageInput(s, fact, [office, binding], SUNSET_AT),
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]!.key).toBe(gipInstrumentKey(INSTRUMENT_A));
    expect([writes[0]!.basis, writes[0]!.secrecy, writes[0]!.unit]).toEqual([
      fact.basis,
      fact.secrecy,
      null,
    ]);
    expect((writes[0]!.value as any).lifecycle_status).toBe("expired");
    expect(gipSunsetExpiryProvider.rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(gipSunsetExpiryProvider.owner).toBe("gip");
    expect(factKind("gip_governance_instrument").owner).toBe(gipSunsetExpiryProvider.owner);
  });
});

/** The input the coordinator hands a stage, built from committed facts (the provider is pure over it). */
function stageInput(
  s: Pick<SunsetSeeded, "campaign">,
  prior: any,
  reads: any[],
  to: typeof SUNSET_AT,
  over: Record<string, unknown> = {},
) {
  return {
    stage: gipSunsetStage(INSTRUMENT_A),
    produces: [gipInstrumentKey(INSTRUMENT_A)],
    span: { from: SUNSET_START, to, elapsed: to.value - SUNSET_START.value },
    reads: reads.map((fact) => ({
      read: {
        mode: "AS-OF-NOW",
        source: { owner: OWNER_GIP, fact_key: fact.key },
        invalidators: [],
        source_basis: { version: fact.version, committed_by: fact.provenance.group_id },
      },
      fact,
    })),
    prior: new Map([[gipInstrumentKey(INSTRUMENT_A), prior]]),
    ...over,
  } as never;
}

describe("the stage provider resolves only the exact earned boundary of an active Instrument, and holds otherwise", () => {
  async function facts() {
    const s = await registered();
    return {
      s,
      fact: instrumentOf(s)!,
      reads: [
        s.campaign.store.getFact("gip/institution/institution-court-1/office/office-magistrate-1")!,
        s.campaign.store.getFact(
          "gip/institution/institution-court-1/office/office-magistrate-1/scope-binding/scope-binding-a-1",
        )!,
      ],
    };
  }
  const reason = (fn: () => unknown): string | undefined => {
    try {
      fn();
      return undefined;
    } catch (e) {
      return e instanceof StageUnresolvedError ? e.reason : `THROWN:${String(e)}`;
    }
  };

  it("an early boundary, a late boundary and a requested horizon hold the stage: it resolves AT the sunset instant only", async () => {
    const { s, fact, reads } = await facts();
    for (const to of [SUNSET_MID, at(SUNSET_AT.value - 1), at(SUNSET_AT.value + 1), SUNSET_LATER])
      expect(
        reason(() => gipSunsetExpiryProvider.compute(stageInput(s, fact, reads, to))),
        String(to.value),
      ).toBe("BASIS_MISMATCH");
    expect(
      reason(() => gipSunsetExpiryProvider.compute(stageInput(s, fact, reads, SUNSET_AT))),
    ).toBeUndefined();
  });

  it("an absent, wrong or incomplete source holds the stage: no Instrument, no office, no Scope Binding, swapped reads, wrong slot", async () => {
    const { s, fact, reads } = await facts();
    const to = SUNSET_AT;
    expect(
      reason(() =>
        gipSunsetExpiryProvider.compute(stageInput(s, fact, reads, to, { prior: new Map() })),
      ),
    ).toBe("SOURCE_ABSENT");
    expect(reason(() => gipSunsetExpiryProvider.compute(stageInput(s, fact, [], to)))).toBe(
      "SOURCE_ABSENT",
    );
    expect(reason(() => gipSunsetExpiryProvider.compute(stageInput(s, fact, [reads[0]], to)))).toBe(
      "SOURCE_ABSENT",
    );
    expect(
      reason(() => gipSunsetExpiryProvider.compute(stageInput(s, fact, [reads[1], reads[0]], to))),
    ).toBe("SOURCE_ABSENT");
    expect(
      reason(() =>
        gipSunsetExpiryProvider.compute(
          stageInput(s, fact, reads, to, { produces: [gipInstrumentKey(INSTRUMENT_B)] }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        gipSunsetExpiryProvider.compute(stageInput(s, fact, reads, to, { produces: [] })),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        gipSunsetExpiryProvider.compute(
          stageInput(s, fact, reads, to, {
            stage: { ...gipSunsetStage(INSTRUMENT_A), causal_process_id: "not-a-sunset-process" },
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    // a stage for another Instrument than the slot it was handed
    expect(
      reason(() =>
        gipSunsetExpiryProvider.compute(
          stageInput(s, fact, reads, to, {
            stage: gipSunsetStage(INSTRUMENT_B),
            produces: [gipInstrumentKey(INSTRUMENT_B)],
            prior: new Map([[gipInstrumentKey(INSTRUMENT_B), fact]]),
          }),
        ),
      ),
    ).toBe("SOURCE_INVALID");
  });

  it("an Instrument that is malformed, carries no sunset, or is not active holds the stage and is never reinterpreted", async () => {
    const { s, fact, reads } = await facts();
    const asFact = (value: unknown) => ({ ...fact, value });
    const base = fact.value as GovernanceInstrument;
    const noSunset = omit(base, "sunset_condition");
    expect(
      reason(() =>
        gipSunsetExpiryProvider.compute(
          stageInput(s, asFact({ ...base, extra: 1 }), reads, SUNSET_AT),
        ),
      ),
    ).toBe("SOURCE_INVALID");
    expect(
      reason(() =>
        gipSunsetExpiryProvider.compute(stageInput(s, asFact(noSunset), reads, SUNSET_AT)),
      ),
    ).toBe("SOURCE_INVALID");
    for (const lifecycle_status of [
      "proposed",
      "pending",
      "suspended",
      "superseded",
      "repealed",
      "terminated",
      "expired",
    ] as const)
      expect(
        reason(() =>
          gipSunsetExpiryProvider.compute(
            stageInput(s, asFact({ ...base, lifecycle_status }), reads, SUNSET_AT),
          ),
        ),
        lifecycle_status,
      ).toBe("SOURCE_INVALID");
  });

  it("the derivation is the one transition: active → expired of an Instrument carrying a sunset, nothing else", () => {
    const base = sunsetInstrument();
    const out = deriveSunsetExpiry(base);
    expect(out.ok && out.value).toEqual({ ...base, lifecycle_status: "expired" });
    expect(deriveSunsetExpiry({ ...base, lifecycle_status: "expired" }).ok).toBe(false);
    expect(deriveSunsetExpiry({ ...base, lifecycle_status: "suspended" }).ok).toBe(false);
    const plain = omit(base, "sunset_condition");
    expect(deriveSunsetExpiry(plain).ok).toBe(false);
  });
});

describe("a stage commits only inside an opened transaction that engaged this exact boundary", () => {
  const OPEN = { role: "role.player", permission: "permission.player_choice.commit" } as const;
  const PUBLICATION = { basis: "fixture-basis", secrecy: "fixture-visibility" } as const;

  /** A raw kernel group opening a transaction, exactly the shape the coordinator publishes, built by hand. */
  function rawAuthority(store: CampaignStore, id: string, requested: unknown): CommitGroup {
    const stateFact = store.getFact(TEMPORAL_STATE_KEY)!;
    const state = TemporalStateSchema.parse(stateFact.value);
    return {
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: transactionAuthorityGroupId(id),
      intent_id: transactionAuthorityIntentId(id),
      owner: OWNER_TEMPORAL_KERNEL,
      facet: FACET_TEMPORAL_COORDINATION,
      cause: transactionCause(id),
      rule: factKind("temporal_state").rule,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [{ key: TEMPORAL_STATE_KEY, version: stateFact.version }],
      depends_on: [stateFact.provenance.group_id],
      writes: [
        {
          key: temporalTransactionAuthorityKey(id),
          owner: OWNER_TEMPORAL_KERNEL,
          facet: FACET_TEMPORAL_COORDINATION,
          value: {
            transaction_id: id,
            cause: `cause-${id}`,
            trigger: { kind: "fixture-advance-request", ref: `ref-${id}` },
            continues: null,
            opening: { basis_time: state.canonical_time, state_version: stateFact.version },
            requested,
            context: OPEN,
            publication: PUBLICATION,
          } as never,
          unit: null,
          basis: PUBLICATION.basis,
          secrecy: PUBLICATION.secrecy,
          expected_version: 0,
        },
      ],
    };
  }

  /** A raw stage with the derived identity, naming `cause`, with the correct reads; `over` overrides any part. */
  function rawStage(
    s: SunsetSeeded,
    cause: string,
    authorityGroup: string[],
    over: Partial<CommitGroup> = {},
    value?: unknown,
  ): CommitGroup {
    const store = s.campaign.store;
    const fact = instrumentOf(s)!;
    const office = store.getFact("gip/institution/institution-court-1/office/office-magistrate-1")!;
    const binding = store.getFact(
      "gip/institution/institution-court-1/office/office-magistrate-1/scope-binding/scope-binding-a-1",
    )!;
    const derived = deriveSunsetExpiry(fact.value as GovernanceInstrument);
    return {
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: stageGroupId(gipSunsetStage(INSTRUMENT_A)),
      intent_id: stageIntentId(gipSunsetStage(INSTRUMENT_A)),
      owner: OWNER_GIP,
      facet: "gip_institution_identity",
      cause,
      rule: GIP_INSTRUMENT_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [
        { key: office.key, version: office.version },
        { key: binding.key, version: binding.version },
      ],
      depends_on: [office.provenance.group_id, binding.provenance.group_id, ...authorityGroup],
      writes: [
        {
          key: gipInstrumentKey(INSTRUMENT_A),
          owner: OWNER_GIP,
          facet: "gip_institution_identity",
          value: (value ?? (derived as any).value) as never,
          unit: null,
          basis: fact.basis,
          secrecy: fact.secrecy,
          expected_version: fact.version,
        },
      ],
      ...over,
    };
  }

  it("a stage with no durable authority, copied identity under an arbitrary cause, or no authority dependency is refused", async () => {
    const s = await registered();
    const head = s.campaign.store.head();
    expect(await codeOf(s.campaign.store.commit(rawStage(s, transactionCause("ghost"), [])))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await codeOf(s.campaign.store.commit(rawStage(s, "not-a-transaction", [])))).toBe(
      "REFERENCE_INVALID",
    );
    // wrong group and intent identity (not derived from the StageKey)
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawStage(s, transactionCause("ghost"), [], { group_id: "g-x", intent_id: "i-x" }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    untouched(s, head);
  });

  it("a genuine authority that did not engage the sunset refuses the stage: a target before the sunset, a condition naming another boundary", async () => {
    const s = await registered();
    for (const [id, requested] of [
      ["tx-mid", { target: SUNSET_MID, condition: null }],
      ["tx-before", { target: at(SUNSET_AT.value - 1), condition: null }],
      [
        "tx-other-condition",
        {
          target: null,
          condition: {
            kind: "STOP_AFTER_BOUNDARY",
            object_id: "some-other-object",
            boundary_id: "b",
          },
        },
      ],
    ] as const) {
      await must(s.campaign.store.commit(rawAuthority(s.campaign.store, id, requested)));
      const head = s.campaign.store.head();
      const authority = s.campaign.store.getFact(temporalTransactionAuthorityKey(id))!;
      const stage = rawStage(s, transactionCause(id), [authority.provenance.group_id]);
      expect(await codeOf(s.campaign.store.commit(stage)), id).toBe("REFERENCE_INVALID");
      untouched(s, head);
      // (a later transaction cannot be opened over a held one; the next case uses a fresh campaign)
      break;
    }
  });

  it.each([
    [
      "a stage whose transaction target is before the sunset",
      { target: SUNSET_MID, condition: null },
    ],
    [
      "a stage whose transaction condition names another object",
      {
        target: null,
        condition: {
          kind: "STOP_AFTER_BOUNDARY",
          object_id: "other",
          boundary_id: gipSunsetBoundaryId(INSTRUMENT_A),
        },
      },
    ],
    [
      "a stage whose transaction condition names another boundary",
      {
        target: null,
        condition: {
          kind: "STOP_AFTER_BOUNDARY",
          object_id: gipSunsetObjectId(INSTRUMENT_A),
          boundary_id: "other",
        },
      },
    ],
  ] as const)("%s is refused", async (_name, requested) => {
    const s = await registered();
    await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-raw", requested)));
    const head = s.campaign.store.head();
    const authority = s.campaign.store.getFact(temporalTransactionAuthorityKey("tx-raw"))!;
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawStage(s, transactionCause("tx-raw"), [authority.provenance.group_id]),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    untouched(s, head);
  });

  describe("with a genuinely engaging authority, the value and the pins are still judged", () => {
    const engaging = { target: SUNSET_LATER, condition: null };
    async function opened() {
      const s = await registered();
      await must(s.campaign.store.commit(rawAuthority(s.campaign.store, "tx-raw", engaging)));
      const authority = s.campaign.store.getFact(temporalTransactionAuthorityKey("tx-raw"))!;
      return { s, authority: [authority.provenance.group_id], cause: transactionCause("tx-raw") };
    }

    it.each([
      ["lifecycle becomes repealed", { lifecycle_status: "repealed" }],
      ["lifecycle becomes terminated", { lifecycle_status: "terminated" }],
      ["lifecycle becomes superseded", { lifecycle_status: "superseded" }],
      ["lifecycle stays active", {}],
      [
        "validity_by_order is rewritten alongside the expiry",
        { lifecycle_status: "expired", validity_by_order: [] },
      ],
      [
        "an order's validity is changed alongside the expiry",
        {
          lifecycle_status: "expired",
          validity_by_order: [{ governing_order_ref: "order-x", validity_status: "void" }],
        },
      ],
      [
        "operative_effect changes alongside the expiry",
        { lifecycle_status: "expired", operative_effect: "prohibition" },
      ],
      [
        "the authority basis changes alongside the expiry",
        { lifecycle_status: "expired", authority_basis_ref: "basis-x" },
      ],
      [
        "the term is moved alongside the expiry",
        { lifecycle_status: "expired", sunset_condition: OTHER_SUNSET_AT },
      ],
      [
        "the term is dropped alongside the expiry",
        { lifecycle_status: "expired", sunset_condition: undefined },
      ],
    ] as const)("%s: refused", async (_name, patch) => {
      const { s, authority, cause } = await opened();
      const head = s.campaign.store.head();
      const base = instrumentOf(s)!.value as GovernanceInstrument;
      const value = Object.fromEntries(
        Object.entries({ ...base, ...patch }).filter(([, v]) => v !== undefined),
      );
      const r = await s.campaign.store.commit(rawStage(s, cause, authority, {}, value));
      expect(r.ok, _name).toBe(false);
      untouched(s, head);
    });

    it("an expiry committed with other labels than the Instrument carries is refused", async () => {
      const { s, authority, cause } = await opened();
      const head = s.campaign.store.head();
      const stage = rawStage(s, cause, authority);
      expect(
        await codeOf(
          s.campaign.store.commit({
            ...stage,
            writes: [{ ...stage.writes[0]!, basis: "other-basis" }],
          }),
        ),
      ).toBe("VALUE_INVALID");
      expect(
        await codeOf(
          s.campaign.store.commit({
            ...stage,
            writes: [{ ...stage.writes[0]!, secrecy: "other" }],
          }),
        ),
      ).toBe("VALUE_INVALID");
      expect(
        await codeOf(
          s.campaign.store.commit({ ...stage, writes: [{ ...stage.writes[0]!, unit: "u" }] }),
        ),
      ).toBe("VALUE_INVALID");
      untouched(s, head);
    });

    it("an expiry that does not pin exactly the source office and the Scope Binding, in order and at their versions, is refused", async () => {
      const { s, authority, cause } = await opened();
      const head = s.campaign.store.head();
      const stage = rawStage(s, cause, authority);
      const [office, binding] = stage.reads;
      for (const variant of [
        { reads: [] },
        { reads: [binding!, office!] },
        { reads: [office!] },
        { reads: [{ ...office!, version: 9 }, binding!] },
        { depends_on: authority },
        { depends_on: [...stage.depends_on].reverse() },
      ] as Partial<CommitGroup>[])
        expect((await s.campaign.store.commit({ ...stage, ...variant })).ok).toBe(false);
      untouched(s, head);
    });

    it("an expiry under the superseded twenty-first-slice citation, or a foreign owner or facet, is refused", async () => {
      const { s, authority, cause } = await opened();
      const head = s.campaign.store.head();
      const stage = rawStage(s, cause, authority);
      expect(
        await codeOf(
          s.campaign.store.commit({ ...stage, rule: GIP_INSTRUMENT_RULE_TWENTY_FIRST_SLICE }),
        ),
      ).toBe("REFERENCE_INVALID");
      expect(
        await codeOf(
          s.campaign.store.commit({ ...stage, owner: "production", facet: "production_state" }),
        ),
      ).not.toBe("OK");
      untouched(s, head);
    });

    it("an Instrument with no sunset is never expired by any group", async () => {
      const s = await seededSunsetCampaign(tempDir());
      const plain = omit(sunsetInstrument(), "sunset_condition");
      await must(s.gip.establishGovernanceInstrument({ ...gipPublication(5), instrument: plain }));
      const fact = instrumentOf(s)!;
      const office = s.campaign.store.getFact(
        "gip/institution/institution-court-1/office/office-magistrate-1",
      )!;
      const binding = s.campaign.store.getFact(
        "gip/institution/institution-court-1/office/office-magistrate-1/scope-binding/scope-binding-a-1",
      )!;
      const head = s.campaign.store.head();
      const raw = (n: number, over: Partial<CommitGroup> = {}): CommitGroup => ({
        campaign_id: FIXTURE_CAMPAIGN,
        group_id: `plain-g-${n}`,
        intent_id: `plain-i-${n}`,
        owner: OWNER_GIP,
        facet: "gip_institution_identity",
        cause: `plain-c-${n}`,
        rule: GIP_INSTRUMENT_RULE,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [
          { key: office.key, version: office.version },
          { key: binding.key, version: binding.version },
        ],
        depends_on: [office.provenance.group_id, binding.provenance.group_id],
        writes: [
          {
            key: fact.key,
            owner: OWNER_GIP,
            facet: "gip_institution_identity",
            value: { ...(fact.value as object), lifecycle_status: "expired" } as never,
            unit: null,
            basis: fact.basis,
            secrecy: fact.secrecy,
            expected_version: 1,
          },
        ],
        ...over,
      });
      expect(await codeOf(s.campaign.store.commit(raw(1)))).toBe("AMENDMENT_NOT_SUPPORTED");
      expect(s.campaign.store.head()).toEqual(head);
      expect(lifecycle(s)).toBe("active");
    });
  });

  it("a direct raw status mutation is refused for every status, with or without the stage identity: lifecycle changes only by the earned stage", async () => {
    const s = await registered();
    const head = s.campaign.store.head();
    const fact = instrumentOf(s)!;
    const office = s.campaign.store.getFact(
      "gip/institution/institution-court-1/office/office-magistrate-1",
    )!;
    const binding = s.campaign.store.getFact(
      "gip/institution/institution-court-1/office/office-magistrate-1/scope-binding/scope-binding-a-1",
    )!;
    let n = 0;
    for (const lifecycle_status of [
      "proposed",
      "pending",
      "active",
      "suspended",
      "superseded",
      "repealed",
      "terminated",
      "expired",
    ]) {
      for (const identity of [true, false]) {
        n++;
        const stage = gipSunsetStage(INSTRUMENT_A);
        const group: CommitGroup = {
          campaign_id: FIXTURE_CAMPAIGN,
          group_id: identity ? stageGroupId(stage) : `mut-g-${n}`,
          intent_id: identity ? stageIntentId(stage) : `mut-i-${n}`,
          owner: OWNER_GIP,
          facet: "gip_institution_identity",
          cause: identity ? transactionCause("tx-forged") : `mut-c-${n}`,
          rule: GIP_INSTRUMENT_RULE,
          authority: { ...CANON_WRITE_AUTHORITY },
          reads: [
            { key: office.key, version: office.version },
            { key: binding.key, version: binding.version },
          ],
          depends_on: [office.provenance.group_id, binding.provenance.group_id],
          writes: [
            {
              key: fact.key,
              owner: OWNER_GIP,
              facet: "gip_institution_identity",
              value: { ...(fact.value as object), lifecycle_status } as never,
              unit: null,
              basis: fact.basis,
              secrecy: fact.secrecy,
              expected_version: 1,
            },
          ],
        };
        expect((await s.campaign.store.commit(group)).ok, `${lifecycle_status}/${identity}`).toBe(
          false,
        );
      }
    }
    untouched(s, head);
    expect(verifyGipIntegrity(s.campaign.store)).toEqual([]);
  });
});

describe("an unavailable provider holds the dependent stage: time reaches the boundary, the Instrument stays active, and the held work completes once", () => {
  it("without the GIP stage provider the transaction stops DEPENDENCY_UNRESOLVED at the sunset, nothing is credited, and a provider-equipped continuation expires it", async () => {
    const s = await seededSunsetCampaign(tempDir(), { providers: [] });
    await establishSunset(s);
    const held = await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_LATER)));
    expect(held.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(held.transaction.outcome.unresolved_dependents.map((u) => [u.stage, u.reason])).toEqual([
      [gipSunsetStage(INSTRUMENT_A), "PROVIDER_ABSENT"],
    ]);
    // the boundary is the stop, not the requested horizon; the stage is not credited; the Instrument is untouched
    expect(held.transaction.outcome.actual_stop).toEqual(SUNSET_AT);
    expect(held.transaction.stages).toEqual([]);
    expect(lifecycle(s)).toBe("active");
    expect(instrumentOf(s)!.version).toBe(1);
    expect(index(s)).toHaveLength(1);
    expect(s.campaign.store.getFact(sunsetKey)!.version).toBe(1);
    // unrelated progress cannot bypass the held work (a continuation is consumed or it stays)
    expect(await codeOf(s.coordinator.advance(advanceTo("tx-2", SUNSET_LATER)))).toBe(
      "CONTINUATION_HELD",
    );

    // the provider becomes available: the SAME held request is continued and the Instrument expires once, at the sunset
    const equipped = sunsetCoordinator(s.campaign.store);
    const done = await must(
      equipped.continueRemainder({
        transaction_id: "tx-3",
        cause: "cause-tx-3",
        trigger: { kind: "player-ooc-advance-choice", ref: "choice-tx-3" },
        context: { role: "role.player", permission: "permission.player_choice.commit" },
        publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
      }),
    );
    expect(done.transaction.outcome.actual_stop).toEqual(SUNSET_LATER);
    expect(done.transaction.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(done.transaction.outcome.remainder).toBeNull();
    expect(done.transaction.stages.map((x) => x.stage)).toEqual([gipSunsetStage(INSTRUMENT_A)]);
    expect(done.transaction.boundaries_crossed.map((b) => b.at)).toEqual([SUNSET_AT]);
    expect(lifecycle(s)).toBe("expired");
    expect(instrumentOf(s)!.version).toBe(2);
    expect(index(s)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a conflicting replay is refused: nothing is silently reused or rewritten", () => {
  it("the same transaction identity with another target, cause or provenance is a conflict", async () => {
    const s = await registered();
    await must(s.coordinator.advance(advanceTo("tx-1", SUNSET_AT)));
    const head = s.campaign.store.head();
    expect(await codeOf(s.coordinator.advance(advanceTo("tx-1", SUNSET_LATER)))).toBe(
      "TRANSACTION_CONFLICT",
    );
    expect(
      await codeOf(s.coordinator.advance(advanceTo("tx-1", SUNSET_AT, { cause: "another-cause" }))),
    ).toBe("TRANSACTION_CONFLICT");
    expect(
      await codeOf(
        s.coordinator.advance(
          advanceTo("tx-1", SUNSET_AT, {
            publication: { basis: "other", secrecy: "fixture-visibility" },
          }),
        ),
      ),
    ).toBe("TRANSACTION_CONFLICT");
    expect(s.campaign.store.head()).toEqual(head);
    expect(lifecycle(s)).toBe("expired");
  });
});

const OTHER_OBJ = gipSunsetObjectId(INSTRUMENT_B);
const OTHER_BOUNDARY = gipSunsetBoundaryId(INSTRUMENT_B);

describe("a condition-only transaction engages the sunset only through a named boundary at or after it", () => {
  const authority = (condition: unknown) =>
    ({
      opening: { basis_time: SUNSET_START, state_version: 1 },
      requested: { target: null, condition },
    }) as never;
  // another owner's REAL, schema-valid object holding an earned boundary at `when` (here, another Instrument's sunset object)
  const named = (_id: string, _boundary: string, when: typeof SUNSET_AT) =>
    new Map([
      [
        temporalObjectKey(gipSunsetObjectId(INSTRUMENT_B)),
        {
          value: gipSunsetTemporalObject(sunsetInstrument(INSTRUMENT_B, when), SUNSET_START),
        } as never,
      ],
    ]);
  const cond = (object_id: string, boundary_id: string) => ({
    kind: "STOP_AFTER_BOUNDARY",
    object_id,
    boundary_id,
  });

  it("another owner's boundary later than (or at) the sunset engages it; an earlier one, an unknown one, a retired one or no condition does not", () => {
    const facts = (when: typeof SUNSET_AT) => named("obj-x", "b-x", when);
    expect(
      sunsetReachViolation(
        authority(cond(OTHER_OBJ, OTHER_BOUNDARY)),
        INSTRUMENT_A,
        SUNSET_AT,
        facts(at(250)),
      ),
    ).toBeNull();
    expect(
      sunsetReachViolation(
        authority(cond(OTHER_OBJ, OTHER_BOUNDARY)),
        INSTRUMENT_A,
        SUNSET_AT,
        facts(SUNSET_AT),
      ),
    ).toBeNull();
    expect(
      sunsetReachViolation(
        authority(cond(OTHER_OBJ, OTHER_BOUNDARY)),
        INSTRUMENT_A,
        SUNSET_AT,
        facts(at(140)),
      ),
    ).not.toBeNull();
    expect(
      sunsetReachViolation(
        authority(cond(OTHER_OBJ, "other")),
        INSTRUMENT_A,
        SUNSET_AT,
        facts(at(250)),
      ),
    ).not.toBeNull();
    expect(
      sunsetReachViolation(
        authority(cond("obj-y", OTHER_BOUNDARY)),
        INSTRUMENT_A,
        SUNSET_AT,
        facts(at(250)),
      ),
    ).not.toBeNull();
    expect(
      sunsetReachViolation(authority(null), INSTRUMENT_A, SUNSET_AT, facts(at(250))),
    ).not.toBeNull();
    expect(
      sunsetReachViolation(
        authority(cond(gipSunsetObjectId(INSTRUMENT_A), gipSunsetBoundaryId(INSTRUMENT_A))),
        INSTRUMENT_A,
        SUNSET_AT,
        new Map(),
      ),
    ).toBeNull();
  });
});
