import { legacyStateFixture } from "../support/tmp.ts";
/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// Existing-Actor Unresolved Capability → PC World-Prior Resolution — recovery, replay and load-time integrity. After any crash,
// lost reply, restart or concurrent caller the PC slot has exactly one draw (the COMMITTED seed is never replaced), one
// establishment and one close, and the campaign converges on the uninterrupted run; and a saved campaign whose world-prior
// establishment no longer tells that one story fails to load — including histories built outside admission — while every save
// written under the superseded governing-rule citation still loads unchanged.
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-04, RC-05, RC-09, RC-16; IM-02, IM-03, IM-07, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTER_BINDING_KEY,
  actorCapabilityBasisKey,
  causalDrawPrecommitKey,
  causalDrawResultKey,
  parseCapabilityCandidateId,
  pcCapabilityBasisKey,
  pcCapabilityKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CanonicalCampaign,
  PC_CAPABILITY_RULE,
  PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE,
  PcCapabilityAdapter,
  pcCapabilityDrawDigest,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  CAP_SWORDSMANSHIP,
  FIXTURE_CAMPAIGN,
  RESOLVER,
  SEED_1,
  SEED_2,
  SEED_3,
  capabilityBasis,
  dominantPrior,
  historyGroup,
  historyKey,
  seededEntropy,
} from "@immortalis/testkit";
import {
  carryForward,
  closePcCapability,
  drawPcSlot,
  establishWorldPrior,
  existingActorSummary,
  handedOverWithUnresolvedCapability,
  handoverActor,
  rawWorldPriorBasis,
  readyForCarryForward,
  reopenExistingActor,
  rogueReplay,
  seededExistingActorCampaign,
  worldPriorPublication,
  worldPriorRandomizedInput,
  type ExistingActorSeeded,
} from "../support/existing-actor.ts";
import { crashBefore, isPrecommitGroup, isResultGroup, lostReply } from "../support/causal-draw.ts";
import { must } from "../support/temporal.ts";
import { copyDir, tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const D = CAP_SWORDSMANSHIP;
const basisKey = pcCapabilityBasisKey(A, D);
const capKey = pcCapabilityKey(A, D);
const digest = pcCapabilityDrawDigest(A, D);
const prior = dominantPrior("A", ["B"]);
const request = (n = 1) => ({
  ...worldPriorPublication(n),
  capability: worldPriorRandomizedInput(A, D, { prior }),
  resolution: RESOLVER,
});
const isBasisGroup = (g: any) => g.writes.some((w: any) => w.key === basisKey);
const same = (head: ReturnType<CampaignStore["head"]>, ref: ReturnType<CampaignStore["head"]>) => {
  expect(head.state_sha256).toBe(ref.state_sha256);
  expect(head.journal_entries).toBe(ref.journal_entries);
  expect(head.journal_head_sha256).toBe(ref.journal_head_sha256);
};

/** The deterministic reference: the whole lifecycle, uninterrupted, on the seed the interrupted runs commit. */
async function referenceRun(through: "basis" | "close" = "basis") {
  const s = await seededExistingActorCampaign(tempDir(), { entropy: seededEntropy(SEED_1) });
  await handedOverWithUnresolvedCapability(s);
  await must(s.pcs.establishExistingActorRandomizedCapabilityBasis(request()));
  if (through === "close") await closePcCapability(s, 20, A, D);
  const head = s.campaign.store.head();
  const summary = existingActorSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}

/** A seeded campaign whose actor has been handed over with D unresolved (and whose entropy is the given fixture). */
async function handedOver(dir: string, entropy = seededEntropy(SEED_1)) {
  const s = await seededExistingActorCampaign(dir, { entropy });
  await handedOverWithUnresolvedCapability(s);
  return s;
}

describe("a failure at EVERY durable step of a randomized world-prior establishment converges by identity", () => {
  const steps: [string, (g: any) => boolean][] = [
    ["the Causal Draw precommit", isPrecommitGroup],
    ["the Causal Draw result", isResultGroup],
    ["the owner's establishment", isBasisGroup],
  ];

  for (const [name, pred] of steps) {
    it(`a crash before ${name}: nothing partial, and reconciling then retrying reaches the uninterrupted result`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await handedOver(dir);
      const crashing = new PcCapabilityAdapter(crashBefore(s.campaign.store, pred), {
        entropy: seededEntropy(SEED_1),
      });
      const r = await crashing.establishExistingActorRandomizedCapabilityBasis(request());
      expect(r.ok ? "" : r.error.code).toBe("UNKNOWN_OUTCOME");
      expect(s.pcs.basis(A, D)).toBeUndefined();
      await s.campaign.close();
      // a precommit that did not commit leaves no seed behind: the retry draws afresh (here, the same fixture seed)
      const fresh = pred === isPrecommitGroup;
      const entropy = seededEntropy(fresh ? SEED_1 : SEED_3);
      const r2 = await reopenExistingActor(dir, "retry", entropy);
      await must(r2.pcs.establishExistingActorRandomizedCapabilityBasis(request()));
      // …but a COMMITTED seed is never replaced
      expect(entropy.calls()).toBe(fresh ? 1 : 0);
      same(r2.campaign.store.head(), ref.head);
      expect(r2.pcs.basis(A, D)!.value.marker).toBe("A");
      expect(r2.campaign.verify()).toEqual([]);
      await r2.campaign.close();
    });

    it(`a lost reply after ${name}: re-presenting converges on the committed state without a second seed or record`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await handedOver(dir);
      const lossy = new PcCapabilityAdapter(lostReply(s.campaign.store, pred), {
        entropy: seededEntropy(SEED_1),
      });
      const r = await lossy.establishExistingActorRandomizedCapabilityBasis(request());
      expect(r.ok ? "" : r.error.code).toBe("UNKNOWN_OUTCOME");
      await s.campaign.close();
      const entropy = seededEntropy(SEED_3);
      const r2 = await reopenExistingActor(dir, "retry", entropy);
      await must(r2.pcs.establishExistingActorRandomizedCapabilityBasis(request()));
      expect(entropy.calls()).toBe(0);
      same(r2.campaign.store.head(), ref.head);
      expect(r2.campaign.verify()).toEqual([]);
      await r2.campaign.close();
    });
  }

  it("the deterministic establishment converges too: a crash writes nothing, and a lost reply is reconciled by identity", async () => {
    const dir = tempDir();
    const s = await handedOver(dir);
    const input = { ...worldPriorPublication(1), capability: { pc_id: A, capability_id: D } };
    const crashing = new PcCapabilityAdapter(crashBefore(s.campaign.store, isBasisGroup));
    const r = await crashing.establishExistingActorCapabilityBasis({
      ...input,
      capability: {
        pc_id: A,
        capability_id: D,
        causes: worldPriorRandomizedInput(A, D).causes,
        marker: "B",
      },
    });
    expect(r.ok ? "" : r.error.code).toBe("UNKNOWN_OUTCOME");
    expect(s.pcs.basis(A, D)).toBeUndefined();
    const lossy = new PcCapabilityAdapter(lostReply(s.campaign.store, isBasisGroup));
    const lost = await lossy.establishExistingActorCapabilityBasis({
      ...input,
      capability: {
        pc_id: A,
        capability_id: D,
        causes: worldPriorRandomizedInput(A, D).causes,
        marker: "B",
      },
    });
    expect(lost.ok ? "" : lost.error.code).toBe("UNKNOWN_OUTCOME");
    await s.campaign.close();
    const r2 = await reopenExistingActor(dir, "retry");
    const again = await must(establishWorldPrior(r2, 1, A, D, { marker: "B" }));
    expect(again.replayed).toBe(true);
    expect(r2.pcs.basis(A, D)!.fact.version).toBe(1);
    expect(r2.entropy.calls()).toBe(0);
    expect(r2.campaign.store.listFacts().filter((f) => f.key.startsWith("causal-draw/"))).toEqual(
      [],
    );
    expect(r2.campaign.verify()).toEqual([]);
    // a changed marker under the same slot is refused, never silently reusing the first
    const changed = await r2.pcs.establishExistingActorCapabilityBasis({
      ...worldPriorPublication(1),
      capability: {
        pc_id: A,
        capability_id: D,
        causes: worldPriorRandomizedInput(A, D).causes,
        marker: "S",
      },
    });
    expect(changed.ok).toBe(false);
    expect(r2.pcs.basis(A, D)!.value.marker).toBe("B");
    await r2.campaign.close();
  });

  it("an UNKNOWN outcome withholds all new entropy from that store until it is reopened and reconciled", async () => {
    const s = await handedOver(tempDir());
    const entropy = seededEntropy(SEED_1);
    const crashing = new PcCapabilityAdapter(crashBefore(s.campaign.store, isPrecommitGroup), {
      entropy,
    });
    const first = await crashing.establishExistingActorRandomizedCapabilityBasis(request());
    expect(first.ok ? "" : first.error.code).toBe("UNKNOWN_OUTCOME");
    expect(entropy.calls()).toBe(1);
    const again = await crashing.establishExistingActorRandomizedCapabilityBasis(request());
    expect(again.ok ? "" : again.error.code).toBe("UNKNOWN_OUTCOME");
    expect(entropy.calls()).toBe(1);
    expect(s.campaign.store.getFact(causalDrawPrecommitKey(digest))).toBeUndefined();
  });
});

