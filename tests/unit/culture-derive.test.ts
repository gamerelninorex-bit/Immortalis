// Unit evidence for the pure Culture derivations (forty-sixth slice): the update identity, the canonical binding of a referent
// and scope, the input read basis, the single statement of the shared meaning/norm, the registration rule's builders and the
// one owner operation failing closed. Register lineage: IA-02, IA-03, IA-04 (partial); RC-02, RC-03, RC-04; IM-09.
import { describe, expect, it } from "vitest";
import {
  COMMUNICATIVE_CONVENTION_CLOSE,
  OWNER_CULTURE,
  cultureConventionStage,
  cultureUpdateContextKey,
  type CultureUpdateContext,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  StageUnresolvedError,
  canonicalBindingViolation,
  cultureAccessClassViolation,
  cultureConventionCloseProvider,
  cultureConventionDeclaration,
  cultureUpdateId,
  deriveSharedMeaning,
  inputBasisViolation,
} from "@immortalis/engine";
import {
  CULTURE_CONTEXT_MARKET,
  CULTURE_CONTEXT_OTHER,
  MANIFESTATION_A,
  MANIFESTATION_B,
  SYNTH_SOCIAL_EVIDENCE_OWNER,
  evidenceInput,
  evidenceReading,
  socialEvidenceKey,
} from "@immortalis/testkit";
import { INSTITUTION_KEY, REFERENT_KEY, SCOPE_KEY, primaryContext } from "../support/culture.ts";

const ctx = (c: CultureUpdateContext = primaryContext()) => ({
  key: cultureUpdateContextKey(c.update_id),
  owner: OWNER_CULTURE,
  version: 1,
  value: c,
});
const ev = (
  id: string,
  value: unknown = evidenceReading(REFERENT_KEY, SCOPE_KEY),
  version = 1,
) => ({
  key: socialEvidenceKey(id),
  owner: SYNTH_SOCIAL_EVIDENCE_OWNER,
  version,
  value,
});
const derive = (c: CultureUpdateContext, evidence: ReturnType<typeof ev>[]) =>
  deriveSharedMeaning({ context: ctx(c), evidence });

describe("the update identity", () => {
  it("is exactly referent × scope × context, deterministic, and distinct per dimension", () => {
    const a = cultureUpdateId(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET);
    expect(a).toBe(cultureUpdateId(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET));
    expect(a).toMatch(/^culture-update-[0-9a-f]{64}$/);
    expect(
      new Set([
        a,
        cultureUpdateId(SCOPE_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET),
        cultureUpdateId(REFERENT_KEY, REFERENT_KEY, CULTURE_CONTEXT_MARKET),
        cultureUpdateId(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER),
        cultureUpdateId(SCOPE_KEY, REFERENT_KEY, CULTURE_CONTEXT_MARKET),
      ]).size,
    ).toBe(5);
  });
});

describe("binding a referent and a scope to existing canonical authority", () => {
  const fact = (key: string, over: Partial<OwnerFact> = {}): OwnerFact =>
    ({
      key,
      owner: "world_state",
      facet: "world_locus",
      version: 1,
      value: {
        locus_id: "l",
        world: { fact_key: "world/w/profile", entity_id: "w" },
        designation: "d",
        constraints: [],
      },
      unit: null,
      basis: "b",
      secrecy: "s",
      provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} as never },
      ...over,
    }) as OwnerFact;
  const facts = (...fs: OwnerFact[]) => new Map(fs.map((f) => [f.key, f]));
  const ref = (key: string, version = 1) => ({ fact_key: key, version });

  it("accepts a committed World-State locus at its current version, and a historical pin at or behind it", () => {
    const f = fact("world/w/locus/l");
    expect(canonicalBindingViolation(facts(f), ref(f.key), "SEAL")).toBeNull();
    const advanced = fact("world/w/locus/l", { version: 3 });
    expect(canonicalBindingViolation(facts(advanced), ref(f.key), "SEAL")).not.toBeNull();
    expect(canonicalBindingViolation(facts(advanced), ref(f.key, 1), "HISTORY")).toBeNull();
    expect(canonicalBindingViolation(facts(f), ref(f.key, 2), "HISTORY")).not.toBeNull();
  });

  it("refuses an absent fact, an unbindable kind, a foreign owner or facet and a value that violates its own contract", () => {
    const f = fact("world/w/locus/l");
    expect(canonicalBindingViolation(facts(), ref(f.key), "SEAL")).toMatch(/not a committed/);
    for (const key of [
      "population/l/cohort/c",
      "population/l/ledger",
      "kti/object/o",
      "temporal/state",
      "nothing",
      "culture/meaning/u",
    ])
      expect(canonicalBindingViolation(facts(fact(key)), ref(key), "SEAL"), key).toMatch(
        /cannot be bound|existing canonical authority/,
      );
    expect(
      canonicalBindingViolation(facts(fact(f.key, { owner: "kti" })), ref(f.key), "SEAL"),
    ).toMatch(/own registered/);
    expect(
      canonicalBindingViolation(facts(fact(f.key, { facet: "x" })), ref(f.key), "SEAL"),
    ).toMatch(/own registered/);
    expect(
      canonicalBindingViolation(
        facts(fact(f.key, { value: { locus_id: "l" } })),
        ref(f.key),
        "SEAL",
      ),
    ).toMatch(/own canonical contract/);
  });

  it("names the two bindable kinds the source lists as referents: a place and an institution", () => {
    expect(INSTITUTION_KEY).toMatch(/^gip\/institution\/.+\/identity$/);
    expect(
      canonicalBindingViolation(
        facts(
          fact(INSTITUTION_KEY, {
            owner: "gip",
            facet: "gip_institution_identity",
            value: { institution_id: "i", identity_label: "l", continuity_status: "continuing" },
          }),
        ),
        ref(INSTITUTION_KEY),
        "SEAL",
      ),
    ).toBeNull();
  });
});

