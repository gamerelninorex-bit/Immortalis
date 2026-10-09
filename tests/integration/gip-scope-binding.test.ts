/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact, group and state values */
// GIP Authority Scope Binding Backbone Foundation (fifteenth slice) — INITIAL ESTABLISHMENT ONLY of one GIP-owned Scope
// Binding beneath one exact already-committed Office / Authority Locus (WS-007 §5), under the same GIP owner and facet, the same
// create-only ADVANCING admission, persistence and recovery path. Every scope, exception and priority-or-conflict rule reference is opaque and
// never resolved; `target_condition` and `inheritance_rule` are carried text, never executed; no Governance Instrument, validity,
// applicability result, procedure, vote, exercise, reach, awareness or compliance state is created or inferred; and every
// post-establishment change is refused.
// Register lineage: IA-01/02/03/06 (partial), IA-22 (partial); RC-02/07/16; IM-03, IM-06, IM-11, IM-12, IM-17. Source lock:
// spec/f027/spec-lock.json (F-027 v1.0): WS-007. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  gipInstitutionIdentityKey,
  gipOfficeAuthorityLocusKey,
  gipScopeBindingKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  GIP_SCOPE_BINDING_RULE,
  GipAdapter,
  factKind,
  gipGroupCheck,
  readScopeBinding,
  type CampaignState,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  DECISION_BODY_REF_A,
  EXCEPTION_REF_A,
  EXCEPTION_REF_B,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  HOLDER_REF_A,
  INSTITUTION_COUNCIL,
  INSTITUTION_COURT,
  INSTITUTION_GUILD,
  OFFICE_MAGISTRATE,
  OFFICE_TREASURER,
  PRIORITY_OR_CONFLICT_RULE_REF_A,
  PRIORITY_OR_CONFLICT_RULE_REF_B,
  SCOPE_BINDING_A,
  SCOPE_BINDING_B,
  SCOPE_BINDING_C,
  SCOPE_REF_A,
  SCOPE_REF_B,
  decisionBodyOfficeAuthorityLocus,
  fullScopeBinding,
  gipPublication,
  officeAuthorityLocus,
  scopeBinding,
} from "@immortalis/testkit";
import {
  establishDecisionBodyOffice,
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

async function withOffice(dir = tempDir()) {
  const s = await seededGipCampaign(dir);
  await establishInstitution(s, 1, INSTITUTION_COURT);
  await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
  return s;
}

describe("a Scope Binding can be established beneath an exact committed office", () => {
  it("beneath a holder-reference office: one create-only ADVANCING write under the sole GIP owner, exactly as authored", async () => {
    const s = await withOffice();
    const before = s.campaign.store.head();
    const out = await must(
      s.gip.establishScopeBinding({ ...gipPublication(3), scope_binding: fullScopeBinding() }),
    );
    expect(out.replayed).toBe(false);
    const fact = s.campaign.store.getFact(bindingKey())!;
    expect([fact.owner, fact.facet, fact.version]).toEqual(["gip", "gip_institution_identity", 1]);
    expect(fact.value).toEqual(fullScopeBinding());
    expect(factKind("gip_scope_binding").lifecycle).toBe("ADVANCING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey, bindingKey()]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("beneath a decision-body-reference office, without dereferencing that body", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishDecisionBodyOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(gip.establishScopeBinding({ ...gipPublication(3), scope_binding: scopeBinding() }));
    // the only read is the parent office: neither the body it names nor the institution is read or resolved
    expect(spy.getFacts).toEqual([magistrateKey]);
    expect(spy.listCalls()).toBe(0);
    expect(s.campaign.store.getFact(bindingKey())!.value).toEqual(scopeBinding());
    expect(s.campaign.store.getFact(magistrateKey)!.value).toEqual(
      decisionBodyOfficeAuthorityLocus(),
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the binding semantics do not depend on the office's reference branch: both branches yield the same binding shape, key form, pin and provenance form", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishScopeBinding(s, 4, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_TREASURER);
    const h = s.campaign.store.committedGroup(gipPublication(4).intent_id)!;
    const b = s.campaign.store.committedGroup(gipPublication(5).intent_id)!;
    const shape = (g: typeof h, office: string) => ({
      reads: g.reads.map((r) => [r.key, r.version]),
      writes: g.writes.map((w) => [w.key, w.expected_version]),
      owner: g.owner,
      facet: g.facet,
      rule: g.rule,
      authority: g.authority,
      depends: g.depends_on.length,
      office,
    });
    expect(shape(h, "-").rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(shape(b, "-").rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(h.reads).toEqual([{ key: magistrateKey, version: 1 }]);
    expect(b.reads).toEqual([{ key: treasurerKey, version: 1 }]);
    expect(h.depends_on).toEqual([s.campaign.store.getFact(magistrateKey)!.provenance.group_id]);
    expect(b.depends_on).toEqual([s.campaign.store.getFact(treasurerKey)!.provenance.group_id]);
    expect(h.writes.map((w) => w.expected_version)).toEqual([0]);
    expect(b.writes.map((w) => w.expected_version)).toEqual([0]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("pins exactly its parent office at the office's current version and the group that committed it, and nothing else", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const g = s.campaign.store.committedGroup(gipPublication(3).intent_id)!;
    expect(g.reads).toEqual([{ key: magistrateKey, version: office.version }]);
    expect(g.depends_on).toEqual([office.provenance.group_id]);
    expect(g.writes.map((w) => [w.key, w.expected_version])).toEqual([[bindingKey(), 0]]);
    expect(g.rule).toEqual(factKind("gip_scope_binding").rule);
    expect(g.authority).toEqual({ ...CANON_WRITE_AUTHORITY });
  });

  it("is read by exact key through the adapter and the read-only store view, reporting the binding record and nothing inferred", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3);
    const typed = s.gip.scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A)!;
    expect(typed.value).toEqual(scopeBinding());
    expect(typed.fact.key).toBe(bindingKey());
    expect(
      readScopeBinding(s.campaign.store, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A),
    ).toEqual(typed);
    for (const [i, o, b] of [
      [INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_B],
      [INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A],
      [INSTITUTION_GUILD, OFFICE_MAGISTRATE, SCOPE_BINDING_A],
    ] as const)
      expect(s.gip.scopeBinding(i, o, b), `${i}/${o}/${b}`).toBeUndefined();
  });
});

describe("a missing, mismatched or tampered parent office fails closed", () => {
  it("an office that was never established — with or without its institution — is a missing prerequisite and nothing is created", async () => {
    const s = await seededGipCampaign(tempDir());
    const before = s.campaign.store.head();
    expect(
      await codeOf(
        s.gip.establishScopeBinding({ ...gipPublication(1), scope_binding: scopeBinding() }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    await establishInstitution(s, 2, INSTITUTION_COURT);
    expect(
      await codeOf(
        s.gip.establishScopeBinding({ ...gipPublication(3), scope_binding: scopeBinding() }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head().revision).toBe(before.revision + 1);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey]);
  });

  it("the wrong institution / office identity chain never substitutes: another institution, another office id, a label or a world identifier is refused", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT, { identity_label: "label-of-the-court" });
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishOffice(s, 4, INSTITUTION_GUILD, OFFICE_TREASURER);
    const head = s.campaign.store.head();
    let n = 10;
    for (const [institution, office] of [
      [INSTITUTION_GUILD, OFFICE_MAGISTRATE], // the office id exists, but under another institution
      [INSTITUTION_COURT, OFFICE_TREASURER], // the office id exists, but under another institution
      [INSTITUTION_COUNCIL, OFFICE_MAGISTRATE], // an institution that was never established
      [INSTITUTION_COURT, "office-never-established"],
      ["label-of-the-court", OFFICE_MAGISTRATE], // a label is not an identity
      [FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID], // foreign identifiers
      [INSTITUTION_COURT, INSTITUTION_COURT], // the institution's own id used as an office id
    ] as const) {
      n++;
      expect(
        await codeOf(
          s.gip.establishScopeBinding({
            ...gipPublication(n),
            scope_binding: scopeBinding(institution, office),
          }),
        ),
        `${institution}/${office}`,
      ).toBe("PREREQUISITE_MISSING");
    }
    expect(s.campaign.store.head()).toEqual(head);
    expect(gipFacts(s).map((f) => f.key)).toEqual([
      courtKey,
      magistrateKey,
      gipInstitutionIdentityKey(INSTITUTION_GUILD),
      gipOfficeAuthorityLocusKey(INSTITUTION_GUILD, OFFICE_TREASURER),
    ]);
  });

  it("holds for a raw store commit: admission refuses a binding that pins the wrong parent, a stale parent version, an unpinned group or extra reads", async () => {
    const s = await withOffice();
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    const state = stateOf(s);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const sibling = s.campaign.store.getFact(treasurerKey)!;
    const identity = s.campaign.store.getFact(courtKey)!;
    const ok = rawBinding(10, bindingKey(), scopeBinding(), 0, office);
    expect(gipGroupCheck(ok, state)).toBeNull();
    const refused: [string, CommitGroup][] = [
      ["pins a sibling office", rawBinding(11, bindingKey(), scopeBinding(), 0, sibling)],
      [
        "pins the institution identity instead of the office",
        rawBinding(12, bindingKey(), scopeBinding(), 0, identity),
      ],
      [
        "stale parent version",
        rawBinding(13, bindingKey(), scopeBinding(), 0, office, {
          reads: [{ key: magistrateKey, version: 7 }],
        }),
      ],
      [
        "does not depend on the office's group",
        rawBinding(14, bindingKey(), scopeBinding(), 0, office, { depends_on: [] }),
      ],
      [
        "depends on another group",
        rawBinding(15, bindingKey(), scopeBinding(), 0, office, {
          depends_on: [sibling.provenance.group_id],
        }),
      ],
      [
        "pins nothing",
        rawBinding(16, bindingKey(), scopeBinding(), 0, office, { reads: [], depends_on: [] }),
      ],
      [
        "extra read",
        rawBinding(17, bindingKey(), scopeBinding(), 0, office, {
          reads: [
            { key: magistrateKey, version: office.version },
            { key: courtKey, version: identity.version },
          ],
        }),
      ],
      [
        "extra dependency",
        rawBinding(18, bindingKey(), scopeBinding(), 0, office, {
          depends_on: [office.provenance.group_id, identity.provenance.group_id],
        }),
      ],
    ];
    for (const [name, group] of refused) expect(gipGroupCheck(group, state), name).not.toBeNull();
    // each is likewise refused by the live store, which commits nothing
    const head = s.campaign.store.head();
    for (const [name, group] of refused)
      expect(await codeOf(s.campaign.store.commit(group)), name).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("holds for a raw store commit: a binding value naming a different institution, office or binding than its key — or a key not derived from its identities — is refused", async () => {
    const s = await withOffice();
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    const state = stateOf(s);
    const office = s.campaign.store.getFact(magistrateKey)!;
    const code = (key: string, value: unknown) =>
      gipGroupCheck(rawBinding(20, key, value, 0, office), state)?.code;
    // the value names the sibling office but sits under (and pins) the magistrate: refused
    expect(code(bindingKey(), scopeBinding(INSTITUTION_COURT, OFFICE_TREASURER))).toBe(
      "REFERENCE_INVALID",
    );
    // the value names another binding than the key
    expect(
      code(bindingKey(), scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_B)),
    ).toBe("REFERENCE_INVALID");
    // a key the identities do not derive (the scope reference or a label embedded in it)
    expect(code(`${bindingKey()}-${SCOPE_REF_A}`, scopeBinding())).toBe("REFERENCE_INVALID");
    expect(code(`${bindingKey()}/${SCOPE_REF_A}`, scopeBinding())).toBe("VALUE_INVALID");
    expect(code(bindingKey(SCOPE_REF_A), scopeBinding())).toBe("REFERENCE_INVALID");
    // a value that violates the contract
    expect(code(bindingKey(), { ...scopeBinding(), instrument_ref: "i-1" })).toBe("VALUE_INVALID");
    expect(code(bindingKey(), { ...scopeBinding(), holder_ref: HOLDER_REF_A })).toBe(
      "VALUE_INVALID",
    );
  });

  it("a tampered parent in committed state is refused: an office value that violates its contract, names another office or is the wrong kind", async () => {
    const s = await withOffice();
    const office = s.campaign.store.getFact(magistrateKey)!;
    const identity = s.campaign.store.getFact(courtKey)!;
    const group = rawBinding(30, bindingKey(), scopeBinding(), 0, office);
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
    const mutations: Record<string, (f: Map<string, any>) => unknown> = {
      "office value broken": (f: Map<string, any>) => delete f.get(magistrateKey).value.powers,
      "office renamed": (f: Map<string, any>) => (f.get(magistrateKey).value.office_id = "forged"),
      "office institution changed": (f: Map<string, any>) =>
        (f.get(magistrateKey).value.institution_id = INSTITUTION_GUILD),
      "office owner changed": (f: Map<string, any>) => (f.get(magistrateKey).owner = "world_state"),
      "office removed": (f: Map<string, any>) => f.delete(magistrateKey),
      "identity removed": (f: Map<string, any>) => f.delete(courtKey),
      "identity value broken": (f: Map<string, any>) => delete f.get(courtKey).value.identity_label,
      "identity renamed": (f: Map<string, any>) =>
        (f.get(courtKey).value.institution_id = "forged"),
      "identity owner changed": (f: Map<string, any>) => (f.get(courtKey).owner = "world_state"),
    };
    for (const [name, mutate] of Object.entries(mutations))
      expect(gipGroupCheck(group, withFacts(mutate)), name).not.toBeNull();
    expect(identity.version).toBe(1);
  });
});

describe("retry and replay converge on one binding and one receipt; a conflicting establishment fails closed", () => {
  it("re-presenting the same intent returns the original receipt and changes nothing", async () => {
    const s = await withOffice();
    const first = await must(
      s.gip.establishScopeBinding({ ...gipPublication(3), scope_binding: fullScopeBinding() }),
    );
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(bindingKey()));
    const again = await must(
      s.gip.establishScopeBinding({ ...gipPublication(3), scope_binding: fullScopeBinding() }),
    );
    expect(again.replayed).toBe(true);
    expect(again.receipt).toEqual(first.receipt);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(bindingKey())).toEqual(fact);
    expect(gipFacts(s).filter((f) => f.key === bindingKey())).toHaveLength(1);
  });

  it("a conflicting establishment at the same binding identity fails closed and never overwrites: another scope, condition, rule, exception, priority-or-conflict rule or even equal content under a new intent", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3);
    const head = s.campaign.store.head();
    const fact = structuredClone(s.campaign.store.getFact(bindingKey()));
    for (const [n, over] of [
      [4, { scope_ref: SCOPE_REF_B }],
      [5, { target_condition: "SYNTHETIC FIXTURE: another condition." }],
      [6, { scope_type: "SYNTHETIC FIXTURE: another classification." }],
      [7, { inheritance_rule: "SYNTHETIC FIXTURE: an added inheritance rule." }],
      [8, { exception_refs: [EXCEPTION_REF_A] }],
      [9, { priority_or_conflict_rule_ref: PRIORITY_OR_CONFLICT_RULE_REF_A }],
      [10, {}], // equal content under a new intent is a second writer of the same slot
    ] as const)
      expect(
        await codeOf(
          s.gip.establishScopeBinding({
            ...gipPublication(n),
            scope_binding: scopeBinding(
              INSTITUTION_COURT,
              OFFICE_MAGISTRATE,
              SCOPE_BINDING_A,
              over as never,
            ),
          }),
        ),
        String(n),
      ).not.toBe("OK");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(bindingKey())).toEqual(fact);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey, bindingKey()]);
  });

  it("the same intent with a changed binding is a conflict, never a silent reuse or rewrite", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3);
    const fact = structuredClone(s.campaign.store.getFact(bindingKey()));
    expect(
      await codeOf(
        s.gip.establishScopeBinding({
          ...gipPublication(3),
          scope_binding: scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
            scope_ref: SCOPE_REF_B,
          }),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(bindingKey())).toEqual(fact);
  });
});

