import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and journal values */
// GIP Decision-Body Office Reference Branch Foundation (fourteenth slice) — an office beneath one already-committed Institution
// Identity may be established with `decision_body_ref` INSTEAD OF `holder_ref` (WS-007 §3.2 "holder_ref OR decision_body_ref")
// under the same GIP owner, key, ADVANCING kind, prerequisite, persistence and recovery path. `decision_body_ref` is an opaque
// reference only: never resolved, no body, membership, procedure, vote, actor/ACS state, exercise or permission is created or
// inferred; and no post-establishment holder/body switch or body replacement is admitted.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-02/07/16; IM-03, IM-06, IM-11, IM-12, IM-17. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-007. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  GIP_OFFICE_RULE,
  GIP_OFFICE_RULE_THIRTEENTH_SLICE,
  GIP_RULE,
  GipAdapter,
  createFileCampaign,
  factKind,
  gipGroupCheck,
  readOfficeAuthorityLocus,
  verifyGipIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  DECISION_BODY_REF_A,
  DECISION_BODY_REF_B,
  FIXTURE_CAMPAIGN,
  HOLDER_REF_A,
  HOLDER_REF_B,
  INSTITUTION_COUNCIL,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  decisionBodyOfficeAuthorityLocus,
  gipPublication,
  group,
  institutionIdentity,
  officeAuthorityLocus,
  write,
} from "@immortalis/testkit";
import {
  establishDecisionBodyOffice,
  establishInstitution,
  establishOffice,
  gipFacts,
  reopenGip,
  seededGipCampaign,
} from "../support/gip.ts";
import { establishBasis, seededActorCampaign } from "../support/actor.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { expectedAdapterMethods } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const treasurerKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_TREASURER);

async function withCourt(dir = tempDir()) {
  const s = await seededGipCampaign(dir);
  await establishInstitution(s, 1, INSTITUTION_COURT);
  return s;
}

