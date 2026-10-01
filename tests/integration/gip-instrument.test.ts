/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and state values */
// GIP Governance Instrument Core Backbone Foundation (sixteenth slice) — INITIAL ESTABLISHMENT ONLY of one GIP-owned Governance
// Instrument core record (WS-007 §4.1) beneath one exact already-committed Office / Authority Locus and one exact already-committed
// Scope Binding of that same office, under the same GIP owner and facet, the same create-only ADVANCING admission, persistence and
// recovery path. `authority_basis_ref` and every `governing_order_ref` are opaque and never dereferenced; validity and lifecycle are
// authored and never calculated or advanced; no §4.3 conditional field, clause, procedure, vote, applicability result,
// promulgation, dissemination, reach, implementation or compliance state is created or inferred; and every post-establishment
// change is refused.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-02/07/16; IM-03, IM-06, IM-11, IM-12, IM-17. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-007. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  INSTRUMENT_LIFECYCLE_STATUSES,
  INSTRUMENT_OPERATIVE_EFFECTS,
  INSTRUMENT_VALIDITY_STATUSES,
  gipInstitutionIdentityKey,
  gipInstrumentKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  GIP_INSTRUMENT_RULE,
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  factKind,
  gipGroupCheck,
  readGovernanceInstrument,
  type CampaignState,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  AUTHORITY_BASIS_REF_A,
  AUTHORITY_BASIS_REF_B,
  DECISION_BODY_REF_A,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  GOVERNING_ORDER_REF_A,
  GOVERNING_ORDER_REF_B,
  GOVERNING_ORDER_REF_C,
  HOLDER_REF_A,
  INSTITUTION_COUNCIL,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  INSTRUMENT_A,
  INSTRUMENT_B,
  INSTRUMENT_C,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  SCOPE_BINDING_A,
  SCOPE_BINDING_B,
  decisionBodyOfficeAuthorityLocus,
  gipPublication,
  governanceInstrument,
  officeAuthorityLocus,
  officeRef,
  scopeBinding,
  scopeBindingRef,
} from "@immortalis/testkit";
import {
  establishDecisionBodyOffice,
  establishGovernanceInstrument,
  establishInstitution,
  establishOffice,
  establishScopeBinding,
  gipFacts,
  seedInstitutionLikeNeighbors,
  seededGipCampaign,
} from "../support/gip.ts";
import { establishBasis, seededActorCampaign } from "../support/actor.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const courtKey = gipInstitutionIdentityKey(INSTITUTION_COURT);
const magistrateKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_MAGISTRATE);
const treasurerKey = gipOfficeAuthorityLocusKey(INSTITUTION_COURT, OFFICE_TREASURER);
const bindingKey = (b = SCOPE_BINDING_A, office = OFFICE_MAGISTRATE, inst = INSTITUTION_COURT) =>
  gipScopeBindingKey(inst, office, b);