describe("the input read basis", () => {
  it("accepts a non-Culture owner's fact read AS-OF-NOW, and refuses the Culture owner, its key space and an unregistered close", () => {
    expect(inputBasisViolation(evidenceInput("ev1"))).toBeNull();
    expect(inputBasisViolation(evidenceInput("ev1", { owner: "culture" }))).toMatch(
      /never its own evidence/,
    );
    expect(inputBasisViolation(evidenceInput("ev1", { fact_key: "culture/meaning/u" }))).toMatch(
      /never its own evidence/,
    );
    expect(
      inputBasisViolation(
        evidenceInput("ev1", {
          read: {
            basis: "AS-OF-DECLARED-CLOSE",
            close_basis: { name: "n", producer: { owner: "o", operation: "p" } },
          },
        }),
      ),
    ).toMatch(/CONDITIONAL/);
  });
  it("the access class is exactly the owner's", () => {
    expect(cultureAccessClassViolation("culture.engine-sealed")).toBeNull();
    for (const s of [
      "",
      "epistemic.actor-accessible",
      "culture.actor-accessible",
      "kti.engine-sealed",
    ])
      expect(cultureAccessClassViolation(s)).not.toBeNull();
  });
});

describe("the shared meaning/norm is exactly what the context and the evidence determine", () => {
  it("derives the one fact and nothing else from one reading", () => {
    const r = derive(primaryContext(), [ev("ev1")]);
    expect(r.ok && r.value).toEqual({
      update_id: primaryContext().update_id,
      status: "ESTABLISHED",
      referent: { fact_key: REFERENT_KEY, version: 1 },
      scope: { fact_key: SCOPE_KEY, version: 1 },
      context: CULTURE_CONTEXT_MARKET,
      manifestation: MANIFESTATION_A,
      establishment: {
        update: { fact_key: cultureUpdateContextKey(primaryContext().update_id), version: 1 },
        evidence: primaryContext().inputs,
      },
      close: {
        name: COMMUNICATIVE_CONVENTION_CLOSE,
        stage: cultureConventionStage(primaryContext().update_id),
      },
    });
  });

  it("several agreeing readings give the same fact; the manifestation is read from the evidence, never from the context", () => {
    const c = primaryContext([evidenceInput("ev1"), evidenceInput("ev2")]);
    const r = derive(c, [ev("ev1"), ev("ev2")]);
    expect(r.ok && r.value.manifestation).toBe(MANIFESTATION_A);
    const other = derive(c, [
      ev("ev1", evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET, MANIFESTATION_B)),
      ev("ev2", evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET, MANIFESTATION_B)),
    ]);
    expect(other.ok && other.value.manifestation).toBe(MANIFESTATION_B);
  });

  it("fails closed, with the specific code, on each way the evidence can fail to establish it", () => {
    const code = (r: ReturnType<typeof derive>) => (r.ok ? "OK" : r.error.code);
    const one = primaryContext();
    expect(code(derive(one, [ev("ev1", { kind: "CONTACT" })]))).toBe("EVIDENCE_NOT_ESTABLISHING");
    expect(code(derive(one, [ev("ev1", evidenceReading(REFERENT_KEY, REFERENT_KEY))]))).toBe(
      "EVIDENCE_NOT_ESTABLISHING",
    );
    expect(
      code(
        derive(one, [ev("ev1", evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_OTHER))]),
      ),
    ).toBe("EVIDENCE_NOT_ESTABLISHING");
    expect(code(derive(one, [ev("ev1", undefined, 2)]))).toBe("EVIDENCE_INVALID");
    expect(code(derive(one, []))).toBe("EVIDENCE_INVALID");
    expect(code(derive(one, [ev("ev9")]))).toBe("EVIDENCE_INVALID");
    expect(
      code(
        derive(primaryContext([evidenceInput("ev1"), evidenceInput("ev1")]), [
          ev("ev1"),
          ev("ev1"),
        ]),
      ),
    ).toBe("CONTEXT_INVALID");
    expect(
      code(
        derive(primaryContext([evidenceInput("ev1")], { update_id: "culture-update-forged" }), [
          ev("ev1"),
        ]),
      ),
    ).toBe("CONTEXT_INVALID");
    const c2 = primaryContext([evidenceInput("ev1"), evidenceInput("ev2")]);
    expect(
      code(
        derive(c2, [
          ev("ev1"),
          ev(
            "ev2",
            evidenceReading(REFERENT_KEY, SCOPE_KEY, CULTURE_CONTEXT_MARKET, MANIFESTATION_B),
          ),
        ]),
      ),
    ).toBe("EVIDENCE_DISAGREES");
    const closeInput = primaryContext([
      evidenceInput("ev1", {
        read: {
          basis: "AS-OF-DECLARED-CLOSE",
          close_basis: { name: "n", producer: { owner: "o", operation: "p" } },
        },
      }),
    ]);
    expect(code(derive(closeInput, [ev("ev1")]))).toBe("EVIDENCE_BASIS_UNREGISTERED");
    expect(
      deriveSharedMeaning({ context: { ...ctx(), owner: "kti" }, evidence: [ev("ev1")] }).ok,
    ).toBe(false);
    expect(
      deriveSharedMeaning({
        context: { ...ctx(), key: "culture/update/x/context" },
        evidence: [ev("ev1")],
      }).ok,
    ).toBe(false);
  });
});

