/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and state values */
// Diplomacy Relation Edge Authoritative Core Backbone Foundation (nineteenth slice) — INITIAL AUTHORED ESTABLISHMENT ONLY of one
// Diplomacy-owned sparse Relation Edge (WS-008 v1.1 §5.1 authoritative core), through the existing owner registry, admission,
// commit receipt, persistence and recovery machinery. The five derived reference / index arrays (§29.7) are not writable and no
// Recognition / Claim-Dispute association exists; every party reference is opaque and never dereferenced; no foreign fact is
// created or mutated; every post-establishment change is refused.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-02/16; IM-03, IM-06, IM-11, IM-12, IM-17. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-008. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  diplomacyDisputeKey,
  diplomacyRecognitionKey,
  diplomacyRelationKey,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  ALL_FACT_KINDS,
  CANONICAL_OWNER_REGISTRY,
  DIPLOMACY_CLAIM_DISPUTE_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DIPLOMACY_RELATION_EDGE_RULE,
  DiplomacyAdapter,
  GIP_RULE,
  diplomacyGroupCheck,
  factKind,
  readRelationEdge,
  verifyDiplomacyIntegrity,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  RELATION_A,
  RELATION_B,
  RELATION_C,
  RELATION_PARTY_REF_A,
  RELATION_PARTY_REF_B,
  RELATION_PROVENANCE_REF_A,
  diplomacyPublication,
  externalRecognition,
  externalizedClaimDispute,
  fullRelationEdge,
  group,
  relationEdge,
  write,
} from "@immortalis/testkit";
import {
  diplomacyFacts,
  establishExternalRecognition,
  establishExternalizedClaimDispute,
  establishGipAuthority,
  establishRelationEdge,
  seededDiplomacyCampaign,
} from "../support/diplomacy.ts";
import { seedInstitutionLikeNeighbors } from "../support/gip.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const key = (id = RELATION_A) => diplomacyRelationKey(id);
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
  const facet = g.facet ?? "diplomacy_relation_edge";
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
    { owner, facet, rule: DIPLOMACY_RELATION_EDGE_RULE, ...g },
  );
}

