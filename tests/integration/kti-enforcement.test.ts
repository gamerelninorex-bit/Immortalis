/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// KTI Managed Transfer Package — enforcement that does not depend on the coordinator or on the owner operation behaving.
// IM-11 admission holds for a raw `store.commit` and for a TAMPERED group; owner exclusivity holds for everyone, including
// the Epistemic and Named-Actor owners; a transfer is never conjured by a consequence, a bare membership, an authority, a
// stale or foreign packet reference, an unsupported subject or an unlowered broadcast; the package is sealed; hand-written
// temporal objects are refused; no same-resolution KTI consequence is visible or flows back; and load-time verification
// fails closed on drift.
// Register lineage: IA-02, IA-03, IA-04 (partial), IA-06 (partial), IA-14 (partial), IA-16 (partial); RC-02, RC-03, RC-04,
// RC-07, RC-11, RC-16; IM-02, IM-03, IM-09, IM-10, IM-11, IM-12, IM-17. Local success is NOT provider/recovery acceptance
// (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  ACCESS_CLASS_ACTOR_ACCESSIBLE,
  ACCESS_CLASS_ENGINE_SEALED,
  ACCESS_CLASS_KTI_ENGINE_SIDE,
  CANON_WRITE_AUTHORITY,
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  actorCapabilityKey,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  ktiTransferStage,
  pcExistenceContractKey,
  populationLedgerKey,
  type CommitGroup,
  type OwnerFact,
} from "@immortalis/contracts";
import {
  KTI_RULE,
  KtiAdapter,
  TemporalCoordinator,
  deriveTransferPackage,
  epistemicPacketDeclaration,
  ktiTransferDeclaration,
  stageGroupId,
  stageIntentId,
  verifyKtiIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_METALWORKING,
  EVENT_COUNCIL,
  EVENT_LATER,
  EVENT_SCHEMATIC,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  OBJECT_GATE_ROTA,
  OBJECT_OTHER,
  SOURCE_PARTY_OTHER,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  SYNTH_ACTOR_HISTORY_OWNER,
  SYNTH_CAPABILITY_CONSUMER_OWNER,
  SYNTH_KTI_CONSUMER_OWNER,
  SYNTH_PACKET_CONSUMER_OWNER,
  accessEvent,
  accessPublication,
  fixtureContract,
  ktiBasis,
  ktiConsumerDeclaration,
  ktiConsumerObject,
  ktiConsumerResultKey,
  ktiObject,
  ktiProviders,
  ktiPublication,
  ledgerInput,
  popPublication,
  publication,
  sourceKey,
  temporalPublication,
} from "@immortalis/testkit";
import { PopulationAdapter } from "@immortalis/engine";
import {
  advanceKti,
  establishObject,
  establishTransfer,
  ktiConsumerObjectAt,
  registerKtiConsumer,
  requestToBoundary,
  sealPacket,
  seededKtiCampaign,
  type KtiSeeded,
} from "../support/kti.ts";
import { codeOf, must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const objectKey = ktiDevelopmentObjectKey(OBJECT_GATE_ROTA);
const basisDefault = ktiBasis(A, EVENT_COUNCIL);
const basisKey = ktiTransferBasisKey(basisDefault.package_id);
const packageKey = ktiTransferPackageKey(basisDefault.package_id);
const stage = ktiTransferStage(basisDefault.package_id);
const packetKey = accessPacketKey(EVENT_COUNCIL, A);
const provKey = accessProvenanceKey(EVENT_COUNCIL, A);
const advance = (s: KtiSeeded, id = "tx-1", consumer = "k1") => advanceKti(s, id, consumer);

const gid = (s: KtiSeeded, key: string) => s.campaign.store.getFact(key)!.provenance.group_id;

/** A sealed packet, a committed object and a committed basis: the prerequisites of every package scenario. */
async function prepared(s: KtiSeeded) {
  await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
  await establishObject(s, 1);
  return establishTransfer(s, 2, A, EVENT_COUNCIL);
}

const wr = (
  key: string,
  value: unknown,
  over: { owner?: string; facet?: string; secrecy?: string; expected_version?: number } = {},
) => ({
  key,
  owner: over.owner ?? "kti",
  facet: over.facet ?? "kti_development",
  value: value as never,
  unit: null,
  basis: "kti-fixture-basis",
  secrecy: over.secrecy ?? ACCESS_CLASS_KTI_ENGINE_SIDE,
  expected_version: over.expected_version ?? 0,
});

/** A raw object group exactly as an unauthorized (or sloppy) caller might build it: no registry, no adapter. */
function rawObject(
  over: Partial<CommitGroup> & { key?: string; value?: unknown; secrecy?: string } = {},
  n = 900,
): CommitGroup {
  const { key, value, secrecy, ...group } = over;
  const owner = group.owner ?? "kti";
  const facet = group.facet ?? "kti_development";
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner,
    facet,
    group_id: `raw-group-${n}`,
    intent_id: `raw-intent-${n}`,
    cause: `raw-cause-${n}`,
    rule: KTI_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [],
    depends_on: [],
    writes: [
      wr(key ?? objectKey, "value" in over ? value : ktiObject(), {
        owner,
        facet,
        ...(secrecy ? { secrecy } : {}),
      }),
    ],
    ...group,
  };
}

/** A raw basis group pinning the three facts it rests on, built from the committed state. */
function rawBasis(
  s: KtiSeeded,
  over: Partial<CommitGroup> & { value?: unknown; key?: string; secrecy?: string } = {},
  n = 901,
): CommitGroup {
  const { value, key, secrecy, ...group } = over;
  const b = ("value" in over ? value : basisDefault) as any;
  const reads = [objectKey, packetKey, provKey].map((k) => ({
    key: k,
    version: s.campaign.store.getFact(k)?.version ?? 0,
  }));
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "kti",
    facet: "kti_development",
    group_id: `raw-basis-group-${n}`,
    intent_id: `raw-basis-intent-${n}`,
    cause: `raw-basis-cause-${n}`,
    rule: KTI_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads,
    depends_on: [...new Set([objectKey, packetKey, provKey].map((k) => gid(s, k)))],
    writes: [
      wr(key ?? ktiTransferBasisKey(b?.package_id ?? basisDefault.package_id), b, {
        ...(secrecy ? { secrecy } : {}),
      }),
    ],
    ...group,
  };
}

