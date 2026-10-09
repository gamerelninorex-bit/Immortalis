/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// Epistemic Access — enforcement that does not depend on the coordinator or on the owner operation behaving. IM-11
// admission holds for a raw `store.commit` and for a TAMPERED group; owner exclusivity holds for everyone, including the
// owner of the carrier an event rests on; access is never conjured by a consequence, a bare membership, an authority, an
// objective fact or a non-received source; the event mode is immutable; BROADCAST_EXPOSURE fails closed; the packet and
// the sealed provenance stay structurally separate; hand-written temporal objects are refused; and load-time
// verification fails closed on drift.
// Register lineage: IA-02, IA-03, IA-11 (partial), IA-14 (partial), IA-16 (partial), IA-06 (partial); RC-02, RC-03,
// RC-04, RC-07, RC-11, RC-14, RC-16; IM-02, IM-03, IM-10, IM-11, IM-12, IM-17. Local success is NOT provider/recovery
// acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  AccessEventSchema,
  CANON_WRITE_AUTHORITY,
  TEMPORAL_STATE_KEY,
  accessEventKey,
  accessPacketKey,
  accessPacketStage,
  accessProvenanceKey,
  actorCapabilityBasisKey,
  actorCapabilityKey,
  pcExistenceContractKey,
  populationLedgerKey,
  type AccessEvent,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  EPISTEMIC_ACCESS_RULE,
  EpistemicAccessAdapter,
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
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_METALWORKING,
  EVENT_COUNCIL,
  EVENT_SCHEMATIC,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  SOURCE_SCROLL,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  SYNTH_ACTOR_HISTORY_OWNER,
  SYNTH_CAPABILITY_CONSUMER_OWNER,
  SYNTH_PACKET_CONSUMER_OWNER,
  accessEvent,
  accessPublication,
  at,
  epistemicProviders,
  fixtureContract,
  historyKey,
  ledgerInput,
  packetAdvanceRequest,
  packetConsumerDeclaration,
  packetConsumerObject,
  packetConsumerResultKey,
  popPublication,
  publication,
  sourceGroup,
  sourceKey,
  temporalPublication,
} from "@immortalis/testkit";
import {
  establishAccess,
  establishCapability,
  registerPacketConsumer,
  seededEpistemicCampaign,
  type EpistemicSeeded,
} from "../support/epistemic.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";
import { expectedAdapterMethods } from "../support/expected-surface.ts";
import { adapterMethods } from "../support/surface-checks.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const eventKey = accessEventKey(EVENT_COUNCIL);
const packetKey = accessPacketKey(EVENT_COUNCIL, A);
const provKey = accessProvenanceKey(EVENT_COUNCIL, A);
const stage = accessPacketStage(EVENT_COUNCIL, A);
const advance = (s: EpistemicSeeded, id = "tx-1", consumer = "c1") =>
  s.coordinator.advance(packetAdvanceRequest(id, consumer));
const sourceGroupId = (s: EpistemicSeeded, id = SOURCE_SPEAKER) =>
  s.campaign.store.getFact(sourceKey(id))!.provenance.group_id;

/** A raw event group exactly as an unauthorized (or sloppy) caller might build it: no registry, no adapter. */
function raw(
  s: EpistemicSeeded,
  over: Partial<CommitGroup> & {
    key?: string;
    value?: unknown;
    expected_version?: number;
    secrecy?: string;
  } = {},
  n = 900,
): CommitGroup {
  const { key, value, expected_version, secrecy, ...group } = over;
  const owner = group.owner ?? "epistemic_access";
  const facet = group.facet ?? "epistemic_access";
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner,
    facet,
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: EPISTEMIC_ACCESS_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [{ key: sourceKey(SOURCE_SPEAKER), version: 1 }],
    depends_on: [sourceGroupId(s)],
    writes: [
      {
        key: key ?? eventKey,
        owner,
        facet,
        value: ("value" in over ? value : accessEvent(EVENT_COUNCIL, A)) as never,
        unit: null,
        basis: "fixture-basis",
        secrecy: secrecy ?? ACCESS_CLASS_ENGINE_SEALED,
        expected_version: expected_version ?? 0,
      },
    ],
    ...group,
  };
}

/** A raw packet-formation group built from the values the committed event determines (the lawful content, any identity). */
function formation(
  s: EpistemicSeeded,
  over: Partial<CommitGroup> = {},
  eventId = EVENT_COUNCIL,
  recipient = A,
): CommitGroup {
  const fact = s.campaign.store.getFact(accessEventKey(eventId))!;
  const derived = deriveAccessProducts({
    event: {
      key: fact.key,
      owner: fact.owner,
      version: fact.version,
      value: AccessEventSchema.parse(fact.value),
    },
    capability: null,
  });
  if (!derived.ok) throw new Error("fixture");
  const w = (key: string, value: unknown, secrecy: string) => ({
    key,
    owner: "epistemic_access",
    facet: "epistemic_access",
    value: value as never,
    unit: null,
    basis: "access-fixture-basis",
    secrecy,
    expected_version: 0,
  });
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "epistemic_access",
    facet: "epistemic_access",
    group_id: "raw-formation-group",
    intent_id: "raw-formation-intent",
    cause: "raw-formation-cause",
    rule: EPISTEMIC_ACCESS_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [{ key: fact.key, version: fact.version }],
    depends_on: [fact.provenance.group_id],
    writes: [
      w(accessPacketKey(eventId, recipient), derived.value.packet, ACCESS_CLASS_ACTOR_ACCESSIBLE),
      w(
        accessProvenanceKey(eventId, recipient),
        derived.value.provenance,
        ACCESS_CLASS_ENGINE_SEALED,
      ),
    ],
    ...over,
  };
}

/** A store whose groups of the named owner are altered on the way in, to prove IM-11 (not the operation) refuses. */
function tamperStore(
  inner: CampaignStore,
  owner: string,
  mutate: (g: CommitGroup) => CommitGroup,
): { store: CampaignStore; tampered: () => number } {
  let n = 0;
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
      if (group.owner !== owner) return inner.commit(g);
      n += 1;
      return inner.commit(mutate(group));
    },
  };
  return { store, tampered: () => n };
}

