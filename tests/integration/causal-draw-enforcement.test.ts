/* eslint-disable @typescript-eslint/no-explicit-any -- tests poke at arbitrary group and fact values */
// F-027-CD1 enforcement: owner exclusivity of the two key spaces, the create-only (SEALED) law, forged and tampered
// precommits/results through a RAW store.commit (the same rules hold without the adapter), and load-time integrity
// verification of malformed or non-rederivable Causal Draw evidence.
// Register lineage: IA-02, IA-03, IA-06, IA-30 (partial); RC-02, RC-09, RC-16; IM-03, IM-11, IM-12; F-027-CD1 CDP-01, CDO-01.
// Spec lock f027 + addendum F-027-CD1.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CANON_WRITE_AUTHORITY,
  CausalDrawPrecommitSchema,
  RESOLVER_AUTHORITY,
  causalDrawPrecommitGroupId,
  causalDrawPrecommitIntentId,
  causalDrawPrecommitKey,
  causalDrawResultGroupId,
  causalDrawResultIntentId,
  causalDrawResultKey,
  type CommitGroup,
} from "@immortalis/contracts";
import {
  CANONICAL_OWNER_REGISTRY,
  CAUSAL_DRAW_RULE,
  CanonicalCampaign,
  cdDigest,
  deriveResultRecord,
  preparePrior,
  storeBindings,
  verifyCausalDrawIntegrity,
  type CampaignStore,
} from "@immortalis/engine";
import {
  CAND_A,
  DRAW_FIXTURE_EXTENSION,
  SEED_1,
  SEED_2,
  SYNTH_DRAW_OWNER,
  drawInputKey,
  drawOwnerGroup,
  drawSlotKey,
  seededEntropy,
} from "@immortalis/testkit";
import {
  crashBefore,
  defaultSpecification,
  drawAdapter,
  isResultGroup,
  request,
  seededDrawCampaign,
  type DrawSeeded,
} from "../support/causal-draw.ts";
import { must } from "../support/temporal.ts";
import { tempDir } from "../support/tmp.ts";

const KERNEL = "causal_draw_kernel";
const FACET = "draw_provenance";
type Group = CommitGroup;

/** The exact group the adapter builds for a precommit, for forging variants of it by raw commit. */
function precommitOf(s: DrawSeeded, seed = SEED_1) {
  const prior = preparePrior(defaultSpecification(s));
  const d = prior.draw_key_digest;
  const record = {
    draw_id: prior.draw_id,
    draw_key: prior.normalized.draw_key,
    spec_digest: prior.spec_digest,
    normalized_spec: prior.normalized,
    entropy_hex: seed,
    entropy_source_class: "CSPRNG_256",
    algorithm_id: "IMMORTALIS_WEIGHTED_FINITE_V1",
  };
  const group: Group = {
    campaign_id: s.campaign.store.head().campaign_id,
    group_id: causalDrawPrecommitGroupId(d),
    intent_id: causalDrawPrecommitIntentId(d),
    owner: KERNEL,
    facet: FACET,
    cause: prior.draw_id,
    rule: CAUSAL_DRAW_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: s.inputs.map((f) => ({ key: f.key, version: f.version })),
    depends_on: [],
    writes: [
      {
        key: causalDrawPrecommitKey(d),
        owner: KERNEL,
        facet: FACET,
        value: record as never,
        unit: null,
        basis: "causal-draw-precommit",
        secrecy: "engine-internal",
        expected_version: 0,
      },
    ],
  };
  return { prior, d, record, group };
}
const patchValue = (g: Group, patch: Record<string, unknown>): Group => ({
  ...g,
  writes: [{ ...g.writes[0]!, value: { ...(g.writes[0]!.value as object), ...patch } as never }],
});
const patchWrite = (g: Group, patch: Record<string, unknown>): Group => ({
  ...g,
  writes: [{ ...g.writes[0]!, ...patch }],
});