/** An institution with one holder-reference office (the magistrate) and one scope binding of it. */
async function withBinding(dir = tempDir()) {
  const s = await seededGipCampaign(dir);
  await establishInstitution(s, 1, INSTITUTION_COURT);
  await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  await establishScopeBinding(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
  return s;
}

describe("an Instrument can be established beneath an exact committed office and one of its Scope Bindings", () => {
  it("beneath a holder-reference office: one create-only ADVANCING write under the sole GIP owner, exactly as authored", async () => {
    const s = await withBinding();
    const before = s.campaign.store.head();
    const instrument = governanceInstrument(
      INSTRUMENT_A,
      INSTITUTION_COURT,
      OFFICE_MAGISTRATE,
      SCOPE_BINDING_A,
      {
        operative_effect: "authority_grant",
        lifecycle_status: "pending",
        validity_by_order: [
          { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
          { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "void" },
        ],
      },
    );
    const out = await must(
      s.gip.establishGovernanceInstrument({ ...gipPublication(4), instrument }),
    );
    expect(out.replayed).toBe(false);
    const fact = s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!;
    expect([fact.owner, fact.facet, fact.version]).toEqual(["gip", "gip_institution_identity", 1]);
    expect(fact.value).toEqual(instrument);
    expect(factKind("gip_governance_instrument").lifecycle).toBe("ADVANCING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([
      courtKey,
      magistrateKey,
      bindingKey(),
      gipInstrumentKey(INSTRUMENT_A),
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("beneath a decision-body-reference office, without dereferencing that body: only the office and the binding are read", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishDecisionBodyOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishScopeBinding(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrument(),
      }),
    );
    expect(spy.getFacts).toEqual([magistrateKey, bindingKey()]);
    expect(spy.listCalls()).toBe(0);
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!.value).toEqual(
      governanceInstrument(),
    );
    expect(s.campaign.store.getFact(magistrateKey)!.value).toEqual(
      decisionBodyOfficeAuthorityLocus(),
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the Instrument semantics do not depend on the office's reference branch: both branches yield the same shape, key form, pins and provenance form", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishScopeBinding(s, 4, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A);
    await establishGovernanceInstrument(s, 6, INSTRUMENT_A, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishGovernanceInstrument(s, 7, INSTRUMENT_B, INSTITUTION_COURT, OFFICE_TREASURER);
    const h = s.campaign.store.committedGroup(gipPublication(6).intent_id)!;
    const b = s.campaign.store.committedGroup(gipPublication(7).intent_id)!;
    expect(h.rule).toEqual(GIP_INSTRUMENT_RULE);
    expect(b.rule).toEqual(GIP_INSTRUMENT_RULE);
    expect([h.owner, h.facet]).toEqual([b.owner, b.facet]);
    expect(h.authority).toEqual(b.authority);
    expect(h.reads).toEqual([
      { key: magistrateKey, version: 1 },
      { key: bindingKey(), version: 1 },
    ]);
    expect(b.reads).toEqual([
      { key: treasurerKey, version: 1 },
      { key: bindingKey(SCOPE_BINDING_A, OFFICE_TREASURER), version: 1 },
    ]);
    expect(h.writes.map((w) => w.expected_version)).toEqual([0]);
    expect(b.writes.map((w) => w.expected_version)).toEqual([0]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("pins exactly its office and its Scope Binding at their current versions and the groups that committed them, and nothing else", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const binding = s.campaign.store.getFact(bindingKey())!;
    const g = s.campaign.store.committedGroup(gipPublication(4).intent_id)!;
    expect(g.reads).toEqual([
      { key: magistrateKey, version: office.version },
      { key: bindingKey(), version: binding.version },
    ]);
    expect(g.depends_on).toEqual([office.provenance.group_id, binding.provenance.group_id]);
    expect(g.writes.map((w) => [w.key, w.expected_version])).toEqual([
      [gipInstrumentKey(INSTRUMENT_A), 0],
    ]);
    expect(g.rule).toEqual(factKind("gip_governance_instrument").rule);
    expect(g.authority).toEqual({ ...CANON_WRITE_AUTHORITY });
  });

  it("is read by exact key through the adapter and the read-only store view, reporting the Instrument record and nothing inferred", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4);
    const typed = s.gip.governanceInstrument(INSTRUMENT_A)!;
    expect(typed.value).toEqual(governanceInstrument());
    expect(typed.fact.key).toBe(gipInstrumentKey(INSTRUMENT_A));
    expect(readGovernanceInstrument(s.campaign.store, INSTRUMENT_A)).toEqual(typed);
    for (const id of [INSTRUMENT_B, OFFICE_MAGISTRATE, SCOPE_BINDING_A, INSTITUTION_COURT])
      expect(s.gip.governanceInstrument(id), id).toBeUndefined();
  });

  it("every exact operative_effect, validity_status and lifecycle_status literal is established and read back exactly as authored", async () => {
    const s = await withBinding();
    let n = 10;
    const ids: string[] = [];
    for (const effect of INSTRUMENT_OPERATIVE_EFFECTS) {
      const id = `instrument-effect-${effect}`;
      ids.push(id);
      await establishGovernanceInstrument(s, ++n, id, undefined, undefined, undefined, {
        operative_effect: effect,
      });
    }
    for (const status of INSTRUMENT_LIFECYCLE_STATUSES) {
      const id = `instrument-lifecycle-${status}`;
      ids.push(id);
      await establishGovernanceInstrument(s, ++n, id, undefined, undefined, undefined, {
        lifecycle_status: status,
      });
    }
    for (const status of INSTRUMENT_VALIDITY_STATUSES) {
      const id = `instrument-validity-${status}`;
      ids.push(id);
      await establishGovernanceInstrument(s, ++n, id, undefined, undefined, undefined, {
        validity_by_order: [
          { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: status },
        ],
      });
    }
    for (const effect of INSTRUMENT_OPERATIVE_EFFECTS)
      expect(
        s.gip.governanceInstrument(`instrument-effect-${effect}`)!.value.operative_effect,
      ).toBe(effect);
    for (const status of INSTRUMENT_LIFECYCLE_STATUSES)
      expect(
        s.gip.governanceInstrument(`instrument-lifecycle-${status}`)!.value.lifecycle_status,
      ).toBe(status);
    for (const status of INSTRUMENT_VALIDITY_STATUSES)
      expect(
        s.gip.governanceInstrument(`instrument-validity-${status}`)!.value.validity_by_order,
      ).toEqual([{ governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: status }]);
    expect(s.campaign.verify()).toEqual([]);
  }, 60_000);

  it("validity and lifecycle stay independent: no lifecycle value rewrites a validity entry and no validity value changes the lifecycle", async () => {
    const s = await withBinding();
    const combos: [string, string, string][] = [
      ["i-void-active", "void", "active"],
      ["i-valid-repealed", "valid", "repealed"],
      ["i-invalid-expired", "invalid", "expired"],
      ["i-contested-proposed", "contested", "proposed"],
      ["i-unresolved-superseded", "unresolved", "superseded"],
      ["i-valid-terminated", "valid", "terminated"],
    ];
    let n = 10;
    for (const [id, validity, lifecycle] of combos)
      await establishGovernanceInstrument(s, ++n, id, undefined, undefined, undefined, {
        lifecycle_status: lifecycle as never,
        validity_by_order: [
          { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: validity as never },
        ],
      });
    for (const [id, validity, lifecycle] of combos) {
      const v = s.gip.governanceInstrument(id)!.value;
      expect([v.validity_by_order[0]!.validity_status, v.lifecycle_status]).toEqual([
        validity,
        lifecycle,
      ]);
    }
  });
});

describe("a missing, mismatched or tampered source office or Scope Binding fails closed", () => {
  it("an office or binding that was never established is a missing prerequisite and nothing is created", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    const attempt = (n: number, over: Record<string, unknown> = {}) =>
      codeOf(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(n),
          instrument: governanceInstrument(
            INSTRUMENT_A,
            undefined,
            undefined,
            undefined,
            over as never,
          ),
        }),
      );
    expect(await attempt(1)).toBe("PREREQUISITE_MISSING"); // no institution, no office, no binding
    await establishInstitution(s, 2, INSTITUTION_COURT);
    expect(await attempt(3)).toBe("PREREQUISITE_MISSING"); // no office
    await establishOffice(s, 4, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    expect(await attempt(5)).toBe("PREREQUISITE_MISSING"); // an office but no binding
    expect(s.campaign.store.head().revision).toBe(before.revision + 2);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
  });

  it("an exact reference that names another office, institution, binding or a label never substitutes", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT, { identity_label: "label-of-the-court" });
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishOffice(s, 4, INSTITUTION_GUILD, OFFICE_TREASURER);
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    await establishScopeBinding(s, 6, INSTITUTION_GUILD, OFFICE_TREASURER, SCOPE_BINDING_A);
    const head = s.campaign.store.head();
    let n = 10;
    for (const [institution, office, binding] of [
      [INSTITUTION_GUILD, OFFICE_MAGISTRATE, SCOPE_BINDING_A], // the office id exists, but under another institution
      [INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A], // the office id exists, but under another institution
      [INSTITUTION_COUNCIL, OFFICE_MAGISTRATE, SCOPE_BINDING_A], // an institution never established
      [INSTITUTION_COURT, "office-never-established", SCOPE_BINDING_A],
      ["label-of-the-court", OFFICE_MAGISTRATE, SCOPE_BINDING_A], // a label is not an identity
      [FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID, SCOPE_BINDING_A], // foreign identifiers
      [INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_B], // a binding never established
      [INSTITUTION_COURT, OFFICE_MAGISTRATE, "scope-binding-never"],
    ] as const) {
      n++;
      expect(
        await codeOf(
          s.gip.establishGovernanceInstrument({
            ...gipPublication(n),
            instrument: governanceInstrument(INSTRUMENT_A, institution, office, binding),
          }),
        ),
        `${institution}/${office}/${binding}`,
      ).toBe("PREREQUISITE_MISSING");
    }
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("a Scope Binding of a DIFFERENT authority is refused: another office of the same institution, or another institution's office", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishDecisionBodyOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishOffice(s, 5, INSTITUTION_GUILD, OFFICE_MAGISTRATE);
    await establishScopeBinding(s, 6, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    await establishScopeBinding(s, 7, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_B);
    await establishScopeBinding(s, 8, INSTITUTION_GUILD, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    const head = s.campaign.store.head();
    let n = 20;
    for (const over of [
      { scope_binding_ref: scopeBindingRef(INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_B) },
      { scope_binding_ref: scopeBindingRef(INSTITUTION_GUILD, OFFICE_MAGISTRATE, SCOPE_BINDING_A) },
      { source_authority_ref: officeRef(INSTITUTION_COURT, OFFICE_TREASURER) },
      { source_authority_ref: officeRef(INSTITUTION_GUILD, OFFICE_MAGISTRATE) },
    ]) {
      n++;
      expect(
        await codeOf(
          s.gip.establishGovernanceInstrument({
            ...gipPublication(n),
            instrument: governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, over),
          }),
        ),
        JSON.stringify(over),
      ).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.gip.governanceInstrument(INSTRUMENT_A)).toBeUndefined();
  });

  it("holds for a raw store commit: a cross-authority binding or a value naming another authority than the one pinned is refused", async () => {
    const s = await withBinding();
    await establishDecisionBodyOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_B);
    const state = stateOf(s);
    const fact = (k: string) => s.campaign.store.getFact(k)!;
    const key = gipInstrumentKey(INSTRUMENT_A);
    const cross = governanceInstrument();
    (cross as any).scope_binding_ref = scopeBindingRef(
      INSTITUTION_COURT,
      OFFICE_TREASURER,
      SCOPE_BINDING_B,
    );
    // pinned exactly as the value says, but the value joins an office to a different office's binding
    expect(
      gipGroupCheck(
        rawInstrument(10, key, cross, 0, [
          fact(magistrateKey),
          fact(bindingKey(SCOPE_BINDING_B, OFFICE_TREASURER)),
        ]),
        state,
      )?.code,
    ).toBe("VALUE_INVALID");
    expect(
      gipGroupCheck(
        rawInstrument(11, key, governanceInstrument(), 0, [
          fact(magistrateKey),
          fact(bindingKey()),
        ]),
        state,
      ),
    ).toBeNull();
    // the value names the magistrate and its binding, the group pins the treasurer and its binding
    expect(
      gipGroupCheck(
        rawInstrument(12, key, governanceInstrument(), 0, [
          fact(treasurerKey),
          fact(bindingKey(SCOPE_BINDING_B, OFFICE_TREASURER)),
        ]),
        state,
      )?.code,
    ).toBe("REFERENCE_INVALID");
  });

  it("wrong Institution Identity ancestry fails closed: the office's institution identity missing, forged or owned by another owner", async () => {
    const s = await withBinding();
    const group = rawInstrument(20, gipInstrumentKey(INSTRUMENT_A), governanceInstrument(), 0, [
      s.campaign.store.getFact(magistrateKey)!,
      s.campaign.store.getFact(bindingKey())!,
    ]);
    const withFacts = (mutate: (facts: Map<string, any>) => void) => {
      const facts = new Map(
        s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f) as any]),
      );
      mutate(facts);
      return { facts } as unknown as CampaignState;
    };
    expect(
      gipGroupCheck(
        group,
        withFacts(() => {}),
      ),
    ).toBeNull();
    const identityMutations: Record<string, (f: Map<string, any>) => unknown> = {
      "identity removed": (f: Map<string, any>) => f.delete(courtKey),
      "identity value broken": (f: Map<string, any>) => delete f.get(courtKey).value.identity_label,
      "identity renamed": (f: Map<string, any>) =>
        (f.get(courtKey).value.institution_id = "forged"),
      "identity owner changed": (f: Map<string, any>) => (f.get(courtKey).owner = "world_state"),
    };
    for (const [name, mutate] of Object.entries(identityMutations))
      expect(gipGroupCheck(group, withFacts(mutate)), name).toMatchObject({
        code: "REFERENCE_INVALID",
      });
  });

  it("a tampered prerequisite in committed state is refused: an office or binding value that violates its contract, names another identity, has another owner or is gone", async () => {
    const s = await withBinding();
    const group = rawInstrument(30, gipInstrumentKey(INSTRUMENT_A), governanceInstrument(), 0, [
      s.campaign.store.getFact(magistrateKey)!,
      s.campaign.store.getFact(bindingKey())!,
    ]);
    const withFacts = (mutate: (facts: Map<string, any>) => void) => {
      const facts = new Map(
        s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f) as any]),
      );
      mutate(facts);
      return { facts } as unknown as CampaignState;
    };
    const mutations: Record<string, (f: Map<string, any>) => unknown> = {
      "office value broken": (f) => delete f.get(magistrateKey).value.powers,
      "office renamed": (f) => (f.get(magistrateKey).value.office_id = "forged"),
      "office institution changed": (f) =>
        (f.get(magistrateKey).value.institution_id = INSTITUTION_GUILD),
      "office owner changed": (f) => (f.get(magistrateKey).owner = "world_state"),
      "office removed": (f) => f.delete(magistrateKey),
      "binding value broken": (f) => delete f.get(bindingKey()).value.target_condition,
      "binding renamed": (f) => (f.get(bindingKey()).value.scope_binding_id = "forged"),
      "binding office changed": (f) => (f.get(bindingKey()).value.office_id = OFFICE_TREASURER),
      "binding institution changed": (f) =>
        (f.get(bindingKey()).value.institution_id = INSTITUTION_GUILD),
      "binding owner changed": (f) => (f.get(bindingKey()).owner = "world_state"),
      "binding removed": (f) => f.delete(bindingKey()),
    };
    for (const [name, mutate] of Object.entries(mutations))
      expect(gipGroupCheck(group, withFacts(mutate)), name).not.toBeNull();
  });

  it("holds for a raw store commit: an Instrument that pins the wrong parents, a stale version, nothing, only one parent or extra reads is refused by admission and by the live store", async () => {
    const s = await withBinding();
    await establishOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    const state = stateOf(s);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const binding = s.campaign.store.getFact(bindingKey())!;
    const sibling = s.campaign.store.getFact(treasurerKey)!;
    const identity = s.campaign.store.getFact(courtKey)!;
    const key = gipInstrumentKey(INSTRUMENT_A);
    const raw = (n: number, parents: any[], over: Partial<CommitGroup> = {}) =>
      rawInstrument(n, key, governanceInstrument(), 0, parents, over);
    expect(gipGroupCheck(raw(10, [office, binding]), state)).toBeNull();
    const refused: [string, CommitGroup][] = [
      ["pins only the office", raw(11, [office])],
      ["pins only the binding", raw(12, [binding])],
      ["pins a sibling office", raw(13, [sibling, binding])],
      ["pins the identity instead of the office", raw(14, [identity, binding])],
      [
        "stale office version",
        raw(15, [office, binding], {
          reads: [
            { key: magistrateKey, version: 7 },
            { key: bindingKey(), version: 1 },
          ],
        }),
      ],
      [
        "stale binding version",
        raw(16, [office, binding], {
          reads: [
            { key: magistrateKey, version: 1 },
            { key: bindingKey(), version: 7 },
          ],
        }),
      ],
      [
        "does not depend on the office's group",
        raw(17, [office, binding], { depends_on: [binding.provenance.group_id] }),
      ],
      [
        "does not depend on the binding's group",
        raw(18, [office, binding], { depends_on: [office.provenance.group_id] }),
      ],
      [
        "depends on another group",
        raw(19, [office, binding], {
          depends_on: [office.provenance.group_id, sibling.provenance.group_id],
        }),
      ],
      ["pins nothing", raw(20, [office, binding], { reads: [], depends_on: [] })],
      [
        "extra read",
        raw(21, [office, binding], {
          reads: [
            { key: magistrateKey, version: 1 },
            { key: bindingKey(), version: 1 },
            { key: courtKey, version: 1 },
          ],
        }),
      ],
      [
        "extra dependency",
        raw(22, [office, binding], {
          depends_on: [
            office.provenance.group_id,
            binding.provenance.group_id,
            identity.provenance.group_id,
          ],
        }),
      ],
    ];
    for (const [name, group] of refused) expect(gipGroupCheck(group, state), name).not.toBeNull();
    const head = s.campaign.store.head();
    for (const [name, group] of refused)
      expect(await codeOf(s.campaign.store.commit(group)), name).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("holds for a raw store commit: a key not derived from instrument_id, a value that violates the contract or a foreign citation is refused", async () => {
    const s = await withBinding();
    const state = stateOf(s);
    const parents = [
      s.campaign.store.getFact(magistrateKey)!,
      s.campaign.store.getFact(bindingKey())!,
    ];
    const code = (key: string, value: unknown, over: Partial<CommitGroup> = {}) =>
      gipGroupCheck(rawInstrument(40, key, value, 0, parents, over), state)?.code;
    expect(code(gipInstrumentKey(INSTRUMENT_B), governanceInstrument())).toBe("REFERENCE_INVALID"); // key names another identity
    expect(
      code(`${gipInstrumentKey(INSTRUMENT_A)}-${OFFICE_MAGISTRATE}`, governanceInstrument()),
    ).toBe("REFERENCE_INVALID");
    expect(code(`${gipInstrumentKey(INSTRUMENT_A)}/x`, governanceInstrument())).toBe(
      "VALUE_INVALID",
    );
    for (const bad of [
      { ...governanceInstrument(), operative_effects: ["obligation"] },
      { ...governanceInstrument(), activation_condition: "x-ref" },
      { ...governanceInstrument(), validity_status: "valid" },
      { ...governanceInstrument(), holder_ref: HOLDER_REF_A },
      governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, {
        operative_effect: "enacted" as never,
      }),
    ])
      expect(code(gipInstrumentKey(INSTRUMENT_A), bad), JSON.stringify(bad)).toBe("VALUE_INVALID");
    for (const rule of [
      GIP_SCOPE_BINDING_RULE,
      s.campaign.store.getFact(magistrateKey)!.provenance.rule,
      s.campaign.store.getFact(courtKey)!.provenance.rule,
      { ...GIP_INSTRUMENT_RULE, clause: "drifted" },
      { ...GIP_INSTRUMENT_RULE, native_pin: "2026-01-01T00:00:00.000Z" },
    ])
      expect(code(gipInstrumentKey(INSTRUMENT_A), governanceInstrument(), { rule }), "rule").toBe(
        "REFERENCE_INVALID",
      );
  });
});

