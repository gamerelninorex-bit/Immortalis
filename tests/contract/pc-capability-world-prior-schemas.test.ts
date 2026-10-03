// Contract evidence for the existing-actor world-prior establishment of a capability that was still UNRESOLVED when the actor
// was handed over (thirty-third slice). The PC capability basis gains TWO distinct establishment methods —
// EXISTING_ACTOR_CAUSALLY_DETERMINED and EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED — each exact provenance references (the
// handover, the pinned causes, and for the randomized one a pointer to the committed Causal Draw result) and nothing else;
// ACCEPTED_GENERATION_HISTORY and EXISTING_ACTOR_CARRY_FORWARD are unchanged; the persisted PC capability record, its marker
// and its PC Capability Close are untouched. Every schema is strict: no marker, prior, weight, seed, grade or number rides in
// an establishment. Register lineage: IA-02 (partial), IA-14 (partial); RC-02; CD1 CDK-01.
/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary values */
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  PcAcceptedGenerationHistoryEstablishmentSchema,
  PcCapabilityBasisHistoricalSchema,
  PcCapabilityBasisSchema,
  PcCapabilityEstablishmentSchema,
  PcCapabilitySchema,
  PcExistingActorBoundedPriorRandomizedEstablishmentSchema,
  PcExistingActorCarryForwardEstablishmentSchema,
  PcExistingActorCausallyDeterminedEstablishmentSchema,
  PcExistingActorEstablishmentInputSchema,
  PcExistingActorRandomizedEstablishmentInputSchema,
  actorCapabilityKey,
  causalDrawId,
  namedActorCapabilityDrawKey,
  pcCapabilityBasisKey,
  pcCapabilityDrawKey,
} from "@immortalis/contracts";
import { cdDigest, pcCapabilityDrawDigest } from "@immortalis/engine";
import { pcCapabilityBasis } from "@immortalis/testkit";

const A = "actor-smith";
const C = "capability-swordsmanship";
const cause = (n: number, over: Record<string, unknown> = {}): any => ({
  aspect: n === 0 ? "BIOGRAPHY_HISTORY" : "OCCUPATION_ROLE",
  owner: "SYNTHETIC-ACTOR-HISTORY",
  fact_key: `history/${n}`,
  version: 1,
  ...over,
});
const handover = { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 1 };
const determined = (over: Record<string, unknown> = {}): any => ({
  method: "EXISTING_ACTOR_CAUSALLY_DETERMINED",
  handover,
  causes: [cause(0), cause(1)],
  ...over,
});
const randomized = (over: Record<string, unknown> = {}): any => ({
  method: "EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED",
  handover,
  causes: [cause(0), cause(1)],
  draw: {
    draw_id: causalDrawId(pcCapabilityDrawDigest(A, C)),
    result: { fact_key: "causal-draw/x/result", version: 1 },
  },
  ...over,
});
const basis = (establishment: unknown, over: Record<string, unknown> = {}): any => ({
  pc_id: A,
  capability_id: C,
  marker: "B",
  establishment,
  ...over,
});

