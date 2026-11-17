/* eslint-disable @typescript-eslint/no-explicit-any -- tests build and tamper with arbitrary group and fact values */
// S-4 initial Standing Instruction ledger — BLUE exact-HEAD review finding H-1 on PR #107: the closure-or-null of an engine-origin
// ledger must be tied to the SAME source-qualified target world AT THE PC-OWNER COMMIT (BLUE S-4 v0.4 §4, brief Part B1/B4), for a raw
// `store.commit`, for historical replay and for cold-open verification as much as for the trusted initializer. MECHANISM ONLY (T1).
//
// The reproducer is exactly the one BLUE specified: a real PC, world and locus, a real setup placement and a real `world_setup_closure`;
// before binding, an otherwise valid raw ledger group whose `origin.setup_closure` is substituted with an explicit null, with the SHA-256,
// the version head and the derived group / intent / cause identity RECOMPUTED, and the reads and dependencies made internally consistent
// with the false null (so a stale digest or a dangling pin cannot make the test fail for the wrong reason). A direct `store.commit` must
// refuse and must commit NEITHER ledger fact.
import { describe, expect, it } from "vitest";
import {
  LEDGER_ORIGIN_ENGINE_CLOSURE,
  PLAYER_CHARACTER_BINDING_KEY,
  pcExistenceContractKey,
  worldLocusKey,
  worldProfileKey,
  worldSetupClosureKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  createFileCampaign,
  verifyCanonicalIntegrity,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  FIXTURE_CAMPAIGN,
  fixtureContract,
  fixtureLocus,
  publication,
} from "@immortalis/testkit";
import { W2, commitClosure, commitPlacement, r1Scene } from "../support/actor-presence.ts";
import {
  HEAD_KEY,
  VERSION_KEY,
  W,
  bindInput,
  L,
  code,
  rawBinding,
  rawLedgerGroup,
  reseal,
  snapshot,
  target,
} from "../support/ledger.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const closureKey = worldSetupClosureKey(W);

/** A real PC, world, locus, B1 setup placement and `world_setup_closure`, nothing else: the ledger and the binding come next. */
async function closedWorld(dir = tempDir()) {
  const s = await r1Scene(dir);
  await must(commitPlacement(s));
  await must(
    s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() }),
  );
  await must(commitClosure(s));
  return { s, dir };
}

/**
 * The forged group: derived from the same plan the owner path uses, then the closure replaced by an explicit null, every derived value
 * recomputed, and the reads / dependencies made consistent with that null (no read of the closure key at all, no dependency on its group).
 */
async function forgedNull(campaign: CanonicalCampaign): Promise<any> {
  const closureGroup = campaign.store.getFact(closureKey)!.provenance.group_id;
  return rawLedgerGroup(campaign, (g) => {
    const version = g.writes.find((w: any) => w.key === VERSION_KEY);
    expect(
      version.value.origin.setup_closure,
      "the genuine plan cites the real closure",
    ).not.toBeNull();
    version.value.origin.setup_closure = null;
    g.reads = g.reads.filter((r: any) => r.key !== closureKey);
    g.depends_on = g.depends_on.filter((d: string) => d !== closureGroup);
    reseal(g);
  });
}

const committedNothing = (campaign: CanonicalCampaign) => {
  const facts = snapshot(campaign.store);
  expect(HEAD_KEY in facts, "the ledger head was committed").toBe(false);
  expect(VERSION_KEY in facts, "the ledger version was committed").toBe(false);
};