describe("retry and replay converge on one Instrument and one receipt; a conflicting establishment fails closed", () => {
  it("re-presenting the same intent returns the original receipt and changes nothing", async () => {
    const s = await withBinding();
    const first = await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrument(),
      }),
    );
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A)));
    const again = await must(
      s.gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrument(),
      }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toEqual(fact);
    expect(gipFacts(s).filter((f) => f.key === gipInstrumentKey(INSTRUMENT_A))).toHaveLength(1);
  });

  it("a conflicting establishment at the same instrument_id fails closed and never overwrites: another effect, basis, validity, lifecycle, authority, binding or equal content under a new intent", async () => {
    const s = await withBinding();
    await establishDecisionBodyOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A);
    await establishGovernanceInstrument(s, 6);
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A)));
    const attempts: [number, any][] = [
      [7, { operative_effect: "prohibition" }],
      [8, { authority_basis_ref: AUTHORITY_BASIS_REF_B }],
      [9, { lifecycle_status: "repealed" }],
      [
        10,
        {
          validity_by_order: [
            { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "void" },
          ],
        },
      ],
      [
        11,
        {
          validity_by_order: [
            { governing_order_ref: GOVERNING_ORDER_REF_C, validity_status: "valid" },
          ],
        },
      ],
      [
        12,
        {
          source_authority_ref: officeRef(INSTITUTION_COURT, OFFICE_TREASURER),
          scope_binding_ref: scopeBindingRef(INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A),
        },
      ],
      [13, {}], // equal content under a new intent is a second writer of the same slot
    ];
    for (const [n, over] of attempts)
      expect(
        await codeOf(
          s.gip.establishGovernanceInstrument({
            ...gipPublication(n),
            instrument: governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, over),
          }),
        ),
        String(n),
      ).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toEqual(fact);
  });

  it("the same intent with a changed Instrument is a conflict, never a silent reuse or rewrite", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4);
    const fact = structuredClone(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A)));
    expect(
      await codeOf(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(4),
          instrument: governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, {
            lifecycle_status: "terminated",
          }),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toEqual(fact);
  });
});