describe("distinct bindings under one office are distinct only by their canonical authored identities", () => {
  it("different scope_binding_ids coexist beneath one office, each keyed once, even with identical content or the same scope_ref; nothing is merged or deduplicated", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A);
    await establishScopeBinding(s, 4, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_B); // identical content, new id
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_C, {
      scope_ref: SCOPE_REF_B,
    });
    expect(gipFacts(s).map((f) => f.key)).toEqual([
      courtKey,
      magistrateKey,
      bindingKey(SCOPE_BINDING_A),
      bindingKey(SCOPE_BINDING_B),
      bindingKey(SCOPE_BINDING_C),
    ]);
    const a = s.campaign.store.getFact(bindingKey(SCOPE_BINDING_A))!.value as any;
    const b = s.campaign.store.getFact(bindingKey(SCOPE_BINDING_B))!.value as any;
    expect({ ...a, scope_binding_id: "x" }).toEqual({ ...b, scope_binding_id: "x" });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the same scope_binding_id may exist beneath different offices and institutions: the parent office is part of the identity", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishOffice(s, 4, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishDecisionBodyOffice(s, 5, INSTITUTION_GUILD, OFFICE_MAGISTRATE);
    await establishScopeBinding(s, 6, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishScopeBinding(s, 7, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishScopeBinding(s, 8, INSTITUTION_GUILD, OFFICE_MAGISTRATE);
    const keys = gipFacts(s)
      .map((f) => f.key)
      .filter((k) => k.includes("/scope-binding/"));
    expect(keys.sort()).toEqual(
      [
        bindingKey(SCOPE_BINDING_A, OFFICE_MAGISTRATE, INSTITUTION_COURT),
        bindingKey(SCOPE_BINDING_A, OFFICE_TREASURER, INSTITUTION_COURT),
        bindingKey(SCOPE_BINDING_A, OFFICE_MAGISTRATE, INSTITUTION_GUILD),
      ].sort(),
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("no per-subject copy exists: one binding is one fact, however many places, residents, populations, actors or transactions its scope_ref could name", async () => {
    const s = await withOffice();
    await seedInstitutionLikeNeighbors(s);
    const before = s.campaign.store.listFacts().length;
    await establishScopeBinding(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
      scope_ref: FIXTURE_LOCUS_ID, // names a real world locus: still one binding
      scope_type: "jurisdiction/place",
    });
    expect(s.campaign.store.listFacts()).toHaveLength(before + 1);
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.includes(FIXTURE_LOCUS_ID) && f.key.startsWith("gip/")),
    ).toEqual([]);
  });
});

