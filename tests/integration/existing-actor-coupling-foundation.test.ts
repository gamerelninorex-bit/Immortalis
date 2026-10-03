/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Existing-Actor World-State Coupling Anchor Foundation — "the engine can already establish that an actor exists and that a
// world/locus exists; this slice adds the authoritative World-State fact that ONE already-existing, lawfully non-PC actor is
// currently coupled to ONE established locus of ONE established world — a prerequisite only: it binds no PC and moves no
// ownership."
// Register lineage: IA-01/02/03 (partial), IA-14 (partial); RC-02, RC-13, RC-16; IM-03, IM-07, IM-11, IM-17.
// Sources: spec/f027/spec-lock.json — WG pin 2026-09-25T13:44:22.668Z (Ownership Guards — F-016 Ratified Fallback Objective
// Physical-Entity Custody), WS-006 / F-014A pin 2026-09-25T00:18:36.828Z (v3.3 §6 Two-Target Write Rule), IR pin
// 2026-09-25T00:17:26.287Z (§5 item 3, §17), I-002 pin 2026-09-25T00:15:54.536Z (§4.3), WS-016 pin 2026-09-24T17:38:59.210Z;
// PC-CONTROL HANDOVER CONTRACT v1 (observed pin 2026-09-25T00:16:16.544Z) as the seam rule. Local success is NOT
// provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  FALLBACK_BASIS,
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import { WORLD_ACTOR_COUPLING_RULE, actorBoundaryViolation, factKind } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  consumerResultKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  actorBasisPin,
  bindingInput,
  coupleActor,
  compileExistingActor,
  establishActorBasis,
  seededExistingActorCampaign,
  existingActorSummary,
} from "../support/existing-actor.ts";
import { seededPcCapabilityCampaign } from "../support/pc-capability.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const couplingKey = worldActorCouplingKey(A);

