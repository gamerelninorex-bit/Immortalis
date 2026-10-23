/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// S1-P1 — owner admission of the typed acoustic profile (W2a), the actor raw sensory state (W1) and the acoustic emission (W2b),
// and what the pure read answers for each broken premise. MECHANISM ONLY: nothing here is perception, Health, a receipt or a
// player state. Every negative changes exactly one premise of an otherwise lawful chain, and asserts the REASON (the message), not
// only a code, so a case cannot pass for the wrong cause. Every negative leaves no positive candidate.
import { describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  actorPhysicalPresenceKey,
  actorRawSensoryStateKey,
  comparePlacementPins,
  worldAcousticEmissionKey,
  worldLocusKey,
} from "@immortalis/contracts";
import { factKind } from "@immortalis/engine";
import { FACET_WORLD_LOCUS } from "@immortalis/contracts";
import { T0, fixtureLocus, publication } from "@immortalis/testkit";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { coupleActor } from "../support/existing-actor.ts";
import { CAP } from "../support/actor-presence.ts";
import {
  A,
  EMISSION,
  EMISSION_KEY,
  EMITTER,
  B,
  EMITTER_2,
  L,
  L2,
  LOCUS_KEY,
  RAW_KEY,
  W,
  acousticProfile,
  advanceTime,
  commitClosure,
  commitEmission,
  commitPlacement,
  commitRaw,
  emissionPins,
  emissionValue,
  establishClock,
  evaluate,
  fullChain,
  p1Chain,
  p1Group,
  p1Scene,
  p1TwoActors,
  rawPins,
  rawSensoryValue,
} from "../support/auditory-premises.ts";

/** `CODE: message` for a refused commit, or "OK". */
const why = async (p: Promise<{ ok: boolean; error?: { code: string; message: string } }>) => {
  const r = await p;
  return r.ok ? "OK" : `${r.error!.code}: ${r.error!.message}`;
};

/** Reads each pin at the version actually committed (0 when it is not): the group a careful caller presents, so the OWNER rule judges it. */
const honest = (
  s: { campaign: { store: { getFact(k: string): any } } },
  pins: readonly string[],
) => ({
  reads: pins.map((k) => ({ key: k, version: s.campaign.store.getFact(k)?.version ?? 0 })),
  depends_on: [
    ...new Set(
      pins.flatMap((k) => {
        const f = s.campaign.store.getFact(k);
        return f ? [f.provenance.group_id as string] : [];
      }),
    ),
  ],
});

// ---------------------------------------------------------------------------------------------
// W2a — the typed profile is authorable only in the original locus source value, before the setup closure
// ---------------------------------------------------------------------------------------------

