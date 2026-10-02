/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and state values */
// Diplomacy External Recognition Core Backbone Foundation (seventeenth slice) — INITIAL AUTHORED ESTABLISHMENT ONLY of one
// Diplomacy-owned External Recognition (WS-008 v1.1 §6 with the §29.2 / §29.3 overlay), through the existing owner registry,
// admission, commit receipt, persistence and recovery machinery. Every reference is opaque and never dereferenced; no foreign
// fact is created from a reference; no reciprocal, Relation Edge, Instrument, Clause, Binding Entry or score exists; every
// post-establishment change is refused; `dependency_refs[]` is pinned through the existing group reads / dependencies only
// where the record is actually derived from mutable implemented owner state.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-02/07/16; IM-03, IM-06, IM-11, IM-12, IM-17. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-008. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  LISTED_RECOGNITION_STATUSES,
  diplomacyRecognitionKey,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  DIPLOMACY_RECOGNITION_RULE,
  DiplomacyAdapter,
  GIP_OFFICE_RULE,
  GIP_RULE,
  createFileCampaign,
  diplomacyGroupCheck,
  diplomacyObjectViolation,
  factKind,
  readExternalRecognition,
  verifyDiplomacyIntegrity,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  INSTRUMENT_OR_ACT_REF_A,
  OFFICE_MAGISTRATE,
  RECOGNITION_A,
  RECOGNITION_AUTHORITY_BASIS_REF_A,
  RECOGNITION_B,
  RECOGNITION_C,
  RECOGNITION_PROVENANCE_REF_A,
  RECOGNIZER_REF_A,
  RECOGNIZER_REF_B,
  REFERENT_REF_A,
  REFERENT_REF_B,
  SUCCESSOR_RULE_REF_A,
  dormantObject,
  diplomacyPublication,
  externalRecognition,
  fullExternalRecognition,
  group,
  institutionIdentity,
  officeAuthorityLocus,
  officeRef,
  temporalPublication,
  write,
} from "@immortalis/testkit";
import {
  diplomacyFacts,
  establishExternalRecognition,
  establishGipAuthority,
  seededDiplomacyCampaign,
} from "../support/diplomacy.ts";
import { seedInstitutionLikeNeighbors } from "../support/gip.ts";
import { codeOf, must, seededTemporalCampaign, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import {
  UNREGISTERED_DIPLOMACY_KEY_PROBES,
  expectedAdapterMethods,
  expectedKindIds,
} from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const key = (id = RECOGNITION_A) => diplomacyRecognitionKey(id);
const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);

/** A raw group exactly as an unauthorized (or sloppy) caller might build it: no registry, no adapter. */
function raw(
  n: number,
  value: unknown,
  over: Partial<CommitGroup> & { key?: string; expected_version?: number } = {},
): CommitGroup {
  const { key: k, expected_version, ...g } = over;
  const owner = g.owner ?? "diplomacy";
  const facet = g.facet ?? "diplomacy_external_recognition";
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(k ?? key(), value as never, {
        owner,
        facet,
        basis: "diplomacy-fixture-basis",
        secrecy: "diplomacy-fixture-visibility",
        ...(expected_version === undefined ? {} : { expected_version }),
      }),
    ],
    { owner, facet, rule: DIPLOMACY_RECOGNITION_RULE, ...g },
  );
}