describe("an existing non-PC actor is coupled to an established locus by the World-State custodian", () => {
  it("one sealed fact under the World-State fallback custodian pins the actor's own state, the world and the locus by reference", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const source = structuredClone(s.campaign.store.getFact(actorCapabilityBasisKey(A, C))!);
    const world = structuredClone(s.campaign.store.getFact(worldProfileKey(FIXTURE_WORLD_ID))!);
    const locus = structuredClone(
      s.campaign.store.getFact(worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))!,
    );
    const outcome = await must(coupleActor(s, 1));
    expect(outcome.replayed).toBe(false);

    const fact = s.campaign.store.getFact(couplingKey)!;
    // the lawful World-State/fallback custodian owns it: the same owner and facet as the fallback entity and its transition
    expect(fact).toMatchObject({
      owner: "world_state",
      facet: "world_fallback_physical_entity",
      version: 1,
    });
    expect(fact.provenance.rule).toEqual(factKind("world_actor_coupling").rule);
    expect(fact.provenance.rule).toEqual(WORLD_ACTOR_COUPLING_RULE);
    expect(fact.value).toEqual({
      actor_id: A,
      actor_state: [actorBasisPin(A, C)],
      coupling: {
        world: { fact_key: worldProfileKey(FIXTURE_WORLD_ID), entity_id: FIXTURE_WORLD_ID },
        locus: {
          fact_key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID),
          entity_id: FIXTURE_LOCUS_ID,
        },
      },
      pinned_versions: { world: 1, locus: 1 },
      custodian: {
        owner: "world_state",
        facet: "world_fallback_physical_entity",
        basis: FALLBACK_BASIS,
      },
    });
    // actor identity is exact across the source state, the key and the fact
    expect(couplingKey).toBe(`world-state/actor/${A}/coupling`);
    expect((fact.value as any).actor_id).toBe(A);
    expect(
      (fact.value as any).actor_state.every((p: any) => p.fact_key.includes(`actor/${A}/`)),
    ).toBe(true);

    // foreign state is REFERENCED (read at the exact version, group depended on), never copied or touched
    const group = s.campaign.store.committedGroup(fact.provenance.intent_id)!;
    expect(group.reads).toEqual([
      { key: actorCapabilityBasisKey(A, C), version: 1 },
      { key: worldProfileKey(FIXTURE_WORLD_ID), version: 1 },
      { key: worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID), version: 1 },
    ]);
    expect(group.depends_on).toEqual([
      source.provenance.group_id,
      world.provenance.group_id,
      locus.provenance.group_id,
    ]);
    expect(group.writes).toHaveLength(1);
    expect(JSON.stringify(fact.value)).not.toContain('"marker"');
    expect(JSON.stringify(fact.value)).not.toContain("designation");
    expect(s.campaign.store.getFact(actorCapabilityBasisKey(A, C))).toEqual(source);
    expect(s.campaign.store.getFact(worldProfileKey(FIXTURE_WORLD_ID))).toEqual(world);
    expect(s.campaign.store.getFact(worldLocusKey(FIXTURE_WORLD_ID, FIXTURE_LOCUS_ID))).toEqual(
      locus,
    );

    // typed read by identity; and the whole campaign still verifies
    expect(s.campaign.existingActorCoupling(A)!.value.coupling.locus.entity_id).toBe(
      FIXTURE_LOCUS_ID,
    );
    expect(s.campaign.existingActorCoupling(ACTOR_OTHER)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("it is only a prerequisite: no PC contract, binding or PC capability is written and no actor state is moved", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const before = existingActorSummary(s.campaign, s.coordinator);
    await must(coupleActor(s, 1));
    const after = existingActorSummary(s.campaign, s.coordinator);
    expect(after.binding).toEqual([]);
    expect(after.contract).toEqual([]);
    expect(after.pc_capability).toEqual([]);
    expect(after.actor).toEqual(before.actor);
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
    expect(s.campaign.store.getFact(pcExistenceContractKey(A))).toBeUndefined();
    // exactly one new fact: the coupling
    expect(s.campaign.store.listFacts().length).toBe(before.receipts.length + 1);
  });

  it("creating the coupling does not close the Named-Actor owner: the prior owner writes before and after, and closes capabilities as before", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(coupleActor(s, 1));
    const view = {
      get: (k: string) => s.campaign.store.getFact(k),
      has: (k: string) => s.campaign.store.getFact(k) !== undefined,
    };
    expect(actorBoundaryViolation(view, A)).toBeNull();
    const later = await establishActorBasis(s, 2, A, D);
    expect(s.actors.basis(A, D)!.fact).toMatchObject({ owner: "named_actor", version: 1 });
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: capabilityConsumerObject("c1", later),
      }),
    );
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
    expect(s.actors.capability(A, D)!.fact).toMatchObject({
      owner: "named_actor",
      facet: "actor_profile",
    });
    expect(s.campaign.store.getFact(consumerResultKey("c1"))!.value).toMatchObject({
      observed_actor: A,
      observed_capability: D,
    });
    // the actor's capability state is the actor owner's, still: nothing was moved to the PC owner
    expect(s.campaign.store.getFact(pcCapabilityBasisKey(A, C))).toBeUndefined();
    expect(s.campaign.store.getFact(pcCapabilityKey(A, D))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an actor may be coupled by a source that is its capability close as well as its basis, and several sources are one coupling", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await establishActorBasis(s, 2, A, D);
    await must(coupleActor(s, 1, A, { actor_state: [actorBasisPin(A, C), actorBasisPin(A, D)] }));
    expect(s.campaign.existingActorCoupling(A)!.value.actor_state).toHaveLength(2);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("another existing actor has its own slot: two actors may be coupled to the same locus, each with exactly one current locus", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await establishActorBasis(s, 2, ACTOR_OTHER, C);
    await must(coupleActor(s, 1, A));
    await must(coupleActor(s, 2, ACTOR_OTHER));
    for (const id of [A, ACTOR_OTHER])
      expect(s.campaign.store.getFact(worldActorCouplingKey(id))!.version).toBe(1);
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("world-state/actor/")),
    ).toHaveLength(2);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the coupling is a prerequisite the existing-actor seam composes with, never a replacement for it", () => {
  it("a coupled actor may still be compiled into I-002 form, and the compilation is still refused by ordinary activation", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(coupleActor(s, 1));
    await must(compileExistingActor(s, 1));
    const bound = await s.campaign.bindPlayerCharacter(bindingInput(A, 4));
    expect(!bound.ok && bound.error.code).toBe("REFERENCE_INVALID");
    // still one coupling at version 1: neither the compilation nor the refused binding touched it
    expect(s.campaign.store.getFact(couplingKey)!.version).toBe(1);
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an actor compiled FIRST may be coupled afterwards (the actor is still under lawful non-PC ownership until a binding)", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(compileExistingActor(s, 1));
    await must(coupleActor(s, 1));
    expect(s.campaign.existingActorCoupling(A)).toBeDefined();
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("existing behavior is unchanged", () => {
  it("fresh-PC activation still binds on the explicit native basis and gains no coupling; the PC owns its capability path", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    expect(s.campaign.binding()!.value.active_pc.entity_id).toBe(FIXTURE_PC_ID);
    expect(s.campaign.store.getFact(worldActorCouplingKey(FIXTURE_PC_ID))).toBeUndefined();
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("world-state/"))).toEqual(
      [],
    );
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a fresh PC identity cannot be coupled as an existing actor, and activation of a never-coupled fresh PC is untouched", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const head = s.campaign.store.head();
    expect(
      await codeOf(
        s.campaign.coupleExistingActor({
          group_id: "couple-group-x",
          intent_id: "couple-intent-x",
          cause: "couple-cause-x",
          basis: "fixture-basis",
          secrecy: "fixture-visibility",
          actor_id: FIXTURE_PC_ID,
          world_id: FIXTURE_WORLD_ID,
          locus_id: FIXTURE_LOCUS_ID,
          actor_state: [actorBasisPin(FIXTURE_PC_ID)],
        }),
      ),
    ).toBe("PREREQUISITE_MISSING"); // a fresh PC has no Named-Actor state to rest a coupling on
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("the capability fixtures are not consulted: building the basis does not require a coupling", async () => {
    expect(capabilityBasis(A, C).actor_id).toBe(A);
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    expect(s.campaign.store.getFact(couplingKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});
