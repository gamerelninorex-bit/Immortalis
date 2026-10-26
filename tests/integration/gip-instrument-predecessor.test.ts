import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and journal values */
// GIP Governance Instrument Predecessor Reference Foundation (twenty-first bounded slice) — an authored initial Governance Instrument
// may optionally carry the exact WS-007 §4.3 `predecessor_instrument_ref`: one optional, singular, opaque reference, carried exactly
// as authored and never dereferenced. It adds no read, dependency, second commit, identity dimension, lifecycle or validity change,
// reciprocal edge or foreign-owner mutation. New writes carry the successor governing-rule citation; sixteenth-slice core-only
// Instruments keep loading unchanged under the historical citation, which never authorized the field.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-16; IM-03, IM-06, IM-11, IM-12, IM-17. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  gipInstitutionIdentityKey,
  CANON_WRITE_AUTHORITY,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  GIP_INSTRUMENT_RULE,
  GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
  GIP_OFFICE_RULE,
  GIP_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  createFileCampaign,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  FIXTURE_CAMPAIGN,
  INSTITUTION_COURT,
  INSTRUMENT_A,
  INSTRUMENT_B,
  INSTRUMENT_C,
  OFFICE_MAGISTRATE,
  PREDECESSOR_INSTRUMENT_REF_A,
  PREDECESSOR_INSTRUMENT_REF_B,
  SCOPE_BINDING_A,
  gipPublication,
  governanceInstrument,
  governanceInstrumentWithPredecessor,
  group,
  institutionIdentity,
  officeAuthorityLocus,
  scopeBinding,
  write,
} from "@immortalis/testkit";
import {
  establishGovernanceInstrument,
  establishInstitution,
  establishOffice,
  establishScopeBinding,
  gipFacts,
  reopenGip,
  seedInstitutionLikeNeighbors,
  seededGipCampaign,
} from "../support/gip.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const bindingKey = gipScopeBindingKey(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
const instrumentKey = (id = INSTRUMENT_A) => gipInstrumentKey(id);

/** An institution, one office and one Scope Binding of that office: the existing Instrument prerequisites. */
async function withBinding(dir = tempDir()) {
  const s = await seededGipCampaign(dir);
  await establishInstitution(s, 1);
  await establishOffice(s, 2);
  await establishScopeBinding(s, 3);
  return s;
}

describe("a core-only Instrument commits, retries, saves and reloads unchanged under the successor citation (acceptance 3, 13)", () => {
  it("commits the seven-field value exactly: omission is absence and nothing is synthesized", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4);
    const fact = s.campaign.store.getFact(instrumentKey())!;
    expect(fact.value).toEqual(governanceInstrument());
    expect("predecessor_instrument_ref" in (fact.value as object)).toBe(false);
    expect(JSON.stringify(fact.value)).toBe(JSON.stringify(governanceInstrument()));
    expect(fact.provenance.rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(fact.provenance.rule).not.toEqual(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE);
    expect("predecessor_instrument_ref" in s.gip.governanceInstrument(INSTRUMENT_A)!.value).toBe(
      false,
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("retries by identity and survives save → close → load → continue byte-for-byte, with no migration or rewrite", async () => {
    const dir = tempDir();
    const s = await withBinding(dir);
    const first = await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrument(),
      }),
    );
    const fact = structuredClone(s.campaign.store.getFact(instrumentKey())!);
    const head = s.campaign.store.head();
    const again = await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrument(),
      }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(s.campaign.store.head()).toEqual(head);
    await s.campaign.close();

    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.store.getFact(instrumentKey())).toEqual(fact);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    await r.campaign.close();
  });
});

describe("a new Instrument carrying the optional reference commits and round-trips exactly (acceptance 4)", () => {
  it("commits the eight-field value under the sole GIP owner/facet, the unchanged canonical key and the successor citation, as one create-only write", async () => {
    const s = await withBinding();
    const before = s.campaign.store.head();
    const authored = governanceInstrumentWithPredecessor();
    const outcome = await must(
      s.gip.establishGovernanceInstrument({ ...gipPublication(4), instrument: authored }),
    );
    expect(outcome.replayed).toBe(false);
    const fact = s.campaign.store.getFact(instrumentKey())!;
    expect(fact.owner).toBe("gip");
    expect(fact.facet).toBe("gip_institution_identity");
    expect(fact.version).toBe(1);
    expect(fact.value).toEqual({
      ...governanceInstrument(),
      predecessor_instrument_ref: PREDECESSOR_INSTRUMENT_REF_A,
    });
    expect(JSON.stringify(fact.value)).toBe(JSON.stringify(authored));
    expect(fact.provenance.rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([
      courtKey,
      magistrateKey,
      bindingKey,
      instrumentKey(),
    ]);
    expect(s.gip.governanceInstrument(INSTRUMENT_A)?.value).toEqual(authored);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("round-trips through save → close → load exactly beside a core-only Instrument, still verifies, and keeps converging", async () => {
    const dir = tempDir();
    const s = await withBinding(dir);
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(),
      }),
    );
    await establishGovernanceInstrument(s, 5, INSTRUMENT_B);
    const saved = structuredClone(s.campaign.store.getFact(instrumentKey())!);
    const savedCore = structuredClone(s.campaign.store.getFact(instrumentKey(INSTRUMENT_B))!);
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(4).intent_id));
    await s.campaign.close();

    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.store.getFact(instrumentKey())).toEqual(saved);
    expect(r.campaign.store.getFact(instrumentKey(INSTRUMENT_B))).toEqual(savedCore);
    expect(r.campaign.store.lookupReceipt(gipPublication(4).intent_id)).toEqual(receipt);
    expect(r.gip.governanceInstrument(INSTRUMENT_A)?.fact).toEqual(saved);
    const again = await must(
      r.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(),
      }),
    );
    expect(again.replayed).toBe(true);
    await r.campaign.close();

    const r2 = await reopenGip(dir, "gip-reopen-2");
    expect(r2.campaign.verify()).toEqual([]);
    expect(r2.campaign.store.getFact(instrumentKey())).toEqual(saved);
    await r2.campaign.close();
  });
});

