/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Epistemic Access / Sealed Accessible Content Packet Backbone Foundation — "an already-established source/carrier
// context supplies one causally real payload to one explicit, bounded named non-PC recipient → Epistemic Access
// establishes actual receipt → where representational intelligibility depends on Named-Actor capability, it reads only
// an already-committed capability at its declared close → it seals engine-only provenance separately from the
// actor-safe Accessible Content Packet → the sealed packet is a lawful downstream prerequisite" — all under the existing
// IM-02 transaction machinery.
// Register lineage: IA-01/02/03/04 (partial), IA-11 (partial), IA-16 (partial), IA-22 (reused / partial); RC-02/03/04/05/
// 11/14/16; IM-02, IM-03, IM-10, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0): F-014D.
// CAL-01 stays UNCALIBRATED (EXACT only). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  actorCapabilityKey,
  actorCapabilityStage,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  EPISTEMIC_ACCESS_RULE,
  TemporalCoordinator,
  deriveAccessProducts,
  stageGroupId,
  stageIntentId,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_COMMAND,
  CAP_METALWORKING,
  EVENT_COUNCIL,
  EVENT_LATER,
  EVENT_SCHEMATIC,
  PRESENTED_SEAL,
  SOURCE_SCROLL,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  at,
  capabilityBasis,
  capabilityConsumerObject,
  consumerAdvanceRequest,
  continuationInput,
  epistemicProviders,
  FIXTURE_CAMPAIGN,
  packetAdvanceRequest,
  packetConsumerObject,
  packetConsumerResultKey,
  sourceGroup,
  sourceKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  epistemicSummary,
  establishAccess,
  establishCapability,
  registerPacketConsumer,
  seededEpistemicCampaign,
  type EpistemicSeeded,
} from "../support/epistemic.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const capKey = actorCapabilityKey(A, C);
const capStage = actorCapabilityStage(A, C);
const packetStage = accessPacketStage(EVENT_COUNCIL, A);
const advance = (s: EpistemicSeeded, id = "tx-1", consumer = "c1") =>
  s.coordinator.advance(packetAdvanceRequest(id, consumer));