const accessFacts = (s: EpistemicSeeded) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("access/"));

describe("owner exclusivity: only the Epistemic owner writes Epistemic state — not the carrier's owner, not the actor owner (acceptance 1, 13)", () => {
  it("every other registered owner — including the owner of the very carrier the event rests on — is refused all three key spaces", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const owners: [string, string][] = [
      ["world_state", "world_profile"],
      ["world_state", "world_fallback_physical_entity"],
      ["pc_existence", "existence_contract"],
      ["role_registry", "player_character_binding"],
      ["temporal_kernel", "temporal_coordination"],
      ["population", "population_state"],
      ["production", "production_state"],
      ["economy", "economy_state"],
      ["logistics", "logistics_state"],
      ["named_actor", "actor_profile"],
      [SYNTH_ACCESS_SOURCE_OWNER, "synthetic-access-source"],
      [SYNTH_ACTOR_HISTORY_OWNER, "synthetic-actor-history"],
      [SYNTH_CAPABILITY_CONSUMER_OWNER, "synthetic-capability-consumer"],
      [SYNTH_PACKET_CONSUMER_OWNER, "synthetic-packet-consumer"],
    ];
    let n = 0;
    for (const [owner, facet] of owners)
      for (const key of [eventKey, packetKey, provKey])
        expect(
          await codeOf(s.campaign.store.commit(raw(s, { owner, facet, key }, n++))),
          `${owner} → ${key}`,
        ).toBe("KEY_NOT_ADMITTED");
    expect(accessFacts(s)).toEqual([]);
  });

  it("an unregistered owner, a wrong facet and a fallback owner are refused: there is no generic fallback", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    for (const [owner, facet] of [
      ["epistemic", "epistemic_access"],
      ["epistemic_accesses", "epistemic_access"],
      ["epistemic_access", "access_event"],
      ["epistemic_access", "packet"],
      ["epistemic_access", "sealed_provenance"],
      ["access", "epistemic_access"],
      ["generic", "fallback"],
      ["information", "epistemic_access"],
      ["host", "epistemic_access"],
      ["role.gm", "epistemic_access"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(raw(s, { owner, facet }, 1))),
        owner + facet,
      ).toBe("OWNER_NOT_REGISTERED");
  });

  it("the Epistemic owner cannot write a foreign key space, nor an unmodelled access key (broadcast, audience, comprehension, belief…)", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL);
    for (const key of [
      "world/w1/profile",
      "pc/p1/existence-contract",
      "role-registry/binding/role.player_character",
      "population/l1/ledger",
      "production/reserve/r1",
      "economy/demand/d1",
      "logistics/commitment/w/e",
      "actor/a1/capability/c1",
      "temporal/state",
      "kti/exposure/x",
      "synthetic-packet-consumer/result/x",
      "access/e1",
      "access/e1/broadcast",
      "access/e1/audience/a1",
      "access/e1/cohort/c1",
      "access/e1/comprehension/a1",
      "access/e1/belief/a1",
      "access/e1/packet",
      "access/e1/packet/a1/extra",
      "access/e1/provenance",
      "access/e1/event/extra",
      "accesses/e1/event",
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { key }, 2))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
  });

  it("an access key the Epistemic owner already holds cannot be taken over by another owner's group", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL);
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            owner: "world_state",
            facet: "world_profile",
            key: eventKey,
            expected_version: 1,
          }),
        ),
      ),
    ).toBe("FACT_OWNER_CONFLICT");
  });

  it("canonical publication needs role.archivist + permission.canon.write: a persona, player, GM or host role writes nothing", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    for (const authority of [
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.archivist", permission: "permission.player_choice.commit" },
      { role: "role.gm", permission: "permission.canon.write" },
      { role: "role.world", permission: "permission.canon.write" },
      { role: "host.tool", permission: "permission.canon.write" },
      { role: "persona.steward", permission: "permission.canon.write" },
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { authority }, 3)))).toBe(
        "AUTHORITY_DENIED",
      );
    expect(accessFacts(s)).toEqual([]);
  });

  it("the adapter exposes two authored event publications (one per immutable mode) and typed reads: no packet writer, setter, broadcast lowering, retrieval, reclassification or comprehension method", () => {
    const methods = adapterMethods(EpistemicAccessAdapter);
    expect(methods).toEqual(expectedAdapterMethods("EpistemicAccessAdapter"));
    expect(
      methods.filter((m) =>
        /set|update|write|broadcast|lower|retriev|reclass|comprehen|infer|believe|credib|copy|transfer|tick|sweep|expose/i.test(
          m,
        ),
      ),
      // the only such names are the event-only BROADCAST_EXPOSURE publication and its typed read: nothing lowers, expands,
      // retrieves or reclassifies it
    ).toEqual(["broadcastExposure", "establishBroadcastExposure"]);
  });
});