describe("one External Recognition can be established, exactly as authored", () => {
  it("a complete record establishes as one create-only ADVANCING write under the sole Diplomacy owner, with every required field and continuity_basis", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    const recognition = externalRecognition(RECOGNITION_A, {
      continuity_basis: "represented_entity",
    });
    const out = await must(
      s.diplomacy.establishExternalRecognition({ ...diplomacyPublication(1), recognition }),
    );
    expect(out.replayed).toBe(false);
    const fact = s.campaign.store.getFact(key())!;
    expect([fact.owner, fact.facet, fact.version]).toEqual([
      "diplomacy",
      "diplomacy_external_recognition",
      1,
    ]);
    expect(fact.value).toEqual(recognition);
    expect(fact.provenance.rule).toEqual(DIPLOMACY_RECOGNITION_RULE);
    expect(factKind("diplomacy_external_recognition").lifecycle).toBe("ADVANCING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the committed group wrote exactly one create-only key, read nothing and depended on nothing: a baseline invents no dependency", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1);
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.writes.map((w) => [w.key, w.expected_version])).toEqual([[key(), 0]]);
    expect(g.reads).toEqual([]);
    expect(g.depends_on).toEqual([]);
    expect(g.rule).toEqual(DIPLOMACY_RECOGNITION_RULE);
    expect(g.authority).toEqual({ ...CANON_WRITE_AUTHORITY });
    expect([g.owner, g.facet]).toEqual(["diplomacy", "diplomacy_external_recognition"]);
  });

  it("withdrawal_or_supersession_condition may be absent or present, and successor_rule_ref may be absent and is preserved when authored, without renaming", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1, RECOGNITION_A);
    await must(
      s.diplomacy.establishExternalRecognition({
        ...diplomacyPublication(2),
        recognition: fullExternalRecognition(RECOGNITION_B),
      }),
    );
    const bare = s.campaign.store.getFact(key(RECOGNITION_A))!.value as any;
    const full = s.campaign.store.getFact(key(RECOGNITION_B))!.value as any;
    for (const f of [
      "withdrawal_or_supersession_condition",
      "successor_rule_ref",
      "dependency_refs",
    ])
      expect(f in bare, `bare ${f}`).toBe(false);
    expect(full.successor_rule_ref).toBe(SUCCESSOR_RULE_REF_A);
    expect(full.withdrawal_or_supersession_condition).toBe(
      fullExternalRecognition().withdrawal_or_supersession_condition,
    );
    expect("dependency_refs" in full).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every source-listed recognition_status round-trips exactly, and an unlisted named status is stored as authored, never normalized or rejected", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    const statuses = [...LISTED_RECOGNITION_STATUSES, "recognized_with_reservations", "Recognized"];
    for (const status of statuses) {
      n++;
      await establishExternalRecognition(s, n, `status-${n}`, { recognition_status: status });
    }
    n = 0;
    for (const status of statuses) {
      n++;
      const typed = s.diplomacy.externalRecognition(`status-${n}`)!;
      expect(typed.value.recognition_status).toBe(status);
      expect((typed.fact.value as any).recognition_status).toBe(status);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("continuity_basis is preserved exactly and is not narrowed to the example values", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    const bases = ["personal", "office", "represented_entity", "dynastic_line", "Treaty Successor"];
    for (const basis of bases) {
      n++;
      await establishExternalRecognition(s, n, `basis-${n}`, { continuity_basis: basis });
    }
    n = 0;
    for (const basis of bases) {
      n++;
      expect(s.diplomacy.externalRecognition(`basis-${n}`)!.value.continuity_basis).toBe(basis);
    }
  });

  it("recognition_scope (one scalar or object), effective_from (one scalar) and withdrawal_or_supersession_condition (any canonical JSON value) are carried exactly as authored, and schedule or evaluate nothing", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const authored = [
      {
        recognition_scope: "one scope",
        effective_from: "after the harvest",
        withdrawal_or_supersession_condition: "when the referent dissolves",
      },
      {
        recognition_scope: { region: "west", exceptions: ["a", "b"], depth: 2 },
        effective_from: 1204,
        withdrawal_or_supersession_condition: ["on succession", { or: "supersession" }],
      },
      { recognition_scope: { era: "third", year: 4 }, effective_from: true },
      { recognition_scope: 0.9, effective_from: null, withdrawal_or_supersession_condition: null },
      { recognition_scope: "", effective_from: false, withdrawal_or_supersession_condition: "" },
    ] as const;
    let n = 0;
    for (const over of authored) {
      n++;
      await establishExternalRecognition(s, n, `value-${n}`, over as never);
    }
    n = 0;
    for (const over of authored) {
      n++;
      const typed = s.diplomacy.externalRecognition(`value-${n}`)!;
      for (const [field, value] of Object.entries(over)) {
        expect((typed.value as any)[field], `${n} ${field}`).toEqual(value);
        expect((typed.fact.value as any)[field], `${n} ${field} (fact)`).toEqual(value);
      }
      // absent stays absent
      expect("withdrawal_or_supersession_condition" in typed.value).toBe(
        "withdrawal_or_supersession_condition" in over,
      );
    }
    expect(s.campaign.verify()).toEqual([]);
    // nothing of the temporal kernel was touched or created
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("temporal/") || f.owner === "temporal_kernel"),
    ).toEqual([]);
  });

  it("the recognizer's direction is preserved and no reciprocal record appears; the opposite direction is a separate act with its own identity", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1, RECOGNITION_A, {
      recognizer_ref: RECOGNIZER_REF_A,
      recognized_referent_ref: REFERENT_REF_A,
    });
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key(RECOGNITION_A)]);
    const v = s.diplomacy.externalRecognition(RECOGNITION_A)!.value;
    expect([v.recognizer_ref, v.recognized_referent_ref]).toEqual([
      RECOGNIZER_REF_A,
      REFERENT_REF_A,
    ]);
    expect(s.diplomacy.externalRecognition(RECOGNITION_B)).toBeUndefined();
    // only an explicit, separately authored act records the opposite direction
    await establishExternalRecognition(s, 2, RECOGNITION_B, {
      recognizer_ref: REFERENT_REF_A,
      recognized_referent_ref: RECOGNIZER_REF_A,
      recognition_status: "explicit_nonrecognition",
    });
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key(RECOGNITION_A), key(RECOGNITION_B)]);
    expect(s.diplomacy.externalRecognition(RECOGNITION_A)!.value).toEqual(v);
  });
});

