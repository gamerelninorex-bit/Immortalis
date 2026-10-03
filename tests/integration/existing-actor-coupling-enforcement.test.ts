/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Existing-Actor World-State Coupling Anchor Foundation — enforcement: the coupling is exactly the World-State custodian's
// source-backed statement about an ALREADY-EXISTING non-PC actor; a fresh/arbitrary PC, a missing or foreign source, a missing
// world or locus, a locus of another world, a wrong version pin, a second current locus, a rival owner, a copy of foreign
// state, an amendment and every excluded semantic (PC binding, insertion basis, capability, binding mode) each fail closed;
// and a raw `store.commit` cannot bypass any of it (admission is a pure function of (group, state)).
// Register lineage: IA-01/02/03 (partial), IA-14 (partial); RC-02, RC-13; IM-03, IM-07, IM-11.
// Sources: spec/f027/spec-lock.json — WG, WS-006 / F-014A, IR, I-002 and WS-016 pins (see the foundation suite); the PC-CONTROL
// HANDOVER CONTRACT v1 is the seam rule only. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  pcExistenceContractKey,
  productionCompletionKey,
  worldActorCouplingKey,
  worldFallbackEntityKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import { WORLD_ACTOR_COUPLING_RULE, factKind, resolveKey } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  FIXTURE_CAMPAIGN,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  capabilityBasis,
  fixtureContract,
  fixtureInsertionFact,
  fixtureLocus,
  fixtureWorld,
  group,
  publication,
  write,
} from "@immortalis/testkit";
import {
  actorBasisPin,
  bindingInput,
  compileExistingActor,
  coupleActor,
  couplingInput,
  establishActorBasis,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const key = worldActorCouplingKey(A);
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;
const WORLD2 = "world-fixture-2";
const LOCUS2 = "locus-fixture-2";

/** A campaign whose actor A has committed state; nothing is coupled. */
async function withActor(): Promise<ExistingActorSeeded> {
  const s = await seededExistingActorCampaign(tempDir());
  await establishActorBasis(s, 1, A, C);
  return s;
}
/** A second locus of the first world and a second world with its own locus. */
async function withSecondLocations(s: ExistingActorSeeded) {
  await must(
    s.campaign.establishLocus({
      ...publication(11),
      locus: fixtureLocus({ locus_id: LOCUS2 }),
    }),
  );
  await must(
    s.campaign.establishWorld({ ...publication(12), world: fixtureWorld({ world_id: WORLD2 }) }),
  );
  await must(
    s.campaign.establishLocus({
      ...publication(13),
      locus: fixtureLocus({
        locus_id: LOCUS2,
        world: { fact_key: worldProfileKey(WORLD2), entity_id: WORLD2 },
      }),
    }),
  );
}

const groupOf = (s: ExistingActorSeeded, k: string) =>
  s.campaign.store.getFact(k)!.provenance.group_id;
const pinning = (s: ExistingActorSeeded, ...keys: string[]) => ({
  reads: keys.map((k) => ({ key: k, version: s.campaign.store.getFact(k)!.version })),
  depends_on: keys.map((k) => groupOf(s, k)),
});

/** The coupling value the owner path would build for A, optionally altered. */
const couplingValue = (over: Record<string, unknown> = {}): any => ({
  actor_id: A,
  actor_state: [actorBasisPin(A, C)],
  coupling: {
    world: { fact_key: worldProfileKey(W), entity_id: W },
    locus: { fact_key: worldLocusKey(W, L), entity_id: L },
  },
  pinned_versions: { world: 1, locus: 1 },
  custodian: {
    owner: "world_state",
    facet: "world_fallback_physical_entity",
    basis: "NO_MORE_SPECIFIC_AUTHORITATIVE_PHYSICAL_STATE_OWNER",
  },
  ...over,
});

/** A raw coupling commit; `pins` are the keys it reads and depends on (the owner path pins exactly these). */
function rawCoupling(
  s: ExistingActorSeeded,
  n: number,
  value: unknown,
  o: {
    at?: string;
    owner?: string;
    facet?: string;
    pins?: string[];
    reads?: CommitGroup["reads"];
    depends_on?: string[];
    expected?: number;
    extra?: CommitGroup["writes"];
  } = {},
): CommitGroup {
  const pins = o.pins ?? [actorCapabilityBasisKey(A, C), worldProfileKey(W), worldLocusKey(W, L)];
  const owner = o.owner ?? "world_state";
  const facet = o.facet ?? "world_fallback_physical_entity";
  return group(
    FIXTURE_CAMPAIGN,
    n,
    [
      write(o.at ?? key, value as never, { owner, facet, expected_version: o.expected ?? 0 }),
      ...(o.extra ?? []),
    ],
    {
      owner,
      facet,
      rule: WORLD_ACTOR_COUPLING_RULE,
      reads: o.reads ?? pinning(s, ...pins).reads,
      depends_on: o.depends_on ?? pinning(s, ...pins).depends_on,
    },
  );
}

const unchanged = async (s: ExistingActorSeeded, attempt: () => Promise<unknown>) => {
  const head = s.campaign.store.head();
  await attempt();
  expect(s.campaign.store.head()).toEqual(head);
  expect(s.campaign.store.getFact(key)).toBeUndefined();
};

describe("the coupling rests on an already-existing non-PC actor, an existing world and an existing locus of that world", () => {
  it("an actor with no committed state of its own cannot be coupled: a pin to nothing is no source", async () => {
    const s = await withActor();
    await unchanged(s, async () => {
      expect(await codeOf(coupleActor(s, 1, ACTOR_OTHER))).toBe("PREREQUISITE_MISSING");
      // forged onto a raw commit that declares the read at version 0 and no dependency
      const raw = rawCoupling(
        s,
        1,
        couplingValue({ actor_id: ACTOR_OTHER, actor_state: [actorBasisPin(ACTOR_OTHER, C)] }),
        {
          at: worldActorCouplingKey(ACTOR_OTHER),
          reads: [
            { key: actorCapabilityBasisKey(ACTOR_OTHER, C), version: 0 },
            { key: worldProfileKey(W), version: 1 },
            { key: worldLocusKey(W, L), version: 1 },
          ],
          depends_on: [groupOf(s, worldProfileKey(W)), groupOf(s, worldLocusKey(W, L))],
        },
      );
      expect(await codeOf(s.campaign.store.commit(raw))).toMatch(
        /^(PREREQUISITE_MISSING|STALE_READ|MISSING_DEPENDENCY)$/,
      );
    });
    expect(s.campaign.existingActorCoupling(ACTOR_OTHER)).toBeUndefined();
  });

  it("a pin to another actor's state, another owner's state or another kind's state is no source for this actor", async () => {
    const s = await withActor();
    await establishActorBasis(s, 2, ACTOR_OTHER, C);
    await unchanged(s, async () => {
      // another actor's committed state
      expect(
        await codeOf(coupleActor(s, 1, A, { actor_state: [actorBasisPin(ACTOR_OTHER, C)] })),
      ).toBe("REFERENCE_INVALID");
      // the world and the locus are no actor state; neither is a pin whose owner lies about the committing owner
      for (const [i, k] of [worldProfileKey(W), worldLocusKey(W, L)].entries()) {
        expect(
          await codeOf(
            coupleActor(s, 2 + i, A, {
              actor_state: [{ owner: "world_state", fact_key: k, version: 1 }],
            }),
          ),
          k,
        ).toBe("REFERENCE_INVALID");
      }
      expect(
        await codeOf(
          coupleActor(s, 5, A, {
            actor_state: [
              { owner: "world_state", fact_key: actorCapabilityBasisKey(A, C), version: 1 },
            ],
          }),
        ),
      ).toBe("REFERENCE_INVALID");
    });
  });

  it("a pin at any version other than the committed one is refused", async () => {
    const s = await withActor();
    await unchanged(s, async () => {
      for (const version of [2, 3])
        expect(
          await codeOf(coupleActor(s, version, A, { actor_state: [actorBasisPin(A, C, version)] })),
          `v${version}`,
        ).toBe("REFERENCE_INVALID");
    });
  });

  it("a missing world, a missing locus and a locus of another world are refused; nothing is created for them", async () => {
    const s = await withActor();
    await withSecondLocations(s);
    await unchanged(s, async () => {
      expect(await codeOf(coupleActor(s, 1, A, { world_id: "world-nowhere" }))).toBe(
        "PREREQUISITE_MISSING",
      );
      expect(await codeOf(coupleActor(s, 2, A, { locus_id: "locus-nowhere" }))).toBe(
        "PREREQUISITE_MISSING",
      );
      // LOCUS2 exists in WORLD2 AND in the first world here, so a mixed reference is built by hand: world 1, locus of world 2
      const mixed = couplingValue({
        coupling: {
          world: { fact_key: worldProfileKey(W), entity_id: W },
          locus: { fact_key: worldLocusKey(WORLD2, LOCUS2), entity_id: LOCUS2 },
        },
      });
      const raw = rawCoupling(s, 3, mixed, {
        pins: [actorCapabilityBasisKey(A, C), worldProfileKey(W), worldLocusKey(WORLD2, LOCUS2)],
      });
      expect(await codeOf(s.campaign.store.commit(raw))).toBe("REFERENCE_INVALID");
    });
    // and with the correct pair of the second world, the coupling is lawful
    await must(coupleActor(s, 9, A, { world_id: WORLD2, locus_id: LOCUS2 }));
    expect(s.campaign.existingActorCoupling(A)!.value.coupling.world.entity_id).toBe(WORLD2);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a wrong pinned world or locus version, or a missing pin on the committed group, is refused", async () => {
    const s = await withActor();
    await unchanged(s, async () => {
      for (const [i, pinned_versions] of [
        { world: 0, locus: 1 },
        { world: 2, locus: 1 },
        { world: 1, locus: 2 },
      ].entries())
        expect(
          await codeOf(
            s.campaign.store.commit(rawCoupling(s, 1 + i, couplingValue({ pinned_versions }))),
          ),
          JSON.stringify(pinned_versions),
        ).toBe("REFERENCE_INVALID");
      // a group that does not read / depend on what it references is refused, one prerequisite at a time
      const pins = [actorCapabilityBasisKey(A, C), worldProfileKey(W), worldLocusKey(W, L)];
      for (const [i, omit] of pins.entries()) {
        const kept = pins.filter((p) => p !== omit);
        expect(
          await codeOf(
            s.campaign.store.commit(rawCoupling(s, 10 + i, couplingValue(), { pins: kept })),
          ),
          omit,
        ).toBe("REFERENCE_INVALID");
        const noDep = rawCoupling(s, 20 + i, couplingValue());
        expect(
          await codeOf(
            s.campaign.store.commit({
              ...noDep,
              depends_on: noDep.depends_on.filter((d) => d !== groupOf(s, omit)),
            }),
          ),
          `dep ${omit}`,
        ).toBe("REFERENCE_INVALID");
      }
    });
  });
});

describe("no Player Character, and no actor that would become one by a fresh authorship pass, can be coupled", () => {
  it("an identity with a FRESH Existence Contract is a PC: it cannot be coupled even though it had actor state first", async () => {
    const s = await withActor();
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(5),
        group_id: "fresh-group",
        intent_id: "fresh-intent",
        contract: fixtureContract({ pc_id: A }),
      }),
    );
    await unchanged(s, async () => {
      expect(await codeOf(coupleActor(s, 1))).toBe("REFERENCE_INVALID");
      expect(await codeOf(s.campaign.store.commit(rawCoupling(s, 2, couplingValue())))).toBe(
        "REFERENCE_INVALID",
      );
    });
  });

  it("an actor already coupled cannot be re-authored as a FRESH PC: only the explicit existing-actor compilation may name it", async () => {
    const s = await withActor();
    await must(coupleActor(s, 1));
    const head = s.campaign.store.head();
    const fresh = await s.campaign.releasePlayerCharacter({
      ...publication(6),
      group_id: "fresh-group",
      intent_id: "fresh-intent",
      contract: fixtureContract({ pc_id: A }),
    });
    expect(!fresh.ok && fresh.error.code).toBe("REFERENCE_INVALID");
    // a raw commit of the same fresh contract is refused identically
    const raw = group(
      FIXTURE_CAMPAIGN,
      7,
      [
        write(pcExistenceContractKey(A), fixtureContract({ pc_id: A }) as never, {
          owner: "pc_existence",
          facet: "existence_contract",
        }),
      ],
      {
        owner: "pc_existence",
        facet: "existence_contract",
        rule: factKind("pc_existence_contract").rule,
      },
    );
    expect(await codeOf(s.campaign.store.commit(raw))).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(pcExistenceContractKey(A))).toBeUndefined();
    // a fresh PC with another identity is unaffected
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(8),
        contract: fixtureContract({ pc_id: "pc-someone-else" }),
      }),
    );
    // and the explicit compilation of the coupled actor still commits
    await must(compileExistingActor(s, 1));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("ordinary activation still refuses the coupled actor's compilation, so no first ACTIVATION can create a rival locus", async () => {
    const s = await withActor();
    await must(coupleActor(s, 1));
    await must(compileExistingActor(s, 1));
    const bound = await s.campaign.bindPlayerCharacter(bindingInput(A, 4));
    expect(!bound.ok && bound.error.code).toBe("REFERENCE_INVALID");
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.existingActorCoupling(A)!.fact.version).toBe(1);
  });

  it("the coupling carries no PC, binding, insertion basis, bridge, player-authored statement, capability or binding mode", async () => {
    const s = await withActor();
    const extras: Record<string, unknown> = {
      active_pc: { fact_key: pcExistenceContractKey(A), entity_id: A },
      binding_slot: "role.player_character",
      transition: { type: "ACTIVATION", basis: fixtureInsertionFact() },
      insertion: fixtureInsertionFact(),
      bridge: "NATIVE_ALREADY_THERE",
      established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
      authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
      statement: "SYNTHETIC FIXTURE: the character is already here.",
      capability: capabilityBasis(A, D),
      binding_mode: "DEFERRED",
      pc_id: A,
      existing_actor_compilation: { classification: "EXISTING_ACTOR_COMPILATION" },
    };
    await unchanged(s, async () => {
      let i = 0;
      for (const [name, v] of Object.entries(extras))
        expect(
          await codeOf(s.campaign.store.commit(rawCoupling(s, ++i, couplingValue({ [name]: v })))),
          name,
        ).toBe("VALUE_INVALID");
    });
    // the owner path takes identities and pins only: an insertion fact handed to it is never read and never persisted
    const r = await must(
      s.campaign.coupleExistingActor({
        ...couplingInput(50),
        insertion: fixtureInsertionFact(),
      } as never),
    );
    expect(r.replayed).toBe(false);
    const text = JSON.stringify(s.campaign.existingActorCoupling(A)!.value);
    for (const absent of [
      "ACTIVATION",
      "NATIVE_ALREADY_THERE",
      "role.player",
      "statement",
      "bridge",
    ])
      expect(text, absent).not.toContain(absent);
    expect(s.campaign.binding()).toBeUndefined();
  });
});