describe("the reference is carried, never dereferenced, defaulted, derived or enforced (acceptance 7, 8, 10, 11)", () => {
  it("a well-formed reference to nothing that exists is carried as authored; the referent is never read, written, back-linked or created", async () => {
    const s = await withBinding();
    await seedInstitutionLikeNeighbors(s);
    const neighbors = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
    expect(s.campaign.store.getFact(instrumentKey(INSTRUMENT_B))).toBeUndefined();
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    // the reference names an Instrument-shaped identifier that does not exist
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_A, INSTRUMENT_B),
      }),
    );
    expect(gip.governanceInstrument(INSTRUMENT_A)?.value.predecessor_instrument_ref).toBe(
      INSTRUMENT_B,
    );
    // only the existing prerequisites and the Instrument's own slot were probed: never the named predecessor
    const allowed = new Set([magistrateKey, bindingKey, instrumentKey(INSTRUMENT_A)]);
    for (const k of spy.getFacts) expect(allowed.has(k), k).toBe(true);
    expect(spy.getFacts).not.toContain(instrumentKey(INSTRUMENT_B));
    expect(spy.listCalls()).toBe(0);
    expect(s.campaign.store.getFact(instrumentKey(INSTRUMENT_B))).toBeUndefined();
    // every pre-existing fact of every owner is byte-identical
    for (const [key, fact] of neighbors) expect(s.campaign.store.getFact(key)).toEqual(fact);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an existing predecessor Instrument is likewise untouched: not read, not mutated, not back-linked, no successor pointer, no supersession, lifecycle or validity change", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4, INSTRUMENT_B);
    const predecessor = structuredClone(s.campaign.store.getFact(instrumentKey(INSTRUMENT_B))!);
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(5),
        instrument: governanceInstrumentWithPredecessor(
          INSTRUMENT_A,
          INSTRUMENT_B,
          INSTITUTION_COURT,
          OFFICE_MAGISTRATE,
          SCOPE_BINDING_A,
          { lifecycle_status: "proposed" },
        ),
      }),
    );
    expect(spy.getFacts).not.toContain(instrumentKey(INSTRUMENT_B));
    const after = s.campaign.store.getFact(instrumentKey(INSTRUMENT_B))!;
    expect(after).toEqual(predecessor);
    expect(after.version).toBe(1);
    expect(after.value).toEqual(governanceInstrument(INSTRUMENT_B));
    expect(JSON.stringify(after.value)).not.toContain(INSTRUMENT_A);
    // the referenced Instrument stays active and valid; the new one carries its own authored lifecycle only
    expect((after.value as any).lifecycle_status).toBe("active");
    expect((after.value as any).validity_by_order[0].validity_status).toBe("valid");
    expect(s.campaign.store.getFact(instrumentKey(INSTRUMENT_A))!.version).toBe(1);
    // the commit's own group names no predecessor key anywhere
    const g = s.campaign.store.committedGroup(gipPublication(5).intent_id)!;
    expect(JSON.stringify([g.reads, g.depends_on, g.writes.map((w) => w.key)])).not.toContain(
      instrumentKey(INSTRUMENT_B),
    );
  });

  it("presence or value of the reference does not alter the canonical key or the Instrument slot", async () => {
    const s = await withBinding();
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_A, PREDECESSOR_INSTRUMENT_REF_A),
      }),
    );
    const fact = structuredClone(s.campaign.store.getFact(instrumentKey()));
    const head = s.campaign.store.head();
    // the same instrument_id addresses the same occupied slot whatever the optional reference: absent, equal or different
    for (const [n, instrument] of [
      [5, governanceInstrument()],
      [6, governanceInstrumentWithPredecessor(INSTRUMENT_A, PREDECESSOR_INSTRUMENT_REF_A)],
      [7, governanceInstrumentWithPredecessor(INSTRUMENT_A, PREDECESSOR_INSTRUMENT_REF_B)],
    ] as const)
      expect(
        await codeOf(s.gip.establishGovernanceInstrument({ ...gipPublication(n), instrument })),
        `n=${n}`,
      ).not.toBe("OK");
    expect(s.campaign.store.getFact(instrumentKey())).toEqual(fact);
    expect(s.campaign.store.head()).toEqual(head);
    expect(gipFacts(s).filter((f) => f.key.startsWith("gip/instrument/"))).toHaveLength(1);
  });

  it("two Instruments may name the same predecessor reference, and one may name another: it is not an identity dimension and links nothing", async () => {
    const s = await withBinding();
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_A, INSTRUMENT_C),
      }),
    );
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(5),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_B, INSTRUMENT_C),
      }),
    );
    // a reference cycle is just two authored strings: no graph, order or loop check exists
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(6),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_C, INSTRUMENT_A),
      }),
    );
    expect(gipFacts(s).map((f) => f.key)).toEqual([
      courtKey,
      magistrateKey,
      bindingKey,
      instrumentKey(INSTRUMENT_A),
      instrumentKey(INSTRUMENT_B),
      instrumentKey(INSTRUMENT_C),
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an Instrument may name itself as the reference: carried as authored text, with no self-reference rule", async () => {
    const s = await withBinding();
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_A, INSTRUMENT_A),
      }),
    );
    expect(s.gip.governanceInstrument(INSTRUMENT_A)?.value.predecessor_instrument_ref).toBe(
      INSTRUMENT_A,
    );
  });

  it("no lifecycle or validity transition occurs because the reference is present: every authored lifecycle and validity value is carried unchanged", async () => {
    const s = await withBinding();
    for (const [n, id, lifecycle_status] of [
      [4, INSTRUMENT_A, "proposed"],
      [5, INSTRUMENT_B, "active"],
      [6, INSTRUMENT_C, "repealed"],
    ] as const) {
      await must(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(n),
          instrument: governanceInstrumentWithPredecessor(
            id,
            PREDECESSOR_INSTRUMENT_REF_A,
            INSTITUTION_COURT,
            OFFICE_MAGISTRATE,
            SCOPE_BINDING_A,
            {
              lifecycle_status,
              validity_by_order: [
                { governing_order_ref: "governing-order-ref-a-1", validity_status: "contested" },
              ],
            },
          ),
        }),
      );
      const fact = s.campaign.store.getFact(instrumentKey(id))!;
      expect(fact.version).toBe(1);
      expect((fact.value as any).lifecycle_status).toBe(lifecycle_status);
      expect((fact.value as any).validity_by_order).toEqual([
        { governing_order_ref: "governing-order-ref-a-1", validity_status: "contested" },
      ]);
    }
  });
});

