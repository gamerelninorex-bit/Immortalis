// Contract evidence for the existing-actor capability carry-forward establishment. The PC capability basis gains ONE second,
// distinct establishment method — EXISTING_ACTOR_CARRY_FORWARD — whose record is exact provenance references and nothing
// else; the fresh-PC ACCEPTED_GENERATION_HISTORY establishment is unchanged; the persisted PC capability record, its marker
// and its PC Capability Close are untouched. Every schema is strict: nothing that would resolve, regrade or recalibrate is
// representable. Register lineage: IA-02 (partial), IA-14 (partial); RC-02.
/* eslint-disable @typescript-eslint/no-explicit-any -- tests build arbitrary values */
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  PC_CAPABILITY_CLOSE,
  PcAcceptedGenerationHistoryEstablishmentSchema,
  PcCapabilityBasisSchema,
  PcCapabilityCarryForwardInputSchema,
  PcCapabilityEstablishmentSchema,
  PcCapabilitySchema,
  PcExistingActorCarryForwardEstablishmentSchema,
  actorCapabilityKey,
  pcCapabilityStage,
  pcExistenceContractKey,
} from "@immortalis/contracts";
import { pcCapabilityBasis } from "@immortalis/testkit";

const carry = (over: Record<string, unknown> = {}): any => ({
  method: "EXISTING_ACTOR_CARRY_FORWARD",
  handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 1 },
  source: { fact_key: actorCapabilityKey("actor-smith", "capability-metalworking"), version: 1 },
  ...over,
});
const basis = (over: Record<string, unknown> = {}): any => ({
  pc_id: "actor-smith",
  capability_id: "capability-metalworking",
  marker: "C",
  establishment: carry(),
  ...over,
});

describe("the carry-forward establishment is exact provenance references and nothing else", () => {
  it("parses as the second method of the one establishment union, beside the unchanged ACCEPTED_GENERATION_HISTORY", () => {
    expect(PcCapabilityEstablishmentSchema.safeParse(carry()).success).toBe(true);
    expect(PcExistingActorCarryForwardEstablishmentSchema.safeParse(carry()).success).toBe(true);
    const fresh = pcCapabilityBasis().establishment;
    expect(fresh.method).toBe("ACCEPTED_GENERATION_HISTORY");
    expect(PcCapabilityEstablishmentSchema.safeParse(fresh).success).toBe(true);
    expect(PcAcceptedGenerationHistoryEstablishmentSchema.safeParse(fresh).success).toBe(true);
    // the two never share a shape: neither parses as the other
    expect(PcAcceptedGenerationHistoryEstablishmentSchema.safeParse(carry()).success).toBe(false);
    expect(PcExistingActorCarryForwardEstablishmentSchema.safeParse(fresh).success).toBe(false);
    // the fresh-PC record is byte-identical in what it still rejects: a generation-history record names no handover or source
    expect(
      PcCapabilityEstablishmentSchema.safeParse({ ...fresh, handover: carry().handover }).success,
    ).toBe(false);
  });

  it("is a closed record: no marker, claim, contract pointer, draw, cause, prior, grade, weight, number or free text", () => {
    for (const extra of [
      { marker: "S" },
      { grade: "S" },
      { claims: [{ section: "identity_agency", index: 0 }] },
      { contract: { fact_key: pcExistenceContractKey("actor-smith"), version: 1 } },
      { draw: { draw_id: "d" } },
      { causes: [] },
      { prior: [] },
      { weight: "1" },
      { level: 3 },
      { note: "x" },
    ])
      expect(PcCapabilityEstablishmentSchema.safeParse(carry(extra)).success).toBe(false);
    expect(
      PcCapabilityEstablishmentSchema.safeParse({ method: "EXISTING_ACTOR_CARRY_FORWARD" }).success,
    ).toBe(false);
    expect(
      PcCapabilityEstablishmentSchema.safeParse(carry({ method: "UNRESOLVED_INHERITANCE" }))
        .success,
    ).toBe(false);
    expect(
      PcCapabilityEstablishmentSchema.safeParse(carry({ method: "BOUNDED_PRIOR_RANDOMIZED" }))
        .success,
    ).toBe(false);
  });

  it("the handover is the Role Registry binding slot and nothing else; versions are committed versions (at least 1)", () => {
    expect(
      PcCapabilityEstablishmentSchema.safeParse(
        carry({ handover: { fact_key: pcExistenceContractKey("actor-smith"), version: 1 } }),
      ).success,
    ).toBe(false);
    for (const version of [0, -1, 1.5, "1"]) {
      expect(
        PcCapabilityEstablishmentSchema.safeParse(
          carry({ handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version } }),
        ).success,
      ).toBe(false);
      expect(
        PcCapabilityEstablishmentSchema.safeParse(carry({ source: { ...carry().source, version } }))
          .success,
      ).toBe(false);
    }
    expect(
      PcCapabilityEstablishmentSchema.safeParse(
        carry({ handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: 1, extra: 1 } }),
      ).success,
    ).toBe(false);
  });
});