describe("opaque references and carried text: nothing is looked up, resolved, executed or created", () => {
  it("whatever scope_ref, exception_refs and priority_or_conflict_rule_ref name — a locus, a world, a Population ledger, an institution, an office, an actor, a body, nothing — establishment reads exactly the one parent office and writes exactly one key", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishInstitution(s, 2, INSTITUTION_GUILD);
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    const refs = [
      SCOPE_REF_A, // names nothing
      FIXTURE_LOCUS_ID, // a real world locus
      FIXTURE_WORLD_ID, // a real world
      INSTITUTION_GUILD, // another committed institution
      INSTITUTION_COURT, // the office's own institution
      OFFICE_MAGISTRATE, // the parent office itself
      ACTOR_SMITH, // an actor identifier
      DECISION_BODY_REF_A,
      "kti-object-court-model", // a real KTI object
    ];
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    const before = new Map(s.campaign.store.listFacts().map((f) => [f.key, structuredClone(f)]));
    for (const [i, ref] of refs.entries()) {
      spy.getFacts.length = 0;
      await must(
        gip.establishScopeBinding({
          ...gipPublication(10 + i),
          scope_binding: scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, `scope-binding-${i}`, {
            scope_ref: ref,
            exception_refs: [ref, FIXTURE_LOCUS_ID],
            priority_or_conflict_rule_ref: ref,
          }),
        }),
      );
      expect(spy.getFacts, ref).toEqual([magistrateKey]);
    }
    expect(spy.listCalls()).toBe(0);
    for (const g of spy.commits) expect(g.writes).toHaveLength(1);
    const after = s.campaign.store.listFacts();
    expect(after.filter((f) => !before.has(f.key))).toHaveLength(refs.length);
    for (const [key, fact] of before) expect(s.campaign.store.getFact(key)).toEqual(fact);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an existing Named Actor named by the binding gains no state, and the binding copies none of the actor's", async () => {
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
    const nonGip = a.campaign.store
      .listFacts()
      .filter((f) => !f.key.startsWith("gip/"))
      .map((f) => structuredClone(f));
    expect(nonGip.some((f) => f.key.startsWith("actor/"))).toBe(true);
    await must(
      gip.establishScopeBinding({
        ...gipPublication(3),
        scope_binding: scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
          scope_type: "named actor",
          scope_ref: ACTOR_SMITH,
          exception_refs: [ACTOR_SMITH],
          priority_or_conflict_rule_ref: ACTOR_SMITH,
        }),
      }),
    );
    expect(a.campaign.store.listFacts().filter((f) => !f.key.startsWith("gip/"))).toEqual(nonGip);
    expect(a.campaign.verify()).toEqual([]);
    await a.campaign.close();
  });

  it("target_condition and inheritance_rule are stored verbatim whatever they say, and are not executed, parsed, normalised or compared", async () => {
    const s = await withOffice();
    const texts = [
      "applies to everyone EXCEPT the guild; if (x) { y }",
      'JSON-looking {"scope": ["a", "b"], "mode": "inherit"} and 12345',
      "inherits to all contained places unless an exception applies; NOT A RULE LANGUAGE",
    ];
    for (const [i, text] of texts.entries())
      await establishScopeBinding(
        s,
        3 + i,
        INSTITUTION_COURT,
        OFFICE_MAGISTRATE,
        `binding-text-${i}`,
        {
          target_condition: text,
          inheritance_rule: texts[(i + 1) % texts.length]!,
          scope_type: text,
        },
      );
    for (const [i, text] of texts.entries()) {
      const v = s.campaign.store.getFact(bindingKey(`binding-text-${i}`))!.value as any;
      expect(v.target_condition).toBe(text);
      expect(v.scope_type).toBe(text);
      expect(v.inheritance_rule).toBe(texts[(i + 1) % texts.length]);
    }
    expect(gipFacts(s)).toHaveLength(2 + texts.length);
  });

  it("optional inheritance, exception and priority-or-conflict material is carried only as authored: absent stays absent, empty stays empty, order and repeats are kept", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, "binding-min");
    await establishScopeBinding(s, 4, INSTITUTION_COURT, OFFICE_MAGISTRATE, "binding-empty", {
      exception_refs: [],
    });
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_MAGISTRATE, "binding-order", {
      exception_refs: [EXCEPTION_REF_B, EXCEPTION_REF_A, EXCEPTION_REF_B],
      priority_or_conflict_rule_ref: PRIORITY_OR_CONFLICT_RULE_REF_B,
      inheritance_rule: "authored",
    });
    const value = (id: string) => s.campaign.store.getFact(bindingKey(id))!.value as any;
    expect(Object.keys(value("binding-min")).sort()).toEqual(
      [
        "institution_id",
        "office_id",
        "scope_binding_id",
        "scope_ref",
        "scope_type",
        "target_condition",
      ].sort(),
    );
    expect(value("binding-empty").exception_refs).toEqual([]);
    expect(value("binding-empty").priority_or_conflict_rule_ref).toBeUndefined();
    expect(value("binding-empty").inheritance_rule).toBeUndefined();
    expect(value("binding-order").exception_refs).toEqual([
      EXCEPTION_REF_B,
      EXCEPTION_REF_A,
      EXCEPTION_REF_B,
    ]);
    expect(value("binding-order").priority_or_conflict_rule_ref).toBe(
      PRIORITY_OR_CONFLICT_RULE_REF_B,
    );
    // an exception or priority-or-conflict rule reference never becomes a binding or a fact of its own
    expect(gipFacts(s).map((f) => f.key)).toEqual(
      [
        courtKey,
        magistrateKey,
        bindingKey("binding-min"),
        bindingKey("binding-empty"),
        bindingKey("binding-order"),
      ].sort(),
    );
  });
});