describe("H-1: a forged null setup-closure origin is refused AT LEDGER ADMISSION (raw store.commit)", () => {
  it("RED/GREEN: an explicit null after a real closure of the intended world is refused, and neither ledger fact is committed", async () => {
    const { s } = await closedWorld();
    const before = s.campaign.store.head();
    const forged = await forgedNull(s.campaign);
    // internally consistent: the false null, a matching digest and head, a derived identity, and no closure pin
    const v = forged.writes.find((w: any) => w.key === VERSION_KEY).value;
    expect(v.origin.kind).toBe(LEDGER_ORIGIN_ENGINE_CLOSURE);
    expect(v.origin.setup_closure).toBeNull();
    expect(forged.reads.some((r: any) => r.key === closureKey)).toBe(false);

    const refused = await s.campaign.store.commit(forged);
    expect(refused.ok, JSON.stringify(refused)).toBe(false);
    expect(!refused.ok && refused.error.code).toBe("REFERENCE_INVALID");
    expect(!refused.ok && refused.error.message).toMatch(/closure/);
    committedNothing(s.campaign);
    expect(s.campaign.store.head().journal_head_sha256).toBe(before.journal_head_sha256);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });

  it("the same forgery that ALSO pins the closure key at version 0 (an absence claim) is refused: the closure is really there", async () => {
    const { s } = await closedWorld();
    const forged = await rawLedgerGroup(s.campaign, (g) => {
      g.writes.find((w: any) => w.key === VERSION_KEY).value.origin.setup_closure = null;
      g.depends_on = g.depends_on.filter(
        (d: string) => d !== s.campaign.store.getFact(closureKey)!.provenance.group_id,
      );
      g.reads = g.reads.map((r: any) => (r.key === closureKey ? { ...r, version: 0 } : r));
      reseal(g);
    });
    const refused = await code(s.campaign.store.commit(forged) as never);
    expect(["STALE_READ", "REFERENCE_INVALID"]).toContain(refused);
    committedNothing(s.campaign);
    await s.campaign.close();
  });

  it("control: the authentic origin that cites that very closure commits, and its later native binding is allowed", async () => {
    const { s, dir } = await closedWorld();
    const genuine: any = await rawLedgerGroup(s.campaign);
    const origin = genuine.writes.find((w: any) => w.key === VERSION_KEY).value.origin;
    expect(origin.setup_closure?.fact_key).toBe(closureKey);
    await must(s.campaign.store.commit(genuine));
    await must(s.campaign.bindPlayerCharacter(bindInput(41)));
    expect(s.campaign.binding()!.value.active_pc.entity_id).toBe(target().pc_id);
    expect(PLAYER_CHARACTER_BINDING_KEY in snapshot(s.campaign.store)).toBe(true);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
    const reopened = await must(
      CanonicalCampaign.open(dir, { buildId: "s4-h1-control", extension: ACTOR_FIXTURE_EXTENSION }),
    );
    expect(reopened.verify()).toEqual([]);
    await reopened.close();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// The target world is part of what the witness rests on: wrong-world, absence, and every pin of the origin
// ---------------------------------------------------------------------------------------------------------------------------------

const wRef = (w: string) => ({ fact_key: worldProfileKey(w), entity_id: w });
const W2_LOCUS = "locus-w2";

/** A PC and two worlds, W and W2, each independently closed or not. Setup placements are not used (an empty inventory is legal). */
async function twoWorlds(o: { closeW: boolean; closeW2: boolean }) {
  const s = await r1Scene(tempDir(), { extras: true, noBasis: true });
  await must(
    s.campaign.establishLocus({
      ...publication(50),
      locus: fixtureLocus({ locus_id: W2_LOCUS, world: wRef(W2) }),
    }),
  );
  await must(
    s.campaign.releasePlayerCharacter({ ...publication(51), contract: fixtureContract() }),
  );
  if (o.closeW) await must(commitClosure(s, [], W));
  if (o.closeW2) await must(commitClosure(s, [], W2));
  return s;
}

const refOfKey = (c: CanonicalCampaign, key: string) => {
  const f = c.store.getFact(key)!;
  return {
    fact_key: f.key,
    version: f.version,
    commit: { group_id: f.provenance.group_id, intent_id: f.provenance.intent_id },
  };
};
const pinOf = (g: any, c: CanonicalCampaign, key: string, version?: number) => {
  g.reads = g.reads.filter((r: any) => r.key !== key);
  g.reads.push({ key, version: version ?? c.store.getFact(key)?.version ?? 0 });
  const provider = c.store.getFact(key)?.provenance.group_id;
  if (provider && !g.depends_on.includes(provider)) g.depends_on.push(provider);
};
const unpin = (g: any, c: CanonicalCampaign, key: string) => {
  const provider = c.store.getFact(key)?.provenance.group_id;
  g.reads = g.reads.filter((r: any) => r.key !== key);
  if (provider) g.depends_on = g.depends_on.filter((d: string) => d !== provider);
};
const originOf = (g: any) => g.writes.find((w: any) => w.key === VERSION_KEY).value.origin;

interface Forgery {
  readonly name: string;
  readonly scene: { closeW: boolean; closeW2: boolean };
  readonly world: string;
  readonly locus: string;
  readonly forge: (g: any, c: CanonicalCampaign) => void;
  readonly code: string;
  readonly reason: RegExp;
}

const forgeries: readonly Forgery[] = [
  {
    name: "a ledger for the UNCLOSED world W that cites the CLOSED world W2's closure",
    scene: { closeW: false, closeW2: true },
    world: W,
    locus: L,
    forge: (g, c) => {
      unpin(g, c, closureKey);
      originOf(g).setup_closure = refOfKey(c, worldSetupClosureKey(W2));
      pinOf(g, c, worldSetupClosureKey(W2));
    },
    code: "REFERENCE_INVALID",
    reason: /has no committed world_setup_closure/,
  },
  {
    name: "a ledger for the CLOSED world W2 with an explicit null",
    scene: { closeW: false, closeW2: true },
    world: W2,
    locus: W2_LOCUS,
    forge: (g, c) => {
      originOf(g).setup_closure = null;
      unpin(g, c, worldSetupClosureKey(W2));
    },
    // the false null is not pinned as absent (the closure key is not read at version 0): refused before the origin is even weighed
    code: "REFERENCE_INVALID",
    reason: /claim that the target world has none/,
  },
  {
    name: "a ledger for the CLOSED world W2 with an explicit null that DOES pin the closure as absent (read at version 0)",
    scene: { closeW: false, closeW2: true },
    world: W2,
    locus: W2_LOCUS,
    forge: (g, c) => {
      originOf(g).setup_closure = null;
      unpin(g, c, worldSetupClosureKey(W2));
      g.reads.push({ key: worldSetupClosureKey(W2), version: 0 });
    },
    // the store itself refuses a read of version 0 for a fact that exists
    code: "STALE_READ",
    reason: /./,
  },
  {
    name: "a ledger for the CLOSED world W that cites the CLOSED world W2's closure instead of W's own",
    scene: { closeW: true, closeW2: true },
    world: W,
    locus: L,
    forge: (g, c) => {
      unpin(g, c, closureKey);
      originOf(g).setup_closure = refOfKey(c, worldSetupClosureKey(W2));
      pinOf(g, c, worldSetupClosureKey(W2));
    },
    code: "REFERENCE_INVALID",
    reason: /TARGET world's closure/,
  },
  {
    name: "a target_world that is not a world profile at all (a locus)",
    scene: { closeW: false, closeW2: false },
    world: W,
    locus: L,
    forge: (g, c) => {
      unpin(g, c, worldProfileKey(W));
      originOf(g).target_world = refOfKey(c, worldLocusKey(W, L));
      pinOf(g, c, worldLocusKey(W, L));
    },
    code: "REFERENCE_INVALID",
    reason: /cites a world profile/,
  },
  {
    name: "a target_world cited under another commit identity",
    scene: { closeW: false, closeW2: false },
    world: W,
    locus: L,
    forge: (g) => {
      originOf(g).target_world.commit.group_id = "wf-group-99";
    },
    code: "REFERENCE_INVALID",
    reason: /exact committed version and commit identity/,
  },
  {
    name: "a target_world cited at a version the world never had",
    scene: { closeW: false, closeW2: false },
    world: W,
    locus: L,
    forge: (g) => {
      originOf(g).target_world.version = 9;
    },
    code: "REFERENCE_INVALID",
    reason: /exact committed version and commit identity/,
  },
  {
    name: "a target_world that the group neither read nor depended on",
    scene: { closeW: false, closeW2: false },
    world: W,
    locus: L,
    forge: (g, c) => unpin(g, c, worldProfileKey(W)),
    code: "REFERENCE_INVALID",
    reason: /target world's profile/,
  },
  {
    name: "an explicit null whose absence was never pinned (the closure key not read at version 0)",
    scene: { closeW: false, closeW2: false },
    world: W,
    locus: L,
    forge: (g) => {
      g.reads = g.reads.filter((r: any) => r.key !== closureKey);
    },
    code: "REFERENCE_INVALID",
    reason: /claim that the target world has none/,
  },
  {
    name: "an explicit null whose absence was pinned at a version no absent fact has",
    scene: { closeW: false, closeW2: false },
    world: W,
    locus: L,
    forge: (g) => {
      g.reads = g.reads.map((r: any) => (r.key === closureKey ? { ...r, version: 1 } : r));
    },
    code: "STALE_READ",
    reason: /./,
  },
  {
    name: "a closure cited for a world that has NONE (the target W, a closure key it does not own)",
    scene: { closeW: false, closeW2: false },
    world: W,
    locus: L,
    forge: (g, c) => {
      // W has no closure and neither has W2; a "closure" can only be a real committed fact, so cite the PC's own contract as one
      unpin(g, c, closureKey);
      originOf(g).setup_closure = refOfKey(c, pcExistenceContractKey(target().pc_id));
    },
    code: "REFERENCE_INVALID",
    reason: /has no committed world_setup_closure/,
  },
];

describe("H-1: the closure-or-null is tied to the SAME source-qualified target world, in every shape of forgery", () => {
  for (const f of forgeries) {
    it(`${f.name} → ${f.code}, and neither ledger fact is committed`, async () => {
      const s = await twoWorlds(f.scene);
      const g = await rawLedgerGroup(
        s.campaign,
        (x) => {
          f.forge(x, s.campaign);
          reseal(x);
        },
        { world_id: f.world, locus_id: f.locus },
      );
      const before = s.campaign.store.head();
      const refused = await s.campaign.store.commit(g);
      expect(refused.ok, JSON.stringify(refused).slice(0, 300)).toBe(false);
      expect(!refused.ok && refused.error.code).toBe(f.code);
      expect(!refused.ok && refused.error.message).toMatch(f.reason);
      committedNothing(s.campaign);
      expect(s.campaign.store.head().journal_head_sha256).toBe(before.journal_head_sha256);
      expect(s.campaign.verify()).toEqual([]);
      await s.campaign.close();
    });
  }

  it("positive matrix: the initializer's ledger names the world it was qualified against and the closure-or-null of THAT world", async () => {
    for (const [closeW, closeW2] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ] as const) {
      for (const [world, locus, closed] of [
        [W, L, closeW],
        [W2, W2_LOCUS, closeW2],
      ] as const) {
        const s = await twoWorlds({ closeW, closeW2 });
        await must(
          s.campaign.initializePcStandingInstructionLedger(
            target({ world_id: world, locus_id: locus }),
          ),
        );
        const o = s.campaign.standingInstructionLedger(target().pc_id)!.version.value.origin;
        if (o.kind !== LEDGER_ORIGIN_ENGINE_CLOSURE) throw new Error("unreachable");
        expect(o.target_world, `${world}`).toEqual(refOfKey(s.campaign, worldProfileKey(world)));
        expect(o.setup_closure, `${world} closed=${closed}`).toEqual(
          closed ? refOfKey(s.campaign, worldSetupClosureKey(world)) : null,
        );
        // and it binds only into the world it was qualified against
        const other = world === W ? [W2, W2_LOCUS] : [W, L];
        const wrong = await s.campaign.bindPlayerCharacter(
          bindInput(60, { world_id: other[0], locus_id: other[1] }),
        );
        expect(wrong.ok, `${world} must not bind into ${other[0]}`).toBe(false);
        expect(!wrong.ok && wrong.error.message).toMatch(/qualified against another world/);
        await must(
          s.campaign.bindPlayerCharacter(bindInput(61, { world_id: world, locus_id: locus })),
        );
        expect(s.campaign.verify()).toEqual([]);
        await s.campaign.close();
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Concurrency / ordering: a closure that appears BENEATH a null ledger can never be silently overtaken
// ---------------------------------------------------------------------------------------------------------------------------------

describe("H-1: a closure that lands after a null ledger was planned makes that ledger stale (the absence was pinned at version 0)", () => {
  it("the pre-planned null group is refused as a stale read once the closure commits; a re-derived ledger then cites the closure", async () => {
    const s = await r1Scene(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() }),
    );
    // planned while the world has no closure: lawful null, absence pinned at version 0
    const planned = await rawLedgerGroup(s.campaign);
    expect(originOf(planned).setup_closure).toBeNull();
    expect(planned.reads).toContainEqual({ key: closureKey, version: 0 });
    // the closure commits first (no ledger exists yet, so it is still eligible)
    await must(commitClosure(s, []));
    const stale = await s.campaign.store.commit(planned);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.error.code).toBe("STALE_READ");
    committedNothing(s.campaign);
    // a retry through the owner path re-derives against the committed closure and cites it
    await must(s.campaign.initializePcStandingInstructionLedger(target()));
    expect(
      originOf({
        writes: [
          {
            key: VERSION_KEY,
            value: s.campaign.standingInstructionLedger(target().pc_id)!.version.value,
          },
        ],
      }).setup_closure?.fact_key,
    ).toBe(closureKey);
    await must(s.campaign.bindPlayerCharacter(bindInput(41)));
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });

  it("the reverse order: once a null ledger is committed the closure is refused (setup eligibility is not widened)", async () => {
    const s = await r1Scene(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() }),
    );
    await must(s.campaign.initializePcStandingInstructionLedger(target()));
    expect(await code(commitClosure(s, []) as never)).toBe("REFERENCE_INVALID");
    expect(closureKey in snapshot(s.campaign.store)).toBe(false);
    await s.campaign.close();
  });

  it("two owner-path callers racing one request commit one ledger and the second replays it", async () => {
    const s = await r1Scene(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() }),
    );
    const [a, b] = await Promise.all([
      s.campaign.initializePcStandingInstructionLedger(target()),
      s.campaign.initializePcStandingInstructionLedger(target()),
    ]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    const replays = [a, b].map((r) => r.ok && r.value.replayed);
    expect(replays.filter(Boolean)).toHaveLength(1);
    expect(s.campaign.verify()).toEqual([]);
    await s.campaign.close();
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Historical replay and cold-open verification of a history that carries the forged null
// ---------------------------------------------------------------------------------------------------------------------------------

/** Every committed group of a campaign, in commit order, as plain copies. */
function groupsOf(campaign: CanonicalCampaign): CommitGroup[] {
  const store = campaign.store;
  const byRevision = new Map<number, CommitGroup>();
  for (const fact of store.listFacts()) {
    const receipt = store.lookupReceipt(fact.provenance.intent_id)!;
    byRevision.set(receipt.revision, store.committedGroup(fact.provenance.intent_id)!);
  }
  return [...byRevision.entries()].sort(([a], [b]) => a - b).map(([, g]) => structuredClone(g));
}

/** A store with the owner registry (and the fixture extension) but NO admission: it accepts any structurally valid group. */
async function outsideAdmission(groups: readonly CommitGroup[]) {
  const dir = tempDir();
  const store = await must(
    createFileCampaign(dir, {
      campaignId: FIXTURE_CAMPAIGN,
      owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
    }),
  );
  for (const g of groups) await must(store.commit(g));
  return { dir, store };
}

describe("H-1: historical replay and cold-open verification refuse a history that carries the forged null", () => {
  it("with a REAL setup placement and closure: integrity reports it, and a real cold open refuses the campaign at strict replay", async () => {
    const { s } = await closedWorld();
    const base = groupsOf(s.campaign);
    const forged = await forgedNull(s.campaign);
    const genuine = await rawLedgerGroup(s.campaign);
    await s.campaign.close();

    // control: the same history with the GENUINE ledger verifies clean and opens
    const lawful = await outsideAdmission([...base, structuredClone(genuine)]);
    expect(verifyCanonicalIntegrity(lawful.store)).toEqual([]);
    await lawful.store.close();
    const opened = await must(
      CanonicalCampaign.open(lawful.dir, {
        buildId: "s4-h1-lawful",
        extension: ACTOR_FIXTURE_EXTENSION,
      }),
    );
    expect(opened.verify()).toEqual([]);
    await opened.close();

    // tampered: the false null in a history admission would never have written
    const bad = await outsideAdmission([...base, structuredClone(forged)]);
    const violations = verifyCanonicalIntegrity(bad.store);
    const hit = violations.find(
      (v) => v.code === "PC_LEDGER_STATE" && /explicit null closure is false/.test(v.message),
    );
    expect(hit, JSON.stringify(violations.slice(0, 5))).toBeDefined();
    await bad.store.close();
    const refused = await CanonicalCampaign.open(bad.dir, {
      buildId: "s4-h1-tampered",
      extension: ACTOR_FIXTURE_EXTENSION,
    });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error.code).toBe("REPLAY_MISMATCH");
  });

  it("an explicit null whose version-0 absence pin was stripped from the history is reported by cold-open verification", async () => {
    const s = await r1Scene(tempDir());
    await must(
      s.campaign.releasePlayerCharacter({ ...publication(40), contract: fixtureContract() }),
    );
    const stripped = await rawLedgerGroup(s.campaign, (g) => {
      g.reads = g.reads.filter((r: any) => r.key !== closureKey);
    });
    const base = groupsOf(s.campaign);
    await s.campaign.close();
    const bad = await outsideAdmission([...base, structuredClone(stripped)]);
    const violations = verifyCanonicalIntegrity(bad.store);
    expect(
      violations.some(
        (v) => v.code === "PC_LEDGER_STATE" && /not pinned as absent/.test(v.message),
      ),
      JSON.stringify(violations.slice(0, 5)),
    ).toBe(true);
    await bad.store.close();
    const refused = await CanonicalCampaign.open(bad.dir, {
      buildId: "s4-h1-unpinned",
      extension: ACTOR_FIXTURE_EXTENSION,
    });
    expect(refused.ok).toBe(false);
  });

  it("a ledger whose target world is not the world its binding couples is reported at cold open, whatever order it was written in", async () => {
    const s = await twoWorlds({ closeW: false, closeW2: false });
    await must(s.campaign.initializePcStandingInstructionLedger(target()));
    const base = groupsOf(s.campaign);
    // a binding into W2 built mechanically (admission would refuse it), presented to a store with no admission
    const wrongBinding: any = rawBinding(s.campaign, 70, {
      edit: (v: any) => {
        v.coupling.world = wRef(W2);
        v.coupling.locus = { fact_key: worldLocusKey(W2, W2_LOCUS), entity_id: W2_LOCUS };
        v.transition.basis.pinned_versions.world = 1;
      },
    });
    await s.campaign.close();
    const bad = await outsideAdmission([...base, structuredClone(wrongBinding)]);
    const violations = verifyCanonicalIntegrity(bad.store);
    expect(
      violations.some((v) => v.code === "PC_LEDGER_STATE" && /another world/.test(v.message)),
      JSON.stringify(violations.slice(0, 6)),
    ).toBe(true);
    await bad.store.close();
  });
});