describe("distinct Instruments are distinct only by their canonical instrument_id; nothing is copied per recipient, subject, place or governing order", () => {
  it("different instrument_ids coexist, even under one office and one binding with identical content; nothing is merged or deduplicated", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4, INSTRUMENT_A);
    await establishGovernanceInstrument(s, 5, INSTRUMENT_B); // identical content, new id
    await establishGovernanceInstrument(s, 6, INSTRUMENT_C, undefined, undefined, undefined, {
      operative_effect: "permission",
    });
    expect(gipFacts(s).map((f) => f.key)).toEqual(
      [
        courtKey,
        magistrateKey,
        bindingKey(),
        gipInstrumentKey(INSTRUMENT_A),
        gipInstrumentKey(INSTRUMENT_B),
        gipInstrumentKey(INSTRUMENT_C),
      ].sort(),
    );
    const a = s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!.value as any;
    const b = s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_B))!.value as any;
    expect({ ...a, instrument_id: "x" }).toEqual({ ...b, instrument_id: "x" });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("one Instrument carrying validity under several governing orders is ONE fact: validity_by_order[] stays inside it, no per-order Instrument exists", async () => {
    const s = await withBinding();
    const before = s.campaign.store.listFacts().length;
    await establishGovernanceInstrument(s, 4, INSTRUMENT_A, undefined, undefined, undefined, {
      validity_by_order: [
        { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" },
        { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "invalid" },
        { governing_order_ref: GOVERNING_ORDER_REF_C, validity_status: "contested" },
      ],
    });
    expect(s.campaign.store.listFacts()).toHaveLength(before + 1);
    expect(
      s.gip
        .governanceInstrument(INSTRUMENT_A)!
        .value.validity_by_order.map((e) => e.governing_order_ref),
    ).toEqual([GOVERNING_ORDER_REF_A, GOVERNING_ORDER_REF_B, GOVERNING_ORDER_REF_C]);
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.includes(GOVERNING_ORDER_REF_A)),
    ).toEqual([]);
  });

  it("an authored empty validity_by_order[] and repeated governing_order_ref entries are established and read back exactly as authored: no cardinality, uniqueness, merge, reorder or deduplication", async () => {
    const s = await withBinding();
    const repeated = [
      { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "valid" },
      { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "void" },
      { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "invalid" },
      { governing_order_ref: GOVERNING_ORDER_REF_B, validity_status: "invalid" },
    ] as const;
    await establishGovernanceInstrument(s, 4, INSTRUMENT_A, undefined, undefined, undefined, {
      validity_by_order: [],
    });
    await establishGovernanceInstrument(s, 5, INSTRUMENT_B, undefined, undefined, undefined, {
      validity_by_order: [...repeated],
    });
    expect(s.gip.governanceInstrument(INSTRUMENT_A)!.value.validity_by_order).toEqual([]);
    expect(s.gip.governanceInstrument(INSTRUMENT_B)!.value.validity_by_order).toEqual(repeated);
    expect(
      (s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_B))!.value as any).validity_by_order,
    ).toEqual(repeated);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the source office and the Scope Binding are not identity dimensions: the same instrument_id cannot be reused beneath another office or binding", async () => {
    const s = await withBinding();
    await establishOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A);
    await establishGovernanceInstrument(s, 6, INSTRUMENT_A, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    const fact = structuredClone(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A)));
    expect(
      await codeOf(
        s.gip.establishGovernanceInstrument({
          ...gipPublication(7),
          instrument: governanceInstrument(INSTRUMENT_A, INSTITUTION_COURT, OFFICE_TREASURER),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toEqual(fact);
    expect(gipFacts(s).filter((f) => f.key.startsWith("gip/instrument/"))).toHaveLength(1);
  });

  it("no per-subject copy exists: one Instrument is one fact, however many people, places or transactions its Scope Binding could name", async () => {
    const s = await withBinding();
    await seedInstitutionLikeNeighbors(s);
    const before = s.campaign.store.listFacts().length;
    await establishGovernanceInstrument(s, 4);
    expect(s.campaign.store.listFacts()).toHaveLength(before + 1);
  });
});