/** A raw package group built from the values the committed basis determines (the lawful content, any identity). */
function formation(s: KtiSeeded, over: Partial<CommitGroup> = {}): CommitGroup {
  const basisFact = s.campaign.store.getFact(basisKey)!;
  const packetFact = s.campaign.store.getFact(packetKey)!;
  const objectFact = s.campaign.store.getFact(objectKey)!;
  const derived = deriveTransferPackage({
    basis: {
      key: basisFact.key,
      owner: basisFact.owner,
      version: basisFact.version,
      value: basisFact.value as any,
    },
    packet: {
      key: packetFact.key,
      owner: packetFact.owner,
      version: packetFact.version,
      value: packetFact.value as any,
    },
    object: {
      key: objectFact.key,
      owner: objectFact.owner,
      version: objectFact.version,
      value: objectFact.value as any,
    },
  });
  if (!derived.ok) throw new Error("fixture");
  return {
    campaign_id: FIXTURE_CAMPAIGN,
    owner: "kti",
    facet: "kti_development",
    group_id: "raw-formation-group",
    intent_id: "raw-formation-intent",
    cause: "raw-formation-cause",
    rule: KTI_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [basisFact, packetFact, objectFact].map((f) => ({ key: f.key, version: f.version })),
    depends_on: [basisFact, packetFact, objectFact].map((f) => f.provenance.group_id),
    writes: [wr(packageKey, derived.value)],
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

const ktiFacts = (s: KtiSeeded) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("kti/"));

describe("owner exclusivity: only the KTI owner writes KTI state — not the Epistemic owner, not the actor owner, not a consumer (acceptance 1, 8, 10)", () => {
  it("every other registered owner is refused all three key spaces", async () => {
    const s = await seededKtiCampaign(tempDir());
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
      ["epistemic_access", "epistemic_access"],
      [SYNTH_ACCESS_SOURCE_OWNER, "synthetic-access-source"],
      [SYNTH_ACTOR_HISTORY_OWNER, "synthetic-actor-history"],
      [SYNTH_CAPABILITY_CONSUMER_OWNER, "synthetic-capability-consumer"],
      [SYNTH_PACKET_CONSUMER_OWNER, "synthetic-packet-consumer"],
      [SYNTH_KTI_CONSUMER_OWNER, "synthetic-kti-result-consumer"],
    ];
    let n = 0;
    for (const [owner, facet] of owners)
      for (const key of [objectKey, basisKey, packageKey])
        expect(
          await codeOf(s.campaign.store.commit(rawObject({ owner, facet, key }, n++))),
          `${owner} → ${key}`,
        ).toBe("KEY_NOT_ADMITTED");
    expect(ktiFacts(s)).toEqual([]);
  });

  it("an unregistered owner, a wrong facet and a fallback owner are refused: there is no generic fallback", async () => {
    const s = await seededKtiCampaign(tempDir());
    for (const [owner, facet] of [
      ["kti_owner", "kti_development"],
      ["ktis", "kti_development"],
      ["kti", "development"],
      ["kti", "transfer_package"],
      ["kti", "kti"],
      ["knowledge", "kti_development"],
      ["technology", "kti_development"],
      ["generic", "fallback"],
      ["host", "kti_development"],
      ["role.gm", "kti_development"],
    ] as const)
      expect(
        await codeOf(s.campaign.store.commit(rawObject({ owner, facet }, 1))),
        owner + facet,
      ).toBe("OWNER_NOT_REGISTERED");
  });

  it("the KTI owner cannot write a foreign key space, nor an unmodelled KTI key (relationship, encounter, competence, institution, adoption…)", async () => {
    const s = await seededKtiCampaign(tempDir());
    await establishObject(s, 1);
    for (const key of [
      "world/w1/profile",
      "pc/p1/existence-contract",
      "role-registry/binding/role.player_character",
      "population/l1/ledger",
      "production/reserve/r1",
      "economy/demand/d1",
      "logistics/commitment/w/e",
      "actor/a1/capability/c1",
      "actor/a1/capability-basis/c1",
      "access/e1/event",
      "access/e1/packet/a1",
      "access/e1/provenance/a1",
      "institution/i1",
      "temporal/state",
      "synthetic-kti-result-consumer/result/x",
      "kti/object",
      "kti/object/o1/extra",
      "kti/relationship/f1/o1",
      "kti/encounter/a1/o1",
      "kti/competence/a1/o1",
      "kti/adoption/f1/o1",
      "kti/transfer/p1",
      "kti/transfer/p1/result",
      "kti/transfer/p1/package/extra",
      "ktis/object/o1",
    ])
      expect(await codeOf(s.campaign.store.commit(rawObject({ key }, 2))), key).toMatch(
        /^(KEY_NOT_ADMITTED|FACT_OWNER_CONFLICT)$/,
      );
  });

  it("a KTI key the KTI owner already holds cannot be taken over by another owner's group", async () => {
    const s = await seededKtiCampaign(tempDir());
    await establishObject(s, 1);
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawObject({ owner: "world_state", facet: "world_profile", key: objectKey }),
        ),
      ),
    ).toBe("FACT_OWNER_CONFLICT");
  });

  it("canonical publication needs role.archivist + permission.canon.write: a persona, player, GM or host role writes nothing", async () => {
    const s = await seededKtiCampaign(tempDir());
    for (const authority of [
      { role: "role.player", permission: "permission.player_choice.commit" },
      { role: "role.archivist", permission: "permission.player_choice.commit" },
      { role: "role.gm", permission: "permission.canon.write" },
      { role: "role.world", permission: "permission.canon.write" },
      { role: "host.tool", permission: "permission.canon.write" },
      { role: "persona.steward", permission: "permission.canon.write" },
    ])
      expect(await codeOf(s.campaign.store.commit(rawObject({ authority }, 3)))).toBe(
        "AUTHORITY_DENIED",
      );
    expect(ktiFacts(s)).toEqual([]);
  });

  it("the adapter exposes two authored publications and typed reads: no package writer, setter, completion, retirement, competence, adoption, broadcast or lowering method", () => {
    const methods = Object.getOwnPropertyNames(KtiAdapter.prototype)
      .filter((m) => m !== "constructor")
      .sort();
    expect(methods).toEqual([
      "developmentObject",
      "establishDevelopmentObject",
      "establishTransferBasis",
      "transferBasis",
      "transferPackage",
    ]);
    expect(
      methods.filter((m) =>
        /set|update|write|complete|retire|close|fail|abandon|compet|adopt|reproduc|diffus|broadcast|lower|encounter|comprehen|infer|belief|copy|tick|sweep|expose|train/i.test(
          m,
        ),
      ),
    ).toEqual([]);
  });
});

