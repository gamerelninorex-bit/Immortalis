// Existing-Actor → PC Role Registry Handover Cutover Foundation (thirty-first bounded slice) — "the engine could already compile an
// existing non-PC actor into the minimum I-002 form and hold its authoritative World-State coupling; this slice adds the ONE
// Role Registry binding commit that is the control/writability cutover for that actor: distinct from fresh activation, it consumes
// the actor's own committed coupling as the world/locus basis, migrates exact references and moves no capability."
// Register lineage: IA-01/02/03/14 (partial); RC-02, RC-13, RC-16; IM-03, IM-07, IM-11, IM-17.
// Sources: spec/f027/spec-lock.json — IR pin 2026-09-25T00:17:26.287Z (§5 item 3, §6 Step 6, §17), I-002 pin
// 2026-09-25T00:15:54.536Z, WS-006 / F-014A pin 2026-09-25T00:18:36.828Z (v3.3 + W3-CP3 interface note), WG pin
// 2026-09-25T13:44:22.668Z, WS-016 pin 2026-09-24T17:38:59.210Z; PC-CONTROL HANDOVER CONTRACT v1 (observed pin
// 2026-09-25T00:16:16.544Z) as the seam rule. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  EXISTING_ACTOR_HANDOVER,
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcExistenceContractKey,
  worldActorCouplingKey,
  worldLocusKey,
  worldProfileKey,
} from "@immortalis/contracts";
import { actorBoundaryViolation, factKind } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  FIXTURE_LOCUS_ID,
  FIXTURE_PC_ID,
  FIXTURE_WORLD_ID,
  actorPublication,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  CAP_SAILING,
  fixtureContract,
  pcCapabilityBasis,
  temporalPublication,
} from "@immortalis/testkit";
import {
  actorBasisPin,
  bindingInput,
  compileExistingActor,
  coupleActor,
  establishActorBasis,
  existingActorSummary,
  handoverActor,
  readyForHandover,
  seededExistingActorCampaign,
} from "../support/existing-actor.ts";
import { seededPcCapabilityCampaign } from "../support/pc-capability.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const W = FIXTURE_WORLD_ID;
const L = FIXTURE_LOCUS_ID;
const couplingKey = worldActorCouplingKey(A);
const contractKey = pcExistenceContractKey(A);

