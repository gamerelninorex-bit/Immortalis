/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and state values */
// Diplomacy Framework Authoritative Core Backbone Foundation (twenty-second slice) — INITIAL AUTHORED ESTABLISHMENT ONLY of one
// Diplomacy-owned shared Framework (WS-008 v1.1 §16 minimum surface), through the existing owner registry, admission, commit
// receipt, persistence and recovery machinery. Every reference is opaque authored content and is never dereferenced; no member,
// charter, instrument, commitment, decision rule or provenance object is created; no Relation Edge framework_refs[] index, no
// Recognition / Claim-Dispute / Relation Edge association and no dependency exists; no framework decision, vote, tally or
// member-fault propagation is computed; every post-establishment change is refused.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-02/16; IM-03, IM-06, IM-11, IM-12, IM-17. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-008. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  diplomacyDisputeKey,
  diplomacyFrameworkKey,
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
  DIPLOMACY_FRAMEWORK_RULE,
  DIPLOMACY_RECOGNITION_RULE,
  DIPLOMACY_RELATION_EDGE_RULE,
  DiplomacyAdapter,
  GIP_RULE,
  diplomacyGroupCheck,
  factKind,
  readDiplomaticFramework,
  verifyDiplomacyIntegrity,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  FRAMEWORK_A,
  FRAMEWORK_B,
  FRAMEWORK_C,
  FRAMEWORK_DECISION_RULE_REF_A,
  FRAMEWORK_MEMBER_REF_A,
  FRAMEWORK_MEMBER_REF_B,
  INSTITUTION_COURT,
  OFFICE_MAGISTRATE,
  diplomacyPublication,
  diplomaticFramework,
  externalRecognition,
  externalizedClaimDispute,
  fullDiplomaticFramework,
  group,
  relationEdge,
  write,
} from "@immortalis/testkit";
import {
  diplomacyFacts,
  establishDiplomaticFramework,
  establishExternalRecognition,
  establishExternalizedClaimDispute,
  establishGipAuthority,
  establishRelationEdge,
  seededDiplomacyCampaign,
} from "../support/diplomacy.ts";
import { seedInstitutionLikeNeighbors } from "../support/gip.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const key = (id = FRAMEWORK_A) => diplomacyFrameworkKey(id);
const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const ARRAYS = ["member_refs", "charter_or_instrument_refs", "shared_commitment_refs"] as const;
const SINGULARS = [
  "framework_basis",
  "membership_rules",
  "entry_exit_rules",
  "lifecycle_status",
] as const;
const REQUIRED = [
  "framework_id",
  "framework_basis",
  "member_refs",
  "charter_or_instrument_refs",
  "membership_rules",
  "entry_exit_rules",
  "shared_commitment_refs",
  "lifecycle_status",
  "provenance_ref",
] as const;

/** A raw group exactly as an unauthorized (or sloppy) caller might build it: no registry, no adapter. */
function raw(
  n: number,
  value: unknown,
  over: Partial<CommitGroup> & { key?: string; expected_version?: number } = {},
): CommitGroup {
  const { key: k, expected_version, ...g } = over;
  const owner = g.owner ?? "diplomacy";
  const facet = g.facet ?? "diplomacy_framework";
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
    { owner, facet, rule: DIPLOMACY_FRAMEWORK_RULE, ...g },
  );
}