describe("W2a: the typed acoustic profile is a pre-seal source", () => {
  it("a locus authored without a profile is lawful, and a pure read refuses it for the absent profile (no inference from the locus)", async () => {
    const s = await p1Scene(tempDir(), { profile: false });
    await fullChain(s);
    await must(commitRaw(s));
    // no emission can be authored against a locus with no typed emitter
    expect(await why(commitEmission(s))).toMatch(
      /REFERENCE_INVALID: .*no typed pre-seal acoustic profile/,
    );
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
    const r = evaluate(s);
    expect(r).toMatchObject({ result: "REFUSED", code: "ACOUSTIC_PROFILE_ABSENT" });
  });

  it("an untyped, free-text-only acoustic claim establishes nothing", async () => {
    const s = await p1Scene(tempDir(), {
      profile: false,
      constraints: [
        { aspect: "acoustics", statement: "Every sound carries to every corner of the hall." },
      ],
    });
    await fullChain(s);
    await must(commitRaw(s));
    expect(s.campaign.store.getFact(LOCUS_KEY)!.value).not.toHaveProperty("acoustic_profile_v1");
    expect(await why(commitEmission(s))).toMatch(/no typed pre-seal acoustic profile/);
    expect(evaluate(s)).toMatchObject({ result: "REFUSED", code: "ACOUSTIC_PROFILE_ABSENT" });
  });

  it("a profile inserted AFTER the world's closure is refused (a new locus, so nothing is rewritten)", async () => {
    const s = await p1Scene(tempDir(), { profile: false });
    await must(commitPlacement(s));
    await must(commitClosure(s));
    const late = await s.campaign.establishLocus({
      ...publication(9),
      locus: fixtureLocus({
        locus_id: "late-locus",
        acoustic_profile_v1: acousticProfile(),
      } as never),
    });
    expect(!late.ok && late.error.code).toBe("REFERENCE_INVALID");
    expect(!late.ok && late.error.message).toMatch(
      /already closed.*cannot be inserted after the closure/,
    );
    expect(s.campaign.store.getFact(worldLocusKey(W, "late-locus"))).toBeUndefined();
  });

  it("a profile authored once the campaign has begun to play (Temporal established) is refused even with no closure", async () => {
    const s = await p1Scene(tempDir(), { profile: false });
    await must(establishClock(s));
    const late = await s.campaign.establishLocus({
      ...publication(9),
      locus: fixtureLocus({ locus_id: L2, acoustic_profile_v1: acousticProfile() } as never),
    });
    expect(!late.ok && late.error.code).toBe("REFERENCE_INVALID");
    expect(!late.ok && late.error.message).toMatch(/only while the world is still in setup/);
  });

  it("a backfilled rewrite of the original locus (adding or changing a profile) is refused: the locus is create-only", async () => {
    const s = await p1Scene(tempDir(), { profile: false });
    const rewrite = p1Group(
      s.campaign.store,
      LOCUS_KEY,
      fixtureLocus({ acoustic_profile_v1: acousticProfile() } as never),
      [`world/${W}/profile`],
      FACET_WORLD_LOCUS,
      { rule: factKind("world_locus").rule },
      1,
    );
    expect(await why(s.campaign.store.commit(rewrite))).toMatch(/AMENDMENT_NOT_SUPPORTED/);
    expect(s.campaign.store.getFact(LOCUS_KEY)!.version).toBe(1);
    expect(s.campaign.store.getFact(LOCUS_KEY)!.value).not.toHaveProperty("acoustic_profile_v1");
  });

  it("a malformed profile is refused at the contract: a non-empty exclusion, a missing emitter basis, an unknown field", async () => {
    for (const profile of [
      acousticProfile({ exclusions: [{ reason: "a curtain" }] }),
      (() => {
        const p = acousticProfile();
        delete p["environmental_emitter_basis"];
        return p;
      })(),
      acousticProfile({ attenuation_db: 3 }),
    ]) {
      const dir = tempDir();
      const created = await (async () => {
        const { CanonicalCampaign } = await import("@immortalis/engine");
        const { ACTOR_FIXTURE_EXTENSION, FIXTURE_CAMPAIGN, fixtureWorld } =
          await import("@immortalis/testkit");
        const c = await must(
          CanonicalCampaign.create(dir, {
            campaignId: FIXTURE_CAMPAIGN,
            buildId: "s1-p1-bad",
            extension: ACTOR_FIXTURE_EXTENSION,
          }),
        );
        await must(c.establishWorld({ ...publication(1), world: fixtureWorld() }));
        return c;
      })();
      const r = await created.establishLocus({
        ...publication(2),
        locus: fixtureLocus({ acoustic_profile_v1: profile } as never),
      });
      expect(r.ok).toBe(false);
      expect(created.store.getFact(LOCUS_KEY)).toBeUndefined();
    }
  });

  it("an environmental emitter may not be an actor: a profile naming an actor identity yields no emission", async () => {
    const s = await p1Scene(tempDir(), {
      profile: acousticProfile({
        environmental_emitter_basis: {
          emitter_id: A,
          physical_source_statement: "The smith's own hammer, as a place's source.",
          bounded_impulse_possible_statement: "It could be struck once against the anvil.",
        },
      }),
    });
    await fullChain(s);
    await must(commitRaw(s));
    expect(await why(commitEmission(s, { emitter_id: A }))).toMatch(
      /REFERENCE_INVALID: .*never an actor, a Player Character or an aggregate/,
    );
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------
// W1
// ---------------------------------------------------------------------------------------------

describe("W1: the actor's owner-authored raw auditory faculty and receptivity", () => {
  it("is refused without a committed B2 despite a coupling, a basis, a setup placement and a closure", async () => {
    const s = await p1Scene(tempDir());
    await must(coupleActor(s, 1, A));
    await must(commitPlacement(s));
    await must(commitClosure(s));
    await must(establishClock(s));
    // a group that presumes the pin is refused by the commit core; one that reads it honestly at 0 is refused by the owner rule
    expect(await why(commitRaw(s))).toMatch(/STALE_READ/);
    expect(await why(commitRaw(s, {}, A, L, honest(s, rawPins())))).toMatch(
      /PREREQUISITE_MISSING: .*physical presence is not committed/,
    );
    expect(s.campaign.store.getFact(RAW_KEY)).toBeUndefined();
    // and an independent emission does not conjure the missing premises: with no B2 and no W1 it is refused at its own admission
    expect(await why(commitEmission(s))).toMatch(/STALE_READ/);
    expect(await why(commitEmission(s, {}, L, honest(s, emissionPins())))).toMatch(
      /REFERENCE_INVALID: .*follows an actual committed R1 B2 and World-State W1/,
    );
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "EMISSION_NOT_COMMITTED" });
  });

  it("is never substituted by a Named-Actor capability basis, a coupling or a B2 co-location: no W1, no positive", async () => {
    const s = await p1Scene(tempDir());
    await must(coupleActor(s, 1, A));
    await fullChain(s);
    expect(s.campaign.store.getFact(actorCapabilityBasisKey(A, CAP))).toBeDefined();
    // the basis, the coupling and B2 are all committed, and none of them is a faculty: there is no W1, so no emission may follow
    expect(await why(commitEmission(s, {}, L, honest(s, emissionPins())))).toMatch(
      /REFERENCE_INVALID: .*follows an actual committed R1 B2 and World-State W1/,
    );
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "EMISSION_NOT_COMMITTED" });
    // a capability pin offered as a premise is refused: the premises are exactly the world, locus and B2
    const withCapability = [
      ...(rawSensoryValue() as any).dependency_refs,
      { fact_key: actorCapabilityBasisKey(A, CAP), version: 1 },
    ].sort(comparePlacementPins);
    expect(await why(commitRaw(s, { dependency_refs: withCapability }))).toMatch(
      /REFERENCE_INVALID: .*no capability basis, coupling or other fact serves as a faculty premise/,
    );
  });

  it("is refused for an actor with no presence, and for a value whose identity is not its key's", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    expect(await why(commitRaw(s, {}, "someone-else"))).toMatch(/STALE_READ/);
    expect(
      await why(commitRaw(s, {}, "someone-else", L, honest(s, rawPins("someone-else")))),
    ).toMatch(/PREREQUISITE_MISSING: .*physical presence is not committed/);
    const crossed = p1Group(
      s.campaign.store,
      `world-state/actor/someone-else/raw-sensory/AIRBORNE_HEARING`,
      rawSensoryValue(),
      [`world/${W}/profile`, LOCUS_KEY, `world-state/actor/${A}/presence`, "temporal/state"],
      "world_fallback_physical_entity",
    );
    expect(await why(s.campaign.store.commit(crossed))).toMatch(
      /VALUE_INVALID: actor identity does not match the key/,
    );
  });

  it("is refused for another modality, another owner or facet, and a group that writes anything else", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    const sight = p1Group(
      s.campaign.store,
      `world-state/actor/${A}/raw-sensory/SIGHT`,
      rawSensoryValue(),
      [`world/${W}/profile`, LOCUS_KEY, `world-state/actor/${A}/presence`, "temporal/state"],
      "world_fallback_physical_entity",
    );
    expect(await why(s.campaign.store.commit(sight))).toMatch(/KEY_NOT_ADMITTED/);
    const wrongFacet = p1Group(
      s.campaign.store,
      RAW_KEY,
      rawSensoryValue(),
      [`world/${W}/profile`, LOCUS_KEY, `world-state/actor/${A}/presence`, "temporal/state"],
      FACET_WORLD_LOCUS,
    );
    expect(await why(s.campaign.store.commit(wrongFacet))).toMatch(
      /KEY_NOT_ADMITTED: key belongs to a different owner\/facet/,
    );
    const two = p1Group(
      s.campaign.store,
      RAW_KEY,
      rawSensoryValue(),
      [`world/${W}/profile`, LOCUS_KEY, `world-state/actor/${A}/presence`, "temporal/state"],
      "world_fallback_physical_entity",
    );
    two.writes.push({ ...two.writes[0]!, key: `world-state/actor/${A}/setup-placement` });
    expect(await why(s.campaign.store.commit(two))).not.toBe("OK");
    expect(s.campaign.store.getFact(RAW_KEY)).toBeUndefined();
  });

  it("admits raw physical facts of every kind (ABSENT, NONRECEPTIVE, UNKNOWN are real source facts) and each yields its own answer", async () => {
    const cases: [Record<string, unknown>, string, string][] = [
      [{ raw_transduction: "ABSENT" }, "REFUSED", "RAW_TRANSDUCTION_ABSENT"],
      [{ ordinary_receptivity: "NONRECEPTIVE" }, "REFUSED", "ORDINARY_RECEPTIVITY_NONRECEPTIVE"],
      [{ raw_transduction: "UNKNOWN" }, "UNRESOLVED", "RAW_TRANSDUCTION_UNKNOWN"],
      [{ ordinary_receptivity: "UNKNOWN" }, "UNRESOLVED", "ORDINARY_RECEPTIVITY_UNKNOWN"],
      // a conclusive negative outranks an unknown on the other axis
      [
        { raw_transduction: "ABSENT", ordinary_receptivity: "UNKNOWN" },
        "REFUSED",
        "RAW_TRANSDUCTION_ABSENT",
      ],
      [
        { raw_transduction: "UNKNOWN", ordinary_receptivity: "NONRECEPTIVE" },
        "REFUSED",
        "ORDINARY_RECEPTIVITY_NONRECEPTIVE",
      ],
    ];
    for (const [over, result, code] of cases) {
      const s = await p1Scene(tempDir());
      await fullChain(s);
      await must(commitRaw(s, over));
      await must(commitEmission(s));
      expect(evaluate(s), JSON.stringify(over)).toMatchObject({ result, code });
    }
  });

  it("a W1 committed after the event it would qualify is refused, and the read has no faculty to use for that actor", async () => {
    // two lawful actors at one locus; only A has a W1 when the physical event occurs (the emission names no listener)
    const s = await p1TwoActors(tempDir());
    await must(commitRaw(s));
    await must(commitEmission(s));
    expect(await why(commitRaw(s, {}, B, L))).toMatch(
      /REFERENCE_INVALID: .*already committed: a raw sensory fact is never established after the event it would qualify/,
    );
    expect(s.campaign.store.getFact(actorRawSensoryStateKey(B))).toBeUndefined();
    expect(evaluate(s).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH"); // A, whose W1 preceded it
    expect(evaluate(s, { actor_id: B })).toMatchObject({
      result: "UNRESOLVED",
      code: "RAW_SENSORY_MISSING",
    });
  });

  it("a B2 that went stale after elapsed time yields no W1, whichever instant the caller states", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    await advanceTime(s);
    // the old instant: not the Temporal canonical time of the state before this fact
    expect(await why(commitRaw(s))).toMatch(
      /REFERENCE_INVALID: .*Temporal canonical time of the state before this fact/,
    );
    // the new instant: B2 is not carried across the elapsed canonical time
    const now = (s.campaign.store.getFact("temporal/state")!.value as any).canonical_time;
    expect(await why(commitRaw(s, { effective_instant: now }))).toMatch(
      /REFERENCE_INVALID: .*not carried across elapsed canonical time/,
    );
    expect(s.campaign.store.getFact(RAW_KEY)).toBeUndefined();
  });

  it("states no caller-authored, absent or foreign instant; and must read the committed Temporal state", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    expect(await why(commitRaw(s, { effective_instant: { unit: T0.unit, value: 999 } }))).toMatch(
      /REFERENCE_INVALID: .*(not carried across elapsed canonical time|Temporal canonical time of the state before this fact)/,
    );
    const noClockRead = p1Group(
      s.campaign.store,
      RAW_KEY,
      rawSensoryValue(),
      [`world/${W}/profile`, LOCUS_KEY, `world-state/actor/${A}/presence`],
      "world_fallback_physical_entity",
    );
    expect(await why(s.campaign.store.commit(noClockRead))).toMatch(
      /REFERENCE_INVALID: .*must read the Temporal state/,
    );
  });

  it("pins the exact committed B2, world and locus, and names the B2's locus", async () => {
    const s = await p1Scene(tempDir(), { extras: true });
    await fullChain(s);
    for (const version of [0, 2]) {
      expect(
        await why(
          commitRaw(s, { presence: { fact_key: `world-state/actor/${A}/presence`, version } }),
        ),
        `presence pinned at ${version}`,
      ).not.toBe("OK");
    }
    expect(await why(commitRaw(s, {}, A, L2))).toMatch(
      /names the world and locus of the actor's committed presence|REFERENCE_INVALID|PREREQUISITE_MISSING/,
    );
    const stalePins = (rawSensoryValue() as any).dependency_refs.map((r: any) => ({
      ...r,
      version: r.version + 1,
    }));
    expect(
      await why(
        commitRaw(s, {
          dependency_refs: stalePins,
          presence: stalePins.find((r: any) => r.fact_key.endsWith("/presence")),
        }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(RAW_KEY)).toBeUndefined();
  });

  it("is first-version only: no replacement, displacement, carry or second record exists", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    await must(commitRaw(s));
    expect(s.campaign.store.getFact(RAW_KEY)!.version).toBe(1);
    expect(await why(commitRaw(s, { raw_transduction: "ABSENT" }))).toMatch(/VERSION_CONFLICT/);
    const successor = p1Group(
      s.campaign.store,
      RAW_KEY,
      rawSensoryValue({ raw_transduction: "ABSENT" }),
      [`world/${W}/profile`, LOCUS_KEY, `world-state/actor/${A}/presence`, "temporal/state"],
      "world_fallback_physical_entity",
      {},
      1,
    );
    expect(await why(s.campaign.store.commit(successor))).toMatch(
      /AMENDMENT_NOT_SUPPORTED: .*stage one admits only the first raw sensory record/,
    );
    expect(s.campaign.store.getFact(RAW_KEY)!.version).toBe(1);
    expect((s.campaign.store.getFact(RAW_KEY)!.value as any).raw_transduction).toBe("PRESENT");
  });
});

