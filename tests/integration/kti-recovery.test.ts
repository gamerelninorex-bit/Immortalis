import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// KTI Managed Transfer Package — save → close → load → continue across every meaningful durable cut of the transfer
// lifecycle, a failure at every durable step of the multi-step boundaries this slice introduces (the authored object and
// basis publications, then the result-close transaction: authority, KTI stage, consuming stage, kernel group), and load-time
// failure on a corrupted or inconsistent save. The KTI path reuses the existing persistence, receipts, journal and
// stage-identity machinery: after any crash, retry, replay or reload the object, the basis and the package each exist exactly
// once, keep their identity, the packet reference and the result-close evidence, and are never re-published, improved or
// re-rolled (no randomness exists).
// Register lineage: IA-06, IA-16 (partial), IA-22 (partial), IA-30 (partial); RC-04, RC-05, RC-11, RC-16; IM-02, IM-03, IM-09,
// IM-12, IM-17. Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accessPacketKey,
  accessProvenanceKey,
  ktiDevelopmentObjectKey,
  ktiTransferBasisKey,
  ktiTransferPackageKey,
  ktiTransferStage,
  pcExistenceContractKey,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  KTI_RULE,
  KtiAdapter,
  createFileCampaign,
  stageGroupId,
  stageIntentId,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_SMITH,
  EVENT_COUNCIL,
  FIXTURE_CAMPAIGN,
  KTI_FIXTURE_EXTENSION,
  OBJECT_GATE_ROTA,
  SOURCE_SPEAKER,
  fixtureContract,
  group,
  historyGroup,
  ktiBasis,
  ktiConsumerResultKey,
  ktiObject,
  ktiPublication,
  at,
  sourceGroup,
  sourceKey,
  write,
} from "@immortalis/testkit";
import {
  establishObject,
  establishTransfer,
  ktiCoordinator,
  ktiSummary,
  registerKtiConsumer,
  reopenKti,
  requestTo,
  sealPacket,
  seededKtiCampaign,
  type KtiSeeded,
} from "../support/kti.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const E = EVENT_COUNCIL;
const basisDefault = ktiBasis(A, E);
const objectKey = ktiDevelopmentObjectKey(OBJECT_GATE_ROTA);
const basisKey = ktiTransferBasisKey(basisDefault.package_id);
const packageKey = ktiTransferPackageKey(basisDefault.package_id);
const packetKey = accessPacketKey(E, A);
const provKey = accessProvenanceKey(E, A);
const stage = ktiTransferStage(basisDefault.package_id);
// the consumer's one earned boundary: seal at 100 → 110, so the KTI consequence is due at 120 (deterministic)
const K1_AT = at(120);
const request = () => requestTo("tx-1", K1_AT);
const advance = (s: Pick<KtiSeeded, "coordinator">) => s.coordinator.advance(request());

/** A store that "crashes" (nothing committed, unknown outcome) before the first group the predicate names. */
function crashBefore(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    descriptor: inner.descriptor,
    head: () => inner.head(),
    getFact: (k) => inner.getFact(k),
    listFacts: () => inner.listFacts(),
    lookupReceipt: (i) => inner.lookupReceipt(i),
    committedGroup: (i) => inner.committedGroup(i),
    close: () => inner.close(),
    commit: async (g: any) =>
      block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "crash" } } as never)
        : inner.commit(g),
  };
}
/** A store that COMMITS the group the predicate names and then loses the reply (unknown outcome). */
function lostReply(inner: CampaignStore, block: (g: any) => boolean): CampaignStore {
  return {
    ...crashBefore(inner, () => false),
    commit: async (g: any) => {
      const r = await inner.commit(g);
      return block(g)
        ? ({ ok: false, error: { code: "UNKNOWN_OUTCOME", message: "lost reply" } } as never)
        : r;
    },
  };
}
const isStageGroup = (g: any) => g.writes.some((w: any) => w.key === packageKey);
const isConsumerGroup = (g: any) => g.writes.some((w: any) => w.key === ktiConsumerResultKey("k1"));
const isKernelGroup = (g: any) => g.group_id.startsWith("transaction-group:");
const isAuthorityGroup = (g: any) => g.group_id.startsWith("transaction-authority-group:");
const isObjectGroup = (g: any) => g.writes.some((w: any) => w.key === objectKey);
const isBasisGroup = (g: any) => g.writes.some((w: any) => w.key === basisKey);

