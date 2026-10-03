/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary fact and package values */
// WS-016 Named-Actor "BOUNDED_PRIOR_RANDOMIZED" — recovery, replay and load-time integrity. After any crash, lost reply,
// restart or concurrent caller the slot has exactly one draw (the COMMITTED seed is never replaced), one establishment and
// one close, and the campaign converges on the uninterrupted run; and a saved campaign whose randomized establishment no
// longer tells that one story fails to load.
// Register lineage: IA-06, IA-22 (partial), IA-30 (partial); RC-04, RC-05, RC-09, RC-16; IM-02, IM-03, IM-07, IM-12, IM-17.
// Local success is NOT provider/recovery acceptance (IA-07 BLOCKED).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  actorCapabilityBasisKey,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultKey,
  parseCapabilityCandidateId,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CanonicalCampaign,
  CausalDrawAdapter,
  NAMED_ACTOR_RULE,
  NamedActorAdapter,
  capabilityDrawDigest,
  capabilityDrawSpecification,
  createFileCampaign,
  namedActorRuleAuthority,
  namedActorSlotInspector,
  type CampaignStore,
} from "@immortalis/engine";
import {
  ACTOR_FIXTURE_EXTENSION,
  ACTOR_SMITH,
  CAP_METALWORKING,
  FIXTURE_CAMPAIGN,
  RESOLVER,
  SEED_1,
  SEED_2,
  SEED_3,
  actorPublication,
  capabilityBasis,
  consumerAdvanceRequest,
  dominantPrior,
  group,
  historyGroup,
  historyKey,
  randomizedEstablishment,
  seededEntropy,
  write,
} from "@immortalis/testkit";
import {
  actorSummary,
  establishRandomized,
  registerConsumer,
  reopenActor,
  seededActorCampaign,
  type ActorSeeded,
} from "../support/actor.ts";
import { crashBefore, isPrecommitGroup, isResultGroup, lostReply } from "../support/causal-draw.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const A = ACTOR_SMITH;
const C = CAP_METALWORKING;
const basisKey = actorCapabilityBasisKey(A, C);
const digest = capabilityDrawDigest(A, C);
const prior = dominantPrior("A", ["B"]);
const request = (n = 1) => ({
  ...actorPublication(n),
  capability: randomizedEstablishment(A, C, { prior }),
  resolution: RESOLVER,
});
const isBasisGroup = (g: any) => g.writes.some((w: any) => w.key === basisKey);
const advance = (s: Pick<ActorSeeded, "coordinator">) =>
  s.coordinator.advance(consumerAdvanceRequest("tx-1", "c1"));
const same = (head: ReturnType<CampaignStore["head"]>, ref: ReturnType<CampaignStore["head"]>) => {
  expect(head.state_sha256).toBe(ref.state_sha256);
  expect(head.journal_entries).toBe(ref.journal_entries);
  expect(head.journal_head_sha256).toBe(ref.journal_head_sha256);
};

/** The deterministic reference: the whole randomized lifecycle, uninterrupted, on the seed the interrupted runs commit. */
async function referenceRun(through: "basis" | "close" = "basis") {
  const s = await seededActorCampaign(tempDir(), { entropy: seededEntropy(SEED_1) });
  const basis = await establishRandomized(s, 1, { prior });
  if (through === "close") {
    await registerConsumer(s, "c1", basis, 2);
    await must(advance(s));
  }
  const head = s.campaign.store.head();
  const summary = actorSummary(s.campaign, s.coordinator);
  await s.campaign.close();
  return { head, summary };
}

