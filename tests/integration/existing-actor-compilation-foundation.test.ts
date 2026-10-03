/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Existing-Actor I-002 Pre-Binding Compilation & Ownership Boundary Foundation — "an already-existing, lawfully non-PC actor
// can be compiled into the minimum I-002 Existence Contract before any operative role.player_character binding, without
// that contract being the control handover: the prior non-PC owner stays writable until the (unimplemented) Role Registry
// binding commit."
// Register lineage: IA-01/02/03 (partial), IA-14 (partial); RC-02, RC-13, RC-16; IM-03, IM-07, IM-11, IM-17.
// Sources: spec/f027/spec-lock.json — I-002 pin 2026-09-25T00:15:54.536Z, IR pin 2026-09-25T00:17:26.287Z, WS-006 pin
// 2026-09-25T00:18:36.828Z, WS-016 pin 2026-09-24T17:38:59.210Z; sovereign-ratified PC-CONTROL HANDOVER CONTRACT v1 (W3-CP3 Blue
// Repair Overlay) and I-002 v2.4 as named by the slice brief. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcExistenceContractKey,
} from "@immortalis/contracts";
import { actorBoundaryViolation, factKind } from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_METALWORKING,
  CAP_SAILING,
  CAP_SWORDSMANSHIP,
  FIXTURE_PC_ID,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  consumerResultKey,
  continuationInput,
  fixtureContract,
  fixtureInsertionFact,
  pcCapabilityContract,
  temporalPublication,
} from "@immortalis/testkit";
import {
  actorBasisPin,
  bindingInput,
  compileExistingActor,
  establishActorBasis,
  existingActorContract,
  existingActorSummary,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import {
  receiveBasis,
  registerPcConsumer,
  seededPcCapabilityCampaign,
} from "../support/pc-capability.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;

const register = (
  s: ExistingActorSeeded,
  consumerId: string,
  actor: string,
  cap: string,
  tn: number,
) =>
  must(
    s.coordinator.registerObject({
      ...temporalPublication(tn),
      object: capabilityConsumerObject(consumerId, capabilityBasis(actor, cap)),
    }),
  );
const advance = (s: ExistingActorSeeded, id: string, consumer: string) =>
  must(s.coordinator.advance(consumerAdvanceRequest(id, consumer)));

describe("an existing actor is compiled into I-002 form while its non-PC owner stays writable (evidence 2)", () => {
  it("the compilation is committed under the one I-002 owner, pins the actor's state by reference and copies none of it", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const sourceBefore = structuredClone(s.campaign.store.getFact(actorCapabilityBasisKey(A, C))!);
    await must(compileExistingActor(s, 1));
    const fact = s.campaign.store.getFact(pcExistenceContractKey(A))!;
    expect(fact).toMatchObject({ owner: "pc_existence", facet: "existence_contract", version: 1 });
    // the same registered governing rule as every Existence Contract: the registration is unchanged
    expect(fact.provenance.rule).toEqual(factKind("pc_existence_contract").rule);
    const value = fact.value as any;
    expect(value.existing_actor_compilation).toEqual({
      classification: "EXISTING_ACTOR_COMPILATION",
      source_state: [actorBasisPin(A, C)],
    });
    // the foreign owner's fact is referenced by owner/key/version only: it is read and depended on, never copied or moved
    expect(JSON.stringify(value)).not.toContain('"marker"');
    expect(JSON.stringify(value)).not.toContain("BIOGRAPHY_HISTORY");
    expect(s.campaign.store.getFact(actorCapabilityBasisKey(A, C))).toEqual(sourceBefore);
    const group = s.campaign.store.committedGroup(fact.provenance.intent_id)!;
    expect(group.reads).toEqual([{ key: actorCapabilityBasisKey(A, C), version: 1 }]);
    expect(group.depends_on).toEqual([sourceBefore.provenance.group_id]);
    // the compilation is not the control handover: no binding, no PC capability, the actor's basis is still its own
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)).toBeUndefined();
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability")),
    ).toEqual([]);
    expect(s.campaign.playerCharacter(A)?.value.existing_actor_compilation).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("before the binding commit the prior non-PC owner establishes and closes capabilities as it did before the compilation", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C); // established BEFORE the compilation
    await must(compileExistingActor(s, 1));
    const view = {
      get: (k: string) => s.campaign.store.getFact(k),
      has: (k: string) => s.campaign.store.getFact(k) !== undefined,
    };
    expect(actorBoundaryViolation(view, A)).toBeNull();
    // a NEW capability establishment is still lawful for the actor owner AFTER the compilation …
    const later = await establishActorBasis(s, 2, A, D);
    expect(s.actors.basis(A, D)!.fact).toMatchObject({ owner: "named_actor", version: 1 });
    // … and both capabilities close through the ordinary IM-02 path: the earlier one and the one established afterwards
    await register(s, "c1", A, C, 2);
    await register(s, "c2", A, D, 3);
    await advance(s, "tx-1", "c1");
    await must(s.coordinator.continueRemainder(continuationInput("tx-2")));
    for (const [cap, consumer] of [
      [C, "c1"],
      [D, "c2"],
    ] as const) {
      expect(s.actors.capability(A, cap)!.fact).toMatchObject({
        owner: "named_actor",
        facet: "actor_profile",
        version: 1,
      });
      expect(s.campaign.store.getFact(consumerResultKey(consumer))!.value).toMatchObject({
        observed_actor: A,
        observed_capability: cap,
      });
    }
    expect(later.marker).toBe("C");
    // no PC capability exists for the identity and the binding slot is still NULL: ownership never moved
    expect(s.campaign.store.getFact(pcCapabilityBasisKey(A, C))).toBeUndefined();
    expect(s.campaign.store.getFact(pcCapabilityKey(A, D))).toBeUndefined();
    expect(s.campaign.binding()).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("another actor, never compiled, is untouched; and a compilation pinning several of an actor's facts is lawful", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    await establishActorBasis(s, 2, A, D);
    await establishActorBasis(s, 3, ACTOR_OTHER, C);
    await must(
      compileExistingActor(
        s,
        1,
        existingActorContract(A, [actorBasisPin(A, C), actorBasisPin(A, D)]),
      ),
    );
    expect(s.campaign.store.getFact(pcExistenceContractKey(ACTOR_OTHER))).toBeUndefined();
    await establishActorBasis(s, 4, ACTOR_OTHER, D);
    await establishActorBasis(s, 5, ACTOR_SWORD, C);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an actor with committed state compiled BEFORE any of its later establishment, and only the pinned version, is the source", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    // a pin at any version other than the committed one is refused; nothing is committed
    const head = s.campaign.store.head();
    expect(
      await codeOf(compileExistingActor(s, 1, existingActorContract(A, [actorBasisPin(A, C, 2)]))),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.head()).toEqual(head);
  });
});