describe("opaque references: nothing is looked up, dereferenced, resolved or created", () => {
  it("whatever authority_basis_ref and governing_order_ref name — a locus, a world, an actor, a body, an institution, the office, nothing — establishment reads exactly the office and the binding and writes exactly one key", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishScopeBinding(s, 4, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    const refs = [
      AUTHORITY_BASIS_REF_A, // names nothing
      FIXTURE_LOCUS_ID,
      FIXTURE_WORLD_ID,
      INSTITUTION_GUILD,
      INSTITUTION_COURT,
      OFFICE_MAGISTRATE,
      SCOPE_BINDING_A, // the very binding the Instrument rests on
      INSTRUMENT_A, // another Instrument's identity
      ACTOR_SMITH,
      DECISION_BODY_REF_A,
      "kti-object-court-model",
    ];
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    const before = new Map(s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f)]));
    for (const [i, ref] of refs.entries()) {
      spy.getFacts.length = 0;
      await must(
        gip.establishGovernanceInstrument({
          ...gipPublication(10 + i),
          instrument: governanceInstrument(`instrument-ref-${i}`, undefined, undefined, undefined, {
            authority_basis_ref: ref,
            validity_by_order: [
              { governing_order_ref: ref, validity_status: "valid" },
              {
                governing_order_ref: FIXTURE_LOCUS_ID === ref ? FIXTURE_WORLD_ID : FIXTURE_LOCUS_ID,
                validity_status: "unresolved",
              },
            ],
          }),
        }),
      );
      expect(spy.getFacts, ref).toEqual([magistrateKey, bindingKey()]);
    }
    expect(spy.listCalls()).toBe(0);
    for (const g of spy.commits) expect(g.writes).toHaveLength(1);
    const after = s.campaign.store.listFacts();
    expect(after.filter((f) => !before.has(f.key))).toHaveLength(refs.length);
    for (const [key, fact] of before) expect(s.campaign.store.getFact(key)).toEqual(fact);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an existing Named Actor named as an authority basis or governing order gains no state, and the Instrument copies none of the actor's", async () => {
    const a = await seededActorCampaign(tempDir());
    await establishBasis(a, 1, ACTOR_SMITH);
    const gip = new GipAdapter(a.campaign.store);
    await must(
      gip.establishInstitution({
        ...gipPublication(1),
        institution: {
          institution_id: INSTITUTION_COURT,
          identity_label: "SYNTHETIC FIXTURE: a continuing test institution.",
          continuity_status: "continuing",
        },
      }),
    );
    await must(gip.establishOffice({ ...gipPublication(2), office: officeAuthorityLocus() }));
    await must(
      gip.establishScopeBinding({
        ...gipPublication(3),
        scope_binding: {
          scope_binding_id: SCOPE_BINDING_A,
          institution_id: INSTITUTION_COURT,
          office_id: OFFICE_MAGISTRATE,
          scope_type: "named actor",
          scope_ref: ACTOR_SMITH,
          target_condition: "SYNTHETIC FIXTURE.",
        },
      }),
    );
    const nonGip = a.campaign.store
      .listFacts()
      .filter((f) => !f.key.startsWith("gip/"))
      .map((f) => structuredClone(f));
    expect(nonGip.some((f) => f.key.startsWith("actor/"))).toBe(true);
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(4),
        instrument: governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, {
          authority_basis_ref: ACTOR_SMITH,
          validity_by_order: [{ governing_order_ref: ACTOR_SMITH, validity_status: "valid" }],
        }),
      }),
    );
    expect(a.campaign.store.listFacts().filter((f) => !f.key.startsWith("gip/"))).toEqual(nonGip);
    expect(a.campaign.verify()).toEqual([]);
    await a.campaign.close();
  });
});