describe("no Instrument, validity, applicability, procedure, vote, exercise, reach, awareness or compliance state is created or inferred", () => {
  it("establishment adds exactly the one binding key: no instrument, validity row, applicability result, decision, temporal object, actor, population or foreign state", async () => {
    const s = await withOffice();
    const before = new Set(s.campaign.store.listFacts().map((f) => f.key));
    const headBefore = s.campaign.store.head();
    await establishScopeBinding(s, 3);
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added.map((f) => f.key)).toEqual([bindingKey()]);
    expect(s.campaign.store.head().revision).toBe(headBefore.revision + 1);
    const prefixes = new Set(s.campaign.store.listFacts().map((f) => f.key.split("/")[0]));
    expect([...prefixes].sort()).toEqual(["gip", "pc", "role-registry", "world"]);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/"))).toEqual([]);
    // GIP holds exactly the identity, the office and the binding: no instrument, procedure, relation, path or status key space
    expect(
      gipFacts(s)
        .map((f) =>
          f.key
            .split("/")
            .filter((_, i) => i % 2 === 0 || i === 0)
            .join("/"),
        )
        .every((k) => k.startsWith("gip")),
    ).toBe(true);
    // the stored binding carries the authored fields and no result/validity/exercise field
    const stored = added[0]!.value as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(Object.keys(scopeBinding()).sort());
    for (const k of Object.keys(stored))
      expect(k).not.toMatch(
        /^(instrument|valid|applie|result|vote|exercis|reach|aware|complian|promulg)/,
      );
  });

  it("the parent office and its Institution Identity are byte-for-byte unchanged, and the office's competence_scope is neither parsed nor rewritten", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE, {
      competence_scope: "jurisdiction/place: the whole of Court Street — authored office text",
    });
    const office = structuredClone(s.campaign.store.getFact(magistrateKey)!);
    const identity = structuredClone(s.campaign.store.getFact(courtKey)!);
    await establishScopeBinding(s, 3, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
      scope_type: "jurisdiction/place",
      scope_ref: "scope-court-street",
      target_condition: "a different authored statement than the office competence_scope",
    });
    await establishScopeBinding(s, 4, INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_B, {
      scope_type: "institution",
    });
    expect(s.campaign.store.getFact(magistrateKey)).toEqual(office);
    expect(s.campaign.store.getFact(courtKey)).toEqual(identity);
    expect((s.campaign.store.getFact(magistrateKey)!.value as any).competence_scope).toBe(
      "jurisdiction/place: the whole of Court Street — authored office text",
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("neighbors that look like scopes, instruments or targets (a Population ledger, an institutional KTI model, a world locus) create and receive no GIP binding", async () => {
    const s = await withOffice();
    await seedInstitutionLikeNeighbors(s);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
    await establishScopeBinding(s, 3);
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey, bindingKey()]);
  });

  it("an office alone, or an institution alone, creates no binding: nothing derives a binding from an office's prose, holder, body or competence_scope", async () => {
    const s = await seededGipCampaign(tempDir());
    await establishInstitution(s, 1, INSTITUTION_COURT);
    await establishOffice(s, 2, INSTITUTION_COURT, OFFICE_MAGISTRATE);
    await establishDecisionBodyOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    expect(gipFacts(s).filter((f) => f.key.includes("scope-binding"))).toEqual([]);
  });
});