describe("establishment with the reference reads and depends on only the existing prerequisites and writes exactly one Instrument key (acceptance 9)", () => {
  it("the committed group is one create-only write pinning exactly the source office and the Scope Binding", async () => {
    const s = await withBinding();
    await seedInstitutionLikeNeighbors(s);
    const before = new Map(s.campaign.store.listFacts().map((f) => [f.key, f]));
    const office = s.campaign.store.getFact(magistrateKey)!;
    const binding = s.campaign.store.getFact(bindingKey)!;
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(),
      }),
    );
    expect(spy.commits).toHaveLength(1); // one commit, never a second
    const g = spy.commits[0]!;
    expect(g.reads).toEqual([
      { key: magistrateKey, version: office.version },
      { key: bindingKey, version: binding.version },
    ]);
    expect(g.depends_on).toEqual([office.provenance.group_id, binding.provenance.group_id]);
    expect(g.writes).toHaveLength(1);
    expect(g.writes[0]!.key).toBe(instrumentKey());
    expect(g.writes[0]!.expected_version).toBe(0);
    expect(g.rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(spy.listCalls()).toBe(0);
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added.map((f) => f.key)).toEqual([instrumentKey()]);
    for (const [key, fact] of before) expect(s.campaign.store.getFact(key)).toEqual(fact);
    // identical in shape to a core-only establishment: the reference adds no read, dependency or write
    const control = await withBinding();
    const controlSpy = spyStore(control.campaign.store);
    await must(
      new GipAdapter(controlSpy.store).establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrument(),
      }),
    );
    const c = controlSpy.commits[0]!;
    expect(c.reads).toEqual(g.reads);
    expect(c.depends_on).toEqual(g.depends_on);
    expect(c.writes.map((w) => [w.key, w.expected_version])).toEqual(
      g.writes.map((w) => [w.key, w.expected_version]),
    );
    expect(c.rule).toEqual(g.rule);
  });

  it("the existing prerequisites still apply beside the reference: a missing office or binding refuses the group and creates nothing", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1);
    const head = s.campaign.store.head();
    // no office, no binding
    expect(
      await codeOf(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(2),
          instrument: governanceInstrumentWithPredecessor(),
        }),
      ),
    ).not.toBe("OK");
    await establishOffice(s, 3);
    // an office but no binding of it
    expect(
      await codeOf(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(4),
          instrument: governanceInstrumentWithPredecessor(),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(instrumentKey())).toBeUndefined();
    expect(s.campaign.store.head().revision).toBe(head.revision + 1); // only the office
  });

  it("a hand-built group that adds a read, dependency or second write for the predecessor is refused", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4, INSTRUMENT_B);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const binding = s.campaign.store.getFact(bindingKey)!;
    const predecessor = s.campaign.store.getFact(instrumentKey(INSTRUMENT_B))!;
    const raw = (n: number, over: Partial<CommitGroup>): CommitGroup => ({
      campaign_id: FIXTURE_CAMPAIGN,
      owner: "gip",
      facet: "gip_institution_identity",
      group_id: `raw-group-${n}`,
      intent_id: `raw-intent-${n}`,
      cause: `raw-cause-${n}`,
      rule: GIP_INSTRUMENT_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [
        { key: magistrateKey, version: office.version },
        { key: bindingKey, version: binding.version },
      ],
      depends_on: [office.provenance.group_id, binding.provenance.group_id],
      writes: [
        write(
          instrumentKey(),
          governanceInstrumentWithPredecessor(INSTRUMENT_A, INSTRUMENT_B) as never,
          { owner: "gip", facet: "gip_institution_identity" },
        ),
      ],
      ...over,
    });
    const lawful = raw(1, {});
    const extraRead = raw(2, {
      reads: [...lawful.reads, { key: instrumentKey(INSTRUMENT_B), version: predecessor.version }],
    });
    const extraDep = raw(3, {
      depends_on: [...lawful.depends_on, predecessor.provenance.group_id],
    });
    const extraBoth = raw(4, {
      reads: extraRead.reads,
      depends_on: extraDep.depends_on,
    });
    const backLink = raw(5, {
      writes: [
        ...lawful.writes,
        write(
          instrumentKey(INSTRUMENT_B),
          governanceInstrument(INSTRUMENT_B, undefined, undefined, undefined, {
            lifecycle_status: "superseded",
          }) as never,
          {
            owner: "gip",
            facet: "gip_institution_identity",
            expected_version: predecessor.version,
          },
        ),
      ],
    });
    const head = s.campaign.store.head();
    for (const [name, g] of Object.entries({ extraRead, extraDep, extraBoth, backLink }))
      expect(await codeOf(s.campaign.store.commit(g)), name).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(instrumentKey(INSTRUMENT_B))).toEqual(predecessor);
    expect(s.campaign.store.getFact(instrumentKey())).toBeUndefined();
    // and the lawful shape, after all of that, still commits
    await must(s.campaign.store.commit(lawful));
    expect(s.campaign.store.getFact(instrumentKey())!.value).toEqual(
      governanceInstrumentWithPredecessor(INSTRUMENT_A, INSTRUMENT_B),
    );
  });
});