describe("one Framework can be established, exactly as authored", () => {
  it("a complete record establishes as one create-only ADVANCING write under the existing Diplomacy owner, with every required field", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    const framework = diplomaticFramework();
    const out = await must(
      s.diplomacy.establishDiplomaticFramework({ ...diplomacyPublication(1), framework }),
    );
    expect(out.replayed).toBe(false);
    const fact = s.campaign.store.getFact(key())!;
    expect([fact.owner, fact.facet, fact.version]).toEqual(["diplomacy", "diplomacy_framework", 1]);
    expect(fact.value).toEqual(framework);
    expect(fact.provenance.rule).toEqual(DIPLOMACY_FRAMEWORK_RULE);
    expect(factKind("diplomacy_framework").lifecycle).toBe("ADVANCING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the committed group wrote exactly one create-only key, read nothing and depended on nothing: no prerequisite pin is invented", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1);
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.writes.map((w) => [w.key, w.expected_version])).toEqual([[key(), 0]]);
    expect(g.reads).toEqual([]);
    expect(g.depends_on).toEqual([]);
    expect(g.rule).toEqual(DIPLOMACY_FRAMEWORK_RULE);
    expect(g.authority).toEqual({ ...CANON_WRITE_AUTHORITY });
    expect([g.owner, g.facet]).toEqual(["diplomacy", "diplomacy_framework"]);
  });

  it("owner, facet and rule come from the registry: the caller authors none of them", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    // a caller-supplied owner / facet / rule / authority on the input is ignored, never carried
    const input: any = {
      ...diplomacyPublication(1),
      framework: diplomaticFramework(),
      owner: "gip",
      facet: "gip_institution_identity",
      rule: GIP_RULE,
      authority: { forged: true },
    };
    await must(s.diplomacy.establishDiplomaticFramework(input));
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect([g.owner, g.facet]).toEqual(["diplomacy", "diplomacy_framework"]);
    expect(g.rule).toEqual(DIPLOMACY_FRAMEWORK_RULE);
    expect(g.authority).toEqual({ ...CANON_WRITE_AUTHORITY });
  });

  it("collective_decision_rule_ref round-trips both absent and present, never defaulted or fabricated", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A);
    const full = fullDiplomaticFramework(FRAMEWORK_B);
    await must(
      s.diplomacy.establishDiplomaticFramework({ ...diplomacyPublication(2), framework: full }),
    );
    const a: any = s.campaign.store.getFact(key(FRAMEWORK_A))!.value;
    expect("collective_decision_rule_ref" in a).toBe(false);
    expect(s.campaign.store.getFact(key(FRAMEWORK_B))!.value).toEqual(full);
    expect(s.campaign.store.getFact(key(FRAMEWORK_B))!.value).toMatchObject({
      collective_decision_rule_ref: FRAMEWORK_DECISION_RULE_REF_A,
    });
    // none of the Relation Edge index arrays exists on any stored Framework
    for (const f of diplomacyFacts(s))
      for (const idx of [
        "channel_refs",
        "recognition_refs",
        "active_claim_dispute_refs",
        "instrument_refs",
        "framework_refs",
        "dependency_refs",
      ])
        expect(idx in (f.value as any), idx).toBe(false);
  });

  it("each required array retains its exact shape: authored order, repeats and empties are untouched, with no normalization, sorting or deduplication", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    for (const f of ARRAYS)
      for (const refs of [
        [],
        ["a"],
        ["b", "a", "b"],
        [FRAMEWORK_MEMBER_REF_B, FRAMEWORK_MEMBER_REF_A],
      ]) {
        n++;
        await establishDiplomaticFramework(s, n, `shape-${n}`, { [f]: refs });
        expect((s.campaign.store.getFact(key(`shape-${n}`))!.value as any)[f], f).toEqual(refs);
      }
    // empty everywhere is representable evidence of authored content
    await establishDiplomaticFramework(s, n + 1, "all-empty", {
      member_refs: [],
      charter_or_instrument_refs: [],
      shared_commitment_refs: [],
    });
    const stored: any = s.campaign.store.getFact(key("all-empty"))!.value;
    for (const f of ARRAYS) expect(stored[f], f).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("open basis, rules and lifecycle values are stored as authored, never normalized, closed, defaulted or rejected for being unlisted", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    for (const value of [
      "ACTIVE",
      "active",
      "dissolved",
      "anything at all",
      0,
      true,
      null,
      { phase: "x", n: [1, { y: null }] },
    ]) {
      n++;
      const id = `open-${n}`;
      await establishDiplomaticFramework(s, n, id, {
        framework_basis: value,
        membership_rules: value,
        entry_exit_rules: value,
        lifecycle_status: value,
      });
      const stored: any = s.campaign.store.getFact(key(id))!.value;
      for (const f of SINGULARS) expect(stored[f], f).toEqual(value);
    }
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an array-valued singular field is refused; nothing is committed", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const f of SINGULARS) {
      const out = await s.diplomacy.establishDiplomaticFramework({
        ...diplomacyPublication(1),
        framework: { ...diplomaticFramework(), [f]: ["a", "b"] },
      });
      expect(!out.ok && out.error.code, f).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.head()).toEqual(before);
    expect(diplomacyFacts(s)).toEqual([]);
  });
});