describe("post-establishment scope mutation and replacement are rejected in this slice", () => {
  it("the adapter exposes no method that moves a binding: the only binding writer is the initial establishment", () => {
    const methods = Object.getOwnPropertyNames(GipAdapter.prototype)
      .filter((m) => m !== "constructor")
      .sort();
    expect(methods.filter((m) => /binding/i.test(m))).toEqual([
      "establishScopeBinding",
      "scopeBinding",
    ]);
    expect(
      methods
        // (the sunset slice's sunset-bearing Instrument methods name an Instrument, not a binding)
        .filter(
          (m) => !/^(establishSunsetInstrument|completeSunsetEnrollment|sunsetEnrollment)$/.test(m),
        )
        .filter((m) =>
          /update|replace|amend|change|set|remove|revoke|resolve|apply|inherit|except|priority|conflict|merge|split|supersede/i.test(
            m,
          ),
        ),
    ).toEqual([]);
  });

  it("every raw expected-version write to an established binding — new scope, condition, rule, exception, priority-or-conflict rule or branch — is an unsupported amendment; an occupied create is a version conflict", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3);
    const fact = structuredClone(s.campaign.store.getFact(bindingKey())!);
    const office = s.campaign.store.getFact(magistrateKey)!;
    let n = 200;
    for (const [expected_version, value, code] of [
      [
        1,
        scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
          scope_ref: SCOPE_REF_B,
        }),
        "AMENDMENT_NOT_SUPPORTED",
      ],
      [
        1,
        scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, SCOPE_BINDING_A, {
          target_condition: "changed",
        }),
        "AMENDMENT_NOT_SUPPORTED",
      ],
      [1, fullScopeBinding(), "AMENDMENT_NOT_SUPPORTED"], // adding inheritance / exceptions / a priority-or-conflict rule
      [1, scopeBinding(), "AMENDMENT_NOT_SUPPORTED"], // even an unchanged re-statement
      [2, fullScopeBinding(), "VERSION_CONFLICT"],
      [0, fullScopeBinding(), "VERSION_CONFLICT"],
      [0, scopeBinding(), "VERSION_CONFLICT"],
    ] as const) {
      n++;
      expect(
        await codeOf(
          s.campaign.store.commit(rawBinding(n, bindingKey(), value, expected_version, office)),
        ),
        `${expected_version} ${JSON.stringify(value)}`,
      ).toBe(code);
    }
    expect(s.campaign.store.getFact(bindingKey())).toEqual(fact);
  });

  it("no replacement beneath a different identity either: re-pointing a binding at another office or id is a new binding, never an update, and the old one stays", async () => {
    const s = await withOffice();
    await establishOffice(s, 3, INSTITUTION_COURT, OFFICE_TREASURER);
    await establishScopeBinding(s, 4);
    const fact = structuredClone(s.campaign.store.getFact(bindingKey())!);
    await establishScopeBinding(s, 5, INSTITUTION_COURT, OFFICE_TREASURER, SCOPE_BINDING_A);
    expect(s.campaign.store.getFact(bindingKey())).toEqual(fact);
    expect(s.campaign.store.getFact(bindingKey(SCOPE_BINDING_A, OFFICE_TREASURER))!.version).toBe(
      1,
    );
  });

  it("establishing a binding does not unlock any office transition: a raw write to the parent office is still an unsupported amendment", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3);
    const identity = s.campaign.store.getFact(courtKey)!;
    const group = rawBinding(300, magistrateKey, officeAuthorityLocus(), 1, identity, {
      rule: factKind("gip_office_authority_locus").rule,
      reads: [{ key: courtKey, version: identity.version }],
      depends_on: [identity.provenance.group_id],
    });
    expect(await codeOf(s.campaign.store.commit(group))).toBe("AMENDMENT_NOT_SUPPORTED");
  });
});