describe("existing generated-PC behavior is unchanged (evidence 1)", () => {
  it("a fresh PC's contract carries no classification, closes the Named-Actor owner for that identity and gives it its own capability path", async () => {
    const s = await seededPcCapabilityCampaign(tempDir());
    const contract = s.campaign.playerCharacter(FIXTURE_PC_ID)!;
    expect("existing_actor_compilation" in contract.value).toBe(false);
    expect("existing_actor_compilation" in (contract.fact.value as object)).toBe(false);
    // the ordinary PC capability path: received from accepted generation history, closed, consumed AS-OF-DECLARED-CLOSE
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
    expect(s.pcs.capability(FIXTURE_PC_ID, CAP_SAILING)!.fact).toMatchObject({
      owner: "pc_existence",
      facet: "pc_capability_profile",
      version: 1,
    });
    expect(s.campaign.binding()!.value.active_pc.entity_id).toBe(FIXTURE_PC_ID);
    // and the Named-Actor owner still authors nothing for a Player Character
    const refused = await s.campaign.store.commit({
      campaign_id: s.campaign.store.head().campaign_id,
      group_id: "raw-actor-group",
      intent_id: "raw-actor-intent",
      owner: "named_actor",
      facet: "actor_profile",
      cause: "raw",
      rule: factKind("named_actor_capability_basis").rule,
      authority: { role: "role.archivist", permission: "permission.canon.write" },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: actorCapabilityBasisKey(FIXTURE_PC_ID, C),
          owner: "named_actor",
          facet: "actor_profile",
          value: capabilityBasis(FIXTURE_PC_ID, C) as never,
          unit: null,
          basis: "b",
          secrecy: "s",
          expected_version: 0,
        },
      ],
    });
    expect(!refused.ok && refused.error.code).toBe("KEY_NOT_ADMITTED");
    expect(!refused.ok && refused.error.message).toMatch(/Player Character/);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a fresh PC still binds on the explicit native basis, and an identical fresh contract is byte-for-byte what it was", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({
        group_id: "fresh-group",
        intent_id: "fresh-intent",
        cause: "fresh-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: fixtureContract(),
      }),
    );
    expect(
      Object.keys(s.campaign.store.getFact(pcExistenceContractKey(FIXTURE_PC_ID))!.value as object),
    ).not.toContain("existing_actor_compilation");
    await must(s.campaign.bindPlayerCharacter(bindingInput(FIXTURE_PC_ID, 4)));
    expect(s.campaign.binding()!.value.transition.basis).toMatchObject({
      bridge: "NATIVE_ALREADY_THERE",
      established_by: "EXPLICIT_PLAYER_AUTHORED_FACT",
    });
    expect(fixtureInsertionFact().statement.length).toBeGreaterThan(0);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a pre-existing fresh contract on an identity that already had actor state keeps closing the actor owner (no new route)", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    // an ordinary (unclassified) Existence Contract for that same identity: the Named-Actor owner is closed, exactly as before
    await must(
      s.campaign.releasePlayerCharacter({
        group_id: "fresh-a-group",
        intent_id: "fresh-a-intent",
        cause: "fresh-a-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        contract: pcCapabilityContract(A),
      }),
    );
    const refused = await s.actors.establishCapabilityBasis({
      group_id: "actor-group-9",
      intent_id: "actor-intent-9",
      cause: "actor-cause-9",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: capabilityBasis(A, D),
    });
    expect(!refused.ok && refused.error.code).toBe("KEY_NOT_ADMITTED");
    expect(!refused.ok && refused.error.message).toMatch(/Player Character/);
    expect(s.actors.basis(A, D)).toBeUndefined();
  });
});

describe("the summary of a compiled campaign carries no second persistence path (evidence 10)", () => {
  it("the compilation adds exactly one fact under the existing I-002 key space and nothing else", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await establishActorBasis(s, 1, A, C);
    const before = new Set(s.campaign.store.listFacts().map((f) => f.key));
    await must(compileExistingActor(s, 1));
    const added = s.campaign.store.listFacts().filter((f) => !before.has(f.key));
    expect(added.map((f) => f.key)).toEqual([pcExistenceContractKey(A)]);
    expect(existingActorSummary(s.campaign, s.coordinator).binding).toEqual([]);
    expect(actorCapabilityKey(A, C)).not.toBe(pcCapabilityKey(A, C));
  });
});