describe("references are opaque authored values: they mint no foreign fact and are never dereferenced", () => {
  it("references that name real facts of other owners (a GIP office, a world locus, a Named Actor) change nothing and are not read", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s);
    const everything = () => structuredClone(s.campaign.store.listFacts());
    const before = everything();
    const spy = spyStore(s.campaign.store);
    const diplomacy = new DiplomacyAdapter(spy.store);
    await must(
      diplomacy.establishExternalRecognition({
        ...diplomacyPublication(10),
        recognition: externalRecognition(RECOGNITION_A, {
          recognizer_ref: magistrateKey, // a real committed GIP office: not restricted to, nor resolved as, an office
          recognized_referent_ref: "world/fixture-world/locus/fixture-locus",
          authority_basis_ref: courtKey,
          instrument_or_act_ref: "actor/some-actor/capability/c1",
          provenance_ref: officeRef(),
          successor_rule_ref: "kti/object/o1",
        }),
      }),
    );
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    const after = everything();
    expect(after.filter((f) => !f.key.startsWith("diplomacy/"))).toEqual(before);
    expect(after.filter((f) => f.key.startsWith("diplomacy/")).map((f) => f.key)).toEqual([key()]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("recognizer_ref is not restricted to a GIP office or any party class: arbitrary authored references establish", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    for (const ref of [
      "a-named-faction",
      "a-person",
      "framework-charter-1",
      "gip/institution/i/office/o",
    ]) {
      n++;
      await establishExternalRecognition(s, n, `ref-${n}`, { recognizer_ref: ref });
      expect(s.diplomacy.externalRecognition(`ref-${n}`)!.value.recognizer_ref).toBe(ref);
    }
  });

  it("authority_basis_ref, instrument_or_act_ref and provenance_ref stay distinct, opaque and exactly as authored; no Diplomatic Instrument is manufactured", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1);
    const v = s.diplomacy.externalRecognition(RECOGNITION_A)!.value;
    expect([v.authority_basis_ref, v.instrument_or_act_ref, v.provenance_ref]).toEqual([
      RECOGNITION_AUTHORITY_BASIS_REF_A,
      INSTRUMENT_OR_ACT_REF_A,
      RECOGNITION_PROVENANCE_REF_A,
    ]);
    // the engine's own rule/spec provenance is a different thing from the authored provenance_ref
    const fact = s.campaign.store.getFact(key())!;
    expect(fact.provenance.rule).toEqual(DIPLOMACY_RECOGNITION_RULE);
    expect(fact.provenance.rule).not.toEqual(v.provenance_ref);
    expect(diplomacyFacts(s)).toHaveLength(1);
  });
});