describe("a compiled, coupled existing actor is handed over to the player by one Role Registry binding commit", () => {
  it("the binding is a distinct EXISTING_ACTOR_HANDOVER transition whose world and locus are the committed coupling's, with migration by exact reference", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    const sourceKey = actorCapabilityBasisKey(A, C);
    const keysBefore = new Set(s.campaign.store.listFacts().map((f) => f.key));
    const outcome = await must(handoverActor(s, 1));
    expect(outcome.replayed).toBe(false);

    const fact = s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
    expect(fact).toMatchObject({ owner: "role_registry", facet: "player_character_binding" });
    expect(fact.version).toBe(1);
    expect(fact.value).toEqual({
      binding_slot: "role.player_character",
      active_pc: { fact_key: contractKey, entity_id: A },
      coupling: {
        world: { fact_key: worldProfileKey(W), entity_id: W },
        locus: { fact_key: worldLocusKey(W, L), entity_id: L },
      },
      transition: {
        type: EXISTING_ACTOR_HANDOVER,
        basis: { pinned_versions: { pc: 1, world: 1, locus: 1, coupling: 1 } },
      },
      prior_binding: null,
      replacement_binding: null,
      // exact references to already-established authoritative state and versions: never copies
      intrinsic_authority_migration: [
        { owner: "world_state", fact_key: couplingKey, version: 1 },
        actorBasisPin(A, C),
      ],
      writer: { role: "role.archivist", permission: "permission.canon.write" },
    });
    // the same governing rule as every binding: no citation, pin or provenance was moved
    expect(fact.provenance.rule).toEqual(factKind("player_character_binding").rule);
    // no insertion fact, bridge or player-authored statement exists anywhere in it
    const text = JSON.stringify(fact.value);
    for (const absent of [
      "statement",
      "bridge",
      "established_by",
      "NATIVE_ALREADY_THERE",
      "marker",
    ])
      expect(text).not.toContain(absent);

    // one commit group, one write; the foreign state was read at its exact version and depended on
    const group = s.campaign.store.committedGroup(fact.provenance.intent_id)!;
    expect(group.writes).toHaveLength(1);
    expect(group.reads).toEqual([
      { key: contractKey, version: 1 },
      { key: worldProfileKey(W), version: 1 },
      { key: worldLocusKey(W, L), version: 1 },
      { key: couplingKey, version: 1 },
      { key: sourceKey, version: 1 },
    ]);
    const providers = [
      contractKey,
      worldProfileKey(W),
      worldLocusKey(W, L),
      couplingKey,
      sourceKey,
    ].map((k) => s.campaign.store.getFact(k)!.provenance.group_id);
    expect(group.depends_on).toEqual(providers);

    // exactly one new fact: the binding. Nothing else was written, copied or moved.
    const added = s.campaign.store.listFacts().filter((f) => !keysBefore.has(f.key));
    expect(added.map((f) => f.key)).toEqual([PLAYER_CHARACTER_BINDING_KEY]);
    expect(s.campaign.binding()!.value.transition.type).toBe(EXISTING_ACTOR_HANDOVER);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the handover preserves every committed fact it consumed byte-for-byte: the actor's history stays provenance", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    const keys = [
      actorCapabilityBasisKey(A, C),
      couplingKey,
      contractKey,
      worldProfileKey(W),
      worldLocusKey(W, L),
    ];
    const before = keys.map((k) => structuredClone(s.campaign.store.getFact(k)!));
    const actorBefore = existingActorSummary(s.campaign, s.coordinator).actor;
    await must(handoverActor(s, 1));
    expect(keys.map((k) => s.campaign.store.getFact(k))).toEqual(before);
    expect(existingActorSummary(s.campaign, s.coordinator).actor).toEqual(actorBefore);
    // still readable through the actor owner's own typed read, owned by the actor owner
    expect(s.actors.basis(A, C)!.fact).toMatchObject({ owner: "named_actor", version: 1 });
  });

  it("the binding commit is the cutover: actor-side writes are lawful before it and refused after it, with no overlapping interval", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    const view = {
      get: (k: string) => s.campaign.store.getFact(k),
      has: (k: string) => s.campaign.store.getFact(k) !== undefined,
    };
    // before: the prior non-PC owner is still the writable owner (even after the compilation and the coupling)
    expect(actorBoundaryViolation(view, A)).toBeNull();
    await establishActorBasis(s, 2, A, D);
    expect(s.actors.basis(A, D)).toBeDefined();

    await must(handoverActor(s, 1));

    // after: the same identity is under lawful player control; the Named-Actor owner authors nothing further for it
    expect(actorBoundaryViolation(view, A)).toMatch(/lawful player-character control/);
    const head = s.campaign.store.head();
    const refused = await s.actors.establishCapabilityBasis({
      ...actorPublication(3),
      capability: capabilityBasis(A, "capability-after-handover"),
    });
    expect(!refused.ok && refused.error.code).toBe("KEY_NOT_ADMITTED");
    expect(!refused.ok && refused.error.message).toMatch(/lawful player-character control/);
    // a raw store.commit of an actor-side fact is refused identically
    const raw = await s.campaign.store.commit({
      campaign_id: s.campaign.store.head().campaign_id,
      group_id: "raw-actor-group",
      intent_id: "raw-actor-intent",
      owner: "named_actor",
      facet: "actor_profile",
      cause: "raw-actor-cause",
      rule: s.actors.basis(A, C)!.fact.provenance.rule,
      authority: { role: "role.archivist", permission: "permission.canon.write" },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: actorCapabilityBasisKey(A, "capability-after-handover"),
          owner: "named_actor",
          facet: "actor_profile",
          value: capabilityBasis(A, "capability-after-handover") as never,
          unit: null,
          basis: "fixture-basis",
          secrecy: "fixture-visibility",
          expected_version: 0,
        },
      ],
    });
    expect(!raw.ok && raw.error.code).toBe("KEY_NOT_ADMITTED");
    expect(s.campaign.store.head()).toEqual(head);
    // the history committed before the cutover — including the establishment made after the compilation — is preserved
    expect(s.actors.basis(A, C)).toBeDefined();
    expect(s.actors.basis(A, D)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("another actor is unaffected: its prior owner stays writable while this actor is bound", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    await must(handoverActor(s, 1));
    await establishActorBasis(s, 2, ACTOR_OTHER, C);
    expect(s.actors.basis(ACTOR_OTHER, C)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the handover produces no capability: existing capability is provenance only", () => {
  it("no PC capability fact, PC capability close, copy into the Role Registry or Causal Draw state is written", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    await establishActorBasis(s, 2, A, D);
    const before = s.campaign.store.listFacts().map((f) => f.key);
    await must(handoverActor(s, 1));
    const added = s.campaign.store
      .listFacts()
      .map((f) => f.key)
      .filter((k) => !before.includes(k));
    expect(added).toEqual([PLAYER_CHARACTER_BINDING_KEY]);
    const facts = s.campaign.store.listFacts();
    expect(
      facts.filter((f) => f.owner === "pc_existence" && f.facet !== "existence_contract"),
    ).toEqual([]);
    expect(facts.filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability"))).toEqual(
      [],
    );
    expect(s.campaign.store.getFact(pcCapabilityBasisKey(A, C))).toBeUndefined();
    expect(s.campaign.store.getFact(pcCapabilityKey(A, C))).toBeUndefined();
    expect(facts.filter((f) => f.owner === "causal_draw_kernel")).toEqual([]);
    // the Role Registry holds references, never the capability itself
    expect(JSON.stringify(s.campaign.binding()!.value)).not.toMatch(
      /marker|grade|capability_id|"close"/,
    );
  });

  it("the PC capability receipt over the compilation is still refused after the handover (carry-forward is a later slice)", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    await must(handoverActor(s, 1));
    const head = s.campaign.store.head();
    const r = await s.pcs.receiveCapabilityBasis({
      group_id: "pccap-group-1",
      intent_id: "pccap-intent-1",
      cause: "pccap-cause-1",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: pcCapabilityBasis(A, CAP_SAILING, {
        establishment: {
          method: "ACCEPTED_GENERATION_HISTORY",
          contract: { fact_key: contractKey, version: 1 },
          claims: [{ section: "baseline_exception.safely_inherited", index: 0 }],
        },
      }),
    });
    expect(!r.ok && r.error.message).toMatch(/compiles an already-existing actor/);
    expect(r.ok).toBe(false);
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("an actor-side capability that was established but never closed stays exactly as it was: nothing is resolved, closed or drawn at binding", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    expect(s.actors.capability(A, C)).toBeUndefined();
    await must(handoverActor(s, 1));
    expect(s.actors.capability(A, C)).toBeUndefined();
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("causal-draw"))).toEqual([]);
  });

  it("a closed actor capability and its consumer's reading survive the handover as history", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await must(coupleActor(s, 1));
    await must(compileExistingActor(s, 1));
    const later = await establishActorBasis(s, 2, A, D);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: capabilityConsumerObject("c1", later),
      }),
    );
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
    const closed = structuredClone(s.actors.capability(A, D)!.fact);
    await must(handoverActor(s, 1));
    expect(s.actors.capability(A, D)!.fact).toEqual(closed);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("ordinary fresh-PC activation is unchanged and remains distinct from the handover", () => {
  it("a freshly generated PC still binds by the first ACTIVATION on the explicit native basis, with no migration and no coupling", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const binding = s.campaign.binding()!.value;
    expect(binding.transition.type).toBe("ACTIVATION");
    expect(binding.intrinsic_authority_migration).toEqual([]);
    expect(Object.keys(binding.transition.basis).sort()).toEqual(
      ["authored_under", "bridge", "established_by", "pinned_versions", "statement"].sort(),
    );
    expect(s.campaign.store.getFact(worldActorCouplingKey(FIXTURE_PC_ID))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a freshly generated PC cannot be handed over: the handover is not a second way to activate", async () => {
    const s = await seededPcCapabilityCampaign(tempDir(), { bind: false });
    const head = s.campaign.store.head();
    expect(await codeOf(handoverActor(s, 1, FIXTURE_PC_ID))).toBe("PREREQUISITE_MISSING");
    expect(s.campaign.store.head()).toEqual(head);
    expect(s.campaign.binding()).toBeUndefined();
  });

  it("ordinary activation still refuses the compilation, and the handover does not widen it: the compiled actor binds only by handover", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    const bound = await s.campaign.bindPlayerCharacter(bindingInput(A, 4));
    expect(!bound.ok && bound.error.code).toBe("REFERENCE_INVALID");
    expect(s.campaign.binding()).toBeUndefined();
    await must(handoverActor(s, 1));
    expect(s.campaign.binding()!.value.transition.type).toBe(EXISTING_ACTOR_HANDOVER);
  });

  it("a fresh PC that is not the existing actor may bind by ordinary activation beside nothing else: the slot stays the one binding", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    await must(
      s.campaign.releasePlayerCharacter({
        group_id: "fresh-group",
        intent_id: "fresh-intent",
        cause: "fresh-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: fixtureContract({ pc_id: ACTOR_OTHER }),
      }),
    );
    await must(s.campaign.bindPlayerCharacter(bindingInput(ACTOR_OTHER, 5)));
    expect(s.campaign.binding()!.value.transition.type).toBe("ACTIVATION");
    // the existing actor can no longer be handed over: one binding slot, one active PC
    expect(await codeOf(handoverActor(s, 6))).toBe("VERSION_CONFLICT");
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the binding slot stays one: no second handover, replacement or rival binding", () => {
  it("a second handover of the same actor, and a handover after any binding, is a version conflict; the first stands", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    await must(handoverActor(s, 1));
    const fact = structuredClone(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!);
    const head = s.campaign.store.head();
    expect(await codeOf(handoverActor(s, 2))).toBe("VERSION_CONFLICT");
    expect((await s.campaign.bindPlayerCharacter(bindingInput(A, 3))).ok).toBe(false);
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toEqual(fact);
    expect(s.campaign.store.head()).toEqual(head);
  });

  it("the committed coupling cannot be re-stated or replaced after the handover", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    await must(handoverActor(s, 1));
    expect((await coupleActor(s, 9)).ok).toBe(false);
    expect(s.campaign.store.getFact(couplingKey)!.version).toBe(1);
  });

  it("the replay of the handover under its own identity is idempotent (RC-16)", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForHandover(s);
    await must(handoverActor(s, 1));
    const head = s.campaign.store.head();
    const again = await must(handoverActor(s, 1));
    expect(again.replayed).toBe(true);
    expect(s.campaign.store.head()).toEqual(head);
  });
});