describe("raw and tampered values are refused by IM-11 (acceptance 6, 7, 8, 10, 11)", () => {
  it("an event with a malformed or forbidden value is refused: no BROADCAST_EXPOSURE, no audience, no group, no extra recipient, no number", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const e = accessEvent(EVENT_COUNCIL, A);
    for (const bad of [
      { ...e, mode: "BROADCAST_EXPOSURE" },
      { ...e, mode: "UNKNOWN" },
      { ...e, participants: [A, ACTOR_OTHER] },
      { ...e, participants: [] },
      { ...e, audience: { area: "town" } },
      { ...e, cohort: { id: "council" } },
      { ...e, membership: ["a"] },
      { ...e, office: "warden" },
      { ...e, comprehension: "understood" },
      { ...e, relevance: 3 },
      { ...e, channel: "BROADCAST" },
      { ...e, representation: { capability_id: C, minimum: "B" } },
      { ...e, payload: { ...e.payload, content: `leaks ${e.source.fact_key}` } },
      "event",
      null,
      [],
      {},
    ])
      expect(
        await codeOf(s.campaign.store.commit(raw(s, { value: bad }))),
        JSON.stringify(bad),
      ).toBe("VALUE_INVALID");
    expect(accessFacts(s)).toEqual([]);
  });

  it("a mismatch between the key's identities and the value's identities is refused for all three kinds", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    expect(await codeOf(s.campaign.store.commit(raw(s, { key: accessEventKey("e-other") })))).toBe(
      "VALUE_INVALID",
    );
    await establishAccess(s, 1, EVENT_COUNCIL);
    const f = formation(s);
    const [packetW, provW] = f.writes;
    // a packet addressed to another recipient than its key names
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...f,
          writes: [{ ...packetW!, key: accessPacketKey(EVENT_COUNCIL, ACTOR_OTHER) }, provW!],
        }),
      ),
    ).toBe("VALUE_INVALID");
    // a provenance for another event/recipient than its key names
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...f,
          writes: [packetW!, { ...provW!, key: accessProvenanceKey(EVENT_SCHEMATIC, A) }],
        }),
      ),
    ).toBe("VALUE_INVALID");
    expect(s.access.packet(EVENT_COUNCIL, A)).toBeUndefined();
  });

  it("a group that writes anything but one create-only event or one packet-and-provenance pair is refused", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const w = raw(s).writes[0]!;
    expect(
      await codeOf(
        s.campaign.store.commit(
          raw(s, {
            writes: [
              w,
              { ...w, key: accessEventKey("e-second"), value: accessEvent("e-second", A) as never },
            ],
          }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    await establishAccess(s, 1, EVENT_COUNCIL);
    const f = formation(s);
    const [packetW, provW] = f.writes;
    for (const writes of [
      [packetW!],
      [provW!],
      [provW!, packetW!],
      [
        packetW!,
        provW!,
        { ...w, key: accessEventKey("e-third"), value: accessEvent("e-third", A) as never },
      ],
    ])
      expect(await codeOf(s.campaign.store.commit({ ...f, writes }))).toBe("VALUE_INVALID");
    expect(s.access.packet(EVENT_COUNCIL, A)).toBeUndefined();
  });

  it("the packet and the sealed provenance carry their own access class: an engine-sealed packet, an actor-accessible provenance or event, or any other label is refused", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    for (const secrecy of [ACCESS_CLASS_ACTOR_ACCESSIBLE, "fixture-visibility", "public"])
      expect(await codeOf(s.campaign.store.commit(raw(s, { secrecy }, 5)))).toBe("VALUE_INVALID");
    await establishAccess(s, 1, EVENT_COUNCIL);
    const f = formation(s);
    const [packetW, provW] = f.writes;
    for (const writes of [
      [{ ...packetW!, secrecy: ACCESS_CLASS_ENGINE_SEALED }, provW!],
      [packetW!, { ...provW!, secrecy: ACCESS_CLASS_ACTOR_ACCESSIBLE }],
      [
        { ...packetW!, secrecy: "x" },
        { ...provW!, secrecy: "x" },
      ],
    ])
      expect(await codeOf(s.campaign.store.commit({ ...f, writes }))).toBe("VALUE_INVALID");
    expect(s.access.packet(EVENT_COUNCIL, A)).toBeUndefined();
  });
});

