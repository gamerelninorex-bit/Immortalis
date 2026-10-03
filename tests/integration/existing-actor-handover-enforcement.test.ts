/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Existing-Actor → PC Role Registry Handover — enforcement: only the exact lawful handover commits. A missing, mismatched,
// stale, fabricated or rival basis, a wrong actor/world/locus, a smuggled insertion fact or capability, and every raw
// `store.commit` path fail closed with a precise code and leave no trace (IA-02, IA-03; RC-02, RC-13; IM-03, IM-07, IM-11).
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  EXISTING_ACTOR_HANDOVER,
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  FIXTURE_LOCUS_ID,
  FIXTURE_WORLD_ID,
  fixtureContract,
  fixtureLocus,
  fixtureWorld,
  publication,
} from "@immortalis/testkit";
import {
  actorBasisPin,
  compileExistingActor,
  coupleActor,
  establishActorBasis,
  existingActorContract,
  handoverActor,
  handoverInput,
  rawHandover,
  readyForHandover,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const B = ACTOR_OTHER;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;
const couplingKey = worldActorCouplingKey(A);
const contractKey = pcExistenceContractKey(A);

const ready = async (): Promise<ExistingActorSeeded> => {
  const s = await seededExistingActorCampaign(tempDir());
  await readyForHandover(s);
  return s;
};

/** Refused with the exact code and no trace: the head, the binding slot and every fact are untouched. */
async function expectRefused(
  s: ExistingActorSeeded,
  attempt: () => Promise<{ ok: boolean; error?: { code: string; message: string } }>,
  code: string,
  message?: RegExp,
) {
  const head = s.campaign.store.head();
  const r = await attempt();
  expect(r.ok).toBe(false);
  expect(r.error?.code).toBe(code);
  if (message) expect(r.error?.message).toMatch(message);
  expect(s.campaign.store.head()).toEqual(head);
  expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
  expect(s.campaign.binding()).toBeUndefined();
}

describe("a missing prerequisite fails closed: the handover never creates, infers or substitutes one", () => {
  it("no committed coupling: the handover cannot invent a placement from the world, the locus or the caller", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(compileExistingActor(s, 1));
    await expectRefused(s, () => handoverActor(s, 1), "PREREQUISITE_MISSING");
    expect(s.campaign.store.getFact(couplingKey)).toBeUndefined();
  });

  it("no compilation: a coupled actor that was never compiled into I-002 form cannot be handed over", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(coupleActor(s, 1));
    await expectRefused(s, () => handoverActor(s, 1), "PREREQUISITE_MISSING");
    expect(s.campaign.store.getFact(contractKey)).toBeUndefined();
  });

  it("no actor state at all: an actor that does not exist cannot be handed over", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await expectRefused(s, () => handoverActor(s, 1), "PREREQUISITE_MISSING");
  });

  it("an unestablished world or locus is not created by the handover", async () => {
    const s = await ready();
    await expectRefused(
      s,
      () => handoverActor(s, 1, A, { locus_id: "locus-never-established" }),
      "PREREQUISITE_MISSING",
    );
    await expectRefused(
      s,
      () => handoverActor(s, 2, A, { world_id: "world-never-established" }),
      "PREREQUISITE_MISSING",
    );
    expect(s.campaign.locus(W, "locus-never-established")).toBeUndefined();
  });
});