describe("new writes use only the successor citation; the historical citation is refused for new writes (acceptance 12)", () => {
  it("a new write carrying the sixteenth-slice or any other citation is refused by admission, with or without the reference", async () => {
    const s = await withBinding();
    const office = s.campaign.store.getFact(magistrateKey)!;
    const binding = s.campaign.store.getFact(bindingKey)!;
    let n = 100;
    const raw = (value: unknown, rule: unknown): CommitGroup => {
      n++;
      return {
        campaign_id: FIXTURE_CAMPAIGN,
        owner: "gip",
        facet: "gip_institution_identity",
        group_id: `raw-group-${n}`,
        intent_id: `raw-intent-${n}`,
        cause: `raw-cause-${n}`,
        rule: rule as never,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [
          { key: magistrateKey, version: office.version },
          { key: bindingKey, version: binding.version },
        ],
        depends_on: [office.provenance.group_id, binding.provenance.group_id],
        writes: [
          write(instrumentKey(), value as never, {
            owner: "gip",
            facet: "gip_institution_identity",
          }),
        ],
      };
    };
    for (const value of [governanceInstrument(), governanceInstrumentWithPredecessor()])
      for (const rule of [
        GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
        { ...GIP_INSTRUMENT_RULE, clause: "drifted" },
        { ...GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE, clause: "drifted" },
        GIP_SCOPE_BINDING_RULE,
        GIP_OFFICE_RULE,
        GIP_RULE,
      ])
        expect(
          await codeOf(s.campaign.store.commit(raw(value, rule))),
          JSON.stringify(value) + JSON.stringify(rule).slice(0, 50),
        ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(instrumentKey())).toBeUndefined();
    // control: the successor citation is admitted for both shapes
    await must(
      s.campaign.store.commit(raw(governanceInstrumentWithPredecessor(), GIP_INSTRUMENT_RULE)),
    );
    await must(
      s.campaign.store.commit({
        ...raw(governanceInstrument(INSTRUMENT_B), GIP_INSTRUMENT_RULE),
        writes: [
          write(instrumentKey(INSTRUMENT_B), governanceInstrument(INSTRUMENT_B) as never, {
            owner: "gip",
            facet: "gip_institution_identity",
          }),
        ],
      }),
    );
  });

  it("the adapter stamps the successor citation on every new Instrument, with or without the reference", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4, INSTRUMENT_A);
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(5),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_B),
      }),
    );
    for (const id of [INSTRUMENT_A, INSTRUMENT_B])
      expect(s.campaign.store.getFact(instrumentKey(id))!.provenance.rule).toEqual(
        GIP_INSTRUMENT_RULE,
      );
  });
});