describe("a new office can be established with decision_body_ref beneath an exact committed Institution Identity", () => {
  it("commits under the sole GIP owner at the same canonical office key, as one create-only ADVANCING write, exactly as authored", async () => {
    const s = await withCourt();
    const before = s.campaign.store.head();
    const out = await must(
      s.gip.establishOffice({
        ...gipPublication(2),
        office: decisionBodyOfficeAuthorityLocus(),
      }),
    );
    expect(out.replayed).toBe(false);
    const fact = s.campaign.store.getFact(magistrateKey)!;
    expect([fact.owner, fact.facet, fact.version]).toEqual(["gip", "gip_institution_identity", 1]);
    expect(fact.value).toEqual(decisionBodyOfficeAuthorityLocus());
    expect(factKind("gip_office_authority_locus").lifecycle).toBe("ADVANCING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("uses the same prerequisite pin, governing rule, provenance and authority as the holder branch", async () => {
    const s = await withCourt();
    await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    const identity = s.campaign.store.getFact(courtKey)!;
    const h = s.campaign.store.committedGroup(gipPublication(2).intent_id)!;
    const b = s.campaign.store.committedGroup(gipPublication(3).intent_id)!;
    expect(b.reads).toEqual([{ key: courtKey, version: identity.version }]);
    expect(b.depends_on).toEqual([identity.provenance.group_id]);
    expect(b.reads).toEqual(h.reads);
    expect(b.depends_on).toEqual(h.depends_on);
    expect(b.writes.map((w) => [w.key, w.expected_version])).toEqual([[magistrateKey, 0]]);
    expect([b.owner, b.facet, b.rule, b.authority]).toEqual([
      h.owner,
      h.facet,
      h.rule,
      h.authority,
    ]);
    expect(b.rule).toEqual(GIP_OFFICE_RULE);
    const fact = s.campaign.store.getFact(magistrateKey)!;
    expect(fact.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(fact.provenance.cause).toBe(gipPublication(3).cause);
    expect(fact.basis).toBe(gipPublication(3).basis);
    expect(fact.secrecy).toBe(gipPublication(3).secrecy);
    expect(s.campaign.store.lookupReceipt(gipPublication(3).intent_id)!.basis.authority).toEqual(
      CANON_WRITE_AUTHORITY,
    );
  });

  it("the same office contract still accepts the holder branch, and both branches may co-exist beneath one institution and across institutions", async () => {
    const s = await withCourt();
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishDecisionBodyOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishDecisionBodyOffice(s, 5, INSTITUTION_GUILD, OFFICE_MAGISTRATE);
    const m = s.campaign.store.getFact(magistrateKey)!.value as any;
    const t = s.campaign.store.getFact(treasurerKey)!.value as any;
    expect(m.holder_ref).toBe(HOLDER_REF_A);
    expect("decision_body_ref" in m).toBe(false);
    expect(t.decision_body_ref).toBe(DECISION_BODY_REF_A);
    expect("holder_ref" in t).toBe(false);
    // the two branches differ in exactly their one exclusive reference field
    const strip = (v: any) => {
      const rest = { ...v };
      for (const k of ["holder_ref", "decision_body_ref", "office_id"]) delete rest[k];
      return rest;
    };
    expect(strip(t)).toEqual(strip(m));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("decision-body establishment mints no sibling authority: one key per institution × office, whichever branch occupies it", async () => {
    const s = await withCourt();
    await establishDecisionBodyOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey));
    const head = s.campaign.store.head();
    for (const [n, office] of [
      [3, decisionBodyOfficeAuthorityLocus()], // equal content, new intent
      [
        4,
        decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
          decision_body_ref: DECISION_BODY_REF_B,
        }),
      ],
      [5, decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, { powers: [] })],
      [6, officeAuthorityLocus()], // the holder branch for the occupied key
      [
        7,
        officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
          holder_ref: DECISION_BODY_REF_A,
        }),
      ],
    ] as const)
      expect(
        await codeOf(s.gip.establishOffice({ ...gipPublication(n), office })),
        String(n),
      ).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
  });

  it("an already-committed holder office cannot be re-established as a decision-body office (no holder → body change)", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey));
    const head = s.campaign.store.head();
    expect(
      await codeOf(
        s.gip.establishOffice({ ...gipPublication(3), office: decisionBodyOfficeAuthorityLocus() }),
      ),
    ).not.toBe("OK");
    // nor the same intent re-presented with the other branch
    expect(
      await codeOf(
        s.gip.establishOffice({ ...gipPublication(2), office: decisionBodyOfficeAuthorityLocus() }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
  });

  it("retry converges on the same decision-body office: the same intent returns the original receipt and changes nothing", async () => {
    const s = await withCourt();
    const first = await must(
      s.gip.establishOffice({ ...gipPublication(2), office: decisionBodyOfficeAuthorityLocus() }),
    );
    const head = s.campaign.store.head();
    const again = await must(
      s.gip.establishOffice({ ...gipPublication(2), office: decisionBodyOfficeAuthorityLocus() }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(s.campaign.store.head()).toEqual(head);
    // the same intent with a changed body is a conflict, never a silent reuse
    expect(
      await codeOf(
        s.gip.establishOffice({
          ...gipPublication(2),
          office: decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
            decision_body_ref: DECISION_BODY_REF_B,
          }),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("is read by exact key through the adapter and the read-only store view, reporting the office record and nothing inferred", async () => {
    const s = await withCourt();
    expect(s.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)).toBeUndefined();
    const office = await establishDecisionBodyOffice(s, 2);
    const viaAdapter = s.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)!;
    expect(viaAdapter.value).toEqual(office);
    expect((viaAdapter.value as any).decision_body_ref).toBe(DECISION_BODY_REF_A);
    expect(viaAdapter.fact).toEqual(s.campaign.store.getFact(magistrateKey));
    const readOnly = { getFact: (k: string) => s.campaign.store.getFact(k) };
    expect(readOfficeAuthorityLocus(readOnly, INSTITUTION_COURT, OFFICE_MAGISTRATE)).toEqual(
      viaAdapter,
    );
    expect(Object.keys(viaAdapter.value).sort()).toEqual(
      Object.keys(decisionBodyOfficeAuthorityLocus()).sort(),
    );
  });
});

describe("exactly one reference: both refs together and neither fail closed", () => {
  it("an office carrying both holder_ref and decision_body_ref, or neither, is refused by the adapter and commits nothing", async () => {
    const s = await withCourt();
    const before = s.campaign.store.head();
    const neither: Record<string, unknown> = { ...officeAuthorityLocus() };
    delete neither["holder_ref"];
    for (const office of [
      { ...officeAuthorityLocus(), decision_body_ref: DECISION_BODY_REF_A },
      { ...decisionBodyOfficeAuthorityLocus(), holder_ref: HOLDER_REF_A },
      neither,
      { ...neither, holder_ref: null },
      { ...neither, decision_body_ref: "" },
      { ...neither, holder_ref: "", decision_body_ref: "" },
    ])
      expect(
        await codeOf(s.gip.establishOffice({ ...gipPublication(2), office })),
        JSON.stringify(office),
      ).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(before);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("holds for a raw store commit too: IM-11 admission refuses both-refs and neither-ref values", async () => {
    const s = await withCourt();
    const identity = s.campaign.store.getFact(courtKey)!;
    const neither: Record<string, unknown> = { ...officeAuthorityLocus() };
    delete neither["holder_ref"];
    let n = 100;
    for (const value of [
      { ...officeAuthorityLocus(), decision_body_ref: DECISION_BODY_REF_A },
      neither,
    ]) {
      n++;
      expect(
        await codeOf(s.campaign.store.commit(rawGroup(s, n, magistrateKey, value, 0, identity))),
        JSON.stringify(value),
      ).toMatch(/^(VALUE_INVALID|SCHEMA_INVALID)$/);
    }
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });
});

describe("no decision-body office without the committed prerequisite Institution Identity", () => {
  it("an institution that was never established, another institution's identity or a label never substitutes: refused as a missing prerequisite", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    expect(
      await codeOf(
        s.gip.establishOffice({ ...gipPublication(1), office: decisionBodyOfficeAuthorityLocus() }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    await establishInstitution(s, 2, INSTITUTION_COURT, { identity_label: "label-of-the-court" });
    for (const institution of [INSTITUTION_GUILD, "label-of-the-court", "locus-fixture-1"])
      expect(
        await codeOf(
          s.gip.establishOffice({
            ...gipPublication(3),
            office: decisionBodyOfficeAuthorityLocus(institution),
          }),
        ),
        institution,
      ).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });
});

describe("decision_body_ref is never resolved, dereferenced or used to create foreign-owner state", () => {
  it("whatever the reference names — a real actor, the office's own institution, a sibling office key, another institution or nothing — establishment writes exactly the one office key and reads exactly the one identity", async () => {
    const s = await seededGipCampaign(tempDir());
    for (const [i, id] of [INSTITUTION_COURT, INSTITUTION_COUNCIL, INSTITUTION_GUILD].entries())
      await establishInstitution(s, i + 1, id);
    const refs = [
      DECISION_BODY_REF_A, // names nothing
      INSTITUTION_COURT, // the office's own institution
      INSTITUTION_GUILD, // another committed institution
      OFFICE_MAGISTRATE, // an office identifier
      "locus-fixture-1", // a world fact identifier
      "world-fixture-1",
    ];
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    const before = new Map(s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f)]));
    for (const [i, ref] of refs.entries()) {
      spy.getFacts.length = 0;
      await must(
        gip.establishOffice({
          ...gipPublication(10 + i),
          office: decisionBodyOfficeAuthorityLocus(INSTITUTION_COUNCIL, `office-body-${i}`, {
            decision_body_ref: ref,
          }),
        }),
      );
      expect(spy.getFacts, ref).toEqual([gipInstitutionIdentityKey(INSTITUTION_COUNCIL)]);
    }
    expect(spy.listCalls()).toBe(0);
    for (const g of spy.commits) expect(g.writes).toHaveLength(1);
    const after = s.campaign.store.listFacts();
    expect(after.filter((f) => !before.has(f.key))).toHaveLength(refs.length);
    for (const [key, fact] of before) expect(s.campaign.store.getFact(key)).toEqual(fact);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an existing Named Actor named as the decision body gains no state, and the office copies none of the actor's", async () => {
    const a = await seededActorCampaign(tempDir());
    await establishBasis(a, 1, ACTOR_SMITH);
    const gip = new GipAdapter(a.campaign.store);
    await must(
      gip.establishInstitution({ ...gipPublication(1), institution: institutionIdentity() }),
    );
    const nonGip = a.campaign.store
      .listFacts()
      .filter((f) => !f.key.startsWith("gip/"))
      .map((f) => structuredClone(f));
    expect(nonGip.some((f) => f.key.startsWith("actor/"))).toBe(true);
    await must(
      gip.establishOffice({
        ...gipPublication(2),
        office: decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
          decision_body_ref: ACTOR_SMITH,
        }),
      }),
    );
    expect(a.campaign.store.listFacts().filter((f) => !f.key.startsWith("gip/"))).toEqual(nonGip);
    const stored = a.campaign.store.getFact(magistrateKey)!.value as Record<string, unknown>;
    expect(stored["decision_body_ref"]).toBe(ACTOR_SMITH);
    expect(typeof stored["decision_body_ref"]).toBe("string");
    expect(a.campaign.verify()).toEqual([]);
    await a.campaign.close();
  });

  it("no body object, membership, roster, procedure, vote, result, actor/ACS state, authority exercise, permission, clock or temporal object is created or inferred", async () => {
    const s = await withCourt();
    const before = new Set(s.campaign.store.listFacts().map((f) => f.key));
    await establishDecisionBodyOffice(s, 2);
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added.map((f) => f.key)).toEqual([magistrateKey]);
    const prefixes = new Set(s.campaign.store.listFacts().map((f) => f.key.split("/")[0]));
    expect([...prefixes].sort()).toEqual(["gip", "pc", "role-registry", "world"]);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
    // the stored office carries the reference and the common authored fields, and no body-side or exercise field
    const stored = added[0]!.value as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(
      Object.keys(decisionBodyOfficeAuthorityLocus()).sort(),
    );
    for (const k of Object.keys(stored))
      expect(k).not.toMatch(/^(body|member|vote|result|exercis)/);
    // the office is still keyed by institution × office alone: nothing in the key names the body
    expect(added[0]!.key).not.toContain(DECISION_BODY_REF_A);
  });
});

/** A raw office group as an unauthorized caller might build it: no registry, no adapter. */
function rawGroup(
  s: Awaited<ReturnType<typeof withCourt>>,
  n: number,
  key: string,
  value: unknown,
  expected_version: number,
  identity: OwnerFact,
  over: Partial<CommitGroup> = {},
): CommitGroup {
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "gip",
    facet: "gip_institution_identity",
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: GIP_OFFICE_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [{ key: courtKey, version: identity.version }],
    depends_on: [identity.provenance.group_id],
    writes: [
      {
        key,
        owner: "gip",
        facet: "gip_institution_identity",
        value: value as never,
        unit: null,
        basis: "gip-fixture-basis",
        secrecy: "gip-fixture-visibility",
        expected_version,
      },
    ],
    ...over,
  };
}

