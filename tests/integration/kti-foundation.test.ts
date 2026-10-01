/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact values */
// KTI Managed Transfer Package / Result-Close Backbone Foundation — "one already-committed KTI development object + one
// already-sealed F-014D BOUNDED_SHARED_ACCESS Accessible Content Packet for a bounded named non-PC recipient → one
// KTI-owned active managed Transfer Package for that source × recipient × development-object programme → one declared
// KTI result close through the existing IM-02 machinery" — and nothing more: receipt is not comprehension, competence,
// reproduction, adoption, belief, institutional uptake, diffusion or behaviour.
// Register lineage: IA-01/02/03/04/06 (partial), IA-14 (partial), IA-16 (partial), IA-22 (reused / partial); RC-02/03/04/05/
// 11/16; IM-02, IM-03, IM-09, IM-10, IM-11, IM-12, IM-17. Source lock: spec/f027/spec-lock.json (F-027 v1.0): WS-002, F-014D.
// CAL-01 stays UNCALIBRATED (EXACT only). Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { describe, expect, it } from "vitest";
import {
  accessEventKey,
  accessPacketKey,
  accessProvenanceKey,
  actorCapabilityKey,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  ktiTransferStage,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  KTI_RULE,
  StageProviderRegistry,
  TemporalCoordinator,
  epistemicPacketProvider,
  namedActorCapabilityCloseProvider,
  stageGroupId,
  stageIntentId,
  transferPackageId,
} from "@immortalis/engine";
import {
  ACTOR_OTHER,
  ACTOR_SMITH,
  ACTOR_SWORD,
  CAP_METALWORKING,
  EVENT_COUNCIL,
  EVENT_LATER,
  EVENT_SCHEMATIC,
  OBJECT_GATE_ROTA,
  OBJECT_OTHER,
  SOURCE_PARTY_MANILA,
  SOURCE_PARTY_OTHER,
  SOURCE_SCROLL,
  SOURCE_SPEAKER,
  SYNTH_ACCESS_SOURCE_OWNER,
  at,
  closeConsumerProvider,
  ktiBasis,
  ktiConsumerProvider,
  ktiConsumerResultKey,
  ktiPayload,
  ktiProviders,
  ktiPublication,
  packetConsumerObject,
  packetConsumerProvider,
  packetConsumerResultKey,
  sourceGroup,
  sourceKey,
  FIXTURE_CAMPAIGN,
  temporalPublication,
} from "@immortalis/testkit";
import {
  establishAccess,
  establishCapability,
  establishObject,
  advanceKti,
  boundaryAfterNow,
  establishTransfer,
  ktiConsumerObjectAt,
  requestToBoundary,
  ktiSummary,
  registerKtiConsumer,
  sealPacket,
  seededKtiCampaign,
  type KtiSeeded,
} from "../support/kti.ts";
import { must, spyStore } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const defaultId = () => ktiBasis(A, EVENT_COUNCIL).package_id;
const pkgStage = ktiTransferStage;
const advance = (s: KtiSeeded, id = "tx-k1", consumer = "k1") => advanceKti(s, id, consumer);

const ktiFacts = (s: KtiSeeded) =>
  s.campaign.store.listFacts().filter((f) => f.key.startsWith("kti/"));

/** The prerequisite state of every primary scenario: a sealed packet for A, a committed object, an authored basis. */
async function prepared(s: KtiSeeded) {
  await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
  await establishObject(s, 1);
  return establishTransfer(s, 2, A, EVENT_COUNCIL);
}

