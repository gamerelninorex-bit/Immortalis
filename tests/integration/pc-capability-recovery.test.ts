/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// PC capability — save → close → load → continue across every meaningful durable cut of the capability lifecycle, a
// failure at every durable step of the one new multi-step boundary this slice introduces (the received basis publication,
// then the PC Capability Close transaction: authority, close stage, consuming stage, kernel group), and load-time failure
// on a corrupted or inconsistent PC capability. The PC capability path reuses the existing persistence, receipts, journal
// and stage-identity machinery: after any crash, retry, replay or reload the basis, the capability and its close each exist
// exactly once and are never re-received or recomputed (no randomness exists).
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-04, RC-05, RC-16; IM-02, IM-03, IM-07, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  pcCapabilityBasisKey,
  pcCapabilityKey,
  pcCapabilityStage,
  pcExistenceContractKey,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  PC_CAPABILITY_RULE,
  PcCapabilityAdapter,
  createFileCampaign,
  factKind,
  stageGroupId,
  stageIntentId,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  CAP_SAILING,
  FIXTURE_CAMPAIGN,
  FIXTURE_PC_ID,
  consumerAdvanceRequest,
  consumerResultKey,
  group,
  pcCapabilityBasis,
  pcCapabilityContract,
  pcCapabilityPublication,
  write,
} from "@immortalis/testkit";
import {
  pcCapabilityCoordinator,
  pcCapabilitySummary,
  receiveBasis,
  registerPcConsumer,
  reopenPcCapability,
  seededPcCapabilityCampaign,
  type PcCapabilitySeeded,
} from "../support/pc-capability.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const P = FIXTURE_PC_ID;
const C = CAP_SAILING;
const capKey = pcCapabilityKey(P, C);
const basisKey = pcCapabilityBasisKey(P, C);
const stage = pcCapabilityStage(P, C);
const advance = (s: Pick<PcCapabilitySeeded, "coordinator">) =>
  s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1"));

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
const isCapabilityGroup = (g: any) =>
  g.owner === "pc_existence" && g.writes.some((w: any) => w.key === capKey);
const isConsumerGroup = (g: any) => g.writes.some((w: any) => w.key === consumerResultKey("c1"));
const isKernelGroup = (g: any) => g.group_id.startsWith("transaction-group:");
const isAuthorityGroup = (g: any) => g.group_id.startsWith("transaction-authority-group:");
const isBasisGroup = (g: any) => g.writes.some((w: any) => w.key === basisKey);

/** The deterministic reference: the whole lifecycle, uninterrupted. */
async function referenceRun() {
  const s = await seededPcCapabilityCampaign(tempDir());
  const basis = await receiveBasis(s, 1);
  await registerPcConsumer(s, "c1", basis, 2);
  await must(advance(s));
  const head = s.campaign.store.head();
  const summary = pcCapabilitySummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}
const same = (head: ReturnType<CampaignStore["head"]>, ref: ReturnType<CampaignStore["head"]>) => {
  expect(head.state_sha256).toBe(ref.state_sha256);
  expect(head.journal_entries).toBe(ref.journal_entries);
  expect(head.journal_head_sha256).toBe(ref.journal_head_sha256);
};
const versions = (s: PcCapabilitySeeded) => {
  const f = (k: string) => s.campaign.store.getFact(k)?.version ?? 0;
  return { basis: f(basisKey), capability: f(capKey), consumer: f(consumerResultKey("c1")) };
};