describe("no post-establishment holder/body switch or body replacement is admitted", () => {
  it("the adapter exposes no method that moves an office: the only office writer is the initial establishment", () => {
    expect(adapterMethods(GipAdapter)).toEqual(expectedAdapterMethods("GipAdapter"));
  });

  it("every raw expected-version write to an established decision-body office — a new body, a switch to a holder, a changed power — is an unsupported amendment; an occupied create is a version conflict", async () => {
    const s = await withCourt();
    await establishDecisionBodyOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    const identity = s.campaign.store.getFact(courtKey)!;
    let n = 200;
    for (const [expected_version, value, code] of [
      [
        1,
        decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
          decision_body_ref: DECISION_BODY_REF_B,
        }),
        "AMENDMENT_NOT_SUPPORTED",
      ],
      [1, officeAuthorityLocus(), "AMENDMENT_NOT_SUPPORTED"],
      [
        1,
        decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, { powers: [] }),
        "AMENDMENT_NOT_SUPPORTED",
      ],
      [1, decisionBodyOfficeAuthorityLocus(), "AMENDMENT_NOT_SUPPORTED"],
      [
        2,
        decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
          decision_body_ref: DECISION_BODY_REF_B,
        }),
        "VERSION_CONFLICT",
      ],
      [0, officeAuthorityLocus(), "VERSION_CONFLICT"],
      [0, decisionBodyOfficeAuthorityLocus(), "VERSION_CONFLICT"],
    ] as const) {
      n++;
      expect(
        await codeOf(
          s.campaign.store.commit(rawGroup(s, n, magistrateKey, value, expected_version, identity)),
        ),
        `${expected_version} ${JSON.stringify(value)}`,
      ).toBe(code);
    }
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
  });

  it("every raw expected-version write to an established HOLDER office — including a switch to a decision body — is an unsupported amendment too", async () => {
    const s = await withCourt();
    await establishOffice(s, 2);
    const fact = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    const identity = s.campaign.store.getFact(courtKey)!;
    let n = 300;
    for (const value of [
      decisionBodyOfficeAuthorityLocus(),
      officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, { holder_ref: HOLDER_REF_B }),
    ]) {
      n++;
      expect(
        await codeOf(s.campaign.store.commit(rawGroup(s, n, magistrateKey, value, 1, identity))),
      ).toBe("AMENDMENT_NOT_SUPPORTED");
    }
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(fact);
  });

  it("admission is pure and total for the new branch: the group check judges a decision-body office from (group, state) alone", async () => {
    const s = await withCourt();
    const identity = s.campaign.store.getFact(courtKey)!;
    const state = { facts: new Map(s.campaign.store.listFacts().map((f) => [f.key, f])) } as never;
    const ok = rawGroup(s, 400, magistrateKey, decisionBodyOfficeAuthorityLocus(), 0, identity);
    expect(gipGroupCheck(ok, state)).toBeNull();
    expect(
      gipGroupCheck(
        rawGroup(s, 401, magistrateKey, decisionBodyOfficeAuthorityLocus(), 1, identity),
        state,
      )?.code,
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    // the key is derived from institution_id × office_id alone: a key that names the body is refused
    expect(
      gipGroupCheck(
        rawGroup(
          s,
          402,
          `${magistrateKey}-${DECISION_BODY_REF_A}`,
          decisionBodyOfficeAuthorityLocus(),
          0,
          identity,
        ),
        state,
      )?.code,
    ).toBe("REFERENCE_INVALID");
    // the exact prerequisite is still required: a decision-body office pinning nothing is refused
    expect(
      gipGroupCheck(
        rawGroup(s, 403, magistrateKey, decisionBodyOfficeAuthorityLocus(), 0, identity, {
          reads: [],
          depends_on: [],
        }),
        state,
      ),
    ).not.toBeNull();
  });
});