describe("a conflicting establishment fails closed under the existing reconciliation rules (acceptance 5, 6)", () => {
  it("the same intent with a changed, added or removed reference is a changed-intent conflict; the committed Instrument stands", async () => {
    const s = await withBinding();
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_A, PREDECESSOR_INSTRUMENT_REF_A),
      }),
    );
    const fact = structuredClone(s.campaign.store.getFact(instrumentKey()));
    const head = s.campaign.store.head();
    for (const instrument of [
      governanceInstrumentWithPredecessor(INSTRUMENT_A, PREDECESSOR_INSTRUMENT_REF_B),
      governanceInstrument(),
    ])
      expect(
        await codeOf(s.gip.establishGovernanceInstrument({ ...gipPublication(4), instrument })),
        JSON.stringify(instrument),
      ).not.toBe("OK");
    expect(s.campaign.store.getFact(instrumentKey())).toEqual(fact);
    expect(s.campaign.store.head()).toEqual(head);

    // and the reverse: a core-only Instrument is not silently given a reference by a changed retry
    const s2 = await withBinding();
    await establishGovernanceInstrument(s2, 4);
    const core = structuredClone(s2.campaign.store.getFact(instrumentKey()));
    expect(
      await codeOf(
        s2.gip.establishGovernanceInstrument({
          ...gipPublication(4),
          instrument: governanceInstrumentWithPredecessor(),
        }),
      ),
    ).not.toBe("OK");
    expect(s2.campaign.store.getFact(instrumentKey())).toEqual(core);
  });

  it("a different establishment at an occupied instrument_id fails closed and mints no sibling Instrument", async () => {
    const s = await withBinding();
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(),
      }),
    );
    const fact = structuredClone(s.campaign.store.getFact(instrumentKey()));
    expect(
      await codeOf(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(5),
          instrument: governanceInstrumentWithPredecessor(
            INSTRUMENT_A,
            PREDECESSOR_INSTRUMENT_REF_B,
            INSTITUTION_COURT,
            OFFICE_MAGISTRATE,
            SCOPE_BINDING_A,
            { operative_effect: "prohibition" },
          ),
        }),
      ),
    ).not.toBe("OK");
    expect(gipFacts(s).filter((f) => f.key.startsWith("gip/instrument/"))).toHaveLength(1);
    expect(s.campaign.store.getFact(instrumentKey())).toEqual(fact);
  });

  it("a malformed, plural, aliased or null reference — and every other §4.3 field — is refused with nothing committed", async () => {
    const s = await withBinding();
    const head = s.campaign.store.head();
    for (const bad of [
      { ...governanceInstrument(), predecessor_instrument_ref: null },
      { ...governanceInstrument(), predecessor_instrument_ref: undefined },
      { ...governanceInstrument(), predecessor_instrument_ref: "" },
      { ...governanceInstrument(), predecessor_instrument_ref: "two words" },
      { ...governanceInstrument(), predecessor_instrument_ref: [PREDECESSOR_INSTRUMENT_REF_A] },
      {
        ...governanceInstrument(),
        predecessor_instrument_ref: { id: PREDECESSOR_INSTRUMENT_REF_A },
      },
      { ...governanceInstrument(), predecessor_instrument_refs: [PREDECESSOR_INSTRUMENT_REF_A] },
      { ...governanceInstrument(), predecessor_ref: PREDECESSOR_INSTRUMENT_REF_A },
      { ...governanceInstrument(), predecessor_instrument: PREDECESSOR_INSTRUMENT_REF_A },
      { ...governanceInstrumentWithPredecessor(), supersession_ref: "x-ref-1" },
      { ...governanceInstrumentWithPredecessor(), activation_condition: "x" },
      { ...governanceInstrumentWithPredecessor(), effective_from: "x" },
      { ...governanceInstrumentWithPredecessor(), provenance_note: "x" },
      { ...governanceInstrumentWithPredecessor(), clauses: [] },
    ])
      expect(
        await codeOf(
          s.gip.establishGovernanceInstrument({ ...gipPublication(4), instrument: bad as never }),
        ),
        JSON.stringify(bad),
      ).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
    expect(gipFacts(s).filter((f) => f.key.startsWith("gip/instrument/"))).toEqual([]);
  });

  it("admission also refuses a hand-built group carrying a malformed reference or another §4.3 field", async () => {
    const s = await withBinding();
    const office = s.campaign.store.getFact(magistrateKey)!;
    const binding = s.campaign.store.getFact(bindingKey)!;
    let n = 200;
    for (const bad of [
      { ...governanceInstrument(), predecessor_instrument_ref: null },
      { ...governanceInstrument(), predecessor_instrument_ref: [PREDECESSOR_INSTRUMENT_REF_A] },
      { ...governanceInstrument(), predecessor_instrument_ref: "two words" },
      { ...governanceInstrument(), predecessor_instrument_refs: [PREDECESSOR_INSTRUMENT_REF_A] },
      { ...governanceInstrumentWithPredecessor(), supersession_ref: "x-ref-1" },
    ]) {
      n++;
      expect(
        await codeOf(
          s.campaign.store.commit({
            campaign_id: FIXTURE_CAMPAIGN,
            owner: "gip",
            facet: "gip_institution_identity",
            group_id: `raw-group-${n}`,
            intent_id: `raw-intent-${n}`,
            cause: `raw-cause-${n}`,
            rule: GIP_INSTRUMENT_RULE,
            authority: { ...CANON_WRITE_AUTHORITY },
            reads: [
              { key: magistrateKey, version: office.version },
              { key: bindingKey, version: binding.version },
            ],
            depends_on: [office.provenance.group_id, binding.provenance.group_id],
            writes: [
              write(instrumentKey(), bad as never, {
                owner: "gip",
                facet: "gip_institution_identity",
              }),
            ],
          }),
        ),
        JSON.stringify(bad),
      ).toBe("VALUE_INVALID");
    }
    expect(s.campaign.store.getFact(instrumentKey())).toBeUndefined();
  });
});