type Cut = {
  name: string;
  build: (s: PcCapabilitySeeded) => Promise<void>;
  versions: ReturnType<typeof versions>;
};
const cuts: Cut[] = [
  {
    name: "Existence Contract released, no basis yet",
    build: async () => {},
    versions: { basis: 0, capability: 0, consumer: 0 },
  },
  {
    name: "basis received, its consequence not yet registered",
    build: async (s) => void (await receiveBasis(s, 1)),
    versions: { basis: 1, capability: 0, consumer: 0 },
  },
  {
    name: "consequence registered, boundary not yet resolved",
    build: async (s) => registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2),
    versions: { basis: 1, capability: 0, consumer: 0 },
  },
  {
    name: "PC Capability Close committed, consuming stage not",
    build: async (s) => {
      await registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2);
      const r = await pcCapabilityCoordinator(
        crashBefore(s.campaign.store, isConsumerGroup),
      ).advance(consumerAdvanceRequest("tx-1", "c1"));
      expect(r.ok).toBe(false);
    },
    versions: { basis: 1, capability: 1, consumer: 0 },
  },
  {
    name: "both stages committed, the kernel transaction not",
    build: async (s) => {
      await registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2);
      await pcCapabilityCoordinator(crashBefore(s.campaign.store, isKernelGroup)).advance(
        consumerAdvanceRequest("tx-1", "c1"),
      );
    },
    versions: { basis: 1, capability: 1, consumer: 1 },
  },
  {
    name: "completed and sealed by its transaction",
    build: async (s) => {
      await registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2);
      await must(advance(s));
    },
    versions: { basis: 1, capability: 1, consumer: 1 },
  },
];

describe("save → close → load → continue at every durable cut of the PC capability lifecycle", () => {
  for (const cut of cuts) {
    it(`${cut.name}: reloads unchanged, verifies, and the continuation converges on the uninterrupted result`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededPcCapabilityCampaign(dir);
      await cut.build(s);
      expect(versions(s)).toEqual(cut.versions);
      const before = pcCapabilitySummary(s.campaign, s.coordinator);
      expect(s.campaign.verify()).toEqual([]);
      await s.campaign.close();
      const r = await reopenPcCapability(dir);
      expect(r.campaign.verify()).toEqual([]);
      // a valid capability and its provenance/close basis survive unchanged
      expect(pcCapabilitySummary(r.campaign, r.coordinator)).toEqual(before);
      expect(versions(r)).toEqual(cut.versions);
      // continue: whatever the cut, finishing the lifecycle reaches the reference result
      if (cut.versions.basis === 0) await receiveBasis(r, 1);
      if (cut.versions.basis === 0 || cut.name.startsWith("basis received"))
        await registerPcConsumer(r, "c1", r.pcs.basis(P, C)!.value, 2);
      if (!cut.name.startsWith("completed")) await must(advance(r));
      else expect((await must(advance(r))).replayed).toBe(true);
      same(r.campaign.store.head(), ref.head);
      expect(pcCapabilitySummary(r.campaign, r.coordinator)).toEqual(ref.summary);
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the continuation reads the same PC Capability Close after a reload: nothing is re-received, nothing recomputed", async () => {
    const dir = tempDir();
    const s = await seededPcCapabilityCampaign(dir);
    await registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2);
    await must(advance(s));
    const first = structuredClone(s.campaign.store.getFact(capKey)!);
    const receipt = s.campaign.store.lookupReceipt(stageIntentId(stage))!;
    await s.campaign.close();
    const r = await reopenPcCapability(dir);
    expect(r.campaign.store.getFact(capKey)).toEqual(first);
    expect(r.campaign.store.lookupReceipt(stageIntentId(stage))).toEqual(receipt);
    const again = await must(advance(r));
    expect(again.replayed).toBe(true);
    expect(r.campaign.store.getFact(capKey)).toEqual(first);
    await r.campaign.close();
  });
});