describe("retrieval is direct and keyed", () => {
  it("returns the exact one record by recognition_id without listing or scanning, among many unrelated records and owners", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    for (let i = 1; i <= 12; i++)
      await establishExternalRecognition(s, i, `bulk-${i}`, {
        recognizer_ref: `recognizer-${i % 3}`,
        recognized_referent_ref: `referent-${i % 4}`,
      });
    await establishExternalRecognition(s, 40, RECOGNITION_A);
    const spy = spyStore(s.campaign.store);
    const typed = readExternalRecognition(spy.store, RECOGNITION_A)!;
    expect(typed.value).toEqual(externalRecognition(RECOGNITION_A));
    expect(typed.dependencies).toEqual({ current: true, invalidated: [] });
    expect(spy.getFacts).toEqual([key()]);
    expect(spy.listCalls()).toBe(0);
    expect(readExternalRecognition(spy.store, "never-established")).toBeUndefined();
    // establishing one more touches only its own slot
    const adapter = new DiplomacyAdapter(spy.store);
    spy.getFacts.length = 0;
    await must(
      adapter.establishExternalRecognition({
        ...diplomacyPublication(41),
        recognition: externalRecognition(RECOGNITION_B),
      }),
    );
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("silence or absence of recognition creates no record: nothing else in the engine produces one", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    expect(diplomacyFacts(s)).toEqual([]);
    expect(s.diplomacy.externalRecognition(RECOGNITION_A)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("retry and replay converge; a conflicting establishment fails closed", () => {
  it("the same intent presented twice converges on one record and one authoritative receipt", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const recognition = externalRecognition();
    const first = await must(
      s.diplomacy.establishExternalRecognition({ ...diplomacyPublication(1), recognition }),
    );
    const head = s.campaign.store.head();
    const second = await must(
      s.diplomacy.establishExternalRecognition({ ...diplomacyPublication(1), recognition }),
    );
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.receipt).toEqual(first.receipt);
    expect(s.campaign.store.head()).toEqual(head);
    expect(diplomacyFacts(s)).toHaveLength(1);
    expect(s.campaign.store.lookupReceipt(diplomacyPublication(1).intent_id)).toEqual(
      first.receipt,
    );
  });

  it("the same intent with changed content is refused as a conflict; the record is never rewritten", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    const changed = await s.diplomacy.establishExternalRecognition({
      ...diplomacyPublication(1),
      recognition: externalRecognition(RECOGNITION_A, { recognition_status: "withdrawn" }),
    });
    expect(changed.ok).toBe(false);
    expect(s.campaign.store.getFact(key())).toEqual(fact);
  });

  it("a different intent at an occupied recognition_id — equal or conflicting content — fails closed rather than overwriting", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    for (const [n, over] of [
      [2, {}],
      [3, { recognition_status: "explicit_nonrecognition" }],
      [4, { recognizer_ref: RECOGNIZER_REF_B, recognized_referent_ref: REFERENT_REF_B }],
    ] as const) {
      const out = await s.diplomacy.establishExternalRecognition({
        ...diplomacyPublication(n),
        recognition: externalRecognition(RECOGNITION_A, over),
      });
      expect(out.ok, String(n)).toBe(false);
      expect(!out.ok && out.error.code, String(n)).toBe("VERSION_CONFLICT");
    }
    expect(s.campaign.store.getFact(key())).toEqual(fact);
    expect(diplomacyFacts(s)).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("identical content under a different recognition_id is a distinct record: nothing is merged or deduplicated", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1, RECOGNITION_A);
    await establishExternalRecognition(s, 2, RECOGNITION_C);
    expect(diplomacyFacts(s)).toHaveLength(2);
  });
});

describe("dependency_refs[] is pinned through the existing group reads and dependencies, only where the record names mutable implemented owner state", () => {
  it("a record derived from a committed GIP authority registers exactly those dependencies: read at the current version, depended on through the committing group", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const identity = s.campaign.store.getFact(courtKey)!;
    await establishExternalRecognition(s, 1, RECOGNITION_A, {
      dependency_refs: [magistrateKey, courtKey],
    });
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.reads).toEqual([
      { key: magistrateKey, version: office.version },
      { key: courtKey, version: identity.version },
    ]);
    expect(g.depends_on).toEqual([office.provenance.group_id, identity.provenance.group_id]);
    expect(g.writes.map((w) => [w.key, w.expected_version])).toEqual([[key(), 0]]);
    const typed = s.diplomacy.externalRecognition(RECOGNITION_A)!;
    expect(typed.value.dependency_refs).toEqual([magistrateKey, courtKey]);
    expect(typed.dependencies).toEqual({ current: true, invalidated: [] });
    // the GIP facts are untouched: nothing was created, copied or re-resolved in the dependency's owner
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(office);
    expect(s.campaign.store.getFact(courtKey)).toEqual(identity);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("dependency_refs[] is carried exactly as authored, repeated entries included, and each distinct fact is pinned once", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    await establishExternalRecognition(s, 1, RECOGNITION_A, {
      dependency_refs: [magistrateKey, magistrateKey],
    });
    expect(s.diplomacy.externalRecognition(RECOGNITION_A)!.value.dependency_refs).toEqual([
      magistrateKey,
      magistrateKey,
    ]);
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.reads).toHaveLength(1);
    expect(g.depends_on).toHaveLength(1);
    // an authored empty array is carried as an empty array and pins nothing
    await establishExternalRecognition(s, 2, RECOGNITION_B, { dependency_refs: [] });
    expect(s.diplomacy.externalRecognition(RECOGNITION_B)!.value.dependency_refs).toEqual([]);
    const g2 = s.campaign.store.committedGroup(diplomacyPublication(2).intent_id)!;
    expect([g2.reads, g2.depends_on]).toEqual([[], []]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("naming a dependency that is not committed is refused as a missing prerequisite: nothing is created and no dependency is invented", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    const out = await s.diplomacy.establishExternalRecognition({
      ...diplomacyPublication(1),
      recognition: externalRecognition(RECOGNITION_A, { dependency_refs: [magistrateKey] }),
    });
    expect(!out.ok && out.error.code).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head()).toEqual(before);
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("a raw group must pin exactly what dependency_refs[] names: missing, wrong, extra or foreign pins are refused, and a baseline pins nothing", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const identity = s.campaign.store.getFact(courtKey)!;
    const withRefs = externalRecognition(RECOGNITION_A, { dependency_refs: [magistrateKey] });
    const pin = (k: string, f: typeof office) => ({
      reads: [{ key: k, version: f.version }],
      depends_on: [f.provenance.group_id],
    });
    const cases: [string, unknown, Partial<CommitGroup>, string][] = [
      ["refs but no pin", withRefs, {}, "REFERENCE_INVALID"],
      [
        "refs, read but no dependency",
        withRefs,
        { reads: pin(magistrateKey, office).reads },
        "REFERENCE_INVALID",
      ],
      [
        "refs, dependency but no read",
        withRefs,
        { depends_on: pin(magistrateKey, office).depends_on },
        "REFERENCE_INVALID",
      ],
      [
        "refs, stale version",
        withRefs,
        { ...pin(magistrateKey, office), reads: [{ key: magistrateKey, version: 9 }] },
        "STALE_READ",
      ],
      ["refs, pinned the wrong fact", withRefs, pin(courtKey, identity), "REFERENCE_INVALID"],
      [
        "refs, extra read and dependency",
        withRefs,
        {
          reads: [...pin(magistrateKey, office).reads, ...pin(courtKey, identity).reads],
          depends_on: [office.provenance.group_id, identity.provenance.group_id],
        },
        "REFERENCE_INVALID",
      ],
      [
        "baseline that reads a fact",
        externalRecognition(),
        pin(magistrateKey, office),
        "REFERENCE_INVALID",
      ],
      [
        "baseline that depends on a group",
        externalRecognition(),
        { depends_on: [office.provenance.group_id] },
        "REFERENCE_INVALID",
      ],
      [
        "refs to a fact that is not committed",
        externalRecognition(RECOGNITION_A, { dependency_refs: ["gip/institution/ghost/identity"] }),
        { reads: [{ key: "gip/institution/ghost/identity", version: 0 }] },
        "PREREQUISITE_MISSING",
      ],
    ];
    let n = 100;
    for (const [name, value, over, code] of cases)
      expect(await codeOf(s.campaign.store.commit(raw(++n, value, over))), name).toBe(code);
    // the lawful pin passes (control)
    expect(
      await codeOf(s.campaign.store.commit(raw(n + 1, withRefs, pin(magistrateKey, office)))),
    ).toBe("OK");
    expect(diplomacyFacts(s)).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an upstream write to a registered dependency invalidates the derived conclusion before it may be read as current (existing pinned-version invalidation)", async () => {
    // a campaign built by a store with NO admission, so that an upstream owner can move its fact forward
    const dir = tempDir();
    const store = await must(
      createFileCampaign(dir, { campaignId: FIXTURE_CAMPAIGN, owners: CANONICAL_OWNER_REGISTRY }),
    );
    const gipWrite = (
      n: number,
      k: string,
      value: unknown,
      rule: unknown,
      over: any = {},
      ev = 0,
    ) =>
      group(
        FIXTURE_CAMPAIGN,
        n,
        [
          write(k, value as never, {
            owner: "gip",
            facet: "gip_institution_identity",
            expected_version: ev,
          }),
        ],
        { owner: "gip", facet: "gip_institution_identity", rule: rule as never, ...over },
      );
    await must(store.commit(gipWrite(1, courtKey, institutionIdentity(), GIP_RULE)));
    await must(
      store.commit(
        gipWrite(2, magistrateKey, officeAuthorityLocus(), GIP_OFFICE_RULE, {
          reads: [{ key: courtKey, version: 1 }],
          depends_on: ["group-1"],
        }),
      ),
    );
    const diplomacy = new DiplomacyAdapter(store);
    await must(
      diplomacy.establishExternalRecognition({
        ...diplomacyPublication(1),
        recognition: externalRecognition(RECOGNITION_A, { dependency_refs: [magistrateKey] }),
      }),
    );
    expect(diplomacy.externalRecognition(RECOGNITION_A)!.dependencies).toEqual({
      current: true,
      invalidated: [],
    });
    // the upstream owner writes the registered dependency
    await must(
      store.commit(
        gipWrite(
          3,
          magistrateKey,
          officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
            holder_ref: "holder-ref-new",
          }),
          GIP_OFFICE_RULE,
          { reads: [{ key: courtKey, version: 1 }], depends_on: ["group-1"] },
          1,
        ),
      ),
    );
    const typed = diplomacy.externalRecognition(RECOGNITION_A)!;
    expect(typed.dependencies).toEqual({ current: false, invalidated: [magistrateKey] });
    // the conclusion is reported, never re-resolved or rewritten, and an advanced dependency is not corruption of the recognition
    expect(typed.fact.version).toBe(1);
    expect(typed.value.recognition_status).toBe("recognized");
    expect(verifyDiplomacyIntegrity(store)).toEqual([]);
    await store.close();
  });
});