describe("a committed KTI development object is KTI's own definition and creates nothing foreign (acceptance 1)", () => {
  it("commits under the sole KTI owner/facet, engine-sealed and create-only, with exactly one write and no institution, actor, Population or world fact", async () => {
    const s = await seededKtiCampaign(tempDir());
    const before = ktiSummary(s.campaign, s.coordinator);
    const object = await establishObject(s, 1);
    const stored = s.kti.developmentObject(OBJECT_GATE_ROTA)!;
    expect(stored.value).toEqual(object);
    expect(stored.fact).toMatchObject({
      key: ktiDevelopmentObjectKey(OBJECT_GATE_ROTA),
      owner: "kti",
      facet: "kti_development",
      version: 1,
      unit: null,
      basis: "kti-fixture-basis",
      secrecy: "kti.engine-sealed",
    });
    expect(stored.fact.provenance.rule).toEqual(KTI_RULE);
    const after = ktiSummary(s.campaign, s.coordinator);
    // exactly one new fact, under the KTI key space; every other owner's state is byte-identical
    expect(after.kti).toHaveLength(1);
    for (const k of [
      "actor",
      "access",
      "consumer",
      "packetConsumer",
      "source",
      "history",
      "population",
      "objects",
      "transactions",
    ] as const) {
      expect(after[k], k).toEqual(before[k]);
    }
    expect(s.campaign.store.listFacts().length).toBe(before.receipts.length + 1);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("one sealed packet and one committed object: the authored Transfer Package basis (acceptance 2, 3, 5)", () => {
  it("a basis cannot precede the packet's formation: KTI consumes the packet only AFTER it is formed", async () => {
    const s = await seededKtiCampaign(tempDir());
    await establishAccess(s, 1, EVENT_COUNCIL, A); // an event only: no packet yet
    await establishObject(s, 1);
    const r = await s.kti.establishTransferBasis({
      ...ktiPublication(2),
      transfer: ktiBasis(A, EVENT_COUNCIL),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("PREREQUISITE_MISSING");
    expect(s.kti.transferBasis(defaultId())).toBeUndefined();
  });

  it("once the packet is sealed, the basis commits: pinned to the object, the packet and its provenance, with a derived identity and the true source as a reference", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    const stored = s.kti.transferBasis(basis.package_id)!;
    expect(stored.value).toEqual(basis);
    expect(stored.fact).toMatchObject({
      key: ktiTransferBasisKey(basis.package_id),
      owner: "kti",
      facet: "kti_development",
      version: 1,
      secrecy: "kti.engine-sealed",
    });
    // the identity is derived from exactly (source_id, recipient, development object)
    expect(basis.package_id).toBe(transferPackageId(SOURCE_PARTY_MANILA, A, OBJECT_GATE_ROTA));
    // it read exactly the three facts it rests on, each at its current version
    const group = s.campaign.store.committedGroup(stored.fact.provenance.intent_id)!;
    expect(group.reads).toEqual([
      { key: ktiDevelopmentObjectKey(OBJECT_GATE_ROTA), version: 1 },
      { key: accessPacketKey(EVENT_COUNCIL, A), version: 1 },
      { key: accessProvenanceKey(EVENT_COUNCIL, A), version: 1 },
    ]);
    // no package exists yet: the basis is not the package, and no packet or provenance was touched
    expect(s.kti.transferPackage(basis.package_id)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the packet's event-derived keys are not an identity dimension: the identity ignores the packet, the event and the time", async () => {
    const a = ktiBasis(A, EVENT_COUNCIL);
    const b = ktiBasis(A, EVENT_LATER);
    expect(a.package_id).toBe(b.package_id);
    expect(a.packet).not.toEqual(b.packet);
    // a different recipient, object or programme source_id is a different programme
    expect(ktiBasis(ACTOR_SWORD, EVENT_COUNCIL).package_id).not.toBe(a.package_id);
    expect(ktiBasis(A, EVENT_COUNCIL, OBJECT_OTHER).package_id).not.toBe(a.package_id);
    expect(
      ktiBasis(A, EVENT_COUNCIL, OBJECT_GATE_ROTA, { source_id: SOURCE_PARTY_OTHER }).package_id,
    ).not.toBe(a.package_id);
  });
});

describe("the result close publishes one active Transfer Package as an IM-02 stage (acceptance 3, 4, 5, 6)", () => {
  it("the KTI stage commits BEFORE the consumer, under its StageKey-derived identity and its own owner, rule and engine-sealed class", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    const r = await must(advance(s));
    expect(r.transaction.outcome).toMatchObject({
      stop_reason: "TARGET_REACHED",
      unresolved_dependents: [],
    });
    const stages = r.transaction.stages;
    expect(stages.map((x) => x.stage.owner_operation.owner)).toEqual([
      "kti",
      "SYNTHETIC-KTI-RESULT-CONSUMER",
    ]);
    expect(stages[0]!.stage).toEqual(pkgStage(basis.package_id));
    expect(stages[0]!.group_id).toBe(stageGroupId(pkgStage(basis.package_id)));
    expect(stages[0]!.revision).toBeLessThan(stages[1]!.revision);
    const pkg = s.kti.transferPackage(basis.package_id)!;
    expect(pkg.fact).toMatchObject({
      key: ktiTransferPackageKey(basis.package_id),
      owner: "kti",
      facet: "kti_development",
      version: 1,
      unit: null,
      basis: "kti-fixture-basis",
      secrecy: "kti.engine-sealed",
    });
    expect(pkg.fact.provenance.group_id).toBe(stageGroupId(pkgStage(basis.package_id)));
    expect(pkg.fact.provenance.intent_id).toBe(stageIntentId(pkgStage(basis.package_id)));
    expect(pkg.fact.provenance.rule).toEqual(KTI_RULE);
    expect(pkg.close_group).toBe(stageGroupId(pkgStage(basis.package_id)));
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the package is KTI-owned workflow state: ACTIVE, with the programme source_id, recipient, object, packet and basis and the close it was published at", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const pkg = s.kti.transferPackage(basis.package_id)!.value;
    expect(pkg).toEqual({
      package_id: basis.package_id,
      status: "ACTIVE",
      source_id: SOURCE_PARTY_MANILA,
      recipient: A,
      development_object: {
        object_id: OBJECT_GATE_ROTA,
        fact_key: ktiDevelopmentObjectKey(OBJECT_GATE_ROTA),
        version: 1,
      },
      packet: { fact_key: accessPacketKey(EVENT_COUNCIL, A), version: 1 },
      basis: { fact_key: ktiTransferBasisKey(basis.package_id), version: 1 },
      close: { name: "kti-result-close", stage: pkgStage(basis.package_id) },
    });
  });

  it("it does not duplicate F-014D event or provenance, nor any foreign owner fact: no event, channel, payload, attribution, capability, Population or institution content", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const text = JSON.stringify(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("kti/"))
        .map((f) => f.value),
    ).replaceAll(accessPacketKey(EVENT_COUNCIL, A), "<the packet reference>");
    for (const secret of [
      EVENT_COUNCIL,
      accessEventKey(EVENT_COUNCIL),
      accessProvenanceKey(EVENT_COUNCIL, A),
      "SPEECH",
      "PERCEPTION",
      "the gate is opened at first light",
      "bearing the seal of the Warden",
      "BOUNDED_SHARED_ACCESS",
      "established_at",
      "capability_close",
    ]) {
      expect(text, secret).not.toContain(secret);
    }
    // the only foreign reference is the packet (by identity and version); the F-014D true source/holder/carrier is nowhere in KTI
    const pkg = s.kti.transferPackage(basis.package_id)!.value;
    expect(Object.keys(pkg.packet).sort()).toEqual(["fact_key", "version"]);
    expect(text).not.toContain(sourceKey(SOURCE_SPEAKER));
    expect(text).not.toContain(SYNTH_ACCESS_SOURCE_OWNER);
  });

  it("receipt does not become comprehension, competence, reproduction, adoption, adherence, belief, uptake or an encounter row: the only KTI state is the object, the basis and the package", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const keys = s.campaign.store
      .listFacts()
      .map((f) => f.key)
      .filter((k) => k.startsWith("kti/"))
      .sort();
    expect(keys).toEqual(
      [
        ktiDevelopmentObjectKey(OBJECT_GATE_ROTA),
        ktiTransferBasisKey(basis.package_id),
        ktiTransferPackageKey(basis.package_id),
      ].sort(),
    );
    const text = JSON.stringify(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("kti/"))
        .map((f) => f.value),
    ).replaceAll(accessPacketKey(EVENT_COUNCIL, A), "<the packet reference>");
    expect(text).not.toMatch(
      /comprehen|compet|reproduc|adopt|adher|belief|uptake|diffus|encounter|exposure|intelligib|headcount|skill|mastery|retention|continuity|qualif|partial/i,
    );
    // the recipient's capability state is neither established nor modified by KTI
    expect(s.campaign.store.getFact(actorCapabilityKey(A, CAP_METALWORKING))).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the consumer reads the package AS-OF-DECLARED-CLOSE and records exactly it, with the close group that committed it", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const pkg = s.kti.transferPackage(basis.package_id)!;
    const observed = s.campaign.store.getFact(ktiConsumerResultKey("k1"))!.value as any;
    expect(observed.observed_package).toEqual(pkg.value);
    expect(observed.observed_close_group).toBe(pkg.close_group);
    const g = s.campaign.store.committedGroup(
      s.campaign.store.getFact(ktiConsumerResultKey("k1"))!.provenance.intent_id,
    )!;
    expect(g.reads).toEqual([{ key: ktiTransferPackageKey(basis.package_id), version: 1 }]);
    expect(g.depends_on).toContain(pkg.close_group);
  });

  it("the sealed packet and its provenance are byte-identical after the result: a KTI consequence never recreates, improves or reinterprets its source packet", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    const before = {
      packet: structuredClone(s.campaign.store.getFact(accessPacketKey(EVENT_COUNCIL, A))!),
      provenance: structuredClone(s.campaign.store.getFact(accessProvenanceKey(EVENT_COUNCIL, A))!),
      event: structuredClone(s.campaign.store.getFact(accessEventKey(EVENT_COUNCIL))!),
      source: structuredClone(s.campaign.store.getFact(sourceKey(SOURCE_SPEAKER))!),
    };
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    expect(s.campaign.store.getFact(accessPacketKey(EVENT_COUNCIL, A))).toEqual(before.packet);
    expect(s.campaign.store.getFact(accessProvenanceKey(EVENT_COUNCIL, A))).toEqual(
      before.provenance,
    );
    expect(s.campaign.store.getFact(accessEventKey(EVENT_COUNCIL))).toEqual(before.event);
    expect(s.campaign.store.getFact(sourceKey(SOURCE_SPEAKER))).toEqual(before.source);
    // the KTI stage read the packet (NOW, already committed) and wrote no Epistemic key
    const group = s.campaign.store.committedGroup(
      s.kti.transferPackage(basis.package_id)!.fact.provenance.intent_id,
    )!;
    expect(group.reads.map((r) => r.key)).toEqual([
      ktiTransferBasisKey(basis.package_id),
      accessPacketKey(EVENT_COUNCIL, A),
      ktiDevelopmentObjectKey(OBJECT_GATE_ROTA),
    ]);
    expect(group.writes.map((w) => w.key)).toEqual([ktiTransferPackageKey(basis.package_id)]);
  });
});