/** The lifecycle as ordered steps, each idempotent in intent: the packet is sealed first, KTI state follows it. */
const steps = {
  seal: (s: KtiSeeded) => sealPacket(s, 1, 2, E, A).then(() => undefined),
  object: (s: KtiSeeded) => establishObject(s, 1).then(() => undefined),
  basis: (s: KtiSeeded) => establishTransfer(s, 2, A, E).then(() => undefined),
  register: (s: KtiSeeded) =>
    registerKtiConsumer(
      s,
      "k1",
      s.kti.transferBasis(basisDefault.package_id)?.value ?? basisDefault,
      3,
    ),
  advance: (s: KtiSeeded) => must(advance(s)).then(() => undefined),
};
const prepare = async (s: KtiSeeded) => {
  await steps.seal(s);
  await steps.object(s);
  await steps.basis(s);
  await steps.register(s);
};

/** The deterministic reference: the whole lifecycle, uninterrupted. */
async function referenceRun() {
  const s = await seededKtiCampaign(tempDir());
  await prepare(s);
  await must(advance(s));
  const head = s.campaign.store.head();
  const summary = ktiSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}
const same = (head: ReturnType<CampaignStore["head"]>, ref: ReturnType<CampaignStore["head"]>) => {
  expect(head.state_sha256).toBe(ref.state_sha256);
  expect(head.journal_entries).toBe(ref.journal_entries);
  expect(head.journal_head_sha256).toBe(ref.journal_head_sha256);
};
const versions = (s: KtiSeeded) => {
  const f = (k: string) => s.campaign.store.getFact(k)?.version ?? 0;
  return {
    packet: f(packetKey),
    provenance: f(provKey),
    object: f(objectKey),
    basis: f(basisKey),
    package: f(packageKey),
    consumer: f(ktiConsumerResultKey("k1")),
  };
};

type Cut = {
  name: string;
  build: (s: KtiSeeded) => Promise<void>;
  /** the remaining lifecycle steps that finish it */
  rest: (keyof typeof steps)[];
  versions: ReturnType<typeof versions>;
};
const cuts: Cut[] = [
  {
    name: "causal history and carriers committed, no packet yet",
    build: async () => {},
    rest: ["seal", "object", "basis", "register", "advance"],
    versions: { packet: 0, provenance: 0, object: 0, basis: 0, package: 0, consumer: 0 },
  },
  {
    name: "packet sealed, no KTI state yet",
    build: steps.seal,
    rest: ["object", "basis", "register", "advance"],
    versions: { packet: 1, provenance: 1, object: 0, basis: 0, package: 0, consumer: 0 },
  },
  {
    name: "development object committed, no basis yet",
    build: async (s) => {
      await steps.seal(s);
      await steps.object(s);
    },
    rest: ["basis", "register", "advance"],
    versions: { packet: 1, provenance: 1, object: 1, basis: 0, package: 0, consumer: 0 },
  },
  {
    name: "basis sealed, its consequence not yet registered",
    build: async (s) => {
      await steps.seal(s);
      await steps.object(s);
      await steps.basis(s);
    },
    rest: ["register", "advance"],
    versions: { packet: 1, provenance: 1, object: 1, basis: 1, package: 0, consumer: 0 },
  },
  {
    name: "consequence registered, boundary not yet resolved",
    build: prepare,
    rest: ["advance"],
    versions: { packet: 1, provenance: 1, object: 1, basis: 1, package: 0, consumer: 0 },
  },
  {
    name: "KTI result close committed, consuming stage not",
    build: async (s) => {
      await prepare(s);
      const r = await ktiCoordinator(crashBefore(s.campaign.store, isConsumerGroup)).advance(
        request(),
      );
      expect(r.ok).toBe(false);
    },
    rest: ["advance"],
    versions: { packet: 1, provenance: 1, object: 1, basis: 1, package: 1, consumer: 0 },
  },
  {
    name: "all stages committed, the kernel transaction not",
    build: async (s) => {
      await prepare(s);
      await ktiCoordinator(crashBefore(s.campaign.store, isKernelGroup)).advance(request());
    },
    rest: ["advance"],
    versions: { packet: 1, provenance: 1, object: 1, basis: 1, package: 1, consumer: 1 },
  },
  {
    name: "completed and sealed by its transaction",
    build: async (s) => {
      await prepare(s);
      await steps.advance(s);
    },
    rest: [],
    versions: { packet: 1, provenance: 1, object: 1, basis: 1, package: 1, consumer: 1 },
  },
];