// ---------------------------------------------------------------------------------------------
// W2b
// ---------------------------------------------------------------------------------------------

describe("W2b: the separately committed, source-authored acoustic emission", () => {
  const upToW1 = async (o: Parameters<typeof p1Scene>[1] = {}) => {
    const s = await p1Scene(tempDir(), o);
    await fullChain(s);
    await must(commitRaw(s));
    return s;
  };

  it("a possible impulse is not an event: with no emission committed the read is UNRESOLVED (a missing premise), for any identity it is asked about", async () => {
    const s = await upToW1();
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "EMISSION_NOT_COMMITTED" });
    expect(evaluate(s, { emission_id: "another" })).toMatchObject({
      result: "UNRESOLVED",
      code: "EMISSION_NOT_COMMITTED",
    });
    // none is manufactured
    expect(s.campaign.store.listFacts().some((f) => f.key.includes("acoustic-emission"))).toBe(
      false,
    );
  });

  it("is refused without a closure and a Temporal canonical time; and committed only at the committed time", async () => {
    const noClock = await p1Scene(tempDir());
    expect(await why(commitEmission(noClock))).not.toBe("OK");
    const noClosure = await p1Scene(tempDir());
    await must(establishClock(noClosure));
    expect(await why(commitEmission(noClosure))).toMatch(/STALE_READ/);
    expect(await why(commitEmission(noClosure, {}, L, honest(noClosure, emissionPins())))).toMatch(
      /PREREQUISITE_MISSING: .*setup closure is not committed/,
    );
    const s = await upToW1();
    for (const instant of [
      { unit: T0.unit, value: 50 },
      { unit: T0.unit, value: 5000 },
      { unit: "other", value: T0.value },
    ]) {
      expect(await why(commitEmission(s, { event_instant: instant }))).toMatch(
        /REFERENCE_INVALID: .*Temporal canonical time of the state before this fact.*not backdated, forward-dated/,
      );
    }
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
  });

  it("must name the profile's own emitter, from the exact original locus version, in the right world, locus and channel", async () => {
    const s = await upToW1({ extras: "profiled" });
    expect(await why(commitEmission(s, { emitter_id: EMITTER_2 }))).toMatch(
      /REFERENCE_INVALID: .*one the pre-seal profile's environmental emitter basis names, and no other/,
    );
    expect(await why(commitEmission(s, { emitter_id: "emitter-invented" }))).toMatch(
      /environmental emitter basis names/,
    );
    for (const over of [
      { profile_locus_version: 2 },
      { profile_locus_version: 0 },
      { emitting_source: { fact_key: LOCUS_KEY, version: 2 } },
      { emitting_source: { fact_key: LOCUS_KEY, version: 0 } },
      { emitting_source: { fact_key: `world/${W}/locus/${L2}`, version: 1 } },
    ]) {
      expect(await why(commitEmission(s, over)), JSON.stringify(over)).toMatch(
        /REFERENCE_INVALID: .*exact original \(first\) world_locus version/,
      );
    }
    expect(await why(commitEmission(s, { channel: "WATERBORNE_SOUND" }))).toMatch(/VALUE_INVALID/);
    expect(
      await why(
        commitEmission(s, { world: { fact_key: `world/${W}/profile`, entity_id: "world-other" } }),
      ),
    ).not.toBe("OK");
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
  });

  it("carries distinct event provenance: neither the profile's statements nor the possible impulse serve as the event", async () => {
    const s = await upToW1();
    const basis = (acousticProfile() as any).environmental_emitter_basis;
    for (const statement of [
      basis.bounded_impulse_possible_statement,
      basis.physical_source_statement,
      (acousticProfile() as any).coverage_basis.whole_locus_reach,
    ]) {
      expect(await why(commitEmission(s, { source_provenance: statement }))).toMatch(
        /REFERENCE_INVALID: .*distinct from the profile's own statements/,
      );
    }
    expect(
      await why(commitEmission(s, { audible_material: basis.bounded_impulse_possible_statement })),
    ).toMatch(
      /actual emitted characteristics, not the profile's statement of what could be emitted/,
    );
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
  });

  it("states no duration, recurrence, neighbour, direction, attenuation, recipient or actor-initiated cause", async () => {
    const s = await upToW1();
    for (const extra of [
      { duration: 4 },
      { repeats: true },
      { propagates_to: [L2] },
      { direction: "EAST" },
      { attenuation: 0.5 },
      { heard_by: [A] },
      { initiated_by: A },
    ]) {
      expect(await why(commitEmission(s, extra)), JSON.stringify(extra)).toMatch(/VALUE_INVALID/);
    }
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
  });

  it("is create-only: a duplicate identity and a rewrite are refused, and the locus cannot be mutated afterwards", async () => {
    const s = await upToW1();
    await must(commitEmission(s));
    expect(await why(commitEmission(s))).toMatch(/VERSION_CONFLICT/);
    const rewrite = p1Group(
      s.campaign.store,
      EMISSION_KEY,
      emissionValue({ audible_material: "A different note entirely." }),
      [`world/${W}/profile`, LOCUS_KEY, `world/${W}/setup-closure`, "temporal/state"],
      FACET_WORLD_LOCUS,
      {},
      1,
    );
    expect(await why(s.campaign.store.commit(rewrite))).toMatch(/AMENDMENT_NOT_SUPPORTED/);
    const mutateSource = p1Group(
      s.campaign.store,
      LOCUS_KEY,
      fixtureLocus({
        acoustic_profile_v1: acousticProfile({
          environmental_emitter_basis: {
            emitter_id: "emitter-swapped-afterwards",
            physical_source_statement: "A different source, declared after the event.",
            bounded_impulse_possible_statement: "It could ring once, declared after the event.",
          },
        }),
      } as never),
      [`world/${W}/profile`],
      FACET_WORLD_LOCUS,
      { rule: factKind("world_locus").rule },
      1,
    );
    expect(await why(s.campaign.store.commit(mutateSource))).toMatch(/AMENDMENT_NOT_SUPPORTED/);
    expect(s.campaign.store.getFact(LOCUS_KEY)!.version).toBe(1);
    expect(s.campaign.store.getFact(EMISSION_KEY)!.version).toBe(1);
    expect(evaluate(s).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
  });

  it("an emission at a neighbouring locus follows ITS OWN locus' chain, and gives the actor elsewhere no positive", async () => {
    // A is at L; B is at L2, a second, separately profiled locus. Only B has a chain at L2.
    const s = await p1TwoActors(tempDir(), { secondAt: "elsewhere" });
    await must(commitRaw(s));
    await must(commitRaw(s, {}, B, L2));
    const at2 = {
      emitter_id: EMITTER_2,
      emission_id: "emission-bell-2",
      emitting_source: { fact_key: `world/${W}/locus/${L2}`, version: 1 },
    };
    await must(commitEmission(s, at2, L2, {}, "emission-bell-2", B));
    // for B, who is there, it is the one positive; for A, elsewhere, a conclusive channel failure: no neighbour, path or propagation
    expect(evaluate(s, { actor_id: B, locus_id: L2, emission_id: "emission-bell-2" }).result).toBe(
      "SOURCE_PREMISES_READY_FOR_HEALTH",
    );
    expect(evaluate(s, { locus_id: L2, emission_id: "emission-bell-2" })).toMatchObject({
      result: "REFUSED",
      code: "EMISSION_NOT_AT_ACTOR_LOCUS",
    });
    // and no propagation from there to here
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "EMISSION_NOT_COMMITTED" });
  });

  it("a late emission (after elapsed time) is refused: the earlier B2 and W1 can never qualify a later event", async () => {
    const s = await upToW1();
    await advanceTime(s);
    // backdating to the old basis is refused
    expect(await why(commitEmission(s))).toMatch(/REFERENCE_INVALID: .*not backdated/);
    // at its own new time no B2 or W1 was established at that basis: B2 and W1 are not carried across elapsed time
    const now = (s.campaign.store.getFact("temporal/state")!.value as any).canonical_time;
    expect(await why(commitEmission(s, { event_instant: now }))).toMatch(
      /REFERENCE_INVALID: .*follows an actual committed R1 B2 and World-State W1.*same event basis/,
    );
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "EMISSION_NOT_COMMITTED" });
  });
});