describe("the governing-rule citation of a binding is its own; an office citation is never stamped on a binding", () => {
  it("a newly committed binding carries the Scope Binding citation, which is distinct from the office's and the identity's", async () => {
    const s = await withOffice();
    await establishScopeBinding(s, 3);
    const fact = s.campaign.store.getFact(bindingKey())!;
    expect(fact.provenance.rule).toEqual(GIP_SCOPE_BINDING_RULE);
    expect(fact.provenance.rule).not.toEqual(
      s.campaign.store.getFact(magistrateKey)!.provenance.rule,
    );
    expect(fact.provenance.rule).not.toEqual(s.campaign.store.getFact(courtKey)!.provenance.rule);
    expect(GIP_SCOPE_BINDING_RULE.clause).toContain("§5 Scope / Applicability Binding");
  });

  it("a write carrying the office's, the identity's or any other citation is refused by admission", async () => {
    const s = await withOffice();
    const office = s.campaign.store.getFact(magistrateKey)!;
    const state = stateOf(s);
    for (const rule of [
      s.campaign.store.getFact(magistrateKey)!.provenance.rule,
      s.campaign.store.getFact(courtKey)!.provenance.rule,
      { ...GIP_SCOPE_BINDING_RULE, clause: "drifted" },
      { ...GIP_SCOPE_BINDING_RULE, native_pin: "2026-01-01T00:00:00.000Z" },
    ])
      expect(
        gipGroupCheck(rawBinding(400, bindingKey(), scopeBinding(), 0, office, { rule }), state)
          ?.code,
      ).toBe("REFERENCE_INVALID");
  });
});

