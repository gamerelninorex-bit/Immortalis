// S1-P1 contracts: the strict shapes of the typed acoustic profile (W2a, inside the existing world_locus), the actor raw sensory
// state (W1) and the acoustic emission (W2b), and the key builders. Strictness is also the structural half of the exclusions: no
// field exists in which a Health condition, a perceived/available verdict, a duration, a neighbour, a direction or an attenuation
// could be stated. Each negative changes ONE premise of a value that otherwise parses.
import { describe, expect, it } from "vitest";
import {
  AcousticProfileV1Schema,
  ActorRawSensoryStateSchema,
  WorldAcousticEmissionSchema,
  WorldLocusSchema,
  actorRawSensoryStateKey,
  worldAcousticEmissionKey,
} from "@immortalis/contracts";
import { fixtureLocus } from "@immortalis/testkit";
import { acousticProfile, emissionValue, rawSensoryValue } from "../support/auditory-premises.ts";

const ok = (schema: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const without = (v: Record<string, Any>, k: string) => {
  const { [k]: _omitted, ...rest } = v;
  void _omitted;
  return rest;
};

describe("key builders (verbatim key spaces)", () => {
  it("are exactly the source-defined keys", () => {
    expect(actorRawSensoryStateKey("a1")).toBe("world-state/actor/a1/raw-sensory/AIRBORNE_HEARING");
    expect(worldAcousticEmissionKey("w1", "l1", "e1")).toBe(
      "world/w1/locus/l1/acoustic-emission/e1",
    );
  });
});

describe("W2a: the optional typed acoustic_profile_v1 on the existing strict world_locus", () => {
  it("control: the qualifying profile parses, with and without a locus around it", () => {
    expect(ok(AcousticProfileV1Schema, acousticProfile())).toBe(true);
    expect(
      ok(WorldLocusSchema, fixtureLocus({ acoustic_profile_v1: acousticProfile() } as never)),
    ).toBe(true);
  });

  it("absence is lawful and leaves an existing locus byte-for-byte what it was", () => {
    const old = fixtureLocus();
    const parsed = WorldLocusSchema.parse(old);
    expect(Object.keys(parsed)).not.toContain("acoustic_profile_v1");
    expect(JSON.stringify(parsed)).toBe(JSON.stringify(old));
    // free-text constraints are not a profile and cannot create one
    const prose = fixtureLocus({
      constraints: [
        { aspect: "acoustics", statement: "Sound carries to every corner of the hall." },
      ],
    });
    expect(WorldLocusSchema.parse(prose).acoustic_profile_v1).toBeUndefined();
  });

  it.each([
    ["another channel", { channel: "WATERBORNE_SOUND" }],
    ["a partial scope", { scope: "PARTIAL_LOCUS" }],
    ["a weaker coverage", { coverage: "FULL_LOCUS_WEAK" }],
    ["an exclusion", { exclusions: [{ reason: "a curtain" }] }],
    ["an unknown exclusion marker", { exclusions: ["UNKNOWN"] }],
    ["a smuggled attenuation figure", { attenuation_db: 3 }],
    ["a direction", { direction: "NORTH" }],
    ["a neighbouring locus", { neighbouring_loci: ["locus-2"] }],
    ["a propagation path", { path: ["a", "b"] }],
    ["a duration", { duration_ms: 500 }],
  ])("refuses %s", (_name, over) => {
    expect(ok(AcousticProfileV1Schema, acousticProfile(over))).toBe(false);
  });

  it("refuses a missing, empty or padded coverage statement", () => {
    const base = acousticProfile() as Any;
    for (const k of ["whole_locus_reach", "no_material_obstruction", "no_material_attenuation"]) {
      expect(
        ok(AcousticProfileV1Schema, { ...base, coverage_basis: without(base.coverage_basis, k) }),
      ).toBe(false);
      expect(
        ok(AcousticProfileV1Schema, {
          ...base,
          coverage_basis: { ...base.coverage_basis, [k]: "" },
        }),
      ).toBe(false);
      expect(
        ok(AcousticProfileV1Schema, {
          ...base,
          coverage_basis: { ...base.coverage_basis, [k]: " padded " },
        }),
      ).toBe(false);
    }
    expect(ok(AcousticProfileV1Schema, without(base, "coverage_basis"))).toBe(false);
  });

  it("makes the environmental emitter basis mandatory, strict and typed", () => {
    const base = acousticProfile() as Any;
    expect(ok(AcousticProfileV1Schema, without(base, "environmental_emitter_basis"))).toBe(false);
    const basis = base.environmental_emitter_basis;
    for (const k of [
      "emitter_id",
      "physical_source_statement",
      "bounded_impulse_possible_statement",
    ]) {
      expect(
        ok(AcousticProfileV1Schema, { ...base, environmental_emitter_basis: without(basis, k) }),
      ).toBe(false);
    }
    for (const bad of ["a/b", "", " x", "x y"]) {
      expect(
        ok(AcousticProfileV1Schema, {
          ...base,
          environmental_emitter_basis: { ...basis, emitter_id: bad },
        }),
      ).toBe(false);
    }
    expect(
      ok(AcousticProfileV1Schema, {
        ...base,
        environmental_emitter_basis: { ...basis, occurred: true },
      }),
    ).toBe(false);
    // the potential impulse is a statement of possibility, never an occurrence field
    expect(ok(AcousticProfileV1Schema, { ...base, occurred: true })).toBe(false);
  });

  it("requires the physical statements to be independently authored: no two are the same text", () => {
    const base = acousticProfile() as Any;
    const same = "The hall is open and the air is still and carries every sound.";
    expect(
      ok(AcousticProfileV1Schema, {
        ...base,
        coverage_basis: {
          ...base.coverage_basis,
          no_material_obstruction: same,
          no_material_attenuation: same,
        },
      }),
    ).toBe(false);
    expect(
      ok(AcousticProfileV1Schema, {
        ...base,
        environmental_emitter_basis: {
          ...base.environmental_emitter_basis,
          bounded_impulse_possible_statement: base.coverage_basis.whole_locus_reach,
        },
      }),
    ).toBe(false);
  });
});

describe("W1: actor_raw_sensory_state", () => {
  it("control: the lawful value parses", () => {
    expect(ok(ActorRawSensoryStateSchema, rawSensoryValue())).toBe(true);
  });

  it.each([
    "actor_id",
    "world",
    "locus",
    "presence",
    "modality",
    "physical_form_statement",
    "raw_transduction",
    "ordinary_receptivity",
    "source_provenance",
    "effective_instant",
    "dependency_refs",
  ])("has no default for the mandatory field %s", (field) => {
    expect(ok(ActorRawSensoryStateSchema, without(rawSensoryValue(), field))).toBe(false);
  });

  it("carries only the source-defined literals", () => {
    for (const bad of ["PERCEIVED", "present", "MAYBE", "", null])
      expect(ok(ActorRawSensoryStateSchema, rawSensoryValue({ raw_transduction: bad }))).toBe(
        false,
      );
    for (const bad of ["AVAILABLE", "receptive", "IMPAIRED", "", null])
      expect(ok(ActorRawSensoryStateSchema, rawSensoryValue({ ordinary_receptivity: bad }))).toBe(
        false,
      );
    for (const good of ["PRESENT", "ABSENT", "UNKNOWN"])
      expect(ok(ActorRawSensoryStateSchema, rawSensoryValue({ raw_transduction: good }))).toBe(
        true,
      );
    for (const good of ["RECEPTIVE", "NONRECEPTIVE", "UNKNOWN"])
      expect(ok(ActorRawSensoryStateSchema, rawSensoryValue({ ordinary_receptivity: good }))).toBe(
        true,
      );
    // only the one stage-one modality
    expect(ok(ActorRawSensoryStateSchema, rawSensoryValue({ modality: "SIGHT" }))).toBe(false);
    expect(ok(ActorRawSensoryStateSchema, rawSensoryValue({ modality: "airborne_hearing" }))).toBe(
      false,
    );
  });

  it.each([
    ["a Health condition", { health: "AVAILABLE" }],
    ["a Health clearance", { health_close: { stamp: "h1" } }],
    ["a capability score", { capability_score: 7 }],
    ["a perceived verdict", { perceived: true }],
    ["a viewpoint", { viewpoint: "north" }],
    ["a custodian record", { custodian: { owner: "world_state" } }],
    ["an attended meaning", { attention: "high" }],
    ["a recipient", { recipient: "pc-1" }],
  ])("has no field in which %s could be stated", (_name, extra) => {
    expect(ok(ActorRawSensoryStateSchema, { ...rawSensoryValue(), ...extra })).toBe(false);
  });

  it("requires unique premises that include the B2 presence pin (their order is not significant; the pins' truth is for admission)", () => {
    const v = rawSensoryValue() as Any;
    const refs = v.dependency_refs as { fact_key: string; version: number }[];
    expect(ok(ActorRawSensoryStateSchema, { ...v, dependency_refs: [...refs].reverse() })).toBe(
      true,
    );
    expect(
      ok(ActorRawSensoryStateSchema, {
        ...v,
        dependency_refs: [refs[0], refs[0], refs[1], refs[2]],
      }),
    ).toBe(false);
    expect(
      ok(ActorRawSensoryStateSchema, {
        ...v,
        dependency_refs: refs.filter((r) => r.fact_key !== v.presence.fact_key),
      }),
    ).toBe(false);
    expect(
      ok(ActorRawSensoryStateSchema, {
        ...v,
        dependency_refs: refs.map((r) =>
          r.fact_key === v.presence.fact_key ? { ...r, version: 2 } : r,
        ),
      }),
    ).toBe(false);
    // a malformed pin is a shape failure
    expect(
      ok(ActorRawSensoryStateSchema, { ...v, dependency_refs: [{ fact_key: "x" }, ...refs] }),
    ).toBe(false);
    expect(
      ok(ActorRawSensoryStateSchema, {
        ...v,
        dependency_refs: [{ fact_key: "x", version: -1 }, ...refs],
      }),
    ).toBe(false);
    expect(
      ok(ActorRawSensoryStateSchema, {
        ...v,
        dependency_refs: [{ fact_key: "x", version: 1, extra: 1 }, ...refs],
      }),
    ).toBe(false);
  });

  it("pins the B2 slot derived from the actor identity and an independent provenance", () => {
    expect(
      ok(
        ActorRawSensoryStateSchema,
        rawSensoryValue({
          presence: { fact_key: "world-state/actor/someone-else/presence", version: 1 },
        }),
      ),
    ).toBe(false);
    const v = rawSensoryValue() as Any;
    expect(
      ok(ActorRawSensoryStateSchema, { ...v, source_provenance: v.physical_form_statement }),
    ).toBe(false);
  });
});

describe("W2b: world_acoustic_emission", () => {
  it("control: the lawful value parses", () => {
    expect(ok(WorldAcousticEmissionSchema, emissionValue())).toBe(true);
  });

  it.each([
    "emission_id",
    "world",
    "locus",
    "profile_locus_version",
    "emitter_id",
    "emitting_source",
    "channel",
    "audible_material",
    "event_instant",
    "source_provenance",
  ])("has no default for the mandatory field %s", (field) => {
    expect(ok(WorldAcousticEmissionSchema, without(emissionValue(), field))).toBe(false);
  });

  it("is an airborne-sound instant at a pinned original locus version, and nothing else", () => {
    expect(ok(WorldAcousticEmissionSchema, emissionValue({ channel: "WATERBORNE_SOUND" }))).toBe(
      false,
    );
    expect(ok(WorldAcousticEmissionSchema, emissionValue({ profile_locus_version: -1 }))).toBe(
      false,
    );
    expect(
      ok(
        WorldAcousticEmissionSchema,
        emissionValue({ emitting_source: { fact_key: "x", version: -1 } }),
      ),
    ).toBe(false);
    expect(ok(WorldAcousticEmissionSchema, emissionValue({ emitter_id: "a/b" }))).toBe(false);
    expect(ok(WorldAcousticEmissionSchema, emissionValue({ audible_material: "" }))).toBe(false);
    expect(
      ok(WorldAcousticEmissionSchema, emissionValue({ event_instant: { unit: "tick" } })),
    ).toBe(false);
  });

  it.each([
    ["a duration", { duration: 4 }],
    ["a recurrence", { repeats: true }],
    ["a continuing process", { ongoing: true }],
    ["a neighbouring locus", { propagates_to: ["locus-2"] }],
    ["a direction", { direction: "EAST" }],
    ["an attenuation", { attenuation: 0.4 }],
    ["a recipient", { heard_by: ["actor-smith"] }],
    ["an actor-initiated cause", { initiated_by: "actor-smith" }],
    ["a perceived verdict", { perceived: true }],
  ])("has no field in which %s could be stated", (_name, extra) => {
    expect(ok(WorldAcousticEmissionSchema, { ...emissionValue(), ...extra })).toBe(false);
  });
});