describe("save → load → continue at every durable cut of a randomized world-prior establishment", () => {
  type Cut = {
    name: string;
    build: (s: ExistingActorSeeded) => Promise<void>;
    seed: string;
  };
  const cuts: Cut[] = [
    {
      name: "the precommit committed, its result not",
      build: async (s) => {
        const crashing = new PcCapabilityAdapter(crashBefore(s.campaign.store, isResultGroup), {
          entropy: seededEntropy(SEED_1),
        });
        await crashing.establishExistingActorRandomizedCapabilityBasis(request());
      },
      seed: SEED_1,
    },
    {
      name: "the draw result committed, the owner's establishment not",
      build: async (s) => {
        const crashing = new PcCapabilityAdapter(crashBefore(s.campaign.store, isBasisGroup), {
          entropy: seededEntropy(SEED_1),
        });
        await crashing.establishExistingActorRandomizedCapabilityBasis(request());
      },
      seed: SEED_1,
    },
    {
      name: "the establishment committed, no consequence yet",
      build: async (s) =>
        void (await must(s.pcs.establishExistingActorRandomizedCapabilityBasis(request()))),
      seed: SEED_1,
    },
    {
      name: "completed: the capability closed and consumed",
      build: async (s) => {
        await must(s.pcs.establishExistingActorRandomizedCapabilityBasis(request()));
        await closePcCapability(s, 20, A, D);
      },
      seed: SEED_1,
    },
  ];
  for (const cut of cuts) {
    it(`${cut.name}: reloads and verifies, and the same request converges with no new seed`, async () => {
      const dir = tempDir();
      const s = await handedOver(dir);
      await cut.build(s);
      const before = s.campaign.store.listFacts().length;
      await s.campaign.close();
      const entropy = seededEntropy(SEED_2);
      const r = await reopenExistingActor(dir, "reopen", entropy);
      expect(r.campaign.verify()).toEqual([]);
      expect(r.campaign.store.listFacts().length).toBe(before);
      await must(r.pcs.establishExistingActorRandomizedCapabilityBasis(request()));
      expect(entropy.calls()).toBe(0);
      const seed = (r.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any)
        .entropy_hex;
      expect(seed).toBe(cut.seed);
      expect(r.pcs.basis(A, D)!.value.marker).toBe("A");
      // the continuation closes exactly what the draw established
      if (!r.pcs.capability(A, D)) await closePcCapability(r, 20, A, D);
      expect(r.pcs.capability(A, D)!.value.marker).toBe("A");
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the full lifecycle after a reload equals the uninterrupted run: nothing is re-drawn, re-established or re-closed", async () => {
    const ref = await referenceRun("close");
    const dir = tempDir();
    const s = await handedOver(dir);
    const crashing = new PcCapabilityAdapter(crashBefore(s.campaign.store, isBasisGroup), {
      entropy: seededEntropy(SEED_1),
    });
    await crashing.establishExistingActorRandomizedCapabilityBasis(request());
    await s.campaign.close();
    const r = await reopenExistingActor(dir, "reopen", seededEntropy(SEED_3));
    await must(r.pcs.establishExistingActorRandomizedCapabilityBasis(request()));
    await closePcCapability(r, 20, A, D);
    same(r.campaign.store.head(), ref.head);
    expect(existingActorSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
    await r.campaign.close();
  });

  it("the deterministic lifecycle survives a reload at the same cuts: establishment, then close, nothing re-written", async () => {
    const dir = tempDir();
    const s = await handedOver(dir);
    await must(establishWorldPrior(s, 1, A, D, { marker: "A" }));
    await s.campaign.close();
    const r = await reopenExistingActor(dir, "reopen");
    expect(r.campaign.verify()).toEqual([]);
    expect((await must(establishWorldPrior(r, 1, A, D, { marker: "A" }))).replayed).toBe(true);
    await closePcCapability(r, 20, A, D);
    expect(r.pcs.capability(A, D)!.value.marker).toBe("A");
    await r.campaign.close();
    const again = await reopenExistingActor(dir, "reopen-2");
    expect(again.campaign.verify()).toEqual([]);
    expect(again.entropy.calls()).toBe(0);
    await again.campaign.close();
  });
});

describe("concurrent callers cannot create two draws or two establishments", () => {
  it("two callers racing one request commit one seed, one result and one basis, and agree on the marker", async () => {
    const s = await handedOver(tempDir());
    const e1 = seededEntropy(SEED_1);
    const e2 = seededEntropy(SEED_3);
    const a1 = new PcCapabilityAdapter(s.campaign.store, { entropy: e1 });
    const a2 = new PcCapabilityAdapter(s.campaign.store, { entropy: e2 });
    const [r1, r2] = await Promise.all([
      a1.establishExistingActorRandomizedCapabilityBasis(request()),
      a2.establishExistingActorRandomizedCapabilityBasis(request()),
    ]);
    expect(r1.ok || r2.ok).toBe(true);
    const draws = s.campaign.store.listFacts().filter((f) => f.key.startsWith("causal-draw/"));
    expect(draws).toHaveLength(2);
    const committedSeed = (s.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any)
      .entropy_hex;
    expect([SEED_1, SEED_3]).toContain(committedSeed);
    expect(s.pcs.basis(A, D)!.fact.version).toBe(1);
    const result = s.campaign.store.getFact(causalDrawResultKey(digest))!;
    const selected = parseCapabilityCandidateId((result.value as any).selected_candidate_id)!;
    expect(s.pcs.basis(A, D)!.value.marker).toEqual(selected.marker);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a cause that moves on between the committed draw and the establishment (a recorded gap, not a guess)", () => {
  it("fails closed: the establishment is refused as stale, the draw cannot be redrawn or its prior changed, and nothing is invented", async () => {
    const s = await handedOver(tempDir());
    const crashing = new PcCapabilityAdapter(crashBefore(s.campaign.store, isBasisGroup), {
      entropy: seededEntropy(SEED_1),
    });
    await crashing.establishExistingActorRandomizedCapabilityBasis(request());
    expect(s.campaign.store.getFact(causalDrawResultKey(digest))).toBeDefined();
    // the world/actor history advances before the establishment lands
    await must(
      s.campaign.store.commit(
        historyGroup(FIXTURE_CAMPAIGN, 90, `${A}-biography`, "SYNTHETIC FIXTURE: moved on", 1),
      ),
    );
    const mark = s.campaign.store.head();
    // the same prior pinned at the old version is stale at the establishment…
    const stale = await s.pcs.establishExistingActorRandomizedCapabilityBasis(request());
    expect(stale.ok).toBe(false);
    // …and a prior over the new version is a different prior for the same draw identity
    const moved = worldPriorRandomizedInput(A, D, { prior });
    const fresh = await s.pcs.establishExistingActorRandomizedCapabilityBasis({
      ...request(),
      capability: {
        ...moved,
        causes: moved.causes.map((c) =>
          c.fact_key === historyKey(`${A}-biography`) ? { ...c, version: 2 } : c,
        ),
      },
    });
    expect(fresh.ok ? "" : fresh.error.code).toBe("DRAW_IDENTITY_CONFLICT");
    expect(s.campaign.store.head()).toEqual(mark);
    expect(s.pcs.basis(A, D)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("load fails closed on a world-prior establishment that no longer tells one story", () => {
  async function saved(randomized = true): Promise<string> {
    const dir = tempDir();
    const s = await handedOver(dir);
    if (randomized) await must(s.pcs.establishExistingActorRandomizedCapabilityBasis(request()));
    else await must(establishWorldPrior(s, 1, A, D, { marker: "B" }));
    await closePcCapability(s, 20, A, D);
    await s.campaign.close();
    return dir;
  }
  const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
  const openOutcome = async (dir: string, withMessages = false) => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return "OK";
    }
    const violations = (r.error.details?.["violations"] ?? []) as {
      code: string;
      message: string;
    }[];
    return r.error.code === "CANON_INTEGRITY"
      ? violations.map((v) => (withMessages ? `${v.code}: ${v.message}` : v.code)).join("\n")
      : r.error.code;
  };
  const fact = (j: any, key: string) => j.facts.find((x: any) => x.key === key);

  it("a valid saved campaign opens, on either branch", async () => {
    expect(await openOutcome(await saved(true))).toBe("OK");
    expect(await openOutcome(await saved(false))).toBe("OK");
  });

  it("an edit of the saved randomized establishment, its draw pointer, the draw evidence or the close is not silently normalized", async () => {
    const edits: Record<string, (j: any) => void> = {
      "marker upgraded": (j) => (fact(j, basisKey).value.marker = "S"),
      "marker made ungraded": (j) => (fact(j, basisKey).value.marker = null),
      "draw pointer version": (j) =>
        (fact(j, basisKey).value.establishment.draw.result.version = 2),
      "draw pointer id": (j) =>
        (fact(j, basisKey).value.establishment.draw.draw_id = `cdraw:v1:${"0".repeat(64)}`),
      "method flipped to deterministic": (j) => {
        const e = fact(j, basisKey).value.establishment;
        e.method = "EXISTING_ACTOR_CAUSALLY_DETERMINED";
        delete e.draw;
      },
      "method flipped to a carry": (j) => {
        const e = fact(j, basisKey).value.establishment;
        e.method = "EXISTING_ACTOR_CARRY_FORWARD";
      },
      "draw pointer removed": (j) => delete fact(j, basisKey).value.establishment.draw,
      "handover pointer moved": (j) => (fact(j, basisKey).value.establishment.handover.version = 2),
      "a cause dropped": (j) => fact(j, basisKey).value.establishment.causes.pop(),
      "selected candidate rewritten": (j) =>
        (fact(j, causalDrawResultKey(digest)).value.selected_candidate_id =
          "capability-candidate:v1:IlMi"),
      "precommit prior rewritten": (j) =>
        (fact(j, causalDrawPrecommitKey(digest)).value.normalized_spec.candidates[0].weight = "7"),
      "precommit seed rewritten": (j) =>
        (fact(j, causalDrawPrecommitKey(digest)).value.entropy_hex = "00".repeat(32)),
      "result group rewritten": (j) =>
        (fact(j, causalDrawResultKey(digest)).provenance.group_id = "raw-group"),
      "close marker regraded": (j) => (fact(j, capKey).value.marker = "S"),
      "basis rule swapped for the superseded citation": (j) =>
        (fact(j, basisKey).provenance.rule = PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE),
      "close rule swapped for the superseded citation": (j) =>
        (fact(j, capKey).provenance.rule = PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE),
    };
    // Build and verify one durable control; isolate every edit in its own copied package.
    // Rebuilding the identical multi-commit fixture for all 16 edits exhausts the test budget.
    const control = await saved();
    expect(await openOutcome(control)).toBe("OK");
    for (const [name, edit] of Object.entries(edits)) {
      const dir = copyDir(control);
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j);
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("an edit of what a world-prior establishment cites — the binding, the contract, a cause — is not accepted", async () => {
    const edits: Record<string, (j: any) => void> = {
      "binding downgraded to a first ACTIVATION": (j) => {
        const b = fact(j, PLAYER_CHARACTER_BINDING_KEY);
        b.value.transition = { type: "ACTIVATION", basis: {} };
        b.value.intrinsic_authority_migration = [];
      },
      "binding removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== PLAYER_CHARACTER_BINDING_KEY)),
      "contract classification removed": (j) =>
        delete fact(j, "pc/actor-smith/existence-contract").value.existing_actor_compilation,
      "a cause removed": (j) =>
        (j.facts = j.facts.filter((f: any) => f.key !== historyKey(`${A}-biography`))),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = legacyStateFixture(p);
      edit(j);
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("removing the saved basis while keeping the published capability fails: a capability never exists without its basis", async () => {
    const dir = await saved(false);
    const p = join(dir, stateFile(dir));
    const j = legacyStateFixture(p);
    j.facts = j.facts.filter((f: any) => f.key !== basisKey);
    writeFileSync(p, JSON.stringify(j));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  it("a journal edit of the establishment's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED");
    writeFileSync(
      journal,
      text.replace("EXISTING_ACTOR_BOUNDED_PRIOR_RANDOMIZED", "EXISTING_ACTOR_CAUSALLY_DETERMINED"),
    );
    expect(await openOutcome(dir)).not.toBe("OK");
  });
});

describe("load verification proves the establishment from committed history alone, including histories built outside admission", () => {
  const violationsOf = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return [] as { code: string; message: string }[];
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string; message: string }[])
      : [{ code: r.error.code, message: r.error.message }];
  };
  const via = (store: CampaignStore) =>
    ({ campaign: { store } }) as unknown as Pick<ExistingActorSeeded, "campaign">;

  /** A lawful package up to the handover (D unresolved), replayed into a store with NO admission with `append` added. */
  async function rogue(
    append: (store: CampaignStore) => Promise<void>,
    prepare: (s: ExistingActorSeeded) => Promise<void> = async () => undefined,
  ) {
    const src = tempDir();
    const s = await handedOver(src);
    await prepare(s);
    await s.campaign.close();
    return violationsOf(await rogueReplay(src, undefined, append));
  }

  it("control: the lawful deterministic and randomized establishments appended the same way load (so the refusals below are the rules, not the harness)", async () => {
    expect(
      (
        await rogue(
          async (store) =>
            void (await must(store.commit(rawWorldPriorBasis(via(store), 900, A, D)))),
        )
      ).filter((v) => v.code === "PC_CAPABILITY_STATE"),
    ).toEqual([]);
    expect(
      (
        await rogue(async (store) => {
          await must(drawPcSlot(store, seededEntropy(SEED_1), A, D));
          await must(store.commit(rawWorldPriorBasis(via(store), 900, A, D, { randomized: true })));
        })
      ).filter((v) => v.code === "PC_CAPABILITY_STATE" || v.code === "CAUSAL_DRAW_STATE"),
    ).toEqual([]);
  });

  it("a deterministic basis committed over an existing Causal Draw for its slot fails the open", async () => {
    const violations = await rogue(async (store) => {
      await must(drawPcSlot(store, seededEntropy(SEED_1), A, D));
      await must(store.commit(rawWorldPriorBasis(via(store), 900, A, D)));
    });
    expect(
      violations.some(
        (v) => v.code === "PC_CAPABILITY_STATE" && /over an existing Causal Draw/.test(v.message),
      ),
    ).toBe(true);
  });

  it("a randomized basis whose marker is not the selected candidate's, that did not read the result, or whose prior is foreign fails the open", async () => {
    const selected = async (store: CampaignStore) =>
      parseCapabilityCandidateId(
        (store.getFact(causalDrawResultKey(digest))!.value as any).selected_candidate_id,
      )!.marker;
    const marker = await rogue(async (store) => {
      await must(drawPcSlot(store, seededEntropy(SEED_1), A, D));
      const m = await selected(store);
      await must(
        store.commit(
          rawWorldPriorBasis(via(store), 900, A, D, {
            randomized: true,
            edit: (v) => (v.marker = m === "S" ? "A" : "S"),
          }),
        ),
      );
    });
    expect(
      marker.some(
        (v) =>
          v.code === "PC_CAPABILITY_STATE" && /owner's reading of the candidate/.test(v.message),
      ),
    ).toBe(true);
    const unread = await rogue(async (store) => {
      await must(drawPcSlot(store, seededEntropy(SEED_1), A, D));
      const g = rawWorldPriorBasis(via(store), 900, A, D, { randomized: true });
      g.reads = g.reads.filter((r) => r.key !== causalDrawResultKey(digest));
      await must(store.commit(g));
    });
    expect(
      unread.some(
        (v) => v.code === "PC_CAPABILITY_STATE" && /read the exact fact it cites/.test(v.message),
      ),
    ).toBe(true);
    const foreign = await rogue(async (store) => {
      const { pcCapabilityDrawSpecification, CausalDrawAdapter, pcSlotInspector } =
        await import("@immortalis/engine");
      const refs = worldPriorRandomizedInput(A, D).causes.map((c) => ({
        owner: c.owner,
        fact_key: c.fact_key,
        version: c.version,
        committed_by: store.getFact(c.fact_key)!.provenance.group_id,
      }));
      const spec: any = pcCapabilityDrawSpecification(worldPriorRandomizedInput(A, D), refs);
      spec.candidates = [
        { candidate_id: "stray-1", weight: "1" },
        { candidate_id: "stray-2", weight: "1" },
      ];
      const draw = new CausalDrawAdapter(store, {
        slotInspectors: new Map([["pc_existence", pcSlotInspector(store)]]),
        ruleAuthority: { isEffectiveForPriorCreation: () => true },
        entropy: seededEntropy(SEED_1),
      });
      await must(draw.draw({ specification: spec, resolution: RESOLVER }));
      await must(store.commit(rawWorldPriorBasis(via(store), 900, A, D, { randomized: true })));
    });
    expect(foreign.some((v) => v.code === "PC_CAPABILITY_STATE")).toBe(true);
  });

  it("an establishment that did not read and depend on what it cites, or cites a missing or stale handover, fails the open", async () => {
    const variants: Record<string, [(v: any) => void, Partial<CommitGroup>]> = {
      "no reads": [() => undefined, { reads: [], depends_on: [] }],
      "stale handover": [(v) => (v.establishment.handover.version = 2), {}],
      "a cause that is not read": [() => undefined, { reads: [] }],
    };
    for (const [name, [edit, groupOver]] of Object.entries(variants)) {
      const violations = await rogue(async (store) => {
        await must(store.commit(rawWorldPriorBasis(via(store), 900, A, D, { edit, groupOver })));
      });
      expect(
        violations.some((v) => v.code === "PC_CAPABILITY_STATE"),
        name,
      ).toBe(true);
    }
  });

  it("a Named-Actor basis that stood when the world-prior basis was committed fails the open: no second owner, no re-resolution", async () => {
    // the actor owner can no longer write after the cutover, so only a history built outside admission can contain one
    const violations = await rogue(async (store) => {
      const { NAMED_ACTOR_RULE } = await import("@immortalis/engine");
      const { group, write } = await import("@immortalis/testkit");
      const causes = worldPriorRandomizedInput(A, D).causes;
      await must(
        store.commit(
          group(
            FIXTURE_CAMPAIGN,
            901,
            [
              write(actorCapabilityBasisKey(A, D), capabilityBasis(A, D) as never, {
                owner: "named_actor",
                facet: "actor_profile",
              }),
            ],
            {
              owner: "named_actor",
              facet: "actor_profile",
              rule: NAMED_ACTOR_RULE,
              reads: causes.map((c) => ({ key: c.fact_key, version: c.version })),
              depends_on: causes.map((c) => store.getFact(c.fact_key)!.provenance.group_id),
            },
          ),
        ),
      );
      await must(store.commit(rawWorldPriorBasis(via(store), 902, A, D)));
    });
    expect(
      violations.some(
        (v) =>
          v.code === "PC_CAPABILITY_STATE" &&
          /already held by the Named-Actor owner/.test(v.message),
      ),
    ).toBe(true);
  });

  it("a basis of a world-prior establishment stamped with the superseded citation is RULE_DRIFT: the superseded citation never covers it", async () => {
    const violations = await rogue(async (store) => {
      await must(
        store.commit(
          rawWorldPriorBasis(via(store), 900, A, D, {
            groupOver: { rule: PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE },
          }),
        ),
      );
    });
    expect(violations.some((v) => v.code === "RULE_DRIFT")).toBe(true);
  });
});

describe("every save written under the superseded governing-rule citation still loads unchanged", () => {
  const violationsOf = async (dir: string) => {
    const r = await CanonicalCampaign.open(dir, { extension: ACTOR_FIXTURE_EXTENSION });
    if (r.ok) {
      await r.value.close();
      return [] as { code: string; message: string }[];
    }
    return r.error.code === "CANON_INTEGRITY"
      ? (r.error.details?.["violations"] as { code: string; message: string }[])
      : [{ code: r.error.code, message: r.error.message }];
  };
  /** Rewrites the citation of the groups that wrote PC capability facts to the superseded one, as an older save had them. */
  const asOlderSave = (g: CommitGroup): CommitGroup =>
    g.owner === "pc_existence" && g.facet === "pc_capability_profile"
      ? { ...g, rule: PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE }
      : g;

  it("a carried-forward capability, basis and close, committed under the superseded citation, loads with no violation", async () => {
    const src = tempDir();
    const s = await seededExistingActorCampaign(src);
    await readyForCarryForward(s);
    await must(handoverActor(s, 1));
    await must(carryForward(s, 1));
    await closePcCapability(s, 20);
    await s.campaign.close();
    const dir = await rogueReplay(src, (g) => asOlderSave(g));
    expect(await violationsOf(dir)).toEqual([]);
    // the same history under the CURRENT citation is the one new writes carry
    expect(
      (await violationsOf(await rogueReplay(src))).filter((v) => v.code === "RULE_DRIFT"),
    ).toEqual([]);
  });

  it("a freshly generated PC's capability, basis and close, committed under the superseded citation, loads with no violation", async () => {
    const { seededPcCapabilityCampaign, receiveBasis, registerPcConsumer } =
      await import("../support/pc-capability.ts");
    const { consumerAdvanceRequest } = await import("@immortalis/testkit");
    const src = tempDir();
    const s = await seededPcCapabilityCampaign(src);
    const basis = await receiveBasis(s, 1);
    await registerPcConsumer(s, "c1", basis, 2);
    await must(s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1")));
    await s.campaign.close();
    const dir = await rogueReplay(src, (g) => asOlderSave(g));
    expect(await violationsOf(dir)).toEqual([]);
  });

  it("the close of a WORLD-PRIOR basis under the superseded citation fails: it is true provenance only for a historical basis", async () => {
    const src = tempDir();
    const s = await handedOver(src);
    await must(establishWorldPrior(s, 1, A, D, { marker: "B" }));
    await closePcCapability(s, 20, A, D);
    await s.campaign.close();
    const dir = await rogueReplay(src, (g) =>
      g.writes.some((w) => w.key === capKey)
        ? { ...g, rule: PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE }
        : g,
    );
    const violations = await violationsOf(dir);
    expect(
      violations.some(
        (v) => v.code === "PC_CAPABILITY_STATE" && /never the superseded one/.test(v.message),
      ),
    ).toBe(true);
    // and the faithful replay, under the current citation, is clean
    expect(await violationsOf(await rogueReplay(src))).toEqual([]);
    expect(PC_CAPABILITY_RULE.clause).not.toBe(PC_CAPABILITY_RULE_THIRTY_SECOND_SLICE.clause);
  });
});