describe("the Relation Edge index and every sibling Diplomacy construct are rejected, never silently stored", () => {
  const smuggled = [
    "framework_refs",
    "channel_refs",
    "recognition_refs",
    "active_claim_dispute_refs",
    "instrument_refs",
    "dependency_refs",
    "relation_id",
    "negotiation_refs",
    "clause_refs",
    "binding_entry_refs",
    "effect_on",
  ];

  it("through the adapter: a record carrying any such field (empty or populated) is refused before anything is committed", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const f of smuggled)
      for (const value of [[], ["x"]]) {
        const out = await s.diplomacy.establishDiplomaticFramework({
          ...diplomacyPublication(1),
          framework: { ...diplomaticFramework(), [f]: value },
        });
        expect(!out.ok && out.error.code, f).toBe("INPUT_INVALID");
      }
    expect(s.campaign.store.head()).toEqual(before);
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("through a raw store commit: the same contract holds, so no caller can bypass the adapter", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    for (const f of smuggled)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, { ...diplomaticFramework(), [f]: [] }))),
        f,
      ).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("an existing Relation Edge, Recognition and Claim / Dispute are neither read, matched, linked nor touched, and no Relation Edge framework_refs[] is populated, even when their parties coincide with the members", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishRelationEdge(s, 1, "rel-1", {
      party_refs: [FRAMEWORK_MEMBER_REF_A, FRAMEWORK_MEMBER_REF_B],
    });
    await establishExternalRecognition(s, 2, "rec-1");
    await establishExternalizedClaimDispute(s, 3, "disp-1", {
      party_refs: [FRAMEWORK_MEMBER_REF_A, FRAMEWORK_MEMBER_REF_B],
    });
    const before = structuredClone(s.campaign.store.listFacts());
    const spy = spyStore(s.campaign.store);
    const adapter = new DiplomacyAdapter(spy.store);
    await must(
      adapter.establishDiplomaticFramework({
        ...diplomacyPublication(4),
        framework: diplomaticFramework(FRAMEWORK_A, {
          member_refs: [FRAMEWORK_MEMBER_REF_A, FRAMEWORK_MEMBER_REF_B],
        }),
      }),
    );
    // establishing reads nothing, lists nothing and writes only the Framework's own key
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
    const after = s.campaign.store.listFacts();
    expect(after.filter((f) => f.key !== key())).toEqual(before);
    expect(after.filter((f) => f.key === key())).toHaveLength(1);
    // the stored Framework carries no reference to any sibling record
    const stored = JSON.stringify(s.campaign.store.getFact(key())!.value);
    for (const id of ["rel-1", "rec-1", "disp-1"]) expect(stored).not.toContain(id);
    // the Relation Edge is byte-identical: no framework_refs[] was derived or written, and no sibling gained a framework_id
    const edge: any = s.campaign.store.getFact(diplomacyRelationKey("rel-1"))!.value;
    expect("framework_refs" in edge).toBe(false);
    for (const k of [
      diplomacyRelationKey("rel-1"),
      diplomacyRecognitionKey("rec-1"),
      diplomacyDisputeKey("disp-1"),
    ])
      expect("framework_id" in (s.campaign.store.getFact(k)!.value as any)).toBe(false);
  });
});

