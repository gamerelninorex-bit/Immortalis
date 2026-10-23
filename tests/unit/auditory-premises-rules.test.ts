/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// S1-P1 — the pure rule functions, judged DIRECTLY against a real committed pre-state with one premise changed. Admission, replay and
// the load verifier all call these same functions, so each rule must hold on its own and never because a caller happened to pin
// something else first. This also reaches the exclusions a lawful path cannot produce (a Player Character or a rival custodian that
// appears under an identity the chain already uses).
import { beforeAll, describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  actorPhysicalPresenceKey,
  actorRawSensoryStateKey,
  actorSetupPlacementKey,
  worldActorCouplingKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  acousticProfileLocusViolation,
  actorRawSensoryStateViolation,
  auditoryPremisesHistoricalCheck,
  emissionPrecedents,
  emitterIdentityViolation,
  rawSensoryPremisesViolation,
  worldAcousticEmissionViolation,
} from "@immortalis/engine";
import { T0, fixtureLocus } from "@immortalis/testkit";
import { tempDir } from "../support/tmp.ts";
import { CAP } from "../support/actor-presence.ts";
import {
  A,
  EMISSION,
  EMISSION_KEY,
  EMITTER,
  L,
  LOCUS_KEY,
  RAW_KEY,
  W,
  acousticProfile,
  emissionValue,
  p1Chain,
  p1Scene,
  rawSensoryValue,
} from "../support/auditory-premises.ts";

type Facts = Map<string, OwnerFact>;
let all: ReadonlyMap<string, OwnerFact>;
/** the chain's committed facts as they stood BEFORE W1 and the emission */
const preW1 = (): Facts => {
  const m = new Map(all);
  m.delete(RAW_KEY);
  m.delete(EMISSION_KEY);
  return m;
};
/** the chain's committed facts as they stood BEFORE the emission (W1 committed) */
const preEmission = (): Facts => {
  const m = new Map(all);
  m.delete(EMISSION_KEY);
  return m;
};
const patched = (
  m: Facts,
  key: string,
  over: Record<string, unknown>,
  top: Record<string, unknown> = {},
) => {
  const f = m.get(key)!;
  m.set(key, { ...f, ...top, value: { ...(f.value as object), ...over } as never });
  return m;
};
const forged = (key: string, value: unknown = { garbage: true }): OwnerFact => ({
  ...all.get(LOCUS_KEY)!,
  key,
  value: value as never,
});

beforeAll(async () => {
  const s = await p1Scene(tempDir());
  await p1Chain(s);
  all = new Map(s.campaign.store.listFacts().map((f) => [f.key, f] as const));
});

const w1 = (over: Record<string, unknown> = {}) => rawSensoryValue(over) as any;
const em = (over: Record<string, unknown> = {}) => emissionValue(over) as any;