describe("one active package per source × recipient × development-object programme (acceptance 3, 10)", () => {
  it("a second packet for the same programme does not create a second package: its basis is refused and the first package stands", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const before = s.kti.transferPackage(basis.package_id)!;
    // a later event from the same carrier to the same recipient about the same subject, sealed afterwards
    await sealPacket(s, 3, 4, EVENT_LATER, A);
    const r = await s.kti.establishTransferBasis({
      ...ktiPublication(9),
      transfer: ktiBasis(A, EVENT_LATER),
    });
    expect(r.ok).toBe(false);
    expect(s.kti.transferBasis(basis.package_id)!.value.packet.fact_key).toBe(
      accessPacketKey(EVENT_COUNCIL, A),
    );
    expect(s.kti.transferPackage(basis.package_id)).toEqual(before);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("a different recipient, object or source is a different programme with its own package; they share nothing", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await sealPacket(s, 3, 4, EVENT_SCHEMATIC, ACTOR_SWORD, "seal-2");
    const second = await establishTransfer(s, 3, ACTOR_SWORD, EVENT_SCHEMATIC);
    expect(second.package_id).not.toBe(basis.package_id);
    // both consequences are due at the same instant: one transaction resolves both programmes, each with its own package
    await registerKtiConsumer(s, "k1", basis, 5);
    await registerKtiConsumer(s, "k2", second, 6);
    await must(advance(s, "tx-k1", "k1"));
    expect(s.kti.transferPackage(basis.package_id)!.value.recipient).toBe(A);
    expect(s.kti.transferPackage(second.package_id)!.value.recipient).toBe(ACTOR_SWORD);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("adoption by identity and same-instant sharing (acceptance 6, 10, 11)", () => {
  it("a later consequence declares the same KTI stage in its own object and ADOPTS the committed result: never duplicated, recomputed or improved", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const first = structuredClone(s.kti.transferPackage(basis.package_id)!);
    const stageRevision = s.campaign.store.lookupReceipt(first.fact.provenance.intent_id)!.revision;
    await registerKtiConsumer(s, "k2", basis, 4);
    const spy = spyStore(s.campaign.store);
    const r = await must(
      new TemporalCoordinator(spy.store, ktiProviders()).advance(
        requestToBoundary(s, "tx-k2", "kti-consumer-obj-k2"),
      ),
    );
    expect(r.transaction.outcome.stop_reason).toBe("TARGET_REACHED");
    expect(s.kti.transferPackage(basis.package_id)).toEqual(first);
    expect(s.campaign.store.lookupReceipt(first.fact.provenance.intent_id)!.revision).toBe(
      stageRevision,
    );
    // the KTI stage was adopted from the journal, not re-committed
    expect(
      spy.commits.filter((g: CommitGroup) => g.owner === "kti" && g.writes.length > 0),
    ).toHaveLength(0);
    const k2 = s.campaign.store.getFact(ktiConsumerResultKey("k2"))!.value as any;
    expect(k2.observed_package).toEqual(first.value);
    expect(k2.observed_close_group).toBe(first.close_group);
  });

  it("two consequences due at the same instant share one result: one declares the stage, the other only reads the close", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    // the second consequence declares NO KTI stage: it only reads the close (an IM-02 stage is declared by one object)
    const second = ktiConsumerObjectAt(s, "k2", basis);
    const shared = await s.coordinator.registerObject({
      ...temporalPublication(4),
      object: {
        ...second,
        dependencies: second.dependencies.filter((d) => d.stage.owner_operation.owner !== "kti"),
      },
    });
    expect(shared.ok).toBe(true);
    // declaring the same stage in a second object due at the same instant is refused
    const dup = await s.coordinator.registerObject({
      ...temporalPublication(5),
      object: ktiConsumerObjectAt(s, "k3", basis),
    });
    expect(dup.ok).toBe(false);
    const r = await must(advance(s));
    expect(r.transaction.outcome.unresolved_dependents).toEqual([]);
    expect(s.campaign.store.getFact(ktiConsumerResultKey("k1"))).toBeDefined();
    expect(s.campaign.store.getFact(ktiConsumerResultKey("k2"))).toBeDefined();
    expect(
      s.campaign.store.listFacts().filter((f) => f.key === ktiTransferPackageKey(basis.package_id)),
    ).toHaveLength(1);
  });
});

describe("independent lawful work proceeds if the KTI stage is unresolved; no tick, sweep or standing object (acceptance 12)", () => {
  it("an unresolved KTI stage freezes nothing unrelated: its dependents wait, independent lawful work at the same instant still resolves", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    // independent lawful work due at the same instant: an unrelated recipient's packet consumer (no KTI part at all)
    const freeEvent = await sealPacket(s, 3, 4, EVENT_SCHEMATIC, ACTOR_OTHER, "seal-other", {
      source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
    });
    const freeConsumer = await establishAccess(s, 5, EVENT_LATER, ACTOR_SWORD);
    await registerKtiConsumer(s, "k-blocked", basis, 6);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(7),
        object: packetConsumerObject("c-free", freeConsumer, null, {
          next_boundary: {
            boundary_id: "packet-consumer-boundary-c-free",
            at: boundaryAfterNow(s),
          },
        }),
      }),
    );
    expect(freeEvent.participants).toEqual([ACTOR_OTHER]);
    // the build has no KTI owner operation registered: the blocked programme's KTI stage cannot resolve
    const noKti = new TemporalCoordinator(
      s.campaign.store,
      new StageProviderRegistry([
        namedActorCapabilityCloseProvider,
        closeConsumerProvider,
        epistemicPacketProvider,
        packetConsumerProvider,
        ktiConsumerProvider,
      ]),
    );
    const r = await must(noKti.advance(requestToBoundary(s, "tx-1", "kti-consumer-obj-k-blocked")));
    expect(r.transaction.outcome.stop_reason).toBe("DEPENDENCY_UNRESOLVED");
    expect(
      r.transaction.outcome.unresolved_dependents
        .map((u) => [u.stage.owner_operation.owner, u.reason])
        .sort(),
    ).toEqual(
      [
        ["SYNTHETIC-KTI-RESULT-CONSUMER", "PREDECESSOR_BLOCKED"],
        ["kti", "PROVIDER_ABSENT"],
      ].sort(),
    );
    // nothing was published for the blocked programme; the independent work resolved
    expect(s.kti.transferPackage(basis.package_id)).toBeUndefined();
    expect(s.campaign.store.getFact(ktiConsumerResultKey("k-blocked"))).toBeUndefined();
    expect(s.campaign.store.getFact(packetConsumerResultKey("c-free"))).toBeDefined();
    expect(s.access.packet(EVENT_LATER, ACTOR_SWORD)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("with no consequence engaged no package is ever published, however many bases exist and however far time advances", async () => {
    const s = await seededKtiCampaign(tempDir());
    await prepared(s);
    await sealPacket(s, 3, 4, EVENT_SCHEMATIC, ACTOR_SWORD, "seal-2");
    await establishTransfer(s, 3, ACTOR_SWORD, EVENT_SCHEMATIC);
    const before = ktiSummary(s.campaign, s.coordinator);
    await must(
      s.coordinator.advance({
        transaction_id: "tx-idle",
        cause: "cause-tx-idle",
        trigger: { kind: "fixture-advance-request", ref: "ref-tx-idle" },
        continues: null,
        requested: { target: at(200), condition: null },
        context: { role: "role.player", permission: "permission.player_choice.commit" },
        publication: { basis: "fixture-basis", secrecy: "fixture-visibility" },
      }),
    );
    const after = ktiSummary(s.campaign, s.coordinator);
    expect(after.kti).toEqual(before.kti);
    expect(after.access).toEqual(before.access);
    for (const f of after.kti) expect(f.key.endsWith("/package")).toBe(false);
  });
});

describe("bounded runtime cost: only the causally engaged programme is read or written (acceptance 12)", () => {
  it("resolving one programme reads and writes nothing of an unrelated object, recipient, packet or consumer, and scans nothing", async () => {
    const s = await seededKtiCampaign(tempDir());
    // an unrelated programme for another recipient with a dormant dependent object (never engaged)
    await sealPacket(s, 1, 2, EVENT_SCHEMATIC, ACTOR_OTHER, "seal-other", {
      payload: ktiPayload(OBJECT_OTHER),
    });
    await establishObject(s, 1, OBJECT_OTHER);
    const other = await establishTransfer(s, 2, ACTOR_OTHER, EVENT_SCHEMATIC, OBJECT_OTHER);
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(60),
        object: ktiConsumerObjectAt(s, "dormant", other, { next_boundary: null }),
      }),
    );
    await sealPacket(s, 3, 4, EVENT_COUNCIL, A);
    await establishObject(s, 3);
    const basis = await establishTransfer(s, 4, A, EVENT_COUNCIL);
    await registerKtiConsumer(s, "k1", basis, 5);
    const unrelated = s.campaign.store
      .listFacts()
      .filter(
        (f) =>
          f.key.includes(ACTOR_OTHER) ||
          f.key.includes("dormant") ||
          f.key.includes(other.package_id) ||
          f.key.includes(OBJECT_OTHER),
      );
    expect(unrelated.length).toBeGreaterThan(0);
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, ktiProviders()).advance(
        requestToBoundary(s, "tx-1", "kti-consumer-obj-k1"),
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
    expect(read.has(ktiTransferBasisKey(basis.package_id))).toBe(true);
    expect(read.has(accessPacketKey(EVENT_COUNCIL, A))).toBe(true);
    expect(s.kti.transferPackage(other.package_id)).toBeUndefined();
    expect(s.kti.transferPackage(basis.package_id)).toBeDefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("stage identity is independent of horizon, source churn and slicing (acceptance 3, 11)", () => {
  it("the requested horizon never changes the result's identity or value", async () => {
    const run = async (target: number) => {
      const s = await seededKtiCampaign(tempDir());
      const basis = await prepared(s);
      await registerKtiConsumer(s, "k1", basis, 3);
      await must(
        s.coordinator.advance({
          ...requestToBoundary(s, "tx-1", "kti-consumer-obj-k1"),
          requested: {
            target: at(target),
            condition: {
              kind: "STOP_AFTER_BOUNDARY",
              object_id: "kti-consumer-obj-k1",
              boundary_id: "kti-consumer-boundary-k1",
            },
          },
        }),
      );
      return s.kti.transferPackage(basis.package_id)!;
    };
    const near = await run(200);
    const far = await run(400);
    expect(near.value).toEqual(far.value);
    expect(near.fact.provenance.group_id).toBe(far.fact.provenance.group_id);
    expect(near.fact.provenance.intent_id).toBe(far.fact.provenance.intent_id);
  });

  it("carrier-version churn after the basis is history: the package keeps its programme source_id, the carrier's later version is never read", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
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
      new TemporalCoordinator(spy.store, ktiProviders()).advance(
        requestToBoundary(s, "tx-1", "kti-consumer-obj-k1"),
      ),
    );
    expect(new Set(spy.getFacts).has(sourceKey(SOURCE_SPEAKER))).toBe(false);
    expect(s.kti.transferPackage(basis.package_id)!.value.source_id).toEqual(basis.source_id);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a package's recipient is the packet's named recipient and nothing wider is inferred (acceptance 3, 5, 9)", () => {
  it("the package names exactly the one recipient; a different recipient's package is a separate programme and the first recipient's state is untouched", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const pkg = s.kti.transferPackage(basis.package_id)!.value;
    expect(pkg.recipient).toBe(A);
    expect(Object.keys(pkg)).not.toContain("recipients");
    expect(Object.keys(pkg)).not.toContain("scope");
    expect(s.campaign.store.getFact(accessPacketKey(EVENT_COUNCIL, ACTOR_OTHER))).toBeUndefined();
    expect(s.kti.transferBasis(ktiBasis(ACTOR_OTHER, EVENT_COUNCIL).package_id)).toBeUndefined();
  });

  it("prose, a synonym or a different referent fails closed: only the canonical object_id as the packet's referent supports the object", async () => {
    const s = await seededKtiCampaign(tempDir());
    // a packet whose referent is prose about the very thing the object stands for
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A, "seal-prose", {
      payload: ktiPayload(OBJECT_GATE_ROTA, "the gate rota"),
    });
    await establishObject(s, 1);
    const publish = (n: number, transfer: unknown) =>
      s.kti.establishTransferBasis({ ...ktiPublication(n), transfer });
    const r = await publish(2, ktiBasis(A, EVENT_COUNCIL));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("REFERENCE_INVALID");
      expect(r.error.message).toMatch(/canonical KTI object identity/);
    }
    // another object's canonical identity is no better, nor is a case or whitespace variant
    await establishObject(s, 3, OBJECT_OTHER);
    expect((await publish(4, ktiBasis(A, EVENT_COUNCIL, OBJECT_OTHER))).ok).toBe(false);
    await sealPacket(s, 5, 6, EVENT_LATER, A, "seal-variant", {
      payload: ktiPayload(OBJECT_GATE_ROTA, OBJECT_GATE_ROTA.toUpperCase()),
    });
    expect((await publish(7, ktiBasis(A, EVENT_LATER))).ok).toBe(false);
    expect(ktiFacts(s).map((f) => f.key)).toEqual(
      [ktiDevelopmentObjectKey(OBJECT_GATE_ROTA), ktiDevelopmentObjectKey(OBJECT_OTHER)].sort(),
    );
  });

  it("a packet whose referent is exactly the canonical object_id supports the explicitly established programme", async () => {
    const s = await seededKtiCampaign(tempDir());
    const e = await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    expect(s.access.packet(EVENT_COUNCIL, A)!.value.payload.referent).toBe(OBJECT_GATE_ROTA);
    expect(e.payload.referent).toBe(OBJECT_GATE_ROTA);
    await establishObject(s, 1);
    const basis = await establishTransfer(s, 2, A, EVENT_COUNCIL);
    expect(s.kti.transferBasis(basis.package_id)).toBeDefined();
  });
});