describe("the world-prior establishments are exact provenance references and nothing else", () => {
  it("parse as the third and fourth methods of the one establishment union, beside the two unchanged predecessors", () => {
    for (const e of [determined(), randomized()])
      expect(PcCapabilityEstablishmentSchema.safeParse(e).success).toBe(true);
    expect(
      PcExistingActorCausallyDeterminedEstablishmentSchema.safeParse(determined()).success,
    ).toBe(true);
    expect(
      PcExistingActorBoundedPriorRandomizedEstablishmentSchema.safeParse(randomized()).success,
    ).toBe(true);
    const fresh = pcCapabilityBasis().establishment;
    expect(PcCapabilityEstablishmentSchema.safeParse(fresh).success).toBe(true);
    expect(PcAcceptedGenerationHistoryEstablishmentSchema.safeParse(fresh).success).toBe(true);
    const carried = {
      method: "EXISTING_ACTOR_CARRY_FORWARD",
      handover,
      source: { fact_key: actorCapabilityKey(A, C), version: 1 },
    };
    expect(PcCapabilityEstablishmentSchema.safeParse(carried).success).toBe(true);
    expect(PcExistingActorCarryForwardEstablishmentSchema.safeParse(carried).success).toBe(true);
    // the four never share a shape: no method parses as another
    const all = [fresh, carried, determined(), randomized()];
    const schemas = [
      PcAcceptedGenerationHistoryEstablishmentSchema,
      PcExistingActorCarryForwardEstablishmentSchema,
      PcExistingActorCausallyDeterminedEstablishmentSchema,
      PcExistingActorBoundedPriorRandomizedEstablishmentSchema,
    ];
    for (const [i, schema] of schemas.entries())
      for (const [j, e] of all.entries())
        expect(schema.safeParse(e).success, `${i}/${j}`).toBe(i === j);
  });

  it("are closed records: no marker, claim, contract pointer, source, prior, weight, grade, number or free text", () => {
    for (const extra of [
      { marker: "S" },
      { grade: "S" },
      { claims: [{ section: "identity_agency", index: 0 }] },
      { contract: { fact_key: "pc/p/existence-contract", version: 1 } },
      { source: { fact_key: actorCapabilityKey(A, C), version: 1 } },
      { prior: [{ marker: "C", weight: "1" }] },
      { weight: "1" },
      { seed: "00" },
      { probability: 0.5 },
      { statement: "a convenient past" },
    ]) {
      expect(PcCapabilityEstablishmentSchema.safeParse(determined(extra)).success).toBe(false);
      expect(PcCapabilityEstablishmentSchema.safeParse(randomized(extra)).success).toBe(false);
    }
  });

  it("cite the handover binding at a real version, at least one cause (each once, with a lawful aspect), and for the draw method a draw pointer", () => {
    for (const bad of [
      { handover: { fact_key: "role-registry/binding/other", version: 1 } },
      { handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 0 } },
      { handover: undefined },
      { causes: [] },
      { causes: [cause(0), cause(0)] },
      { causes: [cause(0, { aspect: "FAME" })] },
      { causes: [cause(0, { version: 0 })] },
    ]) {
      expect(PcCapabilityEstablishmentSchema.safeParse(determined(bad)).success).toBe(false);
      expect(PcCapabilityEstablishmentSchema.safeParse(randomized(bad)).success).toBe(false);
    }
    expect(PcCapabilityEstablishmentSchema.safeParse(randomized({ draw: undefined })).success).toBe(
      false,
    );
    expect(
      PcCapabilityEstablishmentSchema.safeParse(
        randomized({ draw: { draw_id: "not-a-draw", result: { fact_key: "k", version: 1 } } }),
      ).success,
    ).toBe(false);
    expect(
      PcCapabilityEstablishmentSchema.safeParse(determined({ draw: randomized().draw })).success,
    ).toBe(false);
  });

  it("the basis keeps the marker the existing record always had (every marker form, null included), and no other new field", () => {
    for (const marker of ["C", "B", "A", "S", { ex: "a descriptor" }, null]) {
      expect(PcCapabilityBasisSchema.safeParse(basis(determined(), { marker })).success).toBe(true);
      expect(PcCapabilityBasisSchema.safeParse(basis(randomized(), { marker })).success).toBe(true);
    }
    for (const bad of [
      { marker: "S+" },
      { marker: 3 },
      { materiality: "ROLE_DEFINING" },
      { level: 1 },
    ])
      expect(PcCapabilityBasisSchema.safeParse(basis(determined(), bad)).success).toBe(false);
    expect(Object.keys(PcCapabilityBasisSchema.shape).sort()).toEqual(
      ["capability_id", "establishment", "marker", "pc_id"].sort(),
    );
  });

  it("the historical basis schema (the one class the superseded citation covers) admits only the two predecessor establishments", () => {
    const fresh = pcCapabilityBasis();
    const carried = basis({
      method: "EXISTING_ACTOR_CARRY_FORWARD",
      handover,
      source: { fact_key: actorCapabilityKey(A, C), version: 1 },
    });
    expect(PcCapabilityBasisHistoricalSchema.safeParse(fresh).success).toBe(true);
    expect(PcCapabilityBasisHistoricalSchema.safeParse(carried).success).toBe(true);
    expect(PcCapabilityBasisHistoricalSchema.safeParse(basis(determined())).success).toBe(false);
    expect(PcCapabilityBasisHistoricalSchema.safeParse(basis(randomized())).success).toBe(false);
  });

  it("the persisted PC capability record is unchanged: no draw, cause, handover or establishment field exists on it", () => {
    expect(Object.keys(PcCapabilitySchema.shape).sort()).toEqual(
      ["basis", "capability_id", "close", "marker", "pc_id"].sort(),
    );
  });
});