describe("W1: actorRawSensoryStateViolation", () => {
  it("control: the lawful value against its real pre-state", () => {
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), preW1())).toBeNull();
  });

  it("a slot that is not the actor's and modality's", () => {
    expect(
      actorRawSensoryStateViolation(
        "world-state/actor/other/raw-sensory/AIRBORNE_HEARING",
        w1(),
        preW1(),
      ),
    ).toMatch(/slot derived from its actor identity and modality/);
  });

  it("a Player Character, a bound PC, a Population aggregate or a rival physical custodian of the same identity", () => {
    const withExtra = (f: OwnerFact) => {
      const m = preW1();
      m.set(f.key, f);
      return m;
    };
    for (const f of [forged(`pc/${A}/existence-contract`), forged(`population/${A}/ledger`)]) {
      expect(actorRawSensoryStateViolation(RAW_KEY, w1(), withExtra(f)), f.key).toMatch(
        /not an existing non-PC actor/,
      );
    }
    expect(
      actorRawSensoryStateViolation(
        RAW_KEY,
        w1(),
        withExtra(forged(worldFallbackEntityKey(W, A), { entity_id: A })),
      ),
    ).toMatch(/current physical custodian record/);
  });

  it("no B2, a B2 that is not the actor's fallback-custodian fact, a second-version B2, or a B2 of another world or locus", () => {
    const noB2 = preW1();
    noB2.delete(actorPhysicalPresenceKey(A));
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), noB2)).toMatch(
      /physical presence \(B2\) is committed/,
    );

    const wrongOwner = patched(preW1(), actorPhysicalPresenceKey(A), {}, { owner: "someone_else" });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), wrongOwner)).toMatch(
      /actor's own committed World-State fallback-custodian presence/,
    );
    const wrongFacet = patched(preW1(), actorPhysicalPresenceKey(A), {}, { facet: "world_locus" });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), wrongFacet)).toMatch(
      /fallback-custodian presence/,
    );
    const wrongActor = patched(preW1(), actorPhysicalPresenceKey(A), { actor_id: "someone-else" });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), wrongActor)).toMatch(
      /fallback-custodian presence/,
    );

    const second = preW1();
    second.set(actorPhysicalPresenceKey(A), {
      ...second.get(actorPhysicalPresenceKey(A))!,
      version: 2,
    });
    expect(
      actorRawSensoryStateViolation(
        RAW_KEY,
        w1({
          presence: { fact_key: actorPhysicalPresenceKey(A), version: 2 },
          dependency_refs: (w1().dependency_refs as any[]).map((r) =>
            r.fact_key === actorPhysicalPresenceKey(A) ? { ...r, version: 2 } : r,
          ),
        }),
        second,
      ),
    ).toMatch(/first version: stage one admits no successor presence/);

    const elsewhere = patched(preW1(), actorPhysicalPresenceKey(A), {
      locus: { fact_key: worldLocusKey(W, "elsewhere"), entity_id: "elsewhere" },
    });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), elsewhere)).toMatch(
      /world and locus of the actor's committed presence/,
    );
    const stalePins = patched(preW1(), actorPhysicalPresenceKey(A), {
      pinned_versions: { world: 1, locus: 9, placement: 1, closure: 1 },
    });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), stalePins)).toMatch(
      /versions the presence was established against/,
    );
  });

  it("references that are not their key identities, or a locus not of the named world", () => {
    expect(
      actorRawSensoryStateViolation(
        RAW_KEY,
        w1({ world: { fact_key: "world/x/profile", entity_id: W } }),
        preW1(),
      ),
    ).toMatch(/do not match their key identities/);
    const noLocus = preW1();
    noLocus.delete(LOCUS_KEY);
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), noLocus)).toMatch(
      /world and the locus are committed/,
    );
    const crossed = patched(preW1(), LOCUS_KEY, {
      world: { fact_key: worldProfileKey("other"), entity_id: "other" },
    });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), crossed)).toMatch(
      /does not belong to the world/,
    );
  });

  it("the premises: required world, locus and B2; only this actor's chain; each at its exact committed version", () => {
    const get = (m: ReadonlyMap<string, OwnerFact>) => (k: string) => m.get(k);
    const pre = preW1();
    const v = w1();
    expect(rawSensoryPremisesViolation(v, get(pre))).toBeNull();
    for (const key of [worldProfileKey(W), LOCUS_KEY, actorPhysicalPresenceKey(A)]) {
      const without = {
        ...v,
        dependency_refs: v.dependency_refs.filter((r: any) => r.fact_key !== key),
      };
      // (a W1 without its own B2 pin does not even parse; the rule still states it)
      expect(rawSensoryPremisesViolation(without, get(pre)), key).toMatch(/is not named/);
    }
    const extra = (fact_key: string) => ({
      ...v,
      dependency_refs: [...v.dependency_refs, { fact_key, version: 1 }],
    });
    for (const key of [
      "named-actor/x/capability-basis/y",
      worldActorCouplingKey(A),
      actorSetupPlacementKey("someone-else"),
      worldSetupClosureKey("another-world"),
    ]) {
      expect(rawSensoryPremisesViolation(extra(key), get(pre)), key).toMatch(
        /no capability basis, coupling or other fact serves as a faculty premise/,
      );
    }
    // this actor's own B1 and this world's closure are lawful premises, and must be pinned at their committed versions
    expect(rawSensoryPremisesViolation(extra(actorSetupPlacementKey(A)), get(pre))).toBeNull();
    expect(rawSensoryPremisesViolation(extra(worldSetupClosureKey(W)), get(pre))).toBeNull();
    const stale = {
      ...v,
      dependency_refs: [...v.dependency_refs, { fact_key: actorSetupPlacementKey(A), version: 7 }],
    };
    expect(rawSensoryPremisesViolation(stale, get(pre))).toMatch(
      /pinned at exactly its committed version/,
    );
    const missing = preW1();
    missing.delete(actorSetupPlacementKey(A));
    expect(rawSensoryPremisesViolation(extra(actorSetupPlacementKey(A)), get(missing))).toMatch(
      /exactly its committed version/,
    );
  });

  it("the Temporal basis: no clock, another clock, or a B2 whose instant is not W1's", () => {
    const noClock = preW1();
    noClock.delete("temporal/state");
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), noClock)).toMatch(
      /no Temporal canonical time is committed/,
    );
    const later = patched(preW1(), "temporal/state", {
      canonical_time: { unit: T0.unit, value: T0.value + 40 },
    });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), later)).toMatch(
      /not backdated, forward-dated or carried across elapsed time/,
    );
    // the load verifier's mode leaves the clock to the historical verifier but still compares B2's instant with W1's
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), later, { checkClock: false })).toBeNull();
    const staleB2 = patched(preW1(), actorPhysicalPresenceKey(A), {
      effective_instant: { unit: T0.unit, value: 90 },
    });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), staleB2, { checkClock: false })).toMatch(
      /not carried across elapsed canonical time/,
    );
  });

  it("an emission of the same locus at the same instant already committed (or one that cannot be read) forbids a later W1", () => {
    const post = preEmission();
    post.delete(RAW_KEY);
    post.set(EMISSION_KEY, all.get(EMISSION_KEY)!);
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), post)).toMatch(
      /never established after the event it would qualify/,
    );
    const unreadable = patched(post, EMISSION_KEY, { event_instant: "garbage" });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), unreadable)).toMatch(/already committed/);
    // an emission at another instant, or at another locus, does not
    const other = patched(post, EMISSION_KEY, { event_instant: { unit: T0.unit, value: 1 } });
    expect(actorRawSensoryStateViolation(RAW_KEY, w1(), other)).toBeNull();
  });
});