describe("the world and locus are exactly the committed coupling's: a rival placement fails closed", () => {
  it("another established locus of the same world, and another established world, are refused", async () => {
    const s = await ready();
    await must(
      s.campaign.establishLocus({
        ...publication(40),
        locus: fixtureLocus({ locus_id: "locus-fixture-2" }),
      }),
    );
    await must(
      s.campaign.establishWorld({
        ...publication(41),
        world: fixtureWorld({ world_id: "world-fixture-2" }),
      }),
    );
    await must(
      s.campaign.establishLocus({
        ...publication(42),
        locus: fixtureLocus({
          locus_id: "locus-fixture-3",
          world: { fact_key: worldProfileKey("world-fixture-2"), entity_id: "world-fixture-2" },
        }),
      }),
    );
    await expectRefused(
      s,
      () => handoverActor(s, 1, A, { locus_id: "locus-fixture-2" }),
      "REFERENCE_INVALID",
      /rival placement/,
    );
    await expectRefused(
      s,
      () => handoverActor(s, 2, A, { world_id: "world-fixture-2", locus_id: "locus-fixture-3" }),
      "REFERENCE_INVALID",
      /rival placement/,
    );
    // a locus of another world named with the coupled world is not a locus of that world
    await expectRefused(
      s,
      () => handoverActor(s, 3, A, { locus_id: "locus-fixture-3" }),
      "PREREQUISITE_MISSING",
    );
    // the lawful handover is still available, and it is the coupling's
    await must(handoverActor(s, 4));
    expect(s.campaign.binding()!.value.coupling.locus.entity_id).toBe(L);
  });

  it("a second coupling to another locus cannot be established to make a rival placement lawful", async () => {
    const s = await ready();
    await must(
      s.campaign.establishLocus({
        ...publication(40),
        locus: fixtureLocus({ locus_id: "locus-fixture-2" }),
      }),
    );
    expect(
      (await coupleActor(s, 9, A, { locus_id: "locus-fixture-2" })).ok,
      "one slot per actor",
    ).toBe(false);
    await expectRefused(
      s,
      () => handoverActor(s, 1, A, { locus_id: "locus-fixture-2" }),
      "REFERENCE_INVALID",
    );
    expect(s.campaign.existingActorCoupling(A)!.value.coupling.locus.entity_id).toBe(L);
  });

  it("a raw binding whose coupling reference or key identity disagrees with the committed coupling is refused", async () => {
    const s = await ready();
    await must(
      s.campaign.establishLocus({
        ...publication(40),
        locus: fixtureLocus({ locus_id: "locus-fixture-2" }),
      }),
    );
    const l2 = worldLocusKey(W, "locus-fixture-2");
    const edits: Record<string, (v: any) => void> = {
      "locus moved to another established locus": (v) => {
        v.coupling.locus = { fact_key: l2, entity_id: "locus-fixture-2" };
      },
      "locus reference disagrees with its key": (v) => {
        v.coupling.locus.entity_id = "locus-fixture-2";
      },
      "world reference disagrees with its key": (v) => {
        v.coupling.world.entity_id = "world-other";
      },
      "active PC key disagrees with its identity": (v) => {
        v.active_pc.entity_id = B;
      },
    };
    for (const [name, edit] of Object.entries(edits)) {
      const r = await s.campaign.store.commit(rawHandover(s, 50, A, edit));
      expect(r.ok, name).toBe(false);
    }
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the wrong actor fails closed: the compilation and the coupling are the same actor's own", () => {
  it("another actor that is compiled but not coupled, or coupled but not compiled, is refused; this actor's coupling is never borrowed", async () => {
    const s = await ready();
    await establishActorBasis(s, 2, B, C);
    await must(compileExistingActor(s, 2, existingActorContract(B, [actorBasisPin(B, C)])));
    await expectRefused(s, () => handoverActor(s, 1, B), "PREREQUISITE_MISSING");
    await must(coupleActor(s, 2, B));
    // B is coupled and compiled now: lawful in itself, and unaffected by A
    expect(s.campaign.existingActorCoupling(B)).toBeDefined();
    expect(s.campaign.binding()).toBeUndefined();
  });

  it("a raw binding naming one actor with another actor's coupling, contract or sources is refused", async () => {
    const s = await ready();
    await establishActorBasis(s, 2, B, C);
    await must(coupleActor(s, 2, B));
    await must(compileExistingActor(s, 2, existingActorContract(B, [actorBasisPin(B, C)])));
    const edits: Record<string, (v: any) => void> = {
      "B named, A's coupling migrated": (v) => {
        v.active_pc = { fact_key: pcExistenceContractKey(B), entity_id: B };
      },
      "A named, B's coupling migrated": (v) => {
        v.intrinsic_authority_migration[0].fact_key = worldActorCouplingKey(B);
      },
      "A named, B's source migrated": (v) => {
        v.intrinsic_authority_migration[1].fact_key = actorCapabilityBasisKey(B, C);
      },
      "A's pins taken from B's compilation": (v) => {
        v.transition.basis.pinned_versions.coupling = 2;
      },
    };
    for (const [name, edit] of Object.entries(edits)) {
      const r = await s.campaign.store.commit(rawHandover(s, 50, A, edit));
      expect(r.ok, name).toBe(false);
    }
    expect(s.campaign.binding()).toBeUndefined();
  });

  it("a freshly generated PC — a PLAYER-AUTHORED contract, no coupling, no actor state — cannot be handed over", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(5),
        contract: fixtureContract({ pc_id: B }),
      }),
    );
    await expectRefused(s, () => handoverActor(s, 1, B), "PREREQUISITE_MISSING");
    const r = await s.campaign.store.commit(rawHandover(s, 50, B));
    expect(!r.ok && r.error.code).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.binding()).toBeUndefined();
  });
});