describe("the basis and the persisted capability are the existing records", () => {
  it("a carry-forward basis carries the marker beside the establishment: every comparative marker form and the explicit null", () => {
    for (const marker of ["C", "B", "A", "S", { ex: "a causal descriptor" }, null])
      expect(PcCapabilityBasisSchema.safeParse(basis({ marker })).success).toBe(true);
    // the marker is mandatory (null is an explicit statement, never an omission) and qualitative only
    const without = basis();
    delete without.marker;
    expect(PcCapabilityBasisSchema.safeParse(without).success).toBe(false);
    for (const bad of ["D", "s", 3, 0.5, "S+", { ex: "" }, {}, []])
      expect(PcCapabilityBasisSchema.safeParse(basis({ marker: bad })).success).toBe(false);
    for (const field of ["materiality", "level", "xp", "skill", "draw", "inherited"])
      expect(PcCapabilityBasisSchema.safeParse(basis({ [field]: 1 })).success).toBe(false);
  });

  it("the persisted PC capability is unchanged: the same minimal record, the literal PC Capability Close, no provenance of its own", () => {
    const stage = pcCapabilityStage("actor-smith", "capability-metalworking");
    const cap = {
      pc_id: "actor-smith",
      capability_id: "capability-metalworking",
      marker: "C",
      basis: { fact_key: "pc/actor-smith/capability-basis/capability-metalworking", version: 1 },
      close: { name: PC_CAPABILITY_CLOSE, stage },
    };
    expect(PcCapabilitySchema.safeParse(cap).success).toBe(true);
    for (const extra of [
      "establishment",
      "method",
      "handover",
      "source",
      "inherited",
      "carried_from",
    ])
      expect(PcCapabilitySchema.safeParse({ ...cap, [extra]: carry() }).success).toBe(false);
    expect(PC_CAPABILITY_CLOSE).toBe("PC Capability Close");
  });
});

describe("the only authored input of a carry-forward is the identity and the capability", () => {
  it("parses exactly that, and nothing that could resolve, grade or reference", () => {
    expect(
      PcCapabilityCarryForwardInputSchema.safeParse({ pc_id: "a", capability_id: "c" }).success,
    ).toBe(true);
    for (const extra of [
      "marker",
      "grade",
      "prior",
      "claims",
      "source",
      "handover",
      "establishment",
      "version",
      "seed",
    ])
      expect(
        PcCapabilityCarryForwardInputSchema.safeParse({
          pc_id: "a",
          capability_id: "c",
          [extra]: "S",
        }).success,
        extra,
      ).toBe(false);
    expect(PcCapabilityCarryForwardInputSchema.safeParse({ pc_id: "a" }).success).toBe(false);
    expect(PcCapabilityCarryForwardInputSchema.safeParse({ capability_id: "c" }).success).toBe(
      false,
    );
    expect(
      PcCapabilityCarryForwardInputSchema.safeParse({ pc_id: "", capability_id: "c" }).success,
    ).toBe(false);
  });
});