describe("a formed or received packet is evidence, never a programme: only the explicit KTI establishment creates Class-E state (clarification A)", () => {
  it("event, packet formation, a committed object and any number of packets create no KTI basis or package", async () => {
    const s = await seededKtiCampaign(tempDir());
    await establishObject(s, 1);
    const before = ktiFacts(s);
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await sealPacket(s, 3, 4, EVENT_LATER, A);
    await sealPacket(s, 5, 6, EVENT_SCHEMATIC, ACTOR_SWORD, "seal-2");
    expect(s.access.packet(EVENT_COUNCIL, A)).toBeDefined();
    expect(s.access.packet(EVENT_SCHEMATIC, ACTOR_SWORD)).toBeDefined();
    // KTI state is byte-identical: no basis, no package, no programme slot
    expect(ktiFacts(s)).toEqual(before);
    expect(ktiFacts(s).map((f) => f.key)).toEqual([ktiDevelopmentObjectKey(OBJECT_GATE_ROTA)]);
    expect(s.kti.transferBasis(ktiBasis(A, EVENT_COUNCIL).package_id)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });

  it("the adapter has no path that derives a programme from a packet: the basis is an explicit KTI publication carrying the management gate", async () => {
    const s = await seededKtiCampaign(tempDir());
    await sealPacket(s, 1, 2, EVENT_COUNCIL, A);
    await establishObject(s, 1);
    const b = ktiBasis(A, EVENT_COUNCIL);
    const missingGate: Record<string, unknown> = { ...b };
    delete missingGate["management"];
    const r = await s.kti.establishTransferBasis({ ...ktiPublication(2), transfer: missingGate });
    expect(!r.ok && r.error.code).toBe("INPUT_INVALID");
    const wrongGate = await s.kti.establishTransferBasis({
      ...ktiPublication(3),
      transfer: { ...b, management: "AUTOMATIC_ON_RECEIPT" },
    });
    expect(!wrongGate.ok && wrongGate.error.code).toBe("INPUT_INVALID");
    expect(s.kti.transferBasis(b.package_id)).toBeUndefined();
  });
});

describe("the programme source_id is the programme's own identity, not the F-014D true source (clarification C)", () => {
  it("source_id may lawfully differ from the engine-side true source/holder, which KTI never copies; the package still rests on the packet's lawful provenance", async () => {
    const s = await seededKtiCampaign(tempDir());
    const basis = await prepared(s);
    const provenance = s.access.engineSealedProvenance(EVENT_COUNCIL, A)!.value;
    expect(provenance.source.fact_key).toBe(sourceKey(SOURCE_SPEAKER));
    expect(basis.source_id).toBe(SOURCE_PARTY_MANILA);
    expect(basis.source_id).not.toBe(provenance.source.fact_key);
    await registerKtiConsumer(s, "k1", basis, 3);
    await must(advance(s));
    const pkg = s.kti.transferPackage(basis.package_id)!.value;
    expect(pkg.source_id).toBe(SOURCE_PARTY_MANILA);
    const text = JSON.stringify(ktiFacts(s).map((f) => f.value));
    expect(text).not.toContain(provenance.source.fact_key);
    expect(text).not.toContain(provenance.source.owner);
    // the packet reference and its sealed provenance are untouched
    expect(pkg.packet).toEqual({ fact_key: accessPacketKey(EVENT_COUNCIL, A), version: 1 });
    expect(s.access.engineSealedProvenance(EVENT_COUNCIL, A)!.value).toEqual(provenance);
  });

  it("changing source_id changes the programme: the same recipient, object and packet under another source party is its own slot and package", async () => {
    const s = await seededKtiCampaign(tempDir());
    const first = await prepared(s);
    const second = await establishTransfer(s, 3, A, EVENT_COUNCIL, OBJECT_GATE_ROTA, {
      source_id: SOURCE_PARTY_OTHER,
    });
    expect(second.package_id).not.toBe(first.package_id);
    expect(second.package_id).toBe(transferPackageId(SOURCE_PARTY_OTHER, A, OBJECT_GATE_ROTA));
    await registerKtiConsumer(s, "k1", first, 5);
    await registerKtiConsumer(s, "k2", second, 6);
    await must(advance(s, "tx-k1", "k1"));
    expect(s.kti.transferPackage(first.package_id)!.value.source_id).toBe(SOURCE_PARTY_MANILA);
    expect(s.kti.transferPackage(second.package_id)!.value.source_id).toBe(SOURCE_PARTY_OTHER);
    expect(s.campaign.verify()).toEqual([]);
  });

  it("changing the packet or event under the same source_id × recipient × object does not silently create a second slot: the basis is refused and the first stands", async () => {
    const s = await seededKtiCampaign(tempDir());
    const first = await prepared(s);
    // a later event with a different true source, evidencing the same programme
    await sealPacket(s, 3, 4, EVENT_LATER, A, "seal-later", {
      source: { owner: SYNTH_ACCESS_SOURCE_OWNER, fact_key: sourceKey(SOURCE_SCROLL), version: 1 },
    });
    const r = await s.kti.establishTransferBasis({
      ...ktiPublication(9),
      transfer: ktiBasis(A, EVENT_LATER),
    });
    expect(r.ok).toBe(false);
    expect(s.kti.transferBasis(first.package_id)!.value.packet.fact_key).toBe(
      accessPacketKey(EVENT_COUNCIL, A),
    );
    expect(ktiFacts(s).filter((f) => f.key.endsWith("/basis"))).toHaveLength(1);
  });
});

// the capability path is exercised so the proof is not limited to the simplest packet: a packet whose form depends on a
// Named-Actor capability is still just a sealed packet to KTI
describe("a packet whose representational form depended on a Named-Actor capability is consumed the same way and never alters the capability", () => {
  it("KTI references the packet only; the capability fact is byte-identical and never written or read by KTI", async () => {
    const s = await seededKtiCampaign(tempDir());
    const capBasis = await establishCapability(s, 1, A, CAP_METALWORKING);
    expect(capBasis.actor_id).toBe(A);
    // the packet forms in an earlier consequence's object, with the capability close declared ahead of it
    const event = await establishAccess(s, 2, EVENT_COUNCIL, A, {
      payload: ktiPayload(),
      representation: { capability_id: CAP_METALWORKING },
    });
    await must(
      s.coordinator.registerObject({
        ...temporalPublication(2),
        object: packetConsumerObject("seal-cap", event, capBasis),
      }),
    );
    await must(
      s.coordinator.advance(requestToBoundary(s, "tx-seal-cap", "packet-consumer-obj-seal-cap")),
    );
    const capBefore = structuredClone(
      s.campaign.store.getFact(actorCapabilityKey(A, CAP_METALWORKING))!,
    );
    expect(capBefore).toBeDefined();
    await establishObject(s, 1);
    const basis = await establishTransfer(s, 2, A, EVENT_COUNCIL);
    await registerKtiConsumer(s, "k1", basis, 3);
    const spy = spyStore(s.campaign.store);
    await must(
      new TemporalCoordinator(spy.store, ktiProviders()).advance(
        requestToBoundary(s, "tx-1", "kti-consumer-obj-k1"),
      ),
    );
    expect(s.campaign.store.getFact(actorCapabilityKey(A, CAP_METALWORKING))).toEqual(capBefore);
    expect(new Set(spy.getFacts).has(actorCapabilityKey(A, CAP_METALWORKING))).toBe(false);
    for (const g of spy.commits)
      for (const w of g.writes) expect(w.key.startsWith("actor/")).toBe(false);
    expect(s.kti.transferPackage(basis.package_id)!.value.packet.fact_key).toBe(
      accessPacketKey(EVENT_COUNCIL, A),
    );
    expect(s.campaign.verify()).toEqual([]);
  });
});