describe("a missing or malformed field fails closed, and aliases never substitute", () => {
  it("through the adapter: any missing required field, any alias and any unmodelled field is refused before anything is committed", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const f of [
      "recognition_id",
      "recognizer_ref",
      "recognized_referent_ref",
      "recognition_scope",
      "recognition_status",
      "authority_basis_ref",
      "effective_from",
      "instrument_or_act_ref",
      "provenance_ref",
      "continuity_basis",
    ]) {
      const v: any = externalRecognition();
      delete v[f];
      const out = await s.diplomacy.establishExternalRecognition({
        ...diplomacyPublication(1),
        recognition: v,
      });
      expect(!out.ok && out.error.code, f).toBe("INPUT_INVALID");
      const aliased: any = { ...v, [`${f}_alias`]: externalRecognition()[f as "recognition_id"] };
      expect(
        await codeOf(
          s.diplomacy.establishExternalRecognition({
            ...diplomacyPublication(1),
            recognition: aliased,
          }),
        ),
        `${f} alias`,
      ).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.head()).toEqual(before);
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("through a raw store commit: the same contract holds, so no caller can bypass the adapter", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    const v: any = externalRecognition();
    const missing = { ...v };
    delete missing.continuity_basis;
    const aliased = { ...v, scope: v.recognition_scope };
    delete aliased.recognition_scope;
    const noScope = { ...v };
    delete noScope.recognition_scope;
    const noEffective = { ...v };
    delete noEffective.effective_from;
    for (const [name, value] of [
      ["missing continuity_basis", missing],
      ["scope alias", aliased],
      ["array-valued recognition_scope", { ...v, recognition_scope: ["a", "b"] }],
      ["structured effective_from", { ...v, effective_from: { at: "x" } }],
      ["array effective_from", { ...v, effective_from: ["x"] }],
      ["missing recognition_scope", noScope],
      ["missing effective_from", noEffective],
      ["array recognizer", { ...v, recognizer_ref: ["a"] }],
      ["closed-set junk field", { ...v, reciprocal_of: RECOGNITION_B }],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw(++n, value))), name).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });
});