describe("one Relation Edge can be established, exactly as authored", () => {
  it("a complete core record establishes as one create-only ADVANCING write under the existing Diplomacy owner, with every required field", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    const relation = relationEdge();
    const out = await must(
      s.diplomacy.establishRelationEdge({ ...diplomacyPublication(1), relation }),
    );
    expect(out.replayed).toBe(false);
    const fact = s.campaign.store.getFact(key())!;
    expect([fact.owner, fact.facet, fact.version]).toEqual([
      "diplomacy",
      "diplomacy_relation_edge",
      1,
    ]);
    expect(fact.value).toEqual(relation);
    expect(fact.provenance.rule).toEqual(DIPLOMACY_RELATION_EDGE_RULE);
    expect(factKind("diplomacy_relation_edge").lifecycle).toBe("ADVANCING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the committed group wrote exactly one create-only key, read nothing and depended on nothing: no dependency is invented", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1);
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.writes.map((w) => [w.key, w.expected_version])).toEqual([[key(), 0]]);
    expect(g.reads).toEqual([]);
    expect(g.depends_on).toEqual([]);
    expect(g.rule).toEqual(DIPLOMACY_RELATION_EDGE_RULE);
    expect(g.authority).toEqual({ ...CANON_WRITE_AUTHORITY });
    expect([g.owner, g.facet]).toEqual(["diplomacy", "diplomacy_relation_edge"]);
  });

  it("each optional field round-trips both present and absent, without default synthesis", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1, RELATION_A);
    const full = fullRelationEdge(RELATION_B);
    await must(s.diplomacy.establishRelationEdge({ ...diplomacyPublication(2), relation: full }));
    const partial: any = fullRelationEdge(RELATION_C);
    delete partial.rupture_or_suspension_status;
    await must(
      s.diplomacy.establishRelationEdge({ ...diplomacyPublication(3), relation: partial }),
    );
    const a: any = s.campaign.store.getFact(key(RELATION_A))!.value;
    for (const f of ["rupture_or_suspension_status", "provenance_ref"])
      expect(f in a, f).toBe(false);
    expect(s.campaign.store.getFact(key(RELATION_B))!.value).toEqual(full);
    expect(s.campaign.store.getFact(key(RELATION_B))!.value).toMatchObject({
      provenance_ref: RELATION_PROVENANCE_REF_A,
    });
    const c: any = s.campaign.store.getFact(key(RELATION_C))!.value;
    expect("rupture_or_suspension_status" in c).toBe(false);
    expect(c.provenance_ref).toBe(RELATION_PROVENANCE_REF_A);
    // none of the derived index arrays exists on any stored edge
    for (const f of s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("diplomacy/relation/")))
      for (const idx of [
        "channel_refs",
        "recognition_refs",
        "active_claim_dispute_refs",
        "instrument_refs",
        "framework_refs",
      ])
        expect(idx in (f.value as any), idx).toBe(false);
  });

  it("party_refs[] retains its exact array shape: order, repeats and empties are untouched", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    for (const refs of [[], ["a"], ["b", "a", "b"], [RELATION_PARTY_REF_B, RELATION_PARTY_REF_A]]) {
      n++;
      await establishRelationEdge(s, n, `shape-${n}`, { party_refs: refs });
      expect((s.campaign.store.getFact(key(`shape-${n}`))!.value as any).party_refs).toEqual(refs);
    }
  });

  it("open scope, rupture and lifecycle values are stored as authored, never normalized, closed, defaulted or rejected for being unlisted", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    for (const value of [
      "ACTIVE",
      "active",
      "retired",
      "anything at all",
      0,
      true,
      null,
      { phase: "x", n: [1, { y: null }] },
    ]) {
      n++;
      const id = `open-${n}`;
      await establishRelationEdge(s, n, id, {
        relation_scope: value,
        rupture_or_suspension_status: value,
        lifecycle_status: value,
      });
      const stored: any = s.campaign.store.getFact(key(id))!.value;
      expect(stored.relation_scope).toEqual(value);
      expect(stored.rupture_or_suspension_status).toEqual(value);
      expect(stored.lifecycle_status).toEqual(value);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an array-valued scope or status is refused; nothing is committed", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const f of ["relation_scope", "rupture_or_suspension_status", "lifecycle_status"]) {
      const out = await s.diplomacy.establishRelationEdge({
        ...diplomacyPublication(1),
        relation: { ...relationEdge(), [f]: ["a", "b"] },
      });
      expect(!out.ok && out.error.code, f).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.head()).toEqual(before);
  });
});

describe("the derived indexes are rejected, never silently stored, and nothing is associated automatically", () => {
  const derived = [
    "channel_refs",
    "recognition_refs",
    "active_claim_dispute_refs",
    "instrument_refs",
    "framework_refs",
  ];

  it("through the adapter: a record carrying any derived index array (empty or populated) is refused before anything is committed", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const f of derived)
      for (const value of [[], ["x"]]) {
        const out = await s.diplomacy.establishRelationEdge({
          ...diplomacyPublication(1),
          relation: { ...relationEdge(), [f]: value },
        });
        expect(!out.ok && out.error.code, f).toBe("INPUT_INVALID");
      }
    expect(s.campaign.store.head()).toEqual(before);
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("through a raw store commit: the same contract holds, so no caller can bypass the adapter", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    for (const f of derived)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, { ...relationEdge(), [f]: [] }))),
        f,
      ).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("existing Recognition and Claim / Dispute records are neither read, matched, linked nor touched, even when their party sets and scopes coincide with the edge's", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1, "rec-1", {
      recognition_scope: "SYNTHETIC FIXTURE: an authored relation scope.",
    });
    await establishExternalizedClaimDispute(s, 2, "disp-1", {
      party_refs: [RELATION_PARTY_REF_A, RELATION_PARTY_REF_B],
    });
    const before = structuredClone(s.campaign.store.listFacts());
    const spy = spyStore(s.campaign.store);
    const adapter = new DiplomacyAdapter(spy.store);
    await must(
      adapter.establishRelationEdge({
        ...diplomacyPublication(3),
        relation: relationEdge(RELATION_A, {
          party_refs: [RELATION_PARTY_REF_A, RELATION_PARTY_REF_B],
        }),
      }),
    );
    // establishing reads nothing, lists nothing and writes only the edge's own key
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    const after = s.campaign.store.listFacts();
    expect(after.filter((f) => f.key !== key())).toEqual(before);
    expect(after.filter((f) => f.key === key())).toHaveLength(1);
    // the stored edge carries no reference to either record
    const stored = JSON.stringify(s.campaign.store.getFact(key())!.value);
    expect(stored).not.toContain("rec-1");
    expect(stored).not.toContain("disp-1");
    // the existing records still carry no relation_id
    for (const k of [diplomacyRecognitionKey("rec-1"), diplomacyDisputeKey("disp-1")])
      expect("relation_id" in (s.campaign.store.getFact(k)!.value as any)).toBe(false);
  });
});