describe("a stale or fabricated basis fails closed", () => {
  const cases: Record<string, [(v: any) => void, string, RegExp?]> = {
    "contract pin stale": [
      (v) => (v.transition.basis.pinned_versions.pc = 2),
      "REFERENCE_INVALID",
      /versions/,
    ],
    "contract pin zero": [
      (v) => (v.transition.basis.pinned_versions.pc = 0),
      "REFERENCE_INVALID",
      /versions/,
    ],
    "world pin stale": [
      (v) => (v.transition.basis.pinned_versions.world = 2),
      "REFERENCE_INVALID",
      /versions/,
    ],
    "locus pin stale": [
      (v) => (v.transition.basis.pinned_versions.locus = 2),
      "REFERENCE_INVALID",
      /versions/,
    ],
    "coupling pin stale": [
      (v) => (v.transition.basis.pinned_versions.coupling = 2),
      "REFERENCE_INVALID",
      /versions/,
    ],
    "coupling pin zero": [
      (v) => (v.transition.basis.pinned_versions.coupling = 0),
      "REFERENCE_INVALID",
      /versions/,
    ],
    "coupling migration version stale": [
      (v) => (v.intrinsic_authority_migration[0].version = 2),
      "REFERENCE_INVALID",
      /migration/,
    ],
    "source migration version stale": [
      (v) => (v.intrinsic_authority_migration[1].version = 2),
      "REFERENCE_INVALID",
      /migration/,
    ],
    "source migration omitted": [
      (v) => v.intrinsic_authority_migration.splice(1, 1),
      "REFERENCE_INVALID",
      /migration/,
    ],
    "coupling migration omitted": [
      (v) => v.intrinsic_authority_migration.splice(0, 1),
      "REFERENCE_INVALID",
      /migration/,
    ],
    "migration reordered": [
      (v) => v.intrinsic_authority_migration.reverse(),
      "REFERENCE_INVALID",
      /migration/,
    ],
    "extra migrated reference to a fact that exists": [
      (v) =>
        v.intrinsic_authority_migration.push({
          owner: "world_state",
          fact_key: worldProfileKey(W),
          version: 1,
        }),
      "REFERENCE_INVALID",
      /migration/,
    ],
    "extra migrated reference to a fact that does not exist": [
      (v) =>
        v.intrinsic_authority_migration.push({
          owner: "named_actor",
          fact_key: actorCapabilityBasisKey(A, "capability-never"),
          version: 1,
        }),
      "PREREQUISITE_MISSING",
    ],
    "source migrated under another owner": [
      (v) => (v.intrinsic_authority_migration[1].owner = "world_state"),
      "REFERENCE_INVALID",
      /migration/,
    ],
  };
  for (const [name, [edit, code, message]] of Object.entries(cases)) {
    it(`${name}: refused by a raw store.commit, leaving no trace`, async () => {
      const s = await ready();
      await expectRefused(
        s,
        () => s.campaign.store.commit(rawHandover(s, 50, A, edit)) as never,
        code,
        message,
      );
    });
  }

  it("a raw handover that does not read and depend on what it consumes is refused: the pins are not decoration", async () => {
    const s = await ready();
    const lawful = rawHandover(s, 50, A);
    const droppedRead = (key: string): CommitGroup => ({
      ...lawful,
      reads: lawful.reads.filter((r) => r.key !== key),
    });
    for (const key of [
      contractKey,
      worldProfileKey(W),
      worldLocusKey(W, L),
      couplingKey,
      actorCapabilityBasisKey(A, C),
    ]) {
      const r = await s.campaign.store.commit(droppedRead(key));
      expect(!r.ok && r.error.code, key).toBe("REFERENCE_INVALID");
    }
    const noDeps = await s.campaign.store.commit({ ...lawful, depends_on: [] });
    expect(!noDeps.ok && noDeps.error.code).toBe("REFERENCE_INVALID");
    expect(s.campaign.binding()).toBeUndefined();
    // the same group, unedited, is the lawful handover
    await must(s.campaign.store.commit(lawful));
    expect(s.campaign.binding()!.value.transition.type).toBe(EXISTING_ACTOR_HANDOVER);
  });

  it("a stale compilation fails closed: pins to state the actor does not own, or at another version, cannot be handed over", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(coupleActor(s, 1));
    // a compilation can only be committed over the actor's own exact state
    const stale = await compileExistingActor(
      s,
      1,
      existingActorContract(A, [actorBasisPin(A, C, 2)]),
    );
    expect(stale.ok).toBe(false);
    const foreign = await compileExistingActor(
      s,
      2,
      existingActorContract(A, [actorBasisPin(B, C)]),
    );
    expect(foreign.ok).toBe(false);
    await expectRefused(s, () => handoverActor(s, 1), "PREREQUISITE_MISSING");
  });

  it("a coupling whose own actor state moved to another source does not change the lawful handover: the migration is the coupling plus the compilation's sources", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await establishActorBasis(s, 2, A, D);
    await must(coupleActor(s, 1, A, { actor_state: [actorBasisPin(A, C)] }));
    await must(compileExistingActor(s, 1, existingActorContract(A, [actorBasisPin(A, D)])));
    await must(handoverActor(s, 1));
    expect(s.campaign.binding()!.value.intrinsic_authority_migration).toEqual([
      { owner: "world_state", fact_key: couplingKey, version: 1 },
      actorBasisPin(A, D),
    ]);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the schema is closed: nothing but the one handover transition and its exact references is representable", () => {
  const closed: Record<string, [(v: any) => void, string]> = {
    "a player-authored insertion statement": [
      (v) => (v.transition.basis.statement = "SYNTHETIC: where the player says they are"),
      "VALUE_INVALID",
    ],
    "an activation bridge": [
      (v) => (v.transition.basis.bridge = "NATIVE_ALREADY_THERE"),
      "VALUE_INVALID",
    ],
    "a copied capability": [
      (v) => (v.intrinsic_authority_migration[1].marker = "S"),
      "VALUE_INVALID",
    ],
    "an embedded copy of the coupling": [
      (v) => (v.transition.basis.coupling = { locus: "elsewhere" }),
      "VALUE_INVALID",
    ],
    "a second locus": [(v) => (v.coupling.second_locus = {}), "VALUE_INVALID"],
    "a binding mode": [(v) => (v.binding_mode = "DEFERRED"), "VALUE_INVALID"],
    "a prior binding": [
      (v) => (v.prior_binding = { fact_key: contractKey, entity_id: A }),
      "VALUE_INVALID",
    ],
    "a replacement binding": [
      (v) => (v.replacement_binding = { fact_key: contractKey, entity_id: A }),
      "VALUE_INVALID",
    ],
    "an empty migration": [(v) => (v.intrinsic_authority_migration = []), "VALUE_INVALID"],
    "the same reference twice": [
      (v) => v.intrinsic_authority_migration.push({ ...v.intrinsic_authority_migration[0] }),
      "VALUE_INVALID",
    ],
    "a first ACTIVATION carrying the handover's migration": [
      (v) => {
        v.transition = {
          type: "ACTIVATION",
          basis: {
            bridge: "NATIVE_ALREADY_THERE",
            established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
            authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
            statement: "SYNTHETIC: an authored statement",
            pinned_versions: { pc: 1, world: 1, locus: 1 },
          },
        };
      },
      "VALUE_INVALID",
    ],
    "a handover carrying an ACTIVATION basis": [
      (v) => {
        v.transition.basis = {
          bridge: "NATIVE_ALREADY_THERE",
          established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
          authored_under: { role: "role.player", permission: "permission.player_choice.commit" },
          statement: "SYNTHETIC: an authored statement",
          pinned_versions: { pc: 1, world: 1, locus: 1, coupling: 1 },
        };
      },
      "VALUE_INVALID",
    ],
    "another transition kind": [(v) => (v.transition.type = "RELEASE"), "VALUE_INVALID"],
    "a persona writer": [
      (v) => (v.writer = { role: "role.player", permission: "permission.player_choice.commit" }),
      "VALUE_INVALID",
    ],
  };
  for (const [name, [edit, code]] of Object.entries(closed)) {
    it(`${name} is not representable: ${code}`, async () => {
      const s = await ready();
      await expectRefused(
        s,
        () => s.campaign.store.commit(rawHandover(s, 50, A, edit)) as never,
        code,
      );
    });
  }

  it("the owner path accepts identities only: an insertion fact, placement or unknown field is INPUT_INVALID", async () => {
    const s = await ready();
    for (const extra of [
      { insertion: { bridge: "NATIVE_ALREADY_THERE" } },
      { placement: { locus_id: L } },
      { coupling: { world: W } },
      { binding_mode: "DEFERRED" },
      { capability: "capability-metalworking" },
    ])
      await expectRefused(
        s,
        () => s.campaign.handoverExistingActor({ ...handoverInput(1), ...extra } as never),
        "INPUT_INVALID",
      );
    await expectRefused(s, () => handoverActor(s, 1, "bad/id"), "INPUT_INVALID");
    await expectRefused(s, () => handoverActor(s, 1, A, { world_id: "" }), "INPUT_INVALID");
  });
});