describe("only the establishment is supported: every post-establishment mutation is refused", () => {
  it("the adapter exposes one recognition writer and one keyed read (the eighteenth slice adds only the claim / dispute pair): no withdrawal, suspension, supersession, succession, status-change, re-resolution or retirement method", () => {
    const methods = adapterMethods(DiplomacyAdapter);
    expect(methods).toEqual(expectedAdapterMethods("DiplomacyAdapter"));
  });

  it("every raw expected-version write to an established recognition — a status change, withdrawal, new scope, new referent — is an unsupported amendment; an occupied create is a version conflict", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    const over = (o: Record<string, unknown>) => externalRecognition(RECOGNITION_A, o as never);
    let n = 200;
    for (const [expected_version, value, code] of [
      [1, over({ recognition_status: "withdrawn" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ recognition_status: "suspended" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ recognition_scope: "another scope" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ recognized_referent_ref: REFERENT_REF_B }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ successor_rule_ref: SUCCESSOR_RULE_REF_A }), "AMENDMENT_NOT_SUPPORTED"],
      [1, externalRecognition(), "AMENDMENT_NOT_SUPPORTED"], // even an unchanged re-statement
      [2, over({ recognition_status: "withdrawn" }), "VERSION_CONFLICT"],
      [0, over({ recognition_status: "withdrawn" }), "VERSION_CONFLICT"],
      [0, externalRecognition(), "VERSION_CONFLICT"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, value, { expected_version }))),
        `${expected_version} ${JSON.stringify(value)}`,
      ).toBe(code);
    expect(s.campaign.store.getFact(key())).toEqual(fact);
  });

  it("admission authorizes only a single-write recognition group: an extra write, a different key space or an unrelated value is refused", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const two = group(
      FIXTURE_CAMPAIGN,
      300,
      [
        write(key(), externalRecognition() as never, {
          owner: "diplomacy",
          facet: "diplomacy_external_recognition",
        }),
        write(key(RECOGNITION_B), externalRecognition(RECOGNITION_B) as never, {
          owner: "diplomacy",
          facet: "diplomacy_external_recognition",
        }),
      ],
      {
        owner: "diplomacy",
        facet: "diplomacy_external_recognition",
        rule: DIPLOMACY_RECOGNITION_RULE,
      },
    );
    expect(await codeOf(s.campaign.store.commit(two))).toBe("VALUE_INVALID");
    expect(diplomacyGroupCheck(two, { facts: new Map() } as never)?.code).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("a recognition is committed under its own citation and at the key its recognition_id derives", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    expect(
      await codeOf(s.campaign.store.commit(raw(310, externalRecognition(), { rule: GIP_RULE }))),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(311, externalRecognition(RECOGNITION_A), { key: key(RECOGNITION_B) }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });
});