describe("references are opaque authored values: they mint no foreign fact and are never dereferenced", () => {
  it("party references that name real facts of other owners (a GIP institution, an office, a recognition) change nothing and are not read", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    await establishExternalRecognition(s, 25, "existing-recognition");
    const before = structuredClone(s.campaign.store.listFacts());
    await establishRelationEdge(s, 1, RELATION_A, {
      party_refs: [courtKey, magistrateKey, diplomacyRecognitionKey("existing-recognition")],
      provenance_ref: courtKey,
    });
    const after = s.campaign.store.listFacts();
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((f) => f.key !== key())).toEqual(before);
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.reads).toEqual([]);
    expect(g.depends_on).toEqual([]);
  });

  it("an unestablished or dangling party reference is admitted: no party is dereferenced merely to admit the record", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1, RELATION_A, {
      party_refs: ["never-existed-1", "never-existed-2"],
      provenance_ref: "never-existed-provenance",
    });
    expect(s.diplomacy.relationEdge(RELATION_A)!.value.party_refs).toEqual([
      "never-existed-1",
      "never-existed-2",
    ]);
  });

  it("no relevance flag, score or all-pairs generator exists: establishing one edge creates exactly one edge", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1, RELATION_A, { party_refs: ["p1", "p2", "p3", "p4"] });
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
  });
});

describe("retrieval is direct and keyed", () => {
  it("returns the exact one record by relation_id without listing or scanning, among many unrelated records and owners", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    for (let i = 1; i <= 12; i++)
      await establishRelationEdge(s, i, `bulk-${i}`, { party_refs: [`party-${i % 3}`] });
    await establishExternalRecognition(s, 30, "bulk-recognition");
    await establishExternalizedClaimDispute(s, 31, "bulk-dispute");
    await establishRelationEdge(s, 40, RELATION_A);
    const spy = spyStore(s.campaign.store);
    const typed = readRelationEdge(spy.store, RELATION_A)!;
    expect(typed.value).toEqual(relationEdge(RELATION_A));
    expect(spy.getFacts).toEqual([key()]);
    expect(spy.listCalls()).toBe(0);
    expect(readRelationEdge(spy.store, "never-established")).toBeUndefined();
    // the relation, recognition and dispute key spaces never answer for each other
    expect(readRelationEdge(spy.store, "bulk-recognition")).toBeUndefined();
    expect(readRelationEdge(spy.store, "bulk-dispute")).toBeUndefined();
    expect(s.diplomacy.externalRecognition(RELATION_A)).toBeUndefined();
    expect(s.diplomacy.externalizedClaimDispute(RELATION_A)).toBeUndefined();
    // establishing one more touches only its own slot
    const adapter = new DiplomacyAdapter(spy.store);
    spy.getFacts.length = 0;
    await must(
      adapter.establishRelationEdge({
        ...diplomacyPublication(41),
        relation: relationEdge(RELATION_B),
      }),
    );
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("the record is stored once per relation_id: no copy per party, observer, recognition, dispute, channel or instrument", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1, RELATION_A, { party_refs: ["p1", "p2", "p3", "p4"] });
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
    for (const p of ["p1", "p2", "p3", "p4"]) expect(s.diplomacy.relationEdge(p)).toBeUndefined();
  });
});