describe("W2b: worldAcousticEmissionViolation", () => {
  it("control: the lawful value against its real pre-state", () => {
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), preEmission())).toBeNull();
  });

  it("a slot that is not the emission's own, references that are not their key identities", () => {
    expect(
      worldAcousticEmissionViolation(
        `world/${W}/locus/${L}/acoustic-emission/x`,
        em(),
        preEmission(),
      ),
    ).toMatch(/slot derived from its world, locus and emission identity/);
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em({ world: { fact_key: "world/x/profile", entity_id: W } }),
        preEmission(),
      ),
    ).toMatch(/do not match their key identities/);
  });

  it("the closure must be committed: a typed profile is a PRE-SEAL source, and the emission follows the seal", () => {
    const noClosure = preEmission();
    noClosure.delete(worldSetupClosureKey(W));
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), noClosure)).toMatch(
      /setup is not closed/,
    );
  });

  it("the world, the locus and the source must be committed and the locus World-State's own, of this world", () => {
    const noWorld = preEmission();
    noWorld.delete(worldProfileKey(W));
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), noWorld)).toMatch(
      /world is committed/,
    );
    const noLocus = preEmission();
    noLocus.delete(LOCUS_KEY);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), noLocus)).toMatch(
      /locus is committed/,
    );
    for (const top of [{ owner: "someone_else" }, { facet: "world_fallback_physical_entity" }]) {
      expect(
        worldAcousticEmissionViolation(
          EMISSION_KEY,
          em(),
          patched(preEmission(), LOCUS_KEY, {}, top),
        ),
      ).toMatch(/source is a World-State locus of the world being named/);
    }
    const crossed = patched(preEmission(), LOCUS_KEY, {
      world: { fact_key: worldProfileKey("o"), entity_id: "o" },
    });
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), crossed)).toMatch(
      /source is a World-State locus/,
    );
  });

  it("the original first version of the locus, and the same commit named twice", () => {
    const second = preEmission();
    second.set(LOCUS_KEY, { ...second.get(LOCUS_KEY)!, version: 2 });
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em({ profile_locus_version: 2, emitting_source: { fact_key: LOCUS_KEY, version: 2 } }),
        second,
      ),
    ).toMatch(/original \(first\) world_locus version/);
    for (const over of [
      { profile_locus_version: 2 },
      { emitting_source: { fact_key: LOCUS_KEY, version: 2 } },
      { emitting_source: { fact_key: worldProfileKey(W), version: 1 } },
    ]) {
      expect(worldAcousticEmissionViolation(EMISSION_KEY, em(over), preEmission())).toMatch(
        /original \(first\)/,
      );
    }
  });

  it("a locus with no typed profile, an emitter the profile does not name, an actor as emitter", () => {
    const { acoustic_profile_v1: _p, ...bare } = all.get(LOCUS_KEY)!.value as any;
    void _p;
    const noProfile = preEmission();
    noProfile.set(LOCUS_KEY, { ...noProfile.get(LOCUS_KEY)!, value: bare });
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), noProfile)).toMatch(
      /no typed pre-seal acoustic profile/,
    );
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em({ emitter_id: "emitter-invented" }),
        preEmission(),
      ),
    ).toMatch(/environmental emitter basis names, and no other/);
    const actorEmitter = patched(preEmission(), LOCUS_KEY, {
      acoustic_profile_v1: acousticProfile({
        environmental_emitter_basis: {
          emitter_id: A,
          physical_source_statement: "The smith's own hammer.",
          bounded_impulse_possible_statement: "It could be struck once.",
        },
      }),
    });
    expect(
      worldAcousticEmissionViolation(EMISSION_KEY, em({ emitter_id: A }), actorEmitter),
    ).toMatch(/never an actor, a Player Character or an aggregate/);
  });

  it("event provenance and audible material are distinct from the profile's own statements", () => {
    const p = acousticProfile() as any;
    for (const text of [
      p.coverage_basis.whole_locus_reach,
      p.coverage_basis.no_material_obstruction,
      p.coverage_basis.no_material_attenuation,
      p.environmental_emitter_basis.physical_source_statement,
      p.environmental_emitter_basis.bounded_impulse_possible_statement,
    ]) {
      expect(
        worldAcousticEmissionViolation(
          EMISSION_KEY,
          em({ source_provenance: text }),
          preEmission(),
        ),
        text,
      ).toMatch(/distinct from the profile's own statements/);
    }
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em({ audible_material: p.environmental_emitter_basis.bounded_impulse_possible_statement }),
        preEmission(),
      ),
    ).toMatch(/not the profile's statement of what could be emitted/);
  });

  it("the Temporal basis: no clock or another clock is refused; the verifier's mode leaves the clock to the historical verifier", () => {
    const noClock = preEmission();
    noClock.delete("temporal/state");
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), noClock)).toMatch(
      /no Temporal canonical time is committed/,
    );
    const later = patched(preEmission(), "temporal/state", {
      canonical_time: { unit: T0.unit, value: T0.value + 40 },
    });
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), later)).toMatch(
      /not backdated, forward-dated/,
    );
    expect(
      worldAcousticEmissionViolation(EMISSION_KEY, em(), later, { checkClock: false }),
    ).toBeNull();
  });
});