describe("save → close → load → continue at every durable cut of the transfer lifecycle (acceptance 11)", () => {
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, verifies, and the continuation converges on the uninterrupted result`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededKtiCampaign(dir);
      await cut.build(s);
      expect(versions(s)).toEqual(cut.versions);
      const before = ktiSummary(s.campaign, s.coordinator);
      expect(s.campaign.verify()).toEqual([]);
      await s.campaign.close();
      const r = await reopenKti(dir);
      expect(r.campaign.verify()).toEqual([]);
      // a valid development object, basis, packet reference and package survive unchanged
      expect(ktiSummary(r.campaign, r.coordinator)).toEqual(before);
      expect(versions(r)).toEqual(cut.versions);
      // continue: whatever the cut, finishing the lifecycle reaches the reference result
      for (const step of cut.rest) await steps[step](r);
      if (cut.rest.length === 0) expect((await must(advance(r))).replayed).toBe(true);
      same(r.campaign.store.head(), ref.head);
      expect(ktiSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the continuation reads the same package after a reload: identity, packet reference, source reference and result-close evidence are preserved; nothing is re-published", async () => {
    const dir = tempDir();
    const s = await seededKtiCampaign(dir);
    await prepare(s);
    await must(advance(s));
    const pkg = structuredClone(s.campaign.store.getFact(packageKey)!);
    const basis = structuredClone(s.campaign.store.getFact(basisKey)!);
    const object = structuredClone(s.campaign.store.getFact(objectKey)!);
    const packet = structuredClone(s.campaign.store.getFact(packetKey)!);
    const receipt = s.campaign.store.lookupReceipt(stageIntentId(stage))!;
    await s.campaign.close();
    const r = await reopenKti(dir);
    expect(r.campaign.store.getFact(packageKey)).toEqual(pkg);
    expect(r.campaign.store.getFact(basisKey)).toEqual(basis);
    expect(r.campaign.store.getFact(objectKey)).toEqual(object);
    expect(r.campaign.store.getFact(packetKey)).toEqual(packet);
    expect(r.campaign.store.lookupReceipt(stageIntentId(stage))).toEqual(receipt);
    // package identity: the same key and the same stage-derived group and intent
    expect(r.kti.transferPackage(basisDefault.package_id)!.close_group).toBe(stageGroupId(stage));
    expect(r.kti.transferPackage(basisDefault.package_id)!.value.close).toEqual({
      name: "kti-result-close",
      stage,
    });
    expect(r.kti.transferPackage(basisDefault.package_id)!.value.packet).toEqual({
      fact_key: packetKey,
      version: 1,
    });
    // the saved KTI state is engine-sealed and holds no F-014D event or provenance content
    expect(r.kti.transferPackage(basisDefault.package_id)!.fact.secrecy).toBe("kti.engine-sealed");
    expect(JSON.stringify(r.kti.transferPackage(basisDefault.package_id)!.value)).not.toContain(
      "SPEECH",
    );
    // idempotent recovery: continuing replays; no group is committed again, and the same-programme slot stays occupied
    const again = await must(advance(r));
    expect(again.replayed).toBe(true);
    expect(r.campaign.store.getFact(packageKey)).toEqual(pkg);
    const dup = await r.kti.establishTransferBasis({
      ...ktiPublication(77),
      transfer: ktiBasis(A, E),
    });
    expect(dup.ok).toBe(false);
    await r.campaign.close();
  });
});

describe("a failure at EVERY durable step converges by identity (acceptance 10, 11)", () => {
  const converge = async (
    build: (s: KtiSeeded) => Promise<void>,
    finish: (s: KtiSeeded) => Promise<void>,
  ) => {
    const ref = await referenceRun();
    const dir = tempDir();
    const s = await seededKtiCampaign(dir);
    await build(s);
    await s.campaign.close();
    const r = await reopenKti(dir);
    await finish(r);
    same(r.campaign.store.head(), ref.head);
    expect(ktiSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  };

  it("the OBJECT and BASIS publications: a crash before each, and a lost reply after each, converge on one object and one basis", async () => {
    for (const [name, isGroup, publish] of [
      [
        "object",
        isObjectGroup,
        (a: KtiAdapter) =>
          a.establishDevelopmentObject({ ...ktiPublication(1), object: ktiObject() }),
      ],
      [
        "basis",
        isBasisGroup,
        (a: KtiAdapter) =>
          a.establishTransferBasis({ ...ktiPublication(2), transfer: basisDefault }),
      ],
    ] as const) {
      // crash before the group takes effect
      {
        const s = await seededKtiCampaign(tempDir());
        await steps.seal(s);
        if (name === "basis") await steps.object(s);
        const adapter = new KtiAdapter(crashBefore(s.campaign.store, isGroup));
        const r = await publish(adapter);
        expect(!r.ok && r.error.code, name).toBe("UNKNOWN_OUTCOME");
        const key = name === "object" ? objectKey : basisKey;
        expect(s.campaign.store.getFact(key)).toBeUndefined();
        // reconcile by identity, then retry: exactly one
        if (name === "object") await steps.object(s);
        else await steps.basis(s);
        expect(s.campaign.store.getFact(key)!.version).toBe(1);
        await s.campaign.close();
      }
      // lost reply AFTER it took effect: re-presenting converges on the existing result
      {
        const s = await seededKtiCampaign(tempDir());
        await steps.seal(s);
        if (name === "basis") await steps.object(s);
        const adapter = new KtiAdapter(lostReply(s.campaign.store, isGroup));
        const lost = await publish(adapter);
        expect(!lost.ok && lost.error.code, name).toBe("UNKNOWN_OUTCOME");
        const key = name === "object" ? objectKey : basisKey;
        const committed = structuredClone(s.campaign.store.getFact(key)!);
        expect(committed.version).toBe(1);
        const head = s.campaign.store.head();
        const replay = await must(publish(new KtiAdapter(s.campaign.store)));
        expect(replay.replayed, name).toBe(true);
        expect(s.campaign.store.head()).toEqual(head);
        expect(s.campaign.store.getFact(key)).toEqual(committed);
        // a CHANGED intent under the same identity is a conflict, never a silent reuse of the old receipt
        if (name === "object") {
          const changed = await s.kti.establishDevelopmentObject({
            ...ktiPublication(1),
            object: ktiObject(OBJECT_GATE_ROTA, { object_class: "TECHNIQUE_TECHNOLOGY" }),
          });
          expect(changed.ok).toBe(false);
          expect(s.kti.developmentObject(OBJECT_GATE_ROTA)!.value.object_class).toBe(
            "METHOD_PRACTICE",
          );
        }
        await s.campaign.close();
      }
    }
  });

  it("the RESULT-CLOSE TRANSACTION: a crash before each durable step (authority, KTI stage, consuming stage, kernel group) converges on the identical campaign", async () => {
    for (const [name, block] of [
      ["authority", isAuthorityGroup],
      ["KTI stage", isStageGroup],
      ["consuming stage", isConsumerGroup],
      ["kernel group", isKernelGroup],
    ] as const) {
      await converge(
        async (s) => {
          await prepare(s);
          const r = await ktiCoordinator(crashBefore(s.campaign.store, block)).advance(request());
          expect(r.ok, name).toBe(false);
        },
        async (s) => void (await must(advance(s))),
      );
    }
  });

  it("the RESULT-CLOSE TRANSACTION: a lost reply after each durable step converges, and a committed result is adopted, never recomputed or re-published", async () => {
    for (const [name, block] of [
      ["KTI stage", isStageGroup],
      ["consuming stage", isConsumerGroup],
      ["kernel group", isKernelGroup],
    ] as const) {
      await converge(
        async (s) => {
          await prepare(s);
          const r = await ktiCoordinator(lostReply(s.campaign.store, block)).advance(request());
          expect(r.ok, name).toBe(false);
          // the lost reply did not lose the effect: the group is durably there, exactly once
          if (name === "KTI stage") expect(s.campaign.store.getFact(packageKey)).toBeDefined();
        },
        async (s) => {
          const r = await must(advance(s));
          if (name !== "kernel group") expect(r.adopted.length).toBeGreaterThan(0);
          if (name === "KTI stage") expect(r.adopted).toContainEqual(stage);
        },
      );
    }
  });

  it("an UNKNOWN outcome is reconciled by identity before any retry can create another result: no sibling package, no second close, no improved package", async () => {
    const dir = tempDir();
    const s = await seededKtiCampaign(dir);
    await prepare(s);
    await ktiCoordinator(lostReply(s.campaign.store, isStageGroup)).advance(request());
    // the package exists; several retries (a fresh coordinator each) reach the same receipt and never a sibling
    const receipt = s.campaign.store.lookupReceipt(stageIntentId(stage))!;
    const pkg = structuredClone(s.campaign.store.getFact(packageKey)!);
    for (let i = 0; i < 3; i++) await must(advance(s));
    expect(s.campaign.store.lookupReceipt(stageIntentId(stage))).toEqual(receipt);
    expect(s.campaign.store.getFact(packageKey)).toEqual(pkg);
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("kti/") && f.key.endsWith("/package")),
    ).toHaveLength(1);
    expect(s.campaign.store.getFact(packageKey)!.version).toBe(1);
    expect(s.campaign.store.getFact(packageKey)!.provenance.group_id).toBe(stageGroupId(stage));
    await s.campaign.close();
  });
});

describe("load fails closed on a corrupted or inconsistent save (acceptance 10, 11)", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededKtiCampaign(dir);
    await prepare(s);
    await must(advance(s));
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: KTI_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
      : r.error.code;
  };

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  const savedEdits: Record<string, [string, (fact: any) => void]> = {
    "package status completed": [packageKey, (f) => (f.value.status = "COMPLETED")],
    "package recipient changed": [packageKey, (f) => (f.value.recipient = "actor-other")],
    "package packet re-pinned": [packageKey, (f) => (f.value.packet.version = 9)],
    "package packet swapped": [
      packageKey,
      (f) => (f.value.packet.fact_key = accessPacketKey("event-later", A)),
    ],
    "package source_id altered": [packageKey, (f) => (f.value.source_id = "source-party-other")],
    "package true source added": [
      packageKey,
      (f) => (f.value.source = { owner: "o", fact_key: "k" }),
    ],
    "package object re-pinned": [packageKey, (f) => (f.value.development_object.version = 9)],
    "package close renamed": [packageKey, (f) => (f.value.close.name = "another-close")],
    "package identity forged": [packageKey, (f) => (f.value.package_id = "transfer-forged")],
    "competence added to the package": [packageKey, (f) => (f.value.competence = "PARTIAL")],
    "event leaked into the package": [packageKey, (f) => (f.value.event_id = E)],
    "package class opened": [packageKey, (f) => (f.secrecy = "epistemic.actor-accessible")],
    "package owner changed": [packageKey, (f) => (f.owner = "world_state")],
    "package facet changed": [packageKey, (f) => (f.facet = "package")],
    "package version changed": [packageKey, (f) => (f.version = 2)],
    "package provenance group altered": [packageKey, (f) => (f.provenance.group_id = "raw-group")],
    "basis source_id altered": [basisKey, (f) => (f.value.source_id = "source-party-other")],
    "basis true source added": [basisKey, (f) => (f.value.source = { owner: "o", fact_key: "k" })],
    "basis recipient changed": [basisKey, (f) => (f.value.recipient = "actor-other")],
    "basis mode added": [basisKey, (f) => (f.value.mode = "BROADCAST_EXPOSURE")],
    "basis audience added": [basisKey, (f) => (f.value.audience = { area: "town" })],
    "basis packet swapped": [
      basisKey,
      (f) => (f.value.packet.fact_key = accessPacketKey("event-later", A)),
    ],
    "basis class opened": [basisKey, (f) => (f.secrecy = "epistemic.actor-accessible")],
    "object identity rewritten": [objectKey, (f) => (f.value.object_id = "another-object")],
    "object referent label added": [objectKey, (f) => (f.value.referent = "the gate rota")],
    "object class unknown": [objectKey, (f) => (f.value.object_class = "TECH_TREE_NODE")],
    "object faction added": [objectKey, (f) => (f.value.faction = "f1")],
    "object class opened": [objectKey, (f) => (f.secrecy = "epistemic.actor-accessible")],
  };

  const checkEdits = async (pick: (key: string) => boolean) => {
    for (const [name, [key, edit]] of Object.entries(savedEdits)) {
      if (!pick(key)) continue;
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === key));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  };
  it("an edit of the saved package — owner, facet, schema, class, status, references, identity or provenance — is not silently normalized", async () => {
    await checkEdits((k) => k === packageKey);
  }, 30_000);
  it("an edit of the saved basis — source, recipient, mode, audience, packet or class — is not silently normalized", async () => {
    await checkEdits((k) => k === basisKey);
  }, 30_000);
  it("an edit of the saved development object — referent, class, a faction field or class — is not silently normalized", async () => {
    await checkEdits((k) => k === objectKey);
  });

  it("an edit of the sealed packet or its provenance underneath the KTI state is not silently normalized either", async () => {
    const edits: Record<string, [string, (fact: any) => void]> = {
      "packet referent changed": [packetKey, (f) => (f.value.payload.referent = "another subject")],
      "packet recipient changed": [packetKey, (f) => (f.value.recipient = "actor-other")],
      "provenance source altered": [
        provKey,
        (f) => (f.value.source.fact_key = sourceKey("source-scroll")),
      ],
      "provenance recipient altered": [provKey, (f) => (f.value.recipient = "actor-other")],
    };
    for (const [name, [key, edit]] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j.facts.find((f: any) => f.key === key));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a journal edit of the object's or basis's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("MATERIALLY_FUTURE_CAUSAL");
    writeFileSync(journal, text.replace("MATERIALLY_FUTURE_CAUSAL", "MATERIALLY_FUTURE_CAUSAL "));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a build that does not register the KTI owner cannot open the campaign", async () => {
    const dir = await saved();
    const r = await CanonicalCampaign.open(dir);
    expect(r.ok).toBe(false);
  });

  /** A package built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(build: (s: CampaignStore) => Promise<void>): Promise<string> {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...KTI_FIXTURE_EXTENSION.owners]),
      }),
    );
    await build(s);
    await s.close();
    return dir;
  }
  const put = (n: number, key: string, value: unknown, over: any = {}, groupOver: any = {}) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(key, value as never, {
          owner: "kti",
          facet: "kti_development",
          secrecy: "kti.engine-sealed",
          ...over,
        }),
      ],
      { owner: "kti", facet: "kti_development", rule: KTI_RULE, ...groupOver },
    );

  it("a basis with no committed object or packet, a raw (non-stage) package and a package with no basis are KTI_STATE", async () => {
    // a basis with no committed object, packet or provenance
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, basisKey, basisDefault)));
        }),
      ),
    ).toMatch(/KTI_STATE/);
    // a package with no committed basis
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, objectKey, ktiObject())));
          await must(
            s.commit(
              put(2, packageKey, {
                package_id: basisDefault.package_id,
                status: "ACTIVE",
                source_id: basisDefault.source_id,
                recipient: A,
                development_object: basisDefault.development_object,
                packet: basisDefault.packet,
                basis: { fact_key: basisKey, version: 1 },
                close: { name: "kti-result-close", stage },
              }),
            ),
          );
        }),
      ),
    ).toMatch(/KTI_STATE/);
  });

  it("owner drift, rule drift, an unregistered KTI key, an overwritten seal and a malformed value are each detected on load", async () => {
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(s.commit(put(1, "kti/relationship/f1/o1", { competence: "B" })))),
        ),
      ),
    ).toBe("UNREGISTERED_KEY");
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(
              s.commit(
                put(
                  1,
                  objectKey,
                  ktiObject(),
                  { owner: "world_state", facet: "world_profile" },
                  { owner: "world_state", facet: "world_profile" },
                ),
              ),
            )),
        ),
      ),
    ).toMatch(/WRONG_OWNER_FACET/);
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(
              s.commit(
                put(1, objectKey, ktiObject(), {}, { rule: { ...KTI_RULE, clause: "drifted" } }),
              ),
            )),
        ),
      ),
    ).toMatch(/RULE_DRIFT/);
    for (const bad of [
      { ...ktiObject(), faction: "f1" },
      { ...ktiObject(), object_class: "TECH_TREE_NODE" },
      { ...ktiObject(), object_id: "someone-else" },
    ])
      expect(
        await openOutcome(
          await rogue(async (s) => void (await must(s.commit(put(1, objectKey, bad))))),
        ),
        JSON.stringify(bad),
      ).toMatch(/VALUE_INVALID/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, objectKey, ktiObject())));
          await must(
            s.commit(
              put(
                2,
                objectKey,
                ktiObject(OBJECT_GATE_ROTA, { object_class: "TECHNIQUE_TECHNOLOGY" }),
                {
                  expected_version: 1,
                },
              ),
            ),
          );
        }),
      ),
    ).toMatch(/UNSUPPORTED_AMENDMENT/);
  });

  it("a basis written for a Player Character's identity is detected on load, by receipt order", async () => {
    const dir = await rogue(async (s) => {
      await must(s.commit(historyGroup(FIXTURE_CAMPAIGN, 1, `${A}-biography`)));
      await must(s.commit(sourceGroup(FIXTURE_CAMPAIGN, 2, SOURCE_SPEAKER)));
      await must(s.commit(put(3, objectKey, ktiObject())));
      await must(
        s.commit(
          group(
            FIXTURE_CAMPAIGN,
            4,
            [
              write(pcExistenceContractKey(A), fixtureContract({ pc_id: A }) as never, {
                owner: "pc_existence",
                facet: "existence_contract",
              }),
            ],
            { owner: "pc_existence", facet: "existence_contract" },
          ),
        ),
      );
      await must(s.commit(put(5, basisKey, basisDefault)));
    });
    expect(await openOutcome(dir)).toMatch(/KTI_STATE/);
  });
});