describe("lawful establishment: a causal route over a committed, pinned, foreign carrier (acceptance 1, 9)", () => {
  it("a source that is not committed is refused: access is never established from nothing, from objective truth or from bare knowledge", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const ghost = accessEvent(EVENT_COUNCIL, A, {
      source: {
        owner: SYNTH_ACCESS_SOURCE_OWNER,
        fact_key: sourceKey("never-committed"),
        version: 1,
      },
    });
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({ ...accessPublication(1), event: ghost }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(s.access.event(EVENT_COUNCIL)).toBeUndefined();
  });

  it("a source pinned at a version that is not current, or not pinned by the group at all, is refused", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await must(
      s.campaign.store.commit(
        sourceGroup(
          FIXTURE_CAMPAIGN,
          80,
          SOURCE_SPEAKER,
          "SYNTHETIC FIXTURE: a later carrier state",
          1,
        ),
      ),
    );
    // the event pins version 1 but the carrier is now at version 2
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(1),
          event: accessEvent(EVENT_COUNCIL, A),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // a raw group that does not pin its carrier
    expect(await codeOf(s.campaign.store.commit(raw(s, { reads: [], depends_on: [] })))).toBe(
      "REFERENCE_INVALID",
    );
    expect(s.access.event(EVENT_COUNCIL)).toBeUndefined();
  });

  it("a source owned by another owner than it names, the Epistemic owner itself, the kernel or a Named-Actor capability is refused", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const real = accessEvent(EVENT_COUNCIL, A).source;
    const withSource = (source: unknown) =>
      accessEvent(EVENT_COUNCIL, A, { source: source as never });
    const publish = (event: AccessEvent, n: number) =>
      codeOf(s.access.establishBoundedSharedAccess({ ...accessPublication(n), event }));
    // wrong owner named for a real fact
    expect(await publish(withSource({ ...real, owner: "world_state" }), 1)).toBe(
      "REFERENCE_INVALID",
    );
    // kernel coordination state is no information source
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    expect(
      await publish(
        withSource({ owner: "temporal_kernel", fact_key: clock.key, version: clock.version }),
        2,
      ),
    ).toBe("REFERENCE_INVALID");
    // the Epistemic owner's own state is no source (an access never grounds itself)
    await establishAccess(s, 3, "event-first");
    const own = s.access.event("event-first")!.fact;
    expect(
      await publish(
        withSource({ owner: "epistemic_access", fact_key: own.key, version: own.version }),
        4,
      ),
    ).toBe("REFERENCE_INVALID");
    // a Named-Actor capability is read only at its close, never an information source
    await establishCapability(s, 5);
    const basis = s.actors.basis(A, C)!.fact;
    expect(
      await publish(
        withSource({ owner: "named_actor", fact_key: basis.key, version: basis.version }),
        6,
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.access.event(EVENT_COUNCIL)).toBeUndefined();
  });

  it("no access for a Player Character's identity (bound or merely released), an entity under player control or a Population ledger: the Epistemic owner serves no PC cognition", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(1),
          event: accessEvent("e-pc", FIXTURE_PC_ID),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    const s2 = await seededEpistemicCampaign(tempDir(), { canonical: false });
    await must(
      s2.campaign.releasePlayerCharacter({
        ...publication(3),
        contract: fixtureContract({ pc_id: "pc-unbound" }),
      }),
    );
    expect(
      await codeOf(
        s2.access.establishBoundedSharedAccess({
          ...accessPublication(1),
          event: accessEvent("e-pc", "pc-unbound"),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    const pop = new PopulationAdapter(s.campaign.store);
    await must(pop.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(2),
          event: accessEvent("e-pop", "ledger-main"),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    expect(accessFacts(s)).toEqual([]);
    expect(accessFacts(s2)).toEqual([]);
  });

  it("access cannot lie in the canonical future, nor in another unit: no future-state leak, no backdated route beyond the basis", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const publish = (event: AccessEvent, n: number) =>
      codeOf(s.access.establishBoundedSharedAccess({ ...accessPublication(n), event }));
    expect(await publish(accessEvent(EVENT_COUNCIL, A, { established_at: at(101) }), 1)).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await publish(
        accessEvent(EVENT_COUNCIL, A, { established_at: { unit: "other-unit", value: 1 } }),
        2,
      ),
    ).toBe("REFERENCE_INVALID");
    // at or before the canonical basis is lawful
    expect(await publish(accessEvent(EVENT_COUNCIL, A, { established_at: at(100) }), 3)).toBe("OK");
    expect(await publish(accessEvent(EVENT_SCHEMATIC, A, { established_at: at(7) }), 4)).toBe("OK");
  });

  it("the event is sealed: its mode, participant reference and payload can be neither reclassified nor rewritten, even through the owner", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL);
    const before = structuredClone(s.campaign.store.getFact(eventKey)!);
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(2),
          event: accessEvent(EVENT_COUNCIL, ACTOR_OTHER),
        }),
      ),
    ).toBe("VERSION_CONFLICT");
    for (const value of [
      accessEvent(EVENT_COUNCIL, ACTOR_OTHER),
      { ...accessEvent(EVENT_COUNCIL, A), mode: "BROADCAST_EXPOSURE" },
      accessEvent(EVENT_COUNCIL, A, {
        payload: { ...accessEvent(EVENT_COUNCIL, A).payload, content: "a more convenient payload" },
      }),
    ])
      expect(await codeOf(s.campaign.store.commit(raw(s, { expected_version: 1, value })))).toBe(
        "AMENDMENT_NOT_SUPPORTED",
      );
    expect(s.campaign.store.getFact(eventKey)).toEqual(before);
    expect(s.access.event(EVENT_COUNCIL)!.value.mode).toBe("BOUNDED_SHARED_ACCESS");
  });

  it("BROADCAST_EXPOSURE requested through the recipient-set method fails closed: not simulated by recipient copying or any approximation, and nothing is written", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const before = s.campaign.store.head();
    const broadcast = { ...accessEvent(EVENT_COUNCIL, A), mode: "BROADCAST_EXPOSURE" };
    const r = await s.access.establishBoundedSharedAccess({
      ...accessPublication(1),
      event: broadcast,
    });
    expect(!r.ok && r.error.code).toBe("BROADCAST_EXPOSURE_UNSUPPORTED");
    expect(!r.ok && r.error.message).toMatch(/not a recipient set/);
    // the approximations are refused as plain invalid input: many recipient copies, a bounded set of many, an audience
    for (const event of [
      { ...accessEvent(EVENT_COUNCIL, A), participants: [A, ACTOR_SWORD, ACTOR_OTHER] },
      { ...accessEvent(EVENT_COUNCIL, A), audience: { reach: "town" } },
      { ...accessEvent(EVENT_COUNCIL, A), mode: "BOUNDED_SHARED_ACCESS", cohort: { id: "town" } },
    ]) {
      const approx = await s.access.establishBoundedSharedAccess({
        ...accessPublication(2),
        event,
      });
      expect(!approx.ok && approx.error.code).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.head()).toEqual(before);
    expect(accessFacts(s)).toEqual([]);
  });

  it("the secrecy class is the owner's, never the caller's: a caller-supplied label cannot make an event actor-accessible", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await must(
      s.access.establishBoundedSharedAccess({
        ...accessPublication(1),
        secrecy: ACCESS_CLASS_ACTOR_ACCESSIBLE,
        event: accessEvent(EVENT_COUNCIL, A),
      } as never),
    );
    expect(s.access.event(EVENT_COUNCIL)!.fact.secrecy).toBe(ACCESS_CLASS_ENGINE_SEALED);
  });

  it("invalid input is refused with nothing committed: a malformed publication or event", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const before = s.campaign.store.head();
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({
          ...accessPublication(1),
          intent_id: "",
          event: accessEvent(EVENT_COUNCIL, A),
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(
        s.access.establishBoundedSharedAccess({ ...accessPublication(2), event: { nope: true } }),
      ),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(s.access.establishBoundedSharedAccess({ ...accessPublication(3), event: null })),
    ).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(before);
  });
});