describe("a failure at EVERY durable step of a randomized establishment converges by identity", () => {
  const steps: [string, (g: any) => boolean][] = [
    ["the Causal Draw precommit", isPrecommitGroup],
    ["the Causal Draw result", isResultGroup],
    ["the owner's establishment", isBasisGroup],
  ];

  for (const [name, pred] of steps) {
    it(`a crash before ${name}: nothing partial, and reconciling then retrying reaches the uninterrupted result`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededActorCampaign(dir);
      const crashing = new NamedActorAdapter(crashBefore(s.campaign.store, pred), {
        entropy: seededEntropy(SEED_1),
      });
      const r = await crashing.establishRandomizedCapabilityBasis(request());
      expect(r.ok ? "" : r.error.code).toBe("UNKNOWN_OUTCOME");
      expect(s.actors.basis(A, C)).toBeUndefined();
      await s.campaign.close();
      // a precommit that did not commit leaves no seed behind: the retry draws afresh (here, the same fixture seed)
      const fresh = pred === isPrecommitGroup;
      const entropy = seededEntropy(fresh ? SEED_1 : SEED_3);
      const r2 = await reopenActor(dir, "retry", entropy);
      await must(r2.actors.establishRandomizedCapabilityBasis(request()));
      // …but a COMMITTED seed is never replaced
      expect(entropy.calls()).toBe(fresh ? 1 : 0);
      same(r2.campaign.store.head(), ref.head);
      expect(r2.actors.basis(A, C)!.value.marker).toBe("A");
      expect(r2.campaign.verify()).toEqual([]);
      await r2.campaign.close();
    });

    it(`a lost reply after ${name}: re-presenting converges on the committed state without a second seed or record`, async () => {
      const ref = await referenceRun();
      const dir = tempDir();
      const s = await seededActorCampaign(dir);
      const lossy = new NamedActorAdapter(lostReply(s.campaign.store, pred), {
        entropy: seededEntropy(SEED_1),
      });
      const r = await lossy.establishRandomizedCapabilityBasis(request());
      expect(r.ok ? "" : r.error.code).toBe("UNKNOWN_OUTCOME");
      await s.campaign.close();
      const entropy = seededEntropy(SEED_3);
      const r2 = await reopenActor(dir, "retry", entropy);
      await must(r2.actors.establishRandomizedCapabilityBasis(request()));
      expect(entropy.calls()).toBe(0);
      same(r2.campaign.store.head(), ref.head);
      expect(r2.campaign.verify()).toEqual([]);
      await r2.campaign.close();
    });
  }

  it("an UNKNOWN outcome withholds all new entropy from that store until it is reopened and reconciled", async () => {
    const s = await seededActorCampaign(tempDir());
    const entropy = seededEntropy(SEED_1);
    const crashing = new NamedActorAdapter(crashBefore(s.campaign.store, isPrecommitGroup), {
      entropy,
    });
    // the guard belongs to the store the draw published through: every adapter on that store shares it
    const first = await crashing.establishRandomizedCapabilityBasis(request());
    expect(first.ok ? "" : first.error.code).toBe("UNKNOWN_OUTCOME");
    expect(entropy.calls()).toBe(1);
    const again = await crashing.establishRandomizedCapabilityBasis(request());
    expect(again.ok ? "" : again.error.code).toBe("UNKNOWN_OUTCOME");
    expect(entropy.calls()).toBe(1);
    expect(s.campaign.store.getFact(causalDrawPrecommitKey(digest))).toBeUndefined();
  });
});