describe("references are opaque authored values: they mint no foreign fact and are never dereferenced", () => {
  it("references that name real facts of other owners (a GIP institution, an office, a recognition, a relation edge) change nothing and are not read", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    await establishExternalRecognition(s, 25, "existing-recognition");
    await establishRelationEdge(s, 26, "existing-relation");
    const before = structuredClone(s.campaign.store.listFacts());
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A, {
      member_refs: [courtKey, magistrateKey, diplomacyRelationKey("existing-relation")],
      charter_or_instrument_refs: [courtKey],
      shared_commitment_refs: [diplomacyRecognitionKey("existing-recognition")],
      collective_decision_rule_ref: magistrateKey,
      provenance_ref: courtKey,
    });
    const after = s.campaign.store.listFacts();
    expect(after).toHaveLength(before.length + 1);
    expect(after.filter((f) => f.key !== key())).toEqual(before);
    const g = s.campaign.store.committedGroup(diplomacyPublication(1).intent_id)!;
    expect(g.reads).toEqual([]);
    expect(g.depends_on).toEqual([]);
  });

  it("an unestablished or dangling reference of every kind is admitted: nothing is dereferenced merely to admit the record, and nothing is auto-created", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A, {
      member_refs: ["never-existed-member-1", "never-existed-member-2"],
      charter_or_instrument_refs: ["never-existed-charter"],
      shared_commitment_refs: ["never-existed-commitment"],
      collective_decision_rule_ref: "never-existed-rule",
      provenance_ref: "never-existed-provenance",
    });
    const typed = s.diplomacy.diplomaticFramework(FRAMEWORK_A)!.value;
    expect(typed.member_refs).toEqual(["never-existed-member-1", "never-existed-member-2"]);
    expect(typed.collective_decision_rule_ref).toBe("never-existed-rule");
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("gip/"))).toEqual([]);
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
  });

  it("naming a decision rule, a GIP institution or an autonomous collective infers and computes nothing: no vote, tally, quorum, chooser or member-fault consequence exists", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    const before = structuredClone(s.campaign.store.listFacts());
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A, {
      member_refs: [courtKey, "acs/collective-1", "faction-1"],
      collective_decision_rule_ref: "charter-rule: suspend a breaching member by two-thirds",
      lifecycle_status: "suspended-member-pending",
    });
    const after = s.campaign.store.listFacts();
    expect(after.filter((f) => f.key !== key())).toEqual(before);
    // the record is stored exactly as authored: nothing was resolved from the rule text, the lifecycle value or a member
    const stored: any = s.campaign.store.getFact(key())!.value;
    expect(stored.collective_decision_rule_ref).toBe(
      "charter-rule: suspend a breaching member by two-thirds",
    );
    expect(stored.member_refs).toEqual([courtKey, "acs/collective-1", "faction-1"]);
    expect(s.campaign.store.listFacts().filter((f) => /^(vote|tally)/.test(f.key))).toEqual([]);
  });

  it("no all-pairs expansion: establishing one Framework of many members creates exactly one record, never a pairwise record", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A, {
      member_refs: ["m1", "m2", "m3", "m4", "m5", "m6"],
    });
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
  });
});

describe("retrieval is direct and keyed", () => {
  it("returns the exact one record by framework_id without listing or scanning, among many unrelated records and owners", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    for (let i = 1; i <= 12; i++)
      await establishDiplomaticFramework(s, i, `bulk-${i}`, { member_refs: [`member-${i % 3}`] });
    await establishExternalRecognition(s, 30, "bulk-recognition");
    await establishExternalizedClaimDispute(s, 31, "bulk-dispute");
    await establishRelationEdge(s, 32, "bulk-relation");
    await establishDiplomaticFramework(s, 40, FRAMEWORK_A);
    const spy = spyStore(s.campaign.store);
    const typed = readDiplomaticFramework(spy.store, FRAMEWORK_A)!;
    expect(typed.value).toEqual(diplomaticFramework(FRAMEWORK_A));
    expect(spy.getFacts).toEqual([key()]);
    expect(spy.listCalls()).toBe(0);
    expect(readDiplomaticFramework(spy.store, "never-established")).toBeUndefined();
    // the framework and every sibling key space never answer for each other
    expect(readDiplomaticFramework(spy.store, "bulk-recognition")).toBeUndefined();
    expect(readDiplomaticFramework(spy.store, "bulk-dispute")).toBeUndefined();
    expect(readDiplomaticFramework(spy.store, "bulk-relation")).toBeUndefined();
    expect(s.diplomacy.externalRecognition(FRAMEWORK_A)).toBeUndefined();
    expect(s.diplomacy.externalizedClaimDispute(FRAMEWORK_A)).toBeUndefined();
    expect(s.diplomacy.relationEdge(FRAMEWORK_A)).toBeUndefined();
    // establishing one more touches only its own slot
    const adapter = new DiplomacyAdapter(spy.store);
    spy.getFacts.length = 0;
    await must(
      adapter.establishDiplomaticFramework({
        ...diplomacyPublication(41),
        framework: diplomaticFramework(FRAMEWORK_B),
      }),
    );
    expect(spy.getFacts).toEqual([]);
    expect(spy.listCalls()).toBe(0);
  });

  it("the read takes only the read side of a store and grants no write authority", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1);
    const readOnly = { getFact: (k: string) => s.campaign.store.getFact(k) };
    expect(readDiplomaticFramework(readOnly, FRAMEWORK_A)!.fact.key).toBe(key());
    const typed: any = readDiplomaticFramework(readOnly, FRAMEWORK_A);
    expect(Object.keys(typed).sort()).toEqual(["fact", "value"]);
    // a read of an unestablished Framework creates, infers and defaults nothing
    const head = s.campaign.store.head();
    expect(readDiplomaticFramework(readOnly, "absent")).toBeUndefined();
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("the record is stored once per framework_id: no copy per member, relation, instrument, observer, population unit or locus", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A, {
      member_refs: ["m1", "m2", "m3", "m4"],
    });
    expect(diplomacyFacts(s).map((f) => f.key)).toEqual([key()]);
    for (const m of ["m1", "m2", "m3", "m4"])
      expect(s.diplomacy.diplomaticFramework(m)).toBeUndefined();
  });
});

