/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and state values */
// Diplomacy Externalized Claim / Dispute Core Backbone Foundation (eighteenth slice) — INITIAL AUTHORED ESTABLISHMENT ONLY of one
// Diplomacy-owned externally communicated claim / dispute record (WS-008 v1.1 §7 with the §29.3 / §29.4 overlay), through the
// existing owner registry, admission, commit receipt, persistence and recovery machinery. Every reference is opaque and never
// dereferenced; no underlying claim or other foreign fact is created or mutated from a reference; no Relation Edge, Channel,
// Negotiation Record, Instrument, Clause, Binding Entry, receipt event or score exists; every post-establishment change is
// refused; `dependency_refs[]` is pinned through the existing group reads / dependencies only where the record is actually
// derived from mutable implemented owner state.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-02/16; IM-03, IM-06, IM-11, IM-12, IM-17. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-008. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  EFFECT_ON_VALUES,
  diplomacyDisputeKey,
  diplomacyRecognitionKey,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DiplomacyAdapter,
  GIP_OFFICE_RULE,
  GIP_RULE,
  createFileCampaign,
  diplomacyGroupCheck,
  factKind,
  readExternalizedClaimDispute,
  verifyDiplomacyIntegrity,
} from "@immortalis/engine";
import {
  DISPUTE_A,
  DISPUTE_ADJUDICATION_BASIS_REF_A,
  DISPUTE_B,
  DISPUTE_C,
  DISPUTE_INSTRUMENT_OR_CLAUSE_REF_A,
  DISPUTE_INTERPRETATION_ISSUE_REF_A,
  DISPUTE_PARTY_REF_A,
  DISPUTE_PARTY_REF_B,
  DISPUTE_PROVENANCE_REF_A,
  DISPUTE_UNDERLYING_SUBJECT_REF_A,
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  diplomacyPublication,
  externalRecognition,
  externalizedClaimDispute,
  fullExternalizedClaimDispute,
  group,
  institutionIdentity,
  officeAuthorityLocus,
  write,
} from "@immortalis/testkit";
import {
  diplomacyFacts,
  establishExternalRecognition,
  establishExternalizedClaimDispute,
  establishGipAuthority,
  seededDiplomacyCampaign,
} from "../support/diplomacy.ts";
import { seedInstitutionLikeNeighbors } from "../support/gip.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const key = (id = DISPUTE_A) => diplomacyDisputeKey(id);
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
  const facet = g.facet ?? "diplomacy_externalized_claim_dispute";
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
    { owner, facet, rule: DIPLOMACY_CLAIM_DISPUTE_RULE, ...g },
  );
}