describe("the registration builders", () => {
  it("declare the stage from the sealed context alone: the context first, then each pinned input, all AS-OF-NOW, producing exactly the meaning slot", () => {
    const c = primaryContext([evidenceInput("ev1"), evidenceInput("ev2")]);
    const d = cultureConventionDeclaration(c)!;
    expect(d.stage).toEqual(cultureConventionStage(c.update_id));
    expect(d.reads.map((r) => [r.mode, r.source.owner, r.source.fact_key])).toEqual([
      ["AS-OF-NOW", "culture", cultureUpdateContextKey(c.update_id)],
      ["AS-OF-NOW", SYNTH_SOCIAL_EVIDENCE_OWNER, socialEvidenceKey("ev1")],
      ["AS-OF-NOW", SYNTH_SOCIAL_EVIDENCE_OWNER, socialEvidenceKey("ev2")],
    ]);
    expect(d.produces).toEqual([`culture/meaning/${c.update_id}`]);
    expect(d.declares_close).toEqual({ name: COMMUNICATIVE_CONVENTION_CLOSE });
  });
});

describe("the one owner operation fails closed with StageUnresolvedError and publishes nothing", () => {
  const input = (over: Record<string, unknown> = {}) => {
    const c = primaryContext();
    const cf = ctx(c);
    const fact = (f: { key: string; owner: string; version: number; value: unknown }) =>
      ({
        key: f.key,
        owner: f.owner,
        facet: "f",
        version: f.version,
        value: f.value,
        unit: null,
        basis: "culture-fixture-basis",
        secrecy: "s",
        provenance: { group_id: "g", intent_id: "i", cause: "c", rule: {} as never },
      }) as unknown as OwnerFact;
    return {
      stage: cultureConventionStage(c.update_id),
      produces: [`culture/meaning/${c.update_id}`],
      span: { from: { unit: "u", value: 1 }, to: { unit: "u", value: 2 }, elapsed: 1 },
      reads: [cf, ev("ev1")].map((f) => ({ read: {} as never, fact: fact(f) })),
      prior: new Map<string, OwnerFact>(),
      ...over,
    };
  };

  it("writes exactly the one derived fact, stamped with the owner's access class and the context's authored basis label", () => {
    const writes = cultureConventionCloseProvider.compute(input());
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      unit: null,
      basis: "culture-fixture-basis",
      secrecy: "culture.engine-sealed",
    });
  });

  it("is unresolved on a missing or invalid source, a foreign or extra slot, a prior fact and a non-establishing reading", () => {
    const base = input();
    const cases: Record<string, unknown> = {
      "no inputs": { ...base, reads: base.reads.slice(0, 1) },
      "invalid context": {
        ...base,
        reads: [
          { ...base.reads[0]!, fact: { ...base.reads[0]!.fact, value: { x: 1 } } },
          base.reads[1],
        ],
      },
      "foreign slot": { ...base, produces: ["culture/meaning/another"] },
      "two slots": { ...base, produces: [...base.produces, "culture/meaning/another"] },
      "already committed": { ...base, prior: new Map([[base.produces[0]!, base.reads[0]!.fact]]) },
      "contact reading": {
        ...base,
        reads: [
          base.reads[0],
          { ...base.reads[1]!, fact: { ...base.reads[1]!.fact, value: { kind: "CONTACT" } } },
        ],
      },
    };
    for (const [name, i] of Object.entries(cases))
      expect(() => cultureConventionCloseProvider.compute(i as never), name).toThrow(
        StageUnresolvedError,
      );
  });
});