describe("F-2: the emission follows an actual committed B2 and W1 at the same event basis (the pure rule, on its own)", () => {
  const chain =
    /follows an actual committed R1 B2 and World-State W1 of one non-PC actor at this locus/;
  const B2 = actorPhysicalPresenceKey(A);

  it("control: exactly one precedent, naming the committed B2 and W1 of the actor", () => {
    const found = emissionPrecedents(W, L, T0, preEmission());
    expect(found.map((p) => [p.presence.key, p.raw.key])).toEqual([[B2, RAW_KEY]]);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), preEmission())).toBeNull();
  });

  it("BLUE's counterexample: closure and clock committed, NO B2 and NO W1: no precedent, no emission", () => {
    const m = preEmission();
    m.delete(B2);
    m.delete(RAW_KEY);
    expect(emissionPrecedents(W, L, T0, m)).toEqual([]);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), m)).toMatch(chain);
  });

  it("no B2, or no W1, alone", () => {
    const noB2 = preEmission();
    noB2.delete(B2);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), noB2)).toMatch(chain);
    const noW1 = preEmission();
    noW1.delete(RAW_KEY);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), noW1)).toMatch(chain);
  });

  it("a stale W1 or B2 (another instant: not carried across elapsed time) is no precedent, and neither is an emission at another instant", () => {
    const old = { unit: T0.unit, value: T0.value - 10 };
    const staleW1 = patched(preEmission(), RAW_KEY, { effective_instant: old });
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), staleW1)).toMatch(chain);
    const staleB2 = patched(preEmission(), B2, { effective_instant: old });
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), staleB2)).toMatch(chain);
    // the verifier's mode leaves the clock to the historical verifier, yet the same-basis rule still holds
    const later = { unit: T0.unit, value: T0.value + 40 };
    expect(
      worldAcousticEmissionViolation(EMISSION_KEY, em({ event_instant: later }), preEmission(), {
        checkClock: false,
      }),
    ).toMatch(chain);
    expect(emissionPrecedents(W, L, later, preEmission())).toEqual([]);
  });

  it("a W1 or B2 of another locus or world, a successor version, a foreign custodian or an inexact premise is no precedent", () => {
    const elsewhere = { fact_key: worldLocusKey(W, "elsewhere"), entity_id: "elsewhere" };
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em(),
        patched(preEmission(), RAW_KEY, { locus: elsewhere }),
      ),
    ).toMatch(chain);
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em(),
        patched(preEmission(), B2, { locus: elsewhere }),
      ),
    ).toMatch(chain);
    const otherWorld = { fact_key: worldProfileKey("other"), entity_id: "other" };
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em(),
        patched(preEmission(), RAW_KEY, { world: otherWorld }),
      ),
    ).toMatch(chain);
    for (const key of [RAW_KEY, B2]) {
      const second = preEmission();
      second.set(key, { ...second.get(key)!, version: 2 });
      expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), second), key).toMatch(chain);
    }
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em(),
        patched(preEmission(), B2, {}, { owner: "someone_else" }),
      ),
    ).toMatch(chain);
    expect(
      worldAcousticEmissionViolation(
        EMISSION_KEY,
        em(),
        patched(preEmission(), RAW_KEY, {}, { facet: "world_locus" }),
      ),
    ).toMatch(chain);
    const inexact = patched(preEmission(), RAW_KEY, {
      dependency_refs: (all.get(RAW_KEY)!.value as any).dependency_refs.map((r: any) => ({
        ...r,
        version: 9,
      })),
    });
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), inexact)).toMatch(chain);
  });

  it("a chain whose actor is not (or is no longer) a lawful non-PC actor is no precedent", () => {
    const m = preEmission();
    const f = forged(`pc/${A}/existence-contract`);
    m.set(f.key, f);
    expect(emissionPrecedents(W, L, T0, m)).toEqual([]);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), m)).toMatch(chain);
  });

  it("a chain is asked for by world and locus: the same committed chain answers no other world, and no other locus", () => {
    expect(emissionPrecedents(W, L, T0, preEmission())).toHaveLength(1);
    expect(emissionPrecedents("another-world", L, T0, preEmission())).toEqual([]);
    expect(emissionPrecedents(W, "another-locus", T0, preEmission())).toEqual([]);
  });

  it("a W1 resting on a premise that is not this actor's physical one (a capability basis offered as a premise) is no precedent", () => {
    const refs = (all.get(RAW_KEY)!.value as any).dependency_refs;
    const offered = patched(preEmission(), RAW_KEY, {
      dependency_refs: [...refs, { fact_key: actorCapabilityBasisKey(A, CAP), version: 1 }],
    });
    expect(emissionPrecedents(W, L, T0, offered)).toEqual([]);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), offered)).toMatch(chain);
  });

  it("a W1 not at the slot derived from its own actor is no precedent", () => {
    const moved = preEmission();
    const f = moved.get(RAW_KEY)!;
    moved.delete(RAW_KEY);
    const foreign = "world-state/actor/zed/raw-sensory/AIRBORNE_HEARING";
    moved.set(foreign, { ...f, key: foreign });
    expect(emissionPrecedents(W, L, T0, moved)).toEqual([]);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), moved)).toMatch(chain);
  });

  it("one lawful chain among several suffices, and an unreadable W1 among them is simply not a chain", () => {
    const m = preEmission();
    const noise = forged("world-state/actor/zed/raw-sensory/AIRBORNE_HEARING", { garbage: true });
    m.set(noise.key, noise);
    expect(emissionPrecedents(W, L, T0, m).map((p) => p.raw.key)).toEqual([RAW_KEY]);
    expect(worldAcousticEmissionViolation(EMISSION_KEY, em(), m)).toBeNull();
  });
});