describe("one Externalized Claim / Dispute can be established, exactly as authored", () => {
  it("a complete core record establishes as one create-only ADVANCING write under the existing Diplomacy owner, with every required field", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    const dispute = externalizedClaimDispute();
    const out = await must(
      s.diplomacy.establishExternalizedClaimDispute({ ...diplomacyPublication(1), dispute }),
    );
    expect(out.replayed).toBe(false);
    const fact = s.campaign.store.getFact(key())!;
    expect([fact.owner, fact.facet, fact.version]).toEqual([
      "diplomacy",
      "diplomacy_externalized_claim_dispute",
      1,
    ]);
    expect(fact.value).toEqual(dispute);
    expect(fact.provenance.rule).toEqual(DIPLOMACY_CLAIM_DISPUTE_RULE);
    expect(factKind("diplomacy_claim_dispute").lifecycle).toBe("ADVANCING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the committed group wrote exactly one create-only key, read nothing and depended on nothing: a baseline invents no dependency", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1);
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.writes.map((w) => [w.key, w.expected_version])).toEqual([[key(), 0]]);
    expect(g.reads).toEqual([]);
    expect(g.depends_on).toEqual([]);
    expect(g.rule).toEqual(DIPLOMACY_CLAIM_DISPUTE_RULE);
    expect(g.authority).toEqual({ ...CANON_WRITE_AUTHORITY });
    expect([g.owner, g.facet]).toEqual(["diplomacy", "diplomacy_externalized_claim_dispute"]);
  });

  it("every optional §7 field round-trips both present and absent, without default synthesis, and no conditional field appears on a baseline", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A);
    await must(
      s.diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(2),
        dispute: fullExternalizedClaimDispute(DISPUTE_B),
      }),
    );
    const bare = s.campaign.store.getFact(key(DISPUTE_A))!.value as any;
    const full = s.campaign.store.getFact(key(DISPUTE_B))!.value as any;
    for (const f of [
      "requested_remedy_or_demand",
      "interpretation_issue_ref",
      "instrument_or_clause_ref",
      "adjudication_basis_ref",
      "dependency_refs",
      "effect_on",
    ])
      expect(f in bare, `bare ${f}`).toBe(false);
    expect(full.requested_remedy_or_demand).toBe(
      fullExternalizedClaimDispute().requested_remedy_or_demand,
    );
    expect(full.interpretation_issue_ref).toBe(DISPUTE_INTERPRETATION_ISSUE_REF_A);
    expect(full.instrument_or_clause_ref).toBe(DISPUTE_INSTRUMENT_OR_CLAUSE_REF_A);
    expect(full.adjudication_basis_ref).toBe(DISPUTE_ADJUDICATION_BASIS_REF_A);
    for (const f of ["dependency_refs", "effect_on"]) expect(f in full, `full ${f}`).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("party_refs[] and communicated_position_entries[] retain their exact array shape: order, repeats, empties and authored entry values are untouched", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const authored = [
      {
        party_refs: [DISPUTE_PARTY_REF_B, DISPUTE_PARTY_REF_A, DISPUTE_PARTY_REF_B],
        communicated_position_entries: ["b", "a", "b", { z: 1, a: [1, 2] }, null, 0, false, []],
      },
      { party_refs: [], communicated_position_entries: [] },
      { party_refs: [DISPUTE_PARTY_REF_A], communicated_position_entries: [{ act: "protest" }] },
    ] as const;
    let n = 0;
    for (const over of authored) {
      n++;
      await establishExternalizedClaimDispute(s, n, `shape-${n}`, over as never);
    }
    n = 0;
    for (const over of authored) {
      n++;
      const typed = s.diplomacy.externalizedClaimDispute(`shape-${n}`)!;
      expect(typed.value.party_refs).toEqual(over.party_refs);
      expect(typed.value.communicated_position_entries).toEqual(over.communicated_position_entries);
      expect((typed.fact.value as any).party_refs).toEqual(over.party_refs);
      expect((typed.fact.value as any).communicated_position_entries).toEqual(
        over.communicated_position_entries,
      );
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an open status and a singular remedy are stored as authored, never normalized, closed, defaulted or rejected for being unlisted", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const statuses = [
      "asserted",
      "denied",
      "protested",
      "reserved",
      "recognized",
      "disputed",
      "Disputed",
      "a status never listed",
      "",
      0,
      false,
      null,
      { phase: "open", detail: ["a"] },
    ];
    let n = 0;
    for (const status of statuses) {
      n++;
      await establishExternalizedClaimDispute(s, n, `status-${n}`, {
        status: status as never,
        requested_remedy_or_demand: status as never,
      });
    }
    n = 0;
    for (const status of statuses) {
      n++;
      const typed = s.diplomacy.externalizedClaimDispute(`status-${n}`)!;
      expect(typed.value.status).toEqual(status);
      expect((typed.fact.value as any).status).toEqual(status);
      expect((typed.fact.value as any).requested_remedy_or_demand).toEqual(status);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every fixed effect_on literal round-trips exactly when used, and omission of effect_on generates no default", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    for (const lit of EFFECT_ON_VALUES) {
      n++;
      await establishExternalizedClaimDispute(s, n, `effect-${n}`, { effect_on: lit });
    }
    await establishExternalizedClaimDispute(s, 10, "effect-none");
    n = 0;
    for (const lit of EFFECT_ON_VALUES) {
      n++;
      expect(s.diplomacy.externalizedClaimDispute(`effect-${n}`)!.value.effect_on).toBe(lit);
      expect((s.campaign.store.getFact(key(`effect-${n}`))!.value as any).effect_on).toBe(lit);
    }
    expect("effect_on" in (s.campaign.store.getFact(key("effect-none"))!.value as any)).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a fourth effect_on value, an alias or a case variant is refused, and no effect_on is inferred from a reference to an instrument or clause", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const bad of ["receipt", "Issuance", "broadcast_exposure", "BROADCAST_EXPOSURE", ""]) {
      expect(
        await codeOf(
          s.diplomacy.establishExternalizedClaimDispute({
            ...diplomacyPublication(1),
            dispute: { ...externalizedClaimDispute(), effect_on: bad } as never,
          }),
        ),
        bad,
      ).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.head()).toEqual(before);
    await establishExternalizedClaimDispute(s, 2, DISPUTE_A, {
      instrument_or_clause_ref: DISPUTE_INSTRUMENT_OR_CLAUSE_REF_A,
    });
    expect("effect_on" in (s.diplomacy.externalizedClaimDispute(DISPUTE_A)!.value as any)).toBe(
      false,
    );
  });

  it("no private belief, future behavior or objective truth is inferred from a communicated position: nothing but the one authored record is written", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    const before = structuredClone(s.campaign.store.listFacts());
    for (const [n, status] of [
      "asserted",
      "denied",
      "protested",
      "reserved",
      "recognized",
      "disputed",
    ].entries())
      await establishExternalizedClaimDispute(s, n + 1, `act-${n}`, {
        status,
        communicated_position_entries: [`the position: ${status}`],
      });
    const after = s.campaign.store.listFacts();
    expect(after.filter((f) => !f.key.startsWith("diplomacy/"))).toEqual(before);
    expect(after.filter((f) => f.key.startsWith("diplomacy/"))).toHaveLength(6);
    // every diplomacy fact is a claim / dispute: no belief, behavior, truth, recognition or receipt record exists
    for (const f of after.filter((f) => f.key.startsWith("diplomacy/")))
      expect(f.key).toMatch(/^diplomacy\/dispute\//);
    expect(
      after.filter((f) => f.key.startsWith("access/") || f.owner === "epistemic_access"),
    ).toEqual(before.filter((f) => f.key.startsWith("access/") || f.owner === "epistemic_access"));
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("references are opaque authored values: they mint no foreign fact and are never dereferenced", () => {
  it("references that name real facts of other owners (a GIP office, a world locus, a recognition) change nothing and are not read", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s);
    await establishExternalRecognition(s, 5, "recognition-named");
    const everything = () => structuredClone(s.campaign.store.listFacts());
    const before = everything();
    const spy = spyStore(s.campaign.store);
    const diplomacy = new DiplomacyAdapter(spy.store);
    await must(
      diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(10),
        dispute: externalizedClaimDispute(DISPUTE_A, {
          party_refs: [magistrateKey, "world/fixture-world/locus/fixture-locus"],
          underlying_subject_ref: "actor/some-actor/capability/c1",
          interpretation_issue_ref: courtKey,
          instrument_or_clause_ref: "gip/institution/i/instrument/x",
          adjudication_basis_ref: "kti/object/o1",
          provenance_ref: diplomacyRecognitionKey("recognition-named"),
        }),
      }),
    );
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    const after = everything();
    expect(after.filter((f) => !f.key.startsWith("diplomacy/dispute/"))).toEqual(before);
    expect(after.filter((f) => f.key.startsWith("diplomacy/dispute/")).map((f) => f.key)).toEqual([
      key(),
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a purely authored baseline does not invent dependency_refs[] merely because an opaque reference names another owner", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, {
      underlying_subject_ref: magistrateKey,
      party_refs: [courtKey],
    });
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect([g.reads, g.depends_on]).toEqual([[], []]);
    expect(
      "dependency_refs" in (s.diplomacy.externalizedClaimDispute(DISPUTE_A)!.value as any),
    ).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("party_refs[] are authored diplomatic-party references with no class restriction, and no Population, Cohort, culture or crowd party is made", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, {
      party_refs: ["a-faction", "a-person", "population/p1/cohort/c1", "culture/x", "a-crowd"],
    });
    expect(s.diplomacy.externalizedClaimDispute(DISPUTE_A)!.value.party_refs).toEqual([
      "a-faction",
      "a-person",
      "population/p1/cohort/c1",
      "culture/x",
      "a-crowd",
    ]);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
  });

  it("underlying_subject_ref and provenance_ref stay distinct, opaque and exactly as authored; the engine's own rule provenance is a different thing", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1);
    const v = s.diplomacy.externalizedClaimDispute(DISPUTE_A)!.value;
    expect([v.underlying_subject_ref, v.provenance_ref]).toEqual([
      DISPUTE_UNDERLYING_SUBJECT_REF_A,
      DISPUTE_PROVENANCE_REF_A,
    ]);
    const fact = s.campaign.store.getFact(key())!;
    expect(fact.provenance.rule).toEqual(DIPLOMACY_CLAIM_DISPUTE_RULE);
    expect(fact.provenance.rule).not.toEqual(v.provenance_ref);
    expect(diplomacyFacts(s)).toHaveLength(1);
  });
});