describe("raw and tampered values are refused by IM-11 (acceptance 4, 5, 9, 10)", () => {
  it("a development object with a malformed or forbidden value is refused: no faction, institution, actor, Population, competence, number or unknown class", async () => {
    const s = await seededKtiCampaign(tempDir());
    const o = ktiObject();
    for (const bad of [
      { ...o, object_class: "TECH_TREE_NODE" },
      { ...o, materiality: "SOMETIMES" },
      { ...o, referent: "the gate rota" },
      { ...o, label: "the gate rota" },
      { ...o, alias: ["rota"] },
      { ...o, faction: "f1" },
      { ...o, institution: "i1" },
      { ...o, actor: "a1" },
      { ...o, headcount: 12 },
      { ...o, competence: "B" },
      { ...o, maturity: "MATURE" },
      { ...o, level: 3 },
      { ...o, score: 0.5 },
      { ...o, adoption: "wide" },
      { ...o, population_ref: "l1" },
      "object",
      null,
      [],
      {},
    ])
      expect(
        await codeOf(s.campaign.store.commit(rawObject({ value: bad }))),
        JSON.stringify(bad),
      ).toBe("VALUE_INVALID");
    expect(ktiFacts(s)).toEqual([]);
  });

  it("a development object depends on nothing foreign and carries the engine-side class: a pinned read, a dependency or another label is refused", async () => {
    const s = await seededKtiCampaign(tempDir());
    for (const secrecy of [ACCESS_CLASS_ACTOR_ACCESSIBLE, ACCESS_CLASS_ENGINE_SEALED, "public"])
      expect(await codeOf(s.campaign.store.commit(rawObject({ secrecy }, 4)))).toBe(
        "VALUE_INVALID",
      );
    const src = s.campaign.store.getFact(sourceKey(SOURCE_SPEAKER))!;
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawObject({
            reads: [{ key: src.key, version: src.version }],
            depends_on: [src.provenance.group_id],
          }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(rawObject({ key: ktiDevelopmentObjectKey("other-id") })),
      ),
    ).toBe("VALUE_INVALID");
    expect(ktiFacts(s)).toEqual([]);
  });

  it("a basis with a malformed or forbidden value is refused: no BROADCAST_EXPOSURE, no audience, cohort, faction, many recipients, comprehension or number", async () => {
    const s = await prepareNothing();
    const b = basisDefault;
    for (const bad of [
      { ...b, mode: "BROADCAST_EXPOSURE" },
      { ...b, mode: "BOUNDED_SHARED_ACCESS" },
      { ...b, management: "TRIVIAL" },
      { ...b, recipient: undefined },
      { ...b, recipients: [A, ACTOR_SWORD] },
      { ...b, audience: { area: "town" } },
      { ...b, cohort: { id: "council" } },
      { ...b, faction: "f1" },
      { ...b, scope: "organization" },
      { ...b, institution: "i1" },
      { ...b, comprehension: "understood" },
      { ...b, competence: "B" },
      { ...b, adoption: "full" },
      { ...b, score: 1 },
      { ...b, packet: { ...b.packet, version: 0 } },
      { ...b, packet: { ...b.packet, event: EVENT_COUNCIL } },
      { ...b, source: { owner: "x", fact_key: "y" } },
      { ...b, source_id: { owner: "x", fact_key: "y" } },
      { ...b, source_id: "" },
      { ...b, true_source: "carrier" },
      { ...b, development_object: { ...b.development_object, extra: 1 } },
      "basis",
      null,
      {},
    ])
      expect(
        await codeOf(s.campaign.store.commit(rawBasis(s, { value: bad, key: basisKey }))),
        JSON.stringify(bad),
      ).toMatch(/^(VALUE_INVALID|SCHEMA_INVALID)$/);
    expect(s.kti.transferBasis(basisDefault.package_id)).toBeUndefined();
  });

  async function prepareNothing() {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await establishObject(s, 1);
    return s;
  }

  it("a mismatch between the key's identity and the value's identity is refused for all three kinds", async () => {
    const s = await prepareNothing();
    expect(
      await codeOf(
        s.campaign.store.commit(rawObject({ key: ktiDevelopmentObjectKey("other-object") }, 1)),
      ),
    ).toBe("VALUE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(rawBasis(s, { key: ktiTransferBasisKey("transfer-other") })),
      ),
    ).toBe("VALUE_INVALID");
    await establishTransfer(s, 2, A, EVENT_COUNCIL);
    const f = formation(s);
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...f,
          writes: [{ ...f.writes[0]!, key: ktiTransferPackageKey("transfer-other") }],
        }),
      ),
    ).toBe("VALUE_INVALID");
    expect(s.kti.transferPackage(basisDefault.package_id)).toBeUndefined();
  });

  it("a group that writes anything but one create-only object, basis or package is refused", async () => {
    const s = await prepareNothing();
    // (the default object already exists: two NEW objects in one group)
    const w = {
      ...rawObject().writes[0]!,
      key: ktiDevelopmentObjectKey(OBJECT_OTHER),
      value: ktiObject(OBJECT_OTHER) as never,
    };
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawObject({
            writes: [
              w,
              {
                ...w,
                key: ktiDevelopmentObjectKey("kti-object-third"),
                value: ktiObject("kti-object-third") as never,
              },
            ],
          }),
        ),
      ),
    ).toBe("VALUE_INVALID");
    // an object and a basis together, a package with a basis, and an empty group
    const rb = rawBasis(s);
    expect(await codeOf(s.campaign.store.commit({ ...rb, writes: [rb.writes[0]!, w] }))).toBe(
      "VALUE_INVALID",
    );
    expect(await codeOf(s.campaign.store.commit({ ...rb, writes: [] }))).not.toBe("OK");
    expect(s.kti.transferBasis(basisDefault.package_id)).toBeUndefined();
  });

  it("the secrecy class is the owner's, never the caller's: a caller-supplied label cannot make KTI state actor-accessible", async () => {
    const s = await seededKtiCampaign(tempDir());
    await must(
      s.kti.establishDevelopmentObject({
        ...ktiPublication(1),
        secrecy: ACCESS_CLASS_ACTOR_ACCESSIBLE,
        object: ktiObject(),
      } as never),
    );
    expect(s.kti.developmentObject(OBJECT_GATE_ROTA)!.fact.secrecy).toBe(
      ACCESS_CLASS_KTI_ENGINE_SIDE,
    );
  });

  it("invalid input is refused with nothing committed: a malformed publication, object or transfer", async () => {
    const s = await seededKtiCampaign(tempDir());
    const before = s.campaign.store.head();
    expect(
      await codeOf(
        s.kti.establishDevelopmentObject({
          ...ktiPublication(1),
          intent_id: "",
          object: ktiObject(),
        }),
      ),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(
        s.kti.establishDevelopmentObject({ ...ktiPublication(2), object: { nope: true } }),
      ),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(s.kti.establishTransferBasis({ ...ktiPublication(3), transfer: null })),
    ).toBe("INPUT_INVALID");
    expect(
      await codeOf(s.kti.establishTransferBasis({ ...ktiPublication(4), transfer: { nope: 1 } })),
    ).toBe("INPUT_INVALID");
    expect(s.campaign.store.head()).toEqual(before);
  });
});