describe("retry and replay converge; a conflicting establishment fails closed", () => {
  it("the same intent presented twice converges on one record and one authoritative receipt", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const relation = relationEdge();
    const first = await must(
      s.diplomacy.establishRelationEdge({ ...diplomacyPublication(1), relation }),
    );
    const head = s.campaign.store.head();
    const second = await must(
      s.diplomacy.establishRelationEdge({ ...diplomacyPublication(1), relation }),
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
    await establishRelationEdge(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    const changed = await s.diplomacy.establishRelationEdge({
      ...diplomacyPublication(1),
      relation: relationEdge(RELATION_A, { lifecycle_status: "retired" }),
    });
    expect(changed.ok).toBe(false);
    expect(s.campaign.store.getFact(key())).toEqual(fact);
  });

  it("a different intent at an occupied relation_id — equal or conflicting content — fails closed under the version-conflict behavior rather than overwriting", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    for (const [n, over] of [
      [2, {}],
      [3, { lifecycle_status: "retired" }],
      [4, { party_refs: ["other"], relation_scope: "other" }],
      [5, { rupture_or_suspension_status: "ruptured" }],
    ] as const) {
      const out = await s.diplomacy.establishRelationEdge({
        ...diplomacyPublication(n),
        relation: relationEdge(RELATION_A, over as never),
      });
      expect(out.ok, String(n)).toBe(false);
      expect(!out.ok && out.error.code, String(n)).toBe("VERSION_CONFLICT");
    }
    expect(s.campaign.store.getFact(key())).toEqual(fact);
    expect(diplomacyFacts(s)).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("identical content under a different relation_id is a distinct record: nothing is merged or deduplicated", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1, RELATION_A);
    await establishRelationEdge(s, 2, RELATION_C);
    expect(diplomacyFacts(s)).toHaveLength(2);
  });

  it("a recognition, a dispute and a relation edge with the same identifier occupy distinct key spaces and do not conflict", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1, "shared-id");
    await establishExternalizedClaimDispute(s, 2, "shared-id");
    await establishRelationEdge(s, 3, "shared-id");
    expect(
      diplomacyFacts(s)
        .map((f) => f.key)
        .sort(),
    ).toEqual(
      [
        key("shared-id"),
        diplomacyRecognitionKey("shared-id"),
        diplomacyDisputeKey("shared-id"),
      ].sort(),
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a missing or malformed field fails closed, and aliases never substitute", () => {
  it("through the adapter: any missing required field, any alias and any unmodelled field is refused before anything is committed", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const f of ["relation_id", "party_refs", "relation_scope", "lifecycle_status"]) {
      const v: any = relationEdge();
      delete v[f];
      const out = await s.diplomacy.establishRelationEdge({
        ...diplomacyPublication(1),
        relation: v,
      });
      expect(!out.ok && out.error.code, f).toBe("INPUT_INVALID");
      const aliased: any = { ...v, [`${f}_alias`]: "x" };
      expect(
        await codeOf(
          s.diplomacy.establishRelationEdge({ ...diplomacyPublication(1), relation: aliased }),
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
    const v: any = relationEdge();
    const missing = { ...v };
    delete missing.lifecycle_status;
    const aliased = { ...v, parties: v.party_refs };
    delete aliased.party_refs;
    for (const [name, value] of [
      ["missing lifecycle_status", missing],
      ["party alias", aliased],
      ["singular party_refs", { ...v, party_refs: "a" }],
      ["array scope", { ...v, relation_scope: ["a"] }],
      ["array lifecycle_status", { ...v, lifecycle_status: ["a"] }],
      ["array rupture status", { ...v, rupture_or_suspension_status: ["a"] }],
      ["array provenance_ref", { ...v, provenance_ref: ["a"] }],
      ["dependency_refs", { ...v, dependency_refs: [] }],
      ["junk field", { ...v, score: 1 }],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw(++n, value))), name).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });
});

describe("only the establishment is supported: every post-establishment mutation is refused", () => {
  it("the adapter exposes no rupture, suspension, restoration, retirement or lifecycle-transition method", () => {
    const methods = Object.getOwnPropertyNames(DiplomacyAdapter.prototype)
      .filter((m) => m !== "constructor")
      .sort();
    expect(methods).toContain("establishRelationEdge");
    expect(methods).toContain("relationEdge");
    for (const m of methods)
      expect(m).not.toMatch(
        /rupture|suspend|restor|retire|transition|amend|update|withdraw|supersede|mutate|link|associate|index|rebuild|derive/i,
      );
  });

  it("every raw expected-version write to an established edge — scope, parties, rupture, suspension, restoration, retirement, lifecycle — is an unsupported amendment; an occupied create is a version conflict", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    const over = (o: Record<string, unknown>) => relationEdge(RELATION_A, o as never);
    let n = 200;
    for (const [expected_version, value, code] of [
      [1, over({ rupture_or_suspension_status: "ruptured" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ rupture_or_suspension_status: "suspended" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ lifecycle_status: "restored" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ lifecycle_status: "retired" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ relation_scope: "a new scope" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ party_refs: ["merged"] }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ provenance_ref: "p" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, relationEdge(), "AMENDMENT_NOT_SUPPORTED"], // even an unchanged re-statement
      [2, over({ lifecycle_status: "retired" }), "VERSION_CONFLICT"],
      [0, over({ lifecycle_status: "retired" }), "VERSION_CONFLICT"],
      [0, relationEdge(), "VERSION_CONFLICT"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, value, { expected_version }))),
        `${expected_version} ${JSON.stringify(value)}`,
      ).toBe(code);
    expect(s.campaign.store.getFact(key())).toEqual(fact);
  });

  it("admission authorizes only a single-write edge group: an extra write, a different key space or an unrelated value is refused", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const two = group(
      FIXTURE_CAMPAIGN,
      300,
      [
        write(key(), relationEdge() as never, {
          owner: "diplomacy",
          facet: "diplomacy_relation_edge",
        }),
        write(key(RELATION_B), relationEdge(RELATION_B) as never, {
          owner: "diplomacy",
          facet: "diplomacy_relation_edge",
        }),
      ],
      { owner: "diplomacy", facet: "diplomacy_relation_edge", rule: DIPLOMACY_RELATION_EDGE_RULE },
    );
    expect(await codeOf(s.campaign.store.commit(two))).toBe("VALUE_INVALID");
    expect(diplomacyGroupCheck(two, { facts: new Map() } as never)?.code).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("an edge group that reads or depends on anything is refused: no dependency is invented", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    const gipGroup = s.campaign.store.getFact(magistrateKey)!.provenance.group_id;
    let n = 320;
    for (const over of [
      { reads: [{ key: magistrateKey, version: 1 }], depends_on: [gipGroup] },
      { reads: [{ key: magistrateKey, version: 1 }], depends_on: [] },
      { reads: [], depends_on: [gipGroup] },
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, relationEdge(), over as never))),
        JSON.stringify(over),
      ).toBe("REFERENCE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("an edge is committed under its own citation and at the key its relation_id derives; a recognition or dispute citation does not authorize it", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    for (const rule of [GIP_RULE, DIPLOMACY_RECOGNITION_RULE, DIPLOMACY_CLAIM_DISPUTE_RULE])
      expect(await codeOf(s.campaign.store.commit(raw(310, relationEdge(), { rule })))).toBe(
        "REFERENCE_INVALID",
      );
    expect(
      await codeOf(
        s.campaign.store.commit(raw(311, relationEdge(RELATION_A), { key: key(RELATION_B) })),
      ),
    ).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("the new citation covers WS-008 §§2.1-2.2, §4, §5.1, §24 and §§29.3/29.7 and is recorded on every committed edge", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1);
    const rule = s.campaign.store.getFact(key())!.provenance.rule;
    expect(rule).toEqual(DIPLOMACY_RELATION_EDGE_RULE);
    for (const c of ["§§2.1-2.2", "§4 ", "§5.1 ", "§24 ", "§§29.3/29.7"])
      expect(rule.clause, c).toContain(c);
    for (const pin of [
      "2026-09-24T07:01:45.312Z",
      "2026-09-21T23:21:44.154Z",
      "2026-09-25T23:42:27.802Z",
    ])
      expect([rule.native_pin, ...rule.authority_lineage].join("\n")).toContain(pin);
  });
});