/** A precommit-only campaign (the result commit crashed): the state a forged result must be judged against. */
async function precommitOnly(seed = SEED_1) {
  const s = await seededDrawCampaign(tempDir(), { entropy: seededEntropy(seed) });
  const crashed = drawAdapter(crashBefore(s.campaign.store, isResultGroup), s.entropy);
  await crashed.draw(request(defaultSpecification(s)));
  const { prior, d } = precommitOf(s);
  const pre = s.campaign.store.getFact(causalDrawPrecommitKey(d))!;
  const lawful = (deriveResultRecord(pre, d) as { ok: true; value: any }).value;
  const group: Group = {
    campaign_id: s.campaign.store.head().campaign_id,
    group_id: causalDrawResultGroupId(d),
    intent_id: causalDrawResultIntentId(d),
    owner: KERNEL,
    facet: FACET,
    cause: prior.draw_id,
    rule: CAUSAL_DRAW_RULE,
    authority: { ...CANON_WRITE_AUTHORITY },
    reads: [{ key: pre.key, version: pre.version }],
    depends_on: [pre.provenance.group_id],
    writes: [
      {
        key: causalDrawResultKey(d),
        owner: KERNEL,
        facet: FACET,
        value: lawful,
        unit: null,
        basis: "causal-draw-result",
        secrecy: "engine-internal",
        expected_version: 0,
      },
    ],
  };
  return { s, d, prior, pre, lawful, group };
}

const code = async (s: DrawSeeded, g: unknown) => {
  const r = await s.campaign.store.commit(g);
  return r.ok ? "OK" : r.error.code;
};

describe("owner exclusivity: the two key spaces belong to one infrastructure-only owner", () => {
  const D = "cd".repeat(32);
  const keys = [causalDrawPrecommitKey(D), causalDrawResultKey(D)];

  it("no other registered owner, extension owner or unregistered owner can write a Causal Draw key", async () => {
    const s = await seededDrawCampaign(tempDir());
    const registered = [...CANONICAL_OWNER_REGISTRY].flatMap(([owner, facets]) =>
      owner === KERNEL ? [] : [...facets].map((facet) => [owner, facet] as const),
    );
    for (const [owner, facet] of [
      ...registered,
      [SYNTH_DRAW_OWNER, "synthetic-draw-owner"] as const,
    ]) {
      for (const key of keys) {
        const g = drawOwnerGroup(key, "forged", { owner, facet } as never);
        g.writes[0] = { ...g.writes[0]!, owner, facet };
        expect(await code(s, g), `${owner}/${facet} → ${key}`).toBe("KEY_NOT_ADMITTED");
      }
    }
    const stranger = drawOwnerGroup(keys[0]!, "x", { owner: "nobody", facet: "nothing" } as never);
    stranger.writes[0] = { ...stranger.writes[0]!, owner: "nobody", facet: "nothing" };
    expect(await code(s, stranger)).toBe("OWNER_NOT_REGISTERED");
    expect(s.campaign.store.listFacts().some((f) => f.key.startsWith("causal-draw/"))).toBe(false);
    await s.campaign.close();
  });

  it("the Causal Draw owner can write NOTHING else: not a canonical, kernel, substantive or sibling key — there is no fallback owner", async () => {
    const s = await seededDrawCampaign(tempDir());
    for (const key of [
      "world/w1/profile",
      "temporal/state",
      "actor/a1/capability/c1",
      drawSlotKey("never-committed"),
      drawInputKey("never-committed"),
      `causal-draw/${D}/seed`,
      `causal-draw/${D}`,
      `causal-draw/${D.toUpperCase()}/result`,
      "causal-draw/short/precommit",
      `causal-draw/${D}/precommit/extra`,
      "draw/anything",
    ]) {
      const g = drawOwnerGroup(key, { any: "thing" });
      g.owner = KERNEL;
      g.facet = FACET;
      g.writes[0] = { ...g.writes[0]!, owner: KERNEL, facet: FACET };
      expect(await code(s, g), key).toBe("KEY_NOT_ADMITTED");
    }
    await s.campaign.close();
  });

  it("no extension can claim the Causal Draw owner's name or reach its key spaces", async () => {
    const reuse = storeBindings({ owners: new Map([[KERNEL, new Set(["anything"])]]) });
    expect(reuse.ok).toBe(false);
    expect(reuse.ok ? "" : reuse.error.code).toBe("EXTENSION_INVALID");
    const s = await seededDrawCampaign(tempDir());
    const probe = drawOwnerGroup(causalDrawResultKey("ef".repeat(32)), "x");
    expect(await code(s, probe)).toBe("KEY_NOT_ADMITTED");
    await s.campaign.close();
  });

  it("an owner/facet pair that is not registered cannot reach the key spaces either", async () => {
    const s = await seededDrawCampaign(tempDir());
    const { group } = precommitOf(s);
    const wrongFacet = {
      ...group,
      facet: "some_other_facet",
      writes: [{ ...group.writes[0]!, facet: "some_other_facet" }],
    };
    expect(await code(s, wrongFacet)).toBe("OWNER_NOT_REGISTERED");
    await s.campaign.close();
  });
});