describe("a failure at EVERY durable step converges by identity", () => {
  const converge = async (
    build: (s: PcCapabilitySeeded) => Promise<void>,
    finish: (s: PcCapabilitySeeded) => Promise<void>,
  ) => {
    const ref = await referenceRun();
    const dir = tempDir();
    const s = await seededPcCapabilityCampaign(dir);
    await build(s);
    await s.campaign.close();
    const r = await reopenPcCapability(dir);
    await finish(r);
    same(r.campaign.store.head(), ref.head);
    expect(pcCapabilitySummary(r.campaign, r.coordinator)).toEqual(ref.summary);
    expect(r.campaign.verify()).toEqual([]);
    await r.campaign.close();
  };

  it("the BASIS publication: a crash before it, and a lost reply after it, each converge on one basis", async () => {
    // crash before the group takes effect
    {
      const s = await seededPcCapabilityCampaign(tempDir());
      const adapter = new PcCapabilityAdapter(crashBefore(s.campaign.store, isBasisGroup));
      const r = await adapter.receiveCapabilityBasis({
        ...pcCapabilityPublication(1),
        capability: pcCapabilityBasis(P, C),
      });
      expect(!r.ok && r.error.code).toBe("UNKNOWN_OUTCOME");
      expect(s.pcs.basis(P, C)).toBeUndefined();
      // reconcile by identity, then retry: exactly one basis
      await receiveBasis(s, 1);
      expect(s.pcs.basis(P, C)!.fact.version).toBe(1);
      await s.campaign.close();
    }
    // lost reply AFTER it took effect: re-presenting converges on the existing result
    {
      const s = await seededPcCapabilityCampaign(tempDir());
      const adapter = new PcCapabilityAdapter(lostReply(s.campaign.store, isBasisGroup));
      const lost = await adapter.receiveCapabilityBasis({
        ...pcCapabilityPublication(1),
        capability: pcCapabilityBasis(P, C),
      });
      expect(!lost.ok && lost.error.code).toBe("UNKNOWN_OUTCOME");
      const committed = s.pcs.basis(P, C)!;
      expect(committed.fact.version).toBe(1);
      const head = s.campaign.store.head();
      const replay = await must(
        s.pcs.receiveCapabilityBasis({
          ...pcCapabilityPublication(1),
          capability: pcCapabilityBasis(P, C),
        }),
      );
      expect(replay.replayed).toBe(true);
      expect(s.campaign.store.head()).toEqual(head);
      expect(s.pcs.basis(P, C)).toEqual(committed);
      // a CHANGED intent under the same identity is a conflict, never a silent reuse of the old receipt
      const changed = await s.pcs.receiveCapabilityBasis({
        ...pcCapabilityPublication(1),
        capability: pcCapabilityBasis(P, C, { marker: "S" }),
      });
      expect(changed.ok).toBe(false);
      expect(s.pcs.basis(P, C)!.value.marker).toBe("C");
      await s.campaign.close();
    }
  });

  it("the CLOSE TRANSACTION: a crash before each durable step (authority, close stage, consuming stage, kernel group) converges on the identical campaign", async () => {
    for (const [name, block] of [
      ["authority", isAuthorityGroup],
      ["PC Capability Close", isCapabilityGroup],
      ["consuming stage", isConsumerGroup],
      ["kernel group", isKernelGroup],
    ] as const) {
      await converge(
        async (s) => {
          await registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2);
          const r = await pcCapabilityCoordinator(crashBefore(s.campaign.store, block)).advance(
            consumerAdvanceRequest("tx-1", "c1"),
          );
          expect(r.ok, name).toBe(false);
        },
        async (s) => void (await must(advance(s))),
      );
    }
  });

  it("the CLOSE TRANSACTION: a lost reply after each durable step converges, and a committed stage is adopted, never recomputed or re-published", async () => {
    for (const [name, block] of [
      ["PC Capability Close", isCapabilityGroup],
      ["consuming stage", isConsumerGroup],
      ["kernel group", isKernelGroup],
    ] as const) {
      await converge(
        async (s) => {
          await registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2);
          const r = await pcCapabilityCoordinator(lostReply(s.campaign.store, block)).advance(
            consumerAdvanceRequest("tx-1", "c1"),
          );
          expect(r.ok, name).toBe(false);
        },
        async (s) => {
          const r = await must(advance(s));
          if (name !== "kernel group") expect(r.adopted.length).toBeGreaterThan(0);
          if (name === "PC Capability Close") expect(r.adopted).toContainEqual(stage);
        },
      );
    }
  });

  it("an UNKNOWN outcome is reconciled by identity before any retry can create another result: no sibling capability, no second close", async () => {
    const dir = tempDir();
    const s = await seededPcCapabilityCampaign(dir);
    await registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2);
    await pcCapabilityCoordinator(lostReply(s.campaign.store, isCapabilityGroup)).advance(
      consumerAdvanceRequest("tx-1", "c1"),
    );
    // the close exists; several retries (a fresh coordinator each) reach the same receipt and never a sibling
    const receipt = s.campaign.store.lookupReceipt(stageIntentId(stage))!;
    for (let i = 0; i < 3; i++) await must(advance(s));
    expect(s.campaign.store.lookupReceipt(stageIntentId(stage))).toEqual(receipt);
    expect(
      s.campaign.store
        .listFacts()
        .filter((f) => f.key.startsWith("pc/") && f.key.includes("/capability/")),
    ).toHaveLength(1);
    expect(s.campaign.store.getFact(capKey)!.version).toBe(1);
    expect(s.campaign.store.getFact(capKey)!.provenance.group_id).toBe(stageGroupId(stage));
    await s.campaign.close();
  });
});