describe("a committed carrier yields one BOUNDED_SHARED_ACCESS event for one named non-PC recipient (acceptance 1, 3, 5, 10)", () => {
  it("the Epistemic owner commits the event, pinned to the carrier it rests on, engine-sealed and create-only; the carrier's own owner gains no authority and its fact is untouched", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const carrierBefore = structuredClone(s.campaign.store.getFact(sourceKey(SOURCE_SPEAKER))!);
    const e = await establishAccess(s, 1, EVENT_COUNCIL);
    const stored = s.access.event(EVENT_COUNCIL)!;
    expect(stored.value).toEqual(e);
    expect(stored.value.mode).toBe("BOUNDED_SHARED_ACCESS");
    expect(stored.value.participants).toEqual([A]);
    expect(stored.fact).toMatchObject({
      key: accessEventKey(EVENT_COUNCIL),
      owner: "epistemic_access",
      facet: "epistemic_access",
      version: 1,
      unit: null,
      basis: "access-fixture-basis",
      secrecy: "epistemic.engine-sealed",
    });
    expect(stored.fact.provenance.rule).toEqual(EPISTEMIC_ACCESS_RULE);
    // the carrier is referenced by pin, never copied or rewritten
    expect(stored.value.source).toEqual({
      owner: SYNTH_ACCESS_SOURCE_OWNER,
      fact_key: sourceKey(SOURCE_SPEAKER),
      version: 1,
    });
    expect(s.campaign.store.getFact(sourceKey(SOURCE_SPEAKER))).toEqual(carrierBefore);
    expect(JSON.stringify(stored.value)).not.toContain(String(carrierBefore.value));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an event alone is NOT a packet, a receipt result for any consumer or an access-established fact: nothing is visible until the formation stage", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const e = await establishAccess(s, 1, EVENT_COUNCIL);
    expect(s.access.packet(EVENT_COUNCIL, A)).toBeUndefined();
    expect(s.access.engineSealedProvenance(EVENT_COUNCIL, A)).toBeUndefined();
    expect(s.campaign.store.getFact(accessPacketKey(EVENT_COUNCIL, A))).toBeUndefined();
    // registering the dependent consequence resolves nothing either
    await registerPacketConsumer(s, "c1", e, null, 2);
    expect(s.access.packet(EVENT_COUNCIL, A)).toBeUndefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c1"))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("the sealed packet forms as one IM-02 stage and is read by the consequence AS-OF-NOW (acceptance 5, 6, 8, 9)", () => {
  it("a payload whose form depends on no capability forms its packet BEFORE the consequence reads it, with no capability read", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const e = await establishAccess(s, 1, EVENT_COUNCIL);
    await registerPacketConsumer(s, "c1", e, null, 2);
    const r = await must(advance(s));
    expect(r.transaction.outcome).toMatchObject({
      stop_reason: "CONDITION_SATISFIED",
      unresolved_dependents: [],
    });
    const stages = r.transaction.stages;
    expect(stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "epistemic_access",
      "SYNTHETIC-PACKET-CONSUMER",
    ]);
    expect(stages[0]!.stage).toEqual(packetStage);
    expect(stages[0]!.group_id).toBe(stageGroupId(packetStage));
    expect(stages[0]!.revision).toBeLessThan(stages[1]!.revision);
    // the formation read exactly its event (NOW) and nothing else; the consumer read exactly the packet (NOW)
    expect(stages[0]!.reads).toHaveLength(1);
    expect(stages[0]!.reads[0]).toMatchObject({
      mode: "AS-OF-NOW",
      source: { owner: "epistemic_access", fact_key: accessEventKey(EVENT_COUNCIL) },
    });
    expect(stages[1]!.reads[0]).toMatchObject({
      mode: "AS-OF-NOW",
      source: { owner: "epistemic_access", fact_key: accessPacketKey(EVENT_COUNCIL, A) },
      source_basis: { version: 1, committed_by: stageGroupId(packetStage) },
    });
    // the packet is exactly what the event determines, two surfaces under two access classes, one group
    const packet = s.access.packet(EVENT_COUNCIL, A)!;
    const prov = s.access.engineSealedProvenance(EVENT_COUNCIL, A)!;
    const derived = deriveAccessProducts({
      event: { ...s.access.event(EVENT_COUNCIL)!.fact, value: e },
      capability: null,
    });
    expect(derived.ok && packet.value).toEqual(derived.ok && derived.value.packet);
    expect(derived.ok && prov.value).toEqual(derived.ok && derived.value.provenance);
    expect(packet.fact).toMatchObject({
      owner: "epistemic_access",
      facet: "epistemic_access",
      version: 1,
      unit: null,
      basis: "access-fixture-basis",
      secrecy: "epistemic.actor-accessible",
    });
    expect(prov.fact.secrecy).toBe("epistemic.engine-sealed");
    expect(packet.fact.provenance).toMatchObject({
      group_id: stageGroupId(packetStage),
      intent_id: stageIntentId(packetStage),
      cause: "transaction:tx-1",
      rule: EPISTEMIC_ACCESS_RULE,
    });
    expect(prov.fact.provenance.group_id).toBe(packet.fact.provenance.group_id);
    expect(packet.value.intelligibility).toEqual({
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "NO_CAPABILITY_DEPENDENCY",
    });
    // the consequence observed that packet and only the packet
    expect(s.campaign.store.getFact(packetConsumerResultKey("c1"))!.value).toEqual({
      observed_packet: packet.value,
      observed_formation_group: stageGroupId(packetStage),
    });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("receipt and representational intelligibility are separate determinations, and neither is comprehension: the event holds the first, the packet both, the provenance neither", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const basis = await establishCapability(s, 1);
    const e = await establishAccess(s, 2, EVENT_SCHEMATIC, A, {
      representation: { capability_id: C },
    });
    await registerPacketConsumer(s, "c1", e, basis, 3);
    await must(advance(s, "tx-1", "c1"));
    const event = JSON.stringify(s.access.event(EVENT_SCHEMATIC)!.value);
    const packet = s.access.packet(EVENT_SCHEMATIC, A)!.value;
    const prov = JSON.stringify(s.access.engineSealedProvenance(EVENT_SCHEMATIC, A)!.value);
    // the event states the route and the requirement; it states no intelligibility result
    expect(event).not.toMatch(/REPRESENTATION_ACCESSIBLE|intelligib/i);
    // the packet states actual receipt AND, separately, the representational result
    expect(packet.access.result).toBe("RECEIVED");
    expect(packet.intelligibility.result).toBe("REPRESENTATION_ACCESSIBLE");
    // the provenance restates neither the payload nor the intelligibility result
    expect(prov).not.toMatch(/REPRESENTATION_ACCESSIBLE|RECEIVED|payload|content/);
    // nothing anywhere states comprehension, recognition, inference, credibility, belief, stance, decision or behaviour
    for (const text of [event, JSON.stringify(packet), prov])
      expect(text).not.toMatch(
        /comprehen|understood|recogni|infer|credib|belie|stance|decision|behavio|trust|accept/i,
      );
    expect(JSON.stringify(Object.keys(packet))).not.toMatch(/comprehen|infer|credib|belie/i);
  });

  it("the packet carries the Presented Source Attribution and not the true source: the sealed provenance holds the true source/holder/carrier separately", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const e = await establishAccess(s, 1, EVENT_COUNCIL);
    await registerPacketConsumer(s, "c1", e, null, 2);
    await must(advance(s));
    const packet = s.access.packet(EVENT_COUNCIL, A)!.value;
    const prov = s.access.engineSealedProvenance(EVENT_COUNCIL, A)!.value;
    expect(packet.presented_attribution).toBe(PRESENTED_SEAL);
    expect(prov.source).toEqual(e.source);
    expect(prov.channel).toBe("SPEECH");
    const actorSurface = JSON.stringify([
      packet,
      s.campaign.store.getFact(packetConsumerResultKey("c1"))!.value,
      s.access.packet(EVENT_COUNCIL, A)!.fact.value,
    ]);
    for (const hidden of [
      SYNTH_ACCESS_SOURCE_OWNER,
      sourceKey(SOURCE_SPEAKER),
      accessEventKey(EVENT_COUNCIL),
      accessProvenanceKey(EVENT_COUNCIL, A),
      "SYNTHETIC FIXTURE: carrier",
    ])
      expect(actorSurface, hidden).not.toContain(hidden);
    // the two surfaces are two key spaces and two access classes
    const surfaces = s.campaign.store.listFacts().filter((f) => f.key.startsWith("access/"));
    expect(
      Object.fromEntries(surfaces.map((f) => [f.key.split("/")[2] ?? "event", f.secrecy])),
    ).toEqual({
      event: "epistemic.engine-sealed",
      packet: "epistemic.actor-accessible",
      provenance: "epistemic.engine-sealed",
    });
  });

  it("the packet is the same whatever the source's secrecy label or later changes: the presented attribution may even contradict the true source, and neither leaks into the other", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const e = await establishAccess(s, 1, EVENT_COUNCIL, A, {
      source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
      channel: "PERCEPTION",
      payload: {
        referent: "a sealed letter",
        content: "SYNTHETIC FIXTURE: the letter is addressed to the council.",
        presented_attribution: "signed in the name of the Duke",
      },
    });
    await registerPacketConsumer(s, "c1", e, null, 2);
    await must(advance(s));
    const packet = s.access.packet(EVENT_COUNCIL, A)!.value;
    expect(packet.presented_attribution).toBe("signed in the name of the Duke");
    expect(packet.access.channel).toBe("PERCEPTION");
    expect(JSON.stringify(packet)).not.toContain(SOURCE_SCROLL);
    expect(s.access.engineSealedProvenance(EVENT_COUNCIL, A)!.value.source.fact_key).toBe(
      sourceKey(SOURCE_SCROLL),
    );
  });
});