describe("existing Institution Identity, Office and Scope Binding semantics are unchanged by the reference (acceptance 15)", () => {
  it("the chain beneath an Instrument carrying a reference is value-for-value and citation-for-citation identical to the chain beneath a core-only Instrument", async () => {
    const chain = async (instrument: ReturnType<typeof governanceInstrument>) => {
      const s = await withBinding();
      await must(s.gip.establishGovernanceInstrument({ ...gipPublication(4), instrument }));
      expect(s.campaign.verify()).toEqual([]);
      return s;
    };
    const core = await chain(governanceInstrument());
    const withRef = await chain(governanceInstrumentWithPredecessor());
    const keys = (s: Awaited<ReturnType<typeof chain>>) => gipFacts(s).map((f) => f.key);
    expect(keys(withRef)).toEqual(keys(core));
    for (const key of keys(core).filter((k) => k !== instrumentKey())) {
      const a = core.campaign.store.getFact(key)!;
      const b = withRef.campaign.store.getFact(key)!;
      expect(b.value, key).toEqual(a.value);
      expect(b.provenance.rule, key).toEqual(a.provenance.rule);
      expect(b.version, key).toBe(a.version);
      expect(JSON.stringify(b.value)).not.toContain(PREDECESSOR_INSTRUMENT_REF_A);
    }
    // the identity, office and binding keep their own citations (the Instrument successor citation is not reused)
    expect(withRef.campaign.store.getFact(courtKey)!.provenance.rule).toEqual(GIP_RULE);
    expect(withRef.campaign.store.getFact(magistrateKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(withRef.campaign.store.getFact(bindingKey)!.provenance.rule).toEqual(
      GIP_SCOPE_BINDING_RULE,
    );
    expect(withRef.campaign.store.getFact(courtKey)!.value).toEqual(institutionIdentity());
    expect(withRef.campaign.store.getFact(magistrateKey)!.value).toEqual(officeAuthorityLocus());
    expect(withRef.campaign.store.getFact(bindingKey)!.value).toEqual(scopeBinding());
  });
});

// ---------------------------------------------------------------------------------------------------------------------------
// Historical compatibility and load-time integrity: campaigns built by a store with NO admission (a consistent, replayable
// history that is not necessarily canonical) stand in for saves written by earlier builds.

describe("historical sixteenth-slice Instruments keep loading unchanged under the historical citation (acceptance 1, 2, 13)", () => {
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir);
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
      // A historical-save fixture must contain the actual v1 state, not an empty v2 genesis checkpoint.
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: CANONICAL_OWNER_REGISTRY,
        legacyFormat: true,
      }),
    );
    await build(s);
    await s.close();
    return dir;
  }
  const put = (
    n: number,
    key: string,
    value: unknown,
    rule: unknown,
    groupOver: any = {},
    over: any = {},
  ) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [write(key, value as never, { owner: "gip", facet: "gip_institution_identity", ...over })],
      { owner: "gip", facet: "gip_institution_identity", rule, ...groupOver },
    );
  const instrumentPin = {
    reads: [
      { key: magistrateKey, version: 1 },
      { key: bindingKey, version: 1 },
    ],
    depends_on: ["group-2", "group-3"],
  };
  /** identity (group-1), office (group-2), binding (group-3), then whatever the build adds */
  const lawful = async (s: CampaignStore) => {
    await must(s.commit(put(1, courtKey, institutionIdentity(), GIP_RULE)));
    await must(
      s.commit(
        put(2, magistrateKey, officeAuthorityLocus(), GIP_OFFICE_RULE, {
          reads: [{ key: courtKey, version: 1 }],
          depends_on: ["group-1"],
        }),
      ),
    );
    await must(
      s.commit(
        put(3, bindingKey, scopeBinding(), GIP_SCOPE_BINDING_RULE, {
          reads: [{ key: magistrateKey, version: 1 }],
          depends_on: ["group-2"],
        }),
      ),
    );
  };
  const instrument = (n: number, value: unknown, rule: unknown, key = instrumentKey()) =>
    put(n, key, value, rule, instrumentPin);
  const historical = async () =>
    rogue(async (s) => {
      await lawful(s);
      await must(
        s.commit(instrument(4, governanceInstrument(), GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE)),
      );
    });

  it("a sixteenth-slice core-only Instrument in v1 loads, verifies, saves and reloads without fact migration or state-byte rewrite", async () => {
    const dir = await historical();
    const before = readFileSync(join(dir, stateFile(dir)), "utf8");
    expect(JSON.parse(before).facts.length).toBeGreaterThan(0);
    const journalBefore = readFileSync(join(dir, "journal.jsonl"));
    expect(await openOutcome(dir)).toBe("OK");
    // Local format conversion is authorized; historical facts, state bytes and journal are untouched.
    expect(readFileSync(join(dir, stateFile(dir)), "utf8")).toBe(before);
    expect(readFileSync(join(dir, "journal.jsonl"))).toEqual(journalBefore);

    const c = await must(CanonicalCampaign.open(dir));
    expect(c.verify()).toEqual([]);
    const legacy = structuredClone(c.store.getFact(instrumentKey())!);
    expect(legacy.provenance.rule).toEqual(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE);
    expect(legacy.value).toEqual(governanceInstrument());
    expect("predecessor_instrument_ref" in (legacy.value as object)).toBe(false);
    const gip = new GipAdapter(c.store);
    expect(gip.governanceInstrument(INSTRUMENT_A)?.value).toEqual(governanceInstrument());
    expect(verifyGipIntegrity(c.store)).toEqual([]);
    await c.close();

    // an unchanged save reloads byte-identically: opening does not upgrade the citation
    const again = await must(CanonicalCampaign.open(dir));
    expect(again.store.getFact(instrumentKey())).toEqual(legacy);
    expect(again.store.getFact(instrumentKey())!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
    );
    await again.close();
  });

  it("the campaign continues beside a historical Instrument: new Instruments (with and without the reference) carry the successor citation and the historical fact is untouched", async () => {
    const dir = await historical();
    const c = await must(CanonicalCampaign.open(dir));
    const legacy = structuredClone(c.store.getFact(instrumentKey())!);
    const gip = new GipAdapter(c.store);
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(10),
        instrument: governanceInstrumentWithPredecessor(INSTRUMENT_B, INSTRUMENT_A),
      }),
    );
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(11),
        instrument: governanceInstrument(INSTRUMENT_C),
      }),
    );
    // the historical fact is byte-identical; a conflicting establishment of its key still fails closed (no re-citation)
    expect(c.store.getFact(instrumentKey())).toEqual(legacy);
    expect(
      await codeOf(
        gip.establishGovernanceInstrument({
          ...gipPublication(12),
          instrument: governanceInstrument(),
        }),
      ),
    ).not.toBe("OK");
    expect(
      await codeOf(
        gip.establishGovernanceInstrument({
          ...gipPublication(13),
          instrument: governanceInstrumentWithPredecessor(
            INSTRUMENT_A,
            PREDECESSOR_INSTRUMENT_REF_A,
          ),
        }),
      ),
    ).not.toBe("OK");
    expect(c.store.getFact(instrumentKey())).toEqual(legacy);
    expect(c.store.getFact(instrumentKey(INSTRUMENT_B))!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE,
    );
    expect(c.store.getFact(instrumentKey(INSTRUMENT_C))!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE,
    );
    expect(c.verify()).toEqual([]);
    await c.close();
    // and the mixed-provenance campaign reloads and verifies
    const mixed = await must(CanonicalCampaign.open(dir));
    expect(mixed.verify()).toEqual([]);
    expect(mixed.store.getFact(instrumentKey())!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
    );
    expect(mixed.store.getFact(instrumentKey(INSTRUMENT_B))!.provenance.rule).toEqual(
      GIP_INSTRUMENT_RULE,
    );
    await mixed.close();
  });

  it("a historical-citation Instrument carrying predecessor_instrument_ref is invalid: the old rule never authorized the field", async () => {
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await lawful(s);
          await must(
            s.commit(
              instrument(
                4,
                governanceInstrumentWithPredecessor(),
                GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
              ),
            ),
          );
        }),
      ),
    ).toMatch(/RULE_DRIFT/);
    // control: the same value under the successor citation, and a core-only value under the historical one, are canonical
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await lawful(s);
          await must(
            s.commit(instrument(4, governanceInstrumentWithPredecessor(), GIP_INSTRUMENT_RULE)),
          );
        }),
      ),
    ).toBe("OK");
    expect(await openOutcome(await historical())).toBe("OK");
  });

  it("the compatibility is not an escape hatch: any altered, partial or foreign citation is rule drift, and the historical citation is accepted on no other kind", async () => {
    const h = GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE;
    for (const [name, rule] of Object.entries({
      "clause altered": { ...h, clause: h.clause.replace("not implemented", "implemented") },
      "native pin altered": { ...h, native_pin: "2026-09-25T00:00:00.000Z" },
      "artifact altered": { ...h, artifact: "https://example.invalid/other" },
      "lineage truncated": { ...h, authority_lineage: h.authority_lineage.slice(1) },
      "effective basis altered": { ...h, effective_basis: "drifted" },
      "successor with a changed pin": {
        ...GIP_INSTRUMENT_RULE,
        native_pin: "2026-09-25T00:00:00.000Z",
      },
      "binding citation": GIP_SCOPE_BINDING_RULE,
      "office citation": GIP_OFFICE_RULE,
      "identity citation": GIP_RULE,
    }))
      expect(
        await openOutcome(
          await rogue(async (s) => {
            await lawful(s);
            await must(s.commit(instrument(4, governanceInstrument(), rule)));
          }),
        ),
        name,
      ).toMatch(/RULE_DRIFT/);
    // the historical Instrument citation on an Institution Identity or Scope Binding (other kinds) is not accepted
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, courtKey, institutionIdentity(), h)));
        }),
      ),
    ).toMatch(/RULE_DRIFT/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, courtKey, institutionIdentity(), GIP_RULE)));
          await must(
            s.commit(
              put(2, magistrateKey, officeAuthorityLocus(), GIP_OFFICE_RULE, {
                reads: [{ key: courtKey, version: 1 }],
                depends_on: ["group-1"],
              }),
            ),
          );
          await must(
            s.commit(
              put(3, bindingKey, scopeBinding(), h, {
                reads: [{ key: magistrateKey, version: 1 }],
                depends_on: ["group-2"],
              }),
            ),
          );
        }),
      ),
    ).toMatch(/RULE_DRIFT/);
  });
});

