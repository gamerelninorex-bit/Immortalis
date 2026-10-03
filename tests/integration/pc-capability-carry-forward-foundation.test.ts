// Established Existing-Actor Capability → PC Capability Carry-Forward Close Foundation (thirty-second bounded slice) — "an actor
// that has lawfully undergone the EXISTING_ACTOR_HANDOVER carries one already-authoritative pre-handover Named-Actor
// capability, EXACTLY, into the one PC owner's pc_capability_profile; the existing PC Capability Close then publishes it
// through the existing temporal path. The carry-forward is its own establishment, not ACCEPTED_GENERATION_HISTORY."
// Register lineage: IA-01/02/03/14 (partial); RC-02, RC-03, RC-04, RC-13, RC-16; IM-02, IM-07, IM-11, IM-12, IM-17.
// Sources: spec/f027/spec-lock.json — WS-016 pin 2026-09-24T17:38:59.210Z (Integration Map §2 I-002 amendment; Draft §§2, 3,
// 4, 11, 25, 27.1, 28, 32), I-002 pin 2026-09-25T00:15:54.536Z, WS-006 / F-014A pin 2026-09-25T00:18:36.828Z, IR pin
// 2026-09-25T00:17:26.287Z; PC-CONTROL HANDOVER CONTRACT v1 (observed pin 2026-09-25T00:16:16.544Z) as the seam rule.
// CAL-01 stays UNCALIBRATED (EXACT only). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  type ComparativeMarker,
  actorCapabilityKey,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  pcExistenceContractKey,
} from "@immortalis/contracts";
import {
  PC_CAPABILITY_RULE,
  actorBoundaryViolation,
  derivePcCapability,
  stageGroupId,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  CAP_SWORDSMANSHIP,
  capabilityBasis,
  consumerResultKey,
} from "@immortalis/testkit";
import {
  carryForward,
  carryInput,
  closeActorCapability,
  closePcCapability,
  existingActorSummary,
  handoverActor,
  readyForCarryForward,
  seededExistingActorCampaign,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const D = CAP_SWORDSMANSHIP;
const sourceKey = actorCapabilityKey(A, C);
const basisKey = pcCapabilityBasisKey(A, C);
const capKey = pcCapabilityKey(A, C);
const facts = (s: Pick<ExistingActorSeeded, "campaign">) => ({
  get: (k: string) => s.campaign.store.getFact(k),
  has: (k: string) => s.campaign.store.getFact(k) !== undefined,
});

describe("an established actor capability is carried exactly into the PC owner and published at the PC Capability Close", () => {
  it("the full path: authoritative actor capability → handover → carry-forward → PC Capability Close → AS-OF-DECLARED-CLOSE consumption", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    const source = structuredClone(s.campaign.store.getFact(sourceKey)!);
    expect(source).toMatchObject({ owner: "named_actor", facet: "actor_profile", version: 1 });
    await must(handoverActor(s, 1));
    const binding = s.campaign.store.getFact(PLAYER_CHARACTER_BINDING_KEY)!;
    const actorFactsBefore = s.campaign.store
      .listFacts()
      .filter((f) => f.key.startsWith("actor/"))
      .map((f) => structuredClone(f));

    // -- receive: one create-only basis, the distinct establishment, exact provenance references ------------------------
    const received = await must(carryForward(s, 1));
    expect(received.replayed).toBe(false);
    const basis = s.pcs.basis(A, C)!;
    expect(basis.fact).toMatchObject({
      key: basisKey,
      owner: "pc_existence",
      facet: "pc_capability_profile",
      version: 1,
    });
    expect(basis.fact.provenance.rule).toEqual(PC_CAPABILITY_RULE);
    expect(basis.value).toEqual({
      pc_id: A,
      capability_id: C,
      marker: "C",
      establishment: {
        method: "EXISTING_ACTOR_CARRY_FORWARD",
        handover: { fact_key: PLAYER_CHARACTER_BINDING_KEY, version: binding.version },
        source: { fact_key: sourceKey, version: 1 },
      },
    });
    // not generation history: no contract pointer, no claim locator, no accepted-claim wording anywhere in the basis
    const text = JSON.stringify(basis.value);
    for (const absent of ["ACCEPTED_GENERATION_HISTORY", "claims", "contract", "statement"])
      expect(text).not.toContain(absent);
    // the group read and depended on exactly what it cites (references, never copies)
    const group = s.campaign.store.committedGroup(basis.fact.provenance.intent_id)!;
    expect(group.writes).toHaveLength(1);
    expect(group.reads).toEqual([
      { key: pcExistenceContractKey(A), version: 1 },
      { key: PLAYER_CHARACTER_BINDING_KEY, version: binding.version },
      { key: sourceKey, version: 1 },
    ]);
    expect(group.depends_on).toEqual(
      [pcExistenceContractKey(A), PLAYER_CHARACTER_BINDING_KEY, sourceKey].map(
        (k) => s.campaign.store.getFact(k)!.provenance.group_id,
      ),
    );
    // the basis is no capability and is not readable cross-owner: the capability exists only at the close
    expect(s.pcs.capability(A, C)).toBeUndefined();

    // -- close: the existing PC Capability Close, through the existing IM-02 temporal path ------------------------------
    const closed = await closePcCapability(s, 20);
    expect(closed.transaction.transaction.outcome).toMatchObject({
      stop_reason: "TARGET_REACHED",
      unresolved_dependents: [],
    });
    const stage = pcCapabilityStage(A, C);
    const stages = closed.transaction.transaction.stages;
    expect(stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "pc_existence",
      "SYNTHETIC-CAPABILITY-CONSUMER",
    ]);
    expect(stages[0]!.stage).toEqual(stage);
    expect(stages[0]!.group_id).toBe(stageGroupId(stage));
    expect(stages[1]!.reads[0]!).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "pc_existence", fact_key: capKey },
      close_basis: {
        name: "PC Capability Close",
        producer: { owner: "pc_existence", operation: "pc-publish-capability-close" },
      },
    });
    const cap = s.pcs.capability(A, C)!;
    expect(cap.fact).toMatchObject({ owner: "pc_existence", facet: "pc_capability_profile" });
    const derived = derivePcCapability({
      key: basisKey,
      owner: "pc_existence",
      version: 1,
      value: basis.value,
    });
    expect(derived.ok && cap.value).toEqual(derived.ok && derived.value);
    // the marker is carried unchanged, and the consequence observed exactly that marker at the close
    expect(cap.value.marker).toBe("C");
    expect(
      s.campaign.store.getFact(consumerResultKey(`pc-consumer-${A}-${C}`))!.value,
    ).toMatchObject({ observed_marker: "C", observed_close_group: cap.close_group });

    // -- the predecessor stays exactly what it was: immutable cold provenance, never a rival writable owner -------------
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("actor/"))
        .map((f) => structuredClone(f)),
    ).toEqual(actorFactsBefore);
    expect(s.campaign.store.getFact(sourceKey)).toEqual(source);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every marker form is carried unchanged: each grade, EX with its descriptor, and the explicit ungraded null", async () => {
    const markers: (ComparativeMarker | null)[] = [
      "C",
      "B",
      "A",
      "S",
      { ex: "SYNTHETIC FIXTURE: a causal descriptor" },
      null,
    ];
    for (const marker of markers) {
      const s = await seededExistingActorCampaign(tempDir());
      await readyForCarryForward(s, A, C, { marker });
      await must(handoverActor(s, 1));
      await must(carryForward(s, 1));
      expect(s.pcs.basis(A, C)!.value.marker, JSON.stringify(marker)).toEqual(marker);
      await closePcCapability(s, 20);
      expect(s.pcs.capability(A, C)!.value.marker, JSON.stringify(marker)).toEqual(marker);
      expect(s.actors.capability(A, C)!.value.marker).toEqual(marker);
      expect(s.campaign.verify()).toEqual([]);
    }
  });

  it("the carry-forward invents and resolves nothing: no Causal Draw, no entropy, no clock advance, no unrelated fact", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    await must(handoverActor(s, 1));
    const before = new Set(s.campaign.store.listFacts().map((f) => f.key));
    const drawsBefore = s.entropy.calls();
    const time = s.coordinator.state()!.fact.version;
    await must(carryForward(s, 1));
    expect(s.entropy.calls()).toBe(drawsBefore);
    expect(s.coordinator.state()!.fact.version).toBe(time);
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => !before.has(f.key))
        .map((f) => f.key),
    ).toEqual([basisKey]);
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("causal-draw/"))).toEqual(
      [],
    );
  });

  it("the handover is the cutover: before it nothing is carried, and after it the actor owner can write nothing for the identity", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    // before the handover, the committed capability alone is no carry basis
    expect(await codeOf(carryForward(s, 1))).toBe("PREREQUISITE_MISSING");
    expect(s.pcs.basis(A, C)).toBeUndefined();
    expect(actorBoundaryViolation(facts(s), A)).toBeNull();
    await must(handoverActor(s, 1));
    expect(actorBoundaryViolation(facts(s), A)).not.toBeNull();
    const head = s.campaign.store.head();
    const write = await s.actors.establishCapabilityBasis({
      group_id: "late-group",
      intent_id: "late-intent",
      cause: "late-cause",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: capabilityBasis(A, D),
    });
    expect(!write.ok && write.error.code).toBe("KEY_NOT_ADMITTED");
    expect(s.campaign.store.head()).toEqual(head);
    await must(carryForward(s, 1));
  });

  it("absent or foreign sources fail closed: no basis, another capability and another identity are no source", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    await must(handoverActor(s, 1));
    // D never had any actor state at all
    expect(await codeOf(carryForward(s, 2, A, D))).toBe("PREREQUISITE_MISSING");
    // another identity's capability is not this identity's source
    expect(await codeOf(carryForward(s, 3, "actor-other", C))).toBe("PREREQUISITE_MISSING");
    expect(s.pcs.basis(A, D)).toBeUndefined();
    expect(s.pcs.basis("actor-other", C)).toBeUndefined();
  });

  it("a mere actor capability basis is no source, and a capability that would only close AFTER the cutover can never come into being", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    // a second capability whose establishment basis is committed before the cutover, but whose capability never closed
    await must(
      s.actors.establishCapabilityBasis({
        group_id: "d-group",
        intent_id: "d-intent",
        cause: "d-cause",
        basis: "fixture-basis",
        secrecy: "fixture-visibility",
        capability: capabilityBasis(A, D),
      }),
    );
    expect(s.actors.basis(A, D)).toBeDefined();
    expect(s.actors.capability(A, D)).toBeUndefined();
    await must(handoverActor(s, 1));
    // the basis alone carries nothing
    expect(await codeOf(carryForward(s, 2, A, D))).toBe("PREREQUISITE_MISSING");
    // the actor owner can no longer close it: the post-cutover close never commits, so it can never become a source
    await closeActorCapability(s, 30, A, D).then(
      () => undefined,
      () => undefined,
    );
    expect(s.actors.capability(A, D)).toBeUndefined();
    expect(s.campaign.store.getFact(actorCapabilityKey(A, D))).toBeUndefined();
    expect(await codeOf(carryForward(s, 3, A, D))).toBe("PREREQUISITE_MISSING");
    expect(s.pcs.basis(A, D)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the carry-forward is exactly once: the capability slot is sealed and a replay of the same intent converges", async () => {
    const s = await seededExistingActorCampaign(tempDir());
    await readyForCarryForward(s);
    await must(handoverActor(s, 1));
    await must(carryForward(s, 1));
    expect((await must(carryForward(s, 1))).replayed).toBe(true);
    // a second carry of the same identity/capability is a different intent against a sealed slot
    expect(await codeOf(s.pcs.carryForwardActorCapability(carryInput(2)))).not.toBe("OK");
    expect(s.pcs.basis(A, C)!.fact.version).toBe(1);
    await closePcCapability(s, 20);
    expect(s.pcs.capability(A, C)!.fact.version).toBe(1);
    expect(existingActorSummary(s.campaign, s.coordinator).pc_capability.map((f) => f.key)).toEqual(
      [basisKey, capKey].sort(),
    );
  });
});