describe("load fails closed on a corrupted or inconsistent PC capability", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededPcCapabilityCampaign(dir);
    await registerPcConsumer(s, "c1", await receiveBasis(s, 1), 2);
    await must(advance(s));
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
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

  it("an edit of the saved state — owner, facet, schema, marker, version, close reference or provenance — is not silently normalized", async () => {
    const edits: Record<string, (fact: any) => void> = {
      "marker upgraded": (f) => (f.value.marker = "S"),
      "marker is a number": (f) => (f.value.marker = 3),
      "version changed": (f) => (f.version = 2),
      "owner changed": (f) => (f.owner = "world_state"),
      "facet changed": (f) => (f.facet = "existence_contract"),
      "unmodelled field": (f) => (f.value.level = 4),
      "close reference altered": (f) => (f.value.close.stage.causal_process_id = "elsewhere"),
      "close name altered": (f) => (f.value.close.name = "actor-profile-capability-close"),
      "close name lowered": (f) => (f.value.close.name = "pc-capability-close"),
      "basis pin altered": (f) => (f.value.basis.version = 9),
      "capability identity altered": (f) => (f.value.capability_id = "capability-other"),
      "PC identity altered": (f) => (f.value.pc_id = "pc-someone-else"),
      "provenance group altered": (f) => (f.provenance.group_id = "raw-group"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === capKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("an edit of the saved basis (its marker, its contract pin, its cited claims) is not silently normalized either", async () => {
    const edits: Record<string, (fact: any) => void> = {
      marker: (f) => (f.value.marker = "A"),
      "contract version": (f) => (f.value.establishment.contract.version = 5),
      "contract of another PC": (f) =>
        (f.value.establishment.contract.fact_key = pcExistenceContractKey("pc-x")),
      "claim moved out of range": (f) => (f.value.establishment.claims[0].index = 9),
      "claims removed": (f) => (f.value.establishment.claims = []),
      "method changed": (f) => (f.value.establishment.method = "DEFERRED_DERIVATION"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts.find((f: any) => f.key === basisKey));
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("an edit of the saved Existence Contract that removes the claim a capability cites is detected on load", async () => {
    const dir = await saved();
    const p = join(dir, stateFile(dir));
    const j = JSON.parse(readFileSync(p, "utf8"));
    j.facts.find(
      (f: any) => f.key === pcExistenceContractKey(P),
    ).value.baseline_exception.player_overrides = [];
    writeFileSync(p, JSON.stringify(j));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a journal edit of the capability's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain('"marker":"C"');
    writeFileSync(journal, text.replace('"marker":"C"', '"marker":"S"'));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a build that does not register the synthetic consumer extension cannot open the campaign", async () => {
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
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
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
          owner: "pc_existence",
          facet: "pc_capability_profile",
          ...over,
        }),
      ],
      {
        owner: "pc_existence",
        facet: "pc_capability_profile",
        rule: PC_CAPABILITY_RULE,
        ...groupOver,
      },
    );
  const contract = (n: number, pcId = P) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [
        write(pcExistenceContractKey(pcId), pcCapabilityContract(pcId) as never, {
          owner: "pc_existence",
          facet: "existence_contract",
        }),
      ],
      {
        owner: "pc_existence",
        facet: "existence_contract",
        rule: factKind("pc_existence_contract").rule,
      },
    );
  const goodBasis = () => pcCapabilityBasis(P, C);
  const goodCapability = () => ({
    pc_id: P,
    capability_id: C,
    marker: "C",
    basis: { fact_key: basisKey, version: 1 },
    close: { name: "PC Capability Close", stage },
  });
  const pin = { reads: [{ key: pcExistenceContractKey(P), version: 1 }], depends_on: ["group-1"] };

  it("a capability with no committed basis, a raw (non-stage) capability, and a capability whose basis disagrees are PC_CAPABILITY_STATE", async () => {
    expect(
      await openOutcome(
        await rogue(async (s) => void (await must(s.commit(put(1, capKey, goodCapability()))))),
      ),
    ).toMatch(/^(PC_CAPABILITY_STATE,?)+$/);
    // a consistent basis and a capability committed as an ordinary group, not as its stage under a transaction
    const dir = await rogue(async (s) => {
      await must(s.commit(contract(1)));
      await must(s.commit(put(2, basisKey, goodBasis(), {}, pin)));
      await must(s.commit(put(3, capKey, goodCapability())));
    });
    expect(await openOutcome(dir)).toMatch(/PC_CAPABILITY_STATE/);
    const upgraded = await rogue(async (s) => {
      await must(s.commit(contract(1)));
      await must(s.commit(put(2, basisKey, goodBasis(), {}, pin)));
      await must(s.commit(put(3, capKey, { ...goodCapability(), marker: "S" })));
    });
    expect(await openOutcome(upgraded)).toMatch(/PC_CAPABILITY_STATE/);
  });

  it("a basis that did not read and depend on its contract, or whose contract was committed after it, is PC_CAPABILITY_STATE", async () => {
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(contract(1)));
          await must(s.commit(put(2, basisKey, goodBasis())));
        }),
      ),
    ).toMatch(/PC_CAPABILITY_STATE/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(put(1, basisKey, goodBasis())));
          await must(s.commit(contract(2)));
        }),
      ),
    ).toMatch(/PC_CAPABILITY_STATE/);
  });

  it("owner drift, rule drift, an unregistered PC key, an overwritten seal and a malformed value are each detected on load", async () => {
    expect(
      await openOutcome(
        await rogue(
          async (s) => void (await must(s.commit(put(1, "pc/p1/development/c1", { grade: "S" })))),
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
                  basisKey,
                  goodBasis(),
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
                put(
                  1,
                  basisKey,
                  goodBasis(),
                  {},
                  { rule: { ...PC_CAPABILITY_RULE, clause: "drifted" } },
                ),
              ),
            )),
        ),
      ),
    ).toMatch(/RULE_DRIFT/);
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(s.commit(put(1, basisKey, { ...goodBasis(), marker: "S+" })))),
        ),
      ),
    ).toMatch(/VALUE_INVALID/);
    expect(
      await openOutcome(
        await rogue(
          async (s) =>
            void (await must(
              s.commit(put(1, basisKey, { ...goodBasis(), pc_id: "someone-else" })),
            )),
        ),
      ),
    ).toMatch(/VALUE_INVALID/);
    expect(
      await openOutcome(
        await rogue(async (s) => {
          await must(s.commit(contract(1)));
          await must(s.commit(put(2, basisKey, goodBasis(), {}, pin)));
          await must(
            s.commit(put(3, basisKey, { ...goodBasis(), marker: "A" }, { expected_version: 1 })),
          );
        }),
      ),
    ).toMatch(/UNSUPPORTED_AMENDMENT/);
  });
});