describe("a well-formed precommit is lawful by raw commit; every forgery of it is refused", () => {
  it("accepts exactly what the adapter would publish (baseline), and the adapter then resumes from THAT seed", async () => {
    const s = await seededDrawCampaign(tempDir(), { entropy: seededEntropy(SEED_2) });
    const { group, d } = precommitOf(s, SEED_1);
    expect(await code(s, group)).toBe("OK");
    const out = await must(s.adapter.draw(request(defaultSpecification(s))));
    expect(out.disposition).toBe("RESUMED_PRECOMMIT");
    expect(s.entropy.calls()).toBe(0);
    const stored = CausalDrawPrecommitSchema.parse(
      s.campaign.store.getFact(causalDrawPrecommitKey(d))!.value,
    );
    expect(stored.entropy_hex).toBe(SEED_1);
    await s.campaign.close();
  });

  it("refuses every malformed or non-rederivable precommit value", async () => {
    const s = await seededDrawCampaign(tempDir());
    const { group, record, prior } = precommitOf(s);
    const norm = record.normalized_spec;
    const forgeries: Record<string, [Group, string]> = {
      "draw_id of another draw": [
        patchValue(group, { draw_id: `cdraw:v1:${"ab".repeat(32)}` }),
        "VALUE_INVALID",
      ],
      "draw_id is not a draw id": [patchValue(group, { draw_id: "x" }), "VALUE_INVALID"],
      "candidates not in canonical order": [
        patchValue(group, {
          normalized_spec: { ...norm, candidates: [...norm.candidates].reverse() },
        }),
        "VALUE_INVALID",
      ],
      "weights not gcd-reduced": [
        patchValue(group, {
          normalized_spec: {
            ...norm,
            candidates: norm.candidates.map((c) => ({
              ...c,
              weight: String(Number(c.weight) * 2),
            })),
          },
        }),
        "VALUE_INVALID",
      ],
      "input_refs not in canonical order": [
        patchValue(group, {
          normalized_spec: { ...norm, input_refs: [...norm.input_refs].reverse() },
        }),
        "VALUE_INVALID",
      ],
      "singleton candidate set": [
        patchValue(group, { normalized_spec: { ...norm, candidates: [norm.candidates[0]] } }),
        "VALUE_INVALID",
      ],
      "duplicate candidate ids": [
        patchValue(group, {
          normalized_spec: { ...norm, candidates: [norm.candidates[0], norm.candidates[0]] },
        }),
        "VALUE_INVALID",
      ],
      "spec_digest is not the digest of the specification": [
        patchValue(group, { spec_digest: "0".repeat(64) }),
        "VALUE_INVALID",
      ],
      "spec carries a different draw key": [
        patchValue(group, {
          normalized_spec: { ...norm, draw_key: { ...norm.draw_key, opportunity_id: "other" } },
        }),
        "VALUE_INVALID",
      ],
      "seed shorter than 32 bytes": [
        patchValue(group, { entropy_hex: "00".repeat(31) }),
        "VALUE_INVALID",
      ],
      "seed in uppercase": [patchValue(group, { entropy_hex: "AB".repeat(32) }), "VALUE_INVALID"],
      "seed not hexadecimal": [
        patchValue(group, { entropy_hex: "zz".repeat(32) }),
        "VALUE_INVALID",
      ],
      "entropy class is not CSPRNG_256": [
        patchValue(group, { entropy_source_class: "PRNG" }),
        "VALUE_INVALID",
      ],
      "another algorithm": [patchValue(group, { algorithm_id: "OTHER_V2" }), "VALUE_INVALID"],
      "an unmodelled field (a probability)": [
        patchValue(group, { probability: 0.5 }),
        "VALUE_INVALID",
      ],
      "an unmodelled field (a grade)": [patchValue(group, { grade: "S" }), "VALUE_INVALID"],
    };
    for (const [name, [g, expected]] of Object.entries(forgeries)) {
      expect(await code(s, g), name).toBe(expected);
    }
    // identity of the key: the draw key must hash to the digest in the key
    const other = preparePrior({
      ...defaultSpecification(s),
      draw_key: { ...defaultSpecification(s).draw_key, opportunity_id: "elsewhere" },
    });
    const crossed = patchWrite(patchValue(group, { draw_id: other.draw_id }), {
      key: causalDrawPrecommitKey(other.draw_key_digest),
    });
    expect(await code(s, crossed)).toBe("REFERENCE_INVALID");
    expect(prior.draw_id).not.toBe(other.draw_id);
    expect(s.campaign.store.listFacts().some((f) => f.key.startsWith("causal-draw/"))).toBe(false);
    await s.campaign.close();
  });

  it("refuses every wrong group identity, cause, governing rule, authority, shape and lifecycle", async () => {
    const s = await seededDrawCampaign(tempDir());
    const { group, d } = precommitOf(s);
    const forgeries: Record<string, [unknown, string]> = {
      "another group id": [{ ...group, group_id: "some-group" }, "REFERENCE_INVALID"],
      "another intent id": [{ ...group, intent_id: "some-intent" }, "REFERENCE_INVALID"],
      "group id of the RESULT": [
        { ...group, group_id: causalDrawResultGroupId(d) },
        "REFERENCE_INVALID",
      ],
      "cause is not the draw id": [{ ...group, cause: "cause-1" }, "REFERENCE_INVALID"],
      "another governing rule": [
        { ...group, rule: { ...CAUSAL_DRAW_RULE, native_pin: "2026-10-02T15:11:03.451Z" } },
        "REFERENCE_INVALID",
      ],
      "a rule that supersedes": [
        { ...group, rule: { ...CAUSAL_DRAW_RULE, supersedes: "F-027" } },
        "REFERENCE_INVALID",
      ],
      "resolver authority instead of the archivist path": [
        { ...group, authority: { ...RESOLVER_AUTHORITY } },
        "AUTHORITY_DENIED",
      ],
      // no such key exists yet, so an "update" fails the expected-version chain before sealing is reached
      "an update of a key that does not exist": [
        patchWrite(group, { expected_version: 1 }),
        "VERSION_CONFLICT",
      ],
      "two writes in one group": [
        {
          ...group,
          writes: [group.writes[0]!, { ...group.writes[0]!, key: causalDrawResultKey(d) }],
        },
        "VALUE_INVALID",
      ],
      "no input pinned": [{ ...group, reads: [] }, "REFERENCE_INVALID"],
      "one input unpinned": [{ ...group, reads: [group.reads[0]!] }, "REFERENCE_INVALID"],
      "an extra, undeclared read": [
        { ...group, reads: [...group.reads, { key: causalDrawResultKey(d), version: 0 }] },
        "REFERENCE_INVALID",
      ],
      "an input pinned at a version that is not current": [
        { ...group, reads: [{ key: group.reads[0]!.key, version: 2 }, group.reads[1]!] },
        "STALE_READ",
      ],
    };
    for (const [name, [g, expected]] of Object.entries(forgeries)) {
      expect(await code(s, g), name).toBe(expected);
    }
    await s.campaign.close();
  });

  it("refuses an input ref that does not name the committed fact: its owner or its committing group", async () => {
    const s = await seededDrawCampaign(tempDir());
    const spec = defaultSpecification(s);
    for (const [name, mutate] of Object.entries({
      "wrong committing group": (r: any) => ({ ...r, committed_by: "not-the-group" }),
      "wrong owner": (r: any) => ({ ...r, owner: "someone-else" }),
    })) {
      const forged = {
        ...spec,
        input_refs: [mutate(spec.input_refs[0]), ...spec.input_refs.slice(1)],
      };
      const prior = preparePrior(forged);
      const { group, record } = precommitOf(s);
      const g = patchWrite(
        patchValue(group, {
          draw_id: prior.draw_id,
          draw_key: prior.normalized.draw_key,
          spec_digest: prior.spec_digest,
          normalized_spec: prior.normalized,
        }),
        {},
      );
      void record;
      expect(await code(s, g), name).toBe("REFERENCE_INVALID");
    }
    await s.campaign.close();
  });
});