describe("unsupported BROADCAST_EXPOSURE, cohort and audience lowering fails closed and writes nothing (acceptance 5, 9)", () => {
  it("BROADCAST_EXPOSURE fails closed through the adapter: not simulated by recipient copying or any approximation", async () => {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await establishObject(s, 1);
    const before = s.campaign.store.head();
    const r = await s.kti.establishTransferBasis({
      ...ktiPublication(2),
      transfer: { ...basisDefault, mode: "BROADCAST_EXPOSURE" },
    });
    expect(!r.ok && r.error.code).toBe("BROADCAST_EXPOSURE_UNSUPPORTED");
    expect(!r.ok && r.error.message).toMatch(/never receipt/);
    for (const transfer of [
      { ...basisDefault, recipients: [A, ACTOR_SWORD, ACTOR_OTHER] },
      { ...basisDefault, audience: { reach: "town" } },
      { ...basisDefault, cohort: { id: "town" } },
      { ...basisDefault, faction: "f1" },
      { ...basisDefault, scope: "organization" },
    ]) {
      const approx = await s.kti.establishTransferBasis({ ...ktiPublication(3), transfer });
      expect(!approx.ok && approx.error.code).toBe("INPUT_INVALID");
    }
    expect(s.campaign.store.head()).toEqual(before);
    expect(s.kti.transferBasis(basisDefault.package_id)).toBeUndefined();
  });
});