describe("no procedure, vote, calculation, applicability, promulgation, dissemination, Reach, implementation or compliance state is created or inferred", () => {
  it("establishment adds exactly the one Instrument key: no clause, validity row, order object, decision, temporal object, actor, population or foreign state", async () => {
    const s = await withBinding();
    const before = new Set(s.campaign.store.listFacts().map((f) => f.key));
    const headBefore = s.campaign.store.head();
    await establishGovernanceInstrument(s, 4);
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added.map((f) => f.key)).toEqual([gipInstrumentKey(INSTRUMENT_A)]);
    expect(s.campaign.store.head().revision).toBe(headBefore.revision + 1);
    const prefixes = new Set(s.campaign.store.listFacts().map((f) => f.key.split("/")[0]));
    expect([...prefixes].sort()).toEqual(["gip", "pc", "role-registry", "world"]);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
    const stored = added[0]!.value as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(Object.keys(governanceInstrument()).sort());
    expect(Object.keys(stored).sort()).toEqual(
      [
        "authority_basis_ref",
        "instrument_id",
        "lifecycle_status",
        "operative_effect",
        "scope_binding_ref",
        "source_authority_ref",
        "validity_by_order",
      ].sort(),
    );
  });

  it("the stored status and validity are exactly the authored ones: the engine derives nothing from the office, the basis, the scope or an `active` lifecycle", async () => {
    const s = await withBinding();
    // an active lifecycle under a void or invalid order, a repealed lifecycle under a valid order: nothing is reconciled
    await establishGovernanceInstrument(s, 4, INSTRUMENT_A, undefined, undefined, undefined, {
      lifecycle_status: "active",
      validity_by_order: [{ governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "void" }],
    });
    await establishGovernanceInstrument(s, 5, INSTRUMENT_B, undefined, undefined, undefined, {
      lifecycle_status: "repealed",
      validity_by_order: [{ governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "valid" }],
    });
    expect(s.gip.governanceInstrument(INSTRUMENT_A)!.value).toMatchObject({
      lifecycle_status: "active",
      validity_by_order: [{ validity_status: "void" }],
    });
    expect(s.gip.governanceInstrument(INSTRUMENT_B)!.value).toMatchObject({
      lifecycle_status: "repealed",
      validity_by_order: [{ validity_status: "valid" }],
    });
  });

  it("the office, its Scope Binding and its Institution Identity are byte-for-byte unchanged by an Instrument", async () => {
    const s = await withBinding();
    const office = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    const binding = structuredClone(s.campaign.store.getFact(bindingKey())!);
    const identity = structuredClone(s.campaign.store.getFact(courtKey)!);
    await establishGovernanceInstrument(s, 4, INSTRUMENT_A);
    await establishGovernanceInstrument(s, 5, INSTRUMENT_B);
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(office);
    expect(s.campaign.store.getFact(bindingKey())).toEqual(binding);
    expect(s.campaign.store.getFact(courtKey)).toEqual(identity);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("neighbors that look like orders, laws or targets (a Population ledger, an institutional KTI model, a world locus) create and receive no Instrument", async () => {
    const s = await withBinding();
    await seedInstitutionLikeNeighbors(s);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey, bindingKey()]);
    await establishGovernanceInstrument(s, 4);
    expect(gipFacts(s).map((f) => f.key)).toEqual([
      courtKey,
      magistrateKey,
      bindingKey(),
      gipInstrumentKey(INSTRUMENT_A),
    ]);
  });

  it("an office, an institution or a Scope Binding alone creates no Instrument", async () => {
    const s = await withBinding();
    await establishDecisionBodyOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    expect(gipFacts(s).filter((f) => f.key.startsWith("gip/instrument/"))).toEqual([]);
  });
});