describe("a packet is exactly what its committed event determines, only as its stage, under an open transaction (acceptance 4, 5, 6, 7, 13)", () => {
  it("no packet exists without its committed event: a raw formation, even exactly shaped, has nothing to derive from", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL);
    const f = formation(s);
    const ghostEvent = "event-ghost";
    const ghostStage = accessPacketStage(ghostEvent, A);
    const [packetW, provW] = f.writes;
    const ghost = formation(s, {
      writes: [
        { ...packetW!, key: accessPacketKey(ghostEvent, A) },
        {
          ...provW!,
          key: accessProvenanceKey(ghostEvent, A),
          value: {
            ...(provW!.value as any),
            event: { fact_key: accessEventKey(ghostEvent), version: 1 },
            packet: { fact_key: accessPacketKey(ghostEvent, A) },
          },
        },
      ],
      group_id: stageGroupId(ghostStage),
      intent_id: stageIntentId(ghostStage),
      cause: "transaction:tx-fake",
    });
    expect(await codeOf(s.campaign.store.commit(ghost))).toBe("PREREQUISITE_MISSING");
    expect(accessFacts(s).map((x) => x.key)).toEqual([eventKey]);
  });

  it("a stage commits only under the stage identity and a durable open transaction authority: a forged or absent cause publishes nothing", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL);
    const identity = { group_id: stageGroupId(stage), intent_id: stageIntentId(stage) };
    // the right content under an ordinary group identity
    expect(
      await codeOf(
        s.campaign.store.commit(
          formation(s, {
            group_id: "g-ordinary",
            intent_id: "i-ordinary",
            cause: "transaction:tx-x",
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // the right stage identity, but a cause no transaction ever opened
    expect(
      await codeOf(
        s.campaign.store.commit(
          formation(s, { ...identity, cause: "transaction:tx-never-opened" }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    // the right stage identity, but not caused by a transaction at all
    expect(
      await codeOf(
        s.campaign.store.commit(formation(s, { ...identity, cause: "someone-said-so" })),
      ),
    ).toBe("REFERENCE_INVALID");
    // the right identities, but the group does not read exactly its event
    const clock = s.campaign.store.getFact(TEMPORAL_STATE_KEY)!;
    expect(
      await codeOf(
        s.campaign.store.commit(
          formation(s, {
            ...identity,
            cause: "transaction:tx-never-opened",
            reads: [
              { key: eventKey, version: 1 },
              { key: clock.key, version: clock.version },
            ],
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.access.packet(EVENT_COUNCIL, A)).toBeUndefined();
  });

  it("a stage group whose content is not what the event determines publishes nothing: a tampered payload, attribution, access, intelligibility, recipient or provenance is refused", async () => {
    const mutations: Record<string, (packet: any, prov: any) => [any, any]> = {
      "payload rewritten": (p, v) => [
        { ...p, payload: { ...p.payload, content: "a more convenient payload" } },
        v,
      ],
      "attribution replaced by the true source": (p, v) => [
        { ...p, presented_attribution: v.source.fact_key },
        v,
      ],
      "access result upgraded": (p, v) => [
        { ...p, access: { ...p.access, channel: "PERCEPTION" } },
        v,
      ],
      "intelligibility upgraded to a capability": (p, v) => [
        {
          ...p,
          intelligibility: {
            result: "REPRESENTATION_ACCESSIBLE",
            basis: "ESTABLISHED_CAPABILITY",
            capability: {
              capability_id: C,
              fact_key: actorCapabilityKey(A, C),
              version: 1,
              close: { name: "actor-profile-capability-close", group_id: "g" },
            },
          },
        },
        v,
      ],
      "recipient changed": (p, v) => [{ ...p, recipient: ACTOR_OTHER }, v],
      "true source leaked into the packet": (p, v) => [{ ...p, source: v.source }, v],
      "event reference leaked into the packet": (p, v) => [{ ...p, event_id: EVENT_COUNCIL }, v],
      "comprehension added to the packet": (p, v) => [{ ...p, comprehension: "understood" }, v],
      "provenance source replaced": (p, v) => [
        p,
        { ...v, source: { ...v.source, fact_key: sourceKey(SOURCE_SCROLL) } },
      ],
      "provenance capability invented": (p, v) => [
        p,
        {
          ...v,
          capability_close: { fact_key: actorCapabilityKey(A, C), version: 1, committed_by: "g" },
        },
      ],
      "provenance payload added": (p, v) => [p, { ...v, payload: p.payload }],
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const s = await seededEpistemicCampaign(tempDir());
      const e = await establishAccess(s, 1, EVENT_COUNCIL);
      await registerPacketConsumer(s, "c1", e, null, 2);
      const t = tamperStore(s.campaign.store, "epistemic_access", (g) => {
        if (g.writes.length !== 2) return g;
        const [p, v] = mutate(g.writes[0]!.value, g.writes[1]!.value);
        return {
          ...g,
          writes: [
            { ...g.writes[0]!, value: p },
            { ...g.writes[1]!, value: v },
          ],
        };
      });
      const r = await must(
        new TemporalCoordinator(t.store, epistemicProviders()).advance(
          packetAdvanceRequest("tx-1", "c1"),
        ),
      );
      expect(t.tampered(), name).toBe(1);
      expect(
        r.rejections.map((x) => x.code),
        name,
      ).toEqual([expect.stringMatching(/VALUE_INVALID|REFERENCE_INVALID/)]);
      expect(s.access.packet(EVENT_COUNCIL, A), name).toBeUndefined();
      expect(s.access.engineSealedProvenance(EVENT_COUNCIL, A), name).toBeUndefined();
      expect(s.campaign.store.getFact(packetConsumerResultKey("c1")), name).toBeUndefined();
      expect(r.transaction.outcome.stop_reason, name).toBe("DEPENDENCY_UNRESOLVED");
      await s.campaign.close();
    }
  });

  it("a formation that drops a declared read, or reads another fact, is refused", async () => {
    const mutations: Record<string, (g: CommitGroup) => CommitGroup> = {
      "no reads": (g) => ({
        ...g,
        reads: [],
        depends_on: [g.depends_on[g.depends_on.length - 1]!],
      }),
      "a stale event version": (g) => ({ ...g, reads: [{ ...g.reads[0]!, version: 9 }] }),
      "an extra read": (g) => ({
        ...g,
        reads: [...g.reads, { key: sourceKey(SOURCE_SPEAKER), version: 1 }],
        depends_on: [g.depends_on[0]!, "g-source", ...g.depends_on.slice(1)],
      }),
      "the wrong dependency": (g) => ({
        ...g,
        depends_on: ["some-other-group", ...g.depends_on.slice(1)],
      }),
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const s = await seededEpistemicCampaign(tempDir());
      const e = await establishAccess(s, 1, EVENT_COUNCIL);
      await registerPacketConsumer(s, "c1", e, null, 2);
      const t = tamperStore(s.campaign.store, "epistemic_access", mutate);
      const r = await must(
        new TemporalCoordinator(t.store, epistemicProviders()).advance(
          packetAdvanceRequest("tx-1", "c1"),
        ),
      );
      expect(r.rejections.length, name).toBe(1);
      expect(s.access.packet(EVENT_COUNCIL, A), name).toBeUndefined();
      await s.campaign.close();
    }
  });

  it("a committed packet and provenance are sealed: re-formation, improvement or any rewrite is refused, even through the owner", async () => {
    const s = await seededEpistemicCampaign(tempDir());
    const e = await establishAccess(s, 1, EVENT_COUNCIL);
    await registerPacketConsumer(s, "c1", e, null, 2);
    await must(advance(s));
    const sealed = structuredClone(accessFacts(s));
    // a rival formation under a new identity (a fresh create) conflicts with the committed slot
    expect(await codeOf(s.campaign.store.commit(formation(s)))).toMatch(
      /^(VERSION_CONFLICT|REFERENCE_INVALID)$/,
    );
    // an overwrite of either surface is an unsupported amendment
    const f = formation(s);
    for (const writes of [
      [
        { ...f.writes[0]!, expected_version: 1 },
        { ...f.writes[1]!, expected_version: 1 },
      ],
    ])
      expect(await codeOf(s.campaign.store.commit({ ...f, writes }))).toBe(
        "AMENDMENT_NOT_SUPPORTED",
      );
    expect(accessFacts(s)).toEqual(sealed);
  });
});

describe("a PC-authorship boundary holds at the formation as well as at the event (acceptance 1, 15)", () => {
  it("an entity that comes under player control between the event and the formation gets no packet: the formation fails closed; independent work resolves", async () => {
    const s = await seededEpistemicCampaign(tempDir(), { canonical: false });
    const late = await establishAccess(s, 1, EVENT_COUNCIL, "actor-late-pc");
    const free = await establishAccess(s, 2, EVENT_SCHEMATIC, ACTOR_SWORD, {
      source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
    });
    await registerPacketConsumer(s, "c-late", late, null, 3);
    await registerPacketConsumer(s, "c-free", free, null, 4);
    // the entity is released as a Player Character before its packet forms
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(3),
        contract: fixtureContract({ pc_id: "actor-late-pc" }),
      }),
    );
    const r = await must(advance(s, "tx-mixed", "c-free"));
    expect(r.rejections.map((x) => x.code)).toEqual(["KEY_NOT_ADMITTED"]);
    expect(s.access.packet(EVENT_COUNCIL, "actor-late-pc")).toBeUndefined();
    expect(s.access.engineSealedProvenance(EVENT_COUNCIL, "actor-late-pc")).toBeUndefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c-late"))).toBeUndefined();
    expect(s.access.packet(EVENT_SCHEMATIC, ACTOR_SWORD)).toBeDefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c-free"))).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("temporal registration: access is visible downstream only as the formed packet, AS-OF-NOW (acceptance 2, 5, 6, 9)", () => {
  async function registry() {
    const s = await seededEpistemicCampaign(tempDir());
    const basis = await establishCapability(s, 1);
    const e = await establishAccess(s, 2, EVENT_SCHEMATIC, A, {
      representation: { capability_id: C },
    });
    const plain = await establishAccess(s, 3, EVENT_COUNCIL, ACTOR_SWORD, {
      source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
    });
    let n = 10;
    const reg = (over: any, event: AccessEvent = e, withBasis = true) =>
      codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(n++),
          object: packetConsumerObject("c1", event, withBasis ? basis : null, over),
        }),
      );
    return { s, basis, e, plain, reg };
  }

  it("refuses a consequence that reads the engine-side event or the sealed provenance, a packet read that is not NOW, an Epistemic-owned object and a forged stage", async () => {
    const { s, e, plain, reg } = await registry();
    const decls = packetConsumerObject("c1", plain, null).dependencies;
    const stageDecl = decls[0]!;
    const consumerDecl = decls[1]!;
    const nowRead = (key: string, extra: any = {}) => ({
      mode: "AS-OF-NOW",
      source: { owner: "epistemic_access", fact_key: key },
      invalidators: [],
      ...extra,
    });
    const consuming = (read: any) => ({ ...consumerDecl, reads: [read] });
    const plainReg = (dependencies: any[]) => reg({ dependencies }, plain, false);
    // an actor-side consequence never reads the engine-side event
    expect(await plainReg([stageDecl, consuming(nowRead(accessEventKey(EVENT_COUNCIL)))])).toBe(
      "REFERENCE_INVALID",
    );
    // nor the Sealed Engine Provenance
    expect(
      await plainReg([
        stageDecl,
        consuming(nowRead(accessProvenanceKey(EVENT_COUNCIL, ACTOR_SWORD))),
      ]),
    ).toBe("REFERENCE_INVALID");
    // nor the packet at any mode other than NOW
    expect(
      await plainReg([
        stageDecl,
        consuming({
          mode: "AS-OF-DECLARED-CLOSE",
          source: {
            owner: "epistemic_access",
            fact_key: accessPacketKey(EVENT_COUNCIL, ACTOR_SWORD),
          },
          close_basis: { name: "c", producer: { owner: "epistemic_access", operation: "o" } },
          invalidators: [],
        }),
      ]),
    ).toBe("REFERENCE_INVALID");
    // an Epistemic-owned engagement
    expect(
      await reg({ owning_ref: { owner: "epistemic_access", process_id: "p" } }, plain, false),
    ).toBe("REFERENCE_INVALID");
    // a forged stage (different reads) and a forged stage that also reads the capability NOW
    expect(await plainReg([{ ...stageDecl, reads: [] }, consumerDecl])).toBe("REFERENCE_INVALID");
    const capStage = packetConsumerObject("c1", e, s.actors.basis(A, C)!.value).dependencies;
    expect(
      await reg({
        dependencies: [
          capStage[0]!,
          {
            ...capStage[1]!,
            reads: [
              capStage[1]!.reads[0]!,
              {
                mode: "AS-OF-NOW",
                source: { owner: "named_actor", fact_key: actorCapabilityKey(A, C) },
                invalidators: [],
              },
            ],
          },
          capStage[2]!,
        ],
      }),
    ).toBe("REFERENCE_INVALID");
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/object/")),
    ).toEqual([]);
    // the lawful shape is accepted
    expect(await reg({}, plain, false)).toBe("OK");
  });

  it("a consequence cannot conjure the access it needs: its object is refused without a committed event, and without a committed capability basis", async () => {
    const { s, basis } = await registry();
    const ghost = accessEvent("event-ghost", A, { representation: { capability_id: C } });
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(40),
          object: packetConsumerObject("c1", ghost, basis),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(accessEventKey("event-ghost"))).toBeUndefined();
    expect(
      s.campaign.store.listFacts().filter((f) => f.key.startsWith("temporal/object/")),
    ).toEqual([]);
  });

  it("a stage outside the Epistemic owner cannot declare that it produces an Epistemic key", async () => {
    const { s, plain } = await registry();
    const decls = packetConsumerObject("c1", plain, null).dependencies;
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(50),
          object: packetConsumerObject("c1", plain, null, {
            dependencies: [
              decls[0]!,
              {
                ...packetConsumerDeclaration("c1", EVENT_COUNCIL, ACTOR_SWORD),
                produces: [accessPacketKey("event-elsewhere", ACTOR_SWORD)],
              },
            ],
          }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
  });

  it("a formation whose required capability was never established stays unresolved: no packet, no capability invented, no default intelligibility", async () => {
    const { s } = await registry();
    const needsOther = await establishAccess(s, 41, "event-needs-other", A, {
      representation: { capability_id: "capability-unestablished" },
    });
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(42),
        object: packetConsumerObject("c2", needsOther, null),
      }),
    );
    const r = await must(advance(s, "tx-unestablished", "c2"));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents.map((u) => u.reason)).toEqual([
      "PREDECESSOR_ABSENT",
      "PREDECESSOR_BLOCKED",
    ]);
    expect(s.access.packet("event-needs-other", A)).toBeUndefined();
    expect(s.access.engineSealedProvenance("event-needs-other", A)).toBeUndefined();
    expect(
      s.campaign.store.getFact(actorCapabilityKey(A, "capability-unestablished")),
    ).toBeUndefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c2"))).toBeUndefined();
  });

  it("a formation whose capability close is not declared is unresolved — fail closed — and publishes nothing", async () => {
    const { s, basis, e } = await registry();
    const all = packetConsumerObject("c1", e, basis).dependencies;
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(60),
        object: packetConsumerObject("c1", e, basis, { dependencies: [all[1]!, all[2]!] }),
      }),
    );
    const before = s.campaign.store.head().revision;
    const r = await must(advance(s));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents[0]!.reason).toBe("PREDECESSOR_ABSENT");
    expect(s.access.packet(EVENT_SCHEMATIC, A)).toBeUndefined();
    expect(s.actors.capability(A, C)).toBeUndefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c1"))).toBeUndefined();
    // only the transaction's own kernel records were written
    const added = s.campaign.store
      .listFacts()
      .filter((f) => s.campaign.store.lookupReceipt(f.provenance.intent_id)!.revision > before);
    expect(added.every((f) => f.owner === "temporal_kernel")).toBe(true);
  });
});