describe("the handover writes exactly the binding: it reaches no other owner and no other write", () => {
  it("a handover group that also writes another fact, or that is written under another owner, is refused", async () => {
    const s = await ready();
    const lawful = rawHandover(s, 50, A);
    const extra = await s.campaign.store.commit({
      ...lawful,
      writes: [
        ...lawful.writes,
        {
          ...lawful.writes[0]!,
          key: actorCapabilityBasisKey(A, "capability-smuggled"),
          owner: "named_actor",
          facet: "actor_profile",
        },
      ],
    });
    expect(extra.ok).toBe(false);
    const foreignOwner = await s.campaign.store.commit({
      ...lawful,
      owner: "named_actor",
      facet: "actor_profile",
    });
    expect(foreignOwner.ok).toBe(false);
    const wrongAuthority = await s.campaign.store.commit({
      ...lawful,
      authority: { role: "role.player", permission: "permission.player_choice.commit" } as never,
    });
    expect(!wrongAuthority.ok && wrongAuthority.error.code).toBe("AUTHORITY_DENIED");
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a Role Registry write cannot also be used to author, close or move actor capability: only the binding key space exists", async () => {
    const s = await ready();
    const lawful = rawHandover(s, 50, A);
    const rogue = await s.campaign.store.commit({
      ...lawful,
      writes: [{ ...lawful.writes[0]!, key: `${PLAYER_CHARACTER_BINDING_KEY}/migration` }],
    });
    expect(!rogue.ok && rogue.error.code).toBe("KEY_NOT_ADMITTED");
  });
});

describe("after the handover nothing re-opens the cutover", () => {
  it("a second handover, an ordinary activation and a rival fresh contract are all refused; the first binding stands", async () => {
    const s = await ready();
    await must(handoverActor(s, 1));
    const fact = structuredClone(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!);
    expect(await codeOf(handoverActor(s, 2))).toBe("VERSION_CONFLICT");
    const rawAgain = await s.campaign.store.commit(rawHandover(s, 51, A));
    expect(rawAgain.ok).toBe(false);
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toEqual(fact);
    // the existing Existence Contract is sealed: the actor cannot be re-authored as a fresh PC
    const rival = await s.campaign.releasePlayerCharacter({
      ...publication(60),
      contract: fixtureContract({ pc_id: A }),
    });
    expect(rival.ok).toBe(false);
    expect(s.campaign.verify()).toEqual([]);
  });
});