describe("save → close → load → continue preserves the selected branch and every authored authority field", () => {
  const cuts = [0, 1, 2] as const;
  for (const cut of cuts) {
    it(`${cut} decision-body office(s) saved: reloads unchanged, verifies, and the continuation converges`, async () => {
      const dir = tempDir();
      const s = await withCourt(dir);
      const ids = [OFFICE_MAGISTRATE, OFFICE_TREASURER];
      for (let i = 0; i < cut; i++)
        await establishDecisionBodyOffice(s, i + 2, INSTITUTION_COURT, ids[i]);
      const saved = structuredClone(gipFacts(s));
      await s.campaign.close();
      const r = await reopenGip(dir);
      expect(r.campaign.verify()).toEqual([]);
      expect(gipFacts(r)).toEqual(saved);
      for (let i = 0; i < ids.length; i++) {
        const out = await r.gip.establishOffice({
          ...gipPublication(i + 2),
          office: decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, ids[i]),
        });
        expect(out.ok && out.value.replayed).toBe(i < cut);
      }
      expect(gipFacts(r).map((f) => f.key)).toEqual([courtKey, magistrateKey, treasurerKey]);
      for (const f of saved) expect(r.campaign.store.getFact(f.key)).toEqual(f);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the reload preserves the branch, the reference, the authored fields, key, version, pin, provenance, governing rule and receipt exactly, beside an unchanged holder office", async () => {
    const dir = tempDir();
    const s = await withCourt(dir);
    await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_TREASURER, { holder_ref: HOLDER_REF_B });
    const authored = await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, {
      powers: [],
      duties: ["SYNTHETIC FIXTURE: a duty.", "SYNTHETIC FIXTURE: a duty."],
      selection_rule: "SYNTHETIC FIXTURE: no selection mechanism exists.",
      succession_rule: "SYNTHETIC FIXTURE: unknown.",
      removal_rule: "SYNTHETIC FIXTURE: unresolved.",
    });
    const facts = structuredClone(gipFacts(s));
    const receipt = structuredClone(s.campaign.store.lookupReceipt(gipPublication(3).intent_id));
    const committed = structuredClone(s.campaign.store.committedGroup(gipPublication(3).intent_id));
    const head = s.campaign.store.head();
    await s.campaign.close();
    const r = await reopenGip(dir);
    expect(gipFacts(r)).toEqual(facts);
    expect(r.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)?.value).toEqual(
      authored,
    );
    expect(
      (r.gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER)?.value as any).holder_ref,
    ).toBe(HOLDER_REF_B);
    expect(r.campaign.store.getFact(magistrateKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(r.campaign.store.getFact(courtKey)!.provenance.rule).toEqual(GIP_RULE);
    expect(r.campaign.store.lookupReceipt(gipPublication(3).intent_id)).toEqual(receipt);
    expect(r.campaign.store.committedGroup(gipPublication(3).intent_id)).toEqual(committed);
    expect(r.campaign.store.head().revision).toBe(head.revision);
    expect(r.campaign.store.head().state_sha256).toBe(head.state_sha256);
    // continuing: a conflicting establishment (the other branch, another body) still fails closed after the reload
    for (const [n, office] of [
      [10, officeAuthorityLocus()],
      [
        11,
        decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
          decision_body_ref: DECISION_BODY_REF_B,
        }),
      ],
    ] as const)
      expect(await codeOf(r.gip.establishOffice({ ...gipPublication(n), office }))).not.toBe("OK");
    expect(r.campaign.store.getFact(magistrateKey)!.value).toEqual(authored);
    await r.campaign.close();
  });

  it("a lost reply after committing a decision-body office is reconciled by identity, never re-created", async () => {
    const s = await withCourt();
    const lost = new GipAdapter({
      descriptor: s.campaign.store.descriptor,
      head: () => s.campaign.store.head(),
      getFact: (k) => s.campaign.store.getFact(k),
      listFacts: () => s.campaign.store.listFacts(),
      lookupReceipt: (i) => s.campaign.store.lookupReceipt(i),
      committedGroup: (i) => s.campaign.store.committedGroup(i),
      close: () => s.campaign.store.close(),
      commit: async (g: any) => {
        await s.campaign.store.commit(g);
        return { ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never;
      },
    });
    const reply = await lost.establishOffice({
      ...gipPublication(2),
      office: decisionBodyOfficeAuthorityLocus(),
    });
    expect(!reply.ok && reply.error.code).toBe("UNKNOWN_OUTCOME");
    const receipt = s.campaign.store.lookupReceipt(gipPublication(2).intent_id);
    expect(receipt).not.toBeNull();
    const retry = await must(
      s.gip.establishOffice({ ...gipPublication(2), office: decisionBodyOfficeAuthorityLocus() }),
    );
    expect(retry.replayed).toBe(true);
    expect(retry.receipt).toEqual(receipt);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("load fails closed on a tampered branch or reference", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await withCourt(dir);
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishDecisionBodyOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER, {
      decision_body_ref: DECISION_BODY_REF_B,
    });
    await establishOffice(s, 5, INSTITUTION_GUILD, OFFICE_MAGISTRATE);
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

  it("a valid saved campaign with both branches opens (control)", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  const edits: Record<string, (fact: any) => void> = {
    "body replaced": (f) => (f.value.decision_body_ref = "decision-body-forged"),
    "body switched to a holder": (f) => {
      delete f.value.decision_body_ref;
      f.value.holder_ref = HOLDER_REF_A;
    },
    "holder added beside the body": (f) => (f.value.holder_ref = HOLDER_REF_A),
    "body removed (neither reference)": (f) => delete f.value.decision_body_ref,
    "body emptied": (f) => (f.value.decision_body_ref = ""),
    "body made structured": (f) => (f.value.decision_body_ref = { members: ["a"] }),
    "membership added": (f) => (f.value.members = ["a", "b"]),
    "branch discriminator added": (f) => (f.value.reference_kind = "decision_body"),
    "authority copied onto the body": (f) => (f.value.decision_body_authority = ["tax"]),
    "authority rewritten": (f) => (f.value.competence_scope = "rewritten"),
    "power added": (f) => f.value.powers.push("an added power"),
    "version advanced": (f) => (f.version = 2),
    "provenance rule drifted": (f) => (f.provenance.rule.clause = "drifted"),
    "owner changed": (f) => (f.owner = "world_state"),
  };
  it("an edit of a saved decision-body office — branch, reference, authority, version, provenance or rule — is not silently normalized", async () => {
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === magistrateKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 120_000);

  it("a state-file edit that swaps two bodies, switches an office's branch with another's, moves an office or removes its institution is detected", async () => {
    const guildMagistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_GUILD, OFFICE_MAGISTRATE);
    for (const name of ["swapped bodies", "branch swapped", "moved key", "institution removed"]) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      const a = j.facts.find((f: any) => f.key === magistrateKey);
      const b = j.facts.find((f: any) => f.key === treasurerKey);
      if (name === "swapped bodies")
        [a.value.decision_body_ref, b.value.decision_body_ref] = [
          b.value.decision_body_ref,
          a.value.decision_body_ref,
        ];
      else if (name === "branch swapped") {
        const h = j.facts.find((f: any) => f.key === guildMagistrateKey);
        const body = a.value.decision_body_ref;
        delete a.value.decision_body_ref;
        a.value.holder_ref = h.value.holder_ref;
        delete h.value.holder_ref;
        h.value.decision_body_ref = body;
      } else if (name === "moved key")
        a.key = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, "office-elsewhere");
      else j.facts = j.facts.filter((f: any) => f.key !== courtKey);
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 120_000);

  it("a journal edit of the decision-body office's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain(DECISION_BODY_REF_B);
    writeFileSync(journal, text.replace(DECISION_BODY_REF_B, "decision-body-forged"));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  /** An office built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, { campaignId: FIXTURE_CAMPAIGN, owners: CANONICAL_OWNER_REGISTRY }),
    );
    await build(s);
    await s.close();
    return dir;
  }
  const put = (n: number, key: string, value: unknown, over: any = {}, groupOver: any = {}) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [write(key, value as never, { owner: "gip", facet: "gip_institution_identity", ...over })],
      { owner: "gip", facet: "gip_institution_identity", rule: GIP_OFFICE_RULE, ...groupOver },
    );
  const identity = () => put(1, courtKey, institutionIdentity(), {}, { rule: GIP_RULE });
  const pin = { reads: [{ key: courtKey, version: 1 }], depends_on: ["group-1"] };

  it("a lawful decision-body history built by an admission-free store verifies (control); rogue variants are each detected on load", async () => {
    const outcome = async (build: (s: CampaignStore) => Promise<void>) =>
      openOutcome(await rogue(build));
    expect(
      await outcome(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(put(2, magistrateKey, decisionBodyOfficeAuthorityLocus(), {}, pin)));
      }),
    ).toBe("OK");
    // no pin of the identity, or no identity at all
    expect(
      await outcome(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(put(2, magistrateKey, decisionBodyOfficeAuthorityLocus())));
      }),
    ).toMatch(/GIP_STATE/);
    expect(
      await outcome(async (s) => {
        await must(s.commit(put(1, magistrateKey, decisionBodyOfficeAuthorityLocus())));
      }),
    ).toMatch(/GIP_STATE/);
    // a body replacement (an office moved forward) is detected though the history is replayable
    expect(
      await outcome(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(put(2, magistrateKey, decisionBodyOfficeAuthorityLocus(), {}, pin)));
        await must(
          s.commit(
            put(
              3,
              magistrateKey,
              decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE, {
                decision_body_ref: DECISION_BODY_REF_B,
              }),
              { expected_version: 1 },
              pin,
            ),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
    // a holder → body switch is detected the same way
    expect(
      await outcome(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(put(2, magistrateKey, officeAuthorityLocus(), {}, pin)));
        await must(
          s.commit(
            put(3, magistrateKey, decisionBodyOfficeAuthorityLocus(), { expected_version: 1 }, pin),
          ),
        );
      }),
    ).toMatch(/GIP_STATE/);
    // a both-refs or neither-ref value is not a lawful office value
    const both = { ...officeAuthorityLocus(), decision_body_ref: DECISION_BODY_REF_A };
    expect(
      await outcome(async (s) => {
        await must(s.commit(identity()));
        await must(s.commit(put(2, magistrateKey, both, {}, pin)));
      }),
    ).toMatch(/VALUE_INVALID/);
  });

  it("the load-time verifier treats both branches identically: a healthy decision-body office verifies and reports nothing", async () => {
    const s = await withCourt();
    await establishDecisionBodyOffice(s, 2);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    expect(verifyGipIntegrity(s.campaign.store)).toEqual([]);
    // moved forward → reported for a decision-body office exactly as for a holder office
    const inner = s.campaign.store;
    const facts = structuredClone([...inner.listFacts()]) as OwnerFact[];
    facts.find((f) => f.key === magistrateKey)!.version = 2;
    facts.find((f) => f.key === treasurerKey)!.version = 2;
    const bound: CampaignStore = {
      ...inner,
      listFacts: () => facts,
      getFact: (k) => facts.find((f) => f.key === k),
      head: () => inner.head(),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      commit: (g) => inner.commit(g),
      close: () => inner.close(),
    };
    const v = verifyGipIntegrity(bound);
    expect(v.map((x) => x.key).sort()).toEqual([magistrateKey, treasurerKey].sort());
    expect(new Set(v.map((x) => x.message)).size).toBe(1);
    await s.campaign.close();
  });
});

describe("governing-rule provenance: new offices carry the truthful current citation; thirteenth-slice holder offices keep loading under theirs", () => {
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
  /** A v1 history with NO admission: only canonical load integrity can judge its historical citation. */
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
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
  const put = (n: number, key: string, value: unknown, groupOver: any = {}) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [write(key, value as never, { owner: "gip", facet: "gip_institution_identity" })],
      {
        owner: "gip",
        facet: "gip_institution_identity",
        rule: GIP_OFFICE_RULE,
        reads: [{ key: courtKey, version: 1 }],
        depends_on: ["group-1"],
        ...groupOver,
      },
    );
  const identity = () =>
    group(
      FIXTURE_CAMPAIGN,
      1,
      [
        write(courtKey, institutionIdentity() as never, {
          owner: "gip",
          facet: "gip_institution_identity",
        }),
      ],
      { owner: "gip", facet: "gip_institution_identity", rule: GIP_RULE },
    );
  const withOffice = (value: unknown, rule: unknown) =>
    rogue(async (st) => {
      await must(st.commit(identity()));
      await must(st.commit(put(2, magistrateKey, value, { rule })));
    });

  it("a newly committed office of either branch is stamped with the current citation, which says decision_body_ref is implemented — never with the superseded one", async () => {
    const dir = tempDir();
    const s = await withCourt(dir);
    await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    for (const [key, n] of [
      [treasurerKey, 2],
      [magistrateKey, 3],
    ] as const) {
      const fact = s.campaign.store.getFact(key)!;
      expect(fact.provenance.rule, key).toEqual(GIP_OFFICE_RULE);
      expect(fact.provenance.rule, key).not.toEqual(GIP_OFFICE_RULE_THIRTEENTH_SLICE);
      expect(s.campaign.store.committedGroup(gipPublication(n).intent_id)!.rule).toEqual(
        GIP_OFFICE_RULE,
      );
      expect(fact.provenance.rule.clause).toContain("holder_ref OR decision_body_ref");
      expect(fact.provenance.rule.clause).not.toContain("decision_body_ref not implemented");
      // same source artifact, exact native pin and authority lineage as the historical citation
      expect(fact.provenance.rule.artifact).toBe(GIP_OFFICE_RULE_THIRTEENTH_SLICE.artifact);
      expect(fact.provenance.rule.native_pin).toBe("2026-09-24T01:42:24.952Z");
      expect(fact.provenance.rule.authority_lineage).toEqual(
        GIP_OFFICE_RULE_THIRTEENTH_SLICE.authority_lineage,
      );
    }
    await s.campaign.close();
    const r = await reopenGip(dir);
    expect(r.campaign.verify()).toEqual([]);
    expect(r.campaign.store.getFact(magistrateKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    await r.campaign.close();
  });

  it("a new write carrying the superseded or any other citation is refused by admission, whichever the branch", async () => {
    const s = await withCourt();
    const identityFact = s.campaign.store.getFact(courtKey)!;
    let n = 500;
    for (const value of [decisionBodyOfficeAuthorityLocus(), officeAuthorityLocus()])
      for (const rule of [
        GIP_OFFICE_RULE_THIRTEENTH_SLICE,
        { ...GIP_OFFICE_RULE, clause: "drifted" },
        GIP_RULE,
      ]) {
        n++;
        expect(
          await codeOf(
            s.campaign.store.commit(
              rawGroup(s, n, magistrateKey, value, 0, identityFact, { rule }),
            ),
          ),
          JSON.stringify(value),
        ).toBe("REFERENCE_INVALID");
      }
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
    // control: the current citation is admitted for both
    await must(
      s.campaign.store.commit(
        rawGroup(s, 600, magistrateKey, decisionBodyOfficeAuthorityLocus(), 0, identityFact),
      ),
    );
  });

  it("v1 thirteenth-slice holder-office facts keep their bytes and citation, and the campaign continues with new current-citation offices", async () => {
    const dir = await withOffice(officeAuthorityLocus(), GIP_OFFICE_RULE_THIRTEENTH_SLICE);
    const before = readFileSync(join(dir, stateFile(dir)), "utf8");
    expect(JSON.parse(before).facts.length).toBeGreaterThan(0);
    const journalBefore = readFileSync(join(dir, "journal.jsonl"));
    expect(await openOutcome(dir)).toBe("OK");
    // The local format may convert; the historical state and journal bytes cannot change.
    expect(readFileSync(join(dir, stateFile(dir)), "utf8")).toBe(before);
    expect(readFileSync(join(dir, "journal.jsonl"))).toEqual(journalBefore);

    const c = await must(CanonicalCampaign.open(dir));
    expect(c.verify()).toEqual([]);
    const legacy = structuredClone(c.store.getFact(magistrateKey)!);
    expect(legacy.provenance.rule).toEqual(GIP_OFFICE_RULE_THIRTEENTH_SLICE);
    expect((legacy.value as any).holder_ref).toBe(HOLDER_REF_A);
    const gip = new GipAdapter(c.store);
    expect(gip.officeAuthorityLocus(INSTITUTION_COURT, OFFICE_MAGISTRATE)?.value).toEqual(
      officeAuthorityLocus(),
    );
    // continue: new offices — a decision-body one and a holder one — carry the current citation beside the legacy fact
    await must(
      gip.establishOffice({
        ...gipPublication(10),
        office: decisionBodyOfficeAuthorityLocus(INSTITUTION_COURT, OFFICE_TREASURER),
      }),
    );
    await must(
      gip.establishOffice({
        ...gipPublication(11),
        office: officeAuthorityLocus(INSTITUTION_COURT, "office-clerk-1", {
          holder_ref: HOLDER_REF_B,
        }),
      }),
    );
    // the legacy fact is byte-identical; a conflicting establishment of its key still fails closed
    expect(c.store.getFact(magistrateKey)).toEqual(legacy);
    expect(
      await codeOf(
        gip.establishOffice({ ...gipPublication(12), office: decisionBodyOfficeAuthorityLocus() }),
      ),
    ).not.toBe("OK");
    expect(c.store.getFact(treasurerKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    expect(c.verify()).toEqual([]);
    await c.close();
    // and the mixed-provenance campaign reloads and verifies
    const again = await must(CanonicalCampaign.open(dir));
    expect(again.verify()).toEqual([]);
    expect(again.store.getFact(magistrateKey)!.provenance.rule).toEqual(
      GIP_OFFICE_RULE_THIRTEENTH_SLICE,
    );
    expect(again.store.getFact(treasurerKey)!.provenance.rule).toEqual(GIP_OFFICE_RULE);
    await again.close();
  });

  it("the compatibility is not an escape hatch: a decision-body office carrying the superseded citation is rule drift on load", async () => {
    expect(
      await openOutcome(
        await withOffice(decisionBodyOfficeAuthorityLocus(), GIP_OFFICE_RULE_THIRTEENTH_SLICE),
      ),
    ).toMatch(/RULE_DRIFT/);
    // control: the same decision-body office under the current citation, and a holder office under it, are canonical
    expect(
      await openOutcome(await withOffice(decisionBodyOfficeAuthorityLocus(), GIP_OFFICE_RULE)),
    ).toBe("OK");
    expect(await openOutcome(await withOffice(officeAuthorityLocus(), GIP_OFFICE_RULE))).toBe("OK");
  });

  it("only the whole historical citation is accepted: any altered, partial or foreign rule on a holder office, and the historical one on any other kind, is rule drift", async () => {
    const h = GIP_OFFICE_RULE_THIRTEENTH_SLICE;
    for (const [name, rule] of Object.entries({
      "clause altered": {
        ...h,
        clause: h.clause.replace("not implemented here", "implemented here"),
      },
      "clause of the current citation with a changed pin": {
        ...GIP_OFFICE_RULE,
        native_pin: "2026-09-25T00:00:00.000Z",
      },
      "native pin altered": { ...h, native_pin: "2026-09-25T00:00:00.000Z" },
      "artifact altered": { ...h, artifact: "https://example.invalid/other" },
      "lineage truncated": { ...h, authority_lineage: h.authority_lineage.slice(1) },
      "effective basis altered": { ...h, effective_basis: "drifted" },
      "identity citation": GIP_RULE,
    }))
      expect(await openOutcome(await withOffice(officeAuthorityLocus(), rule)), name).toMatch(
        /RULE_DRIFT/,
      );
    // the historical office citation on an Institution Identity (another kind) is not accepted
    expect(
      await openOutcome(
        await rogue(async (st) => {
          await must(
            st.commit(
              group(
                FIXTURE_CAMPAIGN,
                1,
                [
                  write(courtKey, institutionIdentity() as never, {
                    owner: "gip",
                    facet: "gip_institution_identity",
                  }),
                ],
                {
                  owner: "gip",
                  facet: "gip_institution_identity",
                  rule: GIP_OFFICE_RULE_THIRTEENTH_SLICE,
                },
              ),
            ),
          );
        }),
      ),
    ).toMatch(/RULE_DRIFT/);
  });

  it("an edit of a saved legacy holder office — its citation, or its branch switched to a decision body — is still detected on load", async () => {
    const edits: Record<string, (fact: any) => void> = {
      "citation drifted": (f) => (f.provenance.rule.clause = "drifted"),
      "citation swapped for the current one": (f) =>
        (f.provenance.rule = structuredClone(GIP_OFFICE_RULE)),
      "branch switched to a decision body": (f) => {
        delete f.value.holder_ref;
        f.value.decision_body_ref = DECISION_BODY_REF_A;
      },
      "holder replaced": (f) => (f.value.holder_ref = "holder-ref-forged"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await withOffice(officeAuthorityLocus(), GIP_OFFICE_RULE_THIRTEENTH_SLICE);
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === magistrateKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  }, 120_000);
});