describe("the owner inputs: identity and causes, plus the authored marker (causes suffice) or the bounded prior (uncertainty remains)", () => {
  const det = (over: Record<string, unknown> = {}) => ({
    pc_id: A,
    capability_id: C,
    causes: [cause(0)],
    marker: "A",
    ...over,
  });
  const rnd = (over: Record<string, unknown> = {}) => ({
    pc_id: A,
    capability_id: C,
    causes: [cause(0)],
    prior: [
      { marker: "C", weight: "3" },
      { marker: "B", weight: "1" },
    ],
    ...over,
  });

  it("accepts exactly those, and nothing that would resolve, version, regrade or reroll", () => {
    expect(PcExistingActorEstablishmentInputSchema.safeParse(det()).success).toBe(true);
    expect(PcExistingActorEstablishmentInputSchema.safeParse(det({ marker: null })).success).toBe(
      true,
    );
    expect(PcExistingActorRandomizedEstablishmentInputSchema.safeParse(rnd()).success).toBe(true);
    for (const extra of [
      { handover },
      { draw: {} },
      { source: {} },
      { materiality: "ROLE_DEFINING" },
      { grade: "S" },
      { seed: "00" },
    ]) {
      expect(PcExistingActorEstablishmentInputSchema.safeParse(det(extra)).success).toBe(false);
      expect(PcExistingActorRandomizedEstablishmentInputSchema.safeParse(rnd(extra)).success).toBe(
        false,
      );
    }
    expect(
      PcExistingActorRandomizedEstablishmentInputSchema.safeParse(rnd({ marker: "S" })).success,
    ).toBe(false);
    expect(PcExistingActorEstablishmentInputSchema.safeParse(det({ prior: [] })).success).toBe(
      false,
    );
    expect(
      PcExistingActorEstablishmentInputSchema.safeParse({ ...det(), marker: undefined }).success,
    ).toBe(false);
  });

  it("a prior weight is an owner-authored positive integer string: zero, signs, decimals and numbers are refused, and an empty or singleton prior is left to the draw gate", () => {
    for (const weight of ["0", "-1", "1.5", "1e3", "", 1, "01"])
      expect(
        PcExistingActorRandomizedEstablishmentInputSchema.safeParse(
          rnd({
            prior: [
              { marker: "C", weight },
              { marker: "B", weight: "1" },
            ],
          }),
        ).success,
        String(weight),
      ).toBe(false);
    // refused by the Causal Draw gate with its own code, never filled in or defaulted here
    expect(
      PcExistingActorRandomizedEstablishmentInputSchema.safeParse(rnd({ prior: [] })).success,
    ).toBe(true);
    expect(
      PcExistingActorRandomizedEstablishmentInputSchema.safeParse(
        rnd({ prior: [{ marker: "C", weight: "1" }] }),
      ).success,
    ).toBe(true);
  });
});

describe("the stable PC draw identity (CDK-01) is rooted in the PC capability-basis slot", () => {
  it("has exactly the four identity dimensions, with the unresolved basis slot as the prospective result", () => {
    expect(pcCapabilityDrawKey(A, C)).toEqual({
      causal_process_id: `pc-capability/${A}/${C}`,
      opportunity_id: "existing-actor-capability-establishment",
      owner_operation: { owner: "pc_existence", operation: "pc-establish-capability-basis" },
      prospective_result_id: pcCapabilityBasisKey(A, C),
    });
    expect(Object.keys(pcCapabilityDrawKey(A, C)).sort()).toEqual(
      ["causal_process_id", "opportunity_id", "owner_operation", "prospective_result_id"].sort(),
    );
  });

  it("is a function of the identity and capability alone, distinct per slot, and never the predecessor Named-Actor draw's", () => {
    expect(pcCapabilityDrawKey(A, C)).toEqual(pcCapabilityDrawKey(A, C));
    expect(cdDigest(pcCapabilityDrawKey(A, C))).not.toBe(
      cdDigest(pcCapabilityDrawKey(A, "capability-other")),
    );
    expect(cdDigest(pcCapabilityDrawKey(A, C))).not.toBe(
      cdDigest(pcCapabilityDrawKey("actor-other", C)),
    );
    // the predecessor's draw (a different process, owner, operation and slot) is a different draw entirely
    expect(cdDigest(pcCapabilityDrawKey(A, C))).not.toBe(
      cdDigest(namedActorCapabilityDrawKey(A, C)),
    );
    expect(pcCapabilityDrawDigest(A, C)).toBe(cdDigest(pcCapabilityDrawKey(A, C)));
  });
});