describe("save → load → continue at every durable cut of a randomized establishment", () => {
  type Cut = {
    name: string;
    build: (s: ActorSeeded, dir: string) => Promise<void>;
    seed: string | null;
  };
  const cuts: Cut[] = [
    {
      name: "the precommit committed, its result not",
      build: async (s) => {
        const crashing = new NamedActorAdapter(crashBefore(s.campaign.store, isResultGroup), {
          entropy: seededEntropy(SEED_1),
        });
        await crashing.establishRandomizedCapabilityBasis(request());
      },
      seed: SEED_1,
    },
    {
      name: "the draw result committed, the owner's establishment not",
      build: async (s) => {
        const crashing = new NamedActorAdapter(crashBefore(s.campaign.store, isBasisGroup), {
          entropy: seededEntropy(SEED_1),
        });
        await crashing.establishRandomizedCapabilityBasis(request());
      },
      seed: SEED_1,
    },
    {
      name: "the establishment committed, no consequence yet",
      build: async (s) => void (await establishRandomized(s, 1, { prior })),
      seed: SEED_1,
    },
    {
      name: "completed: the capability closed and consumed",
      build: async (s) =>
        registerConsumer(s, "c1", await establishRandomized(s, 1, { prior }), 2).then(async () => {
          await must(advance(s));
        }),
      seed: SEED_1,
    },
  ];
  for (const cut of cuts) {
    it(`${cut.name}: reloads and verifies, and the same request converges with no new seed`, async () => {
      const dir = tempDir();
      const s = await seededActorCampaign(dir, { entropy: seededEntropy(SEED_1) });
      await cut.build(s, dir);
      const before = s.campaign.store.listFacts().length;
      await s.campaign.close();
      const entropy = seededEntropy(SEED_2);
      const r = await reopenActor(dir, "reopen", entropy);
      expect(r.campaign.verify()).toEqual([]);
      expect(r.campaign.store.listFacts().length).toBe(before);
      await must(r.actors.establishRandomizedCapabilityBasis(request()));
      expect(entropy.calls()).toBe(0);
      const seed = (r.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any)
        .entropy_hex;
      expect(seed).toBe(cut.seed);
      expect(r.actors.basis(A, C)!.value.marker).toBe("A");
      // the continuation closes exactly what the draw established
      if (!r.actors.capability(A, C)) {
        await registerConsumer(r, "c1", r.actors.basis(A, C)!.value, 2);
        await must(advance(r));
      }
      expect(r.actors.capability(A, C)!.value.marker).toBe("A");
      expect(r.campaign.verify()).toEqual([]);
      await r.campaign.close();
    });
  }

  it("the full lifecycle after a reload equals the uninterrupted run: nothing is re-drawn, re-established or re-closed", async () => {
    const ref = await referenceRun("close");
    const dir = tempDir();
    const s = await seededActorCampaign(dir, { entropy: seededEntropy(SEED_1) });
    const crashing = new NamedActorAdapter(crashBefore(s.campaign.store, isBasisGroup), {
      entropy: seededEntropy(SEED_1),
    });
    await crashing.establishRandomizedCapabilityBasis(request());
    await s.campaign.close();
    const r = await reopenActor(dir, "reopen", seededEntropy(SEED_3));
    await must(r.actors.establishRandomizedCapabilityBasis(request()));
    await registerConsumer(r, "c1", r.actors.basis(A, C)!.value, 2);
    await must(advance(r));
    same(r.campaign.store.head(), ref.head);
    expect(actorSummary(r.campaign, r.coordinator)).toEqual(ref.summary);
    await r.campaign.close();
  });
});