describe("owner exclusivity and no collateral Diplomacy or foreign structure", () => {
  it("no other registered owner may write the recognition key space, and the Diplomacy owner may write no other owner's key space", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 400;
    for (const [owner, facet] of [
      ["gip", "gip_institution_identity"],
      ["economy", "economy_state"],
      ["world_state", "world_profile"],
      ["population", "population_state"],
      ["kti", "kti_development"],
      ["epistemic_access", "epistemic_access"],
      ["named_actor", "actor_profile"],
      ["temporal_kernel", "temporal_coordination"],
    ] as [string, string][])
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, externalRecognition(), { owner, facet }))),
        owner,
      ).toBe("KEY_NOT_ADMITTED");
    for (const foreign of [
      gipInstitutionIdentityKey("inst-by-diplomacy"),
      magistrateKey,
      "world/w/profile",
      "economy/demand/d1",
      "access/e1/event",
      "actor/a1/capability/c1",
      "kti/object/o1",
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, { any: "value" }, { key: foreign }))),
        foreign,
      ).toBe("KEY_NOT_ADMITTED");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(n + 1, externalRecognition(), { facet: "gip_institution_identity" }),
        ),
      ),
    ).toBe("OWNER_NOT_REGISTERED");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("no Channel, Negotiation Record, Instrument, Clause, Binding Entry, compliance or other unregistered sibling key space, and no malformed Diplomacy path, exists: each is outside every registered key space", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 500;
    for (const k of UNREGISTERED_DIPLOMACY_KEY_PROBES)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, externalRecognition(), { key: k }))),
        k,
      ).toBe("KEY_NOT_ADMITTED");
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "diplomacy").map((k) => k.id)).toEqual(
      expectedKindIds({ owner: "diplomacy" }),
    );
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("establishing a recognition writes only its own key: no GIP, World, Actor, ACS, Population, Culture, Economy, Epistemic or other foreign fact, and no objective, awareness or internal-law consequence", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    const before = structuredClone(s.campaign.store.listFacts());
    const head = s.campaign.store.head();
    await establishExternalRecognition(s, 1, RECOGNITION_A, {
      recognizer_ref: magistrateKey,
      recognized_referent_ref: "world/fixture-world/locus/fixture-locus",
      recognition_status: "recognized",
    });
    const after = s.campaign.store.listFacts();
    expect(after.length).toBe(before.length + 1);
    expect(after.filter((f) => !f.key.startsWith("diplomacy/"))).toEqual(before);
    expect(s.campaign.store.head().revision).toBe(head.revision + 1);
    // every owner's state other than Diplomacy's is byte-identical: no consequence was inferred anywhere
    for (const f of before) expect(s.campaign.store.getFact(f.key)).toEqual(f);
  });
});