describe("post-establishment Instrument mutation is unsupported in this slice", () => {
  it("the adapter exposes no method that moves an Instrument: the only writer is the initial establishment", () => {
    const methods = Object.getOwnPropertyNames(GipAdapter.prototype)
      .filter((m) => m !== "constructor")
      .sort();
    expect(methods.filter((m) => /instrument/i.test(m))).toEqual([
      "establishGovernanceInstrument",
      "governanceInstrument",
    ]);
    expect(
      methods.filter((m) =>
        /update|replace|amend|change|set|remove|revoke|enact|repeal|suspend|supersede|advance|calculate|derive|resolve|apply|promulgate|disseminate|implement|enforce|merge|split|expire|terminate|activate|invalidate/i.test(
          m,
        ),
      ),
    ).toEqual([]);
  });

  it("every raw expected-version write to an established Instrument — a new validity, lifecycle, effect, basis, authority or binding — is an unsupported amendment; an occupied create is a version conflict", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4);
    const fact = structuredClone(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!);
    const parents = [
      s.campaign.store.getFact(magistrateKey)!,
      s.campaign.store.getFact(bindingKey())!,
    ];
    const over = (o: Record<string, unknown>) =>
      governanceInstrument(INSTRUMENT_A, undefined, undefined, undefined, o as never);
    let n = 200;
    for (const [expected_version, value, code] of [
      [1, over({ lifecycle_status: "repealed" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ lifecycle_status: "superseded" }), "AMENDMENT_NOT_SUPPORTED"],
      [
        1,
        over({
          validity_by_order: [
            { governing_order_ref: GOVERNING_ORDER_REF_A, validity_status: "invalid" },
          ],
        }),
        "AMENDMENT_NOT_SUPPORTED",
      ],
      [1, over({ operative_effect: "repeal" }), "AMENDMENT_NOT_SUPPORTED"],
      [1, over({ authority_basis_ref: AUTHORITY_BASIS_REF_B }), "AMENDMENT_NOT_SUPPORTED"],
      [1, governanceInstrument(), "AMENDMENT_NOT_SUPPORTED"], // even an unchanged re-statement
      [2, over({ lifecycle_status: "expired" }), "VERSION_CONFLICT"],
      [0, over({ lifecycle_status: "expired" }), "VERSION_CONFLICT"],
      [0, governanceInstrument(), "VERSION_CONFLICT"],
    ] as const) {
      n++;
      expect(
        await codeOf(
          s.campaign.store.commit(
            rawInstrument(n, gipInstrumentKey(INSTRUMENT_A), value, expected_version, parents),
          ),
        ),
        `${expected_version} ${JSON.stringify(value)}`,
      ).toBe(code);
    }
    expect(s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))).toEqual(fact);
  });

  it("establishing an Instrument does not unlock an office or Scope Binding transition: raw writes to them are still unsupported amendments", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4);
    const identity = s.campaign.store.getFact(courtKey)!;
    const office = s.campaign.store.getFact(magistrateKey)!;
    const officeWrite = rawInstrument(300, magistrateKey, officeAuthorityLocus(), 1, [identity], {
      rule: factKind("gip_office_authority_locus").rule,
    });
    expect(await codeOf(s.campaign.store.commit(officeWrite))).toBe("AMENDMENT_NOT_SUPPORTED");
    const bindingWrite = rawInstrument(301, bindingKey(), scopeBinding(), 1, [office], {
      rule: GIP_SCOPE_BINDING_RULE,
    });
    expect(await codeOf(s.campaign.store.commit(bindingWrite))).toBe("AMENDMENT_NOT_SUPPORTED");
  });
});