describe("retrieval is direct and keyed", () => {
  it("returns the exact one record by dispute_id without listing or scanning, among many unrelated records and owners", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    for (let i = 1; i <= 12; i++)
      await establishExternalizedClaimDispute(s, i, `bulk-${i}`, {
        party_refs: [`party-${i % 3}`, `party-${i % 4}`],
      });
    await establishExternalRecognition(s, 30, "bulk-recognition");
    await establishExternalizedClaimDispute(s, 40, DISPUTE_A);
    const spy = spyStore(s.campaign.store);
    const typed = readExternalizedClaimDispute(spy.store, DISPUTE_A)!;
    expect(typed.value).toEqual(externalizedClaimDispute(DISPUTE_A));
    expect(typed.dependencies).toEqual({ current: true, invalidated: [] });
    expect(spy.getFacts).toEqual([key()]);
    expect(spy.listCalls()).toBe(0);
    expect(readExternalizedClaimDispute(spy.store, "never-established")).toBeUndefined();
    // the dispute and recognition key spaces never answer for each other
    expect(readExternalizedClaimDispute(spy.store, "bulk-recognition")).toBeUndefined();
    expect(s.diplomacy.externalRecognition(DISPUTE_A)).toBeUndefined();
    // establishing one more touches only its own slot
    const adapter = new DiplomacyAdapter(spy.store);
    spy.getFacts.length = 0;
    await must(
      adapter.establishExternalizedClaimDispute({
        ...diplomacyPublication(41),
        dispute: externalizedClaimDispute(DISPUTE_B),
      }),
    );
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("the record is stored once per dispute_id: no copy per party, observer, population member, locus, clause or relation", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, {
      party_refs: ["p1", "p2", "p3", "p4"],
    });
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
    for (const p of ["p1", "p2", "p3", "p4"])
      expect(s.diplomacy.externalizedClaimDispute(p)).toBeUndefined();
  });
});