describe("no clock, scheduler, watcher or polling loop: Diplomacy has no stage, close or temporal object", () => {
  const stage = (owner: string) => ({
    causal_process_id: "diplomacy-process",
    owner_operation: { owner, operation: "diplomacy-operation" },
    prospective_result_id: "diplomacy/result",
  });

  it("an object that is not Diplomacy's registers (control): the refusals below are about Diplomacy alone", async () => {
    const s = await seededTemporalCampaign(tempDir(), { objects: [] });
    expect(
      await codeOf(
        s.coordinator.registerObject({ ...temporalPublication(50), object: dormantObject() }),
      ),
    ).toBe("OK");
  });

  it("a temporal object cannot declare a Diplomacy stage, produce a Diplomacy key or be owned by Diplomacy", async () => {
    const s = await seededTemporalCampaign(tempDir(), { objects: [] });
    const base = dormantObject();
    const dep = base.dependencies[0]!;
    for (const [n, object] of [
      [51, { ...base, dependencies: [{ ...dep, stage: stage("diplomacy") }] }],
      [52, { ...base, dependencies: [{ ...dep, produces: [key()] }] }],
      [
        53,
        {
          ...base,
          dependencies: [
            {
              ...dep,
              stage: stage("diplomacy"),
              produces: [key()],
              declares_close: { name: "diplomacy-close" },
            },
          ],
        },
      ],
      [54, { ...base, owning_ref: { owner: "diplomacy", process_id: "diplomacy-process" } }],
    ] as const)
      expect(
        await codeOf(
          s.coordinator.registerObject({ ...temporalPublication(n), object: object as never }),
        ),
        String(n),
      ).toBe("REFERENCE_INVALID");
  });

  it("the guard is the one registration rule: a Diplomacy stage, Diplomacy-produced key or Diplomacy-owned object is a violation, anything else is not", () => {
    const base = dormantObject();
    const dep = base.dependencies[0]!;
    expect(diplomacyObjectViolation(base)).toBeNull();
    expect(
      diplomacyObjectViolation({ ...base, dependencies: [{ ...dep, stage: stage("diplomacy") }] }),
    ).toMatch(/no stage, close or operation/);
    expect(
      diplomacyObjectViolation({ ...base, dependencies: [{ ...dep, produces: [key()] }] }),
    ).toMatch(/no stage, close or operation/);
    expect(
      diplomacyObjectViolation({ ...base, owning_ref: { owner: "diplomacy", process_id: "p" } }),
    ).toMatch(/no temporal object/);
  });

  it("establishing a recognition registers no boundary and no temporal object, whatever its effective_from says", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1, RECOGNITION_A, {
      effective_from: "a point far in the future",
    });
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
  });
});

describe("the load-time verifier is silent on a healthy campaign", () => {
  it("a campaign with baseline and dependency-derived recognitions verifies clean", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    await establishExternalRecognition(s, 1, RECOGNITION_A);
    await establishExternalRecognition(s, 2, RECOGNITION_B, { dependency_refs: [magistrateKey] });
    expect(verifyDiplomacyIntegrity(s.campaign.store)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });
});