describe("there is exactly one authoritative current locus per actor", () => {
  it("a second coupling of the same actor — same locus, another locus, another world — is a conflict, never a sibling truth", async () => {
    const s = await withActor();
    await withSecondLocations(s);
    await must(coupleActor(s, 1));
    const committed = structuredClone(s.campaign.store.getFact(key)!);
    const head = s.campaign.store.head();
    for (const [i, over] of [
      {},
      { locus_id: LOCUS2 },
      { world_id: WORLD2, locus_id: LOCUS2 },
    ].entries()) {
      const r = await coupleActor(s, 100 + i, A, over);
      expect(r.ok, JSON.stringify(over)).toBe(false);
    }
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.getFact(key)).toEqual(committed);
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("world-state/actor/")),
    ).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the committed coupling cannot be amended or replaced (sealed), and no other key can carry a second current locus", async () => {
    const s = await withActor();
    await withSecondLocations(s);
    await must(coupleActor(s, 1));
    const head = s.campaign.store.head();
    // an amendment at the committed version
    const amend = rawCoupling(
      s,
      2,
      couplingValue({
        coupling: {
          world: { fact_key: worldProfileKey(W), entity_id: W },
          locus: { fact_key: worldLocusKey(W, LOCUS2), entity_id: LOCUS2 },
        },
        pinned_versions: { world: 1, locus: 1 },
      }),
      {
        expected: 1,
        pins: [actorCapabilityBasisKey(A, C), worldProfileKey(W), worldLocusKey(W, LOCUS2)],
      },
    );
    expect(await codeOf(s.campaign.store.commit(amend))).toBe("AMENDMENT_NOT_SUPPORTED");
    // sibling keys are outside every key space
    for (const [i, at] of [
      `world-state/actor/${A}/coupling-2`,
      `world-state/actor/${A}/coupling/${LOCUS2}`,
      `world/${W}/actor/${A}/coupling`,
      `world/${WORLD2}/actor/${A}`,
      `world-state/${A}/coupling`,
      `actor/${A}/coupling`,
    ].entries())
      expect(
        await codeOf(s.campaign.store.commit(rawCoupling(s, 10 + i, couplingValue(), { at }))),
        at,
      ).toBe("KEY_NOT_ADMITTED");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("re-presenting the same publication is an idempotent replay (RC-16), a changed intent under its identity is not", async () => {
    const s = await withActor();
    await withSecondLocations(s);
    await must(coupleActor(s, 1));
    const head = s.campaign.store.head();
    expect((await must(coupleActor(s, 1))).replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(head);
    const changed = await coupleActor(s, 1, A, { locus_id: LOCUS2 });
    expect(changed.ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
  });
});

describe("owner exclusivity: only the World-State custodian, in its own key space, writes the coupling", () => {
  it("another owner, another facet, or the Production durable path cannot write or alter the coupling key", async () => {
    const s = await withActor();
    const head = s.campaign.store.head();
    for (const [i, [owner, facet]] of [
      ["named_actor", "actor_profile"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      ["production", "production_state"],
      ["world_state", "world_locus"],
      ["world_state", "world_profile"],
    ].entries())
      expect(
        await codeOf(
          s.campaign.store.commit(
            rawCoupling(s, 1 + i, couplingValue(), { owner: owner!, facet: facet! }),
          ),
        ),
        `${owner}/${facet}`,
      ).toBe("KEY_NOT_ADMITTED");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("the coupling is not a manufactured durable: it lives in no entity key space, and the acceptance and transition paths refuse its shape", async () => {
    const s = await withActor();
    expect(resolveKey(key)!.kind.id).toBe("world_actor_coupling");
    expect(resolveKey(worldFallbackEntityKey(W, A))!.kind.id).toBe("world_fallback_entity");
    expect(resolveKey(`world/${W}/entity/${A}/transition`)!.kind.id).toBe(
      "world_entity_transition",
    );
    // an actor "accepted" at an entity key, with a coupling value or with a completion-shaped value, is refused
    const head = s.campaign.store.head();
    for (const [i, [at, value]] of [
      [worldFallbackEntityKey(W, A), couplingValue()],
      [`world/${W}/entity/${A}/transition`, couplingValue()],
      [key, { entity_id: A, entity_class: "actor", quantity: 1 }],
    ].entries())
      expect(
        await codeOf(s.campaign.store.commit(rawCoupling(s, 1 + i, value, { at: at as string }))),
        at as string,
      ).toMatch(/^(VALUE_INVALID|KEY_NOT_ADMITTED)$/);
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.store.listFacts().some((f) => f.key.startsWith("production/"))).toBe(false);
    expect(s.campaign.store.getFact(productionCompletionKey("op-none"))).toBeUndefined();
  });

  it("a coupling group writes exactly one fact, and a typed value with the wrong identity, custodian or pins is refused", async () => {
    const s = await withActor();
    const head = s.campaign.store.head();
    const extra = write(
      worldLocusKey(W, "locus-smuggled"),
      fixtureLocus({ locus_id: "locus-smuggled" }) as never,
      {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
      },
    );
    expect(
      await codeOf(s.campaign.store.commit(rawCoupling(s, 1, couplingValue(), { extra: [extra] }))),
    ).toMatch(/^(KEY_NOT_ADMITTED|VALUE_INVALID)$/);
    const bad: Record<string, Record<string, unknown>> = {
      "other actor id": { actor_id: ACTOR_OTHER },
      "empty actor state": { actor_state: [] },
      "duplicated source pin": { actor_state: [actorBasisPin(A, C), actorBasisPin(A, C)] },
      "wrong custodian owner": {
        custodian: { owner: "production", facet: "world_fallback_physical_entity", basis: "x" },
      },
      "wrong custodian basis": {
        custodian: { owner: "world_state", facet: "world_fallback_physical_entity", basis: "x" },
      },
      "fractional pin": { pinned_versions: { world: 1.5, locus: 1 } },
    };
    let i = 10;
    for (const [name, over] of Object.entries(bad))
      expect(
        await codeOf(s.campaign.store.commit(rawCoupling(s, ++i, couplingValue(over)))),
        name,
      ).toBe("VALUE_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("a foreign owner's state is not copied into the coupling: it is pinned by reference and the strict value cannot carry it", async () => {
    const s = await withActor();
    const head = s.campaign.store.head();
    const smuggled = couplingValue({
      actor_state: [{ ...actorBasisPin(A, C), marker: "C", value: { marker: "C" } }],
    });
    expect(await codeOf(s.campaign.store.commit(rawCoupling(s, 1, smuggled)))).toBe(
      "VALUE_INVALID",
    );
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawCoupling(s, 2, couplingValue({ locus_designation: "SYNTHETIC FIXTURE: copy" })),
        ),
      ),
    ).toBe("VALUE_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
  });
});

describe("input at the owner path fails closed", () => {
  it("malformed targets are INPUT_INVALID and write nothing", async () => {
    const s = await withActor();
    await unchanged(s, async () => {
      for (const over of [
        { actor_state: [] },
        { actor_state: "none" },
        { actor_state: [{ owner: "named_actor", fact_key: "k" }] },
        { actor_state: [actorBasisPin(A, C), actorBasisPin(A, C)] },
        { world_id: "has/slash" },
        { locus_id: "" },
      ])
        expect(await codeOf(coupleActor(s, 1, A, over as never)), JSON.stringify(over)).toBe(
          "INPUT_INVALID",
        );
      expect(
        await codeOf(
          s.campaign.coupleExistingActor({ ...couplingInput(2), group_id: "" } as never),
        ),
      ).toBe("INPUT_INVALID");
      expect(
        await codeOf(
          s.campaign.coupleExistingActor({ ...couplingInput(3), actor_id: "a/b" } as never),
        ),
      ).toBe("INPUT_INVALID");
    });
  });
});