describe("owner exclusivity and no collateral Diplomacy or foreign structure", () => {
  it("the relation facet belongs to the one Diplomacy owner: the recognition and dispute facets cannot write the relation key space and vice versa", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 400;
    for (const [facet, rule] of [
      ["diplomacy_external_recognition", DIPLOMACY_RECOGNITION_RULE],
      ["diplomacy_externalized_claim_dispute", DIPLOMACY_CLAIM_DISPUTE_RULE],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw(++n, relationEdge(), { facet, rule })))).toBe(
        "KEY_NOT_ADMITTED",
      );
    for (const [k, facet, rule, value] of [
      [
        diplomacyRecognitionKey("x1"),
        "diplomacy_relation_edge",
        DIPLOMACY_RELATION_EDGE_RULE,
        externalRecognition("x1"),
      ],
      [
        diplomacyDisputeKey("x1"),
        "diplomacy_relation_edge",
        DIPLOMACY_RELATION_EDGE_RULE,
        externalizedClaimDispute("x1"),
      ],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw(++n, value, { key: k, facet, rule })))).toBe(
        "KEY_NOT_ADMITTED",
      );
    expect(diplomacyFacts(s)).toEqual([]);
    expect(CANONICAL_OWNER_REGISTRY.get("diplomacy")).toEqual(
      new Set([
        "diplomacy_external_recognition",
        "diplomacy_externalized_claim_dispute",
        "diplomacy_relation_edge",
        "diplomacy_framework",
      ]),
    );
  });

  it("no other registered owner may write the relation key space, and the Diplomacy owner may write no other owner's key space", async () => {
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
        await codeOf(s.campaign.store.commit(raw(++n, relationEdge(), { owner, facet }))),
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

  it("no Channel, Negotiation Record, Instrument, Clause, Binding Entry, compliance, derived-index or sibling key space exists (the Framework key space is the twenty-second slice's own, so only malformed framework paths are probed): each is outside every registered key space", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 500;
    for (const k of [
      "diplomacy/relation",
      "diplomacy/relation/r1/x",
      "diplomacy/relation/r1/channels",
      "diplomacy/relation/r1/recognitions",
      "diplomacy/relation/r1/claim-disputes",
      "diplomacy/relation/r1/instruments",
      "diplomacy/relation/r1/frameworks",
      "diplomacy/relation-index/r1",
      "diplomacy/edge/r1",
      "diplomacy/channel/c1",
      "diplomacy/negotiation/n1",
      "diplomacy/instrument/i1",
      "diplomacy/instrument/i1/clause/c1",
      "diplomacy/binding/b1",
      "diplomacy/framework",
      "diplomacy/framework/f1/x",
      "diplomacy/compliance/c1",
      "diplomacy/receipt/r1",
    ])
      expect(await codeOf(s.campaign.store.commit(raw(++n, relationEdge(), { key: k }))), k).toBe(
        "KEY_NOT_ADMITTED",
      );
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "diplomacy").map((k) => k.id)).toEqual([
      "diplomacy_external_recognition",
      "diplomacy_claim_dispute",
      "diplomacy_relation_edge",
      "diplomacy_framework",
    ]);
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("establishing an edge writes only its own key: no Recognition, Claim / Dispute, GIP, World, Actor, ACS, Population, Economy, Epistemic, KTI or other foreign fact", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    await establishExternalRecognition(s, 25, "existing-recognition");
    await establishExternalizedClaimDispute(s, 26, "existing-dispute");
    const before = structuredClone(s.campaign.store.listFacts());
    const head = s.campaign.store.head();
    await establishRelationEdge(s, 1, RELATION_A, {
      party_refs: [magistrateKey, "world/fixture-world/locus/fixture-locus"],
    });
    const after = s.campaign.store.listFacts();
    expect(after.length).toBe(before.length + 1);
    expect(after.filter((f) => f.key !== key())).toEqual(before);
    expect(s.campaign.store.head().revision).toBe(head.revision + 1);
    for (const f of before) expect(s.campaign.store.getFact(f.key)).toEqual(f);
  });
});

describe("no clock, scheduler, watcher or polling loop on the relation path", () => {
  it("establishing an edge registers no boundary and no temporal object", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1, RELATION_A, { lifecycle_status: "ACTIVE" });
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
  });

  it("a temporal object still cannot produce a relation key or be owned by Diplomacy", async () => {
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
  it("a campaign with edges, a recognition and a dispute verifies clean", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    await establishRelationEdge(s, 1, RELATION_A);
    await must(
      s.diplomacy.establishRelationEdge({
        ...diplomacyPublication(2),
        relation: fullRelationEdge(RELATION_B),
      }),
    );
    await establishExternalizedClaimDispute(s, 3, "d1");
    await establishExternalRecognition(s, 4);
    expect(verifyDiplomacyIntegrity(s.campaign.store)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });
});