describe("concurrent callers cannot create two draws or two establishments", () => {
  it("two callers racing one request commit one seed, one result and one basis, and agree on the marker", async () => {
    const s = await seededActorCampaign(tempDir());
    const e1 = seededEntropy(SEED_1);
    const e2 = seededEntropy(SEED_3);
    const a1 = new NamedActorAdapter(s.campaign.store, { entropy: e1 });
    const a2 = new NamedActorAdapter(s.campaign.store, { entropy: e2 });
    const [r1, r2] = await Promise.all([
      a1.establishRandomizedCapabilityBasis(request()),
      a2.establishRandomizedCapabilityBasis(request()),
    ]);
    expect(r1.ok || r2.ok).toBe(true);
    const draws = s.campaign.store.listFacts().filter((f) => f.key.startsWith("causal-draw/"));
    expect(draws).toHaveLength(2);
    const committedSeed = (s.campaign.store.getFact(causalDrawPrecommitKey(digest))!.value as any)
      .entropy_hex;
    expect([SEED_1, SEED_3]).toContain(committedSeed);
    expect(s.actors.basis(A, C)!.fact.version).toBe(1);
    const result = s.campaign.store.getFact(causalDrawResultKey(digest))!;
    const selected = parseCapabilityCandidateId((result.value as any).selected_candidate_id)!;
    expect(s.actors.basis(A, C)!.value.marker).toEqual(selected.marker);
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("a cause that moves on between the committed draw and the establishment (a recorded gap, not a guess)", () => {
  it("fails closed: the establishment is refused as stale, the draw cannot be redrawn or its prior changed, and nothing is invented", async () => {
    const s = await seededActorCampaign(tempDir());
    const crashing = new NamedActorAdapter(crashBefore(s.campaign.store, isBasisGroup), {
      entropy: seededEntropy(SEED_1),
    });
    await crashing.establishRandomizedCapabilityBasis(request());
    expect(s.campaign.store.getFact(causalDrawResultKey(digest))).toBeDefined();
    // the owner's history advances before the establishment lands
    await must(
      s.campaign.store.commit(
        historyGroup(FIXTURE_CAMPAIGN, 90, `${A}-biography`, "SYNTHETIC FIXTURE: moved on", 1),
      ),
    );
    const mark = s.campaign.store.head();
    // the same prior pinned at the old version is stale at the establishment…
    const stale = await s.actors.establishRandomizedCapabilityBasis(request());
    expect(stale.ok).toBe(false);
    // …and a prior over the new version is a different prior for the same draw identity
    const fresh = await s.actors.establishRandomizedCapabilityBasis({
      ...request(),
      capability: {
        ...randomizedEstablishment(A, C, { prior }),
        causes: randomizedEstablishment(A, C, { prior }).causes.map((c) =>
          c.fact_key === historyKey(`${A}-biography`) ? { ...c, version: 2 } : c,
        ),
      },
    });
    expect(fresh.ok ? "" : fresh.error.code).toBe("DRAW_IDENTITY_CONFLICT");
    expect(s.campaign.store.head()).toEqual(mark);
    expect(s.actors.basis(A, C)).toBeUndefined();
    expect(s.campaign.verify()).toEqual([]);
  });
});

describe("load fails closed on a randomized establishment that no longer tells one story", () => {
  async function saved(): Promise<string> {
    const dir = tempDir();
    const s = await seededActorCampaign(dir, { entropy: seededEntropy(SEED_1) });
    await registerConsumer(s, "c1", await establishRandomized(s, 1, { prior }), 2);
    await must(advance(s));
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

  it("a valid saved campaign opens", async () => {
    expect(await openOutcome(await saved())).toBe("OK");
  });

  it("an edit of the saved establishment, its draw pointer or the draw evidence is not silently normalized", async () => {
    const edits: Record<string, (facts: any[]) => void> = {
      "marker upgraded": (f) => (f.find((x) => x.key === basisKey).value.marker = "S"),
      "marker made ungraded": (f) => (f.find((x) => x.key === basisKey).value.marker = null),
      "draw pointer version": (f) =>
        (f.find((x) => x.key === basisKey).value.establishment.draw.result.version = 2),
      "draw pointer id": (f) =>
        (f.find((x) => x.key === basisKey).value.establishment.draw.draw_id =
          `cdraw:v1:${"0".repeat(64)}`),
      "method flipped to deterministic": (f) => {
        const e = f.find((x) => x.key === basisKey).value.establishment;
        e.method = "CAUSALLY_DETERMINED";
        delete e.draw;
      },
      "draw pointer removed": (f) =>
        delete f.find((x) => x.key === basisKey).value.establishment.draw,
      "selected candidate rewritten": (f) =>
        (f.find((x) => x.key === causalDrawResultKey(digest)).value.selected_candidate_id =
          "capability-candidate:v1:IlMi"),
      "precommit prior rewritten": (f) =>
        (f.find(
          (x) => x.key === causalDrawPrecommitKey(digest),
        ).value.normalized_spec.candidates[0].weight = "7"),
      "precommit seed rewritten": (f) =>
        (f.find((x) => x.key === causalDrawPrecommitKey(digest)).value.entropy_hex = "00".repeat(
          32,
        )),
      "result group rewritten": (f) =>
        (f.find((x) => x.key === causalDrawResultKey(digest)).provenance.group_id = "raw-group"),
    };
    for (const [name, edit] of Object.entries(edits)) {
      const dir = await saved();
      const p = join(dir, stateFile(dir));
      const j = JSON.parse(readFileSync(p, "utf8"));
      edit(j.facts);
      writeFileSync(p, JSON.stringify(j));
      expect(await openOutcome(dir), name).not.toBe("OK");
    }
  });

  it("a journal edit of the establishment's committed group fails replay", async () => {
    const dir = await saved();
    const journal = join(dir, "journal.jsonl");
    const text = readFileSync(journal, "utf8");
    expect(text).toContain("BOUNDED_PRIOR_RANDOMIZED");
    writeFileSync(journal, text.replace("BOUNDED_PRIOR_RANDOMIZED", "CAUSALLY_DETERMINED"));
    expect(await openOutcome(dir)).not.toBe("OK");
  });

  /** A package built by a store with NO admission: a consistent, replayable history that is not canonical. */
  async function rogue(build: (s: CampaignStore, draw: CausalDrawAdapter) => Promise<void>) {
    const dir = tempDir();
    const s = await must(
      createFileCampaign(dir, {
        campaignId: FIXTURE_CAMPAIGN,
        owners: new Map([...CANONICAL_OWNER_REGISTRY, ...ACTOR_FIXTURE_EXTENSION.owners]),
      }),
    );
    for (const [n, id] of [`${A}-biography`, `${A}-occupation`].entries())
      await must(s.commit(historyGroup(FIXTURE_CAMPAIGN, n + 1, id)));
    const draw = new CausalDrawAdapter(s, {
      slotInspectors: new Map([["named_actor", namedActorSlotInspector(s)]]),
      ruleAuthority: namedActorRuleAuthority,
      entropy: seededEntropy(SEED_1),
    });
    await build(s, draw);
    await s.close();
    return dir;
  }
  const input = randomizedEstablishment(A, C, { prior });
  const refs = (s: CampaignStore) =>
    input.causes.map((c) => ({
      owner: c.owner,
      fact_key: c.fact_key,
      version: c.version,
      committed_by: s.getFact(c.fact_key)!.provenance.group_id,
    }));
  const put = (
    n: number,
    value: unknown,
    reads: { key: string; version: number }[],
    depends_on: string[],
  ) =>
    group(
      FIXTURE_CAMPAIGN,
      n,
      [write(basisKey, value as never, { owner: "named_actor", facet: "actor_profile" })],
      { owner: "named_actor", facet: "actor_profile", rule: NAMED_ACTOR_RULE, reads, depends_on },
    );
  const lawfulValue = (s: CampaignStore, over: any = {}) => ({
    actor_id: A,
    capability_id: C,
    marker: "A",
    materiality: input.materiality,
    establishment: {
      method: "BOUNDED_PRIOR_RANDOMIZED",
      causes: input.causes,
      draw: {
        draw_id: `cdraw:v1:${digest}`,
        result: {
          fact_key: causalDrawResultKey(digest),
          version: s.getFact(causalDrawResultKey(digest))!.version,
        },
      },
    },
    ...over,
  });
  const pins = (s: CampaignStore) => [
    ...input.causes.map((c) => ({ key: c.fact_key, version: c.version })),
    { key: causalDrawResultKey(digest), version: s.getFact(causalDrawResultKey(digest))!.version },
  ];
  const deps = (s: CampaignStore) => [
    ...input.causes.map((c) => s.getFact(c.fact_key)!.provenance.group_id),
    causalDrawResultGroupId(digest),
  ];
  const drawIt = async (s: CampaignStore, draw: CausalDrawAdapter, spec?: (x: any) => void) => {
    const specification: any = capabilityDrawSpecification(input, refs(s));
    spec?.(specification);
    await must(draw.draw({ specification, resolution: RESOLVER }));
  };

  it("control: a lawful randomized establishment built outside the owner's path opens", async () => {
    const dir = await rogue(async (s, draw) => {
      await drawIt(s, draw);
      await must(s.commit(put(10, lawfulValue(s), pins(s), deps(s))));
    });
    expect(await openOutcome(dir)).toBe("OK");
  });

  it("a marker that is not the owner's reading of the selected candidate, a missing read or dependency, and a foreign prior are each NAMED_ACTOR_STATE", async () => {
    const cases: Record<
      string,
      [RegExp, (s: CampaignStore, draw: CausalDrawAdapter) => Promise<void>]
    > = {
      "marker is not the selected candidate's": [
        /marker is exactly the owner's reading/,
        async (s, draw) => {
          await drawIt(s, draw);
          await must(s.commit(put(10, lawfulValue(s, { marker: "S" }), pins(s), deps(s))));
        },
      ],
      "the result is not read": [
        /read the exact Causal Draw result/,
        async (s, draw) => {
          await drawIt(s, draw);
          await must(s.commit(put(10, lawfulValue(s), pins(s).slice(0, -1), deps(s))));
        },
      ],
      "the result group is not depended on": [
        /read the exact Causal Draw result/,
        async (s, draw) => {
          await drawIt(s, draw);
          await must(s.commit(put(10, lawfulValue(s), pins(s), deps(s).slice(0, -1))));
        },
      ],
      "the prior's candidates are no lawful possibilities": [
        /lawful possibility/,
        async (s, draw) => {
          await drawIt(s, draw, (spec) => {
            spec.candidates = [
              { candidate_id: "stray-1", weight: "1" },
              { candidate_id: "stray-2", weight: "1" },
            ];
          });
          await must(s.commit(put(10, lawfulValue(s), pins(s), deps(s))));
        },
      ],
      "a deterministic basis over an existing precommit": [
        /over an existing Causal Draw/,
        async (s, draw) => {
          await drawIt(s, draw);
          await must(
            s.commit(
              put(
                10,
                capabilityBasis(A, C, {}, [`${A}-biography`, `${A}-occupation`]),
                input.causes.map((c) => ({ key: c.fact_key, version: c.version })),
                input.causes.map((c) => s.getFact(c.fact_key)!.provenance.group_id),
              ),
            ),
          );
        },
      ],
    };
    for (const [name, [message, build]] of Object.entries(cases)) {
      const outcome = await openOutcome(await rogue(build), true);
      expect(outcome, name).toMatch(/NAMED_ACTOR_STATE/);
      expect(outcome, name).toMatch(message);
    }
  });

  it("a deterministic basis committed BEFORE any draw is fine; a draw begun afterwards is refused by the draw layer and never sampled", async () => {
    const dir = await rogue(async (s, draw) => {
      await must(
        s.commit(
          put(
            10,
            capabilityBasis(A, C, {}, [`${A}-biography`, `${A}-occupation`]),
            input.causes.map((c) => ({ key: c.fact_key, version: c.version })),
            input.causes.map((c) => s.getFact(c.fact_key)!.provenance.group_id),
          ),
        ),
      );
      const r = await draw.draw({
        specification: capabilityDrawSpecification(input, refs(s)),
        resolution: RESOLVER,
      });
      expect(r.ok ? "" : r.error.code).toBe("DRAW_NOT_REQUIRED_ALREADY_ESTABLISHED");
    });
    expect(await openOutcome(dir)).toBe("OK");
    void historyKey;
  });
});