// ---------------------------------------------------------------------------------------------
// F-2 (BLUE HOLD, PR #85): the stage-one B2 -> W1 -> emission sequence guards the emission's own admission
// ---------------------------------------------------------------------------------------------

describe("F-2: an emission is admitted only after an actual committed B2 and W1, at the same event basis", () => {
  const chainRefusal = /REFERENCE_INVALID: .*follows an actual committed R1 B2 and World-State W1/;

  it("BLUE's counterexample: a typed original locus, B1, closure and initial Temporal, with NO B2 and NO W1, then an otherwise valid emission: refused", async () => {
    const s = await p1Scene(tempDir());
    await must(commitPlacement(s));
    await must(commitClosure(s));
    await must(establishClock(s));
    expect(s.campaign.store.getFact(actorPhysicalPresenceKey(A))).toBeUndefined();
    expect(s.campaign.store.getFact(RAW_KEY)).toBeUndefined();
    // read honestly at the current versions (0 for the absent B2 and W1): only the OWNER rule can refuse it
    expect(await why(commitEmission(s, {}, L, honest(s, emissionPins())))).toMatch(chainRefusal);
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "EMISSION_NOT_COMMITTED" });
  });

  it("no W1 (B2 committed): refused; with the chain restored the same emission is lawful", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s); // B2, no W1
    expect(await why(commitEmission(s, {}, L, honest(s, emissionPins())))).toMatch(chainRefusal);
    await must(commitRaw(s));
    await must(commitEmission(s));
    expect(evaluate(s).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
  });

  it("a W1 stale after elapsed time (committed at the old basis) does not qualify an emission at the new one", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    await must(commitRaw(s));
    await advanceTime(s);
    const now = (s.campaign.store.getFact("temporal/state")!.value as any).canonical_time;
    expect(await why(commitEmission(s, { event_instant: now }))).toMatch(chainRefusal);
    expect(await why(commitEmission(s))).toMatch(/not backdated/);
  });

  it("a chain at another locus authorizes nothing here", async () => {
    const s = await p1Scene(tempDir(), { extras: "profiled" });
    await fullChain(s);
    await must(commitRaw(s)); // A's chain is at L
    const at2 = {
      emitter_id: EMITTER_2,
      emission_id: "emission-bell-2",
      emitting_source: { fact_key: `world/${W}/locus/${L2}`, version: 1 },
    };
    expect(
      await why(commitEmission(s, at2, L2, honest(s, emissionPins(L2)), "emission-bell-2")),
    ).toMatch(chainRefusal);
    expect(
      s.campaign.store.getFact(worldAcousticEmissionKey(W, L2, "emission-bell-2")),
    ).toBeUndefined();
  });

  it("the emission group must READ and DEPEND ON the exact B2 and W1 it follows, like every other premise it relies on", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    await must(commitRaw(s));
    const four = [`world/${W}/profile`, LOCUS_KEY, `world/${W}/setup-closure`, "temporal/state"];
    const unpinned = p1Group(
      s.campaign.store,
      EMISSION_KEY,
      emissionValue(),
      four,
      FACET_WORLD_LOCUS,
    );
    expect(await why(s.campaign.store.commit(unpinned))).toMatch(
      /REFERENCE_INVALID: .*must read the followed actor's/,
    );
    // reading them without depending on the groups that committed them is refused too
    const noDeps = p1Group(
      s.campaign.store,
      EMISSION_KEY,
      emissionValue(),
      emissionPins(),
      FACET_WORLD_LOCUS,
    );
    noDeps.depends_on = noDeps.depends_on.filter(
      (g) => g !== s.campaign.store.getFact(RAW_KEY)!.provenance.group_id,
    );
    expect(await why(s.campaign.store.commit(noDeps))).toMatch(
      /must depend on the group that committed/,
    );
    expect(s.campaign.store.getFact(EMISSION_KEY)).toBeUndefined();
    await must(commitEmission(s));
  });

  it("the emission stays owner-neutral: it names no listener, and one chain among several lawful actors suffices", async () => {
    const s = await p1TwoActors(tempDir());
    await must(commitRaw(s, {}, B, L)); // only B has a W1 when it occurs
    await must(commitEmission(s, {}, L, {}, EMISSION, B));
    expect(Object.keys(s.campaign.store.getFact(EMISSION_KEY)!.value as object).sort()).toEqual(
      [
        "audible_material",
        "channel",
        "emission_id",
        "emitter_id",
        "emitting_source",
        "event_instant",
        "locus",
        "profile_locus_version",
        "source_provenance",
        "world",
      ].sort(),
    );
    expect(evaluate(s, { actor_id: B }).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "RAW_SENSORY_MISSING" }); // A has no faculty on record
  });
});

// ---------------------------------------------------------------------------------------------
// the whole chain
// ---------------------------------------------------------------------------------------------

describe("the contrast: the same chain with each premise restored yields the one positive", () => {
  it("only the complete, ordered chain answers SOURCE_PREMISES_READY_FOR_HEALTH", async () => {
    const s = await p1Scene(tempDir());
    await fullChain(s);
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "EMISSION_NOT_COMMITTED" }); // no emission yet
    await must(commitRaw(s));
    expect(evaluate(s)).toMatchObject({ result: "UNRESOLVED", code: "EMISSION_NOT_COMMITTED" }); // still none
    await must(commitEmission(s));
    expect(evaluate(s).result).toBe("SOURCE_PREMISES_READY_FOR_HEALTH");
    void p1Chain;
    void EMITTER;
    void EMISSION;
  });
});