describe("a result is exactly what CDA-01 derives from its committed precommit, and nothing else", () => {
  it("without a committed precommit no result can be conjured (a prerequisite is never created)", async () => {
    const s = await seededDrawCampaign(tempDir());
    const d = preparePrior(defaultSpecification(s)).draw_key_digest;
    const { s: other, group } = await precommitOnly();
    await other.campaign.close();
    const orphan = {
      ...group,
      reads: [{ key: causalDrawPrecommitKey(d), version: 0 }],
      depends_on: [],
    };
    expect(await code(s, orphan)).toBe("PREREQUISITE_MISSING");
    await s.campaign.close();
  });

  it("refuses a wrong selection, sample, rejection count, total weight, or precommit pin", async () => {
    const { s, group, lawful } = await precommitOnly();
    const other = lawful.selected_candidate_id === CAND_A ? "synthetic-candidate-b" : CAND_A;
    const forgeries: Record<string, Record<string, unknown>> = {
      "another candidate selected": { selected_candidate_id: other },
      "a candidate that is not in the prior": { selected_candidate_id: "synthetic-candidate-zzz" },
      "another accepted sample": {
        accepted_sample: String((Number(lawful.accepted_sample) + 1) % 6),
      },
      "another rejection count": {
        rejected_attempts: String(Number(lawful.rejected_attempts) + 1),
      },
      "another total weight": { total_weight: "7" },
      "another spec digest": { spec_digest: "0".repeat(64) },
      "another precommit version": { precommit_version: 2 },
      "another precommit key": { precommit_key: causalDrawPrecommitKey("00".repeat(32)) },
      "another precommit committer": { precommit_committed_by: "some-group" },
      "another algorithm": { algorithm_id: "OTHER_V2" },
      "an unmodelled field (a world effect)": { world_effect: "x" },
    };
    for (const [name, patch] of Object.entries(forgeries)) {
      expect(await code(s, patchValue(group, patch)), name).toBe("VALUE_INVALID");
    }
    expect(s.campaign.store.getFact(group.writes[0]!.key)).toBeUndefined();
    await s.campaign.close();
  });

  it("refuses a result group that does not read, depend on, or exclusively read its precommit, or carries the wrong identities", async () => {
    const { s, d, group, pre } = await precommitOnly();
    const forgeries: Record<string, [unknown, string]> = {
      "no read of the precommit": [{ ...group, reads: [] }, "REFERENCE_INVALID"],
      "no dependency on the precommit group": [{ ...group, depends_on: [] }, "REFERENCE_INVALID"],
      "an extra read": [
        { ...group, reads: [...group.reads, { key: s.inputs[0]!.key, version: 1 }] },
        "REFERENCE_INVALID",
      ],
      "precommit read at a stale version": [
        { ...group, reads: [{ key: pre.key, version: 0 }] },
        "STALE_READ",
      ],
      "another group id": [{ ...group, group_id: "g" }, "REFERENCE_INVALID"],
      "another intent id": [{ ...group, intent_id: "i" }, "REFERENCE_INVALID"],
      "cause is not the draw id": [{ ...group, cause: "c" }, "REFERENCE_INVALID"],
      "another governing rule": [
        { ...group, rule: { ...CAUSAL_DRAW_RULE, clause: "elsewhere" } },
        "REFERENCE_INVALID",
      ],
      "resolver authority instead of the archivist path": [
        { ...group, authority: { ...RESOLVER_AUTHORITY } },
        "AUTHORITY_DENIED",
      ],
      "the precommit's group id used as the result's": [
        { ...group, group_id: causalDrawPrecommitGroupId(d) },
        "GROUP_ID_CONFLICT",
      ],
    };
    for (const [name, [g, expected]] of Object.entries(forgeries)) {
      expect(await code(s, g), name).toBe(expected);
    }
    // the unforged group is lawful
    expect(await code(s, group)).toBe("OK");
    await s.campaign.close();
  });

  it("a result for a precommit whose seed was replaced cannot be committed: the seed IS the derivation", async () => {
    const { s, d, group } = await precommitOnly(SEED_1);
    // a different seed would select differently for SOME candidate set; assert through the derivation itself
    const pre = s.campaign.store.getFact(causalDrawPrecommitKey(d))!;
    const swapped = { ...pre, value: { ...(pre.value as object), entropy_hex: SEED_2 } };
    const alt = (deriveResultRecord(swapped as never, d) as { ok: true; value: any }).value;
    // pick a pair that differs in sample, if the two seeds happen to coincide on this fixture the check is vacuous
    if (alt.accepted_sample !== (group.writes[0]!.value as any).accepted_sample) {
      expect(await code(s, patchValue(group, alt))).toBe("VALUE_INVALID");
    }
    await s.campaign.close();
  });
});