describe("load-time verification fails closed on Epistemic drift (acceptance 13, 14)", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    opts: { complete?: boolean; capability?: boolean } = {},
  ) {
    const s = await seededEpistemicCampaign(tempDir());
    const basis = opts.capability === false ? null : await establishCapability(s, 1);
    const e = await establishAccess(
      s,
      2,
      EVENT_COUNCIL,
      A,
      basis ? { representation: { capability_id: C } } : {},
    );
    await registerPacketConsumer(s, "c1", e, basis, 3);
    if (opts.complete !== false) await must(advance(s));
    const inner = s.campaign.store;
    const facts = mutate(structuredClone([...inner.listFacts()]) as OwnerFact[]);
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
    const out = verifyEpistemicIntegrity(bound);
    await s.campaign.close();
    return out.map((v) => v.message).join(" | ");
  }
  const edit = (key: string, f: (v: any, fact: any) => void) => (facts: OwnerFact[]) => {
    f(
      facts.find((x) => x.key === key)!.value,
      facts.find((x) => x.key === key),
    );
    return facts;
  };

  it("healthy campaigns verify before the formation and after it, with and without a capability requirement", async () => {
    expect(await drifted((f) => f)).toBe("");
    expect(await drifted((f) => f, { complete: false })).toBe("");
    expect(await drifted((f) => f, { capability: false })).toBe("");
    expect(await drifted((f) => f, { capability: false, complete: false })).toBe("");
  });

  it("detects a packet that is not what its event determines, or whose capability-close reference drifted", async () => {
    for (const f of [
      (v: any) => (v.payload.content = "a more convenient payload"),
      (v: any) => (v.presented_attribution = null),
      (v: any) => (v.access.channel = "PERCEPTION"),
      (v: any) => (v.intelligibility.capability.version = 2),
      (v: any) => (v.intelligibility.capability.close.group_id = "elsewhere"),
      (v: any) =>
        (v.intelligibility = {
          result: "REPRESENTATION_ACCESSIBLE",
          basis: "NO_CAPABILITY_DEPENDENCY",
        }),
    ])
      expect(await drifted(edit(packetKey, f))).toMatch(
        /exactly what its committed event determines/,
      );
  });

  it("detects sealed provenance that is not the engine-side record of its packet, and a provenance or packet missing its partner", async () => {
    for (const f of [
      (v: any) => (v.source.fact_key = sourceKey(SOURCE_SCROLL)),
      (v: any) => (v.channel = "PERCEPTION"),
      (v: any) => (v.capability_close = null),
      (v: any) => (v.event.version = 2),
    ])
      expect(await drifted(edit(provKey, f))).toMatch(/engine-side record of its packet/);
    expect(await drifted((f) => f.filter((x) => x.key !== provKey))).toMatch(
      /sealed provenance, which is absent/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== packetKey))).toMatch(
      /sealed provenance exists only with the packet/,
    );
    expect(
      await drifted(edit(provKey, (_v, fact) => (fact.provenance.group_id = "another-group"))),
    ).toMatch(/written together/);
  });

  it("detects the two surfaces carrying the wrong access class", async () => {
    expect(
      await drifted(edit(packetKey, (_v, fact) => (fact.secrecy = ACCESS_CLASS_ENGINE_SEALED))),
    ).toMatch(/actor-accessible access class/);
    expect(
      await drifted(edit(provKey, (_v, fact) => (fact.secrecy = ACCESS_CLASS_ACTOR_ACCESSIBLE))),
    ).toMatch(/each with its own access class/);
    expect(
      await drifted(edit(eventKey, (_v, fact) => (fact.secrecy = ACCESS_CLASS_ACTOR_ACCESSIBLE))),
    ).toMatch(/engine-side/);
  });

  it("detects a packet with no event or no capability, an event that names another recipient, and a source that is gone, foreign or not committed first", async () => {
    expect(await drifted((f) => f.filter((x) => x.key !== eventKey))).toMatch(/no committed event/);
    expect(await drifted((f) => f.filter((x) => x.key !== actorCapabilityKey(A, C)))).toMatch(
      /capability that is not committed/,
    );
    expect(await drifted(edit(eventKey, (v) => (v.participants = [ACTOR_OTHER])))).toMatch(
      /no committed event naming its recipient/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== sourceKey(SOURCE_SPEAKER)))).toMatch(
      /source is committed/,
    );
    expect(
      await drifted(edit(sourceKey(SOURCE_SPEAKER), (_v, fact) => (fact.owner = "world_state"))),
    ).toMatch(/owned by its named owner/);
    expect(
      await drifted(edit(sourceKey(SOURCE_SPEAKER), (_v, fact) => (fact.version = 0))),
    ).toMatch(/not behind its pin/);
    expect(
      await drifted(
        edit(
          sourceKey(SOURCE_SPEAKER),
          (_v, fact) => (fact.provenance.intent_id = "access-intent-2"),
        ),
      ),
    ).toMatch(/not committed before the event/);
    expect(await drifted(edit(eventKey, (v) => (v.source.owner = "named_actor")))).toMatch(
      /never as an information source/,
    );
  });

  it("detects access established in the canonical future", async () => {
    expect(await drifted(edit(eventKey, (v) => (v.established_at = at(5000))))).toMatch(
      /never in its future/,
    );
  });

  it("detects a packet that is no stage (provenance drift) and one that no transaction credits and no object awaits", async () => {
    expect(
      await drifted(edit(packetKey, (_v, fact) => (fact.provenance.group_id = "raw-group"))),
    ).not.toBe("");
    expect(
      await drifted(edit(packetKey, (_v, fact) => (fact.provenance.intent_id = "raw-intent"))),
    ).not.toBe("");
    expect(
      await drifted((f) =>
        f.filter(
          (x) =>
            !x.key.startsWith("temporal/transaction/") ||
            x.key.startsWith("temporal/transaction-authority/"),
        ),
      ),
    ).toMatch(/credited by no resolution transaction/);
  });

  it("detects a recipient that was a Player Character or a Population ledger when its event was committed", async () => {
    const early = (facts: OwnerFact[]) =>
      facts.find((x) => x.key.startsWith("world/"))!.provenance.intent_id;
    const addAt = (key: string) => (facts: OwnerFact[]) => {
      const template = structuredClone(facts.find((x) => x.key.startsWith("world/"))!);
      return [
        ...facts,
        { ...template, key, provenance: { ...template.provenance, intent_id: early(facts) } },
      ];
    };
    expect(await drifted(addAt(pcExistenceContractKey(A)))).toMatch(/Player Character/);
    expect(await drifted(addAt(populationLedgerKey(A)))).toMatch(/Population ledger/);
  });

  it("detects a hand-written object that reads the event or the sealed provenance, a forged stage or a standalone Epistemic object", async () => {
    const tamper = (f: (o: any) => void) => (facts: OwnerFact[]) => {
      const obj = facts.find((x) => x.key.startsWith("temporal/object/"))!;
      f(obj.value);
      return facts;
    };
    const readOf = (key: string) => ({
      mode: "AS-OF-NOW",
      source: { owner: "epistemic_access", fact_key: key },
      invalidators: [],
    });
    // dependencies: [actor close, epistemic formation, consumer]
    expect(
      await drifted(
        tamper((o) => (o.dependencies[2] = { ...o.dependencies[2], reads: [readOf(eventKey)] })),
      ),
    ).toMatch(/engine-side/);
    expect(
      await drifted(
        tamper((o) => (o.dependencies[2] = { ...o.dependencies[2], reads: [readOf(provKey)] })),
      ),
    ).toMatch(/never an actor-admissible input/);
    expect(
      await drifted(tamper((o) => (o.dependencies[1] = { ...o.dependencies[1], reads: [] }))),
    ).toMatch(/exactly the declaration derived/);
    expect(
      await drifted(tamper((o) => (o.owning_ref = { owner: "epistemic_access", process_id: "p" }))),
    ).toMatch(/no standalone/);
  });
});

void [actorCapabilityBasisKey, epistemicPacketDeclaration, historyKey];