describe("W2a: acousticProfileLocusViolation", () => {
  const locusKey = worldLocusKey(W, "new-locus");
  const profiled = (over: Record<string, unknown> = {}) =>
    fixtureLocus({
      locus_id: "new-locus",
      acoustic_profile_v1: acousticProfile(over),
    } as never) as any;
  /** a world still in setup: only the profile, the first locus and the actor's basis */
  const setup = (): Facts => {
    const m: Facts = new Map();
    for (const k of [worldProfileKey(W), LOCUS_KEY]) m.set(k, all.get(k)!);
    return m;
  };

  it("control: a profiled locus authored while the world is still in setup", () => {
    expect(acousticProfileLocusViolation(locusKey, profiled(), setup())).toBeNull();
    // and a locus with no profile is never this rule's business
    expect(
      acousticProfileLocusViolation(
        locusKey,
        fixtureLocus({ locus_id: "new-locus" }) as any,
        setup(),
      ),
    ).toBeNull();
  });

  it("refused after the closure, after Temporal, as a rewrite of an existing locus, or at the wrong slot", () => {
    const closed = setup();
    closed.set(worldSetupClosureKey(W), all.get(worldSetupClosureKey(W))!);
    expect(acousticProfileLocusViolation(locusKey, profiled(), closed)).toMatch(
      /already closed.*cannot be inserted after the closure/,
    );
    const playing = setup();
    playing.set("temporal/state", all.get("temporal/state")!);
    expect(acousticProfileLocusViolation(locusKey, profiled(), playing)).toMatch(
      /only while the world is still in setup/,
    );
    const existing = setup();
    existing.set(locusKey, all.get(LOCUS_KEY)!);
    expect(acousticProfileLocusViolation(locusKey, profiled(), existing)).toMatch(
      /only with the original locus commit/,
    );
    expect(acousticProfileLocusViolation(worldLocusKey(W, "another"), profiled(), setup())).toMatch(
      /slot derived from its world and locus identity/,
    );
  });

  it("refused when the emitter is already a Player Character; and any non-setup fact (an aggregate included) has already ended setup", () => {
    const pc = setup();
    const f = forged(`pc/${EMITTER}/existence-contract`);
    pc.set(f.key, f);
    expect(acousticProfileLocusViolation(locusKey, profiled(), pc)).toMatch(
      /never an actor, a Player Character or an aggregate/,
    );
    const aggregate = setup();
    const ledger = forged(`population/${EMITTER}/ledger`);
    aggregate.set(ledger.key, ledger);
    expect(acousticProfileLocusViolation(locusKey, profiled(), aggregate)).toMatch(
      /only while the world is still in setup.*ends setup eligibility/,
    );
  });
});