describe("a transfer is established only over a sealed, supporting, correctly referenced packet (acceptance 2, 3, 10)", () => {
  it("a packet reference that is stale, foreign, an event or provenance key, not committed or another recipient's is refused", async () => {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await establishObject(s, 1);
    const publish = (transfer: unknown, n: number) =>
      codeOf(s.kti.establishTransferBasis({ ...ktiPublication(100 + n), transfer }));
    const b = basisDefault;
    // pinned at a version that is not current
    expect(await publish({ ...b, packet: { ...b.packet, version: 2 } }, 1)).toBe(
      "REFERENCE_INVALID",
    );
    // the engine-side event, the sealed provenance and a foreign fact are not packets
    expect(
      await publish({ ...b, packet: { fact_key: accessEventKey(EVENT_COUNCIL), version: 1 } }, 2),
    ).toBe("REFERENCE_INVALID");
    expect(await publish({ ...b, packet: { fact_key: provKey, version: 1 } }, 3)).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await publish({ ...b, packet: { fact_key: sourceKey(SOURCE_SPEAKER), version: 1 } }, 4),
    ).toBe("REFERENCE_INVALID");
    // a packet that was never sealed
    expect(
      await publish({ ...b, packet: { fact_key: accessPacketKey(EVENT_LATER, A), version: 1 } }, 5),
    ).toBe("PREREQUISITE_MISSING");
    // another recipient's packet named for this recipient
    await sealPacket(s, 3, 4, EVENT_SCHEMATIC, ACTOR_SWORD, "seal-2");
    expect(
      await publish(
        { ...b, packet: { fact_key: accessPacketKey(EVENT_SCHEMATIC, ACTOR_SWORD), version: 1 } },
        6,
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.kti.transferBasis(b.package_id)).toBeUndefined();
    expect(ktiFacts(s).map((f) => f.key)).toEqual([objectKey]);
  });

  it("a development object that is not committed, not KTI's, not current or not supported by the packet is refused", async () => {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    const publish = (transfer: unknown, n: number) =>
      codeOf(s.kti.establishTransferBasis({ ...ktiPublication(100 + n), transfer }));
    // no object yet
    expect(await publish(basisDefault, 1)).toBe("PREREQUISITE_MISSING");
    await establishObject(s, 1);
    const b = basisDefault;
    expect(
      await publish({ ...b, development_object: { ...b.development_object, version: 2 } }, 2),
    ).toBe("REFERENCE_INVALID");
    // a foreign fact named as the object
    const foreign = ktiBasis(A, EVENT_COUNCIL, OBJECT_GATE_ROTA, {
      development_object: {
        object_id: OBJECT_GATE_ROTA,
        fact_key: sourceKey(SOURCE_SPEAKER),
        version: 1,
      },
    });
    expect(await publish(foreign, 3)).toBe("REFERENCE_INVALID");
    // another canonical object: the packet's referent is not that object's identity, so it does not support it
    await establishObject(s, 2, OBJECT_OTHER);
    const other = ktiBasis(A, EVENT_COUNCIL, OBJECT_OTHER);
    const r = await s.kti.establishTransferBasis({ ...ktiPublication(104), transfer: other });
    expect(!r.ok && r.error.code).toBe("REFERENCE_INVALID");
    expect(!r.ok && r.error.message).toMatch(/does not support the development object/);
    expect(s.kti.transferBasis(b.package_id)).toBeUndefined();
    expect(s.kti.transferBasis(other.package_id)).toBeUndefined();
  });

  it("the package identity is exactly what source_id × recipient × object determine: a forged identity is refused, and a source_id unlike the F-014D true source is lawful", async () => {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await establishObject(s, 1);
    const publish = (transfer: unknown, n: number) =>
      codeOf(s.kti.establishTransferBasis({ ...ktiPublication(100 + n), transfer }));
    // an identity that is not derived from (source_id, recipient, object)
    expect(await publish({ ...basisDefault, package_id: "transfer-forged" }, 3)).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await publish(
        { ...basisDefault, package_id: ktiBasis(ACTOR_SWORD, EVENT_COUNCIL).package_id },
        4,
      ),
    ).toBe("REFERENCE_INVALID");
    // another source_id with the identity of the first is refused too
    expect(await publish({ ...basisDefault, source_id: SOURCE_PARTY_OTHER }, 5)).toBe(
      "REFERENCE_INVALID",
    );
    expect(ktiFacts(s).map((f) => f.key)).toEqual([objectKey]);
    // a programme source that is the F-014D carrier's own identity is lawful, as is any other opaque identity: nothing
    // ties source_id to the sealed provenance
    for (const [n, source_id] of [
      [6, "actor-sponsor"],
      [7, SOURCE_SPEAKER],
      [8, SOURCE_PARTY_OTHER],
    ] as const)
      expect(await publish(ktiBasis(A, EVENT_COUNCIL, OBJECT_GATE_ROTA, { source_id }), n)).toBe(
        "OK",
      );
  });

  it("a basis does not pin the three facts it rests on, or pins them stale: a raw group that drops a read or a dependency is refused", async () => {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await establishObject(s, 1);
    const f = rawBasis(s);
    expect(await codeOf(s.campaign.store.commit({ ...f, reads: [], depends_on: [] }))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await codeOf(s.campaign.store.commit({ ...f, reads: f.reads.slice(0, 2) }))).toBe(
      "REFERENCE_INVALID",
    );
    expect(await codeOf(s.campaign.store.commit({ ...f, depends_on: [] }))).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...f,
          reads: [{ ...f.reads[0]!, version: 9 }, f.reads[1]!, f.reads[2]!],
        }),
      ),
    ).toBe("STALE_READ");
    expect(s.kti.transferBasis(basisDefault.package_id)).toBeUndefined();
    // the lawful group commits
    expect(await codeOf(s.campaign.store.commit(f))).toBe("OK");
  });

  it("no transfer for a Player Character's identity or an entity that came under player control after its packet was sealed", async () => {
    const s = await seededKtiCampaign(tempDir(), { canonical: false });
    await sealPacket(s, 1, 2, EVENT_COUNCIL, "actor-late-pc");
    await establishObject(s, 1);
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(3),
        contract: fixtureContract({ pc_id: "actor-late-pc" }),
      }),
    );
    expect(
      await codeOf(
        s.kti.establishTransferBasis({
          ...ktiPublication(2),
          transfer: ktiBasis("actor-late-pc", EVENT_COUNCIL),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    expect(ktiFacts(s).map((f) => f.key)).toEqual([objectKey]);
    // and the Player Character / Population ledger identities never reach a packet, hence never a transfer
    const s2 = await seededKtiCampaign(tempDir());
    const pop = new PopulationAdapter(s2.campaign.store);
    await must(pop.establishLedger({ ...popPublication(1), ledger: ledgerInput() }));
    expect(
      await codeOf(
        s2.access.establishBoundedSharedAccess({
          ...accessPublication(1),
          event: accessEvent("e-pop", "ledger-main"),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
    expect(
      await codeOf(
        s2.access.establishBoundedSharedAccess({
          ...accessPublication(2),
          event: accessEvent("e-pc", FIXTURE_PC_ID),
        }),
      ),
    ).toBe("KEY_NOT_ADMITTED");
  });

  it("the sealed basis and object are create-only: a second declaration, a rewritten referent or any amendment is refused, even through the owner", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    const objBefore = structuredClone(s.campaign.store.getFact(objectKey)!);
    const basisBefore = structuredClone(s.campaign.store.getFact(basisKey)!);
    // re-declaring either slot through the owner conflicts with the committed slot
    expect(
      await codeOf(s.kti.establishDevelopmentObject({ ...ktiPublication(5), object: ktiObject() })),
    ).toBe("VERSION_CONFLICT");
    expect(
      await codeOf(s.kti.establishTransferBasis({ ...ktiPublication(6), transfer: basis })),
    ).toBe("VERSION_CONFLICT");
    // an overwrite is an unsupported amendment
    expect(
      await codeOf(
        s.campaign.store.commit(
          rawObject({
            value: ktiObject(OBJECT_GATE_ROTA, { object_class: "TECHNIQUE_TECHNOLOGY" }),
            reads: [],
            writes: [
              {
                ...wr(
                  objectKey,
                  ktiObject(OBJECT_GATE_ROTA, { object_class: "TECHNIQUE_TECHNOLOGY" }),
                ),
                expected_version: 1,
              },
            ],
          }),
        ),
      ),
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...rawBasis(s),
          writes: [{ ...wr(basisKey, basis), expected_version: 1 }],
        }),
      ),
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(s.campaign.store.getFact(objectKey)).toEqual(objBefore);
    expect(s.campaign.store.getFact(basisKey)).toEqual(basisBefore);
  });
});

describe("a package is exactly what its basis determines, only as its stage, under an open transaction (acceptance 4, 6, 7, 10)", () => {
  it("no package exists without its committed basis: a raw formation, even exactly shaped, has nothing to derive from", async () => {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await establishObject(s, 1);
    const ghost = ktiBasis(A, EVENT_COUNCIL, OBJECT_GATE_ROTA, { source_id: SOURCE_PARTY_OTHER });
    const ghostStage = ktiTransferStage(ghost.package_id);
    const f = rawBasis(s);
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...f,
          group_id: stageGroupId(ghostStage),
          intent_id: stageIntentId(ghostStage),
          cause: "transaction:tx-fake",
          writes: [
            wr(ktiTransferPackageKey(ghost.package_id), {
              package_id: ghost.package_id,
              status: "ACTIVE",
              source_id: ghost.source_id,
              recipient: A,
              development_object: ghost.development_object,
              packet: ghost.packet,
              basis: { fact_key: ktiTransferBasisKey(ghost.package_id), version: 1 },
              close: { name: "kti-result-close", stage: ghostStage },
            }),
          ],
        }),
      ),
    ).toBe("PREREQUISITE_MISSING");
    expect(ktiFacts(s).map((x) => x.key)).toEqual([objectKey]);
  });

  it("a stage commits only under the stage identity and a durable open transaction authority: a forged or absent cause publishes nothing", async () => {
    const s = await seededKtiCampaign(tempDir());
    await prepared(s);
    const identity = { group_id: stageGroupId(stage), intent_id: stageIntentId(stage) };
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
    expect(
      await codeOf(
        s.campaign.store.commit(
          formation(s, { ...identity, cause: "transaction:tx-never-opened" }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(
      await codeOf(
        s.campaign.store.commit(formation(s, { ...identity, cause: "someone-said-so" })),
      ),
    ).toBe("REFERENCE_INVALID");
    // the right identities, but the group does not read exactly its basis, packet and object
    expect(
      await codeOf(
        s.campaign.store.commit(
          formation(s, { ...identity, cause: "transaction:tx-never-opened", reads: [] }),
        ),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.kti.transferPackage(basisDefault.package_id)).toBeUndefined();
  });

  it("a stage group whose content is not what the basis determines publishes nothing: a tampered status, source, recipient, packet, object, basis, close or extra field is refused", async () => {
    const mutations: Record<string, (p: any) => any> = {
      "status completed": (p) => ({ ...p, status: "COMPLETED" }),
      "status retired": (p) => ({ ...p, status: "RETIRED" }),
      "source replaced": (p) => ({
        ...p,
        source_id: SOURCE_PARTY_OTHER,
      }),
      "recipient changed": (p) => ({ ...p, recipient: ACTOR_OTHER }),
      "packet re-pinned": (p) => ({ ...p, packet: { ...p.packet, version: 2 } }),
      "packet swapped": (p) => ({
        ...p,
        packet: { fact_key: accessPacketKey(EVENT_LATER, A), version: 1 },
      }),
      "object re-pinned": (p) => ({
        ...p,
        development_object: { ...p.development_object, version: 2 },
      }),
      "basis re-pinned": (p) => ({ ...p, basis: { ...p.basis, version: 2 } }),
      "close renamed": (p) => ({ ...p, close: { ...p.close, name: "another-close" } }),
      "close stage replaced": (p) => ({
        ...p,
        close: { ...p.close, stage: ktiTransferStage("transfer-other") },
      }),
      "identity forged": (p) => ({ ...p, package_id: "transfer-forged" }),
      "comprehension added": (p) => ({ ...p, comprehension: "understood" }),
      "competence added": (p) => ({ ...p, competence: "PARTIAL" }),
      "adoption added": (p) => ({ ...p, adoption: "full" }),
      "event leaked": (p) => ({ ...p, event_id: EVENT_COUNCIL }),
      "provenance leaked": (p) => ({ ...p, provenance: { channel: "SPEECH" } }),
      "audience added": (p) => ({ ...p, audience: ["all"] }),
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const s = await seededKtiCampaign(tempDir());
      const basis = await prepared(s);
      await registerKtiConsumer(s, "k1", basis, 3);
      const t = tamperStore(s.campaign.store, "kti", (g) =>
        g.writes[0]!.key === packageKey
          ? { ...g, writes: [{ ...g.writes[0]!, value: mutate(g.writes[0]!.value) }] }
          : g,
      );
      const r = await must(
        new TemporalCoordinator(t.store, ktiProviders()).advance(
          requestToBoundary(s, "tx-1", "kti-consumer-obj-k1"),
        ),
      );
      expect(t.tampered(), name).toBe(1);
      expect(
        r.rejections.map((x) => x.code),
        name,
      ).toEqual([expect.stringMatching(/VALUE_INVALID|REFERENCE_INVALID/)]);
      expect(s.kti.transferPackage(basis.package_id), name).toBeUndefined();
      expect(s.campaign.store.getFact(ktiConsumerResultKey("k1")), name).toBeUndefined();
      expect(r.transaction.outcome.stop_reason, name).toBe("DEPENDENCY_UNRESOLVED");
      await s.campaign.close();
    }
  }, 30_000);
  it("a package under the wrong access class is refused: the actor-accessible, the Epistemic engine-sealed or any other label", async () => {
    for (const secrecy of [
      ACCESS_CLASS_ACTOR_ACCESSIBLE,
      ACCESS_CLASS_ENGINE_SEALED,
      "kti-fixture-secrecy",
    ]) {
      const s = await seededKtiCampaign(tempDir());
      const basis = await prepared(s);
      await registerKtiConsumer(s, "k1", basis, 3);
      const t = tamperStore(s.campaign.store, "kti", (g) =>
        g.writes[0]!.key === packageKey ? { ...g, writes: [{ ...g.writes[0]!, secrecy }] } : g,
      );
      const r = await must(
        new TemporalCoordinator(t.store, ktiProviders()).advance(
          requestToBoundary(s, "tx-1", "kti-consumer-obj-k1"),
        ),
      );
      expect(
        r.rejections.map((x) => x.code),
        secrecy,
      ).toEqual(["VALUE_INVALID"]);
      expect(s.kti.transferPackage(basis.package_id)).toBeUndefined();
      await s.campaign.close();
    }
  }, 30_000);
  it("a result close that drops a declared read, or reads another fact, is refused", async () => {
    const mutations: Record<string, (g: CommitGroup) => CommitGroup> = {
      "no reads": (g) => ({
        ...g,
        reads: [],
        depends_on: [g.depends_on[g.depends_on.length - 1]!],
      }),
      "a stale packet version": (g) => ({
        ...g,
        reads: [g.reads[0]!, { ...g.reads[1]!, version: 9 }, g.reads[2]!],
      }),
      "an extra read": (g) => ({
        ...g,
        reads: [...g.reads, { key: sourceKey(SOURCE_SPEAKER), version: 1 }],
        depends_on: [...g.depends_on.slice(0, 3), "g-source", ...g.depends_on.slice(3)],
      }),
      "the provenance read": (g) => ({
        ...g,
        reads: [g.reads[0]!, { key: provKey, version: 1 }, g.reads[2]!],
      }),
      "the wrong dependency": (g) => ({
        ...g,
        depends_on: ["some-other-group", ...g.depends_on.slice(1)],
      }),
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const s = await seededKtiCampaign(tempDir());
      const basis = await prepared(s);
      await registerKtiConsumer(s, "k1", basis, 3);
      const t = tamperStore(s.campaign.store, "kti", (g) =>
        g.writes[0]!.key === packageKey ? mutate(g) : g,
      );
      const r = await must(
        new TemporalCoordinator(t.store, ktiProviders()).advance(
          requestToBoundary(s, "tx-1", "kti-consumer-obj-k1"),
        ),
      );
      expect(r.rejections.length, name).toBe(1);
      expect(s.kti.transferPackage(basis.package_id), name).toBeUndefined();
      await s.campaign.close();
    }
  }, 30_000);
  it("a committed package is sealed: re-publication, improvement or any rewrite is refused, even through the owner", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const sealed = structuredClone(ktiFacts(s));
    expect(await codeOf(s.campaign.store.commit(formation(s)))).toMatch(
      /^(VERSION_CONFLICT|REFERENCE_INVALID)$/,
    );
    const f = formation(s);
    expect(
      await codeOf(
        s.campaign.store.commit({ ...f, writes: [{ ...f.writes[0]!, expected_version: 1 }] }),
      ),
    ).toBe("AMENDMENT_NOT_SUPPORTED");
    expect(ktiFacts(s)).toEqual(sealed);
  });

  it("the packet sealed before the package is the only packet the package can rest on: it cannot be re-pinned to a later packet of the programme", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await sealPacket(s, 3, 4, EVENT_LATER, A);
    // the basis (sealed) pins the first packet; a package derived against the later packet is not what the basis determines
    const f = formation(s);
    const later = s.campaign.store.getFact(accessPacketKey(EVENT_LATER, A))!;
    const pkg: any = structuredClone(f.writes[0]!.value);
    pkg.packet = { fact_key: later.key, version: later.version };
    expect(
      await codeOf(
        s.campaign.store.commit({
          ...f,
          writes: [wr(packageKey, pkg)],
          reads: [f.reads[0]!, { key: later.key, version: later.version }, f.reads[2]!],
          depends_on: [f.depends_on[0]!, later.provenance.group_id, f.depends_on[2]!],
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(basis.packet.fact_key).toBe(packetKey);
  });
});

describe("a PC-authorship boundary holds at the result close as well as at the basis (acceptance 1, 8, 12)", () => {
  it("an entity that comes under player control between the basis and the close gets no package: the close fails closed; independent work resolves", async () => {
    const s = await seededKtiCampaign(tempDir(), { canonical: false });
    await sealPacket(s, 1, 2, EVENT_COUNCIL, "actor-late-pc");
    await sealPacket(s, 2, 3, EVENT_SCHEMATIC, ACTOR_SWORD, "seal-free");
    await establishObject(s, 1);
    const late = await establishTransfer(s, 2, "actor-late-pc", EVENT_COUNCIL);
    const free = await establishTransfer(s, 3, ACTOR_SWORD, EVENT_SCHEMATIC);
    await registerKtiConsumer(s, "k-late", late, 4);
    await registerKtiConsumer(s, "k-free", free, 5);
    // the entity is released as a Player Character before its package is published
    await must(
      s.campaign.releasePlayerCharacter({
        ...publication(3),
        contract: fixtureContract({ pc_id: "actor-late-pc" }),
      }),
    );
    const r = await must(advance(s, "tx-mixed", "k-late"));
    expect(r.rejections.map((x) => x.code)).toEqual(["KEY_NOT_ADMITTED"]);
    expect(s.kti.transferPackage(late.package_id)).toBeUndefined();
    expect(s.campaign.store.getFact(ktiConsumerResultKey("k-late"))).toBeUndefined();
    expect(s.kti.transferPackage(free.package_id)).toBeDefined();
    expect(s.campaign.store.getFact(ktiConsumerResultKey("k-free"))).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("temporal registration: KTI state is visible downstream only as the published package, AS-OF-DECLARED-CLOSE (acceptance 6, 7, 10)", () => {
  async function registry() {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    const reg = (over: any, withKti = true) => {
      const object = ktiConsumerObjectAt(s, "k1", basis, over);
      return codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(60 + Math.floor(Math.random() * 1_000_000)),
          object: withKti
            ? object
            : {
                ...object,
                dependencies: object.dependencies.filter(
                  (d) => d.stage.owner_operation.owner !== "kti",
                ),
              },
        }),
      );
    };
    return { s, basis, reg };
  }

  it("refuses a consequence that reads the package NOW, the basis or the development object, a close naming another basis, a KTI-owned object and a forged stage", async () => {
    const { basis, reg } = await registry();
    const decls = ktiConsumerObject("k1", basis).dependencies;
    const stageDecl = decls[0]!;
    const consumerDecl = decls[1]!;
    const read = (key: string, extra: any = {}) => ({
      mode: "AS-OF-NOW",
      source: { owner: "kti", fact_key: key },
      invalidators: [],
      ...extra,
    });
    const consuming = (r: any) => ({ ...consumerDecl, reads: [r] });
    // the package read NOW: a same-resolution KTI consequence is never visible to a reader in its own resolution
    expect(await reg({ dependencies: [stageDecl, consuming(read(packageKey))] })).toBe(
      "REFERENCE_INVALID",
    );
    // the sealed basis and the development object are KTI-internal, not cross-owner reads
    expect(await reg({ dependencies: [stageDecl, consuming(read(basisKey))] })).toBe(
      "REFERENCE_INVALID",
    );
    expect(await reg({ dependencies: [stageDecl, consuming(read(objectKey))] })).toBe(
      "REFERENCE_INVALID",
    );
    // a close naming a basis the KTI owner does not declare, or another producer
    const closeRead = consumerDecl.reads[0] as any;
    expect(
      await reg({
        dependencies: [
          stageDecl,
          consuming({
            ...closeRead,
            close_basis: { ...closeRead.close_basis, name: "another-close" },
          }),
        ],
      }),
    ).toBe("REFERENCE_INVALID");
    expect(
      await reg({
        dependencies: [
          stageDecl,
          consuming({
            ...closeRead,
            close_basis: {
              ...closeRead.close_basis,
              producer: { owner: "kti", operation: "another-operation" },
            },
          }),
        ],
      }),
    ).toBe("REFERENCE_INVALID");
    // a KTI-owned engagement
    expect(await reg({ owning_ref: { owner: "kti", process_id: "p" } })).toBe("REFERENCE_INVALID");
    // a forged stage (different reads) and a forged stage that also reads the packet at a close
    expect(await reg({ dependencies: [{ ...stageDecl, reads: [] }, consumerDecl] })).toBe(
      "REFERENCE_INVALID",
    );
    expect(
      await reg({
        dependencies: [
          { ...stageDecl, reads: [stageDecl.reads[0]!, stageDecl.reads[2]!] },
          consumerDecl,
        ],
      }),
    ).toBe("REFERENCE_INVALID");
    expect(
      await reg({
        dependencies: [{ ...stageDecl, declares_close: null }, consumerDecl],
      }),
    ).toBe("REFERENCE_INVALID");
    // the lawful shape is accepted
    expect(await reg({})).toBe("OK");
  });

  it("a consequence cannot conjure the transfer it needs: its object is refused without a committed basis", async () => {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await establishObject(s, 1);
    // the basis is authored but never committed
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(40),
          object: ktiConsumerObjectAt(s, "k1", basisDefault),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    expect(s.campaign.store.getFact(basisKey)).toBeUndefined();
    expect(
      s.campaign.store.listFacts().filter((f) => f.key === "temporal/object/kti-consumer-obj-k1"),
    ).toEqual([]);
  });

  it("a stage outside the KTI owner cannot declare that it produces a KTI key", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    const decls = ktiConsumerObject("k1", basis).dependencies;
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(50),
          object: ktiConsumerObjectAt(s, "k1", basis, {
            dependencies: [
              decls[0]!,
              {
                ...ktiConsumerDeclaration("k1", basis.package_id),
                produces: [ktiTransferPackageKey("transfer-elsewhere")],
              },
            ],
          }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
  });

  it("no same-resolution feedback: an Epistemic formation stage can read no KTI state, so a KTI consequence can never reach back into the packet that caused it", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    const later = accessEvent(EVENT_LATER, A);
    await must(
      s.access.establishBoundedSharedAccess({
        group_id: "access-group-90",
        intent_id: "access-intent-90",
        cause: "access-cause-90",
        basis: "access-fixture-basis",
        event: later,
      }),
    );
    const form = epistemicPacketDeclaration(later);
    const kti = ktiTransferDeclaration(basis)!;
    const closeRead = ktiConsumerDeclaration("k1", basis.package_id).reads[0]!;
    // a formation that reads the KTI package at its close (the lawful read for any OTHER consumer) is not the formation
    // the event determines: the Epistemic rule refuses it
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(70),
          object: ktiConsumerObjectAt(s, "k1", basis, {
            dependencies: [kti, { ...form, reads: [...form.reads, closeRead] }],
          }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // and a formation that reads the package NOW is refused for the same reason
    expect(
      await codeOf(
        s.coordinator.registerObject({
          ...temporalPublication(71),
          object: ktiConsumerObjectAt(s, "k1", basis, {
            dependencies: [
              kti,
              {
                ...form,
                reads: [
                  ...form.reads,
                  {
                    mode: "AS-OF-NOW",
                    source: { owner: "kti", fact_key: packageKey },
                    invalidators: [],
                  },
                ],
              },
            ],
          }),
        }),
      ),
    ).toBe("REFERENCE_INVALID");
    // the packet that caused the transfer is untouched and no KTI key is an Epistemic write
    expect(s.access.packet(EVENT_COUNCIL, A)).toBeDefined();
    expect(s.campaign.store.listFacts().filter((f) => f.key.includes("kti-consumer-obj"))).toEqual(
      [],
    );
  });

  it("a consequence that reads the close without declaring the KTI stage is unresolved — fail closed — and publishes nothing", async () => {
    const { s, basis, reg } = await registry();
    expect(await reg({}, false)).toBe("OK");
    const before = s.campaign.store.head().revision;
    const r = await must(advance(s));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(r.transaction.outcome.unresolved_dependents[0]!.reason).toBe("PREDECESSOR_ABSENT");
    expect(s.kti.transferPackage(basis.package_id)).toBeUndefined();
    expect(s.campaign.store.getFact(ktiConsumerResultKey("k1"))).toBeUndefined();
    // only the transaction's own kernel records were written
    const added = s.campaign.store
      .listFacts()
      .filter((f) => s.campaign.store.lookupReceipt(f.provenance.intent_id)!.revision > before);
    expect(added.every((f) => f.owner === "temporal_kernel")).toBe(true);
  });

  it("a result close that reads a stale packet version is refused: the stage never publishes over a packet other than the one the basis pins", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    const before = ktiFacts(s).length;
    const t = tamperStore(s.campaign.store, "kti", (g) => ({
      ...g,
      reads: g.reads.map((r) => (r.key === packetKey ? { ...r, version: r.version + 1 } : r)),
    }));
    const r = await must(
      new TemporalCoordinator(t.store, ktiProviders()).advance(
        requestToBoundary(s, "tx-1", "kti-consumer-obj-k1"),
      ),
    );
    expect(r.rejections.length).toBe(1);
    expect(ktiFacts(s).length).toBe(before);
    expect(s.kti.transferPackage(basis.package_id)).toBeUndefined();
  });
});

describe("load-time verification fails closed on KTI drift (acceptance 10, 11)", () => {
  async function drifted(
    mutate: (facts: OwnerFact[]) => OwnerFact[],
    opts: { complete?: boolean } = {},
  ) {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
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
    const out = verifyKtiIntegrity(bound);
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

  it("healthy campaigns verify before the result close and after it", async () => {
    expect(await drifted((f) => f)).toBe("");
    expect(await drifted((f) => f, { complete: false })).toBe("");
  });

  it("detects a package that is not what its basis, packet and object determine", async () => {
    for (const f of [
      (v: any) => (v.recipient = ACTOR_OTHER),
      (v: any) => (v.packet.version = 2),
      (v: any) => (v.source_id = SOURCE_PARTY_OTHER),
      (v: any) => (v.development_object.version = 2),
    ])
      expect(await drifted(edit(packageKey, f))).toMatch(
        /exactly what its basis, sealed packet and development object determine|violates|derived/,
      );
  });

  it("detects a basis whose packet, object, source or identity drifted, and one resting on state that is gone", async () => {
    expect(
      await drifted(edit(basisKey, (v) => (v.packet.fact_key = accessPacketKey(EVENT_LATER, A)))),
    ).not.toBe("");
    expect(await drifted(edit(basisKey, (v) => (v.source_id = SOURCE_PARTY_OTHER)))).not.toBe("");
    expect(await drifted(edit(basisKey, (v) => (v.package_id = "transfer-forged")))).toMatch(
      /derived from/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== objectKey))).toMatch(
      /committed KTI development object|no committed|rests on/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== packetKey))).toMatch(
      /sealed Accessible Content Packet/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== provKey))).toMatch(
      /sealed provenance and event of its packet/,
    );
    expect(await drifted((f) => f.filter((x) => x.key !== basisKey))).toMatch(
      /package has no committed basis/,
    );
    expect(await drifted(edit(packetKey, (v) => (v.payload.referent = "the gate rota")))).toMatch(
      /does not support the development object/,
    );
  });

  it("detects the KTI facts carrying the wrong access class and an object that depends on a foreign fact", async () => {
    for (const key of [objectKey, basisKey, packageKey])
      expect(
        await drifted(edit(key, (_v, fact) => (fact.secrecy = ACCESS_CLASS_ACTOR_ACCESSIBLE))),
      ).toMatch(/engine-side/);
  });

  it("detects a package that is no stage (provenance drift) and one that no transaction credits and no object awaits", async () => {
    expect(
      await drifted(edit(packageKey, (_v, fact) => (fact.provenance.group_id = "raw-group"))),
    ).not.toBe("");
    expect(
      await drifted(edit(packageKey, (_v, fact) => (fact.provenance.intent_id = "raw-intent"))),
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

  it("detects a recipient that was a Player Character or a Population ledger when its basis was committed", async () => {
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

  it("detects a hand-written object that reads the package NOW, a forged stage or a standalone KTI object", async () => {
    const tamper = (f: (o: any) => void) => (facts: OwnerFact[]) => {
      const obj = facts.find((x) => x.key.startsWith("temporal/object/"))!;
      f(obj.value);
      return facts;
    };
    // dependencies: [kti stage, consumer]
    expect(
      await drifted(
        tamper(
          (o) =>
            (o.dependencies[1] = {
              ...o.dependencies[1],
              reads: [
                {
                  mode: "AS-OF-NOW",
                  source: { owner: "kti", fact_key: packageKey },
                  invalidators: [],
                },
              ],
            }),
        ),
      ),
    ).toMatch(/AS-OF-DECLARED-CLOSE/);
    expect(
      await drifted(tamper((o) => (o.dependencies[0] = { ...o.dependencies[0], reads: [] }))),
    ).toMatch(/exactly the declaration derived/);
    expect(
      await drifted(tamper((o) => (o.owning_ref = { owner: "kti", process_id: "p" }))),
    ).toMatch(/no standalone/);
  });
});

void [actorCapabilityKey, CAP_METALWORKING];