describe("SEALED / create-only: no update, replacement or deletion after commitment", () => {
  it("a committed precommit and result cannot be re-created, overwritten or replaced, even by the owner with the same content", async () => {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(s.adapter.draw(request(defaultSpecification(s))));
    const d = out.draw_key_digest;
    const pre = s.campaign.store.getFact(out.precommit.key)!;
    const res = s.campaign.store.getFact(out.result.key)!;
    const base = (key: string, value: unknown, over: Record<string, unknown>): Group => ({
      campaign_id: s.campaign.store.head().campaign_id,
      group_id: `forged-${key}-${JSON.stringify(over)}`,
      intent_id: `forged-intent-${key}-${JSON.stringify(over)}`,
      owner: KERNEL,
      facet: FACET,
      cause: out.draw_id,
      rule: CAUSAL_DRAW_RULE,
      authority: { ...CANON_WRITE_AUTHORITY },
      reads: [],
      depends_on: [],
      writes: [
        {
          key,
          owner: KERNEL,
          facet: FACET,
          value: value as never,
          unit: null,
          basis: "causal-draw-precommit",
          secrecy: "engine-internal",
          expected_version: 0,
          ...over,
        },
      ],
    });
    for (const f of [pre, res]) {
      // create again: the key already exists
      const again = await code(s, base(f.key, f.value, {}));
      expect(["VERSION_CONFLICT", "REFERENCE_INVALID", "VALUE_INVALID"], again).toContain(again);
      expect(again).not.toBe("OK");
      // update at the current version: sealed
      expect(await code(s, base(f.key, f.value, { expected_version: 1 }))).toBe(
        "AMENDMENT_NOT_SUPPORTED",
      );
      expect(s.campaign.store.getFact(f.key)!.version).toBe(1);
    }
    // re-presenting the SAME committed groups is idempotent replay, never a second write
    const replayed = await s.campaign.store.commit(
      s.campaign.store.committedGroup(causalDrawResultIntentId(d)),
    );
    expect(replayed.ok && replayed.value.replayed).toBe(true);
    // a precommit with another seed under the committed intent is a conflict, never a second seed
    const second = precommitOf(s, SEED_2).group;
    expect(await code(s, second)).toBe("INTENT_CONFLICT");
    expect(
      CausalDrawPrecommitSchema.parse(s.campaign.store.getFact(out.precommit.key)!.value)
        .entropy_hex,
    ).toBe(SEED_1);
    await s.campaign.close();
  });
});