describe("emitterIdentityViolation: an environmental emitter is a place's own source, never an actor or a custodian", () => {
  const facts = (extra: OwnerFact[] = []): Facts => {
    const m = new Map(all);
    for (const f of extra) m.set(f.key, f);
    return m;
  };
  it("a fresh identity is lawful; every actor-like slot of the same identity is not", () => {
    expect(emitterIdentityViolation(EMITTER, facts())).toBeNull();
    for (const key of [
      `pc/${EMITTER}/existence-contract`,
      actorSetupPlacementKey(EMITTER),
      actorPhysicalPresenceKey(EMITTER),
      worldActorCouplingKey(EMITTER),
      `population/${EMITTER}/ledger`,
    ]) {
      expect(emitterIdentityViolation(EMITTER, facts([forged(key)])), key).toMatch(
        /never an actor, a Player Character or an aggregate/,
      );
    }
    expect(emitterIdentityViolation(A, facts())).toMatch(/never an actor/); // the real chain's own actor
  });

  it("a physical custodian record or a Named-Actor fact of the identity is not an emitter either", () => {
    expect(
      emitterIdentityViolation(
        EMITTER,
        facts([forged(worldFallbackEntityKey(W, EMITTER), { entity_id: EMITTER })]),
      ),
    ).toMatch(/physical custodian record/);
    const named = forged("actor/zed/capability-basis/c", { actor_id: EMITTER });
    const kindOf = all.get("actor/actor-smith/capability-basis/capability-metalworking")!;
    expect(
      emitterIdentityViolation(
        EMITTER,
        facts([
          {
            ...kindOf,
            key: "actor/emitter-hall-gong/capability-basis/c",
            value: { actor_id: EMITTER } as never,
          },
        ]),
      ),
    ).toMatch(/Named Actor/);
    void named;
  });
});

