/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Epistemic Access — the canonically bound active Player Character as the one BOUNDED_SHARED_ACCESS recipient: the
// Accessible Content Packet forms under the same IM-02 stage, and where its representational form depends on a capability
// it references the exact committed I-002 PC capability fact/version read AS-OF-DECLARED-CLOSE at the "PC Capability Close"
// (F-014D §2.1 R-T1 with F-016 Phase 2B PCC-03). The Named-Actor path is covered unchanged by the existing Epistemic suites.
// Register lineage: IA-11 (partial), IA-14 (partial), IA-16 (partial); RC-02, RC-03, RC-04, RC-11, RC-14; IM-02, IM-03,
// IM-10, IM-11, IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  PC_CAPABILITY_CLOSE,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  pcCapabilityKey,
  pcCapabilityStage,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PopulationAdapter,
  TemporalCoordinator,
  deriveAccessProducts,
  epistemicPacketDeclaration,
  stageGroupId,
  stageIntentId,
  verifyEpistemicIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  CAP_METALWORKING,
  EPISTEMIC_FIXTURE_EXTENSION,
  EVENT_COUNCIL,
  EVENT_SCHEMATIC,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  SOURCE_SCROLL,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  accessEvent,
  accessPublication,
  at,
  consumerAdvanceRequest,
  continuationInput,
  epistemicProviders,
  fixtureContract,
  ledgerInput,
  packetAdvanceRequest,
  packetConsumerObject,
  packetConsumerResultKey,
  pcAccessEvent,
  pcCapabilityConsumerObject,
  pcCapabilityContract,
  popPublication,
  publication,
  sourceKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  establishAccess,
  establishPcCapability,
  registerPacketConsumer,
  seededEpistemicCampaign,
  type EpistemicSeeded,
} from "../support/epistemic.ts";
import { codeOf, must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const PC = FIXTURE_PC_ID;
const C = CAP_METALWORKING;
const E = EVENT_COUNCIL;
const withCapability = { representation: { capability_id: C } };
const capKey = pcCapabilityKey(PC, C);
const capStage = pcCapabilityStage(PC, C);
const packetKey = accessPacketKey(E, PC);
const provKey = accessProvenanceKey(E, PC);
const seed = (o: Parameters<typeof seededEpistemicCampaign>[1] = {}) =>
  seededEpistemicCampaign(tempDir(), { pcContract: pcCapabilityContract(), ...o });
const advance = (s: EpistemicSeeded, id = "tx-1", consumer = "c1") =>
  s.coordinator.advance(packetAdvanceRequest(id, consumer));
const accessFacts = (s: EpistemicSeeded) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("access/"));

/** The active PC's event over a capability-dependent payload, the PC capability basis it needs and its consequence. */
async function preparePc(s: EpistemicSeeded, over = withCapability) {
  const basis = await establishPcCapability(s, 1);
  const event = pcAccessEvent(E, PC, over);
  await must(s.access.establishBoundedSharedAccess({ ...accessPublication(2), event }));
  await registerPacketConsumer(s, "c1", event, basis, 3);
  return { basis, event };
}