describe("load-time integrity: malformed or non-rederivable Causal Draw evidence is detected", () => {
  /** A store view whose committed facts have been altered; receipts and journal groups still come from the real one. */
  const viewOf = (real: CampaignStore, over: Partial<CampaignStore>): CampaignStore => ({
    descriptor: real.descriptor,
    head: () => real.head(),
    getFact: (k) => real.getFact(k),
    listFacts: () => real.listFacts(),
    lookupReceipt: (i) => real.lookupReceipt(i),
    committedGroup: (i) => real.committedGroup(i),
    commit: (g) => real.commit(g),
    close: () => real.close(),
    ...over,
  });
  const viewWith = (real: CampaignStore, alter: (facts: any[]) => any[]): CampaignStore =>
    viewOf(real, { listFacts: () => alter(structuredClone(real.listFacts() as any[])) });
  async function completed() {
    const s = await seededDrawCampaign(tempDir());
    const out = await must(s.adapter.draw(request(defaultSpecification(s))));
    return { s, out };
  }
  const messages = (store: CampaignStore) => verifyCausalDrawIntegrity(store).map((v) => v.message);

  it("a clean campaign, and a precommit that simply has no result yet (an interrupted draw), have no violation", async () => {
    const { s } = await completed();
    expect(verifyCausalDrawIntegrity(s.campaign.store)).toEqual([]);
    const { s: p } = await precommitOnly();
    expect(verifyCausalDrawIntegrity(p.campaign.store)).toEqual([]);
    expect(p.campaign.verify()).toEqual([]);
    await s.campaign.close();
    await p.campaign.close();
  });

  it("detects a result that is not what CDA-01 derives from its committed seed (a different selection, sample or count)", async () => {
    const { s, out } = await completed();
    for (const patch of [
      { selected_candidate_id: "synthetic-candidate-zzz" },
      { accepted_sample: "5" },
      { rejected_attempts: "9" },
      { total_weight: "8" },
    ]) {
      const view = viewWith(s.campaign.store, (facts) =>
        facts.map((f) =>
          f.key === out.result.key ? { ...f, value: { ...f.value, ...patch } } : f,
        ),
      );
      const found = messages(view);
      expect(
        found.some((m) => /derives|CDA-01/.test(m)),
        JSON.stringify(patch),
      ).toBe(true);
    }
    await s.campaign.close();
  });

  it("detects a replaced seed: the committed result no longer re-derives from the precommit", async () => {
    const { s, out } = await completed();
    let detected = 0;
    for (const seed of [SEED_2, "ff".repeat(32), "7f".repeat(32), "01".repeat(32)]) {
      const view = viewWith(s.campaign.store, (facts) =>
        facts.map((f) =>
          f.key === out.precommit.key ? { ...f, value: { ...f.value, entropy_hex: seed } } : f,
        ),
      );
      if (messages(view).some((m) => /CDA-01/.test(m))) detected++;
    }
    // a replaced seed re-derives to the same sample only by coincidence; at least one replacement must be caught
    expect(detected).toBeGreaterThan(0);
    await s.campaign.close();
  });

  it("detects a result with no precommit, a precommit whose record is inconsistent, and a tampered normalized specification", async () => {
    const { s, out } = await completed();
    const noPrecommit = viewWith(s.campaign.store, (facts) =>
      facts.filter((f) => f.key !== out.precommit.key),
    );
    expect(messages(noPrecommit)).toContain("a result has no committed precommit");

    const badDigest = viewWith(s.campaign.store, (facts) =>
      facts.map((f) =>
        f.key === out.precommit.key
          ? { ...f, value: { ...f.value, spec_digest: "0".repeat(64) } }
          : f,
      ),
    );
    expect(messages(badDigest).some((m) => /digest/.test(m))).toBe(true);

    const tamperedSpec = viewWith(s.campaign.store, (facts) =>
      facts.map((f) => {
        if (f.key !== out.precommit.key) return f;
        const spec = f.value.normalized_spec;
        return {
          ...f,
          value: {
            ...f.value,
            normalized_spec: {
              ...spec,
              candidates: spec.candidates.map((c: any) => ({ ...c, weight: "9" })),
            },
          },
        };
      }),
    );
    expect(messages(tamperedSpec).length).toBeGreaterThan(0);

    const wrongKeyDigest = viewWith(s.campaign.store, (facts) =>
      facts.map((f) =>
        f.key === out.precommit.key
          ? {
              ...f,
              value: {
                ...f.value,
                draw_key: { ...f.value.draw_key, opportunity_id: "another" },
                normalized_spec: {
                  ...f.value.normalized_spec,
                  draw_key: { ...f.value.draw_key, opportunity_id: "another" },
                },
              },
            }
          : f,
      ),
    );
    expect(messages(wrongKeyDigest).some((m) => /digest/.test(m))).toBe(true);
    await s.campaign.close();
  });

  it("detects a record committed under the wrong identities, rule or a missing journal group, and an input fact that is gone or behind its pin", async () => {
    const { s, out } = await completed();
    const wrongGroup: CampaignStore = viewOf(s.campaign.store, {
      committedGroup: (intent) => {
        const g = s.campaign.store.committedGroup(intent);
        return g && g.group_id.startsWith("cdraw:precommit")
          ? {
              ...g,
              group_id: "forged-group",
              cause: "forged-cause",
              rule: { ...g.rule, clause: "x" },
            }
          : g;
      },
    });
    const found = messages(wrongGroup);
    expect(found.some((m) => /RC-16 identities/.test(m))).toBe(true);
    expect(found.some((m) => /cause/.test(m))).toBe(true);
    expect(found.some((m) => /SourceRef/.test(m))).toBe(true);

    const noJournal: CampaignStore = viewOf(s.campaign.store, { committedGroup: () => null });
    expect(messages(noJournal).some((m) => /journal/.test(m))).toBe(true);

    const missingInput = viewWith(s.campaign.store, (facts) =>
      facts.filter((f) => f.key !== drawInputKey("i1")),
    );
    expect(messages(missingInput).some((m) => /input fact/.test(m))).toBe(true);

    const unpinned: CampaignStore = viewOf(s.campaign.store, {
      committedGroup: (intent) => {
        const g = s.campaign.store.committedGroup(intent);
        return g && g.group_id.startsWith("cdraw:precommit") ? { ...g, reads: [] } : g;
      },
    });
    expect(messages(unpinned).some((m) => /pin exactly/.test(m))).toBe(true);

    const unrelatedResultGroup: CampaignStore = viewOf(s.campaign.store, {
      committedGroup: (intent) => {
        const g = s.campaign.store.committedGroup(intent);
        return g && g.group_id.startsWith("cdraw:result") ? { ...g, reads: [], depends_on: [] } : g;
      },
    });
    const r = messages(unrelatedResultGroup);
    expect(r.some((m) => /reads exactly its precommit/.test(m))).toBe(true);
    expect(r.some((m) => /depends on the precommit group/.test(m))).toBe(true);
    void out;
    await s.campaign.close();
  });

  describe("the saved package", () => {
    const stateFile = (d: string) => readdirSync(d).find((f) => f.startsWith("state."))!;
    async function saved() {
      const dir = tempDir();
      const s = await seededDrawCampaign(dir);
      const out = await must(s.adapter.draw(request(defaultSpecification(s))));
      await s.campaign.close();
      return { dir, out };
    }
    const openOutcome = async (dir: string) => {
      const r = await CanonicalCampaign.open(dir, { extension: DRAW_FIXTURE_EXTENSION });
      if (r.ok) {
        await r.value.close();
        return "OK";
      }
      return r.error.code === "CANON_INTEGRITY"
        ? (r.error.details?.["violations"] as { code: string }[]).map((v) => v.code).join(",")
        : r.error.code;
    };

    it("a valid saved campaign opens", async () => {
      expect(await openOutcome((await saved()).dir)).toBe("OK");
    });

    it("an edit of the saved evidence — selection, seed, specification, owner, facet, version, provenance, key — is not silently accepted", async () => {
      const edits: Record<string, (facts: any[], out: any) => void> = {
        "selected candidate": (facts, out) =>
          (facts.find((f) => f.key === out.result.key).value.selected_candidate_id = "elsewhere"),
        "accepted sample": (facts, out) =>
          (facts.find((f) => f.key === out.result.key).value.accepted_sample = String(
            (Number(facts.find((f) => f.key === out.result.key).value.accepted_sample) + 1) % 6,
          )),
        seed: (facts, out) =>
          (facts.find((f) => f.key === out.precommit.key).value.entropy_hex = "11".repeat(32)),
        "spec weights": (facts, out) =>
          (facts.find(
            (f) => f.key === out.precommit.key,
          ).value.normalized_spec.candidates[0].weight = "7"),
        "result owner": (facts, out) =>
          (facts.find((f) => f.key === out.result.key).owner = "world_state"),
        "precommit facet": (facts, out) =>
          (facts.find((f) => f.key === out.precommit.key).facet = "other"),
        "result version": (facts, out) => (facts.find((f) => f.key === out.result.key).version = 2),
        "provenance rule": (facts, out) =>
          (facts.find((f) => f.key === out.result.key).provenance.rule.clause = "elsewhere"),
        "provenance group": (facts, out) =>
          (facts.find((f) => f.key === out.precommit.key).provenance.group_id = "raw-group"),
        "secrecy class": (facts, out) =>
          (facts.find((f) => f.key === out.precommit.key).secrecy = "public"),
      };
      for (const [name, edit] of Object.entries(edits)) {
        const { dir, out } = await saved();
        const p = join(dir, stateFile(dir));
        const j = JSON.parse(readFileSync(p, "utf8"));
        edit(j.facts, out);
        writeFileSync(p, JSON.stringify(j));
        expect(await openOutcome(dir), name).not.toBe("OK");
      }
    });
  });

  it("hash agreement: the digests recorded in the evidence are reproducible from the committed values alone", async () => {
    const { s, out } = await completed();
    const pre = CausalDrawPrecommitSchema.parse(s.campaign.store.getFact(out.precommit.key)!.value);
    expect(cdDigest(pre.draw_key)).toBe(out.draw_key_digest);
    expect(cdDigest(pre.normalized_spec)).toBe(pre.spec_digest);
    await s.campaign.close();
  });
});