describe("the governing-rule citation of an Instrument is its own", () => {
  it("a newly committed Instrument carries the Instrument citation, distinct from the binding's, the office's and the identity's", async () => {
    const s = await withBinding();
    await establishGovernanceInstrument(s, 4);
    const fact = s.campaign.store.getFact(gipInstrumentKey(INSTRUMENT_A))!;
    expect(fact.provenance.rule).toEqual(GIP_INSTRUMENT_RULE);
    for (const k of [bindingKey(), magistrateKey, courtKey])
      expect(fact.provenance.rule).not.toEqual(s.campaign.store.getFact(k)!.provenance.rule);
    expect(GIP_INSTRUMENT_RULE.clause).toContain("§4.1 Mandatory fields");
  });
});

describe("the engaged establish and read paths are directly keyed and never list or scan", () => {
  it("with many unrelated institutions, offices, bindings and Instruments present, establishing and reading one Instrument touches only its office, its binding and its own key", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    let n = 0;
    for (const inst of ["inst-a", "inst-b", INSTITUTION_COURT]) {
      await establishInstitution(s, ++n, inst);
      for (const office of ["office-1", OFFICE_MAGISTRATE]) {
        await establishOffice(s, ++n, inst, office);
        await establishScopeBinding(s, ++n, inst, office, SCOPE_BINDING_A);
        await establishGovernanceInstrument(
          s,
          ++n,
          `instrument-${inst}-${office}`,
          inst,
          office,
          SCOPE_BINDING_A,
        );
      }
    }
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(
      gip.establishGovernanceInstrument({
        ...gipPublication(n + 1),
        instrument: governanceInstrument("instrument-new"),
      }),
    );
    expect(spy.getFacts).toEqual([magistrateKey, bindingKey()]);
    expect(spy.listCalls()).toBe(0);
    expect(spy.commits).toHaveLength(1);
    expect(spy.commits[0]!.writes.map((w) => w.key)).toEqual([gipInstrumentKey("instrument-new")]);
    spy.getFacts.length = 0;
    expect(gip.governanceInstrument("instrument-new")).toBeDefined();
    expect(gip.governanceInstrument(`instrument-inst-a-office-1`)).toBeDefined();
    expect(spy.getFacts).toEqual([
      gipInstrumentKey("instrument-new"),
      gipInstrumentKey("instrument-inst-a-office-1"),
    ]);
    expect(spy.listCalls()).toBe(0);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("owner exclusivity: only the GIP owner, through the GIP facet, writes the Instrument key space", () => {
  it("a raw commit by any foreign owner, facet or authority to an Instrument key is refused", async () => {
    const s = await withBinding();
    const parents = [
      s.campaign.store.getFact(magistrateKey)!,
      s.campaign.store.getFact(bindingKey())!,
    ];
    let n = 500;
    for (const over of [
      { owner: "world_state", facet: "world_locus" },
      { owner: "kti", facet: "kti_development" },
      { owner: "population", facet: "population_state" },
      { owner: "gip", facet: "world_locus" },
      { authority: { ...CANON_WRITE_AUTHORITY, source: "host" } as never },
    ] as const) {
      n++;
      const group = rawInstrument(
        n,
        gipInstrumentKey(INSTRUMENT_A),
        governanceInstrument(),
        0,
        parents,
        over as never,
      );
      if ("owner" in over)
        group.writes = [{ ...group.writes[0]!, owner: over.owner, facet: (over as any).facet }];
      expect(await codeOf(s.campaign.store.commit(group)), JSON.stringify(over)).not.toBe("OK");
    }
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey, bindingKey()]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------

function stateOf(s: Awaited<ReturnType<typeof withBinding>>): CampaignState {
  return {
    facts: new Map(s.campaign.store.listFacts().map((f) => [f.key, f])),
  } as unknown as CampaignState;
}

/** A raw Instrument group as an unauthorized caller might build it: no registry, no adapter. `parents` are the facts it pins. */
function rawInstrument(
  n: number,
  key: string,
  value: unknown,
  expected_version: number,
  parents: { key: string; version: number; provenance: { group_id: string } }[],
  over: Partial<CommitGroup> = {},
): CommitGroup {
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "gip",
    facet: "gip_institution_identity",
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: GIP_INSTRUMENT_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: parents.map((p) => ({ key: p.key, version: p.version })),
    depends_on: parents.map((p) => p.provenance.group_id),
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