describe("the active PC receives a packet whose intelligibility rests on the PC Capability Close", () => {
  it("the PC capability closes first, the packet forms from the event and that exact close, and the consequence reads the packet AS-OF-NOW", async () => {
    const s = await seed();
    const { basis } = await preparePc(s);
    const r = await must(advance(s));
    expect(r.transaction.outcome).toMatchObject({
      stop_reason: "CONDITION_SATISFIED",
      unresolved_dependents: [],
    });
    const stages = r.transaction.stages;
    expect(stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "pc_existence",
      "epistemic_access",
      "SYNTHETIC-PACKET-CONSUMER",
    ]);
    expect(stages[1]!.reads).toHaveLength(2);
    expect(stages[1]!.reads[1]).toMatchObject({
      mode: "AS-OF-DECLARED-CLOSE",
      source: { owner: "pc_existence", fact_key: capKey },
      close_basis: { name: PC_CAPABILITY_CLOSE },
    });
    const cap = s.campaign.store.getFact(capKey)!;
    expect(cap.provenance.group_id).toBe(stageGroupId(capStage));
    const packet = s.access.packet(E, PC)!;
    expect(packet.value.recipient).toBe(PC);
    expect(packet.value.intelligibility).toEqual({
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "ESTABLISHED_CAPABILITY",
      capability: {
        capability_id: C,
        fact_key: capKey,
        version: cap.version,
        close: { name: PC_CAPABILITY_CLOSE, group_id: stageGroupId(capStage) },
      },
    });
    expect(s.access.engineSealedProvenance(E, PC)!.value.capability_close).toEqual({
      fact_key: capKey,
      version: cap.version,
      committed_by: stageGroupId(capStage),
    });
    // the capability is referenced, never copied or interpreted; the sealed surface stays off the actor-visible packet
    expect(JSON.stringify(packet.value)).not.toContain(JSON.stringify(basis.marker));
    expect(JSON.stringify(packet.value)).not.toContain(sourceKey(SOURCE_SPEAKER));
    expect(JSON.stringify(packet.value)).not.toContain(accessEventKey(E));
    expect(packet.fact.secrecy).toBe("epistemic.actor-accessible");
    expect(s.access.engineSealedProvenance(E, PC)!.fact.secrecy).toBe("epistemic.engine-sealed");
    // the consequence observed exactly the sealed packet
    expect(s.campaign.store.getFact(packetConsumerResultKey("c1"))!.value).toMatchObject({
      observed_packet: packet.value,
    });
    // no Named-Actor capability state was created or consulted for the PC
    expect(s.campaign.store.listFacts().filter((f) => f.key.startsWith("actor/"))).toEqual([]);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a PC payload whose form depends on no capability forms a plain packet and reads no capability", async () => {
    const s = await seed();
    const event = pcAccessEvent(E, PC);
    await must(s.access.establishBoundedSharedAccess({ ...accessPublication(1), event }));
    await registerPacketConsumer(s, "c1", event, null, 2);
    const r = await must(advance(s));
    expect(r.transaction.stages[0]!.reads).toHaveLength(1);
    expect(s.access.packet(E, PC)!.value.intelligibility).toEqual({
      result: "REPRESENTATION_ACCESSIBLE",
      basis: "NO_CAPABILITY_DEPENDENCY",
    });
    expect(s.campaign.store.getFact(capKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("an ALREADY-COMMITTED PC Capability Close is adopted by identity by a later packet: the PC owner writes nothing again and the capability is byte-identical", async () => {
    const s = await seed();
    const basis = await establishPcCapability(s, 1);
    // a first consequence (a PC-side fixture reader with no Epistemic part) resolves the PC Capability Close earlier
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: pcCapabilityConsumerObject("c0", basis),
      }),
    );
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-0", "c0")));
    const closed = structuredClone(s.campaign.store.getFact(capKey)!);
    // only then does the access event arise and a later consequence need its packet
    const event = pcAccessEvent(EVENT_SCHEMATIC, PC, {
      ...withCapability,
      established_at: at(140),
    });
    await must(s.access.establishBoundedSharedAccess({ ...accessPublication(3), event }));
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(4),
        object: packetConsumerObject("c1", event, basis, {
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
    expect(s.access.packet(EVENT_SCHEMATIC, PC)!.value.intelligibility).toMatchObject({
      basis: "ESTABLISHED_CAPABILITY",
      capability: { fact_key: capKey, version: 1, close: { group_id: stageGroupId(capStage) } },
    });
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a PC packet whose required capability is not lawfully available at its close stays unresolved and writes nothing", () => {
  it("a consequence cannot conjure the PC capability: with no committed PC capability basis the PC close stage cannot be declared and the object is refused", async () => {
    const s = await seed();
    const event = pcAccessEvent(E, PC, withCapability);
    await must(s.access.establishBoundedSharedAccess({ ...accessPublication(1), event }));
    // a basis for ANOTHER capability is committed; the one the payload needs is not
    const other = await establishPcCapability(s, 2, PC, "capability-other");
    const stageOfNeeded = { ...other, capability_id: C };
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(3),
          object: packetConsumerObject("c1", event, stageOfNeeded, {}),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.access.packet(E, PC)).toBeUndefined();
    expect(s.campaign.store.getFact(capKey)).toBeUndefined();
  });

  it("a formation that does not declare the PC close, with no committed close to adopt, is unresolved: no packet, no provenance, no default", async () => {
    const s = await seed();
    await establishPcCapability(s, 1);
    const event = pcAccessEvent(E, PC, withCapability);
    await must(s.access.establishBoundedSharedAccess({ ...accessPublication(2), event }));
    await registerPacketConsumer(s, "c1", event, null, 3);
    const r = await must(advance(s));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(s.access.packet(E, PC)).toBeUndefined();
    expect(s.access.engineSealedProvenance(E, PC)).toBeUndefined();
    expect(s.campaign.store.getFact(capKey)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("only the canonically bound active PC is a PC recipient: classification comes from the Role Registry binding", () => {
  it("the role asserted for an unbound released PC, a Named-Actor subject, an absent identity or a Population ledger identity is refused, and nothing is written", async () => {
    const s = await seed();
    const unboundContract = fixtureContract({ pc_id: "pc-unbound" });
    await must(s.campaign.releasePlayerCharacter({ ...publication(7), contract: unboundContract }));
    const pop = new PopulationAdapter(s.campaign.store);
    await must(pop.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
    let n = 1;
    for (const recipient of ["pc-unbound", ACTOR_SMITH, "nobody-at-all", "ledger-main"]) {
      expect(
        await codeOf(
          s.access.establishBoundedSharedAccess({
            ...accessPublication(n++),
            event: pcAccessEvent(`e-${recipient}`, recipient),
          }),
        ),
        recipient,
      ).toBe("KEY_NOT_ADMITTED");
    }
    expect(accessFacts(s)).toEqual([]);
    // the bound PC without the role assertion is still refused: the Named-Actor boundary is not relaxed
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(n),
          event: accessEvent("e-unasserted", PC),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    expect(accessFacts(s)).toEqual([]);
  });

  it("an I-002 Existence Contract alone is no PC recipient: with no committed binding, even the released PC is refused", async () => {
    const s = await seed({ canonical: false });
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(3), contract: pcCapabilityContract() }),
    );
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(1),
          event: pcAccessEvent(E, PC),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    expect(accessFacts(s)).toEqual([]);
  });

  it("an event established for a Named-Actor identity is never reinterpreted when that identity is later bound as the PC: its formation fails closed", async () => {
    const s = await seed({ canonical: false });
    await must(
      s.campaign.establishWorld({
        ...publication(1),
        world: (await import("@immortalis/testkit")).fixtureWorld(),
      }),
    );
    const late = await establishAccess(s, 1, E, PC);
    await registerPacketConsumer(s, "c1", late, null, 2);
    const tk = await import("@immortalis/testkit");
    await must(s.campaign.establishLocus({ ...publication(2), locus: tk.fixtureLocus() }));
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(3), contract: pcCapabilityContract() }),
    );
    await must(
      s.campaign.bindPlayerCharacter({
        ...publication(4),
        pc_id: PC,
        world_id: tk.FIXTURE_WORLD_ID,
        locus_id: tk.FIXTURE_LOCUS_ID,
        insertion: tk.fixtureInsertionFact(),
      }),
    );
    const r = await must(advance(s));
    expect(r.rejections.map((x) => x.code)).toEqual(["KEY_NOT_ADMITTED"]);
    expect(s.access.packet(E, PC)).toBeUndefined();
    expect(s.access.engineSealedProvenance(E, PC)).toBeUndefined();
  });
});

describe("the capability source is the PC owner's and is never substituted", () => {
  it("a PC event's formation stage must be the derived declaration: a Named-Actor close read, a NOW read or another capability is refused at registration", async () => {
    const s = await seed();
    const { event, basis } = await preparePc(s);
    const good = packetConsumerObject("cx", event, basis, {});
    const idx = good.dependencies.findIndex(
      (d) => d.stage.owner_operation.owner === "epistemic_access",
    );
    const forged = (reads: any[]) => ({
      ...good,
      dependencies: good.dependencies.map((d, i) => (i === idx ? { ...d, reads } : d)),
    });
    const lawful = epistemicPacketDeclaration(event).reads;
    const attempts: Record<string, any[]> = {
      "Named-Actor close read of the PC identity": [
        lawful[0],
        {
          mode: "AS-OF-DECLARED-CLOSE",
          source: { owner: "named_actor", fact_key: `actor/${PC}/capability/${C}` },
          close_basis: {
            name: "actor-profile-capability-close",
            producer: { owner: "named_actor", operation: "named-actor-publish-capability-close" },
          },
          invalidators: [{ fact_key: `actor/${PC}/capability/${C}` }],
        },
      ],
      "NOW read of the PC capability": [
        lawful[0],
        {
          mode: "AS-OF-NOW",
          source: { owner: "pc_existence", fact_key: capKey },
          invalidators: [],
        },
      ],
      "PC close read of another capability": [
        lawful[0],
        {
          ...lawful[1],
          source: { ...lawful[1]!.source, fact_key: pcCapabilityKey(PC, "capability-other") },
        },
      ],
      "no capability read": [lawful[0]],
    };
    let n = 50;
    for (const [name, reads] of Object.entries(attempts))
      expect(
        await codeOf(
          s.coordinator.registerObject({ ...temporalPublication(n++), object: forged(reads) }),
        ),
        name,
      ).toBe("REFERENCE_INVALID");
    expect(s.access.packet(E, PC)).toBeUndefined();
  });

  it("a PC event cannot rest on the PC owner's own capability as its information source", async () => {
    const s = await seed();
    await establishPcCapability(s, 1);
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(2),
          event: pcAccessEvent(E, PC, {
            source: {
              owner: "pc_existence",
              fact_key: `pc/${PC}/capability-basis/${C}`,
              version: 1,
            },
          }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(accessFacts(s)).toEqual([]);
  });
});

describe("a raw formation cannot bypass admission: the PC packet is exactly what event and close determine", () => {
  /** The PC close resolved earlier by a reader with no Epistemic part, then the event: only the formation is missing. */
  async function closedButUnformed() {
    const s = await seed();
    const basis = await establishPcCapability(s, 1);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: pcCapabilityConsumerObject("c0", basis),
      }),
    );
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-0", "c0")));
    const event = pcAccessEvent(E, PC, withCapability);
    await must(s.access.establishBoundedSharedAccess({ ...accessPublication(3), event }));
    const eventFact = s.campaign.store.getFact(accessEventKey(E))!;
    const capFact = s.campaign.store.getFact(capKey)!;
    const derive = (cap: unknown, committedBy: string) =>
      deriveAccessProducts({
        event: {
          key: eventFact.key,
          owner: eventFact.owner,
          version: eventFact.version,
          value: eventFact.value as never,
        },
        capability: {
          fact: {
            key: capFact.key,
            owner: capFact.owner,
            version: capFact.version,
            value: cap as never,
          },
          committed_by: committedBy,
        },
      });
    const lawful = derive(capFact.value, capFact.provenance.group_id);
    if (!lawful.ok) throw new Error("fixture");
    const group = (over: Partial<CommitGroup> = {}, packet: unknown = lawful.value.packet) =>
      ({
        campaign_id: FIXTURE_CAMPAIGN,
        owner: "epistemic_access",
        facet: "epistemic_access",
        group_id: "raw-pc-formation",
        intent_id: "raw-pc-formation-intent",
        cause: "transaction:tx-never-opened",
        rule: eventFact.provenance.rule,
        authority: { ...CANON_WRITE_AUTHORITY },
        reads: [
          { key: eventFact.key, version: eventFact.version },
          { key: capFact.key, version: capFact.version },
        ],
        depends_on: [eventFact.provenance.group_id, capFact.provenance.group_id],
        writes: [
          {
            key: packetKey,
            owner: "epistemic_access",
            facet: "epistemic_access",
            value: packet as never,
            unit: null,
            basis: "access-fixture-basis",
            secrecy: "epistemic.actor-accessible",
            expected_version: 0,
          },
          {
            key: provKey,
            owner: "epistemic_access",
            facet: "epistemic_access",
            value: lawful.value.provenance as never,
            unit: null,
            basis: "access-fixture-basis",
            secrecy: "epistemic.engine-sealed",
            expected_version: 0,
          },
        ],
        ...over,
      }) as CommitGroup;
    return { s, capFact, derive, lawful: lawful.value, group };
  }

  it("the derivation itself refuses a wrong owner, key, holder, capability, close name, close stage or close group", async () => {
    const { capFact, derive } = await closedButUnformed();
    const held = capFact.value as any;
    expect(derive(held, capFact.provenance.group_id).ok).toBe(true);
    const bad: Record<string, [unknown, string]> = {
      "another PC identity": [{ ...held, pc_id: "pc-other" }, capFact.provenance.group_id],
      "another capability": [
        { ...held, capability_id: "capability-other" },
        capFact.provenance.group_id,
      ],
      "the actor-profile close name": [
        { ...held, close: { ...held.close, name: "actor-profile-capability-close" } },
        capFact.provenance.group_id,
      ],
      "another close stage": [
        { ...held, close: { ...held.close, stage: pcCapabilityStage(PC, "capability-other") } },
        capFact.provenance.group_id,
      ],
      "a close group that is not the PC Capability Close": [held, "g-elsewhere"],
    };
    for (const [name, [value, group]] of Object.entries(bad))
      expect(derive(value, group).ok, name).toBe(false);
  });

  it("a raw formation is refused without the stage identity and a durable open transaction, with a tampered capability reference, or with a wrong read set; nothing is published", async () => {
    const { s, lawful, group } = await closedButUnformed();
    const stageIdentity = {
      group_id: stageGroupId(accessPacketStage(E, PC)),
      intent_id: stageIntentId(accessPacketStage(E, PC)),
    };
    // the lawful content under an ordinary identity, and under the stage identity but a cause no transaction opened
    expect(await codeOf(s.campaign.store.commit(group()))).toBe("REFERENCE_INVALID");
    expect(await codeOf(s.campaign.store.commit(group(stageIdentity)))).toBe("REFERENCE_INVALID");
    // a packet that claims another capability version or the Named-Actor close for the PC capability
    const cap = (lawful.packet.intelligibility as any).capability;
    for (const forged of [
      { ...cap, version: 2 },
      { ...cap, close: { ...cap.close, name: "actor-profile-capability-close" } },
      { ...cap, fact_key: `actor/${PC}/capability/${C}` },
    ])
      expect(
        await codeOf(
          s.campaign.store.commit(
            group(stageIdentity, {
              ...lawful.packet,
              intelligibility: { ...lawful.packet.intelligibility, capability: forged },
            }),
          ),
        ),
      ).toBe("VALUE_INVALID");
    // a formation that drops the capability read, or reads another committed fact in its place
    const event = s.campaign.store.getFact(accessEventKey(E))!;
    expect(
      await codeOf(
        s.campaign.store.commit(
          group({ ...stageIdentity, reads: [{ key: event.key, version: event.version }] }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(
          group({
            ...stageIdentity,
            reads: [
              { key: event.key, version: event.version },
              { key: sourceKey(SOURCE_SPEAKER), version: 1 },
            ],
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.access.packet(E, PC)).toBeUndefined();
    expect(s.access.engineSealedProvenance(E, PC)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a tampered PC formation inside a lawful transaction is refused and nothing is published", async () => {
    const s = await seed();
    await preparePc(s);
    const inner = s.campaign.store;
    const store: CampaignStore = {
      descriptor: inner.descriptor,
      head: () => inner.head(),
      getFact: (k) => inner.getFact(k),
      listFacts: () => inner.listFacts(),
      lookupReceipt: (i) => inner.lookupReceipt(i),
      committedGroup: (i) => inner.committedGroup(i),
      close: () => inner.close(),
      commit: (g) => {
        const group = g as CommitGroup;
        if (group.owner !== "epistemic_access" || group.writes.length !== 2) return inner.commit(g);
        const packet = structuredClone(group.writes[0]!.value) as any;
        // claim the Named-Actor close name for the PC capability
        packet.intelligibility.capability.close.name = "actor-profile-capability-close";
        return inner.commit({
          ...group,
          writes: [{ ...group.writes[0]!, value: packet }, group.writes[1]!],
        });
      },
    };
    const r = await must(
      new TemporalCoordinator(store, epistemicProviders()).advance(
        packetAdvanceRequest("tx-1", "c1"),
      ),
    );
    expect(r.rejections.map((x) => x.code)).toEqual([
      expect.stringMatching(/VALUE_INVALID|REFERENCE_INVALID/),
    ]);
    expect(s.access.packet(E, PC)).toBeUndefined();
    expect(s.access.engineSealedProvenance(E, PC)).toBeUndefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c1"))).toBeUndefined();
  });
});

describe("recovery and load verification keep the PC distinction", () => {
  it("save → close → load → continue: the packet forms once from the reloaded PC close and the saved campaign verifies", async () => {
    const dir = tempDir();
    const s = await seededEpistemicCampaign(dir, { pcContract: pcCapabilityContract() });
    await preparePc(s);
    await s.campaign.close();
    const re = await must(
      CanonicalCampaign.open(dir, {
        buildId: "pc-recipient-reopen",
        extension: EPISTEMIC_FIXTURE_EXTENSION,
      }),
    );
    const coordinator = new TemporalCoordinator(re.store, epistemicProviders());
    expect(re.verify()).toEqual([]);
    await must(coordinator.advance(packetAdvanceRequest("tx-1", "c1")));
    const packet = re.store.getFact(packetKey)!;
    expect((packet.value as any).intelligibility.capability.close.name).toBe(PC_CAPABILITY_CLOSE);
    expect(re.verify()).toEqual([]);
    const head = re.store.head();
    await re.close();
    // reloading the completed campaign changes nothing: nothing is re-formed
    const again = await must(
      CanonicalCampaign.open(dir, {
        buildId: "pc-recipient-reopen-2",
        extension: EPISTEMIC_FIXTURE_EXTENSION,
      }),
    );
    expect(again.store.head().state_sha256).toBe(head.state_sha256);
    expect(again.verify()).toEqual([]);
    await again.close();
  });

  it("load verification detects a PC packet whose capability reference, owner or close drifted, and a PC event that no longer matches the binding", async () => {
    const drifted = async (mutate: (facts: any[]) => any[]) => {
      const s = await seed();
      await preparePc(s);
      await must(advance(s));
      const inner = s.campaign.store;
      const facts = mutate(structuredClone([...inner.listFacts()]) as any[]);
      const bound: CampaignStore = {
        descriptor: inner.descriptor,
        head: () => inner.head(),
        getFact: (k) => inner.getFact(k),
        listFacts: () => facts,
        lookupReceipt: (i) => inner.lookupReceipt(i),
        committedGroup: (i) => inner.committedGroup(i),
        commit: (g) => inner.commit(g),
        close: () => inner.close(),
      };
      const out = verifyEpistemicIntegrity(bound)
        .map((v) => v.message)
        .join(" | ");
      await s.campaign.close();
      return out;
    };
    const edit = (key: string, f: (v: any) => void) => (facts: any[]) => {
      f(facts.find((x) => x.key === key)!.value);
      return facts;
    };
    expect(await drifted((f) => f)).toBe("");
    for (const f of [
      (v: any) => (v.intelligibility.capability.version = 2),
      (v: any) => (v.intelligibility.capability.close.group_id = "elsewhere"),
      (v: any) => (v.intelligibility.capability.close.name = "actor-profile-capability-close"),
      (v: any) => (v.intelligibility.capability.fact_key = `actor/${PC}/capability/${C}`),
    ])
      expect(await drifted(edit(packetKey, f))).toMatch(
        /exactly what its committed event determines/,
      );
    // the capability is no longer the PC owner's at its PC Capability Close
    expect(
      await drifted(edit(capKey, (v) => (v.close.name = "actor-profile-capability-close"))),
    ).toMatch(/exactly what its committed event determines|capability/);
    // an event that asserts the PC role although the binding names another entity
    expect(
      await drifted((facts) => {
        const b = facts.find((x) => x.key === "role-registry/binding/role.player_character")!;
        b.value.active_pc.entity_id = "pc-someone-else";
        return facts;
      }),
    ).toMatch(/not the active Player Character/);
  });
});

describe("the sparse path is preserved: no packet is formed without a consequence, and the PC close is not ticked", () => {
  it("a PC event and a committed PC capability basis alone resolve nothing", async () => {
    const s = await seed();
    await preparePc(s);
    expect(s.access.packet(E, PC)).toBeUndefined();
    expect(s.campaign.store.getFact(capKey)).toBeUndefined();
    expect(accessFacts(s).map((f) => f.key)).toEqual([accessEventKey(E)]);
    // an unrelated Named-Actor event in the same campaign is independent of the PC path
    await establishAccess(s, 9, EVENT_SCHEMATIC, ACTOR_SMITH, {
      source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
    });
    expect(s.access.packet(EVENT_SCHEMATIC, ACTOR_SMITH)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});