describe("retry and replay converge; a conflicting establishment fails closed", () => {
  it("the same intent presented twice converges on one record and one authoritative receipt", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const dispute = externalizedClaimDispute();
    const first = await must(
      s.diplomacy.establishExternalizedClaimDispute({ ...diplomacyPublication(1), dispute }),
    );
    const head = s.campaign.store.head();
    const second = await must(
      s.diplomacy.establishExternalizedClaimDispute({ ...diplomacyPublication(1), dispute }),
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
    await establishExternalizedClaimDispute(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    const changed = await s.diplomacy.establishExternalizedClaimDispute({
      ...diplomacyPublication(1),
      dispute: externalizedClaimDispute(DISPUTE_A, { status: "withdrawn" }),
    });
    expect(changed.ok).toBe(false);
    expect(s.campaign.store.getFact(key())).toEqual(fact);
  });

  it("a different intent at an occupied dispute_id — equal or conflicting content — fails closed rather than overwriting", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    for (const [n, over] of [
      [2, {}],
      [3, { status: "denied" }],
      [4, { party_refs: ["other"], communicated_position_entries: ["other"] }],
      [5, { effect_on: "issuance" }],
    ] as const) {
      const out = await s.diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(n),
        dispute: externalizedClaimDispute(DISPUTE_A, over as never),
      });
      expect(out.ok, String(n)).toBe(false);
      expect(!out.ok && out.error.code, String(n)).toBe("VERSION_CONFLICT");
    }
    expect(s.campaign.store.getFact(key())).toEqual(fact);
    expect(diplomacyFacts(s)).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("identical content under a different dispute_id is a distinct record: nothing is merged or deduplicated", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A);
    await establishExternalizedClaimDispute(s, 2, DISPUTE_C);
    expect(diplomacyFacts(s)).toHaveLength(2);
  });

  it("a recognition and a dispute with the same identifier occupy distinct key spaces and do not conflict", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1, "shared-id");
    await establishExternalizedClaimDispute(s, 2, "shared-id");
    expect(
      diplomacyFacts(s)
        .map((f) => f.key)
        .sort(),
    ).toEqual([key("shared-id"), diplomacyRecognitionKey("shared-id")].sort());
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("dependency_refs[] is pinned through the existing group reads and dependencies, only where the record names mutable implemented owner state", () => {
  it("a record derived from a committed GIP authority registers exactly those dependencies: read at the current version, depended on through the committing group, with no watcher", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const identity = s.campaign.store.getFact(courtKey)!;
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, {
      dependency_refs: [magistrateKey, courtKey],
    });
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.reads).toEqual([
      { key: magistrateKey, version: office.version },
      { key: courtKey, version: identity.version },
    ]);
    expect(g.depends_on).toEqual([office.provenance.group_id, identity.provenance.group_id]);
    expect(g.writes.map((w) => [w.key, w.expected_version])).toEqual([[key(), 0]]);
    const typed = s.diplomacy.externalizedClaimDispute(DISPUTE_A)!;
    expect(typed.value.dependency_refs).toEqual([magistrateKey, courtKey]);
    expect(typed.dependencies).toEqual({ current: true, invalidated: [] });
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(office);
    expect(s.campaign.store.getFact(courtKey)).toEqual(identity);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("dependency_refs[] is carried exactly as authored, repeated entries included, and each distinct fact is pinned once; an authored empty array pins nothing", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, {
      dependency_refs: [magistrateKey, magistrateKey],
    });
    expect(s.diplomacy.externalizedClaimDispute(DISPUTE_A)!.value.dependency_refs).toEqual([
      magistrateKey,
      magistrateKey,
    ]);
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.reads).toHaveLength(1);
    expect(g.depends_on).toHaveLength(1);
    await establishExternalizedClaimDispute(s, 2, DISPUTE_B, { dependency_refs: [] });
    expect(s.diplomacy.externalizedClaimDispute(DISPUTE_B)!.value.dependency_refs).toEqual([]);
    const g2 = s.campaign.store.committedGroup(diplomacyPublication(2).intent_id)!;
    expect([g2.reads, g2.depends_on]).toEqual([[], []]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("naming a dependency that is not committed is refused as a missing prerequisite: nothing is created and no dependency is invented", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    const out = await s.diplomacy.establishExternalizedClaimDispute({
      ...diplomacyPublication(1),
      dispute: externalizedClaimDispute(DISPUTE_A, { dependency_refs: [magistrateKey] }),
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
    const withRefs = externalizedClaimDispute(DISPUTE_A, { dependency_refs: [magistrateKey] });
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
        externalizedClaimDispute(),
        pin(magistrateKey, office),
        "REFERENCE_INVALID",
      ],
      [
        "baseline that depends on a group",
        externalizedClaimDispute(),
        { depends_on: [office.provenance.group_id] },
        "REFERENCE_INVALID",
      ],
      [
        "refs to a fact that is not committed",
        externalizedClaimDispute(DISPUTE_A, {
          dependency_refs: ["gip/institution/ghost/identity"],
        }),
        { reads: [{ key: "gip/institution/ghost/identity", version: 0 }] },
        "PREREQUISITE_MISSING",
      ],
    ];
    let n = 100;
    for (const [name, value, over, code] of cases)
      expect(await codeOf(s.campaign.store.commit(raw(++n, value, over))), name).toBe(code);
    expect(
      await codeOf(s.campaign.store.commit(raw(n + 1, withRefs, pin(magistrateKey, office)))),
    ).toBe("OK");
    expect(diplomacyFacts(s)).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an upstream write to a registered dependency invalidates the derived conclusion before it may be read as current (existing pinned-version invalidation, no re-resolution)", async () => {
    // a campaign built by a store with NO admission, so that an upstream owner can move its fact forward
    const store = await must(
      createFileCampaign(tempDir(), {
        campaignId: FIXTURE_CAMPAIGN,
        owners: CANONICAL_OWNER_REGISTRY,
      }),
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
      diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(1),
        dispute: externalizedClaimDispute(DISPUTE_A, { dependency_refs: [magistrateKey] }),
      }),
    );
    expect(diplomacy.externalizedClaimDispute(DISPUTE_A)!.dependencies).toEqual({
      current: true,
      invalidated: [],
    });
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
    const typed = diplomacy.externalizedClaimDispute(DISPUTE_A)!;
    expect(typed.dependencies).toEqual({ current: false, invalidated: [magistrateKey] });
    // the conclusion is reported, never re-resolved or rewritten, and an advanced dependency is not corruption of the dispute
    expect(typed.fact.version).toBe(1);
    expect(typed.value.status).toBe(externalizedClaimDispute().status);
    expect(verifyDiplomacyIntegrity(store)).toEqual([]);
    await store.close();
  });
});