describe("the historical hook acts on P1 groups only: every other group returns at once, so legacy journals replay as before", () => {
  const state = () => ({ campaign_id: "c", revision: 1, facts: all });
  const group = (owner: string, facet: string, key: string, value: unknown): CommitGroup =>
    ({
      campaign_id: "c",
      group_id: "g",
      intent_id: "i",
      owner,
      facet,
      cause: "c",
      rule: {} as never,
      authority: {} as never,
      reads: [],
      depends_on: [],
      writes: [
        { key, owner, facet, value, unit: null, basis: "b", secrecy: "s", expected_version: 0 },
      ],
    }) as never;
  it("another owner, another facet, a plain locus and a malformed locus are not judged", () => {
    expect(
      auditoryPremisesHistoricalCheck(
        group("temporal_kernel", "temporal_coordination", "temporal/state", {}),
        state(),
      ),
    ).toBeNull();
    expect(
      auditoryPremisesHistoricalCheck(
        group("world_state", "world_profile", worldProfileKey("x"), {}),
        state(),
      ),
    ).toBeNull();
    expect(
      auditoryPremisesHistoricalCheck(
        group(
          "world_state",
          "world_locus",
          worldLocusKey("x", "y"),
          fixtureLocus({ locus_id: "y" }),
        ),
        state(),
      ),
    ).toBeNull();
    expect(
      auditoryPremisesHistoricalCheck(
        group("world_state", "world_locus", worldLocusKey("x", "y"), { garbage: true }),
        state(),
      ),
    ).toBeNull();
    // and a P1 group IS judged: a raw sensory fact with a garbage value is refused rather than skipped
    const judged = auditoryPremisesHistoricalCheck(
      group("world_state", "world_fallback_physical_entity", actorRawSensoryStateKey("x"), {
        garbage: true,
      }),
      state(),
    );
    expect(judged).toMatchObject({ code: "VALUE_INVALID" });
    void EMISSION;
  });
});