describe("capability-dependent intelligibility reads the already-committed capability AS-OF-DECLARED-CLOSE and never writes it (acceptance 2, 3, 12)", () => {
  it("the actor owner's close commits first, the packet formation reads it AS-OF-DECLARED-CLOSE, the consequence reads the packet; the capability is referenced, never copied or written", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const basis = await establishCapability(s, 1);
    const e = await establishAccess(s, 2, EVENT_SCHEMATIC, A, {
      representation: { capability_id: C },
    });
    await registerPacketConsumer(s, "c1", e, basis, 3);
    const spy = spyStore(s.campaign.store);
    const r = await must(
      new TemporalCoordinator(spy.store, epistemicProviders()).advance(
        packetAdvanceRequest("tx-1", "c1"),
      ),
    );
    const stages = r.transaction.stages;
    expect(stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "named_actor",
      "epistemic_access",
      "SYNTHETIC-PACKET-CONSUMER",
    ]);
    expect(stages[0]!.stage).toEqual(capStage);
    expect(stages[0]!.revision).toBeLessThan(stages[1]!.revision);
    expect(stages[1]!.stage).toEqual(accessPacketStage(EVENT_SCHEMATIC, A));
    // the packet's realized capability read is a CLOSE read of exactly the actor close
    expect(stages[1]!.reads[1]).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "named_actor", fact_key: capKey },
      close_basis: {
        name: "actor-profile-capability-close",
        producer: { owner: "named_actor", operation: "named-actor-publish-capability-close" },
      },
      source_basis: { version: 1, committed_by: stageGroupId(capStage) },
    });
    const cap = s.actors.capability(A, C)!;
    const packet = s.access.packet(EVENT_SCHEMATIC, A)!;
    expect(packet.value.intelligibility).toEqual({
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "ESTABLISHED_CAPABILITY",
      capability: {
        capability_id: C,
        fact_key: capKey,
        version: cap.fact.version,
        close: { name: "actor-profile-capability-close", group_id: cap.close_group },
      },
    });
    expect(s.access.engineSealedProvenance(EVENT_SCHEMATIC, A)!.value.capability_close).toEqual({
      fact_key: capKey,
      version: 1,
      committed_by: stageGroupId(capStage),
    });
    // the Epistemic owner wrote ONLY Epistemic keys; the Named-Actor owner wrote ONLY its capability
    const epistemicGroup = spy.commits.find((g: CommitGroup) => g.owner === "epistemic_access")!;
    expect(epistemicGroup.writes.map((w) => w.key)).toEqual([
      accessPacketKey(EVENT_SCHEMATIC, A),
      accessProvenanceKey(EVENT_SCHEMATIC, A),
    ]);
    const actorGroup = spy.commits.find((g: CommitGroup) => g.owner === "named_actor")!;
    expect(actorGroup.writes.map((w) => w.key)).toEqual([capKey]);
    // no marker or grade travelled into the packet or the provenance
    expect(
      JSON.stringify([packet.value, s.access.engineSealedProvenance(EVENT_SCHEMATIC, A)!.value]),
    ).not.toMatch(/marker|grade/);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an ALREADY-COMMITTED capability close is adopted by identity by a later packet: the actor owner writes nothing again and the capability is byte-identical", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const basis = await establishCapability(s, 1);
    // a first consequence (an actor-side fixture reader, no Epistemic part) resolves the capability close earlier
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: capabilityConsumerObject("c0", basis),
      }),
    );
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-0", "c0")));
    const closed = structuredClone(s.campaign.store.getFact(capKey)!);
    // only then does the access event arise and a later consequence need its packet
    const e = await establishAccess(s, 3, EVENT_SCHEMATIC, A, {
      representation: { capability_id: C },
      established_at: at(140),
    });
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(4),
        object: packetConsumerObject("c1", e, basis, {
          last_resolved_basis: at(140),
          next_boundary: { boundary_id: "boundary-c1", at: at(170) },
        }),
      }),
    );
    const spy = spyStore(s.campaign.store);
    const r = await must(
      new TemporalCoordinator(spy.store, epistemicProviders()).continueRemainder(
        continuationInput("tx-1"),
      ),
    );
    expect(r.adopted).toEqual([capStage]);
    expect(spy.commits.flatMap((g: CommitGroup) => g.writes.map((w) => w.key))).not.toContain(
      capKey,
    );
    expect(s.campaign.store.getFact(capKey)).toEqual(closed);
    const packet = s.access.packet(EVENT_SCHEMATIC, A)!.value;
    expect(packet.intelligibility).toMatchObject({
      basis: "ESTABLISHED_CAPABILITY",
      capability: { fact_key: capKey, version: 1, close: { group_id: stageGroupId(capStage) } },
    });
    expect(s.campaign.verify()).toEqual([]);
  });

  it("every capability marker form yields the same packet shape: the marker is never compared, converted or thresholded", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const markers = [
      ["cap-c", "C"],
      ["cap-b", "B"],
      ["cap-a", "A"],
      ["cap-s", "S"],
      ["cap-ex", { ex: "SYNTHETIC FIXTURE: a causal descriptor" }],
      ["cap-none", null],
    ] as const;
    let n = 1;
    const shapes: string[] = [];
    for (const [cap, marker] of markers) {
      const basis = await establishCapability(s, n++, A, cap, { marker });
      const e = await establishAccess(s, n++, `event-${cap}`, A, {
        representation: { capability_id: cap },
      });
      await registerPacketConsumer(s, `m-${cap}`, e, basis, 100 + n);
    }
    await must(advance(s, "tx-markers", "m-cap-c"));
    for (const [cap] of markers) {
      const packet = s.access.packet(`event-${cap}`, A)!.value;
      shapes.push(
        JSON.stringify(packet)
          .replaceAll(cap, "CAP")
          .replaceAll(stageGroupId(actorCapabilityStage(A, cap)), "G"),
      );
    }
    expect(new Set(shapes).size).toBe(1);
    expect(shapes[0]).not.toMatch(/marker|grade|"ex"/);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a sealed packet is never re-formed, improved or rewritten (acceptance 12, 13)", () => {
  it("re-presenting the transaction replays the committed result; the packet, provenance and consumer result are byte-identical and nothing is recreated", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const basis = await establishCapability(s, 1);
    const e = await establishAccess(s, 2, EVENT_SCHEMATIC, A, {
      representation: { capability_id: C },
    });
    await registerPacketConsumer(s, "c1", e, basis, 3);
    await must(advance(s));
    const before = epistemicSummary(s.campaign, s.coordinator);
    const spy = spyStore(s.campaign.store);
    const again = await must(
      new TemporalCoordinator(spy.store, epistemicProviders()).advance(
        packetAdvanceRequest("tx-1", "c1"),
      ),
    );
    expect(again.replayed).toBe(true);
    expect(spy.commits).toEqual([]);
    expect(epistemicSummary(s.campaign, s.coordinator)).toEqual(before);
  });

  it("no change to the capability can reach a sealed packet: a rival basis or an overwrite of the committed capability is refused, and the packet and provenance stay byte-identical", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const basis = await establishCapability(s, 1, A, C, { marker: "C" });
    const e = await establishAccess(s, 2, EVENT_SCHEMATIC, A, {
      representation: { capability_id: C },
    });
    await registerPacketConsumer(s, "c1", e, basis, 3);
    await must(advance(s));
    const sealed = structuredClone([
      s.campaign.store.getFact(accessPacketKey(EVENT_SCHEMATIC, A))!,
      s.campaign.store.getFact(accessProvenanceKey(EVENT_SCHEMATIC, A))!,
      s.campaign.store.getFact(capKey)!,
    ]);
    // a rival, upgraded basis for the same slot is a conflict
    const rival = await s.actors.establishCapabilityBasis({
      group_id: "rival-basis-group",
      intent_id: "rival-basis-intent",
      cause: "rival-basis-cause",
      basis: "fixture-basis",
      secrecy: "fixture-visibility",
      capability: capabilityBasis(A, C, { marker: "S" }),
    });
    expect(!rival.ok && rival.error.code).toBe("VERSION_CONFLICT");
    // an overwrite of the committed capability is an unsupported amendment, even exactly shaped
    const committed = s.campaign.store.getFact(capKey)!;
    const overwrite = await s.campaign.store.commit({
      campaign_id: FIXTURE_CAMPAIGN,
      group_id: "overwrite-group",
      intent_id: "overwrite-intent",
      owner: "named_actor",
      facet: "actor_profile",
      cause: "overwrite-cause",
      rule: committed.provenance.rule,
      authority: { role: "role.archivist", permission: "permission.canon.write" },
      reads: [],
      depends_on: [],
      writes: [
        {
          key: capKey,
          owner: "named_actor",
          facet: "actor_profile",
          value: { ...(committed.value as object), marker: "S" } as never,
          unit: null,
          basis: committed.basis,
          secrecy: committed.secrecy,
          expected_version: 1,
        },
      ],
    });
    expect(!overwrite.ok && overwrite.error.code).toBe("AMENDMENT_NOT_SUPPORTED");
    expect([
      s.campaign.store.getFact(accessPacketKey(EVENT_SCHEMATIC, A)),
      s.campaign.store.getFact(accessProvenanceKey(EVENT_SCHEMATIC, A)),
      s.campaign.store.getFact(capKey),
    ]).toEqual(sealed);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a later lawful capability does not improve an already-sealed packet; a later packet consumes its own later close", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const basis1 = await establishCapability(s, 1, A, C);
    const e1 = await establishAccess(s, 2, EVENT_SCHEMATIC, A, {
      representation: { capability_id: C },
    });
    await registerPacketConsumer(s, "c1", e1, basis1, 3);
    await must(advance(s));
    const sealedPacket = structuredClone(s.access.packet(EVENT_SCHEMATIC, A)!.fact);
    const sealedProvenance = structuredClone(
      s.access.engineSealedProvenance(EVENT_SCHEMATIC, A)!.fact,
    );
    // a later lawful capability of the same actor is established and closes under its own stage…
    const basis2 = await establishCapability(s, 4, A, CAP_COMMAND, { marker: "S" });
    const e2 = await establishAccess(s, 5, EVENT_LATER, A, {
      representation: { capability_id: CAP_COMMAND },
      established_at: at(140),
    });
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(6),
        object: packetConsumerObject("c2", e2, basis2, {
          last_resolved_basis: at(140),
          next_boundary: { boundary_id: "boundary-c2", at: at(170) },
        }),
      }),
    );
    await must(s.coordinator.continueRemainder(continuationInput("tx-2")));
    // …the earlier packet is exactly as sealed; the later packet references the later close
    expect(s.campaign.store.getFact(accessPacketKey(EVENT_SCHEMATIC, A))).toEqual(sealedPacket);
    expect(s.campaign.store.getFact(accessProvenanceKey(EVENT_SCHEMATIC, A))).toEqual(
      sealedProvenance,
    );
    const later = s.access.packet(EVENT_LATER, A)!.value;
    expect(later.intelligibility).toMatchObject({
      capability: {
        capability_id: CAP_COMMAND,
        close: { group_id: stageGroupId(actorCapabilityStage(A, CAP_COMMAND)) },
      },
    });
    expect(JSON.stringify(s.access.packet(EVENT_SCHEMATIC, A)!.value)).not.toContain(CAP_COMMAND);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("two consequences due at the same instant share one packet formation (acceptance 5, 13)", () => {
  it("one engaged object declares the formation; the other reads the packet AS-OF-NOW without a second stage; a second declaration at the same instant is refused", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const e = await establishAccess(s, 1, EVENT_COUNCIL);
    await registerPacketConsumer(s, "c1", e, null, 2);
    const readerOnly = packetConsumerObject("c-reader", e, null, {
      dependencies: [packetConsumerObject("c-reader", e, null).dependencies[1]!],
    });
    await must(s.coordinator.registerObject({ ...temporalPublication(3), object: readerOnly }));
    const refused = await s.coordinator.registerObject({
      ...temporalPublication(4),
      object: packetConsumerObject("c2", e, null),
    });
    expect(!refused.ok && refused.error.code).toBe("REFERENCE_INVALID");
    expect(!refused.ok && refused.error.message).toMatch(/exactly one engaged object per instant/);
    const r = await must(advance(s));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([]);
    expect(
      r.transaction.stages.filter((x) => x.stage.owner_operation.owner === "epistemic_access"),
    ).toHaveLength(1);
    const observed = (id: string) =>
      (s.campaign.store.getFact(packetConsumerResultKey(id))!.value as any)
        .observed_formation_group;
    expect(observed("c1")).toBe(stageGroupId(packetStage));
    expect(observed("c-reader")).toBe(stageGroupId(packetStage));
    expect(s.access.packet(EVENT_COUNCIL, A)!.fact.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("bounded runtime cost and no universal sweep: only the causally engaged event/recipient is touched (acceptance 15, 16)", () => {
  it("resolving one recipient's packet reads and writes nothing of an unrelated event, actor or consumer, and scans nothing", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    // an unrelated event for another actor with a dormant dependent object (no earned boundary: never engaged)
    const otherBasis = await establishCapability(s, 2, ACTOR_OTHER, CAP_COMMAND);
    const otherEvent = await establishAccess(s, 3, "event-other", ACTOR_OTHER, {
      representation: { capability_id: CAP_COMMAND },
      source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
    });
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(60),
        object: packetConsumerObject("dormant", otherEvent, otherBasis, { next_boundary: null }),
      }),
    );
    const e = await establishAccess(s, 1, EVENT_COUNCIL, ACTOR_SWORD);
    await registerPacketConsumer(s, "c1", e, null, 4);
    const unrelated = s.campaign.store
      .listFacts()
      .filter(
        (f) =>
          f.key.includes(ACTOR_OTHER) || f.key.includes("dormant") || f.key.includes("event-other"),
      );
    expect(unrelated.length).toBeGreaterThan(0);
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, epistemicProviders()).advance(
        packetAdvanceRequest("tx-1", "c1"),
      ),
    );
    expect(spy.listCalls()).toBe(0);
    const read = new Set(spy.getFacts);
    for (const f of unrelated) {
      expect(read.has(f.key), f.key).toBe(false);
      expect(s.campaign.store.getFact(f.key)).toEqual(f);
    }
    for (const g of spy.commits)
      for (const w of g.writes) expect(unrelated.some((f) => f.key === w.key)).toBe(false);
    expect(read.has(accessEventKey(EVENT_COUNCIL))).toBe(true);
    expect(s.access.packet("event-other", ACTOR_OTHER)).toBeUndefined();
    expect(s.access.packet(EVENT_COUNCIL, ACTOR_SWORD)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("there is no tick, sweep or standing object: with no consequence engaged, no packet is ever formed — however many events exist and however far time advances", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL, A);
    await establishAccess(s, 2, EVENT_SCHEMATIC, ACTOR_SWORD);
    await establishAccess(s, 3, EVENT_LATER, ACTOR_OTHER);
    const before = epistemicSummary(s.campaign, s.coordinator);
    await must(
      s.coordinator.advance({
        ...packetAdvanceRequest("tx-idle", "none"),
        requested: { target: at(200), condition: null },
      }),
    );
    const after = epistemicSummary(s.campaign, s.coordinator);
    expect(after.access).toEqual(before.access);
    for (const [event, actor] of [
      [EVENT_COUNCIL, A],
      [EVENT_SCHEMATIC, ACTOR_SWORD],
      [EVENT_LATER, ACTOR_OTHER],
    ] as const) {
      expect(s.access.packet(event, actor)).toBeUndefined();
      expect(s.access.engineSealedProvenance(event, actor)).toBeUndefined();
    }
  });

  it("an unresolved Epistemic stage freezes nothing unrelated: its dependents wait, independent lawful work at the same instant still resolves", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const basis = await establishCapability(s, 1);
    // c-blocked needs a capability close that its object never declares: its formation cannot read it and stays unresolved
    const blockedEvent = await establishAccess(s, 2, EVENT_SCHEMATIC, A, {
      representation: { capability_id: C },
    });
    const blockedObject = packetConsumerObject("c-blocked", blockedEvent, basis);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(3),
        object: {
          ...blockedObject,
          dependencies: blockedObject.dependencies.filter(
            (d) => d.stage.owner_operation.owner !== "named_actor",
          ),
        },
      }),
    );
    // c-free is independent lawful work due at the same instant
    const freeEvent = await establishAccess(s, 4, EVENT_COUNCIL, ACTOR_SWORD, {
      source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
    });
    await registerPacketConsumer(s, "c-free", freeEvent, null, 5);
    const r = await must(advance(s, "tx-1", "c-free"));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    const reasons = Object.fromEntries(
      r.transaction.outcome.unresolved_dependents.map((u) => [
        u.stage.owner_operation.owner,
        u.reason,
      ]),
    );
    expect(reasons).toEqual({
      epistemic_access: "PREDECESSOR_ABSENT",
      "SYNTHETIC-PACKET-CONSUMER": "PREDECESSOR_BLOCKED",
    });
    // nothing was published for the blocked formation; the independent one resolved
    expect(s.access.packet(EVENT_SCHEMATIC, A)).toBeUndefined();
    expect(s.access.engineSealedProvenance(EVENT_SCHEMATIC, A)).toBeUndefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c-blocked"))).toBeUndefined();
    expect(s.access.packet(EVENT_COUNCIL, ACTOR_SWORD)).toBeDefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c-free"))).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("stage identity is independent of horizon, source churn and slicing (acceptance 13)", () => {
  it("the requested horizon never changes the packet formation's identity or value", async () => {
    const run = async (target: number) => {
      const s = await seededEpistemicCampaign(tempDir());
      const e = await establishAccess(s, 1, EVENT_COUNCIL);
      await registerPacketConsumer(s, "c1", e, null, 2);
      await must(
        s.coordinator.advance({
          ...packetAdvanceRequest("tx-1", "c1"),
          requested: {
            target: at(target),
            condition: {
              kind: "STOP_AFTER_BOUNDARY",
              object_id: "packet-consumer-obj-c1",
              boundary_id: "packet-consumer-boundary-c1",
            },
          },
        }),
      );
      return s.access.packet(EVENT_COUNCIL, A)!;
    };
    const near = await run(150);
    const far = await run(400);
    expect(near.value).toEqual(far.value);
    expect(near.fact.provenance.group_id).toBe(far.fact.provenance.group_id);
    expect(near.fact.provenance.intent_id).toBe(far.fact.provenance.intent_id);
  });

  it("source-version churn after the event is history: the event keeps its pin, the packet is unchanged and the carrier's later version is never read", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const e = await establishAccess(s, 1, EVENT_COUNCIL);
    await registerPacketConsumer(s, "c1", e, null, 2);
    // the carrier advances to version 2 before the packet forms
    await must(
      s.campaign.store.commit(
        sourceGroup(
          FIXTURE_CAMPAIGN,
          99,
          SOURCE_SPEAKER,
          "SYNTHETIC FIXTURE: a later carrier state.",
          1,
        ),
      ),
    );
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, epistemicProviders()).advance(
        packetAdvanceRequest("tx-1", "c1"),
      ),
    );
    expect(new Set(spy.getFacts).has(sourceKey(SOURCE_SPEAKER))).toBe(false);
    expect(s.access.engineSealedProvenance(EVENT_COUNCIL, A)!.value.source.version).toBe(1);
    expect(s.access.event(EVENT_COUNCIL)!.value.source.version).toBe(1);
    expect(s.campaign.verify()).toEqual([]);
  });
});