describe("a missing or malformed field fails closed, and aliases never substitute", () => {
  it("through the adapter: any missing required field, any alias and any unmodelled field is refused before anything is committed", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const f of [
      "dispute_id",
      "party_refs",
      "underlying_subject_ref",
      "communicated_position_entries",
      "status",
      "provenance_ref",
    ]) {
      const v: any = externalizedClaimDispute();
      delete v[f];
      const out = await s.diplomacy.establishExternalizedClaimDispute({
        ...diplomacyPublication(1),
        dispute: v,
      });
      expect(!out.ok && out.error.code, f).toBe("INPUT_INVALID");
      const aliased: any = { ...v, [`${f}_alias`]: "x" };
      expect(
        await codeOf(
          s.diplomacy.establishExternalizedClaimDispute({
            ...diplomacyPublication(1),
            dispute: aliased,
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
    const v: any = externalizedClaimDispute();
    const missing = { ...v };
    delete missing.status;
    const aliased = { ...v, parties: v.party_refs };
    delete aliased.party_refs;
    for (const [name, value] of [
      ["missing status", missing],
      ["party alias", aliased],
      ["singular party_refs", { ...v, party_refs: "a" }],
      ["singular position entries", { ...v, communicated_position_entries: "a" }],
      ["array status", { ...v, status: ["a"] }],
      ["array remedy", { ...v, requested_remedy_or_demand: ["a"] }],
      ["array subject", { ...v, underlying_subject_ref: ["a"] }],
      ["bad effect_on", { ...v, effect_on: "receipt" }],
      ["junk field", { ...v, relation_id: "x" }],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw(++n, value))), name).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });
});

describe("only the establishment is supported: every post-establishment mutation is refused", () => {
  it("the adapter exposes the two authored writers and their keyed reads: no status-change, position, remedy, interpretation, adjudication, effect, re-resolution, merger, settlement or retirement method", () => {
    expect(
      Object.getOwnPropertyNames(DiplomacyAdapter.prototype)
        .filter((m) => m !== "constructor")
        .sort(),
    ).toEqual([
      "establishExternalRecognition",
      "establishExternalizedClaimDispute",
      "establishRelationEdge",
      "externalRecognition",
      "externalizedClaimDispute",
      "relationEdge",
    ]);
  });

  it("every raw expected-version write to an established dispute — status, position, remedy, interpretation, adjudication, effect, dependency — is an unsupported amendment; an occupied create is a version conflict", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    const over = (o: Record<string, unknown>) => externalizedClaimDispute(DISPUTE_A, o as never);
    let n = 200;
    for (const [expected_version, value, code] of [
      [1, over({ status: "resolved" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ communicated_position_entries: ["a new position"] }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ requested_remedy_or_demand: "a new remedy" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ interpretation_issue_ref: "i" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ adjudication_basis_ref: "a" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ effect_on: "issuance" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ party_refs: ["merged"] }), "AMENDMENT_NOT_SUPPORTED"],
      [1, externalizedClaimDispute(), "AMENDMENT_NOT_SUPPORTED"], // even an unchanged re-statement
      [2, over({ status: "resolved" }), "VERSION_CONFLICT"],
      [0, over({ status: "resolved" }), "VERSION_CONFLICT"],
      [0, externalizedClaimDispute(), "VERSION_CONFLICT"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, value, { expected_version }))),
        `${expected_version} ${JSON.stringify(value)}`,
      ).toBe(code);
    expect(s.campaign.store.getFact(key())).toEqual(fact);
  });

  it("admission authorizes only a single-write dispute group: an extra write, a different key space or an unrelated value is refused", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const two = group(
      FIXTURE_CAMPAIGN,
      300,
      [
        write(key(), externalizedClaimDispute() as never, {
          owner: "diplomacy",
          facet: "diplomacy_externalized_claim_dispute",
        }),
        write(key(DISPUTE_B), externalizedClaimDispute(DISPUTE_B) as never, {
          owner: "diplomacy",
          facet: "diplomacy_externalized_claim_dispute",
        }),
      ],
      {
        owner: "diplomacy",
        facet: "diplomacy_externalized_claim_dispute",
        rule: DIPLOMACY_CLAIM_DISPUTE_RULE,
      },
    );
    expect(await codeOf(s.campaign.store.commit(two))).toBe("VALUE_INVALID");
    expect(diplomacyGroupCheck(two, { facts: new Map() } as never)?.code).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("a dispute is committed under its own citation and at the key its dispute_id derives; a recognition citation does not authorize it", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    for (const rule of [GIP_RULE, DIPLOMACY_RECOGNITION_RULE])
      expect(
        await codeOf(s.campaign.store.commit(raw(310, externalizedClaimDispute(), { rule }))),
      ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(311, externalizedClaimDispute(DISPUTE_A), { key: key(DISPUTE_B) }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });
});

describe("owner exclusivity and no collateral Diplomacy or foreign structure", () => {
  it("the dispute facet belongs to the one Diplomacy owner: the recognition facet cannot write the dispute key space and vice versa", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    expect(CANONICAL_OWNER_REGISTRY.get("diplomacy")).toEqual(
      new Set([
        "diplomacy_external_recognition",
        "diplomacy_externalized_claim_dispute",
        "diplomacy_relation_edge",
      ]),
    );
    const recognitionOnDisputeKey = raw(401, externalRecognition(), {
      facet: "diplomacy_external_recognition",
      rule: DIPLOMACY_RECOGNITION_RULE,
    });
    expect(await codeOf(s.campaign.store.commit(recognitionOnDisputeKey))).not.toBe("OK");
    const disputeOnRecognitionKey = raw(402, externalizedClaimDispute(), {
      key: diplomacyRecognitionKey(DISPUTE_A),
    });
    expect(await codeOf(s.campaign.store.commit(disputeOnRecognitionKey))).not.toBe("OK");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("no other registered owner may write the dispute key space, and the Diplomacy owner may write no other owner's key space", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 410;
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
        await codeOf(
          s.campaign.store.commit(raw(++n, externalizedClaimDispute(), { owner, facet })),
        ),
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
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("no Channel, Negotiation Record, Instrument, Clause, Binding Entry, Framework, compliance or receipt key space exists (the Relation Edge key space is the nineteenth slice's own, so only malformed relation paths are probed): each is outside every registered key space", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 500;
    for (const k of [
      "diplomacy/relation",
      "diplomacy/relation/r1/x",
      "diplomacy/edge/r1",
      "diplomacy/channel/c1",
      "diplomacy/negotiation/n1",
      "diplomacy/instrument/i1",
      "diplomacy/instrument/i1/clause/c1",
      "diplomacy/binding/b1",
      "diplomacy/framework/f1",
      "diplomacy/claim/c1",
      "diplomacy/compliance/c1",
      "diplomacy/receipt/r1",
      "diplomacy/dispute",
      "diplomacy/dispute/d1/position",
      "diplomacy/dispute/d1/d2",
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, externalizedClaimDispute(), { key: k }))),
        k,
      ).toBe("KEY_NOT_ADMITTED");
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "diplomacy").map((k) => k.id)).toEqual([
      "diplomacy_external_recognition",
      "diplomacy_claim_dispute",
      "diplomacy_relation_edge",
    ]);
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("establishing a dispute writes only its own key: no underlying claim, GIP, World, Actor, ACS, Population, Economy, Epistemic, KTI or other foreign fact, and no receipt event", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    await establishExternalRecognition(s, 25, "existing-recognition");
    const before = structuredClone(s.campaign.store.listFacts());
    const head = s.campaign.store.head();
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, {
      party_refs: [magistrateKey, "world/fixture-world/locus/fixture-locus"],
      underlying_subject_ref: courtKey,
      effect_on: "addressee_receipt",
    });
    const after = s.campaign.store.listFacts();
    expect(after.length).toBe(before.length + 1);
    expect(after.filter((f) => f.key !== key())).toEqual(before);
    expect(s.campaign.store.head().revision).toBe(head.revision + 1);
    // the existing recognition and every other owner's state are byte-identical
    for (const f of before) expect(s.campaign.store.getFact(f.key)).toEqual(f);
    expect(
      after.filter((f) => f.key.startsWith("access/") || f.owner === "epistemic_access"),
    ).toEqual(before.filter((f) => f.key.startsWith("access/") || f.owner === "epistemic_access"));
  });
});

describe("no clock, scheduler, watcher or polling loop on the dispute path", () => {
  it("establishing a dispute registers no boundary and no temporal object, whatever its effect_on says", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A, { effect_on: "addressee_receipt" });
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
  });

  it("a temporal object still cannot produce a dispute key", async () => {
    const { diplomacyObjectViolation } = await import("@immortalis/engine");
    const { dormantObject } = await import("@immortalis/testkit");
    const base = dormantObject();
    const dep = base.dependencies[0]!;
    expect(
      diplomacyObjectViolation({ ...base, dependencies: [{ ...dep, produces: [key()] }] }),
    ).toMatch(/no stage, close or operation/);
  });
});

describe("the load-time verifier is silent on a healthy campaign", () => {
  it("a campaign with baseline and dependency-derived disputes and a recognition verifies clean", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    await establishExternalizedClaimDispute(s, 1, DISPUTE_A);
    await establishExternalizedClaimDispute(s, 2, DISPUTE_B, { dependency_refs: [magistrateKey] });
    await establishExternalRecognition(s, 3);
    expect(verifyDiplomacyIntegrity(s.campaign.store)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });
});