describe("load-time integrity accepts the optional field when valid and fails closed on malformed or tampered shapes (acceptance 4, 5, 6, 13)", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await withBinding(dir);
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(),
      }),
    );
    await establishGovernanceInstrument(s, 5, INSTRUMENT_B);
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir);
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };

  it("a valid saved campaign carrying the field opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  const edits: Record<string, (fact: any) => void> = {
    "reference rewritten": (f) =>
      (f.value.predecessor_instrument_ref = PREDECESSOR_INSTRUMENT_REF_B),
    "reference removed": (f) => delete f.value.predecessor_instrument_ref,
    "reference nulled": (f) => (f.value.predecessor_instrument_ref = null),
    "reference emptied": (f) => (f.value.predecessor_instrument_ref = ""),
    "reference made plural": (f) =>
      (f.value.predecessor_instrument_ref = [PREDECESSOR_INSTRUMENT_REF_A]),
    "reference made structured": (f) => (f.value.predecessor_instrument_ref = { id: "x" }),
    "reference malformed": (f) => (f.value.predecessor_instrument_ref = "two words"),
    "reference aliased": (f) => {
      f.value.predecessor_instrument_refs = [f.value.predecessor_instrument_ref];
      delete f.value.predecessor_instrument_ref;
    },
    "reference renamed": (f) => {
      f.value.predecessor_ref = f.value.predecessor_instrument_ref;
      delete f.value.predecessor_instrument_ref;
    },
    "supersession added": (f) => (f.value.supersession_ref = "instrument-new"),
    "other conditional added": (f) => (f.value.activation_condition = "x"),
    "clause surrogate added": (f) => (f.value.clauses = []),
    "identity rewritten": (f) => (f.value.instrument_id = "instrument-forged"),
    "lifecycle rewritten": (f) => (f.value.lifecycle_status = "repealed"),
    "key moved": (f) => (f.key = instrumentKey("instrument-forged")),
    "version changed": (f) => (f.version = 2),
    "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "provenance rule re-cited historically": (f) =>
      (f.provenance.rule = structuredClone(GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE)),
  };
  it("any edit of a saved Instrument carrying the reference — value, key, version or provenance — is not silently accepted", async () => {
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === instrumentKey()));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 120_000);

  it("adding a reference to a saved CORE-ONLY Instrument — or re-citing it historically with the reference — is not silently accepted: no migration or rewrite is a lawful path", async () => {
    const dir = await saved();
    const p = join(dir, stateFile(dir));
    const j = legacyStateFixture(p);
    j.facts.find(
      (f: any) => f.key === instrumentKey(INSTRUMENT_B),
    ).value.predecessor_instrument_ref = PREDECESSOR_INSTRUMENT_REF_A;
    writeFileSync(p, JSON.stringify(j));
    expect(await openOutcome(dir)).not.toBe("OK");

    const dir2 = await saved();
    const p2 = join(dir2, stateFile(dir2));
    const j2 = legacyStateFixture(p2);
    j2.facts.find((f: any) => f.key === instrumentKey()).provenance.rule = structuredClone(
      GIP_INSTRUMENT_RULE_SIXTEENTH_SLICE,
    );
    writeFileSync(p2, JSON.stringify(j2));
    expect(await openOutcome(dir2)).not.toBe("OK");
  });

  it("a journal edit of the committed group of an Instrument carrying the reference fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain(PREDECESSOR_INSTRUMENT_REF_A);
    writeFileSync(
      journal,
      text.replace(PREDECESSOR_INSTRUMENT_REF_A, PREDECESSOR_INSTRUMENT_REF_B),
    );
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("the diagnostic GIP verifier is silent on a healthy campaign carrying references and reports a tampered Instrument by key", async () => {
    const s = await withBinding();
    await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrumentWithPredecessor(),
      }),
    );
    expect(verifyGipIntegrity(s.campaign.store)).toEqual([]);
    const inner = s.campaign.store;
    const tampered = {
      getFact: (k: string) => inner.getFact(k),
      committedGroup: (i: string) => inner.committedGroup(i),
      listFacts: () =>
        inner.listFacts().map((f) => (f.key === instrumentKey() ? { ...f, version: 2 } : f)),
    } as unknown as CampaignStore;
    expect(verifyGipIntegrity(tampered).map((v) => [v.key, v.code])).toEqual([
      [instrumentKey(), "GIP_STATE"],
    ]);
  });
});

describe("a crash or lost reply converges on the one Instrument carrying the reference (acceptance 4, 5)", () => {
  it("a lost reply after the commit is reconciled to the original receipt; the changed retry fails", async () => {
    const s = await withBinding();
    const lostReply = (inner: CampaignStore): CampaignStore => ({
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => inner.listFacts(),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      close: () => inner.close(),
      commit: async (g: any) => {
        await inner.commit(g);
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never;
      },
    });
    const authored = governanceInstrumentWithPredecessor();
    const reply = await new GipAdapter(lostReply(s.campaign.store)).establishGovernanceInstrument({
      ...gipPublication(4),
      instrument: authored,
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(4).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.gip.establishGovernanceInstrument({ ...gipPublication(4), instrument: authored }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(
      await codeOf(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(4),
          instrument: governanceInstrumentWithPredecessor(
            INSTRUMENT_A,
            PREDECESSOR_INSTRUMENT_REF_B,
          ),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(instrumentKey())!.value).toEqual(authored);
    expect(gipFacts(s).filter((f) => f.key.startsWith("gip/instrument/"))).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });
});