describe("retry and replay converge; a conflicting establishment fails closed", () => {
  it("the same intent presented twice converges on one record and one authoritative receipt", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const framework = diplomaticFramework();
    const first = await must(
      s.diplomacy.establishDiplomaticFramework({ ...diplomacyPublication(1), framework }),
    );
    const head = s.campaign.store.head();
    const second = await must(
      s.diplomacy.establishDiplomaticFramework({ ...diplomacyPublication(1), framework }),
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
    await establishDiplomaticFramework(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    const changed = await s.diplomacy.establishDiplomaticFramework({
      ...diplomacyPublication(1),
      framework: diplomaticFramework(FRAMEWORK_A, { lifecycle_status: "dissolved" }),
    });
    expect(changed.ok).toBe(false);
    expect(s.campaign.store.getFact(key())).toEqual(fact);
  });

  it("a different intent at an occupied framework_id — equal or conflicting content — fails closed under the version-conflict behavior rather than overwriting", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    for (const [n, over] of [
      [2, {}],
      [3, { lifecycle_status: "dissolved" }],
      [4, { member_refs: ["other"], framework_basis: "other" }],
      [5, { collective_decision_rule_ref: "a-rule" }],
      [6, { member_refs: [], charter_or_instrument_refs: [], shared_commitment_refs: [] }],
    ] as const) {
      const out = await s.diplomacy.establishDiplomaticFramework({
        ...diplomacyPublication(n),
        framework: diplomaticFramework(FRAMEWORK_A, over as never),
      });
      expect(out.ok, String(n)).toBe(false);
      expect(!out.ok && out.error.code, String(n)).toBe("VERSION_CONFLICT");
    }
    expect(s.campaign.store.getFact(key())).toEqual(fact);
    expect(diplomacyFacts(s)).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("identical content under a different framework_id is a distinct record: nothing is merged or deduplicated", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A);
    await establishDiplomaticFramework(s, 2, FRAMEWORK_C);
    expect(diplomacyFacts(s)).toHaveLength(2);
  });

  it("a recognition, a dispute, a relation edge and a framework with the same identifier occupy distinct key spaces and do not conflict", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishExternalRecognition(s, 1, "shared-id");
    await establishExternalizedClaimDispute(s, 2, "shared-id");
    await establishRelationEdge(s, 3, "shared-id");
    await establishDiplomaticFramework(s, 4, "shared-id");
    expect(
      diplomacyFacts(s)
        .map((f) => f.key)
        .sort(),
    ).toEqual(
      [
        key("shared-id"),
        diplomacyRecognitionKey("shared-id"),
        diplomacyDisputeKey("shared-id"),
        diplomacyRelationKey("shared-id"),
      ].sort(),
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a missing or malformed field fails closed, and aliases never substitute", () => {
  it("through the adapter: any missing required field, any alias and any unmodelled field is refused before anything is committed", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    for (const f of REQUIRED) {
      const v: any = diplomaticFramework();
      delete v[f];
      const out = await s.diplomacy.establishDiplomaticFramework({
        ...diplomacyPublication(1),
        framework: v,
      });
      expect(!out.ok && out.error.code, f).toBe("INPUT_INVALID");
      const aliased: any = { ...v, [`${f}_alias`]: "x" };
      expect(
        await codeOf(
          s.diplomacy.establishDiplomaticFramework({
            ...diplomacyPublication(1),
            framework: aliased,
          }),
        ),
        `${f} alias`,
      ).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.head()).toEqual(before);
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("the ordinary Publication envelope is parsed through the existing publication contract: a malformed envelope is refused before the Framework is read", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const before = s.campaign.store.head();
    const bad: any = { ...diplomacyPublication(1), group_id: "", framework: diplomaticFramework() };
    const out = await s.diplomacy.establishDiplomaticFramework(bad);
    expect(!out.ok && out.error.code).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(before);
  });

  it("through a raw store commit: the same contract holds, so no caller can bypass the adapter", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 0;
    const v: any = diplomaticFramework();
    const missing = { ...v };
    delete missing.lifecycle_status;
    const noProvenance = { ...v };
    delete noProvenance.provenance_ref;
    const aliased = { ...v, members: v.member_refs };
    delete aliased.member_refs;
    for (const [name, value] of [
      ["missing lifecycle_status", missing],
      ["missing provenance_ref", noProvenance],
      ["member alias", aliased],
      ["singular member_refs", { ...v, member_refs: "a" }],
      ["singular charter_or_instrument_refs", { ...v, charter_or_instrument_refs: "a" }],
      ["singular shared_commitment_refs", { ...v, shared_commitment_refs: "a" }],
      ["array framework_basis", { ...v, framework_basis: ["a"] }],
      ["array membership_rules", { ...v, membership_rules: ["a"] }],
      ["array entry_exit_rules", { ...v, entry_exit_rules: ["a"] }],
      ["array lifecycle_status", { ...v, lifecycle_status: ["a"] }],
      ["array collective_decision_rule_ref", { ...v, collective_decision_rule_ref: ["a"] }],
      ["array provenance_ref", { ...v, provenance_ref: ["a"] }],
      ["dependency_refs", { ...v, dependency_refs: [] }],
      ["junk field", { ...v, score: 1 }],
    ] as const)
      expect(await codeOf(s.campaign.store.commit(raw(++n, value))), name).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });
});

describe("only the establishment is supported: every post-establishment mutation is refused", () => {
  it("the adapter exposes no amendment, membership, exit, suspension, expulsion, succession, dissolution, decision or lifecycle-transition method", () => {
    const methods = Object.getOwnPropertyNames(DiplomacyAdapter.prototype)
      .filter((m) => m !== "constructor")
      .sort();
    expect(methods).toContain("establishDiplomaticFramework");
    expect(methods).toContain("diplomaticFramework");
    for (const m of methods)
      expect(m).not.toMatch(
        /admit|join|enter|exit|leave|suspend|expel|succe|dissol|retire|transition|amend|update|withdraw|supersede|mutate|link|associate|index|rebuild|derive|vote|tally|decide|decision|propagate/i,
      );
  });

  it("every raw expected-version write to an established Framework — membership, entry/exit, suspension, expulsion, succession, dissolution, lifecycle — is an unsupported amendment; an occupied create is a version conflict", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1);
    const fact = structuredClone(s.campaign.store.getFact(key()));
    const over = (o: Record<string, unknown>) => diplomaticFramework(FRAMEWORK_A, o as never);
    let n = 200;
    for (const [expected_version, value, code] of [
      [1, over({ member_refs: ["joined", "m"] }), "AMENDMENT_NOT_SUPPORTED"], // admission
      [1, over({ member_refs: [] }), "AMENDMENT_NOT_SUPPORTED"], // exit / expulsion
      [1, over({ lifecycle_status: "suspended" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ lifecycle_status: "dissolved" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ lifecycle_status: "successor" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ membership_rules: "new rules" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ entry_exit_rules: "new rules" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ charter_or_instrument_refs: ["amended"] }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ shared_commitment_refs: ["new"] }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ collective_decision_rule_ref: "r" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, diplomaticFramework(), "AMENDMENT_NOT_SUPPORTED"], // even an unchanged re-statement
      [2, over({ lifecycle_status: "dissolved" }), "VERSION_CONFLICT"],
      [0, over({ lifecycle_status: "dissolved" }), "VERSION_CONFLICT"],
      [0, diplomaticFramework(), "VERSION_CONFLICT"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, value, { expected_version }))),
        `${expected_version} ${JSON.stringify(value)}`,
      ).toBe(code);
    expect(s.campaign.store.getFact(key())).toEqual(fact);
  });

  it("admission authorizes only a single-write Framework group: an extra write, a different key space or an unrelated value is refused", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const two = group(
      FIXTURE_CAMPAIGN,
      300,
      [
        write(key(), diplomaticFramework() as never, {
          owner: "diplomacy",
          facet: "diplomacy_framework",
        }),
        write(key(FRAMEWORK_B), diplomaticFramework(FRAMEWORK_B) as never, {
          owner: "diplomacy",
          facet: "diplomacy_framework",
        }),
      ],
      { owner: "diplomacy", facet: "diplomacy_framework", rule: DIPLOMACY_FRAMEWORK_RULE },
    );
    expect(await codeOf(s.campaign.store.commit(two))).toBe("VALUE_INVALID");
    expect(diplomacyGroupCheck(two, { facts: new Map() } as never)?.code).toBe("VALUE_INVALID");
    // a Framework written together with a sibling Diplomacy record is refused too: no reciprocal or per-member copy
    const withSibling = group(
      FIXTURE_CAMPAIGN,
      301,
      [
        write(key(), diplomaticFramework() as never, {
          owner: "diplomacy",
          facet: "diplomacy_framework",
        }),
        write(diplomacyRelationKey("r1"), relationEdge("r1") as never, {
          owner: "diplomacy",
          facet: "diplomacy_relation_edge",
        }),
      ],
      { owner: "diplomacy", facet: "diplomacy_framework", rule: DIPLOMACY_FRAMEWORK_RULE },
    );
    expect(await codeOf(s.campaign.store.commit(withSibling))).not.toBeNull();
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("a Framework group that reads or depends on anything is refused: no prerequisite pin or dependency is invented", async () => {
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
        await codeOf(s.campaign.store.commit(raw(++n, diplomaticFramework(), over as never))),
        JSON.stringify(over),
      ).toBe("REFERENCE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("a Framework is committed under its own citation and at the key its framework_id derives; a sibling or GIP citation does not authorize it", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    for (const rule of [
      GIP_RULE,
      DIPLOMACY_RECOGNITION_RULE,
      DIPLOMACY_CLAIM_DISPUTE_RULE,
      DIPLOMACY_RELATION_EDGE_RULE,
    ])
      expect(await codeOf(s.campaign.store.commit(raw(310, diplomaticFramework(), { rule })))).toBe(
        "REFERENCE_INVALID",
      );
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(311, diplomaticFramework(FRAMEWORK_A), { key: key(FRAMEWORK_B) }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("the new citation covers WS-008 §§2.1-2.2, §4, §16, §§19-24, §29.3, §29.5 and §29.7 and is recorded on every committed Framework", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1);
    const rule = s.campaign.store.getFact(key())!.provenance.rule;
    expect(rule).toEqual(DIPLOMACY_FRAMEWORK_RULE);
    for (const c of ["§§2.1-2.2", "§4 ", "§16 ", "§§19-24 ", "§29.3 ", "§29.5 ", "§29.7 "])
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
  it("the framework facet belongs to the one Diplomacy owner: the sibling facets cannot write the framework key space and vice versa", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 400;
    for (const [facet, rule] of [
      ["diplomacy_external_recognition", DIPLOMACY_RECOGNITION_RULE],
      ["diplomacy_externalized_claim_dispute", DIPLOMACY_CLAIM_DISPUTE_RULE],
      ["diplomacy_relation_edge", DIPLOMACY_RELATION_EDGE_RULE],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, diplomaticFramework(), { facet, rule }))),
        facet,
      ).toBe("KEY_NOT_ADMITTED");
    for (const [k, value] of [
      [diplomacyRecognitionKey("x1"), externalRecognition("x1")],
      [diplomacyDisputeKey("x1"), externalizedClaimDispute("x1")],
      [diplomacyRelationKey("x1"), relationEdge("x1")],
    ] as const)
      expect(
        await codeOf(
          s.campaign.store.commit(
            raw(++n, value, {
              key: k,
              facet: "diplomacy_framework",
              rule: DIPLOMACY_FRAMEWORK_RULE,
            }),
          ),
        ),
        k,
      ).toBe("KEY_NOT_ADMITTED");
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

  it("no other registered owner may write the framework key space, and the Diplomacy owner may write no other owner's key space", async () => {
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
        await codeOf(s.campaign.store.commit(raw(++n, diplomaticFramework(), { owner, facet }))),
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

  it("no Channel, Negotiation Record, Instrument, Clause, Binding Entry, compliance, derived-index, member or sibling key space exists: each is outside every registered key space", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    let n = 500;
    for (const k of [
      "diplomacy/framework",
      "diplomacy/framework/f1/x",
      "diplomacy/framework/f1/members",
      "diplomacy/framework/f1/member/m1",
      "diplomacy/framework/f1/charter",
      "diplomacy/framework/f1/commitments",
      "diplomacy/framework-index/f1",
      "diplomacy/frameworks/f1",
      "diplomacy/relation/r1/frameworks",
      "diplomacy/channel/c1",
      "diplomacy/negotiation/n1",
      "diplomacy/instrument/i1",
      "diplomacy/instrument/i1/clause/c1",
      "diplomacy/binding/b1",
      "diplomacy/compliance/c1",
      "diplomacy/receipt/r1",
      "diplomacy/vote/v1",
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw(++n, diplomaticFramework(), { key: k }))),
        k,
      ).toBe("KEY_NOT_ADMITTED");
    expect(ALL_FACT_KINDS.filter((k) => k.owner === "diplomacy").map((k) => k.id)).toEqual([
      "diplomacy_external_recognition",
      "diplomacy_claim_dispute",
      "diplomacy_relation_edge",
      "diplomacy_framework",
    ]);
    expect(diplomacyFacts(s)).toEqual([]);
  });

  it("establishing a Framework writes only its own key: no Relation Edge, Recognition, Claim / Dispute, GIP, World, Actor, ACS, Population, Economy, Epistemic, KTI or other foreign fact", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await seedInstitutionLikeNeighbors({ campaign: s.campaign, gip: s.gip });
    await establishGipAuthority(s, 20);
    await establishExternalRecognition(s, 25, "existing-recognition");
    await establishExternalizedClaimDispute(s, 26, "existing-dispute");
    await establishRelationEdge(s, 27, "existing-relation");
    const before = structuredClone(s.campaign.store.listFacts());
    const head = s.campaign.store.head();
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A, {
      member_refs: [magistrateKey, "world/fixture-world/locus/fixture-locus"],
    });
    const after = s.campaign.store.listFacts();
    expect(after.length).toBe(before.length + 1);
    expect(after.filter((f) => f.key !== key())).toEqual(before);
    expect(s.campaign.store.head().revision).toBe(head.revision + 1);
    for (const f of before) expect(s.campaign.store.getFact(f.key)).toEqual(f);
  });

  it("predecessor Diplomacy facts remain readable and byte/behavior compatible once a Framework exists beside them", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    const recognition = await establishExternalRecognition(s, 1, "rec-1");
    const dispute = await establishExternalizedClaimDispute(s, 2, "disp-1");
    const relation = await establishRelationEdge(s, 3, "rel-1");
    const saved = structuredClone([
      s.campaign.store.getFact(diplomacyRecognitionKey("rec-1")),
      s.campaign.store.getFact(diplomacyDisputeKey("disp-1")),
      s.campaign.store.getFact(diplomacyRelationKey("rel-1")),
    ]);
    await establishDiplomaticFramework(s, 4);
    expect(s.diplomacy.externalRecognition("rec-1")!.value).toEqual(recognition);
    expect(s.diplomacy.externalizedClaimDispute("disp-1")!.value).toEqual(dispute);
    expect(s.diplomacy.relationEdge("rel-1")!.value).toEqual(relation);
    expect([
      s.campaign.store.getFact(diplomacyRecognitionKey("rec-1")),
      s.campaign.store.getFact(diplomacyDisputeKey("disp-1")),
      s.campaign.store.getFact(diplomacyRelationKey("rel-1")),
    ]).toEqual(saved);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("no clock, scheduler, watcher or polling loop on the framework path", () => {
  it("establishing a Framework registers no boundary and no temporal object", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A, { lifecycle_status: "ACTIVE" });
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
  });

  it("a temporal object still cannot produce a framework key or be owned by Diplomacy", async () => {
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
  it("a campaign with Frameworks, a relation edge, a recognition and a dispute verifies clean", async () => {
    const s = await seededDiplomacyCampaign(tempDir());
    await establishGipAuthority(s, 10);
    await establishDiplomaticFramework(s, 1, FRAMEWORK_A);
    await must(
      s.diplomacy.establishDiplomaticFramework({
        ...diplomacyPublication(2),
        framework: fullDiplomaticFramework(FRAMEWORK_B),
      }),
    );
    await establishRelationEdge(s, 3, "r1");
    await establishExternalizedClaimDispute(s, 4, "d1");
    await establishExternalRecognition(s, 5);
    expect(verifyDiplomacyIntegrity(s.campaign.store)).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });
});