describe("the engaged establish and read paths are directly keyed and never list or scan", () => {
  it("with many unrelated institutions, offices and bindings present, establishing and reading one binding touches only its parent office and its own key", async () => {
    const s = await seededGipCampaign(tempDir());
    await seedInstitutionLikeNeighbors(s);
    let n = 0;
    for (const inst of ["inst-a", "inst-b", "inst-c", INSTITUTION_COURT]) {
      await establishInstitution(s, ++n, inst);
      for (const office of ["office-1", "office-2", OFFICE_MAGISTRATE]) {
        await establishOffice(s, ++n, inst, office);
        await establishScopeBinding(s, ++n, inst, office, "scope-binding-x");
      }
    }
    const spy = spyStore(s.campaign.store);
    const gip = new GipAdapter(spy.store);
    await must(
      gip.establishScopeBinding({
        ...gipPublication(n + 1),
        scope_binding: scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, "scope-binding-new"),
      }),
    );
    expect(spy.getFacts).toEqual([magistrateKey]);
    expect(spy.listCalls()).toBe(0);
    expect(spy.commits).toHaveLength(1);
    expect(spy.commits[0]!.writes.map((w) => w.key)).toEqual([bindingKey("scope-binding-new")]);
    spy.getFacts.length = 0;
    expect(
      gip.scopeBinding(INSTITUTION_COURT, OFFICE_MAGISTRATE, "scope-binding-new"),
    ).toBeDefined();
    expect(gip.scopeBinding("inst-a", "office-1", "scope-binding-x")).toBeDefined();
    expect(spy.getFacts).toEqual([
      bindingKey("scope-binding-new"),
      bindingKey("scope-binding-x", "office-1", "inst-a"),
    ]);
    expect(spy.listCalls()).toBe(0);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("owner exclusivity: only the GIP owner, through the GIP facet, writes the binding key space", () => {
  it("a raw commit by any foreign owner, facet or authority to a binding key is refused, and the GIP owner is refused a foreign key", async () => {
    const s = await withOffice();
    const office = s.campaign.store.getFact(magistrateKey)!;
    let n = 500;
    for (const over of [
      { owner: "world_state", facet: "world_locus" },
      { owner: "kti", facet: "kti_development" },
      { owner: "population", facet: "population_state" },
      { owner: "gip", facet: "world_locus" },
      { authority: { ...CANON_WRITE_AUTHORITY, source: "host" } as never },
    ] as const) {
      n++;
      const group = rawBinding(n, bindingKey(), scopeBinding(), 0, office, over as never);
      if ("owner" in over)
        group.writes = [{ ...group.writes[0]!, owner: over.owner, facet: (over as any).facet }];
      expect(await codeOf(s.campaign.store.commit(group)), JSON.stringify(over)).not.toBe("OK");
    }
    expect(gipFacts(s).map((f) => f.key)).toEqual([courtKey, magistrateKey]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------

function stateOf(s: Awaited<ReturnType<typeof withOffice>>): CampaignState {
  return {
    facts: new Map(s.campaign.store.listFacts().map((f) => [f.key, f])),
  } as unknown as CampaignState;
}

/** A raw binding group as an unauthorized caller might build it: no registry, no adapter. `parent` is the fact it pins. */
function rawBinding(
  n: number,
  key: string,
  value: unknown,
  expected_version: number,
  parent: { key: string; version: number; provenance: { group_id: string } },
  over: Partial<CommitGroup> = {},
): CommitGroup {
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "gip",
    facet: "gip_institution_identity",
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: GIP_SCOPE_BINDING_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [{ key: parent.key, version: parent.version }],
    depends_on: [parent.provenance.group_id],
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
